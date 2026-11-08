// The camp by the fire: the people answer what has just happened on the road. No DOM here, js/ui/camp.js draws it.
// The hero is always "ты" and never gets a form of a gender.

// Remembers how the last trip ended, so the camp can answer it.
function noteCampTrip(hero, trip) {
  if (!hero.story) return;
  hero.story.lastTrip = {
    outcome: trip.outcome,
    kind: trip.kind || "trail",
    regionId: trip.regionId || null,
    zoneKey: trip.zoneKey || null,
    lairId: trip.lairId || null,
    guardian: trip.guardian || null,
    n: Number(hero.records?.expeditions || 0) + Number(hero.records?.deaths || 0) + hero.defeatedGuardians.length
  };
}

function cleanCampTrip(raw) {
  if (!raw || typeof raw !== "object" || !["death", "complete", "retreat"].includes(raw.outcome)) return null;
  const text = (value) => (typeof value === "string" ? value : null);
  return { outcome: raw.outcome, kind: ["trail", "lair", "guardian"].includes(raw.kind) ? raw.kind : "trail", regionId: text(raw.regionId), zoneKey: text(raw.zoneKey), lairId: text(raw.lairId), guardian: text(raw.guardian), n: Number.isFinite(Number(raw.n)) ? Number(raw.n) : 0 };
}

// on: what happened last (death, complete, retreat, lair, guardian_win, guardian_death, none). chapter: from this chapter on.
// {memory} the feeling the last death took, {region} the region of the trip, {lair} the lair, {boss} the guardian.
const CAMP_TALK = {
  nima: [
    { on: "death", text: "Тихо, ты дома. Клеймо взяло своё: «{memory}». Сядь ближе к огню, тепло пока работает." },
    { on: "death", minDeaths: 3, text: "Я больше не считаю раны. Я считаю то, что ты уже не можешь почувствовать. Список растёт." },
    { on: "guardian_death", text: "Страж бьёт честно: тело я собрала, а вот «{memory}» назад не пришьёшь." },
    { on: "complete", text: "Целиком и на своих ногах. Люблю такие возвращения: бинты остаются в коробке." },
    { on: "retreat", text: "Повернуть вовремя — тоже лечение. Самое дешёвое из всех, что я знаю." },
    { on: "lair", text: "В логове пахнет старой кровью, и ты тоже. Умойся, потом хвастайся." },
    { text: "Красное зелье для тела, синее для головы. Перепутать можно, но потом обидно." },
    { text: "Если ночью слышишь горн, это не сон. Это Кузница дышит. Спи всё равно." },
    { chapter: 2, text: "Клеймо греется у костра. Не от огня — от того, сколько оно ещё может взять." }
  ],
  veya: [
    { on: "guardian_win", text: "{boss} больше не держит дорогу. Карта сама дорисовалась до следующего края." },
    { on: "guardian_death", text: "{boss} никуда не денется. Значит, и тебе незачем торопиться." },
    { on: "complete", text: "{region}: ещё одна тропа нанесена. Отсюда видно дальше, чем вчера." },
    { on: "retreat", text: "Назад — это тоже маршрут. Я отмечу место, где тропа стала слишком тяжёлой." },
    { on: "death", text: "Тропа запомнила тебя. Это плохо: в следующий раз она будет ждать." },
    { text: "Тропы здесь меняются за ночь. Хорошая новость: плохие тоже." },
    { text: "Смотри на следы. Если они светятся, по ним кто-то уже шёл к Кузнице." },
    { chapter: 3, text: "За Руинами карта кончается. Дальше я веду не по бумаге, а по памяти. Твоей." }
  ],
  mot: [
    { on: "complete", text: "Вижу полный мешок. Не говори, сколько там, я и так подниму цену." },
    { on: "death", text: "Половина добычи осталась на тропе? Кто-то там сегодня очень богатый." },
    { on: "lair", text: "Реликвия из логова? Не продавай мне. Серьёзно. Я не смогу оценить её честно." },
    { on: "retreat", text: "Вернуться с мешком лучше, чем не вернуться с двумя. Старая торговая правда." },
    { text: "Рут говорил: торгуй так, чтобы тебя звали обратно. Я всё ещё учусь." },
    { text: "Цены пишу мелом. Дождь — и снова можно торговаться." },
    { if: "mot_freed", text: "Без хозяина лавка скрипит иначе. Свободнее. Немного страшнее." },
    { if: "mot_bound", text: "Да, за прилавком присматривают. Нет, скидку это не отменяет." }
  ],
  kern: [
    { on: "lair", text: "Покажи реликвию. Шов ровный, рука чужая. Кто-то её очень берёг." },
    { on: "complete", text: "Ремни потёрлись. Значит, шагали всерьёз. Хороший износ." },
    { on: "death", text: "Броня цела, а ты нет. Обычно бывает наоборот. Клеймо странно считает." },
    { on: "guardian_win", text: "Стража свалить — это не подкову гнуть. Дай руку, проверю, не дрожит ли." },
    { text: "Горн гудит ровно. Когда он фальшивит, я тоже фальшивлю." },
    { text: "Любая дорога здесь — кованая полоса. Ты по ним ходишь, я их чиню." },
    { if: "kern_release", text: "Спина болит как у обычного человека. Прекрасное чувство, никому не советую." },
    { if: "kern_anchor", text: "Запись для учеников: жар не торопить. Человека тоже." }
  ],
  sota: [
    { on: "death", text: "Запишу: «{memory}» — утрачено. Факт оставлю, ощущение вычеркну. Так честнее." },
    { on: "lair", text: "{lair}: свидетельство записано. Чернила ещё не высохли, а читать уже страшно." },
    { on: "complete", text: "Ещё одна страница. Дорога сегодня ровная, почерк тоже." },
    { on: "retreat", text: "Пишу «отход», не «бегство». Слова тоже лечат, спроси Ниму." },
    { on: "guardian_win", text: "{boss}. Обвожу имя в рамку: так помечают то, что закончилось." },
    { text: "Если я засну над книгой, переверни страницу. Только не закрывай." },
    { text: "Ложкино записано в трёх местах. Если мир спорит, пусть спорит с тремя." },
    { if: "sota_index", text: "Читай мне вслух. Свою жизнь мелким шрифтом я уже не вижу." }
  ]
};

// Who answers first after each kind of return.
const CAMP_FIRST = { death: "nima", guardian_death: "nima", guardian_win: "veya", lair: "kern", complete: "veya", retreat: "veya", none: "veya" };
const CAMP_PEOPLE = ["veya", "mot", "kern", "sota", "nima"];

function campMoment(hero) {
  const trip = hero.story?.lastTrip;
  if (!trip) return "none";
  if (trip.kind === "guardian") return trip.outcome === "death" ? "guardian_death" : "guardian_win";
  if (trip.kind === "lair" && trip.outcome === "complete") return "lair";
  return trip.outcome;
}

// Lines this person can say now: an answer to the last return first, then the everyday ones.
function getCampLines(hero, who) {
  const moment = campMoment(hero);
  const chapter = getStoryProgress(hero).currentIndex;
  const deaths = Number(hero.story?.deaths || 0);
  const fits = (line) => (!line.if || storyHasFlag(hero, line.if)) && (!line.chapter || chapter >= line.chapter) && (!line.minDeaths || deaths >= line.minDeaths);
  const lines = (CAMP_TALK[who] || []).filter(fits);
  const answers = lines.filter((line) => line.on === moment && (moment !== "death" && moment !== "guardian_death" || getLostMemories(hero).length));
  const everyday = lines.filter((line) => !line.on);
  return { answers, everyday };
}

function fillCampLine(hero, text) {
  const trip = hero.story?.lastTrip || {};
  const lost = getLostMemories(hero);
  return text
    .replace(/\{memory\}/g, lost.length ? lost[lost.length - 1].label : "ничего")
    .replace(/\{region\}/g, getRegion(trip.regionId)?.name || "Тропа")
    .replace(/\{lair\}/g, LAIR_CATALOG[trip.lairId]?.name || "Логово")
    .replace(/\{boss\}/g, ENEMY_DEFINITIONS[trip.guardian]?.name || "Страж");
}

// What the fire looks like right now: who is there, who speaks, what is said. turn moves through the lines on clicks.
function getCampTalk(hero, who, turn = 0) {
  const people = CAMP_PEOPLE.filter((id) => (hero.story?.seen || []).some((sceneId) => (STORY_SCENES[sceneId]?.lines || []).some((line) => line.who === id)));
  if (!people.length) return null;
  const moment = campMoment(hero);
  const first = CAMP_FIRST[moment];
  const speaker = people.includes(who) ? who : people.includes(first) ? first : people[0];
  const { answers, everyday } = getCampLines(hero, speaker);
  const pool = [...answers, ...everyday];
  if (!pool.length) return { people, speaker, text: "", moment };
  const seed = Number(hero.story?.lastTrip?.n || 0);
  // The answer to what just happened comes first; clicks then go on to the everyday lines.
  const index = turn === 0 && answers.length ? seed % answers.length : (answers.length + ((seed + turn) % Math.max(1, everyday.length))) % pool.length;
  return { people, speaker, text: fillCampLine(hero, pool[Math.min(index, pool.length - 1)].text), moment, answered: turn === 0 && answers.length > 0 };
}
