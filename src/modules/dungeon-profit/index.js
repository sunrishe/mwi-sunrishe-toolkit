import {COWBELL_TAX_RATE, MARKET_TAX_RATE} from '../../common/constants.js';

const DUNGEON_NAME_MESSAGE_KEYS = Object.freeze({
  '/actions/combat/chimerical_den': 'dungeonNameChimericalDen',
  '/actions/combat/sinister_circus': 'dungeonNameSinisterCircus',
  '/actions/combat/enchanted_fortress': 'dungeonNameEnchantedFortress',
  '/actions/combat/pirate_cove': 'dungeonNamePirateCove'
});

// 税率显示从公共常量动态生成，市场税调整后提示与帮助文案自动跟随，不手工维护百分比。
const marketTaxPercent = Math.round(MARKET_TAX_RATE * 100);
const cowbellTaxPercent = Math.round(COWBELL_TAX_RATE * 100);

// dungeon-profit-form-view
const dungeonProfitFormView = {
  renderCalculator(feature) {
    const {TemplateRenderer, i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!feature.root || !feature.state) return;
    const dungeons = feature.service.getDungeons();
    const calculationInput = {
      actionHrid: feature.state.actionHrid,
      difficultyTier: feature.state.difficultyTier,
      partySize: feature.state.partySize,
      clearMinutes: feature.state.clearMinutes,
      dailyConsumablesCost: feature.state.dailyConsumablesCost,
      useArtisanTea: feature.state.useArtisanTea,
      useGuzzlingPouch: feature.state.useGuzzlingPouch,
      guzzlingLevel: feature.state.guzzlingLevel,
      excludeBackEquipmentValue: feature.state.excludeBackEquipmentValue,
      applyMarketTax: feature.state.applyMarketTax,
      customMode: feature.state.customMode,
      customKeySource: feature.state.customKeySource,
      customBuySide: feature.state.customBuySide,
      customSellSide: feature.state.customSellSide
    };
    const result = feature.service.calculate(calculationInput);
    // option 模板不能带首尾空白，否则 uhtml 的 Fragment 锚点会被 select 重排并在下次更新时失效。
    // 按官方地下城顺序（sortIndex）显示 D1-D4 序号前缀，方便对照游戏内地下城地图。
    const dungeonOptions = dungeons.map(
      (action, index) =>
        TemplateRenderer.html`<option value=${action.hrid} .selected=${action.hrid === feature.state.actionHrid}>D${index + 1}. ${feature.getDungeonName(action)}</option>`
    );
    const difficultyOptions = [
      0, 1, 2
    ].map(
      (tier) =>
        TemplateRenderer.html`<option value=${String(tier)} .selected=${tier === feature.state.difficultyTier}>T${tier}</option>`
    );
    const partySizeOptions = [
      1, 2, 3, 4, 5
    ].map(
      (size) =>
        TemplateRenderer.html`<option value=${String(size)} .selected=${Number(size) === Number(feature.state.partySize)}>${size}</option>`
    );
    const guzzlingLevelOptions = Array.from(
      {length: 21},
      (_, level) =>
        TemplateRenderer.html`<option value=${String(level)} .selected=${String(level) === feature.state.guzzlingLevel}>+${level}</option>`
    );
    // 自定义控件始终保留在模板中，仅用 hidden 切换，避免 uhtml 因节点数量变化抛出 InvalidNodeTypeError。
    // 单图/批量两个视图容器常驻模板并用 hidden 切换；批量视图内容由字符串模板单独渲染，
    // 避免把逐行输入的表格交给 uhtml 增量更新。批量开关是与选项一致的复选框，默认不勾选（单图模拟）。
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <div class="mst-upgrade-calculator mst-dungeon-calculator">
    <div class="mst-dungeon-single-view" .hidden=${Boolean(feature.batchEnabled)}>
    <div class="mst-dungeon-toolbar">
      <div class="mst-dungeon-field mst-dungeon-toggle-field">
        <label class="mst-dungeon-auto-buff">
          <input
            type="checkbox"
            .checked=${Boolean(feature.batchEnabled)}
            @change=${(event) => {
              feature.batchEnabled = event.target.checked;
              feature.applyDialogWidth();
              feature.render();
            }}
          >
          <span>${i18n.t('simTabBatch')}</span>
        </label>
      </div>
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
        <span>${i18n.t('partySize')}</span>
        <select
          .value=${String(feature.state.partySize)}
          @change=${(event) => {
            feature.state.partySize = event.target.value;
            feature.render();
          }}
        >
          ${partySizeOptions}
        </select>
      </label>
      <label class="mst-dungeon-field">
        <span>${i18n.t('clearTimeMinutes')}</span>
        <input
          type="number"
          min="0.1"
          step="1"
          .value=${feature.state.clearMinutes}
          @input=${(event) => feature.updateNumber('clearMinutes', event.target.value)}
        >
      </label>
      <label class="mst-dungeon-field">
        <span>${i18n.t('dailyConsumablesCost')}</span>
        <input
          type="number"
          min="0"
          step="1"
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
        <label
          class="mst-dungeon-auto-buff"
          title=${i18n.t('applyMarketTaxHint', marketTaxPercent, cowbellTaxPercent)}
        >
          <input
            type="checkbox"
            .checked=${feature.state.applyMarketTax}
            @change=${(event) => {
              feature.state.applyMarketTax = event.target.checked;
              feature.render();
            }}
          >
          <span>${i18n.t('applyMarketTax')}</span>
        </label>
      </div>
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
      <div class="mst-dungeon-field mst-dungeon-toggle-field">
        <button type="button" class="mst-dungeon-config-button" data-dungeon-config="restore">
          ${i18n.t('restoreDefaultConfig')}
        </button>
      </div>
    </div>
    <div class="mst-dungeon-results"></div>
    </div>
    <div class="mst-dungeon-batch-view" .hidden=${!feature.batchEnabled}></div>
  </div>
      `,
      feature.root
    );
    // 结果表单独渲染，避免表单重绘时复用已经脱离 DOM 的表格节点，造成自定义列停止更新。
    const resultRoot = feature.root.querySelector('.mst-dungeon-results');
    if (resultRoot) TemplateRenderer.render(() => feature.renderResult(result), resultRoot);
    // 批量视图只在勾选时渲染；行内输入走局部刷新，不触发整棵模板重绘。
    if (feature.batchEnabled) {
      const batchRoot = feature.root.querySelector('.mst-dungeon-batch-view');
      if (batchRoot) feature.renderBatchView(batchRoot);
    }
    // 所有选项与列表调整都经过 render 收口，配置随调整自动保存。
    dungeonProfitBatchView.autosave(feature);
  }
};

// dungeon-profit-batch-view
const dungeonProfitBatchView = {
  // 批量模拟选项与单图共享同一份 state（从“使用工匠茶”开始），两个模式的口径保持一致。
  OPTION_CONTROLS: Object.freeze([
    'useArtisanTea', 'useGuzzlingPouch', 'guzzlingLevel', 'applyMarketTax', 'excludeBackEquipmentValue',
    'customMode', 'customKeySource', 'customBuySide', 'customSellSide'
  ]),
  ROW_FIELDS: Object.freeze([
    'difficultyTier', 'partySize', 'clearMinutes', 'dailyConsumablesCost'
  ]),

  getViewHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const missingCount = this.getMissingPriceCount(feature);
    return `
  <div class="mst-dungeon-toolbar mst-dungeon-batch-options">${this.getOptionsHtml(feature)}</div>
  <div class="mst-dungeon-picker-row">
    <div class="mst-dungeon-map-picker">${this.getMapCardsHtml(feature)}</div>
    <div class="mst-dungeon-market-tile">
      <small>${escapeHtmlText(i18n.t('marketDataTime'))}</small>
      <strong>${escapeHtmlText(feature.marketService.getUpdatedText())}</strong>
    </div>
  </div>
  ${missingCount > 0 ? this.getWarningHtml(feature, missingCount) : ''}
  <div class="mst-dungeon-table-wrap">
    <table class="mst-dungeon-table mst-dungeon-batch-table">
      ${this.getTableHeadHtml(feature)}
      <tbody>${this.getTableBodyHtml(feature)}</tbody>
    </table>
  </div>`;
  },

  getConfigButtonsHtml(_feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    return `
    <div class="mst-dungeon-field mst-dungeon-toggle-field">
      <button type="button" class="mst-dungeon-config-button" data-dungeon-config="restore">${escapeHtmlText(
        i18n.t('restoreDefaultConfig')
      )}</button>
    </div>`;
  },

  getBatchToggleHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    return `
    <div class="mst-dungeon-field mst-dungeon-toggle-field">
      <label class="mst-dungeon-auto-buff">
        <input type="checkbox" data-batch-toggle${feature.batchEnabled ? ' checked' : ''}>
        <span>${escapeHtmlText(i18n.t('simTabBatch'))}</span>
      </label>
    </div>`;
  },

  getOptionsHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const state = feature.state;
    const marketTaxPercent = Math.round(MARKET_TAX_RATE * 100);
    const cowbellTaxPercent = Math.round(COWBELL_TAX_RATE * 100);
    const checkboxField = (option, labelKey, title) => `
    <div class="mst-dungeon-field mst-dungeon-toggle-field">
      <label class="mst-dungeon-auto-buff"${title ? ` title="${title}"` : ''}>
        <input type="checkbox" data-batch-option="${option}"${state[option] ? ' checked' : ''}>
        <span>${escapeHtmlText(i18n.t(labelKey))}</span>
      </label>
    </div>`;
    const guzzlingOptions = Array.from(
      {length: 21},
      (_, level) =>
        `<option value="${level}"${String(level) === String(state.guzzlingLevel) ? ' selected' : ''}>+${level}</option>`
    ).join('');
    return `
    ${this.getBatchToggleHtml(feature)}
    ${checkboxField('useArtisanTea', 'artisanTea')}
    <label class="mst-dungeon-field">
      <span>${escapeHtmlText(i18n.t('guzzlingLevel'))}</span>
      <span class="mst-dungeon-guzzling-control">
        <label class="mst-dungeon-guzzling-toggle" title="${escapeHtmlText(i18n.t('useGuzzlingPouch'))}">
          <input type="checkbox" data-batch-option="useGuzzlingPouch" aria-label="${escapeHtmlText(
            i18n.t('useGuzzlingPouch')
          )}"${state.useGuzzlingPouch ? ' checked' : ''}>
        </label>
        <select data-batch-option="guzzlingLevel"${state.useGuzzlingPouch ? '' : ' disabled'}>${guzzlingOptions}</select>
      </span>
    </label>
    ${checkboxField(
      'applyMarketTax',
      'applyMarketTax',
      escapeHtmlText(i18n.t('applyMarketTaxHint', marketTaxPercent, cowbellTaxPercent))
    )}
    ${checkboxField('excludeBackEquipmentValue', 'excludeBackEquipmentValue')}
    ${checkboxField('customMode', 'customMode')}
    <label class="mst-dungeon-field"${state.customMode ? '' : ' hidden'}>
      <span>${escapeHtmlText(i18n.t('keySource'))}</span>
      <select data-batch-option="customKeySource">
        <option value="materials"${state.customKeySource === 'materials' ? ' selected' : ''}>${escapeHtmlText(
          i18n.t('craftedKeys')
        )}</option>
        <option value="market"${state.customKeySource === 'market' ? ' selected' : ''}>${escapeHtmlText(
          i18n.t('purchasedKeys')
        )}</option>
      </select>
    </label>
    <label class="mst-dungeon-field"${state.customMode ? '' : ' hidden'}>
      <span>${escapeHtmlText(
        i18n.t(state.customKeySource === 'materials' ? 'keyMaterialPurchaseMethod' : 'keyPurchaseMethod')
      )}</span>
      <select data-batch-option="customBuySide">
        <option value="ask"${state.customBuySide === 'ask' ? ' selected' : ''}>${escapeHtmlText(i18n.t('leftBuy'))}</option>
        <option value="bid"${state.customBuySide === 'bid' ? ' selected' : ''}>${escapeHtmlText(i18n.t('rightBuy'))}</option>
      </select>
    </label>
    <label class="mst-dungeon-field"${state.customMode ? '' : ' hidden'}>
      <span>${escapeHtmlText(i18n.t('goodsSaleMethod'))}</span>
      <select data-batch-option="customSellSide">
        <option value="ask"${state.customSellSide === 'ask' ? ' selected' : ''}>${escapeHtmlText(i18n.t('leftSell'))}</option>
        <option value="bid"${state.customSellSide === 'bid' ? ' selected' : ''}>${escapeHtmlText(i18n.t('rightSell'))}</option>
      </select>
    </label>${this.getConfigButtonsHtml(feature)}`;
  },

  // 地下城图标与游戏战斗面板一致：action 无输入/产出/刷怪信息时使用 actions 精灵图（游戏 getActionIconSrc 同源）。
  getMapIconHref(_feature, actionHrid) {
    const {utils} = DungeonProfitCalculatorFeature.ctx;
    const sprite = utils?.getSpriteUrl?.('actions') || '/static/media/actions_sprite.e6388cbc.svg';
    return `${sprite}#${utils?.substrLastSlash?.(actionHrid) || actionHrid}`;
  },

  getMapCardsHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    return feature.service
      .getDungeons()
      .map((action, index) => {
        return `
    <button type="button" class="mst-dungeon-map-card" data-dungeon-add="${escapeHtmlText(action.hrid)}" title="${escapeHtmlText(
      i18n.t('doubleClickToAdd')
    )}">
      <svg aria-hidden="true"><use href="${escapeHtmlText(this.getMapIconHref(feature, action.hrid))}"></use></svg>
      <strong>D${index + 1}. ${escapeHtmlText(feature.getDungeonName(action))}</strong>
    </button>`;
      })
      .join('');
  },

  getWarningHtml(feature, missingCount) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    return `<div class="mst-dungeon-warning" data-batch-warning>${escapeHtmlText(
      i18n.t('missingMarketPrices', missingCount)
    )}</div>`;
  },

  getTableHeadHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const customMode = Boolean(feature.state.customMode);
    // 单位换行展示并缩短列宽：单次耗时/每日药品饮料成本的主文案与单位分两行。
    const twoLineHeader = (labelKey, unitKey) =>
      `<th rowspan="2">${escapeHtmlText(i18n.t(labelKey))}<br>${escapeHtmlText(i18n.t(unitKey))}</th>`;
    const rowSpanColumns = [
      `<th rowspan="2">${escapeHtmlText(i18n.t('order'))}</th>`, `<th rowspan="2">${escapeHtmlText(i18n.t('dungeon'))}</th>`, `<th rowspan="2">${escapeHtmlText(i18n.t('difficultyTier'))}</th>`, `<th rowspan="2">${escapeHtmlText(i18n.t('partySize'))}</th>`, twoLineHeader('clearTimeMinutesShort', 'unitMinutes'),
      twoLineHeader(
        'dailyConsumablesCostLine1',
        'dailyConsumablesCostLine2'
      ), `<th rowspan="2">${escapeHtmlText(i18n.t('expectedQuantity'))}</th>`
    ].join('');
    const customGroupLabel = `${i18n.t('customResult')}·${i18n.t(
      feature.state.customKeySource === 'materials' ? 'craftedKeys' : 'purchasedKeys'
    )}`;
    const secondGroupHeader = customMode
      ? `<th colspan="2">${escapeHtmlText(customGroupLabel)}</th>`
      : `<th colspan="2">${escapeHtmlText(i18n.t('purchasedKeys'))}</th>`;
    const directionPair = `<th>${escapeHtmlText(i18n.t('leftBuyRightSell'))}</th><th>${escapeHtmlText(
      i18n.t('rightBuyLeftSell')
    )}</th>`;
    const customDirectionLabel = `${i18n.t(feature.state.customBuySide === 'ask' ? 'leftBuy' : 'rightBuy')}/${i18n.t(
      feature.state.customSellSide === 'ask' ? 'leftSell' : 'rightSell'
    )}`;
    const secondGroupDirections = customMode
      ? `<th colspan="2">${escapeHtmlText(customDirectionLabel)}</th>`
      : directionPair;
    return `
      <thead>
        <tr class="mst-dungeon-table-group-header">
          ${rowSpanColumns}
          <th colspan="2">${escapeHtmlText(i18n.t('craftedKeys'))}</th>
          ${secondGroupHeader}
          <th rowspan="2" class="mst-dungeon-batch-col-action"></th>
        </tr>
        <tr class="mst-dungeon-batch-sub-header">
          ${directionPair}
          ${secondGroupDirections}
        </tr>
      </thead>`;
  },

  getTableBodyHtml(feature) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!feature.batchRows.length) {
      return `<tr class="mst-dungeon-batch-empty"><td colspan="12">${escapeHtmlText(
        i18n.t('batchEmptyHint')
      )}</td></tr>`;
    }
    return feature.batchRows.map((row, index) => this.getRowHtml(feature, row, index + 1)).join('');
  },

  getRowHtml(feature, row, sequence) {
    const {i18n, utils} = DungeonProfitCalculatorFeature.ctx;
    const action = feature.service.getDungeons().find((dungeon) => dungeon.hrid === row.actionHrid);
    // 列表行内地图名与卡片一致带 D 序号（官方 sortIndex 顺序）。
    const dungeonIndex = feature.service.getDungeons().findIndex((dungeon) => dungeon.hrid === row.actionHrid);
    const mapLabel = action ? `D${dungeonIndex + 1}. ${feature.getDungeonName(action)}` : '-';
    const difficultyOptions = [
      0, 1, 2
    ]
      .map(
        (tier) =>
          `<option value="${tier}"${Number(tier) === Number(row.difficultyTier) ? ' selected' : ''}>T${tier}</option>`
      )
      .join('');
    const partySizeOptions = [
      1, 2, 3, 4, 5
    ]
      .map(
        (size) => `<option value="${size}"${Number(size) === Number(row.partySize) ? ' selected' : ''}>${size}</option>`
      )
      .join('');
    const customMode = Boolean(feature.state.customMode);
    const miscSprite = utils?.getSpriteUrl?.('misc') || '/static/media/misc_sprite.cfad291b.svg';
    return `
  <tr data-batch-row-id="${row.id}">
    <td class="mst-sequence-cell mst-dungeon-batch-index" draggable="true" title="${escapeHtmlText(
      i18n.t('dragToSort')
    )}"><svg aria-hidden="true"><use href="${escapeHtmlText(`${miscSprite}#drag_handle`)}"></use></svg><span>${sequence}</span></td>
    <td class="mst-dungeon-batch-map"><span class="mst-dungeon-loot-item"><svg aria-hidden="true"><use href="${escapeHtmlText(
      this.getMapIconHref(feature, row.actionHrid)
    )}"></use></svg><span>${escapeHtmlText(mapLabel)}</span></span></td>
    <td><select data-batch-field="difficultyTier">${difficultyOptions}</select></td>
    <td><select data-batch-field="partySize">${partySizeOptions}</select></td>
    <td><input type="number" min="0.1" step="1" data-batch-field="clearMinutes" value="${escapeHtmlText(
      String(row.clearMinutes ?? '')
    )}"></td>
    <td><input type="number" min="0" step="1" placeholder="0" data-batch-field="dailyConsumablesCost" value="${escapeHtmlText(
      String(row.dailyConsumablesCost ?? '')
    )}"></td>
    <td data-batch-result="expected">-</td>
    <td class="mst-dungeon-batch-value" data-batch-result="craftAB">-</td>
    <td class="mst-dungeon-batch-value" data-batch-result="craftBA">-</td>
    ${
      customMode
        ? '<td class="mst-dungeon-batch-value" colspan="2" data-batch-result="custom">-</td>'
        : '<td class="mst-dungeon-batch-value" data-batch-result="marketAB">-</td><td class="mst-dungeon-batch-value" data-batch-result="marketBA">-</td>'
    }
    <td class="mst-dungeon-batch-action"><button type="button" class="mst-row-remove mst-dungeon-batch-remove" title="${escapeHtmlText(
      i18n.t('remove')
    )}" aria-label="${escapeHtmlText(i18n.t('remove'))}">&times;</button></td>
  </tr>`;
  },

  getTwoLineCellHtml(feature, values) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!values) return '-';
    return `<div class="mst-dungeon-batch-line mst-dungeon-batch-cost" title="${escapeHtmlText(
      i18n.t('totalDailyCost')
    )}"><small>${escapeHtmlText(i18n.t('batchCostShort'))}</small>${feature.formatMoney(values.cost)}</div>
  <div class="mst-dungeon-batch-line mst-dungeon-batch-profit" title="${escapeHtmlText(i18n.t('netProfit'))}"><small>${escapeHtmlText(
    i18n.t('batchProfitShort')
  )}</small>${feature.formatMoney(values.profit)}</div>`;
  },

  // 期望数量分两行：上行普通宝箱数量、下行精炼宝箱数量；没有精炼宝箱时只展示普通一行。
  getExpectedQuantityCellHtml(feature, computed) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    if (!computed) return '-';
    const normalLine = `<div class="mst-dungeon-batch-line mst-dungeon-batch-expected" title="${escapeHtmlText(
      i18n.t('normalChest')
    )}"><small>${escapeHtmlText(i18n.t('batchNormalShort'))}</small>${feature.formatCount(
      computed.normalQuantity
    )}</div>`;
    if (!(computed.refinementQuantity > 0)) return normalLine;
    return `${normalLine}
  <div class="mst-dungeon-batch-line mst-dungeon-batch-expected" title="${escapeHtmlText(
    i18n.t('refinementChest')
  )}"><small>${escapeHtmlText(i18n.t('batchRefinedShort'))}</small>${feature.formatCount(
    computed.refinementQuantity
  )}</div>`;
  },

  computeRowResult(feature, row) {
    const state = feature.state;
    const result = feature.service.calculate({
      actionHrid: row.actionHrid,
      difficultyTier: row.difficultyTier,
      partySize: Number(row.partySize),
      clearMinutes: row.clearMinutes,
      dailyConsumablesCost: row.dailyConsumablesCost,
      useArtisanTea: state.useArtisanTea,
      useGuzzlingPouch: state.useGuzzlingPouch,
      guzzlingLevel: state.guzzlingLevel,
      excludeBackEquipmentValue: state.excludeBackEquipmentValue,
      applyMarketTax: state.applyMarketTax,
      customMode: state.customMode,
      customKeySource: state.customKeySource,
      customBuySide: state.customBuySide,
      customSellSide: state.customSellSide
    });
    if (!result) return null;
    const materials = result.costScenarios.materials;
    const market = result.costScenarios.market;
    return {
      normalQuantity: result.normalQuantity,
      refinementQuantity: result.refinementQuantity,
      missingPrices: result.missingPrices,
      craftAB: {cost: materials.totalCostConservative, profit: materials.profitConservative},
      craftBA: {cost: materials.totalCostOptimistic, profit: materials.profitOptimistic},
      marketAB: {cost: market.totalCostConservative, profit: market.profitConservative},
      marketBA: {cost: market.totalCostOptimistic, profit: market.profitOptimistic},
      custom: {cost: result.customScenario.totalCost, profit: result.customScenario.profit}
    };
  },

  getMissingPriceCount(feature) {
    const missing = new Set();
    feature.batchRows.forEach((row) => {
      this.computeRowResult(feature, row)?.missingPrices.forEach((itemHrid) => missing.add(itemHrid));
    });
    return missing.size;
  },

  render(feature, batchRoot) {
    const {TemplateRenderer} = DungeonProfitCalculatorFeature.ctx;
    // 行模板不内联计算结果，渲染后统一由 refreshResults 填充，保证添加行、选项变化后的数值口径一致。
    TemplateRenderer.renderHtml(() => this.getViewHtml(feature), batchRoot);
    this.refreshResults(feature);
  },

  refreshResults(feature) {
    const batchRoot = feature.root?.querySelector?.('.mst-dungeon-batch-view');
    if (!batchRoot) return;
    feature.batchRows.forEach((row) => {
      const rowElement = batchRoot.querySelector(`[data-batch-row-id="${row.id}"]`);
      if (!rowElement) return;
      const computed = this.computeRowResult(feature, row);
      const expectedCell = rowElement.querySelector('[data-batch-result="expected"]');
      if (expectedCell) expectedCell.innerHTML = this.getExpectedQuantityCellHtml(feature, computed);
      [
        'craftAB', 'craftBA', 'marketAB', 'marketBA', 'custom'
      ].forEach((key) => {
        const cell = rowElement.querySelector(`[data-batch-result="${key}"]`);
        if (cell) cell.innerHTML = this.getTwoLineCellHtml(feature, computed?.[key]);
      });
    });
    this.refreshWarning(feature, batchRoot);
  },

  refreshWarning(feature, batchRoot) {
    const missingCount = this.getMissingPriceCount(feature);
    const existing = batchRoot.querySelector('[data-batch-warning]');
    if (missingCount > 0) {
      const html = this.getWarningHtml(feature, missingCount);
      if (existing) existing.outerHTML = html;
      else batchRoot.querySelector('.mst-dungeon-table-wrap')?.insertAdjacentHTML('beforebegin', html);
      return;
    }
    existing?.remove();
  },

  bind(feature, popup, listenerOptions = {}) {
    popup.addEventListener(
      'dblclick',
      (event) => {
        const card = event.target.closest('[data-dungeon-add]');
        if (!card) return;
        feature.batchRows.push(this.createBatchRow(feature, card.dataset.dungeonAdd));
        this.render(feature, feature.root.querySelector('.mst-dungeon-batch-view'));
      },
      listenerOptions
    );
    popup.addEventListener(
      'click',
      (event) => {
        const configButton = event.target.closest('[data-dungeon-config="restore"]');
        if (configButton) {
          this.restoreDefaults(feature);
          return;
        }
        const removeButton = event.target.closest('.mst-dungeon-batch-remove');
        if (!removeButton) return;
        const rowId = Number(removeButton.closest('[data-batch-row-id]')?.dataset.batchRowId);
        feature.batchRows = feature.batchRows.filter((row) => row.id !== rowId);
        this.render(feature, feature.root.querySelector('.mst-dungeon-batch-view'));
      },
      listenerOptions
    );
    // 批量/单图共用一个批量复选框：出现在批量选项行第一项，单图操作区第一项由 uhtml 模板直接处理。
    popup.addEventListener(
      'change',
      (event) => {
        const batchToggle = event.target.closest('[data-batch-toggle]');
        if (batchToggle) {
          feature.batchEnabled = batchToggle.checked;
          feature.applyDialogWidth();
          feature.render();
          return;
        }
        const control = event.target.closest('[data-batch-option]');
        if (control) {
          this.syncOptionControl(feature, control);
          this.render(feature, feature.root.querySelector('.mst-dungeon-batch-view'));
          return;
        }
        this.syncRowField(feature, event.target);
      },
      listenerOptions
    );
    popup.addEventListener(
      'input',
      (event) => {
        this.syncRowField(feature, event.target);
      },
      listenerOptions
    );
    this.bindDragEvents(feature, popup, listenerOptions);
  },

  // 序号列拖动排序：只允许从序号单元格拖动，松手时按目标行中线决定插入位置（同战斗升级计算器）。
  bindDragEvents(feature, popup, listenerOptions) {
    let draggedRowId = 0;
    popup.addEventListener(
      'dragstart',
      (event) => {
        const dragHandle = event.target.closest('.mst-sequence-cell[draggable="true"]');
        const rowElement = dragHandle?.closest('[data-batch-row-id]');
        if (!dragHandle || !rowElement) {
          event.preventDefault();
          return;
        }
        draggedRowId = Number(rowElement.dataset.batchRowId);
        rowElement.classList.add('mst-row-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedRowId));
      },
      listenerOptions
    );
    popup.addEventListener(
      'dragover',
      (event) => {
        if (!draggedRowId || !event.target.closest('[data-batch-row-id]')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      listenerOptions
    );
    popup.addEventListener(
      'drop',
      (event) => {
        const targetElement = event.target.closest('[data-batch-row-id]');
        if (!draggedRowId || !targetElement) return;
        event.preventDefault();
        const targetId = Number(targetElement.dataset.batchRowId);
        const sourceIndex = feature.batchRows.findIndex((row) => row.id === draggedRowId);
        let insertIndex = feature.batchRows.findIndex((row) => row.id === targetId);
        draggedRowId = 0;
        if (sourceIndex < 0 || insertIndex < 0 || sourceIndex === insertIndex) return;
        const insertAfter = event.clientY > targetElement.getBoundingClientRect().top + targetElement.offsetHeight / 2;
        const [
          movedRow
        ] = feature.batchRows.splice(sourceIndex, 1);
        if (sourceIndex < insertIndex) insertIndex--;
        if (insertAfter) insertIndex++;
        feature.batchRows.splice(insertIndex, 0, movedRow);
        this.render(feature, feature.root.querySelector('.mst-dungeon-batch-view'));
      },
      listenerOptions
    );
    popup.addEventListener(
      'dragend',
      () => {
        draggedRowId = 0;
        popup.querySelectorAll('.mst-row-dragging').forEach((row) => row.classList.remove('mst-row-dragging'));
      },
      listenerOptions
    );
  },

  createBatchRow(feature, actionHrid, overrides = {}) {
    return {
      id: ++feature.batchNextRowId,
      actionHrid,
      difficultyTier: 0,
      partySize: '5',
      clearMinutes: '30',
      dailyConsumablesCost: '',
      ...overrides
    };
  },

  // 首次打开（无保存配置）时批量列表默认展示四个官方地图。
  seedDefaultRows(feature) {
    feature.batchRows = feature.service.getDungeons().map((dungeon) => this.createBatchRow(feature, dungeon.hrid));
    feature.batchInitialized = true;
  },

  syncOptionControl(feature, control) {
    const option = control.dataset.batchOption;
    if (!this.OPTION_CONTROLS.includes(option)) return;
    feature.state[option] = control.type === 'checkbox' ? control.checked : control.value;
  },

  syncRowField(feature, target) {
    const field = target.dataset?.batchField;
    if (!field || !this.ROW_FIELDS.includes(field)) return;
    const rowElement = target.closest('[data-batch-row-id]');
    if (!rowElement) return;
    const row = feature.batchRows.find((item) => item.id === Number(rowElement.dataset.batchRowId));
    if (!row) return;
    row[field] = field === 'difficultyTier' ? Number(target.value) : target.value;
    this.refreshResults(feature);
    // 行内输入不触发整块重绘，配置随行参数调整自动保存。
    this.autosave(feature);
  },

  // 配置持久化：同一 localStorage key 下分 single/batch 两个小节，只存输入参数，结果每次重新计算。
  SINGLE_CONFIG_FIELDS: Object.freeze([
    'actionHrid', 'difficultyTier', 'partySize', 'clearMinutes', 'dailyConsumablesCost',
    'useArtisanTea', 'useGuzzlingPouch', 'guzzlingLevel', 'excludeBackEquipmentValue', 'applyMarketTax',
    'customMode', 'customKeySource', 'customBuySide', 'customSellSide'
  ]),

  readConfigStore() {
    const {STORAGE_KEYS} = DungeonProfitCalculatorFeature.ctx;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.DUNGEON_PROFIT_CONFIG) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('[MST] 地下城收益配置读取失败:', error);
      return {};
    }
  },

  writeConfigStore(store) {
    const {STORAGE_KEYS} = DungeonProfitCalculatorFeature.ctx;
    try {
      localStorage.setItem(STORAGE_KEYS.DUNGEON_PROFIT_CONFIG, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[MST] 地下城收益配置保存失败:', error);
      return false;
    }
  },

  // 配置自动保存：同一 localStorage key 下分 single/batch 两个小节，只存输入参数，结果每次重新计算。
  // 批量模拟勾选状态作为共享开关存在同一存储的顶层字段，重开计算器（含重新加载游戏网站）后恢复。
  // 用户每次调整（选项、行参数、列表增删与排序）后随渲染自动写回；恢复默认会暂停一次自动保存，
  // 保证“清除存储 + 回到默认参数”的语义不被随后的默认态渲染写回覆盖。
  autosave(feature) {
    if (feature.autosavePaused) {
      feature.autosavePaused = false;
      return;
    }
    const store = this.readConfigStore();
    store.batchEnabled = Boolean(feature.batchEnabled);
    if (feature.batchEnabled) {
      store.batch = {
        options: Object.fromEntries(
          this.OPTION_CONTROLS.map((key) => [
            key, feature.state[key]
          ])
        ),
        rows: feature.batchRows.map((row) => ({
          actionHrid: row.actionHrid,
          difficultyTier: row.difficultyTier,
          partySize: row.partySize,
          clearMinutes: row.clearMinutes,
          dailyConsumablesCost: row.dailyConsumablesCost
        }))
      };
    } else {
      store.single = Object.fromEntries(
        this.SINGLE_CONFIG_FIELDS.map((key) => [
          key, feature.state[key]
        ])
      );
    }
    this.writeConfigStore(store);
  },

  restoreDefaults(feature) {
    const {Notifier, i18n} = DungeonProfitCalculatorFeature.ctx;
    const store = this.readConfigStore();
    delete store[feature.batchEnabled ? 'batch' : 'single'];
    this.writeConfigStore(store);
    // 恢复默认会重建共享选项（暴饮之囊按角色持有重新检测）；批量列表恢复为四个官方地图。
    feature.resetState();
    feature.autosavePaused = true;
    if (feature.batchEnabled) {
      this.seedDefaultRows(feature);
      const batchRoot = feature.root?.querySelector?.('.mst-dungeon-batch-view');
      if (batchRoot) this.render(feature, batchRoot);
    } else {
      feature.render();
    }
    Notifier.toast(i18n.t('configRestored'), 'success');
  },

  // 打开弹窗时应用已保存配置：先恢复批量勾选状态，再单图字段，再批量快照（选项 + 行），
  // 两者都缺失时批量默认四地图。
  loadSavedConfigs(feature) {
    const store = this.readConfigStore();
    if (typeof store.batchEnabled === 'boolean') feature.batchEnabled = store.batchEnabled;
    const single = store.single;
    if (single && typeof single === 'object') {
      this.SINGLE_CONFIG_FIELDS.forEach((key) => {
        if (single[key] !== undefined && single[key] !== null) feature.state[key] = single[key];
      });
    }
    const batch = store.batch;
    if (batch && typeof batch === 'object') {
      if (batch.options && typeof batch.options === 'object') {
        this.OPTION_CONTROLS.forEach((key) => {
          if (batch.options[key] !== undefined && batch.options[key] !== null) feature.state[key] = batch.options[key];
        });
      }
      if (Array.isArray(batch.rows) && batch.rows.length) {
        feature.batchRows = batch.rows
          .filter((row) => row && typeof row.actionHrid === 'string' && row.actionHrid)
          .map((row) =>
            this.createBatchRow(feature, row.actionHrid, {
              difficultyTier: Number(row.difficultyTier) || 0,
              partySize: String(row.partySize ?? '5'),
              clearMinutes: String(row.clearMinutes ?? '30'),
              dailyConsumablesCost: String(row.dailyConsumablesCost ?? '')
            })
          );
        feature.batchInitialized = true;
        return;
      }
    }
    if (!feature.batchRows.length) this.seedDefaultRows(feature);
  }
};

// 批量视图按字符串拼接 HTML，属性值一律经过转义，避免游戏内名称破坏结构。
function escapeHtmlText(value) {
  const {utils} = DungeonProfitCalculatorFeature.ctx;
  const text = String(value ?? '');
  return utils?.escapeHtml ? utils.escapeHtml(text) : text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

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
        quantity: null,
        values: values(
          materials.normalChestUnitProfitConservative,
          materials.normalChestUnitProfitOptimistic,
          market.normalChestUnitProfitConservative,
          market.normalChestUnitProfitOptimistic,
          custom.normalChestUnitProfit
        ),
        type: 'revenue'
      }, {
        key: 'normalChestDailyOutput',
        quantity: result.normalQuantity,
        values: values(
          result.normalChestOutputConservative,
          result.normalChestOutputOptimistic,
          result.normalChestOutputConservative,
          result.normalChestOutputOptimistic,
          result.customScenario?.sellSide === 'bid'
            ? result.normalChestOutputConservative
            : result.normalChestOutputOptimistic
        ),
        type: 'revenue'
      },
      ...(result.refinementQuantity > 0
        ? [
            {
              key: 'refinementChestRevenue',
              quantity: null,
              values: values(
                materials.refinementChestUnitProfitConservative,
                materials.refinementChestUnitProfitOptimistic,
                market.refinementChestUnitProfitConservative,
                market.refinementChestUnitProfitOptimistic,
                custom.refinementChestUnitProfit
              ),
              type: 'revenue'
            }, {
              key: 'refinementChestDailyOutput',
              quantity: result.refinementQuantity,
              values: values(
                result.refinementChestOutputConservative,
                result.refinementChestOutputOptimistic,
                result.refinementChestOutputConservative,
                result.refinementChestOutputOptimistic,
                result.customScenario?.sellSide === 'bid'
                  ? result.refinementChestOutputConservative
                  : result.refinementChestOutputOptimistic
              ),
              type: 'revenue'
            }
          ]
        : []), {
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
    const showResult = feature.state.viewTab !== 'loot';
    // 自定义模式保留六列 DOM 结构，但将末列作为零宽占位，使合并后的自定义结果只占一个有效价格列。
    return TemplateRenderer.html`
  ${dungeonProfitSummaryView.renderSummary(feature, result)}
  ${this.renderMissingPriceWarning(result, TemplateRenderer, i18n)}
  <div class="mst-dungeon-tabs">
    <button type="button" class=${`mst-dungeon-tab${showResult ? ' mst-dungeon-tab-active' : ''}`} @click=${() => {
      feature.state.viewTab = 'result';
      feature.render();
    }}>${i18n.t('dungeonResultTab')}</button>
    <button type="button" class=${`mst-dungeon-tab${!showResult ? ' mst-dungeon-tab-active' : ''}`} @click=${() => {
      feature.state.viewTab = 'loot';
      feature.render();
    }}>${i18n.t('dungeonLootTab')}</button>
  </div>
  <div class="mst-dungeon-table-wrap" .hidden=${!showResult}>
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
  ${this.renderDropTable(feature, result, TemplateRenderer, i18n)}
    `;
  },

  renderDropTable(feature, result, TemplateRenderer, i18n) {
    const {DataHub} = DungeonProfitCalculatorFeature.ctx;
    const dropTable = result.dropTable;
    const getItemName = (itemHrid) => DataHub.getLocalizedGameName('itemNames', itemHrid) || itemHrid;
    // 掉落物表按官方宝箱直接掉落列表分节展示，各节标题行右侧同时展示该节价值小计。
    const renderSection = (label, rows, chestDailyCount, chestLabel, subtotalAsk, subtotalBid) => [
      TemplateRenderer.html`<tr class="mst-dungeon-row-section mst-dungeon-row-subtotal"><th colspan="3">${label}</th><td>${feature.formatMoney(subtotalAsk)}</td><td>${feature.formatMoney(subtotalBid)}</td></tr>`, ...rows.map((row) => this.renderDropTableRow(feature, row, getItemName, TemplateRenderer, i18n, chestDailyCount, chestLabel))
    ];
    const normalLabel = `${i18n.t('normalChestLoot')}（${i18n.t(
      'chestDropsPerDay',
      feature.formatCount(dropTable.normalQuantity)
    )}）`;
    const refinementLabel = `${i18n.t('refinementChestLoot')}（${i18n.t(
      'chestDropsPerDay',
      feature.formatCount(dropTable.refinementQuantity)
    )}）`;
    const normalSection = renderSection(
      normalLabel,
      dropTable.rows.filter((row) => row.chestType === 'normal'),
      dropTable.normalQuantity,
      i18n.t('normalChest'),
      dropTable.normalAskSubtotal,
      dropTable.normalBidSubtotal
    );
    const refinementSection =
      dropTable.refinementQuantity > 0
        ? renderSection(
            refinementLabel,
            dropTable.rows.filter((row) => row.chestType === 'refinement'),
            dropTable.refinementQuantity,
            i18n.t('refinementChest'),
            dropTable.refinementAskSubtotal,
            dropTable.refinementBidSubtotal
          )
        : [];
    return TemplateRenderer.html`
  <div class="mst-dungeon-table-wrap" .hidden=${feature.state.viewTab !== 'loot'}>
    <table class="mst-dungeon-table mst-dungeon-loot-table">
      <colgroup>
        <col class="mst-dungeon-loot-col-item">
        <col class="mst-dungeon-loot-col-rate">
        <col class="mst-dungeon-loot-col-quantity">
        <col class="mst-dungeon-loot-col-value">
        <col class="mst-dungeon-loot-col-value">
      </colgroup>
      <thead>
        <tr>
          <th>${i18n.t('dropItem')}</th>
          <th>${i18n.t('dropRate')}</th>
          <th>${i18n.t('expectedQuantity')}</th>
          <th>${i18n.t('askPriceAndTotal')}</th>
          <th>${i18n.t('bidPriceAndTotal')}</th>
        </tr>
      </thead>
      <tbody>
        ${normalSection}
        ${refinementSection}
      </tbody>
      <tfoot>
        <tr class="mst-dungeon-row-total">
          <th scope="row" colspan="3">${i18n.t('total')}</th>
          <td><div class="mst-dungeon-loot-price"><strong>${feature.formatMoney(dropTable.askTotal)}</strong></div></td>
          <td><div class="mst-dungeon-loot-price"><strong>${feature.formatMoney(dropTable.bidTotal)}</strong></div></td>
        </tr>
      </tfoot>
    </table>
  </div>
    `;
  },

  renderDropTableRow(feature, row, getItemName, TemplateRenderer, i18n, chestDailyCount, chestLabel) {
    // 期望数量悬浮提示展示计算公式与结果：每日该宝箱数量 × 掉率 × 平均掉落数量，换行后给出结果。
    const formulaTitle =
      i18n.t(
        'expectedQuantityFormula',
        feature.formatCount(chestDailyCount),
        chestLabel,
        feature.formatDropRate(row.dropRate),
        row.minCount,
        row.maxCount
      ) +
      '\n' +
      i18n.t('expectedQuantityResult', feature.formatCount(row.quantity));
    const quantityRange = row.minCount === row.maxCount ? String(row.minCount) : `${row.minCount}-${row.maxCount}`;
    return TemplateRenderer.html`
  <tr class="mst-dungeon-row-loot">
    <th scope="row">
      <span class="mst-dungeon-loot-item">
        <svg aria-hidden="true"><use href=${this.getItemIconHref(feature, row.itemHrid)}></use></svg>
        <span>${getItemName(row.itemHrid)}</span>
      </span>
    </th>
    <td>
      <span class="mst-dungeon-loot-rule" title=${i18n.t('dropQuantityHint', quantityRange)}>
        ${feature.formatDropRate(row.dropRate)}
      </span>
    </td>
    <td><span class="mst-dungeon-loot-quantity" title=${formulaTitle}>${feature.formatCount(row.quantity)}</span></td>
    <td><div class="mst-dungeon-loot-price"><span>${feature.formatMoney(
      row.ask
    )}</span><i>/</i><strong>${feature.formatMoney(row.askValue)}</strong></div></td>
    <td><div class="mst-dungeon-loot-price"><span>${feature.formatMoney(
      row.bid
    )}</span><i>/</i><strong>${feature.formatMoney(row.bidValue)}</strong></div></td>
  </tr>
    `;
  },

  getItemIconHref(_feature, itemHrid) {
    const {utils} = DungeonProfitCalculatorFeature.ctx;
    const sprite = utils?.getSpriteUrl?.('items') || '/static/media/items_sprite.f58c9476.svg';
    return `${sprite}#${utils?.substrLastSlash?.(itemHrid) || itemHrid}`;
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
      partySize: '5',
      clearMinutes: '30',
      dailyConsumablesCost: '',
      useArtisanTea: true,
      useGuzzlingPouch: Boolean(guzzlingPouch),
      guzzlingLevel: String(guzzlingPouch?.enhancementLevel || 0),
      excludeBackEquipmentValue: false,
      applyMarketTax: true,
      customMode: false,
      customKeySource: 'materials',
      customBuySide: 'ask',
      customSellSide: 'ask',
      viewTab: 'result'
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

  formatDropRate(_feature, value) {
    const {i18n} = DungeonProfitCalculatorFeature.ctx;
    const rate = Number(value || 0);
    if (!Number.isFinite(rate) || rate <= 0) return '0%';
    return (rate * 100).toLocaleString(i18n.locale, {minimumFractionDigits: 0, maximumFractionDigits: 2}) + '%';
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
    this.batchView = dungeonProfitBatchView;
  }

  constructor(marketService) {
    this.marketService = marketService;
    this.service = new this.constructor.ctx.DungeonProfitCalculatorService(this.constructor.ctx, marketService);
    this.popup = null;
    this.root = null;
    this.helpController = null;
    this.state = null;
    // 批量开关是复选框，默认不勾选进入单图模拟；批量列表在弹窗关闭后保留，重新打开时按保存配置或默认四地图恢复。
    this.batchEnabled = false;
    this.batchRows = [];
    this.batchNextRowId = 0;
    this.batchInitialized = false;
    // 恢复默认后暂停一次自动保存，避免默认态渲染把清空的配置写回。
    this.autosavePaused = false;
    this.bindController = null;
  }

  applyDialogWidth() {
    // 单图保持原 38rem；批量默认放宽到能容纳表格全部列，窄屏时随 100vw 收缩并出现横向滚动。
    if (!this.popup) return;
    this.popup.style.width = this.batchEnabled ? 'min(66rem, calc(100vw - 1rem))' : 'min(38rem, calc(100vw - 1rem))';
  }

  renderBatchView(batchRoot) {
    return dungeonProfitBatchView.render(this, batchRoot);
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

  formatDropRate(value) {
    return this.constructor.stateController.formatDropRate(this, value);
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
    // textContent 赋值会清空标题子节点（含帮助按钮锚点），语言切换时重新挂载帮助按钮。
    this.mountHelp();
    this.render();
  }

  mountHelp() {
    const {CalculatorHelpPopover, i18n} = this.constructor.ctx;
    if (!this.popup) return null;
    this.helpController?.cleanup();
    this.helpController = CalculatorHelpPopover.mount({
      popup: this.popup,
      moduleName: 'dungeon',
      title: i18n.t('dungeonCalculatorHelpTitle'),
      heading: i18n.t('dungeonProfitCalculator'),
      content: i18n.t('dungeonCalculatorHelp', marketTaxPercent, cowbellTaxPercent)
    });
    return this.helpController;
  }

  async open() {
    const {TemplateRenderer, Notifier, i18n} = this.constructor.ctx;
    if (!this.service.getDungeons().length) return Notifier.alert(i18n.t('noDungeonData'), 'warning');
    try {
      await this.marketService.load();
    } catch (error) {
      console.warn('[MST] 地下城收益计算器市场数据加载失败:', error);
    }
    this.resetState();
    // 校验并恢复本地保存的配置（单图字段与批量快照共用同一 localStorage key 的两个小节）。
    dungeonProfitBatchView.loadSavedConfigs(this);
    return Notifier.html({
      title: i18n.t('dungeonProfitCalculator'),
      html: () => TemplateRenderer.html`<div id="mst-dungeon-calculator-root"></div>`,
      width: 'min(38rem, calc(100vw - 1rem))',
      popupClass: 'mst-upgrade-calculator-dialog mst-dungeon-dialog',
      didOpen: (popup) => {
        this.popup = popup;
        this.root = popup.querySelector('#mst-dungeon-calculator-root');
        // 批量视图的事件统一委托到弹窗节点，重绘批量区域不需要重新绑定。
        this.bindController?.abort();
        this.bindController = new AbortController();
        dungeonProfitBatchView.bind(this, popup, {signal: this.bindController.signal});
        this.applyDialogWidth();
        this.render();
        this.mountHelp();
      },
      willClose: () => {
        this.bindController?.abort();
        this.bindController = null;
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
