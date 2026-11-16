// Keys of the battle, chosen by the player. Bound to the physical key (event.code),
// so Q works the same with the Russian layout (Й) and the English one.
const KEY_ACTIONS = [
  { id: "attack", name: "Удар", def: "KeyQ", ally: "Обычный приём спутника" },
  { id: "guard", name: "Стойка", def: "KeyW", ally: "Закрыться" },
  { id: "wait", name: "Выждать", def: "KeyE", ally: "Выждать" },
  { id: "hp", name: "Зелье здоровья", def: "KeyR" },
  { id: "mp", name: "Зелье маны", def: "KeyT" },
  { id: "ult", name: "Ультимейт", def: "KeyF" },
  { id: "skill1", name: "Навык 1", def: "Digit1", ally: "Приём спутника 1" },
  { id: "skill2", name: "Навык 2", def: "Digit2", ally: "Приём спутника 2" },
  { id: "skill3", name: "Навык 3", def: "Digit3", ally: "Приём спутника 3" },
  { id: "skill4", name: "Навык 4", def: "Digit4", ally: "Приём спутника 4" },
  { id: "skill5", name: "Навык 5", def: "Digit5", ally: "Приём спутника 5" },
  { id: "target", name: "Следующая цель", def: "Tab" },
  { id: "auto", name: "Автобой", def: "KeyA" },
  { id: "allyAuto", name: "Спутник решает сам", def: "KeyC" }
];
const KEY_ACTION = Object.fromEntries(KEY_ACTIONS.map((entry) => [entry.id, entry]));
// Keys that already mean something everywhere and cannot be taken.
const KEY_RESERVED = new Set(["Escape", "Enter", "Space", "NumpadEnter"]);

function keyBindings() {
  const saved = App.save?.settings?.keys || {};
  return Object.fromEntries(KEY_ACTIONS.map((entry) => [entry.id, saved[entry.id] || entry.def]));
}

function keyOf(id) {
  return keyBindings()[id] || KEY_ACTION[id]?.def || "";
}

// What is written on the key cap.
function keyLabel(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  const names = { Tab: "Tab", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Alt", AltRight: "Alt", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", CapsLock: "Caps", Backspace: "⌫" };
  return names[code] || code;
}

function kbd(id) {
  return `<kbd>${esc(keyLabel(keyOf(id)))}</kbd>`;
}

// The action of a pressed key, or null. Digits 6–9 stay for the companion's later skills.
function keyAction(event) {
  const code = event.code;
  const bound = keyBindings();
  const id = Object.keys(bound).find((key) => bound[key] === code);
  return id || null;
}

// --- The controls window ---
function controlsHtml() {
  const rows = KEY_ACTIONS.map((entry) => `<tr><td>${esc(entry.name)}${entry.ally ? `<small class="muted"> · в ход спутника: ${esc(entry.ally)}</small>` : ""}</td>
    <td><button class="key-btn${App.keyWait === entry.id ? " waiting" : ""}" data-action="bindKey" data-id="${entry.id}">${App.keyWait === entry.id ? "Нажми клавишу…" : esc(keyLabel(keyOf(entry.id)))}</button></td></tr>`).join("");
  return `<h2>Управление</h2>
    <h3>Мышь</h3>
    <table class="controls-table"><tbody>
      <tr><td>Левая кнопка</td><td>выбрать, открыть, нажать</td></tr>
      <tr><td>Правая кнопка по вещи в сумке</td><td>надеть сразу; по надетой — снять</td></tr>
      <tr><td>Правая кнопка по врагу</td><td>карточка врага: здоровье, следующий ход, повадки</td></tr>
      <tr><td>Правая кнопка по навыку, эффекту, ресурсу</td><td>карточка осмотра</td></tr>
      <tr><td>Правая кнопка по пустому месту</td><td>назад: закрыть окно, вернуться к костру</td></tr>
      <tr><td>Долгое нажатие на телефоне</td><td>то же, что правая кнопка</td></tr>
      <tr><td>Esc</td><td>закрыть окно или место лагеря</td></tr>
    </tbody></table>
    <h3>Клавиши боя</h3>
    <p class="muted small">Нажми на клавишу в таблице, затем новую клавишу. Раскладка не важна: клавиша узнаётся по месту на клавиатуре. Esc отменяет.</p>
    <table class="controls-table keys"><tbody>${rows}</tbody></table>
    <div class="modal-actions wrap"><button class="btn small" data-action="resetKeys">Вернуть как было</button><button class="btn primary" data-action="closeModal" data-autofocus>Готово</button></div>`;
}

function refreshControls() {
  const card = document.querySelector(".modal-layer:last-child .modal-card.controls");
  if (card) card.innerHTML = controlsHtml();
}

Actions.openControls = () => {
  App.keyWait = null;
  openModal(controlsHtml(), { wide: true, onClose: () => { App.keyWait = null; } });
  document.querySelector(".modal-layer:last-child .modal-card")?.classList.add("controls");
};

Actions.bindKey = (el) => {
  App.keyWait = App.keyWait === el.dataset.id ? null : el.dataset.id;
  refreshControls();
};

Actions.resetKeys = () => {
  App.save.settings.keys = {};
  writeSave(App.save);
  App.keyWait = null;
  refreshControls();
  toast("Клавиши как в начале.", "good");
};

// While a key is being chosen, the next press goes here and nowhere else.
document.addEventListener("keydown", (event) => {
  if (!App.keyWait) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const id = App.keyWait;
  if (event.code === "Escape") { App.keyWait = null; refreshControls(); return; }
  if (KEY_RESERVED.has(event.code)) { toast(`${keyLabel(event.code)} занята: ею закрывают и подтверждают окна.`, "warn"); return; }
  const keys = { ...keyBindings() };
  const other = Object.keys(keys).find((key) => key !== id && keys[key] === event.code);
  // Taking a key from another action gives that action the old key: nothing is left without a key.
  if (other) keys[other] = keys[id];
  keys[id] = event.code;
  App.save.settings.keys = keys;
  writeSave(App.save);
  App.keyWait = null;
  refreshControls();
  if (other) toast(`${KEY_ACTION[other].name} теперь на ${keyLabel(keys[other])}.`, "neutral");
}, true);
