// The town that grows around the camp from the player's decisions. Design: docs/COMPANIONS_2_CAMP_TOWN.md, section E.
// A project is offered at the fire when its condition is met; the player decides; it is built over three returns.
// when(hero) decides if the offer appears. options: what can be decided; build: the project that rises (null — nothing).
// effect: what the finished building gives, read by js/core/town.js. spot: where it stands on the camp panorama.

const TOWN_BUILD_STAGES = ["Настил", "Каркас", "Готово"];

const TOWN_PROJECTS = {
  caravan: {
    name: "Торговый обоз", place: "У костра", spot: null,
    when: (hero) => Number(hero.unlockedRegion || 0) >= 1 && Number(hero.records?.expeditions || 0) >= 2,
    text: "К лагерю подходит торговый обоз с Пустошей. Купцы хотят место для торга. В их фургонах — не только вещи: за решётками сидят люди с долговыми пластинами. Мот хмурится: «Решать тебе. Но место, где продают людей, потом не отмоешь».",
    options: [
      { id: "market_permitted", label: "Разрешить торги людьми", hint: "Свобода −12. Появится невольничий рынок", karma: -12, build: "slave_market" },
      { id: "goods_only", label: "Только вещи, без людей", hint: "Обоз уйдёт к другим. Без последствий", karma: 0, build: null },
      { id: "shelter_offer", label: "Отдать место освобождённым", hint: "Свобода +6. Купцам — отказ, людям — приют", karma: 6, build: "shelter_seed" }
    ]
  },
  crossing: {
    name: "Общий переход", place: "За дорогой", spot: { x: 76, y: 22, h: 14 },
    when: (hero) => storyHasFlag(hero, "bridge_people") || storyHasFlag(hero, "bridge_home"),
    text: "Мост, который решено было удержать, стоит, но по нему ходят только смелые. Вея предлагает поставить сторожку и сигнальные столбы: тогда дорога станет общей.",
    options: [{ id: "crossing_settled", label: "Построить переход", hint: "Тропы приносят на 10% больше золота", build: "crossing" }, { id: "crossing_no", label: "Оставить как есть", hint: "Ничего не меняется", build: null }]
  },
  craft_yard: {
    name: "Двор живых мастеров", place: "Слева от лавки", spot: { x: 3.5, y: 40, h: 22 },
    when: (hero) => storyHasFlag(hero, "kern_release"),
    text: "Керн больше не привязан к горну и сам предлагает: «Пусть у ребят будут свои верстаки. Учиться у живого — лучше, чем у записи».",
    options: [{ id: "craft_yard", label: "Устроить ученические места", hint: "Заточка удаётся на 5% чаще", build: "craft_yard" }, { id: "craft_no", label: "Не сейчас", hint: "", build: null }]
  },
  temper_school: {
    name: "Школа последней закалки", place: "Слева от лавки", spot: { x: 3.5, y: 40, h: 22 },
    when: (hero) => storyHasFlag(hero, "kern_anchor"),
    text: "Записи Керна лежат у горна. Ученики просят разрешения учиться по ним вместе, а не по одному.",
    options: [{ id: "temper_school", label: "Передать чертежи ученикам", hint: "В первом бою похода тебе щит 4% здоровья", build: "temper_school" }, { id: "temper_no", label: "Пусть пока лежат", hint: "", build: null }]
  },
  witness_house: {
    name: "Дом свидетельств", place: "На холме за палатками", spot: { x: 28, y: 14, h: 15 },
    when: (hero) => storyHasFlag(hero, "journal_open"),
    text: "Записи Соты открыты лагерю, и люди сами начинают приносить свидетельства. Сота предлагает поставить навес для общего архива.",
    options: [{ id: "witness_house", label: "Устроить общий архив", hint: "Опыта за походы на 10% больше", build: "witness_house" }, { id: "witness_no", label: "Пусть всё остаётся у Соты", hint: "", build: null }]
  },
  free_stalls: {
    name: "Свободный торговый ряд", place: "Слева от лавки", spot: { x: 3.5, y: 62, h: 18 },
    when: (hero) => storyHasFlag(hero, "mot_freed"),
    text: "Мот без хозяина впервые предлагает что-то не для себя: пустить к лавке других торговцев. «Пусть будет ряд. Я устал быть единственной ценой в этом лагере».",
    options: [{ id: "free_stalls", label: "Открыть ряд", hint: "В лавке на два товара больше", build: "free_stalls" }, { id: "stalls_no", label: "Оставить лавку одну", hint: "", build: null }]
  },
  infirmary: {
    name: "Лазарет с огородом", place: "За навесом Нимы", spot: { x: 66, y: 18, h: 13 },
    when: (hero) => (hero.companionLog?.met || []).includes("yara") && Number(hero.records?.expeditions || 0) >= 4,
    text: "Нима и Яра спорят о бинтах, а потом вместе приходят к тебе: «Под навесом тесно. Нужен лазарет — и грядки, чтобы не покупать травы у Мота втридорога».",
    options: [{ id: "infirmary_grown", label: "Расширить лазарет", hint: "Спутник восстанавливает на 15% больше между шагами", build: "infirmary" }, { id: "infirmary_no", label: "Обойдёмся навесом", hint: "", build: null }]
  },
  shelter: {
    name: "Приют у открытых ворот", place: "На холме за палатками", spot: { x: 50, y: 13, h: 16 },
    when: (hero) => Number(hero.karma || 0) >= 25 && (hero.companions || []).filter((c) => c.legal === "free" && c.source !== "camp").length >= 2,
    text: "Спасённые тобой люди пишут друзьям. Те приходят и просят остаться. Нужен дом с общей кухней — и ворота, которые не запираются снаружи.",
    options: [{ id: "shelter_open", label: "Построить приют", hint: "Спасения на тропах чаще, новые спутники доверяют больше", karma: 4, build: "shelter" }, { id: "shelter_no", label: "Лагерь не резиновый", hint: "", build: null }]
  },
  workshops: {
    name: "Вольные мастерские", place: "Справа от кузницы", spot: { x: 97, y: 30, h: 20 },
    when: (hero) => Number(hero.karma || 0) >= 60 && (hero.companions || []).some((c) => ["rud", "ort"].includes(c.defId) && c.legal === "free"),
    text: "Руд или Орт приходит с чертежом: несколько мастерских с общей площадью, где никто никому не должен. «Работать там, где за труд платят, а не держат».",
    options: [{ id: "workshops_free", label: "Строить мастерские", hint: "Каждый поход приносит лишний материал", build: "workshops" }, { id: "workshops_no", label: "Пока рано", hint: "", build: null }]
  },
  overseers: {
    name: "Квартал надзирателей", place: "Справа от кузницы", spot: { x: 97, y: 30, h: 20 },
    when: (hero) => Number(hero.karma || 0) <= -60 && townBuilt(hero, "slave_market") && (hero.companions || []).filter((c) => c.legal === "contract").length >= 2,
    text: "Держатели договоров предлагают порядок: бараки, проходная, учёт. «Ты уже владеешь людьми. Пусть этим занимаются те, кто умеет».",
    options: [{ id: "overseer_charter", label: "Выдать хартию надзирателям", hint: "Свобода −15. Материалов за походы на 10% больше, спасения на тропах прекращаются", karma: -15, build: "overseers" }, { id: "overseer_no", label: "Отказать", hint: "", build: null }]
  }
};

// What each finished building is and where it stands. art: assets/camp/town_<id>.webp
const TOWN_BUILDINGS = {
  slave_market: { name: "Невольничий рынок", spot: { x: 11, y: 28, h: 13 }, effect: "Торг договорами на людей", dark: true },
  shelter_seed: { name: "Место для освобождённых", spot: { x: 51, y: 17, h: 9 }, effect: "Начало будущего приюта" },
  crossing: { name: "Общий переход", spot: { x: 79, y: 23, h: 12 }, effect: "+10% золота за тропы" },
  craft_yard: { name: "Двор живых мастеров", spot: { x: 36, y: 19, h: 12 }, effect: "Заточка удаётся на 5% чаще" },
  temper_school: { name: "Школа последней закалки", spot: { x: 36, y: 19, h: 12 }, effect: "Щит 4% в первом бою похода" },
  witness_house: { name: "Дом свидетельств", spot: { x: 24, y: 21, h: 13 }, effect: "+10% опыта за походы" },
  free_stalls: { name: "Свободный торговый ряд", spot: { x: 61, y: 23, h: 11 }, effect: "В лавке на два товара больше" },
  infirmary: { name: "Лазарет с огородом", spot: { x: 86, y: 34, h: 12 }, effect: "Спутник лечится между шагами лучше" },
  shelter: { name: "Приют у открытых ворот", spot: { x: 51, y: 17, h: 14 }, effect: "Спасения чаще, новые спутники доверяют больше" },
  workshops: { name: "Вольные мастерские", spot: { x: 96, y: 41, h: 17 }, effect: "+1 материал за поход" },
  overseers: { name: "Квартал надзирателей", spot: { x: 96, y: 41, h: 17 }, effect: "+10% материалов, спасения прекращаются", dark: true }
};
