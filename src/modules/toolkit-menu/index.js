// toolkit-menu-feature
export class ToolkitMenuFeature {
  constructor(
    ctx,
    {characterCardFeature, appController, combatCalculator, abilityCalculator, equipmentComparison, dungeonCalculator}
  ) {
    this.ctx = ctx;
    this.characterCardFeature = characterCardFeature;
    this.appController = appController;
    this.combatCalculator = combatCalculator;
    this.abilityCalculator = abilityCalculator;
    this.equipmentComparison = equipmentComparison;
    this.dungeonCalculator = dungeonCalculator;
    this.outsideClickHandler = (event) => {
      const dropdown = document.getElementById('mst-toolkit-character-dropdown');
      if (dropdown && !dropdown.contains(event.target)) dropdown.remove();
    };
    this.openHandler = (event) => this.toggleDropdown(event?.detail?.trigger || null);
  }

  getActions() {
    const {GameNavigationService, Notifier, i18n} = this.ctx;
    // 菜单顺序按常用工作流排列：资料与升级工具在前，站点导航放最后。
    return [
      {key: 'userCharacterCard', icon: 'social', handler: () => this.characterCardFeature.showMyCharacterCard()}, {
        key: 'abilityUpgradeCalculator',
        icon: 'skills',
        handler: () => this.abilityCalculator.open()
      }, {key: 'houseUpgradeCalculator', icon: 'house', handler: () => this.appController.openCalculator()}, {
        key: 'combatUpgradeCalculator',
        icon: 'combat',
        handler: () => this.combatCalculator.open()
      }, {
        key: 'equipmentComparison',
        icon: 'loadout',
        handler: () => this.equipmentComparison.open()
      },
      {key: 'dungeonProfitCalculator', icon: 'loot_tracker', handler: () => this.dungeonCalculator.open()}, {
        key: 'switchCharacter',
        icon: 'switch_character',
        handler: () => {
          if (!GameNavigationService.switchCharacter()) Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
        }
      }
    ];
  }

  refresh() {
    const {i18n} = this.ctx;
    document.querySelectorAll('.mst-my-character-card-btn').forEach((button) => {
      button.textContent = i18n.t('toolkitShort');
      button.title = i18n.t('toolkitTitle');
    });
  }

  toggleDropdown(trigger) {
    const {GameUiAdapter} = this.ctx;
    const old = document.getElementById('mst-toolkit-character-dropdown');
    if (old) {
      old.remove();
      return;
    }
    // 优先挂到点击来源附近；找不到来源时回退到游戏头部角色信息区域。
    const host = trigger?.closest?.('[class*="Header_characterInfo"]') || GameUiAdapter.query('headerCharacterInfo');
    if (!host) return;
    host.style.position = 'relative';
    const dropdown = document.createElement('div');
    dropdown.id = 'mst-toolkit-character-dropdown';
    this.renderDropdown(dropdown);
    host.appendChild(dropdown);
    setTimeout(() => document.addEventListener('click', this.outsideClickHandler, {once: true}), 0);
  }

  renderDropdown(dropdown) {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    if (!dropdown) return;
    const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <div class="mst-toolkit-dropdown-title">${i18n.t('toolkitTitle')}</div>
  ${this.getActions().map(
    ({key, icon, handler}) => TemplateRenderer.html`
  <button type="button" class="mst-toolkit-action" @click=${() => {
    dropdown.remove();
    handler();
  }}>
    <svg aria-hidden="true"><use href=${miscSprite + '#' + icon}></use></svg>
    <span>${i18n.t(key)}</span>
  </button>`
  )}
`,
      dropdown
    );
  }

  init() {
    const {CONFIG, LanguageEvents, utils} = this.ctx;
    if (!CONFIG.isGameSite) return;
    // 入口按钮由其它模块注入，这里只监听统一事件并维护下拉菜单文案。
    window.addEventListener('mst:toolkit:open', this.openHandler);
    this.observer = utils.observeBody(() => this.refresh());
    LanguageEvents.subscribe(() => {
      this.refresh();
    });
  }
}
