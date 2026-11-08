// Scenario audit of the core: random fights, whole careers, broken saves, random build orders, and a check of all data.
// Usage: node tools/audit-core.js [rounds=1]. Prints each distinct problem once, with how often it was seen.
const { loadCore } = require("./load-core");
const run = loadCore();
const rounds = Number(process.argv[2] || 1);

const report = run(`(function () {
  const problems = new Map();
  const note = (kind, text, where = "") => {
    const key = kind + " :: " + String(text).replace(/[0-9]+/g, "#").slice(0, 170);
    const entry = problems.get(key) || { kind, text: String(text).slice(0, 300), where, count: 0 };
    entry.count += 1;
    problems.set(key, entry);
  };
  const guard = (kind, where, fn) => {
    try { return fn(); } catch (error) {
      const at = String(error.stack || "").split("\\n").slice(1, 4).map((line) => line.trim().replace(/.*[\\\\/]js[\\\\/]core[\\\\/]/, "")).join(" < ");
      note(kind, String(error.message) + " @ " + at, where);
      return undefined;
    }
  };
  const num = (value) => typeof value === "number" && Number.isFinite(value);
  const BAD_TEXT = /undefined|\\bNaN\\b|\\bnull\\b|\\[object|Infinity|function\\s*\\(/;
  const KNOWN_EVENTS = new Set(["log","turn","intent","retarget","foeJoin","action","hit","miss","heal","mana","effect","tick","detonate","proc","mech","summonHurt","interrupt","stunned","summon","summonHit","phase","skillLevel","death","end","ult","stage","shieldBreak","ultimate","start","summonGone"]);
  const seenEvents = {};
  const classes = Object.keys(classDefinitions);
  const PLAN = { warrior:["strength","endurance"], mage:["intellect","endurance"], archer:["agility","strength"], bard:["intellect","spirituality"], assassin:["strength","agility"] };

  function makeHero(classKey, level, opts = {}) {
    const hero = createHero({ name: "Аудит", classKey });
    for (let i = 1; i < level; i += 1) awardExperience(hero, getExperienceForNextLevel(hero.level));
    const keys = PLAN[classKey];
    let g = 0;
    while (hero.statPoints > 0 && g++ < 900) addStatPoint(hero, randomFrom(keys), 1);
    const cat = getBranchCatalog(classKey);
    const prof = randomFrom(Object.values(cat.professions));
    if (level >= SUBCLASS_UNLOCK_LEVEL) chooseSubclass(hero, prof.subclassId);
    if (level >= PROFESSION_UNLOCK_LEVEL) chooseProfession(hero, prof.id);
    Object.keys(hero.equipment).forEach((slot) => {
      if (roll(opts.naked ? 0 : 0.8)) {
        const type = slot.split("-")[0];
        hero.equipment[slot] = generateItem({ level, rarity: randomFrom(RARITY_KEYS), classKey, slotType: type, offhand: type === "weapon" ? slot === "weapon-2" : null });
      }
    });
    autoBuild(hero, { formIndex: randomInt(0, 1), styleIndex: randomInt(0, 2), ultIndex: randomInt(0, 1), laneIndex: randomInt(0, 2) });
    applyDerivedStats(hero, true);
    hero.potions = { hp: 3, mp: 3 };
    return hero;
  }

  function scanEvents(battle, where) {
    const list = battle.events || battle.queue || [];
    list.forEach((event) => {
      seenEvents[event.type] = (seenEvents[event.type] || 0) + 1;
      if (!KNOWN_EVENTS.has(event.type)) note("event-unknown", event.type, where);
      Object.entries(event).forEach(([key, value]) => {
        if (typeof value === "number" && !Number.isFinite(value)) note("event-number", event.type + "." + key + "=" + value, where);
        if (typeof value === "string" && BAD_TEXT.test(value)) note("event-text", event.type + "." + key + ": " + value, where);
      });
    });
    if (list.length) list.length = 0;
  }

  function checkUnit(unit, label, where) {
    if (!unit) return;
    ["currentHp", "maxHp"].forEach((key) => { if (!num(unit[key])) note("unit-number", label + "." + key + "=" + unit[key], where); });
    if (unit.currentHp < 0) note("unit-range", label + " hp below zero", where);
    if (unit.currentHp > unit.maxHp + 0.5) note("unit-range", label + " hp above max", where);
    (unit.effects || []).forEach((effect) => {
      if (!effect || !effect.id) { note("effect", label + " has an effect with no id", where); return; }
      if (!STATUS_EFFECT_DEFINITIONS[effect.id]) note("effect", label + " effect without a definition: " + effect.id, where);
      ["duration", "value", "stacks"].forEach((key) => { if (effect[key] !== undefined && !num(effect[key])) note("effect", effect.id + "." + key + "=" + effect[key], where); });
      if (num(effect.duration) && effect.duration > 200) note("effect", effect.id + " endless duration " + effect.duration, where);
    });
  }

  function checkBattle(battle, where) {
    const hero = battle.hero;
    checkUnit(hero, "hero", where);
    if (!num(hero.currentMana)) note("unit-number", "hero mana=" + hero.currentMana, where);
    if (hero.currentMana < 0) note("unit-range", "mana below zero", where);
    if (hero.currentMana > hero.maxMana + 0.5) note("unit-range", "mana above max", where);
    Object.entries(hero.cooldowns || {}).forEach(([id, value]) => { if (!num(value) || value < 0) note("cooldown", id + "=" + value, where); });
    battle.foes.forEach((foe, i) => checkUnit(foe, "foe:" + foe.defId, where));
    (hero.summonedUnits || []).forEach((s) => { if (!num(s.hp) || !num(s.power) || !num(s.duration)) note("unit-number", "summon " + s.name + " hp=" + s.hp + " power=" + s.power + " duration=" + s.duration, where); });
    Object.values(hero.potions || {}).forEach((v) => { if (v < 0) note("unit-range", "potions below zero", where); });
    guard("crash-snapshot", where, () => snapshotBattle(battle));
    guard("crash-timeline", where, () => previewTimeline(battle, 8));
    guard("crash-gauges", where, () => getMechGauges(battle));
    guard("crash-intent", where, () => battle.foes.forEach((foe) => { if (foe.currentHp > 0) { const text = describeIntentFor(battle, foe); if (BAD_TEXT.test(JSON.stringify(text || ""))) note("event-text", "intent: " + JSON.stringify(text), where); } }));
    for (let i = 0; i < 5; i += 1) guard("crash-canuse", where, () => canUseSkill(battle, i));
    guard("crash-canuse", where, () => canUseUltimate(battle));
    guard("crash-wait", where, () => getWaitLabel(battle));
    (battle.log || []).slice(-5).forEach((line) => { const text = typeof line === "string" ? line : line?.text; if (text && BAD_TEXT.test(text)) note("log-text", text, where); });
  }

  const statKeys = ["maxHp", "maxMana", "physicalDamage", "skillDamage", "defense", "magicDefense", "speed", "critChance", "critDamage"];
  const statsOf = (hero) => Object.fromEntries(statKeys.map((key) => [key, hero[key]]));

  // Any move a player could press, including ones the buttons would not offer.
  function randomAction(battle, wild) {
    const r = rand();
    const target = roll(0.3) ? randomInt(-1, 5) : undefined;
    if (r < 0.45) return { type: "skill", slotIndex: randomInt(0, 4), target };
    if (r < 0.65) return { type: "attack", target };
    if (r < 0.72) return { type: "guard" };
    if (r < 0.8) return { type: "ult" };
    if (r < 0.87) return { type: "wait" };
    if (r < 0.94) return { type: "potion", kind: randomFrom(["hp", "mp"]) };
    if (!wild) return { type: "attack" };
    return randomFrom([{ type: "nonsense" }, { type: "skill", slotIndex: 99 }, { type: "skill", slotIndex: -1 }, { type: "skill" }, { type: "potion", kind: "beer" }, { type: "attack", target: "x" }, { type: "attack", target: 99 }]);
  }

  function playBattle(battle, where, wild = true) {
    let steps = 0;
    let stuck = 0;
    while (!battle.over && steps++ < 900) {
      const action = randomAction(battle, wild);
      const before = battle.awaiting;
      const result = guard("crash-action", where + " action=" + JSON.stringify(action), () => heroAction(battle, action));
      if (result === undefined) return false;
      scanEvents(battle, where + " action=" + JSON.stringify(action));
      checkBattle(battle, where);
      if (!result.ok) {
        stuck += 1;
        if (result.reason && BAD_TEXT.test(result.reason)) note("reason-text", result.reason, where);
        if (stuck > 40 && !battle.over) {
          const attack = guard("crash-action", where, () => heroAction(battle, { type: "attack" }));
          if (!attack?.ok) { const g = guard("crash-action", where, () => heroAction(battle, { type: "guard" })); if (!g?.ok) { note("softlock", "no move is possible: attack says " + attack?.reason + "; awaiting=" + before, where); return false; } }
          stuck = 0;
        }
      } else stuck = 0;
    }
    if (!battle.over) note("endless", "battle not over after 900 moves", where);
    const again = guard("crash-after-end", where, () => heroAction(battle, { type: "attack" }));
    if (again?.ok) note("after-end", "action accepted after the battle ended", where);
    return true;
  }

  function battleFuzz(perCell) {
    classes.forEach((classKey) => {
      [1, 4, 8, 12, 16, 22, 30, 38, 46, 60, 68, 76, 90].forEach((level) => {
        for (let i = 0; i < perCell; i += 1) {
          const where = classKey + " L" + level;
          const hero = guard("crash-build", where, () => makeHero(classKey, level, { naked: i % 4 === 0 }));
          if (!hero) continue;
          const region = randomFrom(REGIONS);
          const size = randomInt(1, 3);
          const pack = Array.from({ length: size }, () => {
            const id = randomFrom(region.enemies);
            return roll(0.3) ? makeEnemy(id, level, { affix: randomFrom(ELITE_AFFIXES) }) : roll(0.2) ? makeEnemy(id, level, { boss: true }) : makeEnemy(id, level);
          });
          const base = statsOf(hero);
          const battle = guard("crash-create", where, () => createBattle(hero, pack));
          if (!battle) continue;
          scanEvents(battle, where);
          playBattle(battle, where + " vs " + pack.map((f) => f.defId).join("+"));
          guard("crash-clear", where, () => { clearBattleState(hero); applyDerivedStats(hero, false); });
          const after = statsOf(hero);
          statKeys.forEach((key) => { if (num(base[key]) && Math.abs(base[key] - after[key]) > 0.51) note("stat-leak", key + " changed after a battle: " + base[key] + " -> " + after[key], where); });
          if ((hero.effects || []).length) note("state-leak", "effects after clearBattleState", where);
          if ((hero.summonedUnits || []).length) note("state-leak", "summons after clearBattleState", where);
        }
      });
    });
  }

  function everySkillRuns() {
    classes.forEach((classKey) => {
      const tree = SKILL_TREES[classKey];
      tree.stages.forEach((stage) => stage.tiers.forEach((tier) => tier.options.forEach((id) => {
        [1, 3].forEach((count) => {
          const where = id + " vs" + count;
          const hero = createHero({ name: "Т", classKey });
          hero.freeSkills = true;
          const level = Math.max(tier.level, 10);
          for (let i = 1; i < level; i += 1) awardExperience(hero, getExperienceForNextLevel(hero.level));
          if (stage.owner && stage.owner !== classKey) {
            const cat = getBranchCatalog(classKey);
            const prof = Object.values(cat.professions).find((p) => p.id === stage.owner || p.subclassId === stage.owner);
            if (prof) { chooseSubclass(hero, prof.subclassId); if (prof.id === stage.owner) chooseProfession(hero, prof.id); }
          }
          applyDerivedStats(hero, true);
          syncKnownSkills(hero);
          const skill = getSkillDefinition(id);
          if (!skill) { note("data", "no skill " + id); return; }
          const text = guard("crash-describe", where, () => describeSkillDetails(skill, hero));
          if (text && BAD_TEXT.test(JSON.stringify(text))) note("skill-text", id + ": " + JSON.stringify(text), where);
          if (BAD_TEXT.test(String(skill.description))) note("skill-text", id + ": " + skill.description, where);
          hero.activeSkillSlots = [id, null, null, null, null];
          const pack = Array.from({ length: count }, () => makeEnemy(randomFrom(REGIONS[0].enemies), level));
          const battle = guard("crash-create", where, () => createBattle(hero, pack));
          if (!battle) return;
          scanEvents(battle, where);
          hero.currentMana = hero.maxMana;
          // Prepare what skills may wait for, then press it a few times.
          let usedOk = 0;
          for (let i = 0; i < 12 && !battle.over; i += 1) {
            const check = guard("crash-canuse", where, () => canUseSkill(battle, 0));
            if (check?.ok) {
              const r = guard("crash-action", where, () => heroAction(battle, { type: "skill", slotIndex: 0, target: 0 }));
              if (r === undefined) return;
              if (r.ok) usedOk += 1;
              hero.cooldowns = {};
            } else {
              guard("crash-action", where, () => heroAction(battle, { type: "attack" }));
            }
            scanEvents(battle, where);
            checkBattle(battle, where);
            hero.currentMana = hero.maxMana;
            hero.currentHp = hero.maxHp;
          }
        });
      })));
    });
  }

  function checkHero(hero, where) {
    ["level", "experience", "gold", "statPoints", "skillPoints", "mutationShards"].forEach((key) => { if (!num(hero[key]) || hero[key] < 0) note("hero-number", key + "=" + hero[key], where); });
    if (hero.inventory.length !== INVENTORY_SIZE) note("hero-shape", "inventory length " + hero.inventory.length, where);
    const ids = new Map();
    [...hero.inventory, ...Object.values(hero.equipment), ...(hero.expedition?.bag?.items || [])].forEach((item) => {
      if (!item) return;
      if (item.id && ids.has(item.id)) note("dup-item", "the same item is in two places", where);
      if (item.id) ids.set(item.id, true);
      if (!num(item.itemLevel) || item.itemLevel < 1) note("item", "level=" + item.itemLevel, where);
      if (BAD_TEXT.test(String(getItemDisplayName(item)))) note("item-text", getItemDisplayName(item), where);
      const lines = guard("crash-item", where, () => describeItemBonuses(item));
      if (lines && BAD_TEXT.test(JSON.stringify(lines))) note("item-text", JSON.stringify(lines), where);
    });
    Object.entries(hero.equipment).forEach(([slot, item]) => {
      if (!item) return;
      if (!fitsClass(item, hero.classKey)) note("foreign-gear", item.weapon + " " + item.slotType + " on " + hero.classKey + " via " + where, where);
      if (!getSlotKeysForItem(item, hero.classKey).includes(slot)) note("gear-slot", (item.weapon || item.slotType) + " in " + slot + " on " + hero.classKey, where);
    });
    hero.activeSkillSlots.forEach((id) => {
      if (!id) return;
      if (!hero.knownSkillIds.includes(id)) note("slot", "slot holds a skill that is not known " + id, where);
      if (getSkillDefinition(id)?.category !== "active") note("slot", "slot holds a non active " + id, where);
    });
    const slots = hero.activeSkillSlots.filter(Boolean);
    if (new Set(slots).size !== slots.length) note("slot", "one skill in two slots", where);
    if (getTalentBoard(hero).length && getDevPointsFree(hero) < 0) note("points", "development points below zero: " + getDevPointsFree(hero), where);
    getPickedTreeSkills(hero).forEach((pick) => { const id = pick?.id || pick; if (!hero.knownSkillIds.includes(id)) note("picks", "picked but not known " + id, where); });
    guard("crash-power", where, () => getHeroPowerRating(hero));
    guard("crash-story", where, () => { getStoryProgress(hero); syncStoryEvents(hero); });
    if (hero.expedition && !hero.expedition.choices?.length && hero.expedition.step < hero.expedition.steps) note("expedition", "no road to take on step " + hero.expedition.step, where);
  }

  const roundTrip = (hero) => normalizeHero(JSON.parse(JSON.stringify(serializeHero(hero))));

  function shopping(hero, where) {
    guard("crash-town", where + " stock", () => { if (!hero.shop) refreshShopStock(hero); });
    const moves = [
      () => equipBestGear(hero),
      () => buyPotion(hero, randomFrom(["hp", "mp", "x"])),
      () => buyShopItem(hero, randomInt(-1, 12)),
      () => sellInventoryItem(hero, randomInt(-1, INVENTORY_SIZE + 2)),
      () => dismantleInventoryItem(hero, randomInt(-1, INVENTORY_SIZE + 2)),
      () => { const idx = randomInt(0, INVENTORY_SIZE - 1); if (hero.inventory[idx]) equipFromInventory(hero, idx, roll(0.5) ? randomFrom(Object.keys(hero.equipment)) : null); },
      () => unequipToInventory(hero, randomFrom(Object.keys(hero.equipment))),
      () => { const item = randomFrom(Object.values(hero.equipment).filter(Boolean)); if (item) enhanceItem(hero, item); },
      () => { const item = randomFrom(Object.values(hero.equipment).filter(Boolean)); if (item) reforgeItem(hero, item); },
      () => { const item = randomFrom(Object.values(hero.equipment).filter(Boolean)); if (item?.setId) { getRelicAscension(hero, item); ascendRelic(hero, item); } },
      () => sellInventoryItems(hero, bagFilterIndices(hero, randomFrom(["junk", "weak", "white", "all", "nope"]))),
      () => dismantleInventoryItems(hero, [0, 0, 1, 99, -1, "x"]),
      () => sellInventoryItems(hero, [0, 0, 0]),
      () => sellRarityBelow(hero, randomInt(0, 3)),
      () => { const lair = randomFrom(Object.values(LAIR_CATALOG)); exchangeLairTokens(hero, lair.id, randomFrom(lair.sets), randomFrom(["weapon", "head", "chest", "x"])); },
      () => { const p = randomFrom(SHOP_PASSIVE_CATALOG); buyShopPassive(hero, p.id); toggleShopPassive(hero, p.id); },
      () => buyResource(hero, randomFrom(Object.keys(hero.resources))),
      () => { const id = randomFrom(hero.activeSkillSlots.filter(Boolean)); if (id) mutateSkill(hero, id, randomFrom(Object.keys(MUTATIONS))); },
      () => { const pending = getPendingMasterySkills(hero); if (pending[0]) chooseSkillBonus(hero, pending[0], getSkillMasteryChoices(getSkillDefinition(pending[0]))[0].id); },
      () => autoSpendTalents(hero)
    ];
    for (let i = 0; i < 6; i += 1) {
      const index = randomInt(0, moves.length - 1);
      const goldBefore = hero.gold;
      const result = guard("crash-town", where + " move#" + index + " " + String(moves[index]).slice(0, 60), moves[index]);
      if (result && result.ok === false && hero.gold !== goldBefore) note("refused-but-paid", "move#" + index + " " + String(moves[index]).slice(0, 80), where);
      if (!num(hero.gold) || hero.gold < 0) note("hero-number", "gold=" + hero.gold + " after move#" + index, where);
    }
  }

  function buildMess(hero, where) {
    const stages = getTreeStages(hero);
    const moves = [
      () => { const pending = getPendingTreePick(hero); if (pending) chooseTreeSkill(hero, pending.stage, pending.tier, randomFrom(pending.tier.options)); },
      () => { const stage = randomFrom(stages); const tier = randomFrom(stage.tiers); chooseTreeSkill(hero, stage, tier, randomFrom(tier.options)); },
      () => { const forms = getPickedTreeSkills(hero).map((pick) => pick?.id || pick).filter((id) => getSkillForms(id).length); if (forms.length) { const id = randomFrom(forms); chooseSkillForm(hero, id, randomFrom(getSkillForms(id)).id); } },
      () => { const styles = getClassStyles(hero.classKey); if (styles.length) chooseStyle(hero, randomFrom(styles).id); },
      () => { const ults = getAvailableUltimates(hero); if (ults.length) chooseUltimate(hero, randomFrom(ults).id); },
      () => resetBuild(hero),
      () => autoBuild(hero, { laneIndex: randomInt(0, 2), formIndex: randomInt(0, 1), ultIndex: randomInt(0, 1), styleIndex: randomInt(0, 2) }),
      () => assignSkillToSlot(hero, randomFrom(hero.knownSkillIds) || "nope", randomInt(-1, 6)),
      () => clearSkillSlot(hero, randomInt(-1, 6)),
      () => { const cat = getBranchCatalog(hero.classKey); const sub = randomFrom(Object.values(cat.subclasses)); hero.gold += 1e5; chooseSubclass(hero, sub.id); },
      () => { const cat = getBranchCatalog(hero.classKey); const pr = randomFrom(Object.values(cat.professions)); hero.gold += 1e5; chooseProfession(hero, pr.id); }
    ];
    for (let i = 0; i < 6; i += 1) {
      const index = randomInt(0, moves.length - 1);
      guard("crash-build", where + " move#" + index + " " + String(moves[index]).slice(0, 70), moves[index]);
    }
  }

  function storyStep(hero, where) {
    guard("crash-story", where, () => {
      syncStoryEvents(hero);
      let g = 0;
      while (hero.story.queue.length && g++ < 12) {
        const id = hero.story.queue[0];
        const scene = STORY_SCENES[id];
        if (!scene) { note("story", "queue holds unknown scene " + id, where); hero.story.queue.shift(); continue; }
        const lines = getStoryLines(hero, scene.lines || []);
        lines.forEach((line) => { const text = storyText(hero, line.text || ""); if (BAD_TEXT.test(text)) note("story-text", id + ": " + text, where); });
        if (scene.choice) {
          const options = getStoryOptions(hero, scene.choice);
          if (!options.length) { note("story", "choice with no options " + id, where); }
          const open = options.filter((o) => !o.locked && o.available !== false);
          if (options.length && !open.length) note("story", "all options closed in " + id, where);
          chooseStoryOption(hero, id, randomFrom(open.length ? open : options));
        }
        markStorySeen(hero, id);
        if (hero.story.queue[0] === id) { note("story", "scene stays in queue after being seen " + id, where); hero.story.queue.shift(); }
      }
    });
  }

  function career(classKey, trail) {
    const where = "career " + classKey;
    const hero = createHero({ name: "Путь", classKey });
    hero.gold = 300;
    for (let trip = 0; trip < trail; trip += 1) {
      if (hero.statPoints > 0) addStatPoint(hero, randomFrom(PLAN[classKey]), hero.statPoints);
      if (hero.level >= SUBCLASS_UNLOCK_LEVEL && !hero.subclass) chooseSubclass(hero, randomFrom(Object.values(getBranchCatalog(classKey).subclasses)).id);
      if (hero.level >= PROFESSION_UNLOCK_LEVEL && !hero.profession) { const options = Object.values(getBranchCatalog(classKey).professions).filter((p) => p.subclassId === hero.subclass); chooseProfession(hero, randomFrom(options).id); }
      guard("crash-build", where, () => autoBuild(hero, { laneIndex: randomInt(0, 2), ultIndex: randomInt(0, 1), styleIndex: randomInt(0, 2) }));
      shopping(hero, where);
      buildMess(hero, where);
      guard("crash-build", where, () => autoBuild(hero, { laneIndex: randomInt(0, 2), ultIndex: randomInt(0, 1), styleIndex: randomInt(0, 2) }));
      storyStep(hero, where);
      checkHero(hero, where + " town");
      let copy = guard("crash-roundtrip", where + " town", () => roundTrip(hero));
      if (!copy) return;
      if (copy.gold !== hero.gold) note("save", "gold changed on reload", where);
      if (copy.level !== hero.level) note("save", "level changed on reload", where);
      if (JSON.stringify(copy.activeSkillSlots) !== JSON.stringify(hero.activeSkillSlots)) note("save", "skill slots changed on reload: " + JSON.stringify(hero.activeSkillSlots) + " -> " + JSON.stringify(copy.activeSkillSlots), where);
      if (JSON.stringify([...copy.knownSkillIds].sort()) !== JSON.stringify([...hero.knownSkillIds].sort())) note("save", "known skills changed on reload", where);
      if (copy.maxHp !== hero.maxHp) note("save", "maxHp changed on reload " + hero.maxHp + " -> " + copy.maxHp, where);
      const current = copy;
      journey(current, where);
      Object.assign(hero, current);
      checkHero(hero, where + " after trip");
    }
  }

  function journey(hero, where) {
    const kind = rand();
    let exp;
    if (kind < 0.2) {
      const lair = randomFrom(Object.values(LAIR_CATALOG));
      exp = guard("crash-lair", where, () => createLairRun(hero, lair.id, randomFrom(lair.sets), randomFrom(getLairRanks(lair))));
    } else {
      const region = REGIONS[randomInt(0, hero.unlockedRegion)];
      exp = guard("crash-exp", where, () => createExpedition(hero, region.id, randomFrom(ZONE_KEYS)));
    }
    if (!exp) return;
    hero.expedition = exp;
    let g = 0;
    while (hero.expedition && g++ < 40) {
      if (exp.pendingBoons?.length) guard("crash-boon", where, () => takeBoon(hero, exp, randomFrom(exp.pendingBoons).id || randomFrom(exp.pendingBoons)));
      exp.pendingBoons = null;
      const entered = guard("crash-node", where, () => enterNode(hero, exp, randomInt(0, exp.choices.length)));
      if (!entered) { hero.expedition = null; return; }
      let foes = null;
      if (entered.kind === "event") {
        const event = entered.event;
        const index = randomInt(0, event.options.length - 1);
        const text = String(event.text);
        if (BAD_TEXT.test(text)) note("event-node-text", event.id + ": " + text, where);
        const result = guard("crash-event", where + " " + event.id + "#" + index, () => resolveEventOption(hero, exp, event, index));
        if (result?.text && BAD_TEXT.test(result.text)) note("event-node-text", event.id + ": " + result.text, where);
        if (result?.battle) foes = result.battle;
      } else foes = entered.enemy;
      if (foes) {
        const fighter = hero;
        const lucky = roll(0.75);
        if (lucky) { fighter.currentHp = fighter.maxHp; }
        const battle = guard("crash-create", where + " journey", () => createBattle(fighter, foes, { damageBonus: exp.damageBonus }));
        if (!battle) { hero.expedition = null; return; }
        exp.damageBonus = 0;
        if (lucky) { [].concat(foes).forEach((foe) => { foe.currentHp = Math.max(1, Math.round(foe.maxHp * 0.03)); }); }
        scanEvents(battle, where);
        playBattle(battle, where + " journey", false);
        if (battle.over !== "hero") { guard("crash-finish", where + " death", () => finishExpedition(hero, exp, "death")); return; }
        guard("crash-rewards", where, () => {
          const rewards = calculateEncounterRewards(hero, foes, exp.zoneKey, exp.regionId);
          if (!num(rewards.exp) || !num(rewards.gold)) note("reward", "exp=" + rewards.exp + " gold=" + rewards.gold, where);
          [].concat(foes).forEach((foe) => recordKill(hero, foe));
          awardExperience(hero, rewards.exp);
          applyRewardsToBag(hero, exp, rewards);
        });
      }
      const done = guard("crash-step", where, () => completeStep(hero, exp));
      if (roll(0.3)) {
        const copy = guard("crash-roundtrip", where + " on the road", () => roundTrip(hero));
        if (copy) {
          if (copy.gold !== hero.gold) note("save", "gold changed on reload on the road", where);
          if (Math.abs(copy.currentHp - hero.currentHp) > 1) note("save", "hp changed on reload on the road " + hero.currentHp + " -> " + copy.currentHp, where);
          Object.assign(hero, copy);
          exp = hero.expedition;
        }
      }
      checkHero(hero, where + " on the road");
      if (done) { guard("crash-finish", where + " complete", () => finishExpedition(hero, exp, "complete")); return; }
      if (roll(0.05)) { guard("crash-finish", where + " retreat", () => finishExpedition(hero, exp, "retreat")); return; }
    }
    if (hero.expedition) note("expedition", "journey did not end in 40 steps: step " + exp.step + "/" + exp.steps, where);
  }

  // Broken saves: every field in turn gets junk. The game must load, and fights must still work.
  function saveFuzz() {
    const JUNK = [null, undefined, "мусор", -5, NaN, 0, 1e15, [], {}, true, [null], { x: 1 }];
    classes.forEach((classKey) => {
      const base = makeHero(classKey, 35);
      base.inventory[0] = generateItem({ level: 30, rarity: "purple", classKey });
      base.expedition = createExpedition(base, REGIONS[0].id, "green");
      const lairHero = makeHero(classKey, 35);
      const lair = Object.values(LAIR_CATALOG)[0];
      lairHero.expedition = createLairRun(lairHero, lair.id, lair.sets[0]);
      [base, lairHero].forEach((source) => {
        const data = serializeHero(source);
        Object.keys(data).forEach((key) => JUNK.forEach((junk) => {
          const raw = JSON.parse(JSON.stringify(data));
          raw[key] = junk;
          if (key === "classKey") return; // A foreign class on old gear is what this junk means.
          const where = "save field " + key + "=" + JSON.stringify(junk);
          const hero = guard("crash-load", where, () => normalizeHero(raw));
          if (!hero) return;
          const works = guard("crash-after-load", where, () => {
            checkHero(hero, where);
            const battle = createBattle(hero, [makeEnemy(REGIONS[0].enemies[0], hero.level)]);
            heroAction(battle, { type: "attack" });
            snapshotBattle(battle);
            getPendingTreePick(hero);
            getDevPointsFree(hero);
            return true;
          });
          if (works && !num(hero.maxHp)) note("load-number", where + " gives maxHp=" + hero.maxHp, where);
          if (works && !num(hero.gold)) note("load-number", where + " gives gold=" + hero.gold, where);
          guard("crash-reserialize", where, () => JSON.stringify(serializeHero(hero)));
        }));
        // One level deeper into the things that hold nested data.
        ["expedition", "story", "records", "shop", "potions", "resources", "skillProgress", "skillPicks", "skillForms"].forEach((key) => {
          if (!data[key] || typeof data[key] !== "object") return;
          Object.keys(data[key]).forEach((sub) => JUNK.forEach((junk) => {
            const raw = JSON.parse(JSON.stringify(data));
            raw[key][sub] = junk;
            const where = "save field " + key + "." + sub + "=" + JSON.stringify(junk);
            const hero = guard("crash-load", where, () => normalizeHero(raw));
            if (hero) guard("crash-after-load", where, () => { checkHero(hero, where); getStoryProgress(hero); syncStoryEvents(hero); if (hero.expedition) getTrailItems(hero, hero.expedition); });
          }));
        });
      });
    });
    ["", "{", "null", "[]", "1", '{"heroes":1}', '{"heroes":{"a":null}}', '{"heroes":{"a":{"classKey":"warrior","inventory":"x","equipment":3,"skillProgress":[1],"story":5}}}', '{"heroes":{"a":{"classKey":"nope"}}}', '{"settings":3,"heroes":{}}'].forEach((text) => guard("crash-import", "import " + text, () => importSaveText(text)));
    const storage = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
    ["{", "null", "[]", "3", '{"heroes":3}', '{"heroes":{"a":3},"activeId":"a"}', '{"settings":"x"}'].forEach((text) => {
      storage.data = { [SAVE_KEY]: text };
      guard("crash-loadsave", "loadSave " + text, () => loadSave(storage));
    });
  }

  // Everything a level can ask for, on the new tree.
  function pointsAudit() {
    classes.forEach((classKey) => {
      for (let level = 1; level <= 100; level += 3) {
        const hero = createHero({ name: "Т", classKey });
        for (let i = 1; i < level; i += 1) awardExperience(hero, getExperienceForNextLevel(hero.level));
        if (level >= SUBCLASS_UNLOCK_LEVEL) chooseSubclass(hero, Object.values(getBranchCatalog(classKey).subclasses)[0].id);
        if (level >= PROFESSION_UNLOCK_LEVEL) chooseProfession(hero, Object.values(getBranchCatalog(classKey).professions).find((p) => p.subclassId === hero.subclass).id);
        hero.gold = 1e6;
        guard("crash-build", classKey + " L" + level, () => autoBuild(hero));
        checkHero(hero, "auto L" + level + " " + classKey);
        const left = getPendingTreePick(hero);
        if (left) note("auto-build", "autoBuild left a tier open: " + classKey + " L" + level + " tier " + left.tier.level, "");
        if (level >= 1 && !hero.activeSkillSlots.some((id) => id)) note("auto-build", "panel is empty at L" + level + " " + classKey, "");
      }
    });
  }

  // References between data tables.
  function dataAudit() {
    const missing = (kind, text) => note("data-" + kind, text);
    Object.entries(ENEMY_DEFINITIONS).forEach(([id, def]) => {
      (def.moves || []).forEach((m) => { if (!ENEMY_MOVES[m]) missing("enemy", id + " uses a missing move " + m); });
      (def.traits || []).forEach((t) => { if (!ENEMY_TRAITS[t]) missing("enemy", id + " has a missing trait " + t); });
    });
    Object.entries(ENEMY_MOVES).forEach(([id, move]) => {
      if (move.apply?.id && !STATUS_EFFECT_DEFINITIONS[move.apply.id]) missing("move", id + " applies a missing effect " + move.apply.id);
      if (!move.name) missing("move", id + " has no name");
    });
    REGIONS.forEach((region) => {
      region.enemies.forEach((id) => { if (!ENEMY_DEFINITIONS[id]) missing("region", region.id + " lists missing enemy " + id); });
      if (!ENEMY_DEFINITIONS[region.guardian]) missing("region", region.id + " guardian " + region.guardian);
      if (!ENCOUNTERS[region.id]) missing("region", region.id + " has no encounters");
      (ENCOUNTERS[region.id] || []).flat().forEach((id) => { if (!ENEMY_DEFINITIONS[id]) missing("region", region.id + " encounter lists missing enemy " + id); });
    });
    Object.values(LAIR_CATALOG).forEach((lair) => {
      if (!LAIR_BOSSES[lair.master]) missing("lair", lair.id + " master " + lair.master);
      lair.sets.forEach((id) => { if (!SET_CATALOG[id]) missing("lair", lair.id + " set " + id); });
      if (!REGIONS.some((r) => r.id === lair.regionId)) missing("lair", lair.id + " region " + lair.regionId);
    });
    Object.entries(LAIR_BOSSES).forEach(([id, def]) => {
      def.moves.forEach((m) => { if (!ENEMY_MOVES[m]) missing("lairboss", id + " move " + m); });
      def.stages.forEach((s) => (s.add || []).forEach((m) => { if (!ENEMY_MOVES[m]) missing("lairboss", id + " stage move " + m); }));
    });
    Object.entries(STORY_SCENES).forEach(([id, scene]) => {
      (scene.lines || []).forEach((line) => { if (typeof line.text === "string" && /(\\bла\\b)/.test("")) return; });
    });
    classes.forEach((classKey) => {
      const tree = SKILL_TREES[classKey];
      if (!tree) { missing("tree", classKey + " has no tree"); return; }
      const ownerIds = new Set();
      const anims = {};
      tree.stages.forEach((stage) => {
        stage.tiers.forEach((tier) => tier.options.forEach((id) => {
          const skill = getSkillDefinition(id);
          if (!skill) { missing("tree", "missing " + id); return; }
          if (ownerIds.has(id)) missing("tree", "twice " + id);
          ownerIds.add(id);
          (skill.appliedEffects || []).forEach((effect) => { if (!STATUS_EFFECT_DEFINITIONS[effect.id]) missing("skill", id + " applies a missing effect " + effect.id); });
          if (skill.category === "active" && !skill.anim) missing("anim", id + " has no animation");
          if (!skill.description) missing("skill", id + " has no description");
          if (!skill.name) missing("skill", id + " has no name");
        }));
      });
    });
    Object.values(SKILL_FORMS || {}).forEach((forms) => (Array.isArray(forms) ? forms : Object.values(forms)).forEach((form) => {
      if (!form.name) missing("form", "form with no name");
      if (BAD_TEXT.test(String(form.description))) missing("form", "form text: " + form.description);
    }));
    Object.entries(ZONES).forEach(([key, zone]) => { if (zone.rarityWeights.length !== RARITY_KEYS.length) missing("zone", key + " rarity weights"); });
  }

  // How a real item survives every rule.
  function itemAudit() {
    classes.forEach((classKey) => {
      for (let level = 1; level <= 100; level += 9) {
        RARITY_KEYS.forEach((rarity) => {
          ["weapon", "head", "chest", "legs", "boots", "ring", "bracelet", "necklace"].forEach((slotType) => {
            [false, true].forEach((offhand) => {
              if (slotType !== "weapon" && offhand) return;
              const item = guard("crash-item", classKey + " " + slotType, () => generateItem({ level, rarity, classKey, slotType, offhand: slotType === "weapon" ? offhand : null }));
              if (!item) { return; }
              if (!fitsClass(item, classKey)) note("loot", "a " + classKey + " gets a " + (item.weapon || item.slotType) + " it can not wear (offhand=" + offhand + ")");
              if (!getSlotKeysForItem(item, classKey).length) note("loot", "a " + classKey + " has no slot for " + (item.weapon || item.slotType));
              const back = normalizeItem(JSON.parse(JSON.stringify(item)));
              if (JSON.stringify(getItemBonuses(back)) !== JSON.stringify(getItemBonuses(item))) note("save", "item bonuses change on reload " + item.slotType);
              Object.values(getItemBonuses(item)).forEach((v) => { if (typeof v === "number" && !Number.isFinite(v)) note("item", "bonus " + v); });
            });
          });
        });
      }
    });
  }

  // Bosses of the road and lair masters, played out by the bot and by a random hand, with their stages.
  function bigFights(perCell) {
    classes.forEach((classKey) => {
      Object.values(LAIR_CATALOG).forEach((lair) => {
        for (let i = 0; i < perCell; i += 1) {
          const level = randomFrom(getLairRanks(lair));
          const where = classKey + " lair " + lair.id + " L" + level;
          const hero = guard("crash-build", where, () => makeHero(classKey, level));
          if (!hero) continue;
          const exp = createLairRun(hero, lair.id, lair.sets[0], level);
          hero.expedition = exp;
          const entered = guard("crash-node", where, () => enterNode(hero, exp, 0));
          if (!entered?.enemy) { note("lair", "no enemy", where); continue; }
          const battle = createBattle(hero, entered.enemy);
          scanEvents(battle, where);
          let g = 0;
          while (!battle.over && g++ < 700) {
            const action = i % 2 ? guard("crash-bot", where, () => chooseBotAction(battle)) : randomAction(battle, false);
            if (!action) break;
            const r = guard("crash-action", where, () => heroAction(battle, action));
            if (r === undefined) break;
            if (!r.ok) { if (i % 2) note("bot", "bot chose a refused move: " + (action.type) + " " + r.reason, where); guard("crash-action", where, () => heroAction(battle, { type: "attack" })); }
            hero.currentHp = Math.max(hero.currentHp, roll(0.5) ? hero.maxHp : hero.currentHp);
            scanEvents(battle, where);
            checkBattle(battle, where);
          }
          if (!battle.over) note("endless", "lair fight not over", where);
        }
      });
      REGIONS.forEach((region) => {
        const where = classKey + " guardian " + region.guardian;
        const def = ENEMY_DEFINITIONS[region.guardian];
        const hero = guard("crash-build", where, () => makeHero(classKey, Math.max(1, def.level)));
        if (!hero) return;
        const foes = guard("crash-guardian", where, () => buildGuardianEncounter(region.guardian));
        if (!foes) return;
        const battle = createBattle(hero, foes);
        let g = 0;
        scanEvents(battle, where);
        while (!battle.over && g++ < 700) {
          guard("crash-action", where, () => heroAction(battle, randomAction(battle, false)));
          hero.currentHp = hero.maxHp;
          scanEvents(battle, where);
          checkBattle(battle, where);
        }
        if (battle.over === "hero") {
          guard("crash-guardian", where, () => { [].concat(foes).forEach((foe) => { if (foe.isGuardian) onGuardianDefeated(hero, foe); }); });
          if (!hero.defeatedGuardians.includes(region.guardian)) note("guardian", "win did not count", where);
          const rewards = guard("crash-rewards", where, () => calculateEncounterRewards(hero, foes, "red", region.id));
          if (rewards && !rewards.items.some((item) => item.setId)) note("guardian", "boss dropped no relic", where);
          (rewards?.items || []).forEach((item) => { if (!fitsClass(item, classKey)) note("guardian", "boss dropped a foreign item " + (item.weapon || item.slotType), where); });
        }
      });
    });
  }

  // Can every scene play, every flag be earned, and every chapter be finished by every class?
  function storyAudit() {
    const set = new Set(Object.keys(STORY_DERIVED));
    const read = new Map();
    const addRead = (flag, where) => { if (flag) read.set(flag, where); };
    Object.entries(STORY_SCENES).forEach(([id, scene]) => {
      (scene.setsFlags || []).forEach((flag) => set.add(flag));
      (scene.lines || []).forEach((line) => {
        addRead(line.if, id); addRead(line.ifNot, id);
        if (/[{][a-z]+[}]/.test(String(line.text).replace(/[{]name[}]/g, ""))) note("story-text", id + " unknown placeholder: " + line.text);
      });
      if (scene.next && !STORY_SCENES[scene.next]) note("story", id + " goes on to a missing scene " + scene.next);
      (scene.choice?.options || []).forEach((option) => {
        if (option.flag) set.add(option.flag);
        addRead(option.if, id); addRead(option.ifNot, id);
        (option.needs || []).forEach((flag) => addRead(flag, id));
        if (option.ending && !STORY_ENDINGS.some((ending) => ending.id === option.ending)) note("story", id + " has a missing ending " + option.ending);
        if (option.ending && !STORY_SCENES["ending:" + option.ending]) note("story", "no scene for ending " + option.ending);
      });
    });
    STORY_CHAPTERS.forEach((chapter) => chapter.objectives.forEach((objective) => {
      const done = objective.done || {};
      addRead(done.flag, chapter.id);
      if (done.trail) { const [r, z] = done.trail.split(":"); if (!REGIONS.some((e) => e.id === r) || !ZONES[z]) note("story", chapter.id + " trail " + done.trail); }
      if (done.boss && !ENEMY_DEFINITIONS[done.boss]) note("story", chapter.id + " boss " + done.boss);
      if (done.lair && !Object.values(LAIR_CATALOG).some((l) => l.master === done.lair || l.id === done.lair)) note("story", chapter.id + " lair " + done.lair);
    }));
    STORY_ENDINGS.forEach((ending) => (ending.needs || []).forEach((flag) => addRead(flag, "ending " + ending.id)));
    read.forEach((where, flag) => { if (!set.has(flag)) note("story-flag", "flag " + flag + " is read in " + where + " but nothing sets it"); });
  }

  // Situations that are easy to miss: a full pack at the moment of reward.
  function edgeCases() {
    classes.forEach((classKey) => {
      const hero = makeHero(classKey, 60);
      for (let i = 0; i < INVENTORY_SIZE; i += 1) hero.inventory[i] = generateItem({ level: 60, rarity: "white", classKey });
      const lair = Object.values(LAIR_CATALOG).find((l) => l.sets.some((id) => SET_CATALOG[id].classes.includes(classKey)));
      const exp = createLairRun(hero, lair.id, lair.sets.find((id) => SET_CATALOG[id].classes.includes(classKey)));
      hero.expedition = exp;
      const summary = finishExpedition(hero, exp, "complete");
      if (!hero.inventory.some((item) => item?.setId === exp.lairSet)) note("edge", "lair relic is sold when the pack is full (" + summary.soldItems + " sold)", classKey);
      // Death: what is worn stays, what is carried goes, and the shop still works.
      const dead = makeHero(classKey, 20);
      const road = createExpedition(dead, REGIONS[0].id, "green");
      dead.expedition = road;
      const found = generateItem({ level: 20, rarity: "orange", classKey });
      addTrailItem(dead, road, found);
      const out = finishExpedition(dead, road, "death");
      if (dead.inventory.includes(found)) note("edge", "found item survived a death", classKey);
      if (out.lostItems < 1) note("edge", "lost item is not counted", classKey);
      if (dead.currentHp !== dead.maxHp) note("edge", "hero not restored after death", classKey);
      if (dead.expedition) note("edge", "expedition kept after death", classKey);
      // An old hero with the old free skills asks for a rebuild, keeps points and has a working panel.
      const old = serializeHero(makeHero(classKey, 40));
      delete old.buildVersion; delete old.skillPicks; old.knownSkillIds = old.knownSkillIds.slice(0, 2);
      const back = normalizeHero(old);
      if (!back.freeRespec) note("edge", "old hero has no free rebuild", classKey);
      if (!getPendingTreePick(back)) note("edge", "old hero is not asked to choose", classKey);
      const fight = createBattle(back, [makeEnemy(REGIONS[0].enemies[0], 40)]);
      if (!heroAction(fight, { type: "attack" }).ok) note("edge", "old hero can not hit", classKey);
    });
  }

  const started = Date.now();
  const timing = {};
  const step = (name, fn) => { const t = Date.now(); guard("crash-audit", name, fn); timing[name] = Date.now() - t; };
  for (let r = 0; r < ${rounds}; r += 1) {
    step("data", dataAudit);
    step("story", storyAudit);
    step("edges", edgeCases);
    step("bigFights", () => bigFights(2));
    step("items", itemAudit);
    step("points", pointsAudit);
    step("skills", everySkillRuns);
    step("battles", () => battleFuzz(4));
    step("careers", () => classes.forEach((c) => { for (let i = 0; i < 6; i += 1) career(c, 14); }));
    step("saves", saveFuzz);
  }
  return JSON.stringify({ timing, seenEvents, problems: [...problems.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count) });
})()`);

const { timing, seenEvents, problems } = JSON.parse(report);
console.log("time", timing);
console.log("events", Object.keys(seenEvents).join(" "));
console.log(problems.length ? `${problems.length} distinct problems` : "NO PROBLEMS");
let kind = "";
problems.forEach((p) => {
  if (p.kind !== kind) { kind = p.kind; console.log(`\n== ${kind}`); }
  console.log(`x${p.count} ${p.text}${p.where ? `\n     at ${String(p.where).slice(0, 140)}` : ""}`);
});
