// ability-upgrade-presets
// 技能及顺序同步自 references/external-tools/mwi-tool/resources 下各职业的 equipmentPlan 配置。
export const ABILITY_UPGRADE_PRESET_GROUPS = Object.freeze([
  {
    labelKey: 'meleePresets',
    presets: [
      {key: 'sword', labelKey: 'swordPreset', abilities: [
          '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/crippling_slash', '/abilities/maim'
        ]}, {key: 'spear', labelKey: 'spearPreset', abilities: [
          '/abilities/speed_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_strike', '/abilities/puncture'
        ]}, {key: 'hammer', labelKey: 'hammerPreset', abilities: [
          '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/fracturing_impact', '/abilities/sweep'
        ]}, {key: 'shield', labelKey: 'shieldSoloPreset', abilities: [
          '/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution', '/abilities/toughness', '/abilities/shield_bash'
        ]}, {key: 'shield_party', labelKey: 'shieldPartyPreset', abilities: [
          '/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution', '/abilities/toughness', '/abilities/provoke'
        ]}
    ]
  }, {
    labelKey: 'rangedPresets',
    presets: [
      {key: 'bow', labelKey: 'bowPreset', abilities: [
          '/abilities/critical_aura', '/abilities/berserk', '/abilities/pestilent_shot', '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
        ]}, {key: 'crossbow', labelKey: 'crossbowPreset', abilities: [
          '/abilities/critical_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
        ]}
    ]
  }, {
    labelKey: 'magicPresets',
    presets: [
      {key: 'water_magic', labelKey: 'waterMagicPreset', abilities: [
          '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/frost_surge', '/abilities/mana_spring', '/abilities/water_strike'
        ]}, {key: 'fire_magic', labelKey: 'fireMagicPreset', abilities: [
          '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/firestorm', '/abilities/flame_blast', '/abilities/fireball'
        ]}, {key: 'nature_magic', labelKey: 'natureMagicPreset', abilities: [
          '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/toxic_pollen', '/abilities/natures_veil', '/abilities/entangle'
        ]}
    ]
  }
]);

// ability-upgrade-row-results
const abilityUpgradeRowResults = {
  recalculate(feature) {
    const {CharacterDataService, i18n, utils} = feature.ctx;
    if (!feature.popup) return;
    const totals = {books: 0, ask: 0, bid: 0, hasAllAskPrices: true, hasAllBidPrices: true};
    feature.rows.forEach((row) => {
      const rowElement = feature.popup.querySelector(`[data-row-id="${row.id}"]`);
      const book = CharacterDataService.getAbilityBook(row.abilityHrid);
      if (!rowElement || !book) return;
      this.updateRowResult(feature, row, rowElement, book, totals, CharacterDataService, i18n, utils);
    });
    this.updateTotals(feature.popup, totals, i18n, utils);
  },

  updateRowResult(feature, row, rowElement, book, totals, CharacterDataService, i18n, utils) {
    const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0, experience: 0};
    const startLevel = row.customStart
      ? utils.clampLevel(row.startLevel, 0, 199)
      : utils.clampLevel(current.level, 0, 199);
    const targetLevel = utils.clampLevel(row.targetLevel, 1, 200);
    row.startLevel = startLevel;
    row.targetLevel = targetLevel;
    rowElement.querySelector('[data-row-field="startLevel"]').value = String(startLevel);
    rowElement.querySelector('[data-row-field="targetLevel"]').value = String(targetLevel);

    const startExperience = row.customStart
      ? CharacterDataService.getLevelExperience(startLevel)
      : Number(current.experience || 0);
    const requiredExperience = Math.max(0, CharacterDataService.getLevelExperience(targetLevel) - startExperience);
    const experienceGain = Number(book.abilityBookDetail.experienceGain || 0);
    const rawBooks = experienceGain > 0 ? requiredExperience / experienceGain + (startLevel === 0 ? 1 : 0) : 0;
    const requiredBooks = Math.ceil(rawBooks * 10) / 10;
    const purchaseBooks = Math.ceil(requiredBooks);
    row.purchaseBooks = purchaseBooks;
    const marketRow = feature.marketService.getMarketRow(book.hrid, 0);
    const ask = Number(marketRow?.a) > 0 ? Number(marketRow.a) : 0;
    const bid = Number(marketRow?.b) > 0 ? Number(marketRow.b) : 0;

    rowElement.querySelector('[data-value="bookExperience"]').textContent = utils.formatCompactNumber(experienceGain);
    rowElement.querySelector('[data-value="askPrice"]').textContent = ask
      ? utils.formatCompactNumber(ask)
      : i18n.t('marketPriceUnavailable');
    rowElement.querySelector('[data-value="bidPrice"]').textContent = bid
      ? utils.formatCompactNumber(bid)
      : i18n.t('marketPriceUnavailable');
    rowElement.querySelector('[data-result="requiredBooks"]').textContent = requiredBooks.toFixed(1);
    rowElement.querySelector('[data-result="askTotal"]').textContent = ask
      ? utils.formatCompactNumber(ask * purchaseBooks)
      : '-';
    rowElement.querySelector('[data-result="bidTotal"]').textContent = bid
      ? utils.formatCompactNumber(bid * purchaseBooks)
      : '-';

    totals.books += requiredBooks;
    if (purchaseBooks > 0 && !ask) totals.hasAllAskPrices = false;
    else totals.ask += ask * purchaseBooks;
    if (purchaseBooks > 0 && !bid) totals.hasAllBidPrices = false;
    else totals.bid += bid * purchaseBooks;
  },

  updateTotals(popup, totals, _i18n, utils) {
    popup.querySelector('[data-total="books"]').textContent = totals.books.toFixed(1);
    popup.querySelector('[data-total="ask"]').textContent = totals.hasAllAskPrices
      ? utils.formatCompactNumber(totals.ask)
      : '-';
    popup.querySelector('[data-total="bid"]').textContent = totals.hasAllBidPrices
      ? utils.formatCompactNumber(totals.bid)
      : '-';
  }
};

// ability-upgrade-row-html
const abilityUpgradeRowHtml = {
  getRowsHtml(feature) {
    const {CharacterDataService, MarketMateBridge, i18n, utils} = feature.ctx;
    const cartButtonHtml = this.getCartButtonHtml(MarketMateBridge, i18n, utils);
    const startLevelOptionsHtml = this.getLevelOptionsHtml([
      0, 10, 20, 30, 40,
      50, 60, 70, 80, 90,
      100, 150
    ]);
    const targetLevelOptionsHtml = this.getLevelOptionsHtml([
      10, 20, 30, 40, 50,
      60, 70, 80, 90, 100,
      150, 200
    ]);
    if (!feature.rows.length) {
      return `<tr><td colspan="9" class="mst-calculator-empty">${utils.escapeHtml(i18n.t('noAbilitiesSelected'))}</td></tr>`;
    }
    return feature.rows
      .map((row) =>
        this.getRowHtml({
          CharacterDataService,
          cartButtonHtml,
          feature,
          i18n,
          row,
          startLevelOptionsHtml,
          targetLevelOptionsHtml,
          utils
        })
      )
      .join('');
  },

  getCartButtonHtml(MarketMateBridge, i18n, utils) {
    if (!MarketMateBridge.isReady()) return '';
    const title = utils.escapeHtml(i18n.t('addAbilityBooksToCart'));
    return `<button type="button" class="mst-ability-row-cart" title="${title}" aria-label="${title}">
    <svg class="mst-ability-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.6"></circle><circle cx="19" cy="21" r="1.6"></circle><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"></path></svg>
  </button>`;
  },

  getLevelOptionsHtml(levels) {
    return levels.map((level) => `<option value="${level}">${level}</option>`).join('');
  },

  getRowHtml({
    CharacterDataService,
    cartButtonHtml,
    feature,
    i18n,
    row,
    startLevelOptionsHtml,
    targetLevelOptionsHtml,
    utils
  }) {
    const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
    const names = feature.getAbilityNames(row.abilityHrid);
    const currentName = i18n.pick(names);
    const currentLevel = Number(current.level || 0);
    const currentExperience = Number(current.experience || 0);
    const currentExperiencePercent = CharacterDataService.getLevelExperiencePercent(currentLevel, currentExperience);
    const currentExperiencePercentText = currentExperiencePercent.toLocaleString(i18n.locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
    const currentLevelTooltip = [
      `${i18n.t('currentLevel')}: ${currentLevel}`, `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`, `${i18n.t('currentExperience')}: ${Math.floor(currentExperience).toLocaleString(i18n.locale)}`
    ].join('\n');
    return `<tr data-row-id="${row.id}">
    <td class="mst-calculator-name"><div class="mst-ability-name-cell" title="${utils.escapeHtml(currentName)}"><button type="button" class="mst-ability-market-link" title="${utils.escapeHtml(i18n.t('openMarket'))}" aria-label="${utils.escapeHtml(i18n.t('openMarket'))}"><svg aria-hidden="true"><use href="${utils.escapeHtml(feature.getAbilityIconHref(row.abilityHrid))}"></use></svg></button><span>${utils.escapeHtml(currentName)}</span></div></td>
  <td title="${utils.escapeHtml(currentLevelTooltip)}"><span class="mst-ability-current-level"><strong>${utils.escapeHtml(String(currentLevel))}</strong><small>${utils.escapeHtml(`${currentExperiencePercentText}%`)}</small></span></td>
  <td><div class="mst-ability-start-control">
      <input data-row-field="customStart" type="checkbox" title="${utils.escapeHtml(i18n.t('customStartLevel'))}" aria-label="${utils.escapeHtml(i18n.t('customStartLevel'))}"${row.customStart ? ' checked' : ''}>
      <div class="mst-target-level-control">
        <input data-row-field="startLevel" type="number" min="0" max="199" value="${row.startLevel}"${row.customStart ? '' : ' disabled'} aria-label="${utils.escapeHtml(i18n.t('startLevel'))}">
        <select data-start-level-preset aria-label="${utils.escapeHtml(i18n.t('commonStartLevel'))}"${row.customStart ? '' : ' disabled'}>
          <option value=""></option>
        ${startLevelOptionsHtml}
        </select>
      </div>
    </div></td>
  <td><div class="mst-target-level-control">
      <input data-row-field="targetLevel" type="number" min="1" max="200" value="${row.targetLevel}" aria-label="${utils.escapeHtml(i18n.t('targetLevel'))}">
      <select data-target-level-preset aria-label="${utils.escapeHtml(i18n.t('commonTargetLevel'))}">
        <option value=""></option>
      ${targetLevelOptionsHtml}
      </select>
    </div></td>
  <td data-value="bookExperience">-</td>
  <td data-result="requiredBooks">-</td>
  <td><div class="mst-ability-price-values"><span data-value="askPrice">-</span><i>/</i><strong data-result="askTotal">-</strong></div></td>
  <td><div class="mst-ability-price-values"><span data-value="bidPrice">-</span><i>/</i><strong data-result="bidTotal">-</strong></div></td>
  <td><div class="mst-ability-row-actions">
    ${cartButtonHtml}
      <button type="button" class="mst-ability-row-reset" title="${utils.escapeHtml(i18n.t('resetActualLevel'))}" aria-label="${utils.escapeHtml(i18n.t('resetActualLevel'))}">↺</button>
      <button type="button" class="mst-row-remove" title="${utils.escapeHtml(i18n.t('remove'))}" aria-label="${utils.escapeHtml(i18n.t('remove'))}">&times;</button>
    </div></td>
  </tr>`;
  }
};

// ability-upgrade-row-view
const abilityUpgradeRowView = {
  renderRows(feature) {
    const {TemplateRenderer} = feature.ctx;
    const tbody = feature.popup?.querySelector('tbody');
    if (!tbody) return;
    TemplateRenderer.renderHtml(abilityUpgradeRowHtml.getRowsHtml(feature), tbody);
    feature.recalculate();
  },

  recalculate(feature) {
    return abilityUpgradeRowResults.recalculate(feature);
  }
};

// ability-upgrade-dialog-view
const abilityUpgradeDialogView = {
  getPresetOptionsHtml(feature) {
    const {utils} = feature.ctx;
    return feature
      .getPresetGroups()
      .map((group) => {
        const options = group.presets
          .map((preset) => `<option value="${utils.escapeHtml(preset.key)}">${utils.escapeHtml(preset.label)}</option>`)
          .join('');
        return `
  <optgroup label="${utils.escapeHtml(group.label)}">
    ${options}
  </optgroup>`;
      })
      .join('');
  },

  getLevelPresetOptionsHtml() {
    return [
      '11111', '35555', '46666', '47777', '57777',
      '58888', '68888', '69999'
    ]
      .map(
        (code) =>
          `<option value="${code}">${code
            .split('')
            .map((level) => Number(level) * 10)
            .join('/')}</option>`
      )
      .join('');
  },

  getDialogHtml(feature) {
    const {i18n, utils} = feature.ctx;
    const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
    return `
  <div class="mst-upgrade-calculator mst-ability-upgrade-calculator">
    <div class="mst-ability-toolbar">
      <div class="mst-ability-preset-controls">
        <select class="mst-ability-preset-select" aria-label="${utils.escapeHtml(i18n.t('abilityPreset'))}">
          <option value="">${utils.escapeHtml(i18n.t('abilityPreset'))}</option>
          ${feature.getPresetOptionsHtml()}
        </select>
        <select class="mst-ability-level-preset-select" aria-label="${utils.escapeHtml(i18n.t('abilityLevelPreset'))}">
          <option value="">${utils.escapeHtml(i18n.t('abilityLevelPreset'))}</option>
          ${feature.getLevelPresetOptionsHtml()}
        </select>
        <button type="button" class="mst-ability-add-button">
          <svg aria-hidden="true"><use href="${utils.escapeHtml(miscSprite + '#skills')}"></use></svg>
          <span>${utils.escapeHtml(i18n.t('addAbility'))}</span>
        </button>
        <button type="button" class="mst-ability-reset-data">${utils.escapeHtml(i18n.t('clearList'))}</button>
      </div>
      <span class="mst-ability-market-time"><small>${utils.escapeHtml(i18n.t('marketDataTime'))}</small><strong data-value="marketTime">-</strong></span>
    </div>
    <div class="mst-calculator-table-wrap mst-ability-table-wrap">
      <table class="mst-calculator-table mst-ability-table">
        <thead><tr>
            <th>${utils.escapeHtml(i18n.t('ability'))}</th>
            <th>${utils.escapeHtml(i18n.t('currentLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('customStartAndLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('targetLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('experiencePerBook'))}</th>
            <th>${utils.escapeHtml(i18n.t('requiredBooks'))}</th>
            <th>${utils.escapeHtml(i18n.t('askPriceAndTotal'))}</th>
            <th>${utils.escapeHtml(i18n.t('bidPriceAndTotal'))}</th>
            <th>${utils.escapeHtml(i18n.t('actions'))}</th>
          </tr></thead>
        <tbody></tbody>
        <tfoot><tr>
            <th colspan="5">${utils.escapeHtml(i18n.t('total'))}</th>
            <td data-total="books">0.0</td>
            <td data-total="ask">0</td>
            <td data-total="bid">0</td>
            <td></td>
          </tr></tfoot>
      </table>
    </div>
    <div class="mst-ability-picker" hidden>
      <div class="mst-ability-picker-panel">
        <input class="mst-ability-search" type="search" placeholder="${utils.escapeHtml(i18n.t('searchAbility'))}" autocomplete="off">
        <div class="mst-ability-options"></div>
        <button type="button" class="mst-ability-picker-close">${utils.escapeHtml(i18n.t('close'))}</button>
      </div>
    </div>
  </div>`;
  }
};

// ability-upgrade-picker-view
const abilityUpgradePickerView = {
  getAbilityIconHref(_feature, abilityHrid) {
    const {utils} = _feature.ctx;
    const sprite = utils.getSpriteUrl('abilities') || '/static/media/abilities_sprite.fdd1b4de.svg';
    return sprite + '#' + utils.substrLastSlash(abilityHrid);
  },

  renderOptions(feature, query = '') {
    const {TemplateRenderer, i18n, utils} = feature.ctx;
    const container = feature.popup?.querySelector('.mst-ability-options');
    if (!container) return;
    const scrollTop = container.scrollTop;
    const keyword = String(query || '')
      .trim()
      .toLowerCase();
    const selected = new Set(feature.rows.map((row) => row.abilityHrid));
    const rows = feature.getAbilityRows().filter((row) => {
      const haystack = [
        row.names.zh, row.names.en, row.abilityHrid, row.book.hrid
      ]
        .join('\n')
        .toLowerCase();
      return !keyword || haystack.includes(keyword);
    });
    const optionsHtml = rows.length
      ? rows
          .map((row) => {
            const currentName = i18n.pick(row.names);
            const levelBadge = row.characterAbility
              ? `<span class="mst-ability-level-badge">Lv.${utils.escapeHtml(String(row.characterAbility.level || 0))}</span>`
              : '';
            const isSelected = selected.has(row.abilityHrid);
            return `
  <button type="button" class="mst-ability-option${isSelected ? ' mst-ability-option-selected' : ''}" data-ability-hrid="${utils.escapeHtml(row.abilityHrid)}" title="${utils.escapeHtml(currentName)}"${isSelected ? ' disabled' : ''}>
    ${levelBadge}
    <svg aria-hidden="true"><use href="${utils.escapeHtml(feature.getAbilityIconHref(row.abilityHrid))}"></use></svg>
    <strong>${utils.escapeHtml(currentName)}</strong>
  </button>`;
          })
          .join('')
      : `<div class="mst-calculator-empty">${utils.escapeHtml(i18n.t('noAbilityMatch'))}</div>`;
    TemplateRenderer.renderHtml(optionsHtml, container);
    container.scrollTop = scrollTop;
    feature.popup?._mstClampPosition?.();
  },

  setPickerOpen(feature, isOpen) {
    if (!feature.popup) return;
    const picker = feature.popup.querySelector('.mst-ability-picker');
    const calculator = feature.popup.querySelector('.mst-ability-upgrade-calculator');
    picker.hidden = !isOpen;
    calculator.classList.toggle('mst-ability-picker-open', isOpen);
    if (!isOpen) return;
    const search = feature.popup.querySelector('.mst-ability-search');
    search.value = '';
    feature.renderOptions();
    feature.popup.querySelector('.mst-ability-options').scrollTop = 0;
    search.focus();
    feature.popup._mstClampPosition?.();
  }
};

// ability-upgrade-dialog-events
const abilityUpgradeDialogEvents = {
  bind(feature, popup) {
    const {CharacterDataService, MarketMateBridge, CalculatorHelpPopover, i18n, utils} = feature.ctx;
    feature.bindController?.abort();
    feature.bindController = new AbortController();
    const listenerOptions = {signal: feature.bindController.signal};
    feature.popup = popup;
    feature.helpController?.cleanup();
    feature.helpController = CalculatorHelpPopover.mount({
      popup,
      moduleName: 'ability',
      title: i18n.t('abilityCalculatorHelpTitle'),
      heading: i18n.t('abilityUpgradeCalculator'),
      content: i18n.t('abilityCalculatorHelp')
    });
    popup.querySelector('[data-value="marketTime"]').textContent = feature.marketService.getUpdatedText();
    feature.renderRows();
    this.bindPickerEvents(feature, popup, listenerOptions);
    this.bindPresetEvents(feature, popup, listenerOptions);
    this.bindMarketMateRefresh(feature, popup, MarketMateBridge);
    this.bindRowInputs(feature, popup, listenerOptions);
    this.bindRowChanges(feature, popup, listenerOptions, CharacterDataService, utils);
    this.bindRowClicks(feature, popup, listenerOptions, CharacterDataService, utils);
  },

  bindPickerEvents(feature, popup, listenerOptions) {
    popup
      .querySelector('.mst-ability-add-button')
      .addEventListener('click', () => feature.setPickerOpen(true), listenerOptions);
    popup
      .querySelector('.mst-ability-picker-close')
      .addEventListener('click', () => feature.setPickerOpen(false), listenerOptions);
    popup
      .querySelector('.mst-ability-search')
      .addEventListener('input', (event) => feature.renderOptions(event.target.value), listenerOptions);
    popup.querySelector('.mst-ability-options').addEventListener(
      'click',
      (event) => {
        const option = event.target.closest('[data-ability-hrid]');
        if (option) feature.addAbility(option.dataset.abilityHrid);
      },
      listenerOptions
    );
  },

  bindPresetEvents(feature, popup, listenerOptions) {
    const presetSelect = popup.querySelector('.mst-ability-preset-select');
    presetSelect.addEventListener(
      'change',
      () => {
        if (!presetSelect.value) return;
        feature.addPreset(presetSelect.value);
        presetSelect.value = '';
      },
      listenerOptions
    );
    const levelPresetSelect = popup.querySelector('.mst-ability-level-preset-select');
    levelPresetSelect.addEventListener(
      'change',
      () => {
        if (!levelPresetSelect.value) return;
        feature.applyLevelPreset(levelPresetSelect.value);
        levelPresetSelect.value = '';
      },
      listenerOptions
    );
    popup
      .querySelector('.mst-ability-reset-data')
      .addEventListener('click', () => feature.resetRows(), listenerOptions);
  },

  bindMarketMateRefresh(feature, popup, MarketMateBridge) {
    if (feature.marketMateReadyPopup === popup) return;
    feature.marketMateReadyPopup = popup;
    MarketMateBridge.onReady(() => {
      if (feature.popup === popup && popup.isConnected) feature.renderRows();
    });
  },

  bindRowInputs(feature, popup, listenerOptions) {
    popup.addEventListener(
      'input',
      (event) => {
        const rowElement = event.target.closest('[data-row-id]');
        const field = event.target.dataset.rowField;
        if (!rowElement || ![
            'startLevel', 'targetLevel'
          ].includes(field)) return;
        const row = feature.rows.find((item) => item.id === Number(rowElement.dataset.rowId));
        if (!row) return;
        row[field] = Number(event.target.value);
        feature.recalculate();
      },
      listenerOptions
    );
  },

  bindRowChanges(feature, popup, listenerOptions, CharacterDataService, utils) {
    popup.addEventListener(
      'change',
      (event) => {
        const rowElement = event.target.closest('[data-row-id]');
        const row = feature.rows.find((item) => item.id === Number(rowElement?.dataset.rowId));
        if (!row) return;
        if (event.target.matches('[data-start-level-preset]')) {
          this.applyLevelPresetValue(feature, row, rowElement, event.target, 'startLevel');
          return;
        }
        if (event.target.matches('[data-target-level-preset]')) {
          this.applyLevelPresetValue(feature, row, rowElement, event.target, 'targetLevel');
          return;
        }
        if (event.target.dataset.rowField !== 'customStart') return;
        row.customStart = event.target.checked;
        if (!row.customStart) {
          const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
          row.startLevel = utils.clampLevel(current.level, 0, 199);
        }
        feature.renderRows();
      },
      listenerOptions
    );
  },

  applyLevelPresetValue(feature, row, rowElement, target, field) {
    if (!target.value) return;
    row[field] = Number(target.value);
    rowElement.querySelector(`[data-row-field="${field}"]`).value = target.value;
    target.value = '';
    feature.recalculate();
  },

  bindRowClicks(feature, popup, listenerOptions, CharacterDataService, utils) {
    popup.addEventListener(
      'click',
      (event) => {
        const rowElement = event.target.closest('[data-row-id]');
        const row = feature.rows.find((item) => item.id === Number(rowElement?.dataset.rowId));
        if (!row) return;
        if (event.target.closest('.mst-row-remove')) {
          feature.rows = feature.rows.filter((item) => item.id !== row.id);
          feature.renderRows();
          feature.renderOptions(popup.querySelector('.mst-ability-search')?.value || '');
          return;
        }
        if (event.target.closest('.mst-ability-row-reset')) {
          const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
          row.customStart = false;
          row.startLevel = utils.clampLevel(current.level, 0, 199);
          feature.renderRows();
          return;
        }
        if (event.target.closest('.mst-ability-market-link')) {
          feature.openAbilityBookMarket(row);
          return;
        }
        if (event.target.closest('.mst-ability-row-cart')) feature.addAbilityBooksToCart(row);
      },
      listenerOptions
    );
  }
};

// ability-upgrade-language-refresh
const abilityUpgradeLanguageRefresh = {
  refreshLanguage(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const popup = feature.popup;
    if (!popup?.isConnected) return;
    const calculator = popup.querySelector('.mst-ability-upgrade-calculator');
    const pickerOpen = calculator?.classList.contains('mst-ability-picker-open') || false;
    const query = popup.querySelector('.mst-ability-search')?.value || '';
    const oldTable = popup.querySelector('.mst-ability-table-wrap');
    const oldOptions = popup.querySelector('.mst-ability-options');
    const scrollPosition = {
      tableTop: oldTable?.scrollTop || 0,
      tableLeft: oldTable?.scrollLeft || 0,
      optionsTop: oldOptions?.scrollTop || 0
    };
    const contentRoot = popup.querySelector('.swal2-html-container > div');
    if (!contentRoot) return;
    TemplateRenderer.renderHtml(() => feature.getDialogHtml(), contentRoot);
    const title = popup.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('abilityUpgradeCalculator');
    feature.bind(popup);
    this.restorePicker(feature, popup, pickerOpen, query, scrollPosition.optionsTop);
    const table = popup.querySelector('.mst-ability-table-wrap');
    if (table) {
      table.scrollTop = scrollPosition.tableTop;
      table.scrollLeft = scrollPosition.tableLeft;
    }
  },

  restorePicker(feature, popup, pickerOpen, query, optionsTop) {
    if (!pickerOpen) return;
    const picker = popup.querySelector('.mst-ability-picker');
    const refreshedCalculator = popup.querySelector('.mst-ability-upgrade-calculator');
    const search = popup.querySelector('.mst-ability-search');
    if (picker) picker.hidden = false;
    refreshedCalculator?.classList.add('mst-ability-picker-open');
    if (search) search.value = query;
    feature.renderOptions(query);
    const options = popup.querySelector('.mst-ability-options');
    if (options) options.scrollTop = optionsTop;
  }
};

// ability-upgrade-events
const abilityUpgradeEvents = {
  bind(feature, popup) {
    return abilityUpgradeDialogEvents.bind(feature, popup);
  },

  refreshLanguage(feature) {
    return abilityUpgradeLanguageRefresh.refreshLanguage(feature);
  }
};

// ability-upgrade-state
const abilityUpgradeState = {
  getAbilityNames(_feature, abilityHrid) {
    const {DataHub} = _feature.ctx;
    return {
      zh: DataHub.getLocalizedGameName('abilityNames', abilityHrid, 'zh'),
      en: DataHub.getLocalizedGameName('abilityNames', abilityHrid, 'en')
    };
  },

  getAbilityRows(feature) {
    const {CharacterDataService} = feature.ctx;
    return CharacterDataService.getAbilityBooks().map(({book, ability}) => ({
      abilityHrid: book.abilityBookDetail.abilityHrid,
      book,
      ability,
      characterAbility: CharacterDataService.getCharacterAbility(book.abilityBookDetail.abilityHrid),
      names: feature.getAbilityNames(book.abilityBookDetail.abilityHrid)
    }));
  },

  getPresetGroups(feature) {
    const {i18n} = feature.ctx;
    return ABILITY_UPGRADE_PRESET_GROUPS.map((group) => ({
      label: i18n.t(group.labelKey),
      presets: group.presets.map((preset) => ({...preset, label: i18n.t(preset.labelKey)}))
    }));
  },

  applyLevelPreset(feature, code) {
    if (!/^[1-9]{5}$/.test(code)) return;
    const levels = code.split('').map((level) => Number(level) * 10);
    feature.rows.slice(0, 5).forEach((row, index) => {
      row.targetLevel = levels[index];
    });
    feature.renderRows();
  },

  createRow(feature, abilityHrid) {
    const {CharacterDataService, utils} = feature.ctx;
    const current = CharacterDataService.getCharacterAbility(abilityHrid) || {level: 0, experience: 0};
    return {
      id: ++feature.nextRowId,
      abilityHrid,
      customStart: false,
      startLevel: utils.clampLevel(current.level, 0, 199),
      targetLevel: Math.min(200, Math.max(1, Number(current.level) || 1)),
      purchaseBooks: 0
    };
  },

  addAbility(feature, abilityHrid, shouldRender = true) {
    const {CharacterDataService} = feature.ctx;
    if (
      !CharacterDataService.getAbilityBook(abilityHrid) ||
      feature.rows.some((row) => row.abilityHrid === abilityHrid)
    ) {
      return false;
    }
    feature.rows.push(feature.createRow(abilityHrid));
    if (shouldRender) {
      feature.renderRows();
      feature.renderOptions(feature.popup?.querySelector('.mst-ability-search')?.value || '');
    }
    return true;
  },

  resetRows(feature, shouldRender = true) {
    feature.rows = [];
    feature.nextRowId = 0;
    if (!shouldRender) return;
    feature.renderRows();
    feature.renderOptions(feature.popup?.querySelector('.mst-ability-search')?.value || '');
  },

  addPreset(feature, presetKey) {
    const preset = feature
      .getPresetGroups()
      .flatMap((group) => group.presets)
      .find((item) => item.key === presetKey);
    if (!preset) return;
    feature.resetRows(false);
    preset.abilities.forEach((abilityHrid) => feature.addAbility(abilityHrid, false));
    feature.renderRows();
    feature.renderOptions(feature.popup?.querySelector('.mst-ability-search')?.value || '');
  }
};

// ability-upgrade-market-actions
const abilityUpgradeMarketActions = {
  openAbilityBookMarket(feature, row) {
    const {CharacterDataService, GameNavigationService, Notifier, i18n} = feature.ctx;
    const book = CharacterDataService.getAbilityBook(row.abilityHrid);
    if (!book) return;
    Swal.close();
    setTimeout(() => {
      if (!GameNavigationService.openMarketplace(book.hrid, 0)) {
        Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
      }
    }, 50);
  },

  addAbilityBooksToCart(feature, row) {
    const {DataHub, CharacterDataService, MarketMateBridge, Notifier, i18n} = feature.ctx;
    const book = CharacterDataService.getAbilityBook(row.abilityHrid);
    const quantity = Number(row.purchaseBooks || 0);
    if (!book || quantity <= 0) {
      Notifier.toast(i18n.t('noAbilityBooksNeeded'), 'info');
      return;
    }
    if (!MarketMateBridge.isReady()) {
      Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
      return;
    }
    const bookName = DataHub.resolveItemName(book.hrid);
    const response = MarketMateBridge.addToCart({
      itemId: book.hrid,
      name: bookName,
      iconRef: book.hrid,
      quantity,
      source: 'mst_ability'
    });
    if (!response?.ok) {
      Notifier.toast(response?.error || i18n.t('marketMateUnavailable'), 'error');
      return;
    }
    Notifier.toast(i18n.t('abilityBooksAddedToCart', quantity.toLocaleString(i18n.locale), bookName), 'success');
  }
};

// ability-upgrade-page-integration
const abilityUpgradePageIntegration = {
  mountSkillPageButton(feature) {
    const {i18n, utils} = feature.ctx;
    const panel = document.querySelector('[class*="AbilitiesPanel_abilitiesPanel"]');
    if (!panel) return null;
    if (panel.querySelector('.mst-ability-calculator-trigger')) return panel;
    const title = panel.querySelector('[class*="AbilitiesPanel_title"]');
    if (!title) return panel;
    const container = document.createElement('div');
    container.className = 'mst-ability-calculator-button-container';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = utils.getGameButtonClass() + ' mst-ability-calculator-trigger';
    button.textContent = i18n.t('upgradeCalculator');
    button.addEventListener('click', () => feature.open());
    container.appendChild(button);
    title.insertAdjacentElement('afterend', container);
    return panel;
  },

  bindLearnedAbilityClicks(feature, panel) {
    const {utils} = feature.ctx;
    if (!panel || panel.dataset.mstAbilityCalculatorBound) return;
    panel.dataset.mstAbilityCalculatorBound = '1';
    panel.addEventListener(
      'click',
      (event) => {
        const ability = event.target.closest('[class*="Ability_ability"]');
        if (!ability || !panel.contains(ability)) return;
        const grids = [
          ...panel.querySelectorAll('[class*="AbilitiesPanel_abilityGrid"]')
        ];
        if (ability.closest('[class*="AbilitiesPanel_abilityGrid"]') !== grids.at(-1)) {
          feature.lastClickedAbilityHrid = '';
          return;
        }
        const href = utils.getSvgUseHref(ability.querySelector('svg use'));
        const iconId = href.includes('#') ? href.split('#').pop() : '';
        feature.lastClickedAbilityHrid = iconId ? '/abilities/' + iconId : '';
      },
      true
    );
  },

  mountAbilityActionMenuButton(feature) {
    const {CharacterDataService, GameNavigationService, Notifier, i18n, utils} = feature.ctx;
    const menu = document.querySelector('[class*="Ability_actionMenu"]');
    if (!menu || !feature.lastClickedAbilityHrid) return;
    const reference = menu.querySelector('button');
    const abilityHrid = feature.lastClickedAbilityHrid;
    let calculatorButton = menu.querySelector('.mst-ability-action-calculator');
    if (!calculatorButton) {
      calculatorButton = document.createElement('button');
      calculatorButton.type = 'button';
      calculatorButton.className =
        (reference?.className || utils.getGameButtonClass()) + ' mst-ability-action-calculator';
      calculatorButton.textContent = i18n.t('upgradeCalculator');
      calculatorButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        feature.open(abilityHrid);
      });
      menu.appendChild(calculatorButton);
    }

    if (!menu.querySelector('.mst-ability-action-market')) {
      const marketButton = document.createElement('button');
      marketButton.type = 'button';
      marketButton.className = (reference?.className || utils.getGameButtonClass()) + ' mst-ability-action-market';
      marketButton.textContent = i18n.t('openMarket');
      marketButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const book = CharacterDataService.getAbilityBook(abilityHrid);
        if (!book || !GameNavigationService.openMarketplace(book.hrid, 0)) {
          Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
        }
      });
      calculatorButton.before(marketButton);
    }
  },

  // 市场技能书交易详情页：点击技能书图标后，游戏通过 MUI Tooltip 在 body 下
  // 渲染交互悬浮菜单（MuiTooltip-popperInteractive），入口注入到该菜单的
  // 按钮区（Item_actionMenu）内，点击后与技能页技能图标菜单的行为一致——
  // 直接打开计算器并预填该技能。
  mountMarketDetailButton(feature) {
    const {DataHub, i18n} = feature.ctx;
    // 悬浮菜单打开时先挂载空 popper 再填充内容，布局尺寸可能滞后，
    // 因此按菜单内容（Item_actionMenu）是否存在判断，而不是依赖可见尺寸。
    const popper = [
      ...document.querySelectorAll('[class*="MuiTooltip-popper"][class*="popperInteractive"]')
    ].find((element) => element.querySelector('[class*="Item_actionMenu"]'));
    if (!popper) return;
    const actionMenu = popper.querySelector('[class*="Item_actionMenu"]');
    if (!actionMenu) return;
    const name = actionMenu.querySelector('[class*="Item_name"]')?.textContent?.trim() || '';
    if (!name) return;
    const itemHrid = DataHub.ensureItemHrid(name) || '';
    const book = DataHub.getClientData()?.itemDetailMap?.[itemHrid]?.abilityBookDetail;
    if (!book?.abilityHrid) return;
    // 悬浮菜单随点击的物品切换复用，按钮按技能标识更新而不是简单去重。
    const existing = popper.querySelector('.mst-ability-tooltip-calculator');
    if (existing?.dataset.abilityHrid === book.abilityHrid) return;
    existing?.remove();
    const reference = actionMenu.querySelector('button');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = (reference?.className || '') + ' mst-ability-tooltip-calculator';
    button.dataset.abilityHrid = book.abilityHrid;
    button.textContent = i18n.t('upgradeCalculator');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      feature.open(book.abilityHrid);
    });
    actionMenu.appendChild(button);
  },

  refreshLanguage(feature) {
    const {i18n} = feature.ctx;
    document
      .querySelectorAll(
        '.mst-ability-calculator-trigger, .mst-ability-action-calculator, .mst-ability-tooltip-calculator'
      )
      .forEach((button) => {
        button.textContent = i18n.t('upgradeCalculator');
      });
    document.querySelectorAll('.mst-ability-action-market').forEach((button) => {
      button.textContent = i18n.t('openMarket');
    });
    feature.refreshLanguage();
  },

  init(feature) {
    const {CONFIG, LanguageEvents, utils} = feature.ctx;
    if (!CONFIG.isGameSite) return;
    feature.observer = utils.observeBody(() => {
      this.bindLearnedAbilityClicks(feature, this.mountSkillPageButton(feature));
      this.mountAbilityActionMenuButton(feature);
      this.mountMarketDetailButton(feature);
    });
    LanguageEvents.subscribe(() => this.refreshLanguage(feature));
  }
};

// ability-upgrade-view
const abilityUpgradeView = {
  getPresetOptionsHtml(feature) {
    return abilityUpgradeDialogView.getPresetOptionsHtml(feature);
  },

  getLevelPresetOptionsHtml(feature) {
    return abilityUpgradeDialogView.getLevelPresetOptionsHtml(feature);
  },

  getDialogHtml(feature) {
    return abilityUpgradeDialogView.getDialogHtml(feature);
  },

  getAbilityIconHref(feature, abilityHrid) {
    return abilityUpgradePickerView.getAbilityIconHref(feature, abilityHrid);
  },

  renderOptions(feature, query = '') {
    return abilityUpgradePickerView.renderOptions(feature, query);
  },

  setPickerOpen(feature, isOpen) {
    return abilityUpgradePickerView.setPickerOpen(feature, isOpen);
  },

  renderRows(feature) {
    return abilityUpgradeRowView.renderRows(feature);
  },

  recalculate(feature) {
    return abilityUpgradeRowView.recalculate(feature);
  },

  bind(feature, popup) {
    return abilityUpgradeEvents.bind(feature, popup);
  },

  refreshLanguage(feature) {
    return abilityUpgradeEvents.refreshLanguage(feature);
  }
};

// ability-upgrade-calculator-feature
export class AbilityUpgradeCalculatorFeature {
  constructor(ctx, marketService) {
    this.ctx = ctx;
    this.marketActions = abilityUpgradeMarketActions;
    this.pageIntegration = abilityUpgradePageIntegration;
    this.state = abilityUpgradeState;
    this.view = abilityUpgradeView;
    this.marketService = marketService;
    this.popup = null;
    this.rows = [];
    this.nextRowId = 0;
    this.lastClickedAbilityHrid = '';
    this.helpController = null;
    this.bindController = null;
    this.marketMateReadyPopup = null;
  }

  getAbilityNames(abilityHrid) {
    return this.state.getAbilityNames(this, abilityHrid);
  }

  getAbilityRows() {
    return this.state.getAbilityRows(this);
  }

  getPresetGroups() {
    return this.state.getPresetGroups(this);
  }

  applyLevelPreset(code) {
    return this.state.applyLevelPreset(this, code);
  }

  createRow(abilityHrid) {
    return this.state.createRow(this, abilityHrid);
  }

  addAbility(abilityHrid, shouldRender = true) {
    return this.state.addAbility(this, abilityHrid, shouldRender);
  }

  resetRows(shouldRender = true) {
    return this.state.resetRows(this, shouldRender);
  }

  addPreset(presetKey) {
    return this.state.addPreset(this, presetKey);
  }

  getPresetOptionsHtml() {
    return this.view.getPresetOptionsHtml(this);
  }

  getLevelPresetOptionsHtml() {
    return this.view.getLevelPresetOptionsHtml(this);
  }

  getDialogHtml() {
    return this.view.getDialogHtml(this);
  }

  getAbilityIconHref(abilityHrid) {
    return this.view.getAbilityIconHref(this, abilityHrid);
  }

  renderOptions(query = '') {
    return this.view.renderOptions(this, query);
  }

  setPickerOpen(isOpen) {
    return this.view.setPickerOpen(this, isOpen);
  }

  renderRows() {
    return this.view.renderRows(this);
  }

  recalculate() {
    return this.view.recalculate(this);
  }

  bind(popup) {
    return this.view.bind(this, popup);
  }

  refreshLanguage() {
    return this.view.refreshLanguage(this);
  }

  openAbilityBookMarket(row) {
    this.marketActions.openAbilityBookMarket(this, row);
  }

  addAbilityBooksToCart(row) {
    this.marketActions.addAbilityBooksToCart(this, row);
  }

  async open(initialAbilityHrid = '') {
    const {DataHub, Notifier, i18n} = this.ctx;
    if (!DataHub.getClientData()?.levelExperienceTable || !this.getAbilityRows().length) {
      return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
    }
    try {
      await this.marketService.load();
    } catch (error) {
      console.warn('[MST] 技能升级计算器市场数据加载失败:', error);
    }
    this.rows = [];
    this.nextRowId = 0;
    if (initialAbilityHrid) this.addAbility(initialAbilityHrid, false);
    return Notifier.html({
      title: i18n.t('abilityUpgradeCalculator'),
      html: this.getDialogHtml(),
      width: 'min(51rem, calc(100vw - 1rem))',
      popupClass: 'mst-upgrade-calculator-dialog',
      didOpen: (popup) => this.bind(popup),
      willClose: () => {
        this.bindController?.abort();
        this.bindController = null;
        this.marketMateReadyPopup = null;
        this.helpController?.cleanup();
        this.helpController = null;
        this.popup = null;
      }
    });
  }

  mountSkillPageButton() {
    return this.pageIntegration.mountSkillPageButton(this);
  }

  bindLearnedAbilityClicks(panel) {
    this.pageIntegration.bindLearnedAbilityClicks(this, panel);
  }

  mountAbilityActionMenuButton() {
    this.pageIntegration.mountAbilityActionMenuButton(this);
  }

  init() {
    this.pageIntegration.init(this);
  }
}
