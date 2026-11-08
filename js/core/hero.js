// Hero creation, derived stats, levelling and skill management.
function deriveStats(stats, level = 1, isBoss = false) {
  const F = BATTLE_FORMULAS;
  const boost = isBoss ? F.bossMultiplier : 1;
  return {
    maxHp: Math.round((F.healthBase + stats.endurance * F.healthPerEndurance + level * F.healthPerLevel) * boost),
    maxMana: Math.round((F.manaBase + stats.intellect * F.manaPerIntellect + level * F.manaPerLevel) * boost),
    physicalDamage: Math.round((F.physicalDamageBase + stats.strength * F.physicalDamagePerStrength + level * F.physicalDamagePerLevel) * boost),
    skillDamage: Math.round((F.skillDamageBase + stats.intellect * F.skillDamagePerIntellect + level * F.skillDamagePerLevel) * boost),
    physicalDefense: Math.round((stats.endurance * F.physicalDefensePerEndurance + level * F.physicalDefensePerLevel) * boost),
    magicDefense: Math.round((stats.endurance * F.magicDefensePerEndurance + level * F.magicDefensePerLevel) * boost),
    shieldPower: Math.round((F.shieldBase + stats.spirituality * F.shieldPerSpirituality + level * F.shieldPerLevel) * boost),
    healingPower: Math.round((F.healingBase + stats.spirituality * F.healingPerSpirituality + level * F.healingPerLevel) * boost),
    critChance: Number(clamp(F.critBase + (stats.luck / (stats.luck + 25 + level)) * 60 + level * F.critPerLevel, 5, 60).toFixed(1)),
    dropChance: Number(clamp(F.dropBase + stats.luck * F.dropPerLuck, 10, 95).toFixed(1)),
    dropQuality: Number(clamp(F.qualityBase + stats.luck * F.qualityPerLuck + level * F.qualityPerLevel, 1, 12).toFixed(1)),
    dodgeChance: Number(clamp(F.dodgeBase + (stats.agility / (stats.agility + 30 + level)) * 50, 3, 40).toFixed(1)),
    attackSpeed: Math.round((F.speedBase + stats.agility * F.speedPerAgility + level * F.speedPerLevel) * boost)
  };
}

function getExperienceForNextLevel(level) {
  return 80 + level * 30 + level * level * 6;
}

function createEmptyEquipment() {
  return { ...EQUIPMENT_SLOT_TEMPLATE };
}

function createEmptyResources() {
  return Object.fromEntries(SHOP_RESOURCE_CATALOG.map((resource) => [resource.id, 0]));
}

function createHero({ name, classKey, allocated = {} }) {
  const base = classDefinitions[classKey].stats;
  const stats = createStatBlock(Object.fromEntries(STAT_KEYS.map((key) => [key, base[key] + Number(allocated[key] || 0)])));
  const starterActive = getFreeStarterSkillIds(classKey, "active");
  const blueprint = ITEM_BLUEPRINTS.find((bp) => bp.name === STARTER_WEAPON[classKey]);
  const equipment = createEmptyEquipment();
  equipment["weapon-1"] = generateItem({ level: 1, rarity: "white", blueprint });
  const hero = {
    id: uid("hero"), name, classKey, className: classDefinitions[classKey].name,
    subclass: null, profession: null,
    level: 1, experience: 0, statPoints: 0, skillPoints: getEarnedSkillPointsForLevel(1),
    gold: 40, mutationShards: 0, resources: createEmptyResources(), potions: { hp: 2, mp: 1 },
    stats, startingStats: { ...stats },
    inventory: Array(INVENTORY_SIZE).fill(null), equipment,
    knownSkillIds: getFreeStarterSkillIds(classKey), passiveIds: getFreeStarterSkillIds(classKey, "passive"),
    activeSkillSlots: [starterActive[0] || null, null, null, null, null],
    skillProgress: {}, shopPassiveIds: [], shopActive: [], talents: [], talentVersion: TALENT_VERSION, talentsExchanged: 0,
    skillForms: {}, skillPicks: {}, styleId: null, ultimateId: null, ultimateSeen: [], buildVersion: BUILD_VERSION, story: (() => { const story = newStoryState(); queueStoryOpening(story, classKey); return story; })(), unlockedRegion: 0, trailClears: {}, lairTokens: {}, lairClears: {}, defeatedGuardians: [], won: false,
    records: { kills: 0, bosses: 0, elites: 0, expeditions: 0, completed: 0, deaths: 0, maxHit: 0, bestiary: {} },
    expedition: null, shop: null,
    createdAt: Date.now(), updatedAt: Date.now(),
    effects: [], summonedUnits: [], cooldowns: {}
  };
  applyDerivedStats(hero, true);
  return hero;
}

function calculateEquipmentBonuses(unit) {
  const stats = createStatBlock();
  const flats = createFlatBonusBlock();
  Object.values(unit.equipment || {}).forEach((item) => {
    if (!item) return;
    const bonus = getItemBonuses(item);
    STAT_KEYS.forEach((key) => { stats[key] += bonus.stats[key]; });
    FLAT_BONUS_KEYS.forEach((key) => { flats[key] += bonus.flats[key]; });
  });
  return { stats, flats };
}

function calculatePassiveBonuses(unit) {
  const stats = createStatBlock();
  const derived = createDerivedBonusBlock();
  getKnownPassiveSkillIds(unit).forEach((id) => {
    const mods = getSkillDefinition(id)?.modifiers || {};
    Object.entries(mods.stats || {}).forEach(([key, value]) => { if (STAT_KEYS.includes(key)) stats[key] += Number(value || 0); });
    Object.entries(mods.derived || {}).forEach(([key, value]) => { if (DERIVED_BONUS_KEYS.includes(key)) derived[key] += Number(value || 0); });
  });
  Object.entries(sumDefBonuses(unit, "stats")).forEach(([key, value]) => { if (STAT_KEYS.includes(key)) stats[key] += value; });
  Object.entries(sumDefBonuses(unit, "derived")).forEach(([key, value]) => { if (DERIVED_BONUS_KEYS.includes(key)) derived[key] += value; });
  return { stats, derived };
}

function applyDerivedStats(unit, restore = false) {
  if (unit?.side !== "enemy" && Array.isArray(unit?.knownSkillIds)) syncKnownSkills(unit);
  const hpRatio = unit.maxHp ? unit.currentHp / unit.maxHp : 1;
  const manaRatio = unit.maxMana ? unit.currentMana / unit.maxMana : 1;
  rebuildTalentMods(unit);
  const equipment = calculateEquipmentBonuses(unit);
  const passive = calculatePassiveBonuses(unit);
  unit.equipmentBonuses = equipment.stats;
  unit.passiveStatBonuses = passive.stats;
  unit.totalStats = Object.fromEntries(STAT_KEYS.map((key) => [key, unit.stats[key] + equipment.stats[key] + passive.stats[key]]));
  Object.assign(unit, deriveStats(unit.totalStats, unit.level, false));
  unit.maxHp = Math.round(unit.maxHp * (CLASS_HP_FACTOR[unit.classKey] || 1));
  const classDamage = CLASS_DAMAGE_FACTOR[unit.classKey] || 1;
  unit.physicalDamage = Math.round(unit.physicalDamage * classDamage);
  unit.skillDamage = Math.round(unit.skillDamage * classDamage);
  DERIVED_BONUS_KEYS.forEach((key) => {
    unit[key] += Number(equipment.flats[key] || 0) + Number(passive.derived[key] || 0);
    if (isPercentStat(key) || key === "dropQuality" || key === "attackSpeed") unit[key] = Number(unit[key].toFixed(1));
  });
  unit.maxHp = Math.max(1, Math.round(unit.maxHp * (1 + tm(unit, "maxHpPct"))));
  unit.critChance = Math.max(0, Math.min(CRIT_CAP, unit.critChance));
  if (CLASS_RESOURCES[unit.classKey]?.max) unit.maxMana = CLASS_RESOURCES[unit.classKey].max;
  unit.dodgeChance = Math.min(DODGE_CAP, unit.dodgeChance);
  unit.traits = Object.values(unit.equipment || {}).map((item) => item?.trait).filter(Boolean);
  if (restore) {
    unit.currentHp = unit.maxHp;
    unit.currentMana = unit.maxMana;
  } else {
    unit.currentHp = clamp(Math.round(unit.maxHp * hpRatio), 1, unit.maxHp);
    unit.currentMana = clamp(Math.round(unit.maxMana * manaRatio), 0, unit.maxMana);
  }
}

function clearBattleState(hero) {
  hero.effects = [];
  hero.summonedUnits = [];
  hero.cooldowns = {};
  hero.speedMult = 1;
}

function restoreHero(hero) {
  clearBattleState(hero);
  applyDerivedStats(hero, true);
}

function awardExperience(hero, amount) {
  const previousLevel = hero.level;
  hero.experience += Math.round(amount);
  let skillPoints = 0;
  while (hero.experience >= getExperienceForNextLevel(hero.level)) {
    hero.experience -= getExperienceForNextLevel(hero.level);
    hero.level += 1;
    hero.statPoints += STAT_POINTS_PER_LEVEL;
    const gained = getEarnedSkillPointsForLevel(hero.level) - getEarnedSkillPointsForLevel(hero.level - 1);
    hero.skillPoints += gained;
    skillPoints += gained;
  }
  const levels = hero.level - previousLevel;
  if (levels > 0) applyDerivedStats(hero);
  return {
    previousLevel, newLevel: hero.level, levels, statPoints: levels * STAT_POINTS_PER_LEVEL, skillPoints,
    unlocked: levels > 0 ? getVisibleClassSkills(hero).filter((skill) => Number(skill.unlockLevel) > previousLevel && Number(skill.unlockLevel) <= hero.level).map((skill) => skill.id) : []
  };
}

function addStatPoint(hero, statKey, amount = 1) {
  const spend = Math.min(amount, hero.statPoints);
  if (spend <= 0 || !STAT_KEYS.includes(statKey)) return false;
  hero.stats[statKey] += spend;
  hero.statPoints -= spend;
  applyDerivedStats(hero);
  return true;
}

function learnSkill(hero, skillId) {
  const skill = getSkillDefinition(skillId);
  const stateKey = getSkillStudyState(hero, skill);
  if (stateKey === "LEARNED") return { ok: false, reason: "Навык уже изучен." };
  if (stateKey === "LOCKED") return { ok: false, reason: `Откроется на ${skill?.unlockLevel} уровне.` };
  if (stateKey === "NO_POINTS") return { ok: false, reason: "Нет очков навыков." };
  if (stateKey === "NEEDS_PREV") return { ok: false, reason: `Сначала изучи: ${getSkillPrereqs(skill).map((other) => other.name).join(" или ")}.` };
  hero.skillPoints -= 1;
  hero.knownSkillIds = normalizeSkillIdList([...hero.knownSkillIds, skillId]);
  if (skill.category === "passive") {
    hero.passiveIds = normalizeSkillIdList([...hero.passiveIds, skillId], "passive");
    applyDerivedStats(hero);
  } else {
    const free = hero.activeSkillSlots.findIndex((slot) => !slot);
    if (free >= 0) hero.activeSkillSlots[free] = skillId;
  }
  return { ok: true };
}

function assignSkillToSlot(hero, skillId, slotIndex) {
  const skill = getSkillDefinition(skillId);
  if (skill?.category !== "active" || !isSkillLearned(hero, skillId)) return false;
  const existing = hero.activeSkillSlots.indexOf(skillId);
  if (existing >= 0) hero.activeSkillSlots[existing] = hero.activeSkillSlots[slotIndex] || null;
  hero.activeSkillSlots[slotIndex] = skillId;
  return true;
}

function clearSkillSlot(hero, slotIndex) {
  hero.activeSkillSlots[slotIndex] = null;
}

function chooseSkillBonus(hero, skillId, choiceId) {
  const skill = getSkillDefinition(skillId);
  const progress = getSkillProgress(hero, skillId);
  if (!skill || !progress || progress.level < SKILL_MAX_LEVEL || progress.bonusChoice) return false;
  if (!getSkillBonusChoice(skill, choiceId)) return false;
  progress.bonusChoice = choiceId;
  return true;
}

function getBranchChangeCost(hero) {
  return 100 + hero.level * hero.level * 3;
}

function dropForeignSkillsFromSlots(hero) {
  hero.activeSkillSlots = hero.activeSkillSlots.map((id) => (id && doesSkillMatchBranch(getSkillDefinition(id), hero) ? id : null));
  hero.talents = getActiveTalentIds(hero);
  applyDerivedStats(hero);
}

// Step two of the path. The first choice is free; changing it costs gold and also resets the profession.
function chooseSubclass(hero, subclassId) {
  if (hero.level < SUBCLASS_UNLOCK_LEVEL) return { ok: false, reason: `Подкласс откроется на ${SUBCLASS_UNLOCK_LEVEL} уровне.` };
  if (!getBranchCatalog(hero.classKey).subclasses[subclassId]) return { ok: false, reason: "Такого пути у класса нет." };
  if (hero.subclass === subclassId) return { ok: false, reason: "Этот путь уже выбран." };
  const cost = hero.subclass ? getBranchChangeCost(hero) : 0;
  if (hero.gold < cost) return { ok: false, reason: `Смена пути стоит ${cost} золота.` };
  hero.gold -= cost;
  hero.subclass = subclassId;
  hero.profession = null;
  dropForeignSkillsFromSlots(hero);
  return { ok: true, cost };
}

// Step three: a profession inside the chosen subclass. Learned skills wait for a return to that path.
function chooseProfession(hero, professionId) {
  const profession = getBranchCatalog(hero.classKey).professions[professionId];
  if (hero.level < PROFESSION_UNLOCK_LEVEL) return { ok: false, reason: `Профессия откроется на ${PROFESSION_UNLOCK_LEVEL} уровне.` };
  if (!hero.subclass) return { ok: false, reason: "Сначала выбери подкласс." };
  if (!profession || profession.subclassId !== hero.subclass) return { ok: false, reason: "Эта профессия относится к другому подклассу." };
  if (hero.profession === professionId) return { ok: false, reason: "Эта профессия уже выбрана." };
  const cost = hero.profession ? getBranchChangeCost(hero) : 0;
  if (hero.gold < cost) return { ok: false, reason: `Смена профессии стоит ${cost} золота.` };
  hero.gold -= cost;
  hero.profession = professionId;
  dropForeignSkillsFromSlots(hero);
  return { ok: true, cost };
}

function getHeroPowerRating(hero) {
  const offense = Math.max(hero.physicalDamage, hero.skillDamage);
  return Math.round(offense * 2 + hero.maxHp * 0.15 + (hero.physicalDefense + hero.magicDefense) * 0.6);
}
