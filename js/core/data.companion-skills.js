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

// ---------- Stage 2.6: the other eight, two branches of three each ----------
Object.assign(COMPANION_RESOURCES, {
  yara: { id: "stitches", name: "Стежки", max: 3, start: 1, hint: "+1, когда удар врага попадает по тебе." },
  ella: { id: "edits", name: "Поправки", max: 3, start: 0, hint: "+1 за каждый удар Эллы, попавший в цель." },
  savel: { id: "lights", name: "Огоньки", max: 3, start: 1, hint: "+1 в начале каждого хода Савела." },
  ner: { id: "echoes", name: "Отголоски", max: 4, start: 0, hint: "+1, когда ты бьёшь цель, которую слушает Нэр." },
  gron: { id: "bounds", name: "Границы", max: 3, start: 1, hint: "+1, когда удар врага попадает по Грону." },
  lissa: { id: "timedebt", name: "Долг времени", max: 4, start: 1, hint: "+1 в начале каждого хода Лиссы." },
  ort: { id: "forms", name: "Формы", max: 3, start: 0, hint: "Готовит их сам: каждая форма усиливает следующую заливку." },
  dei: { id: "syllables", name: "Слоги", max: 3, start: 0, hint: "+1, когда ты меняешь тип действия: удар, навык, стойка." }
});
Object.assign(COMPANION_DEEDS, {
  stitchHeal: "зашить тебя после удара",
  lowHeal: "вылечить тебя ниже 30% здоровья",
  delayIntent: "отложить ход врага",
  cleanse: "снять с тебя беду",
  listenHit: "дать тебе попасть по услышанной цели",
  coverHit: "принять удар вместо тебя",
  formSpent: "вылить полную форму",
  alternated: "собрать слово из твоих действий"
});
COMPANION_SKILLS.push(
  // Яра — Пепельная швея
  { id: "yara_baste", who: "yara", branch: "Сшить живое", name: "Намётка", base: true, cost: 0, cd: 1, target: "hero", text: "Шов на тебе: после следующего удара по тебе лечит на 10% здоровья. Не пригодился до хода Яры — щит 8%.", ai: ["protect", "heal"] },
  { id: "yara_seam", who: "yara", branch: "Сшить живое", name: "Крепкий шов", cost: 1, cd: 3, target: "hero", text: "Лечит тебя на 12% и даёт регенерацию 4% на 2 хода.", unlock: { trust: 20, deed: { kind: "stitchHeal", count: 3 } }, ai: ["heal"] },
  { id: "yara_edges", who: "yara", branch: "Сшить живое", name: "Держать края", cost: 2, cd: 4, target: "hero", text: "Тебе укрепление 25% на 2 хода и лечение 8%.", unlock: { trust: 50, memory: 1 }, ai: ["protect", "heal"] },
  { id: "yara_needle", who: "yara", branch: "Перекроить боль", name: "Вынуть иглу", base: true, cost: 0, cd: 2, target: "foe", text: "0,6А и снимает с тебя одну беду.", ai: ["attack", "cleanse"] },
  { id: "yara_red", who: "yara", branch: "Перекроить боль", name: "Красная нить", cost: 1, cd: 2, target: "foe", text: "0,8А и слабость 20% на 2 хода.", unlock: { trust: 35, deed: { kind: "cleanse", count: 3 } }, ai: ["attack", "debuff"] },
  { id: "yara_close", who: "yara", branch: "Перекроить боль", name: "Зашить разрыв", cost: 3, cd: 5, target: "hero", text: "Лечит тебя на 25% здоровья.", unlock: { trust: 80, memory: 2 }, ai: ["heal"] },
  // Элла — Межстрочник
  { id: "ella_underline", who: "ella", branch: "Чужая строка", name: "Подчеркнуть", base: true, cost: 0, cd: 2, target: "foe", text: "0,7А, ход врага откладывается на 15%.", ai: ["attack", "control"] },
  { id: "ella_pause", who: "ella", branch: "Чужая строка", name: "Вставить паузу", cost: 1, cd: 3, target: "foe", text: "Откладывает ход врага на 35% и ослабляет его на 15% на 2 хода.", unlock: { trust: 25, deed: { kind: "delayIntent", count: 3 } }, ai: ["control", "debuff"] },
  { id: "ella_strike", who: "ella", branch: "Чужая строка", name: "Снять утверждение", cost: 2, cd: 4, target: "foe", text: "Срывает объявленный тяжёлый удар или заряд врага, немота 1 ход.", unlock: { trust: 60, memory: 1 }, ai: ["control"] },
  { id: "ella_margin", who: "ella", branch: "Свой текст", name: "Замечание на полях", base: true, cost: 0, cd: 0, target: "foe", text: "0,8А и метка 10% на 2 хода.", ai: ["attack", "debuff"] },
  { id: "ella_reply", who: "ella", branch: "Свой текст", name: "Право ответа", cost: 1, cd: 3, target: "foe", text: "1,2А; если враг готовит удар по вам — 1,55А.", unlock: { trust: 40, deed: { kind: "delayIntent", count: 6 } }, ai: ["attack"] },
  { id: "ella_final", who: "ella", branch: "Свой текст", name: "Последняя редакция", cost: 3, cd: 5, target: "foe", text: "1,5А и 50% шанс оглушить на 1 ход.", unlock: { trust: 80, memory: 2 }, ai: ["attack", "control", "burst"] },
  // Савел — Лампадник
  { id: "savel_wick", who: "savel", branch: "Беречь пламя", name: "Зажечь фитиль", base: true, cost: 0, cd: 2, target: "hero", text: "Тебе регенерация 5% на 3 хода.", ai: ["heal"] },
  { id: "savel_pass", who: "savel", branch: "Беречь пламя", name: "Передать лампаду", cost: 1, cd: 2, target: "hero", text: "Снимает с тебя одну беду и даёт щит 6% на 2 хода.", unlock: { trust: 25, deed: { kind: "cleanse", count: 3 } }, ai: ["cleanse", "protect"] },
  { id: "savel_circle", who: "savel", branch: "Беречь пламя", name: "Круг света", cost: 3, cd: 5, target: "self", text: "Вам обоим укрепление 20% и регенерация 4% на 3 хода.", unlock: { trust: 70, memory: 2 }, ai: ["protect", "heal"] },
  { id: "savel_mourn", who: "savel", branch: "Проводить ночь", name: "Отпеть беду", base: true, cost: 0, cd: 0, target: "foe", text: "0,7А светом и слабость 10% на 1 ход.", ai: ["attack", "debuff"] },
  { id: "savel_quiet", who: "savel", branch: "Проводить ночь", name: "Тихий огонь", cost: 1, cd: 3, target: "foe", text: "1,0А светом и слабость 20% на 2 хода.", unlock: { trust: 40, memory: 0 }, ai: ["attack", "debuff"] },
  { id: "savel_dawn", who: "savel", branch: "Проводить ночь", name: "До рассвета", cost: 2, cd: 5, target: "ally", text: "Самого раненого из вас лечит на 15% здоровья.", unlock: { trust: 55, deed: { kind: "lowHeal", count: 2 } }, ai: ["heal"] },
  // Нэр — Слухач
  { id: "ner_step", who: "ner", branch: "Услышать", name: "Поймать шаг", base: true, cost: 0, cd: 0, target: "foe", text: "1,0А; Нэр начинает слушать эту цель.", ai: ["attack"] },
  { id: "ner_breath", who: "ner", branch: "Услышать", name: "Чужое дыхание", cost: 1, cd: 2, target: "foe", text: "0,8А и метка 20% на 2 хода.", unlock: { trust: 25, deed: { kind: "listenHit", count: 3 } }, ai: ["attack", "debuff"] },
  { id: "ner_wall", who: "ner", branch: "Услышать", name: "За стеной", cost: 2, cd: 4, target: "foe", text: "1,4А, пробивая половину защиты.", unlock: { trust: 50, memory: 1 }, ai: ["attack", "burst"] },
  { id: "ner_knock", who: "ner", branch: "Ответить", name: "Второй стук", base: true, cost: 0, cd: 2, target: "foe", text: "Два удара по 0,6А.", ai: ["attack"] },
  { id: "ner_echo", who: "ner", branch: "Ответить", name: "Вернуть эхо", cost: 1, cd: 3, target: "foe", text: "Тратит все отголоски: 0,7А за каждый по услышанной цели.", unlock: { trust: 40, deed: { kind: "listenHit", count: 8 } }, ai: ["attack", "spend", "burst"] },
  { id: "ner_last", who: "ner", branch: "Ответить", name: "Последний звук", cost: 3, cd: 5, target: "foe", text: "2,2А; по цели ниже 35% здоровья — 2,8А.", unlock: { trust: 80, memory: 2 }, ai: ["attack", "burst", "execute"] },
  // Грон — Межевик
  { id: "gron_stone", who: "gron", branch: "Провести черту", name: "Межевой камень", base: true, cost: 0, cd: 1, target: "self", text: "Укрепление 25% до своего хода.", ai: ["defense", "front"] },
  { id: "gron_second", who: "gron", branch: "Провести черту", name: "Второй удар", cost: 1, cd: 3, target: "self", text: "Щит Грону 15% здоровья; следующий удар по тебе он принимает сам.", unlock: { trust: 25, deed: { kind: "coverHit", count: 3 } }, ai: ["protect", "defense"] },
  { id: "gron_line", who: "gron", branch: "Провести черту", name: "Общий рубеж", cost: 3, cd: 5, target: "self", text: "Вам обоим укрепление 30% на 2 хода.", unlock: { trust: 70, memory: 2 }, ai: ["protect", "defense"] },
  { id: "gron_pass", who: "gron", branch: "Впустить", name: "Открыть проход", base: true, cost: 0, cd: 0, target: "foe", text: "0,9А и слабость 10% на 1 ход.", ai: ["attack", "debuff"] },
  { id: "gron_guard", who: "gron", branch: "Впустить", name: "Сменить караул", cost: 1, cd: 3, target: "self", text: "Вы меняетесь местами без траты хода, тебе щит 10%.", unlock: { trust: 40, memory: 0 }, ai: ["protect"] },
  { id: "gron_word", who: "gron", branch: "Впустить", name: "По взаимному слову", cost: 2, cd: 4, target: "all", text: "1,3А всем врагам и метка 10% на 2 хода.", unlock: { trust: 55, deed: { kind: "interceptHeavy", count: 4 } }, ai: ["attack", "aoe"] },
  // Лисса — Шагомер
  { id: "lissa_half", who: "lissa", branch: "Отдать шаг", name: "Полшага", base: true, cost: 0, cd: 0, target: "foe", text: "0,8А, ход врага откладывается на 15%.", ai: ["attack", "control"] },
  { id: "lissa_pause", who: "lissa", branch: "Отдать шаг", name: "Длинная пауза", cost: 2, cd: 3, target: "foe", text: "Откладывает ход врага на 40%.", unlock: { trust: 30, deed: { kind: "delayIntent", count: 3 } }, ai: ["control"] },
  { id: "lissa_hold", who: "lissa", branch: "Отдать шаг", name: "Придержать миг", cost: 3, cd: 5, target: "all", text: "Откладывает ходы всех врагов на 25%.", unlock: { trust: 70, memory: 2 }, ai: ["control", "aoe"] },
  { id: "lissa_out", who: "lissa", branch: "Вернуть время", name: "Выйти из круга", base: true, cost: 0, cd: 2, target: "self", text: "+1 долг времени, следующий ход Лиссы наступит раньше.", ai: ["build"] },
  { id: "lissa_catch", who: "lissa", branch: "Вернуть время", name: "Догнать очередь", cost: 1, cd: 3, target: "hero", text: "Тебе ускорение 20% на 2 хода.", unlock: { trust: 40, memory: 0 }, ai: ["protect"] },
  { id: "lissa_tempo", who: "lissa", branch: "Вернуть время", name: "Свой темп", cost: 3, cd: 5, target: "foe", text: "1,8А, и твой следующий ход наступает заметно раньше.", unlock: { trust: 55, deed: { kind: "delayIntent", count: 8 } }, ai: ["attack", "burst"] },
  // Орт — Отливщик
  { id: "ort_flask", who: "ort", branch: "Подготовить форму", name: "Опока", base: true, cost: 0, cd: 0, target: "foe", text: "0,45А и +1 форма.", ai: ["build", "attack"] },
  { id: "ort_gate", who: "ort", branch: "Подготовить форму", name: "Точный литник", cost: 0, cd: 3, target: "self", text: "+2 формы и укрепление 15% до своего хода.", unlock: { trust: 25, deed: { kind: "formSpent", count: 3 } }, ai: ["build", "defense"] },
  { id: "ort_double", who: "ort", branch: "Подготовить форму", name: "Двойная форма", cost: 1, cd: 4, target: "hero", text: "Твой следующий удар сильнее на 20% (ярость на 1 ход), +1 форма.", unlock: { trust: 50, memory: 1 }, ai: ["build", "protect"] },
  { id: "ort_pour", who: "ort", branch: "Отлить", name: "Заливка", base: true, cost: 0, cd: 0, target: "foe", text: "1,0А + 0,6А за каждую форму; тратит все формы.", ai: ["attack", "spend"] },
  { id: "ort_flash", who: "ort", branch: "Отлить", name: "Снять облой", cost: 1, cd: 2, target: "foe", text: "0,9А и пробитая броня 20% на 2 хода.", unlock: { trust: 35, memory: 0 }, ai: ["attack", "debuff"] },
  { id: "ort_clean", who: "ort", branch: "Отлить", name: "Чистый отлив", cost: 3, cd: 5, target: "foe", text: "2,8А одной цели.", unlock: { trust: 80, memory: 2 }, ai: ["attack", "burst"] },
  // Дей — Имяносец
  { id: "dei_first", who: "dei", branch: "Собрать имя", name: "Первый слог", base: true, cost: 0, cd: 0, target: "foe", text: "0,7А и +1 слог.", ai: ["attack", "build"] },
  { id: "dei_known", who: "dei", branch: "Собрать имя", name: "Знакомое имя", cost: 1, cd: 3, target: "hero", text: "Возвращает тебе 10% ресурса (мана, напор, дыхание).", unlock: { trust: 25, deed: { kind: "alternated", count: 3 } }, ai: ["protect"] },
  { id: "dei_aloud", who: "dei", branch: "Собрать имя", name: "Назвать вслух", cost: 3, cd: 5, target: "hero", text: "Твой следующий навык ничего не стоит.", unlock: { trust: 70, memory: 2 }, ai: ["protect"] },
  { id: "dei_sign", who: "dei", branch: "Отдать имя", name: "Чужая подпись", base: true, cost: 0, cd: 2, target: "foe", text: "0,8А и метка 15% на 2 хода.", ai: ["attack", "debuff"] },
  { id: "dei_nick", who: "dei", branch: "Отдать имя", name: "Снять прозвище", cost: 1, cd: 3, target: "foe", text: "Снимает с врага щит, ярость или укрепление и бьёт на 0,6А.", unlock: { trust: 40, memory: 0 }, ai: ["attack", "control"] },
  { id: "dei_own", who: "dei", branch: "Отдать имя", name: "Собственное имя", cost: 2, cd: 4, target: "foe", text: "1,6А и тебе щит 8% на 2 хода.", unlock: { trust: 55, deed: { kind: "alternated", count: 8 } }, ai: ["attack", "protect"] }
);
Object.assign(COMPANION_SKILL_BY_ID, Object.fromEntries(COMPANION_SKILLS.map((skill) => [skill.id, skill])));
Object.assign(RARITY_PREP_SKILLS, {
  yara: ["yara_seam", "yara_red"], ella: ["ella_pause", "ella_reply"], savel: ["savel_pass", "savel_quiet"], ner: ["ner_breath", "ner_echo"],
  gron: ["gron_second", "gron_guard"], lissa: ["lissa_pause", "lissa_catch"], ort: ["ort_gate", "ort_flash"], dei: ["dei_known", "dei_nick"]
});
Object.assign(JOINT_PERSONAL, {
  yara: "На тебе остаётся шов: лечит после следующего удара.", ella: "Ход цели откладывается на 20%.", savel: "Тебе регенерация 4% на 2 хода.", ner: "Нэр слушает поражённую цель, +1 отголосок.",
  gron: "Следующий удар по тебе Грон примет сам.", lissa: "+1 долг времени.", ort: "+1 форма.", dei: "+1 слог."
});
