// Shared passive helpers
// Keeps class passives and shop passives readable for combat and effect layers.

function getOwnedPassiveSkillDefinitions(unit) {
  return getKnownPassiveSkillIds(unit)
    .map((skillId) => getSkillDefinition(skillId))
    .filter(Boolean);
}

function getOwnedShopPassiveDefinitions(unit, effectType = null) {
  return getOwnedShopPassives(unit, effectType);
}

function mergeEffectModifierBlocks(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (typeof value === "string") {
      target[key] = value;
      return;
    }
    const numericValue = Number(value || 0);
    if (key === "critMultiplierOverride") {
      target[key] = Math.max(Number(target[key] || 0), numericValue);
      return;
    }
    target[key] = Number(target[key] || 0) + numericValue;
  });
  return target;
}

function getEffectPassiveModifiers(unit, effectType) {
  const passiveSkillModifiers = getOwnedPassiveSkillDefinitions(unit).reduce((accumulator, passive) => {
    mergeEffectModifierBlocks(accumulator, passive?.modifiers?.effects?.[effectType] || {});
    return accumulator;
  }, {});

  const withShop = getOwnedShopPassiveDefinitions(unit, effectType).reduce((accumulator, passive) => {
    mergeEffectModifierBlocks(accumulator, passive?.modifier || {});
    return accumulator;
  }, passiveSkillModifiers);
  if (!unit?.classKey) return withShop;
  return getHeroFxDefs(unit).reduce((accumulator, def) => {
    mergeEffectModifierBlocks(accumulator, def?.effects?.[effectType] || {});
    return accumulator;
  }, withShop);
}

function getEffectApplicationPassiveContext(sourceUnit, effectId) {
  return getEffectPassiveModifiers(sourceUnit, effectId);
}

function getEffectTickPassiveContext(sourceUnit, effectId) {
  return getEffectPassiveModifiers(sourceUnit, effectId);
}

function getSpecialPassiveModifiers(unit, scopeKey) {
  return getOwnedPassiveSkillDefinitions(unit).reduce((accumulator, passive) => {
    mergeEffectModifierBlocks(accumulator, passive?.modifiers?.special?.[scopeKey] || {});
    return accumulator;
  }, {});
}

function getDarkMinionPassiveContext(unit) {
  return getSpecialPassiveModifiers(unit, "darkMinion");
}

function getDarkSacrificePassiveContext(unit) {
  return getSpecialPassiveModifiers(unit, "darkSacrifice");
}

function getSummonedUnitPassiveContext(unit, summonType = null) {
  const shared = getSpecialPassiveModifiers(unit, "summonedUnits");
  if (!summonType) {
    return shared;
  }

  const typed = getSpecialPassiveModifiers(unit, `summonedUnits:${summonType}`);
  return mergeEffectModifierBlocks({ ...shared }, typed);
}

function getIncomingDamagePassiveContext(unit) {
  return getSpecialPassiveModifiers(unit, "incomingDamage");
}

function getPassiveDamageContext(attacker, defender) {
  const poisonModifiers = unitHasEffect(defender, "poison") ? getEffectPassiveModifiers(attacker, "poison") : {};
  const burnModifiers = unitHasEffect(defender, "burn") ? getEffectPassiveModifiers(attacker, "burn") : {};
  const frostModifiers = unitHasEffect(defender, "frost") || unitHasEffect(defender, "frostbite") || unitHasEffect(defender, "freeze") ? getEffectPassiveModifiers(attacker, "frost") : {};
  const darkFuryMultiplier = (attacker?.effects || []).reduce((accumulator, effect) => {
    if (effect?.id !== "dark_fury") return accumulator;
    return accumulator + Number(effect.value || 0);
  }, 0);

  return {
    damageMultiplier:
      Number(poisonModifiers.damageToAffectedMultiplier || 0) +
      Number(burnModifiers.damagePerActiveBurn || 0) * (defender?.effects || []).filter((effect) => effect?.id === "burn").reduce((sum, effect) => sum + Math.max(1, Number(effect.meta?.stacks || 1)), 0) +
      darkFuryMultiplier,
    critChanceBonus: Number(frostModifiers.critChanceBonusVsAffected || 0),
    critMultiplierOverride: Number(frostModifiers.critMultiplierOverride || 0)
  };
}
