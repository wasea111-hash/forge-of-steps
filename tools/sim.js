// Balance simulation: a bot plays whole careers and single fights. Usage: node tools/sim.js [careers=6]
const { loadCore } = require("./load-core");
const run = loadCore();
const careers = Number(process.argv[2] || 6);

const result = run(`(function () {
  const STAT_PLAN = {
    warrior: { strength: 2, endurance: 1 }, mage: { intellect: 2, endurance: 1 }, archer: { agility: 1, strength: 1, endurance: 1 },
    bard: { intellect: 1, spirituality: 1, endurance: 1 }, assassin: { strength: 2, agility: 1 }
  };
  const PICK_ALLOC = { warrior: { strength: 3, endurance: 2 }, mage: { intellect: 3, endurance: 2 }, archer: { agility: 3, strength: 2 }, bard: { intellect: 3, endurance: 2 }, assassin: { strength: 3, agility: 2 } };

  function spendPoints(hero) {
    const plan = STAT_PLAN[hero.classKey];
    const keys = Object.keys(plan);
    let guard = 0;
    while (hero.statPoints > 0 && guard++ < 500) {
      for (const key of keys) addStatPoint(hero, key, Math.min(plan[key], hero.statPoints));
    }
    const wanted = hero.wantProfession ? getBranchCatalog(hero.classKey).professions[hero.wantProfession] : Object.values(getBranchCatalog(hero.classKey).professions)[0];
    if (hero.level >= SUBCLASS_UNLOCK_LEVEL && !hero.subclass) chooseSubclass(hero, wanted.subclassId);
    if (hero.level >= PROFESSION_UNLOCK_LEVEL && !hero.profession) chooseProfession(hero, wanted.id);
    getVisibleClassSkills(hero).forEach((skill) => { if (hero.skillPoints > 0 && getSkillStudyState(hero, skill) === "AVAILABLE") learnSkill(hero, skill.id); });
    const actives = getVisibleClassSkills(hero, "active").filter((skill) => isSkillLearned(hero, skill.id)).sort((a, b) => Number(b.unlockLevel) - Number(a.unlockLevel));
    hero.activeSkillSlots = [0, 1, 2, 3, 4].map((i) => actives[i]?.id || null);
    getPendingMasterySkills(hero).forEach((id) => chooseSkillBonus(hero, id, getSkillMasteryChoices(getSkillDefinition(id))[0].id));
    equipBestGear(hero);
    autoSpendTalents(hero, hero.wantProfession);
  }

  function shop(hero) {
    if (!hero.shop) refreshShopStock(hero);
    while (hero.potions.hp < 3 && buyPotion(hero, "hp").ok) {}
    if (hero.maxMana > 120) while (hero.potions.mp < 2 && buyPotion(hero, "mp").ok) {}
    hero.inventory.forEach((item, index) => { if (item) sellInventoryItem(hero, index); });
    // upgrade the weapon when affordable
    const weapon = hero.equipment["weapon-1"];
    for (let i = 0; i < 3; i += 1) if (weapon && hero.gold > getEnhanceCost(weapon).gold * 2) enhanceItem(hero, weapon);
  }

  function fight(hero, enemy, damageBonus = 0) {
    const battle = createBattle(hero, enemy, { damageBonus });
    let safety = 0;
    while (!battle.over && safety++ < 400) {
      const res = heroAction(battle, chooseBotAction(battle));
      if (!res.ok) heroAction(battle, { type: "attack" });
    }
    return battle;
  }

  function runExpedition(hero, regionId, zoneKey) {
    const exp = createExpedition(hero, regionId, zoneKey);
    hero.expedition = exp;
    while (true) {
      if (exp.pendingBoons?.length) takeBoon(hero, exp, exp.pendingBoons[0]);
      const entered = enterNode(hero, exp, Math.floor(rand() * exp.choices.length));
      let enemy = null, nodeType = null;
      if (entered.kind === "event") {
        const res = resolveEventOption(hero, exp, entered.event, 0);
        if (res.battle) { enemy = res.battle; nodeType = res.nodeType; }
      } else { enemy = entered.enemy; nodeType = entered.nodeType; }
      if (enemy) {
        const battle = fight(hero, enemy, exp.damageBonus);
        exp.damageBonus = 0;
        if (battle.over !== "hero") return finishExpedition(hero, exp, "death");
        const rewards = calculateEncounterRewards(hero, enemy, zoneKey, regionId);
        [].concat(enemy).forEach((foe) => recordKill(hero, foe));
        awardExperience(hero, rewards.exp);
        applyRewardsToBag(hero, exp, rewards);
        spendPoints(hero);
      }
      if (completeStep(hero, exp)) return finishExpedition(hero, exp, "complete");
      if (hero.currentHp / hero.maxHp < 0.3 && hero.potions.hp === 0) return finishExpedition(hero, exp, "retreat");
    }
  }

  function pickZone(hero) {
    // A sensible player: mostly green, orange when comfortable.
    const regionIndex = hero.unlockedRegion;
    return { regionId: REGIONS[regionIndex].id, zoneKey: hero.lastDeath ? "white" : rand() < 0.3 ? "orange" : "green" };
  }

  function career(classKey, profession, maxExpeditions = 1500) {
    const allocated = PICK_ALLOC[classKey];
    const hero = createHero({ name: "Бот", classKey, allocated });
    hero.wantProfession = profession;
    const log = { guardians: [], expeditions: 0, deaths: 0, battlesPerLevel: null };
    spendPoints(hero);
    for (let i = 0; i < maxExpeditions; i += 1) {
      log.expeditions += 1;
      spendPoints(hero);
      shop(hero);
      spendPoints(hero);
      const guardian = getAvailableGuardian(hero, hero.unlockedRegion);
      if (guardian && guardian.ready && hero.level >= guardian.def.level + 1) {
        restoreHero(hero);
        const enemy = buildGuardianEncounter(guardian.id);
        const attempt = (log.guardianTries[guardian.id] = (log.guardianTries[guardian.id] || 0) + 1);
        const battle = fight(hero, enemy);
        restoreHero(hero);
        if (battle.over === "hero") {
          const rewards = calculateEncounterRewards(hero, enemy, "green", guardian.region.id);
          awardExperience(hero, rewards.exp);
          hero.gold += rewards.gold;
          onGuardianDefeated(hero, enemy[0]);
          log.guardians.push({ id: guardian.id, level: hero.level, tries: attempt, expedition: log.expeditions });
          if (hero.won) break;
          continue;
        }
      }
      const zone = pickZone(hero);
      const summary = runExpedition(hero, zone.regionId, zone.zoneKey);
      hero.lastDeath = summary.outcome === "death";
      if (hero.lastDeath) log.deaths += 1;
    }
    return { classKey, profession, level: hero.level, won: hero.won, gold: hero.gold, ...log };
  }

  function zoneTable(classKey, profession, level) {
    // Single-expedition survival for a fresh hero of a given level with level-appropriate green gear.
    const rows = {};
    ZONE_KEYS.forEach((zoneKey) => {
      let complete = 0, death = 0, turns = 0, fights = 0;
      const N = 40;
      for (let i = 0; i < N; i += 1) {
        const hero = createHero({ name: "Бот", classKey, allocated: PICK_ALLOC[classKey] });
        hero.wantProfession = profession;
        const steps = level - 1;
        awardExperience(hero, Array.from({ length: steps }, (_, l) => getExperienceForNextLevel(l + 1)).reduce((a, b) => a + b, 0));
        Object.keys(hero.equipment).forEach((slot) => {
          const type = slot.split("-")[0];
          hero.equipment[slot] = generateItem({ level, rarity: level < 8 ? "white" : "green", classKey, slotType: type });
        });
        spendPoints(hero);
        applyDerivedStats(hero, true);
        hero.potions = { hp: 3, mp: 2 };
        const regionIdx = REGIONS.reduce((best, r, idx) => (level >= r.minLevel ? idx : best), 0);
        const summary = runExpedition(hero, REGIONS[regionIdx].id, zoneKey);
        if (summary.outcome === "complete") complete += 1;
        if (summary.outcome === "death") death += 1;
      }
      rows[zoneKey] = Math.round((complete / N) * 100);
    });
    return rows;
  }

  function fightTable(classKey, profession, level) {
    let turns = 0, wins = 0, N = 60, hpLeft = 0;
    for (let i = 0; i < N; i += 1) {
      const hero = createHero({ name: "Бот", classKey, allocated: PICK_ALLOC[classKey] });
      hero.wantProfession = profession;
      awardExperience(hero, Array.from({ length: level - 1 }, (_, l) => getExperienceForNextLevel(l + 1)).reduce((a, b) => a + b, 0));
      Object.keys(hero.equipment).forEach((slot) => { hero.equipment[slot] = generateItem({ level, rarity: level < 8 ? "white" : "green", classKey, slotType: slot.split("-")[0] }); });
      spendPoints(hero);
      applyDerivedStats(hero, true);
      const regionIdx = REGIONS.reduce((best, r, idx) => (level >= r.minLevel ? idx : best), 0);
      const battle = fight(hero, makeEnemy(randomFrom(REGIONS[regionIdx].enemies), level));
      turns += battle.stats.turns;
      if (battle.over === "hero") { wins += 1; hpLeft += hero.currentHp / hero.maxHp; }
    }
    return { turns: +(turns / N).toFixed(1), win: Math.round((wins / N) * 100), hpLeft: wins ? Math.round((hpLeft / wins) * 100) : 0 };
  }

  return {
    fights: Object.keys(STAT_PLAN).flatMap((c) => [1, 14, 29, 45, 60, 70].map((l) => ({ c, l, ...fightTable(c, null, l) }))),
    zones: Object.keys(STAT_PLAN).flatMap((c) => [5, 25, 45, 65].map((l) => ({ c, l, ...zoneTable(c, null, l) }))),
    careers: Object.keys(STAT_PLAN).flatMap((c) => {
      const profs = Object.keys(getBranchCatalog(c).professions);
      return Array.from({ length: ${careers} }, (_, i) => {
        globalThis.__log = null;
        const prof = profs[i % profs.length];
        return career(c, prof);
      });
    })
  };
})()`.replace("const log = { guardians: [], expeditions: 0, deaths: 0, battlesPerLevel: null };", "const log = { guardians: [], guardianTries: {}, expeditions: 0, deaths: 0 };"));

console.log("== Fight vs same-level enemy (avg hero turns / win% / hp left%)");
const byClass = {};
result.fights.forEach((row) => { (byClass[row.c] = byClass[row.c] || []).push(`L${row.l}: ${row.turns}t ${row.win}% ${row.hpLeft}hp`); });
Object.entries(byClass).forEach(([c, rows]) => console.log(c.padEnd(9), rows.join(" | ")));
console.log("\n== Expedition completion % by zone");
result.zones.forEach((row) => console.log(row.c.padEnd(9), `L${String(row.l).padEnd(3)}`, ZONES_ROW(row)));
function ZONES_ROW(row) { return ["white", "green", "orange", "purple", "red"].map((z) => `${z[0]}:${String(row[z]).padStart(3)}`).join(" "); }
console.log("\n== Careers");
result.careers.forEach((c) => console.log(`${c.classKey.padEnd(9)} ${String(c.profession).padEnd(9)} won=${c.won} lvl=${c.level} exped=${c.expeditions} deaths=${c.deaths} guardians=${c.guardians.map((g) => `${g.id}@L${g.level}/x${g.tries}/e${g.expedition}`).join(",")}`));
