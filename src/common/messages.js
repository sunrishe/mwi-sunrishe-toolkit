// 所有界面文案集中维护；业务模块只通过 i18n key 取值，避免散落硬编码。
// common-messages
export const COMMON_MESSAGES = {
  name: {zh: '名称', en: 'Name'},
  error: {zh: '错误', en: 'Error'},
  marketDataTime: {zh: '市场数据时间', en: 'Market Data Time'},
  marketNoData: {zh: '无市场数据', en: 'No Market Data'},
  noCharacterData: {zh: '暂无角色数据，请刷新页面重试', en: 'No character data. Please refresh.'},
  upgradeCalculator: {zh: '升级计算器', en: 'Upgrade Calculator'},
  calculatorDataNotReady: {
    zh: '游戏数据尚未加载完成，请稍后重试',
    en: 'Game data is not ready. Please try again shortly.'
  },
  navigationUnavailable: {zh: '未找到游戏原生跳转入口', en: 'The native game navigation handler was not found.'},
  startLevel: {zh: '起始等级', en: 'Start Level'},
  targetLevel: {zh: '目标等级', en: 'Target Level'},
  commonStartLevel: {zh: '选择常用起始等级', en: 'Choose Common Start Level'},
  commonTargetLevel: {zh: '选择常用目标等级', en: 'Choose Common Target Level'},
  currentLevel: {zh: '当前等级', en: 'Current Level'},
  currentExperience: {zh: '当前经验', en: 'Current XP'},
  endExperience: {zh: '结束经验', en: 'End XP'},
  experiencePercent: {zh: '经验百分比', en: 'XP Percent'},
  remove: {zh: '移除', en: 'Remove'},
  actions: {zh: '操作', en: 'Action'},
  close: {zh: '关闭', en: 'Close'},
  confirm: {zh: '确定', en: 'OK'},
  dayUnit: {zh: '天', en: 'd'},
  messageSeparator: {zh: '；', en: '; '},
  marketPriceUnavailable: {zh: '暂无市场数据', en: 'No market data'},
  clipboardUnavailable: {zh: '当前环境不支持剪贴板 API', en: 'Clipboard API is unavailable'}
};

// house-calculator-messages
export const HOUSE_CALCULATOR_MESSAGES = {
  title: {zh: '房屋升级材料计算器', en: 'House Upgrade Material Calculator'},
  houseCalculatorHelpTitle: {zh: '查看房屋升级说明', en: 'View house upgrade instructions'},
  houseCalculatorHelp: {
    zh: '使用：勾选需要升级的房屋，分别设置每个房屋的起始等级和目标等级；也可以用顶部批量等级快速设置。起始等级会优先读取当前角色房屋数据，重置等级会恢复为当前读取到的房屋等级。\n\n计算：未勾选任何房屋时不会计算材料。每个房屋按官方升级配置逐级累加材料，并结合当前背包库存计算缺口；结果会显示升级房屋、市场数据时间、材料种类、缺少数量、总价值、所需金币、已有材料价值和缺口价值。\n\n操作：物品显示格式可在名称和 HRID 之间切换，导出 CSV 会导出当前计算结果。MWITools 购物车就绪后，可以把缺失材料加入购物车；只会加入缺口材料，不会自动下单。\n\n限制：房屋数据、库存和市场价格来自当前游戏页面已加载数据；市场缺价时对应价值可能为 0 或不完整。',
    en: "Usage: Select the house rooms to upgrade, then set each room's start and target levels. The batch level controls can quickly set multiple rows. Start levels prefer the current character house data, and Reset Levels restores the levels currently read from the game.\n\nCalculation: No materials are calculated until at least one room is selected. Each selected room sums official upgrade costs level by level, then compares them with current inventory to calculate shortages. Results include selected upgrades, market data time, material types, missing quantity, total value, required coins, owned material value, and shortfall value.\n\nActions: Item display can switch between names and HRIDs, and Export CSV exports the current result. When MWI Market Mate is installed and ready, missing materials can be added to its cart; only shortages are added, and no orders are placed automatically.\n\nLimits: House data, inventory, and market prices come from the data currently loaded on the game page. Missing market prices can make related values 0 or incomplete."
  },
  trigger: {zh: '升级计算器', en: 'Upgrade Calculator'},
  selectLife: {zh: '生活', en: 'Skilling'},
  selectCombat: {zh: '战斗', en: 'Combat'},
  batchStart: {zh: '批量起始等级', en: 'Batch Start Level'},
  batchTarget: {zh: '批量目标等级', en: 'Batch Target Level'},
  refreshLevels: {zh: '重置等级', en: 'Reset Levels'},
  itemDisplayFormat: {zh: '物品显示格式：', en: 'Item Display Format:'},
  exportCsv: {zh: '导出CSV', en: 'Export CSV'},
  csvFilenamePrefix: {zh: 'MWI房屋升级材料计算结果', en: 'MWI_House_Upgrade_Materials_Result'},
  noResultToExport: {zh: '暂无可导出的计算结果', en: 'No results to export.'},
  csvMarketTime: {zh: '市场数据时间', en: 'Market Data Time'},
  csvUpgradeHouses: {zh: '升级房屋信息', en: 'House Upgrades'},
  csvMaterialKinds: {zh: '材料种类', en: 'Material Types'},
  csvHrid: {zh: 'HRID', en: 'HRID'},
  csvName: {zh: '名称', en: 'Name'},
  csvRequiredCount: {zh: '所需数量', en: 'Required Quantity'},
  csvAvailableCount: {zh: '已有数量', en: 'Owned Quantity'},
  csvMissingCount: {zh: '缺少数量', en: 'Missing Quantity'},
  csvMarketPrice: {zh: '市场单价', en: 'Unit Market Price'},
  csvTotalValue: {zh: '总价值', en: 'Total Value'},
  csvValueGap: {zh: '缺口价值', en: 'Shortfall Value'},
  csvRequiredCoins: {zh: '所需金币', en: 'Required Coins'},
  csvMaterialValue: {zh: '材料价值', en: 'Material Value'},
  resultPlaceholder: {zh: '计算结果将显示在这里...', en: 'Upgrade material results will appear here...'},
  selectHouseFirst: {zh: '请至少选择一个房屋', en: 'Please select at least one house.'},
  roomIcon: {zh: '房屋图标', en: 'Room icon'},
  upgradedHouses: {zh: '[升级房屋]', en: '[Houses to Upgrade]'},
  summaryInfo: {zh: '[汇总信息]', en: '[Summary]'},
  listSeparator: {zh: '、', en: ', '},
  existingMaterials: {zh: '[已有材料]', en: '[Owned Materials]'},
  requiredMaterials: {zh: '[所需材料]', en: '[Required Materials]'},
  noExistingMaterials: {zh: '无', en: 'None'},
  coins: {zh: '金币', en: 'Coins'},
  enoughMaterials: {zh: '背包中的材料已足够完成升级', en: 'You have enough materials for the upgrade'},
  value: {zh: '价值', en: 'Value'},
  need: {zh: '还需', en: 'Missing'},
  now: {zh: '已有', en: 'Owned'},
  initFailed: {zh: '加载房屋数据失败，请检查控制台', en: 'Failed to load house data. Please check console.'},
  marketLoading: {zh: '正在获取市场数据...', en: 'Loading market data...'},
  invalidLevel: {zh: '目标等级必须大于起始等级', en: 'Target level must be higher than the starting level'},
  houseNotFound: {zh: '找不到房屋 {0} 的信息', en: 'House {0} was not found'},
  upgradeNotFound: {
    zh: '找不到房屋 {0} 等级 {1} 的升级信息',
    en: 'Upgrade cost for house {0} at level {1} was not found'
  }
};

// market-mate-messages
export const MARKET_MATE_MESSAGES = {
  importClipboard: {zh: '导入剪贴板', en: 'Import Clipboard'},
  toastImportClipboardEmpty: {zh: '剪贴板为空', en: 'Clipboard is empty'},
  toastImportClipboardDone: {
    zh: '已从剪贴板导入 {0} 种物品，共 {1} 个',
    en: 'Imported {0} item types from the clipboard ({1} total)'
  },
  toastImportClipboardUnmatched: {zh: '跳过 {0} 种未识别物品', en: 'Skipped {0} unrecognized item(s)'},
  toastImportClipboardFailed: {zh: '导入剪贴板失败：{0}', en: 'Clipboard import failed: {0}'},
  addMissingToCart: {zh: '加入购物车', en: 'Add to Cart'},
  addMissingToCartTitle: {
    zh: '把缺失材料加入 MWITools 购物车',
    en: 'Add missing materials to the MWITools cart'
  },
  addMissingToCartDone: {zh: '已添加 {0} 种缺失材料，共 {1} 个', en: 'Added {0} missing item types ({1} total)'},
  marketMateUnavailable: {zh: 'MWITools 购物车尚未就绪', en: 'MWITools cart is not ready'}
};

// character-switcher-messages
export const CHARACTER_SWITCHER_MESSAGES = {switchCharacter: {zh: '切换角色', en: 'Switch Character'}};

// labyrinth-supply-messages
export const LABYRINTH_SUPPLY_MESSAGES = {
  labyrinthSupply: {zh: '补充补给', en: 'Restock Supplies'},
  labyrinthSupplyTitle: {
    zh: '按入场次数把迷宫道具与补给箱缺少的数量加入 MWITools 购物车',
    en: 'Add missing labyrinth supplies and crates to the MWITools cart by entry count'
  },
  labyrinthSupplyPopoverTitle: {zh: '按入场次数补货', en: 'Restock by entries'},
  labyrinthSupplyRunTitle: {zh: '按 {0} 次入场补足道具与补给箱', en: 'Restock for {0} entries'},
  labyrinthSupplyDone: {
    zh: '已把 {0} 种迷宫补给加入购物车，共 {1} 个',
    en: 'Added {0} labyrinth supply types ({1} total)'
  },
  labyrinthSupplyNothingMissing: {
    zh: '迷宫道具与补给箱已充足，无需补充',
    en: 'Labyrinth supplies and crates are already full'
  },
  labyrinthSupplyAddFailed: {zh: '迷宫补给加入购物车失败', en: 'Failed to add labyrinth supplies to the cart'}
};

// marketplace-cart-messages
export const MARKETPLACE_CART_MESSAGES = {
  marketplaceCart: {zh: '加入购物车', en: 'Add to Cart'},
  marketplaceCartTitle: {
    zh: '把市场当前物品加入 MWITools 购物车，保留强化等级',
    en: 'Add the current market item to the MWITools cart, keeping its enhancement level'
  },
  marketplaceCartDone: {zh: '已加入购物车：{0}', en: 'Added to cart: {0}'},
  marketplaceCartNoItem: {
    zh: '当前没有可加入购物车的市场物品',
    en: 'No market item is currently selected'
  },
  marketplaceCartAddFailed: {zh: '加入购物车失败', en: 'Failed to add to the cart'}
};

// eds-milkonomy-messages
export const EDS_MILKONOMY_MESSAGES = {
  copyMilkonomy: {zh: '复制 Milkonomy 数据', en: 'Copy Milkonomy Data'},
  copyMilkonomyTitle: {zh: '复制 Milkonomy 配装数据', en: 'Copy Milkonomy loadout data'},
  copiedMilkonomy: {zh: '已复制 Milkonomy 数据', en: 'Milkonomy data copied'},
  copyProfitData: {zh: '复制利润网数据', en: 'Copy Profit Site Data'},
  copyProfitDataTitle: {zh: '选择要复制数据的利润网站', en: 'Choose a profit site data format'},
  copyHyhfish: {zh: '复制 hyhfish 数据', en: 'Copy hyhfish Data'},
  copiedHyhfish: {zh: '已复制 hyhfish 数据', en: 'hyhfish data copied'},
  copyCombatData: {zh: '复制战斗模拟器数据', en: 'Copy Combat Simulator Data'},
  copiedCombatData: {zh: '已复制战斗模拟器数据', en: 'Combat simulator data copied'},
  clipboardWriteFailed: {zh: '写入剪贴板失败：{0}', en: 'Failed to write clipboard: {0}'},
  syncMilkonomy: {zh: '同步配装', en: 'Sync Loadout'},
  syncedMilkonomy: {zh: 'Milkonomy 配装已同步', en: 'Milkonomy loadout synced'},
  syncMilkonomyFailed: {zh: '同步配装失败：{0}', en: 'Failed to sync loadout: {0}'}
};

// character-card-messages
export const CHARACTER_CARD_MESSAGES = {
  loadoutCharacterCard: {zh: '生成配装名片', en: 'Loadout Card'},
  loadoutCharacterCardTitle: {
    zh: '根据当前配装生成角色名片',
    en: 'Generate a character card from the selected loadout'
  },
  loadoutNotFound: {zh: '未找到当前配装', en: 'Current loadout was not found'},
  characterCard: {zh: '角色名片', en: 'Character Card'},
  partyCard: {zh: '队伍名片', en: 'Party Card'},
  cardLayout: {zh: '名片布局', en: 'Card Layout'},
  twoColumns: {zh: '双列', en: 'Two Columns'},
  combatLayout: {zh: '战斗布局', en: 'Combat Layout'},
  skillingLayout: {zh: '生活布局', en: 'Skilling Layout'},
  allCardContent: {zh: '全部', en: 'All'},
  profileDataUnavailable: {
    zh: '未获取到该角色资料，请先点击游戏中的“查看资料”后重试',
    en: 'Character profile data is unavailable. Open the in-game profile and try again.'
  },
  searchCachedCharacters: {zh: '搜索缓存角色', en: 'Search cached characters'},
  resetCharacterData: {zh: '重置角色数据', en: 'Reset Character Data'},
  downloadCard: {zh: '下载名片', en: 'Download Card'},
  copyCard: {zh: '复制名片', en: 'Copy Card'},
  editAbilityHint: {
    zh: '💡 点击技能图标可更换/添加展示的技能',
    en: '💡 Click skill icons to change/add displayed skills'
  },
  generating: {zh: '生成中...', en: 'Generating...'},
  copying: {zh: '复制中...', en: 'Copying...'},
  characterCardElementNotFound: {zh: '未找到名片元素', en: 'Character card element not found'},
  partyCardElementNotFound: {zh: '未找到队伍名片元素', en: 'Team card element not found'},
  imageClipboardUnavailable: {
    zh: '当前浏览器不支持复制图片，请使用“下载名片”',
    en: 'Image clipboard is unavailable; please use "Download Card"'
  },
  characterCardCopied: {zh: '名片图片已复制到剪贴板', en: 'Card image copied to clipboard'},
  partyCardCopied: {zh: '队伍名片已复制到剪贴板', en: 'Party card copied to clipboard'},
  downloadCharacterCardFailed: {zh: '下载名片失败', en: 'Failed to download character card'},
  downloadPartyCardFailed: {zh: '下载队伍名片失败', en: 'Failed to download party card'},
  copyCharacterCardFailed: {zh: '复制名片失败', en: 'Failed to copy card'},
  copyPartyCardFailed: {zh: '复制队伍名片失败', en: 'Failed to copy party card'},
  clipboardPermissionHint: {zh: '请允许浏览器访问剪贴板后重试', en: 'Please allow clipboard access and try again'},
  imageEncodeFailed: {zh: '名片图片编码失败', en: 'Failed to encode card image'},
  imageRendererUnavailable: {zh: '名片图片生成组件尚未就绪', en: 'Card image renderer is not ready'},
  cardCanvasUnavailable: {zh: '无法创建名片画布', en: 'Unable to create card canvas'},
  characterFallback: {zh: '角色', en: 'Character'},
  partyFallback: {zh: '队伍', en: 'Party'},
  unknownMember: {zh: '未知成员', en: 'Unknown Member'},
  combatLoadout: {zh: '战斗配装', en: 'Combat Loadout'},
  skillingLoadout: {zh: '生活配装', en: 'Skilling Loadout'},
  noCachedCharactersToAdd: {zh: '暂无可添加的缓存角色', en: 'No cached characters available'},
  noCachedCharacters: {zh: '暂无缓存角色', en: 'No cached characters available'},
  partyCardLimit: {zh: '队伍名片最多展示 5 个角色', en: 'Party cards support up to 5 characters'},
  characterAdded: {zh: '已添加角色', en: 'Character added'},
  partyDataRestored: {zh: '已恢复当前队伍角色数据', en: 'Current party data restored'},
  removeSelf: {zh: '删除自己', en: 'Remove myself'},
  removeCharacter: {zh: '删除该角色', en: 'Remove character'},
  dragToReorderCards: {zh: '拖动调整名片顺序', en: 'Drag to reorder cards'},
  selectCardAbility: {zh: '选择技能', en: 'Select Ability'},
  searchCardAbilityNames: {zh: '搜索中文或英文技能名称', en: 'Search Chinese or English ability names'},
  searchAbilities: {zh: '搜索技能', en: 'Search abilities'},
  clearAbilitySlot: {zh: '清空技能栏位', en: 'Clear ability slot'},
  emptySlot: {zh: '空', en: 'Empty'},
  noMatchingAbilities: {zh: '没有匹配的技能', en: 'No matching abilities'},
  buildScore: {zh: '战力打造分', en: 'Build Score'},
  calculating: {zh: '计算中', en: 'Calculating'},
  invalidCharacterCardData: {zh: '名片角色数据无效', en: 'Invalid character card data'},
  clientDataUnavailable: {zh: '游戏公共数据尚未就绪', en: 'Game client data is not ready'},
  equipmentHidden: {zh: '装备隐藏', en: 'Equipment hidden'},
  houseScore: {zh: '房屋分', en: 'House score'},
  abilityScore: {zh: '技能分', en: 'Ability score'},
  equipmentScore: {zh: '装备分', en: 'Equipment score'},
  toolScore: {zh: '工具分', en: 'Tools score'},
  battleShrineScore: {zh: '战斗神龛', en: 'Combat shrine'},
  skillingShrineScore: {zh: '生活神龛', en: 'Skilling shrine'},
  battleScore: {zh: '战斗评分', en: 'Combat Score'},
  skillingScore: {zh: '生活评分', en: 'Skilling Score'},
  algorithmSourceMwiTools: {zh: '算法来源：MWITools', en: 'Algorithm source: MWITools'},
  battleGearScore: {zh: '战斗着装评分', en: 'Combat Gear Score'},
  skillingGearScore: {zh: '生活着装评分', en: 'Skilling Gear Score'},
  useNewBuildScore: {zh: '启用着装评分', en: 'Use gear score'},
  newBuildScoreBadge: {zh: '着装评分（MWITools 口径）', en: 'Gear score (MWITools)'},
  skillingTools: {zh: '生活工具', en: 'Skilling Tools'},
  skillingLevelsAndHouses: {zh: '生活等级与房屋', en: 'Skilling Levels & Houses'},
  combatLevelsAndHouse: {zh: '战斗等级与房屋', en: 'Combat Levels & House'},
  equipmentAndAbilities: {zh: '装备与技能', en: 'Equipment & Abilities'},
  house: {zh: '房屋', en: 'House'},
  notBuilt: {zh: '未建造', en: 'Lv.0'},
  unknown: {zh: '未知', en: 'Unknown'},
  dataTimeLabel: {zh: '数据时间：', en: 'Data time: '},
  limitedProfileNotice: {
    zh: '有限资料：装备和房屋数据尚未由游戏服务器返回',
    en: 'Limited data: equipment and house data have not been returned by the game server'
  },
  generatingProgress: {zh: '生成中 {0}/{1}...', en: 'Generating {0}/{1}...'},
  copyingProgress: {zh: '复制中 {0}/{1}...', en: 'Copying {0}/{1}...'},
  emptyParty: {zh: '当前队伍为空', en: 'Current team is empty'},
  emptyPartyHint: {zh: '从上方缓存角色列表中选择并添加', en: 'Select and add a cached character above'},
  resetPartyData: {zh: '重置队伍数据', en: 'Reset Party Data'},
  latestProfileHint: {
    zh: '点击游戏中的“查看资料”可获取角色的最新信息',
    en: "Open a character's in-game profile to get the latest information."
  },
  showPartyCardFailed: {zh: '生成队伍名片失败', en: 'Failed to show party card'},
  generateCharacterCardFailed: {
    zh: '生成角色名片时发生错误\n\n错误信息: {0}',
    en: 'Error occurred while generating character card\n\nError: {0}'
  },
  noCurrentCharacterData: {
    zh: '未找到当前角色数据\n\n请确保：\n1. 已登录游戏\n2. 等待游戏数据加载完成\n3. 刷新页面后重试',
    en: 'No current character data found\n\nPlease ensure:\n1. You are logged into the game\n2. Wait for game data to load\n3. Refresh the page and try again'
  },
  invalidWebSocketData: {
    zh: 'WebSocket 数据格式不正确\n\n请刷新页面后重试',
    en: 'WebSocket data format is incorrect\n\nPlease refresh the page and try again'
  },
  invalidCharacterData: {
    zh: 'WebSocket 数据不包含有效的角色信息\n\n请刷新页面后重试',
    en: 'WebSocket data does not contain valid character information\n\nPlease refresh the page and try again'
  },
  generateMyCharacterCardFailed: {
    zh: '生成我的角色名片时发生错误\n\n错误信息: {0}',
    en: 'Error occurred while generating my character card\n\nError: {0}'
  },
  viewCharacterCard: {zh: '查看角色名片', en: 'View Character Card'},
  combat: {zh: '战斗', en: 'Combat'},
  diningRoom: {zh: '餐厅', en: 'Dining Room'},
  library: {zh: '图书馆', en: 'Library'},
  dojo: {zh: '道场', en: 'Dojo'},
  armory: {zh: '军械库', en: 'Armory'},
  gym: {zh: '健身房', en: 'Gym'},
  archeryRange: {zh: '射箭场', en: 'Archery Range'},
  mysticalStudy: {zh: '神秘研究室', en: 'Mystical Study'},
  stamina: {zh: '耐力', en: 'Stamina'},
  intelligence: {zh: '智力', en: 'Intelligence'},
  attack: {zh: '攻击', en: 'Attack'},
  defense: {zh: '防御', en: 'Defense'},
  melee: {zh: '近战', en: 'Melee'},
  ranged: {zh: '远程', en: 'Ranged'},
  magic: {zh: '魔法', en: 'Magic'}
};

// toolkit-menu-messages
export const TOOLKIT_MENU_MESSAGES = {
  toolkitTitle: {zh: 'Sunrishe 工具箱', en: 'Sunrishe Toolkit'},
  toolkitShort: {zh: '工具箱', en: 'Toolkit'},
  switchLanguage: {zh: '切换为英文', en: 'Switch to Chinese'},
  userCharacterCard: {zh: '用户名片', en: 'Character Card'},
  equipmentComparison: {zh: '装备提升计算器', en: 'Equipment Comparison'},
  dungeonProfitCalculator: {zh: '地下城收益计算器', en: 'Dungeon Profit Calculator'},
  houseUpgradeCalculator: {zh: '房屋升级材料计算器', en: 'House Upgrade Calculator'},
  combatUpgradeCalculator: {zh: '战斗升级计算器', en: 'Combat Upgrade Calculator'},
  abilityUpgradeCalculator: {zh: '技能升级计算器', en: 'Ability Upgrade Calculator'}
};

// dungeon-calculator-messages
export const DUNGEON_CALCULATOR_MESSAGES = {
  dungeonCalculatorHelpTitle: {zh: '查看地下城收益说明', en: 'View dungeon profit instructions'},
  dungeonCalculatorHelp: {
    zh: '使用：选择地下城、难度、队伍人数和单次耗时；每日固定按 24 小时计算。每日药品/饮料成本可留空，填写时单位为 M。工匠茶和暴饮之囊只影响制作钥匙成本，暴饮之囊需要勾选后才会按所选强化等级生效。\n\n期望：每日轮次 = 1440 ÷ 单次耗时，计算保留完整精度。普通宝箱按官方公式 5 ÷ 队伍人数 × (1 + 29.5% 战斗掉落数量)计算，5 人时每车 1.295 个；T0 不掉精炼宝箱，T1 精炼宝箱为每车普通宝箱 × 0.33，T2 为每车普通宝箱。门票数量等于普通宝箱期望数量，数量显示最多保留两位小数并去掉末尾 0。\n\n成本：默认同时展示制作钥匙和购买钥匙。制作钥匙读取官方配方并受工匠茶、暴饮之囊影响；购买钥匙读取门票和开箱钥匙的成品市场价。材料成本区只显示买入方向，预期产出区只显示卖出方向。自定义模式可选择钥匙来源、买入档位和卖出档位；左侧保留所选来源的区间，右侧显示自定义组合。\n\n收益：宝箱内容按官方掉落率和平均数量递归展开，重复物品会合并，嵌套宝箱会继续展开。“掉落物”页签按官方宝箱的掉落物列表直接展示（不递归展开嵌套宝箱），普通/精炼宝箱各一小节，每行列出掉率/掉落数量、期望数量（悬浮查看计算公式）与按市场报价税前折算的价值。每日普通/精炼宝箱产出完全按市场报价税前计算（不扣税）。“收益扣除市场税”默认勾选，卖出收入按市场税扣除（普通物品 {0}%、牛铃/牛铃袋 {1}%）；不勾选时所有物品都按市场报价直接计算，不扣任何税。勾选“披风不计算收益”后，所有背部装备产物按 0 估值。单个普通宝箱收益会扣除单箱分摊的门票和普通开箱钥匙成本；单个精炼宝箱收益只扣除精炼开箱钥匙成本。每日期望收益按单箱收益乘每日宝箱数量汇总后，再扣除每日药品/饮料成本；每车期望收益等于每日期望收益除以每日轮次。\n\n限制：通关耗时和队伍人数需要手动填写/选择，当前不会自动读取战斗耗时和队伍组成。结果是当前参数和市场价格下的确定性期望，不预测价格变化。完全缺价的物品按 0 估值并提示。\n\n批量模拟：勾选顶部的“批量模拟”复选框进入批量模拟，取消勾选回到单图模拟。批量第一行选项与单图模拟从“使用工匠茶”开始的选项一致，对列表内全部地图生效；第二行双击地下城卡片把地图加入列表，右侧展示市场数据时间；列表每行单独设置难度、队伍人数、单次耗时和每日药品/饮料成本，期望数量按“普通宝箱 / 精炼宝箱”分两行展示；“制作钥匙”与“购买钥匙”各分“左买/右卖”“右买/左卖”两列，单元格上行是每日总成本、下行是每日期望收益。序号列可拖动排序，列表默认展示四个地下城。勾选自定义模式后，“购买钥匙”区域直接改为按所选钥匙来源和买卖档位计算的自定义结果。单图和批量各自的参数都会随调整自动保存到本地（共用同一个存储键、两个模式分别保存），结果始终按当前市场数据重新计算，不会读取已保存的计算结果；恢复默认清空当前模式的已存配置并回到默认参数（批量恢复为四个默认地图）。',
    en: 'Usage: Select a dungeon, tier, party size, and clear time. Every day uses a fixed 24-hour calculation. Daily food/drink cost is optional and entered in millions. Artisan Tea and Guzzling Pouch affect crafted-key costs only; Guzzling Pouch applies only when its checkbox is enabled and uses the selected enhancement level.\n\nExpectation: Daily runs = 1440 ÷ clear time, kept at full precision for calculation. Normal Chests use the official formula 5 ÷ Party Size × (1 + 29.5% Combat Drop Quantity); at Party Size 5 that is 1.295 per run. T0 has no Refinement Chest; T1 uses Normal Chests × 0.33 per run; T2 uses the Normal Chest expectation per run. Entry Ticket quantity equals expected Normal Chest quantity, and displayed quantities use at most two decimals and hide trailing zeros.\n\nCosts: Crafted Keys and Purchased Keys are shown by default. Crafted-key costs use official recipes and are affected by Artisan Tea and Guzzling Pouch; purchased-key costs use finished Entry Ticket and Chest Key market prices. The Material Costs section shows purchase sides only, and Expected Output shows sale sides only. Custom Mode selects the key source, buy side, and sell side; the left columns keep the selected source range, while the right column shows the custom combination.\n\nProfit: Chest contents recursively use official drop rates and average quantities; duplicate items are combined and nested chests are expanded. The Loot tab lists the official chest drop entries directly (nested chests are not expanded), split into Normal and Refined Chest sections; each row shows drop rate / drop quantity, expected quantity (hover for the formula), and pretax value at quoted market prices. Daily Normal/Refinement Chest Output is valued at quoted market prices before tax (no tax deducted). Deduct Market Tax is enabled by default and sale revenue deducts the market tax (regular items {0}%, Cowbells and Cowbell Bags {1}%); when disabled, all items use quoted prices directly with no tax deducted. When Exclude Back Equipment Profit is enabled, all back-equipment output is valued at 0. Each Normal Chest Profit deducts allocated Entry Ticket and Normal Chest Key costs; each Refinement Chest Profit deducts its Refinement Chest Key cost. Daily Expected Profit multiplies per-chest profit by daily chest quantities, then deducts daily food/drink cost; Expected Profit per Run divides it by Daily Runs.\n\nLimits: Clear time is entered manually and party size is selected manually; they are not read from combat automatically. Results are deterministic expectations at current parameters and market prices and do not predict price changes. Items with no valid price are valued at 0 and reported.\n\nBatch simulation: tick the Batch Simulation checkbox on top to switch modes; untick it to return to Single Map. Its first option row mirrors the Single Map options starting from Use Artisan Tea and applies to every map in the list. Double-click a dungeon card in the second row to add a map; the market data time sits on the right. Each list row has its own tier, party size, clear time, and daily food/drink cost, and expected quantity lists Normal and Refined chests on two lines. Craft Keys and Buy Keys each split into Ask Buy/Bid Sell and Bid Buy/Ask Sell columns; every cell shows the daily total cost on the first line and the daily expected profit on the second line. Drag the Sequence cell to reorder rows, and the list defaults to all four dungeons. With Custom Mode enabled, the Buy Keys area directly shows the custom result for the selected key source and trade sides. Parameters of both modes are saved locally automatically as you adjust them (one shared storage key with separate sections for Single Map and Batch), and results are always recalculated from the current market data; saved results are never reused. Restore Defaults removes the stored config of the currently active mode and returns to default parameters (Batch restores the four default dungeons).'
  },
  dungeon: {zh: '地下城', en: 'Dungeon'},
  dungeonNameChimericalDen: {zh: '奇幻洞穴', en: 'Chimerical Den'},
  dungeonNameSinisterCircus: {zh: '阴森马戏团', en: 'Sinister Circus'},
  dungeonNameEnchantedFortress: {zh: '秘法要塞', en: 'Enchanted Fortress'},
  dungeonNamePirateCove: {zh: '海盗基地', en: 'Pirate Cove'},
  difficultyTier: {zh: '难度', en: 'Tier'},
  partySize: {zh: '队伍人数', en: 'Party Size'},
  clearTimeMinutes: {zh: '单次耗时（分钟）', en: 'Clear Time (min)'},
  dailyConsumablesCost: {zh: '每日药品/饮料成本（M）', en: 'Daily Food/Drink Cost (M)'},
  artisanTea: {zh: '使用工匠茶', en: 'Use Artisan Tea'},
  useGuzzlingPouch: {zh: '使用暴饮之囊', en: 'Use Guzzling Pouch'},
  guzzlingLevel: {zh: '暴饮之囊强化等级', en: 'Guzzling Pouch Enhancement Level'},
  excludeBackEquipmentValue: {zh: '披风不计算收益', en: 'Exclude Back Equipment Profit'},
  applyMarketTax: {zh: '收益扣除市场税', en: 'Deduct Market Tax'},
  applyMarketTaxHint: {
    zh: '勾选时卖出收益按市场税扣除（普通物品 {0}%，牛铃/牛铃袋 {1}%）；不勾选时所有物品都按市场报价直接计算，不扣任何税。',
    en: 'When enabled, sale revenue deducts the market tax (regular items {0}%, Cowbells and Cowbell Bags {1}%); when disabled, all items use quoted prices directly with no tax deducted.'
  },
  customMode: {zh: '自定义模式', en: 'Custom Mode'},
  keySource: {zh: '钥匙来源', en: 'Key Source'},
  keyMaterialPurchaseMethod: {zh: '钥匙材料购买方式', en: 'Key Material Purchase Method'},
  keyPurchaseMethod: {zh: '钥匙购买方式', en: 'Key Purchase Method'},
  goodsSaleMethod: {zh: '货物出售方式', en: 'Goods Sale Method'},
  leftBuy: {zh: '左买', en: 'Ask Buy'},
  rightBuy: {zh: '右买', en: 'Bid Buy'},
  leftSell: {zh: '左卖', en: 'Ask Sell'},
  rightSell: {zh: '右卖', en: 'Bid Sell'},
  customResult: {zh: '自定义', en: 'Custom'},
  dailyRuns: {zh: '每日轮次', en: 'Daily Runs'},
  ticketRequired: {zh: '每日门票', en: 'Daily Entry Tickets'},
  normalChestShares: {zh: '每日普通宝箱', en: 'Daily Normal Chests'},
  refinementChestShares: {zh: '每日精炼宝箱', en: 'Daily Refinement Chests'},
  resultItem: {zh: '项目', en: 'Item'},
  quantity: {zh: '数量', en: 'Quantity'},
  conservative: {zh: '右卖 / 左买', en: 'Bid Sell / Ask Buy'},
  optimistic: {zh: '左卖 / 右买', en: 'Ask Sell / Bid Buy'},
  craftedKeys: {zh: '制作钥匙', en: 'Craft Keys'},
  purchasedKeys: {zh: '购买钥匙', en: 'Buy Keys'},
  entryTicketDailyCost: {zh: '每日门票成本', en: 'Daily Entry Cost'},
  chestOpeningDailyCost: {zh: '每日宝箱钥匙成本', en: 'Daily Chest Key Cost'},
  dailyConsumablesCostRow: {zh: '每日药品/饮料成本', en: 'Daily Food/Drink Cost'},
  materialCostBreakdown: {zh: '材料成本', en: 'Material Costs'},
  totalDailyCost: {zh: '每日总成本', en: 'Daily Total Cost'},
  expectedChestOutputBreakdown: {zh: '预期产出', en: 'Expected Output'},
  normalChestRevenue: {zh: '单个普通宝箱收益', en: 'Normal Chest Profit (Each)'},
  refinementChestRevenue: {zh: '单个精炼宝箱收益', en: 'Refinement Chest Profit (Each)'},
  normalChestDailyOutput: {zh: '每日普通宝箱产出', en: 'Daily Normal Chest Output'},
  refinementChestDailyOutput: {zh: '每日精炼宝箱产出', en: 'Daily Refinement Chest Output'},
  netProfit: {zh: '每日期望收益', en: 'Daily Expected Profit'},
  profitPerRun: {zh: '每车期望收益', en: 'Expected Profit per Run'},
  ticketUnitPrice: {zh: '门票单位成本', en: 'Entry Unit Cost'},
  keyUnitPrice: {zh: '开箱钥匙单位成本', en: 'Chest Key Unit Cost'},
  missingMarketPrices: {
    zh: '有 {0} 种物品缺少市场价格，相关收益或成本暂按 0 计算。',
    en: '{0} item(s) have no market price; affected revenue or costs are currently valued at 0.'
  },
  invalidDungeonInput: {zh: '请输入大于 0 的单次耗时', en: 'Clear time must be greater than 0.'},
  noDungeonData: {zh: '未找到官方地下城数据', en: 'Official dungeon data was not found.'},
  dungeonResultTab: {zh: '收益结果', en: 'Profit'},
  dungeonLootTab: {zh: '掉落物', en: 'Loot'},
  dropItem: {zh: '物品', en: 'Item'},
  dropRate: {zh: '掉率', en: 'Drop Rate'},
  dropQuantityHint: {zh: '掉落数量 {0}', en: 'Drop Quantity {0}'},
  expectedQuantity: {zh: '期望数量', en: 'Expected Quantity'},
  normalChestLoot: {zh: '普通宝箱掉落物', en: 'Normal Chest Drops'},
  refinementChestLoot: {zh: '精炼宝箱掉落物', en: 'Refined Chest Drops'},
  chestDropsPerDay: {zh: '{0} 个/天', en: '{0} per day'},
  normalChest: {zh: '普通宝箱', en: 'Normal Chest'},
  refinementChest: {zh: '精炼宝箱', en: 'Refined Chest'},
  expectedQuantityFormula: {
    zh: '期望数量 = {0} 个{1} × {2} × ({3}+{4})÷2',
    en: 'Expected = {0} {1} × {2} × ({3}+{4})÷2'
  },
  expectedQuantityResult: {zh: '= {0}', en: '= {0}'},
  simTabBatch: {zh: '批量模拟', en: 'Batch Simulation'},
  leftBuyRightSell: {zh: '左买/右卖', en: 'Ask Buy/Bid Sell'},
  rightBuyLeftSell: {zh: '右买/左卖', en: 'Bid Buy/Ask Sell'},
  batchEmptyHint: {zh: '双击上方地下城卡片添加到列表', en: 'Double-click a dungeon card above to add it to the list.'},
  batchCostShort: {zh: '成本', en: 'Cost'},
  batchProfitShort: {zh: '收益', en: 'Profit'},
  batchNormalShort: {zh: '普通', en: 'Normal'},
  batchRefinedShort: {zh: '精炼', en: 'Refined'},
  clearTimeMinutesShort: {zh: '单次耗时', en: 'Clear Time'},
  unitMinutes: {zh: '（分钟）', en: '(min)'},
  dailyConsumablesCostLine1: {zh: '每日药品', en: 'Daily Food'},
  dailyConsumablesCostLine2: {zh: '饮料成本（M）', en: 'Drink Cost (M)'},
  restoreDefaultConfig: {zh: '恢复默认', en: 'Restore Defaults'},
  configRestored: {zh: '已恢复默认配置', en: 'Default configuration restored'}
};

// equipment-comparison-messages
export const EQUIPMENT_COMPARISON_MESSAGES = {
  equipmentComparisonTitle: {zh: '装备提升计算器', en: 'Equipment Comparison'},
  equipmentComparisonNotice: {
    zh: '提示：本工具会在相同职业方案、角色数据和固定随机种子下，只替换所选装备并模拟持续 DPS。结果反映标准目标中的相对提升，不代表具体战区、怪物或队伍配置收益。',
    en: 'Note: This tool keeps the same preset, character data, and fixed random seeds, swaps only the selected item, and simulates sustained DPS. Results show relative gain against a standard target, not gains for a specific zone, enemy, or party setup.'
  },
  combatPreset: {zh: '职业方案', en: 'Combat Build'},
  presetGroupMelee: {zh: '近战', en: 'Melee'},
  presetGroupRanged: {zh: '远程', en: 'Ranged'},
  presetGroupMagic: {zh: '魔法', en: 'Magic'},
  presetMeleeHammer: {zh: '近战 - 锤', en: 'Melee - Hammer'},
  presetMeleeBulwark: {zh: '近战 - 重盾', en: 'Melee - Bulwark'},
  presetMeleeSword: {zh: '近战 - 剑', en: 'Melee - Sword'},
  presetMeleeSpear: {zh: '近战 - 长枪', en: 'Melee - Spear'},
  presetRangedBow: {zh: '远程 - 弓', en: 'Ranged - Bow'},
  presetRangedCrossbow: {zh: '远程 - 弩', en: 'Ranged - Crossbow'},
  presetMagicFire: {zh: '魔法 - 火', en: 'Magic - Fire'},
  presetMagicWater: {zh: '魔法 - 水', en: 'Magic - Water'},
  presetMagicNature: {zh: '魔法 - 自然', en: 'Magic - Nature'},
  ownedEquipment: {zh: '基准装备', en: 'Baseline Equipment'},
  comparisonEquipment: {zh: '对比装备', en: 'Comparison Equipment'},
  chooseOwnedEquipment: {zh: '请选择基准装备', en: 'Choose baseline equipment'},
  chooseComparisonEquipment: {zh: '请选择同部位装备', en: 'Choose equipment for the same slot'},
  chooseOwnedEquipmentFirst: {zh: '请先选择基准装备', en: 'Choose baseline equipment first'},
  noCompatibleEquipment: {zh: '该部位没有可对比装备', en: 'No equipment is available for this slot'},
  searchEquipment: {zh: '搜索装备名称或 HRID', en: 'Search equipment name or HRID'},
  allEquipmentSlots: {zh: '全部部位', en: 'All Slots'},
  noEquipmentMatch: {zh: '未找到匹配装备', en: 'No matching equipment found'},
  enhancementLevel: {zh: '强化等级', en: 'Enhancement Level'},
  ownedQuantity: {zh: '持有 {0}', en: 'Owned: {0}'},
  equipmentAttribute: {zh: '属性', en: 'Attribute'},
  attributeDifference: {zh: '差异', en: 'Difference'},
  combatAttributes: {zh: '战斗属性', en: 'Combat Stats'},
  noncombatAttributes: {zh: '生活属性', en: 'Non-combat Stats'},
  priceDifference: {zh: '装备价格差', en: 'Equipment Price Difference'},
  baselineDps: {zh: '基准 DPS', en: 'Baseline DPS'},
  comparisonDps: {zh: '对比 DPS', en: 'Comparison DPS'},
  roughDpsChange: {zh: 'DPS 提升', en: 'DPS Gain'},
  dpsPerTenMillion: {zh: '每 10M 金币 DPS 提升', en: 'DPS Gain per 10M Coins'},
  dpsPerTenMillionHint: {
    zh: '仅在 DPS 提升且价格差为正时计算',
    en: 'Calculated only when DPS increases and the price difference is positive'
  },
  simulationLoading: {zh: '正在模拟…', en: 'Simulating…'},
  dpsDataUnavailable: {zh: '当前战斗数据不可用', en: 'Current combat data is unavailable'},
  dpsCalculationError: {zh: '计算失败', en: 'Calculation failed'},
  combatSimulationTimeout: {zh: '战斗模拟超时', en: 'Combat simulation timed out'},
  combatSimulationFailed: {zh: '战斗模拟失败', en: 'Combat simulation failed'},
  combatSimulationWorkerFailed: {zh: '战斗模拟 Worker 加载失败', en: 'Failed to load the combat simulation worker'},
  noComparableAttributes: {zh: '所选装备没有可对比属性', en: 'The selected equipment has no comparable stats'},
  equipmentComparisonHelpTitle: {zh: '查看装备提升说明', en: 'View equipment comparison instructions'},
  equipmentComparisonHelp: {
    zh: '使用：先选择职业方案，再选择基准装备和同一穿戴位置的对比装备；可比较同名装备的不同强化等级。基准装备优先使用当前已穿戴的适用装备，其他默认按方案配置。属性差异、DPS、装备价格差和每 10M 金币 DPS 提升会自动计算。\n\n方案：除所选装备外，使用对应职业的 +10 单刷战斗套装、+5 贤者三件套、暴饮之囊、固定食物和职业咖啡；技能等级固定为 4/6/6/6/6。战斗等级、房屋等级和成就使用当前角色数据。背部、护符和 Trinket 不参与 DPS，对比列表不展示护符、Trinket 和生活工具。\n\n原理：先构建两套除所选装备外完全一致的完整配装，再使用相同固定随机种子分别模拟。DPS 为总伤害除以模拟时间；DPS 提升为对比 DPS 相对基准 DPS 的变化比例，用来尽量隔离所选装备的影响。\n\n计算：每套配装使用 5 个固定随机种子，对不会死亡、不会攻击的标准目标模拟 3 小时。装备价格差只计算被比较的两件装备；只有 DPS 提升、价格差为正且市场价格完整时，才计算每 10M 金币 DPS 提升。\n\n限制：只能比较同一穿戴位置且符合当前职业战斗风格的装备。结果是标准环境下的相对比较，不包含具体战区怪物、敌方攻击、战斗时长和队伍配置造成的影响。',
    en: "Usage: Choose a combat preset, then select baseline and comparison equipment for the same slot. The same item can be compared at different enhancement levels. Baseline equipment prefers currently equipped compatible items; other slots use the preset. Stat differences, DPS, price difference, and DPS gain per 10M coins are calculated automatically.\n\nBuild: Except for the selected item, the simulation uses the preset's +10 solo combat set, +5 Philosopher accessories, Guzzling Pouch, fixed food, and preset combat coffees; abilities are fixed at 4/6/6/6/6. Current combat levels, house rooms, and achievements come from the character. Back, charms, and trinkets do not affect DPS here, and charms, trinkets, and skilling tools are not shown in the comparison list.\n\nPrinciple: Two complete builds are created with every setting identical except the selected item, then simulated with the same fixed random seeds. DPS is total damage divided by simulated time, and DPS gain is the comparison DPS relative to baseline DPS, isolating the selected item as much as possible.\n\nCalculation: Each build is simulated locally for 3 hours against an immortal standard target that does not attack, using 5 fixed random seeds. Price difference compares only the two selected items. DPS gain per 10M coins is calculated only when DPS increases, the price difference is positive, and both market prices are available.\n\nLimits: Equipment must use the same slot and be compatible with the selected combat style. Results are relative comparisons in a standard environment and do not include specific enemies, incoming attacks, encounter duration, or party composition."
  }
};

// combat-calculator-messages
export const COMBAT_CALCULATOR_MESSAGES = {
  primaryXpRate: {zh: '主修经验 (K/h)', en: 'Primary XP (K/h)'},
  secondaryXpRate: {zh: '选修经验 (K/h)', en: 'Secondary XP (K/h)'},
  useCurrentCombatXp: {zh: '使用当前战斗经验', en: 'Use Current Combat XP'},
  currentCombatXpApplied: {zh: '已填入当前战斗小时经验', en: 'Current combat XP rates filled'},
  currentCombatXpUnavailable: {zh: '当前战斗小时经验不可用', en: 'Current combat XP rates are unavailable'},
  optionalEph: {zh: 'EPH（选填）', en: 'EPH (optional)'},
  resetList: {zh: '重置列表', en: 'Reset List'},
  order: {zh: '序号', en: 'Sequence'},
  profession: {zh: '专业', en: 'Skill'},
  trainingType: {zh: '类型', en: 'Type'},
  hourlyExperience: {zh: '经验 (K/h)', en: 'XP (K/h)'},
  primaryTraining: {zh: '主修', en: 'Primary'},
  secondaryTraining: {zh: '选修', en: 'Secondary'},
  concurrentTraining: {zh: '同修', en: 'Train Together'},
  combatCalculatorHelpTitle: {zh: '查看战斗升级说明', en: 'View combat calculator instructions'},
  combatCalculatorHelp: {
    zh: '使用：填写顶部主修经验和选修经验；战斗中也可点击“使用当前战斗经验”自动填入。双击上方专业添加行，只能从“序号”列拖动排序。每行可以设置起始等级、目标等级、类型、同修和单独经验；单独经验会覆盖顶部对应类型经验。EPH 只用于估算总次数，不影响升级时间。重置列表会恢复耐力、智力、攻击、防御和当前等级最高的战斗主修。\n\n限制：耐力、智力固定为选修；远程、魔法固定为主修；攻击、防御、近战可切换主修或选修。同一序号内不能出现重复专业。\n\n计算：选修使用选修经验；未同修的主修使用主修经验加选修经验；同修主修只使用主修经验。没有主修时，各行按选修经验或单独经验估算。主修勾选同修后，其目标等级不能手动修改，会按同组选修训练时长反推出结束等级和经验百分比。相邻同修行共用同一序号；同一序号同时开始，下一序号等待上一序号全部完成。当前战斗只读到 1 个或 5 个职业经验时按总经验 3:7 拆分主修/选修；读到 2 个职业时按当前列表类型分别填入。\n\n数据：未自定义起始等级时使用角色实际等级和经验；自定义后按输入等级的 0% 经验开始。重复专业会继承前一次训练结束后的精确进度。当前战斗经验只读取游戏战斗状态，不更新名片或通用角色数据。',
    en: 'Usage: Enter shared primary and secondary XP rates; during combat, you can also click Use Current Combat XP to fill them automatically. Double-click a skill above to add a row, and drag only from the Sequence column to reorder. Each row can set start level, target level, type, Train Together, and a row-specific XP rate; a row rate overrides the shared rate for that type. EPH only estimates total runs and does not affect upgrade time. Reset List restores Stamina, Intelligence, Attack, Defense, and the highest-level primary combat skill.\n\nLimits: Stamina and Intelligence are always secondary; Ranged and Magic are always primary; Attack, Defense, and Melee can switch between primary and secondary. The same skill cannot appear twice in one sequence.\n\nCalculation: Secondary rows use secondary XP. A primary row trained alone uses primary plus secondary XP. A primary row trained together uses primary XP only. Without a primary row, each row is estimated with secondary XP or its own rate. When a primary row is trained together, its target cannot be edited and is derived from the same-sequence secondary training duration, including ending XP percentage. Adjacent together rows share one sequence; rows in one sequence start together, and the next sequence waits for all rows in the previous sequence to finish. Current combat XP is split 3:7 when one or five skill rates are available; when two rates are available, they are filled by the current row types.\n\nData: Without a custom start level, actual character level and XP are used; a custom start begins at 0% XP of that level. A repeated skill inherits the exact progress from its previous segment. Current combat XP only reads game battle state and does not update cards or shared character data.'
  },
  totalHours: {zh: '耗时', en: 'Duration'},
  estimatedUpgradeTime: {zh: '预计升级时间', en: 'Estimated Completion'},
  estimatedStartTime: {zh: '预计开始时间', en: 'Estimated Start'},
  totalRuns: {zh: '总次数', en: 'Total Runs'},
  doubleClickToAdd: {zh: '双击添加', en: 'Double-click to add'},
  dragToSort: {zh: '从序号处拖动排序', en: 'Drag the sequence cell to reorder'}
};

// ability-calculator-messages
export const ABILITY_CALCULATOR_MESSAGES = {
  abilityCalculatorHelpTitle: {zh: '查看技能升级说明', en: 'View ability calculator instructions'},
  abilityCalculatorHelp: {
    zh: '使用：选择职业方案会清空列表并加入对应技能；预设等级会按列表顺序设置前五个技能的目标等级。也可以单独添加技能，并按中文、英文或 HRID 搜索。点击技能图标会关闭弹窗并跳转到对应技能书市场；MWITools 购物车就绪后，可以把需要购买的技能书加入购物车。\n\n限制：只能添加有对应技能书的技能，同一技能不能重复。起始等级范围为 0-199，目标等级范围为 1-200；目标等级不高于起点时无需购买技能书。缺少某侧市场价格时，只影响该侧总价显示。\n\n计算：默认从角色当前实际等级和经验百分比开始；勾选自定义起始等级后，从该等级 0% 经验开始。0 级技能额外计入 1 本解锁技能书。所需技能书显示到 0.1 本，购物车数量和价格计算按整本向上取整；合计行的技能书数量累加显示值，价格合计累加整本购买成本。',
    en: 'Usage: Choosing a profession preset clears the list and adds its abilities. A level preset sets target levels for the first five abilities in list order. You can also add individual abilities and search by Chinese, English, or HRID. Clicking an ability icon closes the dialog and opens that ability book in the marketplace. When MWI Market Mate is installed and ready, required books can be added to its cart.\n\nLimits: Only abilities with a corresponding book can be added, and duplicates are not allowed. Start levels range from 0 to 199 and target levels from 1 to 200. No books are needed when the target does not exceed the start. Missing market prices only affect the total for that side.\n\nCalculation: By default, actual character level and XP percentage are used. With a custom start level, calculation begins at 0% XP of that level. A level-0 ability includes one extra unlock book. Required books display to 0.1, while cart quantity and price calculation round up to whole books. The total book row sums displayed quantities, and price totals sum whole-book purchase costs.'
  },
  searchAbility: {zh: '搜索中文、英文或 HRID', en: 'Search Chinese, English, or HRID'},
  experiencePerBook: {zh: '每本书技能经验', en: 'Ability Exp Per Book'},
  customStartLevel: {zh: '自行设置起始等级', en: 'Custom Start Level'},
  resetActualLevel: {zh: '重置实际等级', en: 'Reset Actual Level'},
  requiredBooks: {zh: '所需技能书', en: 'Books Required'},
  openMarket: {zh: '前往市场', en: 'View Marketplace'},
  addAbilityBooksToCart: {zh: '加入 MWITools 购物车', en: 'Add to MWITools Cart'},
  abilityBooksAddedToCart: {zh: '已将 {0} 本「{1}」加入 MWITools 购物车', en: 'Added {0} × {1} to the MWITools cart'},
  abilityBooksCartFailed: {
    zh: '技能书未能加入 MWITools 购物车',
    en: 'The ability books could not be added to the MWITools cart'
  },
  noAbilityBooksNeeded: {zh: '当前技能无需购买技能书', en: 'No ability books are required'},
  noAbilityMatch: {zh: '没有匹配的技能', en: 'No matching abilities'},
  addAbility: {zh: '添加技能', en: 'Add Ability'},
  abilityPreset: {zh: '职业方案', en: 'Profession Preset'},
  abilityLevelPreset: {zh: '预设等级', en: 'Level Preset'},
  clearList: {zh: '清空列表', en: 'Clear List'},
  meleePresets: {zh: '近战', en: 'Melee'},
  rangedPresets: {zh: '远程', en: 'Ranged'},
  magicPresets: {zh: '魔法', en: 'Magic'},
  swordPreset: {zh: '长剑日常', en: 'Sword Routine'},
  spearPreset: {zh: '长枪日常', en: 'Spear Routine'},
  hammerPreset: {zh: '重锤日常', en: 'Hammer Routine'},
  shieldSoloPreset: {zh: '重盾单刷', en: 'Shield Solo'},
  shieldPartyPreset: {zh: '重盾组队', en: 'Shield Party'},
  bowPreset: {zh: '弓系日常', en: 'Bow Routine'},
  crossbowPreset: {zh: '弩系日常', en: 'Crossbow Routine'},
  waterMagicPreset: {zh: '水系日常', en: 'Water Routine'},
  fireMagicPreset: {zh: '火系日常', en: 'Fire Routine'},
  natureMagicPreset: {zh: '自然日常', en: 'Nature Routine'},
  ability: {zh: '技能', en: 'Ability'},
  customStartAndLevel: {zh: '起始等级', en: 'Start Level'},
  askPriceAndTotal: {zh: '左一 / 总价', en: 'Best Ask Price / Total'},
  bidPriceAndTotal: {zh: '右一 / 总价', en: 'Best Bid Price / Total'},
  total: {zh: '合计', en: 'Total'},
  noAbilitiesSelected: {
    zh: '暂无技能，请添加技能或选择预置方案',
    en: 'No abilities. Add an ability or choose a preset.'
  }
};

// combat-sim-import-messages
export const COMBAT_SIM_IMPORT_MESSAGES = {
  combatSimImport: {
    zh: '单人/组队导入(刷新游戏网页更新人物数据)',
    en: 'Import solo/group (Refresh game page to update character data)'
  },
  combatSimImportTitle: {
    zh: '把当前角色与队伍数据导入 aiwwb 战斗模拟器（含神龛生效等级）',
    en: 'Import current character and party data into the aiwwb combat simulator (with effective shrine levels)'
  },
  combatSimImported: {zh: '已导入', en: 'Imported'},
  combatSimNoCharacterData: {
    zh: '未读取到游戏角色数据，请先刷新游戏网页再导入',
    en: 'No character data found. Refresh the game page first.'
  },
  combatSimNeedProfile: {zh: '需要点开资料', en: 'Open profile in game'},
  combatSimImportFailed: {zh: '战斗模拟器导入失败：{0}', en: 'Combat simulator import failed: {0}'},
  combatSimSiteChanged: {
    zh: '未找到模拟器导入输入框，页面结构可能已变化',
    en: 'Simulator import input not found; the site layout may have changed'
  },
  combatSimAiwwb: {zh: '战斗模拟 aiwwb', en: 'Combat Sim aiwwb'}
};

// messages
export const I18N_MESSAGE_GROUPS = {
  common: COMMON_MESSAGES,
  houseCalculator: HOUSE_CALCULATOR_MESSAGES,
  marketMate: MARKET_MATE_MESSAGES,
  characterSwitcher: CHARACTER_SWITCHER_MESSAGES,
  labyrinthSupply: LABYRINTH_SUPPLY_MESSAGES,
  marketplaceCart: MARKETPLACE_CART_MESSAGES,
  edsMilkonomy: EDS_MILKONOMY_MESSAGES,
  characterCard: CHARACTER_CARD_MESSAGES,
  toolkitMenu: TOOLKIT_MENU_MESSAGES,
  dungeonCalculator: DUNGEON_CALCULATOR_MESSAGES,
  equipmentComparison: EQUIPMENT_COMPARISON_MESSAGES,
  combatCalculator: COMBAT_CALCULATOR_MESSAGES,
  abilityCalculator: ABILITY_CALCULATOR_MESSAGES,
  combatSimImport: COMBAT_SIM_IMPORT_MESSAGES
};
