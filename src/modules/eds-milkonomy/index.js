import {
  EDS_ACHIEVEMENT_TIER_MAP,
  EDS_ACTION_LOCATIONS,
  EDS_BUFF_TYPES,
  EDS_COMBAT_ACHIEVEMENTS,
  EDS_EQUIPMENT_LOCATIONS,
  EDS_INCLUDE_ITEM_HRIDS,
  EDS_SCROLL_TO_PERSON_BUFF_MAP,
  EDS_SKILL_TO_HOUSE_MAP,
  EdsMilkonomyConverter
} from './converter.js';

// eds-milkonomy-preset-service
const edsMilkonomyPresetService = {
  async copyJsonToClipboard(feature, data, successMessage) {
    const {Notifier, i18n, utils} = feature.ctx;
    try {
      await utils.writeClipboard(JSON.stringify(data));
      Notifier.toast(successMessage, 'success');
    } catch (error) {
      Notifier.toast(i18n.t('clipboardWriteFailed', error?.message || error), 'error');
    }
  },

  async copyProfitPreset(feature, target) {
    const {STORAGE_KEYS, i18n} = feature.ctx;
    const preset = feature.convert();
    GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
    await feature.copyJsonToClipboard(
      feature.filterPresetForTarget(preset, target),
      i18n.t(target === 'hyhfish' ? 'copiedHyhfish' : 'copiedMilkonomy')
    );
  },

  syncPresetToStorage(feature) {
    const {STORAGE_KEYS} = feature.ctx;
    const preset = feature.convert();
    const presetJSON = JSON.stringify(preset);
    if (presetJSON === feature.lastSyncedPresetJSON) return preset;
    feature.lastSyncedPresetJSON = presetJSON;
    GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
    return preset;
  }
};

// eds-milkonomy-game-controller
const edsMilkonomyGameController = {
  getCombatLoadout(feature, detailsEl) {
    const {GameUiAdapter, utils} = feature.ctx;
    const data = utils.getReactComponentProps(detailsEl) || {};
    const titleEl = GameUiAdapter.query('loadoutMetadata', detailsEl);
    const svgEl = titleEl?.querySelector('svg');
    const updateBtn = titleEl?.querySelector('button');
    const name = utils.getTextBetween(svgEl, updateBtn).trim();
    // 与 EDS 保持一致：只从当前配装详情组件读取，避免全局回退选中其他配装。
    const loadout = Object.values(data.characterLoadoutDict || {}).find((item) => item?.name === name);
    return {loadout, data};
  },

  async copyCombatSimulatorData(feature, detailsEl) {
    const {DataHub, Notifier, i18n} = feature.ctx;
    const {loadout, data} = feature.getCombatLoadout(detailsEl);
    if (!loadout) {
      Notifier.toast(i18n.t('loadoutNotFound'), 'error');
      return;
    }
    const raw = DataHub.characterData.raw || {};
    const characterData = {characterSkills: data.characterSkillMap ? [
            ...data.characterSkillMap.values()
          ] : [], characterAbilities: data.characterAbilityMap ? [
            ...data.characterAbilityMap.values()
          ] : [], characterHouseRoomMap: raw.characterHouseRoomMap || {}, characterAchievements: raw.characterAchievements || []};
    await feature.copyJsonToClipboard(
      feature.constructor.CombatSimulatorConverter.convert(loadout, characterData),
      i18n.t('copiedCombatData')
    );
  },

  requestLoadoutCharacterCard(feature, detailsEl) {
    const {Notifier, i18n} = feature.ctx;
    const {loadout, data} = feature.getCombatLoadout(detailsEl);
    if (!loadout) {
      Notifier.toast(i18n.t('loadoutNotFound'), 'error');
      return;
    }
    window.dispatchEvent(new CustomEvent('mst:card:loadout-request', {detail: {loadout, reactData: data}}));
  },

  addGameButtons(feature) {
    const {CONFIG, GameUiAdapter, i18n} = feature.ctx;
    if (!CONFIG.isGameSite) return;
    const equipmentPanel = GameUiAdapter.query('equipmentPanel');
    if (equipmentPanel && !equipmentPanel.querySelector('.mst-eds-profit-menu')) {
      const buttonContainer = GameUiAdapter.query('equipmentButtonContainer', equipmentPanel) || equipmentPanel;
      const ref = buttonContainer.querySelector('button');
      const menu = document.createElement('span');
      menu.className = 'mst-eds-profit-menu';
      const trigger = ref ? ref.cloneNode(true) : document.createElement('button');
      trigger.type = 'button';
      trigger.classList.add('mst-eds-copy-profit');
      trigger.textContent = i18n.t('copyProfitData');
      trigger.title = i18n.t('copyProfitDataTitle');
      const items = document.createElement('span');
      items.className = 'mst-eds-profit-submenu';
      items.hidden = true;
      [
        [
          'milkonomy', 'copyMilkonomy', 'copyMilkonomyTitle'
        ], [
          'hyhfish', 'copyHyhfish', 'copyHyhfish'
        ]
      ].forEach(
        ([
          target, textKey, titleKey
        ]) => {
          const item = ref ? ref.cloneNode(true) : document.createElement('button');
          item.type = 'button';
          item.dataset.profitTarget = target;
          item.textContent = i18n.t(textKey);
          item.title = i18n.t(titleKey);
          item.addEventListener('click', (event) => {
            event.stopPropagation();
            items.hidden = true;
            feature.copyProfitPreset(target);
          });
          items.appendChild(item);
        }
      );
      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        items.hidden = !items.hidden;
      });
      menu.addEventListener('focusout', (event) => {
        if (!menu.contains(event.relatedTarget)) items.hidden = true;
      });
      menu.append(trigger, items);
      buttonContainer.appendChild(menu);
    }

    const loadoutsPanel = GameUiAdapter.query('selectedLoadout');
    if (loadoutsPanel) {
      const detailsEl = GameUiAdapter.query('loadoutDetails', loadoutsPanel);
      const combatIcon = detailsEl
        ?.querySelector('[class*="metadata"] svg use')
        ?.getAttribute('href')
        ?.split('#')
        .pop();
      const isCombatLoadout = combatIcon === 'combat';
      const container = loadoutsPanel.querySelector('[class*="buttonsContainer"]') || loadoutsPanel;
      const reference = container.querySelector('button:last-child');
      let mstRow = loadoutsPanel.querySelector('.mst-eds-loadout-actions');
      if (!mstRow) {
        mstRow = document.createElement('div');
        mstRow.className = 'mst-eds-loadout-actions';
        container.insertAdjacentElement('afterend', mstRow);
      }
      // 只在创建按钮时写入 DOM，避免触发 childList 观察器后形成重复回调。
      let combatButton = loadoutsPanel.querySelector('.mst-eds-copy-combat');
      if (isCombatLoadout) {
        if (!combatButton) {
          combatButton = reference ? reference.cloneNode(true) : document.createElement('button');
          combatButton.type = 'button';
          combatButton.classList.add('mst-eds-copy-combat');
          combatButton.textContent = i18n.t('copyCombatData');
          combatButton.onclick = () =>
            feature.copyCombatSimulatorData(GameUiAdapter.query('loadoutDetails', loadoutsPanel));
          mstRow.appendChild(combatButton);
        }
      } else if (combatButton) {
        combatButton.remove();
      }
      let cardButton = loadoutsPanel.querySelector('.mst-eds-loadout-card');
      if (!cardButton) {
        cardButton = reference ? reference.cloneNode(true) : document.createElement('button');
        cardButton.type = 'button';
        cardButton.classList.add('mst-eds-loadout-card');
        cardButton.textContent = i18n.t('loadoutCharacterCard');
        cardButton.title = i18n.t('loadoutCharacterCardTitle');
        cardButton.onclick = () =>
          feature.requestLoadoutCharacterCard(GameUiAdapter.query('loadoutDetails', loadoutsPanel));
        mstRow.appendChild(cardButton);
      }
    }
  },

  refreshLanguage(feature) {
    const {i18n} = feature.ctx;
    const profitButton = document.querySelector('.mst-eds-copy-profit');
    if (profitButton) {
      profitButton.textContent = i18n.t('copyProfitData');
      profitButton.title = i18n.t('copyProfitDataTitle');
    }
    document.querySelectorAll('[data-profit-target]').forEach((button) => {
      const isHyhfish = button.dataset.profitTarget === 'hyhfish';
      button.textContent = i18n.t(isHyhfish ? 'copyHyhfish' : 'copyMilkonomy');
      button.title = i18n.t(isHyhfish ? 'copyHyhfish' : 'copyMilkonomyTitle');
    });
    const combatButton = document.querySelector('.mst-eds-copy-combat');
    if (combatButton) combatButton.textContent = i18n.t('copyCombatData');
    const loadoutCardButton = document.querySelector('.mst-eds-loadout-card');
    if (loadoutCardButton) {
      loadoutCardButton.textContent = i18n.t('loadoutCharacterCard');
      loadoutCardButton.title = i18n.t('loadoutCharacterCardTitle');
    }
  }
};

// eds-milkonomy-site-controller
const edsMilkonomySiteController = {
  refreshMilkonomyLanguage(feature) {
    const {i18n} = feature.ctx;
    i18n.syncPageLanguage();
    const button = document.getElementById('mst-eds-milkonomy-import');
    if (button) button.textContent = i18n.t('syncMilkonomy');
  },

  async readMilkonomyPreset(feature) {
    const {STORAGE_KEYS, utils} = feature.ctx;
    let preset = null;
    try {
      preset = GM_getValue(STORAGE_KEYS.MILKONOMY_PRESET);
    } catch {}
    // 仅用于兼容曾经写入利润网站当前域的测试数据。
    if (!preset?.name) {
      try {
        preset = JSON.parse(localStorage.getItem(STORAGE_KEYS.MILKONOMY_PRESET) || 'null');
      } catch {}
    }
    if (preset?.name) return preset;
    const clipboardText = await utils.readClipboard();
    preset = JSON.parse(clipboardText);
    if (preset?.name) GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
    return preset;
  },

  async syncMilkonomyPreset(feature) {
    const {Notifier, i18n} = feature.ctx;
    try {
      const preset = await feature.readMilkonomyPreset();
      if (!preset?.name) {
        Notifier.toast(i18n.t('noCharacterData'), 'error');
        return false;
      }
      const converted = feature.filterPresetForCurrentSite(preset);
      let storedPresets = [];
      try {
        const storedValue = JSON.parse(localStorage.getItem('player-action-config-presets') || '[]');
        if (Array.isArray(storedValue)) storedPresets = storedValue;
      } catch {}
      let index = storedPresets.findIndex((item) => item?.name === converted.name);
      if (index < 0) {
        storedPresets.push(converted);
        index = storedPresets.length - 1;
      } else {
        storedPresets[index] = converted;
      }
      localStorage.setItem('player-action-config-presets', JSON.stringify(storedPresets));
      localStorage.setItem('player-action-preset-index', String(index));
      Notifier.toast(i18n.t('syncedMilkonomy'), 'success');
      setTimeout(() => window.location.reload(), 500);
      return true;
    } catch (error) {
      console.error('[MST] Milkonomy preset sync failed:', error);
      Notifier.toast(i18n.t('syncMilkonomyFailed', error?.message || error), 'error');
      return false;
    }
  },

  initMilkonomySite(feature) {
    const {CONFIG, STORAGE_KEYS, i18n, utils} = feature.ctx;
    if (!CONFIG.isMilkonomySite) return;
    GM_addValueChangeListener(STORAGE_KEYS.MILKONOMY_PRESET, (_name, _oldValue, newValue, remote) => {
      if (!remote || !newValue) return;
      window.dispatchEvent(new CustomEvent('mst:eds:milkonomy-preset', {detail: newValue}));
    });
    const addButton = () => {
      feature.refreshMilkonomyLanguage();
      if (document.getElementById('mst-eds-milkonomy-import')) return;
      const gameInfo = document.querySelector('.game-info');
      if (!gameInfo) return;
      const anchor = gameInfo.querySelector('.items-center > .items-center') || gameInfo;
      const btn = utils.ensureButton({
        host: gameInfo,
        id: 'mst-eds-milkonomy-import',
        className: 'el-button el-button--primary',
        text: i18n.t('syncMilkonomy'),
        onClick: () => feature.syncMilkonomyPreset()
      });
      if (btn) {
        btn.style.marginLeft = '0.5rem';
        anchor.after(btn);
      }
    };
    feature.milkonomyObserver = utils.observeBody(addButton);
    feature.milkonomyLanguageObserver = new MutationObserver(addButton);
    feature.milkonomyLanguageObserver.observe(document.documentElement, {attributes: true, attributeFilter: [
        'lang'
      ]});
    window.addEventListener('beforeunload', () => feature.milkonomyLanguageObserver?.disconnect(), {once: true});
  }
};

// eds-milkonomy-lifecycle
const edsMilkonomyLifecycle = {
  init(feature) {
    const {CONFIG, DataHub, LanguageEvents, utils, i18n} = feature.ctx;
    feature.initMilkonomySite();
    if (!CONFIG.isGameSite) return;
    const schedulePresetSync = () => {
      clearTimeout(feature.presetSyncTimer);
      feature.presetSyncTimer = setTimeout(() => feature.syncPresetToStorage(), 1000);
    };
    window.addEventListener('mst:data:character-ready', schedulePresetSync);
    window.addEventListener('mst:data:character-updated', (event) => {
      const relevantFields = new Set([
        '*', 'character', 'characterSkills', 'characterAbilities', 'characterItems',
        'characterHouseRoomMap', 'characterLoadoutMap', 'combatUnit', 'actionTypeDrinkSlotsMap', 'communityBuffs',
        'characterAchievements', 'characterBuffs'
      ]);
      if ((event.detail?.fields || []).some((field) => relevantFields.has(field))) schedulePresetSync();
    });
    if (DataHub.characterData.raw) schedulePresetSync();
    feature.observer = utils.observeBody(() => feature.addGameButtons());
    LanguageEvents.subscribe(() => {
      i18n.syncPageLanguage();
      feature.constructor.gameController.refreshLanguage(feature);
    });
  }
};

// eds-milkonomy-feature
export class EdsMilkonomyFeature {
  // 与 EDS 的 INCLUDE_ITEMS 完全一致；装备详情使用游戏官方 clientData。
  static INCLUDE_ITEM_HRIDS = EDS_INCLUDE_ITEM_HRIDS;

  static SKILL_TO_HOUSE_MAP = EDS_SKILL_TO_HOUSE_MAP;
  static ACTION_LOCATIONS = EDS_ACTION_LOCATIONS;
  static EQUIPMENT_LOCATIONS = EDS_EQUIPMENT_LOCATIONS;
  static BUFF_TYPES = EDS_BUFF_TYPES;
  static SCROLL_TO_PERSON_BUFF_MAP = EDS_SCROLL_TO_PERSON_BUFF_MAP;
  static ACHIEVEMENT_TIER_MAP = EDS_ACHIEVEMENT_TIER_MAP;
  static COMBAT_ACHIEVEMENTS = EDS_COMBAT_ACHIEVEMENTS;
  static ctx = null;
  static CombatSimulatorConverter = null;
  static converter = null;
  static gameController = edsMilkonomyGameController;
  static lifecycle = edsMilkonomyLifecycle;
  static presetService = edsMilkonomyPresetService;
  static siteController = edsMilkonomySiteController;

  static configure(ctx, CombatSimulatorConverter) {
    this.ctx = ctx;
    this.CombatSimulatorConverter = CombatSimulatorConverter;
    this.converter = new EdsMilkonomyConverter(ctx);
  }

  constructor() {
    this.ctx = this.constructor.ctx;
    this.lastSyncedPresetJSON = '';
    this.observer = null;
    this.presetSyncTimer = null;
    this.milkonomyObserver = null;
    this.milkonomyLanguageObserver = null;
  }

  getGameData() {
    return this.constructor.converter.getGameData();
  }

  convert(characterData = this.getGameData()) {
    return this.constructor.converter.convert(characterData);
  }

  filterPresetForTarget(preset, target) {
    return this.constructor.converter.filterPresetForTarget(preset, target);
  }

  filterPresetForCurrentSite(preset) {
    return this.constructor.converter.filterPresetForCurrentSite(preset);
  }

  filterValidItems(characterItems) {
    return this.constructor.converter.filterValidItems(characterItems);
  }

  convertActionConfig(skills, houseMap, drinkMap, validItems) {
    return this.constructor.converter.convertActionConfig(skills, houseMap, drinkMap, validItems);
  }

  convertSpecialEquipment(validItems) {
    return this.constructor.converter.convertSpecialEquipment(validItems);
  }

  convertCommunityBuff(communityBuffs) {
    return this.constructor.converter.convertCommunityBuff(communityBuffs);
  }

  convertAchievementBuff(achievements) {
    return this.constructor.converter.convertAchievementBuff(achievements);
  }

  convertSeals(characterBuffs) {
    return this.constructor.converter.convertSeals(characterBuffs);
  }

  copyJsonToClipboard(data, successMessage) {
    return this.constructor.presetService.copyJsonToClipboard(this, data, successMessage);
  }

  copyProfitPreset(target) {
    return this.constructor.presetService.copyProfitPreset(this, target);
  }

  syncPresetToStorage() {
    return this.constructor.presetService.syncPresetToStorage(this);
  }

  getCombatLoadout(detailsEl) {
    return this.constructor.gameController.getCombatLoadout(this, detailsEl);
  }

  copyCombatSimulatorData(detailsEl) {
    return this.constructor.gameController.copyCombatSimulatorData(this, detailsEl);
  }

  requestLoadoutCharacterCard(detailsEl) {
    return this.constructor.gameController.requestLoadoutCharacterCard(this, detailsEl);
  }

  addGameButtons() {
    return this.constructor.gameController.addGameButtons(this);
  }

  refreshMilkonomyLanguage() {
    return this.constructor.siteController.refreshMilkonomyLanguage(this);
  }

  readMilkonomyPreset() {
    return this.constructor.siteController.readMilkonomyPreset(this);
  }

  syncMilkonomyPreset() {
    return this.constructor.siteController.syncMilkonomyPreset(this);
  }

  initMilkonomySite() {
    return this.constructor.siteController.initMilkonomySite(this);
  }

  init() {
    return this.constructor.lifecycle.init(this);
  }
}
