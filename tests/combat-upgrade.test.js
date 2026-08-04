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

const CharacterDataService = {
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
  }
};

// 直接执行成品脚本中的类，确保测试覆盖实际发布代码。
function loadCombatUpgradeCalculatorFeature() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/combat-upgrade/planner.js', 'src/modules/combat-upgrade/index.js')}
        const ctx = {
            DataHub: {getLocalizedGameName(_group, hrid) { return hrid; }},
            CharacterDataService,
            TemplateRenderer: {},
            CalculatorHelpPopover: {},
            Notifier: {},
            LanguageEvents: {subscribe() {}},
            i18n: {t(key) { return key; }},
            utils
        };
        class CombatUpgradeCalculatorFeatureWithContext extends CombatUpgradeCalculatorFeature {
          constructor() {
            super(ctx);
          }
        }
        CombatUpgradeCalculatorFeatureWithContext;`,
    {CharacterDataService, utils}
  );
}

const CombatUpgradeCalculatorFeature = loadCombatUpgradeCalculatorFeature();

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
