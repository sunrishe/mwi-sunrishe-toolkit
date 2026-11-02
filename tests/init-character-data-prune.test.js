'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {pathToFileURL} = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const fixturePath = path.join(ROOT, 'references', 'game-data', 'init_character_data.json');
const source = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const modulePromise = import(pathToFileURL(path.join(ROOT, 'scripts', 'prune-init-character-data.mjs')).href);

test('init_character_data 脱敏裁剪只保留 MST 所需节点', async () => {
  const {KEPT_TOP_LEVEL_KEYS, pruneInitCharacterData} = await modulePromise;
  const result = pruneInitCharacterData(source);

  assert.deepEqual(
    Object.keys(result).sort(),
    [
      ...KEPT_TOP_LEVEL_KEYS
    ].sort()
  );
  for (const key of [
    'user', 'userInfo', 'email', 'friendCharacterMap', 'guildCharacterMap',
    'guildSharableCharacterMap', 'guildTrialSignupLevelMap', 'chatHistoryByChannelMap', 'guildChatHistory', 'partyChatHistory',
    'whisperChatHistory'
  ]) {
    assert.equal(key in result, false, `不应保留 ${key}`);
  }
  assert.equal(result.character.name, 'Player');
  assert.equal(result.character.id, '100001');
  assert.equal(result.guild.id, '900001');
  assert.deepEqual(Object.keys(result.partyInfo || {}).sort(), [
    'party', 'partySlotMap'
  ]);
  assert.doesNotMatch(JSON.stringify(result), /14251335|@qq\.com|dadada6|milky1123|xiao711/i);
});

test('init_character_data 脱敏裁剪保留装备、配装和战斗测试数据', async () => {
  const {pruneInitCharacterData} = await modulePromise;
  const result = pruneInitCharacterData(source);

  assert.equal(result.characterItems.length, source.characterItems.length);
  assert.deepEqual(Object.keys(result.characterLoadoutMap), Object.keys(source.characterLoadoutMap));
  assert.equal(result.characterSkills.length, source.characterSkills.length);
  assert.equal(result.characterAbilities.length, source.characterAbilities.length);
  assert.equal(Object.keys(result.characterHouseRoomMap).length, Object.keys(source.characterHouseRoomMap).length);
  assert.ok(result.characterItems.every((item) => !item.hash || item.hash.startsWith('100001::')));
  assert.ok(
    Object.values(result.characterLoadoutMap).every(
      (loadout) => !loadout.characterID || loadout.characterID === '100001'
    )
  );
});

test('init_character_data 脱敏裁剪可重复执行', async () => {
  const {pruneInitCharacterData} = await modulePromise;
  const once = pruneInitCharacterData(source);
  const twice = pruneInitCharacterData(once);
  assert.deepEqual(twice, once);
});
