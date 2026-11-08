// The camp: expedition picker, hero sheet, gear, skills, forge, shop and journal.
const HUB_TABS = [
  { id: "trail", name: "Поход", icon: "map" },
  { id: "lairs", name: "Логова", icon: "boss" },
  { id: "hero", name: "Герой", icon: "hero" },
  { id: "skills", name: "Навыки", icon: "skills" },
  { id: "talents", name: "Таланты", icon: "talents" },
  { id: "forge", name: "Кузница", icon: "anvil" },
  { id: "shop", name: "Лавка", icon: "shop" },
  { id: "journal", name: "Журнал", icon: "book" }
];

Screens.hub = () => {
  const hero = App.hero;
  const onTrail = Boolean(hero.expedition);
  if (App.tab === "gear") App.tab = "hero";
  const tabs = HUB_TABS.filter((tab) => !onTrail || ["hero", "skills", "talents", "journal"].includes(tab.id));
  if (onTrail && !tabs.some((tab) => tab.id === App.tab)) App.tab = "hero";
  const need = getExperienceForNextLevel(hero.level);
  const views = { lairs: viewLairs, trail: viewTrailPicker, hero: viewSheet, gear: viewSheet, skills: viewSkills, talents: viewTalents, forge: viewForge, shop: viewShop, journal: viewJournal };
  return `
  <div class="hub" style="--lost:${getLostMemories(hero).length}">
    <div class="hub-backdrop"><img src="assets/ui/bg_hub.webp" alt=""><span class="camp-flicker" aria-hidden="true"></span><canvas class="fx-canvas" data-fx="campfire"></canvas></div>
    <header class="hub-bar">
      <div class="rail-logo"><img src="assets/ui/emblem.webp" alt=""><b>Кузница<br>Шагов</b></div>
      <div class="hero-chip">
        <div class="hero-chip-art">${heroMedal(hero)}</div>
        <div class="hero-chip-text">
          <strong>${esc(hero.name)}</strong>
          <small>${esc(getHeroTitle(hero))}</small>
          ${bar(hero.experience, need, "exp", `Опыт ${hero.experience} / ${need}`)}
        </div>
        <div class="level-badge">${hero.level}</div>
      </div>
      <nav class="hub-nav" aria-label="Разделы лагеря">
        ${tabs.map((tab) => {
          const count = pendingBadgeCount(tab.id);
          return `<button class="nav-btn${App.tab === tab.id ? " active" : ""}" data-action="hubTab" data-tab="${tab.id}" ${App.tab === tab.id ? 'aria-current="page"' : ""}>${icon(tab.icon)}<span>${tab.name}</span>${count ? `<i class="dot">${count}</i>` : ""}</button>`;
        }).join("")}
      </nav>
      <div class="hub-tools">
        ${onTrail ? `<button class="btn primary small" data-action="backToTrail">В поход</button>` : `<button class="btn small" data-action="toTitle">Сменить героя</button>`}
        ${memoryKey(hero)}
        <button class="icon-btn" data-action="openSettings" aria-label="Настройки">${icon("settings")}</button>
        ${App.dev ? `<button class="btn small" data-action="openDev">Dev</button>` : ""}
      </div>
    </header>
    <main class="hub-main">
      <div class="hub-top">
        <div class="wallet">
          <span class="chip gold" data-tip="text|Золото|Покупки, заточка и смена пути.">${icon("gold")}${hero.gold}</span>
          <span class="chip shard" data-tip="text|Осколки мутации|Выпадают из элиты и вожаков. Идут на мутации и перековку.">${icon("shard")}${hero.mutationShards}</span>
          <span class="chip hp" data-tip="text|Зелья лечения|${POTIONS.hp.description}">${icon("potionHp")}${hero.potions.hp}</span>
          <span class="chip mp" data-tip="text|Зелья маны|${POTIONS.mp.description}">${icon("potionMp")}${hero.potions.mp}</span>
          <span class="res-group">${resourceChips(hero.resources)}</span>
        </div>
      </div>
      <div class="hub-view">${(views[App.tab] || viewTrailPicker)()}</div>
    </main>
  </div>`;
};

Actions.hubTab = (el) => { App.tab = el.dataset.tab; render(); };
Actions.backToTrail = () => setScreen("trail");

function refreshKeepScroll() {
  const view = document.querySelector(".hub-view");
  const top = view?.scrollTop || 0;
  render();
  const next = document.querySelector(".hub-view");
  if (next) next.scrollTop = top;
}

function commit() {
  persist();
  refreshKeepScroll();
}

// --- Trail picker ---
function viewTrailPicker() {
  const hero = App.hero;
  const region = REGIONS[App.regionIndex];
  const guardian = getAvailableGuardian(hero, App.regionIndex);
  const first = hero.records.expeditions === 0;
  return `
    ${first ? `<div class="coach-card"><b>С чего начать.</b> Выбери белую тропу. Поход состоит из нескольких шагов. Найденные вещи сразу попадают в рюкзак, их можно надеть прямо в пути. Если погибнешь, пропадёт всё, что не надето, и половина золота.</div>` : ""}
    ${first ? "" : campFire()}
    <div class="trail-spacer"></div>
    ${storyObjectiveCard()}
    <h2 class="section-title">${icon("map")}Регион</h2>
    <section class="region-section">
      <div class="region-cards" role="tablist" aria-label="Регионы">
        ${REGIONS.map((entry, index) => {
          const open = isRegionUnlocked(hero, index);
          return `<button role="tab" aria-selected="${index === App.regionIndex}" class="region-card${index === App.regionIndex ? " active" : ""}" data-action="pickRegion" data-index="${index}" ${open ? "" : `disabled data-tip="text|${esc(entry.name)}|Откроется после победы над стражем предыдущего региона."`}><img src="assets/img/region_${entry.id}.webp" alt="" loading="lazy"><span>${open ? "" : icon("lock")}${esc(entry.name)}</span></button>`;
        }).join("")}
      </div>
      <p class="region-lore">${esc(region.description)}</p>
    </section>
    <h2 class="section-title">${icon("battle")}Тропа</h2>
    <section class="zone-grid">
      ${ZONE_KEYS.map((key) => {
        const zone = ZONES[key];
        const [low, high] = getZoneLevelRange(hero, region.id, key);
        const danger = estimateZoneDanger(hero, region.id, key);
        const zoneOpen = isZoneOpen(hero, region.id, key);
        const cleared = getTrailClears(hero, region.id).includes(key);
        return `<button class="zone-card zone-${key}${zoneOpen ? "" : " locked"}${cleared ? " cleared" : ""}" data-action="startExpedition" data-zone="${key}" data-sound="anvil" ${zoneOpen ? "" : `disabled data-tip="text|${zone.name} закрыта|Сначала пройди предыдущую тропу этого региона до конца."`}>
          ${zoneOpen ? "" : `<span class="zone-lock">${icon("lock")}</span>`}${cleared ? `<span class="zone-done">Пройдена</span>` : ""}
          <span class="zone-stripe"></span>
          <strong>${zone.name}</strong>
          <small>${esc(zone.description)}</small>
          <dl><dt>Враги</dt><dd>${low === high ? `ур. ${low}` : `ур. ${low}–${high}`}</dd><dt>Шагов</dt><dd>${zone.steps}</dd><dt>Награды</dt><dd>×${zone.rewardFactor}</dd></dl>
          <span class="danger danger-${danger.key}">${danger.label}</span>
        </button>`;
      }).join("")}
    </section>
    ${guardianCard(guardian, region)}`;
}

function guardianCard(guardian, region) {
  if (!guardian) {
    const def = ENEMY_DEFINITIONS[region.guardian];
    return `<section class="panel guardian done"><div class="guardian-art">${foeArt(region.guardian, def)}</div><div><h3>${esc(def.name)} повержен</h3><p class="muted">${App.hero.won ? "Кузнец повержен. Тропы остаются открытыми: сила врагов растёт вместе с тобой." : "Путь в следующий регион открыт."}</p></div></section>`;
  }
  const info = describeGuardian(guardian.id, App.hero);
  const lock = guardian.needsTrail ? "Сначала пройди фиолетовую тропу региона." : App.hero.level < guardian.requiredLevel ? `Нужен ${guardian.requiredLevel} уровень.` : "";
  return `<section class="panel guardian"><div class="guardian-art">${foeArt(region.guardian, guardian.def)}</div>
    <div class="guardian-text"><span class="eyebrow">Босс региона · всегда ${info.level} уровня</span><h3>${esc(guardian.def.name)}</h3><p class="muted">${esc(guardian.def.lore || "")}</p>
      <ul class="boss-facts"><li>Здоровье: <b>${info.hp}</b></li><li>Самый сильный удар: <b>≈${info.hit}</b></li><li>Готовность: <b>${info.info.recommended} уровень, ${esc(info.info.gear)}</b></li><li>Ты выдержишь ударов: <b>${info.hitsToDie}</b>, тебе нужно своих: <b>≈${info.blowsToKill}</b></li></ul>
      <ul class="boss-phases">${info.info.phases.map((text) => `<li>${esc(text)}</li>`).join("")}</ul></div>
    <button class="btn ${guardian.ready ? "primary" : ""}" data-action="startGuardian" data-id="${guardian.id}" ${guardian.ready ? "" : "disabled"} data-sound="anvil">${guardian.ready ? "Бросить вызов" : esc(lock)}</button></section>`;
}

Actions.pickRegion = (el) => { App.regionIndex = Number(el.dataset.index); render(); };
Actions.startExpedition = (el) => {
  const hero = App.hero;
  if (!isZoneOpen(hero, REGIONS[App.regionIndex].id, el.dataset.zone)) return;
  restoreHero(hero);
  hero.expedition = createExpedition(hero, REGIONS[App.regionIndex].id, el.dataset.zone);
  App.eventState = null;
  persist();
  setScreen("trail");
};

// --- Hero sheet ---
function viewHeroStats() {
  const hero = App.hero;
  const statHint = { intellect: `Мана ${hero.maxMana}, магический урон ${hero.skillDamage}`, endurance: `Здоровье ${hero.maxHp}, защита ${hero.physicalDefense} / ${hero.magicDefense}`, strength: `Физический урон ${hero.physicalDamage}`, luck: `Крит ${hero.critChance}%, добыча ${hero.dropChance}%`, agility: `Скорость ${hero.attackSpeed}, уклонение ${hero.dodgeChance}%`, spirituality: `Лечение ${hero.healingPower}, щиты ${hero.shieldPower}, мана за ход ${getManaRegen(hero)}` };
  return `<div class="stats-stack">
    <section class="panel">
      <div class="panel-head"><h2>Характеристики</h2><span class="chip ${hero.statPoints ? "accent" : ""}">Свободных очков: ${hero.statPoints}</span></div>
      <div class="stat-table">
        ${STAT_KEYS.map((key) => {
          const bonus = hero.totalStats[key] - hero.stats[key];
          return `<div class="stat-row"><div><strong>${statLabel(key)}</strong><small>${esc(statHint[key])}</small></div><b class="stat-value">${hero.totalStats[key]}${bonus > 0 ? `<i>+${bonus}</i>` : ""}</b><div class="stat-add">
            <button class="step-btn" data-action="addStat" data-stat="${key}" ${hero.statPoints <= 0 ? "disabled" : ""} aria-label="Добавить 1: ${statLabel(key)}">+</button>
            ${hero.statPoints >= 3 ? `<button class="step-btn small" data-action="addStat" data-stat="${key}" data-all="1" aria-label="Вложить все очки: ${statLabel(key)}">Все</button>` : ""}
          </div></div>`;
        }).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Боевые показатели</h2></div>
      <div class="derived-grid">
        ${[["Здоровье", hero.maxHp], ["Мана", hero.maxMana], ["Физ. урон", hero.physicalDamage], ["Маг. урон", hero.skillDamage], ["Физ. защита", hero.physicalDefense], ["Маг. защита", hero.magicDefense], ["Крит", `${hero.critChance}%`], ["Уклонение", `${hero.dodgeChance}%`], ["Скорость", hero.attackSpeed], ["Лечение", hero.healingPower], ["Щиты", hero.shieldPower], ["Шанс добычи", `${hero.dropChance}%`]].map(([label, value]) => `<div class="derived"><span>${label}</span><b>${value}</b></div>`).join("")}
      </div>
      <p class="muted small">Скорость решает, как часто ты ходишь. Защита снижает урон по убывающей: чем сильнее враг, тем ниже её эффект.</p>
    </section>
  </div>`;
}

Actions.addStat = (el) => {
  addStatPoint(App.hero, el.dataset.stat, el.dataset.all ? App.hero.statPoints : 1);
  commit();
};

// --- Gear ---
const EQUIP_LAYOUT = ["head", "necklace", "chest", "ring-1", "ring-2", "legs", "bracelet-1", "bracelet-2", "boots", "weapon-1", "weapon-2"];

const SLOT_LEFT = ["head", "necklace", "chest", "legs", "boots"];
const SLOT_RIGHT = ["weapon-1", "weapon-2", "ring-1", "ring-2", "bracelet-1", "bracelet-2"];

// One screen for the whole hero: numbers on the left, the figure with its gear in the middle, the bag on the right.
function viewSheet() {
  const hero = App.hero;
  const bagCount = hero.inventory.filter(Boolean).length;
  const slot = (name) => `<div class="equip-slot" data-tip="text|${esc(equipmentSlotLabel(name))}|">${itemCell(hero.equipment[name], "eq", name, { emptyIcon: slotIconName(name) })}</div>`;
  return `<div class="sheet">
    <div class="sheet-side">${viewHeroStats()}</div>
    <section class="sheet-center">
      <div class="sheet-figure">
        <div class="slot-col">${SLOT_LEFT.map(slot).join("")}</div>
        <div class="figure">${heroFigure(hero)}</div>
        <div class="slot-col">${SLOT_RIGHT.map(slot).join("")}</div>
      </div>
      <div class="sheet-tools"><button class="btn primary" data-action="equipBest">Надеть лучшее</button></div>
    </section>
    <div class="sheet-side">
      <section class="panel bag">
        <div class="panel-head"><h2>Рюкзак <small class="muted">${bagCount} / ${INVENTORY_SIZE}</small></h2>${hero.expedition ? "" : `<button class="btn small${App.bagPick ? " on" : ""}" data-action="bagPickMode">${App.bagPick ? "Готово" : "Выбрать несколько"}</button>`}</div>
        ${App.bagPick && !hero.expedition ? bulkPanel(true) : ""}
        <div class="bag-grid">${hero.inventory.map((item, index) => (App.bagPick && !hero.expedition ? pickCell(item, index) : itemCell(item, "inv", index))).join("")}</div>
        ${App.bagPick ? "" : `<p class="muted small">Нажми на предмет, чтобы надеть, сравнить или продать. «Выбрать несколько» продаёт и разбирает сразу пачкой.</p>`}
      </section>
      ${setsPanel(hero)}
    </div>
  </div>`;
}

function setsPanel(hero) {
  const counts = Object.entries(getActiveSetCounts(hero));
  if (!counts.length) return "";
  return `<section class="panel sets-panel"><h3>Сеты</h3>${counts.map(([id, count]) => {
    const set = SET_CATALOG[id];
    return `<div class="set-line"><strong>${esc(set.name)} <small>${count}/${SET_FULL}</small></strong>${count >= 2 ? `<small class="accent-text">Сила комплекта: +${Math.round(getSetPower(count).dmg * 100)}% урона, −${Math.round(getSetPower(count).taken * 100)}% получаемого.</small>` : ""}<small class="${count >= 2 ? "accent-text" : "muted"}">2 вещи: ${esc(set.bonus2.description)}</small><small class="${count >= 4 ? "accent-text" : "muted"}">4 вещи: ${esc(set.bonus4.description)}</small>${set.bonus6 ? `<small class="${count >= 6 ? "accent-text" : "muted"}">6 вещей: ${esc(set.bonus6.description)}</small>` : ""}${set.bonus8 ? `<small class="${count >= 8 ? "accent-text" : "muted"}">8 вещей: ${esc(set.bonus8.description)}</small>` : ""}</div>`;
  }).join("")}</section>`;
}

const CLASS_WEAPON_SLOTS = {
  warrior: ["Меч, топор или молот", "Щит"], mage: ["Посох", "Том на поясе"], archer: ["Лук", "Колчан"],
  bard: ["Лютня или лира", "Камертон"], assassin: ["Кинжал", "Второй кинжал"]
};

function equipmentSlotLabel(slot) {
  const weapon = CLASS_WEAPON_SLOTS[App.hero?.classKey];
  if (weapon && slot === "weapon-1") return weapon[0];
  if (weapon && slot === "weapon-2") return weapon[1];
  return { "ring-1": "Кольцо", "ring-2": "Кольцо", "bracelet-1": "Браслет", "bracelet-2": "Браслет", necklace: "Ожерелье", head: "Шлем", chest: "Доспех", legs: "Поножи", boots: "Сапоги", "weapon-1": "Оружие", "weapon-2": "Вторая рука" }[slot] || slot;
}

Actions.equipBest = () => {
  const count = equipBestGear(App.hero);
  toast(count ? `Надето предметов: ${count}.` : "Лучшие вещи уже на тебе.", count ? "good" : "neutral");
  commit();
};

// Quick filters mark whole groups, single clicks add or remove one thing. Nothing happens until a button is pressed.
function bulkPanel(canSell) {
  const hero = App.hero;
  const picked = App.bagPick || [];
  const preview = previewBulk(hero, picked);
  const chips = BAG_FILTERS.map((filter) => {
    const list = bagFilterIndices(hero, filter.id);
    const on = list.length > 0 && list.every((index) => picked.includes(index));
    return `<button class="chip-btn${filter.rarity ? ` rarity-text-${filter.rarity}` : ""}${on ? " on" : ""}" data-action="bagFilter" data-id="${filter.id}" ${list.length ? "" : "disabled"}>${esc(filter.name)} <small>${list.length}</small></button>`;
  }).join("");
  const gains = Object.entries(preview.resources).map(([id, amount]) => `${esc(SHOP_RESOURCE_CATALOG.find((res) => res.id === id).name)} ×${amount}`);
  if (preview.shards) gains.push(`Осколки ×${preview.shards}`);
  return `<div class="bulk">
    <div class="bulk-chips">${chips}</div>
    <div class="bulk-sum"><b>Выбрано: ${preview.count}</b>${preview.count ? `<button class="link-btn" data-action="bagClear">снять выбор</button>` : ""}<small class="muted">${preview.count ? `Разбор даст: ${gains.join(", ")}` : "Отмечай вещи кликом или фильтром. Реликвии и комплекты фильтры не трогают."}</small></div>
    <div class="bulk-actions">${canSell ? `<button class="btn" data-action="bagSell" data-sound="coin" ${preview.count ? "" : "disabled"}>Продать за ${preview.gold}</button>` : ""}<button class="btn${canSell ? "" : " primary"}" data-action="bagDismantle" ${preview.count ? "" : "disabled"}>Разобрать</button></div>
  </div>`;
}

Actions.bagPickMode = () => { App.bagPick = App.bagPick ? null : []; refreshKeepScroll(); };
Actions.bagClear = () => { App.bagPick = []; refreshKeepScroll(); };
Actions.bagToggle = (el) => {
  const index = Number(el.dataset.key);
  App.bagPick = App.bagPick || [];
  App.bagPick = App.bagPick.includes(index) ? App.bagPick.filter((entry) => entry !== index) : [...App.bagPick, index];
  refreshKeepScroll();
};
Actions.bagFilter = (el) => {
  const list = bagFilterIndices(App.hero, el.dataset.id);
  const picked = App.bagPick || [];
  App.bagPick = list.every((index) => picked.includes(index)) ? picked.filter((index) => !list.includes(index)) : [...new Set([...picked, ...list])];
  refreshKeepScroll();
};
async function confirmRisky(verb, preview) {
  if (!preview.risky) return true;
  return confirmDialog({ title: `${verb} ценные вещи?`, text: `Среди выбранного ценных вещей: ${preview.risky} (фиолетовые и выше, заточенные, реликвии или части комплекта). Вернуть их будет нельзя.`, confirmLabel: verb });
}
Actions.bagSell = async () => {
  const hero = App.hero;
  if (!(await confirmRisky("Продать", previewBulk(hero, App.bagPick || [])))) return;
  const sold = sellInventoryItems(hero, App.bagPick || []);
  App.bagPick = [];
  SFX.play("coin");
  toast(`Продано вещей: ${sold.count}, получено ${sold.total} золота.`, "good");
  commit();
};
Actions.bagDismantle = async () => {
  const hero = App.hero;
  if (!(await confirmRisky("Разобрать", previewBulk(hero, App.bagPick || [])))) return;
  const done = dismantleInventoryItems(hero, App.bagPick || []);
  App.bagPick = [];
  SFX.play("anvil");
  toast(`Разобрано вещей: ${done.count}.`, "good");
  commit();
};

Actions.itemOpen = (el) => {
  const { source, key } = el.dataset;
  const item = getItemByRef(source, key);
  if (!item) return;
  const hero = App.hero;
  const onTrail = Boolean(hero.expedition);
  let actions = "";
  if (source === "inv") {
    actions += `<button class="btn primary" data-action="itemEquip" data-key="${key}" ${canEquip(hero, item) ? "" : "disabled"}>Надеть</button>`;
    if (fitsClass(item, hero.classKey) && (item.slotType === "ring" || item.slotType === "bracelet" || item.slotType === "weapon")) {
      getSlotKeysForItem(item, hero.classKey).forEach((slot, index, list) => {
        if (list.length < 2) return;
        actions += `<button class="btn small" data-action="itemEquip" data-key="${key}" data-slot="${slot}" ${canEquip(hero, item) ? "" : "disabled"}>В слот ${index + 1}</button>`;
      });
    }
    if (!onTrail) actions += `<button class="btn" data-action="itemSell" data-key="${key}" data-sound="coin">Продать за ${getSellPrice(item)}</button><button class="btn" data-action="itemDismantle" data-key="${key}">Разобрать</button>`;
  } else if (source === "eq") {
    actions += `<button class="btn" data-action="itemUnequip" data-key="${key}">Снять</button>`;
  }
  openModal(`${itemDetailHtml(item, source === "eq" ? key : null)}<div class="modal-actions wrap">${actions}<button class="btn" data-action="closeModal">Закрыть</button></div>`);
};

function afterItemAction() {
  closeModal();
  commit();
}

Actions.itemEquip = (el) => {
  const res = equipFromInventory(App.hero, Number(el.dataset.key), el.dataset.slot || null);
  if (notifyResult(res)) afterItemAction();
};
Actions.itemUnequip = (el) => {
  if (notifyResult(unequipToInventory(App.hero, el.dataset.key))) afterItemAction();
};
Actions.itemSell = (el) => {
  const item = App.hero.inventory[Number(el.dataset.key)];
  const price = sellInventoryItem(App.hero, Number(el.dataset.key));
  if (item) toast(`Продано за ${price} золота.`, "good");
  afterItemAction();
};
Actions.itemDismantle = (el) => {
  const gained = dismantleInventoryItem(App.hero, Number(el.dataset.key));
  if (gained) {
    SFX.play("anvil");
    const parts = Object.entries(gained.resources).map(([id, amount]) => `${SHOP_RESOURCE_CATALOG.find((res) => res.id === id).name} ×${amount}`);
    if (gained.shards) parts.push(`Осколки ×${gained.shards}`);
    toast(`Получено: ${parts.join(", ")}.`, "good");
  }
  afterItemAction();
};

// --- Skills ---
// The tree is laid out by code: class trunk, then subclass boughs, then profession branches.
const TREE = { head: 112, step: 128, row: 160 };

function treeLayout(hero) {
  if (getSkillTree(hero)) return choiceTreeLayout(hero);
  const catalog = getBranchCatalog(hero.classKey);
  const skills = Object.values(SKILL_CATALOG).filter((skill) => skill.classId === hero.classKey && !skill.hidden);
  const nodes = [];
  const links = [];
  const placeGroup = (key, startX, centerY, headId) => {
    const group = skills.filter((skill) => getSkillBranchKey(skill) === key);
    const levels = [...new Set(group.map((skill) => Number(skill.unlockLevel || 1)))].sort((a, b) => a - b);
    let previous = [headId];
    levels.forEach((level, column) => {
      const here = group.filter((skill) => Number(skill.unlockLevel || 1) === level);
      const ids = here.map((skill, i) => {
        const id = `n-${skill.id}`;
        const y = centerY + (i - (here.length - 1) / 2) * 66;
        const x = startX + column * TREE.step;
        nodes.push({ id, kind: "skill", skill, x, y });
        previous.forEach((from) => links.push({ from, to: id }));
        // The fork of a skill: two small nodes, only one can be taken.
        getSkillForms(skill.id).forEach((form, index) => {
          const formId = `f-${form.id}`;
          nodes.push({ id: formId, kind: "form", skill, form, x: x + 58, y: y + (index === 0 ? -30 : 30) });
          links.push({ from: id, to: formId, form: form.id });
        });
        return id;
      });
      previous = ids;
    });
    return { tail: previous, endX: startX + levels.length * TREE.step };
  };
  const subs = Object.values(catalog.subclasses);
  const profsOf = (sub) => Object.values(catalog.professions).filter((prof) => prof.subclassId === sub.id);
  const rows = subs.reduce((sum, sub) => sum + Math.max(1, profsOf(sub).length), 0);
  const height = rows * TREE.row + 30;
  const trunk = { id: "h-class", kind: "class", x: 60, y: height / 2, name: classDefinitions[hero.classKey].name, lookId: hero.classKey };
  nodes.push(trunk);
  const trunkEnd = placeGroup("c", trunk.x + TREE.head, trunk.y, trunk.id);
  let row = 0;
  // Boughs start where the longest of them can fit behind the trunk.
  subs.forEach((sub) => {
    const profs = profsOf(sub);
    const y = (row + profs.length / 2) * TREE.row + 15;
    const head = { id: `h-${sub.id}`, kind: "subclass", x: trunkEnd.endX + 60, y, name: sub.name, branchId: sub.id, lookId: `look_${sub.id}` };
    nodes.push(head);
    trunkEnd.tail.forEach((from) => links.push({ from, to: head.id }));
    const bough = placeGroup(`s:${sub.id}`, head.x + TREE.head, y, head.id);
    profs.forEach((prof, index) => {
      const py = (row + index + 0.5) * TREE.row + 15;
      const profHead = { id: `h-${prof.id}`, kind: "profession", x: bough.endX + 60, y: py, name: prof.name, branchId: prof.id, lookId: `look_${prof.id}` };
      nodes.push(profHead);
      bough.tail.forEach((from) => links.push({ from, to: profHead.id }));
      placeGroup(`p:${prof.id}`, profHead.x + TREE.head, py, profHead.id);
    });
    row += profs.length;
  });
  const width = Math.max(...nodes.map((node) => node.x)) + 110;
  return { nodes, links, width, height };
}

function treeNodeHtml(hero, node) {
  const style = `left:${node.x}px;top:${node.y}px`;
  if (node.kind === "pick") return pickNodeHtml(hero, node, style);
  if (node.kind === "lane") return `<div class="tree-lane" style="${style}"><b>${esc(node.name)}</b><small>${esc(node.description)}</small></div>`;
  if (node.kind === "form") {
    const current = hero.skillForms?.[node.skill.id];
    const worn = current === node.form.id;
    const reachable = doesSkillMatchBranch(node.skill, hero) && Number(node.skill.unlockLevel || 1) <= hero.level;
    const canBuy = reachable && !current && getDevPointsFree(hero) > 0;
    return `<button class="tree-form ${worn ? "is-worn" : current ? "other" : canBuy ? "ready" : ""}${reachable ? "" : " shut"}${App.treePick === node.skill.id ? " picked" : ""}" style="${style}" data-action="treePick" data-id="${esc(node.skill.id)}" data-tip="text|${esc(node.form.name)}|${esc(node.form.description)}" aria-label="${esc(node.form.name)}">${worn ? "✓" : current ? "×" : ""}</button>`;
  }
  if (node.kind !== "skill") {
    const chosen = node.kind === "class" || hero.subclass === node.branchId || hero.profession === node.branchId;
    const stage = node.kind === "subclass" ? "subclass" : "profession";
    const unlockLevel = node.kind === "subclass" ? SUBCLASS_UNLOCK_LEVEL : PROFESSION_UNLOCK_LEVEL;
    const catalog = getBranchCatalog(hero.classKey);
    const open = node.kind === "class" ? true : hero.level >= unlockLevel && (node.kind === "subclass" || catalog.professions[node.branchId]?.subclassId === hero.subclass);
    const description = node.kind === "class" ? classDefinitions[hero.classKey].description : (catalog.subclasses[node.branchId] || catalog.professions[node.branchId])?.description || "";
    const art = window.FORGE_SPRITES?.[node.lookId] ? `<img src="assets/sprites/${node.lookId}/idle.webp" alt="">` : icon("hero");
    const hint = chosen ? "Твой путь." : open ? "Нажми, чтобы выбрать этот путь." : `Откроется на ${unlockLevel} уровне${node.kind === "profession" ? " после выбора этого подкласса" : ""}.`;
    const action = !chosen && open ? `data-action="pathConfirm" data-stage="${stage}" data-id="${node.branchId}"` : "";
    return `<button class="tree-head ${node.kind}${chosen ? " chosen" : ""}${open ? "" : " shut"}" style="${style}" ${action} data-tip="text|${esc(node.name)}|${esc(description)} ${esc(hint)}"><span class="tree-face">${art}</span><b>${esc(node.name)}</b></button>`;
  }
  const skill = node.skill;
  const state = getSkillStudyState(hero, skill);
  const reachable = doesSkillMatchBranch(skill, hero);
  const progress = state === "LEARNED" ? getSkillProgress(hero, skill.id) : null;
  const needBonus = progress && progress.level >= SKILL_MAX_LEVEL && !progress.bonusChoice;
  const slotted = hero.activeSkillSlots.includes(skill.id);
  const classes = [state === "LEARNED" ? "learned" : state === "AVAILABLE" ? "ready" : "shut", skill.category === "passive" ? "passive" : "active", reachable ? "" : "foreign", App.treePick === skill.id ? "picked" : "", slotted ? "slotted" : "", needBonus ? "bonus" : ""].join(" ");
  return `<button class="tree-node ${classes}" style="${style}" data-action="treePick" data-id="${skill.id}" data-tip="skill|${skill.id}" aria-label="${esc(skill.name)}">${skillIcon(skill)}${Number(skill.unlockLevel) > hero.level ? `<i>${skill.unlockLevel}</i>` : ""}${progress ? `<u>${progress.level}</u>` : ""}</button>`;
}

function viewSkills() {
  const hero = App.hero;
  const tree = treeLayout(hero);
  const byId = Object.fromEntries(tree.nodes.map((node) => [node.id, node]));
  const lit = (node) => node.kind === "lane" ? false : node.kind === "pick" ? node.picked : node.kind === "class" || (node.kind === "form" ? hero.skillForms?.[node.skill.id] === node.form.id : node.kind === "skill" ? isSkillLearned(hero, node.skill.id) : hero.subclass === node.branchId || hero.profession === node.branchId);
  const paths = tree.links.map(({ from, to }) => {
    const a = byId[from];
    const b = byId[to];
    const mid = (a.x + b.x) / 2;
    return `<path class="${lit(a) && lit(b) ? "on" : lit(a) ? "next" : ""}" d="M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}"/>`;
  }).join("");
  const picked = App.treePick ? getSkillDefinition(App.treePick) : null;
  const pickedReachable = picked && doesSkillMatchBranch(picked, hero);
  const needs = picked && getSkillStudyState(hero, picked) === "NEEDS_PREV" ? getSkillPrereqs(picked).map((other) => other.name).join(" или ") : "";
  return `
    <div class="tree-top">
      <section class="tree-bar">
        <div class="tree-points">${devPointsChip(hero)}${rebuildNote(hero)}<small class="muted">На каждом шаге дерева берётся один навык из нескольких, и ветки играются по-разному. На панель идут пять из выбранных. Пути выбираются на ${SUBCLASS_UNLOCK_LEVEL} и ${PROFESSION_UNLOCK_LEVEL} уровнях, и с ними меняется облик героя.</small></div>
        <div class="slot-bar">
          ${hero.activeSkillSlots.map((_, index) => {
            const skill = getActiveSkillFromSlot(hero, index);
            return `<div class="skill-slot${App.skillSlot === index ? " active" : ""}"><button class="skill-slot-btn" data-action="pickSkillSlot" data-index="${index}" data-tip="slot|${index}"><small>${index + 1}</small>${skill ? skillIcon(skill) : icon("skills", "dim")}</button></div>`;
          }).join("")}
        </div>
      </section>
    </div>
    <div class="build-row">${styleCards(hero)}${ultimateBlock(hero)}</div>
    <div class="tree-layout">
      <section class="tree-scroll" id="treeScroll"><div class="tree-canvas" style="width:${tree.width}px;height:${tree.height}px">
        <svg class="tree-lines" width="${tree.width}" height="${tree.height}">${paths}</svg>
        ${tree.nodes.map((node) => treeNodeHtml(hero, node)).join("")}
      </div></section>
      <aside class="panel tree-side">${picked ? `<h3>${esc(picked.name)}</h3>${skillRow(picked)}${treeChoicePanel(hero, picked.id)}${picked.category === "active" && isSkillLearned(hero, picked.id) ? skillFormPanel(hero, picked) : ""}${!pickedReachable ? `<p class="muted small">Этот навык принадлежит другому пути.</p>` : ""}${needs ? `<p class="muted small">Сначала изучи: ${esc(needs)}.</p>` : ""}` : `<h3>Дерево навыков</h3><p class="muted">Нажми на узел, чтобы посмотреть навык, изучить его или поставить на панель.</p><p class="muted small">В столбце берётся один навык, ветка видна по ряду. Финальный навык ветки требует двух её навыков раньше. Форму навыка выбирают в этой панели, когда навык взят.</p>`}</aside>
    </div>`;
}

Actions.treePick = (el) => {
  App.treePick = el.dataset.id;
  const box = document.getElementById("treeScroll");
  const [left, top] = [box?.scrollLeft || 0, box?.scrollTop || 0];
  refreshKeepScroll();
  const next = document.getElementById("treeScroll");
  if (next) { next.scrollLeft = left; next.scrollTop = top; }
};

// --- Lairs ---
function viewLairs() {
  const hero = App.hero;
  const usable = (lair) => getLairRewardSetIds(hero, lair);
  App.lairSet = App.lairSet || {};
  App.lairRank = App.lairRank || {};
  const cards = Object.values(LAIR_CATALOG).map((lair) => {
    const ranks = getLairRanks(lair);
    const limit = getLairRankLimit(lair, hero);
    const level = ranks.includes(App.lairRank[lair.id]) ? App.lairRank[lair.id] : limit;
    const state = getLairState(hero, lair, level);
    const sets = getLairSets(hero, lair).filter((set) => set.classes.includes(hero.classKey));
    const target = usable(lair).includes(App.lairSet[lair.id]) ? App.lairSet[lair.id] : usable(lair)[0];
    const foreign = !lair.sets.some((id) => SET_CATALOG[id].classes.includes(hero.classKey));
    const tokens = Number(hero.lairTokens?.[lair.id] || 0);
    const owned = (setId) => new Set([...Object.values(hero.equipment), ...hero.inventory].filter((item) => item?.setId === setId && item.rarity === "relic").map((item) => item.slotType)).size;
    const boss = describeLairBoss(hero, lair, level);
    const hunger = getRelicHunger(hero, level);
    const index = ranks.indexOf(level);
    return `<article class="lair-card${state.ok ? "" : " shut"}">
      <div class="lair-art"><img src="assets/img/region_${lair.regionId}.webp" alt=""><img class="lair-boss" src="assets/sprites/${lair.master}/idle.webp" alt=""><span>${esc(getRegion(lair.regionId).name)}</span></div>
      <div class="lair-body">
        <h3>${esc(lair.masterName)}</h3><p class="lair-master">${esc(lair.name)}. ${esc(lair.lore)}</p>
        <div class="lair-rank"><button class="btn small" data-action="lairRankStep" data-id="${lair.id}" data-level="${ranks[index - 1] || ""}" ${index > 0 ? "" : "disabled"} aria-label="Ступень ниже">−</button><b>Ступень ${level} уровня</b><button class="btn small" data-action="lairRankStep" data-id="${lair.id}" data-level="${ranks[index + 1] || ""}" ${ranks[index + 1] ? "" : "disabled"} aria-label="Ступень выше">+</button><small class="muted">Здоровье ${boss.hp.toLocaleString("ru-RU")} · серия до ${boss.hit.toLocaleString("ru-RU")}</small></div>
        ${hunger.count ? `<p class="lair-rule"><b>Жажда реликвий.</b> На тебе реликвий этой ступени: ${hunger.count}. Хозяин сильнее: здоровье +${Math.round((hunger.hp - 1) * 100)}%, удары +${Math.round((hunger.dmg - 1) * 100)}%.</p>` : ""}${boss.traits.map((trait) => `<p class="lair-rule"><b>${esc(trait.name)}.</b> ${esc(trait.description)}</p>`).join("")}
        <details class="lair-more"><summary>Приёмы и стадии</summary>
          <ul>${boss.stages.map((stage) => `<li><b>${Math.round(stage.at * 100)}% здоровья:</b> ${esc(stage.text)}</li>`).join("")}</ul>
          <p class="muted small">${boss.moves.map((move) => esc(move.name)).join(" · ")}</p>
        </details>
        ${foreign ? `<p class="lair-rule">Своего комплекта для тебя здесь нет: хозяин платит любым комплектом твоего класса на выбор.</p>` : ""}
        <div class="lair-sets">${sets.map((set) => {
          const fits = set.classes.includes(hero.classKey);
          return `<button class="lair-set${set.id === target ? " on" : ""}${fits ? "" : " unfit"}" data-action="pickLairSet" data-lair="${lair.id}" data-id="${set.id}" data-tip="set|${set.id}"><b>${esc(set.name)}</b><small>${owned(set.id)} / ${SET_FULL} частей${fits ? "" : " · не твой класс"}</small></button>`;
        }).join("")}</div>
        <div class="lair-actions">
          <button class="btn ${state.ok ? "primary" : ""}" data-action="startLair" data-id="${lair.id}" data-set="${target}" data-level="${level}" ${state.ok ? "" : "disabled"} data-sound="anvil">${state.ok ? "Бросить вызов" : esc(state.reason)}</button>
          <button class="btn small" data-action="openLairExchange" data-id="${lair.id}" data-set="${target}" ${tokens >= LAIR_TOKENS_FOR_EXCHANGE ? "" : "disabled"} data-tip="text|Жетоны логова|За каждую победу жетон. ${LAIR_TOKENS_FOR_EXCHANGE} жетона меняются на нужную часть комплекта. Жетоны идут и на возвышение реликвий в кузнице.">Жетоны: ${tokens} / ${LAIR_TOKENS_FOR_EXCHANGE}</button>
        </div>
      </div>
    </article>`;
  }).join("");
  return `<div class="trail-spacer"></div><h2 class="section-title">${icon("boss")}Логова</h2>${campVoice("lairs")}
    <p class="muted lair-intro">Один хозяин, один долгий бой без разминки. Это самое трудное, что есть в игре: хозяин меняется на глазах, и победа не гарантирована даже с хорошими вещами. За победу реликвия уровня ступени: сначала те части комплекта, которых у тебя нет. Ступени идут до ${LAIR_TOP_LEVEL} уровня, а старые реликвии можно возвысить в кузнице.</p>
    <section class="lair-grid">${cards}</section>`;
}

Actions.talentExchange = () => {
  const result = exchangeSkillPoint(App.hero);
  if (notifyResult(result)) { persist(); refreshKeepScroll(); }
};
Actions.lairRankStep = (el) => {
  if (!el.dataset.level) return;
  App.lairRank = App.lairRank || {};
  App.lairRank[el.dataset.id] = Number(el.dataset.level);
  refreshKeepScroll();
};
Actions.pickLairSet = (el) => { App.lairSet = App.lairSet || {}; App.lairSet[el.dataset.lair] = el.dataset.id; refreshKeepScroll(); };
Actions.startLair = (el) => {
  const hero = App.hero;
  const lair = LAIR_CATALOG[el.dataset.id];
  const level = Number(el.dataset.level) || lair.level;
  if (!getLairState(hero, lair, level).ok) return;
  restoreHero(hero);
  hero.expedition = createLairRun(hero, lair.id, el.dataset.set, level);
  App.eventState = null;
  persist();
  setScreen("trail");
  // No road to walk: the challenge goes straight to the master.
  Actions.chooseNode({ dataset: { index: 0 } });
};
Actions.openLairExchange = (el) => {
  const { id, set } = el.dataset;
  const names = { weapon: "Оружие", head: "Шлем", chest: "Доспех", legs: "Поножи", boots: "Сапоги", ring: "Кольцо", bracelet: "Браслет", necklace: "Ожерелье" };
  openModal(`<h2>Обмен жетонов</h2><p class="muted">${LAIR_TOKENS_FOR_EXCHANGE} жетона на часть комплекта «${esc(SET_CATALOG[set].name)}». Какую?</p>
    <div class="modal-actions wrap">${SET_SLOT_TYPES.map((slot) => `<button class="btn small" data-action="lairExchange" data-id="${id}" data-set="${set}" data-slot="${slot}">${names[slot]}</button>`).join("")}</div>
    <div class="modal-actions"><button class="btn" data-action="closeModal">Закрыть</button></div>`);
};
Actions.lairExchange = (el) => {
  const result = exchangeLairTokens(App.hero, el.dataset.id, el.dataset.set, el.dataset.slot);
  closeModal();
  if (!result.ok) { toast(result.reason); return; }
  SFX.play("level");
  toast(`Получено: ${result.item.name}.`, "good");
  commit();
};

function skillRow(skill) {
  const hero = App.hero;
  const stateKey = getSkillStudyState(hero, skill);
  const learned = stateKey === "LEARNED";
  const progress = learned ? getSkillProgress(hero, skill.id) : null;
  const inSlot = hero.activeSkillSlots.indexOf(skill.id);
  const needBonus = progress && progress.level >= SKILL_MAX_LEVEL && !progress.bonusChoice;
  let action = "";
  const treeChoice = getSkillTree(hero) && !learned;
  if (treeChoice) action = "";
  else if (stateKey === "AVAILABLE") action = `<button class="btn primary small" data-action="learnSkill" data-id="${skill.id}" data-sound="level">Изучить</button>`;
  else if (stateKey === "NO_POINTS") action = `<span class="tag">Нет очков</span>`;
  else if (stateKey === "NEEDS_PREV") action = `<span class="tag lock">${icon("lock")}Нужен прошлый</span>`;
  else if (stateKey === "LOCKED") action = `<span class="tag lock">${icon("lock")}${skill.unlockLevel} ур.</span>`;
  else if (skill.category === "active") action = inSlot === App.skillSlot ? `<span class="tag on">Слот ${inSlot + 1}</span>` : `<button class="btn small" data-action="assignSkill" data-id="${skill.id}">${inSlot >= 0 ? `Из ${inSlot + 1} в ${App.skillSlot + 1}` : `В слот ${App.skillSlot + 1}`}</button>`;
  else action = `<span class="tag on">Действует</span>`;
  const masteryLine = progress ? `<div class="mastery"><div class="pips">${Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => `<i class="${i < progress.level ? "on" : ""}"></i>`).join("")}</div><small>${progress.level >= SKILL_MAX_LEVEL ? (progress.bonusChoice ? esc(getSkillBonusChoice(skill, progress.bonusChoice)?.name || "") : "Выбери бонус") : `${progress.exp} / ${progress.expToNext}`}${progress.mutation ? ` · ${esc(MUTATIONS[progress.mutation].name)}` : ""}</small></div>` : "";
  return `<article class="skill-row${learned ? "" : " locked"}" data-tip="skill|${skill.id}">
    ${skillIcon(skill)}
    <div class="skill-row-text"><strong>${esc(skill.name)}</strong><small>${esc(skill.description)}</small>${skill.category === "passive" ? `<small class="accent-text">${esc(getPassiveBonusDescription(skill))}</small>` : ""}${masteryLine}</div>
    <div class="skill-row-action">${action}${needBonus ? `<button class="btn primary small" data-action="openMastery" data-id="${skill.id}">Бонус</button>` : ""}</div>
  </article>`;
}

function branchPanel() {
  const hero = App.hero;
  const branch = getCharacterBranchState(hero);
  const subOpen = hero.level >= SUBCLASS_UNLOCK_LEVEL;
  const profOpen = hero.level >= PROFESSION_UNLOCK_LEVEL && Boolean(hero.subclass);
  const stage = (index, state, title, value, mech) => `<li class="path-stage ${state}" ${mech ? `data-tip="mech|${mech}"` : ""}><span class="stage-num">${state === "done" ? "✓" : index}</span><div><small>${title}</small><strong>${esc(value)}</strong></div></li>`;
  const action = subOpen && !hero.subclass
    ? `<button class="btn primary" data-action="openPathChoice" data-stage="subclass">Выбрать подкласс</button>`
    : profOpen && !hero.profession
      ? `<button class="btn primary" data-action="openPathChoice" data-stage="profession">Выбрать профессию</button>`
      : "";
  const change = hero.subclass ? `<button class="btn small" data-action="openPathChoice" data-stage="subclass">Сменить подкласс</button>` : "";
  const changeProf = hero.profession ? `<button class="btn small" data-action="openPathChoice" data-stage="profession">Сменить профессию</button>` : "";
  const hint = !subOpen ? `Подкласс откроется на ${SUBCLASS_UNLOCK_LEVEL} уровне, осталось уровней: ${SUBCLASS_UNLOCK_LEVEL - hero.level}.` : hero.subclass && hero.level < PROFESSION_UNLOCK_LEVEL ? `Профессия откроется на ${PROFESSION_UNLOCK_LEVEL} уровне, осталось уровней: ${PROFESSION_UNLOCK_LEVEL - hero.level}.` : "";
  return `<section class="panel branch"><div class="panel-head"><h2>Путь героя</h2></div>
    <ol class="path-stages">
      ${stage(1, "done", "Класс", classDefinitions[hero.classKey].name, CORE_BY_CLASS[hero.classKey])}
      ${stage(2, branch.subclassDefinition ? "done" : subOpen ? "now" : "locked", `Подкласс · ${SUBCLASS_UNLOCK_LEVEL} уровень`, branch.subclassDefinition?.name || (subOpen ? "Можно выбрать" : "Пока закрыт"), hero.subclass)}
      ${stage(3, branch.professionDefinition ? "done" : profOpen ? "now" : "locked", `Профессия · ${PROFESSION_UNLOCK_LEVEL} уровень`, branch.professionDefinition?.name || (profOpen ? "Можно выбрать" : "Пока закрыта"), hero.profession)}
    </ol>
    ${hint ? `<p class="muted small">${hint}</p>` : ""}
    <div class="row-gap">${action}${change}${changeProf}</div></section>`;
}

function skillNamesFor(classKey, subclass, profession) {
  return Object.values(SKILL_CATALOG)
    .filter((skill) => skill.classId === classKey && skill.subclass === subclass && (profession ? skill.profession === profession : !skill.profession))
    .sort((a, b) => Number(a.unlockLevel) - Number(b.unlockLevel))
    .map((skill) => esc(skill.name)).join(", ");
}

function openPathChoice(stage) {
  const hero = App.hero;
  const catalog = getBranchCatalog(hero.classKey);
  const isSub = stage === "subclass";
  const list = isSub ? Object.values(catalog.subclasses) : Object.values(catalog.professions).filter((prof) => prof.subclassId === hero.subclass);
  const current = isSub ? hero.subclass : hero.profession;
  const cost = current ? getBranchChangeCost(hero) : 0;
  openModal(`<span class="eyebrow">${isSub ? "Второй шаг пути" : "Финальный шаг пути"}</span>
    <h2 class="result-title">${isSub ? "Выбор подкласса" : "Выбор профессии"}</h2>
    <p class="muted">${isSub ? `Подкласс откроет новую механику, навыки и определит профессии на ${PROFESSION_UNLOCK_LEVEL} уровне.` : "Профессия станет центральной механикой твоего героя."} ${cost ? `Смена стоит ${cost} золота, изученные навыки сохраняются.` : "Первый выбор бесплатный."}</p>
    <div class="path-choices">${list.map((entry) => {
      const mech = MECHANICS[entry.id];
      const next = isSub ? Object.values(catalog.professions).filter((prof) => prof.subclassId === entry.id).map((prof) => esc(prof.name)).join(", ") : "";
      return `<button class="path-card${current === entry.id ? " active" : ""}" data-action="pathConfirm" data-stage="${stage}" data-id="${entry.id}" ${current === entry.id || hero.gold < cost ? "disabled" : ""}>
        <strong>${esc(entry.name)}</strong><span>${esc(entry.description)}</span>
        ${mech ? `<small class="mech-line"><b>${esc(mech.name)}.</b> ${esc(mech.description)}</small>` : ""}
        <small>Навыки: ${isSub ? skillNamesFor(hero.classKey, entry.id, null) : skillNamesFor(hero.classKey, hero.subclass, entry.id)}</small>
        ${next ? `<small class="accent-text">Дальше: ${next}</small>` : ""}
      </button>`;
    }).join("")}</div>
    <div class="modal-actions"><button class="btn" data-action="closeModal">Решу позже</button></div>`, { wide: true });
}

function promptPathIfReady() {
  const hero = App.hero;
  const seen = hero.records.pathPrompted = hero.records.pathPrompted || {};
  const stage = hero.level >= SUBCLASS_UNLOCK_LEVEL && !hero.subclass ? "subclass" : hero.level >= PROFESSION_UNLOCK_LEVEL && hero.subclass && !hero.profession ? "profession" : null;
  if (!stage || seen[stage]) return;
  seen[stage] = true;
  persist();
  setTimeout(() => openPathChoice(stage), 60);
}

Actions.openPathChoice = (el) => openPathChoice(el.dataset.stage);
Actions.pathConfirm = async (el) => {
  const hero = App.hero;
  const { stage, id } = el.dataset;
  const catalog = getBranchCatalog(hero.classKey);
  const entry = stage === "subclass" ? catalog.subclasses[id] : catalog.professions[id];
  const current = stage === "subclass" ? hero.subclass : hero.profession;
  const ok = await confirmDialog({ title: `Выбрать: ${entry.name}?`, text: current ? `Смена стоит ${getBranchChangeCost(hero)} золота.${stage === "subclass" ? " Профессия будет сброшена." : ""}` : "Это важное решение: путь определит стиль боя твоего героя.", confirmLabel: "Выбрать" });
  if (!ok) return;
  const res = stage === "subclass" ? chooseSubclass(hero, id) : chooseProfession(hero, id);
  document.querySelectorAll(".modal-layer").forEach((layer) => layer.remove());
  if (notifyResult(res, `Твой путь: ${entry.name}.`)) {
    SFX.play("level");
    persist();
    if (App.screen === "hub") refreshKeepScroll();
  }
};
Actions.pickSkillSlot = (el) => { App.skillSlot = Number(el.dataset.index); refreshKeepScroll(); };
Actions.clearSlot = (el) => { clearSkillSlot(App.hero, Number(el.dataset.index)); commit(); };
Actions.learnSkill = (el) => { if (notifyResult(learnSkill(App.hero, el.dataset.id), "Навык изучен.")) commit(); };
Actions.assignSkill = (el) => { assignSkillToSlot(App.hero, el.dataset.id, App.skillSlot); commit(); };
Actions.openMastery = (el) => openMasteryModal(el.dataset.id);

function openMasteryModal(skillId, onDone = null) {
  const skill = getSkillDefinition(skillId);
  const choices = getSkillMasteryChoices(skill);
  App.masteryDone = onDone;
  openModal(`<span class="eyebrow">Мастерство V</span><h2>${esc(skill.name)}</h2><p class="muted">Выбери постоянный бонус. Этот выбор нельзя изменить.</p>
    <div class="choice-list">${choices.map((choice) => `<button class="choice-card" data-action="chooseMastery" data-skill="${skillId}" data-choice="${choice.id}" data-sound="level"><strong>${esc(choice.name)}</strong><small>${esc(choice.description)}</small></button>`).join("")}</div>
    <div class="modal-actions"><button class="btn" data-action="closeModal">Решу позже</button></div>`, { onClose: () => { const done = App.masteryDone; App.masteryDone = null; done?.(); } });
}

Actions.chooseMastery = (el) => {
  chooseSkillBonus(App.hero, el.dataset.skill, el.dataset.choice);
  persist();
  closeModal();
  if (App.screen === "hub") refreshKeepScroll();
};

// --- Talents ---
function schoolIcon(school) {
  if (hasArt(`school_${school.id}`)) return `<span class="school-art">${artImg(`school_${school.id}`)}</span>`;
  return icon(school.effect || school.icon || "talents");
}

function viewTalents() {
  const hero = App.hero;
  if (getTalentBoard(hero).length) return viewTalentBoard();
  const schools = getHeroSchools(hero);
  if (!schools.some((school) => school.id === App.talentSchool)) App.talentSchool = schools[0]?.id;
  const school = TALENT_SCHOOLS[App.talentSchool];
  const groups = [["Профессия", (s) => s.profession], ["Подкласс", (s) => s.subclass], ["Класс", (s) => s.classOnly], ["Школы", (s) => !s.profession && !s.subclass && !s.classOnly]];
  const free = getTalentPointsFree(hero);
  const needSub = hero.level < SUBCLASS_UNLOCK_LEVEL;
  return `
  <section class="panel talent-head">
    <div class="talent-stats">
      <span class="chip accent">${icon("talents")}Очков талантов: ${free}</span>
      <span class="chip" data-tip="text|Ключевые таланты|Огромная сила с настоящей платой. Лимит растёт: 1, на 30 уровне 2, на 60 уровне 3.">Ключевых: ${getKeystoneCount(hero)} из ${getKeystoneLimit(hero)}</span>
      <span class="chip" data-tip="text|Откуда очки|1 очко за каждый уровень и ${TALENTS_PER_GUARDIAN} за каждого побеждённого стража.">Всего: ${getTalentPointsTotal(hero)}</span>
    </div>
    <div class="row-gap">
      ${hero.skillPoints ? `<button class="btn small" data-action="talentExchange" data-tip="text|Обмен|Лишнее очко навыка превращается в ${TALENTS_PER_SKILL_POINT} очка талантов.">Обменять очко навыка (${hero.skillPoints})</button>` : ""}
      <button class="btn small" data-action="talentAuto" ${free > 0 ? "" : "disabled"}>Подобрать за меня</button>
      <button class="btn small" data-action="talentReset" ${hero.talents.length ? "" : "disabled"}>Сбросить за ${TALENT_RESET_COST(hero.level)} золота</button>
    </div>
  </section>
  <div class="talent-layout">
    <nav class="school-list" aria-label="Школы талантов">
      ${groups.map(([title, match]) => {
        const list = schools.filter(match);
        if (!list.length) return "";
        return `<small class="school-group">${title}</small>${list.map((entry) => {
          const spent = getSchoolPointsSpent(hero, entry.id);
          return `<button class="school-btn${entry.id === App.talentSchool ? " active" : ""}" data-action="talentSchool" data-id="${entry.id}" ${entry.id === App.talentSchool ? 'aria-current="true"' : ""}>${schoolIcon(entry)}<span>${esc(entry.name)}</span>${spent ? `<i>${spent}</i>` : ""}</button>`;
        }).join("")}`;
      }).join("")}
      ${needSub ? `<small class="muted school-note">Новые школы откроются с подклассом на ${SUBCLASS_UNLOCK_LEVEL} уровне и профессией на ${PROFESSION_UNLOCK_LEVEL}.</small>` : ""}
    </nav>
    <section class="panel talent-board">
      <div class="panel-head"><h2>${esc(school.name)}</h2><span class="chip">В школе: ${getSchoolPointsSpent(hero, school.id)}</span></div>
      <p class="muted small">${esc(school.description)}</p>
      ${[1, 2, 3, 4].map((tier) => {
        const ids = school.talents.filter((id) => TALENTS[id].tier === tier);
        if (!ids.length) return "";
        const level = TALENT_TIER_LEVEL[tier];
        return `<div class="talent-tier"><small class="tier-label">${tier === 4 ? "Ключевой" : `Круг ${tier}`}${level > 1 ? ` · с ${level} уровня` : ""}</small><div class="talent-grid">${ids.map(talentCard).join("")}</div></div>`;
      }).join("")}
    </section>
  </div>`;
}

function talentCard(id) {
  const hero = App.hero;
  const def = TALENTS[id];
  const taken = getActiveTalentIds(hero).includes(id);
  const check = canTakeTalent(hero, id);
  const state = taken ? "taken" : check.ok ? "open" : "closed";
  return `<button class="talent-card kind-${def.kind} ${state}" data-action="takeTalent" data-id="${id}" data-tip="talent|${id}" ${check.ok ? "" : "disabled"} aria-pressed="${taken}">
    <span class="talent-kind">${TALENT_KINDS[def.kind].name}</span>
    <strong>${esc(def.name)}</strong>
    <small>${esc(def.description)}</small>
    <span class="talent-foot">${taken ? "Взят" : check.ok ? `Взять за ${def.cost}` : esc(check.reason)}</span>
  </button>`;
}

Actions.talentSchool = (el) => { App.talentSchool = el.dataset.id; refreshKeepScroll(); };
Actions.takeTalent = (el) => { if (notifyResult(takeTalent(App.hero, el.dataset.id), `Талант «${TALENTS[el.dataset.id].name}» взят.`)) { SFX.play("level"); commit(); } };
Actions.talentAuto = () => { autoSpendTalents(App.hero); toast("Очки развития распределены.", "good"); commit(); };
Actions.talentReset = async () => {
  const ok = await confirmDialog({ title: "Сбросить таланты и формы?", text: App.hero.freeRespec ? "Это бесплатно. Все очки развития вернутся." : `Это стоит ${respecCost(App.hero)} золота. Все очки развития вернутся.`, confirmLabel: "Сбросить" });
  if (ok && notifyResult(resetTalents(App.hero), "Таланты сброшены.")) commit();
};

// --- Forge ---
const FORGE_MODES = [
  { id: "enhance", name: "Заточка", hint: "Усиливает все свойства вещи на 7% за уровень. При неудаче материалы теряются, а вещь остаётся целой." },
  { id: "reforge", name: "Перековка", hint: "Заново определяет дополнительные свойства вещи." },
  { id: "ascend", name: "Возвышение", hint: "Поднимает реликвию комплекта до твоего уровня. Выше ступени, которую ты победил в её логове, поднять нельзя." },
  { id: "dismantle", name: "Разбор", hint: "Превращает вещи из рюкзака в материалы. Отмечай сразу несколько или целыми группами." },
  { id: "mutate", name: "Мутации", hint: "Навык с V уровнем мастерства получает новое свойство. Мутация необратима." }
];

function forgeCandidates(mode) {
  const hero = App.hero;
  const equipped = EQUIP_LAYOUT.filter((slot) => hero.equipment[slot]).map((slot) => ({ source: "eq", key: slot, item: hero.equipment[slot] }));
  const bag = hero.inventory.map((item, index) => ({ source: "inv", key: index, item })).filter((entry) => entry.item);
  if (mode === "dismantle") return bag;
  if (mode === "reforge") return [...equipped, ...bag].filter((entry) => entry.item.affixes.length);
  if (mode === "ascend") return [...equipped, ...bag].filter((entry) => entry.item.rarity === "relic");
  return [...equipped, ...bag];
}

function viewForge() {
  const mode = App.forge.mode;
  const info = FORGE_MODES.find((entry) => entry.id === mode);
  return `${campVoice("forge")}<div class="tab-row" role="tablist">${FORGE_MODES.map((entry) => `<button role="tab" aria-selected="${entry.id === mode}" class="tab${entry.id === mode ? " active" : ""}" data-action="forgeMode" data-mode="${entry.id}">${entry.name}</button>`).join("")}</div>
    <p class="muted forge-hint">${esc(info.hint)}</p>
    ${mode === "mutate" ? forgeMutations() : forgeItems(mode)}`;
}

function forgeItems(mode) {
  if (mode === "dismantle") {
    App.bagPick = App.bagPick || [];
    return `<div class="forge-layout"><section class="panel"><div class="panel-head"><h2>Рюкзак</h2></div><div class="bag-grid forge-grid">${App.hero.inventory.map((item, index) => (item ? pickCell(item, index) : "")).join("")}</div></section><section class="panel forge-work">${bulkPanel(false)}</section></div>`;
  }
  const candidates = forgeCandidates(mode);
  const ref = App.forge.ref;
  const selected = ref ? getItemByRef(ref.source, ref.key) : null;
  return `<div class="forge-layout">
    <section class="panel"><div class="panel-head"><h2>Вещи</h2></div>
      <div class="bag-grid forge-grid">${candidates.map(({ source, key, item }) => `<div class="forge-cell${ref && ref.source === source && String(ref.key) === String(key) ? " selected" : ""}">${itemCell(item, source, key, { action: "forgeSelect" })}${source === "eq" ? `<i class="worn">надето</i>` : ""}</div>`).join("") || `<p class="muted">Подходящих вещей нет.</p>`}</div>
    </section>
    <section class="panel forge-work">${selected ? forgeWork(mode, selected) : `<div class="anvil-empty">${icon("anvil")}<p class="muted">Выбери вещь слева.</p></div>`}</section>
  </div>`;
}

function forgeWork(mode, item) {
  const hero = App.hero;
  const head = itemDetailHtml(item, "preview");
  if (mode === "enhance") {
    const cost = getEnhanceCost(item);
    const resource = SHOP_RESOURCE_CATALOG.find((res) => res.id === cost.resource);
    const max = item.enhanceLevel >= MAX_ENHANCE;
    const afford = hero.gold >= cost.gold && Number(hero.resources[cost.resource] || 0) >= cost.amount;
    return `${head}<div class="cost-box">${max ? `<p class="muted">Предел заточки достигнут.</p>` : `<div><span>Шанс успеха</span><b>${Math.round(cost.chance * 100)}%</b></div><div><span>Золото</span><b class="${hero.gold >= cost.gold ? "" : "lack"}">${cost.gold}</b></div><div><span>${esc(resource.name)}</span><b class="${Number(hero.resources[cost.resource] || 0) >= cost.amount ? "" : "lack"}">${cost.amount} (есть ${Number(hero.resources[cost.resource] || 0)})</b></div>`}</div><button class="btn primary big" data-action="forgeEnhance" data-sound="anvil" ${max || !afford ? "disabled" : ""}>Заточить до +${item.enhanceLevel + 1}</button>`;
  }
  if (mode === "ascend") {
    const plan = getRelicAscension(hero, item);
    if (!plan.ok) return `${head}<div class="cost-box"><p class="muted">${esc(plan.reason)}</p></div>`;
    const owned = Number(hero.lairTokens?.[plan.lair.id] || 0);
    const afford = hero.gold >= plan.gold && owned >= plan.tokens;
    return `${head}<div class="cost-box"><div><span>Новый уровень вещи</span><b>${plan.target}</b></div><div><span>Золото</span><b class="${hero.gold >= plan.gold ? "" : "lack"}">${plan.gold}</b></div><div><span>Жетоны «${esc(plan.lair.name)}»</span><b class="${owned >= plan.tokens ? "" : "lack"}">${plan.tokens} (есть ${owned})</b></div></div><button class="btn primary big" data-action="forgeAscend" data-sound="anvil" ${afford ? "" : "disabled"}>Возвысить</button>`;
  }
  if (mode === "reforge") {
    const cost = getReforgeCost(item);
    const afford = hero.gold >= cost.gold && hero.mutationShards >= cost.shards;
    return `${head}<div class="cost-box"><div><span>Золото</span><b class="${hero.gold >= cost.gold ? "" : "lack"}">${cost.gold}</b></div><div><span>Осколки мутации</span><b class="${hero.mutationShards >= cost.shards ? "" : "lack"}">${cost.shards} (есть ${hero.mutationShards})</b></div></div><button class="btn primary big" data-action="forgeReforge" data-sound="anvil" ${afford ? "" : "disabled"}>Перековать</button>`;
  }
  return head;
}

function forgeMutations() {
  const hero = App.hero;
  const ready = getVisibleClassSkills(hero, "active").filter((skill) => isSkillLearned(hero, skill.id) && getSkillProgress(hero, skill.id).level >= SKILL_MAX_LEVEL);
  if (!ready.length) return `<section class="panel"><div class="anvil-empty">${icon("shard")}<p class="muted">Пока нет навыков V уровня. Мастерство растёт каждый раз, когда ты применяешь навык в бою.</p></div></section>`;
  return `<div class="mutation-list">${ready.map((skill) => {
    const progress = getSkillProgress(hero, skill.id);
    return `<section class="panel"><div class="panel-head"><h3>${skillIcon(skill)} ${esc(skill.name)}</h3>${progress.mutation ? `<span class="tag on">${esc(MUTATIONS[progress.mutation].name)}</span>` : ""}</div>
      ${progress.mutation ? `<p class="muted small">${esc(MUTATIONS[progress.mutation].description)}</p>` : `<div class="choice-list row">${Object.values(MUTATIONS).map((mutation) => {
        const check = canMutateSkill(hero, skill.id, mutation.id);
        const costText = Object.entries(mutation.cost).map(([id, amount]) => (id === "shards" ? `осколки ×${amount}` : `${SHOP_RESOURCE_CATALOG.find((res) => res.id === id).name} ×${amount}`)).join(", ");
        return `<button class="choice-card" data-action="forgeMutate" data-skill="${skill.id}" data-mutation="${mutation.id}" data-sound="anvil" ${check.ok ? "" : "disabled"}><strong>${esc(mutation.name)}</strong><small>${esc(mutation.description)}</small><small class="cost-line">${esc(costText)}</small></button>`;
      }).join("")}</div>`}</section>`;
  }).join("")}</div>`;
}

Actions.forgeMode = (el) => { App.forge.mode = el.dataset.mode; App.forge.ref = null; render(); };
Actions.forgeSelect = (el) => { App.forge.ref = { source: el.dataset.source, key: el.dataset.key }; refreshKeepScroll(); };
Actions.forgeEnhance = () => {
  const item = getItemByRef(App.forge.ref.source, App.forge.ref.key);
  const res = enhanceItem(App.hero, item);
  if (!notifyResult(res)) return;
  toast(res.success ? `Успех! ${getItemDisplayName(item)}.` : "Металл не выдержал: заточка не удалась.", res.success ? "good" : "bad");
  commit();
};
Actions.forgeAscend = () => {
  const item = getItemByRef(App.forge.ref.source, App.forge.ref.key);
  if (notifyResult(ascendRelic(App.hero, item), "Реликвия возвышена.")) commit();
};
Actions.forgeReforge = () => {
  const item = getItemByRef(App.forge.ref.source, App.forge.ref.key);
  if (notifyResult(reforgeItem(App.hero, item), "Свойства вещи изменились.")) commit();
};
Actions.forgeMutate = (el) => {
  if (notifyResult(mutateSkill(App.hero, el.dataset.skill, el.dataset.mutation), "Навык мутировал!")) commit();
};

// --- Shop ---
const SHOP_TABS = [{ id: "gear", name: "Снаряжение" }, { id: "potions", name: "Зелья" }, { id: "materials", name: "Материалы" }, { id: "passives", name: "Умения" }];

function viewShop() {
  const hero = App.hero;
  if (!hero.shop) refreshShopStock(hero);
  const content = { gear: shopGear, potions: shopPotions, materials: shopMaterials, passives: shopPassives }[App.shopTab]();
  return `${campVoice("shop")}<div class="tab-row" role="tablist">${SHOP_TABS.map((tab) => `<button role="tab" aria-selected="${tab.id === App.shopTab}" class="tab${tab.id === App.shopTab ? " active" : ""}" data-action="shopTab" data-id="${tab.id}">${tab.name}</button>`).join("")}</div>${content}`;
}

function shopGear() {
  const hero = App.hero;
  const refreshCost = 10 + hero.level * 6;
  return `<div class="panel-head"><p class="muted">Товар обновляется каждые два похода.</p><button class="btn small" data-action="shopRefresh" data-sound="coin" ${hero.gold >= refreshCost ? "" : "disabled"}>Обновить за ${refreshCost}</button></div>
    <div class="shop-grid">${hero.shop.stock.map((item, index) => {
      const price = getShopPrice(item);
      const delta = previewEquipDelta(hero, item).slice(0, 3);
      return `<article class="panel shop-card" data-tip="item|shop|${index}">${itemCell(item, "shop", index, { action: "noop" })}<div class="shop-text"><strong class="rarity-text-${item.rarity}">${esc(getItemDisplayName(item))}</strong><small>${esc(describeItemBonuses(item).slice(0, 3).join(", "))}</small><small class="deltas">${delta.map((d) => `<span class="${d.delta > 0 ? "up" : "down"}">${d.delta > 0 ? "+" : ""}${d.delta} ${esc(d.label)}</span>`).join(" ")}</small></div><button class="btn primary small" data-action="shopBuy" data-index="${index}" data-sound="coin" ${hero.gold >= price ? "" : "disabled"}>${icon("gold")}${price}</button></article>`;
    }).join("") || `<p class="muted">Всё раскупили.</p>`}</div>`;
}

function shopPotions() {
  const hero = App.hero;
  return `<div class="shop-grid">${Object.values(POTIONS).map((potion) => {
    const price = getPotionPrice(potion.id, hero);
    return `<article class="panel shop-card"><div class="item-cell potion-${potion.id}">${icon(potion.id === "hp" ? "potionHp" : "potionMp")}</div><div class="shop-text"><strong>${esc(potion.name)}</strong><small>${esc(potion.description)}</small><small>В поясе: ${hero.potions[potion.id]} / ${POTION_LIMIT}</small></div><button class="btn primary small" data-action="shopPotion" data-id="${potion.id}" data-sound="coin" ${hero.gold >= price && hero.potions[potion.id] < POTION_LIMIT ? "" : "disabled"}>${icon("gold")}${price}</button></article>`;
  }).join("")}</div>`;
}

function shopMaterials() {
  const hero = App.hero;
  return `<div class="shop-grid">${SHOP_RESOURCE_CATALOG.map((res) => `<article class="panel shop-card"><div class="item-cell rarity-${res.rarity}">${icon(RESOURCE_ICON[res.id])}</div><div class="shop-text"><strong class="rarity-text-${res.rarity}">${esc(res.name)}</strong><small>${esc(res.description)}</small><small>Есть: ${Number(hero.resources[res.id] || 0)}</small></div><button class="btn primary small" data-action="shopResource" data-id="${res.id}" data-sound="coin" ${hero.gold >= res.price ? "" : "disabled"}>${icon("gold")}${res.price}</button></article>`).join("")}</div>`;
}

function shopPassives() {
  const hero = App.hero;
  const usable = SHOP_PASSIVE_CATALOG.filter((passive) => canUseShopPassive(hero, passive));
  const groups = Object.keys(SHOP_GROUPS).filter((id) => usable.some((passive) => passive.effectType === id));
  const current = groups.includes(App.shopGroup) || App.shopGroup === "all" || App.shopGroup === "owned" ? App.shopGroup : "all";
  const active = getActiveShopIds(hero);
  const limit = getShopSlotLimit(hero);
  const visible = usable.filter((passive) => current === "all" || (current === "owned" ? hero.shopPassiveIds.includes(passive.id) : passive.effectType === current));
  return `<section class="panel shop-passive-head"><div class="talent-stats"><span class="chip accent">Ячейки: ${active.length} из ${limit}</span><span class="chip">Куплено: ${hero.shopPassiveIds.length}</span><span class="chip">Доступно твоему классу: ${usable.length}</span></div><p class="muted small">Купленное умение остаётся навсегда, но действуют только те, что стоят в ячейках. Ячейка добавляется каждые 10 уровней.</p>
    <div class="shop-filter" role="group" aria-label="Группы умений"><button class="tab small${current === "all" ? " active" : ""}" data-action="shopGroup" data-id="all">Все</button><button class="tab small${current === "owned" ? " active" : ""}" data-action="shopGroup" data-id="owned">Мои</button>${groups.map((id) => `<button class="tab small${current === id ? " active" : ""}" data-action="shopGroup" data-id="${id}">${esc(SHOP_GROUPS[id].name)}</button>`).join("")}</div></section>
  <div class="passive-grid">${visible.map((passive) => {
    const owned = hero.shopPassiveIds.includes(passive.id);
    const on = active.includes(passive.id);
    const locked = hero.level < Number(passive.minLevel || 1);
    const state = on ? `<button class="btn small" data-action="shopToggle" data-id="${passive.id}">Снять</button>` : owned ? `<button class="btn primary small" data-action="shopToggle" data-id="${passive.id}">В ячейку</button>` : locked ? `<span class="tag lock">${icon("lock")}${passive.minLevel} ур.</span>` : `<button class="btn small" data-action="shopPassive" data-id="${passive.id}" ${hero.gold >= passive.price ? "" : "disabled"}>${icon("gold")}${passive.price}</button>`;
    return `<article class="passive-card${on ? " on" : ""}${locked && !owned ? " locked" : ""}"><div class="passive-title">${icon(SHOP_GROUPS[passive.effectType]?.icon || passive.effectType)}<strong>${esc(passive.name)}</strong></div><small>${esc(passive.description)}</small><div class="passive-foot"><span class="tag">${esc(SHOP_GROUPS[passive.effectType]?.name || "")}</span>${state}</div></article>`;
  }).join("") || `<p class="muted">Здесь пока пусто.</p>`}</div>`;
}

Actions.noop = () => {};
Actions.shopTab = (el) => { App.shopTab = el.dataset.id; render(); };
Actions.shopRefresh = () => {
  const cost = 10 + App.hero.level * 6;
  if (App.hero.gold < cost) return;
  App.hero.gold -= cost;
  refreshShopStock(App.hero);
  commit();
};
Actions.shopBuy = (el) => { if (notifyResult(buyShopItem(App.hero, Number(el.dataset.index)), "Куплено. Вещь в рюкзаке.")) commit(); };
Actions.shopPotion = (el) => { if (notifyResult(buyPotion(App.hero, el.dataset.id))) commit(); };
Actions.shopResource = (el) => { if (notifyResult(buyResource(App.hero, el.dataset.id))) commit(); };
Actions.shopPassive = (el) => { if (notifyResult(buyShopPassive(App.hero, el.dataset.id), "Умение куплено.")) commit(); };
Actions.shopToggle = (el) => { if (notifyResult(toggleShopPassive(App.hero, el.dataset.id))) commit(); };
Actions.shopGroup = (el) => { App.shopGroup = el.dataset.id; refreshKeepScroll(); };

// --- Journal ---
function viewJournal() {
  const hero = App.hero;
  const tabs = [{ id: "story", name: "История" }, { id: "bestiary", name: "Бестиарий" }, { id: "records", name: "Достижения" }, { id: "guide", name: "Как играть" }];
  let body = "";
  if (App.journalTab === "story") {
    body = viewStoryJournal();
  } else if (App.journalTab === "bestiary") {
    body = REGIONS.map((region) => `<section class="panel"><h3>${esc(region.name)}</h3><div class="bestiary">${[...region.enemies, region.guardian].map((id) => {
      const def = ENEMY_DEFINITIONS[id];
      const kills = Number(hero.records.bestiary[id] || 0);
      return `<article class="beast-card${kills ? "" : " unknown"}" ${kills ? `data-tip="enemy|${id}"` : ""}><div class="beast-art">${paintedPose(id) || enemySprite(def.art, def.tint)}</div><strong>${kills ? esc(def.name) : "Неизвестно"}</strong><small>${kills ? `Побед: ${kills}` : "Ещё не встречен"}</small></article>`;
    }).join("")}</div></section>`).join("");
  } else if (App.journalTab === "records") {
    const rec = hero.records;
    body = `<section class="panel"><div class="derived-grid">${[["Побед в боях", rec.kills], ["Элиты", rec.elites], ["Вожаки", rec.bosses], ["Походов начато", rec.expeditions], ["Походов завершено", rec.completed], ["Гибелей", rec.deaths], ["Лучший удар", rec.maxHit], ["Стражей повержено", hero.defeatedGuardians.length]].map(([label, value]) => `<div class="derived"><span>${label}</span><b>${value}</b></div>`).join("")}</div></section>`;
  } else {
    body = `<section class="panel guide">
      <h3>Поход</h3><p>Выбери тропу: цвет показывает риск. На каждом шаге выбирай развилку. Здоровье и мана переносятся между шагами. Вещи сразу попадают в рюкзак, а золото и материалы становятся твоими в конце похода. Отступить можно между шагами без потерь. При гибели пропадут ненадетые находки и половина золота и материалов, опыт останется.</p>
      <h3>Бой</h3><p>Шкала сверху показывает очередь ходов: чем выше скорость, тем чаще ты ходишь. Над врагом видно его следующее действие и примерный урон. Тяжёлый удар отмечен красным: прими <b>стойку</b>, чтобы снизить урон вдвое, или <b>оглуши</b> врага и сорви удар. <b>Выждать</b> восстанавливает ману и приближает следующий ход.</p>
      <h3>Яд и кровь</h3><p>Яд медленный: идёт мимо щитов, растёт с каждым тиком и работает даже на оглушённой цели. Кровь быстрая: срабатывает, только когда цель действует, вдвое сильнее на тяжёлом ударе, затухает, а твой крит вскрывает её сразу.</p>
      <h3>Таланты</h3><p>За каждый уровень даётся очко таланта. Круги открываются только по уровню героя. Школы открываются по классу, подклассу и профессии. Талант может усиливать эффект, менять его правила, создавать новый эффект или связывать два эффекта. Ключевые таланты дают огромную силу за настоящую плату.</p>
      <h3>Враги учатся</h3><p>Один и тот же навык подряд слабеет: враг привыкает. У каждого врага есть повадки, они видны ещё на развилке. Заряд можно сорвать уроном или оглушением.</p>
      <h3>Дары тропы</h3><p>Элита, привал и алтари дают дар до конца похода. Проклятые дары сильнее, но требуют платы.</p>
      <h3>Рост</h3><p>За уровень даётся 3 очка характеристик, очко развития за каждые 2 уровня и ещё по 2 за первых четырёх стражей. Очки развития идут на формы навыков и таланты, всё взять нельзя. Сами навыки открываются по уровню. Путь открывается по шагам: подкласс на ${SUBCLASS_UNLOCK_LEVEL} уровне, профессия на ${PROFESSION_UNLOCK_LEVEL}, у каждого шага свои навыки. Навык растёт от применения, на V уровне даёт постоянный бонус, а затем может мутировать в кузнице.</p>
      <h3>Цель</h3><p>Твоя деревня исчезла с карт и из памяти людей. Дорога к ответу идёт через четыре региона: победа над стражем открывает следующий. Текущая цель всегда видна в лагере, а записи лежат во вкладке «История».</p>
      <h3>Клавиши в бою</h3><p><kbd>1</kbd>–<kbd>5</kbd> навыки, <kbd>Q</kbd> удар, <kbd>W</kbd> стойка, <kbd>E</kbd> выждать, <kbd>R</kbd> зелье лечения, <kbd>T</kbd> зелье маны, <kbd>A</kbd> авто-бой.</p></section>`;
  }
  return `<div class="tab-row" role="tablist">${tabs.map((tab) => `<button role="tab" aria-selected="${tab.id === App.journalTab}" class="tab${tab.id === App.journalTab ? " active" : ""}" data-action="journalTab" data-id="${tab.id}">${tab.name}</button>`).join("")}</div>${body}`;
}
Actions.journalTab = (el) => { App.journalTab = el.dataset.id; render(); };

// --- Dev tools, only with ?dev=1 ---
const DEV_TOOLS = {
  "Персонаж": [["+1 уровень", (h) => awardExperience(h, getExperienceForNextLevel(h.level))], ["+10 уровней", (h) => { for (let i = 0; i < 10; i += 1) awardExperience(h, getExperienceForNextLevel(h.level)); }], ["+1000 опыта", (h) => awardExperience(h, 1000)], ["+10 очков характеристик", (h) => { h.statPoints += 10; }], ["+5 очков навыков", (h) => { h.skillPoints += 5; }], ["+10 очков талантов", (h) => { h.talentsExchanged = Number(h.talentsExchanged || 0) + 5; }], ["+5000 золота", (h) => { h.gold += 5000; }], ["Восстановить здоровье и ману", (h) => { h.currentHp = h.maxHp; h.currentMana = h.maxMana; }], ["Полный сброс героя", () => devResetHero()]],
  "Навыки": [["Открыть навыки по уровню", (h) => { getVisibleClassSkills(h).forEach((s) => { if (Number(s.unlockLevel) <= h.level && !isSkillLearned(h, s.id)) { h.skillPoints += 1; learnSkill(h, s.id); } }); }], ["Опыт изученным навыкам +50", (h) => h.knownSkillIds.forEach((id) => grantSkillExperience(h, id, 50))], ["Все навыки до V", (h) => h.knownSkillIds.forEach((id) => { const p = getSkillProgress(h, id); if (p) { p.level = SKILL_MAX_LEVEL; p.exp = 0; p.expToNext = 0; } })], ["Сбросить мастерство", (h) => { h.skillProgress = {}; }], ["Заново выбрать бонусы V", (h) => Object.values(h.skillProgress).forEach((p) => { p.bonusChoice = null; })]],
  "Инвентарь": [["Красная вещь", (h) => addItemToInventory(h, generateItem({ level: h.level, rarity: "red", classKey: h.classKey }))], ["Заполнить рюкзак", (h) => { while (firstFreeInventorySlot(h) >= 0) addItemToInventory(h, generateItem({ level: h.level, rarity: randomFrom(RARITY_KEYS), classKey: h.classKey })); }], ["Очистить рюкзак", (h) => { h.inventory = Array(INVENTORY_SIZE).fill(null); }], ["+10 всех материалов и осколков", (h) => { SHOP_RESOURCE_CATALOG.forEach((r) => { h.resources[r.id] += 10; }); h.mutationShards += 10; }], ["Открыть все регионы", (h) => { h.unlockedRegion = REGIONS.length - 1; }]],
  "Бой": [["Убить врага", () => { if (App.battle?.awaiting) { dealDamage(App.battle, App.battle.enemy, App.battle.enemy.currentHp, { raw: true }); App.battle.awaiting = true; heroAction(App.battle, { type: "wait" }); playBattleEvents(); } }], ...["burn", "poison", "bleed", "frost", "frostbite", "freeze", "stagger", "corruption", "stun", "mark", "weaken"].map((id) => [`Враг: ${STATUS_EFFECT_DEFINITIONS[id].name}`, () => { if (App.battle) { applyEffect(App.battle, App.battle.enemy, { id, duration: 3, value: STATUS_EFFECT_DEFINITIONS[id].ratio ? 0.25 : id === "frostbite" ? 20 : 12, meta: id === "burn" ? { stacks: 1 } : {} }, App.hero); renderStageFromState(); } }]), ["Герой: оглушение", () => { if (App.battle) { applyEffect(App.battle, App.hero, { id: "stun", duration: 1 }, App.battle.enemy); renderStageFromState(); } }]]
};

function devResetHero() {
  const hero = App.hero;
  const base = classDefinitions[hero.classKey].stats;
  const allocated = Object.fromEntries(STAT_KEYS.map((key) => [key, Number(hero.startingStats?.[key] ?? base[key]) - base[key]]));
  const fresh = createHero({ name: hero.name, classKey: hero.classKey, allocated });
  fresh.id = hero.id;
  refreshShopStock(fresh);
  App.hero = fresh;
  App.battle = null;
  App.fight = null;
  App.tab = "trail";
  App.screen = "hub";
}

Actions.openDev = () => {
  const groups = Object.entries(DEV_TOOLS).map(([group, tools]) => `<h3>${group}</h3><div class="modal-actions wrap">${tools.map(([name], index) => `<button class="btn small" data-action="devDo" data-group="${group}" data-index="${index}">${esc(name)}</button>`).join("")}</div>`).join("");
  openModal(`<h2>Инструменты разработчика</h2>${groups}<div class="modal-actions"><button class="btn" data-action="closeModal">Закрыть</button></div>`, { wide: true });
};
Actions.devDo = (el) => {
  DEV_TOOLS[el.dataset.group][Number(el.dataset.index)][1](App.hero);
  if (App.hero) applyDerivedStats(App.hero);
  persist();
  closeModal();
  if (App.screen !== "battle") render();
};
