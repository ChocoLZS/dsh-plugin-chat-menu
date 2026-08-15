# AGENTS.md — dsh-plugin-* 插件仓库约定

本文件面向在本仓库内工作的 agent（含 AI 编码代理）。任何修改本仓库代码、文档或新建插件前，请先阅读本约定。

## 仓库族与目录结构

本仓库属于 **dsh-plugin-*** 插件仓库族。

- **本地母目录 `dsh-plugins/`**：用于在本地聚合多个插件子目录，本身**不是 git 仓库**，也**不会作为一个整体上传到 GitHub**。
- **子目录即独立仓库**：`dsh-plugins/` 下的每个插件子目录各自 `git init`、各自推送为独立的 GitHub 仓库，仓库名统一为 `dsh-plugin-<name>`。
  - 例：子目录 `chat-menu` → 仓库 `dsh-plugin-chat-menu`（即本仓库）。
- **本仓库** = 母目录下的一个插件子目录的完整内容：插件源码直接放在仓库根目录，不要在本仓库里再包一层 `dsh-plugins/`。

```
# 本地（母目录，非仓库）
dsh-plugins/
├── AGENTS.md            # 仓库族约定（每个子目录仓库内也保留一份）
├── chat-menu/           # ← 独立 git 仓库 → GitHub: dsh-plugin-chat-menu
│   ├── README.md
│   ├── host.js
│   └── client.js
└── <other-plugin>/      # ← 独立 git 仓库 → GitHub: dsh-plugin-<other-plugin>
```

```
# 本仓库（GitHub: dsh-plugin-chat-menu）
dsh-plugin-chat-menu/
├── README.md            # 插件说明（功能、装载、结构）
├── AGENTS.md            # 本文件：仓库族约定
├── host.js              # Host 半（函数体，return 插件对象）
└── client.js            # 浏览器半（函数体，return 插件对象）
```

## 插件开发规则（DSH 动态 Cordis 插件）

- **纯 JavaScript 函数体**：`host.js` / `client.js` 各是一个函数体，以 `return { ... }` 结尾；禁止 `import` / `require` / TypeScript / JSX。
- **Host 半**：通过 `ctx.get(name)` 读服务（判空处理）；用 `harness.handle(method, handler)` 注册 Client→Host 的 JSON RPC；handler 返回 JSON 兼容值。
- **浏览器半**：`React` 以闭包符号注入，UI 必须用 `React.createElement(...)`；样式用 `styles.insert(css)` 注入（卸载自动清理）。
- **副作用可回收**：事件监听、定时器、注册项都必须挂在插件 Fiber 上（`ctx.effect` / 组件 `useEffect` 清理），插件 stop/update 后不留残留。
- **UI 位置**：输入区浮层类 UI 注册在 `conversation.input.overlay` 槽位（先 `cordis_inspect_query` 确认槽位契约）。
- **升级**：`cordis_define`（kind `existing`，同一 pluginId）追加不可变 Package → `cordis_run` mode `update`。

## 装载流程

1. `cordis_define`：`idPrefix` 为 3–6 位小写字母；`code.host` / `code.client` 取对应文件函数体；
2. `cordis_run`：首次 `run`，改版 `update`；
3. 浏览器半首次激活需要批准；批准策略由会话侧控制。

## 仓库纪律

- 一个仓库只承载一个插件（本仓库即 chat-menu）；新增插件在母目录新建子目录并另起仓库。
- 只提交插件源码、README、AGENTS.md 等仓库文件；不提交密钥、会话数据或运行产物。
- 每次行为变更同步更新 README。
- 仓库话题（topics）至少包含：`dsh`、`dsh-harness`、`dsh-plugin`。
