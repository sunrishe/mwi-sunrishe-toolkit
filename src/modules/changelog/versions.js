// 更新日志数据：与 docs/changelog.md 保持同步（版本、顺序、中文说明逐条一致，测试会校验）。
// 发布日期取自 GreasyFork 发布记录（脚本 574037）；`legacy: true` 表示 MST 融合前的 EDS 历史线。
// 版本说明只写用户可感知的变化，更新版本时先改 docs/changelog.md，再同步这里并补英文。
export const CHANGELOG_VERSIONS = [
  {
    version: '2.21.0',
    date: '2026-10-13',
    notes: [
      {
        zh: '战斗升级计算器：导航栏里悬浮「战斗」或战斗技能，可以直接看到本场的经验速率、升级所需时间和预计升级时间；「战斗」项按本场有经验的技能逐个列出。',
        en: "Combat Upgrade Calculator: hovering the Combat nav entry or a combat skill shows this battle's XP rate, the time needed to level up, and the expected level-up time; the Combat entry lists each skill that gained XP in this battle."
      }, {
        zh: '战斗升级计算器：战斗的「交战」界面里悬浮队伍中的玩家，可以用该玩家的等级与本场经验打开计算器，队友的等级取自已查看过的名片。',
        en: "Combat Upgrade Calculator: hovering a party member in the battle screen opens the calculator with that player's levels and this battle's XP, and a teammate's levels come from the profile you have viewed."
      }, {
        zh: '战斗升级计算器：战斗开始不足 1 分钟时不再估算升级时间，悬浮和自动填入都会说明数据不足；悬浮显示的时间在停留期间固定不变。',
        en: 'Combat Upgrade Calculator: no level-up time estimate during the first minute of a battle — hovering and auto-fill both explain that there is not enough data; the times shown while hovering stay fixed during one hover.'
      }, {
        zh: '队伍名片：队伍面板里的「队伍名片」按钮改为橙色高亮，与旁边的游戏原生按钮区分开。',
        en: "Party Card: the Party Card button in the party panel is now highlighted in orange so it stands out from the game's own buttons beside it."
      }
    ]
  }, {
    version: '2.20.1',
    date: '2026-10-12',
    notes: [
      {
        zh: '修复：市场交易记录里按挂牌价成交的订单被打上星号、收入被算高的问题（官方按每件向上取整收税，之前把这项取整当成了成交价与挂牌价不一致）；现在只有官方税费确实证明成交价与挂牌价不同的订单才显示星号。',
        en: 'Fix: orders filled at their listing price were marked with an asterisk and their income was inflated (the game rounds tax up per item, which was mistaken for a price difference); now the asterisk only appears when the official tax truly proves the fill price differed from the listing price.'
      }
    ]
  }, {
    version: '2.20.0',
    date: '2026-10-12',
    notes: [
      {
        zh: '市场交易记录：订单成交时即计入收入 / 支出，不再显示“待领取”，旧记录里未领取的部分会自动计入。',
        en: 'Market History: an order counts toward income/expense as soon as it fills — "Pending" is no longer shown, and uncollected parts in old records are counted in automatically.'
      }, {
        zh: '市场交易记录：打开游戏页后立刻发生的成交与领取不再漏记；登录时补记的订单会归入正确的服务器并补全金额，测试服与正式服不再混在一起。',
        en: 'Market History: fills and collections right after you open the game are no longer missed; orders picked up at login go to the correct server and have their amounts filled in, so test-server and live records no longer mix.'
      }, {
        zh: '市场交易记录：“管理”页签新增“数据修复”，可一键修复重复、状态或金额异常的记录，修复前可先备份。',
        en: 'Market History: the Manage tab gains "Data repair" — fix duplicate orders and records with a wrong status or amount in one click; export a backup first if you want to be safe.'
      }, {
        zh: '市场交易记录：“管理”页签的导入内容关闭弹窗即清空，不再跨次保留。',
        en: 'Market History: import content in the Manage tab is cleared when the dialog closes instead of being kept for next time.'
      }, {
        zh: '市场交易记录：区间价订单的收入改按真实成交额显示，列表“金额”列旁的星号提示挂牌价与实际成交价不一致。',
        en: 'Market History: range-priced orders now show income based on the real traded amount, and an asterisk next to the Amount column marks rows where the listing price differs from the traded price.'
      },
      {
        zh: '市场交易记录：没等到官方数据的“立即购买 / 立即出售”记录标为“未确认”，可按状态筛选。',
        en: 'Market History: "Buy now / Sell now" records still waiting for official data are marked "Unconfirmed" and can be filtered by status.'
      }, {
        zh: '市场交易记录：市场里点开物品的挂牌页，在“+ 新出售挂牌 / + 新购买挂牌”按钮上方显示自己最近两次出售 / 收购的成交单价；列表“单价”列与统计页“加权均价”列也改用市场里的价格写法。',
        en: 'Market History: on the item listing page, your two most recent sell and buy unit prices appear above the Sell Listing / Buy Listing buttons; the Unit Price column and the stats Weighted Price column now use the same format as prices in the market.'
      }, {
        zh: '修复：从技能升级计算器跳转市场物品时，订单簿可能一直停在“正在加载”。',
        en: 'Fixed: jumping from the ability upgrade calculator to a market item could leave the order book stuck on "Loading".'
      }
    ]
  }, {
    version: '2.19.0',
    date: '2026-10-11',
    notes: [
      {
        zh: '新增“市场交易记录”：自动记录自己的挂牌、成交、取消、过期和立即购买 / 立即出售订单，入口在市场“商品列表 / 我的挂牌”旁边，也能从工具箱打开。支持搜索、筛选、排序、分页与批量删除，底部给出成交数量、收入与支出的本页合计与筛选总计；记录可导出导入，多台设备各自记录的部分会按订单合并成一条完整记录。“统计”页签用独立筛选查看时间范围、方向、分类与物品关键词，总览给出笔数、成交数量、收入、支出与净收支，另有收支趋势、物品排行、分类构成和记录构成四张图表，“按物品汇总”把出售金额与购买金额分列；“帮助”页签写明“食用工具”桥接脚本的接入方法，可把它的历史市场订单导入，也能把记录导回食用工具。记录显示官方创建时间、过期时间与税费；缺少官方到账数据的历史记录会按成交当时的市场税率推算并在悬浮提示里说明——出售扣税，购买不扣税。',
        en: 'New Market History: automatically records your listings, fills, cancellations, expirations, and instant buy/sell orders; open it next to the market listings tabs or from the Toolkit. Records support search, filters, sorting, paging, and bulk delete, the footer shows this-page and filtered totals of filled quantity, income, and expense, and records can be exported or imported — parts recorded on different devices merge into one complete record per order. The Stats tab has its own filters by time range, direction, category, and item keyword, with an overview of records, filled quantity, income, expense, and net, plus four charts (income and expense over time, top items, category breakdown, record breakdown) and a by-item table that lists sell and buy amounts in separate columns; the Help tab explains how to add the Edible Tools bridge script, which can import its order history and export records back. Records show the official created time, expiration time, and tax taken; records without official collection data are estimated with the market tax rate at the time of the sale and labeled in the tooltip — sells are taxed, buys are not.'
      }, {
        zh: '角色名片：评分随布局显示——战斗布局只显示战斗评分、生活布局只显示生活评分，选“全部”才同时显示两个，只剩一个评分时靠下摆放；装备与生活工具的等级角标改为游戏里的需求等级，项链、戒指、耳环和任务徽章没有等级要求，仍显示物品等级。',
        en: 'Character Cards: the score rows follow the layout — the combat layout shows only the combat score, the life layout only the life score, and All shows both, with a single score placed at the bottom; the level badges on equipment and tool icons now show the in-game requirement, while necklaces, rings, earrings, and task badges have no requirement and keep showing their item level.'
      }, {
        zh: '房屋升级计算器：起始等级可以选择 0（未建造），从 0 级起算会把建到 1 级的材料一起算上。',
        en: 'House Upgrade Calculator: the start level can now be 0 for rooms that are not built, which includes the materials needed to build the room to level 1.'
      }, {
        zh: '地下城收益计算器：单图与批量的切换改为顶部页签，打开默认停在第一个页签“批量模拟”，两个模式的参数照旧分别自动保存。',
        en: 'The Dungeon Profit Calculator now switches between a single map and batch mode with tabs at the top, opening on the first tab, Batch Simulation; parameters of both modes are still saved automatically.'
      }
    ]
  }, {
    version: '2.18.0',
    date: '2026-10-01',
    notes: [
      {
        zh: '地下城收益的普通物品市场税由 5% 调整为 4%，卖出收益相应提高（牛铃与牛铃袋仍为 18%）。',
        en: 'Dungeon Profit: the standard market tax is lowered from 5% to 4%, so selling revenue is higher (cowbells and their bags stay at 18%).'
      }, {
        zh: '修复游戏更新后部分图标显示不出来的问题。',
        en: 'Fixed an issue where some icons could fail to display after a game update.'
      }, {
        zh: '工具箱新增“更新日志”，可查看各版本的版本号、发布日期和更新说明。',
        en: 'New "Changelog": view every version with its number, release date, and update notes.'
      }, {
        zh: '工具箱新增“检查更新”：定时在后台检查新版本，有新版本时入口显示提示、按钮变为“更新新版本”并可直接安装；没有新版本时点击可查看当前版本与最新版本。',
        en: 'New "Check for Updates": it checks in the background and, when a new version is found, shows a hint on the Toolkit entry and turns the button into "Update to vX" for one-click install; with no new version, click it to view the installed and latest versions.'
      }
    ]
  },
  {
    version: '2.17.2',
    date: '2026-09-24',
    notes: [
      {
        zh: '装备提升计算器：模拟目标的护甲与生命值调整后，每秒伤害数值整体提高约三成，比较结果更稳定。',
        en: "Equipment Comparison: after the simulated target's armor and hitpoints were adjusted, DPS values are about 30% higher overall and comparisons are more stable."
      }, {
        zh: '装备提升计算器：基准装备与对比装备是同一件时直接显示 0% 提升，两栏每秒伤害显示“—”，不必等待模拟。',
        en: 'Equipment Comparison: when the baseline and comparison items are the same, it shows 0% improvement and both DPS columns show "—", with no simulation needed.'
      }, {
        zh: '装备提升计算器：打开弹窗和切换职业方案后自动开始模拟，不用再手动改动装备。',
        en: 'Equipment Comparison: simulation starts automatically when the dialog opens or the profession preset changes, so no manual equipment change is needed first.'
      }, {
        zh: '装备提升计算器：模拟只反映所选装备本身，不再计入角色成就等固定增益；搜索和切换装备时响应更快。',
        en: 'Equipment Comparison: the simulation reflects only the selected equipment and no longer includes fixed bonuses such as character achievements; searching and switching equipment is faster.'
      }
    ]
  }, {
    version: '2.17.1',
    date: '2026-09-23',
    notes: [
      {
        zh: '兼容性调整：工具箱改为只转发游戏连接、不再改动连接本身，去掉与其它会改写游戏连接的脚本（如 Oi momomo 公会试炼助手、MWI 战斗工具）同时使用时的冲突隐患，工具箱自己的数据同步也照常工作。',
        en: 'Compatibility: the Toolkit now only forwards the game connection instead of modifying it, removing conflicts with other scripts that rewrite the game connection (such as the Oi momomo guild trial helper and MWI combat tools) while keeping its own data sync working.'
      }
    ]
  }, {
    version: '2.17.0',
    date: '2026-09-23',
    notes: [
      {
        zh: '新增“任务开始”通知（默认开启，可在“消息类型”里单独关闭）：队首换成另一个任务时推送并列出接下来 3 项等待队列，被其他任务顶掉后重新开始的任务（迷宫、个人战斗这类任务编号没变的也一样）同样推送；组队战斗改在每次真正开战时推送。任务完成与任务开始发生在同一次切换时只发一条通知（一条消息里可以同时有“完成”和“开始”两行），同一任务一直在队首执行（例如迷宫跑不同环节、战斗打不同波次）不会重复推送。',
        en: 'New "Task start" notification (on by default, can be turned off separately under "Message types"): it is pushed when the queue head switches to another task and lists the next 3 waiting tasks; tasks that resume after being pushed aside (even with an unchanged task id, such as the labyrinth or solo battles) are pushed too, and party battles are announced once per actual battle start. When a task completes and the next one starts in the same transition only one message is sent (it can contain both a "complete" and a "start" line), and a task that keeps running at the head (e.g. labyrinth rooms or battle waves) is not pushed repeatedly.'
      }, {
        zh: '通知里的行动名与游戏内保持一致：点金、分解、转化、解精炼显示“行动名: 物品名”，强化显示“物品名 +强化等级”。',
        en: 'Action names in notifications now match the game: alchemy actions (transmute, decompose, convert, refine) show "Action: Item", and enhancing shows "Item +level".'
      }, {
        zh: '掉线或未登录时不再收到提醒：没有拿到角色队列数据时不再当成队列为空，检测到掉线会暂停“队列为空”和定期进度提醒，重连后自动恢复。',
        en: 'No more reminders while disconnected or not logged in: a missing character queue is no longer treated as an empty queue, and disconnection pauses the "empty queue" and periodic progress pushes until the connection is restored.'
      }, {
        zh: '关闭订阅通知一段时间后再开启，通知按当前队列继续，不再停留在关闭前的旧任务，也不会立刻补推一条。',
        en: 'After subscription notifications have been off for a while, re-enabling them continues with the current queue instead of the old task from before, without an immediate catch-up push.'
      }, {
        zh: '通知末尾取不到角色名时显示“角色 <编号>”以便区分账号，连角色信息都没有时显示“未知角色”。',
        en: 'When the character name is unavailable, notifications show "Character <id>" to tell accounts apart, and "Unknown character" when no character info is available at all.'
      },
      {
        zh: '“消息类型”选项顺序调整为任务开始、任务完成、队列为空、定期进度；最小推送间隔默认值由 10 秒改为 5 秒（已保存的设置不变）。',
        en: 'The "Message types" options are reordered to task start, task completion, empty queue, periodic progress; the default minimum push interval changed from 10 to 5 seconds (saved settings are unchanged).'
      }, {
        zh: '地下城收益新增“牛铃不计算收益”选项（默认不勾选）：勾选后牛铃和牛铃袋都不计入收益，收益结果与掉落物表里的这部分价值按 0 显示。',
        en: 'Dungeon Profit adds an "Exclude cowbell value" option (off by default): when checked, cowbells and bags of cowbells are excluded from profit and their value in the results and drop table shows as 0.'
      }
    ]
  }, {
    version: '2.16.0',
    date: '2026-09-08',
    notes: [
      {
        zh: '新增订阅通知：行动队列任务完成、新任务开始或长时间未完成时，推送通知到钉钉、企业微信或飞书机器人，队列腾空时附加提醒；任务完成和定期进度通知可分别开关，在工具箱菜单的“订阅通知”里配置和测试发送，仅在游戏页面打开期间接收，密钥只保存在本地。组队战斗取消准备后再次准备时，进度从重新准备时重新计数；游戏连接断开或同账号在其他页面登录被挤掉后，旧页面暂停推送进度和队列已空提醒，重连后自动恢复。',
        en: 'New subscription notifications: push task completion, new task start, or long-running progress to a DingTalk, WeCom, or Feishu bot, plus a reminder when the queue becomes empty. Completion and periodic progress notifications can be toggled separately; configure and test sending under "Notifications" in the Toolkit menu. Notifications are only received while the game page is open and keys are stored locally. For party battles, progress restarts after a new ready-up; when the game connection drops or the account is kicked by another login, the old page pauses progress and empty-queue pushes until it reconnects.'
      }, {
        zh: '角色名片：勾选“使用最高强化等级”时，按库存与已穿戴中的最高强化等级生成名片；悬浮装备、技能、房屋图标显示单项评分，点击评分区域可查看战斗、生活各分项的明细（按游戏内顺序排列），并可一键复制明细（每行同时包含名称和分数）；游戏以英文启动后切换到中文时，名片里的物品名也能正常显示中文。',
        en: 'Character Card: with "Use highest enhancement level" checked, the card is generated from the highest enhancement level in inventory and equipped gear. Hovering equipment, ability, or house icons shows per-item scores, clicking the score area shows the combat and skilling breakdowns (in game order), and the breakdown can be copied in one click (each line contains both the name and the score). Item names now display correctly when the game starts in English and then switches to Chinese.'
      }, {
        zh: '战斗模拟：一键导入与角色名片共用队友资料，游戏内查看过的队友资料自动同步；跨公会队友的神龛等级按其所在公会的神龛等级计算（在游戏内查看过该公会资料页后生效）；配装页面复制的战斗模拟数据补充神龛信息。',
        en: "Combat Simulator: one-click import shares party profiles with the Character Card and syncs any profile you open in game; cross-guild members' shrine levels follow their guild's shrine levels (after viewing that guild's profile page in game); combat sim data copied from the loadout page now includes shrine info."
      }, {
        zh: '工具箱各功能弹窗标题前显示与菜单一致的图标，弹窗和菜单入口更容易一一对应。',
        en: 'Every Toolkit dialog now shows the same icon as its menu entry, making dialogs and menu entries easy to match.'
      }
    ]
  }, {
    version: '2.15.0',
    date: '2026-08-28',
    notes: [
      {
        zh: '点击右上角头像弹出的菜单里新增「Sunrishe 工具箱」入口，点击后原地打开工具箱下拉（页头原有入口不变）。',
        en: 'A new "Sunrishe Toolkit" entry appears at the top of the avatar menu, opening the Toolkit dropdown in place (the header entry is unchanged).'
      }, {
        zh: '战斗升级计算器在没有主修职业时也能规划升级，按各行经验估算耗时和预计升级时间。',
        en: "Combat Upgrade Calculator can now plan upgrades without a major profession, estimating duration and completion time from each row's XP."
      }
    ]
  },
  {
    version: '2.14.0',
    date: '2026-08-26',
    notes: [
      {
        zh: '地下城收益新增批量模拟：把多个地下城加入列表，每行单独设置难度、队伍人数、耗时和每日成本，一次对比制作/购买钥匙的每日成本和期望收益；参数修改后自动保存，可随时恢复默认。',
        en: 'Dungeon Profit adds batch simulation: add multiple dungeons to a list, set difficulty, party size, run time, and daily cost per row, then compare daily cost and expected profit of crafting versus buying keys at once; parameters are saved automatically and can be reset to defaults.'
      }, {
        zh: '技能升级：从技能页面打开计算器时，自动填入当前装配的技能；技能书菜单里的计算器入口按钮与游戏其他操作按钮外观一致。',
        en: 'Ability Upgrade: opening the calculator from the abilities page now pre-fills currently equipped abilities, and the calculator button in the ability book menu matches the look of other game action buttons.'
      }, {
        zh: '地下城收益的“掉落物”页签外观改为与游戏页面页签一致。',
        en: 'The Dungeon Profit "Drops" tab now matches the game\'s tab style.'
      }
    ]
  }, {
    version: '2.13.0',
    date: '2026-08-21',
    notes: [
      {
        zh: '新增战斗模拟器一键导入：在 aiwwb 模拟器页面填入当前角色与队伍数据并刷新价格，队友数据来自游戏内点开过的资料。',
        en: 'New one-click Combat Simulator import: fill the aiwwb simulator with the current character and party data and refresh prices; party data comes from profiles you have opened in game.'
      }, {
        zh: '工具箱菜单新增“战斗模拟 aiwwb”入口（复用同一窗口）。',
        en: 'New "Combat Sim aiwwb" entry in the Toolkit menu (reuses the same window).'
      }, {
        zh: '修复与 MWITools 同时使用时其头部按钮被挤到居中排列的问题。',
        en: 'Fixed MWITools header buttons being squeezed toward the center when both scripts are installed.'
      }
    ]
  }, {
    version: '2.12.0',
    date: '2026-08-19',
    notes: [
      {
        zh: '地下城收益计算器增强：地下城下拉框增加 D1-D4 序号，方便对照游戏内地下城地图；结果区新增“掉落物”页签，按官方宝箱掉落物列表分普通、精炼宝箱逐条展示物品、掉率、期望数量和左一/右一价格，掉率和期望数量悬浮可查看详情，价格按市场报价税前计算。',
        en: 'Dungeon Profit improvements: the dungeon dropdown now shows D1-D4 numbers to match the in-game dungeon map, and the results area has a new "Drops" tab listing items, drop rates, expected quantities, and best-ask/best-bid prices per standard and refined chest, with details on hover; prices are calculated from market quotes before tax.'
      }
    ]
  }, {
    version: '2.11.1',
    date: '2026-08-18',
    notes: [
      {
        zh: '修复市场“加入购物车”按钮与“生产采集增强优化”等其他脚本同时启用时，提示“当前没有可加入购物车的市场物品”的问题。',
        en: 'Fixed the "no market item to add to cart" message when the Marketplace Add to Cart button is used together with other scripts such as the production/gathering optimizer.'
      }, {
        zh: '同时安装多份本脚本（如正式版与本地调试版）时，“加入购物车”按钮保持稳定出现，不再互相干扰。',
        en: 'When several copies of this script are installed (e.g. the release and a local dev build), the Add to Cart button now appears consistently without the copies interfering with each other.'
      }
    ]
  }, {
    version: '2.11.0',
    date: '2026-08-18',
    notes: [
      {
        zh: '迷宫入口新增“补充补给”：在“进入迷宫”按钮上方提供补给按钮，鼠标悬浮时弹出小窗口选择 1~5 次入场，把缺少的火把、斗筜、探照灯和茶箱、咖啡箱、食物箱加入 MWITools 购物车（道具按页面配置与携带上限补足，补给箱按入场次数补足，页面未配置时按专家档位；只加入购物车，不自动下单）。',
        en: 'The labyrinth entry adds "Restock supplies": a button above "Enter Labyrinth" opens a small window to choose 1-5 runs and adds missing torches, shrouds, beacons, and tea/coffee/food crates to the MWITools cart (items top up to the carry cap, crates to the run count, expert tier by default; cart only, never orders).'
      }, {
        zh: '市场新增“加入购物车”按钮：在市场“刷新”按钮右侧，点击把当前查看的物品加入 MWITools 购物车，每次 1 个；查看具体强化等级的订单时按该等级加入，未强化物品按 +0 加入（只加入购物车，不自动下单）。',
        en: 'Marketplace adds an "Add to cart" button next to "Refresh" that adds the currently viewed item to the MWITools cart, 1 per click; a specific enhancement level is kept and unenhanced items are added as +0 (cart only, never orders).'
      }
    ]
  },
  {
    version: '2.10.2',
    date: '2026-08-17',
    notes: [
      {
        zh: '修复市场行情来源：市场数据改为始终按当前入口域名读取本站行情（正式服与测试服是两个环境，cn 域名是正式服的中国官方镜像入口），在带 www、不带 www 或测试服域名的页面打开时都能正确读取，不再依赖固定的域名跳转。',
        en: 'Fixed the market data source: prices are now always read from the current entry domain (release and test are separate environments, and the cn domain is a mirror entry of the release server), so pages with or without www or on the test domain all work without a fixed domain redirect.'
      }
    ]
  }, {
    version: '2.10.1',
    date: '2026-08-17',
    notes: [
      {
        zh: '战力打造分全面升级为着装评分：新增“启用着装评分”选项（默认勾选），评分与 MWITools 最新版保持一致并分战斗、生活两行展示（✦ 标识在文案前，悬浮提示可查看各项明细），市场行情按当前所在服务器读取；不勾选时保持原有的战力打造分。',
        en: 'Combat Power Score upgraded to Wardrobe Score: new "Enable wardrobe score" option (on by default); scores match the latest MWITools and are shown in separate combat and skilling lines (with a ✦ marker and a hover breakdown), and market data follows the current server; unchecking keeps the original Combat Power Score.'
      }, {
        zh: '购物车功能切换到 MWITools：原“市场伴侣”插件已停用，技能书、房屋材料和剪贴板导入都改由 MWITools 购物车处理。',
        en: 'Cart features moved to MWITools: the old Market Mate plugin is retired, and ability books, house materials, and clipboard import all use the MWITools cart now.'
      }, {
        zh: '地下城收益新增“收益扣除市场税”选项（默认勾选），可按需切换是否在卖出收益中扣除市场税（普通物品 5%，牛铃与牛铃袋 18%）；预期产出区新增每日普通宝箱和精炼宝箱产出两行；宝箱内物品缺价时不再以官方指导价兜底，更贴近实际挂单与成交。',
        en: 'Dungeon Profit adds a "Deduct market tax" option (on by default) to switch market tax on selling revenue (5% for regular items, 18% for cowbells and their bags); the expected output area adds daily standard and refined chest outputs; missing prices no longer fall back to the official guide price, closer to actual listings and trades.'
      }, {
        zh: '技能升级“添加技能”的选择窗口改为在计算器内部显示，技能以卡片列表呈现，不再全屏遮挡。',
        en: 'The "Add ability" picker in Ability Upgrade now appears inside the calculator as a card list instead of covering the screen.'
      }, {
        zh: '市场技能书菜单新增“技能升级计算器”入口，点击后直接打开计算器并预填该技能。',
        en: 'New "Ability Upgrade Calculator" entry in the ability book market menu, opening the calculator with that ability pre-filled.'
      },
      {
        zh: '多个弹窗的下拉框、复选框边框与输入框同色，不再刺眼。',
        en: 'Dropdowns and checkboxes in several dialogs now share the input border color instead of standing out.'
      }, {
        zh: '装备提升计算器“职业方案”的中文名称与游戏官方保持一致：重盾、长枪。',
        en: 'Equipment Comparison profession names in Chinese now match the official game names: 重盾 and 长枪.'
      }
    ]
  }, {
    version: '2.9.3',
    date: '2026-08-15',
    notes: [
      {
        zh: '地下城收益按最新游戏规则调整市场税：卖出收入固定扣除 5% 市场税（原 2%），牛铃袋按 18% 特殊税率扣税。',
        en: 'Dungeon Profit applies the latest market tax rules: selling revenue is reduced by a fixed 5% market tax (up from 2%), and bags of cowbells use the 18% special rate.'
      }, {
        zh: '修复地下城收益中牛铃价值可能算成 0 的问题：牛铃袋缺价时按官方市场指导价估值，指导价也缺失时才按市场快照成交价兜底（约 107.5 万金币/袋），牛铃按十分之一折算，不再显示为 0。',
        en: 'Fixed cowbell value sometimes being calculated as 0: when a bag of cowbells has no market price it falls back to the official guide price and then to the market snapshot trade price (about 1.075M coins per bag), with cowbells at one tenth, so it no longer shows 0.'
      }
    ]
  }, {
    version: '2.9.1',
    date: '2026-08-11',
    notes: [
      {
        zh: '优化名片角色资料缓存：只保存名片展示所需的字段，缓存体积大幅缩小，超出上限或浏览器存储不足时自动清理最旧资料。',
        en: 'Character profile caching optimized: only the fields needed by the card are cached, greatly reducing cache size, and the oldest profiles are cleaned up when the limit is exceeded or browser storage is low.'
      }
    ]
  }, {
    version: '2.9.0',
    date: '2026-08-05',
    notes: [
      {
        zh: '地下城收益计算器新增队伍人数选项（1-5 人），宝箱数量按官方公式 `5 ÷ 队伍人数` 计算，默认 5 人时每车普通宝箱仍为 1.295 个，门票、钥匙和收益随人数自动调整。',
        en: 'Dungeon Profit adds a party size option (1-5): chest quantity uses the official formula `5 ÷ party size`, so with the default 5 members a standard chest is still 1.295 per run, and tickets, keys, and profit adjust automatically.'
      }
    ]
  },
  {
    version: '2.8.3',
    date: '2026-08-04',
    notes: [
      {
        zh: '修复右上角工具箱入口布局；本地调试脚本新增文件版和网页版；地下城收益新增“披风不计算收益”并修复数量提前四舍五入导致的轻微偏差；战斗升级新增“使用当前战斗经验”；装备提升修复双手武器方案误叠副手导致伤害输出提升被高估的问题。',
        en: 'Fixed the Toolkit entry layout in the header; local debug scripts now include a file version and a web version; Dungeon Profit adds "Exclude cape value" and fixes a small deviation from rounding quantities too early; Combat Upgrade adds "Use current combat XP"; Equipment Comparison fixes two-handed weapon setups double-counting the off-hand and overstating the damage gain.'
      }
    ]
  }, {
    version: '2.7.26',
    date: '2026-08-03',
    notes: [
      {
        zh: '优化脚本加载和浏览器兼容性，修复火狐浏览器下游戏连接、原生跳转、配装读取、游戏名称语言和油猴接口相关问题；装备提升中选择基准装备后，对比装备也会自动选中相同装备。',
        en: 'Improved script loading and browser compatibility, fixing game connection, native navigation, loadout reading, game name language, and userscript API issues in Firefox; in Equipment Comparison, selecting a baseline item now also selects the same item for comparison.'
      }
    ]
  }, {
    version: '2.7.22',
    date: '2026-08-02',
    notes: [
      {
        zh: '优化技能和战斗升级输入体验，等级输入不会再显示多余的数字加减箭头。',
        en: 'Improved level input in ability and combat upgrades — no more leftover number spinner arrows.'
      }, {
        zh: '优化弹窗在小屏和手机浏览器下的位置，技能选择和工具箱菜单会尽量保持在当前可见区域内。',
        en: 'Improved dialog positioning on small screens and mobile browsers so the ability picker and Toolkit menu stay within the visible area.'
      }
    ]
  }, {
    version: '2.7.20',
    date: '2026-08-02',
    notes: [
      {
        zh: '从原 EDS 配装同步升级为 **MWI Sunrishe Toolkit**：保留 Milkonomy、hyhfish 和战斗模拟器相关复制/同步能力，并统一收进游戏顶部的工具箱入口。',
        en: 'Upgraded from the EDS loadout sync into **MWI Sunrishe Toolkit**: Milkonomy, hyhfish, and combat simulator copy/sync features are kept and gathered under the Toolkit entry at the top of the game.'
      }, {
        zh: '新增角色、队伍和配装名片：可读取当前角色、公开资料、队伍和配装数据，支持缓存角色、布局切换、图片下载与复制。',
        en: 'New character, party, and loadout cards: read the current character, public profiles, party, and loadout data, with profile caching, layout switching, image download, and copy.'
      }, {
        zh: '新增技能、房屋和战斗升级计算器：可结合角色等级、经验、库存、市场价格和常用方案规划升级材料、技能书、耗时与预计完成时间。',
        en: 'New ability, house, and combat upgrade calculators: plan materials, ability books, duration, and completion time using character levels, XP, inventory, market prices, and common presets.'
      }, {
        zh: '新增装备提升计算器：按职业方案比较两件装备的属性差异、模拟伤害输出、装备价格差和每 1000 万金币带来的提升。',
        en: 'New Equipment Comparison: compare two items by stats, simulated damage, price difference, and improvement per 10M coins by profession preset.'
      }, {
        zh: '新增地下城收益计算器：按官方掉落表、当前市场价格、制作/购买钥匙、自定义买卖档位和每日药品饮料成本估算长期期望收益。',
        en: 'New Dungeon Profit calculator: estimate long-term expected profit from official drop tables, current market prices, crafted/bought keys, custom buy/sell tiers, and daily potion/food costs.'
      },
      {
        zh: '增强 MWI 市场伴侣配合能力：支持剪贴板批量导入、房屋材料和技能书加入购物车，并保留“只加入购物车、不自动下单”的安全边界。',
        en: 'Enhanced MWI Market Mate integration: clipboard batch import plus house materials and ability books to the cart, keeping the "cart only, never order" safety boundary.'
      }, {
        zh: '优化整体使用体验：界面语言跟随游戏实时切换，弹窗提示、移动端显示、官方中文术语和市场价格方向已统一整理；中文里最佳出售价/最佳收购价按游戏习惯显示为左一/右一。',
        en: 'Overall experience: the interface language follows the game in real time, and dialogs, mobile display, official Chinese terms, and market price directions are unified; best sell/buy prices display as 左一/右一 in Chinese, following game conventions.'
      }
    ]
  }, {
    version: '1.2.7',
    date: '2026-05-07',
    legacy: true,
    notes: [
      {
        zh: '新利润网（hyhfish 改版）支持同步披风。',
        en: 'The new profit site (hyhfish version) supports cape sync.'
      }, {
        zh: '修复复制 Milkonomy 数据时遗漏个人成就增益的问题。',
        en: 'Fixed missing personal achievement bonuses when copying Milkonomy data.'
      }
    ]
  },
  {
    version: '1.2.5',
    date: '2026-04-17',
    legacy: true,
    notes: [
      {
        zh: '增加对新利润网 `hyhfish.github.io/milkonomy` 的支持。',
        en: 'Added support for the new profit site `hyhfish.github.io/milkonomy`.'
      }
    ]
  }, {
    // 未在 GreasyFork 发布过，无发布记录可查，不标注日期。
    version: '1.1.3',
    date: '',
    legacy: true,
    notes: [
      {
        zh: '战斗配装支持复制战斗模拟器格式的数据。',
        en: 'Combat loadouts can be copied in combat simulator format.'
      }, {
        zh: '避免在非游戏网站注入游戏界面样式。',
        en: 'Avoid injecting game UI styles on non-game sites.'
      }
    ]
  }, {
    version: '1.0.2',
    date: '2026-04-15',
    legacy: true,
    notes: [
      {
        zh: '修复 Milkonomy 从未配置过方案时无法同步的问题。',
        en: 'Fixed Milkonomy sync failing when no loadout had ever been configured.'
      }
    ]
  }, {
    version: '1.0.1',
    date: '2026-04-15',
    legacy: true,
    notes: [
      {
        zh: '修复中文镜像站无法使用的问题。',
        en: 'Fixed the Chinese mirror site being unusable.'
      }
    ]
  }, {
    version: '1.0.0',
    date: '2026-04-15',
    legacy: true,
    notes: [
      {
        zh: '支持在游戏网站复制生活配装方案数据。',
        en: 'Copy skilling loadout data on the game site.'
      }, {
        zh: '支持在 Milkonomy 网站同步生活配装方案。',
        en: 'Sync skilling loadouts on the Milkonomy site.'
      }
    ]
  }
];
