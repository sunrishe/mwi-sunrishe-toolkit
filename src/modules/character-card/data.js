// character-card-skill-data
const characterCardSkillData = {
  getSkillProgress(characterObj, skillKeyOrHrid, data = null, allowLegacyPower = false) {
    const {utils} = this.ctx;
    const skillHrid = String(skillKeyOrHrid || '').startsWith('/skills/')
      ? String(skillKeyOrHrid)
      : `/skills/${skillKeyOrHrid}`;
    const key = utils.substrLastSlash(skillHrid);
    const directKeys = [
      `${key}Level`
    ];
    if (allowLegacyPower && key === 'melee') directKeys.push('powerLevel');
    for (const directKey of directKeys) {
      const directLevel = Number(characterObj?.[directKey]);
      if (Number.isFinite(directLevel)) return {level: directLevel, source: directKey};
    }

    const characterSkills = data?.characterSkills || characterObj?.characterSkills || [];
    let skill = characterSkills.find((item) => item?.skillHrid === skillHrid);
    if (!skill && allowLegacyPower && key === 'melee') {
      skill = characterSkills.find((item) => item?.skillHrid === '/skills/power');
    }
    if (!skill) return null;
    const level = Number(skill.level);
    return Number.isFinite(level) ? {...skill, level} : null;
  },

  getSkillLevel(characterObj, skillKeyOrHrid, options = {}) {
    const progress = this.getSkillProgress(
      characterObj,
      skillKeyOrHrid,
      options.data || null,
      Boolean(options.allowLegacyPower)
    );
    if (!progress) {
      if (Object.prototype.hasOwnProperty.call(options, 'missingValue')) {
        return options.missingValue;
      }
      return 0;
    }
    return options.floor ? Math.floor(progress.level) : progress.level;
  }
};

export function getCharacterCardCombatLevels(characterSkills, CardDataAdapter) {
  return {
    staminaLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/stamina'))?.level || 0,
    intelligenceLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/intelligence'))?.level || 0,
    attackLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/attack'))?.level || 0,
    meleeLevel: CardDataAdapter.getSkillLevel({characterSkills}, 'melee', {allowLegacyPower: true}),
    defenseLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/defense'))?.level || 0,
    rangedLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/ranged'))?.level || 0,
    magicLevel: characterSkills.find((skill) => skill.skillHrid.includes('/skills/magic'))?.level || 0
  };
}

// character-card-ws-data-adapter
const characterCardWsDataAdapter = {
  fromCharacterData(parsedData) {
    const {DataHub, i18n} = this.ctx;
    const combatLevel = parsedData.combatUnit?.combatDetails?.combatLevel;
    const equipment = (parsedData.characterItems || [])
      .filter((item) => item.itemLocationHrid && item.itemLocationHrid !== '/item_locations/inventory')
      .map((item) => ({
        itemLocationHrid: item.itemLocationHrid,
        itemHrid: item.itemHrid,
        enhancementLevel: item.enhancementLevel || 0,
        count: item.count || 1
      }));
    const characterSkills = (parsedData.characterSkills || []).map((skill) => ({
      skillHrid: skill.skillHrid,
      level: skill.level || 0
    }));
    const abilities = (parsedData.characterAbilities || []).map((ability) => ({
      abilityHrid: ability.abilityHrid,
      level: ability.level || 0,
      slotNumber: ability.slotNumber || 0
    }));
    return {
      player: {
        name: parsedData.character?.name || parsedData.characterName || parsedData.name || i18n.t('characterFallback'),
        specialChatIconHrid: parsedData.character?.specialChatIconHrid || '',
        chatIconHrid: parsedData.character?.chatIconHrid || '',
        nameColorHrid: parsedData.character?.nameColorHrid || '',
        gameMode: parsedData.character?.gameMode || '',
        equipment,
        characterItems: equipment,
        combatLevel,
        ...getCharacterCardCombatLevels(characterSkills, this)
      },
      abilities,
      characterSkills,
      houseRooms: parsedData.characterHouseRoomMap || {},
      characterHouseRoomMap: parsedData.characterHouseRoomMap || {},
      characterGuildBuffMap: parsedData.characterGuildBuffMap || {},
      // 公会建筑等级（含神龛等级），用于着装评分按游戏规则取增益生效等级较小值。
      guildBuildingLevelMap: parsedData.guildBuildingLevelMap || {},
      dataTimestamp: DataHub.characterData.updatedAt || Date.now()
    };
  }
};

// character-card-profile-data-adapter
const characterCardProfileDataAdapter = {
  fromProfile(profileStoredObj) {
    const {i18n} = this.ctx;
    try {
      const profile = profileStoredObj.profile;
      const characterName =
        profileStoredObj.characterName || profile?.sharableCharacter?.name || i18n.t('characterFallback');
      const wearableMap = profile?.wearableItemMap || {};
      const equipment = Object.values(wearableMap || {})
        .filter(Boolean)
        .map((item) => ({
          itemLocationHrid: item.itemLocationHrid,
          itemHrid: item.itemHrid,
          enhancementLevel: item.enhancementLevel || 0,
          count: item.count || 1
        }));
      const sharableCharacter = profile?.sharableCharacter || {};
      const characterSkills = (profile?.characterSkills || []).map((skill) => ({
        skillHrid: skill.skillHrid,
        level: skill.level
      }));
      const abilities = (profile?.equippedAbilities || []).map((ability) => ({
        abilityHrid: ability?.abilityHrid || '',
        level: ability?.level || 1,
        slotNumber: ability?.slotNumber || 0
      }));
      const houseMapRaw = profile?.characterHouseRoomMap || {};
      const houseRooms = {};
      try {
        Object.entries(houseMapRaw).forEach(
          ([
            hrid, houseRoom
          ]) => {
            // 兼容存储裁剪后的 {houseRoomHrid: level} 紧凑格式。
            if (houseRoom && typeof houseRoom === 'object') {
              if (houseRoom.houseRoomHrid) houseRooms[houseRoom.houseRoomHrid] = houseRoom.level || 0;
            } else if (String(hrid).startsWith('/house_rooms/')) {
              houseRooms[hrid] = houseRoom || 0;
            }
          }
        );
      } catch {}
      return {
        player: {
          name: characterName,
          specialChatIconHrid: sharableCharacter.specialChatIconHrid || '',
          chatIconHrid: sharableCharacter.chatIconHrid || '',
          nameColorHrid: sharableCharacter.nameColorHrid || '',
          gameMode: sharableCharacter.gameMode || '',
          equipment,
          characterItems: equipment,
          combatLevel: profile?.combatLevel,
          ...getCharacterCardCombatLevels(characterSkills, this)
        },
        abilities,
        characterSkills,
        houseRooms,
        characterHouseRoomMap: houseMapRaw,
        characterGuildBuffMap: profile?.guildBuffLevelMap || profile?.characterGuildBuffMap || {},
        hideWearableItems: Boolean(profile?.hideWearableItems),
        dataTimestamp: Number(profileStoredObj.timestamp || 0)
      };
    } catch (e) {
      console.warn('CardDataAdapter.fromProfile 失败:', e);
      return null;
    }
  },

  fromLimitedCharacter(characterID) {
    const {DataHub, i18n} = this.ctx;
    const sharableCharacter = DataHub.getSharableCharacter(characterID);
    const battleUnit = DataHub.getBattleUnit(characterID);
    if (!sharableCharacter && !battleUnit) return null;
    const details = battleUnit?.combatDetails;
    const abilities = Array.isArray(battleUnit?.combatAbilities) ? battleUnit.combatAbilities : [];
    return {
      player: {
        name: sharableCharacter?.name || battleUnit?.character?.name || battleUnit?.name || i18n.t('characterFallback'),
        specialChatIconHrid: sharableCharacter?.specialChatIconHrid || '',
        chatIconHrid: sharableCharacter?.chatIconHrid || '',
        nameColorHrid: sharableCharacter?.nameColorHrid || '',
        gameMode: sharableCharacter?.gameMode || '',
        combatLevel: details?.combatLevel
      },
      abilities,
      characterSkills: [],
      houseRooms: {},
      characterHouseRoomMap: {},
      identityAvailable: Boolean(sharableCharacter),
      limitedProfile: true,
      dataAvailability: {
        equipment: false,
        combat: Boolean(details),
        combatSkills: false,
        abilities: Boolean(battleUnit),
        house: false
      },
      dataTimestamp: DataHub.characterData.updatedAt || Date.now()
    };
  },

  mergeProfile(profileStoredObj) {
    const profileData = this.fromProfile(profileStoredObj);
    if (!profileData) return null;
    const memoryData = this.fromLimitedCharacter(profileStoredObj.characterID);
    if (!memoryData) return profileData;

    let usedMemoryData = false;
    const player = {...profileData.player};
    const memoryName = memoryData.player?.name;
    if (memoryName && memoryName !== player.name) {
      player.name = memoryName;
      usedMemoryData = true;
    }
    for (const key of [
      'specialChatIconHrid', 'chatIconHrid', 'nameColorHrid', 'gameMode'
    ]) {
      if (memoryData.identityAvailable && player[key] !== memoryData.player?.[key]) {
        player[key] = memoryData.player[key];
        usedMemoryData = true;
      }
    }
    for (const key of [
      'combatLevel', 'staminaLevel', 'intelligenceLevel', 'attackLevel', 'defenseLevel',
      'meleeLevel', 'rangedLevel', 'magicLevel'
    ]) {
      if (player[key] == null && memoryData.player?.[key] != null) {
        player[key] = memoryData.player[key];
        usedMemoryData = true;
      }
    }
    const abilities = profileData.abilities?.length ? profileData.abilities : memoryData.abilities;
    if (!profileData.abilities?.length && memoryData.abilities?.length) usedMemoryData = true;
    const merged = {...profileData, player, abilities};
    if (usedMemoryData && !merged.dataTimestamp) merged.dataTimestamp = Number(memoryData.dataTimestamp || 0);
    return merged;
  }
};

// character-card-loadout-data-adapter
const characterCardLoadoutDataAdapter = {
  fromLoadout(loadout) {
    const {DataHub} = this.ctx;
    const raw = DataHub.characterData.raw;
    if (!raw || !loadout) return null;
    const data = this.fromCharacterData(raw);
    const currentTools = (data.player.equipment || []).filter((item) =>
      String(item.itemLocationHrid || '').endsWith('_tool')
    );
    const itemByHash = new Map(
      (raw.characterItems || []).map((item) => [
        item?.hash, item
      ])
    );
    const equipment = Object.entries(loadout.wearableMap || {}).flatMap(
      ([
        itemLocationHrid, hash
      ]) => {
        if (!hash) return [];
        const item = itemByHash.get(hash);
        if (item) {
          return [
            {itemLocationHrid, itemHrid: item.itemHrid, enhancementLevel: item.enhancementLevel || 0}
          ];
        }
        const parts = String(hash).split('::');
        const itemHrid = parts.find((part) => part.startsWith('/items/')) || '';
        if (!itemHrid) return [];
        return [
          {itemLocationHrid, itemHrid, enhancementLevel: Number(parts[parts.length - 1] || 0)}
        ];
      }
    );
    const loadoutLocations = new Set(equipment.map((item) => item.itemLocationHrid));
    currentTools.forEach((item) => {
      if (!loadoutLocations.has(item.itemLocationHrid)) equipment.push(item);
    });
    const abilityByHrid = new Map(
      (raw.characterAbilities || []).map((ability) => [
        ability?.abilityHrid, ability
      ])
    );
    const abilities = Object.entries(loadout.abilityMap || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .flatMap(
        ([
          slotNumber, abilityHrid
        ]) => {
          if (!abilityHrid) return [];
          const ability = abilityByHrid.get(abilityHrid);
          return [
            {abilityHrid, level: ability?.level || 1, slotNumber: Number(slotNumber)}
          ];
        }
      );
    data.player.equipment = equipment;
    data.player.characterItems = equipment;
    // 战斗配装使用配装中的技能；生活配装没有技能配置，保留角色当前已配置技能。
    if (loadout.actionTypeHrid === '/action_types/combat') data.abilities = abilities;
    data.dataTimestamp = DataHub.characterData.updatedAt || Date.now();
    return data;
  }
};

// character-card-data-adapter
export function createCharacterCardDataAdapter(ctx) {
  const CardDataAdapter = {ctx};
  Object.assign(
    CardDataAdapter,
    characterCardSkillData,
    characterCardWsDataAdapter,
    characterCardProfileDataAdapter,
    characterCardLoadoutDataAdapter
  );
  Object.entries(CardDataAdapter).forEach(
    ([
      key, value
    ]) => {
      if (typeof value === 'function') CardDataAdapter[key] = value.bind(CardDataAdapter);
    }
  );

  return CardDataAdapter;
}
