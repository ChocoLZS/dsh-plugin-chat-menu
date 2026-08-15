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

/** Detect the @token from draft + caret (same word-boundary rule as the built-in trigger). */
function detectAt(draft: string, caret: number): { start: number; query: string } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = draft.charAt(i)
    if (/\s/.test(ch)) return null
    if (ch !== '@') continue
    if (i === 0) return { start: i, query: draft.slice(i + 1, caret) }
    const prev = draft.charAt(i - 1)
    if (/[\p{L}\p{N}_]/u.test(prev)) continue
    return { start: i, query: draft.slice(i + 1, caret) }
  }
  return null
}

// ---- 原生 @ 菜单的增强层（外层包装）：hover tooltip + ←/→ 层级按键 ----
// 不替换内置菜单，只在其外挂事件：读取 MenuView 的 DOM（role="option"、
// aria-activedescendant / dsh-slash-option-文件-<i> 前缀）与输入框值协同。

const TOOLTIP_STYLE_ID = 'dsh-plugin-chat-menu/tooltip.css'
const TOOLTIP_CSS = `
.chatmenu-tooltip{position:fixed;z-index:300;max-width:min(520px,70vw);padding:4px 10px;border:1px solid var(--dsw-alias-border-inverted);border-radius:8px;background:var(--dsw-specific-tooltip,var(--dsw-specific-menu));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
`

let tooltipEl: HTMLDivElement | null = null
let tooltipListeners = 0

function ensureTooltipCss(): void {
  if (typeof document !== 'undefined'
    && document.querySelector('style[data-plugin-css=' + JSON.stringify(TOOLTIP_STYLE_ID) + ']') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-plugin-chat-menu'
    tag.dataset.pluginCss = TOOLTIP_STYLE_ID
    tag.textContent = TOOLTIP_CSS
    document.head.appendChild(tag)
  }
}

/** 悬停内置菜单「文件」分组的条目时显示完整文件名/路径（DOM 文本是全文，CSS 截断只是视觉）。 */
function attachHoverTooltip(): () => void {
  tooltipListeners++
  const onMouseMove = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const option = target.closest('button[role="option"]')
    if (option === null || !option.id.startsWith('dsh-slash-option-文件-')) return
    const children = option.children
    const name = children.length > 1 ? (children[children.length - 2].textContent ?? '') : ''
    const desc = children.length > 0 ? (children[children.length - 1].textContent ?? '') : ''
    const text = (name.endsWith('/') ? '📁 ' : '📄 ') + (desc.trim() !== '' ? desc : name)
    if (tooltipEl === null) {
      tooltipEl = document.createElement('div')
      tooltipEl.className = 'chatmenu-tooltip'
      document.body.appendChild(tooltipEl)
    }
    const tipWidth = 240
    const tipHeight = 26
    const gap = 12
    let left = event.clientX + gap
    if (left + tipWidth > window.innerWidth - 8) left = Math.max(8, event.clientX - tipWidth - gap)
    let top = event.clientY + gap
    if (top + tipHeight > window.innerHeight - 8) top = Math.max(8, event.clientY - tipHeight - gap)
    tooltipEl.textContent = text
    tooltipEl.style.left = left + 'px'
    tooltipEl.style.top = top + 'px'
    tooltipEl.style.display = 'block'
  }
  const hide = (): void => {
    if (tooltipEl !== null) tooltipEl.style.display = 'none'
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseout', hide)
  return () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseout', hide)
    tooltipListeners = Math.max(0, tooltipListeners - 1)
    if (tooltipListeners === 0 && tooltipEl !== null && tooltipEl.parentNode !== null) {
      tooltipEl.parentNode.removeChild(tooltipEl)
      tooltipEl = null
    }
  }
}

/** 原生触发菜单是否打开且高亮了一个选项（返回高亮的 option 元素）。 */
function highlightedOption(): Element | null {
  const menu = document.querySelector('[role="listbox"][aria-activedescendant]')
  const id = menu !== null ? menu.getAttribute('aria-activedescendant') : null
  if (id === null || !id.startsWith('dsh-slash-option-')) return null
  return document.getElementById(id)
}

/** 通过 React 受控输入的“原生 setter + input 事件”驱动输入框值，使内置管线重新 track。 */
function setComposerValue(textarea: HTMLTextAreaElement, next: string, caret: number): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter === undefined) return
  setter.call(textarea, next)
  try { textarea.setSelectionRange(caret, caret) } catch { /* 忽略边界 */ }
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * ←/→ 层级按键：菜单打开且焦点在输入框时，
 * → 进入高亮目录（读取 aria-activedescendant 的「文件」分组目录项），
 * ← 返回上一级（缩短当前 @token 的路径段）。
 * 通过 setComposerValue 让内置管线立即重新 track，菜单即时刷新。
 */
function attachInputKeys(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const textarea = document.activeElement
    if (!(textarea instanceof HTMLTextAreaElement)) return
    const caret = textarea.selectionStart ?? textarea.value.length
    const hit = detectAt(textarea.value, caret)
    if (hit === null) return
    if (event.key === 'ArrowRight') {
      const option = highlightedOption()
      if (option === null || !option.id.startsWith('dsh-slash-option-文件-')) return
      const children = option.children
      const name = children.length > 1 ? (children[children.length - 2].textContent ?? '') : ''
      const desc = children.length > 0 ? (children[children.length - 1].textContent ?? '') : ''
      if (!name.endsWith('/') || desc.trim() === '') return
      // 进入高亮目录：token → @relPath/
      const next = textarea.value.slice(0, hit.start) + '@' + desc.trim() + '/' + textarea.value.slice(caret)
      event.preventDefault()
      event.stopPropagation()
      setComposerValue(textarea, next, hit.start + desc.trim().length + 2)
      return
    }
    // ArrowLeft：逐级返回——先清过滤词停在本目录，再按才上一级；根层过滤放行
    const lastSlash = hit.query.lastIndexOf('/')
    if (lastSlash < 0) return // 根层过滤 → 放行（光标正常移动）
    let parent: string
    if (hit.query.endsWith('/')) {
      // 当前在目录内：去掉最后一个路径段（上一级）
      const pathPart = hit.query.slice(0, lastSlash)
      const parentSlash = pathPart.lastIndexOf('/')
      parent = parentSlash < 0 ? '' : pathPart.slice(0, parentSlash + 1)
    } else {
      // 有过滤词：先清掉过滤词，停在当前目录（下一次 ← 再上一级）
      parent = hit.query.slice(0, lastSlash + 1)
    }
    const next = textarea.value.slice(0, hit.start) + '@' + parent + textarea.value.slice(caret)
    event.preventDefault()
    event.stopPropagation()
    setComposerValue(textarea, next, hit.start + parent.length + 1)
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => document.removeEventListener('keydown', onKeyDown, true)
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
      ensureTooltipCss()
      const disposeTooltip = attachHoverTooltip()
      const disposeKeys = attachInputKeys()
      let disposeSource = () => {}
      try {
        disposeSource = inputTriggers.registerSource(source)
      } catch (error) {
        // 更新切换时旧实例可能尚未完全卸载，导致同 (trigger, name) 重复注册；
        // 已存在则视为本实例的源已生效（旧 fiber 注销后由幸存实例持有）
        console.warn('chat-menu: @文件 source 已存在，跳过重复注册', error)
      }
      return () => {
        disposeSource()
        disposeKeys()
        disposeTooltip()
      }
    }, 'chat-menu: @file source + 增强层')
  }
}
