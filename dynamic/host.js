/**
 * @ 文件目录引用菜单 — Host 半（v2）
 * 通过 harness.handle('fsmenu/list') 为浏览器半提供工作目录浏览与名称搜索：
 * path 为相对工作目录的层级（逐段解析、先精确后忽略大小写），filter 为名称过滤；
 * 当前层命中不足时追加有预算上限的递归搜索（深度、目录数、扫描条目数三重上限）。
 */
return {
  name: 'at-file-menu-host',
  apply(ctx) {
    const fs = ctx.get('fs')
    const sessions = ctx.get('sessions')
    if (fs === undefined || sessions === undefined) {
      console.error('at-file-menu: host services fs/sessions unavailable')
      return
    }
    const policy = ctx.get('sandboxPolicy')

    const MAX_DIRECT = 50
    const MAX_DEEP = 30
    const MAX_DEPTH = 5
    const MAX_DIRS = 50
    const MAX_SCAN = 1000

    const isDir = (entry) => entry.type === 'directory'
    const isFile = (entry) => entry.type === 'file'
    const matches = (name, filter) => filter === '' || name.toLowerCase().includes(filter.toLowerCase())
    const byName = (a, b) => (isDir(b) ? 1 : 0) - (isDir(a) ? 1 : 0) || a.name.localeCompare(b.name)
    const visible = (entry, filter) => entry.name.startsWith('.') ? filter.startsWith('.') : true

    async function listDir(target) {
      try {
        const entries = await fs.listDir(target)
        return entries.filter((entry) => isDir(entry) || isFile(entry)).sort(byName)
      } catch (error) {
        return null
      }
    }

    // 从 rootTarget 出发逐段匹配目录（先精确、再忽略大小写），返回最深命中层
    async function walk(rootTarget, segments) {
      let dir = rootTarget
      let rel = ''
      for (const segment of segments) {
        const entries = await listDir(dir)
        if (entries === null) break
        let child = undefined
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

    // 有预算的广度优先递归搜索
    async function deepSearch(dir, relBase, filter, out) {
      const queue = [{ target: dir, rel: relBase, depth: 0 }]
      let scanned = 0
      let dirs = 0
      while (queue.length > 0 && scanned < MAX_SCAN && dirs < MAX_DIRS && out.length < MAX_DEEP) {
        const node = queue.shift()
        const entries = await listDir(node.target)
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

    harness.handle('fsmenu/list', async (args) => {
      const sessionId = args !== null && typeof args === 'object' && typeof args.sessionId === 'string' ? args.sessionId : ''
      const rawPath = args !== null && typeof args === 'object' && typeof args.path === 'string' ? args.path : ''
      const filter = args !== null && typeof args === 'object' && typeof args.filter === 'string' ? args.filter : ''
      const session = sessionId === '' ? undefined : sessions.get(sessionId)
      let root = session !== undefined && session.header !== undefined && typeof session.header.cwd === 'string'
        ? session.header.cwd
        : undefined
      if (root === undefined && policy !== undefined && typeof policy.workspaceRoot === 'string') root = policy.workspaceRoot
      if (root === undefined) return { error: 'no-workspace' }
      try {
        const rootTarget = await fs.resolve(root)
        const segments = rawPath.split('/').filter((segment) => segment !== '' && segment !== '.')
        const { dir, rel } = await walk(rootTarget, segments)
        const entries = await listDir(dir)
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
          await deepSearch(dir, rel, filter, deep)
        }
        return { root, dir: rel, direct, deep }
      } catch (error) {
        console.error('at-file-menu: fsmenu/list failed:', error)
        return { error: 'list-failed', dir: rawPath }
      }
    })
  },
}
