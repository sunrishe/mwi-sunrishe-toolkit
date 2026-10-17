import {MARKET_TAX_MULTIPLIER} from '../../common/constants.js';

// 强化物品价格计算器：只算必定成功的路线（贤者之镜合成、精炼、解精炼、市场买卖）。
//
// 计算模型对照 mwi-fastsim 的「装备获取成本」（node/app/gear-cost.mjs、opt-upgrades.mjs 的 GearPrices）：
// 每个等级的「最低获取成本」按等级从小到大递推，来源只有四种——
//   ① 市场买成品；② 贤者之镜合成（低一级的主件 + 低两级的普通版垫子 + 镜子）；
//   ③ 买普通版自己精炼（碎片，保留等级）；④ 买精炼版解精炼（拆回普通版并拿回一半碎片）。
// 递推里不卖出任何中间件，因此路线不会把买卖价差当成可重复的收益；唯一允许的卖出是「卖掉手持的基准」，
// 作为「不用基准」那两类方案的抵扣。为什么这样做见 docs/analysis/强化物品价格计算器需求说明书.md §4.4。
export const MAX_ENHANCEMENT_LEVEL = 20;
export const PHILOSOPHERS_MIRROR_HRID = '/items/philosophers_mirror';
export const PRICE_MODES = Object.freeze({AUTO: 'auto', ASK: 'ask', BID: 'bid'});
// 一个等级的四种获取来源。
export const ACQUISITION_KINDS = Object.freeze({
  MARKET: 'market',
  MIRROR: 'mirror',
  REFINE: 'refine',
  UNREFINE: 'unrefine'
});
// 四个候选方案：直接买成品、自己从零获取、用基准当主件、用基准当垫子。
export const PLAN_KEYS = Object.freeze({DIRECT: 'direct', SELF: 'self', MAIN: 'main', PAD: 'pad'});
// 路线步骤与递推深度上限（防御性上限，正常路线远小于它）。
const MAX_ROUTE_STEPS = 256;
const NORMAL_LINE_INDEX = 0;
const REFINED_LINE_INDEX = 1;

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// enhancement-cost-data-methods
const enhancementCostDataMethods = {
  getItemMap() {
    const {DataHub} = this.ctx;
    return DataHub.getClientDataMap('itemDetailMap') || {};
  },

  getEnhanceableItems() {
    const itemMap = this.getItemMap();
    return (
      Object.values(itemMap)
        .filter((detail) => Array.isArray(detail?.enhancementCosts) && detail.enhancementCosts.length > 0)
        // 按游戏的物品顺序（itemDetailMap.sortIndex，游戏里的物品列表就是这个顺序；同序号时再按等级与名称）。
        .sort((left, right) => {
          const sortGap = Number(left.sortIndex ?? 9999) - Number(right.sortIndex ?? 9999);
          if (sortGap) return sortGap;
          const levelGap = Number(left.itemLevel || 0) - Number(right.itemLevel || 0);
          if (levelGap) return levelGap;
          return String(left.name || left.hrid).localeCompare(String(right.name || right.hrid));
        })
        .map((detail) => ({hrid: detail.hrid, detail}))
    );
  },

  // 工匠茶默认生效：精炼材料按 1 - 工匠值 折算，工匠值取自游戏数据里工匠茶的 artisan buff（当前 10%）。
  // 解精炼返还的 shardReturn 是物品详情里的固定值，不随工匠茶变化。
  getArtisanMaterialMultiplier() {
    const {DataHub} = this.ctx;
    const tea = DataHub.getClientDataMap('itemDetailMap')?.['/items/artisan_tea'];
    const buff = (tea?.consumableDetail?.buffs || []).find((entry) => entry?.typeHrid === '/buff_types/artisan');
    const flatBoost = Number(buff?.flatBoost || 0);
    if (!Number.isFinite(flatBoost) || flatBoost <= 0) return 1;
    return Math.max(0, 1 - flatBoost);
  },

  // 精炼动作（retainAllEnhancement，输出 ★ 精炼物品）按基础物品 hrid 建索引：
  // 精炼方案与「该装备有没有精炼版本」都以这套动作为准。
  getRefinementRecipeMap() {
    const {DataHub} = this.ctx;
    const clientData = DataHub.getClientData();
    if (this.recipeCache?.clientData === clientData) return this.recipeCache.map;
    const map = new Map();
    Object.values(clientData?.actionDetailMap || {}).forEach((action) => {
      if (!action?.retainAllEnhancement) return;
      const baseHrid = action.upgradeItemHrid;
      const output = (action.outputItems || []).find((item) => String(item?.itemHrid || '').endsWith('_refined'));
      if (!baseHrid || !output?.itemHrid || map.has(baseHrid)) return;
      map.set(baseHrid, {
        actionHrid: action.hrid,
        refinedHrid: output.itemHrid,
        inputs: (action.inputItems || []).map((input) => ({
          itemHrid: input.itemHrid,
          count: Number(input.count || 0)
        }))
      });
    });
    this.recipeCache = {clientData, map};
    return map;
  },

  // 解精炼详情：精炼物品的 alchemyDetail.unrefineDetail（拆回基础物品，并拿回 shardReturn 个碎片）。
  getUnrefineMap() {
    const {DataHub} = this.ctx;
    const clientData = DataHub.getClientData();
    if (this.unrefineCache?.clientData === clientData) return this.unrefineCache.map;
    const map = new Map();
    Object.values(clientData?.itemDetailMap || {}).forEach((detail) => {
      const unrefine = detail?.alchemyDetail?.unrefineDetail;
      const shardReturn = unrefine?.shardReturn;
      const shardCount = Number(shardReturn?.count || 0);
      if (!detail?.hrid || !unrefine?.baseItemHrid || !shardReturn?.itemHrid || shardCount <= 0) return;
      map.set(detail.hrid, {
        baseItemHrid: unrefine.baseItemHrid,
        shardHrid: shardReturn.itemHrid,
        shardCount
      });
    });
    this.unrefineCache = {clientData, map};
    return map;
  },

  getLineInfo(itemHrid) {
    const itemMap = this.getItemMap();
    const detail = itemMap[itemHrid];
    const baseHrid = detail?.baseItemHrids?.[0];
    // 基准是精炼物品时，普通线取它的基础物品；目标线只能还是这件精炼物品。
    const normalHrid = baseHrid && itemMap[baseHrid] ? baseHrid : itemHrid;
    const recipe = this.getRefinementRecipe(normalHrid);
    const refinedHrid = recipe?.refinedHrid && itemMap[recipe.refinedHrid] ? recipe.refinedHrid : '';
    return {normalHrid, refinedHrid};
  },

  getRefinementRecipe(normalHrid) {
    return this.getRefinementRecipeMap().get(normalHrid) || null;
  }
};

// enhancement-cost-price-methods
const enhancementCostPriceMethods = {
  hasMarketData() {
    return Boolean(this.marketService && Object.keys(this.marketService.marketData || {}).length > 0);
  },

  getMarketQuote(itemHrid, level) {
    // 金币按 1:1 计价，不走进市场数据。
    if (itemHrid === '/items/coin') return {ask: 1, bid: 1, last: 1, official: 1};
    const row = this.marketService?.getMarketRow(itemHrid, level) || null;
    return {
      ask: toPositiveNumber(row?.a),
      bid: toPositiveNumber(row?.b),
      last: toPositiveNumber(row?.p),
      official: toPositiveNumber(this.marketService?.getMarketValue?.(itemHrid, level))
    };
  },

  // 买入价：手选一侧只用该侧，缺价时回退最近成交 → 官方指导价；
  // 自动取两侧中更低的一侧（用户确认「取成本最低的」）。
  getBuyPrice(itemHrid, level, mode) {
    return this.getUnitPrice(itemHrid, level, mode, 'buy');
  },

  // 卖出到手价：报价先按出售方式取值，再扣市场税并向下取整（到手 = floor(报价 × 96%)）。
  getSellPrice(itemHrid, level, mode) {
    return this.getUnitPrice(itemHrid, level, mode, 'sell');
  },

  getUnitPrice(itemHrid, level, mode, intent) {
    const quote = this.getMarketQuote(itemHrid, level);
    let price = 0;
    if (mode === PRICE_MODES.ASK) price = quote.ask || quote.last || quote.official;
    else if (mode === PRICE_MODES.BID) price = quote.bid || quote.last || quote.official;
    else {
      const sides = [
        quote.ask, quote.bid
      ].filter((value) => value > 0);
      // 自动：买入取更低的可用一侧、卖出取更高的可用一侧；两侧都缺价时才回退。
      price = sides.length
        ? intent === 'buy'
          ? Math.min(...sides)
          : Math.max(...sides)
        : quote.last || quote.official;
    }
    if (price <= 0) return 0;
    return intent === 'sell' ? Math.floor(price * MARKET_TAX_MULTIPLIER) : price;
  }
};

// enhancement-cost-acquisition-methods
const enhancementCostAcquisitionMethods = {
  createLines(lineInfo) {
    const lines = [
      {key: 'normal', hrid: lineInfo.normalHrid}
    ];
    if (lineInfo.refinedHrid) lines.push({key: 'refined', hrid: lineInfo.refinedHrid});
    return lines;
  },

  // 精炼方案：普通版 → 精炼版，保留强化等级，只消耗碎片（手持的基础物品不重复计价）。
  // 碎片数量按工匠茶生效折算（1 - 工匠值），与游戏里生产动作的材料消耗一致。
  createRefinePlan(normalHrid, options) {
    const recipe = this.getRefinementRecipe(normalHrid);
    if (!recipe?.inputs.length) return null;
    const artisanMultiplier = this.getArtisanMaterialMultiplier();
    const inputs = [];
    let cost = 0;
    for (const input of recipe.inputs) {
      if (input.itemHrid === normalHrid) continue;
      const unitPrice = this.getBuyPrice(input.itemHrid, 0, options.buyMode);
      if (unitPrice <= 0) return null;
      const count = input.count * artisanMultiplier;
      const inputCost = unitPrice * count;
      cost += inputCost;
      inputs.push({itemHrid: input.itemHrid, count, unitPrice, cost: inputCost});
    }
    if (!inputs.length || cost <= 0) return null;
    return {actionHrid: recipe.actionHrid, inputs, cost, artisanMultiplier};
  },

  // 解精炼方案：精炼版 → 普通版，保留强化等级，拿回 half 的碎片（数值取自游戏数据 shardReturn）。
  createUnrefinePlan(normalHrid, refinedHrid, options) {
    const detail = this.getUnrefineMap().get(refinedHrid);
    if (!detail || detail.baseItemHrid !== normalHrid) return null;
    // 拿回的碎片按「卖掉」计价（不需要它们时就是这笔钱），已扣税。
    const unitPrice = this.getSellPrice(detail.shardHrid, 0, options.sellMode);
    const credit = unitPrice * detail.shardCount;
    if (unitPrice <= 0 || credit <= 0) return null;
    return {
      shardHrid: detail.shardHrid,
      shardCount: detail.shardCount,
      unitPrice,
      credit
    };
  },

  // 每个等级的最便宜获取成本：等级从小到大递推，同一等级内普通版与精炼版互相链接。
  // 垫子永远是普通版（游戏 getPhilosophersMirrorCost 固定取 baseItemHrids[0]）。
  buildAcquisition(lines, options) {
    const baseHrid = lines[NORMAL_LINE_INDEX].hrid;
    const refinedHrid = lines[REFINED_LINE_INDEX]?.hrid || '';
    const mirrorPrice = this.getBuyPrice(PHILOSOPHERS_MIRROR_HRID, 0, options.buyMode);
    const refinePlan = refinedHrid ? this.createRefinePlan(baseHrid, options) : null;
    const unrefinePlan = refinedHrid ? this.createUnrefinePlan(baseHrid, refinedHrid, options) : null;
    const base = new Array(MAX_ENHANCEMENT_LEVEL + 1).fill(null);
    const refined = refinedHrid ? new Array(MAX_ENHANCEMENT_LEVEL + 1).fill(null) : null;
    const better = (left, right) => (left && right ? (right.cost < left.cost ? right : left) : left || right);
    const marketEntry = (hrid, level) => {
      const price = this.getBuyPrice(hrid, level, options.buyMode);
      return price > 0 ? {kind: ACQUISITION_KINDS.MARKET, level, cost: price, marketPrice: price} : null;
    };
    const mirrorEntry = (mainEntry, level) => {
      const padLevel = Math.max(0, level - 2);
      const padEntry = base[padLevel];
      if (!mainEntry || !padEntry || mirrorPrice <= 0) return null;
      return {
        kind: ACQUISITION_KINDS.MIRROR,
        level,
        cost: mainEntry.cost + padEntry.cost + mirrorPrice,
        padLevel,
        padEntry,
        mirrorPrice
      };
    };

    for (let level = 0; level <= MAX_ENHANCEMENT_LEVEL; level += 1) {
      base[level] = better(marketEntry(baseHrid, level), mirrorEntry(base[level - 1] || null, level));
      if (!refined) continue;
      let entry = better(marketEntry(refinedHrid, level), mirrorEntry(refined[level - 1] || null, level));
      if (base[level] && refinePlan) {
        entry = better(entry, {
          kind: ACQUISITION_KINDS.REFINE,
          level,
          cost: base[level].cost + refinePlan.cost,
          refinePlan
        });
      }
      refined[level] = entry;
      // 解精炼：买精炼版拆回普通版（拿回一半碎片）。「自己精炼来的」不再拆——
      // 精炼材料按买入价、返还按卖出价，拆了必然更贵，跳过也能避免两条线互相引用成环。
      if (entry && entry.kind !== ACQUISITION_KINDS.REFINE && unrefinePlan) {
        base[level] = better(base[level], {
          kind: ACQUISITION_KINDS.UNREFINE,
          level,
          cost: entry.cost - unrefinePlan.credit,
          unrefinePlan
        });
      }
    }
    return {base, refined, mirrorPrice, refinePlan, unrefinePlan};
  },

  getAcquisitionTable(acquisition, lineIndex) {
    return lineIndex === NORMAL_LINE_INDEX ? acquisition.base : acquisition.refined;
  },

  // 把一个「最低获取成本」条目展开成可展示的步骤（垫子、主件自己的获取方式一并展开）。
  describeAcquisition(acquisition, lineIndex, level, depth = 0) {
    if (depth > MAX_ROUTE_STEPS) return null;
    const entry = this.getAcquisitionTable(acquisition, lineIndex)?.[level];
    if (!entry) return null;
    if (entry.kind === ACQUISITION_KINDS.MARKET) {
      return [
        {type: 'buy', lineIndex, level, cost: entry.cost}
      ];
    }
    if (entry.kind === ACQUISITION_KINDS.MIRROR) {
      const mainSteps = this.describeAcquisition(acquisition, lineIndex, level - 1, depth + 1);
      const padSteps = this.describeAcquisition(acquisition, NORMAL_LINE_INDEX, entry.padLevel, depth + 1);
      if (!mainSteps || !padSteps) return null;
      // 垫子自己作为独立步骤列在前面，合成步骤只计贤者之镜的价格（步骤合计 = 条目成本）。
      const steps = [
        ...mainSteps, ...padSteps, {
          type: 'mirror',
          lineIndex,
          level,
          fromLevel: level - 1,
          padLevel: entry.padLevel,
          padCost: entry.padEntry.cost,
          mirrorPrice: entry.mirrorPrice,
          cost: entry.mirrorPrice
        }
      ];
      return steps.length > MAX_ROUTE_STEPS ? null : steps;
    }
    const sourceSteps =
      entry.kind === ACQUISITION_KINDS.REFINE
        ? this.describeAcquisition(acquisition, NORMAL_LINE_INDEX, level, depth + 1)
        : this.describeAcquisition(acquisition, REFINED_LINE_INDEX, level, depth + 1);
    if (!sourceSteps) return null;
    const step =
      entry.kind === ACQUISITION_KINDS.REFINE
        ? this.createRefineStep(entry.refinePlan, REFINED_LINE_INDEX, level)
        : this.createUnrefineStep(entry.unrefinePlan, level);
    return [
      ...sourceSteps, step
    ];
  },

  // 精炼步骤：碎片数量已经是工匠茶折算过的量，单价是买入价（方案结算时可能有一部分由解精炼退回的碎片顶掉）。
  createRefineStep(refinePlan, lineIndex, level) {
    const shard = refinePlan.inputs[0];
    return {
      type: 'refine',
      lineIndex,
      fromLineIndex: NORMAL_LINE_INDEX,
      level,
      plan: refinePlan,
      cost: refinePlan.cost,
      shardHrid: shard.itemHrid,
      shardCount: shard.count,
      shardUnitPrice: shard.unitPrice
    };
  },

  // 解精炼步骤：返还的碎片按卖出价计钱（方案结算时被后面精炼用掉的部分不折钱）。
  createUnrefineStep(unrefinePlan, level) {
    return {
      type: 'unrefine',
      lineIndex: NORMAL_LINE_INDEX,
      fromLineIndex: REFINED_LINE_INDEX,
      level,
      plan: unrefinePlan,
      cost: -unrefinePlan.credit,
      shardHrid: unrefinePlan.shardHrid,
      shardReturned: unrefinePlan.shardCount,
      shardUnitPrice: unrefinePlan.unitPrice
    };
  },

  // 用「低一级的主件 + 低两级的普通版垫子 + 贤者之镜」做出该等级：垫子按最便宜方式获取。
  // 垫子的获取步骤单列，合成步骤只计镜子的价格；返回的 cost 是这一级的全部花费。
  buildMirrorStep(acquisition, lineIndex, level) {
    const padLevel = Math.max(0, level - 2);
    const padEntry = acquisition.base[padLevel];
    const padSteps = this.describeAcquisition(acquisition, NORMAL_LINE_INDEX, padLevel);
    if (!padEntry || !padSteps || acquisition.mirrorPrice <= 0) return null;
    return {
      cost: padEntry.cost + acquisition.mirrorPrice,
      steps: [
        ...padSteps, {
          type: 'mirror',
          lineIndex,
          level,
          fromLevel: level - 1,
          padLevel,
          padCost: padEntry.cost,
          mirrorPrice: acquisition.mirrorPrice,
          cost: acquisition.mirrorPrice
        }
      ]
    };
  },

  // 已有装备的两种卖法：① 直接卖（精炼版就卖整件）；② 解精炼后卖普通版 + 卖回碎片。
  // 两种都算出来交给方案去选——方案后面还要精炼时，返还的碎片值买入价（省下这笔买入），
  // 不需要再精炼时才值卖出价，所以哪条更划算要按整条方案定，不能只看卖价。
  buildExistingSaleVariants(lines, acquisition, selection) {
    const {existingLineIndex} = selection;
    if (!(existingLineIndex >= 0)) return {value: 0, viaUnrefine: false, steps: [], variants: []};
    const level = selection.existingLevel;
    const existingHrid = lines[existingLineIndex].hrid;
    const sellPrice = this.getSellPrice(existingHrid, level, selection.sellMode);
    const variants = [];
    if (sellPrice > 0) {
      variants.push({
        value: sellPrice,
        viaUnrefine: false,
        steps: [
          {
            type: 'sell',
            lineIndex: existingLineIndex,
            level,
            cost: -sellPrice
          }
        ]
      });
    }
    const normalSell = this.getSellPrice(lines[NORMAL_LINE_INDEX].hrid, level, selection.sellMode);
    if (existingLineIndex === REFINED_LINE_INDEX && acquisition.unrefinePlan) {
      variants.push({
        value: normalSell + acquisition.unrefinePlan.credit,
        viaUnrefine: true,
        steps: [
          this.createUnrefineStep(acquisition.unrefinePlan, level), ...(normalSell > 0
            ? [
                {
                  type: 'sell',
                  lineIndex: NORMAL_LINE_INDEX,
                  level,
                  cost: -normalSell
                }
              ]
            : [])
        ]
      });
    }
    if (!variants.length) return {value: 0, viaUnrefine: false, steps: [], variants: []};
    // 默认变体（汇总与「直接买成品」用）：按卖价算更值钱的那条。
    const best = variants.reduce((left, right) => (right.value > left.value ? right : left));
    return {...best, variants};
  },

  // 方案内的碎片净额结算：一件装备的精炼与解精炼用的是同一种碎片，所以整条方案合起来算一次。
  // 解精炼拿回的碎片先顶后面精炼要用的量（等于省下这笔买入），多出来的才按卖出价折钱；
  // 这样「解精炼拿回 150 个」不会被当成卖掉 150 个、再原价买回 300 个（用户反馈的那笔重复计价）。
  // 返回 {steps, delta}：delta 相对「碎片全额买入价买、返还全额卖出价卖」的差额。
  settlePlanShards(steps) {
    const hasShards = steps.some((step) => step.type === 'refine' || step.type === 'unrefine');
    if (!hasShards) return {steps, delta: 0};
    // 1) 按时间顺序算出每条精炼能从「之前拿回的碎片」里顶掉多少（之后的解精炼不能倒着用）。
    const refineCoverage = new Map();
    let pool = 0;
    steps.forEach((step, index) => {
      if (step.type === 'unrefine') {
        pool += step.shardReturned;
        return;
      }
      if (step.type !== 'refine') return;
      const covered = Math.min(pool, step.shardCount);
      pool -= covered;
      refineCoverage.set(index, covered);
    });
    // 2) 把「被后面精炼用掉的量」按先拿回先用分摊回各条解精炼，剩下的就是卖掉的部分。
    const needCovered = [
      ...refineCoverage.values()
    ].reduce((total, value) => total + value, 0);
    const usedByUnrefine = new Map();
    let remaining = needCovered;
    steps.forEach((step, index) => {
      if (step.type !== 'unrefine') return;
      const take = Math.min(remaining, step.shardReturned);
      usedByUnrefine.set(index, take);
      remaining -= take;
    });
    // 3) 重写成本并记录顶掉的量，供路线步骤显示。
    let delta = 0;
    const pricedSteps = steps.map((step, index) => {
      if (step.type === 'refine') {
        const covered = refineCoverage.get(index) || 0;
        const bought = step.shardCount - covered;
        const cost = bought * step.shardUnitPrice;
        delta += cost - step.cost;
        return {...step, cost, shardCovered: covered, shardBought: bought};
      }
      if (step.type === 'unrefine') {
        const kept = usedByUnrefine.get(index) || 0;
        const surplus = step.shardReturned - kept;
        const cost = surplus > 0 ? -surplus * step.shardUnitPrice : 0;
        delta += cost - step.cost;
        return {...step, cost, shardKept: kept, shardSurplus: surplus};
      }
      return step;
    });
    return {steps: pricedSteps, delta};
  },

  // 方案花费 = 步骤花费之和：原始步骤（碎片全额买入价、返还全额卖出价）加上碎片净额结算的差额。
  // 不用已有装备的两条方案会把「两种卖法」都试一遍，取更便宜的那种（后面还要精炼时解精炼更值）。
  // gross 只用于「直接买成品」那条的展示（买入价 − 卖掉已有装备的到手价）。
  createPlan(key, gross, steps, heldSale, usesHeld, reason = '') {
    const available = Number.isFinite(gross) && steps.length > 0;
    if (!available) {
      return {
        key,
        gross: null,
        cost: Infinity,
        steps: [],
        usesHeld,
        reason,
        saleValue: 0,
        viaUnrefine: false,
        mirrors: 0,
        refines: 0,
        unrefines: 0
      };
    }
    const saleVariants = usesHeld || !heldSale.variants?.length ? [
            {value: 0, viaUnrefine: false, steps: []}
          ] : heldSale.variants;
    let best = null;
    saleVariants.forEach((variant) => {
      const rawSteps = [
        ...variant.steps, ...steps
      ];
      const settled = this.settlePlanShards(rawSteps);
      const rawSum = rawSteps.reduce((total, step) => total + step.cost, 0);
      const cost = rawSum + settled.delta;
      if (!best || cost < best.cost) best = {cost, steps: settled.steps, variant};
    });
    const planSteps = best.steps;
    return {
      key,
      gross: best.cost + (usesHeld ? 0 : best.variant.value),
      cost: best.cost,
      steps: planSteps,
      usesHeld,
      reason: '',
      saleValue: best.variant.value,
      viaUnrefine: best.variant.viaUnrefine,
      mirrors: planSteps.filter((step) => step.type === 'mirror').length,
      refines: planSteps.filter((step) => step.type === 'refine').length,
      unrefines: planSteps.filter((step) => step.type === 'unrefine').length
    };
  },

  // 方案一：直接买成品；方案二：自己从零按最便宜获取路线做出来。两者的净花费都扣掉卖掉已有装备的到手价。
  buildMarketPlans(acquisition, heldSale, selection) {
    const targetHrid = selection.lines[selection.targetLineIndex].hrid;
    const directPrice = this.getBuyPrice(targetHrid, selection.targetLevel, selection.buyMode);
    const directSteps =
      directPrice > 0
        ? [
            {
              type: 'buy',
              lineIndex: selection.targetLineIndex,
              level: selection.targetLevel,
              cost: directPrice
            }
          ]
        : [];
    const selfEntry = this.getAcquisitionTable(acquisition, selection.targetLineIndex)?.[selection.targetLevel];
    const selfSteps = selfEntry
      ? this.describeAcquisition(acquisition, selection.targetLineIndex, selection.targetLevel)
      : null;
    return [
      this.createPlan(
        PLAN_KEYS.DIRECT,
        directPrice,
        directSteps,
        heldSale,
        false,
        'enhancementCostPlanNoMarket'
      ), this.createPlan(PLAN_KEYS.SELF, selfEntry?.cost ?? Infinity, selfSteps || [], heldSale, false, 'enhancementCostPlanMissingPrice')
    ];
  },

  // 方案三：用已有装备当主件，一路上镜子（目标为精炼版时最后再精炼），垫子按最便宜方式获取。
  buildMainPlan(acquisition, selection) {
    const {existingLineIndex, existingLevel, targetLineIndex, targetLevel} = selection;
    const refineAtEnd = existingLineIndex === NORMAL_LINE_INDEX && targetLineIndex === REFINED_LINE_INDEX;
    if (!(existingLineIndex === targetLineIndex || refineAtEnd)) return null;
    const steps = [
      {
        type: 'keep',
        lineIndex: existingLineIndex,
        level: existingLevel,
        cost: 0
      }
    ];
    let cost = 0;
    for (let level = existingLevel + 1; level <= targetLevel; level += 1) {
      const chain = this.buildMirrorStep(acquisition, existingLineIndex, level);
      if (!chain) return null;
      steps.push(...chain.steps);
      cost += chain.cost;
    }
    if (refineAtEnd) {
      if (!acquisition.refinePlan) return null;
      steps.push(this.createRefineStep(acquisition.refinePlan, REFINED_LINE_INDEX, targetLevel));
      cost += acquisition.refinePlan.cost;
    }
    return {steps, cost};
  },

  // 方案四：用已有装备当垫子——先（可选）把它升到 heldLevel，再拿它当垫子做出 heldLevel+2，继续升到目标。
  // 精炼版先解精炼才符合「垫子必须是普通版」的游戏规则。
  buildPadPlan(acquisition, selection) {
    const {existingLineIndex, existingLevel, targetLineIndex, targetLevel} = selection;
    if (!(existingLineIndex >= 0) || targetLevel < existingLevel + 2) return null;
    const prefixSteps = [];
    let prefixCost = 0;
    if (existingLineIndex === REFINED_LINE_INDEX) {
      if (!acquisition.unrefinePlan) return null;
      prefixSteps.push(this.createUnrefineStep(acquisition.unrefinePlan, existingLevel));
      prefixCost -= acquisition.unrefinePlan.credit;
    }
    const mainLineIndexes = targetLineIndex === REFINED_LINE_INDEX ? [
            REFINED_LINE_INDEX, NORMAL_LINE_INDEX
          ] : [
            NORMAL_LINE_INDEX
          ];
    let best = null;
    for (let heldLevel = existingLevel; heldLevel <= targetLevel - 2; heldLevel += 1) {
      const buildSteps = [];
      let buildCost = 0;
      let built = true;
      for (let level = existingLevel + 1; level <= heldLevel; level += 1) {
        const chain = this.buildMirrorStep(acquisition, NORMAL_LINE_INDEX, level);
        if (!chain) {
          built = false;
          break;
        }
        buildSteps.push(...chain.steps);
        buildCost += chain.cost;
      }
      if (!built) continue;
      mainLineIndexes.forEach((mainLineIndex) => {
        const mainEntry = this.getAcquisitionTable(acquisition, mainLineIndex)?.[heldLevel + 1];
        const mainSteps = mainEntry ? this.describeAcquisition(acquisition, mainLineIndex, heldLevel + 1) : null;
        if (!mainEntry || !mainSteps || acquisition.mirrorPrice <= 0) return;
        const steps = [
          {
            type: 'keep',
            lineIndex: existingLineIndex,
            level: existingLevel,
            cost: 0
          }, ...prefixSteps, ...buildSteps, ...mainSteps, {
            type: 'mirror',
            lineIndex: mainLineIndex,
            level: heldLevel + 2,
            fromLevel: heldLevel + 1,
            padLevel: heldLevel,
            padIsHeld: true,
            mirrorPrice: acquisition.mirrorPrice,
            cost: acquisition.mirrorPrice
          }
        ];
        let cost = prefixCost + buildCost + mainEntry.cost + acquisition.mirrorPrice;
        let ok = true;
        for (let level = heldLevel + 3; level <= targetLevel; level += 1) {
          const chain = this.buildMirrorStep(acquisition, mainLineIndex, level);
          if (!chain) {
            ok = false;
            break;
          }
          steps.push(...chain.steps);
          cost += chain.cost;
        }
        if (!ok) return;
        if (mainLineIndex === NORMAL_LINE_INDEX && targetLineIndex === REFINED_LINE_INDEX) {
          if (!acquisition.refinePlan) return;
          steps.push(this.createRefineStep(acquisition.refinePlan, REFINED_LINE_INDEX, targetLevel));
          cost += acquisition.refinePlan.cost;
        }
        if (!best || cost < best.cost) best = {steps, cost};
      });
    }
    return best;
  },

  // 四个方案都列出来（参考 fastsim 的方案列表）：没有已有装备时只有前两个，
  // 有已有装备时后两个也参与比较（不可用时给出原因，界面照样列出来）。
  buildPlans(acquisition, heldSale, selection) {
    const plans = this.buildMarketPlans(acquisition, heldSale, selection);
    if (selection.existingLineIndex >= 0) {
      const main = this.buildMainPlan(acquisition, selection);
      const pad = this.buildPadPlan(acquisition, selection);
      plans.push(
        this.createPlan(
          PLAN_KEYS.MAIN,
          main?.cost ?? Infinity,
          main?.steps || [],
          heldSale,
          true,
          'enhancementCostPlanMissingPrice'
        ),
        this.createPlan(
          PLAN_KEYS.PAD,
          pad?.cost ?? Infinity,
          pad?.steps || [],
          heldSale,
          true,
          'enhancementCostPlanMissingPrice'
        )
      );
    }
    return plans;
  },

  // 逐级表：从基准+1 到目标，每级给出目标版本的市场买价、最低获取成本与获取方式、最优路线在该级的做法。
  buildLevelRows(acquisition, bestPlan, selection) {
    const targetHrid = selection.lines[selection.targetLineIndex].hrid;
    const table = this.getAcquisitionTable(acquisition, selection.targetLineIndex) || [];
    const marks = this.buildRouteMarks(bestPlan.steps, selection);
    const rows = [];
    // 没有已有装备时从 +1 列起；有已有装备时从它高一级列起（它自己那一行不用再获取）。
    const firstLevel = Math.max(1, selection.existingLineIndex >= 0 ? selection.existingLevel + 1 : 1);
    for (let level = firstLevel; level <= selection.targetLevel; level += 1) {
      const entry = table[level] || null;
      rows.push({
        level,
        marketPrice: this.getBuyPrice(targetHrid, level, selection.buyMode) || null,
        cost: entry ? entry.cost : null,
        kind: entry ? entry.kind : null,
        padLevel: entry?.kind === ACQUISITION_KINDS.MIRROR ? entry.padLevel : null,
        mark: marks.get(level) || null
      });
    }
    return rows;
  },

  // 最优路线在每一级做了什么：买入 / 镜子合成 / 精炼 / 解精炼（同级的垫子步骤让位给目标线步骤）。
  buildRouteMarks(steps, selection) {
    const marks = new Map();
    steps.forEach((step) => {
      if (step.type === 'keep' || step.type === 'sell') return;
      const lineIndex = step.lineIndex;
      const level = step.level;
      const existing = marks.get(level);
      if (existing && !(lineIndex === selection.targetLineIndex && existing.lineIndex !== selection.targetLineIndex))
        return;
      marks.set(level, {type: step.type, lineIndex, cost: step.cost});
    });
    return marks;
  },

  // 不可达时列出缺价：镜子、目标成品、递推里第一个断掉的等级、精炼碎片。
  collectMissingPrices(acquisition, selection) {
    const missing = new Map();
    const push = (itemHrid, level) => {
      if (!itemHrid || this.getBuyPrice(itemHrid, level, selection.buyMode) > 0) return;
      const key = `${itemHrid}::${level}`;
      if (!missing.has(key)) missing.set(key, {itemHrid, level});
    };
    push(PHILOSOPHERS_MIRROR_HRID, 0);
    push(selection.lines[selection.targetLineIndex].hrid, selection.targetLevel);
    [
      [
        NORMAL_LINE_INDEX, acquisition.base
      ], [
        REFINED_LINE_INDEX, acquisition.refined
      ]
    ].forEach(
      ([
        lineIndex, table
      ]) => {
        if (!table) return;
        for (let level = 0; level <= selection.targetLevel; level += 1) {
          if (table[level]) continue;
          push(selection.lines[lineIndex].hrid, level);
          break;
        }
      }
    );
    if (selection.lines.length > 1 && !acquisition.refinePlan) {
      const recipe = this.getRefinementRecipe(selection.lines[NORMAL_LINE_INDEX].hrid);
      (recipe?.inputs || []).forEach((input) => {
        if (input.itemHrid !== selection.lines[NORMAL_LINE_INDEX].hrid) push(input.itemHrid, 0);
      });
    }
    return [
      ...missing.values()
    ];
  },

  calculate(options) {
    const {targetHrid, targetLevel, existingHrid = '', existingLevel = 0, buyMode, sellMode} = options;
    // 目标装备是必选项，两条线（普通 / 精炼）由它决定；已有装备只能是目标物品本身或它的普通版。
    const lineInfo = this.getLineInfo(targetHrid);
    const lines = this.createLines(lineInfo);
    const targetLineIndex = lines.findIndex((line) => line.hrid === targetHrid);
    const existingLineIndex = existingHrid ? lines.findIndex((line) => line.hrid === existingHrid) : -1;
    const selection = {
      targetHrid,
      targetLevel,
      existingHrid,
      existingLevel,
      buyMode,
      sellMode,
      lines,
      targetLineIndex,
      existingLineIndex
    };
    if (targetLineIndex < 0) return {status: 'invalid', reason: 'item'};
    // 已有装备只能是目标物品本身或它的普通版：目标为普通版时不允许拿精炼版当已有装备。
    if (existingHrid && existingLineIndex < 0) return {status: 'invalid', reason: 'existing', ...selection};
    if (existingLineIndex >= 0 && existingLineIndex !== targetLineIndex && existingLineIndex !== NORMAL_LINE_INDEX) {
      return {status: 'invalid', reason: 'existing', ...selection};
    }
    if (existingLineIndex >= 0 && existingLevel > targetLevel)
      return {status: 'invalid', reason: 'level', ...selection};

    const acquisition = this.buildAcquisition(lines, selection);
    const heldSale = this.buildExistingSaleVariants(lines, acquisition, selection);
    const notes = [];
    if (existingLineIndex >= 0 && heldSale.value <= 0) notes.push({key: 'enhancementCostExistingNoSell'});
    const plans = this.buildPlans(acquisition, heldSale, selection);
    const available = plans.filter((plan) => Number.isFinite(plan.cost));
    if (!available.length) {
      return {
        status: 'unreachable',
        missing: this.collectMissingPrices(acquisition, selection),
        notes,
        plans,
        ...selection
      };
    }
    const best = available.reduce((left, right) => (right.cost < left.cost ? right : left));
    const direct = plans.find((plan) => plan.key === PLAN_KEYS.DIRECT);
    const directAvailable = Number.isFinite(direct.cost);
    return {
      status: 'ok',
      plans,
      bestKey: best.key,
      bestCost: best.cost,
      route: best.steps,
      routePlan: best,
      heldSale,
      directBuy: directAvailable ? {price: direct.gross, sell: direct.saleValue, net: direct.cost} : null,
      savings: directAvailable ? direct.cost - best.cost : null,
      levelRows: this.buildLevelRows(acquisition, best, selection),
      notes,
      ...selection
    };
  }
};

// enhancement-cost-calculator
export class EnhancementCostCalculator {
  constructor(ctx, marketService) {
    this.ctx = ctx;
    this.marketService = marketService;
    this.recipeCache = null;
    this.unrefineCache = null;
    Object.assign(this, enhancementCostDataMethods, enhancementCostPriceMethods, enhancementCostAcquisitionMethods);
  }
}
