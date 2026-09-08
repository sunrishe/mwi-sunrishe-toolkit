// 订阅通知：行动队列变动推送到钉钉 / 企业微信 / 飞书机器人。
// 需求与渠道限制见 docs/analysis/订阅通知需求说明书.md。
// 核心口径：
// - 只在游戏页面打开期间监听（离线变化不感知、不补推）；
// - 以 CharacterAction.id 为准：同 id 的 action_completed 是任务内部变动不推送，
//   只有当前任务以 isDone 结束且队首变化才推送“完成 + 队列前 3 项”；
// - 长时间未完成任务按周期推送进度（默认 30 分钟）；
// - 组队战斗在同一条行动上持续累加 currentCount：监听 party_updated，本方角色
//   重新准备视为新战斗会话，进度次数从重新准备起重新计数并重置进度计时；
// - 会话监控：监听公共 mst:ws:state，游戏 WebSocket 断开（含同账号被其他
//   登录挤掉）时暂停定时推送，避免断连页面继续用陈旧队列数据推送；
// - 只有配置持久化（MST_SUBSCRIBE_config），id 基线、计时器、发送队列全部只存内存。
import {StyleService} from '../../common/runtime.js';
import {QueueChangeTracker} from './queue-tracker.js';
import {
  buildDingTalkRequest,
  buildFeishuRequest,
  buildWeComRequest,
  createDefaultHmac,
  normalizeFeishuHookUrl,
  NotificationSender,
  parseChannelResponse,
  truncateForChannel
} from './notifier.js';
import MST_SUBSCRIBE_CSS from './styles.css';

// 进度推送的检查节拍：轻量 setTimeout 链，不引入高频常驻轮询。
const PROGRESS_TICK_MS = 15000;
// 完成通知中展示的队列条目数。
const QUEUE_PREVIEW_COUNT = 3;
const RETRY_DELAYS_MS = [
  60000, 120000, 240000
];

// 各渠道官方限流默认值（条/分钟）：切换渠道时作为分钟推送上限的默认值带出。
const CHANNEL_PER_MINUTE_DEFAULTS = {dingtalk: 20, wecom: 20, feishu: 100};
// 队列为空提醒的固定推送周期：每分钟一条。
const EMPTY_REMIND_INTERVAL_MS = 60000;

function createDefaultConfig() {
  return {
    enabled: false,
    channel: 'dingtalk',
    minIntervalSec: 10,
    progressIntervalMin: 30,
    pushPerMinute: CHANNEL_PER_MINUTE_DEFAULTS.dingtalk,
    // 消息类型开关：默认全勾。
    notifyComplete: true,
    notifyProgress: true,
    notifyEmpty: true,
    dingtalk: {url: '', secret: ''},
    wecom: {key: ''},
    feishu: {url: '', secret: ''}
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export class SubscribeNotificationFeature {
  // 各渠道官方配置说明链接（设置弹窗渠道配置区内展示）。
  static CHANNEL_DOCS = {
    dingtalk: 'https://open.dingtalk.com/document/robots/custom-robot-access',
    wecom: 'https://developer.work.weixin.qq.com/document/path/99110',
    feishu: 'https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot'
  };

  // 渠道默认分钟推送上限（与官方限流一致：钉钉/企微约 20 条每分钟、飞书 100 条每分钟）。
  static get CHANNEL_PER_MINUTE_DEFAULTS() {
    return CHANNEL_PER_MINUTE_DEFAULTS;
  }

  constructor(ctx) {
    this.ctx = ctx;
    this.inited = false;
    this.config = null;
    this.tracker = new QueueChangeTracker();
    this.sender = null;
    this.hmac = null;
    this.progressTimer = null;
    this.lastProgressAt = 0;
    this.lastEmptyRemindAt = 0;
    this.partyReady = false;
    // 游戏会话状态：默认视为在线（init_character_data 与 WS open 事件会确认），
    // WS close 后置为 false 暂停定时推送，重连后恢复。
    this.wsConnected = true;
    this.characterName = '';
    this.characterId = null;
    this.lastResult = null;
    this.settingsRoot = null;
  }

  init() {
    const {CONFIG} = this.ctx;
    if (!CONFIG.isGameSite || this.inited) return;
    this.inited = true;
    // 设置弹窗样式为模块私有 CSS，注入一次即可。
    StyleService.ensure('mst-subscribe-notification-style', MST_SUBSCRIBE_CSS);
    this.config = this.readConfig();
    // 监听与节拍常驻但代价极低，处理器内部按 isFeatureActive 过滤，
    // 订阅开关变化后无需重载页面即可生效。
    window.addEventListener('mst:ws:init-character-data', (event) => this.onInitCharacterData(event.detail));
    window.addEventListener('mst:ws:message', (event) => this.onWsMessage(event.detail));
    window.addEventListener('mst:ws:state', (event) => this.onWsState(event.detail));
    // 设置弹窗打开时切换语言：重绘标题、帮助提示与设置表单（配置实时回写，重绘无状态丢失）。
    this.ctx.LanguageEvents?.subscribe(() => this.refreshLanguage());
    this.startProgressLoop();
  }

  // 功能激活条件：游戏站 + 订阅总开关打开。
  isFeatureActive() {
    const {CONFIG} = this.ctx;
    if (!CONFIG.isGameSite) return false;
    return Boolean(this.config?.enabled);
  }

  // ---- 配置（唯一持久化内容） ----

  // 配置按角色分用户存储：同一键下以 characterId 分桶，不同角色互不影响。
  // 页内切换角色时 URL 参数可能不变，因此优先取 init_character_data 里的实际角色 id，
  // URL 参数只作为基线到达前的兜底。
  getStorageCharacterId() {
    return String(this.characterId || this.ctx.CONFIG.characterId || 'default');
  }

  readCharacterStore(key) {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (parsed && typeof parsed === 'object' && parsed.characters && typeof parsed.characters === 'object') {
      return parsed.characters;
    }
    // 旧版单角色扁平结构：迁移到当前角色名下（配置只保存在本机浏览器）。
    if (parsed && typeof parsed.enabled === 'boolean') {
      return {[this.getStorageCharacterId()]: parsed};
    }
    return {};
  }

  readConfig() {
    const key = this.ctx.STORAGE_KEYS?.SUBSCRIBE_NOTIFICATION || 'MST_SUBSCRIBE_config';
    try {
      const store = this.readCharacterStore(key);
      return this.normalizeConfig(store[this.getStorageCharacterId()]);
    } catch {
      return createDefaultConfig();
    }
  }

  normalizeConfig(raw) {
    const defaults = createDefaultConfig();
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: Boolean(source.enabled),
      channel: [
        'dingtalk', 'wecom', 'feishu'
      ].includes(source.channel) ? source.channel : defaults.channel,
      minIntervalSec: clampInt(source.minIntervalSec, 5, 600, defaults.minIntervalSec),
      progressIntervalMin: clampInt(source.progressIntervalMin, 0, 240, defaults.progressIntervalMin),
      pushPerMinute: clampInt(
        source.pushPerMinute,
        1,
        100,
        CHANNEL_PER_MINUTE_DEFAULTS[source.channel] || defaults.pushPerMinute
      ),
      // 未显式关闭（含旧配置缺字段）视为勾选。
      notifyComplete: source.notifyComplete !== false,
      notifyProgress: source.notifyProgress !== false,
      notifyEmpty: source.notifyEmpty !== false,
      dingtalk: {
        url: String(source.dingtalk?.url || ''),
        secret: String(source.dingtalk?.secret || '')
      },
      wecom: {key: String(source.wecom?.key || '')},
      feishu: {
        url: String(source.feishu?.url || ''),
        secret: String(source.feishu?.secret || '')
      }
    };
  }

  saveConfig() {
    const key = this.ctx.STORAGE_KEYS?.SUBSCRIBE_NOTIFICATION || 'MST_SUBSCRIBE_config';
    try {
      const store = this.readCharacterStore(key);
      store[this.getStorageCharacterId()] = this.config;
      localStorage.setItem(key, JSON.stringify({characters: store}));
    } catch (error) {
      console.warn('[MST] 订阅通知配置保存失败:', error);
    }
  }

  updateConfig(patch) {
    this.config = this.normalizeConfig({...this.config, ...patch});
    this.saveConfig();
    this.ensureSender();
  }

  updateChannelConfig(channel, patch) {
    this.config[channel] = {...this.config[channel], ...patch};
    this.saveConfig();
  }

  isChannelConfigured(channel = this.config.channel) {
    if (channel === 'dingtalk') return Boolean(this.config.dingtalk.url);
    if (channel === 'wecom') return Boolean(this.config.wecom.key);
    if (channel === 'feishu') return Boolean(this.config.feishu.url);
    return false;
  }

  // ---- 官方消息接入 ----

  onInitCharacterData(data) {
    const actions = Array.isArray(data?.characterActions) ? data.characterActions : [];
    const nextCharacterId =
      data?.character?.id ?? data?.characterID ?? this.ctx.CONFIG.characterId ?? this.tracker.characterId ?? null;
    const characterChanged = nextCharacterId != null && String(nextCharacterId) !== String(this.characterId ?? '');
    this.characterId = nextCharacterId ?? this.characterId;
    this.characterName = data?.character?.name || this.ctx.DataHub?.characterData?.raw?.character?.name || '';
    // 能收到 init_character_data 说明当前页面 WS 会话在线（重连成功同样走这里）。
    this.wsConnected = true;
    // 基线重建不触发推送；进度计时从基线建立时刻起算。
    this.tracker.setQueue(actions, this.characterId);
    // 同步本方组队准备状态作为基线：基线建立时的已准备不算重新准备。
    this.partyReady = this.readOwnPartyReady(data?.partyInfo);
    this.markTaskActivity();
    if (characterChanged) {
      // 配置按角色分桶：切角色后必须重读当前角色配置并重置发送队列，
      // 否则会沿用上一个角色的渠道与凭据推送（内存态不落盘，重读即切换）。
      this.config = this.readConfig();
      this.sender?.dispose();
      this.sender = null;
      this.lastResult = null;
    }
  }

  onWsMessage(message) {
    if (!this.isFeatureActive()) return;
    const type = message?.type;
    if (type === 'actions_updated') {
      this.handleEvent(this.tracker.applyActionsUpdate(message.endCharacterActions));
    } else if (type === 'action_completed') {
      this.handleEvent(this.tracker.applyActionCompleted(message.endCharacterAction));
    } else if (type === 'party_updated') {
      this.handlePartyUpdated(message);
    }
  }

  // 会话监控：游戏 WebSocket close（网络断开或同账号被其他登录挤掉）后，当前页面
  // 不再收到任何队列消息，继续定时推送只会发出陈旧数据（多开页面时表现为同一
  // 任务收到两条数据差异很大的进度通知）。断连期间暂停进度与空队列提醒，重连
  // （open / init_character_data 重建基线）后自动恢复。
  onWsState(detail) {
    this.wsConnected = detail?.state !== 'closed';
  }

  // 读取本方角色在队伍槽位中的准备状态（partyInfo.partySlotMap 按 characterID 匹配）。
  readOwnPartyReady(partyInfo) {
    const slotMap = partyInfo?.partySlotMap;
    if (!slotMap || typeof slotMap !== 'object') return false;
    const ownId = String(this.characterId ?? '');
    if (!ownId) return false;
    const ownSlot = Object.values(slotMap).find((slot) => String(slot?.characterID ?? '') === ownId);
    return Boolean(ownSlot?.isReady);
  }

  // 组队战斗行动在同一条 CharacterAction 上持续累加 currentCount，取消准备再重新准备
  // 不会更换 id、也没有 actions_updated/action_completed，官方只在 party_updated 里
  // 携带准备状态。本方角色从未准备变为已准备（取消准备后再准备、战后再次准备）视为
  // 新的战斗会话：重置进度计数基线与进度计时，定期进度通知从重新准备起重新计数。
  handlePartyUpdated(message) {
    const isReady = this.readOwnPartyReady(message?.partyInfo);
    const wasReady = this.partyReady;
    this.partyReady = isReady;
    if (!isReady || wasReady) return;
    const task = this.tracker.getCurrentTask();
    if (!task || task.partyID === 0) return;
    this.tracker.resetProgressBaseline();
    this.markTaskActivity();
  }

  handleEvent(event) {
    if (!event) return;
    // 任务切换后重置进度计时，避免旧任务的计时周期污染新任务。
    this.markTaskActivity();
    // 消息类型开关：任务完成通知可单独关闭（计时仍重置）。
    if (this.config?.notifyComplete === false) return;
    this.submitText(this.buildCompletionText(event));
  }

  // ---- 定期进度推送 ----

  startProgressLoop() {
    if (this.progressTimer) return;
    const tick = () => {
      this.progressTimer = setTimeout(tick, PROGRESS_TICK_MS);
      try {
        this.checkProgress();
      } catch (error) {
        console.warn('[MST] 订阅通知进度推送检查失败:', error);
      }
    };
    this.progressTimer = setTimeout(tick, PROGRESS_TICK_MS);
  }

  checkProgress() {
    if (!this.isFeatureActive()) return;
    // 会话已断开（被挤掉/断网）：暂停定时推送，恢复后由重连基线重建继续。
    if (this.wsConnected === false) return;
    const now = Date.now();
    const task = this.tracker.getCurrentTask();
    if (!task) {
      // 消息类型开关：队列为空提醒可单独关闭；队列空时固定每分钟推送一条提醒。
      if (this.config?.notifyEmpty === false) return;
      if (now - this.lastEmptyRemindAt < EMPTY_REMIND_INTERVAL_MS) return;
      this.lastEmptyRemindAt = now;
      this.submitText(this.buildEmptyText());
      return;
    }
    // 有任务期间持续刷新，保证队列腾空后从下一分钟起开始提醒。
    this.lastEmptyRemindAt = now;
    // 消息类型开关：定期进度通知可单独关闭。
    if (this.config?.notifyProgress === false) return;
    const intervalMin = Number(this.config.progressIntervalMin) || 0;
    if (intervalMin <= 0) return;
    if (now - this.lastProgressAt < intervalMin * 60000) return;
    this.lastProgressAt = now;
    this.submitText(this.buildProgressText(task));
  }

  markTaskActivity() {
    this.lastProgressAt = Date.now();
    this.lastEmptyRemindAt = Date.now();
  }

  // ---- 推送链路 ----

  ensureSender() {
    const minIntervalMs = Math.max(5, Number(this.config.minIntervalSec) || 10) * 1000;
    const perMinuteLimit = Math.max(1, Number(this.config.pushPerMinute) || 20);
    if (!this.sender) {
      this.sender = new NotificationSender({
        send: (text) => this.sendToChannel(text),
        minIntervalMs,
        perMinuteLimit,
        retryDelaysMs: RETRY_DELAYS_MS,
        onGiveUp: () => {
          this.lastResult = {time: new Date().toLocaleString(), ok: false, code: null, msg: 'retry exhausted'};
          this.refreshStatusLine();
        }
      });
    } else {
      this.sender.minIntervalMs = minIntervalMs;
      this.sender.perMinuteLimit = perMinuteLimit;
    }
    return this.sender;
  }

  submitText(text) {
    if (!this.isChannelConfigured()) return;
    this.ensureSender().submit(truncateForChannel(this.config.channel, text));
  }

  async sendToChannel(text) {
    const {GmApi, CONFIG} = this.ctx;
    const request = GmApi?.xmlHttpRequestApi?.();
    if (!request) throw new Error('GM request API unavailable');
    if (!CONFIG.isGameSite) throw new Error('invalid site');
    const channel = this.config.channel;
    this.hmac = this.hmac || createDefaultHmac();
    if (channel === 'dingtalk' && this.config.dingtalk.secret && !this.hmac) {
      throw new Error('WebCrypto unavailable');
    }
    let built;
    if (channel === 'dingtalk') {
      built = await buildDingTalkRequest(
        {url: this.config.dingtalk.url, secret: this.config.dingtalk.secret, content: text},
        {hmac: this.hmac}
      );
    } else if (channel === 'wecom') {
      built = buildWeComRequest({
        url: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(this.config.wecom.key)}`,
        content: text
      });
    } else {
      built = await buildFeishuRequest(
        {url: normalizeFeishuHookUrl(this.config.feishu.url), secret: this.config.feishu.secret, content: text},
        {hmac: this.hmac}
      );
    }
    const responseText = await new Promise((resolve, reject) => {
      request({
        method: 'POST',
        url: built.url,
        headers: built.headers,
        data: built.body,
        timeout: 15000,
        onload: (response) => resolve(response?.responseText || ''),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
    const result = parseChannelResponse(channel, responseText);
    this.lastResult = {time: new Date().toLocaleString(), ...result};
    this.refreshStatusLine();
    if (!result.ok) throw new Error(result.msg || `code ${result.code}`);
    return result;
  }

  // ---- 文案 ----

  buildHeader() {
    return `【MST】${this.ctx.i18n.t('subscribeNotificationMsgTitle')}`;
  }

  // 时间行带完整日期：yyyy-MM-dd HH:mm:ss（不依赖本地化的 toLocaleString 输出）。
  buildTimeLine() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return (
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    );
  }

  buildRoleLine() {
    const owner = this.characterName || this.characterId || 'MST';
    const suffix = this.ctx.CONFIG.isTestServer ? ` · ${this.ctx.i18n.t('subscribeNotificationServerTest')}` : '';
    return `${owner}${suffix}`;
  }

  actionName(actionHrid) {
    return this.ctx.DataHub?.getLocalizedGameName('actionNames', actionHrid) || String(actionHrid || '');
  }

  describeTask(task) {
    const {i18n} = this.ctx;
    if (!task) return '-';
    // 难度后缀与官方行动标题口径一致：difficultyTier >= 1 时追加 " (T<tier>)"。
    const tierSuffix = task.difficultyTier >= 1 ? ` (T${task.difficultyTier})` : '';
    const name = this.actionName(task.actionHrid) + tierSuffix;
    if (task.hasMaxCount) {
      return i18n.t('subscribeNotificationTaskWithCount', name, task.currentCount ?? 0, task.maxCount ?? 0);
    }
    return i18n.t('subscribeNotificationTaskUnlimited', name);
  }

  buildCompletionText(event) {
    const {i18n} = this.ctx;
    const lines = [
      this.buildHeader()
    ];
    if (event.completedTask) {
      lines.push(`✅ ${i18n.t('subscribeNotificationTaskCompleted')}：${this.describeTask(event.completedTask)}`);
    }
    if (event.newTask) {
      lines.push(`▶️ ${i18n.t('subscribeNotificationTaskStarted')}：${this.describeTask(event.newTask)}`);
    }
    // 队列概览列"等待执行的"任务，不含队首正在执行的行动。
    const preview = this.tracker.getWaitingQueuePreview(QUEUE_PREVIEW_COUNT);
    if (preview.length) {
      lines.push(i18n.t('subscribeNotificationQueueLabel'));
      preview.forEach((task, index) => lines.push(`${index + 1}. ${this.describeTask(task)}`));
      const total = this.tracker.getWaitingQueueLength();
      if (total > preview.length) lines.push(i18n.t('subscribeNotificationQueueMore', total));
    }
    if (event.isEmpty) lines.push(`⚠️ ${i18n.t('subscribeNotificationQueueEmpty')}`);
    lines.push(this.buildTimeLine(), this.buildRoleLine());
    return lines.join('\n');
  }

  // 进度通知与完成通知同构：标题行 + 进度行 + 等待队列 + 时间行 + 角色名行。
  // 已完成次数走 tracker.getProgressCount：组队战斗重新准备后按会话增量统计。
  buildProgressText(task) {
    const {i18n} = this.ctx;
    const name = this.actionName(task.actionHrid);
    const tierSuffix = task.difficultyTier >= 1 ? ` (T${task.difficultyTier})` : '';
    let progress = `⏳ ${i18n.t('subscribeNotificationProgressDone', name + tierSuffix, this.tracker.getProgressCount(task))}`;
    if (task.hasMaxCount) {
      const remaining = (task.maxCount ?? 0) - (task.currentCount ?? 0);
      if (remaining > 0) progress += i18n.t('subscribeNotificationProgressRemaining', remaining);
    }
    const lines = [
      this.buildHeader(), progress
    ];
    const preview = this.tracker.getWaitingQueuePreview(QUEUE_PREVIEW_COUNT);
    if (preview.length) {
      lines.push(i18n.t('subscribeNotificationQueueLabel'));
      preview.forEach((item, index) => lines.push(`${index + 1}. ${this.describeTask(item)}`));
      const total = this.tracker.getWaitingQueueLength();
      if (total > preview.length) lines.push(i18n.t('subscribeNotificationQueueMore', total));
    }
    lines.push(this.buildTimeLine(), this.buildRoleLine());
    return lines.join('\n');
  }

  // 队列为空提醒：与完成通知同构，腾空后固定每分钟推送一条。
  buildEmptyText() {
    const {i18n} = this.ctx;
    return [
      this.buildHeader(), `⚠️ ${i18n.t('subscribeNotificationQueueEmpty')}`, this.buildTimeLine(), this.buildRoleLine()
    ].join('\n');
  }

  buildTestText() {
    const {i18n} = this.ctx;
    return [
      this.buildHeader(), i18n.t('subscribeNotificationTestBody'), this.buildTimeLine(), this.buildRoleLine()
    ].join('\n');
  }

  // ---- 设置界面（工具箱菜单入口） ----

  // 启用开关切换：保存配置后直接切换 DOM 显隐（与渲染后的 applyEnabledVisibility 同源）。
  toggleEnabled(enabled) {
    this.updateConfig({enabled});
    this.applyEnabledVisibility();
  }

  // 状态行只在点击测试发送（或真实推送有结果）后显示，未操作时留空。
  refreshStatusLine() {
    const element = document.getElementById('mst-subscribe-status');
    if (!element) return;
    element.textContent = this.lastResult
      ? `${this.lastResult.time} ${this.lastResult.ok ? '✅' : '❌'} ${this.lastResult.code ?? ''} ${this.lastResult.msg || ''}`.trim()
      : '';
  }

  openSettings() {
    const {Notifier, TemplateRenderer, i18n} = this.ctx;
    this.config = this.readConfig();
    return Notifier.html({
      title: i18n.t('subscribeNotificationTitle'),
      width: 'min(34rem, calc(100vw - 1rem))',
      popupClass: 'mst-subscribe-dialog',
      icon: 'action_queue',
      html: () => TemplateRenderer.html`<div id="mst-subscribe-settings-root"></div>`,
      didOpen: (popup) => {
        this.settingsRoot =
          popup?.querySelector('#mst-subscribe-settings-root') ||
          document.getElementById('mst-subscribe-settings-root');
        this.renderSettings();
        // 标题后的提示图标与技能升级等弹窗一致：挂在 swal 标题上，说明内容为原提示行文案。
        this.helpController?.cleanup();
        this.helpController = this.ctx.CalculatorHelpPopover?.mount({
          popup,
          moduleName: 'subscribe',
          title: i18n.t('subscribeNotificationTitle'),
          heading: i18n.t('subscribeNotificationTitle'),
          content: i18n.t('subscribeNotificationHint')
        });
      },
      willClose: () => {
        this.helpController?.cleanup();
        this.helpController = null;
        this.settingsRoot = null;
      }
    });
  }

  // 整体重渲染设置区：渠道切换后字段只展示当前渠道的配置项与文档链接。
  renderSettings() {
    const {TemplateRenderer} = this.ctx;
    if (!this.settingsRoot) return;
    TemplateRenderer.render(() => this.settingsTemplate(), this.settingsRoot);
    this.applyEnabledVisibility();
    this.refreshStatusLine();
  }

  // 语言切换时同步弹窗文案：标题、帮助提示与设置表单整体重绘。
  refreshLanguage() {
    const {i18n, CalculatorHelpPopover} = this.ctx;
    if (!this.settingsRoot?.isConnected) return;
    const popup = this.settingsRoot.closest('.mst-subscribe-dialog');
    const title = popup?.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('subscribeNotificationTitle');
    this.helpController?.cleanup();
    this.helpController =
      CalculatorHelpPopover?.mount({
        popup,
        moduleName: 'subscribe',
        title: i18n.t('subscribeNotificationTitle'),
        heading: i18n.t('subscribeNotificationTitle'),
        content: i18n.t('subscribeNotificationHint')
      }) || null;
    this.renderSettings();
  }

  // 启用状态决定后续选项的显隐。uhtml 对 hidden 布尔属性的初始/增量绑定都不可靠，
  // 统一在渲染后直接写 DOM，与 toggleEnabled 的切换行为保持同一来源。
  applyEnabledVisibility() {
    const root = this.settingsRoot || document.getElementById('mst-subscribe-settings-root');
    if (!root) return;
    const enabled = Boolean(this.config?.enabled);
    const detail = root.querySelector('.mst-subscribe-detail');
    if (detail) detail.hidden = !enabled;
  }

  settingsTemplate() {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    const config = this.config;
    const gameButtonClass = utils.getGameButtonClass();
    const channel = config.channel;
    const field = (labelKey, inputTemplate) => TemplateRenderer.html`
    <label class="mst-subscribe-field">
      <span>${i18n.t(labelKey)}</span>
      ${inputTemplate}
    </label>`;
    const channelFields =
      channel === 'dingtalk'
        ? [
            field(
              'subscribeNotificationDingtalkUrl',
              TemplateRenderer.html`<input
            type="text"
            id="mst-subscribe-dingtalk-url"
            .value=${config.dingtalk.url}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
            @input=${(event) => this.updateChannelConfig('dingtalk', {url: event.target.value.trim()})}
          />`
            ), field(
              'subscribeNotificationDingtalkSecret',
              TemplateRenderer.html`<input
            type="password"
            id="mst-subscribe-dingtalk-secret"
            .value=${config.dingtalk.secret}
            autocomplete="off"
            @input=${(event) => this.updateChannelConfig('dingtalk', {secret: event.target.value.trim()})}
          />`
            )
          ]
        : channel === 'wecom'
          ? [
              field(
                'subscribeNotificationWeComKey',
                TemplateRenderer.html`<input
              type="password"
              id="mst-subscribe-wecom-key"
              .value=${config.wecom.key}
              autocomplete="off"
              @input=${(event) => this.updateChannelConfig('wecom', {key: event.target.value.trim()})}
            />`
              )
            ]
          : [
              field(
                'subscribeNotificationFeishuUrl',
                TemplateRenderer.html`<input
              type="text"
              id="mst-subscribe-feishu-url"
              .value=${config.feishu.url}
              placeholder="完整 Hook 地址或仅填 hook-id"
              @input=${(event) => this.updateChannelConfig('feishu', {url: event.target.value.trim()})}
            />`
              ), field(
                'subscribeNotificationFeishuSecret',
                TemplateRenderer.html`<input
              type="password"
              id="mst-subscribe-feishu-secret"
              .value=${config.feishu.secret}
              autocomplete="off"
              @input=${(event) => this.updateChannelConfig('feishu', {secret: event.target.value.trim()})}
            />`
              )
            ];
    return TemplateRenderer.html`
  <div class="mst-subscribe-form">
    <div class="mst-subscribe-section-title">${i18n.t('subscribeNotificationSectionGeneral')}</div>
    <label class="mst-subscribe-checkbox">
      <input
        type="checkbox"
        id="mst-subscribe-enabled"
        .checked=${config.enabled}
        @change=${(event) => this.toggleEnabled(event.target.checked)}
      />
      <span>${i18n.t('subscribeNotificationEnabled')}</span>
    </label>
    <div class="mst-subscribe-detail">
      <div class="mst-subscribe-row">
        <label class="mst-subscribe-field">
          <span>${i18n.t('subscribeNotificationMinInterval')}</span>
          <input
            type="number"
            id="mst-subscribe-min-interval"
            min="5"
            max="600"
            step="1"
            .value=${config.minIntervalSec}
            @change=${(event) => this.updateConfig({minIntervalSec: event.target.value})}
          />
        </label>
        <label class="mst-subscribe-field">
          <span>${i18n.t('subscribeNotificationProgressInterval')}</span>
          <input
            type="number"
            id="mst-subscribe-progress-interval"
            min="0"
            max="240"
            step="1"
            .value=${config.progressIntervalMin}
            @change=${(event) => this.updateConfig({progressIntervalMin: event.target.value})}
          />
        </label>
      </div>
      <div class="mst-subscribe-section-title">${i18n.t('subscribeNotificationMsgType')}</div>
      <div class="mst-subscribe-type-row">
        <span class="mst-subscribe-type-label">${i18n.t('subscribeNotificationTypeQueue')}</span>
        <label
          class="mst-subscribe-type-checkbox"
          title=${i18n.t('subscribeNotificationTypeCompleteTitle')}
        >
          <input
            type="checkbox"
            id="mst-subscribe-type-complete"
            .checked=${config.notifyComplete}
            @change=${(event) => this.updateConfig({notifyComplete: event.target.checked})}
          />
          <span>${i18n.t('subscribeNotificationTypeComplete')}</span>
        </label>
        <label
          class="mst-subscribe-type-checkbox"
          title=${i18n.t('subscribeNotificationTypeProgressTitle')}
        >
          <input
            type="checkbox"
            id="mst-subscribe-type-progress"
            .checked=${config.notifyProgress}
            @change=${(event) => this.updateConfig({notifyProgress: event.target.checked})}
          />
          <span>${i18n.t('subscribeNotificationTypeProgress')}</span>
        </label>
        <label
          class="mst-subscribe-type-checkbox"
          title=${i18n.t('subscribeNotificationTypeEmptyTitle')}
        >
          <input
            type="checkbox"
            id="mst-subscribe-type-empty"
            .checked=${config.notifyEmpty}
            @change=${(event) => this.updateConfig({notifyEmpty: event.target.checked})}
          />
          <span>${i18n.t('subscribeNotificationTypeEmpty')}</span>
        </label>
        </div>
      <div class="mst-subscribe-section-title">${i18n.t('subscribeNotificationSectionChannel')}</div>
      <div class="mst-subscribe-row">
        <label class="mst-subscribe-field">
          <span>
            ${i18n.t('subscribeNotificationChannel')}
            <a
              class="mst-subscribe-doc-link"
              href=${SubscribeNotificationFeature.CHANNEL_DOCS[channel]}
              target="_blank"
              rel="noreferrer"
            >${i18n.t('subscribeNotificationDocLink')}</a>
          </span>
          <select
            id="mst-subscribe-channel"
            .value=${channel}
            @change=${(event) => {
              // 切换渠道时按官方限流带出该渠道默认的分钟推送上限，用户可再修改。
              const nextChannel = event.target.value;
              this.updateConfig({
                channel: nextChannel,
                pushPerMinute: SubscribeNotificationFeature.CHANNEL_PER_MINUTE_DEFAULTS[nextChannel]
              });
              this.renderSettings();
            }}
          >
            <option value="dingtalk">${i18n.t('subscribeNotificationChannelDingtalk')}</option>
            <option value="wecom">${i18n.t('subscribeNotificationChannelWeCom')}</option>
            <option value="feishu">${i18n.t('subscribeNotificationChannelFeishu')}</option>
          </select>
        </label>
        <label class="mst-subscribe-field">
          <span>${i18n.t('subscribeNotificationPushLimit')}</span>
          <input
            type="number"
            id="mst-subscribe-push-limit"
            min="1"
            max="100"
            step="1"
            .value=${config.pushPerMinute}
            @change=${(event) => this.updateConfig({pushPerMinute: event.target.value})}
          />
        </label>
      </div>
      <div class="mst-subscribe-row">${channelFields}</div>
      <div class="mst-subscribe-actions">
        <button type="button" id="mst-subscribe-test" class=${gameButtonClass} @click=${() => this.sendTestMessage()}>
          ${i18n.t('subscribeNotificationTestSend')}
        </button>
        <span class="mst-subscribe-status" id="mst-subscribe-status"></span>
      </div>
    </div>
  </div>`;
  }

  async sendTestMessage() {
    const {Notifier, i18n} = this.ctx;
    if (!this.isChannelConfigured()) {
      Notifier.toast(i18n.t('subscribeNotificationInvalid'), 'warning');
      return;
    }
    try {
      await this.sendToChannel(this.buildTestText());
      Notifier.toast(i18n.t('subscribeNotificationTestOk'), 'success');
    } catch (error) {
      Notifier.toast(`${i18n.t('subscribeNotificationTestFail')}：${error.message}`, 'error');
    }
  }

  dispose() {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.sender?.dispose();
    this.sender = null;
  }
}
