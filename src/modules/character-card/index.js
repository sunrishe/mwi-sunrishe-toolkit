import {StyleService} from '../../common/runtime.js';
import {createCharacterCardDataAdapter} from './data.js';
import {createCharacterCardRenderer} from './renderer.js';
import {createCharacterCardImageExporter} from './exporter.js';
import MST_CHARACTER_CARD_CSS from './styles.css';
import {
  CARD_BASE_WIDTH,
  CARD_PADDING,
  CARD_BORDER_WIDTH,
  CARD_COLUMN_GAP,
  CARD_CONTENT_WIDTH,
  CARD_DESKTOP_WIDTH,
  CARD_MAIN_PANEL_HEIGHT,
  CARD_LIFE_PANEL_HEIGHT,
  PARTY_BUTTONS_SELECTOR,
  PARTY_RIGHT_BUTTONS_SELECTOR,
  PARTY_NAME_SELECTOR
} from './constants.js';

// 名片尺寸由 JS 常量统一计算，CSS 只通过变量消费结果。
export function applyCharacterCardCssVariables() {
  const style = document.documentElement.style;
  style.setProperty('--mst-card-base-width', `${CARD_BASE_WIDTH}px`);
  style.setProperty('--mst-card-padding', `${CARD_PADDING}px`);
  style.setProperty('--mst-card-border-width', `${CARD_BORDER_WIDTH}px`);
  style.setProperty('--mst-card-column-gap', `${CARD_COLUMN_GAP}px`);
  style.setProperty('--mst-card-content-width', `${CARD_CONTENT_WIDTH}px`);
  style.setProperty('--mst-card-desktop-width', `${CARD_DESKTOP_WIDTH}px`);
  style.setProperty('--mst-card-main-panel-height', `${CARD_MAIN_PANEL_HEIGHT}px`);
  style.setProperty('--mst-card-life-panel-height', `${CARD_LIFE_PANEL_HEIGHT}px`);
}

// character-card-svg-tool
// 简化的SVG创建工具
export class CharacterCardSVGTool {
  static SpriteService = null;

  static configure(SpriteService) {
    this.SpriteService = SpriteService;
  }

  constructor() {
    this.isLoaded = true;
    this.spriteSheets = {...this.constructor.SpriteService.defaults};
  }

  async loadSpriteSheets() {
    this.refreshSpritePathsFromDOM();
    return this.isLoaded;
  }

  // 动态获取chat_icons_sprite路径
  getChatIconsSpritePath() {
    return this.constructor.SpriteService.get('chat_icons');
  }

  // 名片沿用统一 SpriteService，保留原接口以避免改动渲染逻辑。
  refreshSpritePathsFromDOM() {
    const previous = JSON.stringify(this.spriteSheets);
    this.constructor.SpriteService.refresh();
    Object.keys(this.spriteSheets).forEach((type) => {
      this.spriteSheets[type] = this.constructor.SpriteService.get(type === 'chatIcons' ? 'chat_icons' : type);
    });
    const updated = previous !== JSON.stringify(this.spriteSheets);
    return updated;
  }

  // 创建MWI风格的SVG图标 - 直接返回HTML字符串
  createSVGIcon(itemId, options = {}) {
    const {className = 'Icon_icon__2LtL_', title = itemId, type = 'items'} = options;
    const svgHref = `${this.spriteSheets[type]}#${itemId}`;

    return `<svg role="img" aria-label="${title}" class="${className}" width="100%" height="100%">
    <use href="${svgHref}"></use>
  </svg>`;
  }

  // 后备图标
  createFallbackIcon(itemId, className, title) {
    const text = itemId.length > 6 ? itemId.substring(0, 6) : itemId;
    return `<div class="${className}" title="${title}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#4a90e2;color:white;font-size:10px;border-radius:4px;">${text}</div>`;
  }
}

export class CharacterCardState {
  constructor(CharacterCardSVGTool) {
    this.svgTool = new CharacterCardSVGTool();
    this.observer = null;
    this.partyObserver = null;
    this.timer = null;
    this.loadoutCardHandler = null;
    this.profileSharedHandler = null;
    this.characterUpdatedHandler = null;
    this.customSkills = {selectedSkills: [], maxSkills: 5};
    this.layoutMode = {
      forcedMode: 'desktop',
      getCurrentMode() {
        return this.forcedMode;
      }
    };
    this.cardContentMode = 'all';
    this.activeCard = null;
    this.initialCard = null;
    this.teamCard = {members: [], teamName: '', refreshTimer: null};
    this.buildScore = {sequence: 0, sources: new Map()};
  }
}

export class CharacterCardDialogController {
  constructor(deps) {
    this.Notifier = deps.Notifier;
    this.state = deps.state;
    this.hydrateBuildScores = deps.hydrateBuildScores;
    this.getDefaultWidth = deps.getDefaultWidth;
  }

  getStandaloneCharacterCard() {
    return document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal) #mst-character-card');
  }

  open({title, html, width = this.getDefaultWidth(), team = false, didOpen, willClose}) {
    this.state.svgTool.refreshSpritePathsFromDOM();
    return this.Notifier.html({
      title,
      html,
      width,
      popupClass: 'mst-character-card-modal' + (team ? ' mst-team-card-modal' : ''),
      didOpen: (modal) => {
        didOpen?.(modal);
        this.hydrateBuildScores(modal);
      },
      willClose
    });
  }
}

export class CharacterCardLayoutController {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.constants = deps.constants;
    this.refreshTeamCard = deps.refreshTeamCard;
    this.refreshStandaloneCard = deps.refreshStandaloneCard;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.i18n = deps.ctx.i18n;
  }

  getEffectiveLayoutMode() {
    return this.state.layoutMode.getCurrentMode();
  }

  setCardLayout(layoutMode, contentMode) {
    this.state.layoutMode.forcedMode = layoutMode === 'mobile' ? 'mobile' : 'desktop';
    this.state.cardContentMode = [
      'combat', 'life', 'all'
    ].includes(contentMode) ? contentMode : 'all';
  }

  getCardLayoutValue() {
    return this.state.cardContentMode;
  }

  createCardLayoutSelectTemplate() {
    return this.TemplateRenderer.html`
  <label class="mst-card-column-toggle">
    <input class="mst-card-column-checkbox" type="checkbox" .checked=${this.getEffectiveLayoutMode() === 'desktop'}>
    <span>${this.i18n.t('twoColumns')}</span>
  </label>
  <select class="mst-card-layout-select" .value=${this.getCardLayoutValue()} aria-label=${this.i18n.t('cardLayout')}>
    <option value="combat">${this.i18n.t('combatLayout')}</option>
    <option value="life">${this.i18n.t('skillingLayout')}</option>
    <option value="all">${this.i18n.t('allCardContent')}</option>
  </select>`;
  }

  updateCardLayoutSelect(root = document) {
    root.querySelectorAll('.mst-card-layout-select').forEach((select) => {
      select.value = this.getCardLayoutValue();
    });
    root.querySelectorAll('.mst-card-column-checkbox').forEach((checkbox) => {
      checkbox.checked = this.getEffectiveLayoutMode() === 'desktop';
    });
  }

  bindCardLayoutSelect(modal) {
    const select = modal.querySelector('.mst-card-layout-select');
    const columnCheckbox = modal.querySelector('.mst-card-column-checkbox');
    if (!select || !columnCheckbox) return;
    select.value = this.getCardLayoutValue();
    columnCheckbox.checked = this.getEffectiveLayoutMode() === 'desktop';
    const refresh = () => {
      if (modal.classList.contains('mst-team-card-modal')) {
        this.refreshTeamCard(modal);
      } else {
        this.refreshStandaloneCard(modal);
      }
    };
    select.onchange = () => {
      this.setCardLayout(this.getEffectiveLayoutMode(), select.value);
      refresh();
    };
    columnCheckbox.onchange = () => {
      this.setCardLayout(columnCheckbox.checked ? 'desktop' : 'mobile', this.state.cardContentMode);
      refresh();
    };
  }

  updateModalLayoutClass(sourceModal = null) {
    const modalContent = (sourceModal || document).querySelector('.mst-modal-content');
    if (!modalContent) return;

    const currentMode = this.getEffectiveLayoutMode();
    const modal = modalContent.closest('.mst-character-card-modal');

    modalContent.classList.toggle('mst-desktop-layout', currentMode === 'desktop');
    modalContent.classList.toggle('mst-mobile-layout', currentMode === 'mobile');
    if (modal && !modal.classList.contains('mst-team-card-modal')) {
      modal.style.width = this.getCharacterDialogWidth(currentMode);
      modal.style.maxWidth = 'calc(100vw - 1rem)';
    }
  }

  getCharacterDialogWidth(layoutMode) {
    const {CARD_BASE_WIDTH, CARD_DESKTOP_WIDTH} = this.constants;
    const cardWidth = layoutMode === 'desktop' ? CARD_DESKTOP_WIDTH : CARD_BASE_WIDTH;
    // 额外空间包含弹窗内边距、边框及滚动条稳定占位，避免右侧边框被裁切。
    return `min(${cardWidth + 34}px, calc(100vw - 1rem))`;
  }

  refreshCardLayoutLanguage(modal) {
    const columnLabel = modal.querySelector('.mst-card-column-toggle span');
    if (columnLabel) columnLabel.textContent = this.i18n.t('twoColumns');
    const select = modal.querySelector('.mst-card-layout-select');
    if (!select) return;
    select.setAttribute('aria-label', this.i18n.t('cardLayout'));
    const labels = {
      combat: this.i18n.t('combatLayout'),
      life: this.i18n.t('skillingLayout'),
      all: this.i18n.t('allCardContent')
    };
    Array.from(select.options).forEach((option) => {
      if (labels[option.value]) option.textContent = labels[option.value];
    });
  }
}

export class CharacterCardMemberBuilder {
  constructor(deps) {
    this.CardDataAdapter = deps.CardDataAdapter;
    this.DataHub = deps.ctx.DataHub;
    this.GameUiAdapter = deps.ctx.GameUiAdapter;
    this.i18n = deps.ctx.i18n;
  }

  getTeamNameFromPage() {
    const nameEl = document.querySelector(PARTY_NAME_SELECTOR);
    return nameEl ? nameEl.textContent.trim() : this.i18n.t('partyFallback');
  }

  buildCharacterCardMember(characterID) {
    const id = String(characterID);
    const wsData = this.DataHub.characterData.raw;
    const myId = String(wsData?.character?.id ?? '');
    if (id === myId) {
      const name = wsData?.character?.name || wsData?.characterName || this.i18n.t('characterFallback');
      return {
        characterID: id,
        name,
        data: this.CardDataAdapter.fromCharacterData(wsData),
        isSelf: true,
        source: 'server'
      };
    }

    const storedProfile = this.DataHub.getProfile(id);
    if (storedProfile) {
      const data = this.CardDataAdapter.mergeProfile(storedProfile);
      if (data) {
        return {
          characterID: id,
          name: storedProfile.characterName || data.player?.name,
          data,
          isSelf: false,
          source: 'server'
        };
      }
    }

    const limitedData = this.CardDataAdapter.fromLimitedCharacter(id);
    if (limitedData) {
      return {
        characterID: id,
        name: limitedData.player?.name || this.i18n.t('unknownMember'),
        data: limitedData,
        isSelf: false,
        source: 'server'
      };
    }

    const name = this.i18n.t('unknownMember');
    return {
      characterID: id,
      name,
      data: {
        player: {name},
        abilities: [],
        characterSkills: [],
        houseRooms: {},
        characterHouseRoomMap: {},
        limitedProfile: true,
        dataAvailability: {equipment: false, combat: false, abilities: false, house: false}
      },
      isSelf: false,
      source: 'server'
    };
  }

  buildPartyCharacterDataList() {
    const wsData = this.DataHub.characterData.raw;
    if (!wsData?.partyInfo) {
      console.log('[队伍名片] 未检测到 partyInfo，无法构建队伍数据');
      return [];
    }
    const slotMap = wsData.partyInfo.partySlotMap || {};
    console.log('[队伍名片] 检测到队伍成员槽位:', Object.keys(slotMap).length);
    return Object.values(slotMap)
      .filter((member) => member?.characterID != null)
      .map((member) => this.buildCharacterCardMember(member.characterID));
  }

  createActiveCardFromCachedMember(member) {
    const selfNameElement = member.isSelf ? this.GameUiAdapter.query('characterName')?.outerHTML || null : null;
    return {
      data: member.data,
      name: member.name || member.data?.player?.name || this.i18n.t('characterFallback'),
      nameElement: selfNameElement,
      isMyCharacter: Boolean(member.isSelf),
      options: {},
      characterID: String(member.characterID || '')
    };
  }
}

export class CharacterCardTeamStorage {
  constructor(deps, memberBuilder) {
    this.state = deps.state;
    this.memberBuilder = memberBuilder;
    this.DataHub = deps.ctx.DataHub;
    this.STORAGE_KEYS = deps.ctx.STORAGE_KEYS;
  }

  getCachedMemberCharacterID(member) {
    if (member?.characterID != null) return String(member.characterID);
    if (member?.isSelf) return String(this.DataHub.characterData.raw?.character?.id ?? '');
    if (member?.source === 'manual') return '';
    const sharableMap = this.DataHub.characterData.raw?.partyInfo?.sharableCharacterMap || {};
    const matches = Object.entries(sharableMap).filter(
      ([
        , character
      ]) => character?.name === member?.name
    );
    return matches.length === 1 ? String(matches[0][0]) : '';
  }

  saveTeamCardToStorage(teamName, members) {
    try {
      // 角色详情由 profile 缓存和内存数据提供，这里只保存队伍组成与顺序。
      const compactMembers = members.map((member) => {
        const characterID = this.getCachedMemberCharacterID(member);
        if (!characterID || member?.source === 'manual') return member;
        return {
          characterID,
          name: member.name || '',
          isSelf: Boolean(member.isSelf),
          source: member.source || 'server'
        };
      });
      const data = {version: 2, teamName, members: compactMembers};
      localStorage.setItem(this.STORAGE_KEYS.TEAM_CARD, JSON.stringify(data));
      console.log('[队伍名片] 已保存队伍名片数据');
      return true;
    } catch (e) {
      console.warn('保存队伍名片失败', e);
      return false;
    }
  }

  loadTeamCardFromStorage() {
    try {
      const str = localStorage.getItem(this.STORAGE_KEYS.TEAM_CARD);
      if (!str) return null;
      const obj = JSON.parse(str);
      if (!obj || !Array.isArray(obj.members)) return null;
      const members = obj.members.map((member) => {
        if (member?.source === 'manual') return member;
        const characterID = this.getCachedMemberCharacterID(member);
        return characterID ? this.memberBuilder.buildCharacterCardMember(characterID) : member;
      });
      return {...obj, members};
    } catch (_e) {
      return null;
    }
  }

  refreshStoredTeamCard(characterID = '') {
    const cached = this.loadTeamCardFromStorage();
    if (!cached) return false;
    const targetId = characterID === '' ? '' : String(characterID);
    let changed = false;
    const members = cached.members.map((member) => {
      if (member?.source === 'manual') return member;
      const memberId = this.getCachedMemberCharacterID(member);
      if (!memberId || (targetId && memberId !== targetId)) return member;
      const refreshed = this.memberBuilder.buildCharacterCardMember(memberId);
      if (!refreshed) return member;
      const replacer = targetId ? undefined : (key, value) => (key === 'dataTimestamp' ? undefined : value);
      if (JSON.stringify(member, replacer) === JSON.stringify(refreshed, replacer)) return member;
      changed = true;
      return refreshed;
    });
    if (!changed) return false;
    this.saveTeamCardToStorage(cached.teamName, members);
    if (Array.isArray(this.state.teamCard.members)) {
      this.state.teamCard.members = this.state.teamCard.members.map((member) => {
        const memberId = this.getCachedMemberCharacterID(member);
        return memberId ? members.find((item) => String(item.characterID) === memberId) || member : member;
      });
    }
    return true;
  }
}

export class CharacterCardMemberCache {
  constructor(deps, memberBuilder, teamStorage) {
    this.state = deps.state;
    this.formatCardTime = deps.formatCardTime;
    this.memberBuilder = memberBuilder;
    this.teamStorage = teamStorage;
    this.DataHub = deps.ctx.DataHub;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.i18n = deps.ctx.i18n;
  }

  getCachedCharacterMembers() {
    const candidateIds = new Set(Object.keys(this.DataHub.characterData.profiles || {}));
    const selfId = this.DataHub.characterData.raw?.character?.id;
    if (selfId != null) candidateIds.add(String(selfId));

    return [
      ...candidateIds
    ]
      .flatMap((characterID) => {
        const id = String(characterID);
        if (id !== String(selfId ?? '') && !this.DataHub.getProfile(id)) return [];
        const member = this.memberBuilder.buildCharacterCardMember(id);
        if (!member?.data) return [];
        const profile = this.DataHub.getProfile(id);
        return [
          {
            ...member,
            characterID: id,
            cacheTimestamp:
              id === String(selfId ?? '')
                ? this.DataHub.characterData.updatedAt
                : Number(profile?.timestamp || member.data.dataTimestamp || 0)
          }
        ];
      })
      .sort((a, b) => Number(b.cacheTimestamp || 0) - Number(a.cacheTimestamp || 0));
  }

  getAddableCachedTeamMembers() {
    const existingIds = new Set(
      this.state.teamCard.members.map((member) => this.teamStorage.getCachedMemberCharacterID(member)).filter(Boolean)
    );
    return this.getCachedCharacterMembers().filter((member) => !existingIds.has(String(member.characterID)));
  }

  getCachedCharacterOptionsTemplate(candidates, emptyText) {
    const options = !candidates.length
      ? [
          this.TemplateRenderer.html`<div class="mst-team-cache-empty">${emptyText}</div>`
        ]
      : candidates.map((member) => {
          const name = member.name || this.i18n.t('characterFallback');
          return this.TemplateRenderer.html`
  <button type="button" class="mst-team-cache-option" role="option"
      data-character-id=${member.characterID}
      data-search-name=${String(name).toLocaleLowerCase()}
      aria-selected="false">
    <span class="mst-team-cache-option-name">${name}</span>
    <span class="mst-team-cache-option-meta">${this.formatCardTime(member.cacheTimestamp)}</span>
  </button>`;
        });
    return this.TemplateRenderer.html`${options}`;
  }
}

export class CharacterCardMemberService {
  constructor(deps) {
    this.memberBuilder = new CharacterCardMemberBuilder(deps);
    this.teamStorage = new CharacterCardTeamStorage(deps, this.memberBuilder);
    this.memberCache = new CharacterCardMemberCache(deps, this.memberBuilder, this.teamStorage);
  }

  getTeamNameFromPage() {
    return this.memberBuilder.getTeamNameFromPage();
  }

  buildCharacterCardMember(characterID) {
    return this.memberBuilder.buildCharacterCardMember(characterID);
  }

  buildPartyCharacterDataList() {
    return this.memberBuilder.buildPartyCharacterDataList();
  }

  createActiveCardFromCachedMember(member) {
    return this.memberBuilder.createActiveCardFromCachedMember(member);
  }

  getCachedMemberCharacterID(member) {
    return this.teamStorage.getCachedMemberCharacterID(member);
  }

  saveTeamCardToStorage(teamName, members) {
    return this.teamStorage.saveTeamCardToStorage(teamName, members);
  }

  loadTeamCardFromStorage() {
    return this.teamStorage.loadTeamCardFromStorage();
  }

  refreshStoredTeamCard(characterID = '') {
    return this.teamStorage.refreshStoredTeamCard(characterID);
  }

  getCachedCharacterMembers() {
    return this.memberCache.getCachedCharacterMembers();
  }

  getAddableCachedTeamMembers() {
    return this.memberCache.getAddableCachedTeamMembers();
  }

  getCachedCharacterOptionsTemplate(candidates, emptyText) {
    return this.memberCache.getCachedCharacterOptionsTemplate(candidates, emptyText);
  }
}

export class CharacterCardSkillSelector {
  constructor(deps) {
    this.state = deps.state;
    this.createSvgIcon = deps.createSvgIcon;
    this.getAbilityDisplayNames = deps.getAbilityDisplayNames;
    this.refreshCharacterCard = deps.refreshCharacterCard;
    this.DataHub = deps.ctx.DataHub;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.i18n = deps.ctx.i18n;
  }

  showSkillSelector(skillIndex) {
    if (!this.state.activeCard?.isMyCharacter) return;
    const allSkills = this.DataHub.characterData.raw?.characterAbilities || [];
    const availableSkills = allSkills
      .filter((ability) => ability.abilityHrid && ability.abilityHrid.startsWith('/abilities/'))
      .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));

    const selectedHrid = this.state.customSkills.selectedSkills[skillIndex]?.abilityHrid || '';
    const optionTemplates = availableSkills.map((skill) => {
      const names = this.getAbilityDisplayNames(skill.abilityHrid);
      const displayName = this.i18n.pick(names);
      const title = names.zh === names.en ? names.zh : `${names.zh} / ${names.en}`;
      const searchText = `${names.zh} ${names.en} ${skill.abilityHrid}`.toLowerCase();
      const selectedClass = selectedHrid === skill.abilityHrid ? ' mst-skill-option-selected' : '';
      return this.TemplateRenderer.html`
  <button type="button" class=${`mst-skill-option${selectedClass}`} data-skill-index=${skillIndex}
      data-ability-hrid=${skill.abilityHrid} data-level=${skill.level}
      data-search=${searchText} title=${title} aria-label=${title}>
    <span class="mst-skill-option-level">Lv.${skill.level}</span>
    <span class="mst-skill-option-icon">${this.TemplateRenderer.raw(this.createSvgIcon(skill.abilityHrid, 'abilities'))}</span>
    <strong class="mst-skill-option-name">${displayName}</strong>
  </button>`;
    });

    const modal = document.createElement('div');
    modal.className = 'mst-skill-selector-modal';
    this.TemplateRenderer.render(
      () => this.TemplateRenderer.html`
  <div class="mst-skill-selector-content">
    <div class="mst-skill-selector-header">
      <h3>${this.i18n.t('selectCardAbility')}</h3>
      <button type="button" class="mst-close-skill-selector" title="${this.i18n.t('close')}">&times;</button>
    </div>
    <input class="mst-skill-selector-search" type="search"
        placeholder="${this.i18n.t('searchCardAbilityNames')}"
        aria-label="${this.i18n.t('searchAbilities')}">
    <div class="mst-skill-selector-grid">
      <button type="button" class=${`mst-skill-option mst-empty-skill-option${selectedHrid ? '' : ' mst-skill-option-selected'}`}
          data-skill-index=${skillIndex} data-ability-hrid="" data-level="0"
          data-search="空 empty" title=${this.i18n.t('clearAbilitySlot')}>
        <span class="mst-skill-option-icon"><span class="mst-empty-skill-icon">-</span></span>
        <strong class="mst-skill-option-name">${this.i18n.t('emptySlot')}</strong>
      </button>
      ${optionTemplates}
    </div>
    <div class="mst-skill-selector-empty" hidden>${this.i18n.t('noMatchingAbilities')}</div>
  </div>
`,
      modal
    );

    modal.querySelector('.mst-close-skill-selector').onclick = () => {
      document.body.removeChild(modal);
    };
    modal.onclick = (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    };

    const skillOptions = modal.querySelectorAll('.mst-skill-option');
    skillOptions.forEach((option) => {
      option.addEventListener('click', () => {
        const skillIndex = parseInt(option.getAttribute('data-skill-index'));
        const abilityHrid = option.getAttribute('data-ability-hrid');
        const level = parseInt(option.getAttribute('data-level'));
        this.selectSkill(skillIndex, abilityHrid, level);
      });
    });

    const searchInput = modal.querySelector('.mst-skill-selector-search');
    const emptyState = modal.querySelector('.mst-skill-selector-empty');
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;
      skillOptions.forEach((option) => {
        const visible = !query || option.dataset.search.includes(query);
        option.hidden = !visible;
        if (visible) visibleCount++;
      });
      emptyState.hidden = visibleCount > 0;
    });

    document.body.appendChild(modal);
    searchInput.focus();
  }

  selectSkill(skillIndex, abilityHrid, level) {
    if (!this.state.activeCard?.isMyCharacter) return;
    if (abilityHrid === '') {
      delete this.state.customSkills.selectedSkills[skillIndex];
    } else {
      this.state.customSkills.selectedSkills[skillIndex] = {abilityHrid, level, slotNumber: skillIndex + 1};
    }

    this.refreshCharacterCard();

    const modal = document.querySelector('.mst-skill-selector-modal');
    if (modal) {
      document.body.removeChild(modal);
    }
  }

  refreshSkillSelectorLanguage() {
    const modal = document.querySelector('.mst-skill-selector-modal');
    if (!modal) return;
    const heading = modal.querySelector('.mst-skill-selector-header h3');
    if (heading) heading.textContent = this.i18n.t('selectCardAbility');
    const closeButton = modal.querySelector('.mst-close-skill-selector');
    if (closeButton) closeButton.title = this.i18n.t('close');
    const search = modal.querySelector('.mst-skill-selector-search');
    if (search) {
      search.placeholder = this.i18n.t('searchCardAbilityNames');
      search.setAttribute('aria-label', this.i18n.t('searchAbilities'));
    }
    const emptyOption = modal.querySelector('.mst-empty-skill-option');
    if (emptyOption) {
      emptyOption.title = this.i18n.t('clearAbilitySlot');
      const name = emptyOption.querySelector('.mst-skill-option-name');
      if (name) name.textContent = this.i18n.t('emptySlot');
    }
    const emptyState = modal.querySelector('.mst-skill-selector-empty');
    if (emptyState) emptyState.textContent = this.i18n.t('noMatchingAbilities');
    modal.querySelectorAll('.mst-skill-option[data-ability-hrid]:not(.mst-empty-skill-option)').forEach((option) => {
      const abilityHrid = option.dataset.abilityHrid;
      if (!abilityHrid) return;
      const names = this.getAbilityDisplayNames(abilityHrid);
      const displayName = this.i18n.pick(names);
      const title = names.zh === names.en ? names.zh : `${names.zh} / ${names.en}`;
      const name = option.querySelector('.mst-skill-option-name');
      if (name) name.textContent = displayName;
      option.title = title;
      option.setAttribute('aria-label', title);
    });
  }
}

export class CharacterCardStandaloneData {
  constructor(deps) {
    this.state = deps.state;
    this.DataHub = deps.ctx.DataHub;
    this.GameUiAdapter = deps.ctx.GameUiAdapter;
    this.i18n = deps.ctx.i18n;
  }

  getCurrentCharacterName() {
    const raw = this.DataHub.characterData.raw;
    return (
      raw?.character?.name ||
      raw?.characterName ||
      raw?.name ||
      this.GameUiAdapter.query('headerNameData')?.getAttribute('data-name') ||
      this.i18n.t('characterFallback')
    );
  }

  getLoadoutBannerText(loadout) {
    const typeName =
      loadout.actionTypeHrid === '/action_types/combat' ? this.i18n.t('combatLoadout') : this.i18n.t('skillingLoadout');
    return `${typeName}: ${loadout.name || ''}`;
  }

  setInitialActiveCard(card) {
    this.state.activeCard = card;
    this.state.initialCard = {...card};
  }

  isValidCharacterData(data) {
    if (!data || typeof data !== 'object') return false;
    if (
      data.player &&
      (data.player.equipment ||
        data.player.characterItems ||
        data.player.staminaLevel !== undefined ||
        data.player.name)
    ) {
      return true;
    }
    if (data.character && (data.characterSkills || data.characterItems)) return true;
    if (data.equipment || data.characterItems || data.characterSkills) return true;
    if (
      data.staminaLevel !== undefined ||
      data.intelligenceLevel !== undefined ||
      data.attackLevel !== undefined ||
      data.meleeLevel !== undefined ||
      data.powerLevel !== undefined
    ) {
      return true;
    }
    if (data.houseRooms || data.characterHouseRoomMap) return true;
    return Boolean(data.abilities && Array.isArray(data.abilities));
  }
}

export class CharacterCardStandalonePicker {
  constructor(deps) {
    this.state = deps.state;
    this.memberService = deps.memberService;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.i18n = deps.ctx.i18n;
  }

  refreshCharacterCardPicker(modal, refreshCharacterCard) {
    const input = modal.querySelector('.mst-character-member-search');
    const optionsContainer = modal.querySelector('.mst-character-member-options');
    if (!input || !optionsContainer) return;

    const candidates = this.memberService.getCachedCharacterMembers();
    const candidateMap = new Map(
      candidates.map((member) => [
        String(member.characterID), member
      ])
    );
    this.TemplateRenderer.render(
      () => this.memberService.getCachedCharacterOptionsTemplate(candidates, this.i18n.t('noCachedCharacters')),
      optionsContainer
    );
    input.value = this.state.activeCard?.name || '';
    input.disabled = candidates.length === 0;
    input.setAttribute('aria-expanded', 'false');
    optionsContainer.hidden = true;

    const getOptions = () => [
      ...optionsContainer.querySelectorAll('.mst-team-cache-option')
    ];
    const selectOption = (option) => {
      const member = candidateMap.get(option.dataset.characterId || '');
      if (!member) return;
      this.state.activeCard = this.memberService.createActiveCardFromCachedMember(member);
      input.value = this.state.activeCard.name;
      input.setAttribute('aria-expanded', 'false');
      optionsContainer.hidden = true;
      refreshCharacterCard();
    };
    const filterOptions = (showAll) => {
      const query = showAll ? '' : input.value.trim().toLocaleLowerCase();
      getOptions().forEach((option) => {
        option.hidden = Boolean(query) && !option.dataset.searchName.includes(query);
        option.setAttribute('aria-selected', 'false');
      });
      optionsContainer.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    input.onfocus = () => filterOptions(true);
    input.oninput = () => filterOptions(false);
    input.onkeydown = (event) => {
      if (event.key === 'Escape') {
        optionsContainer.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      if (event.key !== 'Enter') return;
      const firstVisible = getOptions().find((option) => !option.hidden);
      if (!firstVisible) return;
      event.preventDefault();
      selectOption(firstVisible);
    };
    optionsContainer.onclick = (event) => {
      const option = event.target.closest('.mst-team-cache-option');
      if (option) selectOption(option);
    };
  }
}

export class CharacterCardStandaloneToolbar {
  constructor(deps) {
    this.state = deps.state;
    this.CardImageExporter = deps.CardImageExporter;
    this.layoutController = deps.layoutController;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.i18n = deps.ctx.i18n;
  }

  createCharacterCardToolbarTemplate() {
    return this.TemplateRenderer.html`
  <div class="mst-download-section">
    <div class="mst-button-row mst-character-card-toolbar">
      <div class="mst-team-member-combobox">
        <input class="mst-team-member-search mst-character-member-search" type="search" role="combobox"
  autocomplete="off" aria-controls="mst-character-member-options" aria-expanded="false"
  placeholder=${this.i18n.t('searchCachedCharacters')}>
        <div id="mst-character-member-options"
  class="mst-team-member-options mst-character-member-options" role="listbox" hidden></div>
      </div>
      ${this.layoutController.createCardLayoutSelectTemplate()}
      <button type="button" class="mst-reset-character-card-btn">${this.i18n.t('resetCharacterData')}</button>
      <button type="button" class="mst-download-card-btn">${this.i18n.t('downloadCard')}</button>
      <button type="button" class="mst-copy-card-btn">${this.i18n.t('copyCard')}</button>
    </div>
    <div class="mst-skill-hint" hidden>
      <span>${this.i18n.t('editAbilityHint')}</span>
    </div>
  </div>`;
  }

  updateStandaloneCharacterControls(modal) {
    const skillHint = modal.querySelector('.mst-skill-hint');
    if (skillHint) skillHint.hidden = !this.state.activeCard?.isMyCharacter;
  }

  bindStandaloneCharacterCardControls(modal, handlers) {
    const downloadButton = modal.querySelector('.mst-download-card-btn');
    const copyButton = modal.querySelector('.mst-copy-card-btn');
    const resetButton = modal.querySelector('.mst-reset-character-card-btn');
    if (downloadButton) downloadButton.onclick = this.CardImageExporter.downloadCharacter;
    if (copyButton) copyButton.onclick = this.CardImageExporter.copyCharacter;
    this.layoutController.bindCardLayoutSelect(modal);
    if (resetButton) {
      resetButton.onclick = () => {
        if (!this.state.initialCard) return;
        this.state.activeCard = {...this.state.initialCard};
        handlers.refreshCharacterCard();
        const input = modal.querySelector('.mst-character-member-search');
        if (input) input.value = this.state.activeCard.name;
      };
    }
    handlers.refreshCharacterCardPicker(modal);
    this.updateStandaloneCharacterControls(modal);
    this.layoutController.updateCardLayoutSelect(modal);

    if (!modal.dataset.characterPickerDismissBound) {
      modal.dataset.characterPickerDismissBound = 'true';
      modal.addEventListener('click', (event) => {
        if (event.target.closest('.mst-team-member-combobox')) return;
        const options = modal.querySelector('.mst-character-member-options');
        const input = modal.querySelector('.mst-character-member-search');
        if (options) options.hidden = true;
        if (input) input.setAttribute('aria-expanded', 'false');
      });
    }
  }
}

export class CharacterCardStandaloneRefresh {
  constructor(deps) {
    this.state = deps.state;
    this.CardRenderer = deps.CardRenderer;
    this.layoutController = deps.layoutController;
    this.skillSelector = deps.skillSelector;
    this.hydrateBuildScores = deps.hydrateBuildScores;
    this.updateCharacterCardDataTime = deps.updateCharacterCardDataTime;
    this.updateStandaloneCharacterControls = deps.updateStandaloneCharacterControls;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
  }

  refreshCharacterCard(sourceModal = null) {
    const modal = sourceModal || document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal)');
    const activeCard = this.state.activeCard;
    if (!modal || !activeCard) return;

    const cardHost = modal.querySelector('.mst-standalone-card-host');
    if (!cardHost) return;
    this.TemplateRenderer.render(
      () =>
        this.CardRenderer.character(
          activeCard.data,
          activeCard.name,
          activeCard.nameElement,
          activeCard.isMyCharacter,
          activeCard.options
        ),
      cardHost
    );
    this.updateCharacterCardDataTime(activeCard.data?.dataTimestamp, modal);

    const newCharacterCard = modal.querySelector('#mst-character-card');
    this.hydrateBuildScores(modal);
    if (activeCard.isMyCharacter && newCharacterCard) {
      const skillSlots = newCharacterCard.querySelectorAll('.mst-skill-slot, .mst-empty-skill-slot');
      skillSlots.forEach((slot) => {
        slot.addEventListener(
          'click',
          function () {
            const skillIndex = parseInt(this.getAttribute('data-skill-index'));
            this.skillSelector.showSkillSelector(skillIndex);
          }.bind(this)
        );
      });
    }
    this.updateStandaloneCharacterControls(modal);
    this.layoutController.updateCardLayoutSelect(modal);
    this.layoutController.updateModalLayoutClass(modal);
  }
}

export class CharacterCardStandaloneDialogs {
  constructor(deps) {
    this.state = deps.state;
    this.CardDataAdapter = deps.CardDataAdapter;
    this.CardImageExporter = deps.CardImageExporter;
    this.dialogController = deps.dialogController;
    this.layoutController = deps.layoutController;
    this.dataController = deps.dataController;
    this.createCharacterCardToolbarTemplate = deps.createCharacterCardToolbarTemplate;
    this.bindStandaloneCharacterCardControls = deps.bindStandaloneCharacterCardControls;
    this.refreshCharacterCard = deps.refreshCharacterCard;
    this.setInitialActiveCard = deps.setInitialActiveCard;
    this.isValidCharacterData = deps.isValidCharacterData;
    this.DataHub = deps.ctx.DataHub;
    this.GameUiAdapter = deps.ctx.GameUiAdapter;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.Notifier = deps.ctx.Notifier;
    this.i18n = deps.ctx.i18n;
  }

  async showCharacterCard() {
    const {
      DataHub,
      GameUiAdapter,
      TemplateRenderer,
      Notifier,
      i18n,
      CardDataAdapter,
      dialogController,
      layoutController,
      createCharacterCardToolbarTemplate,
      bindStandaloneCharacterCardControls,
      refreshCharacterCard,
      setInitialActiveCard
    } = this;
    try {
      let characterData = null;
      const visibleNames = GameUiAdapter.queryAll('characterName');
      const visibleProfileName = visibleNames.length
        ? visibleNames[visibleNames.length - 1].querySelector('[class*="CharacterName_name"]')?.textContent?.trim()
        : '';
      const storedProfile = visibleProfileName ? DataHub.findProfileByName(visibleProfileName) : null;
      if (storedProfile) characterData = CardDataAdapter.mergeProfile(storedProfile);

      if (!characterData) {
        Notifier.alert(i18n.t('profileDataUnavailable'));
        return;
      }

      const characterName = characterData.player?.name || characterData.character?.name || i18n.t('characterFallback');
      const characterNameDivs = GameUiAdapter.queryAll('characterName');
      const characterNameElement = characterNameDivs.length
        ? characterNameDivs[characterNameDivs.length - 1].outerHTML
        : null;

      layoutController.setCardLayout('desktop', 'all');
      setInitialActiveCard({
        data: characterData,
        name: characterName,
        nameElement: characterNameElement,
        isMyCharacter: false,
        options: {},
        characterID: storedProfile?.characterID == null ? '' : String(storedProfile.characterID)
      });

      const modalTemplate = () => TemplateRenderer.html`
  <div class="mst-modal-content">
    ${createCharacterCardToolbarTemplate()}
    <div class="mst-standalone-card-host"></div>
  </div>`;
      dialogController.open({
        title: i18n.t('characterCard'),
        html: modalTemplate,
        didOpen: (modal) => {
          bindStandaloneCharacterCardControls(modal);
          refreshCharacterCard(modal);
          layoutController.updateModalLayoutClass();
        }
      });
    } catch (error) {
      console.error('生成角色名片失败:', error);
      Notifier.alert(i18n.t('generateCharacterCardFailed', error.message));
    }
  }

  async showMyCharacterCard() {
    const {
      state,
      DataHub,
      GameUiAdapter,
      TemplateRenderer,
      Notifier,
      i18n,
      CardDataAdapter,
      dialogController,
      layoutController,
      createCharacterCardToolbarTemplate,
      bindStandaloneCharacterCardControls,
      refreshCharacterCard,
      setInitialActiveCard,
      isValidCharacterData
    } = this;
    try {
      state.customSkills.selectedSkills = [];
      if (!DataHub.characterData.raw) {
        Notifier.alert(i18n.t('noCurrentCharacterData'));
        return;
      }

      const parsedData = DataHub.characterData.raw;
      if (parsedData?.type !== 'init_character_data') {
        Notifier.alert(i18n.t('invalidWebSocketData'));
        return;
      }

      const characterData = CardDataAdapter.fromCharacterData(parsedData);
      if (!isValidCharacterData(characterData)) {
        Notifier.alert(i18n.t('invalidCharacterData'));
        return;
      }

      const characterName = characterData.player?.name || characterData.character?.name || i18n.t('characterFallback');
      const characterNameDivs = GameUiAdapter.queryAll('characterName');
      const characterNameElement = characterNameDivs.length ? characterNameDivs[0].outerHTML : null;

      layoutController.setCardLayout('desktop', 'all');
      setInitialActiveCard({
        data: characterData,
        name: characterName,
        nameElement: characterNameElement,
        isMyCharacter: true,
        options: {},
        characterID: String(parsedData.character?.id ?? '')
      });

      const modalTemplate = () => TemplateRenderer.html`
  <div class="mst-modal-content">
    ${createCharacterCardToolbarTemplate()}
    <div class="mst-standalone-card-host"></div>
  </div>`;
      dialogController.open({
        title: i18n.t('characterCard'),
        html: modalTemplate,
        didOpen: (modal) => {
          bindStandaloneCharacterCardControls(modal);
          refreshCharacterCard(modal);
          layoutController.updateModalLayoutClass();
        }
      });
    } catch (error) {
      console.error('生成我的角色名片失败:', error);
      Notifier.alert(i18n.t('generateMyCharacterCardFailed', error.message));
    }
  }

  showLoadoutCharacterCard(event) {
    const {
      state,
      DataHub,
      GameUiAdapter,
      TemplateRenderer,
      CardDataAdapter,
      CardImageExporter,
      dialogController,
      layoutController,
      dataController,
      refreshCharacterCard,
      i18n,
      Notifier
    } = this;
    const loadout = event?.detail?.loadout;
    const characterData = CardDataAdapter.fromLoadout(loadout);
    if (!characterData) {
      console.warn('[MST] 配装名片数据转换失败:', {
        location: window.location.href,
        eventDetailKeys: Object.keys(event?.detail || {}).sort(),
        hasLoadout: Boolean(loadout),
        loadoutKeys: Object.keys(loadout || {}).sort(),
        loadoutName: loadout?.name || '',
        actionTypeHrid: loadout?.actionTypeHrid || '',
        wearableCount: Object.keys(loadout?.wearableMap || {}).length,
        foodCount: loadout?.foodItemHrids?.length || 0,
        drinkCount: loadout?.drinkItemHrids?.length || 0
      });
      Notifier.toast(i18n.t('loadoutNotFound'), 'error');
      return;
    }
    const characterName = characterData.player?.name || dataController.getCurrentCharacterName();
    const characterNameElement = GameUiAdapter.query('characterName')?.outerHTML || null;
    const isCombatLoadout = loadout.actionTypeHrid === '/action_types/combat';
    layoutController.setCardLayout('desktop', isCombatLoadout ? 'combat' : 'life');
    state.activeCard = {
      data: characterData,
      name: characterName,
      nameElement: characterNameElement,
      isMyCharacter: false,
      options: {loadoutCard: true, loadout},
      characterID: String(DataHub.characterData.raw?.character?.id ?? '')
    };
    const modalTemplate = () => TemplateRenderer.html`
  <div class="mst-modal-content">
    <div class="mst-instruction-banner">${dataController.getLoadoutBannerText(loadout)}</div>
    <div class="mst-download-section">
      <div class="mst-button-row">
        ${layoutController.createCardLayoutSelectTemplate()}
        <button type="button" class="mst-download-card-btn">${i18n.t('downloadCard')}</button>
        <button type="button" class="mst-copy-card-btn">${i18n.t('copyCard')}</button>
      </div>
    </div>
    <div class="mst-standalone-card-host"></div>
  </div>`;
    dialogController.open({
      title: i18n.t('loadoutCharacterCard'),
      html: modalTemplate,
      didOpen: (modal) => {
        modal.querySelector('.mst-download-card-btn').onclick = CardImageExporter.downloadCharacter;
        modal.querySelector('.mst-copy-card-btn').onclick = CardImageExporter.copyCharacter;
        layoutController.bindCardLayoutSelect(modal);
        refreshCharacterCard(modal);
        layoutController.updateCardLayoutSelect(modal);
        layoutController.updateModalLayoutClass(modal);
      }
    });
  }
}

export class CharacterCardStandaloneController {
  constructor(deps) {
    this.dataController = new CharacterCardStandaloneData(deps);
    this.picker = new CharacterCardStandalonePicker(deps);
    this.toolbar = new CharacterCardStandaloneToolbar(deps);
    this.refreshController = new CharacterCardStandaloneRefresh({
      ...deps,
      updateStandaloneCharacterControls: this.updateStandaloneCharacterControls.bind(this)
    });
    this.dialogs = new CharacterCardStandaloneDialogs({
      ...deps,
      dataController: this.dataController,
      createCharacterCardToolbarTemplate: this.createCharacterCardToolbarTemplate.bind(this),
      bindStandaloneCharacterCardControls: this.bindStandaloneCharacterCardControls.bind(this),
      refreshCharacterCard: this.refreshCharacterCard.bind(this),
      setInitialActiveCard: this.setInitialActiveCard.bind(this),
      isValidCharacterData: this.isValidCharacterData.bind(this)
    });
  }

  getLoadoutBannerText(loadout) {
    return this.dataController.getLoadoutBannerText(loadout);
  }

  refreshCharacterCardPicker(modal) {
    return this.picker.refreshCharacterCardPicker(modal, this.refreshCharacterCard.bind(this));
  }

  refreshCharacterCard(sourceModal = null) {
    return this.refreshController.refreshCharacterCard(sourceModal);
  }

  createCharacterCardToolbarTemplate() {
    return this.toolbar.createCharacterCardToolbarTemplate();
  }

  updateStandaloneCharacterControls(modal) {
    return this.toolbar.updateStandaloneCharacterControls(modal);
  }

  bindStandaloneCharacterCardControls(modal) {
    return this.toolbar.bindStandaloneCharacterCardControls(modal, {
      refreshCharacterCard: this.refreshCharacterCard.bind(this),
      refreshCharacterCardPicker: this.refreshCharacterCardPicker.bind(this)
    });
  }

  setInitialActiveCard(card) {
    return this.dataController.setInitialActiveCard(card);
  }

  isValidCharacterData(data) {
    return this.dataController.isValidCharacterData(data);
  }

  showCharacterCard() {
    return this.dialogs.showCharacterCard();
  }

  showMyCharacterCard() {
    return this.dialogs.showMyCharacterCard();
  }

  showLoadoutCharacterCard(event) {
    return this.dialogs.showLoadoutCharacterCard(event);
  }
}

export class CharacterCardTeamView {
  constructor(deps) {
    Object.assign(this, deps);
    this.CARD_BASE_WIDTH = deps.constants.CARD_BASE_WIDTH;
    this.CARD_DESKTOP_WIDTH = deps.constants.CARD_DESKTOP_WIDTH;
  }

  adjustTeamCardsLayout() {
    try {
      const container = document.querySelector('.mst-team-cards-container');
      if (!container) return;

      setTimeout(() => {
        const containerWidth = container.clientWidth;
        const scrollWidth = container.scrollWidth;

        if (scrollWidth > containerWidth) {
          container.classList.add('mst-overflow-mode');
        } else {
          container.classList.remove('mst-overflow-mode');
        }
      }, 10);
    } catch (_e) {
      /* ignore */
    }
  }

  renderTeamCardsTemplate(members) {
    const {TemplateRenderer, i18n, CardRenderer, layoutController} = this;
    const cards = !members.length
      ? [
          TemplateRenderer.html`
  <div class="mst-empty-team-placeholder">
    <div class="mst-empty-icon">👥</div>
    <div class="mst-empty-title">${i18n.t('emptyParty')}</div>
    <div class="mst-empty-subtitle">${i18n.t('emptyPartyHint')}</div>
  </div>`
        ]
      : members.map((member, index) => {
          const name = member.name || i18n.t('characterFallback');
          const cardTemplate = CardRenderer.character(member.data, name, null, false, {
            teamMode: true,
            layoutMode: layoutController.getEffectiveLayoutMode()
          });
          return TemplateRenderer.html`
  <div class="mst-team-card-wrap" data-index=${index}>
    <button type="button" class="mst-team-card-delete" aria-label="${i18n.t('removeCharacter')}">&times;</button>
    <div class="mst-team-mode">${cardTemplate}</div>
  </div>`;
        });
    return TemplateRenderer.html`${cards}`;
  }

  getTeamDialogWidth(memberCount) {
    const count = Math.max(1, memberCount);
    const cardWidth =
      this.layoutController.getEffectiveLayoutMode() === 'desktop' ? this.CARD_DESKTOP_WIDTH : this.CARD_BASE_WIDTH;
    const contentWidth = count * cardWidth + Math.max(0, count - 1) * 6;
    // 弹窗自身边距合计占用 36px，mst-modal-content 不再重复增加内边距。
    return `min(${contentWidth + 36}px, calc(100vw - 1rem))`;
  }

  renderTeamCardDialog(modal) {
    const {state, TemplateRenderer, layoutController, hydrateBuildScores, bindTeamCardInteractions} = this;
    const container = modal.querySelector('#mst-team-character-card');
    if (!container) return;
    TemplateRenderer.render(() => this.renderTeamCardsTemplate(state.teamCard.members), container);
    container.classList.toggle('mst-team-layout-desktop', layoutController.getEffectiveLayoutMode() === 'desktop');
    modal.style.width = this.getTeamDialogWidth(state.teamCard.members.length);
    modal.style.maxWidth = 'calc(100vw - 1rem)';
    bindTeamCardInteractions(modal);
    hydrateBuildScores(modal);
    layoutController.updateCardLayoutSelect(modal);
    this.adjustTeamCardsLayout();
  }
}

export class CharacterCardTeamController {
  constructor(deps) {
    this.ctx = deps.ctx;
    this.state = deps.state;
    this.CardRenderer = deps.CardRenderer;
    this.CardImageExporter = deps.CardImageExporter;
    this.dialogController = deps.dialogController;
    this.layoutController = deps.layoutController;
    this.memberService = deps.memberService;
    this.hydrateBuildScores = deps.hydrateBuildScores;
    this.showToastNotice = deps.showToastNotice;
    this.constants = deps.constants;
    this.TemplateRenderer = deps.ctx.TemplateRenderer;
    this.Notifier = deps.ctx.Notifier;
    this.i18n = deps.ctx.i18n;

    this.teamView = new CharacterCardTeamView({
      state: this.state,
      TemplateRenderer: this.TemplateRenderer,
      i18n: this.i18n,
      CardRenderer: this.CardRenderer,
      layoutController: this.layoutController,
      hydrateBuildScores: this.hydrateBuildScores,
      constants: this.constants,
      bindTeamCardInteractions: this.bindTeamCardInteractions.bind(this)
    });
  }

  refreshTeamMemberPicker(modal) {
    const {state, TemplateRenderer, i18n, memberService, showToastNotice} = this;
    const input = modal.querySelector('.mst-team-member-search');
    const optionsContainer = modal.querySelector('.mst-team-member-options');
    if (!input || !optionsContainer) return;

    const candidates = memberService.getAddableCachedTeamMembers();
    const candidateMap = new Map(
      candidates.map((member) => [
        String(member.characterID), member
      ])
    );
    TemplateRenderer.render(
      () => memberService.getCachedCharacterOptionsTemplate(candidates, i18n.t('noCachedCharactersToAdd')),
      optionsContainer
    );

    input.value = '';
    input.disabled = state.teamCard.members.length >= 5 || candidates.length === 0;
    optionsContainer.hidden = true;

    const getOptions = () => [
      ...optionsContainer.querySelectorAll('.mst-team-cache-option')
    ];
    const selectOption = (option) => {
      if (state.teamCard.members.length >= 5) {
        showToastNotice(i18n.t('partyCardLimit'), 'warning');
        return;
      }
      const member = candidateMap.get(option.dataset.characterId || '');
      if (!member) return;
      state.teamCard.members.push(member);
      memberService.saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
      this.renderTeamCardDialog(modal);
      showToastNotice(i18n.t('characterAdded'), 'success');
    };
    const filterOptions = () => {
      const query = input.value.trim().toLocaleLowerCase();
      getOptions().forEach((option) => {
        option.hidden = Boolean(query) && !option.dataset.searchName.includes(query);
        option.setAttribute('aria-selected', 'false');
      });
      optionsContainer.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    input.onfocus = filterOptions;
    input.oninput = filterOptions;
    input.onkeydown = (event) => {
      if (event.key === 'Escape') {
        optionsContainer.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      if (event.key !== 'Enter') return;
      const firstVisible = getOptions().find((option) => !option.hidden);
      if (!firstVisible) return;
      event.preventDefault();
      selectOption(firstVisible);
    };
    optionsContainer.onclick = (event) => {
      const option = event.target.closest('.mst-team-cache-option');
      if (option) selectOption(option);
    };
  }

  bindTeamCardInteractions(modal) {
    const {state, CardImageExporter, layoutController, memberService, showToastNotice, i18n} = this;
    const container = modal.querySelector('#mst-team-character-card');
    if (!container) return;
    this.refreshTeamMemberPicker(modal);

    const downloadButton = modal.querySelector('.mst-download-team-card-btn');
    if (downloadButton) downloadButton.onclick = CardImageExporter.downloadTeam;
    const copyButton = modal.querySelector('.mst-copy-team-card-btn');
    if (copyButton) copyButton.onclick = CardImageExporter.copyTeam;
    layoutController.bindCardLayoutSelect(modal);
    const resetButton = modal.querySelector('.mst-reset-team-card-btn');
    if (resetButton) {
      resetButton.onclick = () => {
        state.teamCard.members = memberService.buildPartyCharacterDataList();
        state.teamCard.teamName = memberService.getTeamNameFromPage();
        memberService.saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
        this.teamView.renderTeamCardDialog(modal);
        showToastNotice(i18n.t('partyDataRestored'), 'success');
      };
    }

    if (!modal.dataset.teamPickerDismissBound) {
      modal.dataset.teamPickerDismissBound = 'true';
      modal.addEventListener('click', (event) => {
        if (event.target.closest('.mst-team-member-combobox')) return;
        const options = modal.querySelector('.mst-team-member-options');
        const input = modal.querySelector('.mst-team-member-search');
        if (options) options.hidden = true;
        if (input) input.setAttribute('aria-expanded', 'false');
      });
    }

    this.bindTeamCardListInteractions(modal, container);
  }

  bindTeamCardListInteractions(modal, container) {
    const {state, i18n, memberService} = this;
    container.querySelectorAll('.mst-team-card-wrap').forEach((wrap) => {
      const index = Number(wrap.dataset.index);
      const member = state.teamCard.members[index];
      const deleteButton = wrap.querySelector('.mst-team-card-delete');
      if (deleteButton) {
        deleteButton.title = i18n.t(member?.isSelf ? 'removeSelf' : 'removeCharacter');
        deleteButton.onclick = (event) => {
          event.stopPropagation();
          state.teamCard.members.splice(index, 1);
          memberService.saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
          this.renderTeamCardDialog(modal);
        };
      }

      const header = wrap.querySelector('.mst-card-header');
      if (!header) return;
      header.draggable = true;
      header.title = i18n.t('dragToReorderCards');
      header.addEventListener('dragstart', (event) => {
        wrap.classList.add('mst-character-card-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
      });
      header.addEventListener('dragend', () => wrap.classList.remove('mst-character-card-dragging'));
    });

    container.ondragover = (event) => {
      if (!container.querySelector('.mst-team-card-wrap.mst-character-card-dragging')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };
    container.ondrop = (event) => {
      const dragging = container.querySelector('.mst-team-card-wrap.mst-character-card-dragging');
      const target = event.target.closest('.mst-team-card-wrap');
      if (!dragging || !target || dragging === target) return;
      event.preventDefault();
      const from = Number(dragging.dataset.index);
      const targetIndex = Number(target.dataset.index);
      const insertAfter =
        event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2;
      let to = targetIndex + (insertAfter ? 1 : 0);
      const [
        member
      ] = state.teamCard.members.splice(from, 1);
      if (from < to) to--;
      if (from === to) {
        state.teamCard.members.splice(from, 0, member);
        dragging.classList.remove('mst-character-card-dragging');
        return;
      }
      state.teamCard.members.splice(to, 0, member);
      memberService.saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
      const scrollLeft = container.scrollLeft;
      this.renderTeamCardDialog(modal);
      const restoreScroll = () => {
        const refreshedContainer = modal.querySelector('#mst-team-character-card');
        if (refreshedContainer) refreshedContainer.scrollLeft = scrollLeft;
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(restoreScroll);
      else setTimeout(restoreScroll, 0);
    };
  }

  showPartyCharacterCard(options = {}) {
    const {state, TemplateRenderer, Notifier, i18n, dialogController, layoutController, memberService, teamView} = this;
    try {
      layoutController.setCardLayout('mobile', 'combat');
      const {forceState = false} = options;
      let teamName = memberService.getTeamNameFromPage();
      console.log(`[队伍名片] 队伍名称: ${teamName}`);
      let members;
      if (forceState && state.teamCard.members !== undefined) {
        members = state.teamCard.members;
        teamName = state.teamCard.teamName || teamName;
      } else {
        const cached = memberService.loadTeamCardFromStorage();
        if (cached && cached.members !== undefined) {
          teamName = cached.teamName || teamName;
          members = cached.members;
          console.log('[队伍名片] 已从缓存加载队伍数据');
        } else if (Array.isArray(state.teamCard.members) && state.teamCard.members.length > 0) {
          members = state.teamCard.members;
          teamName = state.teamCard.teamName || teamName;
        } else {
          members = memberService.buildPartyCharacterDataList();
        }
      }
      state.teamCard.members = members || [];
      state.teamCard.teamName = teamName;

      const modalTemplate = () => TemplateRenderer.html`
  <div class="mst-modal-content">
    <div class="mst-team-toolbar">
      <div class="mst-team-member-combobox">
        <input class="mst-team-member-search" type="search" role="combobox" autocomplete="off"
  aria-controls="mst-team-member-options" aria-expanded="false"
  placeholder="${i18n.t('searchCachedCharacters')}">
        <div id="mst-team-member-options" class="mst-team-member-options" role="listbox" hidden></div>
      </div>
      ${layoutController.createCardLayoutSelectTemplate()}
      <button type="button" class="mst-reset-team-card-btn">${i18n.t('resetPartyData')}</button>
      <button type="button" class="mst-download-team-card-btn">${i18n.t('downloadCard')}</button>
      <button type="button" class="mst-copy-team-card-btn">${i18n.t('copyCard')}</button>
    </div>
    <div class="mst-team-hint">${i18n.t('latestProfileHint')}</div>
    <div id="mst-team-character-card" class="mst-team-cards-container"></div>
  </div>`;
      let onResize = null;
      dialogController.open({
        title: i18n.t('partyCard'),
        html: modalTemplate,
        width: teamView.getTeamDialogWidth(state.teamCard.members.length),
        team: true,
        didOpen: (modal) => {
          teamView.renderTeamCardDialog(modal);

          let resizeTimer;
          onResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              teamView.adjustTeamCardsLayout();
            }, 50);
          };
          window.addEventListener('resize', onResize);
          teamView.adjustTeamCardsLayout();
        },
        willClose: () => {
          if (onResize) window.removeEventListener('resize', onResize);
        }
      });
    } catch (e) {
      console.error('生成队伍名片失败:', e);
      Notifier.alert(i18n.t('showPartyCardFailed'));
    }
  }

  renderTeamCardDialog(modal) {
    return this.teamView.renderTeamCardDialog(modal);
  }
}

export class CharacterCardEntryController {
  constructor(deps) {
    this.state = deps.state;
    this.showCharacterCard = deps.showCharacterCard;
    this.showMyCharacterCard = deps.showMyCharacterCard;
    this.showPartyCharacterCard = deps.showPartyCharacterCard;
    this.GameUiAdapter = deps.ctx.GameUiAdapter;
    this.i18n = deps.ctx.i18n;
    this.utils = deps.ctx.utils;
  }

  setTextIfChanged(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  bindToolkitButton(button) {
    if (button.dataset.mstToolkitBound) return;
    button.dataset.mstToolkitBound = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('mst:toolkit:open', {detail: {trigger: event.currentTarget}}));
    });
  }

  updateToolkitButton(button) {
    this.setTextIfChanged(button, this.i18n.t('toolkitShort'));
    this.setAttributeIfChanged(button, 'title', this.i18n.t('toolkitTitle'));
    this.bindToolkitButton(button);
  }

  addCharacterCardButton() {
    const selectedElement = document.querySelector('[class*="SharableProfile_overviewTab"]');
    if (!selectedElement) return false;

    let buttonContainer = Array.from(selectedElement.children).find((element) =>
      element.classList.contains('mst-character-card-button-container')
    );
    let changed = false;

    if (!buttonContainer) {
      const button = document.createElement('button');
      button.className = 'mst-character-card-btn';
      button.type = 'button';
      button.textContent = this.i18n.t('viewCharacterCard');
      button.onclick = () => {
        this.showCharacterCard();
        return false;
      };

      buttonContainer = document.createElement('div');
      buttonContainer.className = 'mst-character-card-button-container';
      buttonContainer.style.textAlign = 'center';
      buttonContainer.appendChild(button);
      changed = true;
    }

    // 固定在游戏原生资料统计区之后，确保位于其他插件追加内容之前。
    const statsSection = Array.from(selectedElement.children).find((element) =>
      Array.from(element.classList).some((className) => className.startsWith('SharableProfile_statsSection'))
    );
    if (statsSection) {
      const referenceNode = statsSection.nextElementSibling;
      if (referenceNode !== buttonContainer) {
        selectedElement.insertBefore(buttonContainer, referenceNode);
        changed = true;
      }
    } else if (buttonContainer.parentElement !== selectedElement) {
      selectedElement.appendChild(buttonContainer);
      changed = true;
    }

    const tabsContainer = selectedElement.closest('[class*="SharableProfile_tabsComponentContainer"]');
    if (tabsContainer) tabsContainer.style.height = '34rem';
    return changed;
  }

  addMyCharacterCardButton() {
    const characterInfoElements = this.GameUiAdapter.queryAll('headerCharacterInfo');
    const headerInfoElement = Array.from(characterInfoElements)
      .map((characterInfo) =>
        Array.from(characterInfo.children).find((child) => child.querySelector?.('[class*="Header_totalLevel"]'))
      )
      .find(Boolean);
    const totalLevelElement = headerInfoElement?.querySelector('[class*="Header_totalLevel"]');
    if (!headerInfoElement || !totalLevelElement) return false;
    let changed = false;
    let levelLayout = totalLevelElement.closest('.mst-header-card-level-layout');
    if (!levelLayout || levelLayout.parentElement !== headerInfoElement) {
      levelLayout = document.createElement('div');
      levelLayout.className = 'mst-header-card-level-layout';
      headerInfoElement.insertBefore(levelLayout, totalLevelElement);
      changed = true;
    }
    if (totalLevelElement.parentElement !== levelLayout) {
      levelLayout.appendChild(totalLevelElement);
      changed = true;
    }
    const nameElement = Array.from(headerInfoElement.children || []).find((element) =>
      Array.from(element.classList).some((className) => className.startsWith('Header_name'))
    );
    if (nameElement) {
      nameElement.classList.add('mst-my-character-name-card-btn');
      nameElement.setAttribute('role', 'button');
      nameElement.tabIndex = 0;
      this.setAttributeIfChanged(nameElement, 'title', this.i18n.t('userCharacterCard'));
      if (!nameElement.dataset.mstCharacterCardBound) {
        nameElement.dataset.mstCharacterCardBound = '1';
        nameElement.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showMyCharacterCard();
        });
        nameElement.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          this.showMyCharacterCard();
        });
      }
    }

    const existingButton = headerInfoElement.querySelector('.mst-my-character-card-btn');
    if (existingButton) {
      this.updateToolkitButton(existingButton);
      if (totalLevelElement.nextElementSibling !== existingButton) {
        levelLayout.insertBefore(existingButton, totalLevelElement.nextSibling);
        changed = true;
      }
      return changed;
    }

    const myButton = document.createElement('button');
    myButton.className = 'mst-my-character-card-btn';
    myButton.type = 'button';
    this.updateToolkitButton(myButton);
    levelLayout.insertBefore(myButton, totalLevelElement.nextSibling);
    return true;
  }

  addPartyCardButton() {
    const checkParty = () => {
      const buttonsElement = document.querySelector(PARTY_BUTTONS_SELECTOR);
      const rightButtonsElement = buttonsElement?.querySelector(PARTY_RIGHT_BUTTONS_SELECTOR);
      if (!rightButtonsElement || rightButtonsElement.querySelector('.mst-party-card-btn')) return;
      const leaveButton = rightButtonsElement.querySelector('button');

      const btn = document.createElement('button');
      const gameButtonClass = [
          ...(leaveButton?.classList || [])
        ].find((className) => className.startsWith('Button_button__')) || '';
      btn.className = [
        gameButtonClass, 'mst-party-card-btn'
      ]
        .filter(Boolean)
        .join(' ');
      btn.type = 'button';
      btn.textContent = this.i18n.t('partyCard');
      btn.onclick = () => {
        this.showPartyCharacterCard();
        return false;
      };

      rightButtonsElement.insertBefore(btn, leaveButton || null);
      console.log('队伍名片按钮已添加');
    };
    this.state.partyObserver?.disconnect();
    this.state.partyObserver = this.utils.observeBody(checkParty);
  }

  refreshEntryLanguage() {
    document.querySelectorAll('.mst-character-card-btn').forEach((button) => {
      button.textContent = this.i18n.t('viewCharacterCard');
    });
    document.querySelectorAll('.mst-my-character-card-btn').forEach((button) => {
      this.updateToolkitButton(button);
    });
    document.querySelectorAll('.mst-my-character-name-card-btn').forEach((element) => {
      this.setAttributeIfChanged(element, 'title', this.i18n.t('userCharacterCard'));
    });
    document.querySelectorAll('.mst-party-card-btn').forEach((button) => {
      button.textContent = this.i18n.t('partyCard');
    });
  }

  cleanup() {
    if (this.state.partyObserver) {
      this.state.partyObserver.disconnect();
      this.state.partyObserver = null;
    }
  }
}

export class CharacterCardLanguageController {
  constructor(deps) {
    this.state = deps.state;
    this.layoutController = deps.layoutController;
    this.skillSelector = deps.skillSelector;
    this.standaloneController = deps.standaloneController;
    this.teamController = deps.teamController;
    this.entryController = deps.entryController;
    this.i18n = deps.ctx.i18n;
  }

  refreshOpenCardLanguage() {
    const modal = document.querySelector('.mst-character-card-modal');
    if (!modal) {
      this.skillSelector.refreshSkillSelectorLanguage();
      return;
    }
    const title = modal.querySelector('.swal2-title');
    this.layoutController.refreshCardLayoutLanguage(modal);

    if (modal.classList.contains('mst-team-card-modal')) {
      if (title) title.textContent = this.i18n.t('partyCard');
      const input = modal.querySelector('.mst-team-member-search');
      if (input) input.placeholder = this.i18n.t('searchCachedCharacters');
      const reset = modal.querySelector('.mst-reset-team-card-btn');
      if (reset) reset.textContent = this.i18n.t('resetPartyData');
      const download = modal.querySelector('.mst-download-team-card-btn');
      if (download) download.textContent = this.i18n.t('downloadCard');
      const copy = modal.querySelector('.mst-copy-team-card-btn');
      if (copy) copy.textContent = this.i18n.t('copyCard');
      const hint = modal.querySelector('.mst-team-hint');
      if (hint) hint.textContent = this.i18n.t('latestProfileHint');
      this.teamController.renderTeamCardDialog(modal);
    } else {
      const loadout = this.state.activeCard?.options?.loadoutCard ? this.state.activeCard.options.loadout : null;
      if (title) title.textContent = this.i18n.t(loadout ? 'loadoutCharacterCard' : 'characterCard');
      const input = modal.querySelector('.mst-character-member-search');
      if (input) input.placeholder = this.i18n.t('searchCachedCharacters');
      const reset = modal.querySelector('.mst-reset-character-card-btn');
      if (reset) reset.textContent = this.i18n.t('resetCharacterData');
      const download = modal.querySelector('.mst-download-card-btn');
      if (download) download.textContent = this.i18n.t('downloadCard');
      const copy = modal.querySelector('.mst-copy-card-btn');
      if (copy) copy.textContent = this.i18n.t('copyCard');
      const skillHint = modal.querySelector('.mst-skill-hint span');
      if (skillHint) skillHint.textContent = this.i18n.t('editAbilityHint');
      const banner = modal.querySelector('.mst-instruction-banner');
      if (banner && loadout) {
        banner.textContent = this.standaloneController.getLoadoutBannerText(loadout);
      }
      this.standaloneController.refreshCharacterCard(modal);
      if (!loadout) this.standaloneController.refreshCharacterCardPicker(modal);
    }
    this.skillSelector.refreshSkillSelectorLanguage();
  }

  setLanguage() {
    this.entryController.refreshEntryLanguage();
    this.refreshOpenCardLanguage();
  }
}

export class CharacterCardLifecycle {
  constructor(deps) {
    this.state = deps.state;
    this.installStyles = deps.installStyles;
    this.entryController = deps.entryController;
    this.standaloneController = deps.standaloneController;
    this.memberService = deps.memberService;
    this.CardDataAdapter = deps.CardDataAdapter;
    this.getCharacterCardContentSignature = deps.getCharacterCardContentSignature;
    this.updateCharacterCardDataTime = deps.updateCharacterCardDataTime;
    this.getStandaloneCharacterCard = deps.getStandaloneCharacterCard;
    this.DataHub = deps.ctx.DataHub;
    this.utils = deps.ctx.utils;
    this.cardFields = new Set([
      '*', 'character', 'characterSkills', 'characterAbilities', 'characterItems',
      'characterHouseRoomMap', 'combatUnit', 'partyInfo', 'battleUnits'
    ]);
  }

  scheduleTeamCardRefresh(characterID) {
    clearTimeout(this.state.teamCard.refreshTimer);
    this.state.teamCard.refreshTimer = setTimeout(() => this.memberService.refreshStoredTeamCard(characterID), 300);
  }

  handleProfileShared(event) {
    this.scheduleTeamCardRefresh(event.detail?.characterID);
    const activeCard = this.state.activeCard;
    if (activeCard?.characterID && String(event.detail?.characterID) === activeCard.characterID) {
      activeCard.data = this.CardDataAdapter.mergeProfile(event.detail);
      if (this.getStandaloneCharacterCard()) this.standaloneController.refreshCharacterCard();
    }
  }

  handleCharacterUpdated(event) {
    if (!(event.detail?.fields || []).some((field) => this.cardFields.has(field))) return;
    this.scheduleTeamCardRefresh();
    const activeCard = this.state.activeCard;
    const previousSignature = activeCard ? this.getCharacterCardContentSignature(activeCard.data) : '';
    let nextData = activeCard?.data;
    if (activeCard?.isMyCharacter) {
      nextData = this.CardDataAdapter.fromCharacterData(this.DataHub.characterData.raw);
    } else if (activeCard?.options?.loadoutCard) {
      nextData = this.CardDataAdapter.fromLoadout(activeCard.options.loadout);
    } else if (activeCard?.characterID) {
      const profile = this.DataHub.getProfile(activeCard.characterID);
      if (profile) nextData = this.CardDataAdapter.mergeProfile(profile);
    }
    if (activeCard && nextData) {
      activeCard.data = nextData;
      if (this.getStandaloneCharacterCard()) {
        const nextSignature = this.getCharacterCardContentSignature(nextData);
        if (previousSignature !== nextSignature) this.standaloneController.refreshCharacterCard();
        else this.updateCharacterCardDataTime(nextData.dataTimestamp);
      }
    }
  }

  async init() {
    this.installStyles();
    await this.state.svgTool.loadSpriteSheets();

    this.entryController.addCharacterCardButton();
    this.entryController.addMyCharacterCardButton();
    this.entryController.addPartyCardButton();
    this.state.loadoutCardHandler = this.standaloneController.showLoadoutCharacterCard.bind(this.standaloneController);
    window.addEventListener('mst:card:loadout-request', this.state.loadoutCardHandler);

    this.state.profileSharedHandler = this.handleProfileShared.bind(this);
    this.state.characterUpdatedHandler = this.handleCharacterUpdated.bind(this);
    window.addEventListener('mst:data:profile-shared', this.state.profileSharedHandler);
    window.addEventListener('mst:data:character-updated', this.state.characterUpdatedHandler);
    this.memberService.refreshStoredTeamCard();

    // React 会替换资料与页头节点，入口检查统一交给按帧合并的全局观察器。
    const scheduleCharacterCardButton = () => {
      if (this.state.timer) return;
      this.state.timer = setTimeout(() => {
        this.state.timer = null;
        this.entryController.addCharacterCardButton();
      }, 50);
    };
    this.state.observer?.disconnect();
    this.state.observer = this.utils.observeBody(() => {
      scheduleCharacterCardButton();
      this.entryController.addMyCharacterCardButton();
    });
  }

  cleanup() {
    if (this.state.observer) {
      this.state.observer.disconnect();
      this.state.observer = null;
    }
    this.entryController.cleanup();
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
    if (this.state.teamCard.refreshTimer) {
      clearTimeout(this.state.teamCard.refreshTimer);
      this.state.teamCard.refreshTimer = null;
    }
    if (this.state.loadoutCardHandler) {
      window.removeEventListener('mst:card:loadout-request', this.state.loadoutCardHandler);
      this.state.loadoutCardHandler = null;
    }
    if (this.state.profileSharedHandler) {
      window.removeEventListener('mst:data:profile-shared', this.state.profileSharedHandler);
      this.state.profileSharedHandler = null;
    }
    if (this.state.characterUpdatedHandler) {
      window.removeEventListener('mst:data:character-updated', this.state.characterUpdatedHandler);
      this.state.characterUpdatedHandler = null;
    }
  }
}

// original-character-card-feature
export function createOriginalCharacterCardFeature(ctx) {
  const {SpriteService, Notifier, i18n} = ctx;
  CharacterCardSVGTool.configure(SpriteService);
  const state = new CharacterCardState(CharacterCardSVGTool);
  const CardDataAdapter = createCharacterCardDataAdapter(ctx);
  const cardSizeConstants = {CARD_BASE_WIDTH, CARD_DESKTOP_WIDTH};
  let standaloneController = null;
  let teamController = null;

  const layoutController = new CharacterCardLayoutController({
    ctx,
    state,
    constants: cardSizeConstants,
    refreshTeamCard: (modal) => teamController.renderTeamCardDialog(modal),
    refreshStandaloneCard: (modal) => standaloneController.refreshCharacterCard(modal)
  });

  const rendererApi = createCharacterCardRenderer({
    ctx,
    state,
    CardDataAdapter,
    getEffectiveLayoutMode: layoutController.getEffectiveLayoutMode.bind(layoutController)
  });

  const dialogController = new CharacterCardDialogController({
    Notifier,
    state,
    hydrateBuildScores: rendererApi.hydrateBuildScores,
    getDefaultWidth: () => layoutController.getCharacterDialogWidth(layoutController.getEffectiveLayoutMode())
  });

  const showToastNotice = (text, variant = 'success') => {
    Notifier.toast(text, variant);
  };

  const CardImageExporter = createCharacterCardImageExporter({
    getStandaloneCharacterCard: dialogController.getStandaloneCharacterCard.bind(dialogController),
    hydrateBuildScores: rendererApi.hydrateBuildScores,
    state,
    Notifier,
    i18n,
    showToastNotice
  });

  const installStyles = () => {
    applyCharacterCardCssVariables();
    StyleService.ensure('mst-character-card-style', MST_CHARACTER_CARD_CSS);
  };

  const memberService = new CharacterCardMemberService({
    ctx,
    state,
    CardDataAdapter,
    formatCardTime: rendererApi.formatCardTime
  });

  const skillSelector = new CharacterCardSkillSelector({
    ctx,
    state,
    createSvgIcon: rendererApi.createSvgIcon,
    getAbilityDisplayNames: rendererApi.getAbilityDisplayNames,
    refreshCharacterCard: (...args) => standaloneController.refreshCharacterCard(...args)
  });

  standaloneController = new CharacterCardStandaloneController({
    ctx,
    state,
    CardDataAdapter,
    CardRenderer: rendererApi.CardRenderer,
    CardImageExporter,
    dialogController,
    layoutController,
    memberService,
    skillSelector,
    hydrateBuildScores: rendererApi.hydrateBuildScores,
    updateCharacterCardDataTime: rendererApi.updateCharacterCardDataTime
  });

  teamController = new CharacterCardTeamController({
    ctx,
    state,
    CardRenderer: rendererApi.CardRenderer,
    CardImageExporter,
    dialogController,
    layoutController,
    memberService,
    hydrateBuildScores: rendererApi.hydrateBuildScores,
    showToastNotice,
    constants: cardSizeConstants
  });

  const entryController = new CharacterCardEntryController({
    ctx,
    state,
    showCharacterCard: standaloneController.showCharacterCard.bind(standaloneController),
    showMyCharacterCard: standaloneController.showMyCharacterCard.bind(standaloneController),
    showPartyCharacterCard: teamController.showPartyCharacterCard.bind(teamController)
  });

  const languageController = new CharacterCardLanguageController({
    ctx,
    state,
    layoutController,
    skillSelector,
    standaloneController,
    teamController,
    entryController
  });

  const lifecycle = new CharacterCardLifecycle({
    ctx,
    state,
    installStyles,
    entryController,
    standaloneController,
    memberService,
    CardDataAdapter,
    getCharacterCardContentSignature: rendererApi.getCharacterCardContentSignature,
    updateCharacterCardDataTime: rendererApi.updateCharacterCardDataTime,
    getStandaloneCharacterCard: dialogController.getStandaloneCharacterCard.bind(dialogController)
  });

  return {
    init: lifecycle.init.bind(lifecycle),
    cleanup: lifecycle.cleanup.bind(lifecycle),
    setLanguage: languageController.setLanguage.bind(languageController),
    showMyCharacterCard: standaloneController.showMyCharacterCard.bind(standaloneController)
  };
}

// character-card-feature
export class CharacterCardFeature {
  static ctx = null;
  static OriginalCharacterCardFeature = null;

  static configure(ctx, OriginalCharacterCardFeature) {
    this.ctx = ctx;
    this.OriginalCharacterCardFeature = OriginalCharacterCardFeature;
  }

  showMyCharacterCard() {
    return this.constructor.OriginalCharacterCardFeature.showMyCharacterCard();
  }

  init() {
    const {CONFIG, LanguageEvents} = this.constructor.ctx;
    const {OriginalCharacterCardFeature} = this.constructor;
    if (!CONFIG.isGameSite) return;
    const start = () => OriginalCharacterCardFeature.init();
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, {once: true});
    LanguageEvents.subscribe(() => OriginalCharacterCardFeature.setLanguage());
    window.addEventListener('pagehide', OriginalCharacterCardFeature.cleanup, {once: true});
  }
}
