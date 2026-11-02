#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DEFAULT_INPUT = 'references/game-data/init_character_data.json';
const ANONYMOUS_CHARACTER_ID = '100001';
const ANONYMOUS_GUILD_ID = '900001';
const ANONYMOUS_CHARACTER_NAME = 'Player';

export const KEPT_TOP_LEVEL_KEYS = [
  'type', 'currentTimestamp', 'character', 'characterInfo', 'characterSetting',
  'characterActions', 'characterSkills', 'characterAbilities', 'characterItems', 'abilityCombatTriggersMap',
  'consumableCombatTriggersMap', 'actionTypeFoodSlotsMap', 'actionTypeDrinkSlotsMap', 'characterLoadoutMap', 'combatUnit',
  'noncombatStats', 'characterHouseRoomMap', 'characterAchievements', 'communityBuffs', 'characterGuildBuffMap',
  'guildBuildingLevelMap', 'guild', 'partyInfo', 'characterBuffs'
];

const CHARACTER_ID_KEYS = new Set([
  'characterid', 'characterids'
]);
const PARTY_SLOT_KEYS = [
  'characterID', 'characterLoadoutID', 'isReady', 'isLeader', 'role',
  'minCombatLevel', 'maxCombatLevel'
];
const PARTY_KEYS = [
  'gameMode', 'actionHrid', 'difficultyTier', 'status'
];
const CHARACTER_INFO_MIN_KEYS = [
  'labyrinthTorchCap', 'labyrinthShroudCap', 'labyrinthBeaconCap'
];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function pick(source, keys) {
  const target = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) target[key] = clone(source[key]);
  }
  return target;
}

function collectCharacterIds(value, counts = new Map()) {
  if (Array.isArray(value)) {
    for (const child of value) collectCharacterIds(child, counts);
    return counts;
  }
  if (!value || typeof value !== 'object') return counts;
  for (const [
    key, child
  ] of Object.entries(value)) {
    if (CHARACTER_ID_KEYS.has(key.toLowerCase()) && (typeof child === 'string' || typeof child === 'number')) {
      const value = String(child);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    collectCharacterIds(child, counts);
  }
  return counts;
}

function createIdMap(source, characterId) {
  const counts = collectCharacterIds(source);
  const inferredOwnerId = [
    ...counts.entries()
  ].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const idMap = new Map();
  for (const ownerId of [
    characterId, inferredOwnerId
  ]) {
    if (ownerId) idMap.set(String(ownerId), ANONYMOUS_CHARACTER_ID);
  }
  let nextId = 100002;
  for (const id of [
    ...counts.keys()
  ].sort()) {
    if (idMap.has(id)) continue;
    idMap.set(id, String(nextId));
    nextId++;
  }
  if (characterId === ANONYMOUS_CHARACTER_ID || inferredOwnerId === ANONYMOUS_CHARACTER_ID) {
    idMap.set(ANONYMOUS_CHARACTER_ID, ANONYMOUS_CHARACTER_ID);
  }
  return idMap;
}

function replaceIdsInString(value, idMap) {
  let result = value;
  for (const [
    source, target
  ] of [
    ...idMap.entries()
  ].sort((left, right) => right[0].length - left[0].length)) {
    result = result.replace(new RegExp(`(?<!\\d)${source}(?!\\d)`, 'g'), target);
  }
  return result;
}

function sanitizeCharacterIds(value, idMap) {
  if (Array.isArray(value)) return value.map((child) => sanitizeCharacterIds(child, idMap));
  if (typeof value === 'string') return replaceIdsInString(value, idMap);
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [
    key, child
  ] of Object.entries(value)) {
    result[key] =
      CHARACTER_ID_KEYS.has(key.toLowerCase()) && (typeof child === 'string' || typeof child === 'number')
        ? (idMap.get(String(child)) ?? child)
        : sanitizeCharacterIds(child, idMap);
  }
  return result;
}

function sanitizePartyInfo(partyInfo, idMap) {
  if (!partyInfo || typeof partyInfo !== 'object') return undefined;
  const partySlotMap = {};
  for (const [
    slotId, slot
  ] of Object.entries(partyInfo.partySlotMap || {})) {
    const sanitizedSlot = pick(slot, PARTY_SLOT_KEYS);
    if (sanitizedSlot.characterID != null) {
      sanitizedSlot.characterID = idMap.get(String(sanitizedSlot.characterID)) ?? sanitizedSlot.characterID;
    }
    partySlotMap[slotId] = sanitizedSlot;
  }
  return {
    party: pick(partyInfo.party, PARTY_KEYS),
    partySlotMap
  };
}

function sanitizeCombatUnit(combatUnit, idMap, gameMode) {
  if (!combatUnit || typeof combatUnit !== 'object') return undefined;
  const characterId = combatUnit.character?.id ?? combatUnit.characterId;
  return {
    isPlayer: Boolean(combatUnit.isPlayer),
    character: {
      id: characterId == null ? ANONYMOUS_CHARACTER_ID : (idMap.get(String(characterId)) ?? ANONYMOUS_CHARACTER_ID),
      gameMode: combatUnit.character?.gameMode || gameMode,
      name: ANONYMOUS_CHARACTER_NAME
    },
    name: ANONYMOUS_CHARACTER_NAME,
    experience: combatUnit.experience,
    difficultyTier: combatUnit.difficultyTier,
    combatAbilities: sanitizeCharacterIds(clone(combatUnit.combatAbilities || []), idMap),
    combatConsumables: sanitizeCharacterIds(clone(combatUnit.combatConsumables || []), idMap)
  };
}

export function pruneInitCharacterData(source) {
  if (!source || typeof source !== 'object' || !source.character) {
    throw new TypeError('输入不是有效的 init_character_data 对象');
  }

  const sourceCharacterId = String(source.character.id ?? '');
  const gameMode = source.character.gameMode || 'standard';
  const idMap = createIdMap(source, sourceCharacterId);
  const result = {};

  for (const key of KEPT_TOP_LEVEL_KEYS) {
    if (key in source) result[key] = clone(source[key]);
  }

  result.character = {
    id: sourceCharacterId && idMap.has(sourceCharacterId) ? idMap.get(sourceCharacterId) : ANONYMOUS_CHARACTER_ID,
    gameMode,
    name: ANONYMOUS_CHARACTER_NAME
  };
  result.characterInfo = pick(source.characterInfo, CHARACTER_INFO_MIN_KEYS);
  result.characterSetting = Object.fromEntries(
    Object.entries(source.characterSetting || {}).filter(
      ([
        key
      ]) => key.startsWith('labyrinth')
    )
  );
  result.guild = source.guild ? {id: ANONYMOUS_GUILD_ID} : undefined;
  result.partyInfo = sanitizePartyInfo(source.partyInfo, idMap);
  result.combatUnit = sanitizeCombatUnit(source.combatUnit, idMap, gameMode);

  const sanitized = sanitizeCharacterIds(result, idMap);
  for (const key of Object.keys(sanitized)) {
    if (sanitized[key] === undefined) delete sanitized[key];
  }
  return sanitized;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const inputPath = path.resolve(process.cwd(), positional[0] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.cwd(), positional[1] || inputPath);
  const sourceText = fs.readFileSync(inputPath, 'utf8');
  const source = JSON.parse(sourceText);
  const pruned = pruneInitCharacterData(source);
  const outputText = JSON.stringify(pruned);
  const removed = Object.keys(source).filter((key) => !(key in pruned));

  console.log(`保留 ${Object.keys(pruned).length} 个顶层节点，删除 ${removed.length} 个`);
  console.log(`体积：${formatBytes(Buffer.byteLength(sourceText))} -> ${formatBytes(Buffer.byteLength(outputText))}`);
  if (removed.length) console.log(`已删除：${removed.join(', ')}`);

  if (dryRun) {
    console.log('dry-run：未写入文件');
    return;
  }

  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, outputText, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  console.log(`已写入 ${path.relative(process.cwd(), outputPath) || path.basename(outputPath)}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === pathToFileURL(fileURLToPath(import.meta.url)).href) main();
