// Trail order, region bosses and lairs: the long road a hero prepares for.

// --- Trails open one after another ---
function getTrailClears(hero, regionId) {
  return hero.trailClears?.[regionId] || [];
}

function isZoneOpen(hero, regionId, zoneKey) {
  const index = ZONE_KEYS.indexOf(zoneKey);
  if (index <= 0) return true;
  return getTrailClears(hero, regionId).includes(ZONE_KEYS[index - 1]);
}

function markTrailCleared(hero, regionId, zoneKey) {
  hero.trailClears = hero.trailClears || {};
  const list = hero.trailClears[regionId] || [];
  if (!list.includes(zoneKey)) list.push(zoneKey);
  hero.trailClears[regionId] = list;
}

// --- Region bosses: fixed fights, the same for every hero ---
const GUARDIAN_INFO = {
  greyfang: { recommended: 16, gear: "оранжевые вещи", phases: ["Зовёт стаю на 66% и 33% здоровья: волков надо убирать первыми.", "Ниже половины здоровья впадает в ярость.", "Прыжок вожака заранее виден: на него нужна стойка."] },
  pyre_queen: { recommended: 32, gear: "оранжевые и фиолетовые вещи", phases: ["Две жаровни лечат её и дают силу: сначала они.", "Горит сама: огонь её не берёт, а бьющий обжигается.", "Плавка бьёт по-настоящему больно, готовь стойку или щит."] },
  archivist: { recommended: 52, gear: "фиолетовые вещи", phases: ["Бескровен: кровотечение и яд почти бесполезны.", "Запечатывает навыки: держи запасной план.", "На половине здоровья страницы взлетают и бьют каждый ход."] },
  smith: { recommended: 72, gear: "фиолетовые вещи и реликвии", phases: ["Броня и нарастающая мощь: чем дольше бой, тем он страшнее.", "На 66% и 33% перековывается: щит и дух наковальни.", "Железная воля: оглушить его почти невозможно."] }
};
// Final strength of each boss, separate from the common enemy formulas.
const GUARDIAN_POWER = { greyfang: { hp: 1.6, dmg: 1.5 }, pyre_queen: { hp: 1.2, dmg: 1.25 }, archivist: { hp: 1.55, dmg: 1.55 }, smith: { hp: 1.3, dmg: 1.22 } };
Object.entries(GUARDIAN_POWER).forEach(([id, power]) => {
  const def = ENEMY_DEFINITIONS[id];
  def.mods = { ...(def.mods || {}), hp: Number(def.mods?.hp || 1) * power.hp, dmg: Number(def.mods?.dmg || 1) * power.dmg };
});

// What the boss card shows, so the player can judge whether the hero is ready.
function describeGuardian(id, hero) {
  const enemy = makeEnemy(id, ENEMY_DEFINITIONS[id].level);
  const moves = (enemy.moves || []).map((move) => ENEMY_MOVES[move]).filter(Boolean);
  const power = Math.max(1, ...moves.map((move) => Number(move.power || 1)));
  const hit = Math.round(Math.max(enemy.physicalDamage || 0, enemy.skillDamage || 0) * power);
  const offense = Math.max(hero.physicalDamage || 1, hero.skillDamage || 1);
  return { hp: enemy.maxHp, hit, level: enemy.level, hitsToDie: Math.max(1, Math.floor((hero.maxHp || 1) / Math.max(1, hit * 0.75))), blowsToKill: Math.ceil(enemy.maxHp / Math.max(1, offense * 1.4)), info: GUARDIAN_INFO[id] };
}

// Two more sets, so that mages and bards have something to hunt from the very first lairs.
Object.assign(SET_CATALOG, {
  wolf_song: { id: "wolf_song", name: "Песнь волчьей луны", classes: ["bard"],
    bonus2: { description: "Каждый навык лечит на 2%: стая поёт вместе с тобой.", on: { afterAction(b, s, c) { if (c.skill) b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.02)); } } },
    bonus4: { description: "Навык, не похожий на прошлый, бьёт на 20% сильнее.", on: { beforeHit(b, s, c) { if (c.skill && !c.proc && s.last !== c.skill.id) c.mult *= 1.2; }, afterAction(b, s, c) { if (c.skill) s.last = c.skill.id; } } },
    bonus6: { description: "Каждый третий навык заставляет врага дрогнуть: его удары слабее на ход.", on: { afterAction(b, s, c) { if (!c.skill) return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0 && b.enemy?.currentHp > 0) fx(b, "weaken", 2, 0.2); } } },
    bonus8: { description: "Крит лечит на 5% и возвращает 5% маны: песня питает певца.", on: { afterHit(b, s, c) { if (!isDirectHit(c) || !c.crit) return; b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.05)); b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.05)); } } } },
  hedge_coven: { id: "hedge_coven", name: "Шёпот болотного ковена", classes: ["mage"],
    bonus2: { description: "Магический удар с шансом 25% отравляет: болото всегда рядом.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && b.enemy?.currentHp > 0 && roll(0.25)) fx(b, "poison", 3, dotValue(b, 0.14)); } } },
    bonus4: { description: "Магия бьёт отравленную цель на 20% сильнее.", on: { beforeHit(b, s, c) { if (c.kind === "magic" && hasFx(b.enemy, "poison")) c.mult *= 1.2; } } },
    bonus6: { description: "Каждый четвёртый навык сглазит цель: слабость на 2 хода.", on: { afterAction(b, s, c) { if (!c.skill) return; s.n = (s.n || 0) + 1; if (s.n % 4 === 0 && b.enemy?.currentHp > 0) fx(b, "weaken", 2, 0.25); } } },
    bonus8: { description: "По цели со слабостью и ядом разом магия бьёт ещё на 30% сильнее.", on: { beforeHit(b, s, c) { if (c.kind === "magic" && hasFx(b.enemy, "poison") && hasFx(b.enemy, "weaken")) c.mult *= 1.3; } } } }
});

// --- Lairs: the only place where set relics are found ---
const LAIR_CATALOG = {
  wolf_den: { id: "wolf_den", name: "Логово стаи", regionId: "thicket", opens: "green", level: 10, master: "lair_she_wolf", sets: ["alpha_hide", "hunter_camp", "wolf_song"], lore: "Здесь выросла стая Серого Клыка. Выходят отсюда редко и с трофеями." },
  viper_hollow: { id: "viper_hollow", name: "Гадючья низина", regionId: "thicket", opens: "purple", level: 14, master: "lair_viper_mother", sets: ["viper_nest", "hedge_coven"], lore: "Болото, где яд копят годами, как вино." },
  ash_court: { id: "ash_court", name: "Пепельный двор", regionId: "ashlands", opens: "green", level: 24, master: "lair_ash_seneschal", sets: ["ash_queen"], lore: "Придворные Королевы Костра всё ещё служат, хотя двор давно сгорел." },
  red_mile: { id: "red_mile", name: "Багровая верста", regionId: "ashlands", opens: "purple", level: 30, master: "lair_executioner", sets: ["crimson_trail"], lore: "Дорога казней. Земля здесь красная не от пепла." },
  sealed_stacks: { id: "sealed_stacks", name: "Запечатанные хранилища", regionId: "ruins", opens: "green", level: 42, master: "lair_first_scribe", sets: ["archive_pages", "choir_mask"], lore: "Книги, которые нельзя читать, охраняют те, кто прочёл." },
  veil_crypt: { id: "veil_crypt", name: "Склеп Вуали", regionId: "ruins", opens: "purple", level: 50, master: "lair_widow", sets: ["phantom_veil"], lore: "Здесь учились убивать те, кого никто никогда не видел." },
  overheat_rift: { id: "overheat_rift", name: "Раскалённый разлом", regionId: "limit", opens: "green", level: 62, master: "lair_rift_heart", sets: ["overheated"], lore: "Трещина в мире, из которой тянет жаром кузни." },
  first_forge: { id: "first_forge", name: "Первая Кузница", regionId: "limit", opens: "purple", level: 72, master: "lair_forge_titan", sets: ["smith_hammer"], lore: "Здесь Кузнец Шагов учился. Его ученики всё ещё работают." }
};
Object.values(LAIR_CATALOG).forEach((lair) => { lair.masterName = LAIR_BOSSES[lair.master].name; });
const LAIR_TOKENS_FOR_EXCHANGE = 3;
const LAIR_TOP_LEVEL = 80;
const LAIR_RANK_STEP = 10;
const SET_SLOT_TYPES = ["weapon", "head", "chest", "legs", "boots", "ring", "bracelet", "necklace"];
const SET_FULL = SET_SLOT_TYPES.length;

// Any lair can be fought again at a higher rank, so an early set stays useful to the very top.
function getLairRanks(lair) {
  const ranks = [lair.level];
  for (let level = Math.ceil((lair.level + 1) / LAIR_RANK_STEP) * LAIR_RANK_STEP; level <= LAIR_TOP_LEVEL; level += LAIR_RANK_STEP) ranks.push(level);
  return ranks;
}

function getLairRankLimit(lair, hero) {
  const open = getLairRanks(lair).filter((level) => hero.level >= level - 3);
  return open.length ? open[open.length - 1] : lair.level;
}

function getLairState(hero, lair, level = lair.level) {
  const open = getTrailClears(hero, lair.regionId).includes(lair.opens);
  const regionIndex = REGIONS.findIndex((region) => region.id === lair.regionId);
  const regionOpen = isRegionUnlocked(hero, regionIndex);
  const minLevel = Math.max(1, level - 3);
  if (!regionOpen) return { ok: false, reason: "Регион ещё закрыт." };
  if (!open) return { ok: false, reason: `Пройди ${ZONES[lair.opens].name.toLowerCase()} этого региона.` };
  if (hero.level < minLevel) return { ok: false, reason: `Нужен ${minLevel} уровень.` };
  return { ok: true };
}

// What this class can earn here. A lair with nothing for the class pays with a set of its own class from another lair.
function getLairRewardSetIds(hero, lair) {
  const own = lair.sets.filter((id) => SET_CATALOG[id].classes.includes(hero.classKey));
  if (own.length) return own;
  return [...new Set(Object.values(LAIR_CATALOG).flatMap((entry) => entry.sets))].filter((id) => SET_CATALOG[id].classes.includes(hero.classKey));
}

function getLairSets(hero, lair) {
  return getLairRewardSetIds(hero, lair).map((id) => SET_CATALOG[id]);
}

// What the card tells about the master at the chosen rank.
function describeLairBoss(hero, lair, level) {
  const boss = makeLairBoss(hero, lair, level);
  const def = LAIR_BOSSES[lair.master];
  const moves = [...new Set([...def.moves, ...def.stages.flatMap((stage) => stage.add || [])])].map((id) => ENEMY_MOVES[id]).filter(Boolean);
  const top = Math.max(...moves.map((move) => Number(move.power || 0) * Number(move.hits || 1)));
  return { hp: boss.maxHp, hit: Math.round(Math.max(boss.physicalDamage, boss.skillDamage) * top), moves, stages: def.stages, traits: def.traits.map((id) => ENEMY_TRAITS[id]).filter((trait) => trait?.aura) };
}

function createLairRun(hero, lairId, setId, level = null) {
  const lair = LAIR_CATALOG[lairId];
  const exp = createExpedition(hero, lair.regionId, "orange");
  exp.lairId = lairId;
  exp.lairName = lair.name;
  exp.lairLevel = getLairRanks(lair).includes(Number(level)) ? Number(level) : lair.level;
  const rewards = getLairRewardSetIds(hero, lair);
  exp.lairSet = rewards.includes(setId) ? setId : rewards[0];
  exp.steps = 1;
  exp.step = 0;
  generateChoices(exp);
  return exp;
}

function lairChoices(exp) {
  const lair = LAIR_CATALOG[exp.lairId];
  return [{ type: "boss", pack: [lair.master], enemyId: lair.master, lairMaster: true }];
}

// What the set still lacks comes first, so repeat runs are not wasted on the same piece.
function rollRelicSlot(hero, setId) {
  const owned = new Set([...Object.values(hero.equipment || {}), ...(hero.inventory || [])].filter((item) => item?.setId === setId && item.rarity === "relic").map((item) => item.slotType));
  const missing = SET_SLOT_TYPES.filter((slot) => !owned.has(slot));
  return randomFrom(missing.length ? missing : SET_SLOT_TYPES);
}

function generateRelic(hero, setId, level, slotType = null) {
  const set = SET_CATALOG[setId];
  const item = generateItem({ level, rarity: "relic", classKey: hero.classKey, slotType: slotType || rollRelicSlot(hero, setId), setId });
  item.name = `${set.name}: ${item.blueprint}`;
  item.trait = null;
  return item;
}

// Each token keeps the rank of the fight it came from; the count in hero.lairTokens follows the list.
function lairTokenLevels(hero, lairId) {
  hero.lairTokenLevels = hero.lairTokenLevels || {};
  const count = Number(hero.lairTokens?.[lairId] || 0);
  const list = hero.lairTokenLevels[lairId] || [];
  // Tokens from before this rule are counted at the lair's own rank.
  while (list.length < count) list.push(LAIR_CATALOG[lairId]?.level || 1);
  list.length = Math.min(list.length, count);
  hero.lairTokenLevels[lairId] = list;
  return list;
}

function addLairToken(hero, lairId, level) {
  const list = lairTokenLevels(hero, lairId);
  list.push(level);
  hero.lairTokens = hero.lairTokens || {};
  hero.lairTokens[lairId] = list.length;
}

// Spends tokens: the strongest for an exchange, the weakest for raising a relic. Returns their levels.
function spendLairTokens(hero, lairId, count, strongest) {
  const list = lairTokenLevels(hero, lairId).sort((a, b) => a - b);
  const spent = strongest ? list.splice(list.length - count, count) : list.splice(0, count);
  hero.lairTokens[lairId] = list.length;
  return spent;
}

function finishLairRun(hero, exp, summary) {
  const lair = LAIR_CATALOG[exp.lairId];
  summary.lairName = lair.name;
  addLairToken(hero, lair.id, exp.lairLevel);
  hero.lairClears = hero.lairClears || {};
  hero.lairClears[lair.id] = Number(hero.lairClears[lair.id] || 0) + 1;
  hero.lairBest = hero.lairBest || {};
  hero.lairBest[lair.id] = Math.max(Number(hero.lairBest[lair.id] || 0), exp.lairLevel);
  const relic = generateRelic(hero, exp.lairSet, exp.lairLevel);
  summary.relic = relic;
  exp.bag.items.push(relic);
}

function exchangeLairTokens(hero, lairId, setId, slotType) {
  const lair = LAIR_CATALOG[lairId];
  if (!lair || !getLairRewardSetIds(hero, lair).includes(setId)) return { ok: false, reason: "Этот комплект здесь не добыть." };
  if (Number(hero.lairTokens?.[lairId] || 0) < LAIR_TOKENS_FOR_EXCHANGE) return { ok: false, reason: `Нужно жетонов: ${LAIR_TOKENS_FOR_EXCHANGE}.` };
  if (!hero.inventory.some((item) => !item)) return { ok: false, reason: "Рюкзак полон." };
  // The relic is as strong as the weakest of the tokens given for it.
  const spent = spendLairTokens(hero, lairId, LAIR_TOKENS_FOR_EXCHANGE, true);
  const relic = generateRelic(hero, setId, Math.max(lair.level, Math.min(...spent)), slotType);
  addItemToInventory(hero, relic);
  return { ok: true, item: relic };
}

// --- Raising a relic: a set found early grows with its owner ---

// A relic rises up to the hero's own level. Gold for every level, and lair tokens of any lair:
// one token pays for ten levels of growth of this item; what is paid but not yet used stays on the item.
const ASCEND_LEVELS_PER_TOKEN = 10;
function ascendGold(from, to) {
  let gold = 0;
  for (let k = from + 1; k <= to; k += 1) gold += 20 + 4 * k;
  return gold;
}

function totalLairTokens(hero) {
  return Object.keys(LAIR_CATALOG).reduce((sum, id) => sum + Number(hero.lairTokens?.[id] || 0), 0);
}

// Picks the weakest tokens across all lairs: the strong ones are worth more in an exchange.
function pickAscensionTokens(hero, count) {
  const pool = [];
  Object.keys(LAIR_CATALOG).forEach((id) => lairTokenLevels(hero, id).forEach((level) => pool.push({ id, level })));
  return pool.sort((a, b) => a.level - b.level).slice(0, count);
}

function getRelicAscension(hero, item, wanted = null) {
  if (!item || item.rarity !== "relic") return { ok: false, reason: "Возвысить можно только реликвию комплекта." };
  const from = Number(item.itemLevel || 1);
  const max = Number(hero.level || 1);
  if (from >= max) return { ok: false, from, target: from, max, reason: `Реликвия уже на твоём уровне, ${max}. Она поднимется дальше, когда вырастешь ты.` };
  const target = clamp(Math.round(Number(wanted || max)), from + 1, max);
  const gap = target - from;
  const credit = Number(item.ascCredit || 0);
  const tokens = Math.ceil(Math.max(0, gap - credit) / ASCEND_LEVELS_PER_TOKEN);
  const gold = ascendGold(from, target);
  const haveTokens = totalLairTokens(hero);
  const lack = [];
  if (hero.gold < gold) lack.push(`золота: ещё ${gold - hero.gold}`);
  if (haveTokens < tokens) lack.push(`жетонов: ещё ${tokens - haveTokens}`);
  return { ok: true, from, target, max, gap, gold, tokens, credit, newCredit: credit + tokens * ASCEND_LEVELS_PER_TOKEN - gap, haveTokens, lack, afford: !lack.length };
}

// The values the item had before its first rise; every later rise scales from them, so many small rises equal one big one.
function relicAnchor(item) {
  if (!item.ascAnchor) {
    item.ascAnchor = {
      level: Number(item.itemLevel || 1), bonuses: { ...item.bonuses }, flatBonuses: { ...item.flatBonuses },
      affixes: item.affixes.map((affix) => affix.amount), value: item.value
    };
  }
  return item.ascAnchor;
}

function scaleRelicTo(item, level) {
  const anchor = relicAnchor(item);
  const ratio = itemScale(level, "relic") / itemScale(anchor.level, "relic");
  const grow = (from, to) => { Object.keys(to).forEach((key) => { if (from[key]) to[key] = Math.round(from[key] * ratio); }); };
  grow(anchor.bonuses, item.bonuses);
  grow(anchor.flatBonuses, item.flatBonuses);
  item.affixes.forEach((affix, index) => {
    const def = ITEM_AFFIXES.find((entry) => entry.id === affix.id);
    if (!def?.fixed && anchor.affixes[index] !== undefined) affix.amount = Math.round(anchor.affixes[index] * ratio);
  });
  item.value = Math.round(anchor.value * ratio);
  item.itemLevel = level;
  item.requiredLevel = Math.max(1, level - 2);
}

// After a reforge the new properties belong to the current level: store them at the anchor's level.
function reanchorRelicAffixes(item) {
  if (!item?.ascAnchor) return;
  const ratio = itemScale(item.ascAnchor.level, "relic") / itemScale(item.itemLevel, "relic");
  item.ascAnchor.affixes = item.affixes.map((affix) => affix.amount * ratio);
}

function ascendRelic(hero, item, wanted = null) {
  const plan = getRelicAscension(hero, item, wanted);
  if (!plan.ok) return plan;
  if (!plan.afford) return { ok: false, reason: `Не хватает ${plan.lack.join(", ")}.` };
  hero.gold -= plan.gold;
  pickAscensionTokens(hero, plan.tokens).forEach(({ id, level }) => {
    const list = lairTokenLevels(hero, id);
    list.splice(list.indexOf(level), 1);
    hero.lairTokens[id] = list.length;
  });
  item.ascCredit = plan.newCredit;
  scaleRelicTo(item, plan.target);
  applyDerivedStats(hero);
  return { ok: true, level: plan.target, tokens: plan.tokens, gold: plan.gold };
}

// --- Six pieces of a set change how the class plays ---
Object.entries({
  alpha_hide: { description: "Каждое убийство до конца боя даёт +12% урона.", on: { foeDown(b, s) { s.kills = (s.kills || 0) + 1; }, beforeHit(b, s, c) { if (s.kills) c.mult *= 1 + s.kills * 0.12; } } },
  ash_queen: { description: "Огненные навыки продлевают горение на всех врагах на ход.", on: { afterAction(b, s, c) { if (c.skill?.element === "fire") b.foes.forEach((foe) => { const burn = getEffect(foe, "burn"); if (burn) burn.duration += 1; }); } } },
  archive_pages: { description: "Каждый шестой навык обнуляет все откаты.", on: { afterAction(b, s, c) { if (!c.skill) return; s.n = (s.n || 0) + 1; if (s.n % 6 === 0) Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = 0; }); } } },
  smith_hammer: { description: "Удар, принятый в стойке, тут же возвращается молотом с силой 120%.", on: { afterAction(b, s, c) { if (c.type === "guard") s.ready = true; }, hurt(b, s) { if (s.ready && b.enemy?.currentHp > 0) { s.ready = false; procHit(b, 1.2, "Ответный молот", "steel", { kind: "physical" }); } } } },
  viper_nest: { description: "Прямой удар по отравленной цели выжигает яд: мгновенный урон вдвое сильнее дозы.", on: { afterHit(b, s, c) { if (!isDirectHit(c) || b.enemy?.currentHp <= 0) return; const poison = getEffect(b.enemy, "poison"); if (poison) tickDamageEffect(b, b.enemy, poison, poison.value * 2, "яд вскипает"); } } },
  crimson_trail: { description: "Крит лечит на 6% здоровья: чужая кровь питает.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.06)); } } },
  phantom_veil: { description: "Первый удар после ухода в тень бьёт на 80% сильнее.", on: { afterAction(b, s, c) { if (c.type === "wait") s.ready = true; else if (s.fired) { s.fired = false; s.ready = false; } }, beforeHit(b, s, c) { if (s.ready && c.skill) { c.mult *= 1.8; s.fired = true; } } } },
  hunter_camp: { description: "Каждый прямой выстрел ставит метку: цель получает больше урона.", on: { afterHit(b, s, c) { if (isDirectHit(c) && b.enemy?.currentHp > 0) applyEffect(b, b.enemy, { id: "mark", duration: 2, value: 0.1 }, b.hero); } } },
  choir_mask: { description: "Каждый третий навык запевает весь хор: лечит на 8% и бьёт всех врагов.", on: { afterAction(b, s, c) { if (!c.skill) return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.08)); splash(b, heroAttack(b) * 0.6, "Хор", "arcane"); } } } },
  overheated: { description: "Чем сильнее перегрев, тем сильнее удар: до +50%.", on: { beforeHit(b, s, c) { const heat = Number(b.mech?.core_mage?.value || 0); if (c.skill) c.mult *= 1 + 0.5 * Math.min(1, heat / 100); } } }
}).forEach(([id, bonus]) => { SET_CATALOG[id].bonus6 = bonus; });

// Keeps a poison or a wound going: once per action, never above half again its first strength.
function feedDot(b, s, c, id) {
  if (!isDirectHit(c) || b.enemy?.currentHp <= 0) return;
  const key = `${b.turn}:${b.enemy.slot}`;
  if (s.fed === key) return;
  const effect = getEffect(b.enemy, id);
  if (!effect) return;
  s.fed = key;
  effect.meta = effect.meta || {};
  effect.meta.firstValue = effect.meta.firstValue || effect.value;
  effect.duration += 1;
  effect.value = Math.min(Math.round(effect.meta.firstValue * 1.5), Math.round(effect.value * 1.1));
}

// --- The whole set: eight different parts, a change that defines the build ---
Object.entries({
  alpha_hide: { description: "Вожак стаи: первые три хода боя ты в ярости, а в ярости каждый прямой удар вскрывает рану.", on: { start(b) { b.hero.effects.push({ ...normalizeEffectSpec({ id: "rage", duration: 3, value: 0.25 }), meta: { fresh: true } }); }, afterHit(b, s, c) { if (isDirectHit(c) && hasFx(b.hero, "rage") && b.enemy?.currentHp > 0) fx(b, "bleed", 3, dotValue(b, 0.2)); } } },
  ash_queen: { description: "Двор пылает: прямые удары по горящей цели сильнее на 35%.", on: { beforeHit(b, s, c) { if (hasFx(b.enemy, "burn")) c.mult *= 1.35; } } },
  archive_pages: { description: "Каждый четвёртый навык возвращает четверть маны: страницы пишут сами.", on: { afterAction(b, s, c) { if (!c.skill) return; s.n = (s.n || 0) + 1; if (s.n % 4 === 0) b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.25)); } } },
  smith_hammer: { description: "Стойка закаляет: щит на 15% здоровья, и следующий удар сильнее на 60%.", on: { afterAction(b, s, c) { if (c.type === "guard") { s.hot = true; applyEffect(b, b.hero, { id: "shield", duration: 2, value: Math.round(b.hero.maxHp * 0.15) }, b.hero); } }, beforeHit(b, s, c) { if (s.hot && !c.proc) { s.hot = false; c.mult *= 1.6; } } } },
  viper_nest: { description: "Яд не спадает, пока ты бьёшь: прямой удар продлевает его на ход и усиливает на 10%, раз за действие и не больше чем в полтора раза.", on: { afterHit(b, s, c) { feedDot(b, s, c, "poison"); } } },
  crimson_trail: { description: "Открытая рана не закрывается: прямой удар продлевает кровотечение на ход и углубляет на 10%, раз за действие и не больше чем в полтора раза.", on: { afterHit(b, s, c) { feedDot(b, s, c, "bleed"); } } },
  phantom_veil: { description: "Тебя не поймать: после уклонения следующий удар сильнее на 70%.", on: { dodged(b, s) { s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { s.ready = false; c.mult *= 1.7; } } } },
  hunter_camp: { description: "Вторая стрела: прямой удар по помеченной цели тут же повторяется с силой 35%.", on: { afterHit(b, s, c) { if (isDirectHit(c) && b.enemy?.currentHp > 0 && hasFx(b.enemy, "mark")) procHit(b, 0.35, "Вторая стрела", "steel", { kind: "physical" }); } } },
  choir_mask: { description: "Хор не умолкает: в начале каждого хода лечит на 3% и возвращает 5% маны.", on: { turnStart(b) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.03)); b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.05)); } } },
  overheated: { description: "Навык на пике перегрева даёт второй залп с силой 50%.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.skill && b.enemy?.currentHp > 0 && Number(b.mech?.core_mage?.value || 0) >= 80) procHit(b, 0.5, "Второй залп", "fire", { kind: "magic" }); } } }
}).forEach(([id, bonus]) => { SET_CATALOG[id].bonus8 = bonus; });
