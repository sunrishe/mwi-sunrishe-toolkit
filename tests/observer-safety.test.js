const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const rollupPath = path.join(__dirname, '..', 'rollup.config.mjs');
const styleServicePath = path.join(__dirname, '..', 'src', 'common', 'runtime.js');
const appBaseCssPath = path.join(__dirname, '..', 'src', 'common', 'styles', 'app-base.css');
const characterCardCssPath = path.join(__dirname, '..', 'src', 'modules', 'character-card', 'styles.css');
const houseCalculatorCssPath = path.join(__dirname, '..', 'src', 'modules', 'house-calculator', 'styles.css');
const integratedCssPath = path.join(__dirname, '..', 'src', 'common', 'styles', 'integrated.css');
const languageToggleCssPath = path.join(__dirname, '..', 'src', 'common', 'styles', 'language-toggle.css');
const swalThemeCssPath = path.join(__dirname, '..', 'src', 'common', 'styles', 'swal-theme.css');
const source = readRuntimeSource();
const rollupSource = fs.readFileSync(rollupPath, 'utf8');
const styleServiceSource = fs.readFileSync(styleServicePath, 'utf8');
const appBaseCss = fs.readFileSync(appBaseCssPath, 'utf8');
const characterCardCss = fs.readFileSync(characterCardCssPath, 'utf8');
const houseCalculatorCss = fs.readFileSync(houseCalculatorCssPath, 'utf8');
const integratedCss = fs.readFileSync(integratedCssPath, 'utf8');
const languageToggleCss = fs.readFileSync(languageToggleCssPath, 'utf8');
const swalThemeCss = fs.readFileSync(swalThemeCssPath, 'utf8');
const packageManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const integratedStyleSource = appBaseCss + integratedCss;

function loadStyleService(document) {
  const moduleSource = styleServiceSource
    .slice(0, styleServiceSource.indexOf('// game-ui-adapter'))
    .replace(/^export const StyleService = /m, 'const StyleService = ');
  return Function('document', `${moduleSource}\nreturn StyleService;`)(document);
}

function createStyleHarness(hasHead = true) {
  const elements = new Map();
  const listeners = new Map();
  const document = {
    head: null,
    createElement(tagName) {
      return {tagName: String(tagName).toUpperCase(), id: '', textContent: ''};
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    }
  };
  const head = {
    children: [],
    appendChild(element) {
      this.children.push(element);
      if (element.id) elements.set(element.id, element);
      return element;
    }
  };
  if (hasHead) document.head = head;
  return {document, head, listeners};
}

function loadDomObserverService(document, MutationObserver, window, SpriteService) {
  return Function(
    'document',
    'MutationObserver',
    'window',
    'SpriteService',
    'setTimeout',
    `${readVmSource('src/common/runtime.js')}\nreturn createDomObserverService(SpriteService);`
  )(document, MutationObserver, window, SpriteService, setTimeout);
}

function createObserverHarness() {
  const document = {body: {}, addEventListener() {}, removeEventListener() {}};

  class FakeMutationObserver {
    static current = null;
    static instances = [];

    constructor(callback) {
      this.callback = callback;
      this.observing = false;
      this.observeCount = 0;
      this.disconnectCount = 0;
      FakeMutationObserver.current = this;
      FakeMutationObserver.instances.push(this);
    }

    observe() {
      this.observing = true;
      this.observeCount += 1;
    }

    disconnect() {
      this.observing = false;
      this.disconnectCount += 1;
    }

    emit() {
      if (this.observing) this.callback([]);
    }
  }

  return {document, FakeMutationObserver};
}

test('公共样式服务按 ID 去重并支持 document-start 延迟挂载', () => {
  const immediate = createStyleHarness();
  const immediateService = loadStyleService(immediate.document);
  const first = immediateService.ensure('mst-test-style', '.first{}');
  const second = immediateService.ensure('mst-test-style', '.second{}');
  assert.equal(first, second);
  assert.equal(immediate.head.children.length, 1);
  assert.equal(first.textContent, '.first{}');

  const delayed = createStyleHarness(false);
  const delayedService = loadStyleService(delayed.document);
  const pendingFirst = delayedService.ensure('mst-delayed-style', '.delayed{}');
  const pendingSecond = delayedService.ensure('mst-delayed-style', '.ignored{}');
  assert.equal(pendingFirst, pendingSecond);
  assert.equal(delayed.head.children.length, 0);
  delayed.document.head = delayed.head;
  delayed.listeners.get('DOMContentLoaded')();
  assert.equal(delayed.head.children.length, 1);
  assert.equal(delayed.document.getElementById('mst-delayed-style'), pendingFirst);
});

test('各功能样式统一通过 StyleService 注入', () => {
  assert.match(source, /import \{\s*StyleService\s*\} from ['"].*common\/runtime\.js['"];/);
  assert.match(source, /import MST_CHARACTER_CARD_CSS from ['"]\.\/styles\.css['"];/);
  assert.match(styleServiceSource, /export const StyleService = \{/);
  assert.match(source, /StyleService\.ensure\('mst-hccp-style',/);
  assert.match(source, /StyleService\.ensure\('mst-character-card-style', MST_CHARACTER_CARD_CSS\)/);
  assert.match(characterCardCss, /var\(--mst-card-desktop-width\)/);
  assert.match(source, /StyleService\.ensure\('mst-integrated-style',/);
  assert.doesNotMatch(source, /document\.head\.appendChild\(style\)/);
  assert.doesNotMatch(source, /GM_addStyle\(css\)/);
});

test('综合样式不保留旧版技能面板和冲突的等级控件布局', () => {
  const targetLevelRules = integratedStyleSource.match(/^\s*\.mst-target-level-control\s*\{/gm) || [];
  assert.equal(targetLevelRules.length, 1);
  assert.doesNotMatch(integratedStyleSource, /\.mst-target-level-control\s*\{\s*display:\s*grid/);

  [
    'mst-ability-picker-button', 'mst-ability-info-grid', 'mst-ability-level-controls', 'mst-ability-overview', 'mst-ability-workspace',
    'mst-ability-results'
  ].forEach((className) => {
    assert.doesNotMatch(integratedStyleSource, new RegExp(`\\.${className}(?![\\w-])`));
  });
});

test('等级组合输入在主流浏览器隐藏原生数字加减箭头', () => {
  assert.match(
    integratedCss,
    /\.mst-combat-upgrade-calculator \.mst-target-level-control input\s*\{[^}]*-moz-appearance:\s*textfield[^}]*appearance:\s*textfield/s
  );
  assert.match(
    integratedCss,
    /\.mst-ability-table \.mst-target-level-control input\s*\{[^}]*-moz-appearance:\s*textfield[^}]*appearance:\s*textfield/s
  );
  assert.match(
    integratedCss,
    /\.mst-target-level-control input::\-webkit-inner-spin-button,\s*\.mst-target-level-control input::\-webkit-outer-spin-button\s*\{[^}]*-webkit-appearance:\s*none/s
  );
  assert.match(
    integratedCss,
    /\.mst-combat-upgrade-calculator \.mst-calculator-toolbar input\[type='number'\][\s\S]*?input\[data-row-field='hourlyExperienceOverride'\]\s*\{[^}]*-moz-appearance:\s*textfield[^}]*appearance:\s*textfield/s
  );
});

test('动态弹窗和工具箱菜单按实际视口约束位置', () => {
  assert.match(source, /new ResizeObserver\(\(\) => \{\s*clampPosition\(true\);/);
  assert.match(source, /popup\._mstClampPosition = \(\) => clampPosition\(true\)/);
  assert.match(source, /feature\.popup\?\._mstClampPosition\?\.\(\)/);
  assert.match(source, /document\.body\.appendChild\(dropdown\)/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize', positionDropdown\)/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\('scroll', positionDropdown\)/);
  assert.match(integratedCss, /#mst-toolkit-character-dropdown\s*\{[^}]*position:\s*fixed/s);
  // 技能选择浮层改为弹窗内容区内覆盖（对齐装备提升选择装备），不再全屏固定遮挡弹窗边框。
  assert.match(integratedCss, /\.mst-ability-picker\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(
    integratedCss,
    /\.mst-ability-picker-panel\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*min-height:\s*0/s
  );
  assert.match(
    integratedCss,
    /\.mst-ability-upgrade-calculator\.mst-ability-picker-open\s*\{[^}]*min-height:\s*min\(36rem, calc\(100vh - 10rem\)\)/s
  );
});

test('技能升级为纵向滚动条预留宽度，装备提升按内容收紧弹窗和列宽', () => {
  assert.match(source, /width: 'min\(51rem, calc\(100vw - 1rem\)\)'/);
  assert.match(integratedCss, /\.mst-ability-table\s*\{[^}]*min-width:\s*48\.5rem/s);
  assert.match(integratedCss, /\.mst-ability-table th:nth-child\(1\)\s*\{[^}]*width:\s*6\.5rem/s);
  assert.match(integratedCss, /\.mst-ability-table th:nth-child\(9\)\s*\{[^}]*width:\s*5rem/s);
  assert.match(source, /width: 'min\(34\.5rem, calc\(100vw - 1rem\)\)'/);
  assert.match(integratedCss, /\.mst-equipment-compare-table\s*\{[^}]*min-width:\s*32\.5rem/s);
  assert.match(integratedCss, /\.mst-equipment-compare-table thead th:nth-child\(3\)\s*\{[^}]*width:\s*30\.75%/s);
});

test('开发专用语言切换样式通过 raw CSS 构建插件注入', () => {
  assert.match(rollupSource, /function rawCssPlugin\(\)/);
  assert.match(rollupSource, /name: 'mst-raw-css'/);
  assert.match(source, /import MST_APP_BASE_CSS from ['"]\.\.\/common\/styles\/app-base\.css['"];/);
  assert.match(source, /import MST_HOUSE_CALCULATOR_CSS from ['"]\.\/styles\.css['"];/);
  assert.match(source, /import MST_INTEGRATED_CSS from ['"]\.\.\/common\/styles\/integrated\.css['"];/);
  assert.match(source, /import MST_LANGUAGE_TOGGLE_CSS from ['"]\.\.\/common\/styles\/language-toggle\.css['"];/);
  assert.match(source, /import MST_SWAL_THEME_CSS from ['"]\.\.\/common\/styles\/swal-theme\.css['"];/);
  assert.match(source, /MST_APP_BASE_CSS \+ MST_LANGUAGE_TOGGLE_CSS \+ MST_SWAL_THEME_CSS \+ MST_INTEGRATED_CSS/);
  assert.match(appBaseCss, /\.mst-eds-profit-menu/);
  assert.match(houseCalculatorCss, /#mst-hccp-house-calculator/);
  assert.match(integratedCss, /#mst-toolkit-character-dropdown/);
  assert.match(languageToggleCss, /#mst-language-toggle/);
  assert.match(swalThemeCss, /\.mst-swal2-theme/);
  assert.doesNotMatch(source, /#mst-language-toggle\{position:fixed/);
  assert.doesNotMatch(source, /#mst-hccp-modal\s*\{/);
  assert.doesNotMatch(source, /\.mst-swal2-theme\{--swal2-backdrop/);
  assert.doesNotMatch(source, /#mst-toolkit-character-dropdown\s*\{/);
});

test('普通弹窗层级低于 MWITools 购物车按钮层，Toast 保持最高', () => {
  // 层级统一由 app-base.css 的 :root 变量声明，MWITools 更新后需在此核对购物车按钮层级。
  const popupLayer = Number(/--mst-z-popup\s*:\s*(\d+)/.exec(appBaseCss)?.[1]);
  const toastLayer = Number(/--mst-z-toast\s*:\s*(\d+)/.exec(appBaseCss)?.[1]);
  assert.ok(Number.isFinite(popupLayer), 'app-base.css 必须声明 --mst-z-popup');
  assert.ok(Number.isFinite(toastLayer), 'app-base.css 必须声明 --mst-z-toast');
  // 游戏原生 UI 最高只用 z-index 9；MWITools 购物车把手/抽屉为 1001/1002。
  assert.ok(popupLayer > 9, '普通弹窗层级必须高于游戏原生 UI');
  assert.ok(popupLayer < 1001, '普通弹窗层级必须低于 MWITools 购物车按钮层（1001/1002）');
  assert.ok(toastLayer > popupLayer, 'Toast 不受购物车按钮层限制，层级应高于普通弹窗');
  assert.match(swalThemeCss, /\.mst-swal2-theme\s*\{[^}]*z-index:\s*var\(--mst-z-popup\)\s*!important/s);
  assert.match(swalThemeCss, /\.mst-swal-toast-host\s*\{[^}]*z-index:\s*var\(--mst-z-toast\)\s*!important/s);
  assert.match(characterCardCss, /\.mst-skill-selector-modal\s*\{[^}]*z-index:\s*var\(--mst-z-popup\)/s);
});

test('构建脚本执行源码修复且完整检查避免重复修复', () => {
  const scripts = packageManifest.scripts;
  assert.equal(scripts['build:prepare'], 'yarn lint:fix && yarn format');
  assert.equal(scripts.build, 'yarn build:prepare && yarn build:prod');
  assert.equal(scripts['build:dev'], 'cross-env MST_BUILD_ENV=development rollup -c rollup.config.mjs');
  assert.equal(scripts.check, 'yarn build:prepare && yarn test && yarn build:dev && yarn build:prod');
  assert.doesNotMatch(scripts['build:dev'], /lint:fix|format/);
  assert.doesNotMatch(scripts.check, /yarn build(?:\s|$)/);
  assert.match(scripts['build:prod'], /MST_BUILD_ENV=production/);
  assert.match(scripts['build:dev'], /MST_BUILD_ENV=development/);
});

test('正式构建保留 JS 可读输出，并继续压缩内嵌 CSS', () => {
  assert.match(rollupSource, /import \{\s*transform\s*\} from 'esbuild';/);
  assert.doesNotMatch(rollupSource, /minifyWhitespace/);
  assert.doesNotMatch(rollupSource, /minifySyntax/);
  assert.doesNotMatch(rollupSource, /minifyIdentifiers/);
  assert.doesNotMatch(rollupSource, /readableCompactPlugin/);
  assert.match(rollupSource, /const source = fs\.readFileSync\(id, 'utf8'\);/);
  assert.match(rollupSource, /loader: 'css', minify: true, legalComments: 'none'/);
  assert.match(rollupSource, /function formatCssForBundle\(css\)/);
  assert.match(rollupSource, /function toRawTemplateLiteral\(value\)/);
  assert.match(rollupSource, /const STRING_ARRAY_MAX_LINE_LENGTH = 112;/);
  assert.match(rollupSource, /function formatCompactStringArrays\(code\)/);
  assert.match(rollupSource, /\(source\) =>\s*formatStringArrayBlock\(source\)/);
  assert.match(rollupSource, /compactStringArraysPlugin\(\)/);
  assert.match(rollupSource, /return `export default \$\{toRawTemplateLiteral\(css\)\};`;/);
  assert.match(rollupSource, /banner: isDev \? \(\) => computeBanner\(\) : ''/);
  assert.match(rollupSource, /code: `\$\{computeBanner\(\)\.trimEnd\(\)\}\\n\$\{code\}`/);
});

test('全局 DOM 观察按帧合并，并在执行订阅回调时暂停监听', () => {
  const {document, FakeMutationObserver} = createObserverHarness();
  const frames = [];
  const window = {requestAnimationFrame: (callback) => frames.push(callback)};
  const SpriteService = {markDomChanged() {}};
  const service = loadDomObserverService(document, FakeMutationObserver, window, SpriteService);
  let callbackCount = 0;
  let callbackRanWhileObserving = false;

  const controller = service.subscribe(() => {
    callbackCount += 1;
    const observer = FakeMutationObserver.current;
    if (!observer) return;
    callbackRanWhileObserving ||= observer.observing;
    // 模拟回调插入按钮所产生的 DOM 变更。
    observer.emit();
  });

  const observer = FakeMutationObserver.current;
  assert.equal(callbackCount, 1);
  observer.emit();
  observer.emit();
  assert.equal(frames.length, 1);
  assert.equal(callbackCount, 1);
  frames.shift()();
  assert.equal(callbackCount, 2);
  assert.equal(callbackRanWhileObserving, false);
  assert.equal(observer.observing, true);
  assert.equal(observer.observeCount, 2);

  controller.disconnect();
  observer.emit();
  assert.equal(callbackCount, 2);
  assert.equal(observer.observing, false);
});

test('多个功能共用同一个全局 MutationObserver', () => {
  const {document, FakeMutationObserver} = createObserverHarness();
  const frames = [];
  const service = loadDomObserverService(
    document,
    FakeMutationObserver,
    {requestAnimationFrame: (callback) => frames.push(callback)},
    {markDomChanged() {}}
  );
  let firstCount = 0;
  let secondCount = 0;
  const first = service.subscribe(() => firstCount++);
  const second = service.subscribe(() => secondCount++);

  assert.equal(FakeMutationObserver.instances.length, 1);
  FakeMutationObserver.current.emit();
  frames.shift()();
  assert.equal(firstCount, 2);
  assert.equal(secondCount, 2);

  first.disconnect();
  second.disconnect();
});

test('名片入口复用公共观察器，不再创建独立的全页面观察器', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');

  assert.match(cardSource, /this\.state\.observer = this\.utils\.observeBody\(/);
  assert.match(cardSource, /this\.state\.partyObserver = this\.utils\.observeBody\(checkParty\)/);
  assert.doesNotMatch(cardSource, /new MutationObserver/);
});

test('市场伴侣剪贴板导入只按 MST 按钮自身去重', () => {
  const uiSource = readSourceFile('src', 'common', 'ui.js');
  const start = uiSource.search(/^\s*(?:export\s+)?class ClipboardCartImportFeature/m);
  assert.ok(start >= 0, '找不到剪贴板导入功能');
  const endOffset = uiSource.slice(start).search(/^\s*\/\/ swal-class-names/m);
  assert.ok(endOffset > 0, '找不到剪贴板导入功能结束位置');
  const featureSource = uiSource.slice(start, start + endOffset);

  assert.match(featureSource, /querySelectorAll\('#mst-mmm-import-clipboard'\)/);
  assert.doesNotMatch(featureSource, /data-act=["']importclip/);
  // 导入剪贴板按钮默认无边框，鼠标悬浮时才显示边框色，避免与 MWITools 面板按钮观感不一致。
  assert.match(featureSource, /border:\s*1px solid transparent/);
  assert.doesNotMatch(featureSource, /rgba\(231,231,231,0\.18\);/);
  assert.match(featureSource, /button\.style\.borderColor\s*=\s*'rgba\(231,231,231,0\.18\)'/);
  assert.match(featureSource, /button\.style\.borderColor\s*=\s*'transparent'/);
  // 导入剪贴板按钮只在购物车清单页展示，其他标签页（项目/设置）不展示。
  assert.match(featureSource, /\.tab\[data-active="true"\]/);
  assert.match(featureSource, /activeTab\s*!==\s*'cart'/);
  assert.match(featureSource, /querySelectorAll\('#mst-mmm-import-clipboard'\)\.forEach/);
});

test('市场技能书悬浮菜单注入技能升级计算器入口且复用公共观察器', () => {
  const abilitySource = readSourceFile('src', 'modules', 'ability-upgrade', 'index.js');

  assert.match(abilitySource, /mountMarketDetailButton/);
  assert.match(abilitySource, /MuiTooltip-popper/);
  assert.match(abilitySource, /popperInteractive/);
  assert.match(abilitySource, /Item_actionMenu/);
  assert.match(abilitySource, /actionMenu\.appendChild\(button\)/);
  assert.match(abilitySource, /mst-ability-tooltip-calculator/);
  assert.match(abilitySource, /abilityBookDetail/);
  assert.match(abilitySource, /feature\.open\(book\.abilityHrid\)/);
  assert.match(abilitySource, /this\.mountMarketDetailButton\(feature\);/);
  assert.doesNotMatch(abilitySource, /new MutationObserver/);
});
