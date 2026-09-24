'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Worker} = require('node:worker_threads');
const {readRuntimeSource, readVmSource} = require('./helpers/source.js');

const MST_DIR = path.resolve(__dirname, '..');
const EQUIPMENT_MESSAGES_PATH = path.join(MST_DIR, 'src', 'common', 'messages.js');
const source = readRuntimeSource();
const equipmentMessagesSource = fs.readFileSync(EQUIPMENT_MESSAGES_PATH, 'utf8');
const appControllerSource = fs.readFileSync(path.join(MST_DIR, 'src', 'app', 'app-controller.js'), 'utf8');
const clientResponse = JSON.parse(
  fs.readFileSync(path.resolve(MST_DIR, 'references', 'game-data', 'init_client_data.json'), 'utf8')
);
const characterResponse = JSON.parse(
  fs.readFileSync(path.resolve(MST_DIR, 'references', 'game-data', 'init_character_data.json'), 'utf8')
);
const clientData = clientResponse.data || clientResponse;
const originalCharacterData = characterResponse.data || characterResponse;
let characterData = structuredClone(originalCharacterData);

const DataHub = {
  getClientData() {
    return clientData;
  },
  getClientDataMap(key) {
    return clientData[key] || {};
  },
  resolveItemName(hrid) {
    return clientData.itemDetailMap?.[hrid]?.name || hrid;
  },
  getLocalizedGameName(group, key) {
    if (group === 'itemNames') return clientData.itemDetailMap?.[key]?.name || key;
    if (group === 'equipmentTypeNames') return clientData.equipmentTypeDetailMap?.[key]?.name || key;
    return String(key || '');
  }
};

const CharacterDataService = {
  get raw() {
    return characterData;
  },
  getCharacterItems() {
    return characterData.characterItems || [];
  },
  getCharacterSkills() {
    return characterData.characterSkills || [];
  },
  getCharacterSkill(skillHrid) {
    return this.getCharacterSkills().find((skill) => skill.skillHrid === skillHrid) || null;
  }
};

const utils = {
  getSpriteUrl() {
    return '';
  },
  substrLastSlash(value) {
    return String(value).split('/').pop();
  },
  formatCompactNumber(value) {
    return String(value);
  }
};
const i18n = {languageKey: 'en', t: (key) => key};
const TemplateRenderer = {empty: null};
const Notifier = {};
const window = {addEventListener() {}};

// 装备提升依赖多个源码模块，用 VM 拼装后可在 Node 中直接验证核心逻辑。
function loadEquipmentClasses() {
  const moduleSource = readVmSource(
    'src/modules/equipment-comparison/worker-runtime.js',
    'src/modules/equipment-comparison/simulator.js',
    'src/modules/equipment-comparison/comparison.js',
    'src/modules/equipment-comparison/presets.js',
    'src/modules/equipment-comparison/index.js'
  );
  return vm.runInNewContext(
    `${moduleSource}
        EquipmentComparisonService.configure({DataHub, CharacterDataService}, CombatSimulationService);
        const ctx = {
            DataHub,
            CharacterDataService,
            EquipmentComparisonService,
            TemplateRenderer,
            CalculatorHelpPopover: {},
            Notifier,
            LanguageEvents: {subscribe() {}},
            i18n,
            utils
        };
        class EquipmentComparisonFeatureWithContext extends EquipmentComparisonFeature {
          constructor(marketService = null, comparisonService = null) {
            super(ctx, marketService, comparisonService);
          }
        }
        EquipmentComparisonFeatureWithContext.PRESETS = EquipmentComparisonFeature.PRESETS;
        EquipmentComparisonFeatureWithContext.PRESET_GROUPS = EquipmentComparisonFeature.PRESET_GROUPS;
        const TestEquipmentComparisonFeature = EquipmentComparisonFeatureWithContext;
        ({CombatSimulationService, EquipmentComparisonService, EquipmentComparisonFeature: TestEquipmentComparisonFeature});`,
    {DataHub, CharacterDataService, utils, i18n, TemplateRenderer, Notifier, window, console, Intl, Set, Map}
  );
}

const {CombatSimulationService, EquipmentComparisonService, EquipmentComparisonFeature} = loadEquipmentClasses();
const expectedDpsByBuild = {
  'meleeHammer.baseline': [
    113.87944444444445, 110.78222222222222, 114.44638888888889, 118.07583333333334, 115.27055555555556
  ],
  'meleeHammer.comparison': [
    104.70666666666666, 104.47333333333333, 106.28722222222223, 105.12083333333334, 103.25166666666667
  ],
  'meleeBulwark.baseline': [
    83.79277777777777, 80.94416666666666, 78.60583333333334, 79.55333333333333, 79.36638888888889
  ],
  'meleeBulwark.comparison': [
    41.731944444444444, 39.25055555555556, 39.97694444444444, 40.043055555555554, 40.68
  ],
  'meleeSword.baseline': [
    122.88138888888889, 121.13861111111112, 119.21944444444445, 118.58694444444444, 124.7225
  ],
  'meleeSword.comparison': [
    79.03666666666666, 76.6438888888889, 79.11916666666667, 80.8825, 78.85305555555556
  ],
  'meleeSpear.baseline': [
    141.6988888888889, 143.27833333333334, 135.9013888888889, 137.0636111111111, 137.4113888888889
  ],
  'meleeSpear.comparison': [
    77.40972222222223, 78.52388888888889, 78.35666666666667, 76.88833333333334, 76.18777777777778
  ],
  'rangedBow.baseline': [
    111.2325, 112.55833333333334, 111.47777777777777, 111.63916666666667, 110.02361111111111
  ],
  'rangedBow.comparison': [
    74.51333333333334, 70.32, 73.09055555555555, 73.09666666666666, 71.67472222222223
  ],
  'rangedCrossbow.baseline': [
    101.39055555555555, 102.96916666666667, 100.52583333333334, 103.07333333333334, 101.09916666666666
  ],
  'rangedCrossbow.comparison': [
    93.54777777777778, 94.86333333333333, 93.80527777777777, 95.92055555555555, 94.59138888888889
  ],
  'magicFire.baseline': [
    151.6197222222222, 146.71194444444444, 147.33638888888888, 148.23777777777778, 143.06166666666667
  ],
  'magicFire.comparison': [
    71.17083333333333, 73.63777777777777, 72.89472222222223, 74.38583333333334, 75.16
  ],
  'magicWater.baseline': [
    136.38694444444445, 133.98777777777778, 134.175, 135.735, 130.82222222222222
  ],
  'magicWater.comparison': [
    115.42722222222223, 117.95916666666666, 117.09388888888888, 114.71055555555556, 119.36611111111111
  ],
  'magicNature.baseline': [
    136.4075, 133.09444444444443, 131.31666666666666, 130.39111111111112, 126.67472222222223
  ],
  'magicNature.comparison': [
    102.23777777777778, 104.0513888888889, 103.44111111111111, 105.105, 108.85388888888889
  ]
};

function runWorkerDpsJobs(jobs, simulationTime = CombatSimulationService.SIMULATION_TIME, onResult = null) {
  // Worker 回归测试复用真实内嵌模拟器，按固定种子逐个任务串行执行。
  const workerPrelude = `
        const {parentPort} = require('node:worker_threads');
        globalThis.self = globalThis;
        globalThis.onmessage = null;
        globalThis.postMessage = value => parentPort.postMessage(value);
        if (typeof CustomEvent === 'undefined') {
            globalThis.CustomEvent = class CustomEvent extends Event {
                constructor(type, options = {}) {
                    super(type);
                    this.detail = options.detail;
                }
            };
        }
    `;
  const workerBridge = `
        parentPort.on('message', data => globalThis.onmessage({data}));
        parentPort.postMessage({type: 'ready'});
    `;
  const worker = new Worker(workerPrelude + CombatSimulationService.buildWorkerSource() + workerBridge, {eval: true});
  const service = new CombatSimulationService();
  const values = Object.fromEntries(
    jobs.map((job) => [
      job.id, []
    ])
  );
  let jobIndex = 0;
  let seedIndex = 0;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(reject, new Error('战斗模拟回归测试超时')), 120000);
    const finish = (callback, value) => {
      clearTimeout(timeout);
      worker.terminate();
      callback(value);
    };
    const runNext = () => {
      const job = jobs[jobIndex];
      worker.postMessage({
        type: 'start_simulation',
        players: [
          job.player
        ],
        zone: {
          zoneHrid: CombatSimulationService.ZONE_HRID,
          difficultyTier: 0
        },
        simulationTimeLimit: simulationTime,
        seed: CombatSimulationService.SEEDS[seedIndex],
        mstData: seedIndex === 0 ? job.mstData : null
      });
    };

    worker.on('error', (error) => finish(reject, error));
    worker.on('message', (message) => {
      if (message.type === 'ready') {
        runNext();
        return;
      }
      if (message.type === 'simulation_error') {
        finish(reject, new Error(message.error?.message || String(message.error)));
        return;
      }
      if (message.type !== 'simulation_result') return;
      values[jobs[jobIndex].id].push(service.getDps(message.simResult));
      if (onResult) onResult(jobs[jobIndex], message.simResult);
      seedIndex += 1;
      if (seedIndex >= CombatSimulationService.SEEDS.length) {
        seedIndex = 0;
        jobIndex += 1;
      }
      if (jobIndex >= jobs.length) {
        finish(resolve, values);
      } else {
        runNext();
      }
    });
  });
}

test.beforeEach(() => {
  characterData = structuredClone(originalCharacterData);
});

test('装备提升使用单一 uhtml 渲染边界，并已移除旧粗略 DPS 公式', () => {
  const lifecycleSource = fs.readFileSync(
    path.join(MST_DIR, 'src', 'modules', 'equipment-comparison', 'index.js'),
    'utf8'
  );
  const start = source.indexOf('class EquipmentComparisonFeature');
  const end = source.indexOf('    class ToolkitMenuFeature', start);
  const featureSource = source.slice(start, end);
  assert.equal((lifecycleSource.match(/TemplateRenderer\.render\(/g) || []).length, 1);
  assert.doesNotMatch(featureSource, /calculateDpsDifference|getEquipmentCombatStyle/);
  assert.match(lifecycleSource, /moduleName: 'equipment'/);
  assert.match(equipmentMessagesSource, /equipmentComparisonHelpTitle:/);
  assert.match(equipmentMessagesSource, /equipmentComparisonHelp:/);
  assert.doesNotMatch(featureSource, /comparisonHint|simulationSource/);
  assert.match(source, /new CombatSimulationService\(this\.ctx\)/);
  assert.match(
    appControllerSource,
    /new EquipmentComparisonService\(\s*marketDataService,\s*combatSimulationService,?\s*\)/
  );
  assert.match(
    appControllerSource,
    /new EquipmentComparisonFeature\(\s*this\.ctx,\s*marketDataService,\s*equipmentComparisonService\s*\)/
  );
  assert.doesNotMatch(featureSource, /buildSimulationPlayer\(|buildSimulationData\(|getStandardTarget\(/);
  assert.doesNotMatch(featureSource, /getCharacterItems\(\)\.filter/);
});

test('九套职业方案引用的装备、技能和消耗品均来自官方公共数据', () => {
  const presets = EquipmentComparisonFeature.PRESETS;
  assert.equal(Object.keys(presets).length, 9);

  for (const [
    key, preset
  ] of Object.entries(presets)) {
    assert.equal(preset.equipment.length >= 6, true, `${key} 缺少职业装备`);
    assert.equal(preset.abilities.length, 5, `${key} 技能数量错误`);
    assert.equal(preset.drinks.length, 2, `${key} 咖啡数量错误`);
    for (const [
      hrid, level
    ] of preset.equipment) {
      assert.ok(clientData.itemDetailMap[hrid], `${key} 装备不存在：${hrid}`);
      assert.equal(level, 10, `${key} 战斗装备必须统一为 +10`);
    }
    for (const hrid of preset.abilities) {
      assert.ok(clientData.abilityDetailMap[hrid], `${key} 技能不存在：${hrid}`);
    }
    for (const hrid of preset.drinks) {
      assert.ok(clientData.itemDetailMap[hrid]?.consumableDetail, `${key} 咖啡不存在：${hrid}`);
    }
  }

  assert.deepEqual(
    Array.from(EquipmentComparisonService.ABILITY_LEVELS),
    [
      4, 6, 6, 6, 6
    ]
  );
  for (const entry of EquipmentComparisonService.SHARED_EQUIPMENT) {
    assert.ok(clientData.itemDetailMap[entry.itemHrid], `共用装备不存在：${entry.itemHrid}`);
    assert.equal(entry.enhancementLevel, 5);
  }
  for (const hrid of EquipmentComparisonService.FOOD_HRIDS) {
    assert.ok(clientData.itemDetailMap[hrid]?.consumableDetail, `食物不存在：${hrid}`);
  }
});

test('近战锤与近战盾均使用官方 smash 风格，并按主手和双手区分', () => {
  const feature = new EquipmentComparisonFeature();
  const hammer = EquipmentComparisonFeature.PRESETS.meleeHammer;
  const bulwark = EquipmentComparisonFeature.PRESETS.meleeBulwark;
  const flail = clientData.itemDetailMap['/items/chaotic_flail'];
  const shield = clientData.itemDetailMap['/items/griffin_bulwark'];

  assert.equal(hammer.combatStyleHrid, '/combat_styles/smash');
  assert.equal(hammer.weaponTypeHrid, '/equipment_types/main_hand');
  assert.equal(bulwark.combatStyleHrid, '/combat_styles/smash');
  assert.equal(bulwark.weaponTypeHrid, '/equipment_types/two_hand');
  assert.deepEqual(shield.equipmentDetail.combatStats.combatStyleHrids, [
    '/combat_styles/smash'
  ]);
  assert.equal(feature.isEquipmentCompatibleWithPreset(flail, hammer), true);
  assert.equal(feature.isEquipmentCompatibleWithPreset(flail, bulwark), false);
  assert.equal(feature.isEquipmentCompatibleWithPreset(shield, hammer), false);
  assert.equal(feature.isEquipmentCompatibleWithPreset(shield, bulwark), true);
});

test('魔法武器按元素过滤，无战斗风格限制的通用装备仍可选择', () => {
  const feature = new EquipmentComparisonFeature();
  const fire = EquipmentComparisonFeature.PRESETS.magicFire;
  assert.equal(feature.isEquipmentCompatibleWithPreset(clientData.itemDetailMap['/items/blazing_trident'], fire), true);
  assert.equal(
    feature.isEquipmentCompatibleWithPreset(clientData.itemDetailMap['/items/rippling_trident'], fire),
    false
  );
  assert.equal(feature.isEquipmentCompatibleWithPreset(clientData.itemDetailMap['/items/magicians_hat'], fire), true);
});

test('候选装备排除生活工具和护符，主手与双手共享武器逻辑槽', () => {
  const feature = new EquipmentComparisonFeature();
  const lifeTool = clientData.itemDetailMap['/items/holy_brush'];
  const charm = clientData.itemDetailMap['/items/master_magic_charm'];
  const mainHand = clientData.itemDetailMap['/items/chaotic_flail'];
  const twoHand = clientData.itemDetailMap['/items/griffin_bulwark'];

  assert.equal(feature.isCombatEquipment(lifeTool), false);
  assert.equal(feature.isCombatEquipment(charm), false);
  assert.equal(feature.getLogicalSlot(mainHand), 'weapon');
  assert.equal(feature.getLogicalSlot(twoHand), 'weapon');
});

test('基准装备覆盖全部同职业战斗装备，角色已有装备优先采用实际强化等级', () => {
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'magicNature';
  const options = feature.getBaselineEquipment();
  const equipped = options.find((item) => item.itemHrid === '/items/blooming_trident_refined');
  const unowned = options.find((item) => item.itemHrid === '/items/wooden_nature_staff');

  assert.equal(equipped.isEquipped, true);
  assert.equal(equipped.enhancementLevel, 13);
  assert.equal(unowned.count, 0);
  assert.equal(unowned.enhancementLevel, 10);
  assert.ok(options.some((item) => item.detail.equipmentDetail.type === '/equipment_types/head'));
});

test('市场位置物品不视为已穿戴，同名装备可比较不同强化等级', () => {
  characterData.characterItems.push({
    itemHrid: '/items/chaotic_flail',
    enhancementLevel: 20,
    count: 1,
    itemLocationHrid: '/item_locations/market'
  });
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'meleeHammer';
  const baseline = feature.getBaselineEquipment().find((item) => item.itemHrid === '/items/chaotic_flail');
  const compatible = feature.getCompatibleEquipment(baseline);

  assert.notEqual(baseline.enhancementLevel, 20);
  assert.ok(compatible.some((item) => item.hrid === baseline.itemHrid));
});

test('选择基准装备后右侧自动选择相同装备和强化等级', () => {
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'meleeHammer';
  let simulationRequested = 0;
  feature.render = () => {};
  feature.requestSimulation = () => {
    simulationRequested++;
  };

  feature.handleOwnedChange('/items/chaotic_flail');
  assert.equal(feature.baselineItemHrid, '/items/chaotic_flail');
  assert.equal(feature.comparisonItemHrid, '/items/chaotic_flail');
  assert.equal(feature.comparisonEnhancementLevel, feature.baselineEnhancementLevel);
  assert.equal(simulationRequested, 1);

  const nextBaseline = feature.getBaselineEquipment().find((item) => item.itemHrid !== '/items/chaotic_flail');
  assert.ok(nextBaseline);
  feature.handleOwnedChange(nextBaseline.itemHrid);
  assert.equal(feature.baselineItemHrid, nextBaseline.itemHrid);
  assert.equal(feature.comparisonItemHrid, nextBaseline.itemHrid);
  assert.equal(feature.comparisonEnhancementLevel, feature.baselineEnhancementLevel);
  assert.equal(simulationRequested, 2);
});

test('重置职业方案时右侧默认跟随基准装备', () => {
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'magicNature';

  feature.resetSelectionForPreset();
  assert.ok(feature.baselineItemHrid);
  assert.equal(feature.comparisonItemHrid, feature.baselineItemHrid);
  assert.equal(feature.comparisonEnhancementLevel, feature.baselineEnhancementLevel);
});

test('切换职业方案后自动请求模拟', () => {
  const feature = new EquipmentComparisonFeature();
  let simulationRequested = 0;
  feature.render = () => {};
  feature.requestSimulation = () => {
    simulationRequested++;
  };

  feature.handlePresetChange('magicFire');
  assert.equal(feature.presetKey, 'magicFire');
  assert.equal(simulationRequested, 1);

  feature.handlePresetChange('not-a-preset');
  assert.equal(feature.presetKey, 'magicFire');
  assert.equal(simulationRequested, 1);
});

test('打开弹窗后立即请求模拟', () => {
  const feature = new EquipmentComparisonFeature();
  let simulationRequested = 0;
  let opened = null;
  feature.render = () => {};
  feature.mountHelpPopover = () => {};
  feature.requestSimulation = () => {
    simulationRequested++;
  };
  const previousHtml = Notifier.html;
  const previousAlert = Notifier.alert;
  Notifier.html = (options) => {
    opened = options;
    return null;
  };
  Notifier.alert = () => null;
  try {
    feature.open();
  } finally {
    Notifier.html = previousHtml;
    Notifier.alert = previousAlert;
  }

  assert.ok(opened, '弹窗应已打开');
  assert.equal(simulationRequested, 0);
  opened.didOpen({querySelector: () => ({})});
  assert.ok(feature.root);
  assert.equal(simulationRequested, 1);
});

test('候选装备列表按角色物品缓存，角色物品变化后重新生成', () => {
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'meleeHammer';
  feature.baselineItemHrid = feature.getDefaultBaselineItem().itemHrid;
  const first = feature.getBaselineEquipment();
  assert.equal(feature.getBaselineEquipment(), first, '未变化时应复用同一份候选列表');
  const baseline = feature.getBaselineItem(first);
  assert.ok(baseline);
  assert.equal(feature.getCompatibleEquipment(baseline), feature.getCompatibleEquipment(baseline));

  characterData.characterItems.push({
    itemHrid: '/items/chaotic_flail',
    enhancementLevel: 17,
    count: 1,
    itemLocationHrid: '/item_locations/inventory'
  });
  const second = feature.getBaselineEquipment();
  assert.notEqual(second, first, '角色物品变化后应重新生成候选列表');
  assert.equal(second.find((item) => item.itemHrid === '/items/chaotic_flail').enhancementLevel, 17);
});

test('双手武器替换会清除副手，主手和副手方案可同时保留', () => {
  const service = new EquipmentComparisonService();
  const meleeBuild = service.buildPresetEquipment(EquipmentComparisonFeature.PRESETS.meleeHammer);
  const twoHandBuild = service.applyEquipmentToBuild(meleeBuild, '/items/griffin_bulwark', 10);
  assert.ok(twoHandBuild['/equipment_types/two_hand']);
  assert.equal(twoHandBuild['/equipment_types/main_hand'], undefined);
  assert.equal(twoHandBuild['/equipment_types/off_hand'], undefined);

  const restored = service.applyEquipmentToBuild(twoHandBuild, '/items/chaotic_flail', 10);
  assert.ok(restored['/equipment_types/main_hand']);
  assert.equal(restored['/equipment_types/two_hand'], undefined);
});

test('双手武器方案不展示副手装备，避免生成不可穿戴的 DPS 模拟输入', () => {
  for (const key of [
    'meleeBulwark', 'rangedBow'
  ]) {
    const feature = new EquipmentComparisonFeature();
    feature.presetKey = key;
    const options = feature.getBaselineEquipment();
    assert.equal(
      options.some((item) => item.detail.equipmentDetail.type === '/equipment_types/off_hand'),
      false,
      `${key} 不应允许副手装备参与比较`
    );

    const baseline = feature.getDefaultBaselineItem();
    const comparison =
      feature.getCompatibleEquipment(baseline).find((item) => item.hrid !== baseline.itemHrid) || baseline.detail;
    const context = feature.comparisonService.buildComparisonContext(
      feature.getPreset(),
      baseline,
      comparison,
      feature.comparisonEnhancementLevel
    );
    for (const equipment of [
      context.baselineEquipment, context.comparisonEquipment
    ]) {
      assert.ok(equipment['/equipment_types/two_hand']);
      assert.equal(equipment['/equipment_types/off_hand'], undefined);
    }
  }
});

test('完整模拟套装包含贤者三件套、暴饮之囊、固定技能等级及角色官方数据', () => {
  const service = new EquipmentComparisonService();
  const preset = EquipmentComparisonFeature.PRESETS.magicNature;
  const equipment = service.buildPresetEquipment(preset);
  const player = service.buildSimulationPlayer(equipment, preset);

  assert.equal(equipment['/equipment_types/neck'].hrid, '/items/philosophers_necklace');
  assert.equal(equipment['/equipment_types/earrings'].hrid, '/items/philosophers_earrings');
  assert.equal(equipment['/equipment_types/ring'].hrid, '/items/philosophers_ring');
  assert.equal(equipment['/equipment_types/pouch'].hrid, '/items/guzzling_pouch');
  assert.deepEqual(
    Array.from(player.abilities, (ability) => ability.level),
    [
      4, 6, 6, 6, 6
    ]
  );
  assert.equal(player.magicLevel, CharacterDataService.getCharacterSkill('/skills/magic').level);
  assert.equal(
    player.houseRooms['/house_rooms/library'],
    characterData.characterHouseRoomMap['/house_rooms/library'].level
  );
});

test('标准标靶的基础字段按游戏公式得到统一属性且不携带怪物技能', () => {
  const service = new EquipmentComparisonService();
  const target = service.getStandardTarget();
  const details = target.combatDetails;
  const stats = details.combatStats;
  // 模拟器只用基础字段重算派生属性，因此配置里的派生值必须等于公式计算结果：
  // 生命值 = 10 * (10 + 耐力等级) + combatStats.maxHitpoints，护甲与抗性 = 0.2 * 防御等级 + combatStats.xxx，
  // 闪避 = (10 + 防御等级) * (1 + combatStats.xxxEvasion)，魔力值 = 10 * (10 + 智力等级) + combatStats.maxManapoints。
  assert.equal(
    (10 * (10 + details.staminaLevel) + stats.maxHitpoints) * (1 + (stats.maxHitpointsRatio || 0)),
    CombatSimulationService.TARGET_HITPOINTS
  );
  assert.equal(details.maxHitpoints, CombatSimulationService.TARGET_HITPOINTS);
  assert.equal(
    (10 * (10 + details.intelligenceLevel) + (stats.maxManapoints || 0)) * (1 + (stats.maxManapointsRatio || 0)),
    details.maxManapoints
  );
  assert.deepEqual(
    [
      details.stabEvasionRating, details.slashEvasionRating, details.smashEvasionRating, details.rangedEvasionRating, details.magicEvasionRating
    ],
    [
      320, 320, 320, 320, 320
    ]
  );
  assert.deepEqual(
    [
      stats.stabEvasion, stats.slashEvasion, stats.smashEvasion, stats.rangedEvasion, stats.magicEvasion
    ].map((boost) => (10 + details.defenseLevel) * (1 + (boost || 0))),
    [
      320, 320, 320, 320, 320
    ]
  );
  assert.deepEqual(
    [
      details.totalArmor, details.totalWaterResistance, details.totalNatureResistance, details.totalFireResistance
    ],
    [
      62, 62, 62, 62
    ]
  );
  assert.deepEqual(
    [
      stats.armor, stats.waterResistance, stats.natureResistance, stats.fireResistance
    ].map((boost) => 0.2 * details.defenseLevel + boost),
    [
      62, 62, 62, 62
    ]
  );
  assert.deepEqual(Array.from(target.abilities), []);
});

test('模拟数据仅覆盖本次使用的数据，并保留游戏强化倍率表', () => {
  const service = new EquipmentComparisonService();
  const preset = EquipmentComparisonFeature.PRESETS.rangedCrossbow;
  const equipment = service.buildPresetEquipment(preset);
  const player = service.buildSimulationPlayer(equipment, preset);
  const data = service.buildSimulationData([
    player
  ]);

  assert.ok(data.itemDetailMap['/items/sundering_crossbow']);
  assert.ok(data.itemDetailMap['/items/philosophers_necklace']);
  assert.ok(data.abilityDetailMap['/abilities/rain_of_arrows']);
  assert.ok(data.houseRoomDetailMap['/house_rooms/archery_range']);
  // 装备对比不计入角色成就增益：成就 tier 与完成度表都为空，玩家侧也不带成就记录。
  assert.deepEqual({...player.achievements}, {});
  assert.deepEqual({...data.achievementTierDetailMap}, {});
  assert.deepEqual({...data.achievementDetailMap}, {});
  assert.deepEqual(data.combatTriggerDependencyDetailMap, clientData.combatTriggerDependencyDetailMap);
  assert.deepEqual(data.combatStyleDetailMap, clientData.combatStyleDetailMap);
  assert.equal(
    data.combatMonsterDetailMap[CombatSimulationService.TARGET_HRID].combatDetails.maxHitpoints,
    CombatSimulationService.TARGET_HITPOINTS
  );
  assert.deepEqual(
    Array.from(data.enhancementLevelTotalBonusMultiplierTable),
    Array.from(clientData.enhancementLevelTotalBonusMultiplierTable)
  );
});

test('内嵌 Worker 包含完整数据入口，不依赖远程资源或 Base64 压缩包', () => {
  const workerSource = CombatSimulationService.buildWorkerSource();

  for (const key of CombatSimulationService.DATA_KEYS) {
    assert.match(workerSource, new RegExp(`\\b${key}\\b`));
  }
  assert.match(workerSource, /Math\.random = function/);
  assert.match(workerSource, /Number\.isFinite\(seed\)/);
  assert.match(workerSource, /updateTimeSpentAlive/);
  assert.match(workerSource, /updateCombatData\(event\.data\.mstData\)/);
  assert.doesNotMatch(source, /RESOURCE_GZIP_BASE64|GM_getResourceText|MWICombatSimulatorTest\/dist/);
});

test('九职业基准与对比装备的固定种子 DPS 与原模拟器逐值一致', {timeout: 120000}, async () => {
  const jobs = [];
  for (const key of Object.keys(EquipmentComparisonFeature.PRESETS)) {
    const feature = new EquipmentComparisonFeature();
    feature.presetKey = key;
    const service = feature.comparisonService;
    const baseline = feature.getDefaultBaselineItem();
    const comparison =
      feature.getCompatibleEquipment(baseline).find((item) => item.hrid !== baseline.itemHrid) || baseline.detail;
    const context = service.buildComparisonContext(
      feature.getPreset(),
      baseline,
      comparison,
      feature.comparisonEnhancementLevel
    );
    jobs.push(
      {id: `${key}.baseline`, player: context.baselinePlayer, mstData: context.mstData},
      {id: `${key}.comparison`, player: context.comparisonPlayer, mstData: context.mstData}
    );
  }

  const targetDeathCounts = [];
  const actual = await runWorkerDpsJobs(jobs, 60 * 60 * 1e9, (_job, simResult) => {
    targetDeathCounts.push(simResult.deaths?.[CombatSimulationService.TARGET_HRID] || 0);
  });
  assert.deepEqual(actual, expectedDpsByBuild);
  assert.equal(
    targetDeathCounts.some((count) => count > 0),
    false,
    `标准标靶不应在模拟中死亡，实际死亡记录：${JSON.stringify(targetDeathCounts)}`
  );
});

test('同一主教法典从 +12 强化到 +13 时输入一致且平均 DPS 提升为正', {timeout: 120000}, async () => {
  const feature = new EquipmentComparisonFeature();
  feature.presetKey = 'magicFire';
  feature.comparisonEnhancementLevel = 13;
  const baseline = {
    itemHrid: '/items/bishops_codex',
    enhancementLevel: 12,
    detail: clientData.itemDetailMap['/items/bishops_codex']
  };
  const context = feature.comparisonService.buildComparisonContext(
    feature.getPreset(),
    baseline,
    baseline.detail,
    feature.comparisonEnhancementLevel
  );
  const baselineEquipment = structuredClone(context.baselineEquipment);
  const comparisonEquipment = structuredClone(context.comparisonEquipment);
  assert.equal(baselineEquipment['/equipment_types/off_hand'].enhancementLevel, 12);
  assert.equal(comparisonEquipment['/equipment_types/off_hand'].enhancementLevel, 13);
  delete baselineEquipment['/equipment_types/off_hand'];
  delete comparisonEquipment['/equipment_types/off_hand'];
  assert.deepEqual(baselineEquipment, comparisonEquipment);

  const values = await runWorkerDpsJobs([
    {
      id: 'baseline',
      player: context.baselinePlayer,
      mstData: context.mstData
    }, {id: 'comparison', player: context.comparisonPlayer, mstData: context.mstData}
  ]);
  const average = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  assert.ok(
    average(values.comparison) > average(values.baseline),
    `+12=${JSON.stringify(values.baseline)}, +13=${JSON.stringify(values.comparison)}`
  );
});

test('DPS 汇总忽略 miss，并按标靶实际存活时间计算', () => {
  const service = new CombatSimulationService();
  const result = {
    attacks: {player1: {[CombatSimulationService.TARGET_HRID]: {autoAttack: {100: 2, miss: 5}, ability: {50: 4}}}},
    timeSpentAlive: [
      {name: CombatSimulationService.TARGET_HRID, timeSpentAlive: 2e9}
    ],
    simulatedTime: 10e9
  };
  assert.equal(service.getDps(result), 200);
});

test('装备价格差只比较所选两件装备，并正确计算每 10M 提升', () => {
  const prices = {'/items/chaotic_flail': 1000000, '/items/knights_aegis': 2000000, '/items/griffin_bulwark': 11000000};
  const marketService = {
    getMarketRow(itemHrid) {
      return prices[itemHrid] ? {a: prices[itemHrid]} : null;
    }
  };
  const service = new EquipmentComparisonService(marketService);
  const baselineEquipment = {
    '/equipment_types/main_hand': {hrid: '/items/chaotic_flail', enhancementLevel: 10},
    '/equipment_types/off_hand': {hrid: '/items/knights_aegis', enhancementLevel: 10}
  };
  const comparisonEquipment = {'/equipment_types/two_hand': {hrid: '/items/griffin_bulwark', enhancementLevel: 10}};
  const simulationState = {status: 'ready', result: {baselineDps: 100, comparisonDps: 110, change: 0.1}};
  const result = service.getDerivedComparison(simulationState, {
    baselineEquipment,
    comparisonEquipment,
    baselineSelection: {hrid: '/items/chaotic_flail', enhancementLevel: 10},
    comparisonSelection: {hrid: '/items/griffin_bulwark', enhancementLevel: 10}
  });

  assert.equal(result.priceDifference, 10000000);
  assert.equal(result.baselineDps, 100);
  assert.equal(result.comparisonDps, 110);
  assert.equal(result.dps.value, 0.1);
  assert.equal(result.dpsPerTenMillion, 10);
});

test('基准与对比为同一件装备时直接返回 0 提升且不启动模拟', async () => {
  let compareCalls = 0;
  const simulationService = {
    compare() {
      compareCalls += 1;
      return Promise.resolve({baselineDps: 1, comparisonDps: 2, change: 1});
    },
    cancel() {}
  };
  const service = new EquipmentComparisonService(null, simulationService);
  const selection = {hrid: '/items/chaotic_flail', enhancementLevel: 10};

  const identical = await service.compare({
    baselineSelection: selection,
    comparisonSelection: {...selection}
  });
  assert.equal(compareCalls, 0);
  // 结果对象来自 VM 上下文，展开后再比较，避免跨 realm 原型差异。
  assert.deepEqual({...identical}, {baselineDps: null, comparisonDps: null, change: 0});

  const differentLevel = await service.compare({
    baselineSelection: selection,
    comparisonSelection: {hrid: '/items/chaotic_flail', enhancementLevel: 11}
  });
  assert.equal(compareCalls, 1);
  assert.equal(differentLevel.change, 1);
});

test('对比装备跟随基准装备时请求不触发模拟并直接给出 0 提升', async () => {
  let compareCalls = 0;
  const simulationService = {
    compare() {
      compareCalls += 1;
      return Promise.resolve({baselineDps: 1, comparisonDps: 2, change: 1});
    },
    cancel() {}
  };
  const feature = new EquipmentComparisonFeature(null, new EquipmentComparisonService(null, simulationService));
  feature.presetKey = 'meleeHammer';
  feature.render = () => {};
  feature.root = {};
  const baseline = feature.getDefaultBaselineItem();
  feature.baselineItemHrid = baseline.itemHrid;
  feature.baselineEnhancementLevel = baseline.enhancementLevel;
  feature.comparisonItemHrid = baseline.itemHrid;
  feature.comparisonEnhancementLevel = baseline.enhancementLevel;

  await feature.requestSimulation();
  assert.equal(compareCalls, 0);
  assert.equal(feature.simulationState.status, 'ready');
  assert.equal(feature.simulationState.result.change, 0);
  assert.equal(feature.simulationState.result.baselineDps, null);
});

test('真实公共数据可为九套职业构建完整且无缺项的模拟输入', () => {
  const feature = new EquipmentComparisonFeature();
  const service = feature.comparisonService;
  for (const key of Object.keys(EquipmentComparisonFeature.PRESETS)) {
    feature.presetKey = key;
    const baseline = feature.getDefaultBaselineItem();
    assert.ok(baseline, `${key} 没有可用基准装备`);
    const comparison =
      feature.getCompatibleEquipment(baseline).find((item) => item.hrid !== baseline.itemHrid) || baseline.detail;
    const context = service.buildComparisonContext(
      feature.getPreset(),
      baseline,
      comparison,
      feature.comparisonEnhancementLevel
    );
    for (const equipment of [
      context.baselineEquipment, context.comparisonEquipment
    ]) {
      for (const item of Object.values(equipment)) {
        assert.ok(clientData.itemDetailMap[item.hrid], `${key} 模拟装备缺失：${item.hrid}`);
      }
    }
    assert.equal(context.baselinePlayer.abilities.length, 5);
    assert.equal(context.baselinePlayer.food.length, 2);
    assert.equal(context.baselinePlayer.drinks.length, 2);
  }
});
