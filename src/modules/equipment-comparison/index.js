import {EQUIPMENT_COMPARISON_PRESET_GROUPS, EQUIPMENT_COMPARISON_PRESETS} from './presets.js';

// equipment-comparison-formatters
const equipmentComparisonFormatters = {
  getItemIconHref(feature, itemHrid) {
    const {utils} = feature.ctx;
    const sprite = utils.getSpriteUrl('items') || '/static/media/items_sprite.f58c9476.svg';
    return `${sprite}#${utils.substrLastSlash(itemHrid)}`;
  },

  getStatName(feature, category, key) {
    const {DataHub} = feature.ctx;
    const group = category === 'combat' ? 'combatStats' : 'noncombatStats';
    const localized = DataHub.getLocalizedGameName(group, key);
    if (localized && localized !== key) return localized;
    const spaced = String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
  },

  formatNumber(feature, value, maximumFractionDigits = 3) {
    const {i18n} = feature.ctx;
    const rounded = Math.abs(value) < 0.0005 ? 0 : Number(Number(value).toFixed(maximumFractionDigits));
    return new Intl.NumberFormat(i18n.locale, {maximumFractionDigits}).format(rounded);
  },

  formatStatValue(feature, key, value, isDifference = false) {
    const {DataHub, EquipmentComparisonService, i18n} = feature.ctx;
    if (value == null) return '—';
    if (EquipmentComparisonService.SKILL_STAT_KEYS.has(key)) {
      return DataHub.getLocalizedGameName('skillNames', value);
    }
    if (key === 'combatStyleHrids') {
      return (Array.isArray(value) ? value : [
              value
            ])
        .map((hrid) => DataHub.getLocalizedGameName('combatStyleNames', hrid))
        .join(i18n.t('listSeparator'));
    }
    if (key === 'damageType') return DataHub.getLocalizedGameName('damageTypeNames', value);
    if (typeof value !== 'number') return String(value);
    const prefix = isDifference && value > 0 ? '+' : '';
    // 攻击间隔越低越好，其余百分比属性按游戏小数格式转成人类可读百分比。
    if (key === 'attackInterval') return `${prefix}${feature.formatNumber(value / 1e9)}s`;
    if (EquipmentComparisonService.FLAT_STAT_KEYS.has(key)) return `${prefix}${feature.formatNumber(value)}`;
    return `${prefix}${feature.formatNumber(value * 100)}%`;
  },

  getDifferenceTone(row) {
    if (!row.isNumeric || !row.difference) return 'neutral';
    const improved = row.key === 'attackInterval' ? row.difference < 0 : row.difference > 0;
    return improved ? 'positive' : 'negative';
  },

  formatSignedCompactNumber(feature, value) {
    const {utils} = feature.ctx;
    return `${value > 0 ? '+' : ''}${utils.formatCompactNumber(value, 3)}`;
  },

  formatSignedPercent(value, fractionDigits) {
    return `${value > 0 ? '+' : ''}${Number(value).toFixed(fractionDigits)}%`;
  }
};

// equipment-comparison-selection-controller
const equipmentComparisonSelectionController = {
  getBaselineItem(feature, options = feature.getBaselineEquipment()) {
    const option = options.find((item) => item.itemHrid === feature.baselineItemHrid);
    return option ? {...option, enhancementLevel: feature.baselineEnhancementLevel} : null;
  },

  getComparisonItem(feature, compatibleEquipment) {
    return compatibleEquipment.find((detail) => detail.hrid === feature.comparisonItemHrid) || null;
  },

  getPickerOptions(feature, mode = feature.pickerMode) {
    if (mode === 'owned') return feature.getBaselineEquipment();
    if (mode === 'comparison') return feature.getCompatibleEquipment(feature.getBaselineItem());
    return [];
  },

  resetSelectionForPreset(feature) {
    const baseline = feature.getDefaultBaselineItem();
    feature.baselineItemHrid = baseline?.itemHrid || '';
    feature.baselineEnhancementLevel = baseline?.enhancementLevel || 0;
    feature.comparisonItemHrid = '';
    feature.comparisonEnhancementLevel = feature.baselineEnhancementLevel;
    feature.pickerMode = '';
    feature.pickerQuery = '';
    feature.pickerEquipmentType = '';
    feature.comparisonService.cancel();
    feature.simulationToken++;
    feature.simulationState = {key: '', status: 'idle', result: null};
  },

  async requestSimulation(feature) {
    const baselineItem = feature.getBaselineItem();
    const comparisonItem = feature.getComparisonItem(feature.getCompatibleEquipment(baselineItem));
    if (!baselineItem || !comparisonItem || !feature.comparisonService.canCompare()) return;
    // 相同输入只保留一次模拟；切换装备时 token 会让旧异步结果失效。
    const key = feature.comparisonService.getSimulationKey(
      feature.presetKey,
      baselineItem,
      comparisonItem,
      feature.comparisonEnhancementLevel
    );
    if (feature.simulationState.key === key && [
        'loading', 'ready'
      ].includes(feature.simulationState.status)) return;
    const token = ++feature.simulationToken;
    feature.comparisonService.cancel();
    feature.simulationState = {key, status: 'loading', result: null};
    feature.render();
    try {
      const context = feature.comparisonService.buildComparisonContext(
        feature.getPreset(),
        baselineItem,
        comparisonItem,
        feature.comparisonEnhancementLevel
      );
      const result = await feature.comparisonService.compare(context);
      if (token !== feature.simulationToken || !feature.root) return;
      feature.simulationState = {key, status: 'ready', result};
    } catch (error) {
      if (token !== feature.simulationToken || !feature.root) return;
      console.error('[MST] 战斗装备模拟失败:', error);
      feature.simulationState = {key, status: 'error', result: null};
    }
    feature.render();
  },

  handlePresetChange(feature, value) {
    if (!EQUIPMENT_COMPARISON_PRESETS[value]) return;
    feature.presetKey = value;
    feature.resetSelectionForPreset();
    feature.render();
  },

  handleOwnedChange(feature, value) {
    const option = feature.getBaselineEquipment().find((item) => item.itemHrid === value);
    feature.baselineItemHrid = value;
    feature.baselineEnhancementLevel = option?.enhancementLevel || 0;
    feature.comparisonItemHrid = '';
    feature.comparisonEnhancementLevel = feature.baselineEnhancementLevel;
    feature.pickerMode = '';
    feature.pickerQuery = '';
    feature.pickerEquipmentType = '';
    feature.comparisonService.cancel();
    feature.simulationToken++;
    feature.simulationState = {key: '', status: 'idle', result: null};
    feature.render();
  },

  handleComparisonChange(feature, value) {
    feature.comparisonItemHrid = value;
    const detail = feature.getItemMap()?.[value];
    feature.comparisonEnhancementLevel = Math.min(
      feature.baselineEnhancementLevel,
      feature.getMaxEnhancementLevel(detail)
    );
    feature.pickerMode = '';
    feature.pickerQuery = '';
    feature.pickerEquipmentType = '';
    feature.simulationState = {key: '', status: 'idle', result: null};
    feature.render();
    feature.requestSimulation();
  },

  handleEnhancementChange(feature, mode, value) {
    const level = Math.max(0, Number(value || 0));
    if (mode === 'owned') {
      feature.baselineEnhancementLevel = level;
      if (feature.comparisonItemHrid) {
        feature.comparisonEnhancementLevel = Math.min(
          level,
          feature.getMaxEnhancementLevel(feature.getItemMap()[feature.comparisonItemHrid])
        );
      }
    } else {
      feature.comparisonEnhancementLevel = level;
    }
    feature.simulationState = {key: '', status: 'idle', result: null};
    feature.render();
    if (feature.comparisonItemHrid) feature.requestSimulation();
  },

  openPicker(feature, mode) {
    if (mode === 'comparison' && !feature.getBaselineItem()) return;
    feature.pickerMode = mode;
    feature.pickerQuery = '';
    feature.pickerEquipmentType = '';
    feature.render();
    feature.root?.querySelector('.mst-equipment-compare-picker-search')?.focus();
  },

  closePicker(feature) {
    feature.pickerMode = '';
    feature.pickerQuery = '';
    feature.pickerEquipmentType = '';
    feature.render();
  },

  selectPickerOption(feature, value) {
    if (feature.pickerMode === 'owned') feature.handleOwnedChange(value);
    else if (feature.pickerMode === 'comparison') feature.handleComparisonChange(value);
  }
};

// equipment-comparison-derived-view
const equipmentComparisonDerivedView = {
  renderDerivedResults(feature, result) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const hasPrice = Number.isFinite(result.priceDifference);
    const hasEfficiency = Number.isFinite(result.dpsPerTenMillion);
    let dpsText;
    switch (result.dps.status) {
      case 'loading':
        dpsText = i18n.t('simulationLoading');
        break;
      case 'error':
        dpsText = i18n.t('dpsCalculationError');
        break;
      case 'ready':
        dpsText = feature.formatSignedPercent(result.dps.value * 100, 3);
        break;
      default:
        dpsText = i18n.t('dpsDataUnavailable');
    }

    let dpsTone = 'neutral';
    if (result.dps.status === 'ready') {
      if (result.dps.value > 0) dpsTone = 'positive';
      else if (result.dps.value < 0) dpsTone = 'negative';
    }

    let priceTone = 'neutral';
    if (result.priceDifference < 0) priceTone = 'positive';
    else if (result.priceDifference > 0) priceTone = 'negative';

    const formatDps = (value) => {
      if (Number.isFinite(value)) return feature.formatNumber(value, 2);
      return result.dps.status === 'loading' ? '…' : '—';
    };
    return TemplateRenderer.html`
  <div class="mst-equipment-compare-metrics">
    <span class="mst-equipment-compare-metric">
      <small>${i18n.t('baselineDps')}</small>
      <strong>${formatDps(result.baselineDps)}</strong>
    </span>
    <span class="mst-equipment-compare-metric">
      <small>${i18n.t('comparisonDps')}</small>
      <strong>${formatDps(result.comparisonDps)}</strong>
    </span>
    <span class="mst-equipment-compare-metric">
      <small>${i18n.t('roughDpsChange')}</small>
      <strong class=${`mst-equipment-compare-${dpsTone}`}>${dpsText}</strong>
    </span>
    <span class="mst-equipment-compare-metric">
      <small>${i18n.t('priceDifference')}</small>
      <strong class=${`mst-equipment-compare-${priceTone}`}>${hasPrice ? feature.formatSignedCompactNumber(result.priceDifference) : i18n.t('marketPriceUnavailable')}</strong>
    </span>
    <span class="mst-equipment-compare-metric" title=${hasEfficiency ? '' : i18n.t('dpsPerTenMillionHint')}>
      <small>${i18n.t('dpsPerTenMillion')}</small>
      <strong class="mst-equipment-compare-positive">${hasEfficiency ? feature.formatSignedPercent(result.dpsPerTenMillion, 3) : '—'}</strong>
    </span>
  </div>`;
  }
};

// equipment-comparison-picker-view
const equipmentComparisonPickerView = {
  renderEquipmentPickerButton(feature, mode, itemHrid, enhancementLevel, secondaryText, disabled = false) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const placeholder =
      mode === 'owned'
        ? i18n.t('chooseOwnedEquipment')
        : disabled
          ? i18n.t('chooseOwnedEquipmentFirst')
          : i18n.t('chooseComparisonEquipment');
    const itemDetail = itemHrid ? feature.getItemMap()?.[itemHrid] : null;
    const maxLevel = feature.getMaxEnhancementLevel(itemDetail);
    const levels = Array.from({length: maxLevel + 1}, (_, index) => index);
    const enhancementOptions = levels.map(
      (option) => TemplateRenderer.html`
        <option value=${String(option)} .selected=${option === enhancementLevel}>+${option}</option>`
    );
    return TemplateRenderer.html`
  <div role="button"
    class=${`mst-equipment-compare-select-button${itemHrid ? '' : ' mst-equipment-compare-select-empty'}`}
    tabindex=${disabled ? '-1' : '0'}
    aria-disabled=${String(disabled)}
    aria-label=${placeholder}
    @click=${(event) => {
      if (!disabled && !event.target.closest('.mst-equipment-compare-enhancement')) {
        feature.openPicker(mode);
      }
    }}
    @keydown=${(event) => {
      if (
        !disabled &&
        !event.target.closest('.mst-equipment-compare-enhancement') &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        feature.openPicker(mode);
      }
    }}>
    <span class="mst-equipment-compare-icon" .hidden=${!itemHrid}>
      <svg aria-hidden="true"><use href=${itemHrid ? feature.getItemIconHref(itemHrid) : ''}></use></svg>
    </span>
    <span class="mst-equipment-compare-summary-text" .hidden=${!itemHrid}>
      <strong>${itemHrid ? feature.getItemName(itemHrid) : ''}</strong>
      <small>${secondaryText}</small>
    </span>
    <label class="mst-equipment-compare-enhancement" .hidden=${!itemHrid}>
      <span>${i18n.t('enhancementLevel')}</span>
      <select
        .value=${String(enhancementLevel)}
        .disabled=${!itemDetail}
        @change=${(event) => feature.handleEnhancementChange(mode, event.currentTarget.value)}
      >
        ${enhancementOptions}
      </select>
    </label>
    <span class="mst-equipment-compare-placeholder" .hidden=${Boolean(itemHrid)}>${placeholder}</span>
  </div>`;
  },

  renderPickerOptions(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const mode = feature.pickerMode;
    const options = mode
      ? feature.filterPickerOptions(
          feature.getPickerOptions(mode),
          feature.pickerQuery,
          mode,
          feature.pickerEquipmentType
        )
      : [];
    const selectedValue = mode === 'owned' ? feature.baselineItemHrid : feature.comparisonItemHrid;
    const pickerOptions = options.map((item) => {
      const isBaseline = mode === 'owned';
      const itemHrid = isBaseline ? item.itemHrid : item.hrid;
      const itemDetail = isBaseline ? item.detail : item;
      const level = isBaseline
        ? item.enhancementLevel
        : Math.min(feature.baselineEnhancementLevel, feature.getMaxEnhancementLevel(itemDetail));
      const selected = itemHrid === selectedValue;
      return TemplateRenderer.html`
    <button type="button"
      class=${`mst-equipment-compare-picker-option${selected ? ' mst-equipment-compare-picker-option-selected' : ''}`}
      title=${feature.getItemName(itemHrid)}
      .disabled=${selected}
      @click=${() => feature.selectPickerOption(itemHrid)}>
      <span class="mst-equipment-compare-picker-level">+${level}</span>
      <span class="mst-equipment-compare-picker-item-level">Lv.${Number(itemDetail.itemLevel || 0)}</span>
      <svg aria-hidden="true"><use href=${feature.getItemIconHref(itemHrid)}></use></svg>
      <strong>${feature.getItemName(itemHrid)}</strong>
    </button>`;
    });
    return TemplateRenderer.html`
  <div class="mst-equipment-compare-picker-options">
    ${pickerOptions}
    <div class="mst-equipment-compare-picker-empty" .hidden=${options.length > 0}>${i18n.t('noEquipmentMatch')}</div>
  </div>`;
  },

  renderEquipmentPicker(feature) {
    const {DataHub, TemplateRenderer, i18n} = feature.ctx;
    const equipmentTypes = feature.getPickerEquipmentTypes();
    const renderTypeOptions = (types) =>
      types.map(
        (detail) =>
          TemplateRenderer.html`<option value=${detail.hrid}>${DataHub.getLocalizedGameName('equipmentTypeNames', detail.hrid)}</option>`
      );
    return TemplateRenderer.html`
  <div class="mst-equipment-compare-picker" .hidden=${!feature.pickerMode}>
    <div class="mst-equipment-compare-picker-panel">
      <div class="mst-equipment-compare-picker-filters">
        <select
          class="mst-equipment-compare-picker-type"
          .value=${feature.pickerEquipmentType}
          @change=${(event) => {
            feature.pickerEquipmentType = event.currentTarget.value;
            feature.render();
          }}
        >
          <option value="">${i18n.t('allEquipmentSlots')}</option>
          ${renderTypeOptions(equipmentTypes)}
        </select>
        <input
          class="mst-equipment-compare-picker-search"
          type="search"
          placeholder=${i18n.t('searchEquipment')}
          autocomplete="off"
          .value=${feature.pickerQuery}
          @input=${(event) => {
            feature.pickerQuery = event.currentTarget.value;
            feature.render();
          }}
        >
      </div>
      ${this.renderPickerOptions(feature)}
      <button
        type="button"
        class="mst-equipment-compare-picker-close"
        @click=${() => feature.closePicker()}
      >${i18n.t('close')}</button>
    </div>
  </div>`;
  }
};

// equipment-comparison-table-view
const equipmentComparisonTableView = {
  renderComparisonTable(feature, rows) {
    const {TemplateRenderer, i18n} = feature.ctx;
    if (!rows.length) {
      return TemplateRenderer.html`<div class="mst-equipment-compare-empty">${i18n.t('noComparableAttributes')}</div>`;
    }
    const tableRows = [];
    const appendGroup = (category, title) => {
      const groupRows = rows.filter((row) => row.category === category);
      if (!groupRows.length) return;
      tableRows.push(TemplateRenderer.html`<tr class="mst-equipment-compare-group"><th colspan="4">${title}</th></tr>`);
      groupRows.forEach((row) =>
        tableRows.push(TemplateRenderer.html`
  <tr>
    <th scope="row">${feature.getStatName(row.category, row.key)}</th>
    <td>${feature.formatStatValue(row.key, row.ownedValue)}</td>
    <td>${feature.formatStatValue(row.key, row.comparisonValue)}</td>
    <td class=${`mst-equipment-compare-difference mst-equipment-compare-${feature.getDifferenceTone(row)}`}>
      ${row.isNumeric ? feature.formatStatValue(row.key, row.difference, true) : row.isEqual ? '—' : '≠'}
    </td>
  </tr>`)
      );
    };
    appendGroup('combat', i18n.t('combatAttributes'));
    appendGroup('noncombat', i18n.t('noncombatAttributes'));
    return TemplateRenderer.html`
  <div class="mst-equipment-compare-table-wrap">
    <table class="mst-equipment-compare-table">
      <thead><tr>
          <th>${i18n.t('equipmentAttribute')}</th>
          <th>${i18n.t('ownedEquipment')}</th>
          <th>${i18n.t('comparisonEquipment')}</th>
          <th>${i18n.t('attributeDifference')}</th>
        </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
  }
};

// equipment-comparison-view
const equipmentComparisonView = {
  renderDerivedResults(feature, result) {
    return equipmentComparisonDerivedView.renderDerivedResults(feature, result);
  },

  renderEquipmentPickerButton(feature, mode, itemHrid, enhancementLevel, secondaryText, disabled = false) {
    return equipmentComparisonPickerView.renderEquipmentPickerButton(
      feature,
      mode,
      itemHrid,
      enhancementLevel,
      secondaryText,
      disabled
    );
  },

  renderPickerOptions(feature) {
    return equipmentComparisonPickerView.renderPickerOptions(feature);
  },

  renderEquipmentPicker(feature) {
    return equipmentComparisonPickerView.renderEquipmentPicker(feature);
  },

  renderComparisonTable(feature, rows) {
    return equipmentComparisonTableView.renderComparisonTable(feature, rows);
  },

  getView(feature) {
    const {DataHub, TemplateRenderer, i18n} = feature.ctx;
    const baselineEquipment = feature.getBaselineEquipment();
    const baselineItem = feature.getBaselineItem(baselineEquipment);
    const compatibleEquipment = feature.getCompatibleEquipment(baselineItem);
    const comparisonItem = feature.getComparisonItem(compatibleEquipment);
    const hasComparison = Boolean(baselineItem && comparisonItem);
    const rows = hasComparison ? feature.getComparisonRows(baselineItem, comparisonItem) : [];
    // DPS 结果来自 Worker 模拟；属性差异可同步计算，二者在同一视图合并展示。
    const context = hasComparison
      ? feature.comparisonService.buildComparisonContext(
          feature.getPreset(),
          baselineItem,
          comparisonItem,
          feature.comparisonEnhancementLevel
        )
      : null;
    const derivedResult = feature.comparisonService.getDerivedComparison(feature.simulationState, context);
    const baselineSummary =
      baselineItem?.count > 0
        ? i18n.t('ownedQuantity', feature.formatNumber(baselineItem.count))
        : DataHub.getLocalizedGameName('equipmentTypeNames', baselineItem?.detail?.equipmentDetail?.type);
    const presetGroups = feature.constructor.PRESET_GROUPS.map((group) => {
      const options = group.keys.map((key) => {
        const preset = feature.constructor.PRESETS[key];
        return TemplateRenderer.html`
            <option value=${key} .selected=${key === feature.presetKey}>${i18n.t(preset.nameKey)}</option>`;
      });
      return TemplateRenderer.html`
          <optgroup label=${i18n.t(group.nameKey)}>
            ${options}
          </optgroup>`;
    });
    const baselinePicker = this.renderEquipmentPickerButton(
      feature,
      'owned',
      baselineItem?.itemHrid || '',
      baselineItem?.enhancementLevel || 0,
      baselineSummary || ''
    );
    const comparisonSummary = comparisonItem
      ? DataHub.getLocalizedGameName('equipmentTypeNames', comparisonItem.equipmentDetail.type)
      : '';
    const comparisonPicker =
      baselineItem && !compatibleEquipment.length
        ? TemplateRenderer.html`<div class="mst-equipment-compare-empty">${i18n.t('noCompatibleEquipment')}</div>`
        : this.renderEquipmentPickerButton(
            feature,
            'comparison',
            comparisonItem?.hrid || '',
            feature.comparisonEnhancementLevel,
            comparisonSummary,
            !baselineItem
          );
    return TemplateRenderer.html`
  <div class=${`mst-equipment-compare-view${feature.pickerMode ? ' mst-equipment-compare-picker-open' : ''}`}>
    <div class="mst-equipment-compare-notice">${i18n.t('equipmentComparisonNotice')}</div>
    <div class="mst-equipment-compare-config-scroll">
      <div class="mst-equipment-compare-config-row">
        <label class="mst-equipment-compare-preset">
          <span>${i18n.t('combatPreset')}</span>
          <select
            .value=${feature.presetKey}
            @change=${(event) => feature.handlePresetChange(event.currentTarget.value)}
          >
            ${presetGroups}
          </select>
        </label>
        <section class="mst-equipment-compare-selector">
          <span class="mst-equipment-compare-selector-title">${i18n.t('ownedEquipment')}</span>
          <div class="mst-equipment-compare-target-controls">
            ${baselinePicker}
          </div>
        </section>
        <section class="mst-equipment-compare-selector">
          <span class="mst-equipment-compare-selector-title">${i18n.t('comparisonEquipment')}</span>
          <div class="mst-equipment-compare-target-controls">
            ${comparisonPicker}
          </div>
        </section>
      </div>
    </div>
    <div class="mst-equipment-compare-results" .hidden=${!hasComparison}>
      ${this.renderDerivedResults(feature, derivedResult)}
      ${this.renderComparisonTable(feature, rows)}
    </div>
    ${this.renderEquipmentPicker(feature)}
  </div>`;
  }
};

// equipment-comparison-feature-delegates
const equipmentComparisonFeatureDelegates = {
  getEquipmentTypeMap() {
    return this.comparisonService.getEquipmentTypeMap();
  },

  getItemMap() {
    return this.comparisonService.getItemMap();
  },

  getPreset() {
    return this.constructor.PRESETS[this.presetKey] || this.constructor.PRESETS.meleeHammer;
  },

  getWearableLocationHrid(itemDetail) {
    return this.comparisonService.getWearableLocationHrid(itemDetail);
  },

  getLogicalSlot(itemDetail) {
    return this.comparisonService.getLogicalSlot(itemDetail);
  },

  isCombatEquipment(itemDetail) {
    return this.comparisonService.isCombatEquipment(itemDetail);
  },

  isEquipmentCompatibleWithPreset(itemDetail, preset = this.getPreset()) {
    return this.comparisonService.isEquipmentCompatibleWithPreset(itemDetail, preset);
  },

  getCharacterItemSummary(itemHrid) {
    return this.comparisonService.getCharacterItemSummary(itemHrid);
  },

  getPresetEquipmentEntries(preset = this.getPreset()) {
    return this.comparisonService.getPresetEquipmentEntries(preset);
  },

  getRecommendedEnhancementLevel(itemDetail) {
    return this.comparisonService.getRecommendedEnhancementLevel(itemDetail, this.getPreset());
  },

  getBaselineEquipment() {
    return this.comparisonService.getBaselineEquipment(this.getPreset());
  },

  getCompatibleEquipment(baselineItem) {
    return this.comparisonService.getCompatibleEquipment(baselineItem, this.getPreset());
  },

  getMaxEnhancementLevel(itemDetail) {
    return this.comparisonService.getMaxEnhancementLevel(itemDetail);
  },

  getEnhancementMultiplier(level) {
    return this.comparisonService.getEnhancementMultiplier(level);
  },

  getEquipmentStats(itemHrid, enhancementLevel = 0) {
    return this.comparisonService.getEquipmentStats(itemHrid, enhancementLevel);
  },

  getComparisonRows(baselineItem, comparisonItem) {
    return this.comparisonService.getComparisonRows(baselineItem, comparisonItem, this.comparisonEnhancementLevel);
  },

  getBaselineItem(options = this.getBaselineEquipment()) {
    return equipmentComparisonSelectionController.getBaselineItem(this, options);
  },

  getComparisonItem(compatibleEquipment) {
    return equipmentComparisonSelectionController.getComparisonItem(this, compatibleEquipment);
  },

  getItemName(itemHrid) {
    const {DataHub} = this.ctx;
    return DataHub.resolveItemName(itemHrid);
  },

  getItemNames(itemHrid) {
    return this.comparisonService.getItemNames(itemHrid);
  },

  getPickerOptions(mode = this.pickerMode) {
    return equipmentComparisonSelectionController.getPickerOptions(this, mode);
  },

  filterPickerOptions(options, query, mode = this.pickerMode, equipmentTypeHrid = this.pickerEquipmentType) {
    return this.comparisonService.filterPickerOptions(options, query, mode, equipmentTypeHrid);
  },

  getPickerEquipmentTypes(mode = this.pickerMode) {
    return this.comparisonService.getPickerEquipmentTypes(this.getPickerOptions(mode), mode);
  },

  getItemIconHref(itemHrid) {
    return equipmentComparisonFormatters.getItemIconHref(this, itemHrid);
  },

  getStatName(category, key) {
    return equipmentComparisonFormatters.getStatName(this, category, key);
  },

  formatNumber(value, maximumFractionDigits = 3) {
    return equipmentComparisonFormatters.formatNumber(this, value, maximumFractionDigits);
  },

  formatStatValue(key, value, isDifference = false) {
    return equipmentComparisonFormatters.formatStatValue(this, key, value, isDifference);
  },

  getDifferenceTone(row) {
    return equipmentComparisonFormatters.getDifferenceTone(row);
  },

  detectPresetKey() {
    return this.comparisonService.detectPresetKey();
  },

  getDefaultBaselineItem() {
    const preset = this.getPreset();
    const options = this.getBaselineEquipment();
    return this.comparisonService.getDefaultBaselineItem(preset, options);
  },

  resetSelectionForPreset() {
    return equipmentComparisonSelectionController.resetSelectionForPreset(this);
  },

  requestSimulation() {
    return equipmentComparisonSelectionController.requestSimulation(this);
  },

  formatSignedCompactNumber(value) {
    return equipmentComparisonFormatters.formatSignedCompactNumber(this, value);
  },

  formatSignedPercent(value, fractionDigits) {
    return equipmentComparisonFormatters.formatSignedPercent(value, fractionDigits);
  },

  renderDerivedResults(result) {
    return this.view.renderDerivedResults(this, result);
  },

  handlePresetChange(value) {
    return equipmentComparisonSelectionController.handlePresetChange(this, value);
  },

  handleOwnedChange(value) {
    return equipmentComparisonSelectionController.handleOwnedChange(this, value);
  },

  handleComparisonChange(value) {
    return equipmentComparisonSelectionController.handleComparisonChange(this, value);
  },

  handleEnhancementChange(mode, value) {
    return equipmentComparisonSelectionController.handleEnhancementChange(this, mode, value);
  },

  openPicker(mode) {
    return equipmentComparisonSelectionController.openPicker(this, mode);
  },

  closePicker() {
    return equipmentComparisonSelectionController.closePicker(this);
  },

  selectPickerOption(value) {
    return equipmentComparisonSelectionController.selectPickerOption(this, value);
  },

  renderEquipmentPickerButton(mode, itemHrid, enhancementLevel, secondaryText, disabled = false) {
    return this.view.renderEquipmentPickerButton(this, mode, itemHrid, enhancementLevel, secondaryText, disabled);
  },

  renderPickerOptions() {
    return this.view.renderPickerOptions(this);
  },

  renderEquipmentPicker() {
    return this.view.renderEquipmentPicker(this);
  },

  renderComparisonTable(rows) {
    return this.view.renderComparisonTable(this, rows);
  },

  getView() {
    return this.view.getView(this);
  }
};

// equipment-comparison-feature-lifecycle
const equipmentComparisonFeatureLifecycle = {
  render() {
    const {TemplateRenderer} = this.ctx;
    if (!this.root) return;
    TemplateRenderer.render(() => this.getView(), this.root);
  },

  refreshLanguage() {
    const {i18n} = this.ctx;
    this.render();
    const popup = this.root?.closest('.mst-equipment-compare-dialog');
    if (!popup) return;
    const title = popup.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('equipmentComparisonTitle');
    this.mountHelpPopover(popup);
  },

  mountHelpPopover(popup) {
    const {CalculatorHelpPopover, i18n} = this.ctx;
    this.helpController?.cleanup();
    this.helpController = CalculatorHelpPopover.mount({
      popup,
      moduleName: 'equipment',
      title: i18n.t('equipmentComparisonHelpTitle'),
      heading: i18n.t('equipmentComparisonTitle'),
      content: i18n.t('equipmentComparisonHelp')
    });
  },

  open() {
    const {CharacterDataService, TemplateRenderer, Notifier, i18n} = this.ctx;
    if (!Object.keys(this.getItemMap()).length || !CharacterDataService.getCharacterSkills().length) {
      return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
    }
    this.presetKey = this.detectPresetKey();
    // 每次打开都重新根据当前角色装备选择默认基准，避免沿用旧弹窗状态。
    this.resetSelectionForPreset();
    return Notifier.html({
      title: i18n.t('equipmentComparisonTitle'),
      html: () => TemplateRenderer.html`<div id="mst-equipment-compare-root"></div>`,
      width: 'min(34.5rem, calc(100vw - 1rem))',
      popupClass: 'mst-equipment-compare-dialog',
      didOpen: (popup) => {
        this.root = popup.querySelector('#mst-equipment-compare-root');
        this.render();
        this.mountHelpPopover(popup);
        this.marketService
          ?.load()
          .then(() => this.render())
          .catch((error) => {
            console.warn('[MST] 装备对比市场数据加载失败:', error);
          });
      },
      willClose: () => {
        this.helpController?.cleanup();
        this.helpController = null;
        this.simulationToken++;
        this.comparisonService.cancel();
        this.root = null;
      }
    });
  },

  init() {
    const {LanguageEvents} = this.ctx;
    LanguageEvents.subscribe(() => this.refreshLanguage());
  }
};

// equipment-comparison-feature
export class EquipmentComparisonFeature {
  static PRESETS = EQUIPMENT_COMPARISON_PRESETS;

  static PRESET_GROUPS = EQUIPMENT_COMPARISON_PRESET_GROUPS;

  constructor(ctx, marketService = null, comparisonService = null) {
    const {EquipmentComparisonService} = ctx;

    this.ctx = ctx;
    this.marketService = marketService;
    this.comparisonService = comparisonService || new EquipmentComparisonService(marketService);
    this.root = null;
    this.presetKey = 'meleeHammer';
    this.baselineItemHrid = '';
    this.baselineEnhancementLevel = 10;
    this.comparisonItemHrid = '';
    this.comparisonEnhancementLevel = 10;
    this.pickerMode = '';
    this.pickerQuery = '';
    this.pickerEquipmentType = '';
    this.simulationToken = 0;
    this.simulationState = {key: '', status: 'idle', result: null};
    this.helpController = null;
    this.view = equipmentComparisonView;
    Object.assign(this, equipmentComparisonFeatureDelegates, equipmentComparisonFeatureLifecycle);
  }
}
