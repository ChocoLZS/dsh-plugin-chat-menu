/**
 * Shared @-menu UI core — the SINGLE source for both the bundle form
 * (module-loader factory in scripts/build.mjs) and the dynamic form
 * (function body). React and the directory-listing RPC are injected so the
 * core stays import-free and environment-agnostic; scripts/build.mjs bundles
 * it into either artifact unchanged.
 */

/** The React surface the component needs (typed loosely; no @types/react). */
export interface ReactLike {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown
  Fragment: unknown
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void
  useRef: <T>(initial: T) => { current: T }
  useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]) => T
}

/** One directory-listing RPC: (sessionId, path, filter) → host JSON result. */
export type ListFn = (sessionId: string, path: string, filter: string) => Promise<Record<string, unknown>>

export const ATFM_STYLE_ID = 'dsh-plugin-chat-menu/atfm.css'

export const ATFM_CSS = `
.atfm-menu{position:absolute;z-index:200;width:560px;max-width:calc(100vw - 32px);max-height:400px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);border-radius:12px;padding:4px;overflow:hidden;font-size:13px;line-height:20px}
.atfm-box{display:flex;align-items:center;gap:6px;margin:2px 2px 6px;padding:0 8px;border:1px solid var(--dsw-alias-border-inverted);border-radius:8px}
.atfm-box input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);padding:7px 0;font-size:13px}
.atfm-crumbs{display:flex;align-items:center;gap:2px;flex-wrap:wrap;padding:0 8px 6px;font-size:12px}
.atfm-crumb{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);padding:2px 4px;border-radius:6px;font-size:12px}
.atfm-crumb:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.atfm-crumb-sep{opacity:.6;color:var(--dsw-alias-label-tertiary)}
.atfm-viewport{min-height:0;overflow-y:auto;display:flex;flex-direction:column}
.atfm-item{cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);text-align:left;background:transparent;border:none;width:100%}
.atfm-item:hover,.atfm-item.active{background:var(--dsw-alias-interactive-bg-hover)}
.atfm-icon{flex:none;width:16px;text-align:center}
.atfm-name{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.atfm-desc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.atfm-empty{color:var(--dsw-alias-label-dimmed);padding:10px}
.atfm-footer{border-top:1px solid var(--dsw-alias-border-inverted);margin-top:4px;padding:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.atfm-footer-label{color:var(--dsw-alias-label-dimmed);font-size:12px}
.atfm-chip{cursor:pointer;border:1px solid var(--dsw-alias-border-inverted);background:transparent;color:var(--dsw-alias-label-tertiary);padding:3px 8px;border-radius:999px;font-size:12px}
.atfm-chip:hover,.atfm-chip.active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.atfm-tooltip{position:fixed;z-index:200;max-width:min(480px,60vw);padding:4px 10px;border:1px solid var(--dsw-alias-border-inverted);border-radius:8px;background:var(--dsw-specific-tooltip,var(--dsw-specific-menu));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
`

/** Inject the menu stylesheet once (idempotent; works in both bundle and dynamic environments). */
export function injectMenuCss(): void {
  if (typeof document !== 'undefined'
    && document.querySelector('style[data-plugin-css=' + JSON.stringify(ATFM_STYLE_ID) + ']') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-plugin-chat-menu'
    tag.dataset.pluginCss = ATFM_STYLE_ID
    tag.textContent = ATFM_CSS
    document.head.appendChild(tag)
  }
}

const DIR_ICON = '📁'
const FILE_ICON = '📄'
const MAX_ITEMS = 50

interface Entry {
  name: string
  relPath: string
  type: string
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

/** Query text = path prefix (before the last '/') + name filter (after it). */
function parseQuery(queryText: string): { path: string; filter: string } {
  const at = queryText.lastIndexOf('/')
  if (at < 0) return { path: '', filter: queryText }
  return { path: queryText.slice(0, at), filter: queryText.slice(at + 1) }
}

function quoteIfNeeded(relPath: string): string {
  return /[\s"]/.test(relPath) ? '"' + relPath + '"' : relPath
}

/**
 * Measure the caret's viewport rectangle inside a textarea via an off-screen
 * mirror with the same metrics. The marker rect is read in the mirror's
 * content coordinates, then translated to the textarea's true viewport
 * position: textarea rect + marker offset − scroll offset.
 */
function caretViewportRect(textarea: HTMLTextAreaElement): { left: number; top: number; height: number } {
  const pos = textarea.selectionStart ?? textarea.value.length
  const style = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const props = [
    'boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'lineHeight', 'tabSize', 'textTransform', 'textIndent',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
    'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth',
  ]
  for (const p of props) {
    const v = style.getPropertyValue(p)
    if (v !== '') (mirror as unknown as Record<string, string>)[p] = v
  }
  mirror.style.position = 'fixed'
  mirror.style.top = '0'
  mirror.style.left = '0'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.width = textarea.clientWidth + 'px'
  mirror.textContent = textarea.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const markerRect = marker.getBoundingClientRect()
  document.body.removeChild(mirror)
  const taRect = textarea.getBoundingClientRect()
  return {
    left: taRect.left + markerRect.left - textarea.scrollLeft,
    top: taRect.top + markerRect.top - textarea.scrollTop,
    height: markerRect.height,
  }
}

/** Per-entry snippet formats (dir default「进入」, file default「路径」). */
function formatsFor(item: Entry): string[] {
  if (item.type === 'directory') {
    return [
      '@' + quoteIfNeeded(item.relPath) + '/',
      item.relPath + '/',
      '`' + item.relPath + '/`',
      '[' + item.name + '/](' + item.relPath + '/)',
    ]
  }
  return [
    item.relPath,
    '@' + quoteIfNeeded(item.relPath),
    '`' + item.relPath + '`',
    '[' + item.name + '](' + item.relPath + ')',
  ]
}

interface MenuProps {
  useInput: (selector: (state: { draft: string }) => string) => string
  inputActions: { setDraft(text: string): void }
  sessionId: string
}

/** Build the FileMenu component with the injected React + listing RPC. */
export function createMenu(deps: { React: ReactLike; list: ListFn }): (props: MenuProps) => unknown {
  const { React, list } = deps

  return function FileMenu(props: MenuProps): unknown {
    const draft = props.useInput((state) => state.draft)
    const [hit, setHit] = React.useState<{ start: number; end: number } | null>(null)
    const [queryText, setQueryText] = React.useState('')
    const [browse, setBrowse] = React.useState<{
      dir: string
      items: Entry[]
      loading: boolean
      error?: string
    }>({ dir: '', items: [], loading: false })
    const [focus, setFocus] = React.useState(-1)
    const [variant, setVariant] = React.useState(0)
    const rootRef = React.useRef<HTMLElement | null>(null)
    const seqRef = React.useRef(0)
    const hitRef = React.useRef<{ start: number; end: number } | null>(null)
    const pickRef = React.useRef<((item: Entry, variantIndex: number) => void) | null>(null)
    const lastDraftRef = React.useRef<string | null>(null)
    const [pos, setPos] = React.useState<{ left: number; top: number; maxHeight: number } | null>(null)
    const [tip, setTip] = React.useState<{ text: string; left: number; top: number } | null>(null)
    hitRef.current = hit
    const close = React.useCallback(() => {
      const wasOpen = hitRef.current !== null
      setHit(null)
      if (!wasOpen) return
      // 关闭后向输入框补发 Escape，让内置提及菜单同步收起（避免其残留影响 Enter）
      requestAnimationFrame(() => {
        const card = rootRef.current !== null && typeof rootRef.current.closest === 'function'
          ? rootRef.current.closest('[data-composer-card]')
          : null
        const textarea = card !== null && typeof card.querySelector === 'function'
          ? card.querySelector('textarea')
          : null
        const target = textarea instanceof HTMLTextAreaElement
          ? textarea
          : document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null
        if (target !== null) {
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
        }
      })
    }, [])

    // Query change → list the current level (+ recursive search) via the injected RPC.
    React.useEffect(() => {
      if (hit === null) return
      const { path, filter } = parseQuery(queryText)
      const seq = ++seqRef.current
      setBrowse((prev) => ({ ...prev, loading: true }))
      const run = async (): Promise<void> => {
        try {
          const result = await list(props.sessionId, path, filter)
          if (seqRef.current !== seq) return
          if (result === null || typeof result !== 'object' || result.error !== undefined) {
            const message = result !== null && result.error === 'no-workspace' ? '当前会话没有工作目录' : '目录读取失败'
            setBrowse({ dir: '', items: [], loading: false, error: message })
            setFocus(-1)
            return
          }
          const seen = new Set<string>()
          const items: Entry[] = []
          const direct = Array.isArray(result.direct) ? result.direct as Entry[] : []
          const deep = Array.isArray(result.deep) ? result.deep as Entry[] : []
          for (const entry of direct.concat(deep)) {
            if (seen.has(entry.relPath)) continue
            seen.add(entry.relPath)
            items.push(entry)
            if (items.length >= MAX_ITEMS) break
          }
          setBrowse({ dir: typeof result.dir === 'string' ? result.dir as string : '', items, loading: false })
          setFocus(items.length > 0 ? 0 : -1)
          setVariant(0)
        } catch (error) {
          if (seqRef.current !== seq) return
          console.error('chat-menu: list failed:', error)
          setBrowse({ dir: '', items: [], loading: false, error: '菜单加载失败' })
        }
      }
      void run()
    }, [queryText, hit === null, props.sessionId])

    // 检测 @token。规则：
    // - 草稿文本变化（输入/删除/粘贴等）：完整检测，可打开/关闭菜单并回写查询文本；
    //   pick 刚写入的 token（lastDraftRef 已预置为新草稿）不会立刻把菜单重开。
    // - 草稿未变（光标移动 / keyup / click）：只微调已打开菜单的 token 跨度，
    //   绝不重开已关闭的菜单 —— 因此 ESC 关掉后无论光标怎么变都不会弹回来。
    React.useEffect(() => {
      const refresh = (): void => {
        const active = document.activeElement
        if (!(active instanceof HTMLTextAreaElement)) return
        if (rootRef.current !== null && rootRef.current.contains(active)) return
        const caret = active.selectionStart ?? active.value.length
        const found = detectAt(draft, caret)
        if (draft === lastDraftRef.current) {
          if (found === null || hitRef.current === null) return
          setHit((prev) => (prev !== null && prev.start === found.start && prev.end === caret ? prev : { start: found.start, end: caret }))
          return
        }
        lastDraftRef.current = draft
        if (found === null) {
          close()
          return
        }
        setQueryText(found.query)
        setHit((prev) => (prev !== null && prev.start === found.start && prev.end === caret ? prev : { start: found.start, end: caret }))
      }
      refresh()
      document.addEventListener('selectionchange', refresh)
      document.addEventListener('keyup', refresh)
      document.addEventListener('click', refresh)
      return () => {
        document.removeEventListener('selectionchange', refresh)
        document.removeEventListener('keyup', refresh)
        document.removeEventListener('click', refresh)
      }
    }, [draft, close])

    // 菜单打开期间的按键仲裁：↑↓ 高亮、→ 进入目录、← 返回上级、Enter 插入、Tab 切换 snippet、ESC 取消
    React.useEffect(() => {
      if (hit === null) return
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.isComposing) return
        const key = event.key
        const active = document.activeElement
        const inBox = active instanceof HTMLInputElement && rootRef.current !== null && rootRef.current.contains(active)
        const inComposer = active instanceof HTMLTextAreaElement
        if (key === 'Escape') {
          // 焦点在搜索框时关闭菜单并交还焦点给输入框
          if (inBox) {
            const card = rootRef.current !== null && typeof rootRef.current.closest === 'function'
              ? rootRef.current.closest('[data-composer-card]')
              : null
            const textarea = card !== null && typeof card.querySelector === 'function' ? card.querySelector('textarea') : null
            if (textarea instanceof HTMLTextAreaElement) textarea.focus()
          }
          close()
          return
        }
        if (!inBox && !inComposer) return
        // 搜索框里仅当光标在末尾（→）或开头（←）时才接管为层级导航
        const boxEdge = inBox
          ? key === 'ArrowRight'
            ? (active.selectionStart ?? active.value.length) >= active.value.length
            : key === 'ArrowLeft' ? (active.selectionStart ?? 0) <= 0 : false
          : false
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault()
          event.stopPropagation()
          const n = browse.items.length
          if (n === 0) { setFocus(-1); return }
          const dir = key === 'ArrowDown' ? 1 : -1
          const next = focus < 0 ? (dir === 1 ? 0 : n - 1) : (focus + dir + n) % n
          setFocus(next)
          setVariant(0)
          return
        }
        if (key === 'ArrowRight' && (inComposer || boxEdge)) {
          const item = browse.items[focus]
          if (item !== undefined && item.type === 'directory') {
            event.preventDefault()
            event.stopPropagation()
            setQueryText(item.relPath + '/')
          }
          return
        }
        if (key === 'ArrowLeft' && (inComposer || boxEdge)) {
          if (browse.dir !== '') {
            event.preventDefault()
            event.stopPropagation()
            const at = browse.dir.lastIndexOf('/')
            setQueryText((at < 0 ? '' : browse.dir.slice(0, at)) + '/')
          }
          return
        }
        if (key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          const item = browse.items[focus]
          if (item !== undefined && pickRef.current !== null) pickRef.current(item, variant)
          return
        }
        if (key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          setVariant((prev) => (prev + 1) % 4)
          return
        }
      }
      document.addEventListener('keydown', onKeyDown, true)
      return () => document.removeEventListener('keydown', onKeyDown, true)
    }, [hit === null, browse, focus, variant, close])

    // 菜单定位：基于输入框里的 @ 光标，优先显示在光标上方；上方空间不足翻到下方；
    // 水平/垂直钳制在视口内（防遮挡溢出）。滚动/缩放/内容变化时重新布局。
    React.useEffect(() => {
      if (hit === null) return
      const layout = (): void => {
        setTip(null)
        const active = document.activeElement
        if (!(active instanceof HTMLTextAreaElement)) return
        const context = rootRef.current !== null && rootRef.current.offsetParent instanceof HTMLElement
          ? rootRef.current.offsetParent
          : null
        const ctxRect = context !== null ? context.getBoundingClientRect() : null
        const caret = caretViewportRect(active)
        const margin = 8
        const viewportMax = Math.max(160, window.innerHeight - margin * 2)
        const measured = rootRef.current !== null ? rootRef.current.offsetHeight : 0
        const menuHeight = Math.max(0, Math.min(measured || 320, viewportMax))
        const menuWidth = rootRef.current !== null ? rootRef.current.offsetWidth : 560
        let top = caret.top - menuHeight - 6
        if (top < margin) top = caret.top + caret.height + 6
        top = Math.max(margin, Math.min(top, window.innerHeight - margin - Math.min(measured || 320, viewportMax)))
        let left = caret.left
        if (left + menuWidth > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - menuWidth - margin)
        const base = ctxRect !== null ? { x: ctxRect.left, y: ctxRect.top } : { x: 0, y: 0 }
        setPos({ left: left - base.x, top: top - base.y, maxHeight: viewportMax })
      }
      layout()
      window.addEventListener('resize', layout)
      document.addEventListener('scroll', layout, true)
      return () => {
        window.removeEventListener('resize', layout)
        document.removeEventListener('scroll', layout, true)
      }
    }, [hit, queryText, browse, close])

    // 高亮项滚动到可见
    React.useEffect(() => {
      if (hit === null || focus < 0) return
      const el = rootRef.current !== null ? rootRef.current.querySelector('.atfm-item.active') : null
      if (el !== null && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
    }, [focus, hit === null])

    // 点击菜单外（且不在输入卡片内）时关闭
    React.useEffect(() => {
      if (hit === null) return
      const onPointerDown = (event: PointerEvent): void => {
        if (!(event.target instanceof Node)) return
        if (rootRef.current !== null && rootRef.current.contains(event.target)) return
        const card = rootRef.current !== null && typeof rootRef.current.closest === 'function'
          ? rootRef.current.closest('[data-composer-card]')
          : null
        if (card !== null && typeof card.contains === 'function' && card.contains(event.target)) return
        close()
      }
      document.addEventListener('pointerdown', onPointerDown, true)
      return () => document.removeEventListener('pointerdown', onPointerDown, true)
    }, [hit === null, close])

    const pick = React.useCallback((item: Entry, variantIndex: number): void => {
      const span = hitRef.current
      if (item === undefined || span === null) return
      const fmts = formatsFor(item)
      const text = fmts[variantIndex] ?? fmts[0]
      const nextDraft = draft.slice(0, span.start) + text + draft.slice(span.end)
      // 预置草稿基线：插入的文本即使构成 @token（如「引用」方式）也不会立刻重开菜单
      lastDraftRef.current = nextDraft
      props.inputActions.setDraft(nextDraft)
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement) {
        const pos = span.start + text.length
        requestAnimationFrame(() => {
          try { active.setSelectionRange(pos, pos) } catch { /* 忽略失焦等边界 */ }
        })
      }
      close()
    }, [draft, props, close])
    pickRef.current = pick

    if (hit === null) return null

    const items = browse.items
    const highlighted = focus >= 0 && focus < items.length ? items[focus] : undefined
    const crumbParts = browse.dir === '' ? [] : browse.dir.split('/')
    const fmtNames = highlighted !== undefined
      ? (highlighted.type === 'directory' ? ['进入', '路径', '代码', '链接'] : ['路径', '引用', '代码', '链接'])
      : []
    const fmtPreviews = highlighted !== undefined ? formatsFor(highlighted) : []

    const showTip = (event: { currentTarget: HTMLElement }, item: Entry): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      const tipWidth = 240
      let left = rect.right + 8
      if (left + tipWidth > window.innerWidth - 8) left = rect.left - tipWidth - 8
      let top = rect.top
      if (top + 26 > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 26 - 8)
      setTip({ text: (item.type === 'directory' ? '📁 ' : '📄 ') + item.relPath, left, top })
    }

    return [
      React.createElement('div', { ref: rootRef, className: 'atfm-menu', role: 'listbox', style: { left: pos !== null ? pos.left : undefined, top: pos !== null ? pos.top : undefined, maxHeight: pos !== null ? pos.maxHeight : undefined, visibility: pos !== null ? 'visible' : 'hidden' } },
        React.createElement('div', { className: 'atfm-box' },
          React.createElement('span', { 'aria-hidden': 'true' }, '🔍'),
          React.createElement('input', {
            value: queryText,
            placeholder: '搜索文件 / 目录（递归）…',
            'aria-label': '搜索文件或目录',
            onChange: (event: { target: { value: string } }) => setQueryText(event.target.value),
          }),
        ),
        browse.dir !== '' && React.createElement('div', { className: 'atfm-crumbs' },
          React.createElement('button', { className: 'atfm-crumb', onMouseDown: (event: { preventDefault(): void }) => { event.preventDefault(); setQueryText('') } }, '工作目录'),
          crumbParts.map((part, index) => React.createElement(React.Fragment, { key: index },
            React.createElement('span', { className: 'atfm-crumb-sep' }, '/'),
            React.createElement('button', {
              className: 'atfm-crumb',
              onMouseDown: (event: { preventDefault(): void }) => { event.preventDefault(); setQueryText(crumbParts.slice(0, index + 1).join('/') + '/') },
            }, part),
          )),
        ),
        React.createElement('div', { className: 'atfm-viewport' },
          browse.error !== undefined
            ? React.createElement('div', { className: 'atfm-empty' }, browse.error)
            : items.length === 0
              ? React.createElement('div', { className: 'atfm-empty' }, browse.loading ? '加载中…' : '没有匹配的文件或目录')
              : items.map((item, index) => React.createElement('button', {
                key: item.relPath,
                className: 'atfm-item' + (index === focus ? ' active' : ''),
                role: 'option',
                'aria-selected': index === focus,
                onMouseDown: (event: { preventDefault(): void }) => {
                  event.preventDefault()
                  setFocus(index)
                  setVariant(0)
                  if (item.type === 'directory') setQueryText(item.relPath + '/')
                  else pick(item, 0)
                },
                onMouseEnter: (event: { currentTarget: HTMLElement }) => {
                  if (index !== focus) { setFocus(index); setVariant(0) }
                  showTip(event, item)
                },
                onMouseLeave: () => setTip(null),
              },
                React.createElement('span', { className: 'atfm-icon' }, item.type === 'directory' ? DIR_ICON : FILE_ICON),
                React.createElement('span', { className: 'atfm-name' }, item.name + (item.type === 'directory' ? '/' : '')),
                React.createElement('span', { className: 'atfm-desc' }, item.relPath),
              )),
        ),
        highlighted !== undefined && React.createElement('div', { className: 'atfm-footer' },
          React.createElement('span', { className: 'atfm-footer-label' }, '引用（Tab 切换 / Enter 插入）：'),
          fmtNames.map((label, index) => React.createElement('button', {
            key: label,
            className: 'atfm-chip' + (index === variant ? ' active' : ''),
            title: fmtPreviews[index],
            onMouseDown: (event: { preventDefault(): void }) => { event.preventDefault(); pick(highlighted, index) },
          }, label)),
        ),
      ),
      tip !== null && React.createElement('div', { className: 'atfm-tooltip', style: { left: tip.left, top: tip.top } }, tip.text),
    ]
  }
}

/**
 * The plugin apply shared by both forms: registers the overlay with the
 * injected React + listing RPC and injects the stylesheet once.
 */
export function buildApply(deps: { React: ReactLike; list: ListFn }): (ctx: { get(name: string): unknown }) => void {
  return (ctx) => {
    const slots = ctx.get('slots') as {
      inject(name: string, callback: () => unknown): unknown
      register(options: unknown, component: unknown): unknown
    } | undefined
    if (slots === undefined) {
      console.error('chat-menu: slots service unavailable')
      return
    }
    injectMenuCss()
    const FileMenu = createMenu({ React: deps.React, list: deps.list })
    slots.inject('conversation.input.overlay', () => slots.register(
      { name: 'conversation.input.overlay', id: 'chat-menu', order: 2, label: '文件目录菜单' },
      FileMenu,
    ))
  }
}
