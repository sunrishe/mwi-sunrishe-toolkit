// 检查更新的数据源与解析：按顺序尝试各源，只读取 meta.js 头部里的 @version。
// 每一项都自带 meta 地址、来源标签与配套的安装地址——谁检查成功就用谁的安装地址，
// 因为网络不通时“查得到版本”和“装得上脚本”往往必须是同一条链路（代理站、镜像站各自可用）；
// 来源标签写在源上，弹窗按标签显示，不按下标硬编码（顺序调整后下标会错位）。
// 第一个返回合法版本号的源即作为本次结果，更靠后的源不再请求；
// 顺序即优先级：当前为 GreasyFork 官方 → js.nainai 代理 → org.cn 镜像；
// 以后新增镜像时在数组末尾按优先级追加一项即可，其余逻辑无需改动。
const META_SUFFIX = '.meta.js';
const SCRIPT_SUFFIX = '.user.js';

function createSource(metaUrl, sourceKey) {
  return {
    metaUrl,
    sourceKey,
    // 同一路径下 meta 与脚本只差后缀，安装地址由 meta 地址直接推导，避免两处各写一份写歪。
    installUrl: metaUrl.endsWith(META_SUFFIX) ? metaUrl.slice(0, -META_SUFFIX.length) + SCRIPT_SUFFIX : metaUrl
  };
}

export const UPDATE_CHECK_SOURCES = [
  createSource(
    'https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.meta.js',
    'checkUpdateSourceOfficial'
  ), createSource('https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.meta.js', 'checkUpdateSourceProxy'), createSource('https://update.greasyfork.org.cn/scripts/574037/MWI%20Sunrishe%20Toolkit.meta.js', 'checkUpdateSourceMirror')
];

// 一次检查都没有成功过时的兜底安装地址（官方直链）。
export const FALLBACK_INSTALL_URL = 'https://update.greasyfork.org/scripts/574037/MWI%20Sunrishe%20Toolkit.user.js';

// meta.js 里每行头部形如 `// @version            2.17.2`。
export function parseMetaVersion(text) {
  const match = String(text || '').match(/^\s*\/\/\s*@version\s+(\S+)\s*$/m);
  return match ? match[1].trim() : '';
}

// 按顺序请求各源：拿到合法版本号立即返回（带该源的安装地址与来源标签）；地址不可用或解析不到版本号才继续下一个。
export async function fetchLatestVersion(sources, requestText) {
  const errors = [];
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    try {
      const version = parseMetaVersion(await requestText(source.metaUrl));
      if (version) return {version, sourceIndex: index, sourceKey: source.sourceKey, installUrl: source.installUrl};
      errors.push(source.metaUrl + ': @version not found');
    } catch (error) {
      errors.push(source.metaUrl + ': ' + (error?.message || error));
    }
  }
  console.warn('[MST] 检查更新失败:', errors);
  return {version: '', errors};
}
