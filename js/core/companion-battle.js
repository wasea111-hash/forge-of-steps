// The companion in battle: its own resource, personal skills, a turn the player decides (or "Сам решает"),
// the deeds that open new skills, orders, formation and joint attacks. Data: js/core/data.companion-skills.js.

// ---------- what a companion knows ----------
function companionSkills(defId) {
  return COMPANION_SKILLS.filter((skill) => skill.who === defId);
}

// Base skills from the first day, and the ones a higher starting rarity has already prepared.
function ensureCompanionSkills(companion) {
  if (!Array.isArray(companion.learned)) companion.learned = [];
  if (!companion.deedKinds || typeof companion.deedKinds !== "object") companion.deedKinds = {};
  if (!["manual", "auto"].includes(companion.control)) companion.control = "manual";
  if (!Number.isInteger(companion.prepared)) {
    const prep = (RARITY_PREP_SKILLS[companion.defId] || []).slice(0, RARITY_PREP_COUNT[RARITY_START_RANK[companion.rarity] || 0] || 0);
    companionSkills(companion.defId).filter((skill) => skill.base).forEach((skill) => { if (!companion.learned.includes(skill.id)) companion.learned.push(skill.id); });
    prep.forEach((id) => { if (!companion.learned.includes(id)) companion.learned.push(id); });
    companion.prepared = prep.length;
  }
  return companion;
}

// Whether a skill is known, ready to be learned at the fire, or still waiting — and what for.
function companionSkillState(companion, skill) {
  ensureCompanionSkills(companion);
  if (companion.learned.includes(skill.id)) return { learned: true, ready: false, text: "Освоено" };
  const need = skill.unlock || {};
  const parts = [];
  let ok = true;
  if (need.trust) { const done = companion.trust >= need.trust; ok = ok && done; parts.push(`Доверие ${need.trust}${done ? " ✓" : ` (${companion.trust})`}`); }
  if (need.deed) {
    const have = Number(companion.deedKinds[need.deed.kind] || 0);
    const done = have >= need.deed.count;
    ok = ok && done;
    parts.push(`${COMPANION_DEEDS[need.deed.kind]}: ${Math.min(have, need.deed.count)}/${need.deed.count}${done ? " ✓" : ""}`);
  }
  if (need.memory !== undefined) {
    const memory = getCompanionDef(companion)?.memories?.[need.memory];
    const done = (companion.memories || []).includes(need.memory);
    ok = ok && done;
    parts.push(`воспоминание «${memory?.title || "?"}»${done ? " ✓" : ""}`);
  }
  if (companion.legal === "contract" && need.memory !== undefined) { ok = false; parts.push("не по договору"); }
  return { learned: false, ready: ok, text: parts.join(" · ") };
}

function learnCompanionSkill(hero, companionId, skillId) {
  const companion = hero.companions.find((c) => c.id === companionId);
  const skill = COMPANION_SKILL_BY_ID[skillId];
  if (!companion || !skill || skill.who !== companion.defId) return { ok: false, reason: "Такого приёма нет." };
  const state = companionSkillState(companion, skill);
  if (state.learned) return { ok: false, reason: "Уже освоено." };
  if (!state.ready) return { ok: false, reason: state.text };
  companion.learned.push(skill.id);
  return { ok: true, skill };
}

function setCompanionControl(hero, companionId, mode) {
  const companion = hero.companions.find((c) => c.id === companionId);
  if (!companion || !["manual", "auto"].includes(mode)) return { ok: false };
  companion.control = mode;
  return { ok: true };
}

// ---------- the companion in a fight ----------
function allyAlive(battle) {
  return Boolean(battle.ally && battle.ally.currentHp > 0);
}

function allyIsFront(battle) {
  return allyAlive(battle) && battle.allyState.front;
}

function allyCompanion(battle) {
  return (battle.hero.companions || []).find((c) => c.id === battle.allyState?.companionId) || null;
}

function allyResource(battle) {
  return COMPANION_RESOURCES[battle.ally?.defId] || null;
}

// Iva's store is counted in health of yours; the others count whole points.
function allyResourceMax(battle) {
  const res = allyResource(battle);
  if (!res) return 0;
  return res.percent ? Math.round(battle.hero.maxHp * res.max / 100) : res.max;
}

function gainAllyResource(battle, amount) {
  const st = battle.allyState;
  if (!st || !allyAlive(battle)) return;
  st.res = clamp(st.res + amount, 0, allyResourceMax(battle));
  if (battle.ally.defId === "rud" && st.res >= 3) st.deedsNow.add("coals3");
  if (battle.ally.defId === "iva" && st.res >= battle.hero.maxHp * 0.08) st.deedsNow.add("store8");
}

function initAllyBattle(battle, ally, companion, front) {
  ensureCompanionSkills(companion);
  battle.ally = ally;
  const res = COMPANION_RESOURCES[ally.defId];
  battle.allyState = {
    companionId: companion.id, control: companion.control, order: "help", front: Boolean(front), fell: false, turns: 0,
    learned: [...companion.learned], cd: {}, res: res && !res.percent ? res.start : 0,
    rootHits: 0, preyId: null, preyBonus: false, thrillGiven: false, coalAction: -1, actionIndex: 0,
    jointUsed: false, cover: 0, pauseBonus: false, habits: [...(companion.habits || [])], lastSkill: null,
    heroGuards: 0, heroWaits: 0, heroKills: 0, heroLastTarget: null, ivaMarkSlot: null,
    deedsNow: new Set(), plan: null, orderSet: false
  };
  ally.ct = (100 / getSpeed(ally)) * 1.05;
  planAlly(battle);
}

// ---------- enemies against the party ----------
function chooseFoeTarget(battle, move) {
  if (!allyAlive(battle)) return "hero";
  if (battle.allyState.cover > 0) return "ally";
  const allyFront = battle.allyState.front;
  if (move.kind === "magic" || move.ranged) return roll(0.6) === allyFront ? "ally" : "hero";
  return allyFront ? "ally" : "hero";
}

function hitKinds(move) {
  return ["physical", "magic", "release"].includes(move.kind);
}

// An enemy blow on the companion: its own dodge, armour, shields and fortify count once, in the damage roll.
function enemyHitsAlly(battle, move) {
  const enemy = battle.enemy;
  const ally = battle.ally;
  const st = battle.allyState;
  const kind = move.kind === "magic" ? "magic" : "physical";
  const hits = Math.max(1, Number(move.hits || 1));
  const covered = st.cover > 0;
  if (covered) st.cover -= 1;
  let landed = false;
  for (let i = 0; i < hits && ally.currentHp > 0; i += 1) {
    const hit = rollHit(enemy, ally, kind, move.power, 0, 0, battle);
    if (hit.dodged) { emit(battle, "miss", { target: "ally", label: move.name }); continue; }
    let amount = hit.amount;
    if (st.front && st.habits.includes("cover")) amount *= 0.85;
    const { hpDamage, absorbed } = dealDamage(battle, ally, amount);
    landed = landed || hpDamage > 0 || absorbed > 0;
    emit(battle, "hit", { target: "ally", amount: hpDamage, absorbed, crit: hit.crit, kind, element: move.element || (kind === "magic" ? "arcane" : "steel"), label: move.name, heavy: Boolean(move.heavy) });
    logEvent(battle, `${move.name} по ${ally.name}: ${hpDamage} урона.`, enemy.name);
    if (move.heavy && (st.front || covered) && hpDamage + absorbed > 0) st.deedsNow.add("interceptHeavy");
  }
  // Tessa's resolve grows from every enemy action that reached her.
  if (landed && ally.defId === "tessa") gainAllyResource(battle, 1);
  if (landed) rootsAnswer(battle);
  if (landed && move.apply && ally.currentHp > 0 && move.apply.id !== "stun" && roll(move.apply.chance ?? 1)) {
    const base = Math.max(enemy.skillDamage, enemy.physicalDamage);
    const value = move.apply.ratio ? Math.max(3, Math.round(base * move.apply.ratio)) : Number(move.apply.value || 0);
    applyEffect(battle, ally, { id: move.apply.id, duration: move.apply.duration, value }, enemy);
    emit(battle, "effect", { target: "ally", id: move.apply.id });
  }
  if (ally.currentHp <= 0) allyFalls(battle);
}

// Rooted Tessa counts the blows; the second one gets an answer.
function rootsAnswer(battle) {
  const st = battle.allyState;
  if (battle.ally.defId !== "tessa" || !getEffect(battle.ally, "fortify")?.meta?.root) return;
  st.rootHits += 1;
  if (st.rootHits < 2 || battle.enemy.currentHp <= 0) return;
  st.rootHits = 0;
  applyEffect(battle, battle.enemy, { id: "weaken", duration: 2, value: 0.2 }, battle.ally);
  emit(battle, "mech", { text: `${battle.ally.name}: корни держат врага` });
  logEvent(battle, `Корни оплетают ${battle.enemy.name}: слабость.`, battle.ally.name);
  st.deedsNow.add("rootsWeaken");
}

function allyFalls(battle) {
  const st = battle.allyState;
  if (st.fell) return;
  st.fell = true;
  battle.ally.currentHp = 0;
  battle.ally.effects = [];
  if (battle.awaitingActor === "ally") battle.awaitingActor = null;
  emit(battle, "death", { target: "ally" });
  logEvent(battle, `${battle.ally.name} падает. Нить Клейма держит — пока.`, "Спутник");
}

// The companion's own blow. battle.enemy points at the struck foe for the events, as on enemy turns.
function allyStrike(battle, foe, power, label, element = "steel", kind = null) {
  const keep = battle.enemy;
  battle.enemy = foe;
  battle.allyActing = true;
  const ally = battle.ally;
  const st = battle.allyState;
  kind = kind || (ally.defId === "iva" ? "magic" : "physical");
  if (st.pauseBonus) { power *= 1.25; st.pauseBonus = false; }
  const hadCharge = Boolean(foe.charge);
  const hit = rollHit(ally, foe, kind, power, 0, 0, battle);
  let dealt = 0;
  if (hit.dodged) {
    emit(battle, "miss", { target: "enemy", label, by: "ally" });
  } else {
    const result = dealDamage(battle, foe, hit.amount);
    dealt = result.hpDamage;
    emit(battle, "hit", { target: "enemy", amount: result.hpDamage, absorbed: result.absorbed, crit: hit.crit, kind, element, label, by: "ally" });
    logEvent(battle, `${label}: ${result.hpDamage} урона${hit.crit ? ", крит" : ""}.`, ally.name);
    gainCoal(battle);
    if (hadCharge && !foe.charge) st.deedsNow.add("breakCharge");
    if (foe.currentHp <= 0 && ally.defId === "fena") {
      gainAllyResource(battle, 1);
      if (foe.slot === st.preyId) st.deedsNow.add("preyKill");
    }
  }
  battle.allyActing = false;
  battle.enemy = keep.currentHp > 0 ? keep : foe;
  return dealt;
}

// Rud's coals: any direct hit of the team, at most one per action.
function gainCoal(battle) {
  const st = battle.allyState;
  if (!st || !allyAlive(battle) || battle.ally.defId !== "rud") return;
  if (st.coalAction === st.actionIndex) return;
  st.coalAction = st.actionIndex;
  gainAllyResource(battle, 1);
}

function allyStatus(battle, target, id, duration, value, side = "enemy") {
  if (id === "stun") { applyStun(battle, target, battle.ally, value); return; }
  const meta = id === "burn" ? { stacks: 1 } : {};
  applyEffect(battle, target, { id, duration, value, meta }, battle.ally);
  emit(battle, "effect", { target: side, id });
}

function allyShield(battle, unit, ratio, duration = 2) {
  const value = Math.round(unit.maxHp * ratio);
  const shield = applyEffect(battle, unit, { id: "shield", duration, value }, battle.ally);
  emit(battle, "effect", { target: unit === battle.hero ? "hero" : "ally", id: "shield", amount: shield.value });
  if (unit === battle.hero) battle.allyState.deedsNow.add("shieldGiven");
  return shield.value;
}

function allyFortify(battle, unit, value, duration, untilOwnTurn = false) {
  applyEffect(battle, unit, { id: "fortify", duration, value, meta: untilOwnTurn ? { root: true } : {} }, battle.ally);
  emit(battle, "effect", { target: unit === battle.hero ? "hero" : "ally", id: "fortify" });
}

// The most wounded of you two, for skills that help "whoever needs it".
function neediestOfParty(battle) {
  const hero = battle.hero;
  const ally = battle.ally;
  return !allyAlive(battle) || hero.currentHp / hero.maxHp <= ally.currentHp / ally.maxHp ? hero : ally;
}

// ---------- what each skill does ----------
const ALLY_SKILL_RUN = {
  tessa_whip(b, foe) { if (allyStrike(b, foe, 0.8, "Корневой хлыст", "earth") > 0) gainAllyResource(b, 1); },
  tessa_root(b) { allyFortify(b, b.ally, 0.3, 2, true); b.allyState.rootHits = 0; logEvent(b, `${b.ally.name} укореняется.`, "Спутник"); },
  tessa_house(b) { allyShield(b, b.ally, 0.2); allyFortify(b, b.ally, 0.3, 2); },
  tessa_cover(b) { b.allyState.cover = 1; allyFortify(b, b.ally, 0.2, 2, true); logEvent(b, `${b.ally.name}: «За мою спину». Следующий удар по тебе примет она.`, "Спутник"); },
  tessa_path(b) { swapFormation(b, true); allyShield(b, b.hero, 0.08); },
  tessa_hold(b) { allyFortify(b, b.hero, 0.25, 2); allyShield(b, b.ally, 0.12); },
  tessa_reply(b, foe) { if (allyStrike(b, foe, 0.9, "Сухой ответ") > 0) allyStatus(b, foe, "weaken", 1, 0.15); },
  tessa_threshold(b, foe) { if (allyStrike(b, foe, 1.15, "Порог", "earth") > 0) allyStatus(b, foe, "mark", 2, 0.15); },
  tessa_nobody(b) { livingFoes(b).forEach((foe) => { if (allyStrike(b, foe, 1.2, "Никого за дверью", "earth") > 0) allyStatus(b, foe, "weaken", 2, 0.2); }); },

  rud_tool(b, foe) { allyStrike(b, foe, 1, "Честный инструмент"); },
  rud_blast(b, foe) { allyStrike(b, foe, 2.55, "Взрыв углей", "fire"); b.allyState.deedsNow.add("blast"); },
  rud_furnace(b, foe) {
    allyStrike(b, foe, 2.8, "Разомкнуть топку", "fire");
    if (foe.currentHp > 0) allyStatus(b, foe, "burn", 2, Math.max(3, Math.round(b.ally.physicalDamage * 0.15)));
    livingFoes(b).filter((other) => other !== foe).sort((x, y) => x.currentHp / x.maxHp - y.currentHp / y.maxHp).slice(0, 2).forEach((other) => allyStrike(b, other, 0.6, "Брызги топки", "fire"));
    b.allyState.deedsNow.add("blast");
  },
  rud_puff(b) { gainAllyResource(b, 1); allyFortify(b, b.ally, 0.15, 2, true); },
  rud_damper(b) { allyFortify(b, b.ally, 0.3, 2); allyShield(b, b.hero, 0.05); },
  rud_keepheat(b) { allyShield(b, neediestOfParty(b), 0.12); },
  rud_cinder(b, foe) { if (allyStrike(b, foe, 0.65, "Окалиной в глаза", "fire") > 0) allyStatus(b, foe, "weaken", 2, 0.15); },
  rud_short(b, foe) { if (allyStrike(b, foe, 1, "Короткий замах") > 0 && foe.currentHp > 0) allyStatus(b, foe, "stun", 1, 0.7); },
  rud_done(b, foe) { allyStrike(b, foe, foe.charge ? 2.7 : 2.1, "Работа окончена", "fire"); },

  iva_thread(b, foe) { allyStrike(b, foe, 0.65, "Нить", "arcane"); allyShield(b, b.hero, 0.04); gainAllyResource(b, b.hero.maxHp * 0.03); },
  iva_transfer(b) {
    const value = Math.min(b.allyState.res, b.hero.maxHp * 0.12);
    b.allyState.res -= value;
    const target = neediestOfParty(b);
    applyEffect(b, target, { id: "shield", duration: 2, value: Math.round(value) }, b.ally);
    emit(b, "effect", { target: target === b.hero ? "hero" : "ally", id: "shield", amount: Math.round(value) });
    logEvent(b, `${b.ally.name} переносит запас: щит ${Math.round(value)}.`, "Спутник");
    if (value > 0) b.allyState.deedsNow.add("transfer");
  },
  iva_binding(b) { allyFortify(b, b.hero, 0.2, 2); allyFortify(b, b.ally, 0.2, 2); },
  iva_scraps(b) { gainAllyResource(b, b.hero.maxHp * 0.06); healUnit(b, b.ally, b.ally.maxHp * 0.04, "Обрывки"); },
  iva_margin(b) {
    const bad = (b.hero.effects || []).find((effect) => ["bleed", "burn"].includes(effect.id));
    if (bad) { b.hero.effects = b.hero.effects.filter((effect) => effect !== bad); logEvent(b, `${b.ally.name} снимает с тебя: ${STATUS_EFFECT_DEFINITIONS[bad.id]?.name || bad.id}.`, "Спутник"); }
    allyShield(b, b.hero, 0.04);
  },
  iva_page(b) { const target = neediestOfParty(b); healUnit(b, target, target.maxHp * 0.12, "Несгоревшая страница"); allyShield(b, target, 0.06); },
  iva_cut(b, foe) { if (allyStrike(b, foe, 0.75, "Бумажный порез", "arcane") > 0) { allyStatus(b, foe, "mark", 2, 0.1); b.allyState.ivaMarkSlot = foe.slot; } },
  iva_splash(b, foe) {
    const spent = Math.min(b.allyState.res, b.hero.maxHp * 0.15);
    b.allyState.res -= spent;
    const ally = b.ally;
    allyStrike(b, foe, 0.8 + (spent * 0.5) / Math.max(1, ally.skillDamage), "Выплеснутый запас", "arcane");
  },
  iva_lastline(b, foe) { if (allyStrike(b, foe, 1.6, "Последняя строка", "arcane") > 0) allyStatus(b, foe, "weaken", 2, 0.25); },

  fena_track(b, foe) { b.allyState.preyId = foe.slot; allyStrike(b, foe, 1.05 * preyBonus(b, foe), "Выследить", "dark"); },
  fena_other(b, foe) {
    allyStrike(b, foe, 1.3 * preyBonus(b, foe), "Другая добыча", "dark");
    const weakest = livingFoes(b).sort((x, y) => x.currentHp / x.maxHp - y.currentHp / y.maxHp)[0];
    b.allyState.preyId = weakest?.slot ?? null;
  },
  fena_impossible(b, foe) { allyStrike(b, foe, (foe.currentHp / foe.maxHp < 0.3 ? 2.5 : 2) * preyBonus(b, foe), "Догнать невозможное", "dark"); },
  fena_knot(b) { gainAllyResource(b, 1); allyShield(b, b.ally, 0.05); },
  fena_yank(b) { allyFortify(b, b.hero, 0.35, 1); },
  fena_nohope(b) {
    const target = [b.hero, b.ally].find((unit) => unit.currentHp > 0 && unit.currentHp / unit.maxHp < 0.3) || neediestOfParty(b);
    healUnit(b, target, target.maxHp * 0.1, "Безнадёжных нет");
    allyFortify(b, target, 0.25, 2);
  },
  fena_snip(b, foe) { if (allyStrike(b, foe, 0.65 * preyBonus(b, foe), "Срезать петлю", "blood") > 0 && foe.currentHp > 0) allyStatus(b, foe, "bleed", 2, Math.max(3, Math.round(b.ally.physicalDamage * 0.18))); },
  fena_stretch(b, foe) { if (allyStrike(b, foe, 0.8 * preyBonus(b, foe), "Натянуть верёвку", "dark") > 0) allyStatus(b, foe, "mark", 2, 0.2); },
  fena_void(b, foe) { allyStrike(b, foe, 1.6 * preyBonus(b, foe), "Шаг в пустоту", "dark"); if (foe.currentHp <= 0) allyShield(b, b.hero, 0.06); }
};

// Fena's prey: a blow at the prey after you struck someone else is 35% stronger, once.
function preyBonus(battle, foe) {
  const st = battle.allyState;
  if (foe.slot !== st.preyId || !st.preyBonus) return 1;
  st.preyBonus = false;
  return 1.35;
}

// Why a skill can or can not be used right now.
function allySkillCheck(battle, skillId) {
  const skill = COMPANION_SKILL_BY_ID[skillId];
  const st = battle.allyState;
  if (!skill || !st.learned.includes(skillId)) return { ok: false, reason: "Этот приём ещё не освоен." };
  if (Number(st.cd[skillId] || 0) > 0) return { ok: false, reason: `Перезарядка: ${st.cd[skillId]}.` };
  const cost = allySkillCost(battle, skill);
  if (st.res < cost) return { ok: false, reason: `Нужно: ${allyResource(battle)?.name || "ресурс"} ${allyResource(battle)?.percent ? `${skill.cost}%` : skill.cost}.` };
  if (skill.id === "fena_nohope" && ![battle.hero, battle.ally].some((unit) => unit.currentHp / unit.maxHp < 0.3)) return { ok: false, reason: "Никто из вас не ниже 30% здоровья." };
  if ((skill.id === "iva_transfer" || skill.id === "iva_splash") && st.res < 1) return { ok: false, reason: "Запас пуст." };
  return { ok: true, skill, cost };
}

function allySkillCost(battle, skill) {
  const res = allyResource(battle);
  if (!res?.percent) return skill.cost;
  // Iva's costs are a share of your health; "spend all" skills need at least a scrap.
  return ["iva_transfer", "iva_splash"].includes(skill.id) ? 1 : battle.hero.maxHp * skill.cost / 100;
}

// ---------- the companion's turn ----------
// Starts the turn once: cooldowns, roots, stun. Returns "manual" when the player has to choose.
function beginAllyTurn(battle) {
  const st = battle.allyState;
  const ally = battle.ally;
  st.actionIndex += 1;
  st.turns += 1;
  st.thrillGiven = false;
  Object.keys(st.cd).forEach((id) => { st.cd[id] = Math.max(0, st.cd[id] - 1); });
  emit(battle, "turn", { who: "ally" });
  // What lasts "until the companion's own turn" ends now.
  ally.effects = ally.effects.filter((effect) => !effect.meta?.root);
  const stun = getEffect(ally, "stun") || getEffect(ally, "freeze");
  if (stun) {
    stun.duration -= 1;
    ally.effects = ally.effects.filter((effect) => effect.duration > 0);
    emit(battle, "stunned", { target: "ally" });
    logEvent(battle, `${ally.name} оглушён и пропускает ход.`, "Контроль");
    endAllyTurn(battle, 1);
    return "done";
  }
  if (st.control === "manual" && !battle.autoParty) {
    battle.awaiting = true;
    battle.awaitingActor = "ally";
    planAlly(battle);
    emit(battle, "allyPlan", { text: "" });
    return "manual";
  }
  const choice = chooseCompanionAction(battle);
  runAllyAction(battle, choice);
  return "done";
}

function endAllyTurn(battle, tempo = 1) {
  const ally = battle.ally;
  if (allyAlive(battle)) processEffectsEndOfTurn(battle, ally);
  if (ally.currentHp <= 0) allyFalls(battle);
  ally.ct += (100 / getSpeed(ally)) * tempo;
  planAlly(battle);
}

// The player's choice on the companion's turn: a skill (with a target), "brace" or "wait".
function companionAction(battle, action) {
  if (!battle.awaiting || battle.awaitingActor !== "ally" || battle.over) return { ok: false, reason: "Сейчас не ход спутника." };
  if (action.target !== undefined) setBattleTarget(battle, action.target);
  if (action.type === "skill") {
    const check = allySkillCheck(battle, action.skillId);
    if (!check.ok) return check;
  }
  battle.awaiting = false;
  battle.awaitingActor = null;
  runAllyAction(battle, action);
  advanceBattle(battle);
  return { ok: true };
}

function runAllyAction(battle, action) {
  const st = battle.allyState;
  const ally = battle.ally;
  let tempo = 1;
  if (action.type === "brace") {
    emit(battle, "action", { who: "ally", anim: "cast", name: "Закрыться", element: "steel" });
    allyFortify(battle, ally, 0.4, 2, true);
  } else if (action.type === "wait") {
    emit(battle, "action", { who: "ally", anim: "wait", name: "Выждать", element: "arcane" });
    tempo = 0.85;
  } else {
    const skill = COMPANION_SKILL_BY_ID[action.skillId];
    const check = allySkillCheck(battle, action.skillId);
    if (!check.ok) return runAllyAction(battle, { type: "skill", skillId: companionBaseAttack(battle) });
    st.res = Math.max(0, st.res - check.cost);
    st.cd[skill.id] = skill.cd ? skill.cd + 1 : 0;
    st.lastSkill = skill.id;
    const foe = livingFoes(battle).find((f) => f.slot === action.target) || allyTargetFoe(battle);
    emit(battle, "action", { who: "ally", anim: skill.target === "foe" || skill.target === "all" ? "attack" : "cast", name: skill.name, element: "steel", skillId: skill.id });
    if (foe || skill.target !== "foe") ALLY_SKILL_RUN[skill.id](battle, foe);
  }
  endAllyTurn(battle, tempo);
  checkBattleOver(battle);
}

function companionBaseAttack(battle) {
  return companionSkills(battle.ally.defId).find((skill) => skill.base && skill.target === "foe")?.id;
}

function allyTargetFoe(battle) {
  const st = battle.allyState;
  const living = livingFoes(battle);
  if (!living.length) return null;
  if (battle.ally.defId === "fena") {
    const prey = living.find((foe) => foe.slot === st.preyId);
    if (prey && st.order !== "press") return prey;
  }
  if (st.habits.includes("yield")) {
    const other = living.find((foe) => foe !== battle.enemy);
    if (battle.enemy.currentHp / battle.enemy.maxHp < 0.2 && other) return other;
  }
  return battle.enemy.currentHp > 0 ? battle.enemy : living[0];
}

// "Сам решает": a simple reading of the fight, steered by the order.
function chooseCompanionAction(battle) {
  const st = battle.allyState;
  const ally = battle.ally;
  const hero = battle.hero;
  const usable = st.learned.map((id) => COMPANION_SKILL_BY_ID[id]).filter((skill) => skill && allySkillCheck(battle, skill.id).ok);
  if (st.order === "guard" && ally.currentHp / ally.maxHp < 0.3) {
    const defense = usable.find((skill) => skill.ai.includes("defense") && skill.target === "self");
    return defense ? { type: "skill", skillId: defense.id } : { type: "brace" };
  }
  const heavyAt = (who) => livingFoes(battle).some((foe) => (foe.intent?.heavy || foe.charge) && (foe.intent?.target || "hero") === who);
  const heroLow = hero.currentHp / hero.maxHp < 0.45;
  const score = (skill) => {
    let s = 1 + skill.cost * 0.4;
    const tags = skill.ai;
    if (tags.includes("attack")) s += st.order === "press" ? 3 : 1.5;
    if (tags.includes("burst")) s += 2.5;
    if (tags.includes("execute") && livingFoes(battle).some((foe) => foe.currentHp / foe.maxHp < 0.3)) s += 3;
    if (tags.includes("aoe") && livingFoes(battle).length > 1) s += 2;
    if (tags.includes("protect")) s += (heroLow || heavyAt("hero") ? 4 : 0) + (st.order === "help" ? 1 : -1);
    if (tags.includes("heal")) s += heroLow || ally.currentHp / ally.maxHp < 0.35 ? 5 : -3;
    if (tags.includes("cleanse")) s += (hero.effects || []).some((effect) => ["bleed", "burn"].includes(effect.id)) ? 3 : -4;
    if (tags.includes("defense")) s += (st.front && heavyAt("ally") ? 3 : 0) + (st.order === "guard" ? 2 : -1);
    if (tags.includes("build")) s += st.res < 2 ? 1 : -1;
    if (tags.includes("spend") && st.res < battle.hero.maxHp * 0.06) s -= 4;
    if (tags.includes("control") && livingFoes(battle).some((foe) => foe.charge || foe.intent?.heavy)) s += 2;
    return s;
  };
  const best = usable.sort((a, b) => score(b) - score(a))[0];
  if (!best) return { type: "brace" };
  return { type: "skill", skillId: best.id, target: allyTargetFoe(battle)?.slot };
}

// What the companion will do next, over its head: the AI's pick, or a call for your decision.
function planAlly(battle) {
  if (!allyAlive(battle)) { battle.allyState.plan = null; return null; }
  const st = battle.allyState;
  if (jointReady(battle)) { st.plan = { id: "joint", text: `Готов к связке «${JOINT_OPORA[battle.hero.classKey].name}»` }; return st.plan; }
  if (st.control === "manual" && !battle.autoParty) { st.plan = { id: "manual", text: battle.awaitingActor === "ally" ? "Ждёт твоего решения" : "Ходит по твоему слову" }; return st.plan; }
  const choice = chooseCompanionAction(battle);
  const skill = COMPANION_SKILL_BY_ID[choice.skillId];
  const foe = livingFoes(battle).find((f) => f.slot === choice.target);
  st.plan = { id: choice.skillId || choice.type, text: skill ? `${skill.name}${skill.target === "foe" && foe ? `: ${foe.name}` : ""}` : "Закрыться" };
  return st.plan;
}

// Hooks into the hero's fight: they run through the mechanics system as one more mechanic.
const ALLY_MECHANIC = {
  name: "Спутник", hidden: true,
  afterHit(b, s, c) {
    const st = b.allyState;
    if (!st || c.proc || !(c.hpDamage > 0)) return;
    gainCoal(b);
    if (st.ivaMarkSlot === b.enemy.slot && unitHasEffect(b.enemy, "mark")) st.deedsNow.add("markUsed");
    if (unitHasEffect(b.enemy, "bleed")) st.deedsNow.add("bleedHit");
  },
  heal(b, s, c) {
    if (!allyAlive(b) || b.ally.defId !== "iva" || !(c.overflow > 0)) return;
    gainAllyResource(b, c.overflow * 0.5);
  },
  afterAction(b, s, c) {
    const st = b.allyState;
    if (!st) return;
    st.actionIndex += 1;
    if (c.type === "guard") st.heroGuards += 1;
    if (c.type === "wait") { st.heroWaits += 1; if (st.habits.includes("pause")) st.pauseBonus = true; }
    if (allyAlive(b) && b.ally.defId === "fena" && (c.type === "attack" || c.type === "skill")) {
      const living = livingFoes(b);
      if (st.preyId === null || !living.some((foe) => foe.slot === st.preyId)) st.preyId = living.sort((x, y) => x.currentHp / x.maxHp - y.currentHp / y.maxHp)[0]?.slot ?? null;
      if (b.enemy.slot !== st.preyId) {
        st.preyBonus = true;
        st.deedsNow.add("splitTargets");
        if (!st.thrillGiven) { st.thrillGiven = true; gainAllyResource(b, 1); }
      }
    }
    st.orderSet = false;
    planAlly(b);
  },
  foeDown(b, s, c) {
    const st = b.allyState;
    if (!st) return;
    if (!b.allyActing) st.heroKills += 1;
    if (c?.foe?.slot === st.preyId) st.preyId = null;
  }
};
MECHANICS.ally = ALLY_MECHANIC;

// ---------- orders, control, formation, joint attacks ----------
function setAllyOrder(battle, order) {
  if (!allyAlive(battle) || !COMPANION_ORDERS[order]) return { ok: false, reason: "Спутник не может выполнить приказ." };
  battle.allyState.order = order;
  const plan = planAlly(battle);
  emit(battle, "allyPlan", { text: plan?.text || "" });
  return { ok: true };
}

// Switching "Сам решает" during a fight; if it is the companion's turn now, the AI takes it at once.
function setAllyControl(battle, mode) {
  if (!battle.allyState || !["manual", "auto"].includes(mode)) return { ok: false };
  battle.allyState.control = mode;
  const companion = allyCompanion(battle);
  if (companion) companion.control = mode;
  if (mode === "auto" && battle.awaitingActor === "ally") {
    battle.awaiting = false;
    battle.awaitingActor = null;
    runAllyAction(battle, chooseCompanionAction(battle));
    advanceBattle(battle);
  } else planAlly(battle);
  return { ok: true };
}

function jointUnlocked(hero, companion) {
  return Boolean(companion) && hero.level >= JOINT_UNLOCK.level && companion.trust >= JOINT_UNLOCK.trust && Number(companion.rank || 0) >= JOINT_UNLOCK.rank && companion.legal !== "contract";
}

function jointCondition(battle) {
  const hero = battle.hero;
  const core = coreState(battle);
  if (hero.classKey === "warrior") return hero.currentMana >= 40 ? null : "Нужно 40 напора.";
  if (hero.classKey === "mage") return (core?.value || 0) >= 40 ? null : "Нужно 40 перегрева.";
  if (hero.classKey === "archer") return (core?.value || 0) >= 1 ? null : "Нужна дистанция.";
  if (hero.classKey === "bard") return (core?.notes || []).length >= 2 ? null : "Нужно две ноты в мотиве.";
  if (hero.classKey === "assassin") return core?.hidden ? null : "Нужно быть в тени.";
  return null;
}

function jointReady(battle) {
  const st = battle.allyState;
  if (!st || st.jointUsed || !allyAlive(battle) || st.turns < 1) return false;
  return jointUnlocked(battle.hero, allyCompanion(battle));
}

function canUseJoint(battle) {
  if (!jointReady(battle)) return { ok: false, reason: "Спутник ещё не готов к связке." };
  const why = jointCondition(battle);
  return why ? { ok: false, reason: why } : { ok: true, joint: JOINT_OPORA[battle.hero.classKey] };
}

function performJoint(battle) {
  const hero = battle.hero;
  const ally = battle.ally;
  const st = battle.allyState;
  const joint = JOINT_OPORA[hero.classKey];
  const core = coreState(battle);
  st.jointUsed = true;
  emit(battle, "action", { who: "hero", anim: "attack", name: joint.name, element: "holy", joint: true });
  emit(battle, "action", { who: "ally", anim: "attack", name: joint.name, element: "holy", joint: true });
  logEvent(battle, `Связка: ${joint.name}!`, "Связка");
  const foe = battle.enemy;
  if (hero.classKey === "warrior") {
    hero.currentMana -= 40;
    performHeroHit(battle, { kind: "physical", power: 1.5, label: joint.name, element: "steel", noEcho: true, sure: true });
    if (foe.charge && foe.currentHp > 0) breakCharge(battle);
  } else if (hero.classKey === "mage") {
    core.value = Math.max(0, core.value - 30);
    performHeroHit(battle, { kind: "magic", power: 1.5, label: joint.name, element: "frost", noEcho: true, sure: true });
    procShield(battle, 0.12);
  } else if (hero.classKey === "archer") {
    performHeroHit(battle, { kind: "physical", power: 1.5, label: joint.name, element: "air", noEcho: true, sure: true });
    core.value = Math.min(3, core.value + 1);
  } else if (hero.classKey === "bard") {
    performHeroHit(battle, { kind: "magic", power: 1.5, label: joint.name, element: "air", noEcho: true, sure: true });
    core.notes = [];
    mechNote(battle, "Аккорд!");
    fx(battle, "rage", 3, 0.25, { self: true });
    procMana(battle, 0.15);
  } else if (hero.classKey === "assassin") {
    performHeroHit(battle, { kind: "physical", power: 1.5, label: joint.name, element: "dark", noEcho: true, sure: true, forceCrit: true });
    st.cover = 1;
  }
  if (foe.currentHp > 0) allyStrike(battle, foe, 1.5, joint.name, "holy");
  // Each person adds something of their own.
  if (ally.defId === "tessa") allyFortify(battle, hero, 0.15, 1);
  if (ally.defId === "rud") st.res = Math.max(1, st.res);
  if (ally.defId === "iva") gainAllyResource(battle, hero.maxHp * 0.05);
  if (ally.defId === "fena") { st.preyId = foe.currentHp > 0 ? foe.slot : st.preyId; gainAllyResource(battle, 1); }
  // The companion spent its next action on the joint attack.
  ally.ct += 100 / getSpeed(ally);
  planAlly(battle);
}

// Swapping places takes the action of whoever does it; Tessa's path does it for free.
function swapFormation(battle) {
  if (!allyAlive(battle)) return { ok: false, reason: "Меняться не с кем." };
  battle.allyState.front = !battle.allyState.front;
  emit(battle, "formation", { front: battle.allyState.front });
  logEvent(battle, battle.allyState.front ? `${battle.ally.name} выходит вперёд.` : `${battle.ally.name} отходит назад.`, "Построение");
  // Intents already announced against the old order are aimed anew.
  battle.foes.forEach((foe) => { if (foe.intent && hitKinds(foe.intent)) foe.intent.target = chooseFoeTarget(battle, foe.intent); });
  return { ok: true };
}

// ---------- after a fight ----------
// Returns what happened to the companion: fell, came back, or is gone and forgotten.
function settleCompanionBattle(hero, battle) {
  const st = battle.allyState;
  if (!st) return null;
  const companion = hero.companions.find((c) => c.id === st.companionId);
  if (!companion) return null;
  ensureCompanionSkills(companion);
  const result = { name: getCompanionDef(companion).name, fell: st.fell, forgotten: false, ready: [] };
  companion.recent = [...(companion.recent || []), { cover: st.heroGuards >= 2, yield: st.heroKills >= 1, pause: st.heroWaits >= 1 }].slice(-12);
  const counts = Object.keys(COMPANION_HABITS).map((id) => [id, companion.recent.filter((entry) => entry[id]).length]).filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1]);
  companion.habits = counts.slice(0, 2).map(([id]) => id);
  if (st.fell) {
    companion.fallStreak = Number(companion.fallStreak || 0) + 1;
    result.streak = companion.fallStreak;
    if (companion.fallStreak >= COMPANION_FALLS_TO_FORGET) {
      forgetCompanion(hero, companion.id);
      result.forgotten = true;
      return result;
    }
    companion.hpRatio = 0.4;
    return result;
  }
  companion.fallStreak = 0;
  companion.hpRatio = clamp(battle.ally.currentHp / battle.ally.maxHp, 0.05, 1);
  addCompanionTrust(companion, 2, { trip: true });
  if (!st.front && battle.over === "hero") st.deedsNow.add("surviveBack");
  // Deeds count once per fight; any deed is one more step toward the next rank.
  const before = companionSkills(companion.defId).filter((skill) => companionSkillState(companion, skill).ready).map((skill) => skill.id);
  st.deedsNow.forEach((kind) => { companion.deedKinds[kind] = Number(companion.deedKinds[kind] || 0) + 1; });
  if (st.deedsNow.size) companion.deeds = Number(companion.deeds || 0) + 1;
  result.ready = companionSkills(companion.defId).filter((skill) => companionSkillState(companion, skill).ready && !before.includes(skill.id)).map((skill) => skill.name);
  return result;
}
