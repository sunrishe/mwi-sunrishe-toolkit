'use strict';

// 检查更新回归：meta.js 的 @version 解析、版本比较口径、按顺序尝试镜像地址（第一个可用即停止，
// 后续地址不再请求）、后台定时检查与更新提示（入口红框 + 菜单首项“更新新版本”）的接线。
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const headerSourceFile = readSourceFile('userscript-header.txt');
const dataSourceFile = readSourceFile('src', 'common', 'data.js');
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const usageSource = readSourceFile('docs', 'usage.md');
const updateCheckerSource = readSourceFile('src', 'modules', 'update-checker', 'index.js');
const updateCheckerCss = readSourceFile('src', 'modules', 'update-checker', 'styles.css');

function loadMetaHelpers() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/update-checker/meta.js')}
      ({UPDATE_CHECK_SOURCES, FALLBACK_INSTALL_URL, parseMetaVersion, fetchLatestVersion});`,
    {console}
  );
}

function loadVersionHelpers() {
  return vm.runInNewContext(
    `${readVmSource('src/common/version.js')}
      ({compareVersions, getBaseVersion, isNewerVersion});`,
    {}
  );
}

// 装载 UpdateCheckerFeature：注入最小上下文与假的定时器/存储/窗口，返回实例与控制句柄。
function createUpdateChecker({packageVersion = '2.18.0', isGameSite = true} = {}) {
  const timers = [];
  const openedWindows = [];
  const listeners = [];
  const storageWrites = [];
  const Feature = vm.runInNewContext(
    `const MST_UPDATE_CHECKER_CSS = '';
     const PACKAGE_VERSION = ${JSON.stringify(packageVersion)};
     ${readVmSource('src/common/version.js', 'src/modules/update-checker/meta.js', 'src/modules/update-checker/index.js')}
     UpdateCheckerFeature;`,
    {
      console,
      setTimeout: (callback, delay) => {
        timers.push({type: 'timeout', callback, delay});
        return timers.length;
      },
      setInterval: (callback, delay) => {
        timers.push({type: 'interval', callback, delay});
        return timers.length;
      },
      window: {open: (...args) => openedWindows.push(args)},
      localStorage: {
        getItem: () => null,
        setItem: (key, value) =>
          storageWrites.push([
            key, String(value)
          ]),
        removeItem: () => {}
      },
      StyleService: {ensure: () => {}}
    }
  );
  const ctx = {
    CONFIG: {isGameSite},
    i18n: {languageKey: 'zh'},
    LanguageEvents: {subscribe: (listener) => listeners.push(listener)}
  };
  return {feature: new Feature(ctx), timers, openedWindows, listeners, storageWrites};
}

test('检查更新：解析 meta.js 头部里的 @version', () => {
  const {parseMetaVersion} = loadMetaHelpers();
  assert.equal(
    parseMetaVersion(
      '// ==UserScript==\n// @name               MWI Sunrishe Toolkit\n// @version            2.17.2\n// @author             sunrishe\n// ==/UserScript=='
    ),
    '2.17.2'
  );
  assert.equal(parseMetaVersion('// @version 1.2.3'), '1.2.3');
  assert.equal(parseMetaVersion('// @version'), '');
  assert.equal(parseMetaVersion('// @description @version 2.0.0'), '');
  assert.equal(parseMetaVersion(''), '');
});

test('检查更新：版本比较按数字段逐段比较，dev 后缀不参与', () => {
  const {compareVersions, getBaseVersion, isNewerVersion} = loadVersionHelpers();
  assert.equal(compareVersions('2.10.0', '2.9.3'), 1, '2.10.0 应大于 2.9.3');
  assert.equal(compareVersions('2.17.2', '2.17.2'), 0);
  assert.equal(compareVersions('2.9.0', '2.10.0'), -1);
  assert.equal(compareVersions('2.18.0-dev.20261001123456', '2.18.0'), 0, 'dev 后缀不参与比较');
  assert.equal(getBaseVersion('2.18.0-dev.20261001123456'), '2.18.0');
  assert.equal(isNewerVersion('2.19.0', '2.18.0'), true);
  assert.equal(isNewerVersion('2.17.2', '2.18.0-dev.20261001123456'), false);
});

// 测试用的源：每项自带 meta 与安装地址，与生产数据结构一致。
const SOURCE_A = {
  metaUrl: 'https://mirror-a/meta.js',
  sourceKey: 'checkUpdateSourceProxy',
  installUrl: 'https://mirror-a/user.js'
};
const SOURCE_B = {
  metaUrl: 'https://mirror-b/meta.js',
  sourceKey: 'checkUpdateSourceMirror',
  installUrl: 'https://mirror-b/user.js'
};

test('检查更新：源按顺序尝试，前一个不可用时才请求下一个，安装地址取命中源', async () => {
  const {fetchLatestVersion} = loadMetaHelpers();
  const calls = [];
  const result = await fetchLatestVersion(
    [
      SOURCE_A, SOURCE_B
    ],
    async (url) => {
      calls.push(url);
      if (url === SOURCE_A.metaUrl) throw new Error('network error');
      return '// @version 2.19.0';
    }
  );
  assert.deepEqual(calls, [
    SOURCE_A.metaUrl, SOURCE_B.metaUrl
  ]);
  assert.equal(result.version, '2.19.0');
  assert.equal(result.sourceIndex, 1);
  assert.equal(result.installUrl, SOURCE_B.installUrl, '第二个源命中时安装地址应取第二个源');
  assert.equal(result.sourceKey, SOURCE_B.sourceKey, '来源标签取命中源');
});

test('检查更新：第一个源可用即以其结果为准，后面的源不再请求', async () => {
  const {fetchLatestVersion} = loadMetaHelpers();
  const calls = [];
  const result = await fetchLatestVersion(
    [
      SOURCE_A, SOURCE_B
    ],
    async (url) => {
      calls.push(url);
      return '// @version 2.17.2';
    }
  );
  assert.deepEqual(
    calls,
    [
      SOURCE_A.metaUrl
    ],
    '第一个源可用时不应继续请求'
  );
  assert.equal(result.version, '2.17.2');
  assert.equal(result.sourceIndex, 0);
  assert.equal(result.installUrl, SOURCE_A.installUrl, '安装地址跟随命中的源');
  assert.equal(result.sourceKey, SOURCE_A.sourceKey, '来源标签跟随命中的源');
});

test('检查更新：源返回内容没有 @version 时继续下一个，全部不可用时返回空版本号', async () => {
  const {fetchLatestVersion} = loadMetaHelpers();
  const calls = [];
  const result = await fetchLatestVersion(
    [
      SOURCE_A, SOURCE_B
    ],
    async (url) => {
      calls.push(url);
      if (url === SOURCE_A.metaUrl) return '<html>proxy error</html>';
      throw new Error('timeout');
    }
  );
  assert.deepEqual(calls, [
    SOURCE_A.metaUrl, SOURCE_B.metaUrl
  ]);
  assert.equal(result.version, '');
  assert.equal(result.errors.length, 2);
});

test('检查更新：源顺序为官方 → 代理 → org.cn 镜像，每项自带安装直链', () => {
  const {UPDATE_CHECK_SOURCES, FALLBACK_INSTALL_URL} = loadMetaHelpers();
  assert.equal(UPDATE_CHECK_SOURCES.length, 3);
  const [
    officialSource, proxySource, mirrorSource
  ] = UPDATE_CHECK_SOURCES;
  assert.match(officialSource.metaUrl, /^https:\/\/update\.greasyfork\.org\/scripts\/574037\//);
  assert.match(
    proxySource.metaUrl,
    /^https:\/\/js\.nainai\.eu\.org\/proxy\/https:\/\/update\.greasyfork\.org\/scripts\/574037\//
  );
  assert.match(mirrorSource.metaUrl, /^https:\/\/update\.greasyfork\.org\.cn\/scripts\/574037\//);
  UPDATE_CHECK_SOURCES.forEach((source) => {
    assert.match(source.metaUrl, /574037/);
    assert.match(source.metaUrl, /\.meta\.js$/);
    // 安装地址由 meta 地址换后缀推导：谁检查成功就装谁的，避免“查得到装不上”。
    assert.equal(source.installUrl, source.metaUrl.replace(/\.meta\.js$/, '.user.js'));
    assert.match(source.installUrl, /\.user\.js$/);
  });
  assert.equal(officialSource.sourceKey, 'checkUpdateSourceOfficial');
  assert.equal(proxySource.sourceKey, 'checkUpdateSourceProxy');
  assert.equal(mirrorSource.sourceKey, 'checkUpdateSourceMirror');
  assert.match(officialSource.installUrl, /^https:\/\/update\.greasyfork\.org\//, '官方源装官方直链');
  assert.match(proxySource.installUrl, /^https:\/\/js\.nainai\.eu\.org\/proxy\//, '代理源装代理的直链');
  assert.match(mirrorSource.installUrl, /^https:\/\/update\.greasyfork\.org\.cn\//, '镜像源装镜像的直链');
  assert.equal(
    FALLBACK_INSTALL_URL,
    'https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.user.js',
    '一次都没检查成功时的兜底安装地址是官方直链'
  );
  // 顺序在源码里按数组下标遍历，追加镜像无需改循环。
  assert.match(updateCheckerSource, /fetchLatestVersion\(UPDATE_CHECK_SOURCES/);
});

test('检查更新：后台按间隔检查，非游戏站不建定时器', () => {
  const {feature, timers} = createUpdateChecker();
  feature.init();
  const initial = timers.find((timer) => timer.type === 'timeout');
  assert.equal(initial?.delay, 10000, '启动后应安排一次延迟检查');
  const tick = timers.find((timer) => timer.type === 'interval');
  assert.equal(tick?.delay, 30 * 60 * 1000, '应周期性判断检查是否到期');
  assert.match(updateCheckerSource, /UPDATE_CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(updateCheckerSource, /if \(!CONFIG\.isGameSite\) return;/);

  const offline = createUpdateChecker({isGameSite: false});
  offline.feature.init();
  assert.equal(offline.timers.length, 0, '非游戏站不应建立定时器');
});

test('检查更新：按间隔判断是否到期，未到期不重复检查', () => {
  const {feature} = createUpdateChecker();
  // 刚检查过：不到间隔不重复检查。
  let checks = 0;
  feature.check = () => {
    checks += 1;
  };
  feature.lastCheckedAt = Date.now();
  feature.checkIfDue();
  assert.equal(checks, 0);
  // 超过间隔：到期检查。
  feature.lastCheckedAt = Date.now() - 7 * 60 * 60 * 1000;
  feature.checkIfDue();
  assert.equal(checks, 1);
});

test('检查更新：判定新版本、状态只存内存、跳转脚本直链', async () => {
  const {feature, openedWindows, storageWrites} = createUpdateChecker();
  let notified = 0;
  feature.onChange(() => {
    notified += 1;
  });

  // 命中新版本：只读取第一个源（GreasyFork 官方），状态记在内存里。
  feature.requestText = async (url) => {
    assert.match(url, /^https:\/\/update\.greasyfork\.org\/scripts\/574037\//);
    return '// ==UserScript==\n// @version 2.19.0\n// ==/UserScript==';
  };
  await feature.check();
  assert.equal(feature.getLatestVersion(), '2.19.0');
  assert.equal(feature.hasUpdate(), true);
  assert.ok(feature.lastCheckedAt > 0);
  assert.equal(notified, 1, '检查完成后应通知监听方刷新界面');
  assert.deepEqual(storageWrites, [], '检查状态只存内存，不写入 localStorage');

  // 不持久化：新实例从空状态开始，页面刷新后重新检查。
  const refreshed = createUpdateChecker();
  assert.equal(refreshed.feature.getLatestVersion(), '');
  assert.equal(refreshed.feature.hasUpdate(), false);
  assert.equal(refreshed.feature.lastCheckedAt, 0);

  // 远端版本不高于当前构建时不提示更新。
  const upToDate = createUpdateChecker({packageVersion: '2.19.0'});
  upToDate.feature.requestText = async () => '// @version 2.19.0';
  await upToDate.feature.check();
  assert.equal(upToDate.feature.hasUpdate(), false);

  // 跳转脚本直链：跟随本次检查命中的源（这里命中第一个源=官方），固定 target 复用同一窗口。
  const matchedInstallUrl = 'https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.user.js';
  assert.equal(feature.getInstallUrl(), matchedInstallUrl, '谁检查成功就装谁的直链');
  feature.openInstallUrl();
  assert.deepEqual(openedWindows.at(-1), [
    matchedInstallUrl, 'mst-update-install'
  ]);
  feature.ctx.i18n.languageKey = 'en';
  feature.openInstallUrl();
  assert.deepEqual(openedWindows.at(-1), [
    matchedInstallUrl, 'mst-update-install'
  ]);
  // 一次都没检查成功过的实例用官方直链兜底。
  const fresh = createUpdateChecker();
  assert.equal(
    fresh.feature.getInstallUrl(),
    'https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.user.js'
  );

  // 全部地址不可用：保留上次结果，只更新检查时间，避免短时间内反复请求。
  feature.requestText = async () => {
    throw new Error('network error');
  };
  await feature.check();
  assert.equal(feature.getLatestVersion(), '2.19.0');
});

test('检查更新：工具箱入口红框与固定“检查更新”按钮', () => {
  // 入口按钮的红框、右上角小点与“更新新版本”按钮的渐变描边样式。
  assert.match(updateCheckerCss, /\.mst-my-character-card-btn\.mst-toolkit-update-available\s*\{/);
  assert.match(updateCheckerCss, /linear-gradient\(135deg,[^;]*border-box/);
  assert.match(updateCheckerCss, /\.mst-my-character-card-btn\.mst-toolkit-update-available::after\s*\{/);
  assert.match(updateCheckerCss, /\.mst-toolkit-action\.mst-toolkit-action-update\s*\{/);
  // 状态变化时刷新入口标记，下拉已打开时同步重渲染。
  assert.match(source, /button\.classList\.toggle\('mst-toolkit-update-available', hasUpdate\)/);
  assert.match(source, /this\.updateChecker\.onChange\(\(\) => this\.handleUpdateChange\(\)\)/);
  // 固定入口在“更新日志”下面，不再有随更新插入的独立动作。
  // 图标用游戏的“公告/更新消息”图标（40×40 彩色），不能再用 up_arrow 那种 15×20 黑色小箭头。
  assert.match(
    source,
    /\{\s*key: 'changelog',\s*icon: 'patch_notes'[\s\S]{0,120}\{\s*key: 'checkUpdate',\s*icon: 'news'/
  );
  assert.doesNotMatch(source, /icon: 'up_arrow'/);
  assert.doesNotMatch(updateCheckerSource, /icon: 'up_arrow'/);
  assert.doesNotMatch(source, /key: 'updateAvailable'/);
  // 有更新时文案变“更新新版本 vX”、描边高亮并直接打开安装页，否则打开检查更新弹窗。
  assert.match(source, /variant: hasUpdate \? 'update' : ''/);
  assert.match(
    source,
    /label: hasUpdate[\s\S]{0,160}i18n\.t\('toolkitUpdateAvailable', this\.updateChecker\.getLatestVersion\(\)\)[\s\S]{0,80}i18n\.t\('checkUpdate'\)/
  );
  assert.match(source, /variant === 'update' \? 'mst-toolkit-action mst-toolkit-action-update' : 'mst-toolkit-action'/);
  assert.match(
    source,
    /handler: \(\) =>\s*this\.updateChecker\.hasUpdate\(\) \? this\.updateChecker\.openInstallUrl\(\) : this\.updateChecker\.openDialog\(\)/
  );
});

test('检查更新：没有新版本时打开弹窗显示当前版本与重新检查', () => {
  assert.match(updateCheckerSource, /openDialog\(\)\s*\{[\s\S]*?Notifier\.html\(/);
  assert.match(updateCheckerSource, /popupClass: 'mst-update-checker-dialog'/);
  // 弹窗打开即检查，状态分加载 / 已是最新 / 发现新版本 / 失败四类。
  assert.match(updateCheckerSource, /runDialogCheck\(\)/);
  assert.match(updateCheckerSource, /status: success \? \(this\.hasUpdate\(\) \? 'update' : 'latest'\) : 'error'/);
  assert.match(updateCheckerSource, /checkUpdateCurrent/);
  assert.match(updateCheckerSource, /checkUpdateRemote/);
  assert.match(updateCheckerSource, /checkUpdateLatest/);
  assert.match(updateCheckerSource, /checkUpdateFailed/);
  // 已是最新与失败状态都给“重新检查”，发现新版本给安装页链接。
  assert.match(updateCheckerSource, /class="mst-update-checker-retry"[\s\S]{0,80}checkUpdateRetry/);
  assert.match(updateCheckerSource, /class="mst-update-checker-link"[\s\S]{0,120}checkUpdateInstall/);
  assert.match(updateCheckerSource, /refreshLanguage\(\)[\s\S]{0,400}renderDialog\(\)/);
  // 来源标签由命中的源自带，不按下标硬编码（顺序调整后下标会错位）。
  assert.match(updateCheckerSource, /i18n\.t\(this\.sourceKey \|\| 'checkUpdateSourceOfficial'\)/);
  assert.doesNotMatch(updateCheckerSource, /lastSourceIndex/);
  // 弹窗样式仍在模块样式文件里。
  assert.match(updateCheckerCss, /\.mst-update-checker-status\s*\{/);
  assert.match(updateCheckerCss, /\.mst-update-checker-retry\s*\{/);
  assert.match(messagesSourceFile, /checkUpdateTitle:/);
  assert.match(messagesSourceFile, /checkUpdateRetry:/);
});

test('检查更新：并发调用共用同一次请求', async () => {
  const {feature, storageWrites} = createUpdateChecker();
  let requests = 0;
  feature.requestText = async () => {
    requests += 1;
    return '// @version 2.19.0';
  };
  const [
    first, second
  ] = await Promise.all([
    feature.check(), feature.check()
  ]);
  assert.equal(requests, 1, '同一时刻只发一次请求');
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(feature.getLatestVersion(), '2.19.0');
  assert.deepEqual(storageWrites, []);
});

test('检查更新模块已接入模块装配、i18n 与头部权限', () => {
  assert.match(moduleIndexSourceFile, /UpdateCheckerFeature/);
  assert.match(appControllerSourceFile, /new UpdateCheckerFeature\(this\.ctx\)/);
  assert.match(appControllerSourceFile, /updateChecker\.init\(\)/);
  assert.match(appControllerSourceFile, /updateChecker\b/);
  // 检查更新状态只存内存：不注册存储键，也不读写 localStorage / GM 存储。
  assert.doesNotMatch(dataSourceFile, /MST_UPDATE_status/);
  assert.doesNotMatch(updateCheckerSource, /localStorage|STORAGE_KEYS|saveState|loadState/);
  assert.match(messagesSourceFile, /updateChecker:\s*UPDATE_CHECKER_MESSAGES/);
  assert.match(messagesSourceFile, /toolkitUpdateAvailable:/);
  assert.match(messagesSourceFile, /updateAvailableBadge:/);
  assert.match(messagesSourceFile, /checkUpdate:/);
  assert.match(headerSourceFile, /@connect\s+js\.nainai\.eu\.org/);
  assert.match(headerSourceFile, /@connect\s+update\.greasyfork\.org\.cn/);
  assert.match(headerSourceFile, /@connect\s+update\.greasyfork\.org\s*$/m);
  assert.match(usageSource, /## 检查更新/);
  assert.match(usageSource, /## Check for Updates/);
});
