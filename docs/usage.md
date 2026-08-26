# MWI Sunrishe Toolkit 使用说明

MWI Sunrishe Toolkit 是《银河奶牛放置》的综合辅助工具，提供名片、升级规划、装备提升、地下城收益、配装同步和市场伴侣增强。界面语言跟随游戏设置。

## 鸣谢

MST 是独立脚本，以下项目提供了参考或公开接口；参考类功能不要求安装原脚本，也不是完整复刻。市场伴侣相关功能需要安装 MWI 市场伴侣。

| 项目                                                                                                                                                        | 说明                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **MWI 角色名片插件**，作者 **Windoge**。[脚本链接](https://greasyfork.org/zh-CN/scripts/543862)                                                             | 名片设计与实现参考。MST 已独立实现名片功能；同时安装可能重复入口，建议二选一。 |
| **MWI 市场伴侣**，作者 **ColaCola**。[原脚本链接](https://greasyfork.org/zh-CN/scripts/567386) · [当前脚本链接](https://greasyfork.org/scripts/589082)      | 使用其公开接口加入购物车；未安装时相关按钮隐藏。MST 只加购物车，不自动下单。   |
| **MWITools**，作者 **bot7420、shykai**。[MWITools](https://greasyfork.org/zh-CN/scripts/494467) · [原算法脚本](https://greasyfork.org/zh-CN/scripts/511240) | 战力打造分算法来源，原算法作者为 **Ratatatata**。MST 只实现名片所需算法。      |
| **MWI-Equipment-Diff**，作者 **BKN46**。[脚本链接](https://greasyfork.org/zh-CN/scripts/537282)                                                             | 装备属性对比参考。MST 独立实现装备提升计算器，不完整复刻原脚本。               |
| **MWI Combat Simulator**，作者 **shykai**。[项目链接](https://github.com/shykai/MWICombatSimulatorTest)                                                     | 每秒伤害（DPS）模拟算法来源。MST 内嵌所需核心，不提供完整模拟器界面。          |

## Sunrishe 工具箱

页面顶部角色信息区域会显示**工具箱**，是角色名片、升级计算、装备提升、地下城收益和切换角色等功能的主要入口。

## 角色与队伍名片

- **入口**：顶部角色名、工具箱、资料页、配装页、队伍区域。
- **功能**：生成角色、队伍或配装 PNG 名片，展示装备、技能、房屋、等级和战力打造分，支持下载或复制图片。

## 技能升级计算器

- **入口**：工具箱、技能页面、技能详情。
- **功能**：估算技能升级需要的技能书和金币，按左一/右一市场价显示成本，可配合市场伴侣加入购物车；从技能页打开时自动填入当前配装已装备的技能。

## 房屋升级材料计算器

- **入口**：工具箱、房屋页面。
- **功能**：统计房屋升级材料、金币、库存缺口和市场价值，支持导出 CSV，并可配合市场伴侣加入购物车。

## 战斗升级计算器

- **入口**：工具箱。
- **功能**：按职业、目标等级、经验速度和训练顺序，估算战斗升级耗时与预计完成时间。

## 装备提升计算器

- **入口**：工具箱。
- **功能**：比较同职业方案下两件装备的属性、价格差和模拟 DPS，查看每 10M 金币带来的提升。

## 地下城收益计算器

- **入口**：工具箱。
- **功能**：按地下城、难度、耗时、钥匙来源和市场价格，估算每日收益、每车收益、钥匙成本和宝箱产出，结果可在“收益结果”与“掉落物”之间切换；支持批量模拟，一次对比多个地下城的制作/购买钥匙成本和收益，参数自动保存。

## 迷宫补充补给

- **入口**：迷宫“进入迷宫”按钮上方。
- **功能**：悬浮“补充补给”按钮，选择 1~5 次入场，把缺少的迷宫道具和补给箱加入 MWITools 购物车；只加购，不自动下单。

## 市场加入购物车

- **入口**：市场“刷新”按钮右侧。
- **功能**：把市场当前查看的物品加入 MWITools 购物车，每次 1 个，查看强化等级订单时按该等级加购；只加购，不自动下单。

## 切换角色

- **入口**：工具箱。
- **功能**：调用游戏原生角色切换入口。

## 利润网与战斗配装

- **入口**：游戏配装页、战斗配装详情、支持的利润网页面。
- **功能**：在游戏、Milkonomy、hyhfish 和战斗模拟器之间复制或同步配装数据。

## 战斗模拟器一键导入

- **入口**：aiwwb 战斗模拟器页面“导入/导出”按钮下方。
- **功能**：一键把当前角色与队伍数据填入模拟器。

## MWI 市场伴侣剪贴板导入

- **入口**：MWI 市场伴侣清单面板。
- **功能**：从剪贴板批量解析物品名称、数量和强化等级，并加入市场伴侣购物车；不自动下单。

---

# MWI Sunrishe Toolkit User Guide

MWI Sunrishe Toolkit provides character cards, upgrade planning, equipment comparison, dungeon profit estimates, loadout sync, and MWI Market Mate enhancements. The interface follows the game language.

## Credits

MST is independent. The projects below provide references or public APIs; reference-based features do not require the original scripts and are not full reimplementations. Market Mate features require MWI Market Mate.

| Project                                                                                                                                                              | Notes                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **MWI Character Card** by **Windoge**. [Script](https://greasyfork.org/en/scripts/543862)                                                                            | Card design and implementation reference. MST implements its own card features; installing both may duplicate entries.           |
| **MWI Market Mate** by **ColaCola**. [Original script](https://greasyfork.org/en/scripts/567386) · [Current script](https://greasyfork.org/scripts/589082)           | Uses its public cart API. Buttons are hidden when it is unavailable. MST only adds cart items and never places orders.           |
| **MWITools** by **bot7420 and shykai**. [MWITools](https://greasyfork.org/en/scripts/494467) · [Original algorithm script](https://greasyfork.org/en/scripts/511240) | Combat Power Score source; the original algorithm is credited to **Ratatatata**. MST only implements the card score calculation. |
| **MWI-Equipment-Diff** by **BKN46**. [Script](https://greasyfork.org/en/scripts/537282)                                                                              | Equipment-stat comparison reference. MST's Equipment Comparison is independent and not a full clone.                             |
| **MWI Combat Simulator** by **shykai**. [Project](https://github.com/shykai/MWICombatSimulatorTest)                                                                  | DPS simulation source. MST embeds only the needed core and does not provide the full simulator UI.                               |

## Sunrishe Toolkit

Click **Toolkit** in the top character-info area. It is the main entry for cards, upgrade calculators, equipment comparison, dungeon profit, and character switching.

## Character and Party Cards

- **Entry**: top character name, Toolkit, profile pages, loadout pages, and party UI.
- **Does**: generates character, party, or loadout PNG cards with equipment, abilities, houses, levels, and Combat Power Score; supports download or image copy.

## Ability Upgrade Calculator

- **Entry**: Toolkit, ability pages, and ability details.
- **Does**: estimates required ability books and coins, shows Best Ask / Best Bid costs, and can add books to Market Mate carts. Opening it from the ability page prefills the abilities equipped in your current combat loadout.

## House Upgrade Material Calculator

- **Entry**: Toolkit and house pages.
- **Does**: calculates house upgrade materials, coins, inventory shortages, and market value; supports CSV export and Market Mate carts.

## Combat Upgrade Calculator

- **Entry**: Toolkit.
- **Does**: estimates combat training duration and finish time by profession, target level, XP rate, and training order.

## Equipment Comparison

- **Entry**: Toolkit.
- **Does**: compares two items under the same combat preset by stats, price difference, simulated DPS, and gain per 10M coins.

## Dungeon Profit Calculator

- **Entry**: Toolkit.
- **Does**: estimates daily profit, run profit, key costs, and chest output by dungeon, tier, run time, key source, and market prices. Switch between the Profit table and the Loot table, or use Batch Simulation to compare crafted/purchased key costs and expected profit across multiple dungeons at once. Parameters are saved automatically.

## Labyrinth Restock Supplies

- **Entry**: above the Labyrinth "Enter Labyrinth" button.
- **Does**: hovering the Restock Supplies button opens a small window to pick 1–5 entries and adds the missing supplies and crates to the MWITools cart. MST only adds to the cart and never places orders.

## Marketplace Add to Cart

- **Entry**: to the right of the Marketplace "Refresh" button.
- **Does**: adds the market item currently being viewed to the MWITools cart, one at a time, keeping the enhancement level of the order book being viewed. MST only adds to the cart and never places orders.

## Switch Character

- **Entry**: Toolkit.
- **Does**: opens the game's native character switch entry.

## Profit-Site and Combat Loadout Data

- **Entry**: game loadout pages, combat loadout details, and supported profit sites.
- **Does**: copies or syncs loadout data between the game, Milkonomy, hyhfish, and the combat simulator.

## One-Click Combat Simulator Import

- **Entry**: the aiwwb combat simulator page, below its "Import/Export" button.
- **Does**: fills your current character and party data into the simulator.

## MWI Market Mate Clipboard Import

- **Entry**: MWI Market Mate list panel.
- **Does**: parses item names, quantities, and enhancement levels from the clipboard, then adds them to the Market Mate cart; it never places orders.

---

# 更新日志

## 版本规划

- EDS 历史线保留 `1.x` 版本号，最后一个作为融合基础的版本是 `1.2.7`。
- MST 从 `2.0.0` 开始，表示从装备数据同步脚本升级为综合工具箱。
- 后续版本遵循语义化版本：不兼容变更提升主版本，向后兼容的新功能提升次版本，修复和兼容性调整提升补丁版本；开发构建使用 `-dev.<时间戳>` 后缀。

## v2.14.0

1. 地下城收益新增批量模拟：把多个地下城加入列表，每行单独设置难度、队伍人数、耗时和每日成本，一次对比制作/购买钥匙的每日成本和期望收益；参数修改后自动保存，可随时恢复默认。
2. 技能升级：从技能页面打开计算器时，自动填入当前战斗配装已装备的技能；技能书菜单里的计算器入口按钮与游戏其他操作按钮外观一致。
3. 地下城收益的“掉落物”页签外观改为与游戏页面页签一致。

## v2.13.0

1. 新增战斗模拟器一键导入：在 aiwwb 模拟器页面填入当前角色与队伍数据并刷新价格，队友数据来自游戏内点开过的资料。
2. 工具箱菜单新增“战斗模拟 aiwwb”入口（复用同一窗口）。
3. 修复与 MWITools 同时使用时其头部按钮被挤到居中排列的问题。

## v2.12.0

1. 地下城收益计算器增强：地下城下拉框增加 D1-D4 序号，方便对照游戏内地下城地图；结果区新增“掉落物”页签，按官方宝箱掉落物列表分普通、精炼宝箱逐条展示物品、掉率、期望数量和左一/右一价格，掉率和期望数量悬浮可查看详情，价格按市场报价税前计算。

## v2.11.1

1. 修复市场“加入购物车”按钮与“生产采集增强优化”等其他脚本同时启用时，提示“当前没有可加入购物车的市场物品”的问题。
2. 同时安装多份本脚本（如正式版与本地调试版）时，“加入购物车”按钮保持稳定出现，不再互相干扰。

## v2.11.0

1. 迷宫入口新增“补充补给”：在“进入迷宫”按钮上方提供补给按钮，鼠标悬浮时弹出小窗口选择 1~5 次入场，把缺少的火把、斗筜、探照灯和茶箱、咖啡箱、食物箱加入 MWITools 购物车（道具按页面配置与携带上限补足，补给箱按入场次数补足，页面未配置时按专家档位；只加入购物车，不自动下单）。
2. 市场新增“加入购物车”按钮：在市场“刷新”按钮右侧，点击把当前查看的物品加入 MWITools 购物车，每次 1 个；查看具体强化等级的订单时按该等级加入，未强化物品按 +0 加入（只加入购物车，不自动下单）。

## v2.10.2

1. 修复市场行情来源：市场数据改为始终按当前所在服务器读取（正式服、测试服、中文站各自读取本站行情），在带 www、不带 www 或测试服域名的页面打开时都能正确读取，不再依赖固定的域名跳转。

## v2.10.1

1. 战力打造分全面升级为着装评分：新增“启用着装评分”选项（默认勾选），评分与 MWITools 最新版保持一致并分战斗、生活两行展示（✦ 标识在文案前，悬浮提示可查看各项明细），市场行情按当前所在服务器读取；不勾选时保持原有的战力打造分。
2. 购物车功能切换到 MWITools：原“市场伴侣”插件已停用，技能书、房屋材料和剪贴板导入都改由 MWITools 购物车处理。
3. 地下城收益新增“收益扣除市场税”选项（默认勾选），可按需切换是否在卖出收益中扣除市场税（普通物品 5%，牛铃与牛铃袋 18%）；预期产出区新增每日普通宝箱和精炼宝箱产出两行；宝箱内物品缺价时不再以官方指导价兜底，更贴近实际挂单与成交。
4. 技能升级“添加技能”的选择窗口改为在计算器内部显示，技能以卡片列表呈现，不再全屏遮挡。
5. 市场技能书菜单新增“技能升级计算器”入口，点击后直接打开计算器并预填该技能。
6. 多个弹窗的下拉框、复选框边框与输入框同色，不再刺眼。
7. 装备提升计算器“职业方案”的中文名称与游戏官方保持一致：重盾、长枪。

## v2.9.3

1. 地下城收益按最新游戏规则调整市场税：卖出收入固定扣除 5% 市场税（原 2%），牛铃袋按 18% 特殊税率扣税。
2. 修复地下城收益中牛铃价值可能算成 0 的问题：牛铃袋缺价时按官方市场指导价估值，指导价也缺失时才按市场快照成交价兜底（约 107.5 万金币/袋），牛铃按十分之一折算，不再显示为 0。

## v2.9.1

1. 优化名片角色资料缓存：只保存名片展示所需的字段，缓存体积大幅缩小，超出上限或浏览器存储不足时自动清理最旧资料。

## v2.9.0

1. 地下城收益计算器新增队伍人数选项（1-5 人），宝箱数量按官方公式 `5 ÷ 队伍人数` 计算，默认 5 人时每车普通宝箱仍为 1.295 个，门票、钥匙和收益随人数自动调整。

## v2.8.3

1. 修复右上角工具箱入口布局；本地调试脚本新增文件版和网页版；地下城收益新增“披风不计算收益”并修复数量提前四舍五入导致的轻微偏差；战斗升级新增“使用当前战斗经验”；装备提升修复双手武器方案误叠副手导致伤害输出提升被高估的问题。

## v2.7.26

1. 优化脚本加载和浏览器兼容性，修复火狐浏览器下游戏连接、原生跳转、配装读取、游戏名称语言和油猴接口相关问题；装备提升中选择基准装备后，对比装备也会自动选中相同装备。

## v2.7.22

1. 优化技能和战斗升级输入体验，等级输入不会再显示多余的数字加减箭头。
2. 优化弹窗在小屏和手机浏览器下的位置，技能选择和工具箱菜单会尽量保持在当前可见区域内。

## v2.7.20

1. 从原 EDS 配装同步升级为 **MWI Sunrishe Toolkit**：保留 Milkonomy、hyhfish 和战斗模拟器相关复制/同步能力，并统一收进游戏顶部的工具箱入口。
2. 新增角色、队伍和配装名片：可读取当前角色、公开资料、队伍和配装数据，支持缓存角色、布局切换、图片下载与复制。
3. 新增技能、房屋和战斗升级计算器：可结合角色等级、经验、库存、市场价格和常用方案规划升级材料、技能书、耗时与预计完成时间。
4. 新增装备提升计算器：按职业方案比较两件装备的属性差异、模拟伤害输出、装备价格差和每 1000 万金币带来的提升。
5. 新增地下城收益计算器：按官方掉落表、当前市场价格、制作/购买钥匙、自定义买卖档位和每日药品饮料成本估算长期期望收益。
6. 增强 MWI 市场伴侣配合能力：支持剪贴板批量导入、房屋材料和技能书加入购物车，并保留“只加入购物车、不自动下单”的安全边界。
7. 优化整体使用体验：界面语言跟随游戏实时切换，弹窗提示、移动端显示、官方中文术语和市场价格方向已统一整理；中文里最佳出售价/最佳收购价按游戏习惯显示为左一/右一。

## EDS 历史版本

### v1.2.7

1. 新利润网（hyhfish 改版）支持同步披风。
2. 修复复制 Milkonomy 数据时遗漏个人成就增益的问题。

### v1.2.5

1. 增加对新利润网 `hyhfish.github.io/milkonomy` 的支持。

### v1.1.3

1. 战斗配装支持复制战斗模拟器格式的数据。
2. 避免在非游戏网站注入游戏界面样式。

### v1.0.2

1. 修复 Milkonomy 从未配置过方案时无法同步的问题。

### v1.0.1

1. 修复中文镜像站无法使用的问题。

### v1.0.0

1. 支持在游戏网站复制生活配装方案数据。
2. 支持在 Milkonomy 网站同步生活配装方案。
