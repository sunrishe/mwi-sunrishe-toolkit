'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {readRuntimeSource, readSourceFile, readVmSource} = require('./helpers/source.js');

const source = readRuntimeSource();
const runtimeSourceFile = readSourceFile('src', 'common', 'runtime.js');
const messagesSourceFile = readSourceFile('src', 'common', 'messages.js');
const moduleSourceFile = readSourceFile('src', 'modules', 'marketplace-cart', 'index.js');
const moduleCssSourceFile = readSourceFile('src', 'modules', 'marketplace-cart', 'styles.css');
const moduleIndexSourceFile = readSourceFile('src', 'modules', 'index.js');
const appControllerSourceFile = readSourceFile('src', 'app', 'app-controller.js');
const usageSource = readSourceFile('docs', 'usage.md');

function loadReader() {
  return vm.runInNewContext(
    `${readVmSource('src/modules/marketplace-cart/index.js')}
      readMarketplacePanelState;`,
    {}
  );
}

test('市场加购：从 React fiber 链读取 MarketplacePanel 当前物品与强化等级', () => {
  const read = loadReader();
  // 模拟刷新按钮 DOM 的 fiber 链：中间节点（Button 组件）无 state，向上命中 MarketplacePanel。
  const marketplaceState = {marketListingsView: 'am', itemHrid: '/items/iron_sword', enhancementLevel: 3};
  const fiber = {
    stateNode: {state: null},
    return: {
      stateNode: {
        state: marketplaceState,
        handleRefresh() {}
      },
      return: null
    }
  };
  assert.equal(read(fiber), marketplaceState);
});

test('市场加购：非 MarketplacePanel 组件或 fiber 链耗尽时返回 null', () => {
  const read = loadReader();
  // 普通组件虽有相似 state 但没有 handleRefresh 方法，不算 MarketplacePanel。
  const other = {
    stateNode: {state: {marketListingsView: 'em', itemHrid: null, enhancementLevel: 0}},
    return: null
  };
  assert.equal(read(other), null);
  assert.equal(read({stateNode: null, return: null}), null);
  assert.equal(read(null), null);
});

test('市场加购：中间节点是相似但非面板组件时继续向上查找', () => {
  const read = loadReader();
  // 刷新按钮上方的 Button 组件可能带部分相似 state，不能误判为 MarketplacePanel 直接返回；
  // 必须继续沿 fiber 链向上，直到找到带 handleRefresh 的 MarketplacePanel。
  const marketplaceState = {marketListingsView: 'am', itemHrid: '/items/iron_sword', enhancementLevel: 2};
  const fiber = {
    stateNode: {
      state: {marketListingsView: 'tm', itemHrid: null, enhancementLevel: 0}
    },
    return: {
      stateNode: {
        state: marketplaceState,
        handleRefresh() {}
      },
      return: null
    }
  };
  assert.equal(read(fiber), marketplaceState);
});

test('市场加购模块装配完整', () => {
  // 锚点选择器按 CSS Module 稳定前缀匹配。
  assert.match(
    runtimeSourceFile,
    /marketplaceNavButtons:\s*'\[class\*="MarketplacePanel_marketNavButtonContainer__"\]'/
  );
  // 按钮插入刷新按钮后方的文档流内，游戏重渲染清掉后由观察器重建；同页只允许一个活动实例。
  assert.match(moduleSourceFile, /insertAdjacentElement\('afterend', this\.wrapper\)/);
  assert.match(moduleSourceFile, /mst-marketplace-cart-button/);
  // 单例标记写在页面 window（unsafeWindow）上：油猴沙箱 window 与页面 window 隔离，
  // 写在沙箱 window 上时其他脚本副本看不到标记，多实例会互相插拔按钮。
  assert.match(moduleSourceFile, /pageWindow\.__MST_MARKETPLACE_CART_OWNER__/);
  // 锚点只认 React 渲染的按钮：其他脚本克隆/注入的按钮（无 __reactFiber 关联）会被跳过，
  // 避免误把克隆按钮当刷新按钮、点击时报“当前没有可加入购物车的市场物品”。
  assert.match(moduleSourceFile, /DataHub\.getReactFiber\(button\)/);
  // 加购条目保留强化等级并走 MWITools 购物车接口。
  assert.match(moduleSourceFile, /enhancementLevel/);
  assert.match(moduleSourceFile, /MarketMateBridge\.addToCart/);
  assert.match(moduleSourceFile, /source: 'mst_marketplace'/);
  // 模块注册与启动链路完整。
  assert.match(moduleIndexSourceFile, /MarketplaceCartFeature/);
  assert.match(moduleIndexSourceFile, /MarketplaceCartFeature\.configure\(ctx\)/);
  assert.match(appControllerSourceFile, /new MarketplaceCartFeature\(\)\.init\(\)/);
  assert.match(source, /src\/modules\/marketplace-cart\/index\.js/);
  // 兜底样式与文案齐全（中英文），i18n 分组已挂载。
  assert.match(moduleCssSourceFile, /\.mst-marketplace-cart-button/);
  assert.match(messagesSourceFile, /marketplaceCart:\s*\{zh: '加入购物车', en: 'Add to Cart'\}/);
  assert.match(messagesSourceFile, /marketplaceCartDone:/);
  assert.match(messagesSourceFile, /marketplaceCartNoItem:/);
  assert.match(messagesSourceFile, /marketplaceCartAddFailed:/);
  assert.match(messagesSourceFile, /marketplaceCart:\s*MARKETPLACE_CART_MESSAGES/);
  // 用户文档记录新功能入口。
  assert.match(usageSource, /市场加入购物车/);
});
