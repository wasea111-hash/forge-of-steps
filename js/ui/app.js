// App shell: state, routing, delegation, modals, tooltips and shared renderers.
const App = {
  save: null, hero: null, screen: "title", tab: "trail", regionIndex: 0, battle: null, fight: null,
  creation: null, skillSlot: 0, forge: { mode: "enhance", ref: null }, shopTab: "gear", journalTab: "story", eventState: null, modalQueue: [], dev: false, bagOpen: false
};
const Actions = {};
const Screens = {};
const rootEl = () => document.getElementById("app");

function persist() {
  if (App.hero) {
    App.save.heroes[App.hero.id] = serializeHero(App.hero);
    App.save.activeId = App.hero.id;
  }
  if (!writeSave(App.save)) toast("Не удалось сохранить игру: хранилище браузера переполнено.", "bad");
}

function setScreen(name, patch = {}) {
  Object.assign(App, patch, { screen: name });
  hideTooltip();
  render();
  GameAudio.syncScene();
}

function render() {
  const screen = Screens[App.screen] || Screens.title;
  rootEl().innerHTML = screen();
  rootEl().dataset.screen = App.screen;
  afterRender();
}

// The tree opens where the player stands: on the step to choose, or the last one chosen.
function placeTreeView() {
  const box = document.getElementById("treeScroll");
  if (!box) return;
  const nodes = box.querySelectorAll(".tree-node.ready");
  const learned = box.querySelectorAll(".tree-node.learned");
  const spot = nodes[0] || learned[learned.length - 1];
  if (!spot) return;
  box.scrollLeft = Math.max(0, spot.offsetLeft - box.clientWidth / 2);
  box.scrollTop = Math.max(0, spot.offsetTop - box.clientHeight / 2);
}

function afterRender() {
  document.querySelectorAll("canvas[data-scene]").forEach((canvas) => {
    paintScene(canvas, canvas.dataset.scene, canvas.dataset.zone || null, Number(canvas.dataset.seed || 7));
  });
  const fxCanvas = document.querySelector("canvas[data-fx]");
  if (fxCanvas) FX.attach(fxCanvas, fxCanvas.dataset.fx || null);
  else FX.detach();
  document.querySelector("[data-autofocus]")?.focus();
  placeTreeView();
  if (App.hero) { syncStoryEvents(App.hero); scheduleStory(); }
}

window.addEventListener("resize", () => {
  clearTimeout(window.__rz);
  window.__rz = setTimeout(() => {
    document.querySelectorAll("canvas[data-scene]").forEach((canvas) => paintScene(canvas, canvas.dataset.scene, canvas.dataset.zone || null, Number(canvas.dataset.seed || 7)));
    FX.resize();
  }, 150);
});

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
  const handler = Actions[el.dataset.action];
  if (handler) {
    SFX.play(el.dataset.sound || "click");
    hideTooltip();
    handler(el, event);
  }
});

document.addEventListener("input", (event) => {
  const el = event.target.closest("[data-input]");
  if (el && Actions[el.dataset.input]) Actions[el.dataset.input](el, event);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modal = document.querySelector(".modal-layer:last-child");
    if (modal && modal.dataset.dismissable === "true") closeModal();
    return;
  }
  if (["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
  if (App.screen === "battle" && !document.querySelector(".modal-layer")) battleHotkey(event);
});

// --- Toast ---
function toast(text, tone = "neutral") {
  let wrap = document.getElementById("toasts");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toasts";
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add("leaving"), 2600);
  setTimeout(() => el.remove(), 3000);
}

function notifyResult(result, okText = "") {
  if (result?.ok) {
    if (okText) toast(okText, "good");
    return true;
  }
  SFX.play("error");
  toast(result?.reason || "Не получилось.", "bad");
  return false;
}

// --- Modals ---
function openModal(html, { dismissable = true, onClose = null, wide = false } = {}) {
  const layer = document.createElement("div");
  layer.className = "modal-layer";
  layer.dataset.dismissable = String(dismissable);
  layer.innerHTML = `<div class="modal-card${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  layer.__onClose = onClose;
  layer.addEventListener("mousedown", (event) => {
    if (event.target === layer && dismissable) closeModal();
  });
  document.body.appendChild(layer);
  hideTooltip();
  layer.querySelector("[data-autofocus], button")?.focus();
  return layer;
}

function closeModal() {
  const layers = document.querySelectorAll(".modal-layer");
  const layer = layers[layers.length - 1];
  if (!layer) return;
  const callback = layer.__onClose;
  layer.remove();
  hideTooltip();
  callback?.();
}

Actions.closeModal = () => closeModal();

function confirmDialog({ title, text, confirmLabel = "Подтвердить", danger = false }) {
  return new Promise((resolve) => {
    Actions.__confirm = (el) => { const ok = el.dataset.value === "1"; const layers = document.querySelectorAll(".modal-layer"); layers[layers.length - 1]?.remove(); resolve(ok); };
    openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="modal-actions"><button class="btn ${danger ? "danger" : "primary"}" data-action="__confirm" data-value="1">${esc(confirmLabel)}</button><button class="btn" data-action="__confirm" data-value="0" data-autofocus>Отмена</button></div>`, { onClose: () => resolve(false) });
  });
}

function promptDialog({ title, value = "", placeholder = "", confirmLabel = "Готово", maxLength = 24 }) {
  return new Promise((resolve) => {
    Actions.__prompt = () => { const input = document.getElementById("promptInput"); const text = input.value.trim(); const layers = document.querySelectorAll(".modal-layer"); layers[layers.length - 1]?.remove(); resolve(text || null); };
    openModal(`<h2>${esc(title)}</h2><input id="promptInput" class="field" maxlength="${maxLength}" value="${esc(value)}" placeholder="${esc(placeholder)}" data-autofocus><div class="modal-actions"><button class="btn primary" data-action="__prompt">${esc(confirmLabel)}</button><button class="btn" data-action="closeModal">Отмена</button></div>`, { onClose: () => resolve(null) });
    document.getElementById("promptInput").select();
  });
}

// --- Tooltips ---
let tooltipEl = null;
let tooltipTimer = null;

function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function showTooltip(target, html) {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("visible");
  const rect = target.getBoundingClientRect();
  const tip = tooltipEl.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tip.width / 2;
  let top = rect.top - tip.height - 10;
  if (top < 8) top = rect.bottom + 10;
  left = clamp(left, 8, window.innerWidth - tip.width - 8);
  top = clamp(top, 8, window.innerHeight - tip.height - 8);
  tooltipEl.style.left = `${Math.round(left)}px`;
  tooltipEl.style.top = `${Math.round(top)}px`;
}

function resolveTip(token) {
  const hero = App.hero;
  const [kind, a, b] = token.split("|");
  switch (kind) {
    case "skill": return skillTooltip(getSkillDefinition(a));
    case "slot": return skillTooltip(getActiveSkillFromSlot(hero, Number(a))) || tipBlock("Пустой слот", "Назначь сюда навык в разделе «Навыки».");
    case "item": { const item = getItemByRef(a, b); return item ? itemTooltip(item, a === "eq" ? b : null) : ""; }
    case "effect": return effectTooltip(a, Number(b));
    case "res": { const res = SHOP_RESOURCE_CATALOG.find((entry) => entry.id === a); return res ? tipBlock(res.name, res.description) : ""; }
    case "text": return tipBlock(a, b || "");
    case "ult": { const ult = getHeroUltimate(hero); return tipBlock(ult.name, ult.description, hero.level >= ULTIMATE_LEVEL ? "Заряжается от действий, ран и убийств" : `Откроется на ${ULTIMATE_LEVEL} уровне`); }
    case "set": { const set = SET_CATALOG[a]; return set ? tipBlock(set.name, `2 вещи: ${set.bonus2.description} 4 вещи: ${set.bonus4.description}${set.bonus6 ? ` 6 вещей: ${set.bonus6.description}` : ""}${set.bonus8 ? ` 8 вещей: ${set.bonus8.description}` : ""}`, `Надето: ${getActiveSetCounts(hero)[a] || 0} из ${SET_FULL}`) : ""; }
    case "action": return battleActionTip(a);
    case "mech": { const def = MECHANICS[a]; return def ? tipBlock(def.name, def.description) : ""; }
    case "enemy": { const def = ENEMY_DEFINITIONS[a]; return def ? tipBlock(def.name, def.lore, (def.traits || []).map((id) => ENEMY_TRAITS[id]?.name).filter(Boolean).join(" · ")) : ""; }
    case "trait": { const def = ENEMY_TRAITS[a]; return def ? tipBlock(def.name, def.description, "Повадка врага") : ""; }
    case "boon": { const def = BOONS[a]; return def ? tipBlock(def.name, def.description, def.cursed ? "Проклятый дар тропы" : "Дар тропы до конца похода") : ""; }
    case "talent": { const def = TALENTS[a]; if (!def) return ""; const check = canTakeTalent(hero, a); return tipBlock(def.name, def.description, `${TALENT_KINDS[def.kind].name} · стоимость ${def.cost}${hero.talents.includes(a) || check.ok ? "" : ` · ${check.reason}`}`); }
    default: return "";
  }
}

function tipBlock(title, text, meta = "") {
  return `<div class="tip-title">${esc(title)}</div>${text ? `<div class="tip-text">${esc(text)}</div>` : ""}${meta ? `<div class="tip-meta">${esc(meta)}</div>` : ""}`;
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-tip]");
  hideTooltip();
  if (!target || (App.screen === "battle" && App.fight?.playing)) return;
  tooltipTimer = setTimeout(() => {
    if (!target.isConnected) return;
    const html = resolveTip(target.dataset.tip);
    if (html) showTooltip(target, html);
  }, 260);
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest("[data-tip]");
  if (target && event.target.matches(":focus-visible")) {
    const html = resolveTip(target.dataset.tip);
    if (html) showTooltip(target, html);
  }
});
document.addEventListener("focusout", hideTooltip);
document.addEventListener("scroll", hideTooltip, true);

function skillTooltip(rawSkill) {
  if (!rawSkill) return "";
  const hero = App.hero;
  // The tip tells about the skill as this hero really uses it.
  const form = hero ? getHeroSkillForm(hero, rawSkill.id) : null;
  const skill = hero ? getHeroSkill(hero, rawSkill) : rawSkill;
  if (form) return skillTooltipBody({ ...skill, description: `${form.name}. ${form.description}` }, hero);
  return skillTooltipBody(skill, hero);
}

function skillTooltipBody(skill, hero) {
  const details = hero ? describeSkillDetails(skill, hero) : [];
  const locked = hero && !isSkillLearned(hero, skill.id) ? `Изучается с ${skill.unlockLevel} уровня` : "";
  return `<div class="tip-title">${esc(skill.name)}</div><div class="tip-text">${esc(skill.description)}</div><ul class="tip-list">${details.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>${locked ? `<div class="tip-meta">${esc(locked)}</div>` : ""}`;
}

function effectTooltip(side, index) {
  const unit = side === "hero" ? App.hero : App.battle?.foes?.[Number(String(side).replace("foe", ""))];
  const effect = unit?.effects?.[index];
  const def = STATUS_EFFECT_DEFINITIONS[effect?.id];
  if (!effect || !def) return "";
  let power = "";
  if (def.ratio) power = effect.id === "evasion" ? `Сила: +${effect.value}%` : `Сила: ${Math.round((effect.value >= 1 ? 0.2 : effect.value) * 100)}%`;
  else if (effect.id !== "stun" && effect.id !== "silence") power = `Сила: ${Math.round(effect.value)}`;
  if (effect.id === "poison") power = `Сейчас за тик: ${Math.round(effect.value * (1 + Math.min(POISON_RAMP_MAX, Number(effect.meta?.elapsedTicks || 0)) * POISON_RAMP))}`;
  const stacks = effect.id === "burn" ? `Стаки: ${getEffectStacks(effect)} из ${effect.meta?.maxStacks || BURN_DETONATION_THRESHOLD}` : "";
  return tipBlock(def.name, def.description, [power, stacks, `Осталось: ${turnsLabel(effect.duration)}`].filter(Boolean).join(" · "));
}

function getItemByRef(source, key) {
  const hero = App.hero;
  if (source === "inv") return hero.inventory[Number(key)];
  if (source === "eq") return hero.equipment[key];
  if (source === "shop") return hero.shop?.stock?.[Number(key)];
  if (source === "bag") return hero.expedition?.bag?.items?.[Number(key)];
  return null;
}

const CLASS_LABELS = { warrior: "воин", mage: "маг", archer: "лучник", bard: "бард", assassin: "ассасин" };

function itemKindLabel(item) {
  const bp = ITEM_BLUEPRINTS.find((entry) => entry.name === item.blueprint);
  const parts = [slotTypeLabel(item.slotType)];
  if (bp?.armor) parts.push(ARMOR_NAMES[bp.armor]);
  if (bp?.offhand) parts.push("вторая рука");
  return parts.join(", ");
}

function itemClassLine(item) {
  const classes = itemClasses(item);
  if (!classes || classes.length >= 5) return "Для всех классов";
  return `Для: ${classes.map((key) => (CLASS_LABELS[key] || key)).join(", ")}`;
}

function itemDetailHtml(item, equippedSlotKey = null) {
  const hero = App.hero;
  const lines = describeItemBonuses(item);
  const trait = item.trait ? LEGENDARY_TRAITS[item.trait] : null;
  const blocked = hero && hero.level < item.requiredLevel;
  let compare = "";
  if (hero && !equippedSlotKey) {
    const deltas = previewEquipDelta(hero, item);
    const slot = chooseEquipSlot(hero, item);
    const current = hero.equipment[slot];
    compare = `<div class="tip-compare"><div class="tip-meta">${current ? `Вместо: ${esc(getItemDisplayName(current))}` : "Слот свободен"}</div>${deltas.slice(0, 7).map((d) => `<div class="delta ${d.delta > 0 ? "up" : "down"}"><span>${esc(d.label)}</span><b>${d.delta > 0 ? "+" : ""}${d.delta}${isPercentStat(d.key) ? "%" : ""}</b></div>`).join("") || `<div class="tip-meta">Заметной разницы нет</div>`}</div>`;
  }
  return `<div class="tip-title rarity-text-${item.rarity}">${esc(getItemDisplayName(item))}</div>
    <div class="tip-meta">${esc(RARITY_CONFIG[item.rarity].label)} · ${esc(itemKindLabel(item))} · ур. вещи ${item.itemLevel}</div>
    <div class="tip-meta${hero && !fitsClass(item, hero.classKey) ? " lack" : ""}">${esc(itemClassLine(item))}</div>
    <ul class="tip-list">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    ${trait ? `<div class="tip-trait"><b>${esc(trait.name)}.</b> ${esc(trait.description)}</div>` : ""}
    ${item.setId ? `<div class="tip-trait set"><b>Комплект «${esc(SET_CATALOG[item.setId].name)}»</b> (${hero ? getActiveSetCounts(hero)[item.setId] || 0 : 0}/${SET_FULL}). 2 вещи: ${esc(SET_CATALOG[item.setId].bonus2.description)} 4 вещи: ${esc(SET_CATALOG[item.setId].bonus4.description)} 6 вещей: ${esc(SET_CATALOG[item.setId].bonus6?.description || "")} 8 вещей: ${esc(SET_CATALOG[item.setId].bonus8?.description || "")}</div>` : ""}
    ${item.fromTrail ? `<div class="tip-meta warn">Найдено в походе: пропадёт при гибели, если не надето</div>` : ""}
    <div class="tip-meta${blocked ? " warn" : ""}">Требуется ${item.requiredLevel} уровень${item.enhanceLevel ? ` · заточка +${item.enhanceLevel}` : ""}</div>${compare}`;
}

function itemTooltip(item, slotKey) {
  return itemDetailHtml(item, slotKey);
}

// --- Shared bits ---
function bar(value, max, kind, label = "") {
  return `<div class="bar bar-${kind}"><div class="bar-fill" style="width:${percent(value, max)}%"></div><span class="bar-text">${label || `${Math.round(value)} / ${Math.round(max)}`}</span></div>`;
}

function itemCell(item, source, key, { emptyIcon = "bag", action = "itemOpen", label = "" } = {}) {
  if (!item) return `<div class="item-cell empty" ${label ? `title="${esc(label)}"` : ""}>${icon(emptyIcon, "dim")}</div>`;
  return `<button class="item-cell rarity-${item.rarity}" data-action="${action}" data-source="${source}" data-key="${key}" data-tip="item|${source}|${key}" aria-label="${esc(getItemDisplayName(item))}">${itemIcon(item)}${item.enhanceLevel ? `<span class="enh">+${item.enhanceLevel}</span>` : ""}${item.trait ? `<span class="legend-dot"></span>` : ""}${item.fromTrail ? `<span class="trail-mark"></span>` : ""}${App.hero.level < item.requiredLevel ? `<span class="req">${item.requiredLevel}</span>` : ""}</button>`;
}

// A cell in "pick several" mode: a click marks the thing instead of opening it.
function pickCell(item, index) {
  if (!item) return itemCell(null, "inv", index);
  const picked = App.bagPick?.includes(index);
  return `<div class="pick-cell${picked ? " picked" : ""}">${itemCell(item, "inv", index, { action: "bagToggle" })}${isProtectedItem(item) ? `<i class="pick-lock" aria-hidden="true">★</i>` : ""}</div>`;
}

function resourceChips(resources, showZero = false) {
  return SHOP_RESOURCE_CATALOG.filter((res) => showZero || Number(resources?.[res.id] || 0) > 0)
    .map((res) => `<span class="chip rarity-text-${res.rarity}" data-tip="res|${res.id}">${icon(RESOURCE_ICON[res.id])}${Number(resources?.[res.id] || 0)}</span>`).join("");
}

function pendingBadgeCount(tab) {
  const hero = App.hero;
  if (tab === "hero") return hero.statPoints;
  if (tab === "talents") return Math.max(0, getDevPointsFree(hero));
  if (tab === "skills") {
    const openForms = getDevPointsFree(hero) > 0 ? getVisibleClassSkills(hero, "active").filter((skill) => getSkillForms(skill.id).length && !hero.skillForms?.[skill.id] && Number(skill.unlockLevel || 1) <= hero.level).length : 0;
    return openForms + (hero.level >= STYLE_UNLOCK_LEVEL && !hero.styleId ? 1 : 0) + (getPendingUltimateChoice(hero) ? 1 : 0);
  }
  return 0;
}

// --- Boot ---
function loadHeroById(id) {
  const raw = App.save.heroes[id];
  if (!raw) return false;
  App.hero = normalizeHero(raw);
  if (!App.hero.shop) refreshShopStock(App.hero);
  App.regionIndex = App.hero.unlockedRegion;
  App.tab = "trail";
  return true;
}

function applySettings() {
  const s = App.save.settings;
  SFX.enabled = s.sound;
  SFX.volume = Number(s.volume ?? 0.6);
  GameAudio.configure({ enabled: Boolean(s.sound), sfx: Number(s.volume ?? 0.6), music: Number(s.music ?? 0.5), ambience: Number(s.ambience ?? 0.3) });
  FX.reduced = Boolean(s.reducedMotion) || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  document.documentElement.classList.toggle("reduced", FX.reduced);
}

function bootGame() {
  App.save = loadSave();
  App.dev = new URLSearchParams(location.search).get("dev") === "1";
  applySettings();
  setScreen("title");
}

window.addEventListener("DOMContentLoaded", bootGame);
