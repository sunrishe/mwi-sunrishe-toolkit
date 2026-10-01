'use strict';

// 图标路径回归：优先使用页面上实际出现的 sprite 路径（游戏换 hash 后自动跟上），
// 扫不到时才回落到硬编码默认值；同一 sprite 出现多个文件名时取出现次数最多的一个
// （页面里可能有其它脚本用旧文件名渲染的图标），次数并列时优先游戏根容器内的写法。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {ROOT, readVmSource} = require('./helpers/source.js');

// 造一个只实现 SpriteService 需要的 DOM：svg use 列表（可增删，模拟页面变化）+ closest。
function createFakeDocument(uses) {
  return {
    uses,
    querySelectorAll(selector) {
      return selector === 'svg use' ? this.uses : [];
    }
  };
}

function createUseElement({href, inRoot = true, xlink = false}) {
  return {
    getAttribute(name) {
      if (xlink) return name === 'xlink:href' ? href : null;
      return name === 'href' ? href : null;
    },
    closest(selector) {
      return inRoot && selector === '#root' ? {} : null;
    }
  };
}

function createSpriteService(document) {
  return vm.runInNewContext(
    `${readVmSource('src/common/runtime.js')}
     createSpriteService();`,
    {document}
  );
}

const GAME_ROOT_ITEMS = '/static/media/items_sprite.11111111.svg';
const THIRD_PARTY_ITEMS = '/static/media/items_sprite.99999999.svg';

test('图标路径：优先用页面上扫到的 sprite 路径，扫不到才用硬编码兜底', () => {
  const document = createFakeDocument([
    createUseElement({href: `${GAME_ROOT_ITEMS}#sword`})
  ]);
  const sprite = createSpriteService(document);
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, '扫描到的路径优先于硬编码默认值');
  // 页面上没有出现过的 sprite 回落到硬编码默认值；未知名称返回空串。
  assert.equal(sprite.get('misc'), '/static/media/misc_sprite.02869244.svg');
  assert.equal(sprite.get('chat_icons'), '/static/media/chat_icons_sprite.5a021815.svg', 'chat_icons 映射到 chatIcons');
  assert.equal(sprite.get('nope'), '');
});

test('图标路径：同一 sprite 多个文件名时取出现次数最多的一个', () => {
  const document = createFakeDocument([
    createUseElement({
      href: `${THIRD_PARTY_ITEMS}#a`,
      inRoot: false
    }), createUseElement({href: `${GAME_ROOT_ITEMS}#b`}), createUseElement({
      href: `${GAME_ROOT_ITEMS}#c`
    }), createUseElement({href: `${GAME_ROOT_ITEMS}#d`})
  ]);
  const sprite = createSpriteService(document);
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, '游戏自己渲染的图标数量多，按出现次数取胜');
});

test('图标路径：次数并列时优先游戏根容器内的写法', () => {
  const document = createFakeDocument([
    createUseElement({href: `${THIRD_PARTY_ITEMS}#a`, inRoot: false}), createUseElement({href: `${GAME_ROOT_ITEMS}#b`})
  ]);
  const sprite = createSpriteService(document);
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, '并列时优先 #root 内的路径，而不是先出现的第三方路径');
});

test('图标路径：忽略没有 # 的引用，兼容 xlink:href', () => {
  const document = createFakeDocument([
    createUseElement({
      href: '/static/media/items_sprite.00000000.svg'
    }), createUseElement({href: `${GAME_ROOT_ITEMS}#sword`, xlink: true})
  ]);
  const sprite = createSpriteService(document);
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, '没有 # 的引用不参与匹配，xlink:href 同样可用');
});

test('图标路径：按 DOM 版本缓存，页面变化后重新扫描', () => {
  const document = createFakeDocument([
    createUseElement({href: `${GAME_ROOT_ITEMS}#sword`})
  ]);
  const sprite = createSpriteService(document);
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS);

  // 页面换了一批图标，但没有通知图标服务：沿用缓存，不重新扫描。
  document.uses.length = 0;
  document.uses.push(createUseElement({href: `${THIRD_PARTY_ITEMS}#sword`, inRoot: false}));
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, '未标记 DOM 变化时沿用缓存');

  // 公共 DOM 观察器标记变化后重新扫描，取新的多数路径。
  sprite.markDomChanged();
  assert.equal(sprite.get('items'), THIRD_PARTY_ITEMS, '标记变化后重新扫描');

  // refresh() 强制重扫，不依赖版本号。
  document.uses.length = 0;
  document.uses.push(createUseElement({href: `${GAME_ROOT_ITEMS}#sword`}));
  sprite.refresh();
  assert.equal(sprite.get('items'), GAME_ROOT_ITEMS, 'refresh() 强制重扫');
});

test('图标路径：硬编码兜底与游戏源码当前引用一致', () => {
  const gameSourceRoot = path.join(ROOT, 'references', 'game-source');
  const sourceDirs = fs
    .readdirSync(gameSourceRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(gameSourceRoot, entry.name));
  assert.ok(sourceDirs.length > 0, 'references/game-source 下应有游戏源码目录');
  const gameBundles = sourceDirs.flatMap((dir) =>
    fs
      .readdirSync(path.join(dir, 'static', 'js'))
      .filter((name) => /^main\..*\.chunk\.js$/.test(name))
      .map((name) => path.join(dir, 'static', 'js', name))
  );
  assert.ok(gameBundles.length > 0, '游戏源码应包含 main.*.chunk.js');
  const gameBundle = gameBundles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

  const defaults = {
    items: 'items_sprite.f58c9476.svg',
    skills: 'skills_sprite.3bb4d936.svg',
    abilities: 'abilities_sprite.fdd1b4de.svg',
    actions: 'actions_sprite.e6388cbc.svg',
    misc: 'misc_sprite.02869244.svg',
    chatIcons: 'chat_icons_sprite.5a021815.svg'
  };
  for (const [
    type, fileName
  ] of Object.entries(defaults)) {
    assert.ok(
      gameBundle.includes(fileName),
      `icon 兜底路径应与游戏源码引用一致：${type} 期望 ${fileName}（游戏更新后同步 runtime.js 的 defaults）`
    );
  }
});
