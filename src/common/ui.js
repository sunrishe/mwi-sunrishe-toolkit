// template-renderer
export const TemplateRenderer = {
  CDN_URL: 'https://cdn.jsdelivr.net/npm/uhtml@5.0.9/dist/prod/dom.min.js',
  _html: null,
  _render: null,
  _Hole: null,
  _unsafe: null,
  _roots: new WeakMap(),
  ready: null,

  init() {
    if (this.ready) return this.ready;
    // uhtml 5.x 仅提供 ESM 构建；并行加载时不影响下方同步安装 WebSocket 拦截。
    this.ready = import(this.CDN_URL).then((module) => {
      this._html = module.html;
      this._render = module.render;
      this._Hole = module.Hole;
      this._unsafe = module.unsafe;
      return this;
    });
    return this.ready;
  },

  html(strings, ...values) {
    if (!this._html) throw new Error('uhtml is not ready');
    return this._html(strings, ...values);
  },

  raw(markup) {
    if (!this._unsafe) throw new Error('uhtml is not ready');
    return this._unsafe(String(markup ?? ''));
  },

  get empty() {
    return null;
  },

  isTemplate(value) {
    return Boolean(this._Hole && value instanceof this._Hole);
  },

  render(view, container) {
    if (!container) return null;
    if (!this._render || !this._html) throw new Error('uhtml is not ready');
    const resolveContent = () => {
      const content = typeof view === 'function' ? view() : view;
      if (!this.isTemplate(content)) throw new TypeError('TemplateRenderer.render requires a template');
      return content;
    };
    const current = this._roots.get(container);
    let next = null;

    if (!current) {
      this._render(container, () => {
        next = resolveContent();
        return next;
      });
      this._roots.set(container, {hole: next});
      return container;
    }

    next = resolveContent();
    if (current.hole.t === next.t) {
      // uhtml 5.0.9 会缓存 repeated render 传入的新 Hole，复用旧 Hole 才能持续增量更新。
      current.hole.update(next);
    } else {
      this._render(container, () => next);
      current.hole = next;
    }
    return container;
  },

  renderHtml(markup, container) {
    return this.render(() => this.html`${this.raw(typeof markup === 'function' ? markup() : markup)}`, container);
  },

  clear(container) {
    return this.render(() => this.html``, container);
  }
};

// calculator-help-popover
export class CalculatorHelpPopover {
  constructor(ctx) {
    this.ctx = ctx;
  }

  mount({popup, moduleName, title, heading, content}) {
    const {TemplateRenderer, utils} = this.ctx;
    const titleElement = popup.querySelector('.swal2-title');
    const container = popup.closest('.swal2-container');
    if (!titleElement || !container) return null;

    const prefix = `mst-${moduleName}-help`;
    const popoverId = `${prefix}-popover`;
    const triggerClass = `${prefix}-trigger`;
    const paragraphClass = `${prefix}-popover-paragraph`;
    const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
    const triggerHost = document.createElement('span');
    triggerHost.className = `${prefix}-anchor`;
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <button type="button" class=${triggerClass} aria-haspopup="true" aria-expanded="false" aria-controls=${popoverId} title=${title}>
    <svg aria-hidden="true"><use href=${`${miscSprite}#info`}></use></svg>
  </button>
`,
      triggerHost
    );
    titleElement.appendChild(triggerHost);

    const popover = document.createElement('div');
    popover.id = popoverId;
    popover.className = `${prefix}-popover`;
    popover.setAttribute('role', 'tooltip');
    TemplateRenderer.render(
      () => TemplateRenderer.html`
  <div class=${`${prefix}-popover-title`}>${heading}</div>
  <div class=${`${prefix}-popover-content`}></div>
`,
      popover
    );
    popover.hidden = true;
    container.appendChild(popover);
    const trigger = triggerHost.querySelector(`.${prefix}-trigger`);
    const contentElement = popover.querySelector(`.${prefix}-popover-content`);
    const renderContent = (text) => {
      const paragraphs = String(text || '')
        .split(/\n+/)
        .filter(Boolean);
      TemplateRenderer.render(
        () => TemplateRenderer.html`
  ${paragraphs.map((paragraph) => TemplateRenderer.html`<div class=${paragraphClass}>${paragraph}</div>`)}
`,
        contentElement
      );
    };
    renderContent(content);

    const positionPopover = () => {
      if (popover.hidden) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
      const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const left = Math.max(
        viewportLeft + margin,
        Math.min(triggerRect.left, viewportRight - popoverRect.width - margin)
      );
      const belowTop = triggerRect.bottom + gap;
      const top =
        belowTop + popoverRect.height <= viewportBottom - margin
          ? belowTop
          : Math.max(viewportTop + margin, triggerRect.top - popoverRect.height - gap);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    const close = () => {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const onTriggerClick = (event) => {
      event.stopPropagation();
      popover.hidden = !popover.hidden;
      trigger.setAttribute('aria-expanded', String(!popover.hidden));
      if (!popover.hidden) positionPopover();
    };
    const onOutsidePointerDown = (event) => {
      if (!triggerHost.contains(event.target) && !popover.contains(event.target)) close();
    };
    triggerHost.addEventListener('pointerdown', (event) => event.stopPropagation());
    trigger.addEventListener('click', onTriggerClick);
    document.addEventListener('pointerdown', onOutsidePointerDown);
    window.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('scroll', positionPopover);

    return {
      setContent(text) {
        renderContent(text);
        positionPopover();
      },
      setError(isError) {
        popover.classList.toggle(`${prefix}-popover-error`, isError);
        trigger.classList.toggle(`${prefix}-trigger-error`, isError);
      },
      cleanup() {
        document.removeEventListener('pointerdown', onOutsidePointerDown);
        window.removeEventListener('resize', positionPopover);
        window.visualViewport?.removeEventListener('resize', positionPopover);
        window.visualViewport?.removeEventListener('scroll', positionPopover);
        TemplateRenderer.clear(triggerHost);
        triggerHost.remove();
        popover.remove();
      }
    };
  }
}

// clipboard-cart-import-feature
export class ClipboardCartImportFeature {
  constructor(ctx, Notifier) {
    this.ctx = ctx;
    this.Notifier = Notifier;
    this.panelRoot = null;
    this.panelObserver = null;
    this.bodyObserver = null;
  }

  parseClipboardCartText(text) {
    const replenish = {open: false, hour: 24};
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const replenishMatch = lines[0]?.match(/^补充(?<days>\d+(?:\.\d+)?)天$/);
    if (replenishMatch) {
      replenish.open = true;
      replenish.hour = parseFloat(replenishMatch.groups.days) * 24;
      replenish.match = lines.shift();
    }

    const countFirstPattern =
      /^(?<limit>\+?)(?<count>\d+(?:\.\d+)?)(?<hour>\/h)?\s+(?<name>.+?)(?:\+(?<level>\d{0,2}))?$/i;
    const nameFirstPattern =
      /^(?<name>.+?)(?:\+(?<level>\d{0,2}))?\s+(?<limit>\+?)(?<count>\d+(?:\.\d+)?)(?<hour>\/h)?$/i;
    const items = [];
    for (const line of lines) {
      const match = line.match(countFirstPattern) || line.match(nameFirstPattern);
      if (!match?.groups) continue;
      const count = parseFloat(match.groups.count);
      const isHour = replenish.open || Boolean(match.groups.hour);
      items.push({
        match: line,
        name: match.groups.name,
        enhancementLevel: parseInt(match.groups.level || 0, 10),
        count,
        isLimit: !isHour && match.groups.limit === '+',
        isHour,
        quantity: isHour ? Math.ceil(replenish.hour * count) : count
      });
    }
    return {replenish, items};
  }

  async importFromClipboard() {
    const {DataHub, CharacterDataService, MarketMateBridge, i18n, utils} = this.ctx;
    const {Notifier} = this;
    try {
      if (!MarketMateBridge.isReady()) {
        Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
        return;
      }
      DataHub.initClientDataFromCache();
      DataHub.refreshI18nIndexes();
      const text = String((await utils.readClipboard()) || '').trim();
      if (!text) {
        Notifier.toast(i18n.t('toastImportClipboardEmpty'), 'error');
        return;
      }
      const result = this.parseClipboardCartText(text);
      const unmatched = [];
      const cartItems = [];
      for (const item of result.items) {
        const rawName = String(item.name || '').trim();
        let hrid = DataHub.ensureItemHrid(rawName) || '';
        if (hrid && !hrid.startsWith('/items/')) hrid = '/items/' + hrid;
        if (!hrid) {
          unmatched.push(rawName);
          continue;
        }
        let stock = 0;
        if (item.isLimit || item.isHour) {
          stock = CharacterDataService.getInventoryCount(hrid, item.enhancementLevel || 0);
        }
        const quantity = Math.ceil(Number(item.quantity - stock));
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        cartItems.push({
          itemId: hrid,
          name: DataHub.resolveItemName(hrid),
          iconRef: hrid,
          quantity,
          source: 'mst_clipboard'
        });
      }
      const response = cartItems.length ? MarketMateBridge.addToCart(cartItems) : {ok: true, added: 0, skipped: 0};
      if (!response?.ok) throw new Error(response?.error || i18n.t('marketMateUnavailable'));
      const added = response.added || 0;
      const quantitySum = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      const parts = [];
      if (added) parts.push(i18n.t('toastImportClipboardDone', added, quantitySum.toLocaleString(i18n.locale)));
      if (unmatched.length) parts.push(i18n.t('toastImportClipboardUnmatched', unmatched.length));
      Notifier.toast(
        parts.length ? parts.join(i18n.t('messageSeparator')) : i18n.t('toastImportClipboardEmpty'),
        added ? 'success' : 'error'
      );
    } catch (error) {
      Notifier.toast(i18n.t('toastImportClipboardFailed', error?.message || error), 'error');
    }
  }

  getMarketMateRoot() {
    return document.getElementById('mwi-mm2-host')?.shadowRoot || null;
  }

  addButton() {
    const {CONFIG, MarketMateBridge, i18n} = this.ctx;
    if (!CONFIG.isGameSite || !MarketMateBridge.isReady() || !this.panelRoot) return;
    const clearButton = this.panelRoot.querySelector('.mm2-foot button[data-act="clear"]');
    if (!clearButton) return;

    // 面板重绘可能重复触发注入，只保留一个 MST 按钮。
    const buttons = [
      ...this.panelRoot.querySelectorAll('#mst-mmm-import-clipboard')
    ];
    let button = buttons.shift();
    buttons.forEach((duplicate) => duplicate.remove());
    if (!button) {
      button = document.createElement('button');
      button.id = 'mst-mmm-import-clipboard';
      button.className = 'fbtn';
      button.type = 'button';
      button.addEventListener('click', (event) => {
        // 阻止市场伴侣脚部的事件委托处理 MST 自定义按钮。
        event.stopPropagation();
        this.importFromClipboard();
      });
    }
    const label = i18n.t('importClipboard');
    if (button.textContent !== label) button.textContent = label;
    if (button.title !== label) button.title = label;

    // 两个 fbtn 默认都有自动左边距，清除后让它们在右侧相邻排列。
    clearButton.style.marginLeft = '0';
    if (button.nextElementSibling !== clearButton) clearButton.before(button);
  }

  connectPanelObserver() {
    const root = this.getMarketMateRoot();
    // 面板内部重绘由 panelObserver 负责；bodyObserver 只检测宿主是否被替换。
    if (root === this.panelRoot) return;
    this.panelObserver?.disconnect();
    this.panelObserver = null;
    this.panelRoot = root;
    if (!root) return;

    // 市场伴侣会重绘清单脚部，需要在重绘后重新插入按钮。
    this.panelObserver = new MutationObserver(() => this.addButton());
    this.panelObserver.observe(root, {childList: true, subtree: true});
    this.addButton();
  }

  updateButtonText() {
    const {i18n} = this.ctx;
    const button = this.panelRoot?.querySelector('#mst-mmm-import-clipboard');
    if (!button) return;
    button.textContent = i18n.t('importClipboard');
    button.title = i18n.t('importClipboard');
  }

  init() {
    const {CONFIG, MarketMateBridge, LanguageEvents, utils} = this.ctx;
    if (!CONFIG.isGameSite) return;
    MarketMateBridge.onReady(() => {
      if (!this.bodyObserver) this.bodyObserver = utils.observeBody(() => this.connectPanelObserver());
    });
    LanguageEvents.subscribe(() => this.updateButtonText());
  }
}

// swal-class-names
export const SWAL_CLASS_NAMES = {
  alert: {container: 'mst-swal2-theme', popup: 'mst-swal2-popup'},
  html: {container: 'mst-swal2-theme', popup: 'mst-swal2-popup mst-swal2-html-popup'}
};

// swal-dragging
const swalDraggingMethods = {
  _enableBoundedDragging(popup) {
    if (!popup || popup._mstDragCleanup) return;
    const margin = 8;
    const clampPosition = (force) => {
      if (!force && !popup.classList.contains('swal2-dragging')) return;
      const viewport = window.visualViewport;
      const layoutWidth = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
      const layoutHeight = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
      const minX = Math.max(0, viewport?.offsetLeft || 0) + margin;
      const minY = Math.max(0, viewport?.offsetTop || 0) + margin;
      const maxX = Math.min(layoutWidth, viewport ? viewport.offsetLeft + viewport.width : layoutWidth) - margin;
      const maxY = Math.min(layoutHeight, viewport ? viewport.offsetTop + viewport.height : layoutHeight) - margin;
      const rect = popup.getBoundingClientRect();
      let deltaX = 0;
      let deltaY = 0;
      if (rect.left < minX) deltaX = minX - rect.left;
      else if (rect.right > maxX) deltaX = maxX - rect.right;
      if (rect.top < minY) deltaY = minY - rect.top;
      else if (rect.bottom > maxY) deltaY = maxY - rect.bottom;
      if (deltaX) {
        const current = parseFloat(popup.style.insetInlineStart) || 0;
        const rtlFactor = getComputedStyle(popup).direction === 'rtl' ? -1 : 1;
        popup.style.insetInlineStart = current + deltaX * rtlFactor + 'px';
      }
      if (deltaY) {
        const current = parseFloat(popup.style.insetBlockStart) || 0;
        popup.style.insetBlockStart = current + deltaY + 'px';
      }
    };
    const onDragEnd = (event) => {
      if (!popup.classList.contains('swal2-dragging')) return;
      const eventType = event?.type?.startsWith('touch') ? 'touchend' : 'mouseup';
      popup.dispatchEvent(new Event(eventType));
      clampPosition(true);
    };
    const onDragMove = (event) => {
      clampPosition(false);
      if (!popup.classList.contains('swal2-dragging')) return;
      const point = event.touches?.[0] || event;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const right = viewport ? left + viewport.width : window.innerWidth;
      const bottom = viewport ? top + viewport.height : window.innerHeight;
      if (point.clientX <= left || point.clientX >= right - 1 || point.clientY <= top || point.clientY >= bottom - 1) {
        onDragEnd(event);
      }
    };
    const onViewportChange = () => clampPosition(true);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            clampPosition(true);
          });
    resizeObserver?.observe(popup);
    document.body.addEventListener('mousemove', onDragMove);
    document.body.addEventListener('touchmove', onDragMove, {passive: true});
    document.body.addEventListener('mouseup', onDragEnd);
    document.body.addEventListener('touchend', onDragEnd);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);
    document.addEventListener('mouseleave', onDragEnd);
    window.addEventListener('blur', onDragEnd);
    window.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    popup._mstDragCleanup = () => {
      document.body.removeEventListener('mousemove', onDragMove);
      document.body.removeEventListener('touchmove', onDragMove);
      document.body.removeEventListener('mouseup', onDragEnd);
      document.body.removeEventListener('touchend', onDragEnd);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchend', onDragEnd);
      document.removeEventListener('mouseleave', onDragEnd);
      window.removeEventListener('blur', onDragEnd);
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      resizeObserver?.disconnect();
      delete popup._mstDragCleanup;
    };
    popup._mstClampPosition = () => clampPosition(true);
    requestAnimationFrame(onViewportChange);
  },

  _disableBoundedDragging(popup) {
    popup?._mstDragCleanup?.();
    delete popup?._mstClampPosition;
  }
};

// toast-notifier
const toastNotifierMethods = {
  _toastPopup: null,
  _toastRoot: null,
  _toastPaused: false,
  _toastSequence: 0,
  _toastItems: [],

  _prefix(type) {
    return {success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', question: '❓'}[type] || '';
  },

  formatText(text, type) {
    const prefix = this._prefix(type);
    return prefix ? prefix + ' ' + String(text || '') : String(text || '');
  },

  _scheduleToast(item) {
    if (this._toastPaused || item.timerId || item.remaining <= 0) return;
    item.startedAt = Date.now();
    item.timerId = setTimeout(() => this._removeToast(item.id), item.remaining);
  },

  _pauseToasts() {
    if (this._toastPaused) return;
    this._toastPaused = true;
    this._toastItems.forEach((item) => {
      if (!item.timerId) return;
      clearTimeout(item.timerId);
      item.timerId = null;
      item.remaining = Math.max(0, item.remaining - (Date.now() - item.startedAt));
    });
  },

  _resumeToasts() {
    if (!this._toastPaused) return;
    this._toastPaused = false;
    this._toastItems.forEach((item) => this._scheduleToast(item));
  },

  _removeToast(id) {
    const index = this._toastItems.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [
      item
    ] = this._toastItems.splice(index, 1);
    if (item.timerId) clearTimeout(item.timerId);
    this._renderToasts();
  },

  // SweetAlert2 同一实例只能显示一个 popup。Toast 复用官方结构和主题类，
  // 但挂载到独立容器，避免关闭或替换名片、房屋计算等 Swal 弹窗。
  _ensureToastHost() {
    if (this._toastPopup && document.contains(this._toastPopup)) return;
    const host = document.createElement('div');
    host.className = 'mst-swal-toast-host mst-swal2-theme';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-toast mst-swal2-toast';
    popup.setAttribute('role', 'status');
    const htmlContainer = document.createElement('div');
    htmlContainer.className = 'swal2-html-container';
    const stack = document.createElement('div');
    stack.className = 'mst-swal-toast-stack';
    htmlContainer.appendChild(stack);
    popup.appendChild(htmlContainer);
    host.appendChild(popup);
    document.body.appendChild(host);
    this._toastPopup = popup;
    this._toastRoot = stack;
    this._toastPopup.onmouseenter = () => this._pauseToasts();
    this._toastPopup.onmouseleave = () => this._resumeToasts();
  },

  _renderToasts() {
    if (!this._toastItems.length) {
      this._toastPopup?.closest('.mst-swal-toast-host')?.remove();
      this._toastPopup = null;
      this._toastRoot = null;
      this._toastPaused = false;
      return;
    }
    this._ensureToastHost();
    if (!this._toastRoot) return;
    const fragment = document.createDocumentFragment();
    this._toastItems.forEach((item) => {
      const element = document.createElement('div');
      element.className = 'mst-swal-toast-item';
      element.setAttribute('role', 'status');
      element.textContent = item.text;
      fragment.appendChild(element);
    });
    this._toastRoot.replaceChildren(fragment);
    this._toastItems.forEach((item) => this._scheduleToast(item));
  },

  toast(text, type = 'info') {
    const {CONFIG} = this.ctx;
    if (!text) return;
    if (typeof Swal === 'undefined') {
      console.warn('[MST]', text);
      return;
    }
    while (this._toastItems.length >= CONFIG.TOAST_MAX_COUNT) {
      const oldest = this._toastItems.shift();
      if (oldest?.timerId) clearTimeout(oldest.timerId);
    }
    const item = {
      id: ++this._toastSequence,
      text: this.formatText(text, type),
      remaining: CONFIG.TOAST_DURATION,
      startedAt: 0,
      timerId: null
    };
    this._toastItems.push(item);
    this._renderToasts();
  }
};

// swal-dialogs
const swalDialogMethods = {
  alert(message, type = 'info', title = '') {
    const {i18n} = this.ctx;
    if (typeof Swal === 'undefined') {
      console.warn('[MST]', title, message);
      return Promise.resolve();
    }
    return Swal.fire({
      heightAuto: false,
      title: title || undefined,
      text: this.formatText(message, type),
      confirmButtonText: i18n.t('confirm'),
      draggable: true,
      customClass: this.SWAL_CLASS_NAMES.alert,
      didOpen: (popup) => this._enableBoundedDragging(popup),
      willClose: (popup) => this._disableBoundedDragging(popup)
    });
  },

  // 后续带关闭按钮的内容弹窗统一通过此入口创建。
  html({title, html: content, width = '48rem', popupClass = '', containerClass = '', didOpen, willClose}) {
    const {TemplateRenderer} = this.ctx;
    if (typeof Swal === 'undefined') {
      console.warn('[MST]', title);
      return Promise.resolve();
    }
    const templateFactory =
      typeof content === 'function'
        ? content
        : TemplateRenderer.isTemplate(content)
          ? () => content
          : typeof content === 'string'
            ? () => TemplateRenderer.html`${TemplateRenderer.raw(content)}`
            : null;
    const templateRoot = templateFactory
      ? TemplateRenderer.render(templateFactory, document.createElement('div'))
      : null;
    return Swal.fire({
      heightAuto: false,
      title,
      html: templateRoot || content,
      width,
      showCloseButton: true,
      showConfirmButton: false,
      draggable: true,
      customClass: {
        container: [
          this.SWAL_CLASS_NAMES.html.container, containerClass
        ]
          .filter(Boolean)
          .join(' '),
        popup: [
          this.SWAL_CLASS_NAMES.html.popup, popupClass
        ]
          .filter(Boolean)
          .join(' ')
      },
      didOpen: (popup) => {
        this._enableBoundedDragging(popup);
        didOpen?.(popup);
      },
      willClose: (popup) => {
        willClose?.(popup);
        this._disableBoundedDragging(popup);
        if (templateRoot) TemplateRenderer.clear(templateRoot);
      }
    });
  }
};

// notifier
export class Notifier {
  constructor(ctx, classNames = SWAL_CLASS_NAMES) {
    this.ctx = ctx;
    this.SWAL_CLASS_NAMES = classNames;
    this._toastPopup = null;
    this._toastRoot = null;
    this._toastPaused = false;
    this._toastSequence = 0;
    this._toastItems = [];
    Object.assign(this, swalDraggingMethods, toastNotifierMethods, swalDialogMethods);
  }
}

// runtime-ui
export function installCommonUi(ctx) {
  const notifier = new Notifier(ctx, SWAL_CLASS_NAMES);

  ctx.SWAL_CLASS_NAMES = SWAL_CLASS_NAMES;
  ctx.Notifier = notifier;
  ctx.ClipboardCartImportFeature = ClipboardCartImportFeature;
  ctx.CalculatorHelpPopover = new CalculatorHelpPopover(ctx);
}
