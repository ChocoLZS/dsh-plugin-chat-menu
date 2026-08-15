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

## 插件开发规则（DSH bundle 插件）

- **Host 半（`src/host.js`）**：ESM 模块，命名导出 `name` / `inject` / `apply`（函数插件形态）。跨端 RPC 用 `webServer` 路由（如 `/chat-menu/list`），客户端 `fetch` 调用；只响应回环/同源请求。
- **浏览器半（`src/client.js`）**：`window.__ModuleLoader__.load({ id, factory })` CJS 闭包工厂；`require('react')` 经模块表解析；`module.exports = { name, inject, apply }`。UI 用 `React.createElement`，样式在工厂内以 `<style data-plugin-css>` 注入（幂等）。
- **构建**：`npm run build`（`scripts/build.mjs`）产出 `lib/`——host 直拷，浏览器半替换 `__CLIENT_ID__` 生成 `lib/client.js`（官方通道）与 `lib/client-registry.js`（注册表通道）。
- **副作用可回收**：事件监听、路由注册等一律挂插件 Fiber（`ctx.effect` / 组件 `useEffect`），stop/update 后不留残留。
- **UI 位置**：输入区浮层类 UI 注册在 `conversation.input.overlay` 槽位（先 `cordis_inspect_query` 确认槽位契约）。

## 装载流程（官方 CLI）

1. `npm run build` 生成 `lib/`；
2. `dsh plugin --profile <name> add dsh-plugin-chat-menu`（或 `file:<仓库路径>` 本地安装）——CLI 识别包内 `dsh.bundle.patch`（`cordis.patch.yml`），自动写入 `dsh.profile.bundles` 完成挂载；
3. 重启 DSH（host 半是启动期组合）并硬刷新浏览器生效。

一键安装脚本：`scripts/install.sh`（macOS/Linux）/ `scripts/install.ps1`（Windows）。发布到 npm 前，脚本与 CLI 命令需要先 `npm publish`。

## 仓库纪律

- 一个仓库只承载一个插件（本仓库即 chat-menu）；新增插件在母目录新建子目录并另起仓库。
- 只提交插件源码、README、AGENTS.md 等仓库文件；不提交密钥、会话数据或运行产物。
- 每次行为变更同步更新 README。
- 仓库话题（topics）至少包含：`dsh`、`dsh-harness`、`dsh-plugin`。
