// Archer build content. Only registries are extended; the catalog stays intact.
(() => {
  const hit = (b, power, label, extra = {}) => {
    // The legacy storm mechanic counts even proc hits. An ultimate must neither
    // charge its counter nor release another volley, so isolate this one hit.
    const storm = b.mech?.stormshot;
    const stored = Number(storm?.value || 0);
    if (storm) storm.value = 0;
    try {
      return performHeroHit(b, {
        kind: "physical", power, label, element: "steel", sure: true,
        noEcho: true, proc: true, ...extra
      });
    } finally {
      if (storm) storm.value = stored;
    }
  };
  const takeFocus = b => {
    const state = b.mech?.marksman;
    const value = clamp(Number(state?.value || 0), 0, 5);
    if (state) state.value = 0;
    return value;
  };
  const range = b => clamp(Number(b.mech?.core_archer?.value || 0), 0, 3);
  const moveRange = (b, amount) => {
    const state = b.mech?.core_archer;
    if (state) state.value = clamp(range(b) + amount, 0, 3);
  };
  const shotAction = c => c.type === "attack" || c.skill?.attackType === "physical";
  // The ultimate's own afterAction is not one of the following three actions.
  const tickPhase = (b, s, c) => { if (c.type !== "ult") ultPhaseTick(s); };
  const capPierce = (b, s, c) => { c.pierce = Math.min(0.8, c.pierce); };
  const physicalDot = (b, ratio) => Math.max(3, Math.round(b.hero.physicalDamage * ratio));
  const trapHit = c => !c.skill && c.noEcho && /силок|капкан|силки|петля/i.test(c.label || "");
  const halfTrap = trap => ({ ...trap, power: Number(trap.power || 0) * 0.5,
    poison: Number(trap.poison || 0) * 0.5, slow: Number(trap.slow || 0) * 0.5,
    stun: Number(trap.stun || 0) * 0.5, archerRepeat: true });
  const spring = (b, trap, scale, label) => {
    hit(b, Number(trap.power || 0.9) * scale, label, { element: trap.element || "earth" });
    if (b.enemy.currentHp <= 0) return;
    if (trap.poison) fx(b, "poison", 3, physicalDot(b, trap.poison * scale));
    if (trap.slow) fx(b, "slow", 3, Math.min(0.5, trap.slow * 2) * scale / 2);
    if (trap.stun) applyStun(b, b.enemy, b.hero, trap.stun * scale / 2);
  };
  const keepFocus = (b, s, c) => {
    if (!ultPhaseActive(s) || c.hpDamage <= 0 || !b.mech?.marksman) return;
    b.mech.marksman.value = Math.max(b.mech.marksman.value, s.focus || 0);
    b.mech.marksman.hurtThisRound = false;
  };

  defineSkillForms("archer-piercing-shot", [
    { id: "through", name: "Навылет", description: "Сквозной выстрел задевает остальных с половиной силы. Пробивание сохраняется, но сила по главной цели падает с 1,7 до 1,2.",
      patch: { powerMultiplier: 1.2, aoe: 0.5 } },
    { id: "press", name: "Упор", description: "Если есть дистанция, сила выстрела растёт с 1,7 до 2,3. После применения теряешь ступень, даже при промахе. Вплотную усиления нет.",
      on: {
        beforeHit(b, s, c) { if (c.skill?.id === "archer-piercing-shot" && isDirectHit(c) && range(b) > 0) c.power *= 2.3 / 1.7; },
        afterAction(b, s, c) { if (c.skill?.id === "archer-piercing-shot") moveRange(b, -1); }
      } }
  ]);
  defineSkillForms("archer-swift-volley", [
    { id: "pair", name: "Две на тетиве", description: "Две стрелы по 0,6 силы вместо одной на 1,2; прибавка от ловкости делится между ними. Больше попаданий для связок, но темп медленнее: 0,9 вместо 0,75.",
      patch: { hits: 2, powerMultiplier: 0.6, extraScaling: { agility: 0.25 }, tempo: 0.9 } },
    { id: "cover", name: "Прижать к земле", description: "Задевает остальных с половиной силы и замедляет на 20% на 2 хода. Сила по главной цели ниже: 0,8 вместо 1,2. Быстрый темп сохраняется.",
      patch: { powerMultiplier: 0.8, aoe: 0.5 }, addEffects: [eff("slow", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("archer-aimed-shot", [
    { id: "sight", name: "Пристрелка", description: "Даёт 2 сосредоточения после применения, даже при промахе. Сила ниже: 1,15 вместо 1,8; собственная прибавка к шансу крита 15% теряется.",
      patch: { powerMultiplier: 1.15, critBonus: 0 },
      on: { afterAction(b, s, c) { if (c.skill?.id === "archer-aimed-shot") bumpGauge(b, "marksman", 2, 5); } } },
    { id: "pin", name: "Приколоть плащ", description: "Замедляет на 30% на 3 хода, выигрывая время для прицела. Сила 1,35 вместо 1,8; пробивание 15% вместо 30%, своей прибавки к шансу крита нет.",
      patch: { powerMultiplier: 1.35, critBonus: 0, pierce: 0.15 }, addEffects: [eff("slow", 3, { value: 0.3 })] }
  ]);
  defineSkillForms("archer-barbed-arrow", [
    { id: "buried", name: "Засевший зубец", description: "Рана держится 5 ходов вместо 3 и тикает с силой 20% физического урона вместо 16%. Прямой выстрел слабее: 0,9 вместо 1,4.",
      patch: { powerMultiplier: 0.9 }, replaceEffects: [eff("bleed", 5, dot("physicalDamage", 0.2, 4))] },
    { id: "pull", name: "Выдернуть стрелу", description: "Не оставляет новой раны. Попадание снимает старую и выплачивает до трёх её оставшихся тиков сразу. Без кровотечения остаётся обычный выстрел.",
      replaceEffects: [], on: { afterHit(b, s, c) {
        if (c.skill?.id !== "archer-barbed-arrow" || !isDirectHit(c)) return;
        const wound = getEffect(b.enemy, "bleed");
        if (!wound || tm(b.hero, "perma:bleed") || !Number.isFinite(wound.duration)) return;
        const amount = wound.value * clamp(wound.duration, 0, 3);
        removeFx(b.enemy, "bleed");
        procDamage(b, amount, "Выдернуть стрелу", "blood");
      } } }
  ]);
  defineSkillForms("archer-hunters-mark", [
    { id: "herd", name: "Пометить стаю", description: "Выстрел задевает остальных с половиной силы. Метка на всех слабее и короче: 15% на 2 хода вместо 25% на 3. Сила главного попадания 0,55 вместо 0,9.",
      patch: { powerMultiplier: 0.55, aoe: 0.5 }, replaceEffects: [eff("mark", 2, { value: 0.15 })] },
    { id: "watch", name: "Следить за целью", description: "Только метит цель: 25% на 5 ходов вместо 3. Темп 0,6 вместо 0,8 помогает подготовке, но прямого урона больше нет.",
      patch: { attackType: null, powerMultiplier: 0, tempo: 0.6 }, replaceEffects: [eff("mark", 5, { value: 0.25 })] }
  ]);
  defineSkillForms("archer-arrow-storm", [
    { id: "fan", name: "Веер стрел", description: "Один широкий залп вместо трёх стрел по одной цели: сила 1,35 по главной, половина по остальным. По одиночному врагу теряешь часть урона и два попадания.",
      patch: { hits: 1, powerMultiplier: 1.35, aoe: 0.5 } },
    { id: "windup", name: "Разогнать тетиву", description: "Две стрелы по 0,5 вместо трёх по 0,7. Дают ускорение 20% на 2 хода; темп 0,7 вместо 1. Немедленный урон уступает подготовке следующей серии.",
      patch: { hits: 2, powerMultiplier: 0.5, tempo: 0.7 }, addEffects: [selfEff("haste", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("archer-snare", [
    { id: "tangle", name: "Широкая петля", description: "Ловушка замедляет на 40% вместо 30%. Оглушения больше нет, сила срабатывания ниже: 0,4 вместо 0,9. Надёжная задержка вместо резкого срыва хода.",
      patch: { trap: { power: 0.4, slow: 0.4 } } },
    { id: "toothed", name: "Смазать зубья", description: "Вместо замедления и шанса оглушения оставляет яд на 3 хода с силой 25% физического урона. Сила удара ловушки ниже: 0,6 вместо 0,9.",
      patch: { trap: { power: 0.6, poison: 0.25 }, element: "poison" } }
  ]);
  defineSkillForms("archer-pack-tactics", [
    { id: "lead", name: "Указать след", description: "Вместо броска волка ты выпускаешь стрелу силой 0,8. Метка сильнее и дольше: 20% на 4 хода вместо 15% на 2. Теряешь волчий удар, зато приём работает без волка.",
      patch: { special: null, attackType: "physical", powerMultiplier: 0.8 }, replaceEffects: [eff("mark", 4, { value: 0.2 })] },
    { id: "hold", name: "Держать добычу", description: "Вместо урона и метки замедляет цель на 30% на 3 хода. Волк, если рядом, лечится на 20% и заслоняет тебя на ход. Без зверя остаётся замедление.",
      patch: { special: null, attackType: null }, replaceEffects: [eff("slow", 3, { value: 0.3 })],
      on: { afterAction(b, s, c) {
        if (c.skill?.id !== "archer-pack-tactics") return;
        const wolf = findWolf(b.hero);
        if (wolf) { wolf.hp = Math.min(wolf.maxHp, Math.round(wolf.hp + wolf.maxHp * 0.2)); wolf.taunt = Math.max(wolf.taunt || 0, 1); }
      } } }
  ]);

  defineClassStyles("archer", [
    { id: "far-eye", name: "Дальний глаз", description: "На дальней дистанции одиночные прямые выстрелы сильнее на 8–17%. Залпы и выстрелы по группе награды не получают; первое сближение сразу обрывает её.",
      on: { beforeHit(b, s, c) {
        if (isDirectHit(c) && c.kind === "physical" && range(b) === 3 && !c.skill?.aoe && Number(c.skill?.hits || 1) === 1) c.mult *= 1 + stylePower(b);
      } } },
    { id: "shuttle", name: "Челночный шаг", description: "Выстрел перед настоящим отходом снижает входящий урон на 8–17% до следующего действия. Выстрел сразу после отхода сильнее на столько же. Нужны отход по откату и чередование.",
      on: {
        retreated(b, s) { s.cover = Boolean(s.shot); s.ready = true; s.retreated = true; },
        incoming(b, s, c) { if (s.cover) c.amount *= 1 - stylePower(b); },
        beforeHit(b, s, c) { if (s.ready && isDirectHit(c) && c.kind === "physical") c.mult *= 1 + stylePower(b); },
        afterAction(b, s, c) {
          if (c.type === "wait" && s.retreated) { s.retreated = false; s.shot = false; return; }
          s.cover = false; s.ready = false; s.shot = shotAction(c);
        }
      } },
    { id: "close-draw", name: "Ближний натяг", description: "Вплотную выстрелы не получают штрафа. Если предыдущее действие тоже было выстрелом вплотную, прямой урон выше на 8–17%. Цена: физические попадания теряют всю прибавку за дальность.",
      on: {
        beforeHit(b, s, c) {
          if (c.kind !== "physical") return;
          const distance = range(b);
          if (distance > 0) c.mult /= 1 + distance * (0.1 + tm(b.hero, "rangeBonus"));
          else {
            const close = Math.max(0.01, 0.8 + tm(b.hero, "closeBonus"));
            c.mult *= Math.max(1, close) / close;
            if (s.chain && isDirectHit(c)) c.mult *= 1 + stylePower(b);
          }
        },
        afterAction(b, s, c) { s.chain = shotAction(c) && range(b) === 0; }
      } }
  ]);

  defineUltimates("archer", "class", [
    { id: "arrow-rain", name: "Ливень стрел", description: "Восемь стрел силой 0,5 распределяются по живым врагам по очереди. Затем дистанция растёт на ступень. Против одной цели все стрелы достаются ей; пробивание ограничено 80%.", element: "air",
      run(b) {
        const target = b.enemy;
        const focus = b.focus;
        b.focus = focus ?? target.slot;
        for (let i = 0; i < 8; i += 1) {
          const alive = b.foes.filter(foe => foe.currentHp > 0);
          if (!alive.length) break;
          b.enemy = alive[i % alive.length];
          hit(b, 0.5, "Ливень стрел", { element: "air" });
        }
        b.enemy = target; b.focus = focus;
        moveRange(b, 1);
      }, on: { beforeHit: capPierce } },
    { id: "certain-shot", name: "Безошибочный выстрел", description: "Расходует всю дистанцию: точный одиночный выстрел силой 2,6–4,4 с пробиванием 40%. Даже вплотную есть базовая сила. После выстрела врагу больше не нужно сближаться.", element: "steel",
      run(b) { const distance = range(b); moveRange(b, -3); hit(b, 2.6 + distance * 0.6, "Безошибочный выстрел", { pierce: 0.4 }); },
      on: { beforeHit: capPierce } }
  ]);
  defineUltimates("marksman", "subclass", [
    { id: "last-breath", name: "До последнего вдоха", description: "Тратит всё сосредоточение на точный критический выстрел: сила 2,4–4,65, пробивание 30%. При пустой шкале базовый выстрел остаётся; прицел придётся собирать заново.", element: "steel",
      run(b) { const focus = takeFocus(b); hit(b, 2.4 + focus * 0.45, "До последнего вдоха", { forceCrit: true, pierce: 0.3 }); },
      on: { beforeHit: capPierce } },
    { id: "unshaken", name: "Невозмутимый прицел", description: "На три следующих действия ранения не снимают сосредоточение и не мешают его росту в начале хода. Каждый твой выстрел даёт ещё единицу за действие. Немедленного урона нет.", element: "air",
      run(b, s) { ultPhaseStart(s, 3); s.focus = b.mech?.marksman?.value || 0; },
      on: {
        incoming(b, s) { if (ultPhaseActive(s)) s.focus = b.mech?.marksman?.value || 0; },
        hurt: keepFocus,
        afterAction(b, s, c) { if (c.type === "ult") return; if (ultPhaseActive(s) && shotAction(c)) bumpGauge(b, "marksman", 1, 5); ultPhaseTick(s); },
        beforeHit: capPierce
      } }
  ]);
  defineUltimates("wild", "subclass", [
    { id: "read-tracks", name: "Чтение следов", description: "Одиночный выстрел силой 2,0 плюс 0,45 за разные беды: яд, рану, замедление, метку и надлом брони. Пробивает 20% защиты. Без подготовки остаётся базовый выстрел.", element: "steel",
      run(b) { const count = ["poison", "bleed", "slow", "mark", "armor_break"].filter(id => hasFx(b.enemy, id)).length; hit(b, 2 + count * 0.45, "Чтение следов", { pierce: 0.2 }); },
      on: { beforeHit: capPierce } },
    { id: "trap-trail", name: "Тропа западней", description: "Продлевает уже наложенные яд, раны и замедление всех врагов на 2 хода. На три следующих действия тики яда и ран сильнее на 25%, а урон от врага с одной из этих бед ниже на 20%.", element: "earth",
      run(b, s) {
        ultPhaseStart(s, 3);
        eachFoe(b, foe => ["poison", "bleed", "slow"].forEach(id => {
          const effect = getEffect(foe, id);
          if (effect && Number.isFinite(effect.duration) && !tm(b.hero, `perma:${id}`)) effect.duration += 2;
        }));
      }, on: {
        beforeTick(b, s, c) { if (ultPhaseActive(s) && ["poison", "bleed"].includes(c.id)) c.amount *= 1.25; },
        incoming(b, s, c) { if (ultPhaseActive(s) && ["poison", "bleed", "slow"].some(id => hasFx(b.enemy, id))) c.amount *= 0.8; },
        afterAction: tickPhase, beforeHit: capPierce
      } }
  ]);
  defineUltimates("sniper", "profession", [
    { id: "no-return", name: "Точка невозврата", description: "Тратит сосредоточение и метку цели на один точный критический выстрел. Сила 2,6–4,85, ещё +0,5 за метку; итоговое пробивание 80%. После выплаты подготовка исчезает.", element: "steel",
      run(b) {
        const marked = hasFx(b.enemy, "mark");
        const focus = takeFocus(b);
        removeFx(b.enemy, "mark");
        hit(b, 2.6 + focus * 0.45 + (marked ? 0.5 : 0), "Точка невозврата", { pierce: 0.8, forceCrit: true });
      }, on: { beforeHit: capPierce } },
    { id: "sighted-ground", name: "Пристрелянная позиция", description: "Возвращает дальнюю дистанцию и ставит метку 15% на 2 хода. До трёх следующих действий с выстрелом метка не истекает, а ранения не сбивают сосредоточение. Взрывного урона нет.", element: "earth",
      run(b, s) { moveRange(b, 3); s.shots = 3; s.target = b.enemy; s.focus = b.mech?.marksman?.value || 0; fx(b, "mark", 2, 0.15); },
      on: {
        enemyTurn(b, s) { if (s.shots > 0 && b.enemy === s.target) { const mark = getEffect(b.enemy, "mark"); if (mark) mark.duration = Math.max(2, mark.duration); } },
        incoming(b, s) { if (s.shots > 0) s.focus = b.mech?.marksman?.value || 0; },
        hurt(b, s, c) { if (s.shots > 0) keepFocus(b, { left: 1, focus: s.focus }, c); },
        afterAction(b, s, c) { if (s.shots > 0 && shotAction(c)) s.shots -= 1; },
        beforeHit: capPierce
      } }
  ]);
  defineUltimates("stormshot", "profession", [
    { id: "empty-quiver", name: "Пустой колчан", description: "Шесть точных стрел силой 0,55 в выбранную цель. Каждый другой враг получает шесть стрел половинной силы. Подготовки не требует, но ни дистанции, ни защиты не даёт.", element: "air",
      run(b) { const target = b.enemy; eachFoe(b, foe => { for (let i = 0; i < 6 && foe.currentHp > 0; i += 1) hit(b, foe === target ? 0.55 : 0.275, "Пустой колчан", { element: "air" }); }); },
      on: { beforeHit: capPierce } },
    { id: "drawn-storm", name: "Натянутая буря", description: "На три следующих действия выстрелы занимают на 20% меньше времени и дают ещё единицу шквала за действие. Сама фаза не выпускает стрел: для выплаты нужно продолжать стрелять.", element: "air",
      run(b, s) { ultPhaseStart(s, 3); },
      on: {
        afterAction(b, s, c) {
          if (c.type === "ult") return;
          if (ultPhaseActive(s) && shotAction(c)) { c.tempo = Math.max(0.55, c.tempo * 0.8); bumpGauge(b, "stormshot", 1, 6); }
          ultPhaseTick(s);
        }, beforeHit: capPierce
      } }
  ]);
  defineUltimates("ranger", "profession", [
    { id: "shut-snares", name: "Захлопнуть силки", description: "Расходует ловушку: двойная сила по цели, половина этой силы по остальным; её яд и задержка тоже срабатывают. Без ловушки — силки с ударом 1,8 и замедлением 30% по цели.", element: "earth",
      run(b) {
        const state = b.mech?.ranger;
        const trap = state?.trap || { power: 0.9, slow: 0.15, element: "earth" };
        if (state) state.trap = null;
        const target = b.enemy;
        eachFoe(b, foe => spring(b, trap, foe === target ? 2 : 1, "Захлопнуть силки"));
      }, on: { beforeHit: capPierce } },
    { id: "spare-loop", name: "Запасная петля", description: "На три следующих действия каждая установленная ловушка после первого срабатывания взводится ещё раз с половинной силой удара, яда и контроля. Без ловушки ставит обычный силок.", element: "earth",
      run(b, s) {
        ultPhaseStart(s, 3);
        const state = b.mech?.ranger;
        if (state && !state.trap) state.trap = { name: "Силок", power: 0.9, slow: 0.3, stun: 0.35, element: "earth" };
        s.pending = state?.trap || null; s.fired = false;
      }, on: {
        // The ranger clears its trap before performHeroHit. Capture it when
        // installed, then observe its hit; enemyTurn comes after the mechanic.
        beforeHit(b, s, c) { if (ultPhaseActive(s) && s.pending && !c.skill && c.noEcho && c.label === s.pending.name) s.fired = true; capPierce(b, s, c); },
        enemyTurn(b, s) {
          if (!s.fired) return;
          const state = b.mech?.ranger;
          if (ultPhaseActive(s) && state && !state.trap && s.pending && !s.pending.archerRepeat) state.trap = halfTrap(s.pending);
          s.pending = null; s.fired = false;
        },
        afterAction(b, s, c) {
          tickPhase(b, s, c);
          const trap = b.mech?.ranger?.trap;
          if (ultPhaseActive(s) && trap && !trap.archerRepeat) s.pending = trap;
          if (!ultPhaseActive(s)) s.pending = null;
        }
      } }
  ]);
  defineUltimates("beastmaster", "profession", [
    { id: "drive-prey", name: "Гони добычу", description: "Ты стреляешь с силой 2,2; живой волк сразу кусает на две свои силы и оставляет рану на 3 хода с силой 30% физического урона. Без волка остаётся выстрел; защиты нет.", element: "blood",
      run(b) {
        hit(b, 2.2, "Гони добычу", { element: "blood" });
        const wolf = findWolf(b.hero);
        if (wolf && wolf.hp > 0 && b.enemy.currentHp > 0) { procDamage(b, wolf.power * 2, "Волчий укус", "blood"); fx(b, "bleed", 3, physicalDot(b, 0.3)); }
      }, on: { beforeHit: capPierce } },
    { id: "faithful", name: "Верный рядом", description: "Возвращает павшего волка или полностью лечит живого. На три следующих действия волк дополнительно принимает 40% урона попавших по тебе атак. Перехват тратит его здоровье и может его убить.", element: "earth",
      run(b, s) { if (!findWolf(b.hero)) summonWolf(b); const wolf = findWolf(b.hero); if (wolf) wolf.hp = wolf.maxHp; ultPhaseStart(s, 3); },
      on: {
        incoming(b, s, c) {
          const wolf = findWolf(b.hero);
          if (!ultPhaseActive(s) || c.parried || !wolf || wolf.hp <= 0) return;
          const amount = Math.min(wolf.hp, Math.max(0, Math.round(c.amount * 0.4)));
          wolf.hp -= amount; c.amount -= amount;
          if (amount > 0) { emit(b, "summonHurt", { amount, name: wolf.name }); logEvent(b, `Волк перехватывает ${amount} урона.`, "Зверь"); }
          if (wolf.hp <= 0) removeSummon(b, wolf);
        }, afterAction: tickPhase, beforeHit: capPierce
      } }
  ]);

  // Shared schools are read-only here: stable new IDs live in our own school.
  defineSchool("x-archer", "Приёмы охоты", "Недостающие развилки лучника и ключевые модулей пути.", { classes: ["archer"] });
  const talent = (tier, kind, name, description, spec) => {
    T("x-archer", tier, kind, name, description, spec);
    return TALENT_SCHOOLS["x-archer"].talents.slice(-1)[0];
  };
  // repeatPayoff sees the already changed b.repeat.id, so its switch penalty
  // never fires. Keep the old definition intact and track our own last skill.
  const oneArrow = talent(4, "key", "Одна стрела", "Привыкание врагов не действует. Повтор навыка усиливает его до 40%, но первый навык после смены слабее на 20%.", {
    mods: { adaptImmune: 1 }, on: {
      beforeHit(b, s, c) {
        if (!isDirectHit(c) || !c.skill) return;
        c.mult *= s.last && s.last !== c.skill.id ? 0.8 : 1 + Math.min(5, Math.max(0, Number(b.repeat?.count || 1) - 1)) * 0.08;
      },
      afterAction(b, s, c) { if (c.skill) s.last = c.skill.id; }
    }
  });
  const closeOnly = (b) => { const state = b.mech?.core_archer; if (state) state.value = 0; };
  // The old "Упор" changes only startRange, allowing retreat to erase its price.
  const pointBlank = talent(4, "key", "Без пути назад", "Физические попадания вплотную сильнее: множитель дистанции 1,35 вместо 0,8. Цена: дистанция всегда нулевая, даже после отхода и ультимейта. Враг не тратит ходы на сближение.", {
    mods: { closeBonus: 0.55 }, on: { start: closeOnly, turnStart: closeOnly, retreated: closeOnly, afterAction: closeOnly }
  });
  const pathKeys = {};
  [
    ["sniper", "Рваный выход", "Крит «Выстрела в голову» оставляет рану на 3 хода с силой 25% атаки. Цена: весь прямой урон ниже на 12%.", { dmg: -0.12 }],
    ["stormshot", "Град под огнём", "Каждая шестая стрела бесплатных залпов бьёт вдвое сильнее и замедляет на 20% на 2 хода. Цена: входящий урон выше на 15%.", { taken: 0.15 }],
    ["beastmaster", "Общая доля", "Пока волк рядом, твои попадания сильнее на 10%, входящий урон ниже на 10%. Цена: запас твоего здоровья меньше на 20% даже после гибели волка.", { maxHpPct: -0.2 }]
  ].forEach(([id, name, description, mods]) => {
    pathKeys[id] = talent(4, "key", name, description, { mods, on: TALENTS[`${id}/3`].on });
  });
  pathKeys.ranger = talent(4, "key", "Сеть с пылью", "Срабатывание силка или капкана ослепляет цель на 20% на 2 хода. Цена: весь прямой урон ниже на 15%; выигрываешь через ловушки и яд.", {
    mods: { dmg: -0.15 }, on: { beforeHit(b, s, c) { if (b.mech?.ranger && trapHit(c)) fx(b, "blind", 2, 20); } }
  });
  const bitter = talent(4, "key", "Горький настой", "Наложенный яд сильнее на 35%, но держится на ход меньше. Прямой урон ниже на 15%. Сильные короткие дозы требуют чаще возвращаться к отравлению.", {
    mods: { "val:poison": 0.35, "dur:poison": -1, dmg: -0.15 }
  });
  const dust = talent(1, "make", "Пыль из-под ног", "Настоящий отход ослепляет выбранного врага на 12% на ход. Ожидание на откате пыли не поднимает.", {
    on: { retreated(b) { fx(b, "blind", 1, 12); } }
  });
  const falseTrail = talent(4, "key", "Ложный след", "Отход готовит защиту: первое попадание по тебе наносит на 60% меньше урона. Цена: весь входящий урон выше на 20%; между отходами ты уязвимее.", {
    mods: { taken: 0.2 }, on: {
      retreated(b, s) { s.ready = true; },
      incoming(b, s, c) { if (s.ready && !c.parried && c.amount > 0) { s.ready = false; c.amount *= 0.4; } }
    }
  });
  const returningShot = talent(4, "key", "Выстрел на отходе", "Первое действие с выстрелом сразу после отхода занимает на 35% меньше времени. Цена: остальные действия с выстрелом медленнее на 15%; пауза рвёт подготовку.", {
    on: {
      retreated(b, s) { s.retreated = true; },
      afterAction(b, s, c) {
        if (c.type === "wait" && s.retreated) { s.retreated = false; s.ready = true; return; }
        if (shotAction(c)) c.tempo = Math.max(0.55, c.tempo * (s.ready ? 0.65 : 1.15));
        s.ready = false;
      }
    }
  });

  const sub = n => ({ stage: "subclass", map: { marksman: `marksman/${n}`, wild: `wild/${n}` } });
  const prof = n => ({ stage: "profession", map: Object.fromEntries(["sniper", "stormshot", "ranger", "beastmaster"].map(id => [id, id === "beastmaster" && n === 1 ? "pack/1" : `${id}/${n}`])) });
  const slots = (ids, modules = {}) => ids.map((id, i) => ({
    key: ["a1", "a2", "a3", "a4", "b1", "b2", "c1", "c2", "c3", "d1", "d2"][i],
    tier: i < 4 ? 1 : i < 6 ? 2 : i < 9 ? 3 : 4,
    talent: id,
    ...(i < 4 ? {} : { afterAny: [null, null, null, null, ["a1", "a2"], ["a3", "a4"], ["b1"], ["b2"], ["b1"], ["c1", "c2"], ["c2", "c3"]][i] }),
    ...(modules[i] ? { module: modules[i] } : {})
  }));
  defineTalentBoard("archer", [
    { id: "c-archer", name: "Охотничье дело", description: "Дистанция, раны и задержка добычи. Шесть мест меняются с выбором пути. Универсальный ключевой позволяет остаться вплотную ценой потери отхода.",
      slots: slots(["c-archer/1", "c-archer/2", "bleed/2", "control/3", "c-archer/3", "c-archer/4", "c-archer/5", "c-archer/6", "bleed/8", oneArrow, pointBlank],
        { 4: sub(1), 5: sub(2), 6: sub(3), 7: prof(1), 8: prof(2), 9: { stage: "profession", map: pathKeys } }) },
    { id: "crit", name: "Точность", description: "Первый выстрел, серия критов или удар навылет. Выбирай силу критов ценой общего урона либо пробивание ценой шанса крита.",
      slots: slots(["crit/2", "crit/3", "power/2", "power/3", "crit/4", "crit/5", "crit/7", "crit/8", "crit/10", "crit/9", "power/9"]) },
    { id: "poison", name: "Яд", description: "Наложить дозу, накопить её и переждать лихорадку. Бесконечный слабый яд или короткий концентрат требуют разного ритма стрельбы.",
      slots: slots(["poison/2", "poison/3", "bleed/3", "poison/1", "poison/4", "poison/6", "poison/7", "poison/8", "poison/11", "poison/10", bitter]) },
    { id: "evasion", name: "Увёртливость", description: "Отход и промахи врага готовят ответ, лечение и защиту. Большой шанс уклонения стоит здоровья, защита после отхода — уязвимости между шагами.",
      slots: slots(["evasion/1", "evasion/2", "evasion/3", dust, "evasion/4", "evasion/5", "evasion/7", "evasion/8", "evasion/10", "evasion/9", falseTrail]) },
    { id: "tempo", name: "Темп", description: "Разгон, передышки и действия подряд. Можно ускорить весь бой ценой защиты или готовить быстрые выстрелы отходом, замедляя остальные.",
      slots: slots(["tempo/1", "tempo/2", "tempo/3", "crit/6", "tempo/4", "tempo/5", "tempo/7", "tempo/8", "bleed/6", "tempo/9", returningShot]) }
  ]);
})();
