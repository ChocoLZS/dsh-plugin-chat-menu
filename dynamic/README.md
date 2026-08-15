# chat-menu 动态插件形态

`host.js` / `client.js` 是 chat-menu 的**动态 Cordis 插件**函数体产物——**由 `npm run build` 从单一 TypeScript 源码生成**（`src/core/` + `src/host/dynamic.ts`），不是手工维护的副本。不依赖 npm 发布，通过会话内的动态插件工具即可装载运行（适合未发布 npm 时快速使用 / 调试）。

> ⚠️ **同一时间只装一种形态**：动态插件与 bundle 插件（`dsh plugin add`）都向 `inputTriggers` 注册 `@文件` 源——如果两者同时运行，source 重复注册会冲突（注册已做幂等，但只保留一个生效）。请二选一。

## 生成

```sh
npm run build     # 仓库根目录执行，产出 lib/ 与 dynamic/
```

## 装载

1. `cordis_define`：
   - `idPrefix: atfile`
   - `code.host` 取 `host.js` 的函数体（即整个文件内容）
   - `code.client` 取 `client.js` 的函数体
2. `cordis_run`：首次 `run`（浏览器半首次需批准），改版 `update` 同一 pluginId。

> 动态插件随 DSH 进程重启而清空，重启后需重新装载。

## 与 bundle 版的差异（仅安装方式 / 注册周期 / 传输通道）

| | 动态版（本目录） | bundle 版（`lib/`） |
| --- | --- | --- |
| 装载 | `cordis_define` + `cordis_run`（会话内） | `dsh plugin --profile web add dsh-plugin-chat-menu` |
| 生命周期 | 进程内，重启即失 | profile 持久，随启动自动挂载 |
| Host RPC | `harness.handle`（动态桥） | `/chat-menu/list` webServer 路由 |
| 浏览器半 | 闭包符号（host）+ `host.call` | module-loader bundle（fetch `/chat-menu/list`） |
| 适用 | 未发布 npm / 临时调试 | 正式安装、多机器分发 |

业务逻辑两者共用同一份 `src/core/`；`@` 菜单由 DSH 内置 `inputTriggers` 管线渲染（见仓库根 README「🧬 单一源码保证」）。
