// Expedition map, event scenes, the battle stage and its event player.
function zoneOf(exp) {
  return ZONES[exp?.zoneKey] || ZONES.green;
}

// --- Trail screen ---
Screens.trail = () => {
  const hero = App.hero;
  const exp = hero.expedition;
  const region = getRegion(exp.regionId);
  const zone = zoneOf(exp);
  const stepsHtml = Array.from({ length: exp.steps }, (_, i) => {
    const type = exp.path[i];
    const isCurrent = i === exp.step;
    const name = i === exp.steps - 1 ? "boss" : type || "event";
    return `<li class="path-node${type ? " done" : ""}${isCurrent ? " current" : ""}">${type || i === exp.steps - 1 ? icon(type || name) : `<span>${i + 1}</span>`}</li>`;
  }).join("");
  const event = App.eventState;
  return `
  <div class="trail-screen zone-${exp.zoneKey}${hasArt(`region_${region.id}`) ? " has-art" : ""}" style="--hour:${trailHour(exp).toFixed(2)}">
    ${sceneImg(`region_${region.id}`)}
    <canvas class="scene-canvas" data-scene="${region.id}" data-zone="${exp.zoneKey}" data-seed="${exp.step + 3}"></canvas>
    <span class="hour-veil" aria-hidden="true"></span><span class="hour-night" aria-hidden="true"></span>
    <canvas class="fx-canvas" data-fx="${exp.weather === "rain" ? "rain" : SCENES[region.id].ambient}"></canvas>
    <header class="trail-top">
      <div><span class="eyebrow">${esc(region.name)}</span><h1>${esc(exp.lairName || zone.name)}</h1></div>
      <ol class="path" aria-label="Шаги похода">${stepsHtml}</ol>
    </header>
    <main class="trail-main">
      ${event ? eventScene(event) : exp.pendingBoons?.length ? boonScene(exp) : forkScene(exp)}
    </main>
    <footer class="trail-foot">
      <div class="trail-hero">
        <div class="trail-art">${heroFigure(hero)}</div>
        <div class="trail-bars"><strong>${esc(hero.name)}, ${hero.level} ур.</strong>${bar(hero.currentHp, hero.maxHp, "hp")}${bar(hero.currentMana, hero.maxMana, "mp")}
          <div class="row-gap"><button class="btn small" data-action="trailPotion" data-kind="hp" ${hero.potions.hp > 0 && hero.currentHp < hero.maxHp ? "" : "disabled"}>${icon("potionHp")}${hero.potions.hp}</button><button class="btn small" data-action="trailPotion" data-kind="mp" ${hero.potions.mp > 0 && hero.currentMana < hero.maxMana ? "" : "disabled"}>${icon("potionMp")}${hero.potions.mp}</button><button class="btn small" data-action="openHubFromTrail">Рюкзак и навыки${hero.statPoints || hero.skillPoints ? ` <i class="dot">!</i>` : ""}</button></div>
        </div>
      </div>
      <div class="trail-bag"><span class="eyebrow">Добыча похода</span>
        <div class="bag-line"><span class="chip gold">${icon("gold")}${exp.bag.gold}</span>${exp.bag.shards ? `<span class="chip shard">${icon("shard")}${exp.bag.shards}</span>` : ""}${resourceChips(exp.bag.resources)}</div>
        <div class="bag-items">${trailLootCells(hero, exp)}</div>
      </div>
      ${(exp.boons || []).length ? `<div class="trail-boons"><span class="eyebrow">Дары тропы</span><div class="row-gap">${exp.boons.map((id) => `<span class="chip ${BOONS[id]?.cursed ? "cursed" : "accent"}" data-tip="boon|${id}" tabindex="0">${esc(BOONS[id]?.name || id)}</span>`).join("")}</div></div>` : ""}
      <div class="trail-actions"><button class="btn" data-action="retreat" ${event || exp.pendingBoons?.length ? "disabled" : ""}>${icon("retreat")} Отступить с добычей</button></div>
    </footer>
  </div>`;
};

function trailLootCells(hero, exp) {
  const packed = hero.inventory.map((item, index) => (item?.fromTrail ? itemCell(item, "inv", index) : "")).join("");
  const worn = Object.entries(hero.equipment).map(([slot, item]) => (item?.fromTrail ? itemCell(item, "eq", slot) : "")).join("");
  const overflow = exp.bag.items.map((item, index) => itemCell(item, "bag", index, { action: "noop" })).join("");
  const note = exp.bag.items.length ? `<small class="warn-text">Рюкзак полон: лишнее будет продано в конце похода</small>` : "";
  return packed + worn + overflow + note || `<small class="muted">Пока пусто</small>`;
}

function forkScene(exp) {
  return `<h2 class="fork-title">${exp.choices.length > 1 ? "Куда идти дальше?" : exp.lairId ? "Хозяин ждёт" : exp.choices[0]?.type === "boss" ? "Вожак этой тропы ждёт" : "Тропа ведёт вперёд"}</h2>
    <div class="fork-row">${exp.choices.map((choice, index) => {
      const node = NODE_TYPES[choice.type];
      const scout = describeScout(choice);
      const traits = scout ? scout.traits.map((id) => `<span class="trait-chip" data-tip="trait|${id}">${esc(ENEMY_TRAITS[id].name)}</span>`).join("") : "";
      return `<button class="fork-card node-${choice.type}" data-action="chooseNode" data-index="${index}" data-sound="anvil" ${index === 0 ? "data-autofocus" : ""}>${icon(choice.type)}<strong>${node.name}</strong>${scout ? `<b class="scout-name">${esc(scout.name)}</b>` : ""}<small>${node.description}</small>${choice.type === "elite" ? `<small class="accent-text">Победа: дар тропы на выбор</small>` : ""}${traits ? `<span class="trait-row">${traits}</span>` : ""}</button>`;
    }).join("")}</div>`;
}

function boonScene(exp) {
  return `<div class="event-card panel boon-card"><h2>Дар тропы</h2><p class="muted">Сила останется с тобой до конца этого похода. Выбери одно.</p><div class="boon-row">${exp.pendingBoons.map((id) => {
    const boon = BOONS[id];
    return `<button class="choice-card boon-choice${boon.cursed ? " cursed" : ""}" data-action="pickBoon" data-id="${id}" data-sound="level"><small class="boon-tag">${boon.cursed ? "Проклятый дар" : "Дар"}</small><strong>${esc(boon.name)}</strong><small>${esc(boon.description)}</small></button>`;
  }).join("")}</div></div>`;
}

Actions.pickBoon = (el) => {
  const hero = App.hero;
  if (!takeBoon(hero, hero.expedition, el.dataset.id)) return;
  persist();
  render();
};

function eventBanner(event, tone = "") {
  if (hasArt(`event_${event.id}`)) return `<div class="event-banner">${artImg(`event_${event.id}`)}</div>`;
  return `<div class="event-art ${tone ? `tone-${tone}` : ""}">${eventArt(event.art)}</div>`;
}

function eventScene(state) {
  const { event, result } = state;
  if (result) {
    return `<div class="event-card panel">${eventBanner(event, result.tone)}<h2>${esc(event.title)}</h2><p>${esc(result.text)}</p><button class="btn primary big" data-action="eventContinue" data-autofocus>${result.battle ? "К бою!" : "Идти дальше"}</button></div>`;
  }
  return `<div class="event-card panel">${eventBanner(event)}<h2>${esc(event.title)}</h2><p>${esc(event.text)}</p><div class="event-options">${event.options.map((option, index) => {
    const chance = option.stat ? ` (шанс ${Math.round(getStatCheckChance(App.hero, option.stat) * 100)}%)` : "";
    return `<button class="choice-card" data-action="eventOption" data-index="${index}"><strong>${esc(option.label)}</strong><small>${esc(option.hint)}${chance}</small></button>`;
  }).join("")}</div></div>`;
}

Actions.openHubFromTrail = () => { App.tab = "gear"; setScreen("hub"); };
Actions.trailPotion = (el) => {
  const hero = App.hero;
  const kind = el.dataset.kind;
  if (hero.potions[kind] <= 0) return;
  // A potion is not wasted on a full bar, the same as in battle.
  if (kind === "hp" ? hero.currentHp >= hero.maxHp : hero.currentMana >= hero.maxMana) { toast(kind === "hp" ? "Здоровье уже полное." : "Мана уже полная."); return; }
  hero.potions[kind] -= 1;
  if (kind === "hp") hero.currentHp = Math.min(hero.maxHp, Math.round(hero.currentHp + hero.maxHp * POTIONS.hp.ratio));
  else hero.currentMana = Math.min(hero.maxMana, Math.round(hero.currentMana + hero.maxMana * POTIONS.mp.ratio));
  SFX.play("heal");
  persist();
  render();
};

Actions.chooseNode = (el) => {
  const hero = App.hero;
  const entered = enterNode(hero, hero.expedition, Number(el.dataset.index));
  if (entered.kind === "event") {
    App.eventState = { event: entered.event, result: null };
    render();
    return;
  }
  beginFight(entered.enemy, { mode: "expedition", nodeType: entered.nodeType });
};

Actions.eventOption = (el) => {
  const hero = App.hero;
  const result = resolveEventOption(hero, hero.expedition, App.eventState.event, Number(el.dataset.index));
  App.eventState.result = result;
  // A closed page must not offer the same reward twice.
  hero.expedition.eventResolved = !result.battle;
  SFX.play(result.tone === "good" ? "loot" : result.tone === "bad" ? "debuff" : "click");
  persist();
  render();
  if (result.levelUp) showLevelUp(result.levelUp);
};

Actions.eventContinue = () => {
  const hero = App.hero;
  const result = App.eventState.result;
  App.eventState = null;
  hero.expedition.eventResolved = false;
  if (result.battle) {
    beginFight(result.battle, { mode: "expedition", nodeType: result.nodeType });
    return;
  }
  completeStep(hero, hero.expedition);
  persist();
  render();
};

Actions.retreat = async () => {
  const exp = App.hero.expedition;
  const hasLoot = exp.bag.gold > 0 || getTrailItems(App.hero, exp).length > 0;
  const ok = await confirmDialog({ title: "Отступить в лагерь?", text: hasLoot ? "Вся добыча останется у тебя, но награды за завершение похода не будет." : "Добычи пока нет: поход закончится без награды.", confirmLabel: "Отступить" });
  if (!ok) return;
  showExpeditionSummary(finishExpedition(App.hero, exp, "retreat"));
};

function showExpeditionSummary(summary) {
  persist();
  App.eventState = null;
  App.tab = "trail";
  setScreen("hub");
  const zone = { name: summary.lairName || ZONES[summary.zoneKey].name };
  const titles = { complete: "Поход завершён!", retreat: "Ты вернулся в лагерь", death: "Ты пал на тропе" };
  SFX.play(summary.outcome === "death" ? "lose" : "win");
  openModal(`<span class="eyebrow">${esc(zone.name)}</span><h2>${titles[summary.outcome]}</h2>
    ${summary.outcome === "death" ? `<p class="muted">Клеймо собрало тебя в лагере. Утрачено предметов: ${summary.lostItems}, золота: ${summary.lostGold}.${summary.keptWorn ? ` Надетые находки остались с тобой: ${summary.keptWorn}.` : ""} Опыт тоже остаётся.</p>` : ""}
    <div class="reward-line"><span class="chip gold">${icon("gold")}+${summary.gold}</span>${summary.completionBonus ? `<span class="chip accent">Награда за поход: ${summary.completionBonus}</span>` : ""}<span class="chip">Опыт +${summary.exp}</span>${summary.shards ? `<span class="chip shard">${icon("shard")}+${summary.shards}</span>` : ""}${resourceChips(summary.resources)}</div>
    ${summary.items.length ? `<div class="reward-items">${summary.items.map((item) => `<div class="reward-item rarity-${item.rarity}">${itemIcon(item)}<span class="rarity-text-${item.rarity}">${esc(getItemDisplayName(item))}</span></div>`).join("")}</div>` : ""}
    ${summary.soldItems ? `<p class="muted small">Рюкзак был полон: ${summary.soldItems} предм. продано за ${summary.soldGold} золота.</p>` : ""}
    <div class="modal-actions"><button class="btn primary" data-action="closeModal" data-autofocus>К лагерю</button></div>`);
}

Actions.startGuardian = (el) => {
  if (!getAvailableGuardian(App.hero, App.regionIndex)?.ready) return;
  const id = el.dataset.id;
  const go = () => {
    restoreHero(App.hero);
    beginFight(buildGuardianEncounter(id), { mode: "guardian", nodeType: "guardian" });
  };
  // The talk before the fight plays once, then the boss is ready to be fought again without it.
  const scene = `boss_before:${id}`;
  if (STORY_SCENES[scene] && !App.hero.story.seen.includes(scene)) playStoryScene(scene, { onDone: go });
  else go();
};

// --- Battle ---
function beginFight(enemy, fight) {
  const hero = App.hero;
  const exp = hero.expedition;
  const damageBonus = Number(exp?.damageBonus || 0);
  if (exp) {
    exp.damageBonus = 0;
    persist();
  }
  App.fight = { ...fight, regionId: exp?.regionId || REGIONS[App.regionIndex].id, zoneKey: exp?.zoneKey || "green", auto: false, playing: false, nonce: Date.now(), logOpen: false };
  App.battle = createBattle(hero, enemy, { damageBonus });
  setScreen("battle");
  App.stage = null;
  if (Stage3D.supports(App.battle, App.fight.regionId)) {
    document.querySelector(".battle-screen")?.classList.add("stage3d");
    App.stage = Stage3D.mount(document.getElementById("stage"), App.battle, App.fight.regionId, fightMood(hero, App.fight));
    SFX.ready?.();
  }
  renderStageFromState();
  playBattleEvents();
  maybeCoach();
}

Screens.battle = () => {
  const { hero, enemy } = App.battle;
  const fight = App.fight;
  const region = getRegion(fight.regionId);
  return `
  <div class="battle-screen">
    <div class="stage" id="stage">
      <canvas class="scene-canvas" data-scene="${region.id}" data-zone="${fight.mode === "guardian" ? "" : fight.zoneKey}" data-seed="${(fight.nonce % 97) + 1}"></canvas>
      <div class="plates">
        
        <section class="timeline-wrap"><div class="timeline" id="timeline" aria-label="Очередь ходов"></div><div class="turn-banner" id="turnBanner"></div></section>
        <section class="foe-plates" id="foePlates"></section>
      </div>
      <div class="fighter fighter-hero" id="fHero" style="--scale:1"><div class="summons" id="summonsRow"></div><div class="sprite-wrap">${heroSprite(hero.classKey)}</div></div>
      <div class="foe-stage foes-${App.battle.foes.length}" id="foeStage"></div>
      <div class="floaters" id="floaters"></div>
      <canvas class="fx-canvas" data-fx="${SCENES[region.id].ambient}"></canvas>
      <div class="action-name" id="actionName"></div>
      <div class="coach" id="coach" hidden></div>
    </div>
    <div class="command-bar">
      <section class="bar-hero" id="plateHero">
        <div class="bar-medal"><div class="portrait">${heroMedal(hero)}</div></div>
        <div class="bar-info"><div class="plate-name"><strong>${esc(hero.name)}</strong><small>${hero.level} ур.</small></div><div id="heroHp"></div><div id="heroMp" class="res-${hero.classKey}" data-tip="mech|${CORE_BY_CLASS[hero.classKey]}"></div><div class="gauges" id="heroGauges"></div><div class="effects" id="heroFx"></div></div>
      </section>
      <div class="skill-actions" id="skillActions"></div>
      <div class="basic-actions" id="basicActions"></div>
      <div class="battle-tools">
        <button class="tool-btn" id="autoBtn" data-action="toggleAuto" aria-pressed="false">${icon("auto")}<span>Авто</span><kbd>A</kbd></button>
        <button class="tool-btn" id="speedBtn" data-action="toggleSpeed"><b id="speedLabel">×${App.save.settings.battleSpeed || 1}</b><span>Скорость</span></button>
        <button class="tool-btn" data-action="toggleLog" aria-expanded="false">${icon("log")}<span>Журнал</span></button>
        ${App.dev ? `<button class="tool-btn" data-action="openDev"><b>Dev</b></button>` : ""}
      </div>
    </div>
    <aside class="battle-log" id="battleLog" hidden aria-label="Журнал боя"></aside>
  </div>`;
};

const delayMs = (ms) => {
  const speed = Number(App.save.settings.battleSpeed || 1);
  return new Promise((resolve) => setTimeout(resolve, ms / speed));
};

function isCurrentFight(nonce) {
  return App.screen === "battle" && App.fight?.nonce === nonce;
}

function renderPlates(snap) {
  const heroHp = document.getElementById("heroHp");
  if (!heroHp) return;
  heroHp.innerHTML = plateBar(snap.hero, "hp", "hero");
  const heroPlate = document.getElementById("plateHero");
  heroPlate?.style.setProperty("--hp", String(percent(snap.hero.hp, snap.hero.maxHp)));
  heroPlate?.style.setProperty("--mp", String(percent(snap.hero.mp, snap.hero.maxMp)));
  document.getElementById("heroMp").innerHTML = bar(snap.hero.mp, snap.hero.maxMp, "mp");
  document.getElementById("heroFx").innerHTML = statusPills(snap.hero.effects, "hero");
  renderFoePlates(snap);
  const row = document.getElementById("summonsRow");
  row.innerHTML = snap.hero.summons.map((summon) => `<span class="summon-card ${summon.type}" data-tip="text|${esc(summon.name)}|Здоровье: ${Math.max(0, summon.hp)} из ${summon.maxHp}${summon.persistent ? "" : `. Осталось: ${turnsLabel(summon.duration)}`}">${icon(summon.type === "spirit" ? "holy" : summon.type === "beast" ? "earth" : "dark")}<i class="summon-hp"><b style="width:${percent(summon.hp, summon.maxHp)}%"></b></i>${summon.persistent ? "" : `<em>${summon.duration}</em>`}</span>`).join("");
  const gauges = document.getElementById("heroGauges");
  if (gauges) gauges.innerHTML = (snap.hero.gauges || []).map((gauge) => `<div class="gauge" data-tip="mech|${gauge.id}" tabindex="0"><span>${esc(gauge.name)}</span>${gauge.text ? `<em>${esc(gauge.text)}</em>` : ""}${gauge.max ? `<i class="gauge-bar"><b style="width:${percent(gauge.value, gauge.max)}%"></b></i><small>${gauge.value}/${gauge.max}</small>` : gauge.value ? `<small>${gauge.value}</small>` : ""}</div>`).join("");
}

function foeTitleClass(foe) {
  return foe.isGuardian || foe.isBoss ? "boss-name" : foe.isElite ? "elite-name" : "";
}

function renderFoePlates(snap) {
  const wrap = document.getElementById("foePlates");
  if (!wrap || !App.battle) return;
  wrap.className = `foe-plates count-${App.battle.foes.length}`;
  wrap.innerHTML = (snap.foes || []).filter((entry) => !entry.down).map((entry) => {
    const foe = App.battle.foes[entry.slot];
    const traits = (foe.traits || []).filter((id) => ENEMY_TRAITS[id]);
    return `<button class="plate plate-enemy${snap.target === entry.slot ? " targeted" : ""}" id="foePlate${entry.slot}" style="${App.plateAt?.[entry.slot] || ""}" data-action="setTarget" data-slot="${entry.slot}" aria-pressed="${snap.target === entry.slot}">
      <div class="plate-name"><strong class="${foeTitleClass(foe)}">${esc(foe.name)}</strong><small>${foe.level} ур.</small></div>
      ${plateBar(entry, "enemy", "enemy")}
      ${entry.effects.length ? `<div class="st-row">${statusPills(entry.effects, `foe${entry.slot}`)}</div>` : ""}
      ${traits.length ? `<div class="trait-row">${traits.map((id) => `<span class="trait-chip" data-tip="trait|${id}">${esc(ENEMY_TRAITS[id].name)}</span>`).join("")}</div>` : ""}
    </button>`;
  }).join("");
}

// Sprites are rebuilt only when the group changes, so running animations are not interrupted.
function renderFoeStage() {
  const wrap = document.getElementById("foeStage");
  if (!wrap || !App.battle) return;
  const foes = App.battle.foes;
  const shownNow = foes.filter((foe) => !foe.deadShown);
  wrap.className = `foe-stage foes-${Math.min(4, foes.length)}`;
  wrap.innerHTML = foes.map((foe) => `<div class="fighter fighter-enemy slot-${foe.slot}${foe.deadShown ? " dead" : ""}" id="fFoe${foe.slot}" data-action="setTarget" data-slot="${foe.slot}" onmouseenter="if(App.stage)App.stage.hoverSlot=${foe.slot}" onmouseleave="if(App.stage)App.stage.hoverSlot=null" style="--scale:${foe.scale * (foes.length > 2 ? 0.8 : foes.length > 1 ? 0.9 : 1)}"><div class="intent" id="intent${foe.slot}" aria-live="polite"></div><div class="target-ring"></div><div class="sprite-wrap">${enemySprite(foe.art, foe.tint)}</div></div>`).join("");
  return shownNow;
}

function markTarget() {
  const target = App.battle?.enemy?.slot;
  document.querySelectorAll(".fighter-enemy").forEach((el) => el.classList.toggle("targeted", el.id === `fFoe${target}` && App.battle.foes.filter((foe) => foe.currentHp > 0).length > 1));
}

Actions.setTarget = (el) => {
  const battle = App.battle;
  if (!battle?.awaiting || App.fight.playing) return;
  if (setBattleTarget(battle, Number(el.dataset.slot))) {
    renderPlates(snapshotBattle(battle));
    markTarget();
    renderControls();
  }
};

function plateBar(unit, kind) {
  const shield = (unit.effects || []).filter((effect) => effect.id === "shield").reduce((sum, effect) => sum + Number(effect.value || 0), 0);
  return `<div class="bar bar-${kind}"><div class="bar-fill" style="width:${percent(unit.hp, unit.maxHp)}%"></div>${shield ? `<div class="bar-shield" style="width:${percent(Math.min(shield, unit.maxHp), unit.maxHp)}%"></div>` : ""}<span class="bar-text">${Math.round(unit.hp)} / ${Math.round(unit.maxHp)}${shield ? ` <em>+${Math.round(shield)}</em>` : ""}</span></div>`;
}

// What each status does, in words short enough to read during a fight.
const STATUS_HINTS = { poison: "урон каждый ход", burn: "урон огнём каждый ход", bleed: "урон, когда действует", frost: "ходит реже", frostbite: "легче поймать крит", freeze: "пропускает ход", stagger: "шатается, слабее защита", corruption: "тьма разъедает", stun: "пропускает ход", silence: "нельзя навыки", weaken: "бьёт слабее", mark: "получает больше урона", armor_break: "броня пробита", shield: "поглощает урон", regeneration: "лечится каждый ход", dark_fury: "тёмная ярость", rage: "бьёт сильнее", haste: "ходит чаще", evasion: "уворачивается", fortify: "крепче защита", thorns: "ранит в ответ" };

// A short readable label: icon, name, power and turns left. Debuffs are cut-cornered, buffs are round.
function statusPills(effects, side) {
  const compact = effects.length > 3;
  return effects.map((effect, index) => {
    const def = STATUS_EFFECT_DEFINITIONS[effect.id] || {};
    const hex = (typeof STATUS_COLORS !== "undefined" && STATUS_COLORS[effect.id]) || (def.tone === "good" ? "#8dff9a" : "#ff8a70");
    const stacks = effect.stacks > 1 ? `<u>×${effect.stacks}</u>` : "";
    const turns = effect.duration > 0 && effect.duration < 90 ? `<i>${effect.duration}</i>` : "";
    return `<span class="st-pill ${def.tone === "good" ? "good" : "bad"}${compact ? " compact" : ""}" style="--c:${hex}" data-tip="effect|${side}|${index}" tabindex="0" aria-label="${esc(def.name || effect.id)}">${icon(effect.id)}${compact ? "" : `<b>${esc(def.name || effect.id)}</b>`}${stacks}${turns}</span>`;
  }).join("");
}

// The moment a status lands: a big label over the fighter that also says what it does.
let calloutShift = 0;
function statusCallout(side, id, def, hex) {
  const wrap = document.getElementById("floaters");
  if (!wrap) return;
  const center = fighterCenter(side, 0.1);
  const el = document.createElement("div");
  el.className = `floater st-callout ${def.tone === "good" ? "good" : "bad"}`;
  el.style.setProperty("--c", hex);
  el.innerHTML = `${icon(id)}<span><b>${esc(def.name || id)}</b>${STATUS_HINTS[id] ? `<small>${esc(STATUS_HINTS[id])}</small>` : ""}</span>`;
  calloutShift = (calloutShift + 1) % 3;
  el.style.left = `${center.x}px`;
  el.style.top = `${center.y + calloutShift * 44}px`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function effectChips(effects, side) {
  return effects.map((effect, index) => {
    const def = STATUS_EFFECT_DEFINITIONS[effect.id] || {};
    return `<span class="fx-chip ${def.tone || "bad"} fx-${effect.id}" data-tip="effect|${side}|${index}" tabindex="0" aria-label="${esc(def.name || effect.id)}">${icon(effect.id)}<i>${effect.stacks > 1 ? `×${effect.stacks}` : effect.duration}</i></span>`;
  }).join("");
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  if (!el || !App.battle) return;
  const order = App.battle.over ? [] : previewTimeline(App.battle, 9);
  el.innerHTML = order.map((who, index) => `<span class="tl-pip ${who}${index === 0 ? " now" : ""}" data-tip="text|${who === "hero" ? "Твой ход" : "Ход врага"}|Очередь зависит от скорости. Быстрые действия приближают твой следующий ход.">${index === 0 ? "" : ""}${icon(who === "hero" ? "hero" : "boss")}</span>`).join("");
}

function renderAllIntents() {
  App.battle?.foes.forEach((foe) => renderIntent(null, foe));
}

function renderIntent(data = null, foe = App.battle?.enemy) {
  const el = document.getElementById(`intent${foe?.slot}`);
  if (!el || !App.battle) return;
  const intent = data || (App.battle.over || foe.currentHp <= 0 ? null : describeIntentFor(App.battle, foe));
  if (!intent) { el.innerHTML = ""; el.className = "intent"; return; }
  const kindIcon = { physical: "attack", magic: "arcane", heal: "regeneration", shield: "shield", buff: "rage", debuff: intent.applyId || "weaken", windup: "stun", release: "stun" }[intent.kind] || "attack";
  const damage = intent.damage ? `<b>${intent.hits > 1 ? `${intent.damage}×${intent.hits}` : `≈${intent.damage}`}</b>` : "";
  el.className = `intent show${intent.heavy ? " heavy" : ""}`;
  el.innerHTML = `${icon(intent.heavy ? "stun" : kindIcon)}<div><span>${esc(intent.name)}</span>${damage}${intent.note ? `<small>${esc(intent.note)}</small>` : ""}${intent.charge ? `<small class="warn-text">Сорвать: ${intent.charge.need} урона</small>` : intent.heavy ? `<small class="warn-text">Стойка или оглушение</small>` : ""}</div>`;
}

// Shows on the skill tile which statuses it will put on the enemy.
function skillEffectBadges(skill) {
  const ids = [...new Set((skill.appliedEffects || []).filter((effect) => effect.target !== "self").map((effect) => effect.id))].slice(0, 3);
  if (!ids.length) return "";
  return `<span class="skill-fx">${ids.map((id) => `<em style="--c:${(typeof STATUS_COLORS !== "undefined" && STATUS_COLORS[id]) || "#ff8a70"}">${icon(id)}</em>`).join("")}</span>`;
}

function renderControls() {
  const battle = App.battle;
  const hero = battle.hero;
  const basic = document.getElementById("basicActions");
  if (!basic) return;
  const ready = battle.awaiting && !App.fight.playing && !battle.over;
  const dis = ready ? "" : "disabled";
  const attackLabel = getBasicAttackLabel(hero);
  basic.innerHTML = `
    <button class="cmd-btn" data-action="battleAct" data-type="attack" data-tip="action|attack" ${dis}>${icon("attack")}<span>${attackLabel}</span><kbd>Q</kbd></button>
    <button class="cmd-btn${describeIntent(battle)?.heavy ? " suggest" : ""}" data-action="battleAct" data-type="guard" data-tip="action|guard" ${dis}>${icon("guard")}<span>Стойка</span><kbd>W</kbd></button>
    <button class="cmd-btn" data-action="battleAct" data-type="wait" data-tip="action|wait" ${dis}>${icon("wait")}<span>${esc(getWaitLabel(battle))}</span><kbd>E</kbd></button>
    ${hero.level >= ULTIMATE_LEVEL ? `<button class="cmd-btn ult${canUseUltimate(battle) ? " ready" : ""}" data-action="battleAct" data-type="ult" data-tip="ult|1" ${ready && canUseUltimate(battle) ? "" : "disabled"} style="--ult:${battle.ult}%">${ultIcon(getHeroUltimate(hero), hero)}<span>${canUseUltimate(battle) ? esc(getHeroUltimate(hero).name) : `${Math.round(battle.ult)}%`}</span><kbd>F</kbd></button>` : ""}
    <button class="cmd-btn potion hp" data-action="battleAct" data-type="potion" data-kind="hp" data-tip="action|hp" ${ready && hero.potions.hp > 0 && hero.currentHp < hero.maxHp ? "" : "disabled"}>${icon("potionHp")}<span>${hero.potions.hp}</span><kbd>R</kbd></button>
    <button class="cmd-btn potion mp" data-action="battleAct" data-type="potion" data-kind="mp" data-tip="action|mp" ${ready && hero.potions.mp > 0 && hero.currentMana < hero.maxMana ? "" : "disabled"}>${icon("potionMp")}<span>${hero.potions.mp}</span><kbd>T</kbd></button>`;
  document.getElementById("skillActions").innerHTML = hero.activeSkillSlots.map((_, index) => {
    const skill = getActiveSkillFromSlot(hero, index);
    if (!skill) return `<button class="skill-btn empty" disabled aria-label="Пустой слот ${index + 1}"><kbd>${index + 1}</kbd></button>`;
    const check = canUseSkill(battle, index);
    const cd = Number(hero.cooldowns?.[skill.id] || 0);
    const cost = getSkillResourceCost(skill, hero);
    const isHp = getHeroResourceType(skill, hero) === "hp";
    return `<button class="skill-btn${check.ok ? "" : " unavailable"}" data-action="battleAct" data-type="skill" data-slot="${index}" data-tip="slot|${index}" ${ready && check.ok ? "" : "disabled"} aria-label="${esc(skill.name)}">
      ${skillIcon(skill)}${skillEffectBadges(skill)}<span class="skill-name">${esc(skill.name)}</span><span class="skill-cost ${isHp ? "hp" : "mp"}">${cost}</span><kbd>${index + 1}</kbd>${cd > 0 ? `<span class="cd">${cd}</span>` : ""}</button>`;
  }).join("");
}

function battleActionTip(kind) {
  const hero = App.hero;
  const tips = {
    attack: tipBlock("Удар", "Бесплатная атака оружием. Сила зависит от урона героя."),
    guard: tipBlock("Стойка", "Следующий удар врага ослаблен вдвое. Следующий ход наступит чуть раньше.", "Лучший ответ на тяжёлый удар"),
    wait: MECHANICS[CORE_BY_CLASS[hero.classKey]]?.wait && getCoreWait(App.battle) ? tipBlock(getCoreWait(App.battle).name, getCoreWait(App.battle).tip) : tipBlock("Выждать", `Восстанавливает ${Math.round(hero.maxMana * WAIT_MANA_RATIO)} маны, а твой следующий ход наступит заметно раньше.`),
    hp: tipBlock(POTIONS.hp.name, POTIONS.hp.description, `Осталось: ${hero.potions.hp}`),
    mp: tipBlock(POTIONS.mp.name, POTIONS.mp.description, `Осталось: ${hero.potions.mp}`)
  };
  return tips[kind] || "";
}

function renderStageFromState() {
  const battle = App.battle;
  if (!document.getElementById("fFoe0")) renderFoeStage();
  renderPlates(snapshotBattle(battle));
  renderTimeline();
  renderAllIntents();
  markTarget();
  renderControls();
}

function fighterEl(side) {
  if (side === "hero") return document.getElementById("fHero");
  return document.getElementById(`fFoe${App.fxFoe ?? App.battle?.enemy?.slot ?? 0}`);
}

function fighterCenter(side, yRatio = 0.5) {
  const el = fighterEl(side)?.querySelector(".sprite-wrap");
  const stage = document.getElementById("stage");
  if (!el || !stage) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  const parent = stage.getBoundingClientRect();
  return { x: rect.left - parent.left + rect.width / 2, y: rect.top - parent.top + rect.height * yRatio };
}

function playAnim(side, name, ms = 500) {
  const el = fighterEl(side);
  if (!el) return;
  el.classList.remove("a-attack", "a-cast", "a-hit", "a-guard", "a-heavyhit", "a-wait");
  void el.offsetWidth;
  el.classList.add(`a-${name}`);
  const speed = Number(App.save.settings.battleSpeed || 1);
  el.style.setProperty("--anim", `${ms / speed}ms`);
  setTimeout(() => el.classList.remove(`a-${name}`), ms / speed);
}

function floater(side, text, kind = "damage") {
  const wrap = document.getElementById("floaters");
  if (!wrap) return;
  const center = fighterCenter(side, 0.28);
  const el = document.createElement("div");
  el.className = `floater ${kind}`;
  el.textContent = text;
  el.style.left = `${center.x + (Math.random() - 0.5) * 60}px`;
  el.style.top = `${center.y + (Math.random() - 0.5) * 26}px`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function shakeStage(power = "s") {
  if (FX.reduced) return;
  const stage = document.getElementById("stage");
  if (!stage) return;
  stage.classList.remove("shake-s", "shake-l");
  void stage.offsetWidth;
  stage.classList.add(`shake-${power}`);
  setTimeout(() => stage.classList.remove("shake-s", "shake-l"), 420);
}

function logLine(entry) {
  const log = document.getElementById("battleLog");
  if (!log) return;
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = `${entry.tag ? `<b>${esc(entry.tag)}</b> ` : ""}${esc(entry.text)}`;
  log.prepend(line);
  while (log.childElementCount > 80) log.lastElementChild.remove();
}

function showActionName(text, heavy = false) {
  const el = document.getElementById("actionName");
  if (!el) return;
  el.textContent = text;
  el.className = `action-name show${heavy ? " heavy" : ""}`;
  clearTimeout(el.__t);
  el.__t = setTimeout(() => { el.className = "action-name"; }, 800);
}

const ELEMENT_SOUND = { fire: "fire", frost: "frost", water: "frost", holy: "heal", dark: "cast", arcane: "cast", air: "cast", earth: "heavy", poison: "debuff", blood: "cast" };

// No single event may hold the fight longer than this: a stuck animation costs a moment, not the battle.
const EVENT_WATCHDOG_MS = 5000;

async function playBattleEvent(ev, nonce) {
  // Animations belong to the foe the event happened to, not to the player's current target.
  if (ev.foe !== undefined) App.fxFoe = ev.foe;
  const color = ELEMENT_COLORS[ev.element] || "#ffffff";
  if (ev.snap && ev.type !== "action") {
    renderPlates(ev.snap);
    App.stage?.syncStatus(ev.snap);
  }
  if (App.stage) {
    const played = await Promise.race([
      stagePlayEvent(App.stage, ev, color).catch((error) => { console.warn("Сцена пропустила событие", ev.type, error); return true; }),
      new Promise((resolve) => setTimeout(() => resolve(true), EVENT_WATCHDOG_MS))
    ]);
    if (played) return isCurrentFight(nonce);
  }
  switch (ev.type) {
    case "log": logLine(ev); break;
    case "turn": {
      const banner = document.getElementById("turnBanner");
      if (banner) banner.textContent = ev.who === "hero" ? "Твой ход" : "Ход врага";
      document.getElementById("plateHero")?.classList.toggle("active", ev.who === "hero");
      renderTimeline();
      break;
    }
    case "intent": renderIntent(ev.intent, App.battle.foes[ev.foe]); break;
    case "retarget": markTarget(); break;
    case "foeJoin": {
      renderFoeStage();
      renderAllIntents();
      markTarget();
      const center = fighterCenter("enemy", 0.5);
      FX.ring(center.x, center.y, "#ff8a3c", 120, 0.5);
      SFX.play("heavy");
      showActionName(`${ev.name} вступает в бой`);
      await delayMs(420);
      break;
    }
    case "action": {
      showActionName(ev.name, ev.heavy);
      if (ev.anim === "attack") { playAnim(ev.who, "attack", 420); await delayMs(170); }
      else if (ev.anim === "cast") {
        playAnim(ev.who, "cast", 480);
        SFX.play(ELEMENT_SOUND[ev.element] || "cast");
        const origin = fighterCenter(ev.who, 0.35);
        FX.ring(origin.x, origin.y, color, 60, 0.35);
        await delayMs(180);
        if (ev.ranged) {
          const target = fighterCenter(ev.who === "hero" ? "enemy" : "hero", 0.42);
          await FX.projectile(origin, target, color, 0.26 / Number(App.save.settings.battleSpeed || 1));
        }
      } else if (ev.anim === "guard") {
        playAnim("hero", "guard", 500);
        SFX.play("guard");
        const c = fighterCenter("hero", 0.5);
        FX.ring(c.x, c.y, "#ffe9a0", 96, 0.45);
        floater("hero", "Стойка", "buff");
        await delayMs(260);
      } else if (ev.anim === "wait") {
        playAnim("hero", "wait", 400);
        await delayMs(200);
      }
      break;
    }
    case "hit": {
      const center = fighterCenter(ev.target, 0.42);
      const flip = ev.target === "hero";
      if (ev.heavy) { SFX.play("heavy"); shakeStage("l"); }
      else if (ev.crit) { SFX.play("crit"); shakeStage("s"); }
      else SFX.play("hit");
      if (ev.guarded) SFX.play("guard");
      playAnim(ev.target, ev.heavy || ev.crit ? "heavyhit" : "hit", 340);
      if (ev.kind === "physical") FX.slash(center.x, center.y, color, flip);
      else FX.burst(center.x, center.y, { color, count: 22, speed: 240, life: 0.5, size: 3 });
      if (ev.crit) FX.burst(center.x, center.y, { color: "#fff3b0", count: 16, speed: 320, life: 0.45, size: 2.6 });
      const absorbed = ev.absorbed ? `(щит ${ev.absorbed})` : "";
      if (ev.amount > 0 || !ev.absorbed) floater(ev.target, `${ev.amount}${ev.crit ? "!" : ""}`, ev.crit ? "crit" : ev.target === "hero" ? "hurt" : "damage");
      else floater(ev.target, absorbed, "shield");
      if (ev.guarded) floater(ev.target, "Блок", "buff");
      await delayMs(ev.crit || ev.heavy ? 420 : 300);
      break;
    }
    case "miss":
      SFX.play("miss");
      floater(ev.target, "Мимо", "miss");
      await delayMs(260);
      break;
    case "heal": {
      const center = fighterCenter(ev.target, 0.6);
      SFX.play("heal");
      FX.rise(center.x, center.y, "#9bff9f", 14);
      floater(ev.target, `+${ev.amount}`, "heal");
      await delayMs(220);
      break;
    }
    case "mana":
      FX.rise(fighterCenter(ev.target, 0.6).x, fighterCenter(ev.target, 0.6).y, "#7fb8ff", 10);
      floater(ev.target, `+${ev.amount}`, "mana");
      await delayMs(180);
      break;
    case "effect": {
      const center = fighterCenter(ev.target, 0.45);
      const def = STATUS_EFFECT_DEFINITIONS[ev.id] || {};
      const colors = { burn: "#ff8a3c", frost: "#9fe4ff", frostbite: "#9fe4ff", freeze: "#d8f6ff", stagger: "#c49a5c", corruption: "#a974ff", poison: "#9be34f", bleed: "#ff4d5e", shield: "#ffe9a0", regeneration: "#9bff9f", stun: "#ffe066", haste: "#c8f0e8", rage: "#ff7b4a", mark: "#ff5d8f", weaken: "#a974ff", armor_break: "#c49a5c", dark_fury: "#a974ff", silence: "#b0b0c8", fortify: "#c49a5c", thorns: "#c49a5c", evasion: "#c8f0e8" };
      FX.ring(center.x, center.y, colors[ev.id] || "#fff", 72, 0.4);
      SFX.play(def.tone === "good" ? "heal" : "debuff");
      floater(ev.target, def.name || ev.id, def.tone === "good" ? "buff" : "debuff");
      await delayMs(240);
      break;
    }
    case "tick": {
      const center = fighterCenter(ev.target, 0.5);
      const colors = { poison: "#9be34f", burn: "#ff8a3c", bleed: "#ff4d5e", thorns: "#c49a5c", corruption: "#a974ff" };
      FX.rise(center.x, center.y, colors[ev.id] || "#fff", 10);
      SFX.play("debuff");
      floater(ev.target, `${ev.amount}`, `dot-${ev.id}`);
      playAnim(ev.target, "hit", 240);
      await delayMs(240);
      break;
    }
    case "detonate": {
      const center = fighterCenter(ev.target, 0.45);
      SFX.play("crit");
      SFX.play("fire");
      shakeStage("l");
      FX.burst(center.x, center.y, { color: "#ff8a3c", count: 46, speed: 380, life: 0.7, size: 4 });
      FX.ring(center.x, center.y, "#ffd27a", 150, 0.55);
      floater(ev.target, `${ev.amount}!`, "crit");
      await delayMs(460);
      break;
    }
    case "proc":
      floater("hero", ev.text, "proc");
      logLine({ text: `Сработало: ${ev.text}.`, tag: "Талант" });
      await delayMs(120);
      break;
    case "mech":
      floater("hero", ev.text, "buff");
      SFX.play("loot");
      await delayMs(420);
      break;
    case "summonHurt": {
      const center = fighterCenter("hero", 0.75);
      SFX.play("hit");
      FX.burst(center.x - 40, center.y, { color: "#c8c0e0", count: 10, speed: 160, life: 0.35 });
      floater("hero", `${ev.name}: ${ev.amount}`, "debuff");
      await delayMs(260);
      break;
    }
    case "interrupt":
      floater("enemy", "Сорвано!", "crit");
      showActionName(`«${ev.name}» сорван`);
      SFX.play("crit");
      await delayMs(380);
      break;
    case "stunned":
      floater(ev.target, "Оглушён", "debuff");
      await delayMs(360);
      break;
    case "summon": {
      const center = fighterCenter("hero", 0.7);
      SFX.play("cast");
      FX.rise(center.x, center.y, ev.kind === "spirit" ? "#ffe9a0" : "#a974ff", 22);
      await delayMs(260);
      break;
    }
    case "summonHit": {
      const center = fighterCenter("enemy", 0.45);
      SFX.play("hit");
      FX.burst(center.x, center.y, { color: "#a974ff", count: 14, speed: 200, life: 0.4 });
      floater("enemy", `${ev.amount}`, "damage");
      await delayMs(220);
      break;
    }
    case "phase": {
      const center = fighterCenter("enemy", 0.45);
      SFX.play("heavy");
      shakeStage("l");
      FX.burst(center.x, center.y, { color: "#ffb35c", count: 60, speed: 420, life: 0.9, size: 4 });
      showActionName(ev.text, true);
      await delayMs(900);
      break;
    }
    case "skillLevel":
      floater("hero", ev.max ? "Мастерство V!" : `Мастерство ${ev.level}`, "buff");
      SFX.play("loot");
      break;
    case "death":
      if (ev.target === "enemy" && App.battle.foes[ev.foe]) { App.battle.foes[ev.foe].deadShown = true; renderIntent(null, App.battle.foes[ev.foe]); }
      fighterEl(ev.target)?.classList.add("dead");
      SFX.play("death");
      await delayMs(620);
      break;
    default: break;
  }
  return isCurrentFight(nonce);
}

// The hour and the weather of a fight: dawn at the first step of a trail, dusk at its end, night in lairs and before guardians.
const REGION_WEATHER = { thicket: () => (Math.random() < 0.35 ? "rain" : null), ashlands: () => "ash", ruins: () => "mist", limit: () => "shards" };
// How far the day has gone on this trail: 0 at dawn, 1 at night.
function trailHour(exp) {
  if (exp.lairId) return 1;
  return exp.steps > 1 ? 0.04 + 0.86 * (Math.min(exp.step, exp.steps - 1) / (exp.steps - 1)) : 0.45;
}

function fightMood(hero, fight) {
  const exp = hero.expedition;
  let time = 0.88;
  if (fight.mode !== "guardian" && exp) time = trailHour(exp);
  // One trail keeps one sky: the weather is chosen when it starts and stays until the camp.
  if (exp && exp.weather === undefined) exp.weather = REGION_WEATHER[fight.regionId]?.() || null;
  const weather = exp ? exp.weather : REGION_WEATHER[fight.regionId]?.() || null;
  return { time, weather };
}

async function playBattleEvents() {
  const fight = App.fight;
  const battle = App.battle;
  if (!fight || !battle || fight.playing) return;
  fight.playing = true;
  hideTooltip();
  renderControls();
  const nonce = fight.nonce;
  while (battle.events.length) {
    const ev = battle.events.shift();
    const alive = await playBattleEvent(ev, nonce);
    if (!alive) return;
  }
  fight.playing = false;
  renderStageFromState();
  if (battle.over) {
    await delayMs(280);
    if (isCurrentFight(nonce)) onBattleOver();
    return;
  }
  if (fight.auto && battle.awaiting) {
    await delayMs(160);
    if (isCurrentFight(nonce) && fight.auto) performHeroAction(chooseBotAction(battle));
  }
}

function performHeroAction(action) {
  const battle = App.battle;
  if (!battle?.awaiting || App.fight.playing) return;
  const result = heroAction(battle, action);
  if (!result.ok) {
    if (App.fight.auto) { heroAction(battle, { type: "attack" }); }
    else { notifyResult(result); return; }
  }
  playBattleEvents();
}

Actions.battleAct = (el) => {
  const { type, slot, kind } = el.dataset;
  performHeroAction(type === "skill" ? { type, slotIndex: Number(slot) } : type === "potion" ? { type, kind } : { type });
};

function battleHotkey(event) {
  const key = event.key.toLowerCase();
  if (key === "tab" && App.battle?.awaiting && !App.fight.playing) {
    event.preventDefault();
    const alive = livingFoes(App.battle);
    const next = alive[(alive.indexOf(App.battle.enemy) + 1) % alive.length];
    if (next) Actions.setTarget({ dataset: { slot: next.slot } });
    return;
  }
  if ((key === "f" || key === "а") && App.battle && canUseUltimate(App.battle)) { event.preventDefault(); performHeroAction({ type: "ult" }); return; }
  const map = { q: { type: "attack" }, й: { type: "attack" }, w: { type: "guard" }, ц: { type: "guard" }, e: { type: "wait" }, у: { type: "wait" }, r: { type: "potion", kind: "hp" }, к: { type: "potion", kind: "hp" }, t: { type: "potion", kind: "mp" }, е: { type: "potion", kind: "mp" } };
  if (key === "a" || key === "ф") { Actions.toggleAuto(); return; }
  if (key >= "1" && key <= "5") {
    event.preventDefault();
    const slotIndex = Number(key) - 1;
    if (App.battle?.awaiting && !App.fight.playing) {
      const check = canUseSkill(App.battle, slotIndex);
      if (check.ok) performHeroAction({ type: "skill", slotIndex });
      else notifyResult(check);
    }
    return;
  }
  if (map[key]) {
    event.preventDefault();
    performHeroAction(map[key]);
  }
}

Actions.toggleAuto = () => {
  const fight = App.fight;
  fight.auto = !fight.auto;
  const btn = document.getElementById("autoBtn");
  btn?.classList.toggle("on", fight.auto);
  btn?.setAttribute("aria-pressed", String(fight.auto));
  if (fight.auto && App.battle.awaiting && !fight.playing) performHeroAction(chooseBotAction(App.battle));
};
Actions.toggleSpeed = () => {
  const speeds = [1, 2, 3];
  const current = Number(App.save.settings.battleSpeed || 1);
  App.save.settings.battleSpeed = speeds[(speeds.indexOf(current) + 1) % speeds.length];
  writeSave(App.save);
  document.getElementById("speedLabel").textContent = `×${App.save.settings.battleSpeed}`;
};
Actions.toggleLog = (el) => {
  const log = document.getElementById("battleLog");
  log.hidden = !log.hidden;
  el.setAttribute("aria-expanded", String(!log.hidden));
};

// Short tips the first time the player sees the battle screen.
const COACH_TIPS = [
  { id: "group", text: "Врагов может быть несколько. Нажми на врага или его табличку, чтобы выбрать цель, клавиша Tab переключает. Лекарей и защитников лучше убирать первыми." },
  { id: "intent", text: "Над врагом видно его следующее действие и примерный урон. Планируй ход заранее." },
  { id: "timeline", text: "Шкала сверху показывает очередь ходов. Быстрые действия приближают твой следующий ход." },
  { id: "guard", text: "Когда враг готовит тяжёлый удар, прими стойку или оглуши его. Удар можно сорвать." }
];

function maybeCoach() {
  const tips = App.save.settings.tips;
  const next = COACH_TIPS.find((tip) => !tips[tip.id]);
  const el = document.getElementById("coach");
  if (!next || !el) return;
  el.hidden = false;
  el.innerHTML = `<p>${esc(next.text)}</p><button class="btn small primary" data-action="coachNext" data-id="${next.id}">Понятно</button>`;
}
Actions.coachNext = (el) => {
  App.save.settings.tips[el.dataset.id] = true;
  writeSave(App.save);
  document.getElementById("coach").hidden = true;
  maybeCoach();
};

function onBattleOver() {
  const battle = App.battle;
  const fight = App.fight;
  const hero = battle.hero;
  const enemy = battle.foes[0];
  const won = battle.over === "hero";
  hero.records.maxHit = Math.max(Number(hero.records.maxHit || 0), battle.stats.maxHit);
  clearBattleState(hero);

  if (!won) {
    if (fight.mode === "guardian") {
      restoreHero(hero);
      hero.records.deaths += 1;
      const lostBefore = getLostMemories(hero).length;
      noteStoryDeath(hero);
      noteCampTrip(hero, { outcome: "death", kind: "guardian", guardian: enemy.defId });
      persist();
      SFX.play("lose");
      afterMemoryLoss(hero, lostBefore, () => openResultCard({ title: "Страж устоял", text: `${enemy.name} оказался сильнее. Клеймо вернуло тебя в лагерь, а вещи целы. Укрепись и возвращайся.`, buttonLabel: "К лагерю", onContinue: () => { App.tab = "trail"; setScreen("hub"); } }));
      return;
    }
    hero.currentHp = 1;
    const lostBefore = getLostMemories(hero).length;
    const summary = finishExpedition(hero, hero.expedition, "death");
    afterMemoryLoss(hero, lostBefore, () => showExpeditionSummary(summary));
    return;
  }

  SFX.play("win");
  const rewards = calculateEncounterRewards(hero, battle.foes, fight.zoneKey, fight.regionId);
  battle.foes.filter((foe) => foe.share > 0).forEach((foe) => recordKill(hero, foe));
  const levelUp = awardExperience(hero, rewards.exp);
  let finishedTrail = false;
  if (fight.mode === "guardian") {
    onGuardianDefeated(hero, enemy);
    hero.gold += rewards.gold;
    hero.mutationShards += rewards.shards;
    Object.entries(rewards.resources).forEach(([id, amount]) => { hero.resources[id] = Number(hero.resources[id] || 0) + amount; });
    rewards.items.forEach((item) => stowOrSell(hero, item));
    restoreHero(hero);
  } else {
    applyRewardsToBag(hero, hero.expedition, rewards);
    finishedTrail = completeStep(hero, hero.expedition);
  }
  persist();

  const statsLine = `Ходов: ${battle.stats.turns} · Лучший удар: ${battle.stats.maxHit}${battle.stats.crits ? ` · Критов: ${battle.stats.crits}` : ""}`;
  const onContinue = () => {
    const pending = getPendingMasterySkills(hero);
    const proceed = () => {
      promptPathIfReady();
      if (fight.mode === "guardian") {
        App.tab = "trail";
        App.regionIndex = hero.unlockedRegion;
        setScreen("hub");
        if (!enemy.isFinal) toast(`Открыт новый регион: ${REGIONS[hero.unlockedRegion].name}.`, "good");
      } else if (finishedTrail) {
        showExpeditionSummary(finishExpedition(hero, hero.expedition, "complete"));
      } else {
        setScreen("trail");
      }
    };
    if (pending.length) openMasteryModal(pending[0], proceed);
    else proceed();
  };
  openResultCard({
    title: enemy.isGuardian ? "Страж повержен!" : "Победа!",
    text: statsLine,
    rewards,
    secured: fight.mode === "guardian",
    levelUp: levelUp.levels ? levelUp : null,
    buttonLabel: finishedTrail ? "Завершить поход" : fight.mode === "guardian" ? "К лагерю" : "Дальше по тропе",
    onContinue
  });
}

function openResultCard({ title, text, rewards = null, levelUp = null, buttonLabel, onContinue, secured = false }) {
  App.resultContinue = onContinue;
  const rewardHtml = rewards ? `<div class="reward-line"><span class="chip">Опыт +${rewards.exp}${rewards.bossMult > 1 ? ` <small>×${rewards.bossMult}</small>` : ""}</span><span class="chip gold">${icon("gold")}+${rewards.gold}</span>${rewards.shards ? `<span class="chip shard">${icon("shard")}+${rewards.shards}</span>` : ""}${resourceChips(rewards.resources)}</div>
    ${rewards.items.length ? `<div class="reward-items">${rewards.items.map(rewardItemRow).join("")}</div>` : ""}
    ${secured ? "" : `<p class="muted small">${rewards.items.length ? "Вещи уже в рюкзаке. Если погибнешь, пропадёт всё, что не надето, и половина золота." : "Золото и материалы станут твоими, когда поход закончится."}</p>`}` : "";
  if (rewards?.items?.length) SFX.play("loot");
  if (levelUp) SFX.play("level");
  const levelHtml = levelUp ? levelUpBlock(levelUp) : "";
  openModal(`<h2 class="result-title">${esc(title)}</h2><p class="muted">${esc(text)}</p>${levelHtml}${rewardHtml}<div class="modal-actions"><button class="btn primary big" data-action="resultContinue" data-autofocus>${esc(buttonLabel)}</button></div>`, { dismissable: false });
}

function rewardItemRow(item) {
  const hero = App.hero;
  const index = hero.inventory.indexOf(item);
  const can = index >= 0 && canEquip(hero, item);
  const gain = can ? itemPowerScore(item, hero.classKey) - itemPowerScore(hero.equipment[chooseEquipSlot(hero, item)], hero.classKey) : 0;
  const action = can
    ? `<button class="btn small push" data-action="quickEquip" data-id="${esc(item.id)}">Надеть</button>`
    : index < 0 ? '<small class="push muted">рюкзак полон</small>' : `<small class="push warn-text">нужен ${item.requiredLevel} ур.</small>`;
  return `<div class="reward-item rarity-${item.rarity}" ${index >= 0 ? `data-tip="item|inv|${index}"` : ""}>${itemIcon(item)}<span class="rarity-text-${item.rarity}">${esc(getItemDisplayName(item))}</span>${gain > 0 ? '<span class="better">лучше</span>' : ""}${action}</div>`;
}

Actions.quickEquip = (el) => {
  const hero = App.hero;
  const index = hero.inventory.findIndex((item) => item?.id === el.dataset.id);
  if (index < 0) return;
  if (!notifyResult(equipFromInventory(hero, index))) return;
  persist();
  el.replaceWith(Object.assign(document.createElement("small"), { className: "push accent-text", textContent: "Надето" }));
};

function levelUpBlock(summary) {
  const names = summary.unlocked.map((id) => getSkillDefinition(id)?.name).filter(Boolean);
  const talentLine = `<small class="accent-text">+${summary.levels} очк. талантов: загляни в раздел «Таланты».</small>`;
  return `<div class="level-up"><div class="level-num">${summary.newLevel}</div><div><strong>Новый уровень!</strong>${talentLine}<small>+${summary.statPoints} очка характеристик${summary.skillPoints ? `, +${summary.skillPoints} очко навыка` : ""}. Распредели очки в разделе «Герой».</small>${names.length ? `<small class="accent-text">Можно изучить: ${esc(names.join(", "))}</small>` : ""}${summary.previousLevel < SUBCLASS_UNLOCK_LEVEL && summary.newLevel >= SUBCLASS_UNLOCK_LEVEL ? `<small class="accent-text">Открыт выбор подкласса в разделе «Навыки».</small>` : ""}${summary.previousLevel < PROFESSION_UNLOCK_LEVEL && summary.newLevel >= PROFESSION_UNLOCK_LEVEL ? `<small class="accent-text">Открыт выбор профессии в разделе «Навыки».</small>` : ""}</div></div>`;
}

function showLevelUp(summary) {
  SFX.play("level");
  openModal(`${levelUpBlock(summary)}<div class="modal-actions"><button class="btn primary" data-action="closeModal" data-autofocus>Отлично</button></div>`);
}

Actions.resultContinue = () => {
  const next = App.resultContinue;
  App.resultContinue = null;
  const layers = document.querySelectorAll(".modal-layer");
  layers[layers.length - 1]?.remove();
  next?.();
};

