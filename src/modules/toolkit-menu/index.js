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
    this.openHandler = (event) =>
      this.toggleDropdown(event?.detail?.trigger || null, event?.detail?.anchorRect || null);
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
        icon: 'experience',
        handler: () => this.combatCalculator.open()
      }, {
        key: 'equipmentComparison',
        icon: 'loadout',
        handler: () => this.equipmentComparison.open()
      },
      {key: 'dungeonProfitCalculator', icon: 'loot_tracker', handler: () => this.dungeonCalculator.open()}, {
        key: 'combatSimAiwwb',
        icon: 'combat',
        handler: () => this.openCombatSimulator()
      }, {
        key: 'switchCharacter',
        icon: 'switch_character',
        handler: () => {
          if (!GameNavigationService.switchCharacter()) Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
        }
      }
    ];
  }

  // 跳转 aiwwb 战斗模拟器；window.open 传固定 target 名，重复点击复用同一窗口不新开。
  openCombatSimulator() {
    window.open('https://aiwwb.github.io/milkywayidle_battle/dist/', 'mst-combat-sim-aiwwb');
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

  toggleDropdown(trigger, anchorRect) {
    const {GameUiAdapter} = this.ctx;
    const old = document.getElementById('mst-toolkit-character-dropdown');
    if (old) {
      this.closeDropdown();
      return;
    }
    // 优先锚定到点击来源附近：从头像弹出层打开时用点击前捕获的弹出层矩形（弹出层随后被关闭并卸载，
    // 脱离文档的元素无法再读取位置），下拉右上角与弹出层右上角对齐；页头入口保持锚定按钮自身；
    // 找不到来源时回退到游戏头部角色信息区域。
    const avatarMenu = anchorRect ? null : trigger?.closest?.('[class*="Header_avatarMenu"]');
    const host =
      avatarMenu || trigger?.closest?.('[class*="Header_characterInfo"]') || GameUiAdapter.query('headerCharacterInfo');
    if (!host && !anchorRect) return;
    const dropdown = document.createElement('div');
    dropdown.id = 'mst-toolkit-character-dropdown';
    this.renderDropdown(dropdown);
    document.body.appendChild(dropdown);
    // 从头像弹出层打开时下拉占据弹出层原位（右缘与顶部对齐整块浮层），页头入口保持锚定按钮自身。
    const positionAnchor = anchorRect ? {getBoundingClientRect: () => anchorRect} : avatarMenu || trigger || host;
    this.bindDropdownPosition(dropdown, positionAnchor, Boolean(anchorRect || avatarMenu));
    setTimeout(() => document.addEventListener('click', this.outsideClickHandler), 0);
  }

  closeDropdown() {
    document.removeEventListener('click', this.outsideClickHandler);
    this.dropdownCleanup?.();
    this.dropdownCleanup = null;
    document.getElementById('mst-toolkit-character-dropdown')?.remove();
  }

  // alignTop = true 时下拉顶部与锚点顶部对齐（头像浮窗场景：浮窗关闭后下拉停在原位置），
  // 空间不足时仍在视口内收敛；默认沿锚点下方展开。
  bindDropdownPosition(dropdown, trigger, alignTop = false) {
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
      const top = alignTop
        ? Math.max(viewportTop + margin, Math.min(triggerRect.top, viewportBottom - dropdownRect.height - margin))
        : belowTop + dropdownRect.height <= viewportBottom - margin
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

  // 在右上角头像弹出层（游戏原生 Header_avatarMenu 菜单）里注入工具箱入口，
  // 放在所有条目最前面（标题行之下、查看资料之前）；菜单每次打开都会重新挂载，由公共观察器注入。
  addAvatarMenuEntry() {
    const {i18n} = this.ctx;
    const menu = document.querySelector('[class*="Header_avatarMenu"]');
    if (!menu) return;
    const label = i18n.t('toolkitTitle');
    const existingButton = menu.querySelector('.mst-avatar-toolkit-btn');
    if (existingButton) {
      if (existingButton.textContent !== label) existingButton.textContent = label;
      if (existingButton.getAttribute('title') !== label) existingButton.setAttribute('title', label);
      return;
    }
    const gameButtonClasses = [
      ...(menu.querySelector('button')?.classList || [])
    ].filter((className) => className.startsWith('Button_button__') || className.startsWith('Button_fullWidth__'));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
      ...gameButtonClasses, 'mst-avatar-toolkit-btn'
    ]
      .filter(Boolean)
      .join(' ');
    button.textContent = label;
    button.title = label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // 先捕获弹出层当前位置（游戏原生以 MUI Tooltip 渲染整块浮层，placement bottom-end 锚定到头像按钮）；
      // 组件关闭后浮层会卸载，脱离文档后无法再读取矩形。与游戏自身浮层出现位置保持一致——
      // 下拉右上角对齐弹出层整体（含内边距与边框）的右上角，而不是对齐被内边距包裹的内部菜单。
      const menu = button.closest('[class*="Header_avatarMenu"]');
      const anchorRect =
        menu?.closest('.MuiTooltip-tooltip')?.getBoundingClientRect() || menu?.getBoundingClientRect() || null;
      document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
      window.dispatchEvent(new CustomEvent('mst:toolkit:open', {detail: {trigger: button, anchorRect}}));
    });
    const firstButton = menu.querySelector('button');
    if (firstButton) menu.insertBefore(button, firstButton);
    else menu.appendChild(button);
  }

  refresh() {
    const {i18n} = this.ctx;
    document.querySelectorAll('.mst-my-character-card-btn').forEach((button) => {
      const text = i18n.t('toolkitShort');
      const title = i18n.t('toolkitTitle');
      if (button.textContent !== text) button.textContent = text;
      if (button.getAttribute('title') !== title) button.setAttribute('title', title);
    });
    this.addAvatarMenuEntry();
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
