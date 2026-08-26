# Playwright MCP 使用规范

本文档用于避免把普通浏览器控制、Browser plugin、Node REPL 或 `playwright-cli` 误写成 Playwright MCP 验证。凡是本项目需要执行 Playwright MCP 浏览器验证，使用前必须先阅读本文。

## 一、硬性定义

- 本项目认可的 Playwright MCP：指 MCP 服务中实际暴露的**官方 Playwright MCP 服务器**（`@playwright/mcp`）。它的工具集固定包含 `browser_tabs`、`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_fill_form`、`browser_console_messages` 等 `browser_*` 工具。
- **识别方式：在 MCP 服务列表或工具列表中按关键字“Playwright”查找**，找到后确认该服务是否提供上述 `browser_*` 工具，而不是按工具名的固定前缀匹配。
- 工具名的前缀由 AI 客户端决定且各不相同（例如 `mcp__playwright__browser_*`、`playwright-u6_browser_*`、`mcp__playwright-u6__browser_*`）。切换 AI 工具后前缀会变化，因此**不得以 `mcp__playwright__` 前缀作为 Playwright MCP 的识别依据**；找不到该前缀不代表没有 Playwright MCP，先到 MCP 服务列表里搜“Playwright”。
- Browser plugin / Browser skill 内置 Playwright、Node REPL 浏览器控制、`playwright-cli`、本地脚本启动浏览器，都不能替代 Playwright MCP。
- 交付说明中只有实际使用过 Playwright MCP 服务的 `browser_*` 工具，才能写“Playwright MCP 已验证”；记录时写清本次实际用到的工具完整名称（含客户端前缀）。
- 如果只打开了未登录首页、本地预览页、静态 Mock 或测试夹具，必须单独标记为补充验证，不能写成登录后的实际目标页面已通过。
- **禁止自行编写临时 HTML/预览页面来模拟游戏页面或弹窗充当代码改动的验证手段**——即使是“补充验证”也不允许；MST 功能验证只能针对真实目标页面执行，本地静态夹具无法代表油猴注入、宿主样式竞争和数据链路的真实环境。
- 如果登录状态、外部服务或环境限制导致无法进入实际游戏页面，必须写清楚“实际页面未覆盖”和原因，不能默认视为通过。

## 二、使用前检查

1. 在 MCP 服务列表（或工具列表）中搜索关键字“Playwright”，确认当前会话是否暴露了 Playwright MCP 服务器。
2. 以客户端实际暴露的工具名称为准：不同客户端前缀不同（如 `mcp__playwright__browser_*`、`playwright-u6_browser_*`、`mcp__playwright-u6__browser_*`），但工具功能名始终是 `browser_tabs`、`browser_navigate`、`browser_snapshot` 等。
3. 如果工具列表没有直接显示完整工具，先调用工具发现/列出能力，确认存在 `browser_tabs`、`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_fill_form`、`browser_console_messages`。
4. 看到扩展连接页、空白页或未登录首页时，不要立刻判定阻塞；应先检查是否有 `browser_tabs` 和 `browser_navigate`。
5. 只要存在 `browser_navigate` 或 `browser_tabs new(url)`，就可以导航到目标地址。

## 三、推荐流程

下文用 `browser_*` 表示 Playwright MCP 工具，实际调用时使用客户端暴露的完整工具名（前缀随客户端不同）。

1. 使用 `browser_tabs` 执行 `list`，确认当前标签页。
2. 使用 `browser_tabs` 执行 `new` 并传入 URL，或使用 `browser_navigate` 导航到目标页面。
3. 使用 `browser_snapshot` 获取页面可访问性树，优先用 snapshot 中的 `ref` 定位元素。
4. 需要点击时使用 `browser_click`，不要基于截图猜坐标。
5. 需要填写表单时优先使用 `browser_fill_form`；需要触发逐字输入或快捷键行为时再用 `browser_type` / `browser_press_key`。
6. 需要读取页面状态时使用 `browser_evaluate`，但必须说明读取目标和原因，避免用它绕过真实交互验证。
7. 验证完成后使用 `browser_console_messages` 检查控制台错误。
8. 需要视觉证据时再使用 `browser_take_screenshot`。截图只能补充视觉检查，不能替代 snapshot 和真实交互。

## 四、进入银河奶牛游戏页面

1. 使用 `browser_navigate` 打开 `https://www.milkywayidle.com/`，或使用 `browser_tabs` 的 `new` 动作打开该 URL。
2. 该地址是游戏网站首页，不是登录后的游戏内页面；必须继续用 `browser_snapshot` 查找“进入游戏”按钮或等价入口。
3. 使用 `browser_click` 点击“进入游戏”入口。
4. 进入角色选择列表后，使用 `browser_snapshot` 查找角色列表；默认选择第一个角色进入游戏。
5. 进入游戏后再开始验证 MST 工具箱、战斗升级、地下城收益等实际功能。若停留在首页或角色选择页，不能记为实际游戏页验证通过。
6. 进入游戏后可能弹出“欢迎回来”（离线进度）弹窗，必须先把它的“关闭”按钮点掉再继续验证，否则后续点击会被该弹窗遮罩拦截（`browser_click` 会一直等待元素可点击直到超时）；找不到“关闭”按钮时先点弹窗内第一个按钮。该弹窗不是 MST 弹窗，不要误判为 MST 功能。
7. Playwright MCP 浏览器的油猴插件里，MST 脚本由用户手动引入了 debug-loca 本地文件：改动源码并重新构建后，刷新游戏页面即可加载最新脚本，无需重新安装；若刷新后样式或行为仍是旧版，先确认构建产物已更新，再等待片刻重新刷新，不要据此判定改动未生效，也不要改用自写临时页面代替验证。

## 五、常见错误

- 错误：工具列表里没有 `mcp__playwright__` 前缀，就说“没有 Playwright MCP”。
  - 正确：先在 MCP 服务/工具列表里搜“Playwright”关键字；工具前缀由客户端决定，切换 AI 工具后会变化。
- 错误：看到扩展连接页就说“没有导航工具”或“Playwright MCP 不能打开页面”。
  - 正确：先查 `browser_tabs` / `browser_navigate`，能导航就继续打开目标页面。
- 错误：用 Browser plugin、Node REPL 或 `playwright-cli` 操作页面后，在结果里写“Playwright MCP 已通过”。
  - 正确：这些只能写成非 MCP 辅助验证，不能顶替项目要求的 MCP 验证。
- 错误：只验证本地 Mock 或未登录首页，就写实际游戏页通过。
  - 正确：按验证对象分别记录，实际登录游戏页未覆盖时必须明说。
- 错误：真实页面验证遇到困难（登录、脚本版本、样式不符等）时，自己编写临时 HTML 页面模拟弹窗或功能来“完成验证”。
  - 正确：回到真实页面排查（确认构建产物已更新、按第四节刷新让 debug-loca 生效），确实无法覆盖时如实记录未覆盖原因，不得用自写页面顶替。
- 错误：只看截图，不检查可访问性树、交互结果和控制台错误。
  - 正确：snapshot、交互、控制台是核心验证；截图是补充。

## 六、交付记录模板

```text
Playwright MCP：
- 服务识别：在 MCP 服务列表中按“Playwright”找到的官方 Playwright MCP 服务器
- 工具：<客户端前缀>_browser_tabs / <客户端前缀>_browser_navigate / <客户端前缀>_browser_snapshot / ...（写本次实际用到的完整工具名）
- 页面：实际登录游戏页 / 未登录首页 / 本地预览 / 静态 Mock
- 覆盖：检查了哪些核心流程、页面显示、重复操作和控制台错误
- 未覆盖：如有登录状态或环境限制，写清楚原因和风险
```

## 七、官方文档入口

- Playwright MCP 入门：`https://playwright.dev/docs/getting-started-mcp`
- 标签页工具：`https://playwright.dev/mcp/tools/tabs`
- 导航工具：`https://playwright.dev/mcp/tools/navigate`
- Snapshot 工具：`https://playwright.dev/mcp/tools/snapshot`
- 控制台工具：`https://playwright.dev/mcp/tools/console`
