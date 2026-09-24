// 文档一致性回归：docs/changelog.md 更新日志必须与 package.json 版本同步，
// 且同一版本只允许一个条目（防止版本重新规划后残留中间版本条目）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelogSource = fs.readFileSync(path.join(root, 'docs', 'changelog.md'), 'utf8');

function changelogVersionHeadings() {
  return [
    ...changelogSource.matchAll(/^## (v\d+\.\d+\.\d+)$/gm)
  ].map((match) => match[1]);
}

test('changelog.md 更新日志最新条目与 package.json 版本一致', () => {
  const headings = changelogVersionHeadings();
  assert.ok(headings.length > 0, '更新日志应存在版本条目');
  assert.equal(headings[0], `v${packageManifest.version}`);
});

test('changelog.md 更新日志版本条目不重复', () => {
  const headings = changelogVersionHeadings();
  assert.equal(new Set(headings).size, headings.length, '同一版本只允许一个更新日志条目');
});
