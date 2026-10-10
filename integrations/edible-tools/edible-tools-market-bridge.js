// ==UserScript==
// @name         [银河奶牛]食用工具 ↔ MST 市场数据桥接
// @name:en      Edible Tools ↔ MST Market Data Bridge
// @namespace    mwi-sunrishe-toolkit
// @version      1.2.0
// @description  在食用工具「银河奶牛数据库 → 市场数据」页加导出/导入按钮：统一用 MST 的市场交易记录格式，可迁移到 MST，也可在食用工具之间迁移（导入时选合并或覆盖）。
// @description:en Adds "Export to MST" / "Import from MST" buttons to Edible Tools' Market Data page.
// @author       Sunrishe
// @license      MIT
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// 使用方式：把本文件用 @require 引入食用工具（按钮才会出现在它的「市场数据」页）：
//   1) 在食用工具的脚本头里加一行（本地文件或部署到网上的 https 地址都行）：
//        // @require file:///你的路径/edible-tools-market-bridge.js
//   2) 保存后打开食用工具的设置面板 → 银河奶牛数据库 → 市场数据，
//      在「仅保留已完成订单」后面出现两个按钮：
//        「导出到 MST 交易记录」：把 market_list 导出成 MST 的市场交易记录格式（唯一格式），
//          MST 里用「导入」选它，另一台设备的食用工具用「导入到食用工具」选它也可以；
//        「导入到食用工具」：读取上面那份 MST 格式 JSON，转换成食用工具条目后再用
//          prompt 选导入方式（1 = 合并，2 = 覆盖），覆盖另有 confirm 二次确认。
//      只做食用工具之间的迁移时不需要 MST：A 设备导出 → B 设备导入并选合并/覆盖。
// 原理：@require 的代码运行在食用工具的沙箱里，能用 GM_getValue/GM_setValue 读写它自己的
// market_list；油猴的 GM 存储按脚本隔离，所以这一步是绕开隔离的唯一办法。
// 单独安装本文件为独立脚本不会读到食用工具的数据（存储互相隔离），本文件自带头部只是为了
// 方便本地管理与版本识别；请用 @require 方式接入。
//
// 设计口径（与 MST 市场交易记录一致，见 docs/analysis/市场交易记录需求说明书.md）：
// - 食用工具 market_list 的条目就是官方挂牌对象的原文（另加 lastUpdated）。
// - 官方字段 createdTimestamp / expirationTimestamp / characterID / taxTaken 都会保留；
//   领取与实际到账食用工具没有记录，导出给 MST 时按 0 处理——MST 会对这类缺少官方到账线索的
//   历史记录按成交当时的市场税率推算实际到账并标注（推算只写进 MST，不回流食用工具）。
// - 写入食用工具的条目保持食用工具自身的结构，不追加任何自定义字段；MST 的「环境」与
//   「立即购买/立即出售」类型在食用工具条目里没有对应字段，导出时环境按当前所在页面判定、
//   类型一律记为挂牌（直购记录经食用工具中转后分类会变成挂牌，金额与状态不受影响）。
// - 首次成交时间食用工具没有独立记录，有成交（已成交数量 > 0）时用 lastUpdated 近似。
// - MST 记录里的直购/直售兜底记录（没有官方订单 id）无法表达成食用工具的条目，导入时跳过并计数。

(() => {
  'use strict';

  const MARKET_LIST_KEY = 'market_list';
  const MST_SCHEMA_VERSION = 1;
  const BRIDGE_VERSION = '1.2.0';
  const STATUS_TO_HRID = {
    active: '/market_listing_status/active',
    filled: '/market_listing_status/filled',
    cancelled: '/market_listing_status/cancelled',
    expired: '/market_listing_status/expired'
  };
  const HRID_TO_STATUS = {
    '/market_listing_status/active': 'active',
    '/market_listing_status/filled': 'filled',
    '/market_listing_status/cancelled': 'cancelled',
    '/market_listing_status/expired': 'expired'
  };
  const BUTTON_STYLE =
    'padding: 0.625rem 1.25rem; margin: 0 0.3125rem; background-color: #2c2e45; color: #c8d0f0; ' +
    'border: 0.0625rem solid #98a7e9; border-radius: 0.25rem; cursor: pointer;';

  // ---- 基础工具 ----

  function toInt(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
  }

  function parseStamp(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
    const stamp = Date.parse(String(value));
    return Number.isFinite(stamp) ? stamp : null;
  }

  function toIso(value) {
    const stamp = parseStamp(value);
    return stamp ? new Date(stamp).toISOString() : undefined;
  }

  function currentEnvironment(hostname) {
    return String(hostname || '').startsWith('test.') ? 'test' : 'live';
  }

  // 当前角色 id：与 MST 一致地取游戏页 URL 的 characterId 参数；
  // 用于个别条目缺 characterID 时兜底分桶，避免导出到 MST 后落在 default 桶里看不到。
  function currentCharacterId(search) {
    const match = /[?&]characterId=([^&]+)/.exec(String(search || ''));
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  // 与食用工具自身的判定保持一致：它读游戏的 localStorage.i18nextLng（非 en 即中文），
  // 页面 html lang / 浏览器语言只作兜底，避免中文界面下按钮显示英文。
  function isChinese() {
    try {
      const lang = String(
        localStorage.getItem('i18nextLng') || document?.documentElement?.lang || navigator?.language || ''
      ).toLowerCase();
      return !lang.startsWith('en');
    } catch {
      return true;
    }
  }

  function t(zh, en) {
    return isChinese() ? zh : en;
  }

  function formatNow(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return (
      String(date.getFullYear()) +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      '-' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  // ---- 转换（纯逻辑，测试直接调用这里的函数） ----

  // 食用工具条目（官方挂牌对象 + lastUpdated）→ MST 记录
  function edibleEntryToMstRecord(entry, {environment, originHost, now} = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const id = entry.id == null ? null : String(entry.id);
    const itemHrid = String(entry.itemHrid || '');
    if (id == null || !itemHrid) return null;
    const createdAt = parseStamp(entry.createdTimestamp);
    const updatedAt = parseStamp(entry.lastUpdated) || createdAt || now || Date.now();
    const status = HRID_TO_STATUS[entry.status] || (STATUS_TO_HRID[entry.status] ? entry.status : 'active');
    const filledQuantity = toInt(entry.filledQuantity);
    return {
      key: 'listing:' + id,
      environment: environment || 'live',
      characterId: entry.characterID == null ? '' : String(entry.characterID),
      characterName: '',
      originHost: originHost || '',
      kind: 'listing',
      side: entry.isSell ? 'sell' : 'buy',
      listingId: id,
      itemHrid,
      enhancementLevel: Math.max(0, Math.floor(Number(entry.enhancementLevel) || 0)),
      price: toInt(entry.price),
      orderQuantity: toInt(entry.orderQuantity),
      filledQuantity,
      status,
      createdAt: createdAt || updatedAt,
      updatedAt,
      // 食用工具没有独立的首次成交时间：有成交时用最后更新时间近似（MST 侧会原样保留）。
      firstFillAt: filledQuantity > 0 ? updatedAt : null,
      filledAt: status === 'filled' ? updatedAt : null,
      cancelledAt: status === 'cancelled' ? updatedAt : null,
      expiredAt: status === 'expired' ? updatedAt : null,
      cancelRequestedAt: null,
      claimRequestedAt: null,
      claimedAt: null,
      expiresAt: parseStamp(entry.expirationTimestamp),
      taxTaken: toInt(entry.taxTaken),
      unclaimedItemCount: toInt(entry.unclaimedItemCount),
      unclaimedCoinCount: toInt(entry.unclaimedCoinCount),
      collectedCoinCount: 0,
      collectedItemCount: 0,
      claims: [],
      origin: 'import',
      // 创建时间缺失时只能退回 lastUpdated，标推断。
      inferredTime: !createdAt,
      endedUnobserved: false,
      importNote: t('来源：食用工具', 'Source: Edible Tools')
    };
  }

  // MST 记录 → 食用工具条目；没有官方订单 id 的记录（直购/直售兜底）返回 null
  function mstRecordToEdibleEntry(record, {now} = {}) {
    if (!record || typeof record !== 'object') return null;
    const id =
      record.listingId != null && record.listingId !== ''
        ? String(record.listingId)
        : String(record.key || '').startsWith('listing:')
          ? String(record.key).slice('listing:'.length)
          : null;
    if (id == null || !record.itemHrid) return null;
    const entry = {
      id: Number.isFinite(Number(id)) ? Number(id) : id,
      status: STATUS_TO_HRID[record.status] || '/market_listing_status/active',
      isSell: record.side !== 'buy',
      itemHrid: String(record.itemHrid),
      enhancementLevel: Math.max(0, Math.floor(Number(record.enhancementLevel) || 0)),
      orderQuantity: toInt(record.orderQuantity),
      filledQuantity: toInt(record.filledQuantity),
      price: toInt(record.price),
      unclaimedItemCount: toInt(record.unclaimedItemCount),
      unclaimedCoinCount: toInt(record.unclaimedCoinCount),
      coinsAvailable: 0,
      taxTaken: toInt(record.taxTaken),
      lastUpdated: new Date(parseStamp(record.updatedAt) || now || Date.now()).toISOString()
    };
    if (record.characterId !== '' && record.characterId != null) {
      entry.characterID = Number.isFinite(Number(record.characterId))
        ? Number(record.characterId)
        : String(record.characterId);
    }
    const createdIso = toIso(record.createdAt);
    if (createdIso) entry.createdTimestamp = createdIso;
    const expiresIso = toIso(record.expiresAt);
    if (expiresIso) entry.expirationTimestamp = expiresIso;
    return entry;
  }

  // 食用工具条目数组 → MST 导出载荷（按 环境 + 角色 分桶）
  // fallbackCharacterId：条目缺 characterID 时用的当前角色 id（取游戏页 URL 参数）。
  function buildMstPayload(entries, {environment, originHost, now, fallbackCharacterId} = {}) {
    const env = environment || 'live';
    const stamp = now || Date.now();
    const fallbackId = String(fallbackCharacterId || '');
    const buckets = {};
    let converted = 0;
    let skipped = 0;
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const record = edibleEntryToMstRecord(entry, {environment: env, originHost, now: stamp});
      if (!record) {
        skipped += 1;
        return;
      }
      if (!record.characterId && fallbackId) record.characterId = fallbackId;
      const key = env + ':' + (record.characterId || 'default');
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(record);
      converted += 1;
    });
    return {
      payload: {
        app: 'MST',
        type: 'market-history',
        schemaVersion: MST_SCHEMA_VERSION,
        exportedAt: stamp,
        environment: env,
        buckets
      },
      converted,
      skipped
    };
  }

  // 统一格式：导出与导入都只用 MST 的市场交易记录格式（{app:'MST', type:'market-history', …}），
  // 导入时把 MST 记录转换成食用工具的条目。食用工具之间迁移也用同一份文件。
  function extractEdibleEntries(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {ok: false, reason: 'invalid-json'};
      }
    }
    if (parsed && typeof parsed === 'object' && parsed.app === 'MST' && parsed.type === 'market-history') {
      const schemaVersion = Math.max(1, Math.floor(Number(parsed.schemaVersion) || 0));
      if (schemaVersion > MST_SCHEMA_VERSION) return {ok: false, reason: 'unsupported-version'};
      const records = [];
      Object.values(parsed.buckets && typeof parsed.buckets === 'object' ? parsed.buckets : {}).forEach((bucket) => {
        if (Array.isArray(bucket)) records.push(...bucket);
      });
      // 文件里一条记录都没有（例如导出的是空分桶）时单独报「没有记录」，与「都是直购兜底记录」区分开。
      if (!records.length) return {ok: false, reason: 'no-records'};
      const now = Date.now();
      const entries = [];
      let unrepresentable = 0;
      records.forEach((record) => {
        const entry = mstRecordToEdibleEntry(record, {now});
        if (!entry) {
          unrepresentable += 1;
          return;
        }
        entries.push(entry);
      });
      if (!entries.length) return {ok: false, reason: 'no-representable-records', unrepresentable};
      return {ok: true, entries, unrepresentable};
    }
    return {ok: false, reason: 'invalid-format'};
  }

  const TERMINAL_STATUSES = new Set([
    '/market_listing_status/filled', '/market_listing_status/cancelled', '/market_listing_status/expired'
  ]);

  function isTerminalStatus(status) {
    return TERMINAL_STATUSES.has(String(status || ''));
  }

  // 同订单合并时选哪条作为基准：终态优先于进行中，其次更新时间较新；时间相同或缺失时以导入方为准。
  function choosePrimaryEntry(left, right) {
    const leftTerminal = isTerminalStatus(left.status);
    const rightTerminal = isTerminalStatus(right.status);
    if (leftTerminal !== rightTerminal) return rightTerminal ? right : left;
    const leftStamp = parseStamp(left.lastUpdated) || 0;
    const rightStamp = parseStamp(right.lastUpdated) || 0;
    return rightStamp >= leftStamp ? right : left;
  }

  // 同订单字段级合并：基准条目决定状态/价格等，进度与税费取大，时间戳取存在的值，保留两侧的额外字段。
  function mergeEntryPair(left, right, now) {
    const primary = choosePrimaryEntry(left, right);
    const secondary = primary === left ? right : left;
    const merged = {...secondary, ...primary};
    merged.filledQuantity = Math.max(toInt(left.filledQuantity), toInt(right.filledQuantity));
    merged.orderQuantity = Math.max(toInt(left.orderQuantity), toInt(right.orderQuantity));
    merged.taxTaken = Math.max(toInt(left.taxTaken), toInt(right.taxTaken));
    merged.createdTimestamp = primary.createdTimestamp || secondary.createdTimestamp;
    merged.expirationTimestamp = primary.expirationTimestamp || secondary.expirationTimestamp;
    const stamp = Math.max(parseStamp(left.lastUpdated) || 0, parseStamp(right.lastUpdated) || 0) || now || Date.now();
    merged.lastUpdated = new Date(stamp).toISOString();
    return merged;
  }

  // 导入两种方式：
  // - merge：同订单按状态与更新时间合并，新订单追加（多台设备各记一部分时合并成完整记录）；
  // - overwrite：用文件内容整体替换现有列表（先清空再写入）。
  function mergeEdibleEntries(existing, incoming, {mode = 'merge', now} = {}) {
    const source = Array.isArray(incoming) ? incoming : [];
    if (mode === 'overwrite') {
      return {
        list: source.map((entry) => ({...entry})),
        added: source.length,
        updated: 0,
        cleared: Array.isArray(existing) ? existing.length : 0
      };
    }
    const list = Array.isArray(existing) ? existing.map((entry) => ({...entry})) : [];
    let added = 0;
    let updated = 0;
    source.forEach((entry) => {
      const index = list.findIndex((item) => String(item.id) === String(entry.id));
      if (index === -1) {
        list.push({...entry});
        added += 1;
        return;
      }
      list[index] = mergeEntryPair(list[index], entry, now);
      updated += 1;
    });
    return {list, added, updated, cleared: 0};
  }

  // ---- GM 存储（在食用工具沙箱内读写它自己的 market_list） ----

  function readMarketList() {
    try {
      return JSON.parse(GM_getValue(MARKET_LIST_KEY, '[]')) || [];
    } catch (error) {
      console.error('[MST 桥接] 读取 market_list 失败:', error);
      return [];
    }
  }

  function writeMarketList(entries) {
    GM_setValue(MARKET_LIST_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
  }

  const bridge = {
    BRIDGE_VERSION,
    MARKET_LIST_KEY,
    edibleEntryToMstRecord,
    mstRecordToEdibleEntry,
    buildMstPayload,
    extractEdibleEntries,
    mergeEdibleEntries,
    choosePrimaryEntry,
    mergeEntryPair,
    isTerminalStatus,
    readMarketList,
    writeMarketList,
    currentEnvironment,
    currentCharacterId
  };

  // 暴露给宿主脚本/调试；测试也在无 DOM 环境下直接取用这个对象。
  try {
    globalThis.__MST_EDIBLE_BRIDGE__ = bridge;
  } catch {}

  // ---- 界面：在「市场数据」页的删除按钮之后插入两个按钮（导出 MST 格式 / 导入） ----

  function downloadJson(text, fileName) {
    const blob = new Blob(
      [
        text
      ],
      {type: 'application/json'}
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

  function exportToMst() {
    const entries = readMarketList();
    if (!entries.length) {
      alert(t('没有可导出的市场数据。', 'No market data to export.'));
      return;
    }
    const result = buildMstPayload(entries, {
      environment: currentEnvironment(location.hostname),
      originHost: location.hostname,
      fallbackCharacterId: currentCharacterId(location.search)
    });
    const fileName = 'MWI_Market_History_from_Edible_Tools_' + formatNow() + '.json';
    // 与 MST 自身的导出口径一致：紧凑单行（不带缩进），文件更小，导入端只做 JSON.parse。
    downloadJson(JSON.stringify(result.payload), fileName);
    alert(
      t(
        `已导出 ${result.converted} 条订单（跳过 ${result.skipped} 条）。\n` +
          '在 MST 的市场交易记录里点“导入”，选择该文件即可。\n' +
          '同一份文件在另一台设备的食用工具里点“导入到食用工具”也能用（导出/导入统一为 MST 格式）。\n' +
          '注意：食用工具没有记录领取，导入 MST 后“实际到账”会按成交当时的市场税率推算并标注。',
        `Exported ${result.converted} orders (skipped ${result.skipped}).\n` +
          'Use MST → Market History → Import with this file.' +
          '\nThe same file can also be imported into Edible Tools on another device (a single MST-format file for both).\n' +
          'Note: Edible Tools does not track collections; MST will estimate "Collected" from the tax rate of the time.'
      )
    );
  }

  // 用 prompt 选择导入方式：1 = 合并、2 = 覆盖；取消（null）或连续输错三次视为放弃。
  function askImportMode(existingCount, incomingCount) {
    const text = t(
      `请选择导入方式（输入 1 或 2）：\n` +
        `1 = 合并：同一订单按状态与更新时间合并，新订单追加（现有 ${existingCount} 条 + 文件 ${incomingCount} 条）\n` +
        `2 = 覆盖：先清空现有 ${existingCount} 条，再写入文件里的 ${incomingCount} 条`,
      `Choose the import mode (type 1 or 2):\n` +
        `1 = Merge: merge by status and updated time, append new orders (${existingCount} existing + ${incomingCount} from file)\n` +
        `2 = Overwrite: clear ${existingCount} existing entries, then write ${incomingCount} from the file`
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = prompt(text, '1');
      if (answer == null) return null;
      const value = String(answer).trim().toLowerCase();
      if (value === '1' || value === 'merge') return 'merge';
      if (value === '2' || value === 'overwrite') return 'overwrite';
      alert(t('请输入 1（合并）或 2（覆盖）。', 'Please type 1 (merge) or 2 (overwrite).'));
    }
    return null;
  }

  function importIntoEdible(text) {
    const parsed = extractEdibleEntries(text);
    if (!parsed.ok) {
      const reasonText =
        parsed.reason === 'unsupported-version'
          ? t('文件版本高于当前桥接脚本支持的版本。', 'The file was exported by a newer version.')
          : parsed.reason === 'no-records'
            ? t('文件里没有任何市场订单记录。', 'The file contains no market orders.')
            : parsed.reason === 'no-representable-records'
              ? t(
                  `文件里 ${parsed.unrepresentable || 0} 条都是没有官方订单 id 的直购/直售记录，无法导入食用工具。`,
                  `All ${parsed.unrepresentable || 0} records have no official order id and cannot be imported.`
                )
              : t(
                  '文件格式不正确，请选择本桥接脚本从食用工具导出的 MST 格式 JSON。',
                  'Invalid file format. Use the MST-format JSON exported by this bridge.'
                );
      alert(reasonText);
      return;
    }
    const existing = readMarketList();
    const mode = askImportMode(existing.length, parsed.entries.length);
    if (!mode) {
      alert(t('已取消导入。', 'Import cancelled.'));
      return;
    }
    if (
      mode === 'overwrite' &&
      !confirm(
        t(
          `确定覆盖？将先清空现有 ${existing.length} 条食用工具市场数据（含其它角色的条目）。`,
          `Overwrite? All ${existing.length} existing entries (including other characters) will be cleared first.`
        )
      )
    ) {
      alert(t('已取消导入。', 'Import cancelled.'));
      return;
    }
    const result = mergeEdibleEntries(existing, parsed.entries, {mode});
    writeMarketList(result.list);
    const extra = parsed.unrepresentable
      ? t(
          `\n跳过 ${parsed.unrepresentable} 条无订单 id 的直购/直售记录。`,
          `\nSkipped ${parsed.unrepresentable} instant orders without an order id.`
        )
      : '';
    const head =
      mode === 'overwrite'
        ? t(
            `导入完成（覆盖）：清空 ${result.cleared} 条，写入 ${result.added} 条，现有 ${result.list.length} 条。`,
            `Import finished (overwrite): cleared ${result.cleared}, wrote ${result.added}, ${result.list.length} total.`
          )
        : t(
            `导入完成（合并）：新增 ${result.added} 条，更新 ${result.updated} 条，现有 ${result.list.length} 条。`,
            `Import finished (merge): ${result.added} added, ${result.updated} updated, ${result.list.length} total.`
          );
    alert(head + extra);
  }

  function pickImportFile() {
    const input = document.getElementById('mstEdibleImportInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function bindImportInput() {
    const input = document.getElementById('mstEdibleImportInput');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importIntoEdible(String(reader.result || ''));
      reader.readAsText(file);
    });
  }

  function injectButtons() {
    if (typeof document === 'undefined') return false;
    const page = document.getElementById('showMarketDataPage');
    if (!page) return false;
    if (document.getElementById('mstEdibleBridgeRow')) return true;
    const row = document.createElement('div');
    row.id = 'mstEdibleBridgeRow';
    row.style.cssText = 'display:inline-block;';
    row.innerHTML =
      `<button id="mstEdibleExportMstBtn" style="${BUTTON_STYLE}">` +
      t('导出到 MST 交易记录', 'Export to MST') +
      '</button>' +
      `<button id="mstEdibleImportBtn" style="${BUTTON_STYLE}">` +
      t('导入到食用工具', 'Import into Edible Tools') +
      '</button>' +
      '<input id="mstEdibleImportInput" type="file" accept="application/json,.json" style="display:none" />';
    // 按需求放在「仅保留已完成订单」按钮之后（同一行）；找不到时退到删除按钮行之后、再退到表格之前。
    const anchor =
      document.getElementById('deleteSpecificStatusDataBtn') || document.getElementById('deleteOldDataBtn');
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', row);
    else page.insertBefore(row, page.querySelector('table') || null);
    document.getElementById('mstEdibleExportMstBtn')?.addEventListener('click', exportToMst);
    document.getElementById('mstEdibleImportBtn')?.addEventListener('click', pickImportFile);
    bindImportInput();
    return true;
  }

  function startUi() {
    injectButtons();
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        injectButtons();
      }, 300);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {childList: true, subtree: true});
  }

  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && document.documentElement) {
    startUi();
  }
})();
