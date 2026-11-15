// The companions in the camp: roster, formation, oaths, memories, the market; the first meeting and the forgetting.
const RANK_ROMAN = ["0", "I", "II", "III", "IV", "V"];

function companionPortrait(defId, extra = "") {
  return `<img class="comp-portrait ${extra}" src="assets/story/portrait_${esc(defId)}.webp" alt="" loading="lazy">`;
}

function companionsVisible(hero) {
  ensureCompanionState(hero);
  return hero.companions.length > 0 || hero.defeatedGuardians.includes("greyfang") || hero.companionLog.gone.length > 0;
}

function viewCompanions() {
  const hero = App.hero;
  ensureCompanionState(hero);
  const karma = Number(hero.karma || 0);
  const active = getActiveCompanion(hero);
  const left = Object.values(COMPANIONS).filter((def) => def.ready && !companionTaken(hero, def.id));
  const byRegion = REGIONS.map((region) => [region.name, left.filter((def) => def.region === region.id).length]).filter(([, n]) => n);
  const market = getMarketOffers(hero);
  return `<h2 class="section-title">${icon("heart")}Спутники</h2>
    <section class="panel comp-top">
      <div class="karma" data-tip="text|Свобода и Владение|Как ты обходишься с чужой волей. Свобода открывает убежища и добровольцев, Владение — закрытые торги. Сейчас: ${karma > 0 ? "+" : ""}${karma}.">
        <div class="karma-head"><span>Владение</span><b>${esc(getKarmaName(hero))}</b><span>Свобода</span></div>
        <div class="karma-bar"><i style="left:${50 + karma / 2}%"></i></div>
      </div>
      ${active ? `<div class="formation">
        <span class="muted small">Построение в бою</span>
        <div class="formation-row" role="group" aria-label="Построение">
          <button class="chip-btn${hero.party.allyFront ? " on" : ""}" data-action="compFront" data-front="1" ${hero.expedition ? "disabled" : ""}>${esc(getCompanionDef(active).name)} впереди</button>
          <button class="chip-btn${hero.party.allyFront ? "" : " on"}" data-action="compFront" data-front="0" ${hero.expedition ? "disabled" : ""}>Ты впереди</button>
        </div>
        <small class="muted">Ближние удары врагов достаются тому, кто впереди. Магия и выстрелы бьют переднего чаще.</small>
      </div>` : ""}
    </section>
    ${hero.companions.length ? `<div class="comp-grid">${hero.companions.map((c) => companionCard(hero, c)).join("")}</div>` : `<p class="muted">Пока с тобой никого нет. ${hero.defeatedGuardians.includes("greyfang") ? "" : "Первый человек встретится за Серым Клыком."}</p>`}
    ${market.length ? `<h2 class="section-title">${icon("gold")}Торг</h2>
      <p class="muted small">Здесь продают людей. ${market[0].closed ? "Закрытые торги: те, кто держит договоры, показывают лучших." : "Открытые прилавки."} Купленный по договору идёт в бой, но не даёт клятв и не верит тебе больше чем на 39. Выкупить и отпустить — дороже для совести рынка, но человек свободен.</p>
      <div class="market">${market.map((offer) => marketCard(hero, offer)).join("")}</div>` : isMarketOpen(hero) ? "" : `<p class="muted small">Торг откроется в Пепельных пустошах.</p>`}
    ${byRegion.length ? `<p class="muted small comp-ahead">Ещё встретятся: ${byRegion.map(([name, n]) => `${name} — ${n}`).join(", ")}.</p>` : ""}
    ${hero.companionLog.forgottenCount ? `<p class="muted small comp-ahead">Есть пустота, которую ты не можешь назвать${hero.companionLog.forgottenCount > 1 ? ` — ${hero.companionLog.forgottenCount}` : ""}.</p>` : ""}`;
}

function companionCard(hero, c) {
  const def = getCompanionDef(c);
  const cls = getCompanionClass(c);
  const role = COMPANION_ROLES[cls.role];
  const next = getNextRank(c);
  const oath = canTakeOath(c);
  const active = hero.party.activeId === c.id;
  const joint = JOINT_OPORA[hero.classKey];
  const jointOpen = jointUnlocked(hero, c);
  return `<article class="comp-card rarity-${c.rarity}${active ? " active" : ""}">
    <header>${companionPortrait(c.defId)}<div>
      <h3>${esc(def.name)}<small class="rarity-text-${c.rarity}">${esc(cls.name)}</small></h3>
      <p class="muted small">${esc(role.name)} · ранг ${RANK_ROMAN[c.rank]} «${esc(COMPANION_RANKS[c.rank].name)}»${c.legal === "contract" ? ' · <span class="warn-text">по договору</span>' : ""}</p>
      <p class="small comp-trait">${esc(def.trait)}</p>
    </div></header>
    <p class="small">${esc(cls.mechanic)}</p>
    <div class="comp-bars">
      <div data-tip="text|Доверие|Растёт за бои без падений, пройденные походы и выборы в пользу спутника. Открывает клятвы, воспоминания и связки."><span>Доверие</span>${bar(c.trust, 100, "exp", `${c.trust} / 100`)}</div>
      <div class="small muted">Поступков: ${c.deeds}${next ? ` · до ранга ${RANK_ROMAN[c.rank + 1]}: доверие ${next.trust}, поступки ${next.deeds}` : " · высший ранг"}</div>
      <div class="falls" data-tip="text|Нить Клейма|Три падения подряд — и человек исчезнет навсегда, а Клеймо заберёт память о нём. Любой бой, где спутник выстоял, обнуляет счёт.">${Array.from({ length: COMPANION_FALLS_TO_FORGET }, (_, i) => `<i class="${i < c.fallStreak ? "torn" : ""}"></i>`).join("")}<span class="small muted">${c.fallStreak ? `падений подряд: ${c.fallStreak}` : "нить цела"}</span></div>
    </div>
    ${companionSkillsBlock(c)}
    <div class="comp-control" role="group" aria-label="Кто решает в бою">
      <span class="small muted">В бою:</span>
      <button class="chip-btn${c.control === "manual" ? " on" : ""}" data-action="compControl" data-id="${esc(c.id)}" data-mode="manual">Решаешь ты</button>
      <button class="chip-btn${c.control === "auto" ? " on" : ""}" data-action="compControl" data-id="${esc(c.id)}" data-mode="auto">Сам решает</button>
    </div>
    ${c.habits.length ? `<div class="comp-chips">${c.habits.map((id) => `<span class="chip" data-tip="text|${esc(COMPANION_HABITS[id].name)}|Выучено, потому что ${esc(COMPANION_HABITS[id].learn)}. ${esc(COMPANION_HABITS[id].effect)}">${esc(COMPANION_HABITS[id].name)}</span>`).join("")}</div>` : ""}
    ${joint ? `<p class="small ${jointOpen ? "good-text" : "muted"}">Связка «${esc(joint.name)}»: ${jointOpen ? esc(joint.text) : `откроется на ${JOINT_UNLOCK.level} уровне, при доверии ${JOINT_UNLOCK.trust} и ранге ${RANK_ROMAN[JOINT_UNLOCK.rank]}`}</p>` : ""}
    ${c.memories.length ? `<div class="comp-memories">${c.memories.map((index) => `<button class="chip-btn" data-action="compMemory" data-id="${esc(c.id)}" data-index="${index}">${esc(def.memories[index].title)}</button>`).join("")}</div>` : ""}
    <div class="comp-actions">
      ${active ? '<span class="chip on">Идёт с тобой</span>' : `<button class="btn small" data-action="compActive" data-id="${esc(c.id)}" ${hero.expedition ? "disabled" : ""}>Взять в поход</button>`}
      ${next ? `<button class="btn small${oath.ok ? " primary" : ""}" data-action="compOath" data-id="${esc(c.id)}" ${oath.ok && !hero.expedition ? "" : "disabled"} data-tip="text|Клятва у костра|${esc(oath.ok ? `Ранг ${RANK_ROMAN[c.rank + 1]}: ${COMPANION_RANKS[c.rank + 1].gives}` : oath.reason)}">Клятва</button>` : ""}
      ${c.legal === "contract" ? `<button class="btn small" data-action="compTear" data-id="${esc(c.id)}">Разорвать договор</button>` : ""}
    </div>
  </article>`;
}

function marketCard(hero, offer) {
  const def = COMPANIONS[offer.defId];
  const cls = COMPANION_CLASSES[def.classId];
  const afford = hero.gold >= offer.price;
  return `<article class="market-card rarity-${offer.rarity}">
    ${companionPortrait(def.id)}
    <div><h3>${esc(def.name)} <small class="rarity-text-${offer.rarity}">${esc(cls.name)}</small></h3>
      <p class="small muted">${esc(COMPANION_ROLES[cls.role].name)} · ранг ${RANK_ROMAN[RARITY_START_RANK[offer.rarity]]} на старте · ${offer.price} золота</p>
      <p class="small"><i>«${esc(def.wish)}»</i></p>
      <div class="comp-actions">
        <button class="btn small primary" data-action="compBuy" data-id="${esc(def.id)}" data-keep="0" ${afford && !hero.expedition ? "" : "disabled"}>Выкупить и отпустить</button>
        <button class="btn small danger" data-action="compBuy" data-id="${esc(def.id)}" data-keep="1" ${afford && !hero.expedition ? "" : "disabled"}>Купить договор</button>
      </div>
    </div>
  </article>`;
}

// The companion's own skills: three branches, each skill known, ready to learn at the fire, or waiting for something.
function companionSkillIcon(skill) {
  return hasArt(`compskill_${skill.id}`) ? artImg(`compskill_${skill.id}`) : companionPortrait(skill.who, "mini");
}

function companionSkillsBlock(c) {
  ensureCompanionSkills(c);
  const skills = companionSkills(c.defId);
  if (!skills.length) return "";
  const res = COMPANION_RESOURCES[c.defId];
  const branches = [...new Set(skills.map((skill) => skill.branch))];
  const learned = skills.filter((skill) => c.learned.includes(skill.id)).length;
  const open = App.compOpen === c.id;
  return `<div class="comp-skills${open ? " open" : ""}">
    <button class="comp-skills-head" data-action="compSkills" data-id="${esc(c.id)}" aria-expanded="${open}">
      <span>Приёмы: ${learned} из ${skills.length}${res ? ` · ресурс «${esc(res.name)}»` : ""}</span>${skills.some((skill) => companionSkillState(c, skill).ready) ? '<i class="dot">!</i>' : ""}<b>${open ? "Свернуть" : "Открыть"}</b>
    </button>
    ${open ? `${res ? `<p class="small muted">${esc(res.name)}: ${esc(res.hint)}</p>` : ""}<div class="comp-branches">${branches.map((branch) => `<section class="comp-branch"><h4>${esc(branch)}</h4>${skills.filter((skill) => skill.branch === branch).map((skill) => {
      const state = companionSkillState(c, skill);
      const cls = state.learned ? "learned" : state.ready ? "ready" : "locked";
      return `<div class="comp-skill ${cls}"><span class="comp-skill-ic">${companionSkillIcon(skill)}</span><div><b>${esc(skill.name)}${skill.cost ? ` <small>${res?.percent ? `${skill.cost}%` : skill.cost} · ${skill.cd ? `перезарядка ${skill.cd}` : "без перезарядки"}</small>` : skill.cd ? ` <small>перезарядка ${skill.cd}</small>` : ""}</b><p>${esc(skill.text)}</p>${state.learned ? "" : `<p class="comp-need">${esc(state.text)}</p>`}</div>${state.ready ? `<button class="btn small primary" data-action="compLearn" data-id="${esc(c.id)}" data-skill="${skill.id}" ${App.hero.expedition ? "disabled" : ""}>Освоить</button>` : ""}</div>`;
    }).join("")}</section>`).join("")}</div>` : ""}
  </div>`;
}

Actions.compSkills = (el) => { App.compOpen = App.compOpen === el.dataset.id ? null : el.dataset.id; refreshKeepScroll(); };
Actions.compControl = (el) => { setCompanionControl(App.hero, el.dataset.id, el.dataset.mode); commit(); };
Actions.compLearn = (el) => {
  const result = learnCompanionSkill(App.hero, el.dataset.id, el.dataset.skill);
  if (!result.ok) { toast(result.reason, "warn"); return; }
  SFX.play("level");
  toast(`Освоено: «${result.skill.name}».`, "good");
  commit();
};

Actions.compFront = (el) => { setAllyFront(App.hero, el.dataset.front === "1"); commit(); };
Actions.compActive = (el) => {
  const result = setActiveCompanion(App.hero, el.dataset.id);
  if (!result.ok) { toast(result.reason, "warn"); return; }
  commit();
};
Actions.compOath = (el) => {
  const hero = App.hero;
  const c = hero.companions.find((entry) => entry.id === el.dataset.id);
  const result = takeOath(hero, el.dataset.id);
  if (!result.ok) { toast(result.reason, "warn"); return; }
  SFX.play("anvil");
  persist();
  const def = getCompanionDef(c);
  openModal(`<div class="comp-scene">${companionPortrait(def.id, "big")}<div><h2>Клятва у костра</h2><p class="comp-quote">${esc(result.line)}</p><p class="muted">${esc(def.name)}: ранг ${RANK_ROMAN[result.rank]} «${esc(COMPANION_RANKS[result.rank].name)}». ${esc(COMPANION_RANKS[result.rank].gives)}</p><div class="modal-actions"><button class="btn primary" data-action="closeModal" data-autofocus>Дальше</button></div></div></div>`);
  refreshKeepScroll();
};
Actions.compTear = async (el) => {
  const ok = await confirmDialog({ title: "Разорвать договор?", text: "Человек станет свободен и сам решит, остаться ли с тобой. Доверие больше не будет ограничено.", confirmLabel: "Разорвать" });
  if (!ok) return;
  tearContract(App.hero, el.dataset.id);
  commit();
};
Actions.compMemory = (el) => {
  const c = App.hero.companions.find((entry) => entry.id === el.dataset.id);
  const def = getCompanionDef(c);
  const memory = def?.memories?.[Number(el.dataset.index)];
  if (!memory) return;
  openModal(`<div class="comp-scene">${companionPortrait(def.id, "big")}<div><h2>${esc(memory.title)}</h2><p>${esc(memory.text)}</p><div class="modal-actions"><button class="btn primary" data-action="closeModal" data-autofocus>Закрыть</button></div></div></div>`);
};
Actions.compBuy = async (el) => {
  const keep = el.dataset.keep === "1";
  const def = COMPANIONS[el.dataset.id];
  const ok = await confirmDialog(keep
    ? { title: `Купить договор на ${def.name}?`, text: "Свобода −15. Этот человек будет идти в бой по договору: без клятв, без связок, доверие не выше 39. В лагере это заметят.", confirmLabel: "Купить договор", danger: true }
    : { title: `Выкупить ${def.name}?`, text: "Свобода +4. Ты платишь рынку, но человек выходит свободным и сам решает остаться с тобой.", confirmLabel: "Выкупить" });
  if (!ok) return;
  const result = buyContract(App.hero, def.id, keep);
  if (!result.ok) { toast(result.reason, "warn"); return; }
  SFX.play("loot");
  toast(keep ? `${def.name}: договор у тебя.` : `${def.name} выходит свободным человеком и идёт с тобой.`, keep ? "warn" : "good");
  commit();
};

// The first companion: after the Thicket's guardian, once the story has had its say.
function maybeMeetCompanion() {
  const hero = App.hero;
  if (!hero || App.screen !== "hub" || hero.expedition || StoryPlayer.active || (hero.story?.queue || []).length || document.querySelector(".modal-layer, .story-layer, .memory-loss")) return;
  const def = getPendingMeeting(hero);
  if (!def) return;
  openModal(`<div class="comp-scene">${companionPortrait(def.id, "big")}<div>
    <h2>Встреча на дороге</h2><p>${esc(def.meet)}</p><p class="comp-quote">${esc(def.join)}</p>
    <p class="muted small">${esc(COMPANION_CLASSES[def.classId].name)}: ${esc(COMPANION_CLASSES[def.classId].mechanic)}</p>
    <div class="modal-actions"><button class="btn primary big" data-action="meetCompanion" data-id="${esc(def.id)}" data-autofocus>Идём вместе</button></div>
  </div></div>`, { dismissable: false });
}

Actions.meetCompanion = (el) => {
  const hero = App.hero;
  const def = COMPANIONS[el.dataset.id];
  recruitCompanion(hero, def.id, { rarity: roll(0.3) ? def.rarities[def.rarities.length - 1] : def.rarities[0] });
  persist();
  closeModal();
  SFX.play("level");
  toast(`${def.name} теперь с тобой. Загляни во вкладку «Спутники».`, "good");
  App.tab = "companions";
  refreshKeepScroll();
};

// The thread is torn: the person is gone, and so is the name.
function showCompanionForgotten() {
  const layer = document.createElement("div");
  layer.className = "memory-loss forgotten";
  layer.innerHTML = `<small>Нить попутчика рвётся</small><p>Имя держится на языке.</p><p class="sub">Клеймо остывает. Ты уже не знаешь, что хочешь сказать.</p>`;
  document.body.appendChild(layer);
  const finish = () => { layer.classList.add("out"); setTimeout(() => layer.remove(), 420); };
  setTimeout(finish, 4200);
  layer.addEventListener("click", finish);
}

// At the fire: the companion who walks with you speaks about the last return.
function companionFireLine(hero) {
  const c = getActiveCompanion(hero);
  if (!c) return null;
  const def = getCompanionDef(c);
  const trip = hero.story?.lastTrip;
  let text = def.lines[Number(trip?.n || 0) % def.lines.length];
  if (c.fallStreak > 0) text = def.after.fall;
  else if (trip?.outcome === "death") text = def.after.death;
  else if (trip?.outcome === "complete") text = def.after.win;
  return { id: c.defId, name: def.name, text };
}
