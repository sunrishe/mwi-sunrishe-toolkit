// 战斗模拟器导入的纯计算部分：把游戏角色快照 / 队友资料转换成 aiwwb 战斗模拟器的组队导入 JSON。
// 数据口径与 MWITools external-tools 保持一致，并按官方规则补充神龛字段：
// 神龛增益是永久性个人增益，实际生效等级 = min(个人对应增益等级, 公会对应神龛等级)。

// 模拟器只内置 5 个战斗神龛输入框（data-shrine-hrid），超出会找不到输入框导致导入报错，
// 因此这里静态维护“游戏公会增益 → 模拟器神龛”映射，生活向增益不参与战斗模拟。
export const SIM_SHRINE_MAP = {
  '/guild_buffs/force_combat': {simShrineHrid: '/shrines/power', gameShrineHrid: '/guild_shrines/force'},
  '/guild_buffs/tempo_combat': {simShrineHrid: '/shrines/rhythm', gameShrineHrid: '/guild_shrines/tempo'},
  '/guild_buffs/spirit_combat': {simShrineHrid: '/shrines/spirit', gameShrineHrid: '/guild_shrines/spirit'},
  '/guild_buffs/rarity_combat': {simShrineHrid: '/shrines/rare', gameShrineHrid: '/guild_shrines/rarity'},
  '/guild_buffs/scholar_combat': {simShrineHrid: '/shrines/scholar', gameShrineHrid: '/guild_shrines/scholar'}
};

const COMBAT_SKILL_KEYS = [
  'stamina', 'intelligence', 'attack', 'melee', 'defense',
  'ranged', 'magic'
];

function toPositiveInt(value) {
  const level = Number(value);
  return Number.isSafeInteger(level) && level > 0 ? level : 0;
}

// 个人公会增益等级：兼容官方对象结构（hrid → {level}）与资料分享的数字结构（hrid → level）。
function readGuildBuffLevel(guildBuffMap, guildBuffHrid) {
  const record = guildBuffMap?.[guildBuffHrid];
  if (record == null) return 0;
  return toPositiveInt(typeof record === 'object' ? record.level : record);
}

// 计算战斗神龛生效等级：min(个人增益等级, 公会神龛等级)。
// 公会神龛建筑等级缺失时（如跨公会拿不到对方公会数据）按 MWITools v26 口径退回个人等级。
export function computeShrineLevels({characterGuildBuffMap, guildBuildingLevelMap}) {
  const shrines = {};
  if (!characterGuildBuffMap || typeof characterGuildBuffMap !== 'object') return shrines;
  for (const [
    guildBuffHrid, mapping
  ] of Object.entries(SIM_SHRINE_MAP)) {
    const buffLevel = readGuildBuffLevel(characterGuildBuffMap, guildBuffHrid);
    if (!buffLevel) continue;
    const shrineLevel = toPositiveInt(guildBuildingLevelMap?.[mapping.gameShrineHrid]);
    const effectiveLevel = shrineLevel > 0 ? Math.min(buffLevel, shrineLevel) : buffLevel;
    if (effectiveLevel > 0) shrines[mapping.simShrineHrid] = effectiveLevel;
  }
  return shrines;
}

function buildCombatLevels(characterSkills) {
  const levels = {};
  for (const skill of characterSkills || []) {
    const hrid = String(skill?.skillHrid || '');
    for (const key of COMBAT_SKILL_KEYS) {
      if (hrid.includes(key)) levels[`${key}Level`] = skill.level;
    }
  }
  return levels;
}

function buildConsumableSlots(slots) {
  return (slots || []).map((slot) => ({itemHrid: slot?.itemHrid || ''}));
}

function buildAbilities(abilities, abilityDetailMap) {
  const result = [
    {
      abilityHrid: '',
      level: '1'
    }, {abilityHrid: '', level: '1'}, {abilityHrid: '', level: '1'}, {abilityHrid: '', level: '1'}, {
      abilityHrid: '',
      level: '1'
    }
  ];
  let normalIndex = 1;
  for (const ability of abilities || []) {
    if (!ability?.abilityHrid) continue;
    if (abilityDetailMap?.[ability.abilityHrid]?.isSpecialAbility) {
      result[0] = {abilityHrid: ability.abilityHrid, level: ability.level};
    } else {
      result[normalIndex++] = {abilityHrid: ability.abilityHrid, level: ability.level};
    }
  }
  return result;
}

function buildHouseRooms(characterHouseRoomMap) {
  const houseRooms = {};
  for (const [
    hrid, room
  ] of Object.entries(characterHouseRoomMap || {})) {
    // 兼容官方结构（hrid → {houseRoomHrid, level}）与存储裁剪后的紧凑结构（hrid → level）。
    if (room && typeof room === 'object') {
      if (room.houseRoomHrid) houseRooms[room.houseRoomHrid] = room.level;
    } else if (String(hrid).startsWith('/house_rooms/')) {
      houseRooms[hrid] = room;
    }
  }
  return houseRooms;
}

function buildAchievements(characterAchievements) {
  const achievements = {};
  for (const achievement of Object.values(characterAchievements || {})) {
    if (achievement?.achievementHrid) {
      achievements[achievement.achievementHrid] = achievement.isCompleted;
    }
  }
  return achievements;
}

// 本人：来自 init_character_data 完整快照；abilityDetailMap 取自客户端字典裁剪版。
export function buildSelfPlayerExport(characterData, abilityDetailMap) {
  const combatUnitAbilities = Array.isArray(characterData?.combatUnit?.combatAbilities)
    ? characterData.combatUnit.combatAbilities
    : characterData?.characterAbilities || [];
  return {
    player: {
      ...buildCombatLevels(characterData?.characterSkills),
      equipment: (characterData?.characterItems || [])
        .filter((item) => !String(item?.itemLocationHrid || '').includes('/item_locations/inventory'))
        .map((item) => ({
          itemLocationHrid: item.itemLocationHrid,
          itemHrid: item.itemHrid,
          enhancementLevel: item.enhancementLevel
        }))
    },
    food: {
      '/action_types/combat': buildConsumableSlots(characterData?.actionTypeFoodSlotsMap?.['/action_types/combat'])
    },
    drinks: {
      '/action_types/combat': buildConsumableSlots(characterData?.actionTypeDrinkSlotsMap?.['/action_types/combat'])
    },
    abilities: buildAbilities(combatUnitAbilities, abilityDetailMap),
    triggerMap: {
      ...characterData?.abilityCombatTriggersMap,
      ...characterData?.consumableCombatTriggersMap
    },
    houseRooms: buildHouseRooms(characterData?.characterHouseRoomMap),
    achievements: buildAchievements(characterData?.characterAchievements),
    shrines: computeShrineLevels({
      characterGuildBuffMap: characterData?.characterGuildBuffMap,
      guildBuildingLevelMap: characterData?.guildBuildingLevelMap
    })
  };
}

// 无战斗快照时的默认消耗品：按主手/双手武器类型给一套通用配装（沿用 MWITools 兜底表）。
function guessConsumablesByWeapon(wearableItemMap) {
  const weapon =
    wearableItemMap?.['/item_locations/main_hand']?.itemHrid ||
    wearableItemMap?.['/item_locations/two_hand']?.itemHrid ||
    '';
  const drinks = [
    '/items/wisdom_coffee', '/items/super_melee_coffee', '/items/swiftness_coffee'
  ];
  const food = [
    '/items/spaceberry_donut', '/items/spaceberry_cake', '/items/star_fruit_yogurt'
  ];
  if (weapon.includes('shooter') || weapon.includes('bow')) {
    drinks.splice(1, 2, '/items/super_ranged_coffee', '/items/critical_coffee');
  } else if (weapon.includes('boomstick') || weapon.includes('staff') || weapon.includes('trident')) {
    drinks.splice(1, 2, '/items/super_magic_coffee', '/items/channeling_coffee');
    food.splice(0, 1, '/items/star_fruit_gummy');
  } else if (weapon.includes('bulwark')) {
    drinks.splice(1, 2, '/items/super_defense_coffee', '/items/super_stamina_coffee');
  }
  return {
    drinks: drinks.map((itemHrid) => ({itemHrid})),
    food: food.map((itemHrid) => ({itemHrid}))
  };
}

// 队友：来自 profile_shared 资料 + new_battle 战斗快照（唯一能拿到队友实际消耗品的来源）。
// shrineSource 覆盖默认神龛数据来源（同公会时用本人快照的公会建筑等级）。
export function buildProfilePlayerExport(profile, battlePlayer, abilityDetailMap, shrineSource = null) {
  const wearableItemMap = profile?.wearableItemMap || {};
  const food = [];
  const drinks = [];
  if (Array.isArray(battlePlayer?.combatConsumables)) {
    for (const consumable of battlePlayer.combatConsumables) {
      const target = String(consumable?.itemHrid || '').includes('coffee') ? drinks : food;
      target.push({itemHrid: consumable.itemHrid});
    }
  } else {
    const guessed = guessConsumablesByWeapon(wearableItemMap);
    drinks.push(...guessed.drinks);
    food.push(...guessed.food);
  }
  return {
    player: {
      ...buildCombatLevels(profile?.characterSkills),
      equipment: Object.values(wearableItemMap)
        .filter((item) => item?.itemHrid)
        .map((item) => ({
          itemLocationHrid: item.itemLocationHrid,
          itemHrid: item.itemHrid,
          enhancementLevel: item.enhancementLevel
        }))
    },
    food: {'/action_types/combat': food},
    drinks: {'/action_types/combat': drinks},
    abilities: buildAbilities(profile?.equippedAbilities, abilityDetailMap),
    ...(profile?.abilityCombatTriggersMap && profile?.consumableCombatTriggersMap
      ? {
          triggerMap: {
            ...profile.abilityCombatTriggersMap,
            ...profile.consumableCombatTriggersMap
          }
        }
      : {}),
    houseRooms: buildHouseRooms(profile?.characterHouseRoomMap),
    achievements: buildAchievements(profile?.characterAchievements),
    shrines: computeShrineLevels(
      shrineSource || {
        characterGuildBuffMap: profile?.guildBuffLevelMap,
        guildBuildingLevelMap: profile?.guildBuildingLevelMap
      }
    )
  };
}

const BLANK_PLAYER_JSON =
  '{"player":{"attackLevel":1,"magicLevel":1,"meleeLevel":1,"rangedLevel":1,"defenseLevel":1,"staminaLevel":1,"intelligenceLevel":1,"equipment":[]},"food":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"drinks":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"abilities":[{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"}],"triggerMap":{},"zone":"/actions/combat/fly","simulationTime":"100","houseRooms":{},"achievements":{},"shrines":{}}';

// 组队导出总装：返回模拟器导入所需的全部信息。
// 队友神龛的“公会神龛等级”只有在与本人同公会时才可知（复用本人快照的公会建筑等级）；
// 跨公会拿不到对方公会数据，按 MWITools v26 口径退回个人增益等级。
export function buildGroupExport({characterData, clientData, newBattle, profiles}) {
  const exportObj = {
    1: BLANK_PLAYER_JSON,
    2: BLANK_PLAYER_JSON,
    3: BLANK_PLAYER_JSON,
    4: BLANK_PLAYER_JSON,
    5: BLANK_PLAYER_JSON
  };
  const playerIDs = [
    'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'
  ];
  const importedPlayerPositions = [
    false, false, false, false, false
  ];
  let isParty = false;
  let zone = '/actions/combat/fly';
  let isZoneDungeon = false;
  let difficultyTier = 0;

  const partySlotMap = characterData?.partyInfo?.partySlotMap;
  const abilityDetailMap = clientData?.abilityDetailMap;
  const ownGuildId = characterData?.guild?.id ?? null;
  const ownGuildBuildingLevelMap = characterData?.guildBuildingLevelMap || {};
  const resolveProfileShrineSource = (profile) => {
    const sameGuild = profile?.guildId != null && profile.guildId === ownGuildId;
    return {
      characterGuildBuffMap: profile?.guildBuffLevelMap,
      guildBuildingLevelMap: sameGuild ? ownGuildBuildingLevelMap : undefined
    };
  };
  if (!partySlotMap || !Object.keys(partySlotMap).length) {
    exportObj[1] = JSON.stringify(buildSelfPlayerExport(characterData, abilityDetailMap));
    playerIDs[0] = characterData?.character?.name || playerIDs[0];
    importedPlayerPositions[0] = true;
    for (const action of characterData?.characterActions || []) {
      if (action && String(action.actionHrid || '').includes('/actions/combat/')) {
        zone = action.actionHrid;
        difficultyTier = action.difficultyTier;
        isZoneDungeon = Boolean(clientData?.actionDetailMap?.[zone]?.combatZoneInfo?.isDungeon);
        break;
      }
    }
  } else {
    isParty = true;
    let slot = 1;
    for (const member of Object.values(partySlotMap)) {
      if (member?.characterID) {
        if (member.characterID === characterData?.character?.id) {
          exportObj[slot] = JSON.stringify(buildSelfPlayerExport(characterData, abilityDetailMap));
          playerIDs[slot - 1] = characterData?.character?.name || playerIDs[slot - 1];
          importedPlayerPositions[slot - 1] = true;
        } else {
          const profile = profiles?.[String(member.characterID)] || null;
          if (!profile) {
            playerIDs[slot - 1] = 'NEED_PROFILE';
          } else {
            const battlePlayers = Array.isArray(newBattle?.players) ? newBattle.players : [];
            const battlePlayer = battlePlayers.find((item) => item?.character?.id === member.characterID) ?? null;
            exportObj[slot] = JSON.stringify(
              buildProfilePlayerExport(
                profile.profile,
                battlePlayer,
                abilityDetailMap,
                resolveProfileShrineSource(profile.profile)
              )
            );
            playerIDs[slot - 1] = profile.characterName || playerIDs[slot - 1];
            importedPlayerPositions[slot - 1] = true;
          }
        }
      }
      slot++;
    }
    zone = characterData?.partyInfo?.party?.actionHrid || zone;
    difficultyTier = characterData?.partyInfo?.party?.difficultyTier ?? difficultyTier;
    isZoneDungeon = Boolean(clientData?.actionDetailMap?.[zone]?.combatZoneInfo?.isDungeon);
  }
  return {exportObj, playerIDs, importedPlayerPositions, zone, difficultyTier, isZoneDungeon, isParty};
}
