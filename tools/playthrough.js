// A bot plays a fresh hero from level 1 and writes down how the road feels:
// how long each level takes (in rough minutes of real play), where it dies, and when something new appears.
// Usage: node tools/playthrough.js [class=all] [runs=3] [maxLevel=45]
// Rough real time: a hero turn ~2.5 s, a fight start/end ~6 s, a trail node choice ~4 s, a camp visit ~25 s.
const { loadCore } = require("./load-core");
const run = loadCore();
const onlyClass = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const runs = Number(process.argv[3] || 3);
const maxLevel = Number(process.argv[4] || 45);

const result = run(`(function () {
  const STAT_PLAN = { warrior: { strength: 2, endurance: 1 }, mage: { intellect: 2, endurance: 1 }, archer: { agility: 1, strength: 1, endurance: 1 }, bard: { intellect: 1, spirituality: 1, endurance: 1 }, assassin: { strength: 2, agility: 1 } };
  const PICK_ALLOC = { warrior: { strength: 3, endurance: 2 }, mage: { intellect: 3, endurance: 2 }, archer: { agility: 3, strength: 2 }, bard: { intellect: 3, endurance: 2 }, assassin: { strength: 3, agility: 2 } };
  const USE_ALLY = ${process.env.SOLO ? "false" : "true"};
  const SEC = { turn: 2.5, fight: 6, node: 4, camp: 25 };
  let L = null; // the current level's log
  const novel = (text) => { L.news.push(text); };

  function spendPoints(hero) {
    const plan = STAT_PLAN[hero.classKey];
    let guard = 0;
    while (hero.statPoints > 0 && guard++ < 500) for (const key of Object.keys(plan)) addStatPoint(hero, key, Math.min(plan[key], hero.statPoints));
    const wanted = Object.values(getBranchCatalog(hero.classKey).professions)[0];
    if (hero.level >= SUBCLASS_UNLOCK_LEVEL && !hero.subclass) { chooseSubclass(hero, wanted.subclassId); novel("подкласс"); }
    if (hero.level >= PROFESSION_UNLOCK_LEVEL && !hero.profession) { chooseProfession(hero, wanted.id); novel("профессия"); }
    // The tree: one pick per tier, the first option that is allowed.
    for (let guardPick = 0; guardPick < 60; guardPick += 1) {
      const pending = getPendingTreePick(hero);
      if (!pending) break;
      const id = pending.tier.options.find((opt) => getTreeOptionState(hero, pending.stage, pending.tier, opt).ok);
      if (!id) break;
      chooseTreeSkill(hero, pending.stage, pending.tier, id);
      const def = getSkillDefinition(id);
      novel((def.category === "active" ? "навык: " : "пассив: ") + def.name);
    }
    syncKnownSkills(hero);
    if (hero.level >= STYLE_UNLOCK_LEVEL && !getHeroStyle(hero)) { const st = getClassStyles(hero.classKey)[0]; if (st && chooseStyle(hero, st.id).ok !== false) novel("стиль: " + st.name); }
    const pendUlt = getPendingUltimateChoice(hero);
    if (pendUlt) { const u = getAvailableUltimates(hero)[0]; if (u && getHeroUltimate(hero)?.id !== u.id) { chooseUltimate(hero, u.id); novel("ультимейт: " + u.name); } markUltimateSeen(hero, pendUlt.owner); }
    getPickedTreeSkills(hero).forEach((sk) => { const forms = getSkillForms(sk.id); if (forms.length && !getHeroSkillForm(hero, sk.id) && canChooseForm(hero, sk.id, forms[0].id).ok) { chooseSkillForm(hero, sk.id, forms[0].id); novel("форма навыка: " + forms[0].name); } });
    equipBestGear(hero);
    if (featureOpen(hero, "talents")) autoSpendTalents(hero, null);
  }

  const RANK = { white: 0, green: 1, orange: 2, purple: 3, red: 4, relic: 5 };
  function looks(hero, best) {
    const items = [...Object.values(hero.equipment), ...hero.inventory, ...(hero.expedition?.bag?.items || [])].filter(Boolean);
    items.forEach((item) => { if ((RANK[item.rarity] || 0) > best.r) { best.r = RANK[item.rarity]; novel("первая " + item.rarity + " вещь"); } });
    syncProgression(hero).forEach((id) => novel("открыто: " + FEATURES[id].name));
  }

  function shop(hero) {
    if (!featureOpen(hero, "shop")) return;
    if (!hero.shop) refreshShopStock(hero);
    if (featureOpen(hero, "potions")) { while (hero.potions.hp < 3 && buyPotion(hero, "hp").ok) {} if (hero.maxMana > 120) while (hero.potions.mp < 2 && buyPotion(hero, "mp").ok) {} }
    hero.inventory.forEach((item, index) => { if (item && !isProtectedItem(item)) sellInventoryItem(hero, index); });
    const weapon = hero.equipment["weapon-1"];
    if (featureOpen(hero, "forge")) for (let i = 0; i < 3; i += 1) if (weapon && hero.gold > getEnhanceCost(weapon).gold * 2) enhanceItem(hero, weapon);
  }

  // Companions join as they do in the game; the active one fights on auto.
  function meet(hero) {
    const def = getPendingMeeting(hero);
    if (!def) return;
    const comp = recruitCompanion(hero, def.id, { rarity: def.rarities[0], source: def.id === "tessa" ? "road" : "camp" });
    if (comp) { comp.control = "auto"; novel("спутник: " + def.name); }
  }
  function fight(hero, enemy, damageBonus = 0) {
    const ally = USE_ALLY ? getActiveCompanion(hero) : null;
    if (ally) ally.control = "auto";
    const hp0 = Math.round(100 * hero.currentHp / hero.maxHp);
    const battle = createBattle(hero, enemy, ally ? { damageBonus, ally: { unit: makeAllyUnit(hero, ally), companion: ally, front: true } } : { damageBonus });
    let safety = 0;
    while (!battle.over && safety++ < 400) { if (battle.awaitingActor === "ally") break; const res = heroAction(battle, chooseBotAction(battle)); if (!res.ok) heroAction(battle, { type: "attack" }); }
    battle.__hp0 = hp0;
    if (ally) settleCompanionBattle(hero, battle);
    L.fights += 1; L.turns += battle.stats.turns;
    return battle;
  }

  function runExpedition(hero, regionId, zoneKey, best) {
    restoreHero(hero);
    const exp = createExpedition(hero, regionId, zoneKey);
    hero.expedition = exp;
    L.trips += 1;
    while (true) {
      if (exp.pendingBoons?.length) takeBoon(hero, exp, exp.pendingBoons[0]);
      const entered = enterNode(hero, exp, Math.floor(rand() * exp.choices.length));
      L.nodes += 1;
      let enemy = null;
      if (entered.kind === "event") { const res = resolveEventOption(hero, exp, entered.event, 0); if (res.battle) enemy = res.battle; } else enemy = entered.enemy;
      if (enemy) {
        const battle = fight(hero, enemy, exp.damageBonus);
        exp.damageBonus = 0;
        if (battle.over !== "hero") { (globalThis.__deaths = globalThis.__deaths || []).push(["L" + hero.level, zoneKey, "step " + exp.step, entered.nodeType || entered.kind, "hp0=" + battle.__hp0, "turns=" + battle.stats.turns, [].concat(enemy).map((f) => f.name + "/" + f.level).join(","), "pots=" + hero.potions.hp].join(" "));L.deaths += 1; L.died = L.died || {}; L.died[zoneKey] = (L.died[zoneKey] || 0) + 1; return finishExpedition(hero, exp, "death"); }
        const rewards = calculateEncounterRewards(hero, enemy, zoneKey, regionId);
        [].concat(enemy).forEach((foe) => recordKill(hero, foe));
        gain(hero, rewards.exp, best);
        applyRewardsToBag(hero, exp, rewards);
        looks(hero, best);
      }
      if (completeStep(hero, exp)) { const firstClear = !(hero.trailClears?.[regionId] || []).includes(zoneKey); const out = finishExpedition(hero, exp, "complete"); if (firstClear) novel("пройдена " + zoneKey + " тропа: " + regionId); looks(hero, best); return out; }
      if (hero.currentHp / hero.maxHp < 0.3 && hero.potions.hp === 0) { L.retreats += 1; return finishExpedition(hero, exp, "retreat"); }
    }
  }

  let levels = null;
  function gain(hero, exp, best) {
    const before = hero.level;
    awardExperience(hero, exp);
    while (levels.length < hero.level) { L = { level: levels.length + 1, fights: 0, turns: 0, trips: 0, nodes: 0, deaths: 0, retreats: 0, news: [] }; levels.push(L); }
    if (hero.level > before) spendPoints(hero);
  }

  // A careful player: the hardest trail they have already cleared, one step up when the last trip was clean.
  function pickZone(hero, state) {
    const region = REGIONS[hero.unlockedRegion];
    const clears = hero.trailClears?.[region.id] || [];
    const order = ["white", "green", "orange", "purple", "red"];
    let i = order.findIndex((z) => !clears.includes(z));
    if (i < 0) i = order.length - 1;
    if (state.lastDeath) i = Math.max(0, i - 1);
    return { regionId: region.id, zoneKey: order[i] };
  }

  function career(classKey, cap) {
    const hero = createHero({ name: "Бот", classKey, allocated: PICK_ALLOC[classKey] });
    levels = []; L = { level: 1, fights: 0, turns: 0, trips: 0, nodes: 0, deaths: 0, retreats: 0, news: [] }; levels.push(L);
    const best = { r: 0 }, state = { lastDeath: false };
    spendPoints(hero);
    for (let i = 0; i < 2500 && hero.level < cap; i += 1) {
      spendPoints(hero); shop(hero); if (USE_ALLY) meet(hero);
      const guardian = getAvailableGuardian(hero, hero.unlockedRegion);
      if (guardian && guardian.ready && hero.level >= guardian.def.level) {
        restoreHero(hero);
        const enemy = buildGuardianEncounter(guardian.id);
        const battle = fight(hero, enemy);
        restoreHero(hero);
        L.trips += 1;
        if (battle.over === "hero") {
          const rewards = calculateEncounterRewards(hero, enemy, "green", guardian.region.id);
          hero.gold += rewards.gold;
          onGuardianDefeated(hero, enemy[0]);
          novel("страж: " + enemy[0].name);
          gain(hero, rewards.exp, best);
          looks(hero, best);
          if (hero.won) break;
          continue;
        } else { L.deaths += 1; novel("поражение от стража " + enemy[0].name); }
      }
      const zone = pickZone(hero, state);
      const before = hero.unlockedRegion;
      const out = runExpedition(hero, zone.regionId, zone.zoneKey, best);
      state.lastDeath = out.outcome === "death";
      L.tries = L.tries || {}; const t = (L.tries[zone.zoneKey] = L.tries[zone.zoneKey] || { complete: 0, death: 0, retreat: 0 }); t[out.outcome] = (t[out.outcome] || 0) + 1;
      if (hero.unlockedRegion !== before) novel("новый край: " + REGIONS[hero.unlockedRegion].name);
    }
    return levels.map((row) => ({ ...row, min: +((row.turns * SEC.turn + row.fights * SEC.fight + row.nodes * SEC.node + row.trips * SEC.camp) / 60).toFixed(1) }));
  }

  const classes = ${JSON.stringify(onlyClass)} ? [${JSON.stringify(onlyClass)}] : Object.keys(STAT_PLAN);
  return classes.map((c) => { globalThis.__deaths = []; const list = Array.from({ length: ${runs} }, () => career(c, ${maxLevel})); return { c, runs: list, deaths: globalThis.__deaths }; });
})()`);

const lines = [];
const out = (s = "") => { lines.push(s); console.log(s); };
for (const { c, runs: careers, deaths } of result) {
  if (process.env.DEATHS) deaths.forEach((d) => console.error(d));
  out(`\n=== ${c} (${careers.length} прохождений) ===`);
  const maxL = Math.max(...careers.map((r) => r.length));
  let total = 0;
  out("ур.  мин  боёв  смертей  отступл.  новое");
  for (let lv = 1; lv <= maxL; lv += 1) {
    const rows = careers.map((r) => r[lv - 1]).filter(Boolean);
    if (!rows.length) continue;
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    total += avg("min");
    const news = [...new Set(rows.flatMap((r) => r.news))];
    if (process.env.TRIES) out("     " + rows.map((r) => JSON.stringify(r.tries || {})).join(" | "));
    out(`${String(lv).padStart(3)} ${avg("min").toFixed(1).padStart(5)} ${avg("fights").toFixed(1).padStart(5)} ${avg("deaths").toFixed(1).padStart(8)} ${avg("retreats").toFixed(1).padStart(9)}  ${news.join("; ")}`);
  }
  out(`Всего ≈ ${Math.round(total)} мин до ${maxL} ур.`);
  // Long stretches without anything new: where a player is most likely to get bored.
  const quiet = [];
  let start = null, mins = 0;
  for (let lv = 1; lv <= maxL; lv += 1) {
    const rows = careers.map((r) => r[lv - 1]).filter(Boolean);
    const hasNews = rows.some((r) => r.news.length);
    const m = rows.reduce((s, r) => s + r.min, 0) / Math.max(1, rows.length);
    if (!hasNews) { if (start === null) { start = lv; mins = 0; } mins += m; }
    else if (start !== null) { if (mins >= 20) quiet.push(`${start}–${lv - 1} (${Math.round(mins)} мин)`); start = null; }
  }
  if (start !== null && mins >= 20) quiet.push(`${start}–${maxL} (${Math.round(mins)} мин)`);
  out(`Тихие отрезки ≥20 мин: ${quiet.join(", ") || "нет"}`);
}
if (process.env.OUT) require("fs").writeFileSync(process.env.OUT, lines.join("\n"));
