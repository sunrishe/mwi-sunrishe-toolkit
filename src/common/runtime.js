// style-service
export const StyleService = {
  pending: new Map(),

  ensure(id, css) {
    const styleId = String(id || '').trim();
    if (!styleId) throw new TypeError('Style id is required');

    const existing = document.getElementById(styleId);
    if (existing) return existing;
    if (this.pending.has(styleId)) return this.pending.get(styleId);

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = String(css || '');
    this.pending.set(styleId, style);

    const mount = () => {
      if (!document.getElementById(styleId)) document.head?.appendChild(style);
      this.pending.delete(styleId);
    };
    if (document.head) mount();
    else document.addEventListener('DOMContentLoaded', mount, {once: true});
    return style;
  }
};

// game-ui-adapter
export function createGameUiAdapter() {
  const GameUiAdapter = {
    selectors: {
      housePanel: '[class*="HousePanel_housePanel__"]',
      houseButtonContainer: '[class*="HousePanel_buttonContainer__"]',
      houseTitle: '[class*="HousePanel_title__"]',
      equipmentPanel: '[class*="EquipmentPanel_equipmentPanel__"]',
      equipmentButtonContainer: '[class*="EquipmentPanel_buttonContainer__"]',
      selectedLoadout: '[class*="LoadoutsPanel_selectedLoadout__"]',
      loadoutDetails: '[class*="LoadoutsPanel_details__"], [class*="details"]',
      loadoutMetadata: '[class*="LoadoutsPanel_metadata__"], [class*="metadata"]',
      characterName: '[class*="CharacterName_characterName__"]',
      header: '[class*="Header_header__"]',
      headerAvatar: '[class*="Header_avatar"]',
      headerCharacterInfo: '[class*="Header_characterInfo"]',
      headerNameData: '[class*="Header_name"] [data-name]',
      gameButton: 'button[class*="Button_button__"]'
    },

    query(name, root = document) {
      const selector = this.selectors[name];
      if (!selector || !root?.querySelectorAll) return null;
      return [
          ...root.querySelectorAll(selector)
        ].find((element) => !element.closest('.mst-character-card-modal, .mst-skill-selector-modal')) || null;
    },

    queryAll(name, root = document) {
      const selector = this.selectors[name];
      if (!selector || !root?.querySelectorAll) return [];
      return [
        ...root.querySelectorAll(selector)
      ].filter((element) => !element.closest('.mst-character-card-modal, .mst-skill-selector-modal'));
    }
  };

  return GameUiAdapter;
}

// sprite-service
export function createSpriteService() {
  const SpriteService = {
    defaults: {
      items: '/static/media/items_sprite.f58c9476.svg',
      skills: '/static/media/skills_sprite.3bb4d936.svg',
      abilities: '/static/media/abilities_sprite.fdd1b4de.svg',
      misc: '/static/media/misc_sprite.cfad291b.svg',
      chatIcons: '/static/media/chat_icons_sprite.628944de.svg'
    },
    markers: {
      items: 'items_sprite',
      skills: 'skills_sprite',
      abilities: 'abilities_sprite',
      misc: 'misc_sprite',
      chatIcons: 'chat_icons_sprite'
    },
    paths: new Map(),
    domRevision: 0,
    scannedRevision: -1,

    getUseHref(useElement) {
      return useElement?.getAttribute('href') || useElement?.getAttribute('xlink:href') || '';
    },

    markDomChanged() {
      this.domRevision += 1;
    },

    refresh() {
      this.scannedRevision = -1;
      this.scanPage();
    },

    scanPage() {
      if (this.scannedRevision === this.domRevision) return;
      this.scannedRevision = this.domRevision;
      const unresolved = new Set(Object.keys(this.markers));
      for (const useElement of document.querySelectorAll('svg use')) {
        const href = this.getUseHref(useElement);
        if (!href.includes('#')) continue;
        const spritePath = href.split('#')[0];
        for (const type of unresolved) {
          if (!spritePath.includes(this.markers[type])) continue;
          this.paths.set(type, spritePath);
          unresolved.delete(type);
          break;
        }
        if (!unresolved.size) break;
      }
    },

    get(spriteName) {
      const name = String(spriteName || '').replace(/_sprite$/, '');
      const type = name === 'chat_icons' ? 'chatIcons' : name;
      if (!this.markers[type]) return '';
      this.scanPage();
      return this.paths.get(type) || this.defaults[type] || '';
    }
  };

  return SpriteService;
}

// dom-observer-service
export function createDomObserverService(SpriteService) {
  const DomObserverService = {
    subscribers: new Set(),
    observer: null,
    scheduled: false,
    waitingForBody: false,
    options: {childList: true, subtree: true},

    runCallbacks(callbacks) {
      if (!document.body || !callbacks.length) return;
      this.observer?.disconnect();
      try {
        callbacks.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            console.error('[MST] DOM observer callback failed:', error);
          }
        });
      } finally {
        this.observe();
      }
    },

    observe() {
      if (!document.body || !this.subscribers.size) return;
      if (!this.observer) {
        this.observer = new MutationObserver(() => {
          SpriteService.markDomChanged();
          this.schedule();
        });
      }
      this.observer.observe(document.body, this.options);
    },

    schedule() {
      if (this.scheduled || !this.subscribers.size) return;
      this.scheduled = true;
      const runCallbacks = () => {
        this.scheduled = false;
        this.runCallbacks([
          ...this.subscribers
        ]);
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(runCallbacks);
      else setTimeout(runCallbacks, 0);
    },

    handleBodyReady() {
      this.waitingForBody = false;
      this.runCallbacks([
        ...this.subscribers
      ]);
    },

    subscribe(callback) {
      if (typeof callback !== 'function') throw new TypeError('DOM observer callback must be a function');
      this.subscribers.add(callback);
      if (document.body) {
        this.runCallbacks([
          callback
        ]);
      } else if (!this.waitingForBody) {
        this.waitingForBody = true;
        document.addEventListener('DOMContentLoaded', this.handleBodyReady.bind(this), {once: true});
      }
      let disconnected = false;
      return {
        disconnect: () => {
          if (disconnected) return;
          disconnected = true;
          this.subscribers.delete(callback);
          if (!this.subscribers.size) this.observer?.disconnect();
        }
      };
    }
  };

  // ==================== 公共工具 ====================

  return DomObserverService;
}

// gm-api
export function createGmApi() {
  const getModernApi = (name) =>
    typeof GM !== 'undefined' && typeof GM?.[name] === 'function' ? GM[name].bind(GM) : null;

  const GmApi = {
    getValueApi() {
      if (typeof GM_getValue === 'function') return GM_getValue;
      return getModernApi('getValue');
    },

    setValueApi() {
      if (typeof GM_setValue === 'function') return GM_setValue;
      return getModernApi('setValue');
    },

    addValueChangeListenerApi() {
      if (typeof GM_addValueChangeListener === 'function') return GM_addValueChangeListener;
      return getModernApi('addValueChangeListener');
    },

    xmlHttpRequestApi() {
      if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
      return getModernApi('xmlHttpRequest');
    },

    setClipboardApi() {
      if (typeof GM_setClipboard === 'function') return GM_setClipboard;
      return getModernApi('setClipboard');
    },

    async getValue(key, defaultValue = undefined) {
      const getValue = this.getValueApi();
      return getValue ? getValue(key, defaultValue) : defaultValue;
    },

    setValue(key, value) {
      const setValue = this.setValueApi();
      return setValue ? setValue(key, value) : undefined;
    },

    addValueChangeListener(key, callback) {
      const addValueChangeListener = this.addValueChangeListenerApi();
      return addValueChangeListener ? addValueChangeListener(key, callback) : null;
    },

    xmlHttpRequest(details) {
      const request = this.xmlHttpRequestApi();
      return request ? request(details) : null;
    },

    setClipboard(text, type = 'text') {
      const setClipboard = this.setClipboardApi();
      return setClipboard ? setClipboard(String(text), type) : undefined;
    }
  };

  return GmApi;
}

// page-bridge-service
export function createPageBridgeService(ctx) {
  const {pageWindow} = ctx;

  const PageBridgeService = {
    installed: new Set(),
    errors: new Map(),
    sequence: 0,

    install({key, source, label = key}) {
      if (!key || !source) throw new TypeError('Page bridge key and source are required');
      if (this.installed.has(key)) return true;
      try {
        if (typeof pageWindow?.Function !== 'function') throw new Error('pageWindow.Function is not available');
        pageWindow.Function(String(source))();
        this.installed.add(key);
        this.errors.delete(key);
        return true;
      } catch (error) {
        this.errors.set(key, error?.message || String(error));
      }
      try {
        const script = document.createElement('script');
        script.textContent = String(source);
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        this.installed.add(key);
        this.errors.delete(key);
        return true;
      } catch (error) {
        const message = error?.message || String(error);
        this.errors.set(key, message);
        console.warn('[MST] 安装页面桥失败:', {label, error: message});
        return false;
      }
    },

    getError(key) {
      return this.errors.get(key) || '';
    },

    request({requestEvent, responseEvent, payload = {}, idPrefix = 'mst-bridge'}) {
      const id = idPrefix + '-' + ++this.sequence;
      let result = null;
      const handleResponse = (event) => {
        try {
          const detail = JSON.parse(String(event.detail || '{}'));
          if (detail.id === id) result = detail;
        } catch {}
      };
      window.addEventListener(responseEvent, handleResponse);
      window.dispatchEvent(new CustomEvent(requestEvent, {detail: JSON.stringify({id, ...payload})}));
      window.removeEventListener(responseEvent, handleResponse);
      return result;
    }
  };

  return PageBridgeService;
}

// runtime-utils
export function createRuntimeUtils(ctx, {SpriteService, DomObserverService}) {
  const {DataHub, GmApi, i18n} = ctx;

  const utils = {
    substrLastSlash(hrid) {
      return String(hrid || '').substring(String(hrid || '').lastIndexOf('/') + 1);
    },

    getSvgUseHref(useElement) {
      return SpriteService.getUseHref(useElement);
    },

    getSvgSpriteUrl(useSelector) {
      const href = this.getSvgUseHref(document.querySelector(useSelector));
      return href.includes('#') ? href.split('#')[0] : '';
    },

    getSpriteUrl(spriteName) {
      return SpriteService.get(spriteName);
    },

    clampLevel(value, min, max) {
      const num = parseInt(value, 10);
      if (Number.isNaN(num)) return min;
      return Math.min(max, Math.max(min, num));
    },

    getCollectionValues(collection) {
      if (Array.isArray(collection)) return collection;
      if (collection instanceof Map) return [
          ...collection.values()
        ];
      if (collection && typeof collection === 'object') return Object.values(collection);
      return [];
    },

    normalizeItemHrid(value) {
      const itemId = String(value || '')
        .replace(/^#/, '')
        .replace(/^\/items\//, '');
      return itemId ? '/items/' + itemId : '';
    },

    normalizeItemId(itemHrid) {
      return String(itemHrid || '').replace(/^\/items\//, '');
    },

    getItemName(itemHrid) {
      const itemId = this.normalizeItemId(itemHrid);
      const fallback = itemId.replace(/_/g, ' ');
      return DataHub.resolveItemName(itemHrid) || fallback;
    },

    getHouseName(hrid) {
      const room = DataHub.getHouseDetail(hrid);
      const langMap = {
        zh: DataHub.clientData.indexes.houseHridToNameZh,
        en: DataHub.clientData.indexes.houseHridToNameEn
      }[i18n.languageKey];
      return langMap?.get(hrid) || room?.name || hrid;
    },

    getReactProps(el) {
      const key = Reflect.ownKeys(el || {}).find((k) => String(k).startsWith('__reactProps'));
      return key ? el[key] : null;
    },

    getReactComponentProps(el) {
      const props = this.getReactProps(el);
      return props?.children?.[0]?._owner?.memoizedProps || props?._owner?.memoizedProps || props || null;
    },

    getItemByHash(hash) {
      const parts = String(hash || '').split('::');
      if (parts.length !== 4) return null;
      return {itemHrid: parts[2], enhancementLevel: Number(parts[3]) || 0};
    },

    getTextBetween(start, end) {
      let text = '';
      let current = start?.nextSibling;
      while (current && current !== end) {
        if (current.nodeType === Node.TEXT_NODE) text += current.textContent || '';
        current = current.nextSibling;
      }
      return text;
    },

    async writeClipboard(text) {
      if (GmApi?.setClipboardApi()) {
        await GmApi.setClipboard(String(text), 'text');
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error(i18n.t('clipboardUnavailable'));
      await navigator.clipboard.writeText(String(text));
    },

    async readClipboard() {
      if (!navigator.clipboard?.readText) throw new Error(i18n.t('clipboardUnavailable'));
      return navigator.clipboard.readText();
    },

    formatMarketTime(timestamp) {
      if (!timestamp) return i18n.t('marketNoData');
      const date = new Date(timestamp * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return y + '.' + m + '.' + d + ' ' + hh + ':' + mm;
    },

    formatLocalFileTime(date = new Date()) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return y + m + d + '-' + hh + mm + ss;
    },

    formatCompactNumber(value, maximumFractionDigits = 2) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '-';
      const units = [
        {value: 1e12, suffix: 'T'}, {value: 1e9, suffix: 'B'}, {value: 1e6, suffix: 'M'}, {value: 1e3, suffix: 'K'}
      ];
      const unit = units.find((entry) => Math.abs(number) >= entry.value);
      const scaled = unit ? number / unit.value : number;
      const formatted = scaled.toLocaleString(undefined, {maximumFractionDigits, minimumFractionDigits: 0});
      return formatted + (unit?.suffix || '');
    },

    formatDateTime(value) {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString(i18n.locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    },

    getGameButtonClass() {
      const button = document.querySelector('button[class*="Button_button"]');
      return [
          ...(button?.classList || [])
        ].find((className) => className.startsWith('Button_button')) || 'Button_button__1Fe9z';
    },

    createLevelOptions(min, max, selected) {
      let html = '';
      for (let level = min; level <= max; level++) {
        html += '<option value="' + level + '"' + (level === selected ? ' selected' : '') + '>' + level + '</option>';
      }
      return html;
    },

    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    ensureButton({host, id, text, title = '', className = '', prepend = false, onClick}) {
      if (!host) return null;
      const existing = id ? document.getElementById(id) : null;
      if (existing) return existing;
      const button = document.createElement('button');
      if (id) button.id = id;
      if (className) button.className = className;
      button.type = 'button';
      button.textContent = text;
      if (title) button.title = title;
      if (typeof onClick === 'function') button.addEventListener('click', onClick);
      if (prepend) host.prepend(button);
      else host.appendChild(button);
      return button;
    },

    observeBody(callback) {
      return DomObserverService.subscribe(callback);
    }
  };

  return utils;
}

// game-navigation-service
export function createGameNavigationService(ctx) {
  const {DataHub, pageWindow, PageBridgeService, utils} = ctx;

  const GameNavigationService = {
    bridgeInstalled: false,
    bridgeInstallError: '',

    installPageBridge() {
      if (this.bridgeInstalled) return true;
      const source = `
        (() => {
          if (window.__MST_NAV_BRIDGE_INSTALLED__) return;
          const getFiber = (element) => {
            const key = Reflect.ownKeys(element || {}).find((item) => String(item).startsWith('__reactFiber$'));
            return key ? element[key] : null;
          };
          const findHostFromFiber = (fiber) => {
            let current = fiber;
            while (current) {
              const host = current.stateNode;
              if (
                host &&
                typeof host === 'object' &&
                (typeof host.handleSwitchCharacter === 'function' ||
                  typeof host.handleGoToMarketplace === 'function')
              ) {
                return host;
              }
              current = current.return;
            }
            return null;
          };
          const getCandidates = () => {
            const selectors = [
              '[class*="GamePage_gamePage__"]',
              '[class*="GamePage_gamePanel__"]',
              '[class*="GamePage_contentPanel__"]',
              '[class*="Header_header__"]',
              '[class^="GamePage"]',
              '#root'
            ];
            const nodes = [];
            selectors.forEach((selector) => {
              document.querySelectorAll(selector).forEach((node) => nodes.push(node));
            });
            if (!nodes.length) {
              document.querySelectorAll('[class]').forEach((node) => nodes.push(node));
            }
            return [...new Set(nodes)];
          };
          const findHost = () => {
            if (window.mwiHelper?.game) return window.mwiHelper.game;
            if (window.mwi?.game) return window.mwi.game;
            for (const node of getCandidates()) {
              const host = findHostFromFiber(getFiber(node));
              if (host) return host;
            }
            return null;
          };
          const getDiagnostics = () => {
            const candidates = getCandidates();
            const candidateSummary = candidates.slice(0, 30).map((node) => ({
              tagName: node.tagName || '',
              className: String(node.className || '').slice(0, 180),
              hasFiber: Boolean(getFiber(node))
            }));
            const host = findHost();
            const hostKeys = host ? Reflect.ownKeys(host).map(String).sort() : [];
            return {
              pageContext: true,
              hasHost: Boolean(host),
              hostConstructor: host?.constructor?.name || '',
              hostKeys,
              functionKeys: hostKeys.filter((key) => typeof host?.[key] === 'function'),
              hasSwitchCharacter: typeof host?.handleSwitchCharacter === 'function',
              hasGoToMarketplace: typeof host?.handleGoToMarketplace === 'function',
              candidateCount: candidates.length,
              candidateSummary
            };
          };
          window.__MST_NAV_BRIDGE__ = {
            getDiagnostics,
            switchCharacter() {
              const host = findHost();
              if (typeof host?.handleSwitchCharacter !== 'function') return {ok: false, diagnostics: getDiagnostics()};
              host.handleSwitchCharacter.call(host);
              return {ok: true, diagnostics: getDiagnostics()};
            },
            openMarketplace(itemHrid, enhancementLevel) {
              const host = findHost();
              if (typeof host?.handleGoToMarketplace !== 'function') return {ok: false, diagnostics: getDiagnostics()};
              host.handleGoToMarketplace.call(host, itemHrid, Number(enhancementLevel) || 0);
              return {ok: true, diagnostics: getDiagnostics()};
            }
          };
          const respond = (id, action, result) => {
            window.dispatchEvent(new CustomEvent('mst:navigation:result', {
              detail: JSON.stringify({id, action, ...result})
            }));
          };
          window.addEventListener('mst:navigation:switch-character', (event) => {
            const detail = JSON.parse(String(event.detail || '{}'));
            respond(detail.id, 'switchCharacter', window.__MST_NAV_BRIDGE__.switchCharacter());
          });
          window.addEventListener('mst:navigation:open-marketplace', (event) => {
            const detail = JSON.parse(String(event.detail || '{}'));
            respond(
              detail.id,
              'openMarketplace',
              window.__MST_NAV_BRIDGE__.openMarketplace(detail.itemHrid, detail.enhancementLevel)
            );
          });
          window.__MST_NAV_BRIDGE_INSTALLED__ = true;
        })();
      `;
      this.bridgeInstalled = PageBridgeService.install({
        key: 'navigation',
        label: '页面原生跳转桥',
        source
      });
      this.bridgeInstallError = PageBridgeService.getError('navigation');
      return this.bridgeInstalled;
    },

    dispatchBridgeAction(action, payload = {}) {
      if (!this.installPageBridge()) return null;
      const eventName =
        action === 'switchCharacter' ? 'mst:navigation:switch-character' : 'mst:navigation:open-marketplace';
      return PageBridgeService.request({
        requestEvent: eventName,
        responseEvent: 'mst:navigation:result',
        idPrefix: 'mst-nav',
        payload
      });
    },

    getHost() {
      let host = null;
      try {
        host = DataHub.getGameObject();
      } catch (error) {
        console.warn('[MST] 读取游戏原生入口对象失败:', {error: error?.message || String(error)});
        return null;
      }
      return host && typeof host === 'object' ? host : null;
    },

    getHostDiagnostics(action, extra = {}) {
      const host = this.getHost();
      const read = (getter, fallback) => {
        try {
          return getter();
        } catch (error) {
          return fallback ?? '[read failed] ' + (error?.message || String(error));
        }
      };
      let hostKeys = [];
      let functionKeys = [];
      let hostReadError = '';
      try {
        hostKeys = host ? Reflect.ownKeys(host).map(String).sort() : [];
        functionKeys = hostKeys.filter((key) => {
          try {
            return typeof host?.[key] === 'function';
          } catch {
            return false;
          }
        });
      } catch (error) {
        hostReadError = error?.message || String(error);
      }
      const marketMate = read(() => pageWindow.MWIMM, null);
      return {
        action,
        characterId: DataHub.characterData?.raw?.character?.id ?? null,
        hasHost: Boolean(host),
        bridgeInstalled: this.bridgeInstalled,
        bridgeInstallError: this.bridgeInstallError,
        hostConstructor: read(() => host?.constructor?.name || '', ''),
        hostKeys,
        functionKeys,
        hostReadError,
        hasSwitchCharacter: read(() => typeof host?.handleSwitchCharacter === 'function', false),
        hasGoToMarketplace: read(() => typeof host?.handleGoToMarketplace === 'function', false),
        marketMateReady: read(() => marketMate?.ready === true, false),
        hasMarketMateOpenMarketplace: read(() => typeof marketMate?.openMarketplace === 'function', false),
        location: window.location.href,
        ...extra
      };
    },

    warnUnavailable(action, extra = {}) {
      console.warn('[MST] 未找到游戏原生跳转入口:', this.getHostDiagnostics(action, extra));
    },

    switchCharacter() {
      const bridgeResult = this.dispatchBridgeAction('switchCharacter');
      if (bridgeResult?.ok) return true;
      if (bridgeResult && !bridgeResult.ok) {
        this.warnUnavailable('switchCharacter', {bridgeDiagnostics: bridgeResult.diagnostics || null});
        return false;
      }
      const host = this.getHost();
      let switchCharacter = null;
      try {
        switchCharacter = typeof host?.handleSwitchCharacter === 'function' ? host.handleSwitchCharacter : null;
      } catch (error) {
        this.warnUnavailable('switchCharacter', {accessError: error?.message || String(error)});
        return false;
      }
      if (!switchCharacter) {
        this.warnUnavailable('switchCharacter', {bridgeNoResponse: this.bridgeInstalled});
        return false;
      }
      switchCharacter.call(host);
      return true;
    },

    openMarketplace(itemHrid, enhancementLevel = 0) {
      const fullHrid = utils.normalizeItemHrid(itemHrid);
      if (!fullHrid) return false;
      const bridgeResult = this.dispatchBridgeAction('openMarketplace', {
        itemHrid: fullHrid,
        enhancementLevel: Number(enhancementLevel) || 0
      });
      if (bridgeResult?.ok) return true;
      if (bridgeResult && !bridgeResult.ok) {
        this.warnUnavailable('openMarketplace', {
          itemHrid,
          fullHrid,
          enhancementLevel: Number(enhancementLevel) || 0,
          bridgeDiagnostics: bridgeResult.diagnostics || null
        });
        return false;
      }
      const host = this.getHost();
      let goToMarketplace = null;
      try {
        goToMarketplace = typeof host?.handleGoToMarketplace === 'function' ? host.handleGoToMarketplace : null;
      } catch (error) {
        this.warnUnavailable('openMarketplace', {itemHrid, fullHrid, accessError: error?.message || String(error)});
        return false;
      }
      if (goToMarketplace) {
        goToMarketplace.call(host, fullHrid, Number(enhancementLevel) || 0);
        return true;
      }
      let marketMate = null;
      try {
        marketMate = pageWindow.MWIMM;
        if (marketMate?.ready === true && typeof marketMate.openMarketplace === 'function') {
          return marketMate.openMarketplace(fullHrid) === true;
        }
      } catch (error) {
        this.warnUnavailable('openMarketplace', {itemHrid, fullHrid, accessError: error?.message || String(error)});
        return false;
      }
      this.warnUnavailable('openMarketplace', {
        itemHrid,
        fullHrid,
        enhancementLevel: Number(enhancementLevel) || 0,
        bridgeNoResponse: this.bridgeInstalled
      });
      return false;
    }
  };

  return GameNavigationService;
}

// market-mate-bridge
export function createMarketMateBridge(ctx) {
  const {pageWindow} = ctx;

  const MarketMateBridge = {
    callbacks: new Set(),
    timer: null,
    attempts: 0,

    getApi() {
      const api = pageWindow.MWIMM;
      return api && typeof api.addToCart === 'function' ? api : null;
    },

    isReady() {
      return this.getApi()?.ready === true;
    },

    addToCart(items) {
      const api = this.getApi();
      if (!api?.ready) return {ok: false, added: 0, skipped: Array.isArray(items) ? items.length : 1};
      return api.addToCart(items);
    },

    onReady(callback) {
      if (typeof callback !== 'function') return;
      if (this.isReady()) {
        callback(this.getApi());
        return;
      }
      this.callbacks.add(callback);
      if (this.timer) return;
      this.attempts = 0;
      this.timer = setInterval(() => {
        this.attempts++;
        if (this.isReady()) {
          clearInterval(this.timer);
          this.timer = null;
          const api = this.getApi();
          const callbacks = [
            ...this.callbacks
          ];
          this.callbacks.clear();
          callbacks.forEach((fn) => fn(api));
        } else if (this.attempts >= 120) {
          clearInterval(this.timer);
          this.timer = null;
          this.callbacks.clear();
        }
      }, 1000);
    }
  };

  return MarketMateBridge;
}

// runtime-helpers
export function installRuntimeHelpers(ctx) {
  const GmApi = createGmApi();
  const PageBridgeService = ctx.PageBridgeService || createPageBridgeService(ctx);
  const GameUiAdapter = createGameUiAdapter();
  const SpriteService = createSpriteService();
  const DomObserverService = createDomObserverService(SpriteService);
  ctx.GmApi = GmApi;
  ctx.PageBridgeService = PageBridgeService;
  const utils = createRuntimeUtils(ctx, {SpriteService, DomObserverService});
  ctx.utils = utils;
  const GameNavigationService = createGameNavigationService(ctx);
  const MarketMateBridge = createMarketMateBridge(ctx);

  ctx.GameUiAdapter = GameUiAdapter;
  ctx.SpriteService = SpriteService;
  ctx.DomObserverService = DomObserverService;
  ctx.GameNavigationService = GameNavigationService;
  ctx.MarketMateBridge = MarketMateBridge;
}
