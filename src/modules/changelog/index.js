// 更新日志：在工具箱菜单里打开弹窗，按版本倒序列出所有版本的版本号、发布日期和更新说明。
// 数据与 docs/changelog.md 保持同步（测试校验），发布日期取自 GreasyFork 发布记录。
import {PACKAGE_VERSION} from '../../common/build-flags.js';
import {StyleService} from '../../common/runtime.js';
import {getBaseVersion} from '../../common/version.js';
import MST_CHANGELOG_CSS from './styles.css';
import {CHANGELOG_VERSIONS} from './versions.js';

export class ChangelogFeature {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null;
  }

  init() {
    const {LanguageEvents} = this.ctx;
    StyleService.ensure('mst-changelog-style', MST_CHANGELOG_CSS);
    LanguageEvents?.subscribe(() => this.refreshLanguage());
  }

  open() {
    const {Notifier, TemplateRenderer, i18n} = this.ctx;
    return Notifier.html({
      title: i18n.t('changelogTitle'),
      width: 'min(40rem, calc(100vw - 1rem))',
      popupClass: 'mst-changelog-dialog',
      icon: 'patch_notes',
      html: () => TemplateRenderer.html`<div class="mst-changelog-root" id="mst-changelog-root"></div>`,
      didOpen: (popup) => {
        this.root = popup?.querySelector('#mst-changelog-root') || document.getElementById('mst-changelog-root');
        this.render();
      },
      willClose: () => {
        this.root = null;
      }
    });
  }

  render() {
    const {TemplateRenderer} = this.ctx;
    if (!this.root) return;
    TemplateRenderer.render(() => this.template(), this.root);
  }

  // 语言切换时更新标题与列表文案，保持已打开弹窗的内容一致。
  refreshLanguage() {
    const {i18n} = this.ctx;
    if (!this.root?.isConnected) return;
    const title = this.root.closest('.mst-changelog-dialog')?.querySelector('.swal2-title');
    if (title) title.textContent = i18n.t('changelogTitle');
    this.render();
  }

  template() {
    const {TemplateRenderer, i18n} = this.ctx;
    const currentVersion = getBaseVersion(PACKAGE_VERSION);
    const legacyEntries = CHANGELOG_VERSIONS.filter((entry) => entry.legacy);
    const renderEntry = (entry) => TemplateRenderer.html`
  <section class="mst-changelog-entry">
    <div class="mst-changelog-entry-head">
      <span class="mst-changelog-version">v${entry.version}</span>
      ${entry.date ? TemplateRenderer.html`<span class="mst-changelog-date">${entry.date}</span>` : TemplateRenderer.empty}
      ${
        entry.version === currentVersion
          ? TemplateRenderer.html`<span class="mst-changelog-current">${i18n.t('changelogCurrent')}</span>`
          : TemplateRenderer.empty
      }
    </div>
    <ol class="mst-changelog-notes">
      ${entry.notes.map((note) => TemplateRenderer.html`<li>${i18n.pick(note)}</li>`)}
    </ol>
  </section>`;
    // uhtml 数组插值必须保持扁平：MST 版本、历史分组标题和历史版本展开进同一层数组。
    const nodes = [
      ...CHANGELOG_VERSIONS.filter((entry) => !entry.legacy).map(
        renderEntry
      ), legacyEntries.length ? TemplateRenderer.html`<div class="mst-changelog-group">${i18n.t('changelogLegacyGroup')}</div>` : null, ...legacyEntries.map(renderEntry)
    ].filter(Boolean);
    return TemplateRenderer.html`${nodes}`;
  }
}
