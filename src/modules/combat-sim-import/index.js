import {buildGroupExport} from './export-builder.js';

// 队友资料缓存上限，与 MWITools profile_export_list 口径一致。
const SIM_PROFILE_LIMIT = 20;

// game-side-writer
// 游戏站侧把模拟器导入所需的数据快照写入 GM 存储（脚本级存储跨域共享）。
// 测试服数据与正式服不互通，测试服不写入（由 bootstrap 的 isTestServer 分流保证）。
const combatSimGameWriter = {
  start(feature) {
    const {DataHub, GmApi, STORAGE_KEYS} = feature.ctx;
    const writer = {
      writeCharacter(data) {
        if (!data?.character) return;
        GmApi.setValue(STORAGE_KEYS.SIM_CHARACTER_DATA, JSON.stringify(data));
      },
      // 客户端字典很大（约 2.6MB），只保留导入与导出用到的字段后写入。
      writeClientData(raw) {
        const abilityDetailMap = {};
        for (const [
          hrid, detail
        ] of Object.entries(raw?.abilityDetailMap || {})) {
          if (detail && typeof detail === 'object') {
            abilityDetailMap[hrid] = {isSpecialAbility: Boolean(detail.isSpecialAbility)};
          }
        }
        const actionDetailMap = {};
        for (const [
          hrid, detail
        ] of Object.entries(raw?.actionDetailMap || {})) {
          if (detail?.combatZoneInfo) {
            actionDetailMap[hrid] = {combatZoneInfo: detail.combatZoneInfo};
          }
        }
        GmApi.setValue(STORAGE_KEYS.SIM_CLIENT_DATA, JSON.stringify({abilityDetailMap, actionDetailMap}));
      },
      writeNewBattle(data) {
        if (data?.type !== 'new_battle') return;
        GmApi.setValue(STORAGE_KEYS.SIM_NEW_BATTLE, JSON.stringify(data));
      },
      async writeProfile(detail) {
        const profile = detail?.profile;
        const characterID = String(detail.characterID ?? profile?.characterSkills?.[0]?.characterID ?? '');
        if (!characterID || !profile) return;
        const stored = JSON.parse((await GmApi.getValue(STORAGE_KEYS.SIM_PROFILES, '{}')) || '{}');
        stored[characterID] = {
          characterID,
          characterName: profile.sharableCharacter?.name || '',
          timestamp: Date.now(),
          profile: {
            guildId: profile.guildId,
            wearableItemMap: Object.fromEntries(
              Object.entries(profile.wearableItemMap || {}).map(
                ([
                  key, item
                ]) => [
                  key, {
                    itemLocationHrid: item?.itemLocationHrid,
                    itemHrid: item?.itemHrid,
                    enhancementLevel: item?.enhancementLevel
                  }
                ]
              )
            ),
            characterSkills: (profile.characterSkills || []).map((skill) => ({
              skillHrid: skill?.skillHrid,
              level: skill?.level
            })),
            equippedAbilities: (profile.equippedAbilities || []).map((ability) => ({
              abilityHrid: ability?.abilityHrid,
              level: ability?.level
            })),
            characterHouseRoomMap: profile.characterHouseRoomMap || {},
            characterAchievements: profile.characterAchievements || {},
            guildBuffLevelMap: profile.guildBuffLevelMap || {},
            abilityCombatTriggersMap: profile.abilityCombatTriggersMap,
            consumableCombatTriggersMap: profile.consumableCombatTriggersMap
          }
        };
        // 超上限时淘汰最旧资料，避免 GM 存储无限增长。
        let entries = Object.entries(stored);
        if (entries.length > SIM_PROFILE_LIMIT) {
          entries.sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0));
          GmApi.setValue(
            STORAGE_KEYS.SIM_PROFILES,
            JSON.stringify(Object.fromEntries(entries.slice(0, SIM_PROFILE_LIMIT)))
          );
          return;
        }
        GmApi.setValue(STORAGE_KEYS.SIM_PROFILES, JSON.stringify(stored));
      },
      install() {
        window.addEventListener('mst:data:character-ready', (event) => writer.writeCharacter(event.detail));
        window.addEventListener('mst:ws:init-client-data', (event) => writer.writeClientData(event.detail));
        window.addEventListener('mst:ws:battle-message', (event) => writer.writeNewBattle(event.detail));
        window.addEventListener('mst:ws:profile-shared', (event) => {
          writer.writeProfile(event.detail).catch((error) => console.warn('[MST] 战斗模拟队友资料写入失败:', error));
        });
        // 页面刷新晚于 WebSocket 建连时补写一次已有快照，保证 GM 存储不落后于当前页面状态。
        if (DataHub.characterData.raw) writer.writeCharacter(DataHub.characterData.raw);
        if (DataHub.clientData.raw) writer.writeClientData(DataHub.clientData.raw);
      }
    };
    writer.install();
    feature.writer = writer;
  }
};

// sim-site-controller
const combatSimSiteController = {
  addImportButton(feature) {
    const {i18n} = feature.ctx;
    const anchor = document.getElementById('buttonImportExport');
    if (!anchor || document.getElementById('mst-combat-sim-import')) return;
    const button = document.createElement('button');
    button.id = 'mst-combat-sim-import';
    button.type = 'button';
    button.textContent = i18n.t('combatSimImport');
    button.title = i18n.t('combatSimImportTitle');
    Object.assign(button.style, {
      backgroundColor: '#4a90d9',
      color: '#fff',
      border: '0',
      borderRadius: '4px',
      padding: '5px 10px',
      margin: '2px 0',
      cursor: 'pointer'
    });
    button.addEventListener('click', () => feature.importIntoSimulator(button));
    // 与 MWITools 一致：插到“导入/导出”按钮所在 row 的下一层外层容器内、该 row 之后，
    // 按钮宽度按文案自适应并靠左，不占满整行。
    const column = anchor.parentElement;
    const row = column?.parentElement;
    const outerContainer = row?.parentElement;
    if (!column || !row || !outerContainer) return;
    outerContainer.insertBefore(button, row.nextSibling);
  },

  startObserving(feature) {
    const {utils} = feature.ctx;
    utils.observeBody(() => {
      this.addImportButton(feature);
    });
  },

  setSelectValue(select, value, {numeric = false} = {}) {
    if (!select || value == null) return false;
    for (const option of select.options) {
      const matches = numeric ? Number(option.value) === Number(value) : option.value === value;
      if (matches) {
        option.selected = true;
        return true;
      }
    }
    return false;
  },

  applyZoneAndDifficulty(feature, result) {
    const dungeonToggle = document.getElementById('simDungeonToggle');
    if (dungeonToggle) {
      dungeonToggle.checked = result.isZoneDungeon;
      dungeonToggle.dispatchEvent(new Event('change'));
    }
    const zoneSelect = document.getElementById(result.isZoneDungeon ? 'selectDungeon' : 'selectZone');
    this.setSelectValue(zoneSelect, result.zone);
    this.setSelectValue(document.getElementById('selectDifficulty'), result.difficultyTier, {numeric: true});
  },

  applyPlayerSelection(result) {
    result.importedPlayerPositions.forEach((imported, index) => {
      const checkbox = document.querySelector(`input#player${index + 1}.form-check-input.player-checkbox`);
      if (!checkbox || checkbox.checked === imported) return;
      checkbox.checked = imported;
      checkbox.dispatchEvent(new Event('change'));
    });
  },

  async import(feature, button) {
    const {GmApi, STORAGE_KEYS, i18n, Notifier} = feature.ctx;
    const [
      characterRaw, clientRaw, battleRaw, profilesRaw
    ] = await Promise.all([
      GmApi.getValue(
        STORAGE_KEYS.SIM_CHARACTER_DATA,
        ''
      ), GmApi.getValue(STORAGE_KEYS.SIM_CLIENT_DATA, ''), GmApi.getValue(STORAGE_KEYS.SIM_NEW_BATTLE, ''), GmApi.getValue(STORAGE_KEYS.SIM_PROFILES, '{}')
    ]);
    const characterData = JSON.parse(characterRaw || 'null');
    if (!characterData?.character) {
      Notifier.toast(i18n.t('combatSimNoCharacterData'), 'error');
      return;
    }
    const result = buildGroupExport({
      characterData,
      clientData: JSON.parse(clientRaw || '{}'),
      newBattle: battleRaw ? JSON.parse(battleRaw) : null,
      profiles: JSON.parse(profilesRaw || '{}')
    });

    // 与 MWITools 一致：导入前先点模拟器的“获取价格”刷新行情，保证收益计算使用最新价格。
    document.getElementById('buttonGetPrices')?.click();
    document.querySelector('a#group-combat-tab')?.click();
    const importInput = document.getElementById('inputSetGroupCombatAll');
    if (!importInput) {
      Notifier.toast(i18n.t('combatSimImportFailed', i18n.t('combatSimSiteChanged')), 'error');
      return;
    }
    importInput.value = JSON.stringify(result.exportObj);
    document.getElementById('buttonImportSet')?.click();

    result.playerIDs.forEach((name, index) => {
      const tab = document.getElementById(`player${index + 1}-tab`);
      if (tab) tab.textContent = name === 'NEED_PROFILE' ? i18n.t('combatSimNeedProfile') : name;
    });
    this.applyZoneAndDifficulty(feature, result);
    this.applyPlayerSelection(result);
    const simulationTime = document.getElementById('inputSimulationTime');
    if (simulationTime) simulationTime.value = 24;
    // 导入完成后禁用按钮：避免再次点击重复触发“获取价格”的市场请求；
    // 需要重新导入时刷新模拟器页面即可。
    button.textContent = i18n.t('combatSimImported');
    button.disabled = true;
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    // 单人模式直接开始模拟；组队需要手动确认队伍配置后再开跑。
    if (!result.isParty) {
      setTimeout(() => document.getElementById('buttonStartSimulation')?.click(), 500);
    }
  }
};

// combat-sim-import-feature
export class CombatSimImportFeature {
  static ctx = null;
  static gameWriter = combatSimGameWriter;
  static siteController = combatSimSiteController;

  static configure(ctx) {
    this.ctx = ctx;
  }

  constructor() {
    this.ctx = this.constructor.ctx;
    this.writer = null;
  }

  init() {
    const {CONFIG} = this.ctx;
    if (CONFIG.isCombatSimSite) {
      this.constructor.siteController.startObserving(this);
      return;
    }
    // 测试服数据不写入战斗模拟同步存储，避免正式服/测试服快照互相覆盖。
    if (!CONFIG.isGameSite || CONFIG.isTestServer) return;
    this.constructor.gameWriter.start(this);
  }

  importIntoSimulator(button) {
    const {i18n} = this.ctx;
    console.log('[MST] 已点击战斗模拟器导入按钮。');
    // 导入成功后按钮会被禁用；走到这里说明是失败后的重试，先恢复初始文案。
    button.textContent = i18n.t('combatSimImport');
    this.constructor.siteController.import(this, button).catch((error) => {
      console.error('[MST] 战斗模拟器导入失败:', error);
      this.ctx.Notifier.toast(i18n.t('combatSimImportFailed', error?.message || error), 'error');
    });
  }
}
