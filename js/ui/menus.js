// Title screen, hero creation, roster and settings.
const CLASS_ROLE = {
  warrior: { role: "Танк и ближний бой", difficulty: "Простой", tip: "Переносит удары лучше всех и тратит мало ресурсов." },
  mage: { role: "Магический урон", difficulty: "Средний", tip: "Самый сильный урон и больше всего путей развития, но важно следить за маной." },
  archer: { role: "Точность и криты", difficulty: "Простой", tip: "Быстрый, часто уклоняется и бьёт издалека." },
  bard: { role: "Поддержка и живучесть", difficulty: "Средний", tip: "Лечит себя и побеждает в затяжных боях." },
  assassin: { role: "Темп и добивание", difficulty: "Сложный", tip: "Огромный урон по цели, но ошибки стоят дорого." }
};

Screens.title = () => {
  const heroes = Object.values(App.save.heroes).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const last = App.save.heroes[App.save.activeId] || heroes[0];
  return `
  <div class="title-screen${hasArt("bg_title") ? " has-art" : ""}">
    ${sceneImg("bg_title")}
    <canvas class="scene-canvas" data-scene="forge" data-seed="3"></canvas>
    <canvas class="fx-canvas" data-fx="ember"></canvas>
    <div class="title-content">
      <div class="logo-block">
        <div class="logo-mark">${icon("anvil")}</div>
        <img class="title-logo-emblem" src="assets/ui/emblem.webp" alt=""><h1 class="logo">Кузница Шагов</h1>
        <p class="tagline">Каждый шаг к Пределу куётся в бою</p>
      </div>
      <div class="title-menu">
        ${last ? `<button class="btn primary big" data-action="continueHero" data-id="${esc(last.id)}" data-autofocus><span>Продолжить</span><small>${esc(last.name)} · ${esc(classDefinitions[last.classKey]?.name || "")}, ${last.level} уровень</small></button>` : ""}
        <button class="btn ${last ? "" : "primary"} big" data-action="newHero" ${last ? "" : "data-autofocus"}>Новый герой</button>
        ${heroes.length ? `<button class="btn big" data-action="openRoster">Мои герои <small>${heroes.length}</small></button>` : ""}
        <button class="btn big" data-action="openSettings">Настройки</button>
      </div>
      <div class="title-foot">Alpha 2.0 · Пошаговое PvE в браузере · Сохранения хранятся на этом устройстве</div>
    </div>
  </div>`;
};

Actions.continueHero = (el) => {
  if (!loadHeroById(el.dataset.id)) return;
  enterCamp();
};

function enterCamp() {
  if (App.hero.expedition) {
    App.hero.expedition.pending = null;
    setScreen("trail");
  } else {
    setScreen("hub");
  }
}

Actions.newHero = () => {
  App.creation = { classKey: "warrior", name: "", allocated: createStatBlock(), left: STARTING_CHARACTER_STAT_POINTS };
  setScreen("create");
};

Actions.openRoster = () => setScreen("roster");
Actions.toTitle = () => { App.hero = null; setScreen("title"); };

Screens.create = () => {
  const c = App.creation;
  const def = classDefinitions[c.classKey];
  const role = CLASS_ROLE[c.classKey];
  const finalStats = Object.fromEntries(STAT_KEYS.map((key) => [key, def.stats[key] + c.allocated[key]]));
  const preview = deriveStats(finalStats, 1, false);
  preview.maxHp = Math.round(preview.maxHp * (CLASS_HP_FACTOR[c.classKey] || 1));
  // The first skill is the player's first choice: all of it is shown here.
  const firstChoice = (SKILL_TREES[c.classKey]?.stages[0]?.tiers[0]?.options || []).map(getSkillDefinition).filter(Boolean);
  const subclasses = Object.values(getBranchCatalog(c.classKey).subclasses);
  const statHint = { intellect: "Мана и магический урон", endurance: "Здоровье и защита", strength: "Физический урон", luck: "Криты и добыча", agility: "Скорость и уклонение", spirituality: "Лечение, щиты и восстановление маны" };
  return `
  <div class="create-screen${hasArt("bg_camp") ? " has-art" : ""}">
    <div class="hub-backdrop">${hasArt("bg_camp") ? `<img src="assets/img/bg_camp.webp" alt="">` : ""}</div>
    <canvas class="scene-canvas" data-scene="forge" data-seed="11"></canvas>
    <div class="create-layout">
      <header class="screen-head"><button class="icon-btn" data-action="toTitle" aria-label="Назад">${icon("back")}</button><h1>Новый герой</h1></header>
      <div class="class-row" role="radiogroup" aria-label="Выбор класса">
        ${Object.entries(classDefinitions).map(([key, entry]) => `
          <button class="class-card${key === c.classKey ? " active" : ""}" role="radio" aria-checked="${key === c.classKey}" data-action="pickClass" data-class="${key}" data-tip="mech|${CORE_BY_CLASS[key]}">
            <div class="class-art">${heroPortrait(key)}</div><strong>${entry.name}</strong><small>${CLASS_ROLE[key].role}</small>
          </button>`).join("")}
      </div>
      <div class="create-grid">
        <section class="panel class-info">
          <div class="class-feature">${heroPortrait(c.classKey)}</div>
          <div>
            <h2>${def.name}</h2>
            <p class="muted">${esc(role.tip)}</p>
            <div class="core-note"><b>${esc(MECHANICS[CORE_BY_CLASS[c.classKey]].name)}</b>${esc(MECHANICS[CORE_BY_CLASS[c.classKey]].description)}</div>
            <dl class="mini-dl"><dt>Сложность</dt><dd>${role.difficulty}</dd><dt>Первый навык на выбор</dt><dd>${firstChoice.map((skill) => `<span data-tip="text|${esc(skill.name)}|${esc(skill.description)}">${esc(skill.name)}</span>`).join(", ")}</dd><dt>Подкласс</dt><dd>${SUBCLASS_UNLOCK_LEVEL} уровень: ${subclasses.map((sub) => esc(sub.name)).join(", ")}</dd><dt>Профессия</dt><dd>${PROFESSION_UNLOCK_LEVEL} уровень</dd></dl>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Характеристики</h2><span class="chip accent">Осталось очков: ${c.left}</span></div>
          <div class="alloc-list">
            ${STAT_KEYS.map((key) => `
              <div class="alloc-row">
                <div class="alloc-label"><strong>${statLabel(key)}</strong><small>${statHint[key]}</small></div>
                <button class="step-btn" data-action="allocStat" data-stat="${key}" data-delta="-1" ${c.allocated[key] <= 0 ? "disabled" : ""} aria-label="Уменьшить">−</button>
                <b class="alloc-value${c.allocated[key] > 0 ? " up" : ""}">${finalStats[key]}</b>
                <button class="step-btn" data-action="allocStat" data-stat="${key}" data-delta="1" ${c.left <= 0 ? "disabled" : ""} aria-label="Увеличить">+</button>
              </div>`).join("")}
          </div>
          <div class="stat-preview"><span>Здоровье <b>${preview.maxHp}</b></span><span>Мана <b>${preview.maxMana}</b></span><span>Физ. урон <b>${preview.physicalDamage}</b></span><span>Маг. урон <b>${preview.skillDamage}</b></span><span>Крит <b>${preview.critChance}%</b></span><span>Скорость <b>${preview.attackSpeed}</b></span></div>
          <button class="btn small" data-action="autoAlloc">Распределить автоматически</button>
        </section>
        <section class="panel name-panel">
          <label class="field-label" for="heroNameInput">Имя героя</label>
          <div class="name-row"><input id="heroNameInput" class="field" maxlength="24" value="${esc(c.name)}" placeholder="Например, Лиора" data-input="heroName"><button class="btn small" data-action="randomName">Случайное</button></div>
          <p class="form-error" id="createError" role="alert"></p>
          <button class="btn primary big" data-action="finishCreate" data-sound="anvil">Выйти на тропу</button>
        </section>
      </div>
    </div>
  </div>`;
};

Actions.pickClass = (el) => {
  App.creation.classKey = el.dataset.class;
  App.creation.allocated = createStatBlock();
  App.creation.left = STARTING_CHARACTER_STAT_POINTS;
  render();
};

Actions.allocStat = (el) => {
  const c = App.creation;
  const delta = Number(el.dataset.delta);
  if (delta > 0 && c.left <= 0) return;
  if (delta < 0 && c.allocated[el.dataset.stat] <= 0) return;
  c.allocated[el.dataset.stat] += delta;
  c.left -= delta;
  render();
};

const AUTO_ALLOC = { warrior: { strength: 3, endurance: 2 }, mage: { intellect: 3, endurance: 2 }, archer: { agility: 3, strength: 2 }, bard: { intellect: 2, spirituality: 2, endurance: 1 }, assassin: { strength: 3, agility: 2 } };
Actions.autoAlloc = () => {
  const c = App.creation;
  c.allocated = createStatBlock(AUTO_ALLOC[c.classKey]);
  c.left = 0;
  render();
};
Actions.heroName = (el) => { App.creation.name = el.value; };
Actions.randomName = () => {
  App.creation.name = randomFrom(HERO_NAME_POOL);
  render();
};
Actions.finishCreate = () => {
  const c = App.creation;
  const name = c.name.trim();
  const error = document.getElementById("createError");
  if (name.length < 2) { error.textContent = "Имя должно быть не короче двух символов."; SFX.play("error"); return; }
  if (c.left > 0) { error.textContent = `Распредели все очки: осталось ${c.left}.`; SFX.play("error"); return; }
  if (Object.values(App.save.heroes).some((hero) => hero.name.toLowerCase() === name.toLowerCase())) { error.textContent = "Герой с таким именем уже есть."; SFX.play("error"); return; }
  App.hero = createHero({ name, classKey: c.classKey, allocated: c.allocated });
  refreshShopStock(App.hero);
  App.regionIndex = 0;
  App.tab = "trail";
  persist();
  setScreen("hub");
};

Screens.roster = () => {
  const heroes = Object.values(App.save.heroes).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return `
  <div class="create-screen">
    <canvas class="scene-canvas" data-scene="forge" data-seed="5"></canvas>
    <div class="create-layout narrow">
      <header class="screen-head"><button class="icon-btn" data-action="toTitle" aria-label="Назад">${icon("back")}</button><h1>Мои герои</h1><button class="btn primary small push" data-action="newHero">Новый герой</button></header>
      <div class="roster">
        ${heroes.length ? heroes.map((hero) => `
          <article class="panel roster-card">
            <div class="roster-art">${heroPortrait(hero.classKey)}</div>
            <div class="roster-info"><h3>${esc(hero.name)}</h3><p class="muted">${esc(getHeroTitle(hero))}, ${hero.level} уровень${hero.won ? " · Предел пройден" : ""}</p>
              <p class="muted small">${REGIONS[hero.unlockedRegion || 0].name} · ${hero.gold} золота · побед: ${hero.records?.kills || 0}${hero.expedition ? " · в походе" : ""}</p></div>
            <div class="roster-actions"><button class="btn primary small" data-action="continueHero" data-id="${esc(hero.id)}">Играть</button><button class="btn small" data-action="renameHero" data-id="${esc(hero.id)}">Имя</button><button class="btn small danger-text" data-action="deleteHero" data-id="${esc(hero.id)}">Удалить</button></div>
          </article>`).join("") : `<div class="panel empty-note">Героев пока нет.</div>`}
      </div>
    </div>
  </div>`;
};

Actions.renameHero = async (el) => {
  const raw = App.save.heroes[el.dataset.id];
  const name = await promptDialog({ title: "Новое имя героя", value: raw.name });
  if (!name) return;
  if (name.length < 2) { toast("Имя должно быть не короче двух символов.", "bad"); return; }
  raw.name = name;
  writeSave(App.save);
  render();
};

Actions.deleteHero = async (el) => {
  const raw = App.save.heroes[el.dataset.id];
  const ok = await confirmDialog({ title: `Удалить героя ${raw.name}?`, text: "Герой и всё его снаряжение исчезнут навсегда.", confirmLabel: "Удалить навсегда", danger: true });
  if (!ok) return;
  delete App.save.heroes[el.dataset.id];
  if (App.save.activeId === el.dataset.id) App.save.activeId = Object.keys(App.save.heroes)[0] || null;
  writeSave(App.save);
  render();
};

Actions.openSettings = () => {
  const s = App.save.settings;
  openModal(`<h2>Настройки</h2>
    <label class="check-row"><input type="checkbox" data-input="setSound" ${s.sound ? "checked" : ""}> Звук и музыка</label>
    <label class="field-label">Эффекты<input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-input="setVolume"></label>
    <label class="field-label">Музыка<input type="range" min="0" max="1" step="0.05" value="${s.music ?? 0.5}" data-input="setMusic"></label>
    <label class="field-label">Окружение<input type="range" min="0" max="1" step="0.05" value="${s.ambience ?? 0.3}" data-input="setAmbience"></label>
    <label class="check-row"><input type="checkbox" data-input="setMotion" ${s.reducedMotion ? "checked" : ""}> Меньше анимации и тряски экрана</label>
    <div class="modal-actions wrap"><button class="btn small" data-action="resetTips">Показать подсказки снова</button><button class="btn small" data-action="exportSave">Экспорт сохранения</button><button class="btn small" data-action="importSave">Импорт</button></div>
    <div class="modal-actions"><button class="btn primary" data-action="closeModal" data-autofocus>Готово</button></div>`);
};
Actions.setSound = (el) => { App.save.settings.sound = el.checked; applySettings(); writeSave(App.save); };
Actions.setMusic = (el) => { App.save.settings.music = Number(el.value); applySettings(); writeSave(App.save); };
Actions.setAmbience = (el) => { App.save.settings.ambience = Number(el.value); applySettings(); writeSave(App.save); };
Actions.setVolume = (el) => { App.save.settings.volume = Number(el.value); applySettings(); writeSave(App.save); };
Actions.setMotion = (el) => { App.save.settings.reducedMotion = el.checked; applySettings(); writeSave(App.save); };
Actions.resetTips = () => { App.save.settings.tips = {}; writeSave(App.save); toast("Подсказки появятся снова.", "good"); };
Actions.exportSave = () => {
  if (App.hero) persist();
  openModal(`<h2>Экспорт сохранения</h2><p class="muted">Скопируй текст и храни его в надёжном месте.</p><textarea class="field code" rows="10" readonly data-autofocus>${esc(exportSaveText(App.save))}</textarea><div class="modal-actions"><button class="btn primary" data-action="closeModal">Закрыть</button></div>`, { wide: true });
};
Actions.importSave = () => {
  openModal(`<h2>Импорт сохранения</h2><p class="muted">Текущие герои на этом устройстве будут заменены.</p><textarea id="importText" class="field code" rows="10" data-autofocus></textarea><div class="modal-actions"><button class="btn danger" data-action="doImport">Заменить</button><button class="btn" data-action="closeModal">Отмена</button></div>`, { wide: true });
};
Actions.doImport = () => {
  const imported = importSaveText(document.getElementById("importText").value);
  if (!imported) { toast("Этот текст не похож на сохранение.", "bad"); return; }
  App.save = imported;
  App.hero = null;
  writeSave(App.save);
  document.querySelectorAll(".modal-layer").forEach((layer) => layer.remove());
  applySettings();
  setScreen("title");
  toast("Сохранение загружено.", "good");
};
