// Mastery of the bard skills: at level V each skill offers three upgrades of its own (designed with Codex; trunk, lyre and hymn by Claude).
(() => {
  // Bard trunk, lyre and hymn. Notes: ♫ blade, ♪ life, ☾ shade. Core mechanics run their afterAction
  // before these hooks, so inside afterAction the note of this action is already written.
  const notes = b => coreState(b)?.notes || [];
  const count = (b, note) => notes(b).filter(n => n === note).length;
  const rhythm = b => Number(b.mech?.lyre?.value || 0);
  const hymnNow = b => b.mech?.hymn?.active || null;
  const heavy = (b, foe) => Boolean(foe?.charge || describeIntentFor(b, foe)?.heavy);
  const extend = (unit, id, turns = 1) => { const e = getEffect(unit, id); if (e && e.duration > 0) e.duration += turns; return e; };
  const cut = (b, id, turns = 1) => { const cd = Number(b.hero.cooldowns?.[id] || 0); if (cd > 1) b.hero.cooldowns[id] = Math.max(1, cd - turns); };
  const breath = (b, amount) => { if (amount > 0) procMana(b, amount / Math.max(1, b.hero.maxMana)); };
  const ward = (b, ratio, duration = 3) => {
    if (b.hero.currentHp <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const old = effectValue(b.hero, "shield");
    const e = fx(b, "shield", duration, Math.round(b.hero.maxHp * ratio), { self: true });
    if (e) e.value = Math.min(cap, Math.max(old, e.value));
  };
  const other = b => livingFoes(b).find(f => f !== b.enemy);
  const atOther = (b, run) => {
    const foe = other(b);
    if (!foe) return false;
    const focus = b.enemy, slot = b.focus;
    b.focus = slot ?? focus.slot;
    b.enemy = foe;
    try { run(foe); } finally { b.enemy = focus; b.focus = slot; }
    return true;
  };
  // Notes and rhythm as they were before this action: kept by every hook call of the option.
  const step = (id, run) => function (b, s, c) {
    const prev = s.prev || [];
    const lastSkill = s.last || null;
    const prevRhythm = s.rh || 0;
    const prevHymn = s.hy || null;
    s.hy = hymnNow(b);
    if (c.type === "skill" || c.type === "attack") s.prev = [...notes(b)];
    if (c.type === "skill") { s.last = c.skill.id; s.rh = rhythm(b); }
    if (c.skill?.id === id) run(b, s, c, { prev, lastSkill, prevRhythm, prevHymn, sung: Boolean(coreState(b)?.sung) });
  };
  const onHit = (id, run) => function (b, s, c) { if (c.skill?.id === id && !c.proc) run(b, s, c); };

  // Щипок струны: дешёвая ♫ к маршу — акцент на третьей ноте, возврат цены за добивание, удар в уже скованную цель.
  defineSkillMastery("bard-pluck", [
    { id: "lead_string", name: "Ведущая струна", description: "Если перед щипком уже звучат две ♫, он бьёт на 25% сильнее и сразу начинает марш.",
      on: { beforeHit: onHit("bard-pluck", (b, s, c) => { if (count(b, "blade") === 2) c.mult *= 1.25; }) } },
    { id: "light_hand", name: "Лёгкая рука", description: "Если щипок добивает цель, его 6 дыхания возвращаются.",
      on: { afterHit: onHit("bard-pluck", (b, s, c) => { if (c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true; }),
        afterAction: step("bard-pluck", (b, s) => { if (s.kill) breath(b, 6); s.kill = false; }) } },
    { id: "bound_ear", name: "Скованный слух", description: "По цели под замедлением или немотой щипок пробивает ещё 20% защиты.",
      on: { beforeHit: onHit("bard-pluck", (b, s, c) => { if (getEffect(b.enemy, "slow") || getEffect(b.enemy, "silence")) c.pierce += 0.2; }) } }
  ]);

  // Резонирующий аккорд: удар и лечение — долгая регенерация в беде, возврат при полном здоровье, звон в порче.
  defineSkillMastery("bard-resonating-chord", [
    { id: "long_ring", name: "Долгий звон", description: "Если здоровья меньше 60%, регенерация аккорда держится на 1 ход дольше.",
      on: { afterAction: step("bard-resonating-chord", b => { if (hpRatio(b.hero) < 0.6) extend(b.hero, "regeneration"); }) } },
    { id: "no_waste", name: "Без потерь", description: "Если перед аккордом здоровье было полным, ты возвращаешь 10 дыхания: лечение не пропадает зря.",
      on: { beforeHit: onHit("bard-resonating-chord", (b, s) => { if (s.full === undefined) s.full = b.hero.currentHp >= b.hero.maxHp; }),
        afterAction: step("bard-resonating-chord", (b, s) => { if (s.full) breath(b, 10); s.full = undefined; }) } },
    { id: "ring_in_rot", name: "Звон в порче", description: "Если на цели есть порча, аккорд продлевает её на 1 ход.",
      on: { afterAction: step("bard-resonating-chord", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "corruption"); }) } }
  ]);

  // Фальшивая нота: замедление — гуще на замедленной, срыв тяжёлого замаха, фальшь на соседа.
  defineSkillMastery("bard-false-note", [
    { id: "dragged", name: "Затянутая фальшь", description: "Если цель уже замедлена, замедление крепнет до 30% и держится на 1 ход дольше.",
      on: { beforeHit: onHit("bard-false-note", (b, s) => { s.slowed = Boolean(getEffect(b.enemy, "slow")); }),
        afterAction: step("bard-false-note", (b, s) => { const e = s.slowed && getEffect(b.enemy, "slow"); if (e) { e.value = Math.max(e.value, 0.3); e.duration += 1; } s.slowed = false; }) } },
    { id: "off_beat", name: "Сбитый замах", description: "Если цель готовит тяжёлый удар, нота ещё и ослабляет её на 15% на 1 ход.",
      on: { afterAction: step("bard-false-note", b => { if (b.enemy.currentHp > 0 && heavy(b, b.enemy)) fx(b, "weaken", 1, 0.15); }) } },
    { id: "wrong_crowd", name: "Фальшь в толпе", description: "Замедление 20% получает и другой враг на 1 ход.",
      on: { afterAction: step("bard-false-note", b => { atOther(b, () => fx(b, "slow", 1, 0.2)); }) } }
  ]);

  // Широкий перебор: охват — дыхание за задетых, сила против одного, марш сокращает откат.
  defineSkillMastery("bard-wide-strum", [
    { id: "many_strings", name: "Много струн", description: "За каждого задетого врага кроме главной цели ты возвращаешь 3 дыхания.",
      on: { afterAction: step("bard-wide-strum", b => { breath(b, 3 * Math.max(0, livingFoes(b).filter(f => f !== b.enemy).length)); }) } },
    { id: "one_listener", name: "Один слушатель", description: "Если враг один, перебор бьёт его на 25% сильнее.",
      on: { beforeHit: onHit("bard-wide-strum", (b, s, c) => { if (livingFoes(b).length === 1) c.mult *= 1.25; }) } },
    { id: "march_on", name: "Шаг марша", description: "Если перебор завершает марш из трёх ♫, его откат на 1 ход короче.",
      on: { afterAction: step("bard-wide-strum", (b, s, c, x) => { if (x.sung && x.prev.length === 2 && x.prev.every(n => n === "blade")) cut(b, "bard-wide-strum"); }) } }
  ]);

  // Струны вразнобой: два звука с меткой — долгая метка, пробой надлома, метка соседу.
  defineSkillMastery("bard-split-strings", [
    { id: "deep_mark", name: "Глубокая метка", description: "Метка струн держится на 1 ход дольше.",
      on: { afterAction: step("bard-split-strings", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "mark"); }) } },
    { id: "split_plate", name: "Расщеплённая броня", description: "По цели с надломленной бронёй каждый звук пробивает ещё 15% защиты.",
      on: { beforeHit: onHit("bard-split-strings", (b, s, c) => { if (getEffect(b.enemy, "armor_break")) c.pierce += 0.15; }) } },
    { id: "neighbour_mark", name: "Метка соседу", description: "Другой враг тоже получает метку 10% на 1 ход.",
      on: { afterAction: step("bard-split-strings", b => { atOther(b, () => fx(b, "mark", 1, 0.1)); }) } }
  ]);

  // Зажать звук: немота — сорванный заряд, долгая тишина для заклинателя, возврат дыхания.
  defineSkillMastery("bard-mute-string", [
    { id: "cut_spell", name: "Сорванный заряд", description: "Если цель копит заряд или готовит тяжёлый удар, откат зажима на 1 ход короче.",
      on: { beforeHit: onHit("bard-mute-string", (b, s) => { s.hot = heavy(b, b.enemy); }),
        afterAction: step("bard-mute-string", (b, s) => { if (s.hot) cut(b, "bard-mute-string"); s.hot = false; }) } },
    { id: "long_hush", name: "Долгая тишина", description: "Если цель бьёт магией, немота держится на 1 ход дольше.",
      on: { afterAction: step("bard-mute-string", b => { const i = b.enemy.currentHp > 0 ? describeIntentFor(b, b.enemy) : null; if (i?.kind === "magic") extend(b.enemy, "silence"); }) } },
    { id: "rest_fingers", name: "Пауза для пальцев", description: "Если цель пережила удар, ты возвращаешь 8 дыхания, пока она молчит.",
      on: { afterAction: step("bard-mute-string", b => { if (b.enemy.currentHp > 0 && getEffect(b.enemy, "silence")) breath(b, 8); }) } }
  ]);

  // Удар декой: ближний удар — гул на полном марше, отдача щитом, сильная первая доля.
  defineSkillMastery("bard-soundboard", [
    { id: "boom", name: "Гулкая дека", description: "Если перед ударом звучат две ♫, цель ошеломлена на 20% на 1 ход.",
      on: { beforeHit: onHit("bard-soundboard", (b, s) => { s.full = count(b, "blade") === 2; }),
        afterAction: step("bard-soundboard", (b, s) => { if (s.full && b.enemy.currentHp > 0) fx(b, "stagger", 1, 0.2); s.full = false; }) } },
    { id: "recoil", name: "Отдача деки", description: "После удара декой ты получаешь щит 6% здоровья на 2 хода: ты стоишь вплотную.",
      on: { afterAction: step("bard-soundboard", b => ward(b, 0.06, 2)) } },
    { id: "downbeat", name: "Первая доля", description: "Если ♫ в мотиве ещё нет, удар декой бьёт на 20% сильнее.",
      on: { beforeHit: onHit("bard-soundboard", (b, s, c) => { if (!count(b, "blade")) c.mult *= 1.2; }) } }
  ]);

  // Тёплый куплет: лечение — длинная регенерация, крепкий щит в беде, гимн ускоряет откат.
  defineSkillMastery("bard-soothing-verse", [
    { id: "long_verse", name: "Длинный куплет", description: "Регенерация куплета держится на 1 ход дольше.",
      on: { afterAction: step("bard-soothing-verse", b => extend(b.hero, "regeneration")) } },
    { id: "warm_hands", name: "Тёплые руки", description: "Если перед куплетом здоровья было меньше 50%, щит прибавляет ещё 6% здоровья.",
      on: { afterAction: step("bard-soothing-verse", (b, s, c) => { if (s.low) ward(b, 0.06); }),
        turnStart(b, s) { s.low = hpRatio(b.hero) < 0.5; } } },
    { id: "into_hymn", name: "Куплет в гимн", description: "Если куплет завершает гимн из трёх ♪, его откат на 2 хода короче.",
      on: { afterAction: step("bard-soothing-verse", (b, s, c, x) => { if (x.sung && x.prev.length === 2 && x.prev.every(n => n === "life")) cut(b, "bard-soothing-verse", 2); }) } }
  ]);

  // Скрип колков: слабость — сильнее у тяжёлого замаха, дольше, удар по ослабленной.
  defineSkillMastery("bard-creaking-pegs", [
    { id: "creak_windup", name: "Скрип у замаха", description: "Если цель готовит тяжёлый удар, слабость 35% вместо 25%.",
      on: { beforeHit: onHit("bard-creaking-pegs", (b, s) => { s.hot = heavy(b, b.enemy); }),
        afterAction: step("bard-creaking-pegs", (b, s) => { const e = s.hot && getEffect(b.enemy, "weaken"); if (e) e.value = Math.max(e.value, 0.35); s.hot = false; }) } },
    { id: "rusty_pegs", name: "Ржавые колки", description: "Слабость от колков держится на 1 ход дольше.",
      on: { afterAction: step("bard-creaking-pegs", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "weaken"); }) } },
    { id: "groan", name: "Стон колков", description: "Если цель уже ослаблена, удар бьёт на 25% сильнее.",
      on: { beforeHit: onHit("bard-creaking-pegs", (b, s, c) => { if (getEffect(b.enemy, "weaken")) c.mult *= 1.25; }) } }
  ]);

  // Вдох в такт: дыхание и щит — глубокий вдох на дне, долгий щит, вдох перед аккордом.
  defineSkillMastery("bard-breath-beat", [
    { id: "deep_breath", name: "Глубокий вдох", description: "Если дыхания было меньше 30%, ты возвращаешь ещё 10% дыхания.",
      on: { afterAction: step("bard-breath-beat", (b, s) => { if (s.low) procMana(b, 0.1); }),
        turnStart(b, s) { s.low = b.hero.currentMana < b.hero.maxMana * 0.3; } } },
    { id: "held_shield", name: "Задержанный выдох", description: "Щит вдоха держится на 1 ход дольше.",
      on: { afterAction: step("bard-breath-beat", b => extend(b.hero, "shield")) } },
    { id: "before_chord", name: "Вдох перед аккордом", description: "Если после вдоха в мотиве есть ♫ и ♪, ты возвращаешь ещё 6% дыхания: аккорд рядом.",
      on: { afterAction: step("bard-breath-beat", b => { if (count(b, "blade") && count(b, "life")) procMana(b, 0.06); }) } }
  ]);

  // Ответная фраза: удар после ♪ или ☾ — быстрый ответ, эхо соседу, ответ после завершённого мотива.
  defineSkillMastery("bard-answer-phrase", [
    { id: "quick_reply", name: "Подхваченный ответ", description: "Если сработал бонус фразы, её откат на 1 ход короче.",
      on: { beforeHit: onHit("bard-answer-phrase", (b, s) => { s.on = ["life", "shade"].includes(notes(b).slice(-1)[0]); }),
        afterAction: step("bard-answer-phrase", (b, s) => { if (s.on) cut(b, "bard-answer-phrase"); s.on = false; }) } },
    { id: "echo_reply", name: "Эхо ответа", description: "Если сработал бонус фразы, другой враг получает 25% урона удара.",
      on: { beforeHit: onHit("bard-answer-phrase", (b, s) => { s.on = ["life", "shade"].includes(notes(b).slice(-1)[0]); }),
        afterHit: onHit("bard-answer-phrase", (b, s, c) => { if (s.on) s.dmg = (s.dmg || 0) + c.hpDamage; }),
        afterAction: step("bard-answer-phrase", (b, s) => { if (s.dmg) atOther(b, () => procDamage(b, s.dmg * 0.25, "Эхо ответа", "air")); s.dmg = 0; s.on = false; }) } },
    { id: "answer_silence", name: "Ответ тишине", description: "Бонус +35% срабатывает и тогда, когда мотив только что завершился и нот нет.",
      on: { beforeHit: onHit("bard-answer-phrase", (b, s, c) => { if (!notes(b).length) c.mult *= 1.35; }) } }
  ]);

  // Чёрный обертон: порча — дольше, переход с павшей цели, свежая порча на старую.
  defineSkillMastery("bard-black-overtone", [
    { id: "low_overtone", name: "Низкий обертон", description: "Порча обертона держится на 1 ход дольше.",
      on: { afterAction: step("bard-black-overtone", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "corruption"); }) } },
    { id: "passing_rot", name: "Переходящая порча", description: "Если цель с порчей гибнет, порча с 70% силы переходит на других врагов.",
      on: { foeDown(b, s, c) { if (s.armed && c.foe) spreadEffect(b, c.foe, "corruption", 0.7); },
        afterAction: step("bard-black-overtone", (b, s) => { s.armed = true; }) } },
    { id: "dark_layer", name: "Тёмный слой", description: "Если на цели уже была порча, новая сильнее на 30%.",
      on: { beforeHit: onHit("bard-black-overtone", (b, s) => { s.had = Boolean(getEffect(b.enemy, "corruption")); }),
        afterAction: step("bard-black-overtone", (b, s) => { const e = s.had && getEffect(b.enemy, "corruption"); if (e) e.value = Math.round(e.value * 1.3); s.had = false; }) } }
  ]);

  // Дробь по корпусу: три удара — дыхание в такт, раскат на последнем, пробой с начала.
  defineSkillMastery("bard-body-roll", [
    { id: "beat_breath", name: "Дробь в такт", description: "После двух ♫ каждый удар дроби возвращает 3 дыхания.",
      on: { afterHit: onHit("bard-body-roll", (b, s, c) => { if (count(b, "blade") === 2 && c.hpDamage > 0) breath(b, 3); }) } },
    { id: "rolling", name: "Раскатистая дробь", description: "После дроби цель ошеломлена на 20% на 1 ход.",
      on: { afterAction: step("bard-body-roll", b => { if (b.enemy.currentHp > 0) fx(b, "stagger", 1, 0.2); }) } },
    { id: "cold_start", name: "Дробь с начала", description: "Если ♫ ещё не звучали, каждый удар дроби пробивает 20% защиты.",
      on: { beforeHit: onHit("bard-body-roll", (b, s, c) => { if (!count(b, "blade")) c.pierce += 0.2; }) } }
  ]);

  // Подхват мелодии: лечение и ответный звук — перехват после ♫, возврат при здоровье, звук на двоих.
  defineSkillMastery("bard-melody-catch", [
    { id: "intercept", name: "Перехват ноты", description: "Если перед подхватом звучала ♫, ответный звук сильнее: ещё удар с силой 0,4.",
      on: { afterAction: step("bard-melody-catch", (b, s, c, x) => { if (x.prev.includes("blade") && b.enemy.currentHp > 0) performHeroHit(b, { kind: "magic", power: 0.4, label: "Перехват ноты", element: "air", sure: true, noEcho: true, proc: true }); }) } },
    { id: "easy_catch", name: "Лёгкий подхват", description: "Если здоровья больше 80%, ты возвращаешь 8 дыхания: подхват не стоит лишнего.",
      on: { afterAction: step("bard-melody-catch", b => { if (hpRatio(b.hero) > 0.8) breath(b, 8); }) } },
    { id: "for_two", name: "Подхват на двоих", description: "Ответный звук задевает и другого врага с силой 0,5.",
      on: { afterAction: step("bard-melody-catch", b => { atOther(b, () => performHeroHit(b, { kind: "magic", power: 0.5, label: "Подхват на двоих", element: "air", sure: true, noEcho: true, proc: true })); }) } }
  ]);

  // Сорванный размер: ошеломление толпы — дольше на цели, короче откат при толпе, сильнее на замахе.
  defineSkillMastery("bard-broken-meter", [
    { id: "tripped", name: "Сбитые ноги", description: "Ошеломление главной цели держится на 1 ход дольше.",
      on: { afterAction: step("bard-broken-meter", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "stagger"); }) } },
    { id: "torn_beat", name: "Разорванный такт", description: "Если задето два врага и больше, откат на 1 ход короче.",
      on: { afterAction: step("bard-broken-meter", b => { if (livingFoes(b).length >= 2) cut(b, "bard-broken-meter"); }) } },
    { id: "lost_count", name: "Сорванный счёт", description: "Если главная цель готовит тяжёлый удар, её ошеломление 40%.",
      on: { beforeHit: onHit("bard-broken-meter", (b, s) => { s.hot = heavy(b, b.enemy); }),
        afterAction: step("bard-broken-meter", (b, s) => { const e = s.hot && getEffect(b.enemy, "stagger"); if (e) e.value = Math.max(e.value, 0.4); s.hot = false; }) } }
  ]);

  // Последняя струна: тяжёлый финал — откат после добивания, шире марш, возврат без подготовки.
  defineSkillMastery("bard-last-string", [
    { id: "to_the_end", name: "Звон до конца", description: "Если струна добивает главную цель, её откат на 2 хода короче.",
      on: { afterHit: onHit("bard-last-string", (b, s, c) => { if (c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true; }),
        afterAction: step("bard-last-string", (b, s) => { if (s.kill) cut(b, "bard-last-string", 2); s.kill = false; }) } },
    { id: "march_finale", name: "Финал марша", description: "Если сработал бонус двух ♫, остальные враги получают ещё 20% урона удара.",
      on: { beforeHit: onHit("bard-last-string", (b, s) => { if (s.full === undefined) s.full = count(b, "blade") === 2; }),
        afterHit: onHit("bard-last-string", (b, s, c) => { if (s.full && !s.dmg) s.dmg = c.hpDamage; }),
        afterAction: step("bard-last-string", (b, s) => { if (s.dmg) eachFoe(b, () => procDamage(b, s.dmg * 0.2, "Финал марша", "air"), false); s.dmg = 0; s.full = undefined; }) } },
    { id: "spare_string", name: "Сбережённая струна", description: "Если бонус двух ♫ не сработал, ты возвращаешь 10 дыхания.",
      on: { beforeHit: onHit("bard-last-string", (b, s) => { if (s.full === undefined) s.full = count(b, "blade") === 2; }),
        afterAction: step("bard-last-string", (b, s) => { if (s.full === false) breath(b, 10); s.full = undefined; }) } }
  ]);

  // Тройное созвучие: завершение аккорда — долгая ярость, половина созвучия, дыхание аккорда.
  defineSkillMastery("bard-triple-consonance", [
    { id: "pure_chord", name: "Чистое созвучие", description: "Если удар завершает аккорд, ярость аккорда держится на 1 ход дольше.",
      on: { afterAction: step("bard-triple-consonance", (b, s, c, x) => { if (x.sung && new Set([...x.prev, "blade"]).size === 3) extend(b.hero, "rage"); }) } },
    { id: "half_chord", name: "Половина созвучия", description: "Если звучит только одна из нот ♪ или ☾, сила +15%.",
      on: { beforeHit: onHit("bard-triple-consonance", (b, s, c) => { if ((count(b, "life") === 1) !== (count(b, "shade") === 1)) c.mult *= 1.15; }) } },
    { id: "chord_breath", name: "Дыхание созвучия", description: "Если удар завершает аккорд, ты возвращаешь ещё 8% дыхания.",
      on: { afterAction: step("bard-triple-consonance", (b, s, c, x) => { if (x.sung && new Set([...x.prev, "blade"]).size === 3) procMana(b, 0.08); }) } }
  ]);

  // Тишина в зале: немота и реквием — дольше после реквиема, эхо соседу, пробой без подготовки.
  defineSkillMastery("bard-hall-silence", [
    { id: "lasting_hush", name: "Тишина длится", description: "Если удар завершает реквием, немота держится на 1 ход дольше.",
      on: { afterAction: step("bard-hall-silence", (b, s, c, x) => { if (x.sung && x.prev.length === 2 && x.prev.every(n => n === "shade") && b.enemy.currentHp > 0) extend(b.enemy, "silence"); }) } },
    { id: "hall_echo", name: "Эхо в зале", description: "Если удар завершает реквием, другой враг тоже немеет на 1 ход.",
      on: { afterAction: step("bard-hall-silence", (b, s, c, x) => { if (x.sung && x.prev.length === 2 && x.prev.every(n => n === "shade")) atOther(b, () => fx(b, "silence", 1, 1)); }) } },
    { id: "quiet_step", name: "Тихий шаг", description: "Без двух ☾ удар всё равно пробивает 20% защиты.",
      on: { beforeHit: onHit("bard-hall-silence", (b, s, c) => { if (count(b, "shade") < 2) c.pierce += 0.2; }) } }
  ]);

  // Острый куплет (лира): дешёвый удар ритма — дыхание за смену, мягкий повтор, пробой на высоком ритме.
  defineSkillMastery("bard-sharp-verse", [
    { id: "sharp_change", name: "Острая смена", description: "Если куплет сменил навык и дал ритм, ты возвращаешь 3 дыхания.",
      on: { afterAction: step("bard-sharp-verse", (b, s, c, x) => { if (x.lastSkill && x.lastSkill !== "bard-sharp-verse") breath(b, 3); }) } },
    { id: "no_stumble", name: "Куплет без сбоя", description: "Повтор куплета не обнуляет ритм, а снимает только 1.",
      on: { afterAction: step("bard-sharp-verse", (b, s, c, x) => { if (x.lastSkill === "bard-sharp-verse" && b.mech?.lyre) b.mech.lyre.value = Math.max(0, x.prevRhythm - 1); }) } },
    { id: "keen_edge", name: "Колкий куплет", description: "При ритме 3 и выше куплет пробивает 20% защиты.",
      on: { beforeHit: onHit("bard-sharp-verse", (b, s, c) => { if (rhythm(b) >= 3) c.pierce += 0.2; }) } }
  ]);

  // Беглая трель: пробой за ритм — третья нота, метка держится, откат в такт.
  defineSkillMastery("bard-quick-trill", [
    { id: "third_note", name: "Третья нота", description: "При ритме 3 и выше трель добавляет третий звук с силой 0,5.",
      on: { beforeHit: onHit("bard-quick-trill", (b, s) => { if (s.r === undefined) s.r = rhythm(b); }),
        afterAction: step("bard-quick-trill", (b, s) => { if (s.r >= 3 && b.enemy.currentHp > 0) performHeroHit(b, { kind: "magic", power: 0.5, label: "Третья нота", element: "air", noEcho: true, proc: true }); s.r = undefined; }) } },
    { id: "trill_mark", name: "Трель по метке", description: "Если цель помечена, метка держится на 1 ход дольше.",
      on: { afterAction: step("bard-quick-trill", b => { if (b.enemy.currentHp > 0) extend(b.enemy, "mark"); }) } },
    { id: "in_time", name: "Трель в такт", description: "Если трель сменила навык и дала ритм, её откат на 1 ход короче.",
      on: { afterAction: step("bard-quick-trill", (b, s, c, x) => { if (x.lastSkill && x.lastSkill !== "bard-quick-trill") cut(b, "bard-quick-trill"); }) } }
  ]);

  // Переход на бас: слабость и ритм — глубже на высоком ритме, дыхание на полном, гул соседу.
  defineSkillMastery("bard-bass-transition", [
    { id: "deep_bass", name: "Глубокий бас", description: "При ритме 3 и выше слабость баса 25% вместо 15%.",
      on: { beforeHit: onHit("bard-bass-transition", (b, s) => { s.r = rhythm(b); }),
        afterAction: step("bard-bass-transition", (b, s) => { const e = s.r >= 3 && getEffect(b.enemy, "weaken"); if (e) e.value = Math.max(e.value, 0.25); s.r = 0; }) } },
    { id: "bass_run", name: "Басовый ход", description: "Если после перехода ритм полный (4), ты возвращаешь 6 дыхания.",
      on: { afterAction: step("bard-bass-transition", b => { if (rhythm(b) >= 4) breath(b, 6); }) } },
    { id: "hum", name: "Гул баса", description: "Другой враг тоже получает слабость 15% на 1 ход.",
      on: { afterAction: step("bard-bass-transition", b => { atOther(b, () => fx(b, "weaken", 1, 0.15)); }) } }
  ]);

  // Сбросить темп: трата ритма — мягкий сброс, дыхание за ритм, ошеломление на полном.
  defineSkillMastery("bard-drop-tempo", [
    { id: "soft_drop", name: "Мягкий сброс", description: "После удара остаётся 1 ритм.",
      on: { afterAction: step("bard-drop-tempo", (b, s, c, x) => { if (b.mech?.lyre && x.prevRhythm > 0) b.mech.lyre.value = 1; }) } },
    { id: "drop_breath", name: "Сброс в дыхание", description: "За каждый сброшенный ритм ты возвращаешь 3 дыхания.",
      on: { beforeHit: onHit("bard-drop-tempo", (b, s) => { if (s.r === undefined) s.r = rhythm(b); }),
        afterAction: step("bard-drop-tempo", (b, s) => { breath(b, 3 * (s.r || 0)); s.r = undefined; }) } },
    { id: "full_drop", name: "Сброс с плеча", description: "Если перед ударом ритм был полным (4), цель ошеломлена на 20% на 1 ход.",
      on: { beforeHit: onHit("bard-drop-tempo", (b, s) => { if (s.r === undefined) s.r = rhythm(b); }),
        afterAction: step("bard-drop-tempo", (b, s) => { if (s.r >= 4 && b.enemy.currentHp > 0) fx(b, "stagger", 1, 0.2); s.r = undefined; }) } }
  ]);

  // Каденция лиры: широкий удар — сила против одного, лишний ритм, откат после добивания.
  defineSkillMastery("bard-lyre-cadenza", [
    { id: "solo", name: "Каденция одному", description: "Если враг один, каденция бьёт на 20% сильнее.",
      on: { beforeHit: onHit("bard-lyre-cadenza", (b, s, c) => { if (livingFoes(b).length === 1) c.mult *= 1.2; }) } },
    { id: "in_rhythm", name: "Каденция в ритм", description: "Если каденция сменила навык, она даёт ещё 1 ритм сверху.",
      on: { afterAction: step("bard-lyre-cadenza", (b, s, c, x) => { if (x.lastSkill && x.lastSkill !== "bard-lyre-cadenza" && b.mech?.lyre) addGauge(b.mech.lyre, 1, 4); }) } },
    { id: "fading", name: "Затихающая каденция", description: "Если каденция кого-то добивает, её откат на 1 ход короче.",
      on: { afterHit: onHit("bard-lyre-cadenza", (b, s, c) => { if (c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true; }),
        afterAction: step("bard-lyre-cadenza", (b, s) => { if (s.kill) cut(b, "bard-lyre-cadenza"); s.kill = false; }) } }
  ]);

  // Взять дыхание: лечение за ритм — щит на высоком ритме, ритм вполовину, запас при нуле.
  defineSkillMastery("bard-rhythm-breath", [
    { id: "full_lungs", name: "Полные лёгкие", description: "Если ритм был 3 и выше, ты получаешь ещё щит 8% здоровья на 3 хода.",
      on: { afterAction: step("bard-rhythm-breath", (b, s, c, x) => { if (x.prevRhythm >= 3) ward(b, 0.08); }) } },
    { id: "keep_time", name: "Сохранить такт", description: "Ритм не обнуляется, а падает вдвое с округлением вниз.",
      on: { afterAction: step("bard-rhythm-breath", (b, s, c, x) => { if (b.mech?.lyre) b.mech.lyre.value = Math.floor(x.prevRhythm / 2); }) } },
    { id: "spare_air", name: "Запас воздуха", description: "Если ритма не было, ты всё равно возвращаешь 6% дыхания.",
      on: { afterAction: step("bard-rhythm-breath", (b, s, c, x) => { if (x.prevRhythm <= 0) procMana(b, 0.06); }) } }
  ]);

  // Гимн стойкости: лечение и щит — долгая регенерация, прочнее при звучащей стойкости, принять первый удар.
  defineSkillMastery("bard-gentle-hymn", [
    { id: "long_hymn", name: "Долгий гимн", description: "Регенерация гимна держится на 1 ход дольше.",
      on: { afterAction: step("bard-gentle-hymn", b => extend(b.hero, "regeneration")) } },
    { id: "steady_hymn", name: "Стойкий напев", description: "Если стойкость уже звучала, щит гимна прибавляет ещё 6% здоровья.",
      on: { afterAction: step("bard-gentle-hymn", (b, s, c, x) => { if (x.prevHymn === "endurance") ward(b, 0.06); }) } },
    { id: "brace", name: "Тихая стойкость", description: "Первый удар по тебе после гимна слабее на 15%.",
      on: { afterAction: step("bard-gentle-hymn", (b, s) => { s.armed = true; }),
        incoming(b, s, c) { if (s.armed) { c.amount *= 0.85; s.armed = false; } } } }
  ]);

  // Гимн мощи: включение мощи — ярость при звучащей мощи, сильный переход, пробой.
  defineSkillMastery("bard-might-hymn", [
    { id: "might_answer", name: "Мощь в ответ", description: "Если мощь уже звучала, удар даёт ярость 15% на 2 хода.",
      on: { beforeHit: onHit("bard-might-hymn", (b, s) => { if (s.was === undefined) s.was = hymnNow(b); }),
        afterAction: step("bard-might-hymn", (b, s) => { if (s.was === "might") fx(b, "rage", 2, 0.15, { self: true }); s.was = undefined; }) } },
    { id: "swell", name: "Раскат мощи", description: "Если звучал другой гимн или никакой, удар, включающий мощь, бьёт на 20% сильнее.",
      on: { beforeHit: onHit("bard-might-hymn", (b, s, c) => { if (hymnNow(b) !== "might") c.mult *= 1.2; }) } },
    { id: "even_might", name: "Ровная мощь", description: "Удар гимна мощи пробивает 15% защиты.",
      on: { beforeHit: onHit("bard-might-hymn", (b, s, c) => { c.pierce += 0.15; }) } }
  ]);

  // Гимн ясности: включение ясности — дыхание при звучащей ясности, быстрая смена, очищение.
  defineSkillMastery("bard-clarity-hymn", [
    { id: "clear_tone", name: "Чистый тон", description: "Если ясность уже звучала, ты сразу возвращаешь 6% дыхания.",
      on: { beforeHit: onHit("bard-clarity-hymn", (b, s) => { if (s.was === undefined) s.was = hymnNow(b); }),
        afterAction: step("bard-clarity-hymn", (b, s) => { if (s.was === "clarity") procMana(b, 0.06); s.was = undefined; }) } },
    { id: "clear_change", name: "Ясная смена", description: "Если гимн сменился на ясность, откат на 1 ход короче.",
      on: { beforeHit: onHit("bard-clarity-hymn", (b, s) => { if (s.was === undefined) s.was = hymnNow(b); }),
        afterAction: step("bard-clarity-hymn", (b, s) => { if (s.was !== "clarity") cut(b, "bard-clarity-hymn"); s.was = undefined; }) } },
    { id: "clear_sound", name: "Прозрачный звук", description: "Гимн снимает с тебя слабость или замедление.",
      on: { afterAction: step("bard-clarity-hymn", b => { const e = getEffect(b.hero, "weaken") || getEffect(b.hero, "slow"); if (e) b.hero.effects = b.hero.effects.filter(x => x !== e); }) } }
  ]);

  // Верность напеву: удар при стойкости — сильнее лечение, щит за первый удар, быстрый откат.
  defineSkillMastery("bard-faithful-tune", [
    { id: "faithful_hand", name: "Верная рука", description: "При сработавшем бонусе лечение 9% здоровья вместо 6%.",
      on: { beforeHit: onHit("bard-faithful-tune", (b, s) => { if (s.ok === undefined) s.ok = hymnNow(b) === "endurance"; }),
        afterAction: step("bard-faithful-tune", (b, s) => { if (s.ok) procHeal(b, 0.03, "Верная рука"); s.ok = undefined; }) } },
    { id: "first_vow", name: "Первая клятва", description: "Если стойкость ещё не звучала, удар даёт щит 8% здоровья на 3 хода.",
      on: { beforeHit: onHit("bard-faithful-tune", (b, s) => { if (s.ok === undefined) s.ok = hymnNow(b) === "endurance"; }),
        afterAction: step("bard-faithful-tune", (b, s) => { if (s.ok === false) ward(b, 0.08); s.ok = undefined; }) } },
    { id: "unfading", name: "Напев не стихает", description: "При сработавшем бонусе откат на 1 ход короче.",
      on: { beforeHit: onHit("bard-faithful-tune", (b, s) => { if (s.ok === undefined) s.ok = hymnNow(b) === "endurance"; }),
        afterAction: step("bard-faithful-tune", (b, s) => { if (s.ok) cut(b, "bard-faithful-tune"); s.ok = undefined; }) } }
  ]);

  // Отзвук гимна: выплата гимна — громче, гимн из тишины, отзвук соседу.
  defineSkillMastery("bard-hymn-echo", [
    { id: "loud", name: "Громкий отзвук", description: "Выплата сильнее наполовину: ещё 3% здоровья, 6% дыхания или ход ярости.",
      on: { afterAction: step("bard-hymn-echo", b => { const h = hymnNow(b); if (h === "endurance") procHeal(b, 0.03, "Громкий отзвук"); if (h === "clarity") procMana(b, 0.06); if (h === "might") extend(b.hero, "rage"); }) } },
    { id: "from_silence", name: "Отзвук из тишины", description: "Если гимна не было, удар включает стойкость.",
      on: { afterAction: step("bard-hymn-echo", b => { if (b.mech?.hymn && !b.mech.hymn.active) { b.mech.hymn.active = "endurance"; mechNote(b, "Гимн стойкости"); } }) } },
    { id: "spread", name: "Отзвук по двоим", description: "Другой враг получает 35% урона удара.",
      on: { afterHit: onHit("bard-hymn-echo", (b, s, c) => { s.dmg = (s.dmg || 0) + c.hpDamage; }),
        afterAction: step("bard-hymn-echo", (b, s) => { if (s.dmg) atOther(b, () => procDamage(b, s.dmg * 0.35, "Отзвук по двоим", "air")); s.dmg = 0; }) } }
  ]);

  // Перепеть гимн: смена гимна — сильный следующий удар, стойкость в беде, двойная выплата.
  defineSkillMastery("bard-retune-hymn", [
    { id: "smooth_retune", name: "Плавная перестройка", description: "Следующий удар после перестройки бьёт на 20% сильнее.",
      on: { afterAction: step("bard-retune-hymn", (b, s) => { s.next = true; }),
        beforeHit(b, s, c) { if (s.next && c.skill && c.skill.id !== "bard-retune-hymn" && !c.proc) { c.mult *= 1.2; s.spent = true; } },
        afterHit(b, s) { if (s.spent) { s.next = false; s.spent = false; } } } },
    { id: "hold_fast", name: "Держаться стойкости", description: "Если здоровья меньше 40%, перестройка включает стойкость и сразу лечит 6%.",
      on: { afterAction: step("bard-retune-hymn", b => { if (hpRatio(b.hero) < 0.4 && b.mech?.hymn) { b.mech.hymn.active = "endurance"; procHeal(b, 0.06, "Держаться стойкости"); } }) } },
    { id: "double_pay", name: "Двойная выплата", description: "Новый гимн платит ещё раз вполсилы: 3% здоровья, 6% дыхания или ход ярости.",
      on: { afterAction: step("bard-retune-hymn", b => { const h = hymnNow(b); if (h === "endurance") procHeal(b, 0.03, "Двойная выплата"); if (h === "clarity") procMana(b, 0.06); if (h === "might") extend(b.hero, "rage"); }) } }
  ]);
})();

(() => {
  const saga = b => b.mech?.skald?.verses || [];
  const reserve = b => Number(b.mech?.cantor?.value || 0);
  const voices = b => (b.hero.summonedUnits || []).filter(u => u.role === "voice" && u.hp > 0);
  const spirits = b => (b.hero.summonedUnits || []).filter(u => u.type === "spirit" && u.hp > 0);
  const targets = (b, skill) => skill.aoe ? livingFoes(b) : b.enemy.currentHp > 0 ? [b.enemy] : [];

  const extend = (unit, id) => {
    const e = getEffect(unit, id);
    if (e && e.duration > 0) e.duration += 1;
  };

  const ward = (b, amount) => {
    if (amount <= 0 || b.hero.currentHp <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const old = effectValue(b.hero, "shield");
    if (old >= cap) return;
    const boost = Math.max(0.01, (1 + tm(b.hero, "shield")) * (b.firstShieldBoost ? 1.5 : 1));
    const total = Math.min(cap, old + amount * boost);
    const e = fx(b, "shield", 2, total / boost, { self: true });
    if (e) e.value = Math.min(cap, e.value);
  };

  // Возврат ограничен ценой и ещё не возмещённой тратой; бесплатное действие не даёт дыхания.
  const refund = (b, skill, ratio) => {
    if (getHeroResourceType(skill, b.hero) !== "mana") return;
    const paid = Math.max(0, Number(b.preCostMana ?? b.hero.currentMana) - b.hero.currentMana);
    const amount = Math.floor(Math.min(paid, getSkillResourceCost(skill, b.hero) * ratio));
    if (amount > 0) procMana(b, amount / Math.max(1, b.hero.maxMana));
  };

  const shorten = (unit, ids) => {
    const e = ids.map(id => getEffect(unit, id)).find(e => e && e.duration > 0);
    if (!e) return;
    e.duration -= 1;
    if (e.duration <= 0) unit.effects = (unit.effects || []).filter(x => x !== e);
  };

  // Только одна дополнительная цель; прямой урон не вызывает beforeHit/afterHit.
  const spill = (b, amount, label, predicate = () => true) => {
    const other = livingFoes(b).find(u => u !== b.enemy && predicate(u));
    if (!other || amount <= 0) return;
    const focus = b.enemy;
    const slot = b.focus;
    b.focus = slot ?? focus.slot;
    b.enemy = other;
    try {
      procDamage(b, amount, label, "air");
    } finally {
      b.enemy = focus;
      b.focus = slot;
    }
  };

  const repair = (b, ratio) => {
    const u = voices(b)
      .filter(u => u.hp < u.maxHp)
      .sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
    if (u) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * ratio));
  };

  const newestSpirit = (b, skill) => {
    const config = skill.summonUnitConfig;
    if (!config) return null;
    return spirits(b)
      .filter(u => !u.persistent && u.role === config.role && u.name === config.name)
      .slice(-1)[0] || null;
  };

  // Куплет войны: длительность боевого строя, защита от тяжёлого ответа, дыхание за завершённый мотив.
  defineSkillMastery("bard-war-hymn", [
    {
      id: "long_banner",
      name: "Долгое знамя",
      description: "Ярость от куплета держится на 1 ход дольше. Если форма заменяет её укреплением, ты продлеваешь укрепление вместо ярости.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-war-hymn") return;
          const id = (c.skill.appliedEffects || []).some(e => e.id === "rage") ? "rage" : "fortify";
          extend(b.hero, id);
        }
      }
    },
    {
      id: "brace_banner",
      name: "Строй под ударом",
      description: "До твоего следующего хода первый тяжёлый удар наносит на 20% меньше урона, пока действует ярость, ускорение или укрепление куплета.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-war-hymn") return;
          s.effects = (c.skill.appliedEffects || [])
            .filter(e => ["rage", "haste", "fortify"].includes(e.id))
            .map(e => getEffect(b.hero, e.id))
            .filter(Boolean);
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || !c.heavy ||
              !s.effects?.some(e => e.duration > 0 && (b.hero.effects || []).includes(e))) return;
          s.armed = false;
          c.amount *= 0.8;
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    },
    {
      id: "common_breath",
      name: "Общий вдох",
      description: "Если куплет завершает мотив из трёх нот, ты дополнительно возвращаешь 3% максимального дыхания.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-war-hymn") return;
          if (coreState(b)?.sung) procMana(b, 0.03);
        }
      }
    }
  ]);

  // Громовой куплет: раскат после попадания, полезный повтор куплета, отзвук по соседу.
  defineSkillMastery("bard-thunder-note", [
    {
      id: "rolling_thunder",
      name: "Раскат грома",
      description: "После первого попадания по здоровью остальные звуки этого приёма пробивают ещё 30% защиты той же цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          if (!c.proc && s.foe === b.enemy) c.pierce += 0.3;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          if (!c.proc && c.hpDamage > 0) s.foe = b.enemy;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          s.foe = null;
        }
      }
    },
    {
      id: "familiar_thunder",
      name: "Знакомый гром",
      description: "Если до удара в саге уже есть гром, ты дополнительно возвращаешь 2% максимального дыхания после приёма.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          if (!c.proc) s.repeated = saga(b).includes("blade");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          const repeated = s.repeated;
          s.repeated = false;
          if (repeated) procMana(b, 0.02);
        }
      }
    },
    {
      id: "side_rumble",
      name: "Боковой раскат",
      description: "После приёма ещё один враг получает 15% суммарного урона его попаданий по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          if (!c.proc) s.damage = (s.damage || 0) + c.hpDamage;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-thunder-note") return;
          const damage = s.damage || 0;
          s.damage = 0;
          spill(b, damage * 0.15, "Боковой раскат");
        }
      }
    }
  ]);

  // Куплет жизни: поддержка после тяжёлых ран, дыхание за сбор саги, покров после припева.
  defineSkillMastery("bard-saga-life", [
    {
      id: "living_thread",
      name: "Живая нить",
      description: "Если после куплета у тебя меньше 50% здоровья, ты получаешь регенерацию на 2 хода: по 8% силы лечения этого навыка за ход.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-life") return;
          if (b.hero.currentHp < b.hero.maxHp * 0.5) {
            fx(b, "regeneration", 2, getSkillSelfHealAmount(c.skill, b.hero) * 0.08, { self: true });
          }
        }
      }
    },
    {
      id: "two_threads",
      name: "Две нити",
      description: "Если после куплета в саге остаются ровно два куплета, ты возвращаешь 3% максимального дыхания.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-life") return;
          if (saga(b).length === 2) procMana(b, 0.03);
        }
      }
    },
    {
      id: "chorus_shelter",
      name: "Покров припева",
      description: "Если куплет вызывает припев саги, ты получаешь на 2 хода дополнительный щит на 3% максимального здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-life") return;
          if (c.skill.verse && saga(b).length === 0) ward(b, b.hero.maxHp * 0.03);
        }
      }
    }
  ]);

  // Второй голос саги: удар перед припевом, награда за добивание, темп завершённого мотива.
  defineSkillMastery("bard-saga-second", [
    {
      id: "joining_voice",
      name: "Сходятся голоса",
      description: "Если после перестановки куплетов этот удар должен завершить сагу, он бьёт на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-saga-second") return;
          if (!c.proc && saga(b).length === 2 &&
              c.skill.verse && !saga(b).includes(c.skill.verse)) c.mult *= 1.15;
        }
      }
    },
    {
      id: "tellers_due",
      name: "Доля сказителя",
      description: "Если прямое попадание этого навыка убивает врага, ты возвращаешь до 20% его цены дыханием.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-saga-second") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-second") return;
          const kill = s.kill;
          s.kill = false;
          if (kill) refund(b, c.skill, 0.2);
        }
      }
    },
    {
      id: "caught_motif",
      name: "Подхваченный мотив",
      description: "Если вторым голосом ты завершаешь мотив из трёх нот, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-second") return;
          if (coreState(b)?.sung) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Припев наперекор: пробивание на двух куплетах, защита незаконченной саги, удар по соседу.
  defineSkillMastery("bard-saga-defiance", [
    {
      id: "unbowed_word",
      name: "Несгибаемое слово",
      description: "При двух куплетах саги прямые попадания этого навыка пробивают ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-saga-defiance") return;
          if (!c.proc && saga(b).length === 2) c.pierce += 0.2;
        }
      }
    },
    {
      id: "unfinished_wall",
      name: "Стена сказа",
      description: "Если после приёма в саге ровно два куплета, ты получаешь на 2 хода щит на 3% максимального здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-defiance") return;
          if (saga(b).length === 2) ward(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "defiant_echo",
      name: "Эхо наперекор",
      description: "При двух куплетах ещё один враг получает 15% урона прямого попадания по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-saga-defiance") return;
          if (!c.proc && saga(b).length === 2) {
            spill(b, c.hpDamage * 0.15, "Эхо наперекор");
          }
        }
      }
    }
  ]);

  // Спеть сначала: сильный первый куплет, дыхание нового начала, одна сохранённая строка за бой.
  defineSkillMastery("bard-saga-restart", [
    {
      id: "first_word",
      name: "Первое слово",
      description: "Если до прямого попадания сага пуста, удар пробивает ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-saga-restart") return;
          if (!c.proc && saga(b).length === 0) c.pierce += 0.2;
        }
      }
    },
    {
      id: "fresh_breath",
      name: "Свежий вдох",
      description: "Если после приёма в саге остаётся только куплет ветра, ты возвращаешь 3% максимального дыхания.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-restart") return;
          if (saga(b).length === 1 && saga(b)[0] === "wind") procMana(b, 0.03);
        }
      }
    },
    {
      id: "remembered_line",
      name: "Памятная строка",
      description: "Один раз за бой, если этот навык вызывает припев саги, куплет ветра остаётся для следующей саги.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-saga-restart") return;
          if (s.used || !c.skill.verse || saga(b).length || !b.mech?.skald) return;
          s.used = true;
          b.mech.skald.verses = ["wind"];
          mechNote(b, "Куплет ветра остаётся в памяти.");
        }
      }
    }
  ]);

  // Дразнилка: долгая слабость, сдерживание ответа, быстрый выход из насмешки даже без удара.
  defineSkillMastery("bard-mocking-tune", [
    {
      id: "lingering_jibe",
      name: "Прилипчивая дразнилка",
      description: "Наложенная дразнилкой слабость держится на 1 ход дольше на каждой затронутой цели.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-mocking-tune") return;
          targets(b, c.skill).forEach(u => extend(u, "weaken"));
        }
      }
    },
    {
      id: "stung_reply",
      name: "Сбитый ответ",
      description: "До твоего следующего хода первый удар цели под слабостью дразнилки наносит ещё на 20% меньше урона. Усиление расходуется один раз на весь приём.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-mocking-tune") return;
          s.foes = targets(b, c.skill)
            .map(u => ({ unit: u, effect: getEffect(u, "weaken") }))
            .filter(x => x.effect);
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || !s.foes?.some(x =>
            x.unit === b.enemy &&
            x.effect.duration > 0 &&
            getEffect(x.unit, "weaken") === x.effect
          )) return;
          s.armed = false;
          c.amount *= 0.8;
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    },
    {
      id: "stage_exit",
      name: "Смена мизансцены",
      description: "Если после дразнилки на цели есть метка или на тебе действует уклонение её формы, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-mocking-tune") return;
          const sidestep = (c.skill.appliedEffects || [])
            .some(e => e.id === "evasion" && e.target === "self");
          if (targets(b, c.skill).some(u => getEffect(u, "mark")) ||
              (sidestep && getEffect(b.hero, "evasion"))) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Подмена: скорость новой сдачи, защита удачной карты, дополнительная сдача монетами.
  defineSkillMastery("bard-swap-card", [
    {
      id: "nimble_deal",
      name: "Ловкая сдача",
      description: "Если после подмены у тебя есть новая карта, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-swap-card") return;
          if (b.mech?.trickster?.card) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "soft_landing",
      name: "Мягкая посадка",
      description: "Если после подмены выпали кубки или шут, ты получаешь на 2 хода щит на 2,5% максимального здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-swap-card") return;
          if (["cups", "jester"].includes(b.mech?.trickster?.card)) {
            ward(b, b.hero.maxHp * 0.025);
          }
        }
      }
    },
    {
      id: "coin_change",
      name: "Монета на сдачу",
      description: "Если после подмены выпали монеты, ты сразу возвращаешь 3% максимального дыхания. Карта сохраняется для следующего навыка.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-swap-card") return;
          if (b.mech?.trickster?.card === "coins") procMana(b, 0.03);
        }
      }
    }
  ]);

  // Тузовый акцент: туз вскрывает метку, другая карта окупает добивание, метки связывают две цели.
  defineSkillMastery("bard-ace-accent", [
    {
      id: "marked_ace",
      name: "Меченый туз",
      description: "С тузом прямое попадание по цели под меткой пробивает ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-ace-accent") return;
          if (!c.proc && b.mech?.trickster?.card === "ace" &&
              getEffect(b.enemy, "mark")) c.pierce += 0.2;
        }
      }
    },
    {
      id: "small_trump",
      name: "Малый козырь",
      description: "Если прямое попадание с картой, кроме туза, убивает врага, ты возвращаешь до 20% цены навыка дыханием.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-ace-accent") return;
          if (!c.proc) {
            s.minor = Boolean(b.mech?.trickster?.card) && b.mech.trickster.card !== "ace";
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-ace-accent") return;
          if (!c.proc && s.minor && c.hpDamage > 0 &&
              b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-ace-accent") return;
          const kill = s.kill;
          s.kill = false;
          s.minor = false;
          if (kill) refund(b, c.skill, 0.2);
        }
      }
    },
    {
      id: "matching_suits",
      name: "Масть в масть",
      description: "Если основная цель под меткой, ещё один враг под меткой получает 15% урона прямого попадания по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-ace-accent") return;
          if (!c.proc && getEffect(b.enemy, "mark")) {
            spill(b, c.hpDamage * 0.15, "Масть в масть", u => Boolean(getEffect(u, "mark")));
          }
        }
      }
    }
  ]);

  // Кубки на удачу: излишек тоста становится щитом, промывание ран, темп после восстановления.
  defineSkillMastery("bard-lucky-cups", [
    {
      id: "brimming_toast",
      name: "Тост до краёв",
      description: "Если после тоста у тебя полное здоровье, ты получаешь на 2 хода щит на 3% максимального здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-lucky-cups") return;
          if (b.hero.currentHp >= b.hero.maxHp) ward(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "clean_cup",
      name: "Чистый кубок",
      description: "После тоста ты сокращаешь на 1 ход отравление, а если его нет — рану, мешающую лечению. Эффект с оставшимся 1 ходом снимается.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-lucky-cups") return;
          shorten(b.hero, ["poison", "wound"]);
        }
      }
    },
    {
      id: "light_toast",
      name: "Лёгкий тост",
      description: "Если после лечения кубками у тебя хотя бы 50% здоровья, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-lucky-cups") return;
          if (b.hero.currentHp >= b.hero.maxHp * 0.5) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Смех по рядам: долгие метки, быстрый отклик толпы, слабость одного зрителя по соседству.
  defineSkillMastery("bard-crowd-laughter", [
    {
      id: "lasting_laughter",
      name: "Несмолкающий смех",
      description: "Метки, наложенные этим приёмом, держатся на 1 ход дольше на каждой затронутой цели.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-crowd-laughter") return;
          targets(b, c.skill).forEach(u => extend(u, "mark"));
        }
      }
    },
    {
      id: "audience_pace",
      name: "Отклик зала",
      description: "Если после приёма живы хотя бы два врага под меткой, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-crowd-laughter") return;
          if (livingFoes(b).filter(u => getEffect(u, "mark")).length >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "back_row",
      name: "Задний ряд",
      description: "После приёма ещё один живой враг под меткой получает слабость 12% на 2 хода. Основная цель этим усилением не затрагивается.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-crowd-laughter") return;
          const other = livingFoes(b).find(u => u !== b.enemy && getEffect(u, "mark"));
          if (other) {
            applyEffect(b, other, { id: "weaken", duration: 2, value: 0.12 }, b.hero);
          }
        }
      }
    }
  ]);

  // Фокус с монетой: добавочный возврат за малую карту, защитная монета, рикошет после попадания.
  defineSkillMastery("bard-coin-trick", [
    {
      id: "small_change",
      name: "Мелкая сдача",
      description: "Если в момент прямого попадания у тебя есть карта, кроме туза, после фокуса ты дополнительно возвращаешь 3% максимального дыхания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-coin-trick") return;
          if (!c.proc) {
            s.minor = Boolean(b.mech?.trickster?.card) && b.mech.trickster.card !== "ace";
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-coin-trick") return;
          const minor = s.minor;
          s.minor = false;
          if (minor) procMana(b, 0.03);
        }
      }
    },
    {
      id: "guard_coin",
      name: "Охранная монета",
      description: "Если фокус разыгрывает карту монет, ты получаешь на 2 хода щит на 3% максимального здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-coin-trick") return;
          if (!c.proc) s.coins = b.mech?.trickster?.card === "coins";
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-coin-trick") return;
          const coins = s.coins;
          s.coins = false;
          if (coins) ward(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "coin_skip",
      name: "Прыжок монеты",
      description: "После каждого прямого попадания ещё один враг получает 15% его урона по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-coin-trick") return;
          if (!c.proc) spill(b, c.hpDamage * 0.15, "Прыжок монеты");
        }
      }
    }
  ]);

  // Погребальная песнь: долгий недуг любой формы, дыхание за добивание, тихий ответ проклятой цели.
  defineSkillMastery("bard-dirge", [
    {
      id: "long_procession",
      name: "Долгая процессия",
      description: "Слабость песни держится на 1 ход дольше. Если форма заменяет её порчей, ты продлеваешь порчу вместо слабости.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-dirge") return;
          const id = (c.skill.appliedEffects || []).some(e => e.id === "weaken")
            ? "weaken" : "corruption";
          targets(b, c.skill).forEach(u => extend(u, id));
        }
      }
    },
    {
      id: "funeral_due",
      name: "Последняя дань",
      description: "Если прямое попадание песни убивает врага, ты возвращаешь до 20% цены навыка дыханием.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-dirge") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-dirge") return;
          const kill = s.kill;
          s.kill = false;
          if (kill) refund(b, c.skill, 0.2);
        }
      }
    },
    {
      id: "quiet_answer",
      name: "Тихий ответ",
      description: "До твоего следующего хода первый удар врага под слабостью или порчей этой песни наносит на 15% меньше урона. Усиление расходуется один раз на весь приём.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-dirge") return;
          const ids = (c.skill.appliedEffects || [])
            .map(e => e.id)
            .filter(id => ["weaken", "corruption"].includes(id));
          s.foes = targets(b, c.skill).map(u => ({
            unit: u,
            effects: ids.map(id => getEffect(u, id)).filter(Boolean)
          }));
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || !s.foes?.some(x =>
            x.unit === b.enemy &&
            x.effects.some(e => e.duration > 0 && (x.unit.effects || []).includes(e))
          )) return;
          s.armed = false;
          c.amount *= 0.85;
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    }
  ]);

  // Полная чаша: запас сверх краёв, добавочный вес накопленного лечения, защитный обод чаши.
  defineSkillMastery("bard-full-cup", [
    {
      id: "over_the_rim",
      name: "Через край",
      description: "Если после приёма у тебя полное здоровье, запас избытка получает ещё 15% силы лечения чаши, но не больше 3% максимального здоровья. Предел избытка остаётся 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-full-cup") return;
          if (b.hero.currentHp >= b.hero.maxHp) {
            bumpGauge(
              b,
              "cantor",
              Math.min(getSkillSelfHealAmount(c.skill, b.hero) * 0.15, b.hero.maxHp * 0.03),
              Math.round(b.hero.maxHp * 0.6)
            );
          }
        }
      }
    },
    {
      id: "heavy_cup",
      name: "Тяжёлая чаша",
      description: "Если перед прямым попаданием есть избыток, к удару добавляется 15% запаса, но не больше 30% магического урона. Дополнение не расходует запас.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-full-cup") return;
          if (!c.proc && reserve(b) > 0) {
            c.flat += Math.min(reserve(b) * 0.15, b.hero.skillDamage * 0.3);
          }
        }
      }
    },
    {
      id: "cup_rim",
      name: "Обод чаши",
      description: "Если после приёма избыток составляет хотя бы 15% максимального здоровья, ты получаешь на 2 хода щит на 3% здоровья. Общий щит ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-full-cup") return;
          if (reserve(b) >= b.hero.maxHp * 0.15) ward(b, b.hero.maxHp * 0.03);
        }
      }
    }
  ]);

  // Перелить чашу: усиление только переливаемой доли, брызги по соседу, возврат за добивание с запасом.
  defineSkillMastery("bard-pour-cup", [
    {
      id: "full_stream",
      name: "Полная струя",
      description: "Добавочный урон от переливаемого избытка растёт на 15%. Ты расходуешь прежнюю половину запаса.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          if (!c.proc && reserve(b) > 0) c.flat += reserve(b) * 0.5 * 0.15;
        }
      }
    },
    {
      id: "cup_splash",
      name: "Брызги чаши",
      description: "Если перед прямым попаданием есть избыток, ещё один враг получает 15% урона этого попадания по здоровью, без учёта защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          if (!c.proc) s.filled = reserve(b) > 0;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          if (!c.proc && s.filled) spill(b, c.hpDamage * 0.15, "Брызги чаши");
        }
      }
    },
    {
      id: "paid_pour",
      name: "Оплаченный перелив",
      description: "Если прямое попадание с избытком убивает врага, ты возвращаешь до 20% цены навыка дыханием.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          if (!c.proc) s.filled = reserve(b) > 0;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          if (!c.proc && s.filled && c.hpDamage > 0 &&
              b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-pour-cup") return;
          const kill = s.kill;
          s.kill = false;
          s.filled = false;
          if (kill) refund(b, c.skill, 0.2);
        }
      }
    }
  ]);

  // Псалом запаса: длительность щита, перевязка мешающих лечению ран, прикрытие от тяжёлого удара.
  defineSkillMastery("bard-reserve-psalm", [
    {
      id: "long_cover",
      name: "Долгий покров",
      description: "Если после псалма на тебе есть щит, он держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-reserve-psalm") return;
          extend(b.hero, "shield");
        }
      }
    },
    {
      id: "binding_psalm",
      name: "Псалом перевязки",
      description: "После псалма ты сокращаешь на 1 ход рану, мешающую лечению, а если её нет — отравление. Эффект с оставшимся 1 ходом снимается.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-reserve-psalm") return;
          shorten(b.hero, ["wound", "poison"]);
        }
      }
    },
    {
      id: "heavy_cover",
      name: "Покров под ударом",
      description: "До твоего следующего хода первый тяжёлый удар наносит на 20% меньше урона, пока сохраняется щит псалма.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-reserve-psalm") return;
          s.shield = getEffect(b.hero, "shield");
          s.armed = Boolean(s.shield);
        },
        incoming(b, s, c) {
          if (!s.armed || !c.heavy ||
              getEffect(b.hero, "shield") !== s.shield ||
              s.shield.value <= 0 || s.shield.duration <= 0) return;
          s.armed = false;
          c.amount *= 0.8;
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    }
  ]);

  // Хорал: длительность покрова, малая доля возвращённого избытка, отражение в ещё одной цели.
  defineSkillMastery("bard-chorale", [
    {
      id: "sounding_cover",
      name: "Звучащий покров",
      description: "Щит, оставшийся после хорала, держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-chorale") return;
          extend(b.hero, "shield");
        }
      }
    },
    {
      id: "cup_echo",
      name: "Отзвук чаши",
      description: "После хорала ты возвращаешь в избыток 15% запаса, вложенного в прямой удар. Предел избытка остаётся 60% максимального здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-chorale") return;
          if (!c.proc) s.back = (s.back || 0) + Math.max(0, c.flat) / 1.2 * 0.15;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-chorale") return;
          const back = s.back || 0;
          s.back = 0;
          bumpGauge(b, "cantor", back, Math.round(b.hero.maxHp * 0.6));
        }
      }
    },
    {
      id: "chorale_reflection",
      name: "Отражение хорала",
      description: "Ещё один враг получает 15% урона прямого попадания хорала по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-chorale") return;
          if (!c.proc) spill(b, c.hpDamage * 0.15, "Отражение хорала");
        }
      }
    }
  ]);

  // Неотпетая нота: длительная порча, накопление от её тиков, вскрытие уже звучащей порчи.
  defineSkillMastery("bard-unsung-note", [
    {
      id: "unending_note",
      name: "Незатихшая нота",
      description: "Порча, оставленная этой нотой, держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-unsung-note") return;
          targets(b, c.skill).forEach(u => extend(u, "corruption"));
        }
      }
    },
    {
      id: "dark_reserve",
      name: "Тёмный запас",
      description: "Ты копишь избыток в размере 15% урона по здоровью от порчи этой ноты, всего до 3% максимального здоровья за применение. Предел избытка остаётся 60%; обновление порчи другим навыком прекращает накопление.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-unsung-note") return;
          s.target = b.enemy;
          s.effect = b.enemy.currentHp > 0 ? getEffect(b.enemy, "corruption") : null;
          s.meta = s.effect?.meta;
          s.left = b.hero.maxHp * 0.03;
        },
        tick(b, s, c) {
          if (c.id !== "corruption" || !s.effect ||
              b.enemy !== s.target || s.left <= 0) return;
          if (getEffect(s.target, "corruption") !== s.effect ||
              s.effect.meta !== s.meta || s.effect.duration <= 0) return;
          const gain = Math.min(s.left, Math.max(0, c.amount) * 0.15);
          s.left -= gain;
          bumpGauge(b, "cantor", gain, Math.round(b.hero.maxHp * 0.6));
        }
      }
    },
    {
      id: "reopened_note",
      name: "Вскрытый обертон",
      description: "Если до прямого попадания на цели уже есть порча, удар ноты бьёт на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-unsung-note") return;
          if (!c.proc && getEffect(b.enemy, "corruption")) c.mult *= 1.15;
        }
      }
    }
  ]);

  // Эхо хора: один долгий дебют за бой, запас здоровья призыва, сила при поддержке другого духа.
  defineSkillMastery("bard-echo-choir", [
    {
      id: "long_debut",
      name: "Долгий дебют",
      description: "Первый дух, призванный этим навыком за бой, живёт на 1 ход дольше. Это работает и с целителем формы.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-echo-choir") return;
          if (s.used) return;
          const u = newestSpirit(b, c.skill);
          if (!u) return;
          s.used = true;
          u.duration += 1;
        }
      }
    },
    {
      id: "strong_voice",
      name: "Крепкий голос",
      description: "У призванного этим навыком духа на 20% больше максимального и начального здоровья. Это работает и с целителем формы.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-echo-choir") return;
          const u = newestSpirit(b, c.skill);
          if (!u) return;
          const extra = Math.round(u.maxHp * 0.2);
          u.maxHp += extra;
          u.hp += extra;
        }
      }
    },
    {
      id: "welcoming_choir",
      name: "Подхват хора",
      description: "Если после призыва рядом есть другой живой дух, сила действий нового духа растёт на 15%. Это работает и с целителем формы.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-echo-choir") return;
          const u = newestSpirit(b, c.skill);
          if (u && spirits(b).some(other => other !== u)) {
            u.power = Math.round(u.power * 1.15);
          }
        }
      }
    }
  ]);

  // Вступление солиста: пробивание при пустом хоре, восстановление партнёра, компенсация полного зала.
  defineSkillMastery("bard-solo-entry", [
    {
      id: "clear_entry",
      name: "Чистый вход",
      description: "Если до прямого попадания у тебя нет живых голосов хора, удар пробивает ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-solo-entry") return;
          if (!c.proc && voices(b).length === 0) c.pierce += 0.25;
        }
      }
    },
    {
      id: "partners_breath",
      name: "Дыхание партнёра",
      description: "После вступления ты восстанавливаешь самому раненому живому голосу 25% его максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-solo-entry") return;
          repair(b, 0.25);
        }
      }
    },
    {
      id: "full_house",
      name: "Полный зал",
      description: "Если при ударе все места призыва заняты и новый голос не появился, ты возвращаешь до 20% цены навыка дыханием.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-solo-entry") return;
          if (c.proc || s.units) return;
          s.units = [...(b.hero.summonedUnits || [])];
          s.full = s.units.length >= getSummonLimit(b.hero);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-solo-entry") return;
          const blocked = s.full && s.units &&
            !(b.hero.summonedUnits || []).some(u => !s.units.includes(u));
          s.units = null;
          s.full = false;
          if (blocked) refund(b, c.skill, 0.2);
        }
      }
    }
  ]);

  // Держать ноту: дополнительный срок старейшему голосу, восстановление хора, темп полного созвучия.
  defineSkillMastery("bard-hold-note", [
    {
      id: "held_breath",
      name: "Долгое дыхание",
      description: "После обычного продления самый старый живой голос получает ещё 1 ход жизни, но не больше 7 оставшихся ходов.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-hold-note") return;
          const u = voices(b)[0];
          if (u && u.duration < 7) u.duration = Math.min(7, u.duration + 1);
        }
      }
    },
    {
      id: "mended_choir",
      name: "Сбережённый хор",
      description: "После приёма ты восстанавливаешь каждому живому голосу 15% его максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-hold-note") return;
          voices(b).forEach(u => {
            u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.15));
          });
        }
      }
    },
    {
      id: "steady_chord",
      name: "Согласный строй",
      description: "Если после приёма у тебя хотя бы три живых голоса, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-hold-note") return;
          if (voices(b).length >= 3) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Отпустить солиста: усиление последнего выхода, щит из прощального голоса, передача срока партнёру.
  defineSkillMastery("bard-dismiss-soloist", [
    {
      id: "last_bow",
      name: "Последний поклон",
      description: "Если у самого старого голоса осталось не больше 2 ходов, к прямому удару добавляется ещё 50% силы этого голоса.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-dismiss-soloist") return;
          const u = voices(b)[0];
          if (!c.proc && u && u.duration <= 2) c.flat += u.power * 0.5;
        }
      }
    },
    {
      id: "farewell_cover",
      name: "Прощальный покров",
      description: "Если приём расходует голос, ты получаешь на 2 хода щит в размере 60% его силы. Общий щит ограничен 60% твоего максимального здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-dismiss-soloist") return;
          if (!c.proc && !s.voice) s.voice = voices(b)[0] || null;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-dismiss-soloist") return;
          const u = s.voice;
          s.voice = null;
          if (u && !(b.hero.summonedUnits || []).includes(u)) ward(b, u.power * 0.6);
        }
      }
    },
    {
      id: "passed_phrase",
      name: "Переданная фраза",
      description: "Если приём расходует голос, самый старый из оставшихся голосов живёт на 1 ход дольше, но не больше 6 оставшихся ходов.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-dismiss-soloist") return;
          if (!c.proc && !s.voice) s.voice = voices(b)[0] || null;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-dismiss-soloist") return;
          const spent = s.voice;
          s.voice = null;
          const u = voices(b)[0];
          if (spent && !(b.hero.summonedUnits || []).includes(spent) &&
              u && u.duration < 6) u.duration = Math.min(6, u.duration + 1);
        }
      }
    }
  ]);

  // Кульминация: вес израсходованных голосов, удар отражением, щит после финального звучания.
  defineSkillMastery("bard-culmination", [
    {
      id: "gathered_chord",
      name: "Собранный аккорд",
      description: "Добавочный урон кульминации от израсходованных голосов растёт на 15%. Базовая сила удара не меняется.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-culmination") return;
          if (!c.proc && c.flat > 0) c.flat *= 1.15;
        }
      }
    },
    {
      id: "final_reflection",
      name: "Отблеск финала",
      description: "Ещё один враг получает 15% урона прямого попадания кульминации по здоровью, без учёта защиты.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "bard-culmination") return;
          if (!c.proc) spill(b, c.hpDamage * 0.15, "Отблеск финала");
        }
      }
    },
    {
      id: "curtain_light",
      name: "Свет занавеса",
      description: "После кульминации ты получаешь на 2 хода щит в размере 24% добавочного урона от голосов. Общий щит ограничен 60% твоего максимального здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-culmination") return;
          if (!c.proc) s.cover = (s.cover || 0) + Math.max(0, c.flat) * 0.24;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-culmination") return;
          const cover = s.cover || 0;
          s.cover = 0;
          ward(b, cover);
        }
      }
    }
  ]);

  // Хор по кругу: пробивание полного хора, восстановление участника, дыхание за охват толпы.
  defineSkillMastery("bard-choir-circle", [
    {
      id: "closed_formation",
      name: "Замкнутый строй",
      description: "Если перед прямым попаданием у тебя хотя бы три живых голоса, оно пробивает ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "bard-choir-circle") return;
          if (!c.proc && voices(b).length >= 3) c.pierce += 0.2;
        }
      }
    },
    {
      id: "support_circle",
      name: "Круг поддержки",
      description: "После кругового приёма ты восстанавливаешь самому раненому живому голосу 25% его максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-choir-circle") return;
          repair(b, 0.25);
        }
      }
    },
    {
      id: "shared_breath",
      name: "Передача дыхания",
      description: "Если после приёма у тебя хотя бы два живых голоса и живы хотя бы два врага, ты возвращаешь до 20% цены навыка дыханием.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "bard-choir-circle") return;
          if (voices(b).length >= 2 && livingFoes(b).length >= 2) refund(b, c.skill, 0.2);
        }
      }
    }
  ]);
})();

