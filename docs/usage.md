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

工具箱入口位于页面顶部角色信息区域，多数功能也能从对应页面直接打开。

## 角色与队伍名片

把角色、队伍或配装生成 PNG 名片，支持下载或复制。

## 技能升级计算器

估算升级技能所需的技能书和金币，可加入购物车。

## 房屋升级材料计算器

统计房屋升级材料和成本，支持导出和加入购物车。

## 战斗升级计算器

按职业、等级和经验规划升级耗时与预计完成时间。

## 装备提升计算器

比较两件装备的属性、价格差和模拟伤害。

## 地下城收益计算器

估算地下城每日和每车收益，支持批量对比多个地下城。

## 迷宫补充补给

把缺少的迷宫道具加入购物车。

## 市场加入购物车

把当前查看的市场物品加入购物车。

## 订阅通知

行动队列任务完成、新任务开始或长时间未完成时，推送通知到钉钉、企业微信或飞书机器人。

## 切换角色

调用游戏原生入口切换角色。

## 利润网与战斗配装

在游戏、利润网和战斗模拟器之间复制或同步配装。

## 战斗模拟器一键导入

一键把当前角色与队伍数据填入模拟器。

## MWI 市场伴侣剪贴板导入

从剪贴板批量解析物品并加入购物车。

以上加入购物车的功能都只加购、不自动下单。

---

# MWI Sunrishe Toolkit User Guide

MWI Sunrishe Toolkit is a multi-purpose helper for Milky Way Idle, providing character cards, upgrade planning, equipment comparison, dungeon profit estimates, loadout sync, and MWI Market Mate enhancements. The interface follows the game language.

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

The Toolkit entry is in the top character-info area; most features can also be opened from their related pages.

## Character and Party Cards

Generate character, party, or loadout cards as PNG images, with download or image copy.

## Ability Upgrade Calculator

Estimate the ability books and coins needed, with cart support.

## House Upgrade Material Calculator

Calculate upgrade materials and costs, with export and cart support.

## Combat Upgrade Calculator

Plan training duration and completion time by profession, level, and XP rate.

## Equipment Comparison

Compare two items by stats, price difference, and simulated DPS.

## Dungeon Profit Calculator

Estimate daily and per-run profit, with batch comparison across multiple dungeons.

## Labyrinth Restock Supplies

Add missing labyrinth supplies to the cart.

## Marketplace Add to Cart

Add the currently viewed market item to the cart.

## Subscription Notifications

Push action queue task updates to a DingTalk, WeCom, or Feishu bot.

## Switch Character

Open the game's native character switch entry.

## Profit-Site and Combat Loadout Data

Copy or sync loadouts between the game, profit sites, and the combat simulator.

## One-Click Combat Simulator Import

Fill the simulator with your current character and party data.

## MWI Market Mate Clipboard Import

Parse item lists from the clipboard and add them to the cart.

Cart features only add items and never place orders.
