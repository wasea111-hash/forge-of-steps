// Class branches and profession skills. Original mage trees (fire, light, dark, spirit, undead) live in data.skills.js.
const BRANCH_CATALOG = {
  mage: {
    subclasses: {
      elemental: { id: "elemental", name: "Маг стихий", description: "Управляет огнём, водой, камнем и ветром." },
      summoner: { id: "summoner", name: "Призыватель", description: "Сражается руками духов и нежити." },
      light_dark: { id: "light_dark", name: "Маг света и тьмы", description: "Выбирает между защитой и жертвенной силой." }
    },
    professions: {
      fire: { id: "fire", subclassId: "elemental", name: "Маг огня", description: "Четыре стака горения вызывают взрыв с процентным уроном." },
      water: { id: "water", subclassId: "elemental", name: "Маг воды", description: "Иней, обморожение и заморозка; лечение сильнее против скованных." },
      earth: { id: "earth", subclassId: "elemental", name: "Маг земли", description: "Ошеломляет и копит давление до гарантированного оглушения." },
      air: { id: "air", subclassId: "elemental", name: "Маг воздуха", description: "Поток ускоряет, повторяет навыки и почти даёт лишний ход." },
      spirit: { id: "spirit", subclassId: "summoner", name: "Призыватель духов", description: "Четыре вида духов с разными ролями и общая гармония." },
      undead: { id: "undead", subclassId: "summoner", name: "Призыватель нежити", description: "Армия до пяти; её гибель становится ресурсом." },
      light: { id: "light", subclassId: "light_dark", name: "Маг света", description: "Лечение и щиты копят сияние, «Суд» превращает его в удар." },
      dark: { id: "dark", subclassId: "light_dark", name: "Маг тьмы", description: "Ослабление, порча и жертвоприношение собственного слуги." }
    }
  },
  warrior: {
    subclasses: {
      fury: { id: "fury", name: "Путь ярости", description: "Удары и раны копят ярость, которая усиливает урон." },
      bulwark: { id: "bulwark", name: "Путь оплота", description: "Стойка строит стену, снижающую весь получаемый урон." }
    },
    professions: {
      berserk: { id: "berserk", subclassId: "fury", name: "Берсерк", description: "Кровотечение, ярость и удары на грани смерти." },
      breaker: { id: "breaker", subclassId: "fury", name: "Сокрушитель", description: "Тяжёлые удары трескают броню, пока она не рухнет." },
      guardian: { id: "guardian", subclassId: "bulwark", name: "Страж", description: "Щиты, шипы и ответный урон." },
      duelist: { id: "duelist", subclassId: "bulwark", name: "Дуэлянт", description: "Отбивает удар и тут же наказывает контратакой." }
    }
  },
  archer: {
    subclasses: {
      marksman: { id: "marksman", name: "Путь стрелка", description: "Пока тебя не бьют, растут точность и пробивание брони." },
      wild: { id: "wild", name: "Путь дикой тропы", description: "Чем больше бед на враге, тем сильнее удар." }
    },
    professions: {
      sniper: { id: "sniper", subclassId: "marksman", name: "Снайпер", description: "Метка на цели и редкие, но смертельные выстрелы." },
      stormshot: { id: "stormshot", subclassId: "marksman", name: "Стрелок бури", description: "Ускорение и град стрел." },
      ranger: { id: "ranger", subclassId: "wild", name: "Следопыт", description: "Яды, ловушки и контроль темпа боя." },
      beastmaster: { id: "beastmaster", subclassId: "wild", name: "Зверолов", description: "Ручной волк рвёт врага вместе с хозяином." }
    }
  },
  bard: {
    subclasses: {
      lyre: { id: "lyre", name: "Путь лиры", description: "Разные навыки подряд держат ритм и усиливают всё." },
      hymn: { id: "hymn", name: "Путь гимна", description: "Один постоянный гимн: стойкость, мощь или ясность." }
    },
    professions: {
      skald: { id: "skald", subclassId: "lyre", name: "Скальд", description: "Боевые гимны, ускорение и ярость." },
      trickster: { id: "trickster", subclassId: "lyre", name: "Шут", description: "Каждый ход новая карта меняет следующий навык." },
      cantor: { id: "cantor", subclassId: "hymn", name: "Кантор", description: "Ослабляет врага и держит себя живым песней." },
      choirmaster: { id: "choirmaster", subclassId: "hymn", name: "Регент", description: "Призрачный хор лечит героя каждый ход." }
    }
  },
  assassin: {
    subclasses: {
      shade: { id: "shade", name: "Путь тени", description: "Удары копят приёмы, а добивание тратит их на урон." },
      venom: { id: "venom", name: "Путь яда", description: "Новый яд складывается со старым." }
    },
    professions: {
      blade: { id: "blade", subclassId: "shade", name: "Клинок ночи", description: "Кровь, казни раненых и серии ударов." },
      phantom: { id: "phantom", subclassId: "shade", name: "Фантом", description: "Уклонение, скорость и удары из тьмы." },
      poisoner: { id: "poisoner", subclassId: "venom", name: "Отравитель", description: "Сильный яд, который разъедает защиту." },
      plaguebearer: { id: "plaguebearer", subclassId: "venom", name: "Чумной", description: "Яд и кровь разом, враг теряет силы." }
    }
  }
};

// The path opens step by step: class at creation, then subclass, then profession.
const SUBCLASS_UNLOCK_LEVEL = 30;
const PROFESSION_UNLOCK_LEVEL = 60;

function defineBranchSkills(classId, subclass, profession, skills) {
  skills.forEach((skill) => {
    SKILL_CATALOG[skill.id] = {
      classId, subclass, profession, visible: true, hidden: false, icon: null, tags: [],
      ...(skill.category === "passive"
        ? { passiveType: "derived_bonus" }
        : { resourceType: "mana", resourceCost: 14, targetType: "enemy", attackType: "skill", powerMultiplier: 1.5, critBonus: 0 }),
      ...skill
    };
  });
}

const eff = (id, duration, extra = {}) => ({ id, duration, target: "enemy", ...extra });
const selfEff = (id, duration, extra = {}) => ({ id, duration, target: "self", ...extra });
const dot = (stat, multiplier, minValue) => ({ valueFormula: { sourceStat: stat, multiplier, minValue } });
const ACTIVE = "active";
const PASSIVE = "passive";

defineBranchSkills("mage", "elemental", "water", [
  { id: "mage-ice-lance", name: "Ледяное копьё", category: ACTIVE, chill: 1, unlockLevel: 3, element: "frost", resourceCost: 15, powerMultiplier: 1.7, description: "Осколок льда ранит и покрывает цель инеем.", appliedEffects: [eff("frost", 2, { value: 0.2 })] },
  { id: "mage-tidal-mend", name: "Живая вода", category: ACTIVE, unlockLevel: 5, element: "water", attackType: null, targetType: "self", resourceCost: 18, selfHealMultiplier: 0.95, description: "Волна лечит мага и оставляет регенерацию.", appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.26, 5))] },
  { id: "mage-shatter", name: "Раскол льда", category: ACTIVE, chill: 1, unlockLevel: 8, element: "frost", resourceCost: 22, powerMultiplier: 2, vsEffect: { id: "frost", multiplier: 1.6 }, description: "Сокрушает цель. По замёрзшим бьёт на 60% сильнее." },
  { id: "mage-deep-current", name: "Глубинное течение", category: PASSIVE, unlockLevel: 3, description: "Запас маны растёт, как вода в половодье.", modifiers: { derived: { maxMana: 36, healingPower: 8 } } },
  { id: "mage-hoarfrost", name: "Вечная изморозь", category: PASSIVE, unlockLevel: 6, passiveType: "effect_modifier", description: "Иней держится дольше, а криты по замёрзшим случаются чаще.", modifiers: { effects: { frost: { durationBonus: 1, critChanceBonusVsAffected: 12 } } } },
  { id: "mage-glacial-heart", name: "Ледяное сердце", category: PASSIVE, unlockLevel: 10, passiveType: "effect_modifier", description: "Холод защищает тело мага.", modifiers: { derived: { maxHp: 30, magicDefense: 6 }, special: { incomingDamage: { damageTakenMultiplier: -0.07 } } } }
]);

defineBranchSkills("mage", "elemental", "earth", [
  { id: "mage-stone-fist", name: "Каменный кулак", category: ACTIVE, pressure: 34, unlockLevel: 3, element: "earth", resourceCost: 16, powerMultiplier: 1.7, tempo: 1.1, description: "Тяжёлый удар камня с шансом оглушить.", appliedEffects: [eff("stun", 1, { chance: 0.4, value: 1 })] },
  { id: "mage-tremor", name: "Трещина в земле", category: ACTIVE, pressure: 25, unlockLevel: 5, element: "earth", resourceCost: 18, powerMultiplier: 1.5, description: "Разламывает броню цели.", appliedEffects: [eff("armor_break", 3, { value: 0.3 })] },
  { id: "mage-granite-skin", name: "Гранитная кожа", category: ACTIVE, unlockLevel: 8, element: "earth", attackType: null, targetType: "self", resourceCost: 16, description: "Заметно снижает весь получаемый урон на несколько ходов.", appliedEffects: [selfEff("fortify", 3, { value: 0.35 })] },
  { id: "mage-bedrock", name: "Коренная порода", category: PASSIVE, unlockLevel: 3, description: "Тело мага тяжелеет, но становится прочнее.", modifiers: { derived: { maxHp: 46, physicalDefense: 6 } } },
  { id: "mage-seismic-mind", name: "Сейсмичный разум", category: PASSIVE, unlockLevel: 6, description: "Заклинания земли давят сильнее.", modifiers: { derived: { skillDamage: 10, shieldPower: 8 } } },
  { id: "mage-mountain-oath", name: "Клятва горы", category: PASSIVE, unlockLevel: 10, description: "Устойчивость как у скалы.", modifiers: { stats: { endurance: 3 }, derived: { magicDefense: 6 } } }
]);

defineBranchSkills("mage", "elemental", "air", [
  { id: "mage-gust-blade", name: "Лезвие ветра", category: ACTIVE, unlockLevel: 3, element: "air", resourceCost: 12, powerMultiplier: 1.3, tempo: 0.7, description: "Быстрый разрез: следующий ход наступает раньше." },
  { id: "mage-tailwind", name: "Попутный ветер", category: ACTIVE, flow: 2, unlockLevel: 5, element: "air", attackType: null, targetType: "self", resourceCost: 14, tempo: 0.6, description: "Ускоряет мага и помогает уходить от ударов.", appliedEffects: [selfEff("haste", 3, { value: 0.35 }), selfEff("evasion", 3, { value: 12 })] },
  { id: "mage-storm-chain", name: "Цепь молний", category: ACTIVE, unlockLevel: 8, element: "air", resourceCost: 24, powerMultiplier: 0.95, hits: 3, description: "Три разряда подряд, каждый может стать критом." },
  { id: "mage-light-step", name: "Лёгкий шаг", category: PASSIVE, unlockLevel: 3, description: "Ветер несёт мага вперёд.", modifiers: { stats: { agility: 2 }, derived: { attackSpeed: 4 } } },
  { id: "mage-eye-of-storm", name: "Око бури", category: PASSIVE, unlockLevel: 6, description: "Точность приходит вместе с бурей.", modifiers: { derived: { critChance: 6, skillDamage: 6 } } },
  { id: "mage-zephyr-veil", name: "Завеса зефира", category: PASSIVE, unlockLevel: 10, description: "Удары чаще проходят мимо.", modifiers: { derived: { dodgeChance: 7, maxMana: 24 } } }
]);

defineBranchSkills("warrior", "fury", "berserk", [
  { id: "warrior-rend", name: "Рваная рана", category: ACTIVE, unlockLevel: 3, attackType: "physical", resourceCost: 12, powerMultiplier: 1.4, element: "blood", description: "Рассекает цель и оставляет кровотечение.", appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.2, 4))] },
  { id: "warrior-blood-frenzy", name: "Кровавое исступление", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", resourceType: "hp", resourceCost: 16, tempo: 0.6, element: "blood", description: "Платит здоровьем за короткую ярость.", appliedEffects: [selfEff("rage", 3, { value: 0.35 })] },
  { id: "warrior-carnage", name: "Бойня", category: ACTIVE, unlockLevel: 8, attackType: "physical", element: "blood", resourceType: "hp", resourceCost: 22, powerMultiplier: 2.6, cooldown: 3, description: "Страшный удар ценой собственной крови." },
  { id: "warrior-death-wish", name: "Предсмертный восторг", category: PASSIVE, unlockLevel: 3, description: "Берсерк живёт ударом.", modifiers: { derived: { physicalDamage: 10, critChance: 3 } } },
  { id: "warrior-scar-tissue", name: "Рубцы", category: PASSIVE, unlockLevel: 8, description: "Старые раны не дают упасть.", modifiers: { derived: { maxHp: 55 }, stats: { strength: 2 } } }
]);

defineBranchSkills("warrior", "bulwark", "guardian", [
  { id: "warrior-shield-wall", name: "Стена щитов", category: ACTIVE, unlockLevel: 3, attackType: null, targetType: "self", specialAction: "light_shield", resourceCost: 14, element: "holy", description: "Поднимает щит, поглощающий урон.", shieldEffect: { id: "shield", duration: 3, valueFormula: { sourceStat: "physicalDefense", multiplier: 1.5, minValue: 18 } } },
  { id: "warrior-spiked-guard", name: "Шипастая защита", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", resourceCost: 14, tempo: 0.8, element: "earth", description: "Часть полученных ударов возвращается врагу.", appliedEffects: [selfEff("thorns", 3, { value: 0.45 }), selfEff("fortify", 3, { value: 0.15 })] },
  { id: "warrior-retribution", name: "Кара стража", category: ACTIVE, unlockLevel: 8, attackType: "physical", element: "steel", resourceCost: 12, special: "vengeance", cooldown: 3, description: "Выпускает всё накопленное возмездие одним ударом." },
  { id: "warrior-unmoved", name: "Непоколебимый", category: PASSIVE, unlockLevel: 3, description: "Стоит там, где другие падают.", modifiers: { derived: { physicalDefense: 8, magicDefense: 8 } } },
  { id: "warrior-sworn-shield", name: "Присяга щита", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Весь входящий урон снижен.", modifiers: { derived: { maxHp: 40 }, special: { incomingDamage: { damageTakenMultiplier: -0.1 } } } }
]);

defineBranchSkills("archer", "marksman", "sniper", [
  { id: "archer-hunters-mark", name: "Метка охотника", category: ACTIVE, unlockLevel: 3, attackType: "physical", resourceCost: 10, powerMultiplier: 0.9, tempo: 0.8, element: "arcane", description: "Лёгкий выстрел помечает цель: она получает больше урона.", appliedEffects: [eff("mark", 3, { value: 0.25 })] },
  { id: "archer-headshot", name: "Выстрел в голову", category: ACTIVE, unlockLevel: 6, attackType: "physical", resourceCost: 22, powerMultiplier: 2.5, critBonus: 20, tempo: 1.25, special: "headshot", description: "Тратит всё сосредоточение: чем больше накоплено, тем сильнее и глубже пробивает броню." },
  { id: "archer-steady-breath", name: "Ровное дыхание", category: PASSIVE, unlockLevel: 3, description: "Каждый выстрел точнее предыдущего.", modifiers: { derived: { critChance: 5, physicalDamage: 6 } } },
  { id: "archer-long-sight", name: "Дальний взгляд", category: PASSIVE, unlockLevel: 8, description: "Цель не успевает спрятаться.", modifiers: { stats: { luck: 3 }, derived: { physicalDamage: 8 } } }
]);

defineBranchSkills("archer", "wild", "ranger", [
  { id: "archer-venom-arrow", name: "Отравленная стрела", category: ACTIVE, unlockLevel: 6, attackType: "physical", resourceCost: 12, powerMultiplier: 1.25, element: "poison", description: "Стрела с ядом следопытов.", appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.24, 5))] },
  { id: "archer-snare", name: "Силок", category: ACTIVE, unlockLevel: 3, attackType: null, targetType: "self", special: "trap", trap: { power: 0.9, slow: 0.3, stun: 0.35 }, resourceCost: 10, tempo: 0.8, element: "earth", description: "Ставит ловушку: враг в начале хода получит удар, замедление и шанс оглушения." },
  { id: "archer-poison-trap", name: "Ядовитый капкан", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", special: "trap", trap: { power: 0.8, poison: 0.35 }, resourceCost: 12, tempo: 0.8, element: "poison", description: "Ставит ловушку: враг в начале хода получит удар и сильный яд." },
  { id: "archer-woodcraft", name: "Лесная наука", category: PASSIVE, unlockLevel: 3, description: "Следопыт знает, куда шагнуть.", modifiers: { derived: { dodgeChance: 5, maxHp: 24 } } },
  { id: "archer-toxin-lore", name: "Знание токсинов", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Яд лучше держится и разъедает броню.", modifiers: { effects: { poison: { durationBonus: 1, defenseShredPerTick: 2 } } } }
]);

defineBranchSkills("bard", "lyre", "skald", [
  { id: "bard-war-hymn", name: "Куплет ветра", verse: "wind", category: ACTIVE, unlockLevel: 3, attackType: null, targetType: "self", resourceCost: 14, tempo: 0.7, element: "holy", description: "Усиливает удары и ускоряет шаг.", appliedEffects: [selfEff("rage", 3, { value: 0.2 }), selfEff("haste", 3, { value: 0.2 })] },
  { id: "bard-thunder-note", name: "Громовой куплет", verse: "blade", category: ACTIVE, unlockLevel: 6, resourceCost: 20, powerMultiplier: 1.05, hits: 2, element: "air", description: "Два звуковых удара подряд.", appliedEffects: [eff("stun", 1, { chance: 0.25, value: 1 })] },
  { id: "bard-saga-of-heroes", name: "Сага о героях", category: PASSIVE, unlockLevel: 3, description: "Песни вдохновляют самого певца.", modifiers: { derived: { skillDamage: 8, physicalDamage: 6 } } },
  { id: "bard-drumbeat", name: "Барабанный ритм", category: PASSIVE, unlockLevel: 8, description: "Ритм ускоряет тело.", modifiers: { derived: { attackSpeed: 6, critChance: 4 } } }
]);

defineBranchSkills("bard", "hymn", "cantor", [
  { id: "bard-dirge", name: "Погребальная песнь", category: ACTIVE, unlockLevel: 3, resourceCost: 14, powerMultiplier: 1.1, element: "dark", description: "Лишает врага сил.", appliedEffects: [eff("weaken", 3, { value: 0.3 })] },
  { id: "bard-sanctuary-psalm", name: "Псалом убежища", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", specialAction: "light_shield", resourceCost: 16, element: "holy", description: "Звук сплетается в защитный щит.", shieldEffect: { id: "shield", duration: 3, valueFormula: { sourceStat: "shieldPower", multiplier: 1, minValue: 14 } } },
  { id: "bard-calm-voice", name: "Спокойный голос", category: PASSIVE, unlockLevel: 3, description: "Голос лечит быстрее зелий.", modifiers: { derived: { healingPower: 14, maxHp: 24 } } },
  { id: "bard-quiet-chord", name: "Тихий аккорд", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Регенерация тянется дольше.", modifiers: { derived: { shieldPower: 12 }, effects: { regeneration: { durationBonus: 1 } } } }
]);

defineBranchSkills("assassin", "venom", "poisoner", [
  { id: "assassin-black-vial", name: "Чёрный флакон", category: ACTIVE, unlockLevel: 3, attackType: "physical", resourceCost: 12, powerMultiplier: 1.05, tempo: 0.8, element: "poison", description: "Разбитый флакон отравляет сильнее любого клинка.", appliedEffects: [eff("poison", 4, dot("physicalDamage", 0.3, 6))] },
  { id: "assassin-virulence", name: "Вирулентность", category: ACTIVE, unlockLevel: 6, attackType: "physical", resourceCost: 18, powerMultiplier: 1.4, vsEffect: { id: "poison", multiplier: 1.7 }, element: "poison", description: "По отравленным бьёт на 70% сильнее." },
  { id: "assassin-antidote-blood", name: "Кровь-противоядие", category: PASSIVE, unlockLevel: 3, description: "Годы яда закалили тело.", modifiers: { derived: { maxHp: 30, physicalDamage: 6 } } },
  { id: "assassin-corroder", name: "Едкая смесь", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Каждый тик яда разъедает защиту, яд держится дольше.", modifiers: { effects: { poison: { durationBonus: 1, defenseShredPerTick: 3 } } } }
]);

defineBranchSkills("assassin", "shade", "blade", [
  { id: "assassin-twin-fangs", name: "Два клыка", category: ACTIVE, unlockLevel: 3, attackType: "physical", resourceCost: 14, powerMultiplier: 0.9, hits: 2, element: "blood", effectsPerHit: true, description: "Два быстрых удара, каждый оставляет кровь.", appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.14, 3))] },
  { id: "assassin-execution", name: "Казнь", category: ACTIVE, unlockLevel: 6, attackType: "physical", resourceCost: 20, powerMultiplier: 1.6, special: "finisher", finisher: true, description: "Добивание: тратит все приёмы. Цель ниже порога казни погибает сразу." },
  { id: "assassin-veiled-step", name: "Скрытый шаг", category: PASSIVE, unlockLevel: 3, description: "Удары проходят мимо тени.", modifiers: { derived: { dodgeChance: 6, attackSpeed: 3 } } },
  { id: "assassin-red-moon", name: "Красная луна", category: PASSIVE, unlockLevel: 8, description: "Критический удар приходит вовремя.", modifiers: { derived: { critChance: 7, physicalDamage: 8 } } }
]);

// Subclass skills: the first real step of a chosen path.
const SUBCLASS_SKILLS = [
  ["mage", "elemental", { id: "mage-elemental-surge", name: "Вспышка стихий", category: ACTIVE, unlockLevel: 5, element: "arcane", resourceCost: 15, powerMultiplier: 2, cooldown: 2, description: "Сгусток чистой стихии бьёт сильнее обычного заклинания." }, { id: "mage-element-sense", name: "Чувство стихий", category: PASSIVE, unlockLevel: 8, description: "Маг слышит стихии, и они отвечают.", modifiers: { derived: { skillDamage: 8, critChance: 3 } } }],
  ["mage", "summoner", { id: "mage-soul-tether", name: "Нить души", category: ACTIVE, unlockLevel: 5, element: "dark", resourceCost: 14, powerMultiplier: 1.4, selfHealMultiplier: 0.35, cooldown: 2, description: "Тянет силы из врага и лечит мага." }, { id: "mage-the-calling", name: "Зов", category: PASSIVE, unlockLevel: 8, description: "Запас сил для долгих призывов.", modifiers: { derived: { maxMana: 30, shieldPower: 8 } } }],
  ["mage", "light_dark", { id: "mage-dusk-ray", name: "Сумеречный луч", category: ACTIVE, unlockLevel: 5, element: "holy", resourceCost: 14, powerMultiplier: 1.6, cooldown: 2, description: "Луч света и тени лишает врага сил.", appliedEffects: [eff("weaken", 2, { value: 0.2 })] }, { id: "mage-balance", name: "Равновесие", category: PASSIVE, unlockLevel: 8, description: "Свет лечит, тьма усиливает.", modifiers: { derived: { healingPower: 8, skillDamage: 6 } } }],
  ["warrior", "fury", { id: "warrior-savage-swing", name: "Свирепый замах", category: ACTIVE, unlockLevel: 5, attackType: "physical", element: "blood", resourceCost: 12, powerMultiplier: 1.6, cooldown: 2, description: "Широкий удар оставляет глубокую рану.", appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.18, 4))] }, { id: "warrior-hot-blood", name: "Горячая кровь", category: PASSIVE, unlockLevel: 8, description: "Боль только разгоняет руку.", modifiers: { derived: { physicalDamage: 8 } } }],
  ["warrior", "bulwark", { id: "warrior-shield-bash", name: "Удар щитом", category: ACTIVE, unlockLevel: 5, attackType: "physical", element: "steel", resourceCost: 12, powerMultiplier: 1.2, cooldown: 3, description: "Может оглушить и сорвать тяжёлый удар врага.", appliedEffects: [eff("stun", 1, { chance: 0.45, value: 1 })] }, { id: "warrior-thick-hide", name: "Толстая шкура", category: PASSIVE, unlockLevel: 8, description: "Шрамы становятся бронёй.", modifiers: { derived: { maxHp: 40, physicalDefense: 5 } } }],
  ["archer", "marksman", { id: "archer-aimed-shot", name: "Прицельный выстрел", category: ACTIVE, unlockLevel: 5, attackType: "physical", element: "arcane", resourceCost: 14, powerMultiplier: 1.8, critBonus: 15, cooldown: 2, description: "Лишний вдох перед выстрелом часто решает бой." }, { id: "archer-keen-eye", name: "Зоркий глаз", category: PASSIVE, unlockLevel: 8, description: "Видит щели в любой броне.", modifiers: { derived: { critChance: 4, physicalDamage: 5 } } }],
  ["archer", "wild", { id: "archer-barbed-arrow", name: "Зазубренная стрела", category: ACTIVE, unlockLevel: 5, attackType: "physical", element: "blood", resourceCost: 12, powerMultiplier: 1.4, cooldown: 2, description: "Рана от неё долго не закрывается.", appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.16, 4))] }, { id: "archer-trail-sense", name: "Чутьё тропы", category: PASSIVE, unlockLevel: 8, description: "Лес предупреждает об опасности.", modifiers: { derived: { dodgeChance: 4, maxHp: 20 } } }],
  ["bard", "lyre", { id: "bard-sharp-verse", name: "Острый куплет", category: ACTIVE, unlockLevel: 5, element: "air", resourceCost: 12, powerMultiplier: 1.5, cooldown: 2, description: "Слова и струны обрушивают на врага волну звука." }, { id: "bard-quick-fingers", name: "Быстрые пальцы", category: PASSIVE, unlockLevel: 8, description: "Ритм ускоряет руки и мысль.", modifiers: { derived: { attackSpeed: 3, skillDamage: 6 } } }],
  ["bard", "hymn", { id: "bard-gentle-hymn", name: "Гимн стойкости", hymn: "endurance", category: ACTIVE, unlockLevel: 5, element: "holy", attackType: null, targetType: "self", resourceCost: 12, selfHealMultiplier: 0.7, cooldown: 3, description: "Лечит и включает гимн стойкости: лечение каждый ход до конца боя или смены гимна.", appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.2, 4))] }, { id: "bard-deep-breath", name: "Глубокое дыхание", category: PASSIVE, unlockLevel: 8, description: "Голос звучит дольше и чище.", modifiers: { derived: { healingPower: 10, maxMana: 20 } } }],
  ["assassin", "shade", { id: "assassin-smoke-step", name: "Дымный шаг", category: ACTIVE, unlockLevel: 5, element: "dark", attackType: null, targetType: "self", resourceCost: 10, tempo: 0.6, cooldown: 4, description: "Исчезает в дыму и быстрее наносит следующий удар.", appliedEffects: [selfEff("evasion", 2, { value: 15 }), selfEff("haste", 2, { value: 0.2 })] }, { id: "assassin-killer-instinct", name: "Инстинкт убийцы", category: PASSIVE, unlockLevel: 8, description: "Рука сама находит уязвимое место.", modifiers: { derived: { critChance: 5 } } }],
  ["assassin", "venom", { id: "assassin-toxic-cut", name: "Токсичный порез", category: ACTIVE, unlockLevel: 5, attackType: "physical", element: "poison", resourceCost: 12, powerMultiplier: 1.3, cooldown: 2, description: "Неглубокий порез с сильным ядом.", appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.22, 5))] }, { id: "assassin-venom-sacs", name: "Ядовитые железы", category: PASSIVE, unlockLevel: 8, description: "Тело само привыкает и учится делать яд.", modifiers: { derived: { physicalDamage: 5, maxHp: 20 } } }]
];
SUBCLASS_SKILLS.forEach(([classId, subclass, ...skills]) => defineBranchSkills(classId, subclass, null, skills));

defineBranchSkills("warrior", "bulwark", "duelist", [
  { id: "warrior-riposte", name: "Выпад с уходом", category: ACTIVE, unlockLevel: 3, attackType: "physical", resourceCost: 12, powerMultiplier: 1.5, tempo: 0.8, cooldown: 2, armParry: true, description: "Удар, после которого парирование взведено: следующий физический удар врага будет отбит." },
  { id: "warrior-flurry-blades", name: "Вихрь клинка", category: ACTIVE, unlockLevel: 6, attackType: "physical", resourceCost: 18, powerMultiplier: 0.75, hits: 3, cooldown: 3, special: "blade_flurry", description: "Три удара и ещё по одному за каждую единицу темпа." },
  { id: "warrior-fencer-stance", name: "Стойка фехтовальщика", category: PASSIVE, unlockLevel: 3, description: "Лёгкие ноги, быстрая рука.", modifiers: { derived: { dodgeChance: 5, attackSpeed: 4 } } },
  { id: "warrior-perfect-cut", name: "Идеальный разрез", category: PASSIVE, unlockLevel: 8, description: "Точность сильнее грубой силы.", modifiers: { derived: { critChance: 6, physicalDamage: 6 } } }
]);
defineBranchSkills("warrior", "fury", "breaker", [
  { id: "warrior-hammer-blow", name: "Удар молота", category: ACTIVE, unlockLevel: 3, attackType: "physical", element: "earth", resourceCost: 14, powerMultiplier: 1.7, tempo: 1.2, cracks: 2, cooldown: 2, description: "Медленный удар, сразу две трещины в броне." },
  { id: "warrior-shatter-armor", name: "Разлом", category: ACTIVE, unlockLevel: 6, attackType: "physical", element: "earth", resourceCost: 18, powerMultiplier: 1.5, special: "break_armor", cooldown: 3, description: "Тратит все трещины: каждая даёт +35% силы удара." },
  { id: "warrior-heavy-hands", name: "Тяжёлые руки", category: PASSIVE, unlockLevel: 3, description: "Каждый удар весит больше.", modifiers: { derived: { physicalDamage: 14 } } },
  { id: "warrior-siege-mind", name: "Осадное мышление", category: PASSIVE, unlockLevel: 8, description: "Любая стена падает, если бить в одно место.", modifiers: { stats: { strength: 4 }, derived: { maxHp: 30 } } }
]);
defineBranchSkills("archer", "marksman", "stormshot", [
  { id: "archer-arrow-storm", name: "Шквал стрел", category: ACTIVE, unlockLevel: 3, attackType: "physical", element: "air", resourceCost: 16, powerMultiplier: 0.7, hits: 3, cooldown: 3, description: "Три стрелы почти одновременно." },
  { id: "archer-gale-draw", name: "Тетива бури", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", element: "air", resourceCost: 12, tempo: 0.6, cooldown: 5, description: "Ветер ускоряет каждый выстрел.", appliedEffects: [selfEff("haste", 3, { value: 0.35 })] },
  { id: "archer-quick-quiver", name: "Быстрый колчан", category: PASSIVE, unlockLevel: 3, description: "Стрела сама ложится на тетиву.", modifiers: { derived: { attackSpeed: 5, physicalDamage: 5 } } },
  { id: "archer-storm-eye", name: "Глаз бури", category: PASSIVE, unlockLevel: 8, description: "Спокойствие в самом центре шквала.", modifiers: { stats: { agility: 2 }, derived: { critChance: 5 } } }
]);
defineBranchSkills("archer", "wild", "beastmaster", [
  { id: "archer-call-wolf", name: "Зов волка", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "earth", special: "wolf_call", resourceCost: 16, cooldown: 4, description: "Возвращает павшего волка." },
  { id: "archer-heel", name: "К ноге!", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", element: "earth", special: "wolf_guard", resourceCost: 10, cooldown: 4, description: "Волк заслоняет тебя на два хода и немного залечивает раны, а ты получаешь закалку.", appliedEffects: [selfEff("fortify", 2, { value: 0.2 })] },
  { id: "archer-pack-tactics", name: "Фас!", category: ACTIVE, unlockLevel: 3, attackType: null, targetType: "enemy", special: "wolf_strike", resourceCost: 12, cooldown: 2, element: "blood", description: "Волк бросается на цель с тройной яростью и метит её.", appliedEffects: [eff("mark", 2, { value: 0.15 })] },
  { id: "archer-beast-bond", name: "Связь со зверем", category: PASSIVE, unlockLevel: 3, passiveType: "effect_modifier", description: "Волк дольше остаётся рядом.", modifiers: { special: { summonedUnits: { unitDurationBonus: 1, unitHpBonus: 6 } } } },
  { id: "archer-alpha", name: "Вожак стаи", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Волк кусает заметно сильнее.", modifiers: { special: { "summonedUnits:undead": { unitActionPowerMultiplier: 0.35 } } } }
]);
defineBranchSkills("bard", "lyre", "trickster", [
  { id: "bard-mocking-tune", name: "Дразнилка", category: ACTIVE, unlockLevel: 3, element: "dark", resourceCost: 14, powerMultiplier: 1.1, cooldown: 3, description: "Враг теряет силы и становится уязвим.", appliedEffects: [eff("weaken", 2, { value: 0.25 }), eff("mark", 2, { value: 0.15 })] },
  { id: "bard-bewilder", name: "Сбить с толку", category: ACTIVE, unlockLevel: 6, element: "arcane", resourceCost: 14, powerMultiplier: 1, tempo: 0.8, cooldown: 4, description: "Неожиданный аккорд может оглушить.", appliedEffects: [eff("stun", 1, { chance: 0.5, value: 1 })] },
  { id: "bard-sly-grin", name: "Хитрая улыбка", category: PASSIVE, unlockLevel: 3, description: "В шута сложно попасть.", modifiers: { stats: { luck: 2 }, derived: { dodgeChance: 5 } } },
  { id: "bard-loaded-dice", name: "Шулерские кости", category: PASSIVE, unlockLevel: 8, description: "Удача всегда на твоей стороне.", modifiers: { derived: { critChance: 7 } } }
]);
defineBranchSkills("bard", "hymn", "choirmaster", [
  { id: "bard-echo-choir", name: "Голос хора", category: ACTIVE, unlockLevel: 3, attackType: null, targetType: "self", element: "holy", resourceCost: 14, cooldown: 1, description: "Новый голос лечит героя и ранит врага в конце каждого хода.", summonUnitConfig: { type: "spirit", role: "voice", name: "Голос хора", duration: 5, hpFormula: { sourceStat: "shieldPower", multiplier: 0.5, minValue: 12 }, actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.26, minValue: 7 } } },
  { id: "bard-grand-chorus", name: "Великий хор", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", element: "holy", resourceCost: 20, selfHealMultiplier: 0.6, cooldown: 4, description: "Сильное лечение и долгая регенерация.", appliedEffects: [selfEff("regeneration", 3, dot("healingPower", 0.3, 6))] },
  { id: "bard-many-voices", name: "Много голосов", category: PASSIVE, unlockLevel: 3, passiveType: "effect_modifier", description: "Эхо звучит дольше.", modifiers: { special: { summonedUnits: { unitDurationBonus: 1, unitHpBonus: 6 } } } },
  { id: "bard-perfect-pitch", name: "Абсолютный слух", category: PASSIVE, unlockLevel: 8, passiveType: "effect_modifier", description: "Хор лечит заметно сильнее.", modifiers: { special: { "summonedUnits:spirit": { unitActionPowerMultiplier: 0.3 } } } }
]);
defineBranchSkills("assassin", "shade", "phantom", [
  { id: "assassin-shadow-strike", name: "Удар из тени", category: ACTIVE, unlockLevel: 3, attackType: "physical", element: "dark", resourceCost: 14, powerMultiplier: 1.7, tempo: 0.75, cooldown: 2, description: "Быстрый и сильный удар, следующий ход наступит раньше." },
  { id: "assassin-vanish", name: "Исчезновение", shades: 2, category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", element: "dark", resourceCost: 14, tempo: 0.6, cooldown: 5, description: "Почти невозможно попасть и трудно догнать.", appliedEffects: [selfEff("evasion", 3, { value: 25 }), selfEff("haste", 3, { value: 0.25 })] },
  { id: "assassin-ghost-walk", name: "Шаг призрака", category: PASSIVE, unlockLevel: 3, description: "Тени скрывают каждый шаг.", modifiers: { derived: { dodgeChance: 6, attackSpeed: 4 } } },
  { id: "assassin-dusk-pact", name: "Договор с сумерками", category: PASSIVE, unlockLevel: 8, description: "В темноте удар точнее.", modifiers: { derived: { critChance: 5, physicalDamage: 7 } } }
]);
defineBranchSkills("assassin", "venom", "plaguebearer", [
  { id: "assassin-plague-touch", name: "Касание чумы", category: ACTIVE, unlockLevel: 3, attackType: "physical", element: "poison", resourceCost: 14, powerMultiplier: 1.1, cooldown: 3, description: "Отравляет и ослабляет цель.", appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.24, 5)), eff("weaken", 2, { value: 0.2 })] },
  { id: "assassin-festering-wound", name: "Гниющая рана", category: ACTIVE, unlockLevel: 6, attackType: "physical", element: "blood", resourceCost: 16, powerMultiplier: 1.2, cooldown: 3, vsEffect: { id: "poison", multiplier: 1.4 }, description: "Вызывает кровотечение. По отравленным на 40% сильнее.", appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.2, 4))] },
  { id: "assassin-miasma", name: "Миазмы", category: PASSIVE, unlockLevel: 3, passiveType: "effect_modifier", description: "Яд держится дольше, а отравленные получают больше урона.", modifiers: { effects: { poison: { durationBonus: 1, damageToAffectedMultiplier: 0.15 } } } },
  { id: "assassin-black-death", name: "Чёрная смерть", category: PASSIVE, unlockLevel: 8, description: "Болезнь больше не страшна носителю.", modifiers: { stats: { endurance: 2 }, derived: { maxHp: 30 } } }
]);

// Tuning of the original skills: real cooldowns, attack speed and elements for visuals. Starter skills stay spammable.
const SKILL_TUNING = {
  "warrior-bastion-oath": { cooldown: 3, element: "holy" }, "warrior-skullbreaker": { cooldown: 3, tempo: 1.15 }, "warrior-last-blow": { cooldown: 4, tempo: 1.25 },
  "warrior-rend": { cooldown: 2 }, "warrior-blood-frenzy": { cooldown: 5 }, "warrior-shield-wall": { cooldown: 4, element: "steel" }, "warrior-spiked-guard": { cooldown: 5 },
  "mage-ether-beam": { element: "arcane", powerMultiplier: 1.75, resourceCost: 16, appliedEffects: [{ id: "frost", target: "enemy", duration: 2, value: 0.2, chance: 0.4 }] },
  "mage-static-clasp": { cooldown: 3, element: "air", appliedEffects: [{ id: "stun", target: "enemy", duration: 1, value: 1, chance: 0.4 }] },
  "mage-blood-spark": { cooldown: 3, element: "blood", powerMultiplier: 2.6 }, "mage-astral-rift": { cooldown: 4, element: "arcane", tempo: 1.2 },
  "mage-firebolt": { element: "fire" }, "mage-cinder-wave": { cooldown: 2, element: "fire" }, "mage-sun-furnace": { cooldown: 4, element: "fire", tempo: 1.2 },
  "mage-light-touch": { cooldown: 2, element: "holy" }, "mage-light-ward": { cooldown: 3, element: "holy" }, "mage-radiant-prayer": { cooldown: 4, element: "holy" },
  "mage-shadow-servant": { cooldown: 2, element: "dark" }, "mage-ritual-sacrifice": { cooldown: 1, element: "dark" }, "mage-night-bolt": { cooldown: 2, element: "dark" },
  "mage-spirit-attendant": { cooldown: 2, element: "holy" }, "mage-undead-thrall": { cooldown: 2, element: "dark" },
  "mage-ice-lance": {}, "mage-tidal-mend": { cooldown: 3 }, "mage-shatter": { cooldown: 3 }, "mage-stone-fist": { cooldown: 3 }, "mage-tremor": { cooldown: 3 }, "mage-granite-skin": { cooldown: 5 },
  "mage-gust-blade": {}, "mage-tailwind": { cooldown: 4 }, "mage-storm-chain": { cooldown: 3 },
  "archer-swift-volley": { tempo: 0.75 }, "archer-deadeye": { cooldown: 3, tempo: 1.15 }, "archer-needle-rain": { cooldown: 4 }, "archer-piercing-shot": { element: "arcane" },
  "archer-hunters-mark": { cooldown: 3 }, "archer-headshot": { cooldown: 3 }, "archer-venom-arrow": { cooldown: 2 }, "archer-snare": { cooldown: 3 }, "archer-poison-trap": { cooldown: 3 },
  "bard-resonating-chord": { element: "holy" }, "bard-soothing-verse": { cooldown: 4, element: "holy" }, "bard-rallying-refrain": { cooldown: 3, element: "holy", tempo: 0.7 }, "bard-sonic-crescendo": { cooldown: 3, element: "air" },
  "bard-war-hymn": { cooldown: 5 }, "bard-thunder-note": { cooldown: 3 }, "bard-dirge": { cooldown: 3 }, "bard-sanctuary-psalm": { cooldown: 4 },
  "assassin-shadow-lunge": { element: "dark", powerMultiplier: 1.6 }, "assassin-venom-fang": { cooldown: 2, element: "poison" }, "assassin-flicker-cut": { tempo: 0.7, cooldown: 2 }, "assassin-nightfall": { cooldown: 4, element: "dark" },
  "assassin-black-vial": { cooldown: 3 }, "assassin-virulence": { cooldown: 3 }, "assassin-twin-fangs": { cooldown: 2 }, "assassin-execution": { cooldown: 3 }
};
Object.entries(SKILL_TUNING).forEach(([id, patch]) => {
  if (SKILL_CATALOG[id]) Object.assign(SKILL_CATALOG[id], patch);
});

const ALPHA_1_1_SKILLS = [
  ["mage", "elemental", "water", { id: "mage-ice-prison", name: "Ледяная темница", category: ACTIVE, unlockLevel: 10, element: "frost", special: "freeze", resourceCost: 20, powerMultiplier: 1.3, cooldown: 4, description: "Сковывает обмороженную цель льдом: она пропускает ход." }],
  ["mage", "elemental", "earth", { id: "mage-landslide", name: "Оползень", category: ACTIVE, unlockLevel: 10, element: "earth", pressure: 50, resourceCost: 24, powerMultiplier: 2.6, tempo: 1.2, cooldown: 3, description: "Тяжёлый удар, сразу половина шкалы давления." }],
  ["mage", "summoner", "spirit", { id: "mage-spirit-healer", name: "Дух-целитель", category: ACTIVE, unlockLevel: 5, attackType: null, targetType: "self", element: "holy", resourceCost: 16, cooldown: 2, description: "Лечит мага в конце каждого хода.", summonUnitConfig: { type: "spirit", role: "healer", name: "Дух-целитель", duration: 4, hpFormula: { sourceStat: "shieldPower", multiplier: 0.5, minValue: 12 }, actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.36, minValue: 8 } } }],
  ["mage", "summoner", "spirit", { id: "mage-spirit-energy", name: "Дух энергии", category: ACTIVE, unlockLevel: 6, attackType: null, targetType: "self", element: "water", resourceCost: 10, cooldown: 3, description: "Возвращает ману каждый ход.", summonUnitConfig: { type: "spirit", role: "energy", name: "Дух энергии", duration: 4, hpFormula: { sourceStat: "shieldPower", multiplier: 0.4, minValue: 10 }, actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.3, minValue: 6 } } }],
  ["mage", "summoner", "spirit", { id: "mage-spirit-war", name: "Боевой дух", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "arcane", resourceCost: 16, cooldown: 2, description: "Бьёт врага каждый ход.", summonUnitConfig: { type: "spirit", role: "attacker", name: "Боевой дух", duration: 4, hpFormula: { sourceStat: "shieldPower", multiplier: 0.5, minValue: 12 }, actionPowerFormula: { sourceStat: "skillDamage", multiplier: 0.34, minValue: 8 } } }],
  ["mage", "summoner", "undead", { id: "mage-zombie", name: "Поднять зомби", category: ACTIVE, unlockLevel: 5, attackType: null, targetType: "self", element: "dark", resourceCost: 14, cooldown: 2, description: "Живучий мертвец слабо бьёт, зато чаще принимает удары на себя.", summonUnitConfig: { type: "undead", role: "tank", name: "Зомби", duration: 5, taunt: 2, hpFormula: { sourceStat: "skillDamage", multiplier: 1.1, minValue: 24 }, actionPowerFormula: { sourceStat: "skillDamage", multiplier: 0.14, minValue: 4 } } }],
  ["mage", "summoner", "undead", { id: "mage-bone-burst", name: "Взрыв костей", category: ACTIVE, unlockLevel: 8, element: "dark", special: "bone_burst", resourceCost: 18, cooldown: 3, description: "Уничтожает всю армию: чем она больше и чем больше костей накоплено, тем сильнее удар." }],
  ["mage", "light_dark", "light", { id: "mage-judgement", name: "Суд", category: ACTIVE, unlockLevel: 10, element: "holy", special: "judgement", resourceCost: 16, cooldown: 2, description: "Превращает всё накопленное сияние в удар." }],
  ["mage", "light_dark", "dark", { id: "mage-curse", name: "Проклятие порчи", category: ACTIVE, unlockLevel: 6, element: "dark", resourceCost: 16, powerMultiplier: 1.1, cooldown: 2, description: "Ослабляет цель, а ослабление вызывает порчу.", appliedEffects: [eff("weaken", 3, { value: 0.25 })] }],
  ["bard", "lyre", "skald", { id: "bard-saga-life", name: "Куплет жизни", verse: "life", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "holy", resourceCost: 14, selfHealMultiplier: 0.6, cooldown: 3, description: "Лечит и завершает одну из частей песни." }],
  ["bard", "lyre", "trickster", { id: "bard-swap-card", name: "Подмена", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "arcane", special: "redraw", resourceCost: 6, tempo: 0.4, cooldown: 2, description: "Заменяет текущую карту, почти не тратя времени." }],
  ["bard", "hymn", null, { id: "bard-might-hymn", name: "Гимн мощи", hymn: "might", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "holy", resourceCost: 10, tempo: 0.8, cooldown: 2, description: "Весь урон на 15% сильнее до конца боя или смены гимна." }],
  ["bard", "hymn", null, { id: "bard-clarity-hymn", name: "Гимн ясности", hymn: "clarity", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "self", element: "water", resourceCost: 6, tempo: 0.8, cooldown: 2, description: "Возвращает ману каждый ход до конца боя или смены гимна." }],
  ["bard", "hymn", "cantor", { id: "bard-chorale", name: "Хорал", category: ACTIVE, unlockLevel: 8, element: "holy", special: "chorale", resourceCost: 14, cooldown: 3, description: "Превращает избыток лечения в удар и щит." }],
  ["bard", "hymn", "choirmaster", { id: "bard-culmination", name: "Кульминация", category: ACTIVE, unlockLevel: 8, element: "holy", special: "culmination", resourceCost: 16, cooldown: 3, description: "Весь хор звучит в последний раз: сильный удар и лечение." }],
  ["assassin", "shade", null, { id: "assassin-gut-strike", name: "Удар в печень", category: ACTIVE, unlockLevel: 8, attackType: "physical", element: "blood", special: "finisher", finisher: true, resourceCost: 14, powerMultiplier: 1.5, cooldown: 2, description: "Добивание: тратит все приёмы, +25% силы за каждый." }],
  ["assassin", "venom", "poisoner", { id: "assassin-lance-wound", name: "Вскрытие раны", category: ACTIVE, unlockLevel: 8, attackType: null, targetType: "enemy", element: "poison", special: "lance_wound", resourceCost: 16, cooldown: 3, description: "Наносит весь оставшийся урон яда разом, не снимая его." }],
  ["archer", null, null, { id: "archer-tipped-arrow", name: "Смазанный наконечник", category: ACTIVE, unlockLevel: 16, attackType: "physical", element: "poison", resourceCost: 12, powerMultiplier: 1.2, cooldown: 2, description: "Стрела с простым ядом.", appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.18, 4))] }]
];
ALPHA_1_1_SKILLS.forEach(([classId, subclass, profession, skill]) => defineBranchSkills(classId, subclass, profession, [skill]));

// Non-magic classes: no arcane, holy or dark sources in their kits.
const NON_MAGIC_ELEMENTS = {
  "warrior-bastion-oath": "steel", "archer-piercing-shot": "steel", "archer-hunters-mark": "steel", "archer-aimed-shot": "steel",
  "assassin-shadow-lunge": "steel", "assassin-nightfall": "blood", "assassin-smoke-step": "air", "assassin-shadow-strike": "steel", "assassin-vanish": "air"
};
Object.entries(NON_MAGIC_ELEMENTS).forEach(([id, element]) => { if (SKILL_CATALOG[id]) SKILL_CATALOG[id].element = element; });
// Armour piercing is the archer's own tool.
Object.entries({ "archer-piercing-shot": 0.25, "archer-deadeye": 0.35, "archer-needle-rain": 0.15, "archer-aimed-shot": 0.3, "archer-headshot": 0.2 }).forEach(([id, pierce]) => { if (SKILL_CATALOG[id]) SKILL_CATALOG[id].pierce = pierce; });
Object.assign(SKILL_CATALOG["mage-spirit-attendant"], { description: "Дух-хранитель даёт магу щит в конце каждого хода.", specialAction: null, attackType: null });
Object.assign(SKILL_CATALOG["mage-spirit-attendant"].summonUnitConfig, { role: "guardian", duration: 4, actionPowerFormula: { sourceStat: "shieldPower", multiplier: 0.3, minValue: 8 } });
Object.assign(SKILL_CATALOG["mage-undead-thrall"], { specialAction: null, attackType: null, description: "Костяной воин бьёт врага в конце каждого хода и разъедает его защиту." });
Object.assign(SKILL_CATALOG["mage-undead-thrall"].summonUnitConfig, { role: "attacker", duration: 4 });
Object.assign(SKILL_CATALOG["mage-shadow-servant"], { specialAction: null, attackType: null, description: "Создаёт жертвенного слугу. Он может принять удар на себя, а затем пойти на жертвоприношение.", summonUnitConfig: { type: "minion", role: "minion", name: "Тёмный слуга", duration: 4, hpFormula: SKILL_CATALOG["mage-shadow-servant"].summonEffect.valueFormula, actionPowerFormula: { sourceStat: "skillDamage", multiplier: 0.01, minValue: 1 } } });
SKILL_CATALOG["mage-night-bolt"].appliedEffects = [eff("weaken", 2, { value: 0.2 })];

// Skill levels: the base kit fills levels 1-30, then the subclass from 30, then the profession from 60.
const PROFESSION_SKILL_LEVELS = { 3: 60, 5: 62, 6: 64, 8: 66, 10: 70 };
const SUBCLASS_SKILL_LEVELS = { 5: 30, 8: 36 };
const BASE_SKILL_LEVELS = { 3: 6, 5: 12, 8: 20, 10: 26 };
Object.values(SKILL_CATALOG).forEach((skill) => {
  const map = skill.profession ? PROFESSION_SKILL_LEVELS : skill.subclass ? SUBCLASS_SKILL_LEVELS : BASE_SKILL_LEVELS;
  skill.unlockLevel = map[skill.unlockLevel] || skill.unlockLevel;
});

const MUTATIONS = {
  echo: { id: "echo", name: "Эхо", description: "Откат навыка короче на 1 ход, а без отката навык бьёт на 10% сильнее.", cost: { shards: 3, "venom-gland": 1 } },
  chain: { id: "chain", name: "Цепная реакция", description: "30% шанс мгновенно повторить навык с половинной силой.", cost: { shards: 4, "venom-gland": 1 } },
  blood: { id: "blood", name: "Кровавый завет", description: "Навык на 30% сильнее, но отнимает 6% здоровья.", cost: { shards: 3, "astral-core": 1 } },
  stable: { id: "stable", name: "Стабильность", description: "Эффекты навыка длятся на 1 ход дольше и срабатывают на 15% чаще.", cost: { shards: 4, "astral-core": 1 } }
};
