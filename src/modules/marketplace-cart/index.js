import {StyleService} from '../../common/runtime.js';
import MST_MARKETPLACE_CART_CSS from './styles.css';

// 市场加购固定数量：把“市场当前物品”加入购物车 1 个。
const MARKETPLACE_CART_QUANTITY = 1;

// marketplace-cart-state
// 从锚点 DOM 的 React fiber 链向上找 MarketplacePanel 类组件实例并返回其 state；
// 游戏源码（MarketplacePanel 组件）该 state 同时含 marketListingsView/itemHrid/enhancementLevel，
// 订单簿视图下 enhancementLevel 就是当前查看的强化等级，可增强物品据此保留等级。
export function readMarketplacePanelState(fiber) {
  let current = fiber;
  while (current) {
    const instance = current.stateNode;
    const state = instance?.state;
    if (
      state &&
      typeof state === 'object' &&
      'marketListingsView' in state &&
      'itemHrid' in state &&
      'enhancementLevel' in state &&
      typeof instance.handleRefresh === 'function'
    ) {
      return state;
    }
    current = current.return;
  }
  return null;
}

// marketplace-cart-feature
export class MarketplaceCartFeature {
  static ctx = null;

  static configure(ctx) {
    this.ctx = ctx;
  }

  constructor() {
    this.ctx = MarketplaceCartFeature.ctx;
    this.bodyObserver = null;
    this.anchor = null;
    this.wrapper = null;
  }

  init() {
    const {CONFIG, LanguageEvents, pageWindow, utils} = this.ctx;
    if (!CONFIG.isGameSite) return;
    // 同一页面只允许一个市场加购实例活动：调试注入、旧脚本残留等并存时，
    // 多个实例会互相清理对方插入的按钮导致按钮持续闪烁，先到先得。
    // 标记必须写在页面 window（unsafeWindow）上：油猴沙箱的 window 与页面 window
    // 是两个对象，写在沙箱 window 上时其他脚本副本（另一个沙箱）看不到该标记。
    if (pageWindow.__MST_MARKETPLACE_CART_OWNER__) return;
    pageWindow.__MST_MARKETPLACE_CART_OWNER__ = true;
    StyleService.ensure('mst-marketplace-cart-style', MST_MARKETPLACE_CART_CSS);
    this.bodyObserver = utils.observeBody(() => this.sync());
    LanguageEvents.subscribe(() => this.updateLabel());
  }

  sync() {
    const {DataHub, GameUiAdapter} = this.ctx;
    const container = GameUiAdapter.query('marketplaceNavButtons');
    // 游戏源码 renderMarketListingsNavigationButtons 的 children 顺序固定为
    // [viewAllItems, viewAllEnhancementLevels, refresh]，刷新按钮恒为最后一个；
    // 排除本模块按钮后取最后一个（React 重渲染清掉本模块按钮后即刷新按钮本身）。
    const candidates = container ? [
          ...container.querySelectorAll('button')
        ] : [];
    const refreshButton =
      [
        ...candidates
      ]
        .reverse()
        .find((button) => {
          if (button.classList.contains('mst-marketplace-cart-button')) return false;
          // 只认 React 渲染的按钮：其他脚本克隆/注入的按钮（如生产采集增强脚本的
          // market-cart-btn）没有 __reactFiber 关联，用作锚点后读不到 MarketplacePanel
          // state，点击会误报“当前没有可加入购物车的市场物品”。
          return DataHub.getReactFiber(button) != null;
        }) || null;
    if (!refreshButton) {
      this.teardown();
      return;
    }
    // 按钮插入刷新按钮后方的文档流内（与迷宫补充补给同一做法），随面板布局自动排布；
    // 游戏重渲染清掉按钮节点时由观察器重建。
    if (refreshButton !== this.anchor || !this.wrapper?.isConnected) {
      this.teardown();
      this.anchor = refreshButton;
      this.build(refreshButton);
    }
  }

  build(anchor) {
    const {i18n} = this.ctx;
    // 复用游戏按钮外观：基础类从导航按钮容器现有按钮动态提取（游戏更新 CSS 哈希后仍能跟随）。
    const gameButtonClass = (() => {
      const names = [];
      anchor.parentElement?.querySelectorAll('button[class*="Button_"]').forEach((button) => {
        names.push(...String(button.className || '').split(/\s+/));
      });
      return names.find((name) => name.startsWith('Button_button__')) || 'Button_button__1Fe9z';
    })();
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'mst-marketplace-cart';
    const label = i18n.t('marketplaceCart');
    this.wrapper.innerHTML = `<button type="button" class="mst-marketplace-cart-button ${gameButtonClass}" title="${label}">${label}</button>`;
    // 先清掉按钮容器内可能残留的同名按钮（页面同时存在多个脚本实例时避免互相干扰）。
    anchor.parentElement?.querySelectorAll('.mst-marketplace-cart').forEach((element) => element.remove());
    // 插入刷新按钮后方的文档流内，随面板布局自动排布，不会漂移。
    anchor.insertAdjacentElement('afterend', this.wrapper);
    const button = this.wrapper.querySelector('.mst-marketplace-cart-button');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.addToCart();
    });
    this.updateLabel();
  }

  addToCart() {
    const {DataHub, i18n, MarketMateBridge, Notifier} = this.ctx;
    if (!MarketMateBridge.isReady()) {
      Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
      return;
    }
    const anchor = this.anchor;
    if (!anchor?.isConnected) return;
    const state = readMarketplacePanelState(DataHub.getReactFiber(anchor));
    const itemHrid = state?.itemHrid;
    if (!state || !itemHrid) {
      Notifier.toast(i18n.t('marketplaceCartNoItem'), 'warning');
      return;
    }
    const enhancementLevel = Math.max(0, Math.floor(Number(state.enhancementLevel) || 0));
    const name = DataHub.resolveItemName(itemHrid);
    const response = MarketMateBridge.addToCart([
      {
        itemId: itemHrid,
        enhancementLevel,
        name,
        iconRef: itemHrid,
        quantity: MARKETPLACE_CART_QUANTITY,
        source: 'mst_marketplace'
      }
    ]);
    if (!response?.ok) {
      Notifier.toast(response?.error || i18n.t('marketplaceCartAddFailed'), 'error');
      return;
    }
    const label = enhancementLevel > 0 ? `${name} +${enhancementLevel}` : name;
    Notifier.toast(i18n.t('marketplaceCartDone', label), 'success');
  }

  updateLabel() {
    const {i18n} = this.ctx;
    const button = this.wrapper?.querySelector('.mst-marketplace-cart-button');
    if (!button) return;
    const label = i18n.t('marketplaceCart');
    button.textContent = label;
    button.title = i18n.t('marketplaceCartTitle');
  }

  teardown() {
    this.wrapper?.remove();
    this.wrapper = null;
    this.anchor = null;
  }
}
