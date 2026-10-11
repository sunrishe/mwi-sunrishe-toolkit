'use strict';

// 市场交易记录回归：
// - 记录模型与状态推进（快照补齐、部分成交、部分成交后取消、未观测结束）；
// - 实际到账累计（官方未领取数量的减少量累加，不按税率估算）；
// - 直购/直售的请求记录与官方条目关联、跨设备内容去重；
// - 导入导出编解码与合并/覆盖模式；
// - 筛选、排序、分页、统计口径；
// - 入口与装配链路（标签栏入口、消息订阅、存储键、菜单项、i18n 分组）。
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const storeSourceFile = readSourceFile('src', 'modules', 'market-history', 'store.js');
const moduleSourceFile = readSourceFile('src', 'modules', 'market-history', 'index.js');
const moduleCssSourceFile = readSourceFile('src', 'modules', 'market-history', 'styles.css');
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const toolkitMenuSourceFile = readSourceFile('src', 'modules', 'toolkit-menu', 'index.js');
const dataSourceFile = readSourceFile('src', 'common', 'data.js');
const runtimeSourceFile = readSourceFile('src', 'common', 'runtime.js');
const uiSourceFile = readSourceFile('src', 'common', 'ui.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const usageSource = readSourceFile('docs', 'usage.md');
const designSource = readSourceFile('docs', 'analysis', '市场交易记录需求说明书.md');

const NOW = 1700000000000;
const LISTING_URL = '/market_listing_status/';

function loadStore() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/market-history/store.js')}
      ({
        SCHEMA_VERSION, INSTANT_MATCH_WINDOW_MS, INSTANT_DEDUPE_WINDOW_MS, RECORDS_SOFT_LIMIT,
        LISTING_STATUSES, HISTORY_STATUS_KEYS, HISTORY_TYPE_KEYS, STATS_BUCKET_KEYS,
        buildListingKey, buildInstantKey, bucketKey, normalizeRecord, normalizeListingStatus, listingToFields,
        createStore, parseStore, serializeStore, getBucketRecords, countRecords, mergeRecords, upsertRecord,
        applyListingObservation, applyListingBatch, reconcileWithSnapshot, createInstantRecord, linkInstantRecords,
        listUnlinkedInstants, applyOutgoingMessage, getDisplayStatus, getRecordType, getRecordAmount, getPendingCount,
        getCollectedCount, getSortTimestamp, filterRecords, sortRecords, paginate, summarize,
        summarizeByItem, buildStatsBreakdown, buildStatsTimeSeries,
        buildExportPayload, parseImportPayload, mergeImport, estimateStoreBytes, normalizeClaim
      });`,
    {}
  );
}

// 图表几何是纯计算：直接在当前环境跑，不依赖 DOM。
function loadCharts() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/market-history/charts.js')}
      ({buildValueAxis, layoutBarGroups, layoutStackedSegments, layoutDoughnutArcs, pickLabelStep, percentageText});`,
    {}
  );
}

function listing(overrides = {}) {
  return {
    id: 1,
    itemHrid: '/items/iron_sword',
    enhancementLevel: 0,
    isSell: true,
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 0,
    status: LISTING_URL + 'active',
    unclaimedCoinCount: 0,
    unclaimedItemCount: 0,
    ...overrides
  };
}

test('市场交易记录：官方状态 hrid 与短值都能解析成内部状态', () => {
  const store = loadStore();
  assert.equal(store.normalizeListingStatus(LISTING_URL + 'active'), 'active');
  assert.equal(store.normalizeListingStatus(LISTING_URL + 'filled'), 'filled');
  assert.equal(store.normalizeListingStatus(LISTING_URL + 'cancelled'), 'cancelled');
  assert.equal(store.normalizeListingStatus(LISTING_URL + 'expired'), 'expired');
  assert.equal(store.normalizeListingStatus('filled'), 'filled');
  assert.equal(store.normalizeListingStatus(undefined), 'active');
  // 官方状态值不在内部状态枚举里时保守按有效处理，避免把未知值当成终态。
  assert.equal(store.normalizeListingStatus(LISTING_URL + 'unknown'), 'active');
});

test('市场交易记录：挂牌生命周期（创建 → 部分成交 → 完成 → 领取）推进且时间单调', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing()
    ],
    NOW,
    {origin: 'update'}
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].key, 'listing:1');
  assert.equal(records[0].status, 'active');
  assert.equal(records[0].createdAt, NOW);
  assert.equal(store.getDisplayStatus(records[0]), 'active');

  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 4, unclaimedCoinCount: 3840})
    ],
    NOW + 1000
  );
  assert.equal(records[0].filledQuantity, 4);
  assert.equal(records[0].firstFillAt, NOW + 1000);
  assert.equal(records[0].collectedCoinCount, 0, '成交入账不应算作已到账，待领取不等于已领取');
  assert.equal(store.getDisplayStatus(records[0]), 'partial');

  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW + 2000
  );
  assert.equal(records[0].status, 'filled');
  assert.equal(records[0].filledAt, NOW + 2000);
  assert.equal(records[0].unclaimedCoinCount, 9600);
  assert.equal(store.getDisplayStatus(records[0]), 'filled');
});

test('市场交易记录：官方创建/过期时间与税费字段生效，创建时间不再标记推断', () => {
  const store = loadStore();
  const records = [];
  const official = {
    createdTimestamp: '2026-09-29T09:14:35.551285119Z',
    expirationTimestamp: '2026-10-29T09:14:35.551285199Z',
    taxTaken: 3,
    characterID: 427012
  };
  store.applyListingBatch(
    records,
    [
      listing(official)
    ],
    NOW
  );
  const record = records[0];
  assert.equal(record.createdAt, Date.parse('2026-09-29T09:14:35.551Z'), '官方创建时间截断到毫秒');
  assert.equal(record.inferredTime, false, '有官方创建时间时不标推断');
  assert.equal(record.expiresAt, Date.parse('2026-10-29T09:14:35.551Z'));
  assert.equal(record.taxTaken, 3);
  assert.equal(record.characterId, '427012', '归属角色取官方 characterID');
  // 税费随成交累加：取观测到的最大值，过期时间保持首次拿到的值。
  store.applyListingBatch(
    records,
    [
      listing({...official, filledQuantity: 4, unclaimedCoinCount: 3840, taxTaken: 9})
    ],
    NOW + 1000
  );
  assert.equal(records[0].taxTaken, 9);
  assert.equal(records[0].expiresAt, Date.parse('2026-10-29T09:14:35.551Z'));
  // 旧记录（只有观测时间、标着推断）在收到官方时间戳后补正并清除推断标记。
  // 观测时间必须晚于官方创建时间（真实场景必然如此），否则合并规则「创建时间取更早」会保留观测值。
  const legacyObservedAt = Date.parse('2026-10-02T03:00:00.000Z');
  const legacy = [];
  store.applyListingBatch(
    legacy,
    [
      listing({id: 2})
    ],
    legacyObservedAt,
    {origin: 'snapshot', inferredTime: true}
  );
  assert.equal(legacy[0].inferredTime, true);
  store.applyListingBatch(
    legacy,
    [
      listing({id: 2, ...official})
    ],
    legacyObservedAt + 2000
  );
  assert.equal(legacy[0].inferredTime, false);
  assert.equal(legacy[0].createdAt, Date.parse('2026-09-29T09:14:35.551Z'));
  assert.equal(legacy[0].expiresAt, Date.parse('2026-10-29T09:14:35.551Z'));
  // 合并规则：税费取大、过期时间取较早的非空值。
  const left = store.normalizeRecord({
    key: 'listing:5',
    itemHrid: '/items/sugar',
    side: 'sell',
    price: 1,
    orderQuantity: 1,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    taxTaken: 2,
    expiresAt: NOW + 100
  });
  const right = store.normalizeRecord({
    key: 'listing:5',
    itemHrid: '/items/sugar',
    side: 'sell',
    price: 1,
    orderQuantity: 1,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW + 50,
    taxTaken: 5,
    expiresAt: NOW + 200
  });
  const merged = store.mergeRecords(left, right);
  assert.equal(merged.taxTaken, 5);
  assert.equal(merged.expiresAt, NOW + 100);
});

test('市场交易记录：领取时按官方未领取金币的减少量累计实际到账（不按税率估算）', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW
  );
  // 第一次领取：待领取 9600 → 0，累计到账 9600。
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedCoinCount, 9600);
  assert.equal(records[0].unclaimedCoinCount, 0);
  assert.equal(records[0].claims.length, 1);
  assert.equal(records[0].claimedAt, NOW + 1000);
  // 第二次成交入账 4800 后再领取：累计到账叠加而不是覆盖。
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 12, status: LISTING_URL + 'filled', unclaimedCoinCount: 4800})
    ],
    NOW + 2000
  );
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 12, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 3000
  );
  assert.equal(records[0].collectedCoinCount, 14400);
  assert.equal(records[0].claims.length, 2);
});

test('市场交易记录：购买挂牌成交后的实际到账按物品数累计', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 2, isSell: false, filledQuantity: 5, status: LISTING_URL + 'filled', unclaimedItemCount: 5})
    ],
    NOW
  );
  // 购买侧「收入/支出」是支出（数量 × 单价），领取进度只看 collectedItemCount。
  assert.equal(store.getCollectedCount(records[0]), 5000);
  assert.equal(records[0].collectedItemCount, 0);
  assert.equal(store.getPendingCount(records[0]), 5);
  store.applyListingBatch(
    records,
    [
      listing({id: 2, isSell: false, filledQuantity: 5, status: LISTING_URL + 'filled', unclaimedItemCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedItemCount, 5);
  assert.equal(store.getCollectedCount(records[0]), 5000);
  assert.equal(store.getPendingCount(records[0]), 0);
});

test('市场交易记录：部分成交后取消保留成交进度，状态与统计只计已成交部分', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 3, filledQuantity: 3, unclaimedCoinCount: 2880})
    ],
    NOW
  );
  store.applyListingBatch(
    records,
    [
      listing({id: 3, filledQuantity: 3, status: LISTING_URL + 'cancelled', unclaimedCoinCount: 2880})
    ],
    NOW + 1000
  );
  assert.equal(store.getDisplayStatus(records[0]), 'partialCancelled');
  assert.equal(records[0].cancelledAt, NOW + 1000);
  assert.equal(store.getRecordAmount(records[0]), 3000, '名义金额按已成交数量 × 单价');
  // 未成交部分不应计入成交量。
  const summary = store.summarize(records);
  assert.equal(summary.filledQuantity, 3);
  assert.equal(summary.nominalSell, 3000);
  // 领取后仍保留终态与到账明细。
  store.applyListingBatch(
    records,
    [
      listing({id: 3, filledQuantity: 3, status: LISTING_URL + 'cancelled', unclaimedCoinCount: 0})
    ],
    NOW + 2000
  );
  assert.equal(store.getDisplayStatus(records[0]), 'partialCancelled');
  assert.equal(records[0].collectedCoinCount, 2880);
});

test('市场交易记录：快照对账标记未观测结束，并补记已消失条目的未领取金额', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 4})
    ],
    NOW
  );
  store.applyListingBatch(
    records,
    [
      listing({id: 5, filledQuantity: 6, status: LISTING_URL + 'filled', unclaimedCoinCount: 5760})
    ],
    NOW
  );
  const result = store.reconcileWithSnapshot(records, [], NOW + 5000);
  assert.equal(result.unobserved.length, 1);
  assert.equal(result.settled.length, 1);
  assert.equal(store.getDisplayStatus(records[0]), 'unobserved');
  assert.equal(records[0].endedUnobserved, true);
  assert.equal(records[0].inferredTime, true);
  assert.equal(records[1].collectedCoinCount, 5760, '快照缺失且带未领取的已成交记录视为已被领取');
  assert.equal(records[1].unclaimedCoinCount, 0);
  // 快照中仍存在的记录不受影响。
  const kept = [];
  store.applyListingBatch(
    kept,
    [
      listing({id: 6, filledQuantity: 2, status: LISTING_URL + 'filled', unclaimedCoinCount: 1920})
    ],
    NOW
  );
  store.reconcileWithSnapshot(
    kept,
    [
      listing({id: 6, filledQuantity: 2, status: LISTING_URL + 'filled', unclaimedCoinCount: 1920})
    ],
    NOW + 5000
  );
  assert.equal(kept[0].collectedCoinCount, 0);
  assert.equal(kept[0].unclaimedCoinCount, 1920);
  assert.equal(kept[0].endedUnobserved, false);
});

test('市场交易记录：直购请求先落记录，官方条目到达时按内容关联为同一单', () => {
  const store = loadStore();
  const records = [];
  const context = {environment: 'live', characterId: '42', characterName: 'Tester', originHost: 'milkywayidle.com'};
  const changed = store.applyOutgoingMessage(
    records,
    {
      type: 'post_market_order',
      postMarketOrderData: {
        isSell: false,
        itemHrid: '/items/iron_sword',
        enhancementLevel: 0,
        quantity: 5,
        price: 900,
        isInstantOrder: true
      }
    },
    NOW,
    context
  );
  assert.equal(changed.changed, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'instant');
  assert.equal(records[0].side, 'buy');
  assert.equal(records[0].listingId, null);
  assert.equal(records[0].orderQuantity, 5);
  // 挂牌类请求不预登记（以 WS 快照/增量为准）。
  const unchanged = store.applyOutgoingMessage(
    records,
    {
      type: 'post_market_order',
      postMarketOrderData: {isSell: true, itemHrid: '/items/iron_sword', quantity: 1, price: 10, isInstantOrder: false}
    },
    NOW,
    context
  );
  assert.equal(unchanged.changed, false);
  // 官方条目到达：内容匹配 → 关联为 listing:<id>，保留请求时间，按官方字段继续跟踪。
  const linked = store.linkInstantRecords(
    records,
    listing({
      id: 9,
      isSell: false,
      price: 900,
      orderQuantity: 5,
      filledQuantity: 5,
      status: LISTING_URL + 'filled',
      unclaimedItemCount: 5
    }),
    NOW + 100
  );
  assert.equal(linked, 'listing:9');
  assert.equal(records.length, 1);
  assert.equal(records[0].key, 'listing:9');
  assert.equal(records[0].listingId, '9');
  assert.equal(records[0].kind, 'instant');
  assert.equal(records[0].createdAt, NOW, '创建时间沿用请求发起时间');
  assert.equal(records[0].unclaimedItemCount, 5);
});

test('市场交易记录：直购兜底记录超过匹配窗口仍未关联官方条目时保留请求口径', () => {
  const store = loadStore();
  const records = [];
  store.applyOutgoingMessage(
    records,
    {
      type: 'post_market_order',
      postMarketOrderData: {
        isSell: true,
        itemHrid: '/items/iron_sword',
        enhancementLevel: 0,
        quantity: 2,
        price: 1100,
        isInstantOrder: true
      }
    },
    NOW,
    {environment: 'live', characterId: '42'}
  );
  assert.equal(store.listUnlinkedInstants(records, NOW + 1000).length, 0);
  assert.equal(store.listUnlinkedInstants(records, NOW + store.INSTANT_MATCH_WINDOW_MS + 1).length, 1);
  assert.equal(records[0].status, 'filled');
  assert.equal(records[0].side, 'sell');
  assert.equal(store.getDisplayStatus(records[0]), 'filled');
});

test('市场交易记录：取消与领取请求记录请求时间，不直接改状态', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 11})
    ],
    NOW
  );
  store.applyOutgoingMessage(
    records,
    {type: 'cancel_market_listing', cancelMarketListingData: {marketListingId: 11}},
    NOW + 50
  );
  store.applyOutgoingMessage(
    records,
    {type: 'claim_market_listing', claimMarketListingData: {marketListingId: 11}},
    NOW + 60
  );
  assert.equal(records[0].cancelRequestedAt, NOW + 50);
  assert.equal(records[0].claimRequestedAt, NOW + 60);
  assert.equal(records[0].status, 'active', '状态仍以官方消息为准');
});

test('市场交易记录：跨设备合并按主键字段级进行（终态优先、时间取早、进度与到账取大）', () => {
  const store = loadStore();
  const left = store.normalizeRecord({
    key: 'listing:7',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 0,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW
  });
  const right = store.normalizeRecord({
    key: 'listing:7',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW + 5000,
    updatedAt: NOW + 9000,
    filledAt: NOW + 8000,
    unclaimedCoinCount: 9600,
    collectedCoinCount: 9600,
    claims: [
      {at: NOW + 8000, coinCount: 9600, itemCount: 0}
    ]
  });
  const merged = store.mergeRecords(left, right);
  assert.equal(merged.status, 'filled', '终态优先于进行中');
  assert.equal(merged.createdAt, NOW, '创建时间取更早的设备观测值');
  assert.equal(merged.filledAt, NOW + 8000);
  assert.equal(merged.updatedAt, NOW + 9000);
  assert.equal(merged.collectedCoinCount, 9600);
  assert.equal(merged.claims.length, 1);
  assert.equal(merged.endedUnobserved, false);
  // 两个终态冲突时取变更时间更晚者并记备注。
  const cancelled = store.normalizeRecord({
    key: 'listing:7',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'cancelled',
    createdAt: NOW,
    updatedAt: NOW + 10000,
    cancelledAt: NOW + 10000
  });
  const conflicted = store.mergeRecords(right, cancelled);
  assert.equal(conflicted.status, 'cancelled');
  assert.match(conflicted.importNote, /状态冲突/);
});

test('市场交易记录：导入导出编解码往返一致，非法条目跳过、版本过高拒绝', () => {
  const store = loadStore();
  const container = store.createStore();
  const key = store.bucketKey('live', '42');
  store.applyListingBatch(
    store.getBucketRecords(container, key),
    [
      listing()
    ],
    NOW
  );
  const payload = store.buildExportPayload(container, {bucketKeys: [
      key
    ], now: NOW});
  assert.equal(payload.app, 'MST');
  assert.equal(payload.type, 'market-history');
  assert.equal(payload.schemaVersion, store.SCHEMA_VERSION);
  const parsed = store.parseImportPayload(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.total, 1);
  assert.equal(parsed.skipped, 0);
  const roundTrip = store.parseStore(JSON.stringify(payload));
  assert.equal(store.countRecords(roundTrip), 1);
  assert.equal(roundTrip.buckets[key][0].key, 'listing:1');
  // 非法条目（缺 key / 缺物品）计入跳过。
  const validRecord = store.normalizeRecord({
    key: 'listing:1',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW
  });
  const mixed = store.parseImportPayload(
    JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 1, buckets: {[key]: [
          validRecord, {key: 'x'}
        ]}})
  );
  assert.equal(mixed.skipped, 1);
  assert.equal(mixed.total, 1);
  assert.equal(store.parseImportPayload('not json').ok, false);
  assert.equal(store.parseImportPayload(JSON.stringify({app: 'other'})).reason, 'invalid-format');
  assert.equal(
    store.parseImportPayload(
      JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 99, buckets: {[key]: [
            listing()
          ]}})
    ).reason,
    'unsupported-version'
  );
});

test('市场交易记录：导入合并模式按主键合并、直购兜底记录按内容去重，覆盖模式只动目标分桶', () => {
  const store = loadStore();
  const key = store.bucketKey('live', '42');
  const otherKey = store.bucketKey('live', '99');
  const target = store.createStore();
  store.applyListingBatch(
    store.getBucketRecords(target, key),
    [
      listing({id: 20})
    ],
    NOW
  );
  store.applyListingBatch(
    store.getBucketRecords(target, otherKey),
    [
      listing({id: 30})
    ],
    NOW
  );
  const instant = store.createInstantRecord({
    environment: 'live',
    characterId: '42',
    message: {isSell: true, itemHrid: '/items/iron_sword', enhancementLevel: 0, quantity: 3, price: 500},
    now: NOW
  });
  // 本机已有一条直购兜底记录（无官方 id），另一台设备的同内容记录应合并进它而不是新增。
  store.getBucketRecords(target, key).push(instant);
  const mergeIn = {...instant, key: 'instant:remote', createdAt: NOW + 60000};
  const updatedRecord = store.normalizeRecord({
    key: 'listing:20',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW,
    updatedAt: NOW + 1000,
    filledAt: NOW + 1000
  });
  const merged = store.mergeImport({
    store: target,
    buckets: {[key]: [
        updatedRecord, mergeIn
      ]},
    mode: 'merge',
    now: NOW
  });
  assert.equal(merged.report.updated, 1);
  assert.equal(merged.report.deduped, 1, '直购兜底记录按内容与时间窗去重');
  assert.equal(merged.report.conflicts, 0, '同一条记录合并、没有状态分歧时不计冲突');
  assert.equal(merged.store.buckets[key].find((record) => record.key === 'listing:20').filledQuantity, 10);
  assert.equal(merged.store.buckets[otherKey].length, 1, '未涉及的分桶保持不变');
  // 冲突只计真正的状态冲突：只有来源备注不同（例如从食用工具导入写入的备注）不算冲突。
  const noted = store.normalizeRecord({
    key: 'listing:20',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW,
    updatedAt: NOW + 2000,
    filledAt: NOW + 1000,
    importNote: '来源：食用工具'
  });
  const notedResult = store.mergeImport({
    store: merged.store,
    buckets: {[key]: [
        noted
      ]},
    mode: 'merge',
    now: NOW
  });
  assert.equal(notedResult.report.updated, 1);
  assert.equal(notedResult.report.conflicts, 0, '仅导入来源备注不同不计冲突');
  assert.match(
    notedResult.store.buckets[key].find((record) => record.key === 'listing:20').importNote,
    /来源：食用工具/
  );
  // 同一主键上是两个不同的终态时才算冲突，并记「状态冲突」备注。
  const cancelled = store.normalizeRecord({
    key: 'listing:20',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'cancelled',
    createdAt: NOW,
    updatedAt: NOW + 3000,
    cancelledAt: NOW + 3000
  });
  const conflictResult = store.mergeImport({
    store: notedResult.store,
    buckets: {[key]: [
        cancelled
      ]},
    mode: 'merge',
    now: NOW
  });
  assert.equal(conflictResult.report.conflicts, 1);
  assert.equal(conflictResult.store.buckets[key].find((record) => record.key === 'listing:20').status, 'cancelled');
  assert.match(conflictResult.store.buckets[key].find((record) => record.key === 'listing:20').importNote, /状态冲突/);
  // 覆盖模式：目标分桶被替换，其他分桶不动。
  const overwriteRecord = store.normalizeRecord({
    key: 'listing:21',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1200,
    orderQuantity: 1,
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW
  });
  const overwritten = store.mergeImport({
    store: merged.store,
    buckets: {[key]: [
        overwriteRecord
      ]},
    mode: 'overwrite',
    now: NOW
  });
  assert.equal(overwritten.store.buckets[key].length, 1);
  assert.equal(overwritten.store.buckets[key][0].key, 'listing:21');
  assert.equal(overwritten.store.buckets[otherKey].length, 1);
});

test('市场交易记录：筛选、排序、分页与统计口径', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({
        id: 41,
        price: 1000,
        orderQuantity: 10,
        filledQuantity: 10,
        status: LISTING_URL + 'filled',
        unclaimedCoinCount: 9600
      })
    ],
    NOW
  );
  store.applyListingBatch(
    records,
    [
      listing({id: 42, price: 2000, orderQuantity: 5, filledQuantity: 0})
    ],
    NOW + 1000
  );
  store.applyListingBatch(
    records,
    [
      listing({
        id: 43,
        isSell: false,
        price: 3000,
        orderQuantity: 2,
        filledQuantity: 2,
        status: LISTING_URL + 'filled',
        unclaimedItemCount: 2
      })
    ],
    NOW + 2000
  );
  const itemInfo = {
    getSearchText: (record) => record.itemHrid.toLowerCase(),
    getCategoryKey: () => 'equipment',
    getItemKey: (record) => record.itemHrid + '::' + record.enhancementLevel
  };
  assert.equal(
    store.filterRecords(
      records,
      {statuses: [
          'filled'
        ]},
      itemInfo
    ).length,
    2
  );
  assert.equal(
    store.filterRecords(
      records,
      {types: [
          'buyListing'
        ]},
      itemInfo
    ).length,
    1
  );
  assert.equal(store.filterRecords(records, {priceMin: 1500, priceMax: 2500}, itemInfo).length, 1);
  assert.equal(store.filterRecords(records, {quantityMin: 10}, itemInfo).length, 1);
  assert.equal(store.filterRecords(records, {keyword: 'iron_sword'}, itemInfo).length, 3);
  assert.equal(store.filterRecords(records, {timeFrom: NOW + 1500}, itemInfo).length, 1);
  const sorted = store.sortRecords(records, {key: 'price', dir: 'desc'}, {});
  assert.equal(sorted[0].price, 3000);
  const page = store.paginate(sorted, 2, 2);
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 2);
  assert.equal(page.items.length, 1);
  assert.equal(store.paginate(sorted, 9, 2).page, 2, '页码越界时收敛到最后一页');
  const summary = store.summarize(records);
  assert.equal(summary.count, 3);
  assert.equal(summary.nominalSell, 10000, '出售名义额只按已成交数量计算');
  assert.equal(summary.nominalBuy, 6000);
  assert.equal(summary.collectedCoin, 0, '未领取的成交额只算待领取');
  assert.equal(summary.pendingCoin, 9600);
  assert.equal(summary.pendingItem, 2);
  const byItem = store.summarizeByItem(records, {getName: (hrid) => hrid});
  assert.equal(byItem.length, 1);
  assert.equal(byItem[0].filledQuantity, 12);
  assert.equal(byItem[0].weightedPrice, Math.round(16000 / 12));
});

test('市场交易记录：统计聚合口径（净收支 / 按物品两侧分列 / 分组维度）', () => {
  const store = loadStore();
  const at = (iso) => Date.parse(iso);
  const records = [
    store.normalizeRecord({
      key: 'listing:9101',
      side: 'sell',
      itemHrid: '/items/iron_sword',
      price: 1000,
      orderQuantity: 10,
      filledQuantity: 10,
      status: '/market_listing_status/filled',
      createdAt: at('2026-07-01T10:00:00+08:00')
    }), store.normalizeRecord({
      key: 'listing:9102',
      side: 'buy',
      itemHrid: '/items/iron_sword',
      price: 600,
      orderQuantity: 10,
      filledQuantity: 10,
      status: '/market_listing_status/filled',
      createdAt: at('2026-07-02T10:00:00+08:00')
    }), store.normalizeRecord({
      key: 'listing:9103',
      side: 'sell',
      itemHrid: '/items/oak_log',
      price: 50,
      orderQuantity: 20,
      filledQuantity: 20,
      status: '/market_listing_status/filled',
      createdAt: at('2026-07-02T11:00:00+08:00')
    })
  ];
  const summary = store.summarize(records);
  // 出售收入按成交当时税率推算（2026-08-14 前 2%）：10000 × 0.98 + 1000 × 0.98 = 10780；购买不扣税。
  assert.equal(summary.collectedCoin, 10780);
  assert.equal(summary.nominalSell, 11000);
  assert.equal(summary.nominalBuy, 6000);
  assert.equal(summary.net, 4780, '净收支 = 收入 − 支出');
  const byItem = store.summarizeByItem(records, {getName: (hrid) => hrid});
  const sword = byItem.find((item) => item.itemHrid === '/items/iron_sword');
  assert.equal(sword.amount, 16000);
  assert.equal(sword.sellAmount, 10000);
  assert.equal(sword.buyAmount, 6000);
  assert.equal(sword.income, 9800, '按物品的收入也是税后到账 / 推算值');
  assert.equal(sword.expense, 6000);
  assert.equal(sword.sellCount, 1);
  assert.equal(sword.buyCount, 1);
  assert.equal(sword.sellFilledQuantity, 10);
  assert.equal(sword.buyFilledQuantity, 10);
  const breakdown = store.buildStatsBreakdown(records, {keyOf: (record) => record.side});
  const sellGroup = breakdown.find((group) => group.key === 'sell');
  const buyGroup = breakdown.find((group) => group.key === 'buy');
  assert.equal(sellGroup.income, 10780);
  assert.equal(sellGroup.expense, 0);
  assert.equal(buyGroup.expense, 6000);
  assert.equal(buyGroup.income, 0);
  assert.equal(breakdown.length, 2);
  // 维度解析不出结果的记录直接跳过，不产生空分组。
  assert.equal(store.buildStatsBreakdown(records, {keyOf: () => ''}).length, 0);
  // 统计口径按「创建时间」：筛选与趋势分桶都用 createdAt，不再有单独的统计时间点取值器。
  assert.doesNotMatch(storeSourceFile, /getStatsTimestamp/);
  assert.match(storeSourceFile, /toTimestamp\(record\?\.createdAt\)/);
});

test('市场交易记录：统计时间序列按日 / 周 / 月分桶，空桶保留、跨度大时自动升档', () => {
  const store = loadStore();
  const at = (iso) => Date.parse(iso);
  const record = (key, iso, side, price, quantity) =>
    store.normalizeRecord({
      key,
      side,
      itemHrid: '/items/iron_sword',
      price,
      orderQuantity: quantity,
      filledQuantity: quantity,
      status: '/market_listing_status/filled',
      createdAt: at(iso)
    });
  const records = [
    record(
      'listing:9201',
      '2026-07-01T10:00:00+08:00',
      'sell',
      1000,
      2
    ), record('listing:9202', '2026-07-03T09:00:00+08:00', 'sell', 1000, 1), record('listing:9203', '2026-07-03T20:00:00+08:00', 'buy', 600, 1)
  ];
  const day = store.buildStatsTimeSeries(records, {bucket: 'day'});
  assert.equal(day.bucket, 'day');
  assert.equal(day.requestedBucket, 'day');
  assert.equal(day.buckets.length, 3, '7-01 到 7-03 之间没有成交的日子也要留桶');
  assert.equal(day.buckets[0].income, 1960);
  assert.equal(day.buckets[1].count, 0);
  assert.equal(day.buckets[1].income, 0);
  assert.equal(day.buckets[2].income, 980);
  assert.equal(day.buckets[2].expense, 600);
  assert.equal(day.buckets[2].net, 380);
  assert.equal(day.buckets[2].filledQuantity, 2);
  const week = store.buildStatsTimeSeries(records, {bucket: 'week'});
  assert.equal(week.buckets.length, 1, '同一周的成交聚成一个桶');
  assert.equal(new Date(week.buckets[0].start).getDay(), 1, '周桶从周一开始');
  assert.equal(week.buckets[0].count, 3);
  const month = store.buildStatsTimeSeries(records, {bucket: 'month'});
  assert.equal(month.buckets.length, 1);
  assert.equal(new Date(month.buckets[0].start).getDate(), 1);
  assert.equal(month.buckets[0].income, 2940);
  // 桶按「创建时间」而不是成交时间：7 月 1 日创建、7 月 20 日才成交的单子仍落在 7-01 的桶里。
  const lateFill = store.buildStatsTimeSeries(
    [
      store.normalizeRecord({
        key: 'listing:9204',
        side: 'sell',
        itemHrid: '/items/iron_sword',
        price: 100,
        orderQuantity: 1,
        filledQuantity: 1,
        status: '/market_listing_status/filled',
        createdAt: at('2026-07-01T10:00:00+08:00'),
        filledAt: at('2026-07-20T10:00:00+08:00')
      })
    ],
    {bucket: 'day'}
  );
  assert.equal(lateFill.buckets.length, 1);
  assert.equal(new Date(lateFill.buckets[0].start).getDate(), 1, '按创建时间落桶');
  assert.equal(lateFill.buckets[0].income, 98);
  // 自动粒度：跨度 ≤ 45 天按日。
  assert.equal(store.buildStatsTimeSeries(records, {bucket: 'auto'}).bucket, 'day');
  // 跨度太大时（这里约两年半）显式粒度也升档，避免几百根柱子挤在一起。
  const wide = [
    record(
      'listing:9301',
      '2024-01-01T10:00:00+08:00',
      'sell',
      100,
      1
    ), record('listing:9302', '2026-07-01T10:00:00+08:00', 'sell', 100, 1)
  ];
  assert.equal(store.buildStatsTimeSeries(wide, {bucket: 'auto'}).bucket, 'month');
  const forced = store.buildStatsTimeSeries(wide, {bucket: 'day'});
  assert.equal(forced.bucket, 'month');
  assert.equal(forced.requestedBucket, 'day', '请求的粒度另存一份');
  assert.equal(forced.expectedBucket, 'day', '本应有的粒度是日，和实际粒度不同才提示已升档');
  assert.equal(store.buildStatsTimeSeries(records, {bucket: 'auto'}).expectedBucket, 'day', '自动粒度不误报升档');
  assert.equal(
    store.buildStatsTimeSeries(wide, {bucket: 'auto'}).bucket,
    store.buildStatsTimeSeries(wide, {bucket: 'auto'}).expectedBucket
  );
  // 月粒度不受柱数上限影响：2024-01 到 2026-07 共 31 个月。
  assert.equal(store.buildStatsTimeSeries(wide, {bucket: 'month'}).buckets.length, 31);
  // 没有任何可用时间戳时返回空序列，不抛错。
  const empty = store.buildStatsTimeSeries([
    {key: 'listing:9401', side: 'sell', price: 100, filledQuantity: 1, createdAt: 0}, null
  ]);
  assert.equal(empty.buckets.length, 0);
  assert.equal(empty.expectedBucket, 'day');
  assert.equal(store.buildStatsTimeSeries([]).buckets.length, 0);
});

test('市场交易记录：图表几何（轴刻度 / 分组柱 / 堆叠条 / 环形弧）', () => {
  const charts = loadCharts();
  const axis = charts.buildValueAxis({max: 12345, tickCount: 4});
  assert.equal(axis.min, 0);
  assert.ok(axis.max >= 12345, '轴上限不小于数据最大值');
  assert.equal(axis.ticks[0], 0);
  assert.equal(axis.ticks[axis.ticks.length - 1], axis.max);
  assert.ok(axis.ticks.length >= 4);
  const negative = charts.buildValueAxis({min: -3000, max: 5000, tickCount: 4});
  assert.ok(negative.min <= -3000, '净收支为负时轴要盖住负值');
  assert.ok(negative.ticks.includes(0), '零刻度必须保留');
  const zeroAxis = charts.buildValueAxis({max: 0});
  assert.equal(zeroAxis.min, 0);
  assert.equal(zeroAxis.max, 1);
  assert.equal(zeroAxis.ticks.length, 2, '全 0 数据不出 0 除');
  const layout = charts.layoutBarGroups({count: 3, seriesCount: 2, plot: {x: 10, width: 300}});
  assert.equal(layout.length, 3);
  assert.equal(layout[0].seriesX.length, 2);
  assert.ok(layout[0].seriesX[1] > layout[0].seriesX[0]);
  assert.ok(layout[0].x >= 10);
  assert.ok(layout[0].x + layout[0].width <= 10 + 300, '柱子不出绘图区');
  assert.ok(layout[0].center < layout[1].center && layout[1].center < layout[2].center);
  assert.equal(charts.layoutBarGroups({count: 0, seriesCount: 2, plot: {x: 0, width: 100}}).length, 0);
  const segments = charts.layoutStackedSegments({values: [
      3, 1
    ], length: 100});
  assert.equal(segments[0].width, 75);
  assert.equal(segments[1].offset, 75);
  assert.equal(segments[0].ratio, 0.75);
  const zeroSegments = charts.layoutStackedSegments({values: [
      0, 0
    ], length: 100});
  assert.equal(zeroSegments[0].width, 0);
  assert.equal(zeroSegments[1].ratio, 0);
  const arcs = charts.layoutDoughnutArcs({values: [
      1, 1
    ], cx: 90, cy: 90, outerRadius: 70, innerRadius: 40});
  assert.equal(arcs.length, 2);
  assert.equal(arcs[0].ratio, 0.5);
  assert.match(arcs[0].path, /^M /);
  assert.equal(arcs[1].endAngle - arcs[0].startAngle, Math.PI * 2, '所有扇区合起来正好一圈');
  const ring = charts.layoutDoughnutArcs({values: [
      5
    ], cx: 90, cy: 90, outerRadius: 70, innerRadius: 40});
  assert.equal((ring[0].path.match(/A /g) || []).length, 4, '只有一个扇区时用两段半圆拼整圈');
  assert.equal(ring[0].ratio, 1);
  const mixed = charts.layoutDoughnutArcs({values: [
      5, 0
    ], cx: 90, cy: 90, outerRadius: 70, innerRadius: 40});
  assert.equal(mixed[1].path, '', '0 值扇区不画路径但保留占位');
  assert.equal(
    charts.layoutDoughnutArcs({values: [
        0
      ], cx: 90, cy: 90, outerRadius: 70}).length,
    0
  );
  assert.equal(charts.pickLabelStep(0), 1);
  assert.equal(charts.pickLabelStep(3, 8), 1);
  assert.equal(charts.pickLabelStep(30, 8), 4);
  assert.equal(charts.percentageText(0.1234), '12.3%');
  assert.equal(charts.percentageText(1), '100%');
  assert.equal(charts.percentageText(0), '0%');
});

test('市场交易记录：记录量阈值与存储体积估算可用', () => {
  const store = loadStore();
  assert.equal(store.RECORDS_SOFT_LIMIT, 20000);
  assert.equal(store.INSTANT_MATCH_WINDOW_MS, 60 * 1000);
  assert.equal(store.INSTANT_DEDUPE_WINDOW_MS, 10 * 60 * 1000);
  const container = store.createStore();
  store.applyListingBatch(
    store.getBucketRecords(container, 'live:42'),
    [
      listing()
    ],
    NOW
  );
  assert.ok(store.estimateStoreBytes(container) > 0);
  assert.equal(store.countRecords(store.createStore()), 0);
  // 畸形存储不抛错：解析为可用的空结构。
  assert.equal(store.countRecords(store.parseStore('{oops')), 0);
  assert.equal(store.countRecords(store.parseStore('')), 0);
  assert.equal(store.parseStore(JSON.stringify({buckets: {x: 'nope'}})).buckets.x, undefined);
});

test('市场交易记录：到账以官方数据为准，缺失时按历史税率推算（仅用于导入/历史数据）', () => {
  // 实时链路仍按官方未领取字段累计，不推算。
  assert.match(storeSourceFile, /unclaimedCoinCount/);
  assert.match(storeSourceFile, /unclaimedItemCount/);
  assert.match(storeSourceFile, /collectedCoinCount/);
  assert.match(storeSourceFile, /collectedItemCount/);
  const store = loadStore();
  const base = (overrides) =>
    store.normalizeRecord({
      key: 'listing:9001',
      side: 'sell',
      itemHrid: '/items/iron_sword',
      price: 1000,
      orderQuantity: 10,
      filledQuantity: 10,
      status: '/market_listing_status/filled',
      createdAt: Date.parse('2026-07-01T00:00:00+08:00'),
      filledAt: Date.parse('2026-07-01T00:00:00+08:00'),
      ...overrides
    });
  // 普通物品按成交时间的历史税率扣税：2026-08-14 前 2%、08-14 起 5%、09-28 起 4%。
  assert.equal(base({}).collectedCoinCount, 9800);
  assert.equal(base({}).collectedTaxRate, 0.02);
  assert.equal(
    base({
      createdAt: Date.parse('2026-08-20T00:00:00+08:00'),
      filledAt: Date.parse('2026-08-20T00:00:00+08:00')
    }).collectedCoinCount,
    9500
  );
  assert.equal(
    base({
      createdAt: Date.parse('2026-09-28T00:00:00+08:00'),
      filledAt: Date.parse('2026-09-28T00:00:00+08:00')
    }).collectedCoinCount,
    9600
  );
  // 牛铃袋始终 18%。
  assert.equal(base({itemHrid: '/items/bag_of_10_cowbells'}).collectedCoinCount, 8200);
  // 购买侧同一口径：已成交数量 × 单价 ×（1 − 税率），也是金额，不再是物品件数。
  const buy = store.normalizeRecord({
    key: 'listing:9002',
    side: 'buy',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: '/market_listing_status/filled',
    createdAt: NOW
  });
  assert.equal(buy.collectedCoinCount, 10000, '购买不扣税：数量 × 单价');
  assert.equal(buy.collectedTaxRate, 0);
  assert.equal(buy.collectedItemCount, 0);
  assert.equal(buy.collectedEstimated, true);
  assert.equal(store.getCollectedCount(buy), 10000, '购买侧收入/支出取支出金额');
  assert.equal(
    store.summarize([
      buy
    ]).collectedCoin,
    0,
    '收入只统计出售侧'
  );
  assert.equal(
    store.summarize([
      buy
    ]).nominalBuy,
    10000,
    '购买不扣税：支出金额就是名义金额'
  );
  assert.equal(
    store.summarize([
      buy
    ]).collectedItem,
    0
  );
  // 单价缺失（为 0）时算不出金额，不写推算值，避免出现「到账 0」的假数据。
  const noPrice = store.normalizeRecord({
    key: 'listing:9006',
    side: 'buy',
    itemHrid: '/items/iron_sword',
    price: 0,
    orderQuantity: 10,
    filledQuantity: 10,
    status: '/market_listing_status/filled',
    createdAt: NOW
  });
  assert.equal(noPrice.collectedEstimated, false);
  assert.equal(noPrice.collectedCoinCount, 0);
  // 旧的推算值会在归一化时按当前公式重算（购买侧曾记成件数、售价侧公式调整过）。
  const staleBuy = store.normalizeRecord({
    key: 'listing:9007',
    side: 'buy',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: '/market_listing_status/filled',
    createdAt: NOW,
    collectedItemCount: 10,
    collectedEstimated: true,
    collectedTaxRate: 0
  });
  assert.equal(staleBuy.collectedCoinCount, 10000);
  assert.equal(staleBuy.collectedItemCount, 0);
  const staleSell = store.normalizeRecord({
    key: 'listing:9008',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: '/market_listing_status/filled',
    createdAt: NOW,
    collectedCoinCount: 1,
    collectedEstimated: true,
    collectedTaxRate: 0.02
  });
  assert.equal(staleSell.collectedCoinCount, 9800);
  // 有官方到账/待领取/领取明细时一律以官方为准，不推算。
  const official = base({collectedCoinCount: 1234});
  assert.equal(official.collectedCoinCount, 1234);
  assert.equal(official.collectedEstimated, false);
  assert.equal(base({unclaimedCoinCount: 500}).collectedCoinCount, 0);
  // 官方待领取数据到达时作废此前的推算值，之后按官方减少量累计（不重复计数）。
  const estimated = base({});
  assert.equal(estimated.collectedEstimated, true);
  const fields = store.listingToFields(
    listing({
      id: 9001,
      status: LISTING_URL + 'filled',
      filledQuantity: 10,
      unclaimedCoinCount: 9600
    })
  );
  const afterOfficial = store.applyListingObservation(estimated, fields, NOW, {origin: 'update'});
  assert.equal(afterOfficial.collectedEstimated, false);
  assert.equal(afterOfficial.collectedCoinCount, 0);
  assert.equal(afterOfficial.unclaimedCoinCount, 9600);
  // 幂等：已推算的记录再归一化不变。
  const once = base({});
  const twice = store.normalizeRecord(once);
  assert.equal(twice.collectedCoinCount, once.collectedCoinCount);
  assert.equal(twice.collectedEstimated, true);
  // 旧的脏数据：导入备注里同一段重复上万次时，归一化会收敛成一段（历史 501KB 备注的来源）。
  const bloated = store.normalizeRecord({
    key: 'listing:9005',
    itemHrid: '/items/iron_sword',
    status: '/market_listing_status/filled',
    filledQuantity: 1,
    importNote: Array.from({length: 400}, (_, index) => (index % 2 ? 'Source: Edible Tools' : '来源：食用工具')).join(
      '；'
    )
  });
  assert.equal(bloated.importNote, '来源：食用工具；Source: Edible Tools');
  // 加载历史存储（parseStore）与导入（parseImportPayload）都会补算缺失的到账。
  const raw = store.serializeStore({
    schemaVersion: store.SCHEMA_VERSION,
    updatedAt: NOW,
    buckets: {
      'live:1': [
        {
          key: 'listing:9003',
          side: 'sell',
          itemHrid: '/items/iron_sword',
          price: 1000,
          orderQuantity: 10,
          filledQuantity: 10,
          status: '/market_listing_status/filled',
          createdAt: Date.parse('2026-07-01T00:00:00+08:00'),
          filledAt: Date.parse('2026-07-01T00:00:00+08:00')
        }
      ]
    }
  });
  assert.equal(store.parseStore(raw).buckets['live:1'][0].collectedCoinCount, 9800);
  const parsed = store.parseImportPayload(
    JSON.stringify({
      app: 'MST',
      type: 'market-history',
      schemaVersion: 1,
      buckets: {
        'live:1': [
          {
            key: 'listing:9004',
            side: 'sell',
            itemHrid: '/items/iron_sword',
            price: 1000,
            orderQuantity: 10,
            filledQuantity: 10,
            status: '/market_listing_status/filled',
            createdAt: Date.parse('2026-09-29T00:00:00+08:00'),
            filledAt: Date.parse('2026-09-29T00:00:00+08:00')
          }
        ]
      }
    })
  );
  assert.equal(parsed.buckets['live:1'][0].collectedCoinCount, 9600);
});

test('市场交易记录：多占位符文案的调用参数齐全', () => {
  // 导入报告文案有 5 个占位符（新增/更新/去重/冲突/跳过），调用必须传满 5 个实参，
  // 否则界面会残留 "{4}" 这类未替换的占位符。
  const zhText = messagesSourceFile.match(/marketHistoryImportReport:\s*\{[\s\S]*?zh:\s*'([^']+)'/)?.[1] || '';
  assert.equal((zhText.match(/\{\d\}/g) || []).length, 5);
  assert.match(
    moduleSourceFile,
    /marketHistoryImportReport',\s*report\.added,\s*report\.updated,\s*report\.deduped,\s*report\.conflicts,\s*report\.skipped/
  );
  // 每页条数选项文案为「N 条」（1 个占位符），调用传入一条实参。
  const sizeText = messagesSourceFile.match(/marketHistoryPageSizeOption:\s*\{[^}]*zh:\s*'([^']+)'/)?.[1] || '';
  assert.equal(sizeText, '{0} 条');
  // 合计已去掉条数（条数由底栏「共 N 条」承担），不再引用筛选/全部条数文案。
  assert.doesNotMatch(moduleSourceFile, /marketHistoryCountOfAll/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryCountOfAll:/);
  assert.match(moduleSourceFile, /marketHistoryPageSizeOption',\s*String\(size\)/);
});

test('市场交易记录：模块装配、入口与消息订阅链路完整', () => {
  // 主入口锚定 MUI 标签 flex 容器，与「商品列表 / 我的挂牌」直接同排；
  // 游戏源码若仍保留 TabsComponent 嵌套，则按兼容选择器回退。
  assert.match(
    runtimeSourceFile,
    /marketplaceTabBar:\s*'\[class\*="MarketplacePanel_marketplacePanel__"\] > \.MuiTabs-flexContainer'/
  );
  assert.match(
    runtimeSourceFile,
    /marketplaceTabBarNested:\s*'\[class\*="MarketplacePanel_tabsComponentContainer__"\] \.MuiTabs-flexContainer'/
  );
  assert.match(
    moduleSourceFile,
    /GameUiAdapter\.query\('marketplaceTabBar'\)\s*\|\|\s*GameUiAdapter\.query\('marketplaceTabBarNested'\)/
  );
  assert.match(moduleSourceFile, /mst-market-history-entry-button MuiButtonBase-root MuiTab-root/);
  assert.match(moduleSourceFile, /mst-market-history-entry-label/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-entry-button\s*\{/);
  assert.match(moduleCssSourceFile, /min-width:\s*5rem/);
  assert.match(moduleCssSourceFile, /fill:\s*currentColor/);
  // 单例标记写在页面 window，规则与市场加购一致。
  assert.match(moduleSourceFile, /pageWindow\.__MST_MARKET_HISTORY_OWNER__/);
  // 消息接线：登录快照、增量、出站请求。
  assert.match(moduleSourceFile, /mst:ws:init-character-data/);
  assert.match(moduleSourceFile, /mst:ws:message/);
  assert.match(moduleSourceFile, /mst:ws:send/);
  assert.match(moduleSourceFile, /market_listings_updated/);
  assert.match(moduleSourceFile, /endMarketListings/);
  assert.match(moduleSourceFile, /post_market_order/);
  assert.match(moduleSourceFile, /claim_market_listing/);
  assert.match(moduleSourceFile, /cancel_market_listing/);
  // 存储：GM 存储键与 GM 变更监听，不使用 localStorage。
  assert.match(dataSourceFile, /MARKET_HISTORY:\s*'MST_MARKET_history'/);
  assert.match(moduleSourceFile, /GmApi\.getValue/);
  assert.match(moduleSourceFile, /GmApi\.setValue/);
  assert.match(moduleSourceFile, /addValueChangeListener/);
  assert.doesNotMatch(moduleSourceFile, /localStorage/);
  // 模块注册与启动链路（工具箱菜单入口调用同一个 open）。
  assert.match(moduleIndexSourceFile, /MarketHistoryFeature/);
  assert.match(moduleIndexSourceFile, /MarketHistoryFeature\.configure\(ctx\)/);
  assert.match(appControllerSourceFile, /new MarketHistoryFeature\(\)/);
  assert.match(appControllerSourceFile, /marketHistory\.init\(\)/);
  assert.match(
    toolkitMenuSourceFile,
    /\{\s*key: 'marketHistory',\s*icon: 'marketplace',\s*handler: \(\) => this\.marketHistory\.open\(\)\}/
  );
  assert.match(source, /src\/modules\/market-history\/store\.js/);
  // i18n 分组与文案（中英文）齐全，含删除/导入/导出关键项。
  assert.match(messagesSourceFile, /marketHistory:\s*MARKET_HISTORY_MESSAGES/);
  assert.match(messagesSourceFile, /marketHistoryEntry:\s*\{zh: '交易记录'/);
  assert.match(messagesSourceFile, /marketHistoryStatusPartialCancelled:/);
  assert.match(messagesSourceFile, /marketHistoryExpiresAt:/);
  assert.match(messagesSourceFile, /marketHistoryTaxTaken:/);
  assert.match(storeSourceFile, /createdTimestamp/);
  assert.match(storeSourceFile, /expirationTimestamp/);
  assert.match(storeSourceFile, /characterID/);
  assert.match(messagesSourceFile, /marketHistoryTotalsIncome:/);
  assert.match(messagesSourceFile, /marketHistoryTotalsExpense:/);
  assert.match(messagesSourceFile, /marketHistoryImportModeOverwrite:/);
  assert.match(messagesSourceFile, /marketHistoryTabManage:/);
  assert.match(messagesSourceFile, /marketHistoryTabHelp:/);
  // 购买侧类型名与官方文案一致（Buy Listing / 购买挂牌）。
  assert.match(messagesSourceFile, /marketHistoryTypeBuyListing: {zh: '购买挂牌', en: 'Buy Listing'}/);
  assert.match(messagesSourceFile, /marketHistorySelectAllPage:/);
  // 模块样式与用户文档、设计文档齐备。
  assert.match(moduleCssSourceFile, /\.mst-market-history-table/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-footer/);
  assert.match(usageSource, /市场交易记录/);
  assert.match(designSource, /实际到账/);
});

test('市场交易记录：界面布局约束（紧凑工具栏 / 固定列宽 / 数字右对齐）', () => {
  // 工具栏一行主筛选：低频筛选（单价 / 数量）收进「更多筛选」按需展开；
  // 物品筛选与时间字段已移除（时间范围固定按创建时间）。
  assert.match(moduleSourceFile, /mst-market-history-more-toggle/);
  assert.match(moduleSourceFile, /marketHistoryMoreFilters/);
  assert.match(moduleSourceFile, /state\.moreOpen \?/);
  assert.match(moduleSourceFile, /moreFilterCount/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryFilterItemAll|marketHistoryTimeField/);
  // 状态筛选是下拉多选面板（需求 §7.4），展开只切容器类、不重绘工具栏，
  // 保证点击外部关闭面板时不会把当次点击的目标节点重建掉。
  assert.match(moduleSourceFile, /mst-market-history-multiselect/);
  assert.match(moduleSourceFile, /setStatusPanelOpen/);
  assert.match(moduleSourceFile, /bindPopoverDismiss/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-multiselect-open \.mst-market-history-popover\s*\{/);
  // 类型筛选为单选下拉；排序只用列头（去掉工具栏排序行），列定义驱动表头与列宽。
  assert.match(moduleSourceFile, /marketHistoryFilterTypeAll/);
  assert.match(moduleSourceFile, /RECORD_COLUMNS/);
  assert.doesNotMatch(moduleSourceFile, /marketHistorySortLabel|marketHistorySortAsc|marketHistorySortDesc/);
  // 记录表固定列宽（内容变化不重算列宽），数字列右对齐并用更高特异性覆盖通用 td 规则。
  assert.match(moduleCssSourceFile, /\.mst-market-history-table-records\s*\{\s*table-layout:\s*fixed/);
  assert.match(moduleCssSourceFile, /th\.mst-market-history-number-head/);
  assert.match(moduleCssSourceFile, /td\.mst-market-history-number-cell\s*\{\s*text-align:\s*right/);
  // 行内删除沿用全局 .mst-row-remove 的方形按钮，尺寸与配色对齐战斗升级计算器列表；
  // 确认态只换配色。
  assert.match(moduleSourceFile, /mst-row-remove mst-market-history-row-remove/);
  assert.match(moduleCssSourceFile, /width:\s*1\.45rem/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-row-remove-armed/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-record-row:hover td\s*\{/);
  // 勾选列 + 序号列（跨页增长）+ 表头全选；批量删除只处理勾选行。
  assert.match(moduleSourceFile, /mst-market-history-select-all/);
  assert.match(moduleSourceFile, /mst-market-history-row-check/);
  assert.match(moduleSourceFile, /marketHistoryColumnIndex/);
  assert.match(moduleSourceFile, /startIndex \+ index \+ 1/);
  assert.match(moduleSourceFile, /deleteSelectedRecords/);
  assert.match(moduleSourceFile, /togglePageSelected/);
  // 合计不占用表格行（没有锁定行）：本页合计 / 筛选总计放在弹窗底栏、分页区上方，
  // 两个分组在宽度允许时同行、放不下时换行；底栏条数行单独一行。
  assert.doesNotMatch(moduleSourceFile, /mst-market-history-tfoot/);
  assert.doesNotMatch(moduleCssSourceFile, /mst-market-history-tfoot/);
  assert.match(moduleSourceFile, /summaryGroupTemplate/);
  assert.match(moduleSourceFile, /marketHistoryTotalsPage/);
  assert.match(moduleSourceFile, /marketHistoryTotalsFiltered/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-summary-group\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-footer-bar\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-summary\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  // 底栏：左侧总条数（共 N 条），右侧依次跳页、每页条数、翻页按钮组。
  assert.match(moduleSourceFile, /marketHistoryPageJump/);
  assert.match(moduleSourceFile, /marketHistoryPageSizeOption/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-pagination\s*\{[\s\S]*?margin-left:\s*auto/);
  // 翻页按钮组与跳页 / 每页条数紧挨着排列，不再额外留白。
  assert.match(moduleCssSourceFile, /\.mst-market-history-page-group\s*\{[^}]*gap:\s*0\.25rem/);
  assert.doesNotMatch(moduleCssSourceFile, /\.mst-market-history-page-group\s*\{[^}]*margin-left/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryPageSize'\)/, '“每页”标签已移除');
  // 页码按钮最多 5 个（`paginationItems` 三分支各给出 5 个数字）。
  assert.match(moduleSourceFile, /function paginationItems\(pageCount, current\)/);
  assert.match(moduleSourceFile, /if \(pageCount <= 5\)/);
  assert.match(moduleSourceFile, /if \(current <= 3\)/);
  assert.match(moduleSourceFile, /if \(current >= pageCount - 2\)/);
  assert.match(moduleSourceFile, /'ellipsis', current - 1, current, current \+ 1/);
  assert.match(moduleSourceFile, /pageCount - 3, pageCount - 2, pageCount - 1/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryResultCount/);
  // 每页默认 20 条。
  assert.match(moduleSourceFile, /pageSize: 20/);
  assert.match(moduleSourceFile, /Number\(event\.target\.value\) \|\| 20/);
  // 导出的 JSON 保持紧凑（不传缩进参数，体积与读写都更省）。
  assert.match(moduleSourceFile, /JSON\.stringify\(payload\)/);
  assert.doesNotMatch(moduleSourceFile, /JSON\.stringify\(payload,\s*null,\s*2\)/);
  // 帮助页签：说明食用工具桥接脚本的接入与双向迁移，@require 行固定在已发布的提交。
  assert.match(moduleSourceFile, /marketHistoryTabHelp/);
  assert.match(moduleSourceFile, /helpTemplate\(\)/);
  assert.match(moduleSourceFile, /EDIBLE_BRIDGE_PINNED_COMMIT = '4851b0229332a561424e4713fe11851c944f94b2'/);
  assert.match(moduleSourceFile, /jsdelivr\.net\/gh\/sunrishe\/mwi-sunrishe-toolkit@/);
  assert.match(moduleSourceFile, /EDIBLE_BRIDGE_REQUIRE_LINE/);
  assert.match(moduleSourceFile, /copyBridgeRequireLine/);
  assert.match(moduleSourceFile, /writeClipboard\(EDIBLE_BRIDGE_REQUIRE_LINE\)/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-help-code\s*\{/);
  // 收入/支出按方向着色，格式化的数字在 title 里给出原始值（含合计与统计页签）。
  assert.match(moduleSourceFile, /mst-market-history-income-cell/);
  assert.match(moduleSourceFile, /mst-market-history-expense-cell/);
  assert.match(moduleCssSourceFile, /td\.mst-market-history-number-cell\.mst-market-history-income-cell/);
  assert.match(moduleCssSourceFile, /td\.mst-market-history-number-cell\.mst-market-history-expense-cell/);
  assert.match(moduleSourceFile, /rawValueText\(/);
  assert.match(moduleSourceFile, /toLocaleString\(this\.ctx\.i18n\.locale\)/);
  assert.match(moduleSourceFile, /marketHistoryRawValue/);
  assert.match(moduleSourceFile, /mst-market-history-summary-value" title=\$\{raw\}/);
  assert.match(messagesSourceFile, /marketHistoryRawValue:/);
  // 行模板的列一个都不能少：曾经漏掉「已成交/总数」那一格，整行列会跟着错位。
  assert.match(
    moduleSourceFile,
    /<td class="mst-market-history-number-cell">\$\{progress\}<\/td>/,
    '「已成交/总数」列必须存在'
  );
  assert.match(moduleSourceFile, /<td class="mst-market-history-number-cell">\$\{String\(index\)\}<\/td>/);
  assert.match(moduleSourceFile, /title=\$\{this\.rawValueText\(record\.price\)\}>/);
  assert.match(moduleSourceFile, /title=\$\{this\.rawValueText\(amount\)\}>/);
  assert.match(moduleSourceFile, /'mst-market-history-number-cell' \+ collectedTone/);
});

test('市场交易记录：统计页签使用独立筛选并给出四个维度的图表', () => {
  // 统计筛选与记录列表完全独立：状态挂在 stats.filters 下，解析与取数各有入口，不复用列表筛选。
  assert.match(moduleSourceFile, /stats: this\.createStatsState\(\)/);
  assert.match(moduleSourceFile, /createStatsState\(\) \{/);
  assert.match(moduleSourceFile, /resolveStatsFilters\(\) \{/);
  assert.match(moduleSourceFile, /statsRecords\(\) \{/);
  assert.match(moduleSourceFile, /JSON\.stringify\(this\.resolveStatsFilters\(\)\)/);
  assert.doesNotMatch(moduleSourceFile, /statsIgnoreFilters/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryStatsIgnoreFilters:/);
  // 时间范围按「创建时间」筛选（与趋势图分桶同一口径，界面标签也写明创建时间）；方向筛选走 store 的 sides。
  assert.match(moduleSourceFile, /marketHistoryStatsTimeField/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryStatsTimeRange|getStatsTimestamp/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryStatsTimeRange:|marketHistoryStatsTimeAll:/);
  assert.match(moduleSourceFile, /sides = filters\.side && filters\.side !== 'all'/);
  assert.match(storeSourceFile, /const sides = normalizeIdList\(filters\.sides\)/);
  assert.match(
    storeSourceFile,
    /const timestamp = timeField === 'filledAt' \? getSortTimestamp\(record, 'filledAt'\) : record\.createdAt;/
  );
  // 总览数值卡去掉「待领取」（短期的临时状态，参考价值低）。
  const statsTemplateBody = moduleSourceFile.match(/statsTemplate\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(statsTemplateBody.length > 0, 'statsTemplate 未找到');
  assert.doesNotMatch(statsTemplateBody, /marketHistoryTotalsPending/, '统计总览不再显示待领取');
  // 四张图表：收支趋势 / 物品排行 / 分类构成 / 记录构成，全部由纯几何函数绘制（不引图表库）。
  [
    'marketHistoryStatsTrendTitle', 'marketHistoryStatsRankTitle', 'marketHistoryStatsShareTitle', 'marketHistoryStatsComposeTitle'
  ].forEach((key) => assert.ok(moduleSourceFile.includes(`i18n.t('${key}')`), `${key} 未接线`));
  assert.match(moduleSourceFile, /buildStatsTimeSeries\(records, \{bucket: state\.stats\.bucket\}\)/);
  assert.match(
    moduleSourceFile,
    /buildStatsBreakdown\(records, \{keyOf: \(record\) => this\.itemCategoryKey\(record\) \|\| 'others'\}\)/
  );
  assert.match(moduleSourceFile, /buildValueAxis\(/);
  assert.match(moduleSourceFile, /layoutBarGroups\(/);
  assert.match(moduleSourceFile, /layoutStackedSegments\(/);
  assert.match(moduleSourceFile, /layoutDoughnutArcs\(/);
  // SVG 片段必须用 uhtml 的 svg 标记：html 标记生成的元素是 HTML 命名空间，插进 <svg> 里不显示
  // （柱子 / 折线 / 扇区曾经整块不可见，控制台也不报错，只能靠截图发现）。
  assert.match(uiSourceFile, /this\._svg = module\.svg/);
  assert.match(uiSourceFile, /svg\(strings, \.\.\.values\) \{/);
  assert.ok(
    (moduleSourceFile.match(/TemplateRenderer\.svg`/g) || []).length >= 6,
    '趋势图与环形图的片段都要用 svg 标记'
  );
  assert.doesNotMatch(moduleSourceFile, /@require .*chart|from 'chart\.js'/);
  // 聚合在 store、几何在 charts：import 来源写错时构建期会报「is not exported by」。
  const chartsImport = moduleSourceFile.match(/import \{([\s\S]*?)\} from '\.\/charts\.js';/)?.[1] || '';
  const storeImport = moduleSourceFile.match(/import \{([\s\S]*?)\} from '\.\/store\.js';/)?.[1] || '';
  assert.match(chartsImport, /layoutBarGroups/);
  assert.match(chartsImport, /buildValueAxis/);
  assert.doesNotMatch(chartsImport, /buildStatsTimeSeries|buildStatsBreakdown/);
  assert.match(storeImport, /buildStatsTimeSeries/);
  assert.match(storeImport, /buildStatsBreakdown/);
  assert.doesNotMatch(storeImport, /getStatsTimestamp/, '统计时间点取值器已随创建时间口径移除');
  // 每个图表卡片都能切维度：粒度 / 排行指标 / 分类收支 / 状态与类型。
  assert.match(moduleSourceFile, /state\.stats\.bucket = key/);
  assert.match(moduleSourceFile, /state\.stats\.rankMetric = key/);
  assert.match(moduleSourceFile, /stats\.categoryMetric = key/);
  assert.match(moduleSourceFile, /stats\.composeDim = key/);
  assert.match(moduleSourceFile, /marketHistoryStatsBucketForced/);
  assert.match(moduleSourceFile, /series\.bucket !== series\.expectedBucket/, '只有真的升档才提示');
  assert.match(storeSourceFile, /expectedBucket/);
  // uhtml 的洞不能是 null（数组位会抛 Cannot read properties of null）：
  // 条件渲染统一走空模板 / 空数组，数组插值只收集命中的模板。
  assert.match(moduleSourceFile, /function templateList\(values, build\)/);
  assert.match(moduleSourceFile, /emptyTemplate\(\) \{/);
  assert.match(moduleSourceFile, /: this\.emptyTemplate\(\)/);
  assert.match(moduleSourceFile, /: \[\];/, '条件数组退回空数组');
  // 无数据也保留切换按钮：分类构成按当前指标算不出数时，用户要能直接切到另一个指标。
  assert.match(moduleSourceFile, /statsEmptyCardTemplate\(title, controls = \[\]\)/);
  assert.match(moduleSourceFile, /return this\.statsEmptyCardTemplate\(title, controls\)/);
  // 图表数值也带精确原值 title（扇形、图例、排行条、数值卡）。
  assert.match(
    moduleSourceFile,
    /mst-market-history-chart-legend-value" title=\$\{this\.rawValueText\(entry\.value\)\}/
  );
  assert.match(moduleSourceFile, /mst-market-history-rank-value" title=\$\{this\.rawValueText\(item\.total\)\}/);
  assert.match(moduleSourceFile, /mst-market-history-stat-value' \+ tone\} title=\$\{raw\}/);
  // 数值卡：净收支按正负着色，去掉委托数量。
  assert.match(moduleSourceFile, /mst-market-history-stat-positive/);
  assert.match(moduleSourceFile, /mst-market-history-stat-negative/);
  assert.match(moduleSourceFile, /marketHistoryStatsNet/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryTotalsOrderQuantity/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryTotalsOrderQuantity:/);
  // 按物品汇总表两侧分列：出售金额 / 购买金额 / 收入金额。
  assert.match(moduleSourceFile, /title=\$\{this\.rawValueText\(item\.sellAmount\)\}/);
  assert.match(moduleSourceFile, /title=\$\{this\.rawValueText\(item\.buyAmount\)\}/);
  assert.match(moduleSourceFile, /mst-market-history-stats-table-wrap/);
  // 样式：图表卡片网格、收支柱与净收支折线配色、排行条与吸顶表头。
  assert.match(moduleCssSourceFile, /\.mst-market-history-stats-filters\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-chart-grid\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-chart-doughnut\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-chart-bar-income\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-chart-bar-expense\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-chart-swatch-net\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-rank-track\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-stat-positive\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-stat-negative\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-stats-table thead th\s*\{[\s\S]*?position:\s*sticky/);
  // 统计页文案齐备（中文键都在 messages 分组里）。
  [
    'marketHistoryStatsTimeField', 'marketHistoryStatsTime90d', 'marketHistoryStatsSide', 'marketHistoryStatsSideSell', 'marketHistoryStatsSideBuy',
    'marketHistoryStatsCategory', 'marketHistoryStatsNet', 'marketHistoryStatsRankAmount', 'marketHistoryStatsRankQuantity', 'marketHistoryStatsRankCount',
    'marketHistoryStatsTableTitle', 'marketHistoryStatsBucketAuto', 'marketHistoryStatsBucketDay', 'marketHistoryStatsBucketWeek', 'marketHistoryStatsBucketMonth',
    'marketHistoryStatsBucketForced', 'marketHistoryStatsNoData', 'marketHistoryStatsOthers'
  ].forEach((key) => assert.ok(messagesSourceFile.includes(`${key}: {zh:`), `${key} 缺少中文文案`));
  // 新增的纯计算文件进运行时清单，构建产物里也会包含图表几何。
  assert.match(source, /market-history\/charts\.js/);
});
