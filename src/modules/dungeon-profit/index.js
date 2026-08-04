const DUNGEON_NAME_MESSAGE_KEYS = Object.freeze({
  '/actions/combat/chimerical_den': 'dungeonNameChimericalDen',
  '/actions/combat/sinister_circus': 'dungeonNameSinisterCircus',
  '/actions/combat/enchanted_fortress': 'dungeonNameEnchantedFortress',
  '/actions/combat/pirate_cove': 'dungeonNamePirateCove'
});

// dungeon-profit-form-view
const dungeonProfitFormView = {
  renderCalculator(feature) {
    const {TemplateRenderer, i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!feature.root || !feature.state) return;
    const dungeons = feature.service.getDungeons();
    const calculationInput = {
      actionHrid: feature.state.actionHrid,
      difficultyTier: feature.state.difficultyTier,
      clearMinutes: feature.state.clearMinutes,
      dailyConsumablesCost: feature.state.dailyConsumablesCost,
      useArtisanTea: feature.state.useArtisanTea,
      useGuzzlingPouch: feature.state.useGuzzlingPouch,
      guzzlingLevel: feature.state.guzzlingLevel,
      excludeBackEquipmentValue: feature.state.excludeBackEquipmentValue,
      customMode: feature.state.customMode,
      customKeySource: feature.state.customKeySource,
      customBuySide: feature.state.customBuySide,
      customSellSide: feature.state.customSellSide
    };
    const result = feature.service.calculate(calculationInput);
    // option 模板不能带首尾空白，否则 uhtml 的 Fragment 锚点会被 select 重排并在下次更新时失效。
    const dungeonOptions = dungeons.map(
      (action) =>
        TemplateRenderer.html`<option value=${action.hrid} .selected=${action.hrid === feature.state.actionHrid}>${feature.getDungeonName(action)}</option>`
    );
    const difficultyOptions = [
      0, 1, 2
    ].map(
      (tier) =>
        TemplateRenderer.html`<option value=${String(tier)} .selected=${tier === feature.state.difficultyTier}>T${tier}</option>`
    );
    const guzzlingLevelOptions = Array.from(
      {length: 21},
      (_, level) =>
        TemplateRenderer.html`<option value=${String(level)} .selected=${String(level) === feature.state.guzzlingLevel}>+${level}</option>`
    );
    // 自定义控件始终保留在模板中，仅用 hidden 切换，避免 uhtml 因节点数量变化抛出 InvalidNodeTypeError。
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <div class="mst-upgrade-calculator mst-dungeon-calculator">
    <div class="mst-dungeon-toolbar">
      <label class="mst-dungeon-field">
        <span>${i18n.t('dungeon')}</span>
        <select
          .value=${feature.state.actionHrid}
          @change=${(event) => {
            feature.state.actionHrid = event.target.value;
            feature.render();
          }}
        >
          ${dungeonOptions}
        </select>
      </label>
      <label class="mst-dungeon-field">
        <span>${i18n.t('difficultyTier')}</span>
        <select
          .value=${String(feature.state.difficultyTier)}
          @change=${(event) => {
            feature.state.difficultyTier = Number(event.target.value);
            feature.render();
          }}
        >
          ${difficultyOptions}
        </select>
      </label>
      <label class="mst-dungeon-field">
        <span>${i18n.t('clearTimeMinutes')}</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          .value=${feature.state.clearMinutes}
          @input=${(event) => feature.updateNumber('clearMinutes', event.target.value)}
        >
      </label>
      <label class="mst-dungeon-field">
        <span>${i18n.t('dailyConsumablesCost')}</span>
        <input
          type="number"
          min="0"
          step="0.1"
          placeholder="0"
          .value=${feature.state.dailyConsumablesCost}
          @input=${(event) => feature.updateNumber('dailyConsumablesCost', event.target.value)}
        >
      </label>
      <div class="mst-dungeon-field mst-dungeon-toggle-field">
        <label class="mst-dungeon-auto-buff">
          <input
            type="checkbox"
            .checked=${feature.state.useArtisanTea}
            @change=${(event) => {
              feature.state.useArtisanTea = event.target.checked;
              feature.render();
            }}
          >
          <span>${i18n.t('artisanTea')}</span>
        </label>
      </div>
      <label class="mst-dungeon-field">
        <span>${i18n.t('guzzlingLevel')}</span>
        <span class="mst-dungeon-guzzling-control">
          <label class="mst-dungeon-guzzling-toggle" title=${i18n.t('useGuzzlingPouch')}>
            <input type="checkbox"
              aria-label=${i18n.t('useGuzzlingPouch')}
              .checked=${feature.state.useGuzzlingPouch}
              @change=${(event) => {
                feature.state.useGuzzlingPouch = event.target.checked;
                feature.render();
              }}
            >
          </label>
          <select
            .value=${feature.state.guzzlingLevel}
            .disabled=${!feature.state.useGuzzlingPouch}
            @change=${(event) => {
              feature.state.guzzlingLevel = event.target.value;
              feature.render();
            }}
          >
            ${guzzlingLevelOptions}
          </select>
        </span>
      </label>
      <div class="mst-dungeon-field mst-dungeon-toggle-field">
        <label class="mst-dungeon-auto-buff">
          <input
            type="checkbox"
            .checked=${feature.state.excludeBackEquipmentValue}
            @change=${(event) => {
              feature.state.excludeBackEquipmentValue = event.target.checked;
              feature.render();
            }}
          >
          <span>${i18n.t('excludeBackEquipmentValue')}</span>
        </label>
      </div>
      <div class="mst-dungeon-field mst-dungeon-toggle-field">
        <label class="mst-dungeon-auto-buff">
          <input
            type="checkbox"
            .checked=${feature.state.customMode}
            @change=${(event) => {
              feature.state.customMode = event.target.checked;
              feature.render();
            }}
          >
          <span>${i18n.t('customMode')}</span>
        </label>
      </div>
      <label class="mst-dungeon-field" .hidden=${!feature.state.customMode}>
        <span>${i18n.t('keySource')}</span>
        <select
          .value=${feature.state.customKeySource}
          @change=${(event) => {
            feature.state.customKeySource = event.target.value;
            feature.render();
          }}
        >
          <option value="materials" .selected=${feature.state.customKeySource === 'materials'}>${i18n.t('craftedKeys')}</option>
          <option value="market" .selected=${feature.state.customKeySource === 'market'}>${i18n.t('purchasedKeys')}</option>
        </select>
      </label>
      <label class="mst-dungeon-field" .hidden=${!feature.state.customMode}>
        <span>${
          feature.state.customKeySource === 'materials'
            ? i18n.t('keyMaterialPurchaseMethod')
            : i18n.t('keyPurchaseMethod')
        }</span>
        <select
          .value=${feature.state.customBuySide}
          @change=${(event) => {
            feature.state.customBuySide = event.target.value;
            feature.render();
          }}
        >
          <option value="ask" .selected=${feature.state.customBuySide === 'ask'}>${i18n.t('leftBuy')}</option>
          <option value="bid" .selected=${feature.state.customBuySide === 'bid'}>${i18n.t('rightBuy')}</option>
        </select>
      </label>
      <label class="mst-dungeon-field" .hidden=${!feature.state.customMode}>
        <span>${i18n.t('goodsSaleMethod')}</span>
        <select
          .value=${feature.state.customSellSide}
          @change=${(event) => {
            feature.state.customSellSide = event.target.value;
            feature.render();
          }}
        >
          <option value="ask" .selected=${feature.state.customSellSide === 'ask'}>${i18n.t('leftSell')}</option>
          <option value="bid" .selected=${feature.state.customSellSide === 'bid'}>${i18n.t('rightSell')}</option>
        </select>
      </label>
    </div>
    <div class="mst-dungeon-results"></div>
  </div>
      `,
      feature.root
    );
    // 结果表单独渲染，避免表单重绘时复用已经脱离 DOM 的表格节点，造成自定义列停止更新。
    const resultRoot = feature.root.querySelector('.mst-dungeon-results');
    if (resultRoot) TemplateRenderer.render(() => feature.renderResult(result), resultRoot);
  }
};

// dungeon-profit-result-rows
const dungeonProfitResultRows = {
  getResultRows(result) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const materials = result.costScenarios.materials;
    const market = result.costScenarios.market;
    const custom = result.customScenario || {};
    // 每行保留制作、购买和自定义三组值，由表格根据当前模式选择对应列。
    const values = (materialsConservative, materialsOptimistic, marketConservative, marketOptimistic, customValue) => ({
      materials: {conservative: materialsConservative, optimistic: materialsOptimistic},
      market: {conservative: marketConservative, optimistic: marketOptimistic},
      custom: customValue
    });
    const rows = [
      {
        label: i18n.t('materialCostBreakdown'),
        type: 'section',
        priceDirection: 'buy'
      }, {
        key: 'ticketUnitPrice',
        quantity: null,
        values: values(
          materials.ticketPrices.ask,
          materials.ticketPrices.bid,
          market.ticketPrices.ask,
          market.ticketPrices.bid,
          custom.ticketPrice
        ),
        type: 'cost'
      }, {
        key: 'keyUnitPrice',
        quantity: null,
        values: values(
          materials.openingKeys[0]?.ask || 0,
          materials.openingKeys[0]?.bid || 0,
          market.openingKeys[0]?.ask || 0,
          market.openingKeys[0]?.bid || 0,
          custom.openingKeyPrice
        ),
        type: 'cost'
      }, {
        key: 'entryTicketDailyCost',
        quantity: result.ticketQuantity,
        values: values(
          materials.ticketCostConservative,
          materials.ticketCostOptimistic,
          market.ticketCostConservative,
          market.ticketCostOptimistic,
          custom.ticketCost
        ),
        type: 'cost'
      }, {
        key: 'chestOpeningDailyCost',
        quantity: result.openingKeyQuantity,
        values: values(
          materials.openingCostConservative,
          materials.openingCostOptimistic,
          market.openingCostConservative,
          market.openingCostOptimistic,
          custom.openingCost
        ),
        type: 'cost'
      },
      ...(result.dailyConsumablesCost > 0
        ? [
            {
              key: 'dailyConsumablesCostRow',
              quantity: null,
              values: values(
                result.dailyConsumablesCost,
                result.dailyConsumablesCost,
                result.dailyConsumablesCost,
                result.dailyConsumablesCost,
                result.dailyConsumablesCost
              ),
              type: 'cost'
            }
          ]
        : []), {
        key: 'totalDailyCost',
        quantity: null,
        values: values(
          materials.totalCostConservative,
          materials.totalCostOptimistic,
          market.totalCostConservative,
          market.totalCostOptimistic,
          custom.totalCost
        ),
        type: 'total'
      }, {key: 'expectedChestOutputBreakdown', type: 'section', priceDirection: 'sell'}, {
        key: 'normalChestRevenue',
        quantity: result.normalQuantity,
        values: values(
          materials.normalChestUnitProfitConservative,
          materials.normalChestUnitProfitOptimistic,
          market.normalChestUnitProfitConservative,
          market.normalChestUnitProfitOptimistic,
          custom.normalChestUnitProfit
        ),
        type: 'revenue'
      }, ...(result.refinementQuantity > 0
        ? [
            {
              key: 'refinementChestRevenue',
              quantity: result.refinementQuantity,
              values: values(
                materials.refinementChestUnitProfitConservative,
                materials.refinementChestUnitProfitOptimistic,
                market.refinementChestUnitProfitConservative,
                market.refinementChestUnitProfitOptimistic,
                custom.refinementChestUnitProfit
              ),
              type: 'revenue'
            }
          ]
        : []),
      {
        key: 'profitPerRun',
        quantity: null,
        values: values(
          materials.profitPerRunConservative,
          materials.profitPerRunOptimistic,
          market.profitPerRunConservative,
          market.profitPerRunOptimistic,
          custom.profitPerRun
        ),
        type: 'revenue'
      }, {
        key: 'netProfit',
        quantity: null,
        values: values(
          materials.profitConservative,
          materials.profitOptimistic,
          market.profitConservative,
          market.profitOptimistic,
          custom.profit
        ),
        type: 'revenue'
      }
    ];
    return rows;
  }
};

// dungeon-profit-summary-view
const dungeonProfitSummaryView = {
  renderSummary(feature, result) {
    const {TemplateRenderer, i18n} = DungeonProfitCalculatorFeature.ctx;
    const cards = [
      {
        key: 'dailyRuns',
        value: result.clears
      }, {key: 'ticketRequired', value: result.ticketQuantity}, {key: 'normalChestShares', value: result.normalQuantity}
    ];
    if (result.refinementQuantity > 0) cards.push({key: 'refinementChestShares', value: result.refinementQuantity});
    cards.push({key: 'marketDataTime', value: feature.marketService.getUpdatedText(), isText: true});
    const summaryItems = cards.map(
      (card) => TemplateRenderer.html`
    <div class=${`mst-dungeon-summary-item${card.isText ? ' mst-dungeon-summary-market' : ''}`}>
      <small>${i18n.t(card.key)}</small>
      <strong>${card.isText ? card.value : feature.formatCount(card.value)}</strong>
    </div>`
    );
    return TemplateRenderer.html`
  <div class=${`mst-dungeon-summary${result.refinementQuantity > 0 ? ' mst-dungeon-summary-refinement' : ''}`}>
    ${summaryItems}
  </div>
    `;
  }
};

// dungeon-profit-view
const dungeonProfitView = {
  getResultRows(_feature, result) {
    return dungeonProfitResultRows.getResultRows(result);
  },

  renderSummary(feature, result) {
    return dungeonProfitSummaryView.renderSummary(feature, result);
  },

  renderResult(feature, result) {
    const {TemplateRenderer, i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!result) {
      return TemplateRenderer.html`<div class="mst-dungeon-empty">${i18n.t('invalidDungeonInput')}</div>`;
    }
    const rows = dungeonProfitResultRows.getResultRows(result);
    const resultRows = rows.map((row) => this.renderResultRow(feature, result, row, TemplateRenderer, i18n));
    // 自定义模式保留六列 DOM 结构，但将末列作为零宽占位，使合并后的自定义结果只占一个有效价格列。
    return TemplateRenderer.html`
  ${dungeonProfitSummaryView.renderSummary(feature, result)}
  ${this.renderMissingPriceWarning(result, TemplateRenderer, i18n)}
  <div class="mst-dungeon-table-wrap">
    <table class=${`mst-dungeon-table${result.customMode ? ' mst-dungeon-table-custom' : ''}`}>
      <colgroup>
        <col class="mst-dungeon-col-item">
        <col class="mst-dungeon-col-quantity">
        <col class="mst-dungeon-col-value">
        <col class="mst-dungeon-col-value">
        <col class="mst-dungeon-col-value">
        <col class="mst-dungeon-col-value mst-dungeon-col-custom-spacer">
      </colgroup>
      <thead>
        <tr class="mst-dungeon-table-group-header">
          <th>${i18n.t('resultItem')}</th>
          <th>${i18n.t('quantity')}</th>
          <th colspan="2">${i18n.t(
            result.customMode && result.customScenario.keySource === 'market' ? 'purchasedKeys' : 'craftedKeys'
          )}</th>
          <th colspan="2" .hidden=${result.customMode}>${i18n.t('purchasedKeys')}</th>
          <th colspan="2" .hidden=${!result.customMode}>${i18n.t('customResult')}</th>
        </tr>
      </thead>
      <tbody>
        ${resultRows}
      </tbody>
    </table>
  </div>
    `;
  },

  renderMissingPriceWarning(result, TemplateRenderer, i18n) {
    return result.missingPrices.length
      ? [
          TemplateRenderer.html`
  <div class="mst-dungeon-warning">${i18n.t('missingMarketPrices', result.missingPrices.length)}</div>
      `
        ]
      : [];
  },

  getCustomPriceLabel(result, priceDirection, i18n) {
    if (priceDirection === 'sell') {
      return i18n.t(result.customScenario.sellSide === 'bid' ? 'rightSell' : 'leftSell');
    }
    return i18n.t(result.customScenario.buySide === 'bid' ? 'rightBuy' : 'leftBuy');
  },

  renderResultRow(feature, result, row, TemplateRenderer, i18n) {
    if (row.type === 'section') {
      // 成本区只标买入档位，产出区只标卖出档位，避免把无关方向混在同一列头中。
      const conservativeKey = row.priceDirection === 'sell' ? 'rightSell' : 'leftBuy';
      const optimisticKey = row.priceDirection === 'sell' ? 'leftSell' : 'rightBuy';
      return TemplateRenderer.html`
  <tr class="mst-dungeon-row-section">
    <th colspan="2">${row.label || i18n.t(row.key)}</th>
    <th>${i18n.t(conservativeKey)}</th>
    <th>${i18n.t(optimisticKey)}</th>
    <th .hidden=${result.customMode}>${i18n.t(conservativeKey)}</th>
    <th .hidden=${result.customMode}>${i18n.t(optimisticKey)}</th>
    <th colspan="2" .hidden=${!result.customMode}>${this.getCustomPriceLabel(result, row.priceDirection, i18n)}</th>
  </tr>
      `;
    }
    // 固定保留六个单元格；自定义模式左侧跟随钥匙来源，右侧两列合并显示所选档位的结果。
    return TemplateRenderer.html`
  <tr class=${`mst-dungeon-row-${row.type}`}>
    <th scope="row">${row.label || i18n.t(row.key)}</th>
    <td>${row.quantity == null ? '-' : feature.formatCount(row.quantity)}</td>
    <td>${feature.formatMoney(
      result.customMode && result.customScenario.keySource === 'market'
        ? row.values.market.conservative
        : row.values.materials.conservative
    )}</td>
    <td>${feature.formatMoney(
      result.customMode && result.customScenario.keySource === 'market'
        ? row.values.market.optimistic
        : row.values.materials.optimistic
    )}</td>
    <td .hidden=${result.customMode}>${feature.formatMoney(row.values.market.conservative)}</td>
    <td .hidden=${result.customMode}>${feature.formatMoney(row.values.market.optimistic)}</td>
    <td colspan="2" .hidden=${!result.customMode}>${feature.formatMoney(row.values.custom)}</td>
  </tr>
    `;
  }
};

// dungeon-profit-state
const dungeonProfitState = {
  resetState(feature) {
    const dungeons = feature.service.getDungeons();
    const defaultDungeon = dungeons[0];
    const guzzlingPouch = this.getOwnedGuzzlingPouch();
    feature.state = {
      actionHrid: defaultDungeon?.hrid || '',
      difficultyTier: 0,
      clearMinutes: '30',
      dailyConsumablesCost: '',
      useArtisanTea: true,
      useGuzzlingPouch: Boolean(guzzlingPouch),
      guzzlingLevel: String(guzzlingPouch?.enhancementLevel || 0),
      excludeBackEquipmentValue: false,
      customMode: false,
      customKeySource: 'materials',
      customBuySide: 'ask',
      customSellSide: 'ask'
    };
  },

  getOwnedGuzzlingPouch() {
    const {CharacterDataService} = DungeonProfitCalculatorFeature.ctx;
    const ownedPouches = (CharacterDataService?.getCharacterItems?.() || []).filter(
      (item) =>
        item?.itemHrid === '/items/guzzling_pouch' &&
        Number(item.count || 0) > 0 &&
        item.itemLocationHrid !== '/item_locations/market'
    );
    return ownedPouches.reduce(
      (highest, item) =>
        !highest || Number(item.enhancementLevel || 0) > Number(highest.enhancementLevel || 0) ? item : highest,
      null
    );
  },

  getDungeonName(_feature, action) {
    const {DataHub, i18n, utils} = DungeonProfitCalculatorFeature.ctx;
    const localized = DataHub.getLocalizedGameName('actionNames', action?.hrid);
    const rawFallback = utils.substrLastSlash(action?.hrid)?.replace(/_/g, ' ');
    if (localized && localized !== rawFallback) return localized;
    const messageKey = DUNGEON_NAME_MESSAGE_KEYS[action?.hrid];
    return messageKey ? i18n.t(messageKey) : action?.name || localized || action?.hrid || '-';
  },

  formatCount(_feature, value) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const number = Number(value || 0);
    return Number.isFinite(number)
      ? number.toLocaleString(i18n.locale, {minimumFractionDigits: 0, maximumFractionDigits: 2})
      : '-';
  },

  formatMoney(_feature, value) {
    const {utils} = DungeonProfitCalculatorFeature.ctx;
    const number = Number(value || 0);
    return Number.isFinite(number) ? utils.formatCompactNumber(number, 2) : '-';
  },

  updateNumber(feature, field, value) {
    feature.state[field] = value;
    feature.render();
  }
};

// dungeon-profit-calculator-feature
export class DungeonProfitCalculatorFeature {
  static ctx = null;
  static formView = null;
  static stateController = null;
  static view = null;

  static configure(ctx) {
    this.ctx = ctx;
    this.formView = dungeonProfitFormView;
    this.stateController = dungeonProfitState;
    this.view = dungeonProfitView;
  }

  constructor(marketService) {
    this.marketService = marketService;
    this.service = new this.constructor.ctx.DungeonProfitCalculatorService(this.constructor.ctx, marketService);
    this.popup = null;
    this.root = null;
    this.helpController = null;
    this.state = null;
  }

  resetState() {
    return this.constructor.stateController.resetState(this);
  }

  getDungeonName(action) {
    return this.constructor.stateController.getDungeonName(this, action);
  }

  formatCount(value) {
    return this.constructor.stateController.formatCount(this, value);
  }

  formatMoney(value) {
    return this.constructor.stateController.formatMoney(this, value);
  }

  updateNumber(field, value) {
    return this.constructor.stateController.updateNumber(this, field, value);
  }

  getResultRows(result) {
    return this.constructor.view.getResultRows(this, result);
  }

  renderSummary(result) {
    return this.constructor.view.renderSummary(this, result);
  }

  renderResult(result) {
    return this.constructor.view.renderResult(this, result);
  }

  render() {
    return this.constructor.formView.renderCalculator(this);
  }

  refreshLanguage() {
    if (!this.popup?.isConnected) return;
    const title = this.popup.querySelector('.swal2-title');
    const {i18n} = this.constructor.ctx;
    if (title) title.textContent = i18n.t('dungeonProfitCalculator');
    this.helpController?.setContent(i18n.t('dungeonCalculatorHelp'));
    this.render();
  }

  async open() {
    const {TemplateRenderer, CalculatorHelpPopover, Notifier, i18n} = this.constructor.ctx;
    if (!this.service.getDungeons().length) return Notifier.alert(i18n.t('noDungeonData'), 'warning');
    try {
      await this.marketService.load();
    } catch (error) {
      console.warn('[MST] 地下城收益计算器市场数据加载失败:', error);
    }
    this.resetState();
    return Notifier.html({
      title: i18n.t('dungeonProfitCalculator'),
      html: () => TemplateRenderer.html`<div id="mst-dungeon-calculator-root"></div>`,
      width: 'min(38rem, calc(100vw - 1rem))',
      popupClass: 'mst-upgrade-calculator-dialog mst-dungeon-dialog',
      didOpen: (popup) => {
        this.popup = popup;
        this.root = popup.querySelector('#mst-dungeon-calculator-root');
        this.render();
        this.helpController = CalculatorHelpPopover.mount({
          popup,
          moduleName: 'dungeon',
          title: i18n.t('dungeonCalculatorHelpTitle'),
          heading: i18n.t('dungeonProfitCalculator'),
          content: i18n.t('dungeonCalculatorHelp')
        });
      },
      willClose: () => {
        this.helpController?.cleanup();
        this.helpController = null;
        this.root = null;
        this.popup = null;
      }
    });
  }

  init() {
    const {LanguageEvents} = this.constructor.ctx;
    LanguageEvents.subscribe(() => this.refreshLanguage());
  }
}
