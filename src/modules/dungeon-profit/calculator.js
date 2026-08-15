import {COWBELL_BAG_FALLBACK_PRICE, COWBELL_TAX_MULTIPLIER, MARKET_TAX_MULTIPLIER} from '../../common/constants.js';

// 官方宝箱数量公式：Chests = 5 ÷ Party Size × (1 + Combat Drop Quantity)。
// 战斗掉落数量固定按 29.5% 处理，5 人基准下每车普通宝箱期望为 5/5 × 1.295 = 1.295。
const DUNGEON_COMBAT_DROP_QUANTITY = 0.295;
const DUNGEON_NORMAL_CHEST_EXPECTATION = 5 * (1 + DUNGEON_COMBAT_DROP_QUANTITY);
const DUNGEON_REFINEMENT_RATE_BY_TIER = Object.freeze([
  0, 0.33, 1
]);

// dungeon-profit-calculation-methods
const dungeonProfitCalculationMethods = {
  calculate({
    actionHrid,
    difficultyTier = 0,
    partySize = 5,
    clearMinutes,
    dailyConsumablesCost = 0,
    useArtisanTea = false,
    useGuzzlingPouch = true,
    guzzlingLevel = 0,
    excludeBackEquipmentValue = false,
    customMode = false,
    customKeySource = 'materials',
    customBuySide = 'ask',
    customSellSide = 'ask'
  }) {
    const {DataHub} = this.ctx;
    const action = DataHub.getClientDataMap('actionDetailMap')?.[actionHrid];
    const dungeonInfo = action?.combatZoneInfo?.dungeonInfo;
    const minutes = Number(clearMinutes);
    if (!dungeonInfo || !(minutes > 0)) return null;

    const tier = Math.max(0, Math.min(2, Math.trunc(Number(difficultyTier) || 0)));
    const refinementRate = DUNGEON_REFINEMENT_RATE_BY_TIER[tier];
    const size = Math.max(1, Math.min(5, Math.trunc(Number(partySize) || 5)));
    const clears = (24 * 60) / minutes;
    // 官方公式：每车普通宝箱 = 5 ÷ 队伍人数 × (1 + 战斗掉落数量)。
    const normalPerRun = DUNGEON_NORMAL_CHEST_EXPECTATION / size;
    const refinementPerRun = normalPerRun * refinementRate;
    const totalChestPerRun = normalPerRun + refinementPerRun;
    const normalQuantity = clears * normalPerRun;
    const refinementQuantity = clears * refinementPerRun;
    const totalChestQuantity = normalQuantity + refinementQuantity;
    // 地下城结束奖励按上述宝箱期望生成，战斗掉落率等其他 Buff 不参与。
    const createRewards = (normalChestQuantity, refinementChestQuantity) =>
      (dungeonInfo.rewardDropTable || []).map((drop) => ({
        ...drop,
        isRefinement: String(drop.itemHrid || '').includes('_refinement_chest'),
        quantity: String(drop.itemHrid || '').includes('_refinement_chest')
          ? refinementChestQuantity
          : normalChestQuantity
      }));
    const rewards = createRewards(normalQuantity, refinementQuantity);
    const rewardsPerRun = createRewards(normalPerRun, refinementPerRun);
    const expectation = this.calculateExpectedChestDrops(rewards);
    const expectationPerRun = this.calculateExpectedChestDrops(rewardsPerRun);
    const ticketHrid = dungeonInfo.keyItemHrid;
    const materialSettings = this.getMaterialSettings(useArtisanTea, useGuzzlingPouch, guzzlingLevel);
    const missingPrices = new Set();
    const tokenValues = this.getTokenValues(true);
    const outputOptions = {excludeBackEquipmentValue};
    const normalOutput = this.valueExpectedDrops(
      expectation.normalDrops,
      tokenValues,
      true,
      missingPrices,
      outputOptions
    );
    const refinementOutput = this.valueExpectedDrops(
      expectation.refinementDrops,
      tokenValues,
      true,
      missingPrices,
      outputOptions
    );
    const allDrops = new Map(expectation.normalDrops);
    expectation.refinementDrops.forEach((quantity, itemHrid) => {
      allDrops.set(itemHrid, Number(allDrops.get(itemHrid) || 0) + quantity);
    });
    const totalOutput = this.valueExpectedDrops(allDrops, tokenValues, true, missingPrices, outputOptions);
    const createOpeningKeyQuantities = (dailyKeys, perRunKeys) =>
      [
        ...new Set([
          ...dailyKeys.keys(), ...perRunKeys.keys()
        ])
      ].map((itemHrid) => ({
        itemHrid,
        quantity: dailyKeys.get(itemHrid) || 0,
        quantityPerRun: perRunKeys.get(itemHrid) || 0
      }));
    const openingKeyQuantities = createOpeningKeyQuantities(expectation.openingKeys, expectationPerRun.openingKeys);
    const normalOpeningKeyQuantities = createOpeningKeyQuantities(
      expectation.normalOpeningKeys,
      expectationPerRun.normalOpeningKeys
    );
    const refinementOpeningKeyQuantities = createOpeningKeyQuantities(
      expectation.refinementOpeningKeys,
      expectationPerRun.refinementOpeningKeys
    );

    const ticketQuantity = normalQuantity;
    const ticketQuantityPerRun = normalPerRun;
    const openingKeyQuantity = openingKeyQuantities.reduce((sum, key) => sum + key.quantity, 0);
    const openingKeyQuantityPerRun = openingKeyQuantities.reduce((sum, key) => sum + key.quantityPerRun, 0);
    const dailyConsumablesCostCoins = Math.max(0, Number(dailyConsumablesCost) || 0) * 1_000_000;
    const totalRevenueConservative = totalOutput.bidTotal;
    const totalRevenueOptimistic = totalOutput.askTotal;
    // 两种钥匙来源共享宝箱产出，分别计算制作成本和成品购买成本。
    const buildCostScenario = (costMode) => {
      const ticketPrices = {
        ask: this.getCostPrice(ticketHrid, 'ask', costMode, materialSettings.materialMultiplier),
        bid: this.getCostPrice(ticketHrid, 'bid', costMode, materialSettings.materialMultiplier)
      };
      this.collectMissingCostPrices(ticketHrid, costMode, missingPrices);
      const openingKeys = openingKeyQuantities.map((key) => {
        const ask = this.getCostPrice(key.itemHrid, 'ask', costMode, materialSettings.materialMultiplier);
        const bid = this.getCostPrice(key.itemHrid, 'bid', costMode, materialSettings.materialMultiplier);
        this.collectMissingCostPrices(key.itemHrid, costMode, missingPrices);
        return {...key, ask, bid};
      });
      const ticketCostConservative = ticketQuantity * ticketPrices.ask;
      const ticketCostOptimistic = ticketQuantity * ticketPrices.bid;
      const openingCostConservative = openingKeys.reduce((sum, key) => sum + key.quantity * key.ask, 0);
      const openingCostOptimistic = openingKeys.reduce((sum, key) => sum + key.quantity * key.bid, 0);
      // 普通宝箱和精炼宝箱分别归集开箱钥匙成本，避免两类宝箱互相分摊。
      const openingKeyPriceMap = new Map(
        openingKeys.map((key) => [
          key.itemHrid, key
        ])
      );
      const calculateOpeningCost = (keys, side) =>
        keys.reduce((sum, key) => sum + key.quantity * Number(openingKeyPriceMap.get(key.itemHrid)?.[side] || 0), 0);
      const normalOpeningCostConservative = calculateOpeningCost(normalOpeningKeyQuantities, 'ask');
      const normalOpeningCostOptimistic = calculateOpeningCost(normalOpeningKeyQuantities, 'bid');
      const refinementOpeningCostConservative = calculateOpeningCost(refinementOpeningKeyQuantities, 'ask');
      const refinementOpeningCostOptimistic = calculateOpeningCost(refinementOpeningKeyQuantities, 'bid');
      const totalCostConservative = ticketCostConservative + openingCostConservative + dailyConsumablesCostCoins;
      const totalCostOptimistic = ticketCostOptimistic + openingCostOptimistic + dailyConsumablesCostCoins;
      // 门票只归入普通宝箱成本；精炼宝箱仅扣除对应的开箱钥匙成本。
      const normalChestDailyProfitConservative =
        normalOutput.bidTotal - ticketCostConservative - normalOpeningCostConservative;
      const normalChestDailyProfitOptimistic =
        normalOutput.askTotal - ticketCostOptimistic - normalOpeningCostOptimistic;
      const refinementChestDailyProfitConservative = refinementOutput.bidTotal - refinementOpeningCostConservative;
      const refinementChestDailyProfitOptimistic = refinementOutput.askTotal - refinementOpeningCostOptimistic;
      const normalChestUnitProfitConservative =
        normalQuantity > 0 ? normalChestDailyProfitConservative / normalQuantity : 0;
      const normalChestUnitProfitOptimistic =
        normalQuantity > 0 ? normalChestDailyProfitOptimistic / normalQuantity : 0;
      const refinementChestUnitProfitConservative =
        refinementQuantity > 0 ? refinementChestDailyProfitConservative / refinementQuantity : 0;
      const refinementChestUnitProfitOptimistic =
        refinementQuantity > 0 ? refinementChestDailyProfitOptimistic / refinementQuantity : 0;
      const profitConservative =
        normalChestDailyProfitConservative + refinementChestDailyProfitConservative - dailyConsumablesCostCoins;
      const profitOptimistic =
        normalChestDailyProfitOptimistic + refinementChestDailyProfitOptimistic - dailyConsumablesCostCoins;
      return {
        ticketPrices,
        openingKeys,
        ticketCostConservative,
        ticketCostOptimistic,
        openingCostConservative,
        openingCostOptimistic,
        normalOpeningCostConservative,
        normalOpeningCostOptimistic,
        refinementOpeningCostConservative,
        refinementOpeningCostOptimistic,
        totalCostConservative,
        totalCostOptimistic,
        normalChestUnitProfitConservative,
        normalChestUnitProfitOptimistic,
        refinementChestUnitProfitConservative,
        refinementChestUnitProfitOptimistic,
        profitConservative,
        profitOptimistic,
        profitPerRunConservative: clears > 0 ? profitConservative / clears : 0,
        profitPerRunOptimistic: clears > 0 ? profitOptimistic / clears : 0
      };
    };
    const costScenarios = {materials: buildCostScenario('materials'), market: buildCostScenario('market')};
    // 自定义模式复用已计算的制作/购买成本；买入和卖出档位独立组合，不重复计算宝箱产出。
    const keySource = customKeySource === 'market' ? 'market' : 'materials';
    const buySide = customBuySide === 'bid' ? 'bid' : 'ask';
    const sellSide = customSellSide === 'bid' ? 'bid' : 'ask';
    const selectedCosts = costScenarios[keySource];
    const isAskBuy = buySide === 'ask';
    const ticketCost = isAskBuy ? selectedCosts.ticketCostConservative : selectedCosts.ticketCostOptimistic;
    const openingCost = isAskBuy ? selectedCosts.openingCostConservative : selectedCosts.openingCostOptimistic;
    const normalOpeningCost = isAskBuy
      ? selectedCosts.normalOpeningCostConservative
      : selectedCosts.normalOpeningCostOptimistic;
    const refinementOpeningCost = isAskBuy
      ? selectedCosts.refinementOpeningCostConservative
      : selectedCosts.refinementOpeningCostOptimistic;
    const normalRevenue = sellSide === 'ask' ? normalOutput.askTotal : normalOutput.bidTotal;
    const refinementRevenue = sellSide === 'ask' ? refinementOutput.askTotal : refinementOutput.bidTotal;
    const normalChestDailyProfit = normalRevenue - ticketCost - normalOpeningCost;
    const refinementChestDailyProfit = refinementRevenue - refinementOpeningCost;
    const profit = normalChestDailyProfit + refinementChestDailyProfit - dailyConsumablesCostCoins;
    const customScenario = {
      keySource,
      buySide,
      sellSide,
      ticketPrice: selectedCosts.ticketPrices[buySide],
      openingKeyPrice: selectedCosts.openingKeys[0]?.[buySide] || 0,
      ticketCost,
      openingCost,
      totalCost: ticketCost + openingCost + dailyConsumablesCostCoins,
      normalChestUnitProfit: normalQuantity > 0 ? normalChestDailyProfit / normalQuantity : 0,
      refinementChestUnitProfit: refinementQuantity > 0 ? refinementChestDailyProfit / refinementQuantity : 0,
      profit,
      profitPerRun: clears > 0 ? profit / clears : 0
    };

    return {
      action,
      difficultyTier: tier,
      partySize: size,
      clears,
      ticketHrid,
      ticketQuantity,
      ticketQuantityPerRun,
      normalPerRun,
      refinementPerRun,
      totalChestPerRun,
      normalQuantity,
      refinementQuantity,
      totalChestQuantity,
      openingKeys: openingKeyQuantities,
      openingKeyQuantity,
      openingKeyQuantityPerRun,
      expectedDrops: totalOutput.items,
      normalRevenueConservative: normalOutput.bidTotal,
      normalRevenueOptimistic: normalOutput.askTotal,
      refinementRevenueConservative: refinementOutput.bidTotal,
      refinementRevenueOptimistic: refinementOutput.askTotal,
      totalRevenueConservative,
      totalRevenueOptimistic,
      dailyConsumablesCost: dailyConsumablesCostCoins,
      costScenarios,
      customMode: Boolean(customMode),
      customScenario,
      ...materialSettings,
      missingPrices: [
        ...missingPrices
      ]
    };
  }
};

// dungeon-profit-data-methods
const dungeonProfitDataMethods = {
  getDungeons() {
    const {DataHub} = this.ctx;
    return Object.values(DataHub.getClientDataMap('actionDetailMap'))
      .filter((action) => action?.combatZoneInfo?.isDungeon && action?.combatZoneInfo?.dungeonInfo)
      .sort((left, right) => Number(left.sortIndex || 0) - Number(right.sortIndex || 0));
  },

  getDropRate(drop, difficultyTier = 0) {
    if (!drop) return 0;
    const tier = Math.max(0, Math.trunc(Number(difficultyTier) || 0));
    const scaledRate = Array.isArray(drop.dropRate)
      ? Number(drop.dropRate[tier] || 0)
      : (Number(drop.dropRate || 0) + Number(drop.dropRatePerDifficultyTier || 0) * tier) * (1 + 0.1 * tier);
    return Math.max(0, Math.min(1, scaledRate));
  },

  getExpectedCount(drop, difficultyTier = 0) {
    if (!drop) return 0;
    const averageCount = (Number(drop.minCount || 0) + Number(drop.maxCount || 0)) / 2;
    return this.getDropRate(drop, difficultyTier) * averageCount;
  }
};

// dungeon-profit-pricing-methods
const dungeonProfitPricingMethods = {
  getDirectPrice(itemHrid, side, applyMarketTax = false) {
    if (itemHrid === '/items/coin') return 1;
    const special = this.specialPriceSources[itemHrid];
    const marketHrid = special?.itemHrid || itemHrid;
    // 牛铃袋按 18% 特殊税率折算，其余物品统一按普通市场税。
    const taxMultiplier = marketHrid === '/items/bag_of_10_cowbells' ? COWBELL_TAX_MULTIPLIER : MARKET_TAX_MULTIPLIER;
    const row = this.marketService.getMarketRow(marketHrid, 0);
    const getPositivePrice = (rawValue) => {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    let value = getPositivePrice(side === 'ask' ? row?.a : row?.b);
    if (!value && side === 'ask') {
      const bid = getPositivePrice(row?.b);
      if (bid) value = Math.ceil(bid / taxMultiplier);
    }
    if (!value) value = getPositivePrice(row?.p);
    // 挂单与最近成交都缺失时取官方市场价值（市场指导价），比参考价更贴近官方口径。
    if (!value) value = getPositivePrice(this.marketService?.getMarketValue?.(marketHrid, 0));
    // 牛铃袋连市场价值也缺失时按参考兜底价估值，牛铃经 divisor 同步继承，避免宝箱牛铃收益算成 0。
    if (!value && marketHrid === '/items/bag_of_10_cowbells') {
      value = COWBELL_BAG_FALLBACK_PRICE;
    }
    if (applyMarketTax && value > 0) {
      value = Math.floor(value * taxMultiplier);
    }
    return value / (special?.divisor || 1);
  },

  getProductionRecipe(itemHrid) {
    const {DataHub} = this.ctx;
    const clientData = DataHub.getClientData() || {};
    if (this.recipeCache?.clientData !== clientData) {
      const recipes = new Map();
      Object.values(clientData.actionDetailMap || {}).forEach((action) => {
        if (!Array.isArray(action?.inputItems) || !Array.isArray(action?.outputItems)) return;
        action.outputItems.forEach((output) => {
          if (output?.itemHrid && Number(output.count) > 0 && !recipes.has(output.itemHrid)) {
            recipes.set(output.itemHrid, {action, outputCount: Number(output.count)});
          }
        });
      });
      this.recipeCache = {clientData, recipes};
    }
    return this.recipeCache.recipes.get(itemHrid) || null;
  },

  getMaterialSettings(useArtisanTea, useGuzzlingPouch = true, guzzlingLevel = 0) {
    const {DataHub} = this.ctx;
    if (!useArtisanTea) return {materialMultiplier: 1, artisan: 0, drinkConcentration: 0};
    const itemMap = DataHub.getClientDataMap('itemDetailMap');
    const artisanTea = itemMap?.['/items/artisan_tea'];
    const artisanBuff = artisanTea?.consumableDetail?.buffs?.find((buff) => buff.typeHrid === '/buff_types/artisan');
    const guzzlingPouch = itemMap?.['/items/guzzling_pouch']?.equipmentDetail;
    const level = Math.max(0, Math.min(20, Math.trunc(Number(guzzlingLevel) || 0)));
    const baseConcentration = Number(guzzlingPouch?.noncombatStats?.drinkConcentration || 0);
    const concentrationPerLevel = Number(guzzlingPouch?.noncombatEnhancementBonuses?.drinkConcentration || 0);
    const drinkConcentration = useGuzzlingPouch ? baseConcentration + level * concentrationPerLevel : 0;
    const artisan = Math.max(0, Math.min(1, Number(artisanBuff?.flatBoost || 0) * (1 + drinkConcentration)));
    return {materialMultiplier: 1 - artisan, artisan, drinkConcentration};
  },

  getCostPrice(itemHrid, side, costMode, materialMultiplier) {
    if (costMode !== 'materials') return this.getDirectPrice(itemHrid, side);
    const recipe = this.getProductionRecipe(itemHrid);
    if (!recipe) return 0;
    return recipe.action.inputItems.reduce((sum, input) => {
      const countPerItem = Number(input.count || 0) / recipe.outputCount;
      return sum + countPerItem * materialMultiplier * this.getDirectPrice(input.itemHrid, side);
    }, 0);
  },

  collectMissingCostPrices(itemHrid, costMode, missing) {
    if (costMode !== 'materials') {
      if (!this.getDirectPrice(itemHrid, 'ask') && !this.getDirectPrice(itemHrid, 'bid')) missing.add(itemHrid);
      return;
    }
    const recipe = this.getProductionRecipe(itemHrid);
    if (!recipe) {
      missing.add(itemHrid);
      return;
    }
    recipe.action.inputItems.forEach((input) => {
      if (input.itemHrid === '/items/coin') return;
      if (!this.getDirectPrice(input.itemHrid, 'ask') && !this.getDirectPrice(input.itemHrid, 'bid')) {
        missing.add(input.itemHrid);
      }
    });
  },

  isBackEquipment(itemHrid) {
    const {DataHub} = this.ctx;
    const item = DataHub.getClientDataMap('itemDetailMap')?.[itemHrid];
    return item?.equipmentDetail?.type === '/equipment_types/back';
  }
};

// dungeon-profit-expectation-methods
const dungeonProfitExpectationMethods = {
  calculateExpectedChestDrops(rewards) {
    const {DataHub} = this.ctx;
    const clientData = DataHub.getClientData() || {};
    const lootMap = clientData.openableLootDropMap || {};
    const itemMap = clientData.itemDetailMap || {};
    const normalDrops = new Map();
    const refinementDrops = new Map();
    const openingKeys = new Map();
    const normalOpeningKeys = new Map();
    const refinementOpeningKeys = new Map();
    const addDrop = (target, itemHrid, quantity) => {
      target.set(itemHrid, Number(target.get(itemHrid) || 0) + quantity);
    };
    const expandChest = (itemHrid, quantity, target, targetOpeningKeys, stack = new Set()) => {
      if (!(quantity > 0)) return;
      // 牛铃袋保留为直接市场估值，不递归展开成牛铃：牛铃再按牛铃袋折算会形成估值环，
      // 牛铃袋缺价时会把两者都算成 0，与康康运气的口径一致。
      const drops = itemHrid === '/items/bag_of_10_cowbells' ? null : lootMap[itemHrid];
      if (!Array.isArray(drops)) {
        addDrop(target, itemHrid, quantity);
        return;
      }
      const keyHrid = itemMap[itemHrid]?.openKeyItemHrid;
      if (keyHrid) {
        addDrop(openingKeys, keyHrid, quantity);
        addDrop(targetOpeningKeys, keyHrid, quantity);
      }
      if (stack.has(itemHrid)) {
        addDrop(target, itemHrid, quantity);
        return;
      }
      stack.add(itemHrid);
      drops.forEach((drop) => {
        const expectedQuantity = quantity * this.getExpectedCount(drop);
        if (expectedQuantity > 0) expandChest(drop.itemHrid, expectedQuantity, target, targetOpeningKeys, stack);
      });
      stack.delete(itemHrid);
    };

    rewards.forEach((reward) => {
      const target = reward.isRefinement ? refinementDrops : normalDrops;
      const targetOpeningKeys = reward.isRefinement ? refinementOpeningKeys : normalOpeningKeys;
      expandChest(reward.itemHrid, reward.quantity, target, targetOpeningKeys);
    });

    return {normalDrops, refinementDrops, openingKeys, normalOpeningKeys, refinementOpeningKeys};
  },

  getTokenValues(applyMarketTax = true) {
    const {DataHub} = this.ctx;
    const clientData = DataHub.getClientData() || {};
    const marketData = this.marketService.marketData;
    if (
      this.valuationCache?.clientData === clientData &&
      this.valuationCache?.marketData === marketData &&
      this.valuationCache?.applyMarketTax === applyMarketTax
    ) {
      return this.valuationCache.tokenValues;
    }
    const tokenValues = {ask: new Map(), bid: new Map()};
    for (let iteration = 0; iteration < 20; iteration++) {
      Object.values(clientData.shopItemDetailMap || {}).forEach((shopItem) => {
        const costs = Array.isArray(shopItem?.costs) ? shopItem.costs : [];
        if (!costs.length) return;
        [
          'ask', 'bid'
        ].forEach((side) => {
          const outputValue =
            tokenValues[side].get(shopItem.itemHrid) || this.getDirectPrice(shopItem.itemHrid, side, applyMarketTax);
          costs.forEach((cost) => {
            if (!cost?.itemHrid || cost.itemHrid === '/items/coin' || Number(cost.count) <= 0) return;
            const value = outputValue / (costs.length * Number(cost.count));
            if (value > Number(tokenValues[side].get(cost.itemHrid) || 0)) {
              tokenValues[side].set(cost.itemHrid, value);
            }
          });
        });
      });
    }
    this.valuationCache = {clientData, marketData, applyMarketTax, tokenValues};
    return tokenValues;
  },

  valueExpectedDrops(drops, tokenValues, applyMarketTax, missing, options = {}) {
    let askTotal = 0;
    let bidTotal = 0;
    const items = [
      ...drops.entries()
    ].map(
      ([
        itemHrid, quantity
      ]) => {
        const isExcludedBackEquipment = options.excludeBackEquipmentValue && this.isBackEquipment(itemHrid);
        const ask = isExcludedBackEquipment
          ? 0
          : Number(tokenValues.ask.get(itemHrid) || this.getDirectPrice(itemHrid, 'ask', applyMarketTax));
        const bid = isExcludedBackEquipment
          ? 0
          : Number(tokenValues.bid.get(itemHrid) || this.getDirectPrice(itemHrid, 'bid', applyMarketTax));
        if (!isExcludedBackEquipment && itemHrid !== '/items/coin' && ask <= 0 && bid <= 0) missing.add(itemHrid);
        const askValue = quantity * ask;
        const bidValue = quantity * bid;
        askTotal += askValue;
        bidTotal += bidValue;
        return {itemHrid, quantity, ask, bid, askValue, bidValue};
      }
    );
    return {items, askTotal, bidTotal};
  }
};

// dungeon-profit-calculator-service
export class DungeonProfitCalculatorService {
  constructor(ctx, marketService) {
    this.ctx = ctx;
    this.marketService = marketService;
    this.valuationCache = null;
    this.recipeCache = null;
    this.specialPriceSources = Object.freeze({
      '/items/cowbell': {itemHrid: '/items/bag_of_10_cowbells', divisor: 10},
      '/items/chimerical_quiver': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/sinister_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/enchanted_cloak': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/gatherer_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/artificer_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/culinary_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
      '/items/chance_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1}
    });

    Object.assign(
      this,
      dungeonProfitDataMethods,
      dungeonProfitPricingMethods,
      dungeonProfitExpectationMethods,
      dungeonProfitCalculationMethods
    );
  }
}
