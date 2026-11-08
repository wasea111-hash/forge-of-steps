// The hero's build: development points, skill forms, combat styles, the chosen ultimate and the talent boards.
// Content is registered by the data.build.<class>.js files, this file holds only the rules.

const SKILL_FORMS = {};     // skillId -> [formA, formB]
const CLASS_STYLES = {};    // classKey -> [style, style, style]
const ULT_OPTIONS = {};     // ultimate id -> definition
const ULT_PAIRS = {};       // classKey, subclass id or profession id -> [ultimate id, ultimate id]
const TALENT_BOARDS = {};   // classKey -> [school, ...]

const SKILL_TREES = {};     // classKey -> { lanes, stages: [{ owner, stage, tiers: [{ level, options: [skillId...], needsLane }] }] }
const STYLE_UNLOCK_LEVEL = 5;
const STYLE_STEPS = [{ level: 5, power: 0.08 }, { level: 12, power: 0.11 }, { level: 20, power: 0.14 }, { level: 28, power: 0.17 }];
const TALENT_DEPTH = { 1: 0, 2: 3, 3: 6, 4: 10 };
const TALENT_TIER3_LIMIT = 2;
const DEV_POINTS_PER_GUARDIAN = 2;
const DEV_POINTS_GUARDIANS = 4;
const BUILD_VERSION = 2;

function respecCost(hero) {
  return 50 + 10 * hero.level;
}

// --- Registration ---
function defineSkillForms(skillId, forms) {
  SKILL_FORMS[skillId] = forms.map((form) => ({ ...form, skillId, id: `${skillId}#${form.id}` }));
}

function defineClassStyles(classKey, styles) {
  CLASS_STYLES[classKey] = styles.map((style) => ({ ...style, classKey, id: `${classKey}:${style.id}` }));
}

function defineUltimates(owner, stage, pair) {
  ULT_PAIRS[owner] = pair.map((ult) => {
    const id = `${owner}:${ult.id}`;
    ULT_OPTIONS[id] = { ...ult, id, owner, stage };
    return id;
  });
}

// A new skill written for the tree. Its level comes from the tier it stands in.
function defineTreeSkill(classId, spec) {
  SKILL_CATALOG[spec.id] = { classId, category: "active", icon: null, tags: [], visible: true, hidden: false, unlockLevel: 1, hits: 1, cooldown: 0, resourceCost: 0, ...spec };
  return spec.id;
}

function defineSkillTree(classKey, tree) {
  SKILL_TREES[classKey] = tree;
  const catalog = getBranchCatalog(classKey);
  tree.stages.forEach((stage) => {
    stage.tiers.forEach((tier) => {
      tier.options.forEach((id) => {
        const skill = SKILL_CATALOG[id];
        if (!skill) throw new Error(`tree of ${classKey}: no skill ${id}`);
        skill.unlockLevel = tier.level;
        skill.classId = classKey;
        skill.subclass = stage.stage === "subclass" ? stage.owner : stage.stage === "profession" ? catalog.professions[stage.owner].subclassId : null;
        skill.profession = stage.stage === "profession" ? stage.owner : null;
      });
    });
  });
}

function defineTalentBoard(classKey, schools) {
  TALENT_BOARDS[classKey] = schools;
}

// --- Development points: one budget for forms and talents ---
function getDevPointsTotal(hero) {
  const guardians = new Set(hero.defeatedGuardians || []).size;
  return Math.floor(hero.level / 2) + DEV_POINTS_PER_GUARDIAN * Math.min(DEV_POINTS_GUARDIANS, guardians);
}

function getPickedForms(hero) {
  return Object.entries(hero.skillForms || {}).map(([skillId, formId]) => {
    const skill = getSkillDefinition(skillId);
    const form = (SKILL_FORMS[skillId] || []).find((entry) => entry.id === formId);
    return form && skill && doesSkillMatchBranch(skill, hero) && (hero.freeSkills || !getSkillTree(hero) || (hero.knownSkillIds || []).includes(skillId)) ? form : null;
  }).filter(Boolean);
}

function getDevPointsSpent(hero) {
  return getPickedForms(hero).length + getTalentPointsSpent(hero);
}

function getDevPointsFree(hero) {
  return getDevPointsTotal(hero) - getDevPointsSpent(hero);
}

// --- Actives and passives come by themselves: the choice lives in forms, style, talents and the panel ---
function getSkillTree(hero) {
  return SKILL_TREES[hero?.classKey] || null;
}

// The stages this hero stands on right now: class, chosen subclass, chosen profession.
function getTreeStages(hero) {
  const tree = getSkillTree(hero);
  if (!tree) return [];
  const branch = normalizeBranchSelection(hero.classKey, hero.subclass, hero.profession);
  return tree.stages.filter((stage) => stage.stage === "class" || stage.owner === branch.subclass || stage.owner === branch.profession);
}

function treeTierKey(stage, tier) {
  return `${stage.owner}:${tier.level}`;
}

function getTreePick(hero, stage, tier) {
  const id = hero.skillPicks?.[treeTierKey(stage, tier)];
  return tier.options.includes(id) ? id : null;
}

function getLanePicks(hero, stage, lane, belowLevel) {
  return stage.tiers.filter((tier) => tier.level < belowLevel && getTreePick(hero, stage, tier) === tier.options[lane]).length;
}

// Why a skill can or can not be taken at this tier.
function getTreeOptionState(hero, stage, tier, skillId) {
  const picked = getTreePick(hero, stage, tier);
  if (picked === skillId) return { ok: false, taken: true, reason: "Этот навык уже выбран." };
  if (hero.level < tier.level) return { ok: false, reason: `Откроется на ${tier.level} уровне.` };
  if (hero.expedition) return { ok: false, reason: "Навыки меняют только в лагере." };
  const lane = tier.options.indexOf(skillId);
  if (tier.needsLane && getLanePicks(hero, stage, lane, tier.level) < tier.needsLane) {
    const name = getSkillTree(hero).lanes?.[lane]?.name || "этой ветки";
    return { ok: false, reason: `Нужно ${tier.needsLane} навыка ветки «${name}».` };
  }
  const cost = picked && !hero.freeRespec ? respecCost(hero) : 0;
  if (hero.gold < cost) return { ok: false, reason: `Сменить навык стоит ${cost} золота.` };
  return { ok: true, cost };
}

function chooseTreeSkill(hero, stage, tier, skillId) {
  const check = getTreeOptionState(hero, stage, tier, skillId);
  if (!check.ok) return check;
  hero.gold -= check.cost;
  hero.skillPicks = { ...(hero.skillPicks || {}), [treeTierKey(stage, tier)]: skillId };
  applyDerivedStats(hero);
  return check;
}

function getPendingTreePick(hero) {
  for (const stage of getTreeStages(hero)) {
    for (const tier of stage.tiers) {
      if (tier.level <= hero.level && !getTreePick(hero, stage, tier)) return { stage, tier };
    }
  }
  return null;
}

function getPickedTreeSkills(hero) {
  return getTreeStages(hero).flatMap((stage) => stage.tiers.map((tier) => (tier.level <= hero.level ? getTreePick(hero, stage, tier) : null))).filter(Boolean).map(getSkillDefinition).filter(Boolean);
}

function syncKnownSkills(hero) {
  if (!hero?.classKey || !Array.isArray(hero.knownSkillIds)) return;
  if (getSkillTree(hero) && !hero.freeSkills) {
    const picked = getPickedTreeSkills(hero);
    hero.knownSkillIds = picked.map((skill) => skill.id);
    hero.passiveIds = picked.filter((skill) => skill.category === "passive").map((skill) => skill.id);
    const actives = new Set(picked.filter((skill) => skill.category === "active").map((skill) => skill.id));
    hero.activeSkillSlots = (hero.activeSkillSlots || []).map((id) => (actives.has(id) ? id : null));
    actives.forEach((id) => {
      if (hero.activeSkillSlots.includes(id)) return;
      const free = hero.activeSkillSlots.findIndex((slot) => !slot);
      if (free >= 0) hero.activeSkillSlots[free] = id;
    });
    // A form leaves with its skill: otherwise taking the skill back would spend a point nobody has.
    if (hero.skillForms) hero.skillForms = Object.fromEntries(Object.entries(hero.skillForms).filter(([id]) => actives.has(id)));
    hero.skillPoints = 0;
    return;
  }
  const known = new Set(hero.knownSkillIds);
  const available = getVisibleClassSkills(hero).filter((skill) => Number(skill.unlockLevel || 1) <= hero.level);
  available.forEach((skill) => {
    if (known.has(skill.id)) return;
    known.add(skill.id);
    if (skill.category === "active") {
      const free = (hero.activeSkillSlots || []).findIndex((slot) => !slot);
      if (free >= 0) hero.activeSkillSlots[free] = skill.id;
    }
  });
  hero.knownSkillIds = [...known];
  hero.passiveIds = normalizeSkillIdList(available.filter((skill) => skill.category === "passive").map((skill) => skill.id), "passive");
  hero.skillPoints = 0;
}

// --- Forms ---
function getSkillForms(skillId) {
  return SKILL_FORMS[skillId] || [];
}

function getHeroSkillForm(hero, skillId) {
  const formId = hero?.skillForms?.[skillId];
  return formId ? getSkillForms(skillId).find((form) => form.id === formId) || null : null;
}

// The skill as this hero really uses it. The catalog itself is never changed.
function applySkillForm(skill, form) {
  if (!form) return skill;
  const merged = { ...skill, ...(form.patch || {}), formName: form.name };
  if (form.replaceEffects) merged.appliedEffects = form.replaceEffects;
  if (form.addEffects) merged.appliedEffects = [...(merged.appliedEffects || []), ...form.addEffects];
  return merged;
}

function getHeroSkill(hero, skill) {
  return skill ? applySkillForm(skill, getHeroSkillForm(hero, skill.id)) : skill;
}

function canChooseForm(hero, skillId, formId) {
  const skill = getSkillDefinition(skillId);
  const form = getSkillForms(skillId).find((entry) => entry.id === formId);
  if (!skill || !form) return { ok: false, reason: "Такой формы нет." };
  if (!doesSkillMatchBranch(skill, hero)) return { ok: false, reason: "Этот навык с другого пути." };
  if (getSkillTree(hero) && !hero.freeSkills && !(hero.knownSkillIds || []).includes(skillId)) return { ok: false, reason: "Сначала выбери этот навык в дереве." };
  if (Number(skill.unlockLevel || 1) > hero.level) return { ok: false, reason: `Откроется на ${skill.unlockLevel} уровне.` };
  if (hero.expedition) return { ok: false, reason: "Форму меняют только в лагере." };
  const current = hero.skillForms?.[skillId];
  if (current === formId) return { ok: false, reason: "Эта форма уже выбрана." };
  if (current) {
    const cost = hero.freeRespec ? 0 : respecCost(hero);
    if (hero.gold < cost) return { ok: false, reason: `Сменить форму стоит ${cost} золота.` };
    return { ok: true, cost };
  }
  if (getDevPointsFree(hero) < 1) return { ok: false, reason: "Нет свободных очков развития." };
  return { ok: true, cost: 0 };
}

function chooseSkillForm(hero, skillId, formId) {
  const check = canChooseForm(hero, skillId, formId);
  if (!check.ok) return check;
  hero.gold -= check.cost;
  hero.skillForms = { ...(hero.skillForms || {}), [skillId]: formId };
  applyDerivedStats(hero);
  return check;
}

// Back to the plain skill: the point returns, the gold for the change does not.
function clearSkillForm(hero, skillId) {
  if (!hero.skillForms?.[skillId]) return { ok: false, reason: "Форма не выбрана." };
  if (hero.expedition) return { ok: false, reason: "Форму меняют только в лагере." };
  const cost = hero.freeRespec ? 0 : respecCost(hero);
  if (hero.gold < cost) return { ok: false, reason: `Снять форму стоит ${cost} золота.` };
  hero.gold -= cost;
  const { [skillId]: dropped, ...rest } = hero.skillForms;
  hero.skillForms = rest;
  applyDerivedStats(hero);
  return { ok: true, cost };
}

// --- Styles: how the hero spends each exchange of turns ---
function getClassStyles(classKey) {
  return CLASS_STYLES[classKey] || [];
}

function getHeroStyle(hero) {
  return getClassStyles(hero?.classKey).find((style) => style.id === hero?.styleId) || null;
}

function getStyleStep(level) {
  return STYLE_STEPS.reduce((best, step, index) => (level >= step.level ? index : best), -1);
}

function getStylePower(hero) {
  const step = getStyleStep(hero?.level || 1);
  return step < 0 ? 0 : STYLE_STEPS[step].power;
}

function chooseStyle(hero, styleId) {
  const style = getClassStyles(hero.classKey).find((entry) => entry.id === styleId);
  if (!style) return { ok: false, reason: "Такого стиля нет." };
  if (hero.level < STYLE_UNLOCK_LEVEL) return { ok: false, reason: `Стиль выбирается с ${STYLE_UNLOCK_LEVEL} уровня.` };
  if (hero.expedition) return { ok: false, reason: "Стиль меняют только в лагере." };
  if (hero.styleId === styleId) return { ok: false, reason: "Этот стиль уже выбран." };
  const cost = hero.styleId && !hero.freeRespec ? respecCost(hero) : 0;
  if (hero.gold < cost) return { ok: false, reason: `Сменить стиль стоит ${cost} золота.` };
  hero.gold -= cost;
  hero.styleId = styleId;
  applyDerivedStats(hero);
  return { ok: true, cost };
}

// --- Ultimates: two new ones arrive at each step of the path, one is worn ---
function getUltimateGroups(hero) {
  const branch = normalizeBranchSelection(hero.classKey, hero.subclass, hero.profession);
  const groups = [{ owner: hero.classKey, stage: "class", level: ULTIMATE_LEVEL }];
  if (branch.subclass) groups.push({ owner: branch.subclass, stage: "subclass", level: SUBCLASS_UNLOCK_LEVEL });
  if (branch.profession) groups.push({ owner: branch.profession, stage: "profession", level: PROFESSION_UNLOCK_LEVEL });
  return groups.map((group) => ({ ...group, options: (ULT_PAIRS[group.owner] || []).map((id) => ULT_OPTIONS[id]).filter(Boolean) }));
}

function getAvailableUltimates(hero) {
  return getUltimateGroups(hero).flatMap((group) => group.options);
}

function getHeroUltimate(hero) {
  const options = getAvailableUltimates(hero);
  const worn = options.find((ult) => ult.id === hero?.ultimateId);
  if (worn) return worn;
  // Nothing chosen yet: the class's older ultimate keeps working.
  return options[0] || (ULTIMATES[hero?.classKey] ? { ...ULTIMATES[hero.classKey], id: hero.classKey } : null);
}

function chooseUltimate(hero, ultId) {
  if (!getAvailableUltimates(hero).some((ult) => ult.id === ultId)) return { ok: false, reason: "Этот ультимейт тебе недоступен." };
  if (hero.expedition) return { ok: false, reason: "Ультимейт меняют только в лагере." };
  hero.ultimateId = ultId;
  applyDerivedStats(hero);
  return { ok: true };
}

// A newly opened pair that the hero has not answered yet.
function getPendingUltimateChoice(hero) {
  if (hero.level < ULTIMATE_LEVEL) return null;
  const answered = hero.ultimateSeen || [];
  const groups = getUltimateGroups(hero).filter((group) => group.options.length);
  const newest = groups[groups.length - 1];
  return newest && !answered.includes(newest.owner) ? newest : null;
}

// Answering about the newest pair settles the older ones too.
function markUltimateSeen(hero, owner) {
  const groups = getUltimateGroups(hero).map((group) => group.owner);
  hero.ultimateSeen = [...new Set([...(hero.ultimateSeen || []), ...groups, owner])];
}

// --- Talent boards ---
function getTalentBoard(hero) {
  return TALENT_BOARDS[hero?.classKey] || [];
}

// What stands in a slot right now: a path module replaces the class talent once the path is chosen.
function resolveSlotTalent(hero, slot) {
  if (slot.module) {
    const key = slot.module.stage === "profession" ? hero.profession : hero.subclass;
    const picked = key ? slot.module.map[key] : null;
    if (picked) return picked;
  }
  return slot.talent;
}

function findBoardSlot(hero, talentId) {
  for (const school of getTalentBoard(hero)) {
    for (const slot of school.slots) {
      if (resolveSlotTalent(hero, slot) === talentId) return { school, slot };
    }
  }
  return null;
}

function isSlotTaken(hero, slot) {
  return (hero.talents || []).includes(resolveSlotTalent(hero, slot));
}

function getSlotCost(slot) {
  return TALENT_TIER_COST[slot.tier];
}

function getSchoolDepth(hero, school) {
  return school.slots.filter((slot) => isSlotTaken(hero, slot)).reduce((sum, slot) => sum + getSlotCost(slot), 0);
}

function getBoardKeystoneLimit(hero) {
  return hero.level >= PROFESSION_UNLOCK_LEVEL ? 2 : 1;
}

function getBoardKeystoneCount(hero) {
  return getTalentBoard(hero).reduce((sum, school) => sum + school.slots.filter((slot) => slot.tier === 4 && isSlotTaken(hero, slot)).length, 0);
}

function getSlotState(hero, school, slot) {
  const talentId = resolveSlotTalent(hero, slot);
  const def = TALENTS[talentId];
  if (!def) return { ok: false, reason: "Этот узел пуст." };
  if ((hero.talents || []).includes(talentId)) return { ok: false, taken: true, reason: "Талант уже взят." };
  if (hero.expedition) return { ok: false, reason: "Таланты берут только в лагере." };
  const level = TALENT_TIER_LEVEL[slot.tier];
  if (hero.level < level) return { ok: false, reason: `Нужен ${level} уровень.` };
  const depth = getSchoolDepth(hero, school);
  if (depth < TALENT_DEPTH[slot.tier]) return { ok: false, reason: `Нужно вложить в эту школу ${TALENT_DEPTH[slot.tier]} очков, сейчас ${depth}.` };
  if (slot.afterAny?.length) {
    const open = slot.afterAny.some((key) => isSlotTaken(hero, school.slots.find((entry) => entry.key === key) || {}));
    if (!open) return { ok: false, reason: "Сначала возьми один из соединённых с ним талантов." };
  }
  if (slot.tier === 3 && school.slots.filter((entry) => entry.tier === 3 && isSlotTaken(hero, entry)).length >= TALENT_TIER3_LIMIT) return { ok: false, reason: `В третьем круге школы можно взять только ${TALENT_TIER3_LIMIT} таланта.` };
  if (slot.tier === 4) {
    if (school.slots.some((entry) => entry.tier === 4 && isSlotTaken(hero, entry))) return { ok: false, reason: "В школе можно взять только один ключевой талант." };
    if (getBoardKeystoneCount(hero) >= getBoardKeystoneLimit(hero)) return { ok: false, reason: `Ключевых талантов не больше ${getBoardKeystoneLimit(hero)}. Второй открывается на ${PROFESSION_UNLOCK_LEVEL} уровне.` };
  }
  const clash = (def.excludes || []).some((other) => hero.talents.includes(other)) || hero.talents.some((other) => (TALENTS[other]?.excludes || []).includes(talentId));
  if (clash) return { ok: false, reason: "Несовместим с уже взятым талантом." };
  if (getDevPointsFree(hero) < getSlotCost(slot)) return { ok: false, reason: `Нужно очков развития: ${getSlotCost(slot)}.` };
  return { ok: true };
}

// --- All of it at once ---
function resetBuild(hero) {
  if (hero.expedition) return { ok: false, reason: "Пересборка возможна только в лагере." };
  if (!hero.talents.length && !Object.keys(hero.skillForms || {}).length) return { ok: false, reason: "Сбрасывать нечего." };
  const cost = hero.freeRespec ? 0 : respecCost(hero);
  if (hero.gold < cost) return { ok: false, reason: `Сброс стоит ${cost} золота.` };
  hero.gold -= cost;
  hero.talents = [];
  hero.skillForms = {};
  hero.skillPicks = {};
  hero.freeRespec = false;
  applyDerivedStats(hero);
  return { ok: true, cost };
}

// Fills the free points by a plain plan: forms first, then the deepest possible walk through the schools in the given order.
function autoBuild(hero, { formIndex = 0, styleIndex = 0, ultIndex = 0, laneIndex = 0, schoolOrder = null } = {}) {
  if (hero.level >= STYLE_UNLOCK_LEVEL && !hero.styleId) hero.styleId = getClassStyles(hero.classKey)[styleIndex]?.id || null;
  // The tree: stay on one lane where the tier allows it.
  for (const stage of getTreeStages(hero)) {
    for (const tier of stage.tiers) {
      if (tier.level > hero.level || getTreePick(hero, stage, tier)) continue;
      const order = tier.options.map((_, index) => (laneIndex + index) % tier.options.length);
      const lane = order.find((index) => !tier.needsLane || getLanePicks(hero, stage, index, tier.level) >= tier.needsLane);
      hero.skillPicks = { ...(hero.skillPicks || {}), [treeTierKey(stage, tier)]: tier.options[lane ?? 0] };
    }
  }
  if (getSkillTree(hero) && !hero.freeSkills) {
    syncKnownSkills(hero);
    const actives = getPickedTreeSkills(hero).filter((skill) => skill.category === "active").sort((a, b) => Number(b.unlockLevel) - Number(a.unlockLevel));
    hero.activeSkillSlots = [0, 1, 2, 3, 4].map((index) => actives[index]?.id || null);
  }
  const ultimates = getAvailableUltimates(hero);
  const newest = getUltimateGroups(hero).slice(-1)[0]?.options || [];
  if (!ultimates.some((ult) => ult.id === hero.ultimateId) && newest.length) hero.ultimateId = newest[ultIndex % newest.length].id;
  getVisibleClassSkills(hero, "active").filter((skill) => hero.freeSkills || !getSkillTree(hero) || hero.knownSkillIds.includes(skill.id)).forEach((skill) => {
    const forms = getSkillForms(skill.id);
    if (!forms.length || hero.skillForms?.[skill.id] || Number(skill.unlockLevel || 1) > hero.level || getDevPointsFree(hero) < 1) return;
    hero.skillForms = { ...(hero.skillForms || {}), [skill.id]: forms[formIndex % forms.length].id };
  });
  const board = getTalentBoard(hero);
  const order = schoolOrder ? [...board].sort((a, b) => schoolOrder.indexOf(a.id) - schoolOrder.indexOf(b.id)) : board;
  for (let guard = 0; guard < 80; guard += 1) {
    let picked = false;
    for (const school of order) {
      const slot = [...school.slots].sort((a, b) => a.tier - b.tier).find((entry) => getSlotState(hero, school, entry).ok);
      if (slot) {
        hero.talents = [...hero.talents, resolveSlotTalent(hero, slot)];
        picked = true;
        break;
      }
    }
    if (!picked) break;
  }
  applyDerivedStats(hero);
}

// Everything chosen here that carries hooks or modifiers.
// Talents are fewer now and each means more; the drill of the Brand carries the plain strength that used to come from taking everything.
const CLASS_DRILL = { warrior: { dmg: 0.1, taken: -0.08 }, mage: { dmg: 0.42, taken: -0.3, maxHpPct: 0.2 }, archer: { dmg: 0.05, taken: -0.05 }, bard: { dmg: 0.46, taken: -0.34, maxHpPct: 0.12 }, assassin: { dmg: 0.15, taken: -0.12 } };

function getClassDrill(hero) {
  const drill = CLASS_DRILL[hero?.classKey];
  if (!drill) return null;
  // Casters are fragile early: their drill arrives sooner.
  const ramp = Math.min(1, Number(hero.level || 1) / (hero.classKey === "bard" || hero.classKey === "mage" ? 10 : 30));
  return { dmg: drill.dmg * ramp, taken: drill.taken * ramp, maxHpPct: Number(drill.maxHpPct || 0) * ramp };
}

function getBuildFxDefs(hero) {
  const defs = [];
  const drill = getClassDrill(hero);
  if (drill) defs.push({ id: "class-drill", name: "Выучка Клейма", mods: drill });
  if (getSkillTree(hero) && !hero.freeSkills) getPickedTreeSkills(hero).forEach((skill) => { if (skill.on || skill.mods) defs.push({ id: `tree-${skill.id}`, name: skill.name, on: skill.on, mods: skill.mods }); });
  getPickedForms(hero).forEach((form) => { if (form.on || form.mods) defs.push({ id: `form-${form.id}`, name: form.name, on: form.on, mods: form.mods }); });
  const style = getHeroStyle(hero);
  if (style && hero.level >= STYLE_UNLOCK_LEVEL) defs.push({ id: `style-${style.id}`, name: style.name, on: style.on, mods: style.mods });
  const ult = getHeroUltimate(hero);
  if (ult?.on) defs.push({ id: `ult-${ult.id}`, name: ult.name, on: ult.on, ultId: ult.id });
  return defs;
}

// The state object that a worn ultimate shares with its own hooks.
function getUltState(battle) {
  const ult = getHeroUltimate(battle.hero);
  return (battle.fxList || []).find((entry) => entry.def.ultId === ult?.id)?.state || {};
}

// Style hooks read their current strength from here.
function stylePower(battle) {
  return getStylePower(battle.hero);
}

// A phase of an ultimate that lasts for several of the hero's actions.
function ultPhaseStart(state, actions = 3) {
  state.left = actions;
}

function ultPhaseActive(state) {
  return Number(state.left || 0) > 0;
}

function ultPhaseTick(state) {
  if (state.left > 0) state.left -= 1;
}
