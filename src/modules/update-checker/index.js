// 检查更新：后台定期从镜像地址读取脚本 meta.js 的 @version（只读版本号，不下载脚本本体）。
// 工具箱菜单固定提供“检查更新”入口：发现新版本时它变成“更新新版本”并直接打开安装直链，
// 没有新版本时打开检查弹窗显示当前版本与最新版本；同时给工具箱入口加红框与小点提示。
// 安装直链跟随检查成功的那个源（网络不通时“查得到”和“装得上”必须是同一条链路）。
// 检查状态只存内存（最近检查时间、远端版本号与来源），页面刷新后重新检查一次，不做任何持久化。
import {PACKAGE_VERSION} from '../../common/build-flags.js';
import {StyleService} from '../../common/runtime.js';
import {isNewerVersion} from '../../common/version.js';
import MST_UPDATE_CHECKER_CSS from './styles.css';
import {fetchLatestVersion, FALLBACK_INSTALL_URL, UPDATE_CHECK_SOURCES} from './meta.js';

// 后台检查间隔：6 小时；页面持续打开时每 30 分钟判断一次是否到期。
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_CHECK_TICK_MS = 30 * 60 * 1000;
// 启动后延迟再检查，避开页面加载高峰。
export const UPDATE_CHECK_INITIAL_DELAY_MS = 10000;
// 单个地址的请求超时。
const REQUEST_TIMEOUT_MS = 15000;

export class UpdateCheckerFeature {
  constructor(ctx) {
    this.ctx = ctx;
    this.latestVersion = '';
    this.lastCheckedAt = 0;
    this.sourceKey = '';
    this.installUrl = '';
    this.checkPromise = null;
    this.listeners = new Set();
    this.initialTimer = null;
    this.timer = null;
    this.dialogRoot = null;
    this.dialogState = null;
    this.dialogToken = 0;
  }

  init() {
    const {CONFIG, LanguageEvents} = this.ctx;
    // 工具箱只在游戏页面存在，非游戏站不建定时器、不发请求。
    if (!CONFIG.isGameSite) return;
    StyleService.ensure('mst-update-checker-style', MST_UPDATE_CHECKER_CSS);
    this.notifyListeners();
    // 启动后先检查一次，之后按间隔判断是否到期；状态只存内存，刷新页面重新检查。
    this.initialTimer = setTimeout(() => this.checkIfDue(), UPDATE_CHECK_INITIAL_DELAY_MS);
    this.timer = setInterval(() => this.checkIfDue(), UPDATE_CHECK_TICK_MS);
    LanguageEvents?.subscribe(() => this.refreshLanguage());
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[MST] 更新状态监听失败:', error);
      }
    });
  }

  // 远端版本高于当前构建（dev 后缀不参与比较）时才提示更新。
  hasUpdate() {
    return Boolean(this.latestVersion) && isNewerVersion(this.latestVersion, PACKAGE_VERSION);
  }

  getLatestVersion() {
    return this.latestVersion;
  }

  // 安装地址跟随检查成功的源；一次都没成功过时用官方直链兜底。
  getInstallUrl() {
    return this.installUrl || FALLBACK_INSTALL_URL;
  }

  // 打开脚本直链；固定 target 名，重复点击复用同一窗口不新开。
  openInstallUrl() {
    window.open(this.getInstallUrl(), 'mst-update-install');
  }

  // ---- 检查更新弹窗（工具箱菜单入口：没有新版本时打开） ----

  openDialog() {
    const {Notifier, TemplateRenderer, i18n} = this.ctx;
    this.dialogState = {status: 'loading'};
    return Notifier.html({
      title: i18n.t('checkUpdateTitle'),
      width: 'min(30rem, calc(100vw - 1rem))',
      popupClass: 'mst-update-checker-dialog',
      icon: 'news',
      html: () => TemplateRenderer.html`<div class="mst-update-checker-root" id="mst-update-checker-root"></div>`,
      didOpen: (popup) => {
        this.dialogRoot =
          popup?.querySelector('#mst-update-checker-root') || document.getElementById('mst-update-checker-root');
        this.renderDialog();
        this.runDialogCheck();
      },
      willClose: () => {
        // 关闭后丢弃在途结果，避免向已卸载的弹窗写状态。
        this.dialogRoot = null;
        this.dialogState = null;
        this.dialogToken += 1;
      }
    });
  }

  async runDialogCheck() {
    const token = ++this.dialogToken;
    this.dialogState = {status: 'loading'};
    this.renderDialog();
    const success = await this.check();
    if (token !== this.dialogToken || !this.dialogRoot?.isConnected) return;
    this.dialogState = {
      status: success ? (this.hasUpdate() ? 'update' : 'latest') : 'error',
      checkedAt: this.lastCheckedAt
    };
    this.renderDialog();
  }

  renderDialog() {
    const {TemplateRenderer} = this.ctx;
    if (!this.dialogRoot) return;
    TemplateRenderer.render(() => this.dialogTemplate(), this.dialogRoot);
  }

  // 语言切换时刷新入口提示与已打开的弹窗文案，保留当前结果不重新发起检查。
  refreshLanguage() {
    const {i18n} = this.ctx;
    this.notifyListeners();
    if (!this.dialogRoot?.isConnected) return;
    const title = this.dialogRoot.closest('.mst-update-checker-dialog')?.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('checkUpdateTitle');
    this.renderDialog();
  }

  dialogTemplate() {
    const {TemplateRenderer, i18n} = this.ctx;
    const state = this.dialogState || {status: 'loading'};
    if (state.status === 'loading') {
      return TemplateRenderer.html`<div class="mst-update-checker-status">${i18n.t('checkUpdateChecking')}</div>`;
    }
    const currentRow = TemplateRenderer.html`
  <div class="mst-update-checker-row"><span>${i18n.t('checkUpdateCurrent')}</span><span>v${PACKAGE_VERSION}</span></div>`;
    if (state.status === 'error') {
      return TemplateRenderer.html`
  <div class="mst-update-checker-status mst-update-checker-error">❌ ${i18n.t('checkUpdateFailed')}</div>
  <div class="mst-update-checker-rows">${currentRow}</div>
  <div class="mst-update-checker-hint">${i18n.t('checkUpdateFailedHint')}</div>
  ${this.renderDialogActions(state)}`;
    }
    const hasUpdate = state.status === 'update';
    return TemplateRenderer.html`
  <div class=${hasUpdate ? 'mst-update-checker-status mst-update-checker-update' : 'mst-update-checker-status mst-update-checker-latest'}>
    ${hasUpdate ? '🆕 ' + i18n.t('checkUpdateAvailable', this.latestVersion) : '✅ ' + i18n.t('checkUpdateLatest')}
  </div>
  <div class="mst-update-checker-rows">
    ${currentRow}
    ${
      this.latestVersion
        ? TemplateRenderer.html`<div class="mst-update-checker-row"><span>${i18n.t('checkUpdateRemote')}</span><span>v${this.latestVersion}</span></div>`
        : TemplateRenderer.empty
    }
  </div>
  ${this.renderDialogActions(state)}`;
  }

  // 有更新时给安装页链接（与菜单按钮跳转同一地址），其余情况给“重新检查”。
  renderDialogActions(state) {
    const {TemplateRenderer, i18n, utils} = this.ctx;
    const parts = [
      state.status === 'update'
        ? TemplateRenderer.html`<a
    class="mst-update-checker-link"
    href=${this.getInstallUrl()}
    target="_blank"
    rel="noopener noreferrer"
  >${i18n.t('checkUpdateInstall')}</a>`
        : TemplateRenderer.html`<button
    type="button"
    class="mst-update-checker-retry"
    @click=${() => this.runDialogCheck()}
  >${i18n.t('checkUpdateRetry')}</button>`
    ];
    if (state.checkedAt) {
      // 来源标签由命中的源自带，不按数组下标硬编码（顺序调整后下标会错位）。
      parts.push(TemplateRenderer.html`<div class="mst-update-checker-foot">
    ${i18n.t('checkUpdateCheckedAt')} ${utils.formatDateTime(new Date(state.checkedAt))} · ${i18n.t('checkUpdateSource')} ${i18n.t(this.sourceKey || 'checkUpdateSourceOfficial')}
  </div>`);
    }
    return parts;
  }

  checkIfDue() {
    if (this.checkPromise) return;
    if (this.lastCheckedAt && Date.now() - this.lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) return;
    this.check();
  }

  // 检查一次并返回是否拿到版本号；同一时刻只发一次请求，重复调用共用同一个结果。
  check() {
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.runCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  async runCheck() {
    const result = await fetchLatestVersion(UPDATE_CHECK_SOURCES, (url) => this.requestText(url));
    const success = Boolean(result.version);
    // 全部地址都不可用时保留上次结果，只记录本次检查时间，避免短时间内反复请求。
    if (success) {
      this.latestVersion = result.version;
      this.sourceKey = result.sourceKey;
      this.installUrl = result.installUrl;
    }
    this.lastCheckedAt = Date.now();
    this.notifyListeners();
    return success;
  }

  // 优先走 GM 请求（受头部 @connect 授权与脚本管理器代理保护）；
  // 管理器不可用或请求被拒绝（如本地调试壳未同步 @connect）时退回页面 fetch，
  // 代理地址带 CORS 允许跨域，官方地址能否成功取决于其自身响应头。
  async requestText(url) {
    const {GmApi} = this.ctx;
    const request = GmApi?.xmlHttpRequestApi?.();
    if (!request) return this.requestViaFetch(url);
    try {
      return await this.requestViaGm(request, url);
    } catch (error) {
      console.warn('[MST] GM 请求失败，改用页面请求:', url, error?.message || error);
    }
    return this.requestViaFetch(url);
  }

  requestViaGm(request, url) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      const handleResponse = (response) => {
        if (response.status && (response.status < 200 || response.status >= 300)) {
          finish(reject, new Error('HTTP ' + response.status));
          return;
        }
        finish(resolve, String(response.responseText || ''));
      };
      const result = request({
        method: 'GET',
        url,
        timeout: REQUEST_TIMEOUT_MS,
        onload: handleResponse,
        onerror: () => finish(reject, new Error('network error')),
        ontimeout: () => finish(reject, new Error('timeout'))
      });
      // 部分管理器返回 Promise 而不触发回调，两条路径只取先到的结果。
      if (result?.then) result.then(handleResponse).catch((error) => finish(reject, error));
    });
  }

  async requestViaFetch(url) {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.text();
  }
}
