# MWI Sunrishe Toolkit 使用说明

MWI Sunrishe Toolkit 是《银河奶牛放置》的综合辅助工具，提供角色与队伍名片、技能/房屋/战斗升级规划、装备提升计算器、地下城收益估算、配装数据同步及 MWI 市场伴侣增强。界面语言会自动跟随游戏设置；切换语言时，已打开的工具会即时更新并保留当前输入和列表。

## Sunrishe 工具箱

### 作用

点击页面顶部角色信息区域的**工具箱**，可以依次打开角色名片、技能升级计算器、房屋升级材料计算器、战斗升级计算器、装备提升计算器、地下城收益计算器及游戏原生角色切换入口。

### 注意事项

- 工具箱只在游戏页面显示。
- 角色、等级、经验、物品及房屋资料优先读取游戏当前数据；页面刚加载时，部分入口可能需要稍等片刻才能使用。

### 鸣谢

感谢以下脚本及作者提供的创意、实现基础或公开接口：

- **MWI 角色名片插件**，作者 **Windoge**：角色与队伍名片功能及原始名片设计的实现基础。[脚本链接](https://greasyfork.org/zh-CN/scripts/543862)
- **MWI Production & Gathering Enhanced Optimization**，作者 **XIxixi297**：快速切换角色功能的实现参考。[项目链接](https://github.com/CYR2077/MWI-Production-Gathering-Enhanced)
- **MWI 市场伴侣**，作者 **ColaCola**：剪贴板、房屋材料及技能书购物车功能通过其公开接口实现。[脚本链接](https://greasyfork.org/zh-CN/scripts/567386)
- **MWITools**，作者 **bot7420、shykai**：名片战力打造分的计算逻辑来源；MWITools 注明该算法原作者为 **Ratatatata**。[MWITools](https://greasyfork.org/zh-CN/scripts/494467) · [原算法脚本](https://greasyfork.org/zh-CN/scripts/511240)
- **MWI-Equipment-Diff**，作者 **BKN46**：装备属性对比功能的实现参考。[脚本链接](https://greasyfork.org/zh-CN/scripts/537282)
- **MWI Combat Simulator**，作者 **shykai**：装备提升的战斗模拟算法来源。[项目链接](https://github.com/shykai/MWICombatSimulatorTest)

## 角色与队伍名片

### 作用

根据游戏资料生成角色、队伍或配装名片，可展示装备与技能、生活工具、战斗等级与房屋、生活等级与房屋，同时保留聊天外观、数据时间及战力打造分。战力打造分算法来源为 **MWITools**。

### 角色名片

1. 点击页面顶部带边框的角色名，或从 Sunrishe 工具箱打开当前角色名片。切换角色后入口会自动恢复。
2. 查看其他角色资料时，点击**查看角色名片**生成该角色名片。
3. 在战斗或生活配装页面点击**生成配装名片**，可按当前配装生成名片；战斗配装计算战力打造分时会同时使用当前角色已穿戴的生活工具。
4. 搜索框可以从已缓存角色中切换名片；**重置角色数据**会回到弹窗刚打开时的角色。
5. 当前账号角色可以点击技能栏位调整名片展示技能；选择器会显示技能等级、图标和当前语言名称，并支持中英文搜索。其他角色只能按其资料生成，不能修改技能。
6. 勾选**双列**可切换单列或双列展示；**名片布局**可选择战斗布局、生活布局或全部内容。战斗布局展示装备、技能及战斗等级与房屋；生活布局展示装备、技能、生活工具及生活等级与房屋。
7. **下载名片**会导出 PNG 图片；**复制名片**会把 PNG 图片直接写入剪贴板。

### 队伍名片

1. 组队后，在队伍区域点击**队伍名片**。
2. 从搜索下拉框选择缓存角色即可加入名片，最多展示 5 个角色。
3. 拖动名片标题可以调整顺序，悬浮名片后可移除角色。
4. **重置队伍数据**会恢复当前队伍角色；队伍名片同样支持下载和复制 PNG 图片。

### 默认布局

- 当前角色名片和用户资料名片默认使用**双列 + 全部**。
- 战斗配装名片默认使用**双列 + 战斗布局**，生活配装名片默认使用**双列 + 生活布局**。
- 队伍名片默认使用**单列 + 战斗布局**，打开后仍可自行切换。

### 注意事项

- 点击游戏中的**查看资料**可获取并缓存其他角色的最新公开资料。
- 名片上的**数据时间**表示该角色资料的获取或更新时间，不是图片生成时间。
- 其他角色未返回装备或房屋等公开资料时，名片会标明资料有限。
- 复制图片需要浏览器允许剪贴板图片权限；不支持时请使用下载功能。
- 名片图片按 `2×` 清晰度导出。角色越多，队伍名片生成所需时间和内存越多。

## 技能升级计算器

### 作用

同时规划多个技能的升级成本，计算所需技能书、左一/右一市场价格对应的总价，并可联动游戏市场和 MWI 市场伴侣。

### 使用方法

1. 从 Sunrishe 工具箱打开，或在技能页面点击**升级计算器**；已学技能详情中可直接**前往市场**，也可打开并自动带入该技能的升级计算器。
2. 点击**添加技能**，可按中文名、英文名或 HRID 搜索。点击已添加技能的图标可前往对应技能书的游戏市场页面。
3. 选择职业方案会先清空列表，再加入该方案的 5 个常用技能。
4. **预设等级**会按顺序设置列表前 5 个技能的目标等级，例如 `10/10/10/10/10`、`30/50/50/50/50` 等。
5. 目标等级可以直接输入，也可以从常用等级中选择。
6. 默认按角色实际等级和经验计算。勾选起始等级左侧复选框后，可从自定义等级的 `0%` 经验开始计算。
7. 安装 **MWI 市场伴侣**后，操作列会显示购物车按钮，可把该行需要购买的技能书加入购物车。
8. **清空列表**只移除当前计算列表，不会影响角色数据。
9. 点击标题旁的说明图标，可以查看技能书数量、价格和起始经验的计算规则；电脑和移动端均支持点击打开。

### 计算规则

- 只能添加有对应技能书的技能，同一技能不能重复。
- 起始等级范围为 `0-199`，目标等级范围为 `1-200`。
- 未自定义起始等级时，经验差额会扣除角色在当前等级已有的实际经验。
- 自定义起始等级后，按该等级 `0%` 经验计算；0 级技能会额外计入 1 本解锁用技能书。
- 所需技能书向上取整到 `0.1` 本；市场总价和购物车数量按整本向上取整。
- **左一**表示当前可直接买入的最低卖单；**右一**表示当前可直接卖出的最高买单。缺少某侧价格时，不计算对应总价。

### 注意事项

- 技能、技能书经验和等级经验表来自游戏数据；市场价格来自游戏公开市场数据。
- 职业方案来自项目内置方案，选择方案会覆盖当前列表。
- 市场数据有缓存时间，计算器顶部会显示本次使用的市场数据时间。

## 房屋升级材料计算器

### 作用

根据房屋起始等级与目标等级，统计升级所需材料、当前库存、缺少数量及市场价值。

### 使用方法

1. 在房屋页面点击**升级计算器**，或从 Sunrishe 工具箱打开。
2. 勾选需要升级的房屋，并分别设置起始等级和目标等级。
3. 使用生活、战斗分类可批量选择房屋；批量等级只会修改对应的起始等级或目标等级。
4. 结果可切换名称或 HRID 显示，并可导出 CSV。
5. 安装 **MWI 市场伴侣**后，可以把缺少材料直接加入其购物车。

### 注意事项

- 当前房屋等级、升级材料、物品资料和库存来自游戏数据。
- 市场价格来自游戏公开市场数据；**缺口价值**只统计库存不足的非金币材料。
- **总价值**包含升级金币和全部材料价值；**材料价值**不包含金币。
- 重置等级会重新读取当前房屋等级，不会改变游戏中的房屋数据。

## 战斗升级计算器

### 作用

按战斗专业、训练顺序和经验速度规划升级过程，计算各阶段耗时、预计完成时间及可选的次数估算。

### 使用方法

1. 填写**主修经验**和**选修经验**，单位为 `K/h`；需要估算次数时再填写 EPH。
2. 默认列表包含耐力、智力、攻击、防御，以及近战、远程、魔法中当前等级最高的主修专业。
3. 双击顶部专业图标可重复添加专业；从列表第一列的序号处拖动，可调整训练顺序。
4. 当前等级和经验来自角色数据。勾选起始等级左侧复选框后，可以自行输入起始等级；目标等级支持直接输入或选择常用等级。
5. 耐力、智力固定为选修；远程、魔法固定为主修；攻击、防御、近战可在主修与选修之间切换。
6. 勾选**同修**可让符合条件的相邻项目归入同一序号。同一序号的项目同时开始，下一序号会等待上一序号全部完成。
7. 每行的经验输入框可以覆盖顶部对应的主修或选修经验。
8. 每段耗时分两行显示小时和天数；合计行仅显示总天数，悬浮可查看总小时。预计完成时间悬浮可查看预计开始时间。
9. 点击标题旁的说明图标，可以查看计算方法与使用限制；电脑和移动端均支持点击打开。

### 计算规则

- 选修使用完整的选修经验。
- 勾选同修的主修使用主修经验；未勾选同修的主修使用“主修经验 + 选修经验”。
- 相邻选修勾选同修后，会并入前一选修的序号。
- 主修勾选同修后，会并入上一主修之后的第一个选修序号。
- 同修主修的结束等级不能手动修改；计算器会根据它覆盖的选修训练时段反推结束等级和经验百分比。
- 同一序号不能重复同一专业，且列表至少需要一项主修。
- 同一专业重复出现时，后一行会继承前一段结束时的等级和精确经验进度。
- 未自定义起始等级时使用角色实际经验；自定义后从所填等级的 `0%` 经验开始。

### 注意事项

- 升级经验表来自游戏公共数据，计算器不会修改角色数据。
- 目标等级可直接输入 `1-200`，常用等级列表包含 `200`。
- **重置列表**会恢复默认专业及角色当前等级，并保留顶部主修经验、选修经验和 EPH；可匹配默认专业的行内经验覆盖也会保留。
- 经验速度为 `0` 或缺少主修时，相关时间无法计算。

## 装备提升计算器

### 作用

按职业单刷方案比较同一穿戴位置的两件装备，分列展示属性差异、模拟 DPS、装备价格差及每 10M 金币带来的 DPS 提升。

### 使用方法

1. 从 Sunrishe 工具箱打开**装备提升计算器**，选择要采用的职业方案。
2. 选择基准装备后，再选择同一穿戴位置的对比装备；选择框支持按装备位置及中英文名称或 HRID 筛选。
3. 当前已穿戴的适用装备会优先作为基准装备，并保留实际强化等级；其他装备默认按 `+10` 比较，强化等级可在 `0-20` 范围内调整。
4. 选择完成后会自动模拟基准和对比套装，展示双方 DPS、DPS 提升、所选两件装备的价格差及每 10M 金币的 DPS 提升。
5. 属性表按战斗属性和生活属性分组；差异按“对比装备 - 基准装备”计算，绿色表示提升，红色表示降低。攻击间隔越短越好，因此降低时显示为提升。

### 注意事项

- 装备、技能、属性、强化倍率、战斗等级及房屋数据全部来自游戏当前数据。
- 候选装备会按职业风格和穿戴位置筛选；项链、耳环、戒指等无职业风格限制的装备视为通用装备。护符、Trinket 和生活工具不参与 DPS 对比。
- 双手武器占用武器位置并移除主手、副手；主手和副手可以同时参与模拟。
- 两套方案只有所选装备不同，其余配装和角色条件保持一致。模拟使用对应职业的 `+10` 单刷套装、`4/6/6/6/6` 技能等级，以及不会攻击、不会被击败的统一标准标靶。
- 每套方案使用相同的 5 组固定随机种子，每组模拟 3 小时并取平均值，以减少随机波动对结果的影响。
- 战斗模拟核心来自 MWI Combat Simulator，公共游戏数据由 MST 当前内存提供，不会在运行时访问外部模拟器资源。
- 装备价格差按“对比装备价格 - 基准装备价格”计算。价格按所选强化等级读取市场报价，优先使用左一价格；左一缺失时使用成交价或右一价格。
- 模拟结果用于统一条件下比较两件装备，不代表特定怪物、战区或队伍中的实际收益。

## 地下城收益计算器

### 作用

根据地下城、难度和单次通关耗时，固定按每日 24 小时计算普通/精炼宝箱及开箱物品的长期期望，再计算当前市场价格下的保守和乐观期望收益。

### 使用方法

1. 从 Sunrishe 工具箱打开**地下城收益计算器**，选择地下城和 T0-T2 难度。
2. 默认选择官方列表中的第一个地下城、T0 和 30 分钟单次耗时；可按实际情况修改，每日固定按 24 小时计算。
3. 可选填每日药品/饮料成本，单位为 `M`；该成本会从每日及每车期望收益中分摊扣除。
4. 制作钥匙默认使用工匠茶；暴饮之囊会在当前装备、背包和仓库的全部持有物品中读取最高强化等级，拥有时自动勾选，没有时不勾选；等级选择只由暴饮复选框控制。
5. 在同一张表的“材料成本”和“预期产出”区中，对比制作钥匙和购买钥匙的门票/开箱钥匙成本、宝箱税后收益、每车期望收益和每日期望收益。
6. 勾选**自定义模式**后，选择制作或购买钥匙、对应的左买/右买方式，以及货物左卖/右卖方式。表格左侧两列保留所选钥匙来源的保守/乐观区间，右侧两列合并显示该自定义组合的精确结果。
7. 操作区会按可用宽度自动调整列数，同一行保持等宽；最后一行沿用相同列宽，不会为了填满整行而拉伸，移动端无需手动切换布局。

### 计算规则

- 每日轮次为 `round2(24 × 60 ÷ 单次通关分钟)`，保留两位小数，不向下取整。
- 四个地下城的普通宝箱固定为每车 `1.295`；T0 无精炼宝箱，T1 精炼宝箱为 `1.295 × 0.33`，T2 为 `1.295`。单车与每日宝箱数量均保留两位小数。
- 数量和金额最多显示两位小数，并去掉小数末尾的 `0`。
- 队伍人数、Combat Drop Quantity 和 Combat Drop Rate 均不影响地下城宝箱数量，因此不提供对应输入。
- 每个宝箱按官方掉落率和数量区间平均值计算物品期望；重复物品合并，嵌套宝箱继续递归展开。
- 门票数量等于普通宝箱期望数量；开箱钥匙按需要开启的宝箱期望数量计算。
- 门票和宝箱钥匙的制作成本与购买成本同时展示，仅列出单位和每日成本；工匠茶与暴饮之囊只影响制作成本。
- 每日药品/饮料成本为可选固定日成本，填写后计入制作和购买两套每日总成本，并按每日轮次分摊到每车期望收益。
- 保守值使用 `bid` 估算收益、`ask` 估算成本；乐观值使用 `ask` 估算收益、`bid` 估算成本。
- `bid` 和 `ask` 两种卖出总价固定扣除 2% 市场税，牛铃不使用特殊税率。单个普通宝箱税后收益按制作/购买来源分别扣除单箱分摊的门票和普通宝箱开箱钥匙成本，单个精炼宝箱税后收益分别扣除单箱开箱钥匙成本；宝箱行数量列显示每日宝箱期望。
- 每日期望收益按各类单箱收益乘对应每日数量汇总，再减去每日药品/饮料成本，不重复扣除钥匙成本；每车期望收益等于每日期望收益除以每日轮次。T0 不展示精炼宝箱收益。
- 每日轮次、门票、普通宝箱、可选精炼宝箱和市场数据时间在同一行展示；预期产出区先显示每车期望收益，再显示每日期望收益，两者与宝箱税后收益使用相同样式。
- 市场某一侧价格为 `-1` 时，按有效的另一侧或最近成交价回退；两侧均无有效价格才按 `0` 估值并提示。

### 注意事项

- 地下城、奖励和物品资料来自游戏当前公共数据，价格来自游戏公开市场数据。
- 单次通关耗时需要手动填写；请直接填写已经包含工匠茶、暴饮之囊等影响后的实际耗时。
- 当前结果是相同输入下固定的长期期望，不代表某次实际开箱结果，也不包含历史价格；制作与购买钥匙使用当前材料或成品市场价格并列计算。
- 市场缺价会按 `0` 估值并在结果中提示。

## 切换角色

从 Sunrishe 工具箱点击**切换角色**，脚本会调用游戏原生入口打开角色选择页面。

## 利润网与战斗配装

- **老利润网**：Milkonomy（`https://milkonomy.pages.dev/`）。
- **新利润网**：hyhfish 改版（`https://hyhfish.github.io/milkonomy/`），在老利润网基础上增加了功能。

### 作用

将当前装备或战斗配装转换为老利润网 Milkonomy、新利润网 hyhfish 或战斗模拟器支持的数据格式。

### 使用方法

1. 在装备面板点击**复制利润网数据**，再选择**复制 Milkonomy 数据**或**复制 hyhfish 数据**。
2. 在战斗配装详情中，点击**复制战斗模拟器数据**可按当前选中的配装生成数据。
3. 在战斗配装详情中，点击**生成配装名片**可生成当前配装的角色名片。
4. 在对应利润网站点击**同步配装**，可导入从游戏端同步的配装数据。

### 注意事项

- 各复制功能保持目标网站要求的数据结构，不会修改游戏配装。
- Milkonomy 跨站同步依赖油猴的数据同步和跨域权限，请保留脚本所需授权。

## MWI 市场伴侣剪贴板导入

### 作用

安装 **MWI 市场伴侣**后，MST 会在其清单面板增加**导入剪贴板**按钮。MST 负责解析剪贴板内容，并通过市场伴侣公开接口加入购物车。

### 支持格式

1. 支持“数量 物品名”和“物品名 数量”两种顺序。
2. 支持中文名、英文名、完整 `/items/...` HRID，以及 `物品名+强化等级`。
3. 数量加 `+` 表示补足目标库存，并扣除背包已有数量，例如 `+100 牛奶` 或 `牛奶 +100`。
4. 使用 `数量/h` 或 `数量/H` 可按小时计算需求；未填写补充天数时默认计算 24 小时。
5. 第一行使用 `补充N天` 后，后续数量均按每小时用量计算，此时可省略 `/h`；天数支持小数。
6. 数量支持小数，最终加入购物车时会向上取整。
7. 无法识别的物品会被跳过，其余有效物品仍会导入。

### 使用示例

剪贴板中每行填写一种物品。以下库存数量仅用于说明导入结果。

**固定数量**

```text
100 牛奶
Cheese 250
2 奶酪剑+3
Cheese Sword+5 1
```

导入结果：加入 100 个牛奶、250 个奶酪、2 把 `+3` 奶酪剑和 1 把 `+5` 奶酪剑。固定数量不会扣除背包库存。

**使用物品 HRID**

```text
100 /items/milk
/items/cheese +500
```

导入结果：固定加入 100 个牛奶，并把奶酪补足到 500 个。假设已有 120 个奶酪，则加入 380 个奶酪。

**补足目标库存**

```text
+1000 牛奶
Cheese +500
奶酪剑+3 +10
```

假设已有 300 个牛奶、120 个奶酪和 4 把 `+3` 奶酪剑，导入结果为 700 个牛奶、380 个奶酪和 6 把 `+3` 奶酪剑。已有数量达到目标时不会加入购物车。

**补充一天的每小时消耗**

```text
25/h 牛奶
Cheese 10/h
```

假设已有 100 个牛奶和 40 个奶酪，导入结果为 500 个牛奶和 200 个奶酪：

```text
牛奶：25 × 24 - 100 = 500
奶酪：10 × 24 - 40 = 200
```

**补充多天**

```text
补充3天
25 牛奶
Cheese 10
```

`补充3天` 必须位于第一行，后续数量按 72 小时计算。假设已有 100 个牛奶和 40 个奶酪，导入结果为 1700 个牛奶和 680 个奶酪：

```text
牛奶：25 × 72 - 100 = 1700
奶酪：10 × 72 - 40 = 680
```

### 注意事项

- 未安装或尚未加载 MWI 市场伴侣时，剪贴板导入按钮、房屋材料购物车按钮和技能书购物车按钮不会显示。
- 物品名称翻译来自游戏语言资源；建议优先使用当前游戏语言中的完整名称或 HRID。
- 导入只负责向市场伴侣购物车添加项目，不会自动下单。

---

# MWI Sunrishe Toolkit User Guide

MWI Sunrishe Toolkit is an all-in-one companion for Milky Way Idle. It provides character and party cards, ability/house/combat upgrade planning, equipment comparison, dungeon profit estimates, loadout data synchronization, and MWI Market Mate enhancements. The interface follows the game language; open tools update immediately when the language changes while preserving current inputs and lists.

## Sunrishe Toolkit

### What It Does

Click **Toolkit** in the top character-info area to open Character Card, Ability Upgrade, House Upgrade, Combat Upgrade, Equipment Comparison, Dungeon Profit, and the game's native character switcher in that order.

### Notes

- The toolkit is shown only on game pages.
- Character, level, experience, item, and house information is read from the current game data whenever possible. Some entries may take a moment to become available immediately after the page loads.

### Credits

Thanks to the following scripts and authors for their ideas, foundations, or public APIs:

- **MWI Character Card** by **Windoge**: the implementation foundation and original design for character and party cards. [Script](https://greasyfork.org/en/scripts/543862)
- **MWI Production & Gathering Enhanced Optimization** by **XIxixi297**: the implementation reference for quick character switching. [Project](https://github.com/CYR2077/MWI-Production-Gathering-Enhanced)
- **MWI Market Mate** by **ColaCola**: clipboard, house-material, and ability-book cart features use its public API. [Script](https://greasyfork.org/en/scripts/567386)
- **MWITools** by **bot7420 and shykai**: the source of the Combat Power Score logic used on cards. MWITools credits the original algorithm to **Ratatatata**. [MWITools](https://greasyfork.org/en/scripts/494467) · [Original algorithm script](https://greasyfork.org/en/scripts/511240)
- **MWI-Equipment-Diff** by **BKN46**: the implementation reference for equipment stat comparison. [Script](https://greasyfork.org/en/scripts/537282)
- **MWI Combat Simulator** by **shykai**: the combat simulation algorithm used by Equipment Comparison. [Project](https://github.com/shykai/MWICombatSimulatorTest)

## Character and Party Cards

### What It Does

Generates character, party, or loadout cards from game data. Cards can show equipment and abilities, production tools, combat levels and houses, production levels and houses, chat appearance, data time, and Combat Power Score. The Combat Power Score algorithm is sourced from **MWITools**.

### Character Cards

1. Click the bordered character name at the top of the page, or open the current character card from Sunrishe Toolkit. The entry is restored automatically after switching characters.
2. When viewing another character's profile, click **View Character Card** to generate their card.
3. Click **Generate Loadout Card** on a combat or production loadout page to generate a card from the current loadout. Combat loadout cards also use the current character's equipped production tools when calculating Combat Power Score.
4. Use the search box to switch among cached characters. **Reset Character Data** returns to the character that was selected when the dialog opened.
5. Abilities shown on the current account's character card can be changed by clicking an ability slot. The picker shows each ability's level, icon, and localized name, and supports searches in Chinese or English. Other characters' abilities cannot be edited.
6. Select **Two Columns** to switch between one- and two-column display. **Card Layout** offers Combat, Production, or All. Combat layout shows equipment, abilities, combat levels, and combat houses; Production layout adds production tools, production levels, and production houses.
7. **Download Card** exports a PNG image. **Copy Card** writes the PNG image directly to the clipboard.

### Party Cards

1. After joining a party, click **Party Card** in the party area.
2. Select a cached character from the search list to add them to the card. Up to five characters can be shown.
3. Drag a card title to reorder cards, or hover over a card to remove that character.
4. **Reset Party Data** restores the current party members. Party cards can also be downloaded or copied as PNG images.

### Default Layouts

- Current-character cards and profile cards use **Two Columns + All** by default.
- Combat loadout cards use **Two Columns + Combat**; production loadout cards use **Two Columns + Production**.
- Party cards use **One Column + Combat** by default. The layout can still be changed after opening.

### Notes

- Click **View Profile** in the game to retrieve and cache another character's latest public profile.
- **Data Time** is when that character's profile was retrieved or updated, not when the image was generated.
- If another character's public profile does not include equipment, house, or other details, the card indicates that only limited data is available.
- Copying images requires browser permission to write images to the clipboard. Use Download Card when this is unavailable.
- Cards are exported at `2x` resolution. Larger parties require more time and memory to generate.

## Ability Upgrade Calculator

### What It Does

Plans upgrade costs for multiple abilities, including required ability books and totals at the Best Ask Price and Best Bid Price. It can also open the game market and integrate with MWI Market Mate.

### How to Use

1. Open it from Sunrishe Toolkit or click **Upgrade Calculator** on the Abilities page. The learned-ability dialog provides both **Go to Market** and an upgrade calculator entry that automatically selects that ability.
2. Click **Add Ability** and search by Chinese name, English name, or HRID. Clicking the icon of an added ability opens the market page for its ability book.
3. Selecting a profession preset clears the list first, then adds that preset's five commonly used abilities.
4. **Level Preset** sets target levels for the first five abilities in order, such as `10/10/10/10/10` or `30/50/50/50/50`.
5. Target levels can be entered directly or selected from common values.
6. The character's actual level and experience are used by default. Select the checkbox beside Starting Level to calculate from `0%` experience at a custom level.
7. With **MWI Market Mate** installed, the action column shows a cart button that adds the required ability books for that row to its shopping cart.
8. **Clear List** removes only the current calculation list and does not affect character data.
9. Click the help icon beside the title to view the rules for ability book quantities, prices, and starting experience. It can be opened by clicking on both desktop and mobile devices.

### Calculation Rules

- Only abilities with a corresponding ability book can be added, and the same ability cannot be added twice.
- Starting levels range from `0-199`; target levels range from `1-200`.
- Without a custom starting level, the required experience is reduced by the character's actual experience progress at the current level.
- A custom starting level begins at `0%` experience for that level. A level 0 ability also requires one additional book to unlock it.
- Required ability books are rounded up to `0.1` book. Market totals and shopping-cart quantities are rounded up to whole books.
- **Best Ask Price** is the lowest price currently available for immediate purchase. **Best Bid Price** is the highest current purchase offer. A total is omitted when the corresponding price is unavailable.

### Notes

- Abilities, ability-book experience, and level experience tables come from game data. Market prices come from the game's public market data.
- Profession presets are bundled with the toolkit. Selecting one replaces the current list.
- Market data is cached. The calculator shows the timestamp of the market data currently in use.

## House Upgrade Material Calculator

### What It Does

Calculates required materials, current inventory, missing quantities, and market value from the selected starting and target house levels.

### How to Use

1. Click **Upgrade Calculator** on the Houses page, or open it from Sunrishe Toolkit.
2. Select the houses to upgrade and set their starting and target levels separately.
3. Use the production and combat categories to select houses in batches. Batch level changes affect only the corresponding starting or target levels.
4. Switch between item names and HRIDs in the results, or export the results as CSV.
5. With **MWI Market Mate** installed, missing materials can be added directly to its shopping cart.

### Notes

- Current house levels, upgrade materials, item details, and inventory are read from game data.
- Market prices come from the game's public market data. **Missing Value** counts only non-coin materials that are not already in inventory.
- **Total Value** includes upgrade coins and the value of all materials. **Material Value** excludes coins.
- Resetting levels reloads the current house levels and does not change any in-game house data.

## Combat Upgrade Calculator

### What It Does

Plans combat upgrades by profession, training order, and experience rate, then calculates each stage's duration, estimated completion time, and optional action count.

### How to Use

1. Enter **Primary XP** and **Secondary XP** in `K/h`. Enter EPH only when an estimated action count is needed.
2. The default list contains Stamina, Intelligence, Attack, Defense, and whichever of Melee, Ranged, or Magic currently has the highest level.
3. Double-click a profession icon at the top to add it again. Drag from the sequence cell in the first column to reorder training stages.
4. Current levels and experience come from character data. Select the checkbox beside Starting Level to enter a custom value. Target Level accepts either direct input or a common preset.
5. Stamina and Intelligence are always secondary; Ranged and Magic are always primary; Attack, Defense, and Melee can be either primary or secondary.
6. Select **Concurrent** to place eligible adjacent stages in the same sequence. Stages in one sequence start together, and the next sequence waits for every stage in the previous sequence to finish.
7. The experience rate in each row can override the corresponding Primary XP or Secondary XP value at the top.
8. Each stage displays hours and days on separate lines. The total row shows total days, with total hours available on hover. Hover over an estimated completion time to see its estimated start time.
9. Click the help icon beside the title to view calculation rules and limitations. It can be opened by clicking on both desktop and mobile devices.

### Calculation Rules

- Secondary training uses the full Secondary XP rate.
- A concurrent primary stage uses Primary XP. A non-concurrent primary stage uses Primary XP plus Secondary XP.
- Adjacent secondary stages with Concurrent selected are merged into the preceding secondary stage's sequence.
- A concurrent primary stage joins the first secondary sequence after the preceding primary stage.
- The ending level of a concurrent primary stage cannot be edited. It is calculated from the duration of the secondary training stages that it overlaps, including the resulting experience percentage.
- A profession cannot appear twice in the same sequence, and the list must contain at least one primary profession.
- When the same profession appears more than once, the later stage inherits the exact ending level and experience progress of the previous stage.
- Without a custom starting level, the character's actual experience is used. A custom starting level begins at `0%` experience for that level.

### Notes

- The level experience table comes from public game data. The calculator does not change character data.
- Target Level accepts any value from `1-200`; the common level list includes `200`.
- **Reset List** restores the default professions and current character levels while retaining Primary XP, Secondary XP, and EPH. Row-specific experience overrides that match the default professions are also retained.
- A stage cannot be calculated when its experience rate is `0` or when no primary profession is present.

## Equipment Comparison

### What It Does

Compares two items for the same wearable slot within a solo combat preset, showing stat differences, simulated DPS, equipment price difference, and DPS gain per 10M coins.

### How to Use

1. Open **Equipment Comparison** from Sunrishe Toolkit and select a combat preset.
2. Select a baseline item, then another item for the same wearable slot. Pickers can filter by slot and search Chinese names, English names, or HRIDs.
3. An applicable equipped item is preferred as the baseline and keeps its actual enhancement level. Other items default to `+10`; enhancement levels can be adjusted from `0-20`.
4. Once both items are selected, the calculator simulates both sets and shows DPS, DPS change, the price difference between the two selected items, and DPS gain per 10M coins.
5. Combat and non-combat stats are grouped separately. Differences are calculated as “comparison item - baseline item”; green indicates an improvement and red a reduction. A shorter attack interval is treated as an improvement.

### Notes

- Equipment, abilities, stats, enhancement multipliers, combat levels, and house levels come from current game data.
- Candidates are filtered by combat style and wearable slot. Items without a combat-style restriction, such as necklaces, earrings, and rings, are treated as universal. Production tools, charms, and trinkets are excluded.
- A two-handed weapon occupies the weapon slot and removes both main-hand and off-hand items; main-hand and off-hand items may be simulated together.
- The two setups differ only in the selected item; all other equipment and character conditions remain identical. Both use the preset's `+10` solo set, `4/6/6/6/6` ability levels, and the same standard target, which neither attacks nor can be defeated.
- Each setup averages 5 matching deterministic seeds, simulated for 3 hours each, to reduce random variance.
- The combat core is derived from MWI Combat Simulator. Game data comes from MST's current in-memory client data, with no runtime request for external simulator assets.
- Equipment price difference is calculated as “comparison item price - baseline item price.” Prices are read for the selected enhancement level, preferring the Best Ask Price and falling back to the latest trade or Best Bid Price.
- Results compare two items under consistent conditions. They do not represent actual gains against a specific monster, in a combat zone, or within a party.

## Dungeon Profit Calculator

### What It Does

Calculates the long-run expectation of Normal/Refinement Chests and their contents from the selected dungeon, tier, and clear time, then calculates conservative and optimistic expected profit at current market prices. Every day uses 24 hours.

### How to Use

1. Open **Dungeon Profit Calculator** from Sunrishe Toolkit and select a dungeon and T0-T2 tier.
2. Enter the clear time. Every day uses a fixed 24 hours.
3. Optionally enter Daily Food/Drink Cost in millions. It is deducted from Daily Expected Profit and allocated across Expected Profit per Run.
4. Crafted Keys use Artisan Tea by default. Guzzling Pouch reads the highest enhancement level from equipped, inventory, and stored items; it is enabled only when one is owned, and its checkbox controls the level selector.
5. Compare Crafted Keys and Purchased Keys side by side in the Material Costs and Expected Output sections, including Entry Ticket/Chest Key costs, after-tax chest revenue, Daily Expected Profit, and Expected Profit per Run.
6. Enable **Custom Mode** to choose Crafted or Purchased Keys, the corresponding Ask/Bid purchase method, and the Ask/Bid goods sale method. The left pair retains the conservative/optimistic range for the selected Key Source; the merged right pair shows the exact custom combination.

### Calculation Rules

- Daily Runs equal `round2(24 × 60 ÷ clear time in minutes)` and are not rounded down.
- Every dungeon uses `1.295` Normal Chests per run. T0 has no Refinement Chest, T1 uses `1.295 × 0.33`, and T2 uses `1.295`. Per-run and daily chest quantities are rounded to two decimals.
- Quantities and amounts display at most two decimal places, with trailing decimal zeros removed.
- Party size, Combat Drop Quantity, and Combat Drop Rate do not affect dungeon chest quantities and are not inputs.
- Expected item counts use each chest's official drop rates and average quantity ranges. Duplicate items are combined and nested chests are expanded recursively.
- Entry Ticket quantity equals expected Normal Chest quantity. Chest Keys use expected chest openings.
- Crafted and purchased Entry Ticket/Chest Key costs are shown together. Only unit and daily costs are listed. Artisan Tea and Guzzling Pouch affect crafted costs only.
- Daily Food/Drink Cost is optional. When entered, it is included in both daily cost scenarios and allocated to each run using Daily Runs.
- Conservative values use `bid` for revenue and `ask` for costs. Optimistic values use `ask` for revenue and `bid` for costs.
- Both `bid` and `ask` sell totals always deduct 2% market tax. Cowbells have no special tax rate. Each Normal Chest After-Tax Profit deducts its allocated Entry Ticket and Normal Chest Key costs for the selected crafted/purchased source, while each Refinement Chest After-Tax Profit deducts its Chest Key cost. The Quantity column keeps the daily chest expectation.
- Daily Expected Profit multiplies each per-chest profit by its daily quantity, then deducts Daily Food/Drink Cost without deducting key costs again. Expected Profit per Run equals Daily Expected Profit divided by Daily Runs. T0 hides the Refinement Chest profit row.
- When one market side is `-1`, the calculator falls back to a valid opposite-side or recent transaction price. An item is valued at `0` and reported only when no valid price remains.

### Notes

- Dungeon, reward, and item data come from current public game data. Prices come from public game market data.
- Clear time is entered manually. Enter the effective time after Artisan Tea, Guzzling Pouch, and other speed effects.
- Each result is a deterministic long-run expectation for the same inputs, not a guarantee for one actual chest-opening session, and does not include historical prices. Crafted and purchased key costs are calculated side by side from current material and finished-item prices.
- Missing market prices are valued at `0` and reported in the results.

## Switch Character

Click **Switch Character** in Sunrishe Toolkit to open the game's native character selection page.

## Profit-Site and Combat Loadout Data

- **Legacy profit site**: Milkonomy (`https://milkonomy.pages.dev/`).
- **New profit site**: the hyhfish version (`https://hyhfish.github.io/milkonomy/`), which extends the legacy site with additional features.

### What It Does

Converts current equipment or combat loadouts into formats supported by the legacy Milkonomy site, the newer hyhfish site, or the combat simulator.

### How to Use

1. Click **Copy Profit-Site Data** in the equipment panel, then choose **Copy Milkonomy Data** or **Copy hyhfish Data**.
2. In combat loadout details, click **Copy Combat Simulator Data** to generate data from the currently selected loadout.
3. In combat loadout details, click **Generate Loadout Card** to generate a character card for that loadout.
4. On the corresponding profit site, click **Sync Loadout** to import loadout data synchronized from the game.

### Notes

- Each copy function preserves the data structure required by its target website and does not change in-game loadouts.
- Milkonomy cross-site synchronization requires userscript storage synchronization and cross-origin permissions. Keep the permissions requested by the script enabled.

## MWI Market Mate Clipboard Import

### What It Does

With **MWI Market Mate** installed, MST adds an **Import Clipboard** button to its list panel. MST parses the clipboard text and adds the resulting items through Market Mate's public shopping-cart API.

### Supported Formats

1. Both `quantity item name` and `item name quantity` are supported.
2. Item names may be Chinese, English, or full `/items/...` HRIDs. Enhanced items can use `item name+enhancement level`.
3. Prefix a quantity with `+` to fill inventory up to that target after subtracting items already owned, such as `+100 Milk` or `Milk +100`.
4. Use `quantity/h` or `quantity/H` for hourly demand. Without a replenishment duration, demand is calculated for 24 hours.
5. Put `补充N天` on the first line to treat all following quantities as hourly demand, allowing `/h` to be omitted. Decimal day values are supported.
6. Decimal quantities are supported and are rounded up to whole items when added to the cart.
7. Unrecognized items are skipped while all other valid items are still imported.

### Examples

Enter one item per line in the clipboard. Inventory quantities below are examples used only to explain the result.

**Fixed Quantities**

```text
100 Milk
Cheese 250
2 Cheese Sword+3
Cheese Sword+5 1
```

Result: adds 100 Milk, 250 Cheese, two `+3` Cheese Swords, and one `+5` Cheese Sword. Fixed quantities do not subtract current inventory.

**Item HRIDs**

```text
100 /items/milk
/items/cheese +500
```

Result: adds a fixed quantity of 100 Milk and fills Cheese inventory to 500. If 120 Cheese are already owned, 380 Cheese are added.

**Fill to Target Inventory**

```text
+1000 Milk
Cheese +500
Cheese Sword+3 +10
```

If inventory contains 300 Milk, 120 Cheese, and four `+3` Cheese Swords, the result adds 700 Milk, 380 Cheese, and six `+3` Cheese Swords. Nothing is added when inventory already meets the target.

**Replenish One Day of Hourly Consumption**

```text
25/h Milk
Cheese 10/h
```

If inventory contains 100 Milk and 40 Cheese, the result adds 500 Milk and 200 Cheese:

```text
Milk: 25 x 24 - 100 = 500
Cheese: 10 x 24 - 40 = 200
```

**Replenish Multiple Days**

```text
补充3天
25 Milk
Cheese 10
```

`补充3天` must be on the first line. Following quantities are calculated across 72 hours. If inventory contains 100 Milk and 40 Cheese, the result adds 1,700 Milk and 680 Cheese:

```text
Milk: 25 x 72 - 100 = 1700
Cheese: 10 x 72 - 40 = 680
```

### Notes

- Clipboard import, house-material cart, and ability-book cart buttons are hidden when MWI Market Mate is not installed or has not finished loading.
- Item translations come from the game's language resources. Prefer the complete item name in the current game language or an HRID.
- Importing only adds items to the Market Mate shopping cart and never places orders automatically.

---

# 更新日志 / Changelog

## 版本规划 / Versioning

- EDS 历史线保留 `1.x` 版本号，最后一个作为融合基础的版本是 `1.2.7`。
  The legacy EDS line keeps the `1.x` version numbers, with `1.2.7` as the final base version used for the merge.
- MST 从 `2.0.0` 开始，表示从装备数据同步脚本升级为综合工具箱。
  MST starts from `2.0.0`, marking the upgrade from an equipment data sync script into a full toolkit.
- 后续版本遵循 SemVer：不兼容变更使用 major，向后兼容的新功能使用 minor，修复和兼容性调整使用 patch；开发构建使用 `-dev.<timestamp>` 后缀。
  Later releases follow SemVer: incompatible changes use a major version, backward-compatible features use a minor version, fixes and compatibility changes use a patch version, and development builds use the `-dev.<timestamp>` suffix.

## v2.7.20

1. 补全油猴头部简介，明确列出角色/队伍名片、升级规划、装备提升计算器、地下城收益、配装同步和市场伴侣增强。
   Expands the userscript header description to list character/party cards, upgrade planning, equipment comparison, dungeon profit, loadout sync, and Market Mate enhancements.

## v2.7.19

1. 同步油猴头部中文描述，将“装备对比”更新为“装备提升计算器”，与工具箱入口和使用说明保持一致。
   Updates the Chinese userscript header description from "equipment comparison" to "equipment upgrade calculator" for consistency with the toolkit entry and user guide.

## v2.7.18

1. 核对文档与现有代码逻辑，修正 README 的 `dist/` 忽略说明、地下城回归清单中的价格方向描述、英文市场价格术语，并明确装备提升候选列表排除的是护符、Trinket 和生活工具。
   Checks the documentation against the current code, corrects the README `dist/` ignore note, Dungeon Profit price-direction checklist, English market-price terms, and clarifies that Equipment Comparison excludes charms, trinkets, and skilling tools.

## v2.7.17

1. 装备提升相关中文命名统一使用“装备提升计算器”，与其他工具箱计算器命名保持一致。
   Standardizes the Chinese Equipment Comparison naming as "装备提升计算器" for consistency with other toolkit calculators.

## v2.7.16

1. 修正 House Room 中文术语，按游戏官方译名恢复为“房屋”，并补充测试锁定该规则；市场列头“左一 / 右一”保持不变。
   Corrects the Chinese House Room wording back to the official "房屋" term and adds a regression test for it, while keeping the left-one/right-one market headers unchanged.

## v2.7.15

1. 按游戏官方中文资源核对术语，将单个 House Room 相关中文统一为“房间”，并保持市场列头“左一 / 右一”不变。
   Aligns single House Room wording with the game's Chinese resources as "房间" while keeping the established left-one/right-one market headers unchanged.

## v2.7.14

1. 合理化各计算器弹窗的标题提示说明，并为房屋升级弹窗补充同样的问号说明入口。
   Rationalizes title help text across calculator dialogs and adds the same question-mark help entry to the House Upgrade dialog.

## v2.7.13

1. 进一步收紧地下城项目列，并将释放的宽度分配给默认和自定义金额列。
   Further tightens the Dungeon item column and reallocates the freed width to the default and custom value columns.

## v2.7.12

1. 技能升级中文市场列头统一简称为“左一 / 总价”和“右一 / 总价”，英文文案保持不变。
   Shortens the Chinese Ability Upgrade market headers to the established left-one/right-one terms while keeping the English labels unchanged.

## v2.7.11

1. 修复技能升级计算器默认出现横向滚动条的问题，并按中英文实际内容收紧装备提升弹窗和属性列宽。
   Fixes the unexpected horizontal scrollbar in Ability Upgrade and tightens the Equipment Comparison dialog and attribute columns using measured Chinese and English content widths.

## v2.7.10

1. 进一步收紧地下城项目列和弹窗宽度，在保持数量与金额列可读性的同时减少空白。
   Further tightens the Dungeon item column and dialog while keeping quantity and value columns readable.

## v2.7.9

1. 根据中英文实际内容宽度再次收紧地下城表格和弹窗；自定义结果改为单个有效金额列，不再占用双列宽度。
   Further tightens the Dungeon table and dialog using measured content widths; Custom results now use one effective value column instead of two.
2. 修复连续切换地下城自定义模式时 `uhtml` 选项节点锚点失效导致的控制台错误。
   Fixes a console error caused by invalid `uhtml` option anchors when repeatedly toggling Dungeon Custom Mode.

## v2.7.8

1. 地下城结果表根据内容长度收紧列宽，并将弹窗最大宽度缩小至 `48rem`。
   Tightens Dungeon result columns based on their content and reduces the maximum dialog width to `48rem`.

## v2.7.7

1. 地下城预期产出区调整为先显示每车期望收益，再显示每日期望收益。
   Shows expected profit per run before daily expected profit in Dungeon results.

## v2.7.6

1. 地下城材料成本列头只显示买入方向，预期产出列头只显示卖出方向；同步调整结果表列宽并缩小弹窗宽度。
   Shows only buy directions in Dungeon material costs and only sell directions in expected output, while refining table columns and reducing the dialog width.

## v2.7.5

1. 地下城操作区最后一行不再拉伸控件；结果表移除第二层固定表头，并在“材料成本”和“预期产出”分区行分别显示价格方向。
   Keeps the last Dungeon control row at the normal column width and moves price-direction headers into both result sections.

## v2.7.4

1. 地下城操作区改为自适应宽度，每行控件自动均分并占满可用空间，同时适配桌面端与移动端。
   Makes Dungeon controls fluid so every row fills the available width and adapts automatically across desktop and mobile viewports.

## v2.7.3

1. 地下城中文价格方向统一简称为“左买 / 右买 / 左卖 / 右卖”，英文 `Ask Buy / Bid Buy / Ask Sell / Bid Sell` 保持不变。
   Shortens the Chinese Dungeon price-direction labels while retaining the existing English Ask/Bid wording.

## v2.7.2

1. 修复地下城操作区的复选框控件与同排下拉框未水平对齐的问题。
   Aligns Dungeon toolbar checkbox controls horizontally with dropdowns in the same row.

## v2.7.1

1. 修复地下城自定义模式切换钥匙来源、购入方式或卖出方式后，列头和自定义金额可能停留在旧结果的问题。
   Fixes Dungeon Custom Mode headers and custom amounts potentially remaining stale after changing the key source, purchase method, or sale method.

## v2.7.0

1. 地下城收益计算器新增自定义模式，可独立选择制作/购买钥匙、左一/右一购入及左一/右一卖出；结果表保持四列，并在右侧展示自定义组合结果。
   Adds Custom Mode to the Dungeon Profit Calculator, allowing independent Crafted/Purchased Key, Ask/Bid purchase, and Ask/Bid sale choices while retaining four result columns and showing the custom combination on the right.
2. 地下城弹窗加宽，操作区固定为四个等宽列，窄屏自动切换为两列。
   Widens the Dungeon dialog and uses four equal control columns, switching to two columns on narrow screens.

## v2.6.6

1. 将普通与精炼宝箱税后收益修正为单个宝箱收益；数量列保留每日宝箱期望，每日收益按单箱收益乘数量汇总。
   Changes Normal and Refinement Chest After-Tax Profit to per-chest values while retaining daily expected quantities and calculating Daily Expected Profit from per-chest profit times quantity.

## v2.6.5

1. 修正地下城宝箱税后收益：制作钥匙和购买钥匙分别扣除对应门票与开箱钥匙成本，普通/精炼宝箱单独归集，每日收益不再重复扣费。
   Fixes Dungeon after-tax chest profit by deducting the matching crafted or purchased Entry Ticket and Chest Key costs, separating Normal and Refinement Chest costs, and avoiding duplicate deductions from Daily Expected Profit.

## v2.6.4

1. 地下城收益计算器默认选择官方列表中的第一个地下城和 T0，单次耗时默认改为 30 分钟。
   Defaults the Dungeon Profit Calculator to the first official dungeon, T0, and a 30-minute clear time.

## v2.6.3

1. 修正地下城暴饮之囊默认等级：在当前装备、背包和仓库的全部持有物品中选择最高强化等级，不再优先使用当前装备。
   Fixes the default Dungeon Guzzling Pouch level by selecting the highest enhancement across equipped, inventory, and stored items instead of prioritizing the equipped item.

## v2.6.2

1. 地下城制作成本默认启用工匠茶，并根据当前装备或背包库存自动设置暴饮之囊开关与强化等级。
   Enables Artisan Tea by default for crafted Dungeon keys and initializes the Guzzling Pouch toggle and enhancement level from equipped or inventory items.
2. 将市场数据时间并入每日轮次与宝箱摘要同一行，并统一每日、每车期望收益与宝箱税后收益的展示样式。
   Moves the market data time into the same summary row as daily runs and chests, and aligns daily and per-run expected profit styling with after-tax chest revenue.

## v2.6.1

1. 将地下城结果上半区修正为“材料成本 / Material Costs”，并将暴饮之囊的无文本复选框改为与名片双列切换一致的方形按钮样式；强化等级只由该复选框启用或禁用。
   Corrects the upper Dungeon Profit section to Material Costs, styles the Guzzling Pouch checkbox as a square button matching the Character Card two-column toggle, and makes that checkbox the sole control for enabling its level selector.

## v2.6.0

1. 地下城收益同时展示制作钥匙和购买钥匙的四列成本/收益对比，移除成本方式切换，并增加高对比度双层表头。
   Shows four side-by-side cost/profit columns for Crafted Keys and Purchased Keys, removes the cost-basis switch, and adds a higher-contrast two-level table header.
2. 新增可选的每日药品/饮料成本，按每日固定成本计入两套总成本，并分摊到每车期望收益。
   Adds optional Daily Food/Drink Cost, includes it in both daily cost scenarios, and allocates it to Expected Profit per Run.
3. 暴饮之囊增加默认勾选的独立复选框；结果摘要固定单行自适应三格或四格，并统一宝箱税后收益与中英文价格方向文案。
   Adds a default-enabled Guzzling Pouch checkbox, keeps the summary in one adaptive three- or four-cell row, and standardizes after-tax chest revenue and localized price-direction labels.

## v2.5.16

1. 地下城结果列表分区文案统一为上方“材料/成品成本”、下方“预期产出”。
   Renames the Dungeon Profit result sections to Material/Finished Item Costs above and Expected Output below.

## v2.5.15

1. 精简地下城成本区：门票和开箱钥匙单位成本移入材料/成品成本表，移除材料消耗格子及全部每车成本，只保留单位和每日成本。
   Streamlines Dungeon Profit costs: moves Entry Ticket and Chest Key unit costs into the Material/Finished Item Costs table, removes the Material Use tile and all per-run costs, and keeps only unit and daily costs.
2. 地下城操作区改为默认四等分并随宽度自动换行；数量和金额最多显示两位小数，同时去掉尾随 `0`。
   Makes Dungeon Profit controls four equal columns by default with automatic wrapping, and displays quantities and amounts with at most two decimals and no trailing zeros.

## v2.5.14

1. 重做地下城收益口径：普通宝箱固定为每车 `1.295`，T1/T2 额外精炼宝箱分别为 `1.295 × 0.33` 和 `1.295`；每日轮次、宝箱和门票均保留两位小数，门票数量等于普通宝箱期望。
   Reworks Dungeon Profit rules: Normal Chests are fixed at `1.295` per run, while T1/T2 add `1.295 × 0.33` and `1.295` Refinement Chests. Daily Runs, chests, and tickets use two decimals, and ticket quantity equals expected Normal Chest quantity.
2. 移除队伍人数、角色 Buff、掉落数量/掉落率和市场税开关；市场卖出固定扣除 2% 税，并补齐门票/钥匙每车与每日成本、普通/精炼宝箱收益和每车收益。
   Removes party size, character buffs, drop quantity/rate, and the market-tax toggle. Market sales always deduct 2% tax, with per-run/daily ticket and key costs, Normal/Refinement Chest revenue, and profit per run.

## v2.5.13

1. 修正地下城宝箱奖励概率：只使用官方难度数据，不再错误应用 `Combat Drop Rate`；界面同步移除该无效参数，只保留 `Combat Drop Quantity`。
   Fixes dungeon chest reward rates to use official tier data without incorrectly applying `Combat Drop Rate`; removes that ineffective input and keeps only `Combat Drop Quantity`.

## v2.5.12

1. 地下城收益移除 3、7、14 天三组重复结果，固定按 24 小时计算并只展示一行每日期望净利润。
   Removes the duplicate 3-day, 7-day, and 14-day Dungeon Profit results, uses a fixed 24-hour calculation, and displays one Daily Expected Net Profit row.

## v2.5.11

1. 地下城收益改为确定性期望计算：先计算普通与精炼宝箱期望数量，再按官方掉落率和平均数量递归展开嵌套宝箱、合并重复物品并计算期望卖出总价。
   Changes Dungeon Profit to a deterministic expectation: calculates expected normal and refinement chests, recursively expands nested chests from official drop rates and average quantities, combines duplicate items, and values expected drops.
2. 门票只按实际通关次数计算，开箱钥匙按期望开启数量计算；3、7、14 天分别取整完整周期通关次数，同一输入不再产生随机波动。
   Uses actual clears only for tickets and expected openings for chest keys; complete clears are rounded down separately for 3, 7, and 14 days, with no random variance for identical inputs.

## v2.5.10

1. 地下城收益改为完整随机模拟：先按输入条件逐次生成整数宝箱，再按官方掉落表逐箱生成实际物品；重复物品合并，嵌套宝箱继续打开。
   Changes Dungeon Profit to a full random simulation: every clear rolls integer chests, then every chest rolls actual items from the official drop table; duplicate items are combined and nested chests continue opening.
2. 3、7、14 天使用独立随机序列，实际掉落分别按 `bid/ask` 卖出总价计价并扣除真实门票、开箱钥匙和两侧市场税，得到收益区间。
   Uses independent random sequences for 3, 7, and 14 days, prices actual drops at both `bid` and `ask`, and subtracts actual ticket, chest-key, and market-tax costs to produce the profit range.

## v2.5.9

1. 地下城开箱收益改为显式的随机掉落期望计算：逐项使用掉落率、平均数量和物品价格，合并重复掉落，并保留嵌套宝箱与代币迭代估值。
   Changes dungeon chest revenue to an explicit random-drop expectation: each item uses drop rate, average quantity, and item price; duplicate drops are combined; nested chests and tokens remain iterative.
2. 地下城结果分为材料/成品成本与宝箱预期产出，增加每日总成本；修复市场单侧价格为 `-1` 时把有效产出误算为零的问题。
   Separates material/finished-item costs from expected chest contents, adds daily total cost, and fixes valid output being valued at zero when one market side is `-1`.

## v2.5.8

1. 地下城收益移除统计周期输入，固定分别模拟 3、7、14 天并折算单日净利润；队伍人数默认 5 人，暴饮之囊默认 `+5`。
   Removes the custom Dungeon Profit period input, runs separate 3-day, 7-day, and 14-day simulations for daily net profit, defaults party size to 5, and defaults Guzzling Pouch to `+5`.
2. 修复切换成本方式时的页面报错，并将门票、钥匙、材料消耗和市场数据时间统一为四格展示。
   Fixes the page error when switching cost basis and presents ticket cost, key cost, material consumption, and market data time in a four-cell row.

## v2.5.7

1. 地下城收益操作区改为指定的三排布局，每日固定按 24 小时模拟，并用一个开关同时读取角色的战斗掉落数量与掉落率 Buff。
   Reorders Dungeon Profit controls into three rows, fixes daily simulation at 24 hours, and uses one toggle for both character Combat Drop Quantity and Combat Drop Rate buffs.

## v2.5.6

1. 修正地下城收益的门票成本逻辑，门票需求始终按实际通关次数计算，并移除“宝箱份额”门票口径选项。
   Fixes Dungeon Profit ticket cost logic so ticket requirements always use actual clears, and removes the Chest Shares ticket-basis option.

## v2.5.5

1. 统一地下城收益说明中的英文 Buff 名称，使用官方 `Combat Drop Quantity` 和 `Combat Drop Rate`。
   Standardizes English buff names in Dungeon Profit documentation with the official `Combat Drop Quantity` and `Combat Drop Rate` terms.

## v2.5.4

1. 优化地下城收益计算器复选框样式，改为接近名片双列切换的紧凑按钮外观。
   Improves Dungeon Profit Calculator checkbox styling with a compact button-like look similar to the card two-column toggle.

## v2.5.3

1. 修复地下城收益计算器在官方语言资源尚未就绪时，地下城下拉项退回英文小写名称的问题。
   Fixes Dungeon Profit Calculator dungeon options falling back to lowercase English names before official language resources are ready.

## v2.5.2

1. 修复用户名片顶部聊天图标 class 拼接缺少空格的问题，恢复 18px 图标尺寸和原有顶部布局。
   Fixes missing class separators on user-card header chat icons, restoring the 18px icon size and original header layout.

## v2.5.1

1. 修复角色名片战力打造分服务初始化顺序问题，避免打开用户名片时出现计算失败警告。
   Fixes the character-card build-score service initialization order, preventing calculation warnings when opening the user card.
2. 收拢队伍名片中过度拆出的单方法包装类，保持功能不变并让结构更接近原始脚本的连续逻辑。
   Consolidates over-split single-method wrappers in party cards while keeping behavior unchanged and closer to the original script flow.
3. 将名片清理监听从 `unload` 调整为 `pagehide`，避免现代浏览器权限策略警告。
   Changes card cleanup from `unload` to `pagehide` to avoid modern browser permissions-policy warnings.

## v2.5.0

1. 地下城收益计算器正式纳入工具箱，可按地下城、难度、队伍人数、通关耗时和运行周期估算收益。
   The Dungeon Profit Calculator is now part of the toolkit, estimating profit by dungeon, tier, party size, clear time, and runtime period.
2. 地下城收益支持读取角色掉落数量、掉落率 Buff 和官方掉落表，并区分保守值与乐观值。
   Dungeon profit now reads Combat Drop Quantity, Combat Drop Rate, and official drop tables, with conservative and optimistic estimates.
3. 建立单文件构建流程，正式包隐藏开发专用语言切换按钮，开发包保留调试入口。
   A single-file build workflow has been added: production builds hide the development-only language toggle, while development builds keep debug entries.
4. 工具箱入口迁移到顶部角色信息区域，顶部角色名可直接打开当前用户角色名片。
   The toolkit entry has moved to the top character-info area, and the top character name now opens the current character card directly.

## v2.4.0

1. 新增装备提升计算器，可按职业方案比较两件装备的属性、模拟 DPS、价格差和每 10M 金币收益。
   Adds Equipment Comparison for comparing two items by combat preset, including stats, simulated DPS, price difference, and DPS gain per 10M coins.
2. 切换游戏语言时，已打开的名片和计算器会即时更新，并保留当前输入和列表。
   Open cards and calculators now update immediately when the game language changes while preserving current inputs and lists.
3. 优化装备选择与结果说明，并修复 MWI 市场伴侣清单中剪贴板导入按钮的显示与去重。
   Improves equipment selection and result guidance, and fixes the display and deduplication of the clipboard import button in MWI Market Mate lists.

## v2.3.0

1. 名片新增生活工具、生活等级与房屋，可按战斗、生活或全部内容展示，并支持单列、双列自由组合。Cards now include production tools, production levels, and production houses, with Combat, Production, or All layouts in either one or two columns.
2. 战斗配装、生活配装及队伍名片会根据用途选择合适的默认布局，切换角色后顶部名片入口也会自动恢复。Combat loadouts, production loadouts, and party cards now use purpose-specific default layouts, and the top card entry is restored automatically after switching characters.
3. 战斗升级计算器完善英文表格显示，目标等级快捷选项增加 200，并精简经验输入操作。The combat upgrade calculator improves its English table layout, adds level 200 to target presets, and streamlines experience inputs.
4. 战斗与技能升级说明改为贴合游戏界面的帮助浮窗，电脑和移动端均可点击查看。
   Combat and ability upgrade guidance now uses game-styled help popovers that can be opened by clicking on desktop and mobile devices.

## v2.2.1

1. 战斗升级计算器现在会按同修时段反推主修的结束等级与精确经验，后续同专业可从该进度继续计算。The combat upgrade calculator now derives a primary profession's ending level and exact experience from concurrent training time, allowing later stages of the same profession to continue from that progress.
2. 战斗列表仅可从序号列拖动，并优化每段耗时和合计行的显示。Combat rows can now be dragged only from the sequence column, with improved stage-duration and total-row displays.
3. 已学技能详情新增直达对应技能书市场的入口。Learned ability details now include a direct link to the corresponding ability-book market.
4. 优化名片技能选择器的等级、图标和名称布局，并调整名片顶部图标间距以匹配游戏界面。
   The card ability picker now has improved level, icon, and name layout, while top-card icon spacing better matches the game interface.

## v2.2.0

1. 战斗升级规划支持专业排序、分段升级与同修编组，并完善重复专业、起止等级和预计时间的计算。Combat upgrade planning now supports profession ordering, staged upgrades, and concurrent grouping, with improved calculations for repeated professions, start/end levels, and estimated times.
2. 技能升级支持多技能列表、职业方案和目标等级预设，可汇总技能书数量与市场总价，并联动 MWI 市场伴侣购物车。Ability upgrades now support multi-ability lists, profession presets, and target-level presets, with totals for ability books and market costs plus MWI Market Mate cart integration.
3. 角色与队伍名片新增缓存角色切换、图片复制等操作，提升多人名片生成速度和导出稳定性。Character and party cards now support cached-character switching and image copying, with faster party-card generation and more stable exports.
4. 优化房屋升级、战斗配装及利润网数据功能，修复材料统计、图标显示和配装数据不一致等问题。House upgrades, combat loadouts, and profit-site data have been improved, fixing material totals, icon display, and inconsistent loadout data.
5. 统一弹窗与操作提示，完善中英文表达、功能说明和移动端显示。
   Dialogs and action notices are now consistent, with improved Chinese and English wording, feature guidance, and mobile display.

## v2.1.0

1. 右上角角色头像升级为 **Sunrishe 工具箱**，集中提供角色切换、用户名片和三种升级计算器入口。The upper-right character portrait now opens **Sunrishe Toolkit**, bringing together character switching, character cards, and three upgrade calculators.
2. 装备面板新增**复制利润网数据**菜单，可分别复制 Milkonomy 与 hyhfish 所需格式；战斗配装的复制和名片按钮调整为独立双按钮行。The equipment panel adds a **Copy Profit-Site Data** menu for Milkonomy and hyhfish formats, while combat loadout copy and card actions now use a dedicated two-button row.
3. 新增战斗升级计算器，可规划多段、重复专业的升级顺序，并计算经验、耗时、预计完成时间和可选战斗次数。A new combat upgrade calculator plans multi-stage and repeated-profession training, calculating experience, duration, estimated completion time, and optional action counts.
4. 新增技能升级计算器，可搜索技能、读取技能书经验与市场价格、估算技能书数量和总价，并直接前往对应市场。A new ability upgrade calculator searches abilities, reads ability-book experience and market prices, estimates book quantities and totals, and opens the corresponding market directly.
5. 战斗等级和技能经验会随游戏数据更新，工具箱与计算器支持中英文即时切换及移动端使用。
   Combat levels and ability experience now update with game data, while the toolkit and calculators support instant Chinese/English switching and mobile use.

## v2.0.0

1. **[银河奶牛]装备数据同步**正式升级为 **MWI Sunrishe Toolkit**，原有 Milkonomy 与战斗模拟器数据同步功能继续保留。**[Milky Way Idle] Equipment Data Sync** has become **MWI Sunrishe Toolkit**, while retaining the existing Milkonomy and combat-simulator synchronization features.
2. 房屋升级计算支持读取当前房屋等级与库存，展示材料缺口和市场价值，并可导出 CSV 或把缺少材料加入市场伴侣购物车。House upgrade calculations now read current house levels and inventory, show missing materials and market value, export CSV, and add missing materials to the Market Mate cart.
3. 角色名片支持当前角色、其他角色和战斗配装，可按缓存角色名称切换展示，并展示装备、技能、房屋、战斗等级、聊天外观及战力打造分。Character cards now support the current character, other characters, and combat loadouts, with cached-character switching plus equipment, abilities, houses, combat levels, chat appearance, and Combat Power Score.
4. 队伍名片支持缓存角色搜索、添加、排序、移除和重置，并支持单人及队伍 PNG 图片导出。Party cards now support searching, adding, ordering, removing, and resetting cached characters, with PNG export for individual and party cards.
5. 支持复制 Milkonomy 预设、同步 Milkonomy 配装以及复制战斗模拟器数据。Adds copying Milkonomy presets, synchronizing Milkonomy loadouts, and copying combat-simulator data.
6. 增加头像快速切换角色，以及市场伴侣清单的剪贴板导入功能。Adds quick character switching from the portrait and clipboard import for MWI Market Mate lists.
7. 支持中英文界面自动跟随游戏语言，并让按钮、弹窗和提示风格与游戏界面保持一致。The Chinese/English interface now follows the game language automatically, with buttons, dialogs, and notices styled to match the game.
8. 名片图片统一使用 `2×` 清晰度导出，在清晰度和文件大小之间取得平衡。
   Card images are exported consistently at `2x` resolution to balance clarity and file size.

## EDS 历史版本 / EDS Legacy Releases

### v1.2.7

1. 新利润网（hyhfish 改版）支持同步披风。The newer hyhfish version now supports cape synchronization.
2. 修复复制 Milkonomy 数据时遗漏个人成就增益的问题。
   Fixed missing personal achievement bonuses when copying Milkonomy data.

### v1.2.5

1. 增加对新利润网 `hyhfish.github.io/milkonomy` 的支持。
   Added support for the newer profit site at `hyhfish.github.io/milkonomy`.

### v1.1.3

1. 战斗配装支持复制战斗模拟器格式的数据。Combat loadouts can now be copied in combat-simulator format.
2. 避免在非游戏网站注入游戏界面样式。
   Prevented game-interface styles from being injected on non-game websites.

### v1.0.2

1. 修复 Milkonomy 从未配置过方案时无法同步的问题。
   Fixed Milkonomy synchronization when no loadout had previously been configured.

### v1.0.1

1. 修复中文镜像站无法使用的问题。
   Fixed compatibility with the Chinese mirror site.

### v1.0.0

1. 支持在游戏网站复制生活配装方案数据。Added copying production loadout data from the game website.
2. 支持在 Milkonomy 网站同步生活配装方案。
   Added production loadout synchronization on Milkonomy websites.
