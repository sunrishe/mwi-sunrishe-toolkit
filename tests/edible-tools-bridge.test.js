'use strict';

// 食用工具 ↔ MST 市场数据桥接回归：
// - 食用工具条目（官方挂牌对象 + lastUpdated）→ MST 记录的字段映射与分桶；
// - MST 记录 → 食用工具条目（含无法表达的直购兜底记录跳过）；
// - 双向往返、按订单 id 合并、统一格式与版本校验等边界；
// - 按钮注入锚点与文件位置约定（放在食用工具市场数据页的删除按钮之后）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {readSourceFile} = require('./helpers/source.js');

const BRIDGE_PATH = path.resolve(__dirname, '..', 'integrations', 'edible-tools', 'edible-tools-market-bridge.js');
const bridgeSource = fs.readFileSync(BRIDGE_PATH, 'utf8');
const bridgeReadme = readSourceFile('integrations', 'edible-tools', 'README.md');

const NOW = Date.parse('2026-10-02T02:00:00.000Z');

function loadBridge() {
  // 无 DOM 环境加载：只初始化纯逻辑并挂到 globalThis，界面部分不会执行。
  const context = {};
  vm.runInNewContext(bridgeSource, context);
  return context.__MST_EDIBLE_BRIDGE__;
}

function edibleEntry(overrides = {}) {
  return {
    id: 1,
    characterID: 427012,
    status: '/market_listing_status/filled',
    isSell: true,
    itemHrid: '/items/sugar',
    enhancementLevel: 0,
    orderQuantity: 5,
    filledQuantity: 5,
    price: 10,
    unclaimedItemCount: 0,
    unclaimedCoinCount: 0,
    taxTaken: 2,
    createdTimestamp: '2026-09-29T09:14:35.551285119Z',
    expirationTimestamp: '2026-10-29T09:14:35.551285199Z',
    lastUpdated: '2026-10-02T00:18:00.000Z',
    ...overrides
  };
}

test('食用工具桥接：条目转 MST 记录保留官方字段并清洗状态', () => {
  const bridge = loadBridge();
  assert.equal(bridge.BRIDGE_VERSION, '1.2.0');
  const record = bridge.edibleEntryToMstRecord(edibleEntry(), {
    environment: 'live',
    originHost: 'www.milkywayidle.com'
  });
  assert.equal(record.key, 'listing:1');
  assert.equal(record.listingId, '1');
  assert.equal(record.kind, 'listing');
  assert.equal(record.side, 'sell');
  assert.equal(record.status, 'filled');
  assert.equal(record.characterId, '427012');
  assert.equal(record.createdAt, Date.parse('2026-09-29T09:14:35.551Z'), '官方创建时间戳截断到毫秒');
  assert.equal(record.expiresAt, Date.parse('2026-10-29T09:14:35.551Z'));
  assert.equal(record.taxTaken, 2);
  assert.equal(record.filledAt, Date.parse('2026-10-02T00:18:00.000Z'), '没有独立成交时间，用 lastUpdated 近似');
  assert.equal(record.inferredTime, false, '有官方创建时间时不标推断');
  assert.equal(record.origin, 'import');
  assert.match(record.importNote, /食用工具|Edible Tools/);
  // 缺官方创建时间时退回 lastUpdated 并标推断。
  const legacy = bridge.edibleEntryToMstRecord(
    edibleEntry({createdTimestamp: undefined, expirationTimestamp: undefined}),
    {
      environment: 'live'
    }
  );
  assert.equal(legacy.inferredTime, true);
  assert.equal(legacy.createdAt, Date.parse('2026-10-02T00:18:00.000Z'));
  assert.equal(legacy.expiresAt, null);
  // 非法条目返回 null。
  assert.equal(bridge.edibleEntryToMstRecord({id: null, itemHrid: '/items/sugar'}), null);
  assert.equal(bridge.edibleEntryToMstRecord(null), null);
});

test('食用工具桥接：导出载荷按环境与角色分桶并统计跳过数', () => {
  const bridge = loadBridge();
  const result = bridge.buildMstPayload(
    [
      edibleEntry(), edibleEntry({id: 2, characterID: 26595, isSell: false, status: '/market_listing_status/active', enhancementLevel: 3, filledQuantity: 1, unclaimedItemCount: 1}), {id: null, itemHrid: '/items/sugar'}
    ],
    {environment: 'test', originHost: 'test.milkywayidle.com', now: NOW}
  );
  assert.equal(result.converted, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(Object.keys(result.payload.buckets).sort(), [
    'test:26595', 'test:427012'
  ]);
  assert.equal(result.payload.app, 'MST');
  assert.equal(result.payload.type, 'market-history');
  assert.equal(result.payload.schemaVersion, 1);
  assert.equal(result.payload.exportedAt, NOW);
  assert.equal(result.payload.buckets['test:427012'][0].environment, 'test');
  // 条目缺 characterID 时用当前角色兜底分桶（游戏页 URL 的 characterId 参数），避免落到 default 桶。
  const fallback = bridge.buildMstPayload(
    [
      edibleEntry({characterID: undefined, id: 3})
    ],
    {environment: 'live', fallbackCharacterId: '427012'}
  );
  assert.deepEqual(Object.keys(fallback.payload.buckets), [
    'live:427012'
  ]);
  assert.equal(fallback.payload.buckets['live:427012'][0].characterId, '427012');
  assert.equal(bridge.currentCharacterId('?characterId=427012'), '427012');
  assert.equal(bridge.currentCharacterId(''), '');
});

test('食用工具桥接：MST 记录转回条目，直购兜底记录跳过并计数', () => {
  const bridge = loadBridge();
  const entries = bridge.extractEdibleEntries(
    JSON.stringify({
      app: 'MST',
      type: 'market-history',
      schemaVersion: 1,
      buckets: {
        'live:427012': [
          {
            key: 'listing:9',
            environment: 'live',
            characterId: '427012',
            kind: 'listing',
            side: 'buy',
            listingId: '9',
            itemHrid: '/items/iron_sword',
            enhancementLevel: 2,
            price: 1234,
            orderQuantity: 4,
            filledQuantity: 2,
            status: 'cancelled',
            createdAt: Date.parse('2026-10-01T00:00:00.000Z'),
            updatedAt: Date.parse('2026-10-01T05:00:00.000Z'),
            expiresAt: Date.parse('2026-10-31T00:00:00.000Z'),
            taxTaken: 7,
            unclaimedCoinCount: 0,
            unclaimedItemCount: 0
          }, {key: 'instant:1-2-3', environment: 'live', side: 'sell', status: 'filled', itemHrid: '/items/sugar'}
        ]
      }
    })
  );
  assert.equal(entries.ok, true);
  assert.equal(entries.entries.length, 1);
  assert.equal(entries.unrepresentable, 1, '没有官方订单 id 的直购兜底记录无法表达');
  const entry = entries.entries[0];
  assert.equal(entry.id, 9);
  assert.equal(entry.status, '/market_listing_status/cancelled');
  assert.equal(entry.isSell, false);
  assert.equal(entry.enhancementLevel, 2);
  assert.equal(entry.taxTaken, 7);
  assert.equal(entry.characterID, 427012);
  assert.equal(entry.createdTimestamp, '2026-10-01T00:00:00.000Z');
  assert.equal(entry.expirationTimestamp, '2026-10-31T00:00:00.000Z');
  assert.equal(entry.lastUpdated, '2026-10-01T05:00:00.000Z');
  // 全部都是直购兜底记录时给出专用原因。
  const onlyInstant = bridge.extractEdibleEntries(
    JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 1, buckets: {'live:1': [
          {key: 'instant:x', itemHrid: '/items/sugar'}
        ]}})
  );
  assert.equal(onlyInstant.ok, false);
  assert.equal(onlyInstant.reason, 'no-representable-records');
  assert.equal(onlyInstant.unrepresentable, 1);
  // 文件里一条记录都没有（空分桶或没有分桶）时是「没有记录」，不是「都是直购兜底记录」。
  assert.equal(
    bridge.extractEdibleEntries(
      JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 1, buckets: {'live:1': []}})
    ).reason,
    'no-records'
  );
  assert.equal(
    bridge.extractEdibleEntries(JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 1, buckets: {}}))
      .reason,
    'no-records'
  );
});

test('食用工具桥接：双向往返字段一致（除食用工具没有的领取数据）', () => {
  const bridge = loadBridge();
  const original = edibleEntry();
  const record = bridge.edibleEntryToMstRecord(original, {environment: 'live'});
  const back = bridge.mstRecordToEdibleEntry(record, {now: NOW});
  assert.equal(back.id, original.id);
  assert.equal(back.status, original.status);
  assert.equal(back.isSell, original.isSell);
  assert.equal(back.itemHrid, original.itemHrid);
  assert.equal(back.enhancementLevel, original.enhancementLevel);
  assert.equal(back.orderQuantity, original.orderQuantity);
  assert.equal(back.filledQuantity, original.filledQuantity);
  assert.equal(back.price, original.price);
  assert.equal(back.taxTaken, original.taxTaken);
  assert.equal(back.characterID, original.characterID);
  assert.equal(back.createdTimestamp, original.createdTimestamp.slice(0, 23) + 'Z');
  assert.equal(back.expirationTimestamp, original.expirationTimestamp.slice(0, 23) + 'Z');
  assert.equal(back.lastUpdated, original.lastUpdated);
});

test('食用工具桥接：写回条目与食用工具自身结构一致，环境与类型按导出时页面判定', () => {
  const bridge = loadBridge();
  // MST 测试服的一条直购记录（有官方 id）转回食用工具条目：只写食用工具自身的字段
  // （官方挂牌对象 + lastUpdated），不追加任何自定义字段。
  const record = {
    key: 'listing:31',
    environment: 'test',
    characterId: '26595',
    kind: 'instant',
    side: 'buy',
    listingId: '31',
    itemHrid: '/items/sugar',
    enhancementLevel: 0,
    price: 10,
    orderQuantity: 5,
    filledQuantity: 5,
    status: 'filled',
    createdAt: NOW,
    updatedAt: NOW + 1000,
    inferredTime: true,
    unclaimedCoinCount: 0,
    unclaimedItemCount: 0
  };
  const entry = bridge.mstRecordToEdibleEntry(record, {now: NOW});
  assert.equal(
    Object.keys(entry).some((key) => key.startsWith('mst')),
    false,
    '不追加 MST 自定义字段'
  );
  assert.deepEqual(Object.keys(entry).sort(), [
    'characterID', 'coinsAvailable', 'createdTimestamp', 'enhancementLevel', 'filledQuantity',
    'id', 'isSell', 'itemHrid', 'lastUpdated', 'orderQuantity',
    'price', 'status', 'taxTaken', 'unclaimedCoinCount', 'unclaimedItemCount'
  ]);
  // 在正式服页面把这条条目导出：环境按当前所在页面判定，类型统一按挂牌处理。
  const result = bridge.buildMstPayload(
    [
      entry
    ],
    {
      environment: 'live',
      originHost: 'www.milkywayidle.com',
      now: NOW
    }
  );
  assert.deepEqual(Object.keys(result.payload.buckets), [
    'live:26595'
  ]);
  const back = result.payload.buckets['live:26595'][0];
  assert.equal(back.environment, 'live', '环境按导出时所在页面判定');
  assert.equal(back.kind, 'listing', '食用工具条目统一按挂牌处理');
  assert.equal(back.inferredTime, false, '有官方创建时间时不标推断');
  // 首次成交时间：有成交时用最后更新时间近似，没有成交保持空。
  assert.equal(back.firstFillAt, NOW + 1000);
  const active = bridge.mstRecordToEdibleEntry(
    {
      key: 'listing:32',
      environment: 'live',
      characterId: '26595',
      kind: 'listing',
      side: 'sell',
      listingId: '32',
      itemHrid: '/items/log',
      price: 5,
      orderQuantity: 2,
      filledQuantity: 0,
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW + 2000
    },
    {now: NOW}
  );
  const activePayload = bridge.buildMstPayload(
    [
      active
    ],
    {environment: 'live', now: NOW}
  ).payload;
  assert.equal(activePayload.buckets['live:26595'][0].firstFillAt, null);
  // 导出载荷紧凑单行（与 MST 自身导出口径一致），解析回来内容不变。
  const compact = JSON.stringify(result.payload);
  assert.equal(compact.includes('\n'), false, '紧凑导出不带换行');
  assert.equal(JSON.parse(compact).buckets['live:26595'].length, 1);
});

test('食用工具桥接：合并模式按状态与更新时间合并，新 id 追加并保留原有字段', () => {
  const bridge = loadBridge();
  const existing = [
    {id: 1, itemHrid: '/items/sugar', price: 10, extraKeep: true}, {id: 2, itemHrid: '/items/iron_sword', price: 100}
  ];
  const incoming = [
    {id: 1, itemHrid: '/items/sugar', price: 11}, {id: 3, itemHrid: '/items/log', price: 5}
  ];
  const merged = bridge.mergeEdibleEntries(existing, incoming, {mode: 'merge'});
  assert.equal(merged.added, 1);
  assert.equal(merged.updated, 1);
  assert.equal(merged.cleared, 0);
  assert.equal(merged.list.length, 3);
  const one = merged.list.find((entry) => entry.id === 1);
  assert.equal(one.price, 11, '两侧都没有状态与更新时间时以导入方为准');
  assert.equal(one.extraKeep, true, '合并保留食用工具原有的额外字段');
  assert.equal(existing[0].price, 10, '不修改传入的原数组元素');
});

test('食用工具桥接：合并模式终态优先、进度与税费取大、更新时间取新', () => {
  const bridge = loadBridge();
  const activeEntry = edibleEntry({
    id: 7,
    status: '/market_listing_status/active',
    filledQuantity: 1,
    orderQuantity: 5,
    taxTaken: 1,
    lastUpdated: '2026-10-01T00:00:00.000Z'
  });
  const filledEntry = edibleEntry({
    id: 7,
    status: '/market_listing_status/filled',
    filledQuantity: 5,
    orderQuantity: 5,
    taxTaken: 9,
    unclaimedCoinCount: 48,
    lastUpdated: '2026-10-02T00:00:00.000Z'
  });
  // 设备 A 只看到「进行中」、设备 B 看到「已完成」：合并后取终态并保留最大进度与税费。
  const fromActive = bridge.mergeEdibleEntries(
    [
      activeEntry
    ],
    [
      filledEntry
    ],
    {mode: 'merge'}
  );
  assert.equal(fromActive.updated, 1);
  assert.equal(fromActive.list[0].status, '/market_listing_status/filled');
  assert.equal(fromActive.list[0].filledQuantity, 5);
  assert.equal(fromActive.list[0].taxTaken, 9);
  assert.equal(fromActive.list[0].unclaimedCoinCount, 48);
  assert.equal(fromActive.list[0].lastUpdated, '2026-10-02T00:00:00.000Z');
  // 反过来（现有是终态、导入的是更早的进行中）也保持终态。
  const fromFilled = bridge.mergeEdibleEntries(
    [
      filledEntry
    ],
    [
      activeEntry
    ],
    {mode: 'merge'}
  );
  assert.equal(fromFilled.list[0].status, '/market_listing_status/filled');
  assert.equal(fromFilled.list[0].filledQuantity, 5);
  assert.equal(fromFilled.list[0].taxTaken, 9);
  // 都是进行中时取更新时间较新的一条。
  const older = edibleEntry({
    id: 8,
    status: '/market_listing_status/active',
    price: 10,
    lastUpdated: '2026-10-01T00:00:00.000Z'
  });
  const newer = edibleEntry({
    id: 8,
    status: '/market_listing_status/active',
    price: 12,
    lastUpdated: '2026-10-02T00:00:00.000Z'
  });
  assert.equal(
    bridge.mergeEdibleEntries(
      [
        older
      ],
      [
        newer
      ],
      {mode: 'merge'}
    ).list[0].price,
    12
  );
  assert.equal(
    bridge.mergeEdibleEntries(
      [
        newer
      ],
      [
        older
      ],
      {mode: 'merge'}
    ).list[0].price,
    12
  );
  // 终态判定只认三个终态 hrid。
  assert.equal(bridge.isTerminalStatus('/market_listing_status/filled'), true);
  assert.equal(bridge.isTerminalStatus('/market_listing_status/active'), false);
});

test('食用工具桥接：覆盖模式清空现有数据后整体替换', () => {
  const bridge = loadBridge();
  const existing = [
    edibleEntry({id: 1}), edibleEntry({id: 2})
  ];
  const incoming = [
    edibleEntry({id: 9, itemHrid: '/items/log'})
  ];
  const result = bridge.mergeEdibleEntries(existing, incoming, {mode: 'overwrite'});
  assert.equal(result.cleared, 2);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].id, 9);
  assert.equal(existing.length, 2, '不修改传入的原数组');
});

test('食用工具桥接：导入只接受统一的 MST 格式，其它输入报错', () => {
  const bridge = loadBridge();
  // 统一格式后不再接受食用工具原始数组（导出也只会产出 MST 格式）。
  assert.equal(
    bridge.extractEdibleEntries(
      JSON.stringify([
        edibleEntry()
      ])
    ).reason,
    'invalid-format'
  );
  assert.equal(bridge.extractEdibleEntries('not json').reason, 'invalid-json');
  assert.equal(bridge.extractEdibleEntries(JSON.stringify({app: 'other'})).reason, 'invalid-format');
  assert.equal(bridge.extractEdibleEntries(JSON.stringify([])).reason, 'invalid-format');
  assert.equal(
    bridge.extractEdibleEntries(JSON.stringify({app: 'MST', type: 'market-history', schemaVersion: 99, buckets: {}}))
      .reason,
    'unsupported-version'
  );
  assert.equal(bridge.currentEnvironment('test.milkywayidle.com'), 'test');
  assert.equal(bridge.currentEnvironment('www.milkywayidlecn.com'), 'live');
  assert.equal(bridge.currentEnvironment(''), 'live');
});

test('食用工具桥接：按钮注入锚点与文件约定', () => {
  // 按钮插在「仅保留已完成订单」按钮之后（同排），并带删除按钮行的兜底锚点与表格前兜底。
  assert.match(
    bridgeSource,
    /document\.getElementById\('deleteSpecificStatusDataBtn'\) \|\| document\.getElementById\('deleteOldDataBtn'\)/
  );
  assert.match(bridgeSource, /anchor\.insertAdjacentElement\('afterend', row\)/);
  assert.match(bridgeSource, /page\.insertBefore\(row, page\.querySelector\('table'\) \|\| null\)/);
  assert.match(bridgeSource, /mstEdibleBridgeRow/);
  assert.match(bridgeSource, /mstEdibleExportMstBtn/);
  assert.match(bridgeSource, /mstEdibleImportBtn/);
  // 导出只有一个按钮、一种格式：不再有食用工具备份格式。
  assert.doesNotMatch(bridgeSource, /mstEdibleExportBackupBtn/);
  assert.doesNotMatch(bridgeSource, /MWI_Edible_Tools_Market_Backup_/);
  // 按钮文案跟随食用工具自身的语言判定（localStorage.i18nextLng，非 en 即中文）。
  assert.match(bridgeSource, /localStorage\.getItem\('i18nextLng'\)/);
  assert.match(bridgeSource, /return !lang\.startsWith\('en'\)/);
  // 到账口径与 MST 实际行为一致：提示说明会按成交当时的税率推算，不再写「实际到账为 0」。
  assert.match(bridgeSource, /实际到账”会按成交当时的市场税率推算并标注/);
  assert.doesNotMatch(bridgeSource, /实际到账”为 0/);
  // 覆盖会清空整个 market_list（MST 侧只替换文件涉及的分桶），确认提示要写明含其它角色的条目。
  assert.match(bridgeSource, /含其它角色的条目/);
  // 写回食用工具的条目保持它自身的结构（官方挂牌对象 + lastUpdated），不追加任何自定义字段；
  // 环境按导出时所在页面判定，类型统一按挂牌处理。
  assert.doesNotMatch(bridgeSource, /mstEnvironment|mstKind|mstInferredTime/);
  assert.match(bridgeSource, /environment: environment \|\| 'live'/);
  assert.match(bridgeSource, /kind: 'listing'/);
  assert.match(bridgeSource, /const key = env \+ ':' \+ \(record\.characterId \|\| 'default'\)/);
  // 空文件与「都是直购兜底记录」在脚本里是两种提示。
  assert.match(bridgeSource, /reason: 'no-records'/);
  // 导出下载用紧凑单行（不带缩进），与 MST 自身导出一致。
  assert.match(bridgeSource, /downloadJson\(JSON\.stringify\(result\.payload\), fileName\)/);
  assert.doesNotMatch(bridgeSource, /JSON\.stringify\(result\.payload, null, 2\)/);
  // 导入方式用 prompt 选择：1 = 合并、2 = 覆盖；覆盖另有 confirm 二次确认。
  assert.match(bridgeSource, /function askImportMode\(existingCount, incomingCount\)/);
  assert.match(bridgeSource, /const answer = prompt\(text, '1'\)/);
  assert.match(bridgeSource, /return 'merge'/);
  assert.match(bridgeSource, /return 'overwrite'/);
  assert.match(bridgeSource, /mode === 'overwrite' &&\s*\n?\s*!confirm\(/);
  // 导出/导入统一为 MST 格式：导出走 buildMstPayload，导入走 extractEdibleEntries。
  assert.match(bridgeSource, /buildMstPayload\(entries, \{/);
  assert.match(bridgeSource, /function importIntoEdible\(text\)/);
  // 目标页面是食用工具的市场数据页；GM 键就是食用工具的 market_list。
  assert.match(bridgeSource, /getElementById\('showMarketDataPage'\)/);
  assert.match(bridgeSource, /const MARKET_LIST_KEY = 'market_list'/);
  assert.match(bridgeSource, /GM_getValue\(MARKET_LIST_KEY/);
  assert.match(bridgeSource, /GM_setValue\(MARKET_LIST_KEY/);
  // 无 DOM 时只暴露纯逻辑，不启动界面。
  assert.match(bridgeSource, /typeof document !== 'undefined' && typeof MutationObserver !== 'undefined'/);
  // @require 接入的说明同时在脚本头与 README 里。
  assert.match(bridgeSource, /@require file:\/\/\//);
  assert.match(bridgeReadme, /@require file:\/\/\//);
  assert.match(bridgeReadme, /仅保留已完成订单/);
  assert.match(bridgeReadme, /market_list/);
  assert.match(bridgeReadme, /导入到食用工具/);
  assert.match(bridgeReadme, /统一为 MST 格式|统一格式|MST 格式/);
  assert.match(bridgeReadme, /合并/);
  assert.match(bridgeReadme, /覆盖/);
  assert.match(bridgeReadme, /1\.2\.0/);
  assert.match(bridgeReadme, /紧凑单行/);
  // README 与脚本口径一致：条目结构保持食用工具自身，不写 mst* 自定义字段。
  assert.doesNotMatch(bridgeReadme, /mstEnvironment|mstKind|mstInferredTime/);
});
