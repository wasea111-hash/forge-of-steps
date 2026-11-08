// Alpha 1.5 content that lives outside the talent tree: new statuses, logic fixes, new skills, enemy habits, trail boons, events and item traits.

// ---------- NEW STATUSES ----------
Object.assign(STATUS_EFFECT_DEFINITIONS, {
  slow: { id: "slow", type: "debuff", tone: "bad", ratio: true, name: "Замедление", description: "Цель реже получает ход: путы, раны или усталость." },
  blind: { id: "blind", type: "debuff", tone: "bad", name: "Ослепление", description: "Удары цели чаще проходят мимо." },
  wound: { id: "wound", type: "debuff", tone: "bad", name: "Глубокая рана", description: "Любое лечение цели вдвое слабее." },
  shock: { id: "shock", type: "debuff", tone: "bad", ratio: true, name: "Шок", description: "Следующий удар по цели сильнее, затем заряд разряжается." },
  exposed: { id: "exposed", type: "debuff", tone: "bad", name: "Открытая защита", description: "Шанс крита по цели выше." },
  soaked: { id: "soaked", type: "debuff", tone: "bad", name: "Мокрая цель", description: "Вода проводит ток и быстро замерзает: шок и иней сильнее и дольше. Огонь на мокрой цели вдвое слабее и высушивает её." }
});

// ---------- LOGIC FIXES: an effect must follow from its source ----------
const LOGIC_FIXES = {
  // Ether is not ice: the beam now just unsettles the target.
  "mage-ether-beam": { appliedEffects: [{ id: "exposed", target: "enemy", duration: 2, value: 8, chance: 0.4 }], description: "Плотный импульс эфира. Может раскрыть защиту цели: шанс крита по ней выше." },
  // Blood bleeds. It does not burn.
  "mage-blood-spark": { appliedEffects: [{ id: "bleed", target: "enemy", duration: 3, valueFormula: { sourceStat: "skillDamage", multiplier: 0.2, minValue: 4 } }], description: "Маг платит собственной кровью за мощный импульс. Рана цели начинает кровоточить." },
  // A rift tears the guard open. Fire has nothing to do with it.
  "mage-astral-rift": { appliedEffects: [{ id: "armor_break", target: "enemy", duration: 2, value: 0.25 }], description: "Разлом рвёт защиту цели. Хорошо растёт от интеллекта и духовности." },
  "assassin-nightfall": { appliedEffects: [{ id: "bleed", target: "enemy", duration: 3, valueFormula: { sourceStat: "physicalDamage", multiplier: 0.3, minValue: 5 } }], description: "Сильный финишер: глубокий надрез оставляет обильное кровотечение." },
  "assassin-shadow-lunge": { description: "Резкий выпад отравленным клинком с высоким шансом крита." }
};
Object.entries(LOGIC_FIXES).forEach(([id, patch]) => { if (SKILL_CATALOG[id]) Object.assign(SKILL_CATALOG[id], patch); });

// Which effects a skill element may cause. The test suite checks every skill against this table.
const EFFECT_SOURCES = {
  burn: ["fire"], frost: ["frost", "water", "arcane-none"], frostbite: ["frost", "water"], freeze: ["frost", "water"],
  poison: ["poison", "steel"], bleed: ["blood", "steel", "earth"], corruption: ["dark"]
};

// ---------- NEW SKILLS: subclass levels 44 and 52 close the gap before the profession ----------
const SUBCLASS_LATE_SKILLS = [
  ["mage", "elemental", { id: "mage-prism", name: "Призма стихий", category: ACTIVE, unlockLevel: 44, element: "arcane", resourceCost: 18, powerMultiplier: 1.6, cooldown: 2, description: "Разлагает защиту цели на части: шанс крита по ней выше.", appliedEffects: [eff("exposed", 3, { value: 15 })] }],
  ["mage", "elemental", { id: "mage-overload", name: "Перегрузка стихий", category: ACTIVE, unlockLevel: 52, element: "arcane", resourceCost: 24, powerMultiplier: 2.2, cooldown: 3, tempo: 1.2, special: "spend_gauge", spend: { gauge: "elemental", per: 0.3, at: 3 }, description: "Тратит весь резонанс: каждая единица даёт +30% силы." }],
  ["mage", "summoner", { id: "mage-familiar", name: "Фамильяр", category: ACTIVE, unlockLevel: 44, element: "arcane", attackType: null, targetType: "self", resourceCost: 14, cooldown: 3, description: "Призывает верного фамильяра: он бьёт каждый ход.", summonUnitConfig: { type: "spirit", role: "attacker", name: "Фамильяр", duration: 5, hpFormula: { sourceStat: "skillDamage", multiplier: 0.8, minValue: 18 }, actionPowerFormula: { sourceStat: "skillDamage", multiplier: 0.24, minValue: 6 } } }],
  ["mage", "summoner", { id: "mage-command", name: "Цепь повелителя", category: ACTIVE, unlockLevel: 52, element: "dark", resourceCost: 20, powerMultiplier: 1.2, cooldown: 3, special: "summon_strike", description: "Удар тем сильнее, чем больше рядом существ: +50% за каждое." }],
  ["mage", "light_dark", { id: "mage-eclipse", name: "Затмение", category: ACTIVE, unlockLevel: 44, element: "dark", resourceCost: 16, powerMultiplier: 1.4, selfHealMultiplier: 0.3, cooldown: 3, description: "Солнце гаснет: цель слабеет, а часть её сил уходит к магу.", appliedEffects: [eff("weaken", 2, { value: 0.2 })] }],
  ["mage", "light_dark", { id: "mage-reversal", name: "Перелом сторон", category: ACTIVE, unlockLevel: 52, element: "holy", resourceCost: 18, powerMultiplier: 1.9, cooldown: 3, special: "twilight_turn", description: "На стороне тьмы бьёт вдвое сильнее. На стороне света также даёт большой щит." }],
  ["warrior", "fury", { id: "warrior-war-cry", name: "Боевой рёв", category: ACTIVE, unlockLevel: 44, attackType: null, targetType: "self", element: "steel", resourceCost: 12, tempo: 0.7, cooldown: 5, description: "Рёв пугает врага и разгоняет твою кровь.", appliedEffects: [selfEff("rage", 3, { value: 0.25 }), eff("stagger", 2, { value: 0.2 })] }],
  ["warrior", "fury", { id: "warrior-reaping", name: "Кровавая жатва", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "blood", resourceCost: 20, powerMultiplier: 1.6, cooldown: 3, special: "spend_gauge", spend: { gauge: "fury", per: 0.015, at: 40, heal: 0.0015 }, description: "Тратит всю ярость: сильнее и лечит за каждую единицу." }],
  ["warrior", "bulwark", { id: "warrior-deep-guard", name: "Глухая оборона", category: ACTIVE, unlockLevel: 44, attackType: null, targetType: "self", element: "steel", resourceCost: 10, tempo: 0.8, cooldown: 4, special: "wall_up", description: "Сразу два камня в стену и закалка на 2 хода.", appliedEffects: [selfEff("fortify", 2, { value: 0.2 })] }],
  ["warrior", "bulwark", { id: "warrior-shield-ram", name: "Таран щитом", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "steel", resourceCost: 16, powerMultiplier: 1.4, cooldown: 3, special: "spend_gauge", spend: { gauge: "bulwark", per: 0.4, at: 3 }, description: "Обрушивает стену на врага: каждый камень +40% силы." }],
  ["archer", "marksman", { id: "archer-hold-breath", name: "Задержать дыхание", category: ACTIVE, unlockLevel: 44, attackType: null, targetType: "self", element: "steel", resourceCost: 8, tempo: 0.6, cooldown: 4, special: "focus_up", description: "Сразу две единицы сосредоточения почти без потери времени." }],
  ["archer", "marksman", { id: "archer-armor-bane", name: "Бронебойная стрела", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "steel", resourceCost: 18, powerMultiplier: 2.1, pierce: 0.6, cooldown: 3, description: "Почти не замечает брони цели." }],
  ["archer", "wild", { id: "archer-net-throw", name: "Бросок сети", category: ACTIVE, unlockLevel: 44, attackType: "physical", element: "earth", resourceCost: 12, powerMultiplier: 0.8, tempo: 0.8, cooldown: 3, description: "Сеть путает цель: она замедлена и открыта.", appliedEffects: [eff("slow", 3, { value: 0.3 }), eff("mark", 2, { value: 0.15 })] }],
  ["archer", "wild", { id: "archer-hunt", name: "Загонная охота", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "steel", resourceCost: 18, powerMultiplier: 1.3, cooldown: 3, special: "debuff_strike", description: "Каждая беда на цели даёт +40% силы." }],
  ["bard", "lyre", { id: "bard-key-change", name: "Смена лада", category: ACTIVE, unlockLevel: 44, attackType: null, targetType: "self", element: "air", resourceCost: 8, tempo: 0.6, cooldown: 4, special: "rhythm_up", description: "Две единицы ритма и короткое ускорение.", appliedEffects: [selfEff("haste", 2, { value: 0.2 })] }],
  ["bard", "lyre", { id: "bard-cadence", name: "Каденция", category: ACTIVE, unlockLevel: 52, element: "air", resourceCost: 20, powerMultiplier: 1.5, cooldown: 3, special: "spend_gauge", spend: { gauge: "lyre", per: 0.35, at: 3 }, description: "Завершает музыкальную фразу: каждая единица ритма даёт +35% силы." }],
  ["bard", "hymn", { id: "bard-undertone", name: "Подголосок", category: ACTIVE, unlockLevel: 44, element: "dark", resourceCost: 14, powerMultiplier: 1, selfHealMultiplier: 0.3, cooldown: 3, description: "Низкий голос давит врага и лечит певца.", appliedEffects: [eff("weaken", 2, { value: 0.2 })] }],
  ["bard", "hymn", { id: "bard-swell", name: "Нарастание", category: ACTIVE, unlockLevel: 52, element: "holy", resourceCost: 18, powerMultiplier: 1.8, cooldown: 4, special: "hymn_swell", description: "Гимн звучит во весь голос: удар, а стойкость ещё и лечит, ясность возвращает ману." }],
  ["assassin", "shade", { id: "assassin-throwing-knife", name: "Метательный нож", category: ACTIVE, unlockLevel: 44, attackType: "physical", element: "steel", resourceCost: 10, powerMultiplier: 1.1, tempo: 0.7, cooldown: 2, combo: 1, description: "Быстрый бросок: сразу ещё один приём." }],
  ["assassin", "shade", { id: "assassin-blade-dance", name: "Танец клинков", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "blood", resourceCost: 20, powerMultiplier: 0.6, hits: 4, cooldown: 4, effectsPerHit: true, description: "Четыре быстрых удара, каждый оставляет кровь.", appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.1, 3))] }],
  ["assassin", "venom", { id: "assassin-fume", name: "Ядовитый туман", category: ACTIVE, unlockLevel: 44, attackType: null, targetType: "enemy", element: "poison", resourceCost: 14, tempo: 0.8, cooldown: 4, description: "Едкий дым жжёт глаза: яд и ослепление.", appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.2, 5)), eff("blind", 2, { value: 22 })] }],
  ["assassin", "venom", { id: "assassin-boil-blood", name: "Вспенить яд", category: ACTIVE, unlockLevel: 52, attackType: "physical", element: "poison", resourceCost: 16, powerMultiplier: 1.2, cooldown: 3, special: "toxin_boost", description: "Яд на цели становится сильнее на 50% и дольше на 2 хода." }]
];
SUBCLASS_LATE_SKILLS.forEach(([classId, subclass, skill]) => defineBranchSkills(classId, subclass, null, [skill]));

Object.assign(SKILL_ACTIONS, {
  spend_gauge: {
    bot: (b) => { const skill = Object.values(SKILL_CATALOG).find((s) => s.special === "spend_gauge" && b.mech[s.spend.gauge]); return skill ? b.mech[skill.spend.gauge].value >= skill.spend.at : false; },
    run(b, skill) {
      const spent = spendAll(b, skill.spend.gauge);
      performSkillDamage(b, skill, 1 + spent * skill.spend.per);
      if (skill.spend.heal) healUnit(b, b.hero, b.hero.maxHp * spent * skill.spend.heal, skill.name);
    }
  },
  summon_strike: {
    can: (b) => ((b.hero.summonedUnits || []).length ? { ok: true } : { ok: false, reason: "Рядом нет существ." }),
    bot: (b) => (b.hero.summonedUnits || []).length >= 2,
    run(b, skill) { performSkillDamage(b, skill, 1 + b.hero.summonedUnits.length * 0.5); }
  },
  twilight_turn: {
    bot: (b) => Boolean(b.mech.light_dark?.side),
    run(b, skill) {
      const side = b.mech.light_dark?.side;
      performSkillDamage(b, skill, side === "dark" ? 2 : 1);
      if (side === "light") procShield(b, 0.25);
    }
  },
  wall_up: {
    bot: (b) => (b.mech.bulwark?.value || 0) < 3,
    run(b, skill) { bumpGauge(b, "bulwark", 2, 5); applySkillEffects(b, skill, b.hero, b.enemy); }
  },
  focus_up: {
    bot: (b) => (b.mech.marksman?.value || 0) < 3,
    run(b) { bumpGauge(b, "marksman", 2, 5); mechNote(b, "Сосредоточение +2"); }
  },
  debuff_strike: {
    bot: (b) => countEnemyDebuffs(b.enemy) >= 2,
    run(b, skill) { performSkillDamage(b, skill, 1 + countEnemyDebuffs(b.enemy) * 0.4); }
  },
  rhythm_up: {
    bot: (b) => (b.mech.lyre?.value || 0) < 3,
    run(b, skill) { bumpGauge(b, "lyre", 2, 4); applySkillEffects(b, skill, b.hero, b.enemy); }
  },
  hymn_swell: {
    bot: (b) => Boolean(b.mech.hymn?.active),
    run(b, skill) {
      performSkillDamage(b, skill);
      const active = b.mech.hymn?.active;
      if (active === "endurance") procHeal(b, 0.15, skill.name);
      if (active === "clarity") procMana(b, 0.2);
    }
  },
  toxin_boost: {
    bot: (b) => unitHasEffect(b.enemy, "poison"),
    run(b, skill) {
      performSkillDamage(b, skill);
      const poison = getEffect(b.enemy, "poison");
      if (poison) { poison.value = Math.round(poison.value * 1.5); poison.duration += 2; mechNote(b, "Яд вскипает"); }
    }
  }
});

// Enemies learn: repeating one skill in a row weakens it. The rule pushes players to use the whole kit.
MECHANICS.habit = { name: "Привыкание", description: "Враг запоминает повторы. Один и тот же навык подряд слабеет на 15% за повтор, до −45%. Любой другой навык сбрасывает привыкание. Работает, когда на панели три навыка и больше." };

// ---------- ENEMY HABITS ----------
// resist: multiplier for effects on this enemy. 0 means it has no such weakness at all (no blood to bleed).
const ENEMY_TRAITS = {
  packhunter: { name: "Чует кровь", description: "Бьёт на 25% сильнее, когда у героя меньше половины здоровья. Держи здоровье высоким.", on: { incoming(b, s, c) { if (hpRatio(b.hero) < 0.5) c.amount *= 1.25; } } },
  cheapshot: { name: "Подлый приём", description: "Первый удар этого врага в бою вдвое сильнее. Начни со стойки.", on: { incoming(b, s, c) { if (!s.done) { s.done = true; c.amount *= 2; } } } },
  viscous: { name: "Вязкая плоть", description: "Физические удары вязнут: −25%. Магия проходит без помех.", on: { beforeHit(b, s, c) { if (c.kind === "physical") c.mult *= 0.75; } } },
  regrow: { name: "Заживление", description: "Лечит 5% здоровья каждый ход. Огонь, яд или глубокая рана останавливают заживление.", on: { enemyTurn(b) { if (!["burn", "poison", "wound", "bleed"].some((id) => hasFx(b.enemy, id))) healUnit(b, b.enemy, b.enemy.maxHp * 0.05, "заживление"); } } },
  elusive: { name: "Вёрткий", description: "Уклонение выше на 25%, пока враг не замедлен и не помечен.", on: { start(b) { b.enemy.dodgeChance += 25; b.enemy.elusive = true; }, applied(b, s, c) { if (b.enemy.elusive && ["slow", "frost", "mark"].includes(c.id)) { b.enemy.elusive = false; b.enemy.dodgeChance = Math.max(0, b.enemy.dodgeChance - 25); logEvent(b, `${b.enemy.name} больше не уворачивается.`, "Повадка"); } } } },
  thickhide: { name: "Толстая шкура", description: "Первые три удара по нему слабее на 30%.", on: { beforeHit(b, s, c) { s.n = (s.n || 0) + 1; if (s.n <= 3) c.mult *= 0.7; } } },
  plate: { name: "Тяжёлая броня", description: "Физические удары слабее на 25%. Пробитая броня или сильное пробивание снимают защиту, магия её не замечает.", on: { beforeHit(b, s, c) { if (c.kind === "physical" && !hasFx(b.enemy, "armor_break") && c.pierce < 0.3) c.mult *= 0.75; } } },
  fireborn: { name: "Дитя огня", description: "Горение вдвое слабее, а холод на 50% сильнее.", resist: { burn: 0.5, frost: 1.5, frostbite: 1.5 } },
  bloodless: { name: "Нет крови", description: "Кровотечение не действует, яд вдвое слабее.", resist: { bleed: 0, poison: 0.5 } },
  incorporeal: { name: "Бесплотный", description: "Нет тела: кровотечение и яд не действуют. Физические удары слабее на 20%.", resist: { bleed: 0, poison: 0 }, on: { beforeHit(b, s, c) { if (c.kind === "physical") c.mult *= 0.8; } } },
  scholar: { name: "Запоминает", description: "Привыкает к твоим навыкам вдвое быстрее. Меняй навыки чаще.", setup(e) { e.scholar = true; } },
  thorns: { name: "Шипастая ржавчина", description: "Физический удар по нему возвращает тебе 10% урона.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "physical" && c.hpDamage > 0) b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - c.hpDamage * 0.1)); } } },
  mirror: { name: "Зеркальная грань", description: "Магический удар по нему возвращает тебе 12% урона.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && c.hpDamage > 0) b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - c.hpDamage * 0.12)); } } },
  manaeater: { name: "Пьёт эфир", description: "Каждый его ход сжигает 6% твоей маны.", on: { enemyTurn(b) { b.hero.currentMana = Math.max(0, Math.round(b.hero.currentMana - b.hero.maxMana * 0.06)); } } },
  growing: { name: "Нарастающая мощь", description: "С каждым ходом бьёт сильнее на 7%. Затягивать бой опасно.", on: { enemyTurn(b, s) { s.n = (s.n || 0) + 1; }, incoming(b, s, c) { c.amount *= 1 + (s.n || 0) * 0.07; } } },
  burnback: { name: "Ответное пламя", description: "Удар по ней с шансом 25% поджигает героя.", on: { afterHit(b, s, c) { if (isDirectHit(c) && roll(0.25)) applyEffect(b, b.hero, { id: "burn", duration: 2, value: Math.max(4, Math.round(b.enemy.skillDamage * 0.12)), meta: { stacks: 1 } }, b.enemy); } } },
  hungry: { name: "Голод пустоты", description: "Промах по герою лечит его на 5%.", on: { dodged(b) { healUnit(b, b.enemy, b.enemy.maxHp * 0.05, "голод"); } } },
  relentless: { name: "Неудержимый", description: "Оглушения срабатывают вдвое реже.", setup(e) { e.stunResist = 0.5; } },
  leech: { name: "Кровосос", description: "Каждый его удар лечит его на 40% урона.", on: { hurt(b, s, c) { if (c.hpDamage > 0) healUnit(b, b.enemy, c.hpDamage * 0.4, "кровь"); } } },
  shielded: { name: "Щитоносец", description: "Каждый третий ход получает щит.", on: { enemyTurn(b, s) { s.n = (s.n || 0) + 1; if (s.n % 3 === 0) applyEffect(b, b.enemy, { id: "shield", duration: 3, value: Math.round(b.enemy.maxHp * 0.1) }, b.enemy); } } },
  venomblood: { name: "Ядовитая кровь", description: "Физический удар по нему с шансом 30% отравляет героя.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "physical" && roll(0.3)) applyEffect(b, b.hero, { id: "poison", duration: 2, value: Math.max(3, Math.round(b.enemy.physicalDamage * 0.15)) }, b.enemy); } } }
};

Object.entries({
  wolf: ["packhunter"], bandit: ["cheapshot"], slime: ["viscous", "regrow"], hunter: ["elusive"], boar: ["thickhide"], greyfang: ["packhunter", "elusive"],
  ash_slime: ["viscous", "fireborn"], ember_imp: ["fireborn", "elusive"], cinder_knight: ["plate", "fireborn"], scorched_hound: ["packhunter", "fireborn"], pyre_cultist: ["fireborn"], pyre_queen: ["fireborn", "burnback"],
  rune_guard: ["bloodless", "plate"], wraith: ["incorporeal"], stone_golem: ["bloodless", "plate"], mad_scribe: ["scholar"], rust_stalker: ["thorns"], archivist: ["bloodless", "scholar"],
  void_stalker: ["elusive", "hungry"], hollow_pilgrim: ["manaeater"], limit_shard: ["bloodless", "mirror"], star_eater: ["growing"], echo_wanderer: ["scholar", "elusive"], smith: ["plate", "growing"]
}).forEach(([id, traits]) => { ENEMY_DEFINITIONS[id].traits = traits; });

// A charge is telegraphed for a turn: deal enough damage or stun the enemy to break it, or be ready to guard.
Object.assign(ENEMY_MOVES, {
  sunder: { name: "Раскол брони", kind: "physical", power: 0.8, cd: 4, apply: { id: "armor_break", duration: 3, value: 0.25 } },
  hamstring: { name: "Подрезать сухожилия", kind: "physical", power: 0.7, cd: 4, apply: { id: "slow", duration: 2, value: 0.25 } },
  sand: { name: "Песок в глаза", kind: "debuff", cd: 5, apply: { id: "blind", duration: 2, value: 25 } },
  boar_run: { name: "Разбег", kind: "windup", power: 3, cd: 5, heavy: true, hold: 1 },
  wolf_howl: { name: "Прыжок вожака", kind: "windup", power: 3.1, cd: 5, heavy: true, hold: 1 },
  pyre_charge: { name: "Великая плавка", kind: "windup", charge: "magic", power: 3.4, cd: 6, heavy: true, hold: 1, element: "fire" },
  rune_charge: { name: "Рунный заряд", kind: "windup", charge: "magic", power: 3.2, cd: 6, heavy: true, hold: 1, element: "arcane" },
  stone_charge: { name: "Замах горы", kind: "windup", power: 3.4, cd: 6, heavy: true, hold: 1 },
  void_charge: { name: "Схлопывание", kind: "windup", charge: "magic", power: 3.5, cd: 6, heavy: true, hold: 1, element: "dark" },
  forge_charge: { name: "Последний удар молота", kind: "windup", power: 4, cd: 5, heavy: true, hold: 1, element: "fire" }
});

const MOVE_PATCHES = {
  bandit: { replace: { corrode: "sand" } }, echo_wanderer: { replace: { corrode: "sunder" } }, hunter: { add: ["hamstring"] }, smith: { replace: { corrode: "sunder" }, add: ["forge_charge"] },
  boar: { add: ["boar_run"] }, greyfang: { add: ["wolf_howl"] }, cinder_knight: { add: ["stone_charge"] }, pyre_cultist: { replace: { meltdown: "pyre_charge" } }, pyre_queen: { add: ["pyre_charge"] },
  rune_guard: { add: ["rune_charge"] }, stone_golem: { add: ["stone_charge"] }, archivist: { add: ["rune_charge"] },
  limit_shard: { add: ["rune_charge"] }, hollow_pilgrim: { replace: { meltdown: "void_charge" } }, star_eater: { add: ["stone_charge"] }, void_stalker: { add: ["void_charge"] }
};
Object.entries(MOVE_PATCHES).forEach(([id, patch]) => {
  const def = ENEMY_DEFINITIONS[id];
  def.moves = [...def.moves.map((move) => patch.replace?.[move] || move), ...(patch.add || [])];
});

ELITE_AFFIXES.push(
  { id: "vampiric", name: "Кровососущий", mods: { hp: 1.2, dmg: 1.1 }, traits: ["leech"] },
  { id: "relentless", name: "Неудержимый", mods: { hp: 1.3, dmg: 1.1 }, traits: ["relentless"] },
  { id: "bulwarked", name: "Щитоносный", mods: { hp: 1.15, dmg: 1.1 }, traits: ["shielded"] },
  { id: "toxic", name: "Гниющий", mods: { hp: 1.2, dmg: 1.1 }, traits: ["venomblood"] },
  { id: "learned", name: "Учёный", mods: { hp: 1.2, dmg: 1.15 }, traits: ["scholar"] }
);

// ---------- TRAIL BOONS: temporary powers for one expedition ----------
const BOONS = {};
const B = (id, name, description, spec = {}) => { BOONS[id] = { id, name, description, ...spec }; };
const ALL = null;

B("whetstone", "Свежая заточка", "Весь физический урон сильнее на 15%.", { classes: PHYS_ALL, mods: { dmgPhys: 0.15 } });
B("focus-crystal", "Кристалл фокуса", "Весь магический урон сильнее на 15%.", { classes: ["mage", "bard"], mods: { dmgMagic: 0.15 } });
B("warm-cloak", "Тёплый плащ", "Получаемый урон ниже на 10%.", { mods: { taken: -0.1 } });
B("field-kit", "Походная аптечка", "Лечение сильнее на 25%, зелья на 25% сильнее.", { mods: { heal: 0.25, hpPotion: 0.25 } });
B("lucky-coin", "Счастливая монета", "Золото за бои и шанс добычи выше на 30%.", { mods: { gold: 0.3, drop: 0.3 } });
B("mentor", "Записки наставника", "Опыта за бои больше на 25%.", { mods: { xp: 0.25 } });
B("sharp-eye", "Настройка прицела", "Шанс крита выше на 10%.", { derived: { critChance: 10 } });
B("light-boots", "Лёгкие сапоги", "Скорость выше на 12%.", { mods: { speed: 0.12 } });
B("second-wind", "Второе дыхание", "После каждой победы лечишься на 10%.", { on: { victory(b) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.1)); } } });
B("mana-spring", "Источник маны", "После каждой победы возвращаешь 20% маны.", { on: { victory(b) { b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.2)); } } });
B("first-strike", "Удар на опережение", "Первый удар в бою сильнее на 50%.", { on: { beforeHit(b, s, c) { if (!s.done && !c.proc) { s.done = true; c.mult *= 1.5; } } } });
B("iron-skin", "Железная кожа", "Первый удар врага в бою слабее на 50%.", { on: { incoming(b, s, c) { if (!s.done) { s.done = true; c.amount *= 0.5; } } } });
B("smoke-bomb", "Дымовая шашка", "В начале боя враг ослеплён на 2 хода.", { on: { start(b) { b.enemy.effects.push(normalizeEffectSpec({ id: "blind", duration: 2, value: 25 })); } } });
B("war-drum", "Походный барабан", "Первые 3 хода боя ты в ярости.", { on: { start(b) { b.hero.effects.push({ ...normalizeEffectSpec({ id: "rage", duration: 3, value: 0.2 }), meta: { fresh: true } }); } } });
B("spare-poison", "Склянка яда", "Твои удары с шансом 15% отравляют.", { classes: ["archer", "assassin"], on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "physical" && roll(0.15)) fx(b, "poison", 3, dotValue(b, 0.14)); } } });
B("barbs", "Зазубрины", "Твои удары с шансом 15% вызывают кровотечение.", { classes: PHYS_ALL, on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "physical" && roll(0.15)) fx(b, "bleed", 2, dotValue(b, 0.16)); } } });
B("cinder-charm", "Оберег углей", "Магический удар с шансом 15% поджигает.", { classes: ["mage"], on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && roll(0.15)) fx(b, "burn", 2, dotValue(b, 0.14)); } } });
B("frost-charm", "Оберег инея", "Магический удар с шансом 15% покрывает цель инеем.", { classes: ["mage"], on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && roll(0.15)) fx(b, "frost", 2, 0.2); } } });
B("tuning-fork", "Камертон", "Каждый третий навык ошеломляет врага.", { classes: ["bard"], on: { afterAction(b, s, c) { if (c.type !== "skill") return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) fx(b, "stagger", 2, 0.2); } } });
B("shield-oil", "Масло для щита", "Щиты прочнее на 30%.", { classes: ["warrior", "mage", "bard"], mods: { shield: 0.3 } });
B("stubborn", "Упрямство странника", "Раз за бой смертельный удар оставляет тебя с 1 здоровья.", { on: { hurt(b, s) { if (b.hero.currentHp <= 0 && !s.used) { s.used = true; b.hero.currentHp = 1; mechNote(b, "Упрямство!"); } } } });
// Cursed boons pay more and take something real.
B("cursed-blade", "Проклятая сила", "Твой урон сильнее на 35%. Получаемый урон выше на 25%.", { cursed: true, mods: { dmg: 0.35, taken: 0.25 } });
B("glass-vow", "Стеклянная клятва", "Шанс крита выше на 25%. Запас здоровья меньше на 25%.", { cursed: true, derived: { critChance: 25 }, mods: { maxHpPct: -0.25 } });
B("greedy-pact", "Договор жадности", "Золота и добычи вдвое больше. Зелья лечат на 50% слабее.", { cursed: true, mods: { gold: 1, drop: 1, hpPotion: -0.5 } });
B("blood-tithe", "Кровавая десятина", "Твой урон сильнее на 25%. Каждый ход теряешь 2% здоровья.", { cursed: true, mods: { dmg: 0.25 }, on: { turnStart(b) { b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - b.hero.maxHp * 0.02)); } } });
B("mute-oath", "Обет молчания", "Навыки дешевле вдвое, но обычные удары теперь отнимают 5% здоровья.", { cursed: true, mods: { manaCost: -0.5 }, on: { afterAction(b, s, c) { if (c.type === "attack") b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - b.hero.maxHp * 0.05)); } } });

function getBoonPool(hero, cursed = false) {
  const owned = hero.expedition?.boons || [];
  return Object.values(BOONS).filter((boon) => Boolean(boon.cursed) === cursed && !owned.includes(boon.id) && (!boon.classes || boon.classes.includes(hero.classKey)));
}

function rollBoons(hero, count = 3, includeCursed = true) {
  const pool = getBoonPool(hero);
  const picks = [];
  while (picks.length < count && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
  if (includeCursed && picks.length === count) {
    const cursed = getBoonPool(hero, true);
    if (cursed.length && roll(0.4)) picks[count - 1] = randomFrom(cursed).id;
  }
  return picks;
}

function offerBoons(hero, exp, count = 3) {
  exp.pendingBoons = rollBoons(hero, count);
}

function takeBoon(hero, exp, id) {
  if (!exp.pendingBoons?.includes(id) || !BOONS[id]) return false;
  exp.boons = [...(exp.boons || []), id];
  exp.pendingBoons = null;
  applyDerivedStats(hero);
  return true;
}

// ---------- NEW EVENTS ----------
EXPEDITION_EVENTS.push(
  { id: "camp", node: "camp", title: "Привал", art: "spring", text: "Сухое место у скалы. Можно отдохнуть или потратить время на подготовку к следующим боям.", options: [
    { label: "Отдохнуть", hint: "+35% здоровья и маны", resolve: (ctx) => ctx.rest(0.35) },
    { label: "Подготовиться", hint: "Выбрать дар тропы до конца похода", resolve: (ctx) => ctx.boon("Ты проверяешь снаряжение и находишь, что можно сделать лучше.") }
  ] },
  { id: "shrine", node: "shrine", title: "Забытый алтарь", art: "altar", text: "Камень помнит старых богов. Они ещё умеют дарить, но ничего не дают даром.", options: [
    { label: "Отдать кровь", hint: "-15% здоровья, выбрать дар тропы", resolve: (ctx) => ctx.hurtThenBoon(0.15, "Алтарь принимает кровь.") },
    { label: "Уйти", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Камень остаётся молчать.") }
  ] },
  { id: "traveler", title: "Раненый путник", art: "hermit", text: "У дороги сидит человек с перебитой ногой. Рядом его дорожный мешок.", options: [
    { label: "Отдать зелье", hint: "-1 зелье лечения, опыт и дар", resolve: (ctx) => ctx.givePotion() },
    { label: "Забрать мешок", hint: "Золото и проклятый дар", resolve: (ctx) => ctx.robbery() },
    { label: "Пройти мимо", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Ты отводишь глаза и идёшь дальше.") }
  ] },
  { id: "swamp", title: "Ядовитая топь", art: "ravine", text: "Короткий путь лежит через гнилую воду. На другом берегу виден чей-то брошенный груз.", options: [
    { label: "Идти напрямик", hint: "-15% здоровья, добыча", resolve: (ctx) => { const hurt = ctx.hurt(0.15, "Топь разъедает кожу."); const loot = ctx.loot(0.7, "На берегу лежит добыча."); return { ...loot, text: `${hurt.text} ${loot.text}` }; } },
    { label: "Обойти", hint: "-15% маны", resolve: (ctx) => ctx.drainMana(0.15, "Обход выматывает, зато ноги целы.") }
  ] },
  { id: "forge", title: "Старая кузня", art: "anvil", text: "Брошенный горн ещё тёплый. Несколько монет угля хватит, чтобы наточить оружие.", options: [
    { label: "Наточить оружие", hint: "Золото из сумки, дар «Свежая заточка»", resolve: (ctx) => ctx.buyBoon("whetstone", "Клинок снова режет как новый.", "focus-crystal") },
    { label: "Уйти", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Ты оставляешь угли догорать.") }
  ] },
  { id: "nest", title: "Логово", art: "chest", text: "В расселине блестит добыча. Хозяин где-то рядом и он очень силён.", options: [
    { label: "Забрать добычу", hint: "Бой с элитой, затем дар тропы", resolve: (ctx) => ctx.ambushBoon("Хозяин логова выходит на свет!") },
    { label: "Не рисковать", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Иногда блеск лучше оставить в покое.") }
  ] },
  { id: "map", title: "Старая карта", art: "hermit", text: "В трещине камня лежит потёртая карта. Значки на ней похожи на шифр.", options: [
    { label: "Расшифровать", hint: "Проверка интеллекта", stat: "intellect", resolve: (ctx, option) => (ctx.statCheck(option.stat) ? ctx.loot(1.4, "Шифр поддался: тайник найден.") : ctx.note("Значки так и остались значками.")) },
    { label: "Продать незнакомцу", hint: "Золото в сумку", resolve: (ctx) => ctx.goldGift(0.8, "Первый встречный заплатил за неё не торгуясь.") }
  ] },
  { id: "dark-trader", title: "Тёмный торговец", art: "altar", text: "Торговец без лица предлагает вещь, от которой тянет холодом. Плата странная, а сила настоящая.", options: [
    { label: "Заключить сделку", hint: "Выбрать проклятый дар", resolve: (ctx) => ctx.cursedBoon("Сделка заключена. Назад пути нет.") },
    { label: "Отказать", hint: "Ничего не изменится", resolve: (ctx) => ctx.note("Он кивает, будто знал ответ заранее.") }
  ] },
  { id: "ghost", title: "Призрак у дороги", art: "hermit", text: "Полупрозрачная фигура загораживает путь и молча смотрит тебе в глаза.", options: [
    { label: "Заговорить", hint: "Проверка духовности", stat: "spirituality", resolve: (ctx, option) => (ctx.statCheck(option.stat) ? ctx.boon("Призрак благодарно склоняет голову и оставляет дар.") : ctx.hurt(0.15, "Холод проходит сквозь тебя.")) },
    { label: "Пройти сквозь", hint: "-10% маны", resolve: (ctx) => ctx.drainMana(0.1, "Ты идёшь сквозь него, и мысли на миг пустеют.") }
  ] }
);
["spring", "camp"].forEach((id) => { const event = EXPEDITION_EVENTS.find((entry) => entry.id === id); if (event) event.node = "camp"; });
["altar", "shrine"].forEach((id) => { const event = EXPEDITION_EVENTS.find((entry) => entry.id === id); if (event) event.node = "shrine"; });

// ---------- ITEM TRAITS: gear that changes how you play ----------
Object.assign(LEGENDARY_TRAITS, {
  stinger: { id: "stinger", name: "Жало", classes: ["archer", "assassin"], description: "Каждый третий удар отравляет цель.", on: { afterHit(b, s, c) { if (!isDirectHit(c)) return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) fx(b, "poison", 3, dotValue(b, 0.16)); } } },
  ripper: { id: "ripper", name: "Рассекатель", classes: PHYS_ALL, description: "Каждый третий удар вызывает кровотечение.", on: { afterHit(b, s, c) { if (!isDirectHit(c)) return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) fx(b, "bleed", 2, dotValue(b, 0.18)); } } },
  frostheart: { id: "frostheart", name: "Ледяное сердце", classes: ["mage"], description: "Враг, ударивший тебя, покрывается инеем.", on: { hurt(b, s, c) { if (c.hpDamage > 0 && !hasFx(b.enemy, "frost")) fx(b, "frost", 2, 0.2); } } },
  stormrod: { id: "stormrod", name: "Громоотвод", classes: ["mage"], description: "Полученный магический удар заряжает врага шоком.", on: { hurt(b, s, c) { if (c.kind === "magic" && c.hpDamage > 0) fx(b, "shock", 2, 0.3); } } },
  gambler: { id: "gambler", name: "Кость игрока", description: "Шанс крита равен шансу 30%, но удар без крита слабее на 10%.", derived: { critChance: 15 }, mods: { dmg: -0.05 } },
  echostone: { id: "echostone", name: "Камень эха", classes: ["mage", "bard"], description: "Каждый пятый навык повторяется с силой 60%.", on: { afterAction(b, s, c) { if (!c.skill?.attackType || c.skill.special) return; s.n = (s.n || 0) + 1; if (s.n % 5 === 0 && b.enemy.currentHp > 0) { mechNote(b, "Камень эха"); performSkillDamage(b, c.skill, 0.6); } } } },
  deadman: { id: "deadman", name: "Шаг мертвеца", description: "Раз за бой смертельный удар оставляет с 1 здоровья и лечит на 15%.", on: { hurt(b, s) { if (b.hero.currentHp <= 0 && !s.used) { s.used = true; b.hero.currentHp = Math.round(b.hero.maxHp * 0.15); mechNote(b, "Шаг мертвеца"); } } } },
  greedring: { id: "greedring", name: "Кольцо жадности", description: "Золота и добычи больше на 25%.", mods: { gold: 0.25, drop: 0.25 } },
  bloodpact: { id: "bloodpact", name: "Кровавый завет", description: "Каждая победа лечит на 12% здоровья.", on: { victory(b) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.12)); } } },
  skirmisher: { id: "skirmisher", name: "Застрельщик", description: "Первое действие в бою занимает вдвое меньше времени.", on: { afterAction(b, s, c) { if (!s.done) { s.done = true; c.tempo *= 0.5; } } } },
  chorus: { id: "chorus", name: "Венец свиты", classes: ["mage", "archer", "bard"], description: "Рядом может быть на одно существо больше.", mods: { summonLimit: 1 } },
  executioner: { id: "executioner", name: "Топор палача", classes: PHYS_ALL, description: "По цели ниже 25% здоровья удары сильнее на 40%.", on: { beforeHit(b, s, c) { if (hpRatio(b.enemy) < 0.25) c.mult *= 1.4; } } },
  hexcharm: { id: "hexcharm", name: "Заговорённый амулет", classes: ["mage", "bard"], description: "Каждый третий навык ослабляет врага.", on: { afterAction(b, s, c) { if (c.type !== "skill") return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) fx(b, "weaken", 2, 0.15); } } },
  mountain: { id: "mountain", name: "Сердце горы", classes: ["warrior", "mage", "bard"], description: "Стойка даёт щит на 12% здоровья.", on: { afterAction(b, s, c) { if (c.type === "guard") procShield(b, 0.12); } } }
});
