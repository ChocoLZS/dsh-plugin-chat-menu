# chat-menu 动态插件形态

`host.js` / `client.js` 是 chat-menu 的**动态 Cordis 插件**函数体形态：不依赖 npm 发布，通过会话内的动态插件工具即可装载运行（适合未发布 npm 时快速使用 / 调试）。

> ⚠️ **同一时间只装一种形态**：动态插件与 bundle 插件（`dsh plugin add`）都注册 `@` 文件菜单。动态版注册 overlay id `at-file-menu`、bundle 版注册 `chat-menu`——如果两者同时运行，输入 `@` 会出现两个菜单。请二选一：装了 bundle 版就不要加载动态版（反之亦然）。

## 装载

1. `cordis_define`：
   - `idPrefix: atfile`
   - `code.host` 取 `host.js` 的函数体（即整个文件内容）
   - `code.client` 取 `client.js` 的函数体
2. `cordis_run`：首次 `run`（浏览器半首次需批准），改版 `update` 同一 pluginId。

> 动态插件随 DSH 进程重启而清空，重启后需重新装载；源码即本目录。

## 与 bundle 版的差异

| | 动态版（本目录） | bundle 版（`src/`） |
| --- | --- | --- |
| 装载 | `cordis_define` + `cordis_run`（会话内） | `dsh plugin --profile web add dsh-plugin-chat-menu` |
| 生命周期 | 进程内，重启即失 | profile 持久，随启动自动挂载 |
| Host RPC | `harness.handle`（动态桥） | `/chat-menu/list` webServer 路由 |
| 浏览器半 | 闭包符号（React/styles/host） | module-loader bundle（require('react') + fetch） |
| 适用 | 未发布 npm / 临时调试 | 正式安装、多机器分发 |
