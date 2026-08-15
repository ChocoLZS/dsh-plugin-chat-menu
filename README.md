# dsh-plugin-chat-menu

<div align="center">
  <b style="font-size: 1.15em;">在 DSH 会话输入框输入 <code>@</code>，呼出工作目录文件浏览菜单</b><br /><br />
  <code>名称搜索</code> <code>递归查找</code> <code>逐级深入</code> <code>多格式引用</code> <code>ESC 取消</code><br /><br />
  搜索、点选、把文件/目录路径以任意格式引用进输入框，全程无需离开键盘。
</div>

<div align="center">

![platform](https://img.shields.io/badge/platform-DSH-0a66c2)
![plugin type](https://img.shields.io/badge/type-DSH%20bundle%20plugin-orange)
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

**前置**：已装好 DSH（`dsh web` 能正常运行），Node.js ≥ 20。

### 一键脚本

**macOS / Linux**（Windows 装了 Git Bash 或 WSL 也可）：

```sh
curl -fsSL https://raw.githubusercontent.com/ChocoLZS/dsh-plugin-chat-menu/main/scripts/install.sh | bash
```

**Windows（PowerShell 5.1+ / pwsh）**：

```powershell
irm https://raw.githubusercontent.com/ChocoLZS/dsh-plugin-chat-menu/main/scripts/install.ps1 | iex
```

装完**重启 DSH 并硬刷新浏览器**（Cmd/Ctrl+Shift+R）即可看到 `@` 文件菜单。

### 手动安装（dsh 官方 CLI）

```sh
dsh plugin --profile web add dsh-plugin-chat-menu
```

等价写法（无需全局安装 dsh）：

```sh
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-plugin-chat-menu
```

> `dsh plugin` 会登记依赖、识别包内 `dsh.bundle.patch`（`cordis.patch.yml`）并自动写入 `dsh.profile.bundles` 完成挂载——不修改 DSH 源码，插件作为独立包被 profile 引用。

### 本地开发

```sh
npm run build          # 生成 lib/（host 半 + 浏览器 bundle）
dsh plugin --profile web add "file:$(pwd)"
```

更新：修改 `src/` 后重新 `npm run build`，再执行一次上面的 `dsh plugin add`。

> 卸载：`dsh plugin --profile web remove dsh-plugin-chat-menu`。

### 动态插件（未发布 npm 时，快速使用 / 调试）

chat-menu 同时提供**动态 Cordis 插件**形态（`dynamic/` 目录，由构建生成）：

```sh
npm run build          # 生成 lib/ 与 dynamic/
```

1. `cordis_define`：`idPrefix: atfile`；`code.host` / `code.client` 分别取 `dynamic/host.js` / `dynamic/client.js` 的函数体；
2. `cordis_run`：首次 `run` 激活（浏览器半首次需批准），改版 `update` 同一 pluginId。

> ⚠️ 动态插件随 DSH 进程重启而清空，重启后需重新装载。**同一时间只装一种形态**：动态版与 bundle 版都会注册 `@` 文件菜单，同时运行会出现两个菜单——装 bundle 版就不要加载动态版（反之亦然）。

## 🧬 单一源码保证

两种形态（bundle 版与动态版）**由同一份 TypeScript 源码构建生成**，不存在两份手工维护的副本：

```
src/
├── core/                  # 共享核心（唯一逻辑来源，零环境依赖）
│   ├── host-core.ts       #   目录列举逻辑（服务注入；bundle 路由与动态桥共用）
│   └── menu-core.ts       #   @ 菜单 UI（React/RPC 注入；含 buildApply）
└── host/
    ├── bundle.ts          #   bundle Host 装配（webServer 路由 + 信任栅栏）
    └── dynamic.ts         #   动态 Host 装配（harness.handle 桥）
```

`npm run build`（`scripts/build.mjs`，esbuild）从这些源文件产出两种安装形态：

- `lib/` → **bundle 版**（`dsh plugin add`）：`index.js`（ESM Host）+ `client.js` / `client-registry.js`（module-loader factory）
- `dynamic/` → **动态版**（`cordis_define`）：`host.js` / `client.js`（函数体，核心内联）

两者只差「安装方式 + 注册周期 + 传输通道」（HTTP 路由 ↔ `harness.handle`/`host.call`），**业务逻辑与 UI 全部来自同一份 `src/core/`**。改逻辑只需改 `src/`，再 `npm run build` 两种形态同步更新。

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
├── package.json         # npm 包清单（devDeps: typescript/esbuild；dsh.bundle.patch / dsh.client）
├── tsconfig.json        # TypeScript 配置（npm run typecheck）
├── dsh.plugin.json      # 插件注册表清单（id / client.main）
├── cordis.patch.yml     # bundle 挂载补丁（dsh plugin add 自动注册）
├── src/                 # ★ 单一 TypeScript 源码
│   ├── core/            #   共享核心（host-core.ts 列举逻辑 / menu-core.ts 菜单 UI）
│   └── host/            #   装配（bundle.ts 路由 / dynamic.ts 动态桥）
├── dynamic/             # 构建产物（npm run build 生成，不入库）：动态函数体
├── scripts/
│   ├── build.mjs        #   esbuild 单一源码 → lib/ + dynamic/（两种形态）
│   ├── install.sh       #   一键安装（macOS / Linux / Git Bash）
│   └── install.ps1      #   一键安装（Windows PowerShell）
└── lib/                 # 构建产物（npm run build 生成，不入库）：bundle 版
    ├── index.js
    ├── client.js
    └── client-registry.js
```

- `src/core/host-core.ts` — 入参 `{ sessionId, path, filter }`：`path` 逐段解析真实目录（先精确、后忽略大小写），`filter` 名称过滤；工作目录取会话 `header.cwd`，缺失回退 `sandboxPolicy.workspaceRoot`。
- `src/core/menu-core.ts` — `@token` 检测复用内置触发器词边界规则；菜单的打开/关闭只由**草稿文本变化**驱动，`ESC` 关闭后光标/keyup/点击不会把它弹回；选中后经 `inputActions.setDraft` 替换 token。

## 📝 License

[MIT](./LICENSE)
