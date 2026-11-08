// The hero's build on screen: points, styles, ultimates, skill forms and the talent boards.
const ULT_STAGE_NAMES = { class: "Класс", subclass: "Подкласс", profession: "Профессия" };

function ultArtId(ult) {
  return `ult_${String(ult?.id || "").replace(/:/g, "_")}`;
}

function ultIcon(ult, hero) {
  if (hasArt(ultArtId(ult))) return artImg(ultArtId(ult));
  if (hasArt(`ult_${hero.classKey}`)) return artImg(`ult_${hero.classKey}`);
  return icon("elite");
}

function devPointsChip(hero) {
  const free = getDevPointsFree(hero);
  const total = getDevPointsTotal(hero);
  const tip = `Очко за каждые 2 уровня и ${DEV_POINTS_PER_GUARDIAN} за каждого из первых ${DEV_POINTS_GUARDIANS} побеждённых стражей. Формы навыков и таланты тратят один бюджет, поэтому всё взять нельзя.`;
  return `<span class="chip ${free > 0 ? "accent" : ""}" data-tip="text|Очки развития|${esc(tip)}">Очков развития: ${free} из ${total}</span>`;
}

function rebuildNote(hero) {
  return hero.freeRespec ? `<span class="chip gold" data-tip="text|Бесплатная пересборка|Дерево изменилось, поэтому первая пересборка этому герою бесплатна.">Пересборка бесплатна</span>` : "";
}

// --- Styles ---
function styleCards(hero) {
  const styles = getClassStyles(hero.classKey);
  if (!styles.length) return "";
  const open = hero.level >= STYLE_UNLOCK_LEVEL;
  const step = getStyleStep(hero.level);
  const steps = STYLE_STEPS.map((entry, index) => `<i class="${index <= step ? "on" : ""}" title="${entry.level} уровень"></i>`).join("");
  const current = getHeroStyle(hero);
  const unfolded = App.buildOpen === "style" || (open && !current);
  return `<section class="panel build-block${unfolded ? " unfolded" : ""}">
    <button class="build-summary" data-action="buildFold" data-id="style"><h2>Стиль боя</h2><b>${current ? esc(current.name) : open ? "Не выбран" : `С ${STYLE_UNLOCK_LEVEL} уровня`}</b><small class="muted">${open ? "Как ты ведёшь каждый обмен ходами. Растёт на 12, 20 и 28 уровне." : "Выбор одного из трёх правил боя."}</small><i aria-hidden="true">${unfolded ? "▲" : "▼"}</i></button>
    <div class="build-cards">${styles.map((style) => {
      const worn = hero.styleId === style.id;
      const cost = hero.styleId && !worn && !hero.freeRespec ? respecCost(hero) : 0;
      return `<button class="build-card${worn ? " is-worn" : ""}" data-action="pickStyle" data-id="${esc(style.id)}" ${open && !worn && !hero.expedition ? "" : "disabled"}>
        <strong>${esc(style.name)}</strong><small>${esc(style.description)}</small>
        <span class="build-foot">${worn ? `Твой стиль <em class="style-steps">${steps}</em>` : !open ? `С ${STYLE_UNLOCK_LEVEL} уровня` : cost ? `Сменить за ${cost} золота` : "Выбрать"}</span>
      </button>`;
    }).join("")}</div></section>`;
}

Actions.buildFold = (el) => { App.buildOpen = App.buildOpen === el.dataset.id ? null : el.dataset.id; refreshKeepScroll(); };

Actions.pickStyle = async (el) => {
  const hero = App.hero;
  const cost = hero.styleId && !hero.freeRespec ? respecCost(hero) : 0;
  if (cost) {
    const ok = await confirmDialog({ title: "Сменить стиль?", text: `Это стоит ${cost} золота.`, confirmLabel: "Сменить" });
    if (!ok) return;
  }
  if (notifyResult(chooseStyle(hero, el.dataset.id), "Стиль выбран.")) {
    SFX.play("anvil");
    if (document.querySelector(".modal-layer")) closeModal();
    commit();
  }
};

// --- Ultimates ---
function ultCard(hero, ult) {
  const worn = getHeroUltimate(hero)?.id === ult.id;
  return `<button class="build-card ult-card${worn ? " is-worn" : ""}" data-action="pickUltimate" data-id="${esc(ult.id)}" ${worn || hero.expedition ? "disabled" : ""}>
    <span class="ult-card-art">${ultIcon(ult, hero)}</span>
    <span class="ult-card-text"><strong>${esc(ult.name)}</strong><small>${esc(ult.description)}</small><span class="build-foot">${worn ? "В руке" : "Взять"}</span></span>
  </button>`;
}

function ultimateBlock(hero) {
  if (hero.level < ULTIMATE_LEVEL) return `<section class="panel build-block"><div class="build-summary"><h2>Ультимейт</h2><b>С ${ULTIMATE_LEVEL} уровня</b><small class="muted">Две новинки на выбор, ещё по две на ${SUBCLASS_UNLOCK_LEVEL} и ${PROFESSION_UNLOCK_LEVEL} уровне.</small></div></section>`;
  const groups = getUltimateGroups(hero);
  const next = hero.subclass ? (hero.profession ? null : `профессия на ${PROFESSION_UNLOCK_LEVEL} уровне`) : `подкласс на ${SUBCLASS_UNLOCK_LEVEL} уровне`;
  const unfolded = App.buildOpen === "ult";
  return `<section class="panel build-block${unfolded ? " unfolded" : ""}">
    <button class="build-summary" data-action="buildFold" data-id="ult"><h2>Ультимейт</h2><b>${esc(getHeroUltimate(hero)?.name || "")}</b><small class="muted">В руке один, менять можно бесплатно между походами.${next ? ` Ещё два принесёт ${next}.` : ""}</small><i aria-hidden="true">${unfolded ? "▲" : "▼"}</i></button>
    ${[...groups].reverse().map((group) => `<small class="build-group">${esc(ULT_STAGE_NAMES[group.stage])}</small><div class="build-cards two">${group.options.map((ult) => ultCard(hero, ult)).join("")}</div>`).join("")}
  </section>`;
}

Actions.pickUltimate = (el) => {
  const hero = App.hero;
  const pending = getPendingUltimateChoice(hero);
  const result = chooseUltimate(hero, el.dataset.id);
  if (!notifyResult(result, `В руке: ${ULT_OPTIONS[el.dataset.id]?.name}.`)) return;
  if (pending) markUltimateSeen(hero, pending.owner);
  SFX.play("anvil");
  if (document.querySelector(".modal-layer")) closeModal();
  commit();
};

// A new pair is met with a question, not found by accident in a menu.
function openUltimateChoice(group) {
  const hero = App.hero;
  const worn = getHeroUltimate(hero);
  const canKeep = worn && worn.owner !== group.owner;
  openModal(`<span class="eyebrow">${esc(ULT_STAGE_NAMES[group.stage])}: новый ультимейт</span>
    <h2 class="result-title">Какой взять в руку?</h2>
    <p class="muted">Менять можно бесплатно между походами, так что это не навсегда.</p>
    <div class="build-cards two">${group.options.map((ult) => ultCard(hero, ult)).join("")}</div>
    <div class="modal-actions">${canKeep ? `<button class="btn" data-action="keepUltimate" data-owner="${esc(group.owner)}">Оставить «${esc(worn.name)}»</button>` : ""}</div>`, { wide: true });
}

Actions.keepUltimate = (el) => {
  markUltimateSeen(App.hero, el.dataset.owner);
  closeModal();
  commit();
};

// Asked only when nothing else is on screen, after the story has spoken.
function promptBuildChoices() {
  const hero = App.hero;
  if (!hero || App.screen !== "hub" || hero.expedition || document.querySelector(".modal-layer") || StoryPlayer.active) return;
  const pendingPick = getPendingTreePick(hero);
  if (pendingPick) { openTreePickChoice(pendingPick); return; }
  const pending = getPendingUltimateChoice(hero);
  if (pending) { openUltimateChoice(pending); return; }
  if (hero.level >= STYLE_UNLOCK_LEVEL && !hero.styleId && !hero.records.stylePrompted) {
    hero.records.stylePrompted = true;
    persist();
    openModal(`<span class="eyebrow">Первый настоящий выбор</span><h2 class="result-title">Какой у тебя стиль боя?</h2>
      <p class="muted">Стиль определяет, как ты ведёшь каждый обмен ходами. Он работает с любым подклассом и растёт вместе с тобой.</p>
      <div class="build-cards">${getClassStyles(hero.classKey).map((style) => `<button class="build-card" data-action="pickStyle" data-id="${esc(style.id)}"><strong>${esc(style.name)}</strong><small>${esc(style.description)}</small><span class="build-foot">Выбрать</span></button>`).join("")}</div>
      <div class="modal-actions"><button class="btn" data-action="closeModal">Решу позже</button></div>`, { wide: true });
  }
}

// --- Forms in the side panel of the tree ---
function skillNumbers(hero, skill) {
  const parts = [];
  if (skill.attackType) parts.push(`Сила ${Math.round(Number(skill.powerMultiplier || 1) * 100)}%${Number(skill.hits || 1) > 1 ? ` × ${skill.hits}` : ""}`);
  if (skill.aoe) parts.push(`По группе ${Math.round(skill.aoe * 100)}%`);
  if (Number(skill.resourceCost || 0)) parts.push(`Цена ${getSkillResourceCost(skill, hero)}`);
  parts.push(`Откат ${Number(skill.cooldown || 0)}`);
  if (Number(skill.tempo || 1) !== 1) parts.push(`Темп ${skill.tempo}`);
  if (skill.pierce) parts.push(`Пробивание ${skill.pierce}`);
  return parts.join(" · ");
}

function skillFormPanel(hero, skill) {
  const forms = getSkillForms(skill.id);
  if (!forms.length) return "";
  const current = hero.skillForms?.[skill.id] || null;
  const open = doesSkillMatchBranch(skill, hero) && Number(skill.unlockLevel || 1) <= hero.level;
  return `<div class="form-panel"><h4>Форма навыка <small class="muted">1 очко, можно только одну</small></h4>
    <div class="form-card${current ? "" : " is-worn"}"><strong>Обычная</strong><small>${esc(skillNumbers(hero, skill))}</small>${current && open ? `<button class="btn small" data-action="clearForm" data-id="${esc(skill.id)}">Вернуть обычную</button>` : ""}</div>
    ${forms.map((form) => {
      const worn = current === form.id;
      const check = open ? canChooseForm(hero, skill.id, form.id) : { ok: false, reason: "Сначала открой этот навык." };
      const label = worn ? "Выбрана" : check.ok ? (check.cost ? `Сменить за ${check.cost} золота` : current ? "Сменить бесплатно" : "Выбрать за 1 очко") : check.reason;
      return `<div class="form-card${worn ? " is-worn" : ""}${current && !worn ? " other" : ""}"><strong>${esc(form.name)}</strong><span>${esc(form.description)}</span><small>${esc(skillNumbers(hero, applySkillForm(skill, form)))}</small>
        ${worn ? `<span class="tag on">Выбрана</span>` : `<button class="btn small${check.ok ? " primary" : ""}" data-action="pickForm" data-skill="${esc(skill.id)}" data-id="${esc(form.id)}" ${check.ok ? "" : "disabled"}>${esc(label)}</button>`}</div>`;
    }).join("")}</div>`;
}

Actions.pickForm = async (el) => {
  const hero = App.hero;
  const check = canChooseForm(hero, el.dataset.skill, el.dataset.id);
  if (check.ok && check.cost) {
    const ok = await confirmDialog({ title: "Сменить форму?", text: `Это стоит ${check.cost} золота.`, confirmLabel: "Сменить" });
    if (!ok) return;
  }
  if (notifyResult(chooseSkillForm(hero, el.dataset.skill, el.dataset.id), "Форма выбрана.")) { SFX.play("level"); commit(); }
};
Actions.clearForm = async (el) => {
  const hero = App.hero;
  const cost = hero.freeRespec ? 0 : respecCost(hero);
  if (cost) {
    const ok = await confirmDialog({ title: "Вернуть обычный навык?", text: `Очко вернётся, а смена стоит ${cost} золота.`, confirmLabel: "Вернуть" });
    if (!ok) return;
  }
  if (notifyResult(clearSkillForm(hero, el.dataset.id), "Навык снова обычный.")) commit();
};

// --- The talent board ---
const BOARD_TIER_NAMES = { 1: "Первый круг", 2: "Второй круг", 3: "Третий круг", 4: "Ключевой" };

function boardPosition(school, slot) {
  const row = school.slots.filter((entry) => entry.tier === slot.tier);
  return { x: ((row.indexOf(slot) + 0.5) / row.length) * 100, y: ((slot.tier - 0.5) / 4) * 100 };
}

function boardSlotHtml(hero, school, slot) {
  const talentId = resolveSlotTalent(hero, slot);
  const def = TALENTS[talentId];
  const state = getSlotState(hero, school, slot);
  const taken = isSlotTaken(hero, slot);
  const pos = boardPosition(school, slot);
  const waiting = slot.module && talentId === slot.talent;
  const badge = slot.module ? `<em class="slot-module">${slot.module.stage === "profession" ? "Профессия" : "Подкласс"}${waiting ? ": заменится" : ""}</em>` : "";
  return `<button class="board-slot tier-${slot.tier} ${taken ? "taken" : state.ok ? "open" : "closed"}" style="left:${pos.x}%;top:${pos.y}%" data-action="takeTalent" data-id="${esc(talentId)}" data-tip="talent|${esc(talentId)}" ${state.ok ? "" : "disabled"} aria-pressed="${taken}">
    ${badge}<strong>${esc(def.name)}</strong><small>${esc(def.description)}</small>
    <span class="slot-foot">${taken ? "Взят" : state.ok ? `Взять за ${getSlotCost(slot)}` : esc(state.reason)}</span>
  </button>`;
}

function viewTalentBoard() {
  const hero = App.hero;
  const board = getTalentBoard(hero);
  if (!board.some((school) => school.id === App.talentSchool)) App.talentSchool = board[0]?.id;
  const school = board.find((entry) => entry.id === App.talentSchool);
  const depth = getSchoolDepth(hero, school);
  const nextDepth = [TALENT_DEPTH[2], TALENT_DEPTH[3], TALENT_DEPTH[4]].find((value) => value > depth);
  const tier3 = school.slots.filter((slot) => slot.tier === 3 && isSlotTaken(hero, slot)).length;
  const lines = school.slots.flatMap((slot) => (slot.afterAny || []).map((key) => {
    const parent = school.slots.find((entry) => entry.key === key);
    const a = boardPosition(school, parent);
    const b = boardPosition(school, slot);
    const on = isSlotTaken(hero, parent) && isSlotTaken(hero, slot);
    const next = isSlotTaken(hero, parent) && !isSlotTaken(hero, slot);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${on ? "on" : next ? "next" : ""}" vector-effect="non-scaling-stroke"/>`;
  })).join("");
  return `<section class="panel talent-head">
    <div class="talent-stats">${devPointsChip(hero)}${rebuildNote(hero)}
      <span class="chip" data-tip="text|Ключевые таланты|Огромная сила с настоящей платой. Один на героя, второй с ${PROFESSION_UNLOCK_LEVEL} уровня, и не больше одного в школе.">Ключевых: ${getBoardKeystoneCount(hero)} из ${getBoardKeystoneLimit(hero)}</span></div>
    <div class="row-gap">
      <button class="btn small" data-action="talentAuto" ${getDevPointsFree(hero) > 0 && !hero.expedition ? "" : "disabled"}>Подобрать за меня</button>
      <button class="btn small" data-action="talentReset" ${(hero.talents.length || Object.keys(hero.skillForms || {}).length) && !hero.expedition ? "" : "disabled"}>${hero.freeRespec ? "Сбросить бесплатно" : `Сбросить за ${respecCost(hero)} золота`}</button>
    </div>
  </section>
  <div class="talent-layout">
    <nav class="school-list" aria-label="Школы талантов">
      ${board.map((entry) => `<button class="school-btn${entry.id === App.talentSchool ? " active" : ""}" data-action="talentSchool" data-id="${esc(entry.id)}"><strong>${esc(entry.name)}</strong><small>Вложено: ${getSchoolDepth(hero, entry)}</small></button>`).join("")}
    </nav>
    <section class="panel talent-board">
      <div class="panel-head"><h2>${esc(school.name)}</h2><span class="chip">Вложено: ${depth}${nextDepth ? ` · следующий круг на ${nextDepth}` : ""}</span></div>
      <p class="muted small">${esc(school.description)} Третий круг: ${tier3} из ${TALENT_TIER3_LIMIT}.</p>
      <div class="board-canvas">
        <svg class="board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
        ${[1, 2, 3, 4].map((tier) => `<small class="board-tier" style="top:${((tier - 1) / 4) * 100}%">${BOARD_TIER_NAMES[tier]}${TALENT_TIER_LEVEL[tier] > 1 ? `, ${TALENT_TIER_LEVEL[tier]} ур.` : ""}</small>`).join("")}
        ${school.slots.map((slot) => boardSlotHtml(hero, school, slot)).join("")}
      </div>
    </section>
  </div>`;
}

// --- The tree of choices: at each step one skill from a few, and the lanes mean different ways to fight ---
const CHOICE_TREE = { laneGap: 92, step: 104, head: 142, left: 214, rowHeight: 126, optionGap: 60 };

function choiceTreeLayout(hero) {
  const tree = getSkillTree(hero);
  const catalog = getBranchCatalog(hero.classKey);
  const nodes = [];
  const links = [];
  const classStage = tree.stages.find((stage) => stage.stage === "class");
  const laneCount = tree.lanes.length;
  const baseY = 86;
  const rowHeight = CHOICE_TREE.rowHeight;
  const rows = Math.max(1, Object.values(catalog.professions).length);
  // The lanes of the class stand level with the middle of the paths they lead to.
  const topY = baseY + ((rows - 1) / 2) * rowHeight - ((laneCount - 1) / 2) * CHOICE_TREE.laneGap;
  const trunkY = (lane) => topY + lane * CHOICE_TREE.laneGap;
  tree.lanes.forEach((lane, index) => nodes.push({ id: `lane-${index}`, kind: "lane", name: lane.name, description: lane.description, x: 92, y: trunkY(index) }));
  const placeStage = (stage, startX, y0, gap, heads = []) => {
    let previous = heads;
    stage.tiers.forEach((tier, column) => {
      const x = startX + column * CHOICE_TREE.step;
      const here = tier.options.map((id, lane) => {
        const node = { id: `p-${treeTierKey(stage, tier)}-${lane}`, kind: "pick", stage, tier, lane, skill: getSkillDefinition(id), x, y: y0 + lane * gap, picked: getTreePick(hero, stage, tier) === id };
        nodes.push(node);
        return node;
      });
      if (previous.length) here.forEach((node) => previous.filter((from) => from.lane === node.lane || previous.length === 1 || from.head).forEach((from) => links.push({ from: from.id, to: node.id })));
      previous = here;
      if (column === 0 && !heads.length) previous = here;
    });
    return previous;
  };
  const trunkEnd = placeStage(classStage, CHOICE_TREE.left, topY, CHOICE_TREE.laneGap);
  const trunkX = CHOICE_TREE.left + classStage.tiers.length * CHOICE_TREE.step;
  let row = 0;
  const subs = Object.values(catalog.subclasses);
  const profsOf = (sub) => Object.values(catalog.professions).filter((prof) => prof.subclassId === sub.id);
  subs.forEach((sub) => {
    const profs = profsOf(sub);
    const y = baseY + (row + (profs.length - 1) / 2) * rowHeight;
    const head = { id: `h-${sub.id}`, kind: "subclass", x: trunkX + 30, y, name: sub.name, branchId: sub.id, lookId: `look_${sub.id}`, head: true };
    nodes.push(head);
    trunkEnd.forEach((from) => links.push({ from: from.id, to: head.id }));
    const subStage = tree.stages.find((stage) => stage.owner === sub.id);
    const subEnd = subStage ? placeStage(subStage, head.x + CHOICE_TREE.head - 30, y - CHOICE_TREE.optionGap / 2, CHOICE_TREE.optionGap, [head]) : [head];
    const subX = head.x + CHOICE_TREE.head - 30 + (subStage?.tiers.length || 0) * CHOICE_TREE.step;
    profs.forEach((prof, index) => {
      const py = baseY + (row + index) * rowHeight;
      const profHead = { id: `h-${prof.id}`, kind: "profession", x: subX + 20, y: py, name: prof.name, branchId: prof.id, lookId: `look_${prof.id}`, head: true };
      nodes.push(profHead);
      subEnd.forEach((from) => links.push({ from: from.id, to: profHead.id }));
      const profStage = tree.stages.find((stage) => stage.owner === prof.id);
      if (profStage) placeStage(profStage, profHead.x + CHOICE_TREE.head - 30, py - CHOICE_TREE.optionGap / 2, CHOICE_TREE.optionGap, [profHead]);
    });
    row += Math.max(1, profs.length);
  });
  return { nodes, links, width: Math.max(...nodes.map((node) => node.x)) + 110, height: Math.max(trunkY(laneCount - 1) + 70, baseY + (row - 1) * rowHeight + 86) };
}

function pickNodeHtml(hero, node, style) {
  const skill = node.skill;
  const inPath = getTreeStages(hero).includes(node.stage);
  const picked = inPath && node.picked;
  const other = inPath && getTreePick(hero, node.stage, node.tier) && !picked;
  const state = inPath ? getTreeOptionState(hero, node.stage, node.tier, skill.id) : { ok: false };
  const ready = !getTreePick(hero, node.stage, node.tier) && state.ok;
  const slotted = hero.activeSkillSlots.includes(skill.id);
  return `<button class="tree-node pick ${skill.category === "passive" ? "passive" : "active"} ${picked ? "learned" : ready ? "ready" : "shut"}${other ? " rejected" : ""}${inPath ? "" : " foreign"}${App.treePick === skill.id ? " picked" : ""}${slotted ? " slotted" : ""}" style="${style}" data-action="treePick" data-id="${esc(skill.id)}" data-tip="skill|${esc(skill.id)}" aria-label="${esc(skill.name)}">${skillIcon(skill)}<i>${node.tier.level}</i></button>`;
}

function findTreePlace(hero, skillId) {
  for (const stage of getSkillTree(hero)?.stages || []) {
    for (const tier of stage.tiers) if (tier.options.includes(skillId)) return { stage, tier };
  }
  return null;
}

// Side panel: the tier's choices side by side, so the decision is made comparing, not guessing.
function treeChoicePanel(hero, skillId) {
  const place = findTreePlace(hero, skillId);
  if (!place) return "";
  const { stage, tier } = place;
  const open = getTreeStages(hero).includes(stage);
  const lanes = getSkillTree(hero).lanes || [];
  return `<div class="form-panel"><h4>Выбор ${tier.level} уровня <small class="muted">берётся один</small></h4>
    ${tier.options.map((id, lane) => {
      const skill = getSkillDefinition(id);
      const state = open ? getTreeOptionState(hero, stage, tier, id) : { ok: false, reason: "Это другой путь." };
      return `<div class="form-card${state.taken ? " is-worn" : ""}${id === skillId ? " focus" : ""}"><strong>${esc(skill.name)}</strong>${stage.stage === "class" && lanes[lane] ? `<small class="accent-text">${esc(lanes[lane].name)}</small>` : ""}<span>${esc(skill.description)}</span>${skill.category === "active" ? `<small>${esc(skillNumbers(hero, skill))}</small>` : `<small>Действует постоянно</small>`}
        ${state.taken ? `<span class="tag on">Выбран</span>` : `<button class="btn small${state.ok ? " primary" : ""}" data-action="pickTreeSkill" data-owner="${esc(stage.owner)}" data-level="${tier.level}" data-id="${esc(id)}" ${state.ok ? "" : "disabled"}>${esc(state.ok ? (state.cost ? `Сменить за ${state.cost} золота` : "Выбрать") : state.reason)}</button>`}</div>`;
    }).join("")}</div>`;
}

Actions.pickTreeSkill = async (el) => {
  const hero = App.hero;
  const stage = getSkillTree(hero).stages.find((entry) => entry.owner === el.dataset.owner);
  const tier = stage.tiers.find((entry) => entry.level === Number(el.dataset.level));
  const check = getTreeOptionState(hero, stage, tier, el.dataset.id);
  if (check.ok && check.cost) {
    const ok = await confirmDialog({ title: "Сменить навык?", text: `Это стоит ${check.cost} золота.`, confirmLabel: "Сменить" });
    if (!ok) return;
  }
  if (notifyResult(chooseTreeSkill(hero, stage, tier, el.dataset.id), `Новый навык: ${getSkillDefinition(el.dataset.id).name}.`)) {
    SFX.play("level");
    if (document.querySelector(".modal-layer")) closeModal();
    commit();
  }
};

function openTreePickChoice(pending) {
  const hero = App.hero;
  const { stage, tier } = pending;
  const lanes = getSkillTree(hero).lanes || [];
  openModal(`<span class="eyebrow">Новый навык, ${tier.level} уровень</span><h2 class="result-title">Какой путь выбрать?</h2>
    <p class="muted">Берётся один. Поменять можно позже за золото.</p>
    <div class="build-cards${tier.options.length === 2 ? " two" : ""}">${tier.options.map((id, lane) => {
      const skill = getSkillDefinition(id);
      const state = getTreeOptionState(hero, stage, tier, id);
      return `<button class="build-card" data-action="pickTreeSkill" data-owner="${esc(stage.owner)}" data-level="${tier.level}" data-id="${esc(id)}" ${state.ok ? "" : "disabled"}>
        <span class="pick-head">${skillIcon(skill)}<strong>${esc(skill.name)}</strong></span>${stage.stage === "class" && lanes[lane] ? `<em class="accent-text">${esc(lanes[lane].name)}</em>` : ""}<small>${esc(skill.description)}</small>
        <small class="muted">${skill.category === "active" ? esc(skillNumbers(hero, skill)) : "Действует постоянно"}</small>
        <span class="build-foot">${state.ok ? "Выбрать" : esc(state.reason)}</span></button>`;
    }).join("")}</div>`, { wide: true });
}
