// Checks every mastery option of every skill: it must run in battle without errors or broken numbers,
// and its effect is measured against the same skill without mastery on the same random seeds.
// Usage: node tools/check-mastery.js [class|all] [fights=12]
const { loadCore } = require("./load-core");
const run = loadCore();
const only = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const N = Number(process.argv[3] || 12);

const report = run(`(function () {
  const seeded = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const finite = (v) => v === null || v === undefined || typeof v !== "number" || Number.isFinite(v);
  function hero(skill, choice) {
    const h = createHero({ name: "M", classKey: skill.classId });
    const level = Math.min(72, Math.max(20, Number(skill.unlockLevel || 1) + 12));
    for (let i = 1; i < level; i += 1) awardExperience(h, getExperienceForNextLevel(h.level));
    h.subclass = skill.subclass || (skill.profession ? getBranchCatalog(skill.classId).professions[skill.profession]?.subclassId : null) || null;
    h.profession = skill.profession || null;
    // Taken through the tree, as a player takes it: so the skill's own hooks are in the battle too.
    const tree = getSkillTree(h);
    tree.stages.forEach((stage) => stage.tiers.forEach((tier) => {
      if (!tier.options.includes(skill.id)) return;
      const catalog = getBranchCatalog(h.classKey);
      if (stage.stage === "subclass") h.subclass = stage.owner;
      if (stage.stage === "profession") { h.profession = stage.owner; h.subclass = catalog.professions[stage.owner]?.subclassId || h.subclass; }
      while (h.level < Math.min(80, tier.level + 8)) awardExperience(h, getExperienceForNextLevel(h.level));
      h.skillPicks = { ...(h.skillPicks || {}), [treeTierKey(stage, tier)]: skill.id };
    }));
    // The rest of the build: the first allowed option on every other tier, so gauges and setups fill as in play.
    getTreeStages(h).forEach((stage) => stage.tiers.forEach((tier) => {
      if (tier.level > h.level || getTreePick(h, stage, tier)) return;
      const id = tier.options.find((opt) => getTreeOptionState(h, stage, tier, opt).ok);
      if (id) h.skillPicks = { ...(h.skillPicks || {}), [treeTierKey(stage, tier)]: id };
    }));
    syncKnownSkills(h);
    const others = (h.activeSkillSlots || []).filter((id) => id && id !== skill.id).slice(0, 4);
    h.activeSkillSlots = [skill.id, ...others, null, null, null, null].slice(0, 5);
    h.skillProgress = { [skill.id]: { level: SKILL_MAX_LEVEL, exp: 0, expToNext: 0, bonusChoice: choice, mutation: null } };
    Object.keys(h.equipment).forEach((slot) => { const type = slot.split("-")[0]; h.equipment[slot] = generateItem({ level, rarity: "orange", classKey: h.classKey, slotType: type, offhand: type === "weapon" ? slot === "weapon-2" : null }); });
    applyDerivedStats(h, true);
    return h;
  }
  function fight(skill, choice, seed) {
    setRng(seeded(seed));
    const h = hero(skill, choice);
    const region = REGIONS[Math.min(REGIONS.length - 1, REGIONS.reduce((best, r, i) => (h.level >= r.minLevel ? i : best), 0))];
    // Varied foes: each seed picks two of the region's enemies, every third fight one is a pack leader with heavier blows.
    const pick = () => region.enemies[Math.floor(rand() * region.enemies.length)];
    const foes = [makeEnemy(pick(), h.level - 3, { boss: seed % 3 === 0 }), makeEnemy(pick(), h.level - 3)];
    const b = createBattle(h, foes);
    let warm = 0;
    while (!b.awaiting && !b.over && warm++ < 20) advanceBattle(b);
    let actions = 0, guard = 0;
    while (!b.over && guard++ < 500 && actions < 60) {
      if (b.awaitingActor === "ally") break;
      let res = { ok: false };
      // The bot plays the whole build with its own judgement (skills carry their own "when to use" hints).
      const choice = chooseBotAction(b);
      res = heroAction(b, choice);
      if (res.ok && choice.type === "skill" && choice.slotIndex === 0) globalThis.__uses = (globalThis.__uses || 0) + 1;
      if (!res.ok) heroAction(b, { type: "attack" });
      actions += 1;
      if (!finite(h.currentHp) || !finite(h.currentMana) || b.foes.some((f) => !finite(f.currentHp))) throw new Error("numbers broke");
    }
    setRng(null);
    const dealt = b.foes.reduce((sum, f) => sum + (f.maxHp - Math.max(0, f.currentHp)), 0);
    return { win: b.over === "hero" ? 1 : 0, actions, dealt, hpLeft: Math.max(0, h.currentHp) / h.maxHp, sig: [actions, Math.round(dealt), Math.round(h.currentHp), Math.round(h.currentMana)].join(",") };
  }
  function score(skill, choice) {
    let total = { win: 0, perAction: 0, hpLeft: 0, sig: [] };
    for (let i = 1; i <= ${N}; i += 1) {
      const r = fight(skill, choice, i * 7919);
      total.sig.push(r.sig); total.win += r.win; total.perAction += r.dealt / Math.max(1, r.actions); total.hpLeft += r.hpLeft;
    }
    return { win: total.win / ${N}, perAction: total.perAction / ${N}, hpLeft: total.hpLeft / ${N}, sig: total.sig.join("|") };
  }
  const rows = [], errors = [];
  function canUseSkillNote(skill) { try { setRng(seeded(1)); const h = hero(skill, null); const b = createBattle(h, [makeEnemy("wolf", h.level)]); let w = 0; while (!b.awaiting && !b.over && w++ < 20) advanceBattle(b); h.currentMana = h.maxMana; const r = canUseSkill(b, 0); setRng(null); return r.ok ? "usable at full resource" : r.reason; } catch (e) { return e.message; } }
  Object.keys(SKILL_MASTERY).forEach((id) => {
    const skill = getSkillDefinition(id);
    if (!skill) { errors.push(id + ": no such skill"); return; }
    if (${JSON.stringify(only)} && skill.classId !== ${JSON.stringify(only)}) return;
    const opts = getSkillMasteryOptions(id);
    if (opts.length !== 3) errors.push(id + ": " + opts.length + " options");
    const seen = new Set();
    opts.forEach((o) => {
      if (!o.id || seen.has(o.id)) errors.push(id + ": bad or repeated option id " + o.id);
      seen.add(o.id);
      if (!o.name || !o.description) errors.push(id + "/" + o.id + ": no name or description");
      if (/(ал|ла)\\/(ла|ал)|готов\\(а\\)|\\(а\\)/.test(o.description)) errors.push(id + "/" + o.id + ": gendered form");
    });
    let base;
    globalThis.__uses = 0;
    try { base = score(skill, null); if (!globalThis.__uses) errors.push(id + ": never used in the test fights (" + (canUseSkillNote(skill) || "?") + ")"); } catch (e) { errors.push(id + " base: " + e.message); return; }
    opts.forEach((o) => {
      try {
        const s = score(skill, o.id);
        const gain = (s.perAction / Math.max(1e-9, base.perAction) - 1) + (s.hpLeft - base.hpLeft) * 0.5;
        rows.push({ id, opt: o.id, name: o.name, gain: Math.round(gain * 100), win: [base.win, s.win], same: s.sig === base.sig });
      } catch (e) { errors.push(id + "/" + o.id + ": " + e.message + " " + (e.stack || "").split("\\n")[1]); }
    });
  });
  const tree = Object.values(SKILL_TREES).flatMap((t) => t.stages.flatMap((st) => st.tiers.flatMap((ti) => ti.options))).filter((id, i, all) => all.indexOf(id) === i);
  const missing = tree.filter((id) => !SKILL_MASTERY[id] && (!${JSON.stringify(only)} || getSkillDefinition(id)?.classId === ${JSON.stringify(only)}));
  return JSON.stringify({ rows, errors, missing });
})()`);

const { rows, errors, missing } = JSON.parse(report);
console.log(`options checked: ${rows.length}; errors: ${errors.length}; skills without mastery: ${missing.length}`);
errors.forEach((e) => console.log("ERROR " + e));
if (missing.length) console.log("MISSING " + missing.join(", "));
const flat = rows.filter((r) => r.same);
const strong = rows.filter((r) => r.gain > 35);
const weak = rows.filter((r) => r.gain < -3);
console.log(`never changed a single number in the test fights: ${flat.length}`);
if (process.env.FLAT) flat.forEach((r) => console.log(`  same: ${r.id}/${r.opt} ${r.name}`));
console.log("too strong (>35%): " + (strong.map((r) => `${r.id}/${r.opt} +${r.gain}%`).join(", ") || "none"));
console.log("worse than no mastery (<-3%): " + (weak.map((r) => `${r.id}/${r.opt} ${r.gain}%`).join(", ") || "none"));
if (process.env.ALL) rows.forEach((r) => console.log(`${r.id}/${r.opt} ${r.name}: ${r.gain}%`));
