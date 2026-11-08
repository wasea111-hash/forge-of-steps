// Lair masters: one enormous opponent per lair, no packs and no stops on the way.
// A master changes during the fight (stages), has its own moves with their own staging, and its own rule (trait).

const melee = (clip, fx, extra = {}) => ({ clip, melee: true, fx, ...extra });
const shot = (clip, kind, extra = {}) => ({ clip, ranged: true, shot: kind, ...extra });
const self = (clip, fx, tint) => ({ clip, self: true, fx, tint });

Object.assign(ENEMY_MOVES, {
  // She-wolf
  sw_bite: { name: "Хватка", kind: "physical", power: 1.05, stage: melee("bite", "bite", { reach: 1.9, impact: 9, move: "dash" }) },
  sw_rend: { name: "Рваная рана", kind: "physical", power: 0.85, cd: 3, apply: { id: "bleed", duration: 4, ratio: 0.2 }, stage: melee("maul", "sweep", { reach: 1.9, tint: "#ff3d52", move: "dash" }) },
  sw_hunt: { name: "Загонная охота", kind: "physical", power: 0.46, hits: 3, cd: 3, stage: melee("twin_slash", "cross", { reach: 1.9, tint: "#ff3d52", move: "dash" }) },
  sw_pounce: { name: "Прыжок на горло", kind: "windup", power: 3.1, cd: 5, heavy: true, hold: 1, windStage: self("warcry", "howl", "#ff3d52"), stage: melee("pounce", "drop", { reach: 1.9, tint: "#ff3d52", move: "leap" }) },
  sw_howl: { name: "Вой над раной", kind: "buff", cd: 6, apply: { id: "rage", duration: 3, value: 0.3 }, stage: self("howl", "howl", "#ffb0a0") },
  sw_frenzy: { name: "Кровавый раж", kind: "physical", power: 0.42, hits: 4, cd: 4, stage: melee("twin_slash", "cross", { reach: 1.9, tint: "#ff1a33", move: "leap" }) },
  // Viper mother
  vm_fang: { name: "Клыки с ядом", kind: "physical", power: 0.95, apply: { id: "poison", duration: 4, ratio: 0.2 }, stage: melee("stab", "thrust", { reach: 2, tint: "#9be34f", move: "dash" }) },
  vm_coil: { name: "Кольца", kind: "physical", power: 0.9, cd: 4, apply: { id: "slow", duration: 3, value: 0.3 }, stage: melee("low_sweep", "sweep", { reach: 2.1, tint: "#7da04a", move: "dash" }) },
  vm_spit: { name: "Плевок в глаза", kind: "debuff", cd: 5, apply: { id: "blind", duration: 2, value: 25 }, stage: shot("spit", "glob", { tint: "#9be34f" }) },
  vm_arms: { name: "Четыре когтя", kind: "physical", power: 0.42, hits: 4, cd: 3, stage: melee("twin_slash", "cross", { reach: 2, tint: "#c6e66a", move: "dash" }) },
  vm_strike: { name: "Бросок кобры", kind: "windup", power: 3.3, cd: 5, heavy: true, hold: 1, windStage: self("cast_up", "aura", "#9be34f"), stage: melee("lunge", "impact", { reach: 2.1, tint: "#9be34f", move: "charge" }) },
  vm_flood: { name: "Ядовитый потоп", kind: "magic", power: 1.2, cd: 4, element: "poison", apply: { id: "poison", duration: 3, ratio: 0.3 }, stage: shot("cast_heavy", "orb", { big: true, tint: "#9be34f", vfx: "poison" }) },
  // Ash seneschal
  as_sceptre: { name: "Удар скипетром", kind: "physical", power: 1.1, element: "fire", stage: melee("overhead", "impact", { reach: 2, tint: "#ff8a3c", vfx: "fire", move: "charge" }) },
  as_ember: { name: "Горсть углей", kind: "magic", power: 1.05, element: "fire", apply: { id: "burn", duration: 3, ratio: 0.18 }, stage: shot("throw", "bolt", { tint: "#ff8a3c" }) },
  as_decree: { name: "Указ о слабости", kind: "debuff", cd: 5, apply: { id: "weaken", duration: 3, value: 0.25 }, stage: self("cast_up", "aura", "#ffb35c") },
  as_verdict: { name: "Приговор двора", kind: "windup", charge: "magic", power: 3.3, cd: 5, heavy: true, hold: 1, element: "fire", windStage: self("warcry", "aura", "#ff8a3c"), stage: shot("cast_heavy", "orb", { big: true, tint: "#ff6a2c", vfx: "fire" }) },
  as_ashfall: { name: "Пеплопад", kind: "magic", power: 0.48, hits: 3, cd: 4, element: "fire", stage: shot("cast_forward", "bolt", { tint: "#ffb35c" }) },
  // Executioner
  ex_chop: { name: "Рубящий удар", kind: "physical", power: 1.15, stage: melee("overhead", "drop", { reach: 2.2, tint: "#ff3d52", move: "charge" }) },
  ex_hook: { name: "Крюк на цепи", kind: "physical", power: 0.75, cd: 4, apply: { id: "slow", duration: 2, value: 0.3 }, stage: shot("throw", "knife", { tint: "#c9c4b8" }) },
  ex_flay: { name: "Сдирает доспех", kind: "physical", power: 0.8, cd: 4, apply: { id: "armor_break", duration: 3, value: 0.3 }, stage: melee("sweep", "slash", { reach: 2.2, move: "dash" }) },
  ex_taunt: { name: "Точит топор", kind: "buff", cd: 6, apply: { id: "rage", duration: 3, value: 0.3 }, stage: self("warcry", "aura", "#ff3d52") },
  ex_block: { name: "На плаху", kind: "windup", power: 3, cd: 5, heavy: true, hold: 1, pierceGuard: true, windStage: self("warcry", "aura", "#ff1a33"), stage: melee("overhead", "drop", { reach: 2.2, tint: "#ff1a33", move: "leap" }) },
  ex_whirl: { name: "Круг палача", kind: "physical", power: 0.55, hits: 3, cd: 4, stage: melee("low_sweep", "sweep", { reach: 2.2, tint: "#ff3d52", move: "charge" }) },
  // First scribe
  fs_quills: { name: "Рой перьев", kind: "physical", power: 0.36, hits: 4, cd: 2, stage: shot("cast_forward", "knife", { tint: "#7bb5a3" }) },
  fs_rune: { name: "Строка заклятия", kind: "magic", power: 1.15, element: "arcane", stage: shot("cast_forward", "bolt", { tint: "#7bb5a3" }) },
  fs_ink: { name: "Чернильный потоп", kind: "magic", power: 0.8, cd: 4, element: "dark", apply: { id: "blind", duration: 2, value: 25 }, stage: shot("spit", "glob", { tint: "#16252c" }) },
  fs_seal: { name: "Вычеркнуть", kind: "debuff", cd: 5, apply: { id: "silence", duration: 2 }, stage: self("cast_up", "aura", "#7bb5a3") },
  fs_rewrite: { name: "Переписать судьбу", kind: "windup", charge: "magic", power: 3.2, cd: 5, heavy: true, hold: 1, element: "arcane", windStage: self("cast_up", "aura", "#a3c0ff"), stage: shot("cast_heavy", "orb", { big: true, tint: "#a3c0ff", vfx: "arcane" }) },
  fs_bind: { name: "Переплёт", kind: "physical", power: 0.9, cd: 4, apply: { id: "mark", duration: 3, value: 0.25 }, stage: melee("bash", "impact", { reach: 2, move: "blink", tint: "#7bb5a3" }) },
  // Faceless widow
  wd_touch: { name: "Холодное касание", kind: "magic", power: 1, element: "frost", apply: { id: "frost", duration: 2, value: 0.2 }, stage: melee("lunge", "impact", { reach: 2, move: "blink", tint: "#c8e8ff", impact: 11 }) },
  wd_kiss: { name: "Поцелуй вдовы", kind: "magic", power: 1.2, cd: 3, lifesteal: 0.8, element: "dark", stage: melee("stab", "thrust", { reach: 2, move: "blink", tint: "#a974ff" }) },
  wd_wail: { name: "Плач без лица", kind: "debuff", cd: 5, apply: { id: "weaken", duration: 3, value: 0.25 }, stage: self("cast_up", "aura", "#c8e8ff") },
  wd_shroud: { name: "Саван", kind: "magic", power: 0.42, hits: 3, cd: 3, element: "dark", stage: shot("cast_forward", "bolt", { tint: "#a974ff" }) },
  wd_grave: { name: "Могильный холод", kind: "windup", charge: "magic", power: 3.3, cd: 5, heavy: true, hold: 1, element: "frost", windStage: self("cast_up", "aura", "#8fd0ff"), stage: shot("cast_heavy", "orb", { big: true, tint: "#8fd0ff", vfx: "frost" }) },
  wd_mute: { name: "Тишина склепа", kind: "debuff", cd: 6, apply: { id: "silence", duration: 2 }, stage: self("cast_up", "aura", "#a974ff") },
  // Rift heart
  rh_lash: { name: "Каменная плеть", kind: "physical", power: 1.1, stage: melee("sweep", "slash", { reach: 2.4, tint: "#ff8a3c", move: "dash" }) },
  rh_shards: { name: "Осколочный выброс", kind: "magic", power: 0.42, hits: 4, cd: 3, element: "arcane", stage: shot("cast_forward", "bolt", { tint: "#5fc7e8" }) },
  rh_magma: { name: "Плевок магмы", kind: "magic", power: 1.15, cd: 2, element: "fire", apply: { id: "burn", duration: 3, ratio: 0.18 }, stage: shot("spit", "glob", { tint: "#ff8a3c" }) },
  rh_quake: { name: "Удар пульса", kind: "windup", charge: "magic", power: 3.2, cd: 5, heavy: true, hold: 1, element: "fire", windStage: self("cast_up", "aura", "#ffb35c"), stage: shot("cast_heavy", "orb", { big: true, tint: "#ff6a2c", vfx: "fire" }) },
  rh_plate: { name: "Каменеющая кора", kind: "shield", ratio: 0.06, cd: 6, stage: self("mend", "mend", "#5fc7e8") },
  rh_crush: { name: "Сдавить", kind: "physical", power: 1.3, cd: 3, apply: { id: "armor_break", duration: 2, value: 0.25 }, stage: melee("overhead", "drop", { reach: 2.4, tint: "#5fc7e8", move: "charge" }) },
  // Forge titan
  ft_hammer: { name: "Удар молота", kind: "physical", power: 1.2, stage: melee("overhead", "drop", { reach: 2.4, tint: "#ffb35c", vfx: "fire", move: "charge" }) },
  ft_sweep: { name: "Размах", kind: "physical", power: 0.9, cd: 2, stage: melee("sweep", "slash", { reach: 2.4, tint: "#ffb35c", move: "dash" }) },
  ft_slag: { name: "Выплеск шлака", kind: "magic", power: 0.95, cd: 3, element: "fire", apply: { id: "burn", duration: 3, ratio: 0.2 }, stage: shot("spit", "glob", { tint: "#ff8a3c" }) },
  ft_piston: { name: "Поршневой удар", kind: "physical", power: 0.95, cd: 4, heavy: true, apply: { id: "stun", duration: 1, chance: 0.6 }, stage: melee("bash", "impact", { reach: 2.4, move: "charge" }) },
  ft_rivet: { name: "Заклёпки", kind: "physical", power: 0.36, hits: 4, cd: 3, stage: shot("throw", "knife", { tint: "#ffb35c" }) },
  ft_last: { name: "Перековка мира", kind: "windup", power: 3.4, cd: 5, heavy: true, hold: 1, element: "fire", windStage: self("warcry", "aura", "#ffb35c"), stage: melee("overhead", "drop", { reach: 2.4, tint: "#ff6a2c", vfx: "fire", move: "leap" }) }
});

// Each master plays by its own rule, shown on the card and in the fight.
Object.assign(ENEMY_TRAITS, {
  blood_scent: { name: "Запах крови", aura: true, description: "Пока ты истекаешь кровью, она бьёт на 30% сильнее. Лечение и очищение сбивают след.", on: { incoming(b, s, c) { if (b.enemy === s.owner && hasFx(b.hero, "bleed")) c.amount *= 1.3; } } },
  venom_matron: { name: "Материнский яд", aura: true, description: "Каждый её удар усиливает яд на тебе на 25%. Чем дольше яд держится, тем он страшнее.", on: { incoming(b, s) { if (b.enemy !== s.owner) return; const poison = getEffect(b.hero, "poison"); if (poison) poison.value = Math.round(poison.value * 1.25); } } },
  ash_tribute: { name: "Пепельная дань", aura: true, description: "Каждый твой навык платит дань. На четвёртом навыке двор взыскивает ожогом сразу. Обычные удары и стойка дани не платят.", on: { afterAction(b, s, c) {
    if (!c.skill || s.owner.currentHp <= 0) return;
    s.n = (s.n || 0) + 1;
    if (s.n < 4) return;
    s.n = 0;
    const value = Math.max(3, Math.round(s.owner.skillDamage * 0.3));
    emit(b, "mech", { text: "Двор взыскивает дань!" });
    applyEffect(b, b.hero, { id: "burn", duration: 3, value }, s.owner);
    emit(b, "effect", { target: "hero", id: "burn" });
    logEvent(b, "Двор взыскивает дань: ты горишь.", "Босс");
  } } },
  headsman: { name: "Рука палача", aura: true, description: "Когда у тебя меньше 40% здоровья, он бьёт на 40% сильнее. «На плаху» стойка не спасает: сорви замах или держи здоровье.", on: { incoming(b, s, c) { if (b.enemy === s.owner && hpRatio(b.hero) < 0.4) c.amount *= 1.4; } } },
  rewrite: { name: "Правка текста", aura: true, description: "Каждый третий свой ход вычёркивает навык, который ты применил последним, на 3 хода. Нужен запасной план.", on: { enemyTurn(b, s) {
    if (b.enemy !== s.owner) return;
    s.n = (s.n || 0) + 1;
    const id = b.repeat?.id;
    if (s.n % 3 !== 0 || !id || !getSkillDefinition(id)) return;
    b.hero.cooldowns[id] = Math.max(Number(b.hero.cooldowns[id] || 0), 4);
    emit(b, "mech", { text: `Вычеркнуто: ${getSkillDefinition(id).name}` });
    logEvent(b, `Переписчик вычёркивает навык «${getSkillDefinition(id).name}».`, "Босс");
  } } },
  behind_veil: { name: "За вуалью", aura: true, description: "Каждый третий ход уходит за вуаль: половина твоих ударов проходит сквозь неё. Замедление и метка не дают ей скрыться.", on: { enemyTurn(b, s) {
    if (b.enemy !== s.owner) return;
    s.n = (s.n || 0) + 1;
    const pinned = hasFx(s.owner, "slow") || hasFx(s.owner, "mark") || hasFx(s.owner, "frost");
    s.veiled = s.n % 3 === 0 && !pinned;
    if (s.veiled) { emit(b, "mech", { text: "Вдова уходит за вуаль" }); logEvent(b, "Вдова уходит за вуаль.", "Босс"); }
  }, beforeHit(b, s, c) { if (s.veiled && b.enemy === s.owner) c.mult *= 0.5; } } },
  rift_pulse: { name: "Пульс Разлома", aura: true, description: "С каждым своим ходом бьётся всё сильнее: +5% урона за ход без предела. Затянуть этот бой нельзя.", on: { enemyTurn(b, s) { if (b.enemy === s.owner) s.n = (s.n || 0) + 1; }, incoming(b, s, c) { if (b.enemy === s.owner) c.amount *= 1 + 0.05 * Number(s.n || 0); } } },
  tempering: { name: "Закалка", aura: true, description: "Каждые два хода закаляется: −5% урона по нему за слой, до 8 слоёв. Сорванный замах или пробитая броня сбивают закалку.", on: {
    enemyTurn(b, s) { if (b.enemy !== s.owner) return; s.n = (s.n || 0) + 1; if (s.n % 2 === 0) s.layers = Math.min(8, Number(s.layers || 0) + 1); },
    beforeHit(b, s, c) { if (b.enemy === s.owner && s.layers) c.mult *= 1 - 0.05 * s.layers; },
    interrupted(b, s) { s.layers = 0; emit(b, "mech", { text: "Закалка сбита" }); },
    applied(b, s, c) { if (c.id === "armor_break" && s.layers) s.layers = Math.max(0, s.layers - 2); }
  } }
});

// Sprites are in assets/sprites/<id>.
const LAIR_BOSSES = {
  lair_she_wolf: { name: "Матёрая Волчица", art: "beast", tint: "#c7cfdf", scale: 1.7, stats: { strength: 12, endurance: 12, agility: 12, luck: 6, intellect: 3, spirituality: 4 }, traits: ["blood_scent"], moves: ["sw_bite", "sw_bite", "sw_rend", "sw_hunt", "sw_pounce", "sw_howl"], lore: "Мать стаи. Серый Клык боится только её.", stages: [
    { at: 0.66, text: "Волчица рвёт с себя сломанные копья. Кровь её только злит!", add: ["sw_frenzy"], apply: { id: "rage", duration: 4, value: 0.25 } },
    { at: 0.33, text: "Последняя охота: она больше не ходит, а летит!", speed: 1.3, remove: ["sw_bite"], heal: 0.05 }
  ] },
  lair_viper_mother: { name: "Мать Гадюк", art: "caster", tint: "#9be34f", scale: 1.7, stats: { strength: 10, endurance: 12, agility: 11, luck: 5, intellect: 11, spirituality: 6 }, traits: ["venom_matron"], moves: ["vm_fang", "vm_fang", "vm_coil", "vm_spit", "vm_arms", "vm_strike"], lore: "Яд здесь копят годами, как вино, и она помнит вкус каждой жертвы.", stages: [
    { at: 0.66, text: "Мать Гадюк сбрасывает кожу: старые раны остаются в ней!", clear: true, shield: 0.08, add: ["vm_flood"] },
    { at: 0.33, text: "Корона из змей шипит разом. Каждый укус теперь глубже!", apply: { id: "rage", duration: 5, value: 0.3 }, speed: 1.15 }
  ] },
  lair_ash_seneschal: { name: "Пепельный Сенешаль", art: "knight", tint: "#ff8a3c", scale: 1.7, stats: { strength: 11, endurance: 13, agility: 6, luck: 5, intellect: 13, spirituality: 8 }, traits: ["ash_tribute", "fireborn"], moves: ["as_sceptre", "as_sceptre", "as_ember", "as_decree", "as_verdict"], lore: "Двор сгорел, а его управитель всё ещё собирает дань.", stages: [
    { at: 0.66, text: "Мантия вспыхивает: Сенешаль оглашает волю мёртвой Королевы!", add: ["as_ashfall"], shield: 0.06 },
    { at: 0.33, text: "Скипетр раскалился добела. Двор выносит последний приговор!", apply: { id: "rage", duration: 6, value: 0.3 }, speed: 1.15 }
  ] },
  lair_executioner: { name: "Палач Багровой версты", art: "knight", tint: "#ff3d52", scale: 1.8, stats: { strength: 15, endurance: 14, agility: 5, luck: 5, intellect: 2, spirituality: 3 }, traits: ["headsman", "thickhide"], moves: ["ex_chop", "ex_chop", "ex_hook", "ex_flay", "ex_block", "ex_taunt"], lore: "На этой дороге его руку видели все. Лицо не видел никто.", stages: [
    { at: 0.66, text: "Палач снимает с плеча второй крюк. Работа затягивается!", add: ["ex_whirl"] },
    { at: 0.33, text: "Топор красен до рукояти. Палач торопится закончить!", apply: { id: "rage", duration: 6, value: 0.35 }, speed: 1.2 }
  ] },
  lair_first_scribe: { name: "Первый Переписчик", art: "caster", tint: "#7bb5a3", scale: 1.7, stats: { strength: 6, endurance: 13, agility: 8, luck: 6, intellect: 15, spirituality: 10 }, traits: ["rewrite", "bloodless"], moves: ["fs_rune", "fs_rune", "fs_quills", "fs_ink", "fs_seal", "fs_rewrite"], lore: "Он прочёл всё, что нельзя читать, и теперь это пишет заново.", stages: [
    { at: 0.66, text: "Гримуар на груди открывает глаз. Переписчик читает вслух!", add: ["fs_bind"], speed: 1.1 },
    { at: 0.33, text: "Страницы кончаются. Он пишет прямо по тебе!", apply: { id: "rage", duration: 6, value: 0.3 }, shield: 0.07 }
  ] },
  lair_widow: { name: "Вдова без лица", art: "wraith", tint: "#c8e8ff", scale: 1.7, stats: { strength: 5, endurance: 11, agility: 13, luck: 7, intellect: 15, spirituality: 12 }, traits: ["behind_veil", "incorporeal"], moves: ["wd_touch", "wd_touch", "wd_kiss", "wd_wail", "wd_grave"], lore: "Здесь учились убивать те, кого никто не видел. Её тоже никто не видел.", stages: [
    { at: 0.66, text: "Вуаль колышется, и под ней никого. Саван тянется к тебе!", add: ["wd_shroud"] },
    { at: 0.33, text: "Фата падает. Лица нет, а холод идёт оттуда!", add: ["wd_mute"], apply: { id: "rage", duration: 6, value: 0.3 }, heal: 0.04 }
  ] },
  lair_rift_heart: { name: "Сердце Разлома", art: "shard", tint: "#ff8a3c", scale: 1.8, stats: { strength: 14, endurance: 15, agility: 5, luck: 4, intellect: 13, spirituality: 8 }, traits: ["rift_pulse", "bloodless"], moves: ["rh_lash", "rh_lash", "rh_magma", "rh_shards", "rh_quake"], lore: "Трещина в мире бьётся, как живая. Чем дольше ты здесь, тем чаще.", stages: [
    { at: 0.66, text: "Кора лопается, из Разлома течёт новый жар!", add: ["rh_crush", "rh_plate"] },
    { at: 0.33, text: "Ядро обнажено: пульс срывается в бешеный ритм!", speed: 1.25 }
  ] },
  lair_forge_titan: { name: "Подмастерье Кузнеца", art: "smith", tint: "#ffb35c", scale: 1.8, stats: { strength: 17, endurance: 17, agility: 6, luck: 6, intellect: 10, spirituality: 8 }, traits: ["tempering", "plate"], moves: ["ft_hammer", "ft_hammer", "ft_sweep", "ft_slag", "ft_last"], lore: "Кузнец бросил его недоделанным. Он дорабатывает себя сам.", stages: [
    { at: 0.66, text: "Горн в груди раздувается: Подмастерье стучит по себе молотом!", add: ["ft_piston"], shield: 0.07 },
    { at: 0.33, text: "Швы текут огнём. Заготовка почти готова!", add: ["ft_rivet"], apply: { id: "rage", duration: 6, value: 0.3 }, speed: 1.15 }
  ] }
};
Object.entries(LAIR_BOSSES).forEach(([id, def]) => {
  ENEMY_DEFINITIONS[id] = { ...def, named: true, hitCap: 0.06, phase: null, noReward: false };
});

// Life and blows by master, class and rank come from data.lairtune.js (fitted with tools/tune-lairs.js).
function getLairTune(master, classKey, level) {
  const table = LAIR_TUNE[master]?.[classKey];
  if (!table) return { hp: 12, dmg: 1.4 };
  const levels = Object.keys(table).map(Number).sort((x, y) => x - y);
  const high = levels.find((entry) => entry >= level) ?? levels[levels.length - 1];
  const low = [...levels].reverse().find((entry) => entry <= level) ?? levels[0];
  if (low === high) return { hp: table[low][0], dmg: table[low][1] };
  const t = (level - low) / (high - low);
  return { hp: table[low][0] + (table[high][0] - table[low][0]) * t, dmg: table[low][1] + (table[high][1] - table[low][1]) * t };
}

// Masters hunt relics: every relic of this rank worn by the hero wakes them further, so a full set stays a real fight.
const RELIC_HUNGER = { hp: 0.035, dmg: 0.06 };
function getRelicHunger(hero, level) {
  const count = Object.values(hero.equipment || {}).filter((item) => item?.rarity === "relic" && item.itemLevel >= level - 15).length;
  // Relics weigh more on low ranks, and the warrior gains the most from a set.
  const weight = (hero.classKey === "warrior" ? 2 : 1) * (1 + Math.max(0, 30 - level) / 14);
  return { count, hp: 1 + count * RELIC_HUNGER.hp * weight, dmg: 1 + count * RELIC_HUNGER.dmg * weight };
}

function makeLairBoss(hero, lair, level) {
  const def = LAIR_BOSSES[lair.master];
  const tune = getLairTune(lair.master, hero.classKey, level);
  const hunger = getRelicHunger(hero, level);
  const boss = makeEnemy(lair.master, level, { boss: true, scale: { hp: tune.hp * hunger.hp, dmg: tune.dmg * hunger.dmg } });
  boss.stages = def.stages.map((stage) => ({ ...stage, done: false }));
  boss.lairMaster = true;
  return boss;
}
