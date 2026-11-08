// Shared pure helpers. The game logic in js/core never touches the DOM, so it also runs in Node for tests and simulations.
let rngFn = Math.random;

function setRng(fn) {
  rngFn = fn || Math.random;
}

function rand() {
  return rngFn();
}

function roll(chance) {
  return rand() < chance;
}

function randomInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomFrom(list) {
  return list[Math.floor(rand() * list.length)];
}

function weightedPick(entries, weightOf = (entry) => entry.weight) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, weightOf(entry)), 0);
  let cursor = rand() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, weightOf(entry));
    if (cursor <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percent(value, total) {
  return total <= 0 ? 0 : clamp((value / total) * 100, 0, 100);
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Russian plural: plural(3, ["ход", "хода", "ходов"]) -> "хода"
function plural(count, forms) {
  const n = Math.abs(Number(count)) % 100;
  const m = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (m > 1 && m < 5) return forms[1];
  return m === 1 ? forms[0] : forms[2];
}

function turnsLabel(count) {
  return `${count} ${plural(count, ["ход", "хода", "ходов"])}`;
}

function createKeyedNumberMap(keys, overrides = {}) {
  return Object.fromEntries(keys.map((key) => [key, Number(overrides?.[key] || 0)]));
}

function createStatBlock(overrides = {}) {
  return createKeyedNumberMap(STAT_KEYS, overrides);
}

function createFlatBonusBlock(overrides = {}) {
  return createKeyedNumberMap(FLAT_BONUS_KEYS, overrides);
}

function createDerivedBonusBlock(overrides = {}) {
  return createKeyedNumberMap(DERIVED_BONUS_KEYS, overrides);
}

function statLabel(key) {
  return { intellect: "Интеллект", endurance: "Выносливость", strength: "Сила", luck: "Удача", agility: "Ловкость", spirituality: "Духовность" }[key] || key;
}

function flatBonusLabel(key) {
  return {
    maxHp: "здоровье", maxMana: "мана", physicalDamage: "физ. урон", skillDamage: "маг. урон",
    physicalDefense: "физ. защита", magicDefense: "маг. защита", shieldPower: "сила щитов", healingPower: "сила лечения",
    critChance: "крит", dropChance: "шанс добычи", dropQuality: "качество добычи", dodgeChance: "уклонение", attackSpeed: "скорость"
  }[key] || key;
}

function isPercentStat(key) {
  return ["critChance", "dropChance", "dodgeChance"].includes(key);
}

function slotTypeLabel(slotType) {
  return { ring: "Кольцо", bracelet: "Браслет", necklace: "Ожерелье", head: "Шлем", chest: "Доспех", legs: "Поножи", boots: "Сапоги", weapon: "Оружие" }[slotType] || slotType;
}

const STATUS_EFFECT_DEFINITIONS = {
  poison: { id: "poison", type: "damage_over_time", tone: "bad", name: "Яд", description: "Медленная смерть. Идёт мимо щитов, с каждым тиком сильнее на 20% и работает, даже если цель оглушена. Отравленный хуже лечится." },
  burn: { id: "burn", type: "damage_over_time", tone: "bad", name: "Горение", description: "Наносит урон огнём в конце хода. Сила растёт со стаками, а при полном наборе стаков пламя детонирует." },
  bleed: { id: "bleed", type: "damage_over_time", tone: "bad", name: "Кровотечение", description: "Быстрая рана. Срабатывает, только когда цель действует, тяжёлый удар вскрывает её вдвое. Затухает на 25% за раз и упирается в щит. Твой крит вскрывает рану сразу. Новые раны складываются." },
  frost: { id: "frost", type: "debuff", tone: "bad", name: "Иней", ratio: true, description: "Замедляет цель: она реже получает ход." },
  frostbite: { id: "frostbite", type: "debuff", tone: "bad", name: "Обморожение", description: "По цели проще попасть критом. Когда обморожение спадает, цель ещё замедлена." },
  freeze: { id: "freeze", type: "control", tone: "bad", name: "Заморозка", description: "Цель скована льдом и пропускает ход." },
  stagger: { id: "stagger", type: "debuff", tone: "bad", ratio: true, name: "Ошеломление", description: "Цель бьёт слабее, но продолжает действовать." },
  corruption: { id: "corruption", type: "damage_over_time", tone: "bad", name: "Порча", description: "Магический урон каждый ход. Каждый тик разъедает магическую защиту." },
  stun: { id: "stun", type: "control", tone: "bad", name: "Оглушение", description: "Цель пропускает ход и теряет подготовленный тяжёлый удар." },
  silence: { id: "silence", type: "control", tone: "bad", name: "Немота", description: "Цель не может применять навыки." },
  weaken: { id: "weaken", type: "debuff", tone: "bad", ratio: true, name: "Слабость", description: "Снижает наносимый целью урон." },
  mark: { id: "mark", type: "debuff", tone: "bad", ratio: true, name: "Метка", description: "Цель получает больше урона." },
  armor_break: { id: "armor_break", type: "debuff", tone: "bad", ratio: true, name: "Пробитая броня", description: "Защита цели снижена." },
  shield: { id: "shield", type: "buff", tone: "good", name: "Щит", description: "Поглощает входящий урон, пока не иссякнет или не спадёт." },
  regeneration: { id: "regeneration", type: "heal_over_time", tone: "good", name: "Регенерация", description: "Восстанавливает здоровье в конце каждого хода." },
  dark_fury: { id: "dark_fury", type: "buff", tone: "good", ratio: true, name: "Тёмный экстаз", description: "Усиливает весь наносимый урон." },
  rage: { id: "rage", type: "buff", tone: "good", ratio: true, name: "Ярость", description: "Усиливает весь наносимый урон." },
  haste: { id: "haste", type: "buff", tone: "good", ratio: true, name: "Ускорение", description: "Цель чаще получает ход." },
  evasion: { id: "evasion", type: "buff", tone: "good", ratio: true, name: "Увёртливость", description: "Повышает шанс уклонения." },
  fortify: { id: "fortify", type: "buff", tone: "good", ratio: true, name: "Закалка", description: "Снижает получаемый урон." },
  thorns: { id: "thorns", type: "buff", tone: "good", ratio: true, name: "Шипы", description: "Возвращает часть полученного удара обратно нападающему." }
};
