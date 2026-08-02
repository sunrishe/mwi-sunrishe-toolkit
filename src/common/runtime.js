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
      const requestFrame = window.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
      requestFrame(() => {
        this.scheduled = false;
        this.runCallbacks([
          ...this.subscribers
        ]);
      });
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

// runtime-utils
export function createRuntimeUtils(ctx, {SpriteService, DomObserverService}) {
  const {DataHub, i18n} = ctx;

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
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(String(text), 'text');
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
  const {DataHub, pageWindow, utils} = ctx;

  const GameNavigationService = {
    getHost() {
      const host = DataHub.getGameObject();
      return host && typeof host === 'object' ? host : null;
    },

    switchCharacter() {
      const host = this.getHost();
      if (typeof host?.handleSwitchCharacter !== 'function') return false;
      host.handleSwitchCharacter.call(host);
      return true;
    },

    openMarketplace(itemHrid, enhancementLevel = 0) {
      const fullHrid = utils.normalizeItemHrid(itemHrid);
      if (!fullHrid) return false;
      const host = this.getHost();
      if (typeof host?.handleGoToMarketplace === 'function') {
        host.handleGoToMarketplace.call(host, fullHrid, Number(enhancementLevel) || 0);
        return true;
      }
      const marketMate = pageWindow.MWIMM;
      return marketMate?.ready === true && typeof marketMate.openMarketplace === 'function'
        ? marketMate.openMarketplace(fullHrid) === true
        : false;
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
  const GameUiAdapter = createGameUiAdapter();
  const SpriteService = createSpriteService();
  const DomObserverService = createDomObserverService(SpriteService);
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
