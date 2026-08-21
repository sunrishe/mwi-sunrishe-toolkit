'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const dungeonFeatureSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'modules', 'dungeon-profit', 'index.js'),
  'utf8'
);
const dungeonMessagesSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'common', 'messages.js'), 'utf8');
const dungeonCalculatorSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'modules', 'dungeon-profit', 'calculator.js'),
  'utf8'
);
const integratedCssSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'common', 'styles', 'integrated.css'),
  'utf8'
);
const headerSource = fs.readFileSync(path.resolve(__dirname, '..', 'userscript-header.txt'), 'utf8');
const usageSource = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'usage.md'), 'utf8');
const analysisSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'docs', 'analysis', '地下城收益计算链路分析.md'),
  'utf8'
);
const clientData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'init_client_data.json'), 'utf8')
);
const characterData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'init_character_data.json'), 'utf8')
);

// 地下城收益测试直接加载官方样例数据，保证计算规则和文档描述能一起回归。
function loadService(activeClientData = clientData, activeCharacterData = characterData) {
  const DataHub = {
    characterData: {raw: activeCharacterData},
    getClientData() {
      return activeClientData;
    },
    getClientDataMap(key) {
      return activeClientData[key] || {};
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/calculator.js')}
        class DungeonProfitCalculatorServiceWithDataHub extends DungeonProfitCalculatorService {
          constructor(marketService) {
            super({DataHub}, marketService);
          }
        }
        DungeonProfitCalculatorServiceWithDataHub;`,
    {DataHub}
  );
}

function createMarketService(data = {}, marketValues = {}) {
  return {
    marketData: data,
    getMarketRow(itemHrid, level = 0) {
      return this.marketData?.[itemHrid]?.[String(level)] || null;
    },
    getMarketValue(itemHrid, level = 0) {
      const itemValues = marketValues?.[itemHrid];
      if (!itemValues) return 0;
      const value = Number(itemValues[level] ?? itemValues[String(level)] ?? 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }
  };
}

function createCompleteMarketData(ask = 100, bid = 80) {
  // 大多数用例只关注公式，完整市场数据用统一价格填充即可。
  return Object.fromEntries(
    Object.keys(clientData.itemDetailMap || {}).map((itemHrid) => [
      itemHrid, {0: {a: ask, b: bid}}
    ])
  );
}

function getPirateReward(itemSuffix) {
  const rewards = clientData.actionDetailMap['/actions/combat/pirate_cove'].combatZoneInfo.dungeonInfo.rewardDropTable;
  return rewards.find((reward) => reward.itemHrid.endsWith(itemSuffix));
}

test('读取四个官方地下城并按难度计算精炼宝箱概率', () => {
  const Service = loadService();
  const service = new Service(createMarketService());
  const refinement = getPirateReward('pirate_refinement_chest');

  assert.equal(service.getDungeons().length, 4);
  assert.equal(service.getExpectedCount(refinement, 0), 0);
  assert.equal(service.getExpectedCount(refinement, 1), 0.33);
  assert.equal(service.getExpectedCount(refinement, 2), 1);
});

test('地下城名称在官方语言资源缺失时使用内置中英文兜底', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  const messages = {
    dungeonNameChimericalDen: {zh: '奇幻洞穴', en: 'Chimerical Den'},
    dungeonNameSinisterCircus: {zh: '阴森马戏团', en: 'Sinister Circus'},
    dungeonNameEnchantedFortress: {zh: '秘法要塞', en: 'Enchanted Fortress'},
    dungeonNamePirateCove: {zh: '海盗基地', en: 'Pirate Cove'}
  };
  const action = clientData.actionDetailMap['/actions/combat/pirate_cove'];
  Feature.configure({
    DataHub: {
      getLocalizedGameName(_group, hrid) {
        return hrid.split('/').pop().replace(/_/g, ' ');
      }
    },
    i18n: {
      t(key) {
        return messages[key]?.zh || key;
      }
    },
    utils: {
      substrLastSlash(value) {
        return String(value || '')
          .split('/')
          .pop();
      }
    }
  });

  assert.equal(Feature.stateController.getDungeonName({}, action), '海盗基地');
});

test('不可交易牛铃和披风沿用康康运气的可交易替代物估值', () => {
  const Service = loadService();
  const service = new Service(
    createMarketService({
      '/items/bag_of_10_cowbells': {0: {a: 1000, b: 800}},
      '/items/mirror_of_protection': {0: {a: 5000, b: 4000}}
    })
  );

  assert.equal(service.getDirectPrice('/items/cowbell', 'ask'), 100);
  assert.equal(service.getDirectPrice('/items/cowbell', 'bid'), 80);
  assert.equal(service.getDirectPrice('/items/cowbell', 'bid', true), 65.6);
  // 关闭市场税选项后牛铃袋也不扣税，牛铃随袋继承；开启时才按 18% 特殊税率扣税。
  assert.equal(service.getDirectPrice('/items/cowbell', 'bid', false), 80);
  assert.equal(service.getDirectPrice('/items/chimerical_quiver', 'ask'), 5000);
  assert.equal(service.getDirectPrice('/items/chimerical_quiver', 'ask', true), 4750);
  assert.equal(service.getDirectPrice('/items/chimerical_quiver', 'ask', false), 5000);
  assert.equal(service.getDirectPrice('/items/enchanted_cloak', 'bid'), 4000);
});

test('四个地下城使用相同的 T0-T2 固定宝箱期望', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const expectedRefinement = [
    0, 1.295 * 0.33, 1.295
  ];

  service.getDungeons().forEach((dungeon) => {
    expectedRefinement.forEach((refinementQuantity, difficultyTier) => {
      const result = service.calculate({actionHrid: dungeon.hrid, difficultyTier, clearMinutes: 1440});
      assert.equal(result.clears, 1);
      assert.equal(result.normalQuantity, 1.295);
      assert.ok(Math.abs(result.refinementQuantity - refinementQuantity) < 1e-12);
      assert.equal(result.ticketQuantity, 1.295);
    });
  });
});

test('每日轮次和 T0-T2 宝箱期望计算保留完整精度', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', clearMinutes: 14};
  const t0 = service.calculate({...input, difficultyTier: 0});
  const t1 = service.calculate({...input, difficultyTier: 1});
  const t2 = service.calculate({...input, difficultyTier: 2});

  assert.equal(t0.clears, 1440 / 14);
  assert.equal(t0.normalQuantity, 133.2);
  assert.equal(t0.refinementQuantity, 0);
  assert.ok(Math.abs(t1.refinementQuantity - 43.956) < 1e-12);
  assert.equal(t2.refinementQuantity, 133.2);
  assert.equal(t2.ticketQuantity, t2.normalQuantity);
});

test('地下城收益固定按每日 24 小时计算', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', difficultyTier: 0, clearMinutes: 60};
  const result = service.calculate(input);
  const legacyState = service.calculate({...input, dailyHours: 1});

  assert.equal(result.clears, 24);
  assert.equal(legacyState.clears, 24);
});

test('地下城奖励概率只按官方难度固定且不受 Combat Drop Rate 影响', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const refinement = getPirateReward('pirate_refinement_chest');
  const input = {actionHrid: '/actions/combat/pirate_cove', difficultyTier: 1, clearMinutes: 14};
  const result = service.calculate(input);
  const legacyRateInput = service.calculate({...input, dropRate: 1});

  assert.equal(service.getDropRate(refinement, 1), 0.33);
  assert.equal(service.getDropRate(refinement, 2), 1);
  assert.equal(legacyRateInput.normalQuantity, result.normalQuantity);
  assert.equal(legacyRateInput.refinementQuantity, result.refinementQuantity);
});

test('掉落期望使用官方掉率和数量区间平均值', () => {
  const Service = loadService();
  const service = new Service(createMarketService());
  const drop = {dropRate: 0.5, minCount: 2, maxCount: 4};

  assert.equal(service.getExpectedCount(drop), 1.5);
});

test('制作材料成本读取官方配方并应用工匠茶与暴饮之囊强化等级', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData(100, 80)));
  const settings = service.getMaterialSettings(true, true, 10);
  const withoutPouch = service.getMaterialSettings(true, false, 10);

  assert.ok(Math.abs(settings.drinkConcentration - 0.12) < 1e-12);
  assert.ok(Math.abs(settings.artisan - 0.112) < 1e-12);
  assert.ok(Math.abs(settings.materialMultiplier - 0.888) < 1e-12);
  assert.equal(withoutPouch.drinkConcentration, 0);
  assert.equal(withoutPouch.artisan, 0.1);
  assert.equal(withoutPouch.materialMultiplier, 0.9);
  assert.ok(Math.abs(service.getCostPrice('/items/pirate_entry_key', 'ask', 'materials', 1) - 320000) < 1e-12);
  assert.ok(Math.abs(service.getCostPrice('/items/pirate_entry_key', 'ask', 'materials', 0.888) - 284160) < 1e-9);
  assert.ok(Math.abs(service.getCostPrice('/items/pirate_chest_key', 'ask', 'materials', 0.888) - 355.2) < 1e-9);
  assert.equal(service.getCostPrice('/items/pirate_entry_key', 'ask', 'market', 0.888), 100);
});

test('卖出总价按普通 5% 市场税与牛铃袋 18% 特殊税率分别扣税', () => {
  const syntheticClientData = {
    actionDetailMap: {},
    itemDetailMap: {'/items/test_chest': {hrid: '/items/test_chest'}},
    openableLootDropMap: {
      '/items/test_chest': [
        {
          itemHrid: '/items/test_item',
          dropRate: 1,
          minCount: 1,
          maxCount: 1
        }, {itemHrid: '/items/cowbell', dropRate: 1, minCount: 1, maxCount: 1}
      ]
    },
    shopItemDetailMap: {}
  };
  const market = createMarketService({
    '/items/test_item': {0: {a: 120, b: 100}},
    '/items/bag_of_10_cowbells': {0: {a: 1000, b: 1000}}
  });
  const Service = loadService(syntheticClientData, {});
  const service = new Service(market);
  const drops = new Map([
    [
      '/items/test_item', 1
    ], [
      '/items/cowbell', 1
    ]
  ]);
  // 关闭市场税选项（applyMarketTax=false）时所有物品按报价直接计算，牛铃/牛铃袋也不扣税，与产出口径一致。
  const untaxed = service.valueExpectedDrops(drops, service.getTokenValues(false), false, new Set());
  const taxed = service.valueExpectedDrops(drops, service.getTokenValues(true), true, new Set());
  // 每日产出完全按报价税前计算：普通物品与牛铃/牛铃袋都不扣税。
  const pretaxOutput = service.valueExpectedDrops(drops, service.getTokenValues(undefined), undefined, new Set());

  assert.equal(untaxed.bidTotal, 200);
  assert.equal(untaxed.askTotal, 220);
  assert.equal(taxed.bidTotal, 177);
  assert.equal(taxed.askTotal, 196);
  assert.equal(pretaxOutput.bidTotal, 200);
  assert.equal(pretaxOutput.askTotal, 220);
});

test('商店拆分代币估值在产出中不扣税，收益中随市场税选项扣税', () => {
  const syntheticClientData = {
    actionDetailMap: {},
    itemDetailMap: {
      '/items/test_chest': {hrid: '/items/test_chest'},
      '/items/essence': {hrid: '/items/essence'}
    },
    openableLootDropMap: {
      '/items/test_chest': [
        {itemHrid: '/items/token', dropRate: 1, minCount: 1, maxCount: 1}
      ]
    },
    shopItemDetailMap: {
      '/items/essence': {itemHrid: '/items/essence', costs: [
          {itemHrid: '/items/token', count: 1}
        ]}
    }
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(
    createMarketService({
      '/items/essence': {0: {a: 100, b: 80}},
      '/items/token': {0: {a: -1, b: -1}}
    })
  );
  // token 无市场价，估值来自商店拆分：产出路径必须不扣税（含 undefined 与关闭选项），勾选时才按 5% 扣税。
  assert.equal(service.getTokenValues(undefined).bid.get('/items/token'), 80);
  assert.equal(service.getTokenValues(false).bid.get('/items/token'), 80);
  assert.equal(service.getTokenValues(true).bid.get('/items/token'), 76);
  const drops = new Map([
    [
      '/items/token', 1
    ]
  ]);
  const pretax = service.valueExpectedDrops(drops, service.getTokenValues(undefined), undefined, new Set());
  const untaxed = service.valueExpectedDrops(drops, service.getTokenValues(false), false, new Set());
  const taxed = service.valueExpectedDrops(drops, service.getTokenValues(true), true, new Set());

  assert.equal(pretax.bidTotal, 80);
  assert.equal(untaxed.bidTotal, 80);
  assert.equal(taxed.bidTotal, 76);
});

test('可选择让所有背部装备产物按 0 计算收益', () => {
  const Service = loadService();
  const service = new Service(createMarketService({'/items/mirror_of_protection': {0: {a: 1000, b: 800}}}));
  const drops = new Map([
    [
      '/items/chimerical_quiver', 2
    ]
  ]);
  const missing = new Set();
  const normal = service.valueExpectedDrops(drops, service.getTokenValues(true), true, new Set());
  const excluded = service.valueExpectedDrops(drops, service.getTokenValues(true), true, missing, {
    excludeBackEquipmentValue: true
  });

  assert.equal(service.isBackEquipment('/items/chimerical_quiver'), true);
  assert.equal(normal.askTotal, 1900);
  assert.equal(normal.bidTotal, 1520);
  assert.equal(excluded.askTotal, 0);
  assert.equal(excluded.bidTotal, 0);
  assert.equal(missing.has('/items/chimerical_quiver'), false);
});

test('交易税倍率只通过公共常量使用', () => {
  const constantsSource = readSourceFile('src', 'common', 'constants.js');
  const calculatorSource = readSourceFile('src', 'modules', 'dungeon-profit', 'calculator.js');

  assert.match(constantsSource, /MARKET_TAX_RATE\s*=\s*0\.05/);
  assert.match(constantsSource, /MARKET_TAX_MULTIPLIER\s*=\s*1 - MARKET_TAX_RATE/);
  assert.match(constantsSource, /COWBELL_TAX_RATE\s*=\s*0\.18/);
  assert.match(constantsSource, /COWBELL_TAX_MULTIPLIER\s*=\s*1 - COWBELL_TAX_RATE/);
  assert.match(calculatorSource, /MARKET_TAX_MULTIPLIER/);
  assert.match(calculatorSource, /COWBELL_TAX_MULTIPLIER/);
  assert.doesNotMatch(calculatorSource, /\b0\.98\b/);
  assert.doesNotMatch(calculatorSource, /\b0\.95\b/);
  assert.doesNotMatch(calculatorSource, /\b0\.82\b/);
});

test('市场单侧缺价时按参考实现回退，避免宝箱产出误算为零', () => {
  const Service = loadService({actionDetailMap: {}, itemDetailMap: {}, openableLootDropMap: {}}, {});
  const service = new Service(
    createMarketService({'/items/bid_only': {0: {a: -1, b: 98}}, '/items/recent_only': {0: {a: -1, b: -1, p: 75}}})
  );

  assert.equal(service.getDirectPrice('/items/bid_only', 'ask'), 104);
  assert.equal(service.getDirectPrice('/items/bid_only', 'bid'), 98);
  assert.equal(service.getDirectPrice('/items/recent_only', 'ask'), 75);
  assert.equal(service.getDirectPrice('/items/recent_only', 'bid', true), 71);
});

test('牛铃袋市场完全缺价时牛铃按兜底价估值且不报缺价', () => {
  const Service = loadService();
  const service = new Service(createMarketService({'/items/bag_of_10_cowbells': {0: {a: -1, b: -1, p: -1}}}));
  const missing = new Set();
  const drops = new Map([
    [
      '/items/cowbell', 1
    ]
  ]);
  const result = service.valueExpectedDrops(drops, service.getTokenValues(true), true, missing);

  assert.equal(result.askTotal, 88163.6);
  assert.equal(result.bidTotal, 88163.6);
  assert.equal(missing.has('/items/cowbell'), false);
  assert.equal(service.getDirectPrice('/items/bag_of_10_cowbells', 'ask', true), 881636);
});

test('牛铃袋市场缺价时不再使用官方市场价值，直接按固定参考价兜底', () => {
  const Service = loadService();
  const service = new Service(
    createMarketService(
      {'/items/bag_of_10_cowbells': {0: {a: -1, b: -1, p: -1}}},
      {'/items/bag_of_10_cowbells': {0: 800000}}
    )
  );
  const missing = new Set();
  const drops = new Map([
    [
      '/items/cowbell', 1
    ]
  ]);
  const result = service.valueExpectedDrops(drops, service.getTokenValues(true), true, missing);

  // 官方市场价值不再参与兜底，牛铃袋按固定参考价 1,075,167 折算（×0.82 后 ÷10）。
  assert.equal(result.askTotal, 88163.6);
  assert.equal(result.bidTotal, 88163.6);
  assert.equal(missing.has('/items/cowbell'), false);
  assert.equal(service.getDirectPrice('/items/bag_of_10_cowbells', 'ask', true), 881636);
});

test('牛铃袋挂单存在时优先使用挂单价，与官方市场价值无关', () => {
  const Service = loadService();
  const service = new Service(
    createMarketService(
      {'/items/bag_of_10_cowbells': {0: {a: 900000, b: 800000, p: 850000}}},
      {'/items/bag_of_10_cowbells': {0: 800000}}
    )
  );

  assert.equal(service.getDirectPrice('/items/bag_of_10_cowbells', 'ask', true), 738000);
  assert.equal(service.getDirectPrice('/items/bag_of_10_cowbells', 'bid', true), 656000);
});

test('牛铃袋作为掉落时保留直接市场估值，不递归展开成牛铃', () => {
  const syntheticClientData = {
    actionDetailMap: {
      '/actions/combat/test_dungeon': {
        hrid: '/actions/combat/test_dungeon',
        combatZoneInfo: {isDungeon: true, dungeonInfo: {keyItemHrid: '/items/entry_key', rewardDropTable: [
              {itemHrid: '/items/test_chest'}
            ]}}
      }
    },
    itemDetailMap: {'/items/test_chest': {openKeyItemHrid: '/items/chest_key'}},
    openableLootDropMap: {
      '/items/test_chest': [
        {itemHrid: '/items/bag_of_10_cowbells', dropRate: 1, minCount: 1, maxCount: 1}
      ],
      '/items/bag_of_10_cowbells': [
        {itemHrid: '/items/cowbell', dropRate: 1, minCount: 10, maxCount: 10}
      ]
    },
    shopItemDetailMap: {}
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(createMarketService({'/items/bag_of_10_cowbells': {0: {a: 1000, b: 1000}}}));
  const result = service.calculate({actionHrid: '/actions/combat/test_dungeon', clearMinutes: 1440});

  assert.equal(result.expectedDrops.length, 1);
  assert.equal(result.expectedDrops[0].itemHrid, '/items/bag_of_10_cowbells');
  assert.equal(result.expectedDrops[0].quantity, 1.295);
  assert.equal(result.expectedDrops[0].ask, 820);
});

test('宝箱掉落期望合并重复物品', () => {
  const syntheticClientData = {
    actionDetailMap: {},
    itemDetailMap: {'/items/test_chest': {hrid: '/items/test_chest'}},
    openableLootDropMap: {
      '/items/test_chest': [
        {
          itemHrid: '/items/test_item',
          dropRate: 0.5,
          minCount: 2,
          maxCount: 4
        }, {itemHrid: '/items/test_item', dropRate: 0.1, minCount: 1, maxCount: 1}, {
          itemHrid: '/items/other_item',
          dropRate: 0.25,
          minCount: 1,
          maxCount: 1
        }
      ]
    },
    shopItemDetailMap: {}
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(
    createMarketService({'/items/test_item': {0: {a: 120, b: 100}}, '/items/other_item': {0: {a: 40, b: 20}}})
  );
  const expectation = service.calculateExpectedChestDrops([
    {itemHrid: '/items/test_chest', quantity: 2, isRefinement: false}
  ]);
  const output = service.valueExpectedDrops(expectation.normalDrops, service.getTokenValues(false), false, new Set());
  const testItem = output.items.find((item) => item.itemHrid === '/items/test_item');

  assert.ok(Math.abs(testItem.quantity - 3.2) < 1e-12);
  assert.equal(expectation.normalDrops.get('/items/other_item'), 0.5);
  assert.equal(testItem.bidValue, 320);
  assert.equal(testItem.askValue, 384);
  assert.equal(output.bidTotal, 330);
  assert.equal(output.askTotal, 404);
});

test('掉落表按官方宝箱直接掉落条目分别展示，同一物品多条掉落不合并', () => {
  const syntheticClientData = {
    actionDetailMap: {},
    itemDetailMap: {'/items/test_chest': {hrid: '/items/test_chest'}},
    openableLootDropMap: {
      '/items/test_chest': [
        {
          itemHrid: '/items/test_item',
          dropRate: 0.5,
          minCount: 2,
          maxCount: 4
        }, {itemHrid: '/items/test_item', dropRate: 0.1, minCount: 1, maxCount: 1}, {
          itemHrid: '/items/other_item',
          dropRate: 0.25,
          minCount: 1,
          maxCount: 1
        }
      ]
    },
    shopItemDetailMap: {}
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(
    createMarketService({'/items/test_item': {0: {a: 120, b: 100}}, '/items/other_item': {0: {a: 40, b: 20}}})
  );
  const expectation = service.calculateExpectedChestDrops([
    {itemHrid: '/items/test_chest', quantity: 2, isRefinement: false}
  ]);
  const dropTable = service.buildDropTable(
    expectation,
    new Map(expectation.normalDrops),
    2,
    0,
    service.getTokenValues(undefined),
    new Set(),
    {}
  );
  const testItems = dropTable.rows.filter((row) => row.itemHrid === '/items/test_item');
  const otherItem = dropTable.rows.find((row) => row.itemHrid === '/items/other_item');

  // 官方宝箱直接掉落条目分别成行，不递归展开、不按物品合并；掉率为打开该宝箱的官方掉率。
  assert.equal(dropTable.rows.length, 3);
  assert.equal(testItems.length, 2);
  assert.ok(Math.abs(testItems[0].dropRate - 0.5) < 1e-12);
  assert.ok(Math.abs(testItems[0].quantity - 3) < 1e-12);
  assert.ok(Math.abs(testItems[1].dropRate - 0.1) < 1e-12);
  assert.ok(Math.abs(testItems[1].quantity - 0.2) < 1e-12);
  assert.equal(testItems[0].askValue, 360);
  assert.equal(testItems[1].bidValue, 20);
  assert.equal(otherItem.dropRate, 0.25);
  assert.equal(otherItem.quantity, 0.5);
  // 期望数量 = 每日宝箱数量 × 掉率 × 平均掉落数量 = 2 × 0.5 × 3 = 3。
  assert.ok(Math.abs(testItems[0].quantity - 2 * 0.5 * ((2 + 4) / 2)) < 1e-12);
  assert.ok(Math.abs(otherItem.quantity - 2 * 0.25 * ((1 + 1) / 2)) < 1e-12);
  // 掉落表合计等于各行折算价值之和。
  assert.equal(dropTable.quantityTotal, 3.7);
  assert.equal(dropTable.askTotal, 404);
  assert.equal(dropTable.bidTotal, 330);
});

test('掉落表固定按税前报价展示，宝箱行按展开内容估值不显示 0', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const result = service.calculate({actionHrid: '/actions/combat/pirate_cove', difficultyTier: 0, clearMinutes: 1440});
  const essenceRows = result.dropTable.rows.filter((row) => row.itemHrid === '/items/pirate_essence');

  // 官方海盗普通宝箱含两条 pirate_essence（100%×400-800 与 5%×2000-4000），按官方条目分别成行。
  assert.equal(essenceRows.length, 2);
  assert.ok(Math.abs(essenceRows[0].dropRate - 1) < 1e-12);
  assert.ok(Math.abs(essenceRows[0].quantity - 777) < 1e-12);
  assert.ok(Math.abs(essenceRows[1].dropRate - 0.05) < 1e-12);
  assert.ok(Math.abs(essenceRows[1].quantity - 194.25) < 1e-12);
  essenceRows.forEach((row) => {
    assert.equal(row.chestType, 'normal');
    assert.equal(row.ask, 100);
    assert.equal(row.bid, 80);
  });
  // 嵌套宝箱（large_treasure_chest）按展开后的最终物品税前估值，单价与总值均不为 0。
  const nestedChestRow = result.dropTable.rows.find((row) => row.itemHrid === '/items/large_treasure_chest');
  assert.ok(nestedChestRow);
  assert.equal(nestedChestRow.chestType, 'normal');
  assert.ok(nestedChestRow.ask > 0);
  assert.ok(nestedChestRow.bid > 0);
  assert.ok(Math.abs(nestedChestRow.askValue - nestedChestRow.quantity * nestedChestRow.ask) < 1e-9);
  assert.ok(Math.abs(nestedChestRow.bidValue - nestedChestRow.quantity * nestedChestRow.bid) < 1e-9);
  // 展开估值落在合理区间：宝箱内容含金币与宝石，仅金币部分即远超普通物品单价。
  assert.ok(nestedChestRow.ask > 60000);
  // 合计等于各行折算价值之和，不随“收益扣除市场税”选项变化（掉落表始终按税前报价估值）。
  assert.equal(
    result.dropTable.askTotal,
    result.dropTable.rows.reduce((sum, row) => sum + row.askValue, 0)
  );
  assert.equal(
    result.dropTable.bidTotal,
    result.dropTable.rows.reduce((sum, row) => sum + row.bidValue, 0)
  );
  const untaxedResult = service.calculate({
    actionHrid: '/actions/combat/pirate_cove',
    difficultyTier: 0,
    clearMinutes: 1440,
    applyMarketTax: false
  });
  assert.equal(result.dropTable.askTotal, untaxedResult.dropTable.askTotal);
  assert.equal(result.dropTable.bidTotal, untaxedResult.dropTable.bidTotal);
});

test('掉落表按普通/精炼宝箱分节展示，精炼宝箱只产出精炼碎片且掉率为官方掉率', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const result = service.calculate({actionHrid: '/actions/combat/pirate_cove', difficultyTier: 2, clearMinutes: 1440});
  const essenceRows = result.dropTable.rows.filter((row) => row.itemHrid === '/items/pirate_essence');
  const shardRows = result.dropTable.rows.filter((row) => row.itemHrid === '/items/pirate_refinement_shard');

  assert.equal(result.normalQuantity, 1.295);
  assert.equal(result.refinementQuantity, 1.295);
  assert.equal(result.dropTable.normalQuantity, 1.295);
  assert.equal(result.dropTable.refinementQuantity, 1.295);
  // 普通专属物品掉率不受精炼箱稀释，仍显示官方掉率。
  assert.equal(essenceRows.length, 2);
  essenceRows.forEach((row) => assert.equal(row.chestType, 'normal'));
  assert.ok(Math.abs(essenceRows[0].dropRate - 1) < 1e-12);
  assert.ok(Math.abs(essenceRows[0].quantity - 777) < 1e-12);
  assert.ok(Math.abs(essenceRows[1].dropRate - 0.05) < 1e-12);
  // 精炼宝箱只产出精炼碎片，两条掉落（100%×1-2 与 5%×5-10）按官方条目展示。
  assert.equal(shardRows.length, 2);
  shardRows.forEach((row) => assert.equal(row.chestType, 'refinement'));
  assert.ok(Math.abs(shardRows[0].dropRate - 1) < 1e-12);
  assert.ok(Math.abs(shardRows[0].quantity - 1.9425) < 1e-12);
  assert.ok(Math.abs(shardRows[1].dropRate - 0.05) < 1e-12);
  assert.ok(Math.abs(shardRows[1].quantity - 0.485625) < 1e-12);
  // 期望数量 = 每日精炼宝箱数量 × 掉率 × 平均掉落数量。
  assert.ok(Math.abs(shardRows[0].quantity - 1.295 * 1 * ((1 + 2) / 2)) < 1e-12);
  // 所有行都标记宝箱来源，合计等于各行折算价值之和。
  result.dropTable.rows.forEach((row) => {
    assert.ok(row.chestType === 'normal' || row.chestType === 'refinement');
  });
  assert.equal(
    result.dropTable.askTotal,
    result.dropTable.rows.reduce((sum, row) => sum + row.askValue, 0)
  );
  assert.equal(
    result.dropTable.bidTotal,
    result.dropTable.rows.reduce((sum, row) => sum + row.bidValue, 0)
  );
  // 两种宝箱并存时各节小计等于本小节各行折算价值之和。
  assert.equal(
    result.dropTable.normalAskSubtotal,
    result.dropTable.rows.filter((row) => row.chestType === 'normal').reduce((sum, row) => sum + row.askValue, 0)
  );
  assert.equal(
    result.dropTable.normalBidSubtotal,
    result.dropTable.rows.filter((row) => row.chestType === 'normal').reduce((sum, row) => sum + row.bidValue, 0)
  );
  assert.equal(
    result.dropTable.refinementAskSubtotal,
    result.dropTable.rows.filter((row) => row.chestType === 'refinement').reduce((sum, row) => sum + row.askValue, 0)
  );
  assert.equal(
    result.dropTable.refinementBidSubtotal,
    result.dropTable.rows.filter((row) => row.chestType === 'refinement').reduce((sum, row) => sum + row.bidValue, 0)
  );
  assert.equal(result.dropTable.normalAskSubtotal + result.dropTable.refinementAskSubtotal, result.dropTable.askTotal);
  assert.equal(result.dropTable.normalBidSubtotal + result.dropTable.refinementBidSubtotal, result.dropTable.bidTotal);
});

test('地下城结果区按 tab 切换收益结果与掉落物表格', () => {
  assert.match(dungeonFeatureSource, /viewTab: 'result'/);
  assert.match(dungeonFeatureSource, /i18n\.t\('dungeonResultTab'\)/);
  assert.match(dungeonFeatureSource, /i18n\.t\('dungeonLootTab'\)/);
  assert.match(dungeonFeatureSource, /i18n\.t\('dropItem'\)/);
  assert.match(dungeonFeatureSource, /i18n\.t\('dropRate'\)/);
  assert.match(dungeonFeatureSource, /i18n\.t\('expectedQuantity'\)/);
  // 单价列复用技能模块的市场方向与合计文案，不新增重复全局键。
  assert.equal(dungeonFeatureSource.match(/i18n\.t\('askPriceAndTotal'\)/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/i18n\.t\('bidPriceAndTotal'\)/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/i18n\.t\('total'\)/g)?.length, 1);
  assert.match(dungeonFeatureSource, /feature\.state\.viewTab = 'result'/);
  assert.match(dungeonFeatureSource, /feature\.state\.viewTab = 'loot'/);
  assert.match(dungeonFeatureSource, /\.hidden=\$\{!showResult\}/);
  assert.match(dungeonFeatureSource, /\.hidden=\$\{feature\.state\.viewTab !== 'loot'\}/);
  assert.match(dungeonFeatureSource, /formatDropRate/);
  assert.match(dungeonFeatureSource, /mst-dungeon-row-loot/);
  assert.match(dungeonFeatureSource, /<tfoot>/);
  // 掉落物表按官方宝箱直接掉落条目分节展示，普通/精炼宝箱各一小节。
  assert.match(dungeonFeatureSource, /normalChestLoot/);
  assert.match(dungeonFeatureSource, /refinementChestLoot/);
  assert.match(dungeonFeatureSource, /chestType === 'normal'/);
  assert.match(dungeonFeatureSource, /chestType === 'refinement'/);
  assert.match(dungeonFeatureSource, /mst-dungeon-row-section/);
  // uhtml 不支持嵌套数组插值：小节标题行与行数组必须展开为同一扁平数组，否则运行时渲染抛错。
  assert.match(
    dungeonFeatureSource,
    /mst-dungeon-row-section[\s\S]*?<th colspan="3">\$\{label\}<\/th>[\s\S]*?<\/tr>`,[\s\S]*?\.\.\.rows\.map/
  );
  // 掉率单行展示，悬浮提示展示掉落数量区间；期望数量带悬浮提示展示计算公式与结果。
  assert.match(dungeonFeatureSource, /mst-dungeon-loot-rule/);
  assert.match(dungeonFeatureSource, /dropQuantityHint/);
  assert.match(dungeonFeatureSource, /mst-dungeon-loot-quantity/);
  assert.match(dungeonFeatureSource, /expectedQuantityFormula/);
  assert.match(dungeonFeatureSource, /expectedQuantityResult/);
  assert.match(dungeonFeatureSource, /quantityRange/);
  // 新文案中英文齐全。
  assert.match(dungeonMessagesSource, /dungeonResultTab: \{zh: '收益结果', en: 'Profit'\}/);
  assert.match(dungeonMessagesSource, /dungeonLootTab: \{zh: '掉落物', en: 'Loot'\}/);
  assert.match(dungeonMessagesSource, /dropItem: \{zh: '物品', en: 'Item'\}/);
  assert.match(dungeonMessagesSource, /dropRate: \{zh: '掉率', en: 'Drop Rate'\}/);
  assert.match(dungeonMessagesSource, /dropQuantityHint: \{zh: '掉落数量 \{0\}', en: 'Drop Quantity \{0\}'\}/);
  assert.match(dungeonMessagesSource, /expectedQuantity: \{zh: '期望数量', en: 'Expected Quantity'\}/);
  assert.match(dungeonMessagesSource, /normalChestLoot: \{zh: '普通宝箱掉落物', en: 'Normal Chest Drops'\}/);
  assert.match(dungeonMessagesSource, /refinementChestLoot: \{zh: '精炼宝箱掉落物', en: 'Refined Chest Drops'\}/);
  assert.match(dungeonMessagesSource, /chestDropsPerDay: \{zh: '\{0\} 个\/天', en: '\{0\} per day'\}/);
  assert.match(dungeonMessagesSource, /expectedQuantityFormula:/);
  assert.match(dungeonMessagesSource, /expectedQuantityResult:/);
  // 掉落表样式与结果表分开定义，tab 与容器显式隐藏。
  assert.match(integratedCssSource, /\.mst-dungeon-loot-table\s*\{[^}]*min-width:\s*36rem/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-col-item\s*\{[^}]*width:\s*26%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-col-rate\s*\{[^}]*width:\s*14%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-col-quantity\s*\{[^}]*width:\s*15%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-rule\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-quantity\s*\{[^}]*cursor:\s*help/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-quantity\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-price\s*\{/);
  assert.match(integratedCssSource, /\.mst-dungeon-tab-active\s*\{/);
  assert.match(integratedCssSource, /\.mst-dungeon-table-wrap\[hidden\]\s*\{[^}]*display:\s*none/s);
  // 掉落表不设置纵向滚动条，纵向滚动由整体弹窗容器承担。
  assert.match(integratedCssSource, /\.mst-dungeon-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(integratedCssSource, /\.mst-dungeon-table-wrap\s*\{[^}]*max-height/s);
  // 物品单元格展示游戏图标 + 名称，图标宽度固定、名称自然换行。
  assert.match(dungeonFeatureSource, /class="mst-dungeon-loot-item"[^>]*>\s*<svg/);
  assert.match(dungeonFeatureSource, /getItemIconHref/);
  assert.match(dungeonFeatureSource, /getSpriteUrl\?\.\('items'\)/);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-item\s*\{[^}]*display:\s*flex/s);
  assert.match(integratedCssSource, /\.mst-dungeon-loot-item svg\s*\{[^}]*width:\s*1\.25rem/s);
  // 掉落表固定按税前报价估值，宝箱行按展开内容估值并输出各节小计。
  assert.match(dungeonCalculatorSource, /buildDropTable/);
  assert.match(dungeonCalculatorSource, /valueExpectedDrops\(allDrops, tokenValues, undefined, missing, options\)/);
  assert.match(dungeonCalculatorSource, /collectDirectEntries/);
  assert.match(dungeonCalculatorSource, /expandChestItems/);
  assert.match(dungeonCalculatorSource, /normalEntryTriggers/);
  assert.match(dungeonCalculatorSource, /refinementEntryTriggers/);
  assert.match(dungeonCalculatorSource, /normalAskSubtotal/);
  assert.match(dungeonCalculatorSource, /refinementBidSubtotal/);
  // 各节标题行右侧始终展示该节价值小计，不带额外文本；小计与合计都不含数量列。
  assert.match(dungeonFeatureSource, /mst-dungeon-row-subtotal/);
  assert.doesNotMatch(dungeonFeatureSource, /i18n\.t\('subtotal'\)/);
  assert.match(dungeonFeatureSource, /colspan="3"/);
  assert.match(dungeonFeatureSource, /formatMoney\(subtotalAsk\)/);
  assert.match(integratedCssSource, /\.mst-dungeon-row-subtotal td\s*\{/);
});

test('队伍人数按官方公式缩放宝箱期望，默认 5 人且战斗掉落 Buff 与旧统计周期参数不参与', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', difficultyTier: 1, clearMinutes: 14};
  const result = service.calculate(input);
  const legacyInput = service.calculate({...input, partySize: 1, dropQuantity: 10, dropRate: 10, periodDays: 14});

  assert.equal(result.partySize, 5);
  assert.equal(result.normalPerRun, 1.295);
  assert.equal(legacyInput.clears, result.clears);
  assert.equal(legacyInput.normalQuantity, result.normalQuantity * 5);
  assert.equal(legacyInput.refinementQuantity, result.refinementQuantity * 5);
  assert.equal(legacyInput.ticketQuantity, result.ticketQuantity * 5);
  [
    [
      1, 6.475
    ], [
      2, 3.2375
    ], [
      3, (5 / 3) * 1.295
    ], [
      4, 1.61875
    ], [
      5, 1.295
    ]
  ].forEach(
    ([
      partySize, expectedPerRun
    ]) => {
      const scaled = service.calculate({...input, partySize});
      assert.ok(Math.abs(scaled.normalPerRun - expectedPerRun) < 1e-12);
      assert.ok(Math.abs(scaled.normalQuantity - result.normalQuantity * (expectedPerRun / 1.295)) < 1e-12);
      assert.equal(scaled.ticketQuantity, scaled.normalQuantity);
    }
  );
});

test('门票数量始终等于完整精度的普通宝箱期望', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const result = service.calculate({actionHrid: '/actions/combat/pirate_cove', difficultyTier: 2, clearMinutes: 14});

  assert.equal(result.ticketQuantityPerRun, 1.295);
  assert.equal(result.ticketQuantity, 133.2);
  assert.equal(result.ticketQuantity, result.normalQuantity);
  assert.equal(result.openingKeyQuantityPerRun, 2.59);
  assert.equal(result.openingKeyQuantity, 266.4);
});

test('制作和购买钥匙分别扣除门票与开箱钥匙成本后得到收益区间', () => {
  const syntheticClientData = {
    actionDetailMap: {
      '/actions/combat/test_dungeon': {
        hrid: '/actions/combat/test_dungeon',
        combatZoneInfo: {isDungeon: true, dungeonInfo: {keyItemHrid: '/items/entry_key', rewardDropTable: [
              {itemHrid: '/items/test_chest', dropRate: 1, minCount: 1, maxCount: 1}
            ]}}
      }
    },
    itemDetailMap: {'/items/test_chest': {openKeyItemHrid: '/items/chest_key'}},
    openableLootDropMap: {'/items/test_chest': [
        {itemHrid: '/items/test_item', dropRate: 1, minCount: 2, maxCount: 2}
      ]},
    shopItemDetailMap: {}
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(
    createMarketService({
      '/items/entry_key': {0: {a: 10, b: 8}},
      '/items/chest_key': {0: {a: 4, b: 3}},
      '/items/test_item': {0: {a: 100, b: 80}}
    })
  );
  const result = service.calculate({actionHrid: '/actions/combat/test_dungeon', clearMinutes: 1440});
  const market = result.costScenarios.market;
  const materials = result.costScenarios.materials;

  assert.equal(result.totalChestQuantity, 1.295);
  assert.equal(result.expectedDrops[0].quantity, 2.59);
  assert.ok(Math.abs(result.totalRevenueConservative - 196.84) < 1e-12);
  assert.ok(Math.abs(result.totalRevenueOptimistic - 246.05) < 1e-12);
  // 每日宝箱产出完全按报价税前计算，不随市场税选项变化。
  assert.ok(Math.abs(result.normalChestOutputConservative - 207.2) < 1e-12);
  assert.ok(Math.abs(result.normalChestOutputOptimistic - 259) < 1e-12);
  // 关闭市场税选项后普通物品按报价直接计算，收益不再扣 5% 市场税。
  const untaxedResult = service.calculate({
    actionHrid: '/actions/combat/test_dungeon',
    clearMinutes: 1440,
    applyMarketTax: false
  });
  assert.ok(Math.abs(untaxedResult.totalRevenueConservative - 207.2) < 1e-12);
  assert.ok(Math.abs(untaxedResult.totalRevenueOptimistic - 259) < 1e-12);
  assert.ok(Math.abs(market.totalCostConservative - 18.13) < 1e-12);
  assert.ok(Math.abs(market.totalCostOptimistic - 14.245) < 1e-12);
  assert.ok(Math.abs(market.profitConservative - 178.71) < 1e-12);
  assert.ok(Math.abs(market.profitOptimistic - 231.805) < 1e-12);
  assert.ok(Math.abs(market.normalChestUnitProfitConservative - 138) < 1e-12);
  assert.ok(Math.abs(market.normalChestUnitProfitOptimistic - 179) < 1e-12);
  assert.equal(market.profitPerRunConservative, market.profitConservative);
  assert.equal(market.profitPerRunOptimistic, market.profitOptimistic);
  assert.equal(materials.totalCostConservative, 0);
  assert.equal(materials.profitConservative, result.totalRevenueConservative);
  assert.equal(materials.normalChestUnitProfitConservative, result.normalRevenueConservative / result.normalQuantity);

  const customCases = [
    {
      buySide: 'ask',
      sellSide: 'ask',
      ticketPrice: 10,
      openingKeyPrice: 4,
      unitProfit: 176,
      profit: 227.92
    }, {buySide: 'ask', sellSide: 'bid', ticketPrice: 10, openingKeyPrice: 4, unitProfit: 138, profit: 178.71}, {
      buySide: 'bid',
      sellSide: 'ask',
      ticketPrice: 8,
      openingKeyPrice: 3,
      unitProfit: 179,
      profit: 231.805
    }, {buySide: 'bid', sellSide: 'bid', ticketPrice: 8, openingKeyPrice: 3, unitProfit: 141, profit: 182.595}
  ];
  for (const customCase of customCases) {
    const customResult = service.calculate({
      actionHrid: '/actions/combat/test_dungeon',
      clearMinutes: 1440,
      customMode: true,
      customKeySource: 'market',
      customBuySide: customCase.buySide,
      customSellSide: customCase.sellSide
    });
    assert.equal(customResult.customScenario.keySource, 'market');
    assert.equal(customResult.customScenario.buySide, customCase.buySide);
    assert.equal(customResult.customScenario.sellSide, customCase.sellSide);
    assert.equal(customResult.customScenario.ticketPrice, customCase.ticketPrice);
    assert.equal(customResult.customScenario.openingKeyPrice, customCase.openingKeyPrice);
    assert.ok(Math.abs(customResult.customScenario.normalChestUnitProfit - customCase.unitProfit) < 1e-12);
    assert.ok(Math.abs(customResult.customScenario.profit - customCase.profit) < 1e-12);
  }
});

test('普通与精炼宝箱分别扣除对应来源成本且每日收益不重复扣费', () => {
  const syntheticClientData = {
    actionDetailMap: {
      '/actions/combat/test_dungeon': {
        hrid: '/actions/combat/test_dungeon',
        combatZoneInfo: {isDungeon: true, dungeonInfo: {keyItemHrid: '/items/entry_key', rewardDropTable: [
              {itemHrid: '/items/test_chest'}, {itemHrid: '/items/test_refinement_chest'}
            ]}}
      }
    },
    itemDetailMap: {
      '/items/test_chest': {openKeyItemHrid: '/items/chest_key'},
      '/items/test_refinement_chest': {openKeyItemHrid: '/items/chest_key'}
    },
    openableLootDropMap: {'/items/test_chest': [
        {itemHrid: '/items/coin', dropRate: 1, minCount: 100, maxCount: 100}
      ], '/items/test_refinement_chest': [
        {itemHrid: '/items/coin', dropRate: 1, minCount: 200, maxCount: 200}
      ]},
    shopItemDetailMap: {}
  };
  const Service = loadService(syntheticClientData, {});
  const service = new Service(
    createMarketService({'/items/entry_key': {0: {a: 10, b: 8}}, '/items/chest_key': {0: {a: 4, b: 3}}})
  );
  const result = service.calculate({actionHrid: '/actions/combat/test_dungeon', difficultyTier: 2, clearMinutes: 1440});
  const market = result.costScenarios.market;

  assert.equal(market.normalOpeningCostConservative, 5.18);
  assert.equal(market.refinementOpeningCostConservative, 5.18);
  assert.ok(Math.abs(market.normalChestUnitProfitConservative - 86) < 1e-12);
  assert.ok(Math.abs(market.normalChestUnitProfitOptimistic - 89) < 1e-12);
  assert.ok(Math.abs(market.refinementChestUnitProfitConservative - 196) < 1e-12);
  assert.ok(Math.abs(market.refinementChestUnitProfitOptimistic - 197) < 1e-12);
  assert.ok(
    Math.abs(
      market.profitConservative -
        (market.normalChestUnitProfitConservative * result.normalQuantity +
          market.refinementChestUnitProfitConservative * result.refinementQuantity)
    ) < 1e-12
  );
  assert.ok(Math.abs(market.profitConservative - 365.19) < 1e-12);
});

test('每日药品饮料成本按 M 换算并从每日及每车收益中分摊扣除', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', difficultyTier: 0, clearMinutes: 14};
  const baseline = service.calculate(input);
  const result = service.calculate({...input, dailyConsumablesCost: 12.5});

  assert.equal(result.dailyConsumablesCost, 12_500_000);
  [
    'materials', 'market'
  ].forEach((mode) => {
    assert.equal(
      result.costScenarios[mode].totalCostConservative - baseline.costScenarios[mode].totalCostConservative,
      12_500_000
    );
    assert.equal(
      baseline.costScenarios[mode].profitConservative - result.costScenarios[mode].profitConservative,
      12_500_000
    );
    assert.ok(
      Math.abs(
        baseline.costScenarios[mode].profitPerRunConservative -
          result.costScenarios[mode].profitPerRunConservative -
          12_500_000 / result.clears
      ) < 1e-9
    );
  });
});

test('普通与精炼宝箱共用官方开箱钥匙', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const result = service.calculate({
    actionHrid: '/actions/combat/pirate_cove',
    difficultyTier: 2,
    clearMinutes: 14,
    dropQuantity: 0
  });

  assert.equal(result.openingKeys.length, 1);
  assert.equal(result.openingKeys[0].itemHrid, '/items/pirate_chest_key');
  assert.equal(result.openingKeys[0].quantity, result.totalChestQuantity);
  assert.equal(result.openingKeys[0].quantityPerRun, result.totalChestPerRun);
});

test('嵌套宝箱递归计算期望并计入最终掉落', () => {
  const nestedClientData = {
    actionDetailMap: {},
    itemDetailMap: {
      '/items/root_chest': {hrid: '/items/root_chest'},
      '/items/inner_chest': {hrid: '/items/inner_chest'}
    },
    openableLootDropMap: {'/items/root_chest': [
        {itemHrid: '/items/inner_chest', dropRate: 1, minCount: 2, maxCount: 2}
      ], '/items/inner_chest': [
        {itemHrid: '/items/coin', dropRate: 1, minCount: 100, maxCount: 100}
      ]},
    shopItemDetailMap: {}
  };
  const Service = loadService(nestedClientData, {});
  const service = new Service(createMarketService());
  const expectation = service.calculateExpectedChestDrops([
    {itemHrid: '/items/root_chest', quantity: 1, isRefinement: false}
  ]);
  const output = service.valueExpectedDrops(expectation.normalDrops, service.getTokenValues(false), false, new Set());

  assert.equal(expectation.normalDrops.has('/items/inner_chest'), false);
  assert.equal(expectation.normalDrops.get('/items/coin'), 200);
  assert.equal(output.bidTotal, 200);
  assert.equal(output.askTotal, 200);
});

test('市场缺价时结果保持有限数值并报告缺价', () => {
  const Service = loadService();
  const service = new Service(createMarketService());
  const result = service.calculate({
    actionHrid: '/actions/combat/pirate_cove',
    difficultyTier: 0,
    clearMinutes: 14,
    dropQuantity: 0.295
  });

  Object.values(result.costScenarios).forEach((scenario) => {
    [
      scenario.ticketCostConservative, scenario.openingCostConservative, result.totalRevenueConservative, scenario.profitConservative, scenario.profitPerRunConservative
    ].forEach((value) => assert.ok(Number.isFinite(value)));
  });
  assert.ok(result.missingPrices.length > 0);
});

test('主脚本包含正式元信息、工具箱入口和完整国际化入口', () => {
  assert.match(headerSource, /@name\s+MWI Sunrishe Toolkit/);
  assert.match(headerSource, /@version\s+__MST_VERSION__/);
  assert.match(headerSource, /@license\s+ISC/);
  assert.match(source, /key: 'dungeonProfitCalculator', icon: 'loot_tracker'/);
  assert.match(dungeonMessagesSource, /dungeonCalculatorHelp:/);
  assert.match(source, /class DungeonProfitCalculatorFeature/);
  assert.doesNotMatch(source, /useCharacterBuff|useCharacterDropQuantity|useCharacterDropRate|dailyHours/);
  assert.match(source, /costScenarios/);
  assert.match(dungeonFeatureSource, /useArtisanTea: true/);
  assert.match(dungeonFeatureSource, /CharacterDataService\?\.getCharacterItems/);
  assert.match(dungeonFeatureSource, /item\?\.itemHrid === '\/items\/guzzling_pouch'/);
  assert.doesNotMatch(dungeonFeatureSource, /costMode|costCalculationMode/);
  assert.doesNotMatch(dungeonFeatureSource, /simulationSeed|createRandom/);
  assert.match(dungeonFeatureSource, /partySize: '5'/);
  assert.doesNotMatch(dungeonFeatureSource, /combatDropRate|periodDays/);
  // 市场税选项重新提供，但默认勾选，避免回归到 v2.8 之前默认不扣税的行为。
  assert.match(dungeonFeatureSource, /applyMarketTax: true/);
});

test('地下城操作区保留基础参数并按需展示自定义价格参数', () => {
  const keys = [
    'dungeon', 'difficultyTier', 'partySize', 'clearTimeMinutes', 'dailyConsumablesCost',
    'artisanTea', 'guzzlingLevel', 'applyMarketTax', 'excludeBackEquipmentValue', 'customMode',
    'keySource', 'keyMaterialPurchaseMethod', 'goodsSaleMethod'
  ];
  const positions = keys.map((key) => dungeonFeatureSource.indexOf(`i18n.t('${key}')`));

  positions.forEach((position) => assert.ok(position >= 0));
  assert.deepEqual(
    positions,
    [
      ...positions
    ].sort((left, right) => left - right)
  );
  assert.equal(dungeonFeatureSource.match(/\.checked=\$\{feature\.state\.useArtisanTea\}/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/\.checked=\$\{feature\.state\.useGuzzlingPouch\}/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/\.checked=\$\{feature\.state\.excludeBackEquipmentValue\}/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/\.checked=\$\{feature\.state\.customMode\}/g)?.length, 1);
  assert.equal(dungeonFeatureSource.match(/\.hidden=\$\{!feature\.state\.customMode\}/g)?.length, 3);
  assert.match(dungeonFeatureSource, /\.disabled=\$\{!feature\.state\.useGuzzlingPouch\}/);
  assert.match(dungeonFeatureSource, /feature\.state\.customMode/);
  assert.match(dungeonFeatureSource, /keyPurchaseMethod/);
  assert.match(dungeonFeatureSource, /customKeySource/);
  assert.match(dungeonFeatureSource, /customBuySide/);
  assert.match(dungeonFeatureSource, /customSellSide/);
  assert.match(dungeonFeatureSource, /<div class="mst-dungeon-results"><\/div>/);
  assert.match(dungeonFeatureSource, /TemplateRenderer\.render\(\(\) => feature\.renderResult\(result\), resultRoot\)/);
  assert.doesNotMatch(dungeonFeatureSource, /\$\{feature\.renderResult\(result\)\}/);
  assert.doesNotMatch(dungeonFeatureSource, /\.disabled=\$\{!feature\.state\.useArtisanTea/);
  assert.doesNotMatch(dungeonFeatureSource, /manualDrop|CharacterDrop|i18n\.t\('combatDrop/);
  // 单次耗时与每日成本输入 step=1：加减按钮按整数步进，手动输入仍可保留一位小数（无表单校验拦截）。
  assert.equal(dungeonFeatureSource.match(/step="1"/g)?.length, 2);
  assert.doesNotMatch(dungeonFeatureSource, /step="0\.1"/);
});

test('地下城结果明确分为材料成本和预期产出并并列两种钥匙来源', () => {
  assert.match(dungeonFeatureSource, /materialCostBreakdown/);
  assert.match(dungeonMessagesSource, /materialCostBreakdown: \{zh: '材料成本', en: 'Material Costs'\}/);
  assert.match(dungeonFeatureSource, /craftedKeys/);
  assert.match(dungeonFeatureSource, /purchasedKeys/);
  assert.match(dungeonFeatureSource, /key: 'ticketUnitPrice'/);
  assert.match(dungeonFeatureSource, /key: 'keyUnitPrice'/);
  assert.match(dungeonFeatureSource, /expectedChestOutputBreakdown/);
  assert.match(dungeonMessagesSource, /expectedChestOutputBreakdown: \{zh: '预期产出', en: 'Expected Output'\}/);
  assert.match(dungeonFeatureSource, /totalDailyCost/);
  assert.match(dungeonFeatureSource, /key: 'netProfit'/);
  assert.match(dungeonFeatureSource, /key: 'profitPerRun'/);
  assert.match(dungeonFeatureSource, /key: 'netProfit'[\s\S]*?type: 'revenue'/);
  assert.match(dungeonFeatureSource, /key: 'profitPerRun'[\s\S]*?type: 'revenue'/);
  // 每日普通/精炼宝箱产出跟在对应宝箱收益行之后，使用完全税前报价估值。
  assert.match(dungeonFeatureSource, /key: 'normalChestDailyOutput'/);
  assert.match(dungeonFeatureSource, /key: 'refinementChestDailyOutput'/);
  assert.match(dungeonFeatureSource, /normalChestOutputConservative/);
  assert.match(dungeonFeatureSource, /refinementChestOutputConservative/);
  assert.match(
    dungeonMessagesSource,
    /normalChestDailyOutput: \{zh: '每日普通宝箱产出', en: 'Daily Normal Chest Output'\}/
  );
  assert.match(
    dungeonMessagesSource,
    /refinementChestDailyOutput: \{zh: '每日精炼宝箱产出', en: 'Daily Refinement Chest Output'\}/
  );
  assert.match(dungeonFeatureSource, /row\.values\.materials\.conservative/);
  assert.match(dungeonFeatureSource, /row\.values\.market\.conservative/);
  assert.match(dungeonFeatureSource, /row\.values\.custom/);
  assert.match(dungeonFeatureSource, /colspan="2"[^>]*>\$\{i18n\.t\('customResult'\)\}/);
  assert.doesNotMatch(dungeonFeatureSource, /entryTicketCostPerRun|chestOpeningCostPerRun|key: 'totalCostPerRun'/);
  assert.doesNotMatch(dungeonFeatureSource, /materialConsumption|renderMaterialConsumption/);
  assert.doesNotMatch(
    dungeonMessagesSource,
    /entryTicketCostPerRun|chestOpeningCostPerRun|totalCostPerRun|materialConsumption/
  );
  assert.doesNotMatch(dungeonFeatureSource, /key: 'totalChestRevenue'/);
  assert.doesNotMatch(dungeonFeatureSource, /periodDailyProfit|periodDailyProfits|DUNGEON_PERIOD_DAYS/);
  assert.match(dungeonFeatureSource, /mst-dungeon-row-section/);
  assert.match(
    dungeonFeatureSource,
    /mst-dungeon-row-section[\s\S]*?<th colspan="2">\$\{row\.label[\s\S]*?conservativeKey[\s\S]*?optimisticKey[\s\S]*?getCustomPriceLabel/
  );
  assert.match(dungeonFeatureSource, /priceDirection: 'buy'/);
  assert.match(dungeonFeatureSource, /priceDirection: 'sell'/);
  assert.doesNotMatch(dungeonFeatureSource, /<th rowspan="2">/);
  assert.match(dungeonMessagesSource, /leftBuy: \{zh: '左买', en: 'Ask Buy'\}/);
  assert.match(dungeonMessagesSource, /rightBuy: \{zh: '右买', en: 'Bid Buy'\}/);
  assert.match(dungeonMessagesSource, /leftSell: \{zh: '左卖', en: 'Ask Sell'\}/);
  assert.match(dungeonMessagesSource, /rightSell: \{zh: '右卖', en: 'Bid Sell'\}/);
  assert.match(dungeonMessagesSource, /conservative: \{zh: '右卖 \/ 左买', en: 'Bid Sell \/ Ask Buy'\}/);
  assert.match(dungeonMessagesSource, /optimistic: \{zh: '左卖 \/ 右买', en: 'Ask Sell \/ Bid Buy'\}/);
  assert.match(
    dungeonMessagesSource,
    /normalChestRevenue: \{zh: '单个普通宝箱收益', en: 'Normal Chest Profit \(Each\)'\}/
  );
  assert.match(
    dungeonMessagesSource,
    /refinementChestRevenue: \{zh: '单个精炼宝箱收益', en: 'Refinement Chest Profit \(Each\)'\}/
  );
  // 地下城价格只来自市场挂单/成交与牛铃袋固定参考价，不使用官方市场价值（marketItemValues）。
  assert.doesNotMatch(dungeonCalculatorSource, /getMarketValue/);
  assert.doesNotMatch(dungeonMessagesSource, /(?:conservative|optimistic): \{zh: '[^']*(?:Bid|Ask)/);
});

test('地下城成本和产出分区列头只显示各自相关的价格方向', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({i18n: {t: (key) => key}});

  assert.equal(
    Feature.view.getCustomPriceLabel({customScenario: {buySide: 'ask', sellSide: 'bid'}}, 'buy', Feature.ctx.i18n),
    'leftBuy'
  );
  assert.equal(
    Feature.view.getCustomPriceLabel({customScenario: {buySide: 'bid', sellSide: 'ask'}}, 'sell', Feature.ctx.i18n),
    'leftSell'
  );
});

test('市场税选项默认勾选，悬浮提示与帮助文案从公共常量动态生成税率', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  const rendered = {};
  const TemplateRenderer = {
    html(strings, ...values) {
      return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
    },
    render(template) {
      rendered.markup = template();
      return null;
    }
  };
  const i18n = {
    t(key, ...args) {
      return args.length ? `${key}(${args.join('/')})` : key;
    }
  };
  const service = {
    getDungeons() {
      return [
        {hrid: '/actions/combat/pirate_cove'}
      ];
    },
    calculate(input) {
      rendered.input = input;
      return null;
    }
  };
  const feature = {
    root: {
      querySelector() {
        return null;
      }
    },
    state: {
      actionHrid: '/actions/combat/pirate_cove',
      difficultyTier: 0,
      partySize: '5',
      clearMinutes: '30',
      dailyConsumablesCost: '',
      useArtisanTea: true,
      useGuzzlingPouch: true,
      guzzlingLevel: '0',
      excludeBackEquipmentValue: false,
      applyMarketTax: true,
      customMode: false,
      customKeySource: 'materials',
      customBuySide: 'ask',
      customSellSide: 'ask'
    },
    service,
    getDungeonName() {
      return '海盗基地';
    }
  };
  Feature.configure({TemplateRenderer, i18n});
  Feature.formView.renderCalculator(feature);

  // 默认勾选并透传计算选项；悬浮提示按 {0}/{1} 占位符接收由常量生成的百分比。
  assert.equal(rendered.input.applyMarketTax, true);
  assert.match(rendered.markup, /applyMarketTaxHint\(5\/18\)/);
  assert.match(rendered.markup, /\.checked=true/);
  assert.match(dungeonFeatureSource, /applyMarketTax: true/);
  // 百分比由公共税率常量动态生成，界面与帮助文案不硬编码税率数值。
  assert.match(dungeonFeatureSource, /Math\.round\(MARKET_TAX_RATE \* 100\)/);
  assert.match(dungeonFeatureSource, /Math\.round\(COWBELL_TAX_RATE \* 100\)/);
});

test('地下城成本表同时展示制作和购买钥匙的单位及每日成本', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({i18n: {locale: 'zh-CN', t: (key) => key}});
  const rows = Feature.view.getResultRows(
    {},
    {costScenarios: {materials: {ticketPrices: {ask: 10, bid: 8}, openingKeys: [
            {ask: 4, bid: 3}
          ], ticketCostConservative: 1332, ticketCostOptimistic: 1065.6, openingCostConservative: 532.8, openingCostOptimistic: 399.6, totalCostConservative: 1864.8, totalCostOptimistic: 1465.2, normalChestUnitProfitConservative: 10, normalChestUnitProfitOptimistic: 11, profitConservative: 135.2, profitOptimistic: 1534.8, profitPerRunConservative: 1.31, profitPerRunOptimistic: 14.92}, market: {ticketPrices: {ask: 12, bid: 9}, openingKeys: [
            {ask: 5, bid: 4}
          ], ticketCostConservative: 1598.4, ticketCostOptimistic: 1198.8, openingCostConservative: 666, openingCostOptimistic: 532.8, totalCostConservative: 2264.4, totalCostOptimistic: 1731.6, normalChestUnitProfitConservative: 8, normalChestUnitProfitOptimistic: 9, profitConservative: -264.4, profitOptimistic: 1268.4, profitPerRunConservative: -2.57, profitPerRunOptimistic: 12.33}}, customScenario: {keySource: 'market', buySide: 'bid', sellSide: 'ask', ticketPrice: 9, openingKeyPrice: 4, ticketCost: 1198.8, openingCost: 532.8, totalCost: 1731.6, normalChestUnitProfit: 9, profit: 1268.4, profitPerRun: 12.33}, dailyConsumablesCost: 0, ticketQuantity: 133.2, openingKeyQuantity: 133.2, normalQuantity: 133.2, normalRevenueConservative: 2000, normalRevenueOptimistic: 3000, normalChestOutputConservative: 2500, normalChestOutputOptimistic: 3500, refinementQuantity: 0}
  );
  const keys = Array.from(rows, (row) => row.key || row.label);

  assert.deepEqual(keys, [
    'materialCostBreakdown', 'ticketUnitPrice', 'keyUnitPrice', 'entryTicketDailyCost', 'chestOpeningDailyCost',
    'totalDailyCost', 'expectedChestOutputBreakdown', 'normalChestRevenue', 'normalChestDailyOutput', 'profitPerRun',
    'netProfit'
  ]);
  assert.equal(rows[0].priceDirection, 'buy');
  assert.equal(rows[6].priceDirection, 'sell');
  assert.equal(rows[1].quantity, null);
  assert.equal(rows[1].values.materials.conservative, 10);
  assert.equal(rows[1].values.materials.optimistic, 8);
  assert.equal(rows[1].values.market.conservative, 12);
  assert.equal(rows[1].values.market.optimistic, 9);
  assert.equal(rows[2].quantity, null);
  assert.equal(rows[2].values.materials.conservative, 4);
  assert.equal(rows[2].values.materials.optimistic, 3);
  assert.equal(rows[2].values.market.conservative, 5);
  assert.equal(rows[2].values.market.optimistic, 4);
  // 单个宝箱收益行是单箱值，不显示数量；每日产出行显示每日宝箱数量。
  assert.equal(rows[7].quantity, null);
  assert.equal(rows[7].values.materials.conservative, 10);
  assert.equal(rows[7].values.materials.optimistic, 11);
  assert.equal(rows[7].values.market.conservative, 8);
  assert.equal(rows[7].values.market.optimistic, 9);
  // 每日普通宝箱产出按税前报价展示，与收益和钥匙来源无关；自定义档位跟随卖出方向。
  assert.equal(rows[8].quantity, 133.2);
  assert.equal(rows[8].values.materials.conservative, 2500);
  assert.equal(rows[8].values.materials.optimistic, 3500);
  assert.equal(rows[8].values.market.conservative, 2500);
  assert.equal(rows[8].values.market.optimistic, 3500);
  assert.equal(rows[8].values.custom, 3500);
  assert.equal(rows[1].values.custom, 9);
  assert.equal(rows[2].values.custom, 4);
  assert.equal(rows[7].values.custom, 9);
  assert.equal(rows[9].values.custom, 12.33);
  assert.equal(rows[10].values.custom, 1268.4);
});

test('地下城数量和金额最多显示两位小数且不补尾随零', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({i18n: {locale: 'zh-CN'}});

  assert.equal(Feature.stateController.formatCount({}, 102.86), '102.86');
  assert.equal(Feature.stateController.formatCount({}, 1440 / 14), '102.86');
  assert.equal(Feature.stateController.formatCount({}, 43.956), '43.96');
  assert.equal(Feature.stateController.formatCount({}, 133.2), '133.2');
  assert.equal(Feature.stateController.formatCount({}, 1.3), '1.3');
  assert.equal(Feature.stateController.formatCount({}, 2), '2');
  assert.match(dungeonFeatureSource, /formatCompactNumber\(number, 2\)/);
});

test('地下城操作区按可用宽度自动换行且最后一行不拉伸', () => {
  assert.match(
    integratedCssSource,
    /\.mst-dungeon-toolbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(11rem, 100%\), 1fr\)\)[^}]*align-items:\s*end/s
  );
  assert.doesNotMatch(integratedCssSource, /\.mst-dungeon-toolbar\s*\{[^}]*auto-fit/s);
  assert.doesNotMatch(integratedCssSource, /\.mst-dungeon-field\s*\{[^}]*flex:\s*1 1/s);
  assert.match(integratedCssSource, /\.mst-dungeon-field\[hidden\][\s\S]*?display:\s*none/);
  assert.match(integratedCssSource, /\.mst-dungeon-toggle-field\s*\{[^}]*justify-content:\s*flex-end/s);
  assert.doesNotMatch(integratedCssSource, /\.mst-dungeon-toggle-field\s*\{[^}]*padding-bottom/s);
  assert.equal(integratedCssSource.match(/\.mst-dungeon-toolbar\s*\{/g)?.length, 1);
  assert.match(integratedCssSource, /\.mst-dungeon-summary\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(integratedCssSource, /\.mst-dungeon-summary-refinement\s*\{[^}]*repeat\(5, minmax\(0, 1fr\)\)/s);
  assert.match(dungeonFeatureSource, /cards\.push\(\{key: 'marketDataTime'/);
  assert.doesNotMatch(dungeonFeatureSource, /mst-dungeon-market-meta/);
  assert.match(dungeonFeatureSource, /class="mst-dungeon-guzzling-toggle"[^>]*>[\s\S]*?<input type="checkbox"/);
  assert.match(
    integratedCssSource,
    /\.mst-dungeon-guzzling-toggle\s*\{[^}]*width:\s*var\(--button-height-normal[^}]*border:\s*1px solid/s
  );
  assert.match(dungeonFeatureSource, /width: 'min\(38rem, calc\(100vw - 1rem\)\)'/);
  assert.match(dungeonFeatureSource, /mst-dungeon-table-custom/);
  assert.equal(dungeonFeatureSource.match(/TemplateRenderer\.html`<option/g)?.length, 4);
  assert.doesNotMatch(dungeonFeatureSource, /TemplateRenderer\.html`\s+<option/);
  assert.equal(dungeonFeatureSource.match(/<col class="mst-dungeon-col-value/g)?.length, 4);
  assert.match(integratedCssSource, /\.mst-dungeon-table\s*\{[^}]*min-width:\s*35rem/s);
  assert.match(integratedCssSource, /\.mst-dungeon-col-item\s*\{[^}]*width:\s*27%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-col-quantity\s*\{[^}]*width:\s*13%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-col-value\s*\{[^}]*width:\s*15%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-table-custom[^}]*\.mst-dungeon-col-value\s*\{[^}]*width:\s*20%/s);
  assert.match(integratedCssSource, /\.mst-dungeon-col-custom-spacer\s*\{[^}]*width:\s*0/s);
});

test('地下城只计算 1 日期望并展示每日净利润', () => {
  const calculatedInputs = [];
  let renderedResult = null;
  const TemplateRenderer = {
    html(strings, ...values) {
      return {strings, values};
    },
    render(view) {
      return view();
    }
  };
  class FakeService {
    getDungeons() {
      return [
        {hrid: '/actions/combat/chimerical_den'}, {hrid: '/actions/combat/pirate_cove'}
      ];
    }

    calculate(input) {
      calculatedInputs.push({...input});
      return {costScenarios: {}, missingPrices: []};
    }
  }
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({
    TemplateRenderer,
    DungeonProfitCalculatorService: FakeService,
    CharacterDataService: {getCharacterItems: () => [
        {itemHrid: '/items/guzzling_pouch', itemLocationHrid: '/item_locations/pouch', enhancementLevel: 5, count: 1}
      ]},
    DataHub: {getLocalizedGameName: (_group, hrid) => hrid},
    utils: {substrLastSlash: (value) => value.split('/').pop()},
    i18n: {t: (key) => key}
  });
  const feature = new Feature({});
  feature.root = {querySelector: () => ({})};
  feature.resetState();
  feature.renderResult = (result) => {
    renderedResult = result;
    return TemplateRenderer.html``;
  };

  feature.render();

  assert.equal(calculatedInputs.length, 1);
  assert.equal(calculatedInputs[0].actionHrid, '/actions/combat/chimerical_den');
  assert.equal(calculatedInputs[0].difficultyTier, 0);
  assert.equal(calculatedInputs[0].partySize, '5');
  assert.equal(calculatedInputs[0].clearMinutes, '30');
  assert.equal(calculatedInputs[0].dailyConsumablesCost, '');
  assert.equal(calculatedInputs[0].useArtisanTea, true);
  assert.equal(calculatedInputs[0].useGuzzlingPouch, true);
  assert.equal(calculatedInputs[0].guzzlingLevel, '5');
  assert.equal(calculatedInputs[0].excludeBackEquipmentValue, false);
  assert.equal(calculatedInputs[0].customMode, false);
  assert.equal(calculatedInputs[0].customKeySource, 'materials');
  assert.equal(calculatedInputs[0].customBuySide, 'ask');
  assert.equal(calculatedInputs[0].customSellSide, 'ask');
  assert.equal('costMode' in calculatedInputs[0], false);
  assert.equal('periodDays' in calculatedInputs[0], false);
  assert.deepEqual(renderedResult.costScenarios, {});
  assert.equal('periodDailyProfits' in renderedResult, false);
});

test('地下城从角色持有的多个暴饮之囊中选择最高强化等级', () => {
  let characterItems = [
    {
      itemHrid: '/items/guzzling_pouch',
      itemLocationHrid: '/item_locations/inventory',
      enhancementLevel: 12,
      count: 1
    }, {itemHrid: '/items/guzzling_pouch', itemLocationHrid: '/item_locations/pouch', enhancementLevel: 5, count: 1}, {
      itemHrid: '/items/guzzling_pouch',
      itemLocationHrid: '/item_locations/inventory',
      enhancementLevel: 15,
      count: 1
    }
  ];
  const Feature = vm.runInNewContext(
    `${readVmSource('src/common/constants.js', 'src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({CharacterDataService: {getCharacterItems: () => characterItems}});
  const feature = {service: {getDungeons: () => [
        {hrid: '/actions/combat/pirate_cove'}
      ]}};

  Feature.stateController.resetState(feature);
  assert.equal(feature.state.useArtisanTea, true);
  assert.equal(feature.state.useGuzzlingPouch, true);
  assert.equal(feature.state.guzzlingLevel, '15');

  characterItems = characterItems.slice(0, 1);
  Feature.stateController.resetState(feature);
  assert.equal(feature.state.useGuzzlingPouch, true);
  assert.equal(feature.state.guzzlingLevel, '12');

  characterItems = [
    {itemHrid: '/items/guzzling_pouch', itemLocationHrid: '/item_locations/market', enhancementLevel: 20, count: 1}
  ];
  Feature.stateController.resetState(feature);
  assert.equal(feature.state.useGuzzlingPouch, false);
  assert.equal(feature.state.guzzlingLevel, '0');
});

test('分析文档列明宝箱数量公式、递归开箱和门票规则', () => {
  assert.match(analysisSource, /普通宝箱.*1\.295/);
  assert.match(analysisSource, /T1.*1\.295 × 0\.33/);
  assert.match(analysisSource, /T2.*1\.295/);
  assert.match(analysisSource, /5 ÷ 队伍人数/);
  assert.match(analysisSource, /递归|期望掉落/);
  assert.match(analysisSource, /门票.*普通宝箱/);
  assert.doesNotMatch(analysisSource, /个人产量倍率|不受队伍人数/);
  assert.doesNotMatch(analysisSource, /## 5\. 历史利润/);
});

test('工具箱及中英文文档按计算流程排列装备提升和地下城收益', () => {
  const menuStart = source.search(/^\s*(?:export\s+)?class ToolkitMenuFeature \{/m);
  assert.ok(menuStart >= 0, '找不到工具箱菜单功能');
  const menuEndOffset = source.slice(menuStart).search(/^\s*export function installModules/m);
  assert.ok(menuEndOffset > 0, '找不到工具箱菜单功能结束位置');
  const menuSource = source.slice(menuStart, menuStart + menuEndOffset);
  const actionKeys = [
    ...menuSource.matchAll(/\{\s*key:\s*'([^']+)'/g)
  ].map((match) => match[1]);
  assert.deepEqual(actionKeys, [
    'userCharacterCard', 'abilityUpgradeCalculator', 'houseUpgradeCalculator', 'combatUpgradeCalculator', 'equipmentComparison',
    'dungeonProfitCalculator', 'combatSimAiwwb', 'switchCharacter'
  ]);

  [
    [
      '## 技能升级计算器', '## 房屋升级材料计算器', '## 战斗升级计算器', '## 装备提升计算器', '## 地下城收益计算器',
      '## 切换角色'
    ], [
      '## Ability Upgrade Calculator', '## House Upgrade Material Calculator', '## Combat Upgrade Calculator', '## Equipment Comparison', '## Dungeon Profit Calculator',
      '## Switch Character'
    ]
  ].forEach((headings) => {
    const positions = headings.map((heading) => usageSource.indexOf(heading));
    positions.forEach((position) => assert.ok(position >= 0));
    assert.deepEqual(
      positions,
      [
        ...positions
      ].sort((left, right) => left - right)
    );
  });
});
