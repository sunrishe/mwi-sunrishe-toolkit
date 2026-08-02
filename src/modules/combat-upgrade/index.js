import {CombatUpgradePlanner} from './planner.js';

// combat-upgrade-dialog-view
const combatUpgradeDialogView = {
  getProfessionGridHtml(feature) {
    const {CharacterDataService, i18n, utils} = feature.ctx;
    return CharacterDataService.getCombatSkills()
      .map((entry) => {
        const skillHrid = entry.detail.hrid;
        const level = Number(entry.characterSkill?.level || 0);
        return `<button type="button" class="mst-combat-profession" data-skill-hrid="${utils.escapeHtml(skillHrid)}" title="${utils.escapeHtml(i18n.t('doubleClickToAdd'))}">
    <svg aria-hidden="true"><use href="${utils.escapeHtml(feature.getSkillIconHref(skillHrid))}"></use></svg>
    <strong>${utils.escapeHtml(feature.getSkillName(skillHrid))}</strong>
    <small>Lv.${level}</small>
  </button>`;
      })
      .join('');
  },

  getDialogHtml(feature) {
    const {i18n, utils} = feature.ctx;
    return `
  <div class="mst-upgrade-calculator mst-combat-upgrade-calculator">
    <div class="mst-calculator-toolbar">
      <label>${utils.escapeHtml(i18n.t('primaryXpRate'))}        <input data-field="primary-rate" type="number" min="0" step="0.1" inputmode="decimal"></label>
      <label>${utils.escapeHtml(i18n.t('secondaryXpRate'))}        <input data-field="secondary-rate" type="number" min="0" step="0.1" inputmode="decimal"></label>
      <label>${utils.escapeHtml(i18n.t('optionalEph'))}        <input data-field="eph" type="number" min="0" step="0.1" inputmode="decimal"></label>
      <button type="button" class="mst-calculator-reset">${utils.escapeHtml(i18n.t('resetList'))}</button>
    </div>
    <div class="mst-combat-profession-picker">
      ${feature.getProfessionGridHtml()}
    </div>
    <div class="mst-calculator-table-wrap">
      <table class="mst-calculator-table">
        <thead><tr>
            <th>${utils.escapeHtml(i18n.t('order'))}</th>
            <th>${utils.escapeHtml(i18n.t('profession'))}</th>
            <th>${utils.escapeHtml(i18n.t('currentLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('startLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('targetLevel'))}</th>
            <th>${utils.escapeHtml(i18n.t('trainingType'))}</th>
            <th>${utils.escapeHtml(i18n.t('hourlyExperience'))}</th>
            <th>${utils.escapeHtml(i18n.t('totalHours'))}</th>
            <th>${utils.escapeHtml(i18n.t('estimatedUpgradeTime'))}</th>
            <th data-runs-column hidden>${utils.escapeHtml(i18n.t('totalRuns'))}</th>
            <th>${utils.escapeHtml(i18n.t('actions'))}</th>
          </tr></thead>
        <tbody></tbody>
        <tfoot><tr>
            <th colspan="7">${utils.escapeHtml(i18n.t('total'))}</th>
            <td><span class="mst-combat-total-duration" data-summary="duration" title="0h">0${i18n.t('dayUnit')}</span></td>
            <td data-summary="time">-</td>
            <td data-summary="runs" data-runs-column hidden>0</td>
            <td></td>
          </tr></tfoot>
      </table>
    </div>
  </div>`;
  },

  mountHelpPopover(feature, popup) {
    const {CalculatorHelpPopover, i18n} = feature.ctx;
    feature.helpController?.cleanup();
    feature.helpController = CalculatorHelpPopover.mount({
      popup,
      moduleName: 'combat',
      title: i18n.t('combatCalculatorHelpTitle'),
      heading: i18n.t('combatUpgradeCalculator'),
      content: i18n.t('combatCalculatorHelp')
    });
  }
};

// combat-upgrade-drag-events
const combatUpgradeDragEvents = {
  bind(feature, popup, listenerOptions) {
    const tbody = popup.querySelector('tbody');
    let draggedRowId = 0;
    // 只允许从序号单元格拖动，避免输入框选中文本时误触排序。
    tbody.addEventListener(
      'dragstart',
      (event) => {
        const dragHandle = event.target.closest('.mst-sequence-cell[draggable="true"]');
        const rowElement = dragHandle?.closest('[data-row-id]');
        if (!dragHandle || !rowElement) {
          event.preventDefault();
          return;
        }
        draggedRowId = Number(rowElement.dataset.rowId);
        rowElement.classList.add('mst-row-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedRowId));
      },
      listenerOptions
    );
    tbody.addEventListener(
      'dragover',
      (event) => {
        if (!draggedRowId || !event.target.closest('[data-row-id]')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      listenerOptions
    );
    tbody.addEventListener(
      'drop',
      (event) => {
        draggedRowId = this.handleDrop(feature, event, draggedRowId);
      },
      listenerOptions
    );
    tbody.addEventListener(
      'dragend',
      () => {
        draggedRowId = 0;
        tbody.querySelectorAll('.mst-row-dragging').forEach((row) => row.classList.remove('mst-row-dragging'));
      },
      listenerOptions
    );
  },

  handleDrop(feature, event, draggedRowId) {
    const targetElement = event.target.closest('[data-row-id]');
    if (!draggedRowId || !targetElement) return draggedRowId;
    event.preventDefault();
    const sourceIndex = feature.rows.findIndex((row) => row.id === draggedRowId);
    const targetId = Number(targetElement.dataset.rowId);
    let insertIndex = feature.rows.findIndex((row) => row.id === targetId);
    if (sourceIndex < 0 || insertIndex < 0 || sourceIndex === insertIndex) return draggedRowId;
    const insertAfter = event.clientY > targetElement.getBoundingClientRect().top + targetElement.offsetHeight / 2;
    const [
      movedRow
    ] = feature.rows.splice(sourceIndex, 1);
    if (sourceIndex < insertIndex) insertIndex--;
    if (insertAfter) insertIndex++;
    feature.rows.splice(insertIndex, 0, movedRow);
    feature.renderRows();
    return 0;
  }
};

// combat-upgrade-input-events
const combatUpgradeInputEvents = {
  bind(feature, popup, listenerOptions) {
    popup.querySelector('.mst-calculator-reset').addEventListener(
      'click',
      () => {
        feature.resetState(true);
        feature.renderRows();
      },
      listenerOptions
    );
    popup.querySelector('.mst-combat-profession-picker').addEventListener(
      'dblclick',
      (event) => {
        const profession = event.target.closest('[data-skill-hrid]');
        const skillHrid = profession?.dataset.skillHrid;
        if (!skillHrid) return;
        feature.rows.push(feature.createRow(skillHrid));
        feature.renderRows();
      },
      listenerOptions
    );
    this.bindRowInputEvents(feature, popup, listenerOptions);
    this.bindRowChangeEvents(feature, popup, listenerOptions);
    this.bindRemoveEvents(feature, popup, listenerOptions);
  },

  bindRowInputEvents(feature, popup, listenerOptions) {
    popup.addEventListener(
      'input',
      (event) => {
        if (event.target.matches('.mst-calculator-toolbar input')) feature.recalculate();
        const rowElement = event.target.closest('[data-row-id]');
        const field = event.target.dataset.rowField;
        if (!rowElement || !field || [
            'customStart', 'trainingType', 'concurrentTraining'
          ].includes(field)) return;
        const row = feature.rows.find((item) => item.id === Number(rowElement.dataset.rowId));
        if (!row) return;
        this.updateRowInput(feature, row, field, event.target);
      },
      listenerOptions
    );
  },

  updateRowInput(feature, row, field, target) {
    if (field === 'hourlyExperienceOverride') {
      row.hourlyExperienceOverride = target.value === '' ? null : Math.max(0, Number(target.value) || 0);
      feature.recalculate();
      return;
    }
    if ([
        'startLevel', 'targetLevel'
      ].includes(field)) {
      if (target.value !== '') row[field] = Number(target.value);
      return;
    }
    row[field] = Number(target.value);
    feature.recalculate();
  },

  bindRowChangeEvents(feature, popup, listenerOptions) {
    popup.addEventListener(
      'change',
      (event) => {
        const rowElement = event.target.closest('[data-row-id]');
        if (!rowElement) return;
        const row = feature.rows.find((item) => item.id === Number(rowElement.dataset.rowId));
        if (!row) return;
        this.handleRowChange(feature, row, rowElement, event.target);
      },
      listenerOptions
    );
  },

  handleRowChange(feature, row, rowElement, target) {
    if (target.dataset.rowField === 'customStart') {
      row.customStart = target.checked;
      feature.renderRows();
      return;
    }
    if ([
        'startLevel', 'targetLevel'
      ].includes(target.dataset.rowField)) {
      const field = target.dataset.rowField;
      if (target.value !== '') row[field] = Number(target.value);
      feature.recalculate();
      return;
    }
    if (target.matches('[data-start-level-preset]')) {
      this.applyPresetValue(feature, row, rowElement, target, 'startLevel');
      return;
    }
    if (target.matches('[data-target-level-preset]')) {
      this.applyPresetValue(feature, row, rowElement, target, 'targetLevel');
      return;
    }
    if (target.dataset.rowField === 'trainingType') {
      row.trainingType = target.checked ? 'primary' : 'secondary';
      row.concurrentTraining = false;
      feature.renderRows();
      return;
    }
    if (target.dataset.rowField === 'concurrentTraining') {
      row.concurrentTraining = target.checked;
      feature.renderRows();
    }
  },

  applyPresetValue(feature, row, rowElement, target, field) {
    if (!target.value) return;
    row[field] = Number(target.value);
    rowElement.querySelector(`[data-row-field="${field}"]`).value = target.value;
    target.value = '';
    feature.recalculate();
  },

  bindRemoveEvents(feature, popup, listenerOptions) {
    popup.addEventListener(
      'click',
      (event) => {
        const removeButton = event.target.closest('.mst-row-remove');
        if (!removeButton) return;
        const rowId = Number(removeButton.closest('[data-row-id]')?.dataset.rowId);
        feature.rows = feature.rows.filter((row) => row.id !== rowId);
        feature.renderRows();
      },
      listenerOptions
    );
  }
};

// combat-upgrade-language-refresh
const combatUpgradeLanguageRefresh = {
  refreshLanguage(feature) {
    const {TemplateRenderer, i18n} = feature.ctx;
    const popup = feature.popup;
    if (!popup?.isConnected) return;
    // 语言切换时重绘表头和文案，但保留工具栏输入与表格滚动位置。
    const values = Object.fromEntries(
      [
        'primary-rate', 'secondary-rate', 'eph'
      ].map((field) => [
        field, popup.querySelector(`[data-field="${field}"]`)?.value || ''
      ])
    );
    const oldTable = popup.querySelector('.mst-calculator-table-wrap');
    const scrollPosition = {top: oldTable?.scrollTop || 0, left: oldTable?.scrollLeft || 0};
    const contentRoot = popup.querySelector('.swal2-html-container > div');
    if (!contentRoot) return;
    TemplateRenderer.renderHtml(() => feature.getDialogHtml(), contentRoot);
    const title = popup.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('combatUpgradeCalculator');
    feature.bind(popup);
    this.restoreToolbarValues(popup, values);
    feature.recalculate();
    const table = popup.querySelector('.mst-calculator-table-wrap');
    if (table) {
      table.scrollTop = scrollPosition.top;
      table.scrollLeft = scrollPosition.left;
    }
  },

  restoreToolbarValues(popup, values) {
    Object.entries(values).forEach(
      ([
        field, value
      ]) => {
        const input = popup.querySelector(`[data-field="${field}"]`);
        if (input) input.value = value;
      }
    );
  }
};

// combat-upgrade-events
const combatUpgradeEvents = {
  bind(feature, popup) {
    feature.bindController?.abort();
    feature.bindController = new AbortController();
    const listenerOptions = {signal: feature.bindController.signal};
    feature.popup = popup;
    feature.mountHelpPopover(popup);
    feature.renderRows();
    combatUpgradeInputEvents.bind(feature, popup, listenerOptions);
    combatUpgradeDragEvents.bind(feature, popup, listenerOptions);
  },

  refreshLanguage(feature) {
    return combatUpgradeLanguageRefresh.refreshLanguage(feature);
  }
};

// combat-upgrade-result-view
const combatUpgradeResultView = {
  recalculate(feature) {
    const {i18n, utils} = feature.ctx;
    if (!feature.popup) return;
    // UI 中输入单位是 K/h，计算层统一使用原始经验值。
    const primaryRate = this.getRowRateValue(feature.popup, 'primary-rate');
    const secondaryRate = this.getRowRateValue(feature.popup, 'secondary-rate');
    const eph = Math.max(0, Number(feature.popup.querySelector('[data-field="eph"]')?.value) || 0);
    const plan = feature.calculatePlan(primaryRate, secondaryRate);
    const startedAt = Date.now();
    this.updateHelp(feature, plan, i18n);
    feature.rows.forEach((row) => {
      const rowElement = feature.popup.querySelector(`[data-row-id="${row.id}"]`);
      if (!rowElement) return;
      this.updateRow(
        feature,
        row,
        rowElement,
        plan.results.get(row.id),
        startedAt,
        primaryRate,
        secondaryRate,
        eph,
        i18n,
        utils
      );
    });
    this.updateSummary(feature.popup, plan.totalHours, startedAt, eph, i18n, utils);
  },

  getRowRateValue(popup, field) {
    return Math.max(0, Number(popup.querySelector(`[data-field="${field}"]`)?.value) || 0) * 1000;
  },

  updateHelp(feature, plan, i18n) {
    const missingPrimary = !plan.hasPrimary && feature.rows.length > 0;
    feature.helpController?.setContent(
      missingPrimary
        ? `${i18n.t('combatPrimaryRequired')}\n\n${i18n.t('combatCalculatorHelp')}`
        : i18n.t('combatCalculatorHelp')
    );
    feature.helpController?.setError(missingPrimary);
  },

  updateRow(feature, row, rowElement, result, startedAt, primaryRate, secondaryRate, eph, i18n, utils) {
    this.updateCurrentLevelCell(rowElement, result, i18n);
    const startInput = rowElement.querySelector('[data-row-field="startLevel"]');
    if (startInput) startInput.value = String(result.startLevel);
    const targetInput = rowElement.querySelector('[data-row-field="targetLevel"]');
    if (targetInput) targetInput.value = String(result.targetLevel);
    this.updateDerivedTargetCell(rowElement, result, i18n);
    const rate = feature.getHourlyExperience(row, primaryRate, secondaryRate);
    if (row.hourlyExperienceOverride == null) {
      const rateInput = rowElement.querySelector('[data-row-field="hourlyExperienceOverride"]');
      if (rateInput) rateInput.value = rate > 0 ? String(rate / 1000) : '';
    }
    this.updateDurationCells(rowElement, result, startedAt, eph, i18n, utils);
  },

  updateCurrentLevelCell(rowElement, result, i18n) {
    const currentExperiencePercentText = result.currentState.percent.toLocaleString(i18n.locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
    const currentLevelCell = rowElement.querySelector('[data-current-level-cell]');
    if (!currentLevelCell) return;
    currentLevelCell.title = [
      `${i18n.t('currentLevel')}: ${result.currentState.level}`, `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`, `${i18n.t('currentExperience')}: ${Math.floor(result.currentState.experience).toLocaleString(i18n.locale)}`
    ].join('\n');
    currentLevelCell.querySelector('[data-current-level-value]').textContent = String(result.currentState.level);
    currentLevelCell.querySelector('[data-current-level-percent]').textContent = `${currentExperiencePercentText}%`;
  },

  updateDerivedTargetCell(rowElement, result, i18n) {
    const derivedTargetCell = rowElement.querySelector('[data-derived-target-cell]');
    if (!derivedTargetCell) return;
    const targetLevelElement = derivedTargetCell.querySelector('[data-derived-target-level]');
    const targetPercentElement = derivedTargetCell.querySelector('[data-derived-target-percent]');
    if (!result.endState) {
      targetLevelElement.textContent = '--';
      targetPercentElement.textContent = '--';
      derivedTargetCell.title = '';
      return;
    }
    const targetPercentText = result.endState.percent.toLocaleString(i18n.locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
    targetLevelElement.textContent = String(result.endState.level);
    targetPercentElement.textContent = `${targetPercentText}%`;
    derivedTargetCell.title = [
      `${i18n.t('targetLevel')}: ${result.endState.level}`, `${i18n.t('experiencePercent')}: ${targetPercentText}%`, `${i18n.t('endExperience')}: ${Math.floor(result.endState.experience).toLocaleString(i18n.locale)}`
    ].join('\n');
  },

  updateDurationCells(rowElement, result, startedAt, eph, i18n, utils) {
    const hoursElement = rowElement.querySelector('[data-result="hours"]');
    hoursElement.querySelector('.mst-combat-duration-hours').textContent =
      result.hours == null ? '-' : `${Number(result.hours.toFixed(1))}h`;
    hoursElement.querySelector('.mst-combat-duration-days').textContent =
      result.hours == null ? '' : `${Number((result.hours / 24).toFixed(2))}${i18n.t('dayUnit')}`;
    rowElement.querySelector('[data-result="runs"]').textContent =
      eph > 0 && result.hours != null ? String(Math.round(result.hours * eph)) : '-';
    const estimatedTimeElement = rowElement.querySelector('[data-result="estimatedTime"]');
    estimatedTimeElement.textContent =
      result.completionHours == null ? '-' : utils.formatDateTime(startedAt + result.completionHours * 3600000);
    estimatedTimeElement.title =
      result.startHours == null
        ? ''
        : `${i18n.t('estimatedStartTime')}: ${utils.formatDateTime(startedAt + result.startHours * 3600000)}`;
  },

  updateSummary(popup, finalHours, startedAt, eph, i18n, utils) {
    const durationElement = popup.querySelector('[data-summary="duration"]');
    durationElement.textContent =
      finalHours == null ? '-' : `${Number((finalHours / 24).toFixed(2))}${i18n.t('dayUnit')}`;
    durationElement.title = finalHours == null ? '-' : `${Number(finalHours.toFixed(1))}h`;
    const summaryTimeElement = popup.querySelector('[data-summary="time"]');
    summaryTimeElement.textContent = finalHours == null ? '-' : utils.formatDateTime(startedAt + finalHours * 3600000);
    summaryTimeElement.title =
      finalHours == null ? '' : `${i18n.t('estimatedStartTime')}: ${utils.formatDateTime(startedAt)}`;
    popup.querySelector('[data-summary="runs"]').textContent =
      finalHours == null || eph <= 0 ? '-' : String(Math.round(finalHours * eph));
    popup.querySelectorAll('[data-runs-column]').forEach((element) => {
      element.hidden = eph <= 0;
    });
  }
};

// combat-upgrade-row-html
const combatUpgradeRowHtml = {
  getRowsHtml(feature) {
    const {CharacterDataService, i18n, utils} = feature.ctx;
    feature.rows.forEach((row) => {
      const mode = feature.getTrainingTypeMode(row.skillHrid);
      if (mode !== 'flexible') row.trainingType = mode;
    });
    const primaryRate = this.getRateValue(feature.popup, 'primary-rate');
    const secondaryRate = this.getRateValue(feature.popup, 'secondary-rate');
    const plan = feature.calculatePlan(primaryRate, secondaryRate);
    const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
    // 常用等级覆盖当前版本主要训练断点，完整输入仍由 number 控件支持。
    const levelOptions = [
      35, 50, 55, 65, 75,
      80, 95, 100, 110, 120,
      130, 140, 150
    ];
    const startLevelOptionsHtml = this.getLevelOptionsHtml(levelOptions);
    const targetLevelOptionsHtml = this.getLevelOptionsHtml([
      ...levelOptions, 200
    ]);
    return feature.rows
      .map((row) =>
        this.getRowHtml({
          CharacterDataService,
          feature,
          i18n,
          miscSprite,
          plan,
          row,
          startLevelOptionsHtml,
          targetLevelOptionsHtml,
          primaryRate,
          secondaryRate,
          utils
        })
      )
      .join('');
  },

  getRateValue(popup, field) {
    return Math.max(0, Number(popup?.querySelector(`[data-field="${field}"]`)?.value) || 0) * 1000;
  },

  getLevelOptionsHtml(levels) {
    return levels.map((level) => `<option value="${level}">${level}</option>`).join('');
  },

  getRowHtml({
    CharacterDataService,
    feature,
    i18n,
    miscSprite,
    plan,
    row,
    startLevelOptionsHtml,
    targetLevelOptionsHtml,
    primaryRate,
    secondaryRate,
    utils
  }) {
    const levelState = plan.results.get(row.id);
    const currentExperiencePercentText = this.getExperiencePercentText(
      CharacterDataService,
      levelState.currentState.level,
      levelState.currentState.experience,
      i18n
    );
    const currentLevelTooltip = [
      `${i18n.t('currentLevel')}: ${levelState.currentState.level}`, `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`, `${i18n.t('currentExperience')}: ${Math.floor(levelState.currentState.experience).toLocaleString(i18n.locale)}`
    ].join('\n');
    const trainingTypeMode = feature.getTrainingTypeMode(row.skillHrid);
    const trainingTypeLabel = row.trainingType === 'primary' ? i18n.t('primaryTraining') : i18n.t('secondaryTraining');
    const trainingTypeControl =
      trainingTypeMode === 'flexible'
        ? `<label class="mst-training-checkbox"><input data-row-field="trainingType" type="checkbox"${row.trainingType === 'primary' ? ' checked' : ''}><span>${utils.escapeHtml(trainingTypeLabel)}</span></label>`
        : `<span class="mst-fixed-training">${utils.escapeHtml(trainingTypeLabel)}</span>`;
    const concurrentAllowed = plan.concurrentAllowedById.get(row.id);
    const concurrentControl = `<label class="mst-training-checkbox mst-concurrent-training"><input data-row-field="concurrentTraining" type="checkbox"${row.concurrentTraining ? ' checked' : ''}${concurrentAllowed ? '' : ' disabled'}><span>${utils.escapeHtml(i18n.t('concurrentTraining'))}</span></label>`;
    const inheritedRate = feature.getHourlyExperience(row, primaryRate, secondaryRate) / 1000;
    let displayedRate = row.hourlyExperienceOverride;
    if (displayedRate == null) displayedRate = inheritedRate > 0 ? inheritedRate : '';
    return `<tr data-row-id="${row.id}">
    <td class="mst-sequence-cell" draggable="true" title="${utils.escapeHtml(i18n.t('dragToSort'))}"><svg aria-hidden="true"><use href="${utils.escapeHtml(miscSprite + '#drag_handle')}"></use></svg><span>${plan.sequenceById.get(row.id)}</span></td>
    <td class="mst-calculator-name"><svg aria-hidden="true"><use href="${utils.escapeHtml(feature.getSkillIconHref(row.skillHrid))}"></use></svg><span>${utils.escapeHtml(feature.getSkillName(row.skillHrid))}</span></td>
    <td data-current-level-cell title="${utils.escapeHtml(currentLevelTooltip)}"><span class="mst-ability-current-level"><strong data-current-level-value>${utils.escapeHtml(String(levelState.currentState.level))}</strong><small data-current-level-percent>${utils.escapeHtml(`${currentExperiencePercentText}%`)}</small></span></td>
    <td><div class="mst-combat-start-control">
        <input data-row-field="customStart" type="checkbox" title="${utils.escapeHtml(i18n.t('customStartLevel'))}" aria-label="${utils.escapeHtml(i18n.t('customStartLevel'))}"${row.customStart ? ' checked' : ''}${levelState.isRepeated ? ' disabled' : ''}>
        <div class="mst-target-level-control">
          <input data-row-field="startLevel" type="number" min="0" max="199" value="${levelState.startLevel}" aria-label="${utils.escapeHtml(i18n.t('startLevel'))}"${row.customStart && !levelState.isRepeated ? '' : ' disabled'}>
          <select data-start-level-preset aria-label="${utils.escapeHtml(i18n.t('commonStartLevel'))}"${row.customStart && !levelState.isRepeated ? '' : ' disabled'}>
            <option value=""></option>
        ${startLevelOptionsHtml}
          </select>
        </div>
      </div></td>
  ${this.getTargetCell(levelState, targetLevelOptionsHtml, i18n, utils)}
    <td><div class="mst-combat-training-type"><span class="mst-combat-training-line">${trainingTypeControl}</span>${concurrentControl}</div></td>
    <td><input data-row-field="hourlyExperienceOverride" type="number" min="0" step="0.1" inputmode="decimal" value="${displayedRate}"></td>
    <td data-result="hours"><span class="mst-combat-duration-hours">-</span><small class="mst-combat-duration-days"></small></td>
    <td data-result="estimatedTime">-</td>
    <td data-result="runs" data-runs-column hidden>-</td>
    <td><div class="mst-combat-row-actions"><button type="button" class="mst-row-remove" title="${utils.escapeHtml(i18n.t('remove'))}" aria-label="${utils.escapeHtml(i18n.t('remove'))}">&times;</button></div></td>
  </tr>`;
  },

  getExperiencePercentText(CharacterDataService, level, experience, i18n) {
    return CharacterDataService.getLevelExperiencePercent(level, experience).toLocaleString(i18n.locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
  },

  getTargetCell(levelState, targetLevelOptionsHtml, i18n, utils) {
    if (levelState.derivedTarget) {
      return `<td data-derived-target-cell><span class="mst-ability-current-level mst-combat-derived-target"><strong data-derived-target-level>${levelState.endState?.level ?? '--'}</strong><small data-derived-target-percent>${levelState.endState ? `${Number(levelState.endState.percent.toFixed(2))}%` : '--'}</small></span></td>`;
    }
    return `  <td><div class="mst-target-level-control">
      <input data-row-field="targetLevel" type="number" min="1" max="200" value="${levelState.targetLevel}" aria-label="${utils.escapeHtml(i18n.t('targetLevel'))}">
      <select data-target-level-preset aria-label="${utils.escapeHtml(i18n.t('commonTargetLevel'))}">
        <option value=""></option>
    ${targetLevelOptionsHtml}
      </select>
    </div></td>`;
  }
};

// combat-upgrade-row-view
const combatUpgradeRowView = {
  renderRows(feature) {
    const {TemplateRenderer} = feature.ctx;
    const tbody = feature.popup?.querySelector('tbody');
    if (!tbody) return;
    TemplateRenderer.renderHtml(combatUpgradeRowHtml.getRowsHtml(feature), tbody);
    feature.recalculate();
  },

  recalculate(feature) {
    return combatUpgradeResultView.recalculate(feature);
  }
};

// combat-upgrade-state
const combatUpgradeState = {
  getSkillName(feature, skillHrid) {
    const {DataHub} = feature.ctx;
    return DataHub.getLocalizedGameName('skillNames', skillHrid);
  },

  getSkillIconHref(feature, skillHrid) {
    const {utils} = feature.ctx;
    const sprite = utils.getSpriteUrl('skills') || '/static/media/skills_sprite.3bb4d936.svg';
    return sprite + '#' + utils.substrLastSlash(skillHrid);
  },

  createRow(feature, skillHrid, defaultPrimarySkillHrid = feature.planner.getDefaultPrimarySkillHrid()) {
    const {CharacterDataService, utils} = feature.ctx;
    const current = CharacterDataService.getCharacterSkill(skillHrid) || {level: 0, experience: 0};
    const startLevel = utils.clampLevel(current.level, 0, 199);
    const trainingTypeMode = feature.planner.getTrainingTypeMode(skillHrid);
    let trainingType = trainingTypeMode;
    if (trainingTypeMode === 'flexible') {
      trainingType = skillHrid === defaultPrimarySkillHrid ? 'primary' : 'secondary';
    }
    return {
      id: ++feature.nextRowId,
      skillHrid,
      startLevel,
      targetLevel: utils.clampLevel(current.level, 1, 200),
      trainingType,
      concurrentTraining: false,
      customStart: false,
      hourlyExperienceOverride: null
    };
  },

  resetState(feature, preserveExperienceOverrides = false) {
    const {CharacterDataService} = feature.ctx;
    // 重置列表时可保留用户填写的单行经验，便于只恢复默认职业顺序。
    const experienceOverrides = preserveExperienceOverrides
      ? new Map(
          feature.rows.map((row) => [
            row.skillHrid, row.hourlyExperienceOverride
          ])
        )
      : new Map();
    feature.nextRowId = 0;
    const defaultPrimarySkillHrid = feature.planner.getDefaultPrimarySkillHrid();
    const defaultSkillHrids = new Set([
      '/skills/stamina', '/skills/intelligence', '/skills/attack', '/skills/defense', defaultPrimarySkillHrid
    ]);
    feature.rows = CharacterDataService.getCombatSkills()
      .filter((entry) => defaultSkillHrids.has(entry.detail.hrid))
      .map((entry) => feature.createRow(entry.detail.hrid, defaultPrimarySkillHrid));
    feature.rows.forEach((row) => {
      if (experienceOverrides.has(row.skillHrid)) {
        row.hourlyExperienceOverride = experienceOverrides.get(row.skillHrid);
      }
    });
  }
};

// combat-upgrade-view
const combatUpgradeView = {
  getProfessionGridHtml(feature) {
    return combatUpgradeDialogView.getProfessionGridHtml(feature);
  },

  getDialogHtml(feature) {
    return combatUpgradeDialogView.getDialogHtml(feature);
  },

  mountHelpPopover(feature, popup) {
    return combatUpgradeDialogView.mountHelpPopover(feature, popup);
  },

  renderRows(feature) {
    return combatUpgradeRowView.renderRows(feature);
  },

  recalculate(feature) {
    return combatUpgradeRowView.recalculate(feature);
  },

  bind(feature, popup) {
    return combatUpgradeEvents.bind(feature, popup);
  },

  refreshLanguage(feature) {
    return combatUpgradeEvents.refreshLanguage(feature);
  }
};

// combat-upgrade-calculator-feature
export class CombatUpgradeCalculatorFeature {
  constructor(ctx) {
    this.ctx = ctx;
    this.planner = new CombatUpgradePlanner(ctx);
    this.state = combatUpgradeState;
    this.view = combatUpgradeView;
    this.rows = [];
    this.nextRowId = 0;
    this.popup = null;
    this.helpController = null;
    this.bindController = null;
  }

  getSkillName(skillHrid) {
    return this.state.getSkillName(this, skillHrid);
  }

  getSkillIconHref(skillHrid) {
    return this.state.getSkillIconHref(this, skillHrid);
  }

  getTrainingTypeMode(skillHrid) {
    return this.planner.getTrainingTypeMode(skillHrid);
  }

  getDefaultPrimarySkillHrid() {
    return this.planner.getDefaultPrimarySkillHrid();
  }

  getHourlyExperience(row, primaryRate, secondaryRate) {
    return this.planner.getHourlyExperience(row, primaryRate, secondaryRate);
  }

  createRow(skillHrid, defaultPrimarySkillHrid = this.getDefaultPrimarySkillHrid()) {
    return this.state.createRow(this, skillHrid, defaultPrimarySkillHrid);
  }

  resetState(preserveExperienceOverrides = false) {
    return this.state.resetState(this, preserveExperienceOverrides);
  }

  getSequenceState() {
    return this.planner.getSequenceState(this.rows);
  }

  getExperienceState(experience) {
    return this.planner.getExperienceState(experience);
  }

  getSequenceStartHours(sequence, sequenceDurations) {
    return this.planner.getSequenceStartHours(sequence, sequenceDurations);
  }

  calculateRequiredHours(requiredExperience, hourlyRate, hasPrimary) {
    return this.planner.calculateRequiredHours(requiredExperience, hourlyRate, hasPrimary);
  }

  mergeSequenceDuration(currentDuration, rowDuration) {
    return this.planner.mergeSequenceDuration(currentDuration, rowDuration);
  }

  calculatePlan(primaryRate, secondaryRate) {
    return this.planner.calculatePlan(this.rows, primaryRate, secondaryRate);
  }

  getProfessionGridHtml() {
    return this.view.getProfessionGridHtml(this);
  }

  getDialogHtml() {
    return this.view.getDialogHtml(this);
  }

  mountHelpPopover(popup) {
    return this.view.mountHelpPopover(this, popup);
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

  open() {
    const {DataHub, CharacterDataService, Notifier, i18n} = this.ctx;
    if (!DataHub.getClientData()?.levelExperienceTable || !CharacterDataService.getCombatSkills().length) {
      return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
    }
    this.resetState();
    return Notifier.html({
      title: i18n.t('combatUpgradeCalculator'),
      html: this.getDialogHtml(),
      width: 'min(56rem, calc(100vw - 1rem))',
      popupClass: 'mst-upgrade-calculator-dialog',
      didOpen: (popup) => this.bind(popup),
      willClose: () => {
        this.bindController?.abort();
        this.bindController = null;
        this.helpController?.cleanup();
        this.helpController = null;
        this.popup = null;
      }
    });
  }

  init() {
    const {LanguageEvents} = this.ctx;
    LanguageEvents.subscribe(() => this.refreshLanguage());
  }
}
