// Talent engine: the points, the tree rules and the helpers every talent, boon and item trait is written with.
// A talent, boon or trait is plain data: { mods, stats, derived, on: { hook(battle, state, ctx) } }.
const TALENT_KINDS = {
  amp: { name: "Усиление", hint: "Делает существующее сильнее." },
  shift: { name: "Изменение", hint: "Меняет правила эффекта или механики." },
  make: { name: "Создание", hint: "Создаёт новый эффект или новое действие." },
  link: { name: "Связка", hint: "Связывает два эффекта между собой." },
  key: { name: "Ключевой", hint: "Огромная сила с настоящей платой. Определяет всю сборку." }
};
const TALENT_TIER_COST = { 1: 1, 2: 2, 3: 3, 4: 5 };
const TALENT_TIER_LEVEL = { 1: 1, 2: 10, 3: 22, 4: 30 };
const TALENT_VERSION = 3;
const TALENTS_PER_GUARDIAN = 2;
const TALENTS_PER_SKILL_POINT = 2;
const TALENT_RESET_COST = (level) => 50 + level * level;

const TALENT_SCHOOLS = {};
const TALENTS = {};

function defineSchool(id, name, description, scope) {
  TALENT_SCHOOLS[id] = { id, name, description, ...scope, talents: [] };
}

// T(school, tier, kind, name, description, spec). The id is stable while talents are only appended to a school.
function T(schoolId, tier, kind, name, description, spec = {}) {
  const school = TALENT_SCHOOLS[schoolId];
  const id = `${schoolId}/${school.talents.length + 1}`;
  TALENTS[id] = { id, school: schoolId, tier, kind, name, description, cost: TALENT_TIER_COST[tier], ...spec };
  school.talents.push(id);
}

function getTalentDef(id) {
  return TALENTS[id] || null;
}

function isSchoolOpen(hero, school) {
  if (school.classes && !school.classes.includes(hero.classKey)) return false;
  if (school.subclass) return hero.subclass === school.subclass;
  if (school.profession) return hero.profession === school.profession;
  return true;
}

// Branch schools first: they are the heart of the build.
function getHeroSchools(hero) {
  const order = (school) => (school.profession ? 0 : school.subclass ? 1 : school.classOnly ? 2 : 3);
  return Object.values(TALENT_SCHOOLS).filter((school) => isSchoolOpen(hero, school)).sort((a, b) => order(a) - order(b));
}

// A talent works only while it stands on this hero's board. freeTalents is for isolated rule tests.
function getActiveTalentIds(hero) {
  const taken = (hero?.talents || []).filter((id) => TALENTS[id]);
  if (hero?.freeTalents || !getTalentBoard(hero).length) return taken.filter((id) => isSchoolOpen(hero, TALENT_SCHOOLS[TALENTS[id].school]));
  return taken.filter((id) => findBoardSlot(hero, id));
}

function getTalentPointsTotal(hero) {
  return getDevPointsTotal(hero);
}

function getTalentPointsSpent(hero) {
  return getActiveTalentIds(hero).reduce((sum, id) => {
    const place = hero.freeTalents ? null : findBoardSlot(hero, id);
    return sum + (place ? getSlotCost(place.slot) : TALENTS[id].cost);
  }, 0);
}

function getTalentPointsFree(hero) {
  return getDevPointsFree(hero);
}

function getSchoolPointsSpent(hero, schoolId) {
  return getActiveTalentIds(hero).filter((id) => TALENTS[id].school === schoolId).reduce((sum, id) => sum + TALENTS[id].cost, 0);
}

function getKeystoneLimit(hero) {
  return hero.level >= PROFESSION_UNLOCK_LEVEL ? 3 : hero.level >= SUBCLASS_UNLOCK_LEVEL ? 2 : 1;
}

function getKeystoneCount(hero) {
  return getActiveTalentIds(hero).filter((id) => TALENTS[id].kind === "key").length;
}

function canTakeTalent(hero, id) {
  const def = TALENTS[id];
  if (!def) return { ok: false, reason: "Такого таланта нет." };
  if (getTalentBoard(hero).length && !hero.freeTalents) {
    const place = findBoardSlot(hero, id);
    if (!place) return { ok: false, reason: "Этого таланта нет в твоих школах." };
    return getSlotState(hero, place.school, place.slot);
  }
  const school = TALENT_SCHOOLS[def.school];
  if (!isSchoolOpen(hero, school)) return { ok: false, reason: "Эта школа закрыта твоему пути." };
  if (hero.talents.includes(id)) return { ok: false, reason: "Талант уже взят." };
  const level = TALENT_TIER_LEVEL[def.tier];
  if (hero.level < level) return { ok: false, reason: `Нужен ${level} уровень.` };
  const earlier = Object.values(TALENTS).filter((other) => other.school === def.school && other.tier < def.tier);
  if (earlier.length) {
    const previous = Math.max(...earlier.map((other) => other.tier));
    if (!earlier.some((other) => other.tier === previous && hero.talents.includes(other.id))) return { ok: false, reason: "Сначала возьми талант предыдущего круга этой школы." };
  }
  if (def.kind === "key" && getKeystoneCount(hero) >= getKeystoneLimit(hero)) return { ok: false, reason: "Нет места для ещё одного ключевого таланта. Лимит растёт на 30 и 60 уровнях." };
  const clash = (def.excludes || []).some((other) => hero.talents.includes(other)) || hero.talents.some((other) => (TALENTS[other]?.excludes || []).includes(id));
  if (clash) return { ok: false, reason: "Несовместим с уже взятым талантом." };
  if (getTalentPointsFree(hero) < def.cost) return { ok: false, reason: `Нужно очков талантов: ${def.cost}.` };
  return { ok: true };
}

function takeTalent(hero, id) {
  const check = canTakeTalent(hero, id);
  if (!check.ok) return check;
  hero.talents = [...hero.talents, id];
  applyDerivedStats(hero);
  return { ok: true };
}

function resetTalents(hero) {
  if (getTalentBoard(hero).length && !hero.freeTalents) return resetBuild(hero);
  const cost = TALENT_RESET_COST(hero.level);
  if (!hero.talents.length) return { ok: false, reason: "Сбрасывать нечего." };
  if (hero.gold < cost) return { ok: false, reason: `Сброс стоит ${cost} золота.` };
  hero.gold -= cost;
  hero.talents = [];
  applyDerivedStats(hero);
  return { ok: true, cost };
}

function exchangeSkillPoint(hero) {
  if (Number(hero.skillPoints || 0) <= 0) return { ok: false, reason: "Нет свободных очков навыков." };
  hero.skillPoints -= 1;
  hero.talentsExchanged = Number(hero.talentsExchanged || 0) + 1;
  return { ok: true };
}

// Everything that can carry a hook or a modifier for this hero right now.
function getHeroFxDefs(hero) {
  const talents = getActiveTalentIds(hero).map((id) => TALENTS[id]);
  const traits = Object.values(hero.equipment || {}).map((item) => (item?.trait ? LEGENDARY_TRAITS[item.trait] : null)).filter(Boolean);
  const boons = (hero.expedition?.boons || []).map((id) => BOONS[id]).filter(Boolean);
  const shop = getActiveShopIds(hero).map(getShopPassiveDefinition).filter(Boolean);
  return [...talents, ...traits, ...boons, ...shop, ...getActiveSetBonuses(hero), ...getStoryBonusDefs(hero), ...getBuildFxDefs(hero)];
}

// Sums the numeric modifiers. Called from applyDerivedStats, so tm() stays cheap during battle.
function rebuildTalentMods(hero) {
  const mods = {};
  getHeroFxDefs(hero).forEach((def) => {
    Object.entries(def.mods || {}).forEach(([key, value]) => { mods[key] = Number(mods[key] || 0) + Number(value); });
  });
  hero.talentMods = mods;
  return mods;
}

function tm(unit, key) {
  return Number(unit?.talentMods?.[key] || 0);
}

function sumDefBonuses(hero, field) {
  const total = {};
  getHeroFxDefs(hero).forEach((def) => {
    Object.entries(def[field] || {}).forEach(([key, value]) => { total[key] = Number(total[key] || 0) + Number(value); });
  });
  return total;
}

// --- Helpers used inside hooks ---
function heroAttack(b) {
  return Math.max(b.hero.physicalDamage, b.hero.skillDamage);
}

function heroKind(b) {
  return b.hero.skillDamage > b.hero.physicalDamage ? "magic" : "physical";
}

// Applies an effect from inside a hook. A nested effect never triggers further "applied" hooks, so chains stay finite.
function announceProc(b) {
  const name = b.fxName;
  if (!name || b.fxSaid === name) return;
  b.fxSaid = name;
  emit(b, "proc", { text: name });
}

function fx(b, id, duration, value = 0, options = {}) {
  const target = options.self ? b.hero : b.enemy;
  if (target.currentHp <= 0) return null;
  announceProc(b);
  const applied = applyEffect(b, target, { id, duration, value, meta: options.meta || (id === "burn" ? { stacks: options.stacks || 1 } : {}) }, b.hero);
  if (applied.resisted) return null;
  emit(b, "effect", { target: options.self ? "hero" : "enemy", id });
  if (!options.self && !b.procDepth) {
    b.procDepth = 1;
    fireMech(b, "applied", { id, value: applied.value });
    b.procDepth = 0;
  }
  return applied;
}

// A dot sized from the hero's attack, so talents stay relevant at every level.
function dotValue(b, ratio, min = 3) {
  return Math.max(min, Math.round(heroAttack(b) * ratio));
}

function procHit(b, power, label, element = "steel", options = {}) {
  if (b.enemy.currentHp <= 0) return null;
  announceProc(b);
  return performHeroHit(b, { kind: options.kind || heroKind(b), power, flat: options.flat || 0, label, element, noEcho: true, sure: options.sure !== false, proc: true, pierce: options.pierce || 0, forceCrit: options.forceCrit || false });
}

// Damage that ignores defence, for payoffs like "all remaining poison at once".
function procDamage(b, amount, label, element = "steel") {
  if (b.enemy.currentHp <= 0 || amount <= 0) return 0;
  announceProc(b);
  const { hpDamage } = dealDamage(b, b.enemy, amount);
  emit(b, "hit", { target: "enemy", amount: hpDamage, crit: false, kind: "physical", element, label });
  logEvent(b, `${label}: ${hpDamage} урона.`, "Талант");
  return hpDamage;
}

function procHeal(b, ratio, label) {
  if (b.hero.currentHp < b.hero.maxHp) announceProc(b);
  return healUnit(b, b.hero, b.hero.maxHp * ratio, label);
}

function procMana(b, ratio) {
  const hero = b.hero;
  const before = hero.currentMana;
  hero.currentMana = Math.min(hero.maxMana, Math.round(hero.currentMana + hero.maxMana * ratio));
  if (hero.currentMana > before) emit(b, "mana", { target: "hero", amount: hero.currentMana - before });
}

function procShield(b, ratio) {
  announceProc(b);
  const applied = fx(b, "shield", 2, Math.round(b.hero.maxHp * ratio) + effectValue(b.hero, "shield"), { self: true });
  return applied;
}

function hasFx(unit, id) {
  return unitHasEffect(unit, id);
}

function removeFx(unit, id) {
  unit.effects = (unit.effects || []).filter((effect) => effect.id !== id);
}

function hpRatio(unit) {
  return unit.currentHp / Math.max(1, unit.maxHp);
}

function isDirectHit(ctx) {
  return !ctx.noEcho && !ctx.proc;
}

function ticksOf(b, id) {
  return Number(getEffect(b.enemy, id)?.meta?.elapsedTicks || 0);
}

function tickSummary(effect) {
  return effect ? effect.value * effect.duration : 0;
}

function bumpGauge(b, id, amount, max) {
  if (b.mech?.[id]) addGauge(b.mech[id], amount, max);
}

// Picks talents for the balance bot and for the "pick for me" button: the branch first, then its related schools.
const SCHOOLS_BY_PATH = {
  fire: ["burn", "arcana"], water: ["frost", "guard"], earth: ["control", "guard"], air: ["shock", "tempo"], spirit: ["pack", "life"], undead: ["pack", "hex"], light: ["life", "guard"], dark: ["hex", "pack"],
  berserk: ["bleed", "life"], breaker: ["control", "power"], guardian: ["guard", "life"], duelist: ["crit", "tempo"],
  sniper: ["crit", "power"], stormshot: ["tempo", "crit"], ranger: ["poison", "control"], beastmaster: ["pack", "bleed"],
  skald: ["tempo", "control"], trickster: ["hex", "crit"], cantor: ["life", "guard"], choirmaster: ["pack", "life"],
  blade: ["crit", "bleed"], phantom: ["evasion", "crit"], poisoner: ["poison", "evasion"], plaguebearer: ["poison", "bleed"]
};
const DEFAULT_CLASS_SCHOOLS = { warrior: ["bleed", "life"], mage: ["arcana", "burn"], archer: ["crit", "power"], bard: ["life", "tempo"], assassin: ["crit", "poison"] };

function autoSpendTalents(hero, wanted = null) {
  if (getTalentBoard(hero).length && !hero.freeTalents) { autoBuild(hero); return; }
  const path = SCHOOLS_BY_PATH[hero.profession] || SCHOOLS_BY_PATH[wanted] || DEFAULT_CLASS_SCHOOLS[hero.classKey] || [];
  const branch = getHeroSchools(hero).filter((school) => school.profession || school.subclass || school.classOnly).map((school) => school.id);
  const order = [...new Set([...branch, ...path, ...getHeroSchools(hero).map((school) => school.id)])];
  let guard = 0;
  let picked = true;
  while (picked && guard++ < 200) {
    picked = false;
    for (const schoolId of order) {
      const id = TALENT_SCHOOLS[schoolId].talents.filter((talent) => canTakeTalent(hero, talent).ok).sort((a, b) => TALENTS[a].tier - TALENTS[b].tier)[0];
      if (id) {
        hero.talents = [...hero.talents, id];
        picked = true;
        break;
      }
    }
  }
  applyDerivedStats(hero);
}
