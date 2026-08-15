/**
 * dsh-plugin-chat-menu host half: the /chat-menu/list JSON route.
 *
 * Session-scoped read-only directory listing: the client passes the current
 * session id plus a relative path and a name filter; the session's
 * authoritative cwd anchors the tree, so the menu always browses the
 * conversation's working directory. The route answers only loopback /
 * same-origin requests (the browser-trust fence for this read-only API).
 */

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-plugin-chat-menu'

/** Services required before mounting: the webserver route registry, the session store, and the filesystem provider. */
export const inject = ['webServer', 'sessions', 'fs']

const MAX_DIRECT = 50
const MAX_DEEP = 30
const MAX_DEPTH = 5
const MAX_DIRS = 50
const MAX_SCAN = 1000

const isDir = (entry) => entry.type === 'directory'
const isFile = (entry) => entry.type === 'file'
const matches = (name, filter) => filter === '' || name.toLowerCase().includes(filter.toLowerCase())
const byName = (a, b) => (isDir(b) ? 1 : 0) - (isDir(a) ? 1 : 0) || a.name.localeCompare(b.name)
const visible = (entry, filter) => (entry.name.startsWith('.') ? filter.startsWith('.') : true)

/** List one directory level; null on failure (e.g. permission or IO). */
async function listDir(fs, target) {
  try {
    const entries = await fs.listDir(target)
    return entries.filter((entry) => isDir(entry) || isFile(entry)).sort(byName)
  } catch {
    return null
  }
}

/** Walk path segments from the root, descending into real directories (exact, then case-insensitive). */
async function walk(fs, rootTarget, segments) {
  let dir = rootTarget
  let rel = ''
  for (const segment of segments) {
    const entries = await listDir(fs, dir)
    if (entries === null) break
    let child
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
async function deepSearch(fs, dir, relBase, filter, out) {
  const queue = [{ target: dir, rel: relBase, depth: 0 }]
  let scanned = 0
  let dirs = 0
  while (queue.length > 0 && scanned < MAX_SCAN && dirs < MAX_DIRS && out.length < MAX_DEEP) {
    const node = queue.shift()
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

/** Browser-trust fence: loopback host, non-cross-site fetch, origin host matches. */
function isTrusted(req) {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/**
 * Resolve a session's working directory and list its entries.
 * @returns the JSON listing: { root, dir, direct, deep } or an { error } payload.
 */
async function list(sessions, fs, policy, sessionId, rawPath, filter) {
  const session = sessionId === '' ? undefined : sessions.get(sessionId)
  let root = session !== undefined && session.header !== undefined && typeof session.header.cwd === 'string'
    ? session.header.cwd
    : undefined
  if (root === undefined && policy !== undefined && typeof policy.workspaceRoot === 'string') root = policy.workspaceRoot
  if (root === undefined) return { error: 'no-workspace' }
  const rootTarget = await fs.resolve(root)
  const segments = rawPath.split('/').filter((segment) => segment !== '' && segment !== '.')
  const { dir, rel } = await walk(fs, rootTarget, segments)
  const entries = await listDir(fs, dir)
  if (entries === null) return { error: 'list-failed', dir: rel }
  const direct = []
  for (const entry of entries) {
    if (!visible(entry, filter)) continue
    if (!matches(entry.name, filter)) continue
    direct.push({ name: entry.name, relPath: rel === '' ? entry.name : rel + '/' + entry.name, type: entry.type })
    if (direct.length >= MAX_DIRECT) break
  }
  const deep = []
  if (filter !== '' && direct.length < 20 && (filter.length >= 2 || direct.length === 0)) {
    await deepSearch(fs, dir, rel, filter, deep)
  }
  return { root, dir: rel, direct, deep }
}

/** Mount the /chat-menu/list route (a fiber effect, removed on plugin stop). */
export function apply(ctx) {
  const fs = ctx.fs
  const sessions = ctx.sessions
  const policy = ctx.get('sandboxPolicy')

  const writeJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/chat-menu/list',
    handler: async (req, res) => {
      if (!isTrusted(req)) {
        writeJson(res, 403, { error: 'forbidden' })
        return
      }
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const path = url.searchParams.get('path') ?? ''
        const filter = url.searchParams.get('filter') ?? ''
        writeJson(res, 200, await list(sessions, fs, policy, sessionId, path, filter))
      } catch (error) {
        writeJson(res, 500, { error: 'list-failed', message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'chat-menu: /chat-menu/list route')
}
