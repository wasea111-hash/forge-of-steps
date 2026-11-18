// Mastery of the archer skills: at level V each skill offers three upgrades of its own (designed with Codex).
(() => {
  const range = b => Number(b.mech?.core_archer?.value || 0);
  const focus = b => Number(b.mech?.marksman?.value || 0);
  const direct = c => c.kind === "physical" && !c.proc;
  const watched = ["poison", "bleed", "slow", "mark", "armor_break", "blind", "silence", "stagger"];

  // Снимки принадлежат состоянию выбранного мастерства, отдельно на каждый бой.
  const observe = (b, s, c) => {
    if (!direct(c)) return null;
    if (!s.shot) s.shot = {
      range: range(b),
      focus: focus(b),
      target: b.enemy,
      turnReady: Boolean(b.fxList?.find(e => e.def.id === "tree-archer-turn-shot")?.state.ready),
      targets: new Map()
    };
    if (!s.shot.targets.has(b.enemy)) {
      const old = {};
      watched.forEach(id => {
        const e = getEffect(b.enemy, id);
        if (e) old[id] = { value: e.value, duration: e.duration };
      });
      s.shot.targets.set(b.enemy, {
        foe: b.enemy,
        old,
        debuffs: countEnemyDebuffs(b.enemy),
        winding: Boolean(b.enemy.charge),
        hits: 0,
        damage: 0,
        crit: false,
        killed: false,
        hpBefore: b.enemy.currentHp
      });
    }
    const row = s.shot.targets.get(b.enemy);
    if (!("hpDamage" in c)) row.hpBefore = b.enemy.currentHp;
    return row;
  };
  const record = (b, s, c) => {
    const row = observe(b, s, c);
    if (!row) return;
    row.hits += 1;
    row.damage += Math.max(0, c.hpDamage || 0);
    row.crit ||= Boolean(c.crit);
    row.killed ||= c.hpDamage > 0 && c.hpDamage >= row.hpBefore;
  };
  const finish = s => {
    const shot = s.shot || {
      range: null, focus: 0, target: null, turnReady: false, targets: new Map()
    };
    delete s.shot;
    shot.landed = [...shot.targets.values()].filter(row => row.hits > 0);
    return shot;
  };
  const at = (b, foe, run) => {
    if (!foe || foe.currentHp <= 0) return;
    const saved = b.enemy;
    try {
      b.enemy = foe;
      return run();
    } finally {
      b.enemy = saved;
    }
  };
  const other = (b, foe) => livingFoes(b).find(entry => entry !== foe);
  const put = (b, foe, id, duration, value) =>
    at(b, foe, () => fx(b, id, duration, value));
  const extend = (b, foe, id, cap) => {
    const e = getEffect(foe, id);
    if (!e || !Number.isFinite(e.duration) || tm(b.hero, "perma:" + id)) return;
    e.duration = Math.max(e.duration, Math.min(cap, e.duration + 1));
  };
  const refund = (b, amount) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + amount);
    if (b.hero.currentMana > before) {
      emit(b, "mana", { target: "hero", amount: b.hero.currentMana - before });
    }
  };
  const shield = (b, ratio) => {
    const cap = Math.round(b.hero.maxHp * 0.6);
    const amount = Math.round(b.hero.maxHp * ratio);
    const old = getEffect(b.hero, "shield");
    if (old) {
      old.value = Math.max(old.value, Math.min(cap, old.value + amount));
      old.duration = Math.max(old.duration, 3);
    } else {
      const e = fx(b, "shield", 3, amount, { self: true });
      if (e) e.value = Math.min(cap, e.value);
    }
  };
  // Выплаты сохраняют щиты и предел урона босса, не вызывают afterHit и Шквал.
  const pay = (b, foe, amount, label, element = "steel") =>
    at(b, foe, () => procDamage(b, amount, label, element));
  const moved = (b, shot) => shot.range !== null && range(b) > shot.range;
  const armHeavy = (b, s, rows, effect) => {
    s.foes = new Set(rows
      .filter(r => r.foe.currentHp > 0 && getEffect(r.foe, effect))
      .map(r => r.foe));
    s.ready = s.foes.size > 0;
  };
  const woundPower = row =>
    Math.max(Number(row.old.bleed?.value || 0), effectValue(row.foe, "bleed"));

  // Пробивной выстрел: трещина в броне, выдержка за дальнее попадание, сквозной след на второй цели.
  defineSkillMastery("archer-piercing-shot", [
    { id: "crack", name: "По трещине", description: "По цели под надломом брони твой пробивной выстрел наносит на 18% больше прямого урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; if (direct(c) && getEffect(b.enemy, "armor_break")) c.mult *= 1.18; }
    } },
    { id: "exhale", name: "Дальний выдох", description: "Если попадаешь с дистанции 2–3, возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; const q = finish(s); if (q.range >= 2 && q.landed.length) refund(b, 3); }
    } },
    { id: "trace", name: "Сквозной след", description: "Попадания по выбранной цели наносят ещё одному врагу урон мимо брони: 18% их прямого урона, не более 35% твоего физического урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-piercing-shot") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r) pay(b, other(b, r.foe), Math.min(r.damage * 0.18, b.hero.physicalDamage * 0.35), "Сквозной след"); }
    } }
  ]);

  // Быстрый залп: темп реального отхода, стрела под ноги, защита от погони.
  defineSkillMastery("archer-swift-volley", [
    { id: "step", name: "Лёгкая поступь", description: "Если залп увеличивает дистанцию, ты тратишь на это действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-swift-volley") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-swift-volley") return; if (moved(b, finish(s))) c.tempo *= 0.85; }
    } },
    { id: "heel", name: "Стрела у пятки", description: "Попадания залпа замедляют врагов на 12% на 1 ход.", addEffects: [{ id: "slow", duration: 1, value: 0.12 }] },
    { id: "escape", name: "Пустой захват", description: "После увеличения дистанции залпом первое физическое попадание по тебе до твоего следующего хода наносит на 18% меньше урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-swift-volley") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-swift-volley") return; s.ready = moved(b, finish(s)); },
      incoming(b, s, c) { if (!s.ready || c.parried || c.kind !== "physical" || c.amount <= 0) return; s.ready = false; c.amount *= 0.82; },
      turnStart(b, s) { s.ready = false; }
    } }
  ]);

  // Смазанный наконечник: повторная доза, яд в упор, липкий след отравления.
  defineSkillMastery("archer-tipped-arrow", [
    { id: "dose", name: "Вторая доза", description: "Если до попадания на цели уже был яд, ты продлеваешь оставшийся яд на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; finish(s).landed.forEach(r => { if (r.old.poison) extend(b, r.foe, "poison", 5); }); }
    } },
    { id: "point", name: "Яд в упор", description: "Вплотную к уже отравленной цели твой смазанный наконечник наносит на 18% больше прямого урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; if (direct(c) && range(b) === 0 && getEffect(b.enemy, "poison")) c.mult *= 1.18; }
    } },
    { id: "sticky", name: "Липкий след", description: "Если после попадания на цели есть яд, ты дополнительно замедляешь её на 15% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-tipped-arrow") return; finish(s).landed.forEach(r => { if (getEffect(r.foe, "poison")) put(b, r.foe, "slow", 2, 0.15); }); }
    } }
  ]);

  // Пришпилить сапог: долгие путы, быстрый повтор по связанному врагу, защита от тяжёлого ответа.
  defineSkillMastery("archer-pin-boot", [
    { id: "nail", name: "Гвоздь в землю", description: "После попадания ты продлеваешь замедление цели на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; finish(s).landed.forEach(r => extend(b, r.foe, "slow", 5)); }
    } },
    { id: "measure", name: "Выверенный шаг", description: "Попав по цели, которая уже была замедлена, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; if (finish(s).landed.some(r => r.old.slow)) c.tempo *= 0.85; }
    } },
    { id: "reach", name: "Не дотянуться", description: "До твоего следующего хода первый тяжёлый удар поражённой цели наносит на 20% меньше урона, если на ней ещё есть замедление.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-pin-boot") return; armHeavy(b, s, finish(s).landed, "slow"); },
      incoming(b, s, c) { if (!s.ready || !s.foes?.has(b.enemy) || !getEffect(b.enemy, "slow") || !c.heavy || c.parried || c.amount <= 0) return; s.ready = false; c.amount *= 0.8; },
      turnStart(b, s) { s.ready = false; }
    } }
  ]);

  // Стрела вдогон: добивание связанной добычи, возврат стрелы, замедление за потраченную дистанцию.
  defineSkillMastery("archer-pursuit-shot", [
    { id: "heels", name: "По пятам", description: "Если у тебя есть дистанция, выстрел по замедленной цели наносит на 18% больше прямого урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; if (direct(c) && range(b) > 0 && getEffect(b.enemy, "slow")) c.mult *= 1.18; }
    } },
    { id: "retrieve", name: "Забрать стрелу", description: "Если прямое попадание этого навыка убивает врага, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; if (finish(s).landed.some(r => r.killed)) refund(b, 3); }
    } },
    { id: "shortcut", name: "Срез пути", description: "Если выстрел потратил ступень дистанции и попал, ты замедляешь поражённую цель на 20% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-pursuit-shot") return; const q = finish(s); if (q.range > range(b)) q.landed.forEach(r => put(b, r.foe, "slow", 2, 0.2)); }
    } }
  ]);

  // Косой веер: расшатать группу, выиграть темп охватом, собрать веер против одиночки.
  defineSkillMastery("archer-slant-fan", [
    { id: "formation", name: "Подрезанный строй", description: "Если веер попал хотя бы по 2 врагам, ты ошеломляешь поражённых на 12% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; const q = finish(s); if (q.landed.length >= 2) q.landed.forEach(r => put(b, r.foe, "stagger", 2, 0.12)); }
    } },
    { id: "gap", name: "Чистый просвет", description: "Если веер попал хотя бы по 2 врагам, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; if (finish(s).landed.length >= 2) c.tempo *= 0.85; }
    } },
    { id: "alone", name: "Одинокий край", description: "Против единственного живого врага на дистанции 0–1 ты собираешь веер: прямой урон выше на 18%.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-slant-fan") return; if (direct(c) && range(b) <= 1 && livingFoes(b).length === 1) c.mult *= 1.18; }
    } }
  ]);

  // Длинная тетива: натяг по задержанной цели, дальний темп, ослабленный тяжёлый ответ.
  defineSkillMastery("archer-long-string", [
    { id: "brace", name: "Натяг по скобе", description: "По замедленной или ошеломлённой цели твой долгий натяг наносит на 18% больше прямого урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-long-string") return; if (direct(c) && ["slow", "stagger"].some(id => getEffect(b.enemy, id))) c.mult *= 1.18; }
    } },
    { id: "release", name: "Размеренный выпуск", description: "Если попадаешь с дистанции 2–3, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-long-string") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-long-string") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-long-string") return; const q = finish(s); if (q.range >= 2 && q.landed.length) c.tempo *= 0.85; }
    } },
    { id: "recoil", name: "Отброшенный замах", description: "Попав по врагу во время подготовки заряженного удара, ты ослабляешь его первый тяжёлый ответ до твоего следующего хода на 20%.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-long-string") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-long-string") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-long-string") return; s.foes = new Set(finish(s).landed.filter(r => r.winding).map(r => r.foe)); s.ready = s.foes.size > 0; },
      incoming(b, s, c) { if (!s.ready || !s.foes?.has(b.enemy) || !c.heavy || c.parried || c.amount <= 0) return; s.ready = false; c.amount *= 0.8; },
      turnStart(b, s) { s.ready = false; }
    } }
  ]);

  // Пятиться с боем: пыль после отхода, лёгкий шаг, полезный выстрел на краю дистанции.
  defineSkillMastery("archer-fighting-retreat", [
    { id: "dust", name: "Заслон пылью", description: "Если выстрел увеличивает дистанцию и попадает, ты ослепляешь поражённую цель на 12% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; const q = finish(s); if (moved(b, q)) q.landed.forEach(r => put(b, r.foe, "blind", 2, 12)); }
    } },
    { id: "foot", name: "Свободная пятка", description: "Если выстрел увеличивает дистанцию, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; if (moved(b, finish(s))) c.tempo *= 0.85; }
    } },
    { id: "edge", name: "Край тропы", description: "Если начинаешь выстрел с дистанции 3 и попадаешь, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-fighting-retreat") return; const q = finish(s); if (q.range === 3 && q.landed.length) refund(b, 3); }
    } }
  ]);

  // Стрела с заусенцем: критическое вскрытие, удержание старой раны, выдержка за ближнее кровотечение.
  defineSkillMastery("archer-rough-arrow", [
    { id: "tear", name: "Вскрытый заусенец", description: "После критического попадания ты дополнительно вскрываешь оставшуюся рану на 100% её силы, до 35% твоего физического урона мимо брони. Один раз на цель за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; finish(s).landed.forEach(r => { const e = getEffect(r.foe, "bleed"); if (r.crit && e) pay(b, r.foe, Math.min(e.value, b.hero.physicalDamage * 0.35), "Вскрытый заусенец", "blood"); }); }
    } },
    { id: "lodged", name: "Застрявший край", description: "Если до попадания на цели уже была рана, ты продлеваешь оставшуюся рану на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; finish(s).landed.forEach(r => { if (r.old.bleed) extend(b, r.foe, "bleed", 5); }); }
    } },
    { id: "bloodgrip", name: "Кровавый хват", description: "Попав вплотную и оставив на цели рану, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-rough-arrow") return; const q = finish(s); if (q.range === 0 && q.landed.some(r => r.foe.currentHp > 0 && getEffect(r.foe, "bleed"))) refund(b, 3); }
    } }
  ]);

  // Перехват тетивы: щит при укреплении линии, быстрый перехват, петля на преследователе.
  defineSkillMastery("archer-string-catch", [
    { id: "knot", name: "Узел на тетиве", description: "Увеличив дистанцию этим выстрелом и попав, ты получаешь щит на 3% максимального здоровья на 3 хода. Прибавка не поднимает щит выше 60% максимального здоровья.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; const q = finish(s); if (moved(b, q) && q.landed.length) shield(b, 0.03); }
    } },
    { id: "rhythm", name: "Схваченный ритм", description: "Если перехват увеличивает дистанцию, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; if (moved(b, finish(s))) c.tempo *= 0.85; }
    } },
    { id: "loop", name: "Встречная петля", description: "Увеличив дистанцию этим выстрелом и попав, ты замедляешь поражённую цель на 18% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-string-catch") return; const q = finish(s); if (moved(b, q)) q.landed.forEach(r => put(b, r.foe, "slow", 2, 0.18)); }
    } }
  ]);

  // Сбросить колчан: долговечный щит, запас выдержки на дальней линии, однократный ответ щита.
  defineSkillMastery("archer-shed-quiver", [
    { id: "strap", name: "Затянутый ремень", description: "После сброса колчана ты продлеваешь свой щит на 1 ход, до 5 ходов.", on: {
      afterAction(b, s, c) { if (c.skill?.id !== "archer-shed-quiver") return; extend(b, b.hero, "shield", 5); }
    } },
    { id: "load", name: "Сброшенный груз", description: "Если после сброса колчана дистанция равна 3, ты дополнительно возвращаешь 3% максимальной выдержки.", on: {
      afterAction(b, s, c) { if (c.skill?.id !== "archer-shed-quiver") return; if (range(b) === 3) refund(b, Math.round(b.hero.maxMana * 0.03)); }
    } },
    { id: "rim", name: "Острый край", description: "Первый удар, поглощённый щитом после сброса колчана, возвращает врагу 35% поглощённого урона мимо брони, до 30% твоего физического урона. Один ответ за применение, пока этот щит не исчезнет.", on: {
      afterAction(b, s, c) { if (c.skill?.id !== "archer-shed-quiver") return; s.shield = getEffect(b.hero, "shield"); s.ready = Boolean(s.shield); },
      incoming(b, s, c) { if (!s.ready) return; if (getEffect(b.hero, "shield") !== s.shield) s.ready = false; },
      hurt(b, s, c) { if (!s.ready || c.absorbed <= 0) return; s.ready = false; pay(b, b.enemy, Math.min(c.absorbed * 0.35, b.hero.physicalDamage * 0.3), "Острый край"); }
    } }
  ]);

  // Горькая щепа: долгий осадок, ближняя повторная доза, щепка с ядом для второй цели.
  defineSkillMastery("archer-bitter-splinter", [
    { id: "sediment", name: "Горький осадок", description: "После попадания ты продлеваешь яд цели на 1 ход, до 6 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; finish(s).landed.forEach(r => extend(b, r.foe, "poison", 6)); }
    } },
    { id: "burning", name: "Жгучее сближение", description: "На дистанции 0–1 по уже отравленной цели ты наносишь на 18% больше прямого урона горькой щепой.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; if (direct(c) && range(b) <= 1 && getEffect(b.enemy, "poison")) c.mult *= 1.18; }
    } },
    { id: "chip", name: "Отравленная щепка", description: "Если после попадания на выбранной цели есть яд, ты отравляешь ещё одного врага на 2 хода. Сила новой дозы — 50% силы этого яда, не более 14% твоего физического урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-bitter-splinter") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target), e = r && getEffect(r.foe, "poison"); if (e) put(b, other(b, r.foe), "poison", 2, Math.max(1, Math.round(Math.min(e.value * 0.5, b.hero.physicalDamage * 0.14)))); }
    } }
  ]);

  // Сбить замах: продлить старую немоту, прикрыться от тяжёлого ответа, выиграть темп на зарядке.
  defineSkillMastery("archer-break-windup", [
    { id: "quiet", name: "Тихая связка", description: "Если до попадания цель уже была под немотой, ты продлеваешь оставшуюся немоту на 1 ход, до 4 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; finish(s).landed.forEach(r => { if (r.old.silence) extend(b, r.foe, "silence", 4); }); }
    } },
    { id: "broken", name: "Перебитый размах", description: "До твоего следующего хода первый тяжёлый удар поражённой цели под немотой наносит на 20% меньше урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; armHeavy(b, s, finish(s).landed, "silence"); },
      incoming(b, s, c) { if (!s.ready || !s.foes?.has(b.enemy) || !getEffect(b.enemy, "silence") || !c.heavy || c.parried || c.amount <= 0) return; s.ready = false; c.amount *= 0.8; },
      turnStart(b, s) { s.ready = false; }
    } },
    { id: "beat", name: "Чистый такт", description: "Попав по врагу во время подготовки заряженного удара, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-break-windup") return; if (finish(s).landed.some(r => r.winding)) c.tempo *= 0.85; }
    } }
  ]);

  // Разворот навскидку: пыль, быстрый выпуск и возврат выдержки используют именно заряд отхода.
  defineSkillMastery("archer-turn-shot", [
    { id: "dustturn", name: "Пыльный разворот", description: "Если используешь заряд разворота и попадаешь, ты ослепляешь поражённую цель на 12% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; const q = finish(s); if (q.turnReady) q.landed.forEach(r => put(b, r.foe, "blind", 2, 12)); }
    } },
    { id: "moment", name: "Пойманный миг", description: "Используя заряд разворота, ты тратишь на действие на 15% меньше времени, даже если стрела промахнётся.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; if (finish(s).turnReady) c.tempo *= 0.85; }
    } },
    { id: "trophy", name: "Стрела на память", description: "Если прямое попадание заряженного разворота убивает врага, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-turn-shot") return; const q = finish(s); if (q.turnReady && q.landed.some(r => r.killed)) refund(b, 3); }
    } }
  ]);

  // Подсечь оперением: дольше держать ошеломление, окупить охват, ослабить тяжёлый ответ.
  defineSkillMastery("archer-feather-trip", [
    { id: "weight", name: "Тяжёлое перо", description: "После попадания ты продлеваешь ошеломление цели на 1 ход, до 4 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; finish(s).landed.forEach(r => extend(b, r.foe, "stagger", 4)); }
    } },
    { id: "scatter", name: "Сбитый шаг", description: "Если подсечка попала хотя бы по 2 врагам, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; if (finish(s).landed.length >= 2) refund(b, 3); }
    } },
    { id: "unbalance", name: "Распавшийся замах", description: "До твоего следующего хода первый тяжёлый удар поражённого и ещё ошеломлённого врага наносит на 20% меньше урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-feather-trip") return; armHeavy(b, s, finish(s).landed, "stagger"); },
      incoming(b, s, c) { if (!s.ready || !s.foes?.has(b.enemy) || !getEffect(b.enemy, "stagger") || !c.heavy || c.parried || c.amount <= 0) return; s.ready = false; c.amount *= 0.8; },
      turnStart(b, s) { s.ready = false; }
    } }
  ]);

  // Горизонт тетивы: предельное пробивание, выдержка за добивание, ошеломление после потери линии.
  defineSkillMastery("archer-string-horizon", [
    { id: "light", name: "На просвет", description: "С дистанции 3 ты дополнительно пробиваешь 15% защиты этим выстрелом.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; if (direct(c) && range(b) === 3) c.pierce += 0.15; }
    } },
    { id: "breath", name: "Вернуть дыхание", description: "Если прямое попадание горизонта убивает врага, ты возвращаешь 5 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; if (finish(s).landed.some(r => r.killed)) refund(b, 5); }
    } },
    { id: "hum", name: "Гул тетивы", description: "Если выстрел потратил 2 ступени дистанции и попал, ты ошеломляешь поражённую цель на 15% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-string-horizon") return; const q = finish(s); if (q.range !== null && q.range - range(b) >= 2) q.landed.forEach(r => put(b, r.foe, "stagger", 2, 0.15)); }
    } }
  ]);

  // Три шага назад: награда за три попадания, быстрый выход из ближнего боя, замедление погони.
  defineSkillMastery("archer-three-steps", [
    { id: "third", name: "Третий след", description: "Если хотя бы 3 стрелы попали в выбранную цель, ты наносишь ей ещё 18% их прямого урона мимо брони, до 40% твоего физического урона. Один раз за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r?.hits >= 3) pay(b, r.foe, Math.min(r.damage * 0.18, b.hero.physicalDamage * 0.4), "Третий след"); }
    } },
    { id: "brokenrhythm", name: "Рваный ритм", description: "Если начинаешь серию с дистанции 0–1 и увеличиваешь её, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; const q = finish(s); if (q.range <= 1 && moved(b, q)) c.tempo *= 0.85; }
    } },
    { id: "chase", name: "Закрыть погоню", description: "Если серия увеличивает дистанцию, ты замедляешь поражённых врагов на 18% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-three-steps") return; const q = finish(s); if (moved(b, q)) q.landed.forEach(r => put(b, r.foe, "slow", 2, 0.18)); }
    } }
  ]);

  // Колючее кольцо: удержать яд в ранах, окупить отравленную группу, задержать выход из загона.
  defineSkillMastery("archer-thorn-circle", [
    { id: "living", name: "Живые колючки", description: "После попадания по цели с раной ты продлеваешь её оставшийся яд на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; finish(s).landed.forEach(r => { if (getEffect(r.foe, "bleed")) extend(b, r.foe, "poison", 5); }); }
    } },
    { id: "pen", name: "Широкий загон", description: "Если после попаданий кольца хотя бы 2 поражённых врага живы и отравлены, ты возвращаешь 4 выдержки.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-thorn-circle") return; if (finish(s).landed.filter(r => r.foe.currentHp > 0 && getEffect(r.foe, "poison")).length >= 2) refund(b, 4); }
    } },
    { id: "bramble", name: "Колючая кромка", description: "Попадания колючего кольца дополнительно замедляют врагов на 12% на 2 хода.", addEffects: [{ id: "slow", duration: 2, value: 0.12 }] }
  ]);

  // Прицельный выстрел: удержать сосредоточение после раны, пробить подготовленную цель, ускориться после крита.
  defineSkillMastery("archer-aimed-shot", [
    { id: "steady", name: "Не дрогнуть", description: "Попав и закончив выстрел хотя бы с 3 сосредоточения, ты защищаешь 1 его единицу от первой раны до твоего следующего хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; s.ready = finish(s).landed.length > 0 && focus(b) >= 3; },
      incoming(b, s, c) { if (!s.ready || c.parried || c.amount <= 0) return; s.saved = focus(b); },
      hurt(b, s, c) { if (!s.ready || c.hpDamage <= 0) return; s.ready = false; bumpGauge(b, "marksman", Math.min(1, Math.max(0, Number(s.saved || 0) - focus(b))), 5); },
      turnStart(b, s) { s.ready = false; }
    } },
    { id: "seam", name: "Шов мишени", description: "При 3 и более сосредоточения ты дополнительно пробиваешь 15% защиты замедленной цели или цели под надломом брони.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; if (direct(c) && focus(b) >= 3 && ["slow", "armor_break"].some(id => getEffect(b.enemy, id))) c.pierce += 0.15; }
    } },
    { id: "precise", name: "Точный выход", description: "Если начинаешь выстрел хотя бы с 3 сосредоточения и наносишь критическое попадание, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-aimed-shot") return; const q = finish(s); if (q.focus >= 3 && q.landed.some(r => r.crit)) c.tempo *= 0.85; }
    } }
  ]);

  // Срезать ремень: раскрыть старый надлом, собрать прицел на знакомом шве, задеть чужую пряжку.
  defineSkillMastery("archer-cut-strap", [
    { id: "ripped", name: "Распоротый ремень", description: "Попав по уже надломленной броне, ты усиливаешь оставшийся надлом на 5 процентных пунктов, до 50%, и продлеваешь его на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; finish(s).landed.forEach(r => { const e = getEffect(r.foe, "armor_break"); if (!r.old.armor_break || !e) return; e.value = Math.max(e.value, Math.min(0.5, e.value + 0.05)); extend(b, r.foe, "armor_break", 5); }); }
    } },
    { id: "buckle", name: "Ловкая пряжка", description: "Попав по цели, которая уже была под надломом брони, ты получаешь ещё 1 сосредоточение за применение, до обычного предела 5.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; if (finish(s).landed.some(r => r.old.armor_break)) bumpGauge(b, "marksman", 1, 5); }
    } },
    { id: "plate", name: "Слетевшая пластина", description: "Если после попадания выбранная цель под надломом брони, ты надламываешь броню ещё одного врага на 10% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cut-strap") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r && getEffect(r.foe, "armor_break")) put(b, other(b, r.foe), "armor_break", 2, 0.1); }
    } }
  ]);

  // Закрыть линию: ослепление при отходе, темп сохранённого прицела, щит у предела дистанции.
  defineSkillMastery("archer-close-line", [
    { id: "screen", name: "Дальний заслон", description: "Если выстрел увеличил дистанцию и попал, ты ослепляешь поражённую цель на 12% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-close-line") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-close-line") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-close-line") return; const q = finish(s); if (moved(b, q)) q.landed.forEach(r => put(b, r.foe, "blind", 2, 12)); }
    } },
    { id: "passage", name: "Тихий проход", description: "Если сохранённый прицел позволяет увеличить дистанцию этим навыком, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-close-line") return; observe(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-close-line") return; if (moved(b, finish(s))) c.tempo *= 0.85; }
    } },
    { id: "full", name: "Полная линия", description: "Начав выстрел с дистанции 3 и хотя бы с 2 сосредоточения, при попадании ты получаешь щит на 3,5% максимального здоровья на 3 хода. Прибавка не поднимает щит выше 60% максимального здоровья.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-close-line") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-close-line") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-close-line") return; const q = finish(s); if (q.range === 3 && q.focus >= 2 && q.landed.length) shield(b, 0.035); }
    } }
  ]);

  // Продать прицел: вернуть единицу за крит, пробить трещину вложенным прицелом, оставить рисунок цели.
  defineSkillMastery("archer-sell-focus", [
    { id: "shard", name: "Осколок прицела", description: "Вложив 2 сосредоточения и нанеся критическое попадание, ты возвращаешь 1 сосредоточение за применение, до предела 5.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; const q = finish(s); if (q.focus >= 2 && q.landed.some(r => r.crit)) bumpGauge(b, "marksman", 1, 5); }
    } },
    { id: "payment", name: "Плата трещиной", description: "Вложив хотя бы 1 сосредоточение, ты наносишь на 18% больше прямого урона цели под надломом брони.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; if (direct(c) && focus(b) >= 1 && getEffect(b.enemy, "armor_break")) c.mult *= 1.18; }
    } },
    { id: "pattern", name: "Остаточный рисунок", description: "Вложив 2 сосредоточения и попав, ты оставляешь на поражённой цели метку 12% на 2 хода.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-sell-focus") return; const q = finish(s); if (q.focus >= 2) q.landed.forEach(r => put(b, r.foe, "mark", 2, 0.12)); }
    } }
  ]);

  // Поправить хват: плотнее щит, быстрее собрать потерянный прицел, получить сосредоточение от защиты.
  defineSkillMastery("archer-reset-grip", [
    { id: "firm", name: "Плотный хват", description: "После поправки хвата ты добавляешь к оставшемуся щиту 2% максимального здоровья. Прибавка не поднимает щит выше 60% максимального здоровья.", on: {
      afterAction(b, s, c) { if (c.skill?.id !== "archer-reset-grip") return; if (getEffect(b.hero, "shield")) shield(b, 0.02); }
    } },
    { id: "collected", name: "Собранный выдох", description: "Если начинаешь выстрел с 0–1 сосредоточения и попадаешь, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-reset-grip") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-reset-grip") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-reset-grip") return; const q = finish(s); if (q.focus <= 1 && q.landed.length) c.tempo *= 0.85; }
    } },
    { id: "safety", name: "Страховочная петля", description: "Первое поглощение урона щитом после поправки хвата даёт тебе 1 сосредоточение, до предела 5. Один раз за применение, пока этот щит не исчезнет.", on: {
      afterAction(b, s, c) { if (c.skill?.id !== "archer-reset-grip") return; s.shield = getEffect(b.hero, "shield"); s.ready = Boolean(s.shield); },
      incoming(b, s, c) { if (!s.ready) return; if (getEffect(b.hero, "shield") !== s.shield) s.ready = false; },
      hurt(b, s, c) { if (!s.ready || c.absorbed <= 0) return; s.ready = false; if (b.hero.currentHp > 0) bumpGauge(b, "marksman", 1, 5); }
    } }
  ]);

  // Отстрел по краям: сила боковых попаданий, сосредоточение за охват, метки на краях группы.
  defineSkillMastery("archer-edge-shots", [
    { id: "rim", name: "Край кольца", description: "При 2 и более сосредоточения ты наносишь на 20% больше прямого урона дополнительным целям отстрела.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; if (direct(c) && focus(b) >= 2 && b.focus != null && b.enemy.slot !== b.focus) c.mult *= 1.2; }
    } },
    { id: "center", name: "Неподвижный центр", description: "Попав хотя бы по 2 врагам, ты получаешь 1 сосредоточение за применение, до предела 5.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; if (finish(s).landed.length >= 2) bumpGauge(b, "marksman", 1, 5); }
    } },
    { id: "outlined", name: "Намеченные края", description: "Начав отстрел хотя бы с 3 сосредоточения, ты оставляешь метку 10% на 2 хода на поражённых дополнительных целях.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-edge-shots") return; const q = finish(s); if (q.focus >= 3) q.landed.filter(r => r.foe !== q.target).forEach(r => put(b, r.foe, "mark", 2, 0.1)); }
    } }
  ]);

  // Зазубренная стрела: использовать оставшуюся или выдернутую рану, окупить задержку, ранить вторую цель.
  defineSkillMastery("archer-barbed-arrow", [
    { id: "tooth", name: "Ответный зубец", description: "После попадания ты наносишь ещё 125% силы раны мимо брони, до 40% твоего физического урона, один раз на цель за применение. Берётся более сильная рана: до стрелы или после неё, даже если форма выдернула стрелу.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; finish(s).landed.forEach(r => { const value = woundPower(r); if (value > 0) pay(b, r.foe, Math.min(value * 1.25, b.hero.physicalDamage * 0.4), "Ответный зубец", "blood"); }); }
    } },
    { id: "caught", name: "Пойманная добыча", description: "Попав по цели, которая уже была замедлена, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; if (finish(s).landed.some(r => r.old.slow)) refund(b, 3); }
    } },
    { id: "spray", name: "Кровавые брызги", description: "Попав по выбранной цели с раной до стрелы или после неё, ты оставляешь рану ещё одному врагу на 2 хода. Сила новой раны — 60% более сильной из этих ран, до 18% твоего физического урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-barbed-arrow") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target), value = r ? woundPower(r) : 0; if (value > 0) put(b, other(b, r.foe), "bleed", 2, Math.max(1, Math.round(Math.min(value * 0.6, b.hero.physicalDamage * 0.18)))); }
    } }
  ]);

  // Мутная смола: держать слепоту вместе с ядом, ускорить повторную дозу, забрызгать второго врага.
  defineSkillMastery("archer-cloudy-resin", [
    { id: "film", name: "Мутная плёнка", description: "Если после попадания цель одновременно отравлена и ослеплена, ты продлеваешь её слепоту на 1 ход, до 4 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; finish(s).landed.forEach(r => { if (getEffect(r.foe, "poison") && getEffect(r.foe, "blind")) extend(b, r.foe, "blind", 4); }); }
    } },
    { id: "hurry", name: "Смоляная спешка", description: "Попав по цели, которая уже была отравлена и ослеплена, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; if (finish(s).landed.some(r => r.old.poison && r.old.blind)) c.tempo *= 0.85; }
    } },
    { id: "splashes", name: "Брызги смолы", description: "Если после попадания выбранная цель отравлена и ослеплена, ты отравляешь ещё одного врага на 2 хода с силой 12% твоего физического урона за тик.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cloudy-resin") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r && getEffect(r.foe, "poison") && getEffect(r.foe, "blind")) put(b, other(b, r.foe), "poison", 2, Math.max(1, Math.round(b.hero.physicalDamage * 0.12))); }
    } }
  ]);

  // Разрезать путы: выдержка за разрез, пробивание связанной цели, обрывок пут на другом враге.
  defineSkillMastery("archer-cut-bindings", [
    { id: "loosen", name: "Освободить тетиву", description: "Попав по цели, которая до разреза была замедлена, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; if (finish(s).landed.some(r => r.old.slow)) refund(b, 3); }
    } },
    { id: "knotcut", name: "Рез по узлу", description: "По замедленной цели ты дополнительно пробиваешь 15% защиты этим разрезом.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; if (direct(c) && getEffect(b.enemy, "slow")) c.pierce += 0.15; }
    } },
    { id: "tornloop", name: "Оборванная петля", description: "Попав по замедленной выбранной цели, ты перебрасываешь обрывок пут на другого врага на 2 хода. Его замедление равно половине прежнего замедления цели, не более 20%.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-cut-bindings") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r?.old.slow) put(b, other(b, r.foe), "slow", 2, Math.min(0.2, r.old.slow.value * 0.5)); }
    } }
  ]);

  // Проверить след: долгая метка, быстрое чтение двух бед, второй след от раны и яда.
  defineSkillMastery("archer-read-trail", [
    { id: "warm", name: "След не стынет", description: "После попадания ты продлеваешь оставшуюся метку цели на 1 ход, до 5 ходов.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; finish(s).landed.forEach(r => extend(b, r.foe, "mark", 5)); }
    } },
    { id: "running", name: "Чтение на бегу", description: "Попав по цели, на которой до выстрела было хотя бы 2 беды, ты тратишь на действие на 15% меньше времени.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; if (finish(s).landed.some(r => r.debuffs >= 2)) c.tempo *= 0.85; }
    } },
    { id: "paired", name: "Парный след", description: "Если после попадания выбранная цель одновременно отравлена и ранена, ты ставишь метку 12% на 2 хода ещё одному врагу.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-read-trail") return; const q = finish(s), r = q.landed.find(r => r.foe === q.target); if (r && getEffect(r.foe, "poison") && getEffect(r.foe, "bleed")) put(b, other(b, r.foe), "mark", 2, 0.12); }
    } }
  ]);

  // Перегнать яд: разовая выплата двух бед, возврат за настоящее продление, удар на последнем тике.
  defineSkillMastery("archer-distill-poison", [
    { id: "double", name: "Двойной настой", description: "Если после попадания цель отравлена и ранена, следующий тик каждой из этих бед сильнее на 20%, с прибавкой не более 10% твоего физического урона. Каждый бонус срабатывает один раз за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; s.pending = new Map(); finish(s).landed.forEach(r => { if (r.foe.currentHp > 0 && getEffect(r.foe, "poison") && getEffect(r.foe, "bleed")) s.pending.set(r.foe, new Set(["poison", "bleed"])); }); },
      beforeTick(b, s, c) { const ids = s.pending?.get(b.enemy); if (!ids?.has(c.id) || !getEffect(b.enemy, c.id)) return; ids.delete(c.id); c.amount += Math.min(c.amount * 0.2, b.hero.physicalDamage * 0.1); }
    } },
    { id: "careful", name: "Бережная перегонка", description: "Если попадание действительно продлило яд или рану, ты возвращаешь 3 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; const q = finish(s); if (q.landed.some(r => ["poison", "bleed"].some(id => r.old[id] && Number.isFinite(r.old[id].duration) && !tm(b.hero, "perma:" + id) && Number(getEffect(r.foe, id)?.duration || 0) > r.old[id].duration))) refund(b, 3); }
    } },
    { id: "lastdrop", name: "Последняя капля", description: "Если у яда или раны на цели остался ровно 1 ход, ты наносишь перегонкой на 18% больше прямого урона.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-distill-poison") return; if (direct(c) && ["poison", "bleed"].some(id => getEffect(b.enemy, id)?.duration === 1 && !tm(b.hero, "perma:" + id))) c.mult *= 1.18; }
    } }
  ]);

  // Нюх на слабость: пробить цель с четырьмя бедами, окупить подготовленное добивание, сохранить короткий след.
  defineSkillMastery("archer-scent-weakness", [
    { id: "four", name: "Четыре следа", description: "Если на цели хотя бы 4 беды, ты дополнительно пробиваешь 15% защиты этим выстрелом.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; if (direct(c) && countEnemyDebuffs(b.enemy) >= 4) c.pierce += 0.15; }
    } },
    { id: "sure", name: "Верный нюх", description: "Убив прямым попаданием цель, на которой до выстрела было хотя бы 2 беды, ты возвращаешь 4 выдержки за применение.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; if (finish(s).landed.some(r => r.debuffs >= 2 && r.killed)) refund(b, 4); }
    } },
    { id: "holdtrail", name: "Не упустить добычу", description: "Попав по цели хотя бы с 3 бедами, ты продлеваешь на 1 ход самый короткий из её конечных эффектов: яд, рану, замедление, метку, надлом брони или слепоту. Продление ограничено 5 ходами; постоянные эффекты не учитываются.", on: {
      beforeHit(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; observe(b, s, c); },
      afterHit(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; record(b, s, c); },
      afterAction(b, s, c) { if (c.skill?.id !== "archer-scent-weakness") return; finish(s).landed.forEach(r => { if (r.debuffs < 3 || r.foe.currentHp <= 0) return; const e = ["poison", "bleed", "slow", "mark", "armor_break", "blind"].map(id => getEffect(r.foe, id)).filter(e => e && Number.isFinite(e.duration) && !tm(b.hero, "perma:" + e.id)).sort((a, z) => a.duration - z.duration)[0]; if (e) extend(b, r.foe, e.id, 5); }); }
    } }
  ]);
})();

(() => {
  const range = b => Number(b.mech?.core_archer?.value || 0);
  const aim = b => Number(b.mech?.marksman?.value || 0);
  const storm = b => Number(b.mech?.stormshot?.value || 0);
  const trap = b => b.mech?.ranger?.trap || null;
  const alive = unit => unit && Number(unit.currentHp) > 0;
  const physical = (b, ratio) => Math.max(1, Math.round(b.hero.physicalDamage * ratio));

  const rememberHit = (b, s) => {
    if (!s.targets) s.targets = new Set();
    s.targets.add(b.enemy);
  };

  const takeTargets = s => {
    const targets = [...(s.targets || [])];
    s.targets = null;
    return targets;
  };

  const effectTargets = (b, s, skill) => {
    const targets = takeTargets(s);
    // Неповреждающие формы и особый укус волка не вызывают afterHit.
    if (!skill.attackType && !targets.length) {
      return skill.aoe ? livingFoes(b) : [b.enemy].filter(alive);
    }
    return targets.filter(alive);
  };

  const prolong = (b, unit, id) => {
    const effect = getEffect(unit, id);
    if (effect && Number.isFinite(effect.duration) && !tm(b.hero, "perma:" + id)) {
      effect.duration += 1;
    }
  };

  const addPierce = (c, amount) => {
    c.pierce = Math.max(c.pierce, Math.min(0.8, c.pierce + amount));
  };

  const reserveArrow = b => {
    const state = b.mech?.stormshot;
    if (state) state.value = Math.max(state.value, Math.min(5, state.value + 1));
  };

  const refund = (b, skill, ratio) => {
    if (getHeroResourceType(skill, b.hero) !== "mana") return;
    const paid = Math.max(0, Number(b.preCostMana ?? b.hero.currentMana) - b.hero.currentMana);
    const amount = Math.min(paid, Math.round(getSkillResourceCost(skill, b.hero) * ratio));
    if (amount <= 0) return;
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + amount);
    if (b.hero.currentMana > before) {
      emit(b, "mana", { target: "hero", amount: b.hero.currentMana - before });
    }
  };

  const anotherFoe = (b, amount, label, element = "steel") => {
    const target = b.enemy;
    const other = livingFoes(b).find(foe => foe !== target);
    if (!other || amount <= 0) return;
    const focus = b.focus;
    try {
      b.focus = focus ?? target.slot;
      b.enemy = other;
      // Этот пакет урона не вызывает afterHit и не раскручивает шквал.
      procDamage(b, Math.round(amount), label, element);
    } finally {
      b.enemy = target;
      b.focus = focus;
    }
  };

  const mendWolf = (wolf, amount) => {
    if (wolf && wolf.hp > 0) {
      wolf.hp = Math.min(wolf.maxHp, wolf.hp + Math.max(0, Math.round(amount)));
    }
  };

  const reinforce = (b, amount, cap) => {
    const pending = trap(b);
    if (pending) {
      const power = Number(pending.power || 0);
      pending.power = Math.max(power, Math.min(cap, power + amount));
    }
  };

  const coverHit = (b, s, c, condition = true) => {
    if (!s.cover || !condition || c.parried || c.amount <= 0) return;
    if (s.coverTarget && s.coverTarget !== b.enemy) return;
    s.cover = false;
    c.amount *= 0.82;
  };

  const spentStorm = (b, c) => {
    const base = getSkillPower(c.skill, b.hero);
    return base > 0 ? clamp(Math.round((c.power / base - 1) / 0.12), 0, 6) : 0;
  };

  const watchPoisonTrap = (b, s) => {
    s.pending = trap(b);
    s.poison = null;
    s.poisonTarget = null;
    s.beforePoison = new Map(
      livingFoes(b).map(foe => [foe, getEffect(foe, "poison")?.meta])
    );
  };

  const caughtPoison = (b, s) => {
    if (!s.pending || trap(b) === s.pending) return null;
    const pending = s.pending;
    s.pending = null;
    const poison = getEffect(b.enemy, "poison");
    // Ловушка исполняется раньше этого enemyTurn. Новая meta отличает
    // наложенную дозу от старого яда на цели.
    if (!pending.poison || !alive(b.enemy) || !poison ||
        poison.meta === s.beforePoison?.get(b.enemy)) return null;
    return poison;
  };

  // Метка охотника: долгая слежка, запас сосредоточения или защита от отмеченной добычи.
  defineSkillMastery("archer-hunters-mark", [
    {
      id: "long_watch", name: "Долгая слежка",
      description: "Наложенная этим навыком метка держится на 1 ход дольше, в том числе на побочных целях.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-hunters-mark") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-hunters-mark") return;
          effectTargets(b, s, c.skill).forEach(foe => prolong(b, foe, "mark"));
        }
      }
    },
    {
      id: "drawn_trace", name: "Натянутый след",
      description: "Если после применения выбранная цель жива и под меткой, ты получаешь ещё 1 сосредоточение, до 5.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-hunters-mark") return;
          if (alive(b.enemy) && getEffect(b.enemy, "mark")) {
            bumpGauge(b, "marksman", 1, 5);
          }
        }
      }
    },
    {
      id: "watched_prey", name: "Добыча на виду",
      description: "До твоего следующего хода первая попавшая атака выбранной цели наносит на 18% меньше урона, если на ней есть метка.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-hunters-mark") return;
          s.coverTarget = b.enemy;
          s.cover = alive(b.enemy) && Boolean(getEffect(b.enemy, "mark"));
        },
        incoming(b, s, c) {
          coverHit(b, s, c, Boolean(getEffect(b.enemy, "mark")));
        },
        turnStart(b, s) {
          s.cover = false;
        }
      }
    }
  ]);

  // Стрела под глаз: уязвимость метки, сохранение слежки критом или сбитый взгляд без метки.
  defineSkillMastery("archer-under-eye", [
    {
      id: "eye_gap", name: "Щель под меткой",
      description: "По цели под меткой прямой удар этого навыка сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-under-eye") return;
          if (isDirectHit(c) && getEffect(b.enemy, "mark")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "pupil_trace", name: "След зрачка",
      description: "Критическое попадание продлевает метку на цели на 1 ход. Каждую цель можно продлить лишь раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-under-eye") return;
          if (isDirectHit(c) && c.crit && getEffect(b.enemy, "mark")) {
            rememberHit(b, s);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-under-eye") return;
          takeTargets(s).filter(alive).forEach(foe => prolong(b, foe, "mark"));
        }
      }
    },
    {
      id: "clouded_eye", name: "Сбитый взгляд",
      description: "Попадание по цели без метки ослепляет её на 12% на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-under-eye") return;
          if (isDirectHit(c) && alive(b.enemy) && !getEffect(b.enemy, "mark")) {
            fx(b, "blind", 1, 12);
          }
        }
      }
    }
  ]);

  // Выстрел в голову: рана от крита, возвращённая мушка или осколок в соседнюю цель.
  defineSkillMastery("archer-headshot", [
    {
      id: "ragged_exit", name: "Рваный выход",
      description: "Критическое попадание оставляет рану на 3 хода с силой 25% физической атаки. Не чаще одного раза по каждой цели за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          if (!isDirectHit(c) || !c.crit || !alive(b.enemy) ||
              s.targets?.has(b.enemy)) return;
          rememberHit(b, s);
          fx(b, "bleed", 3, physical(b, 0.25));
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          takeTargets(s);
        }
      }
    },
    {
      id: "new_bead", name: "Новая мушка",
      description: "Если хотя бы одно попадание стало критическим, после выстрела ты возвращаешь 1 сосредоточение, до 5.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          if (isDirectHit(c) && c.crit) s.critical = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          if (s.critical) bumpGauge(b, "marksman", 1, 5);
          s.critical = false;
        }
      }
    },
    {
      id: "crown_shard", name: "Осколок венца",
      description: "Первый крит за применение наносит ещё одному живому врагу урон мимо брони: 15% урона, снятого этим попаданием со здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          if (isDirectHit(c)) s.healthBefore = b.enemy.currentHp;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          if (!isDirectHit(c) || !c.crit || c.hpDamage <= 0 || s.used) return;
          s.used = true;
          anotherFoe(
            b, Math.min(c.hpDamage, s.healthBefore || 0) * 0.15, "Осколок венца"
          );
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-headshot") return;
          s.used = false;
        }
      }
    }
  ]);

  // Сохранить прицел: дальний выстрел, страховка сосредоточения или продление метки.
  defineSkillMastery("archer-keep-sight", [
    {
      id: "far_watch", name: "Дальний дозор",
      description: "При 4–5 сосредоточения и дистанции от 2 прямой удар этого навыка сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-keep-sight") return;
          if (isDirectHit(c) && aim(b) >= 4 && range(b) >= 2) c.mult *= 1.18;
        }
      }
    },
    {
      id: "steady_bead", name: "Несбитая мушка",
      description: "До твоего следующего хода первая ранящая тебя атака возвращает 1 потерянное сосредоточение, до значения сразу после выстрела.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-keep-sight") return;
          s.savedAim = aim(b);
          s.armed = s.savedAim > 0;
        },
        hurt(b, s, c) {
          if (!s.armed || c.hpDamage <= 0) return;
          s.armed = false;
          const state = b.mech?.marksman;
          if (state && state.value < s.savedAim) {
            state.value = Math.min(s.savedAim, state.value + 1);
          }
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    },
    {
      id: "sight_line", name: "Линия метки",
      description: "Если после попадания у тебя хотя бы 4 сосредоточения, метка на поражённой цели держится на 1 ход дольше. Один раз на цель за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-keep-sight") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-keep-sight") return;
          const targets = takeTargets(s);
          if (aim(b) >= 4) {
            targets.filter(alive).forEach(foe => prolong(b, foe, "mark"));
          }
        }
      }
    }
  ]);

  // Выбить метку: слабый отпечаток, возврат выдержки за вскрытие или рикошет знака.
  defineSkillMastery("archer-break-mark", [
    {
      id: "faint_print", name: "Отпечаток",
      description: "Если выстрел застал метку, после её снятия на выжившей цели остаётся метка на 1 ход с половиной прежней силы, даже при промахе.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (!isDirectHit(c) || b.enemy !== (s.target || b.enemy)) return;
          if (!s.target) {
            s.target = b.enemy;
            s.markValue = getEffect(b.enemy, "mark")?.value || 0;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (s.target === b.enemy && s.markValue > 0 && alive(b.enemy)) {
            const scale = (1 + tm(b.hero, "val:mark")) * getEnemyResist(b.enemy, "mark");
            if (scale > 0) fx(b, "mark", 1, s.markValue * 0.5 / scale);
          }
          s.target = null;
          s.markValue = 0;
        }
      }
    },
    {
      id: "torn_sign", name: "Сорванный знак",
      description: "Если попадание сняло здоровье у цели под меткой, после применения ты возвращаешь 20% уплаченной цены навыка в выдержке.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (isDirectHit(c) && c.hpDamage > 0 && getEffect(b.enemy, "mark")) {
            s.opened = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (s.opened) refund(b, c.skill, 0.2);
          s.opened = false;
        }
      }
    },
    {
      id: "sign_ricochet", name: "Рикошет знака",
      description: "Первое попадание по метке наносит ещё одному живому врагу урон мимо брони: 15% снятого этим попаданием здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (isDirectHit(c)) s.healthBefore = b.enemy.currentHp;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          if (!isDirectHit(c) || s.used || c.hpDamage <= 0 ||
              !getEffect(b.enemy, "mark")) return;
          s.used = true;
          anotherFoe(
            b, Math.min(c.hpDamage, s.healthBefore || 0) * 0.15, "Рикошет знака"
          );
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-break-mark") return;
          s.used = false;
        }
      }
    }
  ]);

  // Сменить мишень: охват веера, наследование меток после убийства или быстрый переход.
  defineSkillMastery("archer-switch-target", [
    {
      id: "wide_search", name: "Сквозной поиск",
      description: "Побочные стрелы наносят на 12 процентных пунктов больше силы главной стрелы: без формы 72% вместо 60%, максимум 100%.",
      patch: skill => ({
        aoe: Math.max(
          Number(skill.aoe || 0),
          Math.min(1, Number(skill.aoe || 0) + 0.12)
        )
      })
    },
    {
      id: "remembered_target", name: "Памятная мишень",
      description: "Если выбранная цель погибает за применение, метки на остальных поражённых живых врагах держатся на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-switch-target") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-switch-target") return;
          const targets = takeTargets(s);
          if (!alive(b.enemy)) {
            targets.filter(alive).forEach(foe => prolong(b, foe, "mark"));
          }
        }
      }
    },
    {
      id: "no_pause", name: "Без паузы",
      description: "Если выбранная цель погибает за применение, это действие занимает на 18% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-switch-target") return;
          if (!alive(b.enemy)) c.tempo *= 0.82;
        }
      }
    }
  ]);

  // Шквал стрел: длительность разгона, запас к следующему залпу или пробивание под ускорением.
  defineSkillMastery("archer-arrow-storm", [
    {
      id: "following_wind", name: "Попутный шквал",
      description: "После хотя бы одного попадания действующее ускорение держится на 1 ход дольше. Работает и с ускорением, которое даёт форма навыка.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-storm") return;
          if (isDirectHit(c)) s.landed = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-arrow-storm") return;
          if (s.landed) prolong(b, b.hero, "haste");
          s.landed = false;
        }
      }
    },
    {
      id: "spare_arrow", name: "Стрела в запас",
      description: "Если хотя бы одна стрела попала, после применения ты получаешь ещё 1 единицу шквала, до 5. Запас сам не запускает бесплатный залп.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-storm") return;
          if (isDirectHit(c)) s.landed = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-arrow-storm") return;
          if (s.landed) reserveArrow(b);
          s.landed = false;
        }
      }
    },
    {
      id: "wind_gap", name: "Сквозной ветер",
      description: "Под ускорением стрелы этого навыка игнорируют ещё 20% защиты, до общего пробивания 80%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-storm") return;
          if (isDirectHit(c) && getEffect(b.hero, "haste")) addPierce(c, 0.2);
        }
      }
    }
  ]);

  // Разгон колчана: длинный разгон, быстрое обновление или запас шквала перед залпом.
  defineSkillMastery("archer-quiver-windup", [
    {
      id: "long_windup", name: "Длинный разгон",
      description: "Ускорение после этого навыка держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          prolong(b, b.hero, "haste");
        }
      }
    },
    {
      id: "running_string", name: "Тетива на ходу",
      description: "Если ускорение действовало до выстрела, обновление колчана занимает на 15% меньше времени, даже при промахе.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          if (isDirectHit(c)) {
            s.hasted = Boolean(s.hasted || getEffect(b.hero, "haste"));
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          if (s.hasted) c.tempo *= 0.85;
          s.hasted = false;
        }
      }
    },
    {
      id: "full_quiver", name: "Непустой колчан",
      description: "Если перед стрелой было 4–5 единиц шквала и она попала, после разгона ты получаешь ещё 1 единицу шквала, до 5.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          if (isDirectHit(c)) s.nearVolley = storm(b) >= 4 && storm(b) <= 5;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          if (isDirectHit(c) && s.nearVolley) s.reward = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-quiver-windup") return;
          if (s.reward) reserveArrow(b);
          s.nearVolley = false;
          s.reward = false;
        }
      }
    }
  ]);

  // Частый дождь: последовательное пробивание, быстрый обстрел группы или пелена стрел.
  defineSkillMastery("archer-frequent-rain", [
    {
      id: "plate_seams", name: "Между пластин",
      description: "Начиная со второй попытки выстрела по каждой цели за применение, стрелы игнорируют ещё 18% защиты, до общего пробивания 80%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          if (!isDirectHit(c)) return;
          if (!s.attempts) s.attempts = new Map();
          const count = (s.attempts.get(b.enemy) || 0) + 1;
          s.attempts.set(b.enemy, count);
          if (count >= 2) addPierce(c, 0.18);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          s.attempts = null;
        }
      }
    },
    {
      id: "first_drops", name: "Первые капли",
      description: "Если стрелы попали хотя бы по двум разным врагам, обстрел занимает на 15% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          if (takeTargets(s).length >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "rain_veil", name: "Ливневая пелена",
      description: "Первое попадание по каждому врагу за применение ослепляет его на 10% на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          if (!isDirectHit(c) || !alive(b.enemy) || s.targets?.has(b.enemy)) return;
          rememberHit(b, s);
          fx(b, "blind", 1, 10);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-frequent-rain") return;
          takeTargets(s);
        }
      }
    }
  ]);

  // Шестая стрела: усиление перед порогом, новый отсчёт или короткий сбой темпа врага.
  defineSkillMastery("archer-sixth-arrow", [
    {
      id: "true_count", name: "Точный счёт",
      description: "При 4–5 единицах шквала прямой удар этого навыка дополнительно сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (isDirectHit(c) && storm(b) >= 4 && storm(b) <= 5) c.mult *= 1.18;
        }
      }
    },
    {
      id: "seventh_feather", name: "Седьмое перо",
      description: "Попадание, выпущенное при 4–5 единицах шквала, после применения даёт ещё 1 единицу шквала, до 5.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (isDirectHit(c)) s.threshold = storm(b) >= 4 && storm(b) <= 5;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (isDirectHit(c) && s.threshold) s.reward = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (s.reward) reserveArrow(b);
          s.threshold = false;
          s.reward = false;
        }
      }
    },
    {
      id: "deaf_roll", name: "Глухой раскат",
      description: "Стрела, выпущенная при 4–5 единицах шквала, при попадании ошеломляет цель на 18% на 1 ход.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (isDirectHit(c)) s.threshold = storm(b) >= 4 && storm(b) <= 5;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          if (isDirectHit(c) && s.threshold && alive(b.enemy)) {
            fx(b, "stagger", 1, 0.18);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-sixth-arrow") return;
          s.threshold = false;
        }
      }
    }
  ]);

  // Выдох бури: продлённое дыхание, быстрый выдох или прикрытие после разгона.
  defineSkillMastery("archer-storm-exhale", [
    {
      id: "long_breath", name: "Долгое дыхание",
      description: "Если ускорение было до выстрела, обновлённое ускорение держится на 1 ход дольше.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          if (isDirectHit(c)) {
            s.hasted = Boolean(s.hasted || getEffect(b.hero, "haste"));
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          if (s.hasted) prolong(b, b.hero, "haste");
          s.hasted = false;
        }
      }
    },
    {
      id: "tailwind", name: "Ветер за спиной",
      description: "Если ускорение было до выстрела, выдох занимает на 15% меньше времени, даже при промахе.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          if (isDirectHit(c)) {
            s.hasted = Boolean(s.hasted || getEffect(b.hero, "haste"));
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          if (s.hasted) c.tempo *= 0.85;
          s.hasted = false;
        }
      }
    },
    {
      id: "storm_border", name: "Граница бури",
      description: "Если ускорение было до выстрела, до твоего следующего хода первая попавшая атака наносит на 18% меньше урона, пока ускорение действует.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          if (isDirectHit(c)) {
            s.hasted = Boolean(s.hasted || getEffect(b.hero, "haste"));
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-storm-exhale") return;
          s.cover = Boolean(s.hasted && getEffect(b.hero, "haste"));
          s.hasted = false;
        },
        incoming(b, s, c) {
          coverHit(b, s, c, Boolean(getEffect(b.hero, "haste")));
        },
        turnStart(b, s) {
          s.cover = false;
        }
      }
    }
  ]);

  // Спустить шквал: посев нового счётчика, бронебойный расход или продление разгона.
  defineSkillMastery("archer-unwind-storm", [
    {
      id: "storm_seed", name: "Посев шквала",
      description: "Если ты тратишь хотя бы 3 единицы шквала и попадаешь хотя бы раз, после применения получаешь 1 единицу нового шквала, до 5.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (isDirectHit(c) && spentStorm(b, c) >= 3) s.spentEnough = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (isDirectHit(c)) s.landed = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (s.spentEnough && s.landed) reserveArrow(b);
          s.spentEnough = false;
          s.landed = false;
        }
      }
    },
    {
      id: "dry_thunder", name: "Сухой гром",
      description: "При расходе хотя бы 3 единиц шквала стрелы этого навыка игнорируют ещё 20% защиты, до общего пробивания 80%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (isDirectHit(c) && spentStorm(b, c) >= 3) addPierce(c, 0.2);
        }
      }
    },
    {
      id: "turning_wind", name: "Смена ветра",
      description: "Если ты тратишь хотя бы 3 единицы шквала и попадаешь хотя бы раз, действующее ускорение держится на 1 ход дольше.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (isDirectHit(c) && spentStorm(b, c) >= 3) s.spentEnough = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (isDirectHit(c)) s.landed = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-unwind-storm") return;
          if (s.spentEnough && s.landed) prolong(b, b.hero, "haste");
          s.spentEnough = false;
          s.landed = false;
        }
      }
    }
  ]);

  // Силок: натяг на дистанции, быстрый отход или страховка от пойманного врага.
  defineSkillMastery("archer-snare", [
    {
      id: "far_knot", name: "Дальний узел",
      description: "Если после установки дистанция не меньше 2, удар установленной ловушки сильнее на 18%. Работает с обеими формами силка.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-snare") return;
          const pending = trap(b);
          if (pending && range(b) >= 2) pending.power *= 1.18;
        }
      }
    },
    {
      id: "quiet_step", name: "Тихий шаг",
      description: "Если после установки дистанция не меньше 2, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-snare") return;
          if (trap(b) && range(b) >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "safety_loop", name: "Страховочная петля",
      description: "После установки и до твоего следующего хода первая попавшая атака замедленного или отравленного врага наносит на 18% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-snare") return;
          s.cover = Boolean(trap(b));
        },
        incoming(b, s, c) {
          coverHit(
            b, s, c,
            Boolean(getEffect(b.enemy, "slow") || getEffect(b.enemy, "poison"))
          );
        },
        turnStart(b, s) {
          s.cover = false;
        }
      }
    }
  ]);

  // Петля на стреле: длительность пут, усиление занятой ловушки или быстрый захват.
  defineSkillMastery("archer-arrow-loop", [
    {
      id: "double_knot", name: "Двойной узел",
      description: "После попадания замедление на поражённой цели держится на 1 ход дольше. Один раз на цель за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          takeTargets(s).filter(alive).forEach(foe => prolong(b, foe, "slow"));
        }
      }
    },
    {
      id: "loop_over_loop", name: "Петля поверх",
      description: "Если ловушка уже стояла до выстрела и сохранилась, ты усиливаешь её удар на 0,3 силы, до 1,9.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          if (isDirectHit(c) && !s.checked) {
            s.previousTrap = trap(b);
            s.checked = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          if (s.previousTrap && trap(b) === s.previousTrap) reinforce(b, 0.3, 1.9);
          s.previousTrap = null;
          s.checked = false;
        }
      }
    },
    {
      id: "loop_return", name: "Возврат петли",
      description: "Если после попадания на выбранной живой цели есть замедление, действие занимает на 15% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-arrow-loop") return;
          const targets = takeTargets(s);
          if (targets.includes(b.enemy) && alive(b.enemy) &&
              getEffect(b.enemy, "slow")) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Ядовитый капкан: долгая доза, возврат выдержки за смерть от яда или брызги на соседа.
  defineSkillMastery("archer-poison-trap", [
    {
      id: "long_fever", name: "Долгая лихорадка",
      description: "Когда установленный этим навыком капкан отравляет живую цель, его яд держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-poison-trap") return;
          watchPoisonTrap(b, s);
        },
        enemyTurn(b, s) {
          if (caughtPoison(b, s)) prolong(b, b.enemy, "poison");
        }
      }
    },
    {
      id: "paid_bait", name: "Окупленная приманка",
      description: "Если первая жертва установленного капкана погибает от его яда до обновления дозы, ты возвращаешь 20% уплаченной цены навыка в выдержке.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-poison-trap") return;
          watchPoisonTrap(b, s);
          s.skill = c.skill;
          s.paid = Math.max(
            0, Number(b.preCostMana ?? b.hero.currentMana) - b.hero.currentMana
          );
        },
        enemyTurn(b, s) {
          const poison = caughtPoison(b, s);
          if (!poison) return;
          s.poison = poison;
          s.poisonMeta = poison.meta;
          s.poisonTarget = b.enemy;
        },
        tick(b, s, c) {
          if (!s.poison || c.id !== "poison" || b.enemy !== s.poisonTarget) return;
          const sameDose = getEffect(b.enemy, "poison") === s.poison &&
            s.poison.meta === s.poisonMeta;
          if (!sameDose) {
            s.poison = null;
            return;
          }
          if (alive(b.enemy) || c.amount <= 0) return;
          s.poison = null;
          if (getHeroResourceType(s.skill, b.hero) !== "mana") return;
          const amount = Math.min(
            s.paid, Math.round(getSkillResourceCost(s.skill, b.hero) * 0.2)
          );
          const before = b.hero.currentMana;
          b.hero.currentMana = Math.min(b.hero.maxMana, before + amount);
          if (b.hero.currentMana > before) {
            emit(b, "mana", { target: "hero", amount: b.hero.currentMana - before });
          }
        },
        expired(b, s, c) {
          if (c.id === "poison" && c.unit === s.poisonTarget) s.poison = null;
        }
      }
    },
    {
      id: "toxic_splashes", name: "Брызги капкана",
      description: "Когда капкан отравляет живую цель, ещё один живой враг получает урон мимо брони в размере 75% одного тика наложенного яда.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-poison-trap") return;
          watchPoisonTrap(b, s);
        },
        enemyTurn(b, s) {
          const poison = caughtPoison(b, s);
          if (poison) {
            anotherFoe(b, poison.value * 0.75, "Брызги капкана", "poison");
          }
        }
      }
    }
  ]);

  // Стрела в силок: подготовленный удар, длительность спущенных пут или возврат пружины.
  defineSkillMastery("archer-trip-shot", [
    {
      id: "taut_trigger", name: "Натянутый спуск",
      description: "При готовой ловушке прямой удар сильнее на 18%, если цель уже замедлена или отравлена.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-trip-shot") return;
          if (isDirectHit(c) && trap(b) &&
              (getEffect(b.enemy, "slow") || getEffect(b.enemy, "poison"))) {
            c.mult *= 1.18;
          }
        }
      }
    },
    {
      id: "lingering_jaws", name: "Цепкие зубья",
      description: "Если выстрел спустил готовую ловушку по выжившей цели, её действующие яд и замедление держатся на 1 ход дольше.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-trip-shot") return;
          if (isDirectHit(c) && !s.checked) {
            s.previousTrap = trap(b);
            s.checked = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-trip-shot") return;
          if (s.previousTrap && trap(b) !== s.previousTrap && alive(b.enemy)) {
            if (s.previousTrap.poison) prolong(b, b.enemy, "poison");
            if (s.previousTrap.slow) prolong(b, b.enemy, "slow");
          }
          s.previousTrap = null;
          s.checked = false;
        }
      }
    },
    {
      id: "spring_return", name: "Возврат пружины",
      description: "Если выстрел спустил готовую ловушку, после применения ты возвращаешь 20% уплаченной цены навыка в выдержке.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-trip-shot") return;
          if (isDirectHit(c) && !s.checked) {
            s.previousTrap = trap(b);
            s.checked = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-trip-shot") return;
          if (s.previousTrap && trap(b) !== s.previousTrap) refund(b, c.skill, 0.2);
          s.previousTrap = null;
          s.checked = false;
        }
      }
    }
  ]);

  // Запасная тетива: более крепкая пружина, поддержка существующих пут или быстрая первая установка.
  defineSkillMastery("archer-spare-string", [
    {
      id: "second_strand", name: "Вторая жила",
      description: "После обычного усиления или установки готовая ловушка получает ещё 0,3 силы удара, до 1,9.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-spare-string") return;
          reinforce(b, 0.3, 1.9);
        }
      }
    },
    {
      id: "oiled_knot", name: "Смазанный узел",
      description: "После попадания готовая ловушка поддерживает свои путы: если у неё есть яд или замедление, такой же действующий эффект на цели длится на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-spare-string") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-spare-string") return;
          const targets = takeTargets(s);
          const pending = trap(b);
          if (!pending) return;
          targets.filter(alive).forEach(foe => {
            if (pending.poison) prolong(b, foe, "poison");
            if (pending.slow) prolong(b, foe, "slow");
          });
        }
      }
    },
    {
      id: "quiet_restring", name: "Тихая замена",
      description: "Если до выстрела ловушки не было и навык поставил новую, действие занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-spare-string") return;
          if (isDirectHit(c) && !s.checked) {
            s.wasEmpty = !trap(b);
            s.checked = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-spare-string") return;
          if (s.checked && s.wasEmpty && trap(b)) c.tempo *= 0.85;
          s.wasEmpty = false;
          s.checked = false;
        }
      }
    }
  ]);

  // Перекрыть тропу: долгий заслон при ловушке, быстрый загон группы или общий натяг пружины.
  defineSkillMastery("archer-close-trail", [
    {
      id: "long_barrier", name: "Длинный заслон",
      description: "При готовой после выстрела ловушке замедление на каждом поражённом живом враге держится на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-close-trail") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-close-trail") return;
          const targets = takeTargets(s);
          if (trap(b)) {
            targets.filter(alive).forEach(foe => prolong(b, foe, "slow"));
          }
        }
      }
    },
    {
      id: "leave_the_pen", name: "Выход из загона",
      description: "Если навык поразил хотя бы двух разных врагов, действие занимает на 15% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-close-trail") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-close-trail") return;
          if (takeTargets(s).length >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "trail_into_jaws", name: "Тропа в зубья",
      description: "Если после выстрела хотя бы два живых врага замедлены, удар готовой ловушки получает 0,35 силы, до 2.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-close-trail") return;
          if (livingFoes(b).filter(foe => getEffect(foe, "slow")).length >= 2) {
            reinforce(b, 0.35, 2);
          }
        }
      }
    }
  ]);

  // Фас!: длительность приказа, поддержка волка или защита от указанной добычи.
  defineSkillMastery("archer-pack-tactics", [
    {
      id: "faithful_sign", name: "Верная примета",
      description: "Метка этого приказа держится на 1 ход дольше. В форме «Держать добычу» вместо метки продлевается наложенное замедление.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-pack-tactics") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-pack-tactics") return;
          const ids = (c.skill.appliedEffects || [])
            .map(effect => effect.id)
            .filter(id => id === "mark" || id === "slow");
          effectTargets(b, s, c.skill).forEach(foe => {
            ids.forEach(id => prolong(b, foe, id));
          });
        }
      }
    },
    {
      id: "pack_share", name: "Доля стаи",
      description: "После приказа живой волк восстанавливает ещё 8% своего максимального здоровья, если выбранная живая цель отмечена или замедлена.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-pack-tactics") return;
          if (!alive(b.enemy) ||
              !(getEffect(b.enemy, "mark") || getEffect(b.enemy, "slow"))) return;
          const wolf = findWolf(b.hero);
          if (wolf) mendWolf(wolf, wolf.maxHp * 0.08);
        }
      }
    },
    {
      id: "prey_gaze", name: "Взгляд добычи",
      description: "До твоего следующего хода первая попавшая атака выбранной цели наносит на 18% меньше урона, пока на ней есть метка или замедление.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-pack-tactics") return;
          s.coverTarget = b.enemy;
          s.cover = alive(b.enemy) &&
            Boolean(getEffect(b.enemy, "mark") || getEffect(b.enemy, "slow"));
        },
        incoming(b, s, c) {
          coverHit(
            b, s, c,
            Boolean(getEffect(b.enemy, "mark") || getEffect(b.enemy, "slow"))
          );
        },
        turnStart(b, s) {
          s.cover = false;
        }
      }
    }
  ]);

  // Стрела пастуха: помощь тяжело раненому волку, одиночный выстрел или ответ на рану добычи.
  defineSkillMastery("archer-shepherd-shot", [
    {
      id: "field_dressing", name: "Перевязь",
      description: "Если после обычного лечения у живого волка меньше половины здоровья, он восстанавливает ещё 8% своего максимума.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-shepherd-shot") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp < wolf.maxHp * 0.5) {
            mendWolf(wolf, wolf.maxHp * 0.08);
          }
        }
      }
    },
    {
      id: "lone_shepherd", name: "Одинокий пастух",
      description: "Пока живого волка нет, прямой удар этого навыка дополнительно сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-shepherd-shot") return;
          if (isDirectHit(c) && !findWolf(b.hero)) c.mult *= 1.18;
        }
      }
    },
    {
      id: "answering_bite", name: "Ответный укус",
      description: "После выстрела живой волк дополнительно кусает выжившую цель с раной на 50% своей силы мимо брони.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-shepherd-shot") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && alive(b.enemy) && getEffect(b.enemy, "bleed")) {
            procDamage(b, wolf.power * 0.5, "Ответный укус", "blood");
          }
        }
      }
    }
  ]);

  // К ноге!: длительная закалка, первый совместный заслон или передышка рядом с целым волком.
  defineSkillMastery("archer-heel", [
    {
      id: "long_stance", name: "Долгая стойка",
      description: "Если после команды живой волк заслоняет тебя, твоя действующая закалка держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-heel") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && wolf.taunt > 0) {
            prolong(b, b.hero, "fortify");
          }
        }
      }
    },
    {
      id: "shoulder_to_shoulder", name: "Плечо к плечу",
      description: "До твоего следующего хода первая попавшая атака наносит на 18% меньше урона, пока призванный к ноге волк жив. Снижение действует и при перехвате волком.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-heel") return;
          s.wolf = findWolf(b.hero);
          s.cover = Boolean(s.wolf && s.wolf.hp > 0);
        },
        incoming(b, s, c) {
          coverHit(
            b, s, c,
            Boolean(s.wolf && s.wolf.hp > 0 && findWolf(b.hero) === s.wolf)
          );
        },
        turnStart(b, s) {
          s.cover = false;
          s.wolf = null;
        }
      }
    },
    {
      id: "pack_breather", name: "Передышка стаи",
      description: "Если после команды у живого волка хотя бы 75% здоровья, ты восстанавливаешь 4% своего максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-heel") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && wolf.hp >= wolf.maxHp * 0.75) {
            healUnit(b, b.hero, b.hero.maxHp * 0.04, "Передышка стаи");
          }
        }
      }
    }
  ]);

  // Кровавый след: долгая рана, одно кормление от её тика или укус соседней добычи.
  defineSkillMastery("archer-blood-trail", [
    {
      id: "deep_trace", name: "Глубокий след",
      description: "После попадания рана на поражённой живой цели держится на 1 ход дольше. Один раз на цель за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-blood-trail") return;
          if (isDirectHit(c)) rememberHit(b, s);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-blood-trail") return;
          takeTargets(s).filter(alive).forEach(foe => prolong(b, foe, "bleed"));
        }
      }
    },
    {
      id: "feeding_trace", name: "Пир по следу",
      description: "Первый тик раны выбранной цели после выстрела лечит живого волка на 50% снятого тиком здоровья, до 12% его максимума. Обновление раны отменяет кормление.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-blood-trail") return;
          s.target = b.enemy;
          s.wound = alive(b.enemy) ? getEffect(b.enemy, "bleed") : null;
          s.woundMeta = s.wound?.meta;
        },
        tick(b, s, c) {
          if (!s.wound || c.id !== "bleed" || b.enemy !== s.target) return;
          const sameWound = getEffect(b.enemy, "bleed") === s.wound &&
            s.wound.meta === s.woundMeta;
          s.wound = null;
          if (!sameWound) return;
          const wolf = findWolf(b.hero);
          if (wolf) {
            mendWolf(wolf, Math.min(wolf.maxHp * 0.12, c.amount * 0.5));
          }
        },
        expired(b, s, c) {
          if (c.id === "bleed" && c.unit === s.target) s.wound = null;
        }
      }
    },
    {
      id: "blood_drive", name: "Загон по крови",
      description: "Если после выстрела выбранная цель жива и под раной, живой волк кусает ещё одного живого врага на 60% своей силы мимо брони.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-blood-trail") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && alive(b.enemy) && getEffect(b.enemy, "bleed")) {
            anotherFoe(b, wolf.power * 0.6, "Загон по крови", "blood");
          }
        }
      }
    }
  ]);

  // Зов волка: щит рядом с целым спутником, встречный укус по следу или быстрый возврат зверя.
  defineSkillMastery("archer-call-wolf", [
    {
      id: "strong_bond", name: "Крепкая связь",
      description: "Если после зова здоровье живого волка полное, ты получаешь щит на 3 хода величиной 4% своего максимального здоровья. Щит не складывается с более сильным.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-call-wolf") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && wolf.hp >= wolf.maxHp) {
            fx(b, "shield", 3, Math.round(b.hero.maxHp * 0.04), { self: true });
          }
        }
      }
    },
    {
      id: "answer_the_call", name: "По зову",
      description: "После зова живой волк кусает выжившую цель под меткой или раной на 60% своей силы мимо брони.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-call-wolf") return;
          const wolf = findWolf(b.hero);
          if (wolf && wolf.hp > 0 && alive(b.enemy) &&
              (getEffect(b.enemy, "mark") || getEffect(b.enemy, "bleed"))) {
            procDamage(b, wolf.power * 0.6, "По зову", "blood");
          }
        }
      }
    },
    {
      id: "unbroken_call", name: "Без отрыва",
      description: "Если до выстрела живого волка не было и зов вернул его, действие занимает на 18% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-call-wolf") return;
          if (isDirectHit(c) && !s.checked) {
            s.wasMissing = !findWolf(b.hero);
            s.checked = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-call-wolf") return;
          const wolf = findWolf(b.hero);
          if (s.wasMissing && wolf && wolf.hp > 0) c.tempo *= 0.82;
          s.wasMissing = false;
          s.checked = false;
        }
      }
    }
  ]);

  // Общий рывок: частичный возврат здоровья волку, удар по крови или рана от совместной атаки.
  defineSkillMastery("archer-shared-lunge", [
    {
      id: "returned_impulse", name: "Возвращённый порыв",
      description: "Если волк участвовал в усилении рывка, после уплаты его здоровья он восстанавливает 4% своего максимума, даже при промахе.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          if (!isDirectHit(c) || s.checked) return;
          const wolf = findWolf(b.hero);
          s.wolf = wolf && wolf.hp > wolf.maxHp * 0.2 ? wolf : null;
          s.checked = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          if (s.wolf && findWolf(b.hero) === s.wolf) {
            mendWolf(s.wolf, s.wolf.maxHp * 0.04);
          }
          s.wolf = null;
          s.checked = false;
        }
      }
    },
    {
      id: "blood_acceleration", name: "Кровный разгон",
      description: "Если волк может отдать здоровье за усиление рывка, прямой удар по цели с раной дополнительно сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          const wolf = findWolf(b.hero);
          if (isDirectHit(c) && wolf && wolf.hp > wolf.maxHp * 0.2 &&
              getEffect(b.enemy, "bleed")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "lunge_trace", name: "След рывка",
      description: "Если волк участвовал в усилении рывка, попадание оставляет на цели рану на 2 хода с силой 20% физической атаки. Один раз на цель за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          if (!isDirectHit(c) || s.checked) return;
          const wolf = findWolf(b.hero);
          s.joined = Boolean(wolf && wolf.hp > wolf.maxHp * 0.2);
          s.checked = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          if (!isDirectHit(c) || !s.joined || !alive(b.enemy) ||
              s.targets?.has(b.enemy)) return;
          rememberHit(b, s);
          fx(b, "bleed", 2, physical(b, 0.2));
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "archer-shared-lunge") return;
          takeTargets(s);
          s.joined = false;
          s.checked = false;
        }
      }
    }
  ]);
})();

