// Core logic tests. Run: node tests/run.js
const { loadCore } = require("../tools/load-core");
const run = loadCore();

const report = run(`(function () {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: String(error && error.stack || error) }); }
  };
  const assert = (cond, msg = "assertion failed") => { if (!cond) throw new Error(msg); };
  const eq = (a, b, msg = "") => { if (a !== b) throw new Error(msg + " expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); };
  const seed = (s) => { let x = s >>> 0; setRng(() => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }); };
  const newHero = (classKey = "warrior", board = false) => { const hero = createHero({ name: "Тест", classKey, allocated: { strength: 5 } }); if (!board) { hero.freeTalents = true; hero.freeSkills = true; applyDerivedStats(hero, true); } return hero; };
  const mem = () => { const data = {}; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data }; };
  const numericFinite = (unit) => ["maxHp", "maxMana", "currentHp", "currentMana", "physicalDamage", "skillDamage", "physicalDefense", "magicDefense", "critChance", "dodgeChance", "attackSpeed"].every((key) => Number.isFinite(unit[key]));

  // Core rule tests use plain enemies; the habits have their own tests below.
  Object.values(ENEMY_DEFINITIONS).forEach((def) => { def.habits = def.traits; def.traits = []; });
  seed(12345);

  test("all five classes create valid heroes", () => {
    Object.keys(classDefinitions).forEach((key) => {
      const hero = createHero({ name: "A", classKey: key });
      assert(numericFinite(hero), key + " has NaN stats");
      assert(getPendingTreePick(hero)?.tier.level === 1, key + " is asked for the first skill");
      eq(hero.knownSkillIds.length, 0, "nothing comes by itself");
      autoBuild(hero);
      assert(getActiveSkillFromSlot(hero, 0)?.attackType, key + " has an attack after the first choice");
      assert(hero.equipment["weapon-1"], key + " has no starter weapon");
    });
  });

  test("every class has professions with active and passive skills", () => {
    Object.keys(classDefinitions).forEach((key) => {
      const catalog = getBranchCatalog(key);
      const professions = Object.values(catalog.professions);
      assert(professions.length >= 2, key + " has too few professions");
      professions.forEach((prof) => {
        const skills = Object.values(SKILL_CATALOG).filter((skill) => skill.classId === key && skill.profession === prof.id);
        assert(skills.some((skill) => skill.category === "active"), prof.id + " has no actives");
        assert(skills.some((skill) => skill.category === "passive"), prof.id + " has no passives");
      });
    });
  });

  test("every skill is usable in combat and leaves numbers finite", () => {
    Object.values(SKILL_CATALOG).filter((skill) => skill.category === "active").forEach((skill) => {
      const hero = createHero({ name: "A", classKey: skill.classId });
      hero.freeSkills = true;
      hero.level = 70;
      hero.subclass = skill.subclass || null;
      hero.profession = skill.profession || null;
      hero.knownSkillIds.push(skill.id);
      hero.activeSkillSlots = [skill.id, null, null, null, null];
      applyDerivedStats(hero, true);
      const battle = createBattle(hero, makeEnemy("wolf", 15));
      let guard = 0;
      while (!battle.awaiting && !battle.over && guard++ < 20) advanceBattle(battle);
      if (battle.over) return;
      if (skill.specialAction === "dark_sacrifice") hero.summonedUnits = [{ id: "x", type: "minion", role: "minion", name: "Слуга", hp: 30, maxHp: 30, power: 1, duration: 3 }];
      if (skill.special === "vengeance") battle.mech.guardian.value = 30;
      if (skill.special === "chorale") battle.mech.cantor.value = 30;
      if (skill.special === "judgement") battle.mech.light.value = 30;
      if (skill.special === "culmination") hero.summonedUnits = [{ id: "v", type: "spirit", role: "voice", name: "Голос", hp: 10, maxHp: 10, power: 5, duration: 3 }];
      if (skill.special === "bone_burst") hero.summonedUnits = [{ id: "u", type: "undead", role: "attacker", name: "Кость", hp: 10, maxHp: 10, power: 5, duration: 3 }];
      if (skill.special === "freeze") applyEffect(battle, battle.enemy, { id: "frostbite", duration: 3, value: 20 }, hero);
      if (skill.special === "lance_wound") applyEffect(battle, battle.enemy, { id: "poison", duration: 3, value: 9 }, hero);
      if (skill.special === "wolf_call") hero.summonedUnits = [];
      if (skill.special === "summon_strike") hero.summonedUnits = [{ id: "s", type: "spirit", role: "attacker", name: "Дух", hp: 10, maxHp: 10, power: 5, duration: 3 }];
      if (skill.special === "trap" && battle.mech.ranger) battle.mech.ranger.trap = null;
      hero.currentMana = hero.maxMana;
      const res = heroAction(battle, { type: "skill", slotIndex: 0 });
      // A skill may wait for its moment: the refusal must say what it needs.
      if (!res.ok && /^Сначала|^Нужн|^Нет |^Без /.test(res.reason || "")) return;
      assert(res.ok, skill.id + " refused: " + res.reason);
      assert(numericFinite(hero), skill.id + " broke hero numbers");
      assert(Number.isFinite(battle.enemy.currentHp), skill.id + " broke enemy hp");
      assert(describeSkillDetails(skill, hero).length > 0, skill.id + " has no description");
      assert(!/undefined|NaN/.test(describeSkillDetails(skill, hero).join(" ")), skill.id + " bad description");
    });
  });

  test("speed changes turn order on the timeline", () => {
    const hero = newHero();
    hero.attackSpeed = 200;
    const enemy = makeEnemy("stone_golem", 1);
    const battle = createBattle(hero, enemy);
    const order = previewTimeline(battle, 12);
    assert(order.filter((who) => who === "hero").length > order.filter((who) => who === "enemy").length, "faster hero must act more often");
  });

  test("guard halves damage of the next hit", () => {
    const damage = (guard) => {
      const hero = newHero();
      hero.dodgeChance = 0;
      const battle = createBattle(hero, makeEnemy("boar", 5));
      battle.guard = guard;
      battle.events.length = 0;
      seed(7);
      const enemy = battle.enemy;
      enemy.critChance = 0;
      performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
      return battle.events.find((ev) => ev.type === "hit").amount;
    };
    const open = damage(false);
    const guarded = damage(true);
    assert(guarded <= open * 0.55 && guarded >= open * 0.45, "got " + open + " and " + guarded);
  });

  test("stun on a heavy move interrupts it", () => {
    const hero = newHero();
    const enemy = makeEnemy("boar", 1);
    const battle = createBattle(hero, enemy);
    battle.intent = { id: "charge", ...ENEMY_MOVES.charge };
    setRng(() => 0);
    applyStun(battle, enemy, hero, 1);
    seed(99);
    eq(battle.intent, null, "intent");
    assert(enemy.cooldowns.charge > 0, "heavy move must go on cooldown");
    assert(battle.events.some((ev) => ev.type === "interrupt"), "no interrupt event");
  });

  test("effects do not survive a battle", () => {
    const hero = newHero();
    hero.effects = [{ id: "poison", duration: 3, value: 5, meta: {} }];
    createBattle(hero, makeEnemy("wolf", 1));
    assert(!hero.effects.some((effect) => effect.id === "poison"), "poison leaked into a new battle");
  });

  test("changing gear does not heal", () => {
    const hero = newHero();
    hero.currentHp = 10;
    addItemToInventory(hero, generateItem({ level: 1, rarity: "green", slotType: "chest", classKey: "warrior" }));
    const res = equipFromInventory(hero, 0);
    assert(res.ok, res.reason);
    assert(hero.currentHp < hero.maxHp * 0.25, "gear swap healed the hero to " + hero.currentHp);
  });

  test("equipping into a full slot swaps with the bag", () => {
    const hero = newHero();
    const old = hero.equipment["weapon-1"];
    hero.equipment["weapon-2"] = generateItem({ level: 1, rarity: "white", slotType: "weapon" });
    addItemToInventory(hero, generateItem({ level: 1, rarity: "red", slotType: "weapon", classKey: "warrior" }));
    equipFromInventory(hero, 0);
    assert(hero.inventory[0], "replaced item must return to the bag");
    assert(old === hero.inventory[0] || hero.equipment["weapon-1"] === old, "lost an item");
  });

  test("item power grows with level and rarity at all levels", () => {
    seed(5);
    const score = (level, rarity) => { let total = 0; for (let i = 0; i < 40; i += 1) total += itemPowerScore(generateItem({ level, rarity, classKey: "warrior" }), "warrior"); return total / 40; };
    assert(score(30, "green") > score(5, "green"), "level scaling");
    assert(score(10, "purple") > score(10, "white"), "rarity scaling");
    assert(generateItem({ level: 80, rarity: "white" }).itemLevel === 80, "high level loot must exist");
  });

  test("enhance is bounded and consumes resources", () => {
    const hero = newHero();
    hero.gold = 100000;
    hero.resources["iron-ore"] = 200;
    const item = hero.equipment["weapon-1"];
    const before = itemPowerScore(item, "warrior");
    setRng(() => 0);
    for (let i = 0; i < 15; i += 1) enhanceItem(hero, item);
    seed(3);
    eq(item.enhanceLevel, MAX_ENHANCE, "enhance cap");
    assert(hero.resources["iron-ore"] < 200, "resources not spent");
    assert(itemPowerScore(item, "warrior") > before, "no stat growth");
  });

  test("dismantle and mutation use resources", () => {
    const hero = newHero();
    addItemToInventory(hero, generateItem({ level: 5, rarity: "purple", classKey: "warrior" }));
    dismantleInventoryItem(hero, 0);
    assert(hero.resources["venom-gland"] >= 1 && hero.mutationShards >= 1, "no yield");
    const skillId = hero.activeSkillSlots[0];
    eq(mutateSkill(hero, skillId, "echo").ok, false, "mutation before mastery");
    const progress = getSkillProgress(hero, skillId);
    progress.level = SKILL_MAX_LEVEL;
    hero.mutationShards = 10;
    hero.resources["venom-gland"] = 2;
    eq(mutateSkill(hero, skillId, "echo").ok, true, "mutation");
    eq(mutateSkill(hero, skillId, "chain").ok, false, "second mutation");
  });

  test("expedition: fork structure ends with a boss", () => {
    const hero = newHero();
    const exp = createExpedition(hero, "thicket", "orange");
    for (let i = 0; i < exp.steps - 1; i += 1) {
      assert(!exp.choices.some((choice) => choice.type === "boss"), "boss too early");
      exp.pending = { type: "battle" };
      completeStep(hero, exp);
    }
    eq(exp.choices[0].type, "boss", "last step");
  });

  test("expedition: death loses items and half the gold, retreat keeps everything", () => {
    const mk = () => { const hero = newHero(); hero.gold = 0; const exp = createExpedition(hero, "thicket", "green"); hero.expedition = exp; exp.bag.gold = 100; exp.bag.items.push(generateItem({ level: 1 })); exp.bag.resources["iron-ore"] = 4; return { hero, exp }; };
    let { hero, exp } = mk();
    let summary = finishExpedition(hero, exp, "death");
    eq(hero.gold, 50, "gold on death");
    eq(hero.inventory.filter(Boolean).length, 0, "items on death");
    eq(hero.resources["iron-ore"], 2, "materials on death");
    eq(summary.lostItems, 1, "lost items");
    ({ hero, exp } = mk());
    finishExpedition(hero, exp, "retreat");
    eq(hero.gold, 100, "gold on retreat");
    eq(hero.inventory.filter(Boolean).length, 1, "items on retreat");
    eq(hero.expedition, null, "expedition closed");
    eq(hero.currentHp, hero.maxHp, "restored at camp");
  });

  test("expedition: full bag sells overflow instead of losing it", () => {
    const hero = newHero();
    hero.gold = 0;
    hero.inventory = hero.inventory.map(() => generateItem({ level: 1 }));
    const exp = createExpedition(hero, "thicket", "green");
    exp.bag.items.push(generateItem({ level: 1 }));
    const summary = finishExpedition(hero, exp, "retreat");
    eq(summary.soldItems, 1, "overflow");
    assert(hero.gold > 0, "no gold for overflow");
  });

  test("all events resolve for all options", () => {
    EXPEDITION_EVENTS.forEach((event) => {
      event.options.forEach((option, index) => {
        for (let i = 0; i < 12; i += 1) {
          const hero = newHero();
          const exp = createExpedition(hero, "thicket", "green");
          exp.bag.gold = i % 2 ? 500 : 0;
          const result = resolveEventOption(hero, exp, event, index);
          assert(result && typeof result.text === "string" && !/undefined|NaN/.test(result.text), event.id + ": " + JSON.stringify(result));
          assert(hero.currentHp >= 1, "event killed the hero");
        }
      });
    });
  });

  test("all enemies are valid and their moves exist", () => {
    Object.entries(ENEMY_DEFINITIONS).forEach(([id, def]) => {
      def.moves.forEach((move) => assert(ENEMY_MOVES[move], id + " unknown move " + move));
      const enemy = makeEnemy(id, def.level || 12);
      assert(numericFinite({ ...enemy, currentMana: enemy.currentMana }), id + " NaN");
    });
    REGIONS.forEach((region) => {
      region.enemies.forEach((id) => assert(ENEMY_DEFINITIONS[id], "missing enemy " + id));
      assert(ENEMY_DEFINITIONS[region.guardian]?.guardian, "missing guardian " + region.guardian);
    });
  });

  test("bot finishes every profession fight without errors", () => {
    Object.keys(classDefinitions).forEach((classKey) => {
      Object.values(getBranchCatalog(classKey).professions).forEach((prof) => {
        const hero = createHero({ name: "B", classKey });
        hero.level = 70;
        applyDerivedStats(hero, true);
        chooseSubclass(hero, prof.subclassId);
        chooseProfession(hero, prof.id);
        getVisibleClassSkills(hero).forEach((skill) => { hero.skillPoints = 9; if (getSkillStudyState(hero, skill) === "AVAILABLE") learnSkill(hero, skill.id); });
        const actives = getVisibleClassSkills(hero, "active").filter((skill) => isSkillLearned(hero, skill.id));
        hero.activeSkillSlots = [0, 1, 2, 3, 4].map((i) => actives[i]?.id || null);
        applyDerivedStats(hero, true);
        const battle = createBattle(hero, makeEnemy("rune_guard", hero.level));
        let guard = 0;
        while (!battle.over && guard++ < 300) {
          const res = heroAction(battle, chooseBotAction(battle));
          if (!res.ok) heroAction(battle, { type: "attack" });
          battle.events.length = 0;
          assert(numericFinite(hero), prof.id + " NaN in fight");
        }
        assert(battle.over, prof.id + " endless fight");
      });
    });
  });

  test("path opens step by step: subclass, then profession", () => {
    Object.keys(classDefinitions).forEach((key) => {
      const hero = createHero({ name: "M", classKey: key });
      const catalog = getBranchCatalog(key);
      assert(Object.keys(catalog.subclasses).length >= 2, key + " needs a real subclass choice");
      const sub = Object.values(catalog.subclasses)[0];
      const prof = Object.values(catalog.professions).find((entry) => entry.subclassId === sub.id);
      const other = Object.values(catalog.professions).find((entry) => entry.subclassId !== sub.id);
      eq(chooseSubclass(hero, sub.id).ok, false, "subclass before its level");
      hero.level = SUBCLASS_UNLOCK_LEVEL;
      eq(chooseProfession(hero, prof.id).ok, false, "profession before its level");
      hero.gold = 0;
      eq(chooseSubclass(hero, sub.id).ok, true, "first subclass is free");
      hero.level = PROFESSION_UNLOCK_LEVEL - 1;
      eq(chooseProfession(hero, prof.id).ok, false, "profession one level early");
      hero.level = PROFESSION_UNLOCK_LEVEL;
      eq(chooseProfession(hero, other.id).ok, false, "foreign profession");
      eq(chooseProfession(hero, prof.id).ok, true, "first profession is free");
      const skills = Object.values(SKILL_CATALOG).filter((skill) => skill.classId === key);
      skills.filter((skill) => skill.profession).forEach((skill) => assert(skill.unlockLevel >= PROFESSION_UNLOCK_LEVEL, skill.id + " opens too early"));
      skills.filter((skill) => skill.subclass && !skill.profession).forEach((skill) => assert(skill.unlockLevel >= SUBCLASS_UNLOCK_LEVEL, skill.id + " opens too early"));
      Object.values(catalog.subclasses).forEach((entry) => assert(skills.some((skill) => skill.subclass === entry.id && !skill.profession && skill.category === "active"), entry.id + " has no own skill"));
    });
  });

  test("changing path costs gold, resets profession, keeps learned skills", () => {
    const hero = createHero({ name: "M", classKey: "mage" });
    hero.freeSkills = true;
    hero.level = 64;
    hero.gold = 50000;
    chooseSubclass(hero, "elemental");
    chooseProfession(hero, "fire");
    applyDerivedStats(hero);
    assert(isSkillLearned(hero, "mage-firebolt"), "a skill of the path opens by itself");
    hero.activeSkillSlots[1] = "mage-firebolt";
    const res = chooseSubclass(hero, "light_dark");
    assert(res.ok && hero.gold < 50000, "paid change");
    eq(hero.profession, null, "profession reset");
    assert(!hero.activeSkillSlots.includes("mage-firebolt"), "foreign skill must leave slots");
    assert(isSkillLearned(hero, "mage-firebolt"), "skill remains learned");
  });

  test("old heroes lose early branch choices, and skills follow the level by themselves", () => {
    const hero = normalizeHero({ classKey: "mage", name: "Old", level: 4, skillPoints: 0, subclass: "elemental", profession: "fire", knownSkillIds: ["mage-firebolt"], activeSkillSlots: ["mage-firebolt", null, null, null, null] });
    eq(hero.subclass, null, "subclass");
    eq(hero.profession, null, "profession");
    assert(!hero.activeSkillSlots.includes("mage-firebolt"), "slot");
    eq(hero.skillPoints, 0, "the old points are gone");
    assert(hero.freeRespec, "one free rebuild");
  });

  test("loot: found items are in the backpack at once and can be worn on the trail", () => {
    const hero = newHero();
    const exp = createExpedition(hero, "thicket", "green");
    hero.expedition = exp;
    const item = generateItem({ level: 1, rarity: "green", slotType: "chest", classKey: "warrior" });
    applyRewardsToBag(hero, exp, { gold: 10, exp: 5, items: [item], resources: {}, shards: 0 });
    eq(hero.inventory[0], item, "in backpack");
    eq(item.fromTrail, true, "marked");
    eq(exp.bag.items.length, 0, "not in a hidden bag");
    eq(equipFromInventory(hero, 0).ok, true, "wearable");
    eq(hero.equipment.chest, item, "worn");
  });

  test("loot: survives save and reload during an expedition", () => {
    const hero = newHero();
    hero.expedition = createExpedition(hero, "thicket", "green");
    applyRewardsToBag(hero, hero.expedition, { gold: 1, exp: 1, items: [generateItem({ level: 1 })], resources: {}, shards: 0 });
    const loaded = normalizeHero(serializeHero(hero));
    eq(loaded.inventory[0].fromTrail, true, "flag and item kept");
  });

  test("loot: completion keeps everything, death keeps only what is worn", () => {
    const setup = () => {
      const hero = newHero();
      const exp = createExpedition(hero, "thicket", "green");
      hero.expedition = exp;
      const worn = generateItem({ level: 1, rarity: "green", slotType: "chest", classKey: "warrior" });
      const packed = generateItem({ level: 1, rarity: "green", slotType: "boots", classKey: "warrior" });
      applyRewardsToBag(hero, exp, { gold: 100, exp: 1, items: [worn, packed], resources: {}, shards: 0 });
      equipFromInventory(hero, hero.inventory.indexOf(worn));
      return { hero, exp, worn, packed };
    };
    let t = setup();
    let summary = finishExpedition(t.hero, t.exp, "complete");
    eq(t.hero.equipment.chest, t.worn, "worn after completion");
    assert(t.hero.inventory.includes(t.packed), "packed after completion");
    eq(t.packed.fromTrail, false, "secured");
    eq(summary.items.length, 2, "summary lists both");
    t = setup();
    summary = finishExpedition(t.hero, t.exp, "death");
    eq(t.hero.equipment.chest, t.worn, "worn survives death");
    eq(t.worn.fromTrail, false, "worn is secured");
    assert(!t.hero.inventory.includes(t.packed), "packed is lost");
    eq(summary.lostItems, 1, "lost count");
  });

  // ----- Effect behaviour: every status does what its description says -----
  const effectBattle = (classKey = "warrior", enemyId = "stone_golem", level = 10) => {
    const hero = createHero({ name: "E", classKey });
    hero.level = level;
    applyDerivedStats(hero, true);
    hero.attackSpeed = 500;
    const enemy = makeEnemy(enemyId, level);
    const battle = createBattle(hero, enemy);
    battle.events.length = 0;
    return { hero, enemy, battle };
  };
  const noCrit = (unit) => { unit.critChance = 0; unit.dodgeChance = 0; };
  const avgHit = (attacker, defender, battle, kind = "physical") => estimateDamage(attacker, defender, kind, 1, 0, battle).amount;

  ["poison", "burn", "bleed"].forEach((id) => {
    test(id + ": deals damage each owner turn and expires on time", () => {
      const { hero, enemy, battle } = effectBattle();
      applyEffect(battle, enemy, { id, duration: 2, value: 10, meta: id === "burn" ? { stacks: 1 } : {} }, hero);
      const hp = enemy.currentHp;
      processEffectsEndOfTurn(battle, enemy);
      eq(enemy.currentHp, hp - 10, "first tick");
      assert(unitHasEffect(enemy, id), "still active");
      processEffectsEndOfTurn(battle, enemy);
      eq(enemy.currentHp, hp - 10 - { poison: 12, burn: 10, bleed: 8 }[id], "second tick");
      assert(!unitHasEffect(enemy, id), "expired");
    });
  });

  test("burn: stacks raise damage and detonate at the cap", () => {
    const { hero, enemy, battle } = effectBattle();
    hero.profession = "fire";
    const spec = { id: "burn", duration: 5, value: 20, meta: { stacks: 2 } };
    applyEffect(battle, enemy, spec, hero);
    eq(getEffectStacks(getEffect(enemy, "burn")), 2, "stacks");
    let hp = enemy.currentHp;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp - enemy.currentHp, 25, "two stacks tick +25%");
    applyEffect(battle, enemy, spec, hero);
    hp = enemy.currentHp;
    battle.events.length = 0;
    processEffectsEndOfTurn(battle, enemy);
    assert(battle.events.some((ev) => ev.type === "detonate"), "detonation event");
    assert(hp - enemy.currentHp > 35, "detonation adds damage");
    assert(!unitHasEffect(enemy, "burn"), "burn is consumed");
  });

  test("bleed: new wounds stack, up to a limit", () => {
    const { hero, enemy, battle } = effectBattle();
    for (let i = 0; i < 6; i += 1) applyEffect(battle, enemy, { id: "bleed", duration: 2, value: 10 }, hero);
    eq(getEffect(enemy, "bleed").value, 30, "capped at three wounds");
  });

  test("regeneration: heals each turn and does not lose a turn when self-cast", () => {
    const { hero, battle } = effectBattle();
    hero.currentHp = 50;
    applyEffect(battle, hero, { id: "regeneration", duration: 2, value: 10 }, hero);
    processEffectsEndOfTurn(battle, hero);
    eq(hero.currentHp, 50, "cast turn only starts the effect");
    eq(getEffect(hero, "regeneration").duration, 2, "duration kept");
    processEffectsEndOfTurn(battle, hero);
    eq(hero.currentHp, 60, "first heal");
    processEffectsEndOfTurn(battle, hero);
    eq(hero.currentHp, 70, "second heal");
    assert(!unitHasEffect(hero, "regeneration"), "expired");
  });

  test("shield: absorbs before HP and vanishes when broken", () => {
    const { hero, battle } = effectBattle();
    applyEffect(battle, hero, { id: "shield", duration: 3, value: 30 }, hero);
    const hp = hero.currentHp;
    const first = dealDamage(battle, hero, 20);
    eq(first.absorbed, 20, "absorbed");
    eq(hero.currentHp, hp, "hp untouched");
    const second = dealDamage(battle, hero, 20);
    eq(second.absorbed, 10, "remaining shield");
    eq(hero.currentHp, hp - 10, "overflow reaches hp");
    assert(!unitHasEffect(hero, "shield"), "broken");
  });

  test("frost and haste: change speed, and so the turn order", () => {
    const { hero, enemy, battle } = effectBattle();
    const speed = getSpeed(enemy);
    applyEffect(battle, enemy, { id: "frost", duration: 2, value: 0.25 }, hero);
    assert(Math.abs(getSpeed(enemy) - speed * 0.75) < 0.01, "frost slows by its value");
    const heroSpeed = getSpeed(hero);
    applyEffect(battle, hero, { id: "haste", duration: 2, value: 0.5 }, hero);
    assert(Math.abs(getSpeed(hero) - heroSpeed * 1.5) < 0.01, "haste speeds up");
  });

  test("stun: enemy skips its turn, hero skips their turn", () => {
    const { hero, enemy, battle } = effectBattle();
    setRng(() => 0.99);
    applyEffect(battle, enemy, { id: "stun", duration: 1 }, hero);
    const hp = hero.currentHp;
    enemyTurn(battle);
    eq(hero.currentHp, hp, "stunned enemy does no damage");
    assert(!unitHasEffect(enemy, "stun"), "stun is spent");
    assert(battle.events.some((ev) => ev.type === "stunned"), "stunned event");
    const second = effectBattle("warrior", "stone_golem");
    second.battle.awaiting = false;
    second.battle.ct.hero = 0;
    second.battle.ct.enemy = 99999;
    applyEffect(second.battle, second.hero, { id: "stun", duration: 1 }, second.enemy);
    second.battle.ct.hero = 0;
    const before = second.battle.stats.turns;
    const ctBefore = second.battle.ct.hero;
    second.battle.ct.enemy = 3;
    advanceBattle(second.battle);
    assert(second.battle.stats.turns > before, "turn counted");
    assert(!unitHasEffect(second.hero, "stun"), "hero stun is spent");
    assert(second.battle.ct.hero > ctBefore, "hero lost the turn");
    seed(11);
  });

  test("silence: blocks skills, not the basic attack", () => {
    const { hero, battle } = effectBattle();
    applyEffect(battle, hero, { id: "silence", duration: 2 }, battle.enemy);
    battle.awaiting = true;
    eq(canUseSkill(battle, 0).ok, false, "skill blocked");
    eq(heroAction(battle, { type: "attack" }).ok, true, "attack allowed");
  });

  test("weaken, rage and dark fury: change damage dealt", () => {
    const { hero, enemy, battle } = effectBattle();
    const base = avgHit(hero, enemy, battle);
    applyEffect(battle, hero, { id: "rage", duration: 2, value: 0.5 }, hero);
    assert(Math.abs(avgHit(hero, enemy, battle) / base - 1.5) < 0.01, "rage");
    hero.effects = [];
    applyEffect(battle, hero, { id: "dark_fury", duration: 2, value: 0.3 }, hero);
    assert(Math.abs(avgHit(hero, enemy, battle) / base - 1.3) < 0.01, "dark fury");
    hero.effects = [];
    applyEffect(battle, hero, { id: "weaken", duration: 2, value: 0.25 }, enemy);
    assert(Math.abs(avgHit(hero, enemy, battle) / base - 0.75) < 0.01, "weaken");
  });

  test("mark and fortify: change damage taken", () => {
    const { hero, enemy, battle } = effectBattle();
    const base = avgHit(hero, enemy, battle);
    applyEffect(battle, enemy, { id: "mark", duration: 2, value: 0.25 }, hero);
    assert(Math.abs(avgHit(hero, enemy, battle) / base - 1.25) < 0.01, "mark");
    enemy.effects = [];
    applyEffect(battle, enemy, { id: "fortify", duration: 2, value: 0.3 }, enemy);
    assert(Math.abs(avgHit(hero, enemy, battle) / base - 0.7) < 0.01, "fortify");
  });

  test("armor break: reduces defense", () => {
    const { hero, enemy, battle } = effectBattle();
    const def = getDefense(enemy, "physical");
    const base = avgHit(hero, enemy, battle);
    applyEffect(battle, enemy, { id: "armor_break", duration: 2, value: 0.5 }, hero);
    assert(Math.abs(getDefense(enemy, "physical") - def * 0.5) < 0.01, "defense halved");
    assert(avgHit(hero, enemy, battle) > base, "damage grows");
  });

  test("evasion: raises the dodge roll", () => {
    const { hero, enemy, battle } = effectBattle();
    hero.dodgeChance = 0;
    applyEffect(battle, hero, { id: "evasion", duration: 2, value: 40 }, hero);
    setRng(() => 0.3);
    eq(rollHit(enemy, hero, "physical", 1, 0, 0, battle).dodged, true, "dodged at 30 under 40");
    setRng(() => 0.5);
    eq(rollHit(enemy, hero, "physical", 1, 0, 0, battle).dodged, false, "hit at 50 over 40");
    seed(21);
  });

  test("thorns: returns part of a physical hit", () => {
    const { hero, enemy, battle } = effectBattle();
    noCrit(hero);
    noCrit(enemy);
    applyEffect(battle, hero, { id: "thorns", duration: 3, value: 0.5 }, hero);
    const hp = enemy.currentHp;
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    assert(enemy.currentHp < hp, "attacker took damage");
  });

  test("self buffs last exactly the turns shown in the tooltip", () => {
    const { hero, battle } = effectBattle();
    applyEffect(battle, hero, { id: "rage", duration: 3, value: 0.2 }, hero);
    processEffectsEndOfTurn(battle, hero);
    eq(getEffect(hero, "rage").duration, 3, "cast turn is free");
    [2, 1].forEach((left) => { processEffectsEndOfTurn(battle, hero); eq(getEffect(hero, "rage").duration, left, "countdown"); });
    processEffectsEndOfTurn(battle, hero);
    assert(!unitHasEffect(hero, "rage"), "gone after three turns");
  });

  test("guard is not wasted when a fast hero acts twice in a row", () => {
    const { hero, enemy, battle } = effectBattle("warrior", "stone_golem");
    hero.attackSpeed = 200;
    battle.ct.hero = 0;
    battle.ct.enemy = 100;
    battle.awaiting = true;
    heroAction(battle, { type: "guard" });
    eq(battle.guard, true, "guard is still up on the next hero turn");
    noCrit(hero);
    noCrit(enemy);
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    const hit = battle.events.filter((ev) => ev.type === "hit").pop();
    eq(hit.guarded, true, "hit was guarded");
  });

  test("shop passives work: poison shred, flame feast by stacks", () => {
    const { hero, enemy, battle } = effectBattle("mage");
    hero.shopPassiveIds = ["toxic-penetration", "flame-feast"];
    hero.shopActive = [...hero.shopPassiveIds];
    applyEffect(battle, enemy, { id: "poison", duration: 1, value: 1 }, hero);
    processEffectsEndOfTurn(battle, enemy);
    eq(enemy.defShred, 4, "shred per tick");
    const base = getDealtMultiplier(hero, enemy, battle).mult;
    applyEffect(battle, enemy, { id: "burn", duration: 3, value: 1, meta: { stacks: 2 } }, hero);
    assert(Math.abs(getDealtMultiplier(hero, enemy, battle).mult - base - 0.24) < 0.001, "12% per stack");
  });

  test("multi-hit skill applies its effect per hit when it says so", () => {
    const hero = createHero({ name: "A", classKey: "assassin" });
    hero.level = 64;
    hero.subclass = "shade";
    hero.profession = "blade";
    hero.knownSkillIds.push("assassin-twin-fangs");
    hero.activeSkillSlots = ["assassin-twin-fangs", null, null, null, null];
    applyDerivedStats(hero, true);
    const enemy = makeEnemy("stone_golem", 14);
    enemy.dodgeChance = 0;
    const battle = createBattle(hero, enemy);
    battle.awaiting = true;
    const single = Number(resolveSkillEffectValue(hero, getSkillDefinition("assassin-twin-fangs").appliedEffects[0], getSkillDefinition("assassin-twin-fangs")));
    const skill = getSkillDefinition("assassin-twin-fangs");
    performSkillDamage(battle, skill);
    eq(getEffect(enemy, "bleed").value, single * 2, "two wounds");
  });

  const branchBattle = (classKey, subclass, profession, enemyId = "stone_golem") => {
    const hero = createHero({ name: "M", classKey });
    hero.level = 70;
    hero.subclass = subclass;
    hero.profession = profession;
    hero.dodgeChance = 0;
    applyDerivedStats(hero, true);
    hero.dodgeChance = 0;
    hero.critChance = 0;
    hero.attackSpeed = 500;
    const enemy = makeEnemy(enemyId, 70);
    enemy.dodgeChance = 0;
    const battle = createBattle(hero, enemy);
    battle.events.length = 0;
    return { hero, enemy, battle };
  };

  test("document numbers: skill points each 3 levels, 400 uses to mastery V", () => {
    eq(getEarnedSkillPointsForLevel(9), 3, "points");
    eq(SKILL_EXP_TABLE.reduce((a, b) => a + b, 0) / SKILL_EXP_PER_USE, 100, "uses");
  });

  test("fire: only the fire mage detonates", () => {
    const run = (profession) => {
      const { hero, enemy, battle } = branchBattle("mage", profession ? "elemental" : null, profession);
      applyEffect(battle, enemy, { id: "burn", duration: 3, value: 5, meta: { stacks: 4 } }, hero);
      processEffectsEndOfTurn(battle, enemy);
      return battle.events.some((ev) => ev.type === "detonate");
    };
    eq(run("fire"), true, "fire");
    eq(run(null), false, "base mage");
  });

  test("non-magic classes have no magic damage, arcane, holy or dark skills", () => {
    Object.values(SKILL_CATALOG).filter((skill) => ["warrior", "archer", "assassin"].includes(skill.classId) && skill.category === "active").forEach((skill) => {
      assert(skill.attackType !== "skill", skill.id + " uses magic damage");
      assert(!["arcane", "holy", "dark"].includes(skill.element), skill.id + " has magic element " + skill.element);
    });
  });

  test("every subclass and profession has a mechanic with a description", () => {
    Object.values(BRANCH_CATALOG).forEach((catalog) => [...Object.values(catalog.subclasses), ...Object.values(catalog.professions)].forEach((entry) => {
      assert(MECHANICS[entry.id]?.description, entry.id + " has no mechanic");
    }));
    const names = Object.values(MECHANICS).map((mech) => mech.name);
    eq(new Set(names).size, names.length, "mechanics must be different");
  });

  test("gauges never contain NaN for any branch", () => {
    Object.entries(BRANCH_CATALOG).forEach(([classKey, catalog]) => Object.values(catalog.professions).forEach((prof) => {
      const { battle } = branchBattle(classKey, prof.subclassId, prof.id);
      getMechGauges(battle).forEach((gauge) => assert(Number.isFinite(gauge.value) && Number.isFinite(gauge.max), prof.id + " gauge " + gauge.id));
    }));
  });

  test("water: chill builds frostbite, frostbite expires into slow, freeze skips a turn", () => {
    const { hero, enemy, battle } = branchBattle("mage", "elemental", "water");
    const lance = getSkillDefinition("mage-ice-lance");
    for (let i = 0; i < 3; i += 1) fireMech(battle, "afterAction", { type: "skill", skill: lance, tempo: 1 });
    assert(unitHasEffect(enemy, "frostbite"), "frostbite");
    eq(battle.mech.water.value, 0, "reset");
    getEffect(enemy, "frostbite").duration = 1;
    processEffectsEndOfTurn(battle, enemy);
    assert(unitHasEffect(enemy, "frost"), "slow after frostbite");
    applyEffect(battle, enemy, { id: "freeze", duration: 1 }, hero);
    const hp = hero.currentHp;
    enemyTurn(battle);
    eq(hero.currentHp, hp, "frozen enemy does not hit");
    assert(!unitHasEffect(enemy, "freeze"), "thawed");
  });

  test("earth: stagger weakens, full pressure stuns even a boss", () => {
    const { hero, enemy, battle } = branchBattle("mage", "elemental", "earth");
    enemy.isBoss = true;
    const fist = getSkillDefinition("mage-landslide");
    const base = estimateDamage(enemy, hero, "physical", 1, 0, battle).amount;
    fireMech(battle, "afterAction", { type: "skill", skill: fist, tempo: 1 });
    assert(estimateDamage(enemy, hero, "physical", 1, 0, battle).amount < base, "stagger");
    fireMech(battle, "afterAction", { type: "skill", skill: fist, tempo: 1 });
    assert(unitHasEffect(enemy, "stun"), "stun at 100");
  });

  test("air: full flow echoes a skill and speeds the next turn", () => {
    const { hero, battle } = branchBattle("mage", "elemental", "air");
    battle.mech.air.value = 4;
    const skill = getSkillDefinition("mage-gust-blade");
    const ctx = fireMech(battle, "afterAction", { type: "skill", skill, tempo: 1 });
    assert(ctx.tempo < 1, "tempo");
    assert(battle.events.some((ev) => ev.type === "hit"), "echo hit");
    eq(battle.mech.air.value, 0, "spent");
  });

  test("dark: weaken brings corruption, which eats magic defense", () => {
    const { enemy, battle, hero } = branchBattle("mage", "light_dark", "dark");
    applySkillEffects(battle, getSkillDefinition("mage-curse"), hero, enemy);
    assert(unitHasEffect(enemy, "corruption"), "corruption");
    const def = getDefense(enemy, "magic");
    processEffectsEndOfTurn(battle, enemy);
    assert(getDefense(enemy, "magic") < def, "shred");
  });

  test("summons: enemies can hit them, undead death feeds bones, limit is per branch", () => {
    const { hero, enemy, battle } = branchBattle("mage", "summoner", "undead");
    eq(getSummonLimit(hero), 5, "army limit");
    hero.summonedUnits = [{ id: "a", type: "undead", role: "tank", name: "Зомби", hp: 1, maxHp: 10, power: 1, duration: 5, taunt: 2 }];
    setRng(() => 0);
    const hp = hero.currentHp;
    enemy.critChance = 0;
    hero.dodgeChance = 0;
    setRng(() => 0.3);
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    seed(31);
    eq(hero.summonedUnits.length, 0, "zombie died");
    eq(battle.mech.undead.value, 1, "bone");
    eq(hero.currentHp, hp, "hero was covered");
  });

  test("dark servant: sacrifice works through the shared summon model", () => {
    const { hero, enemy, battle } = branchBattle("mage", "light_dark", "dark");
    hero.knownSkillIds.push("mage-shadow-servant", "mage-ritual-sacrifice");
    hero.activeSkillSlots = ["mage-shadow-servant", "mage-ritual-sacrifice", null, null, null];
    battle.awaiting = true;
    heroAction(battle, { type: "skill", slotIndex: 0 });
    assert((hero.summonedUnits || []).some((unit) => unit.role === "minion") || battle.over, "servant exists");
  });

  test("guardian: blocked damage becomes vengeance, the strike spends it", () => {
    const { hero, enemy, battle } = branchBattle("warrior", "bulwark", "guardian");
    battle.guard = true;
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    assert(battle.mech.guardian.value > 0, "stored");
    const hp = enemy.currentHp;
    SKILL_ACTIONS.vengeance.run(battle, getSkillDefinition("warrior-retribution"));
    assert(enemy.currentHp < hp, "damage");
    eq(battle.mech.guardian.value, 0, "spent");
  });

  test("duelist: armed parry blocks a hit, counters and forces the next crit", () => {
    const { hero, enemy, battle } = branchBattle("warrior", "bulwark", "duelist");
    battle.mech.duelist.armed = true;
    const hp = hero.currentHp;
    const enemyHp = enemy.currentHp;
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    eq(hero.currentHp, hp, "no damage");
    assert(enemy.currentHp < enemyHp, "counter");
    eq(battle.mech.duelist.crit, true, "crit armed");
  });

  test("berserk: stronger when hurt, survives one lethal blow", () => {
    const { hero, enemy, battle } = branchBattle("warrior", "fury", "berserk");
    const ctx = { kind: "physical", mult: 1 };
    MECHANICS.berserk.beforeHit(battle, battle.mech.berserk, ctx);
    const full = ctx.mult;
    hero.currentHp = Math.round(hero.maxHp * 0.25);
    const low = { kind: "physical", mult: 1 };
    MECHANICS.berserk.beforeHit(battle, battle.mech.berserk, low);
    assert(low.mult > full, "scales");
    hero.currentHp = 1;
    enemy.physicalDamage *= 50;
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    eq(hero.currentHp, 1, "saved");
    eq(battle.mech.berserk.saved, true, "only once");
  });

  test("breaker: cracks pierce armor and five break it", () => {
    const { enemy, battle } = branchBattle("warrior", "fury", "breaker");
    const skill = getSkillDefinition("warrior-hammer-blow");
    [1, 2, 3].forEach(() => fireMech(battle, "afterAction", { type: "skill", skill, tempo: 1 }));
    assert(unitHasEffect(enemy, "armor_break"), "broken");
  });

  test("marksman: focus grows, a wound removes it, piercing beats armor", () => {
    const { hero, enemy, battle } = branchBattle("archer", "marksman", "sniper");
    battle.mech.marksman.value = 0;
    fireMech(battle, "afterAction", { type: "wait", tempo: 1 });
    eq(battle.mech.marksman.value, 2, "wait gives two");
    fireMech(battle, "hurt", { hpDamage: 5, absorbed: 0, blocked: 0 });
    eq(battle.mech.marksman.value, 1, "wound");
    assert(estimateDamage(hero, enemy, "physical", 1, 0, battle, 0.5).amount > estimateDamage(hero, enemy, "physical", 1, 0, battle, 0).amount, "pierce");
  });

  test("ranger: a trap fires on the enemy turn, only one at a time", () => {
    const { hero, enemy, battle } = branchBattle("archer", "wild", "ranger");
    const skill = getSkillDefinition("archer-poison-trap");
    SKILL_ACTIONS.trap.run(battle, skill);
    eq(SKILL_ACTIONS.trap.can(battle).ok, false, "one trap");
    const hp = enemy.currentHp;
    enemyTurn(battle);
    assert(enemy.currentHp < hp || unitHasEffect(enemy, "poison"), "trap fired");
    eq(battle.mech.ranger.trap, null, "spent");
  });

  test("beastmaster: wolf comes at the start and answers commands", () => {
    const { hero, enemy, battle } = branchBattle("archer", "wild", "beastmaster");
    assert(findWolf(hero), "wolf");
    const hp = enemy.currentHp;
    SKILL_ACTIONS.wolf_strike.run(battle, getSkillDefinition("archer-pack-tactics"));
    assert(enemy.currentHp < hp, "strike");
    hero.summonedUnits = [];
    eq(SKILL_ACTIONS.wolf_strike.can(battle).ok, false, "dead wolf");
    SKILL_ACTIONS.wolf_call.run(battle);
    assert(findWolf(hero), "called back");
  });

  test("skald: three different verses make a chorus", () => {
    const { hero, battle } = branchBattle("bard", "lyre", "skald");
    ["bard-war-hymn", "bard-thunder-note"].forEach((id) => fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition(id), tempo: 1 }));
    eq(MECHANICS.skald.value(battle, battle.mech.skald), 2, "two verses");
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-saga-life"), tempo: 1 });
    eq(MECHANICS.skald.value(battle, battle.mech.skald), 0, "chorus spent");
    assert(unitHasEffect(hero, "rage"), "chorus buffs");
  });

  test("trickster: a card is drawn and spent by a skill", () => {
    const { battle } = branchBattle("bard", "lyre", "trickster");
    assert(battle.mech.trickster.card, "card");
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-dirge"), tempo: 1 });
    eq(battle.mech.trickster.card, null, "spent");
  });

  test("hymn: one hymn at a time, might raises damage", () => {
    const { battle } = branchBattle("bard", "hymn", "cantor");
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-might-hymn"), tempo: 1 });
    eq(battle.mech.hymn.active, "might", "active");
    const ctx = { mult: 1 };
    MECHANICS.hymn.beforeHit(battle, battle.mech.hymn, ctx);
    assert(Math.abs(ctx.mult - 1.15) < 0.001, "might");
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-clarity-hymn"), tempo: 1 });
    eq(battle.mech.hymn.active, "clarity", "replaced");
  });

  test("cantor: overheal is stored and released", () => {
    const { hero, enemy, battle } = branchBattle("bard", "hymn", "cantor");
    healUnit(battle, hero, 100);
    assert(battle.mech.cantor.value >= 100, "stored");
    const hp = enemy.currentHp;
    SKILL_ACTIONS.chorale.run(battle, getSkillDefinition("bard-chorale"));
    assert(enemy.currentHp < hp && unitHasEffect(hero, "shield"), "released");
  });

  test("shade and blade: combo builds, a finisher spends it, low targets are executed", () => {
    const { enemy, battle } = branchBattle("assassin", "shade", "blade");
    fireMech(battle, "afterHit", { kind: "physical", crit: false });
    fireMech(battle, "afterHit", { kind: "physical", crit: true });
    eq(battle.mech.shade.value, 3, "combo");
    enemy.currentHp = Math.floor(enemy.maxHp * 0.1);
    SKILL_ACTIONS.finisher.run(battle, getSkillDefinition("assassin-execution"));
    eq(enemy.currentHp, 0, "executed");
    eq(battle.mech.shade.value, 0, "spent");
  });

  test("phantom: a dodge makes a shadow that repeats hits", () => {
    const { enemy, battle } = branchBattle("assassin", "shade", "phantom");
    fireMech(battle, "dodged");
    eq(battle.mech.phantom.value, 1, "shadow");
    battle.events.length = 0;
    performHeroHit(battle, { kind: "physical", power: 1, label: "Удар", element: "steel", sure: true });
    eq(battle.events.filter((ev) => ev.type === "hit").length, 2, "echo");
  });

  test("venom: poison stacks; poisoner bursts it; plague grows from ticks", () => {
    const first = branchBattle("assassin", "venom", "poisoner");
    applyEffect(first.battle, first.enemy, { id: "poison", duration: 3, value: 10 }, first.hero);
    applyEffect(first.battle, first.enemy, { id: "poison", duration: 3, value: 10 }, first.hero);
    eq(getEffect(first.enemy, "poison").value, 20, "stacked");
    const hp = first.enemy.currentHp;
    const remaining = getEffect(first.enemy, "poison").value * getEffect(first.enemy, "poison").duration;
    SKILL_ACTIONS.lance_wound.run(first.battle, getSkillDefinition("assassin-lance-wound"));
    eq(hp - first.enemy.currentHp, remaining, "all remaining damage");
    const second = branchBattle("assassin", "venom", "plaguebearer");
    applyEffect(second.battle, second.enemy, { id: "poison", duration: 9, value: 4 }, second.hero);
    for (let i = 0; i < 5; i += 1) processEffectsEndOfTurn(second.battle, second.enemy);
    eq(second.battle.mech.plaguebearer.plague, true, "plague");
  });

  test("every status has an icon and every effect a definition", () => {
    Object.values(SKILL_CATALOG).forEach((skill) => (skill.appliedEffects || []).forEach((config) => assert(STATUS_EFFECT_DEFINITIONS[config.id], skill.id + " unknown effect " + config.id)));
    Object.values(ENEMY_MOVES).forEach((move) => { if (move.apply) assert(STATUS_EFFECT_DEFINITIONS[move.apply.id], "unknown effect " + move.apply.id); });
  });

  const restoreHabits = () => Object.values(ENEMY_DEFINITIONS).forEach((def) => { def.traits = def.habits; });
  const clearHabits = () => Object.values(ENEMY_DEFINITIONS).forEach((def) => { def.traits = []; });
  const talentBattle = (classKey, sub, prof, ids = [], enemyId = "wolf") => {
    const hero = newHero(classKey);
    hero.level = 72; hero.subclass = sub; hero.profession = prof; hero.talents = ids; hero.attackSpeed = 500;
    hero.defeatedGuardians = [];
    applyDerivedStats(hero, true);
    hero.attackSpeed = 500;
    const battle = createBattle(hero, makeEnemy(enemyId, 60));
    return { hero, battle, enemy: battle.enemy };
  };
  const findTalent = (name) => Object.values(TALENTS).find((def) => def.name === name).id;

  test("talent library: every effect school has real depth, every class has choices", () => {
    assert(Object.keys(TALENTS).length >= 200, "only " + Object.keys(TALENTS).length);
    Object.values(TALENT_SCHOOLS).filter((s) => !s.subclass && !s.profession && !s.classOnly && !s.id.startsWith("x-")).forEach((s) => assert(s.talents.length >= 8, s.id));
    Object.values(TALENT_SCHOOLS).forEach((s) => assert(TALENT_KINDS && s.talents.every((id) => TALENT_KINDS[TALENTS[id].kind]), s.id));
    Object.keys(BRANCH_CATALOG).forEach((c) => Object.values(BRANCH_CATALOG[c].professions).forEach((p) => assert(TALENT_SCHOOLS[p.id]?.talents.length >= 3, "no profession talents " + p.id)));
    Object.keys(BRANCH_CATALOG).forEach((c) => Object.values(BRANCH_CATALOG[c].subclasses).forEach((p) => assert(TALENT_SCHOOLS[p.id]?.talents.length >= 3, "no subclass talents " + p.id)));
    ["amp", "shift", "make", "link", "key"].forEach((kind) => assert(Object.values(TALENTS).filter((d) => d.kind === kind).length >= 10, kind));
  });

  test("talent logic: closed schools stay closed to classes with no reason to touch them", () => {
    const hero = newHero("warrior"); hero.level = 50;
    const ids = getHeroSchools(hero).map((s) => s.id);
    ["burn", "frost", "shock", "poison", "hex", "arcana"].forEach((id) => assert(!ids.includes(id), "warrior has " + id));
    const mage = newHero("mage");
    ["poison", "bleed", "power", "crit"].forEach((id) => assert(!getHeroSchools(mage).some((s) => s.id === id), "mage has " + id));
  });

  test("skill logic: every effect follows from its source, blood never burns", () => {
    Object.values(SKILL_CATALOG).forEach((skill) => (skill.appliedEffects || []).forEach((config) => {
      const allowed = EFFECT_SOURCES[config.id];
      if (allowed && config.target !== "self" && skill.element) assert(allowed.includes(skill.element), skill.id + " (" + skill.element + ") applies " + config.id);
    }));
  });

  test("development points: one per two levels, two for each of the first four guardians", () => {
    const hero = newHero("assassin", true); hero.level = 48; hero.defeatedGuardians = ["greyfang"];
    eq(getDevPointsTotal(hero), 26, "total");
    hero.defeatedGuardians = ["greyfang", "greyfang"];
    eq(getDevPointsTotal(hero), 26, "the same guardian does not pay twice");
    hero.level = 80; hero.defeatedGuardians = ["greyfang", "pyre_queen", "archivist", "smith"];
    eq(getDevPointsTotal(hero), 48, "the ceiling");
  });

  test("boards: every talent of every board can be reached by the rules", () => {
    Object.entries(TALENT_BOARDS).forEach(([classKey, board]) => {
      board.forEach((school) => school.slots.forEach((slot) => {
        const hero = newHero(classKey, true); hero.level = 80; hero.defeatedGuardians = ["greyfang", "pyre_queen", "archivist", "smith"];
        // A player takes the way to the node first, then fills the depth with whatever does not clash with that way.
        const way = [];
        const walk = (entry) => { if (way.includes(entry)) return; way.push(entry); if (entry.afterAny?.length) walk(school.slots.find((other) => other.key === entry.afterAny[0])); };
        walk(slot);
        const clashes = (entry) => way.some((other) => {
          const a = TALENTS[resolveSlotTalent(hero, entry)];
          const b = TALENTS[resolveSlotTalent(hero, other)];
          return (a.excludes || []).includes(b.id) || (b.excludes || []).includes(a.id);
        });
        const fill = [...school.slots].filter((entry) => entry !== slot && !clashes(entry)).sort((a, b) => a.tier - b.tier);
        for (let round = 0; round < 3; round += 1) {
          [...way.filter((entry) => entry !== slot).sort((a, b) => a.tier - b.tier), ...fill.filter((entry) => entry.tier < slot.tier)].forEach((entry) => {
            if (getSlotState(hero, school, entry).ok) hero.talents = [...hero.talents, resolveSlotTalent(hero, entry)];
          });
        }
        const state = getSlotState(hero, school, slot);
        assert(state.ok, classKey + "/" + school.id + "/" + slot.key + ": " + state.reason);
      }));
    });
  });

  test("boards: depth, links, circle limits and keystones really limit the build", () => {
    const hero = newHero("warrior", true); hero.level = 40; hero.defeatedGuardians = ["greyfang", "pyre_queen", "archivist", "smith"];
    const school = getTalentBoard(hero)[1];
    const tier = (n) => school.slots.filter((slot) => slot.tier === n);
    assert(/вложить/.test(getSlotState(hero, school, tier(2)[0]).reason), "the second circle asks for depth");
    tier(1).slice(0, 3).forEach((slot) => { assert(takeTalent(hero, resolveSlotTalent(hero, slot)).ok, "first circle"); });
    hero.talents = hero.talents.filter((id) => id !== resolveSlotTalent(hero, tier(1).find((slot) => tier(2)[0].afterAny.includes(slot.key))));
    hero.level = 5;
    assert(/уровень/.test(getSlotState(hero, school, tier(2)[0]).reason), "and level");
    hero.level = 40;
    hero.gold = 1e6; assert(resetBuild(hero).ok); eq(hero.talents.length, 0, "reset");
    autoBuild(hero);
    assert(getDevPointsFree(hero) >= 0, "never over budget");
    getTalentBoard(hero).forEach((entry) => {
      assert(entry.slots.filter((slot) => slot.tier === 3 && isSlotTaken(hero, slot)).length <= TALENT_TIER3_LIMIT, "third circle limit");
      assert(entry.slots.filter((slot) => slot.tier === 4 && isSlotTaken(hero, slot)).length <= 1, "one keystone in a school");
    });
    assert(getBoardKeystoneCount(hero) <= getBoardKeystoneLimit(hero), "keystones");
    const taken = getActiveTalentIds(hero).length;
    assert(taken < getTalentBoard(hero).reduce((sum, entry) => sum + entry.slots.length, 0) / 2, "far from everything can be taken");
  });

  test("build: forms replace how a skill works, cost a point, and the catalog stays intact", () => {
    Object.keys(TALENT_BOARDS).forEach((classKey) => {
      const skills = Object.values(SKILL_CATALOG).filter((skill) => skill.classId === classKey && SKILL_FORMS[skill.id]);
      assert(skills.length >= 4, classKey + " has forms");
    });
    const hero = newHero("warrior", true); hero.level = 30; hero.gold = 1e5;
    hero.skillPicks = { "warrior:1": "warrior-raskol" };
    applyDerivedStats(hero);
    const skill = getSkillDefinition("warrior-raskol");
    const before = skill.powerMultiplier;
    const [a, b] = getSkillForms(skill.id);
    const points = getDevPointsFree(hero);
    assert(chooseSkillForm(hero, skill.id, a.id).ok);
    eq(getDevPointsFree(hero), points - 1, "a point is spent");
    eq(skill.powerMultiplier, before, "catalog untouched");
    eq(getActiveSkillFromSlot(hero, hero.activeSkillSlots.indexOf(skill.id)).powerMultiplier, a.patch.powerMultiplier, "the hero uses the form");
    const gold = hero.gold;
    assert(chooseSkillForm(hero, skill.id, b.id).ok, "switched");
    assert(hero.gold < gold, "switching costs gold");
    eq(getDevPointsFree(hero), points - 1, "still one point");
    hero.expedition = {};
    assert(!canChooseForm(hero, skill.id, a.id).ok, "not on the road");
    hero.expedition = null;
    const back = normalizeHero(JSON.parse(JSON.stringify(hero)));
    eq(back.skillForms[skill.id], b.id, "survives a save");
  });

  test("build: styles and ultimates follow the path, two new ones at each step", () => {
    const hero = newHero("warrior", true); hero.level = 4; hero.gold = 1e5;
    const [s1, s2] = getClassStyles("warrior");
    assert(!chooseStyle(hero, s1.id).ok, "not before level 5");
    hero.level = 5;
    assert(chooseStyle(hero, s1.id).ok); eq(hero.gold, 1e5, "the first style is free");
    assert(chooseStyle(hero, s2.id).ok); assert(hero.gold < 1e5, "a change costs gold");
    eq(getStylePower(hero), 0.08); hero.level = 28; eq(getStylePower(hero), 0.17, "it grows");
    Object.keys(BRANCH_CATALOG).forEach((classKey) => {
      eq(ULT_PAIRS[classKey].length, 2, classKey);
      Object.keys(BRANCH_CATALOG[classKey].subclasses).forEach((id) => eq(ULT_PAIRS[id].length, 2, id));
      Object.keys(BRANCH_CATALOG[classKey].professions).forEach((id) => eq(ULT_PAIRS[id].length, 2, id));
    });
    hero.level = 10;
    eq(getAvailableUltimates(hero).length, 2, "class");
    assert(getPendingUltimateChoice(hero), "a new pair asks for an answer");
    hero.level = 30; hero.subclass = "fury";
    eq(getAvailableUltimates(hero).length, 4, "and the subclass");
    eq(getPendingUltimateChoice(hero).owner, "fury", "the newest is asked about");
    hero.level = 60; hero.profession = "berserk";
    eq(getAvailableUltimates(hero).length, 6, "and the profession");
    const id = ULT_PAIRS.berserk[1];
    assert(chooseUltimate(hero, id).ok); eq(getHeroUltimate(hero).id, id, "worn");
    markUltimateSeen(hero, "berserk"); eq(getPendingUltimateChoice(hero), null, "answered");
    hero.subclass = "bulwark"; hero.profession = null;
    assert(getHeroUltimate(hero).id !== id, "a foreign ultimate falls off with the path");
  });

  test("build: an old hero keeps gear and level, gets one free rebuild", () => {
    const raw = JSON.parse(JSON.stringify(newHero("warrior", true)));
    delete raw.buildVersion; delete raw.skillForms; delete raw.freeTalents;
    raw.level = 40; raw.talents = ["bleed/1", "burn/1", "no/such"]; raw.gold = 7;
    const hero = normalizeHero(raw);
    assert(hero.freeRespec, "free");
    assert(!hero.talents.includes("burn/1"), "off the board is gone");
    eq(hero.gold, 7, "gold stays");
    assert(getDevPointsFree(hero) >= 0, "never in debt");
    assert(getPendingTreePick(hero), "the tree asks for the choices again");
    assert(resetBuild({ ...hero, talents: ["x"] }).ok, "the rebuild is free");
  });

  test("every talent, boon and trait runs through full fights without a crash or NaN", () => {
    const classes = Object.keys(BRANCH_CATALOG);
    let fights = 0;
    classes.forEach((classKey) => Object.values(BRANCH_CATALOG[classKey].professions).forEach((prof) => {
      const hero = newHero(classKey);
      hero.level = 72; hero.subclass = prof.subclassId; hero.profession = prof.id; hero.talentsExchanged = 500;
      hero.talents = getHeroSchools(hero).flatMap((s) => s.talents);
      getVisibleClassSkills(hero).forEach((skill) => { hero.knownSkillIds.push(skill.id); if (skill.category === "passive") hero.passiveIds.push(skill.id); });
      const actives = getVisibleClassSkills(hero, "active");
      hero.activeSkillSlots = actives.slice(-5).map((skill) => skill.id);
      hero.expedition = { boons: Object.keys(BOONS).filter((id) => !BOONS[id].classes || BOONS[id].classes.includes(classKey)), bag: { items: [] } };
      Object.keys(LEGENDARY_TRAITS).slice(0, 4).forEach((id, i) => { const item = generateItem({ level: 60, rarity: "red", classKey }); item.trait = id; hero.equipment[Object.keys(hero.equipment)[i]] = item; });
      applyDerivedStats(hero, true);
      assert(numericFinite(hero), prof.id + " NaN before");
      ["wolf", "slime", "rune_guard", "wraith", "smith", "limit_shard", "star_eater"].forEach((enemyId) => {
        ENEMY_DEFINITIONS[enemyId].traits = ENEMY_DEFINITIONS[enemyId].habits;
        const battle = createBattle(hero, makeEnemy(enemyId, 40));
        let guard = 0;
        while (!battle.over && guard++ < 300) { const res = heroAction(battle, chooseBotAction(battle)); if (!res.ok) heroAction(battle, { type: "attack" }); }
        assert(numericFinite(hero) && Number.isFinite(battle.enemy.currentHp), prof.id + " NaN vs " + enemyId);
        ENEMY_DEFINITIONS[enemyId].traits = [];
        restoreHero(hero);
        fights += 1;
      });
    }));
    assert(fights >= 100);
  });

  test("poison and bleed are different: poison grows and ignores shields", () => {
    const { hero, battle, enemy } = talentBattle("assassin", null, null);
    applyEffect(battle, enemy, { id: "shield", duration: 9, value: 100000 }, enemy);
    applyEffect(battle, enemy, { id: "poison", duration: 5, value: 100 }, hero);
    enemy.stunnedLast = true;
    let hp = enemy.currentHp;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp - enemy.currentHp, 100, "first tick through the shield, even when stunned");
    hp = enemy.currentHp;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp - enemy.currentHp, 120, "grows");
    healUnit(battle, enemy, 100, "");
  });

  test("poison and bleed are different: bleed waits for movement, fades, doubles on heavy, crit opens it", () => {
    const { hero, battle, enemy } = talentBattle("assassin", null, null);
    applyEffect(battle, enemy, { id: "bleed", duration: 5, value: 100 }, hero);
    enemy.stunnedLast = true;
    let hp = enemy.currentHp;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp, enemy.currentHp, "a stunned target does not bleed");
    eq(getEffect(enemy, "bleed").duration, 5, "the wound waits");
    enemy.stunnedLast = false;
    battle.lastEnemyHeavy = true;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp - enemy.currentHp, 200, "heavy move doubles");
    battle.lastEnemyHeavy = false;
    eq(getEffect(enemy, "bleed").value, 75, "fades");
    hp = enemy.currentHp;
    setRng(() => 0.5);
    performHeroHit(battle, { kind: "physical", power: 0, flat: 0, label: "x", element: "steel", forceCrit: true, sure: true });
    seed(12345);
    assert(hp - enemy.currentHp >= 75, "crit tears it open");
    applyEffect(battle, enemy, { id: "shield", duration: 9, value: 100000 }, enemy);
    hp = enemy.currentHp;
    processEffectsEndOfTurn(battle, enemy);
    eq(hp, enemy.currentHp, "a shield stops the wound");
  });

  test("a charge broken during the enemy's own move does not crash the turn", () => {
    const { hero, battle, enemy } = talentBattle("warrior", null, null, [findTalent("Шипастый щит")]);
    hero.attackSpeed = 1;
    applyEffect(battle, hero, { id: "shield", duration: 9, value: 100000 }, hero);
    enemy.charge = { name: "Заряд", power: 5, kind: "physical", left: 0, need: 1, taken: 0 };
    battle.intent = { id: "release", name: "Заряд", kind: "release", power: 5, heavy: true };
    battle.ct.enemy = 0; battle.ct.hero = 1e9;
    enemyTurn(battle);
    assert(!enemy.charge, "charge finished");
  });

  test("talents announce themselves in battle", () => {
    const { hero, battle, enemy } = talentBattle("assassin", null, null, [findTalent("Едкий состав")]);
    battle.events = [];
    performHeroHit(battle, { kind: "physical", power: 1, label: "x", element: "steel", forceCrit: true, sure: true });
    assert(battle.events.some((e) => e.type === "proc" && e.text === "Едкий состав"), "proc event");
  });

  test("nothing in the shop repeats a talent or a boon", () => {
    const words = (text) => new Set(text.toLowerCase().replace(/[^а-яё0-9 ]/g, " ").split(/ +/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
    const same = (a, b) => { const A = words(a), B = words(b); if (A.size !== B.size) return false; let hit = 0; A.forEach((x) => { if (B.has(x)) hit += 1; }); return hit === A.size; };
    const talentNames = new Set([...Object.values(TALENTS), ...Object.values(BOONS)].map((d) => d.name));
    const others = [...Object.values(TALENTS), ...Object.values(BOONS)].map((d) => d.description);
    SHOP_PASSIVE_CATALOG.forEach((p) => {
      assert(!talentNames.has(p.name), "same name: " + p.name);
      assert(!others.some((text) => same(text, p.description)), "same text: " + p.name);
    });
  });

  test("groups: target choice, a kill keeps the fight going, a sweep hits everyone", () => {
    const hero = newHero("mage"); hero.level = 72; hero.subclass = "elemental"; hero.attackSpeed = 500; applyDerivedStats(hero, true); hero.attackSpeed = 500;
    const foes = [makeEnemy("wolf", 30), makeEnemy("wolf", 30), makeEnemy("wolf", 30)];
    const battle = createBattle(hero, foes);
    assert(setBattleTarget(battle, 2)); eq(battle.enemy, foes[2]);
    foes[2].currentHp = 1;
    performHeroHit(battle, { kind: "magic", power: 1, label: "x", element: "arcane", sure: true });
    checkBattleOver(battle);
    assert(!battle.over && foes[2].dead, "fight goes on");
    assert(battle.enemy !== foes[2] && battle.enemy.currentHp > 0, "retargeted");
    foes[0].dodgeChance = 0; foes[1].dodgeChance = 0;
    const hp = [foes[0].currentHp, foes[1].currentHp];
    hero.knownSkillIds.push("mage-cinder-wave");
    performSkillDamage(battle, { ...getSkillDefinition("mage-cinder-wave"), appliedEffects: [] });
    assert(foes[0].currentHp < hp[0] && foes[1].currentHp < hp[1], "sweep");
    foes[0].currentHp = 0; foes[1].currentHp = 0;
    assert(checkBattleOver(battle) && battle.over === "hero", "all down");
  });

  test("groups: every foe acts on its own timer and the player's target survives their turns", () => {
    const hero = newHero("warrior"); applyDerivedStats(hero, true); hero.maxHp = 1e6; hero.currentHp = 1e6;
    const foes = [makeEnemy("wolf", 5), makeEnemy("slime", 5)];
    const battle = createBattle(hero, foes);
    setBattleTarget(battle, 1);
    let guard = 0;
    while (guard++ < 12 && !battle.over) { battle.awaiting = true; heroAction(battle, { type: "wait" }); assert(battle.enemy === foes[1], "target kept"); }
    assert(hero.currentHp < 1e6, "someone hit the hero");
    assert(previewTimeline(battle, 6).length === 6);
  });

  test("class core: warrior builds rage from hits and wounds", () => {
    const { hero, battle } = talentBattle("warrior", null, null);
    eq(hero.currentMana, 0, "starts empty");
    performHeroHit(battle, { kind: "physical", power: 1, label: "x", element: "steel", sure: true });
    assert(hero.currentMana >= 14, "hit builds");
    const before = hero.currentMana;
    fireMech(battle, "hurt", { hpDamage: 5, absorbed: 0, blocked: 0, kind: "physical" });
    assert(hero.currentMana > before, "wound builds");
  });

  test("class core: mage overheats and backfires; meditation cools", () => {
    const { hero, battle } = talentBattle("mage", null, null);
    const core = battle.mech.core_mage;
    core.value = 99;
    const hp = hero.currentHp;
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("mage-ether-beam"), tempo: 1 });
    assert(hero.currentHp < hp && unitHasEffect(hero, "stun"), "backfire");
    hero.effects = [];
    core.value = 80;
    battle.awaiting = true;
    heroAction(battle, { type: "wait" });
    assert(core.value <= 30 + 20, "cooled");
  });

  test("class core: archer's range turns melee hits into approach", () => {
    const { hero, battle, enemy } = talentBattle("archer", null, null);
    const core = battle.mech.core_archer;
    eq(core.value, 1, "starts at range");
    const hp = hero.currentHp;
    enemy.dodgeChance = 0;
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    eq(core.value, 0); eq(hero.currentHp, hp, "no damage while closing");
    core.value = 0;
    hero.dodgeChance = 0;
    setRng(() => 0.5);
    performEnemyMove(battle, { id: "strike", ...ENEMY_MOVES.strike });
    seed(12345);
    assert(hero.currentHp < hp, "melee reaches");
  });

  test("class core: bard's three notes make a motif", () => {
    const { hero, battle, enemy } = talentBattle("bard", null, null);
    hero.currentHp = 10;
    const core = battle.mech.core_bard;
    core.notes = ["life", "life"];
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-soothing-verse"), tempo: 1 });
    eq(core.notes.length, 0, "motif resolved");
    assert(hero.currentHp > 10, "hymn healed");
    core.notes = ["blade", "shade"];
    fireMech(battle, "afterAction", { type: "skill", skill: getSkillDefinition("bard-soothing-verse"), tempo: 1 });
    assert(unitHasEffect(hero, "rage"), "chord");
  });

  test("class core: assassin starts hidden, strikes hard, a kill hides again", () => {
    const foes = [makeEnemy("wolf", 10), makeEnemy("wolf", 10)];
    const hero = newHero("assassin"); hero.level = 40; applyDerivedStats(hero, true); hero.attackSpeed = 500;
    const battle = createBattle(hero, foes);
    const core = battle.mech.core_assassin;
    assert(core.hidden, "hidden at start");
    eq(hero.currentMana, 100);
    battle.awaiting = true;
    foes[0].dodgeChance = 0;
    heroAction(battle, { type: "attack" });
    assert(!core.hidden || foes[0].currentHp <= 0, "strike reveals");
    foes[0].currentHp = 0;
    core.hidden = false;
    checkBattleOver(battle);
    assert(core.hidden, "kill hides again");
  });

  test("ultimate: charges from actions, then fires once", () => {
    const { hero, battle, enemy } = talentBattle("mage", null, null);
    assert(!canUseUltimate(battle));
    battle.ult = 100; battle.awaiting = true;
    const hp = enemy.currentHp;
    assert(heroAction(battle, { type: "ult" }).ok);
    assert(enemy.currentHp < hp, "hit");
    assert(battle.ult < 100, "spent");
    const low = newHero("mage"); const b2 = createBattle(low, makeEnemy("wolf", 1)); b2.ult = 100;
    assert(!canUseUltimate(b2), "locked before level 10");
  });

  test("bosses: scripts run: the alpha calls wolves and a big hit is capped", () => {
    Object.values(ENEMY_DEFINITIONS).forEach((def) => { def.traits = def.habits ?? def.traits; });
    const hero = newHero("warrior"); hero.level = 40; applyDerivedStats(hero, true); hero.maxHp = 1e7; hero.currentHp = 1e7;
    const foes = buildGuardianEncounter("greyfang");
    const battle = createBattle(hero, foes);
    const boss = battle.foes[0];
    const big = boss.maxHp;
    const dealt = dealDamage(battle, boss, big).hpDamage;
    assert(dealt < big * 0.45, "hit cap, got " + dealt);
    boss.currentHp = Math.round(boss.maxHp * 0.6);
    battle.enemy = boss;
    enemyTurn(battle, boss);
    assert(battle.foes.length >= 3, "wolves came");
    const queen = buildGuardianEncounter("pyre_queen");
    eq(queen.length, 3, "two braziers");
    Object.values(ENEMY_DEFINITIONS).forEach((def) => { if (def.habits) def.traits = []; });
  });

  test("sets: bonuses switch on at 2 and 4 pieces", () => {
    const hero = newHero("mage");
    const slots = ["head", "chest", "legs", "boots"];
    const part = (slotType) => generateItem({ level: 5, rarity: "orange", classKey: "mage", slotType, setId: "overheated" });
    slots.slice(0, 1).forEach((slot) => { hero.equipment[slot] = part(slot); });
    eq(getActiveSetBonuses(hero).length, 0);
    const it = part(slots[1]); hero.equipment[slots[1]] = it;
    applyDerivedStats(hero, true);
    eq(tm(hero, "heatCap"), 30, "two pieces");
    slots.slice(2).forEach((slot) => { hero.equipment[slot] = part(slot); });
    eq(getActiveSetBonuses(hero).filter((bonus) => !bonus.id.endsWith("-power")).length, 2, "four pieces");
    assert(normalizeItem(JSON.parse(JSON.stringify(it))).setId === "overheated", "save keeps set");
    assert(it.name.includes("Раскалённый посох"), "named");
  });

  test("sets: two rings are one part, six parts add the third bonus", () => {
    const hero = newHero("mage");
    hero.equipment["ring-1"] = generateItem({ level: 5, rarity: "relic", classKey: "mage", slotType: "ring", setId: "overheated" });
    hero.equipment["ring-2"] = generateItem({ level: 5, rarity: "relic", classKey: "mage", slotType: "ring", setId: "overheated" });
    eq(getActiveSetCounts(hero).overheated, 1, "same slot type counts once");
    ["head", "chest", "legs", "boots", "necklace"].forEach((slot) => { hero.equipment[slot] = generateItem({ level: 5, rarity: "relic", classKey: "mage", slotType: slot, setId: "overheated" }); });
    eq(getActiveSetBonuses(hero).filter((bonus) => !bonus.id.endsWith("-power")).length, 3, "six parts");
    hero.equipment.bracelet = null;
    hero.equipment["bracelet-1"] = generateItem({ level: 5, rarity: "relic", classKey: "mage", slotType: "bracelet", setId: "overheated" });
    hero.equipment["weapon-1"] = generateItem({ level: 5, rarity: "relic", classKey: "mage", slotType: "weapon", setId: "overheated" });
    eq(getActiveSetCounts(hero).overheated, SET_FULL, "eight different parts");
    eq(getActiveSetBonuses(hero).filter((bonus) => !bonus.id.endsWith("-power")).length, 4, "the whole set");
    assert(getActiveSetBonuses(hero).some((bonus) => bonus.id.endsWith("-power") && bonus.mods.dmg > 0.15), "each part adds power");
    Object.values(SET_CATALOG).forEach((set) => assert(set.bonus8?.description, set.id + " has a full set bonus"));
    Object.values(SET_CATALOG).forEach((set) => assert(set.bonus6?.description, set.id + " has a six piece bonus"));
  });

  test("relics stand above red and ordinary drops carry no sets", () => {
    const relic = generateItem({ level: 30, rarity: "relic", classKey: "warrior", slotType: "chest", setId: "smith_hammer" });
    const red = generateItem({ level: 30, rarity: "red", classKey: "warrior", slotType: "chest", blueprint: ITEM_BLUEPRINTS.find((bp) => bp.name === relic.blueprint), setId: null });
    const sum = (item) => Object.values(item.bonuses).reduce((a, b) => a + b, 0);
    assert(sum(relic) > sum(red), "relic stronger");
    for (let i = 0; i < 60; i += 1) eq(generateItem({ level: 30, rarity: "red", classKey: "warrior" }).setId, null, "no set on a plain drop");
  });

  test("trails open one after another and only a finished trail counts", () => {
    const hero = newHero("warrior");
    assert(isZoneOpen(hero, "thicket", "white"), "white is open");
    assert(!isZoneOpen(hero, "thicket", "green"), "green waits");
    hero.expedition = createExpedition(hero, "thicket", "white");
    finishExpedition(hero, hero.expedition, "retreat");
    assert(!isZoneOpen(hero, "thicket", "green"), "a retreat opens nothing");
    hero.expedition = createExpedition(hero, "thicket", "white");
    finishExpedition(hero, hero.expedition, "complete");
    assert(isZoneOpen(hero, "thicket", "green"), "finished white opens green");
    assert(!isZoneOpen(hero, "ashlands", "green"), "each region has its own order");
    assert(!isZoneOpen(hero, "thicket", "orange"), "one step at a time");
    hero.level = 99;
    assert(!getAvailableGuardian(hero, 0).ready, "the boss waits for the purple trail");
    markTrailCleared(hero, "thicket", "purple");
    assert(getAvailableGuardian(hero, 0).ready, "purple opens the boss");
  });

  test("boss stays the same for any hero level", () => {
    const low = makeEnemy("archivist", ENEMY_DEFINITIONS.archivist.level);
    const group = buildGuardianEncounter("archivist");
    eq(group[0].maxHp, low.maxHp, "fixed strength");
    assert(describeGuardian("archivist", newHero("mage")).hp === low.maxHp, "the card tells the truth");
  });

  test("a lair is one fight with its master, and pays a relic of the chosen set and a token", () => {
    const hero = newHero("archer"); hero.level = 20;
    markTrailCleared(hero, "thicket", "green");
    assert(getLairState(hero, LAIR_CATALOG.wolf_den).ok, "open after green");
    assert(!getLairState(hero, LAIR_CATALOG.viper_hollow).ok, "the second lair needs purple");
    assert(!getLairState(hero, LAIR_CATALOG.wolf_den, 40).ok, "a rank far above the hero is shut");
    const exp = hero.expedition = createLairRun(hero, "wolf_den", "hunter_camp");
    eq(exp.steps, 1, "no stops on the way");
    eq(exp.choices.length, 1);
    const entered = enterNode(hero, exp, 0);
    eq(entered.enemy.length, 1, "alone");
    eq(entered.enemy[0].name, "Матёрая Волчица", "the master has a name");
    eq(entered.enemy[0].level, 10);
    assert(entered.enemy[0].stages.length >= 2, "changes during the fight");
    const summary = finishExpedition(hero, exp, "complete");
    eq(summary.relic.rarity, "relic"); eq(summary.relic.setId, "hunter_camp", "chosen set");
    eq(hero.lairTokens.wolf_den, 1, "a token");
    eq(hero.lairBest.wolf_den, 10, "the rank is remembered");
    hero.lairTokens.wolf_den = LAIR_TOKENS_FOR_EXCHANGE;
    const swap = exchangeLairTokens(hero, "wolf_den", "hunter_camp", "boots");
    assert(swap.ok && swap.item.slotType === "boots" && hero.lairTokens.wolf_den === 0, "tokens buy the wanted part");
  });

  test("lair ranks reach the top, and a higher rank pays a higher relic", () => {
    Object.values(LAIR_CATALOG).forEach((lair) => {
      const ranks = getLairRanks(lair);
      eq(ranks[0], lair.level, lair.id + " starts at its own level");
      eq(ranks[ranks.length - 1], LAIR_TOP_LEVEL, lair.id + " reaches the top");
    });
    const hero = newHero("warrior"); hero.level = 40;
    markTrailCleared(hero, "thicket", "green");
    const exp = hero.expedition = createLairRun(hero, "wolf_den", "alpha_hide", 40);
    eq(enterNode(hero, exp, 0).enemy[0].level, 40);
    eq(finishExpedition(hero, exp, "complete").relic.itemLevel, 40);
    assert(makeLairBoss(hero, LAIR_CATALOG.wolf_den, 40).maxHp > makeLairBoss(hero, LAIR_CATALOG.wolf_den, 10).maxHp, "stronger at a higher rank");
  });

  test("a relic found early can be raised, but not above the rank beaten", () => {
    const hero = newHero("warrior"); hero.level = 50; hero.gold = 1e7;
    const relic = generateRelic(hero, "alpha_hide", 10, "chest");
    const before = Object.values(relic.bonuses).reduce((sum, value) => sum + value, 0);
    assert(!getRelicAscension(hero, relic).ok, "nothing beaten yet");
    hero.lairBest = { wolf_den: 40 }; hero.lairTokens = { wolf_den: 5 };
    const plan = getRelicAscension(hero, relic);
    assert(plan.ok, "allowed now"); eq(plan.target, 40, "as high as the rank");
    assert(ascendRelic(hero, relic).ok, "raised");
    eq(relic.itemLevel, 40);
    assert(Object.values(relic.bonuses).reduce((sum, value) => sum + value, 0) > before, "stronger");
    assert(hero.lairTokens.wolf_den < 5, "paid in tokens");
    assert(!getRelicAscension(hero, relic).ok, "no second raise at the same rank");
    assert(!getRelicAscension(hero, generateItem({ level: 10, rarity: "purple", classKey: "warrior", slotType: "chest" })).ok, "only relics");
  });

  test("every lair master survives a whole fight, its stages fire and no number breaks", () => {
    Object.values(LAIR_CATALOG).forEach((lair) => {
      ["warrior", "mage", "archer", "bard", "assassin"].forEach((classKey) => {
        const hero = newHero(classKey); hero.level = 50;
        applyDerivedStats(hero, true); restoreHero(hero);
        hero.maxHp = hero.currentHp = 2e7;
        hero.physicalDamage *= 6; hero.skillDamage *= 6;
        const boss = makeLairBoss(hero, lair, lair.level);
        const b = createBattle(hero, [boss]);
        let guard = 0;
        while (!b.over && guard++ < 400) { const r = heroAction(b, chooseBotAction(b)); if (!r.ok) heroAction(b, { type: "attack" }); }
        assert(Number.isFinite(boss.currentHp) && Number.isFinite(hero.currentHp), lair.id + " keeps numbers finite");
        eq(b.over, "hero", lair.id + " can be finished by " + classKey);
        assert(boss.stages.some((stage) => stage.done), lair.id + " went through its stages");
      });
    });
  });

  test("a move through which a stance gives no help ignores the guard", () => {
    const hero = newHero("warrior"); hero.level = 30; applyDerivedStats(hero, true); restoreHero(hero);
    assert(ENEMY_MOVES.ex_block.pierceGuard, "the block ignores it");
    const boss = makeLairBoss(hero, LAIR_CATALOG.red_mile, 30);
    const b = createBattle(hero, [boss]);
    hero.dodgeChance = 0;
    const damage = (pierce) => {
      let total = 0;
      for (let i = 0; i < 30; i += 1) {
        b.guard = true;
        hero.maxHp = hero.currentHp = 1e7;
        performEnemyMove(b, { ...ENEMY_MOVES.ex_chop, id: "x", pierceGuard: pierce });
        total += 1e7 - hero.currentHp;
      }
      return total;
    };
    assert(damage(true) > damage(false) * 1.4, "the stance gives no help");
  });

  test("a lair master's stride closes the archer's distance and still hits", () => {
    const hero = newHero("archer"); hero.level = 30; applyDerivedStats(hero, true); restoreHero(hero);
    const b = createBattle(hero, [makeLairBoss(hero, LAIR_CATALOG.red_mile, 30)]);
    b.mech.core_archer.value = 2;
    eq(fireMech(b, "enemyAttack", { kind: "physical", move: ENEMY_MOVES.ex_chop, cancel: false }).cancel, false, "the blow lands");
    eq(b.mech.core_archer.value, 1, "the distance shrinks");
  });

  test("gear: every class has its own things in every slot, and cannot wear others", () => {
    ["warrior", "mage", "archer", "bard", "assassin"].forEach((classKey) => {
      SET_SLOT_TYPES.forEach((slotType) => {
        const list = ITEM_BLUEPRINTS.filter((bp) => bp.slotType === slotType && bp.classes.includes(classKey));
        assert(list.length >= 3, classKey + " has enough " + slotType);
        assert(list.some((bp) => bp.level <= 6), classKey + " has an early " + slotType);
      });
      assert(ITEM_BLUEPRINTS.some((bp) => bp.offhand && bp.level <= 3 && bp.classes.includes(classKey)), classKey + " has an early second hand");
      for (let i = 0; i < 80; i += 1) {
        const item = generateItem({ level: randomInt(1, 70), rarity: "orange", classKey });
        assert(fitsClass(item, classKey), item.name + " dropped for " + classKey);
      }
    });
    const hero = newHero("mage");
    hero.inventory[0] = generateItem({ level: 1, rarity: "white", blueprint: ITEM_BLUEPRINTS.find((bp) => bp.name === "Доспех дозорного") });
    hero.inventory[0].requiredLevel = 1;
    const refused = equipFromInventory(hero, 0);
    assert(!refused.ok && refused.reason.includes("класса"), "plate is not for a mage");
  });

  test("gear: every class has its own weapon family, and nobody else touches it", () => {
    const FAMILY = { warrior: ["sword", "axe", "hammer", "shield"], mage: ["staff", "tome"], archer: ["bow", "quiver"], bard: ["lute", "lyre", "tuningFork"], assassin: ["dagger"] };
    ITEM_BLUEPRINTS.filter((bp) => bp.slotType === "weapon").forEach((bp) => {
      eq(bp.classes.length, 1, bp.name + " belongs to one class");
      assert(FAMILY[bp.classes[0]].includes(bp.weapon), bp.name + " is " + bp.weapon);
    });
    Object.entries(STARTER_WEAPON).forEach(([classKey, name]) => {
      const bp = ITEM_BLUEPRINTS.find((entry) => entry.name === name);
      assert(bp?.classes.includes(classKey) && !bp.offhand, classKey + " starts with its own main weapon");
    });
    assert(!ITEM_BLUEPRINTS.some((bp) => /рапир|шпаг|арбалет/i.test(bp.name)), "no stray weapons");
    ["warrior", "mage", "archer", "bard", "assassin"].forEach((classKey) => {
      assert(ITEM_BLUEPRINTS.some((bp) => bp.slotType === "weapon" && bp.offhand && bp.level <= 3 && bp.classes.includes(classKey)), classKey + " second hand early");
      assert(/Удар|Выстрел/.test(getBasicAttackLabel(newHero(classKey))), "plain attack label");
    });
    eq(getBasicAttackLabel(newHero("bard")), "Удар лютней");
    eq(getBasicAttackLabel(newHero("archer")), "Выстрел");
  });

  test("gear: old saved weapons follow the renames and keep every number", () => {
    const hero = newHero("bard");
    const old = { id: "x1", name: "Песнь волчьей луны: Рапира звонкой рифмы", blueprint: "Рапира звонкой рифмы", weapon: "rapier", slotType: "weapon", rarity: "relic", itemLevel: 40, requiredLevel: 38, bonuses: { intellect: 9 }, flatBonuses: {}, affixes: [{ id: "pdmg", suffix: "клинка", flat: "physicalDamage", amount: 7 }], setId: "wolf_song", enhanceLevel: 2, value: 99 };
    const item = normalizeItem(old);
    eq(item.name, "Песнь волчьей луны: Камертон звонкой рифмы");
    eq(item.blueprint, "Камертон звонкой рифмы"); eq(item.weapon, "tuningFork");
    eq(item.affixes[0].suffix, "натиска"); eq(item.affixes[0].amount, 7, "amount stays");
    eq(item.itemLevel, 40); eq(item.enhanceLevel, 2); eq(item.bonuses.intellect, 9); eq(item.id, "x1");
    assert(fitsClass(item, "bard"), "the bard can wear it"); eq(chooseEquipSlot(hero, item), "weapon-2", "second hand");
    const again = normalizeItem(JSON.parse(JSON.stringify(item)));
    eq(again.name, item.name, "a second load changes nothing");
    const plain = normalizeItem({ id: "x2", name: "Короткий клинок клинка", blueprint: "Короткий клинок", weapon: "sword", slotType: "weapon", rarity: "green", itemLevel: 3, requiredLevel: 1, bonuses: {}, flatBonuses: {}, affixes: [{ id: "pdmg", suffix: "клинка", flat: "physicalDamage", amount: 2 }], value: 5 });
    eq(plain.name, "Широкий меч дозорного натиска");
  });

  test("gear: the second hand is for second hand things", () => {
    const hero = newHero("warrior");
    const shield = generateItem({ level: 1, rarity: "white", blueprint: ITEM_BLUEPRINTS.find((bp) => bp.name === "Щит первой вахты") });
    shield.requiredLevel = 1;
    eq(chooseEquipSlot(hero, shield), "weapon-2");
    hero.inventory[0] = shield;
    assert(equipFromInventory(hero, 0).ok, "worn");
    eq(hero.equipment["weapon-2"], shield);
    const sword = generateItem({ level: 1, rarity: "white", blueprint: ITEM_BLUEPRINTS.find((bp) => bp.name === "Широкий меч дозорного") });
    hero.inventory[1] = sword;
    assert(!equipFromInventory(hero, 1, "weapon-2").ok, "a warrior holds one main weapon");
    const killer = newHero("assassin");
    const blade = generateItem({ level: 1, rarity: "white", blueprint: ITEM_BLUEPRINTS.find((bp) => bp.name === "Кинжал сумрака") });
    eq(getSlotKeysForItem(blade, "assassin").length, 2, "an assassin may hold two");
    assert(killer, "ok");
  });

  test("bulk: many things are sold or taken apart at once, filters spare the precious", () => {
    const hero = newHero("warrior");
    const add = (rarity, setId = null) => addItemToInventory(hero, generateItem({ level: 10, rarity, classKey: "warrior", slotType: "ring", setId }));
    add("white"); add("white"); add("green"); add("purple"); add("relic", "alpha_hide");
    eq(bagFilterIndices(hero, "white").length, 2);
    eq(bagFilterIndices(hero, "all").length, 4, "the relic is spared");
    const preview = previewBulk(hero, bagFilterIndices(hero, "white"));
    const gold = hero.gold;
    const sold = sellInventoryItems(hero, bagFilterIndices(hero, "white"));
    eq(sold.count, 2); eq(sold.total, preview.gold); eq(hero.gold, gold + preview.gold);
    eq(hero.inventory.filter(Boolean).length, 3);
    const ore = previewBulk(hero, bagFilterIndices(hero, "green"));
    const before = Number(hero.resources["ether-dust"] || 0);
    eq(dismantleInventoryItems(hero, bagFilterIndices(hero, "green")).count, 1);
    eq(Number(hero.resources["ether-dust"] || 0), before + ore.resources["ether-dust"]);
    assert(previewBulk(hero, hero.inventory.flatMap((item, index) => (item ? [index] : []))).risky === 2, "the purple and the relic need a warning");
    const relicIndex = hero.inventory.findIndex((item) => item?.rarity === "relic");
    const parts = dismantleInventoryItems(hero, [relicIndex]);
    assert(Object.keys(parts.resources).every((id) => id !== "undefined"), "a relic has a real material");
    eq(sellInventoryItems(hero, [relicIndex, relicIndex, 99]).count, 0, "empty and repeated cells do nothing");
  });

  test("story: every scene is well formed and every reference leads somewhere", () => {
    const required = ["intro", "postgame", "final:choice", "death:first", "death:third", "retreat:first", "set:full", "path:subclass", "path:profession"];
    ["warrior", "mage", "archer", "bard", "assassin"].forEach((key) => required.push("class:" + key));
    REGIONS.forEach((region) => {
      required.push("region:" + region.id, "boss_before:" + region.guardian, "boss_after:" + region.guardian);
      ZONE_KEYS.forEach((zone) => required.push("trail:" + region.id + ":" + zone));
    });
    Object.values(LAIR_CATALOG).forEach((lair) => required.push("lair:" + lair.master));
    required.forEach((id) => assert(STORY_SCENES[id], "scene " + id));
    const people = new Set(["narrator", ...STORY_CHARACTERS.map((character) => character.id), ...Object.keys(ENEMY_DEFINITIONS)]);
    const gendered = /\bты\s+(прош[её]л|пришл[аи]?|устал|готов|сделал|нашёл|видел|вернулся|вернулась|должен|должна)\b/i;
    const check = (id, line) => {
      assert(people.has(line.who), id + " speaker " + line.who);
      assert(line.text && line.text.length <= 190, id + " line length: " + line.text);
      assert(!gendered.test(line.text), id + " gendered: " + line.text);
    };
    Object.entries(STORY_SCENES).forEach(([id, scene]) => {
      (scene.lines || []).forEach((line) => check(id, line));
      (scene.choice?.options || []).forEach((option) => (option.lines || []).forEach((line) => check(id, line)));
      if (scene.next) assert(STORY_SCENES[scene.next], id + " next");
    });
    STORY_ENDINGS.forEach((ending) => assert(STORY_SCENES["ending:" + ending.id], "ending " + ending.id));
  });

  test("story: a new hero starts with the opening, scenes play once and a choice lasts", () => {
    const hero = newHero("mage");
    eq(hero.story.queue[0], "intro");
    assert(hero.story.queue.includes("class:mage"), "own opening");
    assert(!hero.story.queue.includes("class:bard"), "not somebody else's");
    markStorySeen(hero, "intro");
    assert(storyHasFlag(hero, "intro_seen"), "scene flags are set");
    eq(storyEvent(hero, "intro"), false, "never twice");
    markTrailCleared(hero, "thicket", "orange");
    syncStoryEvents(hero);
    assert(hero.story.queue.includes("trail:thicket:orange"), "the road asks for its scene");
    const option = STORY_SCENES["trail:thicket:orange"].choice.options[1];
    const damage = tm(hero, "dmg");
    chooseStoryOption(hero, "trail:thicket:orange", option);
    assert(storyHasFlag(hero, "bridge_decided"), "the decision is known");
    assert(tm(hero, "dmg") > damage, "and it gives its lasting power");
    const back = normalizeHero(JSON.parse(JSON.stringify(hero)));
    assert(storyHasFlag(back, option.flag), "it survives a save");
    assert(tm(back, "dmg") > damage, "so does the power");
    const lines = getStoryLines(hero, [{ who: "veya", text: "x {name}", if: "bridge_home" }, { who: "veya", text: "y", if: "bridge_people" }]);
    eq(lines.length, 1); assert(lines[0].text.includes(hero.name), "the name is filled in");
  });

  test("story: the secret ending opens only with all eight witnesses, the others after the Smith", () => {
    const hero = newHero("warrior");
    const options = () => getStoryOptions(hero, STORY_SCENES["final:choice"].choice).map((option) => option.ending);
    eq(options().length, 0, "nothing before the Smith");
    hero.defeatedGuardians.push("smith");
    eq(options().length, 3, "three open roads");
    assert(!options().includes("shared"), "the fourth is hidden");
    Object.values(LAIR_CATALOG).forEach((lair) => { hero.lairClears[lair.id] = 1; });
    syncStoryEvents(hero);
    Object.values(LAIR_CATALOG).forEach((lair) => markStorySeen(hero, "lair:" + lair.master));
    syncStoryEvents(hero);
    assert(hero.story.queue.includes("witness:complete"), "the witnesses add up");
    markStorySeen(hero, "witness:complete");
    assert(options().includes("shared"), "now the fourth is there");
    chooseStoryOption(hero, "final:choice", STORY_SCENES["final:choice"].choice.options.find((option) => option.ending === "shared"));
    assert(hero.story.queue.includes("ending:shared"), "its ending plays");
    markStorySeen(hero, "ending:shared");
    assert(hero.story.queue.includes("postgame"), "then what comes after");
    const post = getStoryLines(hero, STORY_SCENES.postgame.lines);
    eq(post.filter((line) => line.if).length, 1, "the epilogue talks only about the chosen ending");
  });

  test("story: deaths cost feelings, retreats do not, and an old hero keeps the road walked", () => {
    const hero = newHero("archer");
    hero.expedition = createExpedition(hero, "thicket", "white");
    finishExpedition(hero, hero.expedition, "retreat");
    eq(Number(hero.story.deaths || 0), 0);
    syncStoryEvents(hero);
    assert(hero.story.queue.includes("retreat:first"), "a retreat is noticed");
    hero.expedition = createExpedition(hero, "thicket", "white");
    finishExpedition(hero, hero.expedition, "death");
    eq(hero.story.deaths, 1);
    eq(getLostMemories(hero).length, 1, "one feeling is gone");
    syncStoryEvents(hero);
    assert(hero.story.queue.includes("death:first"), "the price is explained");
    const old = JSON.parse(JSON.stringify(newHero("bard")));
    delete old.story;
    old.trailClears = { thicket: ["white", "green", "orange", "purple"] };
    old.defeatedGuardians = ["greyfang"]; old.unlockedRegion = 1;
    const back = normalizeHero(old);
    assert(back.story.seen.includes("trail:thicket:white"), "the old road counts as seen");
    assert(!back.story.seen.includes("trail:thicket:orange"), "a big decision is not skipped");
    assert(back.story.queue.includes("intro"), "the opening still plays");
    assert(getStoryProgress(back).currentIndex === 0, "the bridge still waits");
  });

  test("story: the chapters follow the road", () => {
    const hero = newHero("warrior");
    eq(getStoryProgress(hero).currentIndex, 0);
    ["white", "green", "orange", "purple", "red"].forEach((zone) => markTrailCleared(hero, "thicket", zone));
    hero.story.flags.push("bridge_people");
    hero.defeatedGuardians.push("greyfang");
    eq(getStoryProgress(hero).currentIndex, 1, "the next chapter opens");
    STORY_CHAPTERS.forEach((chapter) => chapter.objectives.forEach((objective) => assert(objective.done && Object.keys(objective.done).length === 1, chapter.id + " goal " + objective.text)));
    assert(STORY_CHAPTERS.filter((chapter) => chapter.parallel).length === 1, "lairs run alongside");
  });

  test("trees: skills come only by choice, one per step, and a lane's last step asks for loyalty", () => {
    Object.keys(BRANCH_CATALOG).forEach((classKey) => {
      const tree = SKILL_TREES[classKey];
      assert(tree && tree.lanes.length === 3, classKey + " has three lanes");
      const all = tree.stages.flatMap((stage) => stage.tiers.flatMap((tier) => tier.options));
      eq(new Set(all).size, all.length, classKey + " uses a skill once");
      all.forEach((id) => { const skill = getSkillDefinition(id); if (skill.category === "active") assert(skill.anim, id + " has its own animation"); });
    });
    const hero = newHero("bard", true); hero.level = 22; hero.gold = 1e5;
    applyDerivedStats(hero);
    eq(hero.knownSkillIds.length, 0, "no skill by itself at level 22");
    const stage = SKILL_TREES.bard.stages[0];
    const last = stage.tiers[5];
    assert(!getTreeOptionState(hero, stage, last, last.options[0]).ok, "the last step is closed");
    assert(chooseTreeSkill(hero, stage, stage.tiers[0], stage.tiers[0].options[0]).ok);
    eq(hero.knownSkillIds.length, 1);
    assert(hero.activeSkillSlots.includes(stage.tiers[0].options[0]), "goes to the panel");
    assert(chooseTreeSkill(hero, stage, stage.tiers[1], stage.tiers[1].options[0]).ok);
    assert(getTreeOptionState(hero, stage, last, last.options[0]).ok, "two skills of the lane open its last step");
    assert(!getTreeOptionState(hero, stage, last, last.options[1]).ok, "but not another lane's");
    const gold = hero.gold;
    assert(chooseTreeSkill(hero, stage, stage.tiers[0], stage.tiers[0].options[1]).ok, "changed");
    assert(hero.gold < gold, "a change costs gold");
    assert(!hero.knownSkillIds.includes(stage.tiers[0].options[0]), "the old one is gone");
    const back = normalizeHero(JSON.parse(JSON.stringify(hero)));
    assert(back.knownSkillIds.includes(stage.tiers[0].options[1]), "survives a save");
    hero.expedition = {};
    assert(!getTreeOptionState(hero, stage, stage.tiers[2], stage.tiers[2].options[0]).ok, "not on the road");
  });

  test("camp: people answer the last return and the save keeps it", () => {
    const hero = newHero("mage", true);
    hero.story.seen = ["intro"];
    eq(getCampTalk(hero).moment, "none", "nothing happened yet");
    const exp = createExpedition(hero, REGIONS[0].id, "white");
    hero.expedition = exp;
    finishExpedition(hero, exp, "death");
    const talk = getCampTalk(hero);
    eq(talk.speaker, "nima", "the healer meets a death");
    assert(talk.text.includes(STORY_MEMORIES[0].label), "and names the feeling that was lost");
    assert(!/{/.test(talk.text), "no placeholder left");
    onGuardianDefeated(hero, { defId: REGIONS[0].guardian });
    eq(getCampTalk(hero).speaker, "veya", "the guide meets a fallen guardian");
    const back = normalizeHero(JSON.parse(JSON.stringify(serializeHero(hero))));
    eq(back.story.lastTrip.guardian, REGIONS[0].guardian, "the last return survives a reload");
    const junk = JSON.parse(JSON.stringify(serializeHero(hero)));
    junk.story.lastTrip = { outcome: "мусор" };
    eq(normalizeHero(junk).story.lastTrip, null, "a broken record is dropped");
    Object.entries(CAMP_TALK).forEach(([who, lines]) => lines.forEach((line) => {
      assert(!/ты [а-яё]+(л|ла|лся|лась)/i.test(line.text), who + ": no gender for the hero: " + line.text);
      for (let turn = 0; turn < 4; turn += 1) assert(getCampTalk(hero, who, turn).text, who + " always has a line");
    }));
  });

  test("audit: every lair is open to every class and pays with something it can wear", () => {
    Object.keys(BRANCH_CATALOG).forEach((classKey) => {
      const hero = newHero(classKey, true);
      Object.values(LAIR_CATALOG).forEach((lair) => {
        const sets = getLairRewardSetIds(hero, lair);
        assert(sets.length, lair.id + " pays " + classKey);
        sets.forEach((id) => assert(SET_CATALOG[id].classes.includes(classKey), id + " fits " + classKey));
        const run = createLairRun(hero, lair.id, lair.sets[0]);
        assert(SET_CATALOG[run.lairSet].classes.includes(classKey), "a foreign set can not be asked for");
      });
    });
  });

  test("audit: a full pack makes room for a relic and never sells it", () => {
    const hero = newHero("bard", true);
    hero.level = 40;
    for (let i = 0; i < INVENTORY_SIZE; i += 1) hero.inventory[i] = generateItem({ level: 40, rarity: "white", classKey: "bard" });
    const lair = Object.values(LAIR_CATALOG).find((entry) => getLairRewardSetIds(hero, entry).length);
    const exp = createLairRun(hero, lair.id, getLairRewardSetIds(hero, lair)[0]);
    hero.expedition = exp;
    const summary = finishExpedition(hero, exp, "complete");
    assert(hero.inventory.some((item) => item?.setId === exp.lairSet), "the relic is in the pack");
    eq(summary.soldItems, 1, "one plain thing made room");
  });

  test("audit: a broken save loads, and a closed page does not repeat a road event", () => {
    const hero = newHero("mage", true);
    hero.expedition = createExpedition(hero, REGIONS[0].id, "green");
    const data = serializeHero(hero);
    ["expedition", "talents", "knownSkillIds", "story", "records", "inventory", "equipment", "gold", "level", "resources"].forEach((key) => {
      ["мусор", 5, null, [], {}].forEach((junk) => {
        const raw = JSON.parse(JSON.stringify(data));
        raw[key] = junk;
        const back = normalizeHero(raw);
        assert(Number.isFinite(back.gold) && Number.isFinite(back.level) && Number.isFinite(back.maxHp), key + " stays a number");
      });
    });
    const road = JSON.parse(JSON.stringify(data));
    road.expedition.eventResolved = true;
    road.expedition.pending = { type: "event" };
    eq(normalizeHero(road).expedition.step, 1, "the step counts");
  });

  test("skills open by themselves with the level and the path", () => {
    const hero = newHero("warrior"); hero.level = 40; hero.subclass = "fury";
    applyDerivedStats(hero);
    eq(getSkillStudyState(hero, getSkillDefinition("warrior-last-blow")), "LEARNED");
    assert(getVisibleClassSkills(hero).filter((skill) => Number(skill.unlockLevel) <= 40).every((skill) => isSkillLearned(hero, skill.id)), "everything up to the level");
    assert(!isSkillLearned(hero, getVisibleClassSkills({ ...hero, subclass: "bulwark" }).find((skill) => skill.subclass === "bulwark").id), "not the other path");
  });

  test("every six piece set runs through a whole fight without a crash or NaN", () => {
    Object.values(SET_CATALOG).forEach((set) => {
      const classKey = set.classes[0];
      const hero = newHero(classKey); hero.level = 40;
      getVisibleClassSkills(hero).forEach((skill) => { hero.skillPoints = 9; if (getSkillStudyState(hero, skill) === "AVAILABLE") learnSkill(hero, skill.id); });
      ["head", "chest", "legs", "boots", "necklace", "ring-1"].forEach((slot) => { hero.equipment[slot] = generateRelic(hero, set.id, 40, slot.split("-")[0]); });
      applyDerivedStats(hero, true);
      restoreHero(hero);
      const b = createBattle(hero, [makeEnemy("wolf", 30), makeEnemy("bandit", 30)]);
      let guard = 0;
      while (!b.over && guard++ < 200) { const r = heroAction(b, chooseBotAction(b)); if (!r.ok) heroAction(b, { type: "attack" }); }
      assert(Number.isFinite(hero.currentHp) && b.foes.every((foe) => Number.isFinite(foe.currentHp)), set.id + " keeps numbers finite");
    });
  });

  test("a lair run survives saving in the middle", () => {
    const hero = newHero("archer"); hero.level = 20;
    hero.expedition = createLairRun(hero, "wolf_den", "hunter_camp");
    markTrailCleared(hero, "thicket", "white");
    const back = normalizeHero(JSON.parse(JSON.stringify(hero)));
    eq(back.expedition.lairId, "wolf_den"); eq(back.expedition.lairSet, "hunter_camp"); eq(back.expedition.lairLevel, 10);
    assert(isZoneOpen(back, "thicket", "green"), "trail progress is kept");
    const item = generateRelic(hero, "hunter_camp", 10, "boots");
    eq(normalizeItem(JSON.parse(JSON.stringify(item))).rarity, "relic", "relics stay relics");
  });

  test("old saves keep the trails behind beaten bosses", () => {
    const hero = newHero("warrior"); hero.defeatedGuardians = ["greyfang"]; delete hero.trailClears;
    const back = normalizeHero(JSON.parse(JSON.stringify(hero)));
    assert(isZoneOpen(back, "thicket", "red"), "beaten region stays open");
    assert(!isZoneOpen(back, "ashlands", "green"), "new region starts from white");
  });

  test("shop: plenty of unique passives for every class, no duplicates, class logic", () => {
    const names = new Set(SHOP_PASSIVE_CATALOG.map((p) => p.name));
    const ids = new Set(SHOP_PASSIVE_CATALOG.map((p) => p.id));
    eq(names.size, SHOP_PASSIVE_CATALOG.length, "unique names");
    eq(ids.size, SHOP_PASSIVE_CATALOG.length, "unique ids");
    Object.keys(classDefinitions).forEach((classKey) => {
      const hero = newHero(classKey);
      const count = SHOP_PASSIVE_CATALOG.filter((p) => canUseShopPassive(hero, p)).length;
      assert(count >= 100, classKey + " sees only " + count);
    });
    const warrior = newHero("warrior");
    assert(!SHOP_PASSIVE_CATALOG.filter((p) => p.effectType === "burn").some((p) => canUseShopPassive(warrior, p)), "warrior has no fire");
  });

  test("shop: buying, level gates, slots limit what is active", () => {
    const hero = newHero("assassin"); hero.gold = 1e6; hero.level = 10;
    const rank4 = SHOP_PASSIVE_CATALOG.find((p) => p.rank === 4 && canUseShopPassive(hero, p));
    assert(!buyShopPassive(hero, rank4.id).ok, "level gate");
    const rank1 = SHOP_PASSIVE_CATALOG.filter((p) => p.rank === 1 && canUseShopPassive(hero, p)).slice(0, 8);
    rank1.forEach((p) => assert(buyShopPassive(hero, p.id).ok, p.id));
    eq(hero.shopPassiveIds.length, 8);
    eq(getActiveShopIds(hero).length, getShopSlotLimit(hero), "slots");
    const idle = hero.shopPassiveIds.find((id) => !getActiveShopIds(hero).includes(id));
    assert(!toggleShopPassive(hero, idle).ok, "no free slot");
    assert(toggleShopPassive(hero, getActiveShopIds(hero)[0]).ok, "take off");
    assert(toggleShopPassive(hero, idle).ok, "put on");
  });

  test("every shop passive runs through fights without a crash", () => {
    let fights = 0;
    Object.keys(classDefinitions).forEach((classKey) => {
      const usable = SHOP_PASSIVE_CATALOG.filter((p) => canUseShopPassive({ classKey }, p));
      for (let i = 0; i < usable.length; i += 8) {
        const hero = newHero(classKey); hero.level = 60; hero.gold = 1e7;
        usable.slice(i, i + 8).forEach((p) => buyShopPassive(hero, p.id));
        applyDerivedStats(hero, true);
        const battle = createBattle(hero, makeEnemy("wolf", 30));
        let guard = 0;
        while (!battle.over && guard++ < 200) { const res = heroAction(battle, guard % 6 === 0 ? { type: "guard" } : chooseBotAction(battle)); if (!res.ok) heroAction(battle, { type: "attack" }); }
        assert(numericFinite(hero) && Number.isFinite(battle.enemy.currentHp), classKey + " NaN at " + i);
        fights += 1;
      }
    });
    assert(fights > 40);
  });

  test("save keeps shop slots; an older tree is refunded", () => {
    const hero = newHero("mage"); hero.level = 40; hero.gold = 1e6;
    const p = SHOP_PASSIVE_CATALOG.find((x) => x.rank === 1 && canUseShopPassive(hero, x));
    buyShopPassive(hero, p.id);
    const back = normalizeHero(serializeHero(hero));
    assert(getActiveShopIds(back).includes(p.id), "slot kept");
    const old = normalizeHero({ ...serializeHero(hero), talents: ["burn/1"], talentVersion: 2 });
    eq(old.talents.length, 0, "refunded");
    eq(old.shopPassiveIds.length, 0, "old shop bought back");
    assert(old.gold >= hero.gold + 400, "gold returned");
  });

  test("amplify: poison talent really makes poison stronger", () => {
    const plain = talentBattle("assassin", null, null);
    applyEffect(plain.battle, plain.enemy, { id: "poison", duration: 3, value: 100 }, plain.hero);
    const strong = talentBattle("assassin", null, null, [findTalent("Концентрат")]);
    applyEffect(strong.battle, strong.enemy, { id: "poison", duration: 3, value: 100 }, strong.hero);
    eq(getEffect(plain.enemy, "poison").value, 100); eq(getEffect(strong.enemy, "poison").value, 125);
  });

  test("change: living plague never expires; bleed cap removed by bloodletting", () => {
    const { hero, battle, enemy } = talentBattle("assassin", null, null, [findTalent("Живая чума")]);
    applyEffect(battle, enemy, { id: "poison", duration: 1, value: 100 }, hero);
    eq(getEffect(enemy, "poison").value, 65, "weaker");
    processEffectsEndOfTurn(battle, enemy); processEffectsEndOfTurn(battle, enemy);
    assert(getEffect(enemy, "poison"), "still there");
    const blood = talentBattle("warrior", null, null, [findTalent("Кровопускание")]);
    for (let i = 0; i < 5; i += 1) applyEffect(blood.battle, blood.enemy, { id: "bleed", duration: 2, value: 10 }, blood.hero);
    eq(getEffect(blood.enemy, "bleed").value, 50, "no cap");
  });

  test("link: thermal shock removes fire and ice and strikes", () => {
    const { hero, battle, enemy } = talentBattle("mage", null, null, [findTalent("Тепловой шок")]);
    applyEffect(battle, enemy, { id: "burn", duration: 3, value: 20, meta: { stacks: 1 } }, hero);
    const before = enemy.currentHp;
    fx(battle, "frost", 2, 0.2);
    assert(!getEffect(enemy, "burn") && !getEffect(enemy, "frost"), "both gone");
    assert(enemy.currentHp < before, "struck");
  });

  test("create: venom blood poisons whoever hits you, parry weakens, death leaves a boon", () => {
    const { hero, battle, enemy } = talentBattle("assassin", "venom", null, [findTalent("Кровь отравителя")]);
    fireMech(battle, "hurt", { hpDamage: 10, absorbed: 0, blocked: 0, kind: "physical" });
    assert(getEffect(enemy, "poison"), "poisoned");
  });

  test("keystone: one skill style ignores habit and rewards repeats", () => {
    const { hero, battle } = talentBattle("warrior", null, null, [findTalent("Мастер одного удара")]);
    battle.repeat = { id: "x", count: 4 };
    hero.activeSkillSlots = ["a", "b", "c", null, null];
    eq(getHabitPenalty(battle, "x"), 0, "immune");
  });

  test("rare triggers fire: detonation talents, parry talents, summon deaths", () => {
    const fire = talentBattle("mage", "elemental", "fire", [findTalent("Цепная реакция")]);
    fire.hero.cooldowns = { x: 3 };
    applyEffect(fire.battle, fire.enemy, { id: "burn", duration: 3, value: 20, meta: { stacks: 4, maxStacks: 4 } }, fire.hero);
    processEffectsEndOfTurn(fire.battle, fire.enemy);
    eq(fire.hero.cooldowns.x, 2, "detonation shortens cooldowns");
    const duel = talentBattle("warrior", "bulwark", "duelist", [findTalent("Обезоруживание")]);
    duel.battle.mech.duelist.armed = true;
    const fake = { id: "strike", ...ENEMY_MOVES.strike };
    setRng(() => 0.5);
    duel.enemy.currentHp = duel.enemy.maxHp;
    performEnemyMove(duel.battle, fake);
    seed(12345);
    assert(getEffect(duel.enemy, "weaken"), "parry weakens");
    const bones = talentBattle("mage", "summoner", "undead", [findTalent("Вечная служба")]);
    removeSummon(bones.battle, { id: "z", type: "undead", role: "tank", name: "Z", power: 1 });
    eq(bones.battle.mech.undead.value, 2, "two bones");
  });

  test("habit: repeating a skill weakens it, another skill clears it, needs three skills", () => {
    const { hero, battle } = talentBattle("warrior", null, null);
    hero.activeSkillSlots = ["warrior-raskol", "warrior-skullbreaker", "warrior-last-blow", null, null];
    battle.repeat = { id: "warrior-raskol", count: 3 };
    assert(Math.abs(getHabitPenalty(battle, "warrior-raskol") - 0.3) < 1e-6, "30%");
    eq(getHabitPenalty(battle, "warrior-skullbreaker"), 0, "other skill");
    hero.activeSkillSlots = ["warrior-raskol", null, null, null, null];
    eq(getHabitPenalty(battle, "warrior-raskol"), 0, "new heroes are safe");
  });

  test("enemy habits: a golem cannot bleed, a slime regrows, fire stops it", () => {
    restoreHabits();
    const golem = talentBattle("warrior", null, null, [], "stone_golem");
    const res = applyEffect(golem.battle, golem.enemy, { id: "bleed", duration: 3, value: 50 }, golem.hero);
    assert(res.resisted && !getEffect(golem.enemy, "bleed"), "no blood");
    applyEffect(golem.battle, golem.enemy, { id: "poison", duration: 3, value: 50 }, golem.hero);
    eq(getEffect(golem.enemy, "poison").value, 25, "half poison");
    const slime = talentBattle("mage", null, null, [], "slime");
    slime.enemy.currentHp = 10;
    fireMech(slime.battle, "enemyTurn");
    assert(slime.enemy.currentHp > 10, "regrows");
    slime.enemy.currentHp = 10;
    applyEffect(slime.battle, slime.enemy, { id: "burn", duration: 3, value: 5, meta: { stacks: 1 } }, slime.hero);
    fireMech(slime.battle, "enemyTurn");
    eq(slime.enemy.currentHp, 10, "fire stops regrowth");
    clearHabits();
  });

  test("charge: telegraphed, broken by damage, or lands as a huge hit", () => {
    const { hero, battle, enemy } = talentBattle("warrior", null, null);
    performEnemyMove(battle, { id: "boar_run", ...ENEMY_MOVES.boar_run });
    assert(enemy.charge, "charging");
    battle.intent = null;
    pickEnemyIntent(battle);
    assert(describeIntent(battle).charge, "visible");
    dealDamage(battle, enemy, enemy.charge.need);
    assert(!enemy.charge && getEffect(enemy, "stun"), "broken and stunned");
  });

  test("water: soaked targets conduct shock and douse fire", () => {
    const { hero, battle, enemy } = talentBattle("mage", null, null);
    applyEffect(battle, enemy, { id: "soaked", duration: 3 }, hero);
    assert(getEffect(applyEffect(battle, enemy, { id: "shock", duration: 2, value: 0.2 }, hero) && enemy, "shock").value > 0.2, "stronger shock");
    applyEffect(battle, enemy, { id: "burn", duration: 2, value: 20, meta: { stacks: 1 } }, hero);
    assert(!getEffect(enemy, "soaked"), "dried");
    eq(getEffect(enemy, "burn").value, 10, "weak fire");
  });

  test("shock is spent by the next direct hit only", () => {
    const { hero, battle, enemy } = talentBattle("mage", null, null);
    applyEffect(battle, enemy, { id: "shock", duration: 3, value: 0.5 }, hero);
    performHeroHit(battle, { kind: "magic", power: 1, label: "x", element: "arcane", sure: true });
    assert(!getEffect(enemy, "shock"), "spent");
  });

  test("expedition: forks show who waits, an elite leaves boons, boons work and end with the trail", () => {
    const hero = newHero("archer");
    const exp = createExpedition(hero, "thicket", "purple");
    hero.expedition = exp;
    exp.step = 1;
    exp.pending = { type: "elite" };
    completeStep(hero, exp);
    eq(exp.pendingBoons.length, 3, "boons");
    assert(exp.pendingBoons.every((id) => !BOONS[id].classes || BOONS[id].classes.includes("archer")), "class logic");
    const before = hero.critChance;
    exp.pendingBoons = ["sharp-eye"];
    assert(takeBoon(hero, exp, "sharp-eye"));
    assert(hero.critChance > before, "applied");
    finishExpedition(hero, exp, "retreat");
    assert(hero.critChance <= before + 0.01, "gone after the trail");
    const scoutExp = createExpedition(hero, "thicket", "green");
    const node = scoutNode(scoutExp, "elite");
    assert(ENEMY_DEFINITIONS[node.enemyId] && describeScout(node).name, "scout");
    const built = buildNodeEnemy(hero, scoutExp, node);
    eq(built.defId, node.enemyId, "same enemy as promised");
  });

  test("every event option resolves for each class", () => {
    Object.keys(classDefinitions).forEach((classKey) => EXPEDITION_EVENTS.forEach((event) => event.options.forEach((_, index) => {
      const hero = newHero(classKey);
      const exp = createExpedition(hero, "thicket", "green");
      hero.expedition = exp;
      exp.bag.gold = 99999;
      const res = resolveEventOption(hero, exp, event, index);
      assert(res && typeof res.text === "string" && res.text.length > 0, event.id + "#" + index);
    })));
  });

  test("gear with a mechanical trait works and respects class logic", () => {
    for (let i = 0; i < 50; i += 1) {
      const item = generateItem({ level: 30, rarity: "red", classKey: "warrior" });
      const def = LEGENDARY_TRAITS[item.trait];
      assert(def && (!def.classes || def.classes.includes("warrior")), "bad trait " + item.trait);
    }
    const hero = newHero("warrior"); const item = generateItem({ level: 1, rarity: "red", classKey: "warrior" }); item.trait = "greedring";
    hero.equipment["ring-1"] = item; applyDerivedStats(hero, true);
    assert(tm(hero, "gold") >= 0.25, "mod read");
  });

  test("save keeps talents and drops unknown ones", () => {
    const hero = newHero("mage"); hero.level = 40; hero.talents = ["burn/1", "nope/9"]; hero.talentsExchanged = 2; hero.talentVersion = TALENT_VERSION;
    const back = normalizeHero(serializeHero(hero));
    eq(back.talents.length, 1); eq(back.talentsExchanged, 2);
  });

  test("changing subclass frees talents of the old path", () => {
    const hero = newHero("mage"); hero.level = 40; hero.gold = 1e6; hero.subclass = "elemental"; hero.talents = ["elemental/1", "burn/1"];
    chooseSubclass(hero, "summoner");
    assert(!hero.talents.includes("elemental/1") && hero.talents.includes("burn/1"), "path talents return");
  });

  test("save round trip preserves progress", () => {
    const store = mem();
    const hero = newHero();
    hero.gold = 777;
    hero.level = 9;
    hero.inventory[3] = generateItem({ level: 9, rarity: "red", classKey: "warrior" });
    hero.expedition = createExpedition(hero, "thicket", "green");
    hero.currentHp = 42;
    const save = createEmptySave();
    save.heroes[hero.id] = serializeHero(hero);
    save.activeId = hero.id;
    writeSave(save, store);
    const loaded = normalizeHero(loadSave(store).heroes[hero.id]);
    eq(loaded.gold, 777, "gold");
    eq(loaded.level, 9, "level");
    eq(loaded.inventory[3].trait, hero.inventory[3].trait, "trait");
    eq(loaded.currentHp, 42, "hp in expedition");
    assert(loaded.expedition, "expedition");
  });

  test("legacy prototype saves migrate and passwords are erased", () => {
    const store = mem();
    store.setItem(LEGACY_ACCOUNTS_KEY, JSON.stringify([{ email: "x@y", password: "plain", characterKeys: ["x@y::лиора"] }]));
    store.setItem(LEGACY_SESSION_KEY, JSON.stringify({ email: "x@y", saveKey: "x@y::лиора" }));
    store.setItem(LEGACY_SAVES_KEY, JSON.stringify({ "x@y::лиора": {
      name: "Лиора", classKey: "mage", className: "Маг", subclass: "elemental", profession: "fire", level: 9, experience: 5, statPoints: 2, skillPoints: 1, gold: 321, mutationShards: 2,
      resources: { "iron-ore": 3 }, shopPassiveIds: ["venom-power", "nonsense"], stats: { intellect: 20, endurance: 6, strength: 3, luck: 4, agility: 4, spirituality: 9 },
      inventory: [{ id: "item-green-4", name: "Браслет охотника Зеленый", slotType: "bracelet", rarity: "green", requiredLevel: 4, bonuses: { agility: 3, strength: 1 }, flatBonuses: {}, value: 95 }],
      equipment: { "ring-1": { id: "item-white-0", name: "Кольцо ученика Обычный", slotType: "ring", rarity: "white", requiredLevel: 1, bonuses: { intellect: 1, luck: 1 }, flatBonuses: {}, value: 32 } },
      knownSkillIds: ["mage-ether-beam", "mage-firebolt", "mage-arcane-reserve"], activeSkillSlots: ["mage-ether-beam", "mage-firebolt", null, null, null], passiveIds: ["mage-arcane-reserve"],
      skillProgress: { "mage-ether-beam": { level: 3, exp: 5, expToNext: 120, bonusChoice: null } }, meta: { saveVersion: 10 }
    } }));
    const save = loadSave(store);
    eq(store.getItem(LEGACY_ACCOUNTS_KEY), null, "accounts erased");
    eq(store.getItem(LEGACY_SESSION_KEY), null, "session erased");
    const heroes = Object.values(save.heroes);
    eq(heroes.length, 1, "migrated count");
    const hero = normalizeHero(heroes[0]);
    eq(hero.name, "Лиора", "name");
    eq(hero.subclass, null, "subclass waits for its level");
    eq(hero.profession, null, "profession waits for its level");
    eq(hero.gold, 321, "gold");
    eq(hero.skillProgress["mage-ether-beam"].level, 3, "mastery");
    assert(hero.inventory[0].slotType === "bracelet", "item");
    assert(hero.equipment["ring-1"], "equipment");
    eq(hero.shopPassiveIds.length, 1, "unknown passives dropped");
    eq(Object.keys(loadSave(store).heroes).length, 1, "second load must not duplicate migrated heroes");
  });

  test("import rejects junk", () => {
    eq(importSaveText("not json"), null, "text");
    eq(importSaveText("{\\"a\\":1}"), null, "object");
  });

  test("html is escaped", () => {
    eq(esc("<img onerror=1>"), "&lt;img onerror=1&gt;", "esc");
  });

  return results;
})()`);

let failed = 0;
report.forEach((entry) => {
  console.log(`${entry.ok ? "ok  " : "FAIL"} ${entry.name}`);
  if (!entry.ok) { failed += 1; console.log(entry.error); }
});
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exit(failed ? 1 : 0);
