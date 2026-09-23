// 队列跟踪器：以官方 CharacterAction.id 为准判定行动队列变动事件。
// 纯逻辑边界，不依赖 DOM、DataHub 或 i18n，事件文案由装配层生成。
// 官方合并语义（main.*.chunk.js handleMessageActionsUpdated，v1.20260814.0）：
// endCharacterActions 中 isDone=true 的行动从队列移除，其余按 id upsert，
// 最后 partyID 非 0（组队/战斗行动）排在前、partyID 为 0 的在后、各组按 ordinal 升序。

// 队列排序：partyID 非 0（组队/战斗行动）在前，个人行动在后，同组按 ordinal 升序。
export function sortActions(actions) {
  return [
    ...actions
  ].sort((a, b) => {
    if (a.partyID !== 0 && b.partyID === 0) return -1;
    if (a.partyID === 0 && b.partyID !== 0) return 1;
    return a.ordinal - b.ordinal;
  });
}

export class QueueChangeTracker {
  constructor() {
    this.queue = [];
    this.currentId = null;
    this.characterId = null;
    // 进度计数基线：组队战斗重新准备后从当前次数重新起算（{id, count}）。
    this.progressBaseline = null;
    // 是否拿到过全量基线：未拿到基线时队列为空只表示"没有数据"，不代表"队列是空的"。
    this.hasBaseline = false;
  }

  // 内存态整体重置：切角色时旧任务的跟踪状态立即释放，不保留跨任务残留。
  reset(characterId = null) {
    this.queue = [];
    this.currentId = null;
    this.characterId = characterId;
    this.progressBaseline = null;
    this.hasBaseline = false;
  }

  // 基线快照：页面加载 / 断线重连时以 init_character_data 全量重建，不产生事件。
  setQueue(actions, characterId = null) {
    if (characterId != null) this.characterId = characterId;
    this.queue = sortActions(Array.isArray(actions) ? actions.filter(Boolean) : []);
    this.currentId = this.queue[0]?.id ?? null;
    this.progressBaseline = null;
    this.hasBaseline = true;
  }

  // 官方 actions_updated 增量合并。
  // 返回事件 {type, completedTask, newTask, queue, isEmpty} 或 null：
  // - 队首换成另一个任务即视为一次任务开始（type='started'）：被其他任务顶掉、被挤下去的
  //   任务重新回到队首、有限任务未达上限被移除、空队列入队都算；
  // - 上一任务确实以 isDone 结束且不算取消时升级为 type='completed'，可再播报完成通知；
  // 同一 id 返回 null：多步任务期间官方持续推送 action_completed 但 id 不变，迷宫等无限
  // 行动在队首连续重复执行也走这条，都属于“同一任务还在跑”，不是重新开始。
  applyActionsUpdate(endCharacterActions) {
    const updates = Array.isArray(endCharacterActions) ? endCharacterActions.filter(Boolean) : [];
    if (!updates.length) return null;
    const prevCurrentId = this.currentId;
    const doneIds = new Set();
    for (const update of updates) {
      if (update.isDone) doneIds.add(update.id);
    }
    this.queue = this.queue.filter((action) => !doneIds.has(action.id));
    for (const update of updates) {
      if (update.isDone) continue;
      const index = this.queue.findIndex((action) => action.id === update.id);
      if (index >= 0) this.queue[index] = update;
      else this.queue.push(update);
    }
    this.queue = sortActions(this.queue);
    this.currentId = this.queue[0]?.id ?? null;
    if (this.currentId !== prevCurrentId) this.progressBaseline = null;
    if (prevCurrentId === this.currentId) return null;
    const endedTask =
      prevCurrentId != null && doneIds.has(prevCurrentId)
        ? updates.find((update) => update.id === prevCurrentId) || null
        : null;
    const base = {
      newTask: this.queue[0] || null,
      queue: this.queue.slice(),
      isEmpty: this.queue.length === 0
    };
    // 取消启发：有限次数任务在未达到上限时被移除，按用户取消处理——不报完成，只报任务开始。
    // 无上限任务（战斗/迷宫等）与已完成任务无法区分取消，一律按任务结束上报。
    const cancelled = !!endedTask?.hasMaxCount && Number(endedTask.currentCount ?? 0) < Number(endedTask.maxCount ?? 0);
    if (!endedTask || cancelled) return {...base, type: 'started', completedTask: null};
    return {...base, type: 'completed', completedTask: endedTask};
  }

  // 官方 action_completed：单次行动完成明细（含掉落、经验）。
  // 同 id 只更新进度返回 null；isDone=true 时按完成处理（单步任务可能只有该消息没有移除增量）。
  applyActionCompleted(endCharacterAction) {
    const action = endCharacterAction;
    if (!action || typeof action !== 'object') return null;
    if (!action.isDone) {
      const index = this.queue.findIndex((item) => item.id === action.id);
      if (index >= 0) this.queue[index] = action;
      return null;
    }
    return this.applyActionsUpdate([
      action
    ]);
  }

  getCurrentTask() {
    return this.queue[0] || null;
  }

  // 组队战斗会话重置（本方角色重新准备）时调用：记录当前任务的已完成为基线，
  // 后续进度通知按会话内增量统计。官方在同一条组队行动上持续累加 currentCount，
  // 重新准备不会更换 id，不重置基线则进度次数会一直累计。
  resetProgressBaseline() {
    const task = this.queue[0];
    if (!task) return;
    this.progressBaseline = {id: task.id, count: Number(task.currentCount ?? 0)};
  }

  // 进度通知的已完成次数：当前任务存在基线（且未回退）时返回会话内增量，否则返回原始累计值。
  getProgressCount(task) {
    if (!task) return 0;
    const current = Number(task.currentCount ?? 0);
    const baseline = this.progressBaseline;
    if (baseline && baseline.id === task.id && current >= baseline.count) return current - baseline.count;
    return current;
  }

  getQueuePreview(count) {
    return this.queue.slice(0, count);
  }

  getQueueLength() {
    return this.queue.length;
  }

  // 等待执行的任务：排除队首正在执行的行动（进度/完成/开始通知的队列概览都用这个口径）。
  getWaitingQueuePreview(count) {
    return this.queue.slice(1, 1 + count);
  }

  getWaitingQueueLength() {
    return Math.max(0, this.queue.length - 1);
  }
}
