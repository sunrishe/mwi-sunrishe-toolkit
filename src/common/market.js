// market-data-service
export class MarketDataService {
  constructor(ctx) {
    this.ctx = ctx;
    this.marketData = {};
    this.marketTimestamp = 0;
  }

  async load() {
    // 优先复用 MWI 市场伴侣缓存，减少重复请求并保证购物车价格口径一致。
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
    if (!row) return 0;
    // a/p/b 分别对应左一、最近成交、右一；缺侧时按可用价格兜底。
    return Number(row.a ?? row.p ?? row.b ?? 0) || 0;
  }

  getMarketRow(itemHrid, level = 0) {
    return this.marketData?.[itemHrid]?.[String(level)] || null;
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
