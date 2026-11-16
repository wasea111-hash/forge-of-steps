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
    credit: trip.outcome === "death" && memoryGraceActive(hero),
    n: Number(hero.records?.expeditions || 0) + Number(hero.records?.deaths || 0) + hero.defeatedGuardians.length
  };
}

function cleanCampTrip(raw) {
  if (!raw || typeof raw !== "object" || !["death", "complete", "retreat"].includes(raw.outcome)) return null;
  const text = (value) => (typeof value === "string" ? value : null);
  return { outcome: raw.outcome, kind: ["trail", "lair", "guardian"].includes(raw.kind) ? raw.kind : "trail", regionId: text(raw.regionId), zoneKey: text(raw.zoneKey), lairId: text(raw.lairId), guardian: text(raw.guardian), credit: raw.credit === true, n: Number.isFinite(Number(raw.n)) ? Number(raw.n) : 0 };
}

// on: what happened last (death, complete, retreat, lair, guardian_win, guardian_death, none). chapter: from this chapter on.
// {memory} the feeling the last death took, {region} the region of the trip, {lair} the lair, {boss} the guardian.
const CAMP_TALK = {
  nima: [
    { contract: true, text: "Я лечу всех, кто ко мне приходит. Тех, кто пришёл не по своей воле, — первыми." },
    { on: "death", credit: true, text: "Тихо, ты дома. Это возвращение оплачено лагерным жаром, и память цела: пока засов Серого Клыка закрыт, Кузнец не дотягивается до платы. После победы над ним плата начнётся со следующего возвращения, а прежние смерти её не увеличат." },
    { on: "death", maxDeaths: 9, text: "Тихо, ты дома. Клеймо взяло своё: «{memory}». Сядь ближе к огню, тепло пока работает." },
    { on: "death", minDeaths: 10, text: "Ты в лагере. Нового переживания Клеймо не забрало: возвращение оплачено резервом Кузницы." },
    { on: "death", minDeaths: 3, text: "Я больше не считаю раны. Я считаю то, что ты уже не можешь почувствовать. Список растёт." },
    { on: "guardian_death", maxDeaths: 9, text: "Страж бьёт честно: тело я собрала, а вот «{memory}» назад не пришьёшь." },
    { on: "guardian_death", minDeaths: 10, text: "Страж бьёт честно. Тело я собрала на резерве Кузницы; памяти у ключа брать уже нечего." },
    { on: "complete", text: "Целиком и на своих ногах. Люблю такие возвращения: бинты остаются в коробке." },
    { on: "retreat", text: "Повернуть вовремя — тоже лечение. Самое дешёвое из всех, что я знаю." },
    { on: "lair", text: "В логове пахнет старой кровью, и ты тоже. Умойся, потом хвастайся." },
    { text: "Красное зелье для тела, синее для головы. Перепутать можно, но потом обидно." },
    { text: "Если ночью слышишь горн, это не сон. Это Кузница дышит. Спи всё равно." },
    { chapter: 2, text: "Клеймо греется у костра. Не от огня — от того, сколько оно ещё может взять." }
  ],
  veya: [
    {"freedom":true,"ifNot":"bridge_home","text":"В убежищах тебя знают по людям, которые вышли с тобой живыми."},
    {"on":"guardian_win","ifNot":"bridge_home","text":"{boss} больше не держит дорогу. Карта сама дорисовалась до следующего края."},
    {"on":"guardian_death","ifNot":"bridge_home","text":"{boss} остаётся у прохода. Перед следующим выходом сверим припасы и место отхода."},
    {"on":"complete","ifNot":"bridge_home","text":"{region}. Покажи, где тропа вышла к опоре. Я отмечу поворот."},
    {"on":"retreat","ifNot":"bridge_home","text":"Я отмечу место, где пришлось повернуть. От него проложим следующий маршрут."},
    {"on":"death","ifNot":"bridge_home","text":"Назови последний поворот, который помнишь. От него начнём проверку дороги."},
    {"ifNot":"bridge_home","text":"Тропы здесь меняются за ночь. Утром проверяй даже знакомый поворот."},
    {"ifNot":"bridge_home","text":"Смотри на следы. Если они светятся, по ним кто-то уже шёл к Кузнице."},
    {"chapter":3,"ifNot":"bridge_home","text":"За Руинами старые карты обрываются. Дальше будем сверять каждую опору с журналом."},
    {"freedom":true,"if":"bridge_home","text":"У моста спрашивали о тебе люди из убежища. Их слова я передам через карту, когда захочешь послушать."},
    {"on":"guardian_win","if":"bridge_home","text":"{boss} больше не держит проход. Разверни карту на столе, и я укажу следующий участок."},
    {"on":"guardian_death","if":"bridge_home","text":"{boss} остаётся у прохода. Прочти мне свой маршрут, и я укажу место для отхода."},
    {"on":"complete","if":"bridge_home","text":"{region}. Передвинь метку на карте к последней целой опоре. Отсюда я смогу проверить соединение."},
    {"on":"retreat","if":"bridge_home","text":"Оставь метку у места поворота. Через карту я покажу, откуда начинать следующую проверку."},
    {"on":"death","if":"bridge_home","text":"Я слышу тебя через карту. Назови последний знакомый поворот, пока писарь готовит запись."},
    {"if":"bridge_home","text":"Положи карту подальше от котла. Из мокрой складки мой голос слышно хуже."},
    {"if":"bridge_home","text":"Обведи светящиеся следы на карте. Я смогу сравнить их с дорогами, которые чувствую от моста."},
    {"chapter":3,"if":"bridge_home","text":"За Руинами старые отметки заканчиваются. Читай мне журнал по участкам, и мы продолжим карту отсюда."}
  ],
  mot: [
    { contract: true, text: "Договор на человека? Я торгую многим. Этим — нет. И советов по такому товару не даю." },
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
    {"contract":true,"ifNot":"kern_anchor","text":"Оков не кую. Ни для зверя, ни для человека. И для тебя не стану."},
    {"on":"lair","ifNot":"kern_anchor","text":"Покажи реликвию. Шов ровный, рука чужая. Кто-то её очень берёг."},
    {"on":"complete","ifNot":"kern_anchor","text":"Ремни потёрлись. Значит, шагали всерьёз. Хороший износ."},
    {"on":"death","ifNot":"kern_anchor","text":"Сними броню. После возвращения проверим крепления под пластинами."},
    {"on":"guardian_win","ifNot":"kern_anchor","text":"После такого боя рукоять проверяют целиком. Покажи, где держишь ладонь."},
    {"ifNot":"kern_anchor","text":"Горн гудит ровно. Когда он фальшивит, я тоже фальшивлю."},
    {"ifNot":"kern_anchor","text":"Любая дорога здесь — кованая полоса. Ты по ним ходишь, я их чиню."},
    {"if":"kern_release","ifNot":"kern_anchor","text":"Спина болит как у обычного человека. Прекрасное чувство, никому не советую."},
    {"if":"kern_anchor","text":"Запись Керна: перед новой плавкой проверить тягу и уровень воды в охлаждающем желобе."},
    {"if":"kern_anchor","text":"Запись Керна: ремень с надрывом у пряжки заменить целиком. Заплату под пряжку не ставить."},
    {"if":"kern_anchor","text":"Запись Керна: реликвию нагревать от края. При движении старого шва снять с жара и дать остыть."},
    {"if":"kern_anchor","text":"Запись Керна: запас в наковальне закреплён последним штифтом. Для обычного ремонта его не вынимать."}
  ],
  sota: [
    {"on":"death","maxDeaths":9,"ifNot":"sota_index","text":"Запишу утрату «{memory}». Рядом оставлю сведения, которые ты ещё можешь рассказать."},
    {"on":"death","minDeaths":10,"ifNot":"sota_index","text":"Отмечу расход резерва и возвращение в лагерь. Строка новых утрат памяти остаётся пустой."},
    {"on":"lair","ifNot":"sota_index","text":"{lair}. Подпиши со мной опись находок, пока я разбираю походные записи."},
    {"on":"complete","ifNot":"sota_index","text":"Ещё одна страница. Дорога сегодня ровная, почерк тоже."},
    {"on":"retreat","ifNot":"sota_index","text":"Запишу место отхода. В следующий раз сверим его с запасом припасов."},
    {"on":"guardian_win","ifNot":"sota_index","text":"{boss}. Обвожу имя в рамку и записываю дату открытия дороги."},
    {"text":"Если я засну над книгой, переверни страницу. Только не закрывай.","ifNot":"sota_index"},
    {"text":"Название Ложкина и твой рассказ записаны в трёх местах. Копии хранятся отдельно."},
    {"if":"sota_index","text":"Читай мне вслух. По собственным страницам я слышу тебя лучше, чем различаю мелкий почерк."},
    {"on":"death","maxDeaths":9,"if":"sota_index","text":"Открой страницу возвращений и назови писарю утрату «{memory}». Я сверю запись из книги."},
    {"on":"death","minDeaths":10,"if":"sota_index","text":"На странице возвращений отметьте расход резерва. Из книги я подтвержу число прежних утрат."},
    {"on":"lair","if":"sota_index","text":"{lair}. Прочти находки по одной. Я сопоставлю их с указателем."},
    {"on":"complete","if":"sota_index","text":"Продиктуй маршрут дежурному писарю. Я отвечу из книги, когда понадобится сверить название."},
    {"on":"retreat","if":"sota_index","text":"Назови место поворота. На открытой странице есть поля для пути обратно."},
    {"on":"guardian_win","if":"sota_index","text":"{boss}. Прочти мне итоговую запись. Дату открытия дороги нужно сохранить отдельно."}
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
  const contract = (hero.companions || []).some((c) => c.legal === "contract");
  const fits = (line) => (!line.contract || contract) && (!line.freedom || Number(hero.karma || 0) >= 25) && (!line.if || storyHasFlag(hero, line.if)) && (!line.ifNot || !storyHasFlag(hero, line.ifNot)) && (!line.chapter || chapter >= line.chapter) && (!line.minDeaths || deaths >= line.minDeaths) && (!line.maxDeaths || deaths <= line.maxDeaths);
  const lines = (CAMP_TALK[who] || []).filter(fits);
  const urgent = lines.filter((line) => line.contract);
  if (urgent.length) return { answers: urgent, everyday: lines.filter((line) => !line.on && !line.contract) };
  const lastFree = (moment === "death" || moment === "guardian_death") && hero.story?.lastTrip?.credit;
  const answers = lines.filter((line) => line.on === moment && (line.credit ? lastFree : moment !== "death" && moment !== "guardian_death" || (!lastFree && getLostMemories(hero).length)));
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
