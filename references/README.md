# 参考资料目录

本目录统一存放 MST 开发、回归测试和算法核对用到的外部来源资料。

## 目录说明

- `game-data/init_character_data.json`：游戏网站返回的当前用户数据，对应 WebSocket 的 `init_character_data`。
- `game-data/init_client_data.json`：游戏网站返回的基础数据，对应 WebSocket 的 `init_client_data`。
- `game-source/www.milkywayidle.com/`：从游戏网站下载下来的前端源码。
- `legacy-scripts/eds/`：MST 融合前的 EDS 原始脚本，用于兼容逻辑和历史版本核对。
- `legacy-scripts/mst/`：MST 历史基准脚本和备份脚本，仅用于核对，不参与构建。
- `external-tools/mwi-tool/`：旧版配装与价格计算工具，当前用于方案和市场数据核对。
- `vendor/sweetalert2-themes/`：第三方 SweetAlert2 主题样式素材，后续抽离 CSS 时可参考。
- `combat-simulator/MWICombatSimulatorTest/`：装备提升模拟所参考的战斗模拟器构建产物。

## 使用约定

- 业务代码不直接依赖本目录文件，运行时数据仍来自游戏页面和 WebSocket。
- 自动测试可以读取本目录，避免依赖开发者机器上的外部路径。
- 更新参考资料时，应同时更新相关测试和文档中说明的来源路径。
