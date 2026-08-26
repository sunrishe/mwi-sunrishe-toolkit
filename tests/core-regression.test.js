'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const i18nMessagesPath = path.resolve(__dirname, '..', 'src', 'common', 'messages.js');
const i18nMessageFiles = [
  'src/common/messages.js'
];
const source = readRuntimeSource();
const i18nMessagesSource = fs.readFileSync(i18nMessagesPath, 'utf8');
const headerSource = fs.readFileSync(path.resolve(__dirname, '..', 'userscript-header.txt'), 'utf8');
const originalEdsPath = path.resolve(__dirname, '..', 'references', 'legacy-scripts', 'eds', 'eds.script.user.js');
const originalEdsSource = fs.readFileSync(originalEdsPath, 'utf8');
const clientDataPath = path.resolve(__dirname, '..', 'references', 'game-data', 'init_client_data.json');
const clientData = JSON.parse(fs.readFileSync(clientDataPath, 'utf8'));
const characterDataPath = path.resolve(__dirname, '..', 'references', 'game-data', 'init_character_data.json');
const characterDataFixture = JSON.parse(fs.readFileSync(characterDataPath, 'utf8'));

function findSourceMarker(marker, fromIndex = 0) {
  if (typeof marker === 'string') return source.indexOf(marker, fromIndex);

  const match = source.slice(fromIndex).match(marker);
  return match?.index == null ? -1 : fromIndex + match.index;
}

function extractBetween(startMarker, endMarker) {
  const start = findSourceMarker(startMarker);
  const end = findSourceMarker(endMarker, start);
  assert.ok(start >= 0 && end > start, `无法提取 ${startMarker}`);
  return source.slice(start, end);
}

function loadI18nMessageGroups() {
  const moduleSource = readVmSource(...i18nMessageFiles);
  return vm.runInNewContext(`${moduleSource}\nI18N_MESSAGE_GROUPS;`);
}

function loadHouseCalculator() {
  const i18n = {
    t(key, ...args) {
      return `${key}:${args.join(',')}`;
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/modules/house-calculator/calculator.js')}
        HouseCalculator;`,
    {i18n}
  );
}

function loadClipboardParser() {
  const context = {
    CONFIG: {},
    DataHub: {},
    CharacterDataService: {},
    MarketMateBridge: {},
    MutationObserver: class {},
    Notifier: {},
    i18n: {},
    utils: {},
    window: {}
  };
  const ClipboardCartImportFeature = vm.runInNewContext(
    `${readVmSource('src/common/ui.js')}
        class ClipboardCartImportFeatureWithContext extends ClipboardCartImportFeature {
          constructor() {
            super({
            CONFIG,
            DataHub,
            CharacterDataService,
            MarketMateBridge,
            LanguageEvents: {subscribe() {}},
            i18n,
            utils
          }, Notifier);
          }
        }
        ClipboardCartImportFeatureWithContext;`,
    context
  );
  return new ClipboardCartImportFeature();
}

function loadProfileStore(now) {
  const localStorage = {
    values: new Map(),
    getItem(key) {
      return this.values.get(key) ?? null;
    },
    setItem(key, value) {
      this.values.set(key, String(value));
    }
  };
  const context = {
    CONFIG: {PROFILE_CACHE_TTL: 1000, PROFILE_CACHE_LIMIT: 2, PROFILE_CACHE_MAX_BYTES: 1024 * 1024},
    STORAGE_KEYS: {PROFILE_CACHE: 'MST_CC_profiles'},
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    Date: class extends Date {
      static now() {
        return now.value;
      }
    },
    console,
    localStorage,
    window: {dispatchEvent() {}}
  };
  const methods = vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createDataHub({CONFIG, i18n: {}, pageWindow: window}, STORAGE_KEYS);`,
    context
  );
  methods.characterData.profiles = {};
  return Object.assign(methods, {localStorage});
}

function loadCardDataAdapter() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/character-card/data.js')}
        createCharacterCardDataAdapter({DataHub: {}, i18n: {t(key) { return key; }}, utils});`,
    {
      utils: {
        substrLastSlash(value) {
          return String(value).split('/').pop();
        }
      }
    }
  );
}

function loadLanguageEvents() {
  const events = [];
  const service = vm.runInNewContext(`${readVmSource('src/common/i18n.js')}\ncreateLanguageEvents();`, {
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    console,
    window: {dispatchEvent: (event) => events.push(event)}
  });
  return {service, events};
}

function loadClientDataCacheMethods({pageWindow = {}, localStorage}) {
  const result = vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createDataHub({CONFIG: {}, i18n: {}, pageWindow}, STORAGE_KEYS);`,
    {
      console,
      localStorage,
      pageWindow,
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options?.detail;
        }
      },
      window: {dispatchEvent() {}}
    }
  );
  return Object.assign({clientDataCacheSource: ''}, result);
}

function loadUtils() {
  return Function(
    `${readVmSource('src/common/runtime.js')}
        return createRuntimeUtils({
            DataHub: {
                resolveItemName(value) { return value; },
                getHouseDetail() { return null; },
                clientData: {indexes: {}}
            },
            i18n: {languageKey: 'zh', locale: 'zh-CN', t(key) { return key; }}
        }, {
            SpriteService: {getUseHref() {}, get() {}, markDomChanged() {}},
            DomObserverService: {subscribe() {}}
        });`
  )();
}

function loadDataHub(runtime = {}) {
  const listeners = new Map();
  const bridgeWindow = runtime.window || {
    i18next: {store: {data: null}},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((item) => item !== listener)
      );
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
    }
  };
  const bridgeDocument = runtime.document || {
    createElement() {
      return {textContent: '', remove() {}};
    },
    querySelectorAll() {
      return [];
    },
    documentElement: {
      appendChild(script) {
        Function('window', 'document', 'CustomEvent', script.textContent)(bridgeWindow, bridgeDocument, CustomEvent);
      }
    }
  };
  const pageBridgeService = {
    installed: new Set(),
    install({key, source}) {
      this.installed.add(key);
      Function('window', 'document', 'CustomEvent', source)(bridgeWindow, bridgeDocument, CustomEvent);
      return true;
    },
    getError() {
      return '';
    },
    request({requestEvent, responseEvent, idPrefix = 'test', payload = {}}) {
      const id = idPrefix + '-1';
      let result = null;
      const handleResponse = (event) => {
        const detail = JSON.parse(String(event.detail || '{}'));
        if (detail.id === id) result = detail;
      };
      bridgeWindow.addEventListener(responseEvent, handleResponse);
      bridgeWindow.dispatchEvent(new CustomEvent(requestEvent, {detail: JSON.stringify({id, ...payload})}));
      bridgeWindow.removeEventListener(responseEvent, handleResponse);
      return result;
    }
  };
  return vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createDataHub({CONFIG, i18n, PageBridgeService, pageWindow: window, utils}, STORAGE_KEYS);`,
    {
      console,
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options?.detail;
        }
      },
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {}
      },
      window: {dispatchEvent() {}},
      CONFIG: {PROFILE_CACHE_TTL: 1000, PROFILE_CACHE_LIMIT: 50},
      i18n: {languageKey: 'zh'},
      PageBridgeService: pageBridgeService,
      utils: {
        normalizeItemHrid(value) {
          const itemId = String(value || '')
            .replace(/^#/, '')
            .replace(/^\/items\//, '');
          return itemId ? '/items/' + itemId : '';
        },
        substrLastSlash(value) {
          return String(value || '')
            .split('/')
            .pop();
        }
      },
      ...runtime
    }
  );
}

function loadMstEdsFeature({raw = {}, itemMap = {}, reactData = {}, runtime = {}} = {}) {
  const context = {
    hostname: 'milkonomy.pages.dev',
    CONFIG: {characterId: '427012', isGameSite: true, isMilkonomySite: false},
    STORAGE_KEYS: {MILKONOMY_PRESET: 'MST_EDS_preset'},
    DataHub: {
      characterData: {raw},
      getClientDataMap(key) {
        return key === 'itemDetailMap' ? itemMap : {};
      }
    },
    GameUiAdapter: {
      query() {
        return {};
      }
    },
    utils: {
      substrLastSlash(value) {
        return String(value || '')
          .split('/')
          .pop();
      },
      getReactComponentProps() {
        return reactData;
      },
      getCollectionValues(collection) {
        if (Array.isArray(collection)) return collection;
        if (collection instanceof Map) return [
            ...collection.values()
          ];
        if (collection && typeof collection === 'object') return Object.values(collection);
        return [];
      },
      getTextBetween() {
        return '';
      }
    },
    GmApi: {
      getValue() {},
      setValue() {},
      addValueChangeListener() {}
    },
    Notifier: {},
    LanguageEvents: {subscribe() {}},
    TemplateRenderer: {},
    CombatSimulatorConverter: {},
    document: {},
    window: {dispatchEvent() {}},
    CustomEvent: class {},
    i18n: {
      syncPageLanguage() {},
      t(key) {
        return key;
      }
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    setTimeout() {},
    ...runtime
  };
  const Feature = vm.runInNewContext(
    `${readVmSource('src/modules/eds-milkonomy/converter.js', 'src/modules/eds-milkonomy/index.js')}
        CombatSimulatorConverter.configure({utils});
        EdsMilkonomyFeature.configure({
            CONFIG,
            DataHub,
            GameUiAdapter,
            LanguageEvents,
            STORAGE_KEYS,
            GmApi,
            hostname,
            Notifier,
            i18n,
            utils
        }, CombatSimulatorConverter);
        EdsMilkonomyFeature;`,
    context
  );
  return new Feature();
}

function loadI18n({isMilkonomySite = false, values = {}, documentLang = ''} = {}) {
  return vm.runInNewContext(
    `${readVmSource('src/common/i18n.js')}
        const i18n = createI18nService({CONFIG, messageGroups: I18N_MESSAGE_GROUPS});
        i18n.buildMessageIndex();
        i18n.loadLangPref();
        i18n;`,
    {
      CONFIG: {isMilkonomySite},
      I18N_MESSAGE_GROUPS: loadI18nMessageGroups(),
      localStorage: {
        getItem(key) {
          return values[key] ?? null;
        }
      },
      document: {documentElement: {lang: documentLang}}
    }
  );
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function loadOriginalEdsConverter() {
  const start = originalEdsSource.indexOf('    class MilkonomyPresetConverter {');
  const end = originalEdsSource.indexOf('\n    // ==================== 初始化', start);
  assert.ok(start >= 0 && end > start, '无法提取原 EDS 转换器');
  const classSource = originalEdsSource.slice(start, end);
  return vm.runInNewContext(`${classSource}\nMilkonomyPresetConverter;`, {
    CONFIG: {characterId: '427012', hostname: 'milkonomy.pages.dev'},
    utils: {
      substrLastSlash(value) {
        return String(value || '')
          .split('/')
          .pop();
      },
      getItemTypeSuffix(type) {
        const suffix = String(type || '')
          .split('/')
          .pop();
        if (suffix.endsWith('_tool')) return 'tool';
        if (suffix.endsWith('_charm')) return 'charm';
        return suffix;
      }
    },
    GM_setValue() {}
  });
}

function loadMstCombatConverter() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/eds-milkonomy/converter.js')}
        CombatSimulatorConverter.configure({utils});
        CombatSimulatorConverter;`,
    {
      utils: {
        getItemByHash(hash) {
          const parts = String(hash || '').split('::');
          if (parts.length !== 4) return null;
          return {itemHrid: parts[2], enhancementLevel: Number(parts[3]) || 0};
        }
      }
    }
  );
}

function loadOriginalEdsCombatConverter() {
  const start = originalEdsSource.indexOf('    class CombatSimulatorConverter {');
  const end = originalEdsSource.indexOf('\n    // ==================== Milkonomy', start);
  assert.ok(start >= 0 && end > start, '无法提取原 EDS 战斗配装转换器');
  const classSource = originalEdsSource.slice(start, end);
  return vm.runInNewContext(`${classSource}\nCombatSimulatorConverter;`, {
    utils: {
      getItemByHash(hash) {
        const parts = String(hash || '').split('::');
        if (parts.length !== 4) return null;
        return {itemHrid: parts[2], enhancementLevel: Number(parts[3]) || 0};
      }
    }
  });
}

test('房屋材料按升级区间逐级累加且不混入区间外材料', () => {
  const HouseCalculator = loadHouseCalculator();
  const calculator = new HouseCalculator(
    {
      i18n: {
        t(key) {
          return key;
        }
      }
    },
    {
      '/house_rooms/test': {
        upgradeCostsMap: {
          2: [
            {itemHrid: '/items/log', count: 10}
          ],
          3: [
            {itemHrid: '/items/log', count: 20}, {itemHrid: '/items/stone', count: 5}
          ],
          4: [
            {itemHrid: '/items/coin', count: 100}
          ]
        }
      }
    }
  );

  assert.deepEqual(
    {...calculator.calculateUpgradeMaterials('/house_rooms/test', 1, 3)},
    {'/items/log': 30, '/items/stone': 5}
  );
  assert.throws(() => calculator.calculateUpgradeMaterials('/house_rooms/test', 3, 3), /invalidLevel/);
  assert.throws(() => calculator.calculateUpgradeMaterials('/house_rooms/missing', 1, 2), /houseNotFound/);
});

test('房屋物品显示格式切换以当前勾选状态为准', () => {
  const classSource = readSourceFile('src', 'modules', 'house-calculator', 'index.js');
  const HouseCalculatorUI = vm.runInNewContext(
    `${readVmSource('src/modules/house-calculator/index.js')}
        HouseCalculatorUI.configure({
            CONFIG: {},
            DataHub: {},
            CharacterDataService: {},
            MarketMateBridge: {},
            TemplateRenderer: {},
            i18n: {},
            utils: {}
        }, {});
        HouseCalculatorUI;`
  );
  const ui = new HouseCalculatorUI({}, {}, {});
  const container = {};
  let cleared = false;
  let calculatedWith = null;

  ui.lastResult = {materials: {'/items/coin': 1}, roomDetails: [
      {hrid: '/house_rooms/test'}
    ]};
  ui.clearPendingCalculate = () => {
    cleared = true;
  };
  ui.calculateSelectedRooms = (value) => {
    calculatedWith = value;
  };
  ui.refreshResultDisplay(container);

  assert.equal(cleared, true);
  assert.equal(calculatedWith, container);
  assert.match(classSource, /create\(\)\s*\{[\s\S]*?this\.clearPendingCalculate\(\);\s*this\.lastResult = null;/);
});

test('剪贴板解析兼容前后数量、强化等级、每小时和补充天数', () => {
  const feature = loadClipboardParser();
  const result = feature.parseClipboardCartText(
    [
      '补充2.5天', '3/h Magic Log+12', '魔法原木+8 2', '+4 咖啡'
    ].join('\n')
  );

  assert.equal(result.replenish.open, true);
  assert.equal(result.replenish.hour, 60);
  const parsedItems = result.items.map((item) => ({
    name: item.name,
    enhancementLevel: item.enhancementLevel,
    count: item.count,
    quantity: item.quantity,
    isHour: item.isHour,
    isLimit: item.isLimit
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(parsedItems)), [
    {
      name: 'Magic Log',
      enhancementLevel: 12,
      count: 3,
      quantity: 180,
      isHour: true,
      isLimit: false
    }, {name: '魔法原木', enhancementLevel: 8, count: 2, quantity: 120, isHour: true, isLimit: false}, {
      name: '咖啡',
      enhancementLevel: 0,
      count: 4,
      quantity: 240,
      isHour: true,
      isLimit: false
    }
  ]);
});

test('剪贴板解析分别识别数量前置、数量后置、限量和每小时格式', () => {
  const feature = loadClipboardParser();
  const result = feature.parseClipboardCartText(
    [
      '5 Magic Log', 'Magic Log 6', '+7 Magic Log', 'Magic Log +8', '9/H Magic Log+12',
      'Magic Log+10 2/h'
    ].join('\n')
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result.items)), [
    {
      match: '5 Magic Log',
      name: 'Magic Log',
      enhancementLevel: 0,
      count: 5,
      isLimit: false,
      isHour: false,
      quantity: 5
    }, {
      match: 'Magic Log 6',
      name: 'Magic Log',
      enhancementLevel: 0,
      count: 6,
      isLimit: false,
      isHour: false,
      quantity: 6
    }, {
      match: '+7 Magic Log',
      name: 'Magic Log',
      enhancementLevel: 0,
      count: 7,
      isLimit: true,
      isHour: false,
      quantity: 7
    }, {
      match: 'Magic Log +8',
      name: 'Magic Log',
      enhancementLevel: 0,
      count: 8,
      isLimit: true,
      isHour: false,
      quantity: 8
    }, {
      match: '9/H Magic Log+12',
      name: 'Magic Log',
      enhancementLevel: 12,
      count: 9,
      isLimit: false,
      isHour: true,
      quantity: 216
    },
    {
      match: 'Magic Log+10 2/h',
      name: 'Magic Log',
      enhancementLevel: 10,
      count: 2,
      isLimit: false,
      isHour: true,
      quantity: 48
    }
  ]);
});

test('公共集合转换统一兼容数组、Map、普通对象和空值', () => {
  const utils = loadUtils();
  const array = [
    {id: 1}
  ];
  assert.equal(utils.getCollectionValues(array), array);
  assert.deepEqual(
    Array.from(
      utils.getCollectionValues(
        new Map([
          [
            'a', 1
          ], [
            'b', 2
          ]
        ])
      )
    ),
    [
      1, 2
    ]
  );
  assert.deepEqual(
    Array.from(utils.getCollectionValues({a: 1, b: 2})),
    [
      1, 2
    ]
  );
  assert.deepEqual(Array.from(utils.getCollectionValues(null)), []);
});

test('基础数据优先通过游戏官方 localStorageUtil 读取并保留缓存降级路径', () => {
  const officialData = {itemDetailMap: {official: true}};
  let rawReadCount = 0;
  const officialMethods = loadClientDataCacheMethods({
    pageWindow: {
      localStorageUtil: {
        getInitClientData() {
          return officialData;
        }
      }
    },
    localStorage: {
      getItem() {
        rawReadCount += 1;
        return null;
      }
    }
  });

  assert.equal(officialMethods.readClientDataFromCache(), officialData);
  assert.equal(officialMethods.clientDataCacheSource, 'localStorageUtil');
  assert.equal(rawReadCount, 0);

  const fallbackData = {actionDetailMap: {fallback: true}};
  const fallbackMethods = loadClientDataCacheMethods({
    localStorage: {
      getItem(key) {
        return key === 'initClientData' ? JSON.stringify(fallbackData) : null;
      }
    }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(fallbackMethods.readClientDataFromCache())), fallbackData);
  assert.equal(fallbackMethods.clientDataCacheSource, 'localStorage(plain-json)');
});

test('profile_shared 归一化后按 characterID 存储并保留接收时间', () => {
  const now = {value: 1_800_000_000_000};
  const store = loadProfileStore(now);
  const saved = store.addProfileShared({
    characterName: 'Tester',
    profile: {sharableCharacter: {id: 26623, name: 'Tester'}, characterSkills: []}
  });

  assert.equal(saved.characterID, 26623);
  assert.equal(saved.timestamp, now.value);
  assert.equal(store.characterData.profiles['26623'].characterName, 'Tester');
  assert.match(store.localStorage.getItem('MST_CC_profiles'), /"26623"/);
});

test('profile_shared 缓存会淘汰过期资料并限制数量', () => {
  const now = {value: 10_000};
  const store = loadProfileStore(now);
  store.characterData.profiles = {
    expired: {characterID: 'expired', timestamp: 8_999},
    old: {characterID: 'old', timestamp: 9_100},
    middle: {characterID: 'middle', timestamp: 9_500},
    newest: {characterID: 'newest', timestamp: 9_900}
  };

  store.pruneProfiles();
  assert.deepEqual(Object.keys(store.characterData.profiles), [
    'newest', 'middle'
  ]);
  assert.equal(store.getProfile('expired'), null);

  now.value = 11_000;
  assert.equal(store.getProfile('middle'), null);
});

test('profile_shared 持久化时裁剪为最小字段集', () => {
  const now = {value: 1_800_000_000_000};
  const store = loadProfileStore(now);
  store.addProfileShared({
    characterName: 'Tester',
    profile: {
      combatLevel: 88,
      hideWearableItems: false,
      sharableCharacter: {
        id: 26623,
        name: 'Tester',
        specialChatIconHrid: '/chat_icons/special',
        chatIconHrid: '/chat_icons/normal',
        nameColorHrid: '/name_colors/rainbow',
        gameMode: 'standard',
        avatarHrid: '/avatars/lucky_koi',
        isDeleted: false
      },
      wearableItemMap: {
        w1: {
          itemLocationHrid: '/item_locations/head',
          itemHrid: '/items/cowboy_hat',
          enhancementLevel: 5,
          count: 1,
          characterID: 26623,
          name: 'Cowboy Hat',
          description: 'long description',
          craftRequirements: []
        },
        w2: {
          itemLocationHrid: '/item_locations/main_hand',
          itemHrid: '/items/wooden_sword',
          enhancementLevel: 0,
          count: 1,
          extraJunk: 'junk'
        }
      },
      characterSkills: [
        {skillHrid: '/skills/attack', level: 77, xp: 12345, characterID: 26623}
      ],
      equippedAbilities: [
        {abilityHrid: '/abilities/slash', level: 3, slotNumber: 1, characterID: 26623, junk: true}
      ],
      characterHouseRoomMap: {
        '/house_rooms/dining_room': {
          houseRoomHrid: '/house_rooms/dining_room',
          level: 4,
          characterID: 26623,
          junk: true
        }
      },
      guildBuffLevelMap: {
        '/guild_buffs/force_combat': {
          characterID: 26623,
          guildBuffHrid: '/guild_buffs/force_combat',
          level: 3,
          createdAt: '2026-08-07T13:08:29Z',
          updatedAt: '2026-08-07T13:08:29Z'
        },
        '/guild_buffs/scholar_combat': {
          guildBuffHrid: '/guild_buffs/scholar_combat',
          level: 1,
          junk: true
        }
      },
      characterAchievements: [
        {achievementHrid: '/achievements/first_blood'}
      ]
    }
  });
  const compact = JSON.parse(store.localStorage.getItem('MST_CC_profiles'))['26623'].profile;
  assert.deepEqual(compact.wearableItemMap.w1, {
    itemLocationHrid: '/item_locations/head',
    itemHrid: '/items/cowboy_hat',
    enhancementLevel: 5,
    count: 1
  });
  assert.deepEqual(compact.wearableItemMap.w2, {
    itemLocationHrid: '/item_locations/main_hand',
    itemHrid: '/items/wooden_sword',
    enhancementLevel: 0,
    count: 1
  });
  assert.deepEqual(compact.characterSkills, [
    {skillHrid: '/skills/attack', level: 77}
  ]);
  assert.deepEqual(compact.equippedAbilities, [
    {abilityHrid: '/abilities/slash', level: 3, slotNumber: 1}
  ]);
  assert.deepEqual(compact.characterHouseRoomMap, {'/house_rooms/dining_room': 4});
  // 公会增益等级保持官方对象结构，只去掉时间戳等无关字段，供着装评分神龛计算使用。
  assert.deepEqual(compact.guildBuffLevelMap, {
    '/guild_buffs/force_combat': {guildBuffHrid: '/guild_buffs/force_combat', level: 3},
    '/guild_buffs/scholar_combat': {guildBuffHrid: '/guild_buffs/scholar_combat', level: 1}
  });
  assert.deepEqual(compact.sharableCharacter, {
    name: 'Tester',
    specialChatIconHrid: '/chat_icons/special',
    chatIconHrid: '/chat_icons/normal',
    nameColorHrid: '/name_colors/rainbow',
    gameMode: 'standard'
  });
  assert.equal(compact.combatLevel, 88);
  assert.equal(compact.characterAchievements, undefined);
  assert.equal(compact.sharableCharacter.avatarHrid, undefined);
});

test('名片缓存超过容量上限时按最旧资料淘汰', () => {
  const now = {value: 10_000};
  const store = loadProfileStore(now);
  store.ctx.CONFIG.PROFILE_CACHE_MAX_BYTES = 500;
  const bigProfile = (char) => ({wearableItemMap: {a: {itemHrid: char.repeat(200)}}});
  store.characterData.profiles = {
    oldest: {characterID: 'oldest', timestamp: 1_000, profile: bigProfile('o')},
    middle: {characterID: 'middle', timestamp: 5_000, profile: bigProfile('m')},
    newest: {characterID: 'newest', timestamp: 9_000, profile: bigProfile('n')}
  };

  store.persistProfiles();
  assert.ok(store.localStorage.getItem('MST_CC_profiles').length <= 500);
  const stored = JSON.parse(store.localStorage.getItem('MST_CC_profiles'));
  assert.equal(stored.oldest, undefined);
  assert.equal(stored.middle, undefined);
  assert.ok(stored.newest);
});

test('localStorage 写入失败时逐条淘汰后重试', () => {
  const now = {value: 10_000};
  const store = loadProfileStore(now);
  let failCount = 1;
  const originalSetItem = store.localStorage.setItem.bind(store.localStorage);
  store.localStorage.setItem = (key, value) => {
    if (failCount-- > 0) throw new Error('QuotaExceededError');
    originalSetItem(key, value);
  };
  store.characterData.profiles = {
    oldest: {characterID: 'oldest', timestamp: 1_000, profile: {wearableItemMap: {}}},
    newest: {characterID: 'newest', timestamp: 9_000, profile: {wearableItemMap: {}}}
  };

  store.persistProfiles();
  assert.equal(store.characterData.profiles.oldest, undefined);
  assert.ok(store.characterData.profiles.newest);
  const stored = JSON.parse(store.localStorage.getItem('MST_CC_profiles'));
  assert.equal(stored.oldest, undefined);
  assert.ok(stored.newest);
});

test('读取旧版未裁剪缓存后自动重写为紧凑格式', () => {
  const now = {value: 10_000};
  const store = loadProfileStore(now);
  store.localStorage.setItem(
    'MST_CC_profiles',
    JSON.stringify({
      1: {
        type: 'profile_shared',
        characterID: '1',
        characterName: 'A',
        timestamp: 5_000,
        profile: {
          wearableItemMap: {
            a: {itemHrid: '/items/x', characterID: 1, junk: 'big'}
          },
          characterAchievements: [
            {}
          ]
        }
      }
    })
  );

  store.loadStoredProfiles();
  const stored = JSON.parse(store.localStorage.getItem('MST_CC_profiles'));
  assert.deepEqual(stored['1'].profile.wearableItemMap.a, {itemHrid: '/items/x'});
  assert.equal(stored['1'].profile.characterAchievements, undefined);
});

test('名片技能数据统一兼容直接等级、官方技能数组和旧 power 字段', () => {
  const adapter = loadCardDataAdapter();
  assert.equal(adapter.getSkillLevel({magicLevel: 88}, 'magic'), 88);
  assert.equal(
    adapter.getSkillLevel(
      {characterSkills: [
          {skillHrid: '/skills/ranged', level: 77}
        ]},
      '/skills/ranged'
    ),
    77
  );
  assert.equal(
    adapter.getSkillLevel(
      {characterSkills: [
          {skillHrid: '/skills/power', level: 66}
        ]},
      'melee',
      {allowLegacyPower: true}
    ),
    66
  );
  assert.equal(adapter.getSkillLevel({}, '/skills/cooking', {missingValue: null}), null);
});

test('其他角色名片不再调用第三方导出按钮或读取剪贴板', () => {
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');
  assert.doesNotMatch(cardSource, /autoClickExportButton|readClipboardData|导出人物到剪贴板/);
  assert.match(cardSource, /DataHub\.findProfileByName\(visibleProfileName\)/);
});

test('语言服务统一通知内部订阅者并保留兼容事件', () => {
  const {service, events} = loadLanguageEvents();
  const received = [];
  const unsubscribe = service.subscribe((detail) => received.push(detail.lang));
  service.emit('zh');
  unsubscribe();
  service.emit('en');

  assert.deepEqual(received, [
    'zh'
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'hccp-lang-changed');
  assert.equal(events[0].detail.lang, 'zh');
});

test('国际化文案与语言状态只通过统一服务管理', () => {
  assert.doesNotMatch(source, /\bisZH\b/);
  assert.match(source, /import \{\s*I18N_MESSAGE_GROUPS\s*\} from ['"]\.\.\/common\/messages\.js['"];/);
  assert.match(i18nMessagesSource, /export const I18N_MESSAGE_GROUPS = \{/);

  const businessSource = source.replace(readSourceFile('src', 'common', 'i18n.js'), '');
  assert.doesNotMatch(businessSource, /i18n\.currentLang/);
  assert.doesNotMatch(businessSource, /localStorage\.getItem\(['"](?:i18nextLng|lang-storage-key)['"]\)/);

  const i18n = loadI18n();
  assert.equal(i18n.messageIndex.askPriceAndTotal.zh, '左一 / 总价');
  assert.equal(i18n.messageIndex.bidPriceAndTotal.zh, '右一 / 总价');
  assert.equal(i18n.messageIndex.askPriceAndTotal.en, 'Best Ask Price / Total');
  assert.equal(i18n.messageIndex.bidPriceAndTotal.en, 'Best Bid Price / Total');
  for (const [
    moduleName, messages
  ] of Object.entries(i18n.messageGroups)) {
    for (const [
      key, message
    ] of Object.entries(messages)) {
      assert.equal(typeof message.zh, 'string', `${moduleName}.${key} 缺少中文文案`);
      assert.equal(typeof message.en, 'string', `${moduleName}.${key} 缺少英文文案`);
      assert.ok(message.zh.trim(), `${moduleName}.${key} 中文文案为空`);
      assert.ok(message.en.trim(), `${moduleName}.${key} 英文文案为空`);
    }
  }

  const literalKeys = [
    ...source.matchAll(/\bi18n\.t\(\s*['"]([^'"]+)['"]/g)
  ].map((match) => match[1]);
  const missingKeys = [
    ...new Set(literalKeys.filter((key) => !i18n.messageIndex[key]))
  ];
  assert.deepEqual(missingKeys, [], `i18n.t 引用了未定义文案：${missingKeys.join(', ')}`);

  assert.equal(i18n.setLanguage('zh-CN'), true);
  assert.equal(i18n.languageKey, 'zh');
  assert.equal(i18n.locale, 'zh-CN');
  assert.equal(i18n.t('characterCard'), '角色名片');
  assert.equal(i18n.setLanguage('en-US'), true);
  assert.equal(i18n.languageKey, 'en');
  assert.equal(i18n.locale, 'en-US');
  assert.equal(i18n.t('characterCard'), 'Character Card');

  assert.doesNotMatch(
    source,
    /new Error\(['"](?:战斗模拟超时|战斗模拟失败|Invalid character card data|initClientData is not ready|Failed to encode character card|html-to-image is not available)['"]\)/
  );
});

test('中文术语保留官方 House Room 译名和已确认的市场方向简称', () => {
  const i18n = loadI18n();
  const {messageIndex} = i18n;

  assert.equal(messageIndex.title.zh, '房屋升级材料计算器');
  assert.match(messageIndex.houseCalculatorHelp.zh, /勾选需要升级的房屋/);
  assert.match(messageIndex.houseCalculatorHelp.zh, /每个房屋按官方升级配置/);
  assert.match(messageIndex.houseCalculatorHelp.zh, /房屋数据、库存和市场价格/);
  assert.doesNotMatch(
    messageIndex.houseCalculatorHelp.zh,
    /勾选需要升级的房间|每个房间按官方升级配置|房间数据、库存和市场价格/
  );
  assert.equal(messageIndex.csvUpgradeHouses.zh, '升级房屋信息');
  assert.equal(messageIndex.selectHouseFirst.zh, '请至少选择一个房屋');
  assert.equal(messageIndex.roomIcon.zh, '房屋图标');
  assert.equal(messageIndex.upgradedHouses.zh, '[升级房屋]');
  assert.equal(messageIndex.initFailed.zh, '加载房屋数据失败，请检查控制台');
  assert.equal(messageIndex.houseNotFound.zh, '找不到房屋 {0} 的信息');
  assert.equal(messageIndex.upgradeNotFound.zh, '找不到房屋 {0} 等级 {1} 的升级信息');
  assert.equal(messageIndex.equipmentComparison.zh, '装备提升计算器');
  assert.equal(messageIndex.equipmentComparisonTitle.zh, '装备提升计算器');
  assert.match(messageIndex.equipmentComparisonHelp.zh, /战斗等级、房屋等级和成就/);
  assert.match(messageIndex.equipmentComparisonHelp.zh, /对比列表不展示护符、Trinket 和生活工具/);
  assert.doesNotMatch(messageIndex.equipmentComparisonHelp.zh, /战斗等级、房间等级和成就/);
  assert.doesNotMatch(messageIndex.equipmentComparisonHelp.zh, /对比列表不展示饰品和生活工具/);

  assert.equal(messageIndex.askPriceAndTotal.zh, '左一 / 总价');
  assert.equal(messageIndex.bidPriceAndTotal.zh, '右一 / 总价');
  assert.equal(messageIndex.askPriceAndTotal.en, 'Best Ask Price / Total');
  assert.equal(messageIndex.bidPriceAndTotal.en, 'Best Bid Price / Total');
  assert.equal(messageIndex.leftBuy.zh, '左买');
  assert.equal(messageIndex.rightBuy.zh, '右买');
  assert.equal(messageIndex.leftSell.zh, '左卖');
  assert.equal(messageIndex.rightSell.zh, '右卖');
  assert.equal(messageIndex.leftBuy.en, 'Ask Buy');
  assert.equal(messageIndex.rightBuy.en, 'Bid Buy');
  assert.equal(messageIndex.leftSell.en, 'Ask Sell');
  assert.equal(messageIndex.rightSell.en, 'Bid Sell');
});

test('语言控制器不覆盖原生 localStorage.setItem', () => {
  const controllerSource = readSourceFile('src', 'app', 'app-controller.js');
  assert.doesNotMatch(controllerSource, /localStorage\.setItem\s*=/);
  assert.doesNotMatch(controllerSource, /localStorage\.getItem\(/);
  assert.doesNotMatch(controllerSource, /patchLocalStorageEvent|hccp-local-storage-changed/);
  assert.match(
    controllerSource,
    /localStorage\.setItem\('i18nextLng', nextLang\);\s*this\.applyGameSetting\(nextLang\);/
  );
  assert.match(controllerSource, /i18n\.readPageLanguage\(\)/);
});

test('利润网语言读取页面自己的语言缓存', () => {
  assert.equal(loadI18n({isMilkonomySite: true, values: {'lang-storage-key': 'zhCn'}}).currentLang, 'zh');
  assert.equal(loadI18n({isMilkonomySite: true, values: {'lang-storage-key': 'zhTw'}}).currentLang, 'zh');
  assert.equal(loadI18n({isMilkonomySite: true, values: {'lang-storage-key': 'en'}}).currentLang, 'en');
  assert.equal(loadI18n({isMilkonomySite: true, documentLang: 'zh-CN'}).currentLang, 'zh');
});

test('游戏站语言仍读取 i18nextLng，不受利润网缓存影响', () => {
  const i18n = loadI18n({values: {i18nextLng: 'en', 'lang-storage-key': 'zhCn'}, documentLang: 'zh-CN'});
  assert.equal(i18n.currentLang, 'en');
});

test('Firefox 下游戏名词可通过页面语言资源桥读取中文', () => {
  const listeners = new Map();
  const resources = {
    en: {translation: {itemNames: {'/items/cheese': 'Cheese'}}},
    zh: {
      translation: {
        itemNames: {'/items/cheese': '奶酪'},
        skillNames: {'/skills/milking': '挤奶'},
        houseRoomNames: {'/house_rooms/kitchen': '厨房'},
        combatStats: {magicAccuracy: '魔法精准度', natureAmplify: '自然系增幅'},
        damageTypeNames: {'/damage_types/nature': '自然系'},
        equipmentTypeNames: {'/equipment_types/main_hand': '主手'}
      }
    }
  };
  const fakeWindow = {
    i18next: {store: {data: resources}},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((item) => item !== listener)
      );
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
    }
  };
  const fakeDocument = {
    createElement() {
      return {textContent: '', remove() {}};
    },
    querySelectorAll() {
      return [];
    },
    documentElement: {
      appendChild(script) {
        Function('window', 'document', 'CustomEvent', script.textContent)(fakeWindow, fakeDocument, CustomEvent);
      }
    }
  };
  const hub = loadDataHub({window: fakeWindow, document: fakeDocument});
  hub.initClientData({itemDetailMap: {'/items/cheese': {hrid: '/items/cheese', name: 'Cheese'}}}, 'test');

  assert.equal(hub.resolveItemName('/items/cheese'), '奶酪');
  assert.equal(hub.getLocalizedGameName('skillNames', '/skills/milking', 'zh'), '挤奶');
  assert.equal(hub.getLocalizedGameName('combatStats', 'magicAccuracy', 'zh'), '魔法精准度');
  assert.equal(hub.getLocalizedGameName('combatStats', 'natureAmplify', 'zh'), '自然系增幅');
  assert.equal(hub.getLocalizedGameName('damageTypeNames', '/damage_types/nature', 'zh'), '自然系');
  assert.equal(hub.getLocalizedGameName('equipmentTypeNames', '/equipment_types/main_hand', 'zh'), '主手');
});

test('公开事件统一使用 mst 模块前缀并保留 WebSocket 收发事件', () => {
  const runtimeSource = readSourceFile('src', 'common', 'runtime.js');
  const webSocketSource = extractBetween(/^\s*const WebSocketService = \{/m, /^\s*return WebSocketService;/m);
  assert.doesNotMatch(source, /mwi-integrated:|mwi:(?:ws:|init-|profile-)/);
  assert.match(webSocketSource, /this\.dispatch\('mst:ws:message', obj\)/);
  assert.match(webSocketSource, /self\.dispatch\('mst:ws:send'/);
  assert.match(runtimeSource, /export function createPageBridgeService/);
  assert.match(source, /ctx\.PageBridgeService = createPageBridgeService\(ctx\)/);
  assert.match(webSocketSource, /PageBridgeService\.install/);
  assert.doesNotMatch(webSocketSource, /pageWindow\.Function/);
  assert.doesNotMatch(webSocketSource, /pageWindow\.WebSocket\s*=\s*IntegratedWebSocket/);
  assert.match(webSocketSource, /mst:ws:message-raw/);
  assert.match(webSocketSource, /mst:ws:send-raw/);
  assert.match(webSocketSource, /mst:ws:init-client-data/);
  assert.match(webSocketSource, /mst:ws:init-character-data/);
  assert.match(webSocketSource, /mst:ws:profile-shared/);
  assert.match(source, /mst:data:character-updated/);
  assert.match(source, /mst:card:loadout-request/);
});

test('不同站点只初始化自身需要的组件和服务', () => {
  const configSource = extractBetween(
    /^\s*const CONFIG = \{/m,
    /^\s*if \(CONFIG\.isGameSite\) TemplateRenderer\.init\(\);/m
  );
  const dataInitIndex = findSourceMarker(/^\s*DataHub\.init\(\);/m);
  const houseDetailsIndex = findSourceMarker(/^\s*const houseDetails/m, dataInitIndex);
  assert.ok(dataInitIndex >= 0 && houseDetailsIndex > dataInitIndex, '找不到游戏数据初始化逻辑');
  const dataBootstrap = source.slice(Math.max(0, dataInitIndex - 40), houseDetailsIndex);
  const controllerSource = readSourceFile('src', 'app', 'app-controller.js');
  const appStart = controllerSource.indexOf('// app-controller');
  const bootstrapStart = controllerSource.indexOf('// bootstrap');
  const runtimeInstancesStart = controllerSource.indexOf('// runtime-instances');
  const appSource = controllerSource.slice(appStart, bootstrapStart);
  const bootstrapSource = controllerSource.slice(bootstrapStart, runtimeInstancesStart);
  const serviceBootstrap = controllerSource.slice(runtimeInstancesStart);
  assert.match(configSource, /isMilkonomySite:\s*hostname === 'milkonomy\.pages\.dev'/);
  assert.match(source, /if \(CONFIG\.isGameSite\) TemplateRenderer\.init\(\);/);
  assert.match(
    dataBootstrap,
    /if \(CONFIG\.isGameSite\) \{\s*DataHub\.init\(\);\s*WebSocketService\.install\(\);\s*\}/
  );
  assert.match(serviceBootstrap, /CONFIG\.isGameSite \? new MarketDataService\(ctx\) : null/);
  assert.match(serviceBootstrap, /CONFIG\.isGameSite \? new BuildScoreService\(ctx, ctx\.marketDataService\) : null/);
  assert.match(serviceBootstrap, /CONFIG\.isGameSite \? new HouseCalculator\(ctx, houseDetails\) : null/);
  assert.doesNotMatch(appSource, /new EdsMilkonomyFeature/);
  assert.match(bootstrapSource, /if \(CONFIG\.isGameSite \|\| CONFIG\.isMilkonomySite\)/);
  assert.match(bootstrapSource, /if \(CONFIG\.isGameSite\) \{\s*TemplateRenderer\.ready/);
});

test('利润网站 Toast 渲染不依赖未初始化的 uhtml', () => {
  const uiSource = readSourceFile('src', 'common', 'ui.js');
  const toastSource = uiSource.slice(uiSource.indexOf('// toast-notifier'), uiSource.indexOf('// swal-dialogs'));
  assert.doesNotMatch(toastSource, /TemplateRenderer/);
  assert.match(toastSource, /document\.createElement\('div'\)/);
  assert.match(toastSource, /document\.createDocumentFragment\(\)/);
  assert.match(toastSource, /this\._toastRoot\.replaceChildren\(fragment\)/);
});

test('uhtml 通过 @require 全局属性暴露给脚本运行时', () => {
  const uiSource = readSourceFile('src', 'common', 'ui.js');
  assert.match(
    headerSource,
    /@require\s+https:\/\/cdn\.jsdelivr\.net\/gh\/sunrishe\/mwi-sunrishe-toolkit@[0-9a-f]{40}\/vendor\/uhtml\/uhtml\.iife\.min\.js/
  );
  assert.doesNotMatch(headerSource, /mwi-sunrishe-toolkit@master\/vendor\/uhtml\/uhtml\.iife\.min\.js/);
  assert.match(uiSource, /globalThis\.uhtml/);
});

test('EDS 保留 GM 跨域配装写入、监听和读取链路', () => {
  const edsSource = readSourceFile('src', 'modules', 'eds-milkonomy', 'index.js');
  const marketSource = readSourceFile('src', 'common', 'market.js');
  const runtimeSource = readSourceFile('src', 'common', 'runtime.js');
  assert.match(headerSource, /@grant\s+GM_setClipboard/);
  assert.match(headerSource, /@grant\s+GM\.setClipboard/);
  assert.match(headerSource, /@grant\s+GM_addValueChangeListener/);
  assert.match(headerSource, /@grant\s+GM\.addValueChangeListener/);
  assert.match(headerSource, /@grant\s+GM\.getValue/);
  assert.match(headerSource, /@grant\s+GM\.setValue/);
  assert.match(runtimeSource, /export function createGmApi\(\)/);
  assert.match(runtimeSource, /setClipboardApi\(\)/);
  assert.match(runtimeSource, /GM_setClipboard/);
  assert.match(runtimeSource, /getModernApi\('setClipboard'\)/);
  assert.match(runtimeSource, /GmApi\.setClipboard\(String\(text\), 'text'\)/);
  assert.match(edsSource, /GmApi\.setValue\(STORAGE_KEYS\.MILKONOMY_PRESET, preset\)/);
  assert.match(edsSource, /GmApi\.addValueChangeListener\(STORAGE_KEYS\.MILKONOMY_PRESET/);
  assert.match(edsSource, /GmApi\.getValue\(STORAGE_KEYS\.MILKONOMY_PRESET\)/);
  assert.match(marketSource, /GmApi\.xmlHttpRequest/);
  assert.doesNotMatch(edsSource, /GM_setClipboard|GM\.setClipboard/);
  assert.doesNotMatch(edsSource, /(?<!typeof )GM_setValue\(/);
  assert.doesNotMatch(edsSource, /(?<!typeof )GM_getValue\(/);
  assert.doesNotMatch(edsSource, /(?<!typeof )GM_addValueChangeListener\(/);
  assert.doesNotMatch(marketSource, /GM_xmlhttpRequest|GM\.xmlHttpRequest/);
  assert.match(edsSource, /mst:eds:milkonomy-preset/);
});

test('游戏原生跳转和配装读取失败时保留 Firefox 诊断信息', () => {
  const edsSource = readSourceFile('src', 'modules', 'eds-milkonomy', 'index.js');
  const cardSource = readSourceFile('src', 'modules', 'character-card', 'index.js');
  const dataSource = readSourceFile('src', 'common', 'data.js');
  const runtimeSource = readSourceFile('src', 'common', 'runtime.js');
  assert.match(dataSource, /findGameHostFromFiber/);
  assert.match(dataSource, /handleSwitchCharacter/);
  assert.match(dataSource, /handleGoToMarketplace/);
  assert.match(dataSource, /\[class\*="GamePage_gamePage__/);
  assert.match(runtimeSource, /installPageBridge/);
  assert.match(runtimeSource, /mst:navigation:open-marketplace/);
  assert.match(runtimeSource, /mst:navigation:switch-character/);
  assert.match(runtimeSource, /bridgeDiagnostics/);
  assert.match(runtimeSource, /\[MST\] 未找到游戏原生跳转入口:/);
  assert.match(runtimeSource, /hostKeys/);
  assert.match(runtimeSource, /hostReadError/);
  assert.match(edsSource, /\[MST\] 未找到当前配装:/);
  assert.match(edsSource, /reactReadError/);
  assert.match(edsSource, /loadoutNames/);
  assert.match(cardSource, /\[MST\] 配装名片数据转换失败:/);
});

test('本地调试服务把本地 @require 保持在 @require 分组中', () => {
  const watchServerSource = readSourceFile('scripts', 'watch-server.mjs');
  assert.match(watchServerSource, /lastRequireMatch/);
  assert.match(watchServerSource, /header\.matchAll/);
  assert.match(watchServerSource, /@require/);
  assert.match(watchServerSource, /insertAt/);
  assert.match(watchServerSource, /pathToFileURL\(devScriptPath\)\.href/);
  assert.match(watchServerSource, /MST-local-debug\.user\.js/);
  assert.match(watchServerSource, /MST-http-debug\.user\.js/);
});

test('老利润网可从 GM 同步配装并过滤新利润网扩展字段', async () => {
  const preset = {
    name: 'Sunrishe',
    color: '#90ee90',
    actionConfigMap: {magic: {action: 'magic', back: {type: 'back', hrid: '/items/test_back'}}},
    specialEquimentMap: {head: {type: 'head', hrid: '/items/test_helmet'}},
    communityBuffMap: {experience: {level: 3}},
    achievementBuffMap: {beginner: {enabled: true}},
    seals: [
      '/items/seal_of_test'
    ]
  };
  const localStorage = createMemoryStorage({'player-action-config-presets': JSON.stringify({invalid: true})});
  const toasts = [];
  const feature = loadMstEdsFeature({
    runtime: {
      hostname: 'milkonomy.pages.dev',
      CONFIG: {characterId: null, isGameSite: false, isMilkonomySite: true},
      localStorage,
      GmApi: {
        getValue() {
          return preset;
        },
        setValue() {},
        addValueChangeListener() {}
      },
      Notifier: {
        toast(...args) {
          toasts.push(args);
        }
      }
    }
  });

  assert.equal(await feature.syncMilkonomyPreset(), true);
  const stored = JSON.parse(localStorage.getItem('player-action-config-presets'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, preset.name);
  assert.equal('back' in stored[0].actionConfigMap.magic, false);
  assert.equal('achievementBuffMap' in stored[0], false);
  assert.equal('seals' in stored[0], false);
  assert.equal(localStorage.getItem('player-action-preset-index'), '0');
  assert.deepEqual(toasts, [
    [
      'syncedMilkonomy', 'success'
    ]
  ]);
});

test('新利润网 hyhfish 同步时保留完整扩展字段', async () => {
  const preset = {
    name: 'Sunrishe',
    actionConfigMap: {magic: {action: 'magic', back: {type: 'back'}}},
    specialEquimentMap: {},
    communityBuffMap: {},
    achievementBuffMap: {beginner: {enabled: true}},
    seals: [
      '/items/seal_of_test'
    ]
  };
  const localStorage = createMemoryStorage({
    'player-action-config-presets': JSON.stringify([
      {name: preset.name, stale: true}
    ])
  });
  const feature = loadMstEdsFeature({
    runtime: {
      hostname: 'hyhfish.github.io',
      CONFIG: {characterId: null, isGameSite: false, isMilkonomySite: true},
      localStorage,
      GmApi: {
        getValue() {
          return preset;
        },
        setValue() {},
        addValueChangeListener() {}
      },
      Notifier: {toast() {}}
    }
  });

  assert.equal(await feature.syncMilkonomyPreset(), true);
  const stored = JSON.parse(localStorage.getItem('player-action-config-presets'));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], preset);
  assert.equal(localStorage.getItem('player-action-preset-index'), '0');
});

test('EDS 静态同步范围与原脚本保持一致', () => {
  const original = loadOriginalEdsConverter();
  const integrated = loadMstEdsFeature();
  const normalize = (value) => JSON.parse(JSON.stringify(value));

  assert.deepEqual(
    [
      ...integrated.constructor.INCLUDE_ITEM_HRIDS
    ].sort(),
    Object.keys(original.INCLUDE_ITEMS).sort()
  );
  assert.deepEqual(normalize(integrated.constructor.SKILL_TO_HOUSE_MAP), normalize(original.SKILL_TO_HOUSE_MAP));
  assert.deepEqual(normalize(integrated.constructor.ACTION_LOCATIONS), normalize(original.ACTION_LOCATIONS));
  assert.deepEqual(normalize(integrated.constructor.EQUIPMENT_LOCATIONS), normalize(original.EQUIPMENT_LOCATIONS));
  assert.deepEqual(normalize(integrated.constructor.BUFF_TYPES), normalize(original.BUFF_TYPES));
  assert.deepEqual(normalize(integrated.constructor.ACHIEVEMENT_TIER_MAP), normalize(original.ACHIEVEMENT_TIER_MAP));
  assert.deepEqual(normalize(integrated.constructor.COMBAT_ACHIEVEMENTS), normalize(original.COMBAT_ACHIEVEMENTS));
});

test('EDS 同步物品使用的官方装备元数据与原配置一致', () => {
  const original = loadOriginalEdsConverter();
  const normalizeRequirements = (requirements) =>
    (requirements || [])
      .map((item) => ({skillHrid: item.skillHrid, level: item.level}))
      .sort((left, right) => left.skillHrid.localeCompare(right.skillHrid));

  Object.entries(original.INCLUDE_ITEMS).forEach(
    ([
      itemHrid, legacy
    ]) => {
      const current = clientData.itemDetailMap[itemHrid];
      assert.ok(current?.equipmentDetail, `${itemHrid} 缺少官方装备详情`);
      assert.equal(current.equipmentDetail.type, legacy.type, `${itemHrid} 装备类型发生变化`);
      assert.equal(current.itemLevel, legacy.itemLevel, `${itemHrid} 物品等级发生变化`);
      assert.equal(
        JSON.stringify(normalizeRequirements(current.equipmentDetail.levelRequirements)),
        JSON.stringify(normalizeRequirements(legacy.levelRequirements)),
        `${itemHrid} 等级要求发生变化`
      );
    }
  );
});

test('EDS 生活配装转换结果与原脚本一致', () => {
  const original = loadOriginalEdsConverter();
  const itemHrid = '/items/azure_alembic';
  const itemDetail = original.INCLUDE_ITEMS[itemHrid];
  const characterData = {
    character: {id: 427012, name: 'Sunrishe'},
    characterItems: [
      {itemHrid, itemLocationHrid: '/item_locations/alchemy_tool', enhancementLevel: 7, count: 1}
    ],
    characterSkills: [
      {skillHrid: '/skills/alchemy', level: 88}
    ],
    characterHouseRoomMap: {
      '/house_rooms/laboratory': {level: 6}
    },
    actionTypeDrinkSlotsMap: {'/action_types/alchemy': [
        {itemHrid: '/items/ultra_magic_coffee'}, null
      ]},
    communityBuffs: [
      {hrid: '/community_buff_types/experience', level: 3}
    ],
    characterAchievements: [],
    characterBuffs: []
  };
  const integrated = loadMstEdsFeature({
    raw: characterData,
    itemMap: {
      [itemHrid]: {
        hrid: itemHrid,
        name: itemDetail.name,
        itemLevel: itemDetail.itemLevel,
        equipmentDetail: {type: itemDetail.type, levelRequirements: itemDetail.levelRequirements}
      }
    }
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(integrated.convert(characterData))),
    JSON.parse(JSON.stringify(original.convert(characterData)))
  );
});

test('EDS 使用真实角色数据时的老利润网和新利润网输出均与原脚本一致', () => {
  const original = loadOriginalEdsConverter();
  const integrated = loadMstEdsFeature({raw: characterDataFixture, itemMap: clientData.itemDetailMap});
  const normalize = (value) => JSON.parse(JSON.stringify(value));
  const originalPreset = original.convert(characterDataFixture);
  const integratedPreset = integrated.convert(characterDataFixture);

  assert.deepEqual(normalize(integratedPreset), normalize(originalPreset));
  assert.deepEqual(
    normalize(integrated.filterPresetForTarget(integratedPreset, 'milkonomy')),
    normalize(original.filterConvertData(originalPreset))
  );
  assert.deepEqual(normalize(integrated.filterPresetForTarget(integratedPreset, 'hyhfish')), normalize(originalPreset));
});

test('EDS 初始化转换优先使用统一内存中的官方角色原包', () => {
  const raw = {
    character: {id: 427012, name: 'WS Character'},
    characterItems: [
      {itemHrid: '/items/azure_alembic'}
    ],
    characterSkills: [
      {skillHrid: '/skills/alchemy', level: 88}
    ],
    characterHouseRoomMap: {
      '/house_rooms/laboratory': {level: 6}
    },
    actionTypeDrinkSlotsMap: {'/action_types/alchemy': []},
    communityBuffs: [
      {hrid: '/community_buff_types/experience', level: 3}
    ],
    characterAchievements: [
      {achievementHrid: '/achievements/test', isCompleted: true}
    ],
    characterBuffs: [
      {hrid: '/personal_buff_types/test'}
    ]
  };
  const reactData = {
    character: {id: 1, name: 'Stale React Character'},
    characterItemMap: [],
    characterSkillMap: new Map(),
    actionTypeDrinkSlotsDict: {},
    communityBuffs: [],
    characterBuffs: []
  };
  const gameData = loadMstEdsFeature({raw, reactData}).getGameData();

  assert.equal(gameData.character, raw.character);
  assert.equal(gameData.characterItems, raw.characterItems);
  assert.equal(gameData.characterSkills, raw.characterSkills);
  assert.equal(gameData.actionTypeDrinkSlotsMap, raw.actionTypeDrinkSlotsMap);
  assert.equal(gameData.communityBuffs, raw.communityBuffs);
  assert.equal(gameData.characterAchievements, raw.characterAchievements);
  assert.equal(gameData.characterBuffs, raw.characterBuffs);
});

test('EDS 战斗配装导出与原脚本保持一致', () => {
  const original = loadOriginalEdsCombatConverter();
  const integrated = loadMstCombatConverter();
  const loadout = {
    wearableMap: {'/item_locations/main_hand': '427012::/item_locations/main_hand::/items/azure_sword::12'},
    foodItemHrids: [
      '/items/dragon_fruit_gummy'
    ],
    drinkItemHrids: [
      '/items/ultra_magic_coffee'
    ],
    abilityMap: {'/ability_slots/1': '/abilities/quick_shot'},
    abilityCombatTriggersMap: {ability: [
        {conditionHrid: '/combat_trigger_conditions/always'}
      ]},
    consumableCombatTriggersMap: {drink: [
        {conditionHrid: '/combat_trigger_conditions/always'}
      ]}
  };
  const characterData = {
    characterSkills: [
      {skillHrid: '/skills/stamina', level: 80}, {skillHrid: '/skills/ranged', level: 95}
    ],
    characterAbilities: [
      {abilityHrid: '/abilities/quick_shot', level: 6}
    ],
    characterHouseRoomMap: {'/house_rooms/archery_range': {level: 7}},
    characterAchievements: [
      {achievementHrid: '/achievements/test', isCompleted: true}
    ]
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(integrated.convert(loadout, characterData))),
    JSON.parse(JSON.stringify(original.convert(loadout, characterData)))
  );
});

test('EDS 当前配装在 Firefox 读不到 React props 时回退到官方角色原包', () => {
  const rawLoadout = {
    id: 344578,
    name: '近战-枪',
    actionTypeHrid: '/action_types/combat',
    wearableMap: {'/item_locations/main_hand': '427012::/item_locations/main_hand::/items/azure_sword::12'}
  };
  const feature = loadMstEdsFeature({
    raw: {characterLoadoutMap: {344578: rawLoadout}},
    reactData: {},
    runtime: {
      GameUiAdapter: {
        query(name) {
          if (name !== 'loadoutMetadata') return null;
          return {
            querySelector(selector) {
              return selector === 'svg' || selector === 'button' ? {} : null;
            }
          };
        }
      },
      utils: {
        substrLastSlash(value) {
          return String(value || '')
            .split('/')
            .pop();
        },
        getReactComponentProps() {
          return {};
        },
        getCollectionValues(collection) {
          if (Array.isArray(collection)) return collection;
          if (collection instanceof Map) return [
              ...collection.values()
            ];
          if (collection && typeof collection === 'object') return Object.values(collection);
          return [];
        },
        getTextBetween() {
          return '近战-枪';
        }
      }
    }
  });

  const {loadout} = feature.getCombatLoadout({});
  assert.equal(loadout, rawLoadout);
});

test('统一角色数据跟进 EDS 依赖的官方 WS 增量字段', () => {
  const hub = loadDataHub();
  hub.characterData.raw = {characterAchievements: [
      {achievementHrid: '/achievements/old', isCompleted: true}
    ], actionTypeFoodSlotsMap: {}, actionTypeDrinkSlotsMap: {}, communityBuffs: [], characterBuffs: []};

  hub.applyCharacterMessage({type: 'achievements_updated', achievements: [
      {achievementHrid: '/achievements/new', isCompleted: true}
    ]});
  hub.applyCharacterMessage({
    type: 'action_type_consumable_slots_updated',
    actionTypeFoodSlotsMap: {'/action_types/combat': []},
    actionTypeDrinkSlotsMap: {'/action_types/alchemy': [
        {itemHrid: '/items/ultra_magic_coffee'}
      ]}
  });
  hub.applyCharacterMessage({type: 'community_buffs_updated', communityBuffs: [
      {hrid: '/community_buff_types/experience', level: 4}
    ]});
  hub.applyCharacterMessage({type: 'personal_buffs_updated', characterBuffs: [
      {hrid: '/personal_buff_types/gathering', expiresAt: '2099-01-01'}
    ]});

  assert.equal(hub.characterData.raw.characterAchievements.length, 2);
  assert.equal(
    hub.characterData.raw.actionTypeDrinkSlotsMap['/action_types/alchemy'][0].itemHrid,
    '/items/ultra_magic_coffee'
  );
  assert.equal(hub.characterData.raw.communityBuffs[0].level, 4);
  assert.equal(hub.characterData.raw.characterBuffs[0].hrid, '/personal_buff_types/gathering');
});

test('名片模块只按数据、渲染、导出等真实边界拆分', () => {
  const adapterSource = readSourceFile('src', 'modules', 'character-card', 'data.js');
  const rendererSource = readSourceFile('src', 'modules', 'character-card', 'renderer.js');
  const exporterSource = readSourceFile('src', 'modules', 'character-card', 'exporter.js');
  const moduleSource = readSourceFile('src', 'modules', 'character-card', 'index.js');
  assert.match(adapterSource, /characterCardWsDataAdapter/);
  assert.match(adapterSource, /fromCharacterData\(parsedData\)/);
  assert.match(rendererSource, /CardRenderer\.character = function/);
  assert.match(exporterSource, /export class CharacterCardImageExporter/);
  assert.match(exporterSource, /export class CharacterCardExportCanvas/);
  assert.match(moduleSource, /createCharacterCardDataAdapter/);
  assert.match(moduleSource, /createCharacterCardRenderer/);
  assert.match(moduleSource, /export class CharacterCardDialogController/);
  assert.match(moduleSource, /export class CharacterCardMemberService/);
  assert.match(moduleSource, /createCharacterCardImageExporter/);
  assert.match(moduleSource, /export class CharacterCardStandaloneController/);
  assert.match(moduleSource, /export class CharacterCardTeamController/);
  assert.doesNotMatch(
    rendererSource,
    /CharacterName_(?:characterName__2FqyZ|chatIcon__22lxV|name__1amXp|gameMode__2Pvw8)/
  );
});

test('战斗模拟 Worker 入口独立成模块，聚合器只负责装配', () => {
  const workerSource = readSourceFile('src', 'modules', 'equipment-comparison', 'worker-runtime.js');
  const equipmentInstallerSource = readSourceFile('src', 'modules', 'index.js');
  const commonUiSource = readSourceFile('src', 'common', 'ui.js');
  assert.match(workerSource, /^export function mstCombatWorkerRuntime/m);
  assert.doesNotMatch(equipmentInstallerSource, /function mstCombatWorkerRuntime/);
  assert.match(source, /const utils = \{[\s\S]*?normalizeItemHrid\(value\)/);
  assert.match(commonUiSource, /_enableBoundedDragging\(popup\)/);
  assert.match(commonUiSource, /toastNotifierMethods/);
  assert.match(readSourceFile('src', 'app', 'app-controller.js'), /function installAppStyles\(\)/);
  assert.match(readSourceFile('src', 'app', 'app-controller.js'), /installAppStyles\(\)/);
});

test('市场指导价优先读官方 localStorageUtil，缺价时用于兜底估值', () => {
  const marketValues = {'/items/bag_of_10_cowbells': {0: 800000}};
  const loadMarketService = ({pageWindow = {}, localStorage}) =>
    vm.runInNewContext(
      `${readVmSource('src/common/market.js')}
          new MarketDataService({pageWindow, DataHub: {lzDecompressUTF16() { return null; }}});`,
      {console, localStorage, pageWindow}
    );

  // 官方缓存工具优先，不触碰 localStorage。
  // 游戏真实实现的方法体依赖 this（this.safeGetItem/this.Keys），mock 也按此建模，
  // 防止实现退化成“取出函数裸调”导致 this 丢失而误走本地缓存兜底。
  const official = loadMarketService({
    pageWindow: {
      localStorageUtil: {
        marketValues,
        getMarketItemValues() {
          return {marketValuesVersion: 'v1', marketItemValues: this.marketValues};
        }
      }
    },
    localStorage: {
      getItem() {
        throw new Error('不应读取 localStorage');
      }
    }
  });
  official.loadMarketItemValues();
  assert.equal(official.getMarketValue('/items/bag_of_10_cowbells', 0), 800000);
  assert.equal(official.getMarketValue('/items/bag_of_10_cowbells', 3), 0);

  // 无官方工具时解析 localStorage 明文缓存。
  const fallback = loadMarketService({
    pageWindow: {},
    localStorage: {
      getItem(key) {
        return key === 'marketItemValues' ? JSON.stringify({marketItemValues: marketValues}) : null;
      }
    }
  });
  fallback.loadMarketItemValues();
  assert.equal(fallback.getMarketValue('/items/bag_of_10_cowbells', 0), 800000);

  // 挂单数据全缺时 getPrice 回落到市场价值。
  fallback.marketData = {};
  assert.equal(fallback.getPrice('/items/bag_of_10_cowbells', 0), 800000);
  assert.equal(fallback.getPrice('/items/bag_of_10_cowbells', 0) && fallback.getPrice('/items/coin', 0), 1);
});

test('市场价格统一按有效正数取值，缺价哨兵 0/-1 不再透传', () => {
  const service = vm.runInNewContext(
    `${readVmSource('src/common/market.js')}
        new MarketDataService({pageWindow: {}, DataHub: {lzDecompressUTF16() { return null; }}});`,
    {console, localStorage: {getItem: () => null}, pageWindow: {}}
  );
  service.marketData = {
    '/items/sentinel_neg': {
      0: {a: -1, p: 200, b: 300}
    },
    '/items/sentinel_zero': {
      0: {a: 0, b: 400}
    },
    '/items/sentinel_all_missing': {
      0: {a: -1, p: -1, b: -1}
    },
    '/items/sentinel_ask_only': {
      0: {a: 120, p: 0, b: -1}
    }
  };

  // 负数哨兵不参与取值，回退到第一个有效正数侧。
  assert.equal(service.getPrice('/items/sentinel_neg', 0), 200);
  // 0 哨兵同样不参与，回退到有效买价。
  assert.equal(service.getPrice('/items/sentinel_zero', 0), 400);
  // 全缺时回落到官方市场价值（无即 0）。
  assert.equal(service.getPrice('/items/sentinel_all_missing', 0), 0);
  // 单侧有效时直接取该侧。
  assert.equal(service.getPrice('/items/sentinel_ask_only', 0), 120);
  // 金币恒为 1。
  assert.equal(service.getPrice('/items/coin', 0), 1);
});

test('构建开关只保留正式包实际消费的 showLanguageToggle', () => {
  const source = readSourceFile('src', 'common', 'build-flags.js');
  assert.match(source, /showLanguageToggle/);
  assert.doesNotMatch(source, /BUILD_ENV|showDebugInfo|enableDevMenu|isDev:/);
});

test('角色数据服务延迟解析 utils：真实启动顺序（utils 晚于服务构造安装）下可正常调用', () => {
  const DataHub = {
    // raw 不含 characterItems，走 getCollectionValues(characterItemMap) 兜底分支。
    characterData: {raw: {}},
    getClientData() {
      return {levelExperienceTable: [
          0, 100, 250
        ]};
    },
    getGameState() {
      return {characterItemMap: {a: {itemHrid: '/items/a', count: 1, itemLocationHrid: '/item_locations/inventory'}}};
    }
  };
  const ctx = {DataHub};
  const context = {
    console,
    ctx,
    DataHub,
    window: {dispatchEvent() {}}
  };
  const service = vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createCharacterDataService(ctx, DataHub);`,
    context
  );
  // 模拟 installRuntimeHelpers 在 installDataModule 之后挂载 utils；
  // 若服务构造时解构 utils，这里会读到 undefined 并导致 clampLevel 调用崩溃。
  ctx.utils = {
    clampLevel(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || min));
    },
    getCollectionValues(collection) {
      return Object.values(collection || {});
    },
    normalizeItemHrid(value) {
      const itemId = String(value || '')
        .replace(/^#/, '')
        .replace(/^\/items\//, '');
      return itemId ? '/items/' + itemId : '';
    }
  };
  assert.equal(service.getLevelExperience(1), 100);
  assert.equal(service.getLevelExperiencePercent(1, 100), 0);
  assert.equal(service.getLevelExperiencePercent(1, 250), 100);
  assert.equal(service.getCharacterItems().length, 1);
  // 房屋材料缺口等路径依赖 getInventoryCount（经 this.utils.normalizeItemHrid 匹配背包物品）。
  assert.equal(service.getInventoryCount('/items/a'), 1);
  assert.equal(service.getInventoryCount('/items/not_owned'), 0);
});

test('角色数据服务读取当前战斗配装已装备技能并按槽位排序', () => {
  // 多个配装混排：只取 combat 配装的 abilityMap，按槽位号排序，空槽位过滤。
  const loadoutMap = {
    1: {id: 1, name: '生活', actionTypeHrid: '/action_types/life', abilityMap: {0: '/abilities/not_combat'}},
    2: {
      id: 2,
      name: '战斗',
      actionTypeHrid: '/action_types/combat',
      abilityMap: {
        3: '/abilities/third',
        1: '/abilities/first',
        4: '',
        2: '/abilities/second'
      }
    }
  };
  const DataHub = {
    characterData: {raw: {characterLoadoutMap: loadoutMap}},
    getGameState() {
      return {};
    }
  };
  const ctx = {DataHub};
  const service = vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createCharacterDataService(ctx, DataHub);`,
    {console, ctx, DataHub, window: {dispatchEvent() {}}}
  );
  assert.deepEqual(
    [
      ...service.getEquippedAbilityHrids()
    ],
    [
      '/abilities/first', '/abilities/second', '/abilities/third'
    ]
  );
});

test('角色数据服务无角色原包时从游戏状态读取战斗配装技能，无配装返回空', () => {
  const loadoutMap = {
    9: {id: 9, actionTypeHrid: '/action_types/combat', abilityMap: {0: '/abilities/only'}}
  };
  const DataHub = {
    characterData: {raw: {}},
    getGameState() {
      return {characterLoadoutMap: loadoutMap};
    }
  };
  const ctx = {DataHub};
  const service = vm.runInNewContext(
    `${readVmSource('src/common/data.js')}
        createCharacterDataService(ctx, DataHub);`,
    {console, ctx, DataHub, window: {dispatchEvent() {}}}
  );
  // raw 缺失时回退游戏状态中的战斗配装。
  assert.deepEqual(
    [
      ...service.getEquippedAbilityHrids()
    ],
    [
      '/abilities/only'
    ]
  );
  // 只有生活配装或完全没有配装时都返回空数组。
  DataHub.getGameState = () => ({
    characterLoadoutMap: {5: {id: 5, actionTypeHrid: '/action_types/life', abilityMap: {0: '/abilities/life'}}}
  });
  assert.deepEqual(
    [
      ...service.getEquippedAbilityHrids()
    ],
    []
  );
  DataHub.getGameState = () => ({});
  assert.deepEqual(
    [
      ...service.getEquippedAbilityHrids()
    ],
    []
  );
});
