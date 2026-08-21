'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const runtimeSource = readRuntimeSource();
const builderSourceFile = readSourceFile('src', 'modules', 'combat-sim-import', 'export-builder.js');
const moduleSourceFile = readSourceFile('src', 'modules', 'combat-sim-import', 'index.js');
const mainSourceFile = readSourceFile('src', 'app', 'main.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const dataSourceFile = readSourceFile('src', 'common', 'data.js');
const headerSourceFile = readSourceFile('userscript-header.txt');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');

function loadBuilder() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/combat-sim-import/export-builder.js')}
      ({computeShrineLevels, buildSelfPlayerExport, buildProfilePlayerExport, buildGroupExport, SIM_SHRINE_MAP});`,
    {}
  );
}

// VM 产物来自另一个 realm，深比较前归一化为普通对象。
function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('战斗模拟导入：神龛生效等级取个人增益等级与公会神龛等级的较小值', () => {
  const {computeShrineLevels} = loadBuilder();
  const shrines = computeShrineLevels({
    characterGuildBuffMap: {
      '/guild_buffs/force_combat': {level: 3},
      '/guild_buffs/tempo_combat': 5,
      '/guild_buffs/spirit_combat': {level: 1}
    },
    guildBuildingLevelMap: {
      '/guild_shrines/force': 2,
      '/guild_shrines/tempo': 8,
      '/guild_shrines/spirit': 4
    }
  });
  assert.deepEqual(normalize(shrines), {
    '/shrines/power': 2,
    '/shrines/rhythm': 5,
    '/shrines/spirit': 1
  });
});

test('战斗模拟导入：公会建筑缺失时退回个人等级，生活向增益与零级不输出', () => {
  const {computeShrineLevels} = loadBuilder();
  const shrines = computeShrineLevels({
    characterGuildBuffMap: {
      '/guild_buffs/scholar_combat': {level: 6},
      '/guild_buffs/rarity_combat': {level: 0},
      '/guild_buffs/force_skilling': {level: 7}
    },
    guildBuildingLevelMap: {}
  });
  assert.deepEqual(normalize(shrines), {'/shrines/scholar': 6});
  assert.deepEqual(normalize(computeShrineLevels({characterGuildBuffMap: null})), {});
});

test('战斗模拟导入：本人导出包含技能、装备、消耗品、技能槽与神龛字段', () => {
  const {buildSelfPlayerExport} = loadBuilder();
  const characterData = {
    character: {id: 42, name: 'tester'},
    characterSkills: [
      {
        skillHrid: '/skills/stamina',
        level: 50
      }, {skillHrid: '/skills/melee', level: 60}, {skillHrid: '/skills/magic', level: 55}
    ],
    characterItems: [
      {
        itemLocationHrid: '/item_locations/main_hand',
        itemHrid: '/items/sword',
        enhancementLevel: 12
      }, {itemLocationHrid: '/item_locations/inventory', itemHrid: '/items/potion', enhancementLevel: 0}
    ],
    actionTypeFoodSlotsMap: {'/action_types/combat': [
        {itemHrid: '/items/cake'}, null
      ]},
    actionTypeDrinkSlotsMap: {'/action_types/combat': [
        {itemHrid: '/items/coffee'}
      ]},
    combatUnit: {
      combatAbilities: [
        {abilityHrid: '/abilities/mystic_aura', level: 4}, {abilityHrid: '/abilities/fireball', level: 7}
      ]
    },
    abilityCombatTriggersMap: {a: 1},
    consumableCombatTriggersMap: {b: 2},
    characterHouseRoomMap: {'/house_rooms/dojo': {houseRoomHrid: '/house_rooms/dojo', level: 5}},
    characterAchievements: {'/achievements/combat_1': {achievementHrid: '/achievements/combat_1', isCompleted: true}},
    characterGuildBuffMap: {'/guild_buffs/force_combat': {level: 3}},
    guildBuildingLevelMap: {'/guild_shrines/force': 2}
  };
  const abilityDetailMap = {
    '/abilities/mystic_aura': {isSpecialAbility: true},
    '/abilities/fireball': {isSpecialAbility: false}
  };
  const exported = normalize(buildSelfPlayerExport(characterData, abilityDetailMap));
  assert.equal(exported.player.meleeLevel, 60);
  assert.equal(exported.player.magicLevel, 55);
  assert.equal(exported.player.staminaLevel, 50);
  assert.deepEqual(exported.player.equipment, [
    {itemLocationHrid: '/item_locations/main_hand', itemHrid: '/items/sword', enhancementLevel: 12}
  ]);
  assert.deepEqual(exported.food['/action_types/combat'], [
    {itemHrid: '/items/cake'}, {itemHrid: ''}
  ]);
  assert.deepEqual(exported.drinks['/action_types/combat'], [
    {itemHrid: '/items/coffee'}
  ]);
  // 特殊技能固定占 abilities[0]，普通技能从下标 1 顺排。
  assert.equal(exported.abilities[0].abilityHrid, '/abilities/mystic_aura');
  assert.equal(exported.abilities[1].abilityHrid, '/abilities/fireball');
  assert.deepEqual(exported.triggerMap, {a: 1, b: 2});
  assert.deepEqual(exported.houseRooms, {'/house_rooms/dojo': 5});
  assert.deepEqual(exported.achievements, {'/achievements/combat_1': true});
  assert.deepEqual(exported.shrines, {'/shrines/power': 2});
});

test('战斗模拟导入：队友消耗品优先取战斗快照，咖啡归饮料其余归食物', () => {
  const {buildProfilePlayerExport} = loadBuilder();
  const profile = {
    characterSkills: [
      {skillHrid: '/skills/ranged', level: 48}
    ],
    wearableItemMap: {
      '/item_locations/main_hand': {
        itemHrid: '/items/bow',
        itemLocationHrid: '/item_locations/main_hand',
        enhancementLevel: 3
      }
    },
    equippedAbilities: [
      {abilityHrid: '/abilities/quick_shot', level: 5}
    ],
    characterHouseRoomMap: {'/house_rooms/gym': 3},
    characterAchievements: {},
    guildBuffLevelMap: {'/guild_buffs/tempo_combat': 4}
  };
  const battlePlayer = {
    combatConsumables: [
      {itemHrid: '/items/wisdom_coffee'}, {itemHrid: '/items/spaceberry_cake'}
    ]
  };
  const exported = normalize(buildProfilePlayerExport(profile, battlePlayer, {}, null));
  assert.equal(exported.player.rangedLevel, 48);
  assert.deepEqual(exported.drinks['/action_types/combat'], [
    {itemHrid: '/items/wisdom_coffee'}
  ]);
  assert.deepEqual(exported.food['/action_types/combat'], [
    {itemHrid: '/items/spaceberry_cake'}
  ]);
  assert.deepEqual(exported.shrines, {'/shrines/rhythm': 4});
});

test('战斗模拟导入：无战斗快照时按武器类型给默认消耗品', () => {
  const {buildProfilePlayerExport} = loadBuilder();
  const profile = {
    characterSkills: [],
    wearableItemMap: {
      '/item_locations/two_hand': {itemHrid: '/items/holy_staff', itemLocationHrid: '/item_locations/two_hand'}
    },
    equippedAbilities: []
  };
  const exported = normalize(buildProfilePlayerExport(profile, null, {}, null));
  const drinkHrids = exported.drinks['/action_types/combat'].map((item) => item.itemHrid);
  assert.ok(drinkHrids.includes('/items/super_magic_coffee'));
  assert.ok(drinkHrids.includes('/items/channeling_coffee'));
});

test('战斗模拟导入：单人导出从角色行动反查地图并只填槽位一', () => {
  const {buildGroupExport} = loadBuilder();
  const result = normalize(
    buildGroupExport({
      characterData: {
        character: {id: 42, name: 'tester'},
        partyInfo: {},
        characterActions: [
          {
            actionHrid: '/actions/foraging/foraging',
            difficultyTier: 0
          }, {actionHrid: '/actions/combat/golem_cave', difficultyTier: 3}
        ]
      },
      clientData: {actionDetailMap: {'/actions/combat/golem_cave': {combatZoneInfo: {isDungeon: true}}}},
      newBattle: null,
      profiles: {}
    })
  );
  assert.equal(result.isParty, false);
  assert.equal(result.zone, '/actions/combat/golem_cave');
  assert.equal(result.difficultyTier, 3);
  assert.equal(result.isZoneDungeon, true);
  assert.deepEqual(result.importedPlayerPositions, [
    true, false, false, false, false
  ]);
  const firstPlayer = JSON.parse(result.exportObj[1]);
  assert.deepEqual(firstPlayer.shrines, {});
  assert.ok(result.exportObj[2].includes('"shrines":{}'));
});

test('战斗模拟导入：组队按槽位填充本人与队友，缺资料时标记需要点开资料', () => {
  const {buildGroupExport} = loadBuilder();
  const characterData = {
    character: {id: 42, name: 'tester'},
    guild: {id: 7},
    guildBuildingLevelMap: {'/guild_shrines/force': 2},
    characterGuildBuffMap: {'/guild_buffs/force_combat': {level: 3}},
    characterSkills: [],
    characterItems: [],
    combatUnit: {combatAbilities: []},
    partyInfo: {
      party: {actionHrid: '/actions/combat/golem_cave', difficultyTier: 4},
      partySlotMap: {
        a: {characterID: 100},
        b: {characterID: 42},
        c: {characterID: 200}
      }
    }
  };
  const profiles = {
    100: {
      characterID: '100',
      characterName: 'alice',
      profile: {
        guildId: 7,
        characterSkills: [],
        wearableItemMap: {},
        equippedAbilities: [],
        guildBuffLevelMap: {'/guild_buffs/force_combat': 5}
      }
    }
  };
  const result = normalize(buildGroupExport({characterData, clientData: {}, newBattle: null, profiles}));
  assert.equal(result.isParty, true);
  assert.equal(result.zone, '/actions/combat/golem_cave');
  assert.equal(result.difficultyTier, 4);
  assert.deepEqual(result.importedPlayerPositions, [
    true, true, false, false, false
  ]);
  assert.equal(result.playerIDs[0], 'alice');
  assert.equal(result.playerIDs[1], 'tester');
  assert.equal(result.playerIDs[2], 'NEED_PROFILE');
  // 同公会队友：生效等级 = min(个人 5, 公会建筑 2)。
  assert.deepEqual(JSON.parse(result.exportObj[1]).shrines, {'/shrines/power': 2});
  // 本人：生效等级 = min(个人 3, 公会建筑 2)。
  assert.deepEqual(JSON.parse(result.exportObj[2]).shrines, {'/shrines/power': 2});
});

test('战斗模拟导入：跨公会队友拿不到公会建筑等级时退回个人等级', () => {
  const {buildGroupExport} = loadBuilder();
  const characterData = {
    character: {id: 42, name: 'tester'},
    guild: {id: 7},
    guildBuildingLevelMap: {'/guild_shrines/force': 2},
    characterSkills: [],
    characterItems: [],
    combatUnit: {combatAbilities: []},
    partyInfo: {
      party: {actionHrid: '/actions/combat/fly', difficultyTier: 0},
      partySlotMap: {a: {characterID: 300}}
    }
  };
  const profiles = {
    300: {
      characterID: '300',
      characterName: 'carol',
      profile: {
        guildId: 9,
        characterSkills: [],
        wearableItemMap: {},
        equippedAbilities: [],
        guildBuffLevelMap: {'/guild_buffs/force_combat': 5}
      }
    }
  };
  const result = normalize(buildGroupExport({characterData, clientData: {}, newBattle: null, profiles}));
  assert.deepEqual(JSON.parse(result.exportObj[1]).shrines, {'/shrines/power': 5});
});

test('战斗模拟导入：装配链路覆盖测试服分流、站点匹配与存储键', () => {
  // CONFIG 提供测试服与模拟器站判断。
  assert.match(mainSourceFile, /isTestServer:\s*hostname\.startsWith\('test\.'\)/);
  assert.match(mainSourceFile, /isCombatSimSite:\s*hostname === 'aiwwb\.github\.io'/);
  // 头部匹配模拟器站点。
  assert.match(headerSourceFile, /@match\s+https:\/\/aiwwb\.github\.io\/milkywayidle_battle\/\*/);
  // bootstrap 分流：游戏站（非测试服）写入数据，模拟器站注入按钮。
  assert.match(appControllerSourceFile, /CONFIG\.isGameSite && !CONFIG\.isTestServer\) \|\| CONFIG\.isCombatSimSite/);
  // 模块 init 内部同样拦截测试服写入。
  assert.match(moduleSourceFile, /!CONFIG\.isGameSite \|\| CONFIG\.isTestServer\) return/);
  // 存储键与战斗消息分发。
  assert.match(dataSourceFile, /SIM_CHARACTER_DATA: 'MST_SIM_characterData'/);
  assert.match(dataSourceFile, /mst:ws:battle-message/);
  // 导出 JSON 携带神龛字段；模块注册进 i18n。
  assert.match(builderSourceFile, /shrines:/);
  assert.match(messagesSourceFile, /combatSimImport:/);
  assert.match(runtimeSource, /CombatSimImportFeature/);
});

test('战斗模拟导入：导入前自动刷新价格，成功后按钮禁用，工具箱入口固定窗口跳转', () => {
  // 与 MWITools 一致：导入前先点击模拟器“获取价格”刷新行情。
  assert.match(moduleSourceFile, /getElementById\('buttonGetPrices'\)\?\.click\(\)/);
  // 导入成功后按钮禁用，避免再次点击重复触发市场请求。
  assert.match(moduleSourceFile, /button\.disabled = true;/);
  // 工具箱菜单在“切换角色”前提供 aiwwb 战斗模拟器入口，window.open 用固定 target 复用窗口。
  const menuStart = runtimeSource.search(/^\s*(?:export\s+)?class ToolkitMenuFeature \{/m);
  assert.ok(menuStart >= 0, '找不到工具箱菜单功能');
  const menuSource = runtimeSource.slice(menuStart);
  assert.ok(menuSource.includes("key: 'combatSimAiwwb'"), '缺少战斗模拟菜单项');
  assert.match(
    menuSource,
    /window\.open\('https:\/\/aiwwb\.github\.io\/milkywayidle_battle\/dist\/',\s*'mst-combat-sim-aiwwb'\)/
  );
});

test('战斗模拟导入：MST 头部布局容器内 MWITools 工具宿主保持靠右', () => {
  // MWITools 会把 #mwitools-header-tools 插到总等级紧后面（即 MST 布局容器内），
  // 其自带居中样式必须被 MST 的更高特异性规则覆盖为靠右。
  const cssSourceFile = readSourceFile('src', 'modules', 'character-card', 'styles.css');
  assert.match(
    cssSourceFile,
    /\.mst-header-card-level-layout > #mwitools-header-tools\s*\{[^}]*justify-content:\s*flex-end/s
  );
  assert.match(
    cssSourceFile,
    /\.mst-header-card-level-layout > #mwitools-header-tools\s*\{[^}]*margin:\s*2px 0 0 auto/s
  );
});
