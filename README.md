# dsh-plugin-chat-menu

<div align="center">
  <b style="font-size: 1.15em;">在 DSH 会话输入框输入 <code>@</code>，呼出工作目录文件浏览菜单</b><br /><br />
  <code>名称搜索</code> <code>递归查找</code> <code>逐级深入</code> <code>多格式引用</code> <code>ESC 取消</code><br /><br />
  搜索、点选、把文件/目录路径以任意格式引用进输入框，全程无需离开键盘。
</div>

<div align="center">

![platform](https://img.shields.io/badge/platform-DSH-0a66c2)
![plugin type](https://img.shields.io/badge/type-dynamic%20Cordis%20plugin-orange)
![language](https://img.shields.io/badge/language-JavaScript-f7df1e)
![license](https://img.shields.io/github/license/ChocoLZS/dsh-plugin-chat-menu)
![stars](https://img.shields.io/github/stars/ChocoLZS/dsh-plugin-chat-menu)
![issues](https://img.shields.io/github/issues/ChocoLZS/dsh-plugin-chat-menu)
![last commit](https://img.shields.io/github/last-commit/ChocoLZS/dsh-plugin-chat-menu)
![repo size](https://img.shields.io/github/repo-size/ChocoLZS/dsh-plugin-chat-menu)

</div>

## ✨ 功能一览

- **`@` 即呼出**：输入 `@` 弹出浮层菜单，列出当前会话**工作目录**下的子目录与文件（目录在前）
- **🔍 搜索框**：菜单自带搜索框，按文件/目录名过滤当前层；当前层命中不足时自动在**整个工作目录内递归搜索**（深度/目录数/扫描条目数三重预算，大仓库不卡顿）
- **↕ 层级深浅**：`→` 进入高亮目录、`←` 返回上一级；点击目录项或面包屑路径同样逐级深入
- **⌨️ 全键盘操作**：`↑/↓` 移动高亮、`Enter` 或点击选中、`Tab` 切换引用格式、`ESC` 取消
- **📋 多格式 snippet 引用**：选中条目后按需引用——
  - 目录：`进入`（`@目录/`）、`路径`、`代码`（反引号）、`链接`（Markdown）
  - 文件：`路径`、`引用`（`@路径`）、`代码`（反引号）、`链接`（Markdown）
- **🪝 会话感知**：工作目录跟随当前会话 `header.cwd`，菜单内容与所在目录保持一致

## 🚀 安装

**前置**：已装好 DSH（`dsh web` 能正常运行）。

### 官方 CLI（npm 包发布后即生效）

```sh
dsh plugin --profile web add dsh-plugin-chat-menu
```

等价写法（无需全局安装 dsh）：

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-plugin-chat-menu
```

> `dsh plugin` 会登记依赖、识别包内 `dsh.bundle.patch` 并自动写入 `dsh.profile.bundles` 完成挂载；装完**硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可使用（client 改动热加载，仅 host 半更新需要重启 DSH）。

### 动态装载（当前源码形态，开箱即用）

插件当前以**动态 Cordis 插件**运行，通过会话内的动态插件工具装载：

1. `cordis_define`：`idPrefix: atfile`；`code.host` / `code.client` 分别取本仓库 `host.js` / `client.js` 的函数体；
2. `cordis_run`：首次 `run` 激活（浏览器半首次需批准），后续改版用 `update` 更新同一 pluginId。

> 动态插件随 DSH 进程重启而清空，重启后按上述两步重新装载即可；源码即本仓库。

## ⌨️ 使用速查

| 按键 | 行为 |
| --- | --- |
| `@` | 呼出/聚焦文件菜单 |
| 输入字符 | 按名称过滤当前层；无匹配时递归搜索 |
| `↑` / `↓` | 移动高亮 |
| `→` / `←` | 进入高亮目录 / 返回上一级（搜索框内光标在末尾/开头时同样生效） |
| `Enter` | 按当前引用格式插入 |
| `Tab` | 循环切换引用格式（路径 / @引用 / 代码 / 链接） |
| `ESC` | 关闭菜单（关闭后只有继续打字才会重新呼出） |

## 📂 结构

```
dsh-plugin-chat-menu/
├── README.md            # 本文件
├── AGENTS.md            # dsh-plugin-* 仓库族约定（agent 开发必读）
├── LICENSE              # MIT
├── host.js              # Host 半：fsmenu/list RPC（目录解析、名称过滤、递归搜索）
└── client.js            # 浏览器半：conversation.input.overlay 自绘浮层
```

- `host.js` — 入参 `{ sessionId, path, filter }`：`path` 逐段解析真实目录（先精确、后忽略大小写），`filter` 名称过滤；工作目录取会话 `header.cwd`，缺失回退 `sandboxPolicy.workspaceRoot`。
- `client.js` — `@token` 检测复用内置触发器词边界规则；菜单的打开/关闭只由**草稿文本变化**驱动，`ESC` 关闭后光标/keyup/点击不会把它弹回；选中后经 `inputActions.setDraft` 替换 token。

## 📝 License

[MIT](./LICENSE)
