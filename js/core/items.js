// Item generation, comparison, equipping and the shop.
const RARITY_CONFIG = {
  white: { label: "Обычный", multiplier: 1, affixes: 0, index: 0 },
  green: { label: "Зелёный", multiplier: 1.25, affixes: 1, index: 1 },
  orange: { label: "Оранжевый", multiplier: 1.6, affixes: 2, index: 2 },
  purple: { label: "Фиолетовый", multiplier: 2, affixes: 3, index: 3 },
  red: { label: "Красный", multiplier: 2.5, affixes: 3, index: 4 },
  relic: { label: "Реликтовый", multiplier: 3.1, affixes: 3, index: 5 }
};

const CLASS_STAT_FOCUS = {
  warrior: { strength: 1, endurance: 0.8, luck: 0.3, agility: 0.3, spirituality: 0.2, intellect: 0.05 },
  mage: { intellect: 1, spirituality: 0.7, endurance: 0.5, agility: 0.25, luck: 0.25, strength: 0.02 },
  archer: { agility: 1, strength: 0.75, luck: 0.7, endurance: 0.5, spirituality: 0.1, intellect: 0.05 },
  bard: { spirituality: 0.8, intellect: 0.9, luck: 0.7, endurance: 0.55, agility: 0.3, strength: 0.05 },
  assassin: { strength: 1, agility: 0.85, luck: 0.6, endurance: 0.45, spirituality: 0.05, intellect: 0.05 }
};
const FLAT_STAT_VALUE = { maxHp: 0.06, maxMana: 0.03, physicalDamage: 0.4, skillDamage: 0.4, physicalDefense: 0.3, magicDefense: 0.3, shieldPower: 0.12, healingPower: 0.15, critChance: 0.5, dodgeChance: 0.5, attackSpeed: 0.3 };

function itemScale(level, rarity) {
  return RARITY_CONFIG[rarity].multiplier * (1 + Math.max(0, level - 1) * 0.055);
}

// Saved things follow the renamed weapons: all numbers stay, only the words change.
function migrateItemNames(raw) {
  const rename = WEAPON_RENAMES[raw.blueprint];
  const affixes = (raw.affixes || []).map((affix) => (affix.id === "pdmg" && affix.suffix === "клинка" ? { ...affix, suffix: "натиска" } : affix));
  let name = String(raw.name || "");
  if (rename) name = name.replace(raw.blueprint, rename.name);
  if (affixes.some((affix, index) => affix !== raw.affixes[index])) name = name.replace(/ клинка$/, " натиска");
  return { ...raw, name, affixes, blueprint: rename ? rename.name : raw.blueprint, weapon: rename?.weapon || raw.weapon };
}

function normalizeItem(source) {
  if (!source) return null;
  const raw = migrateItemNames(source);
  const rarity = RARITY_CONFIG[raw.rarity] ? raw.rarity : "white";
  const level = Math.max(1, Number(raw.itemLevel || raw.requiredLevel || 1));
  return {
    id: raw.id || uid("item"),
    name: String(raw.name || "Неизвестный предмет"),
    slotType: raw.slotType || "ring",
    weapon: raw.weapon || null,
    rarity,
    itemLevel: level,
    requiredLevel: Math.max(1, Number(raw.requiredLevel || 1)),
    bonuses: createStatBlock(raw.bonuses),
    flatBonuses: createFlatBonusBlock(raw.flatBonuses),
    affixes: Array.isArray(raw.affixes) ? [...raw.affixes] : [],
    trait: LEGENDARY_TRAITS[raw.trait] ? raw.trait : null,
    setId: SET_CATALOG[raw.setId] ? raw.setId : null,
    enhanceLevel: clamp(Number(raw.enhanceLevel || 0), 0, MAX_ENHANCE),
    fromTrail: Boolean(raw.fromTrail),
    value: Math.max(1, Number(raw.value || 10)),
    blueprint: raw.blueprint || null
  };
}

function statFitWeight(classKey, stats) {
  const focus = CLASS_STAT_FOCUS[classKey];
  if (!focus) return 1;
  return Object.entries(stats || {}).reduce((sum, [key, value]) => sum + (focus[key] || 0) * Number(value || 0), 0) / Math.max(1, Object.values(stats || {}).reduce((a, b) => a + Number(b || 0), 0));
}

function pickBlueprint(level, classKey, slotType = null, offhand = null) {
  const suits = (bp) => (!slotType || bp.slotType === slotType) && (!classKey || !bp.classes || bp.classes.includes(classKey)) && (offhand === null || Boolean(bp.offhand) === offhand);
  const pool = ITEM_BLUEPRINTS.filter((bp) => bp.level <= level + 3 && suits(bp));
  const usable = pool.length ? pool : ITEM_BLUEPRINTS.filter(suits);
  // Two thirds of the drops lean towards the class so the bag is not filled with useless gear.
  return weightedPick(usable, (bp) => 0.15 + (classKey ? statFitWeight(classKey, bp.bonuses) : 0.5) * 1.8);
}

function rollAffixes(count, level, rarity, classKey, used = []) {
  const taken = new Set(used);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const candidates = ITEM_AFFIXES.filter((affix) => !taken.has(affix.id));
    const affix = weightedPick(candidates, (entry) => {
      if (!classKey) return 1;
      if (entry.stat) return 0.2 + (CLASS_STAT_FOCUS[classKey]?.[entry.stat] || 0) * 2;
      if (entry.flat === "physicalDamage") return classKey === "mage" || classKey === "bard" ? 0.05 : 1.2;
      if (entry.flat === "skillDamage") return classKey === "mage" || classKey === "bard" ? 1.2 : 0.05;
      return 0.7;
    });
    taken.add(affix.id);
    const rarityIndex = RARITY_CONFIG[rarity].index;
    const amount = affix.fixed
      ? Number((affix.base * (1 + rarityIndex * 0.3) * (1 + level * 0.01)).toFixed(1))
      : Math.max(1, Math.round(affix.base * itemScale(level, rarity) * (0.85 + rand() * 0.3)));
    result.push({ id: affix.id, suffix: affix.suffix, stat: affix.stat || null, flat: affix.flat || null, amount });
  }
  return result;
}

function generateItem({ level = 1, rarity = "white", classKey = null, slotType = null, offhand = null, blueprint = null, setId = undefined } = {}) {
  const bp = blueprint || pickBlueprint(level, classKey, slotType, offhand);
  const scale = itemScale(level, rarity);
  const bonuses = Object.fromEntries(Object.entries(bp.bonuses).map(([key, value]) => [key, Math.max(1, Math.round(value * scale))]));
  const flatBonuses = Object.fromEntries(Object.entries(bp.flatBonuses || {}).map(([key, value]) => [key, Math.max(1, Math.round(value * scale))]));
  const affixes = rollAffixes(RARITY_CONFIG[rarity].affixes, level, rarity, classKey);
  const finalSetId = setId === undefined ? rollSetId(rarity, classKey) : setId;
  const traitChance = { red: 1, purple: 0.25 }[rarity] || 0;
  const traitPool = Object.values(LEGENDARY_TRAITS).filter((entry) => !entry.classes || !classKey || entry.classes.includes(classKey));
  const trait = roll(traitChance) && traitPool.length ? randomFrom(traitPool).id : null;
  return normalizeItem({
    id: uid("item"),
    name: finalSetId ? `${SET_CATALOG[finalSetId].name}: ${bp.name}` : affixes.length ? `${bp.name} ${affixes[0].suffix}` : bp.name,
    setId: finalSetId,
    slotType: bp.slotType,
    weapon: bp.weapon || null,
    blueprint: bp.name,
    rarity,
    itemLevel: level,
    requiredLevel: Math.max(1, level - 2),
    bonuses,
    flatBonuses,
    affixes,
    trait,
    value: Math.round((16 + level * 9) * RARITY_CONFIG[rarity].multiplier * RARITY_CONFIG[rarity].multiplier)
  });
}

function enhanceMultiplier(item) {
  return 1 + Number(item?.enhanceLevel || 0) * ENHANCE_STEP;
}

// Final numbers an item gives, including affixes and enhancement.
function getItemBonuses(item) {
  const stats = createStatBlock(item?.bonuses);
  const flats = createFlatBonusBlock(item?.flatBonuses);
  (item?.affixes || []).forEach((affix) => {
    if (affix.stat) stats[affix.stat] += affix.amount;
    if (affix.flat) flats[affix.flat] += affix.amount;
  });
  const mult = enhanceMultiplier(item);
  STAT_KEYS.forEach((key) => { stats[key] = Math.round(stats[key] * mult); });
  FLAT_BONUS_KEYS.forEach((key) => { flats[key] = isPercentStat(key) || key === "attackSpeed" ? Number((flats[key] * mult).toFixed(1)) : Math.round(flats[key] * mult); });
  return { stats, flats };
}

function describeItemBonuses(item) {
  const { stats, flats } = getItemBonuses(item);
  const lines = [];
  STAT_KEYS.forEach((key) => { if (stats[key]) lines.push(`+${stats[key]} ${statLabel(key).toLowerCase()}`); });
  FLAT_BONUS_KEYS.forEach((key) => { if (flats[key]) lines.push(`+${flats[key]}${isPercentStat(key) ? "%" : ""} ${flatBonusLabel(key)}`); });
  return lines;
}

function getItemDisplayName(item) {
  return item.enhanceLevel > 0 ? `${item.name} +${item.enhanceLevel}` : item.name;
}

// Which classes can wear a thing: read from its blueprint, so old saves follow the same rules.
function itemClasses(item) {
  return ITEM_BLUEPRINTS.find((bp) => bp.name === item?.blueprint)?.classes || null;
}

function fitsClass(item, classKey) {
  const classes = itemClasses(item);
  return !classes || classes.includes(classKey);
}

function itemPowerScore(item, classKey) {
  if (!item) return 0;
  const focus = CLASS_STAT_FOCUS[classKey] || {};
  const { stats, flats } = getItemBonuses(item);
  let score = 0;
  STAT_KEYS.forEach((key) => { score += stats[key] * (focus[key] ?? 0.4); });
  FLAT_BONUS_KEYS.forEach((key) => {
    let weight = FLAT_STAT_VALUE[key] || 0;
    if ((classKey === "mage" || classKey === "bard") && key === "physicalDamage") weight *= 0.1;
    if (!(classKey === "mage" || classKey === "bard") && key === "skillDamage") weight *= 0.1;
    score += flats[key] * weight;
  });
  if (item.trait) score += 6;
  return Number(score.toFixed(1));
}

// The first hand holds the main weapon, the second a shield, tome, quiver or a spare blade. Only assassins fight with two main blades.
function getSlotKeysForItem(item, classKey) {
  if (item?.slotType !== "weapon") return getSlotKeysForType(item?.slotType);
  const bp = ITEM_BLUEPRINTS.find((entry) => entry.name === item.blueprint);
  if (bp?.offhand) return ["weapon-2"];
  return classKey === "assassin" ? ["weapon-1", "weapon-2"] : ["weapon-1"];
}

function getSlotKeysForType(slotType) {
  if (slotType === "ring") return ["ring-1", "ring-2"];
  if (slotType === "bracelet") return ["bracelet-1", "bracelet-2"];
  if (slotType === "weapon") return ["weapon-1", "weapon-2"];
  return [slotType];
}

// The slot an item goes to: a free one first, otherwise the weakest occupied slot.
function chooseEquipSlot(hero, item) {
  const keys = getSlotKeysForItem(item, hero.classKey);
  return keys.find((key) => !hero.equipment[key]) || keys.reduce((worst, key) => (itemPowerScore(hero.equipment[key], hero.classKey) < itemPowerScore(hero.equipment[worst], hero.classKey) ? key : worst), keys[0]);
}

function firstFreeInventorySlot(hero) {
  return hero.inventory.findIndex((item) => !item);
}

function addItemToInventory(hero, item) {
  const index = firstFreeInventorySlot(hero);
  if (index < 0) return false;
  hero.inventory[index] = item;
  return true;
}

// The pack is full and something valuable comes: the cheapest ordinary thing in the pack makes room for it.
// Returns the gold from what had to go, and what it was. A relic is never sold while a plain item could go instead.
function stowOrSell(hero, item) {
  if (addItemToInventory(hero, item)) return { stored: true, soldItem: null, gold: 0 };
  const worth = (entry) => (isProtectedItem(entry) ? Infinity : getSellPrice(entry));
  let cheapest = -1;
  hero.inventory.forEach((entry, index) => {
    if (entry && !entry.fromTrail && (cheapest < 0 || worth(entry) < worth(hero.inventory[cheapest]))) cheapest = index;
  });
  if (cheapest >= 0 && worth(hero.inventory[cheapest]) < worth(item)) {
    const soldItem = hero.inventory[cheapest];
    const gold = getSellPrice(soldItem);
    hero.gold += gold;
    hero.inventory[cheapest] = item;
    return { stored: true, soldItem, gold };
  }
  const gold = getSellPrice(item);
  hero.gold += gold;
  return { stored: false, soldItem: item, gold };
}

function canEquip(hero, item) {
  return Boolean(item) && hero.level >= item.requiredLevel && fitsClass(item, hero.classKey);
}

function equipRefusal(hero, item) {
  return fitsClass(item, hero.classKey) ? `Нужен ${item.requiredLevel} уровень.` : "Эта вещь не для твоего класса.";
}

function equipFromInventory(hero, index, slotKey = null) {
  const item = hero.inventory[index];
  if (!item) return { ok: false, reason: "Здесь пусто." };
  if (!canEquip(hero, item)) return { ok: false, reason: equipRefusal(hero, item) };
  if (slotKey && !getSlotKeysForItem(item, hero.classKey).includes(slotKey)) return { ok: false, reason: "В этот слот такое не надеть." };
  const target = slotKey || chooseEquipSlot(hero, item);
  const previous = hero.equipment[target];
  hero.equipment[target] = item;
  hero.inventory[index] = previous || null;
  applyDerivedStats(hero);
  return { ok: true, slotKey: target, previous };
}

function unequipToInventory(hero, slotKey) {
  const item = hero.equipment[slotKey];
  if (!item) return { ok: false, reason: "Слот пуст." };
  const free = firstFreeInventorySlot(hero);
  if (free < 0) return { ok: false, reason: "Рюкзак заполнен." };
  hero.equipment[slotKey] = null;
  hero.inventory[free] = item;
  applyDerivedStats(hero);
  return { ok: true };
}

// Equips the best gear from the bag for each slot by class-weighted score.
function equipBestGear(hero) {
  let changed = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    let best = null;
    hero.inventory.forEach((item, index) => {
      if (!canEquip(hero, item)) return;
      const slot = chooseEquipSlot(hero, item);
      const gain = itemPowerScore(item, hero.classKey) - itemPowerScore(hero.equipment[slot], hero.classKey);
      if (gain > 0.05 && (!best || gain > best.gain)) best = { index, slot, gain };
    });
    if (!best) break;
    equipFromInventory(hero, best.index, best.slot);
    changed += 1;
  }
  return changed;
}

// Shows how equipping would change the numbers that matter.
function previewEquipDelta(hero, item, slotKey = null) {
  const target = slotKey || chooseEquipSlot(hero, item);
  const clone = { ...hero, equipment: { ...hero.equipment, [target]: item } };
  applyDerivedStats(clone);
  const keys = ["maxHp", "maxMana", "physicalDamage", "skillDamage", "physicalDefense", "magicDefense", "critChance", "dodgeChance", "attackSpeed"];
  return keys
    .map((key) => ({ key, label: flatBonusLabel(key), delta: Number((clone[key] - hero[key]).toFixed(1)) }))
    .filter((entry) => entry.delta !== 0);
}

function getSellPrice(item) {
  return Math.max(1, Math.round(Number(item?.value || 0) * SHOP_SELL_RATE * (1 + Number(item?.enhanceLevel || 0) * 0.2)));
}

function sellInventoryItem(hero, index) {
  const item = hero.inventory[index];
  if (!item) return 0;
  const price = getSellPrice(item);
  hero.inventory[index] = null;
  hero.gold += price;
  return price;
}

function sellRarityBelow(hero, rarityIndexInclusive) {
  let total = 0;
  let count = 0;
  hero.inventory.forEach((item, index) => {
    if (item && RARITY_CONFIG[item.rarity].index <= rarityIndexInclusive) {
      total += sellInventoryItem(hero, index);
      count += 1;
    }
  });
  return { total, count };
}

function refreshShopStock(hero) {
  const level = hero.level;
  const zoneByLevel = level < 8 ? "green" : level < 16 ? "orange" : "purple";
  const weights = ZONES[zoneByLevel].rarityWeights;
  hero.shop = {
    stock: Array.from({ length: 8 }, () => {
      const rarity = weightedPick(RARITY_KEYS.map((key, i) => ({ key, weight: i === 4 ? 0 : weights[i] }))).key;
      return generateItem({ level: Math.max(1, level + randomInt(-1, 1)), rarity, classKey: hero.classKey });
    }),
    expeditionsAtRefresh: Number(hero.records?.expeditions || 0)
  };
  return hero.shop.stock;
}

function getShopPrice(item) {
  return Math.max(5, Math.round(item.value * 2.2));
}

function buyShopItem(hero, index) {
  const item = hero.shop?.stock?.[index];
  if (!item) return { ok: false, reason: "Товар уже продан." };
  const price = getShopPrice(item);
  if (hero.gold < price) return { ok: false, reason: "Не хватает золота." };
  if (firstFreeInventorySlot(hero) < 0) return { ok: false, reason: "Рюкзак заполнен." };
  hero.gold -= price;
  addItemToInventory(hero, item);
  hero.shop.stock.splice(index, 1);
  return { ok: true, item, price };
}

function getPotionPrice(kind, hero) {
  const potion = POTIONS[kind];
  if (!potion) return Infinity;
  return potion.price + potion.pricePerLevel * hero.level;
}

function buyPotion(hero, kind) {
  if (!POTIONS[kind]) return { ok: false, reason: "Такого зелья нет." };
  const price = getPotionPrice(kind, hero);
  if (hero.potions[kind] >= POTION_LIMIT) return { ok: false, reason: `В поясе не больше ${POTION_LIMIT} зелий.` };
  if (hero.gold < price) return { ok: false, reason: "Не хватает золота." };
  hero.gold -= price;
  hero.potions[kind] += 1;
  return { ok: true, price };
}

function buyResource(hero, resourceId) {
  const resource = SHOP_RESOURCE_CATALOG.find((entry) => entry.id === resourceId);
  if (!resource) return { ok: false, reason: "Нет такого товара." };
  if (hero.gold < resource.price) return { ok: false, reason: "Не хватает золота." };
  hero.gold -= resource.price;
  hero.resources[resourceId] = Number(hero.resources[resourceId] || 0) + 1;
  return { ok: true };
}

function buyShopPassive(hero, passiveId) {
  const passive = getShopPassiveDefinition(passiveId);
  if (!passive) return { ok: false, reason: "Нет такой пассивки." };
  if (hero.shopPassiveIds.includes(passiveId)) return { ok: false, reason: "Уже изучено." };
  if (!canUseShopPassive(hero, passive)) return { ok: false, reason: "Этому классу нечем пользоваться с таким умением." };
  if (hero.level < Number(passive.minLevel || 1)) return { ok: false, reason: `Нужен ${passive.minLevel} уровень.` };
  if (hero.gold < passive.price) return { ok: false, reason: "Не хватает золота." };
  hero.gold -= passive.price;
  hero.shopPassiveIds.push(passiveId);
  if (hero.shopActive && getActiveShopIds(hero).length < getShopSlotLimit(hero)) hero.shopActive = [...getActiveShopIds(hero), passiveId];
  applyDerivedStats(hero);
  return { ok: true };
}

// --- Forge ---
function getEnhanceCost(item) {
  const level = Number(item.enhanceLevel || 0);
  return {
    gold: Math.round((14 + item.itemLevel * 5) * (1 + level * 0.8) * (1 + RARITY_CONFIG[item.rarity].index * 0.4)),
    resource: RESOURCE_BY_RARITY[item.rarity],
    amount: 1 + Math.floor(level / 2),
    chance: Math.max(0.35, 1 - level * 0.07)
  };
}

function enhanceItem(hero, item) {
  if (!item) return { ok: false, reason: "Выбери предмет." };
  if (item.enhanceLevel >= MAX_ENHANCE) return { ok: false, reason: "Предел заточки достигнут." };
  const cost = getEnhanceCost(item);
  if (hero.gold < cost.gold) return { ok: false, reason: "Не хватает золота." };
  if (Number(hero.resources[cost.resource] || 0) < cost.amount) return { ok: false, reason: "Не хватает материала." };
  hero.gold -= cost.gold;
  hero.resources[cost.resource] -= cost.amount;
  const success = roll(cost.chance);
  if (success) {
    item.enhanceLevel += 1;
    applyDerivedStats(hero);
  }
  return { ok: true, success };
}

function getDismantleYield(item) {
  const index = RARITY_CONFIG[item.rarity].index;
  const result = { [RESOURCE_BY_RARITY[item.rarity]]: 1 + Math.floor(Number(item.enhanceLevel || 0) / 2) };
  if (index >= 1) result[RESOURCE_BY_RARITY[RARITY_KEYS[index - 1]]] = 2;
  return { resources: result, shards: index >= 4 ? 2 : index === 3 ? 1 : 0 };
}

function dismantleInventoryItem(hero, index) {
  const item = hero.inventory[index];
  if (!item) return null;
  const gained = getDismantleYield(item);
  Object.entries(gained.resources).forEach(([id, amount]) => { hero.resources[id] = Number(hero.resources[id] || 0) + amount; });
  hero.mutationShards += gained.shards;
  hero.inventory[index] = null;
  return gained;
}

// --- Working on many things at once ---
// Relics and set pieces are never picked by a filter: taking them needs a separate click on each.
function isProtectedItem(item) {
  return Boolean(item) && (item.rarity === "relic" || Boolean(item.setId));
}

function isWeakerThanWorn(hero, item) {
  const keys = getSlotKeysForItem(item, hero.classKey);
  if (keys.some((key) => !hero.equipment[key])) return false;
  const score = itemPowerScore(item, hero.classKey);
  return keys.every((key) => itemPowerScore(hero.equipment[key], hero.classKey) >= score);
}

const BAG_FILTERS = [
  ...["white", "green", "orange", "purple", "red"].map((rarity) => ({ id: rarity, name: { white: "Белые", green: "Зелёные", orange: "Оранжевые", purple: "Фиолетовые", red: "Красные" }[rarity], rarity, test: (hero, item) => item.rarity === rarity })),
  { id: "weaker", name: "Хуже надетого", test: (hero, item) => isWeakerThanWorn(hero, item) },
  { id: "unfit", name: "Не для класса", test: (hero, item) => !fitsClass(item, hero.classKey) },
  { id: "all", name: "Всё", test: () => true }
];

function bagFilterIndices(hero, filterId) {
  const filter = BAG_FILTERS.find((entry) => entry.id === filterId);
  if (!filter) return [];
  return hero.inventory.flatMap((item, index) => (item && !isProtectedItem(item) && filter.test(hero, item) ? [index] : []));
}

function validBagIndices(hero, indices) {
  return [...new Set(indices.map(Number))].filter((index) => hero.inventory[index]);
}

function previewBulk(hero, indices) {
  const list = validBagIndices(hero, indices);
  const result = { count: list.length, gold: 0, resources: {}, shards: 0, risky: 0 };
  list.forEach((index) => {
    const item = hero.inventory[index];
    result.gold += getSellPrice(item);
    const gained = getDismantleYield(item);
    Object.entries(gained.resources).forEach(([id, amount]) => { result.resources[id] = Number(result.resources[id] || 0) + amount; });
    result.shards += gained.shards;
    if (isProtectedItem(item) || RARITY_CONFIG[item.rarity].index >= 3 || item.enhanceLevel > 0) result.risky += 1;
  });
  return result;
}

function sellInventoryItems(hero, indices) {
  const list = validBagIndices(hero, indices);
  const total = list.reduce((sum, index) => sum + sellInventoryItem(hero, index), 0);
  return { count: list.length, total };
}

function dismantleInventoryItems(hero, indices) {
  const preview = previewBulk(hero, indices);
  validBagIndices(hero, indices).forEach((index) => dismantleInventoryItem(hero, index));
  return preview;
}

function getReforgeCost(item) {
  return { shards: 1, gold: Math.round((20 + item.itemLevel * 6) * (1 + RARITY_CONFIG[item.rarity].index * 0.5)) };
}

function reforgeItem(hero, item) {
  if (!item) return { ok: false, reason: "Выбери предмет." };
  if (!item.affixes.length) return { ok: false, reason: "У обычной вещи нет свойств для перековки." };
  const cost = getReforgeCost(item);
  if (hero.mutationShards < cost.shards) return { ok: false, reason: "Нужен осколок мутации." };
  if (hero.gold < cost.gold) return { ok: false, reason: "Не хватает золота." };
  hero.mutationShards -= cost.shards;
  hero.gold -= cost.gold;
  item.affixes = rollAffixes(item.affixes.length, item.itemLevel, item.rarity, hero.classKey);
  item.name = `${item.blueprint || item.name.split(" ").slice(0, -1).join(" ") || item.name} ${item.affixes[0].suffix}`;
  applyDerivedStats(hero);
  return { ok: true };
}

function canMutateSkill(hero, skillId, mutationId) {
  const skill = getSkillDefinition(skillId);
  const progress = getSkillProgress(hero, skillId);
  const mutation = MUTATIONS[mutationId];
  if (!skill || !progress || !mutation) return { ok: false, reason: "Мутация недоступна." };
  if (progress.level < SKILL_MAX_LEVEL) return { ok: false, reason: "Нужен V уровень мастерства." };
  if (progress.mutation) return { ok: false, reason: "Навык уже мутировал." };
  if (hero.mutationShards < mutation.cost.shards) return { ok: false, reason: "Не хватает осколков мутации." };
  const missing = Object.entries(mutation.cost).find(([id, amount]) => id !== "shards" && Number(hero.resources[id] || 0) < amount);
  if (missing) return { ok: false, reason: "Не хватает материала." };
  return { ok: true };
}

function mutateSkill(hero, skillId, mutationId) {
  const check = canMutateSkill(hero, skillId, mutationId);
  if (!check.ok) return check;
  const mutation = MUTATIONS[mutationId];
  hero.mutationShards -= mutation.cost.shards;
  Object.entries(mutation.cost).forEach(([id, amount]) => { if (id !== "shards") hero.resources[id] -= amount; });
  getSkillProgress(hero, skillId).mutation = mutationId;
  return { ok: true };
}
