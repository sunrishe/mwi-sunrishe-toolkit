export class CharacterCardIconRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.DataHub = deps.ctx.DataHub;
    this.utils = deps.ctx.utils;
  }

  getAbilityDisplayNames(abilityHrid) {
    const resources = this.DataHub.getGameI18nResources();
    const abilityMap = this.DataHub.clientData.raw?.abilityDetailMap || {};
    const fallback = abilityMap[abilityHrid]?.name || this.utils.substrLastSlash(abilityHrid).replace(/_/g, ' ');
    const en = resources?.en?.translation?.abilityNames?.[abilityHrid] || fallback;
    const zh = resources?.zh?.translation?.abilityNames?.[abilityHrid] || fallback;
    return {en: String(en), zh: String(zh)};
  }

  createSvgIcon(itemHrid, iconType = null, className = 'Icon_icon__2LtL_') {
    let type = 'items';
    let itemId = itemHrid;

    if (itemHrid.startsWith('/items/')) {
      type = 'items';
      itemId = itemHrid.replace('/items/', '');
    } else if (itemHrid.startsWith('/abilities/')) {
      type = 'abilities';
      itemId = itemHrid.replace('/abilities/', '');
    } else if (itemHrid.startsWith('/skills/')) {
      type = 'skills';
      itemId = itemHrid.replace('/skills/', '');
    } else if (itemHrid.startsWith('/misc/')) {
      type = 'misc';
      itemId = itemHrid.replace('/misc/', '');
    } else if (itemHrid.startsWith('/house_rooms/')) {
      // 游戏房屋图标位于 misc sprite，symbol 格式为 house_<room-id>。
      type = 'misc';
      itemId = `house_${itemHrid.replace('/house_rooms/', '')}`;
    } else if ([
        'stamina', 'intelligence', 'attack', 'melee', 'defense',
        'ranged', 'magic'
      ].includes(itemHrid)) {
      type = 'skills';
      itemId = itemHrid;
    } else {
      itemId = itemHrid.replace('/items/', '').replace('/abilities/', '').replace('/skills/', '').replace('/misc/', '');
    }

    if (iconType) {
      type = iconType;
    }

    if (this.state.svgTool && this.state.svgTool.isLoaded) {
      return this.state.svgTool.createSVGIcon(itemId, {className, title: itemId, type});
    }

    return this.state.svgTool.createFallbackIcon(itemId, className, itemId);
  }
}

export class CharacterCardIdentityRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.utils = deps.ctx.utils;
    this.gameCharacterNameClassCache = new Map();
  }

  getGameCharacterNameClass(localName) {
    if (!localName) return '';
    if (this.gameCharacterNameClassCache.has(localName)) return this.gameCharacterNameClassCache.get(localName);
    const escapedName = String(localName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('\\.([A-Za-z0-9_-]*CharacterName_' + escapedName + '__[A-Za-z0-9_-]+)');
    const findInRules = (rules) => {
      for (const rule of Array.from(rules || [])) {
        const match = rule.selectorText?.match(pattern);
        if (match) return match[1];
        const nestedMatch = rule.cssRules ? findInRules(rule.cssRules) : '';
        if (nestedMatch) return nestedMatch;
      }
      return '';
    };
    for (const styleSheet of Array.from(document.styleSheets || [])) {
      try {
        const className = findInRules(styleSheet.cssRules);
        if (className) {
          this.gameCharacterNameClassCache.set(localName, className);
          return className;
        }
      } catch {}
    }
    return '';
  }

  generateChatIcon(chatIconHrid) {
    if (!chatIconHrid) return '';
    const iconId = this.utils.substrLastSlash(chatIconHrid);
    const spritePath = this.state.svgTool.getChatIconsSpritePath();
    const gameClass = this.getGameCharacterNameClass('chatIcon');
    return `
  <div class="mst-card-chat-icon ${gameClass}" title="${this.utils.escapeHtml(chatIconHrid)}">
    <svg role="img" aria-label="${this.utils.escapeHtml(iconId)}" width="100%" height="100%">
      <use href="${this.utils.escapeHtml(spritePath)}#${this.utils.escapeHtml(iconId)}"></use>
    </svg>
  </div>`;
  }

  generateCharacterNameHeader(data, characterName, characterNameElement) {
    const player = data.player || data;
    const hasIdentityData = Boolean(
      player.specialChatIconHrid || player.chatIconHrid || player.nameColorHrid || player.gameMode
    );
    if (!hasIdentityData && characterNameElement) return characterNameElement;

    const wrapperClass = this.getGameCharacterNameClass('characterName');
    const nameClass = this.getGameCharacterNameClass('name');
    const colorId = this.utils.substrLastSlash(player.nameColorHrid);
    const colorClass = this.getGameCharacterNameClass(colorId);
    const gameModeClass = this.getGameCharacterNameClass('gameMode');
    let gameModeTag = '';
    if (player.gameMode === 'ironcow') gameModeTag = '[IC]';
    else if (player.gameMode === 'legacy_ironcow') gameModeTag = '[LC]';
    return `
  <div class="mst-card-character-name ${wrapperClass}" translate="no">
    ${this.generateChatIcon(player.specialChatIconHrid)}
    ${this.generateChatIcon(player.chatIconHrid)}
    <div class="mst-card-name ${nameClass} ${colorClass}" data-name="${this.utils.escapeHtml(characterName)}">
      <span>${this.utils.escapeHtml(characterName)}</span>
    </div>
    ${gameModeTag ? `<div class="mst-card-game-mode ${gameModeClass}">${gameModeTag}</div>` : ''}
  </div>`;
  }
}

export class CharacterCardBuildScoreRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.i18n = deps.ctx.i18n;
  }

  registerBuildScoreSource(data) {
    const key = `mst-build-score-${++this.state.buildScore.sequence}`;
    this.state.buildScore.sources.set(key, data);
    return key;
  }

  // 着装评分分战斗/生活两行展示（✦ 在文案前，标签后跟分数）；战力打造分保持
  // 单块布局（标签在上、数值在下）。
  renderBuildScore(scoreElement, score) {
    const battleRow = scoreElement.querySelector('[data-score-row="battle"]');
    const skillingRow = scoreElement.querySelector('[data-score-row="skilling"]');
    const battleLabel = battleRow?.querySelector('.mst-card-build-score-label');
    const battleValue = battleRow?.querySelector('.mst-card-build-score-value');
    const skillingLabel = skillingRow?.querySelector('.mst-card-build-score-label');
    const skillingValue = skillingRow?.querySelector('.mst-card-build-score-value');
    const setMarker = (hidden) => {
      scoreElement.querySelectorAll('.mst-card-build-score-new').forEach((marker) => {
        marker.hidden = hidden;
      });
    };
    const setLegacyLayout = (legacy) => {
      if (battleRow) battleRow.classList.toggle('mst-card-build-score-legacy', legacy);
    };
    if (typeof score === 'string') {
      // 计算中或错误提示：两个分数块同显，不显示新版本标识。
      if (battleLabel) battleLabel.textContent = this.i18n.t('battleScore');
      if (battleValue) battleValue.textContent = score;
      if (skillingLabel) skillingLabel.textContent = this.i18n.t('skillingScore');
      if (skillingValue) skillingValue.textContent = score;
      if (skillingRow) skillingRow.hidden = false;
      setLegacyLayout(false);
      setMarker(true);
      return;
    }
    const hiddenText = score.equipmentHidden ? ` (${this.i18n.t('equipmentHidden')})` : '';
    if (score.newVersion) {
      // 卡片两行：战斗评分 / 生活评分，完整口径与分项在悬浮提示中。
      if (battleLabel) battleLabel.textContent = this.i18n.t('battleScore');
      if (battleValue) battleValue.textContent = `${score.battle.total.toFixed(1)}${hiddenText}`;
      if (skillingLabel) skillingLabel.textContent = this.i18n.t('skillingScore');
      if (skillingValue) {
        skillingValue.textContent = score.skilling.available ? `${score.skilling.total.toFixed(1)}${hiddenText}` : '-';
      }
      if (skillingRow) skillingRow.hidden = false;
      setLegacyLayout(false);
      setMarker(false);
    } else {
      // 战力打造分：标签在上、数值在下，生活行隐藏。
      if (battleLabel) battleLabel.textContent = this.i18n.t('buildScore');
      if (battleValue) battleValue.textContent = `${score.total.toFixed(1)}${hiddenText}`;
      if (skillingRow) skillingRow.hidden = true;
      setLegacyLayout(true);
      setMarker(true);
    }
  }

  // 新版战力分开关：默认启用，仅在用户明确关闭时使用旧版算法。
  getUseNewBuildScore() {
    try {
      return localStorage.getItem('mst.buildScoreUseNew') !== '0';
    } catch {
      return true;
    }
  }

  // showCalculating 为 false 时（切换评分模式），保留旧分数作为占位，计算完成
  // 后一次性替换，避免"计算中"中间态让评分框宽度变化、推动 header 布局抖动。
  hydrateBuildScores(root = document, {showCalculating = true} = {}) {
    const scoreElements = Array.from(root.querySelectorAll('.mst-card-build-score[data-build-score-key]'));
    return Promise.all(
      scoreElements.map(async (scoreElement) => {
        const key = scoreElement.dataset.buildScoreKey;
        const data = this.state.buildScore.sources.get(key);
        if (!data) return;
        if (scoreElement.dataset.scoreState === 'complete' && scoreElement.dataset.renderedScoreKey === key) return;
        if (scoreElement.dataset.scoreState === 'loading' && scoreElement.dataset.loadingScoreKey === key) return;
        scoreElement.dataset.scoreState = 'loading';
        scoreElement.dataset.loadingScoreKey = key;
        if (showCalculating) {
          this.renderBuildScore(scoreElement, this.i18n.t('calculating'));
        }
        try {
          const score = await this.ctx.buildScoreService.calculate(data, this.getUseNewBuildScore());
          if (scoreElement.dataset.buildScoreKey !== key) return;
          this.renderBuildScore(scoreElement, score);
          scoreElement.title = this.buildScoreTooltip(score);
          scoreElement.dataset.scoreState = 'complete';
          scoreElement.dataset.renderedScoreKey = key;
        } catch (error) {
          if (scoreElement.dataset.buildScoreKey !== key) return;
          console.warn('[MST] 战力打造分计算失败:', error);
          this.renderBuildScore(scoreElement, '--');
          scoreElement.title = error.message || String(error);
          scoreElement.dataset.scoreState = 'complete';
          scoreElement.dataset.renderedScoreKey = key;
        } finally {
          if (scoreElement.dataset.loadingScoreKey === key) delete scoreElement.dataset.loadingScoreKey;
          this.state.buildScore.sources.delete(key);
        }
      })
    );
  }

  // 悬浮提示参考 MWITools：战斗分（房屋/技能/装备/战斗神龛）与生活分（房屋/工具/装备/生活神龛）。
  buildScoreTooltip(score) {
    if (!score.newVersion) {
      return [
        `${this.i18n.t('houseScore')}: ${score.house.toFixed(1)}`, `${this.i18n.t('abilityScore')}: ${score.ability.toFixed(1)}`, `${this.i18n.t('equipmentScore')}: ${score.equipment.toFixed(1)}`, this.i18n.t('algorithmSourceMwiTools')
      ].join('\n');
    }
    const {battle, skilling} = score;
    const hiddenText = score.equipmentHidden ? ` (${this.i18n.t('equipmentHidden')})` : '';
    return [
      `${this.i18n.t('battleGearScore')}: ${battle.total.toFixed(1)}${hiddenText}`, `  ${this.i18n.t('houseScore')}: ${battle.house.toFixed(1)}`, `  ${this.i18n.t('abilityScore')}: ${battle.abilities.toFixed(1)}`, `  ${this.i18n.t('equipmentScore')}: ${battle.equipment.toFixed(1)}`, ...(Number.isFinite(battle.shrine) ? [
            `  ${this.i18n.t('battleShrineScore')}: ${battle.shrine.toFixed(1)}`
          ] : []),
      `${this.i18n.t('skillingGearScore')}: ${skilling.available ? skilling.total.toFixed(1) : '-'}${hiddenText}`, `  ${this.i18n.t('houseScore')}: ${skilling.house.toFixed(1)}`, `  ${this.i18n.t('toolScore')}: ${skilling.tools.toFixed(1)}`, `  ${this.i18n.t('equipmentScore')}: ${skilling.equipment.toFixed(1)}`, ...(Number.isFinite(skilling.shrine) ? [
            `  ${this.i18n.t('skillingShrineScore')}: ${skilling.shrine.toFixed(1)}`
          ] : []),
      this.i18n.t('algorithmSourceMwiTools')
    ].join('\n');
  }

  formatCardTime(timestamp) {
    const numericTimestamp = Number(timestamp);
    if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return this.i18n.t('unknown');
    const date = new Date(numericTimestamp);
    if (!Number.isFinite(date.getTime())) return this.i18n.t('unknown');
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  getCharacterCardContentSignature(data) {
    return JSON.stringify(data, (key, value) => (key === 'dataTimestamp' ? undefined : value));
  }

  updateCharacterCardDataTime(timestamp, modal = null) {
    const root = modal || document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal)');
    const dataTime = root?.querySelector('.mst-card-data-time');
    if (dataTime) dataTime.textContent = `${this.i18n.t('dataTimeLabel')}${this.formatCardTime(timestamp)}`;
  }
}

export class CharacterCardEquipmentRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.createSvgIcon = deps.createSvgIcon;
    this.DataHub = deps.ctx.DataHub;
    this.i18n = deps.ctx.i18n;
    this.utils = deps.ctx.utils;
  }

  generateEquipmentPanel(characterObj) {
    const equipmentSlots = {
      '/item_locations/back': {row: 1, col: 1},
      '/item_locations/head': {row: 1, col: 2},
      '/item_locations/main_hand': {row: 2, col: 1},
      '/item_locations/body': {row: 2, col: 2},
      '/item_locations/off_hand': {row: 2, col: 3},
      '/item_locations/hands': {row: 3, col: 1},
      '/item_locations/legs': {row: 3, col: 2},
      '/item_locations/pouch': {row: 3, col: 3},
      '/item_locations/feet': {row: 4, col: 2},
      '/item_locations/neck': {row: 1, col: 5},
      '/item_locations/earrings': {row: 2, col: 5},
      '/item_locations/ring': {row: 3, col: 5},
      '/item_locations/trinket': {row: 1, col: 3},
      '/item_locations/two_hand': {row: 2, col: 1},
      '/item_locations/charm': {row: 4, col: 5}
    };

    const items = characterObj.equipment || characterObj.characterItems || [];
    const equipmentMap = {};
    let hasTwoHandWeapon = false;

    items.forEach((item) => {
      const slotInfo = equipmentSlots[item.itemLocationHrid];
      if (slotInfo) {
        equipmentMap[item.itemLocationHrid] = item;
        if (item.itemLocationHrid === '/item_locations/two_hand') hasTwoHandWeapon = true;
      }
    });

    let html = '<div class="mst-equipment-panel">';
    html += '<div class="EquipmentPanel_playerModel__3LRB6">';

    Object.entries(equipmentSlots).forEach(
      ([
        slotHrid, slotInfo
      ]) => {
        if (hasTwoHandWeapon && slotHrid === '/item_locations/main_hand') {
          return;
        }

        if (!hasTwoHandWeapon && slotHrid === '/item_locations/two_hand') {
          return;
        }

        const item = equipmentMap[slotHrid];

        html += `<div style="grid-row-start:${slotInfo.row};grid-column-start:${slotInfo.col};">`;
        html += '<div class="ItemSelector_itemSelector__2eTV6">';
        html += '<div class="ItemSelector_itemContainer__3olqe">';
        html += '<div class="Item_itemContainer__x7kH1">';
        html += '<div>';

        if (item) {
          const enhancementLevel = item.enhancementLevel || 0;
          const itemLevel = Number(this.DataHub.clientData.raw?.itemDetailMap?.[item.itemHrid]?.itemLevel || 0);
          const itemName = this.DataHub.getLocalizedGameName('itemNames', item.itemHrid, this.i18n.languageKey);

          html += `<div class="Item_item__2De2O Item_clickable__3viV6" style="position:relative;" title="${this.utils.escapeHtml(itemName)}">`;
          html += '<div class="Item_iconContainer__5z7j4">';
          html += this.createSvgIcon(item.itemHrid, 'items');
          html += '</div>';

          if (itemLevel > 0) {
            html += `<div class="mst-item-level">${itemLevel}</div>`;
          }

          if (enhancementLevel > 0) {
            html += `<div class="Item_enhancementLevel__19g-e mst-equipment-enhancement-processed mst-equipment-enhancement-level-${enhancementLevel}" style="z-index:9;">+${enhancementLevel}</div>`;
          }

          html += '</div>';
        } else {
          html += '<div class="Item_item__2De2O" style="position:relative;opacity:0.3;">';
          html += '<div class="Item_iconContainer__5z7j4">';
          html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px;">${this.i18n.t('emptySlot')}</div>`;
          html += '</div>';
          html += '</div>';
        }

        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      }
    );

    html += '</div>';
    html += '</div>';

    return html;
  }
}

export class CharacterCardLifeRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.CardDataAdapter = deps.CardDataAdapter;
    this.createSvgIcon = deps.createSvgIcon;
    this.DataHub = deps.ctx.DataHub;
    this.i18n = deps.ctx.i18n;
    this.utils = deps.ctx.utils;
  }

  getLifeProfessionDefinitions() {
    return Object.values(this.DataHub.clientData.raw?.houseRoomDetailMap || {})
      .filter((detail) => detail?.hrid && detail?.skillHrid && !detail.usableInActionTypeMap?.['/action_types/combat'])
      .sort((a, b) => Number(a.sortIndex || 0) - Number(b.sortIndex || 0))
      .slice(0, 10)
      .map((detail) => ({
        houseHrid: detail.hrid,
        skillHrid: detail.skillHrid,
        toolLocationHrid: `/item_locations/${this.utils.substrLastSlash(detail.skillHrid)}_tool`,
        toolTypeHrid: `/equipment_types/${this.utils.substrLastSlash(detail.skillHrid)}_tool`,
        fallbackHouseName: detail.name || this.utils.substrLastSlash(detail.hrid).replace(/_/g, ' ')
      }));
  }

  generateLifeToolsPanel(data, characterObj) {
    const definitions = this.getLifeProfessionDefinitions();
    if (!definitions.length) return '';
    const equipment = characterObj.equipment || characterObj.characterItems || [];
    const equipmentByLocation = new Map(
      equipment.map((item) => [
        item?.itemLocationHrid, item
      ])
    );
    const language = this.i18n.languageKey;
    const slots = definitions
      .map((definition) => {
        const item = equipmentByLocation.get(definition.toolLocationHrid);
        const emptyName = this.DataHub.getLocalizedGameName('equipmentTypeNames', definition.toolTypeHrid, language);
        const displayEmptyName =
          language === 'en'
            ? emptyName
                .replace(/woodcutting/gi, (word) => `${word.slice(0, 4)}\u00AD${word.slice(4)}`)
                .replace(/cheesesmithing/gi, (word) => `${word.slice(0, 6)}\u00AD${word.slice(6)}`)
            : emptyName;
        const itemName = item ? this.DataHub.getLocalizedGameName('itemNames', item.itemHrid, language) : emptyName;
        const enhancementLevel = Number(item?.enhancementLevel || 0);
        const itemLevel = Number(this.DataHub.clientData.raw?.itemDetailMap?.[item?.itemHrid]?.itemLevel || 0);
        return `
  <div class="mst-life-tool-slot" title="${this.utils.escapeHtml(itemName)}">
    <div class="ItemSelector_itemSelector__2eTV6">
      <div class="ItemSelector_itemContainer__3olqe">
        ${
          item
            ? `
  <div class="Item_itemContainer__x7kH1">
    <div>
      <div class="Item_item__2De2O Item_clickable__3viV6" style="position:relative;">
        <div class="Item_iconContainer__5z7j4">${this.createSvgIcon(item.itemHrid, 'items')}</div>
              ${itemLevel > 0 ? `<div class="mst-item-level">${itemLevel}</div>` : ''}
              ${enhancementLevel > 0 ? `<div class="Item_enhancementLevel__19g-e mst-equipment-enhancement-processed mst-equipment-enhancement-level-${enhancementLevel}" style="z-index:9;">+${enhancementLevel}</div>` : ''}
      </div>
    </div>
  </div>`
            : `
  <div class="Item_itemContainer__x7kH1">
    <div>
      <div class="Item_item__2De2O" style="position:relative;opacity:0.3;">
        <div class="Item_name__2C42x mst-life-tool-empty-name" lang="${language}">${this.utils.escapeHtml(displayEmptyName)}</div>
      </div>
    </div>
  </div>`
        }
      </div>
    </div>
  </div>`;
      })
      .join('');
    return `
  <div class="mst-life-equipment-panel">
    <div class="mst-panel-title">${this.i18n.t('skillingTools')}</div>
    <div class="mst-life-tools-grid">${slots}</div>
  </div>`;
  }

  generateLifeProgressionPanel(data, characterObj, availability = {}) {
    const definitions = this.getLifeProfessionDefinitions();
    if (!definitions.length) return '';
    const houseRoomMap = data.houseRooms || data.characterHouseRoomMap || {};
    const language = this.i18n.languageKey;
    const resources = this.DataHub.getGameI18nResources();
    const renderLevel = (level, isHouse = false) => {
      if (level == null) return '<span class="mst-life-progress-level mst-unavailable-level">--</span>';
      const maxClass = isHouse && level === 8 ? ' mst-house-max-level' : '';
      return `<span class="mst-life-progress-level${maxClass}">Lv.${Math.floor(level)}</span>`;
    };
    const slots = definitions
      .map((definition) => {
        const skillName = this.DataHub.getLocalizedGameName('skillNames', definition.skillHrid, language);
        const skillLevel = this.CardDataAdapter.getSkillLevel(characterObj, definition.skillHrid, {
          data,
          floor: true,
          missingValue: null
        });
        const room = houseRoomMap[definition.houseHrid];
        const roomLevel =
          availability.house === false ? null : Number(typeof room === 'object' ? room?.level || 0 : room || 0);
        const roomName = String(
          resources?.[language]?.translation?.houseRoomNames?.[definition.houseHrid] || definition.fallbackHouseName
        );
        return `
  <div class="mst-life-progress-slot">
    <div class="mst-life-level-row" title="${this.utils.escapeHtml(skillName)}">
      <span class="mst-life-progress-icon">${this.createSvgIcon(definition.skillHrid, 'skills')}</span>
      ${renderLevel(skillLevel)}
    </div>
    <div class="mst-life-house-row" title="${this.utils.escapeHtml(roomName)}">
      <span class="mst-life-progress-icon">${this.createSvgIcon(definition.houseHrid)}</span>
      ${renderLevel(roomLevel, true)}
    </div>
  </div>`;
      })
      .join('');
    return `
  <div class="mst-life-progression-panel">
    <div class="mst-panel-title">${this.i18n.t('skillingLevelsAndHouses')}</div>
    <div class="mst-life-progression-grid">${slots}</div>
  </div>`;
  }
}

export class CharacterCardSkillRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.createSvgIcon = deps.createSvgIcon;
    this.getAbilityDisplayNames = deps.getAbilityDisplayNames;
    this.i18n = deps.ctx.i18n;
    this.utils = deps.ctx.utils;
  }

  renderReadonlySkillSlots(combatSkills) {
    let html = '<div class="mst-skill-panel">';
    html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
    combatSkills.forEach((ability) => {
      if (!ability) {
        html += `<div><div class="Ability_ability__1njrh mst-empty-skill-slot mst-card-readonly-empty-skill-slot"><span class="mst-card-empty-skill-label">${this.i18n.t('emptySlot')}</span></div></div>`;
        return;
      }
      const skillName = this.i18n.pick(this.getAbilityDisplayNames(ability.abilityHrid));
      html += '<div>';
      html += `<div class="Ability_ability__1njrh" title="${this.utils.escapeHtml(skillName)}">`;
      html += '<div class="Ability_iconContainer__3syNQ">';
      html += this.createSvgIcon(ability.abilityHrid, 'abilities');
      html += '</div>';
      html += `<div class="Ability_level__1L-do">Lv.${ability.level}</div>`;
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  generateSkillPanel(data, isMyCharacter = false, options = {}) {
    const teamMode = options && options.teamMode;
    const abilities = data.abilities || data.characterSkills || [];

    if (isMyCharacter) {
      if (teamMode) {
        const combatSkills = Array(this.state.customSkills.maxSkills).fill(null);
        abilities
          .filter((ability) => ability.abilityHrid && ability.abilityHrid.startsWith('/abilities/'))
          .filter((ability) => ability.slotNumber > 0 && ability.slotNumber <= this.state.customSkills.maxSkills)
          .forEach((ability) => {
            combatSkills[ability.slotNumber - 1] = ability;
          });
        return this.renderReadonlySkillSlots(combatSkills);
      }

      const combatSkills = abilities
        .filter((ability) => ability.abilityHrid && ability.abilityHrid.startsWith('/abilities/'))
        .filter((ability) => ability.slotNumber && ability.slotNumber > 0)
        .sort((a, b) => a.slotNumber - b.slotNumber)
        .slice(0, 5);

      if (this.state.customSkills.selectedSkills.length === 0) {
        // 按游戏中的实际技能栏位初始化，保留中间的空槽。
        combatSkills.forEach((skill) => {
          if (skill.slotNumber > this.state.customSkills.maxSkills) return;
          this.state.customSkills.selectedSkills[skill.slotNumber - 1] = {
            abilityHrid: skill.abilityHrid,
            level: skill.level,
            slotNumber: skill.slotNumber
          };
        });
      }

      let html = '<div class="mst-skill-panel">';
      html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';

      for (let i = 0; i < this.state.customSkills.maxSkills; i++) {
        const selectedSkill = this.state.customSkills.selectedSkills[i];

        if (selectedSkill) {
          const skillName = this.i18n.pick(this.getAbilityDisplayNames(selectedSkill.abilityHrid));
          html += '<div>';
          html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM mst-skill-slot" data-skill-index="${i}" title="${this.utils.escapeHtml(skillName)}">`;
          html += '<div class="Ability_iconContainer__3syNQ">';
          html += this.createSvgIcon(selectedSkill.abilityHrid, 'abilities');
          html += '</div>';
          html += `<div class="Ability_level__1L-do">Lv.${selectedSkill.level}</div>`;
          html += '</div>';
          html += '</div>';
        } else {
          html += '<div>';
          html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM mst-empty-skill-slot" data-skill-index="${i}">`;
          html += `<span class="mst-card-empty-skill-label">${this.i18n.t('emptySlot')}</span>`;
          html += '</div>';
          html += '</div>';
        }
      }

      html += '</div>';
      html += '</div>';

      return html;
    }

    const validAbilities = abilities.filter(
      (ability) => ability.abilityHrid && ability.abilityHrid.startsWith('/abilities/')
    );
    const equippedAbilities = validAbilities.filter(
      (ability) => ability.slotNumber > 0 && ability.slotNumber <= this.state.customSkills.maxSkills
    );
    const combatSkills = Array(this.state.customSkills.maxSkills).fill(null);
    if (equippedAbilities.length) {
      equippedAbilities.forEach((ability) => {
        combatSkills[ability.slotNumber - 1] = ability;
      });
    } else {
      validAbilities.slice(0, this.state.customSkills.maxSkills).forEach((ability, index) => {
        combatSkills[index] = ability;
      });
    }

    return this.renderReadonlySkillSlots(combatSkills);
  }
}

export class CharacterCardProgressionRenderer {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.CardDataAdapter = deps.CardDataAdapter;
    this.createSvgIcon = deps.createSvgIcon;
    this.DataHub = deps.ctx.DataHub;
    this.i18n = deps.ctx.i18n;
  }

  calculateCombatLevel(characterObj) {
    try {
      const serverCombatLevel = Number(characterObj.combatLevel ?? characterObj.combatDetails?.combatLevel);
      if (Number.isFinite(serverCombatLevel)) return Math.floor(serverCombatLevel);

      const stamina = characterObj.staminaLevel || 0;
      const intelligence = characterObj.intelligenceLevel || 0;
      const defense = characterObj.defenseLevel || 0;
      const attack = characterObj.attackLevel || 0;
      const melee = this.CardDataAdapter.getSkillLevel(characterObj, 'melee', {allowLegacyPower: true});
      const ranged = characterObj.rangedLevel || 0;
      const magic = characterObj.magicLevel || 0;

      const maxCombatSkill = Math.max(melee, ranged, magic);
      const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
      return Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
    } catch (error) {
      console.warn('计算战斗等级失败:', error);
      return 0;
    }
  }

  generateProgressionPanel(data, characterObj, availability = {}) {
    const houseRoomMap = data.houseRooms || data.characterHouseRoomMap || {};
    const language = this.i18n.languageKey;
    const resources = this.DataHub.getGameI18nResources();
    const getOfficialName = (group, hrid, fallback) =>
      String(resources?.[language]?.translation?.[group]?.[hrid] || fallback);
    const rows = [
      {
        house: {icon: 'house', type: 'misc'},
        combat: {key: 'combat', icon: 'combat', type: 'misc', name: this.i18n.t('combat')}
      }, {
        house: {
          hrid: '/house_rooms/dining_room',
          name: getOfficialName('houseRoomNames', '/house_rooms/dining_room', this.i18n.t('diningRoom'))
        },
        combat: {
          key: 'stamina',
          icon: 'stamina',
          name: getOfficialName('skillNames', '/skills/stamina', this.i18n.t('stamina'))
        }
      }, {
        house: {
          hrid: '/house_rooms/library',
          name: getOfficialName('houseRoomNames', '/house_rooms/library', this.i18n.t('library'))
        },
        combat: {
          key: 'intelligence',
          icon: 'intelligence',
          name: getOfficialName('skillNames', '/skills/intelligence', this.i18n.t('intelligence'))
        }
      }, {
        house: {
          hrid: '/house_rooms/dojo',
          name: getOfficialName('houseRoomNames', '/house_rooms/dojo', this.i18n.t('dojo'))
        },
        combat: {
          key: 'attack',
          icon: 'attack',
          name: getOfficialName('skillNames', '/skills/attack', this.i18n.t('attack'))
        }
      }, {
        house: {
          hrid: '/house_rooms/armory',
          name: getOfficialName('houseRoomNames', '/house_rooms/armory', this.i18n.t('armory'))
        },
        combat: {
          key: 'defense',
          icon: 'defense',
          name: getOfficialName('skillNames', '/skills/defense', this.i18n.t('defense'))
        }
      },
      {
        house: {
          hrid: '/house_rooms/gym',
          name: getOfficialName('houseRoomNames', '/house_rooms/gym', this.i18n.t('gym'))
        },
        combat: {
          key: 'melee',
          icon: 'melee',
          name: getOfficialName('skillNames', '/skills/melee', this.i18n.t('melee'))
        }
      }, {
        house: {
          hrid: '/house_rooms/archery_range',
          name: getOfficialName('houseRoomNames', '/house_rooms/archery_range', this.i18n.t('archeryRange'))
        },
        combat: {
          key: 'ranged',
          icon: 'ranged',
          name: getOfficialName('skillNames', '/skills/ranged', this.i18n.t('ranged'))
        }
      }, {
        house: {
          hrid: '/house_rooms/mystical_study',
          name: getOfficialName('houseRoomNames', '/house_rooms/mystical_study', this.i18n.t('mysticalStudy'))
        },
        combat: {
          key: 'magic',
          icon: 'magic',
          name: getOfficialName('skillNames', '/skills/magic', this.i18n.t('magic'))
        }
      }
    ];
    const renderLevel = (level, isHouse = false) => {
      if (level == null) return '<span class="mst-progression-level mst-unavailable-level">--</span>';
      if (isHouse && level <= 0) return `<span class="mst-progression-level">${this.i18n.t('notBuilt')}</span>`;
      const maxClass = isHouse && level === 8 ? ' mst-house-max-level' : '';
      return `<span class="mst-progression-level${maxClass}">Lv.${Math.floor(level)}</span>`;
    };
    const getHouseLevel = (hrid) => {
      if (availability.house === false) return null;
      const room = houseRoomMap?.[hrid];
      return Number(typeof room === 'object' ? room?.level || 0 : room || 0);
    };
    const getCombatLevel = (key) => {
      if (availability.combat === false || (key !== 'combat' && availability.combatSkills === false)) return null;
      return key === 'combat'
        ? this.calculateCombatLevel(characterObj)
        : this.CardDataAdapter.getSkillLevel(characterObj, key);
    };
    const cells = rows
      .map((row) => {
        const house = row.house;
        const houseCell = house.hrid
          ? `
  <div class="mst-progression-row mst-house-row">
    <div class="mst-progression-icon">${this.createSvgIcon(house.hrid)}</div>
    <span class="mst-progression-name">${house.name}</span>
    ${renderLevel(getHouseLevel(house.hrid), true)}
  </div>`
          : `
  <div class="mst-progression-row mst-house-row mst-house-summary-row" aria-label="${this.i18n.t('house')}">
    <div class="mst-progression-icon">${this.createSvgIcon(house.icon, house.type)}</div>
    <span class="mst-progression-name">${this.i18n.t('house')}</span>
  </div>`;
        const combat = row.combat;
        const combatCell = `
  <div class="mst-progression-row mst-combat-row">
    <div class="mst-progression-icon">${this.createSvgIcon(combat.icon, combat.type || 'skills')}</div>
    <span class="mst-progression-name">${combat.name}</span>
    ${renderLevel(getCombatLevel(combat.key))}
  </div>`;
        return combatCell + houseCell;
      })
      .join('');

    return `
  <div class="mst-progression-panel">
    <div class="mst-panel-title">${this.i18n.t('combatLevelsAndHouse')}</div>
    <div class="mst-progression-grid">
      ${cells}
    </div>
  </div>`;
  }
}

// character-card-renderer
export function createCharacterCardRenderer(deps) {
  const {ctx, state, CardDataAdapter, getEffectiveLayoutMode} = deps;
  const {TemplateRenderer, i18n} = ctx;
  const CardRenderer = {};

  const iconRenderer = new CharacterCardIconRenderer({ctx, state});
  const createSvgIcon = iconRenderer.createSvgIcon.bind(iconRenderer);
  const getAbilityDisplayNames = iconRenderer.getAbilityDisplayNames.bind(iconRenderer);
  const identityRenderer = new CharacterCardIdentityRenderer({ctx, state});
  const buildScoreRenderer = new CharacterCardBuildScoreRenderer({ctx, state});
  const equipmentRenderer = new CharacterCardEquipmentRenderer({ctx, createSvgIcon});
  const lifeRenderer = new CharacterCardLifeRenderer({ctx, CardDataAdapter, createSvgIcon});
  const skillRenderer = new CharacterCardSkillRenderer({ctx, state, createSvgIcon, getAbilityDisplayNames});
  const progressionRenderer = new CharacterCardProgressionRenderer({ctx, CardDataAdapter, createSvgIcon});

  CardRenderer.character = function (
    data,
    characterName,
    characterNameElement = null,
    isMyCharacter = false,
    options = {}
  ) {
    const characterObj = data.player || data;
    const availability = data.dataAvailability || {};
    const contentMode = [
      'combat', 'life', 'all'
    ].includes(options.contentMode) ? options.contentMode : state.cardContentMode;
    const showCombat = contentMode !== 'life';
    const showLife = contentMode !== 'combat';
    const equipmentPanel =
      availability.equipment === false ? '' : equipmentRenderer.generateEquipmentPanel(characterObj);
    const lifeToolsPanel =
      showLife && availability.equipment !== false ? lifeRenderer.generateLifeToolsPanel(data, characterObj) : '';
    const skillPanel =
      availability.abilities === false ? '' : skillRenderer.generateSkillPanel(data, isMyCharacter, options);
    const equipmentSkillsPanel =
      equipmentPanel || skillPanel
        ? TemplateRenderer.html`
  <div class="mst-equipment-skills-panel">
    <div class="mst-panel-title">${i18n.t('equipmentAndAbilities')}</div>
    ${equipmentPanel ? TemplateRenderer.raw(equipmentPanel) : TemplateRenderer.empty}
    ${skillPanel ? TemplateRenderer.raw(skillPanel) : TemplateRenderer.empty}
  </div>`
        : TemplateRenderer.empty;
    // uhtml 的同一插值位始终保持 unsafe 类型，避免切换时将 HTML 转义成文本。
    const lifeEquipmentPanel = TemplateRenderer.raw(lifeToolsPanel);
    const lifeProgressionPanel = TemplateRenderer.raw(
      showLife ? lifeRenderer.generateLifeProgressionPanel(data, characterObj, availability) : ''
    );
    const progressionPanel =
      !showCombat || (availability.combat === false && availability.house === false)
        ? TemplateRenderer.empty
        : TemplateRenderer.raw(progressionRenderer.generateProgressionPanel(data, characterObj, availability));

    const headerContent = identityRenderer.generateCharacterNameHeader(data, characterName, characterNameElement);
    const buildScoreKey = buildScoreRenderer.registerBuildScoreSource(data);

    const currentLayoutMode = options.layoutMode || getEffectiveLayoutMode();
    const layoutClass = `mst-layout-${currentLayoutMode}`;
    const cardClass = `mst-character-card ${layoutClass} mst-card-content-${contentMode}${options.teamMode ? ' mst-team-character-card' : ''}${data.limitedProfile ? ' mst-limited-profile' : ''}`;

    const cardTemplate = TemplateRenderer.html`
  <div id=${options.teamMode ? TemplateRenderer.empty : 'mst-character-card'} class=${cardClass}>
    <div class="mst-card-header">
      <div class="mst-card-header-identity">${TemplateRenderer.raw(headerContent)}</div>
      <span class="mst-card-build-score" data-build-score-key=${buildScoreKey} data-score-state="pending">
        <span class="mst-card-build-score-row" data-score-row="battle">
          <span class="mst-card-build-score-heading">
            <span class="mst-card-build-score-new" title=${i18n.t('newBuildScoreBadge')} hidden>✦</span>
            <span class="mst-card-build-score-label">${i18n.t('battleScore')}</span>
          </span>
          <span class="mst-card-build-score-value">${i18n.t('calculating')}</span>
        </span>
        <span class="mst-card-build-score-row" data-score-row="skilling">
          <span class="mst-card-build-score-heading">
            <span class="mst-card-build-score-new" title=${i18n.t('newBuildScoreBadge')} hidden>✦</span>
            <span class="mst-card-build-score-label">${i18n.t('skillingScore')}</span>
          </span>
          <span class="mst-card-build-score-value">${i18n.t('calculating')}</span>
        </span>
      </span>
    </div>
    <div class="mst-card-content">
      <div class="mst-card-main-equipment">${equipmentSkillsPanel}</div>
      <div class="mst-card-life-equipment">${lifeEquipmentPanel}</div>
      <div class="mst-card-life-progression">${lifeProgressionPanel}</div>
      <div class="mst-card-main-progression">${progressionPanel}</div>
      ${
        data.limitedProfile
          ? TemplateRenderer.html`<div class="mst-limited-profile-note">${i18n.t('limitedProfileNotice')}</div>`
          : TemplateRenderer.empty
      }
    </div>
    <div class="mst-card-timestamps">
      <span class="mst-card-data-time">${i18n.t('dataTimeLabel')}${buildScoreRenderer.formatCardTime(data.dataTimestamp)}</span>
    </div>
  </div>`;
    return options.teamMode
      ? cardTemplate
      : TemplateRenderer.html`<div class="mst-standalone-card-wrap">${cardTemplate}</div>`;
  };

  return {
    CardRenderer,
    createSvgIcon,
    getAbilityDisplayNames,
    registerBuildScoreSource: buildScoreRenderer.registerBuildScoreSource.bind(buildScoreRenderer),
    hydrateBuildScores: buildScoreRenderer.hydrateBuildScores.bind(buildScoreRenderer),
    formatCardTime: buildScoreRenderer.formatCardTime.bind(buildScoreRenderer),
    getCharacterCardContentSignature: buildScoreRenderer.getCharacterCardContentSignature.bind(buildScoreRenderer),
    updateCharacterCardDataTime: buildScoreRenderer.updateCharacterCardDataTime.bind(buildScoreRenderer),
    getLifeProfessionDefinitions: lifeRenderer.getLifeProfessionDefinitions.bind(lifeRenderer),
    generateLifeToolsPanel: lifeRenderer.generateLifeToolsPanel.bind(lifeRenderer),
    generateLifeProgressionPanel: lifeRenderer.generateLifeProgressionPanel.bind(lifeRenderer)
  };
}
