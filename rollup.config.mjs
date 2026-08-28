import replace from '@rollup/plugin-replace';
import {transform} from 'esbuild';
import fs from 'node:fs';
import {formatDevVersionTimestamp} from './scripts/lib/version.mjs';

const buildEnv = process.env.MST_BUILD_ENV === 'production' ? 'production' : 'development';
const isDev = buildEnv !== 'production';
// 版本号统一计算一次：同时用作头部 @version、代码内日志与 MWISunrisheToolkitState 就绪字段，
// 保证自动化验证拿头部 @version 做期望值能与页面字段精确匹配（dev 带 -dev.<时间戳> 后缀）。
const injectedVersion = isDev
  ? `${JSON.parse(fs.readFileSync('package.json', 'utf8')).version}-dev.${formatDevVersionTimestamp()}`
  : JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

// 头部 @version 复用同一版本常量，避免与代码内注入值出现秒级时间戳差异。
function computeBanner() {
  const headerTemplate = fs.readFileSync('userscript-header.txt', 'utf8');
  return headerTemplate
    .replace('MWI Sunrishe Toolkit', isDev ? 'MWI Sunrishe Toolkit - Dev' : 'MWI Sunrishe Toolkit')
    .replace('MWI Sunrishe 工具箱', isDev ? 'MWI Sunrishe 工具箱 - 开发版' : 'MWI Sunrishe 工具箱')
    .replace('__MST_VERSION__', injectedVersion);
}
const STRING_ARRAY_MAX_LINE_LENGTH = 112;

function formatCssForBundle(css) {
  // 单文件脚本内联 CSS 时保留规则分行，便于排查生成产物。
  return css.replace(/}/g, '}\n').replace(/\n+/g, '\n').trim();
}

function toRawTemplateLiteral(value) {
  // CSS 作为模板字符串注入，必须转义模板占位符以免构建后被 JS 解释。
  return `String.raw\`${value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}

function isStringLiteralLine(line) {
  return /^(['"])(?:\\.|(?!\1)[^\\])*\1,?$/.test(line.trim());
}

function formatStringArrayBlock(source, maxLineLength = STRING_ARRAY_MAX_LINE_LENGTH) {
  const lines = source.split('\n');
  const valueLines = lines.slice(1, -1);
  if (!valueLines.length || !valueLines.every(isStringLiteralLine)) return source;

  // Rollup/Prettier 会把长字符串数组拆得过散，这里只合并纯字符串数组以控制产物体积。
  const valueIndent = valueLines[0].match(/^\s*/)?.[0] || '';
  const closingIndent = lines.at(-1).match(/^\s*/)?.[0] || '';
  const values = valueLines.map((line) => line.trim().replace(/,$/, ''));
  const rows = [];
  let row = valueIndent;

  values.forEach((value, index) => {
    const token = index < values.length - 1 ? `${value},` : value;
    const nextRow = row === valueIndent ? row + token : `${row} ${token}`;
    if (nextRow.length > maxLineLength && row !== valueIndent) {
      rows.push(row);
      row = valueIndent + token;
    } else {
      row = nextRow;
    }
  });
  if (row.trim()) rows.push(row);

  return `[\n${rows.join('\n')}\n${closingIndent}]`;
}

function formatCompactStringArrays(code) {
  return code.replace(/\[\n(?:[ \t]*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'),?\n)+[ \t]*\]/g, (source) =>
    formatStringArrayBlock(source)
  );
}

function rawCssPlugin() {
  return {
    name: 'mst-raw-css',
    async load(id) {
      if (!id.endsWith('.css')) return null;
      // CSS 不单独产物输出，统一压缩后作为字符串模块进入 userscript。
      const source = fs.readFileSync(id, 'utf8');
      const minified = (await transform(source, {loader: 'css', minify: true, legalComments: 'none'})).code.trim();
      const css = formatCssForBundle(minified);
      return `export default ${toRawTemplateLiteral(css)};`;
    }
  };
}

function compactStringArraysPlugin() {
  return {
    name: 'mst-compact-string-arrays',
    renderChunk(code) {
      return {code: formatCompactStringArrays(code), map: null};
    }
  };
}

function userscriptHeaderPlugin() {
  return {
    name: 'mst-userscript-header',
    renderChunk(code) {
      // 生产版头部直接贴入代码；开发版使用 output.banner，方便 watch 输出 dev 脚本。
      // 头部每次都实时计算，watch 重建时重新读取头部与版本文件。
      if (isDev) return null;
      return {code: `${computeBanner().trimEnd()}\n${code}`, map: null};
    }
  };
}

export default {
  input: 'src/index.js',
  output: {
    file: isDev ? 'dist/mst.script.dev.user.js' : 'dist/mst.script.user.js',
    format: 'iife',
    banner: isDev ? () => computeBanner() : ''
  },
  plugins: [
    rawCssPlugin(), replace({preventAssignment: true, values: {__MST_BUILD_ENV__: JSON.stringify(buildEnv), __MST_IS_DEV__: JSON.stringify(isDev), __MST_VERSION__: JSON.stringify(injectedVersion)}}), compactStringArraysPlugin(), userscriptHeaderPlugin()
  ],
  watch: {buildDelay: 100, clearScreen: false, include: [
      'src/**', 'userscript-header.txt', 'package.json', 'rollup.config.mjs'
    ], exclude: [
      'node_modules/**', 'dist/**'
    ]},
  onwarn(warning, warn) {
    if (warning.code === 'EMPTY_BUNDLE') return;
    warn(warning);
  }
};
