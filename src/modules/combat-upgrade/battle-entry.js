// combat-upgrade-battle-entry
// 交战界面每个玩家单位右上角的计算器入口：悬浮时出现，点击打开该玩家的战斗升级计算器并预填本场经验速率。
// 游戏结构与交互约束见 `docs/analysis/战斗升级悬浮时间与交战入口需求说明书.md` §2.2 / §4.5。
const UNIT_SELECTOR = '[class*="CombatUnit_combatUnit__"]';
const ENTRY_CLASS = 'mst-combat-unit-entry';

export const combatUpgradeBattleEntry = {
  mount(feature) {
    document.querySelectorAll(UNIT_SELECTOR).forEach((unit) => this.mountUnit(feature, unit));
  },

  mountUnit(feature, unit) {
    if (unit.querySelector(`:scope > .${ENTRY_CLASS}`)) return;
    const combatUnit = this.readCombatUnit(feature, unit);
    // 怪物没有主修 / 选修训练，只有玩家单位挂入口。
    if (combatUnit?.isPlayer !== true) return;
    const characterId = combatUnit.character?.id ?? combatUnit.characterId ?? null;
    if (characterId == null) return;
    const name = String(combatUnit.name || '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ENTRY_CLASS;
    button.dataset.characterName = name;
    button.title = feature.getUnitEntryTitle(name);
    this.mountIcon(feature, button);
    button.addEventListener('click', (event) => {
      // 单位本身的点击会打开游戏原生单位详情弹窗，入口必须阻断冒泡。
      event.preventDefault();
      event.stopPropagation();
      feature.open({characterId, name});
    });
    unit.appendChild(button);
  },

  // 单位 div 自己的 props 只有 className/onClick/children，需要沿 fiber 向上找 CombatUnit 的 props。
  readCombatUnit(feature, unit) {
    let node = feature.ctx.DataHub.getReactFiber?.(unit) || null;
    while (node) {
      const candidate = node.memoizedProps?.combatUnit;
      if (candidate) return candidate;
      node = node.return;
    }
    return null;
  },

  mountIcon(feature, button) {
    const {TemplateRenderer, utils} = feature.ctx;
    const sprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.02869244.svg';
    TemplateRenderer.render(
      () => TemplateRenderer.html`<svg aria-hidden="true"><use href=${sprite + '#experience'}></use></svg>`,
      button
    );
  },

  refreshLanguage(feature) {
    document.querySelectorAll(`.${ENTRY_CLASS}`).forEach((button) => {
      button.title = feature.getUnitEntryTitle(button.dataset.characterName || '');
    });
  }
};
