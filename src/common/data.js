// storage-keys
export const STORAGE_KEYS = {
  PROFILE_CACHE: 'MST_CC_profiles',
  TEAM_CARD: 'MST_CC_team',
  MILKONOMY_PRESET: 'MST_EDS_preset',
  MARKET_CACHE: 'MST_HCCP_market',
  MARKET_CACHE_TIMESTAMP: 'MST_HCCP_marketTimestamp',
  MWITOOLS_MARKET_CACHE: 'MWITools_marketAPI_json',
  MWITOOLS_MARKET_TIMESTAMP: 'MWITools_marketAPI_timestamp'
};

function isClientData(data) {
  return Boolean(
    data && typeof data === 'object' && (data.itemDetailMap || data.actionDetailMap || data.houseRoomDetailMap)
  );
}

// data-hub-client-cache
const dataHubClientCacheMethods = {
  initClientData(data, source) {
    if (!data || typeof data !== 'object') return false;
    this.clientData.raw = data;
    this.clientData.source = source || 'unknown';
    const nextItemMap = data.itemDetailMap || {};
    const nextHouseMap = data.houseRoomDetailMap || {};
    const itemTarget = this.clientData.indexes.itemDetailMap || {};
    const houseTarget = this.clientData.indexes.houseRoomDetailMap || {};
    Object.keys(itemTarget).forEach((key) => delete itemTarget[key]);
    Object.keys(houseTarget).forEach((key) => delete houseTarget[key]);
    Object.assign(itemTarget, nextItemMap);
    Object.assign(houseTarget, nextHouseMap);
    this.clientData.indexes.itemDetailMap = itemTarget;
    this.clientData.indexes.houseRoomDetailMap = houseTarget;
    const nextActionMap = data.actionDetailMap || {};
    this.clientData.indexes.actionDetailMap = nextActionMap;
    const actionNameToHrid = new Map();
    Object.values(nextActionMap).forEach((action) => {
      if (!action?.name || !action?.hrid || actionNameToHrid.has(action.name)) return;
      actionNameToHrid.set(action.name, action.hrid);
    });
    this.clientData.indexes.actionNameToHrid = actionNameToHrid;
    const abilityBookByAbilityHrid = new Map();
    Object.values(nextItemMap).forEach((item) => {
      const abilityHrid = item?.abilityBookDetail?.abilityHrid;
      if (abilityHrid) abilityBookByAbilityHrid.set(abilityHrid, item);
    });
    this.clientData.indexes.abilityBookByAbilityHrid = abilityBookByAbilityHrid;
    this.refreshI18nIndexes();
    window.dispatchEvent(new CustomEvent('mst:data:client-ready', {detail: {source: this.clientData.source}}));
    return true;
  },

  initClientDataFromCache() {
    if (this.clientData.raw?.itemDetailMap || this.clientData.raw?.actionDetailMap) return true;
    const cached = this.readClientDataFromCache();
    return cached ? this.initClientData(cached, this.clientDataCacheSource || 'localStorage') : false;
  },

  readClientDataFromCache() {
    const pageWindow = this.ctx?.pageWindow;
    try {
      // 游戏会把官方缓存工具挂到 window；document-start 阶段尚未就绪时再走兼容兜底。
      try {
        const localStorageUtil = pageWindow?.localStorageUtil;
        if (typeof localStorageUtil?.getInitClientData === 'function') {
          const officialData = localStorageUtil.getInitClientData();
          if (isClientData(officialData)) {
            this.clientDataCacheSource = 'localStorageUtil';
            return officialData;
          }
        }
      } catch (error) {
        console.warn('[MST] localStorageUtil.getInitClientData() failed:', error);
      }

      const tryParse = (json, tag) => {
        if (!json || typeof json !== 'string') return null;
        try {
          const parsed = JSON.parse(json);
          if (isClientData(parsed)) {
            this.clientDataCacheSource = 'localStorage(' + tag + ')';
            return parsed;
          }
        } catch {}
        return null;
      };
      const raw = localStorage.getItem('initClientData');
      if (raw) {
        try {
          const hit = tryParse(this.lzDecompressUTF16(raw), 'builtin-lz');
          if (hit) return hit;
        } catch {}
        try {
          if (typeof LZString !== 'undefined' && LZString.decompressFromUTF16) {
            const hit = tryParse(LZString.decompressFromUTF16(raw), 'global-lz');
            if (hit) return hit;
          }
        } catch {}
        const hit = tryParse(raw, 'plain-json');
        if (hit) return hit;
      }
      return null;
    } catch (error) {
      console.warn('[MWI-Integrated] initClientData cache read failed:', error);
      return null;
    }
  },

  getClientData() {
    return this.clientData.raw;
  },

  getClientDataMap(key) {
    return this.clientData.raw?.[key] || {};
  }
};

// data-hub-lz-string
const dataHubLzStringMethods = {
  // 最小化 LZString.decompressFromUTF16，优先用于读取游戏缓存。
  lzDecompressUTF16(input) {
    if (input == null || input === '') return '';
    const getValue = (index) => input.charCodeAt(index) - 32;
    const resetValue = 16384;
    let dictionary = [];
    let enlargeIn = 4;
    let dictSize = 4;
    let numBits = 3;
    let entry = '';
    let result = [];
    let w;
    let bits;
    let resb;
    let maxpower;
    let power;
    let c;
    let data = {val: getValue(0), position: resetValue, index: 1};
    for (let i = 0; i < 3; i++) dictionary[i] = i;
    const readBits = (count) => {
      let out = 0;
      maxpower = Math.pow(2, count);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getValue(data.index++);
        }
        out |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      return out;
    };
    bits = readBits(2);
    if (bits === 0) c = String.fromCharCode(readBits(8));
    else if (bits === 1) c = String.fromCharCode(readBits(16));
    else return '';
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
      if (data.index > input.length) return '';
      bits = readBits(numBits);
      switch ((c = bits)) {
        case 0:
          dictionary[dictSize++] = String.fromCharCode(readBits(8));
          c = dictSize - 1;
          enlargeIn--;
          break;
        case 1:
          dictionary[dictSize++] = String.fromCharCode(readBits(16));
          c = dictSize - 1;
          enlargeIn--;
          break;
        case 2:
          return result.join('');
      }
      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }
      if (dictionary[c]) entry = dictionary[c];
      else if (c === dictSize) entry = w + w.charAt(0);
      else return null;
      result.push(entry);
      dictionary[dictSize++] = w + entry.charAt(0);
      enlargeIn--;
      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }
      w = entry;
    }
  }
};

// data-hub-game-runtime
const dataHubGameRuntimeMethods = {
  installI18nBridge() {
    if (this.i18nBridgeInstalled) return true;
    const source = `
      (() => {
        if (window.__MST_I18N_BRIDGE_INSTALLED__) return;
        const pickResourceGroups = (resources) => {
          if (!resources || typeof resources !== 'object') return null;
          const result = {};
          ['en', 'zh'].forEach((lang) => {
            const translation = resources?.[lang]?.translation;
            if (!translation) return;
            result[lang] = {translation: {}};
            Object.entries(translation).forEach(([group, value]) => {
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[lang].translation[group] = value;
              }
            });
          });
          const hasGroups = ['en', 'zh'].some((lang) => Object.keys(result[lang]?.translation || {}).length > 0);
          return hasGroups ? result : null;
        };
        const getFiber = (element) => {
          const key = Reflect.ownKeys(element || {}).find((item) => String(item).startsWith('__reactFiber$'));
          return key ? element[key] : null;
        };
        const getFiberResources = () => {
          const nodes = [...document.querySelectorAll('#root, [class]')];
          for (const node of nodes) {
            let current = getFiber(node);
            while (current) {
              const props = current.memoizedProps || current.pendingProps || current.stateNode?.props;
              const resources = pickResourceGroups(props?.i18n?.options?.resources || props?.i18n?.store?.data);
              if (resources) return resources;
              current = current.return;
            }
          }
          return null;
        };
        const getResources = () =>
          pickResourceGroups(window.mwiHelper?.lang) ||
          pickResourceGroups(window.mwi?.lang) ||
          pickResourceGroups(window.i18next?.options?.resources) ||
          pickResourceGroups(window.i18next?.store?.data) ||
          getFiberResources();
        window.__MST_I18N_BRIDGE__ = {getResources};
        window.addEventListener('mst:i18n:request', (event) => {
          const id = JSON.parse(String(event.detail || '{}')).id;
          const resources = getResources();
          window.dispatchEvent(new CustomEvent('mst:i18n:response', {
            detail: JSON.stringify({id, ok: Boolean(resources), resources})
          }));
        });
        window.__MST_I18N_BRIDGE_INSTALLED__ = true;
      })();
    `;
    const {PageBridgeService} = this.ctx;
    this.i18nBridgeInstalled = PageBridgeService.install({
      key: 'i18n',
      label: '游戏语言资源桥',
      source
    });
    this.i18nBridgeInstallError = PageBridgeService.getError('i18n');
    return this.i18nBridgeInstalled;
  },

  requestI18nResourcesFromPage() {
    if (!this.installI18nBridge()) return null;
    const result = this.ctx.PageBridgeService.request({
      requestEvent: 'mst:i18n:request',
      responseEvent: 'mst:i18n:response',
      idPrefix: 'mst-i18n'
    });
    return result?.ok ? result.resources : null;
  },

  getReactFiber(element) {
    const key = Reflect.ownKeys(element || {}).find((k) => String(k).startsWith('__reactFiber$'));
    return key ? element[key] : null;
  },

  findGameHostFromFiber(fiber) {
    let current = fiber;
    while (current) {
      const host = current.stateNode;
      if (
        host &&
        typeof host === 'object' &&
        (typeof host.handleSwitchCharacter === 'function' || typeof host.handleGoToMarketplace === 'function')
      ) {
        return host;
      }
      current = current.return;
    }
    return null;
  },

  findGameHostFromDom() {
    const selectors = [
      '[class*="GamePage_gamePage__"]', '[class*="GamePage_gamePanel__"]', '[class*="GamePage_contentPanel__"]', '[class^="GamePage"]', '#root'
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const host = this.findGameHostFromFiber(this.getReactFiber(el));
        if (host) return host;
      }
    }
    return null;
  },

  getGameObject() {
    const {pageWindow} = this.ctx;
    try {
      if (pageWindow.mwiHelper?.game) return pageWindow.mwiHelper.game;
      if (pageWindow.mwi?.game) return pageWindow.mwi.game;
      return this.findGameHostFromDom();
    } catch {
      return null;
    }
  },

  getGameState() {
    const game = this.getGameObject();
    return game?.state && typeof game.state === 'object' ? game.state : game || {};
  },

  hasGameI18nResources(resources) {
    return [
      'en', 'zh'
    ].some((lang) => {
      const translation = resources?.[lang]?.translation;
      return (
        translation &&
        Object.values(translation).some(
          (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
        )
      );
    });
  },

  getGameI18nResources() {
    const {pageWindow} = this.ctx;
    const read = (getter) => {
      try {
        return getter();
      } catch {
        return null;
      }
    };
    const resources =
      read(() => pageWindow.mwiHelper?.lang) ||
      read(() => pageWindow.mwi?.lang) ||
      read(() => this.getGameObject()?.props?.i18n?.options?.resources) ||
      this.requestI18nResourcesFromPage() ||
      null;
    if (this.hasGameI18nResources(resources)) {
      this.clientData.i18nResources = resources;
      return resources;
    }
    return this.clientData.i18nResources;
  },

  startI18nResourceWatcher() {
    const {CONFIG} = this.ctx;
    if (this.i18nWatcherStarted || !CONFIG.isGameSite) return;
    this.i18nWatcherStarted = true;
    let count = 0;
    const timer = setInterval(() => {
      count++;
      const before = this.clientData.i18nResources;
      const resources = this.getGameI18nResources();
      if (resources && resources !== before) {
        this.refreshI18nIndexes();
        window.dispatchEvent(new CustomEvent('mst:i18n:ready', {detail: {source: 'game'}}));
        clearInterval(timer);
        return;
      }
      if (count >= 120) clearInterval(timer);
    }, 1000);
  }
};

// data-hub-i18n-indexes
const dataHubI18nIndexMethods = {
  refreshI18nIndexes() {
    const nameToHrid = new Map();
    const hridToName = new Map();
    const hridToNameEn = new Map();
    const hridToNameZh = new Map();
    const houseHridToNameEn = new Map();
    const houseHridToNameZh = new Map();
    const addName = (hrid, name, lang) => {
      if (!hrid || !name) return;
      const fullHrid = String(hrid).startsWith('/items/') ? String(hrid) : '/items/' + hrid;
      nameToHrid.set(String(name), fullHrid);
      nameToHrid.set(String(name).toLowerCase(), fullHrid);
      hridToName.set(fullHrid, String(name));
      if (lang === 'en') hridToNameEn.set(fullHrid, String(name));
      if (lang === 'zh') hridToNameZh.set(fullHrid, String(name));
    };
    try {
      const resources = this.getGameI18nResources();
      for (const langKey of [
        'en', 'zh'
      ]) {
        const names = resources?.[langKey]?.translation?.itemNames;
        if (names)
          Object.entries(names).forEach(
            ([
              hrid, name
            ]) => addName(hrid, name, langKey)
          );
        const houseNames = resources?.[langKey]?.translation?.houseRoomNames;
        if (houseNames) {
          const target = langKey === 'zh' ? houseHridToNameZh : houseHridToNameEn;
          Object.entries(houseNames).forEach(
            ([
              hrid, name
            ]) => target.set(hrid, String(name))
          );
        }
      }
    } catch {}
    Object.entries(this.clientData.indexes.itemDetailMap || {}).forEach(
      ([
        hrid, detail
      ]) => {
        addName(hrid, detail?.name, null);
        addName(hrid, detail?.nameZh, 'zh');
      }
    );
    this.clientData.indexes.nameToHrid = nameToHrid;
    this.clientData.indexes.hridToName = hridToName;
    this.clientData.indexes.hridToNameEn = hridToNameEn;
    this.clientData.indexes.hridToNameZh = hridToNameZh;
    this.clientData.indexes.houseHridToNameEn = houseHridToNameEn;
    this.clientData.indexes.houseHridToNameZh = houseHridToNameZh;
  },

  getItemDetail(hrid) {
    return this.clientData.indexes.itemDetailMap?.[hrid] || null;
  },

  getHouseDetail(hrid) {
    return this.clientData.indexes.houseRoomDetailMap?.[hrid] || null;
  },

  getHouseRoomDetailMap() {
    return this.clientData.indexes.houseRoomDetailMap || {};
  },

  hasHouseRoomData() {
    return Object.keys(this.clientData.indexes.houseRoomDetailMap || {}).length > 0;
  },

  resolveItemName(hrid) {
    const {i18n, utils} = this.ctx;
    const fullHrid = utils.normalizeItemHrid(hrid);
    const langMap = {zh: this.clientData.indexes.hridToNameZh, en: this.clientData.indexes.hridToNameEn}[
      i18n.languageKey
    ];
    return (
      langMap?.get(fullHrid) ||
      this.clientData.indexes.hridToName?.get(fullHrid) ||
      this.getItemDetail(fullHrid)?.name ||
      fullHrid.replace(/^\/items\//, '').replace(/_/g, ' ')
    );
  },

  ensureItemHrid(itemHridOrName) {
    const value = String(itemHridOrName || '').trim();
    if (!value) return null;
    if (value.startsWith('/items/')) return value;
    const hit =
      this.clientData.indexes.nameToHrid.get(value) || this.clientData.indexes.nameToHrid.get(value.toLowerCase());
    return hit || null;
  },

  getLocalizedGameName(group, hrid, lang = this.ctx.i18n.languageKey) {
    const {utils} = this.ctx;
    const resources = this.getGameI18nResources();
    const resource = resources?.[lang]?.translation?.[group]?.[hrid];
    if (resource) return String(resource);
    if (group === 'itemNames') return this.resolveItemName(hrid);
    let detailMap = {};
    if (group === 'skillNames') detailMap = this.getClientDataMap('skillDetailMap');
    else if (group === 'abilityNames') detailMap = this.getClientDataMap('abilityDetailMap');
    return detailMap?.[hrid]?.name || utils.substrLastSlash(hrid)?.replace(/_/g, ' ') || String(hrid || '');
  }
};

// data-hub-client-data
const dataHubClientDataMethods = {
  ...dataHubClientCacheMethods,
  ...dataHubLzStringMethods,
  ...dataHubGameRuntimeMethods,
  ...dataHubI18nIndexMethods
};

// data-hub-character-data
const dataHubCharacterDataMethods = {
  updateCharacterData(data, source) {
    if (!data || typeof data !== 'object') return false;
    this.characterData.raw = data;
    this.characterData.source = source || 'ws';
    this.characterData.updatedAt = Date.now();
    this.characterData.battleUnits.clear();
    this.rememberBattleUnit(data.combatUnit);
    window.dispatchEvent(new CustomEvent('mst:data:character-ready', {detail: data}));
    this.emitCharacterUpdate('init_character_data', [
      '*'
    ]);
    return true;
  },

  emitCharacterUpdate(type, fields) {
    this.characterData.source = 'ws:' + type;
    this.characterData.updatedAt = Date.now();
    window.dispatchEvent(
      new CustomEvent('mst:data:character-updated', {
        detail: {type, fields, raw: this.characterData.raw, updatedAt: this.characterData.updatedAt}
      })
    );
  },

  mergeCharacterArray(field, updates, getKey, removeWhen) {
    if (!this.characterData.raw || !Array.isArray(updates) || !updates.length) return false;
    const current = Array.isArray(this.characterData.raw[field]) ? this.characterData.raw[field] : [];
    const byKey = new Map();
    current.forEach((item) => {
      const key = getKey(item);
      if (key) byKey.set(key, item);
    });
    updates.forEach((item) => {
      const key = getKey(item);
      if (!key) return;
      if (removeWhen?.(item)) byKey.delete(key);
      else byKey.set(key, item);
    });
    this.characterData.raw[field] = [
      ...byKey.values()
    ];
    return true;
  },

  rememberBattleUnit(unit) {
    const characterId = unit?.character?.id ?? unit?.characterID ?? unit?.characterId;
    if (characterId == null) return false;
    this.characterData.battleUnits.set(String(characterId), unit);
    return true;
  },

  getBattleUnit(characterId) {
    return this.characterData.battleUnits.get(String(characterId)) || null;
  },

  getSharableCharacter(characterId) {
    const id = String(characterId);
    const raw = this.characterData.raw || {};
    return (
      raw.partyInfo?.sharableCharacterMap?.[id] ||
      raw.guildSharableCharacterMap?.[id] ||
      raw.friendCharacterMap?.[id] ||
      null
    );
  },

  applyCharacterMessage(message) {
    const raw = this.characterData.raw;
    if (!raw || !message || typeof message !== 'object') return [];
    const type = message.type || 'unknown';
    const changed = [];
    const replace = (field, value) => {
      raw[field] = value;
      changed.push(field);
    };

    if (type === 'character_updated' && message.character) replace('character', message.character);
    if (type === 'character_info_updated' && message.characterInfo) replace('characterInfo', message.characterInfo);
    if (type === 'setting_updated' && message.characterSetting) replace('characterSetting', message.characterSetting);
    if (type === 'character_stats_updated') {
      if (message.combatUnit) {
        replace('combatUnit', message.combatUnit);
        this.rememberBattleUnit(message.combatUnit);
      }
      if (message.noncombatStats) replace('noncombatStats', message.noncombatStats);
    }
    if (type === 'loadouts_updated' && message.characterLoadoutMap)
      replace('characterLoadoutMap', message.characterLoadoutMap);
    if (type === 'house_rooms_updated') {
      if (message.characterHouseRoomMap) replace('characterHouseRoomMap', message.characterHouseRoomMap);
      if (message.houseActionTypeBuffsMap) replace('houseActionTypeBuffsMap', message.houseActionTypeBuffsMap);
    }
    if (type === 'action_type_consumable_slots_updated') {
      if (Object.prototype.hasOwnProperty.call(message, 'actionTypeFoodSlotsMap')) {
        replace('actionTypeFoodSlotsMap', message.actionTypeFoodSlotsMap);
      }
      if (Object.prototype.hasOwnProperty.call(message, 'actionTypeDrinkSlotsMap')) {
        replace('actionTypeDrinkSlotsMap', message.actionTypeDrinkSlotsMap);
      }
    }
    if (type === 'community_buffs_updated') {
      if (Object.prototype.hasOwnProperty.call(message, 'communityBuffs')) {
        replace('communityBuffs', message.communityBuffs);
      }
      if (Object.prototype.hasOwnProperty.call(message, 'communityActionTypeBuffsMap')) {
        replace('communityActionTypeBuffsMap', message.communityActionTypeBuffsMap);
      }
    }
    if (type === 'personal_buffs_updated') {
      if (Object.prototype.hasOwnProperty.call(message, 'characterBuffs')) {
        replace('characterBuffs', message.characterBuffs);
      }
      if (Object.prototype.hasOwnProperty.call(message, 'personalActionTypeBuffsMap')) {
        replace('personalActionTypeBuffsMap', message.personalActionTypeBuffsMap);
      }
    }
    if (type === 'character_friends_updated' && message.friendCharacterMap)
      replace('friendCharacterMap', message.friendCharacterMap);
    if (type === 'guild_characters_updated') {
      if (message.guildCharacterMap) replace('guildCharacterMap', message.guildCharacterMap);
      if (message.guildSharableCharacterMap) replace('guildSharableCharacterMap', message.guildSharableCharacterMap);
      if (message.guildTrialSignupLevelMap) replace('guildTrialSignupLevelMap', message.guildTrialSignupLevelMap);
    }
    if (type === 'party_updated' && Object.prototype.hasOwnProperty.call(message, 'partyInfo')) {
      replace('partyInfo', message.partyInfo);
    }

    if (this.mergeCharacterArray('characterSkills', message.endCharacterSkills, (item) => item?.skillHrid)) {
      changed.push('characterSkills');
    }
    if (this.mergeCharacterArray('characterAbilities', message.endCharacterAbilities, (item) => item?.abilityHrid)) {
      changed.push('characterAbilities');
    }
    if (
      type === 'achievements_updated' &&
      this.mergeCharacterArray('characterAchievements', message.achievements, (item) => item?.achievementHrid)
    ) {
      changed.push('characterAchievements');
    }
    if (
      this.mergeCharacterArray(
        'characterItems',
        message.endCharacterItems,
        (item) => item?.hash || (item?.itemLocationHrid && item?.itemHrid ? [
                item.characterID || '', item.itemLocationHrid, item.itemHrid, item.enhancementLevel || 0
              ].join('::') : ''),
        (item) => Number(item?.count) === 0
      )
    ) {
      changed.push('characterItems');
    }

    if (type === 'battle_unit_fetched' && this.rememberBattleUnit(message.unit)) changed.push('battleUnits');

    if (changed.length)
      this.emitCharacterUpdate(type, [
        ...new Set(changed)
      ]);
    return changed;
  }
};

// data-hub-profiles
const dataHubProfileMethods = {
  normalizeProfileShared(profileMessage, receivedAt = Date.now()) {
    if (!profileMessage || typeof profileMessage !== 'object') return null;
    const profile =
      profileMessage.profile && typeof profileMessage.profile === 'object' ? profileMessage.profile : profileMessage;
    const firstWearable = Object.values(profile.wearableItemMap || {})[0];
    const firstHouseRoom = Object.values(profile.characterHouseRoomMap || {})[0];
    const characterID =
      profileMessage.characterID ??
      profileMessage.characterId ??
      profile.characterID ??
      profile.characterId ??
      profile.sharableCharacter?.id ??
      profile.characterSkills?.[0]?.characterID ??
      profile.equippedAbilities?.[0]?.characterID ??
      firstWearable?.characterID ??
      firstHouseRoom?.characterID;
    // profile_shared 本身没有可靠的数据时间，使用脚本实际收到该资料的时间。
    // receivedAt 仅用于恢复本地缓存，兼容旧缓存中的秒级时间戳。
    const rawTimestamp = receivedAt;
    const numericTimestamp = Number(rawTimestamp);
    let parsedTimestamp = Number.isFinite(numericTimestamp) ? numericTimestamp : Date.parse(rawTimestamp);
    if (Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 && parsedTimestamp < 1e12) {
      parsedTimestamp *= 1000;
    }
    return {
      type: 'profile_shared',
      profile,
      characterID,
      characterName: profileMessage.characterName || profile.sharableCharacter?.name || '',
      timestamp: Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : 0
    };
  },

  addProfileShared(profileMessage) {
    const storedProfile = this.normalizeProfileShared(profileMessage, Date.now());
    if (!storedProfile || storedProfile.characterID == null) return null;
    try {
      const id = String(storedProfile.characterID);
      this.characterData.profiles[id] = storedProfile;
      this.pruneProfiles();
      this.persistProfiles();
      window.dispatchEvent(new CustomEvent('mst:data:profile-shared', {detail: storedProfile}));
      return storedProfile;
    } catch (error) {
      console.warn('[MWI-Integrated] 保存队友资料失败:', error);
      return null;
    }
  },

  getProfile(characterId) {
    const {CONFIG} = this.ctx;
    const id = String(characterId);
    const profile = this.characterData.profiles?.[id] || null;
    if (!profile) return null;
    if (Date.now() - Number(profile.timestamp || 0) <= CONFIG.PROFILE_CACHE_TTL) return profile;
    delete this.characterData.profiles[id];
    this.persistProfiles();
    return null;
  },

  findProfileByName(characterName) {
    const {CONFIG} = this.ctx;
    const name = String(characterName || '').trim();
    if (!name) return null;
    return (
      Object.values(this.characterData.profiles || {}).find(
        (profile) =>
          profile.characterName === name && Date.now() - Number(profile.timestamp || 0) <= CONFIG.PROFILE_CACHE_TTL
      ) || null
    );
  },

  pruneProfiles() {
    const {CONFIG} = this.ctx;
    const cutoff = Date.now() - CONFIG.PROFILE_CACHE_TTL;
    const entries = Object.entries(this.characterData.profiles || {})
      .filter(
        ([
          , profile
        ]) => Number(profile?.timestamp || 0) >= cutoff
      )
      .sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0))
      .slice(0, CONFIG.PROFILE_CACHE_LIMIT);
    this.characterData.profiles = Object.fromEntries(entries);
  },

  // 存储裁剪：把完整 profile 压缩成名片渲染所需的最小字段集，避免占用 localStorage 配额。
  compactProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    const pick = (item, fields) => {
      if (!item || typeof item !== 'object') return item;
      const out = {};
      fields.forEach((field) => {
        if (item[field] != null) out[field] = item[field];
      });
      return out;
    };
    const wearableItemMap = {};
    Object.entries(profile.wearableItemMap || {}).forEach(
      ([
        key, item
      ]) => {
        const compactItem = pick(item, [
          'itemLocationHrid', 'itemHrid', 'enhancementLevel', 'count'
        ]);
        if (compactItem.itemHrid || compactItem.itemLocationHrid) wearableItemMap[key] = compactItem;
      }
    );
    const characterHouseRoomMap = {};
    Object.entries(profile.characterHouseRoomMap || {}).forEach(
      ([
        hrid, room
      ]) => {
        if (room && typeof room === 'object') {
          if (room.houseRoomHrid) characterHouseRoomMap[room.houseRoomHrid] = Number(room.level || 0);
        } else if (String(hrid).startsWith('/house_rooms/')) {
          characterHouseRoomMap[hrid] = Number(room || 0);
        }
      }
    );
    // 公会增益等级保持官方对象结构（hrid → {guildBuffHrid, level}），只去掉时间戳等无关字段，
    // 供着装评分公会神龛计算使用。
    const guildBuffLevelMap = {};
    Object.entries(profile.guildBuffLevelMap || {}).forEach(
      ([
        hrid, record
      ]) => {
        if (!record || typeof record !== 'object') return;
        const compactRecord = pick(record, [
          'guildBuffHrid', 'level'
        ]);
        if (compactRecord.level != null) guildBuffLevelMap[hrid] = compactRecord;
      }
    );
    return {
      ...pick(profile, [
        'combatLevel', 'hideWearableItems'
      ]),
      wearableItemMap,
      characterSkills: (profile.characterSkills || [])
        .map((skill) =>
          pick(skill, [
            'skillHrid', 'level'
          ])
        )
        .filter((skill) => skill.skillHrid),
      equippedAbilities: (profile.equippedAbilities || [])
        .map((ability) =>
          pick(ability, [
            'abilityHrid', 'level', 'slotNumber'
          ])
        )
        .filter((ability) => ability.abilityHrid),
      sharableCharacter:
        pick(profile.sharableCharacter, [
          'name', 'specialChatIconHrid', 'chatIconHrid', 'nameColorHrid', 'gameMode'
        ]) || {},
      characterHouseRoomMap,
      guildBuffLevelMap
    };
  },

  // 淘汰最旧一条资料，返回被删除的 [id, profile]，没有可删时返回 null。
  dropOldestProfile() {
    const entries = Object.entries(this.characterData.profiles || {});
    if (!entries.length) return null;
    const oldest = entries.reduce((min, entry) =>
      Number(entry[1]?.timestamp || 0) < Number(min[1]?.timestamp || 0) ? entry : min
    );
    delete this.characterData.profiles[oldest[0]];
    return oldest;
  },

  persistProfiles() {
    const {CONFIG} = this.ctx;
    const serialize = () => {
      const compacted = {};
      Object.entries(this.characterData.profiles || {}).forEach(
        ([
          id, profile
        ]) => {
          if (!profile || typeof profile !== 'object') return;
          compacted[id] = {...profile, profile: this.compactProfile(profile.profile)};
        }
      );
      return JSON.stringify(compacted);
    };
    const tryWrite = (json) => {
      try {
        localStorage.setItem(this.STORAGE_KEYS.PROFILE_CACHE, json);
        return true;
      } catch (error) {
        console.warn('[MST] 名片缓存写入失败，尝试淘汰最旧资料后重试:', error);
        return false;
      }
    };
    let json = serialize();
    // 超出容量上限时按最旧淘汰，直到能容纳为止（主要兜底旧版本存下的未裁剪大缓存）。
    while (json.length > CONFIG.PROFILE_CACHE_MAX_BYTES) {
      if (!this.dropOldestProfile()) break;
      json = serialize();
    }
    // 写入失败（配额已满等）时同样逐条淘汰后重试，避免缓存静默丢失。
    while (!tryWrite(json)) {
      if (!this.dropOldestProfile()) break;
      json = serialize();
    }
  },

  loadStoredProfiles() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.PROFILE_CACHE);
      const stored = raw ? JSON.parse(raw) : {};
      const profiles = Array.isArray(stored) ? stored : Object.values(stored || {});
      this.characterData.profiles = {};
      profiles.forEach((profile) => {
        const normalized = this.normalizeProfileShared(profile, profile?.timestamp || 0);
        if (normalized?.characterID != null) {
          this.characterData.profiles[String(normalized.characterID)] = normalized;
        }
      });
      this.pruneProfiles();
      this.persistProfiles();
    } catch {
      this.characterData.profiles = {};
    }
  }
};

// data-hub
export function createDataHub(ctx, STORAGE_KEYS) {
  const DataHub = {
    ctx,
    STORAGE_KEYS,
    clientData: {
      raw: null,
      source: 'pending',
      indexes: {
        itemDetailMap: {},
        houseRoomDetailMap: {},
        actionDetailMap: {},
        actionNameToHrid: new Map(),
        nameToHrid: new Map(),
        hridToName: new Map(),
        hridToNameEn: new Map(),
        hridToNameZh: new Map(),
        houseHridToNameEn: new Map(),
        houseHridToNameZh: new Map(),
        abilityBookByAbilityHrid: new Map()
      },
      i18nResources: null
    },
    characterData: {raw: null, profiles: {}, battleUnits: new Map(), source: '', updatedAt: 0},
    i18nWatcherStarted: false,
    i18nBridgeInstalled: false,
    i18nBridgeInstallError: '',
    clientDataCacheSource: '',

    init() {
      this.loadStoredProfiles();
      this.initClientDataFromCache();
      this.refreshI18nIndexes();
      this.startI18nResourceWatcher();
    }
  };
  Object.assign(DataHub, dataHubClientDataMethods, dataHubCharacterDataMethods, dataHubProfileMethods);

  return DataHub;
}

// character-data-service
export function createCharacterDataService(ctx, DataHub) {
  // utils 由 installRuntimeHelpers 在 installDataModule 之后才挂到 ctx，
  // 这里必须延迟到调用时解析：构造时解构会把 utils 冻结为 undefined，
  // 导致 getLevelExperience 等依赖 clampLevel 的方法在运行时崩溃。
  const CharacterDataService = {
    get utils() {
      return ctx.utils;
    },

    get raw() {
      return DataHub.characterData.raw;
    },

    getCharacterItems() {
      const raw = this.raw;
      if (Array.isArray(raw?.characterItems)) return raw.characterItems;
      return this.utils.getCollectionValues(DataHub.getGameState().characterItemMap);
    },

    getCharacterSkills() {
      if (Array.isArray(this.raw?.characterSkills)) return this.raw.characterSkills;
      return this.utils.getCollectionValues(DataHub.getGameState().characterSkillMap);
    },

    getCharacterAbilities() {
      if (Array.isArray(this.raw?.characterAbilities)) return this.raw.characterAbilities;
      return this.utils.getCollectionValues(DataHub.getGameState().characterAbilityMap);
    },

    getCharacterSkill(skillHrid) {
      return this.getCharacterSkills().find((skill) => skill?.skillHrid === skillHrid) || null;
    },

    getCharacterAbility(abilityHrid) {
      return this.getCharacterAbilities().find((ability) => ability?.abilityHrid === abilityHrid) || null;
    },

    getLevelExperience(level) {
      const table = DataHub.getClientData()?.levelExperienceTable || [];
      const safeLevel = this.utils.clampLevel(level, 0, 200);
      return Number(table[safeLevel] || 0);
    },

    getLevelExperiencePercent(level, experience) {
      const startExperience = this.getLevelExperience(level);
      const nextExperience = this.getLevelExperience(Math.min(200, Number(level || 0) + 1));
      const levelExperience = nextExperience - startExperience;
      if (levelExperience <= 0) return 0;
      return Math.min(100, Math.max(0, ((Number(experience || 0) - startExperience) / levelExperience) * 100));
    },

    getCombatSkills() {
      const detailMap = DataHub.getClientDataMap('skillDetailMap');
      return Object.values(detailMap)
        .filter((detail) => detail?.isCombat && detail.hrid !== '/skills/total_level')
        .sort((left, right) => Number(left.sortIndex || 0) - Number(right.sortIndex || 0))
        .map((detail) => ({
          detail,
          characterSkill: this.getCharacterSkill(detail.hrid) || {skillHrid: detail.hrid, level: 0, experience: 0}
        }));
    },

    getAbilityBooks() {
      const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
      return [
        ...(DataHub.clientData.indexes.abilityBookByAbilityHrid?.values() || [])
      ]
        .map((book) => ({book, ability: abilityMap[book.abilityBookDetail.abilityHrid] || null}))
        .sort(
          (left, right) =>
            Number(left.ability?.sortIndex || left.book?.sortIndex || 0) -
            Number(right.ability?.sortIndex || right.book?.sortIndex || 0)
        );
    },

    getAbilityBook(abilityHrid) {
      return DataHub.clientData.indexes.abilityBookByAbilityHrid?.get(abilityHrid) || null;
    },

    getInventoryCount(itemHrid, level = 0) {
      const fullHrid = this.utils.normalizeItemHrid(itemHrid);
      if (!fullHrid) return 0;
      const targetLevel = Math.max(0, Number(level) || 0);
      let count = 0;
      for (const item of this.getCharacterItems()) {
        if (!item || item.itemHrid !== fullHrid) continue;
        if ((item.enhancementLevel || 0) !== targetLevel) continue;
        if (item.itemLocationHrid && item.itemLocationHrid !== '/item_locations/inventory') continue;
        count += Number(item.count || 0);
      }
      return count;
    }
  };

  return CharacterDataService;
}

// web-socket-service
export function createWebSocketService(ctx, DataHub) {
  const {pageWindow} = ctx;

  const WebSocketService = {
    installed: false,
    // 战斗过程消息更新频繁，且不属于 MST 维护的角色状态数据。
    ignoredMessageTypes: new Set([
      'new_battle', 'battle_updated', 'battle_consumable_ability_updated', 'new_guild_battle', 'guild_battle_updated',
      'end_guild_battle'
    ]),

    install() {
      let alreadyInstalled = false;
      try {
        alreadyInstalled = pageWindow.__mwiIntegratedWsInstalled === true;
      } catch {}
      if (this.installed || alreadyInstalled) return;
      const self = this;
      const onMessage = (event) => self.handleMessage(event.detail);
      const onSend = (event) => self.dispatch('mst:ws:send', self.safeParse(event.detail) || event.detail);
      window.addEventListener('mst:ws:message-raw', onMessage);
      window.addEventListener('mst:ws:send-raw', onSend);
      const installed = ctx.PageBridgeService.install({
        key: 'websocket',
        label: '游戏 WebSocket 数据桥',
        source: `
        (() => {
          if (window.__mwiIntegratedWsInstalled) return;
          const OriginalWebSocket = window.WebSocket;
          if (!OriginalWebSocket) return;
          const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, {detail}));
          function IntegratedWebSocket(...args) {
            const ws = new OriginalWebSocket(...args);
            const url = String(args[0] || '');
            const isGameWs = url.includes('milkywayidle.com/ws') || url.includes('milkywayidlecn.com/ws') || url.includes('/ws');
            if (!isGameWs) return ws;
            const originalSend = ws.send;
            ws.send = function(data) {
              if (typeof data === 'string') emit('mst:ws:send-raw', data);
              return originalSend.call(this, data);
            };
            ws.addEventListener('message', (event) => {
              if (typeof event.data === 'string') emit('mst:ws:message-raw', event.data);
            });
            return ws;
          }
          IntegratedWebSocket.prototype = OriginalWebSocket.prototype;
          IntegratedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
          IntegratedWebSocket.OPEN = OriginalWebSocket.OPEN;
          IntegratedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
          IntegratedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
          window.WebSocket = IntegratedWebSocket;
          window.__mwiIntegratedWsInstalled = true;
        })();
      `
      });
      if (!installed) {
        window.removeEventListener('mst:ws:message-raw', onMessage);
        window.removeEventListener('mst:ws:send-raw', onSend);
        return;
      }
      this.installed = true;
    },

    safeParse(data) {
      try {
        return typeof data === 'string' ? JSON.parse(data) : data;
      } catch {
        return null;
      }
    },

    dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, {detail}));
    },

    handleMessage(message) {
      const obj = this.safeParse(message);
      if (!obj || typeof obj !== 'object') return;
      if (this.ignoredMessageTypes.has(obj.type)) return;
      this.dispatch('mst:ws:message', obj);
      if (obj.type === 'init_client_data') {
        DataHub.initClientData(obj, 'ws');
        this.dispatch('mst:ws:init-client-data', obj);
      } else if (obj.type === 'init_character_data') {
        DataHub.updateCharacterData(obj, 'ws');
        this.dispatch('mst:ws:init-character-data', obj);
      } else if (obj.type === 'profile_shared') {
        DataHub.addProfileShared(obj);
        this.dispatch('mst:ws:profile-shared', obj);
      } else {
        DataHub.applyCharacterMessage(obj);
      }
    }
  };

  return WebSocketService;
}

// runtime-data
export function installDataModule(ctx) {
  const {CONFIG} = ctx;
  const DataHub = createDataHub(ctx, STORAGE_KEYS);
  const CharacterDataService = createCharacterDataService(ctx, DataHub);
  const WebSocketService = createWebSocketService(ctx, DataHub);

  if (CONFIG.isGameSite) {
    DataHub.init();
    WebSocketService.install();
  }
  const houseDetails = CONFIG.isGameSite ? DataHub.getHouseRoomDetailMap() : {};

  ctx.STORAGE_KEYS = STORAGE_KEYS;
  ctx.DataHub = DataHub;
  ctx.CharacterDataService = CharacterDataService;
  ctx.WebSocketService = WebSocketService;
  ctx.houseDetails = houseDetails;
}
