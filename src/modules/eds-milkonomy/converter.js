// eds-milkonomy-constants
// 与 EDS 的 INCLUDE_ITEMS 和各类同步配置保持一致；装备详情仍使用游戏官方 clientData。
export const EDS_INCLUDE_ITEM_HRIDS = new Set([
  '/items/advanced_alchemy_charm', '/items/advanced_brewing_charm', '/items/advanced_cheesesmithing_charm', '/items/advanced_cooking_charm', '/items/advanced_crafting_charm',
  '/items/advanced_enhancing_charm', '/items/advanced_foraging_charm', '/items/advanced_milking_charm', '/items/advanced_tailoring_charm', '/items/advanced_woodcutting_charm',
  '/items/alchemists_bottoms', '/items/alchemists_top', '/items/artificer_cape', '/items/artificer_cape_refined', '/items/azure_alembic',
  '/items/azure_brush', '/items/azure_chisel', '/items/azure_enhancer', '/items/azure_hammer', '/items/azure_hatchet',
  '/items/azure_needle', '/items/azure_pot', '/items/azure_shears', '/items/azure_spatula', '/items/basic_alchemy_charm',
  '/items/basic_brewing_charm', '/items/basic_cheesesmithing_charm', '/items/basic_cooking_charm', '/items/basic_crafting_charm', '/items/basic_enhancing_charm',
  '/items/basic_foraging_charm', '/items/basic_milking_charm', '/items/basic_tailoring_charm', '/items/basic_woodcutting_charm', '/items/brewers_bottoms',
  '/items/brewers_top', '/items/burble_alembic', '/items/burble_brush', '/items/burble_chisel', '/items/burble_enhancer',
  '/items/burble_hammer', '/items/burble_hatchet', '/items/burble_needle', '/items/burble_pot', '/items/burble_shears',
  '/items/burble_spatula', '/items/celestial_alembic', '/items/celestial_brush', '/items/celestial_chisel', '/items/celestial_enhancer',
  '/items/celestial_hammer', '/items/celestial_hatchet', '/items/celestial_needle', '/items/celestial_pot', '/items/celestial_shears',
  '/items/celestial_spatula', '/items/chance_cape', '/items/chance_cape_refined', '/items/cheese_alembic', '/items/cheese_brush',
  '/items/cheese_chisel', '/items/cheese_enhancer', '/items/cheese_hammer', '/items/cheese_hatchet', '/items/cheese_needle',
  '/items/cheese_pot', '/items/cheese_shears', '/items/cheese_spatula', '/items/cheesemakers_bottoms', '/items/cheesemakers_top',
  '/items/chefs_bottoms', '/items/chefs_top', '/items/collectors_boots', '/items/crafters_bottoms', '/items/crafters_top',
  '/items/crimson_alembic', '/items/crimson_brush', '/items/crimson_chisel', '/items/crimson_enhancer', '/items/crimson_hammer',
  '/items/crimson_hatchet', '/items/crimson_needle', '/items/crimson_pot', '/items/crimson_shears', '/items/crimson_spatula',
  '/items/culinary_cape', '/items/culinary_cape_refined', '/items/dairyhands_bottoms', '/items/dairyhands_top', '/items/earrings_of_essence_find',
  '/items/earrings_of_gathering', '/items/earrings_of_rare_find', '/items/enchanted_gloves', '/items/enhancers_bottoms', '/items/enhancers_top',
  '/items/expert_alchemy_charm', '/items/expert_brewing_charm', '/items/expert_cheesesmithing_charm', '/items/expert_cooking_charm', '/items/expert_crafting_charm',
  '/items/expert_enhancing_charm', '/items/expert_foraging_charm', '/items/expert_milking_charm', '/items/expert_tailoring_charm', '/items/expert_woodcutting_charm',
  '/items/eye_watch', '/items/foragers_bottoms', '/items/foragers_top', '/items/gatherer_cape', '/items/gatherer_cape_refined',
  '/items/grandmaster_alchemy_charm', '/items/grandmaster_brewing_charm', '/items/grandmaster_cheesesmithing_charm', '/items/grandmaster_cooking_charm', '/items/grandmaster_crafting_charm',
  '/items/grandmaster_enhancing_charm', '/items/grandmaster_foraging_charm', '/items/grandmaster_milking_charm', '/items/grandmaster_tailoring_charm', '/items/grandmaster_woodcutting_charm',
  '/items/guzzling_pouch', '/items/holy_alembic', '/items/holy_brush', '/items/holy_chisel', '/items/holy_enhancer',
  '/items/holy_hammer', '/items/holy_hatchet', '/items/holy_needle', '/items/holy_pot', '/items/holy_shears',
  '/items/holy_spatula', '/items/lumberjacks_bottoms', '/items/lumberjacks_top', '/items/master_alchemy_charm', '/items/master_brewing_charm',
  '/items/master_cheesesmithing_charm', '/items/master_cooking_charm', '/items/master_crafting_charm', '/items/master_enhancing_charm', '/items/master_foraging_charm',
  '/items/master_milking_charm', '/items/master_tailoring_charm', '/items/master_woodcutting_charm', '/items/necklace_of_efficiency', '/items/necklace_of_speed',
  '/items/necklace_of_wisdom', '/items/philosophers_earrings', '/items/philosophers_necklace', '/items/philosophers_ring', '/items/rainbow_alembic',
  '/items/rainbow_brush', '/items/rainbow_chisel', '/items/rainbow_enhancer', '/items/rainbow_hammer', '/items/rainbow_hatchet',
  '/items/rainbow_needle', '/items/rainbow_pot', '/items/rainbow_shears', '/items/rainbow_spatula', '/items/red_culinary_hat',
  '/items/ring_of_essence_find', '/items/ring_of_gathering', '/items/ring_of_rare_find', '/items/tailors_bottoms', '/items/tailors_top',
  '/items/trainee_alchemy_charm', '/items/trainee_brewing_charm', '/items/trainee_cheesesmithing_charm', '/items/trainee_cooking_charm', '/items/trainee_crafting_charm',
  '/items/trainee_enhancing_charm', '/items/trainee_foraging_charm', '/items/trainee_milking_charm', '/items/trainee_tailoring_charm', '/items/trainee_woodcutting_charm',
  '/items/verdant_alembic', '/items/verdant_brush', '/items/verdant_chisel', '/items/verdant_enhancer', '/items/verdant_hammer',
  '/items/verdant_hatchet', '/items/verdant_needle', '/items/verdant_pot', '/items/verdant_shears', '/items/verdant_spatula'
]);

export const EDS_SKILL_TO_HOUSE_MAP = {
  milking: 'dairy_barn',
  foraging: 'garden',
  woodcutting: 'log_shed',
  cheesesmithing: 'forge',
  crafting: 'workshop',
  tailoring: 'sewing_parlor',
  cooking: 'kitchen',
  brewing: 'brewery',
  alchemy: 'laboratory',
  enhancing: 'observatory'
};

export const EDS_ACTION_LOCATIONS = [
  'tool', 'legs', 'body', 'charm', 'back'
];

export const EDS_EQUIPMENT_LOCATIONS = [
  'off_hand', 'head', 'hands', 'feet', 'neck',
  'earrings', 'ring', 'pouch'
];

export const EDS_BUFF_TYPES = [
  'experience', 'gathering_quantity', 'production_efficiency', 'enhancing_speed'
];

export const EDS_SCROLL_TO_PERSON_BUFF_MAP = {};

export const EDS_ACHIEVEMENT_TIER_MAP = {veteran: [
    'bestiary_points_100', 'build_room_level_3', 'coinify_coins_1m', 'collection_points_500', 'cook_spaceberry_cake',
    'defeat_chronofrost_sorcerer', 'defeat_jerry_t5', 'defeat_red_panda', 'enhance_to_10', 'labyrinth_floor_4',
    'learn_special_ability', 'tailor_umbral_tunic', 'total_level_1000', 'woodcut_arcane_tree'
  ], novice: [
    'bestiary_points_20', 'brew_gourmet_tea', 'cheesesmith_azure_tool', 'collection_points_100', 'defeat_marine_huntress',
    'defeat_shoebill', 'enhance_to_3', 'learn_ability', 'tailor_medium_pouch', 'task_tokens_10',
    'total_level_250'
  ], elite: [
    'bestiary_points_200', 'brew_ultra_magic_coffee', 'build_room_level_6', 'clear_chimerical_den', 'clear_sinister_circus',
    'collect_branch_of_insight', 'collect_butter_of_proficiency', 'collect_thread_of_expertise', 'collection_points_1000', 'craft_dungeon_equipment',
    'defeat_crystal_colossus', 'defeat_dusk_revenant', 'enhance_level_80_to_10', 'equip_expert_task_badge', 'labyrinth_floor_6',
    'total_level_1500'
  ], adept: [
    'bestiary_points_40', 'build_room_level_1', 'buy_trainee_charm', 'collection_points_200', 'cook_peach_yogurt',
    'craft_jewelry', 'decompose_bamboo_gloves', 'defeat_gobo_chieftain', 'defeat_luna_empress', 'defeat_the_watcher',
    'enhance_to_6', 'equip_ginkgo_weapon', 'labyrinth_floor_2', 'total_level_500'
  ], champion: [
    'bestiary_points_400', 'build_room_level_8', 'clear_enchanted_fortress', 'clear_pirate_cove', 'clear_t1_dungeon_10_times',
    'collection_points_2000', 'craft_celestial_tool_or_outfit', 'craft_master_charm', 'defeat_demonic_overlord_t1', 'defeat_stalactite_golem_t5',
    'enhance_level_90_to_10', 'labyrinth_floor_8', 'refine_dungeon_equipment', 'tailor_gluttonous_or_guzzling_pouch', 'total_level_1800',
    'transmute_philosophers_stone'
  ], beginner: [
    'complete_tutorial', 'cook_apple_gummy', 'craft_wooden_bow', 'defeat_jerry', 'gather_milk',
    'total_level_100'
  ]};

export const EDS_COMBAT_ACHIEVEMENTS = [
  'elite'
];

// combat-simulator-converter
export class CombatSimulatorConverter {
  static SKILLS = [
    'stamina', 'intelligence', 'attack', 'defense', 'melee',
    'ranged', 'magic'
  ];

  static ctx = null;

  static configure(ctx) {
    this.ctx = ctx;
  }

  static convert(loadout, characterData) {
    return {
      player: {
        ...this.getCombatLevels(characterData.characterSkills),
        equipment: this.getEquipment(loadout.wearableMap)
      },
      food: {'/action_types/combat': this.getConsumables(loadout.foodItemHrids)},
      drinks: {'/action_types/combat': this.getConsumables(loadout.drinkItemHrids)},
      abilities: this.getAbilities(loadout.abilityMap, characterData.characterAbilities),
      triggerMap: {...(loadout.abilityCombatTriggersMap || {}), ...(loadout.consumableCombatTriggersMap || {})},
      houseRooms: this.getHouseRooms(characterData.characterHouseRoomMap),
      achievements: this.getAchievements(characterData.characterAchievements)
    };
  }

  static getCombatLevels(characterSkills) {
    const result = {};
    this.SKILLS.forEach((skill) => {
      result[skill + 'Level'] = characterSkills?.find((item) => item.skillHrid === '/skills/' + skill)?.level || 0;
    });
    return result;
  }

  static getEquipment(wearableMap) {
    const {utils} = this.ctx;
    const result = [];
    Object.entries(wearableMap || {}).forEach(
      ([
        itemLocationHrid, hash
      ]) => {
        const item = utils.getItemByHash(hash);
        if (!item?.itemHrid) return;
        result.push({itemLocationHrid, itemHrid: item.itemHrid, enhancementLevel: item.enhancementLevel});
      }
    );
    return result;
  }

  static getConsumables(itemHrids) {
    return itemHrids?.map((itemHrid) => ({itemHrid})) || [];
  }

  static getAbilities(abilityMap, characterAbilities) {
    const result = [];
    Object.entries(abilityMap || {}).forEach(
      ([
        , abilityHrid
      ]) => {
        result.push({
          abilityHrid,
          level: characterAbilities?.find((item) => item.abilityHrid === abilityHrid)?.level || 0
        });
      }
    );
    return result;
  }

  static getHouseRooms(characterHouseRoomMap) {
    const result = {};
    Object.entries(characterHouseRoomMap || {}).forEach(
      ([
        hrid, room
      ]) => {
        result[hrid] = room.level;
      }
    );
    return result;
  }

  static getAchievements(characterAchievements) {
    const result = {};
    characterAchievements?.forEach((item) => {
      result[item.achievementHrid] = item.isCompleted;
    });
    return result;
  }
}

// eds-milkonomy-converter
export class EdsMilkonomyConverter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getGameData() {
    const {DataHub, GameUiAdapter, utils} = this.ctx;
    const raw = DataHub.characterData.raw || {};
    const header = GameUiAdapter.query('header');
    const game = utils.getReactComponentProps(header) || {};
    return {
      character: raw.character ?? game.character,
      characterItems: raw.characterItems ?? game.characterItemMap,
      characterHouseRoomMap: raw.characterHouseRoomMap || {},
      characterSkills: raw.characterSkills ?? (game.characterSkillMap ? [
              ...game.characterSkillMap.values()
            ] : []),
      actionTypeDrinkSlotsMap: raw.actionTypeDrinkSlotsMap ?? game.actionTypeDrinkSlotsDict,
      communityBuffs: raw.communityBuffs ?? game.communityBuffs,
      characterAchievements: raw.characterAchievements || [],
      characterBuffs: raw.characterBuffs ?? game.characterBuffs
    };
  }

  convert(characterData = this.getGameData()) {
    const {CONFIG} = this.ctx;
    const validItems = this.filterValidItems(characterData.characterItems);
    return {
      name: characterData.character?.name || CONFIG.characterId,
      color: '#90ee90',
      actionConfigMap: this.convertActionConfig(
        characterData.characterSkills,
        characterData.characterHouseRoomMap,
        characterData.actionTypeDrinkSlotsMap,
        validItems
      ),
      specialEquimentMap: this.convertSpecialEquipment(validItems),
      communityBuffMap: this.convertCommunityBuff(characterData.communityBuffs),
      achievementBuffMap: this.convertAchievementBuff(characterData.characterAchievements),
      seals: this.convertSeals(characterData.characterBuffs)
    };
  }

  filterPresetForTarget(preset, target = this.ctx.hostname === 'hyhfish.github.io' ? 'hyhfish' : 'milkonomy') {
    if (target === 'hyhfish') return preset;
    const actionConfigMap = Object.fromEntries(
      Object.entries(preset.actionConfigMap || {}).map(
        ([
          key, value
        ]) => {
          const rest = {...(value || {})};
          delete rest.back;
          return [
            key, rest
          ];
        }
      )
    );
    return {
      actionConfigMap,
      specialEquimentMap: preset.specialEquimentMap,
      communityBuffMap: preset.communityBuffMap,
      name: preset.name,
      color: preset.color
    };
  }

  filterPresetForCurrentSite(preset) {
    return this.filterPresetForTarget(preset);
  }

  filterValidItems(characterItems) {
    const {DataHub, utils} = this.ctx;
    const result = {};
    const itemMap = DataHub.getClientDataMap('itemDetailMap');
    characterItems?.forEach((item) => {
      if (!EDS_INCLUDE_ITEM_HRIDS.has(item.itemHrid)) return;
      const detail = itemMap[item.itemHrid];
      const equipment = detail?.equipmentDetail;
      if (!equipment) return;
      const type = utils.substrLastSlash(equipment.type || item.itemLocationHrid || '');
      let loc = type;
      if (type.endsWith('_tool')) loc = 'tool';
      else if (type.endsWith('_charm')) loc = 'charm';
      const bucket = result[loc] || {};
      const levels = equipment.levelRequirements?.length ? equipment.levelRequirements : [
            {skillHrid: '/skills/all', level: detail.itemLevel}
          ];
      levels.forEach((req) => {
        const skill = utils.substrLastSlash(req.skillHrid);
        const prev = bucket[skill];
        if (
          !prev ||
          (!prev.isWearable &&
            (prev.requiredLevel < req.level ||
              (prev.requiredLevel === req.level && prev.enhanceLevel < item.enhancementLevel)))
        ) {
          bucket[skill] = {
            itemHrid: item.itemHrid,
            itemName: detail.name,
            isWearable: item.itemLocationHrid !== '/item_locations/inventory',
            enhanceLevel: item.enhancementLevel,
            itemLevel: detail.itemLevel,
            requiredLevel: req.level
          };
        }
      });
      result[loc] = bucket;
    });
    return result;
  }

  convertActionConfig(skills, houseMap, drinkMap, validItems) {
    const result = {};
    Object.entries(EDS_SKILL_TO_HOUSE_MAP).forEach(
      ([
        skill, house
      ]) => {
        const row = {action: skill};
        row.playerLevel = skills?.find((item) => item.skillHrid === '/skills/' + skill)?.level || 0;
        EDS_ACTION_LOCATIONS.forEach((loc) => {
          const item = validItems[loc]?.[skill] || validItems[loc]?.all;
          const type = loc === 'tool' ? skill + '_tool' : loc;
          row[loc] = item ? {type, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type};
        });
        row.houseLevel = houseMap?.['/house_rooms/' + house]?.level || 0;
        row.tea = drinkMap?.['/action_types/' + skill]?.filter(Boolean).map((item) => item.itemHrid) || [];
        result[skill] = row;
      }
    );
    return result;
  }

  convertSpecialEquipment(validItems) {
    const result = {};
    EDS_EQUIPMENT_LOCATIONS.forEach((loc) => {
      const items = validItems[loc] || {};
      const item = items.all || items[Object.keys(items)[0]];
      result[loc] = item ? {type: loc, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type: loc};
    });
    return result;
  }

  convertCommunityBuff(communityBuffs) {
    const {utils} = this.ctx;
    const result = {};
    communityBuffs?.forEach((buff) => {
      const type = utils.substrLastSlash(buff.hrid);
      if (EDS_BUFF_TYPES.includes(type)) {
        result[type] = {type, hrid: buff.hrid, level: buff.level};
      }
    });
    return result;
  }

  convertAchievementBuff(achievements) {
    const {utils} = this.ctx;
    const completed = {};
    achievements?.forEach((item) => {
      completed[utils.substrLastSlash(item.achievementHrid)] = item.isCompleted;
    });
    const result = {};
    Object.entries(EDS_ACHIEVEMENT_TIER_MAP).forEach(
      ([
        tier, required
      ]) => {
        if (EDS_COMBAT_ACHIEVEMENTS.includes(tier)) return;
        const enabled = (required || []).every((id) => completed[id]);
        result[tier] = {type: tier, enabled};
      }
    );
    return result;
  }

  convertSeals(characterBuffs) {
    const {utils} = this.ctx;
    const now = Date.now();
    return (
      characterBuffs
        ?.filter((buff) => now < Date.parse(buff.expiresAt))
        ?.map((buff) => {
          const buffHrid = utils.substrLastSlash(buff.hrid);
          const itemId = EDS_SCROLL_TO_PERSON_BUFF_MAP[buffHrid] || 'seal_of_' + buffHrid;
          return '/items/' + itemId;
        }) || []
    );
  }
}
