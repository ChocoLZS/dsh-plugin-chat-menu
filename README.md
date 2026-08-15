# dsh-plugin-chat-menu

DSH（DeepSeek Harness）动态 Cordis 插件：在会话输入框输入 `@` 呼出**工作目录文件浏览菜单**——搜索、逐级深入、多格式 snippet 引用。

属于 `dsh-plugin-*` 插件仓库族（本仓库 = 本地母目录 `dsh-plugins/` 下的一个插件子目录，约定见 [`AGENTS.md`](AGENTS.md)）。

## 功能

- 输入 `@` 呼出浮层菜单，列出工作目录下的子目录与文件（目录在前）
- **搜索框**：按文件/目录名过滤当前层，命中不足时自动在工作目录内**递归搜索**（预算上限，大目录不卡顿）
- **层级深浅**：`→` 进入高亮目录、`←` 返回上一级；点击目录项或面包屑同样逐级深入
- `↑` / `↓` 移动高亮，`Enter` 或点击选中，`ESC` 取消（关闭后只有继续打字才会重新呼出）
- **Snippets**：底部引用栏用 `Tab` 切换、`Enter` 插入，也可直接点击：
  - 目录：`进入`（`@目录/`）、`路径`、`代码`（反引号）、`链接`（Markdown）
  - 文件：`路径`、`引用`（`@路径`）、`代码`（反引号）、`链接`（Markdown）

## 结构

```
dsh-plugin-chat-menu/
├── README.md            # 本仓库说明
├── AGENTS.md            # dsh-plugin-* 仓库族约定（agent 必读）
├── host.js              # Host 半：fsmenu/list RPC（目录解析、名称过滤、递归搜索）
└── client.js            # 浏览器半：conversation.input.overlay 自绘浮层
```

## 装载

本插件是 DSH 的动态 Cordis 插件，通过会话内的动态插件工具装载：

1. `cordis_define`：`idPrefix: atfile`，`code.host` / `code.client` 分别取 `host.js` / `client.js` 的函数体；
2. `cordis_run`：首次 `run`，改版后用 `update` 更新同一 pluginId。

升级流程：修改源码 → `cordis_define` 追加新 Package → `cordis_run update`。

## 工作目录来源

Host 半取当前会话 `header.cwd` 作为工作目录根，缺失时回退 `sandboxPolicy.workspaceRoot`；因此菜单内容跟随当前会话所在目录。
