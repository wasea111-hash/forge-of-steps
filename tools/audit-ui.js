// UI audit, runs inside the page: every tab, every button, every tooltip, and whole journeys through the real interface.
// Load on index.html?dev=1 with a script tag, then: UIAudit.sweep("bard", 25) or UIAudit.journey("mage", 12).
// Saving is switched off for the whole run, so no real hero is touched. Reload the page afterwards.
(() => {
  const A = (window.UIAudit = { problems: {}, status: "idle", counts: { screens: 0, clicks: 0, tips: 0 } });
  const realWrite = window.writeSave;
  window.writeSave = () => true;
  window.confirm = () => true;
  window.alert = () => {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let where = "";
  const note = (kind, text) => {
    const key = `${kind} :: ${String(text).replace(/[0-9]+/g, "#").slice(0, 150)}`;
    const entry = A.problems[key] || (A.problems[key] = { kind, text: String(text).slice(0, 260), where, count: 0 });
    entry.count += 1;
  };
  window.addEventListener("error", (e) => note("js-error", `${e.message} @ ${String(e.filename).split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => note("js-reject", String(e.reason?.stack || e.reason).slice(0, 240)));
  const realError = console.error;
  console.error = (...args) => { note("console", args.map(String).join(" ")); realError(...args); };

  const BAD = /undefined|\bNaN\b|\[object|Infinity|\bnull\b/;
  const skipActions = /exportSave|importSave|doImport|toTitle|openDev|devDo/;
  const PLAN = { warrior: ["strength", "endurance"], mage: ["intellect", "endurance"], archer: ["agility", "strength"], bard: ["intellect", "spirituality"], assassin: ["strength", "agility"] };

  function makeHero(classKey, level) {
    const hero = createHero({ name: "Аудит", classKey });
    for (let i = 1; i < level; i += 1) awardExperience(hero, getExperienceForNextLevel(hero.level));
    while (hero.statPoints > 0) addStatPoint(hero, randomFrom(PLAN[classKey]), 1);
    const cat = getBranchCatalog(classKey);
    const prof = Object.values(cat.professions)[0];
    if (level >= SUBCLASS_UNLOCK_LEVEL) chooseSubclass(hero, prof.subclassId);
    if (level >= PROFESSION_UNLOCK_LEVEL) chooseProfession(hero, prof.id);
    autoBuild(hero, {});
    hero.gold = 50000;
    hero.mutationShards = 50;
    Object.keys(hero.resources).forEach((id) => { hero.resources[id] = 30; });
    Object.keys(hero.equipment).forEach((slot) => {
      const type = slot.split("-")[0];
      if (roll(0.85)) hero.equipment[slot] = generateItem({ level, rarity: randomFrom(RARITY_KEYS), classKey, slotType: type, offhand: type === "weapon" ? slot === "weapon-2" : null });
    });
    for (let i = 0; i < 12; i += 1) hero.inventory[i] = generateItem({ level, rarity: randomFrom(RARITY_KEYS), classKey });
    const set = Object.values(SET_CATALOG).find((entry) => entry.classes.includes(classKey));
    hero.inventory[12] = generateRelic(hero, set.id, level, "weapon");
    REGIONS.forEach((region, index) => {
      if (level >= 30 + index * 20) { hero.trailClears[region.id] = [...ZONE_KEYS]; if (index < REGIONS.length - 1) hero.defeatedGuardians.push(region.guardian); hero.unlockedRegion = Math.max(hero.unlockedRegion, Math.min(index + 1, REGIONS.length - 1)); }
    });
    hero.trailClears[REGIONS[0].id] = [...ZONE_KEYS];
    Object.keys(LAIR_CATALOG).slice(0, 2).forEach((id) => { hero.lairClears[id] = 1; hero.lairTokens[id] = 9; });
    Object.values(ENEMY_DEFINITIONS).slice(0, 30).forEach((def, i) => { hero.records.bestiary[Object.keys(ENEMY_DEFINITIONS)[i]] = 3; });
    hero.records.kills = 100;
    hero.story.queue = [];
    hero.story.seen = Object.keys(STORY_SCENES);
    applyDerivedStats(hero, true);
    return hero;
  }

  function scanDom(label) {
    A.counts.screens += 1;
    const roots = [document.getElementById("app"), ...document.querySelectorAll(".modal-layer"), document.querySelector(".story-layer")].filter(Boolean);
    roots.forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent;
        if (BAD.test(text) && !walker.currentNode.parentElement.closest("script,style")) note("bad-text", `${label}: ${text.trim().slice(0, 150)}`);
      }
      root.querySelectorAll("img").forEach((img) => {
        if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) note("broken-image", `${label}: ${img.getAttribute("src")}`);
        if (/undefined|null/.test(img.getAttribute("src") || "")) note("broken-image", `${label}: ${img.getAttribute("src")}`);
      });
      root.querySelectorAll("[data-action]").forEach((el) => { if (!Actions[el.dataset.action]) note("dead-button", `${label}: ${el.dataset.action} "${el.textContent.trim().slice(0, 50)}"`); });
    });
    // Layout: nothing should stick out of the window, and text should not be cut in buttons and chips.
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width + 1) note("page-overflow", `${label}: page is ${document.documentElement.scrollWidth} wide in ${width}`);
    roots.forEach((root) => root.querySelectorAll("button, .chip, h1, h2, h3").forEach((el) => {
      if (!el.offsetParent || !el.textContent.trim()) return;
      const r = el.getBoundingClientRect();
      if (r.right > width + 2 && !el.closest("[style*=overflow],.nav-rail,.hub-tabs")) note("off-screen", `${label}: "${el.textContent.trim().slice(0, 40)}" ends at ${Math.round(r.right)} of ${width}`);
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && style.overflowX === "hidden") note("clipped-text", `${label}: "${el.textContent.trim().slice(0, 50)}"`);
    }));
  }

  function checkTips(label) {
    const seen = new Set();
    document.querySelectorAll("[data-tip]").forEach((el) => {
      const tip = el.dataset.tip;
      if (seen.has(tip)) return;
      seen.add(tip);
      A.counts.tips += 1;
      let html = "";
      try { html = resolveTip(tip); } catch (error) { note("tip-throw", `${label}: ${tip.slice(0, 60)}: ${error.message}`); return; }
      const text = String(html).replace(/<[^>]+>/g, " ");
      if (!text.trim()) note("empty-tip", `${label}: ${tip.slice(0, 80)}`);
      if (BAD.test(text)) note("bad-tip", `${tip.slice(0, 40)} -> ${text.slice(0, 160)}`);
    });
  }

  const clearOverlays = () => {
    let guard = 0;
    while (document.querySelector(".modal-layer") && guard++ < 10) document.querySelector(".modal-layer").remove();
    document.querySelector(".story-layer")?.remove();
    hideTooltip();
  };

  // Press every kind of button of a tab, from a clean copy of the hero each time.
  async function sweepTab(snapshot, tab) {
    const open = () => {
      clearOverlays();
      App.hero = normalizeHero(JSON.parse(JSON.stringify(snapshot)));
      App.hero.story.queue = [];
      App.tab = tab;
      App.battle = null;
      setScreen("hub");
    };
    open();
    await sleep(40);
    where = `${snapshot.classKey} L${snapshot.level} tab=${tab}`;
    scanDom(where);
    checkTips(where);
    const seen = new Set();
    const list = () => [...document.querySelectorAll("#app [data-action]")].filter((el) => !el.disabled && !skipActions.test(el.dataset.action));
    const keyOf = (el) => `${el.dataset.action}|${el.dataset.tab || ""}|${el.dataset.mode || ""}|${el.dataset.source || ""}|${el.dataset.group || ""}`;
    let index = 0;
    while (index < list().length && index < 90) {
      const el = list()[index];
      const key = keyOf(el);
      index += 1;
      if (seen.has(key)) continue;
      seen.add(key);
      where = `${snapshot.classKey} L${snapshot.level} tab=${tab} click ${key}`;
      A.counts.clicks += 1;
      try { el.click(); } catch (error) { note("click-throw", `${key}: ${error.message}`); }
      await sleep(30);
      scanDom(where);
      if (document.querySelector(".modal-layer")) {
        checkTips(`${where} modal`);
        // Press what the first modal offers too, one level deep.
        const inner = [...document.querySelectorAll(".modal-layer:last-child [data-action]")].filter((b) => !b.disabled && b.dataset.action !== "closeModal" && !skipActions.test(b.dataset.action)).slice(0, 2);
        if (inner[0]) { const action = inner[0].dataset.action; try { inner[0].click(); } catch (error) { note("click-throw", `${action}: ${error.message}`); } await sleep(30); scanDom(`${where} > ${action}`); }
      }
      open();
      await sleep(15);
    }
  }

  A.sweep = async (classKey, level) => {
    A.status = `sweep ${classKey} ${level}`;
    const hero = makeHero(classKey, level);
    App.save.settings.tips = Object.fromEntries(COACH_TIPS.map((t) => [t.id, true]));
    const snapshot = serializeHero(hero);
    for (const tab of HUB_TABS.map((t) => t.id)) await sweepTab(snapshot, tab);
    clearOverlays();
    A.status = "idle";
  };

  // A whole trip through the real buttons. "fate" decides how it should end.
  const waitFor = async (test, ms, label) => {
    const start = performance.now();
    while (performance.now() - start < ms) {
      if (test()) return true;
      await sleep(40);
    }
    note("hang", `${where}: waited ${ms}ms for ${label}; screen=${App.screen} modal=${Boolean(document.querySelector(".modal-layer"))} playing=${App.fight?.playing} awaiting=${App.battle?.awaiting} over=${App.battle?.over}`);
    return false;
  };

  async function pressOn(rounds, fate) {
    for (let i = 0; i < rounds; i += 1) {
      await sleep(30);
      const modalBtn = document.querySelector(".modal-layer:last-child [data-action]:not([disabled])");
      const story = document.querySelector(".story-layer");
      if (story) { story.querySelector(".story-skip")?.click(); await sleep(30); const opt = document.querySelector(".story-layer .story-choices button"); opt?.click(); continue; }
      if (modalBtn) {
        scanDom(`${where} modal`);
        const wanted = document.querySelector(".modal-layer:last-child [data-action=resultContinue], .modal-layer:last-child [data-action=pickTreeSkill], .modal-layer:last-child [data-action=pickUltimate], .modal-layer:last-child [data-action=keepUltimate], .modal-layer:last-child [data-action=pathConfirm], .modal-layer:last-child [data-action=chooseMastery], .modal-layer:last-child [data-action=coachNext]") || modalBtn;
        wanted.click();
        continue;
      }
      if (App.screen === "hub") { scanDom(`${where} back in camp`); return true; }
      if (App.screen === "trail") {
        scanDom(`${where} trail`);
        const boon = document.querySelector("[data-action=pickBoon]");
        const eventBtn = document.querySelector("[data-action=eventOption]");
        const next = document.querySelector("[data-action=eventContinue]");
        const fork = document.querySelectorAll("[data-action=chooseNode]");
        if (fate === "retreat" && document.querySelector("[data-action=retreat]") && i > 2) { document.querySelector("[data-action=retreat]").click(); await sleep(60); document.querySelector(".modal-layer:last-child [data-action=__confirm]")?.click(); continue; }
        if (boon) boon.click();
        else if (eventBtn) randomFrom([...document.querySelectorAll("[data-action=eventOption]:not([disabled])")])?.click();
        else if (next) next.click();
        else if (fork.length) randomFrom([...fork]).click();
        else { note("dead-end", `${where}: nothing to press on the trail`); return false; }
        continue;
      }
      if (App.screen === "battle") {
        const battle = App.battle;
        const nonce = battle;
        scanDom(`${where} battle`);
        if (fate === "die") App.hero.currentHp = Math.min(App.hero.currentHp, 1);
        if (fate === "win" && battle) { battle.foes.forEach((foe) => { if (foe.currentHp > 1 && foe.maxHp > 3) foe.currentHp = Math.max(1, Math.round(foe.maxHp * 0.02)); }); App.hero.currentHp = App.hero.maxHp; }
        await waitFor(() => App.battle !== nonce || (App.battle?.awaiting && !App.fight?.playing) || App.battle?.over || document.querySelector(".modal-layer"), 25000, "the hero's turn");
        if (App.battle === nonce && App.battle?.awaiting && !App.fight?.playing && !document.querySelector(".modal-layer")) {
          const buttons = [...document.querySelectorAll("[data-action=battleAct]:not([disabled]):not(.disabled)")];
          if (!buttons.length) note("dead-end", `${where}: no battle button can be pressed`);
          randomFrom(buttons)?.click();
          await sleep(40);
        }
        continue;
      }
      note("dead-end", `${where}: unexpected screen ${App.screen}`);
      return false;
    }
    note("hang", `${where}: the trip did not end after ${rounds} presses, screen=${App.screen}`);
    return false;
  }

  A.journey = async (classKey, level, fate = "win", kind = "trail") => {
    A.status = `journey ${classKey} ${level} ${fate} ${kind}`;
    where = A.status;
    clearOverlays();
    const hero = makeHero(classKey, level);
    App.hero = hero;
    App.battle = null;
    App.save.settings.tips = Object.fromEntries(COACH_TIPS.map((t) => [t.id, true]));
    App.save.settings.battleSpeed = 3;
    App.tab = "trail";
    setScreen("hub");
    await sleep(40);
    if (kind === "lair") {
      const lair = Object.values(LAIR_CATALOG).find((l) => l.sets.some((id) => SET_CATALOG[id].classes.includes(classKey)));
      Actions.startLair({ dataset: { id: lair.id, set: lair.sets.find((id) => SET_CATALOG[id].classes.includes(classKey)), level: String(Math.max(lair.level, level)) } });
    } else if (kind === "guardian") {
      hero.trailClears[REGIONS[0].id] = [...ZONE_KEYS];
      hero.defeatedGuardians = hero.defeatedGuardians.filter((id) => id !== REGIONS[0].guardian);
      hero.level = Math.max(hero.level, ENEMY_DEFINITIONS[REGIONS[0].guardian].level);
      Actions.startGuardian({ dataset: { id: REGIONS[0].guardian, index: "0", region: "0" } });
      await sleep(50);
    } else {
      App.regionIndex = 0;
      hero.expedition = createExpedition(hero, REGIONS[0].id, "green");
      setScreen("trail");
    }
    await pressOn(400, fate);
    clearOverlays();
    if (App.hero.expedition && App.screen === "hub") note("state", `${where}: back in camp with an open expedition`);
    A.status = "idle";
  };

  // Every scene of the story, on the real player, clicked through to the end.
  A.scenes = async () => {
    A.status = "scenes";
    clearOverlays();
    for (const classKey of Object.keys(classDefinitions)) {
      App.hero = makeHero(classKey, 70);
      App.tab = "journal";
      setScreen("hub");
      for (const id of Object.keys(STORY_SCENES)) {
        where = `scene ${id} ${classKey}`;
        App.hero.story.queue = [];
        let done = false;
        playStoryScene(id, { replay: true, onDone: () => { done = true; } });
        await sleep(25);
        scanDom(where);
        let guard = 0;
        while (!done && document.querySelector(".story-layer") && guard++ < 200) {
          const layer = document.querySelector(".story-layer");
          const option = layer.querySelector(".story-choices button");
          if (option) option.click();
          else layer.querySelector(".story-box")?.click();
          await sleep(6);
        }
        if (document.querySelector(".story-layer")) note("hang", `${where}: the scene does not close`);
        document.querySelector(".story-layer")?.remove();
      }
      if (classKey === "warrior") await sleep(1);
    }
    clearOverlays();
    A.status = "idle";
  };

  // The very first minutes: title, every class on the creation screen, the opening, the first choice, the first fight.
  A.newGame = async (classKey) => {
    A.status = `new game ${classKey}`;
    where = A.status;
    clearOverlays();
    App.hero = null;
    App.battle = null;
    App.creation = null;
    setScreen("title");
    scanDom(where);
    document.querySelector("[data-action=newHero]").click();
    await sleep(40);
    for (const key of Object.keys(classDefinitions)) {
      document.querySelector(`[data-action=pickClass][data-class=${key}]`).click();
      await sleep(15);
      where = `create screen ${key}`;
      scanDom(where);
      checkTips(where);
    }
    where = A.status;
    document.querySelector(`[data-action=pickClass][data-class=${classKey}]`).click();
    await sleep(15);
    const name = document.querySelector("#app input");
    name.value = `Проба ${classKey}`;
    name.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("[data-action=autoAlloc]")?.click();
    await sleep(15);
    document.querySelector("[data-action=finishCreate]").click();
    await sleep(300);
    if (!App.hero) { note("new-game", `no hero after creation: ${classKey}`); return; }
    App.save.settings.tips = Object.fromEntries(COACH_TIPS.map((t) => [t.id, true]));
    App.save.settings.battleSpeed = 3;
    for (let i = 0; i < 300; i += 1) {
      const layer = document.querySelector(".story-layer");
      if (!layer) { await sleep(280); if (!document.querySelector(".story-layer")) break; continue; }
      const option = layer.querySelector(".story-choices button");
      if (option) option.click(); else layer.querySelector(".story-box").click();
      await sleep(8);
    }
    await sleep(350);
    const pick = document.querySelector(".modal-layer [data-action=pickTreeSkill]:not([disabled])");
    if (!pick) { note("new-game", `the first choice of a skill did not come: ${classKey}`); return; }
    pick.click();
    await sleep(120);
    if (!App.hero.activeSkillSlots.some(Boolean)) note("new-game", `the first skill is not on the panel: ${classKey}`);
    clearOverlays();
    const start = document.querySelector("[data-action=startExpedition][data-zone=white]");
    if (!start || start.disabled) { note("new-game", `white trail is closed: ${classKey}`); return; }
    start.click();
    await sleep(150);
    await pressOn(400, "win");
    if (App.screen !== "hub") note("new-game", `the first trip did not end in camp: ${classKey}`);
    clearOverlays();
    A.status = "idle";
  };

  // For looking with one's own eyes.
  A.open = (classKey, level, tab) => {
    clearOverlays();
    App.save.settings.tips = Object.fromEntries(COACH_TIPS.map((t) => [t.id, true]));
    App.hero = makeHero(classKey, level);
    App.tab = tab;
    App.battle = null;
    setScreen("hub");
  };
  A.report = () => Object.values(A.problems).sort((a, b) => a.kind.localeCompare(b.kind)).map((p) => `[${p.kind}] x${p.count} ${p.text}`).join("\n") || "NO PROBLEMS";
  A.restoreSaving = () => { window.writeSave = realWrite; };
})();
