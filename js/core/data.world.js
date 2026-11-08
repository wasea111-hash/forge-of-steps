// World content: danger zones, regions, enemies, enemy moves, expedition events and item blueprints.
const ZONES = {
  white: { key: "white", name: "Белая тропа", short: "Белая", levelOffset: [-3, -1], steps: 3, rewardFactor: 0.85, risk: "Низкий риск", description: "Враги слабее тебя. Безопасное место для первых шагов и фарма.", rarityWeights: [72, 24, 3.5, 0.5, 0] },
  green: { key: "green", name: "Зелёная тропа", short: "Зелёная", levelOffset: [-1, 1], steps: 4, rewardFactor: 1, risk: "Умеренный риск", description: "Противники твоего уровня. Основной способ расти.", rarityWeights: [55, 34, 9, 1.8, 0.2] },
  orange: { key: "orange", name: "Оранжевая тропа", short: "Оранжевая", levelOffset: [1, 3], steps: 5, rewardFactor: 1.3, risk: "Высокий риск", description: "Враги сильнее и злее, но и добыча заметно лучше.", rarityWeights: [34, 40, 20, 5, 1] },
  purple: { key: "purple", name: "Фиолетовая тропа", short: "Фиолетовая", levelOffset: [3, 5], steps: 6, rewardFactor: 1.7, risk: "Очень опасно", description: "Серьёзная проверка силы. Стоит идти подготовленным.", rarityWeights: [16, 38, 30, 13, 3] },
  red: { key: "red", name: "Красная тропа", short: "Красная", levelOffset: [6, 8], steps: 7, rewardFactor: 2.35, risk: "Смертельно", description: "Самые тяжёлые бои и самая редкая добыча.", rarityWeights: [4, 24, 40, 24, 8] }
};
const ZONE_KEYS = Object.keys(ZONES);
const RARITY_KEYS = ["white", "green", "orange", "purple", "red"];

const REGIONS = [
  {
    id: "thicket", name: "Шепчущая чаща", minLevel: 1, floorLevel: 1, resource: "iron-ore", bonusResource: "ether-dust",
    description: "Старый лес на краю мира. Отсюда начинаются все дороги к Пределу.",
    enemies: ["wolf", "bandit", "slime", "hunter", "boar"], guardian: "greyfang"
  },
  {
    id: "ashlands", name: "Пепельные пустоши", minLevel: 14, floorLevel: 13, resource: "ether-dust", bonusResource: "moon-thread",
    description: "Земля, сожжённая первой плавкой. Здесь до сих пор тлеют угли.",
    enemies: ["ash_slime", "ember_imp", "cinder_knight", "scorched_hound", "pyre_cultist"], guardian: "pyre_queen"
  },
  {
    id: "ruins", name: "Рунные руины", minLevel: 29, floorLevel: 28, resource: "moon-thread", bonusResource: "venom-gland",
    description: "Город мастеров, забытый собственными машинами и призраками.",
    enemies: ["rune_guard", "wraith", "stone_golem", "mad_scribe", "rust_stalker"], guardian: "archivist"
  },
  {
    id: "limit", name: "Предел", minLevel: 49, floorLevel: 48, resource: "venom-gland", bonusResource: "astral-core",
    description: "Край горизонта. Здесь шаги куются заново, а пустота смотрит в ответ.",
    enemies: ["void_stalker", "hollow_pilgrim", "limit_shard", "star_eater", "echo_wanderer"], guardian: "smith"
  }
];

const ENEMY_MOVES = {
  strike: { name: "Удар", kind: "physical", power: 1 },
  bite: { name: "Укус", kind: "physical", power: 1.05 },
  flurry: { name: "Серия", kind: "physical", power: 0.55, hits: 2, cd: 2 },
  heavy: { name: "Сокрушительный удар", kind: "physical", power: 2.1, cd: 3, heavy: true },
  charge: { name: "Таран", kind: "physical", power: 1.7, cd: 3, heavy: true },
  rend: { name: "Разорвать", kind: "physical", power: 0.8, cd: 3, apply: { id: "bleed", duration: 3, ratio: 0.18 } },
  spit: { name: "Едкий плевок", kind: "magic", power: 0.65, cd: 3, apply: { id: "poison", duration: 3, ratio: 0.2 } },
  firebolt: { name: "Огненный снаряд", kind: "magic", power: 1.15, element: "fire", apply: { id: "burn", duration: 2, ratio: 0.14, chance: 0.5 } },
  frostbite: { name: "Морозное касание", kind: "magic", power: 0.9, element: "frost", cd: 3, apply: { id: "frost", duration: 2, value: 0.25 } },
  arcane: { name: "Рунный разряд", kind: "magic", power: 1.25, element: "arcane" },
  shadow: { name: "Удар тени", kind: "magic", power: 1.3, element: "dark" },
  smash_stun: { name: "Оглушающий удар", kind: "physical", power: 0.85, cd: 4, heavy: true, apply: { id: "stun", duration: 1, chance: 0.75 } },
  curse: { name: "Проклятие слабости", kind: "debuff", cd: 4, apply: { id: "weaken", duration: 3, value: 0.25 } },
  hex: { name: "Сглаз", kind: "debuff", cd: 4, apply: { id: "mark", duration: 3, value: 0.25 } },
  corrode: { name: "Разъедание брони", kind: "physical", power: 0.7, cd: 4, apply: { id: "armor_break", duration: 3, value: 0.3 } },
  silence: { name: "Печать немоты", kind: "debuff", cd: 5, apply: { id: "silence", duration: 2 } },
  mend: { name: "Заживление", kind: "heal", ratio: 0.14, cd: 4, when: "hurt" },
  harden: { name: "Панцирь", kind: "shield", ratio: 0.2, cd: 4 },
  enrage: { name: "Ярость", kind: "buff", cd: 5, apply: { id: "rage", duration: 3, value: 0.3 } },
  drain: { name: "Иссушение", kind: "magic", power: 1, cd: 3, lifesteal: 0.6, element: "dark" },
  meltdown: { name: "Плавка", kind: "magic", power: 2.4, cd: 4, heavy: true, element: "fire" }
};

// mods: multipliers on derived values. art: sprite id in js/ui/art.js.
const ENEMY_DEFINITIONS = {
  wolf: { name: "Дикий волк", art: "beast", tint: "#8a93a8", stats: { strength: 7, endurance: 6, agility: 9, luck: 3, intellect: 2, spirituality: 2 }, moves: ["bite", "bite", "flurry", "rend"], mods: { hp: 0.9 }, lore: "Быстрый хищник. Бьёт часто, но слабо." },
  bandit: { name: "Лесной разбойник", art: "rogue", tint: "#a0704a", stats: { strength: 8, endurance: 7, agility: 7, luck: 4, intellect: 3, spirituality: 3 }, moves: ["strike", "strike", "heavy", "corrode"], lore: "Готовит сильный удар. Вовремя прими стойку." },
  slime: { name: "Болотный слизень", art: "slime", tint: "#6fa35c", stats: { strength: 5, endurance: 11, agility: 3, luck: 2, intellect: 5, spirituality: 4 }, moves: ["strike", "spit", "mend"], mods: { hp: 1.15, dmg: 0.85 }, lore: "Живучий, отравляет и понемногу заживает." },
  hunter: { name: "Сумрачный охотник", art: "rogue", tint: "#5d6a8e", stats: { strength: 9, endurance: 7, agility: 9, luck: 5, intellect: 4, spirituality: 3 }, moves: ["strike", "flurry", "hex"], lore: "Сначала метит жертву, затем режет её." },
  boar: { name: "Клыкастый вепрь", art: "beast", tint: "#7a5a44", stats: { strength: 10, endurance: 9, agility: 4, luck: 2, intellect: 1, spirituality: 2 }, moves: ["strike", "charge", "charge"], mods: { hp: 1.1 }, lore: "Медленный, но его таран нельзя принимать без стойки." },
  greyfang: { name: "Серый Клык, вожак стаи", art: "beast", tint: "#c7cfdf", scale: 1.25, guardian: true, level: 14, stats: { strength: 12, endurance: 11, agility: 11, luck: 6, intellect: 3, spirituality: 4 }, moves: ["bite", "flurry", "rend", "charge", "enrage"], phase: { at: 0.5, text: "Вожак воет, и лес отвечает ему. Он впадает в ярость!", apply: { id: "rage", duration: 6, value: 0.3 }, heal: 0.08 }, mods: { hp: 1.5 }, lore: "Страж Чащи. Становится опаснее, когда ранен." },

  ash_slime: { name: "Пепельный слизень", art: "slime", tint: "#b07a4a", stats: { strength: 6, endurance: 12, agility: 3, luck: 2, intellect: 7, spirituality: 4 }, moves: ["strike", "firebolt", "mend"], mods: { hp: 1.15, dmg: 0.9 }, lore: "Плавится на ходу и поджигает всё вокруг." },
  ember_imp: { name: "Угольный бес", art: "imp", tint: "#e0663c", stats: { strength: 5, endurance: 6, agility: 12, luck: 6, intellect: 10, spirituality: 4 }, moves: ["firebolt", "firebolt", "flurry", "hex"], mods: { hp: 0.8, dmg: 1.05 }, lore: "Очень быстрый поджигатель с малым запасом здоровья." },
  cinder_knight: { name: "Рыцарь окалины", art: "knight", tint: "#8c5a44", stats: { strength: 11, endurance: 13, agility: 4, luck: 3, intellect: 4, spirituality: 6 }, moves: ["strike", "heavy", "harden", "smash_stun"], mods: { hp: 1.2 }, lore: "Тяжёлая броня. Лучше всего её пробивает магия." },
  scorched_hound: { name: "Опалённый пёс", art: "beast", tint: "#c0533a", stats: { strength: 9, endurance: 7, agility: 10, luck: 4, intellect: 3, spirituality: 2 }, moves: ["bite", "flurry", "rend"], lore: "Стая голодных углей на четырёх лапах." },
  pyre_cultist: { name: "Жрец костра", art: "caster", tint: "#d38a3a", stats: { strength: 3, endurance: 7, agility: 6, luck: 5, intellect: 12, spirituality: 9 }, moves: ["firebolt", "meltdown", "curse", "mend"], mods: { hp: 0.9 }, lore: "Плавка убивает мгновенно. Оглуши его или прими стойку." },
  pyre_queen: { name: "Королева Костра", art: "caster", tint: "#ff8a3c", scale: 1.3, guardian: true, level: 29, stats: { strength: 8, endurance: 12, agility: 9, luck: 7, intellect: 15, spirituality: 12 }, moves: ["firebolt", "firebolt", "meltdown", "curse", "harden"], phase: { at: 0.5, text: "Корона вспыхивает. Королева питается собственным пламенем!", apply: { id: "rage", duration: 5, value: 0.25 }, heal: 0.12 }, mods: { hp: 1.55 }, lore: "Страж Пустошей. Её плавку нельзя пропускать без защиты." },

  rune_guard: { name: "Рунный страж", art: "golem", tint: "#6f8fb5", stats: { strength: 11, endurance: 13, agility: 4, luck: 3, intellect: 7, spirituality: 7 }, moves: ["strike", "arcane", "harden", "smash_stun"], mods: { hp: 1.15 }, lore: "Машина старых мастеров. Без устали держит пост." },
  wraith: { name: "Плачущий призрак", art: "wraith", tint: "#9aa8d8", stats: { strength: 4, endurance: 7, agility: 11, luck: 6, intellect: 12, spirituality: 10 }, moves: ["shadow", "drain", "silence", "frostbite"], mods: { hp: 0.85 }, lore: "Лишает голоса и понемногу пьёт силы." },
  stone_golem: { name: "Каменный голем", art: "golem", tint: "#8d8a7c", stats: { strength: 13, endurance: 15, agility: 2, luck: 2, intellect: 2, spirituality: 4 }, moves: ["strike", "heavy", "heavy", "harden"], mods: { hp: 1.35, dmg: 1.05 }, lore: "Очень медленный. За это время можно успеть многое." },
  mad_scribe: { name: "Безумный писец", art: "caster", tint: "#7bb5a3", stats: { strength: 3, endurance: 8, agility: 7, luck: 6, intellect: 13, spirituality: 9 }, moves: ["arcane", "hex", "curse", "silence"], lore: "Вписывает слабость прямо в твоё имя." },
  rust_stalker: { name: "Ржавый ловчий", art: "rogue", tint: "#a8603c", stats: { strength: 11, endurance: 9, agility: 10, luck: 6, intellect: 4, spirituality: 3 }, moves: ["strike", "corrode", "flurry", "rend"], lore: "Разъедает броню и уходит в тень." },
  archivist: { name: "Архивариус Без Имени", art: "golem", tint: "#a3c0ff", scale: 1.3, guardian: true, level: 49, stats: { strength: 13, endurance: 15, agility: 7, luck: 6, intellect: 15, spirituality: 12 }, moves: ["arcane", "heavy", "silence", "hex", "harden", "smash_stun"], phase: { at: 0.5, text: "Архив открывается: страницы становятся лезвиями!", apply: { id: "haste", duration: 6, value: 0.35 }, heal: 0.1 }, mods: { hp: 1.6 }, lore: "Страж Руин. Помнит каждый твой шаг." },

  void_stalker: { name: "Охотник Пустоты", art: "wraith", tint: "#7a5cd6", stats: { strength: 12, endurance: 9, agility: 13, luck: 7, intellect: 9, spirituality: 5 }, moves: ["shadow", "flurry", "hex", "drain"], lore: "Появляется там, где только что было пусто." },
  hollow_pilgrim: { name: "Пустой паломник", art: "caster", tint: "#8a7fb0", stats: { strength: 5, endurance: 11, agility: 6, luck: 6, intellect: 14, spirituality: 12 }, moves: ["shadow", "curse", "silence", "mend", "meltdown"], lore: "Дошёл до края и ничего не нашёл." },
  limit_shard: { name: "Осколок Предела", art: "shard", tint: "#5fc7e8", stats: { strength: 13, endurance: 14, agility: 5, luck: 4, intellect: 11, spirituality: 8 }, moves: ["arcane", "heavy", "harden", "frostbite"], mods: { hp: 1.2 }, lore: "Кусок горизонта, который научился ненавидеть." },
  star_eater: { name: "Пожиратель звёзд", art: "beast", tint: "#4d3c8a", stats: { strength: 15, endurance: 12, agility: 8, luck: 5, intellect: 6, spirituality: 5 }, moves: ["bite", "charge", "rend", "enrage"], mods: { hp: 1.1, dmg: 1.05 }, lore: "Огромный зверь с пустотой вместо глаз." },
  echo_wanderer: { name: "Эхо Странника", art: "rogue", tint: "#d8d3ea", stats: { strength: 12, endurance: 11, agility: 11, luck: 8, intellect: 10, spirituality: 8 }, moves: ["strike", "shadow", "flurry", "corrode", "smash_stun"], lore: "Похож на тебя. Возможно, это и есть ты на другом шаге." },
  smith: { name: "Кузнец Шагов", art: "smith", tint: "#ffb35c", scale: 1.35, guardian: true, final: true, level: 70, stats: { strength: 17, endurance: 18, agility: 9, luck: 8, intellect: 15, spirituality: 13 }, moves: ["strike", "heavy", "meltdown", "corrode", "smash_stun", "silence", "harden"], phase: { at: 0.5, text: "Горн раскаляется добела. Кузнец перековывает сам себя!", apply: { id: "rage", duration: 7, value: 0.3 }, heal: 0.15 }, mods: { hp: 1.7 }, lore: "Тот, кто выковал Предел. Последний шаг этого пути." }
};

const ELITE_AFFIXES = [
  { id: "tempered", name: "Закалённый", mods: { hp: 1.45, dmg: 1.1 } },
  { id: "swift", name: "Стремительный", mods: { hp: 1.2, dmg: 1.1, speed: 1.3 } },
  { id: "brutal", name: "Жестокий", mods: { hp: 1.2, dmg: 1.35 } },
  { id: "venomous", name: "Ядовитый", mods: { hp: 1.25, dmg: 1.1 }, extraMoves: ["spit"] },
  { id: "warded", name: "Защищённый", mods: { hp: 1.25, dmg: 1.1 }, extraMoves: ["harden"] }
];

// Expedition events. Each option resolves to a text result and may change hero, bag or start a fight.
const EXPEDITION_EVENTS = [
  {
    id: "spring", title: "Родник у дороги", art: "spring",
    text: "Из камня бьёт чистая вода. Можно передохнуть, но надолго задерживаться опасно.",
    options: [
      { label: "Пить и лечить раны", hint: "+40% здоровья", resolve: (ctx) => ctx.heal(0.4, "Вода затягивает раны.") },
      { label: "Умыться и собраться", hint: "+60% маны", resolve: (ctx) => ctx.restoreMana(0.6, "Мысли снова становятся ясными.") }
    ]
  },
  {
    id: "chest", title: "Забытый сундук", art: "chest",
    text: "Сундук стоит посреди тропы. Слишком удобно, чтобы быть случайностью.",
    options: [
      { label: "Открыть", hint: "Добыча или засада", resolve: (ctx) => (roll(0.7) ? ctx.loot(1, "Внутри действительно лежит добыча.") : ctx.ambush("Сундук щёлкает зубами: это засада!")) },
      { label: "Пройти мимо", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Ты оставляешь сундук за спиной.") }
    ]
  },
  {
    id: "altar", title: "Алтарь крови", art: "altar",
    text: "На камне темнеют старые следы. Алтарь обещает силу в обмен на кровь.",
    options: [
      { label: "Отдать кровь", hint: "-20% здоровья, +25% урона в следующем бою", resolve: (ctx) => ctx.bloodPact(0.2, 0.25) },
      { label: "Уйти", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Алтарь провожает тебя молчанием.") }
    ]
  },
  {
    id: "smith", title: "Бродячий кузнец", art: "anvil",
    text: "Старик раскладывает инструменты прямо на дороге и предлагает товар.",
    options: [
      { label: "Купить материалы", hint: "Золото из сумки на ресурсы", resolve: (ctx) => ctx.tradeResources() },
      { label: "Купить зелье", hint: "Золото из сумки на зелье лечения", resolve: (ctx) => ctx.tradePotion() },
      { label: "Попрощаться", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Кузнец кивает и возвращается к работе.") }
    ]
  },
  {
    id: "ravine", title: "Узкая расселина", art: "ravine",
    text: "Мост рухнул. Можно перепрыгнуть или поискать обход, потеряв время.",
    options: [
      { label: "Прыгать", hint: "Проверка ловкости", stat: "agility", resolve: (ctx, option) => (ctx.statCheck(option.stat) ? ctx.loot(0.5, "Прыжок удался, а на той стороне лежит чужая поклажа.") : ctx.hurt(0.18, "Ты срываешься и больно ударяешься о камни.")) },
      { label: "Обойти", hint: "-15% маны", resolve: (ctx) => ctx.drainMana(0.15, "Долгий обход выматывает, но ты цел.") }
    ]
  },
  {
    id: "hermit", title: "Отшельник", art: "hermit",
    text: "Седой человек у костра спрашивает, что ты ищешь на этой дороге.",
    options: [
      { label: "Говорить с ним", hint: "Проверка духовности", stat: "spirituality", resolve: (ctx, option) => (ctx.statCheck(option.stat) ? ctx.expGift(0.35, "Его слова становятся для тебя уроком.") : ctx.note("Он лишь пожимает плечами. Этот разговор ни к чему не привёл.")) },
      { label: "Сыграть в кости", hint: "Проверка удачи", stat: "luck", resolve: (ctx, option) => (ctx.statCheck(option.stat) ? ctx.goldGift(1.5, "Кости падают в твою пользу!") : ctx.goldLoss(0.2, "Старик усмехается и забирает часть монет.")) }
    ]
  }
];

const ITEM_BLUEPRINTS = [
  { name: "Кольцо ученика", slotType: "ring", level: 1, bonuses: { intellect: 1, luck: 1 } },
  { name: "Кольцо удачного ветра", slotType: "ring", level: 4, bonuses: { luck: 2, agility: 1 } },
  { name: "Кольцо каменной крови", slotType: "ring", level: 7, bonuses: { endurance: 2 }, flatBonuses: { maxHp: 22 } },
  { name: "Кольцо рунного ядра", slotType: "ring", level: 10, bonuses: { intellect: 2, spirituality: 2 } },
  { name: "Кольцо ярости", slotType: "ring", level: 5, bonuses: { strength: 2, luck: 1 } },
  { name: "Браслет охотника", slotType: "bracelet", level: 2, bonuses: { agility: 2, strength: 1 } },
  { name: "Браслет жреца", slotType: "bracelet", level: 5, bonuses: { spirituality: 2, intellect: 1 }, flatBonuses: { healingPower: 6 } },
  { name: "Браслет бастиона", slotType: "bracelet", level: 8, bonuses: { endurance: 2 }, flatBonuses: { physicalDefense: 5 } },
  { name: "Браслет лунной струны", slotType: "bracelet", level: 11, bonuses: { luck: 2, spirituality: 2 } },
  { name: "Ожерелье искры", slotType: "necklace", level: 3, bonuses: { intellect: 2 }, flatBonuses: { maxMana: 18 } },
  { name: "Ожерелье равновесия", slotType: "necklace", level: 6, bonuses: { endurance: 1, strength: 1, agility: 1 } },
  { name: "Ожерелье забытого хора", slotType: "necklace", level: 9, bonuses: { spirituality: 3, luck: 2 }, flatBonuses: { healingPower: 10 } },
  { name: "Шляпа странника", slotType: "head", level: 1, bonuses: { intellect: 1, agility: 1 } },
  { name: "Шлем стража", slotType: "head", level: 4, bonuses: { endurance: 2 }, flatBonuses: { physicalDefense: 4 } },
  { name: "Венец провидца", slotType: "head", level: 8, bonuses: { intellect: 2, spirituality: 2 } },
  { name: "Капюшон убийцы", slotType: "head", level: 10, bonuses: { agility: 2, luck: 2 } },
  { name: "Роба искателя", slotType: "chest", level: 2, bonuses: { intellect: 2, spirituality: 1 }, flatBonuses: { maxMana: 24 } },
  { name: "Доспех дозорного", slotType: "chest", level: 5, bonuses: { endurance: 2, strength: 1 }, flatBonuses: { maxHp: 30, physicalDefense: 6 } },
  { name: "Куртка стрелка", slotType: "chest", level: 7, bonuses: { agility: 2, luck: 1 } },
  { name: "Плащ эха", slotType: "chest", level: 12, bonuses: { spirituality: 2, intellect: 2 }, flatBonuses: { magicDefense: 6 } },
  { name: "Поножи пилигрима", slotType: "legs", level: 2, bonuses: { endurance: 1, agility: 1 } },
  { name: "Набедренники войны", slotType: "legs", level: 6, bonuses: { strength: 2, endurance: 1 } },
  { name: "Штаны скрытности", slotType: "legs", level: 9, bonuses: { agility: 3 } },
  { name: "Одеяние медитатора", slotType: "legs", level: 11, bonuses: { spirituality: 2, intellect: 1 }, flatBonuses: { shieldPower: 8 } },
  { name: "Сапоги троп", slotType: "boots", level: 1, bonuses: { agility: 1 } },
  { name: "Сапоги вихря", slotType: "boots", level: 5, bonuses: { agility: 2, luck: 1 } },
  { name: "Сапоги бастиона", slotType: "boots", level: 8, bonuses: { endurance: 2 }, flatBonuses: { maxHp: 18 } },
  { name: "Сандалии пророка", slotType: "boots", level: 12, bonuses: { spirituality: 2, agility: 1 } },
  { name: "Короткий клинок", slotType: "weapon", weapon: "sword", level: 1, bonuses: { strength: 2 } },
  { name: "Посох искры", slotType: "weapon", weapon: "staff", level: 1, bonuses: { intellect: 2, spirituality: 1 }, flatBonuses: { maxMana: 20 } },
  { name: "Лук следопыта", slotType: "weapon", weapon: "bow", level: 1, bonuses: { agility: 2, luck: 1 } },
  { name: "Рапира сумрака", slotType: "weapon", weapon: "dagger", level: 1, bonuses: { strength: 2, agility: 1 } },
  { name: "Молот бастиона", slotType: "weapon", weapon: "hammer", level: 9, bonuses: { strength: 3, endurance: 2 }, flatBonuses: { physicalDefense: 5 } },
  { name: "Арфа молитв", slotType: "weapon", weapon: "lyre", level: 1, bonuses: { spirituality: 2, luck: 1 }, flatBonuses: { healingPower: 6 } }
];

// Who wears what, worked out together with Codex. Plate is for warriors, leather for archers and assassins, cloth for mages and bards.
// Indexes of the blueprints are tied to icon files: never reorder, only add to the end.
const ARMOR_NAMES = { plate: "Латы", leather: "Кожа", cloth: "Ткань" };
Object.entries({"Кольцо ученика":{"classes":["mage","bard"]},"Кольцо удачного ветра":{"classes":["archer","assassin","bard"]},"Кольцо каменной крови":{"classes":["warrior","mage","archer","bard","assassin"]},"Кольцо рунного ядра":{"classes":["mage","bard"]},"Кольцо ярости":{"classes":["warrior","assassin"]},"Браслет охотника":{"classes":["warrior","archer","assassin"]},"Браслет жреца":{"classes":["mage","bard"]},"Браслет бастиона":{"classes":["warrior","mage","archer","bard","assassin"]},"Браслет лунной струны":{"classes":["mage","bard","archer"]},"Ожерелье искры":{"classes":["mage","bard"]},"Ожерелье равновесия":{"classes":["warrior","archer","assassin"]},"Ожерелье забытого хора":{"classes":["mage","bard"]},"Шляпа странника":{"classes":["mage","bard"],"armor":"cloth"},"Шлем стража":{"classes":["warrior"],"armor":"plate"},"Венец провидца":{"classes":["mage","bard"],"armor":"cloth"},"Капюшон убийцы":{"classes":["archer","assassin"],"armor":"leather"},"Роба искателя":{"classes":["mage","bard"],"armor":"cloth"},"Доспех дозорного":{"classes":["warrior"],"armor":"plate"},"Куртка стрелка":{"classes":["archer","assassin"],"armor":"leather"},"Плащ эха":{"classes":["mage","bard"],"armor":"cloth"},"Поножи пилигрима":{"classes":["archer","assassin"],"armor":"leather"},"Набедренники войны":{"classes":["warrior"],"armor":"plate"},"Штаны скрытности":{"classes":["archer","assassin"],"armor":"leather"},"Одеяние медитатора":{"classes":["mage","bard"],"armor":"cloth"},"Сапоги троп":{"classes":["archer","assassin"],"armor":"leather"},"Сапоги вихря":{"classes":["archer","assassin"],"armor":"leather"},"Сапоги бастиона":{"classes":["warrior"],"armor":"plate"},"Сандалии пророка":{"classes":["mage","bard"],"armor":"cloth"},"Короткий клинок":{"classes":["warrior"]},"Посох искры":{"classes":["mage"]},"Лук следопыта":{"classes":["archer"]},"Рапира сумрака":{"classes":["assassin"]},"Молот бастиона":{"classes":["warrior"]},"Арфа молитв":{"classes":["bard"]}}).forEach(([name, spec]) => { Object.assign(ITEM_BLUEPRINTS.find((bp) => bp.name === name), spec); });
ITEM_BLUEPRINTS.push(
  {"name":"Шлем закалённого дозора","slotType":"head","level":12,"classes":["warrior"],"bonuses":{"strength":1,"endurance":3},"armor":"plate","flatBonuses":{"physicalDefense":4},"iconHint":"Steel helmet with a narrow visor"},
  {"name":"Шлем последнего рубежа","slotType":"head","level":30,"classes":["warrior"],"bonuses":{"strength":2,"endurance":3},"armor":"plate","flatBonuses":{"physicalDefense":5},"iconHint":"Heavy steel helmet with reinforced brow"},
  {"name":"Кожаный капюшон разведчика","slotType":"head","level":2,"classes":["archer","assassin"],"bonuses":{"agility":2,"luck":1},"armor":"leather","iconHint":"Brown leather hood with a short cowl"},
  {"name":"Капюшон неслышного следа","slotType":"head","level":30,"classes":["archer","assassin"],"bonuses":{"agility":3,"luck":2},"armor":"leather","flatBonuses":{"magicDefense":4},"iconHint":"Dark leather hood with stitched leaf patterns"},
  {"name":"Венец согласных рун","slotType":"head","level":30,"classes":["mage","bard"],"bonuses":{"intellect":2,"spirituality":2,"luck":1},"armor":"cloth","flatBonuses":{"magicDefense":4},"iconHint":"Silver circlet with woven cloth and small runes"},
  {"name":"Панцирь клёпанной стали","slotType":"chest","level":12,"classes":["warrior"],"bonuses":{"strength":1,"endurance":3},"armor":"plate","flatBonuses":{"maxHp":24,"physicalDefense":5},"iconHint":"Riveted steel breastplate with broad shoulder guards"},
  {"name":"Латы несгибаемого шага","slotType":"chest","level":32,"classes":["warrior"],"bonuses":{"strength":2,"endurance":3},"armor":"plate","flatBonuses":{"maxHp":30,"physicalDefense":6},"iconHint":"Layered steel breastplate with a forged step emblem"},
  {"name":"Кожаная куртка тропника","slotType":"chest","level":2,"classes":["archer","assassin"],"bonuses":{"agility":2,"luck":1},"armor":"leather","flatBonuses":{"maxHp":18},"iconHint":"Simple brown leather jacket with fitted sleeves"},
  {"name":"Кожаный доспех засадника","slotType":"chest","level":12,"classes":["archer","assassin"],"bonuses":{"agility":2,"strength":1,"luck":1},"armor":"leather","flatBonuses":{"physicalDefense":4},"iconHint":"Fitted leather armor with overlapping chest panels"},
  {"name":"Куртка затерянного следа","slotType":"chest","level":32,"classes":["archer","assassin"],"bonuses":{"agility":3,"luck":1,"endurance":1},"armor":"leather","flatBonuses":{"maxHp":24,"physicalDefense":4},"iconHint":"Dark green leather jacket with hidden buckles"},
  {"name":"Мантия созвучных знаков","slotType":"chest","level":32,"classes":["mage","bard"],"bonuses":{"intellect":2,"spirituality":3},"armor":"cloth","flatBonuses":{"maxMana":24,"magicDefense":6},"iconHint":"Long blue cloth mantle embroidered with silver symbols"},
  {"name":"Поножи молодого стража","slotType":"legs","level":2,"classes":["warrior"],"bonuses":{"endurance":2,"strength":1},"armor":"plate","flatBonuses":{"physicalDefense":3},"iconHint":"Plain steel leg plates over padded lining"},
  {"name":"Поножи боевого строя","slotType":"legs","level":12,"classes":["warrior"],"bonuses":{"strength":2,"endurance":2},"armor":"plate","flatBonuses":{"physicalDefense":4},"iconHint":"Articulated steel leg guards with sturdy knee plates"},
  {"name":"Поножи крепкого рубежа","slotType":"legs","level":30,"classes":["warrior"],"bonuses":{"endurance":3,"strength":2},"armor":"plate","flatBonuses":{"maxHp":22,"physicalDefense":4},"iconHint":"Reinforced steel leg armor with square knee guards"},
  {"name":"Штаны тихой охоты","slotType":"legs","level":30,"classes":["archer","assassin"],"bonuses":{"agility":3,"luck":1,"strength":1},"armor":"leather","flatBonuses":{"physicalDefense":4},"iconHint":"Supple dark leather trousers with reinforced knees"},
  {"name":"Штаны начинающего певчего","slotType":"legs","level":2,"classes":["mage","bard"],"bonuses":{"intellect":1,"spirituality":2},"armor":"cloth","flatBonuses":{"maxMana":18},"iconHint":"Loose cream cloth trousers with a blue woven belt"},
  {"name":"Одеяние ровного дыхания","slotType":"legs","level":30,"classes":["mage","bard"],"bonuses":{"intellect":2,"spirituality":2,"endurance":1},"armor":"cloth","flatBonuses":{"shieldPower":8},"iconHint":"Layered cloth leg wraps embroidered with flowing lines"},
  {"name":"Сапоги стального шага","slotType":"boots","level":2,"classes":["warrior"],"bonuses":{"endurance":2,"strength":1},"armor":"plate","flatBonuses":{"maxHp":18},"iconHint":"Steel plated boots with thick leather soles"},
  {"name":"Сапоги непреклонной вахты","slotType":"boots","level":30,"classes":["warrior"],"bonuses":{"endurance":3,"strength":2},"armor":"plate","flatBonuses":{"maxHp":22,"physicalDefense":4},"iconHint":"Heavy articulated steel boots with reinforced toes"},
  {"name":"Сапоги точного следа","slotType":"boots","level":12,"classes":["archer","assassin"],"bonuses":{"agility":2,"luck":2},"armor":"leather","flatBonuses":{"physicalDefense":3},"iconHint":"Light leather boots with flexible laced ankles"},
  {"name":"Сапоги бесшумного рывка","slotType":"boots","level":30,"classes":["archer","assassin"],"bonuses":{"agility":3,"luck":2},"armor":"leather","flatBonuses":{"physicalDefense":4},"iconHint":"Black leather boots with soft soles and silver buckles"},
  {"name":"Башмаки первого напева","slotType":"boots","level":2,"classes":["mage","bard"],"bonuses":{"spirituality":2,"intellect":1},"armor":"cloth","flatBonuses":{"maxMana":12},"iconHint":"Simple cloth shoes with braided blue ties"},
  {"name":"Башмаки ясного созвучия","slotType":"boots","level":30,"classes":["mage","bard"],"bonuses":{"spirituality":2,"intellect":2,"luck":1},"armor":"cloth","flatBonuses":{"magicDefense":4},"iconHint":"Soft blue cloth shoes with silver embroidered spirals"},
  {"name":"Топор расколотой заклёпки","slotType":"weapon","level":30,"classes":["warrior"],"bonuses":{"strength":3,"endurance":2},"weapon":"axe","flatBonuses":{"physicalDamage":4},"iconHint":"Single bladed steel battle axe with a chipped rivet motif"},
  {"name":"Щит первой вахты","slotType":"weapon","level":3,"classes":["warrior"],"bonuses":{"endurance":2,"strength":1},"weapon":"shield","offhand":true,"flatBonuses":{"physicalDefense":4,"shieldPower":6},"iconHint":"Round iron shield with a broad central boss"},
  {"name":"Посох связующих потоков","slotType":"weapon","level":12,"classes":["mage"],"bonuses":{"intellect":3,"spirituality":1},"weapon":"staff","flatBonuses":{"skillDamage":3,"maxMana":18},"iconHint":"Wooden staff with intertwined branches around a blue crystal"},
  {"name":"Том восьми начертаний","slotType":"weapon","level":30,"classes":["mage"],"bonuses":{"intellect":2,"spirituality":3},"weapon":"tome","offhand":true,"flatBonuses":{"shieldPower":8,"healingPower":6},"iconHint":"Open leather bound spellbook with eight glowing sigils"},
  {"name":"Арбалет выверенного спуска","slotType":"weapon","level":12,"classes":["archer"],"bonuses":{"agility":2,"luck":2},"weapon":"crossbow","flatBonuses":{"physicalDamage":3},"iconHint":"Compact wooden crossbow with a steel bow and precise trigger"},
  {"name":"Колчан запасной тропы","slotType":"weapon","level":30,"classes":["archer"],"bonuses":{"agility":3,"luck":2},"weapon":"quiver","offhand":true,"flatBonuses":{"physicalDamage":3},"iconHint":"Leather quiver filled with neatly fletched arrows and short bolts"},
  {"name":"Лютня попутного напева","slotType":"weapon","level":12,"classes":["bard"],"bonuses":{"intellect":1,"spirituality":2,"luck":1},"weapon":"lute","flatBonuses":{"skillDamage":3,"healingPower":6},"iconHint":"Pear shaped wooden lute with copper strings and a carved rosette"},
  {"name":"Рапира звонкой рифмы","slotType":"weapon","level":30,"classes":["bard"],"bonuses":{"intellect":2,"spirituality":1,"luck":2},"weapon":"rapier","offhand":true,"flatBonuses":{"skillDamage":3},"iconHint":"Slender silver rapier with a treble clef shaped knuckle guard"},
  {"name":"Кинжал вскрытого шва","slotType":"weapon","level":12,"classes":["assassin"],"bonuses":{"strength":2,"agility":2},"weapon":"dagger","flatBonuses":{"physicalDamage":3},"iconHint":"Narrow steel dagger with a grooved blade and dark grip"},
  {"name":"Кинжал второго укола","slotType":"weapon","level":30,"classes":["assassin"],"bonuses":{"strength":2,"agility":2,"luck":1},"weapon":"dagger","offhand":true,"flatBonuses":{"physicalDamage":3},"iconHint":"Short offhand dagger with a curved guard and a small venom groove"},
  {"name":"Кольцо пережитой бури","slotType":"ring","level":30,"classes":["warrior","mage","archer","bard","assassin"],"bonuses":{"endurance":1,"luck":2},"flatBonuses":{"maxHp":22,"magicDefense":4},"iconHint":"Silver ring with a storm cloud engraving and an amber stone"},
  {"name":"Браслет крепкого узла","slotType":"bracelet","level":30,"classes":["warrior","mage","archer","bard","assassin"],"bonuses":{"endurance":2,"luck":1},"flatBonuses":{"physicalDefense":4,"magicDefense":4},"iconHint":"Braided silver bracelet with a sturdy interlocking knot"},
  {"name":"Ожерелье сохранённого огня","slotType":"necklace","level":30,"classes":["warrior","mage","archer","bard","assassin"],"bonuses":{"endurance":1,"luck":1,"spirituality":1},"flatBonuses":{"maxMana":18,"shieldPower":6},"iconHint":"Bronze necklace holding a warm ember beneath clear glass"},
  {"name":"Том ученика","slotType":"weapon","level":1,"classes":["mage"],"bonuses":{"intellect":1,"spirituality":2},"weapon":"tome","offhand":true,"flatBonuses":{"maxMana":12},"iconHint":"a small worn leather spell book with a brass clasp"},
  {"name":"Потёртый колчан","slotType":"weapon","level":1,"classes":["archer"],"bonuses":{"agility":2,"luck":1},"weapon":"quiver","offhand":true,"iconHint":"a worn leather quiver full of plain arrows"},
  {"name":"Шпага подмастерья","slotType":"weapon","level":1,"classes":["bard"],"bonuses":{"spirituality":1,"luck":2},"weapon":"rapier","offhand":true,"iconHint":"a slim simple rapier with a plain cup hilt"},
  {"name":"Ожерелье волчьего клыка","slotType":"necklace","level":12,"classes":["warrior","archer","assassin"],"bonuses":{"strength":1,"agility":2,"luck":1},"flatBonuses":{"physicalDamage":3},"iconHint":"a rough cord necklace with a large wolf fang and iron beads"},
  {"name":"Короткий стилет","slotType":"weapon","level":1,"classes":["assassin"],"bonuses":{"strength":1,"agility":2},"weapon":"dagger","offhand":true,"iconHint":"a short narrow stiletto dagger"}
);

// Every class has a weapon family nobody else touches: warrior heavy blades, axes and hammers with a shield; mage staff and tome;
// archer bow and quiver; bard instruments and a tuning fork, no blades at all; assassin daggers in both hands.
const WEAPON_RENAMES = {
  "Короткий клинок": { name: "Широкий меч дозорного", iconHint: "a broad heavy one-handed steel sword with a plain iron guard" },
  "Рапира сумрака": { name: "Кинжал сумрака", iconHint: "a short curved steel dagger with a charcoal leather grip" },
  "Арфа молитв": { name: "Лютня молитв", weapon: "lute", iconHint: "a worn wooden lute with a round body and a few silver strings" },
  "Арбалет выверенного спуска": { name: "Лук верной стрелы", weapon: "bow", iconHint: "a recurved wooden bow with horn tips and a taut string" },
  "Лютня попутного напева": { name: "Лира попутного напева", weapon: "lyre", iconHint: "a travel lyre with copper strings and a reinforced carved wooden frame" },
  "Рапира звонкой рифмы": { name: "Камертон звонкой рифмы", weapon: "tuningFork", iconHint: "a small silver U-shaped tuning fork with two short blunt prongs and a leather belt case" },
  "Шпага подмастерья": { name: "Камертон подмастерья", weapon: "tuningFork", iconHint: "a small plain iron U-shaped tuning fork with two short blunt prongs in a worn belt case" },
  "Короткий стилет": { name: "Кинжал тихого укола", iconHint: "a short narrow dagger with a dark leather grip" }
};
Object.entries(WEAPON_RENAMES).forEach(([oldName, spec]) => { Object.assign(ITEM_BLUEPRINTS.find((bp) => bp.name === oldName), spec); });

const STARTER_WEAPON = { warrior: "Широкий меч дозорного", mage: "Посох искры", archer: "Лук следопыта", bard: "Лютня молитв", assassin: "Кинжал сумрака" };

const ITEM_AFFIXES = [
  { id: "str", suffix: "силы", stat: "strength", base: 2 },
  { id: "int", suffix: "разума", stat: "intellect", base: 2 },
  { id: "agi", suffix: "ветра", stat: "agility", base: 2 },
  { id: "end", suffix: "стойкости", stat: "endurance", base: 2 },
  { id: "luk", suffix: "удачи", stat: "luck", base: 2 },
  { id: "spi", suffix: "духа", stat: "spirituality", base: 2 },
  { id: "hp", suffix: "жизни", flat: "maxHp", base: 14 },
  { id: "mp", suffix: "эфира", flat: "maxMana", base: 12 },
  { id: "pdmg", suffix: "натиска", flat: "physicalDamage", base: 3 },
  { id: "mdmg", suffix: "заклятий", flat: "skillDamage", base: 3 },
  { id: "pdef", suffix: "брони", flat: "physicalDefense", base: 3 },
  { id: "mdef", suffix: "оберега", flat: "magicDefense", base: 3 },
  { id: "crit", suffix: "точности", flat: "critChance", base: 1.5, fixed: true },
  { id: "dodge", suffix: "тени", flat: "dodgeChance", base: 1.2, fixed: true },
  { id: "speed", suffix: "порыва", flat: "attackSpeed", base: 1.5, fixed: true },
  { id: "heal", suffix: "милосердия", flat: "healingPower", base: 3 },
  { id: "shield", suffix: "заслона", flat: "shieldPower", base: 3 }
];

const LEGENDARY_TRAITS = {
  lifesteal: { id: "lifesteal", name: "Жажда", description: "Каждая атака лечит на 8% нанесённого урона.", value: 0.08 },
  thornmail: { id: "thornmail", name: "Колючая ковка", description: "Возвращает нападающему 18% полученного удара.", value: 0.18 },
  ember: { id: "ember", name: "Тлеющий край", description: "Криты поджигают цель.", value: 0.18 },
  battery: { id: "battery", name: "Эфирный сосуд", description: "Каждый ход восстанавливает дополнительно 3% маны.", value: 0.03 },
  firstblood: { id: "firstblood", name: "Первая кровь", description: "Первый удар в бою наносит на 40% больше урона.", value: 0.4 },
  lastward: { id: "lastward", name: "Последний оберег", description: "Раз за бой, падая ниже 25% здоровья, получаешь щит.", value: 0.3 }
};

const RESOURCE_BY_RARITY = { white: "iron-ore", green: "ether-dust", orange: "moon-thread", purple: "venom-gland", red: "astral-core", relic: "astral-core" };

const POTIONS = {
  hp: { id: "hp", name: "Зелье лечения", ratio: 0.4, price: 18, pricePerLevel: 5, tempo: 0.5, description: "Восстанавливает 40% здоровья. Ход наступает быстрее обычного." },
  mp: { id: "mp", name: "Зелье маны", ratio: 0.5, price: 16, pricePerLevel: 4, tempo: 0.5, description: "Восстанавливает 50% маны. Ход наступает быстрее обычного." }
};
const POTION_LIMIT = 5;

const HERO_NAME_POOL = ["Лиора", "Ардан", "Вейра", "Торгрим", "Сэлин", "Каэль", "Ирма", "Дамир", "Ольха", "Ратмир", "Эйла", "Мирон"];
