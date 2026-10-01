'use strict';

// 更新日志回归：数据必须与 docs/changelog.md 逐条一致（版本、发布日期、中文说明），
// 条目按版本倒序并包含当前版本，且已接入工具箱菜单与统一文案。
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const changelogDocSource = readSourceFile('docs', 'changelog.md');
const packageManifest = JSON.parse(readSourceFile('package.json'));
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const usageSource = readSourceFile('docs', 'usage.md');

function loadChangelogVersions() {
  const versions = vm.runInNewContext(
    `${readVmSource('src/modules/changelog/versions.js')}
      CHANGELOG_VERSIONS;`,
    {}
  );
  // VM 产物来自另一个 realm，比较前归一化为普通对象。
  return JSON.parse(JSON.stringify(versions));
}

function loadVersionHelpers() {
  return vm.runInNewContext(
    `${readVmSource('src/common/version.js')}
      ({compareVersions, getBaseVersion, isNewerVersion});`,
    {}
  );
}

// 解析 docs/changelog.md：二/三级版本标题（日期可选）+ 编号列表条目。
function parseDocEntries() {
  const entries = [];
  let current = null;
  for (const line of changelogDocSource.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3} v(\d+\.\d+\.\d+)(?:\s*[（(](\d{4}-\d{2}-\d{2})[）)])?\s*$/);
    if (heading) {
      current = {version: heading[1], date: heading[2] || '', notes: []};
      entries.push(current);
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      current = null;
      continue;
    }
    const item = line.match(/^\d+\.\s+(.*)$/);
    if (item && current) current.notes.push(item[1].trim());
  }
  return entries;
}

const docEntries = parseDocEntries();
const dataEntries = loadChangelogVersions();

test('更新日志数据与 docs/changelog.md 的版本、日期和说明逐条一致', () => {
  assert.equal(dataEntries.length, docEntries.length, '版本条数应与更新日志一致');
  docEntries.forEach((doc, index) => {
    const entry = dataEntries[index];
    assert.equal(entry.version, doc.version, `第 ${index + 1} 条版本号不一致`);
    assert.equal(entry.date, doc.date, `${doc.version} 发布日期不一致`);
    assert.deepEqual(
      entry.notes.map((note) => note.zh),
      doc.notes,
      `${doc.version} 更新说明不一致`
    );
  });
});

test('更新日志每个条目都有中英文说明，历史版本标记只用于 EDS 线', () => {
  dataEntries.forEach((entry) => {
    assert.ok(entry.notes.length > 0, `${entry.version} 缺少更新说明`);
    entry.notes.forEach((note) => {
      assert.ok(note.zh && note.zh.trim(), `${entry.version} 缺少中文说明`);
      assert.ok(note.en && note.en.trim(), `${entry.version} 缺少英文说明`);
    });
    if (entry.legacy) assert.match(entry.version, /^1\./, '历史版本标记只用于 1.x');
    else assert.match(entry.version, /^2\./, 'MST 版本应为 2.x');
  });
});

test('更新日志按版本倒序排列且包含当前版本', () => {
  const {compareVersions} = loadVersionHelpers();
  for (let index = 1; index < dataEntries.length; index++) {
    assert.equal(
      compareVersions(dataEntries[index - 1].version, dataEntries[index].version),
      1,
      `版本应严格倒序：${dataEntries[index - 1].version} / ${dataEntries[index].version}`
    );
  }
  assert.ok(
    dataEntries.some((entry) => entry.version === packageManifest.version),
    `应包含当前版本 ${packageManifest.version}`
  );
});

test('更新日志弹窗标题行与其它弹窗一致：带图标的标题自动 flex 居中', () => {
  const integratedCss = readSourceFile('src', 'common', 'styles', 'integrated.css');
  // 共享规则按“标题里是否含图标”判断，新增弹窗（如更新日志）无需再登记弹窗类名。
  assert.match(
    integratedCss,
    /\.mst-swal2-theme \.swal2-title:has\(\.mst-dialog-title-icon\)\s*\{[^}]*display:\s*flex/
  );
  assert.match(integratedCss, /\.mst-dialog-title-icon\s*\{[^}]*align-self:\s*center/);
  assert.match(source, /icon: 'patch_notes'/);
  assert.match(source, /popupClass: 'mst-changelog-dialog'/);
});

test('更新日志模块已接入工具箱菜单与统一文案', () => {
  assert.match(moduleIndexSourceFile, /ChangelogFeature/);
  assert.match(appControllerSourceFile, /new ChangelogFeature\(this\.ctx\)/);
  assert.match(appControllerSourceFile, /changelog\.init\(\)/);
  assert.match(source, /\{\s*key: 'changelog',\s*icon: 'patch_notes'/);
  assert.match(source, /mst-changelog-group/);
  assert.match(messagesSourceFile, /changelog:\s*CHANGELOG_MESSAGES/);
  assert.match(messagesSourceFile, /changelogTitle:/);
  assert.match(messagesSourceFile, /changelogLegacyGroup:/);
  assert.match(usageSource, /## 更新日志/);
  assert.match(usageSource, /## Changelog/);
});
