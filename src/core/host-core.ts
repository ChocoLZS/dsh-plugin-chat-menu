/**
 * Shared host listing core — the SINGLE source for both the bundle form
 * (webServer route in src/host/bundle.ts) and the dynamic form
 * (harness.handle in src/host/dynamic.ts). Pure logic over injected
 * services; no harness imports, so scripts/build.mjs can bundle it into
 * either artifact unchanged.
 */

/** Minimal filesystem-service face (leaf fields the listing needs). */
export interface FsEntry {
  name: string
  type: 'file' | 'directory' | 'other'
  target: { targetKey: string; displayPath: string }
}

/** Minimal filesystem-service face. */
export interface FsLike {
  resolve(path: string, opts?: { cwd?: string }): Promise<{ targetKey: string; displayPath: string }>
  listDir(target: unknown): Promise<FsEntry[]>
}

/** Minimal session-store face. */
export interface SessionsLike {
  get(id: string): { header?: { cwd?: string } } | undefined
}

/** The host context surface both wrappers rely on. */
export interface Ctx {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): unknown
  fs: FsLike
  sessions: SessionsLike
  webServer: {
    register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }): () => void
  }
}

const MAX_DIRECT = 50
const MAX_DEEP = 30
const MAX_DEPTH = 5
const MAX_DIRS = 50
const MAX_SCAN = 1000

const isDir = (entry: FsEntry): boolean => entry.type === 'directory'
const isFile = (entry: FsEntry): boolean => entry.type === 'file'
const matches = (name: string, filter: string): boolean =>
  filter === '' || name.toLowerCase().includes(filter.toLowerCase())
const byName = (a: FsEntry, b: FsEntry): number =>
  (isDir(b) ? 1 : 0) - (isDir(a) ? 1 : 0) || a.name.localeCompare(b.name)
const visible = (entry: FsEntry, filter: string): boolean =>
  entry.name.startsWith('.') ? filter.startsWith('.') : true

/** List one directory level; null on failure (e.g. permission or IO). */
async function listDir(fs: FsLike, target: unknown): Promise<FsEntry[] | null> {
  try {
    const entries = await fs.listDir(target)
    return entries.filter((entry) => isDir(entry) || isFile(entry)).sort(byName)
  } catch {
    return null
  }
}

/** Walk path segments from the root, descending into real directories (exact, then case-insensitive). */
async function walk(
  fs: FsLike,
  rootTarget: unknown,
  segments: string[],
): Promise<{ dir: unknown; rel: string }> {
  let dir = rootTarget
  let rel = ''
  for (const segment of segments) {
    const entries = await listDir(fs, dir)
    if (entries === null) break
    let child: FsEntry | undefined
    for (const entry of entries) {
      if (!isDir(entry)) continue
      if (entry.name === segment) { child = entry; break }
    }
    if (child === undefined) {
      for (const entry of entries) {
        if (!isDir(entry)) continue
        if (entry.name.toLowerCase() === segment.toLowerCase()) { child = entry; break }
      }
    }
    if (child === undefined) break
    dir = child.target
    rel = rel === '' ? child.name : rel + '/' + child.name
  }
  return { dir, rel }
}

/** Budget-bounded BFS recursive search (depth, dir count, scanned-entry count caps). */
async function deepSearch(
  fs: FsLike,
  dir: unknown,
  relBase: string,
  filter: string,
  out: Array<{ name: string; relPath: string; type: string }>,
): Promise<void> {
  const queue: Array<{ target: unknown; rel: string; depth: number }> = [{ target: dir, rel: relBase, depth: 0 }]
  let scanned = 0
  let dirs = 0
  while (queue.length > 0 && scanned < MAX_SCAN && dirs < MAX_DIRS && out.length < MAX_DEEP) {
    const node = queue.shift()!
    const entries = await listDir(fs, node.target)
    if (entries === null) continue
    for (const entry of entries) {
      if (out.length >= MAX_DEEP || scanned >= MAX_SCAN) break
      scanned++
      if (!visible(entry, filter)) continue
      const relPath = node.rel === '' ? entry.name : node.rel + '/' + entry.name
      if (matches(entry.name, filter)) out.push({ name: entry.name, relPath, type: entry.type })
      if (isDir(entry) && node.depth < MAX_DEPTH && dirs < MAX_DIRS) {
        dirs++
        queue.push({ target: entry.target, rel: relPath, depth: node.depth + 1 })
      }
    }
  }
}

/**
 * Resolve a session's working directory and list its entries.
 * @returns the JSON listing { root, dir, direct, deep } or an { error } payload.
 */
export async function list(
  ctx: Ctx,
  sessionId: string,
  rawPath: string,
  filter: string,
): Promise<unknown> {
  const session = sessionId === '' ? undefined : ctx.sessions.get(sessionId)
  let root = session !== undefined && session.header !== undefined && typeof session.header.cwd === 'string'
    ? session.header.cwd
    : undefined
  const policy = ctx.get('sandboxPolicy') as { workspaceRoot?: string } | undefined
  if (root === undefined && policy !== undefined && typeof policy.workspaceRoot === 'string') root = policy.workspaceRoot
  if (root === undefined) return { error: 'no-workspace' }
  const rootTarget = await ctx.fs.resolve(root)
  const segments = rawPath.split('/').filter((segment) => segment !== '' && segment !== '.')
  const { dir, rel } = await walk(ctx.fs, rootTarget, segments)
  const entries = await listDir(ctx.fs, dir)
  if (entries === null) return { error: 'list-failed', dir: rel }
  const direct: Array<{ name: string; relPath: string; type: string }> = []
  for (const entry of entries) {
    if (!visible(entry, filter)) continue
    if (!matches(entry.name, filter)) continue
    direct.push({ name: entry.name, relPath: rel === '' ? entry.name : rel + '/' + entry.name, type: entry.type })
    if (direct.length >= MAX_DIRECT) break
  }
  const deep: Array<{ name: string; relPath: string; type: string }> = []
  if (filter !== '' && direct.length < 20 && (filter.length >= 2 || direct.length === 0)) {
    await deepSearch(ctx.fs, dir, rel, filter, deep)
  }
  return { root, dir: rel, direct, deep }
}

/** Browser-trust fence for the HTTP route: loopback host, non-cross-site fetch, origin host matches. */
export function isTrustedRequest(req: { headers: Record<string, string | string[] | undefined>; url?: string }): boolean {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string') {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
