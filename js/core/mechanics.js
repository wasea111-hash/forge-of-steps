// Unique combat mechanics of subclasses and professions. Every branch is data here: new ones need no engine changes.
// Hooks: start, turnStart, beforeHit, afterHit, afterAction, incoming, hurt, dodged, beforeTick, tick, beforeHeal, heal, applied, enemyTurn, summonDeath.
function hasMechanic(unit, id) {
  return Boolean(unit?.classKey) && (unit.subclass === id || unit.profession === id);
}

function initMechanics(battle) {
  battle.mech = {};
  const hero = battle.hero;
  [CORE_BY_CLASS[hero.classKey], hero.subclass, hero.profession].filter((id) => id && MECHANICS[id]).forEach((id) => { battle.mech[id] = { value: 0 }; });
  battle.fxList = getHeroFxDefs(hero).filter((def) => def.on).map((def) => ({ def, state: {} }));
  fireMech(battle, "start");
  battle.foes.forEach((foe) => registerFoeTraits(battle, foe));
}

// A trait works only for its owner, unless it is an aura that helps the whole group.
function registerFoeTraits(battle, foe) {
  const target = battle.enemy;
  battle.enemy = foe;
  (foe.traits || []).forEach((id) => {
    const def = ENEMY_TRAITS[id];
    if (!def) return;
    def.setup?.(foe);
    if (!def.on) return;
    const entry = { def: { ...def, isEnemyTrait: true }, state: { owner: foe }, owner: foe };
    battle.fxList.push(entry);
    def.on.start?.(battle, entry.state, {});
  });
  battle.enemy = target;
}

function fireMech(battle, hook, ctx = {}) {
  Object.keys(battle.mech || {}).forEach((id) => MECHANICS[id][hook]?.(battle, battle.mech[id], ctx));
  (battle.fxList || []).forEach((entry) => {
    const handler = entry.def.on[hook];
    if (!handler) return;
    if (entry.owner && (hook === "start" || entry.owner.currentHp <= 0 || (!entry.def.aura && entry.owner !== battle.enemy))) return;
    const previous = battle.fxName;
    battle.fxName = entry.def.isEnemyTrait ? null : entry.def.name;
    battle.fxSaid = null;
    handler(battle, entry.state, ctx);
    battle.fxName = previous;
  });
  return ctx;
}

function getMechGauges(battle) {
  const gauges = Object.keys(battle.mech || {}).map((id) => {
    const def = MECHANICS[id];
    const state = battle.mech[id];
    return { id, name: def.name, value: Math.round(def.value ? def.value(battle, state) : state.value), max: def.max ? (typeof def.max === "function" ? def.max(battle) : def.max) : 0, text: def.text ? def.text(battle, state) : "" };
  });
  const habit = getHabitPenalty(battle);
  if (habit > 0) gauges.push({ id: "habit", name: MECHANICS.habit.name, value: 0, max: 0, text: `−${Math.round(habit * 100)}%` });
  return gauges;
}

function mechNote(battle, text) {
  emit(battle, "mech", { text });
  logEvent(battle, text, "Механика");
}

function addGauge(state, amount, max) {
  state.value = clamp(state.value + amount, 0, max);
}

function getSummonLimit(hero) {
  if (tm(hero, "summonOne")) return 1;
  return Math.max(SUMMONED_UNIT_LIMIT, ...[hero.subclass, hero.profession].map((id) => MECHANICS[id]?.summonLimit || 0)) + tm(hero, "summonLimit");
}

function countEnemyDebuffs(enemy) {
  return (enemy.effects || []).filter((effect) => STATUS_EFFECT_DEFINITIONS[effect.id]?.tone === "bad").length;
}

function isMagicHit(ctx) {
  return ctx.kind === "magic";
}

const MECHANICS = {
  // ----- MAGE -----
  elemental: {
    name: "Резонанс", max: 5, description: "Каждое заклинание подряд даёт +4% магического урона. Обычный удар сбрасывает резонанс.",
    beforeHit(b, s, ctx) { if (isMagicHit(ctx)) ctx.mult *= 1 + s.value * 0.04; },
    afterAction(b, s, ctx) {
      if (ctx.type === "attack") s.value = 0;
      if (ctx.type === "skill" && ctx.skill.attackType === "skill") addGauge(s, 1, 5);
    }
  },
  fire: {
    name: "Детонация", description: "Четыре стака горения на цели вызывают взрыв с процентным уроном. Удары по горящей цели на 10% сильнее.",
    value: (b) => { const burn = getEffect(b.enemy, "burn"); return burn ? getEffectStacks(burn) : 0; },
    max: (b) => Number(getEffect(b.enemy, "burn")?.meta?.maxStacks || BURN_DETONATION_THRESHOLD),
    beforeHit(b, s, ctx) { if (unitHasEffect(b.enemy, "burn")) ctx.mult *= 1.1; }
  },
  water: {
    name: "Холод", max: 3, description: "Ледяные навыки копят холод. На трёх единицах цель обморожена. По замороженной цели удар сильнее на 50%, а пока враг скован холодом, лечение сильнее на 25%.",
    beforeHit(b, s, ctx) { if (unitHasEffect(b.enemy, "freeze")) ctx.mult *= 1.5; },
    beforeHeal(b, s, ctx) { if (["frost", "frostbite", "freeze"].some((id) => unitHasEffect(b.enemy, id))) ctx.amount *= 1.25; },
    afterAction(b, s, ctx) {
      if (!ctx.skill?.chill || b.enemy.currentHp <= 0) return;
      addGauge(s, ctx.skill.chill, 3);
      if (s.value >= 3) {
        s.value = 0;
        applyEffect(b, b.enemy, { id: "frostbite", duration: 3, value: 20 }, b.hero);
        emit(b, "effect", { target: "enemy", id: "frostbite" });
        logEvent(b, `${b.enemy.name}: обморожение.`, "Холод");
      }
    }
  },
  earth: {
    name: "Давление", max: 100, description: "Земляные удары ошеломляют цель и копят давление. На 100 цель оглушена, это работает и на боссов.",
    afterAction(b, s, ctx) {
      if (!ctx.skill?.pressure || b.enemy.currentHp <= 0) return;
      applyEffect(b, b.enemy, { id: "stagger", duration: 2, value: 0.2 }, b.hero);
      emit(b, "effect", { target: "enemy", id: "stagger" });
      addGauge(s, ctx.skill.pressure, 100);
      if (s.value >= 100) {
        s.value = 0;
        applyStun(b, b.enemy, b.hero, 99);
        mechNote(b, "Давление сломало врага: оглушение!");
      }
    }
  },
  air: {
    name: "Поток", max: 5, description: "Каждое действие копит поток и немного ускоряет. Полный поток повторяет навык с силой 60% и почти даёт лишний ход.",
    afterAction(b, s, ctx) {
      addGauge(s, 1 + Number(ctx.skill?.flow || 0), 5);
      b.hero.speedMult = 1 + s.value * 0.03;
      if (s.value >= 5 && ctx.skill?.attackType && b.enemy.currentHp > 0) {
        s.value = 0;
        b.hero.speedMult = 1;
        mechNote(b, "Поток повторяет навык!");
        performSkillDamage(b, ctx.skill, 0.6);
        ctx.tempo *= 0.4;
      }
    }
  },
  summoner: {
    name: "Связь", summonLimit: 3, description: "До трёх существ. Каждое даёт +6% урона, а гибель существа возвращает 8% маны.",
    value: (b) => (b.hero.summonedUnits || []).length, max: (b) => getSummonLimit(b.hero),
    beforeHit(b, s, ctx) { ctx.mult *= 1 + (b.hero.summonedUnits || []).length * 0.06; },
    summonDeath(b) { b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.08)); }
  },
  spirit: {
    name: "Гармония", max: 3, description: "Хранитель даёт щит, целитель лечит, дух энергии возвращает ману, боевой дух бьёт. Три разных духа дают +15% урона и лечения.",
    value: (b) => new Set((b.hero.summonedUnits || []).map((unit) => unit.role)).size,
    beforeHit(b, s, ctx) { if (MECHANICS.spirit.value(b) >= 3) ctx.mult *= 1.15; },
    beforeHeal(b, s, ctx) { if (MECHANICS.spirit.value(b) >= 3) ctx.amount *= 1.15; }
  },
  undead: {
    name: "Кости", max: 6, summonLimit: 5, description: "Армия до пяти. Каждое существо бьёт сильнее рядом с другими. Гибель копит кости, а «Взрыв костей» расходует всю армию ради удара.",
    summonDeath(b, s, ctx) { if (ctx.summon.type === "undead") addGauge(s, 1, 6); }
  },
  light_dark: {
    name: "Сумерки", max: 1, description: "Смена стороны усиливает: удар после лечения или щита на 25% сильнее, лечение после удара на 25% сильнее.",
    text: (b, s) => (s.side === "light" ? "свет" : s.side === "dark" ? "тьма" : ""),
    value: (b, s) => (s.side ? 1 : 0),
    beforeHit(b, s, ctx) { if (s.side === "light") ctx.mult *= 1.25; },
    beforeHeal(b, s, ctx) { if (s.side === "dark") ctx.amount *= 1.25; },
    afterAction(b, s, ctx) {
      if (ctx.type !== "skill") return;
      if (ctx.skill.attackType) s.side = "dark";
      else if (ctx.skill.selfHealMultiplier || ctx.skill.specialAction === "light_shield") s.side = "light";
    }
  },
  light: {
    name: "Сияние", max: (b) => Math.round(b.hero.maxHp * 0.6), description: "Лечение и поглощённый щитом урон копят сияние. «Суд» превращает его в удар. Лопнувший щит лечит.",
    heal(b, s, ctx) { addGauge(s, ctx.amount, Math.round(b.hero.maxHp * 0.6)); },
    hurt(b, s, ctx) {
      addGauge(s, ctx.absorbed, Math.round(b.hero.maxHp * 0.6));
      if (ctx.absorbed > 0 && !unitHasEffect(b.hero, "shield")) healUnit(b, b.hero, b.hero.maxHp * 0.06, "щит");
    }
  },
  dark: {
    name: "Порча", max: 5, description: "Ослабление сразу вызывает порчу. Каждая беда на враге даёт +8% магического урона.",
    value: (b) => countEnemyDebuffs(b.enemy),
    beforeHit(b, s, ctx) { if (isMagicHit(ctx)) ctx.mult *= 1 + countEnemyDebuffs(b.enemy) * 0.08; },
    applied(b, s, ctx) {
      if (ctx.id !== "weaken" || unitHasEffect(b.enemy, "corruption")) return;
      applyEffect(b, b.enemy, { id: "corruption", duration: 3, value: Math.max(5, Math.round(b.hero.skillDamage * 0.2)) }, b.hero);
      emit(b, "effect", { target: "enemy", id: "corruption" });
    }
  },

  // ----- WARRIOR -----
  fury: {
    name: "Ярость", max: 100, description: "Копится от ударов и ран. Каждые 10 единиц дают +3% урона.",
    beforeHit(b, s, ctx) { ctx.mult *= 1 + Math.floor(s.value / 10) * 0.03; },
    afterHit(b, s) { addGauge(s, 7, 100); },
    hurt(b, s, ctx) { if (ctx.hpDamage > 0) addGauge(s, 12, 100); }
  },
  berserk: {
    name: "Кровавый порог", max: 100, description: "За каждый потерянный процент здоровья +0,8% урона. Ниже 30% здоровья удары лечат. Раз за бой смертельный удар оставляет с 1 здоровья.",
    value: (b) => Math.round((1 - b.hero.currentHp / b.hero.maxHp) * 100),
    beforeHit(b, s, ctx) { ctx.mult *= 1 + (1 - b.hero.currentHp / b.hero.maxHp) * 0.8; },
    afterHit(b, s, ctx) { if (b.hero.currentHp / b.hero.maxHp < 0.3 && ctx.hpDamage > 0) healUnit(b, b.hero, ctx.hpDamage * 0.2, "жажда"); },
    hurt(b, s) {
      if (b.hero.currentHp <= 0 && !s.saved) {
        s.saved = true;
        b.hero.currentHp = 1;
        applyEffect(b, b.hero, { id: "rage", duration: 2, value: 0.4 }, b.hero);
        mechNote(b, "Берсерк отказывается падать!");
      }
    }
  },
  breaker: {
    name: "Трещины", max: 5, description: "Физические навыки трескают броню: каждая трещина −8% защиты цели. На пяти броня рушится, а обычный враг оглушён.",
    beforeHit(b, s, ctx) { if (ctx.kind === "physical") ctx.pierce += s.value * 0.08; },
    afterAction(b, s, ctx) {
      if (!ctx.skill?.attackType || b.enemy.currentHp <= 0 || ctx.skill.special === "break_armor") return;
      addGauge(s, Number(ctx.skill.cracks || 1), 5);
      if (s.value >= 5) {
        s.value = 0;
        applyEffect(b, b.enemy, { id: "armor_break", duration: 3, value: 0.5 }, b.hero);
        emit(b, "effect", { target: "enemy", id: "armor_break" });
        if (!b.enemy.isBoss) applyStun(b, b.enemy, b.hero, 99);
        mechNote(b, "Броня врага рушится!");
      }
    }
  },
  bulwark: {
    name: "Стена", max: 5, description: "Каждая стойка кладёт камень в стену: −4% получаемого урона за камень. Каждый пропущенный удар снимает один камень.",
    afterAction(b, s, ctx) { if (ctx.type === "guard") addGauge(s, 1, 5); },
    incoming(b, s, ctx) { ctx.amount *= 1 - s.value * 0.04; },
    hurt(b, s, ctx) { if (ctx.hpDamage > 0) addGauge(s, -1, 5); }
  },
  guardian: {
    name: "Возмездие", max: (b) => b.hero.maxHp, description: "Урон, снятый стойкой и щитами, копится. «Кара стража» выпускает всё накопленное одним ударом.",
    hurt(b, s, ctx) { addGauge(s, ctx.absorbed + ctx.blocked, b.hero.maxHp); }
  },
  duelist: {
    name: "Парирование", max: 3, description: "Навык с парированием взводит защиту: следующий физический удар отбит, следует контратака, а следующий удар гарантированно критический. Шкала показывает темп: он добавляет удары «Вихрю клинка».",
    text: (b, s) => (s.armed ? "взведено" : ""),
    beforeHit(b, s, ctx) { if (s.crit) { ctx.forceCrit = true; s.crit = false; } },
    afterAction(b, s, ctx) { if (ctx.skill?.armParry) s.armed = true; },
    incoming(b, s, ctx) {
      if (!s.armed || ctx.kind !== "physical") return;
      s.armed = false;
      addGauge(s, 1, 3);
      ctx.parried = true;
      mechNote(b, "Удар отбит!");
      performHeroHit(b, { kind: "physical", power: ctx.heavy ? 2.2 : 1.2, label: "Контратака", element: "steel", noEcho: true });
      s.crit = true;
    }
  },

  // ----- ARCHER -----
  marksman: {
    name: "Сосредоточение", max: 5, description: "Растёт каждый ход, пока тебя не ранят: +6% крита и +6% пробивания брони за единицу. «Выждать» даёт сразу две. Рана снимает одну.",
    turnStart(b, s) { if (!s.hurtThisRound) addGauge(s, 1, 5); s.hurtThisRound = false; },
    beforeHit(b, s, ctx) { ctx.critBonus += s.value * 6; ctx.pierce += s.value * 0.06; },
    afterAction(b, s, ctx) { if (ctx.type === "wait") addGauge(s, 2, 5); },
    hurt(b, s, ctx) { if (ctx.hpDamage > 0) { s.hurtThisRound = true; addGauge(s, -1, 5); } }
  },
  sniper: {
    name: "Смертельный выстрел", description: "«Выстрел в голову» расходует всё сосредоточение: +40% силы и +15% пробивания за единицу, на пяти единицах это гарантированный крит. По меченой цели пробивание ещё на 30% выше.",
    value: (b) => b.mech.marksman?.value || 0, max: 5,
    beforeHit(b, s, ctx) { if (unitHasEffect(b.enemy, "mark")) ctx.pierce += 0.3; }
  },
  stormshot: {
    name: "Шквал", max: 6, description: "Каждая шестая стрела вызывает бесплатный залп из двух стрел. Под ускорением многоударные навыки выпускают на стрелу больше.",
    afterHit(b, s) {
      addGauge(s, 1, 6);
      if (s.value >= 6 && b.enemy.currentHp > 0) {
        s.value = 0;
        mechNote(b, "Шквал!");
        for (let i = 0; i < 2 && b.enemy.currentHp > 0; i += 1) performHeroHit(b, { kind: "physical", power: 0.6, label: "Залп", element: "air", noEcho: true });
      }
    }
  },
  wild: {
    name: "Чутьё", max: 5, description: "Каждая беда на враге даёт +7% урона: яд, раны, метка и другие.",
    value: (b) => countEnemyDebuffs(b.enemy),
    beforeHit(b, s, ctx) { ctx.mult *= 1 + countEnemyDebuffs(b.enemy) * 0.07; }
  },
  ranger: {
    name: "Ловушка", description: "Ловушка ставится заранее и срабатывает, когда враг начинает ход. Одновременно стоит одна.",
    text: (b, s) => (s.trap ? s.trap.name : ""), value: (b, s) => (s.trap ? 1 : 0), max: 1,
    enemyTurn(b, s) {
      if (!s.trap) return;
      const trap = s.trap;
      s.trap = null;
      mechNote(b, `${trap.name} срабатывает!`);
      performHeroHit(b, { kind: "physical", power: trap.power, label: trap.name, element: trap.element, noEcho: true, sure: true });
      if (b.enemy.currentHp <= 0) return;
      if (trap.poison) {
        applyEffect(b, b.enemy, { id: "poison", duration: 3, value: Math.max(5, Math.round(b.hero.physicalDamage * trap.poison)) }, b.hero);
        emit(b, "effect", { target: "enemy", id: "poison" });
      }
      if (trap.slow) {
        applyEffect(b, b.enemy, { id: "slow", duration: 3, value: trap.slow }, b.hero);
        emit(b, "effect", { target: "enemy", id: "slow" });
      }
      if (trap.stun) applyStun(b, b.enemy, b.hero, trap.stun);
    }
  },
  beastmaster: {
    name: "Волк", description: "Волк с тобой с первого хода и живёт до конца боя. Ему можно отдавать приказы. Гибель волка вызывает ярость хозяина.",
    summonLimit: 3,
    text: (b) => { const wolf = findWolf(b.hero); return wolf ? `${wolf.hp}/${wolf.maxHp}` : "пал"; },
    start(b) { summonWolf(b); },
    summonDeath(b, s, ctx) {
      if (ctx.summon.role !== "wolf") return;
      applyEffect(b, b.hero, { id: "rage", duration: 3, value: 0.3 }, b.hero);
      emit(b, "effect", { target: "hero", id: "rage" });
    }
  },

  // ----- BARD -----
  lyre: {
    name: "Ритм", max: 4, description: "Каждый навык, отличный от предыдущего, даёт +5% урона и лечения. Повтор сбрасывает ритм.",
    beforeHit(b, s, ctx) { ctx.mult *= 1 + s.value * 0.05; },
    beforeHeal(b, s, ctx) { ctx.amount *= 1 + s.value * 0.05; },
    afterAction(b, s, ctx) {
      if (ctx.type !== "skill") return;
      if (s.last === ctx.skill.id) s.value = 0;
      else addGauge(s, 1, 4);
      s.last = ctx.skill.id;
    }
  },
  skald: {
    name: "Песнь", max: 3, description: "Куплеты грома, ветра и жизни складываются в припев: сильный удар, ярость, ускорение и лечение.",
    value: (b, s) => (s.verses || []).length,
    afterAction(b, s, ctx) {
      if (!ctx.skill?.verse) return;
      s.verses = [...new Set([...(s.verses || []), ctx.skill.verse])];
      if (s.verses.length < 3) return;
      s.verses = [];
      mechNote(b, "Припев!");
      if (b.enemy.currentHp > 0) performHeroHit(b, { kind: "magic", power: 2.2, label: "Припев", element: "holy", noEcho: true });
      applyEffect(b, b.hero, { id: "rage", duration: 2, value: 0.25 }, b.hero);
      applyEffect(b, b.hero, { id: "haste", duration: 2, value: 0.25 }, b.hero);
      emit(b, "effect", { target: "hero", id: "rage" });
      healUnit(b, b.hero, b.hero.maxHp * 0.12, "припев");
    }
  },
  trickster: {
    name: "Карта судьбы", description: "В начале хода тянешь карту, если её нет. Следующий навык расходует карту и получает её свойство.",
    text: (b, s) => (s.card ? TRICKSTER_CARDS[s.card].name : ""),
    start(b, s) { s.card = randomFrom(Object.keys(TRICKSTER_CARDS)); },
    turnStart(b, s) { if (!s.card) s.card = randomFrom(Object.keys(TRICKSTER_CARDS)); },
    beforeHit(b, s, ctx) { if (s.card && ctx.skill) TRICKSTER_CARDS[s.card].hit?.(b, ctx); },
    afterAction(b, s, ctx) {
      if (ctx.type !== "skill" || !s.card || ctx.skill.special === "redraw") return;
      TRICKSTER_CARDS[s.card].after?.(b);
      s.card = null;
    }
  },
  hymn: {
    name: "Гимн", description: "Один гимн звучит постоянно и заменяет прошлый. Стойкость лечит каждый ход, мощь усиливает урон на 15%, ясность возвращает ману.",
    text: (b, s) => ({ endurance: "стойкость", might: "мощь", clarity: "ясность" })[s.active] || "",
    afterAction(b, s, ctx) { if (ctx.skill?.hymn) s.active = ctx.skill.hymn; },
    beforeHit(b, s, ctx) { if (s.active === "might") ctx.mult *= 1.15; },
    turnStart(b, s) {
      if (s.active === "endurance") healUnit(b, b.hero, b.hero.maxHp * 0.03, "гимн");
      if (s.active === "clarity") b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.06));
    }
  },
  cantor: {
    name: "Избыток", max: (b) => Math.round(b.hero.maxHp * 0.6), description: "Лечение сверх полного здоровья не пропадает, а копится. «Хорал» превращает его в удар и щит.",
    heal(b, s, ctx) { addGauge(s, ctx.overflow, Math.round(b.hero.maxHp * 0.6)); }
  },
  choirmaster: {
    name: "Хор", max: 4, summonLimit: 4, description: "До четырёх голосов. Три и больше дают аккорд: голоса действуют в полтора раза сильнее. «Кульминация» расходует весь хор.",
    value: (b) => (b.hero.summonedUnits || []).filter((unit) => unit.role === "voice").length
  },

  // ----- ASSASSIN -----
  shade: {
    name: "Приёмы", max: 5, description: "Каждый физический удар копит приём, крит даёт два. Добивающие навыки тратят все приёмы: +25% силы за приём.",
    afterHit(b, s, ctx) { if (ctx.kind === "physical" && !ctx.skill?.finisher) addGauge(s, ctx.crit ? 2 : 1, 5); }
  },
  blade: {
    name: "Казнь", description: "Добивающий навык убивает цель, если её здоровье ниже порога: 6% и ещё 2% за приём. На боссах порог вдвое ниже.",
    value: (b) => Math.round(getExecuteThreshold(b) * 100), max: 16
  },
  phantom: {
    name: "Тени", max: 3, description: "Уклонение рождает тень. Каждая тень повторяет твой удар с силой 35%.",
    dodged(b, s) { addGauge(s, 1, 3); },
    afterHit(b, s, ctx) {
      if (ctx.noEcho || !s.value || ctx.kind !== "physical") return;
      for (let i = 0; i < s.value && b.enemy.currentHp > 0; i += 1) performHeroHit(b, { kind: "physical", power: 0.35 * (ctx.skill ? getSkillPower(ctx.skill, b.hero) : 1), label: "Удар тени", element: "dark", noEcho: true });
    },
    afterAction(b, s, ctx) { if (ctx.skill?.shades) addGauge(s, ctx.skill.shades, 3); }
  },
  venom: {
    name: "Токсин", description: "Новый яд складывается со старым, до четырёх доз. Отравленная цель получает на 10% больше прямого урона.",
    value: (b) => Math.round(getEffect(b.enemy, "poison")?.value || 0),
    beforeHit(b, s, ctx) { if (unitHasEffect(b.enemy, "poison")) ctx.mult *= 1.1; }
  },
  poisoner: {
    name: "Вскрытие", description: "«Вскрытие раны» наносит сразу весь оставшийся урон яда, не снимая его. Каждый тик яда снижает защиту цели.",
    value: (b) => { const poison = getEffect(b.enemy, "poison"); return poison ? Math.round(poison.value * poison.duration) : 0; },
    tick(b, s, ctx) { if (ctx.id === "poison") b.enemy.defShred = Number(b.enemy.defShred || 0) + 2; }
  },
  plaguebearer: {
    name: "Заражение", max: 5, description: "Каждый тик урона копит заражение. На пяти начинается чума: весь периодический урон +50% до конца боя, а его часть лечит тебя.",
    text: (b, s) => (s.plague ? "чума" : ""),
    beforeTick(b, s, ctx) { if (s.plague) ctx.amount *= 1.5; },
    tick(b, s, ctx) {
      if (s.plague) { healUnit(b, b.hero, ctx.amount * 0.3, "чума"); return; }
      addGauge(s, 1, 5);
      if (s.value >= 5) { s.plague = true; mechNote(b, "Начинается чума!"); }
    }
  }
};

const TRICKSTER_CARDS = {
  ace: { name: "Туз: +60% силы", hit: (b, ctx) => { ctx.mult *= 1.6; } },
  jester: { name: "Шут: оглушение", after: (b) => { if (b.enemy.currentHp > 0) applyStun(b, b.enemy, b.hero, 0.7); } },
  cups: { name: "Кубки: лечение", after: (b) => healUnit(b, b.hero, b.hero.maxHp * 0.15, "кубки") },
  spades: { name: "Пики: метка", after: (b) => { if (b.enemy.currentHp > 0) { applyEffect(b, b.enemy, { id: "mark", duration: 3, value: 0.3 }, b.hero); emit(b, "effect", { target: "enemy", id: "mark" }); } } },
  coins: { name: "Монеты: мана", after: (b) => { b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.25)); } }
};

function findWolf(hero) {
  return (hero.summonedUnits || []).find((unit) => unit.role === "wolf") || null;
}

function summonWolf(battle) {
  const hero = battle.hero;
  const hp = Math.round(hero.maxHp * 0.5);
  hero.summonedUnits = [...(hero.summonedUnits || []), { id: uid("wolf"), type: "beast", role: "wolf", name: "Волк", hp, maxHp: hp, power: Math.max(6, Math.round(hero.physicalDamage * 0.35)), duration: 999, persistent: true }];
}

function getExecuteThreshold(battle) {
  const combo = battle.mech.shade?.value || 0;
  return (0.06 + combo * 0.02 + tm(battle.hero, "executeBonus")) * (battle.enemy.isBoss ? 0.5 : 1);
}

function spendAll(battle, id) {
  const state = battle.mech[id];
  if (!state) return 0;
  const value = state.value;
  state.value = 0;
  return value;
}

// Skills with a unique action. can: extra check before casting, bot: when the bot should use it, run: the effect.
const SKILL_ACTIONS = {
  vengeance: {
    can: (b) => (b.mech.guardian?.value > 0 ? { ok: true } : { ok: false, reason: "Возмездие ещё не накоплено." }),
    bot: (b) => b.mech.guardian?.value > b.hero.maxHp * 0.2,
    run(b, skill) { performHeroHit(b, { kind: "physical", power: 0.6, flat: spendAll(b, "guardian") * 1.2, label: skill.name, element: "steel", skill, sure: true }); }
  },
  headshot: {
    bot: (b) => (b.mech.marksman?.value || 0) >= 4,
    run(b, skill) {
      const focus = spendAll(b, "marksman");
      performSkillDamage(b, skill, 1 + focus * 0.4, { pierce: focus * 0.15, forceCrit: focus >= 5 });
    }
  },
  trap: {
    can: (b) => (b.mech.ranger?.trap ? { ok: false, reason: "Ловушка уже стоит." } : { ok: true }),
    bot: () => true,
    run(b, skill) {
      b.mech.ranger.trap = { name: skill.name, element: skill.element, ...skill.trap };
      logEvent(b, `${skill.name} поставлена.`, "Ловушка");
    }
  },
  wolf_call: {
    can: (b) => (findWolf(b.hero) ? { ok: false, reason: "Волк уже рядом." } : { ok: true }),
    bot: () => true,
    run(b) { summonWolf(b); emit(b, "summon", { kind: "beast" }); logEvent(b, "Волк возвращается к хозяину.", "Зверь"); }
  },
  wolf_strike: {
    can: (b) => (findWolf(b.hero) ? { ok: true } : { ok: false, reason: "Волк пал." }),
    bot: () => true,
    run(b, skill) {
      const wolf = findWolf(b.hero);
      const { hpDamage } = dealDamage(b, b.enemy, wolf.power * 2.5);
      emit(b, "summonHit", { amount: hpDamage, name: wolf.name });
      logEvent(b, `Волк рвёт добычу: ${hpDamage} урона.`, "Зверь");
      if (b.enemy.currentHp > 0) applySkillEffects(b, skill, b.hero, b.enemy);
    }
  },
  wolf_guard: {
    can: (b) => (findWolf(b.hero) ? { ok: true } : { ok: false, reason: "Волк пал." }),
    bot: (b) => b.hero.currentHp / b.hero.maxHp < 0.6,
    run(b, skill) {
      const wolf = findWolf(b.hero);
      wolf.taunt = 2;
      wolf.hp = Math.min(wolf.maxHp, Math.round(wolf.hp + wolf.maxHp * 0.25));
      applySkillEffects(b, skill, b.hero, b.enemy);
      logEvent(b, "Волк заслоняет хозяина.", "Зверь");
    }
  },
  redraw: {
    bot: () => false,
    run(b) { b.mech.trickster.card = randomFrom(Object.keys(TRICKSTER_CARDS)); mechNote(b, `Новая карта: ${TRICKSTER_CARDS[b.mech.trickster.card].name}.`); }
  },
  chorale: {
    can: (b) => (b.mech.cantor?.value > 0 ? { ok: true } : { ok: false, reason: "Избытка ещё нет." }),
    bot: (b) => b.mech.cantor?.value > b.hero.maxHp * 0.15,
    run(b, skill) {
      const stored = spendAll(b, "cantor");
      performHeroHit(b, { kind: "magic", power: 0.7, flat: stored * 1.2, label: skill.name, element: "holy", skill, sure: true });
      applyEffect(b, b.hero, { id: "shield", duration: 2, value: Math.round(stored * 0.5) }, b.hero);
      emit(b, "effect", { target: "hero", id: "shield" });
    }
  },
  culmination: {
    can: (b) => (b.hero.summonedUnits || []).some((unit) => unit.role === "voice") ? { ok: true } : { ok: false, reason: "Хор молчит." },
    bot: (b) => MECHANICS.choirmaster.value(b) >= 3,
    run(b, skill) {
      const voices = b.hero.summonedUnits.filter((unit) => unit.role === "voice");
      const total = voices.reduce((sum, unit) => sum + unit.power, 0);
      voices.forEach((voice) => removeSummon(b, voice));
      performHeroHit(b, { kind: "magic", power: 0.8, flat: total * 2.5, label: skill.name, element: "holy", skill, sure: true });
      healUnit(b, b.hero, total * 2, skill.name);
    }
  },
  judgement: {
    can: (b) => (b.mech.light?.value > 0 ? { ok: true } : { ok: false, reason: "Сияния ещё нет." }),
    bot: (b) => b.mech.light?.value > b.hero.maxHp * 0.2,
    run(b, skill) { performHeroHit(b, { kind: "magic", power: 0.8, flat: spendAll(b, "light") * 1.1, label: skill.name, element: "holy", skill, sure: true }); }
  },
  bone_burst: {
    can: (b) => ((b.hero.summonedUnits || []).some((unit) => unit.type === "undead") ? { ok: true } : { ok: false, reason: "Армии нет." }),
    bot: (b) => (b.hero.summonedUnits || []).filter((unit) => unit.type === "undead").length >= 3,
    run(b, skill) {
      const army = b.hero.summonedUnits.filter((unit) => unit.type === "undead");
      const power = army.reduce((sum, unit) => sum + unit.hp * 0.5 + unit.power * 2, 0);
      const bones = spendAll(b, "undead");
      army.forEach((unit) => { b.hero.summonedUnits = b.hero.summonedUnits.filter((entry) => entry !== unit); });
      emit(b, "summonGone", { sacrifice: true });
      performHeroHit(b, { kind: "magic", power: 0.5, flat: power * (1 + bones * 0.15), label: skill.name, element: "dark", skill, sure: true });
    }
  },
  freeze: {
    can: (b) => (unitHasEffect(b.enemy, "frostbite") ? { ok: true } : { ok: false, reason: "Цель должна быть обморожена." }),
    bot: () => true,
    run(b, skill) {
      performSkillDamage(b, skill);
      if (b.enemy.currentHp <= 0) return;
      if (!b.enemy.isBoss || roll(0.5)) {
        applyEffect(b, b.enemy, { id: "freeze", duration: 1 }, b.hero);
        emit(b, "effect", { target: "enemy", id: "freeze" });
        logEvent(b, `${b.enemy.name} заморожен.`, "Холод");
      }
    }
  },
  break_armor: {
    bot: (b) => (b.mech.breaker?.value || 0) >= 3,
    run(b, skill) { performSkillDamage(b, skill, 1 + spendAll(b, "breaker") * 0.35); }
  },
  blade_flurry: {
    run(b, skill) {
      const tempo = spendAll(b, "duelist");
      performSkillDamage(b, skill, 1, { hits: Number(skill.hits || 3) + tempo });
    }
  },
  finisher: {
    bot: (b) => (b.mech.shade?.value || 0) >= 3,
    run(b, skill) {
      if (b.mech.blade && b.enemy.currentHp / b.enemy.maxHp <= getExecuteThreshold(b)) {
        spendAll(b, "shade");
        b.lastExecute = true;
        const { hpDamage } = dealDamage(b, b.enemy, b.enemy.currentHp, { raw: true });
        emit(b, "hit", { target: "enemy", amount: hpDamage, crit: true, kind: "physical", element: "blood", label: "Казнь" });
        logEvent(b, "Казнь!", "Клинок");
        return;
      }
      performSkillDamage(b, skill, 1 + spendAll(b, "shade") * 0.25);
    }
  },
  lance_wound: {
    can: (b) => (unitHasEffect(b.enemy, "poison") ? { ok: true } : { ok: false, reason: "Цель не отравлена." }),
    bot: (b) => { const poison = getEffect(b.enemy, "poison"); return poison && poison.value * poison.duration > b.hero.physicalDamage; },
    run(b, skill) {
      const poison = getEffect(b.enemy, "poison");
      const { hpDamage } = dealDamage(b, b.enemy, poison.value * poison.duration * (1 + tm(b.hero, "lanceBonus")));
      emit(b, "hit", { target: "enemy", amount: hpDamage, crit: false, kind: "physical", element: "poison", label: skill.name });
      logEvent(b, `${skill.name}: ${hpDamage} урона разом.`, b.hero.name);
    }
  }
};
