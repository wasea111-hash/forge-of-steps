// The right mouse button is a game key, not the browser's menu.
// On a thing: look at it closely, or do its quick action (put on / take off a thing).
// On empty space: step back (close the window, leave the camp place).
// A long press on a phone gives the same.

function rightTarget(event) {
  // Disabled buttons swallow mouse events in some browsers, so look at what lies under the cursor.
  const stack = document.elementsFromPoint ? document.elementsFromPoint(event.clientX, event.clientY) : [event.target];
  for (const node of [event.target, ...stack]) {
    const el = node?.closest?.("[data-action], [data-tip], .modal-card, .story-layer, .tooltip");
    if (el) return el;
  }
  return null;
}

function inspectCard(html) {
  if (!html) return false;
  hideTooltip();
  openModal(`<div class="inspect-card">${html}</div><p class="inspect-hint muted">Правая кнопка или Esc — закрыть.</p><div class="modal-actions"><button class="btn" data-action="closeModal" data-autofocus>Закрыть</button></div>`);
  document.querySelector(".modal-layer:last-child")?.classList.add("inspect");
  return true;
}

function inspectFoe(slot) {
  const battle = App.battle;
  const foe = battle?.foes?.[slot];
  if (!foe) return false;
  const traits = (foe.traits || []).filter((id) => ENEMY_TRAITS[id]);
  const intent = battle.over || foe.currentHp <= 0 ? null : describeIntentFor(battle, foe);
  const status = foe.currentHp > 0 ? `${foe.level} ур. · здоровье ${Math.max(0, Math.round(foe.currentHp))} из ${foe.maxHp}` : `${foe.level} ур. · повержен`;
  let html = tipBlock(foe.name, foe.lore || "", status);
  if (intent) html += tipBlock("Следующий ход", `${intent.name}${intent.targetName ? ` → ${intent.targetName}` : ""}${intent.damage ? ` · около ${intent.hits > 1 ? `${intent.damage}×${intent.hits}` : intent.damage} урона` : ""}`);
  traits.forEach((id) => { html += tipBlock(ENEMY_TRAITS[id].name, ENEMY_TRAITS[id].description, "Повадка врага"); });
  return inspectCard(html);
}

// Quick action on a thing in the bag or on the hero; anything else about a thing is a close look.
function quickItem(el) {
  const { source, key } = el.dataset;
  const item = getItemByRef(source, key);
  if (!item) return false;
  const hero = App.hero;
  if (source === "inv" && el.dataset.action === "itemOpen") {
    if (!canEquip(hero, item)) { Actions.itemOpen(el); return true; }
    if (notifyResult(equipFromInventory(hero, Number(key), null), `Надето: ${getItemDisplayName(item)}.`)) { SFX.play("click"); commit(); }
    return true;
  }
  if (source === "eq" && el.dataset.action === "itemOpen") {
    if (notifyResult(unequipToInventory(hero, key), `Снято: ${getItemDisplayName(item)}.`)) { SFX.play("click"); commit(); }
    return true;
  }
  return inspectCard(itemTooltip(item, source === "eq" ? key : null));
}

function stepBack() {
  const modal = document.querySelector(".modal-layer:last-child");
  if (modal) { if (modal.dataset.dismissable === "true") closeModal(); return; }
  if (document.querySelector(".story-layer")) return;
  if (App.screen === "hub" && App.tab && App.tab !== "camp" && typeof campPlaceOf === "function" && campPlaceOf(App.tab)) { Actions.closePlace(); return; }
  if (App.screen === "hub" && App.fireOpen) Actions.fireHide();
}

function rightClick(event) {
  const el = rightTarget(event);
  const topModal = document.querySelector(".modal-layer:last-child");
  // A close look is closed by the same key that opened it.
  if (topModal?.classList.contains("inspect")) { closeModal(); return; }
  // Inside a window only things are looked at; the window itself is left with the right button.
  if (topModal && (!el || !topModal.contains(el) || el.classList.contains("modal-card"))) { stepBack(); return; }
  if (!el || el.classList.contains("story-layer") || el.classList.contains("tooltip")) { if (!el) stepBack(); return; }
  if (el.classList.contains("modal-card")) return;
  const action = el.dataset.action;
  if (el.classList.contains("item-cell") && el.dataset.source) { quickItem(el); return; }
  if (action === "setTarget") { inspectFoe(Number(el.dataset.slot)); return; }
  if (action === "campPlace") { if (el.getAttribute("aria-disabled") !== "true") Actions.campPlace(el); return; }
  const tipped = el.dataset.tip ? el : el.closest("[data-tip]");
  if (tipped) inspectCard(resolveTip(tipped.dataset.tip));
}

document.addEventListener("contextmenu", (event) => {
  // Text fields keep the usual menu: copy and paste are needed there.
  if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
  if (App.screen === "intro") return;
  rightClick(event);
});
