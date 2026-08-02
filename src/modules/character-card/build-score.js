// build-score-score-calculators
const buildScoreScoreCalculators = {
  _calculateHouseScore(cardData, clientData) {
    const battleHouseIds = new Set([
      'dining_room', 'library', 'dojo', 'gym', 'armory',
      'archery_range', 'mystical_study'
    ]);
    let cost = 0;
    Object.entries(cardData.characterHouseRoomMap || cardData.houseRooms || {}).forEach(
      ([
        key, room
      ]) => {
        const houseRoomHrid = room?.houseRoomHrid || (key.startsWith('/house_rooms/') ? key : '');
        const houseId = houseRoomHrid.split('/').pop();
        if (!battleHouseIds.has(houseId)) return;
        const level = Number(typeof room === 'object' ? room?.level : room) || 0;
        const upgradeCostsMap = clientData.houseRoomDetailMap[houseRoomHrid]?.upgradeCostsMap || {};
        for (let currentLevel = 1; currentLevel <= level; currentLevel++) {
          (upgradeCostsMap[currentLevel] || []).forEach((item) => {
            cost += Number(item.count || 0) * this._getWeightedMarketPrice(item.itemHrid);
          });
        }
      }
    );
    return cost / 1_000_000;
  },

  _calculateAbilityScore(cardData, clientData) {
    const basicAbilityIds = [
      'poke', 'scratch', 'smack', 'quick_shot', 'water_strike',
      'fireball', 'entangle', 'minor_heal'
    ];
    const allAbilities = cardData.abilities || [];
    const equippedAbilities = allAbilities.filter((ability) => Number(ability.slotNumber) > 0);
    const abilities = equippedAbilities.length ? equippedAbilities : allAbilities;
    let cost = 0;
    abilities.forEach((ability) => {
      const targetLevel = Number(ability.level || 0);
      const experience = Number(clientData.levelExperienceTable[targetLevel] || 0);
      const experiencePerBook = basicAbilityIds.some((id) => ability.abilityHrid?.includes(id)) ? 50 : 500;
      const bookCount = Number((experience / experiencePerBook + 1).toFixed(1));
      const itemHrid = String(ability.abilityHrid || '').replace('/abilities/', '/items/');
      cost += bookCount * this._getWeightedMarketPrice(itemHrid);
    });
    return cost / 1_000_000;
  },

  _calculateEquipmentScore(cardData, clientData) {
    const equipment = cardData.player?.equipment || cardData.player?.characterItems || [];
    let networthAsk = 0;
    let networthBid = 0;
    for (const item of equipment) {
      const count = Number(item.count || 1);
      const enhancementLevel = Number(item.enhancementLevel || 0);
      if (enhancementLevel > 1) {
        const best = this._findBestEnhanceStrategyWithPhiMirror(item.itemHrid, enhancementLevel, clientData);
        const totalCost = best?.totalCost ? Math.round(best.totalCost) : 0;
        networthAsk += count * Math.max(totalCost, 0);
        networthBid += count * Math.max(totalCost, 0);
        continue;
      }
      const marketRow = this.marketService.getMarketRow(item.itemHrid, 0);
      if (!marketRow) continue;
      networthAsk += count * (Number(marketRow.a) > 0 ? Number(marketRow.a) : 0);
      networthBid += count * (Number(marketRow.b) > 0 ? Number(marketRow.b) : 0);
    }
    return (networthAsk * 0.5 + networthBid * 0.5) / 1_000_000;
  }
};

// build-score-market-methods
const buildScoreMarketMethods = {
  _getWeightedMarketPrice(itemHrid, ratio = 0.5) {
    if (itemHrid === '/items/coin') return 1;
    const row = this.marketService.getMarketRow(itemHrid, 0);
    if (!row) return 0;
    let ask = Number(row.a);
    let bid = Number(row.b);
    if (ask > 0 && bid < 0) bid = ask;
    if (bid > 0 && ask < 0) ask = bid;
    if (!Number.isFinite(ask) || !Number.isFinite(bid)) return 0;
    return ask * ratio + bid * (1 - ratio);
  },

  _getItemMarketPrice(itemHrid, ratio = this.inputDefaults.priceAskBidRatio) {
    if (itemHrid === '/items/coin') return 1;
    const row = this.marketService.getMarketRow(itemHrid, 0);
    if (!row || (Number(row.a) < 0 && Number(row.b) < 0)) return 0;
    const ask = Number(row.a);
    const bid = Number(row.b);
    if (ask > 0 && bid < 0) return ask;
    if (bid > 0 && ask < 0) return bid;
    return ask * ratio + bid * (1 - ratio);
  },

  _getRealisticBaseItemPrice(itemHrid, clientData) {
    const itemDetail = clientData.itemDetailMap[itemHrid];
    const productionCost = this._getBaseItemProductionCost(itemDetail?.name, clientData);
    const row = this.marketService.getMarketRow(itemHrid, 0);
    const ask = Number(row?.a);
    const bid = Number(row?.b);
    if (ask > 0) {
      if (bid > 0) return ask / bid > 1.3 ? Math.max(bid, productionCost) : ask;
      return ask / productionCost > 1.3 ? productionCost : Math.max(ask, productionCost);
    }
    return bid > 0 ? Math.max(bid, productionCost) : productionCost;
  },

  _getBaseItemProductionCost(itemName, clientData) {
    const actionHrid = this._getActionHridFromItemName(itemName, clientData.actionDetailMap);
    const action = clientData.actionDetailMap?.[actionHrid];
    if (!action) return -1;
    let cost = (action.inputItems || []).reduce(
      (sum, item) => sum + this._getItemMarketPrice(item.itemHrid) * Number(item.count || 0),
      0
    );
    cost *= 0.9;
    if (action.upgradeItemHrid) cost += this._getItemMarketPrice(action.upgradeItemHrid);
    return cost;
  },

  _getActionHridFromItemName(itemName, actionDetailMap) {
    const {DataHub} = this.ctx;
    if (!itemName) return null;
    const actionName = itemName
      .replace('Milk', 'Cow')
      .replace('Log', 'Tree')
      .replace('Cowing', 'Milking')
      .replace('Rainbow Cow', 'Unicow')
      .replace("Collector's Boots", 'Collectors Boots')
      .replace("Knight's Aegis", 'Knights Aegis');
    const indexedHrid = DataHub.clientData.indexes.actionNameToHrid?.get(actionName);
    if (indexedHrid) return indexedHrid;
    return Object.values(actionDetailMap || {}).find((action) => action?.name === actionName)?.hrid || null;
  }
};

// build-score-enhancement-methods
const buildScoreEnhancementMethods = {
  _findBestEnhanceStrategyWithPhiMirror(itemHrid, enhancementLevel, clientData) {
    const itemCosts = this._getEnhancementCosts(itemHrid, clientData);
    let best = this._findBestEnhanceStrategy(itemHrid, enhancementLevel, clientData, itemCosts);
    const mirrorCost = this._getItemMarketPrice('/items/philosophers_mirror');
    if (!best || mirrorCost <= 0 || enhancementLevel <= 3) return best;

    const refinedHrid = itemHrid;
    const isRefined = itemHrid.includes('_refined');
    const baseItemHrid = isRefined ? itemHrid.replace('_refined', '') : itemHrid;
    const baseItemCosts = isRefined ? this._getEnhancementCosts(baseItemHrid, clientData) : itemCosts;
    const lowerBest = {};
    for (let level = 9; level < enhancementLevel; level++) {
      lowerBest[level] = this._findBestEnhanceStrategy(baseItemHrid, level, clientData, baseItemCosts);
    }

    let refinedCost = 0;
    if (isRefined) {
      const itemName = clientData.itemDetailMap[refinedHrid]?.name;
      const actionHrid = this._getActionHridFromItemName(itemName, clientData.actionDetailMap);
      (clientData.actionDetailMap?.[actionHrid]?.inputItems || []).forEach((item) => {
        refinedCost += this._getItemMarketPrice(item.itemHrid) * Number(item.count || 0);
      });
    }

    for (let protectAt = 10; protectAt < enhancementLevel; protectAt++) {
      if (!lowerBest[protectAt] || !lowerBest[protectAt - 1]) continue;
      const baseCount = this.phiMirrorFibonacci[enhancementLevel - protectAt + 1];
      const inputCount = this.phiMirrorFibonacci[enhancementLevel - protectAt];
      if (baseCount == null || inputCount == null) continue;
      const protectCount = baseCount + inputCount - 1;
      const totalCost =
        baseCount * lowerBest[protectAt].totalCost +
        inputCount * lowerBest[protectAt - 1].totalCost +
        mirrorCost * protectCount +
        refinedCost;
      if (totalCost < best.totalCost) best = {totalCost};
    }
    return best;
  },

  _findBestEnhanceStrategy(itemHrid, enhancementLevel, clientData, costs = null) {
    const enhancementCosts = costs || this._getEnhancementCosts(itemHrid, clientData);
    let best = null;
    for (let protectAt = 2; protectAt <= enhancementLevel; protectAt++) {
      const simulation = this._calculateEnhancementExpectation(itemHrid, enhancementLevel, protectAt, clientData);
      const totalCost =
        enhancementCosts.baseCost +
        enhancementCosts.protectionCost * simulation.protectCount +
        enhancementCosts.perActionCost * simulation.actions;
      if (!best || totalCost < best.totalCost) best = {totalCost};
    }
    return best;
  },

  _calculateEnhancementExpectation(itemHrid, enhancementLevel, protectAt, clientData) {
    const itemLevel = Number(clientData.itemDetailMap[itemHrid]?.itemLevel || 0);
    const defaults = this.inputDefaults;
    const effectiveLevel =
      defaults.enhancingLevel +
      (defaults.teaEnhancing ? 3 : 0) +
      (defaults.teaSuperEnhancing ? 6 : 0) +
      (defaults.teaUltraEnhancing ? 8 : 0);
    const totalBonus =
      effectiveLevel >= itemLevel
        ? 1 + (0.05 * (effectiveLevel + defaults.laboratoryLevel - itemLevel) + defaults.enhancerBonus) / 100
        : 1 - 0.5 * (1 - effectiveLevel / itemLevel) + (0.05 * defaults.laboratoryLevel + defaults.enhancerBonus) / 100;
    const cacheKey = [
      enhancementLevel, protectAt, totalBonus, defaults.teaBlessed ? 1 : 0
    ].join('::');
    const cached = this.enhancementExpectationCache.get(cacheKey);
    if (cached) return cached;
    const transient = Array.from({length: enhancementLevel}, () => Array(enhancementLevel).fill(0));
    for (let level = 0; level < enhancementLevel; level++) {
      const successChance = (this.enhancementSuccessRates[level] / 100) * totalBonus;
      const failureDestination = level >= protectAt ? level - 1 : 0;
      if (defaults.teaBlessed) {
        if (level + 2 < enhancementLevel) transient[level][level + 2] += successChance * 0.01;
        if (level + 1 < enhancementLevel) transient[level][level + 1] += successChance * 0.99;
      } else if (level + 1 < enhancementLevel) {
        transient[level][level + 1] += successChance;
      }
      transient[level][failureDestination] += 1 - successChance;
    }
    const fundamental = this._invertMatrix(
      transient.map((row, rowIndex) => row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : 0) - value))
    );
    const visits = fundamental[0];
    const actions = visits.reduce((sum, value) => sum + value, 0);
    let protectCount = 0;
    for (let level = protectAt; level < enhancementLevel; level++) {
      protectCount += visits[level] * transient[level][level - 1];
    }
    const result = {actions, protectCount};
    this.enhancementExpectationCache.set(cacheKey, result);
    return result;
  },

  // 保留旧版 Gauss-Jordan 运算顺序，使用连续数值数组减少完整逆矩阵计算中的对象分配。
  _invertMatrix(matrix) {
    const size = matrix.length;
    const width = size * 2;
    const augmented = matrix.map((row, rowIndex) => {
      const nextRow = new Float64Array(width);
      for (let column = 0; column < size; column++) nextRow[column] = row[column];
      nextRow[size + rowIndex] = 1;
      return nextRow;
    });
    for (let column = 0; column < size; column++) {
      let pivotRow = column;
      for (let row = column + 1; row < size; row++) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
      }
      if (Math.abs(augmented[pivotRow][column]) < 1e-12) throw new Error('Enhancement matrix is singular');
      [
        augmented[column], augmented[pivotRow]
      ] = [
        augmented[pivotRow], augmented[column]
      ];
      const pivot = augmented[column][column];
      for (let index = 0; index < width; index++) augmented[column][index] /= pivot;
      for (let row = 0; row < size; row++) {
        if (row === column) continue;
        const factor = augmented[row][column];
        if (!factor) continue;
        for (let index = 0; index < width; index++) {
          augmented[row][index] -= factor * augmented[column][index];
        }
      }
    }
    return augmented.map((row) => row.slice(size));
  },

  _getEnhancementCosts(itemHrid, clientData) {
    const itemDetail = clientData.itemDetailMap[itemHrid];
    const baseCost = this._getRealisticBaseItemPrice(itemHrid, clientData);
    const protectionHrids = itemDetail?.protectionItemHrids == null ? [
            itemHrid, '/items/mirror_of_protection'
          ] : [
            itemHrid, '/items/mirror_of_protection', ...itemDetail.protectionItemHrids
          ];
    let protectionCost = null;
    protectionHrids.forEach((protectionHrid, index) => {
      const cost = this._getRealisticBaseItemPrice(protectionHrid, clientData);
      if (index === 0 || (cost > 0 && (protectionCost < 0 || cost < protectionCost))) protectionCost = cost;
    });
    let perActionCost = 0;
    (itemDetail?.enhancementCosts || []).forEach((item) => {
      const price = item.itemHrid.startsWith('/items/trainee_') ? 250000 : this._getItemMarketPrice(item.itemHrid);
      perActionCost += price * Number(item.count || 0);
    });
    return {baseCost, protectionCost: Number(protectionCost || 0), perActionCost};
  }
};

// build-score-service
export class BuildScoreService {
  constructor(ctx, marketService) {
    this.ctx = ctx;
    this.marketService = marketService;
    this.marketPromise = null;
    this.scoreCache = new WeakMap();
    // 仅缓存与装备 HRID、市场价格无关的强化期望值，供相同强化参数的装备共用。
    this.enhancementExpectationCache = new Map();
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
    Object.assign(this, buildScoreScoreCalculators, buildScoreEnhancementMethods, buildScoreMarketMethods);
  }

  calculate(cardData) {
    const {i18n} = this.ctx;
    if (!cardData || typeof cardData !== 'object') return Promise.reject(new Error(i18n.t('invalidCharacterCardData')));
    const cached = this.scoreCache.get(cardData);
    if (cached) return cached;
    const promise = this._calculate(cardData);
    this.scoreCache.set(cardData, promise);
    return promise;
  }

  async _calculate(cardData) {
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

    const houseScore = this._calculateHouseScore(cardData, clientData);
    const equipmentHidden = cardData.hideWearableItems || cardData.dataAvailability?.equipment === false;
    if (equipmentHidden) {
      return {total: houseScore, house: houseScore, ability: 0, equipment: 0, equipmentHidden: true};
    }
    const abilityScore = this._calculateAbilityScore(cardData, clientData);
    const equipmentScore = await this._calculateEquipmentScore(cardData, clientData);
    return {
      total: houseScore + abilityScore + equipmentScore,
      house: houseScore,
      ability: abilityScore,
      equipment: equipmentScore,
      equipmentHidden: false
    };
  }
}
