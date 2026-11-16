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
  return hero.companions.find((c) => c.id === hero.party.activeId && c.formState !== "retired") || null;
}

// After the finale companions walk in working forms: a third fall in a row breaks the form, not the person.
function retireCompanionForm(hero, companion) {
  companion.formState = "retired";
  companion.fallStreak = 0;
  if (hero.party.activeId === companion.id) hero.party.activeId = hero.companions.find((c) => c.id !== companion.id && c.formState !== "retired")?.id || null;
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
  ensureCompanionSkills(companion);
  // People from the shelter come trusting a little more.
  if (legal === "free" && townBuilt(hero, "shelter")) companion.trust += 10;
  hero.companions.push(companion);
  hero.companionLog.met.push(defId);
  if (!hero.party.activeId) hero.party.activeId = companion.id;
  return companion;
}

function setActiveCompanion(hero, id) {
  ensureCompanionState(hero);
  if (hero.expedition) return { ok: false, reason: "Спутника меняют только в лагере." };
  if (id && !hero.companions.some((c) => c.id === id)) return { ok: false, reason: "Такого спутника нет." };
  if (id && hero.companions.find((c) => c.id === id)?.formState === "retired") return { ok: false, reason: "Рабочая форма разрушена: походы этого спутника закончились." };
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
  return townBuilt(hero, "slave_market") && !forgeShared(hero);
}

function getMarketOffers(hero) {
  ensureCompanionState(hero);
  if (!isMarketOpen(hero)) return [];
  const reached = REGIONS.filter((region, index) => index <= Number(hero.unlockedRegion || 0)).map((region) => region.id);
  const closed = Number(hero.karma || 0) <= -25;
  return Object.values(COMPANIONS)
    .filter((def) => def.ready && !def.noMarket && !COMPANION_ARRIVALS[def.id] && (reached.includes(def.region) || def.marketOnly) && !companionTaken(hero, def.id) && def.region !== "thicket")
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
  // Under the overseers' charter nobody comes to you of their own will.
  if (townBuilt(hero, "overseers") && !forgeShared(hero)) return null;
  const def = Object.values(COMPANIONS).find((entry) => entry.ready && !entry.marketOnly && entry.region === regionId && COMPANION_RESCUES[entry.id] && !companionTaken(hero, entry.id));
  return def ? { def, rescue: COMPANION_RESCUES[def.id] } : null;
}

// People who come to the camp themselves: Tessa after the Thicket's guardian, the others when the town is ready for them.
const COMPANION_ARRIVALS = {
  tessa: (hero) => hero.defeatedGuardians?.includes("greyfang"),
  ulya: (hero) => townBuilt(hero, "infirmary"),
  bran: (hero) => townBuilt(hero, "crossing"),
  asya: (hero) => townBuilt(hero, "shelter") && Number(hero.karma || 0) >= 25 && Number(hero.unlockedRegion || 0) >= 2,
  til: (hero) => townBuilt(hero, "shelter") && Number(hero.karma || 0) >= 60 && Number(hero.unlockedRegion || 0) >= 3,
  skar: (hero) => townBuilt(hero, "overseers") && !forgeShared(hero)
};

function getPendingMeeting(hero) {
  ensureCompanionState(hero);
  const id = Object.keys(COMPANION_ARRIVALS).find((defId) => !companionTaken(hero, defId) && COMPANIONS[defId]?.ready && COMPANION_ARRIVALS[defId](hero));
  return id ? COMPANIONS[id] : null;
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
  const lateBoost = 1 + Math.max(0, level - 20) * 0.018;
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

// The fight itself lives in js/core/companion-battle.js.

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
  if (companion) companion.hpRatio = Math.min(1, Number(companion.hpRatio ?? 1) + (townBuilt(hero, "infirmary") ? 0.23 : 0.08));
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
  if (exp.seenEvents.includes(id) || !roll(townBuilt(hero, "shelter") ? 0.7 : 0.45)) return null;
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

// ---------- personal matters and gifts ----------
function companionQuestState(companion) {
  const quest = COMPANION_QUESTS[companion.defId];
  if (!quest) return { available: false };
  if (companion.quest?.done) return { available: false, done: true, quest, result: quest.options[companion.quest.choice]?.result || "" };
  if (companion.legal === "contract") return { available: false, quest, reason: "Тот, кто держится договором, не делится своим." };
  if (companion.trust < 60) return { available: false, quest, reason: "Откроется при доверии 60." };
  return { available: true, quest };
}

// What an answer to a personal matter really costs: base gold plus a part per hero level.
function companionQuestCost(hero, option) {
  const cost = option?.cost;
  if (!cost) return 0;
  return Math.round(Number(cost.gold || 0) + Number(cost.perLevel || 0) * Number(hero.level || 1));
}

function settleCompanionQuest(hero, id, choice) {
  const companion = hero.companions.find((c) => c.id === id);
  if (!companion) return { ok: false, reason: "Такого спутника нет." };
  const state = companionQuestState(companion);
  if (!state.available) return { ok: false, reason: state.reason || "Это дело уже закрыто." };
  const option = state.quest.options[choice];
  if (!option) return { ok: false, reason: "Такого решения нет." };
  const gold = companionQuestCost(hero, option);
  if (hero.gold < gold) return { ok: false, reason: `Нужно ${gold} золота, у тебя ${hero.gold}.` };
  hero.gold -= gold;
  companion.quest = { done: true, choice };
  const trust = 5 + Number(option.trust || 0);
  addCompanionTrust(companion, trust);
  return { ok: true, result: option.result, gold, trust };
}

function companionGiftName(companion) {
  return COMPANIONS[companion.defId]?.gift || COMPANION_GIFTS[companion.defId] || null;
}

function companionGiftPrice(hero) {
  return 200 + Number(hero.level || 1) * 12;
}

function giveCompanionGift(hero, id) {
  const companion = hero.companions.find((c) => c.id === id);
  if (!companion || !companionGiftName(companion)) return { ok: false, reason: "Подарить нечего." };
  if (companion.gifted) return { ok: false, reason: "Подарок уже вручён." };
  const price = companionGiftPrice(hero);
  if (hero.gold < price) return { ok: false, reason: `Нужно ${price} золота.` };
  hero.gold -= price;
  companion.gifted = true;
  addCompanionTrust(companion, 5);
  return { ok: true, name: companionGiftName(companion) };
}
