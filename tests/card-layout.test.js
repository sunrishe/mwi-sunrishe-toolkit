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

test('顶部用户名片入口只增强角色名与总等级，不改变原有结构层', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');

  // 工具箱按钮直接放进总等级元素内部（总等级 div 加行内 flex class）；
  // 角色名只加增强 class，两者都不额外包裹容器、不移动原有元素。
  assert.doesNotMatch(cardSource, /mst-header-card-level-layout|mst-my-character-name-row/);
  assert.doesNotMatch(cardSource, /totalLevelElement\.insertAdjacentElement|totalLevelElement\.parentElement/);
  assert.match(cardSource, /totalLevelElement\.classList\.add\('mst-header-level-toolkit'\)/);
  assert.match(cardSource, /totalLevelElement\.appendChild\(myButton\)/);
  assert.match(cardSource, /totalLevelElement\.appendChild\(existingButton\)/);
  // 角色名只有点击增强：指针样式、无边框、无 hover 胶囊样式。
  assert.match(characterCardStylesSource, /\.mst-my-character-name-card-btn\s*\{[^}]*cursor:\s*pointer;/);
  assert.doesNotMatch(characterCardStylesSource, /\.mst-my-character-name-card-btn\s*\{[^}]*border:/);
  assert.doesNotMatch(
    characterCardStylesSource,
    /\.mst-my-character-name-card-btn:visited|\.mst-my-character-name-card-btn:hover/
  );
  assert.match(characterCardStylesSource, /\.mst-header-level-toolkit\s*\{[^}]*display:\s*inline-flex/);
  assert.match(
    characterCardStylesSource,
    /\[class\*='Header_characterInfo'\] \[class\*='Header_info'\] > #mwitools-header-tools\s*\{[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;/
  );
  assert.doesNotMatch(characterCardStylesSource, /\.mst-header-card-level-layout/);
});

test('队伍名片入口用橙色高亮与游戏原生按钮区分', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');

  // 入口继承游戏按钮类，配色必须由 MST 补：游戏底色规则与之同级，用属性选择器提高优先级。
  assert.match(cardSource, /gameButtonClass,\s*'mst-party-card-btn'/);
  assert.match(
    characterCardStylesSource,
    /\[class\*='Button_button__'\]\.mst-party-card-btn\s*\{[^}]*background-color:\s*var\(--color-orange-500,\s*#faa21e\);[^}]*color:\s*#14151f;/
  );
  assert.match(
    characterCardStylesSource,
    /\[class\*='Button_button__'\]\.mst-party-card-btn:hover\s*\{[^}]*background-color:\s*var\(--color-orange-400,\s*#fbb54b\);/
  );
});

test('评分块按内容模式只渲染对应的评分行', () => {
  const {context, generateCharacterCard} = loadGenerateCharacterCard();
  const data = {player: {}, dataTimestamp: 1};

  context.state.cardContentMode = 'combat';
  const combat = generateCharacterCard(data, 'Test');
  assert.match(combat, /data-score-row="battle" hidden=false/);
  assert.match(combat, /data-score-row="skilling" hidden=true/);

  context.state.cardContentMode = 'life';
  const life = generateCharacterCard(data, 'Test');
  assert.match(life, /data-score-row="battle" hidden=true/);
  assert.match(life, /data-score-row="skilling" hidden=false/);

  context.state.cardContentMode = 'all';
  const all = generateCharacterCard(data, 'Test');
  assert.match(all, /data-score-row="battle" hidden=false/);
  assert.match(all, /data-score-row="skilling" hidden=false/);

  // 只有一个评分（隐藏了一行）时评分贴下边摆放：评分块保持两行高度，单行贴下沿。
  assert.match(characterCardStylesSource, /\.mst-card-build-score\s*\{[^}]*min-height:\s*25px;/);
  assert.match(
    characterCardStylesSource,
    /\.mst-card-build-score:has\(\.mst-card-build-score-row\[hidden\]\)\s*\{[^}]*justify-content:\s*flex-end;/
  );
});

test('自己名片的技能格点击能打开技能选择器且不会重复绑定', () => {
  const openedSkillIndexes = [];
  const createSlot = (skillIndex) => {
    const handlers = [];
    return {
      dataset: {},
      handlers,
      getAttribute(name) {
        return name === 'data-skill-index' ? String(skillIndex) : null;
      },
      addEventListener(type, handler) {
        if (type === 'click') handlers.push(handler);
      }
    };
  };
  let slots = [
    createSlot(0), createSlot(1)
  ];
  const cardRoot = {
    querySelectorAll() {
      return slots.slice();
    }
  };
  const modal = {
    querySelector(selector) {
      if (selector === '.mst-standalone-card-host') return {};
      if (selector === '#mst-character-card') return cardRoot;
      return null;
    }
  };
  const context = {
    state: {activeCard: {data: {}, name: '我', isMyCharacter: true, options: {}}},
    CardRenderer: {character() {}},
    layoutController: {updateCardLayoutSelect() {}, updateModalLayoutClass() {}},
    skillSelector: {
      showSkillSelector(skillIndex) {
        openedSkillIndexes.push(skillIndex);
      }
    },
    hydrateBuildScores() {},
    updateCharacterCardDataTime() {},
    updateStandaloneCharacterControls() {},
    TemplateRenderer: {
      render(view) {
        view();
      }
    }
  };
  const refresh = vm.runInNewContext(
    `${readVmSource('src/modules/character-card/index.js')}
        const refresh = new CharacterCardStandaloneRefresh({
            ctx: {TemplateRenderer},
            state,
            CardRenderer,
            layoutController,
            skillSelector,
            hydrateBuildScores,
            updateCharacterCardDataTime,
            updateStandaloneCharacterControls
        });
        (modal) => refresh.refreshCharacterCard(modal);`,
    context
  );

  refresh(modal);
  assert.equal(slots[0].handlers.length, 1);
  assert.equal(slots[1].handlers.length, 1);

  // 浏览器里监听函数的 this 是元素本身，处理函数不能依赖被改写成控制器的 this。
  slots[1].handlers[0].call(slots[1], {type: 'click'});
  assert.deepEqual(
    openedSkillIndexes,
    [
      1
    ]
  );

  // uhtml 复用技能格节点：重渲染不能再绑一次，否则一次点击弹出多个选择框。
  refresh(modal);
  assert.equal(slots[0].handlers.length, 1);
  slots[0].handlers[0].call(slots[0], {type: 'click'});
  assert.deepEqual(
    openedSkillIndexes,
    [
      1, 0
    ]
  );

  // 技能面板被整段替换（新节点）时要重新绑定，点击照旧可用。
  slots = [
    createSlot(2)
  ];
  refresh(modal);
  assert.equal(slots[0].handlers.length, 1);
  slots[0].handlers[0].call(slots[0], {type: 'click'});
  assert.deepEqual(
    openedSkillIndexes,
    [
      1, 0, 2
    ]
  );

  // 别人的名片只读，不绑定技能编辑。
  context.state.activeCard.isMyCharacter = false;
  slots = [
    createSlot(0)
  ];
  refresh(modal);
  assert.equal(slots[0].handlers.length, 0);

  // 绑定挑的是卡片 id 与技能格上的槽位号，真实渲染结果里必须存在。
  const myCard = loadGenerateCharacterCard().generateCharacterCard(
    {
      player: {},
      abilities: [
        {abilityHrid: '/abilities/fireball', level: 3, slotNumber: 1}
      ],
      dataTimestamp: 1
    },
    '我',
    null,
    true
  );
  assert.match(myCard, /id=mst-character-card/);
  assert.match(myCard, /class="Ability_ability__1njrh Ability_clickable__w9HcM mst-skill-slot" data-skill-index="0"/);
  assert.match(
    myCard,
    /class="Ability_ability__1njrh Ability_clickable__w9HcM mst-empty-skill-slot" data-skill-index="1"/
  );
});

test('名片技能选择浮层按游戏的物品顺序列出技能', () => {
  // 「选择技能」列表与游戏物品列表同序：技能书物品的 itemDetailMap.sortIndex（技能升级计算器添加技能列表同一口径）。
  const skillClientData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'init_client_data.json'), 'utf8')
  );
  const skillCharacterData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'references', 'game-data', 'init_character_data.json'), 'utf8')
  );
  const abilityBookByAbilityHrid = new Map();
  Object.values(skillClientData.itemDetailMap).forEach((item) => {
    const abilityHrid = item?.abilityBookDetail?.abilityHrid;
    if (abilityHrid) abilityBookByAbilityHrid.set(abilityHrid, item);
  });
  const optionHrids = [];
  const createFakeElement = () => ({
    className: '',
    hidden: false,
    dataset: {},
    style: {},
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    focus() {},
    querySelector: () => createFakeElement(),
    querySelectorAll: () => [],
    removeChild() {}
  });
  const context = {
    skillCharacterData,
    abilityBookByAbilityHrid,
    optionHrids,
    document: {
      createElement: () => createFakeElement(),
      body: {appendChild() {}, removeChild() {}},
      querySelector: () => null
    },
    TemplateRenderer: {
      raw: (value) => value,
      render: (view) => view(),
      // 生成技能卡片时第一个 /abilities/ 字符串值就是 data-ability-hrid 上的技能，按生成顺序收集即可得到列表顺序。
      html: (strings, ...values) => {
        const abilityHrid = values.find((value) => typeof value === 'string' && value.startsWith('/abilities/'));
        if (abilityHrid) optionHrids.push(abilityHrid);
        return '';
      }
    }
  };
  const result = vm.runInNewContext(
    `${readVmSource('src/modules/character-card/index.js')}
        const makeSelector = (DataHub) =>
            new CharacterCardSkillSelector({
                state: {activeCard: {isMyCharacter: true}, customSkills: {selectedSkills: {}}},
                createSvgIcon: () => '',
                getAbilityDisplayNames: (hrid) => ({zh: 'zh', en: 'en'}),
                refreshCharacterCard: () => {},
                ctx: {DataHub, TemplateRenderer, i18n: {t: (key) => key, pick: (names) => names.zh}}
            });
        makeSelector({
            clientData: {indexes: {abilityBookByAbilityHrid}},
            characterData: {raw: skillCharacterData}
        }).showSkillSelector(0);
        const withBooks = optionHrids.length;
        // 客户端字典还没建索引（取不到技能书）时按序号末位排：不报错、也不丢条目。
        makeSelector({clientData: {indexes: {}}, characterData: {raw: skillCharacterData}}).showSkillSelector(0);
        ({withBooks, total: optionHrids.length});`,
    context
  );
  const order = optionHrids.slice(0, result.withBooks);
  const expectedCount = skillCharacterData.characterAbilities.filter((ability) =>
    String(ability?.abilityHrid || '').startsWith('/abilities/')
  ).length;
  assert.equal(order.length, expectedCount);
  // 兜底分支（取不到技能书）同样把全部技能列出来。
  assert.equal(result.total - result.withBooks, expectedCount);
  const itemIndex = (abilityHrid) => Number(abilityBookByAbilityHrid.get(abilityHrid)?.sortIndex);
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(
      itemIndex(order[index - 1]) <= itemIndex(order[index]),
      `${order[index - 1]} 排在了 ${order[index]} 之前，与游戏物品顺序相反`
    );
  }
  // 旧行为按槽位号排，未装配的技能（slotNumber 0）排在最前，首项是 pestilent_shot；物品顺序首项是 poke。
  assert.equal(order[0], '/abilities/poke');
  assert.ok(order.indexOf('/abilities/poke') < order.indexOf('/abilities/pestilent_shot'));
});
