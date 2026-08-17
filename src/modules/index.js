import {AbilityUpgradeCalculatorFeature} from './ability-upgrade/index.js';
import {BuildScoreService} from './character-card/build-score/index.js';
import {CharacterCardFeature, createOriginalCharacterCardFeature} from './character-card/index.js';
import {CombatUpgradeCalculatorFeature} from './combat-upgrade/index.js';
import {DungeonProfitCalculatorService} from './dungeon-profit/calculator.js';
import {DungeonProfitCalculatorFeature} from './dungeon-profit/index.js';
import {CombatSimulatorConverter} from './eds-milkonomy/converter.js';
import {EdsMilkonomyFeature} from './eds-milkonomy/index.js';
import {EquipmentComparisonService} from './equipment-comparison/comparison.js';
import {EquipmentComparisonFeature} from './equipment-comparison/index.js';
import {CombatSimulationService} from './equipment-comparison/simulator.js';
import {HouseCalculator} from './house-calculator/calculator.js';
import {HouseCalculatorLauncher, HouseCalculatorUI} from './house-calculator/index.js';
import {ToolkitMenuFeature} from './toolkit-menu/index.js';

export function installModules(ctx) {
  // 先完成静态 configure，再把构造器挂到 ctx，避免模块之间直接循环 import。
  const OriginalCharacterCardFeature = createOriginalCharacterCardFeature(ctx);
  CharacterCardFeature.configure(ctx, OriginalCharacterCardFeature);
  CombatSimulatorConverter.configure(ctx);
  DungeonProfitCalculatorFeature.configure(ctx);
  EdsMilkonomyFeature.configure(ctx, CombatSimulatorConverter);
  EquipmentComparisonService.configure(ctx, CombatSimulationService);
  HouseCalculatorUI.configure(ctx, ctx.Notifier);
  HouseCalculatorLauncher.configure(ctx);

  ctx.AbilityUpgradeCalculatorFeature = AbilityUpgradeCalculatorFeature;
  ctx.BuildScoreService = BuildScoreService;
  ctx.CharacterCardFeature = CharacterCardFeature;
  ctx.CombatSimulationService = CombatSimulationService;
  ctx.CombatUpgradeCalculatorFeature = CombatUpgradeCalculatorFeature;
  ctx.CombatSimulatorConverter = CombatSimulatorConverter;
  ctx.DungeonProfitCalculatorFeature = DungeonProfitCalculatorFeature;
  ctx.DungeonProfitCalculatorService = DungeonProfitCalculatorService;
  ctx.EdsMilkonomyFeature = EdsMilkonomyFeature;
  ctx.EquipmentComparisonFeature = EquipmentComparisonFeature;
  ctx.EquipmentComparisonService = EquipmentComparisonService;
  ctx.HouseCalculator = HouseCalculator;
  ctx.HouseCalculatorUI = HouseCalculatorUI;
  ctx.ToolkitMenuFeature = ToolkitMenuFeature;
}
