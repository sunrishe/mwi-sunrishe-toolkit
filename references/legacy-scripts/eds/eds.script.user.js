// ==UserScript==
// @name         [银河奶牛]装备数据同步
// @namespace    http://tampermonkey.net/
// @version      1.2.7
// @description  1.在利润网站Milkonomy中同步用户生活装备数据；2.配装页面复制战斗模拟器配装数据。
// @author       Sunrishe
// @website      https://greasyfork.org/zh-CN/scripts/574037
// @website      https://gf.qytechs.cn/zh-CN/scripts/574037
// @match        https://www.milkywayidle.com/game?characterId=*
// @match        https://www.milkywayidlecn.com/game?characterId=*
// @match        https://milkonomy.pages.dev/*
// @match        https://hyhfish.github.io/milkonomy/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=milkywayidle.com
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-body
// @license      MIT
// @homepage     https://github.com/sunrishe/tampermonkey/tree/master/mwi/eds
// ==/UserScript==

(function (sbxWin, window) {
    'use strict';

    // ==================== 配置 ====================
    const hostname = window.location.hostname;
    const domainname = hostname.substring(hostname.lastIndexOf('.', hostname.lastIndexOf('.') - 1) + 1);
    const CONFIG = {
        // WebSocket 事件名
        mwiWsSend: 'mwi-ws:send',
        mwiWsReceived: 'mwi-ws:message-received',
        // GM 存储键名
        mwiMilkonomyPreset: 'mwiMilkonomyPreset',
        // 游戏域名
        characterId: new URLSearchParams(window.location.search).get('characterId'),
        hostname,
        domainname,
        // 网站类型判断
        isGameSite: domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com',
        isMilkonomySite: !(domainname === 'milkywayidle.com' || domainname === 'milkywayidlecn.com'),
        // LocalStorage Keys
        lsPresets: 'player-action-config-presets',
        // 组件样式
        milkonomy: {componentClass: 'mwi-ms-component'}
    };

    // ==================== 工具函数 ====================
    const utils = {
        substrLastSlash(hrid) {
            return hrid?.substring(hrid.lastIndexOf('/') + 1);
        },

        getItemTypeSuffix(type) {
            const suffix = utils.substrLastSlash(type);
            if (suffix.endsWith('_tool')) return 'tool';
            if (suffix.endsWith('_charm')) return 'charm';
            return suffix;
        },

        getReactProps(el) {
            const key = Reflect.ownKeys(el || {}).find(k => k.startsWith('__reactProps$'));
            return key ? el[key]?.children[0]?._owner?.memoizedProps : null;
        },

        getItemByHash(hash) {
            if (!hash || !hash.includes('::')) return null;
            const arr = hash.split('::') ?? [];
            return arr.length !== 4 ? null : {characterId: arr[0], location: arr[1], itemHrid: arr[2], enhancementLevel: parseInt(arr[3])};
        },

        getTextBetween(start, end) {
            let text = '';
            let current = start.nextSibling;

            while (current && current !== end) {
                if (current.nodeType === 3) {
                    text += current.textContent;
                }
                current = current.nextSibling;
            }

            return text;
        }
    };

    // ==================== WebSocket 拦截 ====================
    class WebSocketInterception {
        constructor(targetWindow) {
            this.window = targetWindow;
            this.OriginalWebSocket = this.window.WebSocket;
            this._intercept();
        }

        _intercept() {
            const self = this;
            const OriginalWebSocket = this.OriginalWebSocket;

            function InterceptedWebSocket(...args) {
                const [url] = args;
                const ws = new OriginalWebSocket(...args);

                if (typeof url === 'string' && url.includes(CONFIG.domainname + '/ws')) {
                    ws.send = function (data) {
                        try {
                            self._dispatchEvent(CONFIG.mwiWsSend, data);
                        } catch {}
                        return OriginalWebSocket.prototype.send.call(this, data);
                    };

                    ws.addEventListener('message', event => {
                        try {
                            self._dispatchEvent(CONFIG.mwiWsReceived, event.data);
                        } catch {}
                    });

                    ws.addEventListener('open', () => console.log('[EDS] WebSocket connected'));
                    ws.addEventListener('close', () => console.log('[EDS] WebSocket disconnected'));
                }

                return ws;
            }

            InterceptedWebSocket.prototype = OriginalWebSocket.prototype;
            InterceptedWebSocket.OPEN = OriginalWebSocket.OPEN;
            InterceptedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
            InterceptedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
            InterceptedWebSocket.CLOSED = OriginalWebSocket.CLOSED;

            this.window.WebSocket = InterceptedWebSocket;
            this._patchErrorHandlers();
        }

        _patchErrorHandlers() {
            this.window.addEventListener(
                'error',
                e => {
                    if (e.message?.includes('WebSocket') && e.message?.includes('failed')) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                    }
                },
                true
            );

            this.window.addEventListener('unhandledrejection', e => {
                if (e.reason?.message?.includes('WebSocket')) {
                    e.preventDefault();
                }
            });
        }

        _dispatchEvent(eventName, data) {
            this.window.dispatchEvent(new CustomEvent(eventName, {detail: JSON.parse(data)}));
        }
    }

    // ==================== 游戏网站逻辑 ====================
    class Milkywayidle {
        constructor() {
            this.specialData = {};
            this.ws = new WebSocketInterception(window);
            this._initWsListener();
            this._injectStyle();
            this._initObserver();
        }

        _initWsListener() {
            window.addEventListener(CONFIG.mwiWsReceived, event => {
                try {
                    const data = event.detail || {};
                    if (data.type === 'init_character_data') {
                        console.log('[EDS] 收到init_character_data消息');
                        this.specialData.characterHouseRoomMap = data.characterHouseRoomMap;
                        this.specialData.characterAchievements = data.characterAchievements;
                        MilkonomyPresetConverter.syncToGm(data);
                        console.log('[EDS] 已将转换后的preset存入GM');
                    } else if (data.type === 'house_rooms_updated') {
                        console.log('[EDS] 收到house_rooms_updated消息');
                        this.specialData.characterHouseRoomMap = data.characterHouseRoomMap;
                        MilkonomyPresetConverter.syncToGm(MilkonomyPresetConverter.loadGameData(this.specialData));
                        console.log('[EDS] 已将转换后的preset存入GM');
                    }
                } catch {}
            });
        }

        _injectStyle() {
            GM_addStyle(`
                .EquipmentPanel_buttonContainer__c33hx {
                    display: flex;
                    grid-gap: var(--spacing-xs);
                    gap: var(--spacing-xs);
                }

                .LoadoutsPanel_loadoutsPanel__Gc5VA .LoadoutsPanel_selectedLoadout__1ozGd .LoadoutsPanel_details__3uO1G .LoadoutsPanel_setup__3mazG .LoadoutsPanel_buttonsContainer__8JWnI {
                    display: flex;
                    align-items: center;
                    justify-content: flex-start !important; /* 改成左对齐 */
                    grid-gap: var(--spacing-xs);
                    gap: var(--spacing-xs);
                }

                /* 第一个按钮靠左，后面所有按钮挤到右边 */
                .LoadoutsPanel_buttonsContainer__8JWnI button:first-child {
                    margin-right: auto;
                }
            `);
        }

        _initObserver() {
            const observer = new MutationObserver(() => {
                // 装备面板
                const equipmentPanel = document.querySelector('.EquipmentPanel_equipmentPanel__29pDG');
                if (equipmentPanel) this._initCopyMilkonomyBtn(equipmentPanel);

                // 配装编辑面板
                const loadoutsPanel = document.querySelector('.LoadoutsPanel_selectedLoadout__1ozGd');
                if (loadoutsPanel) this._initCopyCombatSimulatorBtn(loadoutsPanel);
            });
            observer.observe(document.body, {childList: true, subtree: true});
            window.addEventListener('beforeunload', () => observer.disconnect());
        }

        _initCopyMilkonomyBtn(equipmentPanel) {
            if (equipmentPanel.querySelector('.' + CONFIG.milkonomy.componentClass)) return;

            const buttonContainer = equipmentPanel.querySelector('.EquipmentPanel_buttonContainer__c33hx');
            const buttons = buttonContainer.querySelectorAll('button');
            const lastButton = buttons[buttons.length - 1];

            this.copyMilkonomyBtn = lastButton.cloneNode(true);
            this.copyMilkonomyBtn.textContent = '复制Milkonomy数据';
            this.copyMilkonomyBtn.title = '在Milkonomy网站预设方案编辑页面点导入按钮填入数据';
            this.copyMilkonomyBtn.classList.add(CONFIG.milkonomy.componentClass);
            this.copyMilkonomyBtn.onclick = () => {
                const gameData = MilkonomyPresetConverter.loadGameData(this.specialData);
                const _preset = MilkonomyPresetConverter.syncToGm(gameData);
                const preset = MilkonomyPresetConverter.filterConvertData(_preset);
                GM_setClipboard(JSON.stringify(preset));
            };
            buttonContainer.appendChild(this.copyMilkonomyBtn);
        }

        _initCopyCombatSimulatorBtn(loadoutsPanel) {
            if (loadoutsPanel.querySelector('.' + CONFIG.milkonomy.componentClass)) return;

            const detailsEl = loadoutsPanel.querySelector('.LoadoutsPanel_details__3uO1G');
            if (!this._isCombatLoadout(detailsEl)) return;

            const buttonContainer = loadoutsPanel.querySelector('.LoadoutsPanel_buttonsContainer__8JWnI');
            const buttons = buttonContainer.querySelectorAll('button');
            const lastButton = buttons[buttons.length - 1];

            this.copyCombatSimulatorBtn = lastButton.cloneNode(true);
            this.copyCombatSimulatorBtn.textContent = '导出配装';
            this.copyCombatSimulatorBtn.title = '导出战斗模拟器所需数据';
            this.copyCombatSimulatorBtn.classList.add('Button_success__6d6kU');
            this.copyCombatSimulatorBtn.classList.add(CONFIG.milkonomy.componentClass);
            this.copyCombatSimulatorBtn.onclick = () => this._handleCopyCombatSimulator(detailsEl);
            lastButton.before(this.copyCombatSimulatorBtn);
        }

        _isCombatLoadout(detailsEl) {
            const useEl = detailsEl?.querySelector('.LoadoutsPanel_metadata__1TXX2 svg use');
            return useEl?.getAttribute('href')?.split('#')?.[1] === 'combat';
        }

        _getLoadoutName(detailsEl) {
            const titleEl = detailsEl.querySelector('.LoadoutsPanel_metadata__1TXX2');
            const svgEl = titleEl.querySelector('svg');
            const updateBtnEl = titleEl.querySelector('.Button_button__1Fe9z');
            return utils.getTextBetween(svgEl, updateBtnEl)?.trim();
        }

        _handleCopyCombatSimulator(detailsEl) {
            const name = this._getLoadoutName(detailsEl);
            const data = utils.getReactProps(detailsEl) || {};
            const loadoutInfo = Object.values(data.characterLoadoutDict || {}).find(v => v.name === name);
            if (!loadoutInfo) {
                alert('未找到配装方案');
                return;
            }
            const otherInfo = {
                characterSkills: [...data.characterSkillMap.values()],
                characterAbilities: [...data.characterAbilityMap.values()],
                characterHouseRoomMap: this.specialData.characterHouseRoomMap,
                characterAchievements: this.specialData.characterAchievements
            };
            const convert = CombatSimulatorConverter.convert(loadoutInfo, otherInfo);
            GM_setClipboard(JSON.stringify(convert));
        }
    }

    class CombatSimulatorConverter {
        static SKILLS = ['stamina', 'intelligence', 'attack', 'defense', 'melee', 'ranged', 'magic'];

        static convert(loadoutInfo, {characterSkills, characterHouseRoomMap, characterAbilities, characterAchievements}) {
            return {
                player: {...this._getCombatLevelMap(characterSkills), equipment: this._getEquipments(loadoutInfo.wearableMap)},
                food: {'/action_types/combat': this._getFoods(loadoutInfo.foodItemHrids)},
                drinks: {'/action_types/combat': this._getDrinks(loadoutInfo.drinkItemHrids)},
                abilities: this._getAbilities(loadoutInfo.abilityMap, characterAbilities),
                triggerMap: this._getTriggerMap(loadoutInfo.abilityCombatTriggersMap, loadoutInfo.consumableCombatTriggersMap),
                houseRooms: this._getHouseRoomMap(characterHouseRoomMap),
                achievements: this._getAchievementMap(characterAchievements)
            };
        }

        static _getCombatLevelMap(characterSkills) {
            const res = {};
            for (const skill of this.SKILLS) {
                res[skill + 'Level'] = characterSkills?.find(v => v.skillHrid === '/skills/' + skill)?.level || 0;
            }
            return res;
        }

        static _getEquipments(wearableMap) {
            const arr = [];
            Object.entries(wearableMap)?.forEach(([loc, hash]) => {
                const item = utils.getItemByHash(hash);
                if (item) arr.push({itemLocationHrid: loc, itemHrid: item.itemHrid, enhancementLevel: item.enhancementLevel});
            });
            return arr;
        }

        static _getFoods(itemHrids) {
            return itemHrids?.map(hrid => ({itemHrid: hrid})) || [];
        }

        static _getDrinks(itemHrids) {
            return itemHrids?.map(hrid => ({itemHrid: hrid})) || [];
        }

        static _getAbilities(abilityMap, characterAbilities) {
            const arr = [];
            Object.entries(abilityMap)?.forEach(([, hrid]) => {
                arr.push({abilityHrid: hrid, level: characterAbilities?.find(v => v.abilityHrid === hrid)?.level || 0});
            });
            return arr;
        }

        static _getTriggerMap(abilityCombatTriggersMap, consumableCombatTriggersMap) {
            return {...abilityCombatTriggersMap, ...consumableCombatTriggersMap};
        }

        static _getHouseRoomMap(characterHouseRoomMap) {
            const res = {};
            Object.entries(characterHouseRoomMap)?.forEach(([hrid, data]) => {
                res[hrid] = data.level;
            });
            return res;
        }

        static _getAchievementMap(characterAchievements) {
            const res = {};
            characterAchievements?.forEach(v => {
                res[v.achievementHrid] = v.isCompleted;
            });
            return res;
        }
    }

    // ==================== Milkonomy 网站逻辑 ====================
    class Milkonomy {
        constructor() {
            this._observer = null;
            this._initValueChangeListener();
            this._initObserver();
        }

        _initValueChangeListener() {
            GM_addValueChangeListener(CONFIG.mwiMilkonomyPreset, (_name, _oldValue, newValue, remote) => {
                if (remote && newValue) {
                    console.log('[EDS] 配装数据发生变化', newValue);
                }
            });
        }

        _initObserver() {
            this._observer = new MutationObserver(() => {
                const gameInfo = document.querySelector('.game-info');
                if (gameInfo && !gameInfo.querySelector('.' + CONFIG.milkonomy.componentClass)) {
                    this._addSyncButton(gameInfo);
                }
            });

            this._observer.observe(document.body, {childList: true, subtree: true});
            window.addEventListener('beforeunload', () => this._observer.disconnect());
        }

        _addSyncButton(gameInfo) {
            const syncBtn = document.createElement('button');
            syncBtn.className = CONFIG.milkonomy.componentClass + ' el-button el-button--primary';
            syncBtn.style = 'margin-left: 0.5rem;';
            syncBtn.innerHTML = '<span>同步配装</span>';
            syncBtn.onclick = () => this._doSync();
            gameInfo.querySelector('.items-center > .items-center')?.after(syncBtn);
        }

        _doSync() {
            const _preset = GM_getValue(CONFIG.mwiMilkonomyPreset);
            if (!_preset || !('name' in _preset)) return;
            const preset = MilkonomyPresetConverter.filterConvertData(_preset);
            const presets = JSON.parse(window.localStorage.getItem(CONFIG.lsPresets)) || [];
            let index = presets.findIndex(v => v.name === preset.name);

            if (index === -1) {
                presets.push(preset);
                index = presets.length - 1;
            } else {
                presets[index] = preset;
            }

            window.localStorage.setItem(CONFIG.lsPresets, JSON.stringify(presets));
            window.localStorage.setItem('player-action-preset-index', index);
            setTimeout(() => window.location.reload(), 500);
        }
    }

    // ==================== 配装数据转换器 ====================
    class MilkonomyPresetConverter {
        // 生活装备配置（只包含需要同步的装备）
        static INCLUDE_ITEMS = {
            '/items/advanced_alchemy_charm': {
                hrid: '/items/advanced_alchemy_charm',
                name: '高级炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 50, skillName: '炼金'}]
            },
            '/items/advanced_brewing_charm': {
                hrid: '/items/advanced_brewing_charm',
                name: '高级冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 50, skillName: '冲泡'}]
            },
            '/items/advanced_cheesesmithing_charm': {
                hrid: '/items/advanced_cheesesmithing_charm',
                name: '高级奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 50, skillName: '奶酪锻造'}]
            },
            '/items/advanced_cooking_charm': {
                hrid: '/items/advanced_cooking_charm',
                name: '高级烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 50, skillName: '烹饪'}]
            },
            '/items/advanced_crafting_charm': {
                hrid: '/items/advanced_crafting_charm',
                name: '高级制作护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 50, skillName: '制作'}]
            },
            '/items/advanced_enhancing_charm': {
                hrid: '/items/advanced_enhancing_charm',
                name: '高级强化护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 50, skillName: '强化'}]
            },
            '/items/advanced_foraging_charm': {
                hrid: '/items/advanced_foraging_charm',
                name: '高级采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 50, skillName: '采摘'}]
            },
            '/items/advanced_milking_charm': {
                hrid: '/items/advanced_milking_charm',
                name: '高级挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/milking', level: 50, skillName: '挤奶'}]
            },
            '/items/advanced_tailoring_charm': {
                hrid: '/items/advanced_tailoring_charm',
                name: '高级缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 50, skillName: '缝纫'}]
            },
            '/items/advanced_woodcutting_charm': {
                hrid: '/items/advanced_woodcutting_charm',
                name: '高级伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 40,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 50, skillName: '伐木'}]
            },
            '/items/alchemists_bottoms': {
                hrid: '/items/alchemists_bottoms',
                name: '炼金师下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
            },
            '/items/alchemists_top': {
                hrid: '/items/alchemists_top',
                name: '炼金师上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
            },
            '/items/artificer_cape': {
                hrid: '/items/artificer_cape',
                name: '工匠披风',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/cheesesmithing', level: 80, skillName: '奶酪锻造'},
                    {skillHrid: '/skills/crafting', level: 80, skillName: '制作'},
                    {skillHrid: '/skills/tailoring', level: 80, skillName: '缝纫'}
                ]
            },
            '/items/artificer_cape_refined': {
                hrid: '/items/artificer_cape_refined',
                name: '工匠披风 ★',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/cheesesmithing', level: 100, skillName: '奶酪锻造'},
                    {skillHrid: '/skills/crafting', level: 100, skillName: '制作'},
                    {skillHrid: '/skills/tailoring', level: 100, skillName: '缝纫'}
                ]
            },
            '/items/azure_alembic': {
                hrid: '/items/azure_alembic',
                name: '蔚蓝蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 20, skillName: '炼金'}]
            },
            '/items/azure_brush': {
                hrid: '/items/azure_brush',
                name: '蔚蓝刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/milking', level: 20, skillName: '挤奶'}]
            },
            '/items/azure_chisel': {
                hrid: '/items/azure_chisel',
                name: '蔚蓝凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 20, skillName: '制作'}]
            },
            '/items/azure_enhancer': {
                hrid: '/items/azure_enhancer',
                name: '蔚蓝强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 20, skillName: '强化'}]
            },
            '/items/azure_hammer': {
                hrid: '/items/azure_hammer',
                name: '蔚蓝锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 20, skillName: '奶酪锻造'}]
            },
            '/items/azure_hatchet': {
                hrid: '/items/azure_hatchet',
                name: '蔚蓝斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 20, skillName: '伐木'}]
            },
            '/items/azure_needle': {
                hrid: '/items/azure_needle',
                name: '蔚蓝针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 20, skillName: '缝纫'}]
            },
            '/items/azure_pot': {
                hrid: '/items/azure_pot',
                name: '蔚蓝壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 20, skillName: '冲泡'}]
            },
            '/items/azure_shears': {
                hrid: '/items/azure_shears',
                name: '蔚蓝剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 20, skillName: '采摘'}]
            },
            '/items/azure_spatula': {
                hrid: '/items/azure_spatula',
                name: '蔚蓝锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 20, skillName: '烹饪'}]
            },
            '/items/basic_alchemy_charm': {
                hrid: '/items/basic_alchemy_charm',
                name: '基础炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 25, skillName: '炼金'}]
            },
            '/items/basic_brewing_charm': {
                hrid: '/items/basic_brewing_charm',
                name: '基础冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 25, skillName: '冲泡'}]
            },
            '/items/basic_cheesesmithing_charm': {
                hrid: '/items/basic_cheesesmithing_charm',
                name: '基础奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 25, skillName: '奶酪锻造'}]
            },
            '/items/basic_cooking_charm': {
                hrid: '/items/basic_cooking_charm',
                name: '基础烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 25, skillName: '烹饪'}]
            },
            '/items/basic_crafting_charm': {
                hrid: '/items/basic_crafting_charm',
                name: '基础制作护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 25, skillName: '制作'}]
            },
            '/items/basic_enhancing_charm': {
                hrid: '/items/basic_enhancing_charm',
                name: '基础强化护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 25, skillName: '强化'}]
            },
            '/items/basic_foraging_charm': {
                hrid: '/items/basic_foraging_charm',
                name: '基础采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 25, skillName: '采摘'}]
            },
            '/items/basic_milking_charm': {
                hrid: '/items/basic_milking_charm',
                name: '基础挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/milking', level: 25, skillName: '挤奶'}]
            },
            '/items/basic_tailoring_charm': {
                hrid: '/items/basic_tailoring_charm',
                name: '基础缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 25, skillName: '缝纫'}]
            },
            '/items/basic_woodcutting_charm': {
                hrid: '/items/basic_woodcutting_charm',
                name: '基础伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 20,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 25, skillName: '伐木'}]
            },
            '/items/brewers_bottoms': {
                hrid: '/items/brewers_bottoms',
                name: '饮品师下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
            },
            '/items/brewers_top': {
                hrid: '/items/brewers_top',
                name: '饮品师上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
            },
            '/items/burble_alembic': {
                hrid: '/items/burble_alembic',
                name: '深紫蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 35, skillName: '炼金'}]
            },
            '/items/burble_brush': {
                hrid: '/items/burble_brush',
                name: '深紫刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/milking', level: 35, skillName: '挤奶'}]
            },
            '/items/burble_chisel': {
                hrid: '/items/burble_chisel',
                name: '深紫凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 35, skillName: '制作'}]
            },
            '/items/burble_enhancer': {
                hrid: '/items/burble_enhancer',
                name: '深紫强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 35, skillName: '强化'}]
            },
            '/items/burble_hammer': {
                hrid: '/items/burble_hammer',
                name: '深紫锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 35, skillName: '奶酪锻造'}]
            },
            '/items/burble_hatchet': {
                hrid: '/items/burble_hatchet',
                name: '深紫斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 35, skillName: '伐木'}]
            },
            '/items/burble_needle': {
                hrid: '/items/burble_needle',
                name: '深紫针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 35, skillName: '缝纫'}]
            },
            '/items/burble_pot': {
                hrid: '/items/burble_pot',
                name: '深紫壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 35, skillName: '冲泡'}]
            },
            '/items/burble_shears': {
                hrid: '/items/burble_shears',
                name: '深紫剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 35, skillName: '采摘'}]
            },
            '/items/burble_spatula': {
                hrid: '/items/burble_spatula',
                name: '深紫锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 35,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 35, skillName: '烹饪'}]
            },
            '/items/celestial_alembic': {
                hrid: '/items/celestial_alembic',
                name: '星空蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 90, skillName: '炼金'}]
            },
            '/items/celestial_brush': {
                hrid: '/items/celestial_brush',
                name: '星空刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
            },
            '/items/celestial_chisel': {
                hrid: '/items/celestial_chisel',
                name: '星空凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
            },
            '/items/celestial_enhancer': {
                hrid: '/items/celestial_enhancer',
                name: '星空强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
            },
            '/items/celestial_hammer': {
                hrid: '/items/celestial_hammer',
                name: '星空锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
            },
            '/items/celestial_hatchet': {
                hrid: '/items/celestial_hatchet',
                name: '星空斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
            },
            '/items/celestial_needle': {
                hrid: '/items/celestial_needle',
                name: '星空针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
            },
            '/items/celestial_pot': {
                hrid: '/items/celestial_pot',
                name: '星空壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 90, skillName: '冲泡'}]
            },
            '/items/celestial_shears': {
                hrid: '/items/celestial_shears',
                name: '星空剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
            },
            '/items/celestial_spatula': {
                hrid: '/items/celestial_spatula',
                name: '星空锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
            },
            '/items/chance_cape': {
                hrid: '/items/chance_cape',
                name: '机缘披风',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/alchemy', level: 80, skillName: '炼金'},
                    {skillHrid: '/skills/enhancing', level: 80, skillName: '强化'}
                ]
            },
            '/items/chance_cape_refined': {
                hrid: '/items/chance_cape_refined',
                name: '机缘披风 ★',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/alchemy', level: 100, skillName: '炼金'},
                    {skillHrid: '/skills/enhancing', level: 100, skillName: '强化'}
                ]
            },
            '/items/cheese_alembic': {
                hrid: '/items/cheese_alembic',
                name: '奶酪蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 1, skillName: '炼金'}]
            },
            '/items/cheese_brush': {
                hrid: '/items/cheese_brush',
                name: '奶酪刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/milking', level: 1, skillName: '挤奶'}]
            },
            '/items/cheese_chisel': {
                hrid: '/items/cheese_chisel',
                name: '奶酪凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 1, skillName: '制作'}]
            },
            '/items/cheese_enhancer': {
                hrid: '/items/cheese_enhancer',
                name: '奶酪强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 1, skillName: '强化'}]
            },
            '/items/cheese_hammer': {
                hrid: '/items/cheese_hammer',
                name: '奶酪锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 1, skillName: '奶酪锻造'}]
            },
            '/items/cheese_hatchet': {
                hrid: '/items/cheese_hatchet',
                name: '奶酪斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 1, skillName: '伐木'}]
            },
            '/items/cheese_needle': {
                hrid: '/items/cheese_needle',
                name: '奶酪针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 1, skillName: '缝纫'}]
            },
            '/items/cheese_pot': {
                hrid: '/items/cheese_pot',
                name: '奶酪壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 1, skillName: '冲泡'}]
            },
            '/items/cheese_shears': {
                hrid: '/items/cheese_shears',
                name: '奶酪剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 1, skillName: '采摘'}]
            },
            '/items/cheese_spatula': {
                hrid: '/items/cheese_spatula',
                name: '奶酪锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 1, skillName: '烹饪'}]
            },
            '/items/cheesemakers_bottoms': {
                hrid: '/items/cheesemakers_bottoms',
                name: '奶酪师下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
            },
            '/items/cheesemakers_top': {
                hrid: '/items/cheesemakers_top',
                name: '奶酪师上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 90, skillName: '奶酪锻造'}]
            },
            '/items/chefs_bottoms': {
                hrid: '/items/chefs_bottoms',
                name: '厨师下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
            },
            '/items/chefs_top': {
                hrid: '/items/chefs_top',
                name: '厨师上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 90, skillName: '烹饪'}]
            },
            '/items/collectors_boots': {
                hrid: '/items/collectors_boots',
                name: '收藏家靴',
                type: '/equipment_types/feet',
                itemLevel: 60,
                levelRequirements: [
                    {skillHrid: '/skills/milking', level: 60, skillName: '挤奶'},
                    {skillHrid: '/skills/foraging', level: 60, skillName: '采摘'},
                    {skillHrid: '/skills/woodcutting', level: 60, skillName: '伐木'}
                ]
            },
            '/items/crafters_bottoms': {
                hrid: '/items/crafters_bottoms',
                name: '工匠下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
            },
            '/items/crafters_top': {
                hrid: '/items/crafters_top',
                name: '工匠上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 90, skillName: '制作'}]
            },
            '/items/crimson_alembic': {
                hrid: '/items/crimson_alembic',
                name: '绛红蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 50, skillName: '炼金'}]
            },
            '/items/crimson_brush': {
                hrid: '/items/crimson_brush',
                name: '绛红刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/milking', level: 50, skillName: '挤奶'}]
            },
            '/items/crimson_chisel': {
                hrid: '/items/crimson_chisel',
                name: '绛红凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 50, skillName: '制作'}]
            },
            '/items/crimson_enhancer': {
                hrid: '/items/crimson_enhancer',
                name: '绛红强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 50, skillName: '强化'}]
            },
            '/items/crimson_hammer': {
                hrid: '/items/crimson_hammer',
                name: '绛红锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 50, skillName: '奶酪锻造'}]
            },
            '/items/crimson_hatchet': {
                hrid: '/items/crimson_hatchet',
                name: '绛红斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 50, skillName: '伐木'}]
            },
            '/items/crimson_needle': {
                hrid: '/items/crimson_needle',
                name: '绛红针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 50, skillName: '缝纫'}]
            },
            '/items/crimson_pot': {
                hrid: '/items/crimson_pot',
                name: '绛红壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 50, skillName: '冲泡'}]
            },
            '/items/crimson_shears': {
                hrid: '/items/crimson_shears',
                name: '绛红剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 50, skillName: '采摘'}]
            },
            '/items/crimson_spatula': {
                hrid: '/items/crimson_spatula',
                name: '绛红锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 50,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 50, skillName: '烹饪'}]
            },
            '/items/culinary_cape': {
                hrid: '/items/culinary_cape',
                name: '厨师披风',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/cooking', level: 80, skillName: '烹饪'},
                    {skillHrid: '/skills/brewing', level: 80, skillName: '冲泡'}
                ]
            },
            '/items/culinary_cape_refined': {
                hrid: '/items/culinary_cape_refined',
                name: '厨师披风 ★',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/cooking', level: 100, skillName: '烹饪'},
                    {skillHrid: '/skills/brewing', level: 100, skillName: '冲泡'}
                ]
            },
            '/items/dairyhands_bottoms': {
                hrid: '/items/dairyhands_bottoms',
                name: '挤奶工下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
            },
            '/items/dairyhands_top': {
                hrid: '/items/dairyhands_top',
                name: '挤奶工上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/milking', level: 90, skillName: '挤奶'}]
            },
            '/items/earrings_of_essence_find': {
                hrid: '/items/earrings_of_essence_find',
                name: '精华发现耳环',
                type: '/equipment_types/earrings',
                itemLevel: 30,
                levelRequirements: []
            },
            '/items/earrings_of_gathering': {
                hrid: '/items/earrings_of_gathering',
                name: '采集耳环',
                type: '/equipment_types/earrings',
                itemLevel: 15,
                levelRequirements: []
            },
            '/items/earrings_of_rare_find': {
                hrid: '/items/earrings_of_rare_find',
                name: '稀有发现耳环',
                type: '/equipment_types/earrings',
                itemLevel: 60,
                levelRequirements: []
            },
            '/items/enchanted_gloves': {
                hrid: '/items/enchanted_gloves',
                name: '附魔手套',
                type: '/equipment_types/hands',
                itemLevel: 60,
                levelRequirements: [
                    {skillHrid: '/skills/alchemy', level: 60, skillName: '炼金'},
                    {skillHrid: '/skills/enhancing', level: 60, skillName: '强化'}
                ]
            },
            '/items/enhancers_bottoms': {
                hrid: '/items/enhancers_bottoms',
                name: '强化师下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
            },
            '/items/enhancers_top': {
                hrid: '/items/enhancers_top',
                name: '强化师上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 90, skillName: '强化'}]
            },
            '/items/expert_alchemy_charm': {
                hrid: '/items/expert_alchemy_charm',
                name: '专家炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 75, skillName: '炼金'}]
            },
            '/items/expert_brewing_charm': {
                hrid: '/items/expert_brewing_charm',
                name: '专家冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 75, skillName: '冲泡'}]
            },
            '/items/expert_cheesesmithing_charm': {
                hrid: '/items/expert_cheesesmithing_charm',
                name: '专家奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 75, skillName: '奶酪锻造'}]
            },
            '/items/expert_cooking_charm': {
                hrid: '/items/expert_cooking_charm',
                name: '专家烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 75, skillName: '烹饪'}]
            },
            '/items/expert_crafting_charm': {
                hrid: '/items/expert_crafting_charm',
                name: '专家制作护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 75, skillName: '制作'}]
            },
            '/items/expert_enhancing_charm': {
                hrid: '/items/expert_enhancing_charm',
                name: '专家强化护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 75, skillName: '强化'}]
            },
            '/items/expert_foraging_charm': {
                hrid: '/items/expert_foraging_charm',
                name: '专家采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 75, skillName: '采摘'}]
            },
            '/items/expert_milking_charm': {
                hrid: '/items/expert_milking_charm',
                name: '专家挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/milking', level: 75, skillName: '挤奶'}]
            },
            '/items/expert_tailoring_charm': {
                hrid: '/items/expert_tailoring_charm',
                name: '专家缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 75, skillName: '缝纫'}]
            },
            '/items/expert_woodcutting_charm': {
                hrid: '/items/expert_woodcutting_charm',
                name: '专家伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 60,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 75, skillName: '伐木'}]
            },
            '/items/eye_watch': {
                hrid: '/items/eye_watch',
                name: '掌上监工',
                type: '/equipment_types/off_hand',
                itemLevel: 60,
                levelRequirements: [
                    {skillHrid: '/skills/cheesesmithing', level: 60, skillName: '奶酪锻造'},
                    {skillHrid: '/skills/crafting', level: 60, skillName: '制作'},
                    {skillHrid: '/skills/tailoring', level: 60, skillName: '缝纫'}
                ]
            },
            '/items/foragers_bottoms': {
                hrid: '/items/foragers_bottoms',
                name: '采摘者下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
            },
            '/items/foragers_top': {
                hrid: '/items/foragers_top',
                name: '采摘者上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 90, skillName: '采摘'}]
            },
            '/items/gatherer_cape': {
                hrid: '/items/gatherer_cape',
                name: '采集者披风',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/milking', level: 80, skillName: '挤奶'},
                    {skillHrid: '/skills/foraging', level: 80, skillName: '采摘'},
                    {skillHrid: '/skills/woodcutting', level: 80, skillName: '伐木'}
                ]
            },
            '/items/gatherer_cape_refined': {
                hrid: '/items/gatherer_cape_refined',
                name: '采集者披风 ★',
                type: '/equipment_types/back',
                itemLevel: 80,
                levelRequirements: [
                    {skillHrid: '/skills/milking', level: 100, skillName: '挤奶'},
                    {skillHrid: '/skills/foraging', level: 100, skillName: '采摘'},
                    {skillHrid: '/skills/woodcutting', level: 100, skillName: '伐木'}
                ]
            },
            '/items/grandmaster_alchemy_charm': {
                hrid: '/items/grandmaster_alchemy_charm',
                name: '宗师炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 125, skillName: '炼金'}]
            },
            '/items/grandmaster_brewing_charm': {
                hrid: '/items/grandmaster_brewing_charm',
                name: '宗师冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 125, skillName: '冲泡'}]
            },
            '/items/grandmaster_cheesesmithing_charm': {
                hrid: '/items/grandmaster_cheesesmithing_charm',
                name: '宗师奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 125, skillName: '奶酪锻造'}]
            },
            '/items/grandmaster_cooking_charm': {
                hrid: '/items/grandmaster_cooking_charm',
                name: '宗师烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 125, skillName: '烹饪'}]
            },
            '/items/grandmaster_crafting_charm': {
                hrid: '/items/grandmaster_crafting_charm',
                name: '宗师制作护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 125, skillName: '制作'}]
            },
            '/items/grandmaster_enhancing_charm': {
                hrid: '/items/grandmaster_enhancing_charm',
                name: '宗师强化护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 125, skillName: '强化'}]
            },
            '/items/grandmaster_foraging_charm': {
                hrid: '/items/grandmaster_foraging_charm',
                name: '宗师采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 125, skillName: '采摘'}]
            },
            '/items/grandmaster_milking_charm': {
                hrid: '/items/grandmaster_milking_charm',
                name: '宗师挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/milking', level: 125, skillName: '挤奶'}]
            },
            '/items/grandmaster_tailoring_charm': {
                hrid: '/items/grandmaster_tailoring_charm',
                name: '宗师缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 125, skillName: '缝纫'}]
            },
            '/items/grandmaster_woodcutting_charm': {
                hrid: '/items/grandmaster_woodcutting_charm',
                name: '宗师伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 100,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 125, skillName: '伐木'}]
            },
            '/items/guzzling_pouch': {
                hrid: '/items/guzzling_pouch',
                name: '暴饮之囊',
                type: '/equipment_types/pouch',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/total_level', level: 1250, skillName: '总等级'}]
            },
            '/items/holy_alembic': {
                hrid: '/items/holy_alembic',
                name: '神圣蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 80, skillName: '炼金'}]
            },
            '/items/holy_brush': {
                hrid: '/items/holy_brush',
                name: '神圣刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/milking', level: 80, skillName: '挤奶'}]
            },
            '/items/holy_chisel': {
                hrid: '/items/holy_chisel',
                name: '神圣凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 80, skillName: '制作'}]
            },
            '/items/holy_enhancer': {
                hrid: '/items/holy_enhancer',
                name: '神圣强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 80, skillName: '强化'}]
            },
            '/items/holy_hammer': {
                hrid: '/items/holy_hammer',
                name: '神圣锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 80, skillName: '奶酪锻造'}]
            },
            '/items/holy_hatchet': {
                hrid: '/items/holy_hatchet',
                name: '神圣斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 80, skillName: '伐木'}]
            },
            '/items/holy_needle': {
                hrid: '/items/holy_needle',
                name: '神圣针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 80, skillName: '缝纫'}]
            },
            '/items/holy_pot': {
                hrid: '/items/holy_pot',
                name: '神圣壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 80, skillName: '冲泡'}]
            },
            '/items/holy_shears': {
                hrid: '/items/holy_shears',
                name: '神圣剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 80, skillName: '采摘'}]
            },
            '/items/holy_spatula': {
                hrid: '/items/holy_spatula',
                name: '神圣锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 80, skillName: '烹饪'}]
            },
            '/items/lumberjacks_bottoms': {
                hrid: '/items/lumberjacks_bottoms',
                name: '伐木工下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
            },
            '/items/lumberjacks_top': {
                hrid: '/items/lumberjacks_top',
                name: '伐木工上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 90, skillName: '伐木'}]
            },
            '/items/master_alchemy_charm': {
                hrid: '/items/master_alchemy_charm',
                name: '大师炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 100, skillName: '炼金'}]
            },
            '/items/master_brewing_charm': {
                hrid: '/items/master_brewing_charm',
                name: '大师冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 100, skillName: '冲泡'}]
            },
            '/items/master_cheesesmithing_charm': {
                hrid: '/items/master_cheesesmithing_charm',
                name: '大师奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 100, skillName: '奶酪锻造'}]
            },
            '/items/master_cooking_charm': {
                hrid: '/items/master_cooking_charm',
                name: '大师烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 100, skillName: '烹饪'}]
            },
            '/items/master_crafting_charm': {
                hrid: '/items/master_crafting_charm',
                name: '大师制作护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 100, skillName: '制作'}]
            },
            '/items/master_enhancing_charm': {
                hrid: '/items/master_enhancing_charm',
                name: '大师强化护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 100, skillName: '强化'}]
            },
            '/items/master_foraging_charm': {
                hrid: '/items/master_foraging_charm',
                name: '大师采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 100, skillName: '采摘'}]
            },
            '/items/master_milking_charm': {
                hrid: '/items/master_milking_charm',
                name: '大师挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/milking', level: 100, skillName: '挤奶'}]
            },
            '/items/master_tailoring_charm': {
                hrid: '/items/master_tailoring_charm',
                name: '大师缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 100, skillName: '缝纫'}]
            },
            '/items/master_woodcutting_charm': {
                hrid: '/items/master_woodcutting_charm',
                name: '大师伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 80,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 100, skillName: '伐木'}]
            },
            '/items/necklace_of_efficiency': {
                hrid: '/items/necklace_of_efficiency',
                name: '效率项链',
                type: '/equipment_types/neck',
                itemLevel: 30,
                levelRequirements: []
            },
            '/items/necklace_of_speed': {
                hrid: '/items/necklace_of_speed',
                name: '速度项链',
                type: '/equipment_types/neck',
                itemLevel: 75,
                levelRequirements: []
            },
            '/items/necklace_of_wisdom': {
                hrid: '/items/necklace_of_wisdom',
                name: '经验项链',
                type: '/equipment_types/neck',
                itemLevel: 60,
                levelRequirements: []
            },
            '/items/philosophers_earrings': {
                hrid: '/items/philosophers_earrings',
                name: '贤者耳环',
                type: '/equipment_types/earrings',
                itemLevel: 90,
                levelRequirements: []
            },
            '/items/philosophers_necklace': {
                hrid: '/items/philosophers_necklace',
                name: '贤者项链',
                type: '/equipment_types/neck',
                itemLevel: 90,
                levelRequirements: []
            },
            '/items/philosophers_ring': {
                hrid: '/items/philosophers_ring',
                name: '贤者戒指',
                type: '/equipment_types/ring',
                itemLevel: 90,
                levelRequirements: []
            },
            '/items/rainbow_alembic': {
                hrid: '/items/rainbow_alembic',
                name: '彩虹蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 65, skillName: '炼金'}]
            },
            '/items/rainbow_brush': {
                hrid: '/items/rainbow_brush',
                name: '彩虹刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/milking', level: 65, skillName: '挤奶'}]
            },
            '/items/rainbow_chisel': {
                hrid: '/items/rainbow_chisel',
                name: '彩虹凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 65, skillName: '制作'}]
            },
            '/items/rainbow_enhancer': {
                hrid: '/items/rainbow_enhancer',
                name: '彩虹强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 65, skillName: '强化'}]
            },
            '/items/rainbow_hammer': {
                hrid: '/items/rainbow_hammer',
                name: '彩虹锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 65, skillName: '奶酪锻造'}]
            },
            '/items/rainbow_hatchet': {
                hrid: '/items/rainbow_hatchet',
                name: '彩虹斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 65, skillName: '伐木'}]
            },
            '/items/rainbow_needle': {
                hrid: '/items/rainbow_needle',
                name: '彩虹针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 65, skillName: '缝纫'}]
            },
            '/items/rainbow_pot': {
                hrid: '/items/rainbow_pot',
                name: '彩虹壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 65, skillName: '冲泡'}]
            },
            '/items/rainbow_shears': {
                hrid: '/items/rainbow_shears',
                name: '彩虹剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 65, skillName: '采摘'}]
            },
            '/items/rainbow_spatula': {
                hrid: '/items/rainbow_spatula',
                name: '彩虹锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 65,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 65, skillName: '烹饪'}]
            },
            '/items/red_culinary_hat': {
                hrid: '/items/red_culinary_hat',
                name: '红色厨师帽',
                type: '/equipment_types/head',
                itemLevel: 60,
                levelRequirements: [
                    {skillHrid: '/skills/cooking', level: 60, skillName: '烹饪'},
                    {skillHrid: '/skills/brewing', level: 60, skillName: '冲泡'}
                ]
            },
            '/items/ring_of_essence_find': {
                hrid: '/items/ring_of_essence_find',
                name: '精华发现戒指',
                type: '/equipment_types/ring',
                itemLevel: 30,
                levelRequirements: []
            },
            '/items/ring_of_gathering': {
                hrid: '/items/ring_of_gathering',
                name: '采集戒指',
                type: '/equipment_types/ring',
                itemLevel: 15,
                levelRequirements: []
            },
            '/items/ring_of_rare_find': {
                hrid: '/items/ring_of_rare_find',
                name: '稀有发现戒指',
                type: '/equipment_types/ring',
                itemLevel: 60,
                levelRequirements: []
            },
            '/items/tailors_bottoms': {
                hrid: '/items/tailors_bottoms',
                name: '裁缝下装',
                type: '/equipment_types/legs',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
            },
            '/items/tailors_top': {
                hrid: '/items/tailors_top',
                name: '裁缝上衣',
                type: '/equipment_types/body',
                itemLevel: 90,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 90, skillName: '缝纫'}]
            },
            '/items/trainee_alchemy_charm': {
                hrid: '/items/trainee_alchemy_charm',
                name: '实习炼金护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 1, skillName: '炼金'}]
            },
            '/items/trainee_brewing_charm': {
                hrid: '/items/trainee_brewing_charm',
                name: '实习冲泡护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 1, skillName: '冲泡'}]
            },
            '/items/trainee_cheesesmithing_charm': {
                hrid: '/items/trainee_cheesesmithing_charm',
                name: '实习奶酪锻造护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 1, skillName: '奶酪锻造'}]
            },
            '/items/trainee_cooking_charm': {
                hrid: '/items/trainee_cooking_charm',
                name: '实习烹饪护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 1, skillName: '烹饪'}]
            },
            '/items/trainee_crafting_charm': {
                hrid: '/items/trainee_crafting_charm',
                name: '实习制作护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 1, skillName: '制作'}]
            },
            '/items/trainee_enhancing_charm': {
                hrid: '/items/trainee_enhancing_charm',
                name: '实习强化护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 1, skillName: '强化'}]
            },
            '/items/trainee_foraging_charm': {
                hrid: '/items/trainee_foraging_charm',
                name: '实习采摘护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 1, skillName: '采摘'}]
            },
            '/items/trainee_milking_charm': {
                hrid: '/items/trainee_milking_charm',
                name: '实习挤奶护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/milking', level: 1, skillName: '挤奶'}]
            },
            '/items/trainee_tailoring_charm': {
                hrid: '/items/trainee_tailoring_charm',
                name: '实习缝纫护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 1, skillName: '缝纫'}]
            },
            '/items/trainee_woodcutting_charm': {
                hrid: '/items/trainee_woodcutting_charm',
                name: '实习伐木护符',
                type: '/equipment_types/charm',
                itemLevel: 1,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 1, skillName: '伐木'}]
            },
            '/items/verdant_alembic': {
                hrid: '/items/verdant_alembic',
                name: '翠绿蒸馏器',
                type: '/equipment_types/alchemy_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/alchemy', level: 10, skillName: '炼金'}]
            },
            '/items/verdant_brush': {
                hrid: '/items/verdant_brush',
                name: '翠绿刷子',
                type: '/equipment_types/milking_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/milking', level: 10, skillName: '挤奶'}]
            },
            '/items/verdant_chisel': {
                hrid: '/items/verdant_chisel',
                name: '翠绿凿子',
                type: '/equipment_types/crafting_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/crafting', level: 10, skillName: '制作'}]
            },
            '/items/verdant_enhancer': {
                hrid: '/items/verdant_enhancer',
                name: '翠绿强化器',
                type: '/equipment_types/enhancing_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/enhancing', level: 10, skillName: '强化'}]
            },
            '/items/verdant_hammer': {
                hrid: '/items/verdant_hammer',
                name: '翠绿锤子',
                type: '/equipment_types/cheesesmithing_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/cheesesmithing', level: 10, skillName: '奶酪锻造'}]
            },
            '/items/verdant_hatchet': {
                hrid: '/items/verdant_hatchet',
                name: '翠绿斧头',
                type: '/equipment_types/woodcutting_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/woodcutting', level: 10, skillName: '伐木'}]
            },
            '/items/verdant_needle': {
                hrid: '/items/verdant_needle',
                name: '翠绿针',
                type: '/equipment_types/tailoring_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/tailoring', level: 10, skillName: '缝纫'}]
            },
            '/items/verdant_pot': {
                hrid: '/items/verdant_pot',
                name: '翠绿壶',
                type: '/equipment_types/brewing_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/brewing', level: 10, skillName: '冲泡'}]
            },
            '/items/verdant_shears': {
                hrid: '/items/verdant_shears',
                name: '翠绿剪刀',
                type: '/equipment_types/foraging_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/foraging', level: 10, skillName: '采摘'}]
            },
            '/items/verdant_spatula': {
                hrid: '/items/verdant_spatula',
                name: '翠绿锅铲',
                type: '/equipment_types/cooking_tool',
                itemLevel: 10,
                levelRequirements: [{skillHrid: '/skills/cooking', level: 10, skillName: '烹饪'}]
            }
        };

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
        // 存储卷轴名称后缀跟buff名称不同的对应关系
        static SCROLL_TO_PERSON_BUFF_MAP = {};
        static ACHIEVEMENT_TIER_MAP = {
            veteran: [
                'bestiary_points_100',
                'build_room_level_3',
                'coinify_coins_1m',
                'collection_points_500',
                'cook_spaceberry_cake',
                'defeat_chronofrost_sorcerer',
                'defeat_jerry_t5',
                'defeat_red_panda',
                'enhance_to_10',
                'labyrinth_floor_4',
                'learn_special_ability',
                'tailor_umbral_tunic',
                'total_level_1000',
                'woodcut_arcane_tree'
            ],
            novice: [
                'bestiary_points_20',
                'brew_gourmet_tea',
                'cheesesmith_azure_tool',
                'collection_points_100',
                'defeat_marine_huntress',
                'defeat_shoebill',
                'enhance_to_3',
                'learn_ability',
                'tailor_medium_pouch',
                'task_tokens_10',
                'total_level_250'
            ],
            elite: [
                'bestiary_points_200',
                'brew_ultra_magic_coffee',
                'build_room_level_6',
                'clear_chimerical_den',
                'clear_sinister_circus',
                'collect_branch_of_insight',
                'collect_butter_of_proficiency',
                'collect_thread_of_expertise',
                'collection_points_1000',
                'craft_dungeon_equipment',
                'defeat_crystal_colossus',
                'defeat_dusk_revenant',
                'enhance_level_80_to_10',
                'equip_expert_task_badge',
                'labyrinth_floor_6',
                'total_level_1500'
            ],
            adept: [
                'bestiary_points_40',
                'build_room_level_1',
                'buy_trainee_charm',
                'collection_points_200',
                'cook_peach_yogurt',
                'craft_jewelry',
                'decompose_bamboo_gloves',
                'defeat_gobo_chieftain',
                'defeat_luna_empress',
                'defeat_the_watcher',
                'enhance_to_6',
                'equip_ginkgo_weapon',
                'labyrinth_floor_2',
                'total_level_500'
            ],
            champion: [
                'bestiary_points_400',
                'build_room_level_8',
                'clear_enchanted_fortress',
                'clear_pirate_cove',
                'clear_t1_dungeon_10_times',
                'collection_points_2000',
                'craft_celestial_tool_or_outfit',
                'craft_master_charm',
                'defeat_demonic_overlord_t1',
                'defeat_stalactite_golem_t5',
                'enhance_level_90_to_10',
                'labyrinth_floor_8',
                'refine_dungeon_equipment',
                'tailor_gluttonous_or_guzzling_pouch',
                'total_level_1800',
                'transmute_philosophers_stone'
            ],
            beginner: ['complete_tutorial', 'cook_apple_gummy', 'craft_wooden_bow', 'defeat_jerry', 'gather_milk', 'total_level_100']
        };
        static COMBAT_ACHIEVEMENTS = ['elite'];

        static HOSTNAME_PROPS_FILTERED_MAP = {
            DEFAULT: data => {
                const actionConfigMap = Object.fromEntries(
                    Object.entries(data.actionConfigMap ?? {}).map(([k, v]) => {
                        const {back, ...rest} = v ?? {};
                        return [k, rest];
                    })
                );
                return ({
                    actionConfigMap,
                    specialEquimentMap: data.specialEquimentMap,
                    communityBuffMap: data.communityBuffMap,
                    name: data.name,
                    color: data.color
                });
            },
            'hyhfish.github.io': data => data
        };

        static filterConvertData(convertData) {
            const handler = this.HOSTNAME_PROPS_FILTERED_MAP[CONFIG.hostname] || this.HOSTNAME_PROPS_FILTERED_MAP.DEFAULT;
            return handler(convertData);
        }

        static loadGameData({characterHouseRoomMap, characterAchievements}) {
            const headerElement = document.querySelector('.Header_header__1DxsV');
            const game = utils.getReactProps(headerElement) || {};

            return {
                character: game.character,
                characterItems: game.characterItemMap,
                characterHouseRoomMap,
                characterSkills: [...game.characterSkillMap.values()],
                actionTypeDrinkSlotsMap: game.actionTypeDrinkSlotsDict,
                communityBuffs: game.communityBuffs,
                characterAchievements,
                characterBuffs: game.characterBuffs
            };
        }

        static syncToGm(characterData) {
            const preset = this.convert(characterData);
            GM_setValue(CONFIG.mwiMilkonomyPreset, preset);
            return preset;
        }

        static convert({
            character,
            characterItems,
            characterSkills,
            characterHouseRoomMap,
            actionTypeDrinkSlotsMap,
            communityBuffs,
            characterAchievements,
            characterBuffs
        }) {
            const validItems = this._filterValidItems(characterItems);

            return {
                name: character?.name || CONFIG.characterId,
                color: '#90ee90',
                actionConfigMap: this._convert2ActionConfig(characterSkills, characterHouseRoomMap, actionTypeDrinkSlotsMap, validItems),
                specialEquimentMap: this._convert2SpecialEquiment(validItems),
                communityBuffMap: this._convert2CommunityBuff(communityBuffs),
                // 以下是hyhfish.github.io特有字段
                achievementBuffMap: this._convert2AchievementBuffMap(characterAchievements),
                seals: this._convert2Seals(characterBuffs)
            };
        }

        static _filterValidItems(characterItems) {
            const validItems = {};

            characterItems?.forEach(item => {
                const info = this.INCLUDE_ITEMS[item.itemHrid];
                if (!info) return;

                const type = utils.getItemTypeSuffix(info.type);
                const typeData = validItems[type] || {};
                let levelRequirements = info.levelRequirements || [];

                if (levelRequirements.length === 0) {
                    levelRequirements = [{skillHrid: '/skills/all', level: info.itemLevel}];
                }

                levelRequirements.forEach(v => {
                    const skill = utils.substrLastSlash(v.skillHrid);
                    let skillData = typeData[skill];
                    // 1.该部位未获取到数据
                    // 2.已获取数据不能是已穿戴
                    // 2.1.已获取数据的需求等级小于新物品需求等级
                    // 2.2.需求等级相同，判断强化等级
                    if (
                        !skillData ||
                        (!skillData.isWearable &&
                            (skillData.requiredLevel < v.level ||
                                (skillData.requiredLevel === v.level && skillData.enhanceLevel < item.enhancementLevel)))
                    ) {
                        typeData[skill] = {
                            itemHrid: item.itemHrid,
                            itemName: info.name,
                            isWearable: item.itemLocationHrid !== '/item_locations/inventory',
                            enhanceLevel: item.enhancementLevel,
                            itemLevel: info.itemLevel,
                            requiredLevel: v.level
                        };
                    }
                });

                validItems[type] = typeData;
            });

            return validItems;
        }

        static _convert2ActionConfig(characterSkills, characterHouseRoomMap, actionTypeDrinkSlotsMap, validItems) {
            const result = {};

            for (const [skill, house] of Object.entries(this.SKILL_TO_HOUSE_MAP)) {
                const aData = {action: skill};
                aData.playerLevel = characterSkills?.find(v => v.skillHrid === '/skills/' + skill)?.level || 0;

                for (const loc of this.ACTION_LOCATIONS) {
                    const items = validItems[loc];
                    const item = items?.[skill] || items?.all;
                    const type = loc === 'tool' ? skill + '_tool' : loc;
                    aData[loc] = item ? {type, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type};
                }

                aData.houseLevel = characterHouseRoomMap?.['/house_rooms/' + house]?.level || 0;
                aData.tea = actionTypeDrinkSlotsMap?.['/action_types/' + skill]?.filter(v => !!v)?.map(v => v.itemHrid) ?? [];
                result[skill] = aData;
            }

            return result;
        }

        static _convert2SpecialEquiment(validItems) {
            const result = {};

            for (const loc of this.EQUIPMENT_LOCATIONS) {
                const items = validItems[loc];
                const item = items?.all || items?.[Object.keys(items || {})?.[0]];
                result[loc] = item ? {type: loc, hrid: item.itemHrid, enhanceLevel: item.enhanceLevel} : {type: loc};
            }

            return result;
        }

        static _convert2CommunityBuff(communityBuffs) {
            const result = {};

            communityBuffs?.forEach(v => {
                const type = utils.substrLastSlash(v.hrid);
                if (this.BUFF_TYPES.includes(type)) {
                    result[type] = {type, hrid: v.hrid, level: v.level};
                }
            });

            return result;
        }

        static _convert2AchievementBuffMap(characterAchievements) {
            const completedMap = {};
            characterAchievements?.forEach(v => {
                completedMap[utils.substrLastSlash(v.achievementHrid)] = v.isCompleted;
            });
            const res = {};
            Object.entries(this.ACHIEVEMENT_TIER_MAP).forEach(([tier, achievements]) => {
                if (this.COMBAT_ACHIEVEMENTS.includes(tier)) return;
                const enabled = (achievements?.filter(v => !completedMap[v])?.length ?? 0) === 0;
                res[tier] = {type: tier, enabled};
            });
            return res;
        }

        static _convert2Seals(characterBuffs) {
            const now = Date.now();
            return (
                characterBuffs
                    ?.filter(v => now < Date.parse(v.expiresAt))
                    ?.map(v => {
                        const buffHrid = utils.substrLastSlash(v.hrid);
                        let itemId = this.SCROLL_TO_PERSON_BUFF_MAP?.[buffHrid] || 'seal_of_' + buffHrid;
                        return '/items/' + itemId;
                    }) || []
            );
        }
    }

    // ==================== 初始化 ====================
    function init() {
        if (CONFIG.isGameSite) {
            console.log('[EDS] 初始化游戏网站中……');
            new Milkywayidle();
            console.log('[EDS] 初始化游戏网站初始化完成');
        } else if (CONFIG.isMilkonomySite) {
            console.log('[EDS] 初始化利润网站中……');
            new Milkonomy();
            console.log('[EDS] 初始化利润网站初始化完成');
        }
    }

    init();
})(window, unsafeWindow);
