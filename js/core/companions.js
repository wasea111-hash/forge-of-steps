// Companions: the roster, trust and ranks, the three falls, karma and the market, and the companion in battle.
// Data lives in js/core/data.companions.js, the design in docs/COMPANIONS.md. No DOM here.

// ---------- the roster ----------
function ensureCompanionState(hero) {
  if (!Array.isArray(hero.companions)) hero.companions = [];
  if (!hero.party || typeof hero.party !== "object") hero.party = { activeId: null, allyFront: true };
  if (!Number.isFinite(Number(hero.karma))) hero.karma = 0;
  if (!hero.companionLog || typeof hero.companionLog !== "object") hero.companionLog = { met: [], gone: [], karmaKeys: [] };
  ["met", "gone", "karmaKeys"].forEach((key) => { if (!Array.isArray(hero.companionLog[key])) hero.companionLog[key] = []; });
  if (hero.party.activeId && !hero.companions.some((c) => c.id === hero.party.activeId)) hero.party.activeId = hero.companions[0]?.id || null;
  return hero;
}

function getCompanionDef(companion) {
  return COMPANIONS[companion?.defId] || null;
}

function getCompanionClass(companion) {
  return COMPANION_CLASSES[getCompanionDef(companion)?.classId] || null;
}

function getActiveCompanion(hero) {
  ensureCompanionState(hero);
  return hero.companions.find((c) => c.id === hero.party.activeId) || null;
}

// Someone you have met, freed, bought or lost can not be met again.
function companionTaken(hero, defId) {
  ensureCompanionState(hero);
  return hero.companionLog.met.includes(defId) || hero.companionLog.gone.includes(defId);
}

function rollCompanionRarity(def, zoneKey = "green") {
  const wanted = { white: 0, green: 1, orange: 2, purple: 3, red: 4 }[zoneKey] ?? 1;
  const list = def.rarities;
  // The trail's danger leans the start upward, but never outside what this person can be.
  const candidates = list.filter((rarity) => Math.abs(COMPANION_RARITIES.indexOf(rarity) - wanted) <= 1);
  return randomFrom(candidates.length ? candidates : list);
}

function recruitCompanion(hero, defId, { rarity = null, legal = "free", source = "road" } = {}) {
  ensureCompanionState(hero);
  const def = COMPANIONS[defId];
  if (!def || !def.ready || companionTaken(hero, defId)) return null;
  const start = rarity && def.rarities.includes(rarity) ? rarity : def.rarities[0];
  const companion = {
    id: uid("comp"), defId, rarity: start, legal, source,
    rank: RARITY_START_RANK[start] || 0,
    trust: legal === "free" ? 10 : 0, tripTrust: 0, deeds: 0,
    hpRatio: 1, fallStreak: 0, recent: [], habits: [], memories: [], metAt: hero.level
  };
  hero.companions.push(companion);
  hero.companionLog.met.push(defId);
  if (!hero.party.activeId) hero.party.activeId = companion.id;
  return companion;
}

function setActiveCompanion(hero, id) {
  ensureCompanionState(hero);
  if (hero.expedition) return { ok: false, reason: "Спутника меняют только в лагере." };
  if (id && !hero.companions.some((c) => c.id === id)) return { ok: false, reason: "Такого спутника нет." };
  hero.party.activeId = id || null;
  return { ok: true };
}

function setAllyFront(hero, front) {
  ensureCompanionState(hero);
  hero.party.allyFront = Boolean(front);
  return { ok: true };
}

// ---------- trust, deeds, ranks ----------
function companionTrustCap(companion) {
  return companion.legal === "contract" ? 39 : 100;
}

function addCompanionTrust(companion, amount, { trip = false } = {}) {
  if (trip) {
    // A single trip can not buy more than 10 trust.
    const room = Math.max(0, 10 - Number(companion.tripTrust || 0));
    amount = Math.min(amount, room);
    companion.tripTrust = Number(companion.tripTrust || 0) + amount;
  }
  companion.trust = clamp(Number(companion.trust || 0) + amount, 0, companionTrustCap(companion));
  // Memories open by trust; they are scenes, not power.
  (getCompanionDef(companion)?.memories || []).forEach((memory, index) => {
    if (companion.trust >= memory.trust && !companion.memories.includes(index)) companion.memories.push(index);
  });
  return companion.trust;
}

function getNextRank(companion) {
  return COMPANION_RANKS[Number(companion.rank || 0) + 1] || null;
}

// An oath at the fire raises the rank once trust and deeds are there. A contract holds no oaths.
function canTakeOath(companion) {
  const next = getNextRank(companion);
  if (!next) return { ok: false, reason: "Высший ранг уже достигнут." };
  if (companion.legal === "contract") return { ok: false, reason: "Клятву не даёт тот, кто держится договором." };
  if (companion.trust < next.trust) return { ok: false, reason: `Нужно доверие ${next.trust}.` };
  if (companion.deeds < next.deeds) return { ok: false, reason: `Нужно поступков: ${next.deeds}.` };
  return { ok: true, next };
}

function takeOath(hero, id) {
  const companion = hero.companions.find((c) => c.id === id);
  if (!companion) return { ok: false, reason: "Такого спутника нет." };
  const check = canTakeOath(companion);
  if (!check.ok) return check;
  companion.rank += 1;
  const line = getCompanionDef(companion).oaths?.[companion.rank - 1] || "";
  return { ok: true, rank: companion.rank, line };
}

// ---------- karma: Freedom ↔ Ownership ----------
function changeKarma(hero, delta, key = null) {
  ensureCompanionState(hero);
  if (key) {
    if (hero.companionLog.karmaKeys.includes(key)) return hero.karma;
    hero.companionLog.karmaKeys.push(key);
  }
  hero.karma = clamp(Number(hero.karma || 0) + delta, -KARMA_LIMIT, KARMA_LIMIT);
  return hero.karma;
}

function getKarmaName(hero) {
  const value = Number(hero.karma || 0);
  if (value <= -60) return KARMA_NAMES[0].name;
  if (value <= -25) return KARMA_NAMES[1].name;
  if (value >= 60) return KARMA_NAMES[3].name;
  if (value >= 25) return KARMA_NAMES[2].name;
  return "Между свободой и выгодой";
}

// Story choices that weigh on the axis: counted once, when they are made.
const KARMA_FLAGS = { mot_freed: 8, mot_bound: -6 };

// ---------- the market (Ashlands onwards) ----------
function isMarketOpen(hero) {
  return Number(hero.unlockedRegion || 0) >= 1;
}

function getMarketOffers(hero) {
  ensureCompanionState(hero);
  if (!isMarketOpen(hero)) return [];
  const reached = REGIONS.filter((region, index) => index <= Number(hero.unlockedRegion || 0)).map((region) => region.id);
  const closed = Number(hero.karma || 0) <= -25;
  return Object.values(COMPANIONS)
    .filter((def) => def.ready && reached.includes(def.region) && !companionTaken(hero, def.id) && def.region !== "thicket")
    .map((def) => {
      // Open stalls sell the plainest contract; the closed auction offers the best this person can be.
      const rarity = closed ? def.rarities[def.rarities.length - 1] : def.rarities[0];
      return { defId: def.id, rarity, price: Math.round(MARKET_PRICES[rarity] * (1 + Number(hero.unlockedRegion || 0) * 0.25)), closed };
    });
}

// keep: hold the contract (the person fights, trust capped) or tear it at once (they choose to stay).
function buyContract(hero, defId, keep) {
  const offer = getMarketOffers(hero).find((entry) => entry.defId === defId);
  if (!offer) return { ok: false, reason: "Этого договора на торгах нет." };
  if (hero.gold < offer.price) return { ok: false, reason: `Нужно ${offer.price} золота.` };
  hero.gold -= offer.price;
  const companion = recruitCompanion(hero, defId, { rarity: offer.rarity, legal: keep ? "contract" : "free", source: "market" });
  changeKarma(hero, keep ? -15 : 4);
  if (!keep) companion.trust = 5;
  return { ok: true, companion, price: offer.price };
}

function tearContract(hero, id) {
  const companion = hero.companions.find((c) => c.id === id);
  if (!companion || companion.legal !== "contract") return { ok: false, reason: "Договора нет." };
  companion.legal = "free";
  changeKarma(hero, 10);
  return { ok: true };
}

// ---------- road rescues ----------
function getRescueFor(hero, regionId) {
  ensureCompanionState(hero);
  const def = Object.values(COMPANIONS).find((entry) => entry.ready && entry.region === regionId && COMPANION_RESCUES[entry.id] && !companionTaken(hero, entry.id));
  return def ? { def, rescue: COMPANION_RESCUES[def.id] } : null;
}

// The first companion: guaranteed after the Thicket's guardian, old saves included.
function getPendingMeeting(hero) {
  ensureCompanionState(hero);
  if (!hero.defeatedGuardians?.includes("greyfang") || companionTaken(hero, "tessa")) return null;
  return COMPANIONS.tessa;
}

// ---------- the companion as a fighter ----------
function companionLevel(hero) {
  return Math.max(1, Number(hero.level || 1));
}

function makeAllyUnit(hero, companion) {
  const def = getCompanionDef(companion);
  const cls = getCompanionClass(companion);
  const profile = COMPANION_PROFILES[cls.role];
  const level = companionLevel(hero);
  const stats = createStatBlock(Object.fromEntries(Object.entries(profile.stats).map(([key, perLevel]) => [key, 6 + Math.round(perLevel * level)])));
  const derived = deriveStats(stats, level);
  const rankBoost = 1 + Number(companion.rank || 0) * 0.06;
  // Your gear outgrows a companion without gear: from level 20 its blows grow a little faster.
  const lateBoost = 1 + Math.max(0, level - 20) * 0.013;
  const ally = {
    side: "ally", id: companion.id, defId: companion.defId, classId: def.classId, role: cls.role,
    name: def.name, level, stats, totalStats: stats, ...derived,
    effects: [], cooldowns: {}, defShred: 0, traits: [], rank: Number(companion.rank || 0)
  };
  ally.maxHp = Math.round(derived.maxHp * profile.hp * rankBoost * COMPANION_HP_SCALE);
  ally.physicalDamage = Math.round(derived.physicalDamage * profile.dmg * rankBoost * lateBoost);
  ally.skillDamage = Math.round(derived.skillDamage * profile.dmg * rankBoost * lateBoost);
  ally.attackSpeed = Math.round(derived.attackSpeed * profile.speed);
  ally.currentHp = Math.max(1, Math.round(ally.maxHp * clamp(Number(companion.hpRatio ?? 1), 0.05, 1)));
  ally.currentMana = ally.maxMana;
  return ally;
}
const COMPANION_HP_SCALE = 1;

function allyAlive(battle) {
  return Boolean(battle.ally && battle.ally.currentHp > 0);
}

function allyIsFront(battle) {
  return allyAlive(battle) && battle.allyState.front;
}

// The companion's state for one fight: order, formation, the class mechanic, what you did (for habits).
function initAllyBattle(battle, ally, companion, front) {
  battle.ally = ally;
  battle.allyState = {
    companionId: companion.id, order: "help", front: Boolean(front), fell: false, deed: false, turns: 0,
    coals: 0, coalAction: -1, store: 0, rootHits: 0, markSlot: null, bonus: false, formOn: false,
    jointUsed: false, cover: 0, pauseBonus: false, habits: [...(companion.habits || [])],
    heroGuards: 0, heroWaits: 0, heroKills: 0, actionIndex: 0, plan: null
  };
  ally.ct = (100 / getSpeed(ally)) * 1.05;
  planAlly(battle);
}

// Which side of the party an enemy move strikes. Melee hits the one in front; spells and shots 60/40.
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

// An enemy blow that lands on the companion: its own dodge, armour and shields count.
function enemyHitsAlly(battle, move) {
  const enemy = battle.enemy;
  const ally = battle.ally;
  const kind = move.kind === "magic" ? "magic" : "physical";
  const hits = Math.max(1, Number(move.hits || 1));
  if (battle.allyState.cover > 0) battle.allyState.cover -= 1;
  for (let i = 0; i < hits && ally.currentHp > 0; i += 1) {
    const hit = rollHit(enemy, ally, kind, move.power, 0, 0, battle);
    if (hit.dodged) { emit(battle, "miss", { target: "ally", label: move.name }); continue; }
    let amount = hit.amount;
    if (unitHasEffect(ally, "fortify")) amount *= 1 - effectValue(ally, "fortify");
    if (battle.allyState.front && battle.allyState.habits.includes("cover")) amount *= 0.85;
    const { hpDamage, absorbed } = dealDamage(battle, ally, amount, { ally: true });
    emit(battle, "hit", { target: "ally", amount: hpDamage, absorbed, crit: hit.crit, kind, element: move.element || (kind === "magic" ? "arcane" : "steel"), label: move.name, heavy: Boolean(move.heavy) });
    logEvent(battle, `${move.name} по ${ally.name}: ${hpDamage} урона.`, enemy.name);
    if (move.heavy && battle.allyState.front && hpDamage > 0) battle.allyState.deed = true;
    allyHurt(battle, hpDamage);
  }
  if (ally.currentHp <= 0) allyFalls(battle);
}

function allyHurt(battle, amount) {
  const st = battle.allyState;
  if (battle.ally.classId === "rootshield" && amount > 0) {
    st.rootHits += 1;
    const need = battle.ally.rank >= 4 ? 1 : 2;
    if (st.rootHits >= need && battle.enemy.currentHp > 0) {
      st.rootHits = 0;
      applyEffect(battle, battle.enemy, { id: "weaken", duration: 2, value: battle.ally.rank >= 2 ? 0.3 : 0.2 }, battle.ally);
      emit(battle, "mech", { text: `${battle.ally.name}: корни держат врага` });
      logEvent(battle, `Корни оплетают ${battle.enemy.name}: слабость.`, battle.ally.name);
    }
  }
}

function allyFalls(battle) {
  const st = battle.allyState;
  if (st.fell) return;
  st.fell = true;
  battle.ally.currentHp = 0;
  battle.ally.effects = [];
  emit(battle, "death", { target: "ally" });
  logEvent(battle, `${battle.ally.name} падает. Нить Клейма держит — пока.`, "Спутник");
}

// The companion's own blow. battle.enemy points at the struck foe for the events, as on enemy turns.
function allyStrike(battle, foe, power, label, element = "steel", kind = "physical") {
  const keep = battle.enemy;
  battle.enemy = foe;
  battle.allyActing = true;
  const ally = battle.ally;
  if (battle.allyState.pauseBonus) { power *= 1.25; battle.allyState.pauseBonus = false; }
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
  }
  battle.allyActing = false;
  battle.enemy = keep.currentHp > 0 ? keep : foe;
  return dealt;
}

// Coals for the coal-bearer: any direct hit of the team, at most one per action.
function gainCoal(battle) {
  const st = battle.allyState;
  if (!st || !allyAlive(battle) || battle.ally.classId !== "coalbearer") return;
  if (st.coalAction === st.actionIndex) return;
  st.coalAction = st.actionIndex;
  st.coals = Math.min(battle.ally.rank >= 4 ? 4 : 3, st.coals + 1);
}

function allyTargetFoe(battle) {
  const st = battle.allyState;
  const living = livingFoes(battle);
  if (!living.length) return null;
  if (battle.ally.classId === "voidcatcher") {
    const marked = living.find((foe) => foe.slot === st.markSlot);
    if (marked) return marked;
  }
  if (st.order === "press" && battle.enemy.currentHp > 0) return battle.enemy;
  // Leaving the last blow to you: the companion turns from a foe you are about to finish.
  if (st.habits.includes("yield")) {
    const other = living.find((foe) => foe !== battle.enemy || living.length === 1);
    if (battle.enemy.currentHp / battle.enemy.maxHp < 0.2 && other) return other;
  }
  return battle.enemy.currentHp > 0 ? battle.enemy : living[0];
}

// What the companion will do next, shown over its head. Recomputed when the order changes.
function planAlly(battle) {
  if (!allyAlive(battle)) { battle.allyState.plan = null; return null; }
  const st = battle.allyState;
  const ally = battle.ally;
  const hero = battle.hero;
  const foe = allyTargetFoe(battle);
  let plan = { id: "strike", name: "Удар", target: foe?.slot ?? null, text: foe ? `Удар: ${foe.name}` : "" };
  const hurt = ally.currentHp / ally.maxHp < 0.3;
  if (jointReady(battle)) plan = { id: "joint", name: "Готов к связке", target: foe?.slot ?? null, text: `Готов к связке «${JOINT_OPORA[hero.classKey].name}»` };
  else if (st.order === "guard" && hurt) plan = { id: "brace", name: "Закрыться", text: "Закрывается: −40% урона по себе" };
  else if (ally.classId === "rootshield") {
    const heavy = battle.foes.some((f) => f.currentHp > 0 && (f.intent?.heavy || f.charge));
    if ((st.order === "help" && (heavy || st.turns % 2 === 0)) || (st.order === "guard")) plan = { id: "root", name: "Укорениться", text: "Укореняется: −30% урона до своего хода" };
  } else if (ally.classId === "coalbearer") {
    const need = ally.rank >= 4 ? 4 : 3;
    if (st.coals >= Math.min(3, need) && st.order !== "guard") plan = { id: "blast", name: "Взрыв углей", target: foe?.slot ?? null, text: `Взрыв углей: ${foe?.name || ""}` };
  } else if (ally.classId === "binder") {
    if (st.store > 0) plan = st.order === "press" ? { id: "unbind", name: "Выплеснуть запас", target: foe?.slot ?? null, text: `Запас ${Math.round(st.store)} — в удар` } : { id: "transfer", name: "Перенести запас", text: `Щит тебе: ${Math.round(st.store)}` };
    else plan = { id: "thread", name: "Нить", target: foe?.slot ?? null, text: `Нить: ${foe?.name || ""}, малый щит тебе` };
  } else if (ally.classId === "voidcatcher") {
    plan = { id: "hunt", name: st.bonus ? "Добить брошенного" : "Выследить", target: foe?.slot ?? null, text: `${st.bonus ? "Режет брошенного (+35%)" : "Охота"}: ${foe?.name || ""}` };
  }
  st.plan = plan;
  return plan;
}

function allyTurn(battle) {
  const st = battle.allyState;
  const ally = battle.ally;
  st.actionIndex += 1;
  st.turns += 1;
  tickCooldowns(ally);
  emit(battle, "turn", { who: "ally" });
  // Rooting lasts until the companion's own next turn.
  ally.effects = ally.effects.filter((effect) => !(effect.id === "fortify" && effect.meta?.root));
  const stun = getEffect(ally, "stun") || getEffect(ally, "freeze");
  if (stun) {
    stun.duration -= 1;
    ally.effects = ally.effects.filter((effect) => effect.duration > 0);
    emit(battle, "stunned", { target: "ally" });
    logEvent(battle, `${ally.name} оглушён и пропускает ход.`, "Контроль");
  } else {
    const plan = planAlly(battle) || { id: "strike" };
    runAllyPlan(battle, plan);
  }
  if (allyAlive(battle)) processEffectsEndOfTurn(battle, ally);
  if (ally.currentHp <= 0) allyFalls(battle);
  let interval = 100 / getSpeed(ally);
  if (st.lastPlan === "root") interval *= 1.15;
  ally.ct += interval;
  planAlly(battle);
}

function runAllyPlan(battle, plan) {
  const st = battle.allyState;
  const ally = battle.ally;
  const hero = battle.hero;
  st.lastPlan = plan.id;
  const foe = livingFoes(battle).find((f) => f.slot === plan.target) || allyTargetFoe(battle);
  const act = (name, anim, element) => emit(battle, "action", { who: "ally", anim, name, element });
  if (plan.id === "joint") plan = { id: "strike" };
  if (plan.id === "brace") {
    act("Закрыться", "cast", "steel");
    applyEffect(battle, ally, { id: "fortify", duration: 1, value: 0.4, meta: { root: true } }, ally);
    return;
  }
  if (plan.id === "root") {
    act("Укорениться", "cast", "earth");
    applyEffect(battle, ally, { id: "fortify", duration: 2, value: ally.rank >= 1 ? 0.35 : 0.3, meta: { root: true } }, ally);
    emit(battle, "effect", { target: "ally", id: "fortify" });
    logEvent(battle, `${ally.name} укореняется.`, "Спутник");
    // Rank II and up: the roots also lash out while settling.
    if (ally.rank >= 2 && foe) allyStrike(battle, foe, 0.5, "Корневой хлыст", "earth");
    return;
  }
  if (!foe) return;
  if (plan.id === "blast") {
    act("Взрыв углей", "attack", "fire");
    const coals = st.coals;
    st.coals = 0;
    const dealt = allyStrike(battle, foe, 0.75 * coals + 0.3, "Взрыв углей", "fire");
    if (ally.rank >= 4) eachFoe(battle, (other) => { if (other !== foe) allyStrike(battle, other, 0.35 * coals, "Брызги углей", "fire"); }, false);
    if (dealt > 0) st.deed = true;
    return;
  }
  if (plan.id === "transfer") {
    act("Перенести запас", "cast", "arcane");
    const value = Math.round(st.store);
    st.store = 0;
    const shield = applyEffect(battle, hero, { id: "shield", duration: 3, value }, ally);
    emit(battle, "effect", { target: "hero", id: "shield", amount: shield.value });
    logEvent(battle, `${ally.name} переносит запас: щит ${value}.`, "Спутник");
    if (hero.currentHp / hero.maxHp < 0.3) st.deed = true;
    return;
  }
  if (plan.id === "unbind") {
    act("Выплеснуть запас", "cast", "arcane");
    const value = st.store;
    st.store = 0;
    const keep = battle.enemy;
    battle.enemy = foe;
    const result = dealDamage(battle, foe, value * 0.5);
    emit(battle, "hit", { target: "enemy", amount: result.hpDamage, absorbed: result.absorbed, kind: "magic", element: "arcane", label: "Выплеснутый запас", by: "ally" });
    battle.enemy = keep.currentHp > 0 ? keep : foe;
    return;
  }
  if (plan.id === "thread") {
    act("Нить", "cast", "arcane");
    allyStrike(battle, foe, 0.8, "Нить", "arcane", "magic");
    const shield = applyEffect(battle, hero, { id: "shield", duration: 2, value: Math.round(hero.maxHp * (ally.rank >= 2 ? 0.06 : 0.04)) }, ally);
    emit(battle, "effect", { target: "hero", id: "shield", amount: shield.value });
    return;
  }
  if (plan.id === "hunt") {
    act(plan.name, "attack", "dark");
    const bonus = st.bonus ? 1.35 : 1;
    st.bonus = false;
    allyStrike(battle, foe, 1.05 * bonus, plan.name, "dark");
    if (foe.currentHp <= 0) st.deed = true;
    return;
  }
  act("Удар", "attack", "steel");
  allyStrike(battle, foe, 1, "Удар спутника", "steel");
}

// Hooks into the hero's fight: they run through the mechanics system as one more mechanic.
const ALLY_MECHANIC = {
  name: "Спутник", hidden: true,
  afterHit(b, s, c) { if (!c.proc && c.hpDamage > 0) gainCoal(b); },
  heal(b, s, c) {
    if (!allyAlive(b) || b.ally.classId !== "binder" || !(c.overflow > 0)) return;
    const cap = b.hero.maxHp * (b.ally.rank >= 4 ? 0.25 : 0.15);
    b.allyState.store = Math.min(cap, b.allyState.store + c.overflow);
  },
  afterAction(b, s, c) {
    const st = b.allyState;
    if (!st) return;
    st.actionIndex += 1;
    if (c.type === "guard") st.heroGuards += 1;
    if (c.type === "wait") { st.heroWaits += 1; if (st.habits.includes("pause")) st.pauseBonus = true; }
    if (allyAlive(b) && b.ally.classId === "voidcatcher" && (c.type === "attack" || c.type === "skill")) {
      const marked = livingFoes(b).find((foe) => foe.slot === st.markSlot);
      if (marked && b.enemy !== marked) st.bonus = true;
    }
    if (allyAlive(b) && b.ally.classId === "voidcatcher") {
      // The hunter keeps the most wounded foe in sight.
      const weakest = livingFoes(b).sort((x, y) => x.currentHp / x.maxHp - y.currentHp / y.maxHp)[0];
      if (weakest && (st.markSlot === null || !livingFoes(b).some((foe) => foe.slot === st.markSlot))) st.markSlot = weakest.slot;
    }
    st.orderSet = false;
    planAlly(b);
  },
  foeDown(b, s, c) { if (b.allyState && !b.allyActing) b.allyState.heroKills += 1; if (b.allyState && c?.foe?.slot === b.allyState.markSlot) b.allyState.markSlot = null; }
};

MECHANICS.ally = ALLY_MECHANIC;

// ---------- orders, formation, joint attacks (your actions) ----------
function setAllyOrder(battle, order) {
  if (!allyAlive(battle) || !COMPANION_ORDERS[order]) return { ok: false, reason: "Спутник не может выполнить приказ." };
  if (battle.allyState.orderSet && battle.allyState.order !== order) return { ok: false, reason: "Приказ уже отдан на этот ход." };
  battle.allyState.order = order;
  battle.allyState.orderSet = true;
  const plan = planAlly(battle);
  emit(battle, "allyPlan", { text: plan?.text || "" });
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
  const companion = (battle.hero.companions || []).find((c) => c.id === st.companionId);
  return jointUnlocked(battle.hero, companion);
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
  // The companion spent its next action on the joint attack.
  ally.ct += 100 / getSpeed(ally);
  planAlly(battle);
}

// Swapping places takes your action: the next intents see the new order.
function swapFormation(battle) {
  if (!allyAlive(battle)) return { ok: false, reason: "Меняться не с кем." };
  battle.allyState.front = !battle.allyState.front;
  emit(battle, "formation", { front: battle.allyState.front });
  logEvent(battle, battle.allyState.front ? `${battle.ally.name} выходит вперёд.` : `${battle.ally.name} отходит назад.`, "Построение");
  // Intents already announced against the old order are aimed anew.
  battle.foes.forEach((foe) => { if (foe.intent && hitKinds(foe.intent)) foe.intent.target = chooseFoeTarget(battle, foe.intent); });
  return { ok: true };
}

// ---------- after a fight, after a trip ----------
// Returns what happened to the companion: fell, came back, or is gone and forgotten.
function settleCompanionBattle(hero, battle) {
  const st = battle.allyState;
  if (!st) return null;
  const companion = hero.companions.find((c) => c.id === st.companionId);
  if (!companion) return null;
  const result = { name: getCompanionDef(companion).name, fell: st.fell, forgotten: false };
  // Habits: what you did in this fight.
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
    // The Brand's thread brings the companion back, weak.
    companion.hpRatio = 0.4;
  } else {
    companion.fallStreak = 0;
    companion.hpRatio = clamp(battle.ally.currentHp / battle.ally.maxHp, 0.05, 1);
    addCompanionTrust(companion, 2, { trip: true });
    if (st.deed) companion.deeds = Number(companion.deeds || 0) + 1;
  }
  return result;
}

// The Brand takes the person whole: the roster, the fire, the journal forget them.
function forgetCompanion(hero, id) {
  const companion = hero.companions.find((c) => c.id === id);
  if (!companion) return;
  hero.companions = hero.companions.filter((c) => c.id !== id);
  hero.companionLog.met = hero.companionLog.met.filter((defId) => defId !== companion.defId);
  hero.companionLog.gone.push(companion.defId);
  hero.companionLog.forgottenCount = Number(hero.companionLog.forgottenCount || 0) + 1;
  if (hero.party.activeId === id) hero.party.activeId = hero.companions[0]?.id || null;
}

// Between steps the companion mends like you do; in camp fully.
function mendCompanionStep(hero) {
  const companion = getActiveCompanion(hero);
  if (companion) companion.hpRatio = Math.min(1, Number(companion.hpRatio ?? 1) + 0.08);
}

function settleCompanionTrip(hero, outcome) {
  const companion = getActiveCompanion(hero);
  hero.companions?.forEach((c) => { c.hpRatio = 1; });
  if (!companion) return;
  if (outcome === "complete") addCompanionTrust(companion, 4, { trip: true });
  companion.tripTrust = 0;
}

// A road meeting built from the companion's own story. Freeing costs part of what the bag holds.
function buildRescueEvent(hero, exp) {
  const found = getRescueFor(hero, exp.regionId);
  if (!found || exp.step < 1 || exp.lairId) return null;
  const id = `rescue_${found.def.id}`;
  if (exp.seenEvents.includes(id) || !roll(0.45)) return null;
  const { def, rescue } = found;
  return {
    id, title: rescue.title, text: def.meet, companionId: def.id,
    options: [
      { label: rescue.free, hint: `+Свобода, −${Math.round(rescue.cost * 100)}% золота в сумке`, resolve: () => {
        const lost = Math.round(exp.bag.gold * rescue.cost);
        exp.bag.gold -= lost;
        const companion = recruitCompanion(hero, def.id, { rarity: rollCompanionRarity(def, exp.zoneKey) });
        changeKarma(hero, 8, id);
        return { text: `${def.join}${lost ? ` Из сумки ушло ${lost} золота.` : ""} ${def.name} теперь в лагере${companion ? `, ${COMPANION_RANKS[companion.rank].name.toLowerCase()}` : ""}.`, tone: "good", companion: def.id };
      } },
      { label: rescue.pass, hint: "Без последствий в пути", resolve: () => ({ text: "Ты идёшь дальше. За спиной ещё долго слышно, как кто-то зовёт.", tone: "neutral" }) }
    ]
  };
}
