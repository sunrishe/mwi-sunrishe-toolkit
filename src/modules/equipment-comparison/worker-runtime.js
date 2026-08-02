// 内嵌战斗模拟器运行时代码来自参考实现的构建产物，只在文件边界做适配注释。
// combat-worker-runtime
export function mstCombatWorkerRuntime() {
  (() => {
    var __defProp = Object.defineProperty;
    var __defNormalProp = (obj, key, value) =>
      key in obj
        ? __defProp(obj, key, {enumerable: true, configurable: true, writable: true, value: value})
        : (obj[key] = value);
    var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== 'symbol' ? key + '' : key, value);
    var CombatUtilities = class _CombatUtilities {
      static getTarget(enemies) {
        if (!enemies) {
          return null;
        }
        let target = enemies.find((enemy) => enemy.combatDetails.currentHitpoints > 0);
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
        let extraTailWeight = (balancedWeight * (average - balancedAverage)) / (maxFloor + 1 - average);
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
        let combatStyle = abilityEffect
          ? abilityEffect.combatStyleHrid
          : source.combatDetails.combatStats.combatStyleHrid;
        let damageType = abilityEffect ? abilityEffect.damageType : source.combatDetails.combatStats.damageType;
        let sourceAccuracyRating = 1;
        let sourceAutoAttackMaxDamage = 1;
        let targetEvasionRating = 1;
        switch (combatStyle) {
          case '/combat_styles/stab':
            sourceAccuracyRating = source.combatDetails.stabAccuracyRating;
            sourceAutoAttackMaxDamage = source.combatDetails.stabMaxDamage;
            targetEvasionRating = target.combatDetails.stabEvasionRating;
            break;

          case '/combat_styles/slash':
            sourceAccuracyRating = source.combatDetails.slashAccuracyRating;
            sourceAutoAttackMaxDamage = source.combatDetails.slashMaxDamage;
            targetEvasionRating = target.combatDetails.slashEvasionRating;
            break;

          case '/combat_styles/smash':
            sourceAccuracyRating = source.combatDetails.smashAccuracyRating;
            sourceAutoAttackMaxDamage = source.combatDetails.smashMaxDamage;
            targetEvasionRating = target.combatDetails.smashEvasionRating;
            break;

          case '/combat_styles/ranged':
            sourceAccuracyRating = source.combatDetails.rangedAccuracyRating;
            sourceAutoAttackMaxDamage = source.combatDetails.rangedMaxDamage;
            targetEvasionRating = target.combatDetails.rangedEvasionRating;
            break;

          case '/combat_styles/magic':
            sourceAccuracyRating = source.combatDetails.magicAccuracyRating;
            sourceAutoAttackMaxDamage = source.combatDetails.magicMaxDamage;
            targetEvasionRating = target.combatDetails.magicEvasionRating;
            break;

          default:
            throw new Error('Unknown combat style: ' + combatStyle);
        }
        let sourceDamageMultiplier = 1;
        let sourceResistance = 0;
        let sourcePenetration = 0;
        let targetResistance = 0;
        let targetThornPower = 0;
        let targetPenetration = 0;
        let thornType;
        switch (damageType) {
          case '/damage_types/physical':
            sourceDamageMultiplier = 1 + source.combatDetails.combatStats.physicalAmplify;
            sourceResistance = source.combatDetails.totalArmor;
            sourcePenetration = source.combatDetails.combatStats.armorPenetration;
            targetResistance = target.combatDetails.totalArmor;
            targetThornPower = target.combatDetails.combatStats.physicalThorns;
            targetPenetration = target.combatDetails.combatStats.armorPenetration;
            thornType = 'physicalThorns';
            break;

          case '/damage_types/water':
            sourceDamageMultiplier = 1 + source.combatDetails.combatStats.waterAmplify;
            sourceResistance = source.combatDetails.totalWaterResistance;
            sourcePenetration = source.combatDetails.combatStats.waterPenetration;
            targetResistance = target.combatDetails.totalWaterResistance;
            targetThornPower = target.combatDetails.combatStats.elementalThorns;
            targetPenetration = target.combatDetails.combatStats.waterPenetration;
            thornType = 'elementalThorns';
            break;

          case '/damage_types/nature':
            sourceDamageMultiplier = 1 + source.combatDetails.combatStats.natureAmplify;
            sourceResistance = source.combatDetails.totalNatureResistance;
            sourcePenetration = source.combatDetails.combatStats.naturePenetration;
            targetResistance = target.combatDetails.totalNatureResistance;
            targetThornPower = target.combatDetails.combatStats.elementalThorns;
            targetPenetration = target.combatDetails.combatStats.naturePenetration;
            thornType = 'elementalThorns';
            break;

          case '/damage_types/fire':
            sourceDamageMultiplier = 1 + source.combatDetails.combatStats.fireAmplify;
            sourceResistance = source.combatDetails.totalFireResistance;
            sourcePenetration = source.combatDetails.combatStats.firePenetration;
            targetResistance = target.combatDetails.totalFireResistance;
            targetThornPower = target.combatDetails.combatStats.elementalThorns;
            targetPenetration = target.combatDetails.combatStats.firePenetration;
            thornType = 'elementalThorns';
            break;

          default:
            throw new Error('Unknown damage type: ' + damageType);
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
        hitChance =
          Math.pow(sourceAccuracyRating, 1.4) /
          (Math.pow(sourceAccuracyRating, 1.4) + Math.pow(targetEvasionRating, 1.4));
        if (combatStyle == '/combat_styles/ranged') {
          critChance = 0.3 * hitChance;
        }
        critChance = critChance + bonusCritChance;
        let baseDamageFlat = abilityEffect ? abilityEffect.damageFlat : 0;
        let baseDamageRatio = abilityEffect ? abilityEffect.damageRatio : 1;
        let armorDamageRatioFlat = abilityEffect ? abilityEffect.armorDamageRatio * source.combatDetails.totalArmor : 0;
        let sourceMinDamage = sourceDamageMultiplier * (1 + baseDamageFlat + armorDamageRatioFlat);
        let sourceMaxDamage =
          sourceDamageMultiplier *
          (baseDamageRatio * sourceAutoAttackMaxDamage + baseDamageFlat + armorDamageRatioFlat);
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
          let thornsDamageRoll = _CombatUtilities.randomInt(
            1,
            targetDamageMultiplier *
              target.combatDetails.defensiveMaxDamage *
              (1 + targetResistance / 100) *
              targetThornPower
          );
          let mitigatedThornsDamage = Math.ceil(sourceDamageTakenRatio * thornsDamageRoll);
          thornDamageDone = Math.min(mitigatedThornsDamage, source.combatDetails.currentHitpoints);
          source.combatDetails.currentHitpoints -= thornDamageDone;
        }
        let retaliationDamageDone = 0;
        if (target.combatDetails.combatStats.retaliation > 0) {
          let retaliationHitChance =
            Math.pow(target.combatDetails.smashAccuracyRating, 1.4) /
            (Math.pow(target.combatDetails.smashAccuracyRating, 1.4) +
              Math.pow(source.combatDetails.smashEvasionRating, 1.4));
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
            let retaliationMinDamage =
              retaliationDamageMultiplier * target.combatDetails.combatStats.retaliation * premitigatedDamage;
            let retaliationMaxDamage =
              retaliationDamageMultiplier *
              target.combatDetails.combatStats.retaliation *
              (target.combatDetails.defensiveMaxDamage + premitigatedDamage);
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
        if (abilityEffect.combatStyleHrid != '/combat_styles/magic') {
          throw new Error('Heal ability effect not supported for combat style: ' + abilityEffect.combatStyleHrid);
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
        if (abilityEffect.combatStyleHrid != '/combat_styles/magic') {
          throw new Error('Heal ability effect not supported for combat style: ' + abilityEffect.combatStyleHrid);
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
        let currentSum = Math.floor((currentTick * totalValue) / totalTicks);
        let previousSum = Math.floor(((currentTick - 1) * totalValue) / totalTicks);
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
    __publicField(_AutoAttackEvent, 'type', 'autoAttack');
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
    __publicField(_DamageOverTimeEvent, 'type', 'damageOverTime');
    var DamageOverTimeEvent = _DamageOverTimeEvent;
    var damageOverTimeEvent_default = DamageOverTimeEvent;
    var _CheckBuffExpirationEvent = class _CheckBuffExpirationEvent extends combatEvent_default {
      constructor(time, source) {
        super(_CheckBuffExpirationEvent.type, time);
        this.source = source;
      }
    };
    __publicField(_CheckBuffExpirationEvent, 'type', 'checkBuffExpiration');
    var CheckBuffExpirationEvent = _CheckBuffExpirationEvent;
    var checkBuffExpirationEvent_default = CheckBuffExpirationEvent;
    var _CombatStartEvent = class _CombatStartEvent extends combatEvent_default {
      constructor(time) {
        super(_CombatStartEvent.type, time);
      }
    };
    __publicField(_CombatStartEvent, 'type', 'combatStart');
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
    __publicField(_ConsumableTickEvent, 'type', 'consumableTick');
    var ConsumableTickEvent = _ConsumableTickEvent;
    var consumableTickEvent_default = ConsumableTickEvent;
    var _CooldownReadyEvent = class _CooldownReadyEvent extends combatEvent_default {
      constructor(time) {
        super(_CooldownReadyEvent.type, time);
      }
    };
    __publicField(_CooldownReadyEvent, 'type', 'cooldownReady');
    var CooldownReadyEvent = _CooldownReadyEvent;
    var cooldownReadyEvent_default = CooldownReadyEvent;
    var _EnemyRespawnEvent = class _EnemyRespawnEvent extends combatEvent_default {
      constructor(time) {
        super(_EnemyRespawnEvent.type, time);
      }
    };
    __publicField(_EnemyRespawnEvent, 'type', 'enemyRespawn');
    var EnemyRespawnEvent = _EnemyRespawnEvent;
    var enemyRespawnEvent_default = EnemyRespawnEvent;
    var __generator = function (thisArg, body) {
      var _ = {
          label: 0,
          sent: function () {
            if (t[0] & 1) throw t[1];
            return t[1];
          },
          trys: [],
          ops: []
        },
        f,
        y,
        t,
        g;
      return (
        (g = {next: verb(0), throw: verb(1), return: verb(2)}),
        typeof Symbol === 'function' &&
          (g[Symbol.iterator] = function () {
            return this;
          }),
        g
      );
      function verb(n) {
        return function (v) {
          return step([
            n, v
          ]);
        };
      }
      function step(op) {
        if (f) throw new TypeError('Generator is already executing.');
        while (_)
          try {
            if (
              ((f = 1),
              y &&
                (t = op[0] & 2 ? y['return'] : op[0] ? y['throw'] || ((t = y['return']) && t.call(y), 0) : y.next) &&
                !(t = t.call(y, op[1])).done)
            )
              return t;
            if (((y = 0), t)) op = [
                op[0] & 2, t.value
              ];
            switch (op[0]) {
              case 0:
              case 1:
                t = op;
                break;

              case 4:
                _.label++;
                return {value: op[1], done: false};

              case 5:
                _.label++;
                y = op[1];
                op = [
                  0
                ];
                continue;

              case 7:
                op = _.ops.pop();
                _.trys.pop();
                continue;

              default:
                if (!((t = _.trys), (t = t.length > 0 && t[t.length - 1])) && (op[0] === 6 || op[0] === 2)) {
                  _ = 0;
                  continue;
                }
                if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
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
            op = [
              6, e
            ];
            y = 0;
          } finally {
            f = t = 0;
          }
        if (op[0] & 5) throw op[1];
        return {value: op[0] ? op[1] : void 0, done: true};
      }
    };
    var __read = function (o, n) {
      var m = typeof Symbol === 'function' && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o),
        r,
        ar = [],
        e;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      } catch (error) {
        e = {error: error};
      } finally {
        try {
          if (r && !r.done && (m = i['return'])) m.call(i);
        } finally {
          if (e) throw e.error;
        }
      }
      return ar;
    };
    var __spreadArray = function (to, from, pack) {
      if (pack || arguments.length === 2)
        for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
      return to.concat(ar || Array.prototype.slice.call(from));
    };
    var Heap = (function () {
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
        this._invertedCompare = function (a, b) {
          return -1 * _this.compare(a, b);
        };
      }
      Heap2.getChildrenIndexOf = function (idx) {
        return [
          idx * 2 + 1, idx * 2 + 2
        ];
      };
      Heap2.getParentIndexOf = function (idx) {
        if (idx <= 0) {
          return -1;
        }
        var whichChildren = idx % 2 ? 1 : 2;
        return Math.floor((idx - whichChildren) / 2);
      };
      Heap2.getSiblingIndexOf = function (idx) {
        if (idx <= 0) {
          return -1;
        }
        var whichChildren = idx % 2 ? 1 : -1;
        return idx + whichChildren;
      };
      Heap2.minComparator = function (a, b) {
        if (a > b) {
          return 1;
        } else if (a < b) {
          return -1;
        } else {
          return 0;
        }
      };
      Heap2.maxComparator = function (a, b) {
        if (b > a) {
          return 1;
        } else if (b < a) {
          return -1;
        } else {
          return 0;
        }
      };
      Heap2.minComparatorNumber = function (a, b) {
        return a - b;
      };
      Heap2.maxComparatorNumber = function (a, b) {
        return b - a;
      };
      Heap2.defaultIsEqual = function (a, b) {
        return a === b;
      };
      Heap2.print = function (heap) {
        function deep(i2) {
          var pi = Heap2.getParentIndexOf(i2);
          return Math.floor(Math.log2(pi + 1));
        }
        function repeat(str, times) {
          var out = '';
          for (; times > 0; --times) {
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
        return lines
          .map(function (line, i2) {
            var times = Math.pow(2, maxLines - i2) - 1;
            return (
              repeat(' ', Math.floor(times / 2) * maxLength) +
              line
                .map(function (el) {
                  var half = (maxLength - el.length) / 2;
                  return repeat(' ', Math.ceil(half)) + el + repeat(' ', Math.floor(half));
                })
                .join(repeat(' ', times * maxLength))
            );
          })
          .join('\n');
      };
      Heap2.heapify = function (arr, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = arr;
        heap.init();
        return heap;
      };
      Heap2.heappop = function (heapArr, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        return heap.pop();
      };
      Heap2.heappush = function (heapArr, item, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        heap.push(item);
      };
      Heap2.heappushpop = function (heapArr, item, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        return heap.pushpop(item);
      };
      Heap2.heapreplace = function (heapArr, item, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        return heap.replace(item);
      };
      Heap2.heaptop = function (heapArr, n, compare) {
        if (n === void 0) {
          n = 1;
        }
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        return heap.top(n);
      };
      Heap2.heapbottom = function (heapArr, n, compare) {
        if (n === void 0) {
          n = 1;
        }
        var heap = new Heap2(compare);
        heap.heapArray = heapArr;
        return heap.bottom(n);
      };
      Heap2.nlargest = function (n, iterable, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = __spreadArray([], __read(iterable), false);
        heap.init();
        return heap.top(n);
      };
      Heap2.nsmallest = function (n, iterable, compare) {
        var heap = new Heap2(compare);
        heap.heapArray = __spreadArray([], __read(iterable), false);
        heap.init();
        return heap.bottom(n);
      };
      Heap2.prototype.add = function (element) {
        this._sortNodeUp(this.heapArray.push(element) - 1);
        this._applyLimit();
        return true;
      };
      Heap2.prototype.addAll = function (elements) {
        var _a;
        var i = this.length;
        (_a = this.heapArray).push.apply(_a, __spreadArray([], __read(elements), false));
        for (var l = this.length; i < l; ++i) {
          this._sortNodeUp(i);
        }
        this._applyLimit();
        return true;
      };
      Heap2.prototype.bottom = function (n) {
        if (n === void 0) {
          n = 1;
        }
        if (this.heapArray.length === 0 || n <= 0) {
          return [];
        } else if (this.heapArray.length === 1) {
          return [
            this.heapArray[0]
          ];
        } else if (n >= this.heapArray.length) {
          return __spreadArray([], __read(this.heapArray), false);
        } else {
          var result = this._bottomN_push(~~n);
          return result;
        }
      };
      Heap2.prototype.check = function () {
        var _this = this;
        return this.heapArray.find(function (el, j) {
          return !!_this.getChildrenOf(j).find(function (ch) {
            return _this.compare(el, ch) > 0;
          });
        });
      };
      Heap2.prototype.clear = function () {
        this.heapArray = [];
      };
      Heap2.prototype.clone = function () {
        var cloned = new Heap2(this.comparator());
        cloned.heapArray = this.toArray();
        cloned._limit = this._limit;
        return cloned;
      };
      Heap2.prototype.comparator = function () {
        return this.compare;
      };
      Heap2.prototype.contains = function (o, fn) {
        if (fn === void 0) {
          fn = Heap2.defaultIsEqual;
        }
        return (
          this.heapArray.findIndex(function (el) {
            return fn(el, o);
          }) >= 0
        );
      };
      Heap2.prototype.init = function (array) {
        if (array) {
          this.heapArray = __spreadArray([], __read(array), false);
        }
        for (var i = Math.floor(this.heapArray.length); i >= 0; --i) {
          this._sortNodeDown(i);
        }
        this._applyLimit();
      };
      Heap2.prototype.isEmpty = function () {
        return this.length === 0;
      };
      Heap2.prototype.leafs = function () {
        if (this.heapArray.length === 0) {
          return [];
        }
        var pi = Heap2.getParentIndexOf(this.heapArray.length - 1);
        return this.heapArray.slice(pi + 1);
      };
      Object.defineProperty(Heap2.prototype, 'length', {
        get: function () {
          return this.heapArray.length;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Heap2.prototype, 'limit', {
        get: function () {
          return this._limit;
        },
        set: function (_l) {
          this._limit = ~~_l;
          this._applyLimit();
        },
        enumerable: false,
        configurable: true
      });
      Heap2.prototype.peek = function () {
        return this.heapArray[0];
      };
      Heap2.prototype.pop = function () {
        var last = this.heapArray.pop();
        if (this.length > 0 && last !== void 0) {
          return this.replace(last);
        }
        return last;
      };
      Heap2.prototype.push = function () {
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
      Heap2.prototype.pushpop = function (element) {
        var _a;
        if (this.compare(this.heapArray[0], element) < 0) {
          ((_a = __read(
            [
              this.heapArray[0], element
            ],
            2
          )),
            (element = _a[0]),
            (this.heapArray[0] = _a[1]));
          this._sortNodeDown(0);
        }
        return element;
      };
      Heap2.prototype.remove = function (o, fn) {
        if (fn === void 0) {
          fn = Heap2.defaultIsEqual;
        }
        if (this.length > 0) {
          if (o === void 0) {
            this.pop();
            return true;
          } else {
            var idx = this.heapArray.findIndex(function (el) {
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
      Heap2.prototype.replace = function (element) {
        var peek = this.heapArray[0];
        this.heapArray[0] = element;
        this._sortNodeDown(0);
        return peek;
      };
      Heap2.prototype.size = function () {
        return this.length;
      };
      Heap2.prototype.top = function (n) {
        if (n === void 0) {
          n = 1;
        }
        if (this.heapArray.length === 0 || n <= 0) {
          return [];
        } else if (this.heapArray.length === 1 || n === 1) {
          return [
            this.heapArray[0]
          ];
        } else if (n >= this.heapArray.length) {
          return __spreadArray([], __read(this.heapArray), false);
        } else {
          var result = this._topN_push(~~n);
          return result;
        }
      };
      Heap2.prototype.toArray = function () {
        return __spreadArray([], __read(this.heapArray), false);
      };
      Heap2.prototype.toString = function () {
        return this.heapArray.toString();
      };
      Heap2.prototype.get = function (i) {
        return this.heapArray[i];
      };
      Heap2.prototype.getChildrenOf = function (idx) {
        var _this = this;
        return Heap2.getChildrenIndexOf(idx)
          .map(function (i) {
            return _this.heapArray[i];
          })
          .filter(function (e) {
            return e !== void 0;
          });
      };
      Heap2.prototype.getParentOf = function (idx) {
        var pi = Heap2.getParentIndexOf(idx);
        return this.heapArray[pi];
      };
      Heap2.prototype[Symbol.iterator] = function () {
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              if (!this.length) return [
                  3, 2
                ];
              return [
                4, this.pop()
              ];

            case 1:
              _a.sent();
              return [
                3, 0
              ];

            case 2:
              return [
                2
              ];
          }
        });
      };
      Heap2.prototype.iterator = function () {
        return this.toArray();
      };
      Heap2.prototype._applyLimit = function () {
        if (this._limit && this._limit < this.heapArray.length) {
          var rm = this.heapArray.length - this._limit;
          while (rm) {
            this.heapArray.pop();
            --rm;
          }
        }
      };
      Heap2.prototype._bottomN_push = function (n) {
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
          var currentIndex = indices.shift();
          if (this.compare(arr[currentIndex], bottomHeap.peek()) > 0) {
            bottomHeap.replace(arr[currentIndex]);
            if (currentIndex % 2) {
              indices.push(Heap2.getParentIndexOf(currentIndex));
            }
          }
        }
        return bottomHeap.toArray();
      };
      Heap2.prototype._moveNode = function (j, k) {
        var _a;
        ((_a = __read(
          [
            this.heapArray[k], this.heapArray[j]
          ],
          2
        )),
          (this.heapArray[j] = _a[0]),
          (this.heapArray[k] = _a[1]));
      };
      Heap2.prototype._sortNodeDown = function (i) {
        var _this = this;
        var moveIt = i < this.heapArray.length - 1;
        var self = this.heapArray[i];
        var getPotentialParent = function (best, j) {
          if (_this.heapArray.length > j && _this.compare(_this.heapArray[j], _this.heapArray[best]) < 0) {
            best = j;
          }
          return best;
        };
        while (moveIt) {
          var childrenIdx = Heap2.getChildrenIndexOf(i);
          var bestChildIndex = childrenIdx.reduce(getPotentialParent, childrenIdx[0]);
          var bestChild = this.heapArray[bestChildIndex];
          if (typeof bestChild !== 'undefined' && this.compare(self, bestChild) > 0) {
            this._moveNode(i, bestChildIndex);
            i = bestChildIndex;
          } else {
            moveIt = false;
          }
        }
      };
      Heap2.prototype._sortNodeUp = function (i) {
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
      Heap2.prototype._topN_push = function (n) {
        var topHeap = new Heap2(this._invertedCompare);
        topHeap.limit = n;
        var indices = [
          0
        ];
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
      Heap2.prototype._topN_fill = function (n) {
        var heapArray = this.heapArray;
        var topHeap = new Heap2(this._invertedCompare);
        topHeap.limit = n;
        topHeap.heapArray = heapArray.slice(0, n);
        topHeap.init();
        var branch = Heap2.getParentIndexOf(n - 1) + 1;
        var indices = [];
        for (var i = branch; i < n; ++i) {
          indices.push.apply(
            indices,
            __spreadArray(
              [],
              __read(
                Heap2.getChildrenIndexOf(i).filter(function (l) {
                  return l < heapArray.length;
                })
              ),
              false
            )
          );
        }
        if ((n - 1) % 2) {
          indices.push(n);
        }
        while (indices.length) {
          var currentIndex = indices.shift();
          if (currentIndex < heapArray.length) {
            if (this.compare(heapArray[currentIndex], topHeap.peek()) < 0) {
              topHeap.replace(heapArray[currentIndex]);
              indices.push.apply(indices, __spreadArray([], __read(Heap2.getChildrenIndexOf(currentIndex)), false));
            }
          }
        }
        return topHeap.toArray();
      };
      Heap2.prototype._topN_heap = function (n) {
        var topHeap = this.clone();
        var result = [];
        for (var i = 0; i < n; ++i) {
          result.push(topHeap.pop());
        }
        return result;
      };
      Heap2.prototype._topIdxOf = function (list) {
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
      Heap2.prototype._topOf = function () {
        var list = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          list[_i] = arguments[_i];
        }
        var heap = new Heap2(this.compare);
        heap.init(list);
        return heap.peek();
      };
      return Heap2;
    })();
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
        return heapEvents.some((event) => event.type == type);
      }
      containsEventOfTypeAndHrid(type, hrid) {
        let heapEvents = this.minHeap.toArray();
        return heapEvents.some((event) => event.type == type && event.hrid == hrid);
      }
      clear() {
        this.minHeap = new Heap((a, b) => a.time - b.time);
      }
      clearEventsForUnit(unit) {
        this.clearMatching((event) => event.source == unit || event.target == unit);
      }
      clearEventsOfType(type) {
        this.clearMatching((event) => event.type == type);
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
    __publicField(_PlayerRespawnEvent, 'type', 'playerRespawn');
    var PlayerRespawnEvent = _PlayerRespawnEvent;
    var playerRespawnEvent_default = PlayerRespawnEvent;
    var _RegenTickEvent = class _RegenTickEvent extends combatEvent_default {
      constructor(time) {
        super(_RegenTickEvent.type, time);
      }
    };
    __publicField(_RegenTickEvent, 'type', 'regenTick');
    var RegenTickEvent = _RegenTickEvent;
    var regenTickEvent_default = RegenTickEvent;
    var _StunExpirationEvent = class _StunExpirationEvent extends combatEvent_default {
      constructor(time, source) {
        super(_StunExpirationEvent.type, time);
        this.source = source;
      }
    };
    __publicField(_StunExpirationEvent, 'type', 'stunExpiration');
    var StunExpirationEvent = _StunExpirationEvent;
    var stunExpirationEvent_default = StunExpirationEvent;
    var _BlindExpirationEvent = class _BlindExpirationEvent extends combatEvent_default {
      constructor(time, source) {
        super(_BlindExpirationEvent.type, time);
        this.source = source;
      }
    };
    __publicField(_BlindExpirationEvent, 'type', 'blindExpiration');
    var BlindExpirationEvent = _BlindExpirationEvent;
    var blindExpirationEvent_default = BlindExpirationEvent;
    var _SilenceExpirationEvent = class _SilenceExpirationEvent extends combatEvent_default {
      constructor(time, source) {
        super(_SilenceExpirationEvent.type, time);
        this.source = source;
      }
    };
    __publicField(_SilenceExpirationEvent, 'type', 'silenceExpiration');
    var SilenceExpirationEvent = _SilenceExpirationEvent;
    var silenceExpirationEvent_default = SilenceExpirationEvent;
    var _CurseExpirationEvent = class _CurseExpirationEvent extends combatEvent_default {
      constructor(time, curseAmount, source) {
        super(_CurseExpirationEvent.type, time);
        this.curseAmount = Math.min(curseAmount + 1, _CurseExpirationEvent.maxCurseStacks);
        this.source = source;
      }
    };
    __publicField(_CurseExpirationEvent, 'type', 'curseExpiration');
    __publicField(_CurseExpirationEvent, 'maxCurseStacks', 5);
    var CurseExpirationEvent = _CurseExpirationEvent;
    var curseExpirationEvent_default = CurseExpirationEvent;
    var _WeakenExpirationEvent = class _WeakenExpirationEvent extends combatEvent_default {
      constructor(time, weakenAmount, source) {
        super(_WeakenExpirationEvent.type, time);
        this.weakenAmount = Math.min(weakenAmount + 1, _WeakenExpirationEvent.maxWeakenStacks);
        this.source = source;
      }
    };
    __publicField(_WeakenExpirationEvent, 'type', 'weakenExpiration');
    __publicField(_WeakenExpirationEvent, 'maxWeakenStacks', 5);
    var WeakenExpirationEvent = _WeakenExpirationEvent;
    var weakenExpirationEvent_default = WeakenExpirationEvent;
    var _FuryExpirationEvent = class _FuryExpirationEvent extends combatEvent_default {
      constructor(time, furyAmount, source) {
        super(_FuryExpirationEvent.type, time);
        this.furyAmount = furyAmount;
        this.source = source;
      }
    };
    __publicField(_FuryExpirationEvent, 'type', 'furyExpiration');
    var FuryExpirationEvent = _FuryExpirationEvent;
    var furyExpirationEvent_default = FuryExpirationEvent;
    var _EnrageTickEvent = class _EnrageTickEvent extends combatEvent_default {
      constructor(time, encounterTime) {
        super(_EnrageTickEvent.type, time);
        this.encounterTime = encounterTime;
      }
    };
    __publicField(_EnrageTickEvent, 'type', 'enrageTick');
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
      for (const [
        key, value
      ] of Object.entries(values || {})) {
        const target = combatData[key];
        if (target == null || value == null) continue;
        if (Array.isArray(target) && Array.isArray(value)) {
          target.splice(0, target.length, ...value);
        } else if (typeof target === 'object' && typeof value === 'object') {
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
        this.playerRanOutOfMana = {player1: false, player2: false, player3: false, player4: false, player5: false};
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
        this.timeSeriesData = {timestamps: [], players: {}};
      }
      addWipeEvent(logs, simulationTime, wave) {
        this.wipeEvents.push({
          simulationTime: simulationTime,
          logs: logs,
          wave: wave,
          timestamp: new Date().toISOString()
        });
      }
      addDeath(unit) {
        if (!this.deaths[unit.hrid]) {
          this.deaths[unit.hrid] = 0;
        }
        this.deaths[unit.hrid] += 1;
      }
      updateTimeSpentAlive(name, alive, time) {
        const i = this.timeSpentAlive.findIndex((e) => e.name === name);
        if (alive) {
          if (i !== -1) {
            this.timeSpentAlive[i].alive = true;
            this.timeSpentAlive[i].spawnedAt = time;
          } else {
            this.timeSpentAlive.push({name: name, timeSpentAlive: 0, spawnedAt: time, alive: true, count: 0});
          }
        } else {
          const timeAlive = time - this.timeSpentAlive[i].spawnedAt;
          this.timeSpentAlive[i].alive = false;
          this.timeSpentAlive[i].timeSpentAlive += timeAlive;
          this.timeSpentAlive[i].count += 1;
        }
      }
      updateDungenonFinish(beginFlag, finishTime) {
        const i = this.timeSpentAlive.findIndex((e) => e.name === beginFlag);
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
        let experienceGainedRate = {stamina: 0, intelligence: 0, attack: 0, melee: 0, defense: 0, ranged: 0, magic: 0};
        const primaryTraining = unit.combatDetails.combatStats.primaryTraining;
        experienceGainedRate[primaryTraining.split('/')[2]] = 0.3;
        const skillExpMap = combatStyleDetailMap_default[unit.combatDetails.combatStats.combatStyleHrid].skillExpMap;
        const skillExpMapLength = Object.keys(skillExpMap).length;
        const focusTraining = unit.combatDetails.combatStats.focusTraining;
        if (focusTraining && skillExpMap[focusTraining]) {
          experienceGainedRate[focusTraining.split('/')[2]] += 0.7;
        } else {
          Object.keys(skillExpMap).forEach((skillHrid) => {
            experienceGainedRate[skillHrid.split('/')[2]] += 0.7 / skillExpMapLength;
          });
        }
        for (const [
          type, rate
        ] of Object.entries(experienceGainedRate)) {
          if (rate <= 0) continue;
          const skillExperience = rate * (1 + unit.combatDetails.combatStats[type + 'Experience']);
          this.experienceGained[unit.hrid][type] +=
            experience *
            (1 + unit.combatDetails.combatStats.combatExperience) *
            skillExperience *
            (1 + unit.debuffOnLevelGap);
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
        for (let [
          key, value
        ] of unit.abilityManaCosts.entries()) {
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
            this.playerRanOutOfManaTime[unit.hrid].totalTimeForOutOfMana +=
              time - this.playerRanOutOfManaTime[unit.hrid].startTimeForOutOfMana;
          }
        }
      }
      addTimeSeriesSnapshot(time, players) {
        this.timeSeriesData.timestamps.push(time);
        players.forEach((player) => {
          if (!this.timeSeriesData.players[player.hrid]) {
            this.timeSeriesData.players[player.hrid] = {hp: [], mp: [], maxHp: [], maxMp: []};
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
    __publicField(_AbilityCastEndEvent, 'type', 'abilityCastEndEvent');
    var AbilityCastEndEvent = _AbilityCastEndEvent;
    var abilityCastEndEvent_default = AbilityCastEndEvent;
    var _AwaitCooldownEvent = class _AwaitCooldownEvent extends combatEvent_default {
      constructor(time, source) {
        super(_AwaitCooldownEvent.type, time);
        this.source = source;
      }
    };
    __publicField(_AwaitCooldownEvent, 'type', 'awaitCooldownEvent');
    var AwaitCooldownEvent = _AwaitCooldownEvent;
    var awaitCooldownEvent_default = AwaitCooldownEvent;
    var Buff = class {
      constructor(buff, level = 1) {
        __publicField(this, 'startTime');
        this.uniqueHrid = buff.uniqueHrid;
        this.typeHrid = buff.typeHrid;
        this.ratioBoost = buff.ratioBoost + (level - 1) * buff.ratioBoostLevelBonus;
        this.flatBoost = buff.flatBoost + (level - 1) * buff.flatBoostLevelBonus;
        this.duration = buff.duration;
        this.multiplierForSkillHrid = buff.multiplierForSkillHrid ?? '';
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
          case '/combat_trigger_dependencies/self':
            dependencyValue = this.getDependencyValue(source, currentTime);
            break;

          case '/combat_trigger_dependencies/targeted_enemy':
            if (!target) {
              return false;
            }
            dependencyValue = this.getDependencyValue(target, currentTime);
            break;

          default:
            throw new Error('Unknown dependencyHrid in trigger: ' + this.dependencyHrid);
        }
        return this.compareValue(dependencyValue);
      }
      isActiveMultiTarget(friendlies, enemies, currentTime) {
        let dependency;
        switch (this.dependencyHrid) {
          case '/combat_trigger_dependencies/all_allies':
            dependency = friendlies;
            break;

          case '/combat_trigger_dependencies/all_enemies':
            if (!enemies) {
              return false;
            }
            dependency = enemies;
            break;

          default:
            throw new Error('Unknown dependencyHrid in trigger: ' + this.dependencyHrid);
        }
        let dependencyValue;
        switch (this.conditionHrid) {
          case '/combat_trigger_conditions/number_of_active_units':
            dependencyValue = dependency.filter((unit) => unit.combatDetails.currentHitpoints > 0).length;
            break;

          case '/combat_trigger_conditions/number_of_dead_units':
            dependencyValue = dependency.filter((unit) => unit.combatDetails.currentHitpoints <= 0).length;
            break;

          case '/combat_trigger_conditions/lowest_hp_percentage':
            dependencyValue =
              dependency
                .filter((unit) => unit.combatDetails.currentHitpoints > 0)
                .reduce((prev, curr) => {
                  let currentHpPercentage = curr.combatDetails.currentHitpoints / curr.combatDetails.maxHitpoints;
                  return currentHpPercentage < prev ? currentHpPercentage : prev;
                }, 2) * 100;
            break;

          default:
            dependencyValue = dependency
              .filter((unit) => unit.combatDetails.currentHitpoints > 0)
              .map((unit) => this.getDependencyValue(unit, currentTime))
              .reduce((prev, cur) => prev + cur, 0);
            break;
        }
        return this.compareValue(dependencyValue);
      }
      getDependencyValue(source, currentTime) {
        switch (this.conditionHrid) {
          case '/combat_trigger_conditions/berserk':
          case '/combat_trigger_conditions/frenzy':
          case '/combat_trigger_conditions/precision':
          case '/combat_trigger_conditions/vampirism':
          case '/combat_trigger_conditions/attack_coffee':
          case '/combat_trigger_conditions/defense_coffee':
          case '/combat_trigger_conditions/lucky_coffee':
          case '/combat_trigger_conditions/magic_coffee':
          case '/combat_trigger_conditions/melee_coffee':
          case '/combat_trigger_conditions/ranged_coffee':
          case '/combat_trigger_conditions/swiftness_coffee':
          case '/combat_trigger_conditions/wisdom_coffee':
          case '/combat_trigger_conditions/ice_spear':
          case '/combat_trigger_conditions/puncture':
          case '/combat_trigger_conditions/frost_surge':
          case '/combat_trigger_conditions/elusiveness':
          case '/combat_trigger_conditions/channeling_coffee':
          case '/combat_trigger_conditions/fierce_aura':
          case '/combat_trigger_conditions/invincible_armor':
          case '/combat_trigger_conditions/invincible_fire_resistance':
          case '/combat_trigger_conditions/invincible_nature_resistance':
          case '/combat_trigger_conditions/invincible_water_resistance':
          case '/combat_trigger_conditions/provoke':
          case '/combat_trigger_conditions/taunt':
          case '/combat_trigger_conditions/crippling_slash':
          case '/combat_trigger_conditions/mana_spring':
          case '/combat_trigger_conditions/retribution':
          case '/combat_trigger_conditions/fracturing_impact':
          case '/combat_trigger_conditions/maim':
          case '/combat_trigger_conditions/curse':
          case '/combat_trigger_conditions/weaken':
            let buffHrid = '/buff_uniques';
            buffHrid += this.conditionHrid.slice(this.conditionHrid.lastIndexOf('/'));
            return source.combatBuffs[buffHrid];

          case '/combat_trigger_conditions/critical_aura':
          case '/combat_trigger_conditions/critical_coffee':
          case '/combat_trigger_conditions/intelligence_coffee':
          case '/combat_trigger_conditions/stamina_coffee':
          case '/combat_trigger_conditions/elemental_affinity':
          case '/combat_trigger_conditions/fury':
          case '/combat_trigger_conditions/guardian_aura':
          case '/combat_trigger_conditions/insanity':
          case '/combat_trigger_conditions/spike_shell':
          case '/combat_trigger_conditions/toxic_pollen':
          case '/combat_trigger_conditions/invincible':
          case '/combat_trigger_conditions/mystic_aura':
          case '/combat_trigger_conditions/pestilent_shot':
          case '/combat_trigger_conditions/smoke_burst':
          case '/combat_trigger_conditions/speed_aura':
          case '/combat_trigger_conditions/toughness':
          case '/combat_trigger_conditions/enrage':
            let buffPrefix = '/buff_uniques';
            buffPrefix += this.conditionHrid.slice(this.conditionHrid.lastIndexOf('/'));
            let buffs = Object.keys(source.combatBuffs).filter((buff) => buff.startsWith(buffPrefix));
            return source.combatBuffs[buffs?.[0]];

          case '/combat_trigger_conditions/current_hp':
            return source.combatDetails.currentHitpoints;

          case '/combat_trigger_conditions/current_mp':
            return source.combatDetails.currentManapoints;

          case '/combat_trigger_conditions/missing_hp':
            return source.combatDetails.maxHitpoints - source.combatDetails.currentHitpoints;

          case '/combat_trigger_conditions/missing_mp':
            return source.combatDetails.maxManapoints - source.combatDetails.currentManapoints;

          case '/combat_trigger_conditions/stun_status':
            return source.isStunned || source.stunExpireTime == currentTime;

          case '/combat_trigger_conditions/blind_status':
            return source.isBlinded || source.blindExpireTime == currentTime;

          case '/combat_trigger_conditions/silence_status':
            return source.isSilenced || source.silenceExpireTime == currentTime;

          default:
            throw new Error('Unknown conditionHrid in trigger: ' + this.conditionHrid);
        }
      }
      compareValue(dependencyValue) {
        switch (this.comparatorHrid) {
          case '/combat_trigger_comparators/greater_than_equal':
            return dependencyValue >= this.value;

          case '/combat_trigger_comparators/less_than_equal':
            return dependencyValue <= this.value;

          case '/combat_trigger_comparators/is_active':
            return !!dependencyValue;

          case '/combat_trigger_comparators/is_inactive':
            return !dependencyValue;

          default:
            throw new Error('Unknown comparatorHrid in trigger: ' + this.comparatorHrid);
        }
      }
    };
    var trigger_default = Trigger;
    var abilityFromCombatStat = {
      blaze: {
        hrid: '/abilities/blaze',
        name: 'Blaze',
        description: '',
        isSpecialAbility: false,
        manaCost: 0,
        cooldownDuration: 0,
        castDuration: 0,
        abilityEffects: [
          {
            targetType: 'allEnemies',
            effectType: '/ability_effect_types/damage',
            combatStyleHrid: '/combat_styles/magic',
            damageType: '/damage_types/fire',
            baseDamageFlat: 0,
            baseDamageFlatLevelBonus: 0,
            baseDamageRatio: 0.3,
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
          }
        ],
        defaultCombatTriggers: [
          {
            dependencyHrid: '/combat_trigger_dependencies/all_enemies',
            conditionHrid: '/combat_trigger_conditions/number_of_active_units',
            comparatorHrid: '/combat_trigger_comparators/greater_than_equal',
            value: 1
          }, {
            dependencyHrid: '/combat_trigger_dependencies/all_enemies',
            conditionHrid: '/combat_trigger_conditions/current_hp',
            comparatorHrid: '/combat_trigger_comparators/greater_than_equal',
            value: 1
          }
        ]
      },
      bloom: {
        hrid: '/abilities/bloom',
        name: 'Bloom',
        description: '',
        isSpecialAbility: false,
        manaCost: 0,
        cooldownDuration: 0,
        castDuration: 0,
        abilityEffects: [
          {
            targetType: 'lowestHpAlly',
            effectType: '/ability_effect_types/heal',
            combatStyleHrid: '/combat_styles/magic',
            damageType: '',
            baseDamageFlat: 10,
            baseDamageFlatLevelBonus: 0,
            baseDamageRatio: 0.15,
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
          }
        ],
        defaultCombatTriggers: [
          {
            dependencyHrid: '/combat_trigger_dependencies/all_allies',
            conditionHrid: '/combat_trigger_conditions/lowest_hp_percentage',
            comparatorHrid: '/combat_trigger_comparators/less_than_equal',
            value: 100
          }
        ]
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
          throw new Error('No ability found for hrid: ' + this.hrid);
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
            let trigger = new trigger_default(
              defaultTrigger.dependencyHrid,
              defaultTrigger.conditionHrid,
              defaultTrigger.comparatorHrid,
              defaultTrigger.value
            );
            this.triggers.push(trigger);
          }
        }
        this.lastUsed = Number.MIN_SAFE_INTEGER;
      }
      static createFromDTO(dto) {
        let triggers = dto.triggers.map((trigger) => trigger_default.createFromDTO(trigger));
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
          cooldownDuration = (cooldownDuration * 100) / (100 + haste);
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
        __publicField(this, 'isPlayer');
        __publicField(this, 'isStunned', false);
        __publicField(this, 'stunExpireTime', null);
        __publicField(this, 'isBlinded', false);
        __publicField(this, 'blindExpireTime', null);
        __publicField(this, 'isSilenced', false);
        __publicField(this, 'silenceExpireTime', null);
        __publicField(this, 'isOutOfMana', false);
        __publicField(this, 'staminaLevel', 1);
        __publicField(this, 'intelligenceLevel', 1);
        __publicField(this, 'attackLevel', 1);
        __publicField(this, 'meleeLevel', 1);
        __publicField(this, 'defenseLevel', 1);
        __publicField(this, 'rangedLevel', 1);
        __publicField(this, 'magicLevel', 1);
        __publicField(this, 'experience', 0);
        __publicField(this, 'experienceRate', 0);
        __publicField(this, 'enrageTime', 0);
        __publicField(this, 'abilities', [
          null, null, null, null
        ]);
        __publicField(this, 'food', [
          null, null, null
        ]);
        __publicField(this, 'drinks', [
          null, null, null
        ]);
        __publicField(this, 'houseRooms', []);
        __publicField(this, 'achievements', null);
        __publicField(this, 'dropTable', []);
        __publicField(this, 'rareDropTable', []);
        __publicField(this, 'abilityManaCosts', new Map());
        __publicField(this, 'combatDetails', {
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
          totalArmor: 0.2,
          totalWaterResistance: 0.4,
          totalNatureResistance: 0.4,
          totalFireResistance: 0.4,
          abilityHaste: 0,
          tenacity: 0,
          totalThreat: 100,
          combatStats: {
            combatStyleHrid: '/combat_styles/smash',
            damageType: '/damage_types/physical',
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
            hpRegenPer10: 0.01,
            mpRegenPer10: 0.01,
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
            primaryTraining: '',
            focusTraining: '',
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
        __publicField(this, 'combatBuffs', {});
        __publicField(this, 'permanentBuffs', {});
        __publicField(this, 'zoneBuffs', {});
        __publicField(this, 'extraBuffs', {});
      }
      updateCombatDetails() {
        if (this.isPlayer) {
          if (this.combatDetails.combatStats.hpRegenPer10 === 0) {
            this.combatDetails.combatStats.hpRegenPer10 = 0.01;
          } else {
            this.combatDetails.combatStats.hpRegenPer10 = 0.01 + this.combatDetails.combatStats.hpRegenPer10;
          }
          if (this.combatDetails.combatStats.mpRegenPer10 === 0) {
            this.combatDetails.combatStats.mpRegenPer10 = 0.01;
          } else {
            this.combatDetails.combatStats.mpRegenPer10 = 0.01 + this.combatDetails.combatStats.mpRegenPer10;
          }
        }
        [
          'stamina', 'intelligence', 'attack', 'melee', 'defense',
          'ranged', 'magic'
        ].forEach((stat) => {
          this.combatDetails[stat + 'Level'] = this[stat + 'Level'];
          let boosts = this.getBuffBoosts('/buff_types/' + stat + '_level');
          boosts.forEach((buff) => {
            this.combatDetails[stat + 'Level'] += this[stat + 'Level'] * buff.ratioBoost;
            this.combatDetails[stat + 'Level'] += buff.flatBoost;
          });
        });
        this.combatDetails.maxHitpoints = Math.floor(
          (10 * (10 + this.combatDetails.staminaLevel) + this.combatDetails.combatStats.maxHitpoints) *
            (1 + this.combatDetails.combatStats.maxHitpointsRatio)
        );
        this.combatDetails.maxManapoints = Math.floor(
          (10 * (10 + this.combatDetails.intelligenceLevel) + this.combatDetails.combatStats.maxManapoints) *
            (1 + this.combatDetails.combatStats.maxManapointsRatio)
        );
        let accuracyRatioBoostFromFury = this.getBuffBoost('/buff_types/fury_accuracy').ratioBoost;
        let damageRatioBoostFromFury = this.getBuffBoost('/buff_types/fury_damage').ratioBoost;
        let accuracyRatioBoost = this.getBuffBoost('/buff_types/accuracy').ratioBoost;
        let damageRatioBoost = this.getBuffBoost('/buff_types/damage').ratioBoost;
        [
          'stab', 'slash', 'smash'
        ].forEach((style) => {
          this.combatDetails[style + 'AccuracyRating'] =
            (10 + this.combatDetails.attackLevel) *
            (1 + this.combatDetails.combatStats[style + 'Accuracy']) *
            (1 + accuracyRatioBoost) *
            (1 + accuracyRatioBoostFromFury);
          this.combatDetails[style + 'MaxDamage'] =
            (10 + this.combatDetails.meleeLevel) *
            (1 + this.combatDetails.combatStats[style + 'Damage']) *
            (1 + damageRatioBoost) *
            (1 + damageRatioBoostFromFury);
          let baseEvasion =
            (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats[style + 'Evasion']);
          this.combatDetails[style + 'EvasionRating'] = baseEvasion;
          let evasionBoosts2 = this.getBuffBoosts('/buff_types/evasion');
          for (const boost of evasionBoosts2) {
            this.combatDetails[style + 'EvasionRating'] += boost.flatBoost;
            this.combatDetails[style + 'EvasionRating'] += baseEvasion * boost.ratioBoost;
          }
        });
        this.combatDetails.defensiveMaxDamage =
          (10 + this.combatDetails.defenseLevel) *
          (1 + this.combatDetails.combatStats.defensiveDamage) *
          (1 + damageRatioBoost) *
          (1 + damageRatioBoostFromFury);
        if (this.equipment?.['/equipment_types/two_hand']?.hrid.includes('bulwark')) {
          this.combatDetails.smashMaxDamage += this.combatDetails.defensiveMaxDamage;
        }
        this.combatDetails.rangedAccuracyRating =
          (10 + this.combatDetails.attackLevel) *
          (1 + this.combatDetails.combatStats.rangedAccuracy) *
          (1 + accuracyRatioBoost) *
          (1 + accuracyRatioBoostFromFury);
        this.combatDetails.rangedMaxDamage =
          (10 + this.combatDetails.rangedLevel) *
          (1 + this.combatDetails.combatStats.rangedDamage) *
          (1 + damageRatioBoost) *
          (1 + damageRatioBoostFromFury);
        let baseRangedEvasion =
          (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.rangedEvasion);
        this.combatDetails.rangedEvasionRating = baseRangedEvasion;
        let evasionBoosts = this.getBuffBoosts('/buff_types/evasion');
        for (const boost of evasionBoosts) {
          this.combatDetails.rangedEvasionRating += boost.flatBoost;
          this.combatDetails.rangedEvasionRating += baseRangedEvasion * boost.ratioBoost;
        }
        this.combatDetails.combatStats.damageTaken = this.getBuffBoost('/buff_types/damage_taken').flatBoost;
        this.combatDetails.magicAccuracyRating =
          (10 + this.combatDetails.attackLevel) *
          (1 + this.combatDetails.combatStats.magicAccuracy) *
          (1 + accuracyRatioBoost) *
          (1 + accuracyRatioBoostFromFury);
        this.combatDetails.magicMaxDamage =
          (10 + this.combatDetails.magicLevel) *
          (1 + this.combatDetails.combatStats.magicDamage) *
          (1 + damageRatioBoost) *
          (1 + damageRatioBoostFromFury);
        let baseMagicEvasion =
          (10 + this.combatDetails.defenseLevel) * (1 + this.combatDetails.combatStats.magicEvasion);
        this.combatDetails.magicEvasionRating = baseMagicEvasion;
        for (const boost of evasionBoosts) {
          this.combatDetails.magicEvasionRating += boost.flatBoost;
          this.combatDetails.magicEvasionRating += baseMagicEvasion * boost.ratioBoost;
        }
        this.combatDetails.combatStats.physicalAmplify += this.getBuffBoost('/buff_types/physical_amplify').flatBoost;
        this.combatDetails.combatStats.waterAmplify += this.getBuffBoost('/buff_types/water_amplify').flatBoost;
        this.combatDetails.combatStats.natureAmplify += this.getBuffBoost('/buff_types/nature_amplify').flatBoost;
        this.combatDetails.combatStats.fireAmplify += this.getBuffBoost('/buff_types/fire_amplify').flatBoost;
        this.combatDetails.combatStats.healingAmplify += this.getBuffBoost('/buff_types/healing_amplify').flatBoost;
        this.combatDetails.combatStats.attackInterval /= 1 + this.combatDetails.attackLevel / 2e3;
        let baseAttackSpeed = this.combatDetails.combatStats.attackSpeed;
        this.combatDetails.combatStats.attackInterval /= 1 + baseAttackSpeed;
        let attackIntervalBoosts = this.getBuffBoosts('/buff_types/attack_speed');
        let attackIntervalRatioBoost = attackIntervalBoosts
          .map((boost) => boost.ratioBoost)
          .reduce((prev, cur) => prev + cur, 0);
        this.combatDetails.combatStats.attackInterval /= 1 + attackIntervalRatioBoost;
        let baseArmor = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.armor;
        this.combatDetails.totalArmor = baseArmor;
        let armorBoosts = this.getBuffBoosts('/buff_types/armor');
        for (const boost of armorBoosts) {
          this.combatDetails.totalArmor += boost.flatBoost;
          this.combatDetails.totalArmor += baseArmor * boost.ratioBoost;
        }
        let baseWaterResistance =
          0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.waterResistance;
        this.combatDetails.totalWaterResistance = baseWaterResistance;
        let waterResistanceBoosts = this.getBuffBoosts('/buff_types/water_resistance');
        for (const boost of waterResistanceBoosts) {
          this.combatDetails.totalWaterResistance += boost.flatBoost;
          this.combatDetails.totalWaterResistance += baseWaterResistance * boost.ratioBoost;
        }
        let baseNatureResistance =
          0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.natureResistance;
        this.combatDetails.totalNatureResistance = baseNatureResistance;
        let natureResistanceBoosts = this.getBuffBoosts('/buff_types/nature_resistance');
        for (const boost of natureResistanceBoosts) {
          this.combatDetails.totalNatureResistance += boost.flatBoost;
          this.combatDetails.totalNatureResistance += baseNatureResistance * boost.ratioBoost;
        }
        let baseFireResistance = 0.2 * this.combatDetails.defenseLevel + this.combatDetails.combatStats.fireResistance;
        this.combatDetails.totalFireResistance = baseFireResistance;
        let fireResistanceBoosts = this.getBuffBoosts('/buff_types/fire_resistance');
        for (const boost of fireResistanceBoosts) {
          this.combatDetails.totalFireResistance += boost.flatBoost;
          this.combatDetails.totalFireResistance += baseFireResistance * boost.ratioBoost;
        }
        let hpRegenBoosts = this.getBuffBoost('/buff_types/hp_regen');
        this.combatDetails.combatStats.hpRegenPer10 +=
          this.combatDetails.combatStats.hpRegenPer10 * hpRegenBoosts.ratioBoost;
        this.combatDetails.combatStats.hpRegenPer10 += hpRegenBoosts.flatBoost;
        let mpRegenBoosts = this.getBuffBoost('/buff_types/mp_regen');
        this.combatDetails.combatStats.mpRegenPer10 +=
          this.combatDetails.combatStats.mpRegenPer10 * mpRegenBoosts.ratioBoost;
        this.combatDetails.combatStats.mpRegenPer10 += mpRegenBoosts.flatBoost;
        this.combatDetails.combatStats.lifeSteal += this.getBuffBoost('/buff_types/life_steal').flatBoost;
        this.combatDetails.combatStats.physicalThorns += this.getBuffBoost('/buff_types/physical_thorns').flatBoost;
        this.combatDetails.combatStats.elementalThorns += this.getBuffBoost('/buff_types/elemental_thorns').flatBoost;
        this.combatDetails.combatStats.combatExperience += this.getBuffBoost('/buff_types/wisdom').flatBoost;
        this.combatDetails.combatStats.criticalRate += this.getBuffBoost('/buff_types/critical_rate').flatBoost;
        this.combatDetails.combatStats.criticalDamage += this.getBuffBoost('/buff_types/critical_damage').flatBoost;
        this.combatDetails.combatStats.castSpeed += this.getBuffBoost('/buff_types/cast_speed').flatBoost;
        this.combatDetails.combatStats.castSpeed += this.combatDetails['attackLevel'] / 2e3;
        let combatDropRateBoosts = this.getBuffBoost('/buff_types/combat_drop_rate');
        this.combatDetails.combatStats.combatDropRate +=
          (1 + this.combatDetails.combatStats.combatDropRate) * combatDropRateBoosts.ratioBoost;
        this.combatDetails.combatStats.combatDropRate += combatDropRateBoosts.flatBoost;
        let combatRareFindBoosts = this.getBuffBoost('/buff_types/rare_find');
        this.combatDetails.combatStats.combatRareFind +=
          (1 + this.combatDetails.combatStats.combatRareFind) * combatRareFindBoosts.ratioBoost;
        this.combatDetails.combatStats.combatRareFind += combatRareFindBoosts.flatBoost;
        let combatDropQuantityBoosts = this.getBuffBoost('/buff_types/combat_drop_quantity');
        this.combatDetails.combatStats.combatDropQuantity +=
          (1 + this.combatDetails.combatStats.combatDropQuantity) * combatDropQuantityBoosts.ratioBoost;
        this.combatDetails.combatStats.combatDropQuantity += combatDropQuantityBoosts.flatBoost;
        let baseThreat = 100 + this.combatDetails.combatStats.threat;
        this.combatDetails.totalThreat = baseThreat;
        let threatBoosts = this.getBuffBoost('/buff_types/threat');
        if (threatBoosts.ratioBoost !== 0) {
          this.combatDetails.combatStats.threat += baseThreat * threatBoosts.ratioBoost;
        } else {
          this.combatDetails.combatStats.threat = baseThreat;
        }
        this.combatDetails.combatStats.threat += threatBoosts.flatBoost;
        this.combatDetails.combatStats.retaliation += this.getBuffBoost('/buff_types/retaliation').flatBoost;
        this.combatDetails.combatStats.tenacity += this.getBuffBoost('/buff_types/tenacity').flatBoost;
      }
      addBuffs(buffs, currentTime) {
        buffs.forEach((buff) => (buff.startTime = currentTime));
        let needUpdate = false;
        for (const buff of buffs) {
          if (
            !this.combatBuffs[buff.uniqueHrid] ||
            this.combatBuffs[buff.uniqueHrid].ratioBoost != buff.ratioBoost ||
            this.combatBuffs[buff.uniqueHrid].flatBoost != buff.flatBoost
          ) {
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
        if (
          this.combatBuffs[buff.uniqueHrid] &&
          this.combatBuffs[buff.uniqueHrid].ratioBoost === buff.ratioBoost &&
          this.combatBuffs[buff.uniqueHrid].flatBoost === buff.flatBoost
        ) {
          needUpdate = false;
        }
        this.combatBuffs[buff.uniqueHrid] = buff;
        if (needUpdate) {
          this.updateCombatDetails();
        }
      }
      removeBuffs(buffs) {
        let needUpdate = false;
        buffs.forEach((buff) => {
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
          houseRoom.buffs.forEach((buff) => {
            this.addPermanentBuff(buff);
          });
        }
        if (this.achievements) {
          this.achievements.buffs.forEach((buff) => {
            this.addPermanentBuff(buff);
          });
        }
        if (this.zoneBuffs) {
          this.zoneBuffs.forEach((buff) => {
            this.addPermanentBuff(buff);
          });
        }
        if (this.extraBuffs) {
          this.extraBuffs.forEach((buff) => {
            this.addPermanentBuff(buff);
          });
        }
      }
      removeExpiredBuffs(currentTime) {
        let expiredBuffs = Object.values(this.combatBuffs).filter(
          (buff) => buff.startTime + buff.duration <= currentTime
        );
        expiredBuffs.forEach((buff) => {
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
        Object.values(this.combatBuffs)
          .filter((buff) => buff.typeHrid == type)
          .forEach((buff) => {
            boosts.push({ratioBoost: buff.ratioBoost, flatBoost: buff.flatBoost});
          });
        return boosts;
      }
      getBuffBoost(type) {
        let boosts = this.getBuffBoosts(type);
        let boost = {ratioBoost: 0, flatBoost: 0};
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
        this.food.filter((food) => food != null).forEach((food) => (food.lastUsed = Number.MIN_SAFE_INTEGER));
        this.drinks.filter((drink) => drink != null).forEach((drink) => (drink.lastUsed = Number.MIN_SAFE_INTEGER));
        let haste = this.combatDetails.combatStats.abilityHaste;
        this.abilities
          .filter((ability) => ability != null)
          .forEach((ability) => {
            if (this.isPlayer) {
              ability.lastUsed = Number.MIN_SAFE_INTEGER;
            } else {
              let cooldownDuration = ability.cooldownDuration;
              if (haste > 0) {
                cooldownDuration = (cooldownDuration * 100) / (100 + haste);
              }
              ability.lastUsed =
                currentTime - Math.floor(cooldownDuration * 0.5) + Math.floor(Math.random() * cooldownDuration * 0.5);
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
        let newManapoints = Math.min(
          this.combatDetails.currentManapoints + manapoints,
          this.combatDetails.maxManapoints
        );
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
        __publicField(this, 'difficultyTier', 0);
        __publicField(this, 'LabyrinthMonsterBaseRoomLevel', 100);
        __publicField(this, 'roomLevel', 0);
        this.isPlayer = false;
        this.hrid = hrid;
        this.difficultyTier = difficultyTier;
        this.roomLevel = roomLevel;
        if (this.roomLevel <= 0) {
          this.roomLevel = this.LabyrinthMonsterBaseRoomLevel;
        }
        let gameMonster = combatMonsterDetailMap_default[this.hrid];
        if (!gameMonster) {
          throw new Error('No monster found for hrid: ' + this.hrid);
        }
        this.enrageTime = gameMonster.enrageTime;
        let labyrinthScaleFactor = this.roomLevel / this.LabyrinthMonsterBaseRoomLevel;
        for (let i = 0; i < gameMonster.abilities.length; i++) {
          if (gameMonster.abilities[i].minDifficultyTier > this.difficultyTier) {
            continue;
          }
          this.abilities[i] = new ability_default(
            gameMonster.abilities[i].abilityHrid,
            Math.floor(gameMonster.abilities[i].level * labyrinthScaleFactor)
          );
        }
        if (gameMonster.dropTable)
          for (let i = 0; i < gameMonster.dropTable.length; i++) {
            this.dropTable[i] = new drops_default(
              gameMonster.dropTable[i].itemHrid,
              gameMonster.dropTable[i].dropRate,
              gameMonster.dropTable[i].minCount,
              gameMonster.dropTable[i].maxCount,
              gameMonster.dropTable[i].difficultyTier
            );
          }
        for (let i = 0; i < gameMonster.rareDropTable.length; i++) {
          let dropTableItem =
            gameMonster.dropTable && i < gameMonster.dropTable.length ? gameMonster.dropTable[i] : null;
          let difficultyTier2 = dropTableItem?.difficultyTier ?? gameMonster.rareDropTable[i].minDifficultyTier;
          this.rareDropTable[i] = new drops_default(
            gameMonster.rareDropTable[i].itemHrid,
            gameMonster.rareDropTable[i].dropRate,
            gameMonster.rareDropTable[i].minCount,
            difficultyTier2
          );
        }
      }
      updateCombatDetails() {
        let gameMonster = combatMonsterDetailMap_default[this.hrid];
        let levelMultiplier = 1 + 0.25 * this.difficultyTier;
        let defLevelMultiplier = 1 + 0.15 * this.difficultyTier;
        let levelBonus = 20 * this.difficultyTier;
        let labyrinthScaleFactor = this.roomLevel / this.LabyrinthMonsterBaseRoomLevel;
        this.staminaLevel =
          levelMultiplier * (gameMonster.combatDetails.staminaLevel + levelBonus) * labyrinthScaleFactor;
        this.intelligenceLevel =
          levelMultiplier * (gameMonster.combatDetails.intelligenceLevel + levelBonus) * labyrinthScaleFactor;
        this.attackLevel =
          levelMultiplier * (gameMonster.combatDetails.attackLevel + levelBonus) * labyrinthScaleFactor;
        this.meleeLevel = levelMultiplier * (gameMonster.combatDetails.meleeLevel + levelBonus) * labyrinthScaleFactor;
        this.defenseLevel =
          defLevelMultiplier * (gameMonster.combatDetails.defenseLevel + levelBonus) * labyrinthScaleFactor;
        this.rangedLevel =
          levelMultiplier * (gameMonster.combatDetails.rangedLevel + levelBonus) * labyrinthScaleFactor;
        this.magicLevel = levelMultiplier * (gameMonster.combatDetails.magicLevel + levelBonus) * labyrinthScaleFactor;
        let expMultiplier = 1 + 0.5 * this.difficultyTier;
        let expBonus = 5 * this.difficultyTier;
        this.experience = expMultiplier * (gameMonster.experience + expBonus);
        this.combatDetails.combatStats.combatStyleHrid = gameMonster.combatDetails.combatStats.combatStyleHrids[0];
        for (const [
          key, value
        ] of Object.entries(gameMonster.combatDetails.combatStats)) {
          this.combatDetails.combatStats[key] = value;
        }
        this.combatDetails.combatStats.armor *= labyrinthScaleFactor;
        this.combatDetails.combatStats.waterResistance *= labyrinthScaleFactor;
        this.combatDetails.combatStats.natureResistance *= labyrinthScaleFactor;
        this.combatDetails.combatStats.fireResistance *= labyrinthScaleFactor;
        [
          'stabAccuracy', 'slashAccuracy', 'smashAccuracy', 'rangedAccuracy', 'magicAccuracy',
          'stabDamage', 'slashDamage', 'smashDamage', 'rangedDamage', 'magicDamage',
          'defensiveDamage', 'taskDamage', 'physicalAmplify', 'waterAmplify', 'natureAmplify',
          'fireAmplify', 'healingAmplify', 'stabEvasion', 'slashEvasion', 'smashEvasion',
          'rangedEvasion', 'magicEvasion', 'armor', 'waterResistance', 'natureResistance',
          'fireResistance', 'maxHitpoints', 'maxManapoints', 'lifeSteal', 'hpRegenPer10',
          'mpRegenPer10', 'physicalThorns', 'elementalThorns', 'combatDropRate', 'combatRareFind',
          'combatDropQuantity', 'combatExperience', 'criticalRate', 'criticalDamage', 'armorPenetration',
          'waterPenetration', 'naturePenetration', 'firePenetration', 'abilityHaste', 'tenacity',
          'manaLeech', 'castSpeed', 'threat', 'parry', 'mayhem',
          'pierce', 'curse', 'fury', 'weaken', 'ripple',
          'bloom', 'blaze', 'attackSpeed', 'foodHaste', 'drinkConcentration',
          'autoAttackDamage', 'abilityDamage', 'retaliation'
        ].forEach((stat) => {
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
        this.eventQueue = new eventQueue_default();
        this.simResult = new simResult_default(zone, labyrinth, players.length);
        this.allPlayersDead = false;
        this.enableHpMpVisualization = options.enableHpMpVisualization || false;
        this.wipeLogs = {buffer: new Array(200), index: 0, count: 0, maxSize: 200};
      }
      addToWipeLogs(logEntry) {
        const {buffer: buffer, maxSize: maxSize} = this.wipeLogs;
        buffer[this.wipeLogs.index] = logEntry;
        this.wipeLogs.index = (this.wipeLogs.index + 1) % maxSize;
        this.wipeLogs.count = Math.min(this.wipeLogs.count + 1, maxSize);
      }
      logAndResetWipeLogs() {
        const logs = this.getOrderedWipeLogs();
        logs.forEach((log) => {
          if (log.error) {
            console.log(log.error);
            return;
          }
          const _time = (log.time / 1e9).toFixed(2);
        });
        this.wipeLogs.index = 0;
        this.wipeLogs.count = 0;
      }
      buildCombatLog(source, ability, target, damageDone) {
        try {
          const sourceHrid = source?.hrid || 'UNKNOWN_SOURCE';
          const targetHrid = target?.hrid || 'UNKNOWN_TARGET';
          const afterHp = target?.combatDetails?.currentHitpoints || 0;
          const beforeHp = Math.max(0, afterHp + damageDone);
          const playersHp = this.players.map((p) => ({
            hrid: p.hrid || 'UNKNOWN_PLAYER',
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
          return {error: `[日志生成错误] ${e.message}`};
        }
      }
      generateCombatLog(source, ability, target, attackResult) {
        try {
          const sourceHrid = source?.hrid || 'UNKNOWN_SOURCE';
          const targetHrid = target?.hrid || 'UNKNOWN_TARGET';
          const damage = attackResult?.damageDone || 0;
          const afterHp = target?.combatDetails?.currentHitpoints || 0;
          const beforeHp = Math.max(0, afterHp + damage);
          const playersHp = this.players.map((p) => ({
            hrid: p.hrid || 'UNKNOWN_PLAYER',
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
          return {error: `[日志生成错误] ${e.message}`};
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
            let progressEvent = new CustomEvent('progress', {
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
          console.log('Timeout now at wave #' + (this.zone.encountersKilled - 1));
          this.simResult.dungeonsCompleted = this.zone.dungeonsCompleted;
          this.simResult.dungeonsFailed = this.zone.dungeonsFailed;
          if (this.simResult.dungeonsCompleted < 1) {
            this.simResult.maxWaveReached = 0;
            for (let i = 1; i <= this.zone.dungeonSpawnInfo.maxWaves; i++) {
              let waveName = '#' + i.toString();
              const idx = this.simResult.timeSpentAlive.findIndex((e) => e.name === waveName);
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
          Object.entries(this.zone.dungeonSpawnInfo.fixedSpawnsMap).forEach(
            ([
              wave, monsters
            ]) => {
              let waveName = '#' + wave.toString();
              monsters.forEach((monster) => {
                waveName += ',' + monster.combatMonsterHrid;
              });
              this.simResult.bossSpawns.push(waveName);
            }
          );
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
        let respawningPlayer = this.players.find((player) => player.hrid === event.hrid);
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
      processEnemyRespawnEvent(_event) {
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
            this.simResult.updateTimeSpentAlive(
              '#' + (this.zone.encountersKilled - 1).toString(),
              true,
              this.simulationTime
            );
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
        this.enemies.forEach((enemy) => {
          enemy.reset(this.simulationTime);
          this.simResult.updateTimeSpentAlive(enemy.hrid, true, this.simulationTime);
        });
        this.eventQueue.clearEventsOfType(enrageTickEvent_default.type);
        let enrageTickEvent = new enrageTickEvent_default(
          this.simulationTime + ENRAGE_TICK_INTERVAL,
          ENRAGE_TICK_INTERVAL
        );
        this.eventQueue.addEvent(enrageTickEvent);
        this.enrageBeginTime = this.simulationTime;
        this.eventQueue.clearEventsOfType(abilityCastEndEvent_default.type);
        this.checkTriggers();
        this.startAttacks();
      }
      startAttacks() {
        let units = [
          ...this.players
        ];
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
        let parryUnits = targets.filter(
          (unit) => unit && unit.combatDetails.currentHitpoints > 0 && unit.combatDetails.combatStats.parry > 0
        );
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
        const aliveTargets = targets.filter((unit) => unit && unit.combatDetails.currentHitpoints > 0);
        for (let i = 0; i < aliveTargets.length; i++) {
          let target = aliveTargets[i];
          if (!event.source.isPlayer && aliveTargets.length > 1) {
            let cumulativeThreat = 0;
            let cumulativeRanges = [];
            aliveTargets.forEach((player) => {
              let playerThreat = player.combatDetails.combatStats.threat;
              cumulativeThreat += playerThreat;
              cumulativeRanges.push({
                player: player,
                rangeStart: cumulativeThreat - playerThreat,
                rangeEnd: cumulativeThreat
              });
            });
            let randomValueHit = Math.random() * cumulativeThreat;
            target = cumulativeRanges.find(
              (range) => randomValueHit >= range.rangeStart && randomValueHit < range.rangeEnd
            ).player;
          }
          let source = event.source;
          let parryTarget = this.checkParry(targets);
          if (parryTarget) {
            target = source;
            source = parryTarget;
          }
          let attackResult = combatUtilities_default.processAttack(source, target);
          if (this.zone?.isDungeon && target.isPlayer && attackResult.didHit && attackResult.damageDone > 0) {
            const log = this.generateCombatLog(source, 'autoAttack', target, attackResult);
            this.addToWipeLogs(log);
          }
          let mayhem = source.combatDetails.combatStats.mayhem > Math.random();
          if (attackResult.didHit && source.combatDetails.combatStats.curse > 0) {
            const curseExpireTime = 15e9;
            let currentCurseEvent = this.eventQueue.getMatching(
              (event2) => event2.type == curseExpirationEvent_default.type && event2.source == target
            );
            let currentCurseAmount = 0;
            if (currentCurseEvent) currentCurseAmount = currentCurseEvent.curseAmount;
            this.eventQueue.clearMatching(
              (event2) => event2.type == curseExpirationEvent_default.type && event2.source == target
            );
            let curseExpirationEvent = new curseExpirationEvent_default(
              this.simulationTime + curseExpireTime,
              currentCurseAmount,
              target
            );
            const curseBuff = {
              uniqueHrid: '/buff_uniques/curse',
              typeHrid: '/buff_types/damage_taken',
              ratioBoost: 0,
              ratioBoostLevelBonus: 0,
              flatBoost: source.combatDetails.combatStats.curse * curseExpirationEvent.curseAmount,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: curseExpireTime
            };
            target.addBuff(curseBuff, this.simulationTime);
            this.eventQueue.addEvent(curseExpirationEvent);
          }
          if (source.combatDetails.combatStats.fury > 0) {
            let currentFuryEvent = this.eventQueue.getMatching(
              (event2) => event2.type == furyExpirationEvent_default.type && event2.source == source
            );
            this.eventQueue.clearMatching(
              (event2) => event2.type == furyExpirationEvent_default.type && event2.source == source
            );
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
              uniqueHrid: '/buff_uniques/fury_accuracy',
              typeHrid: '/buff_types/fury_accuracy',
              ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
              ratioBoostLevelBonus: 0,
              flatBoost: 0,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: furyExpireTime
            };
            const furyDamageBuf = {
              uniqueHrid: '/buff_uniques/fury_damage',
              typeHrid: '/buff_types/fury_damage',
              ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
              ratioBoostLevelBonus: 0,
              flatBoost: 0,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: furyExpireTime
            };
            if (furyAmount > 0) {
              let furyExpirationEvent = new furyExpirationEvent_default(
                this.simulationTime + furyExpireTime,
                furyAmount,
                source
              );
              this.eventQueue.addEvent(furyExpirationEvent);
              source.addBuffs(
                [
                  furyAccuracyBuf, furyDamageBuf
                ],
                this.simulationTime
              );
            } else {
              source.removeBuffs([
                furyAccuracyBuf, furyDamageBuf
              ]);
            }
          }
          if (target.combatDetails.combatStats.weaken > 0) {
            const weakenExpireTime = 15e9;
            let currentWeakenEvent = this.eventQueue.getMatching(
              (event2) => event2.type == weakenExpirationEvent_default.type && event2.source == source
            );
            let weakenAmount = 0;
            if (currentWeakenEvent) weakenAmount = currentWeakenEvent.weakenAmount;
            this.eventQueue.clearMatching(
              (event2) => event2.type == weakenExpirationEvent_default.type && event2.source == source
            );
            let weakenExpirationEvent = new weakenExpirationEvent_default(
              this.simulationTime + 15e9,
              weakenAmount,
              source
            );
            const weakenBuff = {
              uniqueHrid: '/buff_uniques/weaken',
              typeHrid: '/buff_types/damage',
              ratioBoost: -1 * target.combatDetails.combatStats.weaken * weakenExpirationEvent.weakenAmount,
              ratioBoostLevelBonus: 0,
              flatBoost: 0,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: weakenExpireTime
            };
            source.addBuff(weakenBuff, this.simulationTime);
            this.eventQueue.addEvent(weakenExpirationEvent);
          }
          if (!mayhem || (mayhem && attackResult.didHit) || (mayhem && i == aliveTargets.length - 1)) {
            let attackType = 'autoAttack';
            if (parryTarget) attackType = 'parry';
            this.simResult.addAttack(
              source,
              target,
              attackType,
              attackResult.didHit ? attackResult.damageDone : 'miss'
            );
          }
          if (attackResult.lifeStealHeal > 0) {
            this.simResult.addHitpointsGained(source, 'lifesteal', attackResult.lifeStealHeal);
          }
          if (attackResult.manaLeechMana > 0) {
            this.simResult.addManapointsGained(source, 'manaLeech', attackResult.manaLeechMana);
          }
          if (attackResult.thornDamageDone > 0) {
            this.simResult.addAttack(target, source, attackResult.thornType, attackResult.thornDamageDone);
          }
          if (this.zone?.isDungeon && attackResult.thornDamageDone > 0 && source.isPlayer) {
            const log = this.buildCombatLog(target, attackResult.thornType, source, attackResult.thornDamageDone);
            this.addToWipeLogs(log);
          }
          if (target.combatDetails.combatStats.retaliation > 0) {
            this.simResult.addAttack(
              target,
              source,
              'retaliation',
              attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : 'miss'
            );
          }
          if (this.zone?.isDungeon && attackResult.retaliationDamageDone > 0 && source.isPlayer) {
            const log = this.buildCombatLog(target, 'retaliation', source, attackResult.retaliationDamageDone);
            this.addToWipeLogs(log);
          }
          if (target.combatDetails.currentHitpoints == 0) {
            this.eventQueue.clearEventsForUnit(target);
            this.simResult.addDeath(target);
            if (!target.isPlayer) {
              this.simResult.updateTimeSpentAlive(target.hrid, false, this.simulationTime);
            }
          }
          if (
            source.combatDetails.currentHitpoints == 0 &&
            (attackResult.thornDamageDone != 0 || attackResult.retaliationDamageDone != 0)
          ) {
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
          let deadEnemies = this.enemies.filter(
            (enemy) => enemy.combatDetails.currentHitpoints <= 0 && enemy.experienceRate == 0
          );
          if (deadEnemies.length > 0) {
            deadEnemies.forEach((enemy) => {
              let aliveDuration = this.simulationTime - this.enrageBeginTime;
              if (aliveDuration > enemy.enrageTime) {
                aliveDuration = enemy.enrageTime;
              }
              enemy.experienceRate = 1 + aliveDuration / enemy.enrageTime;
            });
          }
        }
        let encounterEnded = false;
        if (this.enemies && !this.enemies.some((enemy) => enemy.combatDetails.currentHitpoints > 0)) {
          this.eventQueue.clearEventsOfType(autoAttackEvent_default.type);
          let enemyRespawnEvent = new enemyRespawnEvent_default(this.simulationTime + ENEMY_RESPAWN_INTERVAL);
          this.eventQueue.addEvent(enemyRespawnEvent);
          if (this.enemies.some((enemy) => enemy.experienceRate <= 0)) {
            console.log('WARN: Some enemies have no experience rate');
          }
          let totalExp = this.enemies
            .map((enemy) => enemy.experience * enemy.experienceRate)
            .reduce((a, b) => a + b, 0);
          this.players.forEach((player) => {
            this.simResult.addExperienceGain(player, totalExp / this.players.length);
          });
          this.enemies = null;
          if (this.zone?.isDungeon) {
            this.simResult.updateTimeSpentAlive(
              '#' + (this.zone.encountersKilled - 1).toString(),
              false,
              this.simulationTime
            );
            if (this.zone.encountersKilled > this.zone.dungeonSpawnInfo.maxWaves) {
              this.simResult.updateDungenonFinish('#1', this.simulationTime);
              this.simResult.lastDungeonFinishTime = this.simulationTime;
            }
          }
          this.simResult.addEncounterEnd();
          this.simResult.lastEncounterFinishTime = this.simulationTime;
          encounterEnded = true;
        }
        this.players.forEach((player) => {
          if (
            player.combatDetails.currentHitpoints <= 0 &&
            !this.eventQueue.containsEventOfTypeAndHrid(playerRespawnEvent_default.type, player.hrid)
          ) {
            if (this.zone && !this.zone.isDungeon) {
              let playerRespawnEvent = new playerRespawnEvent_default(
                this.simulationTime + PLAYER_RESPAWN_INTERVAL,
                player.hrid
              );
              this.eventQueue.addEvent(playerRespawnEvent);
            }
            this.simResult.addRanOutOfManaCount(player, false, this.simulationTime);
          }
        });
        if (!this.players.some((player) => player.combatDetails.currentHitpoints > 0)) {
          if (this.zone) {
            if (this.zone.isDungeon) {
              console.log(
                'All Players died at wave #' +
                  (this.zone.encountersKilled - 1) +
                  ' with ememies: ' +
                  this.enemies
                    .map(
                      (enemy) =>
                        enemy.hrid +
                        '(' +
                        ((enemy.combatDetails.currentHitpoints * 100) / enemy.combatDetails.maxHitpoints).toFixed(2) +
                        '%)'
                    )
                    .join(', ')
              );
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
        if (
          this.eventQueue.getMatching(
            (event) =>
              (event.type == abilityCastEndEvent_default.type || event.type == autoAttackEvent_default.type) &&
              event.source == source
          )
        ) {
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
        source.abilities
          .filter((ability) => ability != null)
          .forEach((ability) => {
            if (
              !usedAbility &&
              !skipNextAbility &&
              ability.shouldTrigger(this.simulationTime, source, target, friendlies, enemies)
            ) {
              if (!this.canUseAbility(source, ability, true)) {
                skipNextAbility = true;
              }
              if (!skipNextAbility) {
                let castDuration = ability.castDuration;
                castDuration /= 1 + source.combatDetails.combatStats.castSpeed;
                let abilityCastEndEvent = new abilityCastEndEvent_default(
                  this.simulationTime + castDuration,
                  source,
                  ability
                );
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
          let autoAttackEvent = new autoAttackEvent_default(
            this.simulationTime + source.combatDetails.combatStats.attackInterval,
            source
          );
          this.eventQueue.addEvent(autoAttackEvent);
        } else {
          source.isOutOfMana = true;
        }
      }
      processConsumableTickEvent(event) {
        if (event.consumable.hitpointRestore > 0) {
          let tickValue = combatUtilities_default.calculateTickValue(
            event.consumable.hitpointRestore,
            event.totalTicks,
            event.currentTick
          );
          let hitpointsAdded = event.source.addHitpoints(tickValue);
          this.simResult.addHitpointsGained(event.source, event.consumable.hrid, hitpointsAdded);
        }
        if (event.consumable.manapointRestore > 0) {
          let tickValue = combatUtilities_default.calculateTickValue(
            event.consumable.manapointRestore,
            event.totalTicks,
            event.currentTick
          );
          let manapointsAdded = event.source.addManapoints(tickValue);
          this.simResult.addManapointsGained(event.source, event.consumable.hrid, manapointsAdded);
          if (event.source.isOutOfMana) {
            let awaitCooldownEvent = new awaitCooldownEvent_default(this.simulationTime, event.source);
            this.eventQueue.addEvent(awaitCooldownEvent);
          }
        }
        if (event.currentTick < event.totalTicks) {
          let consumableTickEvent = new consumableTickEvent_default(
            this.simulationTime + HOT_TICK_INTERVAL,
            event.source,
            event.consumable,
            event.totalTicks,
            event.currentTick + 1
          );
          this.eventQueue.addEvent(consumableTickEvent);
        }
      }
      processDamageOverTimeTickEvent(event) {
        let tickDamage = combatUtilities_default.calculateTickValue(event.damage, event.totalTicks, event.currentTick);
        let damage = Math.min(tickDamage, event.target.combatDetails.currentHitpoints);
        event.target.combatDetails.currentHitpoints -= damage;
        this.simResult.addAttack(event.sourceRef, event.target, 'damageOverTime', damage);
        if (this.zone?.isDungeon && event.target.isPlayer) {
          const log = this.buildCombatLog('', 'damageOverTime', event.target, damage);
          this.addToWipeLogs(log);
        }
        if (event.currentTick < event.totalTicks) {
          let damageOverTimeTickEvent = new damageOverTimeEvent_default(
            this.simulationTime + DOT_TICK_INTERVAL,
            event.sourceRef,
            event.target,
            event.damage,
            event.totalTicks,
            event.currentTick + 1,
            event.combatStyleHrid
          );
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
      processRegenTickEvent(_event) {
        let units = [
          ...this.players
        ];
        for (const unit of units) {
          if (unit.combatDetails.currentHitpoints <= 0) {
            continue;
          }
          let hitpointRegen = Math.floor(unit.combatDetails.maxHitpoints * unit.combatDetails.combatStats.hpRegenPer10);
          let hitpointsAdded = unit.addHitpoints(hitpointRegen);
          this.simResult.addHitpointsGained(unit, 'regen', hitpointsAdded);
          let manapointRegen = Math.floor(
            unit.combatDetails.maxManapoints * unit.combatDetails.combatStats.mpRegenPer10
          );
          let manapointsAdded = unit.addManapoints(manapointRegen);
          this.simResult.addManapointsGained(unit, 'regen', manapointsAdded);
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
        console.log('Fury Timeout');
      }
      processEnrageTickEvent(event) {
        if (!this.enemies) return;
        const maxEnrageStack = 10;
        this.enemies
          .filter((enemy) => enemy.combatDetails.currentHitpoints > 0)
          .forEach((enemy) => {
            let nowStack = Math.min(maxEnrageStack, Math.floor(event.encounterTime / enemy.enrageTime));
            if (nowStack <= 0) {
              return;
            }
            console.log(enemy.hrid, nowStack, ' stack Enrage at ', event.encounterTime / ONE_SECOND);
            const enrageDamageBuff = {
              uniqueHrid: '/buff_uniques/enrage_damage',
              typeHrid: '/buff_types/damage',
              ratioBoost: nowStack * 0.1,
              ratioBoostLevelBonus: 0,
              flatBoost: 0,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: ENRAGE_TICK_INTERVAL
            };
            const enrageAccuracyBuff = {
              uniqueHrid: '/buff_uniques/enrage_accuracy',
              typeHrid: '/buff_types/accuracy',
              ratioBoost: nowStack * 0.1,
              ratioBoostLevelBonus: 0,
              flatBoost: 0,
              flatBoostLevelBonus: 0,
              startTime: '0001-01-01T00:00:00Z',
              duration: ENRAGE_TICK_INTERVAL
            };
            enemy.addBuffs([
              enrageDamageBuff, enrageAccuracyBuff
            ]);
            this.simResult.maxEnrageStack = Math.max(this.simResult.maxEnrageStack, nowStack);
          });
        let enrageTickEvent = new enrageTickEvent_default(
          this.simulationTime + ENRAGE_TICK_INTERVAL,
          event.encounterTime + ENRAGE_TICK_INTERVAL
        );
        this.eventQueue.addEvent(enrageTickEvent);
      }
      checkTriggers() {
        let triggeredSomething;
        do {
          triggeredSomething = false;
          this.players
            .filter((player) => player.combatDetails.currentHitpoints > 0)
            .forEach((player) => {
              if (this.checkTriggersForUnit(player, this.players, this.enemies)) {
                triggeredSomething = true;
              }
            });
          if (this.enemies) {
            this.enemies
              .filter((enemy) => enemy.combatDetails.currentHitpoints > 0)
              .forEach((enemy) => {
                if (this.checkTriggersForUnit(enemy, this.enemies, this.players)) {
                  triggeredSomething = true;
                }
              });
          }
        } while (triggeredSomething);
      }
      checkTriggersForUnit(unit, friendlies, enemies) {
        if (unit.combatDetails.currentHitpoints <= 0) {
          throw new Error('Checking triggers for a dead unit');
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
        if (source.combatDetails.combatStats.drinkConcentration > 0 && consumable.catagoryHrid.includes('drink')) {
          consumeCooldown = consumeCooldown / (1 + source.combatDetails.combatStats.drinkConcentration);
        } else if (source.combatDetails.combatStats.foodHaste > 0 && consumable.catagoryHrid.includes('food')) {
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
          let consumableTickEvent = new consumableTickEvent_default(
            this.simulationTime + HOT_TICK_INTERVAL,
            source,
            consumable,
            consumable.recoveryDuration / HOT_TICK_INTERVAL,
            1
          );
          this.eventQueue.addEvent(consumableTickEvent);
        }
        for (const buff of consumable.buffs) {
          let currentBuff = structuredClone(buff);
          if (source.combatDetails.combatStats.drinkConcentration > 0 && consumable.catagoryHrid.includes('drink')) {
            currentBuff.ratioBoost *= 1 + source.combatDetails.combatStats.drinkConcentration;
            currentBuff.flatBoost *= 1 + source.combatDetails.combatStats.drinkConcentration;
            currentBuff.duration = currentBuff.duration / (1 + source.combatDetails.combatStats.drinkConcentration);
          }
          source.addBuff(currentBuff, this.simulationTime);
          let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(
            this.simulationTime + currentBuff.duration,
            source
          );
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
        let _cooldownDuration = ability.cooldownDuration;
        if (haste > 0) {
          _cooldownDuration = (_cooldownDuration * 100) / (100 + haste);
        }
        let todoAbilities = [
          ability
        ];
        if (source.combatDetails.combatStats.blaze > 0 && Math.random() < source.combatDetails.combatStats.blaze) {
          todoAbilities.push(new ability_default('blaze'));
        }
        if (source.combatDetails.combatStats.bloom > 0 && Math.random() < source.combatDetails.combatStats.bloom) {
          todoAbilities.push(new ability_default('bloom'));
        }
        for (const todoAbility of todoAbilities) {
          for (const abilityEffect of todoAbility.abilityEffects) {
            switch (abilityEffect.effectType) {
              case '/ability_effect_types/buff':
                this.processAbilityBuffEffect(source, todoAbility, abilityEffect);
                break;

              case '/ability_effect_types/damage':
                this.processAbilityDamageEffect(source, todoAbility, abilityEffect);
                break;

              case '/ability_effect_types/heal':
                this.processAbilityHealEffect(source, todoAbility, abilityEffect);
                break;

              case '/ability_effect_types/spend_hp':
                this.processAbilitySpendHpEffect(source, todoAbility, abilityEffect);
                break;

              case '/ability_effect_types/revive':
                this.processAbilityReviveEffect(source, todoAbility, abilityEffect);
                break;

              case '/ability_effect_types/promote':
                this.eventQueue.clearEventsForUnit(source);
                source = this.processAbilityPromoteEffect(source, todoAbility, abilityEffect);
                this.addNextAttackEvent(source);
                break;

              default:
                throw new Error(
                  'Unsupported effect type for ability: ' +
                    todoAbility.hrid +
                    ' effectType: ' +
                    abilityEffect.effectType
                );
            }
          }
        }
        if (source.combatDetails.combatStats.ripple > 0 && Math.random() < source.combatDetails.combatStats.ripple) {
          let manapointsAdded = source.addManapoints(10);
          this.simResult.addManapointsGained(source, 'ripple', manapointsAdded);
          for (const ability2 of source.abilities) {
            if (ability2 && ability2.lastUsed) {
              const remainingCooldown = ability2.lastUsed + ability2.cooldownDuration - this.simulationTime;
              if (remainingCooldown > 0) {
                ability2.lastUsed = Math.max(
                  ability2.lastUsed - ONE_SECOND * 2,
                  this.simulationTime - ability2.cooldownDuration
                );
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
        if (abilityEffect.targetType == 'allAllies') {
          let targets = source.isPlayer ? this.players : this.enemies;
          for (const target of targets.filter((unit) => unit && unit.combatDetails.currentHitpoints > 0)) {
            for (const buff of abilityEffect.buffs) {
              if (ability.isSpecialAbility && buff.multiplierForSkillHrid && buff.multiplierPerSkillLevel > 0) {
                let multiplier =
                  1 +
                  source.combatDetails[buff.multiplierForSkillHrid.split('/')[2] + 'Level'] *
                    buff.multiplierPerSkillLevel;
                let currentBuff = structuredClone(buff);
                currentBuff.flatBoost *= multiplier;
                currentBuff.ratioBoost *= multiplier;
                target.addBuff(currentBuff, this.simulationTime);
              } else {
                target.addBuff(buff, this.simulationTime);
              }
              let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(
                this.simulationTime + buff.duration,
                target
              );
              this.eventQueue.addEvent(checkBuffExpirationEvent);
            }
          }
          return;
        }
        if (abilityEffect.targetType != 'self') {
          throw new Error('Unsupported target type for buff ability effect: ' + ability.hrid);
        }
        for (const buff of abilityEffect.buffs) {
          source.addBuff(buff, this.simulationTime);
          let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(
            this.simulationTime + buff.duration,
            source
          );
          this.eventQueue.addEvent(checkBuffExpirationEvent);
        }
      }
      processAbilityDamageEffect(source, ability, abilityEffect) {
        let targets;
        switch (abilityEffect.targetType) {
          case 'enemy':
          case 'allEnemies':
            targets = source.isPlayer ? this.enemies : this.players;
            break;

          default:
            throw new Error('Unsupported target type for damage ability effect: ' + ability.hrid);
        }
        if (!targets) {
          return;
        }
        let avoidTarget = [];
        let isSkipParry = false;
        for (let target of targets.filter((unit) => unit && unit.combatDetails.currentHitpoints > 0)) {
          let parryTarget = void 0;
          if (!isSkipParry) {
            parryTarget = this.checkParry(targets);
            isSkipParry = true;
          }
          if (parryTarget) {
            let tempTarget = source;
            let tempSource = parryTarget;
            let attackResult = combatUtilities_default.processAttack(tempSource, tempTarget);
            this.simResult.addAttack(
              tempSource,
              tempTarget,
              'parry',
              attackResult.didHit ? attackResult.damageDone : 'miss'
            );
            if (attackResult.lifeStealHeal > 0) {
              this.simResult.addHitpointsGained(tempSource, 'lifesteal', attackResult.lifeStealHeal);
            }
            if (attackResult.manaLeechMana > 0) {
              this.simResult.addManapointsGained(tempSource, 'manaLeech', attackResult.manaLeechMana);
            }
            if (attackResult.thornDamageDone > 0) {
              this.simResult.addAttack(tempTarget, tempSource, attackResult.thornType, attackResult.thornDamageDone);
            }
            if (tempTarget.combatDetails.combatStats.retaliation > 0) {
              this.simResult.addAttack(
                tempTarget,
                tempSource,
                'retaliation',
                attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : 'miss'
              );
            }
            if (tempTarget.combatDetails.currentHitpoints == 0) {
              this.eventQueue.clearEventsForUnit(tempTarget);
              this.simResult.addDeath(tempTarget);
              if (!tempTarget.isPlayer) {
                this.simResult.updateTimeSpentAlive(tempTarget.hrid, false, this.simulationTime);
              }
            }
            if (
              tempSource.combatDetails.currentHitpoints == 0 &&
              (attackResult.thornDamageDone != 0 || attackResult.retaliationDamageDone != 0)
            ) {
              this.eventQueue.clearEventsForUnit(tempSource);
              this.simResult.addDeath(tempSource);
              if (!tempSource.isPlayer) {
                this.simResult.updateTimeSpentAlive(tempSource.hrid, false, this.simulationTime);
              }
            }
          } else {
            targets = targets.filter(
              (unit) => unit && !avoidTarget.includes(unit.hrid) && unit.combatDetails.currentHitpoints > 0
            );
            if (!source.isPlayer && targets.length > 0 && abilityEffect.targetType == 'enemy') {
              let cumulativeThreat = 0;
              let cumulativeRanges = [];
              targets.forEach((player) => {
                let playerThreat = player.combatDetails.combatStats.threat;
                cumulativeThreat += playerThreat;
                cumulativeRanges.push({
                  player: player,
                  rangeStart: cumulativeThreat - playerThreat,
                  rangeEnd: cumulativeThreat
                });
              });
              let randomValueHit = Math.random() * cumulativeThreat;
              target = cumulativeRanges.find(
                (range) => randomValueHit >= range.rangeStart && randomValueHit < range.rangeEnd
              ).player;
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
                let checkBuffExpirationEvent = new checkBuffExpirationEvent_default(
                  this.simulationTime + buff.duration,
                  target
                );
                this.eventQueue.addEvent(checkBuffExpirationEvent);
              }
            }
            if (abilityEffect.damageOverTimeRatio > 0 && attackResult.damageDone > 0) {
              let damageOverTimeEvent = new damageOverTimeEvent_default(
                this.simulationTime + DOT_TICK_INTERVAL,
                source,
                target,
                attackResult.damageDone * abilityEffect.damageOverTimeRatio,
                abilityEffect.damageOverTimeDuration / DOT_TICK_INTERVAL,
                1,
                abilityEffect.combatStyleHrid
              );
              this.eventQueue.addEvent(damageOverTimeEvent);
            }
            if (
              attackResult.didHit &&
              abilityEffect.stunChance > 0 &&
              Math.random() < (abilityEffect.stunChance * 100) / (100 + target.combatDetails.combatStats.tenacity)
            ) {
              target.isStunned = true;
              target.stunExpireTime = this.simulationTime + abilityEffect.stunDuration;
              this.eventQueue.clearMatching(
                (event) =>
                  (event.type == autoAttackEvent_default.type ||
                    event.type == abilityCastEndEvent_default.type ||
                    event.type == stunExpirationEvent_default.type) &&
                  event.source == target
              );
              let stunExpirationEvent = new stunExpirationEvent_default(target.stunExpireTime, target);
              this.eventQueue.addEvent(stunExpirationEvent);
            }
            if (
              attackResult.didHit &&
              abilityEffect.blindChance > 0 &&
              Math.random() < (abilityEffect.blindChance * 100) / (100 + target.combatDetails.combatStats.tenacity)
            ) {
              target.isBlinded = true;
              target.blindExpireTime = this.simulationTime + abilityEffect.blindDuration;
              this.eventQueue.clearMatching(
                (event) => event.type == blindExpirationEvent_default.type && event.source == target
              );
              if (
                this.eventQueue.clearMatching(
                  (event) => event.type == autoAttackEvent_default.type && event.source == target
                )
              ) {
                this.addNextAttackEvent(target);
              }
              let blindExpirationEvent = new blindExpirationEvent_default(target.blindExpireTime, target);
              this.eventQueue.addEvent(blindExpirationEvent);
            }
            if (
              attackResult.didHit &&
              abilityEffect.silenceChance > 0 &&
              Math.random() < (abilityEffect.silenceChance * 100) / (100 + target.combatDetails.combatStats.tenacity)
            ) {
              target.isSilenced = true;
              target.silenceExpireTime = this.simulationTime + abilityEffect.silenceDuration;
              this.eventQueue.clearMatching(
                (event) => event.type == silenceExpirationEvent_default.type && event.source == target
              );
              if (
                this.eventQueue.clearMatching(
                  (event) => event.type == abilityCastEndEvent_default.type && event.source == target
                )
              ) {
                this.addNextAttackEvent(target);
              }
              let silenceExpirationEvent = new silenceExpirationEvent_default(target.silenceExpireTime, target);
              this.eventQueue.addEvent(silenceExpirationEvent);
            }
            if (attackResult.didHit && source.combatDetails.combatStats.curse > 0) {
              const curseExpireTime = 15e9;
              let currentCurseEvent = this.eventQueue.getMatching(
                (event) => event.type == curseExpirationEvent_default.type && event.source == target
              );
              let currentCurseAmount = 0;
              if (currentCurseEvent) currentCurseAmount = currentCurseEvent.curseAmount;
              this.eventQueue.clearMatching(
                (event) => event.type == curseExpirationEvent_default.type && event.source == target
              );
              let curseExpirationEvent = new curseExpirationEvent_default(
                this.simulationTime + curseExpireTime,
                currentCurseAmount,
                target
              );
              const curseBuff = {
                uniqueHrid: '/buff_uniques/curse',
                typeHrid: '/buff_types/damage_taken',
                ratioBoost: 0,
                ratioBoostLevelBonus: 0,
                flatBoost: source.combatDetails.combatStats.curse * curseExpirationEvent.curseAmount,
                flatBoostLevelBonus: 0,
                startTime: '0001-01-01T00:00:00Z',
                duration: curseExpireTime
              };
              target.addBuff(curseBuff, this.simulationTime);
              this.eventQueue.addEvent(curseExpirationEvent);
            }
            if (source.combatDetails.combatStats.fury > 0) {
              let currentFuryEvent = this.eventQueue.getMatching(
                (event) => event.type == furyExpirationEvent_default.type && event.source == source
              );
              this.eventQueue.clearMatching(
                (event) => event.type == furyExpirationEvent_default.type && event.source == source
              );
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
                uniqueHrid: '/buff_uniques/fury_accuracy',
                typeHrid: '/buff_types/fury_accuracy',
                ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                ratioBoostLevelBonus: 0,
                flatBoost: 0,
                flatBoostLevelBonus: 0,
                startTime: '0001-01-01T00:00:00Z',
                duration: furyExpireTime
              };
              const furyDamageBuf = {
                uniqueHrid: '/buff_uniques/fury_damage',
                typeHrid: '/buff_types/fury_damage',
                ratioBoost: furyAmount * source.combatDetails.combatStats.fury,
                ratioBoostLevelBonus: 0,
                flatBoost: 0,
                flatBoostLevelBonus: 0,
                startTime: '0001-01-01T00:00:00Z',
                duration: furyExpireTime
              };
              if (furyAmount > 0) {
                let furyExpirationEvent = new furyExpirationEvent_default(
                  this.simulationTime + furyExpireTime,
                  furyAmount,
                  source
                );
                this.eventQueue.addEvent(furyExpirationEvent);
                source.addBuffs(
                  [
                    furyAccuracyBuf, furyDamageBuf
                  ],
                  this.simulationTime
                );
              } else {
                source.removeBuffs([
                  furyAccuracyBuf, furyDamageBuf
                ]);
              }
            }
            if (target.combatDetails.combatStats.weaken > 0) {
              const weakenExpireTime = 15e9;
              source.weakenExpireTime = this.simulationTime + weakenExpireTime;
              let currentWeakenEvent = this.eventQueue.getMatching(
                (event) => event.type == weakenExpirationEvent_default.type && event.source == source
              );
              let weakenAmount = 0;
              if (currentWeakenEvent) weakenAmount = currentWeakenEvent.weakenAmount;
              this.eventQueue.clearMatching(
                (event) => event.type == weakenExpirationEvent_default.type && event.source == source
              );
              let weakenExpirationEvent = new weakenExpirationEvent_default(
                this.simulationTime + weakenExpireTime,
                weakenAmount,
                source
              );
              const weakenBuff = {
                uniqueHrid: '/buff_uniques/weaken',
                typeHrid: '/buff_types/damage',
                ratioBoost: -1 * target.combatDetails.combatStats.weaken * weakenExpirationEvent.weakenAmount,
                ratioBoostLevelBonus: 0,
                flatBoost: 0,
                flatBoostLevelBonus: 0,
                startTime: '0001-01-01T00:00:00Z',
                duration: weakenExpireTime
              };
              source.addBuff(weakenBuff, this.simulationTime);
              this.eventQueue.addEvent(weakenExpirationEvent);
            }
            this.simResult.addAttack(
              source,
              target,
              ability.hrid,
              attackResult.didHit ? attackResult.damageDone : 'miss'
            );
            if (attackResult.thornDamageDone > 0) {
              this.simResult.addAttack(target, source, attackResult.thornType, attackResult.thornDamageDone);
            }
            if (this.zone?.isDungeon && attackResult.thornDamageDone > 0 && source.isPlayer) {
              const log = this.buildCombatLog(target, attackResult.thornType, source, attackResult.thornDamageDone);
              this.addToWipeLogs(log);
            }
            if (target.combatDetails.combatStats.retaliation > 0) {
              this.simResult.addAttack(
                target,
                source,
                'retaliation',
                attackResult.retaliationDamageDone > 0 ? attackResult.retaliationDamageDone : 'miss'
              );
            }
            if (this.zone?.isDungeon && attackResult.retaliationDamageDone > 0 && source.isPlayer) {
              const log = this.buildCombatLog(target, 'retaliation', source, attackResult.retaliationDamageDone);
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
          if (abilityEffect.targetType == 'enemy') {
            break;
          }
        }
      }
      processAbilityHealEffect(source, ability, abilityEffect) {
        if (abilityEffect.targetType == 'allAllies') {
          let targets = source.isPlayer ? this.players : this.enemies;
          for (const target of targets.filter((unit) => unit && unit.combatDetails.currentHitpoints > 0)) {
            let amountHealed2 = combatUtilities_default.processHeal(source, abilityEffect, target);
            this.simResult.addHitpointsGained(target, ability.hrid, amountHealed2);
          }
          return;
        }
        if (abilityEffect.targetType == 'lowestHpAlly') {
          let targets = source.isPlayer ? this.players : this.enemies;
          let healTarget;
          for (const target of targets.filter((unit) => unit && unit.combatDetails.currentHitpoints > 0)) {
            if (!healTarget) {
              healTarget = target;
              continue;
            }
            const targetHpPercent = target.combatDetails.currentHitpoints / target.combatDetails.maxHitpoints;
            const healTargetHpPercent =
              healTarget.combatDetails.currentHitpoints / healTarget.combatDetails.maxHitpoints;
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
        if (abilityEffect.targetType != 'self') {
          throw new Error('Unsupported target type for heal ability effect: ' + ability.hrid);
        }
        let amountHealed = combatUtilities_default.processHeal(source, abilityEffect, source);
        this.simResult.addHitpointsGained(source, ability.hrid, amountHealed);
      }
      processAbilityReviveEffect(source, ability, abilityEffect) {
        if (abilityEffect.targetType != 'deadAlly') {
          throw new Error('Unsupported target type for revive ability effect: ' + ability.hrid);
        }
        let targets = source.isPlayer ? this.players : this.enemies;
        let reviveTarget = targets.find((unit) => unit && unit.combatDetails.currentHitpoints <= 0);
        if (reviveTarget) {
          this.eventQueue.clearMatching(
            (event) => event.type == playerRespawnEvent_default.type && event.hrid == reviveTarget.hrid
          );
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
      processAbilityPromoteEffect(source, _ability, _abilityEffect) {
        const promotionHrids = [
          '/monsters/enchanted_rook', '/monsters/enchanted_knight', '/monsters/enchanted_bishop'
        ];
        let randomPromotionIndex = Math.floor(Math.random() * promotionHrids.length);
        return new monster_default(promotionHrids[randomPromotionIndex], source.difficultyTier);
      }
      processAbilitySpendHpEffect(source, ability, abilityEffect) {
        if (abilityEffect.targetType != 'self') {
          throw new Error('Unsupported target type for spend hp ability effect: ' + ability.hrid);
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
          throw new Error('No consumable found for hrid: ' + this.hrid);
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
            let trigger = new trigger_default(
              defaultTrigger.dependencyHrid,
              defaultTrigger.conditionHrid,
              defaultTrigger.comparatorHrid,
              defaultTrigger.value
            );
            this.triggers.push(trigger);
          }
        }
        this.lastUsed = Number.MIN_SAFE_INTEGER;
      }
      static createFromDTO(dto) {
        let triggers = dto.triggers.map((trigger) => trigger_default.createFromDTO(trigger));
        let consumable = new _Consumable(dto.hrid, triggers);
        return consumable;
      }
      shouldTrigger(currentTime, source, target, friendlies, enemies) {
        if (source.isStunned) {
          return false;
        }
        let consumableHaste;
        if (this.catagoryHrid.includes('food')) {
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
    var enhancementLevelTotalBonusMultiplierTable_default =
      combatData_default.enhancementLevelTotalBonusMultiplierTable;
    var Equipment = class _Equipment {
      constructor(hrid, enhancementLevel) {
        this.hrid = hrid;
        let gameItem = itemDetailMap_default[this.hrid];
        if (!gameItem) {
          throw new Error('No equipment found for hrid: ' + this.hrid);
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
          throw new Error('No house room found for hrid: ' + this.hrid);
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
          let detailMap = Object.values(achievementDetailMap_default).filter((detail) => detail.tierHrid == tier.hrid);
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
        __publicField(this, 'equipment', {
          '/equipment_types/head': null,
          '/equipment_types/body': null,
          '/equipment_types/legs': null,
          '/equipment_types/feet': null,
          '/equipment_types/hands': null,
          '/equipment_types/main_hand': null,
          '/equipment_types/two_hand': null,
          '/equipment_types/off_hand': null,
          '/equipment_types/pouch': null,
          '/equipment_types/back': null
        });
        this.isPlayer = true;
        this.hrid = 'player';
      }
      static createFromDTO(dto) {
        let player = new _Player();
        player.staminaLevel = dto.staminaLevel;
        player.intelligenceLevel = dto.intelligenceLevel;
        player.attackLevel = dto.attackLevel;
        player.meleeLevel = dto.meleeLevel;
        player.defenseLevel = dto.defenseLevel;
        player.rangedLevel = dto.rangedLevel;
        player.magicLevel = dto.magicLevel;
        player.hrid = dto.hrid;
        for (const [
          key, value
        ] of Object.entries(dto.equipment)) {
          player.equipment[key] = value ? equipment_default.createFromDTO(value) : null;
        }
        player.food = dto.food.map((food) => (food ? consumable_default.createFromDTO(food) : null));
        player.drinks = dto.drinks.map((drink) => (drink ? consumable_default.createFromDTO(drink) : null));
        player.abilities = dto.abilities.map((ability) => (ability ? ability_default.createFromDTO(ability) : null));
        Object.entries(dto.houseRooms).forEach((houseRoom) => {
          if (houseRoom[1] > 0) {
            player.houseRooms.push(new houseRoom_default(houseRoom[0], houseRoom[1]));
          }
        });
        player.achievements = new achievement_default(dto.achievements);
        player.debuffOnLevelGap = dto.debuffOnLevelGap;
        return player;
      }
      updateCombatDetails() {
        if (this.equipment['/equipment_types/main_hand']) {
          this.combatDetails.combatStats.combatStyleHrid =
            this.equipment['/equipment_types/main_hand'].getCombatStyle();
          this.combatDetails.combatStats.damageType = this.equipment['/equipment_types/main_hand'].getDamageType();
          this.combatDetails.combatStats.attackInterval =
            this.equipment['/equipment_types/main_hand'].getCombatStat('attackInterval');
          this.combatDetails.combatStats.primaryTraining =
            this.equipment['/equipment_types/main_hand'].getPrimaryTraining();
        } else if (this.equipment['/equipment_types/two_hand']) {
          this.combatDetails.combatStats.combatStyleHrid = this.equipment['/equipment_types/two_hand'].getCombatStyle();
          this.combatDetails.combatStats.damageType = this.equipment['/equipment_types/two_hand'].getDamageType();
          this.combatDetails.combatStats.attackInterval =
            this.equipment['/equipment_types/two_hand'].getCombatStat('attackInterval');
          this.combatDetails.combatStats.primaryTraining =
            this.equipment['/equipment_types/two_hand'].getPrimaryTraining();
        } else {
          this.combatDetails.combatStats.combatStyleHrid = '/combat_styles/smash';
          this.combatDetails.combatStats.damageType = '/damage_types/physical';
          this.combatDetails.combatStats.attackInterval = 3e9;
          this.combatDetails.combatStats.primaryTraining = '/skills/melee';
        }
        if (this.equipment['/equipment_types/charm']) {
          this.combatDetails.combatStats.focusTraining = this.equipment['/equipment_types/charm'].getFocusTraining();
        } else {
          this.combatDetails.combatStats.focusTraining = '';
        }
        [
          'stabAccuracy', 'slashAccuracy', 'smashAccuracy', 'rangedAccuracy', 'magicAccuracy',
          'stabDamage', 'slashDamage', 'smashDamage', 'rangedDamage', 'magicDamage',
          'defensiveDamage', 'taskDamage', 'physicalAmplify', 'waterAmplify', 'natureAmplify',
          'fireAmplify', 'healingAmplify', 'stabEvasion', 'slashEvasion', 'smashEvasion',
          'rangedEvasion', 'magicEvasion', 'armor', 'waterResistance', 'natureResistance',
          'fireResistance', 'maxHitpoints', 'maxManapoints', 'lifeSteal', 'hpRegenPer10',
          'mpRegenPer10', 'physicalThorns', 'elementalThorns', 'combatDropRate', 'combatRareFind',
          'combatDropQuantity', 'combatExperience', 'criticalRate', 'criticalDamage', 'armorPenetration',
          'waterPenetration', 'naturePenetration', 'firePenetration', 'abilityHaste', 'tenacity',
          'manaLeech', 'castSpeed', 'threat', 'parry', 'mayhem',
          'pierce', 'curse', 'fury', 'weaken', 'ripple',
          'bloom', 'blaze', 'attackSpeed', 'foodHaste', 'drinkConcentration',
          'autoAttackDamage', 'abilityDamage', 'staminaExperience', 'intelligenceExperience', 'attackExperience',
          'defenseExperience', 'meleeExperience', 'rangedExperience', 'magicExperience', 'retaliation'
        ].forEach((stat) => {
          this.combatDetails.combatStats[stat] = Object.values(this.equipment)
            .filter((equipment) => equipment != null)
            .map((equipment) => equipment.getCombatStat(stat))
            .reduce((prev, cur) => prev + cur, 0);
        });
        if (this.equipment['/equipment_types/pouch']) {
          this.combatDetails.combatStats.foodSlots =
            1 + this.equipment['/equipment_types/pouch'].getCombatStat('foodSlots');
          this.combatDetails.combatStats.drinkSlots =
            1 + this.equipment['/equipment_types/pouch'].getCombatStat('drinkSlots');
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
          return this.monsterSpawnInfo.bossSpawns.map(
            (monster) => new monster_default(monster.combatMonsterHrid, monster.difficultyTier + this.difficultyTier)
          );
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
                encounterHrids.push({hrid: spawn.combatMonsterHrid, difficultyTier: spawn.difficultyTier});
              } else {
                break outer;
              }
              break;
            }
          }
        }
        this.encountersKilled++;
        return encounterHrids.map((hrid) => new monster_default(hrid.hrid, hrid.difficultyTier + this.difficultyTier));
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
          return currentMonsters.map(
            (monster) => new monster_default(monster.combatMonsterHrid, monster.difficultyTier + this.difficultyTier)
          );
        } else {
          let monsterSpawns = {};
          const waveKeys = Object.keys(this.dungeonSpawnInfo.randomSpawnInfoMap)
            .map(Number)
            .sort((a, b) => a - b);
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
                  encounterHrids.push({hrid: spawn.combatMonsterHrid, difficultyTier: spawn.difficultyTier});
                } else {
                  break outer;
                }
                break;
              }
            }
          }
          this.encountersKilled++;
          return encounterHrids.map(
            (hrid) => new monster_default(hrid.hrid, hrid.difficultyTier + this.difficultyTier)
          );
        }
      }
    };
    var zone_default = Zone;
    function useSeed(seed) {
      if (!Number.isFinite(seed)) return;
      let state = Number(seed) >>> 0;
      Math.random = function () {
        state = (state + 1831565813) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }
    onmessage = async function (event) {
      if (event.data.type !== 'start_simulation') return;
      updateCombatData(event.data.mstData);
      useSeed(event.data.seed);
      try {
        const zone = new zone_default(event.data.zone.zoneHrid, event.data.zone.difficultyTier);
        const players = event.data.players.map((playerData) => {
          const player = player_default.createFromDTO(structuredClone(playerData));
          player.zoneBuffs = zone.buffs || [];
          player.extraBuffs = [];
          return player;
        });
        const simulator = new combatSimulator_default(players, zone, null, {enableHpMpVisualization: false});
        const simResult = await simulator.simulate(event.data.simulationTimeLimit);
        postMessage({type: 'simulation_result', simResult: simResult});
      } catch (error) {
        postMessage({
          type: 'simulation_error',
          error: {message: error instanceof Error ? error.message : String(error)}
        });
      }
    };
  })();
}
