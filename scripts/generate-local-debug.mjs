import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const headerPath = path.join(rootDir, 'userscript-header.txt');
const devScriptPath = path.join(rootDir, 'dist', 'mst.script.dev.user.js');
const outputPath = path.join(rootDir, 'dist', 'MST-local-debug.user.js');
const devServerUrl = (process.env.MST_DEV_SERVER_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');

function formatTimestamp(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), pad(date.getHours()), pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

if (!fs.existsSync(devScriptPath)) {
  throw new Error('请先执行 yarn build:dev 或 yarn watch 生成 dist/mst.script.dev.user.js');
}

let header = fs.readFileSync(headerPath, 'utf8');
const version = formatTimestamp(fs.statSync(devScriptPath).mtime);
header = header
  .replace('MWI Sunrishe Toolkit', 'MST 本地调试')
  .replace('MWI Sunrishe 工具箱', 'MST 本地调试')
  .replace('__MST_VERSION__', `0.0.0-local.${version}`);

const devScriptUrl = `${devServerUrl}/mst.script.dev.user.js?v=${version}`;
const localRequireLine = `// @require            ${devScriptUrl}`;
const lastRequireMatch = [
  ...header.matchAll(/^\/\/ @require\s+.+$/gm)
].pop();

if (lastRequireMatch) {
  const insertAt = lastRequireMatch.index + lastRequireMatch[0].length;
  header = header.slice(0, insertAt) + `\n${localRequireLine}` + header.slice(insertAt);
} else {
  header = header.replace('// ==/UserScript==', `${localRequireLine}\n// ==/UserScript==`);
}

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${header.trimEnd()}\n`, 'utf8');

console.log(`已生成 ${path.relative(rootDir, outputPath)}`);
console.log(`请确保本地 HTTP 服务已启动：${devServerUrl}/`);
