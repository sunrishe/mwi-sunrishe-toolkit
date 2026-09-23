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

test('队列跟踪器：有限任务未完成次数被移除按取消处理，只报任务开始不报完成', () => {
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
  assert.equal(event.type, 'started');
  assert.equal(event.completedTask, null);
  assert.equal(event.newTask.id, 8);
  assert.equal(tracker.getCurrentTask().id, 8);
});

test('队列跟踪器：空队列入队只报任务开始，不报完成', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue([], '42');
  const event = tracker.applyActionsUpdate([
    makeAction({id: 9})
  ]);
  assert.equal(event.type, 'started');
  assert.equal(event.completedTask, null);
  assert.equal(event.newTask.id, 9);
  assert.equal(event.isEmpty, false);
});

test('队列跟踪器：等待队列概览不含队首、最多 3 项，长度按全部等待任务计', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  tracker.setQueue(
    [
      // 队首正在跑的迷宫：不列入（正在执行的任务由开始行播报）。
      makeAction({
        id: 1,
        actionHrid: '/actions/labyrinth/explore',
        hasMaxCount: false,
        maxCount: 0,
        currentCount: 11885,
        ordinal: 0
      }), makeAction({
        id: 2,
        actionHrid: '/actions/woodcutting/collect_logging',
        maxCount: 100,
        currentCount: 12,
        ordinal: 1
      }), makeAction({
        id: 3,
        actionHrid: '/actions/mining/collect_ore',
        maxCount: 50,
        currentCount: 0,
        ordinal: 2
      }), makeAction({
        id: 4,
        actionHrid: '/actions/fishing/collect_fish',
        maxCount: 30,
        currentCount: 30,
        ordinal: 3
      }), makeAction({
        id: 5,
        actionHrid: '/actions/combat/golem_cave',
        hasMaxCount: false,
        maxCount: 0,
        currentCount: 40,
        ordinal: 4
      })
    ],
    '42'
  );
  assert.deepEqual(
    [
      ...tracker.getWaitingQueuePreview(3)
    ].map((task) => task.id),
    [
      2, 3, 4
    ]
  );
  assert.equal(tracker.getWaitingQueueLength(), 4);
});

test('队列跟踪器：队首被顶掉后接上的新任务按任务开始上报（不报完成）', () => {
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
  assert.equal(event.type, 'started');
  assert.equal(event.completedTask, null);
  assert.equal(event.newTask.id, 9);
  assert.equal(tracker.getCurrentTask().id, 9);
});

test('队列跟踪器：被顶掉的任务重新回到队首算一次新的任务开始（id 不变也重发）', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  const maze = () =>
    makeAction({
      id: 1,
      actionHrid: '/actions/labyrinth/explore',
      hasMaxCount: false,
      maxCount: 0,
      currentCount: 11885
    });
  tracker.setQueue(
    [
      maze()
    ],
    '42'
  );
  // 组队战斗插入队首（partyID 非 0 排在前面），迷宫被挤到等待区。
  const battle = tracker.applyActionsUpdate([
    makeAction({
      id: 5,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      hasMaxCount: false,
      currentCount: 0,
      ordinal: 1
    })
  ]);
  assert.equal(battle.type, 'started');
  assert.equal(battle.newTask.id, 5);
  // 战斗结束出队，迷宫回到队首：迷宫自身 id 没变，仍算一次新的任务开始。
  // （无上限行动出队无法区分取消，按任务结束上报，所以这里同时带完成信息。）
  const resumed = tracker.applyActionsUpdate([
    makeAction({
      id: 5,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      hasMaxCount: false,
      currentCount: 3,
      isDone: true
    })
  ]);
  assert.equal(resumed.completedTask.id, 5);
  assert.equal(resumed.newTask.id, 1);
  assert.equal(resumed.newTask.actionHrid, '/actions/labyrinth/explore');
  // 迷宫继续跑：同 id 的进度更新不产生事件（在队首连续重复执行不算重新开始）。
  assert.equal(tracker.applyActionCompleted(maze()), null);
  assert.equal(
    tracker.applyActionsUpdate([
      maze()
    ]),
    null
  );
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

// ---- 基线可信度：没有数据不等于队列为空 ----

test('队列跟踪器：hasBaseline 只在全量基线重建后为真，reset 清除', () => {
  const module = loadSubscribeModule([
    'src/modules/subscribe-notification/queue-tracker.js'
  ]);
  const tracker = new module.QueueChangeTracker();
  assert.equal(tracker.hasBaseline, false);
  // 增量消息不构成基线：只有 init_character_data 的全量快照才算。
  tracker.applyActionsUpdate([
    makeAction({id: 7})
  ]);
  assert.equal(tracker.hasBaseline, false);
  tracker.setQueue(
    [
      makeAction({id: 8})
    ],
    '42'
  );
  assert.equal(tracker.hasBaseline, true);
  tracker.reset('42');
  assert.equal(tracker.hasBaseline, false);
  assert.equal(tracker.getCurrentTask(), null);
});

test('未拿到基线不判定队列为空：基线重建为空队列后才恢复提醒', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  feature.onWsState({state: 'open'});
  // 页面在未登录 / 断线状态打开：队列为空只是"没有数据"，不推送提醒，也不推进计时。
  feature.tracker.reset('42');
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  assert.equal(feature.lastEmptyRemindAt, 0);
  // 基线重建（队列确实为空）后按每分钟节奏提醒。
  feature.onInitCharacterData({character: {id: 42}, characterActions: []});
  assert.equal(feature.tracker.hasBaseline, true);
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /⚠️ 行动队列已空，请及时补充/);
});

test('在线状态需确认：WS open 或 init_character_data 前不推定时的进度与空队列通知', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  // 默认未确认在线：即使进度已到期也不推送。
  assert.equal(feature.wsConnected, false);
  feature.lastProgressAt = 0;
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  // WS open 确认在线后恢复推送。
  feature.onWsState({state: 'open'});
  feature.lastProgressAt = Date.now() - 31 * 60000;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /⏳ 挤奶：已完成 0 次，剩余 50 次/);
});

test('订阅关闭期间仍跟踪队列：不补推关闭期变动，重新开启后按当前队列继续', () => {
  const feature = createTextFeature();
  feature.config = feature.normalizeConfig({});
  assert.equal(feature.config.enabled, false);
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  feature.onWsState({state: 'open'});
  // 关闭期间队首任务完成、新任务入队：只更新基线，不推送。
  feature.onWsMessage({
    type: 'actions_updated',
    endCharacterActions: [
      makeAction({
        id: 1,
        maxCount: 50,
        currentCount: 50,
        isDone: true
      }), makeAction({id: 5, actionHrid: '/actions/smithing/smith_bar', maxCount: 20, currentCount: 0})
    ]
  });
  assert.deepEqual(submitted, []);
  assert.equal(feature.tracker.getCurrentTask().id, 5);
  // 重新开启：计时重置，不按关闭前的旧计时立即推送。
  feature.toggleEnabled(true);
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  // 到期后按当前队首推送，说明关闭期间跟踪是连续的、没有留下陈旧基线。
  feature.lastProgressAt = Date.now() - 31 * 60000;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /⏳ 锻造：已完成 0 次，剩余 20 次/);
});

test('角色名行：角色名缺失时退到角色 id，两者都没有时显式标注未知角色', () => {
  const feature = createTextFeature({isTestServer: false});
  // 只有角色 id（基线到达前 URL 参数的兜底）：用 id 区分同站多账号。
  feature.characterName = '';
  feature.characterId = '1234567';
  assert.equal(feature.buildRoleLine(), '角色 1234567');
  // 连角色编号都没有：显式标注未知角色。
  feature.characterId = null;
  assert.equal(feature.buildRoleLine(), '未知角色');
  // 角色名可用时维持原口径，测试服追加标识。
  feature.characterName = 'xiao711';
  feature.ctx.CONFIG.isTestServer = true;
  assert.equal(feature.buildRoleLine(), 'xiao711 · 测试服');
});

test('掉线判据看页面：页头角色信息块消失即按掉线暂停定时推送，恢复后继续', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  feature.onWsState({state: 'open'});
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  // 空队列基线：正常情况下每分钟一条提醒。
  feature.onInitCharacterData({character: {id: 42}, characterActions: []});
  assert.equal(feature.isSessionTrustworthy(), true);
  // 游戏判定掉线后整块 UI 被连接提示面板替换，页头（含右上角头像）消失。
  feature.ctx.GameUiAdapter.headerPresent = false;
  assert.equal(feature.isHeaderPresent(), false);
  assert.equal(feature.isSessionTrustworthy(), false);
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  assert.equal(feature.lastEmptyRemindAt, 0);
  // 页头回来（重连成功）后恢复推送。
  feature.ctx.GameUiAdapter.headerPresent = true;
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /⚠️ 行动队列已空，请及时补充/);
});

test('掉线兜底：长时间收不到任何游戏消息时暂停定时推送，消息恢复后继续', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  feature.onWsState({state: 'open'});
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  // 基线重建（空队列）：正常会按每分钟一条推空队列提醒。
  feature.onInitCharacterData({character: {id: 42}, characterActions: []});
  feature.lastEmptyRemindAt = 0;
  // 模拟会话已死但 close 事件没被观测到：超过 11 分钟没有任何游戏消息（含 pong）。
  feature.lastMessageAt = Date.now() - 12 * 60 * 1000;
  feature.checkProgress();
  assert.deepEqual(submitted, []);
  assert.equal(feature.lastEmptyRemindAt, 0);
  // 收到任意游戏消息（例如 10 分钟一次的 pong）即视为在线，定时推送恢复。
  feature.onWsMessage({type: 'pong'});
  feature.lastEmptyRemindAt = 0;
  feature.checkProgress();
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /⚠️ 行动队列已空，请及时补充/);
});

// ---- 设置界面与默认配置 ----

const SETTINGS_TEXTS = {
  subscribeNotificationTypeQueue: '行动队列',
  subscribeNotificationTypeStart: '任务开始',
  subscribeNotificationTypeComplete: '任务完成',
  subscribeNotificationTypeEmpty: '队列为空',
  subscribeNotificationTypeProgress: '定期进度',
  subscribeNotificationTypeStartTitle: '开始通知说明',
  subscribeNotificationTypeCompleteTitle: '完成通知说明',
  subscribeNotificationTypeEmptyTitle: '空队列说明',
  subscribeNotificationTypeProgressTitle: '进度通知说明'
};

// 设置模板是 uhtml 标签模板；这里用同形状的拼接实现取回字符串，便于断言渲染顺序与默认值。
function createSettingsFeature() {
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
    CONFIG: {isGameSite: true, isTestServer: false, characterId: '42'},
    i18n: {t: (key) => SETTINGS_TEXTS[key] ?? key},
    DataHub: {getLocalizedGameName: (group, hrid) => hrid, getClientDataMap: () => ({})},
    utils: {getGameButtonClass: () => 'game-button'},
    TemplateRenderer: {
      html(strings, ...values) {
        return strings.reduce(
          (text, part, index) => text + part + (index < values.length ? String(values[index] ?? '') : ''),
          ''
        );
      }
    }
  });
  feature.config = feature.normalizeConfig({});
  return feature;
}

test('设置弹窗：消息类型按 任务开始 → 任务完成 → 队列为空 → 定期进度 排列，默认全勾并各带说明', () => {
  const html = createSettingsFeature().settingsTemplate();
  const positions = [
    'start', 'complete', 'empty', 'progress'
  ].map((name) => html.indexOf(`id="mst-subscribe-type-${name}"`));
  positions.forEach((position, index) => assert.ok(position >= 0, `第 ${index + 1} 个消息类型复选框应渲染`));
  assert.deepEqual(
    [
      ...positions
    ].sort((a, b) => a - b),
    positions,
    '消息类型复选框顺序应与设置项顺序一致'
  );
  // 默认全勾；旧配置缺字段视为开启由 normalizeConfig 保证。
  positions.forEach((position, index) => {
    const block = html.slice(position, positions[index + 1] ?? html.length);
    assert.match(block, /\.checked=true/, '消息类型复选框应默认勾选');
  });
  // 每个复选框的悬浮说明是各自口径：说明随标签一起排在对应复选框之前。
  const titles = [
    '开始通知说明', '完成通知说明', '空队列说明', '进度通知说明'
  ].map((text) => html.indexOf(`title=${text}`));
  titles.forEach((position, index) => {
    assert.ok(position >= 0 && position < positions[index], `第 ${index + 1} 个复选框应带自己的悬浮说明`);
    if (index > 0) assert.ok(titles[index - 1] < position, '悬浮说明顺序应与复选框顺序一致');
  });
});

test('默认配置：消息类型全开、最小推送间隔 5 秒，已保存的设置不被覆盖', () => {
  const feature = createSettingsFeature();
  const defaults = feature.normalizeConfig({});
  assert.deepEqual(
    [
      defaults.notifyStart, defaults.notifyComplete, defaults.notifyEmpty, defaults.notifyProgress
    ],
    [
      true, true, true, true
    ]
  );
  assert.equal(defaults.minIntervalSec, 5);
  // 弹窗里的最小推送间隔输入框默认值同样为 5。
  assert.match(feature.settingsTemplate(), /id="mst-subscribe-min-interval"[\s\S]*?\.value=5/);
  // 旧配置缺消息类型字段视为开启，只有显式 false 才关闭。
  const legacy = feature.normalizeConfig({notifyComplete: false, minIntervalSec: 30});
  assert.deepEqual(
    [
      legacy.notifyStart, legacy.notifyComplete, legacy.notifyEmpty, legacy.notifyProgress
    ],
    [
      true, false, true, true
    ]
  );
  // 已保存的间隔按原值生效，推送限速器跟随配置（缺省时兜底同为 5 秒）。
  feature.ensureSender();
  assert.equal(feature.sender.minIntervalMs, 5000);
  feature.updateConfig({minIntervalSec: legacy.minIntervalSec});
  assert.equal(feature.sender.minIntervalMs, 30000);
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
  subscribeNotificationRoleId: '角色 {0}',
  subscribeNotificationRoleUnknown: '未知角色',
  subscribeNotificationServerTest: '测试服'
};

const ACTION_NAMES = {
  '/actions/smithing/smith_bar': '锻造',
  '/actions/farming/milking': '挤奶',
  '/actions/woodcutting/collect_logging': '伐木',
  '/actions/mining/collect_ore': '采矿',
  '/actions/fishing/collect_fish': '捕鱼',
  '/actions/combat/golem_cave': 'Golem Cave',
  // 官方 actionNames 中 /actions/labyrinth/explore 的中文名为「探索迷宫」。
  '/actions/labyrinth/explore': '探索迷宫',
  // 炼金与强化是通用行动，物品名来自 primaryItemHash（官方 getActionDisplayName 同口径）。
  '/actions/alchemy/coinify': '点金',
  '/actions/enhancing/enhance': '强化'
};

const ITEM_NAMES = {
  '/items/sages_mirror': '贤者之镜',
  '/items/azure_pot': '蔚蓝壶'
};

// 官方 actionDetailMap 中与显示名相关的部分（function 决定是否拼物品名）。
const ACTION_FUNCTIONS = {
  '/actions/alchemy/coinify': {function: '/action_functions/alchemy'},
  '/actions/enhancing/enhance': {function: '/action_functions/enhancing'},
  '/actions/combat/golem_cave': {function: '/action_functions/combat'},
  '/actions/smithing/smith_bar': {function: '/action_functions/production'}
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
    DataHub: {
      getLocalizedGameName: (group, hrid) => (group === 'itemNames' ? ITEM_NAMES[hrid] : ACTION_NAMES[hrid]) || hrid,
      getClientDataMap: (key) => (key === 'actionDetailMap' ? ACTION_FUNCTIONS : {})
    },
    // 页头角色信息块（右上角头像所在块）是否在：会话可信判定的第一条件，测试里可切换。
    GameUiAdapter: {
      headerPresent: true,
      query(name) {
        return this.headerPresent && name === 'headerCharacterInfo' ? {} : null;
      }
    }
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

test('行动名按官方口径组装：炼金带物品名、强化只显示物品名，带强化等级与难度后缀', () => {
  const feature = createTextFeature({isTestServer: false});
  const hash = (itemHrid, enhance) => `427012::/item_locations/inventory::${itemHrid}::${enhance}`;
  // 炼金（点金）：行动名: 物品名。
  assert.equal(
    feature.describeTask(
      makeAction({
        id: 1,
        actionHrid: '/actions/alchemy/coinify',
        hasMaxCount: false,
        primaryItemHash: hash('/items/sages_mirror', 0)
      })
    ),
    '点金: 贤者之镜（无上限）'
  );
  // 强化：官方只显示物品名，强化等级以 " +N" 后缀。
  assert.equal(
    feature.describeTask(
      makeAction({
        id: 2,
        actionHrid: '/actions/enhancing/enhance',
        hasMaxCount: false,
        primaryItemHash: hash('/items/azure_pot', 5)
      })
    ),
    '蔚蓝壶 +5（无上限）'
  );
  // 炼金物品带强化等级与难度后缀时依次追加。
  assert.equal(
    feature.describeTask(
      makeAction({
        id: 3,
        actionHrid: '/actions/alchemy/coinify',
        hasMaxCount: false,
        difficultyTier: 2,
        primaryItemHash: hash('/items/sages_mirror', 3)
      })
    ),
    '点金: 贤者之镜 +3 (T2)（无上限）'
  );
  // 哈希缺失时退回行动名（不显示原始哈希，也不显示官方的“物品不可用”）。
  assert.equal(
    feature.describeTask(makeAction({id: 4, actionHrid: '/actions/alchemy/coinify', hasMaxCount: false})),
    '点金（无上限）'
  );
  // 非炼金/强化的行动不受影响。
  assert.equal(
    feature.describeTask(makeAction({id: 5, actionHrid: '/actions/combat/golem_cave', hasMaxCount: false})),
    'Golem Cave（无上限）'
  );
  // 进度通知的行动名同口径。
  const lines = feature
    .buildProgressText(
      makeAction({
        id: 6,
        actionHrid: '/actions/alchemy/coinify',
        hasMaxCount: false,
        primaryItemHash: hash('/items/sages_mirror', 0)
      })
    )
    .split('\n');
  assert.equal(lines[1], '⏳ 点金: 贤者之镜：已完成 0 次');
});

test('通知文案：标题不含角色名、队列最多 3 项、时间行只显示时间、角色名行带测试服标识', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  const event = {
    type: 'completed',
    completedTask: makeAction({id: 0, actionHrid: '/actions/smithing/smith_bar', maxCount: 20, currentCount: 20}),
    newTask: feature.tracker.getCurrentTask(),
    queue: feature.tracker.getQueuePreview(3),
    isEmpty: false
  };
  const lines = feature.buildQueueChangeText(event, {complete: true, start: true}).split('\n');
  assert.equal(lines[0], '【MST】行动队列');
  // 上个任务结束与下个任务开始在同一次切换里：合并为一条，两行都在。
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

test('通知文案：关闭任务开始通知时，同一事件只剩完成行', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({notifyStart: false}), enabled: true};
  const lines = feature
    .buildQueueChangeText(
      {
        type: 'completed',
        completedTask: makeAction({id: 0, actionHrid: '/actions/smithing/smith_bar', maxCount: 20, currentCount: 20}),
        newTask: feature.tracker.getCurrentTask(),
        queue: feature.tracker.getQueuePreview(3),
        isEmpty: false
      },
      {complete: true, start: false}
    )
    .split('\n');
  assert.equal(lines[1], '✅ 完成：锻造（20/20）');
  assert.equal(lines[2], '等待队列：');
  assert.ok(!lines.some((line) => line.includes('▶️')));
});

test('通知文案：只有开始时一条消息含开始行与接下来 3 项等待队列', () => {
  const feature = createTextFeature({isTestServer: false});
  feature.tracker.setQueue(
    [
      // 队首：正在跑的迷宫。
      makeAction({
        id: 1,
        actionHrid: '/actions/labyrinth/explore',
        hasMaxCount: false,
        maxCount: 0,
        currentCount: 11885,
        ordinal: 0
      }), makeAction // 已做过一部分的有限任务。
      ({
        id: 2,
        actionHrid: '/actions/woodcutting/collect_logging',
        maxCount: 100,
        currentCount: 12,
        ordinal: 1
      }), makeAction // 全新任务。
      ({
        id: 3,
        actionHrid: '/actions/mining/collect_ore',
        maxCount: 50,
        currentCount: 0,
        ordinal: 2
      }), makeAction // 被挤到等待区的个人战斗：轮到时接着打。
      ({
        id: 4,
        actionHrid: '/actions/combat/golem_cave',
        difficultyTier: 2,
        hasMaxCount: false,
        currentCount: 500,
        ordinal: 3
      })
    ],
    '42'
  );
  const lines = feature
    .buildQueueChangeText({newTask: feature.tracker.getCurrentTask(), isEmpty: false}, {complete: false, start: true})
    .split('\n');
  assert.equal(lines[0], '【MST】行动队列');
  assert.equal(lines[1], '▶️ 开始：探索迷宫（无上限）');
  assert.equal(lines[2], '等待队列：');
  assert.equal(lines[3], '1. 伐木（12/100）');
  assert.equal(lines[4], '2. 采矿（0/50）');
  assert.equal(lines[5], '3. Golem Cave (T2)（无上限）');
  assert.match(lines[6], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(lines[7], 'xiao711');
  assert.equal(lines.length, 8);
  // 队列概览与完成通知同口径：不含队首（正在跑的迷宫），最多 3 项。
  assert.ok(!lines.some((line) => line.includes('1. 探索迷宫')));
});

test('队首变化通知：完成与开始合并为一条，开关各自决定这一条里出现哪几行', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.onWsState({state: 'open'});
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  const completed = {
    type: 'completed',
    completedTask: makeAction({id: 1, maxCount: 50, currentCount: 50}),
    newTask: feature.tracker.getCurrentTask(),
    queue: feature.tracker.getQueuePreview(3),
    isEmpty: false
  };
  // 默认全开：完成与开始合并成一条消息，两行都在。
  feature.handleEvent(completed);
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /✅ 完成：/);
  assert.match(submitted[0], /▶️ 开始：/);
  // 取消切换（started）：没有完成可报，只发一条带开始行的消息。
  submitted.length = 0;
  feature.handleEvent({...completed, type: 'started', completedTask: null});
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：/);
  assert.ok(!submitted[0].includes('✅'));
  // 关闭任务开始：这一条只剩完成行。
  submitted.length = 0;
  feature.updateConfig({notifyStart: false});
  feature.handleEvent(completed);
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /✅ 完成：/);
  assert.ok(!submitted[0].includes('▶️'));
  // 关闭任务完成：这一条只剩开始行。
  submitted.length = 0;
  feature.updateConfig({notifyStart: true, notifyComplete: false});
  feature.handleEvent(completed);
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：/);
  assert.ok(!submitted[0].includes('✅'));
  // 两个开关都关：不推送（计时仍重置）。
  submitted.length = 0;
  feature.updateConfig({notifyComplete: false, notifyStart: false});
  feature.handleEvent(completed);
  assert.deepEqual(submitted, []);
});

test('组队战斗开始：队伍状态进入 battling 时推送任务开始，每次开战各一条', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  feature.characterName = 'xiao711';
  feature.onWsState({state: 'open'});
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  const combat = () =>
    makeAction({
      id: 9,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      difficultyTier: 2,
      hasMaxCount: false,
      maxCount: 0,
      currentCount: 11885
    });
  feature.tracker.setQueue(
    [
      combat()
    ],
    '42'
  );
  const partyInfo = (status, isReady) => ({party: {status}, partySlotMap: {1: {characterID: 42, isReady}}});
  // 准备就绪但还没开战：不推送（等待期未过）。
  feature.handlePartyUpdated({partyInfo: partyInfo('recruiting', true)});
  assert.deepEqual(submitted, []);
  // 进入 battling：推一条任务开始通知（队首 id 未变，靠队伍状态识别）。
  feature.handlePartyUpdated({partyInfo: partyInfo('battling', true)});
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：Golem Cave \(T2\)（无上限）/);
  // 状态未变化：不重复推送。
  feature.handlePartyUpdated({partyInfo: partyInfo('battling', true)});
  assert.equal(submitted.length, 1);
  // 战斗结束准备下一轮，再次开战：再推一条。
  feature.handlePartyUpdated({partyInfo: partyInfo('recruiting', false)});
  feature.handlePartyUpdated({partyInfo: partyInfo('battling', true)});
  assert.equal(submitted.length, 2);
  // 基线建立时正在开战：不推送（重连/刷新不补推）。
  submitted.length = 0;
  feature.onInitCharacterData({
    character: {id: 42},
    characterActions: [
      combat()
    ],
    partyInfo: partyInfo('battling', true)
  });
  assert.deepEqual(submitted, []);
  // 队首不是组队行动时，队伍开战不推送。
  feature.tracker.setQueue(
    [
      makeAction({id: 5})
    ],
    '42'
  );
  feature.handlePartyUpdated({partyInfo: partyInfo('recruiting', false)});
  feature.handlePartyUpdated({partyInfo: partyInfo('battling', false)});
  assert.deepEqual(submitted, []);
  // 关闭任务开始通知：组队开战同样不推送。
  feature.tracker.setQueue(
    [
      combat()
    ],
    '42'
  );
  feature.updateConfig({notifyStart: false});
  feature.handlePartyUpdated({partyInfo: partyInfo('recruiting', false)});
  feature.handlePartyUpdated({partyInfo: partyInfo('battling', true)});
  assert.deepEqual(submitted, []);
});

test('组队行动的开始交给开战播报：入队不重复推送，拿不到队伍状态时退回队首变化播报', () => {
  const feature = createTextFeature();
  feature.config = {...feature.normalizeConfig({}), enabled: true};
  feature.characterId = '42';
  feature.onWsState({state: 'open'});
  const submitted = [];
  feature.submitText = (text) => submitted.push(text);
  const partyCombat = () =>
    makeAction({
      id: 5,
      actionHrid: '/actions/combat/golem_cave',
      partyID: 635372,
      hasMaxCount: false,
      currentCount: 0
    });
  const event = {type: 'started', completedTask: null, newTask: partyCombat(), queue: [], isEmpty: false};
  // 从未拿到队伍状态（例如游戏侧不再提供 party.status）：退回队首变化播报，不至于一条都收不到。
  assert.equal(feature.partyStatusKnown, false);
  feature.handleEvent(event);
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：Golem Cave/);
  // 拿到过队伍状态后：组队行动由开战播报，队首变化不再重复推送。
  submitted.length = 0;
  feature.handlePartyUpdated({partyInfo: {party: {status: 'recruiting'}, partySlotMap: {}}});
  assert.equal(feature.partyStatusKnown, true);
  feature.handleEvent(event);
  assert.deepEqual(submitted, []);
  // 队伍进入 battling：开战播报补上这一条。
  feature.tracker.setQueue(
    [
      partyCombat()
    ],
    '42'
  );
  feature.handlePartyUpdated({
    partyInfo: {party: {status: 'battling'}, partySlotMap: {1: {characterID: 42, isReady: true}}}
  });
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：Golem Cave/);
  // 个人行动不受影响：队首变化照常播报。
  submitted.length = 0;
  feature.handleEvent({type: 'started', completedTask: null, newTask: makeAction({id: 7}), queue: [], isEmpty: false});
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /▶️ 开始：锻造（0\/20）/);
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
  // 定时推送要求已确认在线（WS open 或 init_character_data）。
  feature.onWsState({state: 'open'});
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
