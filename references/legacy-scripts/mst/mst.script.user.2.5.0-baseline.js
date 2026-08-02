// ==UserScript==
// @name               MWI Sunrishe Toolkit
// @name:zh-CN         MWI Sunrishe 工具箱
// @name:en            MWI Sunrishe Toolkit
// @namespace          http://tampermonkey.net/
// @version            2.5.0
// @description        MST 综合工具箱：提供房屋升级、战斗练级、技能升级、装备对比、地下城收益等辅助功能。
// @description:zh-CN  MST 综合工具箱：提供房屋升级、战斗练级、技能升级、装备对比、地下城收益等辅助功能。
// @description:en     MST toolkit for house upgrades, combat training, ability upgrades, equipment comparison, dungeon profit, and related utilities.
// @author             sunrishe
// @website            https://greasyfork.org/zh-CN/scripts/574037
// @website            https://gf.qytechs.cn/zh-CN/scripts/574037
// @homepage           https://github.com/sunrishe/tampermonkey/tree/master/mwi/mst
// @match              https://www.milkywayidle.com/*
// @match              https://milkywayidle.com/*
// @match              https://test.milkywayidle.com/*
// @match              https://www.milkywayidlecn.com/*
// @match              https://milkywayidlecn.com/*
// @match              https://test.milkywayidlecn.com/*
// @match              https://milkonomy.pages.dev/*
// @match              https://hyhfish.github.io/milkonomy/*
// @icon               https://www.milkywayidle.com/favicon.svg
// @run-at             document-start
// @require            https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js
// @require            https://cdn.jsdelivr.net/npm/sweetalert2@11
// @grant              unsafeWindow
// @grant              GM_setClipboard
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              GM_addValueChangeListener
// @grant              GM_xmlhttpRequest
// @grant              GM.xmlHttpRequest
// @connect            www.milkywayidle.com
// @connect            www.milkywayidlecn.com
// ==/UserScript==

(function () {
    'use strict';

    const TemplateRenderer = {
        CDN_URL: 'https://cdn.jsdelivr.net/npm/uhtml@5.0.9/dist/prod/dom.min.js',
        _html: null,
        _render: null,
        _Hole: null,
        _unsafe: null,
        _roots: new WeakMap(),
        ready: null,

        init() {
            if (this.ready) return this.ready;
            // uhtml 5.x 仅提供 ESM 构建；并行加载时不影响下方同步安装 WebSocket 拦截。
            this.ready = import(this.CDN_URL).then(module => {
                this._html = module.html;
                this._render = module.render;
                this._Hole = module.Hole;
                this._unsafe = module.unsafe;
                return this;
            });
            return this.ready;
        },

        html(strings, ...values) {
            if (!this._html) throw new Error('uhtml is not ready');
            return this._html(strings, ...values);
        },

        raw(markup) {
            if (!this._unsafe) throw new Error('uhtml is not ready');
            return this._unsafe(String(markup ?? ''));
        },

        get empty() {
            return null;
        },

        isTemplate(value) {
            return Boolean(this._Hole && value instanceof this._Hole);
        },

        render(view, container) {
            if (!container) return null;
            if (!this._render || !this._html) throw new Error('uhtml is not ready');
            const resolveContent = () => {
                const content = typeof view === 'function' ? view() : view;
                if (!this.isTemplate(content)) throw new TypeError('TemplateRenderer.render requires a template');
                return content;
            };
            const current = this._roots.get(container);
            let next = null;

            if (!current) {
                this._render(container, () => {
                    next = resolveContent();
                    return next;
                });
                this._roots.set(container, {hole: next});
                return container;
            }

            next = resolveContent();
            if (current.hole.t === next.t) {
                // uhtml 5.0.9 会缓存 repeated render 传入的新 Hole，复用旧 Hole 才能持续增量更新。
                current.hole.update(next);
            } else {
                this._render(container, () => next);
                current.hole = next;
            }
            return container;
        },

        renderHtml(markup, container) {
            return this.render(() => this.html`${this.raw(typeof markup === 'function' ? markup() : markup)}`, container);
        },

        clear(container) {
            return this.render(() => this.html``, container);
        }
    };

    // Tampermonkey 开启 @grant 后需要在页面上下文替换 WebSocket。
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const hostname = window.location.hostname;
    const domainname = hostname.substring(hostname.lastIndexOf('.', hostname.lastIndexOf('.') - 1) + 1);

    const CONFIG = {
        SHOW_LANGUAGE_TOGGLE: true, // 仅用于测试手动切换脚本语言
        MARKET_CACHE_TTL: 60 * 60 * 1000,
        PROFILE_CACHE_TTL: 30 * 24 * 60 * 60 * 1000,
        PROFILE_CACHE_LIMIT: 50,
        MARKET_URL: 'https://www.' + domainname + '/game_data/marketplace.json',
        characterId: new URLSearchParams(window.location.search).get('characterId'),
        MIN_FROM_LEVEL: 1,
        MAX_FROM_LEVEL: 7,
        MAX_TO_LEVEL: 8,
        AUTO_CALC_DELAY: 150,
        TOAST_MAX_COUNT: 3,
        TOAST_DURATION: 3000,
        isGameSite: domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com',
        isMilkonomySite: hostname === 'milkonomy.pages.dev' || hostname === 'hyhfish.github.io'
    };

    if (CONFIG.isGameSite) TemplateRenderer.init();

    const i18n = {
        currentLang: 'en',
        messageGroups: {
            common: {
                name: {zh: '名称', en: 'Name'},
                error: {zh: '错误', en: 'Error'},
                marketDataTime: {zh: '市场数据时间', en: 'Market Data Time'},
                marketNoData: {zh: '无市场数据', en: 'No Market Data'},
                noCharacterData: {zh: '暂无角色数据，请刷新页面重试', en: 'No character data. Please refresh.'},
                upgradeCalculator: {zh: '升级计算器', en: 'Upgrade Calculator'},
                calculatorDataNotReady: {zh: '游戏数据尚未加载完成，请稍后重试', en: 'Game data is not ready. Please try again shortly.'},
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
            },
            houseCalculator: {
                title: {zh: '房屋升级材料计算器', en: 'House Upgrade Material Calculator'},
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
                upgradeNotFound: {zh: '找不到房屋 {0} 等级 {1} 的升级信息', en: 'Upgrade cost for house {0} at level {1} was not found'}
            },
            marketMate: {
                importClipboard: {zh: '导入剪贴板', en: 'Import Clipboard'},
                toastImportClipboardEmpty: {zh: '剪贴板为空', en: 'Clipboard is empty'},
                toastImportClipboardDone: {zh: '已从剪贴板导入 {0} 种物品，共 {1} 个', en: 'Imported {0} item types from the clipboard ({1} total)'},
                toastImportClipboardUnmatched: {zh: '跳过 {0} 种未识别物品', en: 'Skipped {0} unrecognized item(s)'},
                toastImportClipboardFailed: {zh: '导入剪贴板失败：{0}', en: 'Clipboard import failed: {0}'},
                addMissingToCart: {zh: '加入购物车', en: 'Add to Cart'},
                addMissingToCartTitle: {zh: '把缺失材料加入 MWI 市场伴侣购物车', en: 'Add missing materials to the MWI Market Mate cart'},
                addMissingToCartDone: {zh: '已添加 {0} 种缺失材料，共 {1} 个', en: 'Added {0} missing item types ({1} total)'},
                marketMateUnavailable: {zh: 'MWI 市场伴侣尚未就绪', en: 'MWI Market Mate is not ready'}
            },
            characterSwitcher: {
                switchCharacter: {zh: '切换角色', en: 'Switch Character'}
            },
            edsMilkonomy: {
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
            },
            characterCard: {
                loadoutCharacterCard: {zh: '生成配装名片', en: 'Loadout Card'},
                loadoutCharacterCardTitle: {zh: '根据当前配装生成角色名片', en: 'Generate a character card from the selected loadout'},
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
                editAbilityHint: {zh: '💡 点击技能图标可更换/添加展示的技能', en: '💡 Click skill icons to change/add displayed skills'},
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
                algorithmSourceMwiTools: {zh: '算法来源：MWITools', en: 'Algorithm source: MWITools'},
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
                    en: 'Open a character\'s in-game profile to get the latest information.'
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
                cardShort: {zh: '名片', en: 'Card'},
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
            },
            toolkitMenu: {
                toolkitTitle: {zh: 'Sunrishe 工具箱', en: 'Sunrishe Toolkit'},
                toolkitShort: {zh: '工具箱', en: 'Toolkit'},
                switchLanguage: {zh: '切换为英文', en: 'Switch to Chinese'},
                userCharacterCard: {zh: '用户名片', en: 'Character Card'},
                equipmentComparison: {zh: '装备提升计算', en: 'Equipment Comparison'},
                dungeonProfitCalculator: {zh: '地下城收益计算器', en: 'Dungeon Profit Calculator'},
                houseUpgradeCalculator: {zh: '房屋升级材料计算器', en: 'House Upgrade Calculator'},
                combatUpgradeCalculator: {zh: '战斗升级计算器', en: 'Combat Upgrade Calculator'},
                abilityUpgradeCalculator: {zh: '技能升级计算器', en: 'Ability Upgrade Calculator'}
            },
            dungeonCalculator: {
                dungeonCalculatorHelpTitle: {zh: '查看地下城收益说明', en: 'View dungeon profit instructions'},
                dungeonCalculatorHelp: {
                    zh: '使用：选择地下城和难度，填写单次耗时、每日运行时长和统计天数。队伍人数、战斗掉落数量及掉落率默认读取角色数据，也可手动调整。\n\n产量：个人地下城产量倍率 =（1 + 掉落数量）× 5 ÷ 队伍人数；奖励概率按官方难度倍率和战斗掉落率计算，最高为 100%。\n\n成本：可按官方配方的材料价格或成品市场价计算。工匠茶和暴饮只影响配方材料消耗。保守值使用 bid 收益和 ask 成本，乐观值使用相反方向；市场税默认扣除普通物品 2%、牛铃 18%。\n\n限制：通关耗时需要手动填写；周期利润按当前参数和价格线性累计，不预测价格变化。宝箱份额门票口径仅用于兼容原样例。缺价物品按 0 估值并提示。',
                    en: 'Usage: Select a dungeon and tier, then enter clear time, daily runtime, and period length. Party size, combat drop quantity, and combat drop rate use character data by default and can be overridden.\n\nYield: Personal dungeon yield = (1 + drop quantity) × 5 ÷ party size. Reward chance uses the official tier scaling and combat drop rate, capped at 100%.\n\nCosts: Entry tickets and chest keys can use official recipe-material costs or finished-item market prices. Artisan Tea and Guzzling Pouch affect recipe materials only. Conservative values use bid revenue and ask costs; optimistic values use the opposite sides. Market tax defaults to 2%, or 18% for Cowbells.\n\nLimits: Clear time is entered manually. Period profit is a linear projection using current parameters and prices. Chest-share ticket mode exists only to match the legacy example. Missing prices are valued at 0 and reported.'
                },
                dungeon: {zh: '地下城', en: 'Dungeon'},
                difficultyTier: {zh: '难度', en: 'Tier'},
                clearTimeMinutes: {zh: '单次耗时（分钟）', en: 'Clear Time (min)'},
                dailyRuntimeHours: {zh: '每日运行（小时）', en: 'Daily Runtime (h)'},
                periodDays: {zh: '统计周期（天）', en: 'Period (days)'},
                partySize: {zh: '队伍人数', en: 'Party Size'},
                combatDropQuantity: {zh: '战斗掉落数量（%）', en: 'Combat Drop Quantity (%)'},
                combatDropRate: {zh: '战斗掉落率（%）', en: 'Combat Drop Rate (%)'},
                useCharacterBuff: {zh: '读取角色 Buff', en: 'Use Character Buff'},
                costCalculationMode: {zh: '成本方式', en: 'Cost Basis'},
                costByMaterials: {zh: '制作材料成本', en: 'Recipe Materials'},
                costByMarket: {zh: '成品市场价', en: 'Finished Item Market'},
                artisanTea: {zh: '使用工匠茶', en: 'Use Artisan Tea'},
                guzzlingLevel: {zh: '暴饮强化等级', en: 'Guzzling Level'},
                applyMarketTax: {zh: '收益扣除市场税', en: 'Apply Market Tax'},
                ticketCalculationMode: {zh: '门票口径', en: 'Ticket Basis'},
                ticketByActualClears: {zh: '实际通关次数', en: 'Actual Clears'},
                ticketByRewardShares: {zh: '宝箱份额（兼容样例）', en: 'Chest Shares (Legacy Example)'},
                actualClears: {zh: '实际通关', en: 'Actual Clears'},
                ticketRequired: {zh: '门票需求', en: 'Tickets Required'},
                normalChestShares: {zh: '普通宝箱', en: 'Normal Chests'},
                refinementChestShares: {zh: '精炼宝箱', en: 'Refinement Chests'},
                resultItem: {zh: '项目', en: 'Item'},
                quantity: {zh: '数量', en: 'Quantity'},
                conservative: {zh: '保守值', en: 'Conservative'},
                optimistic: {zh: '乐观值', en: 'Optimistic'},
                entryTicketCost: {zh: '每日门票成本', en: 'Daily Entry Cost'},
                chestOpeningCost: {zh: '每日开箱成本', en: 'Daily Opening Cost'},
                normalChestRevenue: {zh: '普通宝箱收益', en: 'Normal Chest Revenue'},
                refinementChestRevenue: {zh: '精炼宝箱收益', en: 'Refinement Chest Revenue'},
                totalChestRevenue: {zh: '每日宝箱收益', en: 'Daily Chest Revenue'},
                netProfit: {zh: '每日净利润', en: 'Daily Net Profit'},
                periodNetProfit: {zh: '{0} 天累计净利润', en: '{0}-Day Net Profit'},
                profitPerChestShare: {zh: '单宝箱份额利润', en: 'Profit per Chest Share'},
                profitPerClear: {zh: '实际每通关利润', en: 'Profit per Clear'},
                ticketUnitPrice: {zh: '门票单位成本', en: 'Entry Unit Cost'},
                keyUnitPrice: {zh: '开箱钥匙单位成本', en: 'Chest Key Unit Cost'},
                materialConsumption: {zh: '材料消耗', en: 'Material Use'},
                priceAskBid: {zh: 'ask {0} / bid {1}', en: 'ask {0} / bid {1}'},
                missingMarketPrices: {zh: '有 {0} 种物品缺少市场价格，相关收益或成本暂按 0 计算。', en: '{0} item(s) have no market price; affected revenue or costs are currently valued at 0.'},
                invalidDungeonInput: {zh: '请输入大于 0 的单次耗时和每日运行时长', en: 'Clear time and daily runtime must be greater than 0.'},
                noDungeonData: {zh: '未找到官方地下城数据', en: 'Official dungeon data was not found.'}
            },
            equipmentComparison: {
                equipmentComparisonTitle: {zh: '装备提升计算', en: 'Equipment Comparison'},
                equipmentComparisonNotice: {
                    zh: '提示：本工具在相同战斗条件与固定随机种子下，模拟两套仅目标装备不同的配装对标准目标造成的持续 DPS。结果仅反映装备的相对提升，不代表具体怪物、战区或队伍配置中的实际收益，仅供参考。',
                    en: 'Note: Under identical combat conditions and fixed random seeds, this tool compares the sustained DPS of two builds that differ only in the selected item against a standard target. Results show relative equipment gain only and may not match actual performance against specific enemies, zones, or party compositions.'
                },
                combatPreset: {zh: '职业方案', en: 'Combat Build'},
                presetGroupMelee: {zh: '近战', en: 'Melee'},
                presetGroupRanged: {zh: '远程', en: 'Ranged'},
                presetGroupMagic: {zh: '魔法', en: 'Magic'},
                presetMeleeHammer: {zh: '近战 - 锤', en: 'Melee - Hammer'},
                presetMeleeBulwark: {zh: '近战 - 盾', en: 'Melee - Bulwark'},
                presetMeleeSword: {zh: '近战 - 剑', en: 'Melee - Sword'},
                presetMeleeSpear: {zh: '近战 - 枪', en: 'Melee - Spear'},
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
                  noOwnedEquipment: {zh: '未找到可用装备', en: 'No equipment found'},
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
                  dpsPerTenMillionHint: {zh: '仅在 DPS 提升且价格差为正时计算', en: 'Calculated only when DPS increases and the price difference is positive'},
                  simulationLoading: {zh: '正在模拟…', en: 'Simulating…'},
                  dpsDataUnavailable: {zh: '当前战斗数据不可用', en: 'Current combat data is unavailable'},
                  dpsCalculationError: {zh: '计算失败', en: 'Calculation failed'},
                  combatSimulationTimeout: {zh: '战斗模拟超时', en: 'Combat simulation timed out'},
                  combatSimulationFailed: {zh: '战斗模拟失败', en: 'Combat simulation failed'},
                  combatSimulationWorkerFailed: {zh: '战斗模拟 Worker 加载失败', en: 'Failed to load the combat simulation worker'},
                  noComparableAttributes: {zh: '所选装备没有可对比属性', en: 'The selected equipment has no comparable stats'},
                equipmentComparisonHelpTitle: {zh: '查看装备提升说明', en: 'View equipment comparison instructions'},
                equipmentComparisonHelp: {
                    zh: '使用：先选择职业方案，再选择基准装备和同一穿戴位置的对比装备；支持比较同名装备的不同强化等级。属性差异、DPS、装备价格差和每 10M 金币 DPS 提升会自动计算。\n\n方案：除所选装备外，使用对应职业的 +10 单刷战斗套装、+5 贤者三件套与暴饮之囊，技能等级固定为 4/6/6/6/6，并配置固定食物和职业咖啡。战斗等级、房屋等级和已完成成就使用角色当前数据。\n\n原理：先构建两套除所选装备外完全一致的完整配装，再使用相同的固定随机种子分别模拟。DPS 为实际造成的总伤害除以模拟时间；DPS 提升为对比 DPS 相对基准 DPS 的变化比例。这样可以把差异尽量限定在所选装备，同时降低随机命中、暴击和技能触发带来的波动。\n\n计算：每套配装使用 5 个固定随机种子，对不会死亡的标准标靶进行 3 小时本地模拟。标准标靶不会攻击，结果用于比较持续输出，不代表具体战区收益。装备价格差只计算所选两件装备；仅当 DPS 提升、价格差为正且市场价格完整时，计算每 10M 金币 DPS 提升。\n\n来源：战斗模拟核心参考 MWICombatSimulatorTest，沿用其角色属性、装备强化、技能、增益、命中、伤害和触发规则；MST 仅为装备对比固定职业方案、标准标靶和抽样方式。\n\n限制：只能比较同一穿戴位置且符合当前职业战斗风格的装备。结果属于标准环境下的相对比较，未包含具体战区怪物、战斗时长、敌方攻击及队伍配置造成的影响。',
                    en: 'Usage: Choose a combat preset, then select baseline and comparison equipment for the same slot. The same item can be compared at different enhancement levels. Stat differences, DPS, price difference, and DPS gain per 10M coins are calculated automatically.\n\nBuild: Except for the selected item, the simulation uses the preset\'s +10 solo combat set, the +5 Philosopher accessory set and Guzzling Pouch, abilities at 4/6/6/6/6, fixed food, and preset combat coffees. Current combat levels, house rooms, and completed achievements come from your character data.\n\nPrinciple: Two complete builds are created with every setting identical except the selected item, then simulated separately with the same fixed random seeds. DPS is total actual damage divided by simulated time, and DPS gain is the comparison DPS relative to the baseline DPS. This isolates the selected item as much as possible while reducing variance from hits, critical strikes, and ability procs.\n\nCalculation: Each build is simulated locally for 3 hours against an immortal standard target using 5 fixed random seeds. The target does not attack, so the result compares sustained damage and does not represent gains in a specific combat zone. Price difference compares only the two selected items. DPS gain per 10M coins is calculated only when DPS increases, the price difference is positive, and both market prices are available.\n\nSource: The combat simulation core is based on MWICombatSimulatorTest and follows its rules for character stats, equipment enhancement, abilities, buffs, accuracy, damage, and triggers. MST only defines the comparison presets, standard target, and sampling method.\n\nLimits: Equipment must use the same slot and be compatible with the selected combat style. Results are relative comparisons in a standard environment and do not include the effects of specific enemies, encounter duration, incoming attacks, or party composition.'
                }
            },
            combatCalculator: {
                primaryXpRate: {zh: '主修经验 (K/h)', en: 'Primary XP (K/h)'},
                secondaryXpRate: {zh: '选修经验 (K/h)', en: 'Secondary XP (K/h)'},
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
                    zh: '使用：填写主修、选修经验；双击上方专业添加，只能从序号列拖动列表排序，再设置起始等级、目标等级、类型和同修。每行可单独填写经验以覆盖顶部数值，EPH 仅用于估算次数。重置列表会恢复耐力、智力、攻击、防御及当前等级最高的战斗主修。\n\n限制：耐力、智力固定为选修；远程、魔法固定为主修；攻击、防御、近战可切换类型。列表至少需要一项主修，同一序号不能出现重复专业。\n\n计算：选修使用选修经验；未同修的主修使用主修与选修经验之和。同修主修使用主修经验，其目标等级不能手动修改，会按它覆盖的选修训练时段反推出结束等级和经验百分比。相邻选修勾选同修后并入前一选修序号；主修勾选同修后并入上一主修之后的首个选修序号。同一序号同时开始，下一序号等待上一序号全部完成。未自定义起始等级时使用角色实际经验；重复专业会继承前一段结束时的精确经验。',
                    en: 'Usage: Enter primary and secondary XP rates; double-click a skill above to add it, drag rows only from the sequence column to reorder, then set the start level, target level, type, and Train Together option. A per-row XP rate overrides the shared rate, and EPH is only used to estimate runs. Reset List restores Stamina, Intelligence, Attack, Defense, and the highest-level primary combat skill.\n\nLimits: Stamina and Intelligence are always secondary; Ranged and Magic are always primary; Attack, Defense, and Melee can switch types. At least one primary row is required, and the same skill cannot appear twice in one sequence.\n\nCalculation: A secondary row uses the secondary XP rate. A primary row trained alone uses primary plus secondary. A primary row trained together uses the primary rate; its target cannot be edited and is derived from the secondary training period it spans, including the ending XP percentage. Adjacent secondary rows can share a sequence; a primary row trained together joins the first secondary sequence after the previous primary. Rows in one sequence start together, and the next sequence waits for the previous one to finish. Without a custom start level, actual character XP is used. A repeated skill inherits the exact ending XP from its previous segment.'
                },
                combatPrimaryRequired: {zh: '训练方案至少需要一条主修；耐力等选修不能脱离主修单独训练。', en: 'A training plan requires at least one primary profession; secondary professions such as Stamina cannot train on their own.'},
                totalHours: {zh: '耗时', en: 'Duration'},
                totalDays: {zh: '总时间（天）', en: 'Total Time (days)'},
                estimatedUpgradeTime: {zh: '预计升级时间', en: 'Estimated Completion'},
                estimatedStartTime: {zh: '预计开始时间', en: 'Estimated Start'},
                totalRuns: {zh: '总次数', en: 'Total Runs'},
                doubleClickToAdd: {zh: '双击添加', en: 'Double-click to add'},
                dragToSort: {zh: '从序号处拖动排序', en: 'Drag the sequence cell to reorder'}
            },
            abilityCalculator: {
                abilityCalculatorHelpTitle: {zh: '查看技能升级说明', en: 'View ability calculator instructions'},
                abilityCalculatorHelp: {
                    zh: '使用：选择职业方案会清空列表并加入对应技能；预设等级会依次设置前五个技能的目标等级。也可添加单个技能，并按中文、英文或 HRID 搜索。点击技能图标可前往市场；安装 MWI 市场伴侣后，可将需要购买的技能书加入购物车。\n\n限制：只能添加有对应技能书的技能，且同一技能不能重复。起始等级范围为 0-199，目标等级范围为 1-200；目标等级不高于起点时无需技能书。缺少某侧市场价格时，不计算对应总价。\n\n计算：默认从角色当前实际经验开始；自定义起始等级后，从该等级 0% 经验开始。0 级技能会额外计入 1 本解锁用技能书。所需技能书向上取整到 0.1 本；价格和购物车数量按整本向上取整。技能书合计累加显示数量，价格合计按各项整本购买量累加。',
                    en: 'Usage: Choosing a profession preset clears the list and adds its abilities. A level preset sets target levels for the first five abilities in order. You can also add individual abilities and search by Chinese, English, or HRID. Click an ability icon to view its marketplace page. With MWI Market Mate installed, required books can be added to its cart.\n\nLimits: Only abilities with a corresponding book can be added, and duplicates are not allowed. Start levels range from 0 to 199 and target levels from 1 to 200. No books are needed when the target does not exceed the starting point. If one market price is unavailable, its total is not calculated.\n\nCalculation: Actual character XP is used by default. A custom start begins at 0% XP of that level. A level-0 ability includes one extra book to unlock it. Required books are rounded up to the nearest 0.1, while prices and cart quantities are rounded up to whole books. The book total uses displayed quantities; price totals use whole-book purchase quantities.'
                },
                chooseAbility: {zh: '选择技能', en: 'Choose Ability'},
                searchAbility: {zh: '搜索中文、英文或 HRID', en: 'Search Chinese, English, or HRID'},
                experiencePerBook: {zh: '每本书技能经验', en: 'Ability Exp Per Book'},
                customStartLevel: {zh: '自行设置起始等级', en: 'Custom Start Level'},
                resetActualLevel: {zh: '重置实际等级', en: 'Reset Actual Level'},
                requiredBooks: {zh: '所需技能书', en: 'Books Required'},
                openMarket: {zh: '前往市场', en: 'View Marketplace'},
                addAbilityBooksToCart: {zh: '加入市场伴侣购物车', en: 'Add to Market Mate Cart'},
                abilityBooksAddedToCart: {zh: '已将 {0} 本「{1}」加入市场伴侣购物车', en: 'Added {0} × {1} to the Market Mate cart'},
                abilityBooksCartFailed: {zh: '技能书未能加入市场伴侣购物车', en: 'The ability books could not be added to the Market Mate cart'},
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
                askPriceAndTotal: {zh: '最佳出售价 / 总价', en: 'Best Ask Price / Total'},
                bidPriceAndTotal: {zh: '最佳收购价 / 总价', en: 'Best Bid Price / Total'},
                total: {zh: '合计', en: 'Total'},
                totalBooks: {zh: '技能书合计', en: 'Total Books'},
                noAbilitiesSelected: {zh: '暂无技能，请添加技能或选择预置方案', en: 'No abilities. Add an ability or choose a preset.'}
            }
        },
        messageIndex: {},

        buildMessageIndex() {
            const index = {}; 
            for (const [moduleName, messages] of Object.entries(this.messageGroups)) {
                for (const [key, message] of Object.entries(messages)) {
                    if (index[key]) throw new Error(`[MST] i18n 文案 key 重复：${key}（${moduleName}）`);
                    index[key] = message;
                }
            }
            this.messageIndex = index;
        },

        readPageLanguage() {
            const storageKey = CONFIG.isMilkonomySite ? 'lang-storage-key' : 'i18nextLng';
            return localStorage.getItem(storageKey) || document.documentElement.lang || '';
        },

        loadLangPref() {
            try {
                this.currentLang = this.normalizeLang(this.readPageLanguage());
            } catch {
                this.currentLang = 'en';
            }
        },

        syncPageLanguage() {
            try {
                return this.setLanguage(this.readPageLanguage());
            } catch {
                return false;
            }
        },

        normalizeLang(value) {
            return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
        },

        get languageKey() {
            return this.currentLang === 'zh' ? 'zh' : 'en';
        },

        get locale() {
            return this.languageKey === 'zh' ? 'zh-CN' : 'en-US';
        },

        get alternateLanguage() {
            return this.languageKey === 'zh' ? 'en' : 'zh';
        },

        setLanguage(value) {
            const nextLang = this.normalizeLang(value);
            if (this.currentLang === nextLang) return false;
            this.currentLang = nextLang;
            return true;
        },

        pick(entry, fallback = '') {
            if (!entry || typeof entry !== 'object') return String(entry ?? fallback);
            return entry[this.languageKey] ?? entry.zh ?? entry.en ?? fallback;
        },

        t(key, ...args) {
            const entry = this.messageIndex[key];
            if (!entry) return key;
            let text = this.pick(entry, key);
            for (let i = 0; i < args.length; i++) {
                text = text.replace('{' + i + '}', String(args[i] ?? ''));
            }
            return text;
        }
    };

    i18n.buildMessageIndex();
    i18n.loadLangPref();

    const LanguageEvents = {
        listeners: new Set(),

        subscribe(listener) {
            if (typeof listener !== 'function') throw new TypeError('Language listener must be a function');
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        },

        emit(lang) {
            const detail = {lang};
            this.listeners.forEach(listener => {
                try {
                    listener(detail);
                } catch (error) {
                    console.error('[MST] Language listener failed:', error);
                }
            });
            // 保留旧事件名，兼容可能监听 MST 语言变化的外部脚本。
            window.dispatchEvent(new CustomEvent('hccp-lang-changed', {detail}));
        }
    };

    // ==================== 综合脚本统一数据层 ====================
    const STORAGE_KEYS = {
        PROFILE_CACHE: 'MST_CC_profiles',
        TEAM_CARD: 'MST_CC_team',
        MILKONOMY_PRESET: 'MST_EDS_preset',
        MARKET_CACHE: 'MST_HCCP_market',
        MARKET_CACHE_TIMESTAMP: 'MST_HCCP_marketTimestamp',
        MWITOOLS_MARKET_CACHE: 'MWITools_marketAPI_json',
        MWITOOLS_MARKET_TIMESTAMP: 'MWITools_marketAPI_timestamp'
    };

    const DataHub = {
        clientData: {
            raw: null,
            source: 'pending',
            indexes: {
                itemDetailMap: {},
                houseRoomDetailMap: {},
                actionDetailMap: {},
                actionNameToHrid: new Map(),
                nameToHrid: new Map(),
                hridToName: new Map(),
                hridToNameEn: new Map(),
                hridToNameZh: new Map(),
                houseHridToNameEn: new Map(),
                houseHridToNameZh: new Map(),
                abilityBookByAbilityHrid: new Map()
            },
            i18nResources: null
        },
        characterData: {raw: null, profiles: {}, battleUnits: new Map(), source: '', updatedAt: 0},
        i18nWatcherStarted: false,
        clientDataCacheSource: '',

        init() {
            // Sprite 路径来自当前游戏页面，不保留旧版本曾写入的静态缓存。
            localStorage.removeItem('MST_CC_spritePaths');
            this.loadStoredProfiles();
            this.initClientDataFromCache();
            this.refreshI18nIndexes();
            this.startI18nResourceWatcher();
        },

        initClientData(data, source) {
            if (!data || typeof data !== 'object') return false;
            this.clientData.raw = data;
            this.clientData.source = source || 'unknown';
            const nextItemMap = data.itemDetailMap || {};
            const nextHouseMap = data.houseRoomDetailMap || {};
            const itemTarget = this.clientData.indexes.itemDetailMap || {};
            const houseTarget = this.clientData.indexes.houseRoomDetailMap || {};
            Object.keys(itemTarget).forEach(key => delete itemTarget[key]);
            Object.keys(houseTarget).forEach(key => delete houseTarget[key]);
            Object.assign(itemTarget, nextItemMap);
            Object.assign(houseTarget, nextHouseMap);
            this.clientData.indexes.itemDetailMap = itemTarget;
            this.clientData.indexes.houseRoomDetailMap = houseTarget;
            const nextActionMap = data.actionDetailMap || {};
            this.clientData.indexes.actionDetailMap = nextActionMap;
            const actionNameToHrid = new Map();
            Object.values(nextActionMap).forEach(action => {
                if (!action?.name || !action?.hrid || actionNameToHrid.has(action.name)) return;
                actionNameToHrid.set(action.name, action.hrid);
            });
            this.clientData.indexes.actionNameToHrid = actionNameToHrid;
            const abilityBookByAbilityHrid = new Map();
            Object.values(nextItemMap).forEach(item => {
                const abilityHrid = item?.abilityBookDetail?.abilityHrid;
                if (abilityHrid) abilityBookByAbilityHrid.set(abilityHrid, item);
            });
            this.clientData.indexes.abilityBookByAbilityHrid = abilityBookByAbilityHrid;
            this.refreshI18nIndexes();
            window.dispatchEvent(new CustomEvent('mst:data:client-ready', {detail: {source: this.clientData.source}}));
            return true;
        },

        initClientDataFromCache() {
            if (this.clientData.raw?.itemDetailMap || this.clientData.raw?.actionDetailMap) return true;
            const cached = this.readClientDataFromCache();
            return cached ? this.initClientData(cached, this.clientDataCacheSource || 'localStorage') : false;
        },

        readClientDataFromCache() {
            try {
                const tryParse = (json, tag) => {
                    if (!json || typeof json !== 'string') return null;
                    try {
                        const parsed = JSON.parse(json);
                        if (parsed && typeof parsed === 'object' && (parsed.itemDetailMap || parsed.actionDetailMap || parsed.houseRoomDetailMap)) {
                            this.clientDataCacheSource = 'localStorage(' + tag + ')';
                            return parsed;
                        }
                    } catch {}
                    return null;
                };
                const raw = localStorage.getItem('initClientData');
                if (raw) {
                    try {
                        const hit = tryParse(this.lzDecompressUTF16(raw), 'builtin-lz');
                        if (hit) return hit;
                    } catch {}
                    try {
                        if (typeof LZString !== 'undefined' && LZString.decompressFromUTF16) {
                            const hit = tryParse(LZString.decompressFromUTF16(raw), 'global-lz');
                            if (hit) return hit;
                        }
                    } catch {}
                    const hit = tryParse(raw, 'plain-json');
                    if (hit) return hit;
                }
                return null;
            } catch (error) {
                console.warn('[MWI-Integrated] initClientData cache read failed:', error);
                return null;
            }
        },

        getClientData() {
            return this.clientData.raw;
        },

        getInitClientData() {
            return this.getClientData();
        },

        getClientDataMap(key) {
            return this.clientData.raw?.[key] || {};
        },

        // 最小化 LZString.decompressFromUTF16，优先用于读取游戏缓存。
        lzDecompressUTF16(input) {
            if (input == null || input === '') return '';
            const getValue = index => input.charCodeAt(index) - 32;
            const resetValue = 16384;
            let dictionary = [];
            let enlargeIn = 4;
            let dictSize = 4;
            let numBits = 3;
            let entry = '';
            let result = [];
            let w;
            let bits;
            let resb;
            let maxpower;
            let power;
            let c;
            let data = {val: getValue(0), position: resetValue, index: 1};
            for (let i = 0; i < 3; i++) dictionary[i] = i;
            const readBits = count => {
                let out = 0;
                maxpower = Math.pow(2, count);
                power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) {
                        data.position = resetValue;
                        data.val = getValue(data.index++);
                    }
                    out |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                return out;
            };
            bits = readBits(2);
            if (bits === 0) c = String.fromCharCode(readBits(8));
            else if (bits === 1) c = String.fromCharCode(readBits(16));
            else return '';
            dictionary[3] = c;
            w = c;
            result.push(c);
            while (true) {
                if (data.index > input.length) return '';
                bits = readBits(numBits);
                switch ((c = bits)) {
                    case 0:
                        dictionary[dictSize++] = String.fromCharCode(readBits(8));
                        c = dictSize - 1;
                        enlargeIn--;
                        break;
                    case 1:
                        dictionary[dictSize++] = String.fromCharCode(readBits(16));
                        c = dictSize - 1;
                        enlargeIn--;
                        break;
                    case 2:
                        return result.join('');
                }
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits++;
                }
                if (dictionary[c]) entry = dictionary[c];
                else if (c === dictSize) entry = w + w.charAt(0);
                else return null;
                result.push(entry);
                dictionary[dictSize++] = w + entry.charAt(0);
                enlargeIn--;
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits++;
                }
                w = entry;
            }
        },

        updateCharacterData(data, source) {
            if (!data || typeof data !== 'object') return false;
            this.characterData.raw = data;
            this.characterData.source = source || 'ws';
            this.characterData.updatedAt = Date.now();
            this.characterData.battleUnits.clear();
            this.rememberBattleUnit(data.combatUnit);
            window.dispatchEvent(new CustomEvent('mst:data:character-ready', {detail: data}));
            this.emitCharacterUpdate('init_character_data', ['*']);
            return true;
        },

        emitCharacterUpdate(type, fields) {
            this.characterData.source = 'ws:' + type;
            this.characterData.updatedAt = Date.now();
            window.dispatchEvent(new CustomEvent('mst:data:character-updated', {
                detail: {type, fields, raw: this.characterData.raw, updatedAt: this.characterData.updatedAt}
            }));
        },

        mergeCharacterArray(field, updates, getKey, removeWhen) {
            if (!this.characterData.raw || !Array.isArray(updates) || !updates.length) return false;
            const current = Array.isArray(this.characterData.raw[field]) ? this.characterData.raw[field] : [];
            const byKey = new Map();
            current.forEach(item => {
                const key = getKey(item);
                if (key) byKey.set(key, item);
            });
            updates.forEach(item => {
                const key = getKey(item);
                if (!key) return;
                if (removeWhen?.(item)) byKey.delete(key);
                else byKey.set(key, item);
            });
            this.characterData.raw[field] = [...byKey.values()];
            return true;
        },

        rememberBattleUnit(unit) {
            const characterId = unit?.character?.id ?? unit?.characterID ?? unit?.characterId;
            if (characterId == null) return false;
            this.characterData.battleUnits.set(String(characterId), unit);
            return true;
        },

        getBattleUnit(characterId) {
            return this.characterData.battleUnits.get(String(characterId)) || null;
        },

        getSharableCharacter(characterId) {
            const id = String(characterId);
            const raw = this.characterData.raw || {};
            return raw.partyInfo?.sharableCharacterMap?.[id] ||
                raw.guildSharableCharacterMap?.[id] ||
                raw.friendCharacterMap?.[id] ||
                null;
        },

        applyCharacterMessage(message) {
            const raw = this.characterData.raw;
            if (!raw || !message || typeof message !== 'object') return [];
            const type = message.type || 'unknown';
            const changed = [];
            const replace = (field, value) => {
                raw[field] = value;
                changed.push(field);
            };

            if (type === 'character_updated' && message.character) replace('character', message.character);
            if (type === 'character_info_updated' && message.characterInfo) replace('characterInfo', message.characterInfo);
            if (type === 'character_stats_updated') {
                if (message.combatUnit) {
                    replace('combatUnit', message.combatUnit);
                    this.rememberBattleUnit(message.combatUnit);
                }
                if (message.noncombatStats) replace('noncombatStats', message.noncombatStats);
            }
            if (type === 'loadouts_updated' && message.characterLoadoutMap) replace('characterLoadoutMap', message.characterLoadoutMap);
            if (type === 'house_rooms_updated') {
                if (message.characterHouseRoomMap) replace('characterHouseRoomMap', message.characterHouseRoomMap);
                if (message.houseActionTypeBuffsMap) replace('houseActionTypeBuffsMap', message.houseActionTypeBuffsMap);
            }
            if (type === 'action_type_consumable_slots_updated') {
                if (Object.prototype.hasOwnProperty.call(message, 'actionTypeFoodSlotsMap')) {
                    replace('actionTypeFoodSlotsMap', message.actionTypeFoodSlotsMap);
                }
                if (Object.prototype.hasOwnProperty.call(message, 'actionTypeDrinkSlotsMap')) {
                    replace('actionTypeDrinkSlotsMap', message.actionTypeDrinkSlotsMap);
                }
            }
            if (type === 'community_buffs_updated') {
                if (Object.prototype.hasOwnProperty.call(message, 'communityBuffs')) {
                    replace('communityBuffs', message.communityBuffs);
                }
                if (Object.prototype.hasOwnProperty.call(message, 'communityActionTypeBuffsMap')) {
                    replace('communityActionTypeBuffsMap', message.communityActionTypeBuffsMap);
                }
            }
            if (type === 'personal_buffs_updated') {
                if (Object.prototype.hasOwnProperty.call(message, 'characterBuffs')) {
                    replace('characterBuffs', message.characterBuffs);
                }
                if (Object.prototype.hasOwnProperty.call(message, 'personalActionTypeBuffsMap')) {
                    replace('personalActionTypeBuffsMap', message.personalActionTypeBuffsMap);
                }
            }
            if (type === 'character_friends_updated' && message.friendCharacterMap) replace('friendCharacterMap', message.friendCharacterMap);
            if (type === 'guild_characters_updated') {
                if (message.guildCharacterMap) replace('guildCharacterMap', message.guildCharacterMap);
                if (message.guildSharableCharacterMap) replace('guildSharableCharacterMap', message.guildSharableCharacterMap);
                if (message.guildTrialSignupLevelMap) replace('guildTrialSignupLevelMap', message.guildTrialSignupLevelMap);
            }
            if (type === 'party_updated' && Object.prototype.hasOwnProperty.call(message, 'partyInfo')) {
                replace('partyInfo', message.partyInfo);
            }

            if (this.mergeCharacterArray('characterSkills', message.endCharacterSkills, item => item?.skillHrid)) {
                changed.push('characterSkills');
            }
            if (this.mergeCharacterArray('characterAbilities', message.endCharacterAbilities, item => item?.abilityHrid)) {
                changed.push('characterAbilities');
            }
            if (type === 'achievements_updated' && this.mergeCharacterArray(
                'characterAchievements',
                message.achievements,
                item => item?.achievementHrid
            )) {
                changed.push('characterAchievements');
            }
            if (this.mergeCharacterArray(
                'characterItems',
                message.endCharacterItems,
                item => item?.hash || (item?.itemLocationHrid && item?.itemHrid
                    ? [item.characterID || '', item.itemLocationHrid, item.itemHrid, item.enhancementLevel || 0].join('::')
                    : ''),
                item => Number(item?.count) === 0
            )) {
                changed.push('characterItems');
            }

            if (type === 'battle_unit_fetched' && this.rememberBattleUnit(message.unit)) changed.push('battleUnits');

            if (changed.length) this.emitCharacterUpdate(type, [...new Set(changed)]);
            return changed;
        },

        normalizeProfileShared(profileMessage, receivedAt = Date.now()) {
            if (!profileMessage || typeof profileMessage !== 'object') return null;
            const profile = profileMessage.profile && typeof profileMessage.profile === 'object'
                ? profileMessage.profile
                : profileMessage;
            const firstWearable = Object.values(profile.wearableItemMap || {})[0];
            const firstHouseRoom = Object.values(profile.characterHouseRoomMap || {})[0];
            const characterID = profileMessage.characterID ??
                profileMessage.characterId ??
                profile.characterID ??
                profile.characterId ??
                profile.sharableCharacter?.id ??
                profile.characterSkills?.[0]?.characterID ??
                profile.equippedAbilities?.[0]?.characterID ??
                firstWearable?.characterID ??
                firstHouseRoom?.characterID;
            // profile_shared 本身没有可靠的数据时间，使用脚本实际收到该资料的时间。
            // receivedAt 仅用于恢复本地缓存，兼容旧缓存中的秒级时间戳。
            const rawTimestamp = receivedAt;
            const numericTimestamp = Number(rawTimestamp);
            let parsedTimestamp = Number.isFinite(numericTimestamp) ? numericTimestamp : Date.parse(rawTimestamp);
            if (Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 && parsedTimestamp < 1e12) {
                parsedTimestamp *= 1000;
            }
            return {
                type: 'profile_shared',
                profile,
                characterID,
                characterName: profileMessage.characterName || profile.sharableCharacter?.name || '',
                timestamp: Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : 0
            };
        },

        addProfileShared(profileMessage) {
            const storedProfile = this.normalizeProfileShared(profileMessage, Date.now());
            if (!storedProfile || storedProfile.characterID == null) return null;
            try {
                const id = String(storedProfile.characterID);
                this.characterData.profiles[id] = storedProfile;
                this.pruneProfiles();
                this.persistProfiles();
                window.dispatchEvent(new CustomEvent('mst:data:profile-shared', {detail: storedProfile}));
                return storedProfile;
            } catch (error) {
                console.warn('[MWI-Integrated] 保存队友资料失败:', error);
                return null;
            }
        },

        getProfile(characterId) {
            const id = String(characterId);
            const profile = this.characterData.profiles?.[id] || null;
            if (!profile) return null;
            if (Date.now() - Number(profile.timestamp || 0) <= CONFIG.PROFILE_CACHE_TTL) return profile;
            delete this.characterData.profiles[id];
            this.persistProfiles();
            return null;
        },

        findProfileByName(characterName) {
            const name = String(characterName || '').trim();
            if (!name) return null;
            return Object.values(this.characterData.profiles || {}).find(profile =>
                profile.characterName === name && Date.now() - Number(profile.timestamp || 0) <= CONFIG.PROFILE_CACHE_TTL
            ) || null;
        },

        pruneProfiles() {
            const cutoff = Date.now() - CONFIG.PROFILE_CACHE_TTL;
            const entries = Object.entries(this.characterData.profiles || {})
                .filter(([, profile]) => Number(profile?.timestamp || 0) >= cutoff)
                .sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0))
                .slice(0, CONFIG.PROFILE_CACHE_LIMIT);
            this.characterData.profiles = Object.fromEntries(entries);
        },

        persistProfiles() {
                localStorage.setItem(STORAGE_KEYS.PROFILE_CACHE, JSON.stringify(this.characterData.profiles || {}));
        },

        loadStoredProfiles() {
            try {
                const raw = localStorage.getItem(STORAGE_KEYS.PROFILE_CACHE);
                const stored = raw ? JSON.parse(raw) : {};
                const profiles = Array.isArray(stored) ? stored : Object.values(stored || {});
                this.characterData.profiles = {};
                profiles.forEach(profile => {
                    const normalized = this.normalizeProfileShared(profile, profile?.timestamp || 0);
                    if (normalized?.characterID != null) {
                        this.characterData.profiles[String(normalized.characterID)] = normalized;
                    }
                });
                this.pruneProfiles();
                this.persistProfiles();
            } catch {
                this.characterData.profiles = {};
            }
        },

        getGameObject() {
            try {
                if (pageWindow.mwiHelper?.game) return pageWindow.mwiHelper.game;
                if (pageWindow.mwi?.game) return pageWindow.mwi.game;
                const el = document.querySelector('[class^="GamePage"]');
                const key = Reflect.ownKeys(el || {}).find(k => String(k).startsWith('__reactFiber$'));
                return key ? el[key]?.return?.stateNode : null;
            } catch {
                return null;
            }
        },

        getGameState() {
            const game = this.getGameObject();
            return game?.state && typeof game.state === 'object' ? game.state : game || {};
        },

        getGameI18nResources() {
            const resources =
                pageWindow.mwiHelper?.lang ||
                pageWindow.mwi?.lang ||
                this.getGameObject()?.props?.i18n?.options?.resources ||
                null;
            if (resources?.en?.translation?.itemNames || resources?.zh?.translation?.itemNames) {
                this.clientData.i18nResources = resources;
                return resources;
            }
            return this.clientData.i18nResources;
        },

        startI18nResourceWatcher() {
            if (this.i18nWatcherStarted || !CONFIG.isGameSite) return;
            this.i18nWatcherStarted = true;
            let count = 0;
            const timer = setInterval(() => {
                count++;
                const before = this.clientData.i18nResources;
                const resources = this.getGameI18nResources();
                if (resources && resources !== before) {
                    this.refreshI18nIndexes();
                    window.dispatchEvent(new CustomEvent('mst:i18n:ready', {detail: {source: 'game'}}));
                    clearInterval(timer);
                    return;
                }
                if (count >= 120) clearInterval(timer);
            }, 1000);
        },

        refreshI18nIndexes() {
            const nameToHrid = new Map();
            const hridToName = new Map();
            const hridToNameEn = new Map();
            const hridToNameZh = new Map();
            const houseHridToNameEn = new Map();
            const houseHridToNameZh = new Map();
            const addName = (hrid, name, lang) => {
                if (!hrid || !name) return;
                const fullHrid = String(hrid).startsWith('/items/') ? String(hrid) : '/items/' + hrid;
                nameToHrid.set(String(name), fullHrid);
                nameToHrid.set(String(name).toLowerCase(), fullHrid);
                hridToName.set(fullHrid, String(name));
                if (lang === 'en') hridToNameEn.set(fullHrid, String(name));
                if (lang === 'zh') hridToNameZh.set(fullHrid, String(name));
            };
            try {
                const resources = this.getGameI18nResources();
                for (const langKey of ['en', 'zh']) {
                    const names = resources?.[langKey]?.translation?.itemNames;
                    if (names) Object.entries(names).forEach(([hrid, name]) => addName(hrid, name, langKey));
                    const houseNames = resources?.[langKey]?.translation?.houseRoomNames;
                    if (houseNames) {
                        const target = langKey === 'zh' ? houseHridToNameZh : houseHridToNameEn;
                        Object.entries(houseNames).forEach(([hrid, name]) => target.set(hrid, String(name)));
                    }
                }
            } catch {}
            Object.entries(this.clientData.indexes.itemDetailMap || {}).forEach(([hrid, detail]) => {
                addName(hrid, detail?.name, null);
                addName(hrid, detail?.nameZh, 'zh');
            });
            this.clientData.indexes.nameToHrid = nameToHrid;
            this.clientData.indexes.hridToName = hridToName;
            this.clientData.indexes.hridToNameEn = hridToNameEn;
            this.clientData.indexes.hridToNameZh = hridToNameZh;
            this.clientData.indexes.houseHridToNameEn = houseHridToNameEn;
            this.clientData.indexes.houseHridToNameZh = houseHridToNameZh;
        },

        getItemDetail(hrid) {
            return this.clientData.indexes.itemDetailMap?.[hrid] || null;
        },

        getHouseDetail(hrid) {
            return this.clientData.indexes.houseRoomDetailMap?.[hrid] || null;
        },

        getHouseRoomDetailMap() {
            return this.clientData.indexes.houseRoomDetailMap || {};
        },

        hasHouseRoomData() {
            return Object.keys(this.clientData.indexes.houseRoomDetailMap || {}).length > 0;
        },

        resolveItemName(hrid) {
            const fullHrid = utils.normalizeItemHrid(hrid);
            const langMap = {
                zh: this.clientData.indexes.hridToNameZh,
                en: this.clientData.indexes.hridToNameEn
            }[i18n.languageKey];
            return (
                langMap?.get(fullHrid) ||
                this.clientData.indexes.hridToName?.get(fullHrid) ||
                this.getItemDetail(fullHrid)?.name ||
                fullHrid.replace(/^\/items\//, '').replace(/_/g, ' ')
            );
        },

        ensureItemHrid(itemHridOrName) {
            const value = String(itemHridOrName || '').trim();
            if (!value) return null;
            if (value.startsWith('/items/')) return value;
            const hit = this.clientData.indexes.nameToHrid.get(value) || this.clientData.indexes.nameToHrid.get(value.toLowerCase());
            return hit || null;
        },

        getLocalizedGameName(group, hrid, lang = i18n.languageKey) {
            const resources = this.getGameI18nResources();
            const resource = resources?.[lang]?.translation?.[group]?.[hrid];
            if (resource) return String(resource);
            if (group === 'itemNames') return this.resolveItemName(hrid);
            let detailMap = {};
            if (group === 'skillNames') detailMap = this.getClientDataMap('skillDetailMap');
            else if (group === 'abilityNames') detailMap = this.getClientDataMap('abilityDetailMap');
            return detailMap?.[hrid]?.name || utils?.substrLastSlash?.(hrid)?.replace(/_/g, ' ') || String(hrid || '');
        }
    };

    const CharacterDataService = {
        get raw() {
            return DataHub.characterData.raw;
        },

        getCharacterItems() {
            const raw = this.raw;
            if (Array.isArray(raw?.characterItems)) return raw.characterItems;
            return utils.getCollectionValues(DataHub.getGameState().characterItemMap);
        },

        getCharacterSkills() {
            if (Array.isArray(this.raw?.characterSkills)) return this.raw.characterSkills;
            return utils.getCollectionValues(DataHub.getGameState().characterSkillMap);
        },

        getCharacterAbilities() {
            if (Array.isArray(this.raw?.characterAbilities)) return this.raw.characterAbilities;
            return utils.getCollectionValues(DataHub.getGameState().characterAbilityMap);
        },

        getCharacterSkill(skillHrid) {
            return this.getCharacterSkills().find(skill => skill?.skillHrid === skillHrid) || null;
        },

        getCharacterAbility(abilityHrid) {
            return this.getCharacterAbilities().find(ability => ability?.abilityHrid === abilityHrid) || null;
        },

        getLevelExperience(level) {
            const table = DataHub.getClientData()?.levelExperienceTable || [];
            const safeLevel = utils.clampLevel(level, 0, 200);
            return Number(table[safeLevel] || 0);
        },

        getLevelExperiencePercent(level, experience) {
            const startExperience = this.getLevelExperience(level);
            const nextExperience = this.getLevelExperience(Math.min(200, Number(level || 0) + 1));
            const levelExperience = nextExperience - startExperience;
            if (levelExperience <= 0) return 0;
            return Math.min(100, Math.max(0, (Number(experience || 0) - startExperience) / levelExperience * 100));
        },

        getCombatSkills() {
            const detailMap = DataHub.getClientDataMap('skillDetailMap');
            return Object.values(detailMap)
                .filter(detail => detail?.isCombat && detail.hrid !== '/skills/total_level')
                .sort((left, right) => Number(left.sortIndex || 0) - Number(right.sortIndex || 0))
                .map(detail => ({
                    detail,
                    characterSkill: this.getCharacterSkill(detail.hrid) || {
                        skillHrid: detail.hrid,
                        level: 0,
                        experience: 0
                    }
                }));
        },

        getAbilityBooks() {
            const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
            return [...(DataHub.clientData.indexes.abilityBookByAbilityHrid?.values() || [])]
                .map(book => ({
                    book,
                    ability: abilityMap[book.abilityBookDetail.abilityHrid] || null
                }))
                .sort((left, right) => Number(left.ability?.sortIndex || left.book?.sortIndex || 0) - Number(right.ability?.sortIndex || right.book?.sortIndex || 0));
        },

        getAbilityBook(abilityHrid) {
            return DataHub.clientData.indexes.abilityBookByAbilityHrid?.get(abilityHrid) || null;
        },

        getInventoryCount(itemHrid, level = 0) {
            const fullHrid = utils.normalizeItemHrid(itemHrid);
            if (!fullHrid) return 0;
            const targetLevel = Math.max(0, Number(level) || 0);
            let count = 0;
            for (const item of this.getCharacterItems()) {
                if (!item || item.itemHrid !== fullHrid) continue;
                if ((item.enhancementLevel || 0) !== targetLevel) continue;
                if (item.itemLocationHrid && item.itemLocationHrid !== '/item_locations/inventory') continue;
                count += Number(item.count || 0);
            }
            return count;
        }
    };

    const WebSocketService = {
        installed: false,
        // 战斗过程消息更新频繁，且不属于 MST 维护的角色状态数据。
        ignoredMessageTypes: new Set([
            'new_battle',
            'battle_updated',
            'battle_consumable_ability_updated',
            'new_guild_battle',
            'guild_battle_updated',
            'end_guild_battle'
        ]),

        install() {
            if (this.installed || pageWindow.__mwiIntegratedWsInstalled) return;
            const OriginalWebSocket = pageWindow.WebSocket;
            if (!OriginalWebSocket) return;
            const self = this;
            function IntegratedWebSocket(...args) {
                const ws = new OriginalWebSocket(...args);
                const url = String(args[0] || '');
                const isGameWs = url.includes('milkywayidle.com/ws') || url.includes('milkywayidlecn.com/ws') || url.includes('/ws');
                if (!isGameWs) return ws;
                const originalSend = ws.send;
                ws.send = function (data) {
                    self.dispatch('mst:ws:send', self.safeParse(data) || data);
                    return originalSend.call(this, data);
                };
                ws.addEventListener('message', event => self.handleMessage(event.data));
                return ws;
            }
            IntegratedWebSocket.prototype = OriginalWebSocket.prototype;
            IntegratedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
            IntegratedWebSocket.OPEN = OriginalWebSocket.OPEN;
            IntegratedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
            IntegratedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
            pageWindow.WebSocket = IntegratedWebSocket;
            this.installed = true;
            pageWindow.__mwiIntegratedWsInstalled = true;
        },

        safeParse(data) {
            try {
                return typeof data === 'string' ? JSON.parse(data) : data;
            } catch {
                return null;
            }
        },

        dispatch(name, detail) {
            window.dispatchEvent(new CustomEvent(name, {detail}));
        },

        handleMessage(message) {
            const obj = this.safeParse(message);
            if (!obj || typeof obj !== 'object') return;
            if (this.ignoredMessageTypes.has(obj.type)) return;
            this.dispatch('mst:ws:message', obj);
            if (obj.type === 'init_client_data') {
                DataHub.initClientData(obj, 'ws');
                this.dispatch('mst:ws:init-client-data', obj);
            } else if (obj.type === 'init_character_data') {
                DataHub.updateCharacterData(obj, 'ws');
                this.dispatch('mst:ws:init-character-data', obj);
            } else if (obj.type === 'profile_shared') {
                DataHub.addProfileShared(obj);
                this.dispatch('mst:ws:profile-shared', obj);
            } else {
                DataHub.applyCharacterMessage(obj);
            }
        }
    };

    if (CONFIG.isGameSite) {
        DataHub.init();
        WebSocketService.install();
    }
    const houseDetails = CONFIG.isGameSite ? DataHub.getHouseRoomDetailMap() : {};

    // ==================== 游戏页面适配层 ====================
    const GameUiAdapter = {
        selectors: {
            housePanel: '[class*="HousePanel_housePanel__"]',
            houseButtonContainer: '[class*="HousePanel_buttonContainer__"]',
            houseTitle: '[class*="HousePanel_title__"]',
            equipmentPanel: '[class*="EquipmentPanel_equipmentPanel__"]',
            equipmentButtonContainer: '[class*="EquipmentPanel_buttonContainer__"]',
            selectedLoadout: '[class*="LoadoutsPanel_selectedLoadout__"]',
            loadoutDetails: '[class*="LoadoutsPanel_details__"], [class*="details"]',
            loadoutMetadata: '[class*="LoadoutsPanel_metadata__"], [class*="metadata"]',
            characterName: '[class*="CharacterName_characterName__"]',
            header: '[class*="Header_header__"]',
            headerAvatar: '[class*="Header_avatar"]',
            headerCharacterInfo: '[class*="Header_characterInfo"]',
            headerNameData: '[class*="Header_name"] [data-name]',
            gameButton: 'button[class*="Button_button__"]'
        },

        query(name, root = document) {
            const selector = this.selectors[name];
            if (!selector || !root?.querySelectorAll) return null;
            return [...root.querySelectorAll(selector)].find(element =>
                !element.closest('.mst-character-card-modal, .mst-skill-selector-modal')
            ) || null;
        },

        queryAll(name, root = document) {
            const selector = this.selectors[name];
            if (!selector || !root?.querySelectorAll) return [];
            return [...root.querySelectorAll(selector)].filter(element =>
                !element.closest('.mst-character-card-modal, .mst-skill-selector-modal')
            );
        }
    };

    const SpriteService = {
        defaults: {
            items: '/static/media/items_sprite.f58c9476.svg',
            skills: '/static/media/skills_sprite.3bb4d936.svg',
            abilities: '/static/media/abilities_sprite.fdd1b4de.svg',
            misc: '/static/media/misc_sprite.cfad291b.svg',
            chatIcons: '/static/media/chat_icons_sprite.628944de.svg'
        },
        markers: {
            items: 'items_sprite',
            skills: 'skills_sprite',
            abilities: 'abilities_sprite',
            misc: 'misc_sprite',
            chatIcons: 'chat_icons_sprite'
        },
        paths: new Map(),
        domRevision: 0,
        scannedRevision: -1,

        getUseHref(useElement) {
            return useElement?.getAttribute('href') || useElement?.getAttribute('xlink:href') || '';
        },

        markDomChanged() {
            this.domRevision += 1;
        },

        refresh() {
            this.scannedRevision = -1;
            this.scanPage();
        },

        scanPage() {
            if (this.scannedRevision === this.domRevision) return;
            this.scannedRevision = this.domRevision;
            const unresolved = new Set(Object.keys(this.markers));
            for (const useElement of document.querySelectorAll('svg use')) {
                const href = this.getUseHref(useElement);
                if (!href.includes('#')) continue;
                const spritePath = href.split('#')[0];
                for (const type of unresolved) {
                    if (!spritePath.includes(this.markers[type])) continue;
                    this.paths.set(type, spritePath);
                    unresolved.delete(type);
                    break;
                }
                if (!unresolved.size) break;
            }
        },

        get(spriteName) {
            const name = String(spriteName || '').replace(/_sprite$/, '');
            const type = name === 'chat_icons' ? 'chatIcons' : name;
            if (!this.markers[type]) return '';
            this.scanPage();
            return this.paths.get(type) || this.defaults[type] || '';
        }
    };

    const StyleService = {
        pending: new Map(),

        ensure(id, css) {
            const styleId = String(id || '').trim();
            if (!styleId) throw new TypeError('Style id is required');

            const existing = document.getElementById(styleId);
            if (existing) return existing;
            if (this.pending.has(styleId)) return this.pending.get(styleId);

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = String(css || '');
            this.pending.set(styleId, style);

            const mount = () => {
                if (!document.getElementById(styleId)) document.head?.appendChild(style);
                this.pending.delete(styleId);
            };
            if (document.head) mount();
            else document.addEventListener('DOMContentLoaded', mount, {once: true});
            return style;
        }
    };

    const DomObserverService = {
        subscribers: new Set(),
        observer: null,
        scheduled: false,
        waitingForBody: false,
        options: {childList: true, subtree: true},

        runCallbacks(callbacks) {
            if (!document.body || !callbacks.length) return;
            this.observer?.disconnect();
            try {
                callbacks.forEach(callback => {
                    try {
                        callback();
                    } catch (error) {
                        console.error('[MST] DOM observer callback failed:', error);
                    }
                });
            } finally {
                this.observe();
            }
        },

        observe() {
            if (!document.body || !this.subscribers.size) return;
            if (!this.observer) {
                this.observer = new MutationObserver(() => {
                    SpriteService.markDomChanged();
                    this.schedule();
                });
            }
            this.observer.observe(document.body, this.options);
        },

        schedule() {
            if (this.scheduled || !this.subscribers.size) return;
            this.scheduled = true;
            const requestFrame = window.requestAnimationFrame || (callback => setTimeout(callback, 0));
            requestFrame(() => {
                this.scheduled = false;
                this.runCallbacks([...this.subscribers]);
            });
        },

        handleBodyReady() {
            this.waitingForBody = false;
            this.runCallbacks([...this.subscribers]);
        },

        subscribe(callback) {
            if (typeof callback !== 'function') throw new TypeError('DOM observer callback must be a function');
            this.subscribers.add(callback);
            if (document.body) {
                this.runCallbacks([callback]);
            } else if (!this.waitingForBody) {
                this.waitingForBody = true;
                document.addEventListener('DOMContentLoaded', this.handleBodyReady.bind(this), {once: true});
            }
            let disconnected = false;
            return {
                disconnect: () => {
                    if (disconnected) return;
                    disconnected = true;
                    this.subscribers.delete(callback);
                    if (!this.subscribers.size) this.observer?.disconnect();
                }
            };
        }
    };

    // ==================== 公共工具 ====================
    const utils = {
        substrLastSlash(hrid) {
            return String(hrid || '').substring(String(hrid || '').lastIndexOf('/') + 1);
        },

        getSvgUseHref(useElement) {
            return SpriteService.getUseHref(useElement);
        },

        getSvgSpriteUrl(useSelector) {
            const href = this.getSvgUseHref(document.querySelector(useSelector));
            return href.includes('#') ? href.split('#')[0] : '';
        },

        getSpriteUrl(spriteName) {
            return SpriteService.get(spriteName);
        },

        clampLevel(value, min, max) {
            const num = parseInt(value, 10);
            if (Number.isNaN(num)) return min;
            return Math.min(max, Math.max(min, num));
        },

        getCollectionValues(collection) {
            if (Array.isArray(collection)) return collection;
            if (collection instanceof Map) return [...collection.values()];
            if (collection && typeof collection === 'object') return Object.values(collection);
            return [];
        },

        normalizeItemHrid(value) {
            const itemId = String(value || '').replace(/^#/, '').replace(/^\/items\//, '');
            return itemId ? '/items/' + itemId : '';
        },

        normalizeItemId(itemHrid) {
            return String(itemHrid || '').replace(/^\/items\//, '');
        },

        getItemName(itemHrid) {
            const itemId = this.normalizeItemId(itemHrid);
            const fallback = itemId.replace(/_/g, ' ');
            return DataHub.resolveItemName(itemHrid) || fallback;
        },

        getHouseName(hrid) {
            const room = DataHub.getHouseDetail(hrid);
            const langMap = {
                zh: DataHub.clientData.indexes.houseHridToNameZh,
                en: DataHub.clientData.indexes.houseHridToNameEn
            }[i18n.languageKey];
            return langMap?.get(hrid) || room?.name || hrid;
        },

        getReactProps(el) {
            const key = Reflect.ownKeys(el || {}).find(k => String(k).startsWith('__reactProps'));
            return key ? el[key] : null;
        },

        getReactComponentProps(el) {
            const props = this.getReactProps(el);
            return props?.children?.[0]?._owner?.memoizedProps || props?._owner?.memoizedProps || props || null;
        },

        getItemByHash(hash) {
            const parts = String(hash || '').split('::');
            if (parts.length !== 4) return null;
            return {itemHrid: parts[2], enhancementLevel: Number(parts[3]) || 0};
        },

        getTextBetween(start, end) {
            let text = '';
            let current = start?.nextSibling;
            while (current && current !== end) {
                if (current.nodeType === Node.TEXT_NODE) text += current.textContent || '';
                current = current.nextSibling;
            }
            return text;
        },

        async writeClipboard(text) {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(String(text), 'text');
                return;
            }
            if (!navigator.clipboard?.writeText) throw new Error(i18n.t('clipboardUnavailable'));
            await navigator.clipboard.writeText(String(text));
        },

        async readClipboard() {
            if (!navigator.clipboard?.readText) throw new Error(i18n.t('clipboardUnavailable'));
            return navigator.clipboard.readText();
        },

        formatMarketTime(timestamp) {
            if (!timestamp) return i18n.t('marketNoData');
            const date = new Date(timestamp * 1000);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            return y + '.' + m + '.' + d + ' ' + hh + ':' + mm;
        },

        formatLocalFileTime(date = new Date()) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const ss = String(date.getSeconds()).padStart(2, '0');
            return y + m + d + '-' + hh + mm + ss;
        },

        formatCompactNumber(value, maximumFractionDigits = 2) {
            const number = Number(value);
            if (!Number.isFinite(number)) return '-';
            const units = [
                {value: 1e12, suffix: 'T'},
                {value: 1e9, suffix: 'B'},
                {value: 1e6, suffix: 'M'},
                {value: 1e3, suffix: 'K'}
            ];
            const unit = units.find(entry => Math.abs(number) >= entry.value);
            const scaled = unit ? number / unit.value : number;
            const formatted = scaled.toLocaleString(undefined, {
                maximumFractionDigits,
                minimumFractionDigits: 0
            });
            return formatted + (unit?.suffix || '');
        },

        formatDateTime(value) {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString(i18n.locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        getGameButtonClass() {
            const button = document.querySelector('button[class*="Button_button"]');
            return [...(button?.classList || [])].find(className => className.startsWith('Button_button')) || 'Button_button__1Fe9z';
        },

        createLevelOptions(min, max, selected) {
            let html = '';
            for (let level = min; level <= max; level++) {
                html += '<option value="' + level + '"' + (level === selected ? ' selected' : '') + '>' + level + '</option>';
            }
            return html;
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        ensureButton({host, id, text, title = '', className = '', prepend = false, onClick}) {
            if (!host) return null;
            const existing = id ? document.getElementById(id) : null;
            if (existing) return existing;
            const button = document.createElement('button');
            if (id) button.id = id;
            if (className) button.className = className;
            button.type = 'button';
            button.textContent = text;
            if (title) button.title = title;
            if (typeof onClick === 'function') button.addEventListener('click', onClick);
            if (prepend) host.prepend(button);
            else host.appendChild(button);
            return button;
        },

        observeBody(callback) {
            return DomObserverService.subscribe(callback);
        }
    };

    const GameNavigationService = {
        getHost() {
            const host = DataHub.getGameObject();
            return host && typeof host === 'object' ? host : null;
        },

        switchCharacter() {
            const host = this.getHost();
            if (typeof host?.handleSwitchCharacter !== 'function') return false;
            host.handleSwitchCharacter.call(host);
            return true;
        },

        openMarketplace(itemHrid, enhancementLevel = 0) {
            const fullHrid = utils.normalizeItemHrid(itemHrid);
            if (!fullHrid) return false;
            const host = this.getHost();
            if (typeof host?.handleGoToMarketplace === 'function') {
                host.handleGoToMarketplace.call(host, fullHrid, Number(enhancementLevel) || 0);
                return true;
            }
            const marketMate = pageWindow.MWIMM;
            return marketMate?.ready === true && typeof marketMate.openMarketplace === 'function'
                ? marketMate.openMarketplace(fullHrid) === true
                : false;
        }
    };

    const MarketMateBridge = {
        callbacks: new Set(),
        timer: null,
        attempts: 0,

        getApi() {
            const api = pageWindow.MWIMM;
            return api && typeof api.addToCart === 'function' ? api : null;
        },

        isReady() {
            return this.getApi()?.ready === true;
        },

        addToCart(items) {
            const api = this.getApi();
            if (!api?.ready) return {ok: false, added: 0, skipped: Array.isArray(items) ? items.length : 1};
            return api.addToCart(items);
        },

        onReady(callback) {
            if (typeof callback !== 'function') return;
            if (this.isReady()) {
                callback(this.getApi());
                return;
            }
            this.callbacks.add(callback);
            if (this.timer) return;
            this.attempts = 0;
            this.timer = setInterval(() => {
                this.attempts++;
                if (this.isReady()) {
                    clearInterval(this.timer);
                    this.timer = null;
                    const api = this.getApi();
                    const callbacks = [...this.callbacks];
                    this.callbacks.clear();
                    callbacks.forEach(fn => fn(api));
                } else if (this.attempts >= 120) {
                    clearInterval(this.timer);
                    this.timer = null;
                    this.callbacks.clear();
                }
            }, 1000);
        }
    };

    // ==================== 市场数据服务 ====================
    class MarketDataService {
        constructor() {
            this.marketData = {};
            this.marketTimestamp = 0;
        }

        async load() {
            const mwiToolsData = this._readMWIToolsMarketData();
            if (mwiToolsData) {
                this._applyMarketData(mwiToolsData);
                return mwiToolsData;
            }

            const cached = this._readCache();
            if (cached) {
                this._applyMarketData(cached);
                return cached;
            }

            const data = await this._fetchMarketData();
            this._writeCache(data);
            this._applyMarketData(data);
            return data;
        }

        getPrice(itemHrid, level = 0) {
            if (itemHrid === '/items/coin') return 1;
            const row = this.marketData?.[itemHrid]?.[String(level)];
            if (!row) return 0;
            return Number(row.a ?? row.p ?? row.b ?? 0) || 0;
        }

        getMarketRow(itemHrid, level = 0) {
            return this.marketData?.[itemHrid]?.[String(level)] || null;
        }

        getUpdatedText() {
            return this.marketTimestamp ? utils.formatMarketTime(this.marketTimestamp) : i18n.t('marketNoData');
        }

        _readMWIToolsMarketData() {
            try {
                const raw = localStorage.getItem(STORAGE_KEYS.MWITOOLS_MARKET_CACHE);
                if (!raw) return null;
                const fetchTimestamp = localStorage.getItem(STORAGE_KEYS.MWITOOLS_MARKET_TIMESTAMP);
                if (!this._isFetchFresh(fetchTimestamp)) return null;
                const data = JSON.parse(raw);
                return data?.marketData ? data : null;
            } catch {
                return null;
            }
        }

        _readCache() {
            try {
                const raw = localStorage.getItem(STORAGE_KEYS.MARKET_CACHE);
                if (!raw) return null;
                const fetchTimestamp = localStorage.getItem(STORAGE_KEYS.MARKET_CACHE_TIMESTAMP);
                if (!this._isFetchFresh(fetchTimestamp)) return null;
                const data = JSON.parse(raw);
                if (!data?.marketData) return null;
                return data;
            } catch {
                return null;
            }
        }

        _getMarketTimestamp(data) {
            return Number(data?.timestamp || data?.t || 0) || 0;
        }

        _isFetchFresh(fetchTimestamp) {
            const timestamp = Number(fetchTimestamp || 0) || 0;
            if (!timestamp) return false;
            const age = Date.now() - timestamp;
            return age >= 0 && age <= CONFIG.MARKET_CACHE_TTL;
        }

        _writeCache(data) {
            try {
                localStorage.setItem(STORAGE_KEYS.MARKET_CACHE, JSON.stringify(data));
                localStorage.setItem(STORAGE_KEYS.MARKET_CACHE_TIMESTAMP, String(Date.now()));
            } catch (error) {
                console.warn('[HCCP] 保存市场缓存失败:', error);
            }
        }

        async _fetchMarketData() {
            const request =
                typeof GM_xmlhttpRequest === 'function'
                    ? GM_xmlhttpRequest
                    : typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
                      ? GM.xmlHttpRequest.bind(GM)
                      : null;

            if (!request) {
                const response = await fetch(CONFIG.MARKET_URL, {cache: 'no-store'});
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            }

            return new Promise((resolve, reject) => {
                const result = request({
                    method: 'GET',
                    url: CONFIG.MARKET_URL,
                    headers: {'Content-Type': 'application/json'},
                    onload: response => {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (error) {
                            reject(error);
                        }
                    },
                    onerror: reject
                });
                if (result?.then) {
                    result.then(response => resolve(JSON.parse(response.responseText))).catch(reject);
                }
            });
        }

        _applyMarketData(data) {
            this.marketData = data?.marketData || {};
            this.marketTimestamp = this._getMarketTimestamp(data);
        }
    }

    // ==================== 地下城收益计算 ====================
    class DungeonProfitCalculatorService {
        constructor(marketService) {
            this.marketService = marketService;
            this.valuationCache = null;
            this.recipeCache = null;
            this.specialPriceSources = Object.freeze({
                '/items/cowbell': {itemHrid: '/items/bag_of_10_cowbells', divisor: 10},
                '/items/chimerical_quiver': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/sinister_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/enchanted_cloak': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/gatherer_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/artificer_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/culinary_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1},
                '/items/chance_cape': {itemHrid: '/items/mirror_of_protection', divisor: 1}
            });
        }

        getDungeons() {
            return Object.values(DataHub.getClientDataMap('actionDetailMap'))
                .filter(action => action?.combatZoneInfo?.isDungeon && action?.combatZoneInfo?.dungeonInfo)
                .sort((left, right) => Number(left.sortIndex || 0) - Number(right.sortIndex || 0));
        }

        getCharacterCombatBuff(typeHrid) {
            const raw = DataHub.characterData.raw || {};
            const mapNames = [
                'mooPassActionTypeBuffsMap',
                'communityActionTypeBuffsMap',
                'houseActionTypeBuffsMap',
                'achievementActionTypeBuffsMap',
                'consumableActionTypeBuffsMap',
                'equipmentActionTypeBuffsMap',
                'guildActionTypeBuffsMap',
                'personalActionTypeBuffsMap'
            ];
            let flatBoost = 0;
            let ratioBoost = 0;
            mapNames.forEach(mapName => {
                const buffs = raw[mapName]?.['/action_types/combat'];
                if (!Array.isArray(buffs)) return;
                buffs.forEach(buff => {
                    if (buff?.typeHrid !== typeHrid) return;
                    flatBoost += Number(buff.flatBoost || 0);
                    ratioBoost += Number(buff.ratioBoost || 0);
                });
            });
            return Math.max(0, ratioBoost + flatBoost);
        }

        getCharacterDropQuantity() {
            return this.getCharacterCombatBuff('/buff_types/combat_drop_quantity');
        }

        getCharacterDropRate() {
            return this.getCharacterCombatBuff('/buff_types/combat_drop_rate');
        }

        getCharacterPartySize() {
            const slots = DataHub.characterData.raw?.partyInfo?.partySlotMap;
            const size = slots && typeof slots === 'object' ? Object.keys(slots).length : 0;
            return Math.max(1, Math.min(5, size || 1));
        }

        getExpectedCount(drop, difficultyTier = 0, combatDropRate = 0) {
            if (!drop) return 0;
            const tier = Math.max(0, Math.trunc(Number(difficultyTier) || 0));
            const scaledRate = Array.isArray(drop.dropRate)
                ? Number(drop.dropRate[tier] || 0)
                : (Number(drop.dropRate || 0) + Number(drop.dropRatePerDifficultyTier || 0) * tier) * (1 + 0.1 * tier);
            const dropRate = Math.max(0, Math.min(1, scaledRate * (1 + Math.max(0, Number(combatDropRate) || 0))));
            const averageCount = (Number(drop.minCount || 0) + Number(drop.maxCount || 0)) / 2;
            return dropRate * averageCount;
        }

        getDirectPrice(itemHrid, side, applyMarketTax = false) {
            if (itemHrid === '/items/coin') return 1;
            const special = this.specialPriceSources[itemHrid];
            const marketHrid = special?.itemHrid || itemHrid;
            const row = this.marketService.getMarketRow(marketHrid, 0);
            const rawValue = side === 'ask' ? row?.a ?? row?.p : row?.b ?? row?.p;
            let value = Math.max(0, Number(rawValue || 0));
            if (side === 'bid' && applyMarketTax && value > 0) {
                const taxRate = marketHrid === '/items/bag_of_10_cowbells' ? 0.18 : 0.02;
                value = Math.floor(value * (1 - taxRate));
            }
            return value / (special?.divisor || 1);
        }

        getProductionRecipe(itemHrid) {
            const clientData = DataHub.getClientData() || {};
            if (this.recipeCache?.clientData !== clientData) {
                const recipes = new Map();
                Object.values(clientData.actionDetailMap || {}).forEach(action => {
                    if (!Array.isArray(action?.inputItems) || !Array.isArray(action?.outputItems)) return;
                    action.outputItems.forEach(output => {
                        if (output?.itemHrid && Number(output.count) > 0 && !recipes.has(output.itemHrid)) {
                            recipes.set(output.itemHrid, {action, outputCount: Number(output.count)});
                        }
                    });
                });
                this.recipeCache = {clientData, recipes};
            }
            return this.recipeCache.recipes.get(itemHrid) || null;
        }

        getMaterialSettings(useArtisanTea, guzzlingLevel = 0) {
            if (!useArtisanTea) return {materialMultiplier: 1, artisan: 0, drinkConcentration: 0};
            const itemMap = DataHub.getClientDataMap('itemDetailMap');
            const artisanTea = itemMap?.['/items/artisan_tea'];
            const artisanBuff = artisanTea?.consumableDetail?.buffs?.find(buff => buff.typeHrid === '/buff_types/artisan');
            const guzzlingPouch = itemMap?.['/items/guzzling_pouch']?.equipmentDetail;
            const level = Math.max(0, Math.min(20, Math.trunc(Number(guzzlingLevel) || 0)));
            const baseConcentration = Number(guzzlingPouch?.noncombatStats?.drinkConcentration || 0);
            const concentrationPerLevel = Number(guzzlingPouch?.noncombatEnhancementBonuses?.drinkConcentration || 0);
            const drinkConcentration = baseConcentration + level * concentrationPerLevel;
            const artisan = Math.max(0, Math.min(1, Number(artisanBuff?.flatBoost || 0) * (1 + drinkConcentration)));
            return {materialMultiplier: 1 - artisan, artisan, drinkConcentration};
        }

        getCostPrice(itemHrid, side, costMode, materialMultiplier) {
            if (costMode !== 'materials') return this.getDirectPrice(itemHrid, side);
            const recipe = this.getProductionRecipe(itemHrid);
            if (!recipe) return 0;
            return recipe.action.inputItems.reduce((sum, input) => {
                const countPerItem = Number(input.count || 0) / recipe.outputCount;
                return sum + countPerItem * materialMultiplier * this.getDirectPrice(input.itemHrid, side);
            }, 0);
        }

        collectMissingCostPrices(itemHrid, costMode, missing) {
            if (costMode !== 'materials') {
                if (!this.getDirectPrice(itemHrid, 'ask') && !this.getDirectPrice(itemHrid, 'bid')) missing.add(itemHrid);
                return;
            }
            const recipe = this.getProductionRecipe(itemHrid);
            if (!recipe) {
                missing.add(itemHrid);
                return;
            }
            recipe.action.inputItems.forEach(input => {
                if (input.itemHrid === '/items/coin') return;
                if (!this.getDirectPrice(input.itemHrid, 'ask') && !this.getDirectPrice(input.itemHrid, 'bid')) {
                    missing.add(input.itemHrid);
                }
            });
        }

        getChestValuations(applyMarketTax = true) {
            const clientData = DataHub.getClientData() || {};
            const marketData = this.marketService.marketData;
            if (this.valuationCache?.clientData === clientData
                && this.valuationCache?.marketData === marketData
                && this.valuationCache?.applyMarketTax === applyMarketTax) {
                return this.valuationCache;
            }

            const lootMap = clientData.openableLootDropMap || {};
            const itemMap = clientData.itemDetailMap || {};
            const grossAsk = new Map();
            const grossBid = new Map();
            const nestedAsk = new Map();
            const nestedBid = new Map();
            const tokenValues = new Map();
            const getValue = (itemHrid, side) => {
                const nestedMap = side === 'ask' ? nestedAsk : nestedBid;
                if (nestedMap.has(itemHrid)) return nestedMap.get(itemHrid);
                if (tokenValues.has(itemHrid)) return tokenValues.get(itemHrid);
                return this.getDirectPrice(itemHrid, side, applyMarketTax);
            };

            for (let iteration = 0; iteration < 20; iteration++) {
                Object.values(clientData.shopItemDetailMap || {}).forEach(shopItem => {
                    const costs = Array.isArray(shopItem?.costs) ? shopItem.costs : [];
                    if (!costs.length) return;
                    const outputBid = getValue(shopItem.itemHrid, 'bid');
                    costs.forEach(cost => {
                        if (!cost?.itemHrid || cost.itemHrid === '/items/coin' || Number(cost.count) <= 0) return;
                        const value = outputBid / (costs.length * Number(cost.count));
                        if (value > Number(tokenValues.get(cost.itemHrid) || 0)) tokenValues.set(cost.itemHrid, value);
                    });
                });

                Object.entries(lootMap).forEach(([chestHrid, drops]) => {
                    let askValue = 0;
                    let bidValue = 0;
                    (drops || []).forEach(drop => {
                        const count = this.getExpectedCount(drop);
                        askValue += count * getValue(drop.itemHrid, 'ask');
                        bidValue += count * getValue(drop.itemHrid, 'bid');
                    });
                    grossAsk.set(chestHrid, askValue);
                    grossBid.set(chestHrid, bidValue);

                    const keyHrid = itemMap[chestHrid]?.openKeyItemHrid;
                    nestedAsk.set(chestHrid, Math.max(0, askValue - (keyHrid ? this.getDirectPrice(keyHrid, 'bid') : 0)));
                    nestedBid.set(chestHrid, Math.max(0, bidValue - (keyHrid ? this.getDirectPrice(keyHrid, 'ask') : 0)));
                });
            }

            this.valuationCache = {clientData, marketData, applyMarketTax, grossAsk, grossBid, tokenValues};
            return this.valuationCache;
        }

        collectMissingPrices(itemHrid, valuations, missing, visited = new Set()) {
            if (!itemHrid || itemHrid === '/items/coin' || visited.has(itemHrid)) return;
            const clientData = DataHub.getClientData() || {};
            const drops = clientData.openableLootDropMap?.[itemHrid];
            if (Array.isArray(drops)) {
                visited.add(itemHrid);
                drops.forEach(drop => {
                    if (this.getExpectedCount(drop) > 0) this.collectMissingPrices(drop.itemHrid, valuations, missing, visited);
                });
                visited.delete(itemHrid);
                return;
            }
            const hasTokenValue = Number(valuations.tokenValues.get(itemHrid) || 0) > 0;
            if (!hasTokenValue && !this.getDirectPrice(itemHrid, 'ask') && !this.getDirectPrice(itemHrid, 'bid')) {
                missing.add(itemHrid);
            }
        }

        calculate({
            actionHrid,
            difficultyTier = 0,
            clearMinutes,
            dailyHours,
            periodDays = 1,
            partySize = 5,
            dropQuantity = 0,
            dropRate = 0,
            ticketMode = 'shares',
            costMode = 'materials',
            useArtisanTea = false,
            guzzlingLevel = 0,
            applyMarketTax = true
        }) {
            const action = DataHub.getClientDataMap('actionDetailMap')?.[actionHrid];
            const dungeonInfo = action?.combatZoneInfo?.dungeonInfo;
            const minutes = Number(clearMinutes);
            const hours = Number(dailyHours);
            const days = Number(periodDays);
            if (!dungeonInfo || !(minutes > 0) || !(hours > 0) || !(days > 0)) return null;

            const tier = Math.max(0, Math.min(2, Math.trunc(Number(difficultyTier) || 0)));
            const activePartySize = Math.max(1, Math.min(5, Math.trunc(Number(partySize) || 1)));
            const quantityMultiplier = (1 + Math.max(0, Number(dropQuantity) || 0)) * 5 / activePartySize;
            const clears = hours * 60 / minutes;
            const rewards = (dungeonInfo.rewardDropTable || []).map(drop => {
                const basePerClear = this.getExpectedCount(drop, tier, dropRate);
                return {
                    ...drop,
                    basePerClear,
                    dailyQuantity: clears * basePerClear * quantityMultiplier,
                    isRefinement: String(drop.itemHrid || '').includes('_refinement_chest')
                };
            });
            const normalRewards = rewards.filter(reward => !reward.isRefinement);
            const refinementRewards = rewards.filter(reward => reward.isRefinement);
            const normalQuantity = normalRewards.reduce((sum, reward) => sum + reward.dailyQuantity, 0);
            const refinementQuantity = refinementRewards.reduce((sum, reward) => sum + reward.dailyQuantity, 0);
            const totalChestQuantity = normalQuantity + refinementQuantity;
            const ticketQuantity = ticketMode === 'shares' ? totalChestQuantity : clears;
            const ticketHrid = dungeonInfo.keyItemHrid;
            const materialSettings = this.getMaterialSettings(useArtisanTea, guzzlingLevel);
            const ticketPrices = {
                ask: this.getCostPrice(ticketHrid, 'ask', costMode, materialSettings.materialMultiplier),
                bid: this.getCostPrice(ticketHrid, 'bid', costMode, materialSettings.materialMultiplier)
            };
            const valuations = this.getChestValuations(applyMarketTax);
            const missingPrices = new Set();
            this.collectMissingCostPrices(ticketHrid, costMode, missingPrices);

            let openingCostConservative = 0;
            let openingCostOptimistic = 0;
            let normalRevenueConservative = 0;
            let normalRevenueOptimistic = 0;
            let refinementRevenueConservative = 0;
            let refinementRevenueOptimistic = 0;
            const openingKeys = new Map();

            rewards.forEach(reward => {
                const itemDetail = DataHub.getClientDataMap('itemDetailMap')?.[reward.itemHrid] || {};
                const keyHrid = itemDetail.openKeyItemHrid;
                const keyAsk = keyHrid ? this.getCostPrice(keyHrid, 'ask', costMode, materialSettings.materialMultiplier) : 0;
                const keyBid = keyHrid ? this.getCostPrice(keyHrid, 'bid', costMode, materialSettings.materialMultiplier) : 0;
                if (keyHrid) {
                    const entry = openingKeys.get(keyHrid) || {itemHrid: keyHrid, quantity: 0, ask: keyAsk, bid: keyBid};
                    entry.quantity += reward.dailyQuantity;
                    openingKeys.set(keyHrid, entry);
                    this.collectMissingCostPrices(keyHrid, costMode, missingPrices);
                }
                openingCostConservative += reward.dailyQuantity * keyAsk;
                openingCostOptimistic += reward.dailyQuantity * keyBid;
                const conservativeRevenue = reward.dailyQuantity * Number(valuations.grossBid.get(reward.itemHrid) || 0);
                const optimisticRevenue = reward.dailyQuantity * Number(valuations.grossAsk.get(reward.itemHrid) || 0);
                if (reward.isRefinement) {
                    refinementRevenueConservative += conservativeRevenue;
                    refinementRevenueOptimistic += optimisticRevenue;
                } else {
                    normalRevenueConservative += conservativeRevenue;
                    normalRevenueOptimistic += optimisticRevenue;
                }
                this.collectMissingPrices(reward.itemHrid, valuations, missingPrices);
            });

            const ticketCostConservative = ticketQuantity * ticketPrices.ask;
            const ticketCostOptimistic = ticketQuantity * ticketPrices.bid;
            const totalRevenueConservative = normalRevenueConservative + refinementRevenueConservative;
            const totalRevenueOptimistic = normalRevenueOptimistic + refinementRevenueOptimistic;
            const profitConservative = totalRevenueConservative - ticketCostConservative - openingCostConservative;
            const profitOptimistic = totalRevenueOptimistic - ticketCostOptimistic - openingCostOptimistic;

            return {
                action,
                difficultyTier: tier,
                periodDays: days,
                partySize: activePartySize,
                quantityMultiplier,
                clears,
                ticketHrid,
                ticketQuantity,
                ticketPrices,
                ticketCostConservative,
                ticketCostOptimistic,
                normalQuantity,
                refinementQuantity,
                totalChestQuantity,
                openingKeys: [...openingKeys.values()],
                openingCostConservative,
                openingCostOptimistic,
                normalRevenueConservative,
                normalRevenueOptimistic,
                refinementRevenueConservative,
                refinementRevenueOptimistic,
                totalRevenueConservative,
                totalRevenueOptimistic,
                profitConservative,
                profitOptimistic,
                periodProfitConservative: profitConservative * days,
                periodProfitOptimistic: profitOptimistic * days,
                profitPerChestConservative: totalChestQuantity > 0 ? profitConservative / totalChestQuantity : 0,
                profitPerChestOptimistic: totalChestQuantity > 0 ? profitOptimistic / totalChestQuantity : 0,
                profitPerClearConservative: clears > 0 ? profitConservative / clears : 0,
                profitPerClearOptimistic: clears > 0 ? profitOptimistic / clears : 0,
                costMode,
                applyMarketTax,
                ...materialSettings,
                missingPrices: [...missingPrices]
            };
        }
    }

    // 算法移植自 github/mwitools/mwitools.script.source.js：
    // getBuildScoreByProfile（原文件第 3045 行起）与强化策略模拟（第 5041 行起）。
    // MWITools 注明的原始 BuildScore 算法作者为 Ratatatata。
    class BuildScoreService {
        constructor(marketService) {
            this.marketService = marketService;
            this.marketPromise = null;
            this.scoreCache = new WeakMap();
            // 仅缓存与装备 HRID、市场价格无关的强化期望值，供相同强化参数的装备共用。
            this.enhancementExpectationCache = new Map();
            this.enhancementSuccessRates = Object.freeze([
                50, 45, 45, 40, 40, 40, 35, 35, 35, 35,
                30, 30, 30, 30, 30, 30, 30, 30, 30, 30
            ]);
            this.phiMirrorFibonacci = Object.freeze([
                0, 1, 1, 2, 3, 5, 8, 13, 21, 34,
                55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181
            ]);
            this.inputDefaults = {
                enhancingLevel: 125,
                laboratoryLevel: 6,
                enhancerBonus: 5.42,
                gloveBonus: 12.9,
                teaEnhancing: false,
                teaSuperEnhancing: false,
                teaUltraEnhancing: true,
                teaBlessed: true,
                priceAskBidRatio: 1
            };
        }

        calculate(cardData) {
            if (!cardData || typeof cardData !== 'object') return Promise.reject(new Error(i18n.t('invalidCharacterCardData')));
            const cached = this.scoreCache.get(cardData);
            if (cached) return cached;
            const promise = this._calculate(cardData);
            this.scoreCache.set(cardData, promise);
            return promise;
        }

        async _calculate(cardData) {
            DataHub.initClientDataFromCache();
            const clientData = DataHub.clientData.raw;
            if (!clientData?.itemDetailMap || !clientData?.houseRoomDetailMap || !clientData?.levelExperienceTable) {
                throw new Error(i18n.t('clientDataUnavailable'));
            }
            if (!this.marketPromise) {
                this.marketPromise = this.marketService.load().catch(error => {
                    this.marketPromise = null;
                    throw error;
                });
            }
            await this.marketPromise;

            const houseScore = this._calculateHouseScore(cardData, clientData);
            const equipmentHidden = cardData.hideWearableItems || cardData.dataAvailability?.equipment === false;
            if (equipmentHidden) {
                return {total: houseScore, house: houseScore, ability: 0, equipment: 0, equipmentHidden: true};
            }
            const abilityScore = this._calculateAbilityScore(cardData, clientData);
            const equipmentScore = await this._calculateEquipmentScore(cardData, clientData);
            return {
                total: houseScore + abilityScore + equipmentScore,
                house: houseScore,
                ability: abilityScore,
                equipment: equipmentScore,
                equipmentHidden: false
            };
        }

        _calculateHouseScore(cardData, clientData) {
            const battleHouseIds = new Set([
                'dining_room', 'library', 'dojo', 'gym', 'armory', 'archery_range', 'mystical_study'
            ]);
            let cost = 0;
            Object.entries(cardData.characterHouseRoomMap || cardData.houseRooms || {}).forEach(([key, room]) => {
                const houseRoomHrid = room?.houseRoomHrid || (key.startsWith('/house_rooms/') ? key : '');
                const houseId = houseRoomHrid.split('/').pop();
                if (!battleHouseIds.has(houseId)) return;
                const level = Number(typeof room === 'object' ? room?.level : room) || 0;
                const upgradeCostsMap = clientData.houseRoomDetailMap[houseRoomHrid]?.upgradeCostsMap || {};
                for (let currentLevel = 1; currentLevel <= level; currentLevel++) {
                    (upgradeCostsMap[currentLevel] || []).forEach(item => {
                        cost += Number(item.count || 0) * this._getWeightedMarketPrice(item.itemHrid);
                    });
                }
            });
            return cost / 1_000_000;
        }

        _calculateAbilityScore(cardData, clientData) {
            const basicAbilityIds = ['poke', 'scratch', 'smack', 'quick_shot', 'water_strike', 'fireball', 'entangle', 'minor_heal'];
            const allAbilities = cardData.abilities || [];
            const equippedAbilities = allAbilities.filter(ability => Number(ability.slotNumber) > 0);
            const abilities = equippedAbilities.length ? equippedAbilities : allAbilities;
            let cost = 0;
            abilities.forEach(ability => {
                const targetLevel = Number(ability.level || 0);
                const experience = Number(clientData.levelExperienceTable[targetLevel] || 0);
                const experiencePerBook = basicAbilityIds.some(id => ability.abilityHrid?.includes(id)) ? 50 : 500;
                const bookCount = Number((experience / experiencePerBook + 1).toFixed(1));
                const itemHrid = String(ability.abilityHrid || '').replace('/abilities/', '/items/');
                cost += bookCount * this._getWeightedMarketPrice(itemHrid);
            });
            return cost / 1_000_000;
        }

        _calculateEquipmentScore(cardData, clientData) {
            const equipment = cardData.player?.equipment || cardData.player?.characterItems || [];
            let networthAsk = 0;
            let networthBid = 0;
            for (const item of equipment) {
                const count = Number(item.count || 1);
                const enhancementLevel = Number(item.enhancementLevel || 0);
                if (enhancementLevel > 1) {
                    const best = this._findBestEnhanceStrategyWithPhiMirror(item.itemHrid, enhancementLevel, clientData);
                    const totalCost = best?.totalCost ? Math.round(best.totalCost) : 0;
                    networthAsk += count * Math.max(totalCost, 0);
                    networthBid += count * Math.max(totalCost, 0);
                    continue;
                }
                const marketRow = this.marketService.getMarketRow(item.itemHrid, 0);
                if (!marketRow) continue;
                networthAsk += count * (Number(marketRow.a) > 0 ? Number(marketRow.a) : 0);
                networthBid += count * (Number(marketRow.b) > 0 ? Number(marketRow.b) : 0);
            }
            return (networthAsk * 0.5 + networthBid * 0.5) / 1_000_000;
        }

        _getWeightedMarketPrice(itemHrid, ratio = 0.5) {
            if (itemHrid === '/items/coin') return 1;
            const row = this.marketService.getMarketRow(itemHrid, 0);
            if (!row) return 0;
            let ask = Number(row.a);
            let bid = Number(row.b);
            if (ask > 0 && bid < 0) bid = ask;
            if (bid > 0 && ask < 0) ask = bid;
            if (!Number.isFinite(ask) || !Number.isFinite(bid)) return 0;
            return ask * ratio + bid * (1 - ratio);
        }

        _getItemMarketPrice(itemHrid, ratio = this.inputDefaults.priceAskBidRatio) {
            if (itemHrid === '/items/coin') return 1;
            const row = this.marketService.getMarketRow(itemHrid, 0);
            if (!row || (Number(row.a) < 0 && Number(row.b) < 0)) return 0;
            const ask = Number(row.a);
            const bid = Number(row.b);
            if (ask > 0 && bid < 0) return ask;
            if (bid > 0 && ask < 0) return bid;
            return ask * ratio + bid * (1 - ratio);
        }

        _findBestEnhanceStrategyWithPhiMirror(itemHrid, enhancementLevel, clientData) {
            const itemCosts = this._getEnhancementCosts(itemHrid, clientData);
            let best = this._findBestEnhanceStrategy(itemHrid, enhancementLevel, clientData, itemCosts);
            const mirrorCost = this._getItemMarketPrice('/items/philosophers_mirror');
            if (!best || mirrorCost <= 0 || enhancementLevel <= 3) return best;

            const refinedHrid = itemHrid;
            const isRefined = itemHrid.includes('_refined');
            const baseItemHrid = isRefined ? itemHrid.replace('_refined', '') : itemHrid;
            const baseItemCosts = isRefined ? this._getEnhancementCosts(baseItemHrid, clientData) : itemCosts;
            const lowerBest = {};
            for (let level = 9; level < enhancementLevel; level++) {
                lowerBest[level] = this._findBestEnhanceStrategy(baseItemHrid, level, clientData, baseItemCosts);
            }

            let refinedCost = 0;
            if (isRefined) {
                const itemName = clientData.itemDetailMap[refinedHrid]?.name;
                const actionHrid = this._getActionHridFromItemName(itemName, clientData.actionDetailMap);
                (clientData.actionDetailMap?.[actionHrid]?.inputItems || []).forEach(item => {
                    refinedCost += this._getItemMarketPrice(item.itemHrid) * Number(item.count || 0);
                });
            }

            for (let protectAt = 10; protectAt < enhancementLevel; protectAt++) {
                if (!lowerBest[protectAt] || !lowerBest[protectAt - 1]) continue;
                const baseCount = this.phiMirrorFibonacci[enhancementLevel - protectAt + 1];
                const inputCount = this.phiMirrorFibonacci[enhancementLevel - protectAt];
                if (baseCount == null || inputCount == null) continue;
                const protectCount = baseCount + inputCount - 1;
                const totalCost = baseCount * lowerBest[protectAt].totalCost +
                    inputCount * lowerBest[protectAt - 1].totalCost + mirrorCost * protectCount + refinedCost;
                if (totalCost < best.totalCost) best = {totalCost};
            }
            return best;
        }

        _findBestEnhanceStrategy(itemHrid, enhancementLevel, clientData, costs = null) {
            const enhancementCosts = costs || this._getEnhancementCosts(itemHrid, clientData);
            let best = null;
            for (let protectAt = 2; protectAt <= enhancementLevel; protectAt++) {
                const simulation = this._calculateEnhancementExpectation(itemHrid, enhancementLevel, protectAt, clientData);
                const totalCost = enhancementCosts.baseCost + enhancementCosts.protectionCost * simulation.protectCount +
                    enhancementCosts.perActionCost * simulation.actions;
                if (!best || totalCost < best.totalCost) best = {totalCost};
            }
            return best;
        }

        _calculateEnhancementExpectation(itemHrid, enhancementLevel, protectAt, clientData) {
            const itemLevel = Number(clientData.itemDetailMap[itemHrid]?.itemLevel || 0);
            const defaults = this.inputDefaults;
            const effectiveLevel = defaults.enhancingLevel + (defaults.teaEnhancing ? 3 : 0) +
                (defaults.teaSuperEnhancing ? 6 : 0) + (defaults.teaUltraEnhancing ? 8 : 0);
            const totalBonus = effectiveLevel >= itemLevel
                ? 1 + (0.05 * (effectiveLevel + defaults.laboratoryLevel - itemLevel) + defaults.enhancerBonus) / 100
                : 1 - 0.5 * (1 - effectiveLevel / itemLevel) +
                    (0.05 * defaults.laboratoryLevel + defaults.enhancerBonus) / 100;
            const cacheKey = [enhancementLevel, protectAt, totalBonus, defaults.teaBlessed ? 1 : 0].join('::');
            const cached = this.enhancementExpectationCache.get(cacheKey);
            if (cached) return cached;
            const transient = Array.from({length: enhancementLevel}, () => Array(enhancementLevel).fill(0));
            for (let level = 0; level < enhancementLevel; level++) {
                const successChance = (this.enhancementSuccessRates[level] / 100) * totalBonus;
                const failureDestination = level >= protectAt ? level - 1 : 0;
                if (defaults.teaBlessed) {
                    if (level + 2 < enhancementLevel) transient[level][level + 2] += successChance * 0.01;
                    if (level + 1 < enhancementLevel) transient[level][level + 1] += successChance * 0.99;
                } else if (level + 1 < enhancementLevel) {
                    transient[level][level + 1] += successChance;
                }
                transient[level][failureDestination] += 1 - successChance;
            }
            const fundamental = this._invertMatrix(transient.map((row, rowIndex) =>
                row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : 0) - value)
            ));
            const visits = fundamental[0];
            const actions = visits.reduce((sum, value) => sum + value, 0);
            let protectCount = 0;
            for (let level = protectAt; level < enhancementLevel; level++) {
                protectCount += visits[level] * transient[level][level - 1];
            }
            const result = {actions, protectCount};
            this.enhancementExpectationCache.set(cacheKey, result);
            return result;
        }

        // 保留旧版 Gauss-Jordan 运算顺序，使用连续数值数组减少完整逆矩阵计算中的对象分配。
        _invertMatrix(matrix) {
            const size = matrix.length;
            const width = size * 2;
            const augmented = matrix.map((row, rowIndex) => {
                const nextRow = new Float64Array(width);
                for (let column = 0; column < size; column++) nextRow[column] = row[column];
                nextRow[size + rowIndex] = 1;
                return nextRow;
            });
            for (let column = 0; column < size; column++) {
                let pivotRow = column;
                for (let row = column + 1; row < size; row++) {
                    if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
                }
                if (Math.abs(augmented[pivotRow][column]) < 1e-12) throw new Error('Enhancement matrix is singular');
                [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
                const pivot = augmented[column][column];
                for (let index = 0; index < width; index++) augmented[column][index] /= pivot;
                for (let row = 0; row < size; row++) {
                    if (row === column) continue;
                    const factor = augmented[row][column];
                    if (!factor) continue;
                    for (let index = 0; index < width; index++) {
                        augmented[row][index] -= factor * augmented[column][index];
                    }
                }
            }
            return augmented.map(row => row.slice(size));
        }

        _getEnhancementCosts(itemHrid, clientData) {
            const itemDetail = clientData.itemDetailMap[itemHrid];
            const baseCost = this._getRealisticBaseItemPrice(itemHrid, clientData);
            const protectionHrids = itemDetail?.protectionItemHrids == null
                ? [itemHrid, '/items/mirror_of_protection']
                : [itemHrid, '/items/mirror_of_protection', ...itemDetail.protectionItemHrids];
            let protectionCost = null;
            protectionHrids.forEach((protectionHrid, index) => {
                const cost = this._getRealisticBaseItemPrice(protectionHrid, clientData);
                if (index === 0 || (cost > 0 && (protectionCost < 0 || cost < protectionCost))) protectionCost = cost;
            });
            let perActionCost = 0;
            (itemDetail?.enhancementCosts || []).forEach(item => {
                const price = item.itemHrid.startsWith('/items/trainee_')
                    ? 250000
                    : this._getItemMarketPrice(item.itemHrid);
                perActionCost += price * Number(item.count || 0);
            });
            return {baseCost, protectionCost: Number(protectionCost || 0), perActionCost};
        }

        _getRealisticBaseItemPrice(itemHrid, clientData) {
            const itemDetail = clientData.itemDetailMap[itemHrid];
            const productionCost = this._getBaseItemProductionCost(itemDetail?.name, clientData);
            const row = this.marketService.getMarketRow(itemHrid, 0);
            const ask = Number(row?.a);
            const bid = Number(row?.b);
            if (ask > 0) {
                if (bid > 0) return ask / bid > 1.3 ? Math.max(bid, productionCost) : ask;
                return ask / productionCost > 1.3 ? productionCost : Math.max(ask, productionCost);
            }
            return bid > 0 ? Math.max(bid, productionCost) : productionCost;
        }

        _getBaseItemProductionCost(itemName, clientData) {
            const actionHrid = this._getActionHridFromItemName(itemName, clientData.actionDetailMap);
            const action = clientData.actionDetailMap?.[actionHrid];
            if (!action) return -1;
            let cost = (action.inputItems || []).reduce((sum, item) =>
                sum + this._getItemMarketPrice(item.itemHrid) * Number(item.count || 0), 0
            );
            cost *= 0.9;
            if (action.upgradeItemHrid) cost += this._getItemMarketPrice(action.upgradeItemHrid);
            return cost;
        }

        _getActionHridFromItemName(itemName, actionDetailMap) {
            if (!itemName) return null;
            const actionName = itemName
                .replace('Milk', 'Cow')
                .replace('Log', 'Tree')
                .replace('Cowing', 'Milking')
                .replace('Rainbow Cow', 'Unicow')
                .replace("Collector's Boots", 'Collectors Boots')
                .replace("Knight's Aegis", 'Knights Aegis');
            const indexedHrid = DataHub.clientData.indexes.actionNameToHrid?.get(actionName);
            if (indexedHrid) return indexedHrid;
            return Object.values(actionDetailMap || {}).find(action => action?.name === actionName)?.hrid || null;
        }
    }

    // ==================== 房屋升级业务 ====================
    class HouseCalculator {
        constructor(houseDetailMap) {
            this.houseDetails = houseDetailMap;
        }

        calculateUpgradeMaterials(roomHrid, fromLevel, toLevel) {
            const requiredMaterials = {};

            if (!(roomHrid in this.houseDetails)) {
                throw new Error(i18n.t('houseNotFound', roomHrid));
            }
            if (fromLevel >= toLevel) {
                throw new Error(i18n.t('invalidLevel'));
            }

            const roomInfo = this.houseDetails[roomHrid];
            for (let level = fromLevel + 1; level <= toLevel; level++) {
                const levelStr = String(level);
                if (!(levelStr in roomInfo.upgradeCostsMap)) {
                    throw new Error(i18n.t('upgradeNotFound', roomHrid, level));
                }

                for (const material of roomInfo.upgradeCostsMap[levelStr]) {
                    requiredMaterials[material.itemHrid] = (requiredMaterials[material.itemHrid] || 0) + material.count;
                }
            }

            return requiredMaterials;
        }
    }

    // ==================== 计算器 UI ====================
    class HouseCalculatorUI {
        constructor(houseDetailMap, calculator, marketDataService) {
            this.houseDetails = houseDetailMap;
            this.calculator = calculator;
            this.marketDataService = marketDataService;
            this.currentRoomLevels = {};
            this.roomIcons = {};
            this.lastResult = null;
            this.autoCalculateTimer = null;
        }

        create() {
            this.clearPendingCalculate();
            this.lastResult = null;
            const old = document.getElementById('mst-hccp-house-calculator');
            if (old) {
                if (typeof Swal !== 'undefined' && Swal.getPopup?.()?.contains(old)) Swal.close();
                else old.remove();
            }

            const roomState = this.getRoomLevelsFromUI();
            this.currentRoomLevels = roomState.roomLevels;
            this.roomIcons = roomState.roomIcons;
            this.injectStyles();

            return Notifier.html({
                title: i18n.t('title'),
                html: () => TemplateRenderer.html`<div id="mst-hccp-house-calculator"></div>`,
                width: '27rem',
                popupClass: 'mst-house-calculator-dialog',
                didOpen: popup => {
                    const container = popup.querySelector('#mst-hccp-house-calculator');
                    if (!container) return;
                    TemplateRenderer.renderHtml(() => this.render(), container);
                    this.bindEvents(container);
                    MarketMateBridge.onReady(() => this.ensureMarketMateButton(container));
                },
                willClose: () => this.clearPendingCalculate()
            });
        }

        injectStyles() {
            StyleService.ensure('mst-hccp-style', `
                #mst-hccp-house-calculator{--hccp-panel-height:min(37.5rem,calc(100svh - 7rem));position:static;width:100%;height:var(--hccp-panel-height);max-height:calc(100svh - 7rem);box-sizing:border-box;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,0.875rem);
                    color:var(--color-text-dark-mode,#fff);display:flex;flex-direction:column;overflow:hidden;resize:none;color-scheme:dark;}
                .mst-hccp-calculator-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding-top:var(--spacing-xs,0.25rem);padding-right:var(--spacing-xs,0.25rem);display:flex;flex-direction:column;scrollbar-color:var(--color-space-300,#98a7e9) transparent;scrollbar-width:thin;}
                .mst-hccp-calculator-body::-webkit-scrollbar{width:var(--scrollbar-width,0.25rem);}
                .mst-hccp-calculator-body::-webkit-scrollbar-thumb{background:var(--color-space-300,#98a7e9);border-radius:var(--scrollbar-border-radius,0.25rem);}
                .mst-hccp-calculator-toolbar{display:flex;align-items:center;justify-content:flex-start;gap:var(--spacing-xs,0.25rem);margin-bottom:var(--spacing-xs,0.25rem);flex:0 0 auto;}
                .mst-hccp-select-groups{display:inline-flex;align-items:center;justify-content:flex-start;gap:var(--spacing-xs,0.25rem);flex:0 0 auto;}
                .mst-hccp-toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:var(--spacing-xs,0.25rem);margin-left:auto;min-width:0;}
                .mst-hccp-select-all-label{display:inline-flex;align-items:center;gap:var(--spacing-xs,0.25rem);flex:0 0 auto;cursor:pointer;user-select:none;font-size:var(--font-size-base,0.875rem);color:var(--color-space-200,#bbc5f1);white-space:nowrap;line-height:var(--line-height-tight,1.2);}
                .mst-hccp-select-all-label input{margin:0;transform:scale(1.05);accent-color:var(--color-space-500,#546ddb);vertical-align:middle;}
                #mst-hccp-refresh-levels,#mst-hccp-export-csv,#mst-hccp-add-to-cart{height:var(--button-height-small,1.5rem);padding:0 var(--button-padding-x-small,0.375rem);background:var(--color-space-600,#4357af);color:var(--color-text-dark-mode,#fff);border:none;
                    border-radius:var(--radius-sm,0.25rem);cursor:pointer;transition:background 0.2s;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-sm,0.8125rem);font-weight:var(--font-weight-semibold,600);line-height:1;}
                #mst-hccp-refresh-levels:hover,#mst-hccp-export-csv:hover,#mst-hccp-add-to-cart:hover{background:var(--color-space-500,#546ddb);}
                .mst-hccp-batch-level{display:inline-flex;align-items:center;flex:0 0 auto;width:6.75rem;}
                #mst-hccp-batch-from-level option,#mst-hccp-batch-to-level option,.mst-hccp-level-input option{text-align:center;}
                #mst-hccp-refresh-levels{flex:0 0 auto;padding:0 var(--button-padding-x-normal,0.625rem);white-space:nowrap;}
                #mst-hccp-rooms-container{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-content:start;justify-content:center;gap:var(--spacing-xs,0.25rem);margin-bottom:var(--spacing-xs,0.25rem);overflow:visible;flex:0 0 auto;}
                .mst-hccp-room-checkbox{display:block;min-width:0;margin:0;min-height:auto;padding:var(--spacing-xs,0.25rem);background:var(--color-midnight-500,#2c2e45);border:1px solid transparent;border-radius:var(--radius-sm,0.25rem);transition:all 0.2s ease;opacity:0.95;box-sizing:border-box;}
                .mst-hccp-room-checkbox:hover{background:var(--color-midnight-300,#393a5b);opacity:1;}
                .mst-hccp-room-checkbox.mst-hccp-room-selected{background:var(--color-space-800,#273366);border-color:var(--color-space-300,#98a7e9);opacity:1;}
                .mst-hccp-room-row{display:flex;flex-direction:column;gap:var(--spacing-xxs,0.125rem);height:auto;justify-content:flex-start;}
                .mst-hccp-room-left{min-width:0;display:flex;align-items:center;gap:var(--spacing-xs,0.25rem);cursor:pointer;width:100%;padding:var(--spacing-xxs,0.125rem) 0;line-height:1;}
                .mst-hccp-room-left input{margin:0;transform:scale(1.05);accent-color:var(--color-space-500,#546ddb);flex:0 0 auto;vertical-align:middle;}
                .mst-hccp-room-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-size-sm,0.8125rem);color:var(--color-space-100,#dce2fa);font-weight:var(--font-weight-medium,500);line-height:1em;}
                .mst-hccp-room-icon{width:1em;height:1em;line-height:1;flex:0 0 1em;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;}
                .mst-hccp-room-icon svg{width:1em;height:1em;display:block;}
                .mst-hccp-room-levels{display:inline-flex;align-items:center;justify-content:center;gap:0;width:100%;}
                .mst-hccp-level-arrow{height:var(--input-height-small,1.5rem);min-width:1.5rem;padding:0 var(--spacing-xs,0.25rem);border-top:1px solid var(--color-midnight-100,#454771);border-bottom:1px solid var(--color-midnight-100,#454771);background:var(--color-midnight-700,#20212f);
                    color:var(--color-space-300,#98a7e9);display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;font-size:var(--font-size-xs,0.6875rem);line-height:1;}
                .mst-hccp-level-input{width:auto;flex:1 1 0;min-width:0;height:var(--input-height-small,1.5rem);padding:0;border:1px solid var(--color-midnight-100,#454771);text-align:center;text-align-last:center;appearance:none;-moz-appearance:none;-webkit-appearance:none;
                    background:var(--color-midnight-900,#131419);color:var(--color-text-dark-mode,#fff);box-sizing:border-box;font-size:var(--font-size-xs,0.6875rem);font-weight:var(--font-weight-medium,500);line-height:var(--input-height-small,1.5rem);}
                .mst-hccp-level-input[data-type="from"]{border-radius:var(--radius-sm,0.25rem) 0 0 var(--radius-sm,0.25rem);border-right:0;}
                .mst-hccp-level-input[data-type="to"]{border-radius:0 var(--radius-sm,0.25rem) var(--radius-sm,0.25rem) 0;border-left:0;}
                #mst-hccp-batch-to-level{border-radius:0 var(--radius-sm,0.25rem) var(--radius-sm,0.25rem) 0;border-left:0;font-size:var(--font-size-sm,0.8125rem);}
                #mst-hccp-batch-from-level{border-radius:var(--radius-sm,0.25rem) 0 0 var(--radius-sm,0.25rem);border-right:0;font-size:var(--font-size-sm,0.8125rem);}
                .mst-hccp-output-actions{margin-top:var(--spacing-xs,0.25rem);display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-xs,0.25rem);flex:0 0 auto;}
                .mst-hccp-output-buttons{display:flex;align-items:center;gap:var(--spacing-xs,0.25rem);flex:0 0 auto;}
                .mst-hccp-display-option{padding:var(--spacing-xs-plus,0.375rem) var(--spacing-sm,0.5rem);background:var(--color-midnight-700,#20212f);border:1px solid var(--color-midnight-400,#323450);border-radius:var(--radius-sm,0.25rem);display:flex;align-items:center;
                    gap:var(--spacing-sm,0.5rem);flex-wrap:wrap;color:var(--color-space-200,#bbc5f1);font-size:var(--font-size-sm,0.8125rem);line-height:var(--line-height-tight,1.2);flex:0 1 auto;}
                .mst-hccp-display-option label{cursor:pointer;display:inline-flex;align-items:center;gap:var(--spacing-xs,0.25rem);}
                .mst-hccp-display-option input{margin:0;accent-color:var(--color-space-500,#546ddb);vertical-align:middle;}
                #mst-hccp-export-csv,#mst-hccp-add-to-cart{flex:0 0 auto;padding:0 var(--button-padding-x-normal,0.625rem);white-space:nowrap;}
                #mst-hccp-results-text{width:100%;box-sizing:border-box;flex:1 0 7rem;height:auto;min-height:7rem;margin-top:var(--spacing-xs,0.25rem);padding:var(--spacing-sm,0.5rem);border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,0.25rem);
                    background:var(--color-midnight-900,#131419);color:var(--color-text-dark-mode,#fff);resize:none;overflow:auto;font-family:Consolas,monospace;font-size:var(--font-size-sm,0.8125rem);line-height:var(--line-height-normal,1.375);}
                @media (max-width: 640px){
                    #mst-hccp-house-calculator{--hccp-panel-height:min(37.5rem,calc(100svh - 6rem));width:100%;height:var(--hccp-panel-height);max-height:calc(100svh - 6rem);resize:none;}
                    .mst-hccp-calculator-toolbar{flex-wrap:wrap;align-items:center;}
                    .mst-hccp-select-all-label{justify-content:flex-start;}
                    .mst-hccp-toolbar-actions{flex:0 1 auto;flex-wrap:wrap;}
                    .mst-hccp-output-actions{flex-wrap:wrap;}
                    .mst-hccp-level-input{width:2.375rem;}
                }
            `);
        }

        render() {
            return [
                '<div class="mst-hccp-calculator-body">',
                '<div class="mst-hccp-calculator-toolbar">',
                '  <div class="mst-hccp-select-groups">',
                '  <label class="mst-hccp-select-all-label"><input type="checkbox" id="mst-hccp-select-life"> ' +
                    utils.escapeHtml(i18n.t('selectLife')) +
                    '</label>',
                '  <label class="mst-hccp-select-all-label"><input type="checkbox" id="mst-hccp-select-combat"> ' +
                    utils.escapeHtml(i18n.t('selectCombat')) +
                    '</label>',
                '  </div>',
                '  <div class="mst-hccp-toolbar-actions">',
                '  <div class="mst-hccp-batch-level">',
                '    <select id="mst-hccp-batch-from-level" class="mst-hccp-level-input mst-hccp-batch-level-input" title="' +
                    utils.escapeHtml(i18n.t('batchStart')) +
                    '">' +
                    utils.createLevelOptions(CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL, CONFIG.MIN_FROM_LEVEL) +
                    '</select>',
                '      <span class="mst-hccp-level-arrow">→</span>',
                '    <select id="mst-hccp-batch-to-level" class="mst-hccp-level-input mst-hccp-batch-level-input" title="' +
                    utils.escapeHtml(i18n.t('batchTarget')) +
                    '">' +
                    utils.createLevelOptions(2, CONFIG.MAX_TO_LEVEL, CONFIG.MAX_TO_LEVEL) +
                    '</select>',
                '  </div>',
                '  <button id="mst-hccp-refresh-levels">' + utils.escapeHtml(i18n.t('refreshLevels')) + '</button>',
                '  </div>',
                '</div>',
                '<div id="mst-hccp-rooms-container">' + this.renderRooms() + '</div>',
                '<div class="mst-hccp-output-actions">',
                '  <div class="mst-hccp-display-option">',
                '  <span>' + utils.escapeHtml(i18n.t('itemDisplayFormat')) + '</span>',
                '  <label><input type="radio" name="display-format" value="name" checked> ' + utils.escapeHtml(i18n.t('name')) + '</label>',
                '  <label><input type="radio" name="display-format" value="hrid"> HRID</label>',
                '  </div>',
                '  <div class="mst-hccp-output-buttons">',
                '    <button id="mst-hccp-export-csv">' + utils.escapeHtml(i18n.t('exportCsv')) + '</button>',
                MarketMateBridge.isReady()
                    ? '    <button id="mst-hccp-add-to-cart" title="' +
                      utils.escapeHtml(i18n.t('addMissingToCartTitle')) +
                      '">' +
                      utils.escapeHtml(i18n.t('addMissingToCart')) +
                      '</button>'
                    : '',
                '  </div>',
                '</div>',
                '<textarea id="mst-hccp-results-text" readonly placeholder="' + utils.escapeHtml(i18n.t('resultPlaceholder')) + '"></textarea>',
                '</div>'
            ].join('');
        }

        renderRooms() {
            return Object.keys(this.houseDetails)
                .sort((a, b) => {
                    const sortA = this.houseDetails[a]?.sortIndex ?? 9999;
                    const sortB = this.houseDetails[b]?.sortIndex ?? 9999;
                    return sortA - sortB || a.localeCompare(b);
                })
                .map((hrid, index) => {
                    const room = this.houseDetails[hrid];
                    if (!room) return '';
                    const houseGroup = index < 10 ? 'life' : 'combat';
                    const currentLevel = utils.clampLevel(
                        this.currentRoomLevels[hrid] || CONFIG.MIN_FROM_LEVEL,
                        CONFIG.MIN_FROM_LEVEL,
                        CONFIG.MAX_FROM_LEVEL
                    );
                    const toLevel = Math.min(CONFIG.MAX_TO_LEVEL, currentLevel + 1);
                    const iconHref = this.roomIcons[hrid] || '';
                    const iconHtml = iconHref
                        ? '<span class="mst-hccp-room-icon"><svg role="img" aria-label="' + utils.escapeHtml(i18n.t('roomIcon')) + '" width="1em" height="1em" class="Icon_icon__2LtL_ Icon_small__2bxvH"><use href="' +
                          utils.escapeHtml(iconHref) +
                          '"></use></svg></span>'
                        : '';
                    return [
                        '<div class="mst-hccp-room-checkbox" data-hrid="' + utils.escapeHtml(hrid) + '">',
                        '  <div class="mst-hccp-room-row">',
                        '    <label class="mst-hccp-room-left">',
                        '      <input type="checkbox" value="' + utils.escapeHtml(hrid) + '" data-group="' + houseGroup + '">',
                        iconHtml,
                        '      <span class="mst-hccp-room-name">' + utils.escapeHtml(utils.getHouseName(hrid)) + '</span>',
                        '    </label>',
                        '    <div class="mst-hccp-room-levels">',
                        '      <select class="mst-hccp-level-input" data-room="' +
                            utils.escapeHtml(hrid) +
                            '" data-type="from">' +
                            utils.createLevelOptions(CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL, currentLevel) +
                            '</select>',
                        '      <span class="mst-hccp-level-arrow">→</span>',
                        '      <select class="mst-hccp-level-input" data-room="' +
                            utils.escapeHtml(hrid) +
                            '" data-type="to">' +
                            utils.createLevelOptions(currentLevel + 1, CONFIG.MAX_TO_LEVEL, toLevel) +
                            '</select>',
                        '    </div>',
                        '  </div>',
                        '</div>'
                    ].join('');
                })
                .join('');
        }

        bindEvents(container) {
            container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    this.toggleRoomSelected(checkbox);
                    this.scheduleCalculate(container);
                });
                this.toggleRoomSelected(checkbox);
            });
            this.updateSelectAllState(container);

            container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach(select => {
                select.addEventListener('change', () => {
                    this.refreshToLevelOptions(select);
                    this.scheduleCalculate(container);
                });
            });
            container.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach(select => {
                select.addEventListener('change', () => this.scheduleCalculate(container));
            });

            container.querySelector('#mst-hccp-select-life').addEventListener('change', () => this.toggleAllRooms(container, 'life'));
            container.querySelector('#mst-hccp-select-combat').addEventListener('change', () => this.toggleAllRooms(container, 'combat'));
            const batchFromSelect = container.querySelector('#mst-hccp-batch-from-level');
            const batchToSelect = container.querySelector('#mst-hccp-batch-to-level');
            const applyBatchFrom = () => {
                this.refreshBatchToLevelOptions(container);
                this.applyBatchFromLevel(container);
            };
            const applyBatchTo = () => this.applyBatchToLevel(container);
            batchFromSelect.addEventListener('change', applyBatchFrom);
            batchFromSelect.addEventListener('blur', applyBatchFrom);
            batchToSelect.addEventListener('change', applyBatchTo);
            batchToSelect.addEventListener('blur', applyBatchTo);
            container.querySelector('#mst-hccp-refresh-levels').addEventListener('click', () => this.refreshRoomLevels(container));
            container.querySelectorAll('input[name="display-format"]').forEach(input => {
                input.addEventListener('change', () => this.refreshResultDisplay(container));
            });
            container.querySelector('#mst-hccp-export-csv').addEventListener('click', () => {
                this.flushScheduledCalculate(container);
                this.exportCsv(container);
            });
            this.bindMarketMateButton(container);
        }

        bindMarketMateButton(container) {
            const button = container.querySelector('#mst-hccp-add-to-cart');
            if (!button || button.dataset.mstBound) return;
            button.dataset.mstBound = '1';
            button.addEventListener('click', () => this.addMissingMaterialsToCart(container));
        }

        ensureMarketMateButton(container) {
            if (!container?.isConnected || !MarketMateBridge.isReady()) return;
            let button = container.querySelector('#mst-hccp-add-to-cart');
            if (!button) {
                const actions = container.querySelector('.mst-hccp-output-buttons');
                button = utils.ensureButton({
                    host: actions,
                    id: 'mst-hccp-add-to-cart',
                    text: i18n.t('addMissingToCart'),
                    title: i18n.t('addMissingToCartTitle')
                });
            }
            if (!button) return;
            this.bindMarketMateButton(container);
        }

        addMissingMaterialsToCart(container) {
            if (!MarketMateBridge.isReady()) {
                container.querySelector('#mst-hccp-add-to-cart')?.remove();
                Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
                return;
            }
            this.flushScheduledCalculate(container);
            if (!this.lastResult) {
                Notifier.toast(i18n.t('noResultToExport'), 'warning');
                return;
            }
            const items = this.getMaterialEntries(this.lastResult.materials)
                .filter(entry => entry.itemHrid !== '/items/coin' && entry.missing > 0)
                .map(entry => ({
                    itemId: entry.itemHrid,
                    name: DataHub.resolveItemName(entry.itemHrid),
                    iconRef: entry.itemHrid,
                    quantity: Math.ceil(entry.missing),
                    source: 'mst_house'
                }));
            if (!items.length) {
                Notifier.toast(i18n.t('enoughMaterials'), 'info');
                return;
            }
            const response = MarketMateBridge.addToCart(items);
            if (!response?.ok || !response.added) {
                Notifier.toast(response?.error || i18n.t('abilityBooksCartFailed'), 'error');
                return;
            }
            const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
            Notifier.toast(i18n.t('addMissingToCartDone', response.added || 0, quantity.toLocaleString(i18n.locale)), 'success');
        }

        rerenderForLanguage(container, nextLang) {
            if (nextLang !== 'zh' && nextLang !== 'en') return;
            if (!i18n.setLanguage(nextLang)) return;
            const checkedHrids = new Set(
                Array.from(container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')).map(cb => cb.value)
            );
            const roomLevels = {};
            container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach(fromSelect => {
                const hrid = fromSelect.getAttribute('data-room');
                const toSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
                roomLevels[hrid] = {fromLevel: parseInt(fromSelect.value, 10), toLevel: parseInt(toSelect.value, 10)};
            });
            const displayFormat = container.querySelector('input[name="display-format"]:checked')?.value || 'name';

            TemplateRenderer.renderHtml(() => this.render(), container);
            this.bindEvents(container);
            const swalTitle = container.closest('.swal2-popup')?.querySelector('.swal2-title');
            if (swalTitle) swalTitle.textContent = i18n.t('title');

            Object.entries(roomLevels).forEach(([hrid, levels]) => {
                const fromSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]');
                if (!fromSelect) return;
                fromSelect.value = String(levels.fromLevel);
                this.refreshToLevelOptions(fromSelect);
                const toSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
                if (toSelect) toSelect.value = String(levels.toLevel);
            });
            container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = checkedHrids.has(checkbox.value);
                this.toggleRoomSelected(checkbox);
            });
            const displayInput = container.querySelector('input[name="display-format"][value="' + displayFormat + '"]');
            if (displayInput) displayInput.checked = true;
            const triggerBtn = document.getElementById('mst-hccp-house-calculator-trigger');
            if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
        }

        toggleRoomSelected(checkbox) {
            const roomDiv = checkbox.closest('.mst-hccp-room-checkbox');
            roomDiv.classList.toggle('mst-hccp-room-selected', checkbox.checked);
            this.updateSelectAllState(checkbox.closest('#mst-hccp-house-calculator'));
        }

        updateSelectAllState(container) {
            if (!container) return;
            ['life', 'combat'].forEach(group => {
                const selectAll = container.querySelector('#mst-hccp-select-' + group);
                const checkboxes = Array.from(
                    container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"][data-group="' + group + '"]')
                );
                if (!selectAll || checkboxes.length === 0) return;
                const checkedCount = checkboxes.filter(cb => cb.checked).length;
                selectAll.checked = checkedCount === checkboxes.length;
                selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
            });
        }

        refreshToLevelOptions(fromSelect) {
            const hrid = fromSelect.getAttribute('data-room');
            const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
            const toSelect = document.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]');
            const selected = Math.max(fromLevel + 1, parseInt(toSelect.value, 10) || fromLevel + 1);
            TemplateRenderer.renderHtml(() => utils.createLevelOptions(fromLevel + 1, CONFIG.MAX_TO_LEVEL, Math.min(CONFIG.MAX_TO_LEVEL, selected)), toSelect);
        }

        refreshBatchToLevelOptions(container) {
            const fromSelect = container.querySelector('#mst-hccp-batch-from-level');
            const toSelect = container.querySelector('#mst-hccp-batch-to-level');
            const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
            const selected = Math.max(fromLevel + 1, parseInt(toSelect.value, 10) || fromLevel + 1);
            TemplateRenderer.renderHtml(() => utils.createLevelOptions(fromLevel + 1, CONFIG.MAX_TO_LEVEL, Math.min(CONFIG.MAX_TO_LEVEL, selected)), toSelect);
        }

        scheduleCalculate(container) {
            clearTimeout(this.autoCalculateTimer);
            this.autoCalculateTimer = setTimeout(() => {
                this.autoCalculateTimer = null;
                this.calculateSelectedRooms(container);
            }, CONFIG.AUTO_CALC_DELAY);
        }

        clearPendingCalculate() {
            if (!this.autoCalculateTimer) return;
            clearTimeout(this.autoCalculateTimer);
            this.autoCalculateTimer = null;
        }

        flushScheduledCalculate(container) {
            if (!this.autoCalculateTimer) return;
            this.clearPendingCalculate();
            this.calculateSelectedRooms(container);
        }

        toggleAllRooms(container, group) {
            const selectAll = container.querySelector('#mst-hccp-select-' + group);
            const checkboxes = Array.from(
                container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"][data-group="' + group + '"]')
            );
            const targetChecked = selectAll.checked;
            checkboxes.forEach(cb => {
                cb.checked = targetChecked;
                this.toggleRoomSelected(cb);
            });
            this.updateSelectAllState(container);
            this.scheduleCalculate(container);
        }

        refreshRoomLevels(container) {
            const checkedHrids = new Set(
                Array.from(container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')).map(cb => cb.value)
            );
            const roomState = this.getRoomLevelsFromUI();
            this.currentRoomLevels = roomState.roomLevels;
            this.roomIcons = roomState.roomIcons;

            const roomsContainer = container.querySelector('#mst-hccp-rooms-container');
            TemplateRenderer.renderHtml(() => this.renderRooms(), roomsContainer);
            roomsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = checkedHrids.has(checkbox.value);
                checkbox.addEventListener('change', () => {
                    this.toggleRoomSelected(checkbox);
                    this.scheduleCalculate(container);
                });
                this.toggleRoomSelected(checkbox);
            });
            roomsContainer.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach(select => {
                select.addEventListener('change', () => {
                    this.refreshToLevelOptions(select);
                    this.scheduleCalculate(container);
                });
            });
            roomsContainer.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach(select => {
                select.addEventListener('change', () => this.scheduleCalculate(container));
            });
            this.updateSelectAllState(container);
            this.scheduleCalculate(container);
        }

        applyBatchFromLevel(container) {
            const batchFromLevel = parseInt(container.querySelector('#mst-hccp-batch-from-level').value, 10);
            container.querySelectorAll('.mst-hccp-level-input[data-type="from"]').forEach(fromSelect => {
                fromSelect.value = String(batchFromLevel);
                this.refreshToLevelOptions(fromSelect);
            });
            this.scheduleCalculate(container);
        }

        applyBatchToLevel(container) {
            const batchToLevel = utils.clampLevel(container.querySelector('#mst-hccp-batch-to-level').value, 2, CONFIG.MAX_TO_LEVEL);
            container.querySelectorAll('.mst-hccp-level-input[data-type="to"]').forEach(toSelect => {
                const hrid = toSelect.getAttribute('data-room');
                const fromSelect = container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]');
                const fromLevel = utils.clampLevel(fromSelect.value, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
                toSelect.value = String(Math.max(batchToLevel, fromLevel + 1));
            });
            this.scheduleCalculate(container);
        }

        calculateSelectedRooms(container) {
            const selectedRooms = Array.from(container.querySelectorAll('#mst-hccp-rooms-container input[type="checkbox"]:checked')).map(cb => {
                const hrid = cb.value;
                return {
                    hrid,
                    fromLevel: parseInt(container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="from"]').value, 10),
                    toLevel: parseInt(container.querySelector('.mst-hccp-level-input[data-room="' + hrid + '"][data-type="to"]').value, 10)
                };
            });

            if (selectedRooms.length === 0) {
                container.querySelector('#mst-hccp-results-text').value = i18n.t('selectHouseFirst');
                this.lastResult = null;
                return;
            }

            try {
                const allMaterials = {};
                const roomDetails = [];
                selectedRooms.forEach(({hrid, fromLevel, toLevel}) => {
                    try {
                        const materials = this.calculator.calculateUpgradeMaterials(hrid, fromLevel, toLevel);
                        Object.entries(materials).forEach(([itemHrid, count]) => {
                            allMaterials[itemHrid] = (allMaterials[itemHrid] || 0) + count;
                        });
                        roomDetails.push({hrid, fromLevel, toLevel});
                    } catch (error) {
                        roomDetails.push({hrid, error: error.message});
                    }
                });

                this.lastResult = {materials: allMaterials, roomDetails};
                this.displayResults(container, allMaterials, roomDetails);
            } catch (error) {
                container.querySelector('#mst-hccp-results-text').value = i18n.t('error') + ': ' + error.message;
                this.lastResult = null;
            }
        }

        refreshResultDisplay(container) {
            this.clearPendingCalculate();
            this.calculateSelectedRooms(container);
        }

        escapeCsvCell(value) {
            const text = String(value ?? '');
            return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }

        formatCompactNumber(value) {
            const number = Number(value) || 0;
            const abs = Math.abs(number);
            const units = [
                {value: 1e12, suffix: 'T'},
                {value: 1e9, suffix: 'B'},
                {value: 1e6, suffix: 'M'},
                {value: 1e3, suffix: 'K'}
            ];
            const unit = units.find(item => abs >= item.value);
            if (!unit) return number.toFixed(2).replace(/\.?0+$/, '');
            return (number / unit.value).toFixed(2).replace(/\.?0+$/, '') + unit.suffix;
        }

        formatMaterialCount(itemHrid, value) {
            return itemHrid === '/items/coin' ? this.formatCompactNumber(value) : value.toLocaleString(i18n.locale);
        }

        getMaterialEntries(materials) {
            const sortByIndex = (a, b) => {
                const indexA = DataHub.getItemDetail(a.itemHrid)?.sortIndex ?? 9999;
                const indexB = DataHub.getItemDetail(b.itemHrid)?.sortIndex ?? 9999;
                return indexA - indexB;
            };
            const entries = Object.entries(materials).map(([itemHrid, count]) => {
                const available = CharacterDataService.getInventoryCount(itemHrid);
                const missing = Math.max(0, count - available);
                const marketPrice = this.marketDataService.getPrice(itemHrid);
                const totalValue = count * marketPrice;
                const valueGap = itemHrid === '/items/coin' ? 0 : missing * marketPrice;
                return {itemHrid, count, available, missing, marketPrice, totalValue, valueGap};
            });
            const existingEntries = entries.filter(entry => entry.missing === 0).sort(sortByIndex);
            const neededEntries = entries.filter(entry => entry.missing > 0).sort(sortByIndex);
            return existingEntries.concat(neededEntries);
        }

        getMaterialSummary(materialEntries) {
            return materialEntries.reduce(
                (summary, entry) => {
                    summary.materialKinds += 1;
                    summary.totalValue += entry.totalValue;
                    summary.valueGap += entry.valueGap;
                    if (entry.itemHrid === '/items/coin') {
                        summary.requiredCoins += entry.count;
                    } else {
                        summary.missingCount += entry.missing;
                        summary.materialValue += entry.totalValue;
                    }
                    return summary;
                },
                {materialKinds: 0, missingCount: 0, totalValue: 0, valueGap: 0, requiredCoins: 0, materialValue: 0}
            );
        }

        exportCsv(container) {
            if (!this.lastResult) {
                container.querySelector('#mst-hccp-results-text').value = i18n.t('noResultToExport');
                return;
            }

            const houseInfo = this.lastResult.roomDetails
                .map(detail => {
                    if (detail.error) {
                        return utils.getHouseName(detail.hrid) + ' (' + i18n.t('error') + ': ' + detail.error + ')';
                    }
                    return utils.getHouseName(detail.hrid) + ' (' + detail.fromLevel + '->' + detail.toLevel + ')';
                })
                .join(i18n.t('listSeparator'));
            const rows = [[i18n.t('csvUpgradeHouses'), houseInfo], [], [i18n.t('csvMarketTime'), this.marketDataService.getUpdatedText()]];

            const materialEntries = this.getMaterialEntries(this.lastResult.materials);
            const summary = this.getMaterialSummary(materialEntries);
            const materialRows = materialEntries.map(entry => {
                return [
                    entry.itemHrid,
                    utils.getItemName(entry.itemHrid),
                    this.formatMaterialCount(entry.itemHrid, entry.count),
                    this.formatMaterialCount(entry.itemHrid, entry.available),
                    this.formatMaterialCount(entry.itemHrid, entry.missing),
                    this.formatCompactNumber(entry.marketPrice),
                    this.formatCompactNumber(entry.totalValue),
                    this.formatCompactNumber(entry.valueGap)
                ];
            });

            rows.push([i18n.t('csvMaterialKinds'), summary.materialKinds, i18n.t('csvMissingCount'), summary.missingCount]);
            rows.push([
                i18n.t('csvTotalValue'),
                this.formatCompactNumber(summary.totalValue),
                i18n.t('csvRequiredCoins'),
                this.formatCompactNumber(summary.requiredCoins),
                i18n.t('csvMaterialValue'),
                this.formatCompactNumber(summary.materialValue),
                i18n.t('csvValueGap'),
                this.formatCompactNumber(summary.valueGap)
            ]);
            rows.push([]);
            rows.push([
                i18n.t('csvHrid'),
                i18n.t('csvName'),
                i18n.t('csvRequiredCount'),
                i18n.t('csvAvailableCount'),
                i18n.t('csvMissingCount'),
                i18n.t('csvMarketPrice'),
                i18n.t('csvTotalValue'),
                i18n.t('csvValueGap')
            ]);
            rows.push(...materialRows);

            const csv = '\ufeff' + rows.map(row => row.map(cell => this.escapeCsvCell(cell)).join(',')).join('\r\n');
            const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = i18n.t('csvFilenamePrefix') + '_' + utils.formatLocalFileTime() + '.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        }

        formatMaterialResultLine(entry, useHrid) {
            const costDisplay =
                entry.valueGap > 0
                    ? ' (' + i18n.t('value') + ': ' + this.formatCompactNumber(entry.valueGap) + ' ' + i18n.t('coins') + ')'
                    : '';
            const displayName = useHrid ? entry.itemHrid : utils.getItemName(entry.itemHrid);
            return (
                '• ' +
                displayName +
                ': ' +
                i18n.t('need') +
                ' ' +
                this.formatMaterialCount(entry.itemHrid, entry.missing) +
                ' (' +
                i18n.t('now') +
                ' ' +
                this.formatMaterialCount(entry.itemHrid, entry.available) +
                '/' +
                this.formatMaterialCount(entry.itemHrid, entry.count) +
                ')' +
                costDisplay
            );
        }

        displayResults(container, materials, roomDetails) {
            const resultsText = container.querySelector('#mst-hccp-results-text');
            const useHrid = container.querySelector('input[name="display-format"]:checked').value === 'hrid';

            let output =
                i18n.t('upgradedHouses') +
                '\n' +
                roomDetails
                    .map(detail => {
                        if (detail.error) {
                            const name = useHrid ? detail.hrid : utils.getHouseName(detail.hrid);
                            return '• ' + name + ' (' + i18n.t('error') + ': ' + detail.error + ')';
                        }
                        const name = useHrid ? detail.hrid : utils.getHouseName(detail.hrid);
                        return '• ' + name + ' (' + detail.fromLevel + '->' + detail.toLevel + ')';
                    })
                    .join('\n') +
                '\n\n';

            const materialEntries = this.getMaterialEntries(materials);
            const summary = this.getMaterialSummary(materialEntries);
            const existingEntries = materialEntries.filter(entry => entry.missing === 0);
            const neededEntries = materialEntries.filter(entry => entry.missing > 0);

            output += i18n.t('summaryInfo') + '\n';
            output += '• ' + i18n.t('marketDataTime') + ': ' + this.marketDataService.getUpdatedText() + '\n';
            output += '• ' + i18n.t('csvMaterialKinds') + ': ' + summary.materialKinds.toLocaleString(i18n.locale) + '\n';
            output += '• ' + i18n.t('csvMissingCount') + ': ' + summary.missingCount.toLocaleString(i18n.locale) + '\n';
            output += '• ' + i18n.t('csvTotalValue') + ': ' + this.formatCompactNumber(summary.totalValue) + '\n';
            output += '• ' + i18n.t('csvRequiredCoins') + ': ' + this.formatCompactNumber(summary.requiredCoins) + '\n';
            output += '• ' + i18n.t('csvMaterialValue') + ': ' + this.formatCompactNumber(summary.materialValue) + '\n';
            output += '• ' + i18n.t('csvValueGap') + ': ' + this.formatCompactNumber(summary.valueGap) + '\n\n';
            output += i18n.t('existingMaterials') + '\n';

            if (existingEntries.length === 0) {
                output += '• ' + i18n.t('noExistingMaterials') + '\n\n';
            } else {
                existingEntries.forEach(entry => {
                    output += this.formatMaterialResultLine(entry, useHrid) + '\n';
                });
                output += '\n';
            }

            output += i18n.t('requiredMaterials') + '\n';

            if (neededEntries.length === 0) {
                output += '• ' + i18n.t('enoughMaterials');
            } else {
                neededEntries.forEach(entry => {
                    output += this.formatMaterialResultLine(entry, useHrid) + '\n';
                });
            }

            resultsText.value = output;
        }

        getRoomLevelsFromUI() {
            const roomLevels = {};
            const roomIcons = {...this.roomIcons};
            const roomDivs = document.querySelectorAll(
                '[class*="HousePanel_housePanel__"] [class*="HousePanel_houseRoom__"]'
            );
            const houseSpriteUrl =
                utils.getSvgSpriteUrl('[class*="HousePanel_houseRoom__"] svg use') ||
                utils.getSpriteUrl('misc') ||
                '/static/media/misc_sprite.cfad291b.svg';
            const houseNameToHrid = new Map();

            Object.entries(this.houseDetails).forEach(([hrid, detail]) => {
                const names = [
                    detail?.name,
                    detail?.nameZh,
                    DataHub.clientData.indexes.houseHridToNameEn?.get(hrid),
                    DataHub.clientData.indexes.houseHridToNameZh?.get(hrid)
                ];
                names.forEach(name => {
                    if (name) houseNameToHrid.set(String(name).trim(), hrid);
                });
            });

            roomDivs.forEach(div => {
                const nameElement = div.querySelector('[class*="HousePanel_name__"]');
                const levelElement = div.querySelector('[class*="HousePanel_level__"]');
                const iconElement = div.querySelector('svg use');
                if (!nameElement || !levelElement) return;

                const name = nameElement.textContent.trim();
                const levelMatch = levelElement.textContent.match(/\d+/);
                const level = levelMatch ? parseInt(levelMatch[0], 10) : CONFIG.MIN_FROM_LEVEL;
                const iconHref = utils.getSvgUseHref(iconElement);
                const iconFragment = iconHref?.split('#').pop() || '';
                // 游戏房屋图标固定使用 #house_<room-id>，直接还原 HRID 可避开语言和 CSS 哈希变化。
                const iconHrid = iconFragment.startsWith('house_')
                    ? '/house_rooms/' + iconFragment.slice('house_'.length)
                    : null;
                const hrid = (iconHrid && this.houseDetails[iconHrid] ? iconHrid : null) || houseNameToHrid.get(name);

                if (hrid) {
                    roomLevels[hrid] = level;
                    if (iconHref) roomIcons[hrid] = iconHref;
                }
            });

            // 与 PGE 的图标解析方式一致：从当前页面获取带实时 hash 的 sprite 路径。
            if (houseSpriteUrl) {
                Object.keys(this.houseDetails).forEach(hrid => {
                    if (!roomIcons[hrid]) {
                        roomIcons[hrid] = houseSpriteUrl + '#house_' + utils.substrLastSlash(hrid);
                    }
                });
            }

            const characterHouseRoomMap = CharacterDataService.raw?.characterHouseRoomMap || {};
            Object.entries(characterHouseRoomMap).forEach(([hrid, data]) => {
                if (!roomLevels[hrid] && this.houseDetails[hrid]) {
                    roomLevels[hrid] = utils.clampLevel(data?.level || CONFIG.MIN_FROM_LEVEL, CONFIG.MIN_FROM_LEVEL, CONFIG.MAX_FROM_LEVEL);
                }
            });

            return {roomLevels, roomIcons};
        }
    }

    // ==================== 综合功能模块 ====================
    const SWAL_CLASS_NAMES = {
        alert: {container: 'mst-swal2-theme', popup: 'mst-swal2-popup'},
        html: {container: 'mst-swal2-theme', popup: 'mst-swal2-popup mst-swal2-html-popup'}
    };

    const Notifier = {
        _enableBoundedDragging(popup) {
            if (!popup || popup._mstDragCleanup) return;
            const margin = 8;
            const clampPosition = force => {
                if (!force && !popup.classList.contains('swal2-dragging')) return;
                const viewport = window.visualViewport;
                const layoutWidth = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
                const layoutHeight = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
                const minX = Math.max(0, viewport?.offsetLeft || 0) + margin;
                const minY = Math.max(0, viewport?.offsetTop || 0) + margin;
                const maxX = Math.min(layoutWidth, viewport ? viewport.offsetLeft + viewport.width : layoutWidth) - margin;
                const maxY = Math.min(layoutHeight, viewport ? viewport.offsetTop + viewport.height : layoutHeight) - margin;
                const rect = popup.getBoundingClientRect();
                let deltaX = 0;
                let deltaY = 0;
                if (rect.left < minX) deltaX = minX - rect.left;
                else if (rect.right > maxX) deltaX = maxX - rect.right;
                if (rect.top < minY) deltaY = minY - rect.top;
                else if (rect.bottom > maxY) deltaY = maxY - rect.bottom;
                if (deltaX) {
                    const current = parseFloat(popup.style.insetInlineStart) || 0;
                    const rtlFactor = getComputedStyle(popup).direction === 'rtl' ? -1 : 1;
                    popup.style.insetInlineStart = current + deltaX * rtlFactor + 'px';
                }
                if (deltaY) {
                    const current = parseFloat(popup.style.insetBlockStart) || 0;
                    popup.style.insetBlockStart = current + deltaY + 'px';
                }
            };
            const onDragEnd = event => {
                if (!popup.classList.contains('swal2-dragging')) return;
                const eventType = event?.type?.startsWith('touch') ? 'touchend' : 'mouseup';
                popup.dispatchEvent(new Event(eventType));
                clampPosition(true);
            };
            const onDragMove = event => {
                clampPosition(false);
                if (!popup.classList.contains('swal2-dragging')) return;
                const point = event.touches?.[0] || event;
                const viewport = window.visualViewport;
                const left = viewport?.offsetLeft || 0;
                const top = viewport?.offsetTop || 0;
                const right = viewport ? left + viewport.width : window.innerWidth;
                const bottom = viewport ? top + viewport.height : window.innerHeight;
                if (point.clientX <= left || point.clientX >= right - 1 ||
                    point.clientY <= top || point.clientY >= bottom - 1) {
                    onDragEnd(event);
                }
            };
            const onViewportChange = () => clampPosition(true);
            document.body.addEventListener('mousemove', onDragMove);
            document.body.addEventListener('touchmove', onDragMove, {passive: true});
            document.body.addEventListener('mouseup', onDragEnd);
            document.body.addEventListener('touchend', onDragEnd);
            window.addEventListener('mouseup', onDragEnd);
            window.addEventListener('touchend', onDragEnd);
            document.addEventListener('mouseleave', onDragEnd);
            window.addEventListener('blur', onDragEnd);
            window.addEventListener('resize', onViewportChange);
            window.visualViewport?.addEventListener('resize', onViewportChange);
            window.visualViewport?.addEventListener('scroll', onViewportChange);
            popup._mstDragCleanup = () => {
                document.body.removeEventListener('mousemove', onDragMove);
                document.body.removeEventListener('touchmove', onDragMove);
                document.body.removeEventListener('mouseup', onDragEnd);
                document.body.removeEventListener('touchend', onDragEnd);
                window.removeEventListener('mouseup', onDragEnd);
                window.removeEventListener('touchend', onDragEnd);
                document.removeEventListener('mouseleave', onDragEnd);
                window.removeEventListener('blur', onDragEnd);
                window.removeEventListener('resize', onViewportChange);
                window.visualViewport?.removeEventListener('resize', onViewportChange);
                window.visualViewport?.removeEventListener('scroll', onViewportChange);
                delete popup._mstDragCleanup;
            };
            requestAnimationFrame(onViewportChange);
        },

        _disableBoundedDragging(popup) {
            popup?._mstDragCleanup?.();
        },

        _toastPopup: null,
        _toastRoot: null,
        _toastPaused: false,
        _toastSequence: 0,
        _toastItems: [],
        _prefix(type) {
            return {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️',
                question: '❓'
            }[type] || '';
        },

        formatText(text, type) {
            const prefix = this._prefix(type);
            return prefix ? prefix + ' ' + String(text || '') : String(text || '');
        },

        _scheduleToast(item) {
            if (this._toastPaused || item.timerId || item.remaining <= 0) return;
            item.startedAt = Date.now();
            item.timerId = setTimeout(() => this._removeToast(item.id), item.remaining);
        },

        _pauseToasts() {
            if (this._toastPaused) return;
            this._toastPaused = true;
            this._toastItems.forEach(item => {
                if (!item.timerId) return;
                clearTimeout(item.timerId);
                item.timerId = null;
                item.remaining = Math.max(0, item.remaining - (Date.now() - item.startedAt));
            });
        },

        _resumeToasts() {
            if (!this._toastPaused) return;
            this._toastPaused = false;
            this._toastItems.forEach(item => this._scheduleToast(item));
        },

        _removeToast(id) {
            const index = this._toastItems.findIndex(item => item.id === id);
            if (index === -1) return;
            const [item] = this._toastItems.splice(index, 1);
            if (item.timerId) clearTimeout(item.timerId);
            this._renderToasts();
        },

        // SweetAlert2 同一实例只能显示一个 popup。Toast 复用官方结构和主题类，
        // 但挂载到独立容器，避免关闭或替换名片、房屋计算等 Swal 弹窗。
        _ensureToastHost() {
            if (this._toastPopup && document.contains(this._toastPopup)) return;
            const host = document.createElement('div');
            host.className = 'mst-swal-toast-host mst-swal2-theme';
            host.setAttribute('aria-live', 'polite');
            host.setAttribute('aria-atomic', 'false');
            const popup = document.createElement('div');
            popup.className = 'swal2-popup swal2-toast mst-swal2-toast';
            popup.setAttribute('role', 'status');
            const htmlContainer = document.createElement('div');
            htmlContainer.className = 'swal2-html-container';
            const stack = document.createElement('div');
            stack.className = 'mst-swal-toast-stack';
            htmlContainer.appendChild(stack);
            popup.appendChild(htmlContainer);
            host.appendChild(popup);
            document.body.appendChild(host);
            this._toastPopup = popup;
            this._toastRoot = stack;
            this._toastPopup.onmouseenter = () => this._pauseToasts();
            this._toastPopup.onmouseleave = () => this._resumeToasts();
        },

        _renderToasts() {
            if (!this._toastItems.length) {
                this._toastPopup?.closest('.mst-swal-toast-host')?.remove();
                this._toastPopup = null;
                this._toastRoot = null;
                this._toastPaused = false;
                return;
            }
            this._ensureToastHost();
            if (!this._toastRoot) return;
            const fragment = document.createDocumentFragment();
            this._toastItems.forEach(item => {
                const element = document.createElement('div');
                element.className = 'mst-swal-toast-item';
                element.setAttribute('role', 'status');
                element.textContent = item.text;
                fragment.appendChild(element);
            });
            this._toastRoot.replaceChildren(fragment);
            this._toastItems.forEach(item => this._scheduleToast(item));
        },

        toast(text, type = 'info') {
            if (!text) return;
            if (typeof Swal === 'undefined') {
                console.warn('[MST]', text);
                return;
            }
            while (this._toastItems.length >= CONFIG.TOAST_MAX_COUNT) {
                const oldest = this._toastItems.shift();
                if (oldest?.timerId) clearTimeout(oldest.timerId);
            }
            const item = {
                id: ++this._toastSequence,
                text: this.formatText(text, type),
                remaining: CONFIG.TOAST_DURATION,
                startedAt: 0,
                timerId: null
            };
            this._toastItems.push(item);
            this._renderToasts();
        },

        alert(message, type = 'info', title = '') {
            if (typeof Swal === 'undefined') {
                console.warn('[MST]', title, message);
                return Promise.resolve();
            }
            return Swal.fire({
                heightAuto: false,
                title: title || undefined,
                text: this.formatText(message, type),
                confirmButtonText: i18n.t('confirm'),
                draggable: true,
                customClass: SWAL_CLASS_NAMES.alert,
                didOpen: popup => this._enableBoundedDragging(popup),
                willClose: popup => this._disableBoundedDragging(popup)
            });
        },

        // 后续带关闭按钮的内容弹窗统一通过此入口创建。
        html({title, html: content, width = '48rem', popupClass = '', containerClass = '', didOpen, willClose}) {
            if (typeof Swal === 'undefined') {
                console.warn('[MST]', title);
                return Promise.resolve();
            }
            const templateFactory = typeof content === 'function'
                ? content
                : TemplateRenderer.isTemplate(content)
                    ? () => content
                    : typeof content === 'string'
                        ? () => TemplateRenderer.html`${TemplateRenderer.raw(content)}`
                        : null;
            const templateRoot = templateFactory ? TemplateRenderer.render(templateFactory, document.createElement('div')) : null;
            return Swal.fire({
                heightAuto: false,
                title,
                html: templateRoot || content,
                width,
                showCloseButton: true,
                showConfirmButton: false,
                draggable: true,
                customClass: {
                    container: [SWAL_CLASS_NAMES.html.container, containerClass].filter(Boolean).join(' '),
                    popup: [SWAL_CLASS_NAMES.html.popup, popupClass].filter(Boolean).join(' ')
                },
                didOpen: popup => {
                    this._enableBoundedDragging(popup);
                    didOpen?.(popup);
                },
                willClose: popup => {
                    willClose?.(popup);
                    this._disableBoundedDragging(popup);
                    if (templateRoot) TemplateRenderer.clear(templateRoot);
                }
            });
        }
    };

    class ClipboardCartImportFeature {
        constructor() {
            this.panelRoot = null;
            this.panelObserver = null;
            this.bodyObserver = null;
        }

        parseClipboardCartText(text) {
            const replenish = {open: false, hour: 24};
            const lines = String(text || '')
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean);
            const replenishMatch = lines[0]?.match(/^补充(?<days>\d+(?:\.\d+)?)天$/);
            if (replenishMatch) {
                replenish.open = true;
                replenish.hour = parseFloat(replenishMatch.groups.days) * 24;
                replenish.match = lines.shift();
            }

            const countFirstPattern = /^(?<limit>\+?)(?<count>\d+(?:\.\d+)?)(?<hour>\/h)?\s+(?<name>.+?)(?:\+(?<level>\d{0,2}))?$/i;
            const nameFirstPattern = /^(?<name>.+?)(?:\+(?<level>\d{0,2}))?\s+(?<limit>\+?)(?<count>\d+(?:\.\d+)?)(?<hour>\/h)?$/i;
            const items = [];
            for (const line of lines) {
                const match = line.match(countFirstPattern) || line.match(nameFirstPattern);
                if (!match?.groups) continue;
                const count = parseFloat(match.groups.count);
                const isHour = replenish.open || Boolean(match.groups.hour);
                items.push({
                    match: line,
                    name: match.groups.name,
                    enhancementLevel: parseInt(match.groups.level || 0, 10),
                    count,
                    isLimit: !isHour && match.groups.limit === '+',
                    isHour,
                    quantity: isHour ? Math.ceil(replenish.hour * count) : count
                });
            }
            return {replenish, items};
        }

        async importFromClipboard() {
            try {
                if (!MarketMateBridge.isReady()) {
                    Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
                    return;
                }
                DataHub.initClientDataFromCache();
                DataHub.refreshI18nIndexes();
                const text = String((await utils.readClipboard()) || '').trim();
                if (!text) {
                    Notifier.toast(i18n.t('toastImportClipboardEmpty'), 'error');
                    return;
                }
                const result = this.parseClipboardCartText(text);
                const unmatched = [];
                const cartItems = [];
                for (const item of result.items) {
                    const rawName = String(item.name || '').trim();
                    let hrid = DataHub.ensureItemHrid(rawName) || '';
                    if (hrid && !hrid.startsWith('/items/')) hrid = '/items/' + hrid;
                    if (!hrid) {
                        unmatched.push(rawName);
                        continue;
                    }
                    let stock = 0;
                    if (item.isLimit || item.isHour) {
                        stock = CharacterDataService.getInventoryCount(hrid, item.enhancementLevel || 0);
                    }
                    const quantity = Math.ceil(Number(item.quantity - stock));
                    if (!Number.isFinite(quantity) || quantity <= 0) continue;
                    cartItems.push({itemId: hrid, name: DataHub.resolveItemName(hrid), iconRef: hrid, quantity, source: 'mst_clipboard'});
                }
                const response = cartItems.length ? MarketMateBridge.addToCart(cartItems) : {ok: true, added: 0, skipped: 0};
                if (!response?.ok) throw new Error(response?.error || i18n.t('marketMateUnavailable'));
                const added = response.added || 0;
                const quantitySum = cartItems.reduce((sum, item) => sum + item.quantity, 0);
                const parts = [];
                if (added) parts.push(i18n.t('toastImportClipboardDone', added, quantitySum.toLocaleString(i18n.locale)));
                if (unmatched.length) parts.push(i18n.t('toastImportClipboardUnmatched', unmatched.length));
                Notifier.toast(parts.length ? parts.join(i18n.t('messageSeparator')) : i18n.t('toastImportClipboardEmpty'), added ? 'success' : 'error');
            } catch (error) {
                Notifier.toast(i18n.t('toastImportClipboardFailed', error?.message || error), 'error');
            }
        }

        getMarketMateRoot() {
            return document.getElementById('mwi-mm2-host')?.shadowRoot || null;
        }

        addButton() {
            if (!CONFIG.isGameSite || !MarketMateBridge.isReady() || !this.panelRoot) return;
            const clearButton = this.panelRoot.querySelector('.mm2-foot button[data-act="clear"]');
            if (!clearButton) return;

            // 面板重绘可能重复触发注入，只保留一个 MST 按钮。
            const buttons = [...this.panelRoot.querySelectorAll('#mst-mmm-import-clipboard')];
            let button = buttons.shift();
            buttons.forEach(duplicate => duplicate.remove());
            if (!button) {
                button = document.createElement('button');
                button.id = 'mst-mmm-import-clipboard';
                button.className = 'fbtn';
                button.type = 'button';
                button.addEventListener('click', event => {
                    // 阻止市场伴侣脚部的事件委托处理 MST 自定义按钮。
                    event.stopPropagation();
                    this.importFromClipboard();
                });
            }
            const label = i18n.t('importClipboard');
            if (button.textContent !== label) button.textContent = label;
            if (button.title !== label) button.title = label;

            // 两个 fbtn 默认都有自动左边距，清除后让它们在右侧相邻排列。
            clearButton.style.marginLeft = '0';
            if (button.nextElementSibling !== clearButton) clearButton.before(button);
        }

        connectPanelObserver() {
            const root = this.getMarketMateRoot();
            // 面板内部重绘由 panelObserver 负责；bodyObserver 只检测宿主是否被替换。
            if (root === this.panelRoot) return;
            this.panelObserver?.disconnect();
            this.panelObserver = null;
            this.panelRoot = root;
            if (!root) return;

            // 市场伴侣会重绘清单脚部，需要在重绘后重新插入按钮。
            this.panelObserver = new MutationObserver(() => this.addButton());
            this.panelObserver.observe(root, {childList: true, subtree: true});
            this.addButton();
        }

        updateButtonText() {
            const button = this.panelRoot?.querySelector('#mst-mmm-import-clipboard');
            if (!button) return;
            button.textContent = i18n.t('importClipboard');
            button.title = i18n.t('importClipboard');
        }

        init() {
            if (!CONFIG.isGameSite) return;
            MarketMateBridge.onReady(() => {
                if (!this.bodyObserver) this.bodyObserver = utils.observeBody(() => this.connectPanelObserver());
            });
            LanguageEvents.subscribe(() => this.updateButtonText());
        }
    }

    const CalculatorHelpPopover = {
        mount({popup, moduleName, title, heading, content}) {
            const titleElement = popup.querySelector('.swal2-title');
            const container = popup.closest('.swal2-container');
            if (!titleElement || !container) return null;

            const prefix = `mst-${moduleName}-help`;
            const popoverId = `${prefix}-popover`;
            const triggerClass = `${prefix}-trigger`;
            const paragraphClass = `${prefix}-popover-paragraph`;
            const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
            const triggerHost = document.createElement('span');
            triggerHost.className = `${prefix}-anchor`;
            TemplateRenderer.render(() => TemplateRenderer.html`
                <button type="button" class=${triggerClass} aria-haspopup="true" aria-expanded="false" aria-controls=${popoverId} title=${title}>
                    <svg aria-hidden="true"><use href=${`${miscSprite}#info`}></use></svg>
                </button>
            `, triggerHost);
            titleElement.appendChild(triggerHost);

            const popover = document.createElement('div');
            popover.id = popoverId;
            popover.className = `${prefix}-popover`;
            popover.setAttribute('role', 'tooltip');
            TemplateRenderer.render(() => TemplateRenderer.html`
                <div class=${`${prefix}-popover-title`}>${heading}</div>
                <div class=${`${prefix}-popover-content`}></div>
            `, popover);
            popover.hidden = true;
            container.appendChild(popover);
            const trigger = triggerHost.querySelector(`.${prefix}-trigger`);
            const contentElement = popover.querySelector(`.${prefix}-popover-content`);
            const renderContent = text => {
                const paragraphs = String(text || '').split(/\n+/).filter(Boolean);
                TemplateRenderer.render(() => TemplateRenderer.html`
                    ${paragraphs.map(paragraph => TemplateRenderer.html`<div class=${paragraphClass}>${paragraph}</div>`)}
                `, contentElement);
            };
            renderContent(content);

            const positionPopover = () => {
                if (popover.hidden) return;
                const viewport = window.visualViewport;
                const viewportLeft = viewport?.offsetLeft || 0;
                const viewportTop = viewport?.offsetTop || 0;
                const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
                const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
                const triggerRect = trigger.getBoundingClientRect();
                const popoverRect = popover.getBoundingClientRect();
                const margin = 8;
                const gap = 6;
                const left = Math.max(
                    viewportLeft + margin,
                    Math.min(triggerRect.left, viewportRight - popoverRect.width - margin)
                );
                const belowTop = triggerRect.bottom + gap;
                const top = belowTop + popoverRect.height <= viewportBottom - margin
                    ? belowTop
                    : Math.max(viewportTop + margin, triggerRect.top - popoverRect.height - gap);
                popover.style.left = `${left}px`;
                popover.style.top = `${top}px`;
            };
            const close = () => {
                popover.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
            };
            const onTriggerClick = event => {
                event.stopPropagation();
                popover.hidden = !popover.hidden;
                trigger.setAttribute('aria-expanded', String(!popover.hidden));
                if (!popover.hidden) positionPopover();
            };
            const onOutsidePointerDown = event => {
                if (!triggerHost.contains(event.target) && !popover.contains(event.target)) close();
            };
            triggerHost.addEventListener('pointerdown', event => event.stopPropagation());
            trigger.addEventListener('click', onTriggerClick);
            document.addEventListener('pointerdown', onOutsidePointerDown);
            window.addEventListener('resize', positionPopover);
            window.visualViewport?.addEventListener('resize', positionPopover);
            window.visualViewport?.addEventListener('scroll', positionPopover);

            return {
                setContent(text) {
                    renderContent(text);
                    positionPopover();
                },
                setError(isError) {
                    popover.classList.toggle(`${prefix}-popover-error`, isError);
                    trigger.classList.toggle(`${prefix}-trigger-error`, isError);
                },
                cleanup() {
                    document.removeEventListener('pointerdown', onOutsidePointerDown);
                    window.removeEventListener('resize', positionPopover);
                    window.visualViewport?.removeEventListener('resize', positionPopover);
                    window.visualViewport?.removeEventListener('scroll', positionPopover);
                    TemplateRenderer.clear(triggerHost);
                    triggerHost.remove();
                    popover.remove();
                }
            };
        }
    };

    class CombatUpgradeCalculatorFeature {
        constructor() {
            this.rows = [];
            this.nextRowId = 0;
            this.popup = null;
            this.helpController = null;
            this.bindController = null;
        }

        getSkillName(skillHrid) {
            return DataHub.getLocalizedGameName('skillNames', skillHrid);
        }

        getSkillIconHref(skillHrid) {
            const sprite = utils.getSpriteUrl('skills') || '/static/media/skills_sprite.3bb4d936.svg';
            return sprite + '#' + utils.substrLastSlash(skillHrid);
        }

        getTrainingTypeMode(skillHrid) {
            if (['/skills/stamina', '/skills/intelligence'].includes(skillHrid)) return 'secondary';
            if (['/skills/ranged', '/skills/magic'].includes(skillHrid)) return 'primary';
            return 'flexible';
        }

        getDefaultPrimarySkillHrid() {
            return ['/skills/melee', '/skills/ranged', '/skills/magic'].reduce((highestHrid, skillHrid) => {
                const highestLevel = Number(CharacterDataService.getCharacterSkill(highestHrid)?.level || 0);
                const currentLevel = Number(CharacterDataService.getCharacterSkill(skillHrid)?.level || 0);
                return currentLevel > highestLevel ? skillHrid : highestHrid;
            });
        }

        getHourlyExperience(row, primaryRate, secondaryRate) {
            if (row.hourlyExperienceOverride != null) {
                return Math.max(0, Number(row.hourlyExperienceOverride) || 0) * 1000;
            }
            if (row.trainingType === 'secondary') return secondaryRate;
            return row.concurrentTraining ? primaryRate : primaryRate + secondaryRate;
        }

        createRow(skillHrid, defaultPrimarySkillHrid = this.getDefaultPrimarySkillHrid()) {
            const current = CharacterDataService.getCharacterSkill(skillHrid) || {level: 0, experience: 0};
            const startLevel = utils.clampLevel(current.level, 0, 199);
            const trainingTypeMode = this.getTrainingTypeMode(skillHrid);
            let trainingType = trainingTypeMode;
            if (trainingTypeMode === 'flexible') {
                trainingType = skillHrid === defaultPrimarySkillHrid ? 'primary' : 'secondary';
            }
            return {
                id: ++this.nextRowId,
                skillHrid,
                startLevel,
                targetLevel: utils.clampLevel(current.level, 1, 200),
                trainingType,
                concurrentTraining: false,
                customStart: false,
                hourlyExperienceOverride: null
            };
        }

        resetState(preserveExperienceOverrides = false) {
            const experienceOverrides = preserveExperienceOverrides
                ? new Map(this.rows.map(row => [row.skillHrid, row.hourlyExperienceOverride]))
                : new Map();
            this.nextRowId = 0;
            const defaultPrimarySkillHrid = this.getDefaultPrimarySkillHrid();
            const defaultSkillHrids = new Set([
                '/skills/stamina',
                '/skills/intelligence',
                '/skills/attack',
                '/skills/defense',
                defaultPrimarySkillHrid
            ]);
            this.rows = CharacterDataService.getCombatSkills()
                .filter(entry => defaultSkillHrids.has(entry.detail.hrid))
                .map(entry => this.createRow(entry.detail.hrid, defaultPrimarySkillHrid));
            this.rows.forEach(row => {
                if (experienceOverrides.has(row.skillHrid)) {
                    row.hourlyExperienceOverride = experienceOverrides.get(row.skillHrid);
                }
            });
        }

        getProfessionGridHtml() {
            return CharacterDataService.getCombatSkills()
                .map(entry => {
                    const skillHrid = entry.detail.hrid;
                    const level = Number(entry.characterSkill?.level || 0);
                    return `<button type="button" class="mst-combat-profession" data-skill-hrid="${utils.escapeHtml(skillHrid)}" title="${utils.escapeHtml(i18n.t('doubleClickToAdd'))}">
                        <svg aria-hidden="true"><use href="${utils.escapeHtml(this.getSkillIconHref(skillHrid))}"></use></svg>
                        <strong>${utils.escapeHtml(this.getSkillName(skillHrid))}</strong>
                        <small>Lv.${level}</small>
                    </button>`;
                })
                .join('');
        }

        getDialogHtml() {
            return `
                <div class="mst-upgrade-calculator mst-combat-upgrade-calculator">
                    <div class="mst-calculator-toolbar">
                        <label>${utils.escapeHtml(i18n.t('primaryXpRate'))}<input data-field="primary-rate" type="number" min="0" step="0.1" inputmode="decimal"></label>
                        <label>${utils.escapeHtml(i18n.t('secondaryXpRate'))}<input data-field="secondary-rate" type="number" min="0" step="0.1" inputmode="decimal"></label>
                        <label>${utils.escapeHtml(i18n.t('optionalEph'))}<input data-field="eph" type="number" min="0" step="0.1" inputmode="decimal"></label>
                        <button type="button" class="mst-calculator-reset">${utils.escapeHtml(i18n.t('resetList'))}</button>
                    </div>
                    <div class="mst-combat-profession-picker">
                        ${this.getProfessionGridHtml()}
                    </div>
                    <div class="mst-calculator-table-wrap">
                        <table class="mst-calculator-table">
                            <thead><tr>
                                <th>${utils.escapeHtml(i18n.t('order'))}</th>
                                <th>${utils.escapeHtml(i18n.t('profession'))}</th>
                                <th>${utils.escapeHtml(i18n.t('currentLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('startLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('targetLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('trainingType'))}</th>
                                <th>${utils.escapeHtml(i18n.t('hourlyExperience'))}</th>
                                <th>${utils.escapeHtml(i18n.t('totalHours'))}</th>
                                <th>${utils.escapeHtml(i18n.t('estimatedUpgradeTime'))}</th>
                                <th data-runs-column hidden>${utils.escapeHtml(i18n.t('totalRuns'))}</th>
                                <th>${utils.escapeHtml(i18n.t('actions'))}</th>
                            </tr></thead>
                            <tbody></tbody>
                            <tfoot><tr>
                                <th colspan="7">${utils.escapeHtml(i18n.t('total'))}</th>
                                <td><span class="mst-combat-total-duration" data-summary="duration" title="0h">0${i18n.t('dayUnit')}</span></td>
                                <td data-summary="time">-</td>
                                <td data-summary="runs" data-runs-column hidden>0</td>
                                <td></td>
                            </tr></tfoot>
                        </table>
                    </div>
                </div>`;
        }

        getSequenceState() {
            const sequenceById = new Map();
            const concurrentAllowedById = new Map();
            const sequenceSkills = new Map();
            let sequence = 0;
            let previousPrimaryIndex = -1;
            for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex++) {
                const row = this.rows[rowIndex];
                const previousRow = this.rows[rowIndex - 1];
                let targetSequence = null;
                if (row.trainingType === 'secondary' && previousRow?.trainingType === 'secondary') {
                    targetSequence = sequenceById.get(previousRow.id);
                } else if (row.trainingType === 'primary') {
                    const firstSecondary = this.rows
                        .slice(previousPrimaryIndex + 1, rowIndex)
                        .find(candidate => candidate.trainingType === 'secondary');
                    targetSequence = firstSecondary ? sequenceById.get(firstSecondary.id) : null;
                }
                const canJoin = targetSequence != null && !sequenceSkills.get(targetSequence)?.has(row.skillHrid);
                concurrentAllowedById.set(row.id, canJoin);
                if (row.concurrentTraining && canJoin) {
                    sequenceById.set(row.id, targetSequence);
                } else {
                    if (row.concurrentTraining && !canJoin) row.concurrentTraining = false;
                    sequence++;
                    sequenceSkills.set(sequence, new Set());
                    sequenceById.set(row.id, sequence);
                }
                sequenceSkills.get(sequenceById.get(row.id)).add(row.skillHrid);
                if (row.trainingType === 'primary') previousPrimaryIndex = rowIndex;
            }
            return {sequenceById, concurrentAllowedById};
        }

        getExperienceState(experience) {
            const maxExperience = CharacterDataService.getLevelExperience(200);
            const safeExperience = Math.min(maxExperience, Math.max(0, Number(experience) || 0));
            let low = 0;
            let high = 200;
            while (low < high) {
                const middle = Math.ceil((low + high) / 2);
                if (CharacterDataService.getLevelExperience(middle) <= safeExperience) low = middle;
                else high = middle - 1;
            }
            return {
                level: low,
                experience: safeExperience,
                percent: CharacterDataService.getLevelExperiencePercent(low, safeExperience)
            };
        }

        getSequenceStartHours(sequence, sequenceDurations) {
            let hours = 0;
            for (let current = 1; current < sequence; current++) {
                const duration = sequenceDurations.get(current);
                if (duration == null) return null;
                hours += duration;
            }
            return hours;
        }

        calculateRequiredHours(requiredExperience, hourlyRate, hasPrimary) {
            if (!hasPrimary) return null;
            if (requiredExperience === 0) return 0;
            if (hourlyRate <= 0) return null;
            return requiredExperience / hourlyRate;
        }

        mergeSequenceDuration(currentDuration, rowDuration) {
            if (currentDuration === undefined) return rowDuration;
            if (currentDuration === null || rowDuration === null) return null;
            return Math.max(currentDuration, rowDuration);
        }

        calculatePlan(primaryRate, secondaryRate) {
            const {sequenceById, concurrentAllowedById} = this.getSequenceState();
            const hasPrimary = this.rows.some(row => row.trainingType === 'primary');
            const sequenceDurations = new Map();
            const previousBySkill = new Map();
            const results = new Map();
            let maxSequence = 0;

            for (const row of this.rows) {
                const sequence = sequenceById.get(row.id);
                const previous = previousBySkill.get(row.skillHrid);
                const actual = CharacterDataService.getCharacterSkill(row.skillHrid) || {level: 0, experience: 0};
                const actualLevel = utils.clampLevel(actual.level, 0, 200);
                const actualExperience = Math.max(
                    CharacterDataService.getLevelExperience(actualLevel),
                    Number(actual.experience) || 0
                );
                const currentExperience = previous?.experience ?? actualExperience;
                const currentState = previous ? this.getExperienceState(currentExperience) : {
                    level: actualLevel,
                    experience: currentExperience,
                    percent: CharacterDataService.getLevelExperiencePercent(actualLevel, currentExperience)
                };
                const isRepeated = Boolean(previous);
                if (isRepeated) row.customStart = false;
                let startLevel = currentState.level;
                let startExperience = currentExperience;
                if (!isRepeated && row.customStart) {
                    startLevel = utils.clampLevel(row.startLevel, 0, 199);
                    startExperience = CharacterDataService.getLevelExperience(startLevel);
                }
                row.startLevel = startLevel;

                const derivedTarget = row.trainingType === 'primary' && row.concurrentTraining;
                const rate = this.getHourlyExperience(row, primaryRate, secondaryRate);
                let targetLevel = null;
                let endState = null;
                let propagatedExperience = currentExperience;
                let hours = null;
                let startHours = null;
                let completionHours = null;
                let spanEndSequence = sequence;

                if (derivedTarget) {
                    spanEndSequence = maxSequence;
                    startHours = this.getSequenceStartHours(sequence, sequenceDurations);
                    completionHours = this.getSequenceStartHours(spanEndSequence + 1, sequenceDurations);
                    if (startHours != null && completionHours != null) {
                        hours = Math.max(0, completionHours - startHours);
                        const calculatedExperience = Math.min(
                            CharacterDataService.getLevelExperience(200),
                            startExperience + rate * hours
                        );
                        endState = this.getExperienceState(calculatedExperience);
                        targetLevel = endState.level;
                        propagatedExperience = Math.max(currentExperience, calculatedExperience);
                    }
                } else {
                    targetLevel = Math.max(startLevel, utils.clampLevel(row.targetLevel, 1, 200));
                    row.targetLevel = targetLevel;
                    const targetExperience = CharacterDataService.getLevelExperience(targetLevel);
                    const requiredExperience = Math.max(0, targetExperience - startExperience);
                    hours = this.calculateRequiredHours(requiredExperience, rate, hasPrimary);
                    const existingDuration = sequenceDurations.get(sequence);
                    sequenceDurations.set(sequence, this.mergeSequenceDuration(existingDuration, hours));
                    maxSequence = Math.max(maxSequence, sequence);
                    startHours = this.getSequenceStartHours(sequence, sequenceDurations);
                    if (startHours != null && hours != null) completionHours = startHours + hours;
                    endState = this.getExperienceState(targetExperience);
                    propagatedExperience = Math.max(currentExperience, targetExperience);
                }

                previousBySkill.set(row.skillHrid, {experience: propagatedExperience});
                results.set(row.id, {
                    row,
                    sequence,
                    derivedTarget,
                    isRepeated,
                    spanEndSequence,
                    currentState,
                    startLevel,
                    startExperience,
                    targetLevel,
                    endState,
                    hours,
                    startHours,
                    completionHours
                });
            }

            let totalHours = 0;
            if (this.rows.length > 0) {
                totalHours = hasPrimary
                    ? this.getSequenceStartHours(maxSequence + 1, sequenceDurations)
                    : null;
            }
            return {results, sequenceById, concurrentAllowedById, sequenceDurations, totalHours, hasPrimary};
        }

        mountHelpPopover(popup) {
            this.helpController?.cleanup();
            this.helpController = CalculatorHelpPopover.mount({
                popup,
                moduleName: 'combat',
                title: i18n.t('combatCalculatorHelpTitle'),
                heading: i18n.t('combatUpgradeCalculator'),
                content: i18n.t('combatCalculatorHelp')
            });
        }

        renderRows() {
            const tbody = this.popup?.querySelector('tbody');
            if (!tbody) return;
            this.rows.forEach(row => {
                const mode = this.getTrainingTypeMode(row.skillHrid);
                if (mode !== 'flexible') row.trainingType = mode;
            });
            const primaryRate = Math.max(0, Number(this.popup?.querySelector('[data-field="primary-rate"]')?.value) || 0) * 1000;
            const secondaryRate = Math.max(0, Number(this.popup?.querySelector('[data-field="secondary-rate"]')?.value) || 0) * 1000;
            const plan = this.calculatePlan(primaryRate, secondaryRate);
            const {sequenceById, concurrentAllowedById} = plan;
            const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
            const levelOptions = [35, 50, 55, 65, 75, 80, 95, 100, 110, 120, 130, 140, 150];
            const startLevelOptionsHtml = levelOptions
                .map(level => `<option value="${level}">${level}</option>`).join('');
            const targetLevelOptionsHtml = [...levelOptions, 200]
                .map(level => `<option value="${level}">${level}</option>`).join('');
            const rowsHtml = this.rows.map((row, rowIndex) => {
                const levelState = plan.results.get(row.id);
                const isDerivedStart = levelState.isRepeated;
                const currentLevel = levelState.currentState.level;
                const currentExperience = levelState.currentState.experience;
                const currentExperiencePercent = CharacterDataService.getLevelExperiencePercent(currentLevel, currentExperience);
                const currentExperiencePercentText = currentExperiencePercent.toLocaleString(i18n.locale, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 0
                });
                const currentLevelTooltip = [
                    `${i18n.t('currentLevel')}: ${currentLevel}`,
                    `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`,
                    `${i18n.t('currentExperience')}: ${Math.floor(currentExperience).toLocaleString(i18n.locale)}`
                ].join('\n');
                const trainingTypeMode = this.getTrainingTypeMode(row.skillHrid);
                const trainingTypeLabel = row.trainingType === 'primary'
                    ? i18n.t('primaryTraining')
                    : i18n.t('secondaryTraining');
                const trainingTypeControl = trainingTypeMode === 'flexible'
                    ? `<label class="mst-training-checkbox"><input data-row-field="trainingType" type="checkbox"${row.trainingType === 'primary' ? ' checked' : ''}><span>${utils.escapeHtml(trainingTypeLabel)}</span></label>`
                    : `<span class="mst-fixed-training">${utils.escapeHtml(trainingTypeLabel)}</span>`;
                const concurrentAllowed = concurrentAllowedById.get(row.id);
                const concurrentControl = `<label class="mst-training-checkbox mst-concurrent-training"><input data-row-field="concurrentTraining" type="checkbox"${row.concurrentTraining ? ' checked' : ''}${concurrentAllowed ? '' : ' disabled'}><span>${utils.escapeHtml(i18n.t('concurrentTraining'))}</span></label>`;
                const inheritedRate = this.getHourlyExperience(row, primaryRate, secondaryRate) / 1000;
                let displayedRate = row.hourlyExperienceOverride;
                if (displayedRate == null) displayedRate = inheritedRate > 0 ? inheritedRate : '';
                const targetCell = levelState.derivedTarget
                    ? `<td data-derived-target-cell><span class="mst-ability-current-level mst-combat-derived-target"><strong data-derived-target-level>${levelState.endState?.level ?? '--'}</strong><small data-derived-target-percent>${levelState.endState ? `${Number(levelState.endState.percent.toFixed(2))}%` : '--'}</small></span></td>`
                    : `<td><div class="mst-target-level-control">
                        <input data-row-field="targetLevel" type="number" min="1" max="200" value="${levelState.targetLevel}" aria-label="${utils.escapeHtml(i18n.t('targetLevel'))}">
                        <select data-target-level-preset aria-label="${utils.escapeHtml(i18n.t('commonTargetLevel'))}">
                            <option value=""></option>
                            ${targetLevelOptionsHtml}
                        </select>
                    </div></td>`;
                return `<tr data-row-id="${row.id}">
                    <td class="mst-sequence-cell" draggable="true" title="${utils.escapeHtml(i18n.t('dragToSort'))}"><svg aria-hidden="true"><use href="${utils.escapeHtml(miscSprite + '#drag_handle')}"></use></svg><span>${sequenceById.get(row.id)}</span></td>
                    <td class="mst-calculator-name"><svg aria-hidden="true"><use href="${utils.escapeHtml(this.getSkillIconHref(row.skillHrid))}"></use></svg><span>${utils.escapeHtml(this.getSkillName(row.skillHrid))}</span></td>
                    <td data-current-level-cell title="${utils.escapeHtml(currentLevelTooltip)}"><span class="mst-ability-current-level"><strong data-current-level-value>${utils.escapeHtml(String(currentLevel))}</strong><small data-current-level-percent>${utils.escapeHtml(`${currentExperiencePercentText}%`)}</small></span></td>
                    <td><div class="mst-combat-start-control">
                        <input data-row-field="customStart" type="checkbox" title="${utils.escapeHtml(i18n.t('customStartLevel'))}" aria-label="${utils.escapeHtml(i18n.t('customStartLevel'))}"${row.customStart ? ' checked' : ''}${isDerivedStart ? ' disabled' : ''}>
                        <div class="mst-target-level-control">
                            <input data-row-field="startLevel" type="number" min="0" max="199" value="${levelState.startLevel}" aria-label="${utils.escapeHtml(i18n.t('startLevel'))}"${row.customStart && !isDerivedStart ? '' : ' disabled'}>
                            <select data-start-level-preset aria-label="${utils.escapeHtml(i18n.t('commonStartLevel'))}"${row.customStart && !isDerivedStart ? '' : ' disabled'}>
                                <option value=""></option>
                                ${startLevelOptionsHtml}
                            </select>
                        </div>
                    </div></td>
                    ${targetCell}
                    <td><div class="mst-combat-training-type"><span class="mst-combat-training-line">${trainingTypeControl}</span>${concurrentControl}</div></td>
                    <td><input data-row-field="hourlyExperienceOverride" type="number" min="0" step="0.1" inputmode="decimal" value="${displayedRate}"></td>
                    <td data-result="hours"><span class="mst-combat-duration-hours">-</span><small class="mst-combat-duration-days"></small></td>
                    <td data-result="estimatedTime">-</td>
                    <td data-result="runs" data-runs-column hidden>-</td>
                    <td><div class="mst-combat-row-actions"><button type="button" class="mst-row-remove" title="${utils.escapeHtml(i18n.t('remove'))}" aria-label="${utils.escapeHtml(i18n.t('remove'))}">&times;</button></div></td>
                </tr>`;
            }).join('');
            TemplateRenderer.renderHtml(rowsHtml, tbody);
            this.recalculate();
        }

        recalculate() {
            if (!this.popup) return;
            const primaryRate = Math.max(0, Number(this.popup.querySelector('[data-field="primary-rate"]')?.value) || 0) * 1000;
            const secondaryRate = Math.max(0, Number(this.popup.querySelector('[data-field="secondary-rate"]')?.value) || 0) * 1000;
            const eph = Math.max(0, Number(this.popup.querySelector('[data-field="eph"]')?.value) || 0);
            const plan = this.calculatePlan(primaryRate, secondaryRate);
            const startedAt = Date.now();
            const missingPrimary = !plan.hasPrimary && this.rows.length > 0;
            this.helpController?.setContent(missingPrimary
                ? `${i18n.t('combatPrimaryRequired')}\n\n${i18n.t('combatCalculatorHelp')}`
                : i18n.t('combatCalculatorHelp'));
            this.helpController?.setError(missingPrimary);

            this.rows.forEach(row => {
                const rowElement = this.popup.querySelector(`[data-row-id="${row.id}"]`);
                if (!rowElement) return;
                const result = plan.results.get(row.id);
                const currentExperiencePercentText = result.currentState.percent.toLocaleString(i18n.locale, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 0
                });
                const currentLevelCell = rowElement.querySelector('[data-current-level-cell]');
                if (currentLevelCell) {
                    currentLevelCell.title = [
                        `${i18n.t('currentLevel')}: ${result.currentState.level}`,
                        `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`,
                        `${i18n.t('currentExperience')}: ${Math.floor(result.currentState.experience).toLocaleString(i18n.locale)}`
                    ].join('\n');
                    currentLevelCell.querySelector('[data-current-level-value]').textContent = String(result.currentState.level);
                    currentLevelCell.querySelector('[data-current-level-percent]').textContent = `${currentExperiencePercentText}%`;
                }
                const startInput = rowElement.querySelector('[data-row-field="startLevel"]');
                if (startInput) startInput.value = String(result.startLevel);
                const targetInput = rowElement.querySelector('[data-row-field="targetLevel"]');
                if (targetInput) targetInput.value = String(result.targetLevel);
                const derivedTargetCell = rowElement.querySelector('[data-derived-target-cell]');
                if (derivedTargetCell) {
                    const targetLevelElement = derivedTargetCell.querySelector('[data-derived-target-level]');
                    const targetPercentElement = derivedTargetCell.querySelector('[data-derived-target-percent]');
                    if (result.endState) {
                        const targetPercentText = result.endState.percent.toLocaleString(i18n.locale, {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 0
                        });
                        targetLevelElement.textContent = String(result.endState.level);
                        targetPercentElement.textContent = `${targetPercentText}%`;
                        derivedTargetCell.title = [
                            `${i18n.t('targetLevel')}: ${result.endState.level}`,
                            `${i18n.t('experiencePercent')}: ${targetPercentText}%`,
                            `${i18n.t('endExperience')}: ${Math.floor(result.endState.experience).toLocaleString(i18n.locale)}`
                        ].join('\n');
                    } else {
                        targetLevelElement.textContent = '--';
                        targetPercentElement.textContent = '--';
                        derivedTargetCell.title = '';
                    }
                }
                const rate = this.getHourlyExperience(row, primaryRate, secondaryRate);
                if (row.hourlyExperienceOverride == null) {
                    const rateInput = rowElement.querySelector('[data-row-field="hourlyExperienceOverride"]');
                    if (rateInput) rateInput.value = rate > 0 ? String(rate / 1000) : '';
                }
                const hoursElement = rowElement.querySelector('[data-result="hours"]');
                hoursElement.querySelector('.mst-combat-duration-hours').textContent = result.hours == null
                    ? '-'
                    : `${Number(result.hours.toFixed(1))}h`;
                hoursElement.querySelector('.mst-combat-duration-days').textContent = result.hours == null
                    ? ''
                    : `${Number((result.hours / 24).toFixed(2))}${i18n.t('dayUnit')}`;
                rowElement.querySelector('[data-result="runs"]').textContent = eph > 0 && result.hours != null ? String(Math.round(result.hours * eph)) : '-';
                const estimatedTimeElement = rowElement.querySelector('[data-result="estimatedTime"]');
                estimatedTimeElement.textContent = result.completionHours == null
                    ? '-'
                    : utils.formatDateTime(startedAt + result.completionHours * 3600000);
                estimatedTimeElement.title = result.startHours == null
                    ? ''
                    : `${i18n.t('estimatedStartTime')}: ${utils.formatDateTime(startedAt + result.startHours * 3600000)}`;
            });

            const finalHours = plan.totalHours;
            const durationElement = this.popup.querySelector('[data-summary="duration"]');
            durationElement.textContent = finalHours == null
                ? '-'
                : `${Number((finalHours / 24).toFixed(2))}${i18n.t('dayUnit')}`;
            durationElement.title = finalHours == null ? '-' : `${Number(finalHours.toFixed(1))}h`;
            const summaryTimeElement = this.popup.querySelector('[data-summary="time"]');
            summaryTimeElement.textContent = finalHours == null ? '-' : utils.formatDateTime(startedAt + finalHours * 3600000);
            summaryTimeElement.title = finalHours == null
                ? ''
                : `${i18n.t('estimatedStartTime')}: ${utils.formatDateTime(startedAt)}`;
            this.popup.querySelector('[data-summary="runs"]').textContent = finalHours == null || eph <= 0 ? '-' : String(Math.round(finalHours * eph));
            this.popup.querySelectorAll('[data-runs-column]').forEach(element => { element.hidden = eph <= 0; });
        }

        bind(popup) {
            this.bindController?.abort();
            this.bindController = new AbortController();
            const listenerOptions = {signal: this.bindController.signal};
            this.popup = popup;
            this.mountHelpPopover(popup);
            this.renderRows();
            popup.querySelector('.mst-calculator-reset').addEventListener('click', () => {
                this.resetState(true);
                this.renderRows();
            }, listenerOptions);
            popup.querySelector('.mst-combat-profession-picker').addEventListener('dblclick', event => {
                const profession = event.target.closest('[data-skill-hrid]');
                const skillHrid = profession?.dataset.skillHrid;
                if (!skillHrid) return;
                this.rows.push(this.createRow(skillHrid));
                this.renderRows();
            }, listenerOptions);
            popup.addEventListener('input', event => {
                if (event.target.matches('.mst-calculator-toolbar input')) this.recalculate();
                const rowElement = event.target.closest('[data-row-id]');
                const field = event.target.dataset.rowField;
                if (!rowElement || !field || ['customStart', 'trainingType', 'concurrentTraining'].includes(field)) return;
                const row = this.rows.find(item => item.id === Number(rowElement.dataset.rowId));
                if (!row) return;
                if (field === 'hourlyExperienceOverride') {
                    row.hourlyExperienceOverride = event.target.value === ''
                        ? null
                        : Math.max(0, Number(event.target.value) || 0);
                    this.recalculate();
                    return;
                }
                if (['startLevel', 'targetLevel'].includes(field)) {
                    if (event.target.value !== '') row[field] = Number(event.target.value);
                    return;
                }
                row[field] = Number(event.target.value);
                this.recalculate();
            }, listenerOptions);
            popup.addEventListener('change', event => {
                const rowElement = event.target.closest('[data-row-id]');
                if (!rowElement) return;
                const row = this.rows.find(item => item.id === Number(rowElement.dataset.rowId));
                if (!row) return;
                if (event.target.dataset.rowField === 'customStart') {
                    row.customStart = event.target.checked;
                    this.renderRows();
                    return;
                }
                if (['startLevel', 'targetLevel'].includes(event.target.dataset.rowField)) {
                    const field = event.target.dataset.rowField;
                    if (event.target.value !== '') row[field] = Number(event.target.value);
                    this.recalculate();
                    return;
                }
                if (event.target.matches('[data-start-level-preset]')) {
                    if (!event.target.value) return;
                    row.startLevel = Number(event.target.value);
                    rowElement.querySelector('[data-row-field="startLevel"]').value = event.target.value;
                    event.target.value = '';
                    this.recalculate();
                    return;
                }
                if (event.target.matches('[data-target-level-preset]')) {
                    if (!event.target.value) return;
                    row.targetLevel = Number(event.target.value);
                    rowElement.querySelector('[data-row-field="targetLevel"]').value = event.target.value;
                    event.target.value = '';
                    this.recalculate();
                    return;
                }
                if (event.target.dataset.rowField === 'trainingType') {
                    row.trainingType = event.target.checked ? 'primary' : 'secondary';
                    row.concurrentTraining = false;
                    this.renderRows();
                    return;
                }
                if (event.target.dataset.rowField === 'concurrentTraining') {
                    row.concurrentTraining = event.target.checked;
                    this.renderRows();
                }
            }, listenerOptions);
            popup.addEventListener('click', event => {
                const removeButton = event.target.closest('.mst-row-remove');
                if (!removeButton) return;
                const rowId = Number(removeButton.closest('[data-row-id]')?.dataset.rowId);
                this.rows = this.rows.filter(row => row.id !== rowId);
                this.renderRows();
            }, listenerOptions);

            const tbody = popup.querySelector('tbody');
            let draggedRowId = 0;
            tbody.addEventListener('dragstart', event => {
                const dragHandle = event.target.closest('.mst-sequence-cell[draggable="true"]');
                const rowElement = dragHandle?.closest('[data-row-id]');
                if (!dragHandle || !rowElement) {
                    event.preventDefault();
                    return;
                }
                draggedRowId = Number(rowElement.dataset.rowId);
                rowElement.classList.add('mst-row-dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(draggedRowId));
            }, listenerOptions);
            tbody.addEventListener('dragover', event => {
                if (!draggedRowId || !event.target.closest('[data-row-id]')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            }, listenerOptions);
            tbody.addEventListener('drop', event => {
                const targetElement = event.target.closest('[data-row-id]');
                if (!draggedRowId || !targetElement) return;
                event.preventDefault();
                const sourceIndex = this.rows.findIndex(row => row.id === draggedRowId);
                const targetId = Number(targetElement.dataset.rowId);
                let insertIndex = this.rows.findIndex(row => row.id === targetId);
                if (sourceIndex < 0 || insertIndex < 0 || sourceIndex === insertIndex) return;
                const insertAfter = event.clientY > targetElement.getBoundingClientRect().top + targetElement.offsetHeight / 2;
                const [movedRow] = this.rows.splice(sourceIndex, 1);
                if (sourceIndex < insertIndex) insertIndex--;
                if (insertAfter) insertIndex++;
                this.rows.splice(insertIndex, 0, movedRow);
                draggedRowId = 0;
                this.renderRows();
            }, listenerOptions);
            tbody.addEventListener('dragend', () => {
                draggedRowId = 0;
                tbody.querySelectorAll('.mst-row-dragging').forEach(row => row.classList.remove('mst-row-dragging'));
            }, listenerOptions);
        }

        refreshLanguage() {
            const popup = this.popup;
            if (!popup?.isConnected) return;
            const values = Object.fromEntries(
                ['primary-rate', 'secondary-rate', 'eph'].map(field => [
                    field,
                    popup.querySelector(`[data-field="${field}"]`)?.value || ''
                ])
            );
            const oldTable = popup.querySelector('.mst-calculator-table-wrap');
            const scrollPosition = {top: oldTable?.scrollTop || 0, left: oldTable?.scrollLeft || 0};
            const contentRoot = popup.querySelector('.swal2-html-container > div');
            if (!contentRoot) return;
            TemplateRenderer.renderHtml(() => this.getDialogHtml(), contentRoot);
            const title = popup.querySelector('.swal2-title');
            if (title) title.textContent = i18n.t('combatUpgradeCalculator');
            this.bind(popup);
            Object.entries(values).forEach(([field, value]) => {
                const input = popup.querySelector(`[data-field="${field}"]`);
                if (input) input.value = value;
            });
            this.recalculate();
            const table = popup.querySelector('.mst-calculator-table-wrap');
            if (table) {
                table.scrollTop = scrollPosition.top;
                table.scrollLeft = scrollPosition.left;
            }
        }

        open() {
            if (!DataHub.getClientData()?.levelExperienceTable || !CharacterDataService.getCombatSkills().length) {
                return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
            }
            this.resetState();
            return Notifier.html({
                title: i18n.t('combatUpgradeCalculator'),
                html: this.getDialogHtml(),
                width: 'min(56rem, calc(100vw - 1rem))',
                popupClass: 'mst-upgrade-calculator-dialog',
                didOpen: popup => this.bind(popup),
                willClose: () => {
                    this.bindController?.abort();
                    this.bindController = null;
                    this.helpController?.cleanup();
                    this.helpController = null;
                    this.popup = null;
                }
            });
        }

        init() {
            LanguageEvents.subscribe(() => this.refreshLanguage());
        }
    }

    class AbilityUpgradeCalculatorFeature {
        constructor(marketService) {
            this.marketService = marketService;
            this.popup = null;
            this.rows = [];
            this.nextRowId = 0;
            this.lastClickedAbilityHrid = '';
            this.helpController = null;
            this.bindController = null;
            this.marketMateReadyPopup = null;
        }

        getAbilityNames(abilityHrid) {
            return {
                zh: DataHub.getLocalizedGameName('abilityNames', abilityHrid, 'zh'),
                en: DataHub.getLocalizedGameName('abilityNames', abilityHrid, 'en')
            };
        }

        getAbilityRows() {
            return CharacterDataService.getAbilityBooks().map(({book, ability}) => ({
                abilityHrid: book.abilityBookDetail.abilityHrid,
                book,
                ability,
                characterAbility: CharacterDataService.getCharacterAbility(book.abilityBookDetail.abilityHrid),
                names: this.getAbilityNames(book.abilityBookDetail.abilityHrid)
            }));
        }

        getPresetGroups() {
            // 技能及顺序同步自 mwi-tool/resources 下各职业的 equipmentPlan 配置。
            return [
                {
                    label: i18n.t('meleePresets'),
                    presets: [
                        {
                            key: 'sword',
                            label: i18n.t('swordPreset'),
                            abilities: ['/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/crippling_slash', '/abilities/maim']
                        },
                        {
                            key: 'spear',
                            label: i18n.t('spearPreset'),
                            abilities: ['/abilities/speed_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_strike', '/abilities/puncture']
                        },
                        {
                            key: 'hammer',
                            label: i18n.t('hammerPreset'),
                            abilities: ['/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/fracturing_impact', '/abilities/sweep']
                        },
                        {
                            key: 'shield',
                            label: i18n.t('shieldSoloPreset'),
                            abilities: ['/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution', '/abilities/toughness', '/abilities/shield_bash']
                        },
                        {
                            key: 'shield_party',
                            label: i18n.t('shieldPartyPreset'),
                            abilities: ['/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution', '/abilities/toughness', '/abilities/provoke']
                        }
                    ]
                },
                {
                    label: i18n.t('rangedPresets'),
                    presets: [
                        {
                            key: 'bow',
                            label: i18n.t('bowPreset'),
                            abilities: ['/abilities/critical_aura', '/abilities/berserk', '/abilities/pestilent_shot', '/abilities/penetrating_shot', '/abilities/rain_of_arrows']
                        },
                        {
                            key: 'crossbow',
                            label: i18n.t('crossbowPreset'),
                            abilities: ['/abilities/critical_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_shot', '/abilities/rain_of_arrows']
                        }
                    ]
                },
                {
                    label: i18n.t('magicPresets'),
                    presets: [
                        {
                            key: 'water_magic',
                            label: i18n.t('waterMagicPreset'),
                            abilities: ['/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/frost_surge', '/abilities/mana_spring', '/abilities/water_strike']
                        },
                        {
                            key: 'fire_magic',
                            label: i18n.t('fireMagicPreset'),
                            abilities: ['/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/firestorm', '/abilities/flame_blast', '/abilities/fireball']
                        },
                        {
                            key: 'nature_magic',
                            label: i18n.t('natureMagicPreset'),
                            abilities: ['/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/toxic_pollen', '/abilities/natures_veil', '/abilities/entangle']
                        }
                    ]
                }
            ];
        }

        getPresetOptionsHtml() {
            return this.getPresetGroups().map(group => `
                <optgroup label="${utils.escapeHtml(group.label)}">
                    ${group.presets.map(preset => `<option value="${utils.escapeHtml(preset.key)}">${utils.escapeHtml(preset.label)}</option>`).join('')}
                </optgroup>`).join('');
        }

        getLevelPresetOptionsHtml() {
            return ['11111', '35555', '46666', '47777', '57777', '58888', '68888', '69999']
                .map(code => `<option value="${code}">${code.split('').map(level => Number(level) * 10).join('/')}</option>`)
                .join('');
        }

        applyLevelPreset(code) {
            if (!/^[1-9]{5}$/.test(code)) return;
            const levels = code.split('').map(level => Number(level) * 10);
            this.rows.slice(0, 5).forEach((row, index) => {
                row.targetLevel = levels[index];
            });
            this.renderRows();
        }

        createRow(abilityHrid) {
            const current = CharacterDataService.getCharacterAbility(abilityHrid) || {level: 0, experience: 0};
            return {
                id: ++this.nextRowId,
                abilityHrid,
                customStart: false,
                startLevel: utils.clampLevel(current.level, 0, 199),
                targetLevel: Math.min(200, Math.max(1, Number(current.level) || 1)),
                purchaseBooks: 0
            };
        }

        addAbility(abilityHrid, shouldRender = true) {
            if (!CharacterDataService.getAbilityBook(abilityHrid) || this.rows.some(row => row.abilityHrid === abilityHrid)) {
                return false;
            }
            this.rows.push(this.createRow(abilityHrid));
            if (shouldRender) {
                this.renderRows();
                this.renderOptions(this.popup?.querySelector('.mst-ability-search')?.value || '');
            }
            return true;
        }

        resetRows(shouldRender = true) {
            this.rows = [];
            this.nextRowId = 0;
            if (!shouldRender) return;
            this.renderRows();
            this.renderOptions(this.popup?.querySelector('.mst-ability-search')?.value || '');
        }

        addPreset(presetKey) {
            const preset = this.getPresetGroups().flatMap(group => group.presets).find(item => item.key === presetKey);
            if (!preset) return;
            this.resetRows(false);
            preset.abilities.forEach(abilityHrid => this.addAbility(abilityHrid, false));
            this.renderRows();
            this.renderOptions(this.popup?.querySelector('.mst-ability-search')?.value || '');
        }

        getDialogHtml() {
            const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
            return `
                <div class="mst-upgrade-calculator mst-ability-upgrade-calculator">
                    <div class="mst-ability-toolbar">
                        <div class="mst-ability-preset-controls">
                            <select class="mst-ability-preset-select" aria-label="${utils.escapeHtml(i18n.t('abilityPreset'))}">
                                <option value="">${utils.escapeHtml(i18n.t('abilityPreset'))}</option>
                                ${this.getPresetOptionsHtml()}
                            </select>
                            <select class="mst-ability-level-preset-select" aria-label="${utils.escapeHtml(i18n.t('abilityLevelPreset'))}">
                                <option value="">${utils.escapeHtml(i18n.t('abilityLevelPreset'))}</option>
                                ${this.getLevelPresetOptionsHtml()}
                            </select>
                            <button type="button" class="mst-ability-add-button">
                                <svg aria-hidden="true"><use href="${utils.escapeHtml(miscSprite + '#skills')}"></use></svg>
                                <span>${utils.escapeHtml(i18n.t('addAbility'))}</span>
                            </button>
                            <button type="button" class="mst-ability-reset-data">${utils.escapeHtml(i18n.t('clearList'))}</button>
                        </div>
                        <span class="mst-ability-market-time"><small>${utils.escapeHtml(i18n.t('marketDataTime'))}</small><strong data-value="marketTime">-</strong></span>
                    </div>
                    <div class="mst-calculator-table-wrap mst-ability-table-wrap">
                        <table class="mst-calculator-table mst-ability-table">
                            <thead><tr>
                                <th>${utils.escapeHtml(i18n.t('ability'))}</th>
                                <th>${utils.escapeHtml(i18n.t('currentLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('customStartAndLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('targetLevel'))}</th>
                                <th>${utils.escapeHtml(i18n.t('experiencePerBook'))}</th>
                                <th>${utils.escapeHtml(i18n.t('requiredBooks'))}</th>
                                <th>${utils.escapeHtml(i18n.t('askPriceAndTotal'))}</th>
                                <th>${utils.escapeHtml(i18n.t('bidPriceAndTotal'))}</th>
                                <th>${utils.escapeHtml(i18n.t('actions'))}</th>
                            </tr></thead>
                            <tbody></tbody>
                            <tfoot><tr>
                                <th colspan="5">${utils.escapeHtml(i18n.t('total'))}</th>
                                <td data-total="books">0.0</td>
                                <td data-total="ask">0</td>
                                <td data-total="bid">0</td>
                                <td></td>
                            </tr></tfoot>
                        </table>
                    </div>
                    <div class="mst-ability-picker" hidden>
                        <div class="mst-ability-picker-panel">
                            <input class="mst-ability-search" type="search" placeholder="${utils.escapeHtml(i18n.t('searchAbility'))}" autocomplete="off">
                            <div class="mst-ability-options"></div>
                            <button type="button" class="mst-ability-picker-close">${utils.escapeHtml(i18n.t('close'))}</button>
                        </div>
                    </div>
                </div>`;
        }

        getAbilityIconHref(abilityHrid) {
            const sprite = utils.getSpriteUrl('abilities') || '/static/media/abilities_sprite.fdd1b4de.svg';
            return sprite + '#' + utils.substrLastSlash(abilityHrid);
        }

        renderOptions(query = '') {
            const container = this.popup?.querySelector('.mst-ability-options');
            if (!container) return;
            const scrollTop = container.scrollTop;
            const keyword = String(query || '').trim().toLowerCase();
            const selected = new Set(this.rows.map(row => row.abilityHrid));
            const rows = this.getAbilityRows().filter(row => {
                const haystack = [row.names.zh, row.names.en, row.abilityHrid, row.book.hrid].join('\n').toLowerCase();
                return !keyword || haystack.includes(keyword);
            });
            const optionsHtml = rows.length ? rows.map(row => {
                const currentName = i18n.pick(row.names);
                const levelBadge = row.characterAbility
                    ? `<span class="mst-ability-level-badge">Lv.${utils.escapeHtml(String(row.characterAbility.level || 0))}</span>`
                    : '';
                const isSelected = selected.has(row.abilityHrid);
                return `
                    <button type="button" class="mst-ability-option${isSelected ? ' mst-ability-option-selected' : ''}" data-ability-hrid="${utils.escapeHtml(row.abilityHrid)}" title="${utils.escapeHtml(currentName)}"${isSelected ? ' disabled' : ''}>
                        ${levelBadge}
                        <svg aria-hidden="true"><use href="${utils.escapeHtml(this.getAbilityIconHref(row.abilityHrid))}"></use></svg>
                        <strong>${utils.escapeHtml(currentName)}</strong>
                    </button>`;
            }).join('') : `<div class="mst-calculator-empty">${utils.escapeHtml(i18n.t('noAbilityMatch'))}</div>`;
            TemplateRenderer.renderHtml(optionsHtml, container);
            container.scrollTop = scrollTop;
        }

        setPickerOpen(isOpen) {
            if (!this.popup) return;
            const picker = this.popup.querySelector('.mst-ability-picker');
            const calculator = this.popup.querySelector('.mst-ability-upgrade-calculator');
            picker.hidden = !isOpen;
            calculator.classList.toggle('mst-ability-picker-open', isOpen);
            if (!isOpen) return;
            const search = this.popup.querySelector('.mst-ability-search');
            search.value = '';
            this.renderOptions();
            this.popup.querySelector('.mst-ability-options').scrollTop = 0;
            search.focus();
        }

        renderRows() {
            const tbody = this.popup?.querySelector('tbody');
            if (!tbody) return;
            const cartButtonHtml = MarketMateBridge.isReady()
                ? `<button type="button" class="mst-ability-row-cart" title="${utils.escapeHtml(i18n.t('addAbilityBooksToCart'))}" aria-label="${utils.escapeHtml(i18n.t('addAbilityBooksToCart'))}">
                    <svg class="mst-ability-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.6"></circle><circle cx="19" cy="21" r="1.6"></circle><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"></path></svg>
                </button>`
                : '';
            const startLevelOptionsHtml = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150]
                .map(level => `<option value="${level}">${level}</option>`).join('');
            const targetLevelOptionsHtml = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200]
                .map(level => `<option value="${level}">${level}</option>`).join('');
            const rowsHtml = this.rows.length ? this.rows.map(row => {
                const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
                const names = this.getAbilityNames(row.abilityHrid);
                const currentName = i18n.pick(names);
                const currentLevel = Number(current.level || 0);
                const currentExperience = Number(current.experience || 0);
                const currentExperiencePercent = CharacterDataService.getLevelExperiencePercent(currentLevel, currentExperience);
                const currentExperiencePercentText = currentExperiencePercent.toLocaleString(i18n.locale, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 0
                });
                const currentLevelTooltip = [
                    `${i18n.t('currentLevel')}: ${currentLevel}`,
                    `${i18n.t('experiencePercent')}: ${currentExperiencePercentText}%`,
                    `${i18n.t('currentExperience')}: ${Math.floor(currentExperience).toLocaleString(i18n.locale)}`
                ].join('\n');
                return `<tr data-row-id="${row.id}">
                    <td class="mst-calculator-name"><div class="mst-ability-name-cell" title="${utils.escapeHtml(currentName)}"><button type="button" class="mst-ability-market-link" title="${utils.escapeHtml(i18n.t('openMarket'))}" aria-label="${utils.escapeHtml(i18n.t('openMarket'))}"><svg aria-hidden="true"><use href="${utils.escapeHtml(this.getAbilityIconHref(row.abilityHrid))}"></use></svg></button><span>${utils.escapeHtml(currentName)}</span></div></td>
                    <td title="${utils.escapeHtml(currentLevelTooltip)}"><span class="mst-ability-current-level"><strong>${utils.escapeHtml(String(currentLevel))}</strong><small>${utils.escapeHtml(`${currentExperiencePercentText}%`)}</small></span></td>
                    <td><div class="mst-ability-start-control">
                        <input data-row-field="customStart" type="checkbox" title="${utils.escapeHtml(i18n.t('customStartLevel'))}" aria-label="${utils.escapeHtml(i18n.t('customStartLevel'))}"${row.customStart ? ' checked' : ''}>
                        <div class="mst-target-level-control">
                            <input data-row-field="startLevel" type="number" min="0" max="199" value="${row.startLevel}"${row.customStart ? '' : ' disabled'} aria-label="${utils.escapeHtml(i18n.t('startLevel'))}">
                            <select data-start-level-preset aria-label="${utils.escapeHtml(i18n.t('commonStartLevel'))}"${row.customStart ? '' : ' disabled'}>
                                <option value=""></option>
                                ${startLevelOptionsHtml}
                            </select>
                        </div>
                    </div></td>
                    <td><div class="mst-target-level-control">
                        <input data-row-field="targetLevel" type="number" min="1" max="200" value="${row.targetLevel}" aria-label="${utils.escapeHtml(i18n.t('targetLevel'))}">
                        <select data-target-level-preset aria-label="${utils.escapeHtml(i18n.t('commonTargetLevel'))}">
                            <option value=""></option>
                            ${targetLevelOptionsHtml}
                        </select>
                    </div></td>
                    <td data-value="bookExperience">-</td>
                    <td data-result="requiredBooks">-</td>
                    <td><div class="mst-ability-price-values"><span data-value="askPrice">-</span><i>/</i><strong data-result="askTotal">-</strong></div></td>
                    <td><div class="mst-ability-price-values"><span data-value="bidPrice">-</span><i>/</i><strong data-result="bidTotal">-</strong></div></td>
                    <td><div class="mst-ability-row-actions">
                        ${cartButtonHtml}
                        <button type="button" class="mst-ability-row-reset" title="${utils.escapeHtml(i18n.t('resetActualLevel'))}" aria-label="${utils.escapeHtml(i18n.t('resetActualLevel'))}">↺</button>
                        <button type="button" class="mst-row-remove" title="${utils.escapeHtml(i18n.t('remove'))}" aria-label="${utils.escapeHtml(i18n.t('remove'))}">&times;</button>
                    </div></td>
                </tr>`;
            }).join('') : `<tr><td colspan="9" class="mst-calculator-empty">${utils.escapeHtml(i18n.t('noAbilitiesSelected'))}</td></tr>`;
            TemplateRenderer.renderHtml(rowsHtml, tbody);
            this.recalculate();
        }

        recalculate() {
            if (!this.popup) return;
            let totalBooks = 0;
            let totalAsk = 0;
            let totalBid = 0;
            let hasAllAskPrices = true;
            let hasAllBidPrices = true;

            this.rows.forEach(row => {
                const rowElement = this.popup.querySelector(`[data-row-id="${row.id}"]`);
                const book = CharacterDataService.getAbilityBook(row.abilityHrid);
                if (!rowElement || !book) return;
                const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0, experience: 0};
                const startLevel = row.customStart
                    ? utils.clampLevel(row.startLevel, 0, 199)
                    : utils.clampLevel(current.level, 0, 199);
                const targetLevel = utils.clampLevel(row.targetLevel, 1, 200);
                row.startLevel = startLevel;
                row.targetLevel = targetLevel;
                rowElement.querySelector('[data-row-field="startLevel"]').value = String(startLevel);
                rowElement.querySelector('[data-row-field="targetLevel"]').value = String(targetLevel);

                const startExperience = row.customStart
                    ? CharacterDataService.getLevelExperience(startLevel)
                    : Number(current.experience || 0);
                const requiredExperience = Math.max(0, CharacterDataService.getLevelExperience(targetLevel) - startExperience);
                const experienceGain = Number(book.abilityBookDetail.experienceGain || 0);
                const rawBooks = experienceGain > 0 ? requiredExperience / experienceGain + (startLevel === 0 ? 1 : 0) : 0;
                const requiredBooks = Math.ceil(rawBooks * 10) / 10;
                const purchaseBooks = Math.ceil(requiredBooks);
                row.purchaseBooks = purchaseBooks;
                const marketRow = this.marketService.getMarketRow(book.hrid, 0);
                const ask = Number(marketRow?.a) > 0 ? Number(marketRow.a) : 0;
                const bid = Number(marketRow?.b) > 0 ? Number(marketRow.b) : 0;

                rowElement.querySelector('[data-value="bookExperience"]').textContent = utils.formatCompactNumber(experienceGain);
                rowElement.querySelector('[data-value="askPrice"]').textContent = ask ? utils.formatCompactNumber(ask) : i18n.t('marketPriceUnavailable');
                rowElement.querySelector('[data-value="bidPrice"]').textContent = bid ? utils.formatCompactNumber(bid) : i18n.t('marketPriceUnavailable');
                rowElement.querySelector('[data-result="requiredBooks"]').textContent = requiredBooks.toFixed(1);
                rowElement.querySelector('[data-result="askTotal"]').textContent = ask ? utils.formatCompactNumber(ask * purchaseBooks) : '-';
                rowElement.querySelector('[data-result="bidTotal"]').textContent = bid ? utils.formatCompactNumber(bid * purchaseBooks) : '-';

                totalBooks += requiredBooks;
                if (purchaseBooks > 0 && !ask) hasAllAskPrices = false;
                else totalAsk += ask * purchaseBooks;
                if (purchaseBooks > 0 && !bid) hasAllBidPrices = false;
                else totalBid += bid * purchaseBooks;
            });

            this.popup.querySelector('[data-total="books"]').textContent = totalBooks.toFixed(1);
            this.popup.querySelector('[data-total="ask"]').textContent = hasAllAskPrices ? utils.formatCompactNumber(totalAsk) : '-';
            this.popup.querySelector('[data-total="bid"]').textContent = hasAllBidPrices ? utils.formatCompactNumber(totalBid) : '-';
        }

        openAbilityBookMarket(row) {
            const book = CharacterDataService.getAbilityBook(row.abilityHrid);
            if (!book) return;
            Swal.close();
            setTimeout(() => {
                if (!GameNavigationService.openMarketplace(book.hrid, 0)) {
                    Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
                }
            }, 50);
        }

        addAbilityBooksToCart(row) {
            const book = CharacterDataService.getAbilityBook(row.abilityHrid);
            const quantity = Number(row.purchaseBooks || 0);
            if (!book || quantity <= 0) {
                Notifier.toast(i18n.t('noAbilityBooksNeeded'), 'info');
                return;
            }
            if (!MarketMateBridge.isReady()) {
                Notifier.toast(i18n.t('marketMateUnavailable'), 'warning');
                return;
            }
            const bookName = DataHub.resolveItemName(book.hrid);
            const response = MarketMateBridge.addToCart({
                itemId: book.hrid,
                name: bookName,
                iconRef: book.hrid,
                quantity,
                source: 'mst_ability'
            });
            if (!response?.ok) {
                Notifier.toast(response?.error || i18n.t('marketMateUnavailable'), 'error');
                return;
            }
            Notifier.toast(i18n.t('abilityBooksAddedToCart', quantity.toLocaleString(i18n.locale), bookName), 'success');
        }

        bind(popup) {
            this.bindController?.abort();
            this.bindController = new AbortController();
            const listenerOptions = {signal: this.bindController.signal};
            this.popup = popup;
            this.helpController?.cleanup();
            this.helpController = CalculatorHelpPopover.mount({
                popup,
                moduleName: 'ability',
                title: i18n.t('abilityCalculatorHelpTitle'),
                heading: i18n.t('abilityUpgradeCalculator'),
                content: i18n.t('abilityCalculatorHelp')
            });
            popup.querySelector('[data-value="marketTime"]').textContent = this.marketService.getUpdatedText();
            this.renderRows();
            popup.querySelector('.mst-ability-add-button').addEventListener('click', () => this.setPickerOpen(true), listenerOptions);
            popup.querySelector('.mst-ability-picker-close').addEventListener('click', () => this.setPickerOpen(false), listenerOptions);
            popup.querySelector('.mst-ability-search').addEventListener('input', event => this.renderOptions(event.target.value), listenerOptions);
            popup.querySelector('.mst-ability-options').addEventListener('click', event => {
                const option = event.target.closest('[data-ability-hrid]');
                if (option) this.addAbility(option.dataset.abilityHrid);
            }, listenerOptions);
            const presetSelect = popup.querySelector('.mst-ability-preset-select');
            presetSelect.addEventListener('change', () => {
                if (!presetSelect.value) return;
                this.addPreset(presetSelect.value);
                presetSelect.value = '';
            }, listenerOptions);
            const levelPresetSelect = popup.querySelector('.mst-ability-level-preset-select');
            levelPresetSelect.addEventListener('change', () => {
                if (!levelPresetSelect.value) return;
                this.applyLevelPreset(levelPresetSelect.value);
                levelPresetSelect.value = '';
            }, listenerOptions);
            popup.querySelector('.mst-ability-reset-data').addEventListener('click', () => this.resetRows(), listenerOptions);
            if (this.marketMateReadyPopup !== popup) {
                this.marketMateReadyPopup = popup;
                MarketMateBridge.onReady(() => {
                    if (this.popup === popup && popup.isConnected) this.renderRows();
                });
            }
            popup.addEventListener('input', event => {
                const rowElement = event.target.closest('[data-row-id]');
                const field = event.target.dataset.rowField;
                if (!rowElement || !['startLevel', 'targetLevel'].includes(field)) return;
                const row = this.rows.find(item => item.id === Number(rowElement.dataset.rowId));
                if (!row) return;
                row[field] = Number(event.target.value);
                this.recalculate();
            }, listenerOptions);
            popup.addEventListener('change', event => {
                const rowElement = event.target.closest('[data-row-id]');
                const row = this.rows.find(item => item.id === Number(rowElement?.dataset.rowId));
                if (!row) return;
                if (event.target.matches('[data-start-level-preset]')) {
                    if (!event.target.value) return;
                    row.startLevel = Number(event.target.value);
                    rowElement.querySelector('[data-row-field="startLevel"]').value = event.target.value;
                    event.target.value = '';
                    this.recalculate();
                    return;
                }
                if (event.target.matches('[data-target-level-preset]')) {
                    if (!event.target.value) return;
                    row.targetLevel = Number(event.target.value);
                    rowElement.querySelector('[data-row-field="targetLevel"]').value = event.target.value;
                    event.target.value = '';
                    this.recalculate();
                    return;
                }
                if (event.target.dataset.rowField !== 'customStart') return;
                row.customStart = event.target.checked;
                if (!row.customStart) {
                    const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
                    row.startLevel = utils.clampLevel(current.level, 0, 199);
                }
                this.renderRows();
            }, listenerOptions);
            popup.addEventListener('click', event => {
                const rowElement = event.target.closest('[data-row-id]');
                const row = this.rows.find(item => item.id === Number(rowElement?.dataset.rowId));
                if (!row) return;
                if (event.target.closest('.mst-row-remove')) {
                    this.rows = this.rows.filter(item => item.id !== row.id);
                    this.renderRows();
                    this.renderOptions(popup.querySelector('.mst-ability-search')?.value || '');
                    return;
                }
                if (event.target.closest('.mst-ability-row-reset')) {
                    const current = CharacterDataService.getCharacterAbility(row.abilityHrid) || {level: 0};
                    row.customStart = false;
                    row.startLevel = utils.clampLevel(current.level, 0, 199);
                    this.renderRows();
                    return;
                }
                if (event.target.closest('.mst-ability-market-link')) {
                    this.openAbilityBookMarket(row);
                    return;
                }
                if (event.target.closest('.mst-ability-row-cart')) this.addAbilityBooksToCart(row);
            }, listenerOptions);
        }

        refreshLanguage() {
            const popup = this.popup;
            if (!popup?.isConnected) return;
            const calculator = popup.querySelector('.mst-ability-upgrade-calculator');
            const pickerOpen = calculator?.classList.contains('mst-ability-picker-open') || false;
            const query = popup.querySelector('.mst-ability-search')?.value || '';
            const oldTable = popup.querySelector('.mst-ability-table-wrap');
            const oldOptions = popup.querySelector('.mst-ability-options');
            const scrollPosition = {
                tableTop: oldTable?.scrollTop || 0,
                tableLeft: oldTable?.scrollLeft || 0,
                optionsTop: oldOptions?.scrollTop || 0
            };
            const contentRoot = popup.querySelector('.swal2-html-container > div');
            if (!contentRoot) return;
            TemplateRenderer.renderHtml(() => this.getDialogHtml(), contentRoot);
            const title = popup.querySelector('.swal2-title');
            if (title) title.textContent = i18n.t('abilityUpgradeCalculator');
            this.bind(popup);
            if (pickerOpen) {
                const picker = popup.querySelector('.mst-ability-picker');
                const refreshedCalculator = popup.querySelector('.mst-ability-upgrade-calculator');
                const search = popup.querySelector('.mst-ability-search');
                if (picker) picker.hidden = false;
                refreshedCalculator?.classList.add('mst-ability-picker-open');
                if (search) search.value = query;
                this.renderOptions(query);
                const options = popup.querySelector('.mst-ability-options');
                if (options) options.scrollTop = scrollPosition.optionsTop;
            }
            const table = popup.querySelector('.mst-ability-table-wrap');
            if (table) {
                table.scrollTop = scrollPosition.tableTop;
                table.scrollLeft = scrollPosition.tableLeft;
            }
        }

        async open(initialAbilityHrid = '') {
            if (!DataHub.getClientData()?.levelExperienceTable || !this.getAbilityRows().length) {
                return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
            }
            try {
                await this.marketService.load();
            } catch (error) {
                console.warn('[MST] 技能升级计算器市场数据加载失败:', error);
            }
            this.rows = [];
            this.nextRowId = 0;
            if (initialAbilityHrid) this.addAbility(initialAbilityHrid, false);
            return Notifier.html({
                title: i18n.t('abilityUpgradeCalculator'),
                html: this.getDialogHtml(),
                width: 'min(51rem, calc(100vw - 1rem))',
                popupClass: 'mst-upgrade-calculator-dialog',
                didOpen: popup => this.bind(popup),
                willClose: () => {
                    this.bindController?.abort();
                    this.bindController = null;
                    this.marketMateReadyPopup = null;
                    this.helpController?.cleanup();
                    this.helpController = null;
                    this.popup = null;
                }
            });
        }

        mountSkillPageButton() {
            const panel = document.querySelector('[class*="AbilitiesPanel_abilitiesPanel"]');
            if (!panel) return null;
            if (panel.querySelector('.mst-ability-calculator-trigger')) return panel;
            const title = panel.querySelector('[class*="AbilitiesPanel_title"]');
            if (!title) return panel;
            const container = document.createElement('div');
            container.className = 'mst-ability-calculator-button-container';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = utils.getGameButtonClass() + ' mst-ability-calculator-trigger';
            button.textContent = i18n.t('upgradeCalculator');
            button.addEventListener('click', () => this.open());
            container.appendChild(button);
            title.insertAdjacentElement('afterend', container);
            return panel;
        }

        bindLearnedAbilityClicks(panel) {
            if (!panel || panel.dataset.mstAbilityCalculatorBound) return;
            panel.dataset.mstAbilityCalculatorBound = '1';
            panel.addEventListener('click', event => {
                const ability = event.target.closest('[class*="Ability_ability"]');
                if (!ability || !panel.contains(ability)) return;
                const grids = [...panel.querySelectorAll('[class*="AbilitiesPanel_abilityGrid"]')];
                if (ability.closest('[class*="AbilitiesPanel_abilityGrid"]') !== grids.at(-1)) {
                    this.lastClickedAbilityHrid = '';
                    return;
                }
                const href = utils.getSvgUseHref(ability.querySelector('svg use'));
                const iconId = href.includes('#') ? href.split('#').pop() : '';
                this.lastClickedAbilityHrid = iconId ? '/abilities/' + iconId : '';
            }, true);
        }

        mountAbilityActionMenuButton() {
            const menu = document.querySelector('[class*="Ability_actionMenu"]');
            if (!menu || !this.lastClickedAbilityHrid) return;
            const reference = menu.querySelector('button');
            const abilityHrid = this.lastClickedAbilityHrid;
            let calculatorButton = menu.querySelector('.mst-ability-action-calculator');
            if (!calculatorButton) {
                calculatorButton = document.createElement('button');
                calculatorButton.type = 'button';
                calculatorButton.className = (reference?.className || utils.getGameButtonClass()) + ' mst-ability-action-calculator';
                calculatorButton.textContent = i18n.t('upgradeCalculator');
                calculatorButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.open(abilityHrid);
                });
                menu.appendChild(calculatorButton);
            }

            if (!menu.querySelector('.mst-ability-action-market')) {
                const marketButton = document.createElement('button');
                marketButton.type = 'button';
                marketButton.className = (reference?.className || utils.getGameButtonClass()) + ' mst-ability-action-market';
                marketButton.textContent = i18n.t('openMarket');
                marketButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const book = CharacterDataService.getAbilityBook(abilityHrid);
                    if (!book || !GameNavigationService.openMarketplace(book.hrid, 0)) {
                        Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
                    }
                });
                calculatorButton.before(marketButton);
            }
        }

        init() {
            if (!CONFIG.isGameSite) return;
            this.observer = utils.observeBody(() => {
                this.bindLearnedAbilityClicks(this.mountSkillPageButton());
                this.mountAbilityActionMenuButton();
            });
            LanguageEvents.subscribe(() => {
                document.querySelectorAll('.mst-ability-calculator-trigger, .mst-ability-action-calculator').forEach(button => {
                    button.textContent = i18n.t('upgradeCalculator');
                });
                document.querySelectorAll('.mst-ability-action-market').forEach(button => {
                    button.textContent = i18n.t('openMarket');
                });
                this.refreshLanguage();
            });
        }
    }

    class DungeonProfitCalculatorFeature {
        constructor(marketService) {
            this.marketService = marketService;
            this.service = new DungeonProfitCalculatorService(marketService);
            this.popup = null;
            this.root = null;
            this.helpController = null;
            this.state = null;
        }

        resetState() {
            const dungeons = this.service.getDungeons();
            const defaultDungeon = dungeons.find(action => action.hrid === '/actions/combat/pirate_cove') || dungeons[0];
            const characterDropQuantityPercent = this.service.getCharacterDropQuantity() * 100;
            const characterDropRatePercent = this.service.getCharacterDropRate() * 100;
            this.state = {
                actionHrid: defaultDungeon?.hrid || '',
                difficultyTier: 0,
                clearMinutes: '14',
                dailyHours: '24',
                periodDays: '1',
                partySize: String(this.service.getCharacterPartySize()),
                useCharacterDropQuantity: true,
                manualDropQuantityPercent: String(Math.round(characterDropQuantityPercent * 100) / 100),
                useCharacterDropRate: true,
                manualDropRatePercent: String(Math.round(characterDropRatePercent * 100) / 100),
                costMode: 'materials',
                useArtisanTea: false,
                guzzlingLevel: '10',
                applyMarketTax: true,
                ticketMode: 'shares'
            };
        }

        getDungeonName(action) {
            return DataHub.getLocalizedGameName('actionNames', action?.hrid) || action?.name || action?.hrid || '-';
        }

        formatCount(value) {
            const number = Number(value || 0);
            return Number.isFinite(number)
                ? number.toLocaleString(i18n.locale, {minimumFractionDigits: 0, maximumFractionDigits: 2})
                : '-';
        }

        formatMoney(value) {
            const number = Number(value || 0);
            return Number.isFinite(number) ? utils.formatCompactNumber(number, 2) : '-';
        }

        getBuffPercent(useCharacterField, manualField, getCharacterValue) {
            return this.state[useCharacterField]
                ? getCharacterValue.call(this.service) * 100
                : Math.max(0, Number(this.state[manualField]) || 0);
        }

        updateNumber(field, value) {
            this.state[field] = value;
            this.render();
        }

        getResultRows(result) {
            const rows = [
                {
                    key: 'entryTicketCost',
                    quantity: result.ticketQuantity,
                    conservative: result.ticketCostConservative,
                    optimistic: result.ticketCostOptimistic,
                    type: 'cost'
                },
                {
                    key: 'chestOpeningCost',
                    quantity: result.totalChestQuantity,
                    conservative: result.openingCostConservative,
                    optimistic: result.openingCostOptimistic,
                    type: 'cost'
                },
                {
                    key: 'normalChestRevenue',
                    quantity: result.normalQuantity,
                    conservative: result.normalRevenueConservative,
                    optimistic: result.normalRevenueOptimistic,
                    type: 'revenue'
                },
                {
                    key: 'refinementChestRevenue',
                    quantity: result.refinementQuantity,
                    conservative: result.refinementRevenueConservative,
                    optimistic: result.refinementRevenueOptimistic,
                    type: 'revenue'
                },
                {
                    key: 'totalChestRevenue',
                    quantity: result.totalChestQuantity,
                    conservative: result.totalRevenueConservative,
                    optimistic: result.totalRevenueOptimistic,
                    type: 'total'
                },
                {
                    key: 'netProfit',
                    quantity: null,
                    conservative: result.profitConservative,
                    optimistic: result.profitOptimistic,
                    type: 'profit'
                },
                {
                    key: 'profitPerChestShare',
                    quantity: null,
                    conservative: result.profitPerChestConservative,
                    optimistic: result.profitPerChestOptimistic,
                    type: 'profit'
                },
                {
                    key: 'profitPerClear',
                    quantity: null,
                    conservative: result.profitPerClearConservative,
                    optimistic: result.profitPerClearOptimistic,
                    type: 'profit'
                }
            ];
            if (result.periodDays !== 1) {
                rows.splice(6, 0, {
                    label: i18n.t('periodNetProfit', this.formatCount(result.periodDays)),
                    quantity: null,
                    conservative: result.periodProfitConservative,
                    optimistic: result.periodProfitOptimistic,
                    type: 'profit'
                });
            }
            return rows;
        }

        renderSummary(result) {
            const cards = [
                ['actualClears', result.clears],
                ['ticketRequired', result.ticketQuantity],
                ['normalChestShares', result.normalQuantity],
                ['refinementChestShares', result.refinementQuantity]
            ];
            return TemplateRenderer.html`
                <div class="mst-dungeon-summary">
                    ${cards.map(([key, value]) => TemplateRenderer.html`
                        <div class="mst-dungeon-summary-item">
                            <small>${i18n.t(key)}</small>
                            <strong>${this.formatCount(value)}</strong>
                        </div>
                    `)}
                </div>
            `;
        }

        renderMarketMeta(result) {
            const ticketName = DataHub.resolveItemName(result.ticketHrid);
            const ticketPrice = i18n.t(
                'priceAskBid',
                this.formatMoney(result.ticketPrices.ask),
                this.formatMoney(result.ticketPrices.bid)
            );
            return TemplateRenderer.html`
                <div class="mst-dungeon-market-meta">
                    <span>
                        <small>${i18n.t('ticketUnitPrice')}</small>
                        <strong title=${ticketName}>${ticketPrice}</strong>
                    </span>
                    ${result.openingKeys.map(key => TemplateRenderer.html`
                        <span>
                            <small>${i18n.t('keyUnitPrice')}</small>
                            <strong title=${DataHub.resolveItemName(key.itemHrid)}>
                                ${i18n.t('priceAskBid', this.formatMoney(key.ask), this.formatMoney(key.bid))}
                            </strong>
                        </span>
                    `)}
                    ${result.costMode === 'materials' ? TemplateRenderer.html`
                        <span>
                            <small>${i18n.t('materialConsumption')}</small>
                            <strong>${this.formatCount(result.materialMultiplier * 100)}%</strong>
                        </span>
                    ` : TemplateRenderer.empty}
                    <span class="mst-dungeon-market-time">
                        <small>${i18n.t('marketDataTime')}</small>
                        <strong>${this.marketService.getUpdatedText()}</strong>
                    </span>
                </div>
            `;
        }

        renderResult(result) {
            if (!result) {
                return TemplateRenderer.html`<div class="mst-dungeon-empty">${i18n.t('invalidDungeonInput')}</div>`;
            }
            const rows = this.getResultRows(result);
            return TemplateRenderer.html`
                ${this.renderSummary(result)}
                ${this.renderMarketMeta(result)}
                ${result.missingPrices.length ? TemplateRenderer.html`
                    <div class="mst-dungeon-warning">${i18n.t('missingMarketPrices', result.missingPrices.length)}</div>
                ` : TemplateRenderer.empty}
                <div class="mst-dungeon-table-wrap">
                    <table class="mst-dungeon-table">
                        <thead>
                            <tr>
                                <th>${i18n.t('resultItem')}</th>
                                <th>${i18n.t('quantity')}</th>
                                <th>${i18n.t('conservative')}</th>
                                <th>${i18n.t('optimistic')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(row => TemplateRenderer.html`
                                <tr class=${`mst-dungeon-row-${row.type}`}>
                                    <th scope="row">${row.label || i18n.t(row.key)}</th>
                                    <td>${row.quantity == null ? '-' : this.formatCount(row.quantity)}</td>
                                    <td>${this.formatMoney(row.conservative)}</td>
                                    <td>${this.formatMoney(row.optimistic)}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `;
        }

        render() {
            if (!this.root || !this.state) return;
            const dungeons = this.service.getDungeons();
            const dropQuantityPercent = this.getBuffPercent(
                'useCharacterDropQuantity',
                'manualDropQuantityPercent',
                this.service.getCharacterDropQuantity
            );
            const dropRatePercent = this.getBuffPercent(
                'useCharacterDropRate',
                'manualDropRatePercent',
                this.service.getCharacterDropRate
            );
            const result = this.service.calculate({
                actionHrid: this.state.actionHrid,
                difficultyTier: this.state.difficultyTier,
                clearMinutes: this.state.clearMinutes,
                dailyHours: this.state.dailyHours,
                periodDays: this.state.periodDays,
                partySize: this.state.partySize,
                dropQuantity: dropQuantityPercent / 100,
                dropRate: dropRatePercent / 100,
                ticketMode: this.state.ticketMode,
                costMode: this.state.costMode,
                useArtisanTea: this.state.useArtisanTea,
                guzzlingLevel: this.state.guzzlingLevel,
                applyMarketTax: this.state.applyMarketTax
            });
            TemplateRenderer.render(() => TemplateRenderer.html`
                <div class="mst-upgrade-calculator mst-dungeon-calculator">
                    <div class="mst-dungeon-toolbar">
                        <label class="mst-dungeon-field mst-dungeon-field-wide">
                            <span>${i18n.t('dungeon')}</span>
                            <select .value=${this.state.actionHrid} @change=${event => {
                                this.state.actionHrid = event.target.value;
                                this.render();
                            }}>
                                ${dungeons.map(action => TemplateRenderer.html`
                                    <option value=${action.hrid} .selected=${action.hrid === this.state.actionHrid}>${this.getDungeonName(action)}</option>
                                `)}
                            </select>
                        </label>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('difficultyTier')}</span>
                            <select .value=${String(this.state.difficultyTier)} @change=${event => {
                                this.state.difficultyTier = Number(event.target.value);
                                this.render();
                            }}>
                                ${[0, 1, 2].map(tier => TemplateRenderer.html`
                                    <option value=${String(tier)} .selected=${tier === this.state.difficultyTier}>T${tier}</option>
                                `)}
                            </select>
                        </label>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('clearTimeMinutes')}</span>
                            <input type="number" min="0.1" step="0.1" .value=${this.state.clearMinutes}
                                @input=${event => this.updateNumber('clearMinutes', event.target.value)}>
                        </label>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('dailyRuntimeHours')}</span>
                            <input type="number" min="0.1" max="24" step="0.1" .value=${this.state.dailyHours}
                                @input=${event => this.updateNumber('dailyHours', event.target.value)}>
                        </label>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('periodDays')}</span>
                            <input type="number" min="0.1" step="0.1" list="mst-dungeon-period-options" .value=${this.state.periodDays}
                                @input=${event => this.updateNumber('periodDays', event.target.value)}>
                            <datalist id="mst-dungeon-period-options">
                                ${[1, 3, 7, 14].map(days => TemplateRenderer.html`<option value=${String(days)}></option>`)}
                            </datalist>
                        </label>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('partySize')}</span>
                            <select .value=${this.state.partySize} @change=${event => {
                                this.state.partySize = event.target.value;
                                this.render();
                            }}>
                                ${[1, 2, 3, 4, 5].map(size => TemplateRenderer.html`
                                    <option value=${String(size)} .selected=${String(size) === this.state.partySize}>${size}</option>
                                `)}
                            </select>
                        </label>
                        <div class="mst-dungeon-field mst-dungeon-buff-field">
                            <span>${i18n.t('combatDropQuantity')}</span>
                            <input type="number" min="0" step="0.01" .value=${String(Math.round(dropQuantityPercent * 100) / 100)}
                                .disabled=${this.state.useCharacterDropQuantity}
                                @input=${event => this.updateNumber('manualDropQuantityPercent', event.target.value)}>
                            <label class="mst-dungeon-auto-buff">
                                <input type="checkbox" .checked=${this.state.useCharacterDropQuantity} @change=${event => {
                                    if (!event.target.checked) this.state.manualDropQuantityPercent = String(Math.round(dropQuantityPercent * 100) / 100);
                                    this.state.useCharacterDropQuantity = event.target.checked;
                                    this.render();
                                }}>
                                <span>${i18n.t('useCharacterBuff')}</span>
                            </label>
                        </div>
                        <div class="mst-dungeon-field mst-dungeon-buff-field">
                            <span>${i18n.t('combatDropRate')}</span>
                            <input type="number" min="0" step="0.01" .value=${String(Math.round(dropRatePercent * 100) / 100)}
                                .disabled=${this.state.useCharacterDropRate}
                                @input=${event => this.updateNumber('manualDropRatePercent', event.target.value)}>
                            <label class="mst-dungeon-auto-buff">
                                <input type="checkbox" .checked=${this.state.useCharacterDropRate} @change=${event => {
                                    if (!event.target.checked) this.state.manualDropRatePercent = String(Math.round(dropRatePercent * 100) / 100);
                                    this.state.useCharacterDropRate = event.target.checked;
                                    this.render();
                                }}>
                                <span>${i18n.t('useCharacterBuff')}</span>
                            </label>
                        </div>
                        <label class="mst-dungeon-field mst-dungeon-field-wide">
                            <span>${i18n.t('costCalculationMode')}</span>
                            <select .value=${this.state.costMode} @change=${event => {
                                this.state.costMode = event.target.value;
                                this.render();
                            }}>
                                <option value="materials" .selected=${this.state.costMode === 'materials'}>${i18n.t('costByMaterials')}</option>
                                <option value="market" .selected=${this.state.costMode === 'market'}>${i18n.t('costByMarket')}</option>
                            </select>
                        </label>
                        <div class="mst-dungeon-field mst-dungeon-toggle-field">
                            <label class="mst-dungeon-auto-buff">
                                <input type="checkbox" .checked=${this.state.useArtisanTea}
                                    .disabled=${this.state.costMode !== 'materials'} @change=${event => {
                                    this.state.useArtisanTea = event.target.checked;
                                    this.render();
                                }}>
                                <span>${i18n.t('artisanTea')}</span>
                            </label>
                        </div>
                        <label class="mst-dungeon-field">
                            <span>${i18n.t('guzzlingLevel')}</span>
                            <select .value=${this.state.guzzlingLevel}
                                .disabled=${this.state.costMode !== 'materials' || !this.state.useArtisanTea} @change=${event => {
                                this.state.guzzlingLevel = event.target.value;
                                this.render();
                            }}>
                                ${Array.from({length: 21}, (_, level) => TemplateRenderer.html`
                                    <option value=${String(level)} .selected=${String(level) === this.state.guzzlingLevel}>+${level}</option>
                                `)}
                            </select>
                        </label>
                        <div class="mst-dungeon-field mst-dungeon-toggle-field">
                            <label class="mst-dungeon-auto-buff">
                                <input type="checkbox" .checked=${this.state.applyMarketTax} @change=${event => {
                                    this.state.applyMarketTax = event.target.checked;
                                    this.render();
                                }}>
                                <span>${i18n.t('applyMarketTax')}</span>
                            </label>
                        </div>
                        <label class="mst-dungeon-field mst-dungeon-field-wide">
                            <span>${i18n.t('ticketCalculationMode')}</span>
                            <select .value=${this.state.ticketMode} @change=${event => {
                                this.state.ticketMode = event.target.value;
                                this.render();
                            }}>
                                <option value="clears" .selected=${this.state.ticketMode === 'clears'}>${i18n.t('ticketByActualClears')}</option>
                                <option value="shares" .selected=${this.state.ticketMode === 'shares'}>${i18n.t('ticketByRewardShares')}</option>
                            </select>
                        </label>
                    </div>
                    <div class="mst-dungeon-results">${this.renderResult(result)}</div>
                </div>
            `, this.root);
        }

        refreshLanguage() {
            if (!this.popup?.isConnected) return;
            const title = this.popup.querySelector('.swal2-title');
            if (title) title.textContent = i18n.t('dungeonProfitCalculator');
            this.helpController?.setContent(i18n.t('dungeonCalculatorHelp'));
            this.render();
        }

        async open() {
            if (!this.service.getDungeons().length) return Notifier.alert(i18n.t('noDungeonData'), 'warning');
            try {
                await this.marketService.load();
            } catch (error) {
                console.warn('[MST] 地下城收益计算器市场数据加载失败:', error);
            }
            this.resetState();
            return Notifier.html({
                title: i18n.t('dungeonProfitCalculator'),
                html: () => TemplateRenderer.html`<div id="mst-dungeon-calculator-root"></div>`,
                width: 'min(52rem, calc(100vw - 1rem))',
                popupClass: 'mst-upgrade-calculator-dialog mst-dungeon-dialog',
                didOpen: popup => {
                    this.popup = popup;
                    this.root = popup.querySelector('#mst-dungeon-calculator-root');
                    this.render();
                    this.helpController = CalculatorHelpPopover.mount({
                        popup,
                        moduleName: 'dungeon',
                        title: i18n.t('dungeonCalculatorHelpTitle'),
                        heading: i18n.t('dungeonProfitCalculator'),
                        content: i18n.t('dungeonCalculatorHelp')
                    });
                },
                willClose: () => {
                    this.helpController?.cleanup();
                    this.helpController = null;
                    this.root = null;
                    this.popup = null;
                }
            });
        }

        init() {
            LanguageEvents.subscribe(() => this.refreshLanguage());
            const refreshCharacterBuff = () => {
                const usesCharacterData = this.state?.useCharacterDropQuantity || this.state?.useCharacterDropRate;
                if (usesCharacterData && this.popup?.isConnected) this.render();
            };
            window.addEventListener('mst:data:character-ready', refreshCharacterBuff);
            window.addEventListener('mst:data:character-updated', refreshCharacterBuff);
        }
    }

    // 战斗计算核心迁移自 MWICombatSimulatorTest，仅保留装备 DPS 对比实际使用的模块。
    // 此函数会被完整序列化到 Web Worker；内部保持上游结构，业务代码统一从 CombatSimulationService 调用。
    function mstCombatWorkerRuntime() {
        (() => {
            var __defProp = Object.defineProperty;
            var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {
                enumerable: true,
                configurable: true,
                writable: true,
                value: value
            }) : obj[key] = value;
            var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
            var CombatUtilities = class _CombatUtilities {
                static getTarget(enemies) {
                    if (!enemies) {
                        return null;
                    }
                    let target = enemies.find(enemy => enemy.combatDetails.currentHitpoints > 0);
                    return target ?? null;
                }
                static randomInt(min, max) {
                    if (max < min) {
                        let temp = min;
                        min = max;
                        max = temp;
                    }
                    let minCeil = Math.ceil(min);
                    let maxFloor = Math.floor(max);
                    if (Math.floor(min) == maxFloor) {
                        return Math.floor((min + max) / 2 + Math.random());
                    }
                    let minTail = -1 * (min - minCeil);
                    let maxTail = max - maxFloor;
                    let balancedWeight = 2 * minTail + (maxFloor - minCeil);
                    let balancedAverage = (maxFloor + minCeil) / 2;
                    let average = (max + min) / 2;
                    let extraTailWeight = balancedWeight * (average - balancedAverage) / (maxFloor + 1 - average);
                    let extraTailChance = Math.abs(extraTailWeight / (extraTailWeight + balancedWeight));
                    if (Math.random() < extraTailChance) {
                        if (maxTail > minTail) {
                            return Math.floor(maxFloor + 1);
                        } else {
                            return Math.floor(minCeil - 1);
                        }
                    }
                    if (maxTail > minTail) {
                        return Math.floor(min + Math.random() * (maxFloor + minTail - min + 1));
                    } else {
                        return Math.floor(minCeil - maxTail + Math.random() * (max - (minCeil - maxTail) + 1));
                    }
                }
                static processAttack(source, target, abilityEffect = null) {
                    let combatStyle = abilityEffect ? abilityEffect.combatStyleHrid : source.combatDetails.combatStats.combatStyleHrid;
                    let damageType = abilityEffect ? abilityEffect.damageType : source.combatDetails.combatStats.damageType;
                    let sourceAccuracyRating = 1;
                    let sourceAutoAttackMaxDamage = 1;
                    let targetEvasionRating = 1;
                    switch (combatStyle) {
                      case "/combat_styles/stab":
                        sourceAccuracyRating = source.combatDetails.stabAccuracyRating;
                        sourceAutoAttackMaxDamage = source.combatDetails.stabMaxDamage;
                        targetEvasionRating = target.combatDetails.stabEvasionRating;
                        break;
        
                      case "/combat_styles/slash":
                        sourceAccuracyRating = source.combatDetails.slashAccuracyRating;
                        sourceAutoAttackMaxDamage = source.combatDetails.slashMaxDamage;
                        targetEvasionRating = target.combatDetails.slashEvasionRating;
                        break;
        
                      case "/combat_styles/smash":
                        sourceAccuracyRating = source.combatDetails.smashAccuracyRating;
                        sourceAutoAttackMaxDamage = source.combatDetails.smashMaxDamage;
                        targetEvasionRating = target.combatDetails.smashEvasionRating;
                        break;
        
                      case "/combat_styles/ranged":
                        sourceAccuracyRating = source.combatDetails.rangedAccuracyRating;
                        sourceAutoAttackMaxDamage = source.combatDetails.rangedMaxDamage;
                        targetEvasionRating = target.combatDetails.rangedEvasionRating;
                        break;
        
                      case "/combat_styles/magic":
                        sourceAccuracyRating = source.combatDetails.magicAccuracyRating;
                        sourceAutoAttackMaxDamage = source.combatDetails.magicMaxDamage;
                        targetEvasionRating = target.combatDetails.magicEvasionRating;
                        break;
        
                      default:
                        throw new Error("Unknown combat style: " + combatStyle);
                    }
                    let sourceDamageMultiplier = 1;
                    let sourceResistance = 0;
                    let sourcePenetration = 0;
                    let targetResistance = 0;
                    let targetThornPower = 0;
                    let targetPenetration = 0;
                    let thornType;
                    switch (damageType) {
                      case "/damage_types/physical":
                        sourceDamageMultiplier = 1 + source.combatDetails.combatStats.physicalAmplify;
                        sourceResistance = source.combatDetails.totalArmor;
                        sourcePenetration = source.combatDetails.combatStats.armorPenetration;
                        targetResistance = target.combatDetails.totalArmor;
                        targetThornPower = target.combatDetails.combatStats.physicalThorns;
                        targetPenetration = target.combatDetails.combatStats.armorPenetration;
                        thornType = "physicalThorns";
                        break;
        
                      case "/damage_types/water":
                        sourceDamageMultiplier = 1 + source.combatDetails.combatStats.waterAmplify;
                        sourceResistance = source.combatDetails.totalWaterResistance;
                        sourcePenetration = source.combatDetails.combatStats.waterPenetration;
                        targetResistance = target.combatDetails.totalWaterResistance;
                        targetThornPower = target.combatDetails.combatStats.elementalThorns;
                        targetPenetration = target.combatDetails.combatStats.waterPenetration;
                        thornType = "elementalThorns";
                        break;
        
                      case "/damage_types/nature":
                        sourceDamageMultiplier = 1 + source.combatDetails.combatStats.natureAmplify;
                        sourceResistance = source.combatDetails.totalNatureResistance;
                        sourcePenetration = source.combatDetails.combatStats.naturePenetration;
                        targetResistance = target.combatDetails.totalNatureResistance;
                        targetThornPower = target.combatDetails.combatStats.elementalThorns;
                        targetPenetration = target.combatDetails.combatStats.naturePenetration;
                        thornType = "elementalThorns";
                        break;
        
                      case "/damage_types/fire":
                        sourceDamageMultiplier = 1 + source.combatDetails.combatStats.fireAmplify;
                        sourceResistance = source.combatDetails.totalFireResistance;
                        sourcePenetration = source.combatDetails.combatStats.firePenetration;
                        targetResistance = target.combatDetails.totalFireResistance;
                        targetThornPower = target.combatDetails.combatStats.elementalThorns;
                        targetPenetration = target.combatDetails.combatStats.firePenetration;
                        thornType = "elementalThorns";
                        break;
        
                      default:
                        throw new Error("Unknown damage type: " + damageType);
                    }
                    let hitChance = 1;
                    let critChance = 0;
                    let isCrit = false;
                    let bonusCritChance = source.combatDetails.combatStats.criticalRate;
                    let bonusCritDamage = source.combatDetails.combatStats.criticalDamage;
                    if (abilityEffect) {
                        sourceAccuracyRating *= 1 + abilityEffect.bonusAccuracyRatio;
                    }
                    if (source.isWeakened) {
                        sourceAccuracyRating = sourceAccuracyRating - source.weakenPercentage * sourceAccuracyRating;
                    }
                    hitChance = Math.pow(sourceAccuracyRating, 1.4) / (Math.pow(sourceAccuracyRating, 1.4) + Math.pow(targetEvasionRating, 1.4));
                    if (combatStyle == "/combat_styles/ranged") {
                        critChance = .3 * hitChance;
                    }
                    critChance = critChance + bonusCritChance;
                    let baseDamageFlat = abilityEffect ? abilityEffect.damageFlat : 0;
                    let baseDamageRatio = abilityEffect ? abilityEffect.damageRatio : 1;
                    let armorDamageRatioFlat = abilityEffect ? abilityEffect.armorDamageRatio * source.combatDetails.totalArmor : 0;
                    let sourceMinDamage = sourceDamageMultiplier * (1 + baseDamageFlat + armorDamageRatioFlat);
                    let sourceMaxDamage = sourceDamageMultiplier * (baseDamageRatio * sourceAutoAttackMaxDamage + baseDamageFlat + armorDamageRatioFlat);
                    if (Math.random() < critChance) {
                        sourceMaxDamage = sourceMaxDamage * (1 + bonusCritDamage);
                        sourceMinDamage = sourceMaxDamage;
                        isCrit = true;
                    }
                    let damageRoll = _CombatUtilities.randomInt(sourceMinDamage, sourceMaxDamage);
                    damageRoll *= 1 + source.combatDetails.combatStats.taskDamage;
                    damageRoll *= 1 + target.combatDetails.combatStats.damageTaken;
                    if (!abilityEffect) {
                        damageRoll += damageRoll * source.combatDetails.combatStats.autoAttackDamage;
                    } else {
                        damageRoll *= 1 + source.combatDetails.combatStats.abilityDamage;
                    }
                    let damageDone = 0;
                    let thornDamageDone = 0;
                    let didHit = false;
                    if (Math.random() < hitChance) {
                        didHit = true;
                        let penetratedTargetResistance = targetResistance;
                        if (sourcePenetration > 0 && targetResistance > 0) {
                            penetratedTargetResistance = targetResistance / (1 + sourcePenetration);
                        }
                        let targetDamageTakenRatio = 100 / (100 + penetratedTargetResistance);
                        if (penetratedTargetResistance < 0) {
                            targetDamageTakenRatio = (100 - penetratedTargetResistance) / 100;
                        }
                        let mitigatedDamage = Math.ceil(targetDamageTakenRatio * damageRoll);
                        damageDone = Math.min(mitigatedDamage, target.combatDetails.currentHitpoints);
                        target.combatDetails.currentHitpoints -= damageDone;
                    }
                    if (targetThornPower > 0 && targetResistance > -99) {
                        let penetratedSourceResistance = sourceResistance;
                        if (sourceResistance > 0) {
                            penetratedSourceResistance = sourceResistance / (1 + targetPenetration);
                        }
                        let sourceDamageTakenRatio = 100 / (100 + penetratedSourceResistance);
                        if (penetratedSourceResistance < 0) {
                            sourceDamageTakenRatio = (100 - penetratedSourceResistance) / 100;
                        }
                        let targetTaskDamageMultiplier = 1 + target.combatDetails.combatStats.taskDamage;
                        let sourceDamageTakenMultiplier = 1 + source.combatDetails.combatStats.damageTaken;
                        let targetDamageMultiplier = targetTaskDamageMultiplier * sourceDamageTakenMultiplier;
                        let thornsDamageRoll = _CombatUtilities.randomInt(1, targetDamageMultiplier * target.combatDetails.defensiveMaxDamage * (1 + targetResistance / 100) * targetThornPower);
                        let mitigatedThornsDamage = Math.ceil(sourceDamageTakenRatio * thornsDamageRoll);
                        thornDamageDone = Math.min(mitigatedThornsDamage, source.combatDetails.currentHitpoints);
                        source.combatDetails.currentHitpoints -= thornDamageDone;
                    }
                    let retaliationDamageDone = 0;
                    if (target.combatDetails.combatStats.retaliation > 0) {
                        let retaliationHitChance = Math.pow(target.combatDetails.smashAccuracyRating, 1.4) / (Math.pow(target.combatDetails.smashAccuracyRating, 1.4) + Math.pow(source.combatDetails.smashEvasionRating, 1.4));
                        if (retaliationHitChance > Math.random()) {
                            let sourceEffectiveArmor = source.combatDetails.totalArmor;
                            if (sourceEffectiveArmor > 0) {
                                sourceEffectiveArmor = sourceEffectiveArmor / (1 + target.combatDetails.combatStats.armorPenetration);
                            }
                            let sourceDamageTakenRatio = 100 / (100 + sourceEffectiveArmor);
                            if (sourceEffectiveArmor < 0) {
                                sourceDamageTakenRatio = (100 - sourceEffectiveArmor) / 100;
                            }
                            let targetTaskDamageMultiplier = 1 + target.combatDetails.combatStats.taskDamage;
                            let sourceDamageTakenMultiplier = 1 + source.combatDetails.combatStats.damageTaken;
                            let retaliationDamageMultiplier = targetTaskDamageMultiplier * sourceDamageTakenMultiplier;
                            let premitigatedDamage = damageRoll;
                            premitigatedDamage = Math.min(premitigatedDamage, target.combatDetails.defensiveMaxDamage * 5);
                            let retaliationMinDamage = retaliationDamageMultiplier * target.combatDetails.combatStats.retaliation * premitigatedDamage;
                            let retaliationMaxDamage = retaliationDamageMultiplier * target.combatDetails.combatStats.retaliation * (target.combatDetails.defensiveMaxDamage + premitigatedDamage);
                            let retaliationDamageRoll = _CombatUtilities.randomInt(retaliationMinDamage, retaliationMaxDamage);
                            let mitigatedRetaliationDamage = Math.ceil(sourceDamageTakenRatio * retaliationDamageRoll);
                            retaliationDamageDone = Math.min(mitigatedRetaliationDamage, source.combatDetails.currentHitpoints);
                            source.combatDetails.currentHitpoints -= retaliationDamageDone;
                        }
                    }
                    let lifeStealHeal = 0;
                    if (!abilityEffect && didHit && source.combatDetails.combatStats.lifeSteal > 0) {
                        lifeStealHeal = source.addHitpoints(Math.floor(source.combatDetails.combatStats.lifeSteal * damageDone));
                    }
                    let hpDrain = 0;
                    if (abilityEffect && didHit && abilityEffect.hpDrainRatio > 0) {
                        let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
                        hpDrain = source.addHitpoints(Math.floor(abilityEffect.hpDrainRatio * damageDone * healingAmplify));
                    }
                    let manaLeechMana = 0;
                    if (!abilityEffect && didHit && source.combatDetails.combatStats.manaLeech > 0) {
                        manaLeechMana = source.addManapoints(Math.floor(source.combatDetails.combatStats.manaLeech * damageDone));
                    }
                    return {
                        damageDone: damageDone,
                        didHit: didHit,
                        thornDamageDone: thornDamageDone,
                        thornType: thornType,
                        retaliationDamageDone: retaliationDamageDone,
                        lifeStealHeal: lifeStealHeal,
                        hpDrain: hpDrain,
                        manaLeechMana: manaLeechMana,
                        isCrit: isCrit
                    };
                }
                static processHeal(source, abilityEffect, target) {
                    if (abilityEffect.combatStyleHrid != "/combat_styles/magic") {
                        throw new Error("Heal ability effect not supported for combat style: " + abilityEffect.combatStyleHrid);
                    }
                    let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
                    let magicMaxDamage = source.combatDetails.magicMaxDamage;
                    let baseHealFlat = abilityEffect.damageFlat;
                    let baseHealRatio = abilityEffect.damageRatio;
                    let minHeal = healingAmplify * (1 + baseHealFlat);
                    let maxHeal = healingAmplify * (baseHealRatio * magicMaxDamage + baseHealFlat);
                    let heal = this.randomInt(minHeal, maxHeal);
                    let amountHealed = target.addHitpoints(heal);
                    return amountHealed;
                }
                static processRevive(source, abilityEffect, target) {
                    if (abilityEffect.combatStyleHrid != "/combat_styles/magic") {
                        throw new Error("Heal ability effect not supported for combat style: " + abilityEffect.combatStyleHrid);
                    }
                    let healingAmplify = 1 + source.combatDetails.combatStats.healingAmplify;
                    let magicMaxDamage = source.combatDetails.magicMaxDamage;
                    let baseHealFlat = abilityEffect.damageFlat;
                    let baseHealRatio = abilityEffect.damageRatio;
                    let minHeal = healingAmplify * (1 + baseHealFlat);
                    let maxHeal = healingAmplify * (baseHealRatio * magicMaxDamage + baseHealFlat);
                    let heal = this.randomInt(minHeal, maxHeal);
                    let amountHealed = target.addHitpoints(heal);
                    target.combatDetails.currentManapoints = target.combatDetails.maxManapoints;
                    target.clearCCs();
                    return amountHealed;
                }
                static processSpendHp(source, abilityEffect) {
                    let currentHp = source.combatDetails.currentHitpoints;
                    let spendHpRatio = abilityEffect.spendHpRatio;
                    let spentHp = Math.floor(currentHp * spendHpRatio);
                    source.combatDetails.currentHitpoints -= spentHp;
                    return spentHp;
                }
                static calculateTickValue(totalValue, totalTicks, currentTick) {
                    let currentSum = Math.floor(currentTick * totalValue / totalTicks);
                    let previousSum = Math.floor((currentTick - 1) * totalValue / totalTicks);
                    return currentSum - previousSum;
                }
            };
            var combatUtilities_default = CombatUtilities;
            var CombatEvent = class {
                constructor(type, time) {
                    this.type = type;
                    this.time = time;
                }
            };
            var combatEvent_default = CombatEvent;
            var _AutoAttackEvent = class _AutoAttackEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_AutoAttackEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_AutoAttackEvent, "type", "autoAttack");
            var AutoAttackEvent = _AutoAttackEvent;
            var autoAttackEvent_default = AutoAttackEvent;
            var _DamageOverTimeEvent = class _DamageOverTimeEvent extends combatEvent_default {
                constructor(time, sourceRef, target, damage, totalTicks, currentTick, combatStyleHrid) {
                    super(_DamageOverTimeEvent.type, time);
                    this.sourceRef = sourceRef;
                    this.target = target;
                    this.damage = damage;
                    this.totalTicks = totalTicks;
                    this.currentTick = currentTick;
                    this.combatStyleHrid = combatStyleHrid;
                }
            };
            __publicField(_DamageOverTimeEvent, "type", "damageOverTime");
            var DamageOverTimeEvent = _DamageOverTimeEvent;
            var damageOverTimeEvent_default = DamageOverTimeEvent;
            var _CheckBuffExpirationEvent = class _CheckBuffExpirationEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_CheckBuffExpirationEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_CheckBuffExpirationEvent, "type", "checkBuffExpiration");
            var CheckBuffExpirationEvent = _CheckBuffExpirationEvent;
            var checkBuffExpirationEvent_default = CheckBuffExpirationEvent;
            var _CombatStartEvent = class _CombatStartEvent extends combatEvent_default {
                constructor(time) {
                    super(_CombatStartEvent.type, time);
                }
            };
            __publicField(_CombatStartEvent, "type", "combatStart");
            var CombatStartEvent = _CombatStartEvent;
            var combatStartEvent_default = CombatStartEvent;
            var _ConsumableTickEvent = class _ConsumableTickEvent extends combatEvent_default {
                constructor(time, source, consumable, totalTicks, currentTick) {
                    super(_ConsumableTickEvent.type, time);
                    this.source = source;
                    this.consumable = consumable;
                    this.totalTicks = totalTicks;
                    this.currentTick = currentTick;
                }
            };
            __publicField(_ConsumableTickEvent, "type", "consumableTick");
            var ConsumableTickEvent = _ConsumableTickEvent;
            var consumableTickEvent_default = ConsumableTickEvent;
            var _CooldownReadyEvent = class _CooldownReadyEvent extends combatEvent_default {
                constructor(time) {
                    super(_CooldownReadyEvent.type, time);
                }
            };
            __publicField(_CooldownReadyEvent, "type", "cooldownReady");
            var CooldownReadyEvent = _CooldownReadyEvent;
            var cooldownReadyEvent_default = CooldownReadyEvent;
            var _EnemyRespawnEvent = class _EnemyRespawnEvent extends combatEvent_default {
                constructor(time) {
                    super(_EnemyRespawnEvent.type, time);
                }
            };
            __publicField(_EnemyRespawnEvent, "type", "enemyRespawn");
            var EnemyRespawnEvent = _EnemyRespawnEvent;
            var enemyRespawnEvent_default = EnemyRespawnEvent;
            var __generator = function(thisArg, body) {
                var _ = {
                    label: 0,
                    sent: function() {
                        if (t[0] & 1) throw t[1];
                        return t[1];
                    },
                    trys: [],
                    ops: []
                }, f, y, t, g;
                return g = {
                    next: verb(0),
                    throw: verb(1),
                    return: verb(2)
                }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
                    return this;
                }), g;
                function verb(n) {
                    return function(v) {
                        return step([ n, v ]);
                    };
                }
                function step(op) {
                    if (f) throw new TypeError("Generator is already executing.");
                    while (_) try {
                        if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 
                        0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                        if (y = 0, t) op = [ op[0] & 2, t.value ];
                        switch (op[0]) {
                          case 0:
                          case 1:
                            t = op;
                            break;
        
                          case 4:
                            _.label++;
                            return {
                                value: op[1],
                                done: false
                            };
        
                          case 5:
                            _.label++;
                            y = op[1];
                            op = [ 0 ];
                            continue;
        
                          case 7:
                            op = _.ops.pop();
                            _.trys.pop();
                            continue;
        
                          default:
                            if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                                _ = 0;
                                continue;
                            }
                            if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                                _.label = op[1];
                                break;
                            }
                            if (op[0] === 6 && _.label < t[1]) {
                                _.label = t[1];
                                t = op;
                                break;
                            }
                            if (t && _.label < t[2]) {
                                _.label = t[2];
                                _.ops.push(op);
                                break;
                            }
                            if (t[2]) _.ops.pop();
                            _.trys.pop();
                            continue;
                        }
                        op = body.call(thisArg, _);
                    } catch (e) {
                        op = [ 6, e ];
                        y = 0;
                    } finally {
                        f = t = 0;
                    }
                    if (op[0] & 5) throw op[1];
                    return {
                        value: op[0] ? op[1] : void 0,
                        done: true
                    };
                }
            };
            var __read = function(o, n) {
                var m = typeof Symbol === "function" && o[Symbol.iterator];
                if (!m) return o;
                var i = m.call(o), r, ar = [], e;
                try {
                    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
                } catch (error) {
                    e = {
                        error: error
                    };
                } finally {
                    try {
                        if (r && !r.done && (m = i["return"])) m.call(i);
                    } finally {
                        if (e) throw e.error;
                    }
                }
                return ar;
            };
            var __spreadArray = function(to, from, pack) {
                if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
                    if (ar || !(i in from)) {
                        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                        ar[i] = from[i];
                    }
                }
                return to.concat(ar || Array.prototype.slice.call(from));
            };
            var Heap = function() {
                function Heap2(compare) {
                    if (compare === void 0) {
                        compare = Heap2.minComparator;
                    }
                    var _this = this;
                    this.compare = compare;
                    this.heapArray = [];
                    this._limit = 0;
                    this.offer = this.add;
                    this.element = this.peek;
                    this.poll = this.pop;
                    this._invertedCompare = function(a, b) {
                        return -1 * _this.compare(a, b);
                    };
                }
                Heap2.getChildrenIndexOf = function(idx) {
                    return [ idx * 2 + 1, idx * 2 + 2 ];
                };
                Heap2.getParentIndexOf = function(idx) {
                    if (idx <= 0) {
                        return -1;
                    }
                    var whichChildren = idx % 2 ? 1 : 2;
                    return Math.floor((idx - whichChildren) / 2);
                };
                Heap2.getSiblingIndexOf = function(idx) {
                    if (idx <= 0) {
                        return -1;
                    }
                    var whichChildren = idx % 2 ? 1 : -1;
                    return idx + whichChildren;
                };
                Heap2.minComparator = function(a, b) {
                    if (a > b) {
                        return 1;
                    } else if (a < b) {
                        return -1;
                    } else {
                        return 0;
                    }
                };
                Heap2.maxComparator = function(a, b) {
                    if (b > a) {
                        return 1;
                    } else if (b < a) {
                        return -1;
                    } else {
                        return 0;
                    }
                };
                Heap2.minComparatorNumber = function(a, b) {
                    return a - b;
                };
                Heap2.maxComparatorNumber = function(a, b) {
                    return b - a;
                };
                Heap2.defaultIsEqual = function(a, b) {
                    return a === b;
                };
                Heap2.print = function(heap) {
                    function deep(i2) {
                        var pi = Heap2.getParentIndexOf(i2);
                        return Math.floor(Math.log2(pi + 1));
                    }
                    function repeat(str, times) {
                        var out = "";
                        for (;times > 0; --times) {
                            out += str;
                        }
                        return out;
                    }
                    var node = 0;
                    var lines = [];
                    var maxLines = deep(heap.length - 1) + 2;
                    var maxLength = 0;
                    while (node < heap.length) {
                        var i = deep(node) + 1;
                        if (node === 0) {
                            i = 0;
                        }
                        var nodeText = String(heap.get(node));
                        if (nodeText.length > maxLength) {
                            maxLength = nodeText.length;
                        }
                        lines[i] = lines[i] || [];
                        lines[i].push(nodeText);
                        node += 1;
                    }
                    return lines.map(function(line, i2) {
                        var times = Math.pow(2, maxLines - i2) - 1;
                        return repeat(" ", Math.floor(times / 2) * maxLength) + line.map(function(el) {
                            var half = (maxLength - el.length) / 2;
                            return repeat(" ", Math.ceil(half)) + el + repeat(" ", Math.floor(half));
                        }).join(repeat(" ", times * maxLength));
                    }).join("\n");
                };
                Heap2.heapify = function(arr, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = arr;
                    heap.init();
                    return heap;
                };
                Heap2.heappop = function(heapArr, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    return heap.pop();
                };
                Heap2.heappush = function(heapArr, item, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    heap.push(item);
                };
                Heap2.heappushpop = function(heapArr, item, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    return heap.pushpop(item);
                };
                Heap2.heapreplace = function(heapArr, item, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    return heap.replace(item);
                };
                Heap2.heaptop = function(heapArr, n, compare) {
                    if (n === void 0) {
                        n = 1;
                    }
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    return heap.top(n);
                };
                Heap2.heapbottom = function(heapArr, n, compare) {
                    if (n === void 0) {
                        n = 1;
                    }
                    var heap = new Heap2(compare);
                    heap.heapArray = heapArr;
                    return heap.bottom(n);
                };
                Heap2.nlargest = function(n, iterable, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = __spreadArray([], __read(iterable), false);
                    heap.init();
                    return heap.top(n);
                };
                Heap2.nsmallest = function(n, iterable, compare) {
                    var heap = new Heap2(compare);
                    heap.heapArray = __spreadArray([], __read(iterable), false);
                    heap.init();
                    return heap.bottom(n);
                };
                Heap2.prototype.add = function(element) {
                    this._sortNodeUp(this.heapArray.push(element) - 1);
                    this._applyLimit();
                    return true;
                };
                Heap2.prototype.addAll = function(elements) {
                    var _a;
                    var i = this.length;
                    (_a = this.heapArray).push.apply(_a, __spreadArray([], __read(elements), false));
                    for (var l = this.length; i < l; ++i) {
                        this._sortNodeUp(i);
                    }
                    this._applyLimit();
                    return true;
                };
                Heap2.prototype.bottom = function(n) {
                    if (n === void 0) {
                        n = 1;
                    }
                    if (this.heapArray.length === 0 || n <= 0) {
                        return [];
                    } else if (this.heapArray.length === 1) {
                        return [ this.heapArray[0] ];
                    } else if (n >= this.heapArray.length) {
                        return __spreadArray([], __read(this.heapArray), false);
                    } else {
                        var result = this._bottomN_push(~~n);
                        return result;
                    }
                };
                Heap2.prototype.check = function() {
                    var _this = this;
                    return this.heapArray.find(function(el, j) {
                        return !!_this.getChildrenOf(j).find(function(ch) {
                            return _this.compare(el, ch) > 0;
                        });
                    });
                };
                Heap2.prototype.clear = function() {
                    this.heapArray = [];
                };
                Heap2.prototype.clone = function() {
                    var cloned = new Heap2(this.comparator());
                    cloned.heapArray = this.toArray();
                    cloned._limit = this._limit;
                    return cloned;
                };
                Heap2.prototype.comparator = function() {
                    return this.compare;
                };
                Heap2.prototype.contains = function(o, fn) {
                    if (fn === void 0) {
                        fn = Heap2.defaultIsEqual;
                    }
                    return this.heapArray.findIndex(function(el) {
                        return fn(el, o);
                    }) >= 0;
                };
                Heap2.prototype.init = function(array) {
                    if (array) {
                        this.heapArray = __spreadArray([], __read(array), false);
                    }
                    for (var i = Math.floor(this.heapArray.length); i >= 0; --i) {
                        this._sortNodeDown(i);
                    }
                    this._applyLimit();
                };
                Heap2.prototype.isEmpty = function() {
                    return this.length === 0;
                };
                Heap2.prototype.leafs = function() {
                    if (this.heapArray.length === 0) {
                        return [];
                    }
                    var pi = Heap2.getParentIndexOf(this.heapArray.length - 1);
                    return this.heapArray.slice(pi + 1);
                };
                Object.defineProperty(Heap2.prototype, "length", {
                    get: function() {
                        return this.heapArray.length;
                    },
                    enumerable: false,
                    configurable: true
                });
                Object.defineProperty(Heap2.prototype, "limit", {
                    get: function() {
                        return this._limit;
                    },
                    set: function(_l) {
                        this._limit = ~~_l;
                        this._applyLimit();
                    },
                    enumerable: false,
                    configurable: true
                });
                Heap2.prototype.peek = function() {
                    return this.heapArray[0];
                };
                Heap2.prototype.pop = function() {
                    var last = this.heapArray.pop();
                    if (this.length > 0 && last !== void 0) {
                        return this.replace(last);
                    }
                    return last;
                };
                Heap2.prototype.push = function() {
                    var elements = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        elements[_i] = arguments[_i];
                    }
                    if (elements.length < 1) {
                        return false;
                    } else if (elements.length === 1) {
                        return this.add(elements[0]);
                    } else {
                        return this.addAll(elements);
                    }
                };
                Heap2.prototype.pushpop = function(element) {
                    var _a;
                    if (this.compare(this.heapArray[0], element) < 0) {
                        _a = __read([ this.heapArray[0], element ], 2), element = _a[0], this.heapArray[0] = _a[1];
                        this._sortNodeDown(0);
                    }
                    return element;
                };
                Heap2.prototype.remove = function(o, fn) {
                    if (fn === void 0) {
                        fn = Heap2.defaultIsEqual;
                    }
                    if (this.length > 0) {
                        if (o === void 0) {
                            this.pop();
                            return true;
                        } else {
                            var idx = this.heapArray.findIndex(function(el) {
                                return fn(el, o);
                            });
                            if (idx >= 0) {
                                if (idx === 0) {
                                    this.pop();
                                } else if (idx === this.length - 1) {
                                    this.heapArray.pop();
                                } else {
                                    this.heapArray.splice(idx, 1, this.heapArray.pop());
                                    this._sortNodeUp(idx);
                                    this._sortNodeDown(idx);
                                }
                                return true;
                            }
                        }
                    }
                    return false;
                };
                Heap2.prototype.replace = function(element) {
                    var peek = this.heapArray[0];
                    this.heapArray[0] = element;
                    this._sortNodeDown(0);
                    return peek;
                };
                Heap2.prototype.size = function() {
                    return this.length;
                };
                Heap2.prototype.top = function(n) {
                    if (n === void 0) {
                        n = 1;
                    }
                    if (this.heapArray.length === 0 || n <= 0) {
                        return [];
                    } else if (this.heapArray.length === 1 || n === 1) {
                        return [ this.heapArray[0] ];
                    } else if (n >= this.heapArray.length) {
                        return __spreadArray([], __read(this.heapArray), false);
                    } else {
                        var result = this._topN_push(~~n);
                        return result;
                    }
                };
                Heap2.prototype.toArray = function() {
                    return __spreadArray([], __read(this.heapArray), false);
                };
                Heap2.prototype.toString = function() {
                    return this.heapArray.toString();
                };
                Heap2.prototype.get = function(i) {
                    return this.heapArray[i];
                };
                Heap2.prototype.getChildrenOf = function(idx) {
                    var _this = this;
                    return Heap2.getChildrenIndexOf(idx).map(function(i) {
                        return _this.heapArray[i];
                    }).filter(function(e) {
                        return e !== void 0;
                    });
                };
                Heap2.prototype.getParentOf = function(idx) {
                    var pi = Heap2.getParentIndexOf(idx);
                    return this.heapArray[pi];
                };
                Heap2.prototype[Symbol.iterator] = function() {
                    return __generator(this, function(_a) {
                        switch (_a.label) {
                          case 0:
                            if (!this.length) return [ 3, 2 ];
                            return [ 4, this.pop() ];
        
                          case 1:
                            _a.sent();
                            return [ 3, 0 ];
        
                          case 2:
                            return [ 2 ];
                        }
                    });
                };
                Heap2.prototype.iterator = function() {
                    return this.toArray();
                };
                Heap2.prototype._applyLimit = function() {
                    if (this._limit && this._limit < this.heapArray.length) {
                        var rm = this.heapArray.length - this._limit;
                        while (rm) {
                            this.heapArray.pop();
                            --rm;
                        }
                    }
                };
                Heap2.prototype._bottomN_push = function(n) {
                    var bottomHeap = new Heap2(this.compare);
                    bottomHeap.limit = n;
                    bottomHeap.heapArray = this.heapArray.slice(-n);
                    bottomHeap.init();
                    var startAt = this.heapArray.length - 1 - n;
                    var parentStartAt = Heap2.getParentIndexOf(startAt);
                    var indices = [];
                    for (var i = startAt; i > parentStartAt; --i) {
                        indices.push(i);
                    }
                    var arr = this.heapArray;
                    while (indices.length) {
                        var i = indices.shift();
                        if (this.compare(arr[i], bottomHeap.peek()) > 0) {
                            bottomHeap.replace(arr[i]);
                            if (i % 2) {
                                indices.push(Heap2.getParentIndexOf(i));
                            }
                        }
                    }
                    return bottomHeap.toArray();
                };
                Heap2.prototype._moveNode = function(j, k) {
                    var _a;
                    _a = __read([ this.heapArray[k], this.heapArray[j] ], 2), this.heapArray[j] = _a[0], 
                    this.heapArray[k] = _a[1];
                };
                Heap2.prototype._sortNodeDown = function(i) {
                    var _this = this;
                    var moveIt = i < this.heapArray.length - 1;
                    var self = this.heapArray[i];
                    var getPotentialParent = function(best, j) {
                        if (_this.heapArray.length > j && _this.compare(_this.heapArray[j], _this.heapArray[best]) < 0) {
                            best = j;
                        }
                        return best;
                    };
                    while (moveIt) {
                        var childrenIdx = Heap2.getChildrenIndexOf(i);
                        var bestChildIndex = childrenIdx.reduce(getPotentialParent, childrenIdx[0]);
                        var bestChild = this.heapArray[bestChildIndex];
                        if (typeof bestChild !== "undefined" && this.compare(self, bestChild) > 0) {
                            this._moveNode(i, bestChildIndex);
                            i = bestChildIndex;
                        } else {
                            moveIt = false;
                        }
                    }
                };
                Heap2.prototype._sortNodeUp = function(i) {
                    var moveIt = i > 0;
                    while (moveIt) {
                        var pi = Heap2.getParentIndexOf(i);
                        if (pi >= 0 && this.compare(this.heapArray[pi], this.heapArray[i]) > 0) {
                            this._moveNode(i, pi);
                            i = pi;
                        } else {
                            moveIt = false;
                        }
                    }
                };
                Heap2.prototype._topN_push = function(n) {
                    var topHeap = new Heap2(this._invertedCompare);
                    topHeap.limit = n;
                    var indices = [ 0 ];
                    var arr = this.heapArray;
                    while (indices.length) {
                        var i = indices.shift();
                        if (i < arr.length) {
                            if (topHeap.length < n) {
                                topHeap.push(arr[i]);
                                indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
                            } else if (this.compare(arr[i], topHeap.peek()) < 0) {
                                topHeap.replace(arr[i]);
                                indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
                            }
                        }
                    }
                    return topHeap.toArray();
                };
                Heap2.prototype._topN_fill = function(n) {
                    var heapArray = this.heapArray;
                    var topHeap = new Heap2(this._invertedCompare);
                    topHeap.limit = n;
                    topHeap.heapArray = heapArray.slice(0, n);
                    topHeap.init();
                    var branch = Heap2.getParentIndexOf(n - 1) + 1;
                    var indices = [];
                    for (var i = branch; i < n; ++i) {
                        indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i).filter(function(l) {
                            return l < heapArray.length;
                        })), false));
                    }
                    if ((n - 1) % 2) {
                        indices.push(n);
                    }
                    while (indices.length) {
                        var i = indices.shift();
                        if (i < heapArray.length) {
                            if (this.compare(heapArray[i], topHeap.peek()) < 0) {
                                topHeap.replace(heapArray[i]);
                                indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(i)), false));
                            }
                        }
                    }
                    return topHeap.toArray();
                };
                Heap2.prototype._topN_heap = function(n) {
                    var topHeap = this.clone();
                    var result = [];
                    for (var i = 0; i < n; ++i) {
                        result.push(topHeap.pop());
                    }
                    return result;
                };
                Heap2.prototype._topIdxOf = function(list) {
                    if (!list.length) {
                        return -1;
                    }
                    var idx = 0;
                    var top = list[idx];
                    for (var i = 1; i < list.length; ++i) {
                        var comp = this.compare(list[i], top);
                        if (comp < 0) {
                            idx = i;
                            top = list[i];
                        }
                    }
                    return idx;
                };
                Heap2.prototype._topOf = function() {
                    var list = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        list[_i] = arguments[_i];
                    }
                    var heap = new Heap2(this.compare);
                    heap.init(list);
                    return heap.peek();
                };
                return Heap2;
            }();
            var EventQueue = class {
                constructor() {
                    this.minHeap = new Heap((a, b) => a.time - b.time);
                }
                addEvent(event) {
                    this.minHeap.push(event);
                }
                getNextEvent() {
                    return this.minHeap.pop();
                }
                containsEventOfType(type) {
                    let heapEvents = this.minHeap.toArray();
                    return heapEvents.some(event => event.type == type);
                }
                containsEventOfTypeAndHrid(type, hrid) {
                    let heapEvents = this.minHeap.toArray();
                    return heapEvents.some(event => event.type == type && event.hrid == hrid);
                }
                clear() {
                    this.minHeap = new Heap((a, b) => a.time - b.time);
                }
                clearEventsForUnit(unit) {
                    this.clearMatching(event => event.source == unit || event.target == unit);
                }
                clearEventsOfType(type) {
                    this.clearMatching(event => event.type == type);
                }
                clearMatching(fn) {
                    let cleared = false;
                    let heapEvents = this.minHeap.toArray();
                    for (const event of heapEvents) {
                        if (fn(event)) {
                            this.minHeap.remove(event);
                            cleared = true;
                        }
                    }
                    return cleared;
                }
                getMatching(fn) {
                    let heapEvents = this.minHeap.toArray();
                    for (const event of heapEvents) {
                        if (fn(event)) {
                            return event;
                        }
                    }
                    return null;
                }
            };
            var eventQueue_default = EventQueue;
            var _PlayerRespawnEvent = class _PlayerRespawnEvent extends combatEvent_default {
                constructor(time, hrid) {
                    super(_PlayerRespawnEvent.type, time);
                    this.hrid = hrid;
                }
            };
            __publicField(_PlayerRespawnEvent, "type", "playerRespawn");
            var PlayerRespawnEvent = _PlayerRespawnEvent;
            var playerRespawnEvent_default = PlayerRespawnEvent;
            var _RegenTickEvent = class _RegenTickEvent extends combatEvent_default {
                constructor(time) {
                    super(_RegenTickEvent.type, time);
                }
            };
            __publicField(_RegenTickEvent, "type", "regenTick");
            var RegenTickEvent = _RegenTickEvent;
            var regenTickEvent_default = RegenTickEvent;
            var _StunExpirationEvent = class _StunExpirationEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_StunExpirationEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_StunExpirationEvent, "type", "stunExpiration");
            var StunExpirationEvent = _StunExpirationEvent;
            var stunExpirationEvent_default = StunExpirationEvent;
            var _BlindExpirationEvent = class _BlindExpirationEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_BlindExpirationEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_BlindExpirationEvent, "type", "blindExpiration");
            var BlindExpirationEvent = _BlindExpirationEvent;
            var blindExpirationEvent_default = BlindExpirationEvent;
            var _SilenceExpirationEvent = class _SilenceExpirationEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_SilenceExpirationEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_SilenceExpirationEvent, "type", "silenceExpiration");
            var SilenceExpirationEvent = _SilenceExpirationEvent;
            var silenceExpirationEvent_default = SilenceExpirationEvent;
            var _CurseExpirationEvent = class _CurseExpirationEvent extends combatEvent_default {
                constructor(time, curseAmount, source) {
                    super(_CurseExpirationEvent.type, time);
                    this.curseAmount = Math.min(curseAmount + 1, _CurseExpirationEvent.maxCurseStacks);
                    this.source = source;
                }
            };
            __publicField(_CurseExpirationEvent, "type", "curseExpiration");
            __publicField(_CurseExpirationEvent, "maxCurseStacks", 5);
            var CurseExpirationEvent = _CurseExpirationEvent;
            var curseExpirationEvent_default = CurseExpirationEvent;
            var _WeakenExpirationEvent = class _WeakenExpirationEvent extends combatEvent_default {
                constructor(time, weakenAmount, source) {
                    super(_WeakenExpirationEvent.type, time);
                    this.weakenAmount = Math.min(weakenAmount + 1, _WeakenExpirationEvent.maxWeakenStacks);
                    this.source = source;
                }
            };
            __publicField(_WeakenExpirationEvent, "type", "weakenExpiration");
            __publicField(_WeakenExpirationEvent, "maxWeakenStacks", 5);
            var WeakenExpirationEvent = _WeakenExpirationEvent;
            var weakenExpirationEvent_default = WeakenExpirationEvent;
            var _FuryExpirationEvent = class _FuryExpirationEvent extends combatEvent_default {
                constructor(time, furyAmount, source) {
                    super(_FuryExpirationEvent.type, time);
                    this.furyAmount = furyAmount;
                    this.source = source;
                }
            };
            __publicField(_FuryExpirationEvent, "type", "furyExpiration");
            var FuryExpirationEvent = _FuryExpirationEvent;
            var furyExpirationEvent_default = FuryExpirationEvent;
            var _EnrageTickEvent = class _EnrageTickEvent extends combatEvent_default {
                constructor(time, encounterTime) {
                    super(_EnrageTickEvent.type, time);
                    this.encounterTime = encounterTime;
                }
            };
            __publicField(_EnrageTickEvent, "type", "enrageTick");
            var EnrageTickEvent = _EnrageTickEvent;
            var enrageTickEvent_default = EnrageTickEvent;
            var combatData = {
                itemDetailMap: {},
                abilityDetailMap: {},
                achievementTierDetailMap: {},
                achievementDetailMap: {},
                houseRoomDetailMap: {},
                combatTriggerDependencyDetailMap: {},
                combatMonsterDetailMap: {},
                actionDetailMap: {},
                combatStyleDetailMap: {},
                enhancementLevelTotalBonusMultiplierTable: []
            };
            function updateCombatData(values = {}) {
                for (const [key, value] of Object.entries(values || {})) {
                    const target = combatData[key];
                    if (target == null || value == null) continue;
                    if (Array.isArray(target) && Array.isArray(value)) {
                        target.splice(0, target.length, ...value);
                    } else if (typeof target === "object" && typeof value === "object") {
                        Object.assign(target, value);
                    }
                }
            }
            var combatData_default = combatData;
            var combatStyleDetailMap_default = combatData_default.combatStyleDetailMap;
            var SimResult = class {
                constructor(zone, labyrinth, numberOfPlayers) {
                    this.deaths = {};
                    this.experienceGained = {};
                    this.encounters = 0;
                    this.attacks = {};
                    this.consumablesUsed = {};
                    this.hitpointsGained = {};
                    this.manapointsGained = {};
                    this.debuffOnLevelGap = {};
                    this.dropRateMultiplier = {};
                    this.rareFindMultiplier = {};
                    this.combatDropQuantity = {};
                    this.playerRanOutOfMana = {
                        player1: false,
                        player2: false,
                        player3: false,
                        player4: false,
                        player5: false
                    };
                    this.playerRanOutOfManaTime = {};
                    this.manaUsed = {};
                    this.timeSpentAlive = [];
                    this.bossSpawns = [];
                    this.hitpointsSpent = {};
                    this.zoneName = zone?.hrid;
                    this.difficultyTier = zone?.difficultyTier;
                    this.labyrinthName = labyrinth?.monsterHrid;
                    this.roomLevel = labyrinth?.roomLevel;
                    this.isDungeon = false;
                    this.isLabyrinth = labyrinth ? true : false;
                    this.dungeonsCompleted = 0;
                    this.dungeonsFailed = 0;
                    this.maxWaveReached = 0;
                    this.numberOfPlayers = numberOfPlayers;
                    this.maxEnrageStack = 0;
                    this.minDungenonTime = 0;
                    this.maxDungenonTime = 0;
                    this.lastDungeonFinishTime = 0;
                    this.lastEncounterFinishTime = 0;
                    this.labyAttemptCount = 0;
                    this.wipeEvents = [];
                    this.timeSeriesData = {
                        timestamps: [],
                        players: {}
                    };
                }
                addWipeEvent(logs, simulationTime, wave) {
                    this.wipeEvents.push({
                        simulationTime: simulationTime,
                        logs: logs,
                        wave: wave,
                        timestamp: (new Date).toISOString()
                    });
                }
                addDeath(unit) {
                    if (!this.deaths[unit.hrid]) {
                        this.deaths[unit.hrid] = 0;
                    }
                    this.deaths[unit.hrid] += 1;
                }
                updateTimeSpentAlive(name, alive, time) {
                    const i = this.timeSpentAlive.findIndex(e => e.name === name);
                    if (alive) {
                        if (i !== -1) {
                            this.timeSpentAlive[i].alive = true;
                            this.timeSpentAlive[i].spawnedAt = time;
                        } else {
                            this.timeSpentAlive.push({
                                name: name,
                                timeSpentAlive: 0,
                                spawnedAt: time,
                                alive: true,
                                count: 0
                            });
                        }
                    } else {
                        const timeAlive = time - this.timeSpentAlive[i].spawnedAt;
                        this.timeSpentAlive[i].alive = false;
                        this.timeSpentAlive[i].timeSpentAlive += timeAlive;
                        this.timeSpentAlive[i].count += 1;
                    }
                }
                updateDungenonFinish(beginFlag, finishTime) {
                    const i = this.timeSpentAlive.findIndex(e => e.name === beginFlag);
                    if (i == -1) {
                        return;
                    }
                    const currentDungenonTime = finishTime - this.timeSpentAlive[i].spawnedAt;
                    if (this.minDungenonTime == 0 || this.minDungenonTime > currentDungenonTime) {
                        this.minDungenonTime = currentDungenonTime;
                    }
                    if (this.maxDungenonTime < currentDungenonTime) {
                        this.maxDungenonTime = currentDungenonTime;
                    }
                }
                addExperienceGain(unit, experience) {
                    if (!unit.isPlayer) {
                        return;
                    }
                    if (!this.experienceGained[unit.hrid]) {
                        this.experienceGained[unit.hrid] = {
                            stamina: 0,
                            intelligence: 0,
                            attack: 0,
                            melee: 0,
                            defense: 0,
                            ranged: 0,
                            magic: 0
                        };
                    }
                    let experienceGainedRate = {
                        stamina: 0,
                        intelligence: 0,
                        attack: 0,
                        melee: 0,
                        defense: 0,
                        ranged: 0,
                        magic: 0
                    };
                    const primaryTraining = unit.combatDetails.combatStats.primaryTraining;
                    experienceGainedRate[primaryTraining.split("/")[2]] = .3;
                    const skillExpMap = combatStyleDetailMap_default[unit.combatDetails.combatStats.combatStyleHrid].skillExpMap;
                    const skillExpMapLength = Object.keys(skillExpMap).length;
                    const focusTraining = unit.combatDetails.combatStats.focusTraining;
                    if (focusTraining && skillExpMap[focusTraining]) {
                        experienceGainedRate[focusTraining.split("/")[2]] += .7;
                    } else {
                        Object.keys(skillExpMap).forEach(skillHrid => {
                            experienceGainedRate[skillHrid.split("/")[2]] += .7 / skillExpMapLength;
                        });
                    }
                    for (const [type, rate] of Object.entries(experienceGainedRate)) {
                        if (rate <= 0) continue;
                        const skillExperience = rate * (1 + unit.combatDetails.combatStats[type + "Experience"]);
                        this.experienceGained[unit.hrid][type] += experience * (1 + unit.combatDetails.combatStats.combatExperience) * skillExperience * (1 + unit.debuffOnLevelGap);
                    }
                }
                addEncounterEnd() {
                    this.encounters++;
                }
                addAttack(source, target, ability, hit) {
                    if (!this.attacks[source.hrid]) {
                        this.attacks[source.hrid] = {};
                    }
                    if (!this.attacks[source.hrid][target.hrid]) {
                        this.attacks[source.hrid][target.hrid] = {};
                    }
                    if (!this.attacks[source.hrid][target.hrid][ability]) {
                        this.attacks[source.hrid][target.hrid][ability] = {};
                    }
                    if (!this.attacks[source.hrid][target.hrid][ability][hit]) {
                        this.attacks[source.hrid][target.hrid][ability][hit] = 0;
                    }
                    this.attacks[source.hrid][target.hrid][ability][hit] += 1;
                }
                addConsumableUse(unit, consumable) {
                    if (!this.consumablesUsed[unit.hrid]) {
                        this.consumablesUsed[unit.hrid] = {};
                    }
                    if (!this.consumablesUsed[unit.hrid][consumable.hrid]) {
                        this.consumablesUsed[unit.hrid][consumable.hrid] = 0;
                    }
                    this.consumablesUsed[unit.hrid][consumable.hrid] += 1;
                }
                addHitpointsGained(unit, source, amount) {
                    if (!this.hitpointsGained[unit.hrid]) {
                        this.hitpointsGained[unit.hrid] = {};
                    }
                    if (!this.hitpointsGained[unit.hrid][source]) {
                        this.hitpointsGained[unit.hrid][source] = 0;
                    }
                    this.hitpointsGained[unit.hrid][source] += amount;
                }
                addManapointsGained(unit, source, amount) {
                    if (!this.manapointsGained[unit.hrid]) {
                        this.manapointsGained[unit.hrid] = {};
                    }
                    if (!this.manapointsGained[unit.hrid][source]) {
                        this.manapointsGained[unit.hrid][source] = 0;
                    }
                    this.manapointsGained[unit.hrid][source] += amount;
                }
                setDropRateMultipliers(unit) {
                    if (!this.dropRateMultiplier[unit.hrid]) {
                        this.dropRateMultiplier[unit.hrid] = {};
                    }
                    this.dropRateMultiplier[unit.hrid] = 1 + unit.combatDetails.combatStats.combatDropRate;
                    if (!this.rareFindMultiplier[unit.hrid]) {
                        this.rareFindMultiplier[unit.hrid] = {};
                    }
                    this.rareFindMultiplier[unit.hrid] = 1 + unit.combatDetails.combatStats.combatRareFind;
                    if (!this.combatDropQuantity[unit.hrid]) {
                        this.combatDropQuantity[unit.hrid] = {};
                    }
                    this.combatDropQuantity[unit.hrid] = unit.combatDetails.combatStats.combatDropQuantity;
                    if (!this.debuffOnLevelGap[unit.hrid]) {
                        this.debuffOnLevelGap[unit.hrid] = {};
                    }
                    this.debuffOnLevelGap[unit.hrid] = unit.debuffOnLevelGap;
                }
                setManaUsed(unit) {
                    this.manaUsed[unit.hrid] = {};
                    for (let [key, value] of unit.abilityManaCosts.entries()) {
                        this.manaUsed[unit.hrid][key] = value;
                    }
                }
                addHitpointsSpent(unit, source, amount) {
                    if (!this.hitpointsSpent[unit.hrid]) {
                        this.hitpointsSpent[unit.hrid] = {};
                    }
                    if (!this.hitpointsSpent[unit.hrid][source]) {
                        this.hitpointsSpent[unit.hrid][source] = 0;
                    }
                    this.hitpointsSpent[unit.hrid][source] += amount;
                }
                addRanOutOfManaCount(unit, isOutOfMana, time) {
                    if (isOutOfMana) this.playerRanOutOfMana[unit.hrid] = true;
                    if (!this.playerRanOutOfManaTime[unit.hrid]) {
                        this.playerRanOutOfManaTime[unit.hrid] = {
                            isOutOfMana: false,
                            startTimeForOutOfMana: 0,
                            totalTimeForOutOfMana: 0
                        };
                    }
                    if (isOutOfMana) {
                        if (!this.playerRanOutOfManaTime[unit.hrid].isOutOfMana) {
                            this.playerRanOutOfManaTime[unit.hrid].isOutOfMana = true;
                            this.playerRanOutOfManaTime[unit.hrid].startTimeForOutOfMana = time;
                        }
                    } else {
                        if (this.playerRanOutOfManaTime[unit.hrid].isOutOfMana) {
                            this.playerRanOutOfManaTime[unit.hrid].isOutOfMana = false;
                            this.playerRanOutOfManaTime[unit.hrid].totalTimeForOutOfMana += time - this.playerRanOutOfManaTime[unit.hrid].startTimeForOutOfMana;
                        }
                    }
                }
                addTimeSeriesSnapshot(time, players) {
                    this.timeSeriesData.timestamps.push(time);
                    players.forEach(player => {
                        if (!this.timeSeriesData.players[player.hrid]) {
                            this.timeSeriesData.players[player.hrid] = {
                                hp: [],
                                mp: [],
                                maxHp: [],
                                maxMp: []
                            };
                        }
                        const playerData = this.timeSeriesData.players[player.hrid];
                        playerData.hp.push(player.combatDetails.currentHitpoints);
                        playerData.mp.push(player.combatDetails.currentManapoints);
                        playerData.maxHp.push(player.combatDetails.maxHitpoints);
                        playerData.maxMp.push(player.combatDetails.maxManapoints);
                    });
                }
            };
            var simResult_default = SimResult;
            var _AbilityCastEndEvent = class _AbilityCastEndEvent extends combatEvent_default {
                constructor(time, source, ability) {
                    super(_AbilityCastEndEvent.type, time);
                    this.source = source;
                    this.ability = ability;
                }
            };
            __publicField(_AbilityCastEndEvent, "type", "abilityCastEndEvent");
            var AbilityCastEndEvent = _AbilityCastEndEvent;
            var abilityCastEndEvent_default = AbilityCastEndEvent;
            var _AwaitCooldownEvent = class _AwaitCooldownEvent extends combatEvent_default {
                constructor(time, source) {
                    super(_AwaitCooldownEvent.type, time);
                    this.source = source;
                }
            };
            __publicField(_AwaitCooldownEvent, "type", "awaitCooldownEvent");
            var AwaitCooldownEvent = _AwaitCooldownEvent;
            var awaitCooldownEvent_default = AwaitCooldownEvent;
            var Buff = class {
                constructor(buff, level = 1) {
                    __publicField(this, "startTime");
                    this.uniqueHrid = buff.uniqueHrid;
                    this.typeHrid = buff.typeHrid;
                    this.ratioBoost = buff.ratioBoost + (level - 1) * buff.ratioBoostLevelBonus;
                    this.flatBoost = buff.flatBoost + (level - 1) * buff.flatBoostLevelBonus;
                    this.duration = buff.duration;
                    this.multiplierForSkillHrid = buff.multiplierForSkillHrid ?? "";
                    this.multiplierPerSkillLevel = buff.multiplierPerSkillLevel ?? 0;
                }
            };
            var buff_default = Buff;
            var abilityDetailMap_default = combatData_default.abilityDetailMap;
            var combatTriggerDependencyDetailMap_default = combatData_default.combatTriggerDependencyDetailMap;
            var Trigger = class _Trigger {
                constructor(dependencyHrid, conditionHrid, comparatorHrid, value = 0) {
                    this.dependencyHrid = dependencyHrid;
                    this.conditionHrid = conditionHrid;
                    this.comparatorHrid = comparatorHrid;
                    this.value = value;
                }
                static createFromDTO(dto) {
                    let trigger = new _Trigger(dto.dependencyHrid, dto.conditionHrid, dto.comparatorHrid, dto.value);
                    return trigger;
                }
                isActive(source, target, friendlies, enemies, currentTime) {
                    if (combatTriggerDependencyDetailMap_default[this.dependencyHrid].isSingleTarget) {
                        return this.isActiveSingleTarget(source, target, currentTime);
                    } else {
                        return this.isActiveMultiTarget(friendlies, enemies, currentTime);
                    }
                }
                isActiveSingleTarget(source, target, currentTime) {
                    let dependencyValue;
                    switch (this.dependencyHrid) {
                      case "/combat_trigger_dependencies/self":
                        dependencyValue = this.getDependencyValue(source, currentTime);
                        break;
        
                      case "/combat_trigger_dependencies/targeted_enemy":
                        if (!target) {
                            return false;
                        }
                        dependencyValue = this.getDependencyValue(target, currentTime);
                        break;
        
                      default:
                        throw new Error("Unknown dependencyHrid in trigger: " + this.dependencyHrid);
                    }
                    return this.compareValue(dependencyValue);
                }
                isActiveMultiTarget(friendlies, enemies, currentTime) {
                    let dependency;
                    switch (this.dependencyHrid) {
                      case "/combat_trigger_dependencies/all_allies":
                        dependency = friendlies;
                        break;
        
                      case "/combat_trigger_dependencies/all_enemies":
                        if (!enemies) {
                            return false;
                        }
                        dependency = enemies;
                        break;
        
                      default:
                        throw new Error("Unknown dependencyHrid in trigger: " + this.dependencyHrid);
                    }
                    let dependencyValue;
                    switch (this.conditionHrid) {
                      case "/combat_trigger_conditions/number_of_active_units":
                        dependencyValue = dependency.filter(unit => unit.combatDetails.currentHitpoints > 0).length;
                        break;
        
                      case "/combat_trigger_conditions/number_of_dead_units":
                        dependencyValue = dependency.filter(unit => unit.combatDetails.currentHitpoints <= 0).length;
                        break;
        
                      case "/combat_trigger_conditions/lowest_hp_percentage":
                        dependencyValue = dependency.filter(unit => unit.combatDetails.currentHitpoints > 0).reduce((prev, curr) => {
                            let currentHpPercentage = curr.combatDetails.currentHitpoints / curr.combatDetails.maxHitpoints;
                            return currentHpPercentage < prev ? currentHpPercentage : prev;
                        }, 2) * 100;
                        break;
        
                      default:
                        dependencyValue = dependency.filter(unit => unit.combatDetails.currentHitpoints > 0).map(unit => this.getDependencyValue(unit, currentTime)).reduce((prev, cur) => prev + cur, 0);
                        break;
                    }
                    return this.compareValue(dependencyValue);
                }
                getDependencyValue(source, currentTime) {
                    switch (this.conditionHrid) {
                      case "/combat_trigger_conditions/berserk":
                      case "/combat_trigger_conditions/frenzy":
                      case "/combat_trigger_conditions/precision":
                      case "/combat_trigger_conditions/vampirism":
                      case "/combat_trigger_conditions/attack_coffee":
                      case "/combat_trigger_conditions/defense_coffee":
                      case "/combat_trigger_conditions/lucky_coffee":
                      case "/combat_trigger_conditions/magic_coffee":
                      case "/combat_trigger_conditions/melee_coffee":
                      case "/combat_trigger_conditions/ranged_coffee":
                      case "/combat_trigger_conditions/swiftness_coffee":
                      case "/combat_trigger_conditions/wisdom_coffee":
                      case "/combat_trigger_conditions/ice_spear":
                      case "/combat_trigger_conditions/puncture":
                      case "/combat_trigger_conditions/frost_surge":
                      case "/combat_trigger_conditions/elusiveness":
                      case "/combat_trigger_conditions/channeling_coffee":
                      case "/combat_trigger_conditions/fierce_aura":
                      case "/combat_trigger_conditions/invincible_armor":
                      case "/combat_trigger_conditions/invincible_fire_resistance":
                      case "/combat_trigger_conditions/invincible_nature_resistance":
                      case "/combat_trigger_conditions/invincible_water_resistance":
                      case "/combat_trigger_conditions/provoke":
                      case "/combat_trigger_conditions/taunt":
                      case "/combat_trigger_conditions/crippling_slash":
                      case "/combat_trigger_conditions/mana_spring":
                      case "/combat_trigger_conditions/retribution":
                      case "/combat_trigger_conditions/fracturing_impact":
                      case "/combat_trigger_conditions/maim":
                      case "/combat_trigger_conditions/curse":
                      case "/combat_trigger_conditions/weaken":
                        let buffHrid = "/buff_uniques";
                        buffHrid += this.conditionHrid.slice(this.conditionHrid.lastIndexOf("/"));
                        return source.combatBuffs[buffHrid];
        
                      case "/combat_trigger_conditions/critical_aura":
                      case "/combat_trigger_conditions/critical_coffee":
                      case "/combat_trigger_conditions/intelligence_coffee":
                      case "/combat_trigger_conditions/stamina_coffee":
                      case "/combat_trigger_conditions/elemental_affinity":
                      case "/combat_trigger_conditions/fury":
                      case "/combat_trigger_conditions/guardian_aura":
                      case "/combat_trigger_conditions/insanity":
                      case "/combat_trigger_conditions/spike_shell":
                      case "/combat_trigger_conditions/toxic_pollen":
                      case "/combat_trigger_conditions/invincible":
                      case "/combat_trigger_conditions/mystic_aura":
                      case "/combat_trigger_conditions/pestilent_shot":
                      case "/combat_trigger_conditions/smoke_burst":
                      case "/combat_trigger_conditions/speed_aura":
                      case "/combat_trigger_conditions/toughness":
                      case "/combat_trigger_conditions/enrage":
                        let buffPrefix = "/buff_uniques";
                        buffPrefix += this.conditionHrid.slice(this.conditionHrid.lastIndexOf("/"));
                        let buffs = Object.keys(source.combatBuffs).filter(buff => buff.startsWith(buffPrefix));
                        return source.combatBuffs[buffs?.[0]];
        
                      case "/combat_trigger_conditions/current_hp":
                        return source.combatDetails.currentHitpoints;
        
                      case "/combat_trigger_conditions/current_mp":
                        return source.combatDetails.currentManapoints;
        
                      case "/combat_trigger_conditions/missing_hp":
                        return source.combatDetails.maxHitpoints - source.combatDetails.currentHitpoints;
        
                      case "/combat_trigger_conditions/missing_mp":
                        return source.combatDetails.maxManapoints - source.combatDetails.currentManapoints;
        
                      case "/combat_trigger_conditions/stun_status":
                        return source.isStunned || source.stunExpireTime == currentTime;
        
                      case "/combat_trigger_conditions/blind_status":
                        return source.isBlinded || source.blindExpireTime == currentTime;
        
                      case "/combat_trigger_conditions/silence_status":
                        return source.isSilenced || source.silenceExpireTime == currentTime;
        
                      default:
                        throw new Error("Unknown conditionHrid in trigger: " + this.conditionHrid);
                    }
                }
                compareValue(dependencyValue) {
                    switch (this.comparatorHrid) {
                      case "/combat_trigger_comparators/greater_than_equal":
                        return dependencyValue >= this.value;
        
                      case "/combat_trigger_comparators/less_than_equal":
                        return dependencyValue <= this.value;
        
                      case "/combat_trigger_comparators/is_active":
                        return !!dependencyValue;
        
                      case "/combat_trigger_comparators/is_inactive":
                        return !dependencyValue;
        
                      default:
                        throw new Error("Unknown comparatorHrid in trigger: " + this.comparatorHrid);
                    }
                }
            };
            var trigger_default = Trigger;
            var abilityFromCombatStat = {
                blaze: {
                    hrid: "/abilities/blaze",
                    name: "Blaze",
                    description: "",
                    isSpecialAbility: false,
                    manaCost: 0,
                    cooldownDuration: 0,
                    castDuration: 0,
                    abilityEffects: [ {
                        targetType: "allEnemies",
                        effectType: "/ability_effect_types/damage",
                        combatStyleHrid: "/combat_styles/magic",
                        damageType: "/damage_types/fire",
                        baseDamageFlat: 0,
                        baseDamageFlatLevelBonus: 0,
                        baseDamageRatio: .3,
                        baseDamageRatioLevelBonus: 0,
                        bonusAccuracyRatio: 0,
                        bonusAccuracyRatioLevelBonus: 0,
                        damageOverTimeRatio: 0,
                        damageOverTimeDuration: 0,
                        armorDamageRatio: 0,
                        armorDamageRatioLevelBonus: 0,
                        hpDrainRatio: 0,
                        pierceChance: 0,
                        blindChance: 0,
                        blindDuration: 0,
                        silenceChance: 0,
                        silenceDuration: 0,
                        stunChance: 0,
                        stunDuration: 0,
                        spendHpRatio: 0,
                        buffs: null
                    } ],
                    defaultCombatTriggers: [ {
                        dependencyHrid: "/combat_trigger_dependencies/all_enemies",
                        conditionHrid: "/combat_trigger_conditions/number_of_active_units",
                        comparatorHrid: "/combat_trigger_comparators/greater_than_equal",
                        value: 1
                    }, {
                        dependencyHrid: "/combat_trigger_dependencies/all_enemies",
                        conditionHrid: "/combat_trigger_conditions/current_hp",
                        comparatorHrid: "/combat_trigger_comparators/greater_than_equal",
                        value: 1
                    } ]
                },
                bloom: {
                    hrid: "/abilities/bloom",
                    name: "Bloom",
                    description: "",
                    isSpecialAbility: false,
                    manaCost: 0,
                    cooldownDuration: 0,
                    castDuration: 0,
                    abilityEffects: [ {
                        targetType: "lowestHpAlly",
                        effectType: "/ability_effect_types/heal",
                        combatStyleHrid: "/combat_styles/magic",
                        damageType: "",
                        baseDamageFlat: 10,
                        baseDamageFlatLevelBonus: 0,
                        baseDamageRatio: .15,
                        baseDamageRatioLevelBonus: 0,
                        bonusAccuracyRatio: 0,
                        bonusAccuracyRatioLevelBonus: 0,
                        damageOverTimeRatio: 0,
                        damageOverTimeDuration: 0,
                        armorDamageRatio: 0,
                        armorDamageRatioLevelBonus: 0,
                        hpDrainRatio: 0,
                        pierceChance: 0,
                        blindChance: 0,
                        blindDuration: 0,
                        silenceChance: 0,
                        silenceDuration: 0,
                        stunChance: 0,
                        stunDuration: 0,
                        spendHpRatio: 0,
                        buffs: null
                    } ],
                    defaultCombatTriggers: [ {
                        dependencyHrid: "/combat_trigger_dependencies/all_allies",
                        conditionHrid: "/combat_trigger_conditions/lowest_hp_percentage",
                        comparatorHrid: "/combat_trigger_comparators/less_than_equal",
                        value: 100
                    } ]
                }
            };
            var Ability = class _Ability {
                constructor(hrid, level = 1, triggers = null) {
                    this.hrid = hrid;
                    this.level = level;
                    let gameAbility = abilityDetailMap_default[hrid];
                    if (!gameAbility) {
                        gameAbility = abilityFromCombatStat[hrid];
                    }
                    if (!gameAbility) {
                        throw new Error("No ability found for hrid: " + this.hrid);
                    }
                    this.manaCost = gameAbility.manaCost;
                    this.cooldownDuration = gameAbility.cooldownDuration;
                    this.castDuration = gameAbility.castDuration;
                    this.isSpecialAbility = gameAbility.isSpecialAbility;
                    this.abilityEffects = [];
                    for (const effect of gameAbility.abilityEffects) {
                        let abilityEffect = {
                            targetType: effect.targetType,
                            effectType: effect.effectType,
                            combatStyleHrid: effect.combatStyleHrid,
                            damageType: effect.damageType,
                            damageFlat: effect.baseDamageFlat + (this.level - 1) * effect.baseDamageFlatLevelBonus,
                            damageRatio: effect.baseDamageRatio + (this.level - 1) * effect.baseDamageRatioLevelBonus,
                            bonusAccuracyRatio: effect.bonusAccuracyRatio + (this.level - 1) * effect.bonusAccuracyRatioLevelBonus,
                            damageOverTimeRatio: effect.damageOverTimeRatio,
                            damageOverTimeDuration: effect.damageOverTimeDuration,
                            armorDamageRatio: effect.armorDamageRatio + (this.level - 1) * effect.armorDamageRatioLevelBonus,
                            hpDrainRatio: effect.hpDrainRatio,
                            pierceChance: effect.pierceChance,
                            blindChance: effect.blindChance,
                            blindDuration: effect.blindDuration,
                            silenceChance: effect.silenceChance,
                            silenceDuration: effect.silenceDuration,
                            stunChance: effect.stunChance,
                            stunDuration: effect.stunDuration,
                            spendHpRatio: effect.spendHpRatio,
                            buffs: null
                        };
                        if (effect.buffs) {
                            abilityEffect.buffs = [];
                            for (const buff of effect.buffs) {
                                abilityEffect.buffs.push(new buff_default(buff, this.level));
                            }
                        }
                        this.abilityEffects.push(abilityEffect);
                    }
                    if (triggers) {
                        this.triggers = triggers;
                    } else {
                        this.triggers = [];
                        for (const defaultTrigger of gameAbility.defaultCombatTriggers) {
                            let trigger = new trigger_default(defaultTrigger.dependencyHrid, defaultTrigger.conditionHrid, defaultTrigger.comparatorHrid, defaultTrigger.value);
                            this.triggers.push(trigger);
                        }
                    }
                    this.lastUsed = Number.MIN_SAFE_INTEGER;
                }
                static createFromDTO(dto) {
                    let triggers = dto.triggers.map(trigger => trigger_default.createFromDTO(trigger));
                    let ability = new _Ability(dto.hrid, dto.level, triggers);
                    return ability;
                }
                shouldTrigger(currentTime, source, target, friendlies, enemies) {
                    if (source.isStunned) {
                        return false;
                    }
                    if (source.isSilenced) {
                        return false;
                    }
                    let haste = source.combatDetails.combatStats.abilityHaste;
                    let cooldownDuration = this.cooldownDuration;
                    if (haste > 0) {
                        cooldownDuration = cooldownDuration * 100 / (100 + haste);
                    }
                    if (this.lastUsed + cooldownDuration > currentTime) {
                        return false;
                    }
                    if (this.triggers.length == 0) {
                        return true;
                    }
                    let shouldTrigger = true;
                    for (const trigger of this.triggers) {
                        if (!trigger.isActive(source, target, friendlies, enemies, currentTime)) {
                            shouldTrigger = false;
                        }
                    }
                    return shouldTrigger;
                }
            };
            var ability_default = Ability;
            var CombatUnit = class {
                constructor() {
                    __publicField(this, "isPlayer");
                    __publicField(this, "isStunned", false);
                    __publicField(this, "stunExpireTime", null);
                    __publicField(this, "isBlinded", false);
                    __publicField(this, "blindExpireTime", null);
                    __publicField(this, "isSilenced", false);
                    __publicField(this, "silenceExpireTime", null);
                    __publicField(this, "isOutOfMana", false);
                    __publicField(this, "staminaLevel", 1);
                    __publicField(this, "intelligenceLevel", 1);
                    __publicField(this, "attackLevel", 1);
                    __publicField(this, "meleeLevel", 1);
                    __publicField(this, "defenseLevel", 1);
                    __publicField(this, "rangedLevel", 1);
                    __publicField(this, "magicLevel", 1);
                    __publicField(this, "experience", 0);
                    __publicField(this, "experienceRate", 0);
                    __publicField(this, "enrageTime", 0);
                    __publicField(this, "abilities", [ null, null, null, null ]);
                    __publicField(this, "food", [ null, null, null ]);
                    __publicField(this, "drinks", [ null, null, null ]);
                    __publicField(this, "houseRooms", []);
                    __publicField(this, "achievements", null);
                    __publicField(this, "dropTable", []);
                    __publicField(this, "rareDropTable", []);
                    __publicField(this, "abilityManaCosts", new Map);
                    __publicField(this, "combatDetails", {
                        staminaLevel: 1,
                        intelligenceLevel: 1,
                        attackLevel: 1,
                        meleeLevel: 1,
                        defenseLevel: 1,
                        rangedLevel: 1,
                        magicLevel: 1,
                        maxHitpoints: 110,
                        currentHitpoints: 110,
                        maxManapoints: 110,
                        currentManapoints: 110,
                        stabAccuracyRating: 11,
                        slashAccuracyRating: 11,
                        smashAccuracyRating: 11,
                        rangedAccuracyRating: 11,
                        magicAccuracyRating: 11,
                        stabMaxDamage: 11,
                        slashMaxDamage: 11,
                        smashMaxDamage: 11,
                        rangedMaxDamage: 11,
                        magicMaxDamage: 11,
                        stabEvasionRating: 11,
                        slashEvasionRating: 11,
                        smashEvasionRating: 11,
                        rangedEvasionRating: 11,
                        magicEvasionRating: 11,
                        defensiveMaxDamage: 0,
                        totalArmor: .2,
                        totalWaterResistance: .4,
                        totalNatureResistance: .4,
                        totalFireResistance: .4,
                        abilityHaste: 0,
                        tenacity: 0,
                        totalThreat: 100,
                        combatStats: {
                            combatStyleHrid: "/combat_styles/smash",
                            damageType: "/damage_types/physical",
                            attackInterval: 3e9,
                            autoAttackDamage: 0,
                            abilityDamage: 0,
                            criticalRate: 0,
                            criticalDamage: 0,
                            stabAccuracy: 0,
                            slashAccuracy: 0,
                            smashAccuracy: 0,
                            rangedAccuracy: 0,
                            magicAccuracy: 0,
                            stabDamage: 0,
                            slashDamage: 0,
                            smashDamage: 0,
                            rangedDamage: 0,
                            magicDamage: 0,
                            defensiveDamage: 0,
                            taskDamage: 0,
                            physicalAmplify: 0,
                            waterAmplify: 0,
                            natureAmplify: 0,
                            fireAmplify: 0,
                            healingAmplify: 0,
                            physicalThorns: 0,
                            elementalThorns: 0,
                            maxHitpoints: 0,
                            maxManapoints: 0,
                            stabEvasion: 0,
                            slashEvasion: 0,
                            smashEvasion: 0,
                            rangedEvasion: 0,
                            magicEvasion: 0,
                            armor: 0,
                            waterResistance: 0,
                            natureResistance: 0,
                            fireResistance: 0,
                            lifeSteal: 0,
                            hpRegenPer10: .01,
                            mpRegenPer10: .01,
                            combatDropRate: 0,
                            combatDropQuantity: 0,
                            combatRareFind: 0,
                            combatExperience: 0,
                            foodSlots: 1,
                            drinkSlots: 1,
                            armorPenetration: 0,
                            waterPenetration: 0,
                            naturePenetration: 0,
                            firePenetration: 0,
                            manaLeech: 0,
                            castSpeed: 0,
                            threat: 100,
                            parry: 0,
                            mayhem: 0,
                            pierce: 0,
                            curse: 0,
                            ripple: 0,
                            bloom: 0,
                            blaze: 0,
                            weaken: 0,
                            fury: 0,
                            foodHaste: 0,
                            drinkConcentration: 0,
                            damageTaken: 0,
                            attackSpeed: 0,
                            armorDamageRatio: 0,
                            hpDrainRatio: 0,
                            primaryTraining: "",
                            focusTraining: "",
                            staminaExperience: 0,
                            intelligenceExperience: 0,
                            attackExperience: 0,
                            defenseExperience: 0,
                            meleeExperience: 0,
                            rangedExperience: 0,
                            magicExperience: 0,
                            retaliation: 0,
                            maxHitpointsRatio: 0,
                            maxManapointsRatio: 0
                        }
                    });
                    __publicField(this, "combatBuffs", {});
                    __publicField(this, "permanentBuffs", {});
                    __publicField(this, "zoneBuffs", {});
                    __publicField(this, "extraBuffs", {});
                }
                updateCombatDetails() {
                    if (this.isPlayer) {
                        if (this.combatDetails.combatStats.hpRegenPer10 === 0) {
                            this.combatDetails.combatStats.hpRegenPer10 = .01;
                        } else {
                            this.combatDetails.combatStats.hpRegenPer10 = .01 + this.combatDetails.combatStats.hpRegenPer10;
                        }
                        if (this.combatDetails.combatStats.mpRegenPer10 === 0) {
                            this.combatDetails.combatStats.mpRegenPer10 = .01;
                        } else {
                            this.combatDetails.combatStats.mpRegenPer10 = .01 + this.combatDetails.combatStats.mpRegenPer10;
                        }
                    }
                    [ "stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic" ].forEach(stat => {
                        this.combatDetails[stat + "Level"] = this[stat + "Level"];
                        let boosts = this.getBuffBoosts("/buff_types/" + stat + "_level");
                        boosts.forEach(buff => {
                            this.combatDetails[stat + "Level"] += this[stat + "Level"] * buff.ratioBoost;
                            this.combatDetails[stat + "Level"] += buff.flatBoost;
                        });
                    });
                    this.combatDetails.maxHitpoints = Math.floor((10 * (10 + this.combatDetails.staminaLevel) + this.combatDetails.combatStats.maxHitpoints) * (1 + this.combatDetails.combatStats.maxHitpointsRatio));
                    this.combatDetails.maxManapoints = Math.floor((10 * (10 + this.combatDetails.intelligenceLevel) + this.combatDetails.combatStats.maxManapoints) * (1 + this.combatDetails.combatStats.maxManapointsRatio));
                    let accuracyRatioBoostFromFury = this.getBuffBoost("/buff_types/fury_accuracy").ratioBoost;
                    let damageRatioBoostFromFury = this.getBuffBoost("/buff_types/fury_damage").ratioBoost;
                    let accuracyRatioBoost = this.getBuffBoost("/buff_types/accuracy").ratioBoost;
                    let damageRatioBoost = this.getBuffBoost("/buff_types/damage").ratioBoost;
                    [ "stab", "slash", "smash" ].forEach(style => {
                        this.combatDetails[style + "AccuracyRating"] = (10 + this.combatDetails.attackLevel) * (1 + this.combatDetails.combatStats[style + "Accuracy"]) * (1 + accuracyRatioBoost) * (1 + accuracyRatioBoostFromFury);
                        this.combatDetails[style + "MaxDamage"] = (10 + this.combatDetails.meleeLevel) * (1 + this.combatDetails.combatStats[style + "Damage"]) * (1 + damageRatioBoost) * (1 + damageRatioBoostFromFury);
                        let baseEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats[style + "Evasion"]);
                        this.combatDetails[style + "EvasionRating"] = baseEvasion;
                        let evasionBoosts2 = this.getBuffBoosts("/buff_types/evasion");
                        for (const boost of evasionBoosts2) {
                            this.combatDetails[style + "EvasionRating"] += boost.flatBoost;
                            this.combatDetails[style + "EvasionRating"] += baseEvasion * boost.ratioBoost;
                        }
                    });
                    this.combatDetails.defensiveMaxDamage = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.defensiveDamage) * (1 + damageRatioBoost) * (1 + damageRatioBoostFromFury);
                    if (this.equipment?.["/equipment_types/two_hand"]?.hrid.includes("bulwark")) {
                        this.combatDetails.smashMaxDamage += this.combatDetails.defensiveMaxDamage;
                    }
                    this.combatDetails.rangedAccuracyRating = (10 + this.combatDetails.attackLevel) * (1 + this.combatDetails.combatStats.rangedAccuracy) * (1 + accuracyRatioBoost) * (1 + accuracyRatioBoostFromFury);
                    this.combatDetails.rangedMaxDamage = (10 + this.combatDetails.rangedLevel) * (1 + this.combatDetails.combatStats.rangedDamage) * (1 + damageRatioBoost) * (1 + damageRatioBoostFromFury);
                    let baseRangedEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.rangedEvasion);
                    this.combatDetails.rangedEvasionRating = baseRangedEvasion;
                    let evasionBoosts = this.getBuffBoosts("/buff_types/evasion");
                    for (const boost of evasionBoosts) {
                        this.combatDetails.rangedEvasionRating += boost.flatBoost;
                        this.combatDetails.rangedEvasionRating += baseRangedEvasion * boost.ratioBoost;
                    }
                    this.combatDetails.combatStats.damageTaken = this.getBuffBoost("/buff_types/damage_taken").flatBoost;
                    this.combatDetails.magicAccuracyRating = (10 + this.combatDetails.attackLevel) * (1 + this.combatDetails.combatStats.magicAccuracy) * (1 + accuracyRatioBoost) * (1 + accuracyRatioBoostFromFury);
                    this.combatDetails.magicMaxDamage = (10 + this.combatDetails.magicLevel) * (1 + this.combatDetails.combatStats.magicDamage) * (1 + damageRatioBoost) * (1 + damageRatioBoostFromFury);
                    let baseMagicEvasion = (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.magicEvasion);
                    this.combatDetails.magicEvasionRating = baseMagicEvasion;
                    for (const boost of evasionBoosts) {
                        this.combatDetails.magicEvasionRating += boost.flatBoost;
                        this.combatDetails.magicEvasionRating += baseMagicEvasion * boost.ratioBoost;
                    }
                    this.combatDetails.combatStats.physicalAmplify += this.getBuffBoost("/buff_types/physical_amplify").flatBoost;
                    this.combatDetails.combatStats.waterAmplify += this.getBuffBoost("/buff_types/water_amplify").flatBoost;
                    this.combatDetails.combatStats.natureAmplify += this.getBuffBoost("/buff_types/nature_amplify").flatBoost;
                    this.combatDetails.combatStats.fireAmplify += this.getBuffBoost("/buff_types/fire_amplify").flatBoost;
                    this.combatDetails.combatStats.healingAmplify += this.getBuffBoost("/buff_types/healing_amplify").flatBoost;
                    this.combatDetails.combatStats.attackInterval /= 1 + this.combatDetails.attackLevel / 2e3;
                    let baseAttackSpeed = this.combatDetails.combatStats.attackSpeed;
                    this.combatDetails.combatStats.attackInterval /= 1 + baseAttackSpeed;
                    let attackIntervalBoosts = this.getBuffBoosts("/buff_types/attack_speed");
                    let attackIntervalRatioBoost = attackIntervalBoosts.map(boost => boost.ratioBoost).reduce((prev, cur) => prev + cur, 0);
                    this.combatDetails.combatStats.attackInterval /= 1 + attackIntervalRatioBoost;
                    let baseArmor = .2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.armor;
                    this.combatDetails.totalArmor = baseArmor;
                    let armorBoosts = this.getBuffBoosts("/buff_types/armor");
                    for (const boost of armorBoosts) {
                        this.combatDetails.totalArmor += boost.flatBoost;
                        this.combatDetails.totalArmor += baseArmor * boost.ratioBoost;
                    }
                    let baseWaterResistance = .2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.waterResistance;
                    this.combatDetails.totalWaterResistance = baseWaterResistance;
                    let waterResistanceBoosts = this.getBuffBoosts("/buff_types/water_resistance");
                    for (const boost of waterResistanceBoosts) {
                        this.combatDetails.totalWaterResistance += boost.flatBoost;
                        this.combatDetails.totalWaterResistance += baseWaterResistance * boost.ratioBoost;
                    }
                    let baseNatureResistance = .2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.natureResistance;
                    this.combatDetails.totalNatureResistance = baseNatureResistance;
                    let natureResistanceBoosts = this.getBuffBoosts("/buff_types/nature_resistance");
                    for (const boost of natureResistanceBoosts) {
                        this.combatDetails.totalNatureResistance += boost.flatBoost;
                        this.combatDetails.totalNatureResistance += baseNatureResistance * boost.ratioBoost;
                    }
                    let baseFireResistance = .2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.fireResistance;
                    this.combatDetails.totalFireResistance = baseFireResistance;
                    let fireResistanceBoosts = this.getBuffBoosts("/buff_types/fire_resistance");
                    for (const boost of fireResistanceBoosts) {
                        this.combatDetails.totalFireResistance += boost.flatBoost;
                        this.combatDetails.totalFireResistance += baseFireResistance * boost.ratioBoost;
                    }
                    let hpRegenBoosts = this.getBuffBoost("/buff_types/hp_regen");
                    this.combatDetails.combatStats.hpRegenPer10 += this.combatDetails.combatStats.hpRegenPer10 * hpRegenBoosts.ratioBoost;
                    this.combatDetails.combatStats.hpRegenPer10 += hpRegenBoosts.flatBoost;
                    let mpRegenBoosts = this.getBuffBoost("/buff_types/mp_regen");
                    this.combatDetails.combatStats.mpRegenPer10 += this.combatDetails.combatStats.mpRegenPer10 * mpRegenBoosts.ratioBoost;
                    this.combatDetails.combatStats.mpRegenPer10 += mpRegenBoosts.flatBoost;
                    this.combatDetails.combatStats.lifeSteal += this.getBuffBoost("/buff_types/life_steal").flatBoost;
                    this.combatDetails.combatStats.physicalThorns += this.getBuffBoost("/buff_types/physical_thorns").flatBoost;
                    this.combatDetails.combatStats.elementalThorns += this.getBuffBoost("/buff_types/elemental_thorns").flatBoost;
                    this.combatDetails.combatStats.combatExperience += this.getBuffBoost("/buff_types/wisdom").flatBoost;
                    this.combatDetails.combatStats.criticalRate += this.getBuffBoost("/buff_types/critical_rate").flatBoost;
                    this.combatDetails.combatStats.criticalDamage += this.getBuffBoost("/buff_types/critical_damage").flatBoost;
                    this.combatDetails.combatStats.castSpeed += this.getBuffBoost("/buff_types/cast_speed").flatBoost;
                    this.combatDetails.combatStats.castSpeed += this.combatDetails["attackLevel"] / 2e3;
                    let combatDropRateBoosts = this.getBuffBoost("/buff_types/combat_drop_rate");
                    this.combatDetails.combatStats.combatDropRate += (1 + this.combatDetails.combatStats.combatDropRate) * combatDropRateBoosts.ratioBoost;
                    this.combatDetails.combatStats.combatDropRate += combatDropRateBoosts.flatBoost;
                    let combatRareFindBoosts = this.getBuffBoost("/buff_types/rare_find");
                    this.combatDetails.combatStats.combatRareFind += (1 + this.combatDetails.combatStats.combatRareFind) * combatRareFindBoosts.ratioBoost;
                    this.combatDetails.combatStats.combatRareFind += combatRareFindBoosts.flatBoost;
                    let combatDropQuantityBoosts = this.getBuffBoost("/buff_types/combat_drop_quantity");
                    this.combatDetails.combatStats.combatDropQuantity += (1 + this.combatDetails.combatStats.combatDropQuantity) * combatDropQuantityBoosts.ratioBoost;
                    this.combatDetails.combatStats.combatDropQuantity += combatDropQuantityBoosts.flatBoost;
                    let baseThreat = 100 + this.combatDetails.combatStats.threat;
                    this.combatDetails.totalThreat = baseThreat;
                    let threatBoosts = this.getBuffBoost("/buff_types/threat");
                    if (threatBoosts.ratioBoost !== 0) {
                        this.combatDetails.combatStats.threat += baseThreat * threatBoosts.ratioBoost;
                    } else {
                        this.combatDetails.combatStats.threat = baseThreat;
                    }
                    this.combatDetails.combatStats.threat += threatBoosts.flatBoost;
                    this.combatDetails.combatStats.retaliation += this.getBuffBoost("/buff_types/retaliation").flatBoost;
                    this.combatDetails.combatStats.tenacity += this.getBuffBoost("/buff_types/tenacity").flatBoost;
                }
                addBuffs(buffs, currentTime) {
                    buffs.forEach(buff => buff.startTime = currentTime);
                    let needUpdate = false;
                    for (const buff of buffs) {
                        if (!this.combatBuffs[buff.uniqueHrid] || this.combatBuffs[buff.uniqueHrid].ratioBoost != buff.ratioBoost || this.combatBuffs[buff.uniqueHrid].flatBoost != buff.flatBoost) {
                            needUpdate = true;
                        }
                        this.combatBuffs[buff.uniqueHrid] = buff;
                    }
                    if (needUpdate) {
                        this.updateCombatDetails();
                    }
                }
                addBuff(buff, currentTime) {
                    buff.startTime = currentTime;
                    let needUpdate = true;
                    if (this.combatBuffs[buff.uniqueHrid] && this.combatBuffs[buff.uniqueHrid].ratioBoost === buff.ratioBoost && this.combatBuffs[buff.uniqueHrid].flatBoost === buff.flatBoost) {
                        needUpdate = false;
                    }
                    this.combatBuffs[buff.uniqueHrid] = buff;
                    if (needUpdate) {
                        this.updateCombatDetails();
                    }
                }
                removeBuffs(buffs) {
                    let needUpdate = false;
                    buffs.forEach(buff => {
                        if (!this.combatBuffs[buff.uniqueHrid]) {
                            return;
                        }
                        delete this.combatBuffs[buff.uniqueHrid];
                        needUpdate = true;
                    });
                    if (needUpdate) {
                        this.updateCombatDetails();
                    }
                }
                removeBuff(buff) {
                    if (!this.combatBuffs[buff.uniqueHrid]) {
                        return;
                    }
                    delete this.combatBuffs[buff.uniqueHrid];
                    this.updateCombatDetails();
                }
                addPermanentBuff(buff) {
                    if (this.permanentBuffs[buff.typeHrid]) {
                        this.permanentBuffs[buff.typeHrid].flatBoost += buff.flatBoost;
                        this.permanentBuffs[buff.typeHrid].ratioBoost += buff.ratioBoost;
                    } else {
                        this.permanentBuffs[buff.typeHrid] = {
                            uniqueHrid: buff.uniqueHrid,
                            typeHrid: buff.typeHrid,
                            flatBoost: buff.flatBoost,
                            ratioBoost: buff.ratioBoost,
                            duration: buff.duration
                        };
                    }
                }
                generatePermanentBuffs() {
                    for (let i = 0; i < this.houseRooms.length; i++) {
                        const houseRoom = this.houseRooms[i];
                        houseRoom.buffs.forEach(buff => {
                            this.addPermanentBuff(buff);
                        });
                    }
                    if (this.achievements) {
                        this.achievements.buffs.forEach(buff => {
                            this.addPermanentBuff(buff);
                        });
                    }
                    if (this.zoneBuffs) {
                        this.zoneBuffs.forEach(buff => {
                            this.addPermanentBuff(buff);
                        });
                    }
                    if (this.extraBuffs) {
                        this.extraBuffs.forEach(buff => {
                            this.addPermanentBuff(buff);
                        });
                    }
                }
                removeExpiredBuffs(currentTime) {
                    let expiredBuffs = Object.values(this.combatBuffs).filter(buff => buff.startTime + buff.duration <= currentTime);
                    expiredBuffs.forEach(buff => {
                        delete this.combatBuffs[buff.uniqueHrid];
                    });
                    this.updateCombatDetails();
                }
                clearBuffs() {
                    this.combatBuffs = structuredClone(this.permanentBuffs);
                    this.updateCombatDetails();
                }
                clearCCs() {
                    this.isStunned = false;
                    this.stunExpireTime = null;
                    this.isSilenced = false;
                    this.silenceExpireTime = null;
                    this.isBlinded = false;
                    this.blindExpireTime = null;
                    this.combatDetails.combatStats.damageTaken = 0;
                }
                getBuffBoosts(type) {
                    let boosts = [];
                    Object.values(this.combatBuffs).filter(buff => buff.typeHrid == type).forEach(buff => {
                        boosts.push({
                            ratioBoost: buff.ratioBoost,
                            flatBoost: buff.flatBoost
                        });
                    });
                    return boosts;
                }
                getBuffBoost(type) {
                    let boosts = this.getBuffBoosts(type);
                    let boost = {
                        ratioBoost: 0,
                        flatBoost: 0
                    };
                    for (let i = 0; i < boosts.length; i++) {
                        boost.ratioBoost += boosts[i]?.ratioBoost ?? 0;
                        boost.flatBoost += boosts[i]?.flatBoost ?? 0;
                    }
                    return boost;
                }
                reset(currentTime = 0) {
                    this.clearCCs();
                    if (currentTime == 0 || !this.isPlayer) {
                        this.clearBuffs();
                        this.resetCooldowns(currentTime);
                    } else {
                        this.removeExpiredBuffs(currentTime);
                    }
                    this.combatDetails.currentHitpoints = this.combatDetails.maxHitpoints;
                    this.combatDetails.currentManapoints = this.combatDetails.maxManapoints;
                }
                resetCooldowns(currentTime = 0) {
                    this.food.filter(food => food != null).forEach(food => food.lastUsed = Number.MIN_SAFE_INTEGER);
                    this.drinks.filter(drink => drink != null).forEach(drink => drink.lastUsed = Number.MIN_SAFE_INTEGER);
                    let haste = this.combatDetails.combatStats.abilityHaste;
                    this.abilities.filter(ability => ability != null).forEach(ability => {
                        if (this.isPlayer) {
                            ability.lastUsed = Number.MIN_SAFE_INTEGER;
                        } else {
                            let cooldownDuration = ability.cooldownDuration;
                            if (haste > 0) {
                                cooldownDuration = cooldownDuration * 100 / (100 + haste);
                            }
                            ability.lastUsed = currentTime - Math.floor(cooldownDuration * .5) + Math.floor(Math.random() * cooldownDuration * .5);
                        }
                    });
                }
                addHitpoints(hitpoints) {
                    let hitpointsAdded = 0;
                    if (this.combatDetails.currentHitpoints >= this.combatDetails.maxHitpoints) {
                        return hitpointsAdded;
                    }
                    let newHitpoints = Math.min(this.combatDetails.currentHitpoints + hitpoints, this.combatDetails.maxHitpoints);
                    hitpointsAdded = newHitpoints - this.combatDetails.currentHitpoints;
                    this.combatDetails.currentHitpoints = newHitpoints;
                    return hitpointsAdded;
                }
                addManapoints(manapoints) {
                    let manapointsAdded = 0;
                    if (this.combatDetails.currentManapoints >= this.combatDetails.maxManapoints) {
                        return manapointsAdded;
                    }
                    let newManapoints = Math.min(this.combatDetails.currentManapoints + manapoints, this.combatDetails.maxManapoints);
                    manapointsAdded = newManapoints - this.combatDetails.currentManapoints;
                    this.combatDetails.currentManapoints = newManapoints;
                    return manapointsAdded;
                }
            };
            var combatUnit_default = CombatUnit;
            var combatMonsterDetailMap_default = combatData_default.combatMonsterDetailMap;
            var Drops = class {
                constructor(itemHrid, dropRate, minCount, maxCount, difficultyTier) {
                    this.itemHrid = itemHrid;
                    this.dropRate = dropRate;
                    this.minCount = minCount;
                    this.maxCount = maxCount;
                    this.difficultyTier = difficultyTier;
                }
            };
            var drops_default = Drops;
            var Monster = class extends combatUnit_default {
                constructor(hrid, difficultyTier = 0, roomLevel = 0) {
                    super();
                    __publicField(this, "difficultyTier", 0);
                    __publicField(this, "LabyrinthMonsterBaseRoomLevel", 100);
                    __publicField(this, "roomLevel", 0);
                    this.isPlayer = false;
                    this.hrid = hrid;
                    this.difficultyTier = difficultyTier;
                    this.roomLevel = roomLevel;
                    if (this.roomLevel <= 0) {
                        this.roomLevel = this.LabyrinthMonsterBaseRoomLevel;
                    }
                    let gameMonster = combatMonsterDetailMap_default[this.hrid];
                    if (!gameMonster) {
                        throw new Error("No monster found for hrid: " + this.hrid);
                    }
                    this.enrageTime = gameMonster.enrageTime;
                    let labyrinthScaleFactor = this.roomLevel / this.LabyrinthMonsterBaseRoomLevel;
                    for (let i = 0; i < gameMonster.abilities.length; i++) {
                        if (gameMonster.abilities[i].minDifficultyTier > this.difficultyTier) {
                            continue;
                        }
                        this.abilities[i] = new ability_default(gameMonster.abilities[i].abilityHrid, Math.floor(gameMonster.abilities[i].level * labyrinthScaleFactor));
                    }
                    if (gameMonster.dropTable) for (let i = 0; i < gameMonster.dropTable.length; i++) {
                        this.dropTable[i] = new drops_default(gameMonster.dropTable[i].itemHrid, gameMonster.dropTable[i].dropRate, gameMonster.dropTable[i].minCount, gameMonster.dropTable[i].maxCount, gameMonster.dropTable[i].difficultyTier);
                    }
                    for (let i = 0; i < gameMonster.rareDropTable.length; i++) {
                        let dropTableItem = gameMonster.dropTable && i < gameMonster.dropTable.length ? gameMonster.dropTable[i] : null;
                        let difficultyTier2 = dropTableItem?.difficultyTier ?? gameMonster.rareDropTable[i].minDifficultyTier;
                        this.rareDropTable[i] = new drops_default(gameMonster.rareDropTable[i].itemHrid, gameMonster.rareDropTable[i].dropRate, gameMonster.rareDropTable[i].minCount, difficultyTier2);
                    }
                }
                updateCombatDetails() {
                    let gameMonster = combatMonsterDetailMap_default[this.hrid];
                    let levelMultiplier = 1 + .25 * this.difficultyTier;
                    let defLevelMultiplier = 1 + .15 * this.difficultyTier;
                    let levelBonus = 20 * this.difficultyTier;
                    let labyrinthScaleFactor = this.roomLevel / this.LabyrinthMonsterBaseRoomLevel;
                    this.staminaLevel = levelMultiplier * (gameMonster.combatDetails.staminaLevel + levelBonus) * labyrinthScaleFactor;
                    this.intelligenceLevel = levelMultiplier * (gameMonster.combatDetails.intelligenceLevel + levelBonus) * labyrinthScaleFactor;
                    this.attackLevel = levelMultiplier * (gameMonster.combatDetails.attackLevel + levelBonus) * labyrinthScaleFactor;
                    this.meleeLevel = levelMultiplier * (gameMonster.combatDetails.meleeLevel + levelBonus) * labyrinthScaleFactor;
                    this.defenseLevel = defLevelMultiplier * (gameMonster.combatDetails.defenseLevel + levelBonus) * labyrinthScaleFactor;
                    this.rangedLevel = levelMultiplier * (gameMonster.combatDetails.rangedLevel + levelBonus) * labyrinthScaleFactor;
                    this.magicLevel = levelMultiplier * (gameMonster.combatDetails.magicLevel + levelBonus) * labyrinthScaleFactor;
                    let expMultiplier = 1 + .5 * this.difficultyTier;
                    let expBonus = 5 * this.difficultyTier;
                    this.experience = expMultiplier * (gameMonster.experience + expBonus);
                    this.combatDetails.combatStats.combatStyleHrid = gameMonster.combatDetails.combatStats.combatStyleHrids[0];
                    for (const [key, value] of Object.entries(gameMonster.combatDetails.combatStats)) {
                        this.combatDetails.combatStats[key] = value;
                    }
                    this.combatDetails.combatStats.armor *= labyrinthScaleFactor;
                    this.combatDetails.combatStats.waterResistance *= labyrinthScaleFactor;
                    this.combatDetails.combatStats.natureResistance *= labyrinthScaleFactor;
                    this.combatDetails.combatStats.fireResistance *= labyrinthScaleFactor;
                    [ "stabAccuracy", "slashAccuracy", "smashAccuracy", "rangedAccuracy", "magicAccuracy", "stabDamage", "slashDamage", "smashDamage", "rangedDamage", "magicDamage", "defensiveDamage", "taskDamage", "physicalAmplify", "waterAmplify", "natureAmplify", "fireAmplify", "healingAmplify", "stabEvasion", "slashEvasion", "smashEvasion", "rangedEvasion", "magicEvasion", "armor", "waterResistance", "natureResistance", "fireResistance", "maxHitpoints", "maxManapoints", "lifeSteal", "hpRegenPer10", "mpRegenPer10", "physicalThorns", "elementalThorns", "combatDropRate", "combatRareFind", "combatDropQuantity", "combatExperience", "criticalRate", "criticalDamage", "armorPenetration", "waterPenetration", "naturePenetration", "firePenetration", "abilityHaste", "tenacity", "manaLeech", "castSpeed", "threat", "parry", "mayhem", "pierce", "curse", "fury", "weaken", "ripple", "bloom", "blaze", "attackSpeed", "foodHaste", "drinkConcentration", "autoAttackDamage", "abilityDamage", "retaliation" ].forEach(stat => {
                        if (gameMonster.combatDetails.combatStats[stat] == null) {
                            this.combatDetails.combatStats[stat] = 0;
                        }
                    });
                    if (this.combatDetails.combatStats.attackInterval == 0) {
                        this.combatDetails.combatStats.attackInterval = gameMonster.combatDetails.attackInterval;
                    }
                    super.updateCombatDetails();
                }
            };
            var monster_default = Monster;
            var ONE_SECOND = 1e9;
            var HOT_TICK_INTERVAL = 5 * ONE_SECOND;
            var DOT_TICK_INTERVAL = 3 * ONE_SECOND;
            var REGEN_TICK_INTERVAL = 10 * ONE_SECOND;
            var ENEMY_RESPAWN_INTERVAL = 3 * ONE_SECOND;
            var PLAYER_RESPAWN_INTERVAL = 150 * ONE_SECOND;
            var RESTART_INTERVAL = 3 * ONE_SECOND;
            var ENRAGE_TICK_INTERVAL = 60 * ONE_SECOND;
            var CombatSimulator = class extends EventTarget {
                constructor(players, zone, labyrinth, options = {}) {
                    super();
                    this.players = players;
                    this.zone = zone;
                    this.labyrinth = labyrinth;
                    this.eventQueue = new eventQueue_default;
                    this.simResult = new simResult_default(zone, labyrinth, players.length);
                    this.allPlayersDead = false;
                    this.enableHpMpVisualization = options.enableHpMpVisualization || false;
                    this.wipeLogs = {
                        buffer: new Array(200),
                        index: 0,
                        count: 0,
                        maxSize: 200
                    };
                }
                addToWipeLogs(logEntry) {
                    const {buffer: buffer, maxSize: maxSize} = this.wipeLogs;
                    buffer[this.wipeLogs.index] = logEntry;
                    this.wipeLogs.index = (this.wipeLogs.index + 1) % maxSize;
                    this.wipeLogs.count = Math.min(this.wipeLogs.count + 1, maxSize);
                }
                logAndResetWipeLogs() {
                    const logs = this.getOrderedWipeLogs();
                    logs.forEach(log => {
                        if (log.error) {
                            console.log(log.error);
                            return;
                        }
                        const time = (log.time / 1e9).toFixed(2);
                    });
                    this.wipeLogs.index = 0;
                    this.wipeLogs.count = 0;
                }
                buildCombatLog(source, ability, target, damageDone) {
                    try {
                        const sourceHrid = source?.hrid || "UNKNOWN_SOURCE";
                        const targetHrid = target?.hrid || "UNKNOWN_TARGET";
                        const afterHp = target?.combatDetails?.currentHitpoints || 0;
                        const beforeHp = Math.max(0, afterHp + damageDone);
                        const playersHp = this.players.map(p => ({
                            hrid: p.hrid || "UNKNOWN_PLAYER",
                            current: p.combatDetails?.currentHitpoints ?? 0,
                            max: p.combatDetails?.maxHitpoints ?? 0
                        }));
                        return {
                            time: this.simulationTime,
                            wave: this.zone.encountersKilled - 1,
                            source: sourceHrid,
                            ability: ability,
                            target: targetHrid,
                            damage: damageDone,
                            beforeHp: beforeHp,
                            afterHp: afterHp,
                            playersHp: playersHp,
                            isCrit: false
                        };
                    } catch (e) {
                        return {
                            error: `[日志生成错误] ${e.message}`
                        };
                    }
                }
                generateCombatLog(source, ability, target, attackResult) {
                    try {
                        const sourceHrid = source?.hrid || "UNKNOWN_SOURCE";
                        const targetHrid = target?.hrid || "UNKNOWN_TARGET";
                        const damage = attackResult?.damageDone || 0;
                        const afterHp = target?.combatDetails?.currentHitpoints || 0;
                        const beforeHp = Math.max(0, afterHp + damage);
                        const playersHp = this.players.map(p => ({
                            hrid: p.hrid || "UNKNOWN_PLAYER",
                            current: p.combatDetails?.currentHitpoints ?? 0,
                            max: p.combatDetails?.maxHitpoints ?? 0
                        }));
                        return {
                            time: this.simulationTime,
                            wave: this.zone.encountersKilled - 1,
                            source: sourceHrid,
                            ability: ability,
                            target: targetHrid,
                            damage: damage,
                            beforeHp: beforeHp,
                            afterHp: afterHp,
                            playersHp: playersHp,
                            isCrit: attackResult?.isCrit || false
                        };
                    } catch (e) {
                        return {
                            error: `[日志生成错误] ${e.message}`
                        };
                    }
                }
                getOrderedWipeLogs() {
                    const {buffer: buffer, maxSize: maxSize, count: count} = this.wipeLogs;
                    const logs = [];
                    for (let i = 0; i < count; i++) {
                        const idx = (this.wipeLogs.index - count + maxSize + i) % maxSize;
                        logs.push(buffer[idx]);
                    }
                    return logs;
                }
                saveWipeLogsToSimResult(wave) {
                    const logs = this.getOrderedWipeLogs();
                    this.simResult.addWipeEvent(logs, this.simulationTime, wave);
                }
                async simulate(simulationTimeLimit) {
                    this.reset();
                    let ticks = 0;
                    let combatStartEvent = new combatStartEvent_default(0);
                    this.eventQueue.addEvent(combatStartEvent);
                    while (this.simulationTime < simulationTimeLimit) {
                        let nextEvent = this.eventQueue.getNextEvent();
                        await this.processEvent(nextEvent);
                        ticks++;
                        if (ticks == 1e3) {
                            ticks = 0;
                            if (this.enableHpMpVisualization) {
                                this.simResult.addTimeSeriesSnapshot(this.simulationTime, this.players);
                            }
                            let progressEvent = new CustomEvent("progress", {
                                detail: {
                                    zone: this.zone?.hrid,
                                    difficultyTier: this.zone?.difficultyTier,
                                    labyrinth: this.labyrinth?.hrid,
                                    roomLevel: this.labyrinth?.roomLevel,
                                    progress: Math.min(this.simulationTime / simulationTimeLimit, 1),
                                    timeSeriesData: this.enableHpMpVisualization ? this.simResult.timeSeriesData : null
                                }
                            });
                            this.dispatchEvent(progressEvent);
                        }
                    }
                    this.simResult.isDungeon = this.zone?.isDungeon ?? false;
                    if (this.zone && this.simResult.isDungeon) {
                        console.log("Timeout now at wave #" + (this.zone.encountersKilled - 1));
                        this.simResult.dungeonsCompleted = this.zone.dungeonsCompleted;
                        this.simResult.dungeonsFailed = this.zone.dungeonsFailed;
                        if (this.simResult.dungeonsCompleted < 1) {
                            this.simResult.maxWaveReached = 0;
                            for (let i = 1; i <= this.zone.dungeonSpawnInfo.maxWaves; i++) {
                                let waveName = "#" + i.toString();
                                const idx = this.simResult.timeSpentAlive.findIndex(e => e.name === waveName);
                                if (idx == -1 || this.simResult.timeSpentAlive[idx].count == 0) {
                                    break;
                                }
                                this.simResult.maxWaveReached = i;
                            }
                        } else {
                            this.simResult.maxWaveReached = this.zone.dungeonSpawnInfo.maxWaves;
                        }
                    }
                    for (let index = 0; index < this.simResult.timeSpentAlive.length; index++) {
                        const entry = this.simResult.timeSpentAlive[index];
                        if (entry.alive === true) {
                            this.simResult.updateTimeSpentAlive(entry.name, false, this.simulationTime);
                        }
                    }
                    this.simResult.simulatedTime = this.simulationTime;
                    for (let i = 0; i < this.players.length; i++) {
                        this.simResult.setDropRateMultipliers(this.players[i]);
                        this.simResult.setManaUsed(this.players[i]);
                    }
                    if (this.zone?.isDungeon) {
                        Object.entries(this.zone.dungeonSpawnInfo.fixedSpawnsMap).forEach(([wave, monsters]) => {
                            let waveName = "#" + wave.toString();
                            monsters.forEach(monster => {
                                waveName += "," + monster.combatMonsterHrid;
                            });
                            this.simResult.bossSpawns.push(waveName);
                        });
                    }
                    if (this.zone?.isDungeon && this.zone.monsterSpawnInfo.bossSpawns) {
                        for (const boss of this.zone.monsterSpawnInfo.bossSpawns) {
                            this.simResult.bossSpawns.push(boss.combatMonsterHrid);
                        }
                    }
                    if (this.labyrinth) {
                        this.simResult.labyAttemptCount = this.labyrinth.attemptCount;
                    }
                    return this.simResult;
                }
                reset() {
                    this.tempDungeonCount = 0;
                    this.simulationTime = 0;
                    this.eventQueue.clear();
                    this.simResult = new simResult_default(this.zone, this.labyrinth, this.players.length);
                }
                async processEvent(event) {
                    this.simulationTime = event.time;
                    switch (event.type) {
                      case combatStartEvent_default.type:
                        this.processCombatStartEvent(event);
                        break;
        
                      case playerRespawnEvent_default.type:
                        this.processPlayerRespawnEvent(event);
                        break;
        
                      case enemyRespawnEvent_default.type:
                        this.processEnemyRespawnEvent(event);
                        break;
        
                      case autoAttackEvent_default.type:
                        this.processAutoAttackEvent(event);
                        break;
        
                      case consumableTickEvent_default.type:
                        this.processConsumableTickEvent(event);
                        break;
        
                      case damageOverTimeEvent_default.type:
                        this.processDamageOverTimeTickEvent(event);
                        break;
        
                      case checkBuffExpirationEvent_default.type:
                        this.processCheckBuffExpirationEvent(event);
                        break;
        
                      case regenTickEvent_default.type:
                        this.processRegenTickEvent(event);
                        break;
        
                      case stunExpirationEvent_default.type:
                        this.processStunExpirationEvent(event);
                        break;
        
                      case blindExpirationEvent_default.type:
                        this.processBlindExpirationEvent(event);
                        break;
        
                      case silenceExpirationEvent_default.type:
                        this.processSilenceExpirationEvent(event);
                        break;
        
                      case curseExpirationEvent_default.type:
                        this.processCurseExpirationEvent(event);
                        break;
        
                      case weakenExpirationEvent_default.type:
                        this.processWeakenExpirationEvent(event);
                        break;
        
                      case furyExpirationEvent_default.type:
                        this.processFuryExpirationEvent(event);
                        break;
        
                      case enrageTickEvent_default.type:
                        this.processEnrageTickEvent(event);
                        break;
        
                      case abilityCastEndEvent_default.type:
                        this.tryUseAbility(event.source, event.ability);
                        break;
        
                      case awaitCooldownEvent_default.type:
                        this.addNextAttackEvent(event.source);
                        break;
        
                      case cooldownReadyEvent_default.type:
                        break;
                    }
                    this.checkTriggers();
                }
                processCombatStartEvent(event) {
                    for (let i = 0; i < this.players.length; i++) {
                        if (event.time == 0) {
                            this.players[i].generatePermanentBuffs();
                        }
                        if (this.labyrinth) {
                            this.players[i].reset();
                        } else {
                            this.players[i].reset(this.simulationTime);
                        }
                    }
                    let regenTickEvent = new regenTickEvent_default(this.simulationTime + REGEN_TICK_INTERVAL);
                    this.eventQueue.addEvent(regenTickEvent);
                    this.startNewEncounter();
                }
                processPlayerRespawnEvent(event) {
                    let respawningPlayer = this.players.find(player => player.hrid === event.hrid);
                    respawningPlayer.combatDetails.currentHitpoints = respawningPlayer.combatDetails.maxHitpoints;
                    respawningPlayer.combatDetails.currentManapoints = respawningPlayer.combatDetails.maxManapoints;
                    respawningPlayer.clearBuffs();
                    respawningPlayer.clearCCs();
                    if (this.allPlayersDead) {
                        this.allPlayersDead = false;
                        this.startAttacks();
                    } else {
                        this.addNextAttackEvent(respawningPlayer);
                    }
                }
                processEnemyRespawnEvent(event) {
                    this.startNewEncounter();
                }
                startNewEncounter() {
                    if (this.allPlayersDead) {
                        this.allPlayersDead = false;
                        if (this.zone) {
                            this.zone.failWave();
                        }
                    }
                    if (this.zone) {
                        if (!this.zone.isDungeon) {
                            this.enemies = this.zone.getRandomEncounter();
                        } else {
                            this.enemies = this.zone.getNextWave();
                            this.simResult.updateTimeSpentAlive("#" + (this.zone.encountersKilled - 1).toString(), true, this.simulationTime);
                            let currentDungeonCount = this.zone.dungeonsCompleted;
                            if (currentDungeonCount > this.tempDungeonCount) {
                                this.tempDungeonCount = currentDungeonCount;
                                for (let i = 0; i < this.players.length; i++) {
                                    this.players[i].combatDetails.currentHitpoints = this.players[i].combatDetails.maxHitpoints;
                                    this.players[i].combatDetails.currentManapoints = this.players[i].combatDetails.maxManapoints;
                                }
                            }
                        }
                    }
                    if (this.labyrinth) {
                        this.enemies = this.labyrinth.getMonster();
                        this.labyrinth.updateEnconterStartTime(this.simulationTime);
                    }
                    this.enemies.forEach(enemy => {
                        enemy.reset(this.simulationTime);
                        this.simResult.updateTimeSpentAlive(enemy.hrid, true, this.simulationTime);
                    });
                    this.eventQueue.clearEventsOfType(enrageTickEvent_default.type);
                    let enrageTickEvent = new enrageTickEvent_default(this.simulationTime + ENRAGE_TICK_INTERVAL, ENRAGE_TICK_INTERVAL);
                    this.eventQueue.addEvent(enrageTickEvent);
                    this.enrageBeginTime = this.simulationTime;
                    this.eventQueue.clearEventsOfType(abilityCastEndEvent_default.type);
                    this.checkTriggers();
                    this.startAttacks();
                }
                startAttacks() {
                    let units = [ ...this.players ];
                    if (this.enemies) {
                        units.push(...this.enemies);
                    }
                    for (const unit of units) {
                        if (unit.combatDetails.currentHitpoints <= 0) {
                            continue;
                        }
                        this.addNextAttackEvent(unit);
                    }
                }
                checkParry(targets) {
                    let parryUnits = targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0 && unit.combatDetails.combatStats.parry > 0);
                    if (parryUnits.length <= 0) {
                        return void 0;
                    }
                    let randomIndex = Math.floor(Math.random() * parryUnits.length);
                    if (parryUnits[randomIndex].combatDetails.combatStats.parry > Math.random()) {
                        return parryUnits[randomIndex];
                    }
                    return void 0;
                }
                processAutoAttackEvent(event) {
                    let targets = event.source.isPlayer ? this.enemies : this.players;
                    if (!targets) {
                        return;
                    }
                    const aliveTargets = targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0);
                    for (let i = 0; i < aliveTargets.length; i++) {
                        let target = aliveTargets[i];
                        if (!event.source.isPlayer && aliveTargets.length > 1) {
                            let cumulativeThreat = 0;
                            let cumulativeRanges = [];
                            aliveTargets.forEach(player => {
                                let playerThreat = player.combatDetails.combatStats.threat;
                                cumulativeThreat += playerThreat;
                                cumulativeRanges.push({
                                    player: player,
                                    rangeStart: cumulativeThreat - playerThreat,
                                    rangeEnd: cumulativeThreat
                                });
                            });
                            let randomValueHit = Math.random() * cumulativeThreat;
                            target = cumulativeRanges.find(range => randomValueHit >= range.rangeStart && randomValueHit < range.rangeEnd).player;
                        }
                        let source = event.source;
                        let parryTarget = this.checkParry(targets);
                        if (parryTarget) {
                            target = source;
                            source = parryTarget;
                        }
                        let attackResult = combatUtilities_default.processAttack(source, target);
                        if (this.zone?.isDungeon && target.isPlayer && attackResult.didHit && attackResult.damageDone > 0) {
                            const log = this.generateCombatLog(source, "autoAttack", target, attackResult);
                            this.addToWipeLogs(log);
                        }
                        let mayhem = source.combatDetails.combatStats.mayhem > Math.random();
                        if (attackResult.didHit && source.combatDetails.combatStats.curse > 0) {
                            const curseExpireTime = 15e9;
                            let currentCurseEvent = this.eventQueue.getMatching(event2 => event2.type == curseExpirationEvent_default.type && event2.source == target);
                            let currentCurseAmount = 0;
                            if (currentCurseEvent) currentCurseAmount = currentCurseEvent.curseAmount;
                            this.eventQueue.clearMatching(event2 => event2.type == curseExpirationEvent_default.type && event2.source == target);
                            let curseExpirationEvent = new curseExpirationEvent_default(this.simulationTime + curseExpireTime, currentCurseAmount, target);
                            const curseBuff = {
                                uniqueHrid: "/buff_uniques/curse",
                                typeHrid: "/buff_types/damage_taken",
                                ratioBoost: 0,
                                ratioBoostLevelBonus: 0,
                                flatBoost: source.combatDetails.combatStats.curse * curseExpirationEvent.curseAmount,
                                flatBoostLevelBonus: 0,
                                startTime: "0001-01-01T00:00:00Z",
                                duration: curseExpireTime
                            };
                            target.addBuff(curseBuff, this.simulationTime);
                            this.eventQueue.addEvent(curseExpirationEvent);
                        }
                        if (source.combatDetails.combatStats.fury > 0) {
                            let currentFuryEvent = this.eventQueue.getMatching(event2 => event2.type == furyExpirationEvent_default.type && event2.source == source);
                            this.eventQueue.clearMatching(event2 => event2.type == furyExpirationEvent_default.type && event2.source == source);
                            const furyExpireTime = 15e9;
                            const maxFuryStack = 5;
                            let furyAmount = 0;
                            if (currentFuryEvent) furyAmount = currentFuryEvent.furyAmount;
                            if (attackResult.didHit) {
                                furyAmount = Math.min(furyAmount + 1, maxFuryStack);
                            } else {
                                furyAmount = furyAmount / 2;
                            }
                            const furyAccuracyBuf = {
                                uniqueHrid: "/buff_uniques/fury_accuracy",
                                typeHrid: "/buff_types/fury_accuracy",
                                ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                                ratioBoostLevelBonus: 0,
                                flatBoost: 0,
                                flatBoostLevelBonus: 0,
                                startTime: "0001-01-01T00:00:00Z",
                                duration: furyExpireTime
                            };
                            const furyDamageBuf = {
                                uniqueHrid: "/buff_uniques/fury_damage",
                                typeHrid: "/buff_types/fury_damage",
                                ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                                ratioBoostLevelBonus: 0,
                                flatBoost: 0,
                                flatBoostLevelBonus: 0,
                                startTime: "0001-01-01T00:00:00Z",
                                duration: furyExpireTime
                            };
                            if (furyAmount > 0) {
                                let furyExpirationEvent = new furyExpirationEvent_default(this.simulationTime + furyExpireTime, furyAmount, source);
                                this.eventQueue.addEvent(furyExpirationEvent);
                                source.addBuffs([ furyAccuracyBuf, furyDamageBuf ], this.simulationTime);
                            } else {
                                source.removeBuffs([ furyAccuracyBuf, furyDamageBuf ]);
                            }
                        }
                        if (target.combatDetails.combatStats.weaken > 0) {
                            const weakenExpireTime = 15e9;
                            let currentWeakenEvent = this.eventQueue.getMatching(event2 => event2.type == weakenExpirationEvent_default.type && event2.source == source);
                            let weakenAmount = 0;
                            if (currentWeakenEvent) weakenAmount = currentWeakenEvent.weakenAmount;
                            this.eventQueue.clearMatching(event2 => event2.type == weakenExpirationEvent_default.type && event2.source == source);
                            let weakenExpirationEvent = new weakenExpirationEvent_default(this.simulationTime + 15e9, weakenAmount, source);
                            const weakenBuff = {
                                uniqueHrid: "/buff_uniques/weaken",
                                typeHrid: "/buff_types/damage",
                                ratioBoost: -1 * target.combatDetails.combatStats.weaken * weakenExpirationEvent.weakenAmount,
                                ratioBoostLevelBonus: 0,
                                flatBoost: 0,
                                flatBoostLevelBonus: 0,
                                startTime: "0001-01-01T00:00:00Z",
                                duration: weakenExpireTime
                            };
                            source.addBuff(weakenBuff, this.simulationTime);
                            this.eventQueue.addEvent(weakenExpirationEvent);
                        }
                        if (!mayhem || mayhem && attackResult.didHit || mayhem && i == aliveTargets.length - 1) {
                            let attackType = "autoAttack";
                            if (parryTarget) attackType = "parry";
                            this.simResult.addAttack(source, target, attackType, attackResult.didHit ? attackResult.damageDone : "miss");
                        }
                        if (attackResult.lifeStealHeal > 0) {
                            this.simResult.addHitpointsGained(source, "lifesteal", attackResult.lifeStealHeal);
                        }
                        if (attackResult.manaLeechMana > 0) {
                            this.simResult.addManapointsGained(source, "manaLeech", attackResult.manaLeechMana);
                        }
                        if (attackResult.thornDamageDone > 0) {
                            this.simResult.addAttack(target, source, attackResult.thornType, attackResult.thornDamageDone);
                        }
                        if (this.zone?.isDungeon && attackResult.thornDamageDone > 0 && source.isPlayer) {
                            const log = this.buildCombatLog(target, attackResult.thornType, source, attackResult.thornDamageDone);
                            this.addToWipeLogs(log);
                        }
                        if (target.combatDetails.combatStats.retaliation > 0) {
                            this.simResult.addAttack(target, source, "retaliation", attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : "miss");
                        }
                        if (this.zone?.isDungeon && attackResult.retaliationDamageDone > 0 && source.isPlayer) {
                            const log = this.buildCombatLog(target, "retaliation", source, attackResult.retaliationDamageDone);
                            this.addToWipeLogs(log);
                        }
                        if (target.combatDetails.currentHitpoints == 0) {
                            this.eventQueue.clearEventsForUnit(target);
                            this.simResult.addDeath(target);
                            if (!target.isPlayer) {
                                this.simResult.updateTimeSpentAlive(target.hrid, false, this.simulationTime);
                            }
                        }
                        if (source.combatDetails.currentHitpoints == 0 && (attackResult.thornDamageDone != 0 || attackResult.retaliationDamageDone != 0)) {
                            this.eventQueue.clearEventsForUnit(source);
                            this.simResult.addDeath(source);
                            if (!source.isPlayer) {
                                this.simResult.updateTimeSpentAlive(source.hrid, false, this.simulationTime);
                            }
                            break;
                        }
                        if (mayhem && !attackResult.didHit) {
                            continue;
                        }
                        if (!attackResult.didHit || parryTarget || source.combatDetails.combatStats.pierce <= Math.random()) {
                            break;
                        }
                    }
                    if (!this.checkEncounterEnd()) {
                        this.addNextAttackEvent(event.source);
                    }
                }
                checkEncounterEnd() {
                    if (this.enemies) {
                        let deadEnemies = this.enemies.filter(enemy => enemy.combatDetails.currentHitpoints <= 0 && enemy.experienceRate == 0);
                        if (deadEnemies.length > 0) {
                            deadEnemies.forEach(enemy => {
                                let aliveDuration = this.simulationTime - this.enrageBeginTime;
                                if (aliveDuration > enemy.enrageTime) {
                                    aliveDuration = enemy.enrageTime;
                                }
                                enemy.experienceRate = 1 + aliveDuration / enemy.enrageTime;
                            });
                        }
                    }
                    let encounterEnded = false;
                    if (this.enemies && !this.enemies.some(enemy => enemy.combatDetails.currentHitpoints > 0)) {
                        this.eventQueue.clearEventsOfType(autoAttackEvent_default.type);
                        let enemyRespawnEvent = new enemyRespawnEvent_default(this.simulationTime + ENEMY_RESPAWN_INTERVAL);
                        this.eventQueue.addEvent(enemyRespawnEvent);
                        if (this.enemies.some(enemy => enemy.experienceRate <= 0)) {
                            console.log("WARN: Some enemies have no experience rate");
                        }
                        let totalExp = this.enemies.map(enemy => enemy.experience * enemy.experienceRate).reduce((a, b) => a + b, 0);
                        this.players.forEach(player => {
                            this.simResult.addExperienceGain(player, totalExp / this.players.length);
                        });
                        this.enemies = null;
                        if (this.zone?.isDungeon) {
                            this.simResult.updateTimeSpentAlive("#" + (this.zone.encountersKilled - 1).toString(), false, this.simulationTime);
                            if (this.zone.encountersKilled > this.zone.dungeonSpawnInfo.maxWaves) {
                                this.simResult.updateDungenonFinish("#1", this.simulationTime);
                                this.simResult.lastDungeonFinishTime = this.simulationTime;
                            }
                        }
                        this.simResult.addEncounterEnd();
                        this.simResult.lastEncounterFinishTime = this.simulationTime;
                        encounterEnded = true;
                    }
                    this.players.forEach(player => {
                        if (player.combatDetails.currentHitpoints <= 0 && !this.eventQueue.containsEventOfTypeAndHrid(playerRespawnEvent_default.type, player.hrid)) {
                            if (this.zone && !this.zone.isDungeon) {
                                let playerRespawnEvent = new playerRespawnEvent_default(this.simulationTime + PLAYER_RESPAWN_INTERVAL, player.hrid);
                                this.eventQueue.addEvent(playerRespawnEvent);
                            }
                            this.simResult.addRanOutOfManaCount(player, false, this.simulationTime);
                        }
                    });
                    if (!this.players.some(player => player.combatDetails.currentHitpoints > 0)) {
                        if (this.zone) {
                            if (this.zone.isDungeon) {
                                console.log("All Players died at wave #" + (this.zone.encountersKilled - 1) + " with ememies: " + this.enemies.map(enemy => enemy.hrid + "(" + (enemy.combatDetails.currentHitpoints * 100 / enemy.combatDetails.maxHitpoints).toFixed(2) + "%)").join(", "));
                                this.saveWipeLogsToSimResult(this.zone.encountersKilled - 1);
                                this.wipeLogs.index = 0;
                                this.wipeLogs.count = 0;
                                this.eventQueue.clearEventsOfType(autoAttackEvent_default.type);
                                this.eventQueue.clearEventsOfType(abilityCastEndEvent_default.type);
                                this.eventQueue.clearEventsOfType(damageOverTimeEvent_default.type);
                                this.eventQueue.clearEventsOfType(consumableTickEvent_default.type);
                                this.eventQueue.clearEventsOfType(regenTickEvent_default.type);
                                this.eventQueue.clearEventsOfType(enrageTickEvent_default.type);
                                this.eventQueue.clearEventsOfType(stunExpirationEvent_default.type);
                                this.eventQueue.clearEventsOfType(blindExpirationEvent_default.type);
                                this.eventQueue.clearEventsOfType(silenceExpirationEvent_default.type);
                                this.eventQueue.clearEventsOfType(awaitCooldownEvent_default.type);
                                this.enemies = null;
                                let combatStartEvent = new combatStartEvent_default(this.simulationTime + RESTART_INTERVAL);
                                this.eventQueue.addEvent(combatStartEvent);
                            } else {
                                this.eventQueue.clearEventsOfType(autoAttackEvent_default.type);
                                this.eventQueue.clearEventsOfType(abilityCastEndEvent_default.type);
                            }
                        }
                        encounterEnded = true;
                        this.allPlayersDead = true;
                    }
                    if (this.labyrinth && (this.labyrinth.checkTimeout(this.simulationTime) || encounterEnded)) {
                        this.enemies = null;
                        encounterEnded = true;
                        this.eventQueue.clear();
                        let combatStartEvent = new combatStartEvent_default(this.simulationTime);
                        this.eventQueue.addEvent(combatStartEvent);
                    }
                    return encounterEnded;
                }
                addNextAttackEvent(source) {
                    if (this.eventQueue.getMatching(event => (event.type == abilityCastEndEvent_default.type || event.type == autoAttackEvent_default.type) && event.source == source)) {
                        return;
                    }
                    let target;
                    let friendlies;
                    let enemies;
                    if (source.isPlayer) {
                        target = combatUtilities_default.getTarget(this.enemies);
                        friendlies = this.players;
                        enemies = this.enemies;
                    } else {
                        target = combatUtilities_default.getTarget(this.players);
                        friendlies = this.enemies;
                        enemies = this.players;
                    }
                    let usedAbility = false;
                    let skipNextAbility = false;
                    source.abilities.filter(ability => ability != null).forEach(ability => {
                        if (!usedAbility && !skipNextAbility && ability.shouldTrigger(this.simulationTime, source, target, friendlies, enemies)) {
                            if (!this.canUseAbility(source, ability, true)) {
                                skipNextAbility = true;
                            }
                            if (!skipNextAbility) {
                                let castDuration = ability.castDuration;
                                castDuration /= 1 + source.combatDetails.combatStats.castSpeed;
                                let abilityCastEndEvent = new abilityCastEndEvent_default(this.simulationTime + castDuration, source, ability);
                                this.eventQueue.addEvent(abilityCastEndEvent);
                                usedAbility = true;
                            }
                        }
                    });
                    if (usedAbility) {
                        source.isOutOfMana = false;
                        return;
                    }
                    if (!enemies) {
                        return;
                    }
                    if (!source.isBlinded) {
                        let autoAttackEvent = new autoAttackEvent_default(this.simulationTime + source.combatDetails.combatStats.attackInterval, source);
                        this.eventQueue.addEvent(autoAttackEvent);
                    } else {
                        source.isOutOfMana = true;
                    }
                }
                processConsumableTickEvent(event) {
                    if (event.consumable.hitpointRestore > 0) {
                        let tickValue = combatUtilities_default.calculateTickValue(event.consumable.hitpointRestore, event.totalTicks, event.currentTick);
                        let hitpointsAdded = event.source.addHitpoints(tickValue);
                        this.simResult.addHitpointsGained(event.source, event.consumable.hrid, hitpointsAdded);
                    }
                    if (event.consumable.manapointRestore > 0) {
                        let tickValue = combatUtilities_default.calculateTickValue(event.consumable.manapointRestore, event.totalTicks, event.currentTick);
                        let manapointsAdded = event.source.addManapoints(tickValue);
                        this.simResult.addManapointsGained(event.source, event.consumable.hrid, manapointsAdded);
                        if (event.source.isOutOfMana) {
                            let awaitCooldownEvent = new awaitCooldownEvent_default(this.simulationTime, event.source);
                            this.eventQueue.addEvent(awaitCooldownEvent);
                        }
                    }
                    if (event.currentTick < event.totalTicks) {
                        let consumableTickEvent = new consumableTickEvent_default(this.simulationTime + HOT_TICK_INTERVAL, event.source, event.consumable, event.totalTicks, event.currentTick + 1);
                        this.eventQueue.addEvent(consumableTickEvent);
                    }
                }
                processDamageOverTimeTickEvent(event) {
                    let tickDamage = combatUtilities_default.calculateTickValue(event.damage, event.totalTicks, event.currentTick);
                    let damage = Math.min(tickDamage, event.target.combatDetails.currentHitpoints);
                    event.target.combatDetails.currentHitpoints -= damage;
                    this.simResult.addAttack(event.sourceRef, event.target, "damageOverTime", damage);
                    if (this.zone?.isDungeon && event.target.isPlayer) {
                        const log = this.buildCombatLog("", "damageOverTime", event.target, damage);
                        this.addToWipeLogs(log);
                    }
                    if (event.currentTick < event.totalTicks) {
                        let damageOverTimeTickEvent = new damageOverTimeEvent_default(this.simulationTime + DOT_TICK_INTERVAL, event.sourceRef, event.target, event.damage, event.totalTicks, event.currentTick + 1, event.combatStyleHrid);
                        this.eventQueue.addEvent(damageOverTimeTickEvent);
                    }
                    if (event.target.combatDetails.currentHitpoints == 0) {
                        this.eventQueue.clearEventsForUnit(event.target);
                        this.simResult.addDeath(event.target);
                        if (!event.target.isPlayer) {
                            this.simResult.updateTimeSpentAlive(event.target.hrid, false, this.simulationTime);
                        }
                    }
                    this.checkEncounterEnd();
                }
                processRegenTickEvent(event) {
                    let units = [ ...this.players ];
                    for (const unit of units) {
                        if (unit.combatDetails.currentHitpoints <= 0) {
                            continue;
                        }
                        let hitpointRegen = Math.floor(unit.combatDetails.maxHitpoints * unit.combatDetails.combatStats.hpRegenPer10);
                        let hitpointsAdded = unit.addHitpoints(hitpointRegen);
                        this.simResult.addHitpointsGained(unit, "regen", hitpointsAdded);
                        let manapointRegen = Math.floor(unit.combatDetails.maxManapoints * unit.combatDetails.combatStats.mpRegenPer10);
                        let manapointsAdded = unit.addManapoints(manapointRegen);
                        this.simResult.addManapointsGained(unit, "regen", manapointsAdded);
                        if (unit.isOutOfMana) {
                            let awaitCooldownEvent = new awaitCooldownEvent_default(this.simulationTime, unit);
                            this.eventQueue.addEvent(awaitCooldownEvent);
                        }
                    }
                    let regenTickEvent = new regenTickEvent_default(this.simulationTime + REGEN_TICK_INTERVAL);
                    this.eventQueue.addEvent(regenTickEvent);
                }
                processCheckBuffExpirationEvent(event) {
                    event.source.removeExpiredBuffs(this.simulationTime);
                }
                processStunExpirationEvent(event) {
                    event.source.isStunned = false;
                    this.addNextAttackEvent(event.source);
                }
                processBlindExpirationEvent(event) {
                    event.source.isBlinded = false;
                    this.addNextAttackEvent(event.source);
                }
                processSilenceExpirationEvent(event) {
                    event.source.isSilenced = false;
                }
                processCurseExpirationEvent(event) {
                    event.source.removeExpiredBuffs(this.simulationTime);
                }
                processWeakenExpirationEvent(event) {
                    event.source.removeExpiredBuffs(this.simulationTime);
                }
                processFuryExpirationEvent(event) {
                    event.source.removeExpiredBuffs(this.simulationTime);
                    console.log("Fury Timeout");
                }
                processEnrageTickEvent(event) {
                    if (!this.enemies) return;
                    const maxEnrageStack = 10;
                    this.enemies.filter(enemy => enemy.combatDetails.currentHitpoints > 0).forEach(enemy => {
                        let nowStack = Math.min(maxEnrageStack, Math.floor(event.encounterTime / enemy.enrageTime));
                        if (nowStack <= 0) {
                            return;
                        }
                        console.log(enemy.hrid, nowStack, " stack Enrage at ", event.encounterTime / ONE_SECOND);
                        const enrageDamageBuff = {
                            uniqueHrid: "/buff_uniques/enrage_damage",
                            typeHrid: "/buff_types/damage",
                            ratioBoost: nowStack * .1,
                            ratioBoostLevelBonus: 0,
                            flatBoost: 0,
                            flatBoostLevelBonus: 0,
                            startTime: "0001-01-01T00:00:00Z",
                            duration: ENRAGE_TICK_INTERVAL
                        };
                        const enrageAccuracyBuff = {
                            uniqueHrid: "/buff_uniques/enrage_accuracy",
                            typeHrid: "/buff_types/accuracy",
                            ratioBoost: nowStack * .1,
                            ratioBoostLevelBonus: 0,
                            flatBoost: 0,
                            flatBoostLevelBonus: 0,
                            startTime: "0001-01-01T00:00:00Z",
                            duration: ENRAGE_TICK_INTERVAL
                        };
                        enemy.addBuffs([ enrageDamageBuff, enrageAccuracyBuff ]);
                        this.simResult.maxEnrageStack = Math.max(this.simResult.maxEnrageStack, nowStack);
                    });
                    let enrageTickEvent = new enrageTickEvent_default(this.simulationTime + ENRAGE_TICK_INTERVAL, event.encounterTime + ENRAGE_TICK_INTERVAL);
                    this.eventQueue.addEvent(enrageTickEvent);
                }
                checkTriggers() {
                    let triggeredSomething;
                    do {
                        triggeredSomething = false;
                        this.players.filter(player => player.combatDetails.currentHitpoints > 0).forEach(player => {
                            if (this.checkTriggersForUnit(player, this.players, this.enemies)) {
                                triggeredSomething = true;
                            }
                        });
                        if (this.enemies) {
                            this.enemies.filter(enemy => enemy.combatDetails.currentHitpoints > 0).forEach(enemy => {
                                if (this.checkTriggersForUnit(enemy, this.enemies, this.players)) {
                                    triggeredSomething = true;
                                }
                            });
                        }
                    } while (triggeredSomething);
                }
                checkTriggersForUnit(unit, friendlies, enemies) {
                    if (unit.combatDetails.currentHitpoints <= 0) {
                        throw new Error("Checking triggers for a dead unit");
                    }
                    let triggeredSomething = false;
                    let target = combatUtilities_default.getTarget(enemies);
                    for (const food of unit.food) {
                        if (food && food.shouldTrigger(this.simulationTime, unit, target, friendlies, enemies)) {
                            let result = this.tryUseConsumable(unit, food);
                            if (result) {
                                triggeredSomething = true;
                            }
                        }
                    }
                    for (const drink of unit.drinks) {
                        if (drink && drink.shouldTrigger(this.simulationTime, unit, target, friendlies, enemies)) {
                            let result = this.tryUseConsumable(unit, drink);
                            if (result) {
                                triggeredSomething = true;
                            }
                        }
                    }
                    return triggeredSomething;
                }
                tryUseConsumable(source, consumable) {
                    if (source.combatDetails.currentHitpoints <= 0) {
                        return false;
                    }
                    consumable.lastUsed = this.simulationTime;
                    let consumeCooldown = consumable.cooldownDuration;
                    if (source.combatDetails.combatStats.drinkConcentration > 0 && consumable.catagoryHrid.includes("drink")) {
                        consumeCooldown = consumeCooldown / (1 + source.combatDetails.combatStats.drinkConcentration);
                    } else if (source.combatDetails.combatStats.foodHaste > 0 && consumable.catagoryHrid.includes("food")) {
                        consumeCooldown = consumeCooldown / (1 + source.combatDetails.combatStats.foodHaste);
                    }
                    let cooldownReadyEvent = new cooldownReadyEvent_default(this.simulationTime + consumeCooldown);
                    this.eventQueue.addEvent(cooldownReadyEvent);
                    this.simResult.addConsumableUse(source, consumable);
                    if (consumable.recoveryDuration == 0) {
                        if (consumable.hitpointRestore > 0) {
                            let hitpointsAdded = source.addHitpoints(consumable.hitpointRestore);
                            this.simResult.addHitpointsGained(source, consumable.hrid, hitpointsAdded);
                        }
                        if (consumable.manapointRestore > 0) {
                            let manapointsAdded = source.addManapoints(consumable.manapointRestore);
                            this.simResult.addManapointsGained(source, consumable.hrid, manapointsAdded);
                            if (source.isOutOfMana) {
                                let awaitCooldownEvent = new awaitCooldownEvent_default(this.simulationTime, source);
                                this.eventQueue.addEvent(awaitCooldownEvent);
                            }
                        }
                    } else {
                        let consumableTickEvent = new consumableTickEvent_default(this.simulationTime + HOT_TICK_INTERVAL, source, consumable, consumable.recoveryDuration / HOT_TICK_INTERVAL, 1);
                        this.eventQueue.addEvent(consumableTickEvent);
                    }
                    for (const buff of consumable.buffs) {
                        let currentBuff = structuredClone(buff);
                        if (source.combatDetails.combatStats.drinkConcentration > 0 && consumable.catagoryHrid.includes("drink")) {
                            currentBuff.ratioBoost *= 1 + source.combatDetails.combatStats.drinkConcentration;
                            currentBuff.flatBoost *= 1 + source.combatDetails.combatStats.drinkConcentration;
                            currentBuff.duration = currentBuff.duration / (1 + source.combatDetails.combatStats.drinkConcentration);
                        }
                        source.addBuff(currentBuff, this.simulationTime);
                        let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(this.simulationTime + currentBuff.duration, source);
                        this.eventQueue.addEvent(checkBuffExpirationEvent);
                    }
                    return true;
                }
                canUseAbility(source, ability, oomCheck) {
                    if (source.combatDetails.currentHitpoints <= 0) {
                        return false;
                    }
                    if (source.combatDetails.currentManapoints < ability.manaCost) {
                        if (source.isPlayer && oomCheck) {
                            this.simResult.addRanOutOfManaCount(source, true, this.simulationTime);
                        }
                        return false;
                    }
                    if (source.isPlayer && oomCheck) {
                        this.simResult.addRanOutOfManaCount(source, false, this.simulationTime);
                    }
                    return true;
                }
                tryUseAbility(source, ability) {
                    if (!this.canUseAbility(source, ability, true)) {
                        return false;
                    }
                    if (source.isPlayer) {
                        if (source.abilityManaCosts.has(ability.hrid)) {
                            source.abilityManaCosts.set(ability.hrid, source.abilityManaCosts.get(ability.hrid) + ability.manaCost);
                        } else {
                            source.abilityManaCosts.set(ability.hrid, ability.manaCost);
                        }
                    }
                    source.combatDetails.currentManapoints -= ability.manaCost;
                    ability.lastUsed = this.simulationTime;
                    let haste = source.combatDetails.combatStats.abilityHaste;
                    let cooldownDuration = ability.cooldownDuration;
                    if (haste > 0) {
                        cooldownDuration = cooldownDuration * 100 / (100 + haste);
                    }
                    let todoAbilities = [ ability ];
                    if (source.combatDetails.combatStats.blaze > 0 && Math.random() < source.combatDetails.combatStats.blaze) {
                        todoAbilities.push(new ability_default("blaze"));
                    }
                    if (source.combatDetails.combatStats.bloom > 0 && Math.random() < source.combatDetails.combatStats.bloom) {
                        todoAbilities.push(new ability_default("bloom"));
                    }
                    for (const todoAbility of todoAbilities) {
                        for (const abilityEffect of todoAbility.abilityEffects) {
                            switch (abilityEffect.effectType) {
                              case "/ability_effect_types/buff":
                                this.processAbilityBuffEffect(source, todoAbility, abilityEffect);
                                break;
        
                              case "/ability_effect_types/damage":
                                this.processAbilityDamageEffect(source, todoAbility, abilityEffect);
                                break;
        
                              case "/ability_effect_types/heal":
                                this.processAbilityHealEffect(source, todoAbility, abilityEffect);
                                break;
        
                              case "/ability_effect_types/spend_hp":
                                this.processAbilitySpendHpEffect(source, todoAbility, abilityEffect);
                                break;
        
                              case "/ability_effect_types/revive":
                                this.processAbilityReviveEffect(source, todoAbility, abilityEffect);
                                break;
        
                              case "/ability_effect_types/promote":
                                this.eventQueue.clearEventsForUnit(source);
                                source = this.processAbilityPromoteEffect(source, todoAbility, abilityEffect);
                                this.addNextAttackEvent(source);
                                break;
        
                              default:
                                throw new Error("Unsupported effect type for ability: " + todoAbility.hrid + " effectType: " + abilityEffect.effectType);
                            }
                        }
                    }
                    if (source.combatDetails.combatStats.ripple > 0 && Math.random() < source.combatDetails.combatStats.ripple) {
                        let manapointsAdded = source.addManapoints(10);
                        this.simResult.addManapointsGained(source, "ripple", manapointsAdded);
                        for (const ability2 of source.abilities) {
                            if (ability2 && ability2.lastUsed) {
                                const remainingCooldown = ability2.lastUsed + ability2.cooldownDuration - this.simulationTime;
                                if (remainingCooldown > 0) {
                                    ability2.lastUsed = Math.max(ability2.lastUsed - ONE_SECOND * 2, this.simulationTime - ability2.cooldownDuration);
                                }
                            }
                        }
                    }
                    this.addNextAttackEvent(source);
                    if (source.combatDetails.currentHitpoints == 0) {
                        this.eventQueue.clearEventsForUnit(source);
                        this.simResult.addDeath(source);
                        if (!source.isPlayer) {
                            this.simResult.updateTimeSpentAlive(source.hrid, false, this.simulationTime);
                        }
                    }
                    this.checkEncounterEnd();
                    return true;
                }
                processAbilityBuffEffect(source, ability, abilityEffect) {
                    if (abilityEffect.targetType == "allAllies") {
                        let targets = source.isPlayer ? this.players : this.enemies;
                        for (const target of targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0)) {
                            for (const buff of abilityEffect.buffs) {
                                if (ability.isSpecialAbility && buff.multiplierForSkillHrid && buff.multiplierPerSkillLevel > 0) {
                                    let multiplier = 1 + source.combatDetails[buff.multiplierForSkillHrid.split("/")[2] + "Level"] * buff.multiplierPerSkillLevel;
                                    let currentBuff = structuredClone(buff);
                                    currentBuff.flatBoost *= multiplier;
                                    currentBuff.ratioBoost *= multiplier;
                                    target.addBuff(currentBuff, this.simulationTime);
                                } else {
                                    target.addBuff(buff, this.simulationTime);
                                }
                                let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(this.simulationTime + buff.duration, target);
                                this.eventQueue.addEvent(checkBuffExpirationEvent);
                            }
                        }
                        return;
                    }
                    if (abilityEffect.targetType != "self") {
                        throw new Error("Unsupported target type for buff ability effect: " + ability.hrid);
                    }
                    for (const buff of abilityEffect.buffs) {
                        source.addBuff(buff, this.simulationTime);
                        let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(this.simulationTime + buff.duration, source);
                        this.eventQueue.addEvent(checkBuffExpirationEvent);
                    }
                }
                processAbilityDamageEffect(source, ability, abilityEffect) {
                    let targets;
                    switch (abilityEffect.targetType) {
                      case "enemy":
                      case "allEnemies":
                        targets = source.isPlayer ? this.enemies : this.players;
                        break;
        
                      default:
                        throw new Error("Unsupported target type for damage ability effect: " + ability.hrid);
                    }
                    if (!targets) {
                        return;
                    }
                    let avoidTarget = [];
                    let isSkipParry = false;
                    for (let target of targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0)) {
                        let parryTarget = void 0;
                        if (!isSkipParry) {
                            parryTarget = this.checkParry(targets);
                            isSkipParry = true;
                        }
                        if (parryTarget) {
                            let tempTarget = source;
                            let tempSource = parryTarget;
                            let attackResult = combatUtilities_default.processAttack(tempSource, tempTarget);
                            this.simResult.addAttack(tempSource, tempTarget, "parry", attackResult.didHit ? attackResult.damageDone : "miss");
                            if (attackResult.lifeStealHeal > 0) {
                                this.simResult.addHitpointsGained(tempSource, "lifesteal", attackResult.lifeStealHeal);
                            }
                            if (attackResult.manaLeechMana > 0) {
                                this.simResult.addManapointsGained(tempSource, "manaLeech", attackResult.manaLeechMana);
                            }
                            if (attackResult.thornDamageDone > 0) {
                                this.simResult.addAttack(tempTarget, tempSource, attackResult.thornType, attackResult.thornDamageDone);
                            }
                            if (tempTarget.combatDetails.combatStats.retaliation > 0) {
                                this.simResult.addAttack(tempTarget, tempSource, "retaliation", attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : "miss");
                            }
                            if (tempTarget.combatDetails.currentHitpoints == 0) {
                                this.eventQueue.clearEventsForUnit(tempTarget);
                                this.simResult.addDeath(tempTarget);
                                if (!tempTarget.isPlayer) {
                                    this.simResult.updateTimeSpentAlive(tempTarget.hrid, false, this.simulationTime);
                                }
                            }
                            if (tempSource.combatDetails.currentHitpoints == 0 && (attackResult.thornDamageDone != 0 || attackResult.retaliationDamageDone != 0)) {
                                this.eventQueue.clearEventsForUnit(tempSource);
                                this.simResult.addDeath(tempSource);
                                if (!tempSource.isPlayer) {
                                    this.simResult.updateTimeSpentAlive(tempSource.hrid, false, this.simulationTime);
                                }
                            }
                        } else {
                            targets = targets.filter(unit => unit && !avoidTarget.includes(unit.hrid) && unit.combatDetails.currentHitpoints > 0);
                            if (!source.isPlayer && targets.length > 0 && abilityEffect.targetType == "enemy") {
                                let cumulativeThreat = 0;
                                let cumulativeRanges = [];
                                targets.forEach(player => {
                                    let playerThreat = player.combatDetails.combatStats.threat;
                                    cumulativeThreat += playerThreat;
                                    cumulativeRanges.push({
                                        player: player,
                                        rangeStart: cumulativeThreat - playerThreat,
                                        rangeEnd: cumulativeThreat
                                    });
                                });
                                let randomValueHit = Math.random() * cumulativeThreat;
                                target = cumulativeRanges.find(range => randomValueHit >= range.rangeStart && randomValueHit < range.rangeEnd).player;
                                avoidTarget.push(target.hrid);
                            }
                            if (targets.length <= 0) {
                                break;
                            }
                            let attackResult = combatUtilities_default.processAttack(source, target, abilityEffect);
                            if (this.zone?.isDungeon && target.isPlayer && attackResult.didHit && attackResult.damageDone > 0) {
                                const log = this.generateCombatLog(source, ability.hrid, target, attackResult);
                                this.addToWipeLogs(log);
                            }
                            if (attackResult.hpDrain > 0) {
                                this.simResult.addHitpointsGained(source, ability.hrid, attackResult.hpDrain);
                            }
                            if (attackResult.didHit && abilityEffect.buffs) {
                                for (const buff of abilityEffect.buffs) {
                                    target.addBuff(buff, this.simulationTime);
                                    let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(this.simulationTime + buff.duration, target);
                                    this.eventQueue.addEvent(checkBuffExpirationEvent);
                                }
                            }
                            if (abilityEffect.damageOverTimeRatio > 0 && attackResult.damageDone > 0) {
                                let damageOverTimeEvent = new damageOverTimeEvent_default(this.simulationTime + DOT_TICK_INTERVAL, source, target, attackResult.damageDone * abilityEffect.damageOverTimeRatio, abilityEffect.damageOverTimeDuration / DOT_TICK_INTERVAL, 1, abilityEffect.combatStyleHrid);
                                this.eventQueue.addEvent(damageOverTimeEvent);
                            }
                            if (attackResult.didHit && abilityEffect.stunChance > 0 && Math.random() < abilityEffect.stunChance * 100 / (100 + target.combatDetails.combatStats.tenacity)) {
                                target.isStunned = true;
                                target.stunExpireTime = this.simulationTime + abilityEffect.stunDuration;
                                this.eventQueue.clearMatching(event => (event.type == autoAttackEvent_default.type || event.type == abilityCastEndEvent_default.type || event.type == stunExpirationEvent_default.type) && event.source == target);
                                let stunExpirationEvent = new stunExpirationEvent_default(target.stunExpireTime, target);
                                this.eventQueue.addEvent(stunExpirationEvent);
                            }
                            if (attackResult.didHit && abilityEffect.blindChance > 0 && Math.random() < abilityEffect.blindChance * 100 / (100 + target.combatDetails.combatStats.tenacity)) {
                                target.isBlinded = true;
                                target.blindExpireTime = this.simulationTime + abilityEffect.blindDuration;
                                this.eventQueue.clearMatching(event => event.type == blindExpirationEvent_default.type && event.source == target);
                                if (this.eventQueue.clearMatching(event => event.type == autoAttackEvent_default.type && event.source == target)) {
                                    this.addNextAttackEvent(target);
                                }
                                let blindExpirationEvent = new blindExpirationEvent_default(target.blindExpireTime, target);
                                this.eventQueue.addEvent(blindExpirationEvent);
                            }
                            if (attackResult.didHit && abilityEffect.silenceChance > 0 && Math.random() < abilityEffect.silenceChance * 100 / (100 + target.combatDetails.combatStats.tenacity)) {
                                target.isSilenced = true;
                                target.silenceExpireTime = this.simulationTime + abilityEffect.silenceDuration;
                                this.eventQueue.clearMatching(event => event.type == silenceExpirationEvent_default.type && event.source == target);
                                if (this.eventQueue.clearMatching(event => event.type == abilityCastEndEvent_default.type && event.source == target)) {
                                    this.addNextAttackEvent(target);
                                }
                                let silenceExpirationEvent = new silenceExpirationEvent_default(target.silenceExpireTime, target);
                                this.eventQueue.addEvent(silenceExpirationEvent);
                            }
                            if (attackResult.didHit && source.combatDetails.combatStats.curse > 0) {
                                const curseExpireTime = 15e9;
                                let currentCurseEvent = this.eventQueue.getMatching(event => event.type == curseExpirationEvent_default.type && event.source == target);
                                let currentCurseAmount = 0;
                                if (currentCurseEvent) currentCurseAmount = currentCurseEvent.curseAmount;
                                this.eventQueue.clearMatching(event => event.type == curseExpirationEvent_default.type && event.source == target);
                                let curseExpirationEvent = new curseExpirationEvent_default(this.simulationTime + curseExpireTime, currentCurseAmount, target);
                                const curseBuff = {
                                    uniqueHrid: "/buff_uniques/curse",
                                    typeHrid: "/buff_types/damage_taken",
                                    ratioBoost: 0,
                                    ratioBoostLevelBonus: 0,
                                    flatBoost: source.combatDetails.combatStats.curse * curseExpirationEvent.curseAmount,
                                    flatBoostLevelBonus: 0,
                                    startTime: "0001-01-01T00:00:00Z",
                                    duration: curseExpireTime
                                };
                                target.addBuff(curseBuff, this.simulationTime);
                                this.eventQueue.addEvent(curseExpirationEvent);
                            }
                            if (source.combatDetails.combatStats.fury > 0) {
                                let currentFuryEvent = this.eventQueue.getMatching(event => event.type == furyExpirationEvent_default.type && event.source == source);
                                this.eventQueue.clearMatching(event => event.type == furyExpirationEvent_default.type && event.source == source);
                                const furyExpireTime = 15e9;
                                const maxFuryStack = 5;
                                let furyAmount = 0;
                                if (currentFuryEvent) furyAmount = currentFuryEvent.furyAmount;
                                if (attackResult.didHit) {
                                    furyAmount = Math.min(furyAmount + 1, maxFuryStack);
                                } else {
                                    furyAmount = furyAmount / 2;
                                }
                                const furyAccuracyBuf = {
                                    uniqueHrid: "/buff_uniques/fury_accuracy",
                                    typeHrid: "/buff_types/fury_accuracy",
                                    ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                                    ratioBoostLevelBonus: 0,
                                    flatBoost: 0,
                                    flatBoostLevelBonus: 0,
                                    startTime: "0001-01-01T00:00:00Z",
                                    duration: furyExpireTime
                                };
                                const furyDamageBuf = {
                                    uniqueHrid: "/buff_uniques/fury_damage",
                                    typeHrid: "/buff_types/fury_damage",
                                    ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                                    ratioBoostLevelBonus: 0,
                                    flatBoost: 0,
                                    flatBoostLevelBonus: 0,
                                    startTime: "0001-01-01T00:00:00Z",
                                    duration: furyExpireTime
                                };
                                if (furyAmount > 0) {
                                    let furyExpirationEvent = new furyExpirationEvent_default(this.simulationTime + furyExpireTime, furyAmount, source);
                                    this.eventQueue.addEvent(furyExpirationEvent);
                                    source.addBuffs([ furyAccuracyBuf, furyDamageBuf ], this.simulationTime);
                                } else {
                                    source.removeBuffs([ furyAccuracyBuf, furyDamageBuf ]);
                                }
                            }
                            if (target.combatDetails.combatStats.weaken > 0) {
                                const weakenExpireTime = 15e9;
                                source.weakenExpireTime = this.simulationTime + weakenExpireTime;
                                let currentWeakenEvent = this.eventQueue.getMatching(event => event.type == weakenExpirationEvent_default.type && event.source == source);
                                let weakenAmount = 0;
                                if (currentWeakenEvent) weakenAmount = currentWeakenEvent.weakenAmount;
                                this.eventQueue.clearMatching(event => event.type == weakenExpirationEvent_default.type && event.source == source);
                                let weakenExpirationEvent = new weakenExpirationEvent_default(this.simulationTime + weakenExpireTime, weakenAmount, source);
                                const weakenBuff = {
                                    uniqueHrid: "/buff_uniques/weaken",
                                    typeHrid: "/buff_types/damage",
                                    ratioBoost: -1 * target.combatDetails.combatStats.weaken * weakenExpirationEvent.weakenAmount,
                                    ratioBoostLevelBonus: 0,
                                    flatBoost: 0,
                                    flatBoostLevelBonus: 0,
                                    startTime: "0001-01-01T00:00:00Z",
                                    duration: weakenExpireTime
                                };
                                source.addBuff(weakenBuff, this.simulationTime);
                                this.eventQueue.addEvent(weakenExpirationEvent);
                            }
                            this.simResult.addAttack(source, target, ability.hrid, attackResult.didHit ? attackResult.damageDone : "miss");
                            if (attackResult.thornDamageDone > 0) {
                                this.simResult.addAttack(target, source, attackResult.thornType, attackResult.thornDamageDone);
                            }
                            if (this.zone?.isDungeon && attackResult.thornDamageDone > 0 && source.isPlayer) {
                                const log = this.buildCombatLog(target, attackResult.thornType, source, attackResult.thornDamageDone);
                                this.addToWipeLogs(log);
                            }
                            if (target.combatDetails.combatStats.retaliation > 0) {
                                this.simResult.addAttack(target, source, "retaliation", attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : "miss");
                            }
                            if (this.zone?.isDungeon && attackResult.retaliationDamageDone > 0 && source.isPlayer) {
                                const log = this.buildCombatLog(target, "retaliation", source, attackResult.retaliationDamageDone);
                                this.addToWipeLogs(log);
                            }
                            if (target.combatDetails.currentHitpoints == 0) {
                                this.eventQueue.clearEventsForUnit(target);
                                this.simResult.addDeath(target);
                                if (!target.isPlayer) {
                                    this.simResult.updateTimeSpentAlive(target.hrid, false, this.simulationTime);
                                }
                            }
                            if (attackResult.didHit && abilityEffect.pierceChance > Math.random()) {
                                continue;
                            }
                        }
                        if (parryTarget) {
                            break;
                        }
                        if (abilityEffect.targetType == "enemy") {
                            break;
                        }
                    }
                }
                processAbilityHealEffect(source, ability, abilityEffect) {
                    if (abilityEffect.targetType == "allAllies") {
                        let targets = source.isPlayer ? this.players : this.enemies;
                        for (const target of targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0)) {
                            let amountHealed2 = combatUtilities_default.processHeal(source, abilityEffect, target);
                            this.simResult.addHitpointsGained(target, ability.hrid, amountHealed2);
                        }
                        return;
                    }
                    if (abilityEffect.targetType == "lowestHpAlly") {
                        let targets = source.isPlayer ? this.players : this.enemies;
                        let healTarget;
                        for (const target of targets.filter(unit => unit && unit.combatDetails.currentHitpoints > 0)) {
                            if (!healTarget) {
                                healTarget = target;
                                continue;
                            }
                            const targetHpPercent = target.combatDetails.currentHitpoints / target.combatDetails.maxHitpoints;
                            const healTargetHpPercent = healTarget.combatDetails.currentHitpoints / healTarget.combatDetails.maxHitpoints;
                            if (targetHpPercent < healTargetHpPercent) {
                                healTarget = target;
                            }
                        }
                        if (healTarget) {
                            let amountHealed2 = combatUtilities_default.processHeal(source, abilityEffect, healTarget);
                            this.simResult.addHitpointsGained(healTarget, ability.hrid, amountHealed2);
                        }
                        return;
                    }
                    if (abilityEffect.targetType != "self") {
                        throw new Error("Unsupported target type for heal ability effect: " + ability.hrid);
                    }
                    let amountHealed = combatUtilities_default.processHeal(source, abilityEffect, source);
                    this.simResult.addHitpointsGained(source, ability.hrid, amountHealed);
                }
                processAbilityReviveEffect(source, ability, abilityEffect) {
                    if (abilityEffect.targetType != "deadAlly") {
                        throw new Error("Unsupported target type for revive ability effect: " + ability.hrid);
                    }
                    let targets = source.isPlayer ? this.players : this.enemies;
                    let reviveTarget = targets.find(unit => unit && unit.combatDetails.currentHitpoints <= 0);
                    if (reviveTarget) {
                        this.eventQueue.clearMatching(event => event.type == playerRespawnEvent_default.type && event.hrid == reviveTarget.hrid);
                        reviveTarget.removeExpiredBuffs(this.simulationTime);
                        let amountHealed = combatUtilities_default.processRevive(source, abilityEffect, reviveTarget);
                        this.simResult.addHitpointsGained(reviveTarget, ability.hrid, amountHealed);
                        this.addNextAttackEvent(reviveTarget);
                        if (!source.isPlayer) {
                            this.simResult.updateTimeSpentAlive(reviveTarget.hrid, true, this.simulationTime);
                        }
                    }
                    return;
                }
                processAbilityPromoteEffect(source, ability, abilityEffect) {
                    const promotionHrids = [ "/monsters/enchanted_rook", "/monsters/enchanted_knight", "/monsters/enchanted_bishop" ];
                    let randomPromotionIndex = Math.floor(Math.random() * promotionHrids.length);
                    return new monster_default(promotionHrids[randomPromotionIndex], source.difficultyTier);
                }
                processAbilitySpendHpEffect(source, ability, abilityEffect) {
                    if (abilityEffect.targetType != "self") {
                        throw new Error("Unsupported target type for spend hp ability effect: " + ability.hrid);
                    }
                    let hpSpent = combatUtilities_default.processSpendHp(source, abilityEffect);
                    this.simResult.addHitpointsSpent(source, ability.hrid, hpSpent);
                }
            };
            var combatSimulator_default = CombatSimulator;
            var itemDetailMap_default = combatData_default.itemDetailMap;
            var Consumable = class _Consumable {
                constructor(hrid, triggers = null) {
                    this.hrid = hrid;
                    let gameConsumable = itemDetailMap_default[this.hrid];
                    if (!gameConsumable) {
                        throw new Error("No consumable found for hrid: " + this.hrid);
                    }
                    this.cooldownDuration = gameConsumable.consumableDetail.cooldownDuration;
                    this.hitpointRestore = gameConsumable.consumableDetail.hitpointRestore;
                    this.manapointRestore = gameConsumable.consumableDetail.manapointRestore;
                    this.recoveryDuration = gameConsumable.consumableDetail.recoveryDuration;
                    this.catagoryHrid = gameConsumable.categoryHrid;
                    this.buffs = [];
                    if (gameConsumable.consumableDetail.buffs) {
                        for (const consumableBuff of gameConsumable.consumableDetail.buffs) {
                            let buff = new buff_default(consumableBuff);
                            this.buffs.push(buff);
                        }
                    }
                    if (triggers) {
                        this.triggers = triggers;
                    } else {
                        this.triggers = [];
                        for (const defaultTrigger of gameConsumable.consumableDetail.defaultCombatTriggers) {
                            let trigger = new trigger_default(defaultTrigger.dependencyHrid, defaultTrigger.conditionHrid, defaultTrigger.comparatorHrid, defaultTrigger.value);
                            this.triggers.push(trigger);
                        }
                    }
                    this.lastUsed = Number.MIN_SAFE_INTEGER;
                }
                static createFromDTO(dto) {
                    let triggers = dto.triggers.map(trigger => trigger_default.createFromDTO(trigger));
                    let consumable = new _Consumable(dto.hrid, triggers);
                    return consumable;
                }
                shouldTrigger(currentTime, source, target, friendlies, enemies) {
                    if (source.isStunned) {
                        return false;
                    }
                    let consumableHaste;
                    if (this.catagoryHrid.includes("food")) {
                        consumableHaste = source.combatDetails.combatStats.foodHaste;
                    } else {
                        consumableHaste = source.combatDetails.combatStats.drinkConcentration;
                    }
                    let cooldownDuration = this.cooldownDuration;
                    if (consumableHaste > 0) {
                        cooldownDuration = cooldownDuration / (1 + consumableHaste);
                    }
                    if (this.lastUsed + cooldownDuration > currentTime) {
                        return false;
                    }
                    if (this.triggers.length == 0) {
                        return true;
                    }
                    let shouldTrigger = true;
                    for (const trigger of this.triggers) {
                        if (!trigger.isActive(source, target, friendlies, enemies, currentTime)) {
                            shouldTrigger = false;
                        }
                    }
                    return shouldTrigger;
                }
            };
            var consumable_default = Consumable;
            var enhancementLevelTotalBonusMultiplierTable_default = combatData_default.enhancementLevelTotalBonusMultiplierTable;
            var Equipment = class _Equipment {
                constructor(hrid, enhancementLevel) {
                    this.hrid = hrid;
                    let gameItem = itemDetailMap_default[this.hrid];
                    if (!gameItem) {
                        throw new Error("No equipment found for hrid: " + this.hrid);
                    }
                    this.gameItem = gameItem;
                    this.enhancementLevel = enhancementLevel;
                }
                static createFromDTO(dto) {
                    let equipment = new _Equipment(dto.hrid, dto.enhancementLevel);
                    return equipment;
                }
                getCombatStat(combatStat) {
                    let multiplier = enhancementLevelTotalBonusMultiplierTable_default[this.enhancementLevel];
                    if (this.gameItem.equipmentDetail.combatStats[combatStat]) {
                        let enhancementBonus = this.gameItem.equipmentDetail.combatEnhancementBonuses[combatStat] || 0;
                        let stat = this.gameItem.equipmentDetail.combatStats[combatStat] + multiplier * enhancementBonus;
                        return stat;
                    }
                    return 0;
                }
                getCombatStyle() {
                    return this.gameItem.equipmentDetail.combatStats.combatStyleHrids[0];
                }
                getDamageType() {
                    return this.gameItem.equipmentDetail.combatStats.damageType;
                }
                getPrimaryTraining() {
                    return this.gameItem.equipmentDetail.combatStats.primaryTraining;
                }
                getFocusTraining() {
                    return this.gameItem.equipmentDetail.combatStats.focusTraining;
                }
            };
            var equipment_default = Equipment;
            var houseRoomDetailMap_default = combatData_default.houseRoomDetailMap;
            var HouseRoom = class {
                constructor(hrid, level) {
                    this.hrid = hrid;
                    this.level = level;
                    let gameHouseRoom = houseRoomDetailMap_default[this.hrid];
                    if (!gameHouseRoom) {
                        throw new Error("No house room found for hrid: " + this.hrid);
                    }
                    this.buffs = [];
                    if (gameHouseRoom.actionBuffs) {
                        for (const actionBuff of gameHouseRoom.actionBuffs) {
                            let buff = new buff_default(actionBuff, level);
                            this.buffs.push(buff);
                        }
                    }
                    if (gameHouseRoom.globalBuffs) {
                        for (const globalBuff of gameHouseRoom.globalBuffs) {
                            let buff = new buff_default(globalBuff, level);
                            this.buffs.push(buff);
                        }
                    }
                }
            };
            var houseRoom_default = HouseRoom;
            var achievementTierDetailMap_default = combatData_default.achievementTierDetailMap;
            var achievementDetailMap_default = combatData_default.achievementDetailMap;
            var Achievement = class {
                constructor(achievements) {
                    this.achievements = achievements;
                    this.buffs = [];
                    for (const tier of Object.values(achievementTierDetailMap_default)) {
                        let isGetAll = true;
                        let detailMap = Object.values(achievementDetailMap_default).filter(detail => detail.tierHrid == tier.hrid);
                        for (const achievement of Object.values(detailMap)) {
                            if (!this.achievements[achievement.hrid] || this.achievements[achievement.hrid] == false) {
                                isGetAll = false;
                                break;
                            }
                        }
                        if (isGetAll) {
                            let buff = new buff_default(tier.buff);
                            this.buffs.push(buff);
                        }
                    }
                }
            };
            var achievement_default = Achievement;
            var Player = class _Player extends combatUnit_default {
                constructor() {
                    super();
                    __publicField(this, "equipment", {
                        "/equipment_types/head": null,
                        "/equipment_types/body": null,
                        "/equipment_types/legs": null,
                        "/equipment_types/feet": null,
                        "/equipment_types/hands": null,
                        "/equipment_types/main_hand": null,
                        "/equipment_types/two_hand": null,
                        "/equipment_types/off_hand": null,
                        "/equipment_types/pouch": null,
                        "/equipment_types/back": null
                    });
                    this.isPlayer = true;
                    this.hrid = "player";
                }
                static createFromDTO(dto) {
                    let player = new _Player;
                    player.staminaLevel = dto.staminaLevel;
                    player.intelligenceLevel = dto.intelligenceLevel;
                    player.attackLevel = dto.attackLevel;
                    player.meleeLevel = dto.meleeLevel;
                    player.defenseLevel = dto.defenseLevel;
                    player.rangedLevel = dto.rangedLevel;
                    player.magicLevel = dto.magicLevel;
                    player.hrid = dto.hrid;
                    for (const [key, value] of Object.entries(dto.equipment)) {
                        player.equipment[key] = value ? equipment_default.createFromDTO(value) : null;
                    }
                    player.food = dto.food.map(food => food ? consumable_default.createFromDTO(food) : null);
                    player.drinks = dto.drinks.map(drink => drink ? consumable_default.createFromDTO(drink) : null);
                    player.abilities = dto.abilities.map(ability => ability ? ability_default.createFromDTO(ability) : null);
                    Object.entries(dto.houseRooms).forEach(houseRoom => {
                        if (houseRoom[1] > 0) {
                            player.houseRooms.push(new houseRoom_default(houseRoom[0], houseRoom[1]));
                        }
                    });
                    player.achievements = new achievement_default(dto.achievements);
                    player.debuffOnLevelGap = dto.debuffOnLevelGap;
                    return player;
                }
                updateCombatDetails() {
                    if (this.equipment["/equipment_types/main_hand"]) {
                        this.combatDetails.combatStats.combatStyleHrid = this.equipment["/equipment_types/main_hand"].getCombatStyle();
                        this.combatDetails.combatStats.damageType = this.equipment["/equipment_types/main_hand"].getDamageType();
                        this.combatDetails.combatStats.attackInterval = this.equipment["/equipment_types/main_hand"].getCombatStat("attackInterval");
                        this.combatDetails.combatStats.primaryTraining = this.equipment["/equipment_types/main_hand"].getPrimaryTraining();
                    } else if (this.equipment["/equipment_types/two_hand"]) {
                        this.combatDetails.combatStats.combatStyleHrid = this.equipment["/equipment_types/two_hand"].getCombatStyle();
                        this.combatDetails.combatStats.damageType = this.equipment["/equipment_types/two_hand"].getDamageType();
                        this.combatDetails.combatStats.attackInterval = this.equipment["/equipment_types/two_hand"].getCombatStat("attackInterval");
                        this.combatDetails.combatStats.primaryTraining = this.equipment["/equipment_types/two_hand"].getPrimaryTraining();
                    } else {
                        this.combatDetails.combatStats.combatStyleHrid = "/combat_styles/smash";
                        this.combatDetails.combatStats.damageType = "/damage_types/physical";
                        this.combatDetails.combatStats.attackInterval = 3e9;
                        this.combatDetails.combatStats.primaryTraining = "/skills/melee";
                    }
                    if (this.equipment["/equipment_types/charm"]) {
                        this.combatDetails.combatStats.focusTraining = this.equipment["/equipment_types/charm"].getFocusTraining();
                    } else {
                        this.combatDetails.combatStats.focusTraining = "";
                    }
                    [ "stabAccuracy", "slashAccuracy", "smashAccuracy", "rangedAccuracy", "magicAccuracy", "stabDamage", "slashDamage", "smashDamage", "rangedDamage", "magicDamage", "defensiveDamage", "taskDamage", "physicalAmplify", "waterAmplify", "natureAmplify", "fireAmplify", "healingAmplify", "stabEvasion", "slashEvasion", "smashEvasion", "rangedEvasion", "magicEvasion", "armor", "waterResistance", "natureResistance", "fireResistance", "maxHitpoints", "maxManapoints", "lifeSteal", "hpRegenPer10", "mpRegenPer10", "physicalThorns", "elementalThorns", "combatDropRate", "combatRareFind", "combatDropQuantity", "combatExperience", "criticalRate", "criticalDamage", "armorPenetration", "waterPenetration", "naturePenetration", "firePenetration", "abilityHaste", "tenacity", "manaLeech", "castSpeed", "threat", "parry", "mayhem", "pierce", "curse", "fury", "weaken", "ripple", "bloom", "blaze", "attackSpeed", "foodHaste", "drinkConcentration", "autoAttackDamage", "abilityDamage", "staminaExperience", "intelligenceExperience", "attackExperience", "defenseExperience", "meleeExperience", "rangedExperience", "magicExperience", "retaliation" ].forEach(stat => {
                        this.combatDetails.combatStats[stat] = Object.values(this.equipment).filter(equipment => equipment != null).map(equipment => equipment.getCombatStat(stat)).reduce((prev, cur) => prev + cur, 0);
                    });
                    if (this.equipment["/equipment_types/pouch"]) {
                        this.combatDetails.combatStats.foodSlots = 1 + this.equipment["/equipment_types/pouch"].getCombatStat("foodSlots");
                        this.combatDetails.combatStats.drinkSlots = 1 + this.equipment["/equipment_types/pouch"].getCombatStat("drinkSlots");
                    } else {
                        this.combatDetails.combatStats.foodSlots = 1;
                        this.combatDetails.combatStats.drinkSlots = 1;
                    }
                    super.updateCombatDetails();
                }
            };
            var player_default = Player;
            var actionDetailMap_default = combatData_default.actionDetailMap;
            var Zone = class {
                constructor(hrid, difficultyTier) {
                    this.hrid = hrid;
                    this.difficultyTier = difficultyTier;
                    let gameZone = actionDetailMap_default[this.hrid];
                    this.monsterSpawnInfo = gameZone.combatZoneInfo.fightInfo;
                    this.dungeonSpawnInfo = gameZone.combatZoneInfo.dungeonInfo;
                    this.encountersKilled = 1;
                    this.monsterSpawnInfo.battlesPerBoss = 10;
                    this.buffs = gameZone.buffs;
                    this.isDungeon = gameZone.combatZoneInfo.isDungeon;
                    this.dungeonsCompleted = 0;
                    this.dungeonsFailed = 0;
                    this.finalWave = false;
                }
                getRandomEncounter() {
                    if (this.monsterSpawnInfo.bossSpawns && this.encountersKilled == this.monsterSpawnInfo.battlesPerBoss) {
                        this.encountersKilled = 1;
                        return this.monsterSpawnInfo.bossSpawns.map(monster => new monster_default(monster.combatMonsterHrid, monster.difficultyTier + this.difficultyTier));
                    }
                    let totalWeight = this.monsterSpawnInfo.randomSpawnInfo.spawns.reduce((prev, cur) => prev + cur.rate, 0);
                    let encounterHrids = [];
                    let totalStrength = 0;
                    outer: for (let i = 0; i < this.monsterSpawnInfo.randomSpawnInfo.maxSpawnCount; i++) {
                        let randomWeight = totalWeight * Math.random();
                        let cumulativeWeight = 0;
                        for (const spawn of this.monsterSpawnInfo.randomSpawnInfo.spawns) {
                            cumulativeWeight += spawn.rate;
                            if (randomWeight <= cumulativeWeight) {
                                totalStrength += spawn.strength;
                                if (totalStrength <= this.monsterSpawnInfo.randomSpawnInfo.maxTotalStrength) {
                                    encounterHrids.push({
                                        hrid: spawn.combatMonsterHrid,
                                        difficultyTier: spawn.difficultyTier
                                    });
                                } else {
                                    break outer;
                                }
                                break;
                            }
                        }
                    }
                    this.encountersKilled++;
                    return encounterHrids.map(hrid => new monster_default(hrid.hrid, hrid.difficultyTier + this.difficultyTier));
                }
                failWave() {
                    this.dungeonsFailed++;
                    this.encountersKilled = 1;
                }
                getNextWave() {
                    if (this.encountersKilled > this.dungeonSpawnInfo.maxWaves) {
                        this.dungeonsCompleted++;
                        this.encountersKilled = 1;
                    }
                    if (this.dungeonSpawnInfo.fixedSpawnsMap.hasOwnProperty(this.encountersKilled.toString())) {
                        let currentMonsters = this.dungeonSpawnInfo.fixedSpawnsMap[this.encountersKilled.toString()];
                        this.encountersKilled++;
                        return currentMonsters.map(monster => new monster_default(monster.combatMonsterHrid, monster.difficultyTier + this.difficultyTier));
                    } else {
                        let monsterSpawns = {};
                        const waveKeys = Object.keys(this.dungeonSpawnInfo.randomSpawnInfoMap).map(Number).sort((a, b) => a - b);
                        if (this.encountersKilled > waveKeys[waveKeys.length - 1]) {
                            monsterSpawns = this.dungeonSpawnInfo.randomSpawnInfoMap[waveKeys[waveKeys.length - 1]];
                        } else {
                            for (let i = 0; i < waveKeys.length - 1; i++) {
                                if (this.encountersKilled >= waveKeys[i] && this.encountersKilled <= waveKeys[i + 1]) {
                                    monsterSpawns = this.dungeonSpawnInfo.randomSpawnInfoMap[waveKeys[i]];
                                    break;
                                }
                            }
                        }
                        let totalWeight = monsterSpawns.spawns.reduce((prev, cur) => prev + cur.rate, 0);
                        let encounterHrids = [];
                        let totalStrength = 0;
                        outer: for (let i = 0; i < monsterSpawns.maxSpawnCount; i++) {
                            let randomWeight = totalWeight * Math.random();
                            let cumulativeWeight = 0;
                            for (const spawn of monsterSpawns.spawns) {
                                cumulativeWeight += spawn.rate;
                                if (randomWeight <= cumulativeWeight) {
                                    totalStrength += spawn.strength;
                                    if (totalStrength <= monsterSpawns.maxTotalStrength) {
                                        encounterHrids.push({
                                            hrid: spawn.combatMonsterHrid,
                                            difficultyTier: spawn.difficultyTier
                                        });
                                    } else {
                                        break outer;
                                    }
                                    break;
                                }
                            }
                        }
                        this.encountersKilled++;
                        return encounterHrids.map(hrid => new monster_default(hrid.hrid, hrid.difficultyTier + this.difficultyTier));
                    }
                }
            };
            var zone_default = Zone;
            function useSeed(seed) {
                if (!Number.isFinite(seed)) return;
                let state = Number(seed) >>> 0;
                Math.random = function() {
                    state = state + 1831565813 >>> 0;
                    let value = state;
                    value = Math.imul(value ^ value >>> 15, value | 1);
                    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
                    return ((value ^ value >>> 14) >>> 0) / 4294967296;
                };
            }
            onmessage = async function(event) {
                if (event.data.type !== "start_simulation") return;
                updateCombatData(event.data.mstData);
                useSeed(event.data.seed);
                try {
                    const zone = new zone_default(event.data.zone.zoneHrid, event.data.zone.difficultyTier);
                    const players = event.data.players.map(playerData => {
                        const player = player_default.createFromDTO(structuredClone(playerData));
                        player.zoneBuffs = zone.buffs || [];
                        player.extraBuffs = [];
                        return player;
                    });
                    const simulator = new combatSimulator_default(players, zone, null, {
                        enableHpMpVisualization: false
                    });
                    const simResult = await simulator.simulate(event.data.simulationTimeLimit);
                    postMessage({
                        type: "simulation_result",
                        simResult: simResult
                    });
                } catch (error) {
                    postMessage({
                        type: "simulation_error",
                        error: {
                            message: error instanceof Error ? error.message : String(error)
                        }
                    });
                }
            };
        })();
    }

    class CombatSimulationService {
        static DATA_KEYS = Object.freeze([
            'itemDetailMap',
            'abilityDetailMap',
            'achievementTierDetailMap',
            'achievementDetailMap',
            'houseRoomDetailMap',
            'combatTriggerDependencyDetailMap',
            'combatMonsterDetailMap',
            'actionDetailMap',
            'combatStyleDetailMap',
            'enhancementLevelTotalBonusMultiplierTable'
        ]);

        static SEEDS = Object.freeze([0x13579bdf, 0x2468ace0, 0x51f15e5d, 0x6d2b79f5, 0x9e3779b9]);
        static SIMULATION_TIME = 3 * 60 * 60 * 1e9;
        static TARGET_HITPOINTS = 1e12;
        static TARGET_HRID = '/monsters/mst_standard_target';
        static ZONE_HRID = '/actions/combat/mst_standard_target';

        constructor() {
            this.workerUrl = '';
            this.activeWorkers = new Set();
        }

        static buildWorkerSource() {
            return `(${mstCombatWorkerRuntime.toString()})();`;
        }

        getWorkerUrl() {
            if (this.workerUrl) return this.workerUrl;
            const source = CombatSimulationService.buildWorkerSource();
            this.workerUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
            return this.workerUrl;
        }

        createWorker() {
            const worker = new Worker(this.getWorkerUrl());
            this.activeWorkers.add(worker);
            return worker;
        }

        terminateWorker(worker) {
            if (!worker) return;
            worker.terminate();
            this.activeWorkers.delete(worker);
        }

        cancel() {
            [...this.activeWorkers].forEach(worker => this.terminateWorker(worker));
        }

        runOnce(worker, player, mstData, seed) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(i18n.t('combatSimulationTimeout'))), 120000);
                worker.onmessage = event => {
                    if (event.data?.type === 'simulation_result') {
                        clearTimeout(timeout);
                        resolve(event.data.simResult);
                    } else if (event.data?.type === 'simulation_error') {
                        clearTimeout(timeout);
                        reject(new Error(String(event.data.error?.message || event.data.error || i18n.t('combatSimulationFailed'))));
                    }
                };
                worker.onerror = event => {
                    clearTimeout(timeout);
                    reject(new Error(event.message || i18n.t('combatSimulationWorkerFailed')));
                };
                worker.postMessage({
                    type: 'start_simulation',
                    players: [player],
                    zone: {zoneHrid: CombatSimulationService.ZONE_HRID, difficultyTier: 0},
                    labyrinth: null,
                    simulationTimeLimit: CombatSimulationService.SIMULATION_TIME,
                    seed,
                    mstData,
                    extra: {
                        mooPass: false,
                        comExp: 0,
                        comDrop: 0,
                        personalBuffs: [],
                        enableHpMpVisualization: false
                    }
                });
            });
        }

        getDps(simResult) {
            const attacks = simResult?.attacks?.player1?.[CombatSimulationService.TARGET_HRID] || {};
            const totalDamage = Object.values(attacks).reduce((abilityTotal, hits) => {
                return abilityTotal + Object.entries(hits || {}).reduce((sum, [damage, count]) => {
                    return damage === 'miss' ? sum : sum + Number(damage || 0) * Number(count || 0);
                }, 0);
            }, 0);
            const alive = simResult?.timeSpentAlive?.find(entry =>
                entry?.name === CombatSimulationService.TARGET_HRID
            );
            const simulatedTime = Number(alive?.timeSpentAlive || simResult?.simulatedTime || 0);
            return simulatedTime > 0 ? totalDamage / (simulatedTime / 1e9) : 0;
        }

        async simulateBuild(player, mstData) {
            const worker = this.createWorker();
            try {
                const values = [];
                for (let index = 0; index < CombatSimulationService.SEEDS.length; index++) {
                    const result = await this.runOnce(
                        worker,
                        player,
                        index === 0 ? mstData : null,
                        CombatSimulationService.SEEDS[index]
                    );
                    values.push(this.getDps(result));
                }
                return values.reduce((sum, value) => sum + value, 0) / values.length;
            } finally {
                this.terminateWorker(worker);
            }
        }

        async compare(baselinePlayer, comparisonPlayer, mstData) {
            const [baselineDps, comparisonDps] = await Promise.all([
                this.simulateBuild(baselinePlayer, mstData),
                this.simulateBuild(comparisonPlayer, mstData)
            ]);
            const change = baselineDps > 0 ? comparisonDps / baselineDps - 1 : null;
            return {baselineDps, comparisonDps, change};
        }
    }

    class EquipmentComparisonService {
        static ABILITY_LEVELS = Object.freeze([4, 6, 6, 6, 6]);
        static SHARED_EQUIPMENT = Object.freeze([
            {itemHrid: '/items/philosophers_necklace', enhancementLevel: 5},
            {itemHrid: '/items/philosophers_earrings', enhancementLevel: 5},
            {itemHrid: '/items/philosophers_ring', enhancementLevel: 5},
            {itemHrid: '/items/guzzling_pouch', enhancementLevel: 5}
        ]);
        static FOOD_HRIDS = Object.freeze(['/items/star_fruit_yogurt', '/items/star_fruit_gummy']);
        static UNIQUE_STAT_KEYS = new Set([
            'weaken', 'fury', 'parry', 'mayhem', 'curse', 'pierce', 'ripple', 'bloom', 'blaze'
        ]);
        static FLAT_STAT_KEYS = new Set([
            'abilityHaste', 'maxHitpoints', 'maxManapoints', 'armor', 'waterResistance',
            'natureResistance', 'fireResistance', 'tenacity', 'threat', 'foodSlots', 'drinkSlots'
        ]);
        static SKILL_STAT_KEYS = new Set(['primaryTraining', 'focusTraining']);

        constructor(marketService = null, simulationService = null) {
            this.marketService = marketService;
            this.simulationService = simulationService;
        }

        getItemMap() {
            return DataHub.getClientDataMap('itemDetailMap');
        }

        getPresetEquipmentEntries(preset) {
            return [
                ...preset.equipment.map(([itemHrid, enhancementLevel]) => ({itemHrid, enhancementLevel})),
                ...EquipmentComparisonService.SHARED_EQUIPMENT
            ];
        }

        buildPresetEquipment(preset) {
            const equipment = {};
            this.getPresetEquipmentEntries(preset).forEach(entry => {
                const detail = this.getItemMap()?.[entry.itemHrid];
                const type = detail?.equipmentDetail?.type;
                if (type) equipment[type] = {hrid: entry.itemHrid, enhancementLevel: entry.enhancementLevel};
            });
            return equipment;
        }

        applyEquipmentToBuild(equipment, itemHrid, enhancementLevel) {
            const detail = this.getItemMap()?.[itemHrid];
            const type = detail?.equipmentDetail?.type;
            if (!type) return equipment;
            const result = {...equipment};
            if (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand') {
                delete result['/equipment_types/main_hand'];
                delete result['/equipment_types/two_hand'];
                if (type === '/equipment_types/two_hand') delete result['/equipment_types/off_hand'];
            }
            result[type] = {hrid: itemHrid, enhancementLevel: Number(enhancementLevel || 0)};
            return result;
        }

        getCurrentCombatLevels() {
            const result = {};
            ['stamina', 'intelligence', 'attack', 'defense', 'melee', 'ranged', 'magic'].forEach(skill => {
                result[skill + 'Level'] = Number(
                    CharacterDataService.getCharacterSkill('/skills/' + skill)?.level || 0
                );
            });
            return result;
        }

        getCurrentHouseRooms() {
            const result = {};
            Object.entries(CharacterDataService.raw?.characterHouseRoomMap || {}).forEach(([hrid, room]) => {
                result[hrid] = Number(room?.level || 0);
            });
            return result;
        }

        getCurrentAchievements() {
            const result = {};
            (CharacterDataService.raw?.characterAchievements || []).forEach(item => {
                result[item.achievementHrid] = Boolean(item.isCompleted);
            });
            return result;
        }

        getDefaultTriggers(detail) {
            return (detail?.defaultCombatTriggers || []).map(trigger => ({...trigger}));
        }

        buildSimulationPlayer(equipment, preset) {
            const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
            const itemMap = this.getItemMap();
            return {
                hrid: 'player1',
                ...this.getCurrentCombatLevels(),
                equipment,
                food: EquipmentComparisonService.FOOD_HRIDS.map(hrid => ({
                    hrid,
                    triggers: this.getDefaultTriggers(itemMap[hrid]?.consumableDetail)
                })),
                drinks: preset.drinks.map(hrid => ({
                    hrid,
                    triggers: this.getDefaultTriggers(itemMap[hrid]?.consumableDetail)
                })),
                abilities: preset.abilities.map((hrid, index) => ({
                    hrid,
                    level: EquipmentComparisonService.ABILITY_LEVELS[index],
                    triggers: this.getDefaultTriggers(abilityMap[hrid])
                })),
                houseRooms: this.getCurrentHouseRooms(),
                achievements: this.getCurrentAchievements(),
                debuffOnLevelGap: 1
            };
        }

        getStandardTarget() {
            return {
                hrid: CombatSimulationService.TARGET_HRID,
                name: 'MST Standard Target',
                isLabyrinthMonster: false,
                isGuildMonster: false,
                enrageTime: 9000000000000000,
                experience: 0,
                combatDetails: {
                    // 装备对比使用不死亡木桩，避免尾刀与重生打乱成对模拟的随机序列。
                    currentHitpoints: CombatSimulationService.TARGET_HITPOINTS,
                    maxHitpoints: CombatSimulationService.TARGET_HITPOINTS,
                    currentManapoints: 80000,
                    maxManapoints: 80000,
                    attackInterval: 9000000000000000,
                    totalCastSpeed: 0,
                    stabAccuracyRating: 10,
                    slashAccuracyRating: 10,
                    smashAccuracyRating: 10,
                    rangedAccuracyRating: 10,
                    magicAccuracyRating: 10,
                    defensiveMaxDamage: 10,
                    stabMaxDamage: 10,
                    slashMaxDamage: 10,
                    smashMaxDamage: 10,
                    rangedMaxDamage: 10,
                    magicMaxDamage: 10,
                    stabEvasionRating: 320,
                    slashEvasionRating: 320,
                    smashEvasionRating: 320,
                    rangedEvasionRating: 320,
                    magicEvasionRating: 320,
                    totalArmor: 62,
                    totalWaterResistance: 62,
                    totalNatureResistance: 62,
                    totalFireResistance: 62,
                    totalThreat: 100,
                    combatLevel: 0,
                    staminaLevel: 7990,
                    intelligenceLevel: 7990,
                    attackLevel: 0,
                    meleeLevel: 0,
                    defenseLevel: 310,
                    rangedLevel: 0,
                    magicLevel: 0,
                    combatStats: {
                        combatStyleHrids: ['/combat_styles/slash'],
                        damageType: '/damage_types/physical',
                        attackInterval: 9000000000000000,
                        armor: 62,
                        waterResistance: 62,
                        natureResistance: 62,
                        fireResistance: 62
                    }
                },
                abilities: [],
                dropTable: null,
                rareDropTable: []
            };
        }

        getStandardZone() {
            return {
                hrid: CombatSimulationService.ZONE_HRID,
                function: '/action_functions/combat',
                type: '/action_types/combat',
                category: '/action_categories/combat/zones',
                name: 'MST Standard Target',
                maxDifficulty: 0,
                levelRequirement: {skillHrid: '', level: 0},
                baseTimeCost: 0,
                experienceGain: {skillHrid: '', value: 0},
                dropTable: null,
                essenceDropTable: null,
                rareDropTable: null,
                upgradeItemHrid: '',
                retainAllEnhancement: false,
                inputItems: null,
                outputItems: null,
                combatZoneInfo: {
                    isDungeon: false,
                    fightInfo: {
                        randomSpawnInfo: {
                            maxSpawnCount: 1,
                            maxTotalStrength: 1,
                            spawns: [{
                                combatMonsterHrid: CombatSimulationService.TARGET_HRID,
                                difficultyTier: 0,
                                rate: 1,
                                strength: 1
                            }]
                        },
                        bossSpawns: null,
                        battlesPerBoss: 0
                    },
                    dungeonInfo: null
                },
                maxPartySize: 1,
                buffs: [],
                sortIndex: 0
            };
        }

        buildSimulationData(players) {
            const itemMap = this.getItemMap();
            const abilityMap = DataHub.getClientDataMap('abilityDetailMap');
            const houseMap = DataHub.getClientDataMap('houseRoomDetailMap');
            const achievementMap = DataHub.getClientDataMap('achievementDetailMap');
            const itemHrids = new Set();
            const abilityHrids = new Set();
            const houseHrids = new Set();
            const achievementHrids = new Set();
            players.forEach(player => {
                Object.values(player.equipment).forEach(item => itemHrids.add(item.hrid));
                player.food.forEach(item => itemHrids.add(item.hrid));
                player.drinks.forEach(item => itemHrids.add(item.hrid));
                player.abilities.forEach(ability => abilityHrids.add(ability.hrid));
                Object.keys(player.houseRooms).forEach(hrid => houseHrids.add(hrid));
                Object.keys(player.achievements).forEach(hrid => achievementHrids.add(hrid));
            });
            const pickMap = (source, keys) => Object.fromEntries(
                [...keys].filter(key => source?.[key]).map(key => [key, source[key]])
            );
            return {
                itemDetailMap: pickMap(itemMap, itemHrids),
                abilityDetailMap: pickMap(abilityMap, abilityHrids),
                houseRoomDetailMap: pickMap(houseMap, houseHrids),
                achievementDetailMap: pickMap(achievementMap, achievementHrids),
                achievementTierDetailMap: DataHub.getClientDataMap('achievementTierDetailMap'),
                combatTriggerDependencyDetailMap:
                    DataHub.getClientDataMap('combatTriggerDependencyDetailMap'),
                combatStyleDetailMap: DataHub.getClientDataMap('combatStyleDetailMap'),
                enhancementLevelTotalBonusMultiplierTable:
                    DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable || [],
                combatMonsterDetailMap: {
                    [CombatSimulationService.TARGET_HRID]: this.getStandardTarget()
                },
                actionDetailMap: {
                    [CombatSimulationService.ZONE_HRID]: this.getStandardZone()
                }
            };
        }

        buildComparisonContext(preset, baselineItem, comparisonItem, comparisonEnhancementLevel) {
            const presetEquipment = this.buildPresetEquipment(preset);
            const baselineEquipment = this.applyEquipmentToBuild(
                presetEquipment,
                baselineItem.itemHrid,
                baselineItem.enhancementLevel
            );
            const comparisonEquipment = this.applyEquipmentToBuild(
                presetEquipment,
                comparisonItem.hrid,
                comparisonEnhancementLevel
            );
            const baselinePlayer = this.buildSimulationPlayer(baselineEquipment, preset);
            const comparisonPlayer = this.buildSimulationPlayer(comparisonEquipment, preset);
            return {
                baselineEquipment,
                comparisonEquipment,
                baselineSelection: {
                    hrid: baselineItem.itemHrid,
                    enhancementLevel: baselineItem.enhancementLevel
                },
                comparisonSelection: {
                    hrid: comparisonItem.hrid,
                    enhancementLevel: comparisonEnhancementLevel
                },
                baselinePlayer,
                comparisonPlayer,
                mstData: this.buildSimulationData([baselinePlayer, comparisonPlayer])
            };
        }

        getEquipmentMarketPrice(itemHrid, enhancementLevel) {
            const row = this.marketService?.getMarketRow(itemHrid, enhancementLevel);
            return [row?.a, row?.p, row?.b].map(Number).find(value => Number.isFinite(value) && value > 0) || 0;
        }

        getEquipmentPriceDifference(baselineItem, comparisonItem) {
            if (!baselineItem?.hrid || !comparisonItem?.hrid) return null;
            const baselinePrice = this.getEquipmentMarketPrice(
                baselineItem.hrid,
                baselineItem.enhancementLevel
            );
            const comparisonPrice = this.getEquipmentMarketPrice(
                comparisonItem.hrid,
                comparisonItem.enhancementLevel
            );
            return baselinePrice && comparisonPrice ? comparisonPrice - baselinePrice : null;
        }

        getDerivedComparison(simulationState, context = null) {
            const result = simulationState.result;
            const priceDifference = context
                ? this.getEquipmentPriceDifference(context.baselineSelection, context.comparisonSelection)
                : null;
            const dps = simulationState.status === 'ready' && Number.isFinite(result?.change)
                ? {status: 'ready', value: result.change}
                : {status: simulationState.status, value: null};
            const dpsPerTenMillion = dps.status === 'ready' && dps.value > 0 && priceDifference > 0
                ? dps.value * 100 / (priceDifference / 1000000) * 10
                : null;
            return {
                priceDifference,
                baselineDps: result?.baselineDps ?? null,
                comparisonDps: result?.comparisonDps ?? null,
                dps,
                dpsPerTenMillion
            };
        }

        getSimulationKey(presetKey, baselineItem, comparisonItem, comparisonEnhancementLevel) {
            const equipmentKey = item =>
                `${item?.itemHrid || item?.hrid || ''}::${Number(item?.enhancementLevel || 0)}`;
            return JSON.stringify({
                presetKey,
                baseline: equipmentKey(baselineItem),
                comparison: equipmentKey({
                    itemHrid: comparisonItem?.hrid,
                    enhancementLevel: comparisonEnhancementLevel
                }),
                levels: this.getCurrentCombatLevels(),
                houses: this.getCurrentHouseRooms()
            });
        }

        getEquipmentTypeMap() {
            return DataHub.getClientDataMap('equipmentTypeDetailMap');
        }

        getWearableLocationHrid(itemDetail) {
            const equipmentType = itemDetail?.equipmentDetail?.type;
            return this.getEquipmentTypeMap()?.[equipmentType]?.itemLocationHrid || equipmentType || '';
        }

        getLogicalSlot(itemDetail) {
            const type = itemDetail?.equipmentDetail?.type;
            if (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand') return 'weapon';
            return this.getWearableLocationHrid(itemDetail);
        }

        isCombatEquipment(itemDetail) {
            const type = itemDetail?.equipmentDetail?.type;
            const typeDetail = this.getEquipmentTypeMap()?.[type];
            return Boolean(itemDetail?.hrid && itemDetail?.equipmentDetail) &&
                type !== '/equipment_types/charm' &&
                type !== '/equipment_types/trinket' &&
                Number(typeDetail?.sortIndex || 999) < 16;
        }

        isEquipmentCompatibleWithPreset(itemDetail, preset) {
            if (!preset || !this.isCombatEquipment(itemDetail)) return false;
            const combatStats = itemDetail.equipmentDetail.combatStats || {};
            const styles = combatStats.combatStyleHrids || [];
            if (styles.length && !styles.includes(preset.combatStyleHrid)) return false;
            const type = itemDetail.equipmentDetail.type;
            const isWeapon = type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand';
            if (isWeapon && preset.weaponTypeHrid && type !== preset.weaponTypeHrid) return false;
            if (isWeapon && preset.damageTypeHrid && combatStats.damageType !== preset.damageTypeHrid) return false;
            return true;
        }

        getCharacterItemSummary(itemHrid) {
            const itemDetail = this.getItemMap()?.[itemHrid];
            const logicalSlot = this.getLogicalSlot(itemDetail);
            const equippedLocations = logicalSlot === 'weapon'
                ? new Set(['/item_locations/main_hand', '/item_locations/two_hand'])
                : new Set([this.getWearableLocationHrid(itemDetail)]);
            const items = CharacterDataService.getCharacterItems().filter(item =>
                item?.itemHrid === itemHrid &&
                Number(item?.count || 0) > 0 &&
                (item.itemLocationHrid === '/item_locations/inventory' || equippedLocations.has(item.itemLocationHrid))
            );
            const equipped = items.find(item => equippedLocations.has(item.itemLocationHrid)) || null;
            const highest = items.reduce((best, item) =>
                !best || Number(item.enhancementLevel || 0) > Number(best.enhancementLevel || 0) ? item : best
            , null);
            return {
                count: items.reduce((sum, item) => sum + Number(item.count || 0), 0),
                enhancementLevel: Number(equipped?.enhancementLevel ?? highest?.enhancementLevel ?? -1),
                isEquipped: Boolean(equipped)
            };
        }

        getRecommendedEnhancementLevel(itemDetail, preset) {
            const summary = this.getCharacterItemSummary(itemDetail.hrid);
            if (summary.enhancementLevel >= 0) return summary.enhancementLevel;
            const presetEntry = this.getPresetEquipmentEntries(preset).find(item => item.itemHrid === itemDetail.hrid);
            return Math.min(
                presetEntry?.enhancementLevel ?? 10,
                this.getMaxEnhancementLevel(itemDetail)
            );
        }

        getBaselineEquipment(preset) {
            return Object.values(this.getItemMap())
                .filter(detail => this.isEquipmentCompatibleWithPreset(detail, preset))
                .map(detail => {
                    const summary = this.getCharacterItemSummary(detail.hrid);
                    return {
                        itemHrid: detail.hrid,
                        enhancementLevel: this.getRecommendedEnhancementLevel(detail, preset),
                        count: summary.count,
                        isEquipped: summary.isEquipped,
                        detail
                    };
                })
                .sort((left, right) => {
                    const leftType = this.getEquipmentTypeMap()?.[left.detail.equipmentDetail.type];
                    const rightType = this.getEquipmentTypeMap()?.[right.detail.equipmentDetail.type];
                    return Number(leftType?.sortIndex || 999) - Number(rightType?.sortIndex || 999) ||
                        Number(left.detail?.sortIndex || 9999) - Number(right.detail?.sortIndex || 9999);
                });
        }

        getCompatibleEquipment(baselineItem, preset) {
            if (!baselineItem) return [];
            const logicalSlot = this.getLogicalSlot(baselineItem.detail);
            return Object.values(this.getItemMap())
                .filter(detail =>
                    this.getLogicalSlot(detail) === logicalSlot &&
                    this.isEquipmentCompatibleWithPreset(detail, preset)
                )
                .sort((left, right) => Number(left.sortIndex || 9999) - Number(right.sortIndex || 9999));
        }

        getMaxEnhancementLevel(itemDetail) {
            if (!Array.isArray(itemDetail?.enhancementCosts) || !itemDetail.enhancementCosts.length) return 0;
            return Math.max(0, (DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable?.length || 1) - 1);
        }

        getEnhancementMultiplier(level) {
            const table = DataHub.getClientData()?.enhancementLevelTotalBonusMultiplierTable || [];
            return Number(table[Math.max(0, Number(level || 0))] || 0);
        }

        getEquipmentStats(itemHrid, enhancementLevel = 0) {
            const equipment = this.getItemMap()?.[itemHrid]?.equipmentDetail;
            if (!equipment) return new Map();
            const multiplier = this.getEnhancementMultiplier(enhancementLevel);
            const result = new Map();
            const addStats = (category, baseStats, enhancementBonuses) => {
                Object.entries(baseStats || {}).forEach(([key, baseValue]) => {
                    if (EquipmentComparisonService.UNIQUE_STAT_KEYS.has(key)) return;
                    let value = baseValue;
                    if (typeof baseValue === 'number' && Number(enhancementLevel) >= 1) {
                        value += multiplier * Number(enhancementBonuses?.[key] || 0);
                    }
                    if (value == null || value === '' || value === 0 || (Array.isArray(value) && !value.length)) return;
                    result.set(`${category}:${key}`, {category, key, value});
                });
            };
            addStats('combat', equipment.combatStats, equipment.combatEnhancementBonuses);
            addStats('noncombat', equipment.noncombatStats, equipment.noncombatEnhancementBonuses);
            return result;
        }

        areStatValuesEqual(left, right) {
            if (Array.isArray(left) || Array.isArray(right)) {
                return Array.isArray(left) && Array.isArray(right) &&
                    left.length === right.length && left.every((value, index) => value === right[index]);
            }
            return left === right;
        }

        getComparisonRows(baselineItem, comparisonItem, comparisonEnhancementLevel) {
            if (!baselineItem || !comparisonItem) return [];
            const baselineStats = this.getEquipmentStats(
                baselineItem.itemHrid,
                baselineItem.enhancementLevel
            );
            const comparisonStats = this.getEquipmentStats(
                comparisonItem.hrid,
                comparisonEnhancementLevel
            );
            const statIds = [...baselineStats.keys(), ...[...comparisonStats.keys()].filter(key => !baselineStats.has(key))];
            return statIds.map(id => {
                const baselineStat = baselineStats.get(id) || null;
                const comparisonStat = comparisonStats.get(id) || null;
                const stat = baselineStat || comparisonStat;
                const isNumeric = typeof baselineStat?.value === 'number' || typeof comparisonStat?.value === 'number';
                const baselineValue = isNumeric ? Number(baselineStat?.value || 0) : baselineStat?.value;
                const comparisonValue = isNumeric ? Number(comparisonStat?.value || 0) : comparisonStat?.value;
                return {
                    id,
                    category: stat.category,
                    key: stat.key,
                    ownedValue: baselineStat ? baselineValue : null,
                    comparisonValue: comparisonStat ? comparisonValue : null,
                    difference: isNumeric ? comparisonValue - baselineValue : null,
                    isEqual: !isNumeric && this.areStatValuesEqual(baselineValue, comparisonValue),
                    isNumeric
                };
            });
        }

        getItemNames(itemHrid) {
            return {
                zh: DataHub.getLocalizedGameName('itemNames', itemHrid, 'zh'),
                en: DataHub.getLocalizedGameName('itemNames', itemHrid, 'en')
            };
        }

        filterPickerOptions(options, query, mode, equipmentTypeHrid) {
            const keyword = String(query || '').trim().toLowerCase();
            return options.filter(item => {
                const itemHrid = mode === 'owned' ? item.itemHrid : item.hrid;
                const itemDetail = mode === 'owned' ? item.detail : item;
                if (equipmentTypeHrid && itemDetail?.equipmentDetail?.type !== equipmentTypeHrid) return false;
                if (!keyword) return true;
                const names = this.getItemNames(itemHrid);
                return [names.zh, names.en, itemHrid].join('\n').toLowerCase().includes(keyword);
            });
        }

        getPickerEquipmentTypes(options, mode) {
            const availableTypes = new Set(options.map(item => {
                const itemDetail = mode === 'owned' ? item.detail : item;
                return itemDetail?.equipmentDetail?.type;
            }).filter(Boolean));
            return Object.entries(this.getEquipmentTypeMap())
                .map(([hrid, detail]) => ({...detail, hrid: detail.hrid || hrid}))
                .filter(detail => availableTypes.has(detail.hrid))
                .sort((left, right) => Number(left.sortIndex || 999) - Number(right.sortIndex || 999));
        }

        detectPresetKey() {
            const itemMap = this.getItemMap();
            const equippedWeapon = CharacterDataService.getCharacterItems().find(item => {
                const detail = itemMap[item?.itemHrid];
                const type = detail?.equipmentDetail?.type;
                return Number(item?.count || 0) > 0 &&
                    item.itemLocationHrid === '/item_locations/main_hand' &&
                    (type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand');
            });
            const detail = itemMap[equippedWeapon?.itemHrid];
            const stats = detail?.equipmentDetail?.combatStats || {};
            const style = stats.combatStyleHrids?.[0];
            if (style === '/combat_styles/smash') {
                return detail?.equipmentDetail?.type === '/equipment_types/two_hand'
                    ? 'meleeBulwark'
                    : 'meleeHammer';
            }
            if (style === '/combat_styles/slash') return 'meleeSword';
            if (style === '/combat_styles/stab') return 'meleeSpear';
            if (style === '/combat_styles/ranged') {
                return detail?.equipmentDetail?.type === '/equipment_types/two_hand'
                    ? 'rangedBow'
                    : 'rangedCrossbow';
            }
            if (style === '/combat_styles/magic') {
                if (stats.damageType === '/damage_types/fire') return 'magicFire';
                if (stats.damageType === '/damage_types/water') return 'magicWater';
                return 'magicNature';
            }
            return 'meleeHammer';
        }

        getDefaultBaselineItem(preset, options) {
            const presetWeapon = this.getPresetEquipmentEntries(preset).find(entry => {
                const type = this.getItemMap()?.[entry.itemHrid]?.equipmentDetail?.type;
                return type === '/equipment_types/main_hand' || type === '/equipment_types/two_hand';
            });
            const equipped = options.find(item =>
                item.isEquipped &&
                this.getLogicalSlot(item.detail) === 'weapon' &&
                this.isEquipmentCompatibleWithPreset(item.detail, preset)
            );
            return equipped || options.find(item => item.itemHrid === presetWeapon?.itemHrid) || options[0] || null;
        }

        canCompare() {
            return Boolean(this.simulationService);
        }

        compare(context) {
            return this.simulationService.compare(
                context.baselinePlayer,
                context.comparisonPlayer,
                context.mstData
            );
        }

        cancel() {
            this.simulationService?.cancel();
        }
    }

    class EquipmentComparisonFeature {
        static PRESETS = Object.freeze({
            meleeHammer: {
                nameKey: 'presetMeleeHammer',
                combatStyleHrid: '/combat_styles/smash',
                weaponTypeHrid: '/equipment_types/main_hand',
                equipment: [
                    ['/items/chaotic_flail', 10], ['/items/knights_aegis', 10],
                    ['/items/corsair_helmet', 10], ['/items/maelstrom_plate_body', 10],
                    ['/items/maelstrom_plate_legs', 10], ['/items/dodocamel_gauntlets', 10],
                    ['/items/polar_bear_shoes', 10]
                ],
                abilities: [
                    '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk',
                    '/abilities/fracturing_impact', '/abilities/sweep'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_melee_coffee']
            },
            meleeBulwark: {
                nameKey: 'presetMeleeBulwark',
                combatStyleHrid: '/combat_styles/smash',
                weaponTypeHrid: '/equipment_types/two_hand',
                equipment: [
                    ['/items/griffin_bulwark', 10], ['/items/corsair_helmet', 10],
                    ['/items/anchorbound_plate_body', 10], ['/items/anchorbound_plate_legs', 10],
                    ['/items/dodocamel_gauntlets', 10], ['/items/polar_bear_shoes', 10]
                ],
                abilities: [
                    '/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution',
                    '/abilities/toughness', '/abilities/shield_bash'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_defense_coffee']
            },
            meleeSword: {
                nameKey: 'presetMeleeSword',
                combatStyleHrid: '/combat_styles/slash',
                equipment: [
                    ['/items/regal_sword', 10], ['/items/knights_aegis', 10],
                    ['/items/corsair_helmet', 10], ['/items/maelstrom_plate_body', 10],
                    ['/items/maelstrom_plate_legs', 10], ['/items/dodocamel_gauntlets', 10],
                    ['/items/grizzly_bear_shoes', 10]
                ],
                abilities: [
                    '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk',
                    '/abilities/crippling_slash', '/abilities/maim'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_melee_coffee']
            },
            meleeSpear: {
                nameKey: 'presetMeleeSpear',
                combatStyleHrid: '/combat_styles/stab',
                equipment: [
                    ['/items/furious_spear', 10], ['/items/knights_aegis', 10],
                    ['/items/corsair_helmet', 10], ['/items/maelstrom_plate_body', 10],
                    ['/items/maelstrom_plate_legs', 10], ['/items/dodocamel_gauntlets', 10],
                    ['/items/black_bear_shoes', 10]
                ],
                abilities: [
                    '/abilities/speed_aura', '/abilities/frenzy', '/abilities/berserk',
                    '/abilities/penetrating_strike', '/abilities/puncture'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_melee_coffee']
            },
            rangedBow: {
                nameKey: 'presetRangedBow',
                combatStyleHrid: '/combat_styles/ranged',
                weaponTypeHrid: '/equipment_types/two_hand',
                equipment: [
                    ['/items/cursed_bow', 10], ['/items/acrobatic_hood', 10],
                    ['/items/kraken_tunic', 10], ['/items/kraken_chaps', 10],
                    ['/items/marksman_bracers', 10], ['/items/centaur_boots', 10]
                ],
                abilities: [
                    '/abilities/critical_aura', '/abilities/berserk', '/abilities/pestilent_shot',
                    '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_ranged_coffee']
            },
            rangedCrossbow: {
                nameKey: 'presetRangedCrossbow',
                combatStyleHrid: '/combat_styles/ranged',
                weaponTypeHrid: '/equipment_types/main_hand',
                equipment: [
                    ['/items/sundering_crossbow', 10], ['/items/manticore_shield', 10],
                    ['/items/acrobatic_hood', 10], ['/items/kraken_tunic', 10],
                    ['/items/kraken_chaps', 10], ['/items/marksman_bracers', 10],
                    ['/items/centaur_boots', 10]
                ],
                abilities: [
                    '/abilities/critical_aura', '/abilities/frenzy', '/abilities/berserk',
                    '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_ranged_coffee']
            },
            magicFire: {
                nameKey: 'presetMagicFire',
                combatStyleHrid: '/combat_styles/magic',
                damageTypeHrid: '/damage_types/fire',
                equipment: [
                    ['/items/blazing_trident', 10], ['/items/bishops_codex', 10],
                    ['/items/magicians_hat', 10], ['/items/royal_fire_robe_top', 10],
                    ['/items/royal_fire_robe_bottoms', 10], ['/items/chrono_gloves', 10],
                    ['/items/sorcerer_boots', 10]
                ],
                abilities: [
                    '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/firestorm',
                    '/abilities/flame_blast', '/abilities/fireball'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_magic_coffee']
            },
            magicWater: {
                nameKey: 'presetMagicWater',
                combatStyleHrid: '/combat_styles/magic',
                damageTypeHrid: '/damage_types/water',
                equipment: [
                    ['/items/rippling_trident', 10], ['/items/bishops_codex', 10],
                    ['/items/magicians_hat', 10], ['/items/royal_water_robe_top', 10],
                    ['/items/royal_water_robe_bottoms', 10], ['/items/chrono_gloves', 10],
                    ['/items/sorcerer_boots', 10]
                ],
                abilities: [
                    '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/frost_surge',
                    '/abilities/mana_spring', '/abilities/water_strike'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_magic_coffee']
            },
            magicNature: {
                nameKey: 'presetMagicNature',
                combatStyleHrid: '/combat_styles/magic',
                damageTypeHrid: '/damage_types/nature',
                equipment: [
                    ['/items/blooming_trident', 10], ['/items/bishops_codex', 10],
                    ['/items/magicians_hat', 10], ['/items/royal_nature_robe_top', 10],
                    ['/items/royal_nature_robe_bottoms', 10], ['/items/chrono_gloves', 10],
                    ['/items/sorcerer_boots', 10]
                ],
                abilities: [
                    '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/toxic_pollen',
                    '/abilities/natures_veil', '/abilities/entangle'
                ],
                drinks: ['/items/ultra_attack_coffee', '/items/ultra_magic_coffee']
            }
        });

        static PRESET_GROUPS = Object.freeze([
            {nameKey: 'presetGroupMelee', keys: ['meleeHammer', 'meleeBulwark', 'meleeSword', 'meleeSpear']},
            {nameKey: 'presetGroupRanged', keys: ['rangedBow', 'rangedCrossbow']},
            {nameKey: 'presetGroupMagic', keys: ['magicFire', 'magicWater', 'magicNature']}
        ]);

        constructor(marketService = null, comparisonService = null) {
            this.marketService = marketService;
            this.comparisonService = comparisonService ||
                new EquipmentComparisonService(marketService);
            this.root = null;
            this.presetKey = 'meleeHammer';
            this.baselineItemHrid = '';
            this.baselineEnhancementLevel = 10;
            this.comparisonItemHrid = '';
            this.comparisonEnhancementLevel = 10;
            this.pickerMode = '';
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.simulationToken = 0;
            this.simulationState = {key: '', status: 'idle', result: null};
            this.helpController = null;
        }

        getEquipmentTypeMap() {
            return this.comparisonService.getEquipmentTypeMap();
        }

        getItemMap() {
            return this.comparisonService.getItemMap();
        }

        getPreset() {
            return EquipmentComparisonFeature.PRESETS[this.presetKey] ||
                EquipmentComparisonFeature.PRESETS.meleeHammer;
        }

        getWearableLocationHrid(itemDetail) {
            return this.comparisonService.getWearableLocationHrid(itemDetail);
        }

        getLogicalSlot(itemDetail) {
            return this.comparisonService.getLogicalSlot(itemDetail);
        }

        isCombatEquipment(itemDetail) {
            return this.comparisonService.isCombatEquipment(itemDetail);
        }

        isEquipmentCompatibleWithPreset(itemDetail, preset = this.getPreset()) {
            return this.comparisonService.isEquipmentCompatibleWithPreset(itemDetail, preset);
        }

        getCharacterItemSummary(itemHrid) {
            return this.comparisonService.getCharacterItemSummary(itemHrid);
        }

        getPresetEquipmentEntries(preset = this.getPreset()) {
            return this.comparisonService.getPresetEquipmentEntries(preset);
        }

        getRecommendedEnhancementLevel(itemDetail) {
            return this.comparisonService.getRecommendedEnhancementLevel(itemDetail, this.getPreset());
        }

        getBaselineEquipment() {
            return this.comparisonService.getBaselineEquipment(this.getPreset());
        }

        getCompatibleEquipment(baselineItem) {
            return this.comparisonService.getCompatibleEquipment(baselineItem, this.getPreset());
        }

        getMaxEnhancementLevel(itemDetail) {
            return this.comparisonService.getMaxEnhancementLevel(itemDetail);
        }

        getEnhancementMultiplier(level) {
            return this.comparisonService.getEnhancementMultiplier(level);
        }

        getEquipmentStats(itemHrid, enhancementLevel = 0) {
            return this.comparisonService.getEquipmentStats(itemHrid, enhancementLevel);
        }

        getComparisonRows(baselineItem, comparisonItem) {
            return this.comparisonService.getComparisonRows(
                baselineItem,
                comparisonItem,
                this.comparisonEnhancementLevel
            );
        }

        getBaselineItem(options = this.getBaselineEquipment()) {
            const option = options.find(item => item.itemHrid === this.baselineItemHrid);
            return option ? {...option, enhancementLevel: this.baselineEnhancementLevel} : null;
        }

        getComparisonItem(compatibleEquipment) {
            return compatibleEquipment.find(detail => detail.hrid === this.comparisonItemHrid) || null;
        }

        getItemName(itemHrid) {
            return DataHub.resolveItemName(itemHrid);
        }

        getItemNames(itemHrid) {
            return this.comparisonService.getItemNames(itemHrid);
        }

        getPickerOptions(mode = this.pickerMode) {
            if (mode === 'owned') return this.getBaselineEquipment();
            if (mode === 'comparison') return this.getCompatibleEquipment(this.getBaselineItem());
            return [];
        }

        filterPickerOptions(options, query, mode = this.pickerMode, equipmentTypeHrid = this.pickerEquipmentType) {
            return this.comparisonService.filterPickerOptions(options, query, mode, equipmentTypeHrid);
        }

        getPickerEquipmentTypes(mode = this.pickerMode) {
            return this.comparisonService.getPickerEquipmentTypes(this.getPickerOptions(mode), mode);
        }

        getItemIconHref(itemHrid) {
            const sprite = utils.getSpriteUrl('items') || '/static/media/items_sprite.f58c9476.svg';
            return `${sprite}#${utils.substrLastSlash(itemHrid)}`;
        }

        getStatName(category, key) {
            const group = category === 'combat' ? 'combatStats' : 'noncombatStats';
            const localized = DataHub.getLocalizedGameName(group, key);
            if (localized && localized !== key) return localized;
            const spaced = String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2');
            return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
        }

        formatNumber(value, maximumFractionDigits = 3) {
            const rounded = Math.abs(value) < 0.0005 ? 0 : Number(Number(value).toFixed(maximumFractionDigits));
            return new Intl.NumberFormat(i18n.locale, {
                maximumFractionDigits
            }).format(rounded);
        }

        formatStatValue(key, value, isDifference = false) {
            if (value == null) return '—';
            if (EquipmentComparisonService.SKILL_STAT_KEYS.has(key)) {
                return DataHub.getLocalizedGameName('skillNames', value);
            }
            if (key === 'combatStyleHrids') {
                return (Array.isArray(value) ? value : [value])
                    .map(hrid => DataHub.getLocalizedGameName('combatStyleNames', hrid))
                    .join(i18n.t('listSeparator'));
            }
            if (key === 'damageType') return DataHub.getLocalizedGameName('damageTypeNames', value);
            if (typeof value !== 'number') return String(value);
            const prefix = isDifference && value > 0 ? '+' : '';
            if (key === 'attackInterval') return `${prefix}${this.formatNumber(value / 1e9)}s`;
            if (EquipmentComparisonService.FLAT_STAT_KEYS.has(key)) return `${prefix}${this.formatNumber(value)}`;
            return `${prefix}${this.formatNumber(value * 100)}%`;
        }

        getDifferenceTone(row) {
            if (!row.isNumeric || !row.difference) return 'neutral';
            const improved = row.key === 'attackInterval' ? row.difference < 0 : row.difference > 0;
            return improved ? 'positive' : 'negative';
        }

        detectPresetKey() {
            return this.comparisonService.detectPresetKey();
        }

        getDefaultBaselineItem() {
            const preset = this.getPreset();
            const options = this.getBaselineEquipment();
            return this.comparisonService.getDefaultBaselineItem(preset, options);
        }

        resetSelectionForPreset() {
            const baseline = this.getDefaultBaselineItem();
            this.baselineItemHrid = baseline?.itemHrid || '';
            this.baselineEnhancementLevel = baseline?.enhancementLevel || 0;
            this.comparisonItemHrid = '';
            this.comparisonEnhancementLevel = this.baselineEnhancementLevel;
            this.pickerMode = '';
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.comparisonService.cancel();
            this.simulationToken++;
            this.simulationState = {key: '', status: 'idle', result: null};
        }

        async requestSimulation() {
            const baselineItem = this.getBaselineItem();
            const comparisonItem = this.getComparisonItem(this.getCompatibleEquipment(baselineItem));
            if (!baselineItem || !comparisonItem || !this.comparisonService.canCompare()) return;
            const key = this.comparisonService.getSimulationKey(
                this.presetKey,
                baselineItem,
                comparisonItem,
                this.comparisonEnhancementLevel
            );
            if (this.simulationState.key === key && ['loading', 'ready'].includes(this.simulationState.status)) return;
            const token = ++this.simulationToken;
            this.comparisonService.cancel();
            this.simulationState = {key, status: 'loading', result: null};
            this.render();
            try {
                const context = this.comparisonService.buildComparisonContext(
                    this.getPreset(),
                    baselineItem,
                    comparisonItem,
                    this.comparisonEnhancementLevel
                );
                const result = await this.comparisonService.compare(context);
                if (token !== this.simulationToken || !this.root) return;
                this.simulationState = {key, status: 'ready', result};
            } catch (error) {
                if (token !== this.simulationToken || !this.root) return;
                console.error('[MST] 战斗装备模拟失败:', error);
                this.simulationState = {key, status: 'error', result: null};
            }
            this.render();
        }
        formatSignedCompactNumber(value) {
            return `${value > 0 ? '+' : ''}${utils.formatCompactNumber(value, 3)}`;
        }

        formatSignedPercent(value, fractionDigits) {
            return `${value > 0 ? '+' : ''}${Number(value).toFixed(fractionDigits)}%`;
        }

        renderDerivedResults(result) {
            const hasPrice = Number.isFinite(result.priceDifference);
            const hasEfficiency = Number.isFinite(result.dpsPerTenMillion);
            let dpsText;
            switch (result.dps.status) {
                case 'loading':
                    dpsText = i18n.t('simulationLoading');
                    break;
                case 'error':
                    dpsText = i18n.t('dpsCalculationError');
                    break;
                case 'ready':
                    dpsText = this.formatSignedPercent(result.dps.value * 100, 3);
                    break;
                default:
                    dpsText = i18n.t('dpsDataUnavailable');
            }

            let dpsTone = 'neutral';
            if (result.dps.status === 'ready') {
                if (result.dps.value > 0) dpsTone = 'positive';
                else if (result.dps.value < 0) dpsTone = 'negative';
            }

            let priceTone = 'neutral';
            if (result.priceDifference < 0) priceTone = 'positive';
            else if (result.priceDifference > 0) priceTone = 'negative';

            const formatDps = value => {
                if (Number.isFinite(value)) return this.formatNumber(value, 2);
                return result.dps.status === 'loading' ? '…' : '—';
            };
            return TemplateRenderer.html`
                <div class="mst-equipment-compare-metrics">
                    <span class="mst-equipment-compare-metric">
                        <small>${i18n.t('baselineDps')}</small>
                        <strong>${formatDps(result.baselineDps)}</strong>
                    </span>
                    <span class="mst-equipment-compare-metric">
                        <small>${i18n.t('comparisonDps')}</small>
                        <strong>${formatDps(result.comparisonDps)}</strong>
                    </span>
                    <span class="mst-equipment-compare-metric">
                        <small>${i18n.t('roughDpsChange')}</small>
                        <strong class=${`mst-equipment-compare-${dpsTone}`}>${dpsText}</strong>
                    </span>
                    <span class="mst-equipment-compare-metric">
                        <small>${i18n.t('priceDifference')}</small>
                        <strong class=${`mst-equipment-compare-${priceTone}`}>${hasPrice ? this.formatSignedCompactNumber(result.priceDifference) : i18n.t('marketPriceUnavailable')}</strong>
                    </span>
                    <span class="mst-equipment-compare-metric" title=${hasEfficiency ? '' : i18n.t('dpsPerTenMillionHint')}>
                        <small>${i18n.t('dpsPerTenMillion')}</small>
                        <strong class="mst-equipment-compare-positive">${hasEfficiency ? this.formatSignedPercent(result.dpsPerTenMillion, 3) : '—'}</strong>
                    </span>
                </div>`;
        }

        handlePresetChange(value) {
            if (!EquipmentComparisonFeature.PRESETS[value]) return;
            this.presetKey = value;
            this.resetSelectionForPreset();
            this.render();
        }

        handleOwnedChange(value) {
            const option = this.getBaselineEquipment().find(item => item.itemHrid === value);
            this.baselineItemHrid = value;
            this.baselineEnhancementLevel = option?.enhancementLevel || 0;
            this.comparisonItemHrid = '';
            this.comparisonEnhancementLevel = this.baselineEnhancementLevel;
            this.pickerMode = '';
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.comparisonService.cancel();
            this.simulationToken++;
            this.simulationState = {key: '', status: 'idle', result: null};
            this.render();
        }

        handleComparisonChange(value) {
            this.comparisonItemHrid = value;
            const detail = this.getItemMap()?.[value];
            this.comparisonEnhancementLevel = Math.min(
                this.baselineEnhancementLevel,
                this.getMaxEnhancementLevel(detail)
            );
            this.pickerMode = '';
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.simulationState = {key: '', status: 'idle', result: null};
            this.render();
            this.requestSimulation();
        }

        handleEnhancementChange(mode, value) {
            const level = Math.max(0, Number(value || 0));
            if (mode === 'owned') {
                this.baselineEnhancementLevel = level;
                if (this.comparisonItemHrid) {
                    this.comparisonEnhancementLevel = Math.min(
                        level,
                        this.getMaxEnhancementLevel(this.getItemMap()[this.comparisonItemHrid])
                    );
                }
            } else {
                this.comparisonEnhancementLevel = level;
            }
            this.simulationState = {key: '', status: 'idle', result: null};
            this.render();
            if (this.comparisonItemHrid) this.requestSimulation();
        }

        openPicker(mode) {
            if (mode === 'comparison' && !this.getBaselineItem()) return;
            this.pickerMode = mode;
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.render();
            this.root?.querySelector('.mst-equipment-compare-picker-search')?.focus();
        }

        closePicker() {
            this.pickerMode = '';
            this.pickerQuery = '';
            this.pickerEquipmentType = '';
            this.render();
        }

        selectPickerOption(value) {
            if (this.pickerMode === 'owned') this.handleOwnedChange(value);
            else if (this.pickerMode === 'comparison') this.handleComparisonChange(value);
        }

        renderEquipmentPickerButton(mode, itemHrid, enhancementLevel, secondaryText, disabled = false) {
            const placeholder = mode === 'owned'
                ? i18n.t('chooseOwnedEquipment')
                : disabled ? i18n.t('chooseOwnedEquipmentFirst') : i18n.t('chooseComparisonEquipment');
            const itemDetail = itemHrid ? this.getItemMap()?.[itemHrid] : null;
            const maxLevel = this.getMaxEnhancementLevel(itemDetail);
            const levels = Array.from({length: maxLevel + 1}, (_, index) => index);
            return TemplateRenderer.html`
                <div role="button"
                    class=${`mst-equipment-compare-select-button${itemHrid ? '' : ' mst-equipment-compare-select-empty'}`}
                    tabindex=${disabled ? '-1' : '0'}
                    aria-disabled=${String(disabled)}
                    aria-label=${placeholder}
                    @click=${event => {
                        if (!disabled && !event.target.closest('.mst-equipment-compare-enhancement')) {
                            this.openPicker(mode);
                        }
                    }}
                    @keydown=${event => {
                        if (!disabled && !event.target.closest('.mst-equipment-compare-enhancement') &&
                            (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            this.openPicker(mode);
                        }
                    }}>
                    <span class="mst-equipment-compare-icon" .hidden=${!itemHrid}>
                        <svg aria-hidden="true"><use href=${itemHrid ? this.getItemIconHref(itemHrid) : ''}></use></svg>
                    </span>
                    <span class="mst-equipment-compare-summary-text" .hidden=${!itemHrid}>
                        <strong>${itemHrid ? this.getItemName(itemHrid) : ''}</strong>
                        <small>${secondaryText}</small>
                    </span>
                    <label class="mst-equipment-compare-enhancement" .hidden=${!itemHrid}>
                        <span>${i18n.t('enhancementLevel')}</span>
                        <select .value=${String(enhancementLevel)} .disabled=${!itemDetail}
                            @change=${event => this.handleEnhancementChange(mode, event.currentTarget.value)}>
                            ${levels.map(option => TemplateRenderer.html`
                                <option value=${String(option)} .selected=${option === enhancementLevel}>+${option}</option>
                            `)}
                        </select>
                    </label>
                    <span class="mst-equipment-compare-placeholder" .hidden=${Boolean(itemHrid)}>${placeholder}</span>
                </div>`;
        }

        renderPickerOptions() {
            const mode = this.pickerMode;
            const options = mode ? this.filterPickerOptions(
                this.getPickerOptions(mode), this.pickerQuery, mode, this.pickerEquipmentType
            ) : [];
            const selectedValue = mode === 'owned' ? this.baselineItemHrid : this.comparisonItemHrid;
            return TemplateRenderer.html`
                <div class="mst-equipment-compare-picker-options">
                ${options.map(item => {
                    const isBaseline = mode === 'owned';
                    const itemHrid = isBaseline ? item.itemHrid : item.hrid;
                    const itemDetail = isBaseline ? item.detail : item;
                    const level = isBaseline
                        ? item.enhancementLevel
                        : Math.min(this.baselineEnhancementLevel, this.getMaxEnhancementLevel(itemDetail));
                    const selected = itemHrid === selectedValue;
                    return TemplateRenderer.html`
                        <button type="button"
                            class=${`mst-equipment-compare-picker-option${selected ? ' mst-equipment-compare-picker-option-selected' : ''}`}
                            title=${this.getItemName(itemHrid)}
                            .disabled=${selected}
                            @click=${() => this.selectPickerOption(itemHrid)}>
                            <span class="mst-equipment-compare-picker-level">+${level}</span>
                            <span class="mst-equipment-compare-picker-item-level">Lv.${Number(itemDetail.itemLevel || 0)}</span>
                            <svg aria-hidden="true"><use href=${this.getItemIconHref(itemHrid)}></use></svg>
                            <strong>${this.getItemName(itemHrid)}</strong>
                        </button>`;
                })}
                <div class="mst-equipment-compare-picker-empty" .hidden=${options.length > 0}>${i18n.t('noEquipmentMatch')}</div>
                </div>`;
        }

        renderEquipmentPicker() {
            const equipmentTypes = this.getPickerEquipmentTypes();
            const renderTypeOptions = types => types.map(detail => TemplateRenderer.html`
                <option value=${detail.hrid}>${DataHub.getLocalizedGameName('equipmentTypeNames', detail.hrid)}</option>
            `);
            return TemplateRenderer.html`
                <div class="mst-equipment-compare-picker" .hidden=${!this.pickerMode}>
                    <div class="mst-equipment-compare-picker-panel">
                        <div class="mst-equipment-compare-picker-filters">
                            <select class="mst-equipment-compare-picker-type" .value=${this.pickerEquipmentType}
                                @change=${event => {
                                    this.pickerEquipmentType = event.currentTarget.value;
                                    this.render();
                                }}>
                                <option value="">${i18n.t('allEquipmentSlots')}</option>
                                ${renderTypeOptions(equipmentTypes)}
                            </select>
                            <input class="mst-equipment-compare-picker-search" type="search"
                                placeholder=${i18n.t('searchEquipment')} autocomplete="off"
                                .value=${this.pickerQuery}
                                @input=${event => {
                                    this.pickerQuery = event.currentTarget.value;
                                    this.render();
                                }}>
                        </div>
                        ${this.renderPickerOptions()}
                        <button type="button" class="mst-equipment-compare-picker-close"
                            @click=${() => this.closePicker()}>${i18n.t('close')}</button>
                    </div>
                </div>`;
        }

        renderComparisonTable(rows) {
            if (!rows.length) {
                return TemplateRenderer.html`<div class="mst-equipment-compare-empty">${i18n.t('noComparableAttributes')}</div>`;
            }
            const tableRows = [];
            const appendGroup = (category, title) => {
                const groupRows = rows.filter(row => row.category === category);
                if (!groupRows.length) return;
                tableRows.push(TemplateRenderer.html`<tr class="mst-equipment-compare-group"><th colspan="4">${title}</th></tr>`);
                groupRows.forEach(row => tableRows.push(TemplateRenderer.html`
                    <tr>
                        <th scope="row">${this.getStatName(row.category, row.key)}</th>
                        <td>${this.formatStatValue(row.key, row.ownedValue)}</td>
                        <td>${this.formatStatValue(row.key, row.comparisonValue)}</td>
                        <td class=${`mst-equipment-compare-difference mst-equipment-compare-${this.getDifferenceTone(row)}`}>
                            ${row.isNumeric
                                ? this.formatStatValue(row.key, row.difference, true)
                                : row.isEqual ? '—' : '≠'}
                        </td>
                    </tr>`));
            };
            appendGroup('combat', i18n.t('combatAttributes'));
            appendGroup('noncombat', i18n.t('noncombatAttributes'));
            return TemplateRenderer.html`
                <div class="mst-equipment-compare-table-wrap">
                    <table class="mst-equipment-compare-table">
                        <thead><tr>
                            <th>${i18n.t('equipmentAttribute')}</th>
                            <th>${i18n.t('ownedEquipment')}</th>
                            <th>${i18n.t('comparisonEquipment')}</th>
                            <th>${i18n.t('attributeDifference')}</th>
                        </tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>`;
        }

        getView() {
            const baselineEquipment = this.getBaselineEquipment();
            const baselineItem = this.getBaselineItem(baselineEquipment);
            const compatibleEquipment = this.getCompatibleEquipment(baselineItem);
            const comparisonItem = this.getComparisonItem(compatibleEquipment);
            const hasComparison = Boolean(baselineItem && comparisonItem);
            const rows = hasComparison ? this.getComparisonRows(baselineItem, comparisonItem) : [];
            const context = hasComparison
                ? this.comparisonService.buildComparisonContext(
                    this.getPreset(),
                    baselineItem,
                    comparisonItem,
                    this.comparisonEnhancementLevel
                )
                : null;
            const derivedResult = this.comparisonService.getDerivedComparison(
                this.simulationState,
                context
            );
            const baselineSummary = baselineItem?.count > 0
                ? i18n.t('ownedQuantity', this.formatNumber(baselineItem.count))
                : DataHub.getLocalizedGameName('equipmentTypeNames', baselineItem?.detail?.equipmentDetail?.type);
            return TemplateRenderer.html`
                <div class=${`mst-equipment-compare-view${this.pickerMode ? ' mst-equipment-compare-picker-open' : ''}`}>
                    <div class="mst-equipment-compare-notice">${i18n.t('equipmentComparisonNotice')}</div>
                    <div class="mst-equipment-compare-config-scroll">
                        <div class="mst-equipment-compare-config-row">
                            <label class="mst-equipment-compare-preset">
                                <span>${i18n.t('combatPreset')}</span>
                                <select .value=${this.presetKey}
                                    @change=${event => this.handlePresetChange(event.currentTarget.value)}>
                                    ${EquipmentComparisonFeature.PRESET_GROUPS.map(group => TemplateRenderer.html`
                                        <optgroup label=${i18n.t(group.nameKey)}>
                                            ${group.keys.map(key => {
                                                const preset = EquipmentComparisonFeature.PRESETS[key];
                                                return TemplateRenderer.html`
                                                    <option value=${key} .selected=${key === this.presetKey}>${i18n.t(preset.nameKey)}</option>
                                                `;
                                            })}
                                        </optgroup>
                                    `)}
                                </select>
                            </label>
                            <section class="mst-equipment-compare-selector">
                                <span class="mst-equipment-compare-selector-title">${i18n.t('ownedEquipment')}</span>
                                <div class="mst-equipment-compare-target-controls">
                                    ${this.renderEquipmentPickerButton(
                                        'owned',
                                        baselineItem?.itemHrid || '',
                                        baselineItem?.enhancementLevel || 0,
                                        baselineSummary || ''
                                    )}
                                </div>
                            </section>
                            <section class="mst-equipment-compare-selector">
                                <span class="mst-equipment-compare-selector-title">${i18n.t('comparisonEquipment')}</span>
                                <div class="mst-equipment-compare-target-controls">
                                    ${baselineItem && !compatibleEquipment.length
                                        ? TemplateRenderer.html`<div class="mst-equipment-compare-empty">${i18n.t('noCompatibleEquipment')}</div>`
                                        : this.renderEquipmentPickerButton(
                                            'comparison',
                                            comparisonItem?.hrid || '',
                                            this.comparisonEnhancementLevel,
                                            comparisonItem
                                                ? DataHub.getLocalizedGameName('equipmentTypeNames', comparisonItem.equipmentDetail.type)
                                                : '',
                                            !baselineItem
                                        )}
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="mst-equipment-compare-results" .hidden=${!hasComparison}>
                        ${this.renderDerivedResults(derivedResult)}
                        ${this.renderComparisonTable(rows)}
                    </div>
                    ${this.renderEquipmentPicker()}
                </div>`;
        }

        render() {
            if (!this.root) return;
            TemplateRenderer.render(() => this.getView(), this.root);
        }

        refreshLanguage() {
            this.render();
            const popup = this.root?.closest('.mst-equipment-compare-dialog');
            if (!popup) return;
            const title = popup.querySelector('.swal2-title');
            if (title) title.textContent = i18n.t('equipmentComparisonTitle');
            this.mountHelpPopover(popup);
        }

        mountHelpPopover(popup) {
            this.helpController?.cleanup();
            this.helpController = CalculatorHelpPopover.mount({
                popup,
                moduleName: 'equipment',
                title: i18n.t('equipmentComparisonHelpTitle'),
                heading: i18n.t('equipmentComparisonTitle'),
                content: i18n.t('equipmentComparisonHelp')
            });
        }

        open() {
            if (!Object.keys(this.getItemMap()).length || !CharacterDataService.getCharacterSkills().length) {
                return Notifier.alert(i18n.t('calculatorDataNotReady'), 'warning');
            }
            this.presetKey = this.detectPresetKey();
            this.resetSelectionForPreset();
            return Notifier.html({
                title: i18n.t('equipmentComparisonTitle'),
                html: () => TemplateRenderer.html`<div id="mst-equipment-compare-root"></div>`,
                width: 'min(46rem, calc(100vw - 1rem))',
                popupClass: 'mst-equipment-compare-dialog',
                didOpen: popup => {
                    this.root = popup.querySelector('#mst-equipment-compare-root');
                    this.render();
                    this.mountHelpPopover(popup);
                    this.marketService?.load().then(() => this.render()).catch(error => {
                        console.warn('[MST] 装备对比市场数据加载失败:', error);
                    });
                },
                willClose: () => {
                    this.helpController?.cleanup();
                    this.helpController = null;
                    this.simulationToken++;
                    this.comparisonService.cancel();
                    this.root = null;
                }
            });
        }

        init() {
            LanguageEvents.subscribe(() => this.refreshLanguage());
        }
    }
    class ToolkitMenuFeature {
        constructor({characterCardFeature, appController, combatCalculator, abilityCalculator, equipmentComparison, dungeonCalculator}) {
            this.characterCardFeature = characterCardFeature;
            this.appController = appController;
            this.combatCalculator = combatCalculator;
            this.abilityCalculator = abilityCalculator;
            this.equipmentComparison = equipmentComparison;
            this.dungeonCalculator = dungeonCalculator;
            this.outsideClickHandler = event => {
                const dropdown = document.getElementById('mst-toolkit-character-dropdown');
                if (dropdown && !dropdown.contains(event.target)) dropdown.remove();
            };
            this.openHandler = event => this.toggleDropdown(event?.detail?.trigger || null);
        }

        getActions() {
            return [
                {key: 'userCharacterCard', icon: 'social', handler: () => this.characterCardFeature.showMyCharacterCard()},
                {key: 'abilityUpgradeCalculator', icon: 'skills', handler: () => this.abilityCalculator.open()},
                {key: 'houseUpgradeCalculator', icon: 'house', handler: () => this.appController.openCalculator()},
                {key: 'combatUpgradeCalculator', icon: 'combat', handler: () => this.combatCalculator.open()},
                {key: 'equipmentComparison', icon: 'loadout', handler: () => this.equipmentComparison.open()},
                {key: 'dungeonProfitCalculator', icon: 'loot_tracker', handler: () => this.dungeonCalculator.open()},
                {
                    key: 'switchCharacter',
                    icon: 'switch_character',
                    handler: () => {
                        if (!GameNavigationService.switchCharacter()) Notifier.toast(i18n.t('navigationUnavailable'), 'warning');
                    }
                }
            ];
        }

        refresh() {
            document.querySelectorAll('.mst-my-character-card-btn').forEach(button => {
                button.textContent = i18n.t('toolkitShort');
                button.title = i18n.t('toolkitTitle');
            });
        }

        toggleDropdown(trigger) {
            const old = document.getElementById('mst-toolkit-character-dropdown');
            if (old) {
                old.remove();
                return;
            }
            const host = trigger?.closest?.('[class*="Header_characterInfo"]') || GameUiAdapter.query('headerCharacterInfo');
            if (!host) return;
            host.style.position = 'relative';
            const dropdown = document.createElement('div');
            dropdown.id = 'mst-toolkit-character-dropdown';
            this.renderDropdown(dropdown);
            host.appendChild(dropdown);
            setTimeout(() => document.addEventListener('click', this.outsideClickHandler, {once: true}), 0);
        }

        renderDropdown(dropdown) {
            if (!dropdown) return;
            const miscSprite = utils.getSpriteUrl('misc') || '/static/media/misc_sprite.cfad291b.svg';
            TemplateRenderer.render(() => TemplateRenderer.html`
                <div class="mst-toolkit-dropdown-title">${i18n.t('toolkitTitle')}</div>
                ${this.getActions().map(({key, icon, handler}) => TemplateRenderer.html`
                    <button type="button" class="mst-toolkit-action" @click=${() => {
                        dropdown.remove();
                        handler();
                    }}>
                        <svg aria-hidden="true"><use href=${miscSprite + '#' + icon}></use></svg>
                        <span>${i18n.t(key)}</span>
                    </button>
                `)}
            `, dropdown);
        }

        init() {
            if (!CONFIG.isGameSite) return;
            window.addEventListener('mst:toolkit:open', this.openHandler);
            this.observer = utils.observeBody(() => this.refresh());
            LanguageEvents.subscribe(() => {
                this.refresh();
            });
        }
    }

    class CombatSimulatorConverter {
        static SKILLS = ['stamina', 'intelligence', 'attack', 'defense', 'melee', 'ranged', 'magic'];

        static convert(loadout, characterData) {
            return {
                player: {...this.getCombatLevels(characterData.characterSkills), equipment: this.getEquipment(loadout.wearableMap)},
                food: {'/action_types/combat': this.getConsumables(loadout.foodItemHrids)},
                drinks: {'/action_types/combat': this.getConsumables(loadout.drinkItemHrids)},
                abilities: this.getAbilities(loadout.abilityMap, characterData.characterAbilities),
                triggerMap: {...(loadout.abilityCombatTriggersMap || {}), ...(loadout.consumableCombatTriggersMap || {})},
                houseRooms: this.getHouseRooms(characterData.characterHouseRoomMap),
                achievements: this.getAchievements(characterData.characterAchievements)
            };
        }

        static getCombatLevels(characterSkills) {
            const result = {};
            this.SKILLS.forEach(skill => {
                result[skill + 'Level'] = characterSkills?.find(item => item.skillHrid === '/skills/' + skill)?.level || 0;
            });
            return result;
        }

        static getEquipment(wearableMap) {
            const result = [];
            Object.entries(wearableMap || {}).forEach(([itemLocationHrid, hash]) => {
                const item = utils.getItemByHash(hash);
                if (!item?.itemHrid) return;
                result.push({itemLocationHrid, itemHrid: item.itemHrid, enhancementLevel: item.enhancementLevel});
            });
            return result;
        }

        static getConsumables(itemHrids) {
            return itemHrids?.map(itemHrid => ({itemHrid})) || [];
        }

        static getAbilities(abilityMap, characterAbilities) {
            const result = [];
            Object.entries(abilityMap || {}).forEach(([, abilityHrid]) => {
                result.push({
                    abilityHrid,
                    level: characterAbilities?.find(item => item.abilityHrid === abilityHrid)?.level || 0
                });
            });
            return result;
        }

        static getHouseRooms(characterHouseRoomMap) {
            const result = {};
            Object.entries(characterHouseRoomMap || {}).forEach(([hrid, room]) => {
                result[hrid] = room.level;
            });
            return result;
        }

        static getAchievements(characterAchievements) {
            const result = {};
            characterAchievements?.forEach(item => {
                result[item.achievementHrid] = item.isCompleted;
            });
            return result;
        }
    }

    class EdsMilkonomyFeature {
        // 与 EDS 的 INCLUDE_ITEMS 完全一致；装备详情使用游戏官方 clientData。
        static INCLUDE_ITEM_HRIDS = new Set([
            '/items/advanced_alchemy_charm', '/items/advanced_brewing_charm', '/items/advanced_cheesesmithing_charm',
            '/items/advanced_cooking_charm', '/items/advanced_crafting_charm', '/items/advanced_enhancing_charm',
            '/items/advanced_foraging_charm', '/items/advanced_milking_charm', '/items/advanced_tailoring_charm',
            '/items/advanced_woodcutting_charm', '/items/alchemists_bottoms', '/items/alchemists_top',
            '/items/artificer_cape', '/items/artificer_cape_refined', '/items/azure_alembic', '/items/azure_brush',
            '/items/azure_chisel', '/items/azure_enhancer', '/items/azure_hammer', '/items/azure_hatchet',
            '/items/azure_needle', '/items/azure_pot', '/items/azure_shears', '/items/azure_spatula',
            '/items/basic_alchemy_charm', '/items/basic_brewing_charm', '/items/basic_cheesesmithing_charm',
            '/items/basic_cooking_charm', '/items/basic_crafting_charm', '/items/basic_enhancing_charm',
            '/items/basic_foraging_charm', '/items/basic_milking_charm', '/items/basic_tailoring_charm',
            '/items/basic_woodcutting_charm', '/items/brewers_bottoms', '/items/brewers_top', '/items/burble_alembic',
            '/items/burble_brush', '/items/burble_chisel', '/items/burble_enhancer', '/items/burble_hammer',
            '/items/burble_hatchet', '/items/burble_needle', '/items/burble_pot', '/items/burble_shears',
            '/items/burble_spatula', '/items/celestial_alembic', '/items/celestial_brush', '/items/celestial_chisel',
            '/items/celestial_enhancer', '/items/celestial_hammer', '/items/celestial_hatchet', '/items/celestial_needle',
            '/items/celestial_pot', '/items/celestial_shears', '/items/celestial_spatula', '/items/chance_cape',
            '/items/chance_cape_refined', '/items/cheese_alembic', '/items/cheese_brush', '/items/cheese_chisel',
            '/items/cheese_enhancer', '/items/cheese_hammer', '/items/cheese_hatchet', '/items/cheese_needle',
            '/items/cheese_pot', '/items/cheese_shears', '/items/cheese_spatula', '/items/cheesemakers_bottoms',
            '/items/cheesemakers_top', '/items/chefs_bottoms', '/items/chefs_top', '/items/collectors_boots',
            '/items/crafters_bottoms', '/items/crafters_top', '/items/crimson_alembic', '/items/crimson_brush',
            '/items/crimson_chisel', '/items/crimson_enhancer', '/items/crimson_hammer', '/items/crimson_hatchet',
            '/items/crimson_needle', '/items/crimson_pot', '/items/crimson_shears', '/items/crimson_spatula',
            '/items/culinary_cape', '/items/culinary_cape_refined', '/items/dairyhands_bottoms',
            '/items/dairyhands_top', '/items/earrings_of_essence_find', '/items/earrings_of_gathering',
            '/items/earrings_of_rare_find', '/items/enchanted_gloves', '/items/enhancers_bottoms',
            '/items/enhancers_top', '/items/expert_alchemy_charm', '/items/expert_brewing_charm',
            '/items/expert_cheesesmithing_charm', '/items/expert_cooking_charm', '/items/expert_crafting_charm',
            '/items/expert_enhancing_charm', '/items/expert_foraging_charm', '/items/expert_milking_charm',
            '/items/expert_tailoring_charm', '/items/expert_woodcutting_charm', '/items/eye_watch',
            '/items/foragers_bottoms', '/items/foragers_top', '/items/gatherer_cape', '/items/gatherer_cape_refined',
            '/items/grandmaster_alchemy_charm', '/items/grandmaster_brewing_charm',
            '/items/grandmaster_cheesesmithing_charm', '/items/grandmaster_cooking_charm',
            '/items/grandmaster_crafting_charm', '/items/grandmaster_enhancing_charm',
            '/items/grandmaster_foraging_charm', '/items/grandmaster_milking_charm',
            '/items/grandmaster_tailoring_charm', '/items/grandmaster_woodcutting_charm', '/items/guzzling_pouch',
            '/items/holy_alembic', '/items/holy_brush', '/items/holy_chisel', '/items/holy_enhancer',
            '/items/holy_hammer', '/items/holy_hatchet', '/items/holy_needle', '/items/holy_pot',
            '/items/holy_shears', '/items/holy_spatula', '/items/lumberjacks_bottoms', '/items/lumberjacks_top',
            '/items/master_alchemy_charm', '/items/master_brewing_charm', '/items/master_cheesesmithing_charm',
            '/items/master_cooking_charm', '/items/master_crafting_charm', '/items/master_enhancing_charm',
            '/items/master_foraging_charm', '/items/master_milking_charm', '/items/master_tailoring_charm',
            '/items/master_woodcutting_charm', '/items/necklace_of_efficiency', '/items/necklace_of_speed',
            '/items/necklace_of_wisdom', '/items/philosophers_earrings', '/items/philosophers_necklace',
            '/items/philosophers_ring', '/items/rainbow_alembic', '/items/rainbow_brush', '/items/rainbow_chisel',
            '/items/rainbow_enhancer', '/items/rainbow_hammer', '/items/rainbow_hatchet', '/items/rainbow_needle',
            '/items/rainbow_pot', '/items/rainbow_shears', '/items/rainbow_spatula', '/items/red_culinary_hat',
            '/items/ring_of_essence_find', '/items/ring_of_gathering', '/items/ring_of_rare_find',
            '/items/tailors_bottoms', '/items/tailors_top', '/items/trainee_alchemy_charm',
            '/items/trainee_brewing_charm', '/items/trainee_cheesesmithing_charm', '/items/trainee_cooking_charm',
            '/items/trainee_crafting_charm', '/items/trainee_enhancing_charm', '/items/trainee_foraging_charm',
            '/items/trainee_milking_charm', '/items/trainee_tailoring_charm', '/items/trainee_woodcutting_charm',
            '/items/verdant_alembic', '/items/verdant_brush', '/items/verdant_chisel', '/items/verdant_enhancer',
            '/items/verdant_hammer', '/items/verdant_hatchet', '/items/verdant_needle', '/items/verdant_pot',
            '/items/verdant_shears', '/items/verdant_spatula'
        ]);

        static SKILL_TO_HOUSE_MAP = {
            milking: 'dairy_barn',
            foraging: 'garden',
            woodcutting: 'log_shed',
            cheesesmithing: 'forge',
            crafting: 'workshop',
            tailoring: 'sewing_parlor',
            cooking: 'kitchen',
            brewing: 'brewery',
            alchemy: 'laboratory',
            enhancing: 'observatory'
        };
        static ACTION_LOCATIONS = ['tool', 'legs', 'body', 'charm', 'back'];
        static EQUIPMENT_LOCATIONS = ['off_hand', 'head', 'hands', 'feet', 'neck', 'earrings', 'ring', 'pouch'];
        static BUFF_TYPES = ['experience', 'gathering_quantity', 'production_efficiency', 'enhancing_speed'];
        static SCROLL_TO_PERSON_BUFF_MAP = {};
        static ACHIEVEMENT_TIER_MAP = {
            veteran: [
                'bestiary_points_100', 'build_room_level_3', 'coinify_coins_1m', 'collection_points_500', 'cook_spaceberry_cake',
                'defeat_chronofrost_sorcerer', 'defeat_jerry_t5', 'defeat_red_panda', 'enhance_to_10', 'labyrinth_floor_4',
                'learn_special_ability', 'tailor_umbral_tunic', 'total_level_1000', 'woodcut_arcane_tree'
            ],
            novice: [
                'bestiary_points_20', 'brew_gourmet_tea', 'cheesesmith_azure_tool', 'collection_points_100', 'defeat_marine_huntress',
                'defeat_shoebill', 'enhance_to_3', 'learn_ability', 'tailor_medium_pouch', 'task_tokens_10', 'total_level_250'
            ],
            elite: [
                'bestiary_points_200', 'brew_ultra_magic_coffee', 'build_room_level_6', 'clear_chimerical_den',
                'clear_sinister_circus', 'collect_branch_of_insight', 'collect_butter_of_proficiency',
                'collect_thread_of_expertise', 'collection_points_1000', 'craft_dungeon_equipment',
                'defeat_crystal_colossus', 'defeat_dusk_revenant', 'enhance_level_80_to_10',
                'equip_expert_task_badge', 'labyrinth_floor_6', 'total_level_1500'
            ],
            adept: [
                'bestiary_points_40', 'build_room_level_1', 'buy_trainee_charm', 'collection_points_200', 'cook_peach_yogurt',
                'craft_jewelry', 'decompose_bamboo_gloves', 'defeat_gobo_chieftain', 'defeat_luna_empress', 'defeat_the_watcher',
                'enhance_to_6', 'equip_ginkgo_weapon', 'labyrinth_floor_2', 'total_level_500'
            ],
            champion: [
                'bestiary_points_400', 'build_room_level_8', 'clear_enchanted_fortress', 'clear_pirate_cove', 'clear_t1_dungeon_10_times',
                'collection_points_2000', 'craft_celestial_tool_or_outfit', 'craft_master_charm', 'defeat_demonic_overlord_t1',
                'defeat_stalactite_golem_t5', 'enhance_level_90_to_10', 'labyrinth_floor_8', 'refine_dungeon_equipment',
                'tailor_gluttonous_or_guzzling_pouch', 'total_level_1800', 'transmute_philosophers_stone'
            ],
            beginner: ['complete_tutorial', 'cook_apple_gummy', 'craft_wooden_bow', 'defeat_jerry', 'gather_milk', 'total_level_100']
        };
        static COMBAT_ACHIEVEMENTS = ['elite'];

        getGameData() {
            const raw = DataHub.characterData.raw || {};
            const header = GameUiAdapter.query('header');
            const game = utils.getReactComponentProps(header) || {};
            return {
                character: raw.character ?? game.character,
                characterItems: raw.characterItems ?? game.characterItemMap,
                characterHouseRoomMap: raw.characterHouseRoomMap || {},
                characterSkills: raw.characterSkills ?? (game.characterSkillMap ? [...game.characterSkillMap.values()] : []),
                actionTypeDrinkSlotsMap: raw.actionTypeDrinkSlotsMap ?? game.actionTypeDrinkSlotsDict,
                communityBuffs: raw.communityBuffs ?? game.communityBuffs,
                characterAchievements: raw.characterAchievements || [],
                characterBuffs: raw.characterBuffs ?? game.characterBuffs
            };
        }

        convert(characterData = this.getGameData()) {
            const validItems = this.filterValidItems(characterData.characterItems);
            return {
                name: characterData.character?.name || CONFIG.characterId,
                color: '#90ee90',
                actionConfigMap: this.convertActionConfig(
                    characterData.characterSkills,
                    characterData.characterHouseRoomMap,
                    characterData.actionTypeDrinkSlotsMap,
                    validItems
                ),
                specialEquimentMap: this.convertSpecialEquipment(validItems),
                communityBuffMap: this.convertCommunityBuff(characterData.communityBuffs),
                achievementBuffMap: this.convertAchievementBuff(characterData.characterAchievements),
                seals: this.convertSeals(characterData.characterBuffs)
            };
        }

        filterPresetForTarget(preset, target = hostname === 'hyhfish.github.io' ? 'hyhfish' : 'milkonomy') {
            if (target === 'hyhfish') return preset;
            const actionConfigMap = Object.fromEntries(
                Object.entries(preset.actionConfigMap || {}).map(([key, value]) => {
                    const rest = {...(value || {})};
                    delete rest.back;
                    return [key, rest];
                })
            );
            return {
                actionConfigMap,
                specialEquimentMap: preset.specialEquimentMap,
                communityBuffMap: preset.communityBuffMap,
                name: preset.name,
                color: preset.color
            };
        }

        filterPresetForCurrentSite(preset) {
            return this.filterPresetForTarget(preset);
        }

        filterValidItems(characterItems) {
            const result = {};
            const itemMap = DataHub.getClientDataMap('itemDetailMap');
            characterItems?.forEach(item => {
                if (!EdsMilkonomyFeature.INCLUDE_ITEM_HRIDS.has(item.itemHrid)) return;
                const detail = itemMap[item.itemHrid];
                const equipment = detail?.equipmentDetail;
                if (!equipment) return;
                const type = utils.substrLastSlash(equipment.type || item.itemLocationHrid || '');
                let loc = type;
                if (type.endsWith('_tool')) loc = 'tool';
                else if (type.endsWith('_charm')) loc = 'charm';
                const bucket = result[loc] || {};
                const levels = equipment.levelRequirements?.length
                    ? equipment.levelRequirements
                    : [{skillHrid: '/skills/all', level: detail.itemLevel}];
                levels.forEach(req => {
                    const skill = utils.substrLastSlash(req.skillHrid);
                    const prev = bucket[skill];
                    if (
                        !prev ||
                        (!prev.isWearable &&
                            (prev.requiredLevel < req.level ||
                                (prev.requiredLevel === req.level && prev.enhanceLevel < item.enhancementLevel)))
                    ) {
                        bucket[skill] = {
                            itemHrid: item.itemHrid,
                            itemName: detail.name,
                            isWearable: item.itemLocationHrid !== '/item_locations/inventory',
                            enhanceLevel: item.enhancementLevel,
                            itemLevel: detail.itemLevel,
                            requiredLevel: req.level
                        };
                    }
                });
                result[loc] = bucket;
            });
            return result;
        }

        convertActionConfig(skills, houseMap, drinkMap, validItems) {
            const result = {};
            Object.entries(EdsMilkonomyFeature.SKILL_TO_HOUSE_MAP).forEach(([skill, house]) => {
                const row = {action: skill};
                row.playerLevel = skills?.find(item => item.skillHrid === '/skills/' + skill)?.level || 0;
                EdsMilkonomyFeature.ACTION_LOCATIONS.forEach(loc => {
                    const item = validItems[loc]?.[skill] || validItems[loc]?.all;
                    const type = loc === 'tool' ? skill + '_tool' : loc;
                    row[loc] = item
                        ? {type, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel}
                        : {type};
                });
                row.houseLevel = houseMap?.['/house_rooms/' + house]?.level || 0;
                row.tea = drinkMap?.['/action_types/' + skill]?.filter(Boolean).map(item => item.itemHrid) || [];
                result[skill] = row;
            });
            return result;
        }

        convertSpecialEquipment(validItems) {
            const result = {};
            EdsMilkonomyFeature.EQUIPMENT_LOCATIONS.forEach(loc => {
                const items = validItems[loc] || {};
                const item = items.all || items[Object.keys(items)[0]];
                result[loc] = item ? {type: loc, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type: loc};
            });
            return result;
        }

        convertCommunityBuff(communityBuffs) {
            const result = {};
            communityBuffs?.forEach(buff => {
                const type = utils.substrLastSlash(buff.hrid);
                if (EdsMilkonomyFeature.BUFF_TYPES.includes(type)) {
                    result[type] = {type, hrid: buff.hrid, level: buff.level};
                }
            });
            return result;
        }

        convertAchievementBuff(achievements) {
            const completed = {};
            achievements?.forEach(item => {
                completed[utils.substrLastSlash(item.achievementHrid)] = item.isCompleted;
            });
            const result = {};
            Object.entries(EdsMilkonomyFeature.ACHIEVEMENT_TIER_MAP).forEach(([tier, required]) => {
                if (EdsMilkonomyFeature.COMBAT_ACHIEVEMENTS.includes(tier)) return;
                const enabled = (required || []).every(id => completed[id]);
                result[tier] = {type: tier, enabled};
            });
            return result;
        }

        convertSeals(characterBuffs) {
            const now = Date.now();
            return characterBuffs
                ?.filter(buff => now < Date.parse(buff.expiresAt))
                ?.map(buff => {
                    const buffHrid = utils.substrLastSlash(buff.hrid);
                    const itemId = EdsMilkonomyFeature.SCROLL_TO_PERSON_BUFF_MAP[buffHrid] || 'seal_of_' + buffHrid;
                    return '/items/' + itemId;
                }) || [];
        }

        async copyJsonToClipboard(data, successMessage) {
            try {
                await utils.writeClipboard(JSON.stringify(data));
                Notifier.toast(successMessage, 'success');
            } catch (error) {
                Notifier.toast(i18n.t('clipboardWriteFailed', error?.message || error), 'error');
            }
        }

        async copyProfitPreset(target) {
            const preset = this.convert();
            GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
            await this.copyJsonToClipboard(
                this.filterPresetForTarget(preset, target),
                i18n.t(target === 'hyhfish' ? 'copiedHyhfish' : 'copiedMilkonomy')
            );
        }

        syncPresetToStorage() {
            const preset = this.convert();
            const presetJSON = JSON.stringify(preset);
            if (presetJSON === this.lastSyncedPresetJSON) return preset;
            this.lastSyncedPresetJSON = presetJSON;
            GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
            return preset;
        }

        getCombatLoadout(detailsEl) {
            const data = utils.getReactComponentProps(detailsEl) || {};
            const titleEl = GameUiAdapter.query('loadoutMetadata', detailsEl);
            const svgEl = titleEl?.querySelector('svg');
            const updateBtn = titleEl?.querySelector('button');
            const name = utils.getTextBetween(svgEl, updateBtn).trim();
            // 与 EDS 保持一致：只从当前配装详情组件读取，避免全局回退选中其他配装。
            const loadout = Object.values(data.characterLoadoutDict || {}).find(item => item?.name === name);
            return {loadout, data};
        }

        async copyCombatSimulatorData(detailsEl) {
            const {loadout, data} = this.getCombatLoadout(detailsEl);
            if (!loadout) {
                Notifier.toast(i18n.t('loadoutNotFound'), 'error');
                return;
            }
            const raw = DataHub.characterData.raw || {};
            const characterData = {
                characterSkills: data.characterSkillMap ? [...data.characterSkillMap.values()] : [],
                characterAbilities: data.characterAbilityMap ? [...data.characterAbilityMap.values()] : [],
                characterHouseRoomMap: raw.characterHouseRoomMap || {},
                characterAchievements: raw.characterAchievements || []
            };
            await this.copyJsonToClipboard(CombatSimulatorConverter.convert(loadout, characterData), i18n.t('copiedCombatData'));
        }

        requestLoadoutCharacterCard(detailsEl) {
            const {loadout, data} = this.getCombatLoadout(detailsEl);
            if (!loadout) {
                Notifier.toast(i18n.t('loadoutNotFound'), 'error');
                return;
            }
            window.dispatchEvent(new CustomEvent('mst:card:loadout-request', {
                detail: {loadout, reactData: data}
            }));
        }

        addGameButtons() {
            if (!CONFIG.isGameSite) return;
            const equipmentPanel = GameUiAdapter.query('equipmentPanel');
            if (equipmentPanel && !equipmentPanel.querySelector('.mst-eds-profit-menu')) {
                const buttonContainer = GameUiAdapter.query('equipmentButtonContainer', equipmentPanel) || equipmentPanel;
                const ref = buttonContainer.querySelector('button');
                const menu = document.createElement('span');
                menu.className = 'mst-eds-profit-menu';
                const trigger = ref ? ref.cloneNode(true) : document.createElement('button');
                trigger.type = 'button';
                trigger.classList.add('mst-eds-copy-profit');
                trigger.textContent = i18n.t('copyProfitData');
                trigger.title = i18n.t('copyProfitDataTitle');
                const items = document.createElement('span');
                items.className = 'mst-eds-profit-submenu';
                items.hidden = true;
                [
                    ['milkonomy', 'copyMilkonomy', 'copyMilkonomyTitle'],
                    ['hyhfish', 'copyHyhfish', 'copyHyhfish']
                ].forEach(([target, textKey, titleKey]) => {
                    const item = ref ? ref.cloneNode(true) : document.createElement('button');
                    item.type = 'button';
                    item.dataset.profitTarget = target;
                    item.textContent = i18n.t(textKey);
                    item.title = i18n.t(titleKey);
                    item.addEventListener('click', event => {
                        event.stopPropagation();
                        items.hidden = true;
                        this.copyProfitPreset(target);
                    });
                    items.appendChild(item);
                });
                trigger.addEventListener('click', event => {
                    event.stopPropagation();
                    items.hidden = !items.hidden;
                });
                menu.addEventListener('focusout', event => {
                    if (!menu.contains(event.relatedTarget)) items.hidden = true;
                });
                menu.append(trigger, items);
                buttonContainer.appendChild(menu);
            }

            const loadoutsPanel = GameUiAdapter.query('selectedLoadout');
            if (loadoutsPanel) {
                const detailsEl = GameUiAdapter.query('loadoutDetails', loadoutsPanel);
                const combatIcon = detailsEl?.querySelector('[class*="metadata"] svg use')?.getAttribute('href')?.split('#').pop();
                const isCombatLoadout = combatIcon === 'combat';
                const container = loadoutsPanel.querySelector('[class*="buttonsContainer"]') || loadoutsPanel;
                const reference = container.querySelector('button:last-child');
                let mstRow = loadoutsPanel.querySelector('.mst-eds-loadout-actions');
                if (!mstRow) {
                    mstRow = document.createElement('div');
                    mstRow.className = 'mst-eds-loadout-actions';
                    container.insertAdjacentElement('afterend', mstRow);
                }
                // 只在创建按钮时写入 DOM，避免触发 childList 观察器后形成重复回调。
                let combatButton = loadoutsPanel.querySelector('.mst-eds-copy-combat');
                if (isCombatLoadout) {
                    if (!combatButton) {
                        combatButton = reference ? reference.cloneNode(true) : document.createElement('button');
                        combatButton.type = 'button';
                        combatButton.classList.add('mst-eds-copy-combat');
                        combatButton.textContent = i18n.t('copyCombatData');
                        combatButton.onclick = () => this.copyCombatSimulatorData(
                            GameUiAdapter.query('loadoutDetails', loadoutsPanel)
                        );
                        mstRow.appendChild(combatButton);
                    }
                } else if (combatButton) {
                    combatButton.remove();
                }
                let cardButton = loadoutsPanel.querySelector('.mst-eds-loadout-card');
                if (!cardButton) {
                    cardButton = reference ? reference.cloneNode(true) : document.createElement('button');
                    cardButton.type = 'button';
                    cardButton.classList.add('mst-eds-loadout-card');
                    cardButton.textContent = i18n.t('loadoutCharacterCard');
                    cardButton.title = i18n.t('loadoutCharacterCardTitle');
                    cardButton.onclick = () => this.requestLoadoutCharacterCard(
                        GameUiAdapter.query('loadoutDetails', loadoutsPanel)
                    );
                    mstRow.appendChild(cardButton);
                }
            }
        }

        refreshMilkonomyLanguage() {
            i18n.syncPageLanguage();
            const button = document.getElementById('mst-eds-milkonomy-import');
            if (button) button.textContent = i18n.t('syncMilkonomy');
        }

        async readMilkonomyPreset() {
            let preset = null;
            try {
                preset = GM_getValue(STORAGE_KEYS.MILKONOMY_PRESET);
            } catch {}
            // 仅用于兼容曾经写入利润网站当前域的测试数据。
            if (!preset?.name) {
                try {
                    preset = JSON.parse(localStorage.getItem(STORAGE_KEYS.MILKONOMY_PRESET) || 'null');
                } catch {}
            }
            if (preset?.name) return preset;
            const clipboardText = await utils.readClipboard();
            preset = JSON.parse(clipboardText);
            if (preset?.name) GM_setValue(STORAGE_KEYS.MILKONOMY_PRESET, preset);
            return preset;
        }

        async syncMilkonomyPreset() {
            try {
                const preset = await this.readMilkonomyPreset();
                if (!preset?.name) {
                    Notifier.toast(i18n.t('noCharacterData'), 'error');
                    return false;
                }
                const converted = this.filterPresetForCurrentSite(preset);
                let storedPresets = [];
                try {
                    const storedValue = JSON.parse(localStorage.getItem('player-action-config-presets') || '[]');
                    if (Array.isArray(storedValue)) storedPresets = storedValue;
                } catch {}
                let index = storedPresets.findIndex(item => item?.name === converted.name);
                if (index < 0) {
                    storedPresets.push(converted);
                    index = storedPresets.length - 1;
                } else {
                    storedPresets[index] = converted;
                }
                localStorage.setItem('player-action-config-presets', JSON.stringify(storedPresets));
                localStorage.setItem('player-action-preset-index', String(index));
                Notifier.toast(i18n.t('syncedMilkonomy'), 'success');
                setTimeout(() => window.location.reload(), 500);
                return true;
            } catch (error) {
                console.error('[MST] Milkonomy preset sync failed:', error);
                Notifier.toast(i18n.t('syncMilkonomyFailed', error?.message || error), 'error');
                return false;
            }
        }

        initMilkonomySite() {
            if (!CONFIG.isMilkonomySite) return;
            GM_addValueChangeListener(STORAGE_KEYS.MILKONOMY_PRESET, (_name, _oldValue, newValue, remote) => {
                if (!remote || !newValue) return;
                window.dispatchEvent(new CustomEvent('mst:eds:milkonomy-preset', {detail: newValue}));
            });
            const addButton = () => {
                this.refreshMilkonomyLanguage();
                if (document.getElementById('mst-eds-milkonomy-import')) return;
                const gameInfo = document.querySelector('.game-info');
                if (!gameInfo) return;
                const anchor = gameInfo.querySelector('.items-center > .items-center') || gameInfo;
                const btn = utils.ensureButton({
                    host: gameInfo,
                    id: 'mst-eds-milkonomy-import',
                    className: 'el-button el-button--primary',
                    text: i18n.t('syncMilkonomy'),
                    onClick: () => this.syncMilkonomyPreset()
                });
                if (btn) {
                    btn.style.marginLeft = '0.5rem';
                    anchor.after(btn);
                }
            };
            this.milkonomyObserver = utils.observeBody(addButton);
            this.milkonomyLanguageObserver = new MutationObserver(addButton);
            this.milkonomyLanguageObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
            window.addEventListener('beforeunload', () => this.milkonomyLanguageObserver?.disconnect(), {once: true});
        }

        init() {
            this.initMilkonomySite();
            if (!CONFIG.isGameSite) return;
            const schedulePresetSync = () => {
                clearTimeout(this.presetSyncTimer);
                this.presetSyncTimer = setTimeout(() => this.syncPresetToStorage(), 1000);
            };
            window.addEventListener('mst:data:character-ready', schedulePresetSync);
            window.addEventListener('mst:data:character-updated', event => {
                const relevantFields = new Set([
                    '*', 'character', 'characterSkills', 'characterAbilities', 'characterItems',
                    'characterHouseRoomMap', 'characterLoadoutMap', 'combatUnit',
                    'actionTypeDrinkSlotsMap', 'communityBuffs', 'characterAchievements', 'characterBuffs'
                ]);
                if ((event.detail?.fields || []).some(field => relevantFields.has(field))) schedulePresetSync();
            });
            if (DataHub.characterData.raw) schedulePresetSync();
            this.observer = utils.observeBody(() => this.addGameButtons());
            LanguageEvents.subscribe(() => {
                const profitButton = document.querySelector('.mst-eds-copy-profit');
                if (profitButton) {
                    profitButton.textContent = i18n.t('copyProfitData');
                    profitButton.title = i18n.t('copyProfitDataTitle');
                }
                document.querySelectorAll('[data-profit-target]').forEach(button => {
                    const isHyhfish = button.dataset.profitTarget === 'hyhfish';
                    button.textContent = i18n.t(isHyhfish ? 'copyHyhfish' : 'copyMilkonomy');
                    button.title = i18n.t(isHyhfish ? 'copyHyhfish' : 'copyMilkonomyTitle');
                });
                const combatButton = document.querySelector('.mst-eds-copy-combat');
                if (combatButton) combatButton.textContent = i18n.t('copyCombatData');
                const loadoutCardButton = document.querySelector('.mst-eds-loadout-card');
                if (loadoutCardButton) {
                    loadoutCardButton.textContent = i18n.t('loadoutCharacterCard');
                    loadoutCardButton.title = i18n.t('loadoutCharacterCardTitle');
                }
            });
        }
    }

    // CC 1.7.0 完整名片实现，仅替换 MST 的统一数据、存储和通知接入口。
    const OriginalCharacterCardFeature = (() => {
        function getCurrentCharacterName() {
            const raw = DataHub.characterData.raw;
            return raw?.character?.name ||
                raw?.characterName ||
                raw?.name ||
                GameUiAdapter.query('headerNameData')?.getAttribute('data-name') ||
                i18n.t('characterFallback');
        }

        function getLoadoutBannerText(loadout) {
            let typeName;
            if (loadout.actionTypeHrid === '/action_types/combat') {
                typeName = i18n.t('combatLoadout');
            } else {
                typeName = i18n.t('skillingLoadout');
            }
            return `${typeName}: ${loadout.name || ''}`;
        }

        // 只定位独立角色名片，避免误命中队伍名片中的子卡片。
        function getStandaloneCharacterCard() {
            return document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal) #mst-character-card');
        }

        const CardDialogController = {
            open({title, html, width = getCharacterDialogWidth(getEffectiveLayoutMode()), team = false, didOpen, willClose}) {
                state.svgTool.refreshSpritePathsFromDOM();
                return Notifier.html({
                    title,
                    html,
                    width,
                    popupClass: 'mst-character-card-modal' + (team ? ' mst-team-card-modal' : ''),
                    didOpen: modal => {
                        didOpen?.(modal);
                        hydrateBuildScores(modal);
                    },
                    willClose
                });
            }
        };

        const CardDataAdapter = {
            getSkillProgress(characterObj, skillKeyOrHrid, data = null, allowLegacyPower = false) {
                const skillHrid = String(skillKeyOrHrid || '').startsWith('/skills/')
                    ? String(skillKeyOrHrid)
                    : `/skills/${skillKeyOrHrid}`;
                const key = utils.substrLastSlash(skillHrid);
                const directKeys = [`${key}Level`];
                if (allowLegacyPower && key === 'melee') directKeys.push('powerLevel');
                for (const directKey of directKeys) {
                    const directLevel = Number(characterObj?.[directKey]);
                    if (Number.isFinite(directLevel)) return {level: directLevel, source: directKey};
                }

                const characterSkills = data?.characterSkills || characterObj?.characterSkills || [];
                let skill = characterSkills.find(item => item?.skillHrid === skillHrid);
                if (!skill && allowLegacyPower && key === 'melee') {
                    skill = characterSkills.find(item => item?.skillHrid === '/skills/power');
                }
                if (!skill) return null;
                const level = Number(skill.level);
                return Number.isFinite(level) ? {...skill, level} : null;
            },

            getSkillLevel(characterObj, skillKeyOrHrid, options = {}) {
                const progress = this.getSkillProgress(
                    characterObj,
                    skillKeyOrHrid,
                    options.data || null,
                    Boolean(options.allowLegacyPower)
                );
                if (!progress) {
                    if (Object.prototype.hasOwnProperty.call(options, 'missingValue')) {
                        return options.missingValue;
                    }
                    return 0;
                }
                return options.floor ? Math.floor(progress.level) : progress.level;
            }
        };
        const CardRenderer = {};
        const CardImageExporter = {};

        function getCachedCharacterMembers() {
            const candidateIds = new Set(Object.keys(DataHub.characterData.profiles || {}));
            const selfId = DataHub.characterData.raw?.character?.id;
            if (selfId != null) candidateIds.add(String(selfId));

            return [...candidateIds].flatMap(characterID => {
                const id = String(characterID);
                if (id !== String(selfId ?? '') && !DataHub.getProfile(id)) return [];
                const member = buildCharacterCardMember(id);
                if (!member?.data) return [];
                const profile = DataHub.getProfile(id);
                return [{
                    ...member,
                    characterID: id,
                    cacheTimestamp: id === String(selfId ?? '')
                        ? DataHub.characterData.updatedAt
                        : Number(profile?.timestamp || member.data.dataTimestamp || 0)
                }];
            }).sort((a, b) => Number(b.cacheTimestamp || 0) - Number(a.cacheTimestamp || 0));
        }

        function getAddableCachedTeamMembers() {
            const existingIds = new Set(state.teamCard.members.map(getCachedMemberCharacterID).filter(Boolean));
            return getCachedCharacterMembers().filter(member => !existingIds.has(String(member.characterID)));
        }

        function getCachedCharacterOptionsTemplate(candidates, emptyText) {
            const options = !candidates.length
                ? [TemplateRenderer.html`<div class="mst-team-cache-empty">${emptyText}</div>`]
                : candidates.map(member => {
                const name = member.name || i18n.t('characterFallback');
                return TemplateRenderer.html`
                    <button type="button" class="mst-team-cache-option" role="option"
                            data-character-id=${member.characterID}
                            data-search-name=${String(name).toLocaleLowerCase()}
                            aria-selected="false">
                        <span class="mst-team-cache-option-name">${name}</span>
                        <span class="mst-team-cache-option-meta">${formatCardTime(member.cacheTimestamp)}</span>
                    </button>`;
            });
            return TemplateRenderer.html`${options}`;
        }

        function refreshTeamMemberPicker(modal) {
            const input = modal.querySelector('.mst-team-member-search');
            const optionsContainer = modal.querySelector('.mst-team-member-options');
            if (!input || !optionsContainer) return;

            const candidates = getAddableCachedTeamMembers();
            const candidateMap = new Map(candidates.map(member => [String(member.characterID), member]));
            TemplateRenderer.render(() => getCachedCharacterOptionsTemplate(
                candidates,
                i18n.t('noCachedCharactersToAdd')
            ), optionsContainer);

            input.value = '';
            input.disabled = state.teamCard.members.length >= 5 || candidates.length === 0;
            optionsContainer.hidden = true;

            const getOptions = () => [...optionsContainer.querySelectorAll('.mst-team-cache-option')];
            const selectOption = option => {
                if (state.teamCard.members.length >= 5) {
                    showToastNotice(i18n.t('partyCardLimit'), 'warning');
                    return;
                }
                const member = candidateMap.get(option.dataset.characterId || '');
                if (!member) return;
                state.teamCard.members.push(member);
                saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                renderTeamCardDialog(modal);
                showToastNotice(i18n.t('characterAdded'), 'success');
            };
            const filterOptions = () => {
                const query = input.value.trim().toLocaleLowerCase();
                getOptions().forEach(option => {
                    option.hidden = Boolean(query) && !option.dataset.searchName.includes(query);
                    option.setAttribute('aria-selected', 'false');
                });
                optionsContainer.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            };

            input.onfocus = filterOptions;
            input.oninput = filterOptions;
            input.onkeydown = event => {
                if (event.key === 'Escape') {
                    optionsContainer.hidden = true;
                    input.setAttribute('aria-expanded', 'false');
                    return;
                }
                if (event.key !== 'Enter') return;
                const firstVisible = getOptions().find(option => !option.hidden);
                if (!firstVisible) return;
                event.preventDefault();
                selectOption(firstVisible);
            };
            optionsContainer.onclick = event => {
                const option = event.target.closest('.mst-team-cache-option');
                if (option) selectOption(option);
            };
        }

        function createActiveCardFromCachedMember(member) {
            const selfNameElement = member.isSelf
                ? GameUiAdapter.query('characterName')?.outerHTML || null
                : null;
            return {
                data: member.data,
                name: member.name || member.data?.player?.name || i18n.t('characterFallback'),
                nameElement: selfNameElement,
                isMyCharacter: Boolean(member.isSelf),
                options: {},
                characterID: String(member.characterID || '')
            };
        }

        function refreshCharacterCardPicker(modal) {
            const input = modal.querySelector('.mst-character-member-search');
            const optionsContainer = modal.querySelector('.mst-character-member-options');
            if (!input || !optionsContainer) return;

            const candidates = getCachedCharacterMembers();
            const candidateMap = new Map(candidates.map(member => [String(member.characterID), member]));
            TemplateRenderer.render(() => getCachedCharacterOptionsTemplate(
                candidates,
                i18n.t('noCachedCharacters')
            ), optionsContainer);
            input.value = state.activeCard?.name || '';
            input.disabled = candidates.length === 0;
            input.setAttribute('aria-expanded', 'false');
            optionsContainer.hidden = true;

            const getOptions = () => [...optionsContainer.querySelectorAll('.mst-team-cache-option')];
            const selectOption = option => {
                const member = candidateMap.get(option.dataset.characterId || '');
                if (!member) return;
                state.activeCard = createActiveCardFromCachedMember(member);
                input.value = state.activeCard.name;
                input.setAttribute('aria-expanded', 'false');
                optionsContainer.hidden = true;
                refreshCharacterCard();
            };
            const filterOptions = showAll => {
                const query = showAll ? '' : input.value.trim().toLocaleLowerCase();
                getOptions().forEach(option => {
                    option.hidden = Boolean(query) && !option.dataset.searchName.includes(query);
                    option.setAttribute('aria-selected', 'false');
                });
                optionsContainer.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            };

            input.onfocus = () => filterOptions(true);
            input.oninput = () => filterOptions(false);
            input.onkeydown = event => {
                if (event.key === 'Escape') {
                    optionsContainer.hidden = true;
                    input.setAttribute('aria-expanded', 'false');
                    return;
                }
                if (event.key !== 'Enter') return;
                const firstVisible = getOptions().find(option => !option.hidden);
                if (!firstVisible) return;
                event.preventDefault();
                selectOption(firstVisible);
            };
            optionsContainer.onclick = event => {
                const option = event.target.closest('.mst-team-cache-option');
                if (option) selectOption(option);
            };
        }

        function bindTeamCardInteractions(modal) {
            const container = modal.querySelector('#mst-team-character-card');
            if (!container) return;
            refreshTeamMemberPicker(modal);

            const downloadButton = modal.querySelector('.mst-download-team-card-btn');
            if (downloadButton) downloadButton.onclick = CardImageExporter.downloadTeam;
            const copyButton = modal.querySelector('.mst-copy-team-card-btn');
            if (copyButton) copyButton.onclick = CardImageExporter.copyTeam;
            bindCardLayoutSelect(modal);
            const resetButton = modal.querySelector('.mst-reset-team-card-btn');
            if (resetButton) {
                resetButton.onclick = () => {
                    state.teamCard.members = buildPartyCharacterDataList();
                    state.teamCard.teamName = getTeamNameFromPage();
                    saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                    renderTeamCardDialog(modal);
                    showToastNotice(i18n.t('partyDataRestored'), 'success');
                };
            }

            if (!modal.dataset.teamPickerDismissBound) {
                modal.dataset.teamPickerDismissBound = 'true';
                modal.addEventListener('click', event => {
                    if (event.target.closest('.mst-team-member-combobox')) return;
                    const options = modal.querySelector('.mst-team-member-options');
                    const input = modal.querySelector('.mst-team-member-search');
                    if (options) options.hidden = true;
                    if (input) input.setAttribute('aria-expanded', 'false');
                });
            }

            container.querySelectorAll('.mst-team-card-wrap').forEach(wrap => {
                const index = Number(wrap.dataset.index);
                const member = state.teamCard.members[index];
                const deleteButton = wrap.querySelector('.mst-team-card-delete');
                if (deleteButton) {
                    deleteButton.title = i18n.t(member?.isSelf ? 'removeSelf' : 'removeCharacter');
                    deleteButton.onclick = event => {
                        event.stopPropagation();
                        state.teamCard.members.splice(index, 1);
                        saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                        renderTeamCardDialog(modal);
                    };
                }

                const header = wrap.querySelector('.mst-card-header');
                if (!header) return;
                header.draggable = true;
                header.title = i18n.t('dragToReorderCards');
                header.addEventListener('dragstart', event => {
                    wrap.classList.add('mst-character-card-dragging');
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                });
                header.addEventListener('dragend', () => wrap.classList.remove('mst-character-card-dragging'));
            });

            container.ondragover = event => {
                if (!container.querySelector('.mst-team-card-wrap.mst-character-card-dragging')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            };
            container.ondrop = event => {
                const dragging = container.querySelector('.mst-team-card-wrap.mst-character-card-dragging');
                const target = event.target.closest('.mst-team-card-wrap');
                if (!dragging || !target || dragging === target) return;
                event.preventDefault();
                const from = Number(dragging.dataset.index);
                const targetIndex = Number(target.dataset.index);
                const insertAfter = event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2;
                let to = targetIndex + (insertAfter ? 1 : 0);
                const [member] = state.teamCard.members.splice(from, 1);
                if (from < to) to--;
                if (from === to) {
                    state.teamCard.members.splice(from, 0, member);
                    dragging.classList.remove('mst-character-card-dragging');
                    return;
                }
                state.teamCard.members.splice(to, 0, member);
                saveTeamCardToStorage(state.teamCard.teamName, state.teamCard.members);
                const scrollLeft = container.scrollLeft;
                renderTeamCardDialog(modal);
                requestAnimationFrame(() => {
                    const refreshedContainer = modal.querySelector('#mst-team-character-card');
                    if (refreshedContainer) refreshedContainer.scrollLeft = scrollLeft;
                });
            };
        }

        // 获取当前有效的布局模式
        function getEffectiveLayoutMode() {
            return state.layoutMode.getCurrentMode();
        }

        function setCardLayout(layoutMode, contentMode) {
            state.layoutMode.forcedMode = layoutMode === 'mobile' ? 'mobile' : 'desktop';
            state.cardContentMode = ['combat', 'life', 'all'].includes(contentMode) ? contentMode : 'all';
        }

        function getCardLayoutValue() {
            return state.cardContentMode;
        }

        function createCardLayoutSelectTemplate() {
            return TemplateRenderer.html`
                <label class="mst-card-column-toggle">
                    <input class="mst-card-column-checkbox" type="checkbox" .checked=${getEffectiveLayoutMode() === 'desktop'}>
                    <span>${i18n.t('twoColumns')}</span>
                </label>
                <select class="mst-card-layout-select" .value=${getCardLayoutValue()} aria-label=${i18n.t('cardLayout')}>
                    <option value="combat">${i18n.t('combatLayout')}</option>
                    <option value="life">${i18n.t('skillingLayout')}</option>
                    <option value="all">${i18n.t('allCardContent')}</option>
                </select>`;
        }

        function updateCardLayoutSelect(root = document) {
            root.querySelectorAll('.mst-card-layout-select').forEach(select => {
                select.value = getCardLayoutValue();
            });
            root.querySelectorAll('.mst-card-column-checkbox').forEach(checkbox => {
                checkbox.checked = getEffectiveLayoutMode() === 'desktop';
            });
        }

        function bindCardLayoutSelect(modal) {
            const select = modal.querySelector('.mst-card-layout-select');
            const columnCheckbox = modal.querySelector('.mst-card-column-checkbox');
            if (!select || !columnCheckbox) return;
            select.value = getCardLayoutValue();
            columnCheckbox.checked = getEffectiveLayoutMode() === 'desktop';
            const refresh = () => {
                if (modal.classList.contains('mst-team-card-modal')) {
                    renderTeamCardDialog(modal);
                } else {
                    refreshCharacterCard(modal);
                }
            };
            select.onchange = () => {
                setCardLayout(getEffectiveLayoutMode(), select.value);
                refresh();
            };
            columnCheckbox.onchange = () => {
                setCardLayout(columnCheckbox.checked ? 'desktop' : 'mobile', state.cardContentMode);
                refresh();
            };
        }

        // 刷新角色名片布局
        function refreshCharacterCard(sourceModal = null) {
            const modal = sourceModal || document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal)');
            const activeCard = state.activeCard;
            if (!modal || !activeCard) return;

            const cardHost = modal.querySelector('.mst-standalone-card-host');
            if (!cardHost) return;
            TemplateRenderer.render(() => CardRenderer.character(
                activeCard.data,
                activeCard.name,
                activeCard.nameElement,
                activeCard.isMyCharacter,
                activeCard.options
            ), cardHost);
            // 切换缓存角色时，确保时间文本与当前名片数据同步更新。
            updateCharacterCardDataTime(activeCard.data?.dataTimestamp, modal);

            const newCharacterCard = modal.querySelector('#mst-character-card');
            hydrateBuildScores(modal);
            if (activeCard.isMyCharacter && newCharacterCard) {
                // 重新绑定技能槽点击事件
                const skillSlots = newCharacterCard.querySelectorAll('.mst-skill-slot, .mst-empty-skill-slot');
                skillSlots.forEach(slot => {
                    slot.addEventListener('click', function() {
                        const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                        showSkillSelector(skillIndex);
                    });
                });
            }
            updateStandaloneCharacterControls(modal);
            updateCardLayoutSelect(modal);

            // 更新模态框容器的布局类名
            updateModalLayoutClass(modal);
        }

        function createCharacterCardToolbarTemplate() {
            return TemplateRenderer.html`
                <div class="mst-download-section">
                    <div class="mst-button-row mst-character-card-toolbar">
                        <div class="mst-team-member-combobox">
                            <input class="mst-team-member-search mst-character-member-search" type="search" role="combobox"
                                   autocomplete="off" aria-controls="mst-character-member-options" aria-expanded="false"
                                   placeholder=${i18n.t('searchCachedCharacters')}>
                            <div id="mst-character-member-options"
                                 class="mst-team-member-options mst-character-member-options" role="listbox" hidden></div>
                        </div>
                        ${createCardLayoutSelectTemplate()}
                        <button type="button" class="mst-reset-character-card-btn">${i18n.t('resetCharacterData')}</button>
                        <button type="button" class="mst-download-card-btn">${i18n.t('downloadCard')}</button>
                        <button type="button" class="mst-copy-card-btn">${i18n.t('copyCard')}</button>
                    </div>
                    <div class="mst-skill-hint" hidden>
                        <span>${i18n.t('editAbilityHint')}</span>
                    </div>
                </div>`;
        }

        function updateStandaloneCharacterControls(modal) {
            const skillHint = modal.querySelector('.mst-skill-hint');
            if (skillHint) skillHint.hidden = !state.activeCard?.isMyCharacter;
        }

        function bindStandaloneCharacterCardControls(modal) {
            const downloadButton = modal.querySelector('.mst-download-card-btn');
            const copyButton = modal.querySelector('.mst-copy-card-btn');
            const resetButton = modal.querySelector('.mst-reset-character-card-btn');
            if (downloadButton) downloadButton.onclick = CardImageExporter.downloadCharacter;
            if (copyButton) copyButton.onclick = CardImageExporter.copyCharacter;
            bindCardLayoutSelect(modal);
            if (resetButton) {
                resetButton.onclick = () => {
                    if (!state.initialCard) return;
                    state.activeCard = {...state.initialCard};
                    refreshCharacterCard();
                    const input = modal.querySelector('.mst-character-member-search');
                    if (input) input.value = state.activeCard.name;
                };
            }
            refreshCharacterCardPicker(modal);
            updateStandaloneCharacterControls(modal);
            updateCardLayoutSelect(modal);

            if (!modal.dataset.characterPickerDismissBound) {
                modal.dataset.characterPickerDismissBound = 'true';
                modal.addEventListener('click', event => {
                    if (event.target.closest('.mst-team-member-combobox')) return;
                    const options = modal.querySelector('.mst-character-member-options');
                    const input = modal.querySelector('.mst-character-member-search');
                    if (options) options.hidden = true;
                    if (input) input.setAttribute('aria-expanded', 'false');
                });
            }
        }

        function setInitialActiveCard(card) {
            state.activeCard = card;
            state.initialCard = {...card};
        }

        // 更新模态框容器的布局类名
        function updateModalLayoutClass(sourceModal = null) {
            const modalContent = (sourceModal || document).querySelector('.mst-modal-content');
            if (!modalContent) return;

            const currentMode = getEffectiveLayoutMode();
            const modal = modalContent.closest('.mst-character-card-modal');

            modalContent.classList.toggle('mst-desktop-layout', currentMode === 'desktop');
            modalContent.classList.toggle('mst-mobile-layout', currentMode === 'mobile');
            if (modal && !modal.classList.contains('mst-team-card-modal')) {
                modal.style.width = getCharacterDialogWidth(currentMode);
                modal.style.maxWidth = 'calc(100vw - 1rem)';
            }
        }

        function getCharacterDialogWidth(layoutMode) {
            const cardWidth = layoutMode === 'desktop' ? CARD_DESKTOP_WIDTH : CARD_BASE_WIDTH;
            // 额外空间包含弹窗内边距、边框及滚动条稳定占位，避免右侧边框被裁切。
            return `min(${cardWidth + 34}px, calc(100vw - 1rem))`;
        }

        // 简化的SVG创建工具
        class CharacterCardSVGTool {
            constructor() {
                this.isLoaded = true;
                this.spriteSheets = {...SpriteService.defaults};
            }

            async loadSpriteSheets() {
                this.refreshSpritePathsFromDOM();
                return this.isLoaded;
            }

            // 动态获取chat_icons_sprite路径
            getChatIconsSpritePath() {
                return SpriteService.get('chat_icons');
            }

            // 名片沿用统一 SpriteService，保留原接口以避免改动渲染逻辑。
            refreshSpritePathsFromDOM() {
                const previous = JSON.stringify(this.spriteSheets);
                SpriteService.refresh();
                Object.keys(this.spriteSheets).forEach(type => {
                    this.spriteSheets[type] = SpriteService.get(type === 'chatIcons' ? 'chat_icons' : type);
                });
                const updated = previous !== JSON.stringify(this.spriteSheets);
                return updated;
            }

            // 创建MWI风格的SVG图标 - 直接返回HTML字符串
            createSVGIcon(itemId, options = {}) {
                const { className = 'Icon_icon__2LtL_', title = itemId, type = 'items' } = options;
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

        function getAbilityDisplayNames(abilityHrid) {
            const resources = DataHub.getGameI18nResources();
            const abilityMap = DataHub.clientData.raw?.abilityDetailMap || {};
            const fallback = abilityMap[abilityHrid]?.name || utils.substrLastSlash(abilityHrid).replace(/_/g, ' ');
            const en = resources?.en?.translation?.abilityNames?.[abilityHrid] || fallback;
            const zh = resources?.zh?.translation?.abilityNames?.[abilityHrid] || fallback;
            return {en: String(en), zh: String(zh)};
        }

        // 技能选择器相关函数
        function showSkillSelector(skillIndex) {
            if (!state.activeCard?.isMyCharacter) return;
            // 获取所有可用技能（包括未装备的）
            const allSkills = DataHub.characterData.raw?.characterAbilities || [];
            const availableSkills = allSkills
                .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0));

            const selectedHrid = state.customSkills.selectedSkills[skillIndex]?.abilityHrid || '';
            const optionTemplates = availableSkills.map(skill => {
                const names = getAbilityDisplayNames(skill.abilityHrid);
                const displayName = i18n.pick(names);
                const title = names.zh === names.en ? names.zh : `${names.zh} / ${names.en}`;
                const searchText = `${names.zh} ${names.en} ${skill.abilityHrid}`.toLowerCase();
                const selectedClass = selectedHrid === skill.abilityHrid ? ' mst-skill-option-selected' : '';
                return TemplateRenderer.html`
                    <button type="button" class=${`mst-skill-option${selectedClass}`} data-skill-index=${skillIndex}
                        data-ability-hrid=${skill.abilityHrid} data-level=${skill.level}
                        data-search=${searchText} title=${title} aria-label=${title}>
                        <span class="mst-skill-option-level">Lv.${skill.level}</span>
                        <span class="mst-skill-option-icon">${TemplateRenderer.raw(createSvgIcon(skill.abilityHrid, 'abilities'))}</span>
                        <strong class="mst-skill-option-name">${displayName}</strong>
                    </button>`;
            });

            const modal = document.createElement('div');
            modal.className = 'mst-skill-selector-modal';
            TemplateRenderer.render(() => TemplateRenderer.html`
                <div class="mst-skill-selector-content">
                    <div class="mst-skill-selector-header">
                        <h3>${i18n.t('selectCardAbility')}</h3>
                        <button type="button" class="mst-close-skill-selector" title="${i18n.t('close')}">&times;</button>
                    </div>
                    <input class="mst-skill-selector-search" type="search"
                        placeholder="${i18n.t('searchCardAbilityNames')}"
                        aria-label="${i18n.t('searchAbilities')}">
                    <div class="mst-skill-selector-grid">
                        <button type="button" class=${`mst-skill-option mst-empty-skill-option${selectedHrid ? '' : ' mst-skill-option-selected'}`}
                            data-skill-index=${skillIndex} data-ability-hrid="" data-level="0"
                            data-search="空 empty" title=${i18n.t('clearAbilitySlot')}>
                            <span class="mst-skill-option-icon"><span class="mst-empty-skill-icon">-</span></span>
                            <strong class="mst-skill-option-name">${i18n.t('emptySlot')}</strong>
                        </button>
                        ${optionTemplates}
                    </div>
                    <div class="mst-skill-selector-empty" hidden>${i18n.t('noMatchingAbilities')}</div>
                </div>
            `, modal);

            // 添加事件监听器
            modal.querySelector('.mst-close-skill-selector').onclick = () => {
                document.body.removeChild(modal);
            };
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            };

            // 添加技能选项点击事件监听器
            const skillOptions = modal.querySelectorAll('.mst-skill-option');
            skillOptions.forEach(option => {
                option.addEventListener('click', function() {
                    const skillIndex = parseInt(this.getAttribute('data-skill-index'));
                    const abilityHrid = this.getAttribute('data-ability-hrid');
                    const level = parseInt(this.getAttribute('data-level'));
                    selectSkill(skillIndex, abilityHrid, level);
                });
            });

            const searchInput = modal.querySelector('.mst-skill-selector-search');
            const emptyState = modal.querySelector('.mst-skill-selector-empty');
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim().toLowerCase();
                let visibleCount = 0;
                skillOptions.forEach(option => {
                    const visible = !query || option.dataset.search.includes(query);
                    option.hidden = !visible;
                    if (visible) visibleCount++;
                });
                emptyState.hidden = visibleCount > 0;
            });

            document.body.appendChild(modal);
            searchInput.focus();
        }

        function selectSkill(skillIndex, abilityHrid, level) {
            if (!state.activeCard?.isMyCharacter) return;
            // 更新用户选择的技能
            if (abilityHrid === "") {
                // 选择"空"选项，删除该位置的技能
                delete state.customSkills.selectedSkills[skillIndex];
            } else {
                // 选择具体技能
                state.customSkills.selectedSkills[skillIndex] = {
                    abilityHrid: abilityHrid,
                    level: level,
                    slotNumber: skillIndex + 1
                };
            }

            refreshCharacterCard();

            // 关闭技能选择器
            const modal = document.querySelector('.mst-skill-selector-modal');
            if (modal) {
                document.body.removeChild(modal);
            }

        }

        // 名片按真实尺寸展示；内部尺寸由原 390px 设计同比收紧到 300px。
        const CARD_BASE_WIDTH = 300;
        const CARD_PADDING = 12;
        const CARD_BORDER_WIDTH = 2;
        const CARD_COLUMN_GAP = 12;
        const CARD_CONTENT_WIDTH = CARD_BASE_WIDTH - CARD_PADDING * 2 - CARD_BORDER_WIDTH * 2;
        const CARD_DESKTOP_WIDTH = CARD_CONTENT_WIDTH * 2 + CARD_COLUMN_GAP + CARD_PADDING * 2 + CARD_BORDER_WIDTH * 2;
        // 布局只排列完整区块，不改变区块尺寸；两个生活区块加间距等于一个主区块。
        const CARD_MAIN_PANEL_HEIGHT = 314;
        const CARD_LIFE_PANEL_HEIGHT = (CARD_MAIN_PANEL_HEIGHT - CARD_COLUMN_GAP) / 2;
        const CARD_EXPORT_SCALE = 2;
        const TEAM_CARD_EXPORT_BACKGROUND = '#131419';
        // html-to-image 默认会为每个节点复制数百个计算样式；名片只需要以下可见样式。
        const CARD_EXPORT_STYLE_PROPERTIES = [
            'align-content', 'align-items', 'align-self', 'aspect-ratio',
            'background', 'background-blend-mode', 'background-clip', 'background-color', 'background-image',
            'background-origin', 'background-position', 'background-repeat', 'background-size',
            'border', 'border-bottom', 'border-bottom-color', 'border-bottom-left-radius', 'border-bottom-right-radius',
            'border-bottom-style', 'border-bottom-width', 'border-collapse', 'border-color', 'border-left',
            'border-left-color', 'border-left-style', 'border-left-width', 'border-radius', 'border-right',
            'border-right-color', 'border-right-style', 'border-right-width', 'border-spacing', 'border-style',
            'border-top', 'border-top-color', 'border-top-left-radius', 'border-top-right-radius',
            'border-top-style', 'border-top-width', 'border-width', 'bottom', 'box-shadow', 'box-sizing',
            'color', 'content', 'direction', 'display', 'fill', 'fill-opacity', 'filter',
            'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
            'font', 'font-family', 'font-feature-settings', 'font-size', 'font-stretch', 'font-style',
            'font-variant', 'font-weight', 'gap', 'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow',
            'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-gap', 'grid-column-start',
            'grid-row', 'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template',
            'grid-template-areas', 'grid-template-columns', 'grid-template-rows', 'height', 'image-rendering',
            'inset', 'isolation', 'justify-content', 'justify-items', 'justify-self', 'left', 'letter-spacing',
            'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'mask',
            'max-height', 'max-width', 'min-height', 'min-width', 'mix-blend-mode', 'object-fit',
            'object-position', 'opacity', 'order', 'outline', 'overflow', 'overflow-wrap', 'overflow-x',
            'overflow-y', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top',
            'place-content', 'place-items', 'place-self', 'position', 'right', 'row-gap', 'stroke',
            'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-width', 'table-layout',
            'text-align', 'text-decoration', 'text-indent', 'text-overflow', 'text-shadow', 'text-transform',
            'top', 'transform', 'transform-origin', 'vertical-align', 'visibility', 'white-space', 'width',
            'word-break', 'word-spacing', 'writing-mode', 'z-index', '-webkit-text-fill-color',
            '-webkit-text-stroke', '-webkit-text-stroke-color', '-webkit-text-stroke-width'
        ];

        // 使用闭包管理状态，避免全局变量
        const state = {
            svgTool: new CharacterCardSVGTool(),
            observer: null,
            partyObserver: null,
            timer: null,
            loadoutCardHandler: null,
            // 用户自定义技能展示状态
            customSkills: {
                selectedSkills: [], // 用户选择的技能列表
                maxSkills: 5 // 名片固定展示五个技能
            },
            // 名片列数控制：desktop=双列，mobile=单列。
            layoutMode: {
                forcedMode: 'desktop',
                getCurrentMode: function() {
                    return this.forcedMode;
                }
            },
            // 名片内容模式：combat=战斗，life=生活，all=全部。
            cardContentMode: 'all',
            // 当前打开的单人名片，布局切换时复用同一份数据。
            activeCard: null,
            // 单人名片弹窗刚打开时的角色，供“重置角色数据”恢复。
            initialCard: null,
            // 队伍名片数据
            teamCard: {
                members: [], // [{ name, data, isSelf }]
                teamName: ''
            },
            buildScore: {
                sequence: 0,
                sources: new Map()
            }
        };

        // 简化的SVG图标创建函数
        function createSvgIcon(itemHrid, iconType = null, className = 'Icon_icon__2LtL_') {
            // 自动检测图标类型和提取itemId
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
            } else {
                // 对于基础属性图标
                if (['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'].includes(itemHrid)) {
                    type = 'skills';
                    itemId = itemHrid;
                } else {
                    itemId = itemHrid.replace("/items/", "").replace("/abilities/", "").replace("/skills/", "").replace("/misc/", "");
                }
            }

            // 如果手动指定了类型，使用指定的类型
            if (iconType) {
                type = iconType;
            }

            // 使用SVG工具创建图标
            if (state.svgTool && state.svgTool.isLoaded) {
                return state.svgTool.createSVGIcon(itemId, {
                    className: className,
                    title: itemId,
                    type: type
                });
            }

            // 后备方案
            return state.svgTool.createFallbackIcon(itemId, className, itemId);
        }

        const gameCharacterNameClassCache = new Map();

        function getGameCharacterNameClass(localName) {
            if (!localName) return '';
            if (gameCharacterNameClassCache.has(localName)) return gameCharacterNameClassCache.get(localName);
            const escapedName = String(localName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp('\\.([A-Za-z0-9_-]*CharacterName_' + escapedName + '__[A-Za-z0-9_-]+)');
            const findInRules = rules => {
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
                        gameCharacterNameClassCache.set(localName, className);
                        return className;
                    }
                } catch {}
            }
            return '';
        }

        function generateChatIcon(chatIconHrid) {
            if (!chatIconHrid) return '';
            const iconId = String(chatIconHrid).split('/').pop();
            const spritePath = state.svgTool.getChatIconsSpritePath();
            const gameClass = getGameCharacterNameClass('chatIcon');
            return `
                <div class="mst-card-chat-icon ${gameClass}" title="${utils.escapeHtml(chatIconHrid)}">
                    <svg role="img" aria-label="${utils.escapeHtml(iconId)}" width="100%" height="100%">
                        <use href="${utils.escapeHtml(spritePath)}#${utils.escapeHtml(iconId)}"></use>
                    </svg>
                </div>`;
        }

        function generateCharacterNameHeader(data, characterName, characterNameElement) {
            const player = data.player || data;
            const hasIdentityData = Boolean(player.specialChatIconHrid || player.chatIconHrid || player.nameColorHrid || player.gameMode);
            if (!hasIdentityData && characterNameElement) return characterNameElement;

            const wrapperClass = getGameCharacterNameClass('characterName');
            const nameClass = getGameCharacterNameClass('name');
            const colorId = String(player.nameColorHrid || '').split('/').pop();
            const colorClass = getGameCharacterNameClass(colorId);
            const gameModeClass = getGameCharacterNameClass('gameMode');
            let gameModeTag = '';
            if (player.gameMode === 'ironcow') gameModeTag = '[IC]';
            else if (player.gameMode === 'legacy_ironcow') gameModeTag = '[LC]';
            return `
                <div class="mst-card-character-name ${wrapperClass}" translate="no">
                    ${generateChatIcon(player.specialChatIconHrid)}
                    ${generateChatIcon(player.chatIconHrid)}
                    <div class="mst-card-name ${nameClass} ${colorClass}" data-name="${utils.escapeHtml(characterName)}">
                        <span>${utils.escapeHtml(characterName)}</span>
                    </div>
                    ${gameModeTag ? `<div class="mst-card-game-mode ${gameModeClass}">${gameModeTag}</div>` : ''}
                </div>`;
        }

        function registerBuildScoreSource(data) {
            const key = `mst-build-score-${++state.buildScore.sequence}`;
            state.buildScore.sources.set(key, data);
            return key;
        }

        function renderBuildScore(scoreElement, value) {
            const label = scoreElement.querySelector('.mst-card-build-score-label');
            const score = scoreElement.querySelector('.mst-card-build-score-value');
            if (label) label.textContent = i18n.t('buildScore');
            if (score) score.textContent = value;
        }

        function hydrateBuildScores(root = document) {
            const scoreElements = Array.from(root.querySelectorAll('.mst-card-build-score[data-build-score-key]'));
            return Promise.all(scoreElements.map(async scoreElement => {
                const key = scoreElement.dataset.buildScoreKey;
                const data = state.buildScore.sources.get(key);
                if (!data) return;
                if (scoreElement.dataset.scoreState === 'complete' && scoreElement.dataset.renderedScoreKey === key) return;
                if (scoreElement.dataset.scoreState === 'loading' && scoreElement.dataset.loadingScoreKey === key) return;
                scoreElement.dataset.scoreState = 'loading';
                scoreElement.dataset.loadingScoreKey = key;
                renderBuildScore(scoreElement, i18n.t('calculating'));
                try {
                    const score = await buildScoreService.calculate(data);
                    if (scoreElement.dataset.buildScoreKey !== key) return;
                    const hiddenText = score.equipmentHidden ? ` (${i18n.t('equipmentHidden')})` : '';
                    renderBuildScore(scoreElement, `${score.total.toFixed(1)}${hiddenText}`);
                    scoreElement.title = [
                        `${i18n.t('houseScore')}: ${score.house.toFixed(1)}`,
                        `${i18n.t('abilityScore')}: ${score.ability.toFixed(1)}`,
                        `${i18n.t('equipmentScore')}: ${score.equipment.toFixed(1)}`,
                        i18n.t('algorithmSourceMwiTools')
                    ].join('\n');
                    scoreElement.dataset.scoreState = 'complete';
                    scoreElement.dataset.renderedScoreKey = key;
                } catch (error) {
                    if (scoreElement.dataset.buildScoreKey !== key) return;
                    console.warn('[MST] 战力打造分计算失败:', error);
                    renderBuildScore(scoreElement, '--');
                    scoreElement.title = error.message || String(error);
                    scoreElement.dataset.scoreState = 'complete';
                    scoreElement.dataset.renderedScoreKey = key;
                } finally {
                    if (scoreElement.dataset.loadingScoreKey === key) delete scoreElement.dataset.loadingScoreKey;
                    state.buildScore.sources.delete(key);
                }
            }));
        }

        function generateEquipmentPanel(characterObj) {
            // MWI装备槽位映射 - 使用grid位置
            const equipmentSlots = {
                "/item_locations/back": {row: 1, col: 1},
                "/item_locations/head": {row: 1, col: 2},
                "/item_locations/main_hand": {row: 2, col: 1},
                "/item_locations/body": {row: 2, col: 2},
                "/item_locations/off_hand": {row: 2, col: 3},
                "/item_locations/hands": {row: 3, col: 1},
                "/item_locations/legs": {row: 3, col: 2},
                "/item_locations/pouch": {row: 3, col: 3},
                "/item_locations/feet": {row: 4, col: 2},
                "/item_locations/neck": {row: 1, col: 5},
                "/item_locations/earrings": {row: 2, col: 5},
                "/item_locations/ring": {row: 3, col: 5},
                "/item_locations/trinket": {row: 1, col: 3},
                "/item_locations/two_hand": {row: 2, col: 1},
                "/item_locations/charm": {row: 4, col: 5}
            };

            let items = characterObj.equipment || characterObj.characterItems || [];
            const equipmentMap = {};
            let hasTwoHandWeapon = false;

            // 构建装备映射
            items.forEach(item => {
                const slotInfo = equipmentSlots[item.itemLocationHrid];
                if (slotInfo) {
                    equipmentMap[item.itemLocationHrid] = item;
                    if (item.itemLocationHrid === "/item_locations/two_hand") hasTwoHandWeapon = true;
                }
            });

            // 创建MWI风格的装备区域，标题和外框由装备与技能面板统一提供。
            let html = '<div class="mst-equipment-panel">';
            html += '<div class="EquipmentPanel_playerModel__3LRB6">';

            // 遍历所有装备槽位
            Object.entries(equipmentSlots).forEach(([slotHrid, slotInfo]) => {
                // 如果有双手武器，跳过单手主手槽
                if (hasTwoHandWeapon && slotHrid === "/item_locations/main_hand") {
                    return;
                }

                // 如果没有双手武器，跳过双手槽
                if (!hasTwoHandWeapon && slotHrid === "/item_locations/two_hand") {
                    return;
                }

                const item = equipmentMap[slotHrid];

                html += `<div style="grid-row-start:${slotInfo.row};grid-column-start:${slotInfo.col};">`;
                html += '<div class="ItemSelector_itemSelector__2eTV6">';
                html += '<div class="ItemSelector_itemContainer__3olqe">';
                html += '<div class="Item_itemContainer__x7kH1">';
                html += '<div>';

                if (item) {
                    // 有装备的槽位
                    const enhancementLevel = item.enhancementLevel || 0;
                    const itemLevel = Number(DataHub.clientData.raw?.itemDetailMap?.[item.itemHrid]?.itemLevel || 0);
                    const itemName = DataHub.getLocalizedGameName('itemNames', item.itemHrid, i18n.languageKey);

                    html += `<div class="Item_item__2De2O Item_clickable__3viV6" style="position:relative;" title="${utils.escapeHtml(itemName)}">`;
                    html += '<div class="Item_iconContainer__5z7j4">';
                    html += createSvgIcon(item.itemHrid, 'items'); // 使用MWI的Icon类
                    html += '</div>';

                    // 直接使用公共游戏数据渲染装备等级，避免依赖 MWITools 的定时扫描时序。
                    if (itemLevel > 0) {
                        html += `<div class="mst-item-level">${itemLevel}</div>`;
                    }

                    // 强化等级 - 完全按照MWI原生格式
                    if (enhancementLevel > 0) {
                        html += `<div class="Item_enhancementLevel__19g-e mst-equipment-enhancement-processed mst-equipment-enhancement-level-${enhancementLevel}" style="z-index:9;">+${enhancementLevel}</div>`;
                    }

                    html += '</div>';
                } else {
                    // 空装备槽
                    html += '<div class="Item_item__2De2O" style="position:relative;opacity:0.3;">';
                    html += '<div class="Item_iconContainer__5z7j4">';
                    html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px;">${i18n.t('emptySlot')}</div>`;
                    html += '</div>';
                    html += '</div>';
                }

                html += '</div>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
                html += '</div>';
            });

            html += '</div>'; // EquipmentPanel_playerModel__3LRB6
            html += '</div>'; // mst-equipment-panel

            return html;
        }

        // 从页面获取战斗等级
        function calculateCombatLevel(characterObj) {
            try {
                const serverCombatLevel = Number(characterObj.combatLevel ?? characterObj.combatDetails?.combatLevel);
                if (Number.isFinite(serverCombatLevel)) return Math.floor(serverCombatLevel);

                // 获取各项属性等级
                const stamina = characterObj.staminaLevel || 0;
                const intelligence = characterObj.intelligenceLevel || 0;
                const defense = characterObj.defenseLevel || 0;
                const attack = characterObj.attackLevel || 0;
                const melee = CardDataAdapter.getSkillLevel(characterObj, 'melee', {allowLegacyPower: true});
                const ranged = characterObj.rangedLevel || 0;
                const magic = characterObj.magicLevel || 0;

                // 计算公式：战斗等级 = 0.1 * (耐力 + 智力 + 攻击 + 防御 + MAX(近战, 远程, 魔法)) + 0.5 * MAX(攻击, 防御, 近战, 远程, 魔法)
                const maxCombatSkill = Math.max(melee, ranged, magic);
                const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
                const combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);

                return combatLevel;
            } catch (error) {
                console.log('计算战斗等级失败:', error);
                return 0;
            }
        }

        function getLifeProfessionDefinitions() {
            return Object.values(DataHub.clientData.raw?.houseRoomDetailMap || {})
                .filter(detail => detail?.hrid && detail?.skillHrid && !detail.usableInActionTypeMap?.['/action_types/combat'])
                .sort((a, b) => Number(a.sortIndex || 0) - Number(b.sortIndex || 0))
                .slice(0, 10)
                .map(detail => ({
                    houseHrid: detail.hrid,
                    skillHrid: detail.skillHrid,
                    toolLocationHrid: `/item_locations/${utils.substrLastSlash(detail.skillHrid)}_tool`,
                    toolTypeHrid: `/equipment_types/${utils.substrLastSlash(detail.skillHrid)}_tool`,
                    fallbackHouseName: detail.name || utils.substrLastSlash(detail.hrid).replace(/_/g, ' ')
                }));
        }

        function generateLifeToolsPanel(data, characterObj) {
            const definitions = getLifeProfessionDefinitions();
            if (!definitions.length) return '';
            const equipment = characterObj.equipment || characterObj.characterItems || [];
            const equipmentByLocation = new Map(equipment.map(item => [item?.itemLocationHrid, item]));
            const language = i18n.languageKey;
            const slots = definitions.map(definition => {
                const item = equipmentByLocation.get(definition.toolLocationHrid);
                const emptyName = DataHub.getLocalizedGameName('equipmentTypeNames', definition.toolTypeHrid, language);
                const displayEmptyName = language === 'en'
                    ? emptyName
                        .replace(/woodcutting/gi, word => `${word.slice(0, 4)}\u00AD${word.slice(4)}`)
                        .replace(/cheesesmithing/gi, word => `${word.slice(0, 6)}\u00AD${word.slice(6)}`)
                    : emptyName;
                const itemName = item
                    ? DataHub.getLocalizedGameName('itemNames', item.itemHrid, language)
                    : emptyName;
                const enhancementLevel = Number(item?.enhancementLevel || 0);
                const itemLevel = Number(DataHub.clientData.raw?.itemDetailMap?.[item?.itemHrid]?.itemLevel || 0);
                return `
                    <div class="mst-life-tool-slot" title="${utils.escapeHtml(itemName)}">
                        <div class="ItemSelector_itemSelector__2eTV6">
                            <div class="ItemSelector_itemContainer__3olqe">
                                ${item ? `
                                    <div class="Item_itemContainer__x7kH1">
                                        <div>
                                            <div class="Item_item__2De2O Item_clickable__3viV6" style="position:relative;">
                                                <div class="Item_iconContainer__5z7j4">${createSvgIcon(item.itemHrid, 'items')}</div>
                                                ${itemLevel > 0 ? `<div class="mst-item-level">${itemLevel}</div>` : ''}
                                                ${enhancementLevel > 0 ? `<div class="Item_enhancementLevel__19g-e mst-equipment-enhancement-processed mst-equipment-enhancement-level-${enhancementLevel}" style="z-index:9;">+${enhancementLevel}</div>` : ''}
                                            </div>
                                        </div>
                                    </div>` : `
                                    <div class="Item_itemContainer__x7kH1">
                                        <div>
                                            <div class="Item_item__2De2O" style="position:relative;opacity:0.3;">
                                                <div class="Item_name__2C42x mst-life-tool-empty-name" lang="${language}">${utils.escapeHtml(displayEmptyName)}</div>
                                            </div>
                                        </div>
                                    </div>`}
                            </div>
                        </div>
                    </div>`;
            }).join('');
            return `
                <div class="mst-life-equipment-panel">
                    <div class="mst-panel-title">${i18n.t('skillingTools')}</div>
                    <div class="mst-life-tools-grid">${slots}</div>
                </div>`;
        }

        function generateLifeProgressionPanel(data, characterObj, availability = {}) {
            const definitions = getLifeProfessionDefinitions();
            if (!definitions.length) return '';
            const houseRoomMap = data.houseRooms || data.characterHouseRoomMap || {};
            const language = i18n.languageKey;
            const resources = DataHub.getGameI18nResources();
            const renderLevel = (level, isHouse = false) => {
                if (level == null) return '<span class="mst-life-progress-level mst-unavailable-level">--</span>';
                const maxClass = isHouse && level === 8 ? ' mst-house-max-level' : '';
                return `<span class="mst-life-progress-level${maxClass}">Lv.${Math.floor(level)}</span>`;
            };
            const slots = definitions.map(definition => {
                const skillName = DataHub.getLocalizedGameName('skillNames', definition.skillHrid, language);
                const skillLevel = CardDataAdapter.getSkillLevel(characterObj, definition.skillHrid, {
                    data,
                    floor: true,
                    missingValue: null
                });
                const room = houseRoomMap[definition.houseHrid];
                const roomLevel = availability.house === false
                    ? null
                    : Number(typeof room === 'object' ? room?.level || 0 : room || 0);
                const roomName = String(
                    resources?.[language]?.translation?.houseRoomNames?.[definition.houseHrid] ||
                    definition.fallbackHouseName
                );
                return `
                    <div class="mst-life-progress-slot">
                        <div class="mst-life-level-row" title="${utils.escapeHtml(skillName)}">
                            <span class="mst-life-progress-icon">${createSvgIcon(definition.skillHrid, 'skills')}</span>
                            ${renderLevel(skillLevel)}
                        </div>
                        <div class="mst-life-house-row" title="${utils.escapeHtml(roomName)}">
                            <span class="mst-life-progress-icon">${createSvgIcon(definition.houseHrid)}</span>
                            ${renderLevel(roomLevel, true)}
                        </div>
                    </div>`;
            }).join('');
            return `
                <div class="mst-life-progression-panel">
                    <div class="mst-panel-title">${i18n.t('skillingLevelsAndHouses')}</div>
                    <div class="mst-life-progression-grid">${slots}</div>
                </div>`;
        }

        function generateSkillPanel(data, isMyCharacter = false, options = {}) {
            const teamMode = options && options.teamMode;
            let abilities = data.abilities || data.characterSkills || [];

            let combatSkills;

            if (isMyCharacter) {
                // 团队模式：按实际栏位显示已装备技能，缺少的栏位显示只读空槽。
                if (teamMode) {
                    combatSkills = Array(state.customSkills.maxSkills).fill(null);
                    abilities
                        .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                        .filter(ability => ability.slotNumber > 0 && ability.slotNumber <= state.customSkills.maxSkills)
                        .forEach(ability => {
                            combatSkills[ability.slotNumber - 1] = ability;
                        });
                    let html = '<div class="mst-skill-panel">';
                    html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';
                    combatSkills.forEach(selectedSkill => {
                        if (!selectedSkill) {
                            html += `<div><div class="Ability_ability__1njrh mst-empty-skill-slot mst-card-readonly-empty-skill-slot"><span class="mst-card-empty-skill-label">${i18n.t('emptySlot')}</span></div></div>`;
                            return;
                        }
                        const skillName = i18n.pick(getAbilityDisplayNames(selectedSkill.abilityHrid));
                        html += '<div>';
                        html += `<div class="Ability_ability__1njrh" title="${utils.escapeHtml(skillName)}">`;
                        html += '<div class="Ability_iconContainer__3syNQ">';
                        html += createSvgIcon(selectedSkill.abilityHrid, 'abilities');
                        html += '</div>';
                        html += `<div class="Ability_level__1L-do">Lv.${selectedSkill.level}</div>`;
                        html += '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '</div>';
                    return html;
                }
                // 场景2：根据slotNumber筛选和排序
                combatSkills = abilities
                    .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"))
                    .filter(ability => ability.slotNumber && ability.slotNumber > 0)
                    .sort((a, b) => a.slotNumber - b.slotNumber)
                    .slice(0, 5); // 按slotNumber升序排列

                // 初始化用户选择的技能（如果为空）
                if (state.customSkills.selectedSkills.length === 0) {
                    // 按游戏中的实际技能栏位初始化，保留中间的空槽。
                    combatSkills.forEach(skill => {
                        if (skill.slotNumber > state.customSkills.maxSkills) return;
                        state.customSkills.selectedSkills[skill.slotNumber - 1] = {
                            abilityHrid: skill.abilityHrid,
                            level: skill.level,
                            slotNumber: skill.slotNumber
                        };
                    });
                }

                let html = '<div class="mst-skill-panel">';

                // 使用MWI原生的技能网格容器
                html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';

                // 渲染用户选择的技能（最多8个）
                for (let i = 0; i < state.customSkills.maxSkills; i++) {
                    const selectedSkill = state.customSkills.selectedSkills[i];

                    if (selectedSkill) {
                        // 显示已选择的技能
                        const skillName = i18n.pick(getAbilityDisplayNames(selectedSkill.abilityHrid));
                        html += '<div>';
                        html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM mst-skill-slot" data-skill-index="${i}" title="${utils.escapeHtml(skillName)}">`;
                        html += '<div class="Ability_iconContainer__3syNQ">';
                        html += createSvgIcon(selectedSkill.abilityHrid, 'abilities');
                        html += '</div>';
                        html += `<div class="Ability_level__1L-do">Lv.${selectedSkill.level}</div>`;
                        html += '</div>';
                        html += '</div>';
                    } else {
                        // 自己的空技能栏仍可点击选择技能。
                        html += '<div>';
                        html += `<div class="Ability_ability__1njrh Ability_clickable__w9HcM mst-empty-skill-slot" data-skill-index="${i}">`;
                        html += `<span class="mst-card-empty-skill-label">${i18n.t('emptySlot')}</span>`;
                        html += '</div>';
                        html += '</div>';
                    }
                }

                html += '</div>'; // AbilitiesPanel_abilityGrid__-p-VF
                html += '</div>'; // mst-skill-panel

                return html;
            } else {
                // 优先按 slotNumber 还原五个技能栏位；旧缓存没有栏位信息时保持原始顺序。
                const validAbilities = abilities
                    .filter(ability => ability.abilityHrid && ability.abilityHrid.startsWith("/abilities/"));
                const equippedAbilities = validAbilities
                    .filter(ability => ability.slotNumber > 0 && ability.slotNumber <= state.customSkills.maxSkills);
                combatSkills = Array(state.customSkills.maxSkills).fill(null);
                if (equippedAbilities.length) {
                    equippedAbilities.forEach(ability => {
                        combatSkills[ability.slotNumber - 1] = ability;
                    });
                } else {
                    validAbilities.slice(0, state.customSkills.maxSkills).forEach((ability, index) => {
                        combatSkills[index] = ability;
                    });
                }

                let html = '<div class="mst-skill-panel">';

                // 使用MWI原生的技能网格容器
                html += '<div class="AbilitiesPanel_abilityGrid__-p-VF">';

                // 渲染每个技能
                combatSkills.forEach(ability => {
                    if (!ability) {
                        html += `<div><div class="Ability_ability__1njrh mst-empty-skill-slot mst-card-readonly-empty-skill-slot"><span class="mst-card-empty-skill-label">${i18n.t('emptySlot')}</span></div></div>`;
                        return;
                    }
                    const skillName = i18n.pick(getAbilityDisplayNames(ability.abilityHrid));
                    html += '<div>';
                    html += `<div class="Ability_ability__1njrh" title="${utils.escapeHtml(skillName)}">`;
                    html += '<div class="Ability_iconContainer__3syNQ">';
                    html += createSvgIcon(ability.abilityHrid, 'abilities'); // 使用完整的hrid
                    html += '</div>';
                    html += `<div class="Ability_level__1L-do">Lv.${ability.level}</div>`;
                    html += '</div>';
                    html += '</div>';
                });

                html += '</div>'; // AbilitiesPanel_abilityGrid__-p-VF
                html += '</div>'; // mst-skill-panel

                return html;
            }
        }

        function generateProgressionPanel(data, characterObj, availability = {}) {
            const houseRoomMap = data.houseRooms || data.characterHouseRoomMap || {};
            const language = i18n.languageKey;
            const resources = DataHub.getGameI18nResources();
            const getOfficialName = (group, hrid, fallback) =>
                String(resources?.[language]?.translation?.[group]?.[hrid] || fallback);
            const rows = [
                {house: {icon: 'house', type: 'misc'}, combat: {key: 'combat', icon: 'combat', type: 'misc', name: i18n.t('combat')}},
                {house: {hrid: '/house_rooms/dining_room', name: getOfficialName('houseRoomNames', '/house_rooms/dining_room', i18n.t('diningRoom'))}, combat: {key: 'stamina', icon: 'stamina', name: getOfficialName('skillNames', '/skills/stamina', i18n.t('stamina'))}},
                {house: {hrid: '/house_rooms/library', name: getOfficialName('houseRoomNames', '/house_rooms/library', i18n.t('library'))}, combat: {key: 'intelligence', icon: 'intelligence', name: getOfficialName('skillNames', '/skills/intelligence', i18n.t('intelligence'))}},
                {house: {hrid: '/house_rooms/dojo', name: getOfficialName('houseRoomNames', '/house_rooms/dojo', i18n.t('dojo'))}, combat: {key: 'attack', icon: 'attack', name: getOfficialName('skillNames', '/skills/attack', i18n.t('attack'))}},
                {house: {hrid: '/house_rooms/armory', name: getOfficialName('houseRoomNames', '/house_rooms/armory', i18n.t('armory'))}, combat: {key: 'defense', icon: 'defense', name: getOfficialName('skillNames', '/skills/defense', i18n.t('defense'))}},
                {house: {hrid: '/house_rooms/gym', name: getOfficialName('houseRoomNames', '/house_rooms/gym', i18n.t('gym'))}, combat: {key: 'melee', icon: 'melee', name: getOfficialName('skillNames', '/skills/melee', i18n.t('melee'))}},
                {house: {hrid: '/house_rooms/archery_range', name: getOfficialName('houseRoomNames', '/house_rooms/archery_range', i18n.t('archeryRange'))}, combat: {key: 'ranged', icon: 'ranged', name: getOfficialName('skillNames', '/skills/ranged', i18n.t('ranged'))}},
                {house: {hrid: '/house_rooms/mystical_study', name: getOfficialName('houseRoomNames', '/house_rooms/mystical_study', i18n.t('mysticalStudy'))}, combat: {key: 'magic', icon: 'magic', name: getOfficialName('skillNames', '/skills/magic', i18n.t('magic'))}}
            ];
            const renderLevel = (level, isHouse = false) => {
                if (level == null) return '<span class="mst-progression-level mst-unavailable-level">--</span>';
                if (isHouse && level <= 0) return `<span class="mst-progression-level">${i18n.t('notBuilt')}</span>`;
                const maxClass = isHouse && level === 8 ? ' mst-house-max-level' : '';
                return `<span class="mst-progression-level${maxClass}">Lv.${Math.floor(level)}</span>`;
            };
            const getHouseLevel = hrid => {
                if (availability.house === false) return null;
                const room = houseRoomMap?.[hrid];
                return Number(typeof room === 'object' ? room?.level || 0 : room || 0);
            };
            const getCombatLevel = key => {
                if (availability.combat === false || (key !== 'combat' && availability.combatSkills === false)) return null;
                return key === 'combat'
                    ? calculateCombatLevel(characterObj)
                    : CardDataAdapter.getSkillLevel(characterObj, key);
            };
            const cells = rows.map(row => {
                const house = row.house;
                const houseCell = house.hrid ? `
                    <div class="mst-progression-row mst-house-row">
                        <div class="mst-progression-icon">${createSvgIcon(house.hrid)}</div>
                        <span class="mst-progression-name">${house.name}</span>
                        ${renderLevel(getHouseLevel(house.hrid), true)}
                    </div>` : `
                    <div class="mst-progression-row mst-house-row mst-house-summary-row" aria-label="${i18n.t('house')}">
                        <div class="mst-progression-icon">${createSvgIcon(house.icon, house.type)}</div>
                        <span class="mst-progression-name">${i18n.t('house')}</span>
                    </div>`;
                const combat = row.combat;
                const combatCell = `
                    <div class="mst-progression-row mst-combat-row">
                        <div class="mst-progression-icon">${createSvgIcon(combat.icon, combat.type || 'skills')}</div>
                        <span class="mst-progression-name">${combat.name}</span>
                        ${renderLevel(getCombatLevel(combat.key))}
                    </div>`;
                return combatCell + houseCell;
            }).join('');

            return `
                <div class="mst-progression-panel">
                    <div class="mst-panel-title">${i18n.t('combatLevelsAndHouse')}</div>
                    <div class="mst-progression-grid">
                        ${cells}
                    </div>
                </div>`;
        }

        function formatCardTime(timestamp) {
            const numericTimestamp = Number(timestamp);
            if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return i18n.t('unknown');
            const date = new Date(numericTimestamp);
            if (!Number.isFinite(date.getTime())) return i18n.t('unknown');
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        }

        function getCharacterCardContentSignature(data) {
            return JSON.stringify(data, (key, value) => key === 'dataTimestamp' ? undefined : value);
        }

        function updateCharacterCardDataTime(timestamp, modal = null) {
            const root = modal || document.querySelector('.mst-character-card-modal:not(.mst-team-card-modal)');
            const dataTime = root?.querySelector('.mst-card-data-time');
            if (dataTime) dataTime.textContent = `${i18n.t('dataTimeLabel')}${formatCardTime(timestamp)}`;
        }

        CardRenderer.character = function (data, characterName, characterNameElement = null, isMyCharacter = false, options = {}) {
            let characterObj = data.player || data;
            const availability = data.dataAvailability || {};
            const contentMode = ['combat', 'life', 'all'].includes(options.contentMode)
                ? options.contentMode
                : state.cardContentMode;
            const showCombat = contentMode !== 'life';
            const showLife = contentMode !== 'combat';
            const equipmentPanel = availability.equipment === false ? '' : generateEquipmentPanel(characterObj);
            const lifeToolsPanel = showLife && availability.equipment !== false
                ? generateLifeToolsPanel(data, characterObj)
                : '';
            const skillPanel = availability.abilities === false ? '' : generateSkillPanel(data, isMyCharacter, options);
            const equipmentSkillsPanel = equipmentPanel || skillPanel ? TemplateRenderer.html`
                <div class="mst-equipment-skills-panel">
                    <div class="mst-panel-title">${i18n.t('equipmentAndAbilities')}</div>
                    ${equipmentPanel ? TemplateRenderer.raw(equipmentPanel) : TemplateRenderer.empty}
                    ${skillPanel ? TemplateRenderer.raw(skillPanel) : TemplateRenderer.empty}
                </div>` : TemplateRenderer.empty;
            // uhtml 的同一插值位始终保持 unsafe 类型，避免切换时将 HTML 转义成文本。
            const lifeEquipmentPanel = TemplateRenderer.raw(lifeToolsPanel);
            const lifeProgressionPanel = TemplateRenderer.raw(
                showLife ? generateLifeProgressionPanel(data, characterObj, availability) : ''
            );
            const progressionPanel = !showCombat || (availability.combat === false && availability.house === false)
                ? TemplateRenderer.empty
                : TemplateRenderer.raw(generateProgressionPanel(data, characterObj, availability));

            const headerContent = generateCharacterNameHeader(data, characterName, characterNameElement);
            const buildScoreKey = registerBuildScoreSource(data);

            // 根据当前布局模式添加相应的类名
            const currentLayoutMode = options.layoutMode || getEffectiveLayoutMode();
            const layoutClass = `mst-layout-${currentLayoutMode}`;
            const cardClass = `mst-character-card ${layoutClass} mst-card-content-${contentMode}${options.teamMode ? ' mst-team-character-card' : ''}${data.limitedProfile ? ' mst-limited-profile' : ''}`;

            const cardTemplate = TemplateRenderer.html`
                <div id=${options.teamMode ? TemplateRenderer.empty : 'mst-character-card'} class=${cardClass}>
                    <div class="mst-card-header">
                        <div class="mst-card-header-identity">${TemplateRenderer.raw(headerContent)}</div>
                        <span class="mst-card-build-score" data-build-score-key=${buildScoreKey} data-score-state="pending">
                            <span class="mst-card-build-score-label">${i18n.t('buildScore')}</span>
                            <span class="mst-card-build-score-value">${i18n.t('calculating')}</span>
                        </span>
                    </div>
                    <div class="mst-card-content">
                        <div class="mst-card-main-equipment">${equipmentSkillsPanel}</div>
                        <div class="mst-card-life-equipment">${lifeEquipmentPanel}</div>
                        <div class="mst-card-life-progression">${lifeProgressionPanel}</div>
                        <div class="mst-card-main-progression">${progressionPanel}</div>
                        ${data.limitedProfile
                            ? TemplateRenderer.html`<div class="mst-limited-profile-note">${i18n.t('limitedProfileNotice')}</div>`
                            : TemplateRenderer.empty}
                    </div>
                    <div class="mst-card-timestamps">
                        <span class="mst-card-data-time">${i18n.t('dataTimeLabel')}${formatCardTime(data.dataTimestamp)}</span>
                    </div>
                </div>`;
            return options.teamMode
                ? cardTemplate
                : TemplateRenderer.html`<div class="mst-standalone-card-wrap">${cardTemplate}</div>`;
        };

        function createModalStyles() {
            StyleService.ensure('mst-character-card-style', `
                .mst-character-card-modal{box-sizing:border-box;}
                .mst-swal2-theme .swal2-popup.mst-character-card-modal{height:auto;max-height:calc(100vh - 1rem);max-height:calc(100dvh - 1rem);max-height:calc(100svh - 1rem);overflow:hidden;}
                .swal2-popup.mst-character-card-modal .swal2-html-container{white-space:normal;min-height:0;max-height:calc(100vh - 4.5rem);max-height:calc(100dvh - 4.5rem);max-height:calc(100svh - 4.5rem);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;}
                .swal2-popup.mst-character-card-modal:not(.mst-team-card-modal) .swal2-html-container{scrollbar-gutter:stable;}
                .mst-character-card-modal .mst-modal-content{background:transparent;border-radius:var(--radius-sm,0.25rem);padding:0;width:100%;max-width:100%;overflow:visible;position:relative;transition:max-width 0.3s ease;}
                /* 当强制使用桌面布局时，扩大容器尺寸 */
                .mst-character-card-modal .mst-modal-content.mst-desktop-layout{max-width:95vw;}
                /* 当强制使用桌面布局时，使用桌面端的完整尺寸 */
                .mst-character-card-modal .mst-modal-content.mst-desktop-layout .mst-character-card{max-width:none;width:${CARD_DESKTOP_WIDTH}px;}
                /* 当强制使用移动端布局时，使用移动端的紧凑尺寸 */
                .mst-character-card-modal .mst-modal-content.mst-mobile-layout .mst-character-card{max-width:none;width:${CARD_BASE_WIDTH}px;}
                .mst-character-card{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border:${CARD_BORDER_WIDTH}px solid #4a90e2;border-radius:12px;padding:${CARD_PADDING}px;color:white;font-family:'Arial',sans-serif;
                    max-width:800px;margin:0 auto;box-shadow:0 8px 23px rgba(0,0,0,0.5);box-sizing:border-box;}
                .mst-standalone-card-host{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;}
                .mst-standalone-card-wrap{position:relative;margin:0 auto;overflow:visible;}
                .mst-standalone-card-host .mst-standalone-card-wrap{width:max-content;min-width:100%;}
                .mst-standalone-card-wrap .mst-character-card{position:relative;}
                .mst-card-header{text-align:center;margin-bottom:8px;border-bottom:2px solid #4a90e2;padding:2px 2px 4px;min-height:22px;display:flex;gap:5px;align-items:center;justify-content:center;}
                .mst-card-header h2{margin:0;color:#4a90e2;font-size:18px;text-shadow:0 0 8px rgba(74,144,226,0.5);}
                .mst-card-header-identity{min-width:0;flex:1;display:flex;align-items:center;justify-content:center;}
                .mst-card-character-name{min-width:0;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0;}
                .mst-card-header .mst-card-chat-icon{width:18px!important;height:18px!important;flex:0 0 18px;display:flex;align-items:center;justify-content:center;margin-right:2px!important;}
                .mst-card-header .mst-card-name{min-width:0;margin:0;padding:1px 0 2px;font-size:14px;font-weight:bold;line-height:20px;vertical-align:middle;transform:none;}
                .mst-card-header .mst-card-name span{display:inline-flex;align-items:center;height:auto;min-height:20px;line-height:20px;font-size:inherit;font-weight:inherit;vertical-align:middle;}
                .mst-card-game-mode{font-size:9px;opacity:0.8;}
                .mst-card-build-score{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;color:orange;font-weight:bold;line-height:1.15;white-space:nowrap;cursor:help;}
                .mst-card-build-score-label{font-size:8px;font-weight:500;}
                .mst-card-build-score-value{font-size:10px;}
                .mst-card-content{display:grid;gap:${CARD_COLUMN_GAP}px;}
                .mst-character-card.mst-layout-desktop .mst-card-content{grid-template-columns:repeat(2,${CARD_CONTENT_WIDTH}px);align-items:start;}
                .mst-character-card.mst-card-content-all.mst-layout-desktop .mst-card-content{grid-template-areas:"equipment progression" "life-equipment life-progression";grid-template-rows:${CARD_MAIN_PANEL_HEIGHT}px ${CARD_LIFE_PANEL_HEIGHT}px;}
                .mst-character-card.mst-card-content-combat.mst-layout-desktop .mst-card-content{grid-template-areas:"equipment progression";grid-template-rows:${CARD_MAIN_PANEL_HEIGHT}px;}
                .mst-character-card.mst-card-content-life.mst-layout-desktop .mst-card-content{grid-template-areas:"equipment life-equipment" "equipment life-progression";grid-template-rows:repeat(2,${CARD_LIFE_PANEL_HEIGHT}px);}
                .mst-character-card.mst-layout-desktop{width:${CARD_DESKTOP_WIDTH}px;max-width:none;}
                .mst-character-card.mst-layout-mobile .mst-card-content{grid-template-columns:1fr;}
                .mst-character-card.mst-card-content-all.mst-layout-mobile .mst-card-content{grid-template-areas:"equipment" "life-equipment" "life-progression" "progression";}
                .mst-character-card.mst-card-content-life.mst-layout-mobile .mst-card-content{grid-template-areas:"equipment" "life-equipment" "life-progression";}
                .mst-character-card.mst-card-content-combat.mst-layout-mobile .mst-card-content{grid-template-areas:"equipment" "progression";}
                .mst-character-card.mst-layout-mobile{width:${CARD_BASE_WIDTH}px;max-width:none;}
                .mst-card-main-equipment,.mst-card-main-progression,.mst-card-life-equipment,.mst-card-life-progression{min-width:0;}
                .mst-card-main-equipment:empty,.mst-card-main-progression:empty,.mst-card-life-equipment:empty,.mst-card-life-progression:empty{display:none;}
                .mst-card-content-all .mst-card-main-equipment,.mst-card-content-life .mst-card-main-equipment,.mst-card-content-combat .mst-card-main-equipment{grid-area:equipment;}
                .mst-card-content-all .mst-card-main-progression,.mst-card-content-combat .mst-card-main-progression{grid-area:progression;}
                .mst-card-content-all .mst-card-life-equipment,.mst-card-content-life .mst-card-life-equipment{grid-area:life-equipment;}
                .mst-card-content-all .mst-card-life-progression,.mst-card-content-life .mst-card-life-progression{grid-area:life-progression;}
                .mst-equipment-skills-panel,.mst-progression-panel{background:rgba(255,255,255,0.1);border-radius:8px;padding:4px;border:1px solid rgba(74,144,226,0.3);box-sizing:border-box;min-width:0;width:100%;height:${CARD_MAIN_PANEL_HEIGHT}px;}
                .mst-equipment-skills-panel,.mst-progression-panel{display:flex;flex-direction:column;}
                .mst-equipment-panel,.mst-skill-panel{min-width:0;width:100%;margin:0;padding:0;background:none;border:0;}
                .mst-equipment-skills-panel>.mst-panel-title,.mst-progression-panel>.mst-panel-title{margin-bottom:5px;}
                .mst-equipment-skills-panel>.mst-skill-panel{margin-top:auto;}
                .mst-panel-title{margin:0 0 10px 0;color:#4a90e2;font-size:12px;border-bottom:1px solid rgba(74,144,226,0.3);padding-bottom:4px;text-align:center;}
                .mst-character-card.mst-limited-profile .mst-limited-profile-note{grid-column:1 / -1;color:#b7c7d9;font-size:9px;line-height:1.5;text-align:center;padding:5px 6px;}
                .mst-card-timestamps{display:flex;justify-content:flex-end;text-align:right;margin-top:9px;padding-top:6px;border-top:1px solid rgba(74,144,226,0.3);color:#b7c7d9;font-size:9px;line-height:1.4;}
                /* 只为模态框内的装备面板添加网格布局，不影响游戏原生UI */
                .mst-character-card .EquipmentPanel_playerModel__3LRB6{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(4,auto);gap:5px;padding:0 5px 5px;max-width:100%;margin:0 auto;}
                /* 确保装备槽的基本布局 */
                .mst-character-card .ItemSelector_itemSelector__2eTV6{display:flex;align-items:center;justify-content:center;}
                .mst-character-card .ItemSelector_itemSelector__2eTV6 .ItemSelector_itemContainer__3olqe,.mst-character-card .Item_itemContainer__x7kH1 .Item_item__2De2O{width:46px;height:46px;}
                .mst-character-card .Item_itemContainer__x7kH1 .Item_item__2De2O{grid-template-columns:46px;grid-template-rows:46px;}
                .mst-character-card .Item_enhancementLevel__19g-e,.mst-character-card .mst-item-level{grid-area:1/1;align-self:start;width:auto;height:auto;display:flex;color:var(--color-orange-400,orange);font-size:8px !important;line-height:1 !important;
                    text-shadow:-1px 0 var(--color-background-game,#131419),0 1px var(--color-background-game,#131419),1px 0 var(--color-background-game,#131419),0 -1px var(--color-background-game,#131419);z-index:9;}
                .mst-character-card .Item_itemContainer__x7kH1 .Item_item__2De2O .Item_enhancementLevel__19g-e{position:static;justify-self:start;margin:3px 0 0 2px;}
                .mst-character-card .mst-item-level{position:static;justify-self:end;margin:3px 2px 0 0;text-align:right;}
                .mst-character-card .script_itemLevel{display:none !important;}
                /* 技能面板样式 - 仅作用于角色名片内 */
                .mst-character-card .AbilitiesPanel_abilityGrid__-p-VF{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;padding:10px 5px 0;}
                /* 技能项容器 */
                .mst-character-card .Ability_ability__1njrh{display:flex;flex-direction:column;align-items:center;justify-content:center;width:46px;height:54px;min-height:54px;border-radius:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(74,144,226,0.3);transition:all 0.2s ease;}
                .mst-character-card .Ability_ability__1njrh.Ability_clickable__w9HcM:hover{background:rgba(74,144,226,0.1);border-color:#4a90e2;}
                /* 技能图标容器 */
                .mst-character-card .Ability_iconContainer__3syNQ{width:28px;height:28px;display:flex;align-items:center;justify-content:center;margin:0 0 3px;}
                /* 技能等级文字 */
                .mst-character-card .Ability_level__1L-do{font-size:9px;font-weight:bold;color:#fff;text-align:center;}
                .mst-life-equipment-panel,.mst-life-progression-panel{display:flex;min-width:0;width:100%;height:${CARD_LIFE_PANEL_HEIGHT}px;flex-direction:column;box-sizing:border-box;padding:4px;border:1px solid rgba(74,144,226,.3);border-radius:8px;background:rgba(255,255,255,.1);}
                .mst-life-equipment-panel>.mst-panel-title,.mst-life-progression-panel>.mst-panel-title{margin-bottom:5px;}
                .mst-life-tools-grid,.mst-life-progression-grid{display:grid;flex:1;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:5px;padding:0 5px 2px;}
                .mst-life-progression-grid{padding-right:0;padding-left:0;}
                .mst-life-tool-slot{display:flex;min-width:0;align-items:center;justify-content:center;}
                .mst-life-tool-empty-name{display:flex;width:100%;height:100%;box-sizing:border-box;align-items:center;justify-content:center;margin:0!important;padding:4px;text-align:center;font-size:8px!important;line-height:1.15!important;word-break:normal;overflow-wrap:anywhere;
                    -webkit-hyphens:auto;hyphens:auto;hyphenate-character:'-';}
                .mst-life-equipment-panel .Item_iconContainer__5z7j4{width:60%!important;height:60%!important;margin:20%!important;}
                .mst-life-progress-slot{display:grid;min-width:0;grid-template-rows:repeat(2,minmax(0,1fr));gap:2px;}
                .mst-life-level-row,.mst-life-house-row{display:grid;min-width:0;grid-template-columns:16px minmax(0,1fr);align-items:center;gap:2px;padding:1px 2px;box-sizing:border-box;border:1px solid rgba(74,144,226,.2);border-radius:3px;background:rgba(255,255,255,.045);}
                .mst-life-progress-icon,.mst-progression-icon{display:flex;aspect-ratio:1/1;align-items:center;justify-content:center;align-self:center;}
                .mst-life-progress-icon{width:16px;min-width:16px;max-width:16px;height:16px;min-height:16px;max-height:16px;}
                .mst-progression-icon{width:18px;min-width:18px;max-width:18px;height:18px;min-height:18px;max-height:18px;}
                .mst-life-progress-icon svg,.mst-progression-icon svg{display:block;width:100%!important;height:100%!important;aspect-ratio:1/1;}
                .mst-life-progress-level{display:flex;height:16px;min-width:0;align-items:center;color:#fff;font-size:8px;font-weight:bold;line-height:16px;white-space:nowrap;transform:translateY(1px);}
                /* 房屋最高等级特殊样式 */
                .mst-character-card .mst-house-max-level{color:#ff8c00 !important;font-weight:bold;text-shadow:0 0 4px rgba(255,140,0,0.5);}
                .mst-progression-grid{display:grid;flex:1;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(8,30px);align-content:space-between;gap:4.5px;}
                .mst-progression-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;min-height:30px;gap:4px;padding:3px 4px;border-radius:4px;background:rgba(255,255,255,0.045);border:1px solid rgba(74,144,226,0.2);}
                .mst-house-summary-row{grid-template-columns:18px minmax(0,1fr) auto;}
                .mst-progression-name{min-width:0;height:20px;display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;line-height:20px;}
                .mst-progression-row .mst-progression-level{height:20px;display:flex;align-items:center;font-size:9px;line-height:20px;}
                .mst-unavailable-level{color:#7d8b9a;}
                .mst-progression-level{color:#fff;font-weight:bold;}
                @media (max-width: 48rem){
                    /* 移动端布局覆盖 - 当在移动设备上且没有强制模式时 */
                    .mst-character-card:not(.mst-layout-desktop) .mst-card-content{grid-template-columns:1fr !important;gap:12px;}
                    /* 移动端指示横幅调整 */
                    .mst-instruction-banner{padding:var(--spacing-sm,0.5rem);font-size:var(--font-size-base,0.875rem);}
                }
                .mst-instruction-banner{background:var(--color-midnight-400,#323450);color:var(--color-text-dark-mode,#e7e7e7);padding:var(--spacing-sm,0.5rem);border-radius:var(--radius-sm,0.25rem);margin-bottom:var(--spacing-sm,0.5rem);font-size:var(--font-size-base,0.875rem);
                    font-weight:var(--font-weight-semibold,600);text-align:center;}
                .mst-character-card-btn{display:inline-flex;align-items:center;justify-content:center;min-width:var(--button-min-width-normal,5.25rem);height:var(--button-height-normal,1.875rem);padding:0 var(--button-padding-x-normal,0.625rem);border:0;border-radius:var(--radius-sm,0.25rem);
                    background:var(--color-primary,#4357af);color:var(--color-text-dark-mode,#e7e7e7);font:var(--font-weight-semibold,600) var(--font-size-base,0.875rem)/1 Roboto,Helvetica,Arial,sans-serif;cursor:pointer;}
                .mst-character-card-btn:hover{background:var(--color-primary-hover,#344386);}
                .mst-my-character-card-btn{display:inline-flex;align-items:center;padding:0 var(--spacing-xs,0.25rem);margin:0;border:var(--border-width-thin,1px) solid var(--color-space-400,#7184d8);border-radius:var(--radius-xs,0.125rem);background:var(--color-midnight-500,#2c2e45);
                    color:var(--color-space-100,#dde2f8);font:var(--font-weight-medium,500) var(--font-size-sm,0.8125rem)/1.2 Roboto,Helvetica,Arial,sans-serif;vertical-align:middle;white-space:nowrap;cursor:pointer;}
                .mst-my-character-card-btn:hover{border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-400,#323450);color:var(--color-text-dark-mode,#e7e7e7);}
                .mst-my-character-name-card-btn{display:inline-flex!important;box-sizing:border-box;max-width:100%;align-items:center;justify-content:flex-end;padding:0 var(--spacing-xs,0.25rem);border:var(--border-width-thin,1px) solid var(--color-space-400,#7184d8);border-radius:var(--radius-xs,0.125rem);background:rgba(44,46,69,.72);cursor:pointer;}
                .mst-my-character-name-card-btn:hover{border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-400,#323450);}
                .mst-my-character-name-card-btn:focus-visible{outline:1px solid var(--color-space-200,#bbc5f1);outline-offset:1px;}
                .mst-header-card-level-layout{display:grid!important;grid-template-columns:auto auto;align-items:center!important;justify-content:end!important;column-gap:var(--spacing-xs,0.25rem);row-gap:var(--spacing-xs,0.25rem);}
                .mst-header-card-level-layout>[class*="Header_name"]{grid-column:1/-1;justify-self:end;}
                .mst-header-card-level-layout>.mst-my-character-card-btn{grid-column:2;grid-row:2;justify-self:end;}
                .mst-header-card-level-layout>[class*="Header_totalLevel"]{grid-column:1;grid-row:2;justify-self:end;white-space:nowrap;}
                .mst-download-section{text-align:center;margin-bottom:var(--spacing-sm-plus,0.75rem);}
                /* 统一名片工具栏按钮外观 */
                .mst-download-card-btn,.mst-download-team-card-btn,.mst-copy-card-btn,.mst-copy-team-card-btn,.mst-reset-team-card-btn,.mst-reset-character-card-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:var(--button-min-width-normal,5.25rem);
                    height:var(--button-height-normal,1.875rem);background:var(--color-primary,#4357af);color:var(--color-text-dark-mode,#e7e7e7);border:none;padding:0 var(--button-padding-x-normal,0.625rem);border-radius:var(--radius-sm,0.25rem);font-family:Roboto,Helvetica,Arial,sans-serif;
                    font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-semibold,600);line-height:1;cursor:pointer;transition:background-color 0.15s ease;}
                .mst-download-card-btn:hover:not(:disabled),.mst-download-team-card-btn:hover:not(:disabled),.mst-copy-card-btn:hover:not(:disabled),.mst-copy-team-card-btn:hover:not(:disabled),.mst-reset-team-card-btn:hover:not(:disabled),.mst-reset-character-card-btn:hover:not(:disabled){
                    background:var(--color-primary-hover,#344386);}
                .mst-download-card-btn:disabled,.mst-download-team-card-btn:disabled,.mst-copy-card-btn:disabled,.mst-copy-team-card-btn:disabled,.mst-reset-team-card-btn:disabled,.mst-reset-character-card-btn:disabled{background:var(--color-disabled,#56576b);cursor:not-allowed;}
                .mst-card-layout-select{box-sizing:border-box;min-width:8.5rem;height:var(--button-height-normal,1.875rem);padding:0 1.75rem 0 .625rem;border:1px solid var(--color-space-400,#7184d8);border-radius:var(--radius-sm,.25rem);background-color:var(--color-midnight-500,#2c2e45);
                    color:var(--color-text-dark-mode,#e7e7e7);font:var(--font-weight-semibold,600) var(--font-size-base,.875rem)/1 Roboto,Helvetica,Arial,sans-serif;cursor:pointer;}
                .mst-card-layout-select:hover,.mst-card-layout-select:focus{border-color:var(--color-space-300,#98a7e9);outline:none;}
                .mst-card-layout-select option{background:var(--color-midnight-500,#2c2e45);color:var(--color-text-dark-mode,#e7e7e7);}
                .mst-card-column-toggle{display:inline-flex;height:var(--button-height-normal,1.875rem);box-sizing:border-box;align-items:center;gap:.3rem;padding:0 .5rem;border:1px solid var(--color-space-400,#7184d8);border-radius:var(--radius-sm,.25rem);
                    background:var(--color-midnight-500,#2c2e45);color:var(--color-text-dark-mode,#e7e7e7);font:var(--font-weight-semibold,600) var(--font-size-base,.875rem)/1 Roboto,Helvetica,Arial,sans-serif;cursor:pointer;}
                .mst-card-column-toggle:hover{border-color:var(--color-space-300,#98a7e9);}
                .mst-card-column-checkbox{width:1rem;height:1rem;margin:0;cursor:pointer;}
                /* 技能提示样式 */
                .mst-skill-hint{margin-top:var(--spacing-sm,0.5rem);text-align:center;}
                .mst-skill-hint span{color:var(--color-neutral-300,#bdbdbd);font-size:var(--font-size-sm,0.75rem);line-height:1.4;}
                /* 按钮行样式 */
                .mst-button-row{display:flex;gap:var(--spacing-xs,0.25rem);justify-content:center;align-items:center;margin-bottom:var(--spacing-sm,0.5rem);flex-wrap:wrap;}
                /* 仅为角色名片内的SVG图标添加优化，不影响游戏原生UI */
                .mst-character-card .Icon_icon__2LtL_{width:100%;height:100%;filter:drop-shadow(0 0 2px rgba(0,0,0,0.3));image-rendering:-webkit-optimize-contrast;image-rendering:-moz-crisp-edges;image-rendering:pixelated;}
                /* 空白技能槽样式 */
                .mst-character-card .mst-empty-skill-slot{cursor:pointer;opacity:0.3;display:flex;align-items:center;justify-content:center;}
                .mst-character-card .mst-empty-skill-slot:hover{opacity:1;border-color:#4a90e2;background:rgba(74,144,226,0.1);}
                .mst-character-card .mst-card-readonly-empty-skill-slot{cursor:default;}
                .mst-character-card .mst-card-readonly-empty-skill-slot:hover{opacity:0.3;border-color:rgba(74,144,226,0.3);background:rgba(255,255,255,0.05);}
                .mst-character-card .mst-card-empty-skill-label{color:#999;font-size:10px;line-height:1;}
                /* 技能选择器模态框样式 */
                .mst-skill-selector-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:2147482101;display:flex;justify-content:center;align-items:center;padding:var(--spacing-sm,0.5rem);box-sizing:border-box;}
                .mst-skill-selector-content{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(34rem,calc(100vw - 1rem));max-height:calc(100vh - 1rem);max-height:calc(100dvh - 1rem);max-height:calc(100svh - 1rem);background:var(--color-midnight-900,#131419);
                    border-radius:var(--radius-sm,0.25rem);padding:var(--spacing-sm,0.5rem);overflow:hidden;position:relative;border:var(--border-width-thin,1px) solid var(--color-neutral-200,#d0d0d0);box-shadow:0 0 0.25rem 0.25rem rgba(208,208,208,0.28);}
                .mst-skill-selector-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--spacing-xs,0.25rem);border-bottom:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);padding-bottom:var(--spacing-xs,0.25rem);}
                .mst-skill-selector-header h3{margin:0;color:#fff;font-size:var(--font-size-base,0.875rem);}
                .mst-close-skill-selector{background:none;border:none;font-size:1.25rem;cursor:pointer;color:#ccc;padding:0;width:1.625rem;height:1.625rem;display:flex;align-items:center;justify-content:center;}
                .mst-close-skill-selector:hover{color:#fff;background:var(--color-midnight-500,#2c2e45);}
                .mst-skill-selector-search{width:100%;height:var(--button-height-normal,1.875rem);margin:0 0 var(--spacing-xs,0.25rem);padding:0 var(--spacing-sm,0.5rem);box-sizing:border-box;border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);
                    border-radius:var(--radius-xs,0.125rem);outline:none;background:var(--color-midnight-800,#191a24);color:var(--color-text-dark-mode,#e7e7e7);font:var(--font-weight-medium,500) var(--font-size-sm,0.8125rem)/1.3 Roboto,Helvetica,Arial,sans-serif;}
                .mst-skill-selector-search:focus{border-color:var(--color-space-300,#98a7e9);box-shadow:0 0 0 1px var(--color-space-600,#4357af);}
                .mst-skill-selector-grid{display:grid;grid-template-columns:repeat(auto-fill,5.25rem);grid-auto-rows:5.25rem;align-content:start;justify-content:center;gap:var(--spacing-xs,0.25rem);padding:var(--spacing-xxs,0.125rem);overflow-y:auto;overscroll-behavior:contain;}
                .mst-skill-option{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;gap:var(--spacing-xs,0.25rem);padding:0.35rem;border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);
                    border-radius:var(--radius-xs,0.125rem);cursor:pointer;transition:background-color 120ms ease,border-color 120ms ease;background:var(--color-midnight-700,#20212e);color:var(--color-text-dark-mode,#e7e7e7);}
                .mst-skill-option:hover,.mst-skill-option.mst-skill-option-selected{border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-500,#2c2e45);}
                .mst-skill-option[hidden]{display:none !important;}
                .mst-skill-option-icon{display:flex;width:2.5rem;height:2.5rem;align-items:center;justify-content:center;flex:0 0 2.5rem;}
                .mst-skill-option-level{position:absolute;top:.25rem;left:.3rem;z-index:1;color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-small,.75rem);font-weight:600;line-height:1;text-shadow:0 1px 2px #000;}
                .mst-skill-option-name{display:-webkit-box;max-width:100%;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;color:inherit;font-size:var(--font-size-small,.75rem);font-weight:600;line-height:1.15;text-align:center;white-space:normal;}
                /* 空技能选项样式 */
                .mst-skill-option.mst-empty-skill-option{border:var(--border-width-thin,1px) dashed var(--color-space-300,#98a7e9);background:rgba(255,255,255,0.02);}
                .mst-skill-option.mst-empty-skill-option:hover{border-color:var(--color-space-300,#98a7e9);background:rgba(74,144,226,0.1);}
                .mst-empty-skill-icon{width:2.5rem;height:2.5rem;display:flex;align-items:center;justify-content:center;border:var(--border-width-thin,1px) dashed var(--color-space-300,#98a7e9);border-radius:var(--radius-xs,0.125rem);color:var(--color-space-300,#98a7e9);font-size:1rem;
                    font-weight:bold;}
                .mst-team-toolbar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:var(--spacing-xs,0.25rem);margin-bottom:var(--spacing-xs,0.25rem);}
                .mst-team-member-combobox{position:relative;width:min(11.875rem,100%);flex:0 0 min(11.875rem,100%);}
                .mst-team-member-search{width:100%;height:var(--button-height-normal,1.875rem);box-sizing:border-box;margin:0;padding:0 var(--spacing-sm,0.5rem);border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,0.25rem);outline:0;
                    background:var(--color-midnight-800,#191a24);color:var(--color-text-dark-mode,#e7e7e7);font:var(--font-weight-medium,500) var(--font-size-base,0.875rem)/1.2 Roboto,Helvetica,Arial,sans-serif;}
                .mst-team-member-search:focus{border-color:var(--color-space-300,#98a7e9);box-shadow:0 0 0 1px var(--color-space-600,#4357af);}
                .mst-team-member-search:disabled{opacity:0.6;cursor:not-allowed;}
                .mst-team-member-options{position:absolute;z-index:30;top:calc(100% + var(--spacing-xxs,0.125rem));right:0;left:0;max-height:min(16rem,40svh);overflow-y:auto;border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,0.25rem);
                    background:var(--color-midnight-800,#191a24);box-shadow:0 0.375rem 0.875rem rgba(0,0,0,0.45);}
                .mst-team-member-options[hidden]{display:none;}
                .mst-team-cache-option{display:flex;width:100%;flex-direction:column;gap:var(--spacing-xxs,0.125rem);padding:var(--spacing-sm,0.5rem);border:0;border-bottom:var(--border-width-thin,1px) solid var(--color-midnight-300,#393a5b);background:transparent;
                    color:var(--color-text-dark-mode,#e7e7e7);text-align:left;cursor:pointer;}
                .mst-team-cache-option:last-child{border-bottom:0;}
                .mst-team-cache-option:hover,.mst-team-cache-option[aria-selected="true"]{background:var(--color-midnight-500,#2c2e45);}
                .mst-team-cache-option-name,.mst-team-cache-option-meta{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .mst-team-cache-option-name{font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-semibold,600);line-height:1.2;}
                .mst-team-cache-option-meta{color:var(--color-neutral-400,#a7a7a7);font-size:var(--font-size-sm,0.75rem);line-height:1.2;}
                .mst-team-cache-empty{padding:var(--spacing-sm,0.5rem);color:var(--color-neutral-400,#a7a7a7);font-size:var(--font-size-sm,0.75rem);text-align:center;}
                .mst-skill-selector-empty{padding:var(--spacing-sm-plus,0.75rem) var(--spacing-xs,0.25rem) var(--spacing-xs,0.25rem);color:var(--color-neutral-400,#9a9a9a);font-size:var(--font-size-sm,0.75rem);text-align:center;}
                /* 移动端技能选择器调整 */
                @media (max-width: 48rem){
                    .mst-team-toolbar{width:100%;}
                    .mst-skill-selector-content{width:calc(100vw - 1rem);padding:var(--spacing-xs,0.25rem);}
                    .mst-skill-selector-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:5.25rem;gap:var(--spacing-xs,0.25rem);}
                    .mst-skill-option-icon{width:2rem;height:2rem;flex-basis:2rem;}
                    .mst-skill-option-level{font-size:var(--font-size-xs,.625rem);}
                    .mst-empty-skill-icon{width:2rem;height:2rem;font-size:var(--font-size-base,0.875rem);}
                }
            `);
        }

        // 队伍名片样式（单独注入，避免干扰已有样式）
        function createTeamStyles() {
            StyleService.ensure('mst-team-card-style', `
                .mst-team-card-modal .mst-modal-content{max-width:98vw;}
                .mst-team-cards-container{display:flex;gap:6px;flex-wrap:nowrap;align-items:flex-start;overflow-x:auto;padding-bottom:8px;justify-content:center;min-height:200px;}
                /* 当内容宽度超过容器时，切换到靠左显示以便滚动 */
                .mst-team-cards-container.mst-overflow-mode{justify-content:flex-start;}
                .mst-team-card-wrap{width:${CARD_BASE_WIDTH}px;flex:0 0 ${CARD_BASE_WIDTH}px;position:relative;}
                .mst-team-card-wrap .mst-character-card{position:relative;width:${CARD_BASE_WIDTH}px;max-width:none;}
                .mst-team-cards-container.mst-team-layout-desktop .mst-team-card-wrap{width:${CARD_DESKTOP_WIDTH}px;flex-basis:${CARD_DESKTOP_WIDTH}px;}
                .mst-team-cards-container.mst-team-layout-desktop .mst-team-card-wrap .mst-character-card{width:${CARD_DESKTOP_WIDTH}px;}
                .mst-team-mode .mst-card-header{margin-bottom:8px;}
                .mst-team-card-wrap .mst-card-header{cursor:grab;user-select:none;}
                .mst-team-card-wrap .mst-card-header:active{cursor:grabbing;}
                .mst-team-card-wrap.mst-character-card-dragging{opacity:0.55;}
                .mst-team-card-delete{position:absolute;top:4px;right:4px;z-index:20;display:flex;width:24px;height:24px;align-items:center;justify-content:center;padding:0;border:1px solid var(--color-scarlet-300,#df6971);border-radius:2px;background:var(--color-scarlet-700,#701f27);color:#fff;
                    font-size:18px;line-height:1;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 120ms ease,background-color 120ms ease;}
                .mst-team-card-wrap:hover .mst-team-card-delete,.mst-team-card-delete:focus-visible{opacity:1;pointer-events:auto;}
                .mst-team-card-delete:hover{background:var(--color-scarlet-500,#d0333d);}
                .mst-team-hint{margin:0 0 var(--spacing-sm,0.5rem);padding-top:var(--spacing-xxs,0.125rem);color:var(--color-neutral-300,#bdbdbd);font-size:var(--font-size-sm,0.75rem);line-height:1.4;text-align:center;}
                /* 轻量全局提示条 */
                .mst-character-card-toast-notice{position:fixed;top:16px;right:16px;padding:8px 12px;border-radius:4px;color:#fff;font-size:12px;z-index:20001;box-shadow:0 2px 8px rgba(0,0,0,0.2);opacity:0;transform:translateY(-6px);transition:opacity 0.2s ease,transform 0.2s ease;}
                .mst-character-card-toast-notice.mst-character-card-toast-visible{opacity:1;transform:translateY(0);}
                .mst-character-card-toast-success{background:#344386;}
                .mst-character-card-toast-error{background:#4f171f;}
                .mst-character-card-toast-info{background:#344386;}
                /* 空队伍提示样式 */
                .mst-empty-team-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;border:2px dashed #4a90e2;border-radius:15px;background:rgba(74,144,226,0.1);color:#4a90e2;text-align:center;padding:20px;margin:10px 0;}
                .mst-empty-team-placeholder .mst-empty-icon{font-size:48px;margin-bottom:15px;opacity:0.7;}
                .mst-empty-team-placeholder .mst-empty-title{font-size:18px;font-weight:bold;margin-bottom:10px;}
                .mst-empty-team-placeholder .mst-empty-subtitle{font-size:14px;opacity:0.8;}
            `);
        }

        // 动态调整队伍名片容器的居中显示
        function adjustTeamCardsLayout() {
            try {
                const container = document.querySelector('.mst-team-cards-container');
                if (!container) return;

                // 等待一个微任务，确保DOM更新完成
                setTimeout(() => {
                    const containerWidth = container.clientWidth;
                    const scrollWidth = container.scrollWidth;

                    // 如果内容宽度超过容器宽度，切换到靠左显示以便滚动
                    if (scrollWidth > containerWidth) {
                        container.classList.add('mst-overflow-mode');
                    } else {
                        container.classList.remove('mst-overflow-mode');
                    }
                }, 10);
            } catch (e) { /* ignore */ }
        }

        // 轻量提示条
        function showToastNotice(text, variant = 'success') {
            Notifier.toast(text, variant);
        }

        // 转换 WS 的 init_character_data 为名片数据
        CardDataAdapter.fromCharacterData = function (parsedData) {
            const combatLevel = parsedData.combatUnit?.combatDetails?.combatLevel;
            const equipment = (parsedData.characterItems || [])
                .filter(item => item.itemLocationHrid && item.itemLocationHrid !== '/item_locations/inventory')
                .map(item => ({
                    itemLocationHrid: item.itemLocationHrid,
                    itemHrid: item.itemHrid,
                    enhancementLevel: item.enhancementLevel || 0,
                    count: item.count || 1
                }));
            const characterSkills = (parsedData.characterSkills || []).map(skill => ({
                skillHrid: skill.skillHrid,
                level: skill.level || 0
            }));
            const abilities = (parsedData.characterAbilities || []).map(ability => ({
                abilityHrid: ability.abilityHrid,
                level: ability.level || 0,
                slotNumber: ability.slotNumber || 0
            }));
            return {
                player: {
                    name: parsedData.character?.name || parsedData.characterName || parsedData.name || i18n.t('characterFallback'),
                    specialChatIconHrid: parsedData.character?.specialChatIconHrid || '',
                    chatIconHrid: parsedData.character?.chatIconHrid || '',
                    nameColorHrid: parsedData.character?.nameColorHrid || '',
                    gameMode: parsedData.character?.gameMode || '',
                    equipment,
                    characterItems: equipment,
                    combatLevel,
                    staminaLevel: characterSkills.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                    intelligenceLevel: characterSkills.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                    attackLevel: characterSkills.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                    meleeLevel: CardDataAdapter.getSkillLevel({characterSkills}, 'melee', {allowLegacyPower: true}),
                    defenseLevel: characterSkills.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                    rangedLevel: characterSkills.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                    magicLevel: characterSkills.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                },
                abilities,
                characterSkills,
                houseRooms: parsedData.characterHouseRoomMap || {},
                characterHouseRoomMap: parsedData.characterHouseRoomMap || {},
                dataTimestamp: DataHub.characterData.updatedAt || Date.now()
            };
        };

        // 将 profile_shared 存档对象转换为名片数据
        CardDataAdapter.fromProfile = function (profileStoredObj) {
            try {
                const profile = profileStoredObj.profile;
                const characterName = profileStoredObj.characterName || profile?.sharableCharacter?.name || i18n.t('characterFallback');
                const wearableMap = profile?.wearableItemMap || {};
                const equipment = Object.values(wearableMap || {}).filter(Boolean).map(item => ({
                    itemLocationHrid: item.itemLocationHrid,
                    itemHrid: item.itemHrid,
                    enhancementLevel: item.enhancementLevel || 0,
                    count: item.count || 1
                }));
                const sharableCharacter = profile?.sharableCharacter || {};
                const characterSkills = (profile?.characterSkills || []).map(s => ({
                    skillHrid: s.skillHrid,
                    level: s.level
                }));
                const levels = {
                    staminaLevel: characterSkills.find(s => s.skillHrid.includes('/skills/stamina'))?.level || 0,
                    intelligenceLevel: characterSkills.find(s => s.skillHrid.includes('/skills/intelligence'))?.level || 0,
                    attackLevel: characterSkills.find(s => s.skillHrid.includes('/skills/attack'))?.level || 0,
                    meleeLevel: CardDataAdapter.getSkillLevel({characterSkills}, 'melee', {allowLegacyPower: true}),
                    defenseLevel: characterSkills.find(s => s.skillHrid.includes('/skills/defense'))?.level || 0,
                    rangedLevel: characterSkills.find(s => s.skillHrid.includes('/skills/ranged'))?.level || 0,
                    magicLevel: characterSkills.find(s => s.skillHrid.includes('/skills/magic'))?.level || 0
                };
                const abilities = (profile?.equippedAbilities || []).map(a => ({
                    abilityHrid: a?.abilityHrid || '',
                    level: a?.level || 1,
                    slotNumber: a?.slotNumber || 0
                }));
                const houseMapRaw = profile?.characterHouseRoomMap || {};
                const houseRooms = {};
                try { Object.values(houseMapRaw).forEach(h => { if (h?.houseRoomHrid) houseRooms[h.houseRoomHrid] = h.level || 0; }); } catch {}
                return {
                    player: {
                        name: characterName,
                        specialChatIconHrid: sharableCharacter.specialChatIconHrid || '',
                        chatIconHrid: sharableCharacter.chatIconHrid || '',
                        nameColorHrid: sharableCharacter.nameColorHrid || '',
                        gameMode: sharableCharacter.gameMode || '',
                        equipment,
                        characterItems: equipment,
                        combatLevel: profile?.combatLevel,
                        ...levels
                    },
                    abilities,
                    characterSkills,
                    houseRooms,
                    characterHouseRoomMap: houseMapRaw,
                    hideWearableItems: Boolean(profile?.hideWearableItems),
                    dataTimestamp: Number(profileStoredObj.timestamp || 0)
                };
            } catch (e) {

                console.warn('CardDataAdapter.fromProfile 失败:', e);
                return null;
            }
        };

        // 战斗消息不包含装备和房屋，只把服务器实际返回的字段用于有限资料名片。
        CardDataAdapter.fromLimitedCharacter = function (characterID) {
            const sharableCharacter = DataHub.getSharableCharacter(characterID);
            const battleUnit = DataHub.getBattleUnit(characterID);
            if (!sharableCharacter && !battleUnit) return null;
            const details = battleUnit?.combatDetails;
            const abilities = Array.isArray(battleUnit?.combatAbilities) ? battleUnit.combatAbilities : [];
            return {
                player: {
                    name: sharableCharacter?.name || battleUnit?.character?.name || battleUnit?.name || i18n.t('characterFallback'),
                    specialChatIconHrid: sharableCharacter?.specialChatIconHrid || '',
                    chatIconHrid: sharableCharacter?.chatIconHrid || '',
                    nameColorHrid: sharableCharacter?.nameColorHrid || '',
                    gameMode: sharableCharacter?.gameMode || '',
                    combatLevel: details?.combatLevel
                },
                abilities,
                characterSkills: [],
                houseRooms: {},
                characterHouseRoomMap: {},
                identityAvailable: Boolean(sharableCharacter),
                limitedProfile: true,
                dataAvailability: {
                    equipment: false,
                    combat: Boolean(details),
                    combatSkills: false,
                    abilities: Boolean(battleUnit),
                    house: false
                },
                dataTimestamp: DataHub.characterData.updatedAt || Date.now()
            };
        };

        // profile_shared 提供完整公开资料，队伍/战斗内存只补充其缺失字段。
        CardDataAdapter.mergeProfile = function (profileStoredObj) {
            const profileData = CardDataAdapter.fromProfile(profileStoredObj);
            if (!profileData) return null;
            const memoryData = CardDataAdapter.fromLimitedCharacter(profileStoredObj.characterID);
            if (!memoryData) return profileData;

            let usedMemoryData = false;
            const player = {...profileData.player};
            const memoryName = memoryData.player?.name;
            if (memoryName && memoryName !== player.name) {
                player.name = memoryName;
                usedMemoryData = true;
            }
            for (const key of ['specialChatIconHrid', 'chatIconHrid', 'nameColorHrid', 'gameMode']) {
                if (memoryData.identityAvailable && player[key] !== memoryData.player?.[key]) {
                    player[key] = memoryData.player[key];
                    usedMemoryData = true;
                }
            }
            for (const key of [
                'combatLevel', 'staminaLevel', 'intelligenceLevel', 'attackLevel',
                'defenseLevel', 'meleeLevel', 'rangedLevel', 'magicLevel'
            ]) {
                if (player[key] == null && memoryData.player?.[key] != null) {
                    player[key] = memoryData.player[key];
                    usedMemoryData = true;
                }
            }
            const abilities = profileData.abilities?.length ? profileData.abilities : memoryData.abilities;
            if (!profileData.abilities?.length && memoryData.abilities?.length) usedMemoryData = true;
            const merged = {...profileData, player, abilities};
            if (usedMemoryData && !merged.dataTimestamp) merged.dataTimestamp = Number(memoryData.dataTimestamp || 0);
            return merged;
        };

        const PARTY_BUTTONS_SELECTOR = '[class^="Party_partyButtons__"], [class*=" Party_partyButtons__"]';
        const PARTY_RIGHT_BUTTONS_SELECTOR = '[class^="Party_rightButtons__"], [class*=" Party_rightButtons__"]';
        const PARTY_NAME_SELECTOR = '[class^="Party_partyName__"], [class*=" Party_partyName__"]';

        function getTeamNameFromPage() {
            const nameEl = document.querySelector(PARTY_NAME_SELECTOR);
            return nameEl ? nameEl.textContent.trim() : i18n.t('partyFallback');
        }

        function buildCharacterCardMember(characterID) {
            const id = String(characterID);
            const wsData = DataHub.characterData.raw;
            const myId = String(wsData?.character?.id ?? '');
            if (id === myId) {
                const name = wsData?.character?.name || wsData?.characterName || i18n.t('characterFallback');
                return {characterID: id, name, data: CardDataAdapter.fromCharacterData(wsData), isSelf: true, source: 'server'};
            }

            const storedProfile = DataHub.getProfile(id);
            if (storedProfile) {
                const data = CardDataAdapter.mergeProfile(storedProfile);
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

            const limitedData = CardDataAdapter.fromLimitedCharacter(id);
            if (limitedData) {
                return {
                    characterID: id,
                    name: limitedData.player?.name || i18n.t('unknownMember'),
                    data: limitedData,
                    isSelf: false,
                    source: 'server'
                };
            }

            const name = i18n.t('unknownMember');
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

        // 构建队伍成员名片数据列表
        function buildPartyCharacterDataList() {
            const wsData = DataHub.characterData.raw;
            if (!wsData?.partyInfo) {
                console.log('[队伍名片] 未检测到 partyInfo，无法构建队伍数据');
                return [];
            }
            const slotMap = wsData.partyInfo.partySlotMap || {};
            console.log('[队伍名片] 检测到队伍成员槽位:', Object.keys(slotMap).length);
            return Object.values(slotMap)
                .filter(member => member?.characterID != null)
                .map(member => buildCharacterCardMember(member.characterID));
        }

        function saveTeamCardToStorage(teamName, members) {
            try {
                // 角色详情由 profile 缓存和内存数据提供，这里只保存队伍组成与顺序。
                const compactMembers = members.map(member => {
                    const characterID = getCachedMemberCharacterID(member);
                    if (!characterID || member?.source === 'manual') return member;
                    return {
                        characterID,
                        name: member.name || '',
                        isSelf: Boolean(member.isSelf),
                        source: member.source || 'server'
                    };
                });
                const data = {version: 2, teamName, members: compactMembers};
                localStorage.setItem(STORAGE_KEYS.TEAM_CARD, JSON.stringify(data));
                console.log('[队伍名片] 已保存队伍名片数据');
                return true;
            } catch (e) {
                console.warn('保存队伍名片失败', e);
                return false;
            }
        }

        function loadTeamCardFromStorage() {
            try {
                const str = localStorage.getItem(STORAGE_KEYS.TEAM_CARD);
                if (!str) return null;
                const obj = JSON.parse(str);
                if (!obj || !Array.isArray(obj.members)) return null;
                const members = obj.members.map(member => {
                    if (member?.source === 'manual') return member;
                    const characterID = getCachedMemberCharacterID(member);
                    return characterID ? buildCharacterCardMember(characterID) : member;
                });
                return {...obj, members};
            } catch (e) { return null; }
        }

        function getCachedMemberCharacterID(member) {
            if (member?.characterID != null) return String(member.characterID);
            if (member?.isSelf) return String(DataHub.characterData.raw?.character?.id ?? '');
            if (member?.source === 'manual') return '';
            const sharableMap = DataHub.characterData.raw?.partyInfo?.sharableCharacterMap || {};
            const matches = Object.entries(sharableMap).filter(([, character]) => character?.name === member?.name);
            return matches.length === 1 ? String(matches[0][0]) : '';
        }

        // 只更新缓存中已有的服务器成员，不增加、删除或覆盖手工导入成员。
        function refreshStoredTeamCard(characterID = '') {
            const cached = loadTeamCardFromStorage();
            if (!cached) return false;
            const targetId = characterID === '' ? '' : String(characterID);
            let changed = false;
            const members = cached.members.map(member => {
                if (member?.source === 'manual') return member;
                const memberId = getCachedMemberCharacterID(member);
                if (!memberId || (targetId && memberId !== targetId)) return member;
                const refreshed = buildCharacterCardMember(memberId);
                if (!refreshed) return member;
                const replacer = targetId ? undefined : (key, value) => key === 'dataTimestamp' ? undefined : value;
                if (JSON.stringify(member, replacer) === JSON.stringify(refreshed, replacer)) return member;
                changed = true;
                return refreshed;
            });
            if (!changed) return false;
            saveTeamCardToStorage(cached.teamName, members);
            if (Array.isArray(state.teamCard.members)) {
                state.teamCard.members = state.teamCard.members.map(member => {
                    const memberId = getCachedMemberCharacterID(member);
                    return memberId ? members.find(item => String(item.characterID) === memberId) || member : member;
                });
            }
            return true;
        }

        CardImageExporter.createTeamCanvas = async function (onProgress) {
            const wrapper = document.getElementById('mst-team-character-card');
            if (!wrapper) throw new Error(i18n.t('partyCardElementNotFound'));
            await hydrateBuildScores(wrapper);

            // 保持与预览一致的结构，直接克隆容器。
            const cloned = wrapper.cloneNode(true);
            cloned.querySelectorAll('.mst-team-card-delete').forEach(button => button.remove());
            cloned.classList.remove('mst-overflow-mode');
            Object.assign(cloned.style, {width: 'max-content', minHeight: '0', padding: '0', overflow: 'visible', justifyContent: 'flex-start', background: TEAM_CARD_EXPORT_BACKGROUND});
            await inlineSvgSprites(cloned);

            const exportHost = mountExportClone(cloned);
            try {
                await document.fonts?.ready;
                return await renderTeamCardCanvas(cloned, onProgress);
            } finally {
                exportHost.remove();
            }
        };

        // 下载队伍名片
        CardImageExporter.downloadTeam = async function () {
            const btn = document.querySelector('.mst-download-team-card-btn');
            const originalText = btn?.textContent || '';
            try {
                if (!document.getElementById('mst-team-character-card')) {
                    Notifier.alert(i18n.t('partyCardElementNotFound'));
                    return;
                }
                if (btn) { btn.textContent = i18n.t('generating'); btn.disabled = true; }
                const canvas = await CardImageExporter.createTeamCanvas((current, total) => {
                    if (btn) btn.textContent = i18n.t('generatingProgress', current, total);
                });
                try {
                    await downloadCanvas(canvas, `MWI_Party_Card_${Date.now()}`);
                } finally {
                    releaseCanvas(canvas);
                }
                console.log('队伍名片图片已生成并下载');
            } catch (error) {
                console.error('下载队伍名片失败:', error);
                Notifier.alert(i18n.t('downloadPartyCardFailed'));
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        };

        // 复制队伍名片。先发起 Clipboard API 写入，以保留按钮点击产生的用户激活状态。
        CardImageExporter.copyTeam = async function () {
            const btn = document.querySelector('.mst-copy-team-card-btn');
            const originalText = btn?.textContent || '';
            try {
                assertImageClipboardSupport();
                if (!document.getElementById('mst-team-character-card')) {
                    Notifier.alert(i18n.t('partyCardElementNotFound'));
                    return;
                }
                if (btn) { btn.textContent = i18n.t('copying'); btn.disabled = true; }
                const canvasPromise = CardImageExporter.createTeamCanvas((current, total) => {
                    if (btn) btn.textContent = i18n.t('copyingProgress', current, total);
                });
                await writeCanvasPromiseToClipboard(canvasPromise);
                showToastNotice(i18n.t('partyCardCopied'), 'success');
            } catch (error) {
                console.error('复制队伍名片失败:', error);
                Notifier.alert(`${i18n.t('copyPartyCardFailed')}\n\n${error.message || i18n.t('clipboardPermissionHint')}`);
            } finally {
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
            }
        };

        CardRenderer.team = function (members) {
            const cards = !members.length
                ? [TemplateRenderer.html`
                    <div class="mst-empty-team-placeholder">
                        <div class="mst-empty-icon">👥</div>
                        <div class="mst-empty-title">${i18n.t('emptyParty')}</div>
                        <div class="mst-empty-subtitle">${i18n.t('emptyPartyHint')}</div>
                    </div>`]
                : members.map((member, index) => {
                const name = member.name || i18n.t('characterFallback');
                const cardTemplate = CardRenderer.character(member.data, name, null, false, {
                    teamMode: true,
                    layoutMode: getEffectiveLayoutMode()
                });
                return TemplateRenderer.html`<div class="mst-team-card-wrap" data-index=${index}>
                    <button type="button" class="mst-team-card-delete" aria-label="${i18n.t('removeCharacter')}">&times;</button>
                    <div class="mst-team-mode">${cardTemplate}</div>
                </div>`;
            });
            return TemplateRenderer.html`${cards}`;
        };

        function getTeamDialogWidth(memberCount) {
            const count = Math.max(1, memberCount);
            const cardWidth = getEffectiveLayoutMode() === 'desktop' ? CARD_DESKTOP_WIDTH : CARD_BASE_WIDTH;
            const contentWidth = count * cardWidth + Math.max(0, count - 1) * 6;
            // 弹窗自身边距合计占用 36px，mst-modal-content 不再重复增加内边距。
            return `min(${contentWidth + 36}px, calc(100vw - 1rem))`;
        }

        function renderTeamCardDialog(modal) {
            const container = modal.querySelector('#mst-team-character-card');
            if (!container) return;
            TemplateRenderer.render(() => CardRenderer.team(state.teamCard.members), container);
            container.classList.toggle('mst-team-layout-desktop', getEffectiveLayoutMode() === 'desktop');
            modal.style.width = getTeamDialogWidth(state.teamCard.members.length);
            modal.style.maxWidth = 'calc(100vw - 1rem)';
            bindTeamCardInteractions(modal);
            hydrateBuildScores(modal);
            updateCardLayoutSelect(modal);
            adjustTeamCardsLayout();
        }

        // 展示队伍名片
        function showPartyCharacterCard(options = {}) {
            try {
                setCardLayout('mobile', 'combat');
                const {forceState = false} = options;
                let teamName = getTeamNameFromPage();
                console.log(`[队伍名片] 队伍名称: ${teamName}`);
                let members;
                if (forceState && state.teamCard.members !== undefined) {
                    // 强制使用内存状态，包括空数组
                    members = state.teamCard.members;
                    teamName = state.teamCard.teamName || teamName;
                } else {
                    const cached = loadTeamCardFromStorage();
                    if (cached && cached.members !== undefined) {
                        teamName = cached.teamName || teamName;
                        members = cached.members;
                        console.log('[队伍名片] 已从缓存加载队伍数据');
                    } else if (Array.isArray(state.teamCard.members) && state.teamCard.members.length > 0) {
                        members = state.teamCard.members;
                        teamName = state.teamCard.teamName || teamName;
                    } else {
                        // 最后兜底：如果没有缓存也没有内存状态，才从当前队伍构建
                        members = buildPartyCharacterDataList();
                    }
                }
                // 移除原来的空队伍检查，允许显示空队伍
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
                            ${createCardLayoutSelectTemplate()}
                            <button type="button" class="mst-reset-team-card-btn">${i18n.t('resetPartyData')}</button>
                            <button type="button" class="mst-download-team-card-btn">${i18n.t('downloadCard')}</button>
                            <button type="button" class="mst-copy-team-card-btn">${i18n.t('copyCard')}</button>
                        </div>
                        <div class="mst-team-hint">${i18n.t('latestProfileHint')}</div>
                        <div id="mst-team-character-card" class="mst-team-cards-container"></div>
                    </div>`;
                let onResize = null;
                CardDialogController.open({
                    title: i18n.t('partyCard'),
                    html: modalTemplate,
                    width: getTeamDialogWidth(state.teamCard.members.length),
                    team: true,
                    didOpen: modal => {
                        renderTeamCardDialog(modal);

                        // 监听尺寸变化，动态更新高度和布局，避免窗口尺寸变化导致空白
                        let resizeTimer;
                        onResize = () => {
                            clearTimeout(resizeTimer);
                            resizeTimer = setTimeout(() => {
                                adjustTeamCardsLayout();
                            }, 50);
                        };
                        window.addEventListener('resize', onResize);
                        adjustTeamCardsLayout();
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

        function isValidCharacterData(data) {
            if (!data || typeof data !== 'object') return false;

            // 检查新格式 (player对象)
            if (data.player && (
                data.player.equipment ||
                data.player.characterItems ||
                data.player.staminaLevel !== undefined ||
                data.player.name
            )) {
                return true;
            }

            // 检查旧格式
            if (data.character && (data.characterSkills || data.characterItems)) {
                return true;
            }

            // 检查是否直接包含关键字段
            if (data.equipment || data.characterItems || data.characterSkills) {
                return true;
            }

            // 检查是否包含技能等级字段
            if (data.staminaLevel !== undefined || data.intelligenceLevel !== undefined ||
                data.attackLevel !== undefined || data.meleeLevel !== undefined || data.powerLevel !== undefined) {
                return true;
            }

            // 检查是否包含房屋数据
            if (data.houseRooms || data.characterHouseRoomMap) {
                return true;
            }

            // 检查是否包含能力数据
            if (data.abilities && Array.isArray(data.abilities)) {
                return true;
            }

            return false;
        }

        const spriteTextCache = new Map();
        const spriteSymbolCache = new Map();

        function loadSpriteText(spriteUrl) {
            const absoluteUrl = new URL(spriteUrl, location.href).href;
            if (spriteTextCache.has(absoluteUrl)) return spriteTextCache.get(absoluteUrl);
            const promise = fetch(absoluteUrl)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.text();
                })
                .catch(error => {
                    spriteTextCache.delete(absoluteUrl);
                    throw error;
                });
            spriteTextCache.set(absoluteUrl, promise);
            return promise;
        }

        async function loadSpriteSymbol(spriteUrl, symbolId) {
            const absoluteUrl = new URL(spriteUrl, location.href).href;
            const cacheKey = `${absoluteUrl}#${symbolId}`;
            if (spriteSymbolCache.has(cacheKey)) return spriteSymbolCache.get(cacheKey);
            const promise = loadSpriteText(absoluteUrl).then(svgText => {
                // Sprite 文件可达数 MB，只截取目标 symbol 后再解析，避免构建整份 SVG DOM。
                let idIndex = svgText.indexOf(`id="${symbolId}"`);
                if (idIndex < 0) idIndex = svgText.indexOf(`id='${symbolId}'`);
                if (idIndex < 0) return null;
                const start = svgText.lastIndexOf('<symbol', idIndex);
                const end = svgText.indexOf('</symbol>', idIndex);
                if (start < 0 || end < 0) return null;
                const symbolText = svgText.slice(start, end + '</symbol>'.length);
                const symbol = new DOMParser().parseFromString(symbolText, 'image/svg+xml').documentElement;
                return symbol?.localName === 'symbol' ? symbol : null;
            }).catch(error => {
                spriteSymbolCache.delete(cacheKey);
                console.warn('[MST] 无法加载名片 SVG symbol:', cacheKey, error);
                return null;
            });
            spriteSymbolCache.set(cacheKey, promise);
            return promise;
        }

        async function inlineSvgSprites(root) {
            state.svgTool.refreshSpritePathsFromDOM();
            const entries = [...root.querySelectorAll('svg use')].map(useElement => {
                const href = useElement.getAttribute('href') || useElement.getAttribute('xlink:href') || '';
                const separator = href.lastIndexOf('#');
                return {
                    useElement,
                    spriteUrl: separator > 0 ? href.slice(0, separator) : '',
                    symbolId: separator > 0 ? href.slice(separator + 1) : ''
                };
            }).filter(entry => entry.spriteUrl && entry.symbolId);
            const symbolKeys = [...new Set(entries.map(entry => `${entry.spriteUrl}#${entry.symbolId}`))];
            const symbols = new Map(await Promise.all(symbolKeys.map(async key => {
                const separator = key.lastIndexOf('#');
                const spriteUrl = key.slice(0, separator);
                const symbolId = key.slice(separator + 1);
                return [key, await loadSpriteSymbol(spriteUrl, symbolId)];
            })));

            entries.forEach(({useElement, spriteUrl, symbolId}) => {
                try {
                    const svg = useElement.closest('svg');
                    const symbol = symbols.get(`${spriteUrl}#${symbolId}`);
                    if (!svg || !symbol) return;
                    const symbolClone = symbol.cloneNode(true);
                    svg.replaceChildren(...Array.from(symbolClone.childNodes));
                    const viewBox = symbol.getAttribute('viewBox');
                    if (viewBox) svg.setAttribute('viewBox', viewBox);
                    const fill = symbol.getAttribute('fill');
                    if (fill) svg.setAttribute('fill', fill);
                } catch (error) {
                    console.warn('[MST] 内联名片 SVG 失败:', error);
                }
            });
        }

        function mountExportClone(clone) {
            const host = document.createElement('div');
            // 导出克隆无需点击态，移除后也可避免第三方脚本扫描已内联的 SVG。
            clone.querySelectorAll('[class*="Item_clickable__"]').forEach(element => {
                [...element.classList]
                    .filter(className => className.startsWith('Item_clickable__'))
                    .forEach(className => element.classList.remove(className));
            });
            Object.assign(host.style, {position: 'fixed', left: '-10000px', top: '0', width: 'max-content', margin: '0', padding: '0', pointerEvents: 'none'});
            clone.style.margin = '0';
            host.appendChild(clone);
            document.body.appendChild(host);
            return host;
        }

        function canvasToPngBlob(canvas) {
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        function releaseCanvas(canvas) {
            if (!canvas) return;
            canvas.width = 0;
            canvas.height = 0;
        }

        function assertImageClipboardSupport() {
            if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
                throw new Error(i18n.t('imageClipboardUnavailable'));
            }
        }

        function writeCanvasPromiseToClipboard(canvasPromise) {
            const blobPromise = Promise.resolve(canvasPromise).then(async canvas => {
                try {
                    const blob = await canvasToPngBlob(canvas);
                    if (!blob) throw new Error(i18n.t('imageEncodeFailed'));
                    return blob;
                } finally {
                    releaseCanvas(canvas);
                }
            });
            return navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]);
        }

        function renderCardCanvas(element, backgroundColor = null) {
            if (typeof htmlToImage === 'undefined') {
                return Promise.reject(new Error(i18n.t('imageRendererUnavailable')));
            }
            const width = Math.ceil(element.getBoundingClientRect().width || element.scrollWidth || element.offsetWidth);
            const height = Math.ceil(element.getBoundingClientRect().height || element.scrollHeight || element.offsetHeight);
            const options = {
                width,
                height,
                pixelRatio: CARD_EXPORT_SCALE,
                cacheBust: false,
                skipFonts: true,
                includeStyleProperties: CARD_EXPORT_STYLE_PROPERTIES
            };
            if (backgroundColor) options.backgroundColor = backgroundColor;
            return htmlToImage.toCanvas(element, options);
        }

        function yieldForCardExport() {
            return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        }

        async function renderTeamCardCanvas(container, onProgress) {
            const cardWraps = [...container.querySelectorAll('.mst-team-card-wrap')];
            if (!cardWraps.length) return renderCardCanvas(container, TEAM_CARD_EXPORT_BACKGROUND);

            const containerRect = container.getBoundingClientRect();
            const width = Math.ceil(containerRect.width || container.scrollWidth || container.offsetWidth);
            const height = Math.ceil(containerRect.height || container.scrollHeight || container.offsetHeight);
            const canvas = document.createElement('canvas');
            canvas.width = width * CARD_EXPORT_SCALE;
            canvas.height = height * CARD_EXPORT_SCALE;
            const context = canvas.getContext('2d');
            if (!context) throw new Error(i18n.t('cardCanvasUnavailable'));
            context.fillStyle = TEAM_CARD_EXPORT_BACKGROUND;
            context.fillRect(0, 0, canvas.width, canvas.height);

            try {
                for (let index = 0; index < cardWraps.length; index++) {
                    onProgress?.(index + 1, cardWraps.length);
                    await yieldForCardExport();
                    const cardWrap = cardWraps[index];
                    const cardRect = cardWrap.getBoundingClientRect();
                    const cardCanvas = await renderCardCanvas(cardWrap);
                    context.drawImage(
                        cardCanvas,
                        Math.round((cardRect.left - containerRect.left) * CARD_EXPORT_SCALE),
                        Math.round((cardRect.top - containerRect.top) * CARD_EXPORT_SCALE)
                    );
                    cardCanvas.width = 0;
                    cardCanvas.height = 0;
                }
                return canvas;
            } catch (error) {
                canvas.width = 0;
                canvas.height = 0;
                throw error;
            }
        }

        async function downloadCanvas(canvas, fileName) {
            const blob = await canvasToPngBlob(canvas);
            if (!blob) throw new Error(i18n.t('imageEncodeFailed'));
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.download = `${fileName}.png`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        CardImageExporter.createCharacterCanvas = async function () {
            const cardElement = getStandaloneCharacterCard();
            if (!cardElement) throw new Error(i18n.t('characterCardElementNotFound'));
            await hydrateBuildScores(cardElement);

            const clonedCard = cardElement.cloneNode(true);
            await inlineSvgSprites(clonedCard);
            const exportHost = mountExportClone(clonedCard);
            try {
                await document.fonts?.ready;
                return await renderCardCanvas(clonedCard);
            } finally {
                exportHost.remove();
            }
        };

        // 下载名片功能
        CardImageExporter.downloadCharacter = async function () {
            const downloadBtn = document.querySelector('.mst-download-card-btn');
            const originalText = downloadBtn?.textContent || '';
            try {
                if (!getStandaloneCharacterCard()) {
                    Notifier.alert(i18n.t('characterCardElementNotFound'));
                    return;
                }

                if (downloadBtn) { downloadBtn.textContent = i18n.t('generating'); downloadBtn.disabled = true; }
                const canvas = await CardImageExporter.createCharacterCanvas();
                try {
                    await downloadCanvas(canvas, `MWI_Character_Card_${Date.now()}`);
                } finally {
                    releaseCanvas(canvas);
                }
                console.log('名片图片已生成并下载');
            } catch (error) {
                console.error('下载名片失败:', error);
                Notifier.alert(`${i18n.t('downloadCharacterCardFailed')}\n\n${error.message || ''}`.trim());
            } finally {
                if (downloadBtn) { downloadBtn.textContent = originalText; downloadBtn.disabled = false; }
            }
        };

        // 复制单人名片。ClipboardItem 接收异步 Blob，避免生成图片时丢失用户激活状态。
        CardImageExporter.copyCharacter = async function () {
            const copyBtn = document.querySelector('.mst-copy-card-btn');
            const originalText = copyBtn?.textContent || '';
            try {
                assertImageClipboardSupport();
                if (!getStandaloneCharacterCard()) {
                    Notifier.alert(i18n.t('characterCardElementNotFound'));
                    return;
                }
                if (copyBtn) { copyBtn.textContent = i18n.t('copying'); copyBtn.disabled = true; }
                await writeCanvasPromiseToClipboard(CardImageExporter.createCharacterCanvas());
                showToastNotice(i18n.t('characterCardCopied'), 'success');
            } catch (error) {
                console.error('复制名片失败:', error);
                Notifier.alert(`${i18n.t('copyCharacterCardFailed')}\n\n${error.message || i18n.t('clipboardPermissionHint')}`);
            } finally {
                if (copyBtn) { copyBtn.textContent = originalText; copyBtn.disabled = false; }
            }
        };

        // 使用已捕获的 profile_shared 数据生成其他角色名片。
        async function showCharacterCard() {
            try {
                let characterData = null;
                const visibleNames = GameUiAdapter.queryAll('characterName');
                const visibleProfileName = visibleNames.length
                    ? visibleNames[visibleNames.length - 1].querySelector('[class*="CharacterName_name"]')?.textContent?.trim()
                    : '';
                const storedProfile = visibleProfileName
                    ? DataHub.findProfileByName(visibleProfileName)
                    : null;
                if (storedProfile) {
                    characterData = CardDataAdapter.mergeProfile(storedProfile);
                }

                if (!characterData) {
                    Notifier.alert(i18n.t('profileDataUnavailable'));
                    return;
                }

                const characterName = characterData.player?.name || characterData.character?.name || i18n.t('characterFallback');

                // 查找页面中的角色信息元素 - 获取最后一个（用于查看其他角色）
                let characterNameElement = null;
                const characterNameDivs = GameUiAdapter.queryAll('characterName');
                if (characterNameDivs.length > 0) {
                    // 取最后一个元素（用于查看其他角色）
                    const lastCharacterNameDiv = characterNameDivs[characterNameDivs.length - 1];
                    characterNameElement = lastCharacterNameDiv.outerHTML;
                }

                setCardLayout('desktop', 'all');
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
                CardDialogController.open({
                    title: i18n.t('characterCard'),
                    html: modalTemplate,
                    didOpen: modal => {
                        bindStandaloneCharacterCardControls(modal);
                        refreshCharacterCard(modal);
                        updateModalLayoutClass();
                    }
                });

            } catch (error) {
                console.error('生成角色名片失败:', error);
                Notifier.alert(i18n.t('generateCharacterCardFailed', error.message));
            }
        }

        // 使用WebSocket数据生成名片（用于查看当前角色）
        async function showMyCharacterCard() {
            try {
                state.customSkills.selectedSkills = [];

                let characterData = null;

                // 检查是否有WebSocket数据
                if (!DataHub.characterData.raw) {
                    Notifier.alert(i18n.t('noCurrentCharacterData'));
                    return;
                }

                const parsedData = DataHub.characterData.raw;

                if (parsedData && parsedData.type === "init_character_data") {
                    characterData = CardDataAdapter.fromCharacterData(parsedData);
                } else {
                    Notifier.alert(i18n.t('invalidWebSocketData'));
                    return;
                }

                if (!isValidCharacterData(characterData)) {
                    Notifier.alert(i18n.t('invalidCharacterData'));
                    return;
                }

                const characterName = characterData.player?.name || characterData.character?.name || i18n.t('characterFallback');

                // 查找页面中的角色信息元素 - 获取第一个（右上角的当前用户）
                let characterNameElement = null;
                const characterNameDivs = GameUiAdapter.queryAll('characterName');
                if (characterNameDivs.length > 0) {
                    // 取第一个元素（右上角的当前用户）
                    const firstCharacterNameDiv = characterNameDivs[0];
                    characterNameElement = firstCharacterNameDiv.outerHTML;
                }

                setCardLayout('desktop', 'all');
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
                CardDialogController.open({
                    title: i18n.t('characterCard'),
                    html: modalTemplate,
                    didOpen: modal => {
                        bindStandaloneCharacterCardControls(modal);
                        refreshCharacterCard(modal);
                        updateModalLayoutClass();
                    }
                });

            } catch (error) {
                console.error('生成我的角色名片失败:', error);
                Notifier.alert(i18n.t('generateMyCharacterCardFailed', error.message));
            }
        }

        CardDataAdapter.fromLoadout = function (loadout) {
            const raw = DataHub.characterData.raw;
            if (!raw || !loadout) return null;
            const data = CardDataAdapter.fromCharacterData(raw);
            const currentTools = (data.player.equipment || []).filter(item =>
                String(item.itemLocationHrid || '').endsWith('_tool')
            );
            const itemByHash = new Map((raw.characterItems || []).map(item => [item?.hash, item]));
            const equipment = Object.entries(loadout.wearableMap || {}).flatMap(([itemLocationHrid, hash]) => {
                if (!hash) return [];
                const item = itemByHash.get(hash);
                if (item) {
                    return [{
                        itemLocationHrid,
                        itemHrid: item.itemHrid,
                        enhancementLevel: item.enhancementLevel || 0
                    }];
                }
                const parts = String(hash).split('::');
                const itemHrid = parts.find(part => part.startsWith('/items/')) || '';
                if (!itemHrid) return [];
                return [{itemLocationHrid, itemHrid, enhancementLevel: Number(parts[parts.length - 1] || 0)}];
            });
            const loadoutLocations = new Set(equipment.map(item => item.itemLocationHrid));
            currentTools.forEach(item => {
                if (!loadoutLocations.has(item.itemLocationHrid)) equipment.push(item);
            });
            const abilityByHrid = new Map((raw.characterAbilities || []).map(ability => [ability?.abilityHrid, ability]));
            const abilities = Object.entries(loadout.abilityMap || {})
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .flatMap(([slotNumber, abilityHrid]) => {
                    if (!abilityHrid) return [];
                    const ability = abilityByHrid.get(abilityHrid);
                    return [{abilityHrid, level: ability?.level || 1, slotNumber: Number(slotNumber)}];
                });
            data.player.equipment = equipment;
            data.player.characterItems = equipment;
            // 战斗配装使用配装中的技能；生活配装没有技能配置，保留角色当前已配置技能。
            if (loadout.actionTypeHrid === '/action_types/combat') data.abilities = abilities;
            data.dataTimestamp = DataHub.characterData.updatedAt || Date.now();
            return data;
        };

        function showLoadoutCharacterCard(event) {
            const loadout = event?.detail?.loadout;
            const characterData = CardDataAdapter.fromLoadout(loadout);
            if (!characterData) {
                Notifier.toast(i18n.t('loadoutNotFound'), 'error');
                return;
            }
            const characterName = characterData.player?.name || getCurrentCharacterName();
            const characterNameElement = GameUiAdapter.query('characterName')?.outerHTML || null;
            const isCombatLoadout = loadout.actionTypeHrid === '/action_types/combat';
            setCardLayout('desktop', isCombatLoadout ? 'combat' : 'life');
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
                    <div class="mst-instruction-banner">${getLoadoutBannerText(loadout)}</div>
                    <div class="mst-download-section">
                        <div class="mst-button-row">
                            ${createCardLayoutSelectTemplate()}
                            <button type="button" class="mst-download-card-btn">${i18n.t('downloadCard')}</button>
                            <button type="button" class="mst-copy-card-btn">${i18n.t('copyCard')}</button>
                        </div>
                    </div>
                    <div class="mst-standalone-card-host"></div>
                </div>`;
            CardDialogController.open({
                title: i18n.t('loadoutCharacterCard'),
                html: modalTemplate,
                didOpen: modal => {
                    modal.querySelector('.mst-download-card-btn').onclick = CardImageExporter.downloadCharacter;
                    modal.querySelector('.mst-copy-card-btn').onclick = CardImageExporter.copyCharacter;
                    bindCardLayoutSelect(modal);
                    refreshCharacterCard(modal);
                    updateCardLayoutSelect(modal);
                    updateModalLayoutClass(modal);
                }
            });
        }

        function addCharacterCardButton() {
            const selectedElement = document.querySelector('[class*="SharableProfile_overviewTab"]');
            if (!selectedElement) return false;

            let buttonContainer = Array.from(selectedElement.children).find(element =>
                element.classList.contains('mst-character-card-button-container')
            );
            let changed = false;

            if (!buttonContainer) {
                const button = document.createElement('button');
                button.className = 'mst-character-card-btn';
                button.type = 'button';
                button.textContent = i18n.t('viewCharacterCard');
                button.onclick = () => {
                    showCharacterCard();
                    return false;
                };

                buttonContainer = document.createElement('div');
                buttonContainer.className = 'mst-character-card-button-container';
                buttonContainer.style.textAlign = 'center';
                buttonContainer.appendChild(button);
                changed = true;
            }

            // 固定在游戏原生资料统计区之后，确保位于其他插件追加内容之前。
            const statsSection = Array.from(selectedElement.children).find(element =>
                Array.from(element.classList).some(className => className.startsWith('SharableProfile_statsSection'))
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

        // 在右上角角色信息区域添加"我的角色名片"按钮
        function addMyCharacterCardButton() {
            const characterInfoElements = GameUiAdapter.queryAll('headerCharacterInfo');
            const headerInfoElement = Array.from(characterInfoElements).map(characterInfo =>
                Array.from(characterInfo.children).find(child =>
                    Array.from(child.children || []).some(element =>
                        Array.from(element.classList).some(className => className.startsWith('Header_totalLevel'))
                    )
                )
            ).find(Boolean);
            const totalLevelElement = Array.from(headerInfoElement?.children || []).find(element =>
                Array.from(element.classList).some(className => className.startsWith('Header_totalLevel'))
            );
            if (!headerInfoElement || !totalLevelElement) return false;
            headerInfoElement.classList.add('mst-header-card-level-layout');
            const nameElement = Array.from(headerInfoElement.children || []).find(element =>
                Array.from(element.classList).some(className => className.startsWith('Header_name'))
            );
            if (nameElement) {
                nameElement.classList.add('mst-my-character-name-card-btn');
                nameElement.setAttribute('role', 'button');
                nameElement.tabIndex = 0;
                nameElement.title = i18n.t('userCharacterCard');
                if (!nameElement.dataset.mstCharacterCardBound) {
                    nameElement.dataset.mstCharacterCardBound = '1';
                    nameElement.addEventListener('click', event => {
                        event.preventDefault();
                        event.stopPropagation();
                        showMyCharacterCard();
                    });
                    nameElement.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        event.stopPropagation();
                        showMyCharacterCard();
                    });
                }
            }

            const existingButton = headerInfoElement.querySelector('.mst-my-character-card-btn');
            if (existingButton) {
                existingButton.textContent = i18n.t('toolkitShort');
                existingButton.title = i18n.t('toolkitTitle');
                existingButton.onclick = event => {
                    event.preventDefault();
                    event.stopPropagation();
                    window.dispatchEvent(new CustomEvent('mst:toolkit:open', {detail: {trigger: existingButton}}));
                    return false;
                };
                if (existingButton.nextElementSibling !== totalLevelElement) {
                    headerInfoElement.insertBefore(existingButton, totalLevelElement);
                }
                return false;
            }

            const myButton = document.createElement('button');
            myButton.className = 'mst-my-character-card-btn';
            myButton.type = 'button';
            myButton.textContent = i18n.t('toolkitShort');
            myButton.title = i18n.t('toolkitTitle');
            myButton.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('mst:toolkit:open', {detail: {trigger: myButton}}));
                return false;
            };
            headerInfoElement.insertBefore(myButton, totalLevelElement);
            return true;
        }

        // 在队伍信息区域添加“查看队伍名片”按钮
        function addPartyCardButton() {
            const checkParty = () => {
                const buttonsElement = document.querySelector(PARTY_BUTTONS_SELECTOR);
                const rightButtonsElement = buttonsElement?.querySelector(PARTY_RIGHT_BUTTONS_SELECTOR);
                if (!rightButtonsElement || rightButtonsElement.querySelector('.mst-party-card-btn')) return;
                const leaveButton = rightButtonsElement.querySelector('button');

                const btn = document.createElement('button');
                const gameButtonClass = [...(leaveButton?.classList || [])].find(className => className.startsWith('Button_button__')) || '';
                btn.className = [gameButtonClass, 'mst-party-card-btn'].filter(Boolean).join(' ');
                btn.type = 'button';
                btn.textContent = i18n.t('partyCard');
                btn.onclick = () => { showPartyCharacterCard(); return false; };

                rightButtonsElement.insertBefore(btn, leaveButton || null);
                console.log('队伍名片按钮已添加');
            };
            // 队伍面板会被 React 整体替换，复用公共观察器并纳入模块清理。
            state.partyObserver?.disconnect();
            state.partyObserver = utils.observeBody(checkParty);
        }

        async function init() {
            createModalStyles();
            createTeamStyles();
            await state.svgTool.loadSpriteSheets();

            addCharacterCardButton();
            addMyCharacterCardButton();
            addPartyCardButton();
            state.loadoutCardHandler = showLoadoutCharacterCard;
            window.addEventListener('mst:card:loadout-request', state.loadoutCardHandler);

            const scheduleTeamCardRefresh = characterID => {
                clearTimeout(state.teamCard.refreshTimer);
                state.teamCard.refreshTimer = setTimeout(() => refreshStoredTeamCard(characterID), 300);
            };
            window.addEventListener('mst:data:profile-shared', event => {
                scheduleTeamCardRefresh(event.detail?.characterID);
                const activeCard = state.activeCard;
                if (activeCard?.characterID && String(event.detail?.characterID) === activeCard.characterID) {
                    activeCard.data = CardDataAdapter.mergeProfile(event.detail);
                    if (getStandaloneCharacterCard()) refreshCharacterCard();
                }
            });
            window.addEventListener('mst:data:character-updated', event => {
                const cardFields = new Set([
                    '*', 'character', 'characterSkills', 'characterAbilities', 'characterItems',
                    'characterHouseRoomMap', 'combatUnit', 'partyInfo', 'battleUnits'
                ]);
                if ((event.detail?.fields || []).some(field => cardFields.has(field))) {
                    scheduleTeamCardRefresh();
                    const activeCard = state.activeCard;
                    const previousSignature = activeCard ? getCharacterCardContentSignature(activeCard.data) : '';
                    let nextData = activeCard?.data;
                    if (activeCard?.isMyCharacter) {
                        nextData = CardDataAdapter.fromCharacterData(DataHub.characterData.raw);
                    } else if (activeCard?.options?.loadoutCard) {
                        nextData = CardDataAdapter.fromLoadout(activeCard.options.loadout);
                    } else if (activeCard?.characterID) {
                        const profile = DataHub.getProfile(activeCard.characterID);
                        if (profile) nextData = CardDataAdapter.mergeProfile(profile);
                    }
                    if (activeCard && nextData) {
                        activeCard.data = nextData;
                        if (getStandaloneCharacterCard()) {
                            const nextSignature = getCharacterCardContentSignature(nextData);
                            if (previousSignature !== nextSignature) refreshCharacterCard();
                            else updateCharacterCardDataTime(nextData.dataTimestamp);
                        }
                    }
                }
            });
            refreshStoredTeamCard();

            // React 会替换资料与页头节点，入口检查统一交给按帧合并的全局观察器。
            const scheduleCharacterCardButton = () => {
                if (state.timer) return;
                state.timer = setTimeout(() => {
                    state.timer = null;
                    addCharacterCardButton();
                }, 50);
            };
            state.observer?.disconnect();
            state.observer = utils.observeBody(() => {
                scheduleCharacterCardButton();
                addMyCharacterCardButton();
            });
        }

        // 清理函数
        function cleanup() {

            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            if (state.partyObserver) {
                state.partyObserver.disconnect();
                state.partyObserver = null;
            }
            if (state.timer) {
                clearTimeout(state.timer);
                state.timer = null;
            }
            if (state.loadoutCardHandler) {
                window.removeEventListener('mst:card:loadout-request', state.loadoutCardHandler);
                state.loadoutCardHandler = null;
            }
        }

        function refreshCardLayoutLanguage(modal) {
            const columnLabel = modal.querySelector('.mst-card-column-toggle span');
            if (columnLabel) columnLabel.textContent = i18n.t('twoColumns');
            const select = modal.querySelector('.mst-card-layout-select');
            if (!select) return;
            select.setAttribute('aria-label', i18n.t('cardLayout'));
            const labels = {
                combat: i18n.t('combatLayout'),
                life: i18n.t('skillingLayout'),
                all: i18n.t('allCardContent')
            };
            Array.from(select.options).forEach(option => {
                if (labels[option.value]) option.textContent = labels[option.value];
            });
        }

        function refreshSkillSelectorLanguage() {
            const modal = document.querySelector('.mst-skill-selector-modal');
            if (!modal) return;
            const heading = modal.querySelector('.mst-skill-selector-header h3');
            if (heading) heading.textContent = i18n.t('selectCardAbility');
            const closeButton = modal.querySelector('.mst-close-skill-selector');
            if (closeButton) closeButton.title = i18n.t('close');
            const search = modal.querySelector('.mst-skill-selector-search');
            if (search) {
                search.placeholder = i18n.t('searchCardAbilityNames');
                search.setAttribute('aria-label', i18n.t('searchAbilities'));
            }
            const emptyOption = modal.querySelector('.mst-empty-skill-option');
            if (emptyOption) {
                emptyOption.title = i18n.t('clearAbilitySlot');
                const name = emptyOption.querySelector('.mst-skill-option-name');
                if (name) name.textContent = i18n.t('emptySlot');
            }
            const emptyState = modal.querySelector('.mst-skill-selector-empty');
            if (emptyState) emptyState.textContent = i18n.t('noMatchingAbilities');
            modal.querySelectorAll('.mst-skill-option[data-ability-hrid]:not(.mst-empty-skill-option)').forEach(option => {
                const abilityHrid = option.dataset.abilityHrid;
                if (!abilityHrid) return;
                const names = getAbilityDisplayNames(abilityHrid);
                const displayName = i18n.pick(names);
                const title = names.zh === names.en ? names.zh : `${names.zh} / ${names.en}`;
                const name = option.querySelector('.mst-skill-option-name');
                if (name) name.textContent = displayName;
                option.title = title;
                option.setAttribute('aria-label', title);
            });
        }

        function refreshOpenCardLanguage() {
            const modal = document.querySelector('.mst-character-card-modal');
            if (!modal) {
                refreshSkillSelectorLanguage();
                return;
            }
            const title = modal.querySelector('.swal2-title');
            refreshCardLayoutLanguage(modal);

            if (modal.classList.contains('mst-team-card-modal')) {
                if (title) title.textContent = i18n.t('partyCard');
                const input = modal.querySelector('.mst-team-member-search');
                if (input) input.placeholder = i18n.t('searchCachedCharacters');
                const reset = modal.querySelector('.mst-reset-team-card-btn');
                if (reset) reset.textContent = i18n.t('resetPartyData');
                const download = modal.querySelector('.mst-download-team-card-btn');
                if (download) download.textContent = i18n.t('downloadCard');
                const copy = modal.querySelector('.mst-copy-team-card-btn');
                if (copy) copy.textContent = i18n.t('copyCard');
                const hint = modal.querySelector('.mst-team-hint');
                if (hint) hint.textContent = i18n.t('latestProfileHint');
                renderTeamCardDialog(modal);
            } else {
                const loadout = state.activeCard?.options?.loadoutCard
                    ? state.activeCard.options.loadout
                    : null;
                if (title) title.textContent = i18n.t(loadout ? 'loadoutCharacterCard' : 'characterCard');
                const input = modal.querySelector('.mst-character-member-search');
                if (input) input.placeholder = i18n.t('searchCachedCharacters');
                const reset = modal.querySelector('.mst-reset-character-card-btn');
                if (reset) reset.textContent = i18n.t('resetCharacterData');
                const download = modal.querySelector('.mst-download-card-btn');
                if (download) download.textContent = i18n.t('downloadCard');
                const copy = modal.querySelector('.mst-copy-card-btn');
                if (copy) copy.textContent = i18n.t('copyCard');
                const skillHint = modal.querySelector('.mst-skill-hint span');
                if (skillHint) skillHint.textContent = i18n.t('editAbilityHint');
                const banner = modal.querySelector('.mst-instruction-banner');
                if (banner && loadout) {
                    banner.textContent = getLoadoutBannerText(loadout);
                }
                refreshCharacterCard(modal);
                if (!loadout) refreshCharacterCardPicker(modal);
            }
            refreshSkillSelectorLanguage();
        }

        function setLanguage() {
            document.querySelectorAll('.mst-character-card-btn').forEach(button => {
                button.textContent = i18n.t('viewCharacterCard');
            });
            document.querySelectorAll('.mst-my-character-card-btn').forEach(button => {
                button.textContent = i18n.t('toolkitShort');
                button.title = i18n.t('toolkitTitle');
            });
            document.querySelectorAll('.mst-my-character-name-card-btn').forEach(element => {
                element.title = i18n.t('userCharacterCard');
            });
            document.querySelectorAll('.mst-party-card-btn').forEach(button => {
                button.textContent = i18n.t('partyCard');
            });
            refreshOpenCardLanguage();
        }

        return {init, cleanup, setLanguage, showMyCharacterCard};

    })();

    class CharacterCardFeature {
        showMyCharacterCard() {
            return OriginalCharacterCardFeature.showMyCharacterCard();
        }

        init() {
            if (!CONFIG.isGameSite) return;
            const start = () => OriginalCharacterCardFeature.init();
            if (document.body) start();
            else document.addEventListener('DOMContentLoaded', start, {once: true});
            LanguageEvents.subscribe(() => OriginalCharacterCardFeature.setLanguage());
            window.addEventListener('unload', OriginalCharacterCardFeature.cleanup, {once: true});
        }
    }

    // 参照 SweetAlert2 官方 theme 结构，并复用游戏原生设计变量。
    const MST_SWAL_THEME_CSS = `
        .mst-swal2-theme{--swal2-backdrop:var(--color-midnight-800-opacity-80,rgba(25,26,36,0.8));--swal2-container-padding:var(--spacing-sm,0.5rem);--swal2-width:25rem;--swal2-padding:var(--spacing-sm-plus,0.625rem);--swal2-border:var(--border-width-thin,1px) solid var(--color-neutral-200,#d0d0d0);
            --swal2-border-radius:var(--radius-sm,0.25rem);--swal2-background:var(--color-midnight-900,#131419);--swal2-color:var(--color-text-dark-mode,#e7e7e7);--swal2-show-animation:mst-swal2-show 120ms ease-out;--swal2-hide-animation:mst-swal2-hide 100ms ease-in forwards;
            --swal2-title-padding:0 var(--spacing-xl-plus,1.25rem) var(--spacing-xs,0.25rem) 0;--swal2-html-container-padding:0;--swal2-input-border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);--swal2-input-border-radius:var(--radius-xs,0.125rem);
            --swal2-input-box-shadow:none;--swal2-input-background:var(--color-midnight-900,#131419);--swal2-input-color:var(--color-text-dark-mode,#e7e7e7);--swal2-input-transition:border-color 120ms ease,box-shadow 120ms ease;--swal2-input-hover-box-shadow:none;
            --swal2-input-focus-border:var(--border-width-thin,1px) solid var(--color-space-300,#98a7e9);--swal2-input-focus-box-shadow:0 0 0 1px var(--color-space-600,#4357af);--swal2-validation-message-background:var(--color-midnight-500,#2c2e45);
            --swal2-validation-message-color:var(--color-scarlet-200,#ecadb1);--swal2-footer-border-color:var(--color-midnight-400,#323450);--swal2-footer-background:transparent;--swal2-footer-color:var(--color-space-200,#bbc5f1);--swal2-close-button-color:var(--color-space-300,#98a7e9);
            --swal2-close-button-font-size:var(--font-size-xl-plus,1.375rem);--swal2-close-button-transition:color 120ms ease,background-color 120ms ease;--swal2-actions-justify-content:center;--swal2-actions-margin:var(--spacing-sm,0.5rem) auto 0;--swal2-actions-padding:0;
            --swal2-action-button-transition:background-color 120ms ease;--swal2-action-button-focus-box-shadow:0 0 0 2px var(--color-midnight-900,#131419),0 0 0 3px var(--color-space-300,#98a7e9);--swal2-confirm-button-border-radius:var(--radius-sm,0.25rem);
            --swal2-confirm-button-background-color:var(--color-primary,#4357af);--swal2-confirm-button-color:var(--color-text-dark-mode,#e7e7e7);--swal2-confirm-button-box-shadow:none;--swal2-deny-button-border-radius:var(--radius-sm,0.25rem);
            --swal2-deny-button-background-color:var(--color-warning,#db3333);--swal2-deny-button-color:var(--color-text-dark-mode,#e7e7e7);--swal2-deny-button-box-shadow:none;--swal2-cancel-button-border-radius:var(--radius-sm,0.25rem);
            --swal2-cancel-button-background-color:var(--color-midnight-500,#2c2e45);--swal2-cancel-button-color:var(--color-text-dark-mode,#e7e7e7);--swal2-cancel-button-box-shadow:none;--swal2-toast-border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);
            --swal2-toast-box-shadow:var(--shadow-sm,2px 2px 4px rgba(0,0,0,0.2));--swal2-toast-show-animation:mst-swal2-toast-show 140ms ease-out;--swal2-toast-hide-animation:mst-swal2-hide 100ms ease-in forwards;z-index:2147482100 !important;font-family:Roboto,Helvetica,Arial,sans-serif;}
        .mst-swal2-theme.swal2-container{overflow:hidden !important;}
        .mst-swal2-theme .swal2-popup{min-width:min(18.75rem,calc(100vw - 1rem));max-width:calc(100vw - 1rem);min-height:6.25rem;box-sizing:border-box;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-normal,400);
            line-height:var(--line-height-normal,1.375);box-shadow:0 0 0.25rem 0.25rem hsla(0,0%,81.6%,0.2823529412);}
        .mst-swal2-theme .swal2-title{margin:0;padding-right:calc(1.375rem + var(--spacing-md,0.75rem));padding-bottom:var(--spacing-sm,0.5rem);color:var(--color-text-dark-mode,#e7e7e7);font-size:var(--font-size-md,1rem);font-weight:var(--font-weight-semibold,600);
            line-height:var(--line-height-normal,1.375);letter-spacing:0;text-align:left;}
        .mst-swal2-theme .swal2-html-container{margin:var(--spacing-xs,0.25rem) var(--spacing-md,0.75rem);color:var(--color-text-dark-mode,#e7e7e7);font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-normal,400);line-height:var(--line-height-normal,1.375);letter-spacing:0;
            text-align:left;white-space:pre-line;}
        .mst-swal2-theme .swal2-icon{display:none !important;}
        .mst-swal2-theme .swal2-input,.mst-swal2-theme .swal2-file,.mst-swal2-theme .swal2-textarea,.mst-swal2-theme .swal2-select{min-height:var(--input-height-normal,1.875rem);margin:var(--spacing-sm,0.5rem) 0 0;padding:var(--input-padding-y,0.25rem) var(--input-padding-x,0.625rem);
            box-sizing:border-box;color:var(--color-text-dark-mode,#e7e7e7);font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-medium,500);line-height:var(--line-height-normal,1.375);}
        .mst-swal2-theme .swal2-textarea{min-height:6rem;resize:none;white-space:pre-wrap;}
        .mst-swal2-theme .swal2-validation-message{margin:var(--spacing-sm,0.5rem) 0 0;padding:var(--spacing-sm,0.5rem);border-left:var(--border-width-thick,3px) solid var(--color-scarlet-500,#d0333d);border-radius:var(--radius-xs,0.125rem);font-size:var(--font-size-sm,0.8125rem);}
        .mst-swal2-theme .swal2-actions{gap:var(--spacing-sm,0.5rem);}
        .mst-swal2-theme .swal2-actions .swal2-styled{min-width:6.25rem;height:var(--button-height-normal,1.875rem);margin:0;padding:0 var(--button-padding-x-normal,0.625rem);border:0;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,0.875rem);
            font-weight:var(--font-weight-semibold,600);line-height:1;letter-spacing:0;}
        .mst-swal2-theme .swal2-confirm:hover{background-color:var(--color-primary-hover,#546ddb) !important;}
        .mst-swal2-theme .swal2-deny:hover{background-color:var(--color-warning-hover,#eb3f3f) !important;}
        .mst-swal2-theme .swal2-cancel:hover{background-color:var(--color-midnight-300,#393a5b) !important;}
        .mst-swal2-theme .swal2-close{position:absolute;top:0;right:0;width:1.375rem;height:1.375rem;margin:var(--spacing-sm,0.5rem);padding:var(--spacing-xs,0.25rem);border-radius:var(--radius-sm,0.25rem);line-height:0.875rem;}
        .mst-swal2-theme .swal2-close:hover{background-color:var(--color-midnight-500,#2c2e45);color:var(--color-text-dark-mode,#e7e7e7);}
        .mst-swal2-theme .swal2-footer{margin:var(--spacing-sm,0.5rem) 0 0;padding:var(--spacing-sm,0.5rem) 0 0;font-size:var(--font-size-sm,0.8125rem);}
        .mst-swal2-theme .swal2-loader{border-color:var(--color-space-500,#546ddb) transparent var(--color-space-500,#546ddb) transparent;}
        .mst-swal2-theme .swal2-timer-progress-bar{background:var(--color-space-400,#7184d8);}
        .mst-swal2-theme .mst-swal2-html-popup{height:auto;max-height:calc(100vh - 2rem);max-height:calc(100dvh - 2rem);max-height:calc(100svh - 2rem);overflow:hidden;}
        .mst-swal2-theme .mst-swal2-popup.swal2-draggable .swal2-title{pointer-events:none;user-select:none;}
        .mst-swal2-theme .mst-swal2-html-popup .swal2-html-container{min-height:0;max-height:calc(100vh - 10rem);max-height:calc(100dvh - 10rem);max-height:calc(100svh - 10rem);margin-right:0;margin-left:0;padding-right:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;
            scrollbar-color:var(--color-space-300,#98a7e9) transparent;scrollbar-width:thin;white-space:normal;}
        .mst-swal2-theme .mst-swal2-html-popup .swal2-html-container::-webkit-scrollbar{width:var(--scrollbar-width,0.25rem);}
        .mst-swal2-theme .mst-swal2-html-popup .swal2-html-container::-webkit-scrollbar-thumb{border-radius:var(--scrollbar-border-radius,0.25rem);background:var(--color-space-300,#98a7e9);}
        .mst-swal-toast-host{position:fixed;top:max(var(--spacing-sm,0.5rem),env(safe-area-inset-top));left:50%;z-index:2147483550 !important;display:grid;width:min(24rem,calc(100vw - 1rem));transform:translateX(-50%);pointer-events:none;}
        .mst-swal2-theme .swal2-toast.mst-swal2-toast{display:grid !important;width:min(24rem,calc(100vw - 1rem));min-width:0;min-height:0;margin:0;padding:0;border:0;background:transparent;color:var(--color-text-dark-mode,#e7e7e7);font-size:var(--font-size-base,0.875rem);
            line-height:var(--line-height-normal,1.375);box-shadow:none;pointer-events:auto;}
        .mst-swal2-theme .swal2-toast .swal2-html-container{width:100%;margin:0;padding:0;overflow:visible;font-size:var(--font-size-base,0.875rem);line-height:var(--line-height-normal,1.375);text-align:left;white-space:normal;}
        .mst-swal2-theme .mst-swal-toast-stack{display:grid;gap:var(--spacing-xs-plus,0.375rem);width:100%;}
        .mst-swal2-theme .mst-swal-toast-item{display:flex;align-items:center;min-height:2.5rem;padding:var(--spacing-xs-plus,0.375rem) var(--spacing-sm,0.5rem);border:var(--border-width-thin,1px) solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,0.25rem);box-sizing:border-box;
            background:var(--color-midnight-700,#20212f);box-shadow:var(--shadow-sm,2px 2px 4px rgba(0,0,0,0.2));overflow-wrap:anywhere;animation:var(--swal2-toast-show-animation);}
        @media (max-width: 640px){.mst-swal2-theme{--swal2-container-padding:var(--spacing-sm,0.5rem);--swal2-padding:var(--spacing-sm,0.5rem);}.mst-swal2-theme .swal2-popup:not(.swal2-toast){height:auto;max-height:calc(100vh - 1rem);max-height:calc(100dvh - 1rem);max-height:calc(100svh - 1rem);}}
        @keyframes mst-swal2-show{from{transform:scale(0.98);opacity:0;}to{transform:scale(1);opacity:1;}}
        @keyframes mst-swal2-toast-show{from{transform:translateY(-0.25rem);opacity:0;}to{transform:translateY(0);opacity:1;}}
        @keyframes mst-swal2-hide{to{transform:scale(0.98);opacity:0;}}
    `;


    const marketDataService = CONFIG.isGameSite ? new MarketDataService() : null;
    const buildScoreService = CONFIG.isGameSite ? new BuildScoreService(marketDataService) : null;
    const houseCalculator = CONFIG.isGameSite ? new HouseCalculator(houseDetails) : null;
    let houseCalculatorUI = null;
    class LanguageController {
        constructor() {
            this.isInitialized = false;
            this.bodyObserver = null;
            this.documentLanguageObserver = null;
            this.gameLanguageTimer = null;
        }

        updateToggleButton() {
            const button = document.getElementById('mst-language-toggle');
            if (!button) return;
            const label = i18n.t('switchLanguage');
            button.textContent = label;
            button.title = label;
            button.setAttribute('aria-label', label);
        }

        mountToggleButton() {
            if (!CONFIG.SHOW_LANGUAGE_TOGGLE || !CONFIG.isGameSite || !document.body || document.getElementById('mst-language-toggle')) return;
            const button = document.createElement('button');
            button.id = 'mst-language-toggle';
            button.type = 'button';
            button.addEventListener('pointerdown', event => {
                if (document.querySelector('.mst-swal2-theme.swal2-container')) event.preventDefault();
            });
            button.addEventListener('click', () => this.toggleLanguage());
            document.body.appendChild(button);
            this.updateToggleButton();
        }

        toggleLanguage() {
            const nextLang = i18n.alternateLanguage;
            localStorage.setItem('i18nextLng', nextLang);
            this.applyGameSetting(nextLang);
        }

        syncFromGameSetting(nextValue) {
            const nextLang = i18n.normalizeLang(nextValue);
            if (i18n.languageKey === nextLang) return;
            const calculator = document.getElementById('mst-hccp-house-calculator');
            if (calculator && houseCalculatorUI) {
                houseCalculatorUI.rerenderForLanguage(calculator, nextLang);
            } else {
                i18n.setLanguage(nextLang);
            }
            const triggerBtn = document.getElementById('mst-hccp-house-calculator-trigger');
            if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
        }

        applyGameSetting(nextValue) {
            const previousLang = i18n.languageKey;
            this.syncFromGameSetting(nextValue);
            if (previousLang !== i18n.languageKey) {
                LanguageEvents.emit(i18n.languageKey);
            }
        }

        init() {
            if (this.isInitialized) return;
            this.isInitialized = true;
            window.addEventListener('storage', event => {
                if (event.key === 'i18nextLng') this.applyGameSetting(event.newValue);
            });
            window.addEventListener('MWILangChanged', () => {
                this.applyGameSetting(i18n.readPageLanguage());
            });
            this.documentLanguageObserver = new MutationObserver(() => {
                this.applyGameSetting(document.documentElement.lang);
            });
            this.documentLanguageObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['lang']
            });
            const syncCurrentGameLanguage = () => {
                this.applyGameSetting(i18n.readPageLanguage());
            };
            syncCurrentGameLanguage();
            this.gameLanguageTimer = setInterval(syncCurrentGameLanguage, 1000);
            if (CONFIG.SHOW_LANGUAGE_TOGGLE) {
                this.bodyObserver = utils.observeBody(() => this.mountToggleButton());
                LanguageEvents.subscribe(() => this.updateToggleButton());
            }
            window.addEventListener('beforeunload', () => {
                this.bodyObserver?.disconnect();
                this.documentLanguageObserver?.disconnect();
                clearInterval(this.gameLanguageTimer);
            }, {once: true});
        }
    }

    class AppController {
        constructor() {
            this.isInitialized = false;
            this.domObserver = null;
        }

        initStyles() {
            const css =
                `
                    #character-switch-dropdown,.character-switch-dropdown{display:none!important;}
                    [class*="EquipmentPanel_buttonContainer"]{display:flex!important;align-items:center;justify-content:center;flex-wrap:nowrap;gap:.25rem;width:max-content;max-width:100%;}
                    .mst-eds-profit-menu{position:relative;display:inline-flex;}
                    .mst-eds-profit-submenu{position:absolute;top:calc(100% + .25rem);left:50%;z-index:2147483000;display:flex;min-width:max-content;transform:translateX(-50%);flex-direction:column;gap:.25rem;padding:.35rem;border:1px solid var(--color-midnight-100,#454771);
                        border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-600,#27283b);box-shadow:var(--shadow-md,0 4px 10px rgba(0,0,0,.35));}
                    .mst-eds-profit-submenu[hidden]{display:none;}
                    .mst-eds-profit-submenu button{width:100%;margin:0;}
                    .mst-eds-loadout-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.25rem .5rem;width:100%;margin:-.25rem 0 -.375rem;}
                    .mst-eds-loadout-actions button{width:auto!important;max-width:100%;margin:0;border-color:var(--color-space-400,#7686cc)!important;background:var(--color-midnight-400,#323450)!important;color:var(--color-text-dark-mode,#e7e7e7)!important;}
                    .mst-eds-loadout-actions button:hover{border-color:var(--color-space-200,#bbc5f1)!important;background:var(--color-midnight-300,#393b5c)!important;}
                    #mst-language-toggle{position:fixed;top:max(var(--spacing-sm,0.5rem),env(safe-area-inset-top));left:max(var(--spacing-sm,0.5rem),env(safe-area-inset-left));z-index:2147483647;display:inline-flex;align-items:center;justify-content:center;width:auto;min-width:3rem;
                        max-width:calc(100vw - 1rem);height:var(--button-height-normal,1.875rem);margin:0;padding:0 .6rem;border:var(--border-width-thin,1px) solid var(--color-space-300,#98a7e9);border-radius:var(--radius-sm,0.25rem);background:var(--color-midnight-500,#2c2e45);
                        color:var(--color-text-dark-mode,#e7e7e7);font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,0.875rem);font-weight:var(--font-weight-semibold,600);line-height:1;letter-spacing:0;white-space:nowrap;cursor:pointer;
                        box-shadow:var(--shadow-sm,2px 2px 4px rgba(0,0,0,.2));}
                    #mst-language-toggle:hover{background:var(--color-midnight-400,#323450);color:#fff;}
                    #mst-language-toggle:focus-visible{outline:1px solid var(--color-space-200,#bbc5f1);outline-offset:1px;}
                ` +
                MST_SWAL_THEME_CSS +
                `
                    #mst-toolkit-character-dropdown{position:absolute;top:100%;right:0;z-index:2147483200;display:flex;min-width:14rem;max-width:calc(100vw - 1rem);max-height:min(26rem,calc(100svh - 5rem));overflow:auto;flex-direction:column;gap:.25rem;padding:.5rem;
                        background:var(--color-midnight-600,#27283b);border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);box-shadow:var(--shadow-md,0 .35rem 1rem rgba(0,0,0,.4));font-family:Roboto,Helvetica,Arial,sans-serif;}
                    .mst-toolkit-dropdown-title{padding:.35rem .5rem .55rem;border-bottom:1px solid var(--color-midnight-200,#3b3d60);color:var(--color-text-dark-mode,#e7e7e7);font-size:var(--font-size-large,1rem);font-weight:var(--font-weight-semibold,600);text-align:center;}
                    .mst-toolkit-action{display:flex;align-items:center;gap:.5rem;width:100%;min-height:var(--button-height-normal,1.875rem);margin:0;padding:.25rem .6rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-500,#2c2e45);color:var(--color-text-dark-mode,#e7e7e7);font:inherit;font-size:var(--font-size-base,.875rem);text-align:left;cursor:pointer;}
                    .mst-toolkit-action svg{width:1.25rem;height:1.25rem;flex:0 0 1.25rem;}
                    .mst-toolkit-action:hover{border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-400,#323450);}
                    .mst-equipment-compare-view{position:relative;display:flex;min-height:0;box-sizing:border-box;flex-direction:column;gap:.65rem;color:var(--color-text-dark-mode,#e7e7e7);font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,.875rem);text-align:left;}
                    .mst-equipment-compare-view.mst-equipment-compare-picker-open{min-height:min(16rem,calc(100vh - 10rem));min-height:min(16rem,calc(100dvh - 10rem));min-height:min(16rem,calc(100svh - 10rem));max-height:calc(100vh - 10rem);max-height:calc(100dvh - 10rem);
                        max-height:calc(100svh - 10rem);overflow:hidden;}
                    .mst-equipment-compare-notice{padding:.4rem .55rem;border:1px solid var(--color-midnight-100,#454771);border-left:3px solid var(--color-space-300,#98a7e9);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-600,#27283b);color:var(--color-neutral-300,#b9bbca);
                        font-size:var(--font-size-small,.75rem);line-height:1.35;}
                    .mst-equipment-compare-config-scroll{max-width:100%;overflow-x:auto;scrollbar-color:var(--color-space-300,#98a7e9) transparent;scrollbar-width:thin;}
                    .mst-equipment-compare-config-row{display:grid;width:max-content;min-width:100%;box-sizing:border-box;grid-template-columns:8rem repeat(2,10.5rem);align-items:stretch;justify-content:center;gap:.65rem;padding-bottom:.15rem;}
                    .mst-equipment-compare-preset{display:grid;width:8rem;min-width:0;grid-template-rows:auto 1fr;gap:.35rem;color:var(--color-neutral-200,#d2d3dc);font-weight:var(--font-weight-semibold,600);text-align:center;}
                    .mst-equipment-compare-preset select{align-self:center;}
                    .mst-equipment-compare-selector{display:flex;width:10.5rem;min-width:0;flex-direction:column;gap:.35rem;}
                    .mst-equipment-compare-selector-title{font-weight:var(--font-weight-semibold,600);text-align:center;}
                    .mst-equipment-compare-view select{width:100%;height:var(--button-height-normal,1.875rem);box-sizing:border-box;padding:.2rem .45rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-700,#20212f);
                        color:var(--color-text-dark-mode,#e7e7e7);font:inherit;}
                    .mst-equipment-compare-view select:focus{border-color:var(--color-space-300,#98a7e9);outline:none;}
                    .mst-equipment-compare-view select:disabled{opacity:.6;cursor:not-allowed;}
                    .mst-equipment-compare-target-controls{min-width:0;}
                    .mst-equipment-compare-target-controls>.mst-equipment-compare-empty{height:5.5rem;}
                    .mst-equipment-compare-enhancement{display:block;width:3rem;margin:0;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-small,.75rem);white-space:nowrap;}
                    .mst-equipment-compare-enhancement>span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;}
                    .mst-equipment-compare-enhancement select{width:3rem;min-width:0;height:1.6rem;padding:.1rem .15rem;text-align:center;text-align-last:center;}
                    .mst-equipment-compare-select-button{display:grid;width:100%;height:5.5rem;min-width:0;box-sizing:border-box;grid-template-columns:3.25rem minmax(0,1fr);grid-template-rows:minmax(0,1fr) 1.6rem;align-items:center;column-gap:.45rem;row-gap:.2rem;padding:.4rem .45rem;
                        border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-600,#27283b);color:inherit;font:inherit;text-align:left;cursor:pointer;}
                    .mst-equipment-compare-select-button:hover:not([aria-disabled="true"]){border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-500,#2c2e45);}
                    .mst-equipment-compare-select-button[aria-disabled="true"]{opacity:.6;cursor:not-allowed;}
                    .mst-equipment-compare-select-empty{display:flex;align-items:center;justify-content:center;border-style:dashed;text-align:center;}
                    .mst-equipment-compare-placeholder{color:var(--color-neutral-400,#999baa);font-size:var(--font-size-small,.75rem);}
                    .mst-equipment-compare-select-button>[hidden],.mst-equipment-compare-icon>[hidden],.mst-equipment-compare-picker-option>[hidden],.mst-equipment-compare-picker-empty[hidden]{display:none;}
                    .mst-equipment-compare-icon{position:relative;width:3.25rem;height:3.25rem;grid-column:1;grid-row:1/-1;align-self:center;}
                    .mst-equipment-compare-icon svg{display:block;width:100%;height:100%;}
                    .mst-equipment-compare-summary-text{display:flex;width:100%;min-width:0;grid-column:2;grid-row:1;flex-direction:column;align-items:flex-start;justify-content:center;gap:.12rem;}
                    .mst-equipment-compare-summary-text strong{display:-webkit-box;max-width:100%;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere;color:var(--color-text-dark-mode,#e7e7e7);font-size:var(--font-size-small,.75rem);line-height:1.15;}
                    .mst-equipment-compare-summary-text small{display:block;width:100%;overflow:hidden;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);line-height:1.15;text-overflow:ellipsis;white-space:nowrap;}
                    .mst-equipment-compare-select-button>.mst-equipment-compare-enhancement{grid-column:2;grid-row:2;align-self:end;}
                    .mst-equipment-compare-empty{display:flex;min-height:3.25rem;box-sizing:border-box;align-items:center;justify-content:center;padding:.5rem;border:1px dashed var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);color:var(--color-neutral-400,#999baa);
                        font-size:var(--font-size-small,.75rem);text-align:center;}
                    .mst-equipment-compare-results{display:flex;min-width:0;flex-direction:column;gap:.5rem;}
                    .mst-equipment-compare-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.35rem;}
                    .mst-equipment-compare-metrics[hidden],.mst-equipment-compare-metric[hidden]{display:none;}
                    .mst-equipment-compare-metric{display:flex;min-width:0;min-height:3.15rem;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;padding:.3rem .35rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-600,#27283b);text-align:center;}
                    .mst-equipment-compare-metric small{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);line-height:1.15;}
                    .mst-equipment-compare-metric strong{overflow-wrap:anywhere;font-size:var(--font-size-base,.875rem);font-weight:600;line-height:1.15;}
                    .mst-equipment-compare-table-wrap{max-height:min(28rem,calc(100svh - 18rem));overflow:auto;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);scrollbar-color:var(--color-space-300,#98a7e9) transparent;scrollbar-width:thin;}
                    .mst-equipment-compare-table{width:100%;min-width:34rem;border-collapse:collapse;table-layout:fixed;}
                    .mst-equipment-compare-table th,.mst-equipment-compare-table td{box-sizing:border-box;padding:.35rem .45rem;border-bottom:1px solid var(--color-midnight-200,#3b3d60);line-height:1.2;text-align:center;vertical-align:middle;overflow-wrap:anywhere;}
                    .mst-equipment-compare-table thead th{position:sticky;top:0;z-index:2;background:var(--color-midnight-500,#2c2e45);color:var(--color-neutral-100,#ececf1);font-weight:600;}
                    .mst-equipment-compare-table thead th:first-child,.mst-equipment-compare-table tbody th[scope="row"]{width:28%;text-align:left;}
                    .mst-equipment-compare-table thead th:nth-child(2),.mst-equipment-compare-table thead th:nth-child(3){width:26%;}
                    .mst-equipment-compare-table thead th:last-child{width:20%;}
                    .mst-equipment-compare-table tbody th[scope="row"]{color:var(--color-neutral-200,#d2d3dc);font-weight:500;}
                    .mst-equipment-compare-group th{padding:.25rem .45rem;background:var(--color-midnight-400,#323450);color:var(--color-space-200,#bbc5f1);font-size:var(--font-size-small,.75rem);font-weight:600;text-align:left;}
                    .mst-equipment-compare-difference{font-weight:600;white-space:nowrap;}
                    .mst-equipment-compare-positive{color:var(--color-jade-300,#86d7b1);}
                    .mst-equipment-compare-negative{color:var(--color-scarlet-300,#ef8f98);}
                    .mst-equipment-compare-neutral{color:var(--color-neutral-400,#999baa);}
                    .mst-equipment-compare-picker{position:absolute;inset:0;z-index:5;display:flex;align-items:flex-start;justify-content:center;background:rgba(14,15,24,.92);}
                    .mst-equipment-compare-picker[hidden]{display:none;}
                    .mst-equipment-compare-picker-panel{display:flex;width:100%;height:100%;min-height:0;box-sizing:border-box;flex-direction:column;gap:.4rem;padding:.5rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-600,#27283b);box-shadow:var(--shadow-md,0 .35rem 1rem rgba(0,0,0,.4));}
                    .mst-equipment-compare-picker-filters{display:flex;min-width:0;gap:.4rem;}
                    .mst-equipment-compare-picker-type,.mst-equipment-compare-picker-search{height:var(--button-height-normal,1.875rem);box-sizing:border-box;padding:.2rem .45rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-700,#20212f);color:var(--color-text-dark-mode,#e7e7e7);font:inherit;}
                    .mst-equipment-compare-picker-type{width:10rem;max-width:42%;flex:0 0 auto;}
                    .mst-equipment-compare-picker-search{min-width:0;flex:1;}
                    .mst-equipment-compare-picker-type:focus,.mst-equipment-compare-picker-search:focus{border-color:var(--color-space-300,#98a7e9);outline:none;}
                    .mst-equipment-compare-picker-options{display:grid;min-height:0;flex:1;grid-template-columns:repeat(auto-fill,6rem);grid-auto-rows:6rem;align-content:start;justify-content:center;gap:.3rem;overflow:auto;}
                    .mst-equipment-compare-picker-option{position:relative;display:flex;min-width:0;min-height:0;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;gap:.2rem;padding:.35rem;border:1px solid var(--color-midnight-100,#454771);
                        border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-500,#2c2e45);color:var(--color-text-dark-mode,#e7e7e7);font:inherit;text-align:center;cursor:pointer;}
                    .mst-equipment-compare-picker-option:hover:not(:disabled){border-color:var(--color-space-300,#98a7e9);background:var(--color-midnight-400,#323450);}
                    .mst-equipment-compare-picker-option-selected{border-color:var(--color-cowbell,#f6c95c);opacity:.55;cursor:default;}
                    .mst-equipment-compare-picker-option svg{width:2.75rem;height:2.75rem;flex:0 0 2.75rem;}
                    .mst-equipment-compare-picker-option strong{display:-webkit-box;max-width:100%;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;font-size:var(--font-size-small,.75rem);line-height:1.1;}
                    .mst-equipment-compare-picker-level,.mst-equipment-compare-picker-item-level{position:absolute;top:.25rem;z-index:1;color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-tiny,.6875rem);font-weight:600;line-height:1;text-shadow:0 1px 2px #000;}
                    .mst-equipment-compare-picker-level{left:.3rem;}
                    .mst-equipment-compare-picker-item-level{right:.3rem;color:var(--color-neutral-200,#d2d3dc);}
                    .mst-equipment-compare-picker-empty{grid-column:1/-1;align-self:center;color:var(--color-neutral-300,#b9bbca);text-align:center;}
                    .mst-equipment-compare-picker-close{align-self:center;min-height:var(--button-height-normal,1.875rem);padding:.25rem .65rem;border:1px solid var(--color-space-400,#7686cc);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-400,#323450);
                        color:var(--color-text-dark-mode,#e7e7e7);font:inherit;cursor:pointer;}
                    .mst-equipment-compare-picker-close:hover{border-color:var(--color-space-200,#bbc5f1);background:var(--color-midnight-300,#393b5c);}
                    .mst-upgrade-calculator{position:relative;color:var(--color-text-dark-mode,#e7e7e7);font-family:Roboto,Helvetica,Arial,sans-serif;font-size:var(--font-size-base,.875rem);text-align:left;}
                    .mst-upgrade-calculator button{min-height:var(--button-height-normal,1.875rem);padding:.25rem .65rem;border:1px solid var(--color-space-400,#7686cc);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-400,#323450);color:var(--color-text-dark-mode,#e7e7e7);
                        font:inherit;cursor:pointer;}
                    .mst-upgrade-calculator button:hover{border-color:var(--color-space-200,#bbc5f1);background:var(--color-midnight-300,#393b5c);}
                    .mst-upgrade-calculator input,.mst-upgrade-calculator select{box-sizing:border-box;height:var(--button-height-normal,1.875rem);padding:.2rem .4rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);outline:0;
                        background:var(--color-midnight-700,#20212f);color:var(--color-text-dark-mode,#e7e7e7);font:inherit;color-scheme:dark;}
                    .mst-upgrade-calculator input:focus,.mst-upgrade-calculator select:focus{border-color:var(--color-space-300,#98a7e9);}
                    .mst-upgrade-calculator input[readonly],.mst-upgrade-calculator input:disabled{opacity:.65;cursor:not-allowed;}
                    .mst-calculator-toolbar{display:grid;grid-template-columns:repeat(3,minmax(8rem,1fr)) auto;align-items:end;gap:.5rem;margin-bottom:.5rem;}
                    .mst-calculator-toolbar label{display:flex;min-width:0;flex-direction:column;gap:.2rem;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-small,.75rem);}
                    .mst-calculator-toolbar input{width:100%;}
                    .mst-calculator-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.4rem;margin-bottom:.55rem;}
                    .mst-calculator-summary>span{display:flex;min-width:0;min-height:3.1rem;box-sizing:border-box;flex-direction:column;justify-content:center;padding:.35rem .5rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-600,#27283b);text-align:center;}
                    .mst-calculator-summary>[hidden]{display:none!important;}
                    .mst-calculator-summary small{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-small,.75rem);}
                    .mst-calculator-summary strong{overflow-wrap:anywhere;color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-large,1rem);font-weight:600;}
                    .mst-calculator-table-wrap{max-height:min(30rem,calc(100svh - 18rem));overflow:auto;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);}
                    .mst-calculator-table{width:100%;min-width:68rem;border-collapse:collapse;background:var(--color-midnight-700,#20212f);font-size:var(--font-size-small,.75rem);}
                    .mst-calculator-table th{position:sticky;top:0;z-index:1;padding:.4rem .35rem;background:var(--color-midnight-500,#2c2e45);color:var(--color-neutral-200,#d2d3dc);font-weight:600;white-space:nowrap;}
                    .mst-calculator-table td{padding:.3rem .35rem;border-top:1px solid var(--color-midnight-200,#3b3d60);text-align:center;white-space:nowrap;}
                    .mst-calculator-table tbody tr:nth-child(even){background:rgba(255,255,255,.02);}
                    .mst-calculator-table input{width:4.2rem;text-align:center;}
                    .mst-calculator-table select{min-width:5rem;}
                    .mst-row-remove{width:1.875rem;min-height:1.875rem!important;padding:0!important;border-color:#9a5d66!important;color:#f4c4ca!important;font-size:1.1rem!important;line-height:1!important;}
                    .mst-calculator-empty{grid-column:1/-1;padding:1rem;text-align:center;color:var(--color-neutral-300,#b9bbca);}
                    .mst-ability-calculator-button-container{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.625rem;margin:.5rem 0 .25rem;}
                    .mst-ability-calculator-trigger{display:inline-flex;margin:0;}
                    .mst-ability-action-market,.mst-ability-action-calculator{margin-top:.25rem;}
                    .mst-ability-picker{position:absolute;inset:0;z-index:5;display:flex;align-items:flex-start;justify-content:center;padding:0;background:rgba(14,15,24,.92);}
                    .mst-ability-picker[hidden]{display:none;}
                    .mst-ability-picker-panel{display:flex;width:100%;max-height:min(28rem,calc(100svh - 10rem));box-sizing:border-box;flex-direction:column;gap:.4rem;padding:.5rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);
                        background:var(--color-midnight-600,#27283b);box-shadow:var(--shadow-md,0 .35rem 1rem rgba(0,0,0,.4));}
                    .mst-ability-upgrade-calculator.mst-ability-picker-open{min-height:min(28rem,calc(100svh - 10rem));}
                    .mst-ability-search{width:100%;}
                    .mst-ability-options{display:grid;grid-template-columns:repeat(auto-fill,5.25rem);grid-auto-rows:5.25rem;align-content:start;justify-content:center;gap:.3rem;overflow:auto;}
                    .mst-ability-option{position:relative;display:flex!important;min-width:0;min-height:0!important;flex-direction:column;align-items:center;justify-content:center;gap:.25rem;padding:.35rem!important;text-align:center;}
                    .mst-ability-option svg{width:2.5rem;height:2.5rem;flex:0 0 auto;}
                    .mst-ability-option strong{display:-webkit-box;max-width:100%;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-overflow:ellipsis;white-space:normal;font-size:var(--font-size-small,.75rem);line-height:1.15;}
                    .mst-ability-level-badge{position:absolute;top:.25rem;left:.3rem;z-index:1;color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-small,.75rem);font-weight:600;line-height:1;text-shadow:0 1px 2px #000;}
                    .mst-ability-picker-close{align-self:center;}
                    .mst-upgrade-calculator{white-space:normal;}
                    .mst-combat-upgrade-calculator .mst-calculator-toolbar{grid-template-columns:repeat(3,minmax(7rem,1fr)) auto;gap:.4rem;margin-bottom:.4rem;}
                    .mst-combat-profession-picker{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.35rem;margin:0 0 .35rem;}
                    .mst-combat-profession{display:grid!important;min-width:0;min-height:3.2rem!important;box-sizing:border-box;grid-template-columns:1.75rem auto;grid-template-rows:auto auto;align-items:center;justify-content:center;justify-items:start;column-gap:.2rem;row-gap:0;
                        padding:.25rem .35rem!important;text-align:left;}
                    .mst-combat-profession svg{grid-row:1/3;width:1.75rem;height:1.75rem;}
                    .mst-combat-profession strong{max-width:100%;align-self:end;justify-self:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-size-small,.75rem);line-height:1.1;text-align:left;}
                    .mst-combat-profession small{align-self:start;justify-self:start;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);line-height:1.1;text-align:left;}
                    .mst-upgrade-calculator-dialog .swal2-title,.mst-equipment-compare-dialog .swal2-title{display:flex!important;align-items:center;gap:.6rem;}
                    .mst-combat-help-anchor,.mst-ability-help-anchor,.mst-equipment-help-anchor,.mst-dungeon-help-anchor{position:relative;display:inline-flex;width:var(--spacing-lg-plus,1.25rem);height:var(--spacing-lg-plus,1.25rem);flex:0 0 auto;align-self:center;align-items:center;pointer-events:auto;
                        vertical-align:middle;}
                    .mst-combat-help-trigger,.mst-ability-help-trigger,.mst-equipment-help-trigger,.mst-dungeon-help-trigger{display:block;width:var(--spacing-lg-plus,1.25rem);height:var(--spacing-lg-plus,1.25rem);min-height:var(--spacing-lg-plus,1.25rem)!important;box-sizing:border-box;padding:0!important;
                        border:0!important;border-radius:0!important;background:transparent!important;font-size:0!important;line-height:0!important;box-shadow:none!important;cursor:pointer;touch-action:manipulation;}
                    .mst-combat-help-trigger svg,.mst-ability-help-trigger svg,.mst-equipment-help-trigger svg,.mst-dungeon-help-trigger svg{display:block;width:100%;height:100%;pointer-events:none;}
                    .mst-combat-help-trigger:hover,.mst-ability-help-trigger:hover,.mst-equipment-help-trigger:hover,.mst-dungeon-help-trigger:hover{filter:brightness(1.12);}
                    .mst-combat-help-trigger-error,.mst-ability-help-trigger-error,.mst-equipment-help-trigger-error,.mst-dungeon-help-trigger-error{border-color:#c86b75!important;color:#f4c4ca!important;}
                    .mst-combat-help-popover,.mst-ability-help-popover,.mst-equipment-help-popover,.mst-dungeon-help-popover{position:fixed;z-index:2;width:max-content;max-width:min(var(--tooltip-max-width,40ch),calc(100vw - 1rem));max-height:calc(100svh - 1rem);overflow-y:auto;box-sizing:border-box;
                        padding:var(--tooltip-padding-y,.375rem) var(--tooltip-padding-x,.5rem);border:0;border-radius:var(--tooltip-border-radius,.25rem);background:rgba(187,197,241,.95);box-shadow:var(--shadow-md,2px 2px 10px 6px rgba(0,0,0,.3));color:#000;
                        font-size:var(--tooltip-font-size,var(--font-size-base,.875rem));font-weight:var(--font-weight-medium,500);line-height:var(--line-height-normal,1.375);text-align:left;user-select:none;}
                    .mst-combat-help-popover[hidden],.mst-ability-help-popover[hidden],.mst-equipment-help-popover[hidden],.mst-dungeon-help-popover[hidden]{display:none;}
                    .mst-combat-help-popover-title,.mst-ability-help-popover-title,.mst-equipment-help-popover-title,.mst-dungeon-help-popover-title{margin:0;padding:0;font-size:var(--font-size-md,1rem);font-weight:var(--font-weight-medium,500);line-height:var(--line-height-normal,1.375);}
                    .mst-combat-help-popover-content,.mst-ability-help-popover-content,.mst-equipment-help-popover-content,.mst-dungeon-help-popover-content{margin-top:var(--spacing-xs,.25rem);padding-top:var(--spacing-xs,.25rem);border-top:1px solid #000;}
                    .mst-combat-help-popover-paragraph,.mst-ability-help-popover-paragraph,.mst-equipment-help-popover-paragraph,.mst-dungeon-help-popover-paragraph{margin-top:var(--spacing-xs,.25rem);padding-bottom:var(--spacing-xs,.25rem);}
                    .mst-combat-help-popover-error,.mst-ability-help-popover-error,.mst-equipment-help-popover-error,.mst-dungeon-help-popover-error{border-color:#c86b75;}
                    .mst-combat-upgrade-calculator .mst-calculator-table-wrap{max-height:min(28rem,calc(100svh - 19rem));}
                    .mst-combat-upgrade-calculator .mst-calculator-table{min-width:54rem;table-layout:fixed;}
                    .mst-combat-upgrade-calculator .mst-calculator-table th,.mst-combat-upgrade-calculator .mst-calculator-table td{box-sizing:border-box;padding:.25rem .3rem;text-align:center;vertical-align:middle;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th{height:auto;white-space:normal;line-height:1.15;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(1){width:2.75rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(2){width:5.5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(3){width:4.25rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(4){width:5.75rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(5){width:5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(6){width:6.25rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(7){width:5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(8){width:3.5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(9){width:7.5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(10){width:4.5rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table thead th:nth-child(11){width:2.75rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table input[type=number]{width:4rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-toolbar input[type=number],.mst-combat-upgrade-calculator input[data-row-field="hourlyExperienceOverride"]{-moz-appearance:textfield;appearance:textfield;}
                    .mst-combat-upgrade-calculator .mst-calculator-toolbar input[type=number]::-webkit-inner-spin-button,
                    .mst-combat-upgrade-calculator .mst-calculator-toolbar input[type=number]::-webkit-outer-spin-button,
                    .mst-combat-upgrade-calculator input[data-row-field="hourlyExperienceOverride"]::-webkit-inner-spin-button,
                    .mst-combat-upgrade-calculator input[data-row-field="hourlyExperienceOverride"]::-webkit-outer-spin-button{
                        -webkit-appearance:none;margin:0;}
                    .mst-combat-upgrade-calculator .mst-calculator-table th:nth-child(2),.mst-combat-upgrade-calculator .mst-calculator-name{text-align:left!important;}
                    .mst-combat-upgrade-calculator .mst-calculator-table tbody tr{height:3.2rem;}
                    .mst-combat-upgrade-calculator .mst-calculator-table td:last-child{padding:.15rem;}
                    .mst-combat-row-actions{display:flex;align-items:center;justify-content:center;}
                    .mst-combat-row-actions button{width:1.45rem;min-height:1.55rem!important;padding:0!important;line-height:1!important;}
                    .mst-combat-upgrade-calculator .mst-calculator-table tfoot th,.mst-combat-upgrade-calculator .mst-calculator-table tfoot td{position:sticky;bottom:0;z-index:1;height:auto;padding:.4rem .35rem;border-top:1px solid var(--color-space-400,#7686cc);
                        background:var(--color-midnight-500,#2c2e45);color:var(--color-cowbell,#f6c95c);font-weight:600;line-height:1.15;text-align:center;vertical-align:middle!important;}
                    .mst-combat-duration-hours,.mst-combat-duration-days{display:block;line-height:1.15;white-space:nowrap;}
                    .mst-combat-duration-days{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);font-weight:400;}
                    .mst-combat-total-duration{display:block;line-height:1.15;white-space:nowrap;}
                    .mst-sequence-cell{cursor:grab;user-select:none;}
                    .mst-sequence-cell:active{cursor:grabbing;}
                    .mst-sequence-cell svg{width:1rem;height:1rem;margin-right:.2rem;vertical-align:middle;}
                    .mst-calculator-name{max-width:none;overflow:hidden;text-align:left!important;text-overflow:ellipsis;}
                    .mst-calculator-name svg{width:1.5rem;height:1.5rem;margin-right:.3rem;vertical-align:middle;}
                    .mst-calculator-name span{vertical-align:middle;}
                    .mst-training-checkbox{display:inline-flex;align-items:center;justify-content:center;gap:.25rem;cursor:pointer;}
                    .mst-training-checkbox input{width:1rem!important;height:1rem;}
                    .mst-fixed-training{color:var(--color-neutral-300,#b9bbca);}
                    .mst-row-dragging{opacity:.45;outline:1px dashed var(--color-space-300,#98a7e9);}
                    .mst-combat-upgrade-calculator .mst-target-level-control input{width:100%;height:100%;padding:.2rem 2rem .2rem .4rem;border:0!important;border-radius:inherit;background:transparent;}
                    .mst-combat-start-control{display:flex;min-width:0;align-items:center;justify-content:center;gap:.25rem;}
                    .mst-combat-start-control>input[data-row-field="customStart"]{width:1rem!important;height:1rem;flex:0 0 1rem;}
                    .mst-combat-start-control .mst-target-level-control{min-width:0;flex:1;}
                    .mst-combat-training-type{display:flex;min-height:2.6rem;flex-direction:column;align-items:center;justify-content:center;gap:.1rem;font-size:var(--font-size-small,.75rem);line-height:1;}
                    .mst-combat-training-line,.mst-concurrent-training,.mst-concurrent-training-placeholder{display:flex;min-height:1.2rem;align-items:center;justify-content:center;}
                    .mst-combat-training-type .mst-training-checkbox{min-width:0;justify-content:center;gap:.25rem;font-size:inherit;line-height:1;}
                    .mst-combat-training-type .mst-training-checkbox span,.mst-fixed-training{white-space:nowrap;}
                    .mst-combat-training-type .mst-training-checkbox input{box-sizing:border-box;width:.875rem!important;height:.875rem!important;min-width:.875rem;margin:0;}
                    .mst-fixed-training{display:inline-flex;min-height:1.2rem;align-items:center;font-size:inherit;line-height:1;}
                    .mst-concurrent-training{color:var(--color-neutral-300,#b9bbca);font-size:inherit;}
                    .mst-ability-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem;margin-bottom:.5rem;}
                    .mst-ability-add-button{display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;}
                    .mst-ability-add-button svg{width:1.25rem;height:1.25rem;}
                    .mst-ability-preset-controls{display:flex;min-width:14rem;flex:1;align-items:center;flex-wrap:wrap;gap:.35rem;}
                    .mst-ability-preset-select,.mst-ability-level-preset-select{min-width:9rem;flex:1;}
                    .mst-ability-reset-data{white-space:nowrap;}
                    .mst-ability-market-time{display:flex;max-width:18rem;flex-direction:column;align-items:flex-end;margin-left:auto;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-small,.75rem);line-height:1.2;text-align:right;}
                    .mst-ability-market-time strong{overflow-wrap:anywhere;color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-small,.75rem);font-weight:600;}
                    .mst-ability-table-wrap{max-height:min(30rem,calc(100svh - 13rem));}
                    .mst-ability-table{min-width:49.5rem;table-layout:fixed;}
                    .mst-ability-table th,.mst-ability-table td{box-sizing:border-box;padding:.25rem;text-align:center;vertical-align:middle;}
                    .mst-ability-table thead th:first-child{padding-left:.45rem;text-align:left;}
                    .mst-ability-table th:nth-child(1){width:7rem;}
                    .mst-ability-table th:nth-child(2){width:3.5rem;}
                    .mst-ability-table th:nth-child(3){width:6.5rem;}
                    .mst-ability-table th:nth-child(4){width:5.25rem;}
                    .mst-ability-table th:nth-child(5),.mst-ability-table th:nth-child(6){width:5rem;}
                    .mst-ability-table th:nth-child(7),.mst-ability-table th:nth-child(8){width:6rem;}
                    .mst-ability-table th:nth-child(9){width:5.25rem;}
                    .mst-ability-table .mst-calculator-name{max-width:none;text-align:left;}
                    .mst-ability-start-control,.mst-ability-price-values{display:flex;align-items:center;justify-content:center;gap:.25rem;}
                    .mst-ability-table input[data-row-field="customStart"]{width:1rem;height:1rem;flex:0 0 auto;}
                    .mst-ability-table input[type="number"]{width:4rem;}
                    .mst-target-level-control input::-webkit-inner-spin-button,.mst-target-level-control input::-webkit-outer-spin-button{margin:0;-webkit-appearance:none;}
                    .mst-ability-price-values i{color:var(--color-neutral-400,#999baa);font-style:normal;}
                    .mst-ability-price-values strong{color:var(--color-cowbell,#f6c95c);font-weight:600;}
                    .mst-ability-row-actions{display:flex;align-items:center;justify-content:center;gap:.15rem;}
                    .mst-ability-row-actions button{width:1.45rem;min-height:1.55rem!important;padding:0!important;line-height:1!important;}
                    .mst-ability-row-cart{display:inline-flex;align-items:center;justify-content:center;color:var(--color-jade-300,#86d7b1)!important;}
                    .mst-ability-cart-icon{width:1rem;height:1rem;}
                    .mst-ability-row-reset{color:var(--color-cowbell,#f6c95c)!important;}
                    .mst-ability-table tfoot th,.mst-ability-table tfoot td{position:sticky;bottom:0;z-index:1;border-top:1px solid var(--color-space-400,#7686cc);background:var(--color-midnight-500,#2c2e45);color:var(--color-cowbell,#f6c95c);font-weight:600;text-align:center;}
                    .mst-ability-option-selected{border-color:var(--color-cowbell,#f6c95c)!important;opacity:.55;cursor:default!important;}
                    .mst-ability-table thead th{height:auto;white-space:normal;overflow-wrap:normal;line-height:1.15;}
                    .mst-ability-table .mst-calculator-name{overflow:visible;text-overflow:clip;white-space:normal;}
                    .mst-ability-name-cell{display:grid;min-width:0;grid-template-columns:1.5rem minmax(0,1fr);align-items:center;gap:.3rem;}
                    .mst-ability-market-link{display:inline-flex;width:1.5rem;height:1.5rem;min-height:0!important;align-items:center;justify-content:center;margin:0;padding:0!important;border:0!important;background:transparent!important;color:inherit;cursor:pointer;}
                    .mst-ability-market-link svg{width:1.5rem;height:1.5rem;margin:0;}
                    .mst-ability-market-link:hover svg{filter:brightness(1.2);}
                    .mst-ability-name-cell span{min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.15;}
                    .mst-ability-start-control .mst-target-level-control{min-width:0;flex:1;}
                    .mst-target-level-control{position:relative;display:block;height:var(--button-height-normal,1.875rem);box-sizing:border-box;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-700,#20212f);}
                    .mst-target-level-control:focus-within{border-color:var(--color-space-300,#98a7e9);}
                    .mst-ability-table .mst-target-level-control input{width:100%;min-width:0;height:100%;padding:.2rem 2rem .2rem .4rem;border:0!important;border-radius:inherit;background:transparent;-moz-appearance:textfield;}
                    .mst-target-level-control select{position:absolute;top:0;right:0;width:1.75rem;min-width:0;height:100%;padding:0;border:0;border-left:1px solid var(--color-midnight-100,#454771);border-radius:0;background:transparent;color:transparent;text-align:center;text-align-last:center;cursor:pointer;
                        appearance:none;-webkit-appearance:none;}
                    .mst-target-level-control select option{background:var(--color-midnight-700,#20212f);color:var(--color-text-dark-mode,#e7e7e7);text-align:center;}
                    .mst-target-level-control::after{position:absolute;top:50%;right:0;width:1.75rem;content:"▾";transform:translateY(-52%);color:var(--color-neutral-200,#d2d3dc);font-size:1rem;line-height:1;text-align:center;pointer-events:none;}
                    .mst-ability-current-level{display:flex;min-height:1.875rem;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;}
                    .mst-ability-current-level strong{font-weight:500;}
                    .mst-ability-current-level small{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);}
                    .mst-dungeon-calculator{display:flex;min-height:0;flex-direction:column;gap:.6rem;}
                    .mst-dungeon-toolbar{display:grid;grid-template-columns:minmax(11rem,1.4fr) repeat(3,minmax(7rem,1fr));gap:.45rem;align-items:end;}
                    .mst-dungeon-field{display:flex;min-width:0;flex-direction:column;gap:.2rem;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-small,.75rem);line-height:1.2;}
                    .mst-dungeon-field-wide{min-width:0;}
                    .mst-dungeon-field>input,.mst-dungeon-field>select{width:100%;min-width:0;}
                    .mst-dungeon-buff-field{display:grid;grid-template-columns:1fr;}
                    .mst-dungeon-auto-buff{display:inline-flex;min-height:1.2rem;align-items:center;gap:.3rem;color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);cursor:pointer;}
                    .mst-dungeon-auto-buff input{width:.9rem!important;height:.9rem!important;margin:0;flex:0 0 .9rem;}
                    .mst-dungeon-toggle-field{align-self:stretch;justify-content:flex-end;padding-bottom:.3rem;}
                    .mst-dungeon-toggle-field .mst-dungeon-auto-buff{min-height:2rem;}
                    .mst-dungeon-results{display:flex;min-height:0;flex-direction:column;gap:.5rem;}
                    .mst-dungeon-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.35rem;}
                    .mst-dungeon-summary-item{display:flex;min-width:0;min-height:3.1rem;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;padding:.3rem .4rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-600,#27283b);text-align:center;}
                    .mst-dungeon-summary-item small{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);line-height:1.15;}
                    .mst-dungeon-summary-item strong{color:var(--color-cowbell,#f6c95c);font-size:var(--font-size-base,.875rem);line-height:1.2;}
                    .mst-dungeon-market-meta{display:flex;align-items:flex-end;flex-wrap:wrap;gap:.35rem .8rem;padding:.35rem .5rem;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);background:var(--color-midnight-600,#27283b);}
                    .mst-dungeon-market-meta>span{display:flex;min-width:0;flex-direction:column;gap:.1rem;}
                    .mst-dungeon-market-meta small{color:var(--color-neutral-300,#b9bbca);font-size:var(--font-size-tiny,.6875rem);line-height:1.1;}
                    .mst-dungeon-market-meta strong{color:var(--color-neutral-100,#ececf1);font-size:var(--font-size-small,.75rem);font-weight:500;line-height:1.2;overflow-wrap:anywhere;}
                    .mst-dungeon-market-meta .mst-dungeon-market-time{margin-left:auto;text-align:right;}
                    .mst-dungeon-warning{padding:.35rem .5rem;border:1px solid #866f38;border-left:3px solid var(--color-cowbell,#f6c95c);border-radius:var(--radius-sm,.25rem);background:#3a3324;color:#f5dda1;font-size:var(--font-size-small,.75rem);line-height:1.3;}
                    .mst-dungeon-empty{display:flex;min-height:8rem;align-items:center;justify-content:center;border:1px dashed var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);color:var(--color-neutral-300,#b9bbca);text-align:center;}
                    .mst-dungeon-table-wrap{max-height:min(28rem,calc(100svh - 20rem));overflow:auto;border:1px solid var(--color-midnight-100,#454771);border-radius:var(--radius-sm,.25rem);scrollbar-color:var(--color-space-300,#98a7e9) transparent;scrollbar-width:thin;}
                    .mst-dungeon-table{width:100%;min-width:34rem;border-collapse:collapse;table-layout:fixed;}
                    .mst-dungeon-table th,.mst-dungeon-table td{box-sizing:border-box;padding:.38rem .45rem;border-bottom:1px solid var(--color-midnight-200,#3b3d60);line-height:1.2;text-align:right;vertical-align:middle;}
                    .mst-dungeon-table thead th{position:sticky;top:0;z-index:1;background:var(--color-midnight-500,#2c2e45);color:var(--color-neutral-100,#ececf1);font-weight:600;text-align:center;}
                    .mst-dungeon-table th:first-child{width:36%;text-align:left;}
                    .mst-dungeon-table th:nth-child(2){width:18%;}
                    .mst-dungeon-table th:nth-child(3),.mst-dungeon-table th:nth-child(4){width:23%;}
                    .mst-dungeon-table tbody th{color:var(--color-neutral-200,#d2d3dc);font-weight:500;}
                    .mst-dungeon-row-cost td:nth-child(n+3){color:var(--color-scarlet-300,#ef8f98);}
                    .mst-dungeon-row-revenue td:nth-child(n+3){color:var(--color-jade-300,#86d7b1);}
                    .mst-dungeon-row-total th,.mst-dungeon-row-total td{border-top:1px solid var(--color-space-400,#7686cc);font-weight:600;}
                    .mst-dungeon-row-profit th,.mst-dungeon-row-profit td{background:var(--color-midnight-500,#2c2e45);color:var(--color-cowbell,#f6c95c);font-weight:600;}
                    @media(max-width:48rem){.mst-ability-preset-controls{min-width:100%;order:3;}.mst-ability-market-time{max-width:calc(100% - 8rem);margin-left:auto;}.mst-ability-upgrade-calculator .mst-ability-table-wrap{max-height:calc(100svh - 16rem);}}
                    @media(max-width:48rem){
                        #mst-toolkit-character-dropdown{position:fixed;top:max(.5rem,env(safe-area-inset-top));right:max(.5rem,env(safe-area-inset-right));min-width:min(15rem,calc(100vw - 1rem));}
                        .mst-equipment-compare-table-wrap{max-height:calc(100svh - 24rem);}
                        .mst-calculator-toolbar{grid-template-columns:repeat(2,minmax(0,1fr));}
                        .mst-calculator-toolbar .mst-calculator-reset{grid-column:1/-1;}
                        .mst-calculator-summary{grid-template-columns:repeat(2,minmax(0,1fr));}
                        .mst-combat-profession-picker{grid-template-columns:repeat(4,minmax(0,1fr));}
                        .mst-calculator-table-wrap{max-height:calc(100svh - 20rem);}
                        .mst-dungeon-toolbar{grid-template-columns:repeat(2,minmax(0,1fr));}
                        .mst-dungeon-summary{grid-template-columns:repeat(2,minmax(0,1fr));}
                        .mst-dungeon-table-wrap{max-height:calc(100svh - 25rem);}
                    }
                    @media(max-width:32rem){.mst-equipment-compare-table-wrap{max-height:calc(100svh - 26rem);}.mst-equipment-compare-table{min-width:100%;}.mst-equipment-compare-table th,.mst-equipment-compare-table td{padding:.3rem .2rem;}}
                `;
            StyleService.ensure('mst-integrated-style', css);
        }

        addTriggerButton() {
            const housePanel = GameUiAdapter.query('housePanel');
            if (!housePanel || document.getElementById('mst-hccp-house-calculator-trigger')) return;

            const targetButton = GameUiAdapter.query('gameButton', housePanel) || housePanel.querySelector('button');
            let buttonContainer = GameUiAdapter.query('houseButtonContainer', housePanel) || targetButton?.parentElement;
            if (!buttonContainer) {
                const title = GameUiAdapter.query('houseTitle', housePanel);
                buttonContainer = document.createElement('div');
                buttonContainer.className = 'mst-hccp-trigger-container';
                title?.insertAdjacentElement('afterend', buttonContainer);
            }

            if (!buttonContainer) return;

            const triggerBtn = document.createElement('button');
            triggerBtn.className = targetButton?.className || 'Button_button__1Fe9z';
            triggerBtn.id = 'mst-hccp-house-calculator-trigger';
            triggerBtn.style.marginLeft = '10px';
            triggerBtn.textContent = i18n.t('trigger');

            triggerBtn.addEventListener('click', async () => this.openCalculator(triggerBtn));

            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.flexWrap = 'wrap';
            buttonContainer.style.gap = '10px';
            triggerBtn.style.marginLeft = targetButton ? '0' : '';
            if (targetButton?.parentNode === buttonContainer) {
                buttonContainer.insertBefore(triggerBtn, targetButton.nextSibling);
            } else {
                buttonContainer.appendChild(triggerBtn);
            }
        }

        async openCalculator(triggerBtn = null) {
            try {
                if (!this.isInitialized) {
                    if (triggerBtn) triggerBtn.textContent = i18n.t('marketLoading');
                    DataHub.initClientDataFromCache();
                    if (!DataHub.hasHouseRoomData()) {
                        throw new Error('initClientData houseRoomDetailMap is not ready');
                    }
                    await marketDataService.load();
                    houseCalculatorUI = new HouseCalculatorUI(houseDetails, houseCalculator, marketDataService);
                    houseCalculatorUI.create();
                    this.isInitialized = true;
                    if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
                    return;
                }

                if (!document.getElementById('mst-hccp-house-calculator')) houseCalculatorUI.create();
            } catch (error) {
                if (triggerBtn) triggerBtn.textContent = i18n.t('trigger');
                console.error('[HCCP] 初始化失败:', error);
                Notifier.alert(i18n.t('initFailed'), 'error');
            }
        }

        observeDOM() {
            if (!CONFIG.isGameSite || this.domObserver) return;
            this.domObserver = utils.observeBody(() => {
                // 检查房屋面板是否存在，以及我们的触发按钮是否不存在。
                if (GameUiAdapter.query('housePanel') && !document.getElementById('mst-hccp-house-calculator-trigger')) {
                    this.addTriggerButton();
                }
            });
            window.addEventListener('beforeunload', () => this.domObserver?.disconnect(), {once: true});
        }

        init() {
            this.initStyles();
            const characterCardFeature = new CharacterCardFeature();
            const combatCalculator = new CombatUpgradeCalculatorFeature();
            const abilityCalculator = new AbilityUpgradeCalculatorFeature(marketDataService);
            const dungeonCalculator = new DungeonProfitCalculatorFeature(marketDataService);
            const combatSimulationService = new CombatSimulationService();
            const equipmentComparisonService = new EquipmentComparisonService(
                marketDataService,
                combatSimulationService
            );
            const equipmentComparison = new EquipmentComparisonFeature(
                marketDataService,
                equipmentComparisonService
            );
            const toolkitMenu = new ToolkitMenuFeature({
                characterCardFeature,
                appController: this,
                combatCalculator,
                abilityCalculator,
                equipmentComparison,
                dungeonCalculator
            });
            window.MWISunrisheToolkit = {
                DataHub,
                CharacterDataService,
                WebSocketService,
                GameNavigationService,
                combatCalculator,
                abilityCalculator,
                equipmentComparison,
                dungeonCalculator
            };
            characterCardFeature.init();
            combatCalculator.init();
            abilityCalculator.init();
            dungeonCalculator.init();
            equipmentComparison.init();
            toolkitMenu.init();
            new ClipboardCartImportFeature().init();
            const languageController = new LanguageController();
            languageController.init();
            this.observeDOM();
        }
    }

    if (CONFIG.isGameSite || CONFIG.isMilkonomySite) {
        new EdsMilkonomyFeature().init();
    }

    if (CONFIG.isGameSite) {
        TemplateRenderer.ready
            .then(() => new AppController().init())
            .catch(error => console.error('[MST] uhtml CDN 加载失败:', error));
    }
})();
