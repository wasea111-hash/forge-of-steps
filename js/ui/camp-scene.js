// The camp as a painted scene: places you click, people at their work, firelight and smoke.
// Every old page opens as a panel over the scene; App.tab still names the open place, so all old routes work.
const CAMP_AR = 2560 / 1441;

// Where each place is on the panorama (percent of width and height) and what it opens.
const CAMP_PLACES = [
  { id: "shop", tab: "shop", name: "Лавка Мота", hint: "Снаряжение, зелья, материалы, умения", x: 9, y: 52, w: 18, h: 34 },
  { id: "journal", tab: "journal", name: "Палатка Соты", hint: "Журнал, главы, свидетельства", x: 25, y: 45, w: 12, h: 26 },
  { id: "news", tab: "news", name: "Доска объявлений", hint: "Новости обновлений", x: 34, y: 47, w: 6, h: 15 },
  { id: "fire", tab: null, name: "Костёр", hint: "Поговорить с лагерем", x: 44, y: 69, w: 13, h: 15 },
  { id: "trail", tab: "trail", name: "Стол Веи", hint: "Карта, регионы и тропы", x: 52, y: 49, w: 11, h: 14 },
  { id: "lairs", tab: "lairs", name: "Камень логов", hint: "Логова и их хозяева", x: 71, y: 28, w: 8, h: 16 },
  { id: "companions", tab: "companions", name: "Палатки спутников", hint: "Спутники, приёмы, построение", x: 43, y: 29, w: 33, h: 12 },
  { id: "healer", tab: "shop", shopTab: "potions", name: "Навес Нимы", hint: "Зелья и лечение", x: 72, y: 50, w: 16, h: 26 },
  { id: "forge", tab: "forge", name: "Кузница Керна", hint: "Заточка, перековка, реликвии", x: 89, y: 55, w: 21, h: 40 },
  { id: "hero", tab: "hero", name: "Твоё место", hint: "Лист героя, снаряжение, рюкзак", x: 13, y: 85, w: 17, h: 20 },
  { id: "skills", tab: "skills", name: "Тренировочный столб", hint: "Навыки и таланты", x: 24, y: 76, w: 7, h: 24 }
];
// The town is a place too: its sign stands on the slope where the settlement grows.
const TOWN_PLACE = { id: "town", tab: "town", hint: "Постройки и решения города", x: 62, y: 17, w: 30, h: 15 };
function campPlaces(hero) {
  return storyHasFlag(hero, "bridge_decided") ? [...CAMP_PLACES, { ...TOWN_PLACE, name: townStage(hero).name }] : CAMP_PLACES;
}

// The people of the camp, standing at their work: foot point and height in percent of the scene.
const CAMP_PEOPLE_AT = { mot: { x: 17, y: 71, h: 30 }, sota: { x: 30.5, y: 61, h: 24 }, veya: { x: 59.5, y: 57, h: 22 }, nima: { x: 66, y: 63, h: 25 }, kern: { x: 80.5, y: 76, h: 32 } };
const CAMP_LIGHTS = [{ x: 44, y: 68, r: 22, k: "fire" }, { x: 5.3, y: 47, r: 6, k: "lamp" }, { x: 23.5, y: 41, r: 5, k: "lamp" }, { x: 57.5, y: 37, r: 6, k: "lamp" }, { x: 92, y: 62, r: 12, k: "forge" }];
// Panels that need room open wide.
const WIDE_PLACES = new Set(["hero", "gear", "skills", "talents", "forge"]);
const PLACE_TITLES = { town: "Город",  trail: "Стол Веи · Поход", lairs: "Камень логов", hero: "Твоё место", gear: "Твоё место", skills: "Тренировочный столб", talents: "Тренировочный столб", forge: "Кузница Керна", shop: "Лавка Мота", journal: "Палатка Соты", news: "Доска объявлений", companions: "Палатки спутников" };

// Morning, day, dusk or night: each return from the road moves the camp's clock.
function campHour(hero) {
  return ["morning", "day", "dusk", "night"][Number(hero.records?.expeditions || 0) % 4];
}

function campScene(hero) {
  const onTrail = Boolean(hero.expedition);
  const companion = getActiveCompanion(hero);
  const sprite = companion && typeof FORGE_SPRITES !== "undefined" && FORGE_SPRITES[companion.defId] ? `assets/sprites/${companion.defId}/idle.webp` : null;
  const people = Object.entries(CAMP_PEOPLE_AT).filter(([id]) => (hero.story?.seen || []).some((sceneId) => (STORY_SCENES[sceneId]?.lines || []).some((line) => line.who === id)));
  return `<div class="camp-stage" id="campStage">
    <div class="camp-world hour-${campHour(hero)}" style="--ar:${CAMP_AR}">
      <img class="camp-bg" src="assets/camp/${campPanorama(hero)}.webp" alt="" draggable="false">
      ${CAMP_LIGHTS.map((light, i) => `<i class="camp-light ${light.k}" style="left:${light.x}%;top:${light.y}%;--r:${light.r};--d:${(i * 0.7).toFixed(1)}s" aria-hidden="true"></i>`).join("")}
      <i class="camp-smoke fire" style="left:44%;top:56%" aria-hidden="true"></i><i class="camp-smoke chimney" style="left:91.3%;top:30%" aria-hidden="true"></i>
      ${people.map(([id, at], i) => `<img class="camp-person" data-person="${id}" src="assets/camp/npc_${id}.webp" alt="" style="left:${at.x}%;top:${at.y}%;--h:${at.h};--d:${(i * 1.3).toFixed(1)}s" draggable="false">`).join("")}
      ${sprite ? `<img class="camp-person companion" src="${sprite}" alt="" style="left:37%;top:81%;--h:25;--d:.4s" draggable="false">` : ""}
      ${campPanorama(hero) === "camp_panorama" ? townLayer(hero) : ""}
      <canvas class="fx-canvas camp-sparks" data-fx="campfire" data-origin="0.44,0.66"></canvas>
      ${campPlaces(hero).map((place) => {
        const locked = onTrail && !["hero", "skills", "journal", "news", "companions"].includes(place.id);
        const count = place.id === "town" ? (getTownOffer(hero) ? "!" : 0) : place.tab ? pendingBadgeCount(place.tab) : place.id === "fire" && getTownOffer(hero) ? "!" : 0;
        return `<button class="camp-place${place.x > 80 ? " edge-right" : place.x < 18 ? " edge-left" : ""}${locked ? " locked" : ""}${campPlaceOf(App.tab)?.id === place.id ? " open" : ""}" data-action="campPlace" data-place="${place.id}" style="left:${place.x}%;top:${place.y}%;width:${place.w}%;height:${place.h}%" aria-label="${esc(place.name)}" ${locked ? 'aria-disabled="true"' : ""}>
          <span class="place-label${count ? " waiting" : ""}"><b>${esc(place.name)}${count ? `<i class="dot">${count}</i>` : ""}</b><small>${esc(locked ? "Недоступно в походе" : place.hint)}</small></span>
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

// The town around the camp: finished buildings, and scaffolding for those still rising.
function townLayer(hero) {
  const town = ensureTown(hero);
  return Object.entries(town.built).filter(([id]) => !(id === "shelter_seed" && town.built.shelter)).map(([id, state]) => {
    const building = TOWN_BUILDINGS[id];
    if (!building) return "";
    const done = state.stage >= TOWN_BUILD_STAGES.length - 1;
    const art = done && hasCampArt(`town_${id}`) ? `town_${id}` : "town_scaffold";
    const h = done ? building.spot.h : building.spot.h * (0.55 + state.stage * 0.2);
    const tip = `${building.name}|${done ? building.effect : `Строится: ${TOWN_BUILD_STAGES[state.stage].toLowerCase()}. Ещё ${TOWN_BUILD_STAGES.length - 1 - state.stage} возвращения.`}`;
    const glow = done ? `<i class="camp-light lamp town-window" style="left:${building.spot.x}%;top:${building.spot.y - building.spot.h * 0.45}%;--r:${(building.spot.h * 0.5).toFixed(1)};--d:${(building.spot.x / 10).toFixed(1)}s" aria-hidden="true"></i>` : "";
    return glow + `<img class="camp-building${done ? "" : " rising"}${building.dark ? " dark" : ""}" src="assets/camp/${art}.webp" alt="" style="left:${building.spot.x}%;top:${building.spot.y}%;--h:${h}" data-tip="text|${esc(tip)}" draggable="false">`;
  }).join("");
}

// The picture of the camp for the town stage it has reached; a town of contracts looks like one.
function campPanorama(hero) {
  const index = TOWN_STAGES.indexOf(townStage(hero));
  if (index <= 0) return "camp_panorama";
  const dark = index >= 2 && (townBuilt(hero, "slave_market") || townBuilt(hero, "overseers"));
  const id = `camp_stage${index}${dark ? "_dark" : ""}`;
  return hasCampArt(id) ? id : "camp_panorama";
}

// Which place of the scene an open section belongs to.
function campPlaceOf(tab) {
  if (!tab || tab === "camp") return null;
  const places = campPlaces(App.hero);
  if (tab === "shop") return places.find((p) => p.shopTab && p.shopTab === App.shopTab) || places.find((p) => p.id === "shop");
  const alias = { talents: "skills", gear: "hero" }[tab] || tab;
  return places.find((p) => p.tab === alias) || null;
}

function hasCampArt(id) {
  return typeof FORGE_CAMP_ART === "undefined" || FORGE_CAMP_ART.has(id);
}

// A decision the camp brings to the fire: what will grow around it.
function openTownOffer() {
  const hero = App.hero;
  const id = getTownOffer(hero);
  if (!id) return;
  const project = TOWN_PROJECTS[id];
  openModal(`<div class="town-offer"><h2>${esc(project.name)}</h2><p class="muted small">${esc(project.place)}</p><p>${esc(project.text)}</p>
    <div class="event-options">${project.options.map((option) => `<button class="choice-card" data-action="townDecide" data-project="${id}" data-option="${option.id}"><strong>${esc(option.label)}</strong>${option.hint ? `<small>${esc(option.hint)}</small>` : ""}</button>`).join("")}</div></div>`, { dismissable: true });
}

Actions.townOffer = () => openTownOffer();
Actions.townDecide = (el) => {
  const result = decideTown(App.hero, el.dataset.project, el.dataset.option);
  if (!result.ok) { toast(result.reason, "warn"); return; }
  persist();
  closeModal();
  SFX.play(result.option.build ? "anvil" : "click");
  toast(result.option.build ? `Решено. Стройка начнётся у лагеря: ${TOWN_BUILDINGS[result.option.build]?.name || ""}.` : "Решено.", result.option.karma < 0 ? "warn" : "good");
  render();
};

// The panel over the scene for the open place.
function campDrawer(views) {
  const tab = App.tab;
  if (!tab || tab === "camp" || !views[tab]) return "";
  const title = tab === "town" ? townStage(App.hero).name : tab === "shop" && App.shopTab === "potions" ? "Навес Нимы" : PLACE_TITLES[tab] || "";
  const trainer = tab === "skills" || tab === "talents";
  return `<aside class="camp-drawer${WIDE_PLACES.has(tab) ? " wide" : ""}" data-place="${esc(campPlaceOf(tab)?.id || "")}" aria-label="${esc(title)}">
    <header class="drawer-head"><h2>${esc(title)}</h2>
      ${trainer ? `<div class="tab-row" role="tablist"><button role="tab" class="tab${tab === "skills" ? " active" : ""}" aria-selected="${tab === "skills"}" data-action="hubTab" data-tab="skills">Навыки</button><button role="tab" class="tab${tab === "talents" ? " active" : ""}" aria-selected="${tab === "talents"}" data-action="hubTab" data-tab="talents">Таланты</button></div>` : ""}
      <button class="icon-btn drawer-close" data-action="closePlace" aria-label="Вернуться в лагерь">✕</button></header>
    <div class="hub-view drawer-body">${views[tab]()}</div>
  </aside>`;
}

Actions.campPlace = (el) => {
  const place = campPlaces(App.hero).find((entry) => entry.id === el.dataset.place);
  if (!place) return;
  if (el.getAttribute("aria-disabled") === "true") { toast("Это место откроется, когда вернёшься из похода.", "warn"); return; }
  if (!place.tab) { Actions.fireTalk(); return; }
  if (place.shopTab) App.shopTab = place.shopTab;
  Actions.hubTab({ dataset: { tab: place.tab } });
};

Actions.closePlace = () => { App.tab = "camp"; render(); };

// At the fire: the next person speaks.
Actions.fireTalk = () => {
  if (getTownOffer(App.hero)) { openTownOffer(); return; }
  const talk = getCampTalk(App.hero, App.campWho, App.campTurn || 0);
  if (!talk) return;
  const people = talk.people;
  const next = people[(people.indexOf(talk.speaker) + 1) % people.length];
  App.campWho = next;
  App.campTurn = 0;
  App.fireOpen = true;
  render();
};
Actions.fireHide = () => { App.fireOpen = false; render(); };

// On a wide screen the picture is cropped at the sides: places at the edge shrink to what is visible, so their labels stay readable.
function fitCampPlaces(stage) {
  focusCampPlace(stage);
  if (getComputedStyle(stage).overflowX !== "hidden" && stage.scrollWidth > stage.clientWidth) return;
  // Computed from the picture's own geometry, never from the screen: the camera may still be sliding back.
  const world = stage.querySelector(".camp-world");
  if (!world) return;
  const vw = stage.clientWidth;
  const W = world.offsetWidth;
  const worldLeft = (vw - W) / 2;
  const places = campPlaces(App.hero);
  stage.querySelectorAll(".camp-place").forEach((el) => {
    el.style.marginLeft = "";
    el.style.width = "";
    const place = places.find((p) => p.id === el.dataset.place);
    if (!place) return;
    const center = worldLeft + W * place.x / 100;
    const half = W * place.w / 200;
    const right = Math.max(0, center + half - vw + 6);
    const left = Math.max(0, 6 - (center - half));
    if (!right && !left) { el.style.width = `${place.w}%`; return; }
    el.style.width = `${Math.max(40, half * 2 - right - left)}px`;
    el.style.marginLeft = `${(left - right) / 2}px`;
  });
}

// With a side panel open the camera moves: the open place stands in the middle of the part of the camp still seen.
function focusCampPlace(stage) {
  const world = stage.querySelector(".camp-world");
  if (!world) return;
  const drawer = stage.closest(".hub")?.querySelector(".camp-drawer:not(.wide)");
  const place = campPlaceOf(App.tab);
  if (!drawer || !place || window.innerWidth < 900) { world.style.removeProperty("--pan"); return; }
  const vw = stage.clientWidth;
  const dw = drawer.offsetWidth;
  const W = world.offsetWidth;
  const want = (vw - dw) / 2 - (vw / 2 - W / 2 + W * place.x / 100);
  const pan = Math.max(vw / 2 - W / 2 - dw, Math.min(W / 2 - vw / 2, want));
  world.style.setProperty("--pan", `${Math.round(pan)}px`);
}

// On a phone the scene scrolls sideways; it opens at the fire.
function placeCampView() {
  const stage = document.getElementById("campStage");
  if (!stage) return;
  fitCampPlaces(stage);
  if (stage.dataset.placed) return;
  stage.dataset.placed = "1";
  const world = stage.querySelector(".camp-world");
  if (world && world.offsetWidth > stage.clientWidth) stage.scrollLeft = world.offsetWidth * 0.44 - stage.clientWidth / 2;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && App.screen === "hub" && App.tab && App.tab !== "camp" && !document.querySelector(".modal-layer, .story-layer")) { event.preventDefault(); Actions.closePlace(); }
});
