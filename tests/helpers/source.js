const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// 回归测试按源码顺序拼装近似运行时代码，用来验证单文件 userscript 的关键内容。
const RUNTIME_SOURCE_FILES = [
  'src/app/main.js', 'src/app/app-controller.js', 'src/common/build-flags.js', 'src/common/constants.js', 'src/common/data.js',
  'src/common/i18n.js', 'src/common/market.js', 'src/common/messages.js', 'src/common/runtime.js', 'src/common/ui.js',
  'src/modules/ability-upgrade/index.js', 'src/modules/character-card/constants.js', 'src/modules/character-card/data.js', 'src/modules/character-card/renderer.js', 'src/modules/character-card/exporter.js',
  'src/modules/character-card/build-score/legacy.js', 'src/modules/character-card/build-score/v26.js', 'src/modules/character-card/build-score/index.js', 'src/modules/character-card/index.js', 'src/modules/combat-upgrade/planner.js',
  'src/modules/combat-upgrade/index.js', 'src/modules/combat-sim-import/export-builder.js', 'src/modules/combat-sim-import/index.js', 'src/modules/dungeon-profit/calculator.js', 'src/modules/dungeon-profit/index.js',
  'src/modules/eds-milkonomy/converter.js', 'src/modules/eds-milkonomy/index.js', 'src/modules/equipment-comparison/worker-runtime.js', 'src/modules/equipment-comparison/simulator.js', 'src/modules/equipment-comparison/comparison.js',
  'src/modules/equipment-comparison/presets.js', 'src/modules/equipment-comparison/index.js', 'src/modules/house-calculator/calculator.js', 'src/modules/house-calculator/index.js', 'src/modules/labyrinth-supply/index.js',
  'src/modules/marketplace-cart/index.js', 'src/modules/toolkit-menu/index.js', 'src/modules/index.js', 'src/index.js'
];

function readSourceFile(...segments) {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
}

function readRuntimeSource() {
  return RUNTIME_SOURCE_FILES.map((file) => `\n// FILE: ${file}\n${readSourceFile(file)}`).join('\n');
}

function readVmSource(...files) {
  // VM 只执行被测模块本体，去掉 ESM 语法后保持源码逻辑不变。
  return files
    .map((file) => readSourceFile(file))
    .join('\n')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/\bexport function\b/g, 'function')
    .replace(/\bexport const\b/g, 'const')
    .replace(/\bexport class\b/g, 'class');
}

module.exports = {ROOT, readRuntimeSource, readSourceFile, readVmSource};
