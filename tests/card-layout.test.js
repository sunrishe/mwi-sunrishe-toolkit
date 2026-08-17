'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const CHARACTER_CARD_STYLES_PATH = path.resolve(__dirname, '..', 'src', 'modules', 'character-card', 'styles.css');
const source = readRuntimeSource();
const characterCardStylesSource = fs.readFileSync(CHARACTER_CARD_STYLES_PATH, 'utf8');

// 名片布局测试主要验证源码约束，避免 UI 改动破坏单双列和滚动边界。
function createTemplateRenderer() {
  return {
    empty: '',
    raw(value) {
      return value || '';
    },
    html(strings, ...values) {
      return strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '');
    }
  };
}

function loadGenerateCharacterCard() {
  // 只提供渲染名片所需的最小上下文，降低测试对真实页面环境的依赖。
  const context = {
    state: {
      cardContentMode: 'all',
      customSkills: {selectedSkills: [], maxSkills: 5},
      buildScore: {sequence: 0, sources: new Map()},
      svgTool: {
        isLoaded: true,
        createSVGIcon(itemId, options = {}) {
          return `<svg data-type="${options.type || 'items'}" data-id="${itemId}"></svg>`;
        },
        createFallbackIcon(itemId) {
          return `<svg data-id="${itemId}"></svg>`;
        },
        getChatIconsSpritePath() {
          return '';
        }
      }
    },
    i18n: {
      languageKey: 'zh',
      t(key) {
        return key;
      },
      pick(entry) {
        return entry?.zh ?? entry?.en ?? '';
      }
    },
    TemplateRenderer: createTemplateRenderer(),
    DataHub: {
      clientData: {
        raw: {
          itemDetailMap: {},
          abilityDetailMap: {},
          houseRoomDetailMap: {
            '/house_rooms/dairy_barn': {
              hrid: '/house_rooms/dairy_barn',
              skillHrid: '/skills/milking',
              usableInActionTypeMap: {},
              sortIndex: 1,
              name: 'Dairy Barn'
            }
          }
        }
      },
      getGameI18nResources() {
        return null;
      },
      getLocalizedGameName(_group, hrid) {
        return hrid;
      }
    },
    utils: {
      substrLastSlash(value) {
        return String(value).split('/').pop();
      },
      escapeHtml(value) {
        return String(value);
      }
    },
    buildScoreService: {
      calculate() {
        return Promise.resolve({
          battle: {total: 0, house: 0, abilities: 0, equipment: 0},
          skilling: {total: 0, house: 0, tools: 0, equipment: 0, available: true},
          equipmentHidden: false
        });
      }
    },
    document: {styleSheets: []}
  };
  const moduleSource = readVmSource('src/modules/character-card/data.js', 'src/modules/character-card/renderer.js');
  return {
    context,
    generateCharacterCard: vm.runInNewContext(
      `${moduleSource}
            const CardDataAdapter = createCharacterCardDataAdapter({DataHub, i18n, utils});
            const renderer = createCharacterCardRenderer({
                ctx: {DataHub, TemplateRenderer, buildScoreService, i18n, utils},
                state,
                CardDataAdapter,
                getEffectiveLayoutMode: () => 'desktop'
            });
            renderer.CardRenderer.character;`,
      context
    )
  };
}

test('战斗、生活和全部布局只渲染各自需要的名片模块', () => {
  const {context, generateCharacterCard} = loadGenerateCharacterCard();
  const data = {player: {}, dataTimestamp: 1};

  context.state.cardContentMode = 'combat';
  const combat = generateCharacterCard(data, 'Test');
  assert.match(combat, /mst-equipment-skills-panel/);
  assert.match(combat, /mst-progression-panel/);
  assert.doesNotMatch(combat, /mst-life-equipment-panel|mst-life-progression-panel/);

  context.state.cardContentMode = 'life';
  const life = generateCharacterCard(data, 'Test');
  assert.match(life, /mst-equipment-skills-panel/);
  assert.match(life, /mst-life-equipment-panel/);
  assert.match(life, /mst-life-progression-panel/);
  assert.doesNotMatch(life, /mst-progression-panel/);

  context.state.cardContentMode = 'all';
  const all = generateCharacterCard(data, 'Test');
  assert.match(all, /mst-equipment-skills-panel/);
  assert.match(all, /mst-life-equipment-panel/);
  assert.match(all, /mst-life-progression-panel/);
  assert.match(all, /mst-progression-panel/);
});

test('双列复选框控制列数，布局下拉框只提供三种内容模式', () => {
  const context = {
    state: {
      cardContentMode: 'all',
      layoutMode: {
        forcedMode: 'desktop',
        getCurrentMode() {
          return this.forcedMode;
        }
      }
    },
    i18n: {
      t(key) {
        return {
          cardLayout: '名片布局',
          twoColumns: '双列',
          combatLayout: '战斗布局',
          skillingLayout: '生活布局',
          allCardContent: '全部'
        }[key];
      }
    },
    TemplateRenderer: createTemplateRenderer()
  };
  const createSelect = vm.runInNewContext(
    `${readVmSource('src/modules/character-card/index.js')}
        const controller = new CharacterCardLayoutController({
            ctx: {TemplateRenderer, i18n},
            state,
            constants: {CARD_BASE_WIDTH: 300, CARD_DESKTOP_WIDTH: 584},
            refreshTeamCard() {},
            refreshStandaloneCard() {}
        });
        () => controller.createCardLayoutSelectTemplate();`,
    context
  );
  const html = createSelect();
  assert.match(html, /class="mst-card-column-checkbox"/);
  assert.match(html, /<span>双列<\/span>/);
  assert.doesNotMatch(html, /<optgroup/);
  [
    'combat', 'life', 'all'
  ].forEach((value) => assert.match(html, new RegExp(`value="${value}"`)));
  assert.doesNotMatch(html, /value="(?:mobile|desktop):/);
});

test('各名片入口使用约定的默认布局', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');

  assert.match(cardSource, /new CharacterCardTeamController/);
  assert.match(cardSource, /layoutController\.setCardLayout\('mobile', 'combat'\)/);
  assert.match(cardSource, /layoutController\.setCardLayout\('desktop', 'all'\)/);
  assert.match(cardSource, /layoutController\.setCardLayout\('desktop', isCombatLoadout \? 'combat' : 'life'\)/);
});

test('单双列切换只改变模块位置，不改变模块尺寸', () => {
  assert.match(source, /import MST_CHARACTER_CARD_CSS from ['"]\.\/styles\.css['"];/);
  assert.match(source, /style\.setProperty\('--mst-card-main-panel-height', `\$\{CARD_MAIN_PANEL_HEIGHT\}px`\)/);
  assert.match(source, /style\.setProperty\('--mst-card-life-panel-height', `\$\{CARD_LIFE_PANEL_HEIGHT\}px`\)/);
  assert.match(characterCardStylesSource, /['"]equipment life-equipment['"]\s*['"]equipment life-progression['"]/);
  assert.match(characterCardStylesSource, /['"]equipment progression['"]\s*['"]life-equipment life-progression['"]/);
  assert.match(source, /const CARD_MAIN_PANEL_HEIGHT = 314;/);
  assert.match(source, /const CARD_LIFE_PANEL_HEIGHT = \(CARD_MAIN_PANEL_HEIGHT - CARD_COLUMN_GAP\) \/ 2;/);
  assert.match(
    characterCardStylesSource,
    /\.mst-equipment-skills-panel,\s*\.mst-progression-panel\s*\{[^}]*height:\s*var\(--mst-card-main-panel-height\);/
  );
  assert.match(
    characterCardStylesSource,
    /\.mst-life-equipment-panel,\s*\.mst-life-progression-panel\s*\{[^}]*height:\s*var\(--mst-card-life-panel-height\);/
  );
  assert.doesNotMatch(
    characterCardStylesSource,
    /mst-card-content-life\.mst-layout-desktop \.mst-life-progression-panel\{height:100%;\}/
  );
});

test('窄屏只横向滚动名片内容，不带动顶部操作区', () => {
  assert.match(
    characterCardStylesSource,
    /\.swal2-popup\.mst-character-card-modal \.swal2-html-container\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/
  );
  assert.match(
    characterCardStylesSource,
    /\.mst-standalone-card-host\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/
  );
  assert.match(characterCardStylesSource, /\.mst-team-cards-container\s*\{[^}]*overflow-x:\s*auto;/);
  assert.doesNotMatch(
    characterCardStylesSource,
    /\.swal2-popup\.mst-character-card-modal \.swal2-html-container\s*\{[^}]*overflow-x:\s*auto;/
  );
});

test('顶部用户名片入口不接管游戏原生名称容器布局', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');

  assert.doesNotMatch(cardSource, /headerInfoElement\.classList\.add\('mst-header-card-level-layout'\)/);
  assert.match(cardSource, /levelLayout\.insertBefore\(existingButton,\s*totalLevelElement\.nextSibling\)/);
  assert.doesNotMatch(characterCardStylesSource, /\.mst-header-card-level-layout\s*>\s*\[class\*=['"]Header_name/);
  assert.match(characterCardStylesSource, /\.mst-header-card-level-layout\s*\{[^}]*display:\s*flex\s*!important;/);
  assert.match(
    characterCardStylesSource,
    /\.mst-header-card-level-layout\s*>\s*\.mst-my-character-card-btn\s*\{[^}]*white-space:\s*nowrap;/
  );
  assert.match(
    characterCardStylesSource,
    /\.mst-header-card-level-layout\s*>\s*:not\(\[class\*='Header_totalLevel'\]\):not\(\.mst-my-character-card-btn\)/
  );
});
