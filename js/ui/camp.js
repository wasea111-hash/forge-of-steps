// The fire in the camp: the people sit around it and answer what has just happened. The lines live in js/core/camp.js.
function campFire() {
  const hero = App.hero;
  if (!hero?.story) return "";
  const seed = Number(hero.story.lastTrip?.n || 0);
  // A new return: the one who has something to say about it speaks first again.
  if (App.campSeed !== seed) { App.campSeed = seed; App.campWho = null; App.campTurn = 0; }
  const talk = getCampTalk(hero, App.campWho, App.campTurn || 0);
  if (!talk || !talk.text) return "";
  const names = Object.fromEntries(STORY_CHARACTERS.map((character) => [character.id, character]));
  const speaker = names[talk.speaker];
  return `<section class="campfire${talk.answered ? " answered" : ""}" aria-label="У костра">
    <span class="campfire-glow" aria-hidden="true"></span>
    <div class="campfire-speaker">
      <img src="assets/story/portrait_${talk.speaker}.webp" alt="">
      <p class="campfire-say" aria-live="polite"><b>${esc(speaker?.name || "")}</b><span>${esc(talk.text)}</span></p>
    </div>
    <div class="campfire-people">${talk.people.map((id) => `<button class="campfire-face${id === talk.speaker ? " speaking" : ""}" data-action="campTalk" data-who="${id}" data-sound="select" data-tip="text|${esc(names[id]?.name || "")}|${esc(names[id]?.role || "")}"><img src="assets/story/portrait_${id}.webp" alt="${esc(names[id]?.name || "")}"></button>`).join("")}</div>
  </section>`;
}

Actions.campTalk = (el) => {
  const who = el.dataset.who;
  const speaking = App.campWho || getCampTalk(App.hero, null, 0)?.speaker;
  // Asking the same person again goes on to their next line.
  App.campTurn = who === speaking ? (App.campTurn || 0) + 1 : 0;
  App.campWho = who;
  refreshKeepScroll();
};

// --- The key of Lozhkino: it keeps the doorstep, and each death of the Brand cracks it a little more ---
const KEY_CRACKS = ["M30 18l6 7-3 5", "M50 40l-5 6 3 6", "M22 44l7 2 2 7", "M60 22l-4 8 4 3", "M40 30l3 7-4 6", "M70 50l-6 2-2 6", "M34 60l5-4 6 3", "M56 64l-3-6-6 1", "M44 12l-2 7 5 4"];
function memoryKey(hero) {
  if (!hero.story) return "";
  const lost = getLostMemories(hero);
  const kept = STORY_MEMORIES.length - lost.length;
  const body = lost.length ? `Клеймо уже забрало: ${lost.map((memory) => memory.label.toLowerCase()).join(" · ")}. Факты остаются, ощущения — нет.` : "Ключ держит оттиск порога. Пока ты помнишь Ложкино, дорога туда существует.";
  return `<button class="memory-key" style="--kept:${(kept / STORY_MEMORIES.length).toFixed(2)}" data-action="hubTab" data-tab="journal" aria-label="Ключ от Ложкина" data-tip="text|Ключ от Ложкина · ${kept} из ${STORY_MEMORIES.length}|${esc(body)}">
    ${hasArt("memory_key") ? `<img src="assets/img/memory_key.webp" alt="">` : icon("key")}
    <svg viewBox="0 0 80 80" aria-hidden="true">${KEY_CRACKS.slice(0, lost.length).map((d) => `<path d="${d}"/>`).join("")}</svg>
    <span class="memory-key-text"><b>Ложкино</b><small>${kept ? `помнишь ${kept} из ${STORY_MEMORIES.length}` : "только факты"}</small></span>
  </button>`;
}

// The moment the Brand takes a feeling: its name stands for a breath, then falls apart into ash.
function afterMemoryLoss(hero, lostBefore, done) {
  const lost = getLostMemories(hero);
  if (lost.length <= lostBefore) { done(); return; }
  const label = lost[lost.length - 1].label;
  const layer = document.createElement("div");
  layer.className = "memory-loss";
  layer.innerHTML = `<small>Клеймо возвращает тебя и забирает</small><p>${[...label].map((char, i) => `<span style="--i:${i};--dx:${(Math.random() * 60 - 30).toFixed(0)}px;--dy:${(-40 - Math.random() * 70).toFixed(0)}px">${char === " " ? "&nbsp;" : esc(char)}</span>`).join("")}</p><em>Это больше не почувствовать.</em>`;
  document.body.appendChild(layer);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    layer.classList.add("out");
    setTimeout(() => { layer.remove(); done(); }, 420);
  };
  setTimeout(() => layer.classList.add("crumble"), 1400);
  setTimeout(finish, 1400 + label.length * 45 + 1500);
  layer.addEventListener("click", finish);
}
