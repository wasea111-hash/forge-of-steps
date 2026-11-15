// Local save storage and migration from the old prototype. Storage is injected so tests can run without a browser.
const SAVE_KEY = "forge-of-steps-save-v2";
const LEGACY_ACCOUNTS_KEY = "forge-of-steps-accounts-v1";
const LEGACY_SAVES_KEY = "forge-of-steps-character-saves-v1";
const LEGACY_SESSION_KEY = "forge-of-steps-session-v1";
const LEGACY_PROFILE_KEY = "forge-of-steps-profile-v1";
const DEFAULT_SETTINGS = { sound: true, volume: 0.6, music: 0.5, ambience: 0.3, battleSpeed: 1, reducedMotion: false, tips: {} };
const SAVED_HERO_FIELDS = [
  "id", "name", "classKey", "className", "subclass", "profession", "level", "experience", "statPoints", "skillPoints", "gold", "mutationShards",
  "resources", "potions", "stats", "startingStats", "inventory", "equipment", "knownSkillIds", "passiveIds", "activeSkillSlots", "skillProgress", "shopPassiveIds", "shopActive", "talents", "talentVersion", "talentsExchanged",
  "skillForms", "skillPicks", "styleId", "ultimateId", "ultimateSeen", "buildVersion", "freeRespec", "story", "unlockedRegion", "trailClears", "lairTokens", "lairTokenLevels", "lairClears", "lairBest", "defeatedGuardians", "won", "records", "expedition", "shop", "createdAt", "updatedAt", "currentHp", "currentMana",
  "companions", "party", "karma", "companionLog", "town"
];

function getStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function createEmptySave() {
  return { version: 2, activeId: null, heroes: {}, settings: { ...DEFAULT_SETTINGS, tips: {} } };
}

// A hero from before trails opened in order keeps everything behind bosses already beaten.
function migrateTrailClears(raw) {
  if (raw.trailClears && typeof raw.trailClears === "object") return raw.trailClears;
  const clears = {};
  REGIONS.forEach((region) => { if ((raw.defeatedGuardians || []).includes(region.guardian)) clears[region.id] = [...ZONE_KEYS]; });
  return clears;
}

const safeNumber = (value, fallback = 0) => { const number = Number(value); return Number.isFinite(number) ? number : fallback; };
const safeList = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// A road from a broken save is dropped rather than walked: the hero simply stands in the camp.
function normalizeExpedition(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!REGIONS.some((region) => region.id === raw.regionId) || !ZONES[raw.zoneKey]) return null;
  if (raw.lairId !== undefined && raw.lairId !== null && !LAIR_CATALOG[raw.lairId]) return null;
  const bag = safeObject(raw.bag);
  const exp = {
    ...raw,
    steps: Math.max(1, safeNumber(raw.steps, ZONES[raw.zoneKey].steps)),
    step: Math.max(0, safeNumber(raw.step)),
    path: safeList(raw.path),
    damageBonus: safeNumber(raw.damageBonus),
    seenEvents: safeList(raw.seenEvents),
    boons: safeList(raw.boons),
    pendingBoons: Array.isArray(raw.pendingBoons) ? raw.pendingBoons : null,
    bag: { gold: Math.max(0, safeNumber(bag.gold)), items: safeList(bag.items), resources: safeObject(bag.resources), shards: Math.max(0, safeNumber(bag.shards)), kills: Math.max(0, safeNumber(bag.kills)), exp: Math.max(0, safeNumber(bag.exp)) }
  };
  exp.pending = raw.pending && typeof raw.pending === "object" ? raw.pending : null;
  exp.weather = ["rain", "ash", "mist", "shards"].includes(raw.weather) || raw.weather === null ? raw.weather : undefined;
  // step === steps means the last fight was won and only the closing summary is left.
  if (exp.step > exp.steps) exp.step = exp.steps;
  exp.choices = safeList(raw.choices).filter((choice) => choice?.type);
  if (!exp.choices.length) generateChoices(exp);
  return exp;
}

// Companions from a save: only known people with sane numbers survive.
function normalizeCompanions(list) {
  return safeList(list).filter((c) => c && COMPANIONS[c.defId]?.ready && typeof c.id === "string").map((c) => ({
    id: c.id, defId: c.defId, rarity: COMPANION_RARITIES.includes(c.rarity) ? c.rarity : COMPANIONS[c.defId].rarities[0],
    legal: c.legal === "contract" ? "contract" : "free", source: typeof c.source === "string" ? c.source : "road",
    rank: clamp(Math.round(safeNumber(c.rank)), 0, COMPANION_RANKS.length - 1),
    trust: clamp(safeNumber(c.trust), 0, c.legal === "contract" ? 39 : 100), tripTrust: clamp(safeNumber(c.tripTrust), 0, 10),
    deeds: Math.max(0, Math.round(safeNumber(c.deeds))), hpRatio: clamp(safeNumber(c.hpRatio, 1), 0.05, 1),
    fallStreak: clamp(Math.round(safeNumber(c.fallStreak)), 0, COMPANION_FALLS_TO_FORGET - 1),
    recent: safeList(c.recent).filter((entry) => entry && typeof entry === "object").slice(-12),
    habits: safeList(c.habits).filter((id) => COMPANION_HABITS[id]).slice(0, 2),
    memories: safeList(c.memories).filter((n) => Number.isInteger(n) && n >= 0 && n < 3), metAt: safeNumber(c.metAt, 1),
    learned: safeList(c.learned).filter((id) => COMPANION_SKILL_BY_ID[id]?.who === c.defId),
    deedKinds: Object.fromEntries(Object.entries(safeObject(c.deedKinds)).filter(([kind]) => COMPANION_DEEDS[kind]).map(([kind, n]) => [kind, Math.max(0, Math.round(safeNumber(n)))])),
    control: c.control === "auto" ? "auto" : "manual",
    ...(Number.isInteger(c.prepared) ? { prepared: c.prepared } : {})
  })).map(ensureCompanionSkills);
}

function normalizeHero(raw) {
  raw = { ...raw, expedition: normalizeExpedition(raw.expedition) };
  const classKey = classDefinitions[raw.classKey] ? raw.classKey : "warrior";
  const level = Math.max(1, Math.floor(safeNumber(raw.level, 1)));
  const branch = normalizeBranchSelection(classKey, raw.subclass, raw.profession);
  if (level < PROFESSION_UNLOCK_LEVEL) branch.profession = null;
  if (level < SUBCLASS_UNLOCK_LEVEL) branch.subclass = null;
  // Skills whose level gate moved up are returned to the player as skill points.
  const starters = getFreeStarterSkillIds(classKey);
  const stored = normalizeSkillIdList([...starters, ...safeList(raw.knownSkillIds), ...safeList(raw.passiveIds)]);
  const known = stored.filter((id) => starters.includes(id) || Number(getSkillDefinition(id).unlockLevel || 1) <= level);
  const refunded = stored.length - known.length;
  const slots = Array.from({ length: ACTIVE_SKILL_SLOTS }, (_, i) => {
    const id = safeList(raw.activeSkillSlots)[i] || null;
    return known.includes(id) && getSkillDefinition(id)?.category === "active" ? id : null;
  });
  const progress = {};
  Object.entries(safeObject(raw.skillProgress)).forEach(([id, entry]) => {
    if (getSkillDefinition(id)?.category !== "active") return;
    const entryLevel = clamp(Math.floor(safeNumber(entry?.level, 1)), 1, SKILL_MAX_LEVEL);
    progress[id] = { level: entryLevel, exp: Math.max(0, safeNumber(entry?.exp)), expToNext: getSkillExpToNextLevel(entryLevel), bonusChoice: typeof entry?.bonusChoice === "string" ? entry.bonusChoice : null, mutation: MUTATIONS[entry?.mutation] ? entry.mutation : null };
  });
  const rawRecords = safeObject(raw.records);
  const records = { ...rawRecords, bestiary: safeObject(rawRecords.bestiary) };
  ["kills", "bosses", "elites", "expeditions", "completed", "deaths", "maxHit"].forEach((key) => { records[key] = Math.max(0, safeNumber(rawRecords[key])); });
  // The shop was rebuilt: purchases from older versions turn back into gold, so nothing silently changes meaning.
  const oldShop = Boolean(raw.talentVersion) && raw.talentVersion < TALENT_VERSION;
  const shopRefund = oldShop ? safeList(raw.shopPassiveIds).length * 400 : 0;
  const hero = {
    id: raw.id || uid("hero"),
    name: String(raw.name || "Странник").slice(0, 24),
    classKey, className: classDefinitions[classKey].name,
    subclass: branch.subclass, profession: branch.profession,
    level, experience: Math.max(0, safeNumber(raw.experience)),
    statPoints: Math.max(0, safeNumber(raw.statPoints)), skillPoints: Math.max(0, safeNumber(raw.skillPoints)) + refunded,
    gold: Math.max(0, Math.round(safeNumber(raw.gold))) + shopRefund, mutationShards: Math.max(0, safeNumber(raw.mutationShards)),
    resources: { ...createEmptyResources(), ...Object.fromEntries(Object.entries(safeObject(raw.resources)).map(([id, value]) => [id, Math.max(0, safeNumber(value))])) },
    potions: { hp: Math.max(0, safeNumber(raw.potions?.hp, 2)), mp: Math.max(0, safeNumber(raw.potions?.mp, 1)) },
    stats: createStatBlock(raw.stats || classDefinitions[classKey].stats),
    startingStats: createStatBlock(raw.startingStats || raw.meta?.startingStats || raw.stats || classDefinitions[classKey].stats),
    inventory: Array.from({ length: INVENTORY_SIZE }, (_, i) => normalizeItem(safeList(raw.inventory)[i] || null)),
    equipment: Object.fromEntries(Object.keys(EQUIPMENT_SLOT_TEMPLATE).map((key) => [key, normalizeItem(safeObject(raw.equipment)[key] || null)])),
    knownSkillIds: known,
    passiveIds: normalizeSkillIdList(known, "passive"),
    activeSkillSlots: slots,
    skillProgress: progress,
    shopPassiveIds: oldShop ? [] : safeList(raw.shopPassiveIds).filter((id) => getShopPassiveDefinition(id)),
    shopActive: oldShop ? [] : Array.isArray(raw.shopActive) ? raw.shopActive.filter((id) => getShopPassiveDefinition(id)) : safeList(raw.shopPassiveIds).filter((id) => getShopPassiveDefinition(id)),
    // The tree was rebuilt in this version: earlier choices are refunded instead of silently changing meaning.
    talents: raw.talentVersion === TALENT_VERSION ? safeList(raw.talents).filter((id) => TALENTS[id]) : [], talentVersion: TALENT_VERSION, talentsExchanged: Math.max(0, safeNumber(raw.talentsExchanged)),
    unlockedRegion: clamp(safeNumber(raw.unlockedRegion), 0, REGIONS.length - 1),
    trailClears: migrateTrailClears(raw),
    lairTokens: raw.lairTokens && typeof raw.lairTokens === "object" ? raw.lairTokens : {},
    lairTokenLevels: Object.fromEntries(Object.entries(safeObject(raw.lairTokenLevels)).filter(([id]) => LAIR_CATALOG[id]).map(([id, list]) => [id, safeList(list).map(Number).filter(Number.isFinite)])),
    lairClears: raw.lairClears && typeof raw.lairClears === "object" ? raw.lairClears : {},
    lairBest: raw.lairBest && typeof raw.lairBest === "object" ? raw.lairBest : {},
    story: migrateStory(raw),
    skillForms: raw.skillForms && typeof raw.skillForms === "object" ? raw.skillForms : {},
    skillPicks: raw.skillPicks && typeof raw.skillPicks === "object" ? raw.skillPicks : {},
    styleId: raw.styleId || null,
    ultimateId: raw.ultimateId || null,
    ultimateSeen: Array.isArray(raw.ultimateSeen) ? raw.ultimateSeen : [],
    // A hero from before the new tree gets one free rebuild.
    buildVersion: BUILD_VERSION,
    freeRespec: raw.buildVersion === BUILD_VERSION ? Boolean(raw.freeRespec) : true,
    defeatedGuardians: Array.isArray(raw.defeatedGuardians) ? raw.defeatedGuardians.filter((id) => ENEMY_DEFINITIONS[id]) : [],
    won: Boolean(raw.won), records,
    expedition: raw.expedition || null,
    shop: raw.shop && typeof raw.shop === "object" ? { stock: safeList(raw.shop.stock).map(normalizeItem).filter(Boolean), expeditionsAtRefresh: safeNumber(raw.shop.expeditionsAtRefresh) } : null,
    createdAt: raw.createdAt || raw.meta?.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now(),
    effects: [], summonedUnits: [], cooldowns: {},
    currentHp: raw.currentHp, currentMana: raw.currentMana,
    companions: normalizeCompanions(raw.companions),
    party: safeObject(raw.party), karma: clamp(safeNumber(raw.karma), -KARMA_LIMIT, KARMA_LIMIT), companionLog: safeObject(raw.companionLog),
    town: normalizeTown(raw.town)
  };
  ensureCompanionState(hero);
  // Old talents stay only if they fit the new board and the new budget; otherwise the board starts clean.
  if (getTalentBoard(hero).length) {
    if (raw.buildVersion !== BUILD_VERSION) hero.talents = hero.talents.filter((id) => findBoardSlot(hero, id));
    if (getDevPointsFree(hero) < 0) hero.talents = [];
    if (getDevPointsFree(hero) < 0) hero.skillForms = {};
  }
  // A lair walked under the old rules (packs on the way) becomes one fight with its master.
  Object.entries(hero.lairClears).forEach(([id, count]) => { if (count > 0 && LAIR_CATALOG[id] && !hero.lairBest[id]) hero.lairBest[id] = LAIR_CATALOG[id].level; });
  if (hero.expedition?.lairId) {
    hero.expedition.steps = 1;
    hero.expedition.step = 0;
    hero.expedition.pending = null;
    hero.expedition.choices = lairChoices(hero.expedition);
  }
  if (hero.expedition) {
    hero.expedition.bag.items = hero.expedition.bag.items.map(normalizeItem).filter(Boolean);
  }
  applyDerivedStats(hero, !(Number.isFinite(hero.currentHp) && hero.expedition));
  if (Number.isFinite(raw.currentHp) && hero.expedition) {
    hero.currentHp = clamp(raw.currentHp, 1, hero.maxHp);
    hero.currentMana = clamp(Number(raw.currentMana ?? hero.maxMana), 0, hero.maxMana);
  }
  // The page was closed right after a choice on the road: the step counts, the choice is not offered again.
  if (hero.expedition?.eventResolved) {
    hero.expedition.eventResolved = false;
    completeStep(hero, hero.expedition);
  }
  return hero;
}

// Converts one save of the old prototype. Old characters get the skill points the new, faster schedule would have given.
function migrateLegacyCharacter(legacy) {
  const level = Math.max(1, Number(legacy.level || 1));
  const extraSkillPoints = Math.max(0, Math.floor(level / SKILL_POINT_LEVEL_INTERVAL) - Math.floor(level / 3));
  return normalizeHero({
    ...legacy,
    id: undefined,
    skillPoints: Number(legacy.skillPoints || 0) + extraSkillPoints,
    createdAt: legacy.meta?.createdAt,
    updatedAt: legacy.meta?.updatedAt
  });
}

function safeParse(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function migrateLegacyStorage(storage, save) {
  const legacySaves = safeParse(storage.getItem(LEGACY_SAVES_KEY), null);
  let migrated = 0;
  if (legacySaves && typeof legacySaves === "object" && !storage.getItem(`${LEGACY_SAVES_KEY}-migrated`)) {
    Object.values(legacySaves).forEach((legacy) => {
      if (!legacy?.classKey) return;
      const hero = migrateLegacyCharacter(legacy);
      save.heroes[hero.id] = serializeHero(hero);
      save.activeId = save.activeId || hero.id;
      migrated += 1;
    });
    storage.setItem(`${LEGACY_SAVES_KEY}-migrated`, "1");
  }
  // The old build kept plaintext passwords in these records. They are not used any more, so they should not stay on disk.
  [LEGACY_ACCOUNTS_KEY, LEGACY_SESSION_KEY, LEGACY_PROFILE_KEY].forEach((key) => storage.removeItem(key));
  return migrated;
}

function loadSave(storage = getStorage()) {
  if (!storage) return createEmptySave();
  const save = { ...createEmptySave(), ...safeParse(storage.getItem(SAVE_KEY), {}) };
  save.settings = { ...DEFAULT_SETTINGS, ...(save.settings || {}), tips: { ...(save.settings?.tips || {}) } };
  save.heroes = save.heroes && typeof save.heroes === "object" ? save.heroes : {};
  if (migrateLegacyStorage(storage, save) > 0) writeSave(save, storage);
  return save;
}

function writeSave(save, storage = getStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    return false;
  }
}

function serializeHero(hero) {
  const data = Object.fromEntries(SAVED_HERO_FIELDS.map((key) => [key, hero[key]]));
  data.updatedAt = Date.now();
  return JSON.parse(JSON.stringify(data));
}

function exportSaveText(save) {
  return JSON.stringify(save, null, 2);
}

function importSaveText(text) {
  const parsed = safeParse(text, null);
  if (!parsed || typeof parsed !== "object" || !parsed.heroes || typeof parsed.heroes !== "object") return null;
  const heroes = {};
  Object.values(parsed.heroes).forEach((raw) => {
    if (!raw?.classKey) return;
    try {
      const hero = normalizeHero(raw);
      heroes[hero.id] = serializeHero(hero);
    } catch (error) { /* One hopeless hero should not cost the others. */ }
  });
  return { ...createEmptySave(), activeId: heroes[parsed.activeId] ? parsed.activeId : Object.keys(heroes)[0] || null, heroes, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } };
}
