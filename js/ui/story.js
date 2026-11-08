// Cutscenes: painted frames that drift slowly, a speaker with a portrait, text that types itself, choices.
const StoryPlayer = { active: false, timer: null };

const STORY_NARRATOR = "narrator";

function storyArtSrc(id) {
  if (!id) return "assets/img/bg_camp.webp";
  if (STORY_ART_IDS.has(id)) return `assets/story/${id}.webp`;
  return `assets/img/${id}.webp`;
}

function storyCharacter(id) {
  return STORY_CHARACTERS.find((entry) => entry.id === id) || null;
}

function storyPortrait(who) {
  const character = storyCharacter(who);
  if (character) return `<img class="story-portrait" src="assets/story/portrait_${character.id}.webp" alt="">`;
  // Bosses and masters speak with their painted faces.
  if (window.FORGE_SPRITES?.[who]) return `<img class="story-portrait foe" src="assets/sprites/${who}/idle.webp" alt="">`;
  return "";
}

function storySpeakerName(who) {
  if (!who || who === STORY_NARRATOR) return "";
  if (who === "hero") return App.hero?.name || "";
  return storyCharacter(who)?.name || ENEMY_DEFINITIONS[who]?.name || "";
}

// Plays one scene. replay means it is watched again from the journal: no flags, no effects.
function playStoryScene(sceneId, { replay = false, onDone = null } = {}) {
  const scene = STORY_SCENES[sceneId];
  const hero = App.hero;
  if (!scene || !hero) { onDone?.(); return; }
  document.querySelector(".story-layer")?.remove();
  const layer = document.createElement("div");
  layer.className = "story-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", scene.title || "Сцена");
  layer.innerHTML = `
    <div class="story-art"><img alt="" src="${storyArtSrc(scene.art)}"></div>
    <div class="story-shade"></div>
    ${scene.title ? `<div class="story-title">${esc(scene.title)}</div>` : ""}
    <button class="story-skip" type="button">Пропустить сцену</button>
    <div class="story-box"><div class="story-face"></div><div class="story-words"><b class="story-name"></b><p class="story-text"></p><div class="story-choices"></div></div><i class="story-next" aria-hidden="true">▼</i></div>`;
  document.body.appendChild(layer);
  StoryPlayer.active = true;
  const state = { queue: getStoryLines(hero, scene.lines), typing: false, full: "", waitingChoice: false };
  const textEl = layer.querySelector(".story-text");
  const nameEl = layer.querySelector(".story-name");
  const faceEl = layer.querySelector(".story-face");
  const choicesEl = layer.querySelector(".story-choices");
  const nextEl = layer.querySelector(".story-next");

  const finishTyping = () => {
    clearInterval(StoryPlayer.timer);
    textEl.textContent = state.full;
    state.typing = false;
    nextEl.hidden = false;
  };
  const showLine = (line) => {
    nameEl.textContent = storySpeakerName(line.who);
    faceEl.innerHTML = storyPortrait(line.who);
    layer.classList.toggle("is-narrator", !line.who || line.who === STORY_NARRATOR);
    if (line.art) layer.querySelector(".story-art img").src = storyArtSrc(line.art);
    state.full = line.text;
    state.typing = true;
    nextEl.hidden = true;
    textEl.textContent = "";
    let shown = 0;
    clearInterval(StoryPlayer.timer);
    StoryPlayer.timer = setInterval(() => {
      shown += 2;
      textEl.textContent = state.full.slice(0, shown);
      if (shown >= state.full.length) finishTyping();
    }, 24);
  };
  const close = () => {
    clearInterval(StoryPlayer.timer);
    document.removeEventListener("keydown", onKey, true);
    layer.classList.add("leaving");
    setTimeout(() => {
      layer.remove();
      StoryPlayer.active = false;
      if (!replay && !state.postponed) { markStorySeen(hero, sceneId); persist(); }
      if (onDone) onDone();
      else if (!replay) maybePlayStory();
    }, 260);
  };
  const showChoice = () => {
    const options = getStoryOptions(hero, scene.choice);
    if (replay || !scene.choice) { close(); return; }
    if (!options.length) { close(); return; }
    state.waitingChoice = true;
    nameEl.textContent = "";
    faceEl.innerHTML = "";
    layer.classList.add("is-narrator");
    textEl.textContent = storyText(hero, scene.choice.prompt || "");
    nextEl.hidden = true;
    choicesEl.innerHTML = options.map((option, index) => `<button class="story-choice" type="button" data-index="${index}"><small>${index + 1}</small>${esc(storyText(hero, option.label))}</button>`).join("") + (scene.allowReturnToCamp ? `<button class="story-choice later" type="button" data-later="1"><small>·</small>Пока вернуться в лагерь. Молот подождёт поперёк шва.</button>` : "");
    choicesEl.querySelectorAll("button").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.dataset.later) {
        state.postponed = true;
        postponeStoryScene(hero, sceneId);
        persist();
        close();
        return;
      }
      pick(options[Number(button.dataset.index)]);
    }));
  };
  const pick = (option) => {
    chooseStoryOption(hero, sceneId, option);
    persist();
    SFX.play("anvil");
    state.waitingChoice = false;
    choicesEl.innerHTML = "";
    state.queue = getStoryLines(hero, option.lines);
    state.afterChoice = true;
    advance();
  };
  const advance = () => {
    if (state.waitingChoice) return;
    if (state.typing) { finishTyping(); return; }
    const line = state.queue.shift();
    if (line) { showLine(line); return; }
    if (scene.choice && !state.afterChoice) showChoice();
    else close();
  };
  const skip = () => {
    clearInterval(StoryPlayer.timer);
    state.typing = false;
    state.queue = [];
    if (scene.choice && !state.afterChoice && !replay) showChoice();
    else close();
  };
  const onKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); skip(); return; }
    if (state.waitingChoice && /^[1-9]$/.test(event.key)) {
      const options = getStoryOptions(hero, scene.choice);
      const option = options[Number(event.key) - 1];
      if (option) { event.preventDefault(); event.stopPropagation(); pick(option); }
      return;
    }
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); event.stopPropagation(); advance(); }
  };
  layer.addEventListener("click", advance);
  layer.querySelector(".story-skip").addEventListener("click", (event) => { event.stopPropagation(); skip(); });
  document.addEventListener("keydown", onKey, true);
  SFX.play("click");
  advance();
}

// Scenes wait until the screen is calm: never over a fight, a result card or a dialog.
function maybePlayStory() {
  const hero = App.hero;
  if (hero && !hero.story?.queue?.length && !StoryPlayer.active) { promptBuildChoices(); return; }
  if (!hero?.story?.queue?.length || StoryPlayer.active) return;
  if (!["hub", "trail"].includes(App.screen) || document.querySelector(".modal-layer")) return;
  playStoryScene(hero.story.queue[0]);
}

function scheduleStory() {
  clearTimeout(StoryPlayer.wait);
  StoryPlayer.wait = setTimeout(maybePlayStory, 180);
}

// --- In the camp ---
function storyObjectiveCard() {
  const hero = App.hero;
  if (!hero.story) return "";
  const progress = getStoryProgress(hero);
  const anvil = hero.won && !hero.story.ending ? `<button class="btn primary" data-action="returnToAnvil" data-sound="anvil">Вернуться к наковальне</button>` : "";
  if (progress.finished) return `<section class="story-goal done"><span class="eyebrow">История завершена</span><h3>${esc(getStoryEndingTitle(hero))}</h3><p class="muted small">Логова и красные тропы остаются открытыми.</p></section>`;
  const chapter = progress.current;
  return `<section class="story-goal"><span class="eyebrow">Глава ${progress.currentIndex + 1}. ${esc(chapter.title)}</span>
    <ul>${chapter.objectives.filter((objective) => !objective.done).slice(0, 3).map((objective) => `<li class="${objective.optional ? "optional" : ""}"><i aria-hidden="true"></i>${esc(objective.text)}</li>`).join("")}</ul>
    ${witnessLine(hero)}${anvil}<button class="link-btn" data-action="journalStory">История: сделано ${chapter.objectives.filter((objective) => objective.done).length} из ${chapter.objectives.length}</button></section>`;
}

function witnessLine(hero) {
  const count = Array.from({ length: 8 }, (_, index) => `witness_${index + 1}`).filter((flag) => storyHasFlag(hero, flag)).length;
  return count ? `<p class="muted small">Свидетельства из логов: ${count} из 8.</p>` : "";
}

function getStoryEndingTitle(hero) {
  return STORY_ENDINGS.find((ending) => ending.id === hero.story?.ending)?.title || "Предел пройден";
}

Actions.returnToAnvil = () => playStoryScene("final:choice");
Actions.journalStory = () => { App.tab = "journal"; App.journalTab = "story"; render(); };
Actions.replayScene = (el) => playStoryScene(el.dataset.id, { replay: true, onDone: () => {} });

function viewStoryJournal() {
  const hero = App.hero;
  const progress = getStoryProgress(hero);
  const seen = new Set(hero.story.seen);
  const chapters = progress.chapters.map((chapter, index) => {
    if (index > progress.currentIndex && !chapter.parallel) return `<section class="panel story-chapter locked"><h3>Глава ${index + 1}</h3><p class="muted small">Откроется, когда дойдёшь до неё.</p></section>`;
    const scenes = (chapter.scenes || []).filter((id) => seen.has(id) && STORY_SCENES[id]);
    return `<section class="panel story-chapter"><h3>Глава ${index + 1}. ${esc(chapter.title)}</h3>
      <ul class="story-objectives">${chapter.objectives.map((objective) => `<li class="${objective.done ? "done" : ""}"><i aria-hidden="true">${objective.done ? "✓" : ""}</i>${esc(objective.text)}</li>`).join("")}</ul>
      ${scenes.length ? `<div class="story-scenes">${scenes.map((id) => `<button class="chip-btn" data-action="replayScene" data-id="${esc(id)}">${esc(STORY_SCENES[id].title || "Сцена")}</button>`).join("")}</div>` : ""}</section>`;
  }).join("");
  const people = STORY_CHARACTERS.filter((character) => [...seen].some((id) => (STORY_SCENES[id]?.lines || []).some((line) => line.who === character.id)));
  const bonuses = hero.story.bonuses;
  const lost = getLostMemories(hero);
  const witnesses = Object.keys(STORY_SCENES).filter((id) => seen.has(id) && STORY_SCENES[id].witness);
  const choices = Object.entries(hero.story.choices);
  return `${chapters}
    ${people.length ? `<section class="panel"><h3>Спутники</h3><div class="story-people">${people.map((character) => `<article><img src="assets/story/portrait_${character.id}.webp" alt=""><div><b>${esc(character.name)}</b><small class="muted">${esc(character.role)}</small></div></article>`).join("")}</div></section>` : ""}
    ${lost.length ? `<section class="panel"><h3>Что забрало Клеймо</h3><p class="muted small">Факты остаются. Этого больше нельзя почувствовать.</p><ul class="story-lost">${lost.map((memory) => `<li>${esc(memory.label)}</li>`).join("")}</ul></section>` : ""}
    ${witnesses.length ? `<section class="panel"><h3>Свидетельства логов: ${witnesses.length} из 8</h3>${witnesses.map((id) => `<p class="small">${esc(STORY_SCENES[id].witness)}</p>`).join("")}</section>` : ""}
    ${bonuses.length ? `<section class="panel"><h3>Что осталось от твоих решений</h3>${bonuses.map((bonus) => `<p class="small"><b>${esc(bonus.name)}.</b> ${esc(bonus.description)}</p>`).join("")}</section>` : ""}
    ${choices.length ? `<section class="panel"><h3>Сделанный выбор</h3>${choices.map(([id, label]) => `<p class="small"><span class="muted">${esc(STORY_SCENES[id]?.title || "")}:</span> ${esc(storyText(hero, label))}</p>`).join("")}</section>` : ""}`;
}

// --- People of the camp: a line from whoever runs this place, and it changes with what has happened ---
const CAMP_VOICES = {
  forge: { who: "kern", label: (hero) => (storyHasFlag(hero, "kern_anchor") ? "Керн · запись" : "Керн"), lines: [
    { ifNot: "kern_anchor", text: "Сначала ремень, потом беда. Показывай, что принесли." },
    { ifNot: "kern_anchor", text: "Реликвию не перекуёшь как подкову. В ней чьи-то движения. Уважай шов." },
    { if: "kern_release", text: "Спина болит как у обычного человека. Прекрасное ощущение, никому не советую." },
    { if: "kern_anchor", text: "Запись для учеников: косую заклёпку ставить на выдохе. Жар не торопить." },
    { if: "kern_anchor", text: "Запись для учеников: если вещь просит больше, чем стоит хозяин, отказать." }
  ] },
  shop: { who: "mot", label: () => "Мот", lines: [
    { text: "Цена честная. Честнее только счёт, который приходит потом." },
    { ifNot: "mot_decided", text: "О брате не шучу. Обо всём остальном можно и поторговаться." },
    { if: "mot_freed", text: "Скидка для тех, кто остался без хозяина. Записываю на Рута, он бы посмеялся." },
    { if: "mot_bound", text: "Да, за лавкой присматривают. Да, я это заслужил. Что будем брать?" }
  ] },
  lairs: { who: "sota", label: (hero) => (storyHasFlag(hero, "sota_index") ? "Сота · из книги" : "Сота"), lines: [
    { ifNot: "witness_1", text: "В логовах лежат вещи тех, кто шёл раньше. Запиши, как их звали, прежде чем надевать." },
    { if: "witness_1", ifNot: "shared_method", text: "Записи пока не сходятся. Значит, нужен следующий свидетель." },
    { if: "shared_method", text: "Все восемь свидетельств сходятся. Дальше логова нужны ради вещей, а не ради правды." },
    { if: "sota_index", text: "Пожалуйста, не ставь на меня чай. И читай вслух, я не вижу мелкий шрифт собственной жизни." }
  ] }
};

function campVoice(tab) {
  const voice = CAMP_VOICES[tab];
  const hero = App.hero;
  if (!voice || !hero?.story) return "";
  const lines = voice.lines.filter((line) => storyLineVisible(hero, line) && !(line.if2 && !storyHasFlag(hero, line.if2)));
  if (!lines.length) return "";
  const line = lines[Number(hero.records.expeditions || 0) % lines.length];
  return `<div class="camp-voice"><img src="assets/story/portrait_${voice.who}.webp" alt=""><p><b>${esc(voice.label(hero))}</b>${esc(line.text)}</p></div>`;
}
