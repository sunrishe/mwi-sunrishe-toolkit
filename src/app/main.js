import {BUILD_FLAGS, PACKAGE_VERSION} from '../common/build-flags.js';
import {
  AUTO_CALC_DELAY,
  HOUSE_MAX_FROM_LEVEL,
  HOUSE_MAX_TO_LEVEL,
  HOUSE_MIN_FROM_LEVEL,
  MARKET_CACHE_TTL,
  PROFILE_CACHE_LIMIT,
  PROFILE_CACHE_MAX_BYTES,
  PROFILE_CACHE_TTL,
  TOAST_DURATION,
  TOAST_MAX_COUNT
} from '../common/constants.js';
import {installDataModule} from '../common/data.js';
import {createI18nService, createLanguageEvents} from '../common/i18n.js';
import {MarketDataService} from '../common/market.js';
import {I18N_MESSAGE_GROUPS} from '../common/messages.js';
import {createPageBridgeService, installRuntimeHelpers} from '../common/runtime.js';
import {installCommonUi, TemplateRenderer} from '../common/ui.js';
import {installModules} from '../modules/index.js';
import {installAppBootstrap, installRuntimeInstances} from './app-controller.js';

export function runMst() {
  // 加载成功日志：便于用户/自动化验证时确认脚本注入与构建版本（版本号由构建注入）。
  console.info(`[MST] 脚本加载 v${PACKAGE_VERSION}`);
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  // 就绪状态字段：初始化阶段逐步推进（loading → app-styles → app-features → 构建版本号），
  // 自动化验证轮询该字段精确判断脚本状态；脚本未加载时字段不存在。
  // 必须写入页面 window（unsafeWindow）：油猴沙箱的 window 与页面 window 是两个对象，
  // 写到沙箱 window 页面轮询不到，会误判脚本未加载。
  pageWindow.MWISunrisheToolkitState = 'loading';
  const hostname = window.location.hostname;
  // 通过二级域判断中英文游戏站，保证 www 与子域名都能复用同一套配置。
  const domainname = hostname.substring(hostname.lastIndexOf('.', hostname.lastIndexOf('.') - 1) + 1);
  // 游戏只有两个运行环境：正式服与测试服。milkywayidlecn.com 是正式服的中国官方镜像入口，
  // 与 milkywayidle.com 同属正式服（官方提供的两个入口，不是独立服务器），正式服与测试服
  // 的数据互不相通。环境判定只看 test. 前缀：hostname 以 test. 开头为测试服，其余游戏域名为正式服。
  // 市场数据源按当前入口域名自身读取：油猴头部 @match 已覆盖 www/裸域/test 三种格式的两个域名，
  // 任何入口页面都直接读取本站点的 game_data/marketplace.json，不跨域名混用。
  const marketUrl = `https://${hostname}/game_data/marketplace.json`;

  // CONFIG 只保存运行期环境和阈值，具体业务常量集中放在 common/constants.js。
  const CONFIG = {
    SHOW_LANGUAGE_TOGGLE: BUILD_FLAGS.showLanguageToggle,
    MARKET_CACHE_TTL,
    PROFILE_CACHE_TTL,
    PROFILE_CACHE_LIMIT,
    PROFILE_CACHE_MAX_BYTES,
    MARKET_URL: marketUrl,
    characterId: new URLSearchParams(window.location.search).get('characterId'),
    MIN_FROM_LEVEL: HOUSE_MIN_FROM_LEVEL,
    MAX_FROM_LEVEL: HOUSE_MAX_FROM_LEVEL,
    MAX_TO_LEVEL: HOUSE_MAX_TO_LEVEL,
    AUTO_CALC_DELAY,
    TOAST_MAX_COUNT,
    TOAST_DURATION,
    isGameSite: domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com',
    // 测试服（test.* 入口）数据与正式服不互通，战斗模拟导入等跨站同步在测试服一律停用。
    isTestServer: hostname.startsWith('test.'),
    isCombatSimSite: hostname === 'aiwwb.github.io',
    isMilkonomySite: hostname === 'milkonomy.pages.dev' || hostname === 'hyhfish.github.io'
  };

  if (CONFIG.isGameSite) TemplateRenderer.init();

  // i18n 先建立索引再读偏好，后续模块只依赖统一的 ctx.i18n。
  const i18n = createI18nService({CONFIG, messageGroups: I18N_MESSAGE_GROUPS});
  i18n.buildMessageIndex();
  i18n.loadLangPref();

  const ctx = {
    CONFIG,
    LanguageEvents: createLanguageEvents(),
    TemplateRenderer,
    domainname,
    hostname,
    i18n,
    pageWindow
  };
  ctx.PageBridgeService = createPageBridgeService(ctx);

  installDataModule(ctx);
  installRuntimeHelpers(ctx);
  ctx.MarketDataService = MarketDataService;
  // 安装顺序按依赖递进：公共能力 -> 模块注册 -> 运行时实例 -> 页面启动。
  installCommonUi(ctx);
  installModules(ctx);
  installRuntimeInstances(ctx);
  installAppBootstrap(ctx);
}
