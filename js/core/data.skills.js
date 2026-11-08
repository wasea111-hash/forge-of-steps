// Class and skill catalogs // Extracted from legacy app.js during technical decomposition. 
const classDefinitions = {
  warrior: {
    name: "Воин",
    description: "Упор на силу и выносливость. Подходит для ближнего боя и стабильной защиты.",
    stats: { intellect: 4, endurance: 9, strength: 9, luck: 4, agility: 5, spirituality: 4 }
  },
  mage: {
    name: "Маг",
    description: "Упор на интеллект и духовность. Сильные умения, щиты и лечение.",
    stats: { intellect: 9, endurance: 4, strength: 3, luck: 4, agility: 4, spirituality: 9 }
  },
  archer: {
    name: "Лучник",
    description: "Упор на ловкость и удачу. Быстрые атаки и стабильные критические удары.",
    stats: { intellect: 4, endurance: 5, strength: 6, luck: 7, agility: 9, spirituality: 3 }
  },
  bard: {
    name: "Бард",
    description: "Гибкий класс поддержки. Упор на удачу, духовность и универсальность.",
    stats: { intellect: 6, endurance: 5, strength: 4, luck: 8, agility: 5, spirituality: 8 }
  },
  assassin: {
    name: "Ассасин",
    description: "Упор на ловкость и силу. Опасен за счет темпа, крита и резких выпадов.",
    stats: { intellect: 3, endurance: 5, strength: 8, luck: 6, agility: 9, spirituality: 3 }
  }
};

const SKILL_CATALOG = {
  "warrior-raskol": {
    id: "warrior-raskol",
    name: "Раскол",
    category: "active",
    classId: "warrior",
    description: "Мощный удар оружием, усиленный силой воина.",
    icon: null,
    tags: ["starter", "melee", "physical"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 14,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 1.85,
    critBonus: 8
  },
  "mage-ether-beam": {
    id: "mage-ether-beam",
    name: "Луч эфира",
    category: "active",
    classId: "mage",
    description: "Плотный магический импульс, основанный на интеллекте мага.",
    icon: null,
    tags: ["starter", "magic", "control"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 18,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_control",
    attackType: "skill",
    powerMultiplier: 2.35,
    critBonus: 0,
    appliedEffects: [
      {
        id: "stun",
        target: "enemy",
        duration: 1,
        value: 1,
        chance: 0.4
      },
      {
        id: "frost",
        target: "enemy",
        duration: 2,
        value: 1,
        chance: 0.55
      }
    ]
  },
  "archer-piercing-shot": {
    id: "archer-piercing-shot",
    name: "Пробивной выстрел",
    category: "active",
    classId: "archer",
    description: "Точный выстрел с повышенным шансом критического удара.",
    icon: null,
    tags: ["starter", "ranged", "physical"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 15,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 1.7,
    critBonus: 16,
    extraScaling: {
      agility: 0.39
    }
  },
  "bard-resonating-chord": {
    id: "bard-resonating-chord",
    name: "Резонирующий аккорд",
    category: "active",
    classId: "bard",
    description: "Наносит магический урон и оставляет на барде краткую регенерацию.",
    icon: null,
    tags: ["starter", "magic", "support"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 20,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_regeneration",
    attackType: "skill",
    powerMultiplier: 1.45,
    critBonus: 4,
    selfHealMultiplier: 0.65,
    appliedEffects: [
      {
        id: "regeneration",
        target: "self",
        duration: 2,
        valueFormula: {
          sourceStat: "healingPower",
          multiplier: 0.25,
          minValue: 5
        }
      }
    ]
  },
  "assassin-shadow-lunge": {
    id: "assassin-shadow-lunge",
    name: "Теневой выпад",
    category: "active",
    classId: "assassin",
    description: "Резкий выпад с высоким шансом критического удара и наложением яда.",
    icon: null,
    tags: ["starter", "physical", "poison"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 16,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_poison",
    attackType: "physical",
    powerMultiplier: 1.95,
    critBonus: 22,
    appliedEffects: [
      {
        id: "poison",
        target: "enemy",
        duration: 2,
        valueFormula: {
          sourceStat: "physicalDamage",
          multiplier: 0.18,
          minValue: 4
        }
      }
    ]
  },
  "warrior-iron-will": {
    id: "warrior-iron-will",
    name: "Железная воля",
    category: "passive",
    classId: "warrior",
    description: "Воин становится выносливее и лучше держит удар.",
    icon: null,
    tags: ["starter", "passive", "defense"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        maxHp: 42,
        physicalDefense: 4
      }
    }
  },
  "mage-arcane-reserve": {
    id: "mage-arcane-reserve",
    name: "Чародейский резерв",
    category: "passive",
    classId: "mage",
    description: "Маг поддерживает запас маны и усиливает силу заклинаний.",
    icon: null,
    tags: ["starter", "passive", "magic"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        maxMana: 30,
        skillDamage: 8
      }
    }
  },
  "archer-eagle-eye": {
    id: "archer-eagle-eye",
    name: "Орлиный глаз",
    category: "passive",
    classId: "archer",
    description: "Лучник стреляет точнее и действует быстрее.",
    icon: null,
    tags: ["starter", "passive", "precision"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        critChance: 4,
        attackSpeed: 6
      }
    }
  },
  "bard-restorative-echo": {
    id: "bard-restorative-echo",
    name: "Лечащее эхо",
    category: "passive",
    classId: "bard",
    description: "Бард усиливает лечение и устойчивость защитных мелодий.",
    icon: null,
    tags: ["starter", "passive", "support"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        healingPower: 10,
        shieldPower: 8
      }
    }
  },
  "assassin-cold-blood": {
    id: "assassin-cold-blood",
    name: "Хладнокровие",
    category: "passive",
    classId: "assassin",
    description: "Ассасин бьёт точнее и опаснее в критические моменты.",
    icon: null,
    tags: ["starter", "passive", "critical"],
    unlockLevel: 1,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        critChance: 5,
        physicalDamage: 6
      }
    }
  },
  "warrior-bastion-oath": {
    id: "warrior-bastion-oath",
    name: "Клятва бастиона",
    category: "active",
    classId: "warrior",
    description: "Воин укрепляет стойку, быстро восстанавливает силы и получает короткую регенерацию.",
    icon: null,
    tags: ["defense", "self-sustain"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 12,
    cooldown: 0,
    targetType: "self",
    effectType: "self_regeneration",
    selfHealMultiplier: 0.72,
    appliedEffects: [
      {
        id: "regeneration",
        target: "self",
        duration: 2,
        valueFormula: {
          sourceStat: "healingPower",
          multiplier: 0.24,
          minValue: 5
        }
      }
    ]
  },
  "warrior-skullbreaker": {
    id: "warrior-skullbreaker",
    name: "Череполом",
    category: "active",
    classId: "warrior",
    description: "Тяжёлый удар, способный сбить врага с темпа и оглушить его.",
    icon: null,
    tags: ["melee", "physical", "control"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 18,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_control",
    attackType: "physical",
    powerMultiplier: 2.25,
    critBonus: 6,
    appliedEffects: [
      {
        id: "stun",
        target: "enemy",
        duration: 1,
        value: 1,
        chance: 0.35
      }
    ]
  },
  "warrior-last-blow": {
    id: "warrior-last-blow",
    name: "Последний довод",
    category: "active",
    classId: "warrior",
    description: "Предельно жёсткий удар по одной цели, рассчитанный на высокий одиночный урон.",
    icon: null,
    tags: ["melee", "physical", "burst"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 22,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 2.95,
    critBonus: 18
  },
  "warrior-fortress-body": {
    id: "warrior-fortress-body",
    name: "Тело крепости",
    category: "passive",
    classId: "warrior",
    description: "Закалка воина повышает выживаемость и устойчивость к тяжёлым боям.",
    icon: null,
    tags: ["passive", "defense"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        maxHp: 60,
        magicDefense: 5
      }
    }
  },
  "warrior-veteran-rhythm": {
    id: "warrior-veteran-rhythm",
    name: "Ритм ветерана",
    category: "passive",
    classId: "warrior",
    description: "Опытный воин держит темп боя и сильнее давит физическим уроном.",
    icon: null,
    tags: ["passive", "offense"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        physicalDamage: 10,
        attackSpeed: 4
      }
    }
  },
  "mage-static-clasp": {
    id: "mage-static-clasp",
    name: "Статический захват",
    category: "active",
    classId: "mage",
    description: "Разряд эфира бьёт по врагу и с приличным шансом оглушает его.",
    icon: null,
    tags: ["magic", "control"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 16,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_control",
    attackType: "skill",
    powerMultiplier: 1.9,
    critBonus: 6,
    appliedEffects: [
      {
        id: "stun",
        target: "enemy",
        duration: 1,
        value: 1,
        chance: 0.45
      }
    ]
  },
  "mage-blood-spark": {
    id: "mage-blood-spark",
    name: "Кровавый разряд",
    category: "active",
    classId: "mage",
    description: "Маг жжёт собственные силы, чтобы выпустить особо мощный импульс по врагу.",
    icon: null,
    tags: ["magic", "risk"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "hp",
    resourceCost: 18,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "skill",
    powerMultiplier: 3.15,
    critBonus: 8,
    appliedEffects: [
      {
        id: "burn",
        target: "enemy",
        duration: 2,
        valueFormula: {
          sourceStat: "skillDamage",
          multiplier: 0.16,
          minValue: 5
        }
      }
    ]
  },
  "mage-astral-rift": {
    id: "mage-astral-rift",
    name: "Астральный разлом",
    category: "active",
    classId: "mage",
    description: "Сильный магический удар, который хорошо скалируется от интеллекта и духовности.",
    icon: null,
    tags: ["magic", "burst"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 24,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "skill",
    powerMultiplier: 2.75,
    critBonus: 12,
    extraScaling: {
      spirituality: 0.35
    },
    appliedEffects: [
      {
        id: "burn",
        target: "enemy",
        duration: 2,
        chance: 0.45,
        valueFormula: {
          sourceStat: "skillDamage",
          multiplier: 0.2,
          minValue: 6
        }
      }
    ]
  },
  "mage-echo-pool": {
    id: "mage-echo-pool",
    name: "Эхо маны",
    category: "passive",
    classId: "mage",
    description: "Расширяет запас маны и делает магические формулы плотнее.",
    icon: null,
    tags: ["passive", "mana"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        maxMana: 42,
        skillDamage: 6
      }
    }
  },
  "mage-void-focus": {
    id: "mage-void-focus",
    name: "Фокус пустоты",
    category: "passive",
    classId: "mage",
    description: "Маг лучше удерживает поток заклинаний и накапливает критический потенциал.",
    icon: null,
    tags: ["passive", "magic"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      stats: {
        intellect: 2,
        spirituality: 2
      },
      derived: {
        critChance: 5,
        shieldPower: 10
      }
    }
  },
  "mage-firebolt": {
    id: "mage-firebolt",
    name: "Огненная стрела",
    category: "active",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Собранная огненная стрела прожигает цель и оставляет на ней первый слой горения.",
    icon: null,
    tags: ["magic", "fire", "burn"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 16,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_burn",
    attackType: "skill",
    powerMultiplier: 1.82,
    critBonus: 6,
    masteryChoices: ["fire-stacks", "fire-detonation", "fire-duration"],
    appliedEffects: [
      {
        id: "burn",
        target: "enemy",
        duration: 2,
        valueFormula: {
          sourceStat: "skillDamage",
          multiplier: 0.18,
          minValue: 5
        },
        meta: {
          стакs: 1
        }
      }
    ]
  },
  "mage-cinder-wave": {
    id: "mage-cinder-wave",
    name: "Волна углей",
    category: "active",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Широкий огненный выброс бьёт мягче, зато быстро разгоняет стаки горения.",
    icon: null,
    tags: ["magic", "fire", "burn", "tempo"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 19,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_burn",
    attackType: "skill",
    powerMultiplier: 1.45,
    critBonus: 4,
    masteryChoices: ["fire-stacks", "fire-detonation", "fire-duration"],
    appliedEffects: [
      {
        id: "burn",
        target: "enemy",
        duration: 2,
        valueFormula: {
          sourceStat: "skillDamage",
          multiplier: 0.14,
          minValue: 4
        },
        meta: {
          стакs: 2
        }
      }
    ]
  },
  "mage-sun-furnace": {
    id: "mage-sun-furnace",
    name: "Солнечная топка",
    category: "active",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Плотный шар жара прожигает цель и подготавливает особенно болезненную детонацию.",
    icon: null,
    tags: ["magic", "fire", "burn", "burst"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 24,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_burn",
    attackType: "skill",
    powerMultiplier: 2.05,
    critBonus: 10,
    masteryChoices: ["fire-stacks", "fire-detonation", "fire-duration"],
    appliedEffects: [
      {
        id: "burn",
        target: "enemy",
        duration: 3,
        valueFormula: {
          sourceStat: "skillDamage",
          multiplier: 0.2,
          minValue: 6
        },
        meta: {
          стакs: 2
        }
      }
    ]
  },
  "mage-kindled-core": {
    id: "mage-kindled-core",
    name: "Разожжённое ядро",
    category: "passive",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Каждое твоё горение накладывает ещё 1 дополнительный стак.",
    icon: null,
    tags: ["passive", "fire", "burn"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      effects: {
        burn: {
          стакBonusOnApply: 1
        }
      }
    }
  },
  "mage-unstable-cinders": {
    id: "mage-unstable-cinders",
    name: "Нестабильные угли",
    category: "passive",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Детонация огня бьёт заметно сильнее и лучше наказывает плотные цели.",
    icon: null,
    tags: ["passive", "fire", "burn"],
    unlockLevel: 6,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      effects: {
        burn: {
          detonationMultiplier: 0.35
        }
      }
    }
  },
  "mage-endless-embers": {
    id: "mage-endless-embers",
    name: "Бесконечные угли",
    category: "passive",
    classId: "mage",
    subclass: "elemental",
    profession: "fire",
    description: "Горение, наложенное тобой, держится на 1 ход дольше.",
    icon: null,
    tags: ["passive", "fire", "burn"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      effects: {
        burn: {
          durationBonus: 1
        }
      }
    }
  },
  "mage-light-touch": {
    id: "mage-light-touch",
    name: "Касание рассвета",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Собирает мягкий свет вокруг мага и лечит его без снятия контроля.",
    icon: null,
    tags: ["magic", "light", "healing"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 15,
    cooldown: 0,
    targetType: "self",
    effectType: "heal",
    selfHealMultiplier: 1.05,
    masteryChoices: ["power", "restoration", "efficiency"]
  },
  "mage-light-ward": {
    id: "mage-light-ward",
    name: "Луч заслона",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Создаёт вокруг мага световой щит, который поглощает часть входящего урона.",
    icon: null,
    tags: ["magic", "light", "shield"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 18,
    cooldown: 0,
    targetType: "self",
    effectType: "shield",
    specialAction: "light_shield",
    masteryChoices: ["power", "restoration", "efficiency"],
    shieldEffect: {
      id: "shield",
      duration: 2,
      valueFormula: {
        sourceStat: "shieldPower",
        multiplier: 0.92,
        minValue: 12
      }
    }
  },
  "mage-radiant-prayer": {
    id: "mage-radiant-prayer",
    name: "Сияющая молитва",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Поддерживающая формула, которая лечит мага и запускает устойчивую регенерацию.",
    icon: null,
    tags: ["magic", "light", "regeneration"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 22,
    cooldown: 0,
    targetType: "self",
    effectType: "heal_regeneration",
    selfHealMultiplier: 0.55,
    masteryChoices: ["restoration", "control", "efficiency"],
    appliedEffects: [
      {
        id: "regeneration",
        target: "self",
        duration: 3,
        valueFormula: {
          sourceStat: "healingPower",
          multiplier: 0.3,
          minValue: 7
        }
      }
    ]
  },
  "mage-lucid-grace": {
    id: "mage-lucid-grace",
    name: "Ясная благодать",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Светлая ветка усиливает прямое лечение мага.",
    icon: null,
    tags: ["passive", "light", "healing"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        healingPower: 16,
        maxMana: 16
      }
    }
  },
  "mage-lasting-halo": {
    id: "mage-lasting-halo",
    name: "Долгий ореол",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Регенерация и защитные молитвы держатся дольше.",
    icon: null,
    tags: ["passive", "light", "support"],
    unlockLevel: 6,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      effects: {
        regeneration: {
          durationBonus: 1
        }
      }
    }
  },
  "mage-holy-bastion": {
    id: "mage-holy-bastion",
    name: "Священный бастион",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "light",
    description: "Маг света становится крепче и лучше удерживает входящий урон.",
    icon: null,
    tags: ["passive", "light", "defense"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        shieldPower: 14,
        maxHp: 32,
        magicDefense: 5
      },
      special: {
        incomingDamage: {
          damageTakenMultiplier: -0.1
        }
      }
    }
  },
  "mage-shadow-servant": {
    id: "mage-shadow-servant",
    name: "Теневой слуга",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Создаёт временного тёмного слугу, которого можно позже принести в жертву.",
    icon: null,
    tags: ["magic", "dark", "summon"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 14,
    cooldown: 0,
    targetType: "self",
    effectType: "summon",
    specialAction: "dark_summon",
    masteryChoices: ["power", "restoration", "efficiency"],
    summonEffect: {
      valueFormula: {
        sourceStat: "shieldPower",
        multiplier: 0.6,
        minValue: 14
      },
      duration: 3
    }
  },
  "mage-ritual-sacrifice": {
    id: "mage-ritual-sacrifice",
    name: "Ритуальная жертва",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Жертвует тёмным слугой ради урона, лечения или краткого усиления мага.",
    icon: null,
    tags: ["magic", "dark", "sacrifice"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 18,
    cooldown: 0,
    targetType: "enemy",
    effectType: "sacrifice",
    specialAction: "dark_sacrifice",
    masteryChoices: ["dark-sacrifice-damage", "dark-sacrifice-heal", "dark-sacrifice-buff"]
  },
  "mage-night-bolt": {
    id: "mage-night-bolt",
    name: "Сгусток ночи",
    category: "active",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Тёмный импульс, который требует здоровья, но даёт стабильный урон в рискованной сборке.",
    icon: null,
    tags: ["magic", "dark", "risk"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "hp",
    resourceCost: 14,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "skill",
    powerMultiplier: 2.45,
    critBonus: 10
  },
  "mage-umbra-vessel": {
    id: "mage-umbra-vessel",
    name: "Сосуд мрака",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Тёмный слуга становится плотнее и дольше держится в бою.",
    icon: null,
    tags: ["passive", "dark", "summon"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        darkMinion: {
          minionHpBonus: 12,
          minionDurationBonus: 1
        }
      }
    }
  },
  "mage-hungering-rite": {
    id: "mage-hungering-rite",
    name: "Голодный обряд",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Жертва слуги становится заметно эффективнее, какой бы путь ты ни выбрал.",
    icon: null,
    tags: ["passive", "dark", "sacrifice"],
    unlockLevel: 6,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        darkSacrifice: {
          sacrificeMultiplier: 0.25
        }
      }
    }
  },
  "mage-void-cradle": {
    id: "mage-void-cradle",
    name: "Колыбель пустоты",
    category: "passive",
    classId: "mage",
    subclass: "light_dark",
    profession: "dark",
    description: "Тёмный маг лучше переносит риск и получает ещё немного магической плотности.",
    icon: null,
    tags: ["passive", "dark", "risk"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        skillDamage: 10,
        maxHp: 24
      }
    }
  },
  "mage-spirit-attendant": {
    id: "mage-spirit-attendant",
    name: "Дух-хранитель",
    category: "active",
    classId: "mage",
    subclass: "summoner",
    profession: "spirit",
    description: "Призывает духа поддержки, который лечит мага и помогает переживать затяжные бои.",
    icon: null,
    tags: ["magic", "summon", "spirit", "support"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 16,
    cooldown: 0,
    targetType: "self",
    effectType: "summon",
    specialAction: "summon_spirit",
    masteryChoices: ["power", "restoration", "efficiency"],
    summonUnitConfig: {
      type: "spirit",
      name: "Дух-хранитель",
      duration: 3,
      hpFormula: {
        sourceStat: "shieldPower",
        multiplier: 0.55,
        minValue: 14
      },
      actionPowerFormula: {
        sourceStat: "healingPower",
        multiplier: 0.32,
        minValue: 8
      }
    }
  },
  "mage-spirit-circle": {
    id: "mage-spirit-circle",
    name: "Круг духов",
    category: "passive",
    classId: "mage",
    subclass: "summoner",
    profession: "spirit",
    description: "Духи дольше держатся рядом с магом и становятся плотнее.",
    icon: null,
    tags: ["passive", "summon", "spirit"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        summonedUnits: {
          unitDurationBonus: 1,
          unitHpBonus: 6
        }
      }
    }
  },
  "mage-spirit-hymn": {
    id: "mage-spirit-hymn",
    name: "Гимн хранителей",
    category: "passive",
    classId: "mage",
    subclass: "summoner",
    profession: "spirit",
    description: "Духи поддержки лечат заметно сильнее и лучше стабилизируют бой.",
    icon: null,
    tags: ["passive", "summon", "spirit"],
    unlockLevel: 6,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        "summonedUnits:spirit": {
          unitActionPowerMultiplier: 0.3
        }
      }
    }
  },
  "mage-undead-thrall": {
    id: "mage-undead-thrall",
    name: "Костяной слуга",
    category: "active",
    classId: "mage",
    subclass: "summoner",
    profession: "undead",
    description: "Поднимает хрупкую нежить, которая автоматически давит врага уроном.",
    icon: null,
    tags: ["magic", "summon", "undead", "offense"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 16,
    cooldown: 0,
    targetType: "self",
    effectType: "summon",
    specialAction: "summon_undead",
    masteryChoices: ["power", "precision", "efficiency"],
    summonUnitConfig: {
      type: "undead",
      name: "Костяной слуга",
      duration: 3,
      hpFormula: {
        sourceStat: "shieldPower",
        multiplier: 0.45,
        minValue: 12
      },
      actionPowerFormula: {
        sourceStat: "skillDamage",
        multiplier: 0.28,
        minValue: 7
      }
    }
  },
  "mage-bone-vessel": {
    id: "mage-bone-vessel",
    name: "Костяной сосуд",
    category: "passive",
    classId: "mage",
    subclass: "summoner",
    profession: "undead",
    description: "Нежить лучше выдерживает бой и держится дольше, прежде чем рассыпаться.",
    icon: null,
    tags: ["passive", "summon", "undead"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        summonedUnits: {
          unitDurationBonus: 1
        },
        "summonedUnits:undead": {
          unitHpBonus: 8
        }
      }
    }
  },
  "mage-grave-impetus": {
    id: "mage-grave-impetus",
    name: "Могильный импульс",
    category: "passive",
    classId: "mage",
    subclass: "summoner",
    profession: "undead",
    description: "Нежить бьёт агрессивнее и превращает призыв в более явный источник давления.",
    icon: null,
    tags: ["passive", "summon", "undead"],
    unlockLevel: 6,
    visible: true,
    hidden: false,
    passiveType: "effect_modifier",
    modifiers: {
      special: {
        "summonedUnits:undead": {
          unitActionPowerMultiplier: 0.35
        }
      }
    }
  },
  "archer-swift-volley": {
    id: "archer-swift-volley",
    name: "Быстрый залп",
    category: "active",
    classId: "archer",
    description: "Лёгкий выстрел с малой стоимостью и хорошей прибавкой от ловкости.",
    icon: null,
    tags: ["ranged", "physical", "tempo"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 8,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 1.2,
    critBonus: 8,
    extraScaling: {
      agility: 0.5
    }
  },
  "archer-deadeye": {
    id: "archer-deadeye",
    name: "Мёртвый глаз",
    category: "active",
    classId: "archer",
    description: "Точечный выстрел по уязвимому месту с очень высоким шансом критического удара.",
    icon: null,
    tags: ["ranged", "physical", "critical"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 18,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 2.35,
    critBonus: 28,
    extraScaling: {
      agility: 0.22
    }
  },
  "archer-needle-rain": {
    id: "archer-needle-rain",
    name: "Игольчатый дождь",
    category: "active",
    classId: "archer",
    description: "Сильный скоростной выстрел, особенно полезный для ловких и удачливых сборок.",
    icon: null,
    tags: ["ranged", "physical", "burst"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 20,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 1.85,
    critBonus: 14,
    extraScaling: {
      agility: 0.61,
      luck: 0.2
    }
  },
  "archer-silent-steps": {
    id: "archer-silent-steps",
    name: "Тихие шаги",
    category: "passive",
    classId: "archer",
    description: "Лучник легче держит дистанцию, быстрее двигается и чаще избегает ответного удара.",
    icon: null,
    tags: ["passive", "mobility"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      stats: {
        agility: 2
      },
      derived: {
        dodgeChance: 4,
        attackSpeed: 5
      }
    }
  },
  "archer-fatal-sight": {
    id: "archer-fatal-sight",
    name: "Роковой прицел",
    category: "passive",
    classId: "archer",
    description: "Усиливает точность и позволяет наносить более опасные завершающие выстрелы.",
    icon: null,
    tags: ["passive", "critical"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        critChance: 6,
        physicalDamage: 8
      }
    }
  },
  "bard-soothing-verse": {
    id: "bard-soothing-verse",
    name: "Успокаивающий куплет",
    category: "active",
    classId: "bard",
    description: "Бард успокаивает ритм боя, лечит себя и усиливает регенерацию на несколько ходов.",
    icon: null,
    tags: ["support", "regeneration"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 14,
    cooldown: 0,
    targetType: "self",
    effectType: "heal_regeneration",
    selfHealMultiplier: 0.9,
    appliedEffects: [
      {
        id: "regeneration",
        target: "self",
        duration: 3,
        valueFormula: {
          sourceStat: "healingPower",
          multiplier: 0.32,
          minValue: 6
        }
      }
    ]
  },
  "bard-rallying-refrain": {
    id: "bard-rallying-refrain",
    name: "Воодушевляющий рефрен",
    category: "active",
    classId: "bard",
    description: "Короткая мелодия поддержки: немного лечит барда и помогает дожить до следующего обмена ударами.",
    icon: null,
    tags: ["support", "self-buff"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 12,
    cooldown: 0,
    targetType: "self",
    effectType: "heal_regeneration",
    selfHealMultiplier: 0.55,
    appliedEffects: [
      {
        id: "regeneration",
        target: "self",
        duration: 2,
        valueFormula: {
          sourceStat: "healingPower",
          multiplier: 0.18,
          minValue: 4
        }
      }
    ]
  },
  "bard-sonic-crescendo": {
    id: "bard-sonic-crescendo",
    name: "Звуковое крещендо",
    category: "active",
    classId: "bard",
    description: "Громкая волна звука наносит магический урон и иногда сбивает врага с ритма.",
    icon: null,
    tags: ["magic", "support", "control"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 22,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_control",
    attackType: "skill",
    powerMultiplier: 2.2,
    critBonus: 8,
    appliedEffects: [
      {
        id: "stun",
        target: "enemy",
        duration: 1,
        value: 1,
        chance: 0.3
      }
    ]
  },
  "bard-bright-choir": {
    id: "bard-bright-choir",
    name: "Светлый хор",
    category: "passive",
    classId: "bard",
    description: "Мелодии становятся чище и дают больше устойчивого лечения в затяжных боях.",
    icon: null,
    tags: ["passive", "support"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        healingPower: 14,
        maxMana: 18
      }
    }
  },
  "bard-anchor-melody": {
    id: "bard-anchor-melody",
    name: "Якорная мелодия",
    category: "passive",
    classId: "bard",
    description: "Бард крепче держит строй и получает дополнительную защитную устойчивость.",
    icon: null,
    tags: ["passive", "defense"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        shieldPower: 14,
        maxHp: 34
      }
    }
  },
  "assassin-venom-fang": {
    id: "assassin-venom-fang",
    name: "Ядовитый клык",
    category: "active",
    classId: "assassin",
    description: "Точный выпад с более долгим и плотным отравлением, чем у стартового навыка.",
    icon: null,
    tags: ["physical", "poison"],
    unlockLevel: 3,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 12,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_poison",
    attackType: "physical",
    powerMultiplier: 1.6,
    critBonus: 14,
    appliedEffects: [
      {
        id: "poison",
        target: "enemy",
        duration: 3,
        valueFormula: {
          sourceStat: "physicalDamage",
          multiplier: 0.22,
          minValue: 5
        }
      }
    ]
  },
  "assassin-flicker-cut": {
    id: "assassin-flicker-cut",
    name: "Мерцающий порез",
    category: "active",
    classId: "assassin",
    description: "Быстрый резкий удар с очень высоким шансом критического попадания.",
    icon: null,
    tags: ["physical", "critical", "tempo"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 10,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage",
    attackType: "physical",
    powerMultiplier: 1.35,
    critBonus: 34,
    extraScaling: {
      agility: 0.4
    }
  },
  "assassin-nightfall": {
    id: "assassin-nightfall",
    name: "Ночной обрыв",
    category: "active",
    classId: "assassin",
    description: "Сильный финишер, который может оставить на цели особенно болезненный яд.",
    icon: null,
    tags: ["physical", "poison", "burst"],
    unlockLevel: 8,
    visible: true,
    hidden: false,
    resourceType: "mana",
    resourceCost: 20,
    cooldown: 0,
    targetType: "enemy",
    effectType: "damage_poison",
    attackType: "physical",
    powerMultiplier: 2.45,
    critBonus: 18,
    extraScaling: {
      agility: 0.3
    },
    appliedEffects: [
      {
        id: "poison",
        target: "enemy",
        duration: 2,
        chance: 0.4,
        valueFormula: {
          sourceStat: "physicalDamage",
          multiplier: 0.28,
          minValue: 6
        }
      }
    ]
  },
  "assassin-venom-instinct": {
    id: "assassin-venom-instinct",
    name: "Инстинкт яда",
    category: "passive",
    classId: "assassin",
    description: "Ассасин ещё точнее выбирает момент и лучше удерживает дистанцию после удара.",
    icon: null,
    tags: ["passive", "poison"],
    unlockLevel: 5,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        physicalDamage: 8,
        dodgeChance: 4
      }
    }
  },
  "assassin-executioner-path": {
    id: "assassin-executioner-path",
    name: "Путь палача",
    category: "passive",
    classId: "assassin",
    description: "Делает критические окна опаснее и ускоряет общий темп атак.",
    icon: null,
    tags: ["passive", "critical"],
    unlockLevel: 10,
    visible: true,
    hidden: false,
    passiveType: "derived_bonus",
    modifiers: {
      derived: {
        critChance: 7,
        attackSpeed: 6
      }
    }
  }
};

