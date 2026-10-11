# 参考资料目录

本目录统一存放 MST 开发、回归测试和算法核对用到的外部来源资料。

## 目录说明

- `game-data/init_character_data.json`：游戏网站返回的当前用户数据，对应 WebSocket 的 `init_character_data`（2026-08-15 更新）。
- `game-data/init_client_data.json`：游戏网站返回的基础数据，对应 WebSocket 的 `init_client_data`（游戏版本 `v1.20260927.0`，2026-10-11 更新）。
- `game-data/marketplace.json`：官方 `game_data/marketplace.json` 市场数据样例，含左一/最近成交/右一价（`a`/`p`/`b`）与成交量（`v`），供市场口径核对。
- `game-source/www.milkywayidle.com_v1.20260927.0/`：从游戏网站下载下来的前端源码（当前版本）。核对官方行为一律使用本版本；旧版本 `v1.20260814.0`、`v1.20260715.0` 已废弃并移除，不要引用，需要时从 git 历史取用或重新下载。
- `legacy-scripts/eds/`：MST 融合前的 EDS 原始脚本，用于兼容逻辑和历史版本核对。
- `legacy-scripts/mst/`：MST 历史基准脚本和备份脚本，仅用于核对，不参与构建。
- `legacy-scripts/地牢计算器/`：旧版地下城收益计算脚本归档，用于地下城收益算法和数值口径核对。
- `external-tools/mwi-tool/`：旧版配装与价格计算工具，当前用于方案和市场数据核对。
- `vendor/sweetalert2-themes/`：第三方 SweetAlert2 主题样式素材，后续抽离 CSS 时可参考。
- `combat-simulator/MWICombatSimulatorTest/`：装备提升模拟所参考的战斗模拟器构建产物。
- `game-faq/milkywayidle-faq.md`：《银河牛奶放置》常见问题解答手册全文（飞书公开文档，2026-08-19 抓取），含市场/强化/炼金/效率等游戏规则原文。
- `game-faq/milkywayidle-faq-calc.md`：上述手册中与计算、公式、收益、掉落等数值规则相关的摘录，供数值算法核对。
- `game-faq/milkywayidle-faq-effective.md`：整理后的有效信息（含公式与数值规则，市场税率已更正为 4%），供 MST 数值与收益评估快速查阅。

## 使用约定

- 业务代码不直接依赖本目录文件，运行时数据仍来自游戏页面和 WebSocket。
- 自动测试可以读取本目录，避免依赖开发者机器上的外部路径。
- 核对游戏源码时以 `static/js/main.*.chunk.js` 中的实际引用为准：`asset-manifest.json` 与 media 目录、JS 引用可能不一致，不要用它判断资源路径。
- 更新参考资料时，应同时更新相关测试和文档中说明的来源路径。
