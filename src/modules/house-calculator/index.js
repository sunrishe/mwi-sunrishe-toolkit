import {StyleService} from '../../common/runtime.js';
import MST_HOUSE_CALCULATOR_CSS from './styles.css';

// house-calculator-calculation-controller
const houseCalculatorCalculationController = {
  scheduleCalculate(ui, container) {
    const {CONFIG} = HouseCalculatorUI.ctx;
    clearTimeout(ui.autoCalculateTimer);
    ui.autoCalculateTimer = setTimeout(() => {
      ui.autoCalculateTimer = null;
      ui.calculateSelectedRooms(container);
    }, CONFIG.AUTO_CALC_DELAY);
  },

  clearPendingCalculate(ui) {
    if (!ui.autoCalculateTimer) return;
    clearTimeout(ui.autoCalculateTimer);
    ui.autoCalculateTimer = null;
  },

  flushScheduledCalculate(ui, container) {
    if (!ui.autoCalculateTimer) return;
    ui.clearPendingCalculate();
    ui.calculateSelectedRooms(container);
  },

  calculateSelectedRooms(ui, container) {
    const {i18n} = HouseCalculatorUI.ctx;
    const selectedRooms = Array.from(
      container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')
    ).map((cb) => {
      const hrid = cb.value;
      return {
        hrid,
        fromLevel: parseInt(
          container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]').value,
          10
        ),
        toLevel: parseInt(
          container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]').value,
          10
        )
      };
    });

    if (selectedRooms.length === 0) {
      container.querySelector('#mst-hccp-results-text').value = i18n.t('selectHouseFirst');
      ui.lastResult = null;
      return;
    }

    try {
      const allMaterials = {};
      const roomDetails = [];
      selectedRooms.forEach(({hrid, fromLevel, toLevel}) => {
        try {
          const materials = ui.calculator.calculateUpgradeMaterials(hrid, fromLevel, toLevel);
          Object.entries(materials).forEach(
            ([
              itemHrid, count
            ]) => {
              allMaterials[itemHrid] = (allMaterials[itemHrid] || 0) + count;
            }
          );
          roomDetails.push({hrid, fromLevel, toLevel});
        } catch (error) {
          roomDetails.push({hrid, error: error.message});
        }
      });

      ui.lastResult = {materials: allMaterials, roomDetails};
      ui.displayResults(container, allMaterials, roomDetails);
    } catch (error) {
      container.querySelector('#mst-hccp-results-text').value = i18n.t('error') + ': ' + error.message;
      ui.lastResult = null;
    }
  },

  refreshResultDisplay(ui, container) {
    ui.clearPendingCalculate();
    ui.calculateSelectedRooms(container);
  }
};

// house-calculator-csv-export
const houseCalculatorCsvExport = {
  exportCsv(ui, container) {
    const {i18n, utils} = HouseCalculatorUI.ctx;
    if (!ui.lastResult) {
      container.querySelector('#mst-hccp-results-text').value = i18n.t('noResultToExport');
      return;
    }

    const houseInfo = ui.lastResult.roomDetails
      .map((detail) => {
        if (detail.error) {
          return utils.getHouseName(detail.hrid) + ' (' + i18n.t('error') + ': ' + detail.error + ')';
        }
        return utils.getHouseName(detail.hrid) + ' (' + detail.fromLevel + '->' + detail.toLevel + ')';
      })
      .join(i18n.t('listSeparator'));
    const rows = [
      [
        i18n.t('csvUpgradeHouses'), houseInfo
      ], [], [
        i18n.t('csvMarketTime'), ui.marketDataService.getUpdatedText()
      ]
    ];

    const materialEntries = this.getMaterialEntries(ui, ui.lastResult.materials);
    const summary = this.getMaterialSummary(materialEntries);
    const materialRows = materialEntries.map((entry) => {
      return [
        entry.itemHrid, utils.getItemName(entry.itemHrid), this.formatMaterialCount(entry.itemHrid, entry.count), this.formatMaterialCount(entry.itemHrid, entry.available), this.formatMaterialCount(entry.itemHrid, entry.missing),
        this.formatCompactNumber(
          entry.marketPrice
        ), this.formatCompactNumber(entry.totalValue), this.formatCompactNumber(entry.valueGap)
      ];
    });

    rows.push([
      i18n.t('csvMaterialKinds'), summary.materialKinds, i18n.t('csvMissingCount'), summary.missingCount
    ]);
    rows.push([
      i18n.t(
        'csvTotalValue'
      ), this.formatCompactNumber(summary.totalValue), i18n.t('csvRequiredCoins'), this.formatCompactNumber(summary.requiredCoins), i18n.t('csvMaterialValue'),
      this.formatCompactNumber(summary.materialValue), i18n.t('csvValueGap'), this.formatCompactNumber(summary.valueGap)
    ]);
    rows.push([]);
    rows.push([
      i18n.t(
        'csvHrid'
      ), i18n.t('csvName'), i18n.t('csvRequiredCount'), i18n.t('csvAvailableCount'), i18n.t('csvMissingCount'),
      i18n.t('csvMarketPrice'), i18n.t('csvTotalValue'), i18n.t('csvValueGap')
    ]);
    rows.push(...materialRows);

    const csv = '\ufeff' + rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\r\n');
    const blob = new Blob(
      [
        csv
      ],
      {type: 'text/csv;charset=utf-8;'}
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = i18n.t('csvFilenamePrefix') + '_' + utils.formatLocalFileTime() + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
};

// house-calculator-event-controller
const houseCalculatorEventController = {
  bindEvents(ui, container) {
    container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        ui.toggleRoomSelected(checkbox);
        ui.scheduleCalculate(container);
      });
      ui.toggleRoomSelected(checkbox);
    });
    ui.updateSelectAllState(container);

    container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach((select) => {
      select.addEventListener('change', () => {
        ui.refreshToLevelOptions(select);
        ui.scheduleCalculate(container);
      });
    });
    container.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach((select) => {
      select.addEventListener('change', () => ui.scheduleCalculate(container));
    });

    container
      .querySelector('#mst-hccp-select-life')
      .addEventListener('change', () => ui.toggleAllRooms(container, 'life'));
    container
      .querySelector('#mst-hccp-select-combat')
      .addEventListener('change', () => ui.toggleAllRooms(container, 'combat'));

    const batchFromSelect = container.querySelector('#mst-hccp-batch-from-level');
    const batchToSelect = container.querySelector('#mst-hccp-batch-to-level');
    const applyBatchFrom = () => {
      ui.refreshBatchToLevelOptions(container);
      ui.applyBatchFromLevel(container);
    };
    const applyBatchTo = () => ui.applyBatchToLevel(container);
    batchFromSelect.addEventListener('change', applyBatchFrom);
    batchFromSelect.addEventListener('blur', applyBatchFrom);
    batchToSelect.addEventListener('change', applyBatchTo);
    batchToSelect.addEventListener('blur', applyBatchTo);

    container.querySelector('#mst-hccp-refresh-levels').addEventListener('click', () => {
      ui.refreshRoomLevels(container);
    });
    container.querySelectorAll('input[name="display-format"]').forEach((input) => {
      input.addEventListener('change', () => ui.refreshResultDisplay(container));
    });
    container.querySelector('#mst-hccp-export-csv').addEventListener('click', () => {
      ui.flushScheduledCalculate(container);
      ui.exportCsv(container);
    });
    ui.bindMarketMateButton(container);
  }
};

// house-calculator-market-controller
const houseCalculatorMarketController = {
  bindMarketMateButton(ui, container) {
    const button = container.querySelector('#mst-hccp-add-to-cart');
    if (!button || button.dataset.mstBound) return;
    button.dataset.mstBound = '1';
    button.addEventListener('click', () => ui.addMissingMaterialsToCart(container));
  },

  ensureMarketMateButton(ui, container) {
    const {MarketMateBridge, i18n, utils} = HouseCalculatorUI.ctx;
    if (!container?.isConnected || !MarketMateBridge.isReady()) return;
    let button = container.querySelector('#mst-hccp-add-to-cart');
    if (!button) {
      const actions = container.querySelector('.mst-hccp-output-buttons');
      button = utils.ensureButton({
        host: actions,
        id: 'mst-hccp-add-to-cart',
        text: i18n.t('addMissingToCart'),
        title: i18n.t('addMissingToCartTitle')
      });
    }
    if (!button) return;
    ui.bindMarketMateButton(container);
  },

  addMissingMaterialsToCart(ui, container) {
    const {DataHub, MarketMateBridge, i18n} = HouseCalculatorUI.ctx;
    const {Notifier} = HouseCalculatorUI;
    if (!MarketMateBridge.isReady()) {
      container.querySelector('#mst-hccp-add-to-cart')?.remove();
      Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
      return;
    }
    ui.flushScheduledCalculate(container);
    if (!ui.lastResult) {
      Notifier.toast(i18n.t('noResultToExport'), 'warning');
      return;
    }
    const items = ui
      .getMaterialEntries(ui.lastResult.materials)
      .filter((entry) => entry.itemHrid !== '/items/coin' && entry.missing > 0)
      .map((entry) => ({
        itemId: entry.itemHrid,
        name: DataHub.resolveItemName(entry.itemHrid),
        iconRef: entry.itemHrid,
        quantity: Math.ceil(entry.missing),
        source: 'mst_house'
      }));
    if (!items.length) {
      Notifier.toast(i18n.t('enoughMaterials'), 'info');
      return;
    }
    const response = MarketMateBridge.addToCart(items);
    if (!response?.ok || !response.added) {
      Notifier.toast(response?.error || i18n.t('abilityBooksCartFailed'), 'error');
      return;
    }
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    Notifier.toast(
      i18n.t('addMissingToCartDone', response.added || 0, quantity.toLocaleString(i18n.locale)),
      'success'
    );
  }
};

// house-calculator-material-summary
const houseCalculatorMaterialSummary = {
  getMaterialEntries(ui, materials) {
    const {DataHub, CharacterDataService} = HouseCalculatorUI.ctx;
    const sortByIndex = (a, b) => {
      const indexA = DataHub.getItemDetail(a.itemHrid)?.sortIndex ?? 9999;
      const indexB = DataHub.getItemDetail(b.itemHrid)?.sortIndex ?? 9999;
      return indexA - indexB;
    };
    const entries = Object.entries(materials).map(
      ([
        itemHrid, count
      ]) => {
        const available = CharacterDataService.getInventoryCount(itemHrid);
        const missing = Math.max(0, count - available);
        const marketPrice = ui.marketDataService.getPrice(itemHrid);
        const totalValue = count * marketPrice;
        const valueGap = itemHrid === '/items/coin' ? 0 : missing * marketPrice;
        return {itemHrid, count, available, missing, marketPrice, totalValue, valueGap};
      }
    );
    const existingEntries = entries.filter((entry) => entry.missing === 0).sort(sortByIndex);
    const neededEntries = entries.filter((entry) => entry.missing > 0).sort(sortByIndex);
    return existingEntries.concat(neededEntries);
  },

  getMaterialSummary(materialEntries) {
    return materialEntries.reduce(
      (summary, entry) => {
        summary.materialKinds += 1;
        summary.totalValue += entry.totalValue;
        summary.valueGap += entry.valueGap;
        if (entry.itemHrid === '/items/coin') {
          summary.requiredCoins += entry.count;
        } else {
          summary.missingCount += entry.missing;
          summary.materialValue += entry.totalValue;
        }
        return summary;
      },
      {materialKinds: 0, missingCount: 0, totalValue: 0, valueGap: 0, requiredCoins: 0, materialValue: 0}
    );
  }
};

// house-calculator-result-display
const houseCalculatorResultDisplay = {
  displayResults(ui, container, materials, roomDetails) {
    const {i18n, utils} = HouseCalculatorUI.ctx;
    const resultsText = container.querySelector('#mst-hccp-results-text');
    const useHrid = container.querySelector('input[name="display-format"]:checked').value === 'hrid';

    let output =
      i18n.t('upgradedHouses') +
      '\n' +
      roomDetails
        .map((detail) => {
          if (detail.error) {
            const name = useHrid ? detail.hrid : utils.getHouseName(detail.hrid);
            return '• ' + name + ' (' + i18n.t('error') + ': ' + detail.error + ')';
          }
          const name = useHrid ? detail.hrid : utils.getHouseName(detail.hrid);
          return '• ' + name + ' (' + detail.fromLevel + '->' + detail.toLevel + ')';
        })
        .join('\n') +
      '\n\n';

    const materialEntries = this.getMaterialEntries(ui, materials);
    const summary = this.getMaterialSummary(materialEntries);
    const existingEntries = materialEntries.filter((entry) => entry.missing === 0);
    const neededEntries = materialEntries.filter((entry) => entry.missing > 0);

    output += i18n.t('summaryInfo') + '\n';
    output += '• ' + i18n.t('marketDataTime') + ': ' + ui.marketDataService.getUpdatedText() + '\n';
    output += '• ' + i18n.t('csvMaterialKinds') + ': ' + summary.materialKinds.toLocaleString(i18n.locale) + '\n';
    output += '• ' + i18n.t('csvMissingCount') + ': ' + summary.missingCount.toLocaleString(i18n.locale) + '\n';
    output += '• ' + i18n.t('csvTotalValue') + ': ' + this.formatCompactNumber(summary.totalValue) + '\n';
    output += '• ' + i18n.t('csvRequiredCoins') + ': ' + this.formatCompactNumber(summary.requiredCoins) + '\n';
    output += '• ' + i18n.t('csvMaterialValue') + ': ' + this.formatCompactNumber(summary.materialValue) + '\n';
    output += '• ' + i18n.t('csvValueGap') + ': ' + this.formatCompactNumber(summary.valueGap) + '\n\n';
    output += i18n.t('existingMaterials') + '\n';

    if (existingEntries.length === 0) {
      output += '• ' + i18n.t('noExistingMaterials') + '\n\n';
    } else {
      existingEntries.forEach((entry) => {
        output += this.formatMaterialResultLine(entry, useHrid) + '\n';
      });
      output += '\n';
    }

    output += i18n.t('requiredMaterials') + '\n';

    if (neededEntries.length === 0) {
      output += '• ' + i18n.t('enoughMaterials');
    } else {
      neededEntries.forEach((entry) => {
        output += this.formatMaterialResultLine(entry, useHrid) + '\n';
      });
    }

    resultsText.value = output;
  }
};

// house-calculator-result-formatters
const houseCalculatorResultFormatters = {
  escapeCsvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  },

  formatCompactNumber(value) {
    const number = Number(value) || 0;
    const abs = Math.abs(number);
    const units = [
      {value: 1e12, suffix: 'T'}, {value: 1e9, suffix: 'B'}, {value: 1e6, suffix: 'M'}, {value: 1e3, suffix: 'K'}
    ];
    const unit = units.find((item) => abs >= item.value);
    if (!unit) return number.toFixed(2).replace(/\.?0+$/, '');
    return (number / unit.value).toFixed(2).replace(/\.?0+$/, '') + unit.suffix;
  },

  formatMaterialCount(itemHrid, value) {
    const {i18n} = HouseCalculatorUI.ctx;
    return itemHrid === '/items/coin' ? this.formatCompactNumber(value) : value.toLocaleString(i18n.locale);
  },

  formatMaterialResultLine(entry, useHrid) {
    const {i18n, utils} = HouseCalculatorUI.ctx;
    const costDisplay =
      entry.valueGap > 0
        ? ' (' + i18n.t('value') + ': ' + this.formatCompactNumber(entry.valueGap) + ' ' + i18n.t('coins') + ')'
        : '';
    const displayName = useHrid ? entry.itemHrid : utils.getItemName(entry.itemHrid);
    return (
      '• ' +
      displayName +
      ': ' +
      i18n.t('need') +
      ' ' +
      this.formatMaterialCount(entry.itemHrid, entry.missing) +
      ' (' +
      i18n.t('now') +
      ' ' +
      this.formatMaterialCount(entry.itemHrid, entry.available) +
      '/' +
      this.formatMaterialCount(entry.itemHrid, entry.count) +
      ')' +
      costDisplay
    );
  }
};

// house-calculator-results
const houseCalculatorResults = {
  ...houseCalculatorResultFormatters,
  ...houseCalculatorMaterialSummary,
  ...houseCalculatorCsvExport,
  ...houseCalculatorResultDisplay
};

// house-calculator-room-controller
const houseCalculatorRoomController = {
  toggleRoomSelected(ui, checkbox) {
    const roomDiv = checkbox.closest('.mst-hccp-room-checkbox');
    roomDiv.classList.toggle('mst-hccp-room-selected', checkbox.checked);
    ui.updateSelectAllState(checkbox.closest('#mst-hccp-house-calculator'));
  },

  updateSelectAllState(container) {
    if (!container) return;
    [
      'life', 'combat'
    ].forEach((group) => {
      const selectAll = container.querySelector('#mst-hccp-select-' + group);
      const checkboxes = Array.from(
        container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"][data-group="' + group + '"]')
      );
      if (!selectAll || checkboxes.length === 0) return;
      const checkedCount = checkboxes.filter((cb) => cb.checked).length;
      selectAll.checked = checkedCount === checkboxes.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    });
  },

  refreshToLevelOptions(fromSelect) {
    const {CONFIG, TemplateRenderer, utils} = HouseCalculatorUI.ctx;
    const hrid = fromSelect.getAttribute('data-room');
    const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
    const toSelect = document.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
    const selected = Math.max(fromLevel + 1, parseInt(toSelect.value, 10) || fromLevel + 1);
    TemplateRenderer.renderHtml(
      () => utils.createLevelOptions(fromLevel + 1, CONFIG.MAX_TO_LEVEL, Math.min(CONFIG.MAX_TO_LEVEL, selected)),
      toSelect
    );
  },

  refreshBatchToLevelOptions(container) {
    const {CONFIG, TemplateRenderer, utils} = HouseCalculatorUI.ctx;
    const fromSelect = container.querySelector('#mst-hccp-batch-from-level');
    const toSelect = container.querySelector('#mst-hccp-batch-to-level');
    const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
    const selected = Math.max(fromLevel + 1, parseInt(toSelect.value, 10) || fromLevel + 1);
    TemplateRenderer.renderHtml(
      () => utils.createLevelOptions(fromLevel + 1, CONFIG.MAX_TO_LEVEL, Math.min(CONFIG.MAX_TO_LEVEL, selected)),
      toSelect
    );
  },

  toggleAllRooms(ui, container, group) {
    const selectAll = container.querySelector('#mst-hccp-select-' + group);
    const checkboxes = Array.from(
      container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"][data-group="' + group + '"]')
    );
    const targetChecked = selectAll.checked;
    checkboxes.forEach((cb) => {
      cb.checked = targetChecked;
      ui.toggleRoomSelected(cb);
    });
    ui.updateSelectAllState(container);
    ui.scheduleCalculate(container);
  },

  refreshRoomLevels(ui, container) {
    const {TemplateRenderer} = HouseCalculatorUI.ctx;
    const checkedHrids = new Set(
      Array.from(container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')).map(
        (cb) => cb.value
      )
    );
    const roomState = ui.getRoomLevelsFromUI();
    ui.currentRoomLevels = roomState.roomLevels;
    ui.roomIcons = roomState.roomIcons;

    const roomsContainer = container.querySelector('#mst-hccp-rooms-container');
    TemplateRenderer.renderHtml(() => ui.renderRooms(), roomsContainer);
    roomsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = checkedHrids.has(checkbox.value);
      checkbox.addEventListener('change', () => {
        ui.toggleRoomSelected(checkbox);
        ui.scheduleCalculate(container);
      });
      ui.toggleRoomSelected(checkbox);
    });
    roomsContainer.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach((select) => {
      select.addEventListener('change', () => {
        ui.refreshToLevelOptions(select);
        ui.scheduleCalculate(container);
      });
    });
    roomsContainer.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach((select) => {
      select.addEventListener('change', () => ui.scheduleCalculate(container));
    });
    ui.updateSelectAllState(container);
    ui.scheduleCalculate(container);
  },

  applyBatchFromLevel(ui, container) {
    const batchFromLevel = parseInt(container.querySelector('#mst-hccp-batch-from-level').value, 10);
    container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach((fromSelect) => {
      fromSelect.value = String(batchFromLevel);
      ui.refreshToLevelOptions(fromSelect);
    });
    ui.scheduleCalculate(container);
  },

  applyBatchToLevel(ui, container) {
    const {CONFIG, utils} = HouseCalculatorUI.ctx;
    const batchToLevel = utils.clampLevel(
      container.querySelector('#mst-hccp-batch-to-level').value,
      2,
      CONFIG.MAX_TO_LEVEL
    );
    container.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach((toSelect) => {
      const hrid = toSelect.getAttribute('data-room');
      const fromSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]');
      const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
      toSelect.value = String(Math.max(batchToLevel, fromLevel + 1));
    });
    ui.scheduleCalculate(container);
  },

  getRoomLevelsFromUI(ui) {
    const {CONFIG, DataHub, CharacterDataService, utils} = HouseCalculatorUI.ctx;
    const roomLevels = {};
    const roomIcons = {...ui.roomIcons};
    const roomDivs = document.querySelectorAll('[class*="HousePanel_housePanel__"] [class*="HousePanel_houseRoom__"]');
    const houseSpriteUrl =
      utils.getSvgSpriteUrl('[class*="HousePanel_houseRoom__"] svg use') ||
      utils.getSpriteUrl('misc') ||
      '/static/media/misc_sprite.cfad291b.svg';
    const houseNameToHrid = new Map();

    Object.entries(ui.houseDetails).forEach(
      ([
        hrid, detail
      ]) => {
        const names = [
          detail?.name, detail?.nameZh, DataHub.clientData.indexes.houseHridToNameEn?.get(hrid), DataHub.clientData.indexes.houseHridToNameZh?.get(hrid)
        ];
        names.forEach((name) => {
          if (name) houseNameToHrid.set(String(name).trim(), hrid);
        });
      }
    );

    roomDivs.forEach((div) => {
      const nameElement = div.querySelector('[class*="HousePanel_name__"]');
      const levelElement = div.querySelector('[class*="HousePanel_level__"]');
      const iconElement = div.querySelector('svg use');
      if (!nameElement || !levelElement) return;

      const name = nameElement.textContent.trim();
      const levelMatch = levelElement.textContent.match(/\d+/);
      const level = levelMatch ? parseInt(levelMatch[0], 10) : CONFIG.MIN_FROM_LEVEL;
      const iconHref = utils.getSvgUseHref(iconElement);
      const iconFragment = iconHref?.split('#').pop() || '';
      // 游戏房屋图标固定使用 #house_<room-id>，直接还原 HRID 可避开语言和 CSS 哈希变化。
      const iconHrid = iconFragment.startsWith('house_') ? '/house_rooms/' + iconFragment.slice('house_'.length) : null;
      const hrid = (iconHrid && ui.houseDetails[iconHrid] ? iconHrid : null) || houseNameToHrid.get(name);

      if (hrid) {
        roomLevels[hrid] = level;
        if (iconHref) roomIcons[hrid] = iconHref;
      }
    });

    // 与 PGE 的图标解析方式一致：从当前页面获取带实时 hash 的 sprite 路径。
    if (houseSpriteUrl) {
      Object.keys(ui.houseDetails).forEach((hrid) => {
        if (!roomIcons[hrid]) {
          roomIcons[hrid] = houseSpriteUrl + '#house_' + utils.substrLastSlash(hrid);
        }
      });
    }

    const characterHouseRoomMap = CharacterDataService.raw?.characterHouseRoomMap || {};
    Object.entries(characterHouseRoomMap).forEach(
      ([
        hrid, data
      ]) => {
        if (!roomLevels[hrid] && ui.houseDetails[hrid]) {
          roomLevels[hrid] = utils.clampLevel(
            data?.level || CONFIG.MIN_FROM_LEVEL,
            CONFIG.MIN_FROM_LEVEL,
            CONFIG.MAX_FROM_LEVEL
          );
        }
      }
    );

    return {roomLevels, roomIcons};
  }
};

// house-calculator-view
const houseCalculatorView = {
  render(ui) {
    const {CONFIG, MarketMateBridge, i18n, utils} = HouseCalculatorUI.ctx;
    return [
      '<div class="mst-hccp-calculator-body">', '<div class="mst-hccp-calculator-toolbar">', '  <div class="mst-hccp-select-groups">', '  <label class="mst-hccp-select-all-label"><input type="checkbox" id="mst-hccp-select-life"> ' + utils.escapeHtml(i18n.t('selectLife')) + '</label>', '  <label class="mst-hccp-select-all-label"><input type="checkbox" id="mst-hccp-select-combat"> ' + utils.escapeHtml(i18n.t('selectCombat')) + '</label>',
      '</div>', '  <div class="mst-hccp-toolbar-actions">', '  <div class="mst-hccp-batch-level">', '    <select id="mst-hccp-batch-from-level" class="mst-hccp-level-input mst-hccp-batch-level-input" title="' + utils.escapeHtml(i18n.t('batchStart')) + '">' + utils.createLevelOptions(CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL, CONFIG.MIN_FROM_LEVEL) + '</select>', '      <span class="mst-hccp-level-arrow">→</span>',
      '    <select id="mst-hccp-batch-to-level" class="mst-hccp-level-input mst-hccp-batch-level-input" title="' +
        utils.escapeHtml(i18n.t('batchTarget')) +
        '">' +
        utils.createLevelOptions(2, CONFIG.MAX_TO_LEVEL, CONFIG.MAX_TO_LEVEL) +
        '</select>', '</div>', '  <button id="mst-hccp-refresh-levels">' + utils.escapeHtml(i18n.t('refreshLevels')) + '</button>', '</div>', '</div>',
      '<div id="mst-hccp-rooms-container">' +
        this.renderRooms(ui) +
        '</div>', '<div class="mst-hccp-output-actions">', '  <div class="mst-hccp-display-option">', '  <span>' + utils.escapeHtml(i18n.t('itemDisplayFormat')) + '</span>', '  <label><input type="radio" name="display-format" value="name" checked> ' + utils.escapeHtml(i18n.t('name')) + '</label>',
      '  <label><input type="radio" name="display-format" value="hrid"> HRID</label>', '</div>', '  <div class="mst-hccp-output-buttons">', '    <button id="mst-hccp-export-csv">' + utils.escapeHtml(i18n.t('exportCsv')) + '</button>', MarketMateBridge.isReady() ? '    <button id="mst-hccp-add-to-cart" title="' + utils.escapeHtml(i18n.t('addMissingToCartTitle')) + '">' + utils.escapeHtml(i18n.t('addMissingToCart')) + '</button>' : '',
      '</div>', '</div>', '<textarea id="mst-hccp-results-text" readonly placeholder="' + utils.escapeHtml(i18n.t('resultPlaceholder')) + '"></textarea>', '</div>'
    ].join('');
  },

  renderRooms(ui) {
    const {CONFIG, i18n, utils} = HouseCalculatorUI.ctx;
    return Object.keys(ui.houseDetails)
      .sort((a, b) => {
        const sortA = ui.houseDetails[a]?.sortIndex ?? 9999;
        const sortB = ui.houseDetails[b]?.sortIndex ?? 9999;
        return sortA - sortB || a.localeCompare(b);
      })
      .map((hrid, index) => {
        const room = ui.houseDetails[hrid];
        if (!room) return '';
        const houseGroup = index < 10 ? 'life' : 'combat';
        const currentLevel = utils.clampLevel(
          ui.currentRoomLevels[hrid] || CONFIG.MIN_FROM_LEVEL,
          CONFIG.MIN_FROM_LEVEL,
          CONFIG.MAX_FROM_LEVEL
        );
        const toLevel = Math.min(CONFIG.MAX_TO_LEVEL, currentLevel + 1);
        const iconHref = ui.roomIcons[hrid] || '';
        const iconHtml = iconHref
          ? '<span class="mst-hccp-room-icon"><svg role="img" aria-label="' +
            utils.escapeHtml(i18n.t('roomIcon')) +
            '" width="1em" height="1em" class="Icon_icon__2LtL_ Icon_small__2bxvH"><use href="' +
            utils.escapeHtml(iconHref) +
            '"></use></svg></span>'
          : '';
        return [
          '<div class="mst-hccp-room-checkbox" data-hrid="' +
            utils.escapeHtml(hrid) +
            '">', '  <div class="mst-hccp-room-row">', '    <label class="mst-hccp-room-left">', '      <input type="checkbox" value="' + utils.escapeHtml(hrid) + '" data-group="' + houseGroup + '">', iconHtml,
          '      <span class="mst-hccp-room-name">' +
            utils.escapeHtml(utils.getHouseName(hrid)) +
            '</span>', '</label>', '    <div class="mst-hccp-room-levels">', '      <select class="mst-hccp-level-input" data-room="' + utils.escapeHtml(hrid) + '" data-type="from">' + utils.createLevelOptions(CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL, currentLevel) + '</select>', '      <span class="mst-hccp-level-arrow">→</span>',
          '      <select class="mst-hccp-level-input" data-room="' +
            utils.escapeHtml(hrid) +
            '" data-type="to">' +
            utils.createLevelOptions(currentLevel + 1, CONFIG.MAX_TO_LEVEL, toLevel) +
            '</select>', '</div>', '</div>', '</div>'
        ].join('');
      })
      .join('');
  }
};

// house-calculator-ui
export class HouseCalculatorUI {
  static ctx = null;
  static Notifier = null;
  static calculationController = null;
  static eventController = null;
  static marketController = null;
  static results = null;
  static roomController = null;
  static view = null;

  static configure(ctx, Notifier) {
    this.ctx = ctx;
    this.Notifier = Notifier;
    this.calculationController = houseCalculatorCalculationController;
    this.eventController = houseCalculatorEventController;
    this.marketController = houseCalculatorMarketController;
    this.results = houseCalculatorResults;
    this.roomController = houseCalculatorRoomController;
    this.view = houseCalculatorView;
  }

  constructor(houseDetailMap, calculator, marketDataService) {
    this.houseDetails = houseDetailMap;
    this.calculator = calculator;
    this.marketDataService = marketDataService;
    this.currentRoomLevels = {};
    this.roomIcons = {};
    this.lastResult = null;
    this.autoCalculateTimer = null;
    this.helpController = null;
  }

  create() {
    const {CalculatorHelpPopover, MarketMateBridge, TemplateRenderer, i18n} = this.constructor.ctx;
    const {Notifier} = this.constructor;
    this.clearPendingCalculate();
    this.lastResult = null;
    const old = document.getElementById('mst-hccp-house-calculator');
    if (old) {
      if (typeof Swal !== 'undefined' && Swal.getPopup?.()?.contains(old)) Swal.close();
      else old.remove();
    }

    const roomState = this.getRoomLevelsFromUI();
    this.currentRoomLevels = roomState.roomLevels;
    this.roomIcons = roomState.roomIcons;
    this.injectStyles();

    return Notifier.html({
      title: i18n.t('title'),
      html: () => TemplateRenderer.html`<div id="mst-hccp-house-calculator"></div>`,
      width: '27rem',
      popupClass: 'mst-house-calculator-dialog',
      didOpen: (popup) => {
        const container = popup.querySelector('#mst-hccp-house-calculator');
        if (!container) return;
        TemplateRenderer.renderHtml(() => this.render(), container);
        this.bindEvents(container);
        this.helpController?.cleanup();
        this.helpController = CalculatorHelpPopover.mount({
          popup,
          moduleName: 'house',
          title: i18n.t('houseCalculatorHelpTitle'),
          heading: i18n.t('title'),
          content: i18n.t('houseCalculatorHelp')
        });
        MarketMateBridge.onReady(() => this.ensureMarketMateButton(container));
      },
      willClose: () => {
        this.helpController?.cleanup();
        this.helpController = null;
        this.clearPendingCalculate();
      }
    });
  }

  injectStyles() {
    StyleService.ensure('mst-hccp-style', MST_HOUSE_CALCULATOR_CSS);
  }

  render() {
    return this.constructor.view.render(this);
  }

  renderRooms() {
    return this.constructor.view.renderRooms(this);
  }

  bindEvents(container) {
    return this.constructor.eventController.bindEvents(this, container);
  }

  bindMarketMateButton(container) {
    return this.constructor.marketController.bindMarketMateButton(this, container);
  }

  ensureMarketMateButton(container) {
    return this.constructor.marketController.ensureMarketMateButton(this, container);
  }

  addMissingMaterialsToCart(container) {
    return this.constructor.marketController.addMissingMaterialsToCart(this, container);
  }

  rerenderForLanguage(container, nextLang) {
    const {CalculatorHelpPopover, TemplateRenderer, i18n} = this.constructor.ctx;
    if (nextLang !== 'zh' && nextLang !== 'en') return;
    if (!i18n.setLanguage(nextLang)) return;
    const checkedHrids = new Set(
      Array.from(container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')).map(
        (cb) => cb.value
      )
    );
    const roomLevels = {};
    container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach((fromSelect) => {
      const hrid = fromSelect.getAttribute('data-room');
      const toSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
      roomLevels[hrid] = {fromLevel: parseInt(fromSelect.value, 10), toLevel: parseInt(toSelect.value, 10)};
    });
    const displayFormat = container.querySelector('input[name="display-format"]:checked')?.value || 'name';

    TemplateRenderer.renderHtml(() => this.render(), container);
    this.bindEvents(container);
    const popup = container.closest('.swal2-popup');
    const swalTitle = popup?.querySelector('.swal2-title');
    if (swalTitle) swalTitle.textContent = i18n.t('title');
    if (popup) {
      this.helpController?.cleanup();
      this.helpController = CalculatorHelpPopover.mount({
        popup,
        moduleName: 'house',
        title: i18n.t('houseCalculatorHelpTitle'),
        heading: i18n.t('title'),
        content: i18n.t('houseCalculatorHelp')
      });
    }

    Object.entries(roomLevels).forEach(
      ([
        hrid, levels
      ]) => {
        const fromSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]');
        if (!fromSelect) return;
        fromSelect.value = String(levels.fromLevel);
        this.refreshToLevelOptions(fromSelect);
        const toSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
        if (toSelect) toSelect.value = String(levels.toLevel);
      }
    );
    container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = checkedHrids.has(checkbox.value);
      this.toggleRoomSelected(checkbox);
    });
    const displayInput = container.querySelector('input[name="display-format"][value="' + displayFormat + '"]');
    if (displayInput) displayInput.checked = true;
    const triggerBtn = document.getElementById('mst-hccp-house-calculator-trigger');
    if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
  }

  toggleRoomSelected(checkbox) {
    return this.constructor.roomController.toggleRoomSelected(this, checkbox);
  }

  updateSelectAllState(container) {
    return this.constructor.roomController.updateSelectAllState(container);
  }

  refreshToLevelOptions(fromSelect) {
    return this.constructor.roomController.refreshToLevelOptions(fromSelect);
  }

  refreshBatchToLevelOptions(container) {
    return this.constructor.roomController.refreshBatchToLevelOptions(container);
  }

  toggleAllRooms(container, group) {
    return this.constructor.roomController.toggleAllRooms(this, container, group);
  }

  refreshRoomLevels(container) {
    return this.constructor.roomController.refreshRoomLevels(this, container);
  }

  applyBatchFromLevel(container) {
    return this.constructor.roomController.applyBatchFromLevel(this, container);
  }

  applyBatchToLevel(container) {
    return this.constructor.roomController.applyBatchToLevel(this, container);
  }

  scheduleCalculate(container) {
    return this.constructor.calculationController.scheduleCalculate(this, container);
  }

  clearPendingCalculate() {
    return this.constructor.calculationController.clearPendingCalculate(this);
  }

  flushScheduledCalculate(container) {
    return this.constructor.calculationController.flushScheduledCalculate(this, container);
  }

  calculateSelectedRooms(container) {
    return this.constructor.calculationController.calculateSelectedRooms(this, container);
  }

  refreshResultDisplay(container) {
    return this.constructor.calculationController.refreshResultDisplay(this, container);
  }

  escapeCsvCell(value) {
    return this.constructor.results.escapeCsvCell(value);
  }

  formatCompactNumber(value) {
    return this.constructor.results.formatCompactNumber(value);
  }

  formatMaterialCount(itemHrid, value) {
    return this.constructor.results.formatMaterialCount(itemHrid, value);
  }

  getMaterialEntries(materials) {
    return this.constructor.results.getMaterialEntries(this, materials);
  }

  getMaterialSummary(materialEntries) {
    return this.constructor.results.getMaterialSummary(materialEntries);
  }

  exportCsv(container) {
    this.constructor.results.exportCsv(this, container);
  }

  formatMaterialResultLine(entry, useHrid) {
    return this.constructor.results.formatMaterialResultLine(entry, useHrid);
  }

  displayResults(container, materials, roomDetails) {
    this.constructor.results.displayResults(this, container, materials, roomDetails);
  }

  getRoomLevelsFromUI() {
    return this.constructor.roomController.getRoomLevelsFromUI(this);
  }
}

// house-calculator-launcher
export class HouseCalculatorLauncher {
  static ctx = null;

  static configure(ctx) {
    this.ctx = ctx;
  }

  constructor() {
    this.isInitialized = false;
    this.domObserver = null;
    this.houseCalculatorUI = null;
  }

  getHouseCalculatorUI() {
    return this.houseCalculatorUI;
  }

  addTriggerButton() {
    const {GameUiAdapter, i18n} = this.constructor.ctx;
    const housePanel = GameUiAdapter.query('housePanel');
    if (!housePanel || document.getElementById('mst-hccp-house-calculator-trigger')) return;

    const targetButton = GameUiAdapter.query('gameButton', housePanel) || housePanel.querySelector('button');
    let buttonContainer = GameUiAdapter.query('houseButtonContainer', housePanel) || targetButton?.parentElement;
    if (!buttonContainer) {
      const title = GameUiAdapter.query('houseTitle', housePanel);
      buttonContainer = document.createElement('div');
      buttonContainer.className = 'mst-hccp-trigger-container';
      title?.insertAdjacentElement('afterend', buttonContainer);
    }

    if (!buttonContainer) return;

    const triggerBtn = document.createElement('button');
    triggerBtn.className = targetButton?.className || 'Button_button__1Fe9z';
    triggerBtn.id = 'mst-hccp-house-calculator-trigger';
    triggerBtn.style.marginLeft = '10px';
    triggerBtn.textContent = i18n.t('trigger');

    triggerBtn.addEventListener('click', async () => this.openCalculator(triggerBtn));

    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.style.flexWrap = 'wrap';
    buttonContainer.style.gap = '10px';
    triggerBtn.style.marginLeft = targetButton ? '0' : '';
    if (targetButton?.parentNode === buttonContainer) {
      buttonContainer.insertBefore(triggerBtn, targetButton.nextSibling);
    } else {
      buttonContainer.appendChild(triggerBtn);
    }
  }

  async openCalculator(triggerBtn = null) {
    const {DataHub, i18n, marketDataService, houseCalculator, houseDetails, HouseCalculatorUI, Notifier} =
      this.constructor.ctx;
    try {
      if (!this.isInitialized) {
        if (triggerBtn) triggerBtn.textContent = i18n.t('marketLoading');
        DataHub.initClientDataFromCache();
        if (!DataHub.hasHouseRoomData()) {
          throw new Error('initClientData houseRoomDetailMap is not ready');
        }
        await marketDataService.load();
        this.houseCalculatorUI = new HouseCalculatorUI(houseDetails, houseCalculator, marketDataService);
        this.houseCalculatorUI.create();
        this.isInitialized = true;
        if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
        return;
      }

      if (!document.getElementById('mst-hccp-house-calculator')) this.houseCalculatorUI.create();
    } catch (error) {
      if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
      console.error('[HCCP] 初始化失败:', error);
      Notifier.alert(i18n.t('initFailed'), 'error');
    }
  }

  observeDOM() {
    const {CONFIG, GameUiAdapter, utils} = this.constructor.ctx;
    if (!CONFIG.isGameSite || this.domObserver) return;
    this.domObserver = utils.observeBody(() => {
      // 检查房屋面板是否存在，以及我们的触发按钮是否不存在。
      if (GameUiAdapter.query('housePanel') && !document.getElementById('mst-hccp-house-calculator-trigger')) {
        this.addTriggerButton();
      }
    });
    window.addEventListener('beforeunload', () => this.domObserver?.disconnect(), {once: true});
  }
}
