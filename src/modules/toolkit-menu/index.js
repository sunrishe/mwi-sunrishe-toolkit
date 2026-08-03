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
    this.dropdownCleanup = null;
    this.outsideClickHandler = (event) => {
      const dropdown = document.getElementById('mst-toolkit-character-dropdown');
      if (dropdown && !dropdown.contains(event.target)) this.closeDropdown();
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
      const text = i18n.t('toolkitShort');
      const title = i18n.t('toolkitTitle');
      if (button.textContent !== text) button.textContent = text;
      if (button.getAttribute('title') !== title) button.setAttribute('title', title);
    });
  }

  toggleDropdown(trigger) {
    const {GameUiAdapter} = this.ctx;
    const old = document.getElementById('mst-toolkit-character-dropdown');
    if (old) {
      this.closeDropdown();
      return;
    }
    // 优先挂到点击来源附近；找不到来源时回退到游戏头部角色信息区域。
    const host = trigger?.closest?.('[class*="Header_characterInfo"]') || GameUiAdapter.query('headerCharacterInfo');
    if (!host) return;
    const dropdown = document.createElement('div');
    dropdown.id = 'mst-toolkit-character-dropdown';
    this.renderDropdown(dropdown);
    document.body.appendChild(dropdown);
    this.bindDropdownPosition(dropdown, trigger || host);
    setTimeout(() => document.addEventListener('click', this.outsideClickHandler), 0);
  }

  closeDropdown() {
    document.removeEventListener('click', this.outsideClickHandler);
    this.dropdownCleanup?.();
    this.dropdownCleanup = null;
    document.getElementById('mst-toolkit-character-dropdown')?.remove();
  }

  bindDropdownPosition(dropdown, trigger) {
    const positionDropdown = () => {
      if (!dropdown.isConnected) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportWidth = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = viewport?.height || document.documentElement.clientHeight || window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const margin = 8;
      const gap = 6;
      const triggerRect = trigger?.getBoundingClientRect?.() || {
        left: viewportRight - margin,
        right: viewportRight - margin,
        top: viewportTop + margin,
        bottom: viewportTop + margin
      };
      dropdown.style.maxHeight = Math.max(8 * 16, viewportHeight - margin * 2) + 'px';
      const dropdownRect = dropdown.getBoundingClientRect();
      const preferredLeft = triggerRect.right - dropdownRect.width;
      const left = Math.max(
        viewportLeft + margin,
        Math.min(preferredLeft, viewportRight - dropdownRect.width - margin)
      );
      const belowTop = triggerRect.bottom + gap;
      const aboveTop = triggerRect.top - dropdownRect.height - gap;
      const top =
        belowTop + dropdownRect.height <= viewportBottom - margin
          ? belowTop
          : Math.max(viewportTop + margin, Math.min(aboveTop, viewportBottom - dropdownRect.height - margin));
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;
      dropdown.style.right = 'auto';
    };
    window.addEventListener('resize', positionDropdown);
    window.visualViewport?.addEventListener('resize', positionDropdown);
    window.visualViewport?.addEventListener('scroll', positionDropdown);
    this.dropdownCleanup = () => {
      window.removeEventListener('resize', positionDropdown);
      window.visualViewport?.removeEventListener('resize', positionDropdown);
      window.visualViewport?.removeEventListener('scroll', positionDropdown);
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(positionDropdown);
    else setTimeout(positionDropdown, 0);
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
