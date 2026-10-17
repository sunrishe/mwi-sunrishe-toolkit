'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSourceFile, readVmSource} = require('./helpers/source.js');

const skillLevels = new Map();
const combatSkillHrids = [
  '/skills/stamina', '/skills/intelligence', '/skills/attack', '/skills/defense', '/skills/melee',
  '/skills/ranged', '/skills/magic'
];
// 名片缓存（DataHub.getProfile）的测试替身，按用例改写。
const profileStore = {profiles: {}};

const CharacterDataService = {
  raw: {character: {id: 7}},
  getCharacterSkill(skillHrid) {
    const level = skillLevels.get(skillHrid) || 0;
    return {level, experience: level * 1000};
  },
  getLevelExperience(level) {
    return Number(level || 0) * 1000;
  },
  getLevelExperiencePercent(level, experience) {
    return Math.max(0, Math.min(100, (Number(experience || 0) - Number(level || 0) * 1000) / 10));
  },
  getCombatSkills() {
    return combatSkillHrids.map((hrid) => ({detail: {hrid}}));
  }
};

const utils = {
  clampLevel(level, min, max) {
    return Math.min(max, Math.max(min, Number(level) || 0));
  },
  escapeHtml(value) {
    return String(value ?? '');
  },
  formatDateTime(value) {
    return new Date(value).toISOString();
  },
  getSpriteUrl() {
    return '';
  },
  substrLastSlash(value) {
    return String(value || '').substring(String(value || '').lastIndexOf('/') + 1);
  }
};

// 直接执行成品脚本中的类，确保测试覆盖实际发布代码。
function loadCombatUpgradeCalculatorFeature() {
  return vm.runInNewContext(
    `${readVmSource(
      'src/modules/combat-upgrade/planner.js',
      'src/modules/combat-upgrade/tooltip.js',
      'src/modules/combat-upgrade/index.js'
    )}
        const ctx = {
            DataHub: {
              getLocalizedGameName(_group, hrid) { return hrid; },
              getClientData() { return {levelExperienceTable: [0]}; },
              getClientDataMap() { return {}; },
              getProfile(characterId) { return profileStore.profiles[String(characterId)] || null; },
              getGameState() { return null; }
            },
            CharacterDataService,
            TemplateRenderer: {},
            CalculatorHelpPopover: {},
            Notifier: {alert() {}, html() { return null; }, toast() {}},
            LanguageEvents: {subscribe() {}},
            i18n: {
              languageKey: 'zh',
              locale: 'zh-CN',
              t(key, ...args) {
                // 只补时间单位与分隔符；其余文案键保持 key 原样，参数以 key[参数] 形式附在后面便于断言。
                const units = {yearUnit: '年', dayUnit: '天', hourUnit: '小时', minuteUnit: '分', messageSeparator: '；'};
                let text = Object.prototype.hasOwnProperty.call(units, key) ? units[key] : key;
                const extraArgs = [];
                args.forEach((arg, index) => {
                  const placeholder = '{' + index + '}';
                  if (text.includes(placeholder)) text = text.replace(placeholder, String(arg));
                  else extraArgs.push(String(arg));
                });
                return extraArgs.length ? text + '[' + extraArgs.join('|') + ']' : text;
              }
            },
            utils
        };
        class CombatUpgradeCalculatorFeatureWithContext extends CombatUpgradeCalculatorFeature {
          constructor() {
            super(ctx);
          }
        }
        [CombatUpgradeCalculatorFeatureWithContext, combatUpgradeTooltip];`,
    {
      CharacterDataService,
      utils,
      profileStore,
      document: {
        querySelector() {
          return null;
        }
      }
    }
  );
}

const [
  CombatUpgradeCalculatorFeature, combatUpgradeTooltip
] = loadCombatUpgradeCalculatorFeature();

test('战斗专业类型遵循固定与可切换规则', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const expectedModes = {
    '/skills/stamina': 'secondary',
    '/skills/intelligence': 'secondary',
    '/skills/attack': 'flexible',
    '/skills/defense': 'flexible',
    '/skills/melee': 'flexible',
    '/skills/ranged': 'primary',
    '/skills/magic': 'primary'
  };

  Object.entries(expectedModes).forEach(
    ([
      skillHrid, expected
    ]) => {
      assert.equal(feature.getTrainingTypeMode(skillHrid), expected, skillHrid);
    }
  );
});

test('默认主修取近战、远程、魔法中的实际最高等级', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const cases = [
    [
      [
        80, 70, 60
      ], '/skills/melee'
    ], [
      [
        70, 80, 60
      ], '/skills/ranged'
    ], [
      [
        70, 60, 80
      ], '/skills/magic'
    ], [
      [
        80, 80, 80
      ], '/skills/melee'
    ]
  ];

  cases.forEach(
    ([
      [
        melee, ranged, magic
      ], expected
    ]) => {
      skillLevels.clear();
      skillLevels.set('/skills/melee', melee);
      skillLevels.set('/skills/ranged', ranged);
      skillLevels.set('/skills/magic', magic);
      assert.equal(feature.getDefaultPrimarySkillHrid(), expected);
    }
  );
});

test('默认列表展示耐智攻防和等级最高的主修专业', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/melee', 70);
  skillLevels.set('/skills/ranged', 90);
  skillLevels.set('/skills/magic', 80);
  feature.resetState();
  assert.deepEqual(
    feature.rows.map((row) => row.skillHrid),
    [
      '/skills/stamina', '/skills/intelligence', '/skills/attack', '/skills/defense', '/skills/ranged'
    ]
  );
});

test('主修同修取上一个主修后的第一个选修序号，并限制同序号重复职业', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      trainingType: 'secondary',
      concurrentTraining: false
    }, {id: 2, skillHrid: '/skills/intelligence', trainingType: 'secondary', concurrentTraining: false}, {
      id: 4,
      skillHrid: '/skills/melee',
      trainingType: 'primary',
      concurrentTraining: true
    }, {
      id: 5,
      skillHrid: '/skills/attack',
      trainingType: 'secondary',
      concurrentTraining: false
    }, {id: 6, skillHrid: '/skills/defense', trainingType: 'secondary', concurrentTraining: true},
    {id: 7, skillHrid: '/skills/ranged', trainingType: 'primary', concurrentTraining: true}, {
      id: 8,
      skillHrid: '/skills/melee',
      trainingType: 'secondary',
      concurrentTraining: false
    }, {id: 9, skillHrid: '/skills/melee', trainingType: 'primary', concurrentTraining: true}
  ];

  const {sequenceById, concurrentAllowedById} = feature.getSequenceState();
  assert.deepEqual(
    Array.from(sequenceById.values()),
    [
      1, 2, 1, 3, 3,
      3, 4, 5
    ]
  );
  assert.equal(concurrentAllowedById.get(4), true);
  assert.equal(concurrentAllowedById.get(7), true);
  assert.equal(concurrentAllowedById.get(9), false);
  assert.equal(feature.rows[7].concurrentTraining, false);
});

test('小时经验按主修、选修及同修状态计算', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const primaryRate = 70000;
  const secondaryRate = 30000;
  assert.equal(
    feature.getHourlyExperience(
      {trainingType: 'secondary', concurrentTraining: false, hourlyExperienceOverride: null},
      primaryRate,
      secondaryRate
    ),
    30000
  );
  assert.equal(
    feature.getHourlyExperience(
      {trainingType: 'secondary', concurrentTraining: true, hourlyExperienceOverride: null},
      primaryRate,
      secondaryRate
    ),
    30000
  );
  assert.equal(
    feature.getHourlyExperience(
      {trainingType: 'primary', concurrentTraining: true, hourlyExperienceOverride: null},
      primaryRate,
      secondaryRate
    ),
    70000
  );
  assert.equal(
    feature.getHourlyExperience(
      {trainingType: 'primary', concurrentTraining: false, hourlyExperienceOverride: null},
      primaryRate,
      secondaryRate
    ),
    100000
  );
});

test('当前战斗单职业小时经验按三七拆分为主修和选修', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const now = Date.parse('2026-08-04T13:00:00Z');
  const fill = feature.getBattleExperienceFill(
    {
      character: {id: 1},
      combatStartTime: '2026-08-04T12:00:00Z',
      battlePlayers: [
        {
          character: {id: 1},
          totalSkillExperienceMap: {'/skills/magic': 100000}
        }
      ]
    },
    now
  );

  assert.equal(fill.primaryRate, 30000);
  assert.equal(fill.secondaryRate, 70000);
});

test('当前战斗双职业小时经验按当前列表类型分别填入', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  feature.rows = [
    {skillHrid: '/skills/stamina', trainingType: 'secondary'}, {skillHrid: '/skills/melee', trainingType: 'primary'}
  ];
  const fill = feature.getExperienceFillFromRates([
    {skillHrid: '/skills/stamina', rate: 70000}, {skillHrid: '/skills/melee', rate: 30000}
  ]);

  assert.equal(fill.primaryRate, 30000);
  assert.equal(fill.secondaryRate, 70000);
});

test('当前战斗五职业小时经验按总和三七拆分', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const fill = feature.getExperienceFillFromRates([
    {
      skillHrid: '/skills/stamina',
      rate: 10000
    }, {skillHrid: '/skills/intelligence', rate: 20000}, {skillHrid: '/skills/attack', rate: 30000}, {
      skillHrid: '/skills/defense',
      rate: 40000
    }, {skillHrid: '/skills/ranged', rate: 100000}
  ]);

  assert.equal(fill.primaryRate, 60000);
  assert.equal(fill.secondaryRate, 140000);
});

test('重复职业继承前一段的结束等级', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/melee', 30);
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/melee',
      customStart: true,
      startLevel: 10,
      targetLevel: 20,
      trainingType: 'primary',
      concurrentTraining: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/melee',
      customStart: false,
      startLevel: 0,
      targetLevel: 35,
      trainingType: 'primary',
      concurrentTraining: false,
      hourlyExperienceOverride: null
    }, {
      id: 3,
      skillHrid: '/skills/melee',
      customStart: false,
      startLevel: 0,
      targetLevel: 40,
      trainingType: 'primary',
      concurrentTraining: false,
      hourlyExperienceOverride: null
    }
  ];

  const results = feature.calculatePlan(1000, 0).results;
  assert.deepEqual(
    Array.from(results.values(), (result) => [
      result.currentState.level, result.startLevel, result.targetLevel
    ]),
    [
      [
        30, 10, 20
      ], [
        30, 30, 35
      ], [
        35, 35, 40
      ]
    ]
  );
});

test('同序号同时开始，下一序号等待上一序号最长耗时结束', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      startLevel: 0,
      targetLevel: 5,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/intelligence',
      startLevel: 0,
      targetLevel: 8,
      trainingType: 'secondary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 3,
      skillHrid: '/skills/melee',
      startLevel: 0,
      targetLevel: 99,
      trainingType: 'primary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 4,
      skillHrid: '/skills/attack',
      startLevel: 0,
      targetLevel: 3,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 5,
      skillHrid: '/skills/defense',
      startLevel: 0,
      targetLevel: 2,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    },
    {
      id: 6,
      skillHrid: '/skills/stamina',
      startLevel: 0,
      targetLevel: 9,
      trainingType: 'secondary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 7,
      skillHrid: '/skills/ranged',
      startLevel: 0,
      targetLevel: 99,
      trainingType: 'primary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }
  ];

  const plan = feature.calculatePlan(1000, 1000);
  assert.equal(plan.totalHours, 15);
  assert.deepEqual(
    Array.from(plan.results.values(), (result) => [
      result.row.id, result.startHours, result.completionHours
    ]),
    [
      [
        1, 0, 5
      ], [
        2, 0, 8
      ], [
        3, 0, 8
      ], [
        4, 8, 11
      ], [
        5, 11, 13
      ],
      [
        6, 11, 15
      ], [
        7, 8, 15
      ]
    ]
  );
});

test('战斗列表只有序号单元格可以开始拖动', () => {
  const viewSource = readSourceFile('src', 'modules', 'combat-upgrade', 'index.js');
  assert.equal((viewSource.match(/<[^>]+\sdraggable="true"[^>]*>/g) || []).length, 1);
  assert.match(viewSource, /class="mst-sequence-cell" draggable="true"/);
  assert.doesNotMatch(viewSource, /<tr[^>]*draggable=/);
});

test('同修主修按前置选修时段反推精确经验，后续同职业继承非整级进度', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/stamina', 100);
  skillLevels.set('/skills/intelligence', 100);
  skillLevels.set('/skills/magic', 100);
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      startLevel: 100,
      targetLevel: 101,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/intelligence',
      startLevel: 100,
      targetLevel: 102,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 3,
      skillHrid: '/skills/magic',
      startLevel: 100,
      targetLevel: 199,
      trainingType: 'primary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 4,
      skillHrid: '/skills/magic',
      startLevel: 0,
      targetLevel: 140,
      trainingType: 'primary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }
  ];

  const plan = feature.calculatePlan(10963, 1000);
  const concurrentPrimary = plan.results.get(3);
  const followingPrimary = plan.results.get(4);

  assert.equal(concurrentPrimary.derivedTarget, true);
  assert.equal(concurrentPrimary.startHours, 0);
  assert.equal(concurrentPrimary.completionHours, 3);
  assert.equal(concurrentPrimary.hours, 3);
  assert.equal(concurrentPrimary.endState.experience, 132889);
  assert.equal(concurrentPrimary.endState.level, 132);
  assert.equal(concurrentPrimary.endState.percent, 88.9);
  assert.equal(feature.rows[2].targetLevel, 199, '同修期间不应覆盖取消同修后使用的原目标等级');
  assert.equal(followingPrimary.currentState.experience, 132889);
  assert.equal(followingPrimary.currentState.level, 132);
  assert.equal(followingPrimary.currentState.percent, 88.9);
  assert.equal(followingPrimary.startExperience, 132889);
});

test('缺少选修经验时不伪造同修主修的结束等级', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/stamina', 100);
  skillLevels.set('/skills/magic', 100);
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      startLevel: 100,
      targetLevel: 101,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/magic',
      startLevel: 100,
      targetLevel: 199,
      trainingType: 'primary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }
  ];

  const plan = feature.calculatePlan(1000, 0);
  assert.equal(plan.totalHours, null);
  assert.equal(plan.results.get(2).hours, null);
  assert.equal(plan.results.get(2).endState, null);
});

test('列表没有主修时也按选修或单独经验估算各行耗时与合计', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/stamina', 100);
  skillLevels.set('/skills/intelligence', 100);
  skillLevels.set('/skills/defense', 100);
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      startLevel: 100,
      targetLevel: 101,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/intelligence',
      startLevel: 100,
      targetLevel: 102,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 3,
      skillHrid: '/skills/defense',
      startLevel: 100,
      targetLevel: 103,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: 2
    }
  ];

  const plan = feature.calculatePlan(500, 1000);
  const stamina = plan.results.get(1);
  const intelligence = plan.results.get(2);
  const defense = plan.results.get(3);

  assert.equal(stamina.hours, 1);
  assert.equal(stamina.completionHours, 1);
  assert.equal(intelligence.hours, 2);
  assert.equal(intelligence.startHours, 1);
  assert.equal(intelligence.completionHours, 3);
  assert.equal(defense.hours, 1.5);
  assert.equal(defense.startHours, 3);
  assert.equal(defense.completionHours, 4.5);
  assert.equal(plan.totalHours, 4.5);
});

test('同修主修反推经验不超过 200 级上限', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/stamina', 100);
  skillLevels.set('/skills/magic', 199);
  feature.rows = [
    {
      id: 1,
      skillHrid: '/skills/stamina',
      startLevel: 100,
      targetLevel: 200,
      trainingType: 'secondary',
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    }, {
      id: 2,
      skillHrid: '/skills/magic',
      startLevel: 199,
      targetLevel: 200,
      trainingType: 'primary',
      concurrentTraining: true,
      customStart: false,
      hourlyExperienceOverride: null
    }
  ];

  const result = feature.calculatePlan(1000, 1000).results.get(2);
  assert.equal(result.endState.experience, 200000);
  assert.equal(result.endState.level, 200);
  assert.equal(result.endState.percent, 0);
});

test('战斗升级里程碑取下一个 10 的整数倍（<119）或 5 的整数倍（>=119）等级', () => {
  const feature = new CombatUpgradeCalculatorFeature();

  // 低于 119：下一个 10 的整数倍（整十等级本身也进到下一档）。
  assert.equal(feature.getMilestoneLevel(5), 10);
  assert.equal(feature.getMilestoneLevel(110), 120);
  assert.equal(feature.getMilestoneLevel(118), 120);
  // 119 起：下一个 5 的整数倍。
  assert.equal(feature.getMilestoneLevel(119), 120);
  assert.equal(feature.getMilestoneLevel(133), 135);
  assert.equal(feature.getMilestoneLevel(150), 155);
  // 超过 200 级没有下一个大等级。
  assert.equal(feature.getMilestoneLevel(195), 200);
  assert.equal(feature.getMilestoneLevel(196), 200);
  assert.equal(feature.getMilestoneLevel(199), 200);
  assert.equal(feature.getMilestoneLevel(200), null);
});

test('战斗不足 1 分钟不做速率估算，超过 1 分钟按真实速率计算', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const combatStartTime = '2026-08-04T12:00:00Z';
  const startMs = Date.parse(combatStartTime);
  const gameState = {
    character: {id: 1},
    combatStartTime,
    battlePlayers: [
      {
        character: {id: 1},
        totalSkillExperienceMap: {'/skills/magic': 100000}
      }
    ]
  };

  assert.equal(feature.getBattleExperienceFill(gameState, startMs + 30000), null);

  const rates = feature.state.getBattleSkillRatesFromState(feature, gameState, 1, startMs + 90000);
  assert.equal(rates.get('/skills/magic'), (100000 / 90) * 3600);

  const fill = feature.getBattleExperienceFill(gameState, startMs + 90000);
  assert.equal(fill.primaryRate, (100000 / 90) * 3600 * 0.3);
  assert.equal(fill.secondaryRate, (100000 / 90) * 3600 * 0.7);
});

test('战斗速率只保留本场有经验的战斗技能', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  const gameState = {
    character: {id: 1},
    combatStartTime: '2026-08-04T12:00:00Z',
    battlePlayers: [
      {
        character: {id: 1},
        totalSkillExperienceMap: {
          '/skills/woodcutting': 99999,
          '/skills/attack': 0,
          '/skills/melee': 7200,
          '/skills/magic': 3600
        }
      }
    ]
  };
  const nowMs = Date.parse('2026-08-04T13:00:00Z');

  const rates = feature.state.getBattleSkillRatesFromState(feature, gameState, 1, nowMs);
  assert.deepEqual(
    [
      ...rates.keys()
    ],
    [
      '/skills/melee', '/skills/magic'
    ]
  );
  assert.equal(rates.get('/skills/melee'), 7200);
  // 不是本场参战玩家时没有速率。
  assert.equal(feature.state.getBattleSkillRatesFromState(feature, gameState, 99, nowMs), null);
});

test('玩家上下文：自己、队友名片快照与缺资料三种情况', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  profileStore.profiles = {};
  skillLevels.clear();

  const self = feature.buildPlayerContext({characterId: 7, name: 'dadada6'});
  assert.equal(self.isSelf, true);
  assert.equal(self.name, 'dadada6');
  assert.equal(self.skills, null);

  const timestamp = Date.parse('2026-08-04T10:00:00Z');
  profileStore.profiles['42'] = {
    timestamp,
    profile: {characterSkills: [
        {skillHrid: '/skills/melee', level: 133, experience: 133500}
      ]}
  };
  const teammate = feature.buildPlayerContext({characterId: 42, name: 'ally'});
  assert.equal(teammate.isSelf, false);
  // 等级与经验都取名片快照（官方名片带各技能经验）。
  assert.equal(teammate.skills.get('/skills/melee').level, 133);
  assert.equal(teammate.skills.get('/skills/melee').experience, 133500);
  assert.equal(teammate.levelsTimestamp, timestamp);
  assert.equal(feature.state.hasCachedExperience(teammate), true);

  feature.playerContext = teammate;
  const melee = feature.getCharacterSkill('/skills/melee');
  assert.equal(melee.level, 133);
  assert.equal(melee.experience, 133500);
  // 名片里没有的技能按 0 级。
  const ranged = feature.getCharacterSkill('/skills/ranged');
  assert.equal(ranged.level, 0);
  assert.equal(ranged.experience, 0);
  // 传 null 时固定读自己，不受弹窗上下文影响（悬浮时间走这条路径）。
  const selfMelee = feature.getCharacterSkill('/skills/melee', null);
  assert.equal(selfMelee.level, 0);
  assert.equal(selfMelee.experience, 0);

  feature.playerContext = feature.buildPlayerContext({characterId: 99, name: 'ghost'});
  assert.equal(feature.playerContext.skills, null);
  const ghost = feature.getCharacterSkill('/skills/melee');
  assert.equal(ghost.level, 0);
  assert.equal(ghost.experience, 0);

  // 缓存里有等级但没记录查看时间时，提示行退化为不带时间的口径，不能显示算出来的时间。
  profileStore.profiles['43'] = {
    timestamp: 0,
    profile: {characterSkills: [
        {skillHrid: '/skills/melee', level: 100, experience: 100500}
      ]}
  };
  feature.playerContext = feature.buildPlayerContext({characterId: 43, name: 'nosy'});
  assert.equal(feature.playerContext.skills.get('/skills/melee').level, 100);
  assert.match(feature.getPlayerHintHtml(), /combatUpgradeLevelsCachedNoTime/);
  assert.doesNotMatch(feature.getPlayerHintHtml(), /combatUpgradeLevelsNoExperience/);

  // 旧版缓存（v2.21.0 及更早）裁剪掉了经验字段：退回该等级 0% 起算，并在提示行写明。
  profileStore.profiles['44'] = {
    timestamp,
    profile: {characterSkills: [
        {skillHrid: '/skills/melee', level: 133}
      ]}
  };
  feature.playerContext = feature.buildPlayerContext({characterId: 44, name: 'oldcache'});
  assert.equal(feature.state.hasCachedExperience(feature.playerContext), false);
  assert.equal(feature.getCharacterSkill('/skills/melee').level, 133);
  assert.equal(feature.getCharacterSkill('/skills/melee').experience, 133000);
  assert.match(feature.getPlayerHintHtml(), /combatUpgradeLevelsNoExperience/);

  assert.equal(feature.buildPlayerContext(null), null);
});

test('队友上下文：默认主修与列表起始等级按名片快照', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  skillLevels.clear();
  skillLevels.set('/skills/melee', 160);
  skillLevels.set('/skills/ranged', 10);
  skillLevels.set('/skills/magic', 12);
  profileStore.profiles = {
    42: {
      timestamp: Date.parse('2026-08-04T10:00:00Z'),
      profile: {
        characterSkills: [
          {
            skillHrid: '/skills/stamina',
            level: 30
          }, {skillHrid: '/skills/intelligence', level: 31}, {skillHrid: '/skills/attack', level: 32}, {
            skillHrid: '/skills/defense',
            level: 33
          }, {skillHrid: '/skills/melee', level: 20},
          {skillHrid: '/skills/ranged', level: 60, experience: 61234}, {skillHrid: '/skills/magic', level: 5}
        ]
      }
    }
  };
  feature.playerContext = feature.buildPlayerContext({characterId: 42, name: 'ally'});

  // 默认主修按快照里近战 / 远程 / 魔法最高的：自己 160 级的近战不参与。
  assert.equal(feature.getDefaultPrimarySkillHrid(), '/skills/ranged');

  feature.resetState();
  const rangedRow = feature.rows.find((row) => row.skillHrid === '/skills/ranged');
  assert.equal(rangedRow.startLevel, 60);
  assert.equal(rangedRow.targetLevel, 60);
  assert.equal(rangedRow.trainingType, 'primary');

  const plan = feature.calculatePlan(1000, 1000);
  assert.equal(plan.results.get(rangedRow.id).currentState.level, 60);
  // 起始经验用名片快照里的经验，不再一律按该等级 0% 起算。
  assert.equal(plan.results.get(rangedRow.id).currentState.experience, 61234);

  assert.equal(feature.createRow('/skills/magic').startLevel, 5);
  // 回到自己时仍是实时等级。
  feature.playerContext = null;
  assert.equal(feature.createRow('/skills/melee').startLevel, 160);
});

test('open() 兼容无参与带玩家上下文调用', () => {
  const feature = new CombatUpgradeCalculatorFeature();
  profileStore.profiles = {
    42: {timestamp: Date.now(), profile: {characterSkills: [
          {skillHrid: '/skills/melee', level: 133}
        ]}}
  };

  feature.open();
  assert.equal(feature.playerContext, null);
  assert.equal(feature.getDialogTitle(), 'combatUpgradeCalculator');

  feature.open({characterId: 42, name: 'ally'});
  assert.equal(feature.playerContext.characterId, '42');
  assert.equal(feature.getDialogTitle(), 'combatUpgradeCalculatorForPlayer[ally]');

  // 速率不可用时自动填充静默返回 false（不弹 toast），由提示行说明原因。
  assert.equal(feature.applyCurrentBattleExperience({silent: true}), false);
  const hint = feature.getPlayerHintHtml();
  assert.match(hint, /combatUpgradePlayerName\[ally\]/);
  assert.match(hint, /combatUpgradeLevelsCached\[/);
  // 这份测试名片没有经验字段：提示行要写明按 0% 起算。
  assert.match(hint, /combatUpgradeLevelsNoExperience/);
  assert.match(hint, /currentCombatXpUnavailable/);
});

test('悬浮时间文案格式：四行、里程碑与满级', () => {
  const feature = new CombatUpgradeCalculatorFeature();

  // 120 级、0% 经验、10 万/h：升 121 级需 1000 经验 → 36 秒 → 0 分；里程碑 125 级 → 3 分。
  const lines = combatUpgradeTooltip.getTimeLinesHtml(feature, 120, 120000, 100000);
  // 第一行是本场该技能的 K/h 速率（与计算器输入框同口径：一位小数、去掉多余的 0）。
  assert.match(lines, /combatUpgradeRateLine\[100\]/);
  assert.match(lines, /combatUpgradeTimeNeeded：0分/);
  assert.match(lines, /combatUpgradeTimeExact：\d\d\/\d\d \d\d:\d\d/);
  assert.match(lines, /combatUpgradeMilestoneNeeded\[125\]：3分/);
  assert.match(lines, /combatUpgradeMilestoneExact\[125\]：\d\d\/\d\d \d\d:\d\d/);

  // 119 级的里程碑是 120 级（下一个 5 的整数倍），118 级也是 120 级（下一个 10 的整数倍），133 级是 135 级。
  assert.match(
    combatUpgradeTooltip.getTimeLinesHtml(feature, 119, 119000, 100000),
    /combatUpgradeMilestoneNeeded\[120\]：0分/
  );
  assert.match(
    combatUpgradeTooltip.getTimeLinesHtml(feature, 118, 118000, 100000),
    /combatUpgradeMilestoneNeeded\[120\]/
  );
  assert.match(
    combatUpgradeTooltip.getTimeLinesHtml(feature, 133, 133000, 100000),
    /combatUpgradeMilestoneNeeded\[135\]/
  );
  // 196 级的里程碑是 200 级，仍能显示；满级（200）时没有下一个大等级。
  assert.match(
    combatUpgradeTooltip.getTimeLinesHtml(feature, 196, 196000, 100000),
    /combatUpgradeMilestoneNeeded\[200\]/
  );
  // 满级与没有速率时不注入。
  assert.equal(combatUpgradeTooltip.getTimeLinesHtml(feature, 200, 200000, 100000), '');
  assert.equal(combatUpgradeTooltip.getTimeLinesHtml(feature, 120, 120000, 0), '');

  assert.equal(combatUpgradeTooltip.formatDuration(feature, 3670), '1小时1分');
  assert.equal(
    combatUpgradeTooltip.formatDuration(feature, 31536000 + 86400 * 2 + 3600 * 3 + 60 * 20),
    '1年2天3小时20分'
  );
  assert.equal(combatUpgradeTooltip.formatDuration(feature, 0), '0分');
  assert.match(combatUpgradeTooltip.formatUpgradeTime(3600), /^\d\d\/\d\d \d\d:\d\d$/);
});

test('悬浮「战斗」技能块标题为专业、等级与当前经验百分比', () => {
  const feature = new CombatUpgradeCalculatorFeature();

  // 经验百分比最多两位小数、不补零，与计算器「当前等级」列同口径。
  assert.equal(
    combatUpgradeTooltip.getSkillBlockTitle(feature, {
      skillHrid: '/skills/attack',
      level: 133,
      experience: 133123.4
    }),
    '/skills/attack Lv.133 12.34%'
  );
  assert.equal(
    combatUpgradeTooltip.getSkillBlockTitle(feature, {
      skillHrid: '/skills/attack',
      level: 133,
      experience: 133125
    }),
    '/skills/attack Lv.133 12.5%'
  );
  assert.equal(
    combatUpgradeTooltip.getSkillBlockTitle(feature, {skillHrid: '/skills/attack', level: 133, experience: 133000}),
    '/skills/attack Lv.133 0%'
  );
  // 经验超出该等级区间（或数据异常）时封顶 100%。
  assert.equal(
    combatUpgradeTooltip.getSkillBlockTitle(feature, {
      skillHrid: '/skills/attack',
      level: 133,
      experience: 999999
    }),
    '/skills/attack Lv.133 100%'
  );
});

test('悬浮时间与交战入口接线复用公共观察器，不自建观察器', () => {
  const tooltipSource = readSourceFile('src', 'modules', 'combat-upgrade', 'tooltip.js');
  const entrySource = readSourceFile('src', 'modules', 'combat-upgrade', 'battle-entry.js');
  const featureSource = readSourceFile('src', 'modules', 'combat-upgrade', 'index.js');
  const styleSource = readSourceFile('src', 'modules', 'combat-upgrade', 'styles.css');
  const sourceHelper = readSourceFile('tests', 'helpers', 'source.js');

  assert.match(featureSource, /import \{combatUpgradeTooltip\} from '\.\/tooltip\.js';/);
  assert.match(featureSource, /import \{combatUpgradeBattleEntry\} from '\.\/battle-entry\.js';/);
  assert.match(featureSource, /import MST_COMBAT_UPGRADE_CSS from '\.\/styles\.css';/);
  assert.match(featureSource, /StyleService\.ensure\('mst-combat-upgrade-style', MST_COMBAT_UPGRADE_CSS\)/);
  assert.match(featureSource, /utils\.observeBody\(\(\) => \{/);
  assert.match(featureSource, /combatUpgradeTooltip\.mount\(this\);/);
  assert.match(featureSource, /combatUpgradeBattleEntry\.mount\(this\);/);

  assert.match(tooltipSource, /NavigationBar_navigationSkillTooltip/);
  assert.match(tooltipSource, /mst-combat-tooltip/);
  assert.match(tooltipSource, /skills_sprite/);
  // 「战斗」块标题带专业、等级与经验百分比。
  assert.match(tooltipSource, /getSkillBlockTitle/);
  assert.match(tooltipSource, /maximumFractionDigits: 2/);
  // 悬浮期间内容冻结：按轮次（hoverToken）判定，不再按秒级时间戳重写。
  assert.match(tooltipSource, /hoverToken/);
  assert.doesNotMatch(tooltipSource, /Date\.now\(\) \/ 1000/);
  assert.doesNotMatch(tooltipSource, /new MutationObserver/);

  assert.match(entrySource, /CombatUnit_combatUnit/);
  assert.match(entrySource, /memoizedProps\?\.combatUnit/);
  assert.match(entrySource, /stopPropagation\(\)/);
  assert.match(entrySource, /mst-combat-unit-entry/);
  assert.doesNotMatch(entrySource, /new MutationObserver/);

  assert.match(styleSource, /:hover \.mst-combat-unit-entry/);
  assert.match(styleSource, /opacity: 0;/);
  assert.match(styleSource, /pointer-events: none;/);

  // 运行时源码顺序：planner → tooltip → battle-entry → index（索引文件的依赖必须在前）。
  const order = [
    'combat-upgrade/planner.js', 'combat-upgrade/tooltip.js', 'combat-upgrade/battle-entry.js', 'combat-upgrade/index.js'
  ].map((file) => sourceHelper.indexOf(file));
  assert.ok(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])));
});
