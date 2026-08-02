'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const {readVmSource} = require('./helpers/source.js');

const MST_ROOT = path.resolve(__dirname, '..');
const REFERENCES_ROOT = path.join(MST_ROOT, 'references');
const CLIENT_DATA_PATH = path.join(REFERENCES_ROOT, 'game-data', 'init_client_data.json');
const CHARACTER_DATA_PATH = path.join(REFERENCES_ROOT, 'game-data', 'init_character_data.json');
const MARKET_DATA_PATH = path.join(REFERENCES_ROOT, 'external-tools', 'mwi-tool', 'resources', 'marketData.json');

const clientData = JSON.parse(fs.readFileSync(CLIENT_DATA_PATH, 'utf8'));
const characterData = JSON.parse(fs.readFileSync(CHARACTER_DATA_PATH, 'utf8'));
const marketPayload = JSON.parse(fs.readFileSync(MARKET_DATA_PATH, 'utf8'));

function buildActionNameIndex(actionDetailMap) {
  const index = new Map();
  Object.values(actionDetailMap || {}).forEach((action) => {
    if (action?.name && action?.hrid && !index.has(action.name)) index.set(action.name, action.hrid);
  });
  return index;
}

function createTemplateRenderer() {
  return {
    empty: '',
    raw(value) {
      return value || '';
    },
    html(strings, ...values) {
      return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
    }
  };
}

// 测试直接执行当前源码入口中的类，避免测试副本与实际代码逐渐偏离。
const DataHub = {
  clientData: {
    raw: clientData,
    indexes: {
      actionDetailMap: clientData.actionDetailMap,
      actionNameToHrid: buildActionNameIndex(clientData.actionDetailMap)
    }
  },
  initClientDataFromCache() {
    return true;
  }
};
function loadBuildScoreService() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/character-card/build-score.js')}
        class BuildScoreServiceWithDataHub extends BuildScoreService {
          constructor(marketService) {
            super({DataHub, i18n: {t(key) { return key; }}}, marketService);
          }
        }
        BuildScoreServiceWithDataHub;`,
    {DataHub}
  );
}

const BuildScoreService = loadBuildScoreService();

function loadBuildLoadoutCardData() {
  const context = {
    DataHub: {characterData: {raw: characterData, updatedAt: Date.now()}},
    i18n: {
      t(key) {
        return key;
      }
    },
    utils: {
      substrLastSlash(value) {
        return String(value).split('/').pop();
      }
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/modules/character-card/data.js')}
        const CardDataAdapter = createCharacterCardDataAdapter({DataHub, i18n, utils});
        CardDataAdapter.fromLoadout.bind(CardDataAdapter);`,
    context
  );
}

const buildLoadoutCardData = loadBuildLoadoutCardData();

function loadLifeCardHelpers() {
  const context = {
    i18n: {
      languageKey: 'zh',
      t(key) {
        return key;
      },
      pick(entry) {
        return entry?.zh ?? entry?.en ?? '';
      }
    },
    TemplateRenderer: createTemplateRenderer(),
    DataHub: {
      clientData: {raw: clientData},
      getLocalizedGameName(group, hrid) {
        const detailMap =
          group === 'skillNames' ? clientData.skillDetailMap : group === 'itemNames' ? clientData.itemDetailMap : null;
        return detailMap?.[hrid]?.name || hrid.split('/').pop().replace(/_/g, ' ');
      },
      getGameI18nResources() {
        return null;
      }
    },
    utils: {
      substrLastSlash(value) {
        return String(value).split('/').pop();
      },
      escapeHtml(value) {
        return String(value);
      }
    },
    state: {
      cardContentMode: 'all',
      customSkills: {selectedSkills: [], maxSkills: 5},
      buildScore: {sequence: 0, sources: new Map()},
      svgTool: {
        isLoaded: true,
        createSVGIcon(itemId, options = {}) {
          const hrid = String(itemId).startsWith('house_')
            ? `/house_rooms/${String(itemId).replace(/^house_/, '')}`
            : `/${options.type || 'items'}/${itemId}`;
          return `<svg data-hrid="${hrid}"></svg>`;
        },
        createFallbackIcon(itemId) {
          return `<svg data-hrid="${itemId}"></svg>`;
        },
        getChatIconsSpritePath() {
          return '';
        }
      }
    },
    buildScoreService: {
      calculate() {
        return Promise.resolve({total: 0, house: 0, ability: 0, equipment: 0});
      }
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/modules/character-card/data.js', 'src/modules/character-card/renderer.js')}
        const CardDataAdapter = createCharacterCardDataAdapter({DataHub, i18n, utils});
        const renderer = createCharacterCardRenderer({
            ctx: {DataHub, TemplateRenderer, buildScoreService, i18n, utils},
            state,
            CardDataAdapter,
            getEffectiveLayoutMode: () => 'desktop'
        });
        ({
            getLifeProfessionDefinitions: renderer.getLifeProfessionDefinitions,
            generateLifeToolsPanel: renderer.generateLifeToolsPanel,
            generateLifeProgressionPanel: renderer.generateLifeProgressionPanel
        });`,
    context
  );
}

const lifeCardHelpers = loadLifeCardHelpers();

// 优化前使用普通 Array 构造增广矩阵；保留为结果基准。
class LegacyBuildScoreService extends BuildScoreService {
  constructor(marketService) {
    super(marketService);
    this.enhancementStrategyCache = new Map();
  }

  _findBestEnhanceStrategyWithPhiMirror(itemHrid, enhancementLevel, data) {
    let best = this._findBestEnhanceStrategy(itemHrid, enhancementLevel, data);
    const mirrorCost = this._getItemMarketPrice('/items/philosophers_mirror');
    if (!best || mirrorCost <= 0 || enhancementLevel <= 3) return best;

    const refinedHrid = itemHrid;
    const isRefined = itemHrid.includes('_refined');
    const baseItemHrid = isRefined ? itemHrid.replace('_refined', '') : itemHrid;
    const lowerBest = {};
    for (let level = 9; level < enhancementLevel; level++) {
      lowerBest[level] = this._findBestEnhanceStrategy(baseItemHrid, level, data);
    }

    let refinedCost = 0;
    if (isRefined) {
      const itemName = data.itemDetailMap[refinedHrid]?.name;
      const actionHrid = this._getActionHridFromItemName(itemName, data.actionDetailMap);
      (data.actionDetailMap?.[actionHrid]?.inputItems || []).forEach((item) => {
        refinedCost += this._getItemMarketPrice(item.itemHrid) * Number(item.count || 0);
      });
    }

    const fibonacci = [
      0, 1, 1, 2, 3,
      5, 8, 13, 21, 34,
      55, 89, 144, 233, 377,
      610, 987, 1597, 2584, 4181
    ];
    for (let protectAt = 10; protectAt < enhancementLevel; protectAt++) {
      if (!lowerBest[protectAt] || !lowerBest[protectAt - 1]) continue;
      const baseCount = fibonacci[enhancementLevel - protectAt + 1];
      const inputCount = fibonacci[enhancementLevel - protectAt];
      if (baseCount == null || inputCount == null) continue;
      const protectCount = baseCount + inputCount - 1;
      const totalCost =
        baseCount * lowerBest[protectAt].totalCost +
        inputCount * lowerBest[protectAt - 1].totalCost +
        mirrorCost * protectCount +
        refinedCost;
      if (totalCost < best.totalCost) best = {totalCost};
    }
    return best;
  }

  _findBestEnhanceStrategy(itemHrid, enhancementLevel, data) {
    const cacheKey = [
      this.marketService.marketTimestamp || '', itemHrid, enhancementLevel
    ].join('::');
    const cached = this.enhancementStrategyCache.get(cacheKey);
    if (cached) return cached;
    let best = null;
    for (let protectAt = 2; protectAt <= enhancementLevel; protectAt++) {
      const simulation = this._calculateEnhancementExpectation(itemHrid, enhancementLevel, protectAt, data);
      const costs = this._getEnhancementCosts(itemHrid, data);
      const totalCost =
        costs.baseCost + costs.protectionCost * simulation.protectCount + costs.perActionCost * simulation.actions;
      if (!best || totalCost < best.totalCost) best = {totalCost};
    }
    if (best) this.enhancementStrategyCache.set(cacheKey, best);
    return best;
  }

  _invertMatrix(matrix) {
    const size = matrix.length;
    const augmented = matrix.map((row, index) => [
      ...row, ...Array.from({length: size}, (_, column) => (index === column ? 1 : 0))
    ]);
    for (let column = 0; column < size; column++) {
      let pivotRow = column;
      for (let row = column + 1; row < size; row++) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
      }
      if (Math.abs(augmented[pivotRow][column]) < 1e-12) throw new Error('Enhancement matrix is singular');
      [
        augmented[column], augmented[pivotRow]
      ] = [
        augmented[pivotRow], augmented[column]
      ];
      const pivot = augmented[column][column];
      for (let index = 0; index < size * 2; index++) augmented[column][index] /= pivot;
      for (let row = 0; row < size; row++) {
        if (row === column) continue;
        const factor = augmented[row][column];
        if (!factor) continue;
        for (let index = 0; index < size * 2; index++) {
          augmented[row][index] -= factor * augmented[column][index];
        }
      }
    }
    return augmented.map((row) => row.slice(size));
  }
}

function createMarketService({withoutPhiMirror = false} = {}) {
  return {
    marketData: marketPayload.marketData,
    marketTimestamp: marketPayload.timestamp,
    load() {
      return Promise.resolve(marketPayload);
    },
    getMarketRow(itemHrid, level = 0) {
      if (withoutPhiMirror && itemHrid === '/items/philosophers_mirror') return null;
      return this.marketData?.[itemHrid]?.[String(level)] || null;
    }
  };
}

const equippedItems = characterData.characterItems.filter(
  (item) => item.itemLocationHrid !== '/item_locations/inventory'
);

function createCardData(mode = 'actual') {
  const equipment = equippedItems.map((item) => ({
    ...item,
    enhancementLevel: mode === 'max' ? 20 : mode === 'plain' ? 0 : item.enhancementLevel
  }));
  const abilities = characterData.characterAbilities.map((ability) => ({
    abilityHrid: ability.abilityHrid,
    level: ability.level || 0,
    slotNumber: ability.slotNumber || 0
  }));
  return {
    player: {equipment, characterItems: equipment},
    abilities,
    characterHouseRoomMap: characterData.characterHouseRoomMap
  };
}

function assertSameScore(actual, expected, label) {
  for (const key of [
    'total', 'house', 'ability', 'equipment', 'equipmentHidden'
  ]) {
    assert.equal(actual[key], expected[key], `${label} 的 ${key} 与旧版不一致`);
  }
}

function findItemAtLevel(itemLevel) {
  const match = Object.entries(clientData.itemDetailMap).find(
    ([
      , detail
    ]) => detail.itemLevel === itemLevel
  );
  assert.ok(match, `缺少 itemLevel=${itemLevel} 的测试物品`);
  return match[0];
}

test('战斗配装名片使用当前穿戴的全部工具计算装备分', () => {
  const combatLoadout = Object.values(characterData.characterLoadoutMap).find(
    (loadout) => loadout.actionTypeHrid === '/action_types/combat'
  );
  assert.ok(combatLoadout, '测试角色缺少战斗配装');

  const cardData = buildLoadoutCardData(combatLoadout);
  const expectedTools = characterData.characterItems.filter((item) => item.itemLocationHrid.endsWith('_tool'));
  const actualTools = cardData.player.equipment.filter((item) => item.itemLocationHrid.endsWith('_tool'));

  assert.equal(expectedTools.length, 10, '测试角色应包含 10 个当前穿戴工具');
  assert.equal(actualTools.length, expectedTools.length);
  expectedTools.forEach((expected) => {
    const actual = actualTools.find((item) => item.itemLocationHrid === expected.itemLocationHrid);
    assert.ok(actual, `配装名片缺少工具位 ${expected.itemLocationHrid}`);
    assert.equal(actual.itemHrid, expected.itemHrid);
    assert.equal(actual.enhancementLevel, expected.enhancementLevel);
  });
});

test('生活名片按官方顺序分开展示 10 个工具位、生活等级和生活房屋', () => {
  const definitions = lifeCardHelpers.getLifeProfessionDefinitions();
  assert.equal(definitions.length, 10);
  assert.deepEqual(
    Array.from(definitions, (definition) => definition.skillHrid),
    [
      '/skills/milking', '/skills/foraging', '/skills/woodcutting', '/skills/cheesesmithing', '/skills/crafting',
      '/skills/tailoring', '/skills/cooking', '/skills/brewing', '/skills/alchemy', '/skills/enhancing'
    ]
  );
  definitions.forEach((definition) => {
    const skillID = definition.skillHrid.split('/').pop();
    assert.equal(definition.toolLocationHrid, `/item_locations/${skillID}_tool`);
  });

  const cardData = {
    characterSkills: characterData.characterSkills,
    characterHouseRoomMap: characterData.characterHouseRoomMap
  };
  const player = {
    equipment: characterData.characterItems.filter((item) => item.itemLocationHrid !== '/item_locations/inventory')
  };
  const toolsHTML = lifeCardHelpers.generateLifeToolsPanel(cardData, player);
  const toolsWithEmptySlotHTML = lifeCardHelpers.generateLifeToolsPanel(cardData, {
    equipment: player.equipment.filter((item) => item.itemLocationHrid !== '/item_locations/milking_tool')
  });
  const progressionHTML = lifeCardHelpers.generateLifeProgressionPanel(cardData, player);
  assert.equal((toolsHTML.match(/class="mst-life-tool-slot"/g) || []).length, 10);
  assert.match(toolsHTML, /Item_itemContainer__x7kH1/);
  assert.match(toolsHTML, /Item_item__2De2O/);
  assert.doesNotMatch(toolsHTML, /mst-life-tool-skill-level/);
  assert.doesNotMatch(toolsHTML, /Lv\.92/);
  assert.doesNotMatch(toolsWithEmptySlotHTML, /ItemSelector_empty__2GVYD/);
  assert.doesNotMatch(toolsWithEmptySlotHTML, /ItemSelector_emptySlot__1ns6h/);
  assert.match(toolsWithEmptySlotHTML, /Item_name__2C42x/);
  assert.match(toolsWithEmptySlotHTML, /opacity:0\.3/);
  assert.doesNotMatch(toolsWithEmptySlotHTML, />空</);
  assert.equal((progressionHTML.match(/class="mst-life-level-row"/g) || []).length, 10);
  assert.equal((progressionHTML.match(/class="mst-life-house-row"/g) || []).length, 10);
  assert.match(progressionHTML, /Lv\.92/);
  assert.match(progressionHTML, /\/house_rooms\/dairy_barn/);
});

test('生活配装名片使用配装工具并保留角色当前已配置技能', () => {
  const lifeLoadout = Object.values(characterData.characterLoadoutMap).find(
    (loadout) => loadout.actionTypeHrid !== '/action_types/combat'
  );
  assert.ok(lifeLoadout, '测试角色缺少生活配装');

  const cardData = buildLoadoutCardData(lifeLoadout);
  const expectedAbilities = characterData.characterAbilities
    .filter((ability) => ability.slotNumber > 0)
    .map((ability) => ability.abilityHrid)
    .sort();
  const actualAbilities = cardData.abilities
    .filter((ability) => ability.slotNumber > 0)
    .map((ability) => ability.abilityHrid)
    .sort();
  assert.deepEqual(Array.from(actualAbilities), expectedAbilities);

  Object.entries(lifeLoadout.wearableMap)
    .filter(
      ([
        location, hash
      ]) => location.endsWith('_tool') && hash
    )
    .forEach(
      ([
        location, hash
      ]) => {
        const storedItem = characterData.characterItems.find((item) => item.hash === hash);
        const hashParts = String(hash).split('::');
        const expectedItemHrid = storedItem?.itemHrid || hashParts.find((part) => part.startsWith('/items/'));
        const expectedEnhancementLevel = storedItem?.enhancementLevel || Number(hashParts.at(-1) || 0);
        const actual = cardData.player.equipment.find((item) => item.itemLocationHrid === location);
        assert.ok(actual, `生活配装名片缺少工具位 ${location}`);
        assert.equal(actual.itemHrid, expectedItemHrid);
        assert.equal(actual.enhancementLevel, expectedEnhancementLevel);
      }
    );
});

test('强化期望值在多物品等级、目标等级、保护等级和祝福茶设置下与旧版逐值一致', () => {
  const optimized = new BuildScoreService(createMarketService());
  const legacy = new LegacyBuildScoreService(createMarketService());
  const itemLevels = [
    1, 35, 60, 80, 90,
    95, 100
  ];
  const targetLevels = [
    2, 9, 12, 20
  ];

  for (const teaBlessed of [
    false, true
  ]) {
    optimized.inputDefaults.teaBlessed = teaBlessed;
    legacy.inputDefaults.teaBlessed = teaBlessed;
    for (const itemLevel of itemLevels) {
      const itemHrid = findItemAtLevel(itemLevel);
      for (const targetLevel of targetLevels) {
        const protectLevels = [
          ...new Set([
            2, Math.ceil(targetLevel / 2), targetLevel
          ])
        ];
        for (const protectAt of protectLevels) {
          const actual = optimized._calculateEnhancementExpectation(itemHrid, targetLevel, protectAt, clientData);
          const expected = legacy._calculateEnhancementExpectation(itemHrid, targetLevel, protectAt, clientData);
          assert.equal(actual.actions, expected.actions);
          assert.equal(actual.protectCount, expected.protectCount);
        }
      }
    }
  }
});

test('普通与精炼装备的强化策略和 Phi Mirror 分支与旧版一致', () => {
  const cases = [
    '/items/chrono_gloves', '/items/pathseeker_boots_refined'
  ];
  for (const withoutPhiMirror of [
    false, true
  ]) {
    const optimized = new BuildScoreService(createMarketService({withoutPhiMirror}));
    const legacy = new LegacyBuildScoreService(createMarketService({withoutPhiMirror}));
    for (const itemHrid of cases) {
      for (const targetLevel of [
        2, 9, 12, 20
      ]) {
        const actual = optimized._findBestEnhanceStrategyWithPhiMirror(itemHrid, targetLevel, clientData);
        const expected = legacy._findBestEnhanceStrategyWithPhiMirror(itemHrid, targetLevel, clientData);
        assert.equal(actual?.totalCost, expected?.totalCost);
        assert.equal(Math.round(actual?.totalCost || 0), Math.round(expected?.totalCost || 0));
      }
    }
  }
});

test('同 itemLevel 的不同装备共用强化期望缓存，不缓存单件装备策略', () => {
  const service = new BuildScoreService(createMarketService());
  const sameLevelItems = Object.entries(clientData.itemDetailMap)
    .filter(
      ([
        , detail
      ]) => detail.itemLevel === 80
    )
    .slice(0, 2)
    .map(
      ([
        hrid
      ]) => hrid
    );
  assert.equal(sameLevelItems.length, 2);

  let inversionCount = 0;
  const invertMatrix = service._invertMatrix.bind(service);
  service._invertMatrix = (matrix) => {
    inversionCount++;
    return invertMatrix(matrix);
  };

  const first = service._calculateEnhancementExpectation(sameLevelItems[0], 20, 12, clientData);
  const second = service._calculateEnhancementExpectation(sameLevelItems[1], 20, 12, clientData);
  assert.strictEqual(second, first, '相同强化参数应复用同一个期望结果');
  assert.equal(inversionCount, 1);
  assert.equal(service.enhancementExpectationCache.size, 1);
  assert.equal('enhancementStrategyCache' in service, false, '不应保留按装备缓存的策略结果');

  service._calculateEnhancementExpectation(sameLevelItems[1], 20, 13, clientData);
  assert.equal(inversionCount, 2, '保护等级改变后应重新计算');
});

test('一次强化策略只计算一次装备成本', () => {
  const service = new BuildScoreService(createMarketService());
  let costCount = 0;
  const getEnhancementCosts = service._getEnhancementCosts.bind(service);
  service._getEnhancementCosts = (...args) => {
    costCount++;
    return getEnhancementCosts(...args);
  };

  service._findBestEnhanceStrategyWithPhiMirror('/items/chrono_gloves', 20, clientData);
  assert.equal(costCount, 1, '普通装备应在整轮 Phi Mirror 策略中共用一份成本');

  costCount = 0;
  service._findBestEnhanceStrategyWithPhiMirror('/items/pathseeker_boots_refined', 20, clientData);
  assert.equal(costCount, 2, '精炼装备只应分别计算精炼本体和基础装备成本');
});

test('隐藏装备、无强化和真实混装的完整战力分与旧版一致', async () => {
  for (const mode of [
    'plain', 'actual'
  ]) {
    const cardData = createCardData(mode);
    const optimized = await new BuildScoreService(createMarketService()).calculate(cardData);
    const legacy = await new LegacyBuildScoreService(createMarketService()).calculate(cardData);
    assertSameScore(optimized, legacy, mode);
  }

  const hiddenCard = {...createCardData('actual'), hideWearableItems: true};
  const optimizedHidden = await new BuildScoreService(createMarketService()).calculate(hiddenCard);
  const legacyHidden = await new LegacyBuildScoreService(createMarketService()).calculate(hiddenCard);
  assertSameScore(optimizedHidden, legacyHidden, 'hidden');
});

test('测试服角色全身 +20 冷缓存计算结果不变且低于 0.2 秒', async (t) => {
  const itemHrid = findItemAtLevel(80);
  new BuildScoreService(createMarketService())._calculateEnhancementExpectation(itemHrid, 2, 2, clientData);
  new LegacyBuildScoreService(createMarketService())._calculateEnhancementExpectation(itemHrid, 2, 2, clientData);

  const cardData = createCardData('max');
  const legacyService = new LegacyBuildScoreService(createMarketService());
  const legacyStart = performance.now();
  const legacyScore = await legacyService.calculate(cardData);
  const legacyElapsed = performance.now() - legacyStart;

  const optimizedService = new BuildScoreService(createMarketService());
  const optimizedStart = performance.now();
  const optimizedScore = await optimizedService.calculate(cardData);
  const optimizedElapsed = performance.now() - optimizedStart;

  assertSameScore(optimizedScore, legacyScore, 'all +20');
  t.diagnostic(`旧数组基准 ${legacyElapsed.toFixed(2)}ms，优化版冷缓存 ${optimizedElapsed.toFixed(2)}ms`);
  assert.ok(optimizedElapsed < 200, `全身 +20 冷缓存耗时 ${optimizedElapsed.toFixed(2)}ms，超过 200ms`);
});
