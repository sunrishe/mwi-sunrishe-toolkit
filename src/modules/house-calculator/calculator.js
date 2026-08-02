// house-calculator
export class HouseCalculator {
  constructor(ctx, houseDetailMap) {
    this.ctx = ctx;
    this.houseDetails = houseDetailMap;
  }

  calculateUpgradeMaterials(roomHrid, fromLevel, toLevel) {
    const {i18n} = this.ctx;
    const requiredMaterials = {};

    if (!(roomHrid in this.houseDetails)) {
      throw new Error(i18n.t('houseNotFound', roomHrid));
    }
    if (fromLevel >= toLevel) {
      throw new Error(i18n.t('invalidLevel'));
    }

    const roomInfo = this.houseDetails[roomHrid];
    // 房屋升级材料按官方逐级配置累加，不能只取目标等级差值。
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
