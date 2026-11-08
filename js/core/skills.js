// Skill lookups, mastery, branch rules and skill descriptions.
function getSkillDefinition(skillId) {
  return skillId ? SKILL_CATALOG[skillId] || null : null;
}

function getBranchCatalog(classKey) {
  return BRANCH_CATALOG[classKey] || { subclasses: {}, professions: {} };
}

function normalizeBranchSelection(classKey, subclassId = null, professionId = null) {
  const catalog = getBranchCatalog(classKey);
  const profession = professionId ? catalog.professions[professionId] : null;
  const subclass = (subclassId && catalog.subclasses[subclassId]) || (profession ? catalog.subclasses[profession.subclassId] : null);
  return {
    subclass: subclass?.id || null,
    profession: profession && subclass && profession.subclassId === subclass.id ? profession.id : null
  };
}

function getCharacterBranchState(unit) {
  const catalog = getBranchCatalog(unit?.classKey);
  const selection = normalizeBranchSelection(unit?.classKey, unit?.subclass, unit?.profession);
  return { ...selection, subclassDefinition: catalog.subclasses[selection.subclass] || null, professionDefinition: catalog.professions[selection.profession] || null };
}

function getHeroTitle(unit) {
  const branch = getCharacterBranchState(unit);
  return branch.professionDefinition?.name || branch.subclassDefinition?.name || classDefinitions[unit?.classKey]?.name || "Странник";
}

function doesSkillMatchBranch(skill, unit) {
  if (!skill || skill.classId !== unit?.classKey) return false;
  const branch = normalizeBranchSelection(unit.classKey, unit.subclass, unit.profession);
  if (skill.subclass && skill.subclass !== branch.subclass) return false;
  if (skill.profession && skill.profession !== branch.profession) return false;
  return true;
}

function getVisibleClassSkills(unit, category = null) {
  return Object.values(SKILL_CATALOG)
    .filter((skill) => doesSkillMatchBranch(skill, unit) && !skill.hidden && (!category || skill.category === category))
    .sort((a, b) => Number(a.unlockLevel || 1) - Number(b.unlockLevel || 1) || a.name.localeCompare(b.name, "ru"));
}

function normalizeSkillIdList(skillIds = [], category = null) {
  const seen = new Set();
  return (skillIds || []).filter((id) => {
    const skill = getSkillDefinition(id);
    if (!skill || (category && skill.category !== category) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getFreeStarterSkillIds(classKey, category = null) {
  return Object.values(SKILL_CATALOG)
    .filter((skill) => skill.classId === classKey && (skill.tags || []).includes("starter") && (!category || skill.category === category))
    .map((skill) => skill.id);
}

function getEarnedSkillPointsForLevel(level = 1) {
  return Math.floor(Number(level || 1) / SKILL_POINT_LEVEL_INTERVAL);
}

function isSkillLearned(unit, skillId) {
  return (unit?.knownSkillIds || []).includes(skillId) || (unit?.passiveIds || []).includes(skillId);
}

// The branch a skill grows on: the class trunk, a subclass or a profession.
function getSkillBranchKey(skill) {
  return skill.profession ? `p:${skill.profession}` : skill.subclass ? `s:${skill.subclass}` : "c";
}

// Skills of one branch at the previous level: at least one of them must be learned first.
function getSkillPrereqs(skill) {
  const key = getSkillBranchKey(skill);
  const level = Number(skill.unlockLevel || 1);
  const same = Object.values(SKILL_CATALOG).filter((other) => other.classId === skill.classId && !other.hidden && getSkillBranchKey(other) === key && Number(other.unlockLevel || 1) < level);
  if (!same.length) return [];
  const previous = Math.max(...same.map((other) => Number(other.unlockLevel || 1)));
  return same.filter((other) => Number(other.unlockLevel || 1) === previous);
}

function getSkillStudyState(unit, skill) {
  if (!unit || !skill || !doesSkillMatchBranch(skill, unit)) return "LOCKED";
  if (isSkillLearned(unit, skill.id)) return "LEARNED";
  if (Number(skill.unlockLevel || 1) > unit.level) return "LOCKED";
  const prereqs = getSkillPrereqs(skill);
  if (prereqs.length && !prereqs.some((other) => isSkillLearned(unit, other.id))) return "NEEDS_PREV";
  return Number(unit.skillPoints || 0) > 0 ? "AVAILABLE" : "NO_POINTS";
}

function getKnownPassiveSkillIds(unit) {
  return normalizeSkillIdList(unit?.passiveIds || [], "passive").filter((id) => doesSkillMatchBranch(getSkillDefinition(id), unit));
}

function getActiveSkillFromSlot(unit, index) {
  const skill = getSkillDefinition(unit?.activeSkillSlots?.[index]);
  return skill?.category === "active" && doesSkillMatchBranch(skill, unit) && isSkillLearned(unit, skill.id) ? getHeroSkill(unit, skill) : null;
}

function getSkillExpToNextLevel(level = 1) {
  return level >= SKILL_MAX_LEVEL ? 0 : Number(SKILL_EXP_TABLE[Math.max(0, level - 1)] || 0);
}

function getSkillProgress(unit, skillId) {
  if (!unit || !skillId || getSkillDefinition(skillId)?.category !== "active") return null;
  unit.skillProgress = unit.skillProgress || {};
  if (!unit.skillProgress[skillId]) {
    unit.skillProgress[skillId] = { level: 1, exp: 0, expToNext: getSkillExpToNextLevel(1), bonusChoice: null, mutation: null };
  }
  return unit.skillProgress[skillId];
}

function getSkillMasteryChoices(skill) {
  if (!skill || skill.category !== "active") return [];
  if (skill.masteryChoices?.length) return skill.masteryChoices.map((id) => SKILL_BONUS_OPTIONS[id]).filter(Boolean);
  const options = SKILL_BONUS_OPTIONS;
  const hasEffects = (skill.appliedEffects || []).length > 0;
  const heals = Number(skill.selfHealMultiplier || 0) > 0 || (skill.appliedEffects || []).some((effect) => effect.id === "regeneration");
  if (!skill.attackType && Number(skill.selfHealMultiplier || 0) > 0) return [options.restoration, options.control, options.efficiency];
  if (heals) return [options.power, options.restoration, options.efficiency];
  if (hasEffects) return [options.power, options.control, options.efficiency];
  if (skill.attackType) return [options.power, options.precision, options.efficiency];
  return [options.power, options.control, options.efficiency];
}

function getSkillBonusChoice(skill, choiceId) {
  return getSkillMasteryChoices(skill).find((choice) => choice.id === choiceId) || null;
}

function getSkillMutation(unit, skillId) {
  return MUTATIONS[getSkillProgress(unit, skillId)?.mutation] || null;
}

function getSkillMasterySnapshot(skill, unit) {
  const progress = getSkillProgress(unit, skill?.id);
  const level = clamp(Number(progress?.level || 1), 1, SKILL_MAX_LEVEL);
  const offset = level - 1;
  const choice = getSkillBonusChoice(skill, progress?.bonusChoice || null);
  const mods = choice?.modifiers || {};
  const mutation = MUTATIONS[progress?.mutation] || null;
  return {
    level, progress, choice, mutation,
    damageMultiplier: (1 + offset * SKILL_LEVEL_POWER_STEP) * (1 + Number(mods.damageMultiplier || 0)) * (mutation?.id === "blood" ? 1.3 : 1),
    healMultiplier: (1 + offset * SKILL_LEVEL_POWER_STEP) * (1 + Number(mods.healMultiplier || 0)),
    effectValueMultiplier: (1 + offset * SKILL_LEVEL_EFFECT_STEP) * (1 + Number(mods.effectValueMultiplier || 0)),
    effectChanceBonus: offset * SKILL_LEVEL_CHANCE_STEP + Number(mods.effectChanceBonus || 0) + (mutation?.id === "stable" ? 0.15 : 0),
    effectDurationBonus: Number(mods.effectDurationBonus || 0) + (mutation?.id === "stable" ? 1 : 0),
    resourceCostMultiplier: Number(mods.resourceCostMultiplier || 1),
    critBonus: Number(mods.critBonus || 0),
    burnDurationBonus: Number(mods.burnDurationBonus || 0),
    burnStackBonus: Number(mods.burnStackBonus || 0),
    burnMaxStacksBonus: Number(mods.burnMaxStacksBonus || 0),
    burnDetonationMultiplier: Number(mods.burnDetonationMultiplier || 0),
    darkSacrificeMode: mods.darkSacrificeMode || null
  };
}

function grantSkillExperience(unit, skillId, amount = SKILL_EXP_PER_USE) {
  const progress = getSkillProgress(unit, skillId);
  if (!progress || progress.level >= SKILL_MAX_LEVEL) return null;
  progress.exp += amount;
  let leveledUpTo = null;
  while (progress.level < SKILL_MAX_LEVEL && progress.exp >= progress.expToNext) {
    progress.exp -= progress.expToNext;
    progress.level += 1;
    progress.expToNext = getSkillExpToNextLevel(progress.level);
    leveledUpTo = progress.level;
  }
  if (progress.level >= SKILL_MAX_LEVEL) progress.exp = 0;
  return leveledUpTo ? { skillId, leveledUpTo, reachedMaxLevel: progress.level >= SKILL_MAX_LEVEL } : null;
}

function getPendingMasterySkills(unit) {
  return Object.keys(unit?.skillProgress || {}).filter((id) => {
    const skill = getSkillDefinition(id);
    const progress = unit.skillProgress[id];
    return skill && doesSkillMatchBranch(skill, unit) && progress.level >= SKILL_MAX_LEVEL && !progress.bonusChoice;
  });
}

function getSkillResourceType(skill) {
  return skill?.resourceType || "mana";
}

function getSkillResourceCost(skill, unit) {
  const base = Number(skill?.resourceCost || 0);
  if (base <= 0) return 0;
  const costMod = 1 + (getSkillResourceType(skill) === "hp" ? tm(unit, "hpCost") : tm(unit, "manaCost"));
  const scale = getSkillResourceType(skill) === "hp" ? 1 : Number(CLASS_RESOURCES[unit?.classKey]?.costScale || 1);
  return Math.max(1, Math.round(base * scale * getSkillMasterySnapshot(skill, unit).resourceCostMultiplier * Math.max(0.1, costMod)));
}

function getSkillCooldown(skill, unit) {
  const base = Number(skill?.cooldown || 0);
  return getSkillMutation(unit, skill?.id)?.id === "echo" ? Math.max(0, base - 1) : base;
}

function getSkillExtraDamage(attacker, skill) {
  return Math.round(Object.entries(skill?.extraScaling || {}).reduce((sum, [stat, mult]) => sum + Number(attacker.totalStats?.[stat] ?? attacker.stats?.[stat] ?? 0) * Number(mult || 0), 0));
}

function getSkillPower(skill, unit) {
  const mastery = getSkillMasterySnapshot(skill, unit);
  const echoBonus = mastery.mutation?.id === "echo" && !Number(skill.cooldown || 0) ? 1.1 : 1;
  return Number(skill.powerMultiplier || 1) * SKILL_POWER_BALANCE_MULTIPLIER * mastery.damageMultiplier * echoBonus;
}

function getSkillDamagePreview(skill, unit) {
  if (!skill?.attackType || !unit) return 0;
  const base = skill.attackType === "skill" ? unit.skillDamage : unit.physicalDamage;
  return Math.max(1, Math.round((base * getSkillPower(skill, unit) + getSkillExtraDamage(unit, skill)) * Number(skill.hits || 1)));
}

function getSkillSelfHealAmount(skill, unit) {
  if (!unit || !skill?.selfHealMultiplier) return 0;
  return Math.max(8, Math.round((unit.healingPower + unit.skillDamage * 0.4) * Number(skill.selfHealMultiplier) * getSkillMasterySnapshot(skill, unit).healMultiplier));
}

function getSkillEffectChance(skill, config, unit) {
  const base = Number(config?.chance ?? 1);
  return clamp(base < 1 ? base + getSkillMasterySnapshot(skill, unit).effectChanceBonus : base, 0, 1);
}

function getSkillEffectDuration(skill, config, unit) {
  const mastery = getSkillMasterySnapshot(skill, unit);
  return Math.max(1, Number(config?.duration || 1) + mastery.effectDurationBonus + (config?.id === "burn" ? mastery.burnDurationBonus : 0));
}

function getSkillEffectStacks(skill, config, unit) {
  const base = Math.max(1, Number(config?.meta?.stacks || 1));
  return config?.id === "burn" ? Math.max(1, base + getSkillMasterySnapshot(skill, unit).burnStackBonus) : base;
}

function getSkillEffectBurnCap(skill, unit) {
  return BURN_DETONATION_THRESHOLD + getSkillMasterySnapshot(skill, unit).burnMaxStacksBonus;
}

function resolveSkillEffectValue(unit, config, skill = null) {
  const mastery = skill ? getSkillMasterySnapshot(skill, unit) : null;
  const mult = config.id === "regeneration" ? mastery?.healMultiplier || 1 : mastery?.effectValueMultiplier || 1;
  if (config.valueFormula) {
    const source = unit?.[config.valueFormula.sourceStat] ?? unit?.totalStats?.[config.valueFormula.sourceStat] ?? 0;
    return Math.max(Number(config.valueFormula.minValue || 0), Math.round(Number(source) * Number(config.valueFormula.multiplier || 0) * mult));
  }
  if (STATUS_EFFECT_DEFINITIONS[config.id]?.ratio) {
    const value = Number(config.value || 0);
    return config.id === "evasion" ? Math.round(value * mult) : Math.min(0.75, value * mult);
  }
  return Math.max(0, Math.round(Number(config.value || 0) * mult));
}

function describeEffectConfig(skill, config, unit) {
  const def = STATUS_EFFECT_DEFINITIONS[config.id] || {};
  const chance = getSkillEffectChance(skill, config, unit);
  const chanceLabel = chance < 1 ? `${Math.round(chance * 100)}% шанс: ` : "";
  const value = resolveSkillEffectValue(unit, config, skill);
  const turns = turnsLabel(getSkillEffectDuration(skill, config, unit));
  const name = (def.name || config.id).toLowerCase();
  switch (config.id) {
    case "poison": case "bleed": return `${chanceLabel}${name}, ${value} урона за ход, ${turns}`;
    case "burn": { const stacks = getSkillEffectStacks(skill, config, unit); return `${chanceLabel}горение, ${value} урона за ход, ${turns}${stacks > 1 ? `, ${stacks} стака` : ""}`; }
    case "regeneration": return `${chanceLabel}регенерация, ${value} здоровья за ход, ${turns}`;
    case "stun": return `${chanceLabel}оглушение цели (по боссам и при повторе шанс ниже)`;
    case "frost": return `${chanceLabel}иней, замедление на ${Math.round((value >= 1 ? 0.2 : value) * 100)}%, ${turns}`;
    case "evasion": return `${chanceLabel}+${value}% уклонения, ${turns}`;
    case "weaken": case "mark": case "armor_break": case "rage": case "haste": case "fortify": case "thorns": case "dark_fury":
      return `${chanceLabel}${name} ${Math.round(value * 100)}%, ${turns}`;
    default: return `${chanceLabel}${name}, ${turns}`;
  }
}

// Short human-readable breakdown for tooltips: returns an array of lines.
function describeSkillDetails(skill, unit) {
  if (!skill || !unit) return [];
  if (skill.category === "passive") return [getPassiveBonusDescription(skill)];
  const lines = [];
  if (skill.classId === "bard") lines.push(`Нота: ${BARD_NOTES[bardNoteOf({ type: "skill", skill })]}`);
  const cost = getSkillResourceCost(skill, unit);
  const costLabel = cost > 0 ? `${getSkillResourceType(skill) === "hp" ? "Здоровье" : "Мана"}: ${cost}` : "Бесплатно";
  const cd = getSkillCooldown(skill, unit);
  const tempo = Number(skill.tempo || 1);
  lines.push([costLabel, cd > 0 ? `Откат: ${turnsLabel(cd)}` : "Без отката", tempo < 1 ? "Быстрый" : tempo > 1 ? "Медленный" : ""].filter(Boolean).join(" · "));
  if (skill.attackType) {
    const hits = Number(skill.hits || 1);
    lines.push(`${skill.attackType === "skill" ? "Магический" : "Физический"} урон: около ${getSkillDamagePreview(skill, unit)} до защиты${hits > 1 ? ` (${hits} удара)` : ""}`);
  }
  if (skill.selfHealMultiplier) lines.push(`Лечение: около ${getSkillSelfHealAmount(skill, unit)}`);
  if (skill.specialAction === "light_shield") {
    const value = resolveSkillEffectValue(unit, { id: "shield", valueFormula: skill.shieldEffect?.valueFormula }, skill);
    lines.push(`Щит: ${value} прочности, ${turnsLabel(getSkillEffectDuration(skill, { id: "shield", duration: skill.shieldEffect?.duration || 2 }, unit))}`);
  }
  if (skill.specialAction === "dark_sacrifice") {
    const mode = getSkillMasterySnapshot(skill, unit).darkSacrificeMode || "damage";
    lines.push(`Жертва слуги: ${mode === "heal" ? "лечение" : mode === "buff" ? "усиление" : "урон"}`);
  }
  if (skill.summonUnitConfig) {
    const config = skill.summonUnitConfig;
    lines.push(`Призыв: ${config.name}, действует ${turnsLabel(Number(config.duration || 3))}${config.type === "spirit" ? ", лечит героя" : ", бьёт врага и снижает его защиту"}`);
  }
  (skill.appliedEffects || []).forEach((config) => lines.push(describeEffectConfig(skill, config, unit)));
  const mastery = getSkillMasterySnapshot(skill, unit);
  if (mastery.progress) {
    lines.push(mastery.level >= SKILL_MAX_LEVEL ? `Мастерство: V (максимум)${mastery.choice ? ` · ${mastery.choice.name}` : " · выбери бонус"}` : `Мастерство: ${mastery.level} (${mastery.progress.exp}/${mastery.progress.expToNext})`);
  }
  if (mastery.mutation) lines.push(`Мутация: ${mastery.mutation.name}`);
  return lines;
}

function getPassiveBonusDescription(skill) {
  const mods = skill?.modifiers || {};
  const parts = [];
  Object.entries(mods.stats || {}).forEach(([key, value]) => parts.push(`+${value} ${statLabel(key).toLowerCase()}`));
  Object.entries(mods.derived || {}).forEach(([key, value]) => parts.push(`+${value}${isPercentStat(key) ? "%" : ""} ${flatBonusLabel(key)}`));
  Object.entries(mods.effects || {}).forEach(([effectId, effectMods]) => {
    const name = STATUS_EFFECT_DEFINITIONS[effectId]?.name || effectId;
    Object.entries(effectMods || {}).forEach(([key, value]) => {
      if (key === "stackBonusOnApply") parts.push(`${name}: +${value} стак`);
      if (key === "durationBonus") parts.push(`${name}: +${value} ход`);
      if (key === "detonationMultiplier") parts.push(`${name}: детонация +${Math.round(value * 100)}%`);
      if (key === "critChanceBonusVsAffected") parts.push(`${name}: +${value}% крита по цели`);
      if (key === "defenseShredPerTick") parts.push(`${name}: -${value} защиты за тик`);
      if (key === "damageToAffectedMultiplier") parts.push(`${name}: +${Math.round(value * 100)}% урона по цели`);
    });
  });
  Object.entries(mods.special || {}).forEach(([scope, scopeMods]) => {
    Object.entries(scopeMods || {}).forEach(([key, value]) => {
      if (key === "damageTakenMultiplier") parts.push(`Получаемый урон ${Math.round(value * 100)}%`);
      if (key === "minionHpBonus") parts.push(`Слуга: +${value} здоровья`);
      if (key === "minionDurationBonus") parts.push(`Слуга: +${value} ход`);
      if (key === "sacrificeMultiplier") parts.push(`Жертва: +${Math.round(value * 100)}%`);
      if (key === "unitDurationBonus") parts.push(`Призывы: +${value} ход`);
      if (key === "unitHpBonus") parts.push(`Призывы: +${value} здоровья`);
      if (key === "unitActionPowerMultiplier") parts.push(`${scope.endsWith("undead") ? "Нежить" : "Духи"}: +${Math.round(value * 100)}% силы`);
    });
  });
  return parts.join(" · ") || "Постоянный эффект.";
}

function getShopPassiveDefinition(id) {
  return SHOP_PASSIVE_CATALOG.find((entry) => entry.id === id) || null;
}

function getOwnedShopPassives(unit, effectType = null) {
  const owned = (unit?.classKey ? getActiveShopIds(unit) : []).map(getShopPassiveDefinition).filter(Boolean);
  return effectType ? owned.filter((entry) => entry.effectType === effectType) : owned;
}

function classCanUseEffectType(classKey, effectType) {
  return Object.values(SKILL_CATALOG).some((skill) => skill.classId === classKey && (skill.appliedEffects || []).some((effect) => effect.id === effectType));
}

function unitHasEffect(unit, effectId) {
  return (unit?.effects || []).some((effect) => effect?.id === effectId && Number(effect.duration || 0) > 0);
}

function countActiveEffects(unit, effectId) {
  return (unit?.effects || []).filter((effect) => effect?.id === effectId && Number(effect.duration || 0) > 0).length;
}

function getEffectStacks(effect) {
  return Math.max(1, Number(effect?.meta?.stacks || 1));
}
