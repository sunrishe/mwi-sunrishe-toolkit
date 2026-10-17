import {StyleService} from '../../common/runtime.js';
import {MARKET_TAX_RATE} from '../../common/constants.js';
import {
  ACQUISITION_KINDS,
  EnhancementCostCalculator,
  MAX_ENHANCEMENT_LEVEL,
  PHILOSOPHERS_MIRROR_HRID,
  PLAN_KEYS,
  PRICE_MODES
} from './calculator.js';
import MST_ENHANCEMENT_COST_CSS from './styles.css';

// 目标装备是必选项、放在第一位；已有装备可选（'' = 不用），只能是目标物品本身或它的普通版。
const LEVEL_OPTIONS = Array.from({length: MAX_ENHANCEMENT_LEVEL + 1}, (_, index) => index);
const MARKET_TAX_PERCENT = MARKET_TAX_RATE * 100;
const PICKER_ROLES = Object.freeze({TARGET: 'target', EXISTING: 'existing'});
// 生活工具在类型下拉里合并成一项，放在所有部位之后。
const PICKER_TOOL_TYPE = '__tools__';
// 获取方式 → 文案键；垫子等级另外拼在括号里。
const KIND_MESSAGE_KEYS = {
  [ACQUISITION_KINDS.MARKET]: 'enhancementCostKindMarket',
  [ACQUISITION_KINDS.MIRROR]: 'enhancementCostKindMirror',
  [ACQUISITION_KINDS.REFINE]: 'enhancementCostKindRefine',
  [ACQUISITION_KINDS.UNREFINE]: 'enhancementCostKindUnrefine'
};
const PLAN_MESSAGE_KEYS = {
  [PLAN_KEYS.DIRECT]: 'enhancementCostPlanDirect',
  [PLAN_KEYS.SELF]: 'enhancementCostPlanSelf',
  [PLAN_KEYS.MAIN]: 'enhancementCostPlanMain',
  [PLAN_KEYS.PAD]: 'enhancementCostPlanPad'
};
const STEP_MESSAGE_KEYS = {
  mirror: 'enhancementCostOpCombine',
  refine: 'enhancementCostOpRefine',
  unrefine: 'enhancementCostOpUnrefine',
  buy: 'enhancementCostOpBuy'
};

function isSkillingToolType(typeHrid) {
  return String(typeHrid || '').endsWith('_tool');
}

function matchesPickerType(itemDetail, typeValue) {
  const typeHrid = itemDetail?.equipmentDetail?.type;
  if (typeValue === PICKER_TOOL_TYPE) return isSkillingToolType(typeHrid);
  return typeHrid === typeValue;
}

// 这些方法会并到 Feature 实例上（视图里按 feature.xxx() 调用），因此统一用 this.ctx 取服务。
const enhancementCostFormatters = {
  getItemIconHref(itemHrid) {
    const {utils} = this.ctx;
    const sprite = utils.getSpriteUrl('items') || '/static/media/items_sprite.f58c9476.svg';
    return `${sprite}#${utils.substrLastSlash(itemHrid)}`;
  },

  getItemName(itemHrid) {
    const {DataHub} = this.ctx;
    return DataHub.resolveItemName(itemHrid);
  },

  getItemDetail(itemHrid) {
    return this.calculator.getItemMap()[itemHrid] || null;
  },

  getItemSubtitle(itemHrid) {
    const {DataHub} = this.ctx;
    const detail = this.getItemDetail(itemHrid);
    if (!detail) return '';
    const typeName = DataHub.getLocalizedGameName('equipmentTypeNames', detail.equipmentDetail?.type);
    return `${typeName} · Lv.${Number(detail.itemLevel || 0)}`;
  },

  formatCoins(value) {
    const {utils} = this.ctx;
    if (value == null || !Number.isFinite(value)) return '—';
    return utils.formatCompactNumber(value, 3);
  },

  formatItemLabel(itemHrid, level) {
    return `${this.getItemName(itemHrid)} +${level}`;
  },

  formatCount(value) {
    const {utils} = this.ctx;
    return utils.formatCompactNumber(Number(value) || 0, 0);
  },

  // 路线步骤里的版本标签：普通线显示「基础版」，精炼线显示「精炼版」。
  getLineLabel(result, lineIndex) {
    const {i18n} = this.ctx;
    const line = result?.lines?.[lineIndex];
    return i18n.t(line?.key === 'refined' ? 'enhancementCostLineRefined' : 'enhancementCostLineOriginal');
  },

  getLineHrid(result, lineIndex) {
    return result?.lines?.[lineIndex]?.hrid || '';
  }
};

// enhancement-cost-selection-methods
const enhancementCostSelectionMethods = {
  // 已有装备的候选：不用（''）+ 目标的普通版 + 目标物品本身（目标本身是普通版时只有两项）。
  // 顺序按游戏的物品顺序（itemDetailMap.sortIndex，普通版在精炼版之前），与目标面板的卡片一致。
  getExistingOptions() {
    if (!this.targetHrid) return [];
    const {normalHrid} = this.calculator.getLineInfo(this.targetHrid);
    const options = [
      {hrid: '', noItem: true}
    ];
    if (normalHrid !== this.targetHrid) options.push({hrid: normalHrid, labelKey: 'enhancementCostLineOriginal'});
    options.push({
      hrid: this.targetHrid,
      labelKey: this.targetHrid === normalHrid ? 'enhancementCostLineOriginal' : 'enhancementCostLineRefined'
    });
    return options;
  },

  getExistingLevelOptions() {
    return LEVEL_OPTIONS.filter((level) => level <= this.targetLevel);
  },

  getResult() {
    if (!this.targetHrid) return null;
    // 同一次选择与同一份市场数据只算一次；市场数据重新加载后由调用方清空缓存。
    const cacheKey = [
      this.targetHrid, this.targetLevel, this.existingHrid, this.existingLevel, this.buyMode,
      this.sellMode, this.marketService?.marketTimestamp || 0
    ].join('|');
    if (this.resultCache?.key === cacheKey) return this.resultCache.result;
    const result = this.calculator.calculate({
      targetHrid: this.targetHrid,
      targetLevel: this.targetLevel,
      existingHrid: this.existingHrid,
      existingLevel: this.existingLevel,
      buyMode: this.buyMode,
      sellMode: this.sellMode
    });
    this.resultCache = {key: cacheKey, result};
    return result;
  },

  // 换目标后，已有装备只有还在候选里才保留，否则回到「不用」；等级不能高于目标。
  syncExistingSelection() {
    const options = this.getExistingOptions();
    if (!options.some((option) => option.hrid === this.existingHrid)) this.existingHrid = '';
    if (this.existingLevel > this.targetLevel) this.existingLevel = this.targetLevel;
  },

  selectTargetItem(itemHrid) {
    this.targetHrid = itemHrid || '';
    this.syncExistingSelection();
    this.closePicker();
  },

  selectExistingItem(itemHrid) {
    this.existingHrid = itemHrid || '';
    this.syncExistingSelection();
    this.closePicker();
  },

  setTargetLevel(value) {
    const level = Number(value);
    if (!Number.isFinite(level)) return;
    this.targetLevel = Math.min(Math.max(0, Math.trunc(level)), MAX_ENHANCEMENT_LEVEL);
    this.syncExistingSelection();
    this.render();
  },

  setExistingLevel(value) {
    const level = Number(value);
    if (!Number.isFinite(level)) return;
    this.existingLevel = Math.min(Math.max(0, Math.trunc(level)), this.targetLevel);
    this.render();
  },

  setPriceMode(kind, value) {
    if (!Object.values(PRICE_MODES).includes(value)) return;
    if (kind === 'buy') this.buyMode = value;
    else this.sellMode = value;
    this.render();
  },

  // 两个选择器共用同一个面板：目标列出全部可强化装备，已有装备只列「不用 / 目标物品 / 它的普通版」。
  openPicker(role) {
    if (role === PICKER_ROLES.EXISTING && !this.targetHrid) return;
    this.pickerRole = role;
    this.pickerQuery = '';
    this.pickerType = '';
    this.render();
    this.root?.querySelector('.mst-picker-search')?.focus();
  },

  closePicker() {
    this.pickerRole = '';
    this.pickerQuery = '';
    this.pickerType = '';
    this.render();
  },

  setPickerType(value) {
    this.pickerType = value;
    this.render();
  },

  setPickerQuery(value) {
    this.pickerQuery = value;
    this.render();
  },

  getPickerOptions() {
    if (this.pickerRole === PICKER_ROLES.EXISTING) {
      return this.getExistingOptions().map((option) => ({
        hrid: option.hrid,
        noItem: Boolean(option.noItem),
        labelKey: option.labelKey,
        detail: option.hrid ? this.getItemDetail(option.hrid) : null
      }));
    }
    const items = this.calculator.getEnhanceableItems();
    const typeHrid = this.pickerType;
    const query = String(this.pickerQuery || '')
      .trim()
      .toLowerCase();
    return items.filter((item) => {
      if (typeHrid && !matchesPickerType(item.detail, typeHrid)) return false;
      if (!query) return true;
      const name = String(item.detail.name || '').toLowerCase();
      const localName = String(this.getItemName(item.hrid) || '').toLowerCase();
      return name.includes(query) || localName.includes(query) || item.hrid.toLowerCase().includes(query);
    });
  },

  // 类型下拉顺序取自游戏 equipmentTypeDetailMap 的 sortIndex；生活工具（*_tool）合并成一个「工具」项放最后。
  getPickerTypeOptions() {
    const {DataHub} = this.ctx;
    const available = new Set(
      this.calculator
        .getEnhanceableItems()
        .map((item) => item.detail.equipmentDetail?.type)
        .filter(Boolean)
    );
    const typeMap = DataHub.getClientDataMap('equipmentTypeDetailMap') || {};
    const options = Object.values(typeMap)
      .filter((detail) => detail?.hrid && available.has(detail.hrid) && !isSkillingToolType(detail.hrid))
      .sort((left, right) => Number(left.sortIndex || 999) - Number(right.sortIndex || 999))
      .map((detail) => ({
        value: detail.hrid,
        label: DataHub.getLocalizedGameName('equipmentTypeNames', detail.hrid)
      }));
    const hasTools = [
      ...available
    ].some(isSkillingToolType);
    if (hasTools) options.push({value: PICKER_TOOL_TYPE, label: this.ctx.i18n.t('enhancementCostToolType')});
    return options;
  },

  // 路线每一步转成界面文案：操作名 + 消耗描述 + 产出描述。
  describeStep(step, result) {
    const {i18n} = this.ctx;
    const lineHrid = (lineIndex) => this.getLineHrid(result, lineIndex);
    const label = (lineIndex, level) => this.formatItemLabel(lineHrid(lineIndex), level);
    const mirrorLabel = `${this.getItemName(PHILOSOPHERS_MIRROR_HRID)} ×1`;
    if (step.type === 'keep') {
      return {op: i18n.t('enhancementCostStepKeep'), desc: label(step.lineIndex, step.level), result: ''};
    }
    if (step.type === 'sell') {
      return {
        op: i18n.t('enhancementCostStepSellOp'),
        desc: label(step.lineIndex, step.level),
        result: i18n.t('enhancementCostStepSellResult', this.formatCoins(-step.cost))
      };
    }
    if (step.type === 'buy') {
      return {op: i18n.t('enhancementCostOpBuy'), desc: label(step.lineIndex, step.level), result: ''};
    }
    if (step.type === 'mirror') {
      const padText = step.padIsHeld
        ? i18n.t('enhancementCostStepHeldPad', label(0, step.padLevel))
        : i18n.t('enhancementCostStepPad', label(0, step.padLevel));
      return {
        op: i18n.t('enhancementCostOpCombine'),
        desc: `${padText} + ${mirrorLabel}`,
        result: label(step.lineIndex, step.level)
      };
    }
    if (step.type === 'refine') {
      const shardCount = step.shardCount ?? step.plan.inputs[0]?.count ?? 0;
      const shardName = this.getItemName(step.shardHrid || step.plan.inputs[0]?.itemHrid || '');
      // 已被解精炼顶掉的量写在括号里，花费只算实际要买的部分。
      const coveredText =
        step.shardCovered > 0 ? i18n.t('enhancementCostStepShardCovered', this.formatCount(step.shardCovered)) : '';
      return {
        op: i18n.t('enhancementCostOpRefine'),
        desc: `${shardName} ×${this.formatCount(shardCount)}${coveredText}`,
        result: label(step.lineIndex, step.level)
      };
    }
    const shardNotes = [];
    if (step.shardKept > 0) shardNotes.push(i18n.t('enhancementCostStepShardKept', this.formatCount(step.shardKept)));
    if (step.shardSurplus > 0)
      shardNotes.push(i18n.t('enhancementCostStepShardSold', this.formatCount(step.shardSurplus)));
    return {
      op: i18n.t('enhancementCostOpUnrefine'),
      desc: label(step.fromLineIndex, step.level),
      result: `${i18n.t(
        'enhancementCostStepUnrefineResult',
        this.getItemName(step.plan.shardHrid),
        this.formatCount(step.shardReturned ?? step.plan.shardCount)
      )}${shardNotes.length ? `（${shardNotes.join('，')}）` : ''}`
    };
  },

  // 方案的名字：不用已有装备的两条（直接买 / 自己做）标明已经把已有装备卖掉。
  describePlan(plan) {
    const {i18n} = this.ctx;
    const label = i18n.t(PLAN_MESSAGE_KEYS[plan.key] || 'enhancementCostPlanSelf');
    return plan.usesHeld ? label : i18n.t('enhancementCostPlanSellPrefix', label);
  },

  // 逐级表的「获取方式」列：来源名称 + 镜子合成的垫子等级。
  describeAcquisitionKind(row) {
    const {i18n} = this.ctx;
    const key = KIND_MESSAGE_KEYS[row.kind];
    if (!key) return '—';
    const label = i18n.t(key);
    return row.padLevel != null ? `${label} · ${i18n.t('enhancementCostKindPad', `+${row.padLevel}`)}` : label;
  }
};

// enhancement-cost-view
const enhancementCostView = {
  // 选择器卡片：图标 + 名称 + 强化等级，点击卡片打开物品选择面板（没有已有装备时它显示为可选）。
  renderSelectorCard(feature, role) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const isTarget = role === PICKER_ROLES.TARGET;
    const itemHrid = isTarget ? feature.targetHrid : feature.existingHrid;
    const detail = itemHrid ? feature.getItemDetail(itemHrid) : null;
    const levelOptions = isTarget ? LEVEL_OPTIONS : feature.getExistingLevelOptions();
    const level = isTarget ? feature.targetLevel : feature.existingLevel;
    const selectable = isTarget || Boolean(feature.targetHrid);
    const placeholder = isTarget
      ? i18n.t('enhancementCostChooseTarget')
      : feature.targetHrid
        ? i18n.t('enhancementCostExistingNone')
        : i18n.t('enhancementCostChooseTargetFirst');
    const showControls = Boolean(detail) && levelOptions.length > 0;
    return TemplateRenderer.html`
  <div
    role="button"
    tabindex="0"
    aria-label=${placeholder}
    class=${`mst-item-select-button${showControls ? '' : ' mst-item-select-empty'}${selectable ? '' : ' mst-item-select-static'}`}
    @click=${(event) => {
      if (selectable && !event.target.closest('.mst-item-select-level')) feature.openPicker(role);
    }}
    @keydown=${(event) => {
      if (
        selectable &&
        !event.target.closest('.mst-item-select-level') &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        feature.openPicker(role);
      }
    }}>
    <span class="mst-item-icon" .hidden=${!itemHrid}>
      <svg aria-hidden="true"><use href=${itemHrid ? feature.getItemIconHref(itemHrid) : ''}></use></svg>
    </span>
    <span class="mst-item-summary" .hidden=${!itemHrid}>
      <strong>${itemHrid ? feature.getItemName(itemHrid) : ''}</strong>
      <small>${feature.getItemSubtitle(itemHrid)}</small>
    </span>
    <span class="mst-enhancement-cost-controls" .hidden=${!showControls}>
      <label class="mst-item-select-level">
        <span>${i18n.t('enhancementLevel')}</span>
        <select
          .value=${String(level)}
          @change=${(event) => (isTarget ? feature.setTargetLevel(event.currentTarget.value) : feature.setExistingLevel(event.currentTarget.value))}>
          ${levelOptions.map(
            (option) =>
              TemplateRenderer.html`<option value=${String(option)} .selected=${option === level}>+${option}</option>`
          )}
        </select>
      </label>
    </span>
    <span class="mst-item-placeholder" .hidden=${Boolean(itemHrid) && levelOptions.length > 0}>${placeholder}</span>
  </div>`;
  },

  renderExistingHint(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    // 常驻节点 + hidden：插槽里不能用空模板与真实模板来回替换（会踩 uhtml 补丁替换的坑）。
    const show = Boolean(feature.targetHrid);
    return TemplateRenderer.html`
  <small class="mst-enhancement-cost-line-hint" .hidden=${!show}>
    ${i18n.t('enhancementCostExistingHint')}
  </small>`;
  },

  renderPriceMode(feature, kind) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const value = kind === 'buy' ? feature.buyMode : feature.sellMode;
    const modes = [
      {
        value: PRICE_MODES.AUTO,
        labelKey: 'enhancementCostPriceAuto',
        hintKey: 'enhancementCostPriceAutoHint'
      }, {value: PRICE_MODES.ASK, labelKey: 'enhancementCostPriceAsk', hintKey: 'enhancementCostPriceAskHint'}, {
        value: PRICE_MODES.BID,
        labelKey: 'enhancementCostPriceBid',
        hintKey: 'enhancementCostPriceBidHint'
      }
    ];
    const active = modes.find((mode) => mode.value === value) || modes[0];
    return TemplateRenderer.html`
  <label class="mst-enhancement-cost-mode" title=${i18n.t(active.hintKey)}>
    <span>${i18n.t(kind === 'buy' ? 'enhancementCostBuyMode' : 'enhancementCostSellMode')}</span>
    <select
      .value=${value}
      @change=${(event) => feature.setPriceMode(kind, event.currentTarget.value)}>
      ${modes.map(
        (mode) =>
          TemplateRenderer.html`<option value=${mode.value} .selected=${mode.value === value}>${i18n.t(mode.labelKey)}</option>`
      )}
    </select>
  </label>`;
  },

  renderPicker(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    // 面板常驻、用 hidden 开关：收起状态返回空模板会让 uhtml 在补丁替换时出错（已由浏览器验证暴露）。
    const isOpen = Boolean(feature.pickerRole);
    const isExistingPicker = feature.pickerRole === PICKER_ROLES.EXISTING;
    const options = isOpen ? feature.getPickerOptions() : [];
    const typeOptions = isOpen && !isExistingPicker ? feature.getPickerTypeOptions() : [];
    const selectedHrid = isExistingPicker ? feature.existingHrid : feature.targetHrid;
    return TemplateRenderer.html`
  <div class="mst-picker" .hidden=${!isOpen}>
    <div class="mst-picker-panel">
      <div class="mst-picker-filters" .hidden=${isExistingPicker}>
        <select
          class="mst-picker-type"
          .value=${feature.pickerType}
          @change=${(event) => feature.setPickerType(event.currentTarget.value)}>
          <option value="">${i18n.t('allEquipmentSlots')}</option>
          ${typeOptions.map(
            (entry) =>
              TemplateRenderer.html`<option value=${entry.value} .selected=${entry.value === feature.pickerType}>${entry.label}</option>`
          )}
        </select>
        <input
          class="mst-picker-search"
          type="search"
          autocomplete="off"
          placeholder=${i18n.t('searchEquipment')}
          .value=${feature.pickerQuery}
          @input=${(event) => feature.setPickerQuery(event.currentTarget.value)}>
      </div>
      <div class="mst-picker-options">
        ${options.map((item) => {
          const selected = item.hrid === selectedHrid;
          return TemplateRenderer.html`
        <button
          type="button"
          class=${`mst-picker-option${selected ? ' mst-picker-option-selected' : ''}`}
          title=${item.noItem ? i18n.t('enhancementCostExistingNoneHint') : feature.getItemName(item.hrid)}
          .disabled=${selected}
          @click=${() => (isExistingPicker ? feature.selectExistingItem(item.hrid) : feature.selectTargetItem(item.hrid))}>
          <span class="mst-picker-level" .hidden=${!item.labelKey}>${item.labelKey ? i18n.t(item.labelKey) : ''}</span>
          <span class="mst-picker-item-level" .hidden=${!!item.noItem}>Lv.${Number(item.detail?.itemLevel || 0)}</span>
          <span class="mst-picker-none" .hidden=${!item.noItem}>${i18n.t('enhancementCostExistingNone')}</span>
          <svg aria-hidden="true" .hidden=${!!item.noItem}><use href=${item.hrid ? feature.getItemIconHref(item.hrid) : ''}></use></svg>
          <strong .hidden=${!!item.noItem}>${item.hrid ? feature.getItemName(item.hrid) : ''}</strong>
        </button>`;
        })}
        <div class="mst-picker-empty" .hidden=${options.length > 0}>${i18n.t('noEquipmentMatch')}</div>
      </div>
      <button type="button" class="mst-picker-close" @click=${() => feature.closePicker()}>
        ${i18n.t('close')}
      </button>
    </div>
  </div>`;
  },

  renderRoute(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const steps = [];
    let subtotal = 0;
    result.route.forEach((step, index) => {
      subtotal += step.cost;
      const description = feature.describeStep(step, result);
      const showCost = step.type !== 'keep';
      steps.push(TemplateRenderer.html`
    <li class=${step.cost < 0 ? 'mst-enhancement-cost-route-gain' : ''}>
      <span class="mst-enhancement-cost-route-index">${index + 1}</span>
      <span class="mst-enhancement-cost-route-op">${description.op}</span>
      <span class="mst-enhancement-cost-route-desc">
        <strong>${description.desc}</strong>
        <small .hidden=${!description.result}>→ ${description.result}</small>
      </span>
      <span class="mst-enhancement-cost-route-cost">
        <small>${i18n.t('enhancementCostStepCost')}</small>
        <strong>${showCost ? feature.formatCoins(step.cost) : '—'}</strong>
      </span>
      <span class="mst-enhancement-cost-route-total">
        <small>${i18n.t('enhancementCostStepTotal')}</small>
        <strong>${feature.formatCoins(subtotal)}</strong>
      </span>
    </li>`);
    });
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-section">
    <div class="mst-enhancement-cost-section-title">
      ${i18n.t('enhancementCostRouteTitle')}
      <small>${feature.describePlan(result.routePlan)}</small>
    </div>
    <ol class="mst-enhancement-cost-route">${steps}</ol>
  </div>`;
  },

  // 全部方案：列出每个候选做法的净花费、用到的镜子与精炼次数，最佳方案高亮并标「最佳」。
  renderPlans(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const rows = result.plans.map((plan) => {
      const available = Number.isFinite(plan.cost);
      const isBest = plan.key === result.bestKey;
      const note = isBest ? i18n.t('enhancementCostPlanBest') : available ? '' : i18n.t(plan.reason);
      return TemplateRenderer.html`
    <tr class=${isBest ? 'mst-enhancement-cost-plan-best' : ''}>
      <th scope="row">${feature.describePlan(plan)}</th>
      <td>${available ? feature.formatCoins(plan.cost) : '—'}</td>
      <td>${plan.mirrors || '—'}</td>
      <td>${plan.refines || '—'}</td>
      <td>${note}</td>
    </tr>`;
    });
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-section">
    <div class="mst-enhancement-cost-section-title">
      ${i18n.t('enhancementCostPlansTitle')}
      <small>${i18n.t('enhancementCostPlansHint')}</small>
    </div>
    <div class="mst-enhancement-cost-table-wrap mst-enhancement-cost-plans-wrap">
      <table class="mst-enhancement-cost-table mst-enhancement-cost-plans">
        <thead><tr>
            <th>${i18n.t('enhancementCostColumnPlan')}</th>
            <th title=${i18n.t('enhancementCostColumnPlanCostHint')}>${i18n.t('enhancementCostColumnPlanCost')}</th>
            <th>${i18n.t('enhancementCostColumnMirrors')}</th>
            <th>${i18n.t('enhancementCostColumnRefines')}</th>
            <th>${i18n.t('enhancementCostColumnNote')}</th>
          </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  },

  // 逐级表的「最优路线」列：最优路线在该等级做的是哪一步（合成 / 买入 / 精炼 / 解精炼）。
  describeMark(feature, row, result) {
    const {i18n} = feature.ctx;
    const mark = row.mark;
    if (!mark) return i18n.t('enhancementCostOpNotUsed');
    const opText = i18n.t(STEP_MESSAGE_KEYS[mark.type] || 'enhancementCostOpBuy');
    if (mark.lineIndex === result.targetLineIndex) return opText;
    return `${opText} · ${feature.getLineLabel(result, mark.lineIndex)}`;
  },

  renderLevelTable(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const rows = result.levelRows.map((row) => {
      // 自己做比市场买便宜时用绿色标出（市场缺价时不比较）。
      const cheaper = row.cost != null && row.marketPrice != null && row.cost < row.marketPrice;
      return TemplateRenderer.html`
    <tr>
      <th scope="row">+${row.level}</th>
      <td>${feature.formatCoins(row.marketPrice)}</td>
      <td class=${cheaper ? 'mst-positive' : ''}>${feature.formatCoins(row.cost)}</td>
      <td>${feature.describeAcquisitionKind(row)}</td>
      <td>${this.describeMark(feature, row, result)}</td>
    </tr>`;
    });
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-section" .hidden=${rows.length === 0}>
    <div class="mst-enhancement-cost-section-title">
      ${i18n.t('enhancementCostCompareTitle')}
      <small>${i18n.t('enhancementCostCompareHint', feature.formatItemLabel(result.targetHrid, result.targetLevel))}</small>
    </div>
    <div class="mst-enhancement-cost-table-wrap">
      <table class="mst-enhancement-cost-table">
        <thead><tr>
            <th>${i18n.t('enhancementCostColumnLevel')}</th>
            <th title=${i18n.t('enhancementCostColumnMarketHint')}>${i18n.t('enhancementCostColumnMarket')}</th>
            <th title=${i18n.t('enhancementCostColumnAcquireHint')}>${i18n.t('enhancementCostColumnAcquire')}</th>
            <th title=${i18n.t('enhancementCostColumnKindHint')}>${i18n.t('enhancementCostColumnKind')}</th>
            <th>${i18n.t('enhancementCostRouteTitle')}</th>
          </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  },

  renderSummary(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const hints = this.renderSummaryHints(feature, result);
    const directBuyText = result.directBuy
      ? result.directBuy.sell > 0
        ? `${feature.formatCoins(result.directBuy.net)}（${feature.formatCoins(result.directBuy.price)} − ${feature.formatCoins(result.directBuy.sell)}）`
        : feature.formatCoins(result.directBuy.net)
      : '—';
    const savedText =
      result.savings == null
        ? '—'
        : result.savings > 0
          ? feature.formatCoins(result.savings)
          : i18n.t('enhancementCostSavedBest');
    const marketText = feature.marketService?.getUpdatedText?.() || i18n.t('marketNoData');
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-section">
    <div class="mst-enhancement-cost-section-title">
      ${i18n.t('enhancementCostSummaryTitle')}
      ${hints}
    </div>
    <div class="mst-enhancement-cost-summary">
      <span class="mst-enhancement-cost-metric" title=${i18n.t('enhancementCostTotalCostHint')}>
        <small>${i18n.t('enhancementCostTotalCost')}</small>
        <strong class=${result.bestCost < 0 ? 'mst-positive' : ''}>${feature.formatCoins(result.bestCost)}</strong>
      </span>
      <span class="mst-enhancement-cost-metric">
        <small>${i18n.t('enhancementCostBestPlan')}</small>
        <strong>${feature.describePlan(result.routePlan)}</strong>
      </span>
      <span class="mst-enhancement-cost-metric" title=${i18n.t('enhancementCostDirectBuyHint')}>
        <small>${i18n.t('enhancementCostDirectBuy')}</small>
        <strong>${directBuyText}</strong>
      </span>
      <span class="mst-enhancement-cost-metric">
        <small>${i18n.t('enhancementCostSaved')}</small>
        <strong class=${result.savings > 0 ? 'mst-positive' : ''}>${savedText}</strong>
      </span>
      <span class="mst-enhancement-cost-metric">
        <small>${i18n.t('marketDataTime')}</small>
        <strong>${marketText}</strong>
      </span>
    </div>
  </div>`;
  },

  // 汇总标题后的说明：固定写金额单位与税率，另有「已有装备无卖价」这类结果说明。
  renderSummaryHints(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const existingLabel = result.existingHrid
      ? feature.formatItemLabel(result.existingHrid, result.existingLevel)
      : i18n.t('enhancementCostExistingNone');
    return TemplateRenderer.html`
    <small>${i18n.t('enhancementCostMarketHint', Math.round(MARKET_TAX_PERCENT))}</small>
    ${(result.notes || []).map((note) => TemplateRenderer.html`<small>${i18n.t(note.key, existingLabel)}</small>`)}`;
  },

  renderNotes(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const existingLabel = result.existingHrid
      ? feature.formatItemLabel(result.existingHrid, result.existingLevel)
      : i18n.t('enhancementCostExistingNone');
    const notes = (result.notes || []).map(
      (note) => TemplateRenderer.html`<div class="mst-enhancement-cost-note">${i18n.t(note.key, existingLabel)}</div>`
    );
    const marketText = feature.marketService?.getUpdatedText?.() || i18n.t('marketNoData');
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-notes">
    ${notes}
    <div class="mst-enhancement-cost-note">
      ${i18n.t('enhancementCostMarketHint', Math.round(MARKET_TAX_PERCENT))} · ${i18n.t('marketDataTime')} ${marketText}
    </div>
  </div>`;
  },

  renderMissing(feature, missing) {
    const {TemplateRenderer, i18n} = feature.ctx;
    return TemplateRenderer.html`
  <ul class="mst-enhancement-cost-missing">
    ${missing.map(
      (entry) =>
        TemplateRenderer.html`<li>${i18n.t('enhancementCostMissingPrice', feature.formatItemLabel(entry.itemHrid, entry.level))}</li>`
    )}
  </ul>`;
  },

  renderResults(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    if (!feature.targetHrid) {
      return TemplateRenderer.html`<div class="mst-enhancement-cost-hint">${i18n.t('enhancementCostChooseTarget')}</div>`;
    }
    const result = feature.getResult();
    if (!result || result.status === 'invalid') {
      return TemplateRenderer.html`<div class="mst-enhancement-cost-hint">${i18n.t('enhancementCostLevelInvalid')}</div>`;
    }
    if (!feature.calculator.hasMarketData()) {
      return TemplateRenderer.html`<div class="mst-enhancement-cost-hint">${i18n.t('enhancementCostMarketLoading')}</div>`;
    }
    if (result.status === 'unreachable') {
      // 插槽值统一包成单一根节点：本工程内置的 uhtml 构建对多根兄弟节点会渲染为空。
      return TemplateRenderer.html`
    <div class="mst-enhancement-cost-result">
      <div class="mst-enhancement-cost-hint mst-enhancement-cost-warning">
        <div>${i18n.t('enhancementCostUnreachable')}</div>
        <small>${i18n.t('enhancementCostUnreachableHint')}</small>
      </div>
      ${this.renderMissing(feature, result.missing)}
      ${this.renderNotes(feature, result)}
    </div>`;
    }
    return TemplateRenderer.html`
  <div class="mst-enhancement-cost-result">
    ${this.renderSummary(feature, result)}
    ${this.renderPlans(feature, result)}
    ${this.renderRoute(feature, result)}
    ${this.renderLevelTable(feature, result)}
  </div>`;
  },

  getView(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    return TemplateRenderer.html`
  <div class=${`mst-enhancement-cost${feature.pickerRole ? ' mst-picker-open' : ''}`}>
    <div class="mst-config-scroll">
      <div class="mst-config-row">
        <section class="mst-item-selector">
          <span class="mst-item-selector-title">${i18n.t('enhancementCostTarget')}</span>
          ${this.renderSelectorCard(feature, PICKER_ROLES.TARGET)}
        </section>
        <section class="mst-item-selector">
          <span class="mst-item-selector-title">${i18n.t('enhancementCostExisting')}</span>
          ${this.renderSelectorCard(feature, PICKER_ROLES.EXISTING)}
          ${this.renderExistingHint(feature)}
        </section>
      </div>
    </div>
    <div class="mst-enhancement-cost-modes">
      ${this.renderPriceMode(feature, 'buy')}
      ${this.renderPriceMode(feature, 'sell')}
    </div>
    <div class="mst-enhancement-cost-results">${this.renderResults(feature)}</div>
    ${this.renderPicker(feature)}
  </div>`;
  }
};

// enhancement-cost-feature
export class EnhancementCostCalculatorFeature {
  constructor(ctx, marketService = null) {
    this.ctx = ctx;
    this.marketService = marketService;
    this.calculator = new EnhancementCostCalculator(ctx, marketService);
    this.root = null;
    // 目标装备必选；已有装备可选（'' = 不用已有装备）。
    this.targetHrid = '';
    this.targetLevel = 0;
    this.existingHrid = '';
    this.existingLevel = 0;
    this.buyMode = PRICE_MODES.AUTO;
    this.sellMode = PRICE_MODES.AUTO;
    // 选择面板一次只服务一个选择器：'' / 'target' / 'existing'。
    this.pickerRole = '';
    this.pickerQuery = '';
    this.pickerType = '';
    this.resultCache = null;
    this.helpController = null;
    this.view = enhancementCostView;
    Object.assign(this, enhancementCostFormatters, enhancementCostSelectionMethods);
  }

  render() {
    const {TemplateRenderer} = this.ctx;
    if (!this.root) return;
    TemplateRenderer.render(() => this.view.getView(this), this.root);
  }

  refreshLanguage() {
    const {i18n} = this.ctx;
    this.render();
    const popup = this.root?.closest('.mst-enhancement-cost-dialog');
    if (!popup) return;
    const title = popup.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('enhancementCostTitle');
    this.mountHelpPopover(popup);
  }

  mountHelpPopover(popup) {
    const {CalculatorHelpPopover, i18n} = this.ctx;
    this.helpController?.cleanup();
    this.helpController = CalculatorHelpPopover.mount({
      popup,
      title: i18n.t('enhancementCostHelpTitle'),
      heading: i18n.t('enhancementCostTitle'),
      content: i18n.t('enhancementCostHelp')
    });
  }

  open() {
    const {Notifier, TemplateRenderer, i18n} = this.ctx;
    if (!this.calculator.getEnhanceableItems().length) {
      return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
    }
    return Notifier.html({
      title: i18n.t('enhancementCostTitle'),
      html: () => TemplateRenderer.html`<div id="mst-enhancement-cost-root"></div>`,
      width: 'min(46rem, calc(100vw - 1rem))',
      popupClass: 'mst-enhancement-cost-dialog',
      icon: 'loadout',
      didOpen: (popup) => {
        this.root = popup.querySelector('#mst-enhancement-cost-root');
        this.resultCache = null;
        this.render();
        this.mountHelpPopover(popup);
        // 市场数据晚于弹窗就绪时补渲染一次，让缺价提示换成真实结论。
        this.marketService
          ?.load()
          .then(() => {
            this.resultCache = null;
            this.render();
          })
          .catch((error) => {
            console.warn('[MST] 强化物品价格计算器市场数据加载失败:', error);
          });
      },
      willClose: () => {
        this.helpController?.cleanup();
        this.helpController = null;
        this.root = null;
        this.resultCache = null;
        this.pickerRole = '';
      }
    });
  }

  init() {
    const {CONFIG, LanguageEvents} = this.ctx;
    LanguageEvents.subscribe(() => this.refreshLanguage());
    if (!CONFIG?.isGameSite) return;
    StyleService.ensure('mst-enhancement-cost-style', MST_ENHANCEMENT_COST_CSS);
  }
}
