// market-data-service
export class MarketDataService {
  constructor(ctx) {
    this.ctx = ctx;
    this.marketData = {};
    this.marketTimestamp = 0;
    // 官方市场价值（市场指导价）：0814 更新后游戏在 localStorage 维护，
    // 挂单与最近成交都缺失时用它兜底，避免完全缺价物品按 0 估值。
    this.marketItemValues = {};
  }

  async load() {
    this.loadMarketItemValues();
    // 优先复用 MWITools 市场缓存，减少重复请求并保证购物车价格口径一致。
    const mwiToolsData = this._readMWIToolsMarketData();
    if (mwiToolsData) {
      this._applyMarketData(mwiToolsData);
      return mwiToolsData;
    }

    const cached = this._readCache();
    if (cached) {
      this._applyMarketData(cached);
      return cached;
    }

    const data = await this._fetchMarketData();
    this._writeCache(data);
    this._applyMarketData(data);
    return data;
  }

  getPrice(itemHrid, level = 0) {
    if (itemHrid === '/items/coin') return 1;
    const row = this.marketData?.[itemHrid]?.[String(level)];
    // a/p/b 分别对应左一、最近成交、右一；缺价哨兵（0/-1）透传会导致负数或零价，
    // 统一取第一个有效正数侧，全缺时回退官方市场价值。
    const price =
      [
        row?.a, row?.p, row?.b
      ]
        .map(Number)
        .find((value) => Number.isFinite(value) && value > 0) || 0;
    return price || this.getMarketValue(itemHrid, level);
  }

  getMarketRow(itemHrid, level = 0) {
    return this.marketData?.[itemHrid]?.[String(level)] || null;
  }

  getMarketValue(itemHrid, level = 0) {
    const itemValues = this.marketItemValues?.[itemHrid];
    if (!itemValues) return 0;
    const value = Number(itemValues[level] ?? itemValues[String(level)] ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  loadMarketItemValues() {
    const {pageWindow} = this.ctx;
    try {
      // 优先读游戏官方缓存工具，与 initClientData 的读取方式保持一致。
      // getMarketItemValues 是 localStorageUtil 的实例方法，内部依赖 this.safeGetItem/this.Keys，
      // 必须按方法调用保留 this；以裸函数方式调用会因 this 丢失抛错并误走本地缓存降级。
      const localStorageUtil = pageWindow?.localStorageUtil;
      if (typeof localStorageUtil?.getMarketItemValues === 'function') {
        try {
          const parsed = localStorageUtil.getMarketItemValues();
          if (parsed?.marketItemValues) {
            this.marketItemValues = parsed.marketItemValues;
            return;
          }
        } catch (error) {
          // 仍有极小概率在游戏启动早期未就绪时抛错，此时降级读本地缓存，避免着装评分漏掉官方指导价。
          console.warn('[MST] 官方市场价值接口未就绪，改用本地缓存:', error);
        }
      }
      const raw = localStorage.getItem('marketItemValues');
      const parsed = this._parseMarketItemValues(raw);
      if (parsed?.marketItemValues) {
        this.marketItemValues = parsed.marketItemValues;
      }
    } catch (error) {
      console.warn('[MST] 读取官方市场价值失败:', error);
    }
  }

  _parseMarketItemValues(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const tryParse = (json) => {
      if (!json || typeof json !== 'string') return null;
      try {
        const parsed = JSON.parse(json);
        return parsed?.marketItemValues ? parsed : null;
      } catch {
        return null;
      }
    };
    // 游戏以 LZString UTF16 压缩写入，个别环境可能未压缩，两种都试。
    return tryParse(this.ctx.DataHub?.lzDecompressUTF16?.(raw)) || tryParse(raw) || null;
  }

  getUpdatedText() {
    const {utils, i18n} = this.ctx;
    return this.marketTimestamp ? utils.formatMarketTime(this.marketTimestamp) : i18n.t('marketNoData');
  }

  _readMWIToolsMarketData() {
    const {STORAGE_KEYS} = this.ctx;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MWITOOLS_MARKET_CACHE);
      if (!raw) return null;
      const fetchTimestamp = localStorage.getItem(STORAGE_KEYS.MWITOOLS_MARKET_TIMESTAMP);
      if (!this._isFetchFresh(fetchTimestamp)) return null;
      const data = JSON.parse(raw);
      return data?.marketData ? data : null;
    } catch {
      return null;
    }
  }

  _readCache() {
    const {STORAGE_KEYS} = this.ctx;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MARKET_CACHE);
      if (!raw) return null;
      const fetchTimestamp = localStorage.getItem(STORAGE_KEYS.MARKET_CACHE_TIMESTAMP);
      if (!this._isFetchFresh(fetchTimestamp)) return null;
      const data = JSON.parse(raw);
      if (!data?.marketData) return null;
      return data;
    } catch {
      return null;
    }
  }

  _getMarketTimestamp(data) {
    return Number(data?.timestamp || data?.t || 0) || 0;
  }

  _isFetchFresh(fetchTimestamp) {
    const {CONFIG} = this.ctx;
    const timestamp = Number(fetchTimestamp || 0) || 0;
    if (!timestamp) return false;
    const age = Date.now() - timestamp;
    // 本地时间倒退时不信任缓存，避免旧市场数据长期停留。
    return age >= 0 && age <= CONFIG.MARKET_CACHE_TTL;
  }

  _writeCache(data) {
    const {STORAGE_KEYS} = this.ctx;
    try {
      localStorage.setItem(STORAGE_KEYS.MARKET_CACHE, JSON.stringify(data));
      localStorage.setItem(STORAGE_KEYS.MARKET_CACHE_TIMESTAMP, String(Date.now()));
    } catch (error) {
      console.warn('[HCCP] 保存市场缓存失败:', error);
    }
  }

  async _fetchMarketData() {
    const {CONFIG, GmApi} = this.ctx;
    const request = GmApi?.xmlHttpRequestApi();

    if (!request) {
      const response = await fetch(CONFIG.MARKET_URL, {cache: 'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }

    return new Promise((resolve, reject) => {
      const result = GmApi.xmlHttpRequest({
        method: 'GET',
        url: CONFIG.MARKET_URL,
        headers: {'Content-Type': 'application/json'},
        onload: (response) => {
          try {
            resolve(JSON.parse(response.responseText));
          } catch (error) {
            reject(error);
          }
        },
        onerror: reject
      });
      if (result?.then) {
        result.then((response) => resolve(JSON.parse(response.responseText))).catch(reject);
      }
    });
  }

  _applyMarketData(data) {
    this.marketData = data?.marketData || {};
    this.marketTimestamp = this._getMarketTimestamp(data);
  }
}
