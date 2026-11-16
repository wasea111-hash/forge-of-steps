// The town around the camp: offers at the fire, the player's decisions, buildings that rise over three returns,
// and what each finished building changes in the game. Data: js/core/data.town.js.

function ensureTown(hero) {
  if (!hero.town || typeof hero.town !== "object") hero.town = {};
  if (!hero.town.decided || typeof hero.town.decided !== "object") hero.town.decided = {};
  if (!hero.town.built || typeof hero.town.built !== "object") hero.town.built = {};
  return hero.town;
}

// The next project the camp wants to talk about, if any.
function getTownOffer(hero) {
  const town = ensureTown(hero);
  // Nothing to decide before there are neighbours: the town begins with the people of the bridge.
  // The camp first gives you the right to decide, at the settlers' meeting.
  if (hero.expedition || !storyHasFlag(hero, "bridge_decided") || !storyHasFlag(hero, "town_open")) return null;
  return Object.entries(TOWN_PROJECTS).find(([id, project]) => !town.decided[id] && project.when(hero))?.[0] || null;
}

function decideTown(hero, projectId, optionId) {
  const town = ensureTown(hero);
  const project = TOWN_PROJECTS[projectId];
  const option = project?.options.find((entry) => entry.id === optionId);
  if (!project || !option) return { ok: false, reason: "Такого решения нет." };
  if (town.decided[projectId]) return { ok: false, reason: "Это уже решено." };
  if (!project.when(hero)) return { ok: false, reason: "Сейчас это не обсуждают." };
  town.decided[projectId] = optionId;
  if (option.karma) changeKarma(hero, option.karma, `town_${optionId}`);
  if (option.build) startBuilding(hero, option.build);
  return { ok: true, option };
}

function startBuilding(hero, id) {
  const town = ensureTown(hero);
  if (town.built[id]) return;
  // The seed of a shelter grows into the shelter itself; others replace nothing.
  town.built[id] = { stage: 0, since: Number(hero.records?.expeditions || 0) };
}

function townBuilt(hero, id) {
  return Number(ensureTown(hero).built[id]?.stage ?? -1) >= TOWN_BUILD_STAGES.length - 1;
}

// Each return from the road raises every building by one stage.
function advanceTown(hero) {
  const town = ensureTown(hero);
  const now = Number(hero.records?.expeditions || 0);
  const raised = [];
  Object.entries(town.built).forEach(([id, state]) => {
    if (state.stage >= TOWN_BUILD_STAGES.length - 1 || now <= state.since) return;
    state.stage += 1;
    state.since = now;
    if (state.stage === TOWN_BUILD_STAGES.length - 1) raised.push(TOWN_BUILDINGS[id]?.name || id);
  });
  return raised;
}

// What finished buildings give at the end of a trip: gold, materials.
function applyTownToTrip(hero, summary) {
  if (summary.outcome !== "complete" && summary.outcome !== "retreat") return;
  if (townBuilt(hero, "crossing")) {
    const extra = Math.round(summary.gold * 0.1);
    hero.gold += extra;
    summary.gold += extra;
  }
  const bonusMaterial = (share) => {
    const id = randomFrom(Object.keys(hero.resources || {}));
    if (!id) return;
    const amount = Math.max(1, Math.round(share));
    hero.resources[id] = Number(hero.resources[id] || 0) + amount;
    summary.resources[id] = Number(summary.resources[id] || 0) + amount;
  };
  if (townBuilt(hero, "workshops")) bonusMaterial(1);
  if (townBuilt(hero, "overseers")) bonusMaterial(Object.values(summary.resources).reduce((sum, n) => sum + n, 0) * 0.1);
}

function townExpBonus(hero) {
  return townBuilt(hero, "witness_house") ? 1.1 : 1;
}

function normalizeTown(raw) {
  const town = { decided: {}, built: {} };
  Object.entries(raw?.decided || {}).forEach(([id, option]) => { if (TOWN_PROJECTS[id] && typeof option === "string") town.decided[id] = option; });
  Object.entries(raw?.built || {}).forEach(([id, state]) => {
    if (!TOWN_BUILDINGS[id]) return;
    town.built[id] = { stage: clamp(Math.round(Number(state?.stage) || 0), 0, TOWN_BUILD_STAGES.length - 1), since: Math.max(0, Number(state?.since) || 0) };
  });
  return town;
}

const TOWN_STAGES = [
  { at: 0, name: "Стоянка" },
  { at: 2, name: "Обжитый лагерь" },
  { at: 4, name: "Посёлок" },
  { at: 7, name: "Город у Кузницы" }
];

function townStage(hero) {
  const built = Object.keys(ensureTown(hero).built).filter((id) => townBuilt(hero, id) && id !== "shelter_seed").length;
  return [...TOWN_STAGES].reverse().find((stage) => built >= stage.at) || TOWN_STAGES[0];
}
