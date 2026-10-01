// 文档一致性回归：docs/changelog.md 更新日志必须与 package.json 版本同步，
// 同一版本只允许一个条目（防止版本重新规划后残留中间版本条目），并且每个版本都要带发布日期
// （未在 GreasyFork 发布过的版本除外，v1.1.3 无发布记录）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelogSource = fs.readFileSync(path.join(root, 'docs', 'changelog.md'), 'utf8');

// 版本条目标题形如 `## v2.18.0（2026-10-01）`；EDS 历史版本为三级标题，日期可选。
const VERSION_HEADING_PATTERN = /^#{2,3} (v\d+\.\d+\.\d+)(?:\s*[（(](\d{4}-\d{2}-\d{2})[）)])?\s*$/gm;
const NO_DATE_VERSIONS = new Set([
  'v1.1.3'
]);

function changelogVersionEntries() {
  return [
    ...changelogSource.matchAll(VERSION_HEADING_PATTERN)
  ].map((match) => ({version: match[1], date: match[2] || ''}));
}

test('changelog.md 更新日志最新条目与 package.json 版本一致', () => {
  const entries = changelogVersionEntries();
  assert.ok(entries.length > 0, '更新日志应存在版本条目');
  assert.equal(entries[0].version, `v${packageManifest.version}`);
});

test('changelog.md 更新日志版本条目不重复', () => {
  const versions = changelogVersionEntries().map((entry) => entry.version);
  assert.equal(new Set(versions).size, versions.length, '同一版本只允许一个更新日志条目');
});

test('changelog.md 更新日志版本条目都带发布日期', () => {
  changelogVersionEntries().forEach((entry) => {
    if (NO_DATE_VERSIONS.has(entry.version)) return;
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, `${entry.version} 缺少发布日期`);
  });
});
