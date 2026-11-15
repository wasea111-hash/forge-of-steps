// Personal skills of companions: each person has their own resource and three branches of three skills.
// Design: docs/COMPANIONS_2_CAMP_TOWN.md, section A. Logic: js/core/companion-skills.js.
// A — the companion's attack (Iva hits with magic), Hp — the receiver's max health, YourHp — yours.
// cd — cooldown in the companion's own turns. base: known from the first day.
// unlock: trust needed, plus one of: deed { kind, count } (counted once per fight) or memory (index of a memory).

const COMPANION_RESOURCES = {
  tessa: { id: "resolve", name: "Решимость", max: 4, start: 1, hint: "+1, когда удар врага попадает по Тессе или её щиту." },
  rud: { id: "coals", name: "Угли", max: 4, start: 0, hint: "+1 за прямое попадание любого из вас, не чаще раза за действие." },
  iva: { id: "store", name: "Запас", max: 25, start: 0, percent: true, hint: "Половина лишнего лечения и истёкших щитов. До 25% твоего здоровья." },
  fena: { id: "thrill", name: "Азарт", max: 3, start: 1, hint: "+1, когда ты бьёшь не её добычу; +1, когда Фена добивает." }
};

// Kinds of deeds that open skills. Each counts at most once per fight.
const COMPANION_DEEDS = {
  interceptHeavy: "принять тяжёлый удар впереди",
  surviveBack: "выстоять вдвоём, пока спутник сзади",
  rootsWeaken: "ослабить врага корнями",
  coals3: "накопить три угля",
  blast: "обрушить взрыв углей",
  breakCharge: "сорвать заряд врага",
  shieldGiven: "закрыть тебя щитом",
  store8: "накопить запас в 8% твоего здоровья",
  markUsed: "дать тебе ударить по её метке",
  transfer: "перенести запас тебе",
  splitTargets: "бить разные цели вместе",
  preyKill: "добить свою добычу",
  bleedHit: "ударить по кровоточащей цели"
};

const COMPANION_SKILLS = [
  // ---------- Тесса — Корнещит ----------
  { id: "tessa_whip", who: "tessa", branch: "Глубокие корни", name: "Корневой хлыст", base: true, cost: 0, cd: 0, target: "foe", text: "0,8А одной цели. +1 Решимость при попадании.", ai: ["attack"] },
  { id: "tessa_root", who: "tessa", branch: "Глубокие корни", name: "Укорениться", cost: 0, cd: 2, target: "self", text: "Укрепление 30% до своего хода. После двух попавших ударов последний нападавший ослаблен на 20% на 2 хода.", unlock: { trust: 20, deed: { kind: "interceptHeavy", count: 2 } }, ai: ["defense", "front"] },
  { id: "tessa_house", who: "tessa", branch: "Глубокие корни", name: "Дом из корней", cost: 3, cd: 4, target: "self", text: "Щит Тессе 20% здоровья и укрепление 30%, оба на 2 хода.", unlock: { trust: 60, memory: 1 }, ai: ["defense"] },
  { id: "tessa_cover", who: "tessa", branch: "За спиной", name: "За мою спину", base: true, cost: 1, cd: 2, target: "self", text: "Следующее действие врага по тебе принимает Тесса, с укреплением 20%.", ai: ["protect"] },
  { id: "tessa_path", who: "tessa", branch: "За спиной", name: "Тропа под щитом", cost: 2, cd: 3, target: "self", text: "Вы меняетесь местами без траты хода, тебе щит 8% здоровья на 2 хода.", unlock: { trust: 30, deed: { kind: "surviveBack", count: 3 } }, ai: ["protect"] },
  { id: "tessa_hold", who: "tessa", branch: "За спиной", name: "Есть кому держать", cost: 3, cd: 5, target: "self", text: "Тебе укрепление 25%, Тессе щит 12% здоровья — на 2 хода.", unlock: { trust: 90, memory: 2 }, ai: ["protect", "defense"] },
  { id: "tessa_reply", who: "tessa", branch: "Право ответить", name: "Сухой ответ", base: true, cost: 0, cd: 1, target: "foe", text: "0,9А и слабость 15% на 1 ход.", ai: ["attack", "debuff"] },
  { id: "tessa_threshold", who: "tessa", branch: "Право ответить", name: "Порог", cost: 2, cd: 3, target: "foe", text: "1,15А и метка 15% на 2 хода.", unlock: { trust: 40, deed: { kind: "rootsWeaken", count: 2 } }, ai: ["attack", "debuff"] },
  { id: "tessa_nobody", who: "tessa", branch: "Право ответить", name: "Никого за дверью", cost: 4, cd: 5, target: "all", text: "1,2А всем врагам и слабость 20% на 2 хода.", unlock: { trust: 60, deed: { kind: "interceptHeavy", count: 6 } }, ai: ["attack", "aoe"] },

  // ---------- Руд — Углевод ----------
  { id: "rud_tool", who: "rud", branch: "Работа лопатой", name: "Честный инструмент", base: true, cost: 0, cd: 0, target: "foe", text: "1,0А одной цели.", ai: ["attack"] },
  { id: "rud_blast", who: "rud", branch: "Работа лопатой", name: "Взрыв углей", cost: 3, cd: 2, target: "foe", text: "2,55А одной цели.", unlock: { trust: 20, deed: { kind: "coals3", count: 3 } }, ai: ["attack", "burst"] },
  { id: "rud_furnace", who: "rud", branch: "Работа лопатой", name: "Разомкнуть топку", cost: 4, cd: 5, target: "foe", text: "2,8А цели и 0,6А двум самым раненым врагам. Цель горит 2 хода.", unlock: { trust: 60, deed: { kind: "blast", count: 5 } }, ai: ["attack", "burst", "aoe"] },
  { id: "rud_puff", who: "rud", branch: "Своя заслонка", name: "Поддуть", base: true, cost: 0, cd: 2, target: "self", text: "+1 уголь и укрепление 15% до своего хода.", ai: ["build", "defense"] },
  { id: "rud_damper", who: "rud", branch: "Своя заслонка", name: "Прижать заслонку", cost: 1, cd: 3, target: "self", text: "Руду укрепление 30% на 2 хода, тебе щит 5% здоровья на 2 хода.", unlock: { trust: 30, memory: 0 }, ai: ["defense", "protect"] },
  { id: "rud_keepheat", who: "rud", branch: "Своя заслонка", name: "Держать жар", cost: 2, cd: 4, target: "ally", text: "Самому раненому из вас щит 12% здоровья на 2 хода.", unlock: { trust: 60, memory: 1 }, ai: ["protect"] },
  { id: "rud_cinder", who: "rud", branch: "Бить вовремя", name: "Окалиной в глаза", base: true, cost: 1, cd: 2, target: "foe", text: "0,65А и слабость 15% на 2 хода.", ai: ["attack", "debuff"] },
  { id: "rud_short", who: "rud", branch: "Бить вовремя", name: "Короткий замах", cost: 2, cd: 4, target: "foe", text: "1,0А и 70% шанс оглушить на 1 ход.", unlock: { trust: 40, deed: { kind: "breakCharge", count: 1 } }, ai: ["attack", "control"] },
  { id: "rud_done", who: "rud", branch: "Бить вовремя", name: "Работа окончена", cost: 3, cd: 4, target: "foe", text: "2,1А; по врагу, копящему заряд, — 2,7А.", unlock: { trust: 90, memory: 2 }, ai: ["attack", "burst"] },

  // ---------- Ива — Переплётчица ----------
  { id: "iva_thread", who: "iva", branch: "Переплести", name: "Нить", base: true, cost: 0, cd: 0, target: "foe", text: "0,65А врагу, тебе щит 4% здоровья на 2 хода, +3% запаса.", ai: ["attack", "protect", "build"] },
  { id: "iva_transfer", who: "iva", branch: "Переплести", name: "Перенести запас", cost: 1, cd: 1, target: "ally", text: "Весь запас до 12% твоего здоровья — щитом самому раненому из вас на 2 хода.", unlock: { trust: 20, deed: { kind: "store8", count: 3 } }, ai: ["protect", "spend"] },
  { id: "iva_binding", who: "iva", branch: "Переплести", name: "Общий переплёт", cost: 10, cd: 4, target: "self", text: "Тратит 10% запаса: вам обоим укрепление 20% на 2 хода.", unlock: { trust: 60, deed: { kind: "transfer", count: 5 } }, ai: ["protect", "defense"] },
  { id: "iva_scraps", who: "iva", branch: "Сберечь", name: "Подобрать обрывки", base: true, cost: 0, cd: 2, target: "self", text: "+6% запаса, Ива лечится на 4% здоровья.", ai: ["build", "defense"] },
  { id: "iva_margin", who: "iva", branch: "Сберечь", name: "Поле для правки", cost: 5, cd: 3, target: "hero", text: "Тратит 5% запаса: снимает с тебя кровотечение или горение, щит 4% здоровья.", unlock: { trust: 30, memory: 0 }, ai: ["cleanse", "protect"] },
  { id: "iva_page", who: "iva", branch: "Сберечь", name: "Несгоревшая страница", cost: 15, cd: 5, target: "ally", text: "Тратит 15% запаса: самого раненого лечит на 12% здоровья и даёт щит 6%.", unlock: { trust: 90, memory: 2 }, ai: ["heal", "protect"] },
  { id: "iva_cut", who: "iva", branch: "Отпустить строку", name: "Бумажный порез", base: true, cost: 0, cd: 2, target: "foe", text: "0,75А и метка 10% на 2 хода.", ai: ["attack", "debuff"] },
  { id: "iva_splash", who: "iva", branch: "Отпустить строку", name: "Выплеснуть запас", cost: 1, cd: 2, target: "foe", text: "Весь запас до 15%: удар 0,8А + половина потраченного.", unlock: { trust: 40, deed: { kind: "markUsed", count: 2 } }, ai: ["attack", "spend", "burst"] },
  { id: "iva_lastline", who: "iva", branch: "Отпустить строку", name: "Последняя строка", cost: 20, cd: 5, target: "foe", text: "Тратит 20% запаса: 1,6А и слабость 25% на 2 хода.", unlock: { trust: 60, deed: { kind: "transfer", count: 8 } }, ai: ["attack", "debuff", "burst"] },

  // ---------- Фена — Пустолов ----------
  { id: "fena_track", who: "fena", branch: "Добыча", name: "Выследить", base: true, cost: 0, cd: 0, target: "foe", text: "1,05А цели, она становится добычей.", ai: ["attack"] },
  { id: "fena_other", who: "fena", branch: "Добыча", name: "Другая добыча", cost: 1, cd: 2, target: "foe", text: "1,3А любой цели, затем добычей становится самый раненый враг.", unlock: { trust: 20, deed: { kind: "splitTargets", count: 2 } }, ai: ["attack"] },
  { id: "fena_impossible", who: "fena", branch: "Добыча", name: "Догнать невозможное", cost: 3, cd: 4, target: "foe", text: "2,0А; по цели ниже 30% здоровья — 2,5А.", unlock: { trust: 60, deed: { kind: "preyKill", count: 5 } }, ai: ["attack", "burst", "execute"] },
  { id: "fena_knot", who: "fena", branch: "Верёвка", name: "Проверить узел", base: true, cost: 0, cd: 2, target: "self", text: "+1 азарт, Фене щит 5% здоровья на 2 хода.", ai: ["build", "defense"] },
  { id: "fena_yank", who: "fena", branch: "Верёвка", name: "Выдернуть из замаха", cost: 2, cd: 3, target: "hero", text: "Тебе укрепление 35% до твоего следующего хода.", unlock: { trust: 30, memory: 0 }, ai: ["protect"] },
  { id: "fena_nohope", who: "fena", branch: "Верёвка", name: "Безнадёжных нет", cost: 3, cd: 5, target: "ally", text: "Тому из вас, кто ниже 30% здоровья: лечение 10% и укрепление 25% на 2 хода.", unlock: { trust: 90, memory: 2 }, ai: ["heal", "protect"] },
  { id: "fena_snip", who: "fena", branch: "Край", name: "Срезать петлю", base: true, cost: 0, cd: 2, target: "foe", text: "0,65А и кровотечение на 2 хода.", ai: ["attack", "debuff"] },
  { id: "fena_stretch", who: "fena", branch: "Край", name: "Натянуть верёвку", cost: 1, cd: 3, target: "foe", text: "0,8А и метка 20% на 2 хода.", unlock: { trust: 40, deed: { kind: "bleedHit", count: 3 } }, ai: ["attack", "debuff"] },
  { id: "fena_void", who: "fena", branch: "Край", name: "Шаг в пустоту", cost: 2, cd: 3, target: "foe", text: "1,6А; если враг падает — тебе щит 6% здоровья.", unlock: { trust: 50, memory: 1 }, ai: ["attack", "execute"] }
];

const COMPANION_SKILL_BY_ID = Object.fromEntries(COMPANION_SKILLS.map((skill) => [skill.id, skill]));
// The order in which rarity prepares skills before the meeting: 0/1/2/3/3 of them by starting rank.
const RARITY_PREP_SKILLS = { tessa: ["tessa_root", "tessa_threshold", "tessa_path"], rud: ["rud_blast", "rud_damper", "rud_short"], iva: ["iva_transfer", "iva_margin", "iva_splash"], fena: ["fena_other", "fena_stretch", "fena_yank"] };
const RARITY_PREP_COUNT = [0, 1, 2, 3, 3];
// Personal additions to the joint attack.
const JOINT_PERSONAL = {
  tessa: "Тебе укрепление 15% до твоего хода.",
  rud: "После связки остаётся хотя бы один уголь.",
  iva: "Ива получает 5% запаса.",
  fena: "Добычей становится поражённая цель, +1 азарт."
};
