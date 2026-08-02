import {equipmentComparisonSimulationBuilder} from './simulator.js';

// equipment-comparison-constants
export const EQUIPMENT_COMPARISON_ABILITY_LEVELS = Object.freeze([
  4, 6, 6, 6, 6
]);

export const EQUIPMENT_COMPARISON_SHARED_EQUIPMENT = Object.freeze([
  {
    itemHrid: '/items/philosophers_necklace',
    enhancementLevel: 5
  }, {itemHrid: '/items/philosophers_earrings', enhancementLevel: 5}, {
    itemHrid: '/items/philosophers_ring',
    enhancementLevel: 5
  }, {itemHrid: '/items/guzzling_pouch', enhancementLevel: 5}
]);

// 固定模拟环境：除被比较装备外，饰品、食物和技能等级保持一致。
export const EQUIPMENT_COMPARISON_FOOD_HRIDS = Object.freeze([
  '/items/star_fruit_yogurt', '/items/star_fruit_gummy'
]);

export const EQUIPMENT_COMPARISON_UNIQUE_STAT_KEYS = new Set([
  'weaken', 'fury', 'parry', 'mayhem', 'curse',
  'pierce', 'ripple', 'bloom', 'blaze'
]);

export const EQUIPMENT_COMPARISON_FLAT_STAT_KEYS = new Set([
  'abilityHaste', 'maxHitpoints', 'maxManapoints', 'armor', 'waterResistance',
  'natureResistance', 'fireResistance', 'tenacity', 'threat', 'foodSlots',
  'drinkSlots'
]);

export const EQUIPMENT_COMPARISON_SKILL_STAT_KEYS = new Set([
  'primaryTraining', 'focusTraining'
]);

// equipment-comparison-slot-catalog
const equipmentComparisonSlotCatalog = {
  getEquipmentTypeMap(service) {
    const {DataHub} = service.constructor.ctx;
    return DataHub.getClientDataMap('equipmentTypeDetailMap');
  },

  getWearableLocationHrid(service, itemDetail) {
    const equipmentType = itemDetail?.equipmentDetail?.type;
    return service.getEquipmentTypeMap()?.[equipmentType]?.itemLocationHrid || equipmentType || '';
  },

  getLogicalSlot(service, itemDetail) {
    const type = itemDetail?.equipmentDetail?.type;
    // 主手和双手都视为武器槽，确保同类武器可以互相比较。
    if (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand') return 'weapon';
    return service.getWearableLocationHrid(itemDetail);
  },

  isCombatEquipment(service, itemDetail) {
    const type = itemDetail?.equipmentDetail?.type;
    const typeDetail = service.getEquipmentTypeMap()?.[type];
    return (
      // 生活工具、护符和 Trinket 不参与 DPS 比较，按装备类型顺序过滤战斗装备。
      Boolean(itemDetail?.hrid && itemDetail?.equipmentDetail) &&
      type !== '/equipment_types/charm' &&
      type !== '/equipment_types/trinket' &&
      Number(typeDetail?.sortIndex || 999) < 16
    );
  },

  isEquipmentCompatibleWithPreset(service, itemDetail, preset) {
    if (!preset || !service.isCombatEquipment(itemDetail)) return false;
    const combatStats = itemDetail.equipmentDetail.combatStats || {};
    const styles = combatStats.combatStyleHrids || [];
    if (styles.length && !styles.includes(preset.combatStyleHrid)) return false;
    const type = itemDetail.equipmentDetail.type;
    const isWeapon = type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand';
    if (isWeapon && preset.weaponTypeHrid && type !== preset.weaponTypeHrid) return false;
    if (isWeapon && preset.damageTypeHrid && combatStats.damageType !== preset.damageTypeHrid) return false;
    return true;
  }
};

// equipment-comparison-inventory-catalog
const equipmentComparisonInventoryCatalog = {
  getCharacterItemSummary(service, itemHrid) {
    const {CharacterDataService} = service.constructor.ctx;
    const itemDetail = service.getItemMap()?.[itemHrid];
    const logicalSlot = service.getLogicalSlot(itemDetail);
    // 已穿戴装备优先，其次使用背包中最高强化等级作为默认基准。
    const equippedLocations =
      logicalSlot === 'weapon'
        ? new Set([
            '/item_locations/main_hand', '/item_locations/two_hand'
          ])
        : new Set([
            service.getWearableLocationHrid(itemDetail)
          ]);
    const items = CharacterDataService.getCharacterItems().filter(
      (item) =>
        item?.itemHrid === itemHrid &&
        Number(item?.count || 0) > 0 &&
        (item.itemLocationHrid === '/item_locations/inventory' || equippedLocations.has(item.itemLocationHrid))
    );
    const equipped = items.find((item) => equippedLocations.has(item.itemLocationHrid)) || null;
    const highest = items.reduce(
      (best, item) => (!best || Number(item.enhancementLevel || 0) > Number(best.enhancementLevel || 0) ? item : best),
      null
    );
    return {
      count: items.reduce((sum, item) => sum + Number(item.count || 0), 0),
      enhancementLevel: Number(equipped?.enhancementLevel ?? highest?.enhancementLevel ?? -1),
      isEquipped: Boolean(equipped)
    };
  },

  getRecommendedEnhancementLevel(service, itemDetail, preset) {
    const summary = service.getCharacterItemSummary(itemDetail.hrid);
    if (summary.enhancementLevel >= 0) return summary.enhancementLevel;
    const presetEntry = service.getPresetEquipmentEntries(preset).find((item) => item.itemHrid === itemDetail.hrid);
    return Math.min(presetEntry?.enhancementLevel ?? 10, service.getMaxEnhancementLevel(itemDetail));
  },

  getBaselineEquipment(service, preset) {
    return Object.values(service.getItemMap())
      .filter((detail) => service.isEquipmentCompatibleWithPreset(detail, preset))
      .map((detail) => {
        const summary = service.getCharacterItemSummary(detail.hrid);
        return {
          itemHrid: detail.hrid,
          enhancementLevel: service.getRecommendedEnhancementLevel(detail, preset),
          count: summary.count,
          isEquipped: summary.isEquipped,
          detail
        };
      })
      .sort((left, right) => {
        const leftType = service.getEquipmentTypeMap()?.[left.detail.equipmentDetail.type];
        const rightType = service.getEquipmentTypeMap()?.[right.detail.equipmentDetail.type];
        return (
          Number(leftType?.sortIndex || 999) - Number(rightType?.sortIndex || 999) ||
          Number(left.detail?.sortIndex || 9999) - Number(right.detail?.sortIndex || 9999)
        );
      });
  },

  getCompatibleEquipment(service, baselineItem, preset) {
    if (!baselineItem) return [];
    const logicalSlot = service.getLogicalSlot(baselineItem.detail);
    return Object.values(service.getItemMap())
      .filter(
        (detail) =>
          service.getLogicalSlot(detail) === logicalSlot && service.isEquipmentCompatibleWithPreset(detail, preset)
      )
      .sort((left, right) => Number(left.sortIndex || 9999) - Number(right.sortIndex || 9999));
  },

  detectPresetKey(service) {
    const {CharacterDataService} = service.constructor.ctx;
    const itemMap = service.getItemMap();
    const equippedWeapon = CharacterDataService.getCharacterItems().find((item) => {
      const detail = itemMap[item?.itemHrid];
      const type = detail?.equipmentDetail?.type;
      return (
        Number(item?.count || 0) > 0 &&
        item.itemLocationHrid === '/item_locations/main_hand' &&
        (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand')
      );
    });
    const detail = itemMap[equippedWeapon?.itemHrid];
    const stats = detail?.equipmentDetail?.combatStats || {};
    const style = stats.combatStyleHrids?.[0];
    // 默认方案根据当前主手武器推断，无法识别时回落到近战锤。
    if (style === '/combat_styles/smash') {
      return detail?.equipmentDetail?.type === '/equipment_types/two_hand' ? 'meleeBulwark' : 'meleeHammer';
    }
    if (style === '/combat_styles/slash') return 'meleeSword';
    if (style === '/combat_styles/stab') return 'meleeSpear';
    if (style === '/combat_styles/ranged') {
      return detail?.equipmentDetail?.type === '/equipment_types/two_hand' ? 'rangedBow' : 'rangedCrossbow';
    }
    if (style === '/combat_styles/magic') {
      if (stats.damageType === '/damage_types/fire') return 'magicFire';
      if (stats.damageType === '/damage_types/water') return 'magicWater';
      return 'magicNature';
    }
    return 'meleeHammer';
  },

  getDefaultBaselineItem(service, preset, options) {
    const presetWeapon = service.getPresetEquipmentEntries(preset).find((entry) => {
      const type = service.getItemMap()?.[entry.itemHrid]?.equipmentDetail?.type;
      return type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand';
    });
    const equipped = options.find(
      (item) =>
        item.isEquipped &&
        service.getLogicalSlot(item.detail) === 'weapon' &&
        service.isEquipmentCompatibleWithPreset(item.detail, preset)
    );
    return equipped || options.find((item) => item.itemHrid === presetWeapon?.itemHrid) || options[0] || null;
  }
};

// equipment-comparison-stat-catalog
const equipmentComparisonStatCatalog = {
  getMaxEnhancementLevel(service, itemDetail) {
    const {DataHub} = service.constructor.ctx;
    if (!Array.isArray(itemDetail?.enhancementCosts) || !itemDetail.enhancementCosts.length) return 0;
    return Math.max(0, (DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable?.length || 1) - 1);
  },

  getEnhancementMultiplier(service, level) {
    const {DataHub} = service.constructor.ctx;
    const table = DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable || [];
    return Number(table[Math.max(0, Number(level || 0))] || 0);
  },

  getEquipmentStats(service, itemHrid, enhancementLevel = 0) {
    const equipment = service.getItemMap()?.[itemHrid]?.equipmentDetail;
    if (!equipment) return new Map();
    const multiplier = service.getEnhancementMultiplier(enhancementLevel);
    const result = new Map();
    const addStats = (category, baseStats, enhancementBonuses) => {
      // 唯一触发类属性无法按数值线性对比，只展示可累计的装备属性。
      Object.entries(baseStats || {}).forEach(
        ([
          key, baseValue
        ]) => {
          if (service.constructor.UNIQUE_STAT_KEYS.has(key)) return;
          let value = baseValue;
          if (typeof baseValue === 'number' && Number(enhancementLevel) >= 1) {
            value += multiplier * Number(enhancementBonuses?.[key] || 0);
          }
          if (value == null || value === '' || value === 0 || (Array.isArray(value) && !value.length)) return;
          result.set(`${category}:${key}`, {category, key, value});
        }
      );
    };
    addStats('combat', equipment.combatStats, equipment.combatEnhancementBonuses);
    addStats('noncombat', equipment.noncombatStats, equipment.noncombatEnhancementBonuses);
    return result;
  },

  areStatValuesEqual(_service, left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((value, index) => value === right[index])
      );
    }
    return left === right;
  },

  getComparisonRows(service, baselineItem, comparisonItem, comparisonEnhancementLevel) {
    if (!baselineItem || !comparisonItem) return [];
    const baselineStats = service.getEquipmentStats(baselineItem.itemHrid, baselineItem.enhancementLevel);
    const comparisonStats = service.getEquipmentStats(comparisonItem.hrid, comparisonEnhancementLevel);
    const statIds = [
      ...baselineStats.keys(), ...[
        ...comparisonStats.keys()
      ].filter((key) => !baselineStats.has(key))
    ];
    return statIds.map((id) => {
      const baselineStat = baselineStats.get(id) || null;
      const comparisonStat = comparisonStats.get(id) || null;
      const stat = baselineStat || comparisonStat;
      const isNumeric = typeof baselineStat?.value === 'number' || typeof comparisonStat?.value === 'number';
      const baselineValue = isNumeric ? Number(baselineStat?.value || 0) : baselineStat?.value;
      const comparisonValue = isNumeric ? Number(comparisonStat?.value || 0) : comparisonStat?.value;
      return {
        id,
        category: stat.category,
        key: stat.key,
        ownedValue: baselineStat ? baselineValue : null,
        comparisonValue: comparisonStat ? comparisonValue : null,
        difference: isNumeric ? comparisonValue - baselineValue : null,
        isEqual: !isNumeric && service.areStatValuesEqual(baselineValue, comparisonValue),
        isNumeric
      };
    });
  },

  getItemNames(service, itemHrid) {
    const {DataHub} = service.constructor.ctx;
    return {
      zh: DataHub.getLocalizedGameName('itemNames', itemHrid, 'zh'),
      en: DataHub.getLocalizedGameName('itemNames', itemHrid, 'en')
    };
  },

  filterPickerOptions(service, options, query, mode, equipmentTypeHrid) {
    const keyword = String(query || '')
      .trim()
      .toLowerCase();
    return options.filter((item) => {
      const itemHrid = mode === 'owned' ? item.itemHrid : item.hrid;
      const itemDetail = mode === 'owned' ? item.detail : item;
      if (equipmentTypeHrid && itemDetail?.equipmentDetail?.type !== equipmentTypeHrid) return false;
      if (!keyword) return true;
      const names = service.getItemNames(itemHrid);
      return [
        names.zh, names.en, itemHrid
      ]
        .join('\n')
        .toLowerCase()
        .includes(keyword);
    });
  },

  getPickerEquipmentTypes(service, options, mode) {
    const availableTypes = new Set(
      options
        .map((item) => {
          const itemDetail = mode === 'owned' ? item.detail : item;
          return itemDetail?.equipmentDetail?.type;
        })
        .filter(Boolean)
    );
    return Object.entries(service.getEquipmentTypeMap())
      .map(
        ([
          hrid, detail
        ]) => ({...detail, hrid: detail.hrid || hrid})
      )
      .filter((detail) => availableTypes.has(detail.hrid))
      .sort((left, right) => Number(left.sortIndex || 999) - Number(right.sortIndex || 999));
  }
};

// equipment-comparison-catalog
const equipmentComparisonCatalog = {
  ...equipmentComparisonSlotCatalog,
  ...equipmentComparisonInventoryCatalog,
  ...equipmentComparisonStatCatalog
};

// equipment-comparison-service
export class EquipmentComparisonService {
  static ABILITY_LEVELS = EQUIPMENT_COMPARISON_ABILITY_LEVELS;
  static SHARED_EQUIPMENT = EQUIPMENT_COMPARISON_SHARED_EQUIPMENT;
  static FOOD_HRIDS = EQUIPMENT_COMPARISON_FOOD_HRIDS;
  static UNIQUE_STAT_KEYS = EQUIPMENT_COMPARISON_UNIQUE_STAT_KEYS;
  static FLAT_STAT_KEYS = EQUIPMENT_COMPARISON_FLAT_STAT_KEYS;
  static SKILL_STAT_KEYS = EQUIPMENT_COMPARISON_SKILL_STAT_KEYS;
  static ctx = null;
  static CombatSimulationService = null;
  static simulationBuilder = equipmentComparisonSimulationBuilder;
  static catalog = equipmentComparisonCatalog;

  static configure(ctx, CombatSimulationService) {
    this.ctx = ctx;
    this.CombatSimulationService = CombatSimulationService;
  }

  constructor(marketService = null, simulationService = null) {
    this.marketService = marketService;
    this.simulationService = simulationService;
  }

  getItemMap() {
    return this.constructor.ctx.DataHub.getClientDataMap('itemDetailMap');
  }

  getPresetEquipmentEntries(preset) {
    return [
      ...preset.equipment.map(
        ([
          itemHrid, enhancementLevel
        ]) => ({itemHrid, enhancementLevel})
      ), ...EquipmentComparisonService.SHARED_EQUIPMENT
    ];
  }

  buildPresetEquipment(preset) {
    const equipment = {};
    this.getPresetEquipmentEntries(preset).forEach((entry) => {
      const detail = this.getItemMap()?.[entry.itemHrid];
      const type = detail?.equipmentDetail?.type;
      if (type) equipment[type] = {hrid: entry.itemHrid, enhancementLevel: entry.enhancementLevel};
    });
    return equipment;
  }

  applyEquipmentToBuild(equipment, itemHrid, enhancementLevel) {
    const detail = this.getItemMap()?.[itemHrid];
    const type = detail?.equipmentDetail?.type;
    if (!type) return equipment;
    const result = {...equipment};
    if (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand') {
      // 双手武器会占用副手，替换武器时必须清理互斥槽位。
      delete result['/equipment_types/main_hand'];
      delete result['/equipment_types/two_hand'];
      if (type === '/equipment_types/two_hand') delete result['/equipment_types/off_hand'];
    }
    result[type] = {hrid: itemHrid, enhancementLevel: Number(enhancementLevel || 0)};
    return result;
  }

  getEquipmentMarketPrice(itemHrid, enhancementLevel) {
    const row = this.marketService?.getMarketRow(itemHrid, enhancementLevel);
    return (
      [
        row?.a, row?.p, row?.b
      ]
        .map(Number)
        .find((value) => Number.isFinite(value) && value > 0) || 0
    );
  }

  getCurrentCombatLevels() {
    return this.constructor.simulationBuilder.getCurrentCombatLevels(this);
  }

  getCurrentHouseRooms() {
    return this.constructor.simulationBuilder.getCurrentHouseRooms(this);
  }

  getCurrentAchievements() {
    return this.constructor.simulationBuilder.getCurrentAchievements(this);
  }

  getDefaultTriggers(detail) {
    return this.constructor.simulationBuilder.getDefaultTriggers(this, detail);
  }

  buildSimulationPlayer(equipment, preset) {
    return this.constructor.simulationBuilder.buildSimulationPlayer(this, equipment, preset);
  }

  getStandardTarget() {
    return this.constructor.simulationBuilder.getStandardTarget(this);
  }

  getStandardZone() {
    return this.constructor.simulationBuilder.getStandardZone(this);
  }

  buildSimulationData(players) {
    return this.constructor.simulationBuilder.buildSimulationData(this, players);
  }

  buildComparisonContext(preset, baselineItem, comparisonItem, comparisonEnhancementLevel) {
    return this.constructor.simulationBuilder.buildComparisonContext(
      this,
      preset,
      baselineItem,
      comparisonItem,
      comparisonEnhancementLevel
    );
  }

  getEquipmentPriceDifference(baselineItem, comparisonItem) {
    return this.constructor.simulationBuilder.getEquipmentPriceDifference(this, baselineItem, comparisonItem);
  }

  getDerivedComparison(simulationState, context = null) {
    return this.constructor.simulationBuilder.getDerivedComparison(this, simulationState, context);
  }

  getSimulationKey(presetKey, baselineItem, comparisonItem, comparisonEnhancementLevel) {
    return this.constructor.simulationBuilder.getSimulationKey(
      this,
      presetKey,
      baselineItem,
      comparisonItem,
      comparisonEnhancementLevel
    );
  }

  getEquipmentTypeMap() {
    return this.constructor.catalog.getEquipmentTypeMap(this);
  }

  getWearableLocationHrid(itemDetail) {
    return this.constructor.catalog.getWearableLocationHrid(this, itemDetail);
  }

  getLogicalSlot(itemDetail) {
    return this.constructor.catalog.getLogicalSlot(this, itemDetail);
  }

  isCombatEquipment(itemDetail) {
    return this.constructor.catalog.isCombatEquipment(this, itemDetail);
  }

  isEquipmentCompatibleWithPreset(itemDetail, preset) {
    return this.constructor.catalog.isEquipmentCompatibleWithPreset(this, itemDetail, preset);
  }

  getCharacterItemSummary(itemHrid) {
    return this.constructor.catalog.getCharacterItemSummary(this, itemHrid);
  }

  getRecommendedEnhancementLevel(itemDetail, preset) {
    return this.constructor.catalog.getRecommendedEnhancementLevel(this, itemDetail, preset);
  }

  getBaselineEquipment(preset) {
    return this.constructor.catalog.getBaselineEquipment(this, preset);
  }

  getCompatibleEquipment(baselineItem, preset) {
    return this.constructor.catalog.getCompatibleEquipment(this, baselineItem, preset);
  }

  getMaxEnhancementLevel(itemDetail) {
    return this.constructor.catalog.getMaxEnhancementLevel(this, itemDetail);
  }

  getEnhancementMultiplier(level) {
    return this.constructor.catalog.getEnhancementMultiplier(this, level);
  }

  getEquipmentStats(itemHrid, enhancementLevel = 0) {
    return this.constructor.catalog.getEquipmentStats(this, itemHrid, enhancementLevel);
  }

  areStatValuesEqual(left, right) {
    return this.constructor.catalog.areStatValuesEqual(this, left, right);
  }

  getComparisonRows(baselineItem, comparisonItem, comparisonEnhancementLevel) {
    return this.constructor.catalog.getComparisonRows(this, baselineItem, comparisonItem, comparisonEnhancementLevel);
  }

  getItemNames(itemHrid) {
    return this.constructor.catalog.getItemNames(this, itemHrid);
  }

  filterPickerOptions(options, query, mode, equipmentTypeHrid) {
    return this.constructor.catalog.filterPickerOptions(this, options, query, mode, equipmentTypeHrid);
  }

  getPickerEquipmentTypes(options, mode) {
    return this.constructor.catalog.getPickerEquipmentTypes(this, options, mode);
  }

  detectPresetKey() {
    return this.constructor.catalog.detectPresetKey(this);
  }

  getDefaultBaselineItem(preset, options) {
    return this.constructor.catalog.getDefaultBaselineItem(this, preset, options);
  }

  canCompare() {
    return Boolean(this.simulationService);
  }

  compare(context) {
    return this.simulationService.compare(context.baselinePlayer, context.comparisonPlayer, context.mstData);
  }

  cancel() {
    this.simulationService?.cancel();
  }
}
