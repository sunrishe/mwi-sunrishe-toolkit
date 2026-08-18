import {StyleService} from '../../common/runtime.js';
import MST_LABYRINTH_SUPPLY_CSS from './styles.css';

// 迷宫入场配置未设置物品时，按专家档位道具兜底（与游戏 LabyrinthSupplyItems 的 expert 系列一致）。
const LABYRINTH_DEFAULT_ITEMS = Object.freeze({
  torch: '/items/expert_torch',
  shroud: '/items/expert_shroud',
  beacon: '/items/expert_beacon',
  teaCrate: '/items/expert_tea_crate',
  coffeeCrate: '/items/expert_coffee_crate',
  foodCrate: '/items/expert_food_crate'
});

// 道具携带上限：角色未解锁对应迷宫升级时使用游戏基础上限（LabyrinthBaseTorchCap 等）。
const LABYRINTH_BASE_CAPS = Object.freeze({torch: 100, shroud: 4, beacon: 5});

// 游戏入场券上限固定为 5（迷宫入口“入场券: {{current}} / {{max}}”的 max 为硬编码）。
const LABYRINTH_MAX_ENTRIES = 5;

const SUPPLY_KEYS = Object.freeze([
  'torch', 'shroud', 'beacon'
]);
const CRATE_KEYS = Object.freeze([
  'teaCrate', 'coffeeCrate', 'foodCrate'
]);

// 每次入场各补给箱消耗 1 个（茶箱/咖啡箱/食物箱），道具按携带上限补足。
export function calculateLabyrinthSupply(config, ownedCounts, entryCount) {
  const count = Math.max(1, Math.floor(Number(entryCount) || 0));
  const owned = ownedCounts || {};
  const items = [];
  for (const key of SUPPLY_KEYS) {
    const entry = config?.[key];
    if (!entry?.hrid) continue;
    const cap = Math.max(0, Number(entry.cap) || 0);
    const missing = Math.max(0, cap * count - Number(owned[entry.hrid] || 0));
    if (missing > 0) items.push({itemId: entry.hrid, quantity: missing});
  }
  for (const key of CRATE_KEYS) {
    const entry = config?.[key];
    if (!entry?.hrid) continue;
    const missing = Math.max(0, count - Number(owned[entry.hrid] || 0));
    if (missing > 0) items.push({itemId: entry.hrid, quantity: missing});
  }
  return items;
}

// labyrinth-supply-config
const labyrinthSupplyConfig = {
  getConfig(feature) {
    const {CharacterDataService} = feature.ctx;
    const raw = CharacterDataService.raw || {};
    const info = raw.characterInfo || {};
    const setting = raw.characterSetting || {};
    const cap = (name) => {
      const value = Number(info[`labyrinth${name}Cap`]);
      return value > 0 ? value : LABYRINTH_BASE_CAPS[name.toLowerCase()];
    };
    const pick = (name) => setting[`labyrinth${name}Hrid`] || LABYRINTH_DEFAULT_ITEMS[name.toLowerCase()];
    return {
      torch: {hrid: pick('Torch'), cap: cap('Torch')},
      shroud: {hrid: pick('Shroud'), cap: cap('Shroud')},
      beacon: {hrid: pick('Beacon'), cap: cap('Beacon')},
      teaCrate: {hrid: pick('TeaCrate')},
      coffeeCrate: {hrid: pick('CoffeeCrate')},
      foodCrate: {hrid: pick('FoodCrate')}
    };
  }
};

// labyrinth-supply-cart
const labyrinthSupplyCart = {
  addToCart(feature, entryCount) {
    const {CharacterDataService, DataHub, MarketMateBridge, i18n, Notifier} = feature.ctx;
    if (!MarketMateBridge.isReady()) {
      Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
      return;
    }
    const config = labyrinthSupplyConfig.getConfig(feature);
    const owned = {};
    for (const key of [
      ...SUPPLY_KEYS, ...CRATE_KEYS
    ]) {
      const hrid = config[key].hrid;
      if (hrid && owned[hrid] == null) owned[hrid] = CharacterDataService.getInventoryCount(hrid, 0);
    }
    const quantities = calculateLabyrinthSupply(config, owned, entryCount);
    if (!quantities.length) {
      Notifier.toast(i18n.t('labyrinthSupplyNothingMissing'), 'info');
      return;
    }
    const items = quantities.map(({itemId, quantity}) => ({
      itemId,
      name: DataHub.resolveItemName(itemId),
      iconRef: itemId,
      quantity,
      source: 'mst_labyrinth'
    }));
    const response = MarketMateBridge.addToCart(items);
    if (!response?.ok) {
      Notifier.toast(response?.error || i18n.t('labyrinthSupplyAddFailed'), 'error');
      return;
    }
    const total = quantities.reduce((sum, item) => sum + item.quantity, 0);
    Notifier.toast(i18n.t('labyrinthSupplyDone', quantities.length, total.toLocaleString(i18n.locale)), 'success');
  }
};

// labyrinth-supply-popover
const labyrinthSupplyPopover = {
  show(feature) {
    if (!feature.popover || !feature.wrapper?.isConnected) return;
    feature.popover.hidden = false;
    this.position(feature);
  },

  hide(feature) {
    if (feature.popover) feature.popover.hidden = true;
  },

  position(feature) {
    const popover = feature.popover;
    const trigger = feature.wrapper?.querySelector('.mst-labyrinth-supply-toggle');
    if (!popover || !trigger) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const margin = 8;
    const gap = 6;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.max(
      viewportLeft + margin,
      Math.min(
        triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2,
        viewportRight - popoverRect.width - margin
      )
    );
    // 优先显示在按钮上方，空间不足时再放到下方。
    const aboveTop = triggerRect.top - popoverRect.height - gap;
    const belowTop = triggerRect.bottom + gap;
    const top =
      aboveTop >= viewportTop + margin ? aboveTop : Math.min(belowTop, viewportBottom - popoverRect.height - margin);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
};

// labyrinth-supply-feature
export class LabyrinthSupplyFeature {
  static ctx = null;

  static configure(ctx) {
    this.ctx = ctx;
  }

  constructor() {
    this.ctx = LabyrinthSupplyFeature.ctx;
    this.bodyObserver = null;
    this.anchor = null;
    this.wrapper = null;
    this.popover = null;
    this.hideTimer = null;
    this.lastTogglePointerAt = 0;
  }

  init() {
    const {CONFIG, LanguageEvents, pageWindow, utils} = this.ctx;
    if (!CONFIG.isGameSite) return;
    // 同一页面只允许一个迷宫补给实例活动：调试注入、旧脚本残留等并存时，
    // 多个实例会互相清理对方插入的按钮导致按钮持续闪烁，先到先得。
    // 标记必须写在页面 window（unsafeWindow）上：油猴沙箱的 window 与页面 window
    // 是两个对象，写在沙箱 window 上时其他脚本副本（另一个沙箱）看不到该标记。
    if (pageWindow.__MST_LABYRINTH_SUPPLY_OWNER__) return;
    pageWindow.__MST_LABYRINTH_SUPPLY_OWNER__ = true;
    // 旧版本脚本可能残留旧 CSS（如按钮 fixed 定位），主动覆盖为当前样式，避免升级后样式不更新。
    const existingStyle = document.getElementById('mst-labyrinth-supply-style');
    if (existingStyle) existingStyle.textContent = MST_LABYRINTH_SUPPLY_CSS;
    else StyleService.ensure('mst-labyrinth-supply-style', MST_LABYRINTH_SUPPLY_CSS);
    this.bodyObserver = utils.observeBody(() => this.sync());
    LanguageEvents.subscribe(() => this.updateLabels());
  }

  sync() {
    const {GameUiAdapter} = this.ctx;
    const panel = GameUiAdapter.query('labyrinthPanel');
    // 按钮容器与入口屏是迷宫标签页下的平级节点（真实 DOM 位于 labyrinthTab > bottomArea > infoContainer 内），
    // 且只有入口屏才渲染（进行中的迷宫无此容器），直接在面板内查询即可。
    const buttonsContainer = panel?.querySelector('[class*="LabyrinthPanel_buttonsContainer"]') || null;
    // 只认真正的“进入迷宫”按钮：补充补给按钮也复用 Button_ 类，若把其他实例的
    // 补充补给按钮错当锚点，两个实例会互相插拔按钮导致持续闪烁，必须排除。
    const candidates = buttonsContainer ? [
          ...buttonsContainer.querySelectorAll('button')
        ] : [];
    const enterButton =
      candidates.find(
        (button) => /Button_/.test(button.className) && !button.classList.contains('mst-labyrinth-supply-toggle')
      ) ||
      candidates.find((button) => !button.classList.contains('mst-labyrinth-supply-toggle')) ||
      null;
    if (!enterButton) {
      this.teardown();
      return;
    }
    // “进入迷宫”按钮默认用 large 档（2.25rem 高），视觉偏高；
    // 移除 Button_large 变体即回落到游戏官方 normal 档高度（1.875rem），游戏重渲染后由本方法重新维持。
    const buttonNames = String(enterButton.className || '').split(/\s+/);
    const largeIndex = buttonNames.findIndex((name) => name.startsWith('Button_large__'));
    if (largeIndex >= 0) {
      buttonNames.splice(largeIndex, 1);
      enterButton.className = buttonNames.join(' ');
    }
    // 按钮与悬浮窗都随游戏面板布局：按钮插入“进入迷宫”按钮后方的文档流内（与房屋计算器触发按钮一致），
    // 悬浮窗是临时浮层才挂 body；游戏重渲染清掉按钮节点时由观察器重建。
    if (enterButton !== this.anchor || !this.wrapper?.isConnected) {
      this.teardown();
      this.anchor = enterButton;
      this.build(enterButton);
    }
  }

  build(anchor) {
    const {i18n} = this.ctx;
    // 复用游戏按钮外观：基础类从页面现有按钮动态提取（游戏更新 CSS 哈希后仍能跟随），
    // 与“进入迷宫”按钮同为官方 normal 档尺寸；不追加 small/large 变体。
    const gameButtonClass = (() => {
      const found = new Set();
      this.ctx.GameUiAdapter.query('labyrinthPanel')
        ?.querySelectorAll('button[class*="Button_"]')
        .forEach((button) => {
          String(button.className || '')
            .split(/\s+/)
            .forEach((name) => {
              if (name.startsWith('Button_button__')) found.add(name);
            });
        });
      return [
          ...found
        ].find((name) => name.startsWith('Button_button__')) || 'Button_button__1Fe9z';
    })();
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'mst-labyrinth-supply';
    const label = i18n.t('labyrinthSupply');
    this.wrapper.innerHTML = `<button type="button" class="mst-labyrinth-supply-toggle ${gameButtonClass}" title="${label}">${label}</button>`;
    // 先清掉按钮容器内可能残留的同名按钮（页面同时存在多个脚本实例时避免互相干扰）。
    anchor.parentElement?.querySelectorAll('.mst-labyrinth-supply').forEach((element) => element.remove());
    // 插入按钮容器文档流（“进入迷宫”按钮正上方），随面板布局自动排布，不会漂移。
    anchor.insertAdjacentElement('beforebegin', this.wrapper);
    const toggle = this.wrapper.querySelector('.mst-labyrinth-supply-toggle');
    // 点击切换小窗：pointerup 先于触屏点击时浏览器合成的 mouseenter 触发（合成序列为
    // touchstart → touchend → pointerup → mouseenter → mousedown → mouseup → click），
    // 若沿用 click 切换，弹窗会先被合成 mouseenter 显示、再被 click 判定“已显示”而立即
    // 隐藏，移动端表现为点了没反应；pointerup 切换时弹窗状态尚未被合成事件改动。
    toggle.addEventListener('pointerup', (event) => {
      event.stopPropagation();
      this.lastTogglePointerAt = Date.now();
      this.togglePopover();
    });
    // 键盘（Enter/空格）只触发 click，作为切换兜底；pointerup 已切换的同一点击跳过去重。
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (Date.now() - (this.lastTogglePointerAt || 0) < 500) return;
      this.togglePopover();
    });

    this.popover = document.createElement('div');
    this.popover.className = 'mst-labyrinth-supply-popover';
    this.popover.setAttribute('role', 'menu');
    this.popover.hidden = true;
    document.body.appendChild(this.popover);
    this.renderPopover();

    // 悬浮显示小窗；从按钮移向小窗期间短暂延迟隐藏，避免窗口抖动。
    // 触屏点击会合成 mouseenter（在 pointerup 之后），500ms 内忽略，避免覆盖点击切换的结果。
    this.wrapper.addEventListener('mouseenter', () => {
      if (Date.now() - (this.lastTogglePointerAt || 0) < 500) return;
      this.scheduleShow(0);
    });
    this.wrapper.addEventListener('mouseleave', () => this.scheduleHide());
    this.popover.addEventListener('mouseenter', () => {
      if (Date.now() - (this.lastTogglePointerAt || 0) < 500) return;
      this.scheduleShow(0);
    });
    this.popover.addEventListener('mouseleave', () => this.scheduleHide());
    document.addEventListener(
      'pointerdown',
      (this.outsidePointerDownHandler = (event) => {
        if (!this.wrapper?.contains(event.target) && !this.popover?.contains(event.target)) this.hidePopover();
      })
    );
    // 捕获阶段监听滚动与视口变化：悬浮窗显示期间跟随按钮重新定位（按钮本体在文档流内无需处理）。
    this.repositionHandler = () => {
      if (!this.popover?.hidden) labyrinthSupplyPopover.position(this);
    };
    document.addEventListener('scroll', this.repositionHandler, true);
    window.addEventListener('resize', this.repositionHandler);
    window.visualViewport?.addEventListener('resize', this.repositionHandler);
    window.visualViewport?.addEventListener('scroll', this.repositionHandler);
    this.updateLabels();
  }

  renderPopover() {
    const {i18n, TemplateRenderer} = this.ctx;
    const options = Array.from(
      {length: LABYRINTH_MAX_ENTRIES},
      (_, index) => TemplateRenderer.html`
  <button type="button" role="menuitem" data-entry-count=${String(index + 1)}
      title=${i18n.t('labyrinthSupplyRunTitle', String(index + 1))}>${index + 1}</button>`
    );
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <div class="mst-labyrinth-supply-popover-title">${i18n.t('labyrinthSupplyPopoverTitle')}</div>
  <div class="mst-labyrinth-supply-popover-grid">${options}</div>
`,
      this.popover
    );
    this.popover.querySelectorAll('[data-entry-count]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        labyrinthSupplyCart.addToCart(this, Number(button.dataset.entryCount));
        this.hidePopover();
      });
    });
  }

  scheduleShow(delay) {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    const show = () => labyrinthSupplyPopover.show(this);
    if (delay > 0) this.hideTimer = setTimeout(show, delay);
    else show();
  }

  scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hidePopover(), 120);
  }

  togglePopover() {
    if (this.popover?.hidden) this.scheduleShow(0);
    else this.hidePopover();
  }

  hidePopover() {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    labyrinthSupplyPopover.hide(this);
  }

  teardown() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.outsidePointerDownHandler) {
      document.removeEventListener('pointerdown', this.outsidePointerDownHandler);
      this.outsidePointerDownHandler = null;
    }
    if (this.repositionHandler) {
      document.removeEventListener('scroll', this.repositionHandler, true);
      window.removeEventListener('resize', this.repositionHandler);
      window.visualViewport?.removeEventListener('resize', this.repositionHandler);
      window.visualViewport?.removeEventListener('scroll', this.repositionHandler);
      this.repositionHandler = null;
    }
    this.popover?.remove();
    this.popover = null;
    this.wrapper?.remove();
    this.wrapper = null;
    this.anchor = null;
  }

  updateLabels() {
    const {i18n} = this.ctx;
    const toggle = this.wrapper?.querySelector('.mst-labyrinth-supply-toggle');
    if (!toggle) return;
    const label = i18n.t('labyrinthSupply');
    toggle.textContent = label;
    toggle.title = i18n.t('labyrinthSupplyTitle');
    // 悬浮小窗内容只在构建时渲染一次，语言切换后标题与入场次数按钮提示也要跟着更新。
    const title = this.popover?.querySelector('.mst-labyrinth-supply-popover-title');
    if (title) title.textContent = i18n.t('labyrinthSupplyPopoverTitle');
    this.popover?.querySelectorAll('[data-entry-count]').forEach((button) => {
      button.title = i18n.t('labyrinthSupplyRunTitle', String(button.dataset.entryCount));
    });
  }
}
