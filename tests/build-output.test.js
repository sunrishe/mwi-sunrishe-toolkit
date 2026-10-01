// 构建产物回归：除单个 .user.js 外，构建还要输出同名不同后缀的 .meta.js（只含油猴头部），
// 供检查更新这类只读 @version 的场景下载，也保证“meta 地址换后缀得到安装地址”的推导成立。
// 这里直接调用构建插件的 generateBundle 拿实际要写出的文件，不只看配置文本。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
const configUrl = pathToFileURL(path.join(root, 'rollup.config.mjs')).href;
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const headerSource = fs.readFileSync(path.join(root, 'userscript-header.txt'), 'utf8');
const gitignoreSource = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

async function emitMetaFile(buildEnv, moduleSuffix) {
  process.env.MST_BUILD_ENV = buildEnv;
  const config = (await import(configUrl + moduleSuffix)).default;
  const plugin = config.plugins.find((item) => item.name === 'mst-userscript-header');
  const emitted = [];
  plugin.generateBundle.call({emitFile: (file) => emitted.push(file)});
  return emitted;
}

test('构建除脚本外只额外输出一个同名不同后缀的 meta 文件', async () => {
  const prodFiles = await emitMetaFile('production', '?prod');
  assert.equal(prodFiles.length, 1, '构建只额外输出一个 meta 文件');
  assert.equal(prodFiles[0].type, 'asset');
  assert.equal(prodFiles[0].fileName, 'mst.script.meta.js');
  assert.equal(prodFiles[0].fileName.replace(/\.meta\.js$/, '.user.js'), 'mst.script.user.js');

  const devFiles = await emitMetaFile('development', '?dev');
  assert.equal(devFiles[0].fileName, 'mst.script.dev.meta.js');
  assert.equal(devFiles[0].fileName.replace(/\.meta\.js$/, '.user.js'), 'mst.script.dev.user.js');
});

test('meta 内容就是脚本头部，版本与 package.json 一致且不含代码', async () => {
  const [
    metaFile
  ] = await emitMetaFile('production', '?content');
  const expected = `${headerSource.replace('__MST_VERSION__', packageManifest.version).trimEnd()}\n`;
  assert.equal(metaFile.source, expected, 'meta 头部必须与 userscript-header.txt 注入版本后一致');
  assert.match(metaFile.source, new RegExp(`^// @version\\s+${packageManifest.version.replace(/\./g, '\\.')}$`, 'm'));
  assert.match(metaFile.source, /^\/\/ ==UserScript==\n[\s\S]*\n\/\/ ==\/UserScript==\n$/);
  assert.doesNotMatch(metaFile.source, /__MST_VERSION__/);
});

test('dev meta 带开发版名称与时间戳版本，且不提交到仓库', async () => {
  const [
    devMetaFile
  ] = await emitMetaFile('development', '?dev-content');
  assert.match(devMetaFile.source, /^\/\/ @name\s+MWI Sunrishe Toolkit - Dev$/m);
  assert.match(
    devMetaFile.source,
    new RegExp(`^// @version\\s+${packageManifest.version.replace(/\./g, '\\.')}-dev\\.\\d{14}$`, 'm')
  );
  assert.match(gitignoreSource, /^dist\/\*\.dev\.meta\.js$/m);
  assert.doesNotMatch(gitignoreSource, /^dist\/\*\.meta\.js$/m);
});
