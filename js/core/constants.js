// Core constants and base data // Extracted from legacy app.js during technical decomposition. 
const heroBase = {
  name: "Странник Предела",
  level: 1,
  experience: 0,
  statPoints: 0,
  skillPoints: 0,
  gold: 0,
  stats: {
    intellect: 8,
    endurance: 10,
    strength: 9,
    luck: 7,
    agility: 8,
    spirituality: 6
  }
};

const INVENTORY_SIZE = 30;
const ACTIVE_SKILL_SLOTS = 5;
const STARTING_CHARACTER_STAT_POINTS = 5;
const SKILL_POINT_LEVEL_INTERVAL = 3;
const EXP_GAIN_FACTOR = 2.4;
const GOLD_GAIN_FACTOR = 1.6;
const DROP_GAIN_FACTOR = 1.4;
const SHOP_SELL_RATE = 0.4;
const SKILL_EXP_TABLE = [10, 20, 30, 40];
const SKILL_MAX_LEVEL = SKILL_EXP_TABLE.length + 1;
const SKILL_LEVEL_POWER_STEP = 0.12;
const SKILL_LEVEL_EFFECT_STEP = 0.1;
const SKILL_LEVEL_CHANCE_STEP = 0.03;
const SKILL_POWER_BALANCE_MULTIPLIER = 0.9;
const BASIC_ATTACK_POWER_MULTIPLIER = 1.18;
const STUN_REPEAT_CHANCE_MULTIPLIER = 0.5;
const DROP_CHANCE_BONUS_CAP = 0.75;
const DROP_QUALITY_BONUS_CAP = 0.75;
const BURN_DEFAULT_STACKS = 1;
const BURN_DETONATION_THRESHOLD = 4;
const BURN_DETONATION_CURRENT_HP_RATIO = 0.18;
const BURN_DETONATION_CAP_RATIO = 0.12;
const BURN_DETONATION_BOSS_CAP_RATIO = 0.08;
const SUMMONED_UNIT_LIMIT = 2;
const SKILL_BONUS_OPTIONS = {
  power: {
    id: "power",
    name: "Сила",
    description: "Усиливает основной урон, лечение и силу эффекта навыка.",
    modifiers: {
      damageMultiplier: 0.2,
      healMultiplier: 0.2,
      effectValueMultiplier: 0.15
    }
  },
  control: {
    id: "control",
    name: "Контроль",
    description: "Повышает шанс и длительность вторичных эффектов навыка.",
    modifiers: {
      effectChanceBonus: 0.15,
      effectDurationBonus: 1,
      effectValueMultiplier: 0.1
    }
  },
  efficiency: {
    id: "efficiency",
    name: "Экономия",
    description: "Снижает стоимость навыка по ресурсу.",
    modifiers: {
      resourceCostMultiplier: 0.8
    }
  },
  precision: {
    id: "precision",
    name: "Точность",
    description: "Повышает шанс критического всплеска и немного усиливает удар.",
    modifiers: {
      damageMultiplier: 0.1,
      critBonus: 10
    }
  },
  restoration: {
    id: "restoration",
    name: "Резонанс",
    description: "Усиливает лечение, регенерацию и длительность поддерживающих эффектов.",
    modifiers: {
      healMultiplier: 0.25,
      effectValueMultiplier: 0.2,
      effectDurationBonus: 1
    }
  },
  "fire-stacks": {
    id: "fire-stacks",
    name: "Жадное пламя",
    description: "Повышает потолок стаков горения и помогает быстрее разгонять цель до детонации.",
    modifiers: {
      burnStackBonus: 1,
      burnMaxStacksBonus: 1
    }
  },
  "fire-detonation": {
    id: "fire-detonation",
    name: "Разрыв жара",
    description: "Усиливает урон детонации огня и делает взрыв опаснее для плотных целей.",
    modifiers: {
      burnDetonationMultiplier: 0.3
    }
  },
  "fire-duration": {
    id: "fire-duration",
    name: "Долгое тление",
    description: "Продлевает горение и помогает удерживать стаки до следующего огненного импульса.",
    modifiers: {
      burnDurationBonus: 1
    }
  },
  "dark-sacrifice-damage": {
    id: "dark-sacrifice-damage",
    name: "Кровавый взрыв",
    description: "Жертва слуги превращается в агрессивный урон по врагу.",
    modifiers: {
      darkSacrificeMode: "damage"
    }
  },
  "dark-sacrifice-heal": {
    id: "dark-sacrifice-heal",
    name: "Поглощение плоти",
    description: "Жертва слуги идёт в выживание и лечение мага.",
    modifiers: {
      darkSacrificeMode: "heal"
    }
  },
  "dark-sacrifice-buff": {
    id: "dark-sacrifice-buff",
    name: "Экстаз жертвы",
    description: "Жертва слуги усиливает самого мага на несколько ходов.",
    modifiers: {
      darkSacrificeMode: "buff"
    }
  }
};

const STAT_KEYS = ["intellect", "endurance", "strength", "luck", "agility", "spirituality"];
const FLAT_BONUS_KEYS = ["maxHp", "maxMana", "physicalDamage", "skillDamage", "physicalDefense", "magicDefense", "shieldPower", "healingPower", "critChance", "dodgeChance", "attackSpeed"];
const DERIVED_BONUS_KEYS = [
  "maxHp",
  "maxMana",
  "physicalDamage",
  "skillDamage",
  "physicalDefense",
  "magicDefense",
  "shieldPower",
  "healingPower",
  "critChance",
  "dropChance",
  "dropQuality",
  "dodgeChance",
  "attackSpeed"
];
const EQUIPMENT_SLOT_TEMPLATE = {
  "ring-1": null,
  "ring-2": null,
  "bracelet-1": null,
  "bracelet-2": null,
  necklace: null,
  head: null,
  chest: null,
  legs: null,
  boots: null,
  "weapon-1": null,
  "weapon-2": null
};
const SHOP_RESOURCE_CATALOG = [
  {
    id: "iron-ore",
    name: "Железная руда",
    description: "Основа кузнечного дела: заточка обычных и зелёных вещей.",
    rarity: "white",
    price: 24,
    category: "common_resource",
    icon: null,
    stackable: true
  },
  {
    id: "ether-dust",
    name: "Эфирная пыль",
    description: "Магическая пыльца для заточки и перековки зачарованных вещей.",
    rarity: "green",
    price: 52,
    category: "skill_resource",
    icon: null,
    stackable: true
  },
  {
    id: "moon-thread",
    name: "Лунная нить",
    description: "Редкий материал для заточки оранжевых и фиолетовых вещей.",
    rarity: "orange",
    price: 115,
    category: "rare_resource",
    icon: null,
    stackable: true
  },
  {
    id: "venom-gland",
    name: "Ядовитая железа",
    description: "Опасный компонент для мутаций навыков и тонкой заточки.",
    rarity: "purple",
    price: 210,
    category: "mutation_resource",
    icon: null,
    stackable: true
  },
  {
    id: "astral-core",
    name: "Астральное ядро",
    description: "Редчайший фокус для легендарных вещей и сильнейших мутаций.",
    rarity: "red",
    price: 420,
    category: "mutation_resource",
    icon: null,
    stackable: true
  }
];
const SHOP_PASSIVE_CATALOG = [
  {
    id: "toxic-penetration",
    name: "Токсичное проникновение",
    description: "Яд ест броню изнутри: каждый тик отнимает 4 единицы защиты.",
    price: 180,
    effectType: "poison",
    type: "effect_modifier",
    modifier: {
      defenseShredPerTick: 4
    }
  },
  {
    id: "venom-power",
    name: "Сила венома",
    description: "Урон по отравленным целям увеличен на 25%.",
    price: 240,
    effectType: "poison",
    type: "effect_modifier",
    modifier: {
      damageToAffectedMultiplier: 0.25
    }
  },
  {
    id: "lingering-poison",
    name: "Затяжной яд",
    description: "Наложенный тобой яд держится на 1 ход дольше.",
    price: 220,
    effectType: "poison",
    type: "effect_modifier",
    modifier: {
      durationBonus: 1
    }
  },
  {
    id: "frost-fragility",
    name: "Ломкость инея",
    description: "Иней делает цель хрупкой: крит по ней случается на 14% чаще.",
    price: 210,
    effectType: "frost",
    type: "effect_modifier",
    modifier: {
      critChanceBonusVsAffected: 14
    }
  },
  {
    id: "deep-freeze",
    name: "Глубокая заморозка",
    description: "После схождения инея цель получает сильное замедление темпа.",
    price: 275,
    effectType: "frost",
    type: "effect_modifier",
    modifier: {
      speedDebuffOnExpire: 12,
      dodgePenaltyOnExpire: 4
    }
  },
  {
    id: "shatter-crit",
    name: "Ледяной раскол",
    description: "Крит по целям под инеем наносит 250% урона.",
    price: 320,
    effectType: "frost",
    type: "effect_modifier",
    modifier: {
      critMultiplierOverride: 2.5
    }
  },
  {
    id: "melting-resistance",
    name: "Плавление защиты",
    description: "Каждый тик горения ослабляет защиту цели.",
    price: 190,
    effectType: "burn",
    type: "effect_modifier",
    modifier: {
      defenseShredPerTick: 3
    }
  },
  {
    id: "rising-flame",
    name: "Разгорающееся пламя",
    description: "Каждый следующий тик горения бьёт сильнее.",
    price: 250,
    effectType: "burn",
    type: "effect_modifier",
    modifier: {
      tickRampPerElapsedTurn: 0.2
    }
  },
  {
    id: "flame-feast",
    name: "Пир пламени",
    description: "Урон по горящей цели растёт на 12% за каждый стак горения.",
    price: 300,
    effectType: "burn",
    type: "effect_modifier",
    modifier: {
      damagePerActiveBurn: 0.12
    }
  }
];

const BATTLE_FORMULAS = {
  healthBase: 80,
  manaBase: 30,
  healthPerEndurance: 12,
  manaPerIntellect: 10,
  healthPerLevel: 16,
  manaPerLevel: 6,
  physicalDamageBase: 8,
  skillDamageBase: 10,
  physicalDamagePerStrength: 2.4,
  skillDamagePerIntellect: 2.8,
  physicalDamagePerLevel: 1.9,
  skillDamagePerLevel: 2.1,
  physicalDefensePerEndurance: 1.58,
  magicDefensePerEndurance: 1.32,
  physicalDefensePerLevel: 1.25,
  magicDefensePerLevel: 1.1,
  shieldBase: 14,
  shieldPerSpirituality: 3.2,
  shieldPerLevel: 1.8,
  healingBase: 10,
  healingPerSpirituality: 2.7,
  healingPerLevel: 1.5,
  critBase: 5,
  critPerLuck: 1.8,
  critPerLevel: 0.2,
  dropBase: 10,
  dropPerLuck: 2.2,
  qualityBase: 1,
  qualityPerLuck: 0.45,
  qualityPerLevel: 0.08,
  dodgeBase: 3,
  dodgePerAgility: 1.7,
  dodgePerLevel: 0.15,
  speedBase: 10,
  speedPerAgility: 2,
  speedPerLevel: 0.7,
  bossMultiplier: 1.18
};


const SKILL_EXP_PER_USE = 1;
const STAT_POINTS_PER_LEVEL = 3;
const MAX_ENHANCE = 10;
const ENHANCE_STEP = 0.07;
const CRIT_CAP = 75;
const DODGE_CAP = 45;
const GUARD_REDUCTION = 0.5;
const GUARD_TEMPO = 0.85;
const WAIT_TEMPO = 0.6;
const WAIT_MANA_RATIO = 0.12;
const DEFENSE_K_BASE = 45;
const DEFENSE_K_PER_LEVEL = 7;
const CRIT_MULTIPLIER = 1.7;
const ENEMY_GROWTH = { intellect: 1, endurance: 1, strength: 1, luck: 0.5, agility: 0.8, spirituality: 0.7 };
const ENEMY_HP_FACTOR = 1.35;
const ENEMY_DMG_FACTOR = 1.2;
const HIT_CAP_GUARDIAN = 0.09;
const HIT_CAP_BOSS = 0.14;
const ULT_PER_ACTION = 12;
const ULT_ON_HURT = 5;
const ULT_ON_KILL = 15;
const BLEED_DECAY = 0.75;
const POISON_RAMP = 0.2;
const POISON_RAMP_MAX = 10;
const ENEMY_LEVEL_HP = 0.027;
const ENEMY_LEVEL_DMG = 0.012;
const SPEED_CURVE_BASE = 50;
const SPEED_CURVE_SLOPE = 0.4;
const CLASS_DAMAGE_FACTOR = { warrior: 1.12, bard: 1.2, archer: 0.82, assassin: 0.88, mage: 1.12 };
const CLASS_HP_FACTOR = { mage: 1.32, bard: 1.08, assassin: 1, archer: 1, warrior: 1.05 };
