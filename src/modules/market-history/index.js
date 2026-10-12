// market-history（市场交易记录）
// 记录本账号自己的市场交易：挂牌创建、部分成交、成交完成、取消、过期、领取，
// 以及「立即购买 / 立即出售」订单；支持搜索、排序、分页、统计（独立筛选 + 图表）、批量删除、导入导出与帮助页签。
// 需求与口径见 `docs/analysis/市场交易记录需求说明书.md`。
//
// 数据来源（全部为本机观测，官方不提供历史接口）：
// - 入站 `init_character_data.myMarketListings`：登录/重连全量快照；
// - 入站 `market_listings_updated.endMarketListings`：新增、成交、状态变化、领取后清除；
// - 出站 `post_market_order`（isInstantOrder）/ `cancel_market_listing` / `claim_market_listing`。
// 实际到账金额以官方未领取数量（`unclaimedCoinCount` 为扣税后金币）为权威值；
// 只有完全没有官方数据的记录（典型是导入的历史数据）才按成交当时的税率推算，见 store.js 的到账推算；
// 「管理」页签的数据修复用于清理历史版本写下的结构性问题数据，见 store.js 的 repair 段。
import {StyleService} from '../../common/runtime.js';
import {readMarketplacePanelState} from '../../common/data.js';
import MST_MARKET_HISTORY_CSS from './styles.css';
import {
  buildValueAxis,
  layoutBarGroups,
  layoutDoughnutArcs,
  layoutStackedSegments,
  percentageText,
  pickLabelStep
} from './charts.js';
import {
  applyListingBatch,
  applyOutgoingMessage,
  bucketKey,
  buildExportPayload,
  buildStatsBreakdown,
  buildStatsTimeSeries,
  createRepairReport,
  createStore,
  estimateStoreBytes,
  filterRecords,
  findRecentTradedRecords,
  getCollectedCount,
  getDisplayStatus,
  getRecordAmount,
  getRecordType,
  getSortTimestamp,
  HISTORY_STATUS_KEYS,
  HISTORY_TYPE_KEYS,
  isUnconfirmedInstant,
  linkInstantRecords,
  mergeImport,
  paginate,
  parseImportPayload,
  parseIsoTimestamp,
  parseStore,
  RECORDS_SOFT_LIMIT,
  reconcileWithSnapshot,
  repairRecords,
  REPAIR_TYPE_KEYS,
  scanStoreRepairs,
  serializeStore,
  sortRecords,
  STORE_BYTES_SOFT_LIMIT,
  summarize,
  summarizeByItem,
  taxDerivedAmountOf
} from './store.js';

const SAVE_DEBOUNCE_MS = 500;
// 帮助页签里给出的食用工具桥接脚本地址：固定在提交 4851b02（桥接脚本 v1.2.0），
// 内容不随仓库后续更新而变，避免用户拿到改到一半的版本。
const EDIBLE_BRIDGE_PINNED_COMMIT = '4851b0229332a561424e4713fe11851c944f94b2';
const EDIBLE_BRIDGE_URL =
  'https://cdn.jsdelivr.net/gh/sunrishe/mwi-sunrishe-toolkit@' +
  EDIBLE_BRIDGE_PINNED_COMMIT +
  '/integrations/edible-tools/edible-tools-market-bridge.js';
const EDIBLE_BRIDGE_REQUIRE_LINE = '// @require ' + EDIBLE_BRIDGE_URL;
const PAGE_SIZE_OPTIONS = [
  20, 50, 100, 200, 500,
  1000
];
// 记录与统计两个页签共用同一套时间范围选项（口径都是创建时间）：
// 下拉默认项即「创建时间」（兼作控件标题、不再另加标签），不给「今天」（当天数据通常只有几笔，趋势图看不出东西）。
const TIME_PRESETS = [
  'all', '7d', '15d', '30d', '60d',
  '90d', '180d', 'custom'
];
const TIME_PRESET_DAYS = {'7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90, '180d': 180};
const TIME_PRESET_LABEL_KEYS = {
  all: 'marketHistoryTimeAll',
  '7d': 'marketHistoryTime7d',
  '15d': 'marketHistoryTime15d',
  '30d': 'marketHistoryTime30d',
  '60d': 'marketHistoryTime60d',
  '90d': 'marketHistoryTime90d',
  '180d': 'marketHistoryTime180d',
  custom: 'marketHistoryTimeCustom'
};
const STATS_SIDE_LABEL_KEYS = {
  all: 'marketHistoryFilterAny',
  sell: 'marketHistoryStatsSideSell',
  buy: 'marketHistoryStatsSideBuy'
};
const STATS_BUCKET_KEYS = [
  'auto', 'day', 'week', 'month'
];
const STATS_BUCKET_LABEL_KEYS = {
  auto: 'marketHistoryStatsBucketAuto',
  day: 'marketHistoryStatsBucketDay',
  week: 'marketHistoryStatsBucketWeek',
  month: 'marketHistoryStatsBucketMonth'
};
const STATS_RANK_METRICS = [
  'amount', 'quantity', 'count'
];
const STATS_RANK_LABEL_KEYS = {
  amount: 'marketHistoryStatsRankAmount',
  quantity: 'marketHistoryStatsRankQuantity',
  count: 'marketHistoryStatsRankCount'
};
const STATS_CATEGORY_METRICS = [
  'expense', 'income'
];
const STATS_COMPOSE_DIMS = [
  'status', 'type'
];
const STATS_COMPOSE_LABEL_KEYS = {
  status: 'marketHistoryColumnStatus',
  type: 'marketHistoryColumnType'
};
const STATS_RANK_LIMIT = 10;
// 环形图的分类配色：固定顺序取色，深浅在游戏深色底上都能分辨。
const CHART_PALETTE = [
  '#86d7b1', '#ef8f98', '#88b3f7', '#f5d76e', '#c89ef0',
  '#79d1e0', '#f0a764', '#cbd5e1'
];
const DAY_MS = 24 * 60 * 60 * 1000;

// 与官方市场物品分类一致（`getMarketItemsByTab`）：装备按 equipmentDetail.type 细分。
const MARKET_CATEGORY_KEYS = [
  'resources', 'consumables', 'books', 'labyrinth', 'dungeonKeys',
  'equipment', 'accessories', 'tools'
];
const CATEGORY_BY_ITEM_CATEGORY = {
  '/item_categories/loot': 'resources',
  '/item_categories/resource': 'resources',
  '/item_categories/food': 'consumables',
  '/item_categories/drink': 'consumables',
  '/item_categories/ability_book': 'books',
  '/item_categories/labyrinth': 'labyrinth',
  '/item_categories/dungeon_key': 'dungeonKeys',
  '/item_categories/equipment': 'equipment'
};
const ACCESSORY_EQUIPMENT_TYPES = [
  '/equipment_types/neck', '/equipment_types/earrings', '/equipment_types/ring', '/equipment_types/charm'
];

// 文案 key 的静态映射：不使用字符串拼接生成 key（回归测试会扫描 i18n.t 的字面量并校验存在性）。
const CATEGORY_LABEL_KEYS = {
  resources: 'marketHistoryCategoryResources',
  consumables: 'marketHistoryCategoryConsumables',
  books: 'marketHistoryCategoryBooks',
  labyrinth: 'marketHistoryCategoryLabyrinth',
  dungeonKeys: 'marketHistoryCategoryDungeonKeys',
  equipment: 'marketHistoryCategoryEquipment',
  accessories: 'marketHistoryCategoryAccessories',
  tools: 'marketHistoryCategoryTools'
};
// 记录表格的列定义：宽度写在表头（table-layout: fixed 以第一行为准），numeric 列右对齐，
// sortable 列的 key 与 store.sortRecords 支持的排序键一致（列头点击即排序，不再另设工具栏排序）。
// 首列（复选框）与序号列由模板单独渲染，这里只贡献列宽。
// 每一列都必须写宽度：固定布局下没有宽度的列在容器变窄时会被压成 0 宽度（物品列曾整列消失），
// 表格同时声明最小宽度（= 列宽合计，见 styles.css）让窄容器改为横向滚动。
const RECORD_COLUMNS = [
  {key: 'select', width: '2.25rem'}, {
    key: 'index',
    labelKey: 'marketHistoryColumnIndex',
    width: '3rem',
    numeric: true
  }, {key: 'status', labelKey: 'marketHistoryColumnStatus', width: '7.5rem', sortable: true}, {
    key: 'type',
    labelKey: 'marketHistoryColumnType',
    width: '5.5rem'
  }, {key: 'item', labelKey: 'marketHistoryColumnItem', width: '14rem', sortable: true},
  {
    key: 'filledQuantity',
    labelKey: 'marketHistoryColumnProgress',
    width: '6.25rem',
    sortable: true,
    numeric: true
  }, {key: 'price', labelKey: 'marketHistoryColumnPrice', width: '5.25rem', sortable: true, numeric: true}, {
    key: 'amount',
    labelKey: 'marketHistoryColumnNominal',
    width: '6.25rem',
    sortable: true,
    numeric: true
  }, {
    key: 'collected',
    labelKey: 'marketHistoryColumnCollected',
    width: '6.5rem',
    sortable: true,
    numeric: true
  }, {key: 'createdAt', labelKey: 'marketHistoryColumnCreatedAt', width: '6.25rem', sortable: true},
  {key: 'filledAt', labelKey: 'marketHistoryColumnFilledAt', width: '6.25rem', sortable: true}, {
    key: 'actions',
    labelKey: 'marketHistoryColumnActions',
    width: '3rem'
  }
];
const STATUS_LABEL_KEYS = {
  active: 'marketHistoryStatusActive',
  partial: 'marketHistoryStatusPartial',
  filled: 'marketHistoryStatusFilled',
  unconfirmed: 'marketHistoryStatusUnconfirmed',
  cancelled: 'marketHistoryStatusCancelled',
  expired: 'marketHistoryStatusExpired',
  partialCancelled: 'marketHistoryStatusPartialCancelled',
  partialExpired: 'marketHistoryStatusPartialExpired',
  unobserved: 'marketHistoryStatusUnobserved'
};
const TYPE_LABEL_KEYS = {
  sellListing: 'marketHistoryTypeSellListing',
  buyListing: 'marketHistoryTypeBuyListing',
  sellInstant: 'marketHistoryTypeSellInstant',
  buyInstant: 'marketHistoryTypeBuyInstant'
};
const EXPORT_SCOPE_LABEL_KEYS = {
  current: 'marketHistoryExportScopeCurrent',
  all: 'marketHistoryExportScopeAll'
};
const EXPORT_FORMAT_LABEL_KEYS = {
  json: 'marketHistoryExportFormatJson',
  csv: 'marketHistoryExportFormatCsv'
};
const IMPORT_MODE_LABEL_KEYS = {
  merge: 'marketHistoryImportModeMerge',
  overwrite: 'marketHistoryImportModeOverwrite'
};
// 「数据修复」的文案 key：复选框标签（带问题条数）与修复结果各一套，静态映射不用拼接 key。
const REPAIR_LABEL_KEYS = {
  duplicateListings: 'marketHistoryRepairDuplicate',
  statusQuantity: 'marketHistoryRepairStatusQuantity',
  unobservedEnded: 'marketHistoryRepairUnobservedEnded',
  collectedFields: 'marketHistoryRepairCollectedFields',
  amountRecalc: 'marketHistoryRepairAmountRecalc',
  settleEvidence: 'marketHistoryRepairSettleEvidence',
  unknownKey: 'marketHistoryRepairUnknownKey'
};
const REPAIR_RESULT_KEYS = {
  duplicateListings: 'marketHistoryRepairResultDuplicate',
  statusQuantity: 'marketHistoryRepairResultStatusQuantity',
  unobservedEnded: 'marketHistoryRepairResultUnobservedEnded',
  collectedFields: 'marketHistoryRepairResultCollectedFields',
  amountRecalc: 'marketHistoryRepairResultAmountRecalc',
  settleEvidence: 'marketHistoryRepairResultSettleEvidence',
  unknownKey: 'marketHistoryRepairResultUnknownKey'
};

function formatItemKey(itemHrid, enhancementLevel) {
  return String(itemHrid || '') + '::' + String(Number(enhancementLevel) || 0);
}

function parseDateInput(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!text) return null;
  const stamp = Date.parse(text + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
  return Number.isFinite(stamp) ? stamp : null;
}

// 时间范围预设 → 筛选起止时间：记录与统计两个页签共用（口径都是创建时间）。
function applyTimePreset(filters, now) {
  const days = TIME_PRESET_DAYS[filters.timePreset];
  if (days) {
    filters.timeFrom = now - days * DAY_MS;
    filters.timeTo = null;
  } else if (filters.timePreset === 'custom') {
    filters.timeFrom = parseDateInput(filters.timeFrom, false);
    filters.timeTo = parseDateInput(filters.timeTo, true);
  } else {
    filters.timeFrom = null;
    filters.timeTo = null;
  }
}

// SVG 坐标只保留两位小数，省体积也避免一长串浮点尾巴。
function svgNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return String(Math.round(number * 100) / 100);
}

// uhtml 的数组插值不接受 null / undefined 元素（第一个 null 就会抛 "Cannot read properties of null"），
// 条件渲染一律用这个helper 收集命中的模板，跳过不要的项。
function templateList(values, build) {
  const items = [];
  values.forEach((value, index) => {
    const rendered = build(value, index);
    if (rendered) items.push(rendered);
  });
  return items;
}

// 页码按钮最多 5 个：两端固定 + 当前页附近窗口，其余用省略号。
function paginationItems(pageCount, current) {
  if (pageCount <= 5) return Array.from({length: pageCount}, (_, index) => index + 1);
  if (current <= 3) return [
      1, 2, 3, 4, 'ellipsis',
      pageCount
    ];
  if (current >= pageCount - 2) {
    return [
      1, 'ellipsis', pageCount - 3, pageCount - 2, pageCount - 1,
      pageCount
    ];
  }
  return [
    1, 'ellipsis', current - 1, current, current + 1,
    'ellipsis', pageCount
  ];
}

// market-history-feature
export class MarketHistoryFeature {
  static ctx = null;

  static configure(ctx) {
    this.ctx = ctx;
  }

  constructor() {
    this.ctx = MarketHistoryFeature.ctx;
    this.inited = false;
    this.store = createStore();
    this.environment = 'live';
    this.characterId = '';
    this.characterName = '';
    this.saveTimer = null;
    this.buttonAnchor = null;
    this.buttonWrapper = null;
    this.root = null;
    this.toolbarRoot = null;
    this.contentRoot = null;
    this.pendingDeleteKey = null;
    this.popoverDismiss = null;
    this.dialogState = this.createDialogState();
    // 最近一次登录快照（按分桶存订单 id 与快照时间）：数据修复用它判断「进行中但已不在挂单列表」。
    this.listingSnapshots = {};
    // 物品挂牌页速览（订单簿上方的最近成交条）：两个方向的节点与渲染签名（未变化不重建）。
    this.listingHintNodes = {sell: null, buy: null};
    this.listingHintSignature = '';
    this.searchTextCache = new Map();
    this.queryCache = {signature: '', records: []};
    this.statsCache = {signature: '', records: []};
  }

  createDialogState() {
    return {
      view: 'records',
      // 面板内状态（导入 / 导出共用一份，切换视图时可选择重置）。
      panel: {
        exportScope: 'current',
        exportFormat: 'json',
        importText: '',
        importMode: 'merge',
        importOverwriteConfirmed: false,
        importReport: null,
        importError: '',
        // 「数据修复」的勾选类型与上次修复报告（与导入状态一致，不跨次保留）。
        repairSelected: new Set(),
        repairReport: null
      },
      filters: {
        keyword: '',
        categoryKey: 'all',
        statuses: [],
        types: [],
        timePreset: 'all',
        timeFrom: '',
        timeTo: '',
        priceMin: '',
        priceMax: '',
        quantityMin: '',
        quantityMax: ''
      },
      sort: {key: 'createdAt', dir: 'desc'},
      page: 1,
      pageSize: 20,
      // 统计页签自己的状态：筛选条件与记录列表完全独立（不复用列表筛选），
      // 其余几个键是图表维度 / 粒度的选择。
      stats: this.createStatsState(),
      // 勾选的行（记录 key 集合），批量删除只处理这里的行；打开弹窗时清空。
      selected: new Set(),
      // 「更多筛选」展开态与状态下拉面板的展开态（面板不参与重绘，只切换容器类）。
      moreOpen: false,
      openFilterPanel: null
    };
  }

  createStatsState() {
    return {
      filters: {
        timePreset: 'all',
        timeFrom: '',
        timeTo: '',
        side: 'all',
        categoryKey: 'all',
        keyword: ''
      },
      bucket: 'auto',
      rankMetric: 'amount',
      categoryMetric: 'expense',
      composeDim: 'status'
    };
  }

  // ---- 生命周期 ----

  init() {
    const {CONFIG, LanguageEvents, utils} = this.ctx;
    if (!CONFIG.isGameSite || this.inited) return;
    // 同页多实例防重：标记写在页面 window，规则与市场加购一致。
    if (this.ctx.pageWindow.__MST_MARKET_HISTORY_OWNER__) return;
    this.ctx.pageWindow.__MST_MARKET_HISTORY_OWNER__ = true;
    this.inited = true;
    StyleService.ensure('mst-market-history-style', MST_MARKET_HISTORY_CSS);
    this.environment = CONFIG.isTestServer ? 'test' : 'live';
    this.characterId = String(CONFIG.characterId || '');
    // GM 读取是异步接口：监听器先同步挂上、事件按到达时间入队，历史载入后再依次处理。
    // 既避免把「读取中的空存储」写回覆盖已有数据，也避免就绪前（页面加载后的头几秒，
    // 玩家常在这时点「全部收集」）的领取请求与成交消息被丢掉。
    this.ready = false;
    this.eventQueue = [];
    this.wsListeners = {
      init: (event) => this.queueWsEvent('init', event.detail),
      message: (event) => this.queueWsEvent('message', event.detail),
      send: (event) => this.queueWsEvent('send', event.detail)
    };
    window.addEventListener('mst:ws:init-character-data', this.wsListeners.init);
    window.addEventListener('mst:ws:message', this.wsListeners.message);
    window.addEventListener('mst:ws:send', this.wsListeners.send);
    window.addEventListener('pagehide', () => this.flushSave());
    this.loadStore().then(() => {
      this.ready = true;
      if (this.eventQueue.length) {
        const queued = this.eventQueue;
        this.eventQueue = [];
        queued.forEach((item) => this.handleWsEvent(item.kind, item.detail, item.at));
      }
      this.watchStorage();
      utils.observeBody(() => {
        this.syncButton();
        this.syncListingHints();
      });
      this.syncListingHints();
      LanguageEvents?.subscribe(() => this.handleLanguageChange());
      // 兜底：脚本初始化晚于登录快照时，用 DataHub 已保存的角色数据补一次快照对账。
      const rawCharacterData = this.ctx.DataHub?.characterData?.raw;
      if (rawCharacterData) this.onInitCharacterData(rawCharacterData);
    });
  }

  queueWsEvent(kind, detail) {
    const at = Date.now();
    if (!this.ready) {
      this.eventQueue.push({kind, detail, at});
      return;
    }
    this.handleWsEvent(kind, detail, at);
  }

  handleWsEvent(kind, detail, at) {
    if (kind === 'init') this.onInitCharacterData(detail, at);
    else if (kind === 'message') this.onWsMessage(detail, at);
    else this.onWsSend(detail, at);
  }

  async loadStore() {
    try {
      const raw = await this.ctx.GmApi.getValue(this.storageKey(), '');
      this.store = parseStore(raw);
    } catch (error) {
      console.warn('[MST] 市场交易记录读取失败:', error);
      this.store = createStore();
    }
  }

  storageKey() {
    return this.ctx.STORAGE_KEYS?.MARKET_HISTORY || 'MST_MARKET_history';
  }

  watchStorage() {
    const listener = this.ctx.GmApi?.addValueChangeListener?.(
      this.storageKey(),
      (_name, _oldValue, newValue, remote) => {
        if (!remote) return;
        this.mergeExternalStore(newValue);
      }
    );
    this.unwatchStorage = typeof listener === 'function' ? listener : null;
  }

  // 其他标签页写入的变更按主键字段级合并进内存（不回写，避免两侧互相触发）。
  mergeExternalStore(raw) {
    try {
      const external = parseStore(typeof raw === 'string' ? raw : '');
      Object.entries(external.buckets || {}).forEach(
        ([
          key, records
        ]) => {
          const target = this.getRecords(key);
          records.forEach((record) => {
            const index = target.findIndex((item) => item.key === record.key);
            if (index === -1) target.push(record);
            else if (record.updatedAt > target[index].updatedAt) {
              target[index] = this.mergeRecordPair(target[index], record);
            }
          });
        }
      );
      this.refreshOpenDialog();
    } catch (error) {
      console.warn('[MST] 市场交易记录合并外部存储失败:', error);
    }
  }

  mergeRecordPair(left, right) {
    // 复用导入合并的字段级规则（单条）。
    const holder = createStore();
    const key = bucketKey(left.environment, left.characterId);
    holder.buckets[key] = [
      left
    ];
    mergeImport({store: holder, buckets: {[key]: [
          right
        ]}, mode: 'merge', now: Date.now()});
    return holder.buckets[key][0];
  }

  getRecords(key = this.currentBucketKey()) {
    if (!this.store.buckets[key]) this.store.buckets[key] = [];
    return this.store.buckets[key];
  }

  currentBucketKey() {
    return bucketKey(this.environment, this.characterId || 'default');
  }

  scheduleSave() {
    // 记录随时可能因成交 / 领取变化，挂牌页速览跟着刷新（不在物品页时只是一次空查询）。
    this.syncListingHints();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  flushSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // 存储尚未载入时不能写回：此刻的内存数据是空桶，写入会覆盖已有历史（事件已排队，就绪后重放）。
    if (!this.ready) return;
    try {
      this.store.updatedAt = Date.now();
      this.ctx.GmApi.setValue(this.storageKey(), serializeStore(this.store));
    } catch (error) {
      console.warn('[MST] 市场交易记录保存失败:', error);
      this.ctx.Notifier?.toast(this.ctx.i18n.t('marketHistorySaveFailed'), 'error');
    }
  }

  // ---- 官方消息接入 ----

  onInitCharacterData(data, now = Date.now()) {
    const {CONFIG} = this.ctx;
    const nextCharacterId = String(data?.character?.id ?? CONFIG.characterId ?? this.characterId ?? '');
    const changed = nextCharacterId !== this.characterId;
    if (nextCharacterId) this.characterId = nextCharacterId;
    const nextName = String(data?.character?.name || '');
    if (nextName) this.characterName = nextName;
    if (changed) this.dialogState = this.createDialogState();
    const records = this.getRecords();
    // 官方确实下发 myMarketListings 时才拿它补齐与对账；字段缺失时保持 undefined 传给
    // 对账函数（store 侧按「没有快照」处理），不能在这里退化成空数组——空数组等于
    // 「我的挂单一条都不剩」，会把本机记录全部误标为已领取 / 结束。
    const listings = data?.myMarketListings;
    // 快照时间取事件自带的服务器时间：脚本晚于登录事件初始化时（下面用 DataHub 兜底补
    // 一次对账），处理时刻晚于快照本身，用它判断会把「快照之后才观测到」的记录误判成
    // 已不在挂单列表（结束 / 已领取）。
    const snapshotAt = parseIsoTimestamp(data?.currentTimestamp) || now;
    // 快照只用于补齐与对账：新出现的时间按登录时间推断（有官方创建时间则直接用官方值），
    // 已有记录不被覆盖成推断时间；补齐「创建时没收到消息、只在快照里出现」的订单时，
    // 环境与角色取当前会话，避免测试服记录被写进正式服桶。
    applyListingBatch(records, Array.isArray(listings) ? listings : [], now, {
      origin: 'snapshot',
      inferredTime: true,
      environment: this.environment,
      characterId: this.characterId
    });
    const result = reconcileWithSnapshot(records, listings, now, {snapshotAt});
    this.rememberListingSnapshot(listings, snapshotAt);
    if (result.unobserved.length || result.settled.length || changed) {
      console.info('[MST] 市场交易记录快照对账:', {
        records: records.length,
        listings: listings.length,
        unobserved: result.unobserved.length,
        settled: result.settled.length
      });
    }
    this.scheduleSave();
    this.refreshOpenDialog();
  }

  // 记下本会话拿到的登录快照（订单 id 集合与快照取数时间，取官方 currentTimestamp），
  // 供数据修复判断「进行中但已不在挂单列表」的记录；只有快照之后没有再观测过
  // （updatedAt ≤ 快照时间）的记录才用这份快照判断，之后又观测过的记录快照给不出结论
  // （见 store.js 的 repair 段）。
  rememberListingSnapshot(listings, at) {
    if (!Array.isArray(listings)) return;
    this.listingSnapshots[this.currentBucketKey()] = {
      at,
      ids: new Set(listings.map((item) => String(item?.id ?? '')).filter(Boolean))
    };
  }

  onWsMessage(message, now = Date.now()) {
    if (!message || typeof message !== 'object') return;
    if (message.type !== 'market_listings_updated') return;
    const listings = Array.isArray(message.endMarketListings) ? message.endMarketListings : [];
    if (!listings.length) return;
    const records = this.getRecords();
    listings.forEach((listing) => {
      // 直购/直售请求先落记录的，官方条目到达时按内容关联为同一条，再按官方 id 跟踪。
      if (linkInstantRecords(records, listing, now)) return;
      applyListingBatch(
        records,
        [
          listing
        ],
        now,
        {origin: 'update', environment: this.environment, characterId: this.characterId}
      );
    });
    this.scheduleSave();
    this.refreshOpenDialog();
  }

  onWsSend(message, now = Date.now()) {
    if (!message || typeof message !== 'object') return;
    const records = this.getRecords();
    const result = applyOutgoingMessage(records, message, now, {
      environment: this.environment,
      characterId: this.characterId,
      characterName: this.characterName,
      originHost: this.ctx.hostname || ''
    });
    if (!result.changed) return;
    this.scheduleSave();
    this.refreshOpenDialog();
  }

  // ---- 入口按钮（MUI 主标签容器内，与「商品列表 / 我的挂牌」并排） ----

  syncButton() {
    const {GameUiAdapter} = this.ctx;
    const tabBar =
      GameUiAdapter.query('marketplaceTabBar') ||
      GameUiAdapter.query('marketplaceTabBarNested') ||
      GameUiAdapter.query('marketplaceTabBarLegacy');
    if (!tabBar) {
      this.teardownButton();
      return;
    }
    if (this.buttonWrapper?.isConnected) {
      this.updateButtonLabel();
      return;
    }
    this.teardownButton();
    this.buildButton(tabBar);
  }

  buildButton(tabBar) {
    const {i18n} = this.ctx;
    const wrapper = document.createElement('div');
    wrapper.className = 'mst-market-history-entry';
    const label = i18n.t('marketHistoryEntry');
    // 复用游戏 MUI 主标签的公开类名；游戏源码通过这两个前缀统一设置标签尺寸、
    // 圆角、底色、悬停色和前景色，按钮因此与「商品列表 / 我的挂牌」保持同一视觉层级。
    wrapper.innerHTML = `<button type="button" class="mst-market-history-entry-button MuiButtonBase-root MuiTab-root" title="${label}"><span class="mst-market-history-entry-label">${label}</span></button>`;
    tabBar.appendChild(wrapper);
    wrapper.querySelector('.mst-market-history-entry-button')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.open();
    });
    this.buttonAnchor = tabBar;
    this.buttonWrapper = wrapper;
  }

  updateButtonLabel() {
    const {i18n} = this.ctx;
    const button = this.buttonWrapper?.querySelector('.mst-market-history-entry-button');
    if (!button) return;
    const label = i18n.t('marketHistoryEntry');
    const labelElement = button.querySelector('.mst-market-history-entry-label');
    if (labelElement?.textContent !== label) labelElement.textContent = label;
    if (button.getAttribute('title') !== label) button.setAttribute('title', label);
  }

  teardownButton() {
    this.buttonWrapper?.remove();
    this.buttonWrapper = null;
    this.buttonAnchor = null;
  }

  // ---- 物品挂牌页速览（挂牌按钮上方的最近两次成交） ----

  // 进入物品挂牌页（订单簿视图）时，在「+ 新出售挂牌 / + 新购买挂牌」按钮那一行的两端各显示自己
  // 最近两次出售 / 收购的单价（第一次 / 第二次，按创建时间从旧到新）；提示条相对按钮行绝对定位，
  // 不参与按钮行的 flex 布局。物品与强化等级从 MarketplacePanel 的 React state 读取；订单簿容器
  // 只在官方数据到达后才渲染（同时作为「当前是订单簿视图」的判据，物品摘要视图也有按钮行但不显示），
  // 所以由页面观察器反复同步（节点被游戏重渲染清掉后自动补回）。
  syncListingHints() {
    if (!this.ready) return;
    const {DataHub, GameUiAdapter, i18n} = this.ctx;
    const books = GameUiAdapter.query('marketOrderBooks');
    const host = books ? GameUiAdapter.query('marketNewListingButtons') : null;
    const state = books ? readMarketplacePanelState(DataHub.getReactFiber(books)) : null;
    const itemHrid = state?.itemHrid;
    if (!books || !host || !itemHrid) {
      this.teardownListingHints();
      return;
    }
    const level = Math.max(0, Math.floor(Number(state.enhancementLevel) || 0));
    const recent = findRecentTradedRecords(this.getRecords(), itemHrid, level);
    const sides = [
      'sell', 'buy'
    ];
    const signature =
      itemHrid +
      '|' +
      level +
      '|' +
      i18n.locale +
      '|' +
      sides
        .map((side) =>
          recent[side]
            .map((record) => String(record.key || '') + ':' + Number(record.price) + ':' + (record.updatedAt || 0))
            .join(',')
        )
        .join('|');
    if (signature === this.listingHintSignature && this.listingHintsConnected()) return;
    this.removeListingHintNodes();
    this.listingHintSignature = signature;
    sides.forEach((side) => {
      if (!recent[side].length) return;
      const hint = this.buildListingHint(side, recent[side]);
      host.appendChild(hint);
      this.listingHintNodes[side] = hint;
    });
  }

  // 签名没变但游戏重渲染把节点清掉时同样要重建：只要挂上的节点有断开的就不算完整。
  listingHintsConnected() {
    return [
      'sell', 'buy'
    ].every((side) => {
      const node = this.listingHintNodes[side];
      return node == null || node.isConnected;
    });
  }

  // 一侧的提示条：只显示单价、没有文字标签，悬浮给出该条的完整明细。两条按时间从新到旧排
  // （最近的一条在前，第二条是紧挨着的一条）；价格用游戏市场的写法（与订单簿里的价格一致）。
  buildListingHint(side, records) {
    const {utils} = this.ctx;
    const hint = document.createElement('div');
    hint.className = 'mst-market-history-listing-hint mst-market-history-listing-hint-' + side;
    records.forEach((record) => {
      const item = document.createElement('span');
      item.className = 'mst-market-history-listing-hint-item';
      item.title = this.listingHintTitle(record);
      item.textContent = utils.formatMarketplacePrice(record.price);
      hint.append(item);
    });
    return hint;
  }

  // 悬浮明细：类型 + 单价 × 成交数量 + 金额（精确值）+ 创建时间；未确认 / 推断时间等备注照常带上。
  listingHintTitle(record) {
    const {i18n} = this.ctx;
    const lines = [
      i18n.t(
        'marketHistoryListingHintTitle',
        i18n.t(this.typeLabelKey(getRecordType(record))),
        this.rawValueText(record.price),
        this.rawValueText(record.filledQuantity),
        this.rawValueText(getRecordAmount(record)),
        this.formatTime(record.createdAt)
      )
    ];
    const note = this.recordNote(record);
    if (note) lines.push(note);
    return lines.join('\n');
  }

  // 离开订单簿视图（或换物品）时清掉节点；签名一并失效，回来时重建。
  teardownListingHints() {
    this.removeListingHintNodes();
    this.listingHintSignature = '';
  }

  removeListingHintNodes() {
    [
      'sell', 'buy'
    ].forEach((side) => {
      this.listingHintNodes[side]?.remove();
      this.listingHintNodes[side] = null;
    });
  }

  handleLanguageChange() {
    const {i18n} = this.ctx;
    this.updateButtonLabel();
    // Swal 标题在打开时写入，语言切换后需要单独更新；只重绘工具栏与内容区，
    // 不重绘根骨架（避免从工具栏/内容区事件里更新祖先节点造成的 uhtml 状态问题）。
    const title = this.root?.closest('.mst-market-history-dialog')?.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('marketHistoryTitle');
    this.refreshOpenDialog({forceToolbar: true});
  }

  // ---- 数据视图辅助 ----

  itemName(record) {
    const {DataHub, utils} = this.ctx;
    const hrid = record.itemHrid;
    const name = utils.getItemName(hrid) || DataHub.resolveItemName(hrid) || hrid;
    return name;
  }

  itemSearchText(record) {
    const {DataHub} = this.ctx;
    const key = formatItemKey(record.itemHrid, record.enhancementLevel);
    if (this.searchTextCache.has(key)) return this.searchTextCache.get(key);
    const indexes = DataHub?.clientData?.indexes || {};
    const parts = [
      record.itemHrid, String(record.itemHrid || '').replace('/items/', ''), indexes.hridToNameZh?.get?.(record.itemHrid) || '', indexes.hridToNameEn?.get?.(record.itemHrid) || ''
    ];
    const text = parts.filter(Boolean).join(' ').toLowerCase();
    this.searchTextCache.set(key, text);
    return text;
  }

  itemCategoryKey(record) {
    const detail = this.ctx.DataHub?.getItemDetail?.(record.itemHrid);
    const category = String(detail?.categoryHrid || '');
    const base = CATEGORY_BY_ITEM_CATEGORY[category] || '';
    if (base !== 'equipment') return base;
    const type = String(detail?.equipmentDetail?.type || '');
    if (type.includes('tool')) return 'tools';
    if (ACCESSORY_EQUIPMENT_TYPES.includes(type)) return 'accessories';
    return 'equipment';
  }

  itemKeyOf(record) {
    return formatItemKey(record.itemHrid, record.enhancementLevel);
  }

  resolveFilters() {
    const filters = {...this.dialogState.filters};
    applyTimePreset(filters, Date.now());
    return filters;
  }

  visibleRecords() {
    const records = this.getRecords();
    // 候选结果按数据签名缓存：渲染路径只读取缓存，不在每次渲染里重算筛选与排序。
    let latestUpdate = 0;
    records.forEach((record) => {
      if (record.updatedAt > latestUpdate) latestUpdate = record.updatedAt;
    });
    const signature =
      records.length +
      '|' +
      latestUpdate +
      '|' +
      JSON.stringify(this.resolveFilters()) +
      '|' +
      JSON.stringify(this.dialogState.sort);
    if (this.queryCache.signature === signature) return this.queryCache.records;
    const filtered = filterRecords(records, this.resolveFilters(), {
      getSearchText: (record) => this.itemSearchText(record),
      getCategoryKey: (record) => this.itemCategoryKey(record),
      getItemKey: (record) => this.itemKeyOf(record)
    });
    const sorted = sortRecords(filtered, this.dialogState.sort, {getName: (record) => this.itemName(record)});
    this.queryCache = {signature, records: sorted};
    return sorted;
  }

  // 统计页的筛选条件（与列表筛选完全独立）：时间范围按「创建时间」算（与记录页签同一套选项），
  // 另加方向 / 分类 / 关键词。
  resolveStatsFilters() {
    const filters = {...this.dialogState.stats.filters};
    applyTimePreset(filters, Date.now());
    filters.sides = filters.side && filters.side !== 'all' ? [
            filters.side
          ] : [];
    return filters;
  }

  statsRecords() {
    const records = this.getRecords();
    let latestUpdate = 0;
    records.forEach((record) => {
      if (record.updatedAt > latestUpdate) latestUpdate = record.updatedAt;
    });
    const signature = records.length + '|' + latestUpdate + '|' + JSON.stringify(this.resolveStatsFilters());
    if (this.statsCache.signature === signature) return this.statsCache.records;
    // 时间字段按创建时间（filterRecords 的默认口径），与趋势图分桶一致。
    const filtered = filterRecords(records, this.resolveStatsFilters(), {
      getSearchText: (record) => this.itemSearchText(record),
      getCategoryKey: (record) => this.itemCategoryKey(record)
    });
    this.statsCache = {signature, records: filtered};
    return filtered;
  }

  itemLabel(item) {
    const name = this.itemName(item);
    return item.enhancementLevel > 0 ? `${name} +${item.enhancementLevel}` : name;
  }

  getItemIconHref(itemHrid) {
    const {utils} = this.ctx;
    const sprite = utils.getSpriteUrl('items') || '/static/media/items_sprite.f58c9476.svg';
    return `${sprite}#${utils.substrLastSlash(itemHrid)}`;
  }

  formatMoney(value) {
    return this.ctx.utils.formatCompactNumber(Number(value) || 0, 2);
  }

  // 单价列按游戏市场的价格写法展示（与订单簿、挂牌页速览一致）：10 万以下整数、10 万起 K / M / B / T。
  formatUnitPrice(value) {
    return this.ctx.utils.formatMarketplacePrice(value);
  }

  formatTime(value) {
    return value ? this.ctx.utils.formatDateTime(value) : '—';
  }

  statusLabelKey(statusKey) {
    return STATUS_LABEL_KEYS[statusKey] || STATUS_LABEL_KEYS.active;
  }

  typeLabelKey(typeKey) {
    return TYPE_LABEL_KEYS[typeKey] || TYPE_LABEL_KEYS.sellListing;
  }

  statusHint(record) {
    const {i18n} = this.ctx;
    const lines = [
      i18n.t('marketHistoryCreatedAt') +
        '：' +
        this.formatTime(record.createdAt) +
        (record.inferredTime ? `（${i18n.t('marketHistoryInferredTime')}）` : '')
    ];
    if (record.firstFillAt) lines.push(i18n.t('marketHistoryFirstFillAt') + '：' + this.formatTime(record.firstFillAt));
    if (record.filledAt) lines.push(i18n.t('marketHistoryFilledAt') + '：' + this.formatTime(record.filledAt));
    if (record.cancelRequestedAt)
      lines.push(i18n.t('marketHistoryCancelRequestedAt') + '：' + this.formatTime(record.cancelRequestedAt));
    if (record.cancelledAt) lines.push(i18n.t('marketHistoryCancelledAt') + '：' + this.formatTime(record.cancelledAt));
    if (record.expiredAt) lines.push(i18n.t('marketHistoryExpiredAt') + '：' + this.formatTime(record.expiredAt));
    if (record.expiresAt) lines.push(i18n.t('marketHistoryExpiresAt') + '：' + this.formatTime(record.expiresAt));
    if (record.claimRequestedAt)
      lines.push(i18n.t('marketHistoryClaimRequestedAt') + '：' + this.formatTime(record.claimRequestedAt));
    if (record.claimedAt) lines.push(i18n.t('marketHistoryClaimedAt') + '：' + this.formatTime(record.claimedAt));
    if (record.importNote) lines.push(i18n.t('marketHistoryImportNote') + '：' + record.importNote);
    return lines.join('\n');
  }

  // 表格里是 23.7K / 4.96M 这类紧凑写法，title 里给出精确数字。
  rawValueText(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString(this.ctx.i18n.locale);
  }

  // uhtml 的洞不能是 null：数组位收到 null 会抛「Cannot read properties of null」，
  // 条件渲染统一退回空模板，既保持洞的值类型稳定，也避免整块内容渲染中断。
  emptyTemplate() {
    return this.ctx.TemplateRenderer.html``;
  }

  collectedHint(record) {
    const {i18n} = this.ctx;
    const lines = [];
    // 有官方数据时按侧区分（出售=金币、购买=物品件数）；推算金额或已有金币到账时显示金额。
    const collected = getCollectedCount(record);
    const coinLike = record.side === 'sell' || record.collectedEstimated;
    lines.push(
      i18n.t('marketHistoryColumnCollected') +
        '：' +
        (coinLike
          ? this.formatMoney(record.collectedCoinCount) + ' ' + i18n.t('marketHistoryCoin')
          : `${Number(record.collectedItemCount) || 0}`)
    );
    lines.push(i18n.t('marketHistoryRawValue') + '：' + this.rawValueText(collected));
    // 官方税费与挂牌价不符的记录（价格随行情移动、或以更优价成交）：金额来自官方税费允许的
    // 区间下限，悬浮给出区间与税率，列表里的「金额」列按挂牌价计算、只作参考。
    const derived = taxDerivedAmountOf(record);
    if (record.collectedEstimated && !derived) {
      // 购买不扣税，不写「（1 − 0% 税率）」；区间价记录的倒算口径由下面一行说明。
      const rate = Number(record.collectedTaxRate) || 0;
      lines.push(
        rate > 0
          ? i18n.t('marketHistoryCollectedEstimated', Math.round(rate * 100))
          : i18n.t('marketHistoryCollectedEstimatedBuy')
      );
    }
    if (record.taxTaken) {
      lines.push(
        i18n.t('marketHistoryTaxTaken') + '：' + this.formatMoney(record.taxTaken) + ' ' + i18n.t('marketHistoryCoin')
      );
    }
    if (derived) {
      lines.push(
        i18n.t(
          'marketHistoryTaxDerived',
          this.rawValueText(derived.grossLow),
          this.rawValueText(derived.grossHigh),
          String(Math.round(derived.rate * 100))
        )
      );
    }
    // 待领取只是临时中间状态，金额在成交完成时就已计入，不在这里展示。
    (record.claims || []).forEach((claim) => {
      lines.push(
        this.formatTime(claim.at) +
          ' ' +
          (record.side === 'sell' ? this.formatMoney(claim.coinCount) : `${claim.itemCount}`)
      );
    });
    return lines.join('\n');
  }

  recordNote(record) {
    const {i18n} = this.ctx;
    if (isUnconfirmedInstant(record)) return i18n.t('marketHistoryInstantFallback');
    if (record.endedUnobserved) return i18n.t('marketHistoryUnobservedNote');
    if (record.inferredTime) return i18n.t('marketHistoryInferredTime');
    return '';
  }

  // ---- 弹窗 ----

  open() {
    const {Notifier, TemplateRenderer, i18n} = this.ctx;
    this.dialogState.page = 1;
    this.dialogState.openFilterPanel = null;
    this.dialogState.selected = new Set();
    // 导入内容（可能是整份导出文件的大文本）不跨次保留：避免下次打开时渲染大文本造成卡顿，
    // 也避免误把上次的内容当成这次要导入的数据。
    this.resetImportState();
    this.resetRepairState();
    return Notifier.html({
      title: i18n.t('marketHistoryTitle'),
      width: 'min(76rem, calc(100vw - 1rem))',
      popupClass: 'mst-market-history-dialog',
      icon: 'marketplace',
      html: () => TemplateRenderer.html`<div class="mst-market-history-root" id="mst-market-history-root"></div>`,
      didOpen: (popup) => {
        this.root =
          popup?.querySelector('#mst-market-history-root') || document.getElementById('mst-market-history-root');
        this.renderDialog();
      },
      willClose: () => {
        this.root = null;
        this.toolbarRoot = null;
        this.contentRoot = null;
        this.pendingDeleteKey = null;
        // 关闭即释放导入文本与预览结果，不留大字符串在内存里；数据修复的勾选与报告同样清空。
        this.resetImportState();
        this.resetRepairState();
        this.unbindPopoverDismiss();
      }
    });
  }

  // 重置「管理」页签的导入状态（文本、模式、覆盖确认、预览报告与错误提示）。
  resetImportState() {
    const panel = this.dialogState.panel;
    panel.importText = '';
    panel.importMode = 'merge';
    panel.importOverwriteConfirmed = false;
    panel.importReport = null;
    panel.importError = '';
  }

  // 重置「管理」页签的数据修复状态（勾选类型与上次修复报告）。
  resetRepairState() {
    const panel = this.dialogState.panel;
    panel.repairSelected = new Set();
    panel.repairReport = null;
  }

  // 弹窗内所有区域都「每次新建容器再渲染」：本模块模板结构会随状态变化（工具栏按页签显隐、
  // 表格/空态/统计切换），uhtml 在同一容器上做增量更新时会复用旧节点引用，结构变化后更新会报错。
  // 新建容器让 uhtml 每次都是首次渲染，稳定优先；容器很小，代价可接受。
  renderDialog() {
    if (!this.root) return;
    this.root.replaceChildren();
    this.toolbarRoot = null;
    this.contentRoot = null;
    this.renderToolbar();
    this.renderContent();
  }

  // 数据变化时刷新已打开的弹窗：内容区总是重建，工具栏只在 forceToolbar 时重建，
  // 避免键盘输入（关键词 / 区间数字）在实时消息到达时被整块重建打断。
  refreshOpenDialog({forceToolbar = false} = {}) {
    // 记录变化 / 语言切换 / 其他标签页合并都可能改变挂牌页速览（与弹窗是否打开无关）。
    this.syncListingHints();
    if (!this.root?.isConnected) return;
    if (forceToolbar) this.renderToolbar();
    this.renderContent();
  }

  renderToolbar() {
    const {TemplateRenderer} = this.ctx;
    if (!this.root) return;
    const next = document.createElement('div');
    next.className = 'mst-market-history';
    if (this.toolbarRoot?.isConnected) this.toolbarRoot.replaceWith(next);
    else this.root.prepend(next);
    this.toolbarRoot = next;
    TemplateRenderer.render(() => this.toolbarTemplate(), next);
  }

  renderContent() {
    const {TemplateRenderer} = this.ctx;
    if (!this.root) return;
    const next = document.createElement('div');
    next.className = 'mst-market-history-content';
    if (this.contentRoot?.isConnected) this.contentRoot.replaceWith(next);
    else this.root.append(next);
    this.contentRoot = next;
    TemplateRenderer.render(() => this.contentTemplate(), next);
    this.syncSelectAllState();
  }

  // 表头「全选本页」复选框的三种状态（全选 / 半选 / 未选）用 DOM 属性同步，
  // uhtml 只能设置 checked，半选态需要渲染后手动补。
  syncSelectAllState() {
    const box = this.contentRoot?.querySelector('.mst-market-history-select-all');
    if (!box) return;
    const pageKeys = this.currentPageKeys();
    const selectedCount = pageKeys.filter((key) => this.dialogState.selected.has(key)).length;
    box.checked = pageKeys.length > 0 && selectedCount === pageKeys.length;
    box.indeterminate = selectedCount > 0 && selectedCount < pageKeys.length;
  }

  // 工具栏：主筛选行（搜索 / 分类 / 状态 / 类型 / 创建时间 / 更多筛选 / 清除筛选 / 批量删除），
  // 单价与数量收进「更多筛选」按需展开；导入与导出移入「管理」页签，排序只用列头。
  toolbarTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const state = this.dialogState;
    const filters = state.filters;
    const categoryOptions = [
      TemplateRenderer.html`<option value="all">${i18n.t('marketHistoryFilterCategoryAll')}</option>`, ...MARKET_CATEGORY_KEYS.map((key) => TemplateRenderer.html`<option value=${key}>${i18n.t(CATEGORY_LABEL_KEYS[key])}</option>`)
    ];
    const timePresetOptions = TIME_PRESETS.map(
      (key) => TemplateRenderer.html`<option value=${key}>${i18n.t(TIME_PRESET_LABEL_KEYS[key])}</option>`
    );
    const typeOptions = [
      TemplateRenderer.html`<option value="">${i18n.t('marketHistoryFilterTypeAll')}</option>`, ...HISTORY_TYPE_KEYS.map((key) => TemplateRenderer.html`<option value=${key}>${i18n.t(this.typeLabelKey(key))}</option>`)
    ];
    const statusOptions = HISTORY_STATUS_KEYS.map(
      (key) =>
        TemplateRenderer.html`
    <label class="mst-market-history-popover-item">
      <input
        type="checkbox"
        .checked=${filters.statuses.includes(key)}
        @change=${() => this.toggleFilterList('statuses', key)}
      />
      <span>${i18n.t(this.statusLabelKey(key))}</span>
    </label>`
    );
    const statusText = this.filterSummaryText(filters.statuses, (key) => this.statusLabelKey(key));
    const statusTitle = filters.statuses.length
      ? filters.statuses.map((key) => i18n.t(this.statusLabelKey(key))).join('、')
      : i18n.t('marketHistoryFilterAnyHint');
    const moreCount = this.moreFilterCount();
    const selectedCount = this.selectedRecords().length;
    const numberInput = (value, setValue, placeholder) => TemplateRenderer.html`
      <input
        type="number"
        class="mst-market-history-input mst-market-history-number"
        placeholder=${placeholder}
        .value=${value}
        @change=${(event) => {
          setValue(event.target.value);
          state.page = 1;
          this.renderToolbar();
          this.renderContent();
        }}
      />`;
    const tooMany =
      this.getRecords().length >= RECORDS_SOFT_LIMIT || estimateStoreBytes(this.store) >= STORE_BYTES_SOFT_LIMIT;
    const tabs = [
      [
        'records', 'marketHistoryTabRecords'
      ], [
        'stats', 'marketHistoryTabStats'
      ], [
        'manage', 'marketHistoryTabManage'
      ], [
        'help', 'marketHistoryTabHelp'
      ]
    ].map(
      ([
        key, labelKey
      ]) =>
        TemplateRenderer.html`
    <button
      type="button"
      class=${'mst-market-history-tab' + (state.view === key ? ' mst-market-history-tab-active' : '')}
      @click=${() => {
        state.view = key;
        this.pendingDeleteKey = null;
        this.setStatusPanelOpen(false);
        this.refreshOpenDialog({forceToolbar: true});
      }}
    >${i18n.t(labelKey)}</button>`
    );
    return TemplateRenderer.html`
  <div class="mst-market-history-tabs">${tabs}</div>
  ${
    state.view === 'records'
      ? TemplateRenderer.html`
  <div class="mst-market-history-toolbar">
    <div class="mst-market-history-row">
      <input
        type="search"
        class="mst-market-history-input mst-market-history-keyword"
        placeholder=${i18n.t('marketHistoryFilterKeyword')}
        .value=${filters.keyword}
        @input=${(event) => {
          filters.keyword = event.target.value;
          state.page = 1;
          this.renderContent();
        }}
      />
      <select class="mst-market-history-select" .value=${filters.categoryKey} @change=${(event) => {
        filters.categoryKey = event.target.value;
        state.page = 1;
        this.renderToolbar();
        this.renderContent();
      }}>
        ${categoryOptions}
      </select>
      <div
        class=${
          'mst-market-history-multiselect' +
          (state.openFilterPanel === 'status' ? ' mst-market-history-multiselect-open' : '')
        }
      >
        <button
          type="button"
          class="mst-market-history-select-button"
          title=${statusTitle}
          @click=${() => this.setStatusPanelOpen(state.openFilterPanel !== 'status')}
        >
          <span class="mst-market-history-select-label">${i18n.t('marketHistoryFilterStatus')}</span>
          <span class="mst-market-history-select-value">${statusText}</span>
          <span class="mst-market-history-select-caret" aria-hidden="true">▾</span>
        </button>
        <div class="mst-market-history-popover">
          ${statusOptions}
          <div class="mst-market-history-popover-hint">${i18n.t('marketHistoryFilterAnyHint')}</div>
        </div>
      </div>
      <select class="mst-market-history-select" .value=${filters.types[0] || ''} @change=${(event) => {
        filters.types = event.target.value ? [
              event.target.value
            ] : [];
        state.page = 1;
        this.renderToolbar();
        this.renderContent();
      }}>
        ${typeOptions}
      </select>
      <select class="mst-market-history-select" .value=${filters.timePreset} @change=${(event) => {
        filters.timePreset = event.target.value;
        state.page = 1;
        this.renderToolbar();
        this.renderContent();
      }}>
        ${timePresetOptions}
      </select>
      ${
        filters.timePreset === 'custom'
          ? TemplateRenderer.html`
      <input
        type="date"
        class="mst-market-history-input mst-market-history-date"
        .value=${filters.timeFrom}
        @change=${(event) => {
          filters.timeFrom = event.target.value;
          state.page = 1;
          this.renderToolbar();
          this.renderContent();
        }}
      />
      <input
        type="date"
        class="mst-market-history-input mst-market-history-date"
        .value=${filters.timeTo}
        @change=${(event) => {
          filters.timeTo = event.target.value;
          state.page = 1;
          this.renderToolbar();
          this.renderContent();
        }}
      />`
          : null
      }
      <button
        type="button"
        class=${'mst-market-history-button mst-market-history-more-toggle' + (moreCount ? ' mst-market-history-more-active' : '')}
        @click=${() => {
          state.moreOpen = !state.moreOpen;
          this.renderToolbar();
          this.renderContent();
        }}
      >
        ${i18n.t('marketHistoryMoreFilters')}${moreCount ? ` · ${moreCount}` : ''}<span class="mst-market-history-caret" aria-hidden="true">${state.moreOpen ? '▴' : '▾'}</span>
      </button>
      <button
        type="button"
        class="mst-market-history-button mst-market-history-button-ghost"
        @click=${() => this.clearFilters()}
      >
        ${i18n.t('marketHistoryFilterClear')}
      </button>
      <button
        type="button"
        class="mst-market-history-button mst-market-history-button-danger"
        ?disabled=${!selectedCount}
        @click=${() => this.requestBatchDelete()}
      >
        ${this.pendingDeleteKey === '__batch__' ? i18n.t('marketHistoryDeleteConfirmClick', selectedCount) : `${i18n.t('marketHistoryActionDelete')}${selectedCount ? ` (${selectedCount})` : ''}`}
      </button>
    </div>
    ${
      state.moreOpen
        ? TemplateRenderer.html`
    <div class="mst-market-history-row">
      <label class="mst-market-history-inline">
        <span>${i18n.t('marketHistoryFilterPrice')}</span>
        ${numberInput(
          filters.priceMin,
          (value) => {
            filters.priceMin = value;
          },
          i18n.t('marketHistoryFilterMin')
        )}
        <span>—</span>
        ${numberInput(
          filters.priceMax,
          (value) => {
            filters.priceMax = value;
          },
          i18n.t('marketHistoryFilterMax')
        )}
      </label>
      <label class="mst-market-history-inline">
        <span>${i18n.t('marketHistoryFilterQuantity')}</span>
        ${numberInput(
          filters.quantityMin,
          (value) => {
            filters.quantityMin = value;
          },
          i18n.t('marketHistoryFilterMin')
        )}
        <span>—</span>
        ${numberInput(
          filters.quantityMax,
          (value) => {
            filters.quantityMax = value;
          },
          i18n.t('marketHistoryFilterMax')
        )}
      </label>
    </div>`
        : null
    }
    ${
      tooMany
        ? TemplateRenderer.html`
    <div class="mst-market-history-warning">${i18n.t('marketHistoryTooMany', this.getRecords().length)}</div>`
        : null
    }
  </div>`
      : null
  }
`;
  }

  // 筛选项摘要文案：未选=全部，选中一项显示名称，多项显示「首项 +N」。
  filterSummaryText(keys, labelKeyOf) {
    const {i18n} = this.ctx;
    if (!keys.length) return i18n.t('marketHistoryFilterAny');
    if (keys.length === 1) return i18n.t(labelKeyOf(keys[0]));
    return `${i18n.t(labelKeyOf(keys[0]))} +${keys.length - 1}`;
  }

  // 「更多筛选」里生效的条件数，用于折叠态提示。
  moreFilterCount() {
    const filters = this.dialogState.filters;
    let count = 0;
    if (filters.priceMin !== '' || filters.priceMax !== '') count += 1;
    if (filters.quantityMin !== '' || filters.quantityMax !== '') count += 1;
    return count;
  }

  // ---- 勾选与批量删除（只处理勾选的行）----

  currentPageItems() {
    const state = this.dialogState;
    return paginate(this.visibleRecords(), state.page, state.pageSize).items;
  }

  currentPageKeys() {
    return this.currentPageItems().map((record) => record.key);
  }

  selectedRecords() {
    const selected = this.dialogState.selected;
    if (!selected.size) return [];
    return this.getRecords().filter((record) => selected.has(record.key));
  }

  toggleRowSelected(key) {
    const state = this.dialogState;
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    this.pendingDeleteKey = null;
    this.renderToolbar();
    this.renderContent();
  }

  togglePageSelected() {
    const state = this.dialogState;
    const keys = this.currentPageKeys();
    const allSelected = keys.length > 0 && keys.every((key) => state.selected.has(key));
    keys.forEach((key) => {
      if (allSelected) state.selected.delete(key);
      else state.selected.add(key);
    });
    this.pendingDeleteKey = null;
    this.renderToolbar();
    this.renderContent();
  }

  // 批量删除走两次点击确认：第一次按钮切成确认文案，第二次才真正删除勾选的行。
  requestBatchDelete() {
    const selected = this.selectedRecords();
    if (!selected.length) return;
    if (this.pendingDeleteKey === '__batch__') {
      this.deleteSelectedRecords(selected);
      return;
    }
    this.pendingDeleteKey = '__batch__';
    this.renderToolbar();
  }

  deleteSelectedRecords(records = this.selectedRecords()) {
    if (!records.length) return;
    const {i18n} = this.ctx;
    const keys = new Set(records.map((record) => record.key));
    const all = this.getRecords();
    for (let index = all.length - 1; index >= 0; index--) {
      if (keys.has(all[index].key)) all.splice(index, 1);
    }
    keys.forEach((key) => this.dialogState.selected.delete(key));
    this.pendingDeleteKey = null;
    this.scheduleSave();
    this.refreshOpenDialog({forceToolbar: true});
    this.ctx.Notifier?.toast(i18n.t('marketHistoryDeleteDone', keys.size), 'success');
  }

  // 跳页输入：越界收敛到 [1, 页数]。
  goToPage(value) {
    const state = this.dialogState;
    const pageCount = Math.max(1, Math.ceil(this.visibleRecords().length / state.pageSize));
    const next = Math.min(Math.max(1, Math.floor(Number(value) || 1)), pageCount);
    if (next === state.page) {
      this.renderContent();
      return;
    }
    state.page = next;
    this.renderContent();
  }

  // 状态下拉面板：展开态只切换容器类，不重绘工具栏，避免第一次点击外部时把点击目标重建掉。
  setStatusPanelOpen(open) {
    const state = this.dialogState;
    if (!state) return;
    state.openFilterPanel = open ? 'status' : null;
    const holder = this.toolbarRoot?.querySelector('.mst-market-history-multiselect');
    holder?.classList.toggle('mst-market-history-multiselect-open', Boolean(open));
    if (open) this.bindPopoverDismiss();
    else this.unbindPopoverDismiss();
  }

  bindPopoverDismiss() {
    if (this.popoverDismiss) return;
    this.popoverDismiss = (event) => {
      if (event.target?.closest?.('.mst-market-history-multiselect')) return;
      this.setStatusPanelOpen(false);
    };
    document.addEventListener('pointerdown', this.popoverDismiss, true);
  }

  unbindPopoverDismiss() {
    if (!this.popoverDismiss) return;
    document.removeEventListener('pointerdown', this.popoverDismiss, true);
    this.popoverDismiss = null;
  }

  // 内容区：记录表格 / 统计 / 管理（导入导出）/ 帮助（桥接脚本用法；视图在弹窗内切换，不使用嵌套弹窗）。
  contentTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const state = this.dialogState;
    if (state.view === 'stats') return this.statsTemplate();
    if (state.view === 'manage') return this.manageTemplate();
    if (state.view === 'help') return this.helpTemplate();
    const records = this.visibleRecords();
    const page = paginate(records, state.page, state.pageSize);
    state.page = page.page;
    const summary = summarize(page.items);
    const totalSummary = summarize(records);
    if (!this.getRecords().length) {
      return TemplateRenderer.html`<div class="mst-market-history-empty">${i18n.t('marketHistoryEmpty')}</div>`;
    }
    if (!records.length) {
      return TemplateRenderer.html`<div class="mst-market-history-empty">${i18n.t('marketHistoryEmptyFiltered')}</div>`;
    }
    const pageKeys = page.items.map((record) => record.key);
    const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => state.selected.has(key));
    const headerCells = RECORD_COLUMNS.map((column) => {
      const widthStyle = column.width ? `width:${column.width}` : '';
      if (column.key === 'select') {
        return TemplateRenderer.html`
    <th class="mst-market-history-select-head" style=${widthStyle}>
      <input
        type="checkbox"
        class="mst-market-history-select-all"
        title=${i18n.t('marketHistorySelectAllPage')}
        .checked=${allPageSelected}
        @change=${() => this.togglePageSelected()}
      />
    </th>`;
      }
      const classes =
        [
          column.sortable &&
            'mst-market-history-sortable', column.numeric && 'mst-market-history-number-head', state.sort.key === column.key && 'mst-market-history-sorted'
        ]
          .filter(Boolean)
          .join(' ') || null;
      if (!column.sortable)
        return TemplateRenderer.html`<th class=${classes} style=${widthStyle}>${i18n.t(column.labelKey)}</th>`;
      return TemplateRenderer.html`
    <th
      class=${classes}
      style=${widthStyle}
      title=${i18n.t('marketHistorySortHint')}
      @click=${() => this.setSort(column.key)}
    >${i18n.t(column.labelKey)}${state.sort.key === column.key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    });
    // 序号跨页增长：第二页从「每页条数 + 1」开始。
    const startIndex = (page.page - 1) * page.pageSize;
    const rows = page.items.map((record, index) => this.recordRowTemplate(record, startIndex + index + 1));
    const pageSizeOptions = PAGE_SIZE_OPTIONS.map(
      (size) =>
        TemplateRenderer.html`<option value=${String(size)}>${i18n.t('marketHistoryPageSizeOption', String(size))}</option>`
    );
    const pageButtons = paginationItems(page.pageCount, page.page);
    const pageItems = pageButtons.map((item) =>
      item === 'ellipsis'
        ? TemplateRenderer.html`<span class="mst-market-history-page-ellipsis">…</span>`
        : TemplateRenderer.html`
    <button
      type="button"
      class=${'mst-market-history-page' + (item === page.page ? ' mst-market-history-page-active' : '')}
      @click=${() => {
        state.page = item;
        this.renderContent();
      }}
    >${String(item)}</button>`
    );
    // 分页区靠右：跳页、每页条数，留一段空白后是翻页控件。
    const pageSizeSelect = TemplateRenderer.html`
      <select class="mst-market-history-select" .value=${String(state.pageSize)} @change=${(event) => {
        state.pageSize = Number(event.target.value) || 20;
        state.page = 1;
        this.renderContent();
      }}>
        ${pageSizeOptions}
      </select>`;
    const pageJump = TemplateRenderer.html`
      <label class="mst-market-history-inline mst-market-history-page-jump">
        <span>${i18n.t('marketHistoryPageJump')}</span>
        <input
          type="number"
          min="1"
          max=${String(page.pageCount)}
          class="mst-market-history-input mst-market-history-page-jump-input"
          .value=${String(page.page)}
          @change=${(event) => this.goToPage(event.target.value)}
          @keydown=${(event) => {
            if (event.key === 'Enter') this.goToPage(event.target.value);
          }}
        />
        <span>${i18n.t('marketHistoryPageJumpUnit')}</span>
      </label>`;
    return TemplateRenderer.html`
  <div class="mst-market-history-table-wrap">
    <table class="mst-market-history-table mst-market-history-table-records">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="mst-market-history-footer">
    <div class="mst-market-history-summary">
      ${this.summaryGroupTemplate('marketHistoryTotalsPage', summary)}
      ${this.summaryGroupTemplate('marketHistoryTotalsFiltered', totalSummary)}
    </div>
    <div class="mst-market-history-footer-bar">
    <span class="mst-market-history-pager-count">${i18n.t('marketHistoryPagerCount', records.length)}</span>
    <div class="mst-market-history-pagination">
      ${pageJump}
      ${pageSizeSelect}
      <div class="mst-market-history-page-group">
        <button
          type="button"
          class="mst-market-history-page"
          ?disabled=${page.page <= 1}
          @click=${() => {
            state.page = Math.max(1, page.page - 1);
            this.renderContent();
          }}
        >${i18n.t('marketHistoryPagePrev')}</button>
        ${pageItems}
        <button
          type="button"
          class="mst-market-history-page"
          ?disabled=${page.page >= page.pageCount}
          @click=${() => {
            state.page = Math.min(page.pageCount, page.page + 1);
            this.renderContent();
          }}
        >${i18n.t('marketHistoryPageNext')}</button>
      </div>
    </div>
    </div>
  </div>
`;
  }

  recordRowTemplate(record, index) {
    const {TemplateRenderer, i18n} = this.ctx;
    const status = getDisplayStatus(record);
    const type = getRecordType(record);
    const amount = getRecordAmount(record);
    const collected = getCollectedCount(record);
    const filledCount = Number(record.filledQuantity) || 0;
    const orderCount = Number(record.orderQuantity) || 0;
    // 直购按数量显示；已成交与总数一致时只显示一个数字。
    const progress =
      record.kind === 'instant' && record.listingId == null
        ? String(record.orderQuantity)
        : filledCount === orderCount
          ? String(orderCount)
          : `${filledCount} / ${orderCount}`;
    const note = this.recordNote(record);
    const side = record.side;
    // 收入/支出按方向着色：收入（卖出）用正向色、支出（买入）用负向色；0 保持弱化不上色。
    const collectedTone =
      collected > 0 ? (side === 'sell' ? ' mst-market-history-income-cell' : ' mst-market-history-expense-cell') : '';
    const selected = this.dialogState.selected.has(record.key);
    const confirmingDelete = this.pendingDeleteKey === record.key;
    const statusLabel = i18n.t(this.statusLabelKey(status));
    const itemLabel = this.itemLabel(record);
    const endTime = record.filledAt || record.cancelledAt || record.expiredAt;
    // 官方税费与挂牌价不符的记录（价格随行情移动、或以更优价成交）：「金额」列（单价 × 数量）
    // 与真实成交额有出入——给一个星号标记，悬浮里给出官方税费允许的成交额区间。
    const derived = taxDerivedAmountOf(record);
    const amountMark = derived
      ? TemplateRenderer.html`<span
            class="mst-market-history-price-mark"
            title=${i18n.t(
              'marketHistoryTaxDerived',
              this.rawValueText(derived.grossLow),
              this.rawValueText(derived.grossHigh),
              String(Math.round(derived.rate * 100))
            )}
          >*</span>`
      : null;
    // 零值 / 空值弱化，避免「0」「—」与真实数值抢注意力。
    const muted = (text) => TemplateRenderer.html`<span class="mst-market-history-muted">${text}</span>`;
    const money = (value) => (Number(value) ? this.formatMoney(value) : muted('0'));
    const timeCell = (value) => {
      const text = this.formatCellTime(value);
      return text ? TemplateRenderer.html`<span title=${this.formatTime(value)}>${text}</span>` : muted('—');
    };
    return TemplateRenderer.html`
  <tr
    class=${
      'mst-market-history-record-row' +
      (note ? ' mst-market-history-record-row-noted' : '') +
      (selected ? ' mst-market-history-record-row-selected' : '')
    }
    title=${note}
  >
    <td class="mst-market-history-select-cell">
      <input
        type="checkbox"
        class="mst-market-history-row-check"
        .checked=${selected}
        @change=${() => this.toggleRowSelected(record.key)}
      />
    </td>
    <td class="mst-market-history-number-cell">${String(index)}</td>
    <td>
      <span class=${'mst-market-history-status mst-market-history-status-' + status} title=${statusLabel + '\n' + this.statusHint(record)}>
        ${statusLabel}
      </span>
    </td>
    <td>${i18n.t(this.typeLabelKey(type))}</td>
    <td>
      <div class="mst-market-history-item" title=${itemLabel}>
        <svg aria-hidden="true"><use href=${this.getItemIconHref(record.itemHrid)}></use></svg>
        <span>${itemLabel}</span>
      </div>
    </td>
    <td class="mst-market-history-number-cell">${progress}</td>
    <td class="mst-market-history-number-cell" title=${this.rawValueText(record.price)}>${
      Number(record.price) ? this.formatUnitPrice(record.price) : muted('0')
    }</td>
    <td class="mst-market-history-number-cell" title=${this.rawValueText(amount)}>${money(amount)}${amountMark}</td>
    <td class=${'mst-market-history-number-cell' + collectedTone} title=${this.collectedHint(record)}>
      ${money(collected)}
    </td>
    <td>${timeCell(record.createdAt)}</td>
    <td>${timeCell(endTime)}</td>
    <td>
      <button
        type="button"
        class=${'mst-row-remove mst-market-history-row-remove' + (confirmingDelete ? ' mst-market-history-row-remove-armed' : '')}
        title=${i18n.t(confirmingDelete ? 'marketHistoryDeleteConfirmClickOne' : 'marketHistoryActionDeleteOne')}
        aria-label=${i18n.t('marketHistoryActionDeleteOne')}
        @click=${() => this.requestDeleteRecord(record)}
      >&times;</button>
    </td>
  </tr>`;
  }

  // 底栏合计分组：一个范围（本页合计 / 筛选总计）内的「标签 + 数值」，不含条数；
  // 两个分组在宽度允许时同行，放不下时由外层 flex-wrap 换到第二行。
  summaryGroupTemplate(titleKey, summary) {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    // 收入按「金额 / 收入金额」并列（出售要扣税，两个数字不同）；
    // 购买不扣税，支出金额与金额相同，只显示一个数字。
    const items = [
      [
        i18n.t(
          'marketHistoryTotalsFilled'
        ), utils.formatCompactNumber(summary.filledQuantity, 0), this.rawValueText(summary.filledQuantity)
      ], [
        i18n.t(
          'marketHistoryTotalsIncome'
        ), this.formatMoney(summary.nominalSell) + ' / ' + this.formatMoney(summary.collectedCoin), this.rawValueText(summary.nominalSell) + ' / ' + this.rawValueText(summary.collectedCoin)
      ], [
        i18n.t(
          'marketHistoryTotalsExpense'
        ), this.formatMoney(summary.nominalBuy), this.rawValueText(summary.nominalBuy)
      ]
    ];
    return TemplateRenderer.html`
    <span class="mst-market-history-summary-group">
      <span class="mst-market-history-summary-title">${i18n.t(titleKey)}</span>
      ${items.map(
        ([
          label, value, raw
        ]) =>
          TemplateRenderer.html`<span class="mst-market-history-summary-item"><span class="mst-market-history-summary-label">${label}</span><span class="mst-market-history-summary-value" title=${raw}>${value}</span></span>`
      )}
    </span>`;
  }

  // 表格里的时间用短格式（同年省略年份 / 跨年省略时间），完整时间放 title；
  // 表格外的详情、CSV 导出仍用 formatTime 的完整格式。
  formatCellTime(value) {
    if (!value) return null;
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return null;
    const pad = (num) => String(num).padStart(2, '0');
    const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.getFullYear() === new Date().getFullYear()
      ? `${monthDay} ${time}`
      : `${date.getFullYear()}-${monthDay}`;
  }

  // ---- 统计页签（独立筛选 + 图表）----
  //
  // 统计页有自己的一套筛选条件（时间范围 / 方向 / 分类 / 物品关键词），与记录列表的筛选互不影响；
  // 时间口径统一按「创建时间」（与时间范围筛选同源，界面在同一处标注）。图表覆盖四个维度：
  // 时间（收支趋势）、物品（排行 Top 10）、分类（构成环形）、状态与类型（构成环形），
  // 下方保留按物品汇总表给出精确数字。图表全部手绘 SVG，不引入图表库。

  statsFilterBarTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const filters = this.dialogState.stats.filters;
    const timeOptions = TIME_PRESETS.map(
      (key) => TemplateRenderer.html`<option value=${key}>${i18n.t(TIME_PRESET_LABEL_KEYS[key])}</option>`
    );
    const sideOptions = [
      'all', 'sell', 'buy'
    ].map((key) => TemplateRenderer.html`<option value=${key}>${i18n.t(STATS_SIDE_LABEL_KEYS[key])}</option>`);
    const categoryOptions = [
      TemplateRenderer.html`<option value="all">${i18n.t('marketHistoryFilterCategoryAll')}</option>`, ...MARKET_CATEGORY_KEYS.map((key) => TemplateRenderer.html`<option value=${key}>${i18n.t(CATEGORY_LABEL_KEYS[key])}</option>`)
    ];
    const apply = (mutate) => {
      mutate();
      this.renderContent();
    };
    return TemplateRenderer.html`
    <div class="mst-market-history-stats-filters">
      <select
        class="mst-market-history-select"
        .value=${filters.timePreset}
        @change=${(event) =>
          apply(() => {
            filters.timePreset = event.target.value;
          })}
      >${timeOptions}</select>
      ${
        filters.timePreset === 'custom'
          ? TemplateRenderer.html`
      <input
        type="date"
        class="mst-market-history-input mst-market-history-date"
        .value=${filters.timeFrom}
        @change=${(event) =>
          apply(() => {
            filters.timeFrom = event.target.value;
          })}
      />
      <input
        type="date"
        class="mst-market-history-input mst-market-history-date"
        .value=${filters.timeTo}
        @change=${(event) =>
          apply(() => {
            filters.timeTo = event.target.value;
          })}
      />`
          : this.emptyTemplate()
      }
      <label class="mst-market-history-inline">
        <span>${i18n.t('marketHistoryStatsSide')}</span>
        <select
          class="mst-market-history-select"
          .value=${filters.side}
          @change=${(event) =>
            apply(() => {
              filters.side = event.target.value;
            })}
        >${sideOptions}</select>
      </label>
      <label class="mst-market-history-inline">
        <span>${i18n.t('marketHistoryStatsCategory')}</span>
        <select
          class="mst-market-history-select"
          .value=${filters.categoryKey}
          @change=${(event) =>
            apply(() => {
              filters.categoryKey = event.target.value;
            })}
        >${categoryOptions}</select>
      </label>
      <input
        type="search"
        class="mst-market-history-input mst-market-history-keyword"
        placeholder=${i18n.t('marketHistoryFilterKeyword')}
        .value=${filters.keyword}
        @input=${(event) =>
          apply(() => {
            filters.keyword = event.target.value;
          })}
      />
      <button
        type="button"
        class="mst-market-history-button mst-market-history-button-ghost"
        @click=${() => this.clearStatsFilters()}
      >
        ${i18n.t('marketHistoryFilterClear')}
      </button>
    </div>`;
  }

  // 图表切换按钮（粒度 / 指标 / 维度共用一套外观）。
  chartTogglesTemplate(keys, labelKeys, activeKey, onPick) {
    const {TemplateRenderer, i18n} = this.ctx;
    return keys.map(
      (key) =>
        TemplateRenderer.html`
    <button
      type="button"
      class=${'mst-market-history-chart-toggle' + (activeKey === key ? ' mst-market-history-chart-toggle-active' : '')}
      @click=${() => onPick(key)}
    >${i18n.t(labelKeys[key])}</button>`
    );
  }

  statsChartCardTemplate({title, controls, body, legend, note}) {
    const {TemplateRenderer} = this.ctx;
    return TemplateRenderer.html`
    <section class="mst-market-history-chart-card">
      <header class="mst-market-history-chart-head">
        <h4 class="mst-market-history-chart-title">${title}</h4>
        <div class="mst-market-history-chart-controls">${controls}</div>
      </header>
      ${note ? TemplateRenderer.html`<div class="mst-market-history-chart-note">${note}</div>` : this.emptyTemplate()}
      ${body}
      ${legend ? TemplateRenderer.html`<ul class="mst-market-history-chart-legend">${legend}</ul>` : this.emptyTemplate()}
    </section>`;
  }

  // 无数据的卡片也保留维度切换按钮：分类构成这样的图表「没数据」只针对当前指标，
  // 用户要能直接切到另一个指标看，而不是被迫去别处找开关。
  statsEmptyCardTemplate(title, controls = []) {
    const {TemplateRenderer, i18n} = this.ctx;
    return this.statsChartCardTemplate({
      title,
      controls,
      body: TemplateRenderer.html`<div class="mst-market-history-chart-empty">${i18n.t('marketHistoryStatsNoData')}</div>`
    });
  }

  statsLegendItemTemplate({tone, label, value, raw}) {
    const {TemplateRenderer} = this.ctx;
    return TemplateRenderer.html`
    <li class="mst-market-history-chart-legend-item">
      <span class=${'mst-market-history-chart-swatch mst-market-history-chart-swatch-' + tone}></span>
      <span class="mst-market-history-chart-legend-label">${label}</span>
      <span class="mst-market-history-chart-legend-value" title=${raw}>${value}</span>
    </li>`;
  }

  // 收支趋势：按日 / 周 / 月分桶的收支柱 + 净收支折线，纵轴含负值时给出零线。
  statsTrendChartTemplate(records) {
    const {TemplateRenderer, i18n} = this.ctx;
    const state = this.dialogState;
    const series = buildStatsTimeSeries(records, {bucket: state.stats.bucket});
    const buckets = series.buckets;
    const title = i18n.t('marketHistoryStatsTrendTitle');
    const controls = this.chartTogglesTemplate(
      STATS_BUCKET_KEYS,
      STATS_BUCKET_LABEL_KEYS,
      state.stats.bucket,
      (key) => {
        state.stats.bucket = key;
        this.renderContent();
      }
    );
    if (!buckets.length) return this.statsEmptyCardTemplate(title, controls);
    const plot = {x: 58, y: 12, width: 570, height: 150};
    const baseY = plot.y + plot.height;
    const showIncome = buckets.some((entry) => entry.income > 0);
    const showExpense = buckets.some((entry) => entry.expense > 0);
    const showNet = buckets.some((entry) => entry.net !== 0);
    const axis = buildValueAxis({
      min: showNet ? Math.min(0, ...buckets.map((entry) => entry.net)) : 0,
      max: Math.max(0, ...buckets.map((entry) => Math.max(entry.income, entry.expense))),
      tickCount: 4
    });
    const yOf = (value) => baseY - ((value - axis.min) / (axis.max - axis.min)) * plot.height;
    const zeroY = yOf(0);
    const seriesKeys = [];
    if (showIncome) seriesKeys.push('income');
    if (showExpense) seriesKeys.push('expense');
    const layout = layoutBarGroups({count: buckets.length, seriesCount: Math.max(1, seriesKeys.length), plot});
    const labelOf = (entry) => {
      const date = new Date(entry.start);
      const pad = (num) => String(num).padStart(2, '0');
      return series.bucket === 'month'
        ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
        : `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    const tooltipOf = (entry) => [
        labelOf(
          entry
        ), i18n.t('marketHistoryTotalsIncome') + ' ' + this.rawValueText(entry.income), i18n.t('marketHistoryTotalsExpense') + ' ' + this.rawValueText(entry.expense), i18n.t('marketHistoryStatsNet') + ' ' + this.rawValueText(entry.net)
      ].join(' · ');
    const bars = [];
    seriesKeys.forEach((key, seriesIndex) => {
      buckets.forEach((entry, index) => {
        const value = entry[key];
        if (!(value > 0)) return;
        const group = layout[index];
        const top = yOf(value);
        bars.push(TemplateRenderer.svg`
      <rect
        class=${'mst-market-history-chart-bar mst-market-history-chart-bar-' + key}
        x=${svgNumber(group.seriesX[seriesIndex])}
        y=${svgNumber(top)}
        width=${svgNumber(group.width)}
        height=${svgNumber(Math.max(1, zeroY - top))}
      ><title>${tooltipOf(entry)}</title></rect>`);
      });
    });
    const gridLines = axis.ticks.map(
      (tick) => TemplateRenderer.svg`
      <line
        class="mst-market-history-chart-grid-line"
        x1=${svgNumber(plot.x)}
        y1=${svgNumber(yOf(tick))}
        x2=${svgNumber(plot.x + plot.width)}
        y2=${svgNumber(yOf(tick))}
      ></line>
      <text class="mst-market-history-chart-label" x=${svgNumber(plot.x - 6)} y=${svgNumber(yOf(tick) + 3)} text-anchor="end">${this.formatAxisValue(tick)}</text>`
    );
    const labelStep = pickLabelStep(buckets.length, 8);
    const xLabels = templateList(buckets, (entry, index) =>
      index % labelStep === 0
        ? TemplateRenderer.svg`
      <text
        class="mst-market-history-chart-label"
        x=${svgNumber(layout[index].center)}
        y=${svgNumber(baseY + 14)}
        text-anchor="middle"
      >${labelOf(entry)}</text>`
        : null
    );
    const netPoints = showNet
      ? layout.map((group, index) => `${svgNumber(group.center)},${svgNumber(yOf(buckets[index].net))}`).join(' ')
      : '';
    const dots =
      showNet && buckets.length <= 40
        ? templateList(
            buckets,
            (entry, index) =>
              TemplateRenderer.svg`<circle
          class="mst-market-history-chart-dot"
          cx=${svgNumber(layout[index].center)}
          cy=${svgNumber(yOf(entry.net))}
          r="2.4"
        ><title>${tooltipOf(entry)}</title></circle>`
          )
        : [];
    const totals = buckets.reduce(
      (sum, entry) => ({
        income: sum.income + entry.income,
        expense: sum.expense + entry.expense
      }),
      {income: 0, expense: 0}
    );
    const legend = [];
    if (showIncome)
      legend.push(
        this.statsLegendItemTemplate({
          tone: 'income',
          label: i18n.t('marketHistoryTotalsIncome'),
          value: this.formatMoney(totals.income),
          raw: this.rawValueText(totals.income)
        })
      );
    if (showExpense)
      legend.push(
        this.statsLegendItemTemplate({
          tone: 'expense',
          label: i18n.t('marketHistoryTotalsExpense'),
          value: this.formatMoney(totals.expense),
          raw: this.rawValueText(totals.expense)
        })
      );
    if (showNet)
      legend.push(
        this.statsLegendItemTemplate({
          tone: 'net',
          label: i18n.t('marketHistoryStatsNet'),
          value: (totals.income - totals.expense > 0 ? '+' : '') + this.formatMoney(totals.income - totals.expense),
          raw: this.rawValueText(totals.income - totals.expense)
        })
      );
    const note =
      series.bucket !== series.expectedBucket
        ? i18n.t('marketHistoryStatsBucketForced', i18n.t(STATS_BUCKET_LABEL_KEYS[series.bucket]))
        : '';
    return this.statsChartCardTemplate({
      title,
      controls,
      note,
      body: TemplateRenderer.svg`
      <svg class="mst-market-history-chart-svg" viewBox="0 0 640 182" role="img" aria-label=${title}>
        ${gridLines}${showNet ? TemplateRenderer.svg`<polyline class="mst-market-history-chart-net" points=${netPoints}></polyline>` : this.emptyTemplate()}${bars}${dots}${axis.min < 0 ? TemplateRenderer.svg`<line class="mst-market-history-chart-zero" x1=${svgNumber(plot.x)} y1=${svgNumber(zeroY)} x2=${svgNumber(plot.x + plot.width)} y2=${svgNumber(zeroY)}></line>` : this.emptyTemplate()}${xLabels}
      </svg>`,
      legend
    });
  }

  // 物品排行：Top 10 的堆叠横条（出售一段 + 购买一段），指标可切换金额 / 数量 / 笔数。
  statsRankChartTemplate(records) {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    const state = this.dialogState;
    const metric = state.stats.rankMetric;
    const title = i18n.t('marketHistoryStatsRankTitle');
    const controls = this.chartTogglesTemplate(STATS_RANK_METRICS, STATS_RANK_LABEL_KEYS, metric, (key) => {
      state.stats.rankMetric = key;
      this.renderContent();
    });
    const pick = (item) => {
      if (metric === 'quantity') return item.sellFilledQuantity;
      if (metric === 'count') return item.sellCount;
      return item.sellAmount;
    };
    const pickBuy = (item) => {
      if (metric === 'quantity') return item.buyFilledQuantity;
      if (metric === 'count') return item.buyCount;
      return item.buyAmount;
    };
    const items = summarizeByItem(records, {getName: (hrid) => this.itemName({itemHrid: hrid, enhancementLevel: 0})})
      .map((item) => ({...item, sellValue: pick(item), buyValue: pickBuy(item)}))
      .map((item) => ({...item, total: item.sellValue + item.buyValue}))
      .filter((item) => item.total > 0)
      .sort((left, right) => right.total - left.total)
      .slice(0, STATS_RANK_LIMIT);
    if (!items.length) return this.statsEmptyCardTemplate(title, controls);
    const maxValue = items[0].total;
    const valueOf = (value) => (metric === 'amount' ? this.formatMoney(value) : utils.formatCompactNumber(value, 0));
    const rows = items.map((item) => {
      const [
        sellSegment, buySegment
      ] = layoutStackedSegments({
        values: [
          item.sellValue, item.buyValue
        ],
        length: maxValue > 0 ? (item.total / maxValue) * 100 : 0
      });
      return TemplateRenderer.html`
      <div class="mst-market-history-rank-row">
        <div class="mst-market-history-rank-item">
          <svg aria-hidden="true"><use href=${this.getItemIconHref(item.itemHrid)}></use></svg>
          <span>${this.itemLabel(item)}</span>
        </div>
        <div
          class="mst-market-history-rank-track"
          title=${`${i18n.t('marketHistoryStatsSideSell')} ${this.rawValueText(item.sellValue)} · ${i18n.t('marketHistoryStatsSideBuy')} ${this.rawValueText(item.buyValue)}`}
        >
          <span class="mst-market-history-rank-sell" style=${`width:${svgNumber(sellSegment.width)}%`}></span>
          <span class="mst-market-history-rank-buy" style=${`width:${svgNumber(buySegment.width)}%`}></span>
        </div>
        <span class="mst-market-history-rank-value" title=${this.rawValueText(item.total)}>${valueOf(item.total)}</span>
      </div>`;
    });
    return this.statsChartCardTemplate({
      title,
      controls,
      body: TemplateRenderer.html`<div class="mst-market-history-rank">${rows}</div>`,
      legend: [
        this.statsLegendItemTemplate({
          tone: 'income',
          label: i18n.t('marketHistoryStatsSideSell'),
          value: '',
          raw: ''
        }), this.statsLegendItemTemplate({
          tone: 'expense',
          label: i18n.t('marketHistoryStatsSideBuy'),
          value: '',
          raw: ''
        })
      ]
    });
  }

  // 环形图卡片：分类构成 / 记录构成共用；图例给出紧凑数值、占比与精确原值。
  statsDoughnutCardTemplate({title, controls, entries, centerCaption, formatter}) {
    const {TemplateRenderer} = this.ctx;
    if (!entries.length) return this.statsEmptyCardTemplate(title, controls);
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const cx = 92;
    const cy = 92;
    const arcs = layoutDoughnutArcs({
      values: entries.map((entry) => entry.value),
      cx,
      cy,
      outerRadius: 76,
      innerRadius: 48
    });
    const slices = templateList(entries, (entry, index) => {
      const arc = arcs[index];
      if (!arc?.path) return null;
      return TemplateRenderer.svg`
      <path
        class="mst-market-history-chart-slice"
        d=${arc.path}
        fill=${CHART_PALETTE[index % CHART_PALETTE.length]}
        fill-rule="evenodd"
      ><title>${`${entry.label} ${this.rawValueText(entry.value)}（${percentageText(arc.ratio)}）`}</title></path>`;
    });
    const legend = entries.map(
      (entry, index) =>
        TemplateRenderer.html`
    <li class="mst-market-history-chart-legend-item">
      <span
        class="mst-market-history-chart-swatch"
        style=${`background:${CHART_PALETTE[index % CHART_PALETTE.length]}`}
      ></span>
      <span class="mst-market-history-chart-legend-label">${entry.label}</span>
      <span class="mst-market-history-chart-legend-value" title=${this.rawValueText(entry.value)}>${formatter(entry.value)} · ${percentageText(entry.value / total)}</span>
    </li>`
    );
    return this.statsChartCardTemplate({
      title,
      controls,
      body: TemplateRenderer.svg`
      <div class="mst-market-history-chart-body">
        <svg class="mst-market-history-chart-doughnut" viewBox="0 0 184 184" role="img" aria-label=${title}>
          ${slices}
          <text class="mst-market-history-chart-center-value" x=${String(cx)} y=${String(cy - 2)} text-anchor="middle">${formatter(total)}</text>
          <text class="mst-market-history-chart-center-caption" x=${String(cx)} y=${String(cy + 14)} text-anchor="middle">${centerCaption}</text>
        </svg>
        <ul class="mst-market-history-chart-legend">${legend}</ul>
      </div>`
    });
  }

  // 分类构成：按物品分类汇总收入（税后到账/推算）或支出（购买金额）。
  statsCategoryChartTemplate(records) {
    const {i18n} = this.ctx;
    const metric = this.dialogState.stats.categoryMetric;
    const controls = this.chartTogglesTemplate(
      STATS_CATEGORY_METRICS,
      {expense: 'marketHistoryStatsSideBuy', income: 'marketHistoryStatsSideSell'},
      metric,
      (key) => {
        this.dialogState.stats.categoryMetric = key;
        this.renderContent();
      }
    );
    const entries = buildStatsBreakdown(records, {keyOf: (record) => this.itemCategoryKey(record) || 'others'})
      .map((group) => ({
        label: i18n.t(CATEGORY_LABEL_KEYS[group.key] || 'marketHistoryStatsOthers'),
        value: metric === 'income' ? group.income : group.expense
      }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value);
    return this.statsDoughnutCardTemplate({
      title: i18n.t('marketHistoryStatsShareTitle'),
      controls,
      entries,
      centerCaption: metric === 'income' ? i18n.t('marketHistoryTotalsIncome') : i18n.t('marketHistoryTotalsExpense'),
      formatter: (value) => this.formatMoney(value)
    });
  }

  // 记录构成：状态分布 / 类型分布（条数占比）。
  statsComposeChartTemplate(summary) {
    const {i18n} = this.ctx;
    const dim = this.dialogState.stats.composeDim;
    const counts = dim === 'status' ? summary.countsByStatus : summary.countsByType;
    const entries = Object.keys(counts)
      .map((key) => ({
        label: i18n.t(dim === 'status' ? this.statusLabelKey(key) : this.typeLabelKey(key)),
        value: counts[key]
      }))
      .sort((left, right) => right.value - left.value);
    return this.statsDoughnutCardTemplate({
      title: i18n.t('marketHistoryStatsComposeTitle'),
      controls: this.chartTogglesTemplate(STATS_COMPOSE_DIMS, STATS_COMPOSE_LABEL_KEYS, dim, (key) => {
        this.dialogState.stats.composeDim = key;
        this.renderContent();
      }),
      entries,
      centerCaption: i18n.t('marketHistoryTotalsCount'),
      formatter: (value) => String(value)
    });
  }

  // 按物品汇总表：给出图表背后的精确数字（出售 / 购买金额与收入分开列）。
  statsItemTableTemplate(records) {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    const items = summarizeByItem(records, {
      getName: (hrid) => this.itemName({itemHrid: hrid, enhancementLevel: 0})
    }).sort((left, right) => right.amount - left.amount);
    const rows = items.map(
      (item) =>
        TemplateRenderer.html`
    <tr>
      <td>
        <div class="mst-market-history-item">
          <svg aria-hidden="true"><use href=${this.getItemIconHref(item.itemHrid)}></use></svg>
          <span>${this.itemLabel(item)}</span>
        </div>
      </td>
      <td class="mst-market-history-number-cell" title=${this.rawValueText(item.count)}>${String(item.count)}</td>
      <td class="mst-market-history-number-cell" title=${this.rawValueText(item.filledQuantity)}>${utils.formatCompactNumber(item.filledQuantity, 0)}</td>
      <td class="mst-market-history-number-cell" title=${this.rawValueText(item.weightedPrice)}>${this.formatUnitPrice(
        item.weightedPrice
      )}</td>
      <td class="mst-market-history-number-cell" title=${this.rawValueText(item.sellAmount)}>${this.formatMoney(item.sellAmount)}</td>
      <td class="mst-market-history-number-cell" title=${this.rawValueText(item.buyAmount)}>${this.formatMoney(item.buyAmount)}</td>
      <td class="mst-market-history-number-cell mst-market-history-income-cell" title=${this.rawValueText(item.income)}>${this.formatMoney(item.income)}</td>
    </tr>`
    );
    return TemplateRenderer.html`
    <div class="mst-market-history-chart-card">
      <header class="mst-market-history-chart-head">
        <h4 class="mst-market-history-chart-title">${i18n.t('marketHistoryStatsTableTitle')}</h4>
      </header>
      <div class="mst-market-history-table-wrap mst-market-history-stats-table-wrap">
        <table class="mst-market-history-table mst-market-history-stats-table">
          <thead>
            <tr>
              <th>${i18n.t('marketHistoryColumnItem')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryTotalsCount')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryTotalsFilled')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryStatsWeightedPrice')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryTotalsSell')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryTotalsBuy')}</th>
              <th class="mst-market-history-number-head">${i18n.t('marketHistoryTotalsIncome')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  statsTemplate() {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    const filterBar = this.statsFilterBarTemplate();
    const records = this.statsRecords();
    if (!this.getRecords().length) {
      return TemplateRenderer.html`
  <div class="mst-market-history-stats">
    ${filterBar}
    <div class="mst-market-history-empty">${i18n.t('marketHistoryEmpty')}</div>
  </div>`;
    }
    if (!records.length) {
      return TemplateRenderer.html`
  <div class="mst-market-history-stats">
    ${filterBar}
    <div class="mst-market-history-empty">${i18n.t('marketHistoryEmptyFiltered')}</div>
  </div>`;
    }
    const summary = summarize(records);
    const net = summary.net;
    const overviewItems = [
      [
        i18n.t('marketHistoryTotalsCount'), String(summary.count), String(summary.count), ''
      ], [
        i18n.t(
          'marketHistoryTotalsFilled'
        ), utils.formatCompactNumber(summary.filledQuantity, 0), this.rawValueText(summary.filledQuantity), ''
      ], [
        i18n.t(
          'marketHistoryTotalsIncome'
        ), this.formatMoney(summary.collectedCoin), this.rawValueText(summary.collectedCoin), ''
      ], [
        i18n.t(
          'marketHistoryTotalsExpense'
        ), this.formatMoney(summary.nominalBuy), this.rawValueText(summary.nominalBuy), ''
      ], [
        i18n.t(
          'marketHistoryStatsNet'
        ), (net > 0 ? '+' : '') + this.formatMoney(net), this.rawValueText(net), net > 0 ? ' mst-market-history-stat-positive' : net < 0 ? ' mst-market-history-stat-negative' : ''
      ]
    ].map(
      ([
        label, value, raw, tone
      ]) =>
        TemplateRenderer.html`
    <div class="mst-market-history-stat">
      <span class="mst-market-history-stat-label">${label}</span>
      <span class=${'mst-market-history-stat-value' + tone} title=${raw}>${value}</span>
    </div>`
    );
    return TemplateRenderer.html`
  <div class="mst-market-history-stats">
    ${filterBar}
    <div class="mst-market-history-stats-grid">${overviewItems}</div>
    <div class="mst-market-history-chart-grid">
      ${this.statsTrendChartTemplate(records)}${this.statsRankChartTemplate(records)}${this.statsCategoryChartTemplate(records)}${this.statsComposeChartTemplate(summary)}
    </div>
    ${this.statsItemTableTemplate(records)}
  </div>`;
  }

  formatAxisValue(value) {
    return this.ctx.utils.formatCompactNumber(Number(value) || 0, 1);
  }

  clearStatsFilters() {
    this.dialogState.stats.filters = this.createStatsState().filters;
    this.renderContent();
  }

  // ---- 交互 ----

  clearFilters() {
    const state = this.dialogState;
    const keepPageSize = state.pageSize;
    this.dialogState = {...this.createDialogState(), view: state.view, pageSize: keepPageSize};
    this.pendingDeleteKey = null;
    this.unbindPopoverDismiss();
    this.refreshOpenDialog({forceToolbar: true});
  }

  toggleFilterList(field, key) {
    const list = this.dialogState.filters[field];
    const index = list.indexOf(key);
    if (index === -1) list.push(key);
    else list.splice(index, 1);
    this.dialogState.page = 1;
    this.renderToolbar();
    this.renderContent();
  }

  setSort(key) {
    const state = this.dialogState;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.sort.key = key;
      state.sort.dir = 'desc';
    }
    this.renderToolbar();
    this.renderContent();
  }

  // 单条删除用「两次点击确认」：第一次把按钮切换成确认文案，第二次才真正删除。
  // 不用 SweetAlert 确认框——弹窗内再开 Swal 会把当前弹窗顶掉。
  requestDeleteRecord(record) {
    if (this.pendingDeleteKey === record.key) {
      this.deleteRecord(record);
      return;
    }
    this.pendingDeleteKey = record.key;
    this.renderContent();
  }

  deleteRecord(record) {
    const {i18n} = this.ctx;
    const records = this.getRecords();
    const index = records.findIndex((item) => item.key === record.key);
    if (index >= 0) records.splice(index, 1);
    this.pendingDeleteKey = null;
    this.scheduleSave();
    this.refreshOpenDialog();
    this.ctx.Notifier?.toast(i18n.t('marketHistoryDeleteDone', 1), 'success');
  }

  // ---- 视图切换与「管理」页签（导入 / 导出）----

  // 视图在弹窗内切换，不用嵌套弹窗（SweetAlert2 同一实例只能显示一个 popup，嵌套会顶掉主弹窗）。
  setView(view, {reset = false} = {}) {
    const state = this.dialogState;
    state.view = view;
    if (reset) state.panel = this.createDialogState().panel;
    this.pendingDeleteKey = null;
    this.setStatusPanelOpen(false);
    this.refreshOpenDialog({forceToolbar: true});
  }

  // 管理页签：导入、导出与数据修复三块（原工具栏按钮），各自独立成区。
  manageTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    return TemplateRenderer.html`
  <div class="mst-market-history-aux-body mst-market-history-manage">
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryImportTitle')}</span>
      </div>
      ${this.importFormTemplate()}
    </section>
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryExportTitle')}</span>
      </div>
      ${this.exportFormTemplate()}
    </section>
    ${this.repairFormTemplate()}
  </div>`;
  }

  // 帮助页签：食用工具桥接脚本的接入与两个方向的数据迁移步骤。
  helpTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const step = (text) => TemplateRenderer.html`<li class="mst-market-history-help-step">${text}</li>`;
    const note = (key) => TemplateRenderer.html`<li class="mst-market-history-help-note">${i18n.t(key)}</li>`;
    return TemplateRenderer.html`
  <div class="mst-market-history-aux-body mst-market-history-manage mst-market-history-help">
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryHelpBridgeTitle')}</span>
      </div>
      <ol class="mst-market-history-help-steps">
        ${step(i18n.t('marketHistoryHelpBridgeStep1'))}
        <li class="mst-market-history-help-step">
          <div class="mst-market-history-help-code-row">
            <code class="mst-market-history-help-code">${EDIBLE_BRIDGE_REQUIRE_LINE}</code>
            <button
              type="button"
              class="mst-market-history-button"
              @click=${() => this.copyBridgeRequireLine()}
            >${i18n.t('marketHistoryHelpBridgeCopy')}</button>
          </div>
          <div class="mst-market-history-aux-note">${i18n.t('marketHistoryHelpBridgePinned')}</div>
        </li>
        ${step(i18n.t('marketHistoryHelpBridgeStep2'))} ${step(i18n.t('marketHistoryHelpBridgeStep3'))}
      </ol>
      <div class="mst-market-history-aux-note">${i18n.t('marketHistoryHelpBridgeResult')}</div>
    </section>
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryHelpExportTitle')}</span>
      </div>
      <ol class="mst-market-history-help-steps">
        ${step(i18n.t('marketHistoryHelpExportStep1'))} ${step(i18n.t('marketHistoryHelpExportStep2'))} ${step(i18n.t('marketHistoryHelpExportStep3'))}
      </ol>
      <div class="mst-market-history-aux-note">${i18n.t('marketHistoryHelpExportResult')}</div>
    </section>
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryHelpTransferTitle')}</span>
      </div>
      <div class="mst-market-history-aux-hint">${i18n.t('marketHistoryHelpTransferBody')}</div>
    </section>
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryHelpNotesTitle')}</span>
      </div>
      <ul class="mst-market-history-help-notes">
        ${note('marketHistoryHelpNoteScope')} ${note('marketHistoryHelpNoteOfficial')} ${note('marketHistoryHelpNoteEnvironment')} ${note('marketHistoryHelpNoteBackup')}
      </ul>
    </section>
  </div>`;
  }

  async copyBridgeRequireLine() {
    const {i18n, utils, Notifier} = this.ctx;
    try {
      await utils.writeClipboard(EDIBLE_BRIDGE_REQUIRE_LINE);
      Notifier?.toast(i18n.t('marketHistoryHelpBridgeCopied'), 'success');
    } catch (error) {
      Notifier?.toast(i18n.t('clipboardWriteFailed', error?.message || error), 'error');
    }
  }

  exportFormTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const panel = this.dialogState.panel;
    const scopeOptions = Object.keys(EXPORT_SCOPE_LABEL_KEYS).map(
      (key) =>
        TemplateRenderer.html`
    <label class="mst-market-history-checkbox">
      <input
        type="radio"
        name="mst-market-history-export-scope"
        .checked=${panel.exportScope === key}
        @change=${() => {
          panel.exportScope = key;
          this.refreshOpenDialog({forceToolbar: true});
        }}
      />
      <span>${i18n.t(EXPORT_SCOPE_LABEL_KEYS[key])}</span>
    </label>`
    );
    const formatOptions = Object.keys(EXPORT_FORMAT_LABEL_KEYS).map(
      (key) =>
        TemplateRenderer.html`
    <label class="mst-market-history-checkbox">
      <input
        type="radio"
        name="mst-market-history-export-format"
        .checked=${panel.exportFormat === key}
        @change=${() => {
          panel.exportFormat = key;
          this.refreshOpenDialog({forceToolbar: true});
        }}
      />
      <span>${i18n.t(EXPORT_FORMAT_LABEL_KEYS[key])}</span>
    </label>`
    );
    const characterCount = Object.values(this.store.buckets || {}).reduce((sum, records) => sum + records.length, 0);
    return TemplateRenderer.html`
    <div class="mst-market-history-aux-group">${scopeOptions}</div>
    <div class="mst-market-history-aux-group">${formatOptions}</div>
    <div class="mst-market-history-aux-hint">${i18n.t('marketHistoryExportHint', this.getRecords().length, characterCount)}</div>
    <div class="mst-market-history-aux-actions">
      <button type="button" class="mst-market-history-button" @click=${() => this.applyExport()}>
        ${i18n.t('marketHistoryExportApply')}
      </button>
      <span class="mst-market-history-aux-note">${i18n.t('marketHistoryExportPrivacy')}</span>
    </div>`;
  }

  applyExport() {
    const {i18n, utils} = this.ctx;
    const panel = this.dialogState.panel;
    const now = Date.now();
    if (panel.exportFormat === 'csv') {
      // CSV 只导出当前筛选结果，供表格工具查看，不支持导入。
      this.downloadCsv(this.visibleRecords());
      return;
    }
    const payload = buildExportPayload(this.store, {
      bucketKeys: panel.exportScope === 'all' ? null : [
              this.currentBucketKey()
            ],
      now,
      environment: this.environment,
      characterId: this.characterId
    });
    const name = panel.exportScope === 'all' ? 'all' : this.characterName || this.characterId || 'all';
    this.download(
      JSON.stringify(payload),
      'application/json',
      i18n.t('marketHistoryExportFileName', name) + '_' + utils.formatLocalFileTime() + '.json'
    );
    this.ctx.Notifier?.toast(i18n.t('marketHistoryExportDone'), 'success');
  }

  downloadCsv(records) {
    const {i18n, utils} = this.ctx;
    const escape = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const header = [
      i18n.t(
        'marketHistoryColumnStatus'
      ), i18n.t('marketHistoryColumnType'), i18n.t('marketHistoryColumnItem'), i18n.t('marketHistoryColumnProgress'), i18n.t('marketHistoryColumnPrice'),
      i18n.t(
        'marketHistoryColumnNominal'
      ), i18n.t('marketHistoryColumnCollected'), i18n.t('marketHistoryColumnCreatedAt'), i18n.t('marketHistoryColumnFilledAt')
    ];
    const rows = records.map((record) => [
      i18n.t(
        this.statusLabelKey(getDisplayStatus(record))
      ), i18n.t(this.typeLabelKey(getRecordType(record))), this.itemLabel(record), `${record.filledQuantity} / ${record.orderQuantity}`, record.price,
      getRecordAmount(
        record
      ), getCollectedCount(record), this.formatTime(record.createdAt), this.formatTime(getSortTimestamp(record, 'filledAt'))
    ]);
    const csv =
      '\ufeff' +
      [
        header, ...rows
      ]
        .map((row) => row.map(escape).join(','))
        .join('\r\n');
    this.download(
      csv,
      'text/csv;charset=utf-8;',
      i18n.t('marketHistoryCsvFileName') + '_' + utils.formatLocalFileTime() + '.csv'
    );
  }

  download(content, type, fileName) {
    const blob = new Blob(
      [
        content
      ],
      {type}
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  importFormTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const panel = this.dialogState.panel;
    const modeOptions = Object.keys(IMPORT_MODE_LABEL_KEYS).map(
      (key) =>
        TemplateRenderer.html`
    <label class="mst-market-history-checkbox">
      <input
        type="radio"
        name="mst-market-history-import-mode"
        .checked=${panel.importMode === key}
        @change=${() => {
          panel.importMode = key;
          panel.importOverwriteConfirmed = false;
          panel.importReport = null;
          this.refreshOpenDialog({forceToolbar: true});
        }}
      />
      <span>${i18n.t(IMPORT_MODE_LABEL_KEYS[key])}</span>
    </label>`
    );
    const report = panel.importReport;
    return TemplateRenderer.html`
    <div class="mst-market-history-row">
      <input
        type="file"
        accept="application/json,.json"
        class="mst-market-history-file"
        @change=${(event) => this.handleImportFile(event)}
      />
    </div>
    <textarea
      class="mst-market-history-textarea"
      placeholder=${i18n.t('marketHistoryImportPaste')}
      .value=${panel.importText}
      @input=${(event) => {
        panel.importText = event.target.value;
        panel.importReport = null;
      }}
    ></textarea>
    <div class="mst-market-history-aux-group">${modeOptions}</div>
    ${
      panel.importMode === 'overwrite'
        ? TemplateRenderer.html`
    <label class="mst-market-history-checkbox">
      <input
        type="checkbox"
        .checked=${panel.importOverwriteConfirmed}
        @change=${(event) => {
          panel.importOverwriteConfirmed = event.target.checked;
          this.refreshOpenDialog({forceToolbar: true});
        }}
      />
      <span>${i18n.t('marketHistoryImportOverwriteConfirm')}</span>
    </label>`
        : null
    }
    ${panel.importError ? TemplateRenderer.html`<div class="mst-market-history-error">${panel.importError}</div>` : null}
    ${
      report
        ? TemplateRenderer.html`
    <div class="mst-market-history-aux-hint">
      ${i18n.t('marketHistoryImportReport', report.added, report.updated, report.deduped, report.conflicts, report.skipped ?? 0)}
    </div>`
        : null
    }
    <div class="mst-market-history-aux-actions">
      <button type="button" class="mst-market-history-button" @click=${() => this.previewImport()}>
        ${i18n.t('marketHistoryImportPreview')}
      </button>
      <button
        type="button"
        class="mst-market-history-button"
        ?disabled=${!report || (panel.importMode === 'overwrite' && !panel.importOverwriteConfirmed)}
        @click=${() => this.applyImport()}
      >
        ${i18n.t('marketHistoryImportApply')}
      </button>
      <span class="mst-market-history-aux-note">${i18n.t('marketHistoryImportHint')}</span>
    </div>`;
  }

  handleImportFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // 弹窗已关闭（root 置空）或已离开「管理」页签：丢弃读取结果，
      // 否则关闭后异步回调仍会把大文本写回内存、下次打开又重新显示。
      if (!this.root || this.dialogState.view !== 'manage') return;
      const panel = this.dialogState.panel;
      panel.importText = String(reader.result || '');
      panel.importReport = null;
      panel.importError = '';
      this.refreshOpenDialog({forceToolbar: true});
    };
    reader.readAsText(file);
  }

  previewImport() {
    const panel = this.dialogState.panel;
    panel.importError = '';
    panel.importReport = null;
    const parsed = parseImportPayload(panel.importText);
    if (!parsed.ok) {
      panel.importError = this.importErrorText(parsed.reason);
      this.refreshOpenDialog({forceToolbar: true});
      return;
    }
    const previewStore = parseStore(serializeStore(this.store));
    const result = mergeImport({
      store: previewStore,
      buckets: parsed.buckets,
      mode: panel.importMode,
      now: Date.now()
    });
    panel.importReport = {...result.report, skipped: parsed.skipped};
    this.refreshOpenDialog({forceToolbar: true});
  }

  applyImport() {
    const {i18n} = this.ctx;
    const panel = this.dialogState.panel;
    const parsed = parseImportPayload(panel.importText);
    if (!parsed.ok) {
      panel.importError = this.importErrorText(parsed.reason);
      this.refreshOpenDialog({forceToolbar: true});
      return;
    }
    const result = mergeImport({
      store: this.store,
      buckets: parsed.buckets,
      mode: panel.importMode,
      now: Date.now()
    });
    this.store = result.store;
    this.scheduleSave();
    panel.importReport = {...result.report, skipped: parsed.skipped};
    this.refreshOpenDialog({forceToolbar: true});
    this.ctx.Notifier?.toast(i18n.t('marketHistoryImportDone'), 'success');
  }

  importErrorText(reason) {
    const {i18n} = this.ctx;
    if (reason === 'unsupported-version') return i18n.t('marketHistoryImportErrorVersion');
    if (reason === 'no-records') return i18n.t('marketHistoryImportErrorEmpty');
    return i18n.t('marketHistoryImportErrorFormat');
  }

  // ---- 数据修复（「管理」页签的第三块）----

  // 数据修复区：扫描全部角色与环境的记录，按类型勾选后一次性修复；修复前可先在导出区备份。
  // 条数来自只读扫描（store.js 的 scanStoreRepairs），没问题的类型复选框置灰不可勾选。
  repairFormTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const panel = this.dialogState.panel;
    const counts = this.repairCounts();
    const total = REPAIR_TYPE_KEYS.reduce((sum, type) => sum + (counts[type] || 0), 0);
    const options = REPAIR_TYPE_KEYS.map((type) => {
      const count = counts[type] || 0;
      return TemplateRenderer.html`
    <label class="mst-market-history-checkbox">
      <input
        type="checkbox"
        .checked=${count > 0 && panel.repairSelected.has(type)}
        ?disabled=${count === 0}
        @change=${(event) => {
          if (event.target.checked) panel.repairSelected.add(type);
          else panel.repairSelected.delete(type);
          this.refreshOpenDialog();
        }}
      />
      <span>${i18n.t(REPAIR_LABEL_KEYS[type], count)}</span>
    </label>`;
    });
    const report = panel.repairReport;
    const reportLines = report
      ? REPAIR_TYPE_KEYS.filter((type) => report[type] > 0).map(
          (type) => TemplateRenderer.html`
    <div class="mst-market-history-aux-hint">${i18n.t(REPAIR_RESULT_KEYS[type], report[type])}</div>`
        )
      : [];
    const selectedCount = REPAIR_TYPE_KEYS.filter(
      (type) => (counts[type] || 0) > 0 && panel.repairSelected.has(type)
    ).length;
    return TemplateRenderer.html`
    <section class="mst-market-history-manage-section">
      <div class="mst-market-history-aux-head">
        <span class="mst-market-history-aux-title">${i18n.t('marketHistoryRepairTitle')}</span>
      </div>
      <div class="mst-market-history-aux-hint">${i18n.t('marketHistoryRepairHint')}</div>
      ${
        total > 0
          ? TemplateRenderer.html`
    <div class="mst-market-history-aux-group">${options}</div>`
          : TemplateRenderer.html`
    <div class="mst-market-history-aux-hint">${i18n.t('marketHistoryRepairNothing')}</div>`
      }
      ${reportLines}
      <div class="mst-market-history-aux-actions">
        <button
          type="button"
          class="mst-market-history-button"
          ?disabled=${selectedCount === 0}
          @click=${() => this.applyRepair()}
        >${i18n.t('marketHistoryRepairApply')}</button>
      </div>
    </section>`;
  }

  // 数据修复的扫描结果（只读）：全部角色与环境分桶的问题条数合计；
  // 「进行中但已不在挂单列表」按本会话拿到的登录快照判断，没有快照的分桶这一类恒为 0。
  repairCounts() {
    return scanStoreRepairs(this.store, {snapshots: this.listingSnapshots});
  }

  // 应用数据修复：只处理本次勾选且确实有问题的类型，逐桶修复后整体保存，并按类型给出改动条数。
  applyRepair() {
    const {i18n, Notifier} = this.ctx;
    const panel = this.dialogState.panel;
    const counts = this.repairCounts();
    const selected = REPAIR_TYPE_KEYS.filter((type) => (counts[type] || 0) > 0 && panel.repairSelected.has(type));
    if (!selected.length) return;
    const now = Date.now();
    const report = createRepairReport();
    Object.keys(this.store.buckets || {}).forEach((bucket) => {
      const result = repairRecords(this.store.buckets[bucket], selected, {
        now,
        snapshot: this.listingSnapshots[bucket] || null
      });
      if (result.records.length) this.store.buckets[bucket] = result.records;
      else delete this.store.buckets[bucket];
      REPAIR_TYPE_KEYS.forEach((type) => {
        report[type] += result.report[type];
      });
    });
    panel.repairReport = report;
    panel.repairSelected = new Set();
    this.scheduleSave();
    this.refreshOpenDialog();
    Notifier?.toast(i18n.t('marketHistoryRepairDone'), 'success');
  }
}
