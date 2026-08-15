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
│   ├── package.json     # bundle 包清单
│   ├── src/             # bundle 版源码
│   └── dynamic/         # 动态插件形态（函数体）
└── <other-plugin>/      # ← 独立 git 仓库 → GitHub: dsh-plugin-<other-plugin>
```

```
# 本仓库（GitHub: dsh-plugin-chat-menu）
dsh-plugin-chat-menu/
├── README.md            # 插件说明（功能、两种安装方式、单一源码、结构）
├── AGENTS.md            # 本文件：仓库族约定
├── package.json         # npm 包清单（typescript/esbuild devDeps；dsh.bundle.patch / dsh.client）
├── tsconfig.json        # TypeScript 配置
├── cordis.patch.yml     # bundle 挂载补丁
├── src/                 # ★ 单一 TypeScript 源码（core/ 共享核心 + host/ 装配）
├── dynamic/             # 构建产物：动态插件函数体（npm run build 生成，不入库）
├── scripts/             # build.mjs / install.sh / install.ps1
└── lib/                 # 构建产物：bundle 版（npm run build 生成，不入库）
```

## 插件开发规则（单一 TypeScript 源码）

**单一源码保证**：两种安装形态（bundle 版 `lib/` 与动态版 `dynamic/`）由 `npm run build` 从同一份 TypeScript 源码生成，只差安装方式 / 注册周期 / 传输通道。改逻辑只改 `src/`，禁止手工编辑 `lib/` 或 `dynamic/`（构建产物，gitignore）。

- **共享核心（`src/core/`）**：`host-core.ts`（目录列举逻辑，服务注入、无环境依赖）、`menu-core.ts`（@ 菜单 UI，React/RPC 注入，含 `createMenu` / `buildApply` / CSS）。核心不得引用任何宿主符号（无 harness / styles / require）。
- **Host 装配（`src/host/`）**：
  - `bundle.ts` — ESM 函数插件（命名导出 `name`/`inject`/`apply`），`webServer` 路由 `/chat-menu/list` + 回环/同源信任栅栏；
  - `dynamic.ts` — 动态桥（`harness.handle`），与 bundle 共用同一 `host-core` 核心。
- **浏览器半壳（在 `scripts/build.mjs` 模板内）**：bundle = module-loader factory（`require('react')` + fetch）；动态 = 闭包符号（React / host）+ `host.call`。两者都调 `CHATMENU_CORE.buildApply(...)`，UI 全部来自 `menu-core.ts`。
- **构建**：`npm run typecheck`（tsc --noEmit）→ `npm run build`（esbuild）产出 `lib/index.js`、`lib/client.js`、`lib/client-registry.js`、`dynamic/host.js`、`dynamic/client.js`。
- **副作用可回收**：事件监听、路由注册等一律挂插件 Fiber（`ctx.effect` / 组件 `useEffect`），stop/update 后不留残留。
- **UI 位置**：输入区浮层类 UI 注册在 `conversation.input.overlay` 槽位（先 `cordis_inspect_query` 确认槽位契约）。

## 动态插件形态（`dynamic/`，构建产物）

`dynamic/host.js` / `dynamic/client.js` 是动态 Cordis 插件函数体（`var` + `return { name, apply }`），通过会话内工具装载（`cordis_define` + `cordis_run`），适合未发布 npm 时使用/调试：

- Host 半用 `harness.handle` 注册 RPC；浏览器半用闭包符号（`React` / `host`）——传输通道与 bundle 版不同，逻辑共用核心。
- 两种形态功能一致，**同一时间只装一种**（都注册 `@` 文件菜单；bundle 版 overlay id `chat-menu`，动态版 `at-file-menu`）。
- 动态版随进程重启清空，需要重新装载。

## 装载流程

**bundle 版（正式安装）**：

1. `npm run typecheck && npm run build` 生成 `lib/` 与 `dynamic/`；
2. `dsh plugin --profile <name> add dsh-plugin-chat-menu`（或 `file:<仓库路径>` 本地安装）——CLI 识别包内 `dsh.bundle.patch`（`cordis.patch.yml`），自动写入 `dsh.profile.bundles` 完成挂载；
3. 重启 DSH（host 半是启动期组合）并硬刷新浏览器生效。

一键安装脚本：`scripts/install.sh`（macOS/Linux）/ `scripts/install.ps1`（Windows）。发布到 npm 前，脚本与 CLI 命令需要先 `npm publish`。

**动态版（未发布 npm / 调试）**：先 `npm run build`，再 `cordis_define`（`idPrefix: atfile`，code 取 `dynamic/` 下函数体）→ `cordis_run`（首次 `run`，改版 `update`）。

## 仓库纪律

- 一个仓库只承载一个插件（本仓库即 chat-menu）；新增插件在母目录新建子目录并另起仓库。
- 只提交插件源码、README、AGENTS.md 等仓库文件；不提交密钥、会话数据或运行产物。
- 每次行为变更同步更新 README。
- 仓库话题（topics）至少包含：`dsh`、`dsh-harness`、`dsh-plugin`。
