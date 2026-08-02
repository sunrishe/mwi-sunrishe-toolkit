import {mstCombatWorkerRuntime} from './worker-runtime.js';

// combat-simulation-service
export class CombatSimulationService {
  static DATA_KEYS = Object.freeze([
    'itemDetailMap', 'abilityDetailMap', 'achievementTierDetailMap', 'achievementDetailMap', 'houseRoomDetailMap',
    'combatTriggerDependencyDetailMap', 'combatMonsterDetailMap', 'actionDetailMap', 'combatStyleDetailMap', 'enhancementLevelTotalBonusMultiplierTable'
  ]);

  static SEEDS = Object.freeze([
    0x13579bdf, 0x2468ace0, 0x51f15e5d, 0x6d2b79f5, 0x9e3779b9
  ]);
  static SIMULATION_TIME = 3 * 60 * 60 * 1e9;
  static TARGET_HITPOINTS = 1e12;
  static TARGET_HRID = '/monsters/mst_standard_target';
  static ZONE_HRID = '/actions/combat/mst_standard_target';

  constructor(ctx = null) {
    this.ctx = ctx || {};
    this.workerUrl = '';
    this.activeWorkers = new Set();
  }

  static buildWorkerSource() {
    return `(${mstCombatWorkerRuntime.toString()})();`;
  }

  getWorkerUrl() {
    if (this.workerUrl) return this.workerUrl;
    const source = CombatSimulationService.buildWorkerSource();
    this.workerUrl = URL.createObjectURL(
      new Blob(
        [
          source
        ],
        {type: 'text/javascript'}
      )
    );
    return this.workerUrl;
  }

  createWorker() {
    const worker = new Worker(this.getWorkerUrl());
    this.activeWorkers.add(worker);
    return worker;
  }

  terminateWorker(worker) {
    if (!worker) return;
    worker.terminate();
    this.activeWorkers.delete(worker);
  }

  cancel() {
    [
      ...this.activeWorkers
    ].forEach((worker) => this.terminateWorker(worker));
  }

  runOnce(worker, player, mstData, seed) {
    const {i18n} = this.ctx;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(i18n.t('combatSimulationTimeout'))), 120000);
      worker.onmessage = (event) => {
        if (event.data?.type === 'simulation_result') {
          clearTimeout(timeout);
          resolve(event.data.simResult);
        } else if (event.data?.type === 'simulation_error') {
          clearTimeout(timeout);
          reject(new Error(String(event.data.error?.message || event.data.error || i18n.t('combatSimulationFailed'))));
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || i18n.t('combatSimulationWorkerFailed')));
      };
      worker.postMessage({
        type: 'start_simulation',
        players: [
          player
        ],
        zone: {
          zoneHrid: CombatSimulationService.ZONE_HRID,
          difficultyTier: 0
        },
        labyrinth: null,
        simulationTimeLimit: CombatSimulationService.SIMULATION_TIME,
        seed,
        mstData,
        extra: {mooPass: false, comExp: 0, comDrop: 0, personalBuffs: [], enableHpMpVisualization: false}
      });
    });
  }

  getDps(simResult) {
    const attacks = simResult?.attacks?.player1?.[CombatSimulationService.TARGET_HRID] || {};
    const totalDamage = Object.values(attacks).reduce((abilityTotal, hits) => {
      return (
        abilityTotal +
        Object.entries(hits || {}).reduce(
          (sum, [
              damage, count
            ]) => {
            return damage === 'miss' ? sum : sum + Number(damage || 0) * Number(count || 0);
          },
          0
        )
      );
    }, 0);
    const alive = simResult?.timeSpentAlive?.find((entry) => entry?.name === CombatSimulationService.TARGET_HRID);
    const simulatedTime = Number(alive?.timeSpentAlive || simResult?.simulatedTime || 0);
    return simulatedTime > 0 ? totalDamage / (simulatedTime / 1e9) : 0;
  }

  async simulateBuild(player, mstData) {
    const worker = this.createWorker();
    try {
      const values = [];
      for (let index = 0; index < CombatSimulationService.SEEDS.length; index++) {
        const result = await this.runOnce(
          worker,
          player,
          index === 0 ? mstData : null,
          CombatSimulationService.SEEDS[index]
        );
        values.push(this.getDps(result));
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    } finally {
      this.terminateWorker(worker);
    }
  }

  async compare(baselinePlayer, comparisonPlayer, mstData) {
    const [
      baselineDps, comparisonDps
    ] = await Promise.all([
      this.simulateBuild(baselinePlayer, mstData), this.simulateBuild(comparisonPlayer, mstData)
    ]);
    const change = baselineDps > 0 ? comparisonDps / baselineDps - 1 : null;
    return {baselineDps, comparisonDps, change};
  }
}

// equipment-comparison-current-state
const equipmentComparisonCurrentState = {
  getCurrentCombatLevels(service) {
    const {CharacterDataService} = service.constructor.ctx;
    const result = {};
    [
      'stamina', 'intelligence', 'attack', 'defense', 'melee',
      'ranged', 'magic'
    ].forEach((skill) => {
      result[skill + 'Level'] = Number(CharacterDataService.getCharacterSkill('/skills/' + skill)?.level || 0);
    });
    return result;
  },

  getCurrentHouseRooms(service) {
    const {CharacterDataService} = service.constructor.ctx;
    const result = {};
    Object.entries(CharacterDataService.raw?.characterHouseRoomMap || {}).forEach(
      ([
        hrid, room
      ]) => {
        result[hrid] = Number(room?.level || 0);
      }
    );
    return result;
  },

  getCurrentAchievements(service) {
    const {CharacterDataService} = service.constructor.ctx;
    const result = {};
    (CharacterDataService.raw?.characterAchievements || []).forEach((item) => {
      result[item.achievementHrid] = Boolean(item.isCompleted);
    });
    return result;
  },

  getDefaultTriggers(_service, detail) {
    return (detail?.defaultCombatTriggers || []).map((trigger) => ({...trigger}));
  }
};

// equipment-comparison-standard-simulation
const equipmentComparisonStandardSimulation = {
  getStandardTarget(service) {
    const {CombatSimulationService} = service.constructor;
    return {
      hrid: CombatSimulationService.TARGET_HRID,
      name: 'MST Standard Target',
      isLabyrinthMonster: false,
      isGuildMonster: false,
      enrageTime: 9000000000000000,
      experience: 0,
      combatDetails: {
        // 装备对比使用不死亡木桩，避免尾刀与重生打乱成对模拟的随机序列。
        currentHitpoints: CombatSimulationService.TARGET_HITPOINTS,
        maxHitpoints: CombatSimulationService.TARGET_HITPOINTS,
        currentManapoints: 80000,
        maxManapoints: 80000,
        attackInterval: 9000000000000000,
        totalCastSpeed: 0,
        stabAccuracyRating: 10,
        slashAccuracyRating: 10,
        smashAccuracyRating: 10,
        rangedAccuracyRating: 10,
        magicAccuracyRating: 10,
        defensiveMaxDamage: 10,
        stabMaxDamage: 10,
        slashMaxDamage: 10,
        smashMaxDamage: 10,
        rangedMaxDamage: 10,
        magicMaxDamage: 10,
        stabEvasionRating: 320,
        slashEvasionRating: 320,
        smashEvasionRating: 320,
        rangedEvasionRating: 320,
        magicEvasionRating: 320,
        totalArmor: 62,
        totalWaterResistance: 62,
        totalNatureResistance: 62,
        totalFireResistance: 62,
        totalThreat: 100,
        combatLevel: 0,
        staminaLevel: 7990,
        intelligenceLevel: 7990,
        attackLevel: 0,
        meleeLevel: 0,
        defenseLevel: 310,
        rangedLevel: 0,
        magicLevel: 0,
        combatStats: {combatStyleHrids: [
            '/combat_styles/slash'
          ], damageType:
            '/damage_types/physical', attackInterval: 9000000000000000, armor: 62, waterResistance: 62, natureResistance: 62, fireResistance: 62}
      },
      abilities: [],
      dropTable: null,
      rareDropTable: []
    };
  },

  getStandardZone(service) {
    const {CombatSimulationService} = service.constructor;
    return {
      hrid: CombatSimulationService.ZONE_HRID,
      function: '/action_functions/combat',
      type: '/action_types/combat',
      category: '/action_categories/combat/zones',
      name: 'MST Standard Target',
      maxDifficulty: 0,
      levelRequirement: {skillHrid: '', level: 0},
      baseTimeCost: 0,
      experienceGain: {skillHrid: '', value: 0},
      dropTable: null,
      essenceDropTable: null,
      rareDropTable: null,
      upgradeItemHrid: '',
      retainAllEnhancement: false,
      inputItems: null,
      outputItems: null,
      combatZoneInfo: {isDungeon: false, fightInfo: {randomSpawnInfo: {maxSpawnCount: 1, maxTotalStrength: 1, spawns: [
              {combatMonsterHrid: CombatSimulationService.TARGET_HRID, difficultyTier: 0, rate: 1, strength: 1}
            ]}, bossSpawns: null, battlesPerBoss: 0}, dungeonInfo: null},
      maxPartySize: 1,
      buffs: [],
      sortIndex: 0
    };
  }
};

// equipment-comparison-simulation-context
const equipmentComparisonSimulationContext = {
  buildSimulationPlayer(service, equipment, preset) {
    const {DataHub} = service.constructor.ctx;
    const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
    const itemMap = service.getItemMap();
    return {
      hrid: 'player1',
      ...service.getCurrentCombatLevels(),
      equipment,
      food: service.constructor.FOOD_HRIDS.map((hrid) => ({
        hrid,
        triggers: service.getDefaultTriggers(itemMap[hrid]?.consumableDetail)
      })),
      drinks: preset.drinks.map((hrid) => ({
        hrid,
        triggers: service.getDefaultTriggers(itemMap[hrid]?.consumableDetail)
      })),
      abilities: preset.abilities.map((hrid, index) => ({
        hrid,
        level: service.constructor.ABILITY_LEVELS[index],
        triggers: service.getDefaultTriggers(abilityMap[hrid])
      })),
      houseRooms: service.getCurrentHouseRooms(),
      achievements: service.getCurrentAchievements(),
      debuffOnLevelGap: 1
    };
  },

  buildSimulationData(service, players) {
    const {CombatSimulationService} = service.constructor;
    const {DataHub} = service.constructor.ctx;
    const itemMap = service.getItemMap();
    const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
    const houseMap = DataHub.getClientDataMap('houseRoomDetailMap');
    const achievementMap = DataHub.getClientDataMap('achievementDetailMap');
    const itemHrids = new Set();
    const abilityHrids = new Set();
    const houseHrids = new Set();
    const achievementHrids = new Set();
    players.forEach((player) => {
      Object.values(player.equipment).forEach((item) => itemHrids.add(item.hrid));
      player.food.forEach((item) => itemHrids.add(item.hrid));
      player.drinks.forEach((item) => itemHrids.add(item.hrid));
      player.abilities.forEach((ability) => abilityHrids.add(ability.hrid));
      Object.keys(player.houseRooms).forEach((hrid) => houseHrids.add(hrid));
      Object.keys(player.achievements).forEach((hrid) => achievementHrids.add(hrid));
    });
    const pickMap = (source, keys) =>
      Object.fromEntries(
        [
          ...keys
        ]
          .filter((key) => source?.[key])
          .map((key) => [
            key, source[key]
          ])
      );
    return {
      itemDetailMap: pickMap(itemMap, itemHrids),
      abilityDetailMap: pickMap(abilityMap, abilityHrids),
      houseRoomDetailMap: pickMap(houseMap, houseHrids),
      achievementDetailMap: pickMap(achievementMap, achievementHrids),
      achievementTierDetailMap: DataHub.getClientDataMap('achievementTierDetailMap'),
      combatTriggerDependencyDetailMap: DataHub.getClientDataMap('combatTriggerDependencyDetailMap'),
      combatStyleDetailMap: DataHub.getClientDataMap('combatStyleDetailMap'),
      enhancementLevelTotalBonusMultiplierTable:
        DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable || [],
      combatMonsterDetailMap: {[CombatSimulationService.TARGET_HRID]: service.getStandardTarget()},
      actionDetailMap: {[CombatSimulationService.ZONE_HRID]: service.getStandardZone()}
    };
  },

  buildComparisonContext(service, preset, baselineItem, comparisonItem, comparisonEnhancementLevel) {
    const presetEquipment = service.buildPresetEquipment(preset);
    const baselineEquipment = service.applyEquipmentToBuild(
      presetEquipment,
      baselineItem.itemHrid,
      baselineItem.enhancementLevel
    );
    const comparisonEquipment = service.applyEquipmentToBuild(
      presetEquipment,
      comparisonItem.hrid,
      comparisonEnhancementLevel
    );
    const baselinePlayer = service.buildSimulationPlayer(baselineEquipment, preset);
    const comparisonPlayer = service.buildSimulationPlayer(comparisonEquipment, preset);
    return {
      baselineEquipment,
      comparisonEquipment,
      baselineSelection: {hrid: baselineItem.itemHrid, enhancementLevel: baselineItem.enhancementLevel},
      comparisonSelection: {hrid: comparisonItem.hrid, enhancementLevel: comparisonEnhancementLevel},
      baselinePlayer,
      comparisonPlayer,
      mstData: service.buildSimulationData([
        baselinePlayer, comparisonPlayer
      ])
    };
  },

  getEquipmentPriceDifference(service, baselineItem, comparisonItem) {
    if (!baselineItem?.hrid || !comparisonItem?.hrid) return null;
    const baselinePrice = service.getEquipmentMarketPrice(baselineItem.hrid, baselineItem.enhancementLevel);
    const comparisonPrice = service.getEquipmentMarketPrice(comparisonItem.hrid, comparisonItem.enhancementLevel);
    return baselinePrice && comparisonPrice ? comparisonPrice - baselinePrice : null;
  },

  getDerivedComparison(service, simulationState, context = null) {
    const result = simulationState.result;
    const priceDifference = context
      ? service.getEquipmentPriceDifference(context.baselineSelection, context.comparisonSelection)
      : null;
    const dps =
      simulationState.status === 'ready' && Number.isFinite(result?.change)
        ? {status: 'ready', value: result.change}
        : {status: simulationState.status, value: null};
    const dpsPerTenMillion =
      dps.status === 'ready' && dps.value > 0 && priceDifference > 0
        ? ((dps.value * 100) / (priceDifference / 1000000)) * 10
        : null;
    return {
      priceDifference,
      baselineDps: result?.baselineDps ?? null,
      comparisonDps: result?.comparisonDps ?? null,
      dps,
      dpsPerTenMillion
    };
  },

  getSimulationKey(service, presetKey, baselineItem, comparisonItem, comparisonEnhancementLevel) {
    const equipmentKey = (item) => `${item?.itemHrid || item?.hrid || ''}::${Number(item?.enhancementLevel || 0)}`;
    return JSON.stringify({
      presetKey,
      baseline: equipmentKey(baselineItem),
      comparison: equipmentKey({itemHrid: comparisonItem?.hrid, enhancementLevel: comparisonEnhancementLevel}),
      levels: service.getCurrentCombatLevels(),
      houses: service.getCurrentHouseRooms()
    });
  }
};

// equipment-comparison-simulation-builder
export const equipmentComparisonSimulationBuilder = {
  ...equipmentComparisonCurrentState,
  ...equipmentComparisonStandardSimulation,
  ...equipmentComparisonSimulationContext
};
