'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
    `${readVmSource(
      'src/modules/character-card/build-score/legacy.js',
      'src/modules/character-card/build-score/v26.js',
      'src/modules/character-card/build-score/index.js'
    )}
        class BuildScoreServiceWithDataHub extends BuildScoreService {
          constructor(marketService) {
            super(
              {
                DataHub,
                i18n: {t(key) { return key; }},
                utils: {
                  substrLastSlash(value) {
                    return String(value).split('/').pop();
                  }
                }
              },
              marketService
            );
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

function createMarketService({withoutPhiMirror = false} = {}, marketValues = {}) {
  return {
    marketData: marketPayload.marketData,
    marketTimestamp: marketPayload.timestamp,
    load() {
      return Promise.resolve(marketPayload);
    },
    getMarketRow(itemHrid, level = 0) {
      if (withoutPhiMirror && itemHrid === '/items/philosophers_mirror') return null;
      return this.marketData?.[itemHrid]?.[String(level)] || null;
    },
    getMarketValue(itemHrid, level = 0) {
      const value = Number(marketValues?.[itemHrid]?.[level] ?? marketValues?.[itemHrid]?.[String(level)] ?? 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
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

function assertScoreStructure(score, label) {
  // 新版着装评分按 MWITools 口径返回战斗/生活两套分。
  assert.equal(typeof score.battle.total, 'number', label + ' 缺少 battle.total');
  assert.equal(typeof score.battle.house, 'number', label + ' 缺少 battle.house');
  assert.equal(typeof score.battle.abilities, 'number', label + ' 缺少 battle.abilities');
  assert.equal(typeof score.battle.equipment, 'number', label + ' 缺少 battle.equipment');
  assert.equal(typeof score.skilling.total, 'number', label + ' 缺少 skilling.total');
  assert.equal(typeof score.skilling.house, 'number', label + ' 缺少 skilling.house');
  assert.equal(typeof score.skilling.tools, 'number', label + ' 缺少 skilling.tools');
  assert.equal(typeof score.skilling.equipment, 'number', label + ' 缺少 skilling.equipment');
  assert.equal(score.newVersion, true, label + ' 应标记新版算法');
  const battleShrine = Number.isFinite(score.battle.shrine) ? score.battle.shrine : 0;
  const skillingShrine = Number.isFinite(score.skilling.shrine) ? score.skilling.shrine : 0;
  assert.ok(
    Math.abs(
      score.battle.total - (score.battle.house + score.battle.abilities + score.battle.equipment + battleShrine)
    ) < 1e-9,
    label + ' 战斗总分不等于分项之和'
  );
  assert.ok(
    Math.abs(
      score.skilling.total - (score.skilling.house + score.skilling.tools + score.skilling.equipment + skillingShrine)
    ) < 1e-9,
    label + ' 生活总分不等于分项之和'
  );
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

test('新旧版战力分可切换且新版按 MWITools 口径返回战斗/生活两套分', async () => {
  for (const mode of [
    'plain', 'actual'
  ]) {
    const cardData = createCardData(mode);
    const service = new BuildScoreService(createMarketService());
    const score = await service.calculate(cardData, true);
    assertScoreStructure(score, mode);
    assert.equal(score.equipmentHidden, false, mode + ' 不应隐藏装备');
    assert.ok(score.battle.total > 0, mode + ' 战斗总分应大于 0');
    assert.ok(score.skilling.total > 0, mode + ' 生活总分应大于 0');
    const legacy = await service.calculate(cardData, false);
    assert.equal(legacy.newVersion, false, mode + ' 旧版不应标记新版');
    assert.equal(typeof legacy.total, 'number', mode + ' 旧版缺少 total');
  }

  const hiddenCard = {...createCardData('actual'), hideWearableItems: true};
  const hidden = await new BuildScoreService(createMarketService()).calculate(hiddenCard, true);
  assertScoreStructure(hidden, 'hidden');
  assert.equal(hidden.equipmentHidden, true, '隐藏装备应标记 equipmentHidden');
  // 与 v26 getBuildScoreByProfile 一致：装备隐藏时技能分与装备分归零，房屋与神龛仍计入。
  assert.equal(hidden.battle.equipment, 0, '隐藏装备时战斗装备分为 0');
  assert.equal(hidden.skilling.tools, 0, '隐藏装备时生活工具分为 0');
  assert.equal(hidden.skilling.equipment, 0, '隐藏装备时生活装备分为 0');
  assert.equal(hidden.battle.abilities, 0, '隐藏装备时技能分应为 0');
  assert.equal(hidden.skilling.available, false, '隐藏装备时生活分不可用');
  const hiddenBattleShrine = Number.isFinite(hidden.battle.shrine) ? hidden.battle.shrine : 0;
  assert.ok(
    Math.abs(hidden.battle.total - (hidden.battle.house + hiddenBattleShrine)) < 1e-9,
    '隐藏装备时战斗总分应等于房屋加神龛'
  );
});

test('公平价值按 MWITools 口径：官方市场价值优先，其次左右报价平均', () => {
  const service = new BuildScoreService(createMarketService({}, {'/items/acrobatic_hood': {0: 888888}}));
  // 官方市场价值优先
  assert.equal(service._fairValue('/items/acrobatic_hood'), 888888);
  // 无官方价值时取左右报价平均
  assert.equal(service._fairValue('/items/abyssal_essence'), (220 + 215) / 2);
  assert.equal(service._fairValue('/items/coin'), 1);
});

test('装备按工具/战斗/生活分类分别计入战力分', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  const toolItem = {
    itemHrid: '/items/abyssal_essence',
    itemLocationHrid: '/item_locations/foraging_tool',
    enhancementLevel: 0,
    count: 1
  };
  const combatItem = {
    itemHrid: '/items/acrobatic_hood',
    itemLocationHrid: '/item_locations/head',
    enhancementLevel: 0,
    count: 1
  };
  const skillingItem = {
    itemHrid: '/items/advanced_alchemy_charm',
    itemLocationHrid: '/item_locations/necklace',
    enhancementLevel: 0,
    count: 1
  };

  const toolClass = service._classifyEquippedItem(toolItem, clientData);
  const combatClass = service._classifyEquippedItem(combatItem, clientData);
  const skillingClass = service._classifyEquippedItem(skillingItem, clientData);

  assert.equal(toolClass.isTool, true);
  assert.equal(toolClass.isCombat, false);
  assert.equal(toolClass.isSkilling, true);
  assert.equal(combatClass.isCombat, true);
  assert.equal(combatClass.isTool, false);
  assert.equal(skillingClass.isSkilling, true);
  assert.equal(skillingClass.isCombat, false);

  const gearScores = service._calculateGearScores(
    {
      player: {equipment: [
          toolItem, combatItem, skillingItem
        ], characterItems: [
          toolItem, combatItem, skillingItem
        ]}
    },
    clientData
  );
  assert.ok(gearScores.combatEquipment > 0, '战斗装备应计入战斗装备分');
  assert.ok(gearScores.skillingTools > 0, '工具应计入生活工具分');
  assert.ok(gearScores.skillingEquipment > 0, '生活装备应计入生活装备分');
  // 库存位置物品不参与战力分
  const inventoryItem = {...combatItem, itemLocationHrid: '/item_locations/inventory'};
  const inventoryScores = service._calculateGearScores(
    {player: {equipment: [
          inventoryItem
        ]}},
    clientData
  );
  assert.equal(inventoryScores.combatEquipment, 0, '库存物品不计入战力分');
});

test('房屋按战斗/生活可用类型分类计入战力分', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  const houseScores = service._calculateHouseScores(
    {characterHouseRoomMap: {'/house_rooms/archery_range': 1, '/house_rooms/brewery': 1}},
    clientData
  );
  assert.ok(houseScores.combat > 0, '战斗房屋应计入战斗房屋分');
  assert.ok(houseScores.skilling > 0, '生活房屋应计入生活房屋分');
  assert.ok(Math.abs(houseScores.all - (houseScores.combat + houseScores.skilling)) < 1e-9, '总房屋分等于战斗加生活');
});

test('强化装备估值按 MWITools v26 口径：与公平价值偏差不超过 20% 时用公平价值，否则用强化计划成本', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  const boots = {
    itemHrid: '/items/pathseeker_boots_refined',
    itemLocationHrid: '/item_locations/feet',
    enhancementLevel: 12,
    count: 1
  };
  // +12 真实数据：公平价值 2.725B（左 2.75B / 右 2.7B 平均），v26 强化计划成本约 1.518B，偏差大于 20% → 取强化成本。
  const fairValue = service._fairValue(boots.itemHrid, 12);
  assert.equal(fairValue, (2750000000 + 2700000000) / 2);
  const plan = service._calculateV26EnhancementPlan(boots.itemHrid, 12, clientData, {});
  assert.equal(plan.status, 'complete');
  const enhancementCost = plan.totalCost;
  const deviation = Math.abs(fairValue - enhancementCost) / enhancementCost;
  assert.ok(deviation > 0.2, '该装备偏差应大于 20%');
  assert.equal(service._getItemValue(boots, clientData), enhancementCost);

  // 官方市场价值与强化成本一致时偏差为 0 ≤ 20% → 用公平价值（官方市场价值）。
  const marketValueService = new BuildScoreService(
    createMarketService({}, {'/items/pathseeker_boots_refined': {12: enhancementCost}})
  );
  assert.equal(marketValueService._getItemValue(boots, clientData), enhancementCost);

  // 未强化装备不参与强化成本估值，直接按公平价值。
  const plainBoots = {...boots, enhancementLevel: 0};
  assert.equal(service._getItemValue(plainBoots, clientData), service._fairValue(boots.itemHrid, 0));
});

test('强化成功率表与官方数据一致（防止硬编码漂移）', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  const official = clientData.enhancementLevelSuccessRateTable;
  assert.ok(Array.isArray(official) && official.length > 0, '官方成功率表应存在');
  assert.equal(service.enhancementSuccessRates.length, official.length, '成功率表长度应一致');
  service.enhancementSuccessRates.forEach((rate, index) => {
    assert.equal(rate, Math.round(official[index] * 100), `第 ${index} 级成功率不一致`);
  });
});

test('背部装备（披风）强化估值与 MWITools v26.4.14 一致：强制保护之镜且允许贤者之镜', () => {
  // 真实市场无披风报价，用官方市场价值构造有价场景验证逻辑（0 级提供底子价、12 级提供强化价）。
  const capeMarket = {'/items/enchanted_cloak': {0: 50000000, 12: 3000000000}};
  const withPhiMirror = new BuildScoreService(createMarketService({}, capeMarket));
  const withoutPhiMirror = new BuildScoreService(createMarketService({withoutPhiMirror: true}, capeMarket));
  const cape = {
    itemHrid: '/items/enchanted_cloak',
    itemLocationHrid: '/item_locations/back',
    enhancementLevel: 12,
    count: 1
  };
  const withValue = withPhiMirror._getItemValue(cape, clientData);
  const withoutValue = withoutPhiMirror._getItemValue(cape, clientData);
  // 与 v26.4.14 getEnhancedEquipmentCost 一致：背部装备 allowPhilosopherMirror: true，
  // 有贤者之镜价格时可采用更便宜的贤者之镜方案，估值随镜价变化。
  assert.ok(withValue > 0 && withoutValue > 0, '有市场价值时披风估值应大于 0');
  assert.ok(withValue < withoutValue, '有镜价时应能采用更便宜的贤者之镜方案');
  // 无镜价时贤者之镜方案不可用，估值与禁用等价。
  assert.equal(withoutPhiMirror._getItemValue(cape, clientData), withoutValue);
  // 背部装备计划强制使用保护之镜（forcedProtectionItemHrid），仍可完成。
  const plan = withPhiMirror._calculateV26EnhancementPlan(cape.itemHrid, 12, clientData, {
    forcedProtectionItemHrid: '/items/mirror_of_protection',
    allowPhilosopherMirror: true
  });
  assert.equal(plan.status, 'complete');
  assert.ok(plan.totalCost > 0, '披风强化计划成本应大于 0');
  // 无市场价的披风与 v26 acquisitionCostValue 一致：底子按制作/精炼获取成本链估值，
  // 强化计划仍可完成，估值大于 0。
  const noPriceCape = new BuildScoreService(createMarketService({}, {}));
  assert.ok(noPriceCape._getItemValue(cape, clientData) > 0, '无市场价时披风应按获取成本链估值');
  const noPricePlan = noPriceCape._calculateV26EnhancementPlan(cape.itemHrid, 12, clientData, {
    forcedProtectionItemHrid: '/items/mirror_of_protection',
    allowPhilosopherMirror: true
  });
  assert.equal(noPricePlan.status, 'complete');
  // 背部装备识别：位置、命名与装备详情任一命中。
  assert.equal(withPhiMirror._isBackEquipment('/items/enchanted_cloak', '/item_locations/back', clientData), true);
  assert.equal(withPhiMirror._isBackEquipment('/items/sinister_cape_refined', '', clientData), true);
  assert.equal(
    withPhiMirror._isBackEquipment('/items/pathseeker_boots_refined', '/item_locations/feet', clientData),
    false
  );
});

test('战力打造分（旧版）保持 v2.7.20 算法：强化等级大于 1 按强化成本、否则按市场价加权', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  const enhanced = {
    itemHrid: '/items/pathseeker_boots_refined',
    itemLocationHrid: '/item_locations/feet',
    enhancementLevel: 12,
    count: 1
  };
  const plain = {
    itemHrid: '/items/pathseeker_boots_refined',
    itemLocationHrid: '/item_locations/feet',
    enhancementLevel: 0,
    count: 1
  };
  const enhancedScore = service._calculateEquipmentScore(
    {player: {equipment: [
          enhanced
        ]}},
    clientData
  );
  const best = service._findBestEnhanceStrategyWithPhiMirror(enhanced.itemHrid, 12, clientData);
  assert.equal(enhancedScore, Math.round(best.totalCost) / 1_000_000, '旧版强化装备应按强化成本估值');
  const plainScore = service._calculateEquipmentScore(
    {player: {equipment: [
          plain
        ]}},
    clientData
  );
  assert.equal(plainScore, (300000000 * 0.5) / 1_000_000, '旧版未强化装备应按市场价 0.5/0.5 加权');
});

test('旧版战力分市场单侧缺价（报价填 0 或 -1）时不漏算有效报价', () => {
  const service = new BuildScoreService(createMarketService({}, {}));
  // 0 与 -1 都按缺价处理：单侧有效时直接取该侧，不再把有效报价按比例打折成 0。
  service.marketService.marketData = {
    '/items/test_ask_missing': {0: {a: 0, b: 100}},
    '/items/test_bid_missing': {0: {a: 60, b: -1}},
    '/items/test_both_valid': {0: {a: 80, b: 40}},
    '/items/test_both_missing': {0: {a: 0, b: -1}}
  };
  assert.equal(service._getItemMarketPrice('/items/test_ask_missing'), 100);
  assert.equal(service._getItemMarketPrice('/items/test_bid_missing'), 60);
  assert.equal(service._getItemMarketPrice('/items/test_both_valid'), 80);
  assert.equal(service._getItemMarketPrice('/items/test_both_missing'), 0);
  // 加权取值同样把 0 当缺价：单侧有效时按该侧完整计价，不再打五折。
  assert.equal(service._getWeightedMarketPrice('/items/test_ask_missing', 0.5), 100);
  assert.equal(service._getWeightedMarketPrice('/items/test_both_valid', 0.5), 60);
});

test('公会神龛分与 MWITools v26.4.14 对齐：代币与信用按完整转换链估值，数据缺失时为 null', async () => {
  const baseCard = createCardData('plain');
  const guildBuffs = characterData.characterGuildBuffMap;
  assert.ok(guildBuffs && Object.keys(guildBuffs).length > 0, '测试角色应有公会 Buff 数据');

  // 无公会数据：神龛两组都为 null，总分不含神龛。
  const noGuildCard = {...baseCard};
  delete noGuildCard.characterGuildBuffMap;
  const noGuildScore = await new BuildScoreService(createMarketService()).calculate(noGuildCard, true);
  assert.equal(noGuildScore.battle.shrine, null);
  assert.equal(noGuildScore.skilling.shrine, null);

  // 有公会数据（真实数据）：代币与信用按完整转换链估值（可转换来源物市场价折算），
  // 战斗神龛 = 21.01（基准值随测试市场数据更新而重新生成）；生活组无生活 Buff 时为 0。
  const realCard = {...baseCard, characterGuildBuffMap: guildBuffs};
  const realScore = await new BuildScoreService(createMarketService()).calculate(realCard, true);
  assert.equal(realScore.battle.shrine, 21.01);
  assert.equal(realScore.skilling.shrine, 0);
  assert.ok(
    Math.abs(
      realScore.battle.total -
        (realScore.battle.house + realScore.battle.abilities + realScore.battle.equipment + 21.01)
    ) < 1e-9,
    '战斗总分应包含战斗神龛'
  );

  // 信用价值按可转换来源物市场价折算（min）：注入来源物价格后 blue 信用不高于 5:1 折算价。
  const conversionService = new BuildScoreService(createMarketService({}, {'/items/abyssal_essence': {0: 1000}}));
  const blueCredit = conversionService._v26GuildCreditValue('/items/blue_guild_credit', clientData);
  assert.ok(blueCredit > 0, '真实数据下 blue 信用应有来源物可折算');
  assert.ok(blueCredit <= 1000 * 5, 'blue 信用应按来源物折算且不高于注入折算价');
  // 代币价值按可兑换信用的最大折算：1 个 guild_token 可兑 10 个 blue 信用（真实客户端数据）。
  const tokenValue = conversionService._v26GuildTokenValue(clientData, {cache: new Map(), visited: new Set()});
  assert.ok(tokenValue >= blueCredit * 10, '代币应不低于可兑换信用的折算价');

  // 装备隐藏时神龛仍计入（与 v26.4.14 一致）：战斗总分 = 战斗房屋 + 神龛。
  const hiddenCard = {...realCard, hideWearableItems: true};
  const hiddenScore = await new BuildScoreService(createMarketService()).calculate(hiddenCard, true);
  assert.equal(hiddenScore.battle.equipment, 0);
  assert.equal(hiddenScore.battle.abilities, 0);
  assert.ok(
    Math.abs(hiddenScore.battle.total - (hiddenScore.battle.house + 21.01)) < 1e-9,
    '隐藏装备时战斗总分应含房屋与神龛'
  );
});

test('公会神龛生效等级按游戏规则取增益等级与神龛等级较小值', () => {
  const service = new BuildScoreService(createMarketService());
  // 只保留 force_combat 并提升到 3 级；公会 force 神龛 2 级。
  const guildBuffs = {
    '/guild_buffs/force_combat': {guildBuffHrid: '/guild_buffs/force_combat', level: 3}
  };
  const baseCard = {player: {}, abilities: [], characterHouseRoomMap: {}, characterGuildBuffMap: guildBuffs};
  // 基准值由测试市场数据 + 转换链估值确定：force 神龛 1/2/3 级成本
  // 分别为 4.24M / 10.12M / 25.315M，两级合计 14.36、三级合计 39.675。

  // 有公会神龛等级（2 级低于角色 3 级）：生效等级取 2，只累加前两级。
  const withShrine = service._v26GuildShrineScores(
    {...baseCard, guildBuildingLevelMap: {'/guild_shrines/force': 2}},
    clientData
  );
  assert.equal(withShrine.battle, 14.36);
  assert.equal(withShrine.skilling, 0);

  // 资料场景无公会建筑数据：直接用角色等级，累加三级。
  const withoutShrine = service._v26GuildShrineScores(baseCard, clientData);
  assert.equal(withoutShrine.battle, 39.675);
});
