// Warrior build content. Kept in a closure: only the build registries are extended.
(() => {
  const hit = (b, power, label, extra = {}) => performHeroHit(b, {
    kind: "physical", power, label, element: "steel", sure: true,
    noEcho: true, proc: true, ...extra
  });
  const take = (b, id, max) => {
    const state = b.mech?.[id];
    const value = clamp(Number(state?.value || 0), 0, max);
    if (state) state.value = 0;
    return value;
  };
  const shield = (b, ratio) => {
    if (b.hero.currentHp <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const e = fx(b, "shield", 3, Math.min(cap,
      effectValue(b.hero, "shield") + Math.round(b.hero.maxHp * ratio)), { self: true });
    if (e) e.value = Math.min(cap, e.value);
  };
  const sweep = (b, power, label, element, after) => {
    const focus = b.enemy;
    eachFoe(b, foe => {
      hit(b, power * (foe === focus ? 1 : 0.5), label, { element });
      if (foe.currentHp > 0) after?.(foe);
    });
  };
  // heroAction sends afterAction for the ultimate itself too. It is not one
  // of the three following actions promised by a phase's description.
  const tickPhase = (b, s, c) => { if (c.type !== "ult") ultPhaseTick(s); };

  defineSkillForms("warrior-raskol", [
    { id: "sweep", name: "Размашистый", description: "Задевает остальных врагов с половиной силы, но удар по главной цели слабее: 1,35 вместо 1,85.",
      patch: { powerMultiplier: 1.35, aoe: 0.5 } },
    { id: "open", name: "Вскрывающий", description: "Вместо части прямого урона надламывает броню цели на 25% на 2 хода. Сила удара: 1,3 вместо 1,85.",
      patch: { powerMultiplier: 1.3 }, addEffects: [eff("armor_break", 2, { value: 0.25 })] }
  ]);
  defineSkillForms("warrior-bastion-oath", [
    { id: "brace", name: "Стальная клятва", description: "Вместо лечения и регенерации даёт щит от силы лечения и закалку на 2 хода. Здоровье под щитом само не вернётся.",
      patch: { selfHealMultiplier: 0 }, replaceEffects: [
        selfEff("shield", 3, dot("healingPower", 1.25, 12)),
        selfEff("fortify", 2, { value: 0.15 })
      ], on: { afterAction(b, s, c) {
        if (c.skill?.id !== "warrior-bastion-oath") return;
        const e = getEffect(b.hero, "shield");
        if (e) e.value = Math.min(e.value, Math.round(b.hero.maxHp * 0.6));
      } } },
    { id: "mend", name: "Долгая клятва", description: "Немедленного лечения нет. Вместо него регенерация от силы лечения: 50% за тик, 4 хода. Рану придётся переждать.",
      patch: { selfHealMultiplier: 0 }, replaceEffects: [selfEff("regeneration", 4, dot("healingPower", 0.5, 7))] }
  ]);
  defineSkillForms("warrior-savage-swing", [
    { id: "deep", name: "Глубокий надрез", description: "Бьёт только выбранную цель. Прямой удар слабее: 1,2 вместо 1,6; зато рана держится 4 хода с силой 28% физического урона.",
      patch: { powerMultiplier: 1.2, aoe: 0 }, replaceEffects: [eff("bleed", 4, dot("physicalDamage", 0.28, 5))] },
    { id: "scatter", name: "Оттеснить строй", description: "Вместо раны ошеломляет врагов на 2 хода. Сила по главной цели прежняя, по остальным — 50% вместо 70%.",
      patch: { aoe: 0.5 }, replaceEffects: [eff("stagger", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("warrior-shield-bash", [
    { id: "wall", name: "Подпереть стену", description: "Вместо оглушения кладёт камень в стену. Удар слабее: 0,85 вместо 1,2. Камень даётся один раз за применение, даже при промахе.",
      patch: { powerMultiplier: 0.85 }, replaceEffects: [], on: { afterAction(b, s, c) {
        if (c.skill?.id === "warrior-shield-bash") bumpGauge(b, "bulwark", 1, 5);
      } } },
    { id: "ring", name: "Гул щита", description: "Вместо шанса оглушить одну цель ошеломляет группу на 2 хода. Удар слабее: 0,9 вместо 1,2; по остальным — половина силы.",
      patch: { powerMultiplier: 0.9, aoe: 0.5 }, replaceEffects: [eff("stagger", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("warrior-rend", [
    { id: "long", name: "Рваный край", description: "Прямой удар слабее: 0,9 вместо 1,4. Рана держится 5 ходов вместо 3 и тикает с силой 24% физического урона вместо 20%.",
      patch: { powerMultiplier: 0.9 }, replaceEffects: [eff("bleed", 5, dot("physicalDamage", 0.24, 4))] },
    { id: "tear", name: "Сорвать повязку", description: "Не оставляет новой раны. После попадания снимает старую, выплачивая до трёх её тиков сразу. Без раны остаётся обычный удар.",
      replaceEffects: [], on: { afterHit(b, s, c) {
        if (c.skill?.id !== "warrior-rend" || !isDirectHit(c)) return;
        const e = getEffect(b.enemy, "bleed");
        if (!e) return;
        const amount = e.value * Math.min(3, Math.max(0, e.duration));
        removeFx(b.enemy, "bleed");
        procDamage(b, amount, "Сорвать повязку", "blood");
      } } }
  ]);
  defineSkillForms("warrior-hammer-blow", [
    { id: "fault", name: "Заложить разлом", description: "Даёт три трещины вместо двух, но прямой удар слабее: 1,15 вместо 1,7. Подготовка обрушения важнее немедленного урона.",
      patch: { powerMultiplier: 1.15, cracks: 3 } },
    { id: "shockwave", name: "Удар по строю", description: "Задевает остальных с половиной силы и ошеломляет на 2 хода. Главный удар слабее: 1,25 вместо 1,7; даёт одну трещину вместо двух.",
      patch: { powerMultiplier: 1.25, aoe: 0.5, cracks: 1 }, addEffects: [eff("stagger", 2, { value: 0.15 })] }
  ]);
  defineSkillForms("warrior-shield-wall", [
    { id: "answer", name: "Ответный заслон", description: "Щит слабее: 1,0 защиты вместо 1,5. Пока он держится, первый поглощённый удар за применение вызывает ответ с силой 0,8.",
      patch: { shieldEffect: { id: "shield", duration: 3, valueFormula: { sourceStat: "physicalDefense", multiplier: 1, minValue: 12 } } },
      on: {
        afterAction(b, s, c) { if (c.skill?.id === "warrior-shield-wall") { s.ready = true; const e = getEffect(b.hero, "shield"); if (e) { e.value = Math.min(e.value, Math.round(b.hero.maxHp * 0.6)); s.shield = e; } } },
        hurt(b, s, c) { if (!s.ready || c.absorbed <= 0 || (getEffect(b.hero, "shield") && getEffect(b.hero, "shield") !== s.shield)) return; s.ready = false; hit(b, 0.8, "Ответный заслон"); },
        turnStart(b, s) { if (getEffect(b.hero, "shield") !== s.shield) s.ready = false; }
      } },
    { id: "masonry", name: "Живая кладка", description: "Вместо щита достраивает стену на два камня и даёт закалку на 2 хода. Отдельного запаса поглощения нет.",
      patch: { specialAction: null }, replaceEffects: [selfEff("fortify", 2, { value: 0.2 })],
      on: { afterAction(b, s, c) { if (c.skill?.id === "warrior-shield-wall") bumpGauge(b, "bulwark", 2, 5); } } }
  ]);
  defineSkillForms("warrior-riposte", [
    { id: "invite", name: "Открыть линию", description: "Сохраняет парирование и метит цель на 2 хода: входящий урон по ней выше на 20%. Прямой удар слабее: 1,0 вместо 1,5.",
      patch: { powerMultiplier: 1 }, addEffects: [eff("mark", 2, { value: 0.2 })] },
    { id: "press", name: "Перехватить темп", description: "Вместо парирования даёт единицу темпа для «Вихря клинка». Удар прежней силы, но темп действия 1,0 вместо 0,8: ответ врага придёт раньше.",
      patch: { armParry: false, tempo: 1 }, on: { afterAction(b, s, c) {
        if (c.skill?.id === "warrior-riposte") bumpGauge(b, "duelist", 1, 3);
      } } }
  ]);

  defineClassStyles("warrior", [
    { id: "reserve", name: "Держать напор", description: "При запасе от 70 напора прямые удары сильнее на 8–17%. Проверяется запас после оплаты навыка: большая трата сразу лишает прибавки.",
      on: { beforeHit(b, s, c) { if (isDirectHit(c) && b.hero.currentMana >= 70) c.mult *= 1 + stylePower(b); } } },
    { id: "release", name: "Разрядка", description: "Навык, оставивший 0 напора, готовит один обычный удар: +8–17% урона и 8–17 напора при попадании. Высокий запас этой награды не даёт.",
      on: {
        beforeHit(b, s, c) {
          if (!isDirectHit(c)) return;
          if (c.skill && b.hero.currentMana === 0) s.empty = true;
          if (!c.skill && s.ready) { c.mult *= 1 + stylePower(b); s.ready = false; s.refill = true; }
        },
        afterHit(b, s, c) {
          if (!isDirectHit(c) || c.skill || !s.refill) return;
          s.refill = false;
          procMana(b, stylePower(b));
        },
        afterAction(b, s, c) {
          if (c.type === "skill" && (s.empty || b.hero.currentMana === 0)) s.ready = true;
          s.empty = false; s.refill = false;
        }
      } },
    { id: "alternate", name: "Смена стойки", description: "Навык после стойки сильнее на 8–17%. Стойка сразу после навыка снимает ещё 8–17% входящего урона. Повторы и промежуточные действия рвут связку.",
      on: {
        beforeHit(b, s, c) { if (isDirectHit(c) && c.skill && s.last === "guard") c.mult *= 1 + stylePower(b); },
        incoming(b, s, c) { if (b.guard && s.braced) c.amount *= 1 - stylePower(b); },
        afterAction(b, s, c) { s.braced = c.type === "guard" && s.last === "skill"; s.last = ["guard", "skill"].includes(c.type) ? c.type : null; }
      } }
  ]);

  defineUltimates("warrior", "class", [
    { id: "breach", name: "Пролом строя", description: "Тратит весь напор. Удар силой 2,0–4,0 по цели, половина силы по остальным. Надламывает броню всех на 25% на 3 хода. При нуле напора базовый удар сохраняется.", element: "steel",
      run(b) {
        const resource = clamp(b.hero.currentMana, 0, 100);
        b.hero.currentMana = 0;
        sweep(b, 2 + resource * 0.02, "Пролом строя", "steel", () => fx(b, "armor_break", 3, 0.25));
      } },
    { id: "last-stand", name: "Последний рубеж", description: "Даёт щит на 25% здоровья. Следующие три стойки добавляют по 10% здоровья к щиту. Требует действий на защиту; немедленного удара нет.", element: "steel",
      run(b, s) { s.guards = 3; shield(b, 0.25); },
      on: { afterAction(b, s, c) { if (c.type === "guard" && s.guards > 0) { s.guards -= 1; shield(b, 0.1); } } } }
  ]);
  defineUltimates("fury", "subclass", [
    { id: "rush", name: "Бешеный натиск", description: "Расходует всю ярость на один удар: сила 2,6 при пустой шкале, до 5,6 при полной. Весь урон достаётся выбранной цели; накопление ярости придётся начать заново.", element: "blood",
      run(b) { const value = take(b, "fury", 100); hit(b, 2.6 + value * 0.03, "Бешеный натиск", { element: "blood" }); } },
    { id: "warm-blood", name: "Неостывшая кровь", description: "На три следующих действия сохраняет текущую ярость от расходования. Первая полученная рана между твоими действиями лечит на 6% здоровья. При пустой шкале лечение всё равно работает.", element: "blood",
      run(b, s) { ultPhaseStart(s, 3); s.floor = clamp(b.mech?.fury?.value || 0, 0, 100); s.healed = false; },
      on: {
        beforeHit(b, s, c) {
          if (!ultPhaseActive(s) || !b.mech?.fury || b.mech.fury.value >= s.floor) return;
          const old = b.mech.fury.value;
          b.mech.fury.value = s.floor;
          // Mechanics run before build hooks; restore the damage of preserved fury too.
          c.mult *= (1 + Math.floor(s.floor / 10) * 0.03) / (1 + Math.floor(old / 10) * 0.03);
        },
        afterHit(b, s) { if (ultPhaseActive(s) && b.mech?.fury) b.mech.fury.value = Math.max(s.floor, b.mech.fury.value); },
        hurt(b, s, c) { if (ultPhaseActive(s) && !s.healed && c.hpDamage > 0 && b.hero.currentHp > 0) { s.healed = true; procHeal(b, 0.06, "Неостывшая кровь"); } },
        afterAction(b, s, c) {
          if (c.type === "ult") return;
          if (ultPhaseActive(s) && b.mech?.fury) b.mech.fury.value = Math.max(s.floor, b.mech.fury.value);
          s.healed = false; ultPhaseTick(s);
        }
      } }
  ]);
  defineUltimates("bulwark", "subclass", [
    { id: "collapse", name: "Обвал стены", description: "Расходует все камни стены. Удар по цели силой 1,8–3,8, по остальным — половина. Ошеломляет группу на 25% на 3 хода. Без камней остаётся базовый удар, но защита стены теряется.", element: "earth",
      run(b) { const stones = take(b, "bulwark", 5); sweep(b, 1.8 + stones * 0.4, "Обвал стены", "earth", () => fx(b, "stagger", 3, 0.25)); } },
    { id: "walking-fort", name: "Крепость на ногах", description: "Достраивает стену до пяти камней. На три следующих действия ранения не снимают камни; тратить их на свои приёмы можно. Немедленного урона нет.", element: "earth",
      run(b, s) { bumpGauge(b, "bulwark", 5, 5); ultPhaseStart(s, 3); },
      on: {
        incoming(b, s) { if (ultPhaseActive(s)) s.wall = b.mech?.bulwark?.value || 0; },
        hurt(b, s, c) { if (ultPhaseActive(s) && c.hpDamage > 0 && b.mech?.bulwark) b.mech.bulwark.value = Math.max(b.mech.bulwark.value, s.wall || 0); },
        afterAction: tickPhase
      } }
  ]);
  defineUltimates("berserk", "profession", [
    { id: "blood-price", name: "Цена крови", description: "Платит 20% текущего здоровья, оставляя хотя бы 1. Удар силой 3,2 и рана на 3 хода с силой 35% физического урона. Защиты не даёт: низкое здоровье остаётся риском.", element: "blood",
      run(b) {
        b.hero.currentHp = Math.max(1, b.hero.currentHp - Math.floor(b.hero.currentHp * 0.2));
        hit(b, 3.2, "Цена крови", { element: "blood" });
        if (b.enemy.currentHp > 0) fx(b, "bleed", 3, Math.max(4, Math.round(b.hero.physicalDamage * 0.35)));
      } },
    { id: "not-yet", name: "Не время падать", description: "На три следующих действия входящий урон ниже на 25%. Ниже 35% здоровья прямые попадания дополнительно лечат на 20% урона, но не более 8% здоровья за действие. Бессмертия нет.", element: "blood",
      run(b, s) { ultPhaseStart(s, 3); s.healing = 0; },
      on: {
        incoming(b, s, c) { if (ultPhaseActive(s)) c.amount *= 0.75; },
        beforeHit(b, s, c) { if (isDirectHit(c)) s.low = hpRatio(b.hero) < 0.35; },
        afterHit(b, s, c) {
          if (!ultPhaseActive(s) || !isDirectHit(c) || !s.low || c.hpDamage <= 0) return;
          const amount = Math.max(0, Math.min(c.hpDamage * 0.2, b.hero.maxHp * 0.08 - s.healing));
          s.healing += amount;
          if (amount > 0) healUnit(b, b.hero, amount, "Не время падать");
        },
        afterAction(b, s, c) { tickPhase(b, s, c); s.healing = 0; }
      } }
  ]);
  defineUltimates("breaker", "profession", [
    { id: "fault-line", name: "Линия разлома", description: "Тратит трещины: удар силой 2,2–4,7 с пробиванием 30%. Остальные получают половину силы. При пустой шкале базовый удар остаётся; подготовку трещин нужно повторить.", element: "earth",
      run(b) {
        const cracks = take(b, "breaker", 5);
        const focus = b.enemy;
        eachFoe(b, foe => hit(b, (2.2 + cracks * 0.5) * (foe === focus ? 1 : 0.5), "Линия разлома", { element: "earth", pierce: 0.3 }));
      } },
    { id: "siege", name: "Осадный ритм", description: "Следующие три физических навыка дают дополнительную трещину. Обрушение брони от них даёт щит на 12% здоровья. Немедленного удара нет: для выплаты нужно продолжать осаду.", element: "earth",
      run(b, s) { s.skills = 3; },
      on: { afterAction(b, s, c) {
        if (!(s.skills > 0) || c.skill?.attackType !== "physical") return;
        s.skills -= 1;
        const state = b.mech?.breaker;
        if (!state || b.enemy.currentHp <= 0) return;
        // The ordinary mechanic has already added its cracks (or collapsed).
        if (state.value === 0 && c.skill.special !== "break_armor") { shield(b, 0.12); bumpGauge(b, "breaker", 1, 5); }
        else if (state.value >= 4) {
          state.value = 0;
          fx(b, "armor_break", 3, 0.5);
          if (!b.enemy.isBoss) applyStun(b, b.enemy, b.hero, 99);
          shield(b, 0.12);
        } else bumpGauge(b, "breaker", 1, 5);
      } } }
  ]);
  defineUltimates("guardian", "profession", [
    { id: "shield-debt", name: "Долг щита", description: "Расходует всё возмездие на выбранную цель: удар силой 2,0 плюс 90% накопленного запаса. Работает и без запаса, но оставляет тебя без подготовки для «Кары стража».", element: "steel",
      run(b) { const stored = take(b, "guardian", b.hero.maxHp); hit(b, 2, "Долг щита", { flat: stored * 0.9 }); } },
    { id: "circle", name: "Круг защиты", description: "Тратит возмездие на щит: 25% здоровья плюс 40% запаса, всего до 60% здоровья. Первые три попавшие атаки врага вызывают ответ силой 0,7, один раз за атаку.", element: "steel",
      run(b, s) { const stored = take(b, "guardian", b.hero.maxHp); shield(b, 0.25 + stored / b.hero.maxHp * 0.4); s.replies = 3; },
      on: {
        enemyAttack(b, s) { s.answer = s.replies > 0; },
        incoming(b, s, c) { if (!s.answer || c.parried) return; s.answer = false; s.replies -= 1; hit(b, 0.7, "Круг защиты"); }
      } }
  ]);
  defineUltimates("duelist", "profession", [
    { id: "perfect-cut", name: "Один безупречный разрез", description: "Расходует весь темп: точный одиночный удар силой 2,5–4,6 с пробиванием 40%. Без темпа базовый удар сохраняется. Дополнительные удары «Вихря клинка» придётся готовить заново.", element: "steel",
      run(b) { const tempo = take(b, "duelist", 3); hit(b, 2.5 + tempo * 0.7, "Один безупречный разрез", { pierce: 0.4 }); } },
    { id: "invitation", name: "Приглашение к выпаду", description: "На три следующих действия взводит по одному парированию между твоими ходами. Оно отбивает физический удар и вызывает обычную контратаку. Против магии это окно защиты не работает.", element: "steel",
      run(b, s) { ultPhaseStart(s, 3); if (b.mech?.duelist) b.mech.duelist.armed = true; },
      on: { afterAction(b, s, c) {
        if (c.type === "ult" || !ultPhaseActive(s)) return;
        ultPhaseTick(s);
        if (b.mech?.duelist) b.mech.duelist.armed = ultPhaseActive(s) || Boolean(c.skill?.armParry);
      } } }
  ]);

  // The old blood keystone is unbounded. Blood and tempo also lack a second
  // meaningful keystone. Append replacements; never renumber the old IDs.
  T("bleed", 4, "key", "Незаживающий след", "Раны держатся на 2 хода дольше, но прямой урон ниже на 15%. Кровотечение не получает бесконечного роста.",
    { mods: { "dur:bleed": 2, dmg: -0.15 } });
  const bloodLong = TALENT_SCHOOLS.bleed.talents.slice(-1)[0];
  T("bleed", 4, "key", "Кровь за кровь", "Тики ран лечат ещё на 30% своего урона, но запас здоровья меньше на 20%. Для лечения нужно поддерживать кровотечение.",
    { mods: { maxHpPct: -0.2 }, on: { tick(b, s, c) { if (c.id === "bleed" && b.hero.currentHp > 0) healUnit(b, b.hero, c.amount * 0.3, "Кровь за кровь"); } } });
  const bloodLife = TALENT_SCHOOLS.bleed.talents.slice(-1)[0];
  T("tempo", 4, "key", "Размеренный шаг", "Навык сразу после стойки занимает на 25% меньше времени, но без такой подготовки навыки медленнее на 15%. Любое другое действие рвёт подготовку.",
    { on: { afterAction(b, s, c) { if (c.type === "skill") c.tempo = Math.max(0.55, c.tempo * (s.ready ? 0.75 : 1.15)); s.ready = c.type === "guard"; } } });
  const measured = TALENT_SCHOOLS.tempo.talents.slice(-1)[0];

  // repeatPayoff reads b.repeat after it has already changed to the new skill,
  // so its old switch penalty cannot fire. Keep that legacy talent untouched;
  // this board needs a universal keystone whose stated price actually applies.
  T("c-warrior", 4, "key", "Верность приёму", "Привыкание врагов не действует. Повтор одного навыка усиливает его до 40%, но первый приём после смены навыка слабее на 20%.",
    { mods: { adaptImmune: 1 }, on: {
      beforeHit(b, s, c) {
        if (!isDirectHit(c) || !c.skill) return;
        c.mult *= s.last && s.last !== c.skill.id ? 0.8 : 1 + Math.min(5, Math.max(0, Number(b.repeat?.count || 1) - 1)) * 0.08;
      },
      afterAction(b, s, c) { if (c.skill) s.last = c.skill.id; }
    } });
  const loyal = TALENT_SCHOOLS["c-warrior"].talents.slice(-1)[0];

  // Profession triads have no keystone with a price. Preserve the third
  // talent's existing rule in a new, priced module instead of mutating it.
  const pathKeys = {};
  [
    ["berserk", "Последний бой", "После спасения от смерти три прямых попадания лечат по 10% здоровья. Цена: входящий урон выше на 15% весь бой.", { taken: 0.15 }],
    ["breaker", "Острая крошка", "Наложенный надлом брони оставляет рану на 3 хода. Цена: прямой урон ниже на 12%; выигрываешь через осколки и кровотечение.", { dmg: -0.12 }],
    ["guardian", "Тяжесть долга", "Стойка ослабляет выбранного врага на 20% на ход. Цена: твой прямой урон ниже на 15%; расплату придётся готовить дольше.", { dmg: -0.15 }],
    ["duelist", "Открытая гарда", "Парирование ослабляет врага на 20% на 2 хода. Цена: пропущенные удары весь бой сильнее на 15%.", { taken: 0.15 }]
  ].forEach(([id, name, description, mods]) => {
    T(id, 4, "key", name, description, { mods, on: TALENTS[`${id}/3`].on });
    pathKeys[id] = TALENT_SCHOOLS[id].talents.slice(-1)[0];
  });

  const sub = n => ({ stage: "subclass", map: { fury: `fury/${n}`, bulwark: `bulwark/${n}` } });
  const prof = n => ({ stage: "profession", map: Object.fromEntries(["berserk", "breaker", "guardian", "duelist"].map(id => [id, `${id}/${n}`])) });
  // Links use alternatives at each fork. Each row has the same 4/2/3/2 shape.
  const slots = (ids, modules = {}) => ids.map((talent, i) => ({
    key: ["a1", "a2", "a3", "a4", "b1", "b2", "c1", "c2", "c3", "d1", "d2"][i],
    tier: i < 4 ? 1 : i < 6 ? 2 : i < 9 ? 3 : 4,
    talent,
    ...(i < 4 ? {} : { afterAny: [null, null, null, null, ["a1", "a2"], ["a3", "a4"], ["b1"], ["b2"], ["b1"], ["c1", "c2"], ["c2", "c3"]][i] }),
    ...(modules[i] ? { module: modules[i] } : {})
  }));
  defineTalentBoard("warrior", [
    { id: "c-warrior", name: "Воля воина", description: "Напор, размах и точность. Шесть мест меняются с выбором пути; универсальный ключевой остаётся доступен любой профессии.",
      slots: slots(["c-warrior/1", "c-warrior/2", "crit/2", "crit/3", "c-warrior/3", "c-warrior/4", "c-warrior/5", "c-warrior/6", "crit/7", "crit/9", loyal],
        { 4: sub(1), 5: sub(2), 6: sub(3), 7: prof(1), 8: prof(2), 9: { stage: "profession", map: pathKeys } }) },
    { id: "bleed", name: "Кровь", description: "Наложить рану, вскрыть её или дать ей время. Выбирай долгую потерю крови либо лечение ценой собственного запаса здоровья.",
      slots: slots(["bleed/1", "bleed/2", "bleed/3", "crit/6", "bleed/4", "bleed/5", "bleed/7", "bleed/8", "bleed/11", bloodLong, bloodLife]) },
    { id: "guard", name: "Оборона", description: "Щиты, стойки и лечение работают вместе. Можно держать крепость ценой урона или лечиться сильнее ценой запаса здоровья.",
      slots: slots(["guard/1", "guard/2", "guard/3", "life/2", "guard/6", "life/4", "guard/4", "guard/8", "life/7", "guard/9", "life/9"]) },
    { id: "power", name: "Сила удара", description: "Пробить броню, сорвать подготовку и добить цель. Сильный контроль отнимает урон, глубокое пробивание — шанс крита.",
      slots: slots(["power/2", "power/3", "control/2", "control/3", "power/5", "control/4", "power/7", "power/10", "control/8", "power/9", "control/9"]) },
    { id: "tempo", name: "Темп", description: "Быстрые приёмы, передышки и ходы подряд. Ускоряй весь бой ценой защиты либо готовь быстрый навык через стойку.",
      slots: slots(["tempo/1", "tempo/2", "tempo/3", "tempo/6", "tempo/4", "tempo/5", "tempo/7", "tempo/8", "bleed/6", "tempo/9", measured]) }
  ]);
})();
