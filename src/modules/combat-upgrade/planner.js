// combat-upgrade-planner
export class CombatUpgradePlanner {
  constructor(ctx) {
    this.ctx = ctx;
  }

  getTrainingTypeMode(skillHrid) {
    if ([
        '/skills/stamina', '/skills/intelligence'
      ].includes(skillHrid)) return 'secondary';
    if ([
        '/skills/ranged', '/skills/magic'
      ].includes(skillHrid)) return 'primary';
    return 'flexible';
  }

  getDefaultPrimarySkillHrid() {
    const {CharacterDataService} = this.ctx;
    return [
      '/skills/melee', '/skills/ranged', '/skills/magic'
    ].reduce((highestHrid, skillHrid) => {
      const highestLevel = Number(CharacterDataService.getCharacterSkill(highestHrid)?.level || 0);
      const currentLevel = Number(CharacterDataService.getCharacterSkill(skillHrid)?.level || 0);
      return currentLevel > highestLevel ? skillHrid : highestHrid;
    });
  }

  getHourlyExperience(row, primaryRate, secondaryRate) {
    if (row.hourlyExperienceOverride != null) {
      return Math.max(0, Number(row.hourlyExperienceOverride) || 0) * 1000;
    }
    if (row.trainingType === 'secondary') return secondaryRate;
    return row.concurrentTraining ? primaryRate : primaryRate + secondaryRate;
  }

  getSequenceState(rows) {
    const sequenceById = new Map();
    const concurrentAllowedById = new Map();
    const sequenceSkills = new Map();
    let sequence = 0;
    let previousPrimaryIndex = -1;
    // 同修行会并入前一个可用序号；同一序号内禁止重复专业，避免训练时间互相覆盖。
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const previousRow = rows[rowIndex - 1];
      let targetSequence = null;
      if (row.trainingType === 'secondary' && previousRow?.trainingType === 'secondary') {
        targetSequence = sequenceById.get(previousRow.id);
      } else if (row.trainingType === 'primary') {
        const firstSecondary = rows
          .slice(previousPrimaryIndex + 1, rowIndex)
          .find((candidate) => candidate.trainingType === 'secondary');
        targetSequence = firstSecondary ? sequenceById.get(firstSecondary.id) : null;
      }
      const canJoin = targetSequence != null && !sequenceSkills.get(targetSequence)?.has(row.skillHrid);
      concurrentAllowedById.set(row.id, canJoin);
      if (row.concurrentTraining && canJoin) {
        sequenceById.set(row.id, targetSequence);
      } else {
        if (row.concurrentTraining && !canJoin) row.concurrentTraining = false;
        sequence++;
        sequenceSkills.set(sequence, new Set());
        sequenceById.set(row.id, sequence);
      }
      sequenceSkills.get(sequenceById.get(row.id)).add(row.skillHrid);
      if (row.trainingType === 'primary') previousPrimaryIndex = rowIndex;
    }
    return {sequenceById, concurrentAllowedById};
  }

  getSequenceStartHours(sequence, sequenceDurations) {
    let hours = 0;
    for (let current = 1; current < sequence; current++) {
      const duration = sequenceDurations.get(current);
      if (duration == null) return null;
      hours += duration;
    }
    return hours;
  }

  mergeSequenceDuration(currentDuration, rowDuration) {
    if (currentDuration === undefined) return rowDuration;
    if (currentDuration === null || rowDuration === null) return null;
    return Math.max(currentDuration, rowDuration);
  }

  getExperienceState(experience) {
    const {CharacterDataService} = this.ctx;
    const maxExperience = CharacterDataService.getLevelExperience(200);
    const safeExperience = Math.min(maxExperience, Math.max(0, Number(experience) || 0));
    let low = 0;
    let high = 200;
    // 等级经验表单调递增，用二分反查经验所在等级。
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (CharacterDataService.getLevelExperience(middle) <= safeExperience) low = middle;
      else high = middle - 1;
    }
    return {
      level: low,
      experience: safeExperience,
      percent: CharacterDataService.getLevelExperiencePercent(low, safeExperience)
    };
  }

  calculateRequiredHours(requiredExperience, hourlyRate, hasPrimary) {
    if (!hasPrimary) return null;
    if (requiredExperience === 0) return 0;
    if (hourlyRate <= 0) return null;
    return requiredExperience / hourlyRate;
  }

  calculatePlan(rows, primaryRate, secondaryRate) {
    const {CharacterDataService, utils} = this.ctx;
    const {sequenceById, concurrentAllowedById} = this.getSequenceState(rows);
    const hasPrimary = rows.some((row) => row.trainingType === 'primary');
    const sequenceDurations = new Map();
    const previousBySkill = new Map();
    const results = new Map();
    let maxSequence = 0;

    for (const row of rows) {
      const context = this.getPlanRowContext(row, sequenceById, previousBySkill, CharacterDataService, utils);
      // 重复专业继承上一次训练后的精确经验，不允许再手动指定起点。
      if (context.isRepeated) row.customStart = false;
      this.applyCustomStart(row, context, CharacterDataService, utils);
      const result = this.calculatePlanRow({
        CharacterDataService,
        context,
        hasPrimary,
        maxSequence,
        planner: this,
        primaryRate,
        row,
        secondaryRate,
        sequenceDurations,
        utils
      });
      maxSequence = Math.max(maxSequence, result.maxSequence);
      previousBySkill.set(row.skillHrid, {experience: result.propagatedExperience});
      results.set(row.id, result.entry);
    }

    let totalHours = 0;
    if (rows.length > 0) {
      totalHours = hasPrimary ? this.getSequenceStartHours(maxSequence + 1, sequenceDurations) : null;
    }
    return {results, sequenceById, concurrentAllowedById, sequenceDurations, totalHours, hasPrimary};
  }

  getPlanRowContext(row, sequenceById, previousBySkill, CharacterDataService, utils) {
    const sequence = sequenceById.get(row.id);
    const previous = previousBySkill.get(row.skillHrid);
    const actual = CharacterDataService.getCharacterSkill(row.skillHrid) || {level: 0, experience: 0};
    const actualLevel = utils.clampLevel(actual.level, 0, 200);
    const actualExperience = Math.max(
      CharacterDataService.getLevelExperience(actualLevel),
      Number(actual.experience) || 0
    );
    const currentExperience = previous?.experience ?? actualExperience;
    const currentState = previous
      ? this.getExperienceState(currentExperience)
      : {
          level: actualLevel,
          experience: currentExperience,
          percent: CharacterDataService.getLevelExperiencePercent(actualLevel, currentExperience)
        };
    return {actualLevel, currentExperience, currentState, isRepeated: Boolean(previous), previous, sequence};
  }

  applyCustomStart(row, context, CharacterDataService, utils) {
    context.startLevel = context.currentState.level;
    context.startExperience = context.currentExperience;
    if (!context.isRepeated && row.customStart) {
      context.startLevel = utils.clampLevel(row.startLevel, 0, 199);
      context.startExperience = CharacterDataService.getLevelExperience(context.startLevel);
    }
    row.startLevel = context.startLevel;
  }

  calculatePlanRow({
    CharacterDataService,
    context,
    hasPrimary,
    maxSequence,
    primaryRate,
    row,
    secondaryRate,
    sequenceDurations,
    utils
  }) {
    const derivedTarget = row.trainingType === 'primary' && row.concurrentTraining;
    const rate = this.getHourlyExperience(row, primaryRate, secondaryRate);
    if (derivedTarget) {
      return this.calculateDerivedTargetRow({CharacterDataService, context, maxSequence, rate, row, sequenceDurations});
    }
    return this.calculateFixedTargetRow({
      CharacterDataService,
      context,
      hasPrimary,
      maxSequence,
      rate,
      row,
      sequenceDurations,
      utils
    });
  }

  calculateDerivedTargetRow({CharacterDataService, context, maxSequence, rate, row, sequenceDurations}) {
    const spanEndSequence = maxSequence;
    // 同修主修的目标等级由同序号选修耗时反推，而不是用户手填。
    const startHours = this.getSequenceStartHours(context.sequence, sequenceDurations);
    const completionHours = this.getSequenceStartHours(spanEndSequence + 1, sequenceDurations);
    let hours = null;
    let endState = null;
    let targetLevel = null;
    let propagatedExperience = context.currentExperience;
    if (startHours != null && completionHours != null) {
      hours = Math.max(0, completionHours - startHours);
      const calculatedExperience = Math.min(
        CharacterDataService.getLevelExperience(200),
        context.startExperience + rate * hours
      );
      endState = this.getExperienceState(calculatedExperience);
      targetLevel = endState.level;
      propagatedExperience = Math.max(context.currentExperience, calculatedExperience);
    }
    return {
      maxSequence,
      propagatedExperience,
      entry: this.buildPlanEntry(row, context, {
        completionHours,
        derivedTarget: true,
        endState,
        hours,
        propagatedExperience,
        spanEndSequence,
        startHours,
        targetLevel
      })
    };
  }

  calculateFixedTargetRow({
    CharacterDataService,
    context,
    hasPrimary,
    maxSequence,
    rate,
    row,
    sequenceDurations,
    utils
  }) {
    const targetLevel = Math.max(context.startLevel, utils.clampLevel(row.targetLevel, 1, 200));
    row.targetLevel = targetLevel;
    const targetExperience = CharacterDataService.getLevelExperience(targetLevel);
    const requiredExperience = Math.max(0, targetExperience - context.startExperience);
    const hours = this.calculateRequiredHours(requiredExperience, rate, hasPrimary);
    const existingDuration = sequenceDurations.get(context.sequence);
    sequenceDurations.set(context.sequence, this.mergeSequenceDuration(existingDuration, hours));
    const nextMaxSequence = Math.max(maxSequence, context.sequence);
    const startHours = this.getSequenceStartHours(context.sequence, sequenceDurations);
    const completionHours = startHours != null && hours != null ? startHours + hours : null;
    const endState = this.getExperienceState(targetExperience);
    const propagatedExperience = Math.max(context.currentExperience, targetExperience);
    return {
      maxSequence: nextMaxSequence,
      propagatedExperience,
      entry: this.buildPlanEntry(row, context, {
        completionHours,
        derivedTarget: false,
        endState,
        hours,
        propagatedExperience,
        spanEndSequence: context.sequence,
        startHours,
        targetLevel
      })
    };
  }

  buildPlanEntry(row, context, result) {
    return {
      row,
      sequence: context.sequence,
      derivedTarget: result.derivedTarget,
      isRepeated: context.isRepeated,
      spanEndSequence: result.spanEndSequence,
      currentState: context.currentState,
      startLevel: context.startLevel,
      startExperience: context.startExperience,
      targetLevel: result.targetLevel,
      endState: result.endState,
      hours: result.hours,
      startHours: result.startHours,
      completionHours: result.completionHours
    };
  }
}
