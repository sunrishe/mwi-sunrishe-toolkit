// build-score-v26（MWITools v26 起的“着装评分”算法，与 legacy.js 战力打造分并行可选）
// 对应参考：references/legacy-scripts/MWITools/MWITools_v26.4.12.js（src/features/build-score.js + calculateEnhancementPlan）
export const buildScoreV26EnhancementMethods = {
  // v26 ENHANCEMENT_PROFILE：强化模拟按顶配预设（140 级、房屋 8 级、星辰强化工具 +14、三件套 +10、幸运披风 +5、超强化茶 8 级）。
  v26EnhancementProfile: Object.freeze({
    playerLevel: 140,
    houseLevel: 8,
    tool: {hrid: '/items/celestial_enhancer', enhancementLevel: 14},
    top: {hrid: '/items/enhancers_top', enhancementLevel: 10},
    bottoms: {hrid: '/items/enhancers_bottoms', enhancementLevel: 10},
    gloves: {hrid: '/items/enchanted_gloves', enhancementLevel: 10},
    cape: {hrid: '/items/chance_cape_refined', enhancementLevel: 5},
    ultraTeaLevel: 8,
    ultraTeaSpeed: 0.06,
    blessedChance: 0.01,
    houseSpeedPerLevel: 0.01,
    houseSuccessPerLevel: 5e-4,
    baseActionSeconds: 12,
    teaDurationSeconds: 300
  }),
  v26DefaultBonusMultipliers: Object.freeze([
    0, 1, 2.1, 3.3, 4.6,
    6, 7.5, 9.1, 10.8, 12.6,
    14.5, 16.7, 19.2, 22, 25.1,
    28.5, 32.2, 36.2, 40.5, 45.1,
    50
  ]),
  // v26 保护物品允许候选：基础物品、官方保护物品、保护之镜中取最便宜。
  _v26ProtectionCandidates(itemHrid, clientData) {
    const itemDetail = clientData.itemDetailMap?.[itemHrid];
    return itemDetail?.protectionItemHrids == null ? [
          itemHrid, '/items/mirror_of_protection'
        ] : [
          itemHrid, '/items/mirror_of_protection', ...itemDetail.protectionItemHrids
        ];
  },

  // 官方强化成功率表（v26 用 initData_enhancementLevelSuccessRateTable，缺失时回退内置表）。
  _v26SuccessRates(clientData) {
    const official = clientData.enhancementLevelSuccessRateTable;
    if (Array.isArray(official) && official.length) return official.map(Number);
    return this.enhancementSuccessRates.map((rate) => rate / 100);
  },

  _v26SuccessRateAt(table, level) {
    const value = Number(table[level] ?? table.at(-1));
    if (!Number.isFinite(value)) return 0;
    return value > 1 ? value / 100 : value;
  },

  _v26NormalizedTable(source, fallback) {
    if (!source) return fallback;
    const values = Array.isArray(source)
      ? source
      : Object.keys(source)
          .sort((left, right) => Number(left) - Number(right))
          .map((key) => source[key]);
    return values.length ? values.map(Number) : fallback;
  },

  // v26 getEnhancementProfileStats：按官方强化加成表与顶配装备的非战斗统计计算成功/速度加成。
  _v26EnhancementProfileStats(itemLevel, clientData) {
    const profile = this.v26EnhancementProfile;
    const bonusTable = this._v26NormalizedTable(
      clientData.enhancementLevelTotalBonusMultiplierTable,
      this.v26DefaultBonusMultipliers
    );
    const itemMap = clientData.itemDetailMap;
    const stat = (equipment, key) => {
      const detail = itemMap?.[equipment.hrid]?.equipmentDetail;
      const base = Number(detail?.noncombatStats?.[key]);
      const perMultiplier = Number(detail?.noncombatEnhancementBonuses?.[key] ?? 0);
      const multiplier = Number(bonusTable[equipment.enhancementLevel]);
      if (!Number.isFinite(base) || !Number.isFinite(multiplier)) return null;
      return base + perMultiplier * multiplier;
    };
    const toolSuccess = stat(profile.tool, 'enhancingSuccess');
    const gloveSpeed = stat(profile.gloves, 'enhancingSpeed');
    const topSpeed = stat(profile.top, 'enhancingSpeed');
    const bottomsSpeed = stat(profile.bottoms, 'enhancingSpeed');
    const capeSpeed = stat(profile.cape, 'enhancingSpeed');
    const targetItemLevel = Number(itemLevel);
    if (
      toolSuccess === null ||
      topSpeed === null ||
      bottomsSpeed === null ||
      gloveSpeed === null ||
      capeSpeed === null ||
      !Number.isFinite(targetItemLevel) ||
      targetItemLevel <= 0
    ) {
      return null;
    }
    const effectiveLevel = profile.playerLevel + profile.ultraTeaLevel;
    const levelSuccess =
      effectiveLevel >= targetItemLevel
        ? (effectiveLevel - targetItemLevel) * 5e-4
        : -0.5 * (1 - effectiveLevel / targetItemLevel);
    const speedBonus =
      gloveSpeed +
      topSpeed +
      bottomsSpeed +
      capeSpeed +
      profile.houseLevel * profile.houseSpeedPerLevel +
      profile.ultraTeaSpeed +
      Math.max(0, effectiveLevel - targetItemLevel) * 0.01;
    return {
      effectiveLevel,
      successBonus: levelSuccess + toolSuccess + profile.houseLevel * profile.houseSuccessPerLevel,
      speedBonus,
      blessedChance: profile.blessedChance,
      secondsPerAction: profile.baseActionSeconds / (1 + speedBonus)
    };
  },

  _v26AddTransition(matrix, from, to, rate, targetLevel) {
    if (rate <= 0 || to >= targetLevel) return;
    matrix[to][from] -= rate;
  },

  // 与 v26 solveLinearSystem 相同的高斯消元（连续数组实现，返回各等级期望访问次数）。
  _v26SolveLinearSystem(matrix, vector) {
    const size = matrix.length;
    const width = size + 1;
    const augmented = matrix.map((row, rowIndex) => {
      const nextRow = new Float64Array(width);
      for (let column = 0; column < size; column++) nextRow[column] = Number(row[column]);
      nextRow[size] = Number(vector[rowIndex]);
      return nextRow;
    });
    for (let column = 0; column < size; column++) {
      let pivot = column;
      for (let row = column + 1; row < size; row++) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
      if (pivot !== column) [
          augmented[pivot], augmented[column]
        ] = [
          augmented[column], augmented[pivot]
        ];
      const divisor = augmented[column][column];
      for (let index = column; index < width; index++) augmented[column][index] /= divisor;
      for (let row = 0; row < size; row++) {
        if (row === column) continue;
        const factor = augmented[row][column];
        if (Math.abs(factor) < 1e-15) continue;
        for (let index = column; index < width; index++) {
          augmented[row][index] -= factor * augmented[column][index];
        }
      }
    }
    const result = augmented.map((row) => row[size]);
    return result.every(Number.isFinite) ? result : null;
  },

  // v26 calculateNormalEnhancementFlowUncached：普通强化流（含祝福茶双升概率）。
  _v26NormalFlowUncached({targetLevel, protectLevel, successRates, successBonus, blessedChance}) {
    if (targetLevel < 1) return null;
    const matrix = Array.from({length: targetLevel}, (_, row) =>
      Array.from({length: targetLevel}, (_2, column) => (row === column ? 1 : 0))
    );
    const source = Array(targetLevel).fill(0);
    source[0] = 1;
    const failRates = [];
    for (let level = 0; level < targetLevel; level++) {
      const success = Math.min(1, this._v26SuccessRateAt(successRates, level) * (1 + successBonus));
      const fail = Math.max(0, 1 - success);
      failRates[level] = fail;
      this._v26AddTransition(matrix, level, level + 1, success * (1 - blessedChance), targetLevel);
      this._v26AddTransition(matrix, level, level + 2, success * blessedChance, targetLevel);
      const failLevel = level >= protectLevel ? Math.max(0, level - 1) : 0;
      this._v26AddTransition(matrix, level, failLevel, fail, targetLevel);
    }
    const actionsByLevel = this._v26SolveLinearSystem(matrix, source);
    if (!actionsByLevel || actionsByLevel.some((value) => value < -1e-9 || !Number.isFinite(value))) {
      return null;
    }
    const normalizedActions = actionsByLevel.map((value) => (Math.abs(value) < 1e-9 ? 0 : value));
    const protectionCount = normalizedActions.reduce(
      (sum, actions, level) => sum + (level >= protectLevel ? actions * failRates[level] : 0),
      0
    );
    return {
      actionsByLevel: normalizedActions,
      totalActions: normalizedActions.reduce((sum, value) => sum + value, 0),
      protectionCount
    };
  },

  // v26 calculateMirrorRequirements：贤者之镜方案需要的底子/输入/镜子数量。
  _v26MirrorRequirements(targetLevel, philosopherStartLevel) {
    const requirements = Array(targetLevel + 1).fill(0);
    const actionsByLevel = Array(targetLevel).fill(0);
    requirements[targetLevel] = 1;
    for (let level = targetLevel - 1; level >= philosopherStartLevel; level--) {
      const actions = requirements[level + 1];
      actionsByLevel[level] = actions;
      requirements[level] += actions;
      requirements[level - 1] += actions;
    }
    const aCount = requirements[philosopherStartLevel];
    const bCount = requirements[philosopherStartLevel - 1];
    return {actionsByLevel, aCount, bCount, mirrorCount: aCount + bCount - 1};
  },

  // v26 calculatePhilosopherEnhancementFlowUncached：贤者之镜方案的精确流。
  _v26PhilosopherFlowUncached(
    {targetLevel, protectLevel, philosopherStartLevel, successRates, successBonus, blessedChance},
    resolveNormalFlow
  ) {
    if (targetLevel <= 1 || philosopherStartLevel < 1 || philosopherStartLevel >= targetLevel) {
      return null;
    }
    const mirror = this._v26MirrorRequirements(targetLevel, philosopherStartLevel);
    const aFlow = resolveNormalFlow({
      targetLevel: philosopherStartLevel,
      protectLevel,
      successRates,
      successBonus,
      blessedChance
    });
    const bFlow =
      philosopherStartLevel > 1
        ? resolveNormalFlow({
            targetLevel: philosopherStartLevel - 1,
            protectLevel,
            successRates,
            successBonus,
            blessedChance
          })
        : {actionsByLevel: [], totalActions: 0, protectionCount: 0};
    if (!aFlow || !bFlow) return null;
    const actionsByLevel = [
      ...mirror.actionsByLevel
    ];
    for (let level = 0; level < philosopherStartLevel; level++) {
      actionsByLevel[level] =
        mirror.aCount * (aFlow.actionsByLevel[level] ?? 0) + mirror.bCount * (bFlow.actionsByLevel[level] ?? 0);
    }
    const normalActions = mirror.aCount * aFlow.totalActions + mirror.bCount * bFlow.totalActions;
    const protectionCount = mirror.aCount * aFlow.protectionCount + mirror.bCount * bFlow.protectionCount;
    return {
      actionsByLevel,
      baseItemCount: mirror.aCount + mirror.bCount,
      mirrorCount: mirror.mirrorCount,
      protectionCount,
      totalActions: normalActions + mirror.mirrorCount,
      aCount: mirror.aCount,
      bCount: mirror.bCount
    };
  },

  // 目标等级+成功加成唯一确定全部流，按表缓存供同等级装备共用。
  // 目标等级+成功加成唯一确定全部流，按表缓存供同等级装备共用；普通流在表内二次缓存避免贤者之镜流重复求解。
  _v26FlowTable(targetLevel, successRates, successBonus, blessedChance) {
    const cacheKey = `${targetLevel}|${Number(blessedChance)}|${Number(successBonus).toFixed(9)}`;
    const cached = this.v26FlowTableCache.get(cacheKey);
    if (cached) return cached;
    const localNormalFlows = Array.from({length: targetLevel + 1}, () => []);
    const resolveNormalFlow = (options) => {
      const flowTarget = Math.max(0, Math.floor(Number(options.targetLevel) || 0));
      const protectLevel = Math.max(0, Math.floor(Number(options.protectLevel) || 0));
      if (localNormalFlows[flowTarget][protectLevel] === undefined) {
        localNormalFlows[flowTarget][protectLevel] = this._v26NormalFlowUncached(options);
      }
      return localNormalFlows[flowTarget][protectLevel];
    };
    const normal = Array(targetLevel + 1).fill(null);
    for (let protectLevel = 1; protectLevel <= targetLevel; protectLevel++) {
      normal[protectLevel] = resolveNormalFlow({
        targetLevel,
        protectLevel,
        successRates,
        successBonus,
        blessedChance
      });
    }
    const philosopher = Array.from({length: targetLevel}, () => []);
    for (let philosopherStartLevel = 1; philosopherStartLevel < targetLevel; philosopherStartLevel++) {
      for (let protectLevel = 1; protectLevel <= philosopherStartLevel; protectLevel++) {
        philosopher[philosopherStartLevel][protectLevel] = this._v26PhilosopherFlowUncached(
          {
            targetLevel,
            protectLevel,
            philosopherStartLevel,
            successRates,
            successBonus,
            blessedChance
          },
          resolveNormalFlow
        );
      }
    }
    const table = {normal, philosopher};
    this.v26FlowTableCache.set(cacheKey, table);
    return table;
  },

  _v26RefinementRecipe(itemHrid, baseItemHrid, clientData) {
    if (itemHrid === baseItemHrid) return {actionHrid: '', inputItems: []};
    const match = Object.entries(clientData.actionDetailMap || {}).find(
      ([
        , detail
      ]) =>
        detail?.upgradeItemHrid === baseItemHrid && detail?.outputItems?.some((output) => output.itemHrid === itemHrid)
    );
    if (!match) return null;
    return {actionHrid: match[1].hrid, inputItems: match[1].inputItems ?? []};
  },

  // 不可交易物品的商店金币价（v26 nonTradableCoinShopPrice）。
  _v26NonTradableCoinShopPrice(itemHrid, clientData) {
    if (clientData.itemDetailMap?.[itemHrid]?.isTradable === true) return 0;
    let best = Number.POSITIVE_INFINITY;
    for (const detail of Object.values(clientData.shopItemDetailMap || {})) {
      if (detail?.itemHrid !== itemHrid) continue;
      const costs = Array.isArray(detail.costs) ? detail.costs : [];
      if (costs.length !== 1 || costs[0]?.itemHrid !== '/items/coin' || !(Number(costs[0]?.count) > 0)) {
        continue;
      }
      best = Math.min(best, Number(costs[0].count));
    }
    return Number.isFinite(best) ? best : 0;
  },

  // 与 MWITools assetItemKey 一致：物品 + 强化等级作为产出/奖励索引键。
  _v26AssetItemKey(itemHrid, enhancementLevel = 0) {
    return `${itemHrid}#${Number(enhancementLevel) || 0}`;
  },

  // 与 MWITools normalizeCostRecords 一致：商店条目成本支持数组、单对象与映射三种形态。
  _v26NormalizeCostRecords(detail) {
    const raw = detail?.costs ?? detail?.costItems ?? detail?.cost;
    if (Array.isArray(raw)) return raw;
    if (raw?.itemHrid || raw?.hrid) return [
        raw
      ];
    return Object.entries(raw ?? {}).map(
      ([
        itemHrid, value
      ]) => ({
        itemHrid,
        count: value?.count ?? value
      })
    );
  },

  // 与 MWITools normalizeRewardRecords 一致：商店条目奖励支持数组、单对象与映射形态。
  _v26NormalizeRewardRecords(detail) {
    const raw = detail?.itemRewards ?? detail?.rewards ?? detail?.rewardItems;
    if (Array.isArray(raw)) return raw;
    if (raw?.itemHrid || raw?.hrid) return [
        raw
      ];
    const itemHrid = detail?.itemHrid ?? detail?.rewardItemHrid ?? detail?.item?.itemHrid;
    return itemHrid
      ? [
          {
            itemHrid,
            count: detail?.outputCount ?? detail?.itemCount ?? detail?.rewardCount ?? 1,
            enhancementLevel: detail?.enhancementLevel ?? 0
          }
        ]
      : [];
  },

  // 与 MWITools getShopDetails 一致：普通商店、任务商店与迷宫商店合并为候选来源。
  _v26ShopDetails(clientData) {
    return [
      clientData.shopItemDetailMap, clientData.taskShopItemDetailMap, clientData.labyrinthShopItemDetailMap
    ].flatMap((map) => Object.values(map || {}));
  },

  // 与 MWITools getActionOutputIndexes 一致：动作产出按 物品#等级 与 升级目标 两种索引。
  _v26ActionOutputIndexes(clientData) {
    const source = clientData.actionDetailMap;
    if (source === this.v26ActionOutputIndexSource && this.v26ActionOutputIndexes) {
      return this.v26ActionOutputIndexes;
    }
    const byItemAndLevel = new Map();
    const upgradesByItem = new Map();
    for (const action of Object.values(source || {})) {
      const countsByKey = new Map();
      const countsByItem = new Map();
      for (const output of action?.outputItems ?? []) {
        const itemHrid = output?.itemHrid ?? output?.hrid;
        if (!itemHrid) continue;
        const count = Number(output.count ?? 1);
        if (!Number.isFinite(count) || count <= 0) continue;
        const key = this._v26AssetItemKey(itemHrid, output.enhancementLevel);
        countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
        countsByItem.set(itemHrid, (countsByItem.get(itemHrid) ?? 0) + count);
      }
      for (const [
        key, outputCount
      ] of countsByKey) {
        const candidates = byItemAndLevel.get(key) ?? [];
        candidates.push({action, outputCount});
        byItemAndLevel.set(key, candidates);
      }
      if (action?.upgradeItemHrid) {
        for (const [
          itemHrid, outputCount
        ] of countsByItem) {
          const candidates = upgradesByItem.get(itemHrid) ?? [];
          candidates.push({action, outputCount});
          upgradesByItem.set(itemHrid, candidates);
        }
      }
    }
    this.v26ActionOutputIndexSource = source;
    this.v26ActionOutputIndexes = {byItemAndLevel, upgradesByItem};
    return this.v26ActionOutputIndexes;
  },

  // 与 MWITools getShopRewardIndex 一致：商店条目按 奖励物品#等级 建立索引。
  _v26ShopRewardIndex(clientData) {
    const sources = [
      clientData.shopItemDetailMap, clientData.taskShopItemDetailMap, clientData.labyrinthShopItemDetailMap
    ];
    if (this.v26ShopRewardIndex && this.v26ShopRewardIndexSource?.every((source, index) => source === sources[index])) {
      return this.v26ShopRewardIndex;
    }
    const index = new Map();
    for (const detail of this._v26ShopDetails(clientData)) {
      const countsByKey = new Map();
      for (const reward of this._v26NormalizeRewardRecords(detail)) {
        const itemHrid = reward?.itemHrid ?? reward?.hrid;
        if (!itemHrid) continue;
        const count = Number(reward.count ?? 1);
        if (!Number.isFinite(count) || count <= 0) continue;
        const key = this._v26AssetItemKey(itemHrid, reward.enhancementLevel);
        countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
      }
      for (const [
        key, rewardCount
      ] of countsByKey) {
        const candidates = index.get(key) ?? [];
        candidates.push({detail, rewardCount});
        index.set(key, candidates);
      }
    }
    this.v26ShopRewardIndexSource = sources;
    this.v26ShopRewardIndex = index;
    return index;
  },

  // 与 MWITools getShopAcquisitionValue 一致：商店购买成本（成本按获取成本链递归计价）。
  _v26ShopAcquisitionValue(itemHrid, enhancementLevel, clientData, context) {
    let bestValue = Number.POSITIVE_INFINITY;
    const candidates =
      this._v26ShopRewardIndex(clientData).get(this._v26AssetItemKey(itemHrid, enhancementLevel)) ?? [];
    for (const {detail, rewardCount} of candidates) {
      let totalCost = 0;
      let complete = true;
      for (const cost of this._v26NormalizeCostRecords(detail)) {
        const costHrid = cost?.itemHrid ?? cost?.hrid;
        const count = Number(cost?.count);
        if (!costHrid || !(count > 0)) continue;
        const unitValue = this._v26AcquisitionCostValue(
          costHrid,
          Number(cost?.enhancementLevel ?? 0) || 0,
          clientData,
          context
        );
        if (!(unitValue > 0)) {
          complete = false;
          break;
        }
        totalCost += count * unitValue;
      }
      if (complete && totalCost > 0) {
        bestValue = Math.min(bestValue, totalCost / rewardCount);
      }
    }
    return Number.isFinite(bestValue) ? bestValue : 0;
  },

  // 与 MWITools getCraftedAcquisitionValue 一致：制作成本（输入与升级底子按获取成本链递归计价）。
  _v26CraftedAcquisitionValue(itemHrid, enhancementLevel, clientData, context) {
    let bestValue = Number.POSITIVE_INFINITY;
    const candidates =
      this._v26ActionOutputIndexes(clientData).byItemAndLevel.get(this._v26AssetItemKey(itemHrid, enhancementLevel)) ??
      [];
    for (const {action, outputCount} of candidates) {
      let totalCost = 0;
      let complete = true;
      const inputItems = action?.inputItems ?? [];
      const upgradeItemHrid = action?.upgradeItemHrid;
      if (upgradeItemHrid) {
        const retainedLevel = action.retainAllEnhancement ? enhancementLevel : 0;
        const upgradeValue = this._v26AcquisitionCostValue(upgradeItemHrid, retainedLevel, clientData, context);
        if (!(upgradeValue > 0)) complete = false;
        else totalCost += upgradeValue;
      }
      for (const input of inputItems) {
        const inputHrid = input?.itemHrid ?? input?.hrid;
        const count = Number(input?.count);
        if (!inputHrid || !(count > 0)) continue;
        const inputValue = this._v26AcquisitionCostValue(
          inputHrid,
          Number(input?.enhancementLevel ?? 0) || 0,
          clientData,
          context
        );
        if (!(inputValue > 0)) {
          complete = false;
          break;
        }
        totalCost += count * inputValue;
      }
      if (complete && totalCost > 0) {
        bestValue = Math.min(bestValue, totalCost / outputCount);
      }
    }
    return Number.isFinite(bestValue) ? bestValue : 0;
  },

  // 与 MWITools getRefinedAcquisitionValue 一致：精炼成本（底子与材料按获取成本链递归计价）。
  _v26RefinedAcquisitionValue(itemHrid, enhancementLevel, clientData, context) {
    if (!String(itemHrid).endsWith('_refined')) return 0;
    let bestValue = Number.POSITIVE_INFINITY;
    const candidates = this._v26ActionOutputIndexes(clientData).upgradesByItem.get(itemHrid) ?? [];
    for (const {action, outputCount} of candidates) {
      const baseItemHrid = action?.upgradeItemHrid;
      if (!baseItemHrid) continue;
      const retainedLevel = action.retainAllEnhancement ? enhancementLevel : 0;
      let totalCost = this._v26AcquisitionCostValue(baseItemHrid, retainedLevel, clientData, context);
      let complete = totalCost > 0;
      for (const cost of action.inputItems ?? []) {
        const costHrid = cost?.itemHrid ?? cost?.hrid;
        const count = Number(cost?.count);
        if (!costHrid || !(count > 0)) continue;
        const unitValue = this._v26AcquisitionCostValue(
          costHrid,
          Number(cost?.enhancementLevel ?? 0) || 0,
          clientData,
          context
        );
        if (!(unitValue > 0)) {
          complete = false;
          break;
        }
        totalCost += count * unitValue;
      }
      if (complete && totalCost > 0) {
        bestValue = Math.min(bestValue, totalCost / outputCount);
      }
    }
    return Number.isFinite(bestValue) ? bestValue : 0;
  },

  // 与 MWITools getGuildCreditHrids 一致：收集所有公会信用转换的目标物品。
  _v26GuildCreditHrids(clientData) {
    if (clientData === this.v26GuildCreditHridsSource && this.v26GuildCreditHridsCache) {
      return this.v26GuildCreditHridsCache;
    }
    const result = new Set();
    for (const detail of Object.values(clientData.itemDetailMap || {})) {
      for (const conversion of detail?.guildCreditConversions ?? []) {
        if (conversion?.creditItemHrid) result.add(conversion.creditItemHrid);
      }
    }
    this.v26GuildCreditHridsSource = clientData;
    this.v26GuildCreditHridsCache = result;
    return result;
  },

  // 与 MWITools getGuildCreditValue 一致：公会信用价值按可转换来源物品的市场公平价值折算（取最小）。
  _v26GuildCreditValue(creditItemHrid, clientData) {
    let bestValue = Number.POSITIVE_INFINITY;
    for (const detail of Object.values(clientData.itemDetailMap || {})) {
      const itemHrid = detail?.hrid ?? detail?.itemHrid;
      if (!itemHrid || itemHrid === '/items/guild_token') continue;
      const materialValue = this._fairValue(itemHrid, 0);
      if (!(materialValue > 0)) continue;
      for (const conversion of detail?.guildCreditConversions ?? []) {
        if (conversion?.creditItemHrid !== creditItemHrid) continue;
        const itemCount = Number(conversion.itemCount);
        const creditCount = Number(conversion.creditCount);
        if (!(itemCount > 0) || !(creditCount > 0)) continue;
        bestValue = Math.min(bestValue, (materialValue * itemCount) / creditCount);
      }
    }
    return Number.isFinite(bestValue) ? bestValue : 0;
  },

  // 与 MWITools getGuildTokenValue 一致：公会代币价值按可兑换信用价值的最大值折算。
  _v26GuildTokenValue(clientData, context) {
    const detail = clientData.itemDetailMap?.['/items/guild_token'];
    let bestValue = 0;
    for (const conversion of detail?.guildCreditConversions ?? []) {
      const creditItemHrid = conversion?.creditItemHrid;
      const tokenCount = Number(conversion?.guildTokenCount ?? conversion?.itemCount);
      const creditCount = Number(conversion?.creditCount);
      if (!creditItemHrid || !(tokenCount > 0) || !(creditCount > 0)) continue;
      const creditValue = this._v26AcquisitionCostValue(creditItemHrid, 0, clientData, context);
      if (!(creditValue > 0)) continue;
      bestValue = Math.max(bestValue, (creditValue * creditCount) / tokenCount);
    }
    return bestValue;
  },

  // 与 MWITools charmRecipe 一致：第一个产出该 charm 的动作即其配方。
  _v26CharmRecipe(itemHrid, clientData) {
    return (
      Object.values(clientData.actionDetailMap || {}).find((action) =>
        action?.outputItems?.some((output) => output.itemHrid === itemHrid)
      ) || null
    );
  },

  // 与 MWITools getDirectInputs 一致：配方输入合并升级底子（upgradeItemHrid 计入输入并 +1）。
  _v26CharmInputs(recipe) {
    const inputs = (recipe.inputItems || []).map((item) => ({
      itemHrid: item.itemHrid,
      count: Number(item.count) || 0
    }));
    if (recipe.upgradeItemHrid) {
      const matchingIndex = inputs.findIndex((input) => input.itemHrid === recipe.upgradeItemHrid);
      if (matchingIndex >= 0) inputs[matchingIndex].count += 1;
      else inputs.push({itemHrid: recipe.upgradeItemHrid, count: 1});
    }
    return inputs;
  },

  // 与 MWITools resolveCharmLeafPrice 一致：charm 底子叶子价 = 市场公平价值或商店金币价。
  _v26CharmLeafPrice(itemHrid, clientData) {
    return this._fairValue(itemHrid, 0) || this._v26NonTradableCoinShopPrice(itemHrid, clientData);
  },

  // 与 MWITools charmBaseCost 一致：charm 底子成本按配方递归累加（charm 输入递归、其余按叶子价），
  // 除以单次产出数量；茶消耗投影依赖玩家实时状态，此处按配方原样（与精炼成本同一降级口径）。
  _v26CharmBaseCost(itemHrid, clientData, visited = new Set()) {
    if (!itemHrid || visited.has(itemHrid)) return 0;
    const recipe = this._v26CharmRecipe(itemHrid, clientData);
    if (!recipe) return this._v26CharmLeafPrice(itemHrid, clientData);
    const outputCount = (recipe.outputItems || [])
      .filter((output) => output.itemHrid === itemHrid)
      .reduce((sum, output) => sum + (Number(output.count) > 0 ? Number(output.count) : 0), 0);
    if (!(outputCount > 0)) return 0;
    const nextVisited = new Set(visited).add(itemHrid);
    let totalCost = 0;
    for (const input of this._v26CharmInputs(recipe)) {
      if (!input.itemHrid || !(input.count > 0)) continue;
      const unitPrice = input.itemHrid.endsWith('_charm')
        ? this._v26CharmBaseCost(input.itemHrid, clientData, nextVisited)
        : this._v26CharmLeafPrice(input.itemHrid, clientData);
      if (!(unitPrice > 0)) return 0;
      totalCost += input.count * unitPrice;
    }
    return totalCost > 0 ? totalCost / outputCount : 0;
  },

  // 与 MWITools acquisitionCostValue / getAssetValueInternal（forceAcquisitionValue）一致：
  // 获取成本取市场公平价值、商店购买、制作、精炼四者最小，递归计价并带循环检测与结果缓存；
  // 公会代币与信用走官方兑换折算分支；全链无价时退回公平价值、再退回官方出售价。
  _v26AcquisitionCostValue(itemHrid, enhancementLevel, clientData, context) {
    if (itemHrid === '/items/coin') return 1;
    const level = Number(enhancementLevel) || 0;
    const key = this._v26AssetItemKey(itemHrid, level);
    const cached = context.cache.get(key);
    if (cached !== undefined) return cached;
    if (context.visited.has(key)) return 0;
    context.visited.add(key);
    const directFairValue = this._fairValue(itemHrid, level);
    let value = 0;
    if (itemHrid === '/items/cowbell') {
      value = this._v26AcquisitionCostValue('/items/bag_of_10_cowbells', 0, clientData, context) / 10;
    } else if (this._v26GuildCreditHrids(clientData).has(itemHrid)) {
      value = this._v26GuildCreditValue(itemHrid, clientData);
    } else if (itemHrid === '/items/guild_token') {
      value = this._v26GuildTokenValue(clientData, context);
    } else {
      const candidates = [
        directFairValue, this._v26ShopAcquisitionValue(itemHrid, level, clientData, context), this._v26CraftedAcquisitionValue(itemHrid, level, clientData, context), this._v26RefinedAcquisitionValue(itemHrid, level, clientData, context)
      ].filter((candidate) => candidate > 0);
      value = candidates.length ? Math.min(...candidates) : 0;
    }
    context.visited.delete(key);
    if (!(value > 0)) value = directFairValue;
    if (!(value > 0)) value = Number(clientData.itemDetailMap?.[itemHrid]?.sellPrice) || 0;
    const normalizedValue = Number.isFinite(value) && value > 0 ? value : 0;
    context.cache.set(key, normalizedValue);
    return normalizedValue;
  },

  // 与 v26 getEnhancedEquipmentCost 对齐的强化计划；projectAction 依赖降级：
  // 精炼与 charm 配方按配方原样计价（不含茶消耗投影），其余环节与 MWITools 同构。
  _calculateV26EnhancementPlan(
    itemHrid,
    targetLevel,
    clientData,
    {forcedProtectionItemHrid = null, allowPhilosopherMirror = true} = {},
    context = {cache: new Map(), visited: new Set()}
  ) {
    const target = Math.max(0, Math.floor(Number(targetLevel) || 0));
    const baseItemHrid = itemHrid.endsWith('_refined') ? itemHrid.replace('_refined', '') : itemHrid;
    const item = clientData.itemDetailMap?.[baseItemHrid];
    const refiningRecipe = this._v26RefinementRecipe(itemHrid, baseItemHrid, clientData);
    if (refiningRecipe === null || !item?.enhancementCosts?.length || target < 1) return null;
    const stats = this._v26EnhancementProfileStats(item.itemLevel, clientData);
    if (!stats) return null;
    // 与 v26 calculateEnhancementPlan 一致：charm 底子按递归配方成本，其余底子按完整获取成本链。
    const basePrice = baseItemHrid.endsWith('_charm')
      ? this._v26CharmBaseCost(baseItemHrid, clientData)
      : this._v26AcquisitionCostValue(baseItemHrid, 0, clientData, context);
    let materialCostPerAction = 0;
    let hasMissingRequiredPrice = !basePrice;
    for (const cost of item.enhancementCosts) {
      const unitPrice =
        this._fairValue(cost.itemHrid, 0) || this._v26NonTradableCoinShopPrice(cost.itemHrid, clientData);
      if (!unitPrice) hasMissingRequiredPrice = true;
      materialCostPerAction += unitPrice * Number(cost.count || 0);
    }
    let refinementCost = 0;
    for (const cost of refiningRecipe.inputItems ?? []) {
      const unitPrice = this._v26AcquisitionCostValue(cost.itemHrid, 0, clientData, context);
      if (!unitPrice) hasMissingRequiredPrice = true;
      refinementCost += unitPrice * Number(cost.count || 0);
    }
    const ultraTeaPrice = this._fairValue('/items/ultra_enhancing_tea', 0);
    const blessedTeaPrice = this._fairValue('/items/blessed_tea', 0);
    if (!ultraTeaPrice || !blessedTeaPrice) hasMissingRequiredPrice = true;
    if (hasMissingRequiredPrice) return null;
    let protectionChoice = null;
    const considerProtection = (hrid, value) => {
      if (hrid && value > 0 && (!protectionChoice || value < protectionChoice.value)) {
        protectionChoice = {hrid, value};
      }
    };
    if (forcedProtectionItemHrid) {
      considerProtection(forcedProtectionItemHrid, this._fairValue(forcedProtectionItemHrid, 0));
    } else {
      for (const candidate of this._v26ProtectionCandidates(baseItemHrid, clientData)) {
        considerProtection(candidate, this._fairValue(candidate, 0));
      }
    }
    const protectionPrice = protectionChoice?.value ?? 0;
    const philosopherMirrorPrice = this._fairValue('/items/philosophers_mirror', 0);
    const ultraTeaCostPerAction =
      (stats.secondsPerAction / this.v26EnhancementProfile.teaDurationSeconds) * ultraTeaPrice;
    const blessedTeaCostPerNormalAction =
      (stats.secondsPerAction / this.v26EnhancementProfile.teaDurationSeconds) * blessedTeaPrice;
    const normalActionCost = materialCostPerAction + ultraTeaCostPerAction + blessedTeaCostPerNormalAction;
    const successRates = this._v26SuccessRates(clientData);
    const flowTable = this._v26FlowTable(target, successRates, stats.successBonus, stats.blessedChance);
    let best = null;
    for (let protectLevel = 1; protectLevel <= target; protectLevel++) {
      const flow = flowTable.normal[protectLevel];
      if (!flow) continue;
      if (flow.protectionCount > 1e-9 && !protectionPrice) continue;
      const totalCost = basePrice + flow.totalActions * normalActionCost + flow.protectionCount * protectionPrice;
      if (!best || totalCost < best.totalCost) {
        best = {mode: 'normal', totalCost};
      }
    }
    if (allowPhilosopherMirror && philosopherMirrorPrice > 0) {
      for (let philosopherStartLevel = 1; philosopherStartLevel < target; philosopherStartLevel++) {
        for (let protectLevel = 1; protectLevel <= philosopherStartLevel; protectLevel++) {
          const flow = flowTable.philosopher[philosopherStartLevel][protectLevel];
          if (!flow || flow.baseItemCount < -1e-9) continue;
          if (flow.protectionCount > 1e-9 && !protectionPrice) continue;
          const totalCost =
            flow.baseItemCount * basePrice +
            flow.totalActions * (materialCostPerAction + ultraTeaCostPerAction) +
            (flow.totalActions - flow.mirrorCount) * blessedTeaCostPerNormalAction +
            flow.protectionCount * protectionPrice +
            flow.mirrorCount * philosopherMirrorPrice;
          if (!best || totalCost < best.totalCost) {
            best = {mode: 'philosopher', totalCost};
          }
        }
      }
    }
    if (!best) return null;
    return {status: 'complete', totalCost: best.totalCost + refinementCost};
  },

  // v26 isBackEquipment：按位置、披风命名与装备详情识别背部装备。
  _isBackEquipment(itemHrid, itemLocationHrid = '', clientData) {
    if (itemLocationHrid === '/item_locations/back') return true;
    if (/(?:^|_)cape(?:_refined)?$/.test(this.ctx.utils.substrLastSlash(itemHrid))) return true;
    const detail = clientData?.itemDetailMap?.[itemHrid];
    const equipment = detail?.equipmentDetail;
    return [
      detail?.itemLocationHrid, detail?.equipmentSlotHrid, detail?.slotHrid, equipment?.itemLocationHrid, equipment?.equipmentSlotHrid,
      equipment?.slotHrid, equipment?.equipmentTypeHrid, equipment?.typeHrid, equipment?.type
    ].some((value) => /(?:^|[/_])back(?:$|[/_])/.test(String(value ?? '')));
  }
};

// build-score-new-calculators（新版算法：MWITools 口径）
export const buildScoreNewCalculators = {
  // 公平价值与 MWITools 一致：官方市场价值（marketItemValues）优先，其次左右报价平均，最后单侧报价。
  _fairValue(itemHrid, enhancementLevel = 0) {
    if (itemHrid === '/items/coin') return 1;
    const serverValue = this.marketService.getMarketValue?.(itemHrid, enhancementLevel) || 0;
    if (serverValue > 0) return serverValue;
    const row = this.marketService.getMarketRow(itemHrid, enhancementLevel);
    const ask = Number(row?.a) > 0 ? Number(row.a) : 0;
    const bid = Number(row?.b) > 0 ? Number(row.b) : 0;
    if (ask > 0 && bid > 0) return (ask + bid) / 2;
    return ask || bid || 0;
  },

  _classifyEquippedItem(item, clientData) {
    const locationDetail = clientData.itemLocationDetailMap?.[item.itemLocationHrid];
    const equipmentDetail = clientData.itemDetailMap?.[item.itemHrid]?.equipmentDetail;
    const isTool = locationDetail?.isTool === true;
    const hasStats = (stats) => Boolean(stats && Object.keys(stats).length);
    return {
      isTool,
      isCombat:
        !isTool && (hasStats(equipmentDetail?.combatStats) || hasStats(equipmentDetail?.combatEnhancementBonuses)),
      isSkilling:
        isTool || hasStats(equipmentDetail?.noncombatStats) || hasStats(equipmentDetail?.noncombatEnhancementBonuses)
    };
  },

  // 单件装备估值：强化装备按 v26 强化计划成本，与公平价值偏差不超过 20% 时仍用公平价值；
  // 背部装备与 v26.4.14 getEnhancedEquipmentCost 一致：强制保护之镜但允许贤者之镜方案。
  _getItemValue(item, clientData, context = {cache: new Map(), visited: new Set()}) {
    const enhancementLevel = Number(item.enhancementLevel || 0);
    const fairValue = this._fairValue(item.itemHrid, enhancementLevel);
    if (enhancementLevel <= 0 || !clientData.itemDetailMap?.[item.itemHrid]?.equipmentDetail) {
      return fairValue;
    }
    const backEquipment = this._isBackEquipment(item.itemHrid, item.itemLocationHrid, clientData);
    const plan = this._calculateV26EnhancementPlan(
      item.itemHrid,
      enhancementLevel,
      clientData,
      {
        forcedProtectionItemHrid: backEquipment ? '/items/mirror_of_protection' : null,
        allowPhilosopherMirror: true
      },
      context
    );
    const enhancementCost = plan?.status === 'complete' && plan.totalCost > 0 ? plan.totalCost : 0;
    if (enhancementCost <= 0) return fairValue;
    const deviation =
      fairValue > 0 ? Math.abs(fairValue - enhancementCost) / enhancementCost : Number.POSITIVE_INFINITY;
    return fairValue > 0 && deviation <= 0.2 ? fairValue : enhancementCost;
  },

  // 装备分按战斗装备、生活工具、生活装备三类分别汇总，口径与 MWITools 一致。
  _calculateGearScores(cardData, clientData, context = {cache: new Map(), visited: new Set()}) {
    const scores = {combatEquipment: 0, skillingTools: 0, skillingEquipment: 0};
    const equipment = cardData.player?.equipment || cardData.player?.characterItems || [];
    for (const item of equipment) {
      if (item.itemLocationHrid === '/item_locations/inventory') continue;
      const classification = this._classifyEquippedItem(item, clientData);
      if (!classification.isTool && !classification.isCombat && !classification.isSkilling) continue;
      const value = Number(item.count ?? 1) * this._getItemValue(item, clientData, context);
      if (!(value > 0)) continue;
      if (classification.isCombat) scores.combatEquipment += value;
      if (classification.isTool) scores.skillingTools += value;
      else if (classification.isSkilling) scores.skillingEquipment += value;
    }
    for (const key of Object.keys(scores)) scores[key] /= 1_000_000;
    return scores;
  },

  // 房屋分按房间可用动作类型分为战斗/生活两类，造价逐级按公平价值累加，口径与 MWITools 一致。
  _calculateHouseScores(cardData, clientData) {
    let combat = 0;
    let skilling = 0;
    let all = 0;
    Object.entries(cardData.characterHouseRoomMap || cardData.houseRooms || {}).forEach(
      ([
        key, room
      ]) => {
        const houseRoomHrid = room?.houseRoomHrid || (key.startsWith('/house_rooms/') ? key : '');
        const level = Number(typeof room === 'object' ? room?.level : room) || 0;
        if (!houseRoomHrid || level <= 0) return;
        const houseDetail = clientData.houseRoomDetailMap[houseRoomHrid];
        if (!houseDetail) return;
        const usableInActionTypeMap = houseDetail.usableInActionTypeMap || {};
        const isCombat = Boolean(usableInActionTypeMap['/action_types/combat']);
        const isSkilling = Object.entries(usableInActionTypeMap).some(
          ([
            actionTypeHrid, isUsable
          ]) => actionTypeHrid !== '/action_types/combat' && Boolean(isUsable)
        );
        let cost = 0;
        const upgradeCostsMap = houseDetail.upgradeCostsMap || {};
        for (let currentLevel = 1; currentLevel <= level; currentLevel++) {
          (upgradeCostsMap[currentLevel] || []).forEach((item) => {
            cost += Number(item.count || 0) * this._fairValue(item.itemHrid);
          });
        }
        const value = cost / 1_000_000;
        all += value;
        if (isCombat) combat += value;
        if (isSkilling) skilling += value;
      }
    );
    return {combat, skilling, all};
  },

  // 技能分按等级所需经验折算技能书数量（8 个基础技能每本 50 经验，其余 500），再按公平价值计价。
  _calculateNewAbilityScore(abilities, clientData) {
    const basicAbilityIds = [
      'poke', 'scratch', 'smack', 'quick_shot', 'water_strike',
      'fireball', 'entangle', 'minor_heal'
    ];
    let cost = 0;
    abilities.forEach((ability) => {
      const targetLevel = Number(ability.level || 0);
      const experience = Number(clientData.levelExperienceTable[targetLevel] || 0);
      const experiencePerBook = basicAbilityIds.some((id) => ability.abilityHrid?.includes(id)) ? 50 : 500;
      const bookCount = Number((experience / experiencePerBook + 1).toFixed(1));
      const itemHrid = String(ability.abilityHrid || '').replace('/abilities/', '/items/');
      const fairValue = this._fairValue(itemHrid, 0);
      if (fairValue > 0) cost += bookCount * fairValue;
    });
    return cost / 1_000_000;
  },

  // 公会 Buff 当前等级（MWITools getGuildBuffLevel）：支持数组或按 hrid 索引的对象。
  _v26GuildBuffLevel(guildBuffHrid, levels) {
    const record = Array.isArray(levels)
      ? levels.find((value) => (value?.guildBuffHrid ?? value?.hrid) === guildBuffHrid)
      : levels?.[guildBuffHrid];
    const level = Number(typeof record === 'object' ? (record?.level ?? record?.currentLevel) : record);
    return Number.isSafeInteger(level) && level > 0 ? level : 0;
  },

  // 公会神龛分数（MWITools v26.4.14 起计入着装评分）：按公会 Buff 等级累加每级
  // 代币与信用成本，战斗/生活按 Buff 类型分组；任一组数据不可估值时该组为 null 不计入。
  // 生效等级按游戏规则（renderGuildBuffModal 的 Math.min(o, r)）取角色已升级等级与
  // 公会神龛等级（guildBuildingLevelMap 中对应神龛建筑）的较小值；资料场景无公会建筑
  // 数据时直接用角色等级。代币与信用按 MWITools getGuildShrineValues 的完整折算链估值。
  _v26GuildShrineScores(cardData, clientData, context = {cache: new Map(), visited: new Set()}) {
    const levels = cardData.characterGuildBuffMap;
    if (!levels || typeof levels !== 'object') return {battle: null, skilling: null};
    const details = Object.values(clientData.guildBuffDetailMap || {});
    if (!details.length) return {battle: null, skilling: null};
    const buildingLevels = cardData.guildBuildingLevelMap || {};
    const values = {battle: 0, skilling: 0};
    const valid = {battle: true, skilling: true};
    for (const detail of details) {
      const guildBuffHrid = detail?.guildBuffHrid ?? detail?.hrid;
      if (!guildBuffHrid) continue;
      const buffLevel = this._v26GuildBuffLevel(guildBuffHrid, levels);
      if (!buffLevel) continue;
      const shrineLevel = Number(buildingLevels?.[detail?.shrineHrid]) || 0;
      const currentLevel = shrineLevel > 0 ? Math.min(buffLevel, shrineLevel) : buffLevel;
      if (typeof detail?.isCombat !== 'boolean') return {battle: null, skilling: null};
      const group = detail.isCombat ? 'battle' : 'skilling';
      if (!valid[group]) continue;
      const levelCosts = detail.levelCosts;
      if (!levelCosts) {
        valid[group] = false;
        continue;
      }
      for (let level = 1; level <= currentLevel; level++) {
        const cost = levelCosts[level] ?? levelCosts[String(level)];
        if (!cost) {
          valid[group] = false;
          break;
        }
        const guildTokenCount = Number(cost.guildTokenCost);
        if (guildTokenCount) {
          const tokenValue = this._v26GuildTokenValue(clientData, context);
          if (!(tokenValue > 0)) {
            valid[group] = false;
            break;
          }
          values[group] += guildTokenCount * tokenValue;
        }
        for (const creditCost of cost.creditCosts ?? []) {
          const count = Number(creditCost?.count);
          if (!count) continue;
          const creditValue = this._v26GuildCreditValue(creditCost.itemHrid, clientData);
          if (!(creditValue > 0)) {
            valid[group] = false;
            break;
          }
          values[group] += count * creditValue;
        }
        if (!valid[group]) break;
      }
    }
    return {
      battle: valid.battle ? values.battle / 1_000_000 : null,
      skilling: valid.skilling ? values.skilling / 1_000_000 : null
    };
  }
};
