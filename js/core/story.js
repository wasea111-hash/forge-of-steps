// The story: what has been seen, what was chosen, what comes next. No DOM here, js/ui/story.js plays the scenes.

function newStoryState() {
  return { seen: [], queue: [], flags: [], bonuses: [], choices: {}, deaths: 0, ending: null };
}

// A hero from an older save keeps the road already walked: the scenes behind it count as seen, only the opening is shown.
function migrateStory(raw) {
  if (raw.story && typeof raw.story === "object") {
    const story = { ...newStoryState(), ...raw.story };
    story.seen = (Array.isArray(story.seen) ? story.seen : []).filter((id) => STORY_SCENES[id]);
    story.queue = (Array.isArray(story.queue) ? story.queue : []).filter((id) => STORY_SCENES[id] && !story.seen.includes(id));
    story.choices = story.choices && typeof story.choices === "object" ? story.choices : {};
    story.deaths = Number.isFinite(Number(story.deaths)) ? Math.max(0, Number(story.deaths)) : 0;
    story.flags = Array.isArray(story.flags) ? story.flags : [];
    story.bonuses = (Array.isArray(story.bonuses) ? story.bonuses : []).filter((bonus) => bonus?.id);
    story.lastTrip = cleanCampTrip(story.lastTrip);
    return story;
  }
  const story = newStoryState();
  const seen = new Set();
  const clears = raw.trailClears || {};
  Object.entries(clears).forEach(([regionId, zones]) => { (zones || []).forEach((zone) => seen.add(`trail:${regionId}:${zone}`)); });
  (raw.defeatedGuardians || []).forEach((id) => { seen.add(`boss_before:${id}`); seen.add(`boss_after:${id}`); });
  REGIONS.forEach((region, index) => { if (index <= Number(raw.unlockedRegion || 0)) seen.add(`region:${region.id}`); });
  // A big decision can not be skipped: its scene still plays.
  story.seen = [...seen].filter((id) => STORY_SCENES[id] && !STORY_SCENES[id].choice);
  story.seen.forEach((id) => { (STORY_SCENES[id].setsFlags || []).forEach((flag) => { if (!story.flags.includes(flag)) story.flags.push(flag); }); });
  queueStoryOpening(story, raw.classKey);
  return story;
}

function queueStoryOpening(story, classKey) {
  ["intro", `class:${classKey}`, "region:thicket"].forEach((id) => {
    if (STORY_SCENES[id] && !story.seen.includes(id) && !story.queue.includes(id)) story.queue.push(id);
  });
}

// Something happened in the world. A scene plays once per hero.
function storyEvent(hero, sceneId) {
  const story = hero.story;
  const scene = STORY_SCENES[sceneId];
  if (!story || !scene || story.queue.includes(sceneId) || (scene.once !== false && story.seen.includes(sceneId))) return false;
  story.queue.push(sceneId);
  return true;
}

const STORY_DERIVED = {
  bridge_decided: (has) => has("bridge_people") || has("bridge_home"),
  mot_decided: (has) => has("mot_freed") || has("mot_bound"),
  sota_decided: (has) => has("sota_names") || has("sota_index"),
  kern_decided: (has) => has("kern_release") || has("kern_anchor"),
  home_exact: (has) => has("bridge_home") && has("sota_index"),
  nima_default: (has) => !has("nima_witness") && !has("nima_rescue"),
  subclass_chosen: (has, hero) => Boolean(hero.subclass),
  profession_chosen: (has, hero) => Boolean(hero.profession),
  ending_resolved: (has, hero) => Boolean(hero.story?.ending),
  boss_greyfang: (has, hero) => hero.defeatedGuardians?.includes("greyfang"),
  boss_pyre_queen: (has, hero) => hero.defeatedGuardians?.includes("pyre_queen"),
  boss_archivist: (has, hero) => hero.defeatedGuardians?.includes("archivist"),
  boss_smith: (has, hero) => hero.defeatedGuardians?.includes("smith")
};

function storyHasFlag(hero, flag) {
  if (hero.story?.flags.includes(flag)) return true;
  const derived = STORY_DERIVED[flag];
  return derived ? Boolean(derived((other) => storyHasFlag(hero, other), hero)) : false;
}

function storyLineVisible(hero, line) {
  if (line.if && !storyHasFlag(hero, line.if)) return false;
  if (line.ifNot && storyHasFlag(hero, line.ifNot)) return false;
  if (line.class && line.class !== hero.classKey) return false;
  return true;
}

function storyText(hero, text) {
  return String(text || "").replace(/\{name\}/g, hero.name);
}

// The lines of a scene for this hero, with names filled in and conditions applied.
function getStoryLines(hero, lines) {
  return (lines || []).filter((line) => storyLineVisible(hero, line)).map((line) => ({ ...line, text: storyText(hero, line.text) }));
}

function getEndingState(hero, endingId) {
  const ending = STORY_ENDINGS.find((entry) => entry.id === endingId);
  if (!ending) return { ok: true };
  const missing = (ending.needs || []).filter((flag) => !storyHasFlag(hero, flag));
  const lairs = getStoryLairsBeaten(hero);
  if (missing.length || lairs < Number(ending.needsLairs || 0)) return { ok: false, lairs };
  return { ok: true, lairs };
}

function getStoryLairsBeaten(hero) {
  return Object.values(LAIR_CATALOG).filter((lair) => Number(hero.lairClears?.[lair.id] || 0) > 0).length;
}

function getStoryOptions(hero, choice) {
  return (choice?.options || []).filter((option) => storyLineVisible(hero, option) && (option.needs || []).every((flag) => storyHasFlag(hero, flag)) && (!option.ending || getEndingState(hero, option.ending).ok));
}

function applyStoryEffect(hero, effect) {
  if (!effect) return;
  if (effect.bonus && !hero.story.bonuses.some((bonus) => bonus.id === effect.bonus.id)) hero.story.bonuses.push(effect.bonus);
  if (effect.gold) hero.gold += Number(effect.gold);
  if (effect.potions?.hp) hero.potions.hp = Math.min(POTION_LIMIT, hero.potions.hp + Number(effect.potions.hp));
  if (effect.potions?.mp) hero.potions.mp = Math.min(POTION_LIMIT, hero.potions.mp + Number(effect.potions.mp));
}

function chooseStoryOption(hero, sceneId, option) {
  const story = hero.story;
  story.choices[sceneId] = option.label;
  if (option.flag && !story.flags.includes(option.flag)) story.flags.push(option.flag);
  applyStoryEffect(hero, option.effect);
  if (option.ending) {
    story.ending = option.ending;
    storyEvent(hero, `ending:${option.ending}`);
  }
  applyDerivedStats(hero);
}

function markStorySeen(hero, sceneId) {
  const story = hero.story;
  story.queue = story.queue.filter((id) => id !== sceneId);
  if (!story.seen.includes(sceneId)) story.seen.push(sceneId);
  const scene = STORY_SCENES[sceneId];
  (scene?.setsFlags || []).forEach((flag) => { if (!story.flags.includes(flag)) story.flags.push(flag); });
  if (scene?.next) storyEvent(hero, scene.next);
}

// The final decision may wait: the scene leaves the queue and stays open from the camp.
function postponeStoryScene(hero, sceneId) {
  hero.story.queue = hero.story.queue.filter((id) => id !== sceneId);
}

// What has happened in the world asks for its scene. Everything here reads the state, so nothing is missed or repeated.
function syncStoryEvents(hero) {
  if (!hero.story) return;
  const story = hero.story;
  REGIONS.forEach((region, index) => {
    if (index > 0 && hero.defeatedGuardians.includes(REGIONS[index - 1].guardian)) storyEvent(hero, `boss_after:${REGIONS[index - 1].guardian}`);
    if (isRegionUnlocked(hero, index)) storyEvent(hero, `region:${region.id}`);
    ZONE_KEYS.forEach((zone) => { if (getTrailClears(hero, region.id).includes(zone)) storyEvent(hero, `trail:${region.id}:${zone}`); });
  });
  if (hero.defeatedGuardians.includes("smith")) storyEvent(hero, "boss_after:smith");
  Object.values(LAIR_CATALOG).forEach((lair) => {
    const clears = Number(hero.lairClears?.[lair.id] || 0);
    if (clears > 0) storyEvent(hero, `lair:${lair.master}`);
    if (clears > 1) storyEvent(hero, "lair:repeat");
  });
  const witnesses = Array.from({ length: 8 }, (_, index) => `witness_${index + 1}`);
  if (witnesses.every((flag) => storyHasFlag(hero, flag))) storyEvent(hero, "witness:complete");
  if (Object.values(getActiveSetCounts(hero)).some((count) => count >= SET_FULL)) storyEvent(hero, "set:full");
  if (hero.subclass) storyEvent(hero, "path:subclass");
  if (hero.profession) storyEvent(hero, "path:profession");
  if (Number(story.retreats || 0) > 0) storyEvent(hero, "retreat:first");
  const deaths = Number(story.deaths || 0);
  if (deaths >= 1) storyEvent(hero, "death:first");
  if (deaths >= 3) storyEvent(hero, "death:third");
  if (deaths >= 4 && !story.ending && Number(story.laterShown || 0) < deaths) {
    story.laterShown = deaths;
    storyEvent(hero, "death:later");
  }
}

// A real death in battle takes one feeling. Facts, names and skills stay.
function noteStoryDeath(hero) {
  if (!hero.story || hero.story.ending) return;
  hero.story.deaths = Number(hero.story.deaths || 0) + 1;
}

function getLostMemories(hero) {
  const deaths = Number(hero.story?.deaths || 0);
  return STORY_MEMORIES.filter((memory) => memory.death <= deaths);
}

// What the player is doing and why, shown in the camp.
function isObjectiveDone(hero, done) {
  if (!done) return false;
  if (done.trail) {
    const [regionId, zone] = done.trail.split(":");
    return getTrailClears(hero, regionId).includes(zone);
  }
  if (done.boss) return hero.defeatedGuardians.includes(done.boss);
  if (done.lair) {
    const lair = Object.values(LAIR_CATALOG).find((entry) => entry.master === done.lair || entry.id === done.lair);
    return Boolean(lair) && Number(hero.lairClears?.[lair.id] || 0) > 0;
  }
  if (done.level) return hero.level >= done.level;
  if (done.flag) return storyHasFlag(hero, done.flag);
  if (done.ending) return Boolean(hero.story?.ending);
  return false;
}

function getStoryProgress(hero) {
  const chapters = STORY_CHAPTERS.map((chapter) => {
    const objectives = chapter.objectives.map((objective) => ({ ...objective, done: isObjectiveDone(hero, objective.done) }));
    // Optional goals never hold a chapter back.
    return { ...chapter, objectives, complete: objectives.filter((objective) => !objective.optional).every((objective) => objective.done) };
  });
  // Parallel chapters run alongside the main road and never hold it back.
  const index = chapters.findIndex((chapter) => !chapter.parallel && !chapter.complete);
  // Once the ending is chosen, nothing on the road can hold the story open.
  const finished = index < 0 || (Boolean(hero.story?.ending) && storyHasFlag(hero, "postgame_open"));
  return { chapters, currentIndex: finished ? chapters.length - 1 : index, current: finished ? null : chapters[index], finished };
}

// Choices made on the road stay with the hero as small lasting powers.
function getStoryBonusDefs(hero) {
  return (hero.story?.bonuses || []).map((bonus) => ({ ...bonus, id: `story-${bonus.id}` }));
}
