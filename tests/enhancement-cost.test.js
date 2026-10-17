'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const clientData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'init_client_data.json'), 'utf8')
);
const marketplace = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'marketplace.json'), 'utf8')
);

const HOOD = '/items/acrobatic_hood';
const HOOD_REFINED = '/items/acrobatic_hood_refined';
const MIRROR = '/items/philosophers_mirror';
const SHARD = '/items/sinister_refinement_shard';
const TAX_MULTIPLIER = 0.96;

// 视图渲染测试：用字符串版模板渲染器执行真实 Feature，覆盖 formatter 与视图之间的调用约定。
function loadFeature(marketData = {}, activeClientData = clientData) {
  const utils = {
    getSpriteUrl: () => '',
    substrLastSlash: (value) => String(value || '').substring(String(value || '').lastIndexOf('/') + 1),
    formatCompactNumber: (value) => (Number.isFinite(Number(value)) ? `C${Number(value)}` : '—')
  };
  const DataHub = {
    getClientData: () => activeClientData,
    getClientDataMap: (key) => activeClientData[key] || {},
    resolveItemName: (hrid) => activeClientData.itemDetailMap?.[hrid]?.name || hrid,
    getLocalizedGameName: (_group, hrid) => hrid
  };
  // uhtml 的点绑定与事件绑定在字符串版里只保留值，布尔与函数按空串处理。
  const TemplateRenderer = {
    html(strings, ...values) {
      let output = strings[0];
      values.forEach((value, index) => {
        const rendered = Array.isArray(value)
          ? value.join('')
          : typeof value === 'function' || typeof value === 'boolean' || value == null
            ? ''
            : String(value);
        output += rendered + strings[index + 1];
      });
      return output;
    }
  };
  const marketService = createMarketService(marketData);
  const sandbox = {
    marketService,
    DataHub,
    utils,
    TemplateRenderer,
    i18n: {t: (key, ...args) => (args.length ? `${key}:${args.join('|')}` : key)}
  };
  return vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/enhancement-cost/calculator.js', 'src/modules/enhancement-cost/index.js')}
        const ctx = {
          DataHub,
          i18n,
          utils,
          TemplateRenderer,
          StyleService: {ensure() {}},
          LanguageEvents: {subscribe() {}},
          Notifier: {},
          CalculatorHelpPopover: {}
        };
        class TestEnhancementCostFeature extends EnhancementCostCalculatorFeature {
          constructor() {
            super(ctx, marketService);
          }
        }
        TestEnhancementCostFeature;`,
    sandbox
  );
}

// 计算器只依赖 DataHub 的客户端字典与市场服务，测试里直接用官方样例数据装配。
function loadCalculator(activeClientData = clientData) {
  const DataHub = {
    getClientData() {
      return activeClientData;
    },
    getClientDataMap(key) {
      return activeClientData[key] || {};
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/enhancement-cost/calculator.js')}
        class EnhancementCostCalculatorWithDataHub extends EnhancementCostCalculator {
          constructor(marketService) {
            super({DataHub}, marketService);
          }
        }
        EnhancementCostCalculatorWithDataHub;`,
    {DataHub}
  );
}

function createMarketService(marketData = {}, marketValues = {}) {
  return {
    marketData,
    marketTimestamp: 1,
    getMarketRow(itemHrid, level = 0) {
      return this.marketData?.[itemHrid]?.[String(level)] || null;
    },
    getMarketValue(itemHrid, level = 0) {
      const values = marketValues?.[itemHrid];
      if (!values) return 0;
      const value = Number(values[level] ?? values[String(level)] ?? 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }
  };
}

function select(calculator, options) {
  return calculator.calculate({buyMode: 'auto', sellMode: 'auto', ...options});
}

function sellNet(price) {
  return Math.floor(price * TAX_MULTIPLIER);
}

// 方案的不变式：步骤花费（含负的卖已有装备与解精炼抵扣）相加必须等于方案花费，路线里的累计才不会与总花费打架。
function assertStepsMatch(plan, label) {
  const sum = plan.steps.reduce((total, step) => total + step.cost, 0);
  assert.equal(sum, plan.cost, `${label} 的步骤合计应等于方案花费`);
}

// 计算器在 vm 沙箱里运行，对象原型与宿主不同，比较前统一转成普通对象。
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('只列可强化装备，并识别普通物品与精炼物品的双线关系', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(createMarketService());

  const items = calculator.getEnhanceableItems();
  assert.equal(items.length, 532);
  assert.ok(items.every((item) => item.detail.enhancementCosts.length > 0));

  assert.deepEqual(plain(calculator.getLineInfo(HOOD)), {normalHrid: HOOD, refinedHrid: HOOD_REFINED});
  // 精炼物品作为目标时，普通线回到它的基础物品，目标线就是它自己。
  assert.deepEqual(plain(calculator.getLineInfo(HOOD_REFINED)), {normalHrid: HOOD, refinedHrid: HOOD_REFINED});
  assert.deepEqual(plain(calculator.getLineInfo('/items/advanced_alchemy_charm')), {
    normalHrid: '/items/advanced_alchemy_charm',
    refinedHrid: ''
  });
});

test('精炼动作按基础物品建索引，碎片数量与保留强化等级取自官方动作', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(createMarketService());

  const recipes = calculator.getRefinementRecipeMap();
  assert.equal(recipes.size, 38);
  assert.deepEqual(plain(calculator.getRefinementRecipe(HOOD).inputs), [
    {itemHrid: SHARD, count: 100}
  ]);
  assert.deepEqual(plain(calculator.getRefinementRecipe('/items/chaotic_flail').inputs), [
    {itemHrid: SHARD, count: 300}
  ]);
  // 可强化但没有精炼版本的装备没有精炼配方。
  assert.equal(calculator.getRefinementRecipe('/items/advanced_alchemy_charm'), null);
});

test('解精炼详情取自官方数据：拆回基础物品并拿回一半碎片', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(createMarketService());

  const map = calculator.getUnrefineMap();
  assert.equal(map.size, 38);
  assert.deepEqual(plain(map.get(HOOD_REFINED)), {baseItemHrid: HOOD, shardHrid: SHARD, shardCount: 50});
  // 300 碎片档的精炼物品返还 150 个。
  assert.equal(map.get('/items/chaotic_flail_refined').shardCount, 150);
  assert.equal(map.get(HOOD), undefined);
});

test('价格口径：左一与右一取指定侧，自动买入取更低、卖出取更高，缺价按回退链取值', () => {
  const Calculator = loadCalculator();
  const market = createMarketService({[HOOD]: {5: {a: 1000, b: 800, p: 900}}}, {[HOOD]: {5: 500}});
  const calculator = new Calculator(market);

  assert.equal(calculator.getBuyPrice(HOOD, 5, 'ask'), 1000);
  assert.equal(calculator.getBuyPrice(HOOD, 5, 'bid'), 800);
  assert.equal(calculator.getBuyPrice(HOOD, 5, 'auto'), 800);
  assert.equal(calculator.getSellPrice(HOOD, 5, 'ask'), sellNet(1000));
  assert.equal(calculator.getSellPrice(HOOD, 5, 'bid'), sellNet(800));
  // 自动卖出去到手更高的一侧（左一 1000 > 右一 800）。
  assert.equal(calculator.getSellPrice(HOOD, 5, 'auto'), sellNet(1000));

  // 指定一侧缺价时回退最近成交价；挂单、最近成交都缺时用官方市场价值。
  const fallback = new Calculator(createMarketService({[HOOD]: {5: {a: -1, b: 800, p: 900}}}));
  assert.equal(fallback.getBuyPrice(HOOD, 5, 'ask'), 900);
  const official = new Calculator(createMarketService({}, {[HOOD]: {5: 500}}));
  assert.equal(official.getBuyPrice(HOOD, 5, 'bid'), 500);
  assert.equal(official.getSellPrice(HOOD, 5, 'bid'), sellNet(500));
  // 完全缺价时不参与计算。
  assert.equal(new Calculator(createMarketService()).getBuyPrice(HOOD, 5, 'auto'), 0);
});

test('不选已有装备时只比较直接买与自己做，没有卖出抵扣', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}, 2: {a: 3000, b: 3000}},
      [MIRROR]: {0: {a: 1000, b: 1000}}
    })
  );

  const result = select(calculator, {targetHrid: HOOD, targetLevel: 2});
  assert.equal(result.status, 'ok');
  assert.equal(result.existingLineIndex, -1);
  assert.equal(result.heldSale.value, 0);
  // 两个方案：直接买 3000、自己做 2300（2 个 +0 垫子 + 2 个镜子）。
  assert.deepEqual(plain(result.plans.map((plan) => plan.key)), [
    'direct', 'self'
  ]);
  assert.equal(result.bestKey, 'self');
  assert.equal(result.bestCost, 2300);
  assert.equal(result.directBuy.net, 3000);
  assert.equal(result.savings, 3000 - 2300);
  assert.deepEqual(plain(result.route.map((step) => step.type)), [
    'buy', 'buy', 'mirror', 'buy', 'mirror'
  ]);
  result.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('目标物品或它的普通版才能当已有装备，等级不能高于目标', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}},
      [SHARD]: {0: {a: 10, b: 10}},
      [MIRROR]: {0: {a: 1000, b: 1000}}
    })
  );

  // 已有装备是目标物品本身（普通版）允许。
  const sameItem = select(calculator, {
    targetHrid: HOOD,
    targetLevel: 2,
    existingHrid: HOOD,
    existingLevel: 1
  });
  assert.equal(sameItem.status, 'ok');

  // 目标为精炼版时，已有装备可以是它自己，也可以是它的普通版。
  const existingNormal = select(calculator, {
    targetHrid: HOOD_REFINED,
    targetLevel: 2,
    existingHrid: HOOD,
    existingLevel: 1
  });
  assert.equal(existingNormal.status, 'ok');
  assert.equal(existingNormal.existingLineIndex, 0);

  // 目标为普通版时，不能拿精炼版当已有装备。
  const refinedAsExisting = select(calculator, {
    targetHrid: HOOD,
    targetLevel: 2,
    existingHrid: HOOD_REFINED,
    existingLevel: 1
  });
  assert.equal(refinedAsExisting.status, 'invalid');
  assert.equal(refinedAsExisting.reason, 'existing');

  // 已有装备的等级不能高于目标等级。
  const higherLevel = select(calculator, {
    targetHrid: HOOD,
    targetLevel: 2,
    existingHrid: HOOD,
    existingLevel: 3
  });
  assert.equal(higherLevel.status, 'invalid');
  assert.equal(higherLevel.reason, 'level');
});

test('镜子合成：主件低一级、垫子低两级且取普通版，+1 的主件与垫子都是 +0', () => {
  const Calculator = loadCalculator();
  // 只给 +0 与镜子报价：+1、+2 都只能靠合成，垫子永远是普通版 +0。
  const calculator = new Calculator(
    createMarketService({[HOOD]: {0: {a: 100, b: 100}}, [MIRROR]: {0: {a: 1000, b: 1000}}})
  );

  // 用已有装备当主件：+0 → +1 → +2，两级各要一个 +0 垫子。
  const result = select(calculator, {targetHrid: HOOD, targetLevel: 2, existingHrid: HOOD, existingLevel: 0});
  assert.equal(result.status, 'ok');
  assert.equal(result.bestKey, 'main');
  assert.equal(result.bestCost, 2 * (100 + 1000));
  assert.deepEqual(plain(result.route.map((step) => step.type)), [
    'keep', 'buy', 'mirror', 'buy', 'mirror'
  ]);
  const mirrors = result.route.filter((step) => step.type === 'mirror');
  assert.deepEqual(
    plain(
      mirrors.map((step) => [
        step.level, step.fromLevel, step.padLevel, step.padCost
      ])
    ),
    [
      [
        1, 0, 0, 100
      ], [
        2, 1, 0, 100
      ]
    ]
  );
  // 自己做（从零）多买一个 +0，但能抵扣卖掉已有装备的 96；逐级表按目标版本给出获取成本。
  const self = result.plans.find((plan) => plan.key === 'self');
  assert.equal(self.gross, 3 * 100 + 2 * 1000);
  assert.equal(self.cost, self.gross - sellNet(100));
  // 垫子的购买步骤单列，合成步骤只计镜子价格：步骤合计与方案花费一致。
  assert.deepEqual(
    plain(
      self.steps.map((step) => [
        step.type, step.cost
      ])
    ),
    [
      [
        'sell', -sellNet(100)
      ], [
        'buy', 100
      ], [
        'buy', 100
      ], [
        'mirror', 1000
      ], [
        'buy', 100
      ],
      [
        'mirror', 1000
      ]
    ]
  );
  assert.deepEqual(
    plain(
      result.levelRows.map((row) => [
        row.level, row.cost, row.kind, row.mark.type
      ])
    ),
    [
      [
        1, 1200, 'mirror', 'mirror'
      ], [
        2, 2300, 'mirror', 'mirror'
      ]
    ]
  );
  result.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('获取方式：买普通版精炼比直接买精炼版便宜时走精炼，比市场买价低的行标绿', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {10: {a: 270000000, b: 270000000}, 11: {a: 530000000, b: 530000000}, 13: {a: 1770000000, b: 1770000000}},
      [HOOD_REFINED]: {13: {a: 2000000000, b: 2000000000}},
      [SHARD]: {0: {a: 1960000, b: 1960000}},
      [MIRROR]: {0: {a: 637500000, b: 637500000}}
    })
  );

  const result = select(calculator, {
    targetHrid: HOOD_REFINED,
    targetLevel: 13,
    existingHrid: HOOD,
    existingLevel: 11
  });
  assert.equal(result.status, 'ok');
  const heldSale = sellNet(530000000);
  // 精炼 100 个碎片按工匠茶折算成 90 个 = 176.4M；买普通 +13（1770M）+ 精炼比直接买 ★+13（2000M）便宜。
  const refineCost = 90 * 1960000;
  // ★+12 没有挂单：买普通 +12 的合成链（530M 主件 + 270M 垫子 + 637.5M 镜子 = 1437.5M）再精炼 90 个碎片（176.4M）；
  // 镜子合成 ★+12（706.4M 主件 + 270M 垫子 + 637.5M 镜子）同价，按先算到的一条记「镜子合成」。
  assert.equal(result.levelRows[0].level, 12);
  assert.equal(result.levelRows[0].cost, 1437500000 + 90 * 1960000);
  assert.equal(result.levelRows[0].kind, 'mirror');
  const lastRow = result.levelRows[result.levelRows.length - 1];
  assert.equal(lastRow.level, 13);
  assert.equal(lastRow.marketPrice, 2000000000);
  assert.equal(lastRow.cost, 1770000000 + refineCost);
  assert.equal(lastRow.kind, 'refine');
  assert.equal(result.bestKey, 'self');
  assert.equal(result.bestCost, 1770000000 + refineCost - heldSale);
  // 「买普通 +13 再精炼」比直接买 ★+13 省下的即时差价。
  assert.equal(result.directBuy.net, 2000000000 - heldSale);
  assert.equal(result.savings, result.directBuy.net - result.bestCost);
  assert.ok(result.route.some((step) => step.type === 'refine' && step.cost === refineCost));
  result.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('解精炼：买精炼版拆回普通版（拿回一半碎片）可以是普通版最便宜的获取方式', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}},
      [HOOD_REFINED]: {2: {a: 3000, b: 3000}},
      [SHARD]: {0: {a: 50, b: 50}},
      [MIRROR]: {0: {a: 1000, b: 1000}}
    })
  );

  // 普通 +2 自己做要 2 个 +0 垫子 + 2 个镜子 = 2300；买 ★+2 解精炼 = 3000 − 50×48 = 600。
  const result = select(calculator, {targetHrid: HOOD, targetLevel: 2, existingHrid: HOOD, existingLevel: 0});
  assert.equal(result.status, 'ok');
  const row = result.levelRows[result.levelRows.length - 1];
  assert.equal(row.level, 2);
  assert.equal(row.cost, 3000 - 50 * sellNet(50));
  assert.equal(row.kind, 'unrefine');
  // 自己做（从零）这条路线会先买 ★+2 再解精炼，解精炼的返还碎片没有后续精炼需求，全部按卖出价折钱。
  const self = result.plans.find((plan) => plan.key === 'self');
  assert.equal(self.gross, 3000 - 50 * sellNet(50));
  assert.deepEqual(plain(self.steps.map((step) => step.type)), [
    'sell', 'buy', 'unrefine'
  ]);
  assert.equal(self.steps[2].cost, -50 * sellNet(50));
  assert.equal(self.steps[2].shardSurplus, 50);
  assert.equal(self.steps[2].shardKept, 0);
  assert.equal(self.steps[2].plan.shardHrid, SHARD);
  result.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('精炼材料按工匠茶生效折算：官方 100 / 300 个按 90 / 270 个计价', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}},
      [SHARD]: {0: {a: 1000, b: 1000}}
    })
  );

  // 工匠值取自游戏数据里工匠茶的 artisan buff（flatBoost 0.1）。
  assert.equal(calculator.getArtisanMaterialMultiplier(), 0.9);
  const hoodPlan = calculator.createRefinePlan(HOOD, {buyMode: 'auto'});
  assert.equal(hoodPlan.inputs[0].count, 90);
  assert.equal(hoodPlan.cost, 90 * 1000);
  // 300 碎片档折算成 270。
  const flailPlan = calculator.createRefinePlan('/items/chaotic_flail', {buyMode: 'auto'});
  assert.equal(flailPlan.inputs[0].count, 270);
  // 解精炼返还的还是物品详情里的固定 shardReturn（100 档 → 50 个），不随工匠茶变化。
  const unrefine = calculator.createUnrefinePlan(HOOD, HOOD_REFINED, {sellMode: 'auto'});
  assert.equal(unrefine.shardCount, 50);
});

test('卖已有装备的两条路按方案选：后面还要精炼时解精炼更划算，直接买时才比整件卖出', () => {
  const Calculator = loadCalculator();
  // 精炼版 +0 直接卖到手 2500；解精炼后卖普通版（96）+ 50 个碎片（按卖出价 2400 / 按买入价 2500）。
  // 目标 ★+1 有挂单 3000 或没有挂单两种情况。
  const makeCalculator = (refinedLevels) =>
    new Calculator(
      createMarketService({
        [HOOD]: {0: {a: 100, b: 100}, 1: {a: 110, b: 100}},
        [HOOD_REFINED]: refinedLevels,
        [SHARD]: {0: {a: 50, b: 50}}
      })
    );

  // 有挂单：不精炼，整件直接卖更值（2500 > 2496），方案用「直接卖」。
  const withMarket = select(makeCalculator({0: {a: 2605, b: 2400}, 1: {a: 3200, b: 3000}}), {
    targetHrid: HOOD_REFINED,
    targetLevel: 1,
    existingHrid: HOOD_REFINED,
    existingLevel: 0
  });
  assert.equal(withMarket.bestKey, 'direct');
  assert.equal(withMarket.routePlan.viaUnrefine, false);
  assert.equal(withMarket.bestCost, 3000 - sellNet(2605));
  assert.equal(withMarket.directBuy.sell, sellNet(2605));

  // 没有挂单：只能自己做，后面还要精炼，拿回的 50 个碎片值买入价（省下 2500），方案改用「解精炼后卖」。
  const noMarket = select(makeCalculator({0: {a: 2605, b: 2400}}), {
    targetHrid: HOOD_REFINED,
    targetLevel: 1,
    existingHrid: HOOD_REFINED,
    existingLevel: 0
  });
  assert.equal(noMarket.bestKey, 'self');
  assert.equal(noMarket.routePlan.viaUnrefine, true);
  // 解精炼（碎片留给精炼）+ 卖普通 +0（96）+ 买普通 +1（100）+ 精炼 40 个（2000）= 2004。
  assert.equal(noMarket.bestCost, -sellNet(100) + 100 + 40 * 50);
  assertStepsMatch(noMarket.routePlan, noMarket.bestKey);
});

test('碎片净额结算：解精炼拿回的碎片先顶后面精炼的量，只补买不够的部分', () => {
  const Calculator = loadCalculator();
  // 目标 ★+1 没有挂单，只能靠精炼；已有装备是 ★+0（精炼版），卖掉它的最好方式是解精炼后卖普通版 + 卖碎片。
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}, 1: {a: 110, b: 100}},
      [HOOD_REFINED]: {0: {a: 900, b: 800}},
      [SHARD]: {0: {a: 50, b: 50}}
    })
  );

  const result = select(calculator, {
    targetHrid: HOOD_REFINED,
    targetLevel: 1,
    existingHrid: HOOD_REFINED,
    existingLevel: 0
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.bestKey, 'self');
  // 路线：解精炼 ★+0（拿回 50 个碎片，留着精炼用）→ 卖普通 +0（到手 96）→ 买普通 +1（100）→ 精炼（90 个碎片里 50 个已拿回，只买 40 个 = 2000）
  // 净花费 = −96 + 100 + 2000 = 2004；旧算法会把 50 个按卖出价折钱、再全额买 90 个，多算 50×(50−48) = 100。
  assert.equal(result.bestCost, 2004);
  const unrefineStep = result.route.find((step) => step.type === 'unrefine');
  assert.equal(unrefineStep.shardReturned, 50);
  assert.equal(unrefineStep.shardKept, 50);
  assert.equal(unrefineStep.shardSurplus, 0);
  assert.equal(unrefineStep.cost, 0);
  const refineStep = result.route.find((step) => step.type === 'refine');
  assert.equal(refineStep.shardCount, 90);
  assert.equal(refineStep.shardCovered, 50);
  assert.equal(refineStep.shardBought, 40);
  assert.equal(refineStep.cost, 40 * 50);
  assertStepsMatch(result.routePlan, result.bestKey);
  // 直接买成品没有挂单，说明里给出原因。
  assert.equal(result.plans.find((plan) => plan.key === 'direct').reason, 'enhancementCostPlanNoMarket');

  // 直接买成品这条方案里没有后续精炼，解精炼拿回的 50 个碎片全部按卖出价折钱。
  const withMarket = new Calculator(
    createMarketService({
      [HOOD]: {0: {a: 100, b: 100}},
      [HOOD_REFINED]: {0: {a: 900, b: 800}, 1: {a: 2000, b: 1900}},
      [SHARD]: {0: {a: 50, b: 50}}
    })
  );
  const direct = select(withMarket, {
    targetHrid: HOOD_REFINED,
    targetLevel: 1,
    existingHrid: HOOD_REFINED,
    existingLevel: 0
  });
  assert.equal(direct.bestKey, 'direct');
  const sold = direct.route.find((step) => step.type === 'unrefine');
  assert.equal(sold.shardKept, 0);
  assert.equal(sold.shardSurplus, 50);
  assert.equal(sold.cost, -50 * sellNet(50));
  assert.equal(direct.bestCost, 1900 - sellNet(100) - 50 * sellNet(50));
  assertStepsMatch(direct.routePlan, direct.bestKey);
});

test('用已有装备当垫子：手上的 +11 直接当垫子比卖掉再自己做更省（真实快照）', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(createMarketService(marketplace.marketData));

  const result = select(calculator, {
    targetHrid: HOOD_REFINED,
    targetLevel: 13,
    existingHrid: HOOD,
    existingLevel: 11
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.bestKey, 'pad');
  // 买 ★+12（自动取 1100M）+ 手上的普通 +11 当垫子 + 镜子（自动取 640M）。
  assert.equal(result.bestCost, 1100000000 + 640000000);
  assert.deepEqual(
    plain(
      result.route.map((step) => [
        step.type, step.level, step.padIsHeld === true
      ])
    ),
    [
      [
        'keep', 11, false
      ], [
        'buy', 12, false
      ], [
        'mirror', 13, true
      ]
    ]
  );
  // 卖掉已有装备后自己做要贵一点（2026 快照：2.298B − 535.68M）。
  const self = result.plans.find((plan) => plan.key === 'self');
  assert.equal(self.gross, 1100000000 + 558000000 + 640000000);
  assert.equal(self.cost, self.gross - sellNet(558000000));
  assert.ok(self.cost > result.bestCost);
  result.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('方案列表：四个方案都列出并标出最佳，缺价的方案给出原因', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(
    createMarketService({
      [HOOD]: {11: {a: 500000000, b: 480000000}},
      [HOOD_REFINED]: {13: {a: 2000000000, b: 2000000000}},
      [MIRROR]: {0: {a: 640000000, b: 640000000}},
      [SHARD]: {0: {a: 2000000, b: 2000000}}
    })
  );

  const result = select(calculator, {
    targetHrid: HOOD_REFINED,
    targetLevel: 13,
    existingHrid: HOOD,
    existingLevel: 11
  });
  assert.equal(result.status, 'ok');
  // 顺序固定：直接买 / 自己做 / 当主件 / 当垫子；不可用的方案也在列表里并带原因。
  assert.deepEqual(plain(result.plans.map((plan) => plan.key)), [
    'direct', 'self', 'main', 'pad'
  ]);
  const direct = result.plans[0];
  const self = result.plans[1];
  const main = result.plans[2];
  const pad = result.plans[3];
  assert.equal(direct.cost, 2000000000 - sellNet(500000000));
  assert.equal(direct.reason, '');
  // 自己做这条里「市场买成品」也成立（★+13 有挂单），所以与直接买同价。
  assert.equal(self.cost, direct.cost);
  // 当主件要 +9、+10、+11 三个垫子，合成链上缺价 → 不可用。
  assert.equal(main.cost, Infinity);
  assert.equal(main.reason, 'enhancementCostPlanMissingPrice');
  // 当垫子要先买 ★+12（没有挂单，链上也缺价）→ 不可用。
  assert.equal(pad.cost, Infinity);
  assert.equal(pad.reason, 'enhancementCostPlanMissingPrice');
  assert.equal(result.bestKey, 'direct');
  assert.equal(result.bestCost, 2000000000 - sellNet(500000000));

  // 市场没有成品挂单时，直接买给出「市场没有这个等级」，另外三条照常参与比较。
  const noMarket = new Calculator(
    createMarketService({
      [HOOD]: {11: {a: 500000000, b: 480000000}, 12: {a: 1000000000, b: 980000000}},
      [MIRROR]: {0: {a: 640000000, b: 640000000}},
      [SHARD]: {0: {a: 2000000, b: 2000000}}
    })
  );
  const refined = select(noMarket, {
    targetHrid: HOOD_REFINED,
    targetLevel: 13,
    existingHrid: HOOD,
    existingLevel: 11
  });
  assert.equal(refined.status, 'ok');
  const refinedDirect = refined.plans.find((plan) => plan.key === 'direct');
  assert.equal(refinedDirect.cost, Infinity);
  assert.equal(refinedDirect.reason, 'enhancementCostPlanNoMarket');
  // 自己做：普通 +13 只能靠合成（980M 的主件 + 480M 垫子 + 640M 镜子 = 2.1B）再精炼 90 个碎片 180M，与合成 ★+13 同价。
  assert.equal(refined.bestKey, 'self');
  assert.equal(refined.bestCost, 2100000000 + 90 * 2000000 - sellNet(500000000));
  refined.plans.filter((plan) => Number.isFinite(plan.cost)).forEach((plan) => assertStepsMatch(plan, plan.key));
});

test('路线里不做中途卖出再买入：买卖价差不会被当成可重复的收益', () => {
  const Calculator = loadCalculator();
  // 与真实快照同型：+12 的卖价（1020M × 0.96）高于买价（940M），旧模型会把来回换手当成收益。
  const sparse = new Calculator(
    createMarketService({
      [HOOD]: {11: {a: 558000000, b: -1}, 12: {a: 1020000000, b: 940000000}}
    })
  );
  const direct = select(sparse, {targetHrid: HOOD, targetLevel: 12, existingHrid: HOOD, existingLevel: 11});
  assert.equal(direct.status, 'ok');
  assert.equal(direct.bestKey, 'direct');
  assert.equal(direct.bestCost, 940000000 - sellNet(558000000));
  assert.deepEqual(plain(direct.route.map((step) => step.type)), [
    'sell', 'buy'
  ]);
  // 自己做这条方案与直接买同价（最便宜获取就是市场买），路线里也只有一次卖出。
  const self = direct.plans.find((plan) => plan.key === 'self');
  assert.equal(self.cost, direct.bestCost);
  assert.equal(self.steps.filter((step) => step.type === 'sell').length, 1);

  // 真实快照：普通 +6 → +13 的最便宜路线是「卖掉已有装备、买 +12 与 +11 垫子、加镜子」，不含任何换手套利步。
  const snapshot = new Calculator(createMarketService(marketplace.marketData));
  const result = select(snapshot, {targetHrid: HOOD, targetLevel: 13, existingHrid: HOOD, existingLevel: 6});
  assert.equal(result.bestKey, 'self');
  assert.equal(result.bestCost, 940000000 + 558000000 + 640000000 - sellNet(81000000));
  assert.deepEqual(plain(result.route.map((step) => step.type)), [
    'sell', 'buy', 'buy', 'mirror'
  ]);
  assert.equal(result.route.filter((step) => step.type === 'sell').length, 1);
  assertStepsMatch(result.routePlan, result.bestKey);
});

test('边界：没有已有装备时仍然能算，缺价时列出缺少价格的物品', () => {
  const Calculator = loadCalculator();
  const noPrice = new Calculator(createMarketService());
  const unreachable = select(noPrice, {targetHrid: HOOD, targetLevel: 1});
  assert.equal(unreachable.status, 'unreachable');
  const missingLabels = unreachable.missing.map((entry) => `${entry.itemHrid}+${entry.level}`);
  assert.ok(missingLabels.includes(`${MIRROR}+0`));
  assert.ok(missingLabels.includes(`${HOOD}+1`));

  // 精炼只缺碎片：精炼方案不可用时缺价清单要带上碎片。
  const noShard = new Calculator(
    createMarketService({[HOOD]: {0: {a: 100, b: 100}}, [MIRROR]: {0: {a: 1000, b: 1000}}})
  );
  const refinedMissing = select(noShard, {targetHrid: HOOD_REFINED, targetLevel: 1});
  assert.equal(refinedMissing.status, 'unreachable');
  assert.ok(refinedMissing.missing.some((entry) => entry.itemHrid === SHARD));

  // 已有装备没有卖价时不阻断：不用它的做法按不抵扣计算并给出说明。
  const noSell = new Calculator(createMarketService({[HOOD]: {1: {a: 1000, b: 1000}}}));
  const result = select(noSell, {targetHrid: HOOD, targetLevel: 1, existingHrid: HOOD, existingLevel: 0});
  assert.equal(result.status, 'ok');
  assert.equal(result.heldSale.value, 0);
  assert.equal(result.route.length, 1);
  assert.equal(result.route[0].type, 'buy');
  assert.equal(result.bestCost, 1000);
  assert.deepEqual(plain(result.notes), [
    {key: 'enhancementCostExistingNoSell'}
  ]);
});

test('视图渲染：目标在前、已有装备在后，画出汇总、方案列表、路线与逐级表（防止调用约定错位）', () => {
  const Feature = loadFeature(marketplace.marketData);
  const feature = new Feature();
  feature.selectTargetItem(HOOD);
  feature.setTargetLevel(7);
  feature.selectExistingItem(HOOD);
  feature.setExistingLevel(6);
  const html = feature.view.getView(feature);

  // 选择器顺序：目标装备在前、已有装备在后。
  const targetIndex = html.indexOf('enhancementCostTarget');
  const existingIndex = html.indexOf('enhancementCostExisting');
  assert.ok(targetIndex >= 0 && existingIndex > targetIndex, '目标装备应排在已有装备之前');
  // 模板渲染器在测试里是字符串拼接，文案键原样保留，金额按 C<数值> 标记。
  assert.match(html, /Acrobatic Hood/);
  // 2026 快照：卖掉 +6（到手 77.76M）直接买 +7（90.2M），净花费 12.44M。
  assert.match(html, /enhancementCostStepSellOp/);
  assert.match(html, /C-77760000/);
  assert.match(html, /C12440000/);
  // 汇总、全部方案、逐级表的三个区块与关键文案。
  assert.match(html, /enhancementCostBestPlan/);
  assert.match(html, /enhancementCostPlansTitle/);
  assert.match(html, /enhancementCostPlanBest/);
  assert.match(html, /enhancementCostKindMarket/);
  assert.match(html, /enhancementCostColumnAcquire/);
  // 版式：方案汇总 → 全部方案 → 最优路线 → 逐级对比。
  const summaryIndex = html.indexOf('enhancementCostSummaryTitle');
  const plansIndex = html.indexOf('enhancementCostPlansTitle');
  const routeIndex = html.indexOf('enhancementCostRouteTitle');
  const tableIndex = html.indexOf('enhancementCostCompareTitle');
  assert.ok(
    summaryIndex >= 0 && summaryIndex < plansIndex && plansIndex < routeIndex && routeIndex < tableIndex,
    '区块顺序应为汇总 → 全部方案 → 最优路线 → 逐级对比'
  );
  assert.match(html, /enhancementCostMarketHint/);
  assert.match(html, /marketDataTime/);
  // 合成步骤里的贤者之镜不带强化等级。
  assert.doesNotMatch(html, /Philosopher's Mirror \+/);
});

test('视图渲染：已有装备面板只列「不用 / 目标物品 / 它的普通版」，按游戏顺序排列且等级上限跟目标一致', () => {
  const Feature = loadFeature(marketplace.marketData);
  const feature = new Feature();
  feature.selectTargetItem(HOOD_REFINED);
  feature.setTargetLevel(13);

  const options = feature.getExistingOptions();
  // 游戏顺序里普通版（sortIndex 更小）排在精炼版之前，面板与目标面板的卡片顺序一致。
  assert.deepEqual(plain(options.map((option) => option.hrid)), [
    '', HOOD, HOOD_REFINED
  ]);
  assert.equal(options[0].noItem, true);
  assert.equal(options[1].labelKey, 'enhancementCostLineOriginal');
  assert.equal(options[2].labelKey, 'enhancementCostLineRefined');
  assert.ok(
    Number(clientData.itemDetailMap[HOOD].sortIndex) < Number(clientData.itemDetailMap[HOOD_REFINED].sortIndex)
  );
  // 已有装备的等级只列到目标等级。
  assert.equal(Math.max(...feature.getExistingLevelOptions()), 13);
  feature.setExistingLevel(20);
  assert.equal(feature.existingLevel, 13);

  // 目标为普通版时面板只有两项（不用 / 基础版）。
  feature.selectTargetItem(HOOD);
  assert.deepEqual(plain(feature.getExistingOptions().map((option) => option.hrid)), [
    '', HOOD
  ]);

  // 目标面板（全部装备）仍带类型过滤与搜索框，已有装备面板不带。
  feature.selectTargetItem(HOOD);
  feature.openPicker('target');
  assert.equal(feature.getPickerOptions().length, 532);
  feature.openPicker('existing');
  assert.equal(feature.getPickerOptions().length, 2);
  assert.equal(feature.getPickerOptions()[0].noItem, true);
});

test('物品按游戏顺序排列：itemDetailMap.sortIndex 升序，而不是按等级', () => {
  const Calculator = loadCalculator();
  const calculator = new Calculator(createMarketService());
  const items = calculator.getEnhanceableItems();
  const indexes = items.map((item) => Number(item.detail.sortIndex));
  for (let index = 1; index < indexes.length; index += 1) {
    assert.ok(
      indexes[index - 1] <= indexes[index],
      `第 ${index} 项 ${items[index].hrid} 的 sortIndex ${indexes[index]} 小于前一项 ${indexes[index - 1]}`
    );
  }
  // 游戏顺序里第一件是 Lv.40 的哥布林刺剑，列表里还有更低等级的装备，说明不是按等级排。
  assert.equal(items[0].hrid, '/items/gobo_stabber');
  assert.equal(items[0].detail.itemLevel, 40);
  assert.ok(items.some((item) => item.detail.itemLevel < 40));
});

test('类型下拉按游戏顺序排列，生活工具合并为一项放在最后', () => {
  const Feature = loadFeature(marketplace.marketData);
  const feature = new Feature();
  feature.selectTargetItem(HOOD);
  feature.openPicker('target');
  const options = feature.getPickerTypeOptions();
  assert.equal(options[0].value, '/equipment_types/two_hand');
  assert.equal(options[options.length - 1].value, '__tools__');
  assert.equal(options[options.length - 1].label, 'enhancementCostToolType');
  // 装备部位按 sortIndex 排列，且不再单独列出每个生活工具。
  assert.deepEqual(plain(options.slice(1, 4).map((option) => option.value)), [
    '/equipment_types/main_hand', '/equipment_types/off_hand', '/equipment_types/back'
  ]);
  assert.ok(options.slice(0, -1).every((option) => !option.value.endsWith('_tool')));
  feature.pickerType = '__tools__';
  const tools = feature.getPickerOptions();
  assert.equal(tools.length, 80);
  assert.ok(tools.every((item) => item.detail.equipmentDetail.type.endsWith('_tool')));
  feature.pickerType = '/equipment_types/head';
  assert.ok(feature.getPickerOptions().every((item) => item.detail.equipmentDetail.type === '/equipment_types/head'));
});

test('视图渲染：没有目标装备时给出提示而不是错误数字', () => {
  const Feature = loadFeature(marketplace.marketData);
  const feature = new Feature();
  const html = feature.view.getView(feature);
  assert.match(html, /enhancementCostChooseTarget/);
  assert.doesNotMatch(html, /C0/);
});

test('强化物品价格计算器已接入菜单、模块装配、文案与样式', () => {
  assert.match(source, /EnhancementCostCalculatorFeature/);
  assert.match(source, /mst-enhancement-cost-style/);
  assert.match(source, /enhancementCostCalculator/);
  assert.match(source, /enhancementCost\.open\(\)/);

  const messages = vm.runInNewContext(
    `${readVmSource('src/common/messages.js')}
        I18N_MESSAGE_GROUPS;`
  );
  const enhancementMessages = messages.enhancementCost;
  assert.equal(enhancementMessages.enhancementCostTitle.zh, '强化物品价格计算器');
  assert.equal(enhancementMessages.enhancementCostExisting.zh, '已有装备');
  assert.equal(enhancementMessages.enhancementCostTarget.zh, '目标装备');
  [
    'enhancementCostHelp', 'enhancementCostPriceAutoHint', 'enhancementCostExistingNoSell', 'enhancementCostMissingPrice', 'enhancementCostPlanPad',
    'enhancementCostKindUnrefine', 'enhancementCostColumnAcquire', 'enhancementCostPlansTitle', 'enhancementCostPlanBest', 'enhancementCostPlanNoMarket',
    'enhancementCostPlanMissingPrice'
  ].forEach((key) => assert.ok(enhancementMessages[key]?.en, `${key} 缺少英文文案`));
  assert.match(enhancementMessages.enhancementCostHelp.zh, /贤者之镜/);
  assert.match(enhancementMessages.enhancementCostHelp.zh, /解精炼/);
  assert.match(enhancementMessages.enhancementCostHelp.zh, /不含普通强化/);
  assert.equal(messages.toolkitMenu.enhancementCostCalculator.zh, '强化物品价格计算器');

  const styles = readSourceFile('src/modules/enhancement-cost', 'styles.css');
  // 物品选择浮层与已选物品卡片是跨模块共用组件，样式统一放在 components.css。
  const componentsStyles = readSourceFile('src', 'common', 'styles', 'components.css');
  assert.match(componentsStyles, /\.mst-picker-panel \{/);
  assert.match(styles, /\.mst-enhancement-cost-plan-best/);
  assert.match(
    readSourceFile('src/modules/enhancement-cost', 'index.js'),
    /import MST_ENHANCEMENT_COST_CSS from '.\/styles.css'/
  );

  const usage = readSourceFile('docs', 'usage.md');
  assert.match(usage, /## 强化物品价格计算器/);
  assert.match(usage, /## Enhancement Cost Calculator/);
});
