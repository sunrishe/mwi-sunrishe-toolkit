# Playwright MCP 使用规范

本文规定 MST 功能的浏览器验证方式：识别 Playwright MCP 服务，用它的 `browser_*` 工具在真实游戏页面完成验证并记录结果。执行 Playwright MCP 验证前先通读本文。

## 一、识别与确认

- 本项目认可的 Playwright MCP 是 MCP 服务列表中的**官方 Playwright MCP 服务器**（`@playwright/mcp`），其工具功能名全部是 `browser_*`。在 MCP 服务（或工具）列表中按关键字“Playwright”查找，确认存在 `browser_*` 工具即可；工具前缀由客户端决定，随客户端不同。
- 工具集随官方版本增减，以当前会话实际暴露的工具与参数描述为准；工具列表不完整时先调用工具发现/列出能力。
- 只有实际调用过 Playwright MCP 的 `browser_*` 工具，交付说明才能写“Playwright MCP 已验证”；Browser plugin / Browser skill、Node REPL 浏览器控制、`playwright-cli` 等不算 MCP 验证。

## 二、工具速查

调用时使用客户端暴露的完整工具名（前缀 + 功能名）。

| 用途         | 工具                                                                              | 用法要点                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 导航与标签页 | `browser_navigate`、`browser_navigate_back`、`browser_tabs`                       | `browser_tabs` 支持 `list`（确认当前页）、`new(url)`（开新页）、`select`/`close`                                                                         |
| 定位元素     | `browser_snapshot`、`browser_find`                                                | 页面大时先用 `browser_find` 按文本/正则搜索拿 `ref`，再用 `browser_snapshot`（`target`/`depth` 限定范围）确认；`target` 支持快照 `ref` 或唯一 CSS 选择器 |
| 点击与交互   | `browser_click`、`browser_drag`、`browser_hover`                                  | 用元素 `ref` 或唯一选择器点击，支持双击与修饰键                                                                                                          |
| 输入与表单   | `browser_fill_form`、`browser_type`、`browser_press_key`、`browser_select_option` | 批量填表用 `fill_form`；逐字输入用 `type`；快捷键用 `press_key`；下拉选择用 `select_option`                                                              |
| 页面状态     | `browser_evaluate`                                                                | 在页面上下文执行 JS，用于读取状态和就绪轮询；真实交互用上表工具完成                                                                                      |
| 等待与弹窗   | `browser_wait_for`、`browser_handle_dialog`                                       | 按文本出现/消失（`text`/`textGone`）等待；页面原生 alert/confirm 用 `handle_dialog` 处理                                                                 |
| 诊断         | `browser_console_messages`、`browser_network_requests`、`browser_network_request` | 控制台从 `level=error` 起查；网络请求用于核对脚本/资源加载                                                                                               |
| 视觉         | `browser_take_screenshot`、`browser_resize`                                       | 截图作视觉补充，结束时留证                                                                                                                               |
| 其他         | `browser_close`、`browser_file_upload`、`browser_drop`                            | 关闭页面、文件上传等，按需使用                                                                                                                           |

验证只使用上表工具；`browser_run_code_unsafe` 在 Node 进程执行任意代码（等价 RCE），不属于验证工具。

## 三、进入游戏页

1. 用 `browser_navigate` 打开 `https://www.milkywayidle.com/`（或 `browser_tabs new(url)`），打开后核对当前页标题与内容，确认导航成功。
2. 用 `browser_snapshot`/`browser_click` 依次走“进入游戏”→ 角色列表 → 默认选第一个角色进入游戏。
3. 进入游戏后第一步关闭“欢迎回来”（离线进度）弹窗：定位弹窗容器 `[class*="OfflineProgressModal"]` 后点击其内部第一个 `button`；每次整页刷新都可能重新弹出。
4. 以进入游戏内页面为准记录覆盖范围；停在首页或角色选择页时如实记录。
5. 调试脚本：MST 脚本通过 Tampermonkey 调试壳加载。文件版调试壳（`dist/MST-local-debug.user.js`）`file://` 引入无缓存，重新构建后刷新游戏页即加载最新脚本；HTTP 版调试壳（`dist/MST-http-debug.user.js`，`@require http://127.0.0.1:5173/...?v=<时间戳>`，需 watch 服务在线）有缓存，每次构建后重新导入调试壳（新时间戳 URL）。需要核实实际加载版本时，用 `browser_network_requests`/`browser_network_request` 核对请求 URL 与响应体版本。

## 四、就绪检查

加载后按下列判据确认就绪。全部用 `browser_evaluate` 内联轮询（每 0.5~1 秒一次，单次调用 20 秒超时）。

| 状态           | 判据                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 游戏页就绪     | `document.title !== '加载中'`                                                                                                                                                                                   |
| MST 初始化完成 | `window.MWISunrisheToolkitState === '期望版本'`（字段从 `loading` → `app-styles`/`app-features` 推进到构建版本号；期望版本：dev 读 `dist/mst.script.dev.user.js` 头部 `@version`，prod 读 `package.json` 版本） |
| 功能级就绪     | 目标 DOM 注入结果，如头像菜单 `[class*="Header_avatarMenu"]` 出现后 1~2 秒内出现 `.mst-avatar-toolkit-btn`                                                                                                      |

字段由 MST 写入页面 window（`unsafeWindow`）——油猴沙箱的 `window` 与页面 `window` 是两个对象，写入对象不得改回沙箱 `window`，否则页面轮询不到会一直误判脚本未加载。

轮询示例：

```js
() =>
  new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const gameReady = document.title !== '加载中';
      const mstReady = window.MWISunrisheToolkitState === EXPECTED_VERSION;
      if ((gameReady && mstReady) || Date.now() - start > 20000) {
        clearInterval(timer);
        resolve({gameReady, mstReady, state: window.MWISunrisheToolkitState});
      }
    }, 500);
  });
```

版本不符或超时 → `browser_navigate` 刷新后重新轮询，最多 5 次。就绪后按“关弹窗 → 展开/点击目标入口 → 验证 DOM 注入与交互结果”的顺序操作；就绪等待统一用上面的轮询。

## 五、验证与交付

- 核心流程用真实交互（`browser_click`/`browser_type` 等）操作；读状态用 `browser_evaluate` 并说明读取目标与原因；结束时 `browser_console_messages` 从 `error` 起检查控制台，必要时用 network 工具核对脚本/资源加载，最后截图留证。
- 未登录首页、本地预览、静态 Mock 只能作为补充验证单独记录；环境限制无法进入实际游戏页时，记录“实际页面未覆盖”及原因。验证只在真实目标页面执行。

交付记录：

```text
Playwright MCP：
- 服务识别：在 MCP 服务列表中按“Playwright”找到的官方 Playwright MCP 服务器
- 工具：<客户端前缀>_browser_tabs / <客户端前缀>_browser_navigate / ...（写本次实际用到的完整工具名；用过 browser_evaluate 时注明读取目标和原因）
- 页面：实际登录游戏页 / 未登录首页 / 本地预览 / 静态 Mock
- 覆盖：检查了哪些核心流程、页面显示和控制台错误
- 未覆盖：原因和风险
```

## 六、官方文档

- Playwright MCP 入门：`https://playwright.dev/docs/getting-started-mcp`
- 标签页工具：`https://playwright.dev/mcp/tools/tabs`
- 控制台工具：`https://playwright.dev/mcp/tools/console`
- 其余工具没有独立文档页，以当前会话 MCP 实际暴露的工具与参数描述为准。
