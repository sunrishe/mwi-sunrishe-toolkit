// 订阅通知回归测试：队列跟踪器（id 判定）、渠道请求构造（钉钉/企微/飞书）、
// 推送限速器，以及头部 @connect 与存储键契约。
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readSourceFile, readVmSource} = require('./helpers/source.js');

const SUBSCRIBE_SYMBOLS = [
  'sortActions', 'QueueChangeTracker', 'CHANNEL_LIMITS', 'truncateByChars', 'truncateByUtf8Bytes',
  'truncateForChannel', 'createDefaultHmac', 'buildDingTalkRequest', 'buildWeComRequest', 'buildFeishuRequest',
  'parseChannelResponse', 'NotificationSender', 'SubscribeNotificationFeature', 'normalizeFeishuHookUrl'
];

function loadSubscribeModule(files, sandbox = {}) {
  const source = readVmSource(...files);
  const context = vm.createContext({
    console,
    TextEncoder,
    TextDecoder,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Date,
    JSON,
    ...sandbox
  });
  // 只取被测文件实际导出的符号（const/class 不会挂到沙箱全局，需要显式收集）。
  const tail = SUBSCRIBE_SYMBOLS.map((name) => `'${name}': typeof ${name} !== 'undefined' ? ${name} : undefined`).join(
    ', '
  );
  return vm.runInContext(`${source}\n;({${tail}});`, context);
}

function makeAction(overrides = {}) {
  return {
    id: 1,
    characterID: 100,
    partyID: 0,
    actionHrid: '/actions/smithing/smith_bar',
    difficultyTier: 0,
    hasMaxCount: true,
    maxCount: 20,
    currentCount: 0,
    ordinal: 0,
    isDone: false,
    ...overrides
  };
}

// ---- 队列跟踪器 ----

test('队列跟踪器：基线重建不产生事件且按官方规则排序（组队行动在前）', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  const actions = [
    makeAction({id: 2, ordinal: 1}), makeAction({id: 1, ordinal: 1, partyID: 5}), makeAction({id: 3, ordinal: 0})
  ];
  tracker.setQueue(actions, 100);
  assert.equal(tracker.getCurrentTask().id, 1);
  assert.equal(tracker.getQueueLength(), 3);
  // partyID 非 0（组队/战斗行动）排在个人生活行动之前。
  assert.deepEqual(
    [
      ...tracker.getQueuePreview(3)
    ].map((action) => action.id),
    [
      1, 3, 2
    ]
  );
});

test('队列跟踪器：生活行动完成不影响正在执行的战斗任务', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  const combat = makeAction({
    id: 9,
    actionHrid: '/actions/combat/golem_cave',
    partyID: 635372,
    difficultyTier: 2,
    hasMaxCount: false
  });
  const skilling = makeAction({id: 8, actionHrid: '/actions/farming/milking', maxCount: 50, ordinal: 1});
  tracker.setQueue(
    [
      combat, skilling
    ],
    100
  );
  const event = tracker.applyActionsUpdate([
    makeAction({id: 8, maxCount: 50, ordinal: 1, isDone: true})
  ]);
  assert.equal(event, null);
  assert.equal(tracker.getCurrentTask().id, 9);
});

test('队列跟踪器：同 id 的 action_completed 是任务内部变动，不触发事件', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7, maxCount: 0, hasMaxCount: false, currentCount: 10})
    ],
    100
  );
  const event = tracker.applyActionCompleted(makeAction({id: 7, hasMaxCount: false, currentCount: 11}));
  assert.equal(event, null);
  assert.equal(tracker.getCurrentTask().currentCount, 11);
  assert.equal(tracker.getCurrentTask().id, 7);
});

test('队列跟踪器：当前任务 isDone 结束且队首变化触发完成事件', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  const completed = makeAction({id: 7, currentCount: 20});
  const next = makeAction({id: 8, actionHrid: '/actions/farming/milking', maxCount: 50, currentCount: 0, ordinal: 1});
  tracker.setQueue(
    [
      completed, next
    ],
    100
  );
  const event = tracker.applyActionsUpdate([
    makeAction({id: 7, currentCount: 20, isDone: true})
  ]);
  assert.equal(event.type, 'completed');
  assert.equal(event.completedTask.id, 7);
  assert.equal(event.newTask.id, 8);
  assert.equal(event.isEmpty, false);
  assert.deepEqual(
    [
      ...event.queue
    ].map((action) => action.id),
    [
      8
    ]
  );
  assert.equal(tracker.getCurrentTask().id, 8);
});

test('队列跟踪器：有限任务未完成次数被移除按取消处理，静默重建不推送', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7, currentCount: 5}), makeAction({id: 8, ordinal: 1})
    ],
    100
  );
  const event = tracker.applyActionsUpdate([
    makeAction({id: 7, currentCount: 5, isDone: true})
  ]);
  assert.equal(event, null);
  assert.equal(tracker.getCurrentTask().id, 8);
});

test('队列跟踪器：队首前插入新任务属于队列编辑，不触发事件', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7}), makeAction({id: 8, ordinal: 1})
    ],
    100
  );
  const event = tracker.applyActionsUpdate([
    makeAction({id: 7, ordinal: 1}), makeAction({id: 9, ordinal: 0})
  ]);
  assert.equal(event, null);
  assert.equal(tracker.getCurrentTask().id, 9);
});

test('队列跟踪器：最后一条任务完成后队列腾空事件', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7, currentCount: 20})
    ],
    100
  );
  const event = tracker.applyActionsUpdate([
    makeAction({id: 7, currentCount: 20, isDone: true})
  ]);
  assert.equal(event.type, 'completed');
  assert.equal(event.isEmpty, true);
  assert.equal(event.newTask, null);
});

test('队列跟踪器：单步任务只推 action_completed 且 isDone=true 也按完成处理', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7, currentCount: 20}), makeAction({id: 8, ordinal: 1})
    ],
    100
  );
  const event = tracker.applyActionCompleted(makeAction({id: 7, currentCount: 20, isDone: true}));
  assert.equal(event.type, 'completed');
  assert.equal(event.newTask.id, 8);
});

test('队列跟踪器：进度计数基线——重置后按会话增量统计，任务切换后恢复原始累计值', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      makeAction({id: 7, hasMaxCount: false, currentCount: 11885}), makeAction({id: 8, ordinal: 1})
    ],
    100
  );
  // 未设置基线时返回原始累计值。
  assert.equal(tracker.getProgressCount(tracker.getCurrentTask()), 11885);
  tracker.resetProgressBaseline();
  assert.equal(tracker.getProgressCount(tracker.getCurrentTask()), 0);
  tracker.applyActionCompleted(makeAction({id: 7, hasMaxCount: false, currentCount: 11890}));
  assert.equal(tracker.getProgressCount(tracker.getCurrentTask()), 5);
  // 任务切换（队首 id 变化）后基线清除，新任务恢复原始累计口径。
  tracker.applyActionsUpdate([
    makeAction({id: 7, hasMaxCount: false, currentCount: 11890, isDone: true})
  ]);
  assert.equal(tracker.getCurrentTask().id, 8);
  assert.equal(tracker.getProgressCount(tracker.getCurrentTask()), 0);
  // 基线整体重建（页面加载/重连）同样清除。
  tracker.setQueue(
    [
      makeAction({id: 8, hasMaxCount: false, currentCount: 3, ordinal: 1})
    ],
    100
  );
  assert.equal(tracker.getProgressCount(tracker.getCurrentTask()), 3);
});

test('组队重新准备：进度计数与进度计时重置；基线建立时已准备、取消准备、他人准备均不重置', () => {
  const feature = createTextFeature({isTestServer: false});
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  const combat = () =>
    makeAction({
      id: 9,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      difficultyTier: 2,
      hasMaxCount: false,
      currentCount: 11885
    });
  // 基线建立时本方已处于准备状态：不视为重新准备，进度仍为原始累计值。
  feature.onInitCharacterData({
    character: {id: 42},
    characterActions: [
      combat()
    ],
    partyInfo: {partySlotMap: {1: {characterID: 42, isReady: true}}}
  });
  assert.equal(feature.partyReady, true);
  assert.equal(feature.tracker.getProgressCount(feature.tracker.getCurrentTask()), 11885);
  // 取消准备：状态变化但不重置。
  feature.handlePartyUpdated({partyInfo: {partySlotMap: {1: {characterID: 42, isReady: false}}}});
  assert.equal(feature.tracker.getProgressCount(feature.tracker.getCurrentTask()), 11885);
  // 再次准备：重置基线与进度计时。
  const before = feature.lastProgressAt;
  feature.handlePartyUpdated({partyInfo: {partySlotMap: {1: {characterID: 42, isReady: true}}}});
  assert.equal(feature.tracker.getProgressCount(feature.tracker.getCurrentTask()), 0);
  assert.ok(feature.lastProgressAt >= before);
  // 战斗继续，计数按会话增量展示。
  feature.tracker.applyActionCompleted(
    makeAction({
      id: 9,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      difficultyTier: 2,
      hasMaxCount: false,
      currentCount: 11887
    })
  );
  assert.equal(feature.tracker.getProgressCount(feature.tracker.getCurrentTask()), 2);
  // 他人准备状态变化不影响本方基线。
  feature.handlePartyUpdated({partyInfo: {partySlotMap: {1: {characterID: 999, isReady: true}}}});
  assert.equal(feature.tracker.getProgressCount(feature.tracker.getCurrentTask()), 2);
  // 进度文案按会话增量输出。
  const lines = feature.buildProgressText(feature.tracker.getCurrentTask()).split('\n');
  assert.equal(lines[1], '⏳ Golem Cave (T2)：已完成 2 次');
});

test('会话监控：WS 断开后暂停定时推送，重连后恢复，init_character_data 确认在线', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  // 进度周期已到期。
  feature.lastProgressAt = Date.now() - 31 * 60000;
  feature.tracker.setQueue(
    [
      makeAction({id: 5, maxCount: 10})
    ],
    '42'
  );
  // 断连（被挤掉/断网）：即使进度到期也不推送。
  feature.onWsState({state: 'closed', url: 'wss://www.milkywayidle.com/ws'});
  assert.equal(feature.wsConnected, false);
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  // 重连（WS open）：恢复定时推送。
  feature.onWsState({state: 'open', url: 'wss://www.milkywayidle.com/ws'});
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  // init_character_data 重建基线同样确认会话在线（重连成功路径）。
  feature.onWsState({state: 'closed'});
  feature.onInitCharacterData({
    character: {id: 42},
    characterActions: [
      makeAction({id: 5, maxCount: 10})
    ]
  });
  assert.equal(feature.wsConnected, true);
  // 断连期间空队列提醒同样暂停，重连后恢复。
  feature.onWsState({state: 'closed'});
  feature.tracker.setQueue([], '42');
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  feature.onWsState({state: 'open'});
  feature.checkProgress();
  assert.equal(submitted.length, 2);
});

// ---- 渠道请求构造与截断 ----

test('钉钉请求：加签追加 timestamp/sign 且 sign 做 URL 编码', async () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const hmac = async (key, message) => `${key}|${message}`;
  const request = await module.buildDingTalkRequest(
    {url: 'https://oapi.dingtalk.com/robot/send?access_token=abc', secret: 's3cret', content: 'hello'},
    {timestampMs: 1699999999999, hmac}
  );
  const sign = encodeURIComponent('s3cret|1699999999999\ns3cret');
  assert.equal(
    request.url,
    `https://oapi.dingtalk.com/robot/send?access_token=abc&timestamp=1699999999999&sign=${sign}`
  );
  assert.deepEqual(JSON.parse(request.body), {msgtype: 'text', text: {content: 'hello'}});
});

test('钉钉请求：未配置 secret 时不加签', async () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const request = await module.buildDingTalkRequest(
    {url: 'https://oapi.dingtalk.com/robot/send?access_token=abc', secret: '', content: 'x'},
    {hmac: async () => 'ignored'}
  );
  assert.equal(request.url, 'https://oapi.dingtalk.com/robot/send?access_token=abc');
});

test('企业微信请求：纯文本消息体无签名', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const request = module.buildWeComRequest({
    url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=k1',
    content: 'a\nb'
  });
  assert.deepEqual(JSON.parse(request.body), {msgtype: 'text', text: {content: 'a\nb'}});
});

test('飞书请求：秒级时间戳签名放请求头，待签串为 "{timestamp}\\n{secret}" 且消息体为空', async () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const calls = [];
  const hmac = async (key, message) => {
    calls.push({key, message});
    return 'sig==';
  };
  const request = await module.buildFeishuRequest(
    {url: 'https://open.feishu.cn/open-apis/bot/v2/hook/x', secret: 'fs', content: 'hi'},
    {timestampSec: 1700000000, hmac}
  );
  assert.deepEqual(calls, [
    {key: '1700000000\nfs', message: ''}
  ]);
  assert.equal(request.headers['X-Lark-Request-Timestamp'], '1700000000');
  assert.equal(request.headers['X-Lark-Request-Sign'], 'sig==');
  assert.deepEqual(JSON.parse(request.body), {msg_type: 'text', content: {text: 'hi'}});
});

test('默认 HMAC 与 Node crypto 的 HmacSHA256-Base64 一致（钉钉口径）', async () => {
  const module = loadSubscribeModule(
    [
      'src/modules/subscribe-notification/notifier.js'
    ],
    {
      crypto: require('node:crypto').webcrypto
    }
  );
  const hmac = module.createDefaultHmac();
  assert.ok(hmac, '环境应支持 WebCrypto');
  const secret = 'secret-a';
  const message = '1699999999999\nsecret-a';
  const expected = require('node:crypto').createHmac('sha256', secret).update(message).digest('base64');
  assert.equal(await hmac(secret, message), expected);
});

test('渠道截断：钉钉按字符、企微按 UTF-8 字节且不截出残缺字符', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const long = '梅'.repeat(600);
  assert.equal(module.truncateByChars(long, 500).length, 500);
  assert.equal(module.truncateByChars('abc', 500), 'abc');
  const truncated = module.truncateByUtf8Bytes('你好世界', 7);
  assert.equal(truncated, '你…');
  assert.ok(Buffer.byteLength(truncated, 'utf8') <= 7);
  assert.ok(!truncated.includes('\uFFFD'), '不得截出残缺多字节字符');
  assert.equal(module.truncateForChannel('dingtalk', long).length, 500);
  assert.equal(module.truncateForChannel('wecom', '你好'), '你好');
  assert.equal(module.truncateForChannel('feishu', 'x'), 'x');
});

test('渠道响应解析：钉钉/企微看 errcode，飞书看 code，非 JSON 视为失败', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  assert.deepEqual(
    {...module.parseChannelResponse('dingtalk', '{"errcode":0,"errmsg":"ok"}')},
    {
      ok: true,
      code: 0,
      msg: 'ok'
    }
  );
  assert.equal(module.parseChannelResponse('wecom', '{"errcode":93000,"errmsg":"invalid"}').ok, false);
  assert.equal(module.parseChannelResponse('feishu', '{"code":0,"msg":"success"}').ok, true);
  assert.equal(module.parseChannelResponse('feishu', '{"code":19021,"msg":"sign error"}').ok, false);
  assert.equal(module.parseChannelResponse('dingtalk', '<html>').ok, false);
});

test('飞书 Hook 地址归一化：完整地址原样保留，仅填 hook-id 自动拼接官方地址', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  assert.equal(
    module.normalizeFeishuHookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc-123'),
    'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123'
  );
  assert.equal(module.normalizeFeishuHookUrl('abc-123'), 'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123');
  assert.equal(module.normalizeFeishuHookUrl('  '), '');
});

// ---- 通知文案格式 ----

const NOTIFICATION_TEXTS = {
  subscribeNotificationMsgTitle: '行动队列',
  subscribeNotificationTaskCompleted: '完成',
  subscribeNotificationTaskStarted: '开始',
  subscribeNotificationTaskWithCount: '{0}（{1}/{2}）',
  subscribeNotificationTaskUnlimited: '{0}（无上限）',
  subscribeNotificationQueueLabel: '等待队列：',
  subscribeNotificationQueueMore: '…共 {0} 项',
  subscribeNotificationQueueEmpty: '行动队列已空，请及时补充',
  subscribeNotificationProgressDone: '{0}：已完成 {1} 次',
  subscribeNotificationProgressRemaining: '，剩余 {0} 次',
  subscribeNotificationServerTest: '测试服'
};

const ACTION_NAMES = {
  '/actions/smithing/smith_bar': '锻造',
  '/actions/farming/milking': '挤奶',
  '/actions/woodcutting/collect_logging': '伐木',
  '/actions/mining/collect_ore': '采矿',
  '/actions/fishing/collect_fish': '捕鱼',
  '/actions/combat/golem_cave': 'Golem Cave'
};

function createTextFeature({isTestServer = true} = {}) {
  const module = loadSubscribeModule(
    [
      'src/modules/subscribe-notification/notifier.js', 'src/modules/subscribe-notification/queue-tracker.js', 'src/modules/subscribe-notification/index.js'
    ],
    {
      window: {addEventListener() {}},
      localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
      document: {getElementById: () => null},
      StyleService: {ensure() {}}
    }
  );
  const feature = new module.SubscribeNotificationFeature({
    CONFIG: {isGameSite: true, isTestServer, characterId: '42'},
    i18n: {
      t(key, ...args) {
        let text = NOTIFICATION_TEXTS[key] ?? key;
        args.forEach((value, index) => {
          text = text.replace(`{${index}}`, String(value));
        });
        return text;
      }
    },
    DataHub: {getLocalizedGameName: (group, hrid) => ACTION_NAMES[hrid] || hrid}
  });
  feature.characterName = 'xiao711';
  feature.tracker.setQueue(
    [
      makeAction({
        id: 1,
        actionHrid: '/actions/farming/milking',
        maxCount: 50,
        ordinal: 0
      }), makeAction({
        id: 2,
        actionHrid: '/actions/woodcutting/collect_logging',
        maxCount: 100,
        ordinal: 1
      }), makeAction({id: 3, actionHrid: '/actions/mining/collect_ore', maxCount: 80, ordinal: 2}), makeAction({
        id: 4,
        actionHrid: '/actions/fishing/collect_fish',
        maxCount: 30,
        ordinal: 3
      })
    ],
    '42'
  );
  return feature;
}

test('通知文案：标题不含角色名、队列最多 3 项、时间行只显示时间、角色名行带测试服标识', () => {
  const feature = createTextFeature();
  const event = {
    type: 'completed',
    completedTask: makeAction({id: 0, actionHrid: '/actions/smithing/smith_bar', maxCount: 20, currentCount: 20}),
    newTask: feature.tracker.getCurrentTask(),
    queue: feature.tracker.getQueuePreview(3),
    isEmpty: false
  };
  const lines = feature.buildCompletionText(event).split('\n');
  assert.equal(lines[0], '【MST】行动队列');
  assert.equal(lines[1], '✅ 完成：锻造（20/20）');
  assert.equal(lines[2], '▶️ 开始：挤奶（0/50）');
  assert.equal(lines[3], '等待队列：');
  assert.deepEqual(lines.slice(4, 7), [
    '1. 伐木（0/100）', '2. 采矿（0/80）', '3. 捕鱼（0/30）'
  ]);
  assert.match(lines[lines.length - 2], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(lines[lines.length - 1], 'xiao711 · 测试服');
  // 等待队列不含正在执行的队首任务。
  assert.ok(!lines.some((line) => line.includes('1. 挤奶')));
});

test('通知文案：进度通知与完成通知同构（标题 + 进度 + 等待队列 + 时间 + 角色名行）', () => {
  const feature = createTextFeature({isTestServer: false});
  const lines = feature
    .buildProgressText(makeAction({id: 1, actionHrid: '/actions/farming/milking', maxCount: 50, currentCount: 23}))
    .split('\n');
  assert.equal(lines[0], '【MST】行动队列');
  assert.equal(lines[1], '⏳ 挤奶：已完成 23 次，剩余 27 次');
  assert.equal(lines[2], '等待队列：');
  assert.deepEqual(lines.slice(3, 6), [
    '1. 伐木（0/100）', '2. 采矿（0/80）', '3. 捕鱼（0/30）'
  ]);
  assert.match(lines[6], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(lines[7], 'xiao711');
  assert.equal(lines.length, 8);
});

test('通知文案：队列为空提醒与完成通知同构', () => {
  const feature = createTextFeature({isTestServer: false});
  const lines = feature.buildEmptyText().split('\n');
  assert.equal(lines[0], '【MST】行动队列');
  assert.equal(lines[1], '⚠️ 行动队列已空，请及时补充');
  assert.match(lines[2], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(lines[3], 'xiao711');
  assert.equal(lines.length, 4);
});

test('队列为空提醒：固定每分钟推送一条，有任务期间不推送', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  // 队列为空且距上次提醒超过 1 分钟：触发一次并推进计时。
  feature.lastEmptyRemindAt = 0;
  const clock = {now: 1000000};
  const originalNow = Date.now;
  Date.now = () => clock.now;
  try {
    feature.checkProgress();
    assert.ok(Date.now() - feature.lastEmptyRemindAt < 50);
    // 1 分钟内不重复推送。
    Date.now = () => clock.now + 30000;
    feature.lastEmptyRemindAt = Date.now();
    const before = feature.lastEmptyRemindAt;
    feature.checkProgress();
    assert.equal(feature.lastEmptyRemindAt, before);
    // 超过 1 分钟再次推送。
    Date.now = () => clock.now + 61000;
    feature.checkProgress();
    assert.equal(feature.lastEmptyRemindAt, clock.now + 61000);
  } finally {
    Date.now = originalNow;
  }
  // 有任务时不推送空队列提醒（不构建提醒文案），仅刷新计时。
  feature.tracker.setQueue(
    [
      makeAction({id: 5, maxCount: 10})
    ],
    '42'
  );
  feature.lastEmptyRemindAt = 0;
  let emptyBuilt = 0;
  const originalBuildEmpty = feature.buildEmptyText.bind(feature);
  feature.buildEmptyText = () => {
    emptyBuilt++;
    return originalBuildEmpty();
  };
  feature.checkProgress();
  assert.equal(emptyBuilt, 0);
  assert.ok(feature.lastEmptyRemindAt > 0);
});

test('通知文案：进度通知的战斗任务带难度后缀', () => {
  const feature = createTextFeature({isTestServer: false});
  const lines = feature
    .buildProgressText(
      makeAction({
        id: 9,
        actionHrid: '/actions/combat/golem_cave',
        partyID: 635372,
        difficultyTier: 2,
        hasMaxCount: false,
        currentCount: 11885
      })
    )
    .split('\n');
  assert.equal(lines[1], '⏳ Golem Cave (T2)：已完成 11885 次');
});

test('通知文案：战斗任务带难度后缀，口径与官方一致（difficultyTier >= 1 显示 (T<tier>)）', () => {
  const feature = createTextFeature();
  assert.equal(
    feature.describeTask(
      makeAction({
        id: 9,
        actionHrid: '/actions/combat/golem_cave',
        partyID: 635372,
        difficultyTier: 2,
        hasMaxCount: false
      })
    ),
    'Golem Cave (T2)（无上限）'
  );
  assert.equal(
    feature.describeTask(makeAction({id: 9, actionHrid: '/actions/combat/golem_cave', hasMaxCount: false})),
    'Golem Cave（无上限）'
  );
});

test('消息类型开关：默认全开，可分别关闭完成与进度推送', () => {
  const feature = createTextFeature();
  feature.config = feature.normalizeConfig({});
  // 旧配置缺字段时 normalize 默认全开。
  assert.equal(feature.config.notifyComplete, true);
  assert.equal(feature.config.notifyProgress, true);
  feature.updateConfig({notifyComplete: false, notifyProgress: false});
  assert.equal(feature.config.notifyComplete, false);
  assert.equal(feature.config.notifyProgress, false);
  // 关闭后 handleEvent 仍重置进度计时，但不生成推送。
  const before = feature.lastProgressAt;
  feature.handleEvent({
    type: 'completed',
    completedTask: makeAction({id: 1, maxCount: 50, currentCount: 50}),
    newTask: feature.tracker.getCurrentTask(),
    queue: feature.tracker.getQueuePreview(3),
    isEmpty: false
  });
  assert.ok(feature.lastProgressAt >= before);
  assert.equal(feature.config.notifyComplete, false);
});

test('配置按角色分用户存储：不同角色互不影响，旧扁平结构迁移到当前角色', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  const module = loadSubscribeModule(
    [
      'src/modules/subscribe-notification/notifier.js', 'src/modules/subscribe-notification/queue-tracker.js', 'src/modules/subscribe-notification/index.js'
    ],
    {
      window: {addEventListener() {}},
      localStorage: storage,
      document: {getElementById: () => null},
      StyleService: {ensure() {}}
    }
  );
  const createFeature = (characterId) =>
    new module.SubscribeNotificationFeature({
      CONFIG: {isGameSite: true, isTestServer: false, characterId},
      i18n: {t: (key) => key},
      DataHub: {getLocalizedGameName: (group, hrid) => hrid},
      STORAGE_KEYS: {SUBSCRIBE_NOTIFICATION: 'MST_SUBSCRIBE_config'}
    });

  const featureA = createFeature('A');
  featureA.config = featureA.readConfig();
  featureA.updateConfig({enabled: true, channel: 'feishu', progressIntervalMin: 45});

  // 角色 B 读到的是默认配置，互不影响。
  const featureB = createFeature('B');
  const configB = featureB.readConfig();
  assert.equal(configB.enabled, false);
  assert.equal(configB.channel, 'dingtalk');

  // 角色 A 重新读取保留自己的配置。
  const featureA2 = createFeature('A');
  const configA2 = featureA2.readConfig();
  assert.equal(configA2.enabled, true);
  assert.equal(configA2.channel, 'feishu');
  assert.equal(configA2.progressIntervalMin, 45);

  // 旧版扁平结构（无 characters 分桶）迁移到当前角色名下。
  store.set('MST_SUBSCRIBE_config', JSON.stringify({enabled: true, channel: 'wecom'}));
  const featureC = createFeature('C');
  const configC = featureC.readConfig();
  assert.equal(configC.enabled, true);
  assert.equal(configC.channel, 'wecom');
});

// ---- 推送限速器 ----

function createFakeTimers() {
  const scheduled = [];
  let now = 1000000;
  return {
    scheduled,
    clock: () => now,
    advance(ms) {
      now += ms;
      const due = scheduled.filter((timer) => timer.at <= now);
      due.forEach((timer) => {
        scheduled.splice(scheduled.indexOf(timer), 1);
        timer.fn();
      });
    },
    schedule: (fn, ms) => {
      const timer = {fn, at: now + ms};
      scheduled.push(timer);
      return timer;
    },
    cancel: (timer) => {
      const index = scheduled.indexOf(timer);
      if (index >= 0) scheduled.splice(index, 1);
    }
  };
}

test('推送限速器：超过间隔立即发送，间隔内提交合并为最新内容', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const timers = createFakeTimers();
  const sent = [];
  const sender = new module.NotificationSender({
    send: async (text) => sent.push(text),
    minIntervalMs: 10000,
    clock: timers.clock,
    schedule: timers.schedule,
    cancel: timers.cancel
  });
  sender.submit('first');
  assert.deepEqual(sent, [
    'first'
  ]);
  // 间隔内的提交进入等待并被后续提交覆盖为最新内容。
  sender.submit('second');
  sender.submit('third');
  timers.advance(10000);
  assert.deepEqual(sent, [
    'first', 'third'
  ]);
});

test('推送限速器：每分钟上限生效，窗口内推迟到最早一条过期', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const timers = createFakeTimers();
  const sent = [];
  const sender = new module.NotificationSender({
    send: async (text) => sent.push(text),
    minIntervalMs: 0,
    perMinuteLimit: 2,
    clock: timers.clock,
    schedule: timers.schedule,
    cancel: timers.cancel
  });
  sender.submit('a');
  assert.deepEqual(sent, [
    'a'
  ]);
  sender.submit('b');
  assert.deepEqual(sent, [
    'a', 'b'
  ]);
  // 窗口内已有 2 条，第三条被推迟。
  sender.submit('c');
  assert.deepEqual(sent, [
    'a', 'b'
  ]);
  timers.advance(59000);
  assert.deepEqual(sent, [
    'a', 'b'
  ]);
  timers.advance(1000);
  assert.deepEqual(sent, [
    'a', 'b', 'c'
  ]);
});

test('推送限速器：发送失败按退避重试，次数用尽回调 onGiveUp', async () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/notifier.js'
  ]);
  const timers = createFakeTimers();
  const attempts = [];
  let gaveUp = 0;
  const sender = new module.NotificationSender({
    send: async () => {
      attempts.push(1);
      throw new Error('rate limited');
    },
    minIntervalMs: 0,
    retryDelaysMs: [
      10, 20
    ],
    clock: timers.clock,
    schedule: timers.schedule,
    cancel: timers.cancel,
    onGiveUp: () => gaveUp++
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  // 失败捕获在异步链路里，先让微任务落地再推进假时钟。
  sender.submit('retry-text');
  await flush();
  await flush();
  timers.advance(100);
  await flush();
  await flush();
  timers.advance(100);
  await flush();
  await flush();
  timers.advance(100);
  await flush();
  assert.equal(attempts.length, 3);
  assert.equal(gaveUp, 1);
});

// ---- 契约：头部域名、存储键与 GM 请求链路 ----

test('userscript 头部补齐三个渠道 @connect 域名', () => {
  const header = readSourceFile('userscript-header.txt');
  for (const domain of [
    'oapi.dingtalk.com', 'qyapi.weixin.qq.com', 'open.feishu.cn'
  ]) {
    assert.ok(header.includes(`@connect            ${domain}`), `缺少 @connect ${domain}`);
  }
});

test('订阅通知存储键登记到 STORAGE_KEYS，模块通过 GmApi 发请求', () => {
  const dataSource = readSourceFile('src/common/data.js');
  assert.ok(dataSource.includes("SUBSCRIBE_NOTIFICATION: 'MST_SUBSCRIBE_config'"));
  const moduleSource =
    readSourceFile('src/modules/subscribe-notification/index.js') +
    readSourceFile('src/modules/subscribe-notification/notifier.js');
  assert.ok(moduleSource.includes("addEventListener('mst:ws:init-character-data'"));
  assert.ok(moduleSource.includes("addEventListener('mst:ws:message'"));
  assert.ok(moduleSource.includes("addEventListener('mst:ws:state'"));
  assert.match(moduleSource, /xmlHttpRequestApi/);
  assert.doesNotMatch(moduleSource, /GM_xmlhttpRequest|GM\.xmlHttpRequest/);
});
