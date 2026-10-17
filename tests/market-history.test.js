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
// 涨跌配色是跨模块共用组件，样式统一放在 components.css。
const componentsCssSourceFile = readSourceFile('src', 'common', 'styles', 'components.css');
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const toolkitMenuSourceFile = readSourceFile('src', 'modules', 'toolkit-menu', 'index.js');
const dataSourceFile = readSourceFile('src', 'common', 'data.js');
const runtimeSourceFile = readSourceFile('src', 'common', 'runtime.js');
const uiSourceFile = readSourceFile('src', 'common', 'ui.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const usageSource = readSourceFile('docs', 'usage.md');
const designSource = readSourceFile('docs', 'analysis', '市场交易记录需求说明书.md');

// 测试基准时间取在当前税率档位内（2026-09-28 起 4%），与用例里的金额口径保持一致；
// 历史税率分档（2% / 5%）由「到账推算」用例用显式日期单独覆盖。
const NOW = Date.parse('2026-10-01T00:00:00+08:00');
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
        listUnlinkedInstants, applyOutgoingMessage, getDisplayStatus, getRecordType, getRecordAmount,
        isUnconfirmedInstant, taxDerivedAmountOf, findRecentTradedRecords,
        getCollectedCount, getSortTimestamp, filterRecords, sortRecords, paginate, summarize,
        summarizeByItem, buildStatsBreakdown, buildStatsTimeSeries,
        buildExportPayload, parseImportPayload, mergeImport, estimateStoreBytes, normalizeClaim,
        REPAIR_TYPE_KEYS, createRepairReport, scanRepairIssues, scanStoreRepairs, repairRecords
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
  assert.equal(records[0].collectedCoinCount, 3840, '收到可领取条目即计入收入（订单完成）');
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
  assert.equal(records[0].unclaimedCoinCount, 9600, '待领取值保留为对账基准（金额已在成交时入账）');
  assert.equal(records[0].collectedCoinCount, 9600);
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

test('市场交易记录：登录快照补齐从未观测到的订单（未成交 / 全部成交待领取 / 部分成交）', () => {
  const store = loadStore();
  const records = [];
  // 订单创建时脚本没收到消息，登录快照（init_character_data.myMarketListings）里才看到：
  // 可能一个都没成交，也可能已经全部或部分成交。
  store.applyListingBatch(
    records,
    [
      listing({
        id: 71,
        orderQuantity: 10,
        filledQuantity: 0,
        status: LISTING_URL + 'active',
        createdTimestamp: '2026-10-01T02:00:00.000000000Z',
        expirationTimestamp: '2026-10-31T02:00:00.000000000Z'
      }), listing({
        id: 72,
        orderQuantity: 5,
        filledQuantity: 5,
        status: LISTING_URL + 'filled',
        unclaimedCoinCount: 4800,
        taxTaken: 200,
        createdTimestamp: '2026-10-01T02:00:00.000000000Z'
      }), listing({
        id: 73,
        orderQuantity: 10,
        filledQuantity: 4,
        status: LISTING_URL + 'active',
        unclaimedCoinCount: 3840
      })
    ],
    NOW,
    {origin: 'snapshot', inferredTime: true, environment: 'test', characterId: '427012'}
  );
  assert.equal(records.length, 3);
  // ① 一个都没成交：记录为有效，金额为 0，创建/过期时间用官方值、不标推断。
  assert.equal(store.getDisplayStatus(records[0]), 'active');
  assert.equal(records[0].orderQuantity, 10);
  assert.equal(records[0].collectedCoinCount, 0);
  assert.equal(records[0].createdAt, Date.parse('2026-10-01T02:00:00.000Z'), '官方创建时间直接用');
  assert.equal(records[0].inferredTime, false);
  assert.equal(records[0].expiresAt, Date.parse('2026-10-31T02:00:00.000Z'));
  assert.equal(records[0].environment, 'test', '环境取当前会话（测试服记录不写进正式服桶）');
  assert.equal(records[0].characterId, '427012');
  // ② 全部成交、还在可领取状态：订单即完成，金额立即计入。
  assert.equal(store.getDisplayStatus(records[1]), 'filled');
  assert.equal(records[1].filledQuantity, 5);
  assert.equal(records[1].collectedCoinCount, 4800, '收到可领取条目即入账');
  assert.equal(records[1].taxTaken, 200);
  // ③ 部分成交：进度与已入账金额都补齐。
  assert.equal(store.getDisplayStatus(records[2]), 'partial');
  assert.equal(records[2].filledQuantity, 4);
  assert.equal(records[2].collectedCoinCount, 3840);
  // 已存在的记录不会因后续观测改变环境归属。
  store.applyListingBatch(
    records,
    [
      listing({id: 71, filledQuantity: 1, unclaimedCoinCount: 960})
    ],
    NOW + 1000,
    {origin: 'update', environment: 'live', characterId: '427012'}
  );
  assert.equal(records[0].environment, 'test', '已有记录保持首次记录时的环境');
});

test('市场交易记录：成交完成（收到可领取条目）即计入收入，领取只记确认明细不重复计', () => {
  const store = loadStore();
  const records = [];
  // 收到「可领取」条目：这笔订单即视为完成，金额立即计入收入。
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW
  );
  assert.equal(records[0].collectedCoinCount, 9600, '收到可领取条目即计入收入');
  assert.equal(store.getCollectedCount(records[0]), 9600);
  assert.equal(records[0].claims.length, 0, '尚未领取：只有金额入账，没有领取明细');
  // 领取：未领取归零，只补一条领取确认，不再改金额。
  store.applyListingBatch(
    records,
    [
      listing({filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedCoinCount, 9600, '领取不重复计数');
  assert.equal(records[0].claims.length, 1);
  assert.equal(records[0].claims[0].coinCount, 9600);
  assert.equal(records[0].claimedAt, NOW + 1000);
});

test('市场交易记录：多次部分成交按每次新增的可领取量分别入账，多次领取只记明细', () => {
  const store = loadStore();
  const records = [];
  const base = {id: 8, orderQuantity: 10, status: LISTING_URL + 'active'};
  // 第一次部分成交 2 个（可领取 1920）→ 立即入账。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 2, unclaimedCoinCount: 1920})
    ],
    NOW
  );
  assert.equal(records[0].collectedCoinCount, 1920);
  // 领取：不改金额，只记确认。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 2, unclaimedCoinCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedCoinCount, 1920, '领取不改金额');
  // 第二次部分成交 3 个（可领取 2880）→ 累加。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 5, unclaimedCoinCount: 2880})
    ],
    NOW + 2000
  );
  assert.equal(records[0].collectedCoinCount, 4800);
  // 未领取就再成交 5 个：可领取合并为 7680，只把新增的 4800 入账。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 10, unclaimedCoinCount: 7680})
    ],
    NOW + 3000
  );
  assert.equal(records[0].collectedCoinCount, 9600, '按增量入账，不重复计算未领取部分');
  // 一次领取全部：金额不变，明细记录实际取走的部分。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 4000
  );
  assert.equal(records[0].collectedCoinCount, 9600);
  assert.equal(records[0].claims.length, 2);
  assert.equal(records[0].claims[1].coinCount, 7680);
});

test('市场交易记录：旧数据（待领取未计入）首次读取时迁移为「完成即收入」，且重复读取幂等', () => {
  const store = loadStore();
  // v2.19.0 形态：已成交、collected=0、unclaimed=9600、没有 unclaimedCounted 标记。
  const migrated = store.normalizeRecord({
    key: 'listing:9',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW,
    updatedAt: NOW,
    unclaimedCoinCount: 9600
  });
  assert.equal(migrated.collectedCoinCount, 9600, '待领取并入累计到账（订单在成交时就已完成）');
  assert.equal(migrated.unclaimedCounted, true);
  assert.equal(migrated.unclaimedCoinCount, 9600, '待领取基准保留，供后续增量对账');
  // 幂等：再次归一化不会重复累计。
  assert.equal(store.normalizeRecord(migrated).collectedCoinCount, 9600);
  // 已经是新口径的记录（unclaimedCounted=true）不会被再次并入。
  const counted = store.normalizeRecord({
    key: 'listing:10',
    itemHrid: '/items/iron_sword',
    side: 'sell',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW,
    updatedAt: NOW,
    unclaimedCoinCount: 9600,
    unclaimedCounted: true,
    collectedCoinCount: 9600
  });
  assert.equal(counted.collectedCoinCount, 9600);
});

test('市场交易记录：购买挂牌成交即按物品数入账，领取不改变支出', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 2, isSell: false, filledQuantity: 5, status: LISTING_URL + 'filled', unclaimedItemCount: 5})
    ],
    NOW
  );
  // 购买侧「收入/支出」是支出（数量 × 单价）；物品件数在成交完成时即计入。
  assert.equal(store.getCollectedCount(records[0]), 5000);
  assert.equal(records[0].collectedItemCount, 5, '收到可领取条目即计入');
  assert.equal(records[0].claims.length, 0);
  store.applyListingBatch(
    records,
    [
      listing({id: 2, isSell: false, filledQuantity: 5, status: LISTING_URL + 'filled', unclaimedItemCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedItemCount, 5, '领取不重复计数');
  assert.equal(store.getCollectedCount(records[0]), 5000);
  assert.equal(records[0].claims.length, 1);
  assert.equal(records[0].claims[0].itemCount, 5);
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

test('市场交易记录：快照对账标记未观测结束，并补记已消失条目的领取确认（不重复计账）', () => {
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
  assert.equal(records[1].collectedCoinCount, 5760, '金额在成交完成时就已计入');
  assert.equal(records[1].claims.length, 1, '补一条领取确认（离线领取）');
  assert.equal(records[1].claimedAt, NOW + 5000);
  assert.equal(records[1].unclaimedCoinCount, 5760, '待领取基准保留，避免之后重复计账');
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
  assert.equal(kept[0].collectedCoinCount, 1920, '仍在快照里的记录：金额照常入账');
  assert.equal(kept[0].claims.length, 0, '未领取：没有领取确认');
  assert.equal(kept[0].unclaimedCoinCount, 1920);
  assert.equal(kept[0].endedUnobserved, false);
});

test('市场交易记录：快照字段缺失时不把「没有快照」当成「全部已领取」', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 63, filledQuantity: 3, status: LISTING_URL + 'filled', unclaimedCoinCount: 2880})
    ],
    NOW
  );
  // myMarketListings 未下发（undefined）：不做任何推断。
  const result = store.reconcileWithSnapshot(records, undefined, NOW + 5000);
  assert.equal(result.settled.length, 0);
  assert.equal(result.unobserved.length, 0);
  assert.equal(records[0].collectedCoinCount, 2880, '金额只来自成交时的入账，快照缺失不额外补记');
  assert.equal(records[0].claims.length, 0, '不得按缺失的快照补领取确认');
  assert.equal(records[0].unclaimedCoinCount, 2880, '待领取保持原值');
  assert.equal(records[0].claimedAt, null);
});

test('市场交易记录：快照对账只判断快照取数时间之前观测到的记录', () => {
  const store = loadStore();
  // 记录在快照取数之后才被观测到（脚本晚于登录事件初始化、用 DataHub 兜底补对账时
  // 处理时刻晚于快照本身）：快照给不出结论，不能按「不在列表里」收尾。
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 71, filledQuantity: 4, unclaimedCoinCount: 3840})
    ],
    NOW + 9000
  );
  store.applyListingBatch(
    records,
    [
      listing({id: 72})
    ],
    NOW + 9000
  );
  const result = store.reconcileWithSnapshot(records, [], NOW + 10000, {snapshotAt: NOW});
  assert.equal(result.unobserved.length, 0, '快照之后才观测到的记录不判结束');
  assert.equal(result.settled.length, 0, '快照之后才观测到的记录不补领取确认');
  assert.equal(records[0].endedUnobserved, false);
  assert.equal(records[0].claims.length, 0);
  assert.equal(records[0].claimedAt, null);
  // 快照之前就已观测、之后没有新消息的记录照常收尾。
  const stale = [];
  store.applyListingBatch(
    stale,
    [
      listing({id: 73})
    ],
    NOW - 1000
  );
  const judged = store.reconcileWithSnapshot(stale, [], NOW, {snapshotAt: NOW});
  assert.equal(judged.unobserved.length, 1);
  assert.equal(stale[0].endedUnobserved, true);
  // 缺省（不传 snapshotAt）按处理时刻判断，与旧调用方式一致。
  const legacy = [];
  store.applyListingBatch(
    legacy,
    [
      listing({id: 74})
    ],
    NOW - 1000
  );
  assert.equal(store.reconcileWithSnapshot(legacy, [], NOW).unobserved.length, 1);
});

test('市场交易记录：重复出现的旧可领取值不再重复入账，重新观测会解除未观测结束', () => {
  const store = loadStore();
  const records = [];
  const base = {id: 81, orderQuantity: 10};
  // 成交：可领取 9600，首次入账。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 4, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW
  );
  assert.equal(records[0].collectedCoinCount, 9600);
  assert.equal(records[0].claims.length, 0);
  // 领取：可领取归零，只补一条领取确认。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 4, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 1000
  );
  assert.equal(records[0].collectedCoinCount, 9600);
  assert.equal(records[0].claims.length, 1);
  // 重复投递/乱序到达的旧值（进度没变、可领取又变回 9600）：不得再次入账，基准也不写回。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 4, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW + 2000
  );
  assert.equal(records[0].collectedCoinCount, 9600, '同一笔成交只记一次');
  assert.equal(records[0].unclaimedCoinCount, 0, '被拦下的旧值不写回基准');
  // 再次成交（进度增加）：新的可领取量照常入账。
  store.applyListingBatch(
    records,
    [
      listing({...base, filledQuantity: 6, status: LISTING_URL + 'filled', unclaimedCoinCount: 4800})
    ],
    NOW + 3000
  );
  assert.equal(records[0].collectedCoinCount, 14400);
  assert.equal(records[0].unclaimedCoinCount, 4800);
  // 「结束（原因未观测）」是快照推断：之后再观测到该条目（仍有效）即解除。
  const gone = [];
  store.applyListingBatch(
    gone,
    [
      listing({id: 82})
    ],
    NOW - 1000
  );
  store.reconcileWithSnapshot(gone, [], NOW);
  assert.equal(gone[0].endedUnobserved, true);
  store.applyListingBatch(
    gone,
    [
      listing({id: 82, filledQuantity: 2, unclaimedCoinCount: 1920})
    ],
    NOW + 5000
  );
  assert.equal(gone[0].endedUnobserved, false, '条目还在：解除推断的结束标记');
  assert.equal(store.getDisplayStatus(gone[0]), 'partial');
  assert.equal(gone[0].collectedCoinCount, 1920);
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
  // 未关联官方条目 = 是否成交、成交价多少都无法与官方核对：展示状态单独给「未确认」，可按状态筛选。
  assert.equal(store.isUnconfirmedInstant(records[0]), true);
  assert.equal(store.getDisplayStatus(records[0]), 'unconfirmed');
});

test('市场交易记录：官方税费与挂牌价不符才标星，未确认的立即成交可单独筛选', () => {
  const store = loadStore();
  // 官方按**单件**收税、每件向上取整：税费 = ceil(单价 × 税率) × 已成交数量。倒算回去得到的是
  // 「单件税费档位」，只能把成交价限定在宽度为一档的区间里（4% 档 25 金币、5% 档 20、2% 档 50），
  // 区间内任何价格产生的官方税费完全相同——所以「倒算值与挂牌价不同」不能说明价格移动过。
  // 单价 12 的糖按 4% 收 1 金币/件（倒算成 1 ÷ 0.04 = 25，看着像差一倍），实际成交价就是 12：
  // 此前按「倒算值不同就打星」判定时，所有单价不是档位整数倍的记录都被误标、收入被算高。
  const sugar = store.normalizeRecord({
    key: 'listing:9101',
    side: 'sell',
    itemHrid: '/items/sugar',
    price: 12,
    orderQuantity: 52553,
    filledQuantity: 52553,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 52553
  });
  assert.equal(store.taxDerivedAmountOf(sugar), null, '税费与挂牌价自洽 → 不打星');
  assert.equal(sugar.collectedCoinCount, 52553 * 12 - 52553, '按挂牌价成交的到账：数量 × 单价 − 官方税');
  // 单价 187 在 4% 档对应的区间是 (175, 200]（ceil(187 × 0.04) = 8 金币/件），同样自洽。
  const tickOff = store.normalizeRecord({
    key: 'listing:9106',
    side: 'sell',
    itemHrid: '/items/redwood_log',
    price: 187,
    orderQuantity: 100,
    filledQuantity: 100,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 800
  });
  assert.equal(store.taxDerivedAmountOf(tickOff), null, '单价不是档位整数倍也不打星');
  assert.equal(tickOff.collectedCoinCount, 18700 - 800);
  // 单件税费不是整数：各次成交的单价不同（这里 5 件 40 金币/件、5 件 45 金币/件）→ 成交价不止一个，
  // 确有差异；界面标星，收入取证据下限（证据允许的最小成交额），不按上限虚增。
  const mixed = store.normalizeRecord({
    key: 'listing:9105',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 425
  });
  assert.equal(store.taxDerivedAmountOf(mixed).grossLow, 10376);
  assert.equal(store.taxDerivedAmountOf(mixed).grossHigh, 10625);
  assert.equal(mixed.collectedCoinCount, 10376 - 425, '收入取证据下限');
  // 单件税费是整数但挂牌价落在证据区间之外：成交价确实偏离挂牌价（这里是成交价更低），同样标星。
  const below = store.normalizeRecord({
    key: 'listing:9107',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 350
  });
  assert.equal(store.taxDerivedAmountOf(below).grossLow, 8501);
  assert.equal(store.taxDerivedAmountOf(below).grossHigh, 8750);
  assert.equal(below.collectedCoinCount, 8501 - 350);
  // 反方向：挂牌价低于区间下限（800 ≤ (35 − 1) ÷ 0.04 = 850）→ 成交价高出挂牌价，也标星。
  const above = store.normalizeRecord({
    key: 'listing:9108',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 800,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 350
  });
  assert.equal(store.taxDerivedAmountOf(above)?.grossLow, 8501);
  // 成交跨税率调整日：税费混了两个档位，不做判定、退回挂牌价口径。
  const crossing = store.normalizeRecord({
    key: 'listing:9102',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: Date.parse('2026-09-20T00:00:00+08:00'),
    filledAt: Date.parse('2026-10-01T00:00:00+08:00'),
    taxTaken: 40000
  });
  assert.equal(store.taxDerivedAmountOf(crossing), null, '跨税率调整日不做税费判定');
  assert.equal(crossing.collectedCoinCount, 9600, '退回挂牌价口径（1000 × 10 − 400 税）');
  // 购买不扣税：官方税费恒为 0，也不参与判定。
  const buy = store.normalizeRecord({
    key: 'listing:9103',
    side: 'buy',
    itemHrid: '/items/iron_sword',
    price: 500,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW - 1000,
    filledAt: NOW,
    taxTaken: 40000
  });
  assert.equal(store.taxDerivedAmountOf(buy), null);
  assert.equal(buy.collectedCoinCount, 5000, '购买按数量 × 单价');
  // 牛铃袋始终 18% 一档：跨日期也照常判定（1000 × 9/50 = 180 金币/件，区间 (994.4, 1000] 含 1000）。
  const cowbell = store.normalizeRecord({
    key: 'listing:9104',
    side: 'sell',
    itemHrid: '/items/bag_of_10_cowbells',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: Date.parse('2026-09-20T00:00:00+08:00'),
    filledAt: Date.parse('2026-10-01T00:00:00+08:00'),
    taxTaken: 1800
  });
  assert.equal(cowbell.collectedCoinCount, 8200, '10000 − 1800 税');
  assert.equal(store.taxDerivedAmountOf(cowbell), null, '牛铃袋按 18% 档位同样自洽');

  // 立即成交的兜底记录：展示状态为「未确认」，可按状态筛选；关联到官方条目后回到已完成。
  const records = [];
  store.applyOutgoingMessage(
    records,
    {
      type: 'post_market_order',
      postMarketOrderData: {
        isSell: false,
        itemHrid: '/items/sugar',
        enhancementLevel: 0,
        quantity: 1,
        price: 10,
        isInstantOrder: true
      }
    },
    NOW,
    {environment: 'live', characterId: '42'}
  );
  assert.equal(store.getDisplayStatus(records[0]), 'unconfirmed');
  assert.equal(
    store.filterRecords(records, {statuses: [
        'unconfirmed'
      ]}).length,
    1,
    '「未确认」筛选命中'
  );
  assert.equal(
    store.filterRecords(records, {statuses: [
        'filled'
      ]}).length,
    0,
    '不再混在已完成里'
  );
  store.linkInstantRecords(
    records,
    listing({
      id: 9105,
      itemHrid: '/items/sugar',
      isSell: false,
      price: 10,
      orderQuantity: 1,
      filledQuantity: 1,
      status: LISTING_URL + 'filled'
    }),
    NOW + 1000
  );
  assert.equal(records[0].listingId, '9105', '官方条目到达后按内容关联');
  assert.equal(store.getDisplayStatus(records[0]), 'filled', '核对上了就回到已完成');
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

test('市场交易记录：领取请求只记请求时间，金额以成交时的入账为准', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({id: 21, filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 9600})
    ],
    NOW
  );
  assert.equal(records[0].collectedCoinCount, 9600, '成交完成即入账');
  const result = store.applyOutgoingMessage(
    records,
    {type: 'claim_market_listing', claimMarketListingData: {marketListingId: 21}},
    NOW + 5000
  );
  assert.equal(result.changed, true);
  assert.equal(records[0].claimRequestedAt, NOW + 5000);
  assert.equal(records[0].collectedCoinCount, 9600, '领取请求不改金额');
  assert.equal(records[0].claims.length, 0, '领取确认等官方归零观测');
  // 官方随后的归零观测：补一条领取确认，金额不变。
  store.applyListingBatch(
    records,
    [
      listing({id: 21, filledQuantity: 10, status: LISTING_URL + 'filled', unclaimedCoinCount: 0})
    ],
    NOW + 6000
  );
  assert.equal(records[0].collectedCoinCount, 9600);
  assert.equal(records[0].claims.length, 1);
  assert.equal(records[0].claimedAt, NOW + 6000);
});

test('市场交易记录：全部收集只给有待领取的记录记请求时间，不预结金额', () => {
  const store = loadStore();
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({
        id: 31,
        filledQuantity: 4,
        status: LISTING_URL + 'filled',
        unclaimedCoinCount: 3840
      }), listing({
        id: 32,
        isSell: false,
        filledQuantity: 5,
        status: LISTING_URL + 'filled',
        unclaimedItemCount: 5
      }), listing({id: 33, status: LISTING_URL + 'active'})
    ],
    NOW
  );
  store.applyOutgoingMessage(records, {type: 'claim_all_market_listings'}, NOW + 1000);
  assert.equal(records[0].claimRequestedAt, NOW + 1000);
  assert.equal(records[1].claimRequestedAt, NOW + 1000);
  assert.equal(records[2].claimRequestedAt, null, '没有待领取的挂牌不写领取请求');
  assert.equal(records[0].collectedCoinCount, 3840, '金额仍是成交完成时的入账');
  assert.equal(records[1].collectedItemCount, 5);
  assert.equal(records[0].claims.length, 0, '领取确认等官方归零观测');
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
    // 两侧都按新口径（待领取已计入），合并规则聚焦字段级取舍而不是迁移。
    unclaimedCoinCount: 9600,
    unclaimedCounted: true,
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
  assert.equal(summary.collectedCoin, 9600, '成交完成即计入收入（不再区分待领取）');
  // 待领取只作对账基准：记录里保留原值（列表与合计里没有这个口径）。
  assert.equal(records[0].unclaimedCoinCount, 9600);
  assert.equal(records[2].unclaimedItemCount, 2);
  assert.equal('pendingCoin' in summary, false, '合计不再有「待领取」字段');
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
  // 实时链路仍按官方未领取字段累计，不推算；已完成（终态）订单的金额按税率补齐，
  // 只补不足、不覆盖官方值，进行中的订单不补齐。
  assert.match(storeSourceFile, /unclaimedCoinCount/);
  assert.match(storeSourceFile, /unclaimedItemCount/);
  assert.match(storeSourceFile, /collectedCoinCount/);
  assert.match(storeSourceFile, /collectedItemCount/);
  assert.match(
    storeSourceFile,
    /const terminal = TERMINAL_STATUSES\.has\(record\.status\) \|\| record\.endedUnobserved/
  );
  assert.match(storeSourceFile, /if \(toCount\(record\.collectedCoinCount\) >= expected\) return record/);
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
    'collectedItem' in
      store.summarize([
        buy
      ]),
    false,
    '合计不保留没有消费方的件数字段'
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
  assert.equal(staleSell.collectedCoinCount, 9600);
  // 官方金额不足应得额时按税率补齐（只补不足、不覆盖官方值）：1234 < 9800 → 补齐到 9800。
  const partial = base({collectedCoinCount: 1234});
  assert.equal(partial.collectedCoinCount, 9800, '信息不全的已完成订单按税率补齐');
  assert.equal(partial.collectedEstimated, true, '补齐的金额标记含推算');
  // 官方累计达到或超过应得额时原样保留（对手方以更优价成交时会高于按挂牌价的推算值）。
  const covered = base({collectedCoinCount: 9900});
  assert.equal(covered.collectedCoinCount, 9900);
  assert.equal(covered.collectedEstimated, false);
  // 官方可领取值计入后仍不足应得额时同样补齐。
  assert.equal(base({unclaimedCoinCount: 500}).collectedCoinCount, 9800);
  // 官方可领取值到达时作废此前的推算值，交回官方口径；官方值达到应得额则不再补齐。
  const estimated = base({});
  assert.equal(estimated.collectedEstimated, true);
  const fields = store.listingToFields(
    listing({
      id: 9001,
      status: LISTING_URL + 'filled',
      filledQuantity: 10,
      unclaimedCoinCount: 9800
    })
  );
  const afterOfficial = store.applyListingObservation(estimated, fields, NOW, {origin: 'update'});
  assert.equal(afterOfficial.collectedEstimated, false);
  assert.equal(afterOfficial.collectedCoinCount, 9800, '官方可领取值即计入（成交完成）');
  assert.equal(afterOfficial.unclaimedCoinCount, 9800);
  // 推算作废时对账基准一并归零：即便记录里已经带着同一个未领取值（导入数据常见），
  // 官方金额也要重新入账，不能因为「增量是 0」把官方金额丢掉（进行中的记录没有补齐兜底）。
  const activeFields = store.listingToFields(listing({id: 9001, filledQuantity: 10, unclaimedCoinCount: 9800}));
  const estimatedWithPending = store.applyListingObservation(
    {...estimated, status: 'active', unclaimedCoinCount: 9800},
    activeFields,
    NOW,
    {origin: 'update'}
  );
  assert.equal(estimatedWithPending.collectedEstimated, false);
  assert.equal(estimatedWithPending.collectedCoinCount, 9800, '作废推算后按官方值重新入账');
  assert.equal(estimatedWithPending.unclaimedCoinCount, 9800);
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

test('市场交易记录：信息不全的已完成订单按税率补齐（快照只带剩余可领取值）', () => {
  const store = loadStore();
  // 挂牌 10 个全部成交（每件 1000、成交时 4% 税 → 应得 9600），但登录快照里只带回剩余 4 个的
  // 可领取值 3840（其余 6 个此前已在别处领取、官方不再下发）→ 按税率补齐到应得额。
  const records = [];
  store.applyListingBatch(
    records,
    [
      listing({
        id: 81,
        orderQuantity: 10,
        filledQuantity: 10,
        status: LISTING_URL + 'filled',
        unclaimedCoinCount: 3840
      })
    ],
    NOW
  );
  assert.equal(records[0].collectedCoinCount, 9600, '按已成交数量 × 单价 ×（1 − 4% 税率）补齐应得额');
  assert.equal(records[0].collectedEstimated, true, '补齐的金额标记含推算');
  assert.equal(records[0].collectedTaxRate, 0.04);
  assert.equal(records[0].unclaimedCoinCount, 3840, '官方可领取值原样保留');
  // 官方值达到应得额时不补齐（更优成交价可能更高，不覆盖官方数据）。
  const covered = [];
  store.applyListingBatch(
    covered,
    [
      listing({
        id: 82,
        orderQuantity: 10,
        filledQuantity: 10,
        status: LISTING_URL + 'filled',
        unclaimedCoinCount: 9800
      })
    ],
    NOW
  );
  assert.equal(covered[0].collectedCoinCount, 9800);
  assert.equal(covered[0].collectedEstimated, false);
  // 进行中的订单不补齐：官方数据还会继续来，只记已经观测到的金额。
  const active = [];
  store.applyListingBatch(
    active,
    [
      listing({
        id: 83,
        orderQuantity: 10,
        filledQuantity: 4,
        status: LISTING_URL + 'active',
        unclaimedCoinCount: 1000
      })
    ],
    NOW
  );
  assert.equal(active[0].collectedCoinCount, 1000);
  assert.equal(active[0].collectedEstimated, false);
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
  // 税费证据文案有 3 个占位符（成交额下限 / 上限 / 税率）：列表标记与收入悬浮两处调用都要传满。
  const taxText = messagesSourceFile.match(/marketHistoryTaxDerived:\s*\{[\s\S]*?zh:\s*'([^']+)'/)?.[1] || '';
  assert.equal((taxText.match(/\{\d\}/g) || []).length, 3);
  assert.ok(
    (
      moduleSourceFile.match(
        /marketHistoryTaxDerived',\s*this\.rawValueText\(derived\.grossLow\),\s*this\.rawValueText\(derived\.grossHigh\),\s*String\(Math\.round\(derived\.rate \* 100\)\)/g
      ) || []
    ).length >= 2,
    '金额列标记与收入/支出悬浮都要传满三个实参'
  );
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
  // 监听器先同步挂载、事件按到达时间入队：消除 GM 存储载入完成前的丢失窗口
  // （玩家常在页面加载后立刻点「全部收集」），未就绪时也不能写回空存储。
  assert.match(moduleSourceFile, /this\.eventQueue = \[\]/);
  assert.match(moduleSourceFile, /queueWsEvent\(kind, detail\)/);
  assert.match(moduleSourceFile, /handleWsEvent\(item\.kind, item\.detail, item\.at\)/);
  assert.match(moduleSourceFile, /if \(!this\.ready\) return/);
  // 待领取口径（v2.20.0 起）：成交完成（收到可领取条目）即计入收入/支出，
  // 待领取只是对账基准；旧数据首次读取时迁移，领取只补确认明细。
  assert.match(storeSourceFile, /unclaimedCounted/);
  assert.match(storeSourceFile, /const coinGain = fields\.unclaimedCoinCount - baseUnclaimedCoin/);
  assert.match(
    storeSourceFile,
    /next\.collectedCoinCount = baseCollectedCoin \+ \(accrualOpen \? Math\.max\(0, coinGain\) : 0\)/
  );
  // 正向增量只在确实有新成交（进度增加）或还没有任何官方凭据时入账：重复投递的旧值不再重复计账。
  assert.match(storeSourceFile, /const accrualOpen =/);
  assert.match(storeSourceFile, /nextFilled > previousFilled/);
  // 观测到条目就解除按快照推断的「结束（原因未观测）」。
  assert.match(storeSourceFile, /next\.endedUnobserved = false;/);
  assert.doesNotMatch(storeSourceFile, /settleClaimedPending|rollbackRequestClaim/);
  // 快照对账：条目缺失时不退化成空数组，快照时间取官方 currentTimestamp。
  assert.match(moduleSourceFile, /const listings = data\?\.myMarketListings;/);
  assert.match(moduleSourceFile, /applyListingBatch\(records, Array\.isArray\(listings\) \? listings : \[\], now/);
  assert.match(moduleSourceFile, /reconcileWithSnapshot\(records, listings, now, \{snapshotAt\}\)/);
  assert.match(
    storeSourceFile,
    /export function reconcileWithSnapshot\(records, listings, now, \{snapshotAt = now\} = \{\}\)/
  );
  assert.match(storeSourceFile, /if \(stamp && toTimestamp\(record\.updatedAt\) > stamp\) return;/);
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
  // 未确认（立即成交兜底记录）与区间价标注的接线：新状态有中英文案、能按状态筛，
  // 金额列的星号标记走 CSS 类，倒算值由 store 的纯函数提供。
  assert.match(messagesSourceFile, /marketHistoryStatusUnconfirmed: \{zh: '未确认'/);
  assert.match(messagesSourceFile, /marketHistoryTaxDerived:/);
  assert.match(storeSourceFile, /export function isUnconfirmedInstant/);
  assert.match(storeSourceFile, /export function taxDerivedAmountOf/);
  // 税费判定必须走官方口径「逐件向上取整」的档位模型（taxEvidenceOf），不能用浮点比例倒算：
  // 倒算值与挂牌价的差可能只是税费取整，之前据此打星会把正常成交全部误标、收入算高。
  assert.match(storeSourceFile, /export function taxEvidenceOf/);
  assert.match(storeSourceFile, /Math\.ceil\(\(price \* num\) \/ den\)/);
  assert.doesNotMatch(storeSourceFile, /differs/);
  assert.match(storeSourceFile, /if \(isUnconfirmedInstant\(record\)\) return 'unconfirmed';/);
  assert.match(moduleSourceFile, /mst-market-history-price-mark/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-price-mark\s*\{/);
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
  // 每一列都必须有宽度，且表格最小宽度等于列宽合计：固定布局下没有宽度的列在容器变窄时
  // 会被压成 0（物品列曾整列消失），容器比合计窄时由 .mst-market-history-table-wrap 横向滚动。
  const columnsBlock = moduleSourceFile.match(/const RECORD_COLUMNS = \[([\s\S]*?)\n\];/)[1];
  const columnKeys = [
    ...columnsBlock.matchAll(/key: '([a-zA-Z]+)'/g)
  ].map((match) => match[1]);
  const columnWidths = [
    ...columnsBlock.matchAll(/width: '([\d.]+)rem'/g)
  ].map((match) => Number(match[1]));
  assert.equal(columnWidths.length, columnKeys.length, '每一列都要写固定宽度（缺宽度的列会被压成 0）');
  const totalColumnWidth = columnWidths.reduce((sum, value) => sum + value, 0);
  assert.match(
    moduleCssSourceFile,
    new RegExp(`\\.mst-market-history-table-records\\s*\\{[\\s\\S]*?min-width:\\s*${totalColumnWidth}rem`)
  );
  assert.match(moduleCssSourceFile, /\.mst-market-history-table-wrap\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(moduleCssSourceFile, /th\.mst-market-history-number-head/);
  assert.match(moduleCssSourceFile, /td\.mst-market-history-number-cell\s*\{\s*text-align:\s*right/);
  // 「单价」列按游戏市场的价格写法显示（与订单簿、挂牌页速览一致），金额 / 收入列仍是紧凑写法。
  assert.match(moduleSourceFile, /Number\(record\.price\) \? this\.formatUnitPrice\(record\.price\) : muted\('0'\)/);
  assert.match(
    moduleSourceFile,
    /formatUnitPrice\(value\) \{\s*return this\.ctx\.utils\.formatMarketplacePrice\(value\);/
  );
  assert.match(moduleSourceFile, /money\(amount\)/);
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
  // 导入框内容不跨次保留：关闭弹窗与再次打开都清空导入文本、模式与预览结果，
  // 避免整份导出文件的大文本在弹窗打开时重新渲染造成卡顿；文件异步读取在弹窗关闭后丢弃。
  assert.match(moduleSourceFile, /resetImportState\(\) \{/);
  assert.match(moduleSourceFile, /panel\.importText = ''/);
  assert.match(moduleSourceFile, /panel\.importOverwriteConfirmed = false/);
  assert.match(moduleSourceFile, /panel\.importReport = null/);
  // 没有展示位置的导入文件名状态、以及没有消费方的导出与函数都已清理（避免垃圾代码回流）。
  assert.doesNotMatch(moduleSourceFile, /importFileName/);
  assert.doesNotMatch(moduleSourceFile, /describeMarketHistory/);
  assert.doesNotMatch(storeSourceFile, /export function getPendingCount|export function isTerminal/);
  assert.match(moduleSourceFile, /willClose: \(\) => \{[\s\S]{0,400}?this\.resetImportState\(\)/);
  assert.match(moduleSourceFile, /if \(!this\.root \|\| this\.dialogState\.view !== 'manage'\) return;/);
  // 待领取不再展示：金额在成交完成时已计入，列表行、悬浮、CSV 与样式里都不再出现待领取。
  assert.doesNotMatch(moduleSourceFile, /formatPendingSuffix/);
  assert.doesNotMatch(moduleSourceFile, /mst-market-history-pending/);
  assert.doesNotMatch(moduleCssSourceFile, /mst-market-history-pending/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryTotalsPending/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryTotalsPending|marketHistoryPending:/);
});

test('市场交易记录：记录与统计共用同一套创建时间范围选项', () => {
  // 两个页签的时间下拉统一为 创建时间（默认项，兼作控件标题）/ 今天 / 近 7 / 15 / 30 / 60 / 90 / 180 天 / 自定义。
  assert.match(
    moduleSourceFile,
    /const TIME_PRESETS = \[\s*'all',\s*'today',\s*'7d',\s*'15d',\s*'30d',\s*'60d',\s*'90d',\s*'180d',\s*'custom'\s*\]/
  );
  assert.match(
    moduleSourceFile,
    /const TIME_PRESET_DAYS = \{'7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90, '180d': 180\}/
  );
  assert.doesNotMatch(moduleSourceFile, /STATS_TIME_PRESETS|STATS_TIME_LABEL_KEYS/);
  // 「今天」按本地自然日算：起止两端都落在今天的 0 点与次日 0 点，不受夏令时影响。
  assert.match(
    moduleSourceFile,
    /if \(filters\.timePreset === 'today'\) \{[\s\S]{0,400}?from\.setHours\(0, 0, 0, 0\);[\s\S]{0,200}?to\.setDate\(to\.getDate\(\) \+ 1\);[\s\S]{0,200}?filters\.timeFrom = from\.getTime\(\);[\s\S]{0,100}?filters\.timeTo = to\.getTime\(\) - 1;/
  );
  // 两处筛选解析都走同一份预设换算（口径一致）；下拉前不加独立标签（默认项文字即「创建时间」）。
  assert.equal((moduleSourceFile.match(/applyTimePreset\(filters, Date\.now\(\)\)/g) || []).length, 2);
  assert.equal((moduleSourceFile.match(/marketHistoryTimeAll/g) || []).length, 1);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryTimeRange/);
  [
    'marketHistoryTimeToday', 'marketHistoryTime7d', 'marketHistoryTime15d', 'marketHistoryTime30d', 'marketHistoryTime60d',
    'marketHistoryTime90d', 'marketHistoryTime180d', 'marketHistoryTimeCustom'
  ].forEach((key) => assert.ok(messagesSourceFile.includes(`${key}: {zh:`), `${key} 缺少中文文案`));
  assert.ok(messagesSourceFile.includes("marketHistoryTimeAll: {zh: '创建时间', en: 'Created'}"));
  assert.ok(messagesSourceFile.includes("marketHistoryTimeToday: {zh: '今天', en: 'Today'}"));
  assert.doesNotMatch(messagesSourceFile, /marketHistoryTimeRange:/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryStatsTimeField:|marketHistoryStatsTime90d:/);
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
  // 时间范围按「创建时间」筛选（与趋势图分桶同一口径，与记录页签同一套选项、默认项即「创建时间」）；方向筛选走 store 的 sides。
  assert.match(moduleSourceFile, /marketHistoryTimeAll/);
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
  assert.match(moduleSourceFile, /mst-positive/);
  assert.match(moduleSourceFile, /mst-negative/);
  assert.match(moduleSourceFile, /marketHistoryStatsNet/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryTotalsOrderQuantity/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryTotalsOrderQuantity:/);
  // 按物品汇总表两侧分列：出售金额 / 购买金额 / 收入金额；「加权均价」是价格，
  // 与记录列表「单价」列一样按游戏市场的写法显示。
  assert.match(moduleSourceFile, /this\.formatUnitPrice\(\s*item\.weightedPrice\s*\)/);
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
  assert.match(componentsCssSourceFile, /\.mst-positive\s*\{/);
  assert.match(componentsCssSourceFile, /\.mst-negative\s*\{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-stats-table thead th\s*\{[\s\S]*?position:\s*sticky/);
  // 统计页文案齐备（中文键都在 messages 分组里）。
  [
    'marketHistoryTimeAll', 'marketHistoryTime90d', 'marketHistoryStatsSide', 'marketHistoryStatsSideSell', 'marketHistoryStatsSideBuy',
    'marketHistoryStatsCategory', 'marketHistoryStatsNet', 'marketHistoryStatsRankAmount', 'marketHistoryStatsRankQuantity', 'marketHistoryStatsRankCount',
    'marketHistoryStatsTableTitle', 'marketHistoryStatsBucketAuto', 'marketHistoryStatsBucketDay', 'marketHistoryStatsBucketWeek', 'marketHistoryStatsBucketMonth',
    'marketHistoryStatsBucketForced', 'marketHistoryStatsNoData', 'marketHistoryStatsOthers'
  ].forEach((key) => assert.ok(messagesSourceFile.includes(`${key}: {zh:`), `${key} 缺少中文文案`));
  // 新增的纯计算文件进运行时清单，构建产物里也会包含图表几何。
  assert.match(source, /market-history\/charts\.js/);
});

test('市场交易记录：数据修复（重复订单 / 状态与进度 / 到账字段 / 结清明细 / 异常键）', () => {
  const store = loadStore();
  // 基准记录：出售挂牌 10 件 @1000，成交时间取 NOW（2026-09-28 之后，4% 档）。
  const base = (overrides = {}) =>
    store.normalizeRecord({
      key: 'listing:1',
      listingId: '1',
      side: 'sell',
      itemHrid: '/items/iron_sword',
      price: 1000,
      orderQuantity: 10,
      filledQuantity: 0,
      status: 'active',
      createdAt: NOW,
      unclaimedCounted: true,
      ...overrides
    });

  // ① 同一订单 id 两条记录（跨设备导入、早期版本都可能留下）：合并为一条，主键沿用官方 id 键，
  // 终态优先、进度与到账取大、领取明细合并；直购记录保留直购语义（与实时关联路径一致）。
  const partial = base({
    key: 'listing:7001',
    listingId: '7001',
    filledQuantity: 4,
    unclaimedCoinCount: 3840,
    collectedCoinCount: 3840
  });
  const filledTwin = base({
    key: 'instant:1-2-3',
    listingId: '7001',
    kind: 'instant',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    claims: [
      {at: NOW, coinCount: 5760}
    ],
    unclaimedCoinCount: 3840,
    collectedCoinCount: 9600
  });
  const mergedResult = store.repairRecords(
    [
      partial, filledTwin
    ],
    [
      'duplicateListings'
    ],
    {now: NOW}
  );
  assert.equal(mergedResult.report.duplicateListings, 1);
  assert.equal(mergedResult.records.length, 1);
  assert.equal(mergedResult.records[0].key, 'listing:7001');
  assert.equal(mergedResult.records[0].kind, 'instant', '直购记录保留直购语义');
  assert.equal(mergedResult.records[0].status, 'filled');
  assert.equal(mergedResult.records[0].filledQuantity, 10, '进度取大');
  assert.equal(mergedResult.records[0].collectedCoinCount, 9600, '到账取大');
  assert.equal(mergedResult.records[0].claims.length, 1);
  assert.equal(mergedResult.records[0].unclaimedCoinCount, 3840);

  // ② 已完成但成交数量不足：按官方状态补齐数量（金额随后按「已完成订单补齐」规则重算）。
  const shortFilled = base({
    key: 'listing:7101',
    listingId: '7101',
    filledQuantity: 6,
    status: 'filled',
    filledAt: NOW,
    unclaimedCoinCount: 5760,
    collectedCoinCount: 5760
  });
  const fixedShort = store.repairRecords(
    [
      shortFilled
    ],
    [
      'statusQuantity'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedShort.filledQuantity, 10);
  assert.equal(fixedShort.firstFillAt, NOW, '首次成交时间补成已有的成交时间');
  assert.equal(fixedShort.collectedCoinCount, 9600, '数量补齐后金额按税率补齐');
  // ③ 进度已满却仍是进行中：按已完成收尾（金额同样走补齐）。
  const activeFull = base({
    key: 'listing:7102',
    listingId: '7102',
    filledQuantity: 10,
    firstFillAt: NOW,
    unclaimedCoinCount: 960,
    collectedCoinCount: 960
  });
  const fixedFull = store.repairRecords(
    [
      activeFull
    ],
    [
      'statusQuantity'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedFull.status, 'filled');
  assert.equal(fixedFull.filledAt, NOW);
  assert.equal(fixedFull.endedUnobserved, false);

  // ④ 到账字段与方向不符：出售记录带物品到账（旧版本写法）、购买记录带来源不明的金币到账、
  // 推算标记与税率和官方凭据不符（悬浮会按税率说明推算口径）。
  const sellResidue = base({
    key: 'listing:7201',
    listingId: '7201',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedItemCount: 10,
    unclaimedCoinCount: 9600,
    collectedCoinCount: 9600
  });
  const buyResidue = base({
    key: 'listing:7202',
    listingId: '7202',
    side: 'buy',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedCoinCount: 12000
  });
  // 推算标记 + 税率 0，且金额只被官方凭据解释了一部分（3840）：补上成交时间档位税率。
  const rateMismatch = base({
    key: 'listing:7203',
    listingId: '7203',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedEstimated: true,
    collectedTaxRate: 0,
    collectedCoinCount: 9600,
    unclaimedCoinCount: 3840
  });
  // 金额已完全被官方凭据解释（等于剩余未领取）却还挂着推算标记：清掉标记，不再按税率说明。
  const flagOnly = base({
    key: 'listing:7204',
    listingId: '7204',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedEstimated: true,
    collectedTaxRate: 0.04,
    collectedCoinCount: 9600,
    unclaimedCoinCount: 9600
  });
  assert.equal(
    store.repairRecords(
      [
        sellResidue
      ],
      [
        'collectedFields'
      ],
      {now: NOW}
    ).records[0].collectedItemCount,
    0
  );
  // 购买侧的金额残值归「金额偏差」重算（口径就是数量 × 单价），字段清理不动它。
  const fixedBuy = store.repairRecords(
    [
      buyResidue
    ],
    [
      'collectedFields'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedBuy.collectedCoinCount, 12000, '字段清理不重复处理金额偏差');
  assert.equal(
    store.repairRecords(
      [
        buyResidue
      ],
      [
        'amountRecalc'
      ],
      {now: NOW}
    ).records[0].collectedCoinCount,
    10000,
    '金额偏差重算：购买不扣税的数量 × 单价'
  );
  const fixedRate = store.repairRecords(
    [
      rateMismatch
    ],
    [
      'collectedFields'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedRate.collectedTaxRate, 0.04, '按成交时间补上 4% 档税率');
  assert.equal(fixedRate.collectedEstimated, true, '金额含推算成分时保留推算标记');
  const clearedFlag = store.repairRecords(
    [
      flagOnly
    ],
    [
      'collectedFields'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(clearedFlag.collectedEstimated, false, '官方凭据已解释的金额清掉推算标记');
  assert.equal(clearedFlag.collectedTaxRate, 0);
  assert.equal(clearedFlag.collectedCoinCount, 9600, '金额本身不变');

  // ⑤ 金额对不上账：累计到账没有推算标记、也超过「结清明细 + 剩余未领取」（旧版本直接写下的
  // 金额、领取明细丢失）。补一条结清明细把账对上，金额本身不变。
  const orphanAmount = base({
    key: 'listing:7301',
    listingId: '7301',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedCoinCount: 9800
  });
  const fixedOrphan = store.repairRecords(
    [
      orphanAmount
    ],
    [
      'settleEvidence'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedOrphan.collectedCoinCount, 9800, '金额不变');
  assert.equal(fixedOrphan.claims.length, 1);
  assert.equal(fixedOrphan.claims[0].coinCount, 9800);
  assert.equal(fixedOrphan.claimedAt, NOW);
  assert.equal(
    store.scanRepairIssues([
      fixedOrphan
    ]).settleEvidence,
    0,
    '补记后账已对平'
  );
  // 领取明细记满 20 条上限时不参与：正常的截断不能被当成缺凭据。
  const manyClaims = base({
    key: 'listing:7302',
    listingId: '7302',
    filledQuantity: 10,
    status: 'filled',
    filledAt: NOW,
    collectedCoinCount: 9600,
    claims: Array.from({length: 20}, (_, index) => ({at: NOW + index, coinCount: 1}))
  });
  assert.equal(
    store.scanRepairIssues([
      manyClaims
    ]).settleEvidence,
    0
  );

  // ⑥ 无法识别的记录（键不是官方 id 键或直购兜底键）：修复即删除。
  const unknownJunk = base({
    key: 'verify:zz-check-1',
    listingId: null,
    orderQuantity: 1,
    filledQuantity: 1,
    status: 'filled',
    filledAt: NOW,
    unclaimedCoinCount: 960,
    collectedCoinCount: 960
  });
  const cleaned = store.repairRecords(
    [
      unknownJunk
    ],
    [
      'unknownKey'
    ],
    {now: NOW}
  );
  assert.equal(cleaned.report.unknownKey, 1);
  assert.equal(cleaned.records.length, 0);

  // 扫描与修复按同一套判定：一次扫描的各类条数与「全选修复」的实际改动条数一致。
  const all = [
    partial, filledTwin, shortFilled, activeFull, sellResidue,
    buyResidue, rateMismatch, flagOnly, orphanAmount, unknownJunk
  ];
  const scan = store.scanRepairIssues(all);
  assert.equal(scan.duplicateListings, 1);
  assert.equal(scan.statusQuantity, 2);
  assert.equal(scan.unobservedEnded, 0, '没有登录快照时不在挂单列表这一类不参与');
  assert.equal(scan.collectedFields, 3);
  assert.equal(scan.amountRecalc, 1, '购买侧的金额残值归金额偏差');
  assert.equal(scan.settleEvidence, 1);
  assert.equal(scan.unknownKey, 1);
  const repaired = store.repairRecords(all, store.REPAIR_TYPE_KEYS, {now: NOW});
  assert.deepEqual(repaired.report, scan, '修复报告与扫描条数一致');
  const rescan = store.scanRepairIssues(repaired.records);
  store.REPAIR_TYPE_KEYS.forEach((type) => assert.equal(rescan[type], 0, `${type} 修完再扫应为 0`));
  // 修复结果能正常持久化回读（归一化幂等，不会在下次加载时又变回问题数据）。
  const roundTrip = store.parseStore(
    store.serializeStore({schemaVersion: 1, updatedAt: 0, buckets: {'live:1': repaired.records}})
  );
  assert.deepEqual(
    roundTrip.buckets['live:1'].map((record) => record.key),
    repaired.records.map((record) => record.key)
  );
  // 整个存储的扫描：只读统计全部角色与环境分桶，报告里恒有全部类型的键。
  const holder = store.createStore();
  holder.buckets['live:1'] = [
    orphanAmount
  ];
  holder.buckets['test:2'] = [
    unknownJunk
  ];
  const storeScan = store.scanStoreRepairs(holder);
  assert.equal(storeScan.settleEvidence, 1);
  assert.equal(storeScan.unknownKey, 1);
  assert.deepEqual(
    Object.keys(store.createRepairReport()).sort(),
    [
      ...store.REPAIR_TYPE_KEYS
    ].sort()
  );
});

test('市场交易记录：数据修复只处理勾选的类型，且不改动原始记录（纯函数）', () => {
  const store = loadStore();
  const orphanAmount = store.normalizeRecord({
    key: 'listing:7401',
    listingId: '7401',
    side: 'sell',
    itemHrid: '/items/iron_sword',
    price: 1000,
    orderQuantity: 10,
    filledQuantity: 10,
    status: 'filled',
    createdAt: NOW,
    filledAt: NOW,
    unclaimedCounted: true,
    collectedCoinCount: 9800
  });
  const records = [
    orphanAmount
  ];
  const snapshot = JSON.stringify(records);
  const result = store.repairRecords(
    records,
    [
      'unknownKey'
    ],
    {now: NOW}
  );
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0], orphanAmount, '未命中的记录原样返回');
  assert.equal(result.report.settleEvidence, 0);
  assert.equal(result.report.unknownKey, 0);
  // 未勾选的类型不生效：换成勾选结清明细才改动，且改动放在新记录上。
  const settled = store.repairRecords(
    records,
    [
      'settleEvidence'
    ],
    {now: NOW}
  );
  assert.equal(settled.report.settleEvidence, 1);
  assert.notEqual(settled.records[0], orphanAmount);
  assert.equal(settled.records[0].claims.length, 1);
  // 入参数组与记录对象都不被修改。
  assert.equal(JSON.stringify(records), snapshot);
  assert.notEqual(settled.records, records);
  assert.equal(orphanAmount.claims.length, 0);
  // 空类型清单：不勾选任何类型时不改动（返回原记录的浅拷贝数组）。
  const untouched = store.repairRecords(records, [], {now: NOW});
  assert.equal(untouched.records.length, 1);
  assert.equal(untouched.records[0], orphanAmount);
  assert.equal(JSON.stringify(records), snapshot);
});

test('市场交易记录：数据修复——金额偏差过大按数量与单价重算（出售扣税率）', () => {
  const store = loadStore();
  const base = (overrides = {}) =>
    store.normalizeRecord({
      key: 'listing:1',
      listingId: '1',
      side: 'sell',
      itemHrid: '/items/iron_sword',
      price: 1000,
      orderQuantity: 10,
      filledQuantity: 10,
      status: 'filled',
      createdAt: NOW,
      filledAt: NOW,
      unclaimedCounted: true,
      ...overrides
    });
  // 出售：应得额 10 × 1000 × 0.96 = 9600，存的 30000（差 20400，远超一半）→ 重算为 9600，
  // 记为推算金额并写上成交时间档位的税率。
  const inflatedSell = base({key: 'listing:7501', listingId: '7501', collectedCoinCount: 30000});
  assert.equal(
    store.scanRepairIssues([
      inflatedSell
    ]).amountRecalc,
    1
  );
  const fixedSell = store.repairRecords(
    [
      inflatedSell
    ],
    [
      'amountRecalc'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedSell.collectedCoinCount, 9600);
  assert.equal(fixedSell.collectedEstimated, true);
  assert.equal(fixedSell.collectedTaxRate, 0.04);
  // 阈值以内（官方更优价 / 价格带调整，差 200 金币）保留原值。
  const nearOfficial = base({key: 'listing:7502', listingId: '7502', collectedCoinCount: 9800});
  assert.equal(
    store.scanRepairIssues([
      nearOfficial
    ]).amountRecalc,
    0
  );
  // 购买：按数量 × 单价（不扣税）重算，税率记 0。
  const inflatedBuy = base({
    key: 'listing:7503',
    listingId: '7503',
    side: 'buy',
    collectedCoinCount: 40000
  });
  const fixedBuy = store.repairRecords(
    [
      inflatedBuy
    ],
    [
      'amountRecalc'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedBuy.collectedCoinCount, 10000, '购买不扣税：数量 × 单价');
  assert.equal(fixedBuy.collectedTaxRate, 0);
  // 购买侧的偏差没有阈值：口径就是「数量 × 单价」，差 500（5%）也算错。
  // （低于应得额的会被归一化的金额补齐直接抬到应得额，所以实际能残留的是偏高的一侧。）
  const nearBuy = base({
    key: 'listing:7506',
    listingId: '7506',
    side: 'buy',
    collectedCoinCount: 10500
  });
  assert.equal(
    store.scanRepairIssues([
      nearBuy
    ]).amountRecalc,
    1
  );
  const fixedNearBuy = store.repairRecords(
    [
      nearBuy
    ],
    [
      'amountRecalc'
    ],
    {now: NOW}
  ).records[0];
  assert.equal(fixedNearBuy.collectedCoinCount, 10000);
  // 带偏差的购买记录由金额重算负责，字段清理不重复计（互斥只作用于会改同一字段的两类）。
  const residueBuy = base({
    key: 'listing:7507',
    listingId: '7507',
    side: 'buy',
    collectedCoinCount: 12000
  });
  assert.equal(
    store.scanRepairIssues([
      residueBuy
    ]).collectedFields,
    0,
    '购买侧金额有出入时归「金额偏差」'
  );
  assert.equal(
    store.scanRepairIssues([
      residueBuy
    ]).amountRecalc,
    1
  );
  // 算不出应得额的（单价或数量缺失）不重算，避免写出假金额。
  const noPrice = base({key: 'listing:7504', listingId: '7504', price: 0, collectedCoinCount: 30000});
  assert.equal(
    store.scanRepairIssues([
      noPrice
    ]).amountRecalc,
    0
  );
  // 进行中的订单不重算（官方数据还会继续来）。
  const activeOne = base({
    key: 'listing:7505',
    listingId: '7505',
    status: 'active',
    filledQuantity: 4,
    collectedCoinCount: 30000
  });
  assert.equal(
    store.scanRepairIssues([
      activeOne
    ]).amountRecalc,
    0
  );
  // 与「结清明细」互斥：偏差过大的记录由这里重算，不再补明细；阈值内的仍补明细。
  assert.equal(
    store.scanRepairIssues([
      inflatedSell
    ]).settleEvidence,
    0
  );
  assert.equal(
    store.scanRepairIssues([
      nearOfficial
    ]).settleEvidence,
    1
  );
  // 幂等：重算后再扫为 0。
  assert.equal(
    store.scanRepairIssues([
      fixedSell
    ]).amountRecalc,
    0
  );
  assert.equal(
    store.scanRepairIssues([
      fixedBuy
    ]).amountRecalc,
    0
  );
});

test('市场交易记录：数据修复——不在挂单列表的进行中记录按快照标记结束（原因未观测）', () => {
  const store = loadStore();
  const snapshotAt = NOW;
  const snapshot = {
    at: snapshotAt,
    ids: new Set([
      '8001'
    ])
  };
  const base = (overrides = {}) =>
    store.normalizeRecord({
      key: 'listing:1',
      listingId: '1',
      side: 'sell',
      itemHrid: '/items/iron_sword',
      price: 1000,
      orderQuantity: 10,
      filledQuantity: 0,
      status: 'active',
      createdAt: NOW - 100000,
      updatedAt: NOW - 50000,
      unclaimedCounted: true,
      ...overrides
    });
  // 快照里还在 / 快照之后又观测过（更新过）→ 快照给不出结论，不动。
  const stillListed = base({key: 'listing:8001', listingId: '8001'});
  const seenAfter = base({key: 'listing:8002', listingId: '8002', updatedAt: NOW + 1000});
  // 快照里没有、快照之后没再观测过（含导入的历史记录）→ 标记结束（原因未观测），时间标推断。
  const gone = base({
    key: 'listing:8003',
    listingId: '8003',
    filledQuantity: 4,
    firstFillAt: NOW - 40000,
    unclaimedCoinCount: 3840,
    collectedCoinCount: 2000
  });
  // 进度已满的交给「状态与成交进度」按已完成收尾，这里不参与。
  const fullyFilled = base({key: 'listing:8004', listingId: '8004', filledQuantity: 10});
  const scan = store.scanRepairIssues(
    [
      stillListed, seenAfter, gone, fullyFilled
    ],
    {snapshot}
  );
  assert.equal(scan.unobservedEnded, 1);
  assert.equal(scan.statusQuantity, 1);
  const result = store.repairRecords(
    [
      stillListed, seenAfter, gone, fullyFilled
    ],
    [
      'unobservedEnded'
    ],
    {now: NOW, snapshot}
  );
  assert.equal(result.report.unobservedEnded, 1);
  const fixedGone = result.records.find((record) => record.listingId === '8003');
  assert.equal(fixedGone.endedUnobserved, true);
  assert.equal(fixedGone.inferredTime, true);
  assert.equal(fixedGone.status, 'active', '状态本身不改，展示为「结束（原因未观测）」');
  assert.equal(store.getDisplayStatus(fixedGone), 'unobserved');
  assert.equal(fixedGone.collectedCoinCount, 3840, '标记结束后按已完成订单补齐金额（4 × 1000 × 0.96）');
  assert.equal(result.records.find((record) => record.listingId === '8001').endedUnobserved, false);
  assert.equal(result.records.find((record) => record.listingId === '8002').endedUnobserved, false);
  assert.equal(result.records.find((record) => record.listingId === '8004').endedUnobserved, false);
  // 没有快照（没拿到过登录快照的分桶 / 本会话未登录）时这一类不参与。
  assert.equal(
    store.scanRepairIssues([
      gone
    ]).unobservedEnded,
    0
  );
  // 幂等：标记后再扫为 0（已不是进行中，不再重复计）。
  assert.equal(
    store.scanRepairIssues(
      [
        fixedGone
      ],
      {snapshot}
    ).unobservedEnded,
    0
  );
  // 整个存储的扫描按分桶取各自的快照。
  const holder = store.createStore();
  holder.buckets['live:1'] = [
    gone
  ];
  holder.buckets['test:2'] = [
    base({key: 'listing:8005', listingId: '8005'})
  ];
  const storeScan = store.scanStoreRepairs(holder, {snapshots: {'live:1': snapshot}});
  assert.equal(storeScan.unobservedEnded, 1, '只按有快照的分桶判断');
});

test('市场交易记录：数据修复区域接线（管理页签第三块 + 中英文案）', () => {
  // 「管理」页签新增第三块「数据修复」：只读扫描出条数，按类型勾选后一次性修复。
  assert.match(moduleSourceFile, /\$\{this\.repairFormTemplate\(\)\}/);
  assert.match(moduleSourceFile, /repairFormTemplate\(\) \{/);
  assert.match(moduleSourceFile, /REPAIR_LABEL_KEYS/);
  assert.match(moduleSourceFile, /REPAIR_RESULT_KEYS/);
  assert.match(moduleSourceFile, /scanStoreRepairs\(this\.store, \{snapshots: this\.listingSnapshots\}\)/);
  assert.match(
    moduleSourceFile,
    /repairRecords\(this\.store\.buckets\[bucket\], selected, \{\s*now,\s*snapshot: this\.listingSnapshots\[bucket\] \|\| null\s*\}\)/
  );
  assert.match(moduleSourceFile, /rememberListingSnapshot\(listings, snapshotAt\)/);
  assert.match(moduleSourceFile, /this\.listingSnapshots\[this\.currentBucketKey\(\)\] = \{/);
  assert.match(moduleSourceFile, /createRepairReport\(\)/);
  // 没问题的类型复选框置灰：避免勾选后修复 0 条。
  assert.match(moduleSourceFile, /\?disabled=\$\{count === 0\}/);
  // 勾选与报告不跨次保留（打开与关闭弹窗都重置）。
  assert.ok(
    (moduleSourceFile.match(/this\.resetRepairState\(\)/g) || []).length >= 2,
    '打开与关闭弹窗都要重置修复状态'
  );
  assert.match(moduleSourceFile, /marketHistoryRepairTitle/);
  assert.match(moduleSourceFile, /marketHistoryRepairApply/);
  assert.match(moduleSourceFile, /marketHistoryRepairNothing/);
  assert.match(moduleSourceFile, /marketHistoryRepairDone/);
  // store 侧的纯函数与类型清单（七类：重复订单 / 状态与进度 / 不在挂单列表 / 到账字段 /
  // 金额偏差过大 / 结清明细 / 无法识别的记录）。
  assert.match(storeSourceFile, /export const REPAIR_TYPE_KEYS/);
  assert.match(storeSourceFile, /export function createRepairReport/);
  assert.match(storeSourceFile, /export function scanRepairIssues/);
  assert.match(storeSourceFile, /export function scanStoreRepairs/);
  assert.match(storeSourceFile, /export function repairRecords/);
  assert.match(storeSourceFile, /KNOWN_RECORD_KEY_PREFIXES/);
  assert.match(storeSourceFile, /expectedCollectedOf/);
  assert.match(storeSourceFile, /REPAIR_AMOUNT_DEVIATION_RATIO = 0\.5/);
  assert.match(storeSourceFile, /function repairUnobservedEnded\(record, \{now = 0, snapshot = null\} = \{\}\)/);
  assert.match(storeSourceFile, /function largeAmountDeviationOf\(record\)/);
  // 七个类型各有「标签（带条数）」与「修复结果」文案 key。
  [
    'marketHistoryRepairTitle', 'marketHistoryRepairHint', 'marketHistoryRepairDuplicate', 'marketHistoryRepairStatusQuantity', 'marketHistoryRepairUnobservedEnded',
    'marketHistoryRepairCollectedFields', 'marketHistoryRepairAmountRecalc', 'marketHistoryRepairSettleEvidence', 'marketHistoryRepairUnknownKey', 'marketHistoryRepairApply',
    'marketHistoryRepairNothing', 'marketHistoryRepairDone', 'marketHistoryRepairResultDuplicate', 'marketHistoryRepairResultStatusQuantity', 'marketHistoryRepairResultUnobservedEnded',
    'marketHistoryRepairResultCollectedFields', 'marketHistoryRepairResultAmountRecalc', 'marketHistoryRepairResultSettleEvidence', 'marketHistoryRepairResultUnknownKey'
  ].forEach((key) =>
    assert.ok(new RegExp(`${key}: \\{[\\s\\S]{0,80}?zh: '`).test(messagesSourceFile), `${key} 缺少中文文案`)
  );
  assert.match(messagesSourceFile, /en: 'Data repair'/);
  assert.match(messagesSourceFile, /en: 'Amount off: recompute as quantity × price/);
  assert.match(messagesSourceFile, /en: 'Active but no longer in the listing snapshot/);
  // 会删除记录的复选框标签必须写明「删除」，避免误勾。
  assert.match(messagesSourceFile, /marketHistoryRepairUnknownKey: \{\s*zh: '[^']*删除/);
});

test('市场交易记录：挂牌页速览按物品与强化等级取出售 / 收购各自最近两条成交价', () => {
  const store = loadStore();
  const record = (side, itemHrid, enhancementLevel, filledQuantity, createdAt, price = 100, status = 'filled') => ({
    key: `listing:${itemHrid}:${side}:${createdAt}`,
    itemHrid,
    side,
    enhancementLevel,
    filledQuantity,
    price,
    status,
    createdAt,
    updatedAt: createdAt
  });
  const records = [
    // 出售：300（较早）→ 800（最近）；900 是零成交空单、950 是成交过的取消单，都不算。
    record('sell', '/items/redwood_lumber', 0, 756, 300), record(
      'sell',
      '/items/redwood_lumber',
      0,
      12,
      800,
      110
    ), record('sell', '/items/redwood_lumber', 0, 0, 900), record(
      'sell',
      '/items/redwood_lumber',
      0,
      5,
      950,
      120,
      'cancelled'
    ), record // 收购只有一条。
    ('buy', '/items/redwood_lumber', 0, 4800, 400),
    // 同物品的另一个强化等级单独成条。
    record(
      'sell',
      '/items/redwood_lumber',
      3,
      4,
      960
    ), record // 其它物品不参与。
    ('buy', '/items/sugar', 0, 1, 980)
  ];
  const recent = store.findRecentTradedRecords(records, '/items/redwood_lumber', 0);
  // 从新到旧（最近的一条在前）、最多两条；零成交空单与取消单都被跳过（跨 realm 数组用 join 比较）。
  assert.equal(recent.sell.map((item) => item.createdAt).join(','), '800,300');
  assert.equal(recent.sell[0].price, 110, '最近的一条排在最前');
  assert.equal(recent.buy.map((item) => item.createdAt).join(','), '400');
  const enhanced = store.findRecentTradedRecords(records, '/items/redwood_lumber', 3);
  assert.equal(enhanced.sell.map((item) => item.createdAt).join(','), '960');
  assert.equal(enhanced.buy.length, 0);
  assert.equal(store.findRecentTradedRecords(records, '/items/unknown', 0).sell.length, 0);
  assert.equal(store.findRecentTradedRecords(null, '/items/redwood_lumber', 0).sell.length, 0);
  // 缺强化等级按 0 处理。
  const noLevel = {...record('sell', '/items/redwood_lumber', 2, 2, 200), enhancementLevel: undefined};
  assert.equal(
    store.findRecentTradedRecords(
      [
        noLevel
      ],
      '/items/redwood_lumber',
      0
    ).sell[0].createdAt,
    200
  );
  // 超过两条时只保留最近两条（limit 可调）。
  const many = [
    100, 500, 300, 900
  ].map((at) => record('buy', '/items/redwood_lumber', 0, 1, at));
  assert.equal(
    store
      .findRecentTradedRecords(many, '/items/redwood_lumber', 0)
      .buy.map((item) => item.createdAt)
      .join(','),
    '900,500'
  );
  assert.equal(
    store
      .findRecentTradedRecords(many, '/items/redwood_lumber', 0, 1)
      .buy.map((item) => item.createdAt)
      .join(','),
    '900'
  );
});

test('市场交易记录：挂牌页速览的单价用游戏市场的价格写法（与订单簿一致）', () => {
  const format = vm.runInNewContext(
    `${readVmSource('src/common/runtime.js')}
     createRuntimeUtils({i18n: {locale: 'zh'}}, {SpriteService: {}, DomObserverService: {}}).formatMarketplacePrice;`,
    {}
  );
  // 10 万以下：整数、不带千位分隔符（订单簿里的价格就是这样显示的）。
  assert.equal(format(3790), '3790');
  assert.equal(format(99999), '99999');
  // 10 万起换算后缀（阈值跟随游戏：10 万 / 1000 万 / 100 亿 / 10 万亿），
  // 换算后不足 100 保留两位、不足 1000 保留一位、再大取整。
  assert.equal(format(104000), '104K');
  assert.equal(format(100800), '100.8K');
  assert.equal(format(2865240), '2865K');
  assert.equal(format(9999999), '9999K');
  assert.equal(format(18201600), '18.2M');
  assert.equal(format(400000000), '400M');
  assert.equal(format(12345678900), '12.34B');
  assert.equal(format(2e12), '2000B');
  assert.equal(format(1e13), '10T');
  assert.equal(format(0), '0');
});

test('市场交易记录：挂牌页速览接线完整（按钮行锚点 / 公共读取器 / 同步链路 / 文案与样式）', () => {
  // 订单簿容器作为「当前是订单簿视图」的判据；挂牌按钮行是提示条的相对定位锚点。
  assert.match(runtimeSourceFile, /marketOrderBooks:\s*'\[class\*="MarketplacePanel_orderBooksContainer__"\]'/);
  assert.match(
    runtimeSourceFile,
    /marketNewListingButtons:\s*'\[class\*="MarketplacePanel_newListingButtonsContainer__"\]'/
  );
  assert.doesNotMatch(runtimeSourceFile, /marketOrderBookTableContainers/);
  // 面板 state 读取器在公共层，与市场加购共用（不再各自维护一份 fiber 遍历）。
  assert.match(dataSourceFile, /export function readMarketplacePanelState\(fiber\)/);
  assert.match(moduleSourceFile, /import \{readMarketplacePanelState\} from '\.\.\/\.\.\/common\/data\.js'/);
  // store 侧：按物品 + 强化等级各取最近两条成交价，零成交空单与取消单都不参与。
  assert.match(storeSourceFile, /export function findRecentTradedRecords/);
  assert.match(storeSourceFile, /record\.status === LISTING_STATUSES\.CANCELLED\) return;/);
  // 同步链路：页面观察器、记录变化（scheduleSave）、弹窗刷新（语言切换 / 其他标签页合并）都会同步。
  assert.match(
    moduleSourceFile,
    /utils\.observeBody\(\(\) => \{\s*this\.syncButton\(\);\s*this\.syncListingHints\(\);\s*\}\);/
  );
  assert.match(moduleSourceFile, /scheduleSave\(\) \{[\s\S]{0,200}?this\.syncListingHints\(\)/);
  assert.match(
    moduleSourceFile,
    /refreshOpenDialog\(\{forceToolbar = false\} = \{\}\) \{[\s\S]{0,200}?this\.syncListingHints\(\)/
  );
  assert.match(moduleSourceFile, /findRecentTradedRecords\(this\.getRecords\(\), itemHrid, level\)/);
  // 提示条挂在按钮行下、绝对定位（相对按钮行），不参与按钮行布局。
  assert.match(moduleSourceFile, /GameUiAdapter\.query\('marketNewListingButtons'\)/);
  assert.match(moduleSourceFile, /host\.appendChild\(hint\)/);
  assert.match(
    moduleCssSourceFile,
    // prettier 可能把 CSS 选择器的引号改成单引号，两种都接受。
    /\[class\*=['"]MarketplacePanel_newListingButtonsContainer__['"]\] \{\s*position: relative;/
  );
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint \{[\s\S]{0,200}?position: absolute;/);
  // 按钮行内要预留上方空白带：提示条是行内绝对定位子元素，不留空间会落到订单簿容器
  // （overflow: auto）之外被裁掉、看不到。
  assert.match(moduleCssSourceFile, /padding-top: 1\.05rem;/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint-sell \{\s*left: 0;/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint-buy \{\s*right: 0;/);
  // 速览层级 1100 高于 MST 弹窗（--mst-z-popup 1000）：MST 的 SweetAlert2 弹窗都带统一弹窗类
  // mst-swal2-popup（`SWAL_CLASS_NAMES`），弹窗节点只在打开期间存在于 DOM（关闭即被移除），
  // 所以按这个统一类名把速览降到正常文档流（z-index: auto），不额外维护状态类。
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint \{[\s\S]{0,200}?z-index: 1100;/);
  assert.match(
    moduleCssSourceFile,
    /body:has\(\.mst-swal2-popup\) \.mst-market-history-listing-hint \{\s*z-index: auto;/
  );
  // 统一弹窗类必须确实是 MST 弹窗的类名（改名后这条规则会失效，这里跟着一起锁住）；
  // Toast 的 popup 类名是 mst-swal2-toast、不在规则内，提示浮层不受影响。
  assert.match(uiSourceFile, /html: \{container: 'mst-swal2-theme', popup: 'mst-swal2-popup mst-swal2-html-popup'\}/);
  assert.match(uiSourceFile, /popup\.className = 'swal2-popup swal2-toast mst-swal2-toast'/);
  assert.doesNotMatch(moduleSourceFile, /mst-market-history-dialog-open/);
  assert.doesNotMatch(moduleCssSourceFile, /mst-market-history-dialog-open/);
  assert.match(moduleSourceFile, /popupClass: 'mst-market-history-dialog'/);
  // 只显示单价（游戏市场的价格写法），没有「第一次 / 第二次」这类文字标签。
  assert.match(moduleSourceFile, /item\.textContent = utils\.formatMarketplacePrice\(record\.price\)/);
  assert.match(runtimeSourceFile, /formatMarketplacePrice\(value\) \{/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint-sell \.mst-market-history-listing-hint-item/);
  assert.match(moduleCssSourceFile, /\.mst-market-history-listing-hint-buy \.mst-market-history-listing-hint-item/);
  assert.doesNotMatch(moduleCssSourceFile, /mst-market-history-listing-hint-label/);
  assert.doesNotMatch(moduleSourceFile, /marketHistoryListingHint(First|Second)/);
  assert.doesNotMatch(messagesSourceFile, /marketHistoryListingHint(First|Second)/);
  // 签名相同时不重建；节点被游戏重渲染清掉后按「签名一致但节点断开」重建。
  assert.match(moduleSourceFile, /signature === this\.listingHintSignature && this\.listingHintsConnected\(\)/);
  assert.match(moduleSourceFile, /node\.isConnected/);
  // 文案：五占位符悬浮（类型 / 单价 / 成交数量 / 金额 / 创建时间），调用传满五个实参。
  assert.doesNotMatch(messagesSourceFile, /marketHistoryBookHint/);
  const hintText = messagesSourceFile.match(/marketHistoryListingHintTitle:\s*\{[\s\S]*?zh:\s*'([^']+)'/)?.[1] || '';
  assert.equal((hintText.match(/\{\d\}/g) || []).length, 5);
  assert.match(
    moduleSourceFile,
    /'marketHistoryListingHintTitle',\s*i18n\.t\(this\.typeLabelKey\(getRecordType\(record\)\)\),\s*this\.rawValueText\(record\.price\),\s*this\.rawValueText\(record\.filledQuantity\),\s*this\.rawValueText\(getRecordAmount\(record\)\),\s*this\.formatTime\(record\.createdAt\)/
  );
  // 旧的「订单簿上方金额条」实现不残留。
  assert.doesNotMatch(moduleSourceFile, /BookHint/);
  assert.doesNotMatch(moduleCssSourceFile, /mst-market-history-book-hint/);
});
