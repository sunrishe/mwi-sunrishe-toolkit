// market-history-store
// 纯逻辑边界：记录模型、观测事件合并、实际到账累计、跨设备/导入合并、筛选排序分页与统计。
// 不依赖 DOM、DataHub 与 i18n；物品名称、分类等展示信息由装配层通过回调提供。
//
// 口径来源（`docs/analysis/市场交易记录需求说明书.md`）：
// - 官方挂牌对象没有时间戳，所有时间都是本机观测时间；快照补齐的时间标记为推断。
// - 实际到账金额取官方 `unclaimedCoinCount` / `unclaimedItemCount`：这两个字段是扣税后的真实值，
//   每次观测到它们减少（领取动作）就把减少量累计进 collected*，不按税率估算。
// - 挂牌以官方 id 为主键；直购/直售优先按官方 id 记录（与挂牌同构），
//   服务端没有条目时用出站请求兜底并生成本机 id，导入时按内容去重。

export const SCHEMA_VERSION = 1;
// 直购请求发出后等待官方条目的时间窗：窗内出现内容匹配的新条目即关联为同一单。
export const INSTANT_MATCH_WINDOW_MS = 60 * 1000;
// 直购兜底记录跨设备内容去重的时间窗。
export const INSTANT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
export const CLAIMS_LIMIT = 20;
// 记录量超过阈值时只提示用户导出清理，不自动删除。
export const RECORDS_SOFT_LIMIT = 20000;
export const STORE_BYTES_SOFT_LIMIT = 4 * 1024 * 1024;

export const LISTING_STATUSES = {
  ACTIVE: 'active',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

const TERMINAL_STATUSES = new Set([
  LISTING_STATUSES.FILLED, LISTING_STATUSES.CANCELLED, LISTING_STATUSES.EXPIRED
]);
const TERMINAL_EVENT_FIELDS = {
  [LISTING_STATUSES.FILLED]: 'filledAt',
  [LISTING_STATUSES.CANCELLED]: 'cancelledAt',
  [LISTING_STATUSES.EXPIRED]: 'expiredAt'
};

export const HISTORY_STATUS_KEYS = [
  'active', 'partial', 'filled', 'cancelled', 'expired',
  'partialCancelled', 'partialExpired', 'unobserved'
];

export const HISTORY_TYPE_KEYS = [
  'sellListing', 'buyListing', 'sellInstant', 'buyInstant'
];

const RECORD_FIELDS = {
  key: '',
  environment: 'live',
  characterId: '',
  characterName: '',
  originHost: '',
  kind: 'listing',
  side: 'sell',
  listingId: null,
  itemHrid: '',
  enhancementLevel: 0,
  price: 0,
  orderQuantity: 0,
  filledQuantity: 0,
  status: LISTING_STATUSES.ACTIVE,
  createdAt: 0,
  updatedAt: 0,
  firstFillAt: null,
  filledAt: null,
  cancelledAt: null,
  expiredAt: null,
  cancelRequestedAt: null,
  claimRequestedAt: null,
  claimedAt: null,
  expiresAt: null,
  taxTaken: 0,
  unclaimedItemCount: 0,
  unclaimedCoinCount: 0,
  collectedCoinCount: 0,
  collectedItemCount: 0,
  // 到账推算：官方到账/领取数据缺失时按历史税率推算金额，并记录所用税率。
  collectedEstimated: false,
  collectedTaxRate: 0,
  claims: [],
  origin: 'update',
  inferredTime: false,
  endedUnobserved: false,
  importNote: ''
};

function toCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function toTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function toMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

// 官方时间戳是 ISO 字符串（纳秒精度，Date.parse 会截断到毫秒），无效值按空处理。
function parseIsoTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return toTimestamp(value);
  const stamp = Date.parse(String(value));
  return Number.isFinite(stamp) ? stamp : null;
}

function pickEarlier(left, right) {
  const a = toTimestamp(left);
  const b = toTimestamp(right);
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function pickLater(left, right) {
  const a = toTimestamp(left);
  const b = toTimestamp(right);
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

// record-key
export function buildListingKey(listingId) {
  return 'listing:' + String(listingId);
}

export function buildInstantKey(now, sequence = 0) {
  return 'instant:' + String(now) + '-' + String(Math.floor(Math.random() * 1e6)) + '-' + String(sequence);
}

export function bucketKey(environment, characterId) {
  return String(environment || 'live') + ':' + String(characterId || 'default');
}

// 到账推算（只用于官方到账/领取数据缺失的记录，例如导入的历史数据）：
// 官方 unclaimedCoinCount / collectedCoinCount 有值时一律以官方为准，不推算；
// 出售按成交当时的历史税率扣税：普通物品 2026-08-14 前 2%、08-14 起 5%、09-28 起 4%，
// 牛铃袋始终 18%；推算结果标 collectedEstimated 并在悬浮提示里说明。
// 当前普通税率的单一来源见 src/common/constants.js 的 MARKET_TAX_RATE，这里按历史档位列出。
const TAX_HISTORY = [
  {
    before: Date.parse('2026-08-14T00:00:00+08:00'),
    rate: 0.02
  }, {before: Date.parse('2026-09-28T00:00:00+08:00'), rate: 0.05}, {before: Infinity, rate: 0.04}
];
const COWBELL_BAG_HRID = '/items/bag_of_10_cowbells';
const COWBELL_BAG_TAX_RATE = 0.18;

export function collectedTaxRateOf(record, at = 0) {
  if (record?.itemHrid === COWBELL_BAG_HRID) return COWBELL_BAG_TAX_RATE;
  const tier = TAX_HISTORY.find((entry) => at < entry.before);
  return tier ? tier.rate : TAX_HISTORY[TAX_HISTORY.length - 1].rate;
}

// 缺少官方到账数据时推算这笔交易的金额（一律记在 collectedCoinCount，不写物品件数）：
// 出售按成交当时的市场税率扣税（数量 × 单价 ×（1 − 税率）），购买不扣税（数量 × 单价）。
// 每次归一化都重新推算：公式调整后已存数据会自动纠正；
// 重新推算前先清掉旧推算值，保证它不会被当成官方数据（`collectedEstimated` 只由这里写）。
export function estimateCollected(record) {
  if (!record) return record;
  const base = record.collectedEstimated
    ? {...record, collectedCoinCount: 0, collectedItemCount: 0, collectedEstimated: false, collectedTaxRate: 0}
    : record;
  const filled = toCount(base.filledQuantity);
  const official =
    toCount(base.collectedCoinCount) > 0 ||
    toCount(base.collectedItemCount) > 0 ||
    toCount(base.unclaimedCoinCount) > 0 ||
    toCount(base.unclaimedItemCount) > 0 ||
    (Array.isArray(base.claims) && base.claims.length > 0);
  if (official) return base;
  if (!filled) return base;
  const nominal = toMoney(base.price) * filled;
  if (!nominal) return base;
  const at = base.filledAt || base.firstFillAt || base.createdAt || 0;
  // 只有出售侧扣市场税；购买侧付多少就是多少。
  const rate = base.side === 'sell' ? collectedTaxRateOf(base, at) : 0;
  return {
    ...base,
    collectedCoinCount: Math.max(0, Math.floor(nominal * (1 - rate))),
    collectedEstimated: true,
    collectedTaxRate: rate
  };
}

// record-normalize
export function normalizeClaim(claim) {
  if (!claim || typeof claim !== 'object') return null;
  const at = toTimestamp(claim.at);
  if (!at) return null;
  const coinCount = toCount(claim.coinCount);
  const itemCount = toCount(claim.itemCount);
  if (!coinCount && !itemCount) return null;
  return {at, coinCount, itemCount};
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = {...RECORD_FIELDS};
  const source = raw;
  record.key = String(source.key || '');
  record.environment = source.environment === 'test' ? 'test' : 'live';
  record.characterId = String(source.characterId ?? '');
  record.characterName = String(source.characterName || '');
  record.originHost = String(source.originHost || '');
  record.kind = source.kind === 'instant' ? 'instant' : 'listing';
  record.side = source.side === 'buy' ? 'buy' : 'sell';
  record.listingId = source.listingId == null || source.listingId === '' ? null : String(source.listingId);
  record.itemHrid = String(source.itemHrid || '');
  record.enhancementLevel = Math.max(0, Math.floor(Number(source.enhancementLevel) || 0));
  record.price = toMoney(source.price);
  record.orderQuantity = toCount(source.orderQuantity);
  record.filledQuantity = Math.min(
    toCount(source.filledQuantity),
    record.orderQuantity || toCount(source.filledQuantity)
  );
  record.status = TERMINAL_STATUSES.has(source.status) ? source.status : LISTING_STATUSES.ACTIVE;
  record.createdAt = toTimestamp(source.createdAt) || 0;
  record.updatedAt = toTimestamp(source.updatedAt) || record.createdAt;
  record.firstFillAt = toTimestamp(source.firstFillAt);
  record.filledAt = toTimestamp(source.filledAt);
  record.cancelledAt = toTimestamp(source.cancelledAt);
  record.expiredAt = toTimestamp(source.expiredAt);
  record.cancelRequestedAt = toTimestamp(source.cancelRequestedAt);
  record.claimRequestedAt = toTimestamp(source.claimRequestedAt);
  record.claimedAt = toTimestamp(source.claimedAt);
  record.expiresAt = toTimestamp(source.expiresAt);
  record.taxTaken = toCount(source.taxTaken);
  record.unclaimedItemCount = toCount(source.unclaimedItemCount);
  record.unclaimedCoinCount = toCount(source.unclaimedCoinCount);
  record.collectedCoinCount = toCount(source.collectedCoinCount);
  record.collectedItemCount = toCount(source.collectedItemCount);
  record.collectedEstimated = Boolean(source.collectedEstimated);
  record.collectedTaxRate = Number(source.collectedTaxRate) > 0 ? Number(source.collectedTaxRate) : 0;
  record.claims = (Array.isArray(source.claims) ? source.claims : [])
    .map(normalizeClaim)
    .filter(Boolean)
    .sort((left, right) => left.at - right.at)
    .slice(-CLAIMS_LIMIT);
  record.origin = [
    'snapshot', 'update', 'request', 'import'
  ].includes(source.origin) ? source.origin : 'update';
  record.inferredTime = Boolean(source.inferredTime);
  record.endedUnobserved = Boolean(source.endedUnobserved);
  record.importNote = dedupeImportNote(source.importNote);
  if (record.status !== LISTING_STATUSES.ACTIVE) record.endedUnobserved = false;
  if (!record.key) return null;
  if (!record.itemHrid) return null;
  if (record.key.startsWith('listing:') && record.listingId == null)
    record.listingId = record.key.slice('listing:'.length);
  if (record.key.startsWith('instant:') && record.filledQuantity === 0) record.filledQuantity = record.orderQuantity;
  return estimateCollected(record);
}

// store-persistence
export function createStore() {
  return {schemaVersion: SCHEMA_VERSION, updatedAt: 0, buckets: {}};
}

export function parseStore(raw) {
  if (!raw) return createStore();
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return createStore();
    }
  }
  if (!parsed || typeof parsed !== 'object') return createStore();
  const store = createStore();
  store.schemaVersion = Math.max(1, Math.floor(Number(parsed.schemaVersion) || 1));
  store.updatedAt = toTimestamp(parsed.updatedAt) || 0;
  const buckets = parsed.buckets && typeof parsed.buckets === 'object' ? parsed.buckets : {};
  Object.entries(buckets).forEach(
    ([
      key, records
    ]) => {
      if (!Array.isArray(records)) return;
      const normalized = records.map(normalizeRecord).filter(Boolean);
      if (normalized.length) store.buckets[key] = normalized;
    }
  );
  return store;
}

export function serializeStore(store) {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: store.updatedAt || 0,
    buckets: store.buckets || {}
  });
}

export function getBucketRecords(store, key) {
  if (!store.buckets[key]) store.buckets[key] = [];
  return store.buckets[key];
}

export function countRecords(store) {
  return Object.values(store.buckets || {}).reduce((sum, records) => sum + records.length, 0);
}

// record-merge（导入 / 多标签页 / 跨设备）
function recordChangeTime(record) {
  return record[TERMINAL_EVENT_FIELDS[record.status]] || record.updatedAt || record.createdAt || 0;
}

function mergeClaims(left, right) {
  const merged = [
    ...(left || []), ...(right || [])
  ]
    .map(normalizeClaim)
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  merged
    .sort((a, b) => a.at - b.at)
    .forEach((claim) => {
      const signature = claim.at + '|' + claim.coinCount + '|' + claim.itemCount;
      if (seen.has(signature)) return;
      seen.add(signature);
      unique.push(claim);
    });
  return unique.slice(-CLAIMS_LIMIT);
}

// 归一化导入备注：按「；」分段并去重。旧版本曾无上限追加同一段备注
// （实测出现过单条记录 501KB、同一句重复 3 万多段的脏数据），这里在读取时收敛。
function dedupeImportNote(value) {
  const parts = String(value || '')
    .split('；')
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  parts.forEach((part) => {
    if (seen.has(part)) return;
    seen.add(part);
    unique.push(part);
  });
  return unique.join('；');
}

function appendImportNote(note, extra) {
  if (!extra) return note || '';
  const parts = String(note || '')
    .split('；')
    .filter(Boolean);
  if (!parts.includes(extra)) parts.push(extra);
  return parts.join('；');
}

// 同一主键的字段级合并：终态优先、进度取大、时间取早、累计到账取大。
export function mergeRecords(left, right) {
  const a = normalizeRecord(left);
  const b = normalizeRecord(right);
  if (!a) return b;
  if (!b) return a;
  const leftTerminal = TERMINAL_STATUSES.has(a.status);
  const rightTerminal = TERMINAL_STATUSES.has(b.status);
  let primary = a;
  let secondary = b;
  let conflict = '';
  if (leftTerminal !== rightTerminal) {
    primary = rightTerminal ? b : a;
    secondary = rightTerminal ? a : b;
  } else if (leftTerminal && rightTerminal && a.status !== b.status) {
    if (recordChangeTime(b) > recordChangeTime(a)) {
      primary = b;
      secondary = a;
    }
    conflict = '状态冲突';
  } else if (b.updatedAt > a.updatedAt) {
    primary = b;
    secondary = a;
  }
  const merged = {...primary};
  merged.key = primary.key || secondary.key;
  merged.listingId = primary.listingId != null ? primary.listingId : secondary.listingId;
  merged.characterName = primary.characterName || secondary.characterName;
  merged.originHost = primary.originHost || secondary.originHost;
  merged.origin = primary.origin === 'import' ? secondary.origin : primary.origin;
  merged.price = toMoney(primary.price) || toMoney(secondary.price);
  merged.orderQuantity = Math.max(primary.orderQuantity, secondary.orderQuantity);
  merged.filledQuantity = Math.max(primary.filledQuantity, secondary.filledQuantity);
  merged.createdAt = pickEarlier(primary.createdAt, secondary.createdAt) || 0;
  merged.updatedAt = pickLater(primary.updatedAt, secondary.updatedAt) || 0;
  merged.expiresAt = pickEarlier(primary.expiresAt, secondary.expiresAt);
  merged.taxTaken = Math.max(toCount(a.taxTaken), toCount(b.taxTaken));
  merged.firstFillAt = pickEarlier(primary.firstFillAt, secondary.firstFillAt);
  merged.filledAt = pickEarlier(primary.filledAt, secondary.filledAt);
  merged.cancelledAt = pickEarlier(primary.cancelledAt, secondary.cancelledAt);
  merged.expiredAt = pickEarlier(primary.expiredAt, secondary.expiredAt);
  merged.cancelRequestedAt = pickEarlier(primary.cancelRequestedAt, secondary.cancelRequestedAt);
  merged.claimRequestedAt = pickEarlier(primary.claimRequestedAt, secondary.claimRequestedAt);
  merged.claimedAt = pickEarlier(primary.claimedAt, secondary.claimedAt);
  merged.unclaimedItemCount = toCount(primary.unclaimedItemCount);
  merged.unclaimedCoinCount = toCount(primary.unclaimedCoinCount);
  merged.collectedCoinCount = Math.max(toCount(a.collectedCoinCount), toCount(b.collectedCoinCount));
  merged.collectedItemCount = Math.max(toCount(a.collectedItemCount), toCount(b.collectedItemCount));
  // 推算标记跟随「取到更大到账值」的那一侧，避免把官方值与推算值混在一起时标错。
  const estimateSource =
    merged.collectedCoinCount > 0 && toCount(a.collectedCoinCount) === merged.collectedCoinCount ? a : b;
  merged.collectedEstimated = Boolean(estimateSource?.collectedEstimated);
  merged.collectedTaxRate = merged.collectedEstimated ? Number(estimateSource.collectedTaxRate) || 0 : 0;
  merged.claims = mergeClaims(a.claims, b.claims);
  merged.status = primary.status;
  merged.endedUnobserved = TERMINAL_STATUSES.has(merged.status) ? false : Boolean(primary.endedUnobserved);
  merged.inferredTime = Boolean(a.inferredTime) && Boolean(b.inferredTime);
  merged.importNote = appendImportNote(appendImportNote(a.importNote, b.importNote), conflict);
  return normalizeRecord(merged) || merged;
}

export function upsertRecord(records, record) {
  const index = records.findIndex((item) => item.key === record.key);
  if (index === -1) {
    records.push(record);
    return record;
  }
  const merged = mergeRecords(records[index], record);
  records[index] = merged;
  return merged;
}

// 官方状态值是 hrid（`/market_listing_status/*`），内部统一用短值；同时兼容直接传短值的场景。
const OFFICIAL_STATUS_MAP = {
  '/market_listing_status/active': 'active',
  '/market_listing_status/filled': 'filled',
  '/market_listing_status/cancelled': 'cancelled',
  '/market_listing_status/expired': 'expired'
};

export function normalizeListingStatus(value) {
  if (OFFICIAL_STATUS_MAP[value]) return OFFICIAL_STATUS_MAP[value];
  return TERMINAL_STATUSES.has(value) ? value : LISTING_STATUSES.ACTIVE;
}

// listing-input
export function listingToFields(listing) {
  if (!listing || typeof listing !== 'object') return null;
  const id = listing.id == null ? null : String(listing.id);
  const itemHrid = String(listing.itemHrid || '');
  if (id == null || !itemHrid) return null;
  return {
    listingId: id,
    characterId: listing.characterID == null ? '' : String(listing.characterID),
    itemHrid,
    enhancementLevel: Math.max(0, Math.floor(Number(listing.enhancementLevel) || 0)),
    side: listing.isSell ? 'sell' : 'buy',
    price: toMoney(listing.workingPrice) || toMoney(listing.price),
    orderQuantity: toCount(listing.orderQuantity),
    filledQuantity: toCount(listing.filledQuantity),
    status: normalizeListingStatus(listing.status),
    // 官方字段：createdTimestamp / expirationTimestamp 是 ISO 时间戳（客户端界面没用到，
    // 但服务端会下发，实测 2026-10-02 确认）；taxTaken 为本单累计税费。
    createdAt: parseIsoTimestamp(listing.createdTimestamp),
    expiresAt: parseIsoTimestamp(listing.expirationTimestamp),
    taxTaken: toCount(listing.taxTaken),
    unclaimedItemCount: toCount(listing.unclaimedItemCount),
    unclaimedCoinCount: toCount(listing.unclaimedCoinCount)
  };
}

// 状态推进：在既有记录上应用一次官方条目观测，返回新记录（不改原对象）。
export function applyListingObservation(record, fields, now, {origin = 'update', inferredTime = false} = {}) {
  const previous = record ? normalizeRecord(record) : null;
  const base =
    previous ||
    normalizeRecord({
      key: buildListingKey(fields.listingId),
      listingId: fields.listingId,
      itemHrid: fields.itemHrid,
      environment: 'live',
      characterId: '',
      origin,
      inferredTime,
      createdAt: now,
      status: LISTING_STATUSES.ACTIVE
    });
  if (!base) return null;
  const next = {...base};
  const officialCreatedAt = toTimestamp(fields.createdAt);
  if (!previous) {
    // 有官方创建时间戳时直接采用官方时间，不再标记为推断；只有观测时间可用时才保持推断标记。
    next.createdAt = officialCreatedAt || now;
    next.inferredTime = officialCreatedAt ? false : inferredTime;
    next.origin = origin;
  } else if (officialCreatedAt && base.inferredTime) {
    // 旧记录（或旧版本导入的数据）原来只有观测时间，见到官方时间戳后补正并清除推断标记。
    next.createdAt = officialCreatedAt;
    next.inferredTime = false;
  }
  if (fields.characterId && !next.characterId) next.characterId = fields.characterId;
  // 过期时间由创建时间决定（官方恒为 30 天），保留首次拿到的值即可。
  next.expiresAt = toTimestamp(base.expiresAt) || toTimestamp(fields.expiresAt);
  // 税费随成交累加，取观测到的最大值。
  next.taxTaken = Math.max(toCount(base.taxTaken), toCount(fields.taxTaken));
  next.listingId = fields.listingId;
  next.itemHrid = fields.itemHrid;
  next.enhancementLevel = fields.enhancementLevel;
  next.side = fields.side;
  next.price = fields.price || base.price;
  next.orderQuantity = fields.orderQuantity || base.orderQuantity;
  next.updatedAt = now;
  const previousFilled = toCount(base.filledQuantity);
  const nextFilled = Math.max(previousFilled, toCount(fields.filledQuantity));
  next.filledQuantity = nextFilled;
  if (nextFilled > 0 && !next.firstFillAt) next.firstFillAt = now;
  next.status = fields.status;
  if (fields.status === LISTING_STATUSES.FILLED) next.filledAt = pickEarlier(base.filledAt, now);
  if (fields.status === LISTING_STATUSES.CANCELLED) next.cancelledAt = pickEarlier(base.cancelledAt, now);
  if (fields.status === LISTING_STATUSES.EXPIRED) next.expiredAt = pickEarlier(base.expiredAt, now);
  if (TERMINAL_STATUSES.has(fields.status)) next.endedUnobserved = false;
  // 实际到账：观测到待领取数量减少（领取动作）时按减少量累计；实时链路不按税率估算。
  // 官方待领取数据首次出现时作废此前的推算值（推算值只服务于导入的历史数据）。
  const officialPending = toCount(fields.unclaimedCoinCount) > 0 || toCount(fields.unclaimedItemCount) > 0;
  const discardingEstimate = Boolean(base.collectedEstimated) && officialPending;
  if (discardingEstimate) {
    next.collectedCoinCount = 0;
    next.collectedItemCount = 0;
    next.collectedEstimated = false;
    next.collectedTaxRate = 0;
  }
  const baseCollectedCoin = discardingEstimate ? 0 : toCount(base.collectedCoinCount);
  const baseCollectedItem = discardingEstimate ? 0 : toCount(base.collectedItemCount);
  const coinDrop = toCount(base.unclaimedCoinCount) - fields.unclaimedCoinCount;
  const itemDrop = toCount(base.unclaimedItemCount) - fields.unclaimedItemCount;
  if (coinDrop > 0 || itemDrop > 0) {
    next.collectedCoinCount = baseCollectedCoin + Math.max(0, coinDrop);
    next.collectedItemCount = baseCollectedItem + Math.max(0, itemDrop);
    next.claims = mergeClaims(base.claims, [
      {at: now, coinCount: Math.max(0, coinDrop), itemCount: Math.max(0, itemDrop)}
    ]);
    next.claimedAt = now;
  }
  next.unclaimedCoinCount = fields.unclaimedCoinCount;
  next.unclaimedItemCount = fields.unclaimedItemCount;
  if (previous) next.origin = previous.origin;
  return normalizeRecord(next);
}

// 观测一批官方条目（增量消息或全量快照内容），按主键 upsert。
export function applyListingBatch(records, listings, now, options = {}) {
  const created = [];
  const updated = [];
  listings.forEach((listing) => {
    const fields = listingToFields(listing);
    if (!fields) return;
    const key = buildListingKey(fields.listingId);
    const existing = records.find((item) => item.key === key) || null;
    const next = applyListingObservation(existing, fields, now, options);
    if (!next) return;
    upsertRecord(records, next);
    if (existing) updated.push(next.key);
    else created.push(next.key);
  });
  return {created, updated};
}

// 快照对账：快照里没有的本机记录按规则收尾。
// - 有效/部分成交记录消失且期间没有观测到终态 → 结束（原因未观测）；
// - 已成交/已取消/已过期但仍带未领取数量 → 视为已被领取，补记实际到账。
export function reconcileWithSnapshot(records, listings, now) {
  const snapshotIds = new Set(
    listings.map((listing) => (listing && listing.id != null ? String(listing.id) : '')).filter(Boolean)
  );
  const unobserved = [];
  const settled = [];
  records.forEach((record) => {
    if (record.listingId == null || snapshotIds.has(String(record.listingId))) return;
    const pendingCoin = toCount(record.unclaimedCoinCount);
    const pendingItem = toCount(record.unclaimedItemCount);
    if (pendingCoin || pendingItem) {
      record.collectedCoinCount = toCount(record.collectedCoinCount) + pendingCoin;
      record.collectedItemCount = toCount(record.collectedItemCount) + pendingItem;
      record.claims = mergeClaims(record.claims, [
        {at: now, coinCount: pendingCoin, itemCount: pendingItem}
      ]);
      record.unclaimedCoinCount = 0;
      record.unclaimedItemCount = 0;
      record.claimedAt = record.claimedAt || now;
      record.updatedAt = now;
      settled.push(record.key);
      return;
    }
    if (record.status === LISTING_STATUSES.ACTIVE) {
      record.endedUnobserved = true;
      record.inferredTime = true;
      record.updatedAt = now;
      unobserved.push(record.key);
    }
  });
  return {unobserved, settled};
}

// instant-order（直购/直售）
// 出站请求：isInstantOrder=true 时先落一条请求记录（无官方 id）；随后官方条目出现时按内容关联。
export function createInstantRecord({environment, characterId, characterName, originHost, message, now, sequence = 0}) {
  const side = message.isSell ? 'sell' : 'buy';
  const record = normalizeRecord({
    key: buildInstantKey(now, sequence),
    environment,
    characterId,
    characterName,
    originHost,
    kind: 'instant',
    side,
    listingId: null,
    itemHrid: message.itemHrid,
    enhancementLevel: message.enhancementLevel,
    price: message.price,
    orderQuantity: message.quantity,
    filledQuantity: message.quantity,
    status: LISTING_STATUSES.FILLED,
    createdAt: now,
    updatedAt: now,
    firstFillAt: now,
    filledAt: now,
    origin: 'request',
    inferredTime: false
  });
  return record;
}

function matchesInstant(record, fields) {
  if (!record || record.kind !== 'instant' || record.listingId != null) return false;
  return (
    record.itemHrid === fields.itemHrid &&
    record.enhancementLevel === fields.enhancementLevel &&
    record.side === fields.side &&
    toMoney(record.price) === toMoney(fields.price) &&
    toCount(record.orderQuantity) === toCount(fields.orderQuantity)
  );
}

// 官方条目到达时把等待中的直购请求记录关联成同一条（按官方 id 继续跟踪）。
export function linkInstantRecords(records, listing, now, {windowMs = INSTANT_MATCH_WINDOW_MS} = {}) {
  const fields = listingToFields(listing);
  if (!fields) return null;
  const key = buildListingKey(fields.listingId);
  if (records.some((item) => item.key === key)) return null;
  const pending = records.find(
    (record) => matchesInstant(record, fields) && now - toTimestamp(record.createdAt) <= windowMs
  );
  if (!pending) return null;
  const merged = applyListingObservation({...pending, key, status: LISTING_STATUSES.ACTIVE}, fields, now, {
    origin: 'request'
  });
  if (!merged) return null;
  merged.kind = 'instant';
  merged.createdAt = pending.createdAt;
  merged.firstFillAt = pickEarlier(pending.firstFillAt, merged.firstFillAt);
  merged.filledAt = pickEarlier(pending.filledAt, merged.filledAt);
  merged.inferredTime = false;
  records.splice(records.indexOf(pending), 1);
  upsertRecord(records, merged);
  return merged.key;
}

// 超时仍未关联官方条目的直购请求记录：说明服务端没有为该直购下发条目，记录按请求口径保留。
export function listUnlinkedInstants(records, now, {windowMs = INSTANT_MATCH_WINDOW_MS} = {}) {
  return records.filter((record) => {
    if (record.kind !== 'instant' || record.listingId != null) return false;
    if (record.origin !== 'request') return false;
    return now - toTimestamp(record.createdAt) > windowMs;
  });
}

// 出站请求处理：取消 / 领取 / 直购。
// context：当前环境与角色（记录数组本身不携带这些信息）。
export function applyOutgoingMessage(records, message, now, context = {}) {
  if (!message || typeof message !== 'object') return {changed: false};
  if (message.type === 'post_market_order') {
    const data = message.postMarketOrderData || {};
    if (!data.isInstantOrder) return {changed: false};
    const record = createInstantRecord({
      environment: context.environment || 'live',
      characterId: context.characterId || '',
      characterName: context.characterName || '',
      originHost: context.originHost || '',
      message: data,
      now,
      sequence: records.length
    });
    if (!record) return {changed: false};
    records.push(record);
    return {changed: true, createdKeys: [
        record.key
      ]};
  }
  if (message.type === 'cancel_market_listing') {
    const id = message.cancelMarketListingData?.marketListingId;
    const record = records.find((item) => item.listingId != null && String(item.listingId) === String(id));
    if (!record) return {changed: false};
    record.cancelRequestedAt = now;
    record.updatedAt = now;
    return {changed: true};
  }
  if (message.type === 'claim_market_listing') {
    const id = message.claimMarketListingData?.marketListingId;
    const record = records.find((item) => item.listingId != null && String(item.listingId) === String(id));
    if (!record) return {changed: false};
    record.claimRequestedAt = now;
    record.updatedAt = now;
    return {changed: true};
  }
  if (message.type === 'claim_all_market_listings') {
    let changed = false;
    records.forEach((record) => {
      if (toCount(record.unclaimedCoinCount) || toCount(record.unclaimedItemCount)) {
        record.claimRequestedAt = now;
        record.updatedAt = now;
        changed = true;
      }
    });
    return {changed};
  }
  return {changed: false};
}

// display-helpers
export function isTerminal(record) {
  return TERMINAL_STATUSES.has(record.status);
}

export function getDisplayStatus(record) {
  if (record.endedUnobserved) return 'unobserved';
  if (record.status === LISTING_STATUSES.ACTIVE) {
    return toCount(record.filledQuantity) > 0 ? 'partial' : 'active';
  }
  if (record.status === LISTING_STATUSES.FILLED) return 'filled';
  if (record.status === LISTING_STATUSES.CANCELLED) {
    return toCount(record.filledQuantity) > 0 ? 'partialCancelled' : 'cancelled';
  }
  return toCount(record.filledQuantity) > 0 ? 'partialExpired' : 'expired';
}

export function getRecordType(record) {
  const instant = record.kind === 'instant';
  if (record.side === 'sell') return instant ? 'sellInstant' : 'sellListing';
  return instant ? 'buyInstant' : 'buyListing';
}

export function getRecordAmount(record) {
  return toMoney(record.price) * toCount(record.filledQuantity);
}

export function getPendingCount(record) {
  return record.side === 'sell' ? toCount(record.unclaimedCoinCount) : toCount(record.unclaimedItemCount);
}

// 「收入/支出」列取值：出售是收入（税后金币，官方数据优先、缺失时按历史税率推算），
// 购买是支出（付了多少：数量 × 单价，不扣税）。
export function getCollectedCount(record) {
  if (record.side === 'sell') return toCount(record.collectedCoinCount);
  return getRecordAmount(record);
}

export function getSortTimestamp(record, field) {
  if (field === 'filledAt')
    return record.filledAt || record.cancelledAt || record.expiredAt || record.updatedAt || record.createdAt;
  if (field === 'updatedAt') return record.updatedAt || record.createdAt;
  return record.createdAt;
}

// query（筛选 / 排序 / 分页）
function normalizeIdList(list) {
  if (!list) return null;
  if (list instanceof Set) return list.size ? list : null;
  if (Array.isArray(list)) return list.length ? new Set(list) : null;
  return null;
}

export function filterRecords(records, filters = {}, {getSearchText, getCategoryKey, getItemKey} = {}) {
  const keyword = String(filters.keyword || '')
    .trim()
    .toLowerCase();
  const statuses = normalizeIdList(filters.statuses);
  const types = normalizeIdList(filters.types);
  const sides = normalizeIdList(filters.sides);
  const category = filters.categoryKey && filters.categoryKey !== 'all' ? filters.categoryKey : null;
  const itemKey = filters.itemKey && filters.itemKey !== 'all' ? filters.itemKey : null;
  const timeField = filters.timeField === 'filledAt' ? 'filledAt' : 'createdAt';
  const timeFrom = toTimestamp(filters.timeFrom);
  const timeTo = toTimestamp(filters.timeTo);
  const priceMin =
    Number.isFinite(Number(filters.priceMin)) && filters.priceMin !== '' ? Number(filters.priceMin) : null;
  const priceMax =
    Number.isFinite(Number(filters.priceMax)) && filters.priceMax !== '' ? Number(filters.priceMax) : null;
  const quantityMin =
    Number.isFinite(Number(filters.quantityMin)) && filters.quantityMin !== '' ? Number(filters.quantityMin) : null;
  const quantityMax =
    Number.isFinite(Number(filters.quantityMax)) && filters.quantityMax !== '' ? Number(filters.quantityMax) : null;
  return records.filter((record) => {
    if (statuses && !statuses.has(getDisplayStatus(record))) return false;
    if (types && !types.has(getRecordType(record))) return false;
    if (sides && !sides.has(record.side)) return false;
    if (category && getCategoryKey && getCategoryKey(record) !== category) return false;
    if (itemKey && getItemKey && getItemKey(record) !== itemKey) return false;
    const timestamp = timeField === 'filledAt' ? getSortTimestamp(record, 'filledAt') : record.createdAt;
    if (timeFrom && (!timestamp || timestamp < timeFrom)) return false;
    if (timeTo && (!timestamp || timestamp > timeTo)) return false;
    const price = toMoney(record.price);
    if (priceMin != null && price < priceMin) return false;
    if (priceMax != null && price > priceMax) return false;
    const quantity = toCount(record.orderQuantity);
    if (quantityMin != null && quantity < quantityMin) return false;
    if (quantityMax != null && quantity > quantityMax) return false;
    if (keyword) {
      const text = typeof getSearchText === 'function' ? String(getSearchText(record) || '').toLowerCase() : '';
      if (!text.includes(keyword)) return false;
    }
    return true;
  });
}

export function sortRecords(records, sort = {}, {getName} = {}) {
  const key = sort.key || 'createdAt';
  const direction = sort.dir === 'asc' ? 1 : -1;
  const readValue = (record) => {
    if (key === 'item') {
      const name = typeof getName === 'function' ? String(getName(record) || '') : record.itemHrid;
      return name + '::' + record.enhancementLevel;
    }
    if (key === 'amount') return getRecordAmount(record);
    if (key === 'filledQuantity') return toCount(record.filledQuantity);
    if (key === 'price') return toMoney(record.price);
    if (key === 'orderQuantity') return toCount(record.orderQuantity);
    if (key === 'status') return getDisplayStatus(record);
    if (key === 'collected') return getCollectedCount(record);
    return getSortTimestamp(record, key);
  };
  return [
    ...records
  ].sort((left, right) => {
    const a = readValue(left);
    const b = readValue(right);
    if (a === b) return (right.createdAt || 0) - (left.createdAt || 0);
    return a > b ? direction : -direction;
  });
}

export function paginate(records, page, pageSize) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 50));
  const pageCount = Math.max(1, Math.ceil(records.length / size));
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    pageCount,
    pageSize: size,
    total: records.length,
    items: records.slice(start, start + size)
  };
}

// stats
export function summarize(records) {
  const summary = {
    count: records.length,
    orderQuantity: 0,
    filledQuantity: 0,
    nominalSell: 0,
    nominalBuy: 0,
    collectedCoin: 0,
    pendingCoin: 0,
    collectedItem: 0,
    pendingItem: 0,
    net: 0,
    countsByStatus: {},
    countsByType: {}
  };
  records.forEach((record) => {
    summary.orderQuantity += toCount(record.orderQuantity);
    summary.filledQuantity += toCount(record.filledQuantity);
    const amount = getRecordAmount(record);
    if (record.side === 'sell') {
      summary.nominalSell += amount;
      summary.collectedCoin += toCount(record.collectedCoinCount);
      summary.pendingCoin += toCount(record.unclaimedCoinCount);
    } else {
      // 购买不扣税，支出金额就是名义金额（单价 × 已成交数量）。
      summary.nominalBuy += amount;
      summary.collectedItem += toCount(record.collectedItemCount);
      summary.pendingItem += toCount(record.unclaimedItemCount);
    }
    const status = getDisplayStatus(record);
    summary.countsByStatus[status] = (summary.countsByStatus[status] || 0) + 1;
    const type = getRecordType(record);
    summary.countsByType[type] = (summary.countsByType[type] || 0) + 1;
  });
  // 净收支 = 出售收入（税后到账/推算）− 购买支出（不扣税）。
  summary.net = summary.collectedCoin - summary.nominalBuy;
  return summary;
}

// 分组合计的公共累加器：按 keyOf 分组，逐条累计条数、成交数量、金额与出售/购买两侧口径。
// 出售侧金额记 sellAmount、收入记 income（collectedCoin 为同值旧名），购买侧金额记 expense/buyAmount。
function accumulateGroups(records, keyOf, createGroup) {
  const groups = new Map();
  records.forEach((record) => {
    const key = keyOf(record);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, createGroup(record, key));
    const group = groups.get(key);
    const amount = getRecordAmount(record);
    const filled = toCount(record.filledQuantity);
    group.count += 1;
    group.filledQuantity += filled;
    group.amount += amount;
    group.nominal += amount;
    group.pendingCoin += toCount(record.unclaimedCoinCount);
    group.pendingItem += toCount(record.unclaimedItemCount);
    group.collectedItem += toCount(record.collectedItemCount);
    if (record.side === 'sell') {
      group.sellCount += 1;
      group.sellAmount += amount;
      group.sellFilledQuantity += filled;
      group.collectedCoin += toCount(record.collectedCoinCount);
      group.income += toCount(record.collectedCoinCount);
    } else {
      group.buyCount += 1;
      group.buyAmount += amount;
      group.buyFilledQuantity += filled;
      group.expense += amount;
    }
  });
  return groups;
}

function createGroupAccumulator() {
  return {
    count: 0,
    filledQuantity: 0,
    amount: 0,
    nominal: 0,
    collectedCoin: 0,
    pendingCoin: 0,
    collectedItem: 0,
    income: 0,
    expense: 0,
    sellAmount: 0,
    buyAmount: 0,
    sellCount: 0,
    buyCount: 0,
    sellFilledQuantity: 0,
    buyFilledQuantity: 0
  };
}

export function summarizeByItem(records, {getName} = {}) {
  const groups = accumulateGroups(
    records,
    (record) => record.itemHrid + '::' + record.enhancementLevel,
    (record, key) => ({
      ...createGroupAccumulator(),
      key,
      itemHrid: record.itemHrid,
      enhancementLevel: record.enhancementLevel
    })
  );
  return [
    ...groups.values()
  ].map((group) => ({
    ...group,
    name: typeof getName === 'function' ? getName(group.itemHrid) : group.itemHrid,
    weightedPrice: group.filledQuantity > 0 ? Math.round(group.amount / group.filledQuantity) : 0
  }));
}

// 统计页分组：按调用方给出的维度（分类 / 状态 / 类型）累计同一套口径，供环形图取用。
export function buildStatsBreakdown(records, {keyOf} = {}) {
  const keyResolver = typeof keyOf === 'function' ? keyOf : () => '';
  const groups = accumulateGroups(
    records,
    (record) => String(keyResolver(record) || ''),
    (_record, key) => ({
      ...createGroupAccumulator(),
      key
    })
  );
  return [
    ...groups.values()
  ];
}

// stats（时间序列）
export const STATS_BUCKET_KEYS = [
  'auto', 'day', 'week', 'month'
];
// 柱子太多会挤成一片：按日/周分桶超过这个数量就自动升一档（日 → 周 → 月）。
const MAX_STATS_BUCKETS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// 周从周一零点起算（与游戏内的自然周习惯一致）。
function startOfLocalWeek(timestamp) {
  const date = new Date(startOfLocalDay(timestamp));
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function startOfLocalMonth(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function alignToBucket(timestamp, bucket) {
  if (bucket === 'month') return startOfLocalMonth(timestamp);
  if (bucket === 'week') return startOfLocalWeek(timestamp);
  return startOfLocalDay(timestamp);
}

function nextBucketStart(start, bucket) {
  if (bucket === 'month') {
    const date = new Date(start);
    return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  }
  // 加满一整格再多半天再取本地零点：跨夏令时调整时也不会落回同一个桶。
  const step = bucket === 'week' ? 7 * DAY_MS : DAY_MS;
  return startOfLocalDay(start + step + 12 * 60 * 60 * 1000);
}

function pickAutoBucket(from, to) {
  const span = Math.max(0, to - from);
  if (span <= 45 * DAY_MS) return 'day';
  if (span <= 400 * DAY_MS) return 'week';
  return 'month';
}

function nextBucketKey(bucket) {
  return bucket === 'day' ? 'week' : 'month';
}

// 统计页时间序列：按日 / 周 / 月把记录分桶，桶内累计出售收入（税后到账/推算）、购买支出、
// 净收支、成交数量与条数；空桶保留（趋势图能看到断档）。
// 口径是**创建时间**（与统计页的时间范围筛选同源，界面标注为「创建时间」）。
// bucket 传 'auto' 时按数据跨度选粒度；显式粒度跨度太大时自动升档。
// 返回值里 bucket 是实际粒度、expectedBucket 是「按请求本应有的粒度」，两者不同才需要提示用户已升档。
export function buildStatsTimeSeries(records, {bucket = 'auto'} = {}) {
  const entries = (records || []).filter(Boolean);
  const stamps = entries.map((record) => toTimestamp(record?.createdAt) || 0).filter((stamp) => stamp > 0);
  if (!stamps.length)
    return {bucket: 'day', requestedBucket: bucket, expectedBucket: 'day', from: 0, to: 0, buckets: []};
  const from = Math.min(...stamps);
  const to = Math.max(...stamps);
  let effective = STATS_BUCKET_KEYS.includes(bucket) && bucket !== 'auto' ? bucket : pickAutoBucket(from, to);
  const expectedBucket = effective;
  const bucketCount = (start, bucketKey) => {
    let count = 0;
    for (let cursor = start; cursor <= to; cursor = nextBucketStart(cursor, bucketKey)) count += 1;
    return count;
  };
  while (effective !== 'month' && bucketCount(alignToBucket(from, effective), effective) > MAX_STATS_BUCKETS) {
    effective = nextBucketKey(effective);
  }
  const buckets = [];
  const indexByStart = new Map();
  for (let start = alignToBucket(from, effective); start <= to; start = nextBucketStart(start, effective)) {
    indexByStart.set(start, buckets.length);
    buckets.push({
      start,
      end: nextBucketStart(start, effective) - 1,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      filledQuantity: 0
    });
  }
  entries.forEach((record) => {
    const stamp = toTimestamp(record?.createdAt) || 0;
    if (!stamp) return;
    const index = indexByStart.get(alignToBucket(stamp, effective));
    if (index == null) return;
    const entry = buckets[index];
    const filled = toCount(record.filledQuantity);
    entry.count += 1;
    entry.filledQuantity += filled;
    if (record.side === 'sell') entry.income += toCount(record.collectedCoinCount);
    else entry.expense += getRecordAmount(record);
    entry.net = entry.income - entry.expense;
  });
  return {bucket: effective, requestedBucket: bucket, expectedBucket, from, to, buckets};
}

// import / export
export function buildExportPayload(store, {bucketKeys, now, environment, characterId} = {}) {
  const buckets = {};
  const wanted = bucketKeys && bucketKeys.length ? new Set(bucketKeys) : null;
  Object.entries(store.buckets || {}).forEach(
    ([
      key, records
    ]) => {
      if (wanted && !wanted.has(key)) return;
      buckets[key] = records.map(normalizeRecord).filter(Boolean);
    }
  );
  return {
    app: 'MST',
    type: 'market-history',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now || Date.now(),
    environment: environment || 'live',
    characterId: characterId || '',
    buckets
  };
}

export function parseImportPayload(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {ok: false, reason: 'invalid-json'};
    }
  }
  if (!parsed || typeof parsed !== 'object' || parsed.app !== 'MST' || parsed.type !== 'market-history') {
    return {ok: false, reason: 'invalid-format'};
  }
  const schemaVersion = Math.max(1, Math.floor(Number(parsed.schemaVersion) || 0));
  if (schemaVersion > SCHEMA_VERSION) return {ok: false, reason: 'unsupported-version'};
  const buckets = parsed.buckets && typeof parsed.buckets === 'object' ? parsed.buckets : {};
  const normalizedBuckets = {};
  let total = 0;
  let skipped = 0;
  Object.entries(buckets).forEach(
    ([
      key, records
    ]) => {
      if (!Array.isArray(records)) {
        skipped += 1;
        return;
      }
      const normalized = records
        .map((record) => {
          const item = normalizeRecord(record);
          if (!item) skipped += 1;
          return item;
        })
        .filter(Boolean);
      if (normalized.length) {
        normalizedBuckets[key] = normalized;
        total += normalized.length;
      }
    }
  );
  if (!total) return {ok: false, reason: 'no-records'};
  return {ok: true, buckets: normalizedBuckets, total, skipped, schemaVersion};
}

function findInstantDuplicate(records, record, windowMs) {
  return (
    records.find((item) => {
      if (item.listingId != null || record.listingId != null) return false;
      if (item.kind !== 'instant' || record.kind !== 'instant') return false;
      if (item.side !== record.side || item.itemHrid !== record.itemHrid) return false;
      if (item.enhancementLevel !== record.enhancementLevel) return false;
      if (toCount(item.orderQuantity) !== toCount(record.orderQuantity)) return false;
      if (toMoney(item.price) !== toMoney(record.price)) return false;
      return Math.abs((item.createdAt || 0) - (record.createdAt || 0)) <= windowMs;
    }) || null
  );
}

// 冲突只计真正的状态冲突（同一主键上是两个不同的终态，与 mergeRecords 的判定一致）；
// 导入来源备注这类普通差异不算冲突，否则每次从别的工具导入都会报一堆「冲突」。
function hasStatusConflict(left, right) {
  const a = normalizeRecord(left);
  const b = normalizeRecord(right);
  if (!a || !b || a.status === b.status) return false;
  return TERMINAL_STATUSES.has(a.status) && TERMINAL_STATUSES.has(b.status);
}

// 导入合并：合并模式下按主键字段级合并、直购兜底记录按内容去重；覆盖模式下只替换文件涉及的分桶。
export function mergeImport({store, buckets, mode = 'merge', now, windowMs = INSTANT_DEDUPE_WINDOW_MS}) {
  const report = {added: 0, updated: 0, deduped: 0, conflicts: 0, buckets: []};
  const target = mode === 'overwrite' ? {...store, buckets: {...store.buckets}} : store;
  Object.entries(buckets).forEach(
    ([
      key, records
    ]) => {
      const existing = mode === 'overwrite' ? [] : getBucketRecords(target, key);
      if (mode === 'overwrite') target.buckets[key] = existing;
      const bucketAdded = {key, added: 0, updated: 0, deduped: 0};
      records.forEach((record) => {
        const index = existing.findIndex((item) => item.key === record.key);
        if (index >= 0) {
          if (hasStatusConflict(existing[index], record)) report.conflicts += 1;
          existing[index] = mergeRecords(existing[index], record);
          report.updated += 1;
          bucketAdded.updated += 1;
          return;
        }
        const duplicate = record.listingId == null ? findInstantDuplicate(existing, record, windowMs) : null;
        if (duplicate) {
          const merged = mergeRecords(duplicate, record);
          existing[existing.indexOf(duplicate)] = merged;
          report.deduped += 1;
          bucketAdded.deduped += 1;
          return;
        }
        existing.push({...record, origin: record.origin === 'import' ? record.origin : 'import'});
        report.added += 1;
        bucketAdded.added += 1;
      });
      report.buckets.push(bucketAdded);
    }
  );
  target.updatedAt = now || Date.now();
  return {store: target, report};
}

export function estimateStoreBytes(store) {
  try {
    return serializeStore(store).length;
  } catch {
    return 0;
  }
}
