// combat-upgrade-tooltip
// 导航栏悬浮升级时间：战斗技能在「升级所需经验」后拼接速率行与 4 行时间；「战斗」项在说明之后追加技能块
// （标题为「技能名 Lv.等级 经验百分比」）。
// 游戏结构与口径见 `docs/analysis/战斗升级悬浮时间与交战入口需求说明书.md` §2.1 / §3.2 / §4.4。
import {COMBAT_SKILL_HRIDS, MAX_SKILL_LEVEL} from './planner.js';

const COMBAT_TOOLTIP_SELECTOR = '[class*="NavigationBar_navigationSkillTooltip"]';
const NAV_ROW_SELECTOR = '[class*="NavigationBar_nav__"], [class*="NavigationBar_navigationLink__"]';
const TOOLTIP_INFO_SELECTOR = '[class*="NavigationBar_info"]';
const INJECTED_CLASS = 'mst-combat-tooltip';
const SKILL_TIME_CLASS = 'mst-combat-tooltip-time';
const COMBAT_BLOCK_CLASS = 'mst-combat-tooltip-combat';

export const combatUpgradeTooltip = {
  hoverController: null,
  hoveredTarget: null,
  hoverRow: null,
  // 悬浮轮次：进入新的导航行时递增。提示框内容在**同一轮悬浮期间保持冻结**（用户要求，
  // 数字不能一边悬浮一边跳），只在下一轮悬浮时重新读取数据。
  hoverToken: 0,

  mount(feature) {
    this.bindHoverTracking();
    document.querySelectorAll(COMBAT_TOOLTIP_SELECTOR).forEach((tooltip) => this.render(feature, tooltip));
  },

  // 记录当前悬浮的导航行：提示框挂在 body 的 popper 里，用行本身反推目标不依赖 MUI 内部结构。
  bindHoverTracking() {
    if (this.hoverController) return;
    const controller = new AbortController();
    const options = {capture: true, signal: controller.signal};
    document.addEventListener(
      'mouseover',
      (event) => {
        const row = event.target?.closest?.(NAV_ROW_SELECTOR);
        // 行内移动（图标与文字之间）会重复触发 mouseover，只有换行才算新一轮悬浮。
        if (!row || row === this.hoverRow) return;
        this.hoverRow = row;
        this.hoverToken += 1;
        this.hoveredTarget = this.readNavTarget(row);
      },
      options
    );
    document.addEventListener(
      'mouseout',
      (event) => {
        const row = event.target?.closest?.(NAV_ROW_SELECTOR);
        if (!row) return;
        if (event.relatedTarget && row.contains(event.relatedTarget)) return;
        this.hoverRow = null;
        this.hoveredTarget = null;
      },
      options
    );
    this.hoverController = controller;
  },

  // 从导航行图标反推目标：skills sprite → 战斗技能；misc sprite 的 combat → 「战斗」项。
  // 行内第一个 svg 是「战斗」项的折叠三角（NavigationBar_toggleContainer），必须跳过。
  readNavTarget(row) {
    const uses = [
      ...(row?.querySelectorAll?.('svg use') || [])
    ].filter((use) => !use.closest('[class*="NavigationBar_toggleContainer"]'));
    for (const use of uses) {
      const href = use.getAttribute?.('href') || use.getAttribute?.('xlink:href') || '';
      const hashIndex = href.indexOf('#');
      if (hashIndex < 0) continue;
      const sprite = href.slice(0, hashIndex);
      const fragment = href.slice(hashIndex + 1);
      if (!sprite || !fragment) continue;
      if (sprite.includes('skills_sprite')) return {kind: 'skill', skillHrid: '/skills/' + fragment};
      if (sprite.includes('misc_sprite') && fragment === 'combat') return {kind: 'combat', skillHrid: ''};
    }
    return null;
  },

  // 提示框判定：「战斗」项只有名称 + 说明两个子元素，战斗技能多出等级 / 总经验 / 升级所需经验三行。
  getTooltipChildren(tooltip) {
    return [
      ...tooltip.children
    ].filter((child) => !String(child.className || '').includes(INJECTED_CLASS));
  },

  resolveTarget(feature, tooltip) {
    const children = this.getTooltipChildren(tooltip);
    if (children.length <= 2) return {kind: 'combat', skillHrid: ''};
    const name = children[0]?.textContent?.trim() || '';
    const skillHrid = COMBAT_SKILL_HRIDS.find(
      (hrid) => feature.ctx.DataHub.getLocalizedGameName('skillNames', hrid) === name
    );
    if (skillHrid) return {kind: 'skill', skillHrid};
    // 名称反查失败（游戏新增语言等）时退回悬浮行记录的目标，但必须确认这个提示框就是当前悬浮行的
    // ——同一时刻可能残留正在关闭的提示框，行文本与提示框名称比对可以避免把别的行的数据写进来。
    if (this.hoveredTarget?.kind !== 'skill' || !this.isTooltipOfHoveredRow(name)) return null;
    return this.hoveredTarget;
  },

  isTooltipOfHoveredRow(name) {
    const row = this.hoverRow;
    if (!row || !name) return false;
    return row.textContent.trim().startsWith(name);
  },

  render(feature, tooltip) {
    // 同一轮悬浮内只计算一次：内容（含时间行）保持冻结，下一轮悬浮才重新读数据。
    const token = String(this.hoverToken);
    if (tooltip.dataset.mstCombatToken === token) return;
    tooltip.dataset.mstCombatToken = token;
    const target = this.resolveTarget(feature, tooltip);
    if (!target) {
      this.clearContainers(tooltip);
      return;
    }
    if (target.kind === 'skill') this.renderSkillTooltip(feature, tooltip, target.skillHrid);
    else this.renderCombatTooltip(feature, tooltip);
  },

  ensureContainer(tooltip, className, beforeInfo) {
    const existing = [
      ...tooltip.children
    ].find((child) => String(child.className || '').includes(className));
    if (existing) return existing;
    const container = document.createElement('div');
    container.className = className;
    const info = beforeInfo ? tooltip.querySelector(TOOLTIP_INFO_SELECTOR) : null;
    // 技能行插在「升级所需经验」之后、说明之前（与原脚本一致）；「战斗」块追加在说明之后。
    if (info) tooltip.insertBefore(container, info);
    else tooltip.appendChild(container);
    return container;
  },

  removeContainer(tooltip, className) {
    [
      ...tooltip.children
    ].forEach((child) => {
      if (String(child.className || '').includes(className)) child.remove();
    });
  },

  // 两类注入容器一起清掉：没有目标、没有数据或满级时用。
  clearContainers(tooltip) {
    this.removeContainer(tooltip, SKILL_TIME_CLASS);
    this.removeContainer(tooltip, COMBAT_BLOCK_CLASS);
  },

  renderSkillTooltip(feature, tooltip, skillHrid) {
    const rate = feature.getBattleSkillRates()?.get(skillHrid) || 0;
    // 悬浮的是自己的导航栏：等级固定读自己，不受弹窗里选中的玩家上下文影响。
    const state = feature.getCharacterSkill(skillHrid, null);
    const linesHtml = rate > 0 ? this.getTimeLinesHtml(feature, state.level, state.experience, rate) : '';
    if (!linesHtml) {
      this.clearContainers(tooltip);
      return;
    }
    // 「战斗」块与技能行同时悬浮时会互相干扰，按目标互斥清理。
    this.removeContainer(tooltip, COMBAT_BLOCK_CLASS);
    const container = this.ensureContainer(tooltip, SKILL_TIME_CLASS, true);
    container.innerHTML = linesHtml;
  },

  renderCombatTooltip(feature, tooltip) {
    const rates = feature.getBattleSkillRates();
    if (!rates) {
      this.clearContainers(tooltip);
      return;
    }
    const blocks = [];
    this.getSortedSkillHrids(feature, [
      ...rates.keys()
    ]).forEach((skillHrid) => {
      const state = feature.getCharacterSkill(skillHrid, null);
      const linesHtml = this.getTimeLinesHtml(feature, state.level, state.experience, rates.get(skillHrid));
      // 满级技能没有可显示的时间，与「没有数据的技能不显示」同口径。
      if (!linesHtml) return;
      blocks.push({skillHrid, level: state.level, experience: state.experience, linesHtml});
    });
    if (!blocks.length) {
      this.removeContainer(tooltip, COMBAT_BLOCK_CLASS);
      return;
    }
    this.removeContainer(tooltip, SKILL_TIME_CLASS);
    const container = this.ensureContainer(tooltip, COMBAT_BLOCK_CLASS, false);
    container.innerHTML = blocks
      .map((block, index) => {
        const divider = index > 0 ? '<div class="mst-combat-tooltip-divider"></div>' : '';
        const skillTitle = feature.ctx.utils.escapeHtml(this.getSkillBlockTitle(feature, block));
        return `${divider}<div class="mst-combat-tooltip-skill">${skillTitle}</div>${block.linesHtml}`;
      })
      .join('');
  },

  // 技能块标题：专业 + 等级 + 当前经验百分比（最多两位小数、去掉多余的 0，与计算器「当前等级」列同口径）。
  getSkillBlockTitle(feature, block) {
    const {CharacterDataService, i18n} = feature.ctx;
    const percentText = CharacterDataService.getLevelExperiencePercent(block.level, block.experience).toLocaleString(
      i18n.locale,
      {maximumFractionDigits: 2, minimumFractionDigits: 0}
    );
    return `${feature.getSkillName(block.skillHrid)} Lv.${block.level} ${percentText}%`;
  },

  getSortedSkillHrids(feature, skillHrids) {
    const detailMap = feature.ctx.DataHub.getClientDataMap?.('skillDetailMap') || {};
    return [
      ...skillHrids
    ].sort((left, right) => Number(detailMap[left]?.sortIndex || 0) - Number(detailMap[right]?.sortIndex || 0));
  },

  // 速率行 + 4 行时间文案；满级、没有速率或算不出需求时返回空串（调用方据此不注入）。
  getTimeLinesHtml(feature, level, experience, rate) {
    const {CharacterDataService, i18n, utils} = feature.ctx;
    const safeLevel = utils.clampLevel(level, 0, MAX_SKILL_LEVEL);
    if (safeLevel >= MAX_SKILL_LEVEL || !(rate > 0)) return '';
    const experienceValue = Math.max(0, Number(experience) || 0);
    const baseNeed = CharacterDataService.getLevelExperience(safeLevel + 1) - experienceValue;
    if (!(baseNeed > 0)) return '';
    const baseSeconds = Math.ceil((baseNeed / rate) * 3600);
    if (!Number.isFinite(baseSeconds)) return '';
    const rows = [
      // 先给出本场该技能的小时经验速率（K/h，与计算器输入框同口径），再给由它推出的时间。
      i18n.t(
        'combatUpgradeRateLine',
        feature.state.formatRateInputValue(rate)
      ), `${i18n.t('combatUpgradeTimeNeeded')}：${this.formatDuration(feature, baseSeconds)}`, `${i18n.t('combatUpgradeTimeExact')}：${this.formatUpgradeTime(baseSeconds)}`
    ];
    // 里程碑超过 200 级时不显示这两行（满级技能在上面已整体跳过）。
    const milestoneLevel = feature.getMilestoneLevel(safeLevel);
    const milestoneNeed =
      milestoneLevel == null ? 0 : CharacterDataService.getLevelExperience(milestoneLevel) - experienceValue;
    if (milestoneNeed > 0) {
      const milestoneSeconds = Math.ceil((milestoneNeed / rate) * 3600);
      if (Number.isFinite(milestoneSeconds)) {
        rows.push(
          `${i18n.t('combatUpgradeMilestoneNeeded', milestoneLevel)}：${this.formatDuration(feature, milestoneSeconds)}`,
          `${i18n.t('combatUpgradeMilestoneExact', milestoneLevel)}：${this.formatUpgradeTime(milestoneSeconds)}`
        );
      }
    }
    return rows.map((row) => `<div>${utils.escapeHtml(row)}</div>`).join('');
  },

  // 时长格式：zh 紧排（1年2天3小时20分），en 用空格分隔（1 y 2 d 3 h 20 m）。
  formatDuration(feature, seconds) {
    const {i18n} = feature.ctx;
    let rest = Math.max(0, Math.floor(Number(seconds) || 0));
    const years = Math.floor(rest / 31536000);
    rest %= 31536000;
    const days = Math.floor(rest / 86400);
    rest %= 86400;
    const hours = Math.floor(rest / 3600);
    rest %= 3600;
    const minutes = Math.floor(rest / 60);
    const parts = [];
    if (years > 0) parts.push(`${years.toLocaleString(i18n.locale)}${i18n.t('yearUnit')}`);
    if (days > 0) parts.push(`${days}${i18n.t('dayUnit')}`);
    if (hours > 0) parts.push(`${hours}${i18n.t('hourUnit')}`);
    if (minutes > 0 || !parts.length) parts.push(`${minutes}${i18n.t('minuteUnit')}`);
    return parts.join(i18n.languageKey === 'zh' ? '' : ' ');
  },

  // 具体时间沿用原脚本：MM/DD HH:mm，本地时区；只有超过 30 天且跨年度才补年份。
  formatUpgradeTime(seconds) {
    const now = new Date();
    const upgradeDate = new Date(now.getTime() + Math.max(0, Number(seconds) || 0) * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    const month = pad(upgradeDate.getMonth() + 1);
    const day = pad(upgradeDate.getDate());
    const hours = pad(upgradeDate.getHours());
    const minutes = pad(upgradeDate.getMinutes());
    const days = Math.floor((Number(seconds) || 0) / 86400);
    return days >= 30 && upgradeDate.getFullYear() > now.getFullYear()
      ? `${upgradeDate.getFullYear()}/${month}/${day} ${hours}:${minutes}`
      : `${month}/${day} ${hours}:${minutes}`;
  }
};
