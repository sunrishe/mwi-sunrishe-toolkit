// 装备提升预设只描述固定职业方案；角色等级、房屋和成就运行时读取当前角色。
// equipment-comparison-presets
export const EQUIPMENT_COMPARISON_PRESETS = Object.freeze({
  meleeHammer: {
    nameKey: 'presetMeleeHammer',
    combatStyleHrid: '/combat_styles/smash',
    weaponTypeHrid: '/equipment_types/main_hand',
    equipment: [
      [
        '/items/chaotic_flail', 10
      ], [
        '/items/knights_aegis', 10
      ], [
        '/items/corsair_helmet', 10
      ], [
        '/items/maelstrom_plate_body', 10
      ], [
        '/items/maelstrom_plate_legs', 10
      ],
      [
        '/items/dodocamel_gauntlets', 10
      ], [
        '/items/polar_bear_shoes', 10
      ]
    ],
    abilities: [
      '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/fracturing_impact', '/abilities/sweep'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_melee_coffee'
    ]
  },
  meleeBulwark: {
    nameKey: 'presetMeleeBulwark',
    combatStyleHrid: '/combat_styles/smash',
    weaponTypeHrid: '/equipment_types/two_hand',
    equipment: [
      [
        '/items/griffin_bulwark', 10
      ], [
        '/items/corsair_helmet', 10
      ], [
        '/items/anchorbound_plate_body', 10
      ], [
        '/items/anchorbound_plate_legs', 10
      ], [
        '/items/dodocamel_gauntlets', 10
      ],
      [
        '/items/polar_bear_shoes', 10
      ]
    ],
    abilities: [
      '/abilities/invincible', '/abilities/spike_shell', '/abilities/retribution', '/abilities/toughness', '/abilities/shield_bash'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_defense_coffee'
    ]
  },
  meleeSword: {
    nameKey: 'presetMeleeSword',
    combatStyleHrid: '/combat_styles/slash',
    equipment: [
      [
        '/items/regal_sword', 10
      ], [
        '/items/knights_aegis', 10
      ], [
        '/items/corsair_helmet', 10
      ], [
        '/items/maelstrom_plate_body', 10
      ], [
        '/items/maelstrom_plate_legs', 10
      ],
      [
        '/items/dodocamel_gauntlets', 10
      ], [
        '/items/grizzly_bear_shoes', 10
      ]
    ],
    abilities: [
      '/abilities/fierce_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/crippling_slash', '/abilities/maim'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_melee_coffee'
    ]
  },
  meleeSpear: {
    nameKey: 'presetMeleeSpear',
    combatStyleHrid: '/combat_styles/stab',
    equipment: [
      [
        '/items/furious_spear', 10
      ], [
        '/items/knights_aegis', 10
      ], [
        '/items/corsair_helmet', 10
      ], [
        '/items/maelstrom_plate_body', 10
      ], [
        '/items/maelstrom_plate_legs', 10
      ],
      [
        '/items/dodocamel_gauntlets', 10
      ], [
        '/items/black_bear_shoes', 10
      ]
    ],
    abilities: [
      '/abilities/speed_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_strike', '/abilities/puncture'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_melee_coffee'
    ]
  },
  rangedBow: {
    nameKey: 'presetRangedBow',
    combatStyleHrid: '/combat_styles/ranged',
    weaponTypeHrid: '/equipment_types/two_hand',
    equipment: [
      [
        '/items/cursed_bow', 10
      ], [
        '/items/acrobatic_hood', 10
      ], [
        '/items/kraken_tunic', 10
      ], [
        '/items/kraken_chaps', 10
      ], [
        '/items/marksman_bracers', 10
      ],
      [
        '/items/centaur_boots', 10
      ]
    ],
    abilities: [
      '/abilities/critical_aura', '/abilities/berserk', '/abilities/pestilent_shot', '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_ranged_coffee'
    ]
  },
  rangedCrossbow: {
    nameKey: 'presetRangedCrossbow',
    combatStyleHrid: '/combat_styles/ranged',
    weaponTypeHrid: '/equipment_types/main_hand',
    equipment: [
      [
        '/items/sundering_crossbow', 10
      ], [
        '/items/manticore_shield', 10
      ], [
        '/items/acrobatic_hood', 10
      ], [
        '/items/kraken_tunic', 10
      ], [
        '/items/kraken_chaps', 10
      ],
      [
        '/items/marksman_bracers', 10
      ], [
        '/items/centaur_boots', 10
      ]
    ],
    abilities: [
      '/abilities/critical_aura', '/abilities/frenzy', '/abilities/berserk', '/abilities/penetrating_shot', '/abilities/rain_of_arrows'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_ranged_coffee'
    ]
  },
  magicFire: {
    nameKey: 'presetMagicFire',
    combatStyleHrid: '/combat_styles/magic',
    damageTypeHrid: '/damage_types/fire',
    equipment: [
      [
        '/items/blazing_trident', 10
      ], [
        '/items/bishops_codex', 10
      ], [
        '/items/magicians_hat', 10
      ], [
        '/items/royal_fire_robe_top', 10
      ], [
        '/items/royal_fire_robe_bottoms', 10
      ],
      [
        '/items/chrono_gloves', 10
      ], [
        '/items/sorcerer_boots', 10
      ]
    ],
    abilities: [
      '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/firestorm', '/abilities/flame_blast', '/abilities/fireball'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_magic_coffee'
    ]
  },
  magicWater: {
    nameKey: 'presetMagicWater',
    combatStyleHrid: '/combat_styles/magic',
    damageTypeHrid: '/damage_types/water',
    equipment: [
      [
        '/items/rippling_trident', 10
      ], [
        '/items/bishops_codex', 10
      ], [
        '/items/magicians_hat', 10
      ], [
        '/items/royal_water_robe_top', 10
      ], [
        '/items/royal_water_robe_bottoms', 10
      ],
      [
        '/items/chrono_gloves', 10
      ], [
        '/items/sorcerer_boots', 10
      ]
    ],
    abilities: [
      '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/frost_surge', '/abilities/mana_spring', '/abilities/water_strike'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_magic_coffee'
    ]
  },
  magicNature: {
    nameKey: 'presetMagicNature',
    combatStyleHrid: '/combat_styles/magic',
    damageTypeHrid: '/damage_types/nature',
    equipment: [
      [
        '/items/blooming_trident', 10
      ], [
        '/items/bishops_codex', 10
      ], [
        '/items/magicians_hat', 10
      ], [
        '/items/royal_nature_robe_top', 10
      ], [
        '/items/royal_nature_robe_bottoms', 10
      ],
      [
        '/items/chrono_gloves', 10
      ], [
        '/items/sorcerer_boots', 10
      ]
    ],
    abilities: [
      '/abilities/mystic_aura', '/abilities/elemental_affinity', '/abilities/toxic_pollen', '/abilities/natures_veil', '/abilities/entangle'
    ],
    drinks: [
      '/items/ultra_attack_coffee', '/items/ultra_magic_coffee'
    ]
  }
});

export const EQUIPMENT_COMPARISON_PRESET_GROUPS = Object.freeze([
  {nameKey: 'presetGroupMelee', keys: [
      'meleeHammer', 'meleeBulwark', 'meleeSword', 'meleeSpear'
    ]}, {nameKey: 'presetGroupRanged', keys: [
      'rangedBow', 'rangedCrossbow'
    ]}, {nameKey: 'presetGroupMagic', keys: [
      'magicFire', 'magicWater', 'magicNature'
    ]}
]);
