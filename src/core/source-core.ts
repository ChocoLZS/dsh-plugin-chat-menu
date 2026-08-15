/**
 * Shared @-file source core — the SINGLE source for both the bundle form
 * (module-loader factory in scripts/build.mjs) and the dynamic form
 * (function body). Registers an '@' trigger source into the built-in
 * inputTriggers pipeline: the built-in MenuView renders the candidates and
 * provides native keyboard arbitration (↑↓ / Enter / Esc), search-as-you-type
 * via candidates(query), and dismissal. No React, no custom overlay.
 */

/** One directory-listing RPC: (sessionId, path, filter) → host JSON result. */
export type ListFn = (sessionId: string, path: string, filter: string) => Promise<Record<string, unknown>>

const DIR_ICON = '📁'
const FILE_ICON = '📄'
const SEP = '\u0000'
const MAX_ITEMS = 40

interface Entry {
  name: string
  relPath: string
  type: string
}

/** Query text = path prefix (before the last '/') + name filter (after it). */
function parseQuery(queryText: string): { path: string; filter: string } {
  const at = queryText.lastIndexOf('/')
  if (at < 0) return { path: '', filter: queryText }
  return { path: queryText.slice(0, at), filter: queryText.slice(at + 1) }
}

function quoteIfNeeded(relPath: string): string {
  return /[\s"]/.test(relPath) ? '"' + relPath + '"' : relPath
}

const entryHint = (entry: Entry): string => entry.relPath + SEP + entry.type

const readHint = (hint: string): { relPath: string; type: string } | null => {
  const at = hint.lastIndexOf(SEP)
  if (at < 0) return null
  return { relPath: hint.slice(0, at), type: hint.slice(at + 1) }
}

/** A candidate item the built-in MenuView renders (hint is pick-time metadata). */
interface Candidate {
  name: string
  description?: string
  icon?: string
  hint: string
}

/** Build the '@' file source consumed by the built-in inputTriggers pipeline. */
export function buildFileSource(list: ListFn) {
  // 当前层已知目录名缓存（供 matchSpace 同步判定）
  const dirCache = new Set<string>()

  return {
    trigger: '@',
    name: '文件',
    order: -100,
    async candidates(session: { sessionId: string }, req: { query: string }): Promise<Candidate[]> {
      try {
        const { path, filter } = parseQuery(req.query)
        const result = await list(session.sessionId, path, filter)
        if (result === null || typeof result !== 'object' || result.error !== undefined) {
          const message = result !== null && result.error === 'no-workspace' ? '当前会话没有工作目录' : '目录读取失败'
          return [{ name: message, description: '按 ESC 关闭', hint: '' }]
        }
        dirCache.clear()
        const items: Candidate[] = []
        const direct = Array.isArray(result.direct) ? result.direct as Entry[] : []
        const deep = Array.isArray(result.deep) ? result.deep as Entry[] : []
        for (const entry of direct.concat(deep)) {
          if (items.length >= MAX_ITEMS) break
          if (entry.type === 'directory') dirCache.add(entry.name)
          items.push({
            name: entry.name + (entry.type === 'directory' ? '/' : ''),
            description: entry.relPath,
            icon: entry.type === 'directory' ? DIR_ICON : FILE_ICON,
            hint: entryHint(entry),
          })
        }
        if (items.length === 0) {
          return [{ name: '没有匹配的文件或目录', description: '工作目录', hint: '' }]
        }
        return items
      } catch (error) {
        console.error('chat-menu: candidates failed:', error)
        return [{ name: '菜单加载失败', description: '按 ESC 关闭', hint: '' }]
      }
    },
    onPick(pick: { candidate: { hint?: string } }) {
      const hint = typeof pick.candidate.hint === 'string' ? readHint(pick.candidate.hint) : null
      if (hint === null || hint.relPath === '') return undefined
      // 目录：写入 @目录/ 以继续逐级深入（继续输入即重新列出该层）；文件：写入相对路径
      if (hint.type === 'directory') return { text: '@' + quoteIfNeeded(hint.relPath) + '/' }
      return { text: hint.relPath }
    },
    matchSpace(_session: unknown, token: string) {
      // '@名字 + 空格'：名字是当前层已知目录时转为 '@名字/' 并重新展开该层
      const name = token.startsWith('@') ? token.slice(1) : ''
      if (name === '' || name.includes('/') || name.includes('"')) return undefined
      if (!dirCache.has(name)) return undefined
      return { text: '@' + name + '/' }
    },
    async matchEnter(session: { sessionId: string }, line: string): Promise<'handled' | undefined> {
      // 防止误发送“浏览到一半”的目录 token：整行是 @目录路径/ 时吞掉本次提交
      const trimmed = line.trim()
      if (!trimmed.startsWith('@')) return undefined
      const rest = trimmed.slice(1)
      if (rest === '' || !rest.includes('/')) return undefined
      try {
        const result = await list(session.sessionId, rest, '')
        if (result === null || typeof result !== 'object' || result.error !== undefined) return undefined
        const normalized = rest.replace(/^"|"$/g, '').replace(/\/+$/, '')
        if (normalized.includes('/') && typeof result.dir === 'string' && result.dir === normalized) return 'handled'
        return undefined
      } catch {
        return undefined
      }
    },
  }
}

/** The plugin apply shared by both forms: registers the @ source once. */
export function buildApply(deps: { list: ListFn }): (ctx: { get(name: string): unknown; effect(fn: () => unknown, label?: string): unknown }) => void {
  return (ctx) => {
    const inputTriggers = ctx.get('inputTriggers') as { registerSource(source: unknown): () => void } | undefined
    if (inputTriggers === undefined) {
      console.error('chat-menu: inputTriggers service unavailable')
      return
    }
    const source = buildFileSource(deps.list)
    ctx.effect(() => {
      try {
        return inputTriggers.registerSource(source)
      } catch (error) {
        // 更新切换时旧实例可能尚未完全卸载，导致同 (trigger, name) 重复注册；
        // 已存在则视为本实例的源已生效（旧 fiber 注销后由幸存实例持有）
        console.warn('chat-menu: @文件 source 已存在，跳过重复注册', error)
        return () => {}
      }
    }, 'chat-menu: @file source')
  }
}
