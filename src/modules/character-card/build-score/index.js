import {buildScoreEnhancementMethods, buildScoreLegacyCalculators} from './legacy.js';
import {buildScoreNewCalculators, buildScoreV26EnhancementMethods} from './v26.js';
// build-score-service
export class BuildScoreService {
  constructor(ctx, marketService) {
    this.ctx = ctx;
    this.marketService = marketService;
    this.marketPromise = null;
    this.scoreCache = new WeakMap();
    // 仅缓存与装备 HRID、市场价格无关的强化期望值，供相同强化参数的装备共用。
    this.enhancementExpectationCache = new Map();
    // v26 强化流表缓存：同一目标等级与成功加成只构建一次，供多件装备共用。
    this.v26FlowTableCache = new Map();
    // v26 获取成本链索引缓存：同一客户端数据只构建一次动作产出索引与商店奖励索引。
    this.v26ActionOutputIndexSource = null;
    this.v26ActionOutputIndexes = null;
    this.v26ShopRewardIndexSource = null;
    this.v26ShopRewardIndex = null;
    this.v26GuildCreditHridsSource = null;
    this.v26GuildCreditHridsCache = null;
    this.enhancementSuccessRates = Object.freeze([
      50, 45, 45, 40, 40,
      40, 35, 35, 35, 35,
      30, 30, 30, 30, 30,
      30, 30, 30, 30, 30
    ]);
    this.phiMirrorFibonacci = Object.freeze([
      0, 1, 1, 2, 3,
      5, 8, 13, 21, 34,
      55, 89, 144, 233, 377,
      610, 987, 1597, 2584, 4181
    ]);
    this.inputDefaults = {
      enhancingLevel: 125,
      laboratoryLevel: 6,
      enhancerBonus: 5.42,
      gloveBonus: 12.9,
      teaEnhancing: false,
      teaSuperEnhancing: false,
      teaUltraEnhancing: true,
      teaBlessed: true,
      priceAskBidRatio: 1
    };
    Object.assign(
      this,
      buildScoreLegacyCalculators,
      buildScoreEnhancementMethods,
      buildScoreV26EnhancementMethods,
      buildScoreNewCalculators
    );
  }

  calculate(cardData, useNewBuildScore = true) {
    const {i18n} = this.ctx;
    if (!cardData || typeof cardData !== 'object') return Promise.reject(new Error(i18n.t('invalidCharacterCardData')));
    const mode = Boolean(useNewBuildScore);
    const cached = this.scoreCache.get(cardData);
    if (cached && cached.mode === mode) return cached.promise;
    const promise = this._calculate(cardData, mode);
    this.scoreCache.set(cardData, {mode, promise});
    return promise;
  }

  async _calculate(cardData, useNewBuildScore) {
    const {DataHub, i18n} = this.ctx;
    DataHub.initClientDataFromCache();
    const clientData = DataHub.clientData.raw;
    if (!clientData?.itemDetailMap || !clientData?.houseRoomDetailMap || !clientData?.levelExperienceTable) {
      throw new Error(i18n.t('clientDataUnavailable'));
    }
    if (!this.marketPromise) {
      this.marketPromise = this.marketService.load().catch((error) => {
        this.marketPromise = null;
        throw error;
      });
    }
    await this.marketPromise;

    const equipmentHidden = cardData.hideWearableItems || cardData.dataAvailability?.equipment === false;
    if (useNewBuildScore) {
      return this._calculateNew(cardData, clientData, equipmentHidden);
    }
    return this._calculateLegacy(cardData, clientData, equipmentHidden);
  }

  _calculateLegacy(cardData, clientData, equipmentHidden) {
    const houseScore = this._calculateHouseScore(cardData, clientData);
    if (equipmentHidden) {
      return {total: houseScore, house: houseScore, ability: 0, equipment: 0, equipmentHidden: true, newVersion: false};
    }
    const abilityScore = this._calculateAbilityScore(cardData, clientData);
    const equipmentScore = this._calculateEquipmentScore(cardData, clientData);
    return {
      total: houseScore + abilityScore + equipmentScore,
      house: houseScore,
      ability: abilityScore,
      equipment: equipmentScore,
      equipmentHidden: false,
      newVersion: false
    };
  }

  // 与 MWITools createScoreResult 一致：返回战斗/生活两套分数。
  // 战斗分 = 战斗房屋 + 技能 + 战斗装备 + 战斗神龛；生活分 = 生活房屋 + 工具 + 生活装备 + 生活神龛。
  _calculateNew(cardData, clientData, equipmentHidden) {
    // 获取成本链上下文：单次评分内共享结果缓存并做循环检测，与 MWITools 的 context 语义一致。
    const valuationContext = {cache: new Map(), visited: new Set()};
    const houseScores = this._calculateHouseScores(cardData, clientData);
    // 公会神龛分（MWITools v26.4.14 起计入）：战斗/生活各自有效时累加，不可估值组不计入。
    const shrineScores = this._v26GuildShrineScores(cardData, clientData, valuationContext);
    const allAbilities = cardData.abilities || [];
    const equippedAbilities = allAbilities.filter((ability) => Number(ability.slotNumber) > 0);
    // 装备隐藏时与 v26 一致：技能分与装备分都归零，房屋与神龛仍计入。
    const abilityScore = equipmentHidden
      ? 0
      : this._calculateNewAbilityScore(equippedAbilities.length ? equippedAbilities : allAbilities, clientData);
    const gearScores = equipmentHidden
      ? {combatEquipment: 0, skillingTools: 0, skillingEquipment: 0}
      : this._calculateGearScores(cardData, clientData, valuationContext);
    const battle = {
      house: houseScores.combat,
      abilities: abilityScore,
      equipment: gearScores.combatEquipment,
      shrine: shrineScores.battle
    };
    battle.total =
      battle.house + battle.abilities + battle.equipment + (Number.isFinite(battle.shrine) ? battle.shrine : 0);
    const skilling = {
      house: houseScores.skilling,
      tools: gearScores.skillingTools,
      equipment: gearScores.skillingEquipment,
      shrine: shrineScores.skilling,
      available: !equipmentHidden
    };
    skilling.total =
      skilling.house + skilling.tools + skilling.equipment + (Number.isFinite(skilling.shrine) ? skilling.shrine : 0);
    return {
      battle,
      skilling,
      equipmentHidden,
      newVersion: true
    };
  }
}
