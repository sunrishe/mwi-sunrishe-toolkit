'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const runtimeSourceFile = readSourceFile('src', 'common', 'runtime.js');
const dataSourceFile = readSourceFile('src', 'common', 'data.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const moduleSourceFile = readSourceFile('src', 'modules', 'labyrinth-supply', 'index.js');
const moduleCssSourceFile = readSourceFile('src', 'modules', 'labyrinth-supply', 'styles.css');
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const usageSource = readSourceFile('docs', 'usage.md');

function loadCalculator() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/labyrinth-supply/index.js')}
      calculateLabyrinthSupply;`,
    {}
  );
}

// VM 产物来自另一个 realm，原型不同，比较前归一化为普通对象。
function normalize(items) {
  return [
    ...items
  ].map((item) => ({itemId: String(item.itemId), quantity: Number(item.quantity)}));
}

const EXPERT_CONFIG = {
  torch: {hrid: '/items/expert_torch', cap: 100},
  shroud: {hrid: '/items/expert_shroud', cap: 4},
  beacon: {hrid: '/items/expert_beacon', cap: 5},
  teaCrate: {hrid: '/items/expert_tea_crate'},
  coffeeCrate: {hrid: '/items/expert_coffee_crate'},
  foodCrate: {hrid: '/items/expert_food_crate'}
};

test('迷宫补给：道具按上限×次数减持有，补给箱按次数减持有', () => {
  const calculate = loadCalculator();
  // 火把上限 100、持有 5：1 次入场补 95；5 次入场补 100×5-5 = 495。
  const owned = {
    '/items/expert_torch': 5,
    '/items/expert_shroud': 1,
    '/items/expert_beacon': 12,
    '/items/expert_tea_crate': 2,
    '/items/expert_coffee_crate': 0,
    '/items/expert_food_crate': 7
  };
  assert.deepEqual(normalize(calculate(EXPERT_CONFIG, owned, 1)), [
    {
      itemId: '/items/expert_torch',
      quantity: 95
    }, {itemId: '/items/expert_shroud', quantity: 3}, {itemId: '/items/expert_coffee_crate', quantity: 1}
  ]);
  assert.deepEqual(normalize(calculate(EXPERT_CONFIG, owned, 5)), [
    {
      itemId: '/items/expert_torch',
      quantity: 495
    }, {itemId: '/items/expert_shroud', quantity: 19}, {itemId: '/items/expert_beacon', quantity: 13}, {
      itemId: '/items/expert_tea_crate',
      quantity: 3
    }, {itemId: '/items/expert_coffee_crate', quantity: 5}
  ]);
});

test('迷宫补给：持有充足时返回空清单', () => {
  const calculate = loadCalculator();
  // 5 次入场需要火把 500、斗筜 20、探照灯 25、各补给箱 5。
  const owned = {
    '/items/expert_torch': 500,
    '/items/expert_shroud': 20,
    '/items/expert_beacon': 25,
    '/items/expert_tea_crate': 5,
    '/items/expert_coffee_crate': 5,
    '/items/expert_food_crate': 5
  };
  assert.deepEqual(normalize(calculate(EXPERT_CONFIG, owned, 5)), []);
});

test('迷宫补给：非正入场次数按 1 次处理，未配置物品跳过', () => {
  const calculate = loadCalculator();
  const config = {
    torch: {hrid: '/items/expert_torch', cap: 100},
    shroud: {hrid: null},
    beacon: {hrid: '/items/expert_beacon', cap: 5},
    teaCrate: {hrid: '/items/expert_tea_crate'},
    coffeeCrate: {hrid: null},
    foodCrate: {hrid: '/items/expert_food_crate'}
  };
  const owned = {
    '/items/expert_torch': 90,
    '/items/expert_beacon': 1,
    '/items/expert_tea_crate': 3,
    '/items/expert_food_crate': 4
  };
  assert.deepEqual(normalize(calculate(config, owned, 0)), [
    {itemId: '/items/expert_torch', quantity: 10}, {itemId: '/items/expert_beacon', quantity: 4}
  ]);
});

test('迷宫补给模块装配与默认配置完整', () => {
  // 迷宫入口按钮位于 LabyrinthPanel 面板内，选择器按 CSS Module 稳定前缀匹配。
  assert.match(runtimeSourceFile, /labyrinthPanel:\s*'\[class\*="LabyrinthPanel_labyrinthPanel__"\]'/);
  assert.match(runtimeSourceFile, /labyrinthEntryScreen:\s*'\[class\*="LabyrinthPanel_entryScreen__"\]'/);
  assert.match(runtimeSourceFile, /labyrinthButtonsContainer:\s*'\[class\*="LabyrinthPanel_buttonsContainer__"\]'/);
  // 页面未配置迷宫物品时按专家档位兜底；入场券上限固定 5。
  assert.match(moduleSourceFile, /'\/items\/expert_torch'/);
  assert.match(moduleSourceFile, /'\/items\/expert_shroud'/);
  assert.match(moduleSourceFile, /'\/items\/expert_beacon'/);
  assert.match(moduleSourceFile, /'\/items\/expert_tea_crate'/);
  assert.match(moduleSourceFile, /'\/items\/expert_coffee_crate'/);
  assert.match(moduleSourceFile, /'\/items\/expert_food_crate'/);
  assert.match(moduleSourceFile, /LABYRINTH_MAX_ENTRIES\s*=\s*5/);
  assert.match(moduleSourceFile, /labyrinthSupplyRunTitle/);
  // 模块注册与启动链路完整。
  assert.match(moduleIndexSourceFile, /LabyrinthSupplyFeature/);
  assert.match(moduleIndexSourceFile, /LabyrinthSupplyFeature\.configure\(ctx\)/);
  assert.match(appControllerSourceFile, /new LabyrinthSupplyFeature\(\)\.init\(\)/);
  assert.match(source, /src\/modules\/labyrinth-supply\/index\.js/);
  // 按钮插入“进入迷宫”按钮上方的文档流内（与房屋计算器触发按钮一致），不脱离布局。
  assert.match(moduleSourceFile, /anchor\.insertAdjacentElement\('beforebegin', this\.wrapper\)/);
  assert.match(moduleSourceFile, /document\.addEventListener\('scroll', this\.repositionHandler, true\)/);
  // 锚点查询排除本模块的补充补给按钮（它同样带 Button_ 类），避免多个脚本实例
  // 互相把对方的按钮当“进入迷宫”按钮、反复插拔导致按钮持续闪烁。
  assert.match(moduleSourceFile, /classList\.contains\('mst-labyrinth-supply-toggle'\)/);
  // 插入前清理按钮容器内残留的同名按钮，防止多实例并存时互相干扰。
  assert.match(moduleSourceFile, /querySelectorAll\('\.mst-labyrinth-supply'\)\.forEach/);
  // 同一页面只允许一个迷宫补给实例活动，先到先得，防止多实例互相清理按钮；
  // 单例标记写在页面 window（unsafeWindow）上（油猴沙箱 window 与页面 window 隔离）。
  assert.match(moduleSourceFile, /pageWindow\.__MST_LABYRINTH_SUPPLY_OWNER__/);
  // 点击切换小窗用 pointerup 触发（先于触屏点击时浏览器合成的 mouseenter），
  // click 只作键盘兜底并按 500ms 间隔去重，移动端不再出现“点了没反应”。
  assert.match(moduleSourceFile, /toggle\.addEventListener\('pointerup'/);
  assert.match(moduleSourceFile, /this\.lastTogglePointerAt = Date\.now\(\)/);
  assert.match(moduleSourceFile, /lastTogglePointerAt \|\| 0\) < 500\) return;/);
  // 语言切换时悬浮小窗的标题与入场次数按钮提示随按钮文字一起更新（小窗内容构建时只渲染一次）。
  assert.match(moduleSourceFile, /title\.textContent = i18n\.t\('labyrinthSupplyPopoverTitle'\)/);
  assert.match(
    moduleSourceFile,
    /button\.title = i18n\.t\('labyrinthSupplyRunTitle', String\(button\.dataset\.entryCount\)\)/
  );
  // 旧版脚本残留的样式会被主动覆盖，避免升级后按钮仍按旧 CSS 定位。
  assert.match(moduleSourceFile, /existingStyle\.textContent = MST_LABYRINTH_SUPPLY_CSS/);
  // 按钮复用游戏 Button 组件外观：基础类从页面按钮动态提取，与“进入迷宫”同为 normal 档尺寸。
  assert.match(moduleSourceFile, /name\.startsWith\('Button_button__'\)/);
  assert.doesNotMatch(moduleSourceFile, /name\.startsWith\('Button_small__'\)/);
  assert.match(moduleSourceFile, /mst-labyrinth-supply-toggle \$\{gameButtonClass\}/);
  // “进入迷宫”按钮移除 large 变体，回落到游戏官方 normal 档高度（游戏重渲染后重新维持）。
  assert.match(moduleSourceFile, /name\.startsWith\('Button_large__'\)/);
  assert.match(moduleSourceFile, /enterButton\.className = buttonNames\.join\(' '\)/);
  assert.match(moduleCssSourceFile, /\.mst-labyrinth-supply\s*\{[^}]*margin: 0 0 0\.25rem/s);
  // 兜底样式只在游戏按钮类缺失时生效，不覆盖游戏 Button 外观。
  assert.match(moduleCssSourceFile, /\.mst-labyrinth-supply-toggle:not\(\[class\*='Button_button__'\]\)/);
  // 悬浮小窗是临时浮层，才用 fixed 定位；层级低于 MWITools 购物车按钮层。
  assert.match(moduleCssSourceFile, /\.mst-labyrinth-supply-popover\s*\{[^}]*position:\s*fixed/s);
  assert.match(moduleCssSourceFile, /z-index:\s*var\(--mst-z-popup\)/);
  // 数据源：角色设置变化通过 setting_updated 同步。
  assert.match(dataSourceFile, /setting_updated['"]?\s*&&\s*message\.characterSetting/);
  // 文案齐全（中英文）。
  assert.match(messagesSourceFile, /labyrinthSupply:\s*\{zh: '补充补给', en: 'Restock Supplies'\}/);
  assert.match(messagesSourceFile, /labyrinthSupplyTitle:/);
  assert.match(messagesSourceFile, /labyrinthSupplyDone:/);
  assert.match(messagesSourceFile, /labyrinthSupplyNothingMissing:/);
  assert.match(messagesSourceFile, /labyrinthSupplyAddFailed:/);
  // 用户文档记录新功能入口。
  assert.match(usageSource, /补充补给/);
});
