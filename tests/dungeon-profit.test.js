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

function createMarketService(data = {}) {
  return {
    marketData: data,
    getMarketRow(itemHrid, level = 0) {
      return this.marketData?.[itemHrid]?.[String(level)] || null;
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
    `${readVmSource('src/modules/dungeon-profit/index.js')}
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
  assert.equal(service.getDirectPrice('/items/cowbell', 'bid', true), 78.4);
  assert.equal(service.getDirectPrice('/items/chimerical_quiver', 'ask'), 5000);
  assert.equal(service.getDirectPrice('/items/enchanted_cloak', 'bid'), 4000);
});

test('四个地下城使用相同的 T0-T2 固定宝箱期望', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const expectedRefinement = [
    0, 0.43, 1.3
  ];

  service.getDungeons().forEach((dungeon) => {
    expectedRefinement.forEach((refinementQuantity, difficultyTier) => {
      const result = service.calculate({actionHrid: dungeon.hrid, difficultyTier, clearMinutes: 1440});
      assert.equal(result.clears, 1);
      assert.equal(result.normalQuantity, 1.3);
      assert.equal(result.refinementQuantity, refinementQuantity);
      assert.equal(result.ticketQuantity, 1.3);
    });
  });
});

test('每日轮次和 T0-T2 每日宝箱期望均保留两位小数', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', clearMinutes: 14};
  const t0 = service.calculate({...input, difficultyTier: 0});
  const t1 = service.calculate({...input, difficultyTier: 1});
  const t2 = service.calculate({...input, difficultyTier: 2});

  assert.equal(t0.clears, 102.86);
  assert.equal(t0.normalQuantity, 133.2);
  assert.equal(t0.refinementQuantity, 0);
  assert.equal(t1.refinementQuantity, 43.96);
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

test('两种卖出总价对所有可交易物品统一扣除 2% 市场税', () => {
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
  const untaxed = service.valueExpectedDrops(drops, service.getTokenValues(false), false, new Set());
  const taxed = service.valueExpectedDrops(drops, service.getTokenValues(true), true, new Set());

  assert.equal(untaxed.bidTotal, 200);
  assert.equal(untaxed.askTotal, 220);
  assert.equal(taxed.bidTotal, 196);
  assert.equal(taxed.askTotal, 215);
});

test('交易税倍率只通过公共常量使用', () => {
  const constantsSource = readSourceFile('src', 'common', 'constants.js');
  const calculatorSource = readSourceFile('src', 'modules', 'dungeon-profit', 'calculator.js');

  assert.match(constantsSource, /MARKET_TAX_RATE\s*=\s*0\.02/);
  assert.match(constantsSource, /MARKET_TAX_MULTIPLIER\s*=\s*1 - MARKET_TAX_RATE/);
  assert.match(calculatorSource, /MARKET_TAX_MULTIPLIER/);
  assert.doesNotMatch(calculatorSource, /\b0\.98\b/);
});

test('市场单侧缺价时按参考实现回退，避免宝箱产出误算为零', () => {
  const Service = loadService({actionDetailMap: {}, itemDetailMap: {}, openableLootDropMap: {}}, {});
  const service = new Service(
    createMarketService({'/items/bid_only': {0: {a: -1, b: 98}}, '/items/recent_only': {0: {a: -1, b: -1, p: 75}}})
  );

  assert.equal(service.getDirectPrice('/items/bid_only', 'ask'), 100);
  assert.equal(service.getDirectPrice('/items/bid_only', 'bid'), 98);
  assert.equal(service.getDirectPrice('/items/recent_only', 'ask'), 75);
  assert.equal(service.getDirectPrice('/items/recent_only', 'bid', true), 73);
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

test('队伍人数、战斗掉落 Buff 和旧统计周期参数不影响固定宝箱期望', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const input = {actionHrid: '/actions/combat/pirate_cove', difficultyTier: 1, clearMinutes: 14};
  const result = service.calculate(input);
  const legacyInput = service.calculate({...input, partySize: 1, dropQuantity: 10, dropRate: 10, periodDays: 14});

  assert.equal(legacyInput.clears, result.clears);
  assert.equal(legacyInput.normalQuantity, result.normalQuantity);
  assert.equal(legacyInput.refinementQuantity, result.refinementQuantity);
  assert.equal(legacyInput.ticketQuantity, result.ticketQuantity);
});

test('门票数量始终等于保留两位小数后的普通宝箱期望', () => {
  const Service = loadService();
  const service = new Service(createMarketService(createCompleteMarketData()));
  const result = service.calculate({actionHrid: '/actions/combat/pirate_cove', difficultyTier: 2, clearMinutes: 14});

  assert.equal(result.ticketQuantityPerRun, 1.3);
  assert.equal(result.ticketQuantity, 133.2);
  assert.equal(result.ticketQuantity, result.normalQuantity);
  assert.equal(result.openingKeyQuantityPerRun, 2.6);
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

  assert.equal(result.totalChestQuantity, 1.3);
  assert.equal(result.expectedDrops[0].quantity, 2.6);
  assert.ok(Math.abs(result.totalRevenueConservative - 202.8) < 1e-12);
  assert.ok(Math.abs(result.totalRevenueOptimistic - 254.8) < 1e-12);
  assert.ok(Math.abs(market.totalCostConservative - 18.2) < 1e-12);
  assert.ok(Math.abs(market.totalCostOptimistic - 14.3) < 1e-12);
  assert.ok(Math.abs(market.profitConservative - 184.6) < 1e-12);
  assert.ok(Math.abs(market.profitOptimistic - 240.5) < 1e-12);
  assert.ok(Math.abs(market.normalChestUnitProfitConservative - 142) < 1e-12);
  assert.ok(Math.abs(market.normalChestUnitProfitOptimistic - 185) < 1e-12);
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
      unitProfit: 182,
      profit: 236.6
    }, {buySide: 'ask', sellSide: 'bid', ticketPrice: 10, openingKeyPrice: 4, unitProfit: 142, profit: 184.6}, {
      buySide: 'bid',
      sellSide: 'ask',
      ticketPrice: 8,
      openingKeyPrice: 3,
      unitProfit: 185,
      profit: 240.5
    }, {buySide: 'bid', sellSide: 'bid', ticketPrice: 8, openingKeyPrice: 3, unitProfit: 145, profit: 188.5}
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

  assert.equal(market.normalOpeningCostConservative, 5.2);
  assert.equal(market.refinementOpeningCostConservative, 5.2);
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
  assert.ok(Math.abs(market.profitConservative - 366.6) < 1e-12);
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
  assert.doesNotMatch(dungeonFeatureSource, /partySize|combatDropQuantity|combatDropRate|periodDays|applyMarketTax/);
});

test('地下城操作区保留基础参数并按需展示自定义价格参数', () => {
  const keys = [
    'dungeon', 'difficultyTier', 'clearTimeMinutes', 'dailyConsumablesCost', 'artisanTea',
    'guzzlingLevel', 'customMode', 'keySource', 'keyMaterialPurchaseMethod', 'goodsSaleMethod'
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
  assert.match(dungeonMessagesSource, /normalChestRevenue: \{zh: '单个普通宝箱税后收益'/);
  assert.doesNotMatch(dungeonMessagesSource, /(?:conservative|optimistic): \{zh: '[^']*(?:Bid|Ask)/);
});

test('地下城成本和产出分区列头只显示各自相关的价格方向', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/modules/dungeon-profit/index.js')}
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

test('地下城成本表同时展示制作和购买钥匙的单位及每日成本', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({i18n: {locale: 'zh-CN', t: (key) => key}});
  const rows = Feature.view.getResultRows(
    {},
    {costScenarios: {materials: {ticketPrices: {ask: 10, bid: 8}, openingKeys: [
            {ask: 4, bid: 3}
          ], ticketCostConservative: 1332, ticketCostOptimistic: 1065.6, openingCostConservative: 532.8, openingCostOptimistic: 399.6, totalCostConservative: 1864.8, totalCostOptimistic: 1465.2, normalChestUnitProfitConservative: 10, normalChestUnitProfitOptimistic: 11, profitConservative: 135.2, profitOptimistic: 1534.8, profitPerRunConservative: 1.31, profitPerRunOptimistic: 14.92}, market: {ticketPrices: {ask: 12, bid: 9}, openingKeys: [
            {ask: 5, bid: 4}
          ], ticketCostConservative: 1598.4, ticketCostOptimistic: 1198.8, openingCostConservative: 666, openingCostOptimistic: 532.8, totalCostConservative: 2264.4, totalCostOptimistic: 1731.6, normalChestUnitProfitConservative: 8, normalChestUnitProfitOptimistic: 9, profitConservative: -264.4, profitOptimistic: 1268.4, profitPerRunConservative: -2.57, profitPerRunOptimistic: 12.33}}, customScenario: {keySource: 'market', buySide: 'bid', sellSide: 'ask', ticketPrice: 9, openingKeyPrice: 4, ticketCost: 1198.8, openingCost: 532.8, totalCost: 1731.6, normalChestUnitProfit: 9, profit: 1268.4, profitPerRun: 12.33}, dailyConsumablesCost: 0, ticketQuantity: 133.2, openingKeyQuantity: 133.2, normalQuantity: 133.2, normalRevenueConservative: 2000, normalRevenueOptimistic: 3000, refinementQuantity: 0}
  );
  const keys = Array.from(rows, (row) => row.key || row.label);

  assert.deepEqual(keys, [
    'materialCostBreakdown', 'ticketUnitPrice', 'keyUnitPrice', 'entryTicketDailyCost', 'chestOpeningDailyCost',
    'totalDailyCost', 'expectedChestOutputBreakdown', 'normalChestRevenue', 'profitPerRun', 'netProfit'
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
  assert.equal(rows[7].quantity, 133.2);
  assert.equal(rows[7].values.materials.conservative, 10);
  assert.equal(rows[7].values.materials.optimistic, 11);
  assert.equal(rows[7].values.market.conservative, 8);
  assert.equal(rows[7].values.market.optimistic, 9);
  assert.equal(rows[1].values.custom, 9);
  assert.equal(rows[2].values.custom, 4);
  assert.equal(rows[7].values.custom, 9);
  assert.equal(rows[8].values.custom, 12.33);
  assert.equal(rows[9].values.custom, 1268.4);
});

test('地下城数量和金额最多显示两位小数且不补尾随零', () => {
  const Feature = vm.runInNewContext(
    `${readVmSource('src/modules/dungeon-profit/index.js')}
        DungeonProfitCalculatorFeature;`
  );
  Feature.configure({i18n: {locale: 'zh-CN'}});

  assert.equal(Feature.stateController.formatCount({}, 102.86), '102.86');
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
  assert.equal(dungeonFeatureSource.match(/TemplateRenderer\.html`<option/g)?.length, 3);
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
    `${readVmSource('src/modules/dungeon-profit/index.js')}
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
  assert.equal(calculatedInputs[0].clearMinutes, '30');
  assert.equal(calculatedInputs[0].dailyConsumablesCost, '');
  assert.equal(calculatedInputs[0].useArtisanTea, true);
  assert.equal(calculatedInputs[0].useGuzzlingPouch, true);
  assert.equal(calculatedInputs[0].guzzlingLevel, '5');
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
    `${readVmSource('src/modules/dungeon-profit/index.js')}
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

test('分析文档列明固定宝箱、递归开箱和门票规则', () => {
  assert.match(analysisSource, /普通宝箱.*1\.295/);
  assert.match(analysisSource, /T1.*1\.295 × 0\.33/);
  assert.match(analysisSource, /T2.*1\.295/);
  assert.match(analysisSource, /递归|期望掉落/);
  assert.match(analysisSource, /门票.*普通宝箱/);
  assert.doesNotMatch(analysisSource, /个人产量倍率|队伍人数.*宝箱期望/);
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
    'dungeonProfitCalculator', 'switchCharacter'
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
