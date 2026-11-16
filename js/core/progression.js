// Gradual opening of the camp: places, forge modes and shop tabs appear when they start to matter.
// An opened feature stays open forever. Heroes from before this system (no progress field) keep everything.
const PROGRESS_VERSION = 1;

const cleared = (hero, regionId, zoneKey) => (hero.trailClears?.[regionId] || []).includes(zoneKey);
const clearedAnyWhite = (hero) => Object.values(hero.trailClears || {}).some((list) => list.includes("white"));
const beat = (hero, id) => (hero.defeatedGuardians || []).includes(id);
const seen = (hero, key) => Boolean(hero.progress?.events?.[key]);

// place: the camp place that lights up; who/line: the one line said once when it opens.
const FEATURES = {
  shop: { name: "Лавка Мота", place: "shop", who: "Мот", line: "Принеси добычу. Подберём то, чего тебе недостаёт.", test: (h) => clearedAnyWhite(h) },
  potions: { name: "Навес Нимы", place: "healer", who: "Нима", line: "Запас зелий лучше пополнять перед дорогой.", test: (h) => clearedAnyWhite(h) || seen(h, "potionUsed") },
  journal: { name: "Палатка Соты", place: "journal", who: "Сота", line: "Первый след записан. Здесь будет твоя дорога.", test: (h) => clearedAnyWhite(h) },
  talents: { name: "Таланты", place: "skills", who: "Вея", line: "Теперь выбери, что станет твоей сильной стороной.", test: (h) => h.level >= 6 && cleared(h, "thicket", "green") },
  forge: { name: "Кузница Керна", place: "forge", who: "Керн", line: "Эту вещь уже стоит точить. Положи её на наковальню.", test: (h) => cleared(h, "thicket", "green") && (seen(h, "orange") || h.level >= 10) },
  dismantle: { name: "Разбор", place: "forge", mode: "dismantle", who: "Керн", line: "Лишнее железо пригодится для следующей заточки.", test: (h) => h.level >= 10 && featureOpen(h, "forge") },
  mutate: { name: "Мутации", place: "forge", mode: "mutate", who: "Керн", line: "Осколок мутации меняет природу освоенного приёма.", test: (h) => seen(h, "shard") && featureOpen(h, "forge") },
  reforge: { name: "Перековка", place: "forge", mode: "reforge", who: "Керн", line: "Осколок позволит заново вытянуть свойства вещи.", test: (h) => h.level >= 18 && seen(h, "shard") && featureOpen(h, "forge") },
  ascend: { name: "Возвышение", place: "forge", mode: "ascend", who: "Керн", line: "Реликвия может расти вместе с тобой.", test: (h) => seen(h, "relic") && featureOpen(h, "forge") },
  materials: { name: "Материалы", place: "shop", shopTab: "materials", who: "Мот", line: "Для заточки нужна руда. У меня найдётся.", test: (h) => featureOpen(h, "forge") && featureOpen(h, "shop") },
  shopSkills: { name: "Умения в лавке", place: "shop", shopTab: "passives", who: "Мот", line: "Теперь могу предложить умения под твой способ боя.", test: (h) => h.level >= 20 && beat(h, "greyfang") && featureOpen(h, "shop") },
  lairs: { name: "Камень логов", place: "lairs", who: "Вея", line: "Под дорогой остались хозяева. Теперь можно искать их след.", test: (h) => beat(h, "greyfang") && Number(h.records?.expeditions || 0) > Number(h.progress?.events?.greyfangTrips ?? Infinity) }
};
const FEATURE_ORDER = Object.keys(FEATURES);
const FORGE_MODE_FEATURE = { enhance: "forge", dismantle: "dismantle", reforge: "reforge", ascend: "ascend", mutate: "mutate" };
const SHOP_TAB_FEATURE = { gear: "shop", potions: "potions", materials: "materials", passives: "shopSkills" };
const PLACE_FEATURE = { shop: "shop", healer: "potions", journal: "journal", forge: "forge", lairs: "lairs" };
const TAB_FEATURE = { shop: "shop", journal: "journal", forge: "forge", lairs: "lairs", talents: "talents" };

function newProgress() {
  return { v: PROGRESS_VERSION, open: [], told: [], events: {} };
}

function normalizeProgress(raw) {
  // A hero saved before gradual opening keeps every place and mode it could already use.
  if (!raw || typeof raw !== "object") return { v: PROGRESS_VERSION, legacy: true, open: [], told: [], events: {} };
  return {
    v: PROGRESS_VERSION, legacy: Boolean(raw.legacy),
    open: Array.isArray(raw.open) ? raw.open.filter((id) => FEATURES[id]) : [],
    told: Array.isArray(raw.told) ? raw.told.filter((id) => FEATURES[id]) : [],
    events: raw.events && typeof raw.events === "object" ? { ...raw.events } : {}
  };
}

function featureOpen(hero, id) {
  const progress = hero?.progress;
  if (!progress || progress.legacy || !FEATURES[id]) return true;
  return progress.open.includes(id);
}

// Remembers what was ever found (so a sold item still counts), then opens what is due. Returns the newly opened ids.
function syncProgression(hero) {
  if (!hero) return [];
  if (!hero.progress) hero.progress = normalizeProgress(null);
  const progress = hero.progress;
  if (progress.legacy) return [];
  const events = progress.events;
  const items = [...Object.values(hero.equipment || {}), ...(hero.inventory || []), ...(hero.expedition?.bag?.items || [])].filter(Boolean);
  const rank = { orange: 2, purple: 3, red: 4, relic: 5 };
  if (items.some((item) => (rank[item.rarity] || 0) >= 2)) events.orange = true;
  if (items.some((item) => item.rarity === "relic")) events.relic = true;
  if (Number(hero.mutationShards || 0) > 0) events.shard = true;
  if (beat(hero, "greyfang") && events.greyfangTrips === undefined) events.greyfangTrips = Number(hero.records?.expeditions || 0);
  const opened = [];
  // Several passes: one opening can be the condition of the next.
  for (let pass = 0; pass < 3; pass += 1) {
    FEATURE_ORDER.forEach((id) => {
      if (progress.open.includes(id) || !FEATURES[id].test(hero)) return;
      progress.open.push(id);
      opened.push(id);
    });
  }
  return opened;
}

function markProgressEvent(hero, key) {
  if (!hero?.progress || hero.progress.legacy) return;
  hero.progress.events[key] = true;
}

// The one opening the camp talks about now: the oldest one not yet told.
function featureToTell(hero) {
  const progress = hero?.progress;
  if (!progress || progress.legacy) return null;
  const id = progress.open.find((entry) => !progress.told.includes(entry));
  return id ? { id, ...FEATURES[id] } : null;
}

function acknowledgeFeature(hero, id) {
  const progress = hero?.progress;
  if (!progress || progress.legacy || progress.told.includes(id)) return false;
  progress.told.push(id);
  return true;
}

// Is this camp place visible at all, and is it the one lit up now?
function campPlaceOpen(hero, placeId) {
  const id = PLACE_FEATURE[placeId];
  return !id || featureOpen(hero, id);
}

function hubTabOpen(hero, tab) {
  if (tab === "shop") return featureOpen(hero, "shop") || featureOpen(hero, "potions");
  const id = TAB_FEATURE[tab];
  return !id || featureOpen(hero, id);
}
