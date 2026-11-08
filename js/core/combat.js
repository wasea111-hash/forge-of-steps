// Turn engine. Pure logic: every visible change is pushed to battle.events with a state snapshot, and the UI replays them.
function makeEnemy(defId, level, options = {}) {
  const def = ENEMY_DEFINITIONS[defId];
  const safeLevel = Math.max(1, Number(level || def.level || 1));
  const isBoss = Boolean(options.boss || def.guardian);
  const stats = createStatBlock({
    intellect: def.stats.intellect + safeLevel * ENEMY_GROWTH.intellect,
    endurance: def.stats.endurance + safeLevel * ENEMY_GROWTH.endurance,
    strength: def.stats.strength + safeLevel * ENEMY_GROWTH.strength,
    luck: def.stats.luck + Math.round(safeLevel * ENEMY_GROWTH.luck),
    agility: def.stats.agility + Math.round(safeLevel * ENEMY_GROWTH.agility),
    spirituality: def.stats.spirituality + Math.round(safeLevel * ENEMY_GROWTH.spirituality)
  });
  const affix = options.affix || null;
  const mods = { hp: 1, dmg: 1, speed: 1 };
  [def.mods, affix?.mods, options.scale, isBoss && !def.guardian && !def.named ? { hp: 1.5, dmg: 1.08 } : null, def.guardian ? { hp: 1.35 + safeLevel * 0.008, dmg: 1.25 + safeLevel * 0.005 } : null].forEach((source) => {
    Object.entries(source || {}).forEach(([key, value]) => { mods[key] *= value; });
  });
  const derived = deriveStats(stats, safeLevel, isBoss);
  const enemy = {
    side: "enemy", defId, baseName: def.name,
    name: `${affix ? `${affix.name} ` : ""}${isBoss && !def.guardian && !def.named ? "Вожак: " : ""}${def.name}`,
    art: def.art, tint: def.tint, scale: (def.scale || 1) * (isBoss && !def.guardian && !def.named ? 1.15 : affix ? 1.06 : 1),
    level: safeLevel, isBoss, isElite: Boolean(affix), isGuardian: Boolean(def.guardian), isFinal: Boolean(def.final), traits: [...(def.traits || []), ...(affix?.traits || []), ...(options.traits || [])], share: def.noReward ? 0 : Number(options.share ?? 1), hitCap: def.hitCap || (def.guardian ? HIT_CAP_GUARDIAN : isBoss ? HIT_CAP_BOSS : 0),
    lore: def.lore, stats, totalStats: stats,
    ...derived,
    effects: [], cooldowns: {}, defShred: 0, phaseDone: false, phase: def.phase || (isBoss && !def.named ? { at: 0.5, text: "Вожак приходит в ярость!", apply: { id: "rage", duration: 5, value: 0.2 } } : null),
    moves: [...def.moves, ...(affix?.extraMoves || []), ...(isBoss && !def.guardian && !def.named ? ["enrage"] : [])]
  };
  enemy.maxHp = Math.round(derived.maxHp * mods.hp * Math.min(ENEMY_HP_FACTOR, 1 + (safeLevel - 1) * 0.05) * (1 + safeLevel * ENEMY_LEVEL_HP));
  enemy.physicalDamage = Math.round(derived.physicalDamage * mods.dmg * ENEMY_DMG_FACTOR * (1 + safeLevel * ENEMY_LEVEL_DMG));
  enemy.skillDamage = Math.round(derived.skillDamage * mods.dmg * ENEMY_DMG_FACTOR * (1 + safeLevel * ENEMY_LEVEL_DMG));
  enemy.attackSpeed = Math.round(derived.attackSpeed * mods.speed);
  enemy.currentHp = enemy.maxHp;
  enemy.currentMana = enemy.maxMana;
  return enemy;
}

// One enemy or a whole group. battle.enemy is always the current target, or the foe taking its turn.
function createBattle(hero, enemyOrGroup, options = {}) {
  clearBattleState(hero);
  hero.side = "hero";
  const foes = Array.isArray(enemyOrGroup) ? enemyOrGroup : [enemyOrGroup];
  foes.forEach((foe, slot) => { foe.slot = slot; foe.intent = null; foe.ct = 0; foe.deadShown = false; });
  const battle = {
    hero, foes, enemy: foes[0], events: [], over: null, awaiting: false, turn: 0, guard: false, guardUsed: false, ult: 0,
    firstHitDone: false, wardUsed: false, repeat: null,
    damageBonus: Number(options.damageBonus || 0),
    stats: { dealt: 0, taken: 0, crits: 0, maxHit: 0, turns: 0 }
  };
  Object.defineProperty(battle, "intent", { get() { return this.enemy?.intent || null; }, set(value) { if (this.enemy) this.enemy.intent = value; } });
  battle.ct = { hero: 0, get enemy() { return battle.enemy.ct; }, set enemy(value) { battle.enemy.ct = value; } };
  const resource = getClassResource(hero);
  if (resource.start !== undefined) hero.currentMana = resource.start;
  initMechanics(battle);
  battle.ct.hero = (100 / getSpeed(hero)) * Number(battle.tempoStart || 1);
  foes.forEach((foe, slot) => { foe.ct = (100 / getSpeed(foe)) * (1 + slot * 0.18); });
  emit(battle, "start", {});
  logEvent(battle, foes.length > 1 ? `На тропу выходят: ${foes.map((foe) => foe.name).join(", ")}.` : `На тропу выходит ${foes[0].name}, ${foes[0].level} уровень.`, "Старт");
  foes.forEach((foe) => { battle.enemy = foe; pickEnemyIntent(battle); });
  battle.enemy = foes[0];
  advanceBattle(battle);
  return battle;
}

function livingFoes(battle) {
  return battle.foes.filter((foe) => foe.currentHp > 0);
}

// Choosing a target is free and can be done any time on your turn.
function setBattleTarget(battle, slot) {
  const foe = battle.foes[slot];
  if (!foe || foe.currentHp <= 0) return false;
  battle.enemy = foe;
  return true;
}

function describeIntentFor(battle, foe) {
  const target = battle.enemy;
  battle.enemy = foe;
  const intent = describeIntent(battle);
  battle.enemy = target;
  return intent;
}

function snapshotUnit(unit) {
  return {
    hp: unit.currentHp, maxHp: unit.maxHp, mp: unit.currentMana, maxMp: unit.maxMana,
    effects: (unit.effects || []).map((effect) => ({ id: effect.id, duration: effect.duration, value: effect.value, stacks: effect.id === "burn" ? getEffectStacks(effect) : 0 })),
    summons: (unit.summonedUnits || []).map((summon) => ({ id: summon.id, type: summon.type, role: summon.role, name: summon.name, hp: summon.hp, maxHp: summon.maxHp, duration: summon.duration, persistent: Boolean(summon.persistent) }))
  };
}

function snapshotBattle(battle) {
  return {
    hero: { ...snapshotUnit(battle.hero), gauges: getMechGauges(battle) }, enemy: snapshotUnit(battle.enemy), target: battle.focus ?? battle.enemy.slot,
    foes: battle.foes.map((foe) => ({ ...snapshotUnit(foe), slot: foe.slot, down: foe.currentHp <= 0 }))
  };
}

function emit(battle, type, data = {}) {
  battle.events.push({ type, ...data, foe: battle.enemy?.slot ?? 0, snap: snapshotBattle(battle) });
}

function logEvent(battle, text, tag = "") {
  battle.events.push({ type: "log", text, tag });
}

function sideOf(battle, unit) {
  return unit === battle.hero ? "hero" : "enemy";
}

function labelOf(battle, unit) {
  return unit === battle.hero ? battle.hero.name : battle.enemy.name;
}

function getEffect(unit, id) {
  return (unit.effects || []).find((effect) => effect.id === id && effect.duration > 0) || null;
}

function effectValue(unit, id) {
  return Number(getEffect(unit, id)?.value || 0);
}

function getSpeed(unit) {
  // A soft curve: agility still matters, but nobody acts three times per enemy action just for investing in it.
  let speed = SPEED_CURVE_BASE + Number(unit.attackSpeed || 10) * SPEED_CURVE_SLOPE;
  const frost = effectValue(unit, "frost");
  if (frost) speed *= 1 - (frost >= 1 ? 0.2 : frost);
  const slow = effectValue(unit, "slow");
  if (slow) speed *= 1 - clamp(slow, 0, 0.6);
  speed *= (1 + effectValue(unit, "haste")) * Number(unit.speedMult || 1) * (1 + tm(unit, "speed"));
  if (unit.speedPenalty) speed -= unit.speedPenalty;
  return Math.max(5, speed);
}

function getDefense(unit, kind, pierce = 0) {
  const base = kind === "magic" ? unit.magicDefense - Number(unit.magicShred || 0) : unit.physicalDefense;
  return Math.max(0, (base - Number(unit.defShred || 0)) * (1 - effectValue(unit, "armor_break")) * (1 - clamp(pierce, 0, 1)));
}

function getDealtMultiplier(attacker, defender, battle) {
  const passive = getPassiveDamageContext(attacker, defender);
  let mult = 1 + Number(passive.damageMultiplier || 0) + effectValue(attacker, "rage") - effectValue(attacker, "weaken") - effectValue(attacker, "stagger");
  if (attacker === battle.hero) mult += battle.damageBonus;
  return { mult: Math.max(0.1, mult), passive };
}

function getTakenMultiplier(unit) {
  const incoming = unit.side === "hero" ? Number(getIncomingDamagePassiveContext(unit).damageTakenMultiplier || 0) + tm(unit, "taken") : 0;
  return Math.max(0.1, 1 + incoming + effectValue(unit, "mark") - effectValue(unit, "fortify"));
}

// Damage before randomness and crit, used by both real hits and the enemy intent preview.
function estimateDamage(attacker, defender, kind, power, flat, battle, pierce = 0) {
  const attack = kind === "magic" ? attacker.skillDamage : attacker.physicalDamage;
  const { mult, passive } = getDealtMultiplier(attacker, defender, battle);
  const k = DEFENSE_K_BASE + attacker.level * DEFENSE_K_PER_LEVEL;
  const reduced = (attack * power + flat) * mult * (k / (k + getDefense(defender, kind, pierce)));
  return { amount: reduced * getTakenMultiplier(defender), passive };
}

function rollHit(attacker, defender, kind, power, flat, critBonus, battle, opts = {}) {
  const dodge = Math.min(DODGE_CAP, Number(defender.dodgeChance || 0) + effectValue(defender, "evasion") + effectValue(attacker, "blind"));
  if (!opts.sure && rand() * 100 < dodge) return { amount: 0, dodged: true, crit: false };
  const { amount, passive } = estimateDamage(attacker, defender, kind, power, flat, battle, opts.pierce || 0);
  const critChance = Math.min(95, Number(attacker.critChance || 0) + critBonus + Number(passive.critChanceBonus || 0) + effectValue(defender, "frostbite") + effectValue(defender, "exposed"));
  const crit = Boolean(opts.forceCrit) || rand() * 100 < critChance;
  const critMult = crit ? (Number(passive.critMultiplierOverride || 0) || CRIT_MULTIPLIER) + tm(attacker, "critMult") : 1;
  const variance = 0.92 + rand() * 0.16;
  return { amount: Math.max(1, Math.round(amount * critMult * variance)), dodged: false, crit };
}

// Applies damage through shields and returns what actually reached HP.
function dealDamage(battle, target, amount, options = {}) {
  let remaining = Math.max(0, Math.round(amount));
  // A boss can not be erased by a single blow: damage above the cap mostly bounces off.
  if (target.hitCap && !options.raw) {
    const cap = target.maxHp * target.hitCap;
    if (remaining > cap) remaining = Math.round(cap + (remaining - cap) * 0.3);
  }
  let absorbed = 0;
  (options.ignoreShield ? [] : target.effects || []).filter((effect) => effect.id === "shield").forEach((shield) => {
    const blocked = Math.min(remaining, Number(shield.value || 0));
    shield.value -= blocked;
    remaining -= blocked;
    absorbed += blocked;
    if (shield.value <= 0) shield.duration = 0;
  });
  target.effects = (target.effects || []).filter((effect) => effect.id !== "shield" || effect.duration > 0);
  target.currentHp = clamp(target.currentHp - remaining, 0, target.maxHp);
  if (target === battle.hero && battle.lastStand > 0) target.currentHp = Math.max(1, target.currentHp);
  if (target !== battle.hero) {
    if (target.charge && remaining > 0) {
      target.charge.taken += remaining;
      if (target.charge.taken >= target.charge.need && target.currentHp > 0) breakCharge(battle);
    }
    battle.stats.dealt += remaining;
    battle.stats.maxHit = Math.max(battle.stats.maxHit, remaining);
  } else {
    battle.stats.taken += remaining;
    maybeTriggerLastWard(battle);
  }
  return { hpDamage: remaining, absorbed };
}

// Enough damage during a wind-up knocks the enemy out of it.
function breakCharge(battle) {
  const enemy = battle.enemy;
  const name = enemy.charge?.name || "";
  enemy.charge = null;
  battle.intent = null;
  emit(battle, "interrupt", { name });
  logEvent(battle, `«${name}» сорван!`, "Заряд");
  applyEffect(battle, enemy, { id: "stun", duration: 1 }, battle.hero);
  emit(battle, "effect", { target: "enemy", id: "stun" });
  fireMech(battle, "interrupted");
}

// How much a repeated skill is weakened right now: the enemy has learned the pattern.
function getHabitPenalty(battle, skillId = null) {
  const repeat = battle.repeat;
  if (!repeat || repeat.count < 2 || tm(battle.hero, "adaptImmune")) return 0;
  if (skillId && repeat.id !== skillId) return 0;
  if ((battle.hero.activeSkillSlots || []).filter(Boolean).length < 3) return 0;
  return Math.max(0, Math.min(0.45, (repeat.count - 1) * 0.15 * (battle.enemy.scholar ? 2 : 1)) - tm(battle.hero, "habitEase"));
}

function maybeTriggerLastWard(battle) {
  const hero = battle.hero;
  if (battle.wardUsed || !hero.traits?.includes("lastward") || hero.currentHp <= 0 || hero.currentHp / hero.maxHp >= 0.25) return;
  battle.wardUsed = true;
  const value = Math.round(hero.maxHp * LEGENDARY_TRAITS.lastward.value);
  applyEffect(battle, hero, { id: "shield", duration: 3, value }, hero);
  logEvent(battle, `Последний оберег даёт щит на ${value}.`, "Легенда");
  emit(battle, "effect", { target: "hero", id: "shield" });
}

function healUnit(battle, unit, amount, label = "") {
  const isHero = unit === battle.hero;
  let raw = Math.round(isHero ? fireMech(battle, "beforeHeal", { amount }).amount * (1 + tm(unit, "heal")) : amount);
  if (unitHasEffect(unit, "wound")) raw = Math.round(raw * 0.5);
  if (unitHasEffect(unit, "poison")) raw = Math.round(raw * 0.7);
  const before = unit.currentHp;
  unit.currentHp = clamp(unit.currentHp + raw, 0, unit.maxHp);
  const healed = unit.currentHp - before;
  if (healed > 0) emit(battle, "heal", { target: sideOf(battle, unit), amount: healed, label });
  if (isHero) fireMech(battle, "heal", { amount: healed, overflow: raw - healed });
  return healed;
}

function normalizeEffectSpec(spec) {
  const def = STATUS_EFFECT_DEFINITIONS[spec.id] || {};
  return { id: spec.id, type: def.type || "custom", name: def.name || spec.id, duration: Math.max(1, Math.round(Number(spec.duration || 1))), value: Number(spec.value || 0), source: spec.source || null, meta: { ...(spec.meta || {}) } };
}

function applyEffect(battle, target, spec, sourceUnit) {
  const effect = normalizeEffectSpec(spec);
  const ctx = getEffectApplicationPassiveContext(sourceUnit, effect.id);
  effect.duration = Math.max(1, effect.duration + Number(ctx.durationBonus || 0) + tm(sourceUnit, `dur:${effect.id}`));
  effect.value *= 1 + tm(sourceUnit, `val:${effect.id}`);
  if (effect.id === "shield" && target.classKey) {
    effect.value = Math.round(effect.value * (1 + tm(target, "shield")) * (battle.firstShieldBoost ? 1.5 : 1));
    battle.firstShieldBoost = false;
  }
  // What this body cannot suffer does not apply at all: a golem has no blood.
  if (target !== battle.hero && sourceUnit === battle.hero) {
    const resist = getEnemyResist(target, effect.id);
    if (resist === 0) {
      logEvent(battle, `${target.name}: «${effect.name}» не действует.`, "Повадка");
      effect.resisted = true;
      effect.duration = 0;
      return effect;
    }
    effect.value *= resist;
  }
  // Water carries current and freezes fast, but it douses flames.
  if (unitHasEffect(target, "soaked")) {
    if (effect.id === "shock" || effect.id === "frost") { effect.value *= 1.5; effect.duration += 1; }
    if (effect.id === "burn") { effect.value *= 0.5; target.effects = target.effects.filter((entry) => entry.id !== "soaked"); }
  }
  if (["poison", "bleed", "burn", "corruption"].includes(effect.id)) effect.value = Math.max(1, Math.round(effect.value));
  effect.meta.sourceSide = sourceUnit ? sideOf(battle, sourceUnit) : null;
  effect.meta.elapsedTicks = 0;
  effect.meta.fresh = target === sourceUnit;
  if (effect.id === "frost" && effect.value >= 1) effect.value = 0.2;
  target.effects = target.effects || [];
  const existing = target.effects.find((entry) => entry.id === effect.id);

  if (effect.id === "burn") {
    const added = Math.max(1, Number(effect.meta.stacks || BURN_DEFAULT_STACKS) + Number(ctx.stackBonusOnApply || 0));
    const maxStacks = Math.max(BURN_DETONATION_THRESHOLD, Number(effect.meta.maxStacks || BURN_DETONATION_THRESHOLD));
    const detonation = Number(effect.meta.detonationMultiplier || 0) + Number(ctx.detonationMultiplier || 0);
    if (existing) {
      const mergedMax = Math.max(Number(existing.meta.maxStacks || BURN_DETONATION_THRESHOLD), maxStacks);
      existing.value = Math.max(existing.value, effect.value);
      existing.duration = Math.max(existing.duration, effect.duration);
      existing.meta.stacks = Math.min(mergedMax, getEffectStacks(existing) + added);
      existing.meta.maxStacks = mergedMax;
      existing.meta.detonationMultiplier = Math.max(Number(existing.meta.detonationMultiplier || 0), detonation);
      return existing;
    }
    effect.meta.stacks = Math.min(maxStacks, added);
    effect.meta.maxStacks = maxStacks;
    effect.meta.detonationMultiplier = detonation;
    target.effects.push(effect);
    return effect;
  }

  if (existing) {
    existing.duration = Math.max(existing.duration, effect.duration);
    if (effect.id === "bleed") existing.value = tm(sourceUnit, "stack:bleed") ? existing.value + effect.value : Math.min(existing.value + effect.value, effect.value * 3);
    else if (effect.id === "poison" && (hasMechanic(sourceUnit, "venom") || tm(sourceUnit, "stack:poison"))) existing.value = Math.min(existing.value + effect.value, effect.value * 4);
    else existing.value = Math.max(existing.value, effect.value);
    existing.meta = { ...existing.meta, ...effect.meta };
    return existing;
  }
  target.effects.push(effect);
  return effect;
}

function getEnemyResist(enemy, effectId) {
  return (enemy.traits || []).reduce((value, id) => {
    const resist = ENEMY_TRAITS[id]?.resist?.[effectId];
    return resist === undefined ? value : value * resist;
  }, 1);
}

function applyStun(battle, target, sourceUnit, chance, duration = 1) {
  const repeat = target.stunnedLast && !tm(sourceUnit, "noStunRepeat") ? STUN_REPEAT_CHANCE_MULTIPLIER : 1;
  const boss = target.isBoss && !tm(sourceUnit, "stunBoss") ? 0.6 : 1;
  let finalChance = chance * (1 + tm(sourceUnit, "stunChance")) * repeat * boss * Number(target.stunResist || 1);
  if (target !== battle.hero && target.intent?.heavy) finalChance = Math.min(1, finalChance + 0.15);
  if (!roll(finalChance)) return false;
  applyEffect(battle, target, { id: "stun", duration }, sourceUnit);
  emit(battle, "effect", { target: sideOf(battle, target), id: "stun" });
  logEvent(battle, `${labelOf(battle, target)}: оглушение!`, "Контроль");
  if (target !== battle.hero) fireMech(battle, "stunned");
  if (target !== battle.hero && battle.intent?.heavy) {
    emit(battle, "interrupt", { name: battle.intent.name });
    logEvent(battle, `«${battle.intent.name}» сорван!`, "Контроль");
    target.cooldowns[battle.intent.id] = Number(battle.intent.cd || 2);
    battle.intent = null;
    target.charge = null;
    fireMech(battle, "interrupted");
  }
  return true;
}

function applySkillEffects(battle, skill, caster, target) {
  (skill.appliedEffects || []).forEach((config) => {
    const receiver = config.target === "self" ? caster : target;
    if (receiver.currentHp <= 0) return;
    const chance = getSkillEffectChance(skill, config, caster);
    if (config.id === "stun") {
      applyStun(battle, receiver, caster, chance, Number(config.duration || 1));
      return;
    }
    if (chance < 1 && !roll(chance)) return;
    const applied = applyEffect(battle, receiver, {
      id: config.id,
      duration: getSkillEffectDuration(skill, config, caster),
      value: resolveSkillEffectValue(caster, config, skill),
      source: skill.id,
      meta: {
        ...(config.meta || {}),
        ...(config.id === "burn" ? {
          stacks: getSkillEffectStacks(skill, config, caster),
          maxStacks: getSkillEffectBurnCap(skill, caster),
          detonationMultiplier: getSkillMasterySnapshot(skill, caster).burnDetonationMultiplier
        } : {})
      }
    }, caster);
    if (applied.resisted) { emit(battle, "mech", { text: `${applied.name}: не действует` }); return; }
    emit(battle, "effect", { target: sideOf(battle, receiver), id: applied.id });
    if (receiver === battle.enemy && !battle.procDepth) {
      battle.procDepth = 1;
      fireMech(battle, "applied", { id: applied.id, value: applied.value });
      battle.procDepth = 0;
    }
    logEvent(battle, `${labelOf(battle, receiver)}: ${applied.name.toLowerCase()}${applied.id === "burn" ? ` (стаки: ${getEffectStacks(applied)})` : ""}, ${turnsLabel(applied.duration)}.`, "Эффект");
  });
}

// Effects tick on their owner's turn.
function tickDamageEffect(battle, target, effect, amount, label) {
  const isEnemy = target !== battle.hero;
  const scaled = isEnemy ? fireMech(battle, "beforeTick", { id: effect.id, amount: amount * (1 + tm(battle.hero, `tick:${effect.id}`)) }).amount : amount;
  const { hpDamage, absorbed } = dealDamage(battle, target, scaled, { ignoreShield: effect.id === "poison" });
  emit(battle, "tick", { target: sideOf(battle, target), id: effect.id, amount: hpDamage, absorbed, label });
  logEvent(battle, `${labelOf(battle, target)} получает ${hpDamage} урона: ${label}.`, "Эффект");
  if (isEnemy) fireMech(battle, "tick", { id: effect.id, amount: hpDamage });
}

function shredFromPassive(battle, target, ctx) {
  const shred = Number(ctx.defenseShredPerTick || 0);
  if (shred > 0) target.defShred = Number(target.defShred || 0) + shred;
}

function processEffectsEndOfTurn(battle, unit) {
  let thawed = false;
  (unit.effects || []).forEach((effect) => {
    if (effect.duration <= 0 || unit.currentHp <= 0) return;
    if (effect.meta?.fresh) {
      effect.meta.fresh = false;
      return;
    }
    const source = effect.meta?.sourceSide === "hero" ? battle.hero : effect.meta?.sourceSide === "enemy" ? battle.enemy : null;
    const ctx = getEffectTickPassiveContext(source, effect.id);
    if (effect.id === "bleed") {
      // A wound opens when the body moves. A stunned target does not bleed and the wound waits.
      if (unit.stunnedLast && !tm(source, "bleedWhileStunned")) return;
      const opened = unit === battle.enemy && battle.lastEnemyHeavy ? 2 : 1;
      tickDamageEffect(battle, unit, effect, effect.value * opened, opened > 1 ? "рана вскрылась" : "кровотечение");
      shredFromPassive(battle, unit, ctx);
      if (!tm(source, "noBleedDecay")) effect.value = Math.max(1, Math.round(effect.value * BLEED_DECAY));
    } else if (effect.id === "poison") {
      // Poison gets worse with time and nothing stops it.
      const ramp = 1 + Math.min(POISON_RAMP_MAX, Number(effect.meta.elapsedTicks || 0)) * POISON_RAMP;
      tickDamageEffect(battle, unit, effect, effect.value * ramp, "яд");
      shredFromPassive(battle, unit, ctx);
      effect.meta.elapsedTicks = Number(effect.meta.elapsedTicks || 0) + 1;
    } else if (effect.id === "corruption") {
      tickDamageEffect(battle, unit, effect, effect.value, effect.name.toLowerCase());
      shredFromPassive(battle, unit, ctx);
      if (effect.id === "corruption") unit.magicShred = Number(unit.magicShred || 0) + 3;
    } else if (effect.id === "burn") {
      const stacks = getEffectStacks(effect);
      const ramp = Number(ctx.tickRampPerElapsedTurn || 0);
      const value = Math.max(1, Math.round(effect.value * (1 + 0.25 * (stacks - 1)) * (1 + Number(effect.meta.elapsedTicks || 0) * ramp)));
      tickDamageEffect(battle, unit, effect, value, "горение");
      shredFromPassive(battle, unit, ctx);
      effect.meta.elapsedTicks = Number(effect.meta.elapsedTicks || 0) + 1;
      if ((hasMechanic(source, "fire") || tm(source, "burnDetonate")) && !tm(source, "noDetonate") && stacks >= Number(effect.meta.maxStacks || BURN_DETONATION_THRESHOLD) && unit.currentHp > 0) {
        const cap = unit.maxHp * (unit.isBoss ? BURN_DETONATION_BOSS_CAP_RATIO : BURN_DETONATION_CAP_RATIO);
        const base = Math.min(unit.currentHp * BURN_DETONATION_CURRENT_HP_RATIO, cap) + effect.value * stacks;
        const damage = Math.max(1, Math.round(base * (1 + Number(ctx.detonationMultiplier || 0) + Number(effect.meta.detonationMultiplier || 0))));
        const result = dealDamage(battle, unit, damage);
        emit(battle, "detonate", { target: sideOf(battle, unit), amount: result.hpDamage });
        logEvent(battle, `Детонация пламени: ${result.hpDamage} урона!`, "Огонь");
        effect.duration = 0;
        fireMech(battle, "detonated");
        return;
      }
    } else if (effect.id === "regeneration") {
      healUnit(battle, unit, effect.value, "регенерация");
      if (unit === battle.hero) fireMech(battle, "regenTick");
    }
    const permanent = source && tm(source, `perma:${effect.id}`);
    if (effect.id !== "stun" && effect.id !== "freeze" && !permanent) effect.duration -= 1;
    if (effect.duration <= 0 && !effect.meta?.gone) {
      effect.meta.gone = true;
      if (unit.currentHp > 0) fireMech(battle, "expired", { id: effect.id, unit, value: effect.value, ticks: Number(effect.meta?.elapsedTicks || 0) });
    }
    if (effect.duration <= 0 && effect.id === "frostbite") thawed = true;
    if (effect.duration <= 0 && effect.id === "frost") {
      const speed = Number(ctx.speedDebuffOnExpire || 0);
      if (speed > 0) unit.speedPenalty = Number(unit.speedPenalty || 0) + speed;
      if (ctx.dodgePenaltyOnExpire) unit.dodgeChance = Math.max(0, unit.dodgeChance - Number(ctx.dodgePenaltyOnExpire));
    }
  });
  unit.effects = (unit.effects || []).filter((effect) => effect.duration > 0);
  if (thawed && unit.currentHp > 0) applyEffect(battle, unit, { id: "frost", duration: 2, value: 0.25 }, null);
}

function tickCooldowns(unit) {
  Object.keys(unit.cooldowns || {}).forEach((key) => {
    unit.cooldowns[key] = Math.max(0, unit.cooldowns[key] - 1);
    if (!unit.cooldowns[key]) delete unit.cooldowns[key];
  });
}

function getManaRegen(hero) {
  const fixed = CLASS_RESOURCES[hero.classKey]?.regen;
  if (fixed !== undefined) return fixed;
  const trait = (hero.traits || []).filter((id) => id === "battery").length * LEGENDARY_TRAITS.battery.value;
  return Math.round(hero.maxMana * (0.025 + trait + tm(hero, "manaRegen")) + Number(hero.totalStats?.spirituality || 0) * 0.3);
}

function checkBattleOver(battle) {
  if (battle.over) return true;
  // Falling foes are processed one by one: a kill can trigger effects that kill the next.
  for (let i = 0; i < 12; i += 1) {
    const fallen = battle.foes.find((foe) => foe.currentHp <= 0 && !foe.dead);
    if (!fallen) break;
    fallen.dead = true;
    const target = battle.enemy;
    battle.enemy = fallen;
    fallen.charge = null;
    emit(battle, "death", { target: "enemy" });
    logEvent(battle, `${fallen.name} повержен!`, "Итог");
    battle.ult = Math.min(100, battle.ult + ULT_ON_KILL);
    fireMech(battle, "foeDown", { foe: fallen });
    battle.enemy = target;
  }
  if (!livingFoes(battle).length) {
    battle.over = "hero";
    battle.awaiting = false;
    battle.enemy = battle.foes[0];
    fireMech(battle, "victory");
    emit(battle, "end", { winner: "hero" });
    return true;
  }
  if (battle.enemy.currentHp <= 0) {
    battle.enemy = livingFoes(battle)[0];
    emit(battle, "retarget", {});
  }
  if (battle.hero.currentHp <= 0) {
    battle.over = "enemy";
    battle.awaiting = false;
    emit(battle, "death", { target: "hero" });
    logEvent(battle, `${battle.hero.name} падает на тропе.`, "Итог");
    emit(battle, "end", { winner: "enemy" });
    return true;
  }
  return false;
}

// Runs enemy turns until the hero has to choose an action or the battle ends.
function advanceBattle(battle) {
  while (!checkBattleOver(battle)) {
    const nextFoe = livingFoes(battle).sort((a, b) => a.ct - b.ct)[0];
    if (battle.ct.hero <= nextFoe.ct) {
      battle.turn += 1;
      if (battle.guardUsed) { battle.guard = false; battle.guardUsed = false; }
      if (battle.lastStand > 0) battle.lastStand -= 1;
      battle.stats.turns += 1;
      const hero = battle.hero;
      tickCooldowns(hero);
      const regen = getManaRegen(hero);
      hero.currentMana = clamp(hero.currentMana + regen, 0, hero.maxMana);
      emit(battle, "turn", { who: "hero" });
      const stun = getEffect(hero, "stun") || getEffect(hero, "freeze");
      if (stun) {
        stun.duration -= 1;
        hero.stunnedLast = true;
        logEvent(battle, `${hero.name} оглушён и пропускает ход.`, "Контроль");
        emit(battle, "stunned", { target: "hero" });
        hero.effects = hero.effects.filter((effect) => effect.duration > 0);
        endHeroTurn(battle, 1);
        continue;
      }
      hero.stunnedLast = false;
      fireMech(battle, "turnStart");
      if (checkBattleOver(battle)) return;
      battle.awaiting = true;
      return;
    }
    enemyTurn(battle, nextFoe);
  }
}

function endHeroTurn(battle, tempo) {
  const hero = battle.hero;
  processEffectsEndOfTurn(battle, hero);
  if (hero.currentHp > 0 && battle.enemy.currentHp > 0) processSummons(battle);
  battle.ct.hero += (100 / getSpeed(hero)) * tempo;
  battle.awaiting = false;
}

function removeSummon(battle, summon) {
  const hero = battle.hero;
  hero.summonedUnits = (hero.summonedUnits || []).filter((unit) => unit !== summon);
  emit(battle, "summonGone", {});
  fireMech(battle, "summonDeath", { summon });
}

function processSummons(battle) {
  const hero = battle.hero;
  const units = hero.summonedUnits || [];
  const undeadCount = units.filter((unit) => unit.type === "undead").length;
  const voices = units.filter((unit) => unit.role === "voice").length;
  [...units].forEach((summon) => {
    if (battle.enemy.currentHp <= 0) {
      const next = livingFoes(battle)[0];
      if (!next) return;
      battle.enemy = next;
    }
    let power = summon.power;
    if (summon.type === "undead" && hasMechanic(hero, "undead")) power *= 1 + (undeadCount - 1) * 0.1;
    if (summon.role === "voice" && voices >= 3 + tm(hero, "chordAt")) power *= 1.5;
    power = Math.max(1, Math.round(power));
    if (summon.role === "healer") {
      const healed = healUnit(battle, hero, power, summon.name);
      if (healed) logEvent(battle, `${summon.name} лечит на ${healed}.`, "Призыв");
    } else if (summon.role === "guardian") {
      applyEffect(battle, hero, { id: "shield", duration: 2, value: power + effectValue(hero, "shield") }, null);
      emit(battle, "effect", { target: "hero", id: "shield" });
      logEvent(battle, `${summon.name} даёт щит.`, "Призыв");
    } else if (summon.role === "energy") {
      hero.currentMana = Math.min(hero.maxMana, hero.currentMana + power);
      emit(battle, "mana", { target: "hero", amount: power });
    } else if (summon.role === "voice") {
      healUnit(battle, hero, power, summon.name);
      const { hpDamage } = dealDamage(battle, battle.enemy, power * 0.6);
      emit(battle, "summonHit", { amount: hpDamage, name: summon.name });
    } else if (summon.role !== "minion") {
      const { hpDamage } = dealDamage(battle, battle.enemy, power);
      if (summon.type === "undead") battle.enemy.defShred = Number(battle.enemy.defShred || 0) + 2;
      emit(battle, "summonHit", { amount: hpDamage, name: summon.name });
      logEvent(battle, `${summon.name} наносит ${hpDamage} урона.`, "Призыв");
    }
    if (summon.taunt > 0 && summon.persistent) summon.taunt -= 1;
    if (!summon.persistent) {
      summon.duration -= 1;
      if (summon.duration <= 0) removeSummon(battle, summon);
    }
  });
}

function afterHeroHitsEnemy(battle, result) {
  const hero = battle.hero;
  if (result.crit) battle.stats.crits += 1;
  if (hero.traits?.includes("lifesteal") && result.hpDamage > 0) healUnit(battle, hero, result.hpDamage * LEGENDARY_TRAITS.lifesteal.value, "жажда");
  if (result.crit && hero.traits?.includes("ember") && battle.enemy.currentHp > 0) {
    applyEffect(battle, battle.enemy, { id: "burn", duration: 2, value: Math.max(4, Math.round(Math.max(hero.skillDamage, hero.physicalDamage) * LEGENDARY_TRAITS.ember.value)), meta: { stacks: 1 } }, hero);
    emit(battle, "effect", { target: "enemy", id: "burn" });
  }
}

function performHeroHit(battle, { kind, power, flat = 0, critBonus = 0, label, element, skillId, skill = null, pierce = 0, forceCrit = false, noEcho = false, sure = false, proc = false }) {
  const hero = battle.hero;
  const enemy = battle.enemy;
  const ctx = { kind, power, flat, critBonus, pierce: pierce + Number(skill?.pierce || 0) + tm(hero, "pierce"), forceCrit, mult: 1, skill, label, sure, proc, noEcho };
  ctx.mult *= 1 + tm(hero, "dmg") + tm(hero, kind === "magic" ? "dmgMagic" : "dmgPhys");
  (enemy.effects || []).forEach((effect) => {
    ctx.mult *= 1 + tm(hero, `dmgVs:${effect.id}`);
    ctx.critBonus += tm(hero, `critVs:${effect.id}`);
  });
  if (skill) ctx.mult *= 1 - getHabitPenalty(battle, skill.id);
  const shock = !proc ? getEffect(enemy, "shock") : null;
  if (shock) {
    ctx.mult *= 1 + shock.value;
    enemy.effects = enemy.effects.filter((effect) => effect !== shock);
    ctx.shockUsed = true;
  }
  if (!battle.firstHitDone) {
    battle.firstHitDone = true;
    if (hero.traits?.includes("firstblood")) ctx.mult *= 1 + LEGENDARY_TRAITS.firstblood.value;
  }
  fireMech(battle, "beforeHit", ctx);
  const hit = rollHit(hero, enemy, kind, ctx.power * ctx.mult, ctx.flat * ctx.mult, ctx.critBonus, battle, { pierce: ctx.pierce, forceCrit: ctx.forceCrit, sure: ctx.sure });
  if (hit.dodged) {
    emit(battle, "miss", { target: "enemy", label, element });
    logEvent(battle, `${enemy.name} уклоняется: ${label}.`, "Промах");
    return { dodged: true };
  }
  const { hpDamage, absorbed } = dealDamage(battle, enemy, hit.amount);
  emit(battle, "hit", { target: "enemy", amount: hpDamage, absorbed, crit: hit.crit, kind, element, skillId: skill?.id || skillId, label });
  logEvent(battle, `${label}: ${hpDamage} урона${hit.crit ? ", критический удар" : ""}.`, hero.name);
  afterHeroHitsEnemy(battle, { hpDamage, crit: hit.crit });
  // A critical hit tears a wound open at once.
  const wound = hit.crit && !proc ? getEffect(enemy, "bleed") : null;
  if (wound && enemy.currentHp > 0) tickDamageEffect(battle, enemy, wound, wound.value, "рана вскрылась");
  fireMech(battle, "afterHit", { hpDamage, crit: hit.crit, kind, skill, noEcho, proc, shockUsed: Boolean(ctx.shockUsed) });
  if (ctx.shockUsed) fireMech(battle, "shockUsed");
  return { hpDamage, crit: hit.crit };
}

function makeSummon(skill, hero) {
  const config = skill.summonUnitConfig;
  const ctx = getSummonedUnitPassiveContext(hero, config.type);
  const hp = Math.round((resolveSkillEffectValue(hero, { id: "shield", valueFormula: config.hpFormula }, skill) + Number(ctx.unitHpBonus || 0)) * (1 + tm(hero, "summonHp")));
  const base = resolveSkillEffectValue(hero, { id: config.type === "spirit" ? "regeneration" : "burn", valueFormula: config.actionPowerFormula }, skill);
  return {
    id: uid("summon"), type: config.type, role: config.role || (config.type === "spirit" ? "healer" : "attacker"), name: config.name, hp, maxHp: hp, taunt: Number(config.taunt || 0),
    power: Math.max(1, Math.round(base * (1 + Number(ctx.unitActionPowerMultiplier || 0) + tm(hero, "summonPower")))),
    duration: getSkillEffectDuration(skill, { id: "summon", duration: Number(config.duration || 3) }, hero) + Number(ctx.unitDurationBonus || 0) + (config.type === "minion" ? Number(getDarkMinionPassiveContext(hero).minionDurationBonus || 0) : 0) + tm(hero, "summonDur")
  };
}

function addSummon(battle, summon) {
  const hero = battle.hero;
  const units = [...(hero.summonedUnits || [])];
  while (units.length >= getSummonLimit(hero)) {
    const oldest = units.findIndex((unit) => !unit.persistent);
    if (oldest < 0) return false;
    units.splice(oldest, 1);
  }
  units.push(summon);
  hero.summonedUnits = units;
  return true;
}

function executeSacrifice(battle, skill) {
  const hero = battle.hero;
  const units = hero.summonedUnits || [];
  const victim = units.find((unit) => unit.role === "minion") || units.find((unit) => !unit.persistent);
  const ctx = getDarkSacrificePassiveContext(hero);
  const mastery = getSkillMasterySnapshot(skill, hero);
  const mode = mastery.darkSacrificeMode || "damage";
  const power = (victim.maxHp + victim.hp * 0.6 + hero.skillDamage * 0.45) * (1 + Number(ctx.sacrificeMultiplier || 0));
  hero.summonedUnits = units.filter((unit) => unit !== victim);
  emit(battle, "summonGone", { sacrifice: true });
  if (mode === "heal") {
    const healed = healUnit(battle, hero, (power + hero.healingPower * 0.7) * 0.8 * mastery.healMultiplier, skill.name);
    logEvent(battle, `Жертва возвращает ${healed} здоровья.`, "Тьма");
  } else if (mode === "buff") {
    applyEffect(battle, hero, { id: "dark_fury", duration: 2 + mastery.effectDurationBonus, value: clamp((0.2 + Number(ctx.sacrificeMultiplier || 0)) * mastery.effectValueMultiplier, 0.14, 0.45), source: skill.id }, hero);
    emit(battle, "effect", { target: "hero", id: "dark_fury" });
    logEvent(battle, "Жертва наполняет мага тёмным экстазом.", "Тьма");
  } else {
    performHeroHit(battle, { kind: "magic", power: 0, flat: power * 1.1 * mastery.damageMultiplier, critBonus: mastery.critBonus, label: skill.name, element: "dark", skill });
  }
}

function performSkillDamage(battle, skill, powerScale = 1, opts = {}) {
  // A sweeping skill: full power on the target, part of it on everyone else.
  if (skill.aoe && !opts.sweep && battle.foes.length > 1) {
    const target = battle.enemy;
    battle.focus = target.slot;
    performSkillDamage(battle, skill, powerScale, { ...opts, sweep: true });
    battle.foes.filter((foe) => foe !== target && foe.currentHp > 0).forEach((foe) => {
      battle.enemy = foe;
      performSkillDamage(battle, skill, powerScale * skill.aoe, { ...opts, sweep: true, splash: true });
    });
    battle.enemy = target;
    battle.focus = null;
    return;
  }
  const hero = battle.hero;
  const enemy = battle.enemy;
  const mastery = getSkillMasterySnapshot(skill, hero);
  const kind = skill.attackType === "skill" ? "magic" : "physical";
  let power = getSkillPower(skill, hero) * powerScale;
  if (skill.vsEffect && unitHasEffect(enemy, skill.vsEffect.id)) power *= skill.vsEffect.multiplier;
  if (skill.execute && enemy.currentHp / enemy.maxHp <= skill.execute.threshold) power *= skill.execute.multiplier;
  const flat = getSkillExtraDamage(hero, skill) * mastery.damageMultiplier * powerScale;
  let hits = Math.max(1, Number(opts.hits || skill.hits || 1));
  if (hits > 1 && hasMechanic(hero, "stormshot") && unitHasEffect(hero, "haste")) hits += 1;
  let landed = false;
  for (let i = 0; i < hits && enemy.currentHp > 0; i += 1) {
    const result = performHeroHit(battle, { kind, power, flat, critBonus: Number(skill.critBonus || 0) + mastery.critBonus, label: skill.name, element: skill.element || (kind === "magic" ? "arcane" : "steel"), skill, pierce: opts.pierce || 0, forceCrit: opts.forceCrit || false });
    if (!result.dodged) {
      landed = true;
      if (skill.effectsPerHit && enemy.currentHp > 0) applySkillEffects(battle, skill, hero, enemy);
    }
  }
  if (skill.selfHealMultiplier && !opts.splash) {
    const healed = healUnit(battle, hero, getSkillSelfHealAmount(skill, hero) * powerScale, skill.name);
    if (healed) logEvent(battle, `${skill.name} лечит на ${healed}.`, hero.name);
  }
  if (landed && enemy.currentHp > 0 && !skill.effectsPerHit) applySkillEffects(battle, skill, hero, enemy);
  else if (!landed) applySkillEffects(battle, { ...skill, appliedEffects: (skill.appliedEffects || []).filter((config) => config.target === "self") }, hero, enemy);
}

function getHeroResourceType(skill, hero) {
  const type = getSkillResourceType(skill);
  return type === "mana" && tm(hero, "bloodMagic") ? "hp" : type;
}

function canUseUltimate(battle) {
  return battle.hero.level >= ULTIMATE_LEVEL && battle.ult >= 100;
}

function getCoreWait(battle) {
  const wait = MECHANICS[CORE_BY_CLASS[battle.hero.classKey]]?.wait;
  if (!wait) return null;
  return !wait.can || wait.can(battle, coreState(battle)) ? wait : null;
}

function getWaitLabel(battle) {
  const wait = MECHANICS[CORE_BY_CLASS[battle.hero.classKey]]?.wait;
  return getCoreWait(battle)?.name || wait?.fallback || "Выждать";
}

function canUseSkill(battle, slotIndex) {
  const hero = battle.hero;
  const skill = getActiveSkillFromSlot(hero, slotIndex);
  if (!skill) return { ok: false, reason: "Слот пуст. Назначь навык в окне навыков." };
  if (getEffect(hero, "silence")) return { ok: false, skill, reason: "Немота: навыки недоступны." };
  const cd = Number(hero.cooldowns?.[skill.id] || 0);
  if (cd > 0) return { ok: false, skill, reason: `Откат: ещё ${turnsLabel(cd)}.` };
  const cost = getSkillResourceCost(skill, hero);
  const resource = getHeroResourceType(skill, hero);
  if (resource === "hp" && hero.currentHp <= cost) return { ok: false, skill, reason: "Не хватает здоровья." };
  if (resource === "mana" && hero.currentMana < cost && !battle.freeSkill) return { ok: false, skill, reason: "Не хватает маны." };
  if (skill.specialAction === "dark_sacrifice" && !(hero.summonedUnits || []).some((unit) => !unit.persistent)) return { ok: false, skill, reason: "Нужен слуга для жертвы." };
  const custom = SKILL_ACTIONS[skill.special]?.can?.(battle);
  if (custom && !custom.ok) return { ...custom, skill };
  return { ok: true, skill };
}

const WEAPON_ATTACK_LABELS = { sword: "Удар мечом", axe: "Удар топором", hammer: "Удар молотом", staff: "Удар посохом", bow: "Выстрел", lute: "Удар лютней", lyre: "Удар лирой", dagger: "Удар кинжалом" };
const CLASS_ATTACK_LABELS = { warrior: "Удар мечом", mage: "Удар посохом", archer: "Выстрел", bard: "Удар лютней", assassin: "Удар кинжалом" };

// A plain attack is named after what is really in the hand.
function getBasicAttackLabel(hero) {
  return WEAPON_ATTACK_LABELS[hero.equipment?.["weapon-1"]?.weapon] || CLASS_ATTACK_LABELS[hero.classKey] || "Удар";
}

function heroAction(battle, action) {
  if (!battle.awaiting || battle.over) return { ok: false, reason: "Сейчас не твой ход." };
  if (action.target !== undefined) setBattleTarget(battle, action.target);
  const hero = battle.hero;
  const enemy = battle.enemy;
  let tempo = 1;
  let usedSkill = null;

  if (action.type === "attack") {
    const usesMagic = hero.skillDamage * 0.6 > hero.physicalDamage;
    emit(battle, "action", { who: "hero", anim: "attack", name: "Удар", element: "steel" });
    if (usesMagic) performHeroHit(battle, { kind: "magic", power: 0.6, label: getBasicAttackLabel(hero), element: "arcane" });
    else performHeroHit(battle, { kind: "physical", power: BASIC_ATTACK_POWER_MULTIPLIER, label: getBasicAttackLabel(hero), element: "steel" });
    battle.repeat = null;
  } else if (action.type === "guard") {
    battle.guard = true;
    tempo = GUARD_TEMPO;
    emit(battle, "action", { who: "hero", anim: "guard", name: "Стойка", element: "holy" });
    logEvent(battle, `${hero.name} принимает стойку: следующий удар ослаблен вдвое.`, "Тактика");
  } else if (action.type === "ult") {
    if (!canUseUltimate(battle)) return { ok: false, reason: "Ультимейт ещё не заряжен." };
    const ult = getHeroUltimate(hero);
    battle.ult = 0;
    emit(battle, "action", { who: "hero", anim: "cast", name: ult.name, element: ult.element, heavy: true });
    ult.run(battle, getUltState(battle));
    logEvent(battle, `${hero.name}: ${ult.name}!`, "Ультимейт");
  } else if (action.type === "wait" && getCoreWait(battle)) {
    const wait = getCoreWait(battle);
    tempo = wait.tempo;
    emit(battle, "action", { who: "hero", anim: "wait", name: wait.name, element: "arcane" });
    logEvent(battle, wait.run(battle, coreState(battle)), "Тактика");
  } else if (action.type === "wait") {
    tempo = WAIT_TEMPO;
    const before = hero.currentMana;
    hero.currentMana = clamp(hero.currentMana + hero.maxMana * WAIT_MANA_RATIO, 0, hero.maxMana);
    hero.currentMana = Math.round(hero.currentMana);
    emit(battle, "action", { who: "hero", anim: "wait", name: getWaitLabel(battle), element: "arcane" });
    emit(battle, "mana", { target: "hero", amount: hero.currentMana - before });
    logEvent(battle, `${hero.name} собирается с силами: +${hero.currentMana - before} маны, ход наступит раньше.`, "Тактика");
  } else if (action.type === "potion") {
    const potion = POTIONS[action.kind];
    if (!potion || Number(hero.potions?.[action.kind] || 0) <= 0) return { ok: false, reason: "Зелья закончились." };
    if (action.kind === "hp" && hero.currentHp >= hero.maxHp) return { ok: false, reason: "Здоровье уже полное." };
    if (action.kind === "mp" && hero.currentMana >= hero.maxMana) return { ok: false, reason: "Мана уже полная." };
    hero.potions[action.kind] -= 1;
    tempo = potion.tempo;
    emit(battle, "action", { who: "hero", anim: "cast", name: potion.name, element: action.kind === "hp" ? "holy" : "water" });
    if (action.kind === "hp") {
      healUnit(battle, hero, hero.maxHp * potion.ratio * (1 + tm(hero, "hpPotion")), potion.name);
    } else {
      const before = hero.currentMana;
      hero.currentMana = Math.round(clamp(hero.currentMana + hero.maxMana * potion.ratio, 0, hero.maxMana));
      emit(battle, "mana", { target: "hero", amount: hero.currentMana - before });
    }
    logEvent(battle, `${hero.name} использует: ${potion.name.toLowerCase()}.`, "Зелье");
  } else if (action.type === "skill") {
    const check = canUseSkill(battle, action.slotIndex);
    if (!check.ok) return check;
    const skill = check.skill;
    usedSkill = skill;
    const cost = getSkillResourceCost(skill, hero);
    if (battle.freeSkill) battle.freeSkill = false;
    else if (getHeroResourceType(skill, hero) === "hp") hero.currentHp = Math.max(1, hero.currentHp - cost);
    else hero.currentMana = Math.max(0, hero.currentMana - cost);
    battle.repeat = battle.repeat?.id === skill.id ? { id: skill.id, count: battle.repeat.count + 1 } : { id: skill.id, count: 1 };
    const mutation = getSkillMutation(hero, skill.id);
    if (mutation?.id === "blood") hero.currentHp = Math.max(1, hero.currentHp - Math.round(hero.maxHp * 0.06));
    tempo = Number(skill.tempo || 1);
    emit(battle, "action", { who: "hero", anim: skill.attackType === "physical" ? "attack" : "cast", name: skill.name, element: skill.element || (skill.attackType === "physical" ? "steel" : "arcane"), skillId: skill.id, ranged: skill.attackType === "skill" || skill.classId === "archer" });
    const cooldown = getSkillCooldown(skill, hero);
    if (cooldown > 0) hero.cooldowns[skill.id] = cooldown + 1;

    if (skill.specialAction === "light_shield") {
      const shield = applyEffect(battle, hero, { id: "shield", duration: getSkillEffectDuration(skill, { id: "shield", duration: skill.shieldEffect?.duration || 2 }, hero), value: resolveSkillEffectValue(hero, { id: "shield", valueFormula: skill.shieldEffect?.valueFormula }, skill), source: skill.id }, hero);
      emit(battle, "effect", { target: "hero", id: "shield", amount: shield.value });
      logEvent(battle, `${skill.name}: щит на ${shield.value}.`, hero.name);
    } else if (skill.special) {
      SKILL_ACTIONS[skill.special].run(battle, skill);
    } else if (skill.summonUnitConfig) {
      const summon = makeSummon(skill, hero);
      addSummon(battle, summon);
      emit(battle, "summon", { kind: summon.type });
      logEvent(battle, `Призван: ${summon.name}, ${turnsLabel(summon.duration)}.`, "Призыв");
    } else if (skill.specialAction === "dark_sacrifice") {
      executeSacrifice(battle, skill);
    } else if (!skill.attackType) {
      if (skill.selfHealMultiplier) {
        const healed = healUnit(battle, hero, getSkillSelfHealAmount(skill, hero), skill.name);
        logEvent(battle, `${skill.name} лечит на ${healed}.`, hero.name);
      }
      if (skill.aoe) eachFoe(battle, (foe) => applySkillEffects(battle, skill, hero, foe));
      else applySkillEffects(battle, skill, hero, enemy);
    } else {
      performSkillDamage(battle, skill);
      if (mutation?.id === "chain" && enemy.currentHp > 0 && roll(0.3)) {
        logEvent(battle, "Цепная реакция повторяет навык!", "Мутация");
        performSkillDamage(battle, skill, 0.5);
      }
    }

    const progress = grantSkillExperience(hero, skill.id);
    if (progress) {
      emit(battle, "skillLevel", { skillId: skill.id, level: progress.leveledUpTo, max: progress.reachedMaxLevel });
      logEvent(battle, `Мастерство навыка «${skill.name}» теперь ${progress.leveledUpTo}.`, "Навыки");
    }
  } else {
    return { ok: false, reason: "Неизвестное действие." };
  }

  if (hero.level >= ULTIMATE_LEVEL) battle.ult = Math.min(100, battle.ult + ULT_PER_ACTION);
  tempo = fireMech(battle, "afterAction", { type: action.type, skill: usedSkill, tempo }).tempo;
  if (!checkBattleOver(battle)) {
    checkEnemyStages(battle);
    endHeroTurn(battle, tempo);
    advanceBattle(battle);
  }
  return { ok: true };
}

function pickEnemyIntent(battle) {
  const enemy = battle.enemy;
  const allies = battle.foes.filter((foe) => foe !== enemy && foe.currentHp > 0);
  if (enemy.charge) {
    battle.intent = { id: "release", name: enemy.charge.name, kind: "release", power: enemy.charge.left > 0 ? 0 : enemy.charge.power, heavy: true, pierceGuard: enemy.charge.pierceGuard, stage: enemy.charge.left > 0 ? enemy.charge.windStage : enemy.charge.stage };
    emit(battle, "intent", { intent: describeIntent(battle) });
    return;
  }
  const available = (enemy.moves || [])
    .filter((id) => {
      const move = ENEMY_MOVES[id];
      if (!move || Number(enemy.cooldowns[id] || 0) > 0) return false;
      if (move.when === "hurt" && enemy.currentHp / enemy.maxHp > 0.6) return false;
      if (move.kind === "ally_heal" && !allies.some((foe) => foe.currentHp / foe.maxHp < 0.8)) return false;
      if (move.kind === "ally_shield" && !allies.some((foe) => !unitHasEffect(foe, "shield"))) return false;
      if (move.kind === "ally_rage" && !allies.some((foe) => !unitHasEffect(foe, "rage"))) return false;
      if (move.kind === "shield" && unitHasEffect(enemy, "shield")) return false;
      if (move.kind === "buff" && unitHasEffect(enemy, move.apply.id)) return false;
      if (move.kind === "debuff" && unitHasEffect(battle.hero, move.apply.id)) return false;
      return true;
    });
  // A master does not repeat itself while it has something else to do.
  const fresh = enemy.lairMaster ? available.filter((id) => id !== enemy.lastMove) : available;
  const pool = fresh.length ? fresh : available.length ? available : ["strike"];
  const id = randomFrom(pool);
  enemy.lastMove = id;
  battle.intent = { id, ...ENEMY_MOVES[id] };
  emit(battle, "intent", { intent: describeIntent(battle) });
}

function describeIntent(battle) {
  const intent = battle.intent;
  if (!intent) return null;
  const result = { id: intent.id, name: intent.name, kind: intent.kind, heavy: Boolean(intent.heavy), hits: Number(intent.hits || 1), damage: 0, note: "" };
  const charge = battle.enemy.charge;
  if (charge) {
    result.charge = { left: charge.left, need: Math.max(0, charge.need - charge.taken), total: charge.need };
    result.note = charge.left > 0 ? "Копит силу" : "Удар сейчас!";
  }
  const shownPower = charge ? charge.power : intent.power;
  if (shownPower) {
    const kind = intent.kind === "magic" || intent.charge === "magic" || charge?.kind === "magic" ? "magic" : "physical";
    const raw = estimateDamage(battle.enemy, battle.hero, kind, shownPower, 0, battle).amount;
    result.damage = Math.max(1, Math.round(raw * (battle.guard ? 1 - GUARD_REDUCTION : 1)));
  }
  if (intent.apply) {
    const def = STATUS_EFFECT_DEFINITIONS[intent.apply.id];
    result.note = def?.name || "";
    result.applyId = intent.apply.id;
  }
  if (intent.kind === "ally_heal") result.note = "Лечит союзника";
  if (intent.kind === "ally_shield") result.note = "Щит союзнику";
  if (intent.kind === "ally_rage") result.note = "Злит союзника";
  if (intent.kind === "idle") result.note = "Не действует";
  if (intent.kind === "windup") result.note = "Начинает заряд";
  if (intent.kind === "heal") result.note = "Лечится";
  if (intent.kind === "shield") result.note = "Щит";
  return result;
}

// The acting foe becomes battle.enemy for its turn, so counter-hits land on the right body. The player's target is restored after.
function enemyTurn(battle, actor = battle.enemy) {
  const target = battle.enemy;
  battle.focus = target.slot;
  battle.enemy = actor;
  actorTurn(battle);
  const alive = livingFoes(battle);
  battle.enemy = target.currentHp > 0 ? target : alive[0] || target;
  battle.focus = null;
}

function actorTurn(battle) {
  const enemy = battle.enemy;
  const hero = battle.hero;
  tickCooldowns(enemy);
  emit(battle, "turn", { who: "enemy" });
  fireMech(battle, "enemyTurn");
  if (enemy.currentHp <= 0) return;
  const stun = getEffect(enemy, "stun") || getEffect(enemy, "freeze");
  if (stun) {
    stun.duration -= 1;
    enemy.stunnedLast = true;
    enemy.effects = enemy.effects.filter((effect) => effect.duration > 0);
    logEvent(battle, `${enemy.name} оглушён и пропускает ход.`, "Контроль");
    emit(battle, "stunned", { target: "enemy" });
  } else {
    enemy.stunnedLast = false;
    if (!battle.intent) pickEnemyIntent(battle);
    // A counter-hit during this move can break a charge and clear the intent, so keep the move locally.
    const move = battle.intent;
    battle.lastEnemyHeavy = Boolean(move.heavy && move.power);
    performEnemyMove(battle, move);
    if (move.cd) enemy.cooldowns[move.id] = Number(move.cd) + 1;
    battle.intent = null;
  }
  if (hero.currentHp > 0 && enemy.currentHp > 0) {
    processEffectsEndOfTurn(battle, enemy);
    battle.lastEnemyHeavy = false;
    checkEnemyPhase(battle);
  }
  battle.ct.enemy += 100 / getSpeed(enemy);
  if (hero.currentHp > 0 && enemy.currentHp > 0 && !battle.intent) pickEnemyIntent(battle);
}

// A master changes before your eyes: new moves, new pace, sometimes fresh armour.
function checkEnemyStages(battle) {
  const enemy = battle.enemy;
  (enemy.stages || []).forEach((stage) => {
    if (stage.done || enemy.currentHp <= 0 || enemy.currentHp / enemy.maxHp > stage.at) return;
    stage.done = true;
    emit(battle, "phase", { text: stage.text });
    logEvent(battle, stage.text, "Босс");
    if (stage.add) enemy.moves = [...enemy.moves, ...stage.add];
    if (stage.remove) enemy.moves = enemy.moves.filter((id) => !stage.remove.includes(id));
    if (stage.speed) enemy.attackSpeed = Math.round(enemy.attackSpeed * stage.speed);
    if (stage.clear) enemy.effects = (enemy.effects || []).filter((effect) => STATUS_EFFECT_DEFINITIONS[effect.id]?.type !== "debuff" && !["bleed", "poison", "burn", "wound", "frost", "slow", "mark", "armor_break", "stagger", "weaken", "blind"].includes(effect.id));
    if (stage.shield) applyEffect(battle, enemy, { id: "shield", duration: 4, value: Math.round(enemy.maxHp * stage.shield) }, enemy);
    if (stage.heal) healUnit(battle, enemy, enemy.maxHp * stage.heal, "");
    if (stage.apply) applyEffect(battle, enemy, stage.apply, enemy);
    emit(battle, "effect", { target: "enemy", id: stage.apply?.id || (stage.shield ? "shield" : "rage") });
  });
}

function checkEnemyPhase(battle) {
  checkEnemyStages(battle);
  const enemy = battle.enemy;
  if (!enemy.phase || enemy.phaseDone || enemy.currentHp <= 0 || enemy.currentHp / enemy.maxHp > enemy.phase.at) return;
  enemy.phaseDone = true;
  emit(battle, "phase", { text: enemy.phase.text });
  logEvent(battle, enemy.phase.text, "Босс");
  if (enemy.phase.apply) applyEffect(battle, enemy, enemy.phase.apply, enemy);
  if (enemy.phase.heal) healUnit(battle, enemy, enemy.maxHp * enemy.phase.heal, "");
  emit(battle, "effect", { target: "enemy", id: enemy.phase.apply?.id || "rage" });
}

// Enemies can strike a summoned creature instead of the hero. Taunting creatures draw more attacks.
function pickSummonTarget(battle) {
  const units = battle.hero.summonedUnits || [];
  if (!units.length) return null;
  const taunting = units.filter((unit) => Number(unit.taunt || 0) > 0);
  const chance = Math.min(0.75, units.length * 0.2 + taunting.length * 0.25);
  if (!roll(chance)) return null;
  return randomFrom(taunting.length ? taunting : units);
}

function performEnemyMove(battle, move) {
  const enemy = battle.enemy;
  const hero = battle.hero;
  if (move.kind === "idle") return;
  emit(battle, "action", { who: "enemy", anim: ["magic", "debuff", "heal", "shield", "buff", "ally_heal", "ally_shield", "ally_rage", "windup"].includes(move.kind) ? "cast" : "attack", name: move.name, element: move.element || (move.kind === "magic" ? "arcane" : "steel"), ranged: move.kind === "magic", heavy: Boolean(move.heavy), stage: (move.kind === "windup" ? move.windStage : move.stage) || null });

  if (move.kind === "ally_heal" || move.kind === "ally_shield" || move.kind === "ally_rage") {
    const allies = battle.foes.filter((foe) => foe !== enemy && foe.currentHp > 0);
    const ally = move.kind === "ally_heal" ? [...allies].sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp)[0] : allies.find((foe) => !unitHasEffect(foe, move.kind === "ally_shield" ? "shield" : "rage")) || allies[0];
    if (!ally) return;
    battle.enemy = ally;
    if (move.kind === "ally_heal") healUnit(battle, ally, ally.maxHp * move.ratio, move.name);
    else if (move.kind === "ally_shield") { applyEffect(battle, ally, { id: "shield", duration: 3, value: Math.round(ally.maxHp * move.ratio) }, enemy); emit(battle, "effect", { target: "enemy", id: "shield" }); }
    else { applyEffect(battle, ally, { id: "rage", duration: 3, value: move.value }, enemy); emit(battle, "effect", { target: "enemy", id: "rage" }); }
    logEvent(battle, `${enemy.name}: ${move.name.toLowerCase()} (${ally.name}).`, "Враг");
    battle.enemy = enemy;
    return;
  }
  if (move.kind === "windup") {
    enemy.charge = { name: move.name, power: move.power, kind: move.charge === "magic" ? "magic" : "physical", element: move.element, left: Number(move.hold || 1), need: Math.round(enemy.maxHp * (enemy.isBoss ? (enemy.lairMaster ? 0.07 : 0.12) : 0.18) * Number(enemy.chargeHard || 1)), taken: 0, stage: move.stage || null, windStage: move.windStage || null, pierceGuard: Boolean(move.pierceGuard) };
    logEvent(battle, `${enemy.name} начинает: ${move.name}. Нанеси ${enemy.charge.need} урона или оглуши, чтобы сорвать.`, "Заряд");
    return;
  }
  if (move.kind === "release") {
    const charge = enemy.charge;
    if (!charge) return;
    if (charge.left > 0) {
      charge.left -= 1;
      logEvent(battle, `${enemy.name} копит силу: ${charge.name}.`, "Заряд");
      return;
    }
    enemy.charge = null;
    move = { ...move, name: charge.name, kind: charge.kind, power: charge.power, element: charge.element };
  }
  if (move.kind === "heal") {
    const healed = healUnit(battle, enemy, enemy.maxHp * move.ratio, move.name);
    logEvent(battle, `${enemy.name} залечивает раны на ${healed}.`, "Враг");
    return;
  }
  if (move.kind === "shield") {
    const value = Math.round(enemy.maxHp * move.ratio);
    applyEffect(battle, enemy, { id: "shield", duration: 3, value }, enemy);
    emit(battle, "effect", { target: "enemy", id: "shield", amount: value });
    logEvent(battle, `${enemy.name} покрывается панцирем: щит на ${value}.`, "Враг");
    return;
  }
  if (move.kind === "buff" || move.kind === "debuff") {
    const target = move.kind === "buff" ? enemy : hero;
    if (move.apply.id === "stun") applyStun(battle, target, enemy, move.apply.chance ?? 1);
    else {
      applyEffect(battle, target, { id: move.apply.id, duration: move.apply.duration, value: move.apply.value || 0 }, enemy);
      emit(battle, "effect", { target: sideOf(battle, target), id: move.apply.id });
    }
    logEvent(battle, `${enemy.name}: ${move.name.toLowerCase()}.`, "Враг");
    return;
  }

  const kind = move.kind === "magic" ? "magic" : "physical";
  if (fireMech(battle, "enemyAttack", { kind, move, cancel: false }).cancel) return;
  const hits = Math.max(1, Number(move.hits || 1));
  let landed = false;
  for (let i = 0; i < hits && hero.currentHp > 0; i += 1) {
    const hit = rollHit(enemy, hero, kind, move.power, 0, 0, battle);
    if (hit.dodged) {
      emit(battle, "miss", { target: "hero", label: move.name });
      logEvent(battle, `${hero.name} уклоняется: ${move.name}.`, "Уклонение");
      fireMech(battle, "dodged");
      continue;
    }
    landed = true;
    const incoming = fireMech(battle, "incoming", { amount: hit.amount, kind, heavy: Boolean(move.heavy), parried: false });
    if (incoming.parried) { landed = false; fireMech(battle, "parried"); continue; }
    if (battle.enemy.currentHp <= 0) return;
    let amount = Math.round(incoming.amount);
    const guarded = battle.guard && !move.pierceGuard;
    if (battle.guard && move.pierceGuard) emit(battle, "mech", { text: "Стойка не спасает!" });
    if (guarded) battle.guardUsed = true;
    const preGuard = amount;
    if (guarded) amount = Math.round(amount * (1 - Math.min(0.9, GUARD_REDUCTION + tm(hero, "guardBonus"))));
    const shieldTarget = pickSummonTarget(battle);
    if (shieldTarget) {
      shieldTarget.hp -= amount;
      emit(battle, "summonHurt", { amount, name: shieldTarget.name });
      logEvent(battle, `${shieldTarget.name} принимает удар: ${amount}.`, "Призыв");
      if (shieldTarget.hp <= 0) {
        logEvent(battle, `${shieldTarget.name} гибнет.`, "Призыв");
        removeSummon(battle, shieldTarget);
      }
      continue;
    }
    const { hpDamage, absorbed } = dealDamage(battle, hero, amount);
    if (hero.level >= ULTIMATE_LEVEL && hpDamage > 0) battle.ult = Math.min(100, battle.ult + ULT_ON_HURT);
    fireMech(battle, "hurt", { hpDamage, absorbed, blocked: preGuard - amount, kind });
    emit(battle, "hit", { target: "hero", amount: hpDamage, absorbed, crit: hit.crit, kind, element: move.element || (kind === "magic" ? "arcane" : "steel"), label: move.name, guarded, heavy: Boolean(move.heavy) });
    logEvent(battle, `${move.name}: ${hpDamage} урона${guarded ? " (стойка)" : ""}${hit.crit ? ", критический удар" : ""}.`, enemy.name);
    if (move.lifesteal && hpDamage > 0) healUnit(battle, enemy, hpDamage * move.lifesteal, "");
    const thornValue = effectValue(hero, "thorns") + (hero.traits || []).filter((id) => id === "thornmail").length * LEGENDARY_TRAITS.thornmail.value;
    if (thornValue > 0 && kind === "physical" && hit.amount > 0) {
      const back = dealDamage(battle, enemy, hit.amount * thornValue);
      emit(battle, "tick", { target: "enemy", id: "thorns", amount: back.hpDamage, label: "шипы" });
    }
  }
  if (landed && move.apply && hero.currentHp > 0) {
    if (move.apply.id === "stun") {
      applyStun(battle, hero, enemy, move.apply.chance ?? 1);
    } else if (roll(move.apply.chance ?? 1)) {
      const base = Math.max(enemy.skillDamage, enemy.physicalDamage);
      const value = move.apply.ratio ? Math.max(3, Math.round(base * move.apply.ratio)) : Number(move.apply.value || 0);
      const applied = applyEffect(battle, hero, { id: move.apply.id, duration: move.apply.duration, value, meta: move.apply.id === "burn" ? { stacks: 1 } : {} }, enemy);
      emit(battle, "effect", { target: "hero", id: applied.id });
      logEvent(battle, `${hero.name}: ${applied.name.toLowerCase()}, ${turnsLabel(applied.duration)}.`, "Эффект");
    }
  }
}

// Upcoming turn order for the timeline widget.
function previewTimeline(battle, count = 8) {
  let heroCt = battle.ct.hero;
  const heroStep = 100 / getSpeed(battle.hero);
  const foes = livingFoes(battle).map((foe) => ({ ct: foe.ct, step: 100 / getSpeed(foe) }));
  const order = [];
  for (let i = 0; i < count; i += 1) {
    const next = [...foes].sort((a, b) => a.ct - b.ct)[0];
    if (!next || heroCt <= next.ct) {
      order.push("hero");
      heroCt += heroStep;
    } else {
      order.push("enemy");
      next.ct += next.step;
    }
  }
  return order;
}

function estimateHeroHit(battle, skill) {
  const hero = battle.hero;
  const kind = skill.attackType === "skill" ? "magic" : "physical";
  let power = getSkillPower(skill, hero);
  if (skill.vsEffect && unitHasEffect(battle.enemy, skill.vsEffect.id)) power *= skill.vsEffect.multiplier;
  if (skill.execute && battle.enemy.currentHp / battle.enemy.maxHp <= skill.execute.threshold) power *= skill.execute.multiplier;
  const repeated = battle.repeat?.id === skill.id && (hero.activeSkillSlots || []).filter(Boolean).length >= 3 ? Math.min(0.45, battle.repeat.count * 0.15 * (battle.enemy.scholar ? 2 : 1)) : 0;
  return estimateDamage(hero, battle.enemy, kind, power, getSkillExtraDamage(hero, skill), battle).amount * Number(skill.hits || 1) * (tm(hero, "adaptImmune") ? 1 : 1 - repeated);
}

// Decision bot: drives auto-battle in the UI and all balance simulations.
// The bot hits supports first, then whoever is closest to death.
function botPickTarget(battle) {
  const alive = livingFoes(battle);
  const support = alive.find((foe) => (foe.moves || []).some((id) => String(ENEMY_MOVES[id]?.kind).startsWith("ally")));
  const weakest = [...alive].sort((a, b) => a.currentHp - b.currentHp)[0];
  if (support || weakest) battle.enemy = support || weakest;
}

function chooseBotAction(battle) {
  const hero = battle.hero;
  botPickTarget(battle);
  const enemy = battle.enemy;
  const hpRatio = hero.currentHp / hero.maxHp;
  const manaRatio = hero.currentMana / Math.max(1, hero.maxMana);
  const intent = livingFoes(battle).map((foe) => describeIntentFor(battle, foe)).filter(Boolean).sort((a, b) => b.damage * b.hits - a.damage * a.hits)[0] || null;
  if (canUseUltimate(battle)) return { type: "ult" };
  const coreBot = MECHANICS[CORE_BY_CLASS[hero.classKey]]?.bot?.(battle, coreState(battle));
  if (coreBot && (hpRatio > 0.35 || !hero.potions?.hp)) return coreBot;
  // A skill may say when it is worth using: otherwise the bot would never touch a skill that only pays in the right moment.
  const usable = [0, 1, 2, 3, 4].map((slotIndex) => ({ slotIndex, ...canUseSkill(battle, slotIndex) })).filter((entry) => entry.ok && (!entry.skill.ai || entry.skill.ai(battle)));
  const urgent = usable.find((entry) => entry.skill.ai);
  if (urgent && hpRatio > 0.3) return { type: "skill", slotIndex: urgent.slotIndex };
  const incoming = intent ? intent.damage * intent.hits : 0;
  const lethal = incoming >= hero.currentHp * 0.9;

  if (hpRatio < 0.4 && hero.potions?.hp > 0) return { type: "potion", kind: "hp" };
  if (hero.classKey === "warrior" && hero.currentMana < 12) return { type: "attack" };
  const healing = usable.find((entry) => entry.skill.selfHealMultiplier && !entry.skill.attackType);
  if (hpRatio < 0.6 && healing) return { type: "skill", slotIndex: healing.slotIndex };

  const holding = intent?.charge && intent.charge.left > 0;
  if (!holding && intent?.heavy && intent.damage > hero.currentHp * 0.2) {
    const stunner = usable.find((entry) => (entry.skill.appliedEffects || []).some((config) => config.id === "stun" && Number(config.chance ?? 1) >= 0.4));
    if (stunner && !lethal) return { type: "skill", slotIndex: stunner.slotIndex };
    if (!battle.guard) return { type: "guard" };
  }
  if (lethal && !holding && !battle.guard) return { type: "guard" };

  const shield = usable.find((entry) => entry.skill.specialAction === "light_shield");
  if (shield && !unitHasEffect(hero, "shield") && hpRatio < 0.85) return { type: "skill", slotIndex: shield.slotIndex };
  const special = usable.find((entry) => SKILL_ACTIONS[entry.skill.special]?.bot?.(battle));
  if (special) return { type: "skill", slotIndex: special.slotIndex };
  const hymn = usable.find((entry) => entry.skill.hymn && !battle.mech.hymn?.active);
  if (hymn) return { type: "skill", slotIndex: hymn.slotIndex };
  const summon = usable.find((entry) => entry.skill.summonUnitConfig && (hero.summonedUnits || []).length < getSummonLimit(hero));
  if (summon) return { type: "skill", slotIndex: summon.slotIndex };
  const sacrifice = usable.find((entry) => entry.skill.specialAction === "dark_sacrifice");
  const minion = (hero.summonedUnits || []).find((unit) => unit.role === "minion");
  if (sacrifice && minion && (minion.duration <= 1 || hpRatio < 0.5)) return { type: "skill", slotIndex: sacrifice.slotIndex };
  const buff = usable.find((entry) => !entry.skill.attackType && !entry.skill.specialAction && !entry.skill.special && !entry.skill.summonUnitConfig && !entry.skill.selfHealMultiplier && (entry.skill.appliedEffects || []).some((config) => config.target === "self" && !unitHasEffect(hero, config.id)));
  if (buff && enemy.currentHp / enemy.maxHp > 0.3) return { type: "skill", slotIndex: buff.slotIndex };

  const attackPower = hero.skillDamage * 0.6 > hero.physicalDamage ? hero.skillDamage * 0.6 : hero.physicalDamage * BASIC_ATTACK_POWER_MULTIPLIER;
  const kindForBasic = hero.skillDamage * 0.6 > hero.physicalDamage ? "magic" : "physical";
  const basicEstimate = estimateDamage(hero, enemy, kindForBasic, attackPower / (kindForBasic === "magic" ? hero.skillDamage : hero.physicalDamage), 0, battle).amount;
  let best = null;
  usable.filter((entry) => entry.skill.attackType && !SKILL_ACTIONS[entry.skill.special]?.bot).forEach((entry) => {
    let score = estimateHeroHit(battle, entry.skill);
    (entry.skill.appliedEffects || []).forEach((config) => {
      if (config.target !== "enemy" || unitHasEffect(enemy, config.id)) return;
      score *= 1.25;
    });
    if (getSkillResourceType(entry.skill) === "hp" && hpRatio < 0.5) score *= 0.3;
    if (!best || score > best.score) best = { score, entry };
  });
  if (best && best.score > basicEstimate * 1.05) return { type: "skill", slotIndex: best.entry.slotIndex };
  if (manaRatio < 0.15 && enemy.currentHp / enemy.maxHp > 0.25) {
    if (hero.potions?.mp > 0 && hero.skillDamage > hero.physicalDamage) return { type: "potion", kind: "mp" };
    if (hero.skillDamage * 0.6 > basicEstimate && !lethal) return { type: "wait" };
  }
  return { type: "attack" };
}
