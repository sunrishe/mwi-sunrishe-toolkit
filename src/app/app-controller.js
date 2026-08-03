import {StyleService} from '../common/runtime.js';
import MST_APP_BASE_CSS from '../common/styles/app-base.css';
import MST_INTEGRATED_CSS from '../common/styles/integrated.css';
import MST_LANGUAGE_TOGGLE_CSS from '../common/styles/language-toggle.css';
import MST_SWAL_THEME_CSS from '../common/styles/swal-theme.css';
import {HouseCalculatorLauncher} from '../modules/house-calculator/index.js';

// app-styles
export function installAppStyles() {
  // 所有样式在构建期转成字符串，运行时只注入一次，避免重复覆盖游戏页面。
  const css = MST_APP_BASE_CSS + MST_LANGUAGE_TOGGLE_CSS + MST_SWAL_THEME_CSS + MST_INTEGRATED_CSS;
  StyleService.ensure('mst-integrated-style', css);
}

// language-controller
export class LanguageController {
  constructor(ctx, {getHouseCalculatorUI} = {}) {
    this.ctx = ctx;
    this.getHouseCalculatorUI = getHouseCalculatorUI || (() => null);
    this.isInitialized = false;
    this.bodyObserver = null;
    this.documentLanguageObserver = null;
    this.gameLanguageTimer = null;
  }

  updateToggleButton() {
    const {i18n} = this.ctx;
    const button = document.getElementById('mst-language-toggle');
    if (!button) return;
    const label = i18n.t('switchLanguage');
    button.textContent = label;
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  mountToggleButton() {
    const {CONFIG} = this.ctx;
    // 语言切换按钮只在游戏站点显示，Milkonomy 页面复用数据同步能力但不改其界面。
    if (
      !CONFIG.SHOW_LANGUAGE_TOGGLE ||
      !CONFIG.isGameSite ||
      !document.body ||
      document.getElementById('mst-language-toggle')
    )
      return;
    const button = document.createElement('button');
    button.id = 'mst-language-toggle';
    button.type = 'button';
    button.addEventListener('pointerdown', (event) => {
      if (document.querySelector('.mst-swal2-theme.swal2-container')) event.preventDefault();
    });
    button.addEventListener('click', () => this.toggleLanguage());
    document.body.appendChild(button);
    this.updateToggleButton();
  }

  toggleLanguage() {
    const {i18n} = this.ctx;
    const nextLang = i18n.alternateLanguage;
    // 游戏本身监听 i18nextLng；写入同一键可让工具箱和原站语言保持一致。
    localStorage.setItem('i18nextLng', nextLang);
    this.applyGameSetting(nextLang);
  }

  syncFromGameSetting(nextValue) {
    const {i18n} = this.ctx;
    const nextLang = i18n.normalizeLang(nextValue);
    if (i18n.languageKey === nextLang) return;
    const calculator = document.getElementById('mst-hccp-house-calculator');
    const houseCalculatorUI = this.getHouseCalculatorUI();
    if (calculator && houseCalculatorUI) {
      // 房屋弹窗保持当前输入状态，只替换语言相关 DOM。
      houseCalculatorUI.rerenderForLanguage(calculator, nextLang);
    } else {
      i18n.setLanguage(nextLang);
    }
    const triggerBtn = document.getElementById('mst-hccp-house-calculator-trigger');
    if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
  }

  applyGameSetting(nextValue) {
    const {LanguageEvents, i18n} = this.ctx;
    const previousLang = i18n.languageKey;
    this.syncFromGameSetting(nextValue);
    if (previousLang !== i18n.languageKey) {
      LanguageEvents.emit(i18n.languageKey);
    }
  }

  init() {
    const {CONFIG, LanguageEvents, i18n, utils} = this.ctx;
    if (this.isInitialized) return;
    this.isInitialized = true;
    window.addEventListener('storage', (event) => {
      if (event.key === 'i18nextLng') this.applyGameSetting(event.newValue);
    });
    window.addEventListener('MWILangChanged', () => {
      this.applyGameSetting(i18n.readPageLanguage());
    });
    this.documentLanguageObserver = new MutationObserver(() => {
      this.applyGameSetting(document.documentElement.lang);
    });
    // 原站有时只改 html lang，未触发 storage 事件，需要观察属性兜底。
    this.documentLanguageObserver.observe(document.documentElement, {attributes: true, attributeFilter: [
        'lang'
      ]});
    const syncCurrentGameLanguage = () => {
      this.applyGameSetting(i18n.readPageLanguage());
    };
    syncCurrentGameLanguage();
    this.gameLanguageTimer = setInterval(syncCurrentGameLanguage, 1000);
    if (CONFIG.SHOW_LANGUAGE_TOGGLE) {
      this.bodyObserver = utils.observeBody(() => this.mountToggleButton());
      LanguageEvents.subscribe(() => this.updateToggleButton());
    }
    window.addEventListener(
      'beforeunload',
      () => {
        this.bodyObserver?.disconnect();
        this.documentLanguageObserver?.disconnect();
        clearInterval(this.gameLanguageTimer);
      },
      {once: true}
    );
  }
}

// app-controller
export class AppController {
  constructor(ctx) {
    this.ctx = ctx;
    this.houseCalculatorLauncher = new HouseCalculatorLauncher();
    this.languageController = new LanguageController(ctx, {
      getHouseCalculatorUI: () => this.houseCalculatorLauncher.getHouseCalculatorUI()
    });
  }

  addTriggerButton() {
    this.houseCalculatorLauncher.addTriggerButton();
  }

  openCalculator(triggerBtn = null) {
    return this.houseCalculatorLauncher.openCalculator(triggerBtn);
  }

  observeDOM() {
    this.houseCalculatorLauncher.observeDOM();
  }

  init() {
    const {
      DataHub,
      CharacterDataService,
      WebSocketService,
      GameNavigationService,
      marketDataService,
      CharacterCardFeature,
      CombatUpgradeCalculatorFeature,
      AbilityUpgradeCalculatorFeature,
      DungeonProfitCalculatorFeature,
      CombatSimulationService,
      EquipmentComparisonService,
      EquipmentComparisonFeature,
      ToolkitMenuFeature,
      ClipboardCartImportFeature,
      Notifier
    } = this.ctx;
    installAppStyles();
    const characterCardFeature = new CharacterCardFeature();
    const combatCalculator = new CombatUpgradeCalculatorFeature(this.ctx);
    const abilityCalculator = new AbilityUpgradeCalculatorFeature(this.ctx, marketDataService);
    const dungeonCalculator = new DungeonProfitCalculatorFeature(marketDataService);
    const combatSimulationService = new CombatSimulationService(this.ctx);
    const equipmentComparisonService = new EquipmentComparisonService(marketDataService, combatSimulationService);
    const equipmentComparison = new EquipmentComparisonFeature(this.ctx, marketDataService, equipmentComparisonService);
    const toolkitMenu = new ToolkitMenuFeature(this.ctx, {
      characterCardFeature,
      appController: this,
      combatCalculator,
      abilityCalculator,
      equipmentComparison,
      dungeonCalculator
    });
    // 暴露少量实例给控制台排查，正式功能仍通过菜单入口触发。
    window.MWISunrisheToolkit = {
      DataHub,
      CharacterDataService,
      WebSocketService,
      GameNavigationService,
      combatCalculator,
      abilityCalculator,
      equipmentComparison,
      dungeonCalculator
    };
    characterCardFeature.init();
    combatCalculator.init();
    abilityCalculator.init();
    dungeonCalculator.init();
    equipmentComparison.init();
    toolkitMenu.init();
    new ClipboardCartImportFeature(this.ctx, Notifier).init();
    this.languageController.init();
    this.observeDOM();
  }
}

// bootstrap
export function installAppBootstrap(ctx) {
  const {CONFIG, TemplateRenderer, EdsMilkonomyFeature} = ctx;

  // Milkonomy 同步能力可在游戏站和外部利润站同时工作。
  if (CONFIG.isGameSite || CONFIG.isMilkonomySite) {
    new EdsMilkonomyFeature().init();
  }

  if (CONFIG.isGameSite) {
    TemplateRenderer.ready
      .then(() => new AppController(ctx).init())
      .catch((error) => console.error('[MST] uhtml @require 加载失败:', error));
  }
}

// runtime-instances
export function installRuntimeInstances(ctx) {
  const {CONFIG, MarketDataService, BuildScoreService, HouseCalculator, houseDetails} = ctx;
  // 非游戏站只安装可用的跨站功能，避免访问不存在的游戏数据结构。
  ctx.marketDataService = CONFIG.isGameSite ? new MarketDataService(ctx) : null;
  ctx.buildScoreService = CONFIG.isGameSite ? new BuildScoreService(ctx, ctx.marketDataService) : null;
  ctx.houseCalculator = CONFIG.isGameSite ? new HouseCalculator(ctx, houseDetails) : null;
  ctx.houseCalculatorUI = null;
}
