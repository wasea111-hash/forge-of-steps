// Mage build content. Only this class's registries and private talent school grow.
(() => {
  const hit = (b, power, label, element = "arcane", extra = {}) => b.enemy?.currentHp > 0 ? performHeroHit(b, {
    kind: "magic", power, label, element, sure: true, noEcho: true, proc: true, ...extra
  }) : null;
  const take = (b, id, max) => {
    const state = b.mech?.[id];
    const value = clamp(Number(state?.value || 0), 0, max);
    if (state) state.value = 0;
    return value;
  };
  const shield = (b, amount, duration = 3) => {
    const cap = Math.round(b.hero.maxHp * 0.6);
    const e = fx(b, "shield", duration, Math.min(cap, effectValue(b.hero, "shield") + Math.max(0, amount)), { self: true });
    if (e) e.value = Math.min(cap, e.value);
  };
  const sweep = (b, power, label, element, after, extra = {}) => {
    const focus = b.enemy;
    eachFoe(b, foe => {
      hit(b, power * (foe === focus ? 1 : 0.5), label, element, extra);
      if (foe.currentHp > 0) after?.(foe);
    });
  };
  const tickPhase = (b, s, c) => { if (c.type !== "ult") ultPhaseTick(s); };
  const cold = foe => ["frost", "frostbite", "freeze"].some(id => hasFx(foe, id));
  const units = b => (b.hero.summonedUnits || []).filter(u => u.hp > 0);
  const config = (type, role, name, duration, hpStat, hp, powerStat, power, taunt = 0, hpMin = 14, powerMin = 5) => ({
    type, role, name, duration, taunt,
    hpFormula: { sourceStat: hpStat, multiplier: hp, minValue: hpMin },
    actionPowerFormula: { sourceStat: powerStat, multiplier: power, minValue: powerMin }
  });
  const neutral = config("spirit", "attacker", "Отзвук души", 3, "shieldPower", 0.55, "skillDamage", 0.22);
  const summon = (b, source, summonConfig = null) => {
    const skill = SKILL_CATALOG[source];
    const u = makeSummon(summonConfig ? { ...skill, summonUnitConfig: summonConfig } : skill, b.hero);
    if (!addSummon(b, u)) return null;
    emit(b, "summon", { kind: u.type });
    logEvent(b, `На зов приходит ${u.name}.`, "Призыв");
    return u;
  };
  const ensureCompanion = b => {
    if (!units(b).length) summon(b, "mage-soul-tether", neutral);
  };
  const mana = (b, amount) => procMana(b, Math.max(0, amount) / Math.max(1, b.hero.maxMana));
  const rolePayoff = (b, u, scale, label) => {
    const power = u.power * scale;
    if (u.role === "healer") healUnit(b, b.hero, power, label);
    else if (u.role === "guardian" || u.role === "minion") shield(b, power);
    else if (u.role === "energy") mana(b, power);
    else procDamage(b, power, label, u.type === "undead" ? "dark" : "arcane");
  };
  // A sacrifice is not a natural death: no bones or death-refunds for this cost.
  const dismiss = (b, army) => {
    b.hero.summonedUnits = (b.hero.summonedUnits || []).filter(u => !army.includes(u));
    if (army.length) emit(b, "summonGone", { sacrifice: true });
  };
  const cleanse = (b, all = true) => {
    let removed = false;
    b.hero.effects = (b.hero.effects || []).filter(e => {
      if (STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad" || (!all && removed)) return true;
      removed = true; return false;
    });
  };
  // Keep the detonation gate on the effects, not in hero.talentMods: a lost
  // battle must not leave a temporary modifier on the persistent hero.
  const holdFlame = (b, s) => {
    const effect = getEffect(b.enemy, "burn");
    if (!effect || !ultPhaseActive(s)) return;
    s.flames ||= [];
    let entry = s.flames.find(e => e.effect === effect);
    if (!entry) { entry = { effect, cap: Number(effect.meta.maxStacks || BURN_DETONATION_THRESHOLD) }; s.flames.push(entry); }
    effect.meta.stacks = Math.min(entry.cap, getEffectStacks(effect));
    effect.meta.maxStacks = entry.cap + 1;
  };
  const releaseFlames = s => { (s.flames || []).forEach(({ effect, cap }) => { effect.meta.maxStacks = cap; }); s.flames = []; };

  defineSkillForms("mage-ether-beam", [
    { id: "thread", name: "Связующая нить", description: "Два попадания лучом подряд по одной цели оглушают её на ход. Сила 1,25 вместо 1,75; раскрытия защиты нет. Иное действие или смена цели рвёт нить.",
      patch: { powerMultiplier: 1.25 }, replaceEffects: [], on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam" || !isDirectHit(c)) return;
          s.count = s.target === b.enemy ? (s.count || 0) + 1 : 1; s.target = b.enemy;
          if (s.count >= 2) { s.count = 0; if (b.enemy.currentHp > 0) applyStun(b, b.enemy, b.hero, 1); }
        },
        afterAction(b, s, c) { if (c.skill?.id !== "mage-ether-beam") { s.count = 0; s.target = null; } }
      } },
    { id: "resonator", name: "Резонатор", description: "Разрядив шок, луч добавляет удар силой 0,9. Сам луч слабее: 1,4 вместо 1,75; раскрытия защиты нет. Источник шока: «Заряженные пальцы» в первом круге Стихий.",
      patch: { powerMultiplier: 1.4 }, replaceEffects: [], on: { afterHit(b, s, c) {
        if (c.skill?.id === "mage-ether-beam" && isDirectHit(c) && c.shockUsed) hit(b, 0.9, "Резонатор", "air");
      } } }
  ]);
  defineSkillForms("mage-static-clasp", [
    { id: "ring", name: "Громовое кольцо", description: "Вместо шанса оглушить одну цель ошеломляет группу на 20% на 2 хода. Сила 1,15 вместо 1,9; по остальным врагам половина силы.",
      patch: { powerMultiplier: 1.15, aoe: 0.5 }, replaceEffects: [eff("stagger", 2, { value: 0.2 })] },
    { id: "charge", name: "Накопленный разряд", description: "Вместо оглушения оставляет шок на 3 хода: следующий удар сильнее на 25%. Сила захвата 1,1 вместо 1,9; платишь уроном сейчас ради следующего попадания.",
      patch: { powerMultiplier: 1.1 }, replaceEffects: [eff("shock", 3, { value: 0.25 })] }
  ]);
  defineSkillForms("mage-elemental-surge", [
    { id: "focus", name: "Узел резонанса", description: "Бьёт только выбранную цель с силой 1,7 вместо 2,0. Даёт ещё единицу резонанса за применение: готовит серию ценой массового урона.",
      patch: { powerMultiplier: 1.7, aoe: 0 }, on: { afterAction(b, s, c) {
        if (c.skill?.id === "mage-elemental-surge") bumpGauge(b, "elemental", 1, 5);
      } } },
    { id: "rain", name: "Влажный контур", description: "Мочит всю группу на 3 хода, готовя холод и шок. Сила 1,35 вместо 2,0, по остальным половина. Вода помогает следующим стихиям, но гасит огонь.",
      patch: { powerMultiplier: 1.35, aoe: 0.5 }, addEffects: [eff("soaked", 3)] }
  ]);
  defineSkillForms("mage-soul-tether", [
    { id: "attendant", name: "Отзвук души", description: "Вместо лечения зовёт боевой отзвук на 3 хода, если рядом никого нет. Сила нити 1,1 вместо 1,4. Отзвук занимает общее место существа и не лечит тебя.",
      patch: { powerMultiplier: 1.1, selfHealMultiplier: 0 }, on: { afterAction(b, s, c) {
        if (c.skill?.id === "mage-soul-tether") ensureCompanion(b);
      } } },
    { id: "shelter", name: "Укрытие души", description: "Вместо лечения зовёт отзвук-хранитель на 3 хода, если рядом никого нет. Он даёт щиты, а не бьёт. Сила нити 1,0 вместо 1,4; немедленного лечения нет.",
      patch: { powerMultiplier: 1, selfHealMultiplier: 0 }, on: { afterAction(b, s, c) {
        if (c.skill?.id === "mage-soul-tether" && !units(b).length) summon(b, "mage-soul-tether", { ...neutral, role: "guardian", actionPowerFormula: { sourceStat: "shieldPower", multiplier: 0.25, minValue: 5 } });
      } } }
  ]);
  defineSkillForms("mage-dusk-ray", [
    { id: "verdict", name: "Тёмная печать", description: "Вместо слабости ставит метку на 3 хода: цель получает на 20% больше урона. Сила 1,25 вместо 1,6. Готовит наступление, но больше не ослабляет ответ врага.",
      patch: { powerMultiplier: 1.25, element: "dark" }, replaceEffects: [eff("mark", 3, { value: 0.2 })] },
    { id: "dawn", name: "Светлая сторона", description: "Вместо удара и слабости лечит с силой 0,75 и переводит Сумерки к свету. Это подготовка следующего тёмного удара: сама форма не ранит врага.",
      patch: { attackType: null, targetType: "self", selfHealMultiplier: 0.75 }, replaceEffects: [] }
  ]);
  defineSkillForms("mage-firebolt", [
    { id: "coal", name: "Уголь под кожей", description: "Сила стрелы 1,1 вместо 1,82. Оставляет два стака горения на 3 хода с тиком 20% силы магии: меньше урона сразу, быстрее подготовка детонации.",
      patch: { powerMultiplier: 1.1 }, replaceEffects: [eff("burn", 3, { ...dot("skillDamage", 0.2, 5), meta: { stacks: 2 } })] },
    { id: "fan", name: "Веер искр", description: "Поджигает группу: сила 1,2 вместо 1,82, по остальным половина. Один стак горения на 2 хода с тиком 12% силы магии вместо 18%: шире охват, слабее каждая цель.",
      patch: { powerMultiplier: 1.2, aoe: 0.5 }, replaceEffects: [eff("burn", 2, dot("skillDamage", 0.12, 3))] }
  ]);
  defineSkillForms("mage-ice-lance", [
    { id: "rime", name: "Снежная россыпь", description: "Покрывает инеем всю группу. Сила 1,1 вместо 1,7, по остальным половина; холод не копится. Меняешь подготовку обморожения одной цели на замедление нескольких.",
      patch: { powerMultiplier: 1.1, aoe: 0.5, chill: 0 } },
    { id: "deep", name: "Холод в кости", description: "Даёт две единицы холода вместо одной, но не кладёт иней. Сила 1,25 вместо 1,7: раньше обморожение, зато нет немедленного замедления.",
      patch: { powerMultiplier: 1.25, chill: 2 }, replaceEffects: [] }
  ]);
  defineSkillForms("mage-stone-fist", [
    { id: "foundation", name: "Подкоп", description: "Вместо шанса оглушить копит 55 давления вместо 34. Сила 1,15 вместо 1,7: откладываешь контроль до обрушения полной шкалы.",
      patch: { powerMultiplier: 1.15, pressure: 55 }, replaceEffects: [] },
    { id: "gravel", name: "Каменная осыпь", description: "Бьёт группу и надламывает броню на 20% на 2 хода. Сила 1,2 вместо 1,7, по остальным половина; нет оглушения, давление 20 вместо 34.",
      patch: { powerMultiplier: 1.2, aoe: 0.5, pressure: 20 }, replaceEffects: [eff("armor_break", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("mage-gust-blade", [
    { id: "draft", name: "Восходящий поток", description: "Добавляет единицу потока сверх обычной за действие. Сила 0,85 вместо 1,3, темп 1,0 вместо 0,7: платишь быстрым ударом ради подготовки повтора.",
      patch: { powerMultiplier: 0.85, tempo: 1, flow: 1 } },
    { id: "veil", name: "Пыльный разрез", description: "Ослепляет цель на 20 на 2 хода, прикрывая следующий обмен. Сила 0,9 вместо 1,3: быстрый темп сохранён, но прямой урон отдан защите.",
      patch: { powerMultiplier: 0.9 }, addEffects: [eff("blind", 2, { value: 20 })] }
  ]);
  defineSkillForms("mage-spirit-attendant", [
    { id: "bulwark", name: "Плотный хранитель", description: "Хранитель получает двойной запас жизни и чаще перехватывает удары. Живёт 3 хода вместо 4, щит за ход 20% силы щита вместо 30%: защита телом вместо долгих щитов.",
      patch: { summonUnitConfig: config("spirit", "guardian", "Дух-хранитель", 3, "shieldPower", 1.1, "shieldPower", 0.2, 2, 28) } },
    { id: "healer", name: "Заботливый хранитель", description: "Дух лечит каждый ход на 35% силы лечения вместо выдачи щита. Живёт прежние 4 хода, но не оставляет запаса поглощения: нужна уже полученная рана.",
      patch: { summonUnitConfig: config("spirit", "healer", "Дух-хранитель", 4, "shieldPower", 0.55, "healingPower", 0.35, 0, 14, 8) } }
  ]);
  defineSkillForms("mage-undead-thrall", [
    { id: "guard", name: "Костяной заслон", description: "Слуга получает двойной запас жизни и чаще принимает удары. Его удар 14% силы магии вместо 28%; служит прежние 4 хода. Армия защищает ценой наступления.",
      patch: { summonUnitConfig: config("undead", "tank", "Костяной слуга", 4, "shieldPower", 0.9, "skillDamage", 0.14, 2, 24, 4) } },
    { id: "brief", name: "Последний марш", description: "Слуга бьёт на 42% силы магии вместо 28%, но живёт 2 хода вместо 4. Его гибель раньше даст кость; долгого заслона и долгой службы нет.",
      patch: { summonUnitConfig: config("undead", "attacker", "Костяной слуга", 2, "shieldPower", 0.45, "skillDamage", 0.42, 0, 12, 11) } }
  ]);
  defineSkillForms("mage-light-touch", [
    { id: "ward", name: "Свет до раны", description: "Вместо лечения 1,05 создаёт щит с силой 1,1 от силы щита на 3 хода, до 60% здоровья. Работает заранее, но уже потерянное здоровье не возвращает.",
      patch: { selfHealMultiplier: 0, specialAction: "light_shield", shieldEffect: { duration: 3, valueFormula: { sourceStat: "shieldPower", multiplier: 1.1, minValue: 12 } } },
      on: { afterAction(b, s, c) { if (c.skill?.id === "mage-light-touch") { const e = getEffect(b.hero, "shield"); if (e) e.value = Math.min(e.value, Math.round(b.hero.maxHp * 0.6)); } } } },
    { id: "afterglow", name: "Долгий рассвет", description: "Вместо немедленного лечения даёт регенерацию на 4 хода: по 35% силы лечения за тик. Общая выплата выше, но опасную рану сейчас не закроет.",
      patch: { selfHealMultiplier: 0 }, replaceEffects: [selfEff("regeneration", 4, dot("healingPower", 0.35, 6))],
      on: { afterAction(b, s, c) { if (c.skill?.id === "mage-light-touch" && b.mech?.light_dark) b.mech.light_dark.side = "light"; } } }
  ]);
  defineSkillForms("mage-shadow-servant", [
    { id: "vessel", name: "Плотный сосуд", description: "Слуга получает двойной запас жизни и чаще перехватывает удары, но живёт 2 хода вместо 4. Удобная жертва и короткий заслон; долгой защиты нет.",
      patch: { summonUnitConfig: config("minion", "minion", "Тёмный слуга", 2, "shieldPower", 1.2, "skillDamage", 0.01, 2, 28, 1) } },
    { id: "claw", name: "Коготь ночи", description: "Слуга сам бьёт с силой 30% магии, но получает половину исходного запаса жизни и живёт 3 хода вместо 4. Наступление оставляет более слабую жертву.",
      patch: { summonUnitConfig: config("minion", "attacker", "Тёмный слуга", 3, "shieldPower", 0.3, "skillDamage", 0.3, 0, 7) } }
  ]);

  defineClassStyles("mage", [
    { id: "edge", name: "У кромки срыва", description: "При жаре от 70 до порога срыва прямые магические попадания сильнее на 8–17%. Срыв остаётся опасен, а охлаждение сразу лишает прибавки.",
      on: { beforeHit(b, s, c) { const heat = coreState(b)?.value || 0; if (isDirectHit(c) && c.kind === "magic" && heat >= 70 && heat <= 100 + tm(b.hero, "heatCap")) c.mult *= 1 + stylePower(b); } } },
    { id: "calculation", name: "Холодный расчёт", description: "Медитация готовит следующий навык: после оплаты он возвращает 8–17% своей цены. Подготовка пропадает после иного действия; ради экономии тратишь ход и теряешь жар.",
      on: { afterAction(b, s, c) {
        if (s.ready && c.type === "skill") {
          const saved = Math.min(0.8, stylePower(b)) * getSkillResourceCost(c.skill, b.hero);
          if (getHeroResourceType(c.skill, b.hero) === "hp") {
            const before = b.hero.currentHp;
            b.hero.currentHp = Math.min(b.hero.maxHp, b.hero.currentHp + Math.round(saved));
            if (b.hero.currentHp > before) emit(b, "heal", { target: "hero", amount: b.hero.currentHp - before, label: "Возврат цены" });
          }
          else mana(b, saved);
        }
        s.ready = c.type === "wait";
      } } },
    { id: "pulse", name: "Пульс жара", description: "Обычный удар сразу после навыка готовит следующий навык: прямой урон сильнее на 8–17%. Нужна связка навык → удар → навык; повтор навыка и любое иное действие гасят пульс.",
      on: {
        beforeHit(b, s, c) { if (s.ready && c.skill && isDirectHit(c)) c.mult *= 1 + stylePower(b); },
        afterAction(b, s, c) { s.ready = c.type === "attack" && s.last === "skill"; s.last = c.type; }
      } }
  ]);

  defineUltimates("mage", "class", [
    { id: "starfall", name: "Звездопад", description: "Превращает жар в удар силой 2,4–3,9 по цели и вполовину слабее по остальным. Затем жар сбрасывается. Без перегрева остаётся базовая сила; бонус жара к самому удару не добавляется.", element: "arcane",
      run(b) { const heat = take(b, "core_mage", 100); sweep(b, 2.4 + heat * 0.015, "Звездопад", "arcane"); } },
    { id: "noon", name: "Тихий полдень", description: "Сбрасывает жар, возвращает 30% маны и даёт щит на 25% здоровья. Урона нет: выигрываешь безопасное продолжение серии, отказываясь от накопленного жара.", element: "arcane",
      run(b) { take(b, "core_mage", 100); procMana(b, 0.3); shield(b, b.hero.maxHp * 0.25); } }
  ]);
  defineUltimates("elemental", "subclass", [
    { id: "convergence", name: "Схождение стихий", description: "Тратит резонанс на удар силой 2,2–3,7. Каждая разная стихия на цели добавляет 0,3 силы, до 1,2: огонь, холод, шок, вода. Подготовку серии придётся собирать заново.", element: "arcane",
      run(b) {
        const resonance = take(b, "elemental", 5);
        const kinds = Number(hasFx(b.enemy, "burn")) + Number(cold(b.enemy)) + Number(hasFx(b.enemy, "shock")) + Number(hasFx(b.enemy, "soaked"));
        hit(b, 2.2 + resonance * 0.3 + kinds * 0.3, "Схождение стихий");
      } },
    { id: "circuit", name: "Устойчивый контур", description: "Три следующих навыка сохраняют резонанс и после применения возвращают половину набранного жара. Срыв проверяется до возврата: у самого порога всё ещё опасно. Немедленного удара нет.", element: "arcane",
      run(b, s) { s.casts = 3; s.floor = b.mech?.elemental?.value || 0; }, on: {
        turnStart(b, s) { if (s.casts > 0) s.floor = Math.max(s.floor, b.mech?.elemental?.value || 0); },
        backfire(b, s) { if (s.casts > 0) s.backfired = true; },
        afterAction(b, s, c) {
          if (!(s.casts > 0)) return;
          if (b.mech?.elemental) { b.mech.elemental.value = Math.max(b.mech.elemental.value, s.floor); s.floor = b.mech.elemental.value; }
          if (c.type !== "skill") return;
          s.casts -= 1;
          // Core hooks precede build hooks. Cooling cannot retroactively cancel
          // a backfire, nor can it cool the core's post-backfire value of 30.
          const core = coreState(b);
          if (core && !s.backfired) core.value = Math.max(0, core.value - heatOfSkill(c.skill, b.hero) * (1 + tm(b.hero, "heatGain")) * 0.5);
          s.backfired = false;
        }
      } }
  ]);
  defineUltimates("summoner", "subclass", [
    { id: "command", name: "Общий приказ", description: "Существа сразу выполняют свои роли с двойной силой: удар, лечение, мана или щит. Без свиты зовёт временный боевой отзвук. Не продлевает службу: это немедленная выплата.", element: "arcane",
      run(b) { ensureCompanion(b); units(b).forEach(u => rolePayoff(b, u, 2, "Общий приказ")); } },
    { id: "bond", name: "Прочная связь", description: "Даёт щит связи на 20% здоровья. На три следующих действия он принимает 30% входящего урона, а существа не стареют. Без свиты зовёт отзвук; немедленного удара нет.", element: "arcane",
      run(b, s) { ensureCompanion(b); ultPhaseStart(s, 3); s.pool = Math.round(b.hero.maxHp * 0.2); }, on: {
        incoming(b, s, c) { if (!ultPhaseActive(s) || c.parried) return; const part = Math.min(s.pool, c.amount * 0.3); s.pool -= part; c.amount -= part; },
        afterAction(b, s, c) { if (!ultPhaseActive(s)) return; units(b).forEach(u => { if (!u.persistent) u.duration += 1; }); tickPhase(b, s, c); }
      } }
  ]);
  defineUltimates("light_dark", "subclass", [
    { id: "verdict", name: "Сумеречный суд", description: "Тёмный удар силой 2,6, после светлой подготовки — 3,8. Ослабляет цель на 25% на 3 хода и переводит Сумерки к тьме. Весь урон получает одна цель; защиты себе не даёт.", element: "dark",
      run(b) { const state = b.mech?.light_dark; const prepared = state?.side === "light"; if (state) state.side = "dark"; hit(b, prepared ? 3.8 : 2.6, "Сумеречный суд", "dark"); fx(b, "weaken", 3, 0.25); } },
    { id: "dawn", name: "Обратный рассвет", description: "Лечит на 15% здоровья, после тёмной подготовки — на 25%; даёт щит на 15%. Три следующих действия усиливает переходы сторон ещё на 20%. Прямого удара нет.", element: "holy",
      run(b, s) { const state = b.mech?.light_dark; procHeal(b, state?.side === "dark" ? 0.25 : 0.15, "Обратный рассвет"); shield(b, b.hero.maxHp * 0.15); if (state) state.side = "light"; ultPhaseStart(s, 3); }, on: {
        beforeHit(b, s, c) { if (ultPhaseActive(s) && isDirectHit(c) && c.skill && b.mech?.light_dark?.side === "light") c.mult *= 1.2; },
        beforeHeal(b, s, c) { if (ultPhaseActive(s) && b.mech?.light_dark?.side === "dark") c.amount *= 1.2; },
        afterAction: tickPhase
      } }
  ]);

  defineUltimates("fire", "profession", [
    { id: "furnace", name: "Печь раскрыта", description: "Удар огня силой 1,6 по цели, половина по остальным. Снимает их горение и взрывает до четырёх стаков: по два тика за стак. Без огня остаётся удар; старое пламя теряется.", element: "fire",
      run(b) {
        const focus = b.enemy;
        eachFoe(b, foe => {
          const burn = getEffect(foe, "burn");
          const stored = burn ? burn.value * Math.min(4, getEffectStacks(burn)) * 2 : 0;
          removeFx(foe, "burn");
          const ratio = foe === focus ? 1 : 0.5;
          hit(b, 1.6 * ratio, "Печь раскрыта", "fire");
          if (stored && foe.currentHp > 0) { const amount = procDamage(b, stored * ratio, "Взрыв печи", "fire"); emit(b, "detonate", { target: "enemy", amount }); fireMech(b, "detonated"); }
        });
      } },
    { id: "long-flame", name: "Долгое пламя", description: "На три следующих действия запрещает детонации и усиливает тики огня на 35%. Продлевает текущее горение на 3 хода; без него поджигает цель. Взрыв придётся отложить.", element: "fire",
      run(b, s) {
        ultPhaseStart(s, 3);
        if (!hasFx(b.enemy, "burn")) fx(b, "burn", 3, dotValue(b, 0.18));
        eachFoe(b, foe => { const e = getEffect(foe, "burn"); if (e) { e.duration += 3; holdFlame(b, s); } });
      }, on: {
        applied(b, s, c) { if (c.id === "burn") holdFlame(b, s); },
        beforeTick(b, s, c) { if (ultPhaseActive(s) && c.id === "burn") { holdFlame(b, s); c.amount *= 1.35; } },
        afterAction(b, s, c) { tickPhase(b, s, c); if (!ultPhaseActive(s)) releaseFlames(s); },
        victory(b, s) { releaseFlames(s); }
      } }
  ]);
  defineUltimates("water", "profession", [
    { id: "ice-drift", name: "Ледоход", description: "Тратит холод и снимает обморожение выбранной цели. Удар силой 2,4, +0,35 за холод и +0,7 за обморожение; осколки по остальным вполовину слабее. Подготовка холода теряется.", element: "frost",
      run(b) { const chill = take(b, "water", 3); const bitten = hasFx(b.enemy, "frostbite"); removeFx(b.enemy, "frostbite"); sweep(b, 2.4 + chill * 0.35 + (bitten ? 0.7 : 0), "Ледоход", "frost"); } },
    { id: "still-water", name: "Тихая заводь", description: "Кладёт иней на группу на 4 хода. Три следующих действия лечение на 30% сильнее, пока выбранный враг скован холодом. Урона нет: нужно лечиться и сохранять холод.", element: "water",
      run(b, s) { eachFoe(b, () => fx(b, "frost", 4, 0.25)); ultPhaseStart(s, 3); }, on: {
        beforeHeal(b, s, c) { if (ultPhaseActive(s) && cold(b.enemy)) c.amount *= 1.3; }, afterAction: tickPhase
      } }
  ]);
  defineUltimates("earth", "profession", [
    { id: "fault", name: "Разлом основания", description: "Расходует давление на удар силой 2,2–4,2 по цели, половина по остальным. Надламывает броню группы на 30% на 3 хода. Теряешь подготовку оглушения от давления.", element: "earth",
      run(b) { const pressure = take(b, "earth", 100); sweep(b, 2.2 + pressure * 0.02, "Разлом основания", "earth", () => fx(b, "armor_break", 3, 0.3)); } },
    { id: "under-mountain", name: "Под горой", description: "Даёт щит на 25% здоровья. Три следующих действия земляные приёмы добавляют ещё 20 давления; полная шкала оглушает по обычным правилам. Немедленного удара нет.", element: "earth",
      run(b, s) { shield(b, b.hero.maxHp * 0.25); ultPhaseStart(s, 3); }, on: { afterAction(b, s, c) {
        if (!ultPhaseActive(s) || c.type === "ult") return;
        if (c.skill?.pressure && b.enemy.currentHp > 0 && b.mech?.earth) {
          bumpGauge(b, "earth", 20, 100);
          if (b.mech.earth.value >= 100) { b.mech.earth.value = 0; applyStun(b, b.enemy, b.hero, 99); }
        }
        ultPhaseTick(s);
      } } }
  ]);
  defineUltimates("air", "profession", [
    { id: "eye", name: "Глаз урагана", description: "Расходует поток на три разряда силой 0,8–1,3 каждый по цели. Дуги по остальным вполовину слабее. Без потока серия остаётся, но накопленное ускорение теряется.", element: "air",
      run(b) { const flow = take(b, "air", 5); b.hero.speedMult = 1; for (let i = 0; i < 3; i += 1) sweep(b, 0.8 + flow * 0.1, "Глаз урагана", "air"); } },
    { id: "fair-storm", name: "Попутная буря", description: "Даёт уклонение +15 на 2 хода. Следующие три навыка обновляют его и дают лишнюю единицу потока после обычного набора. Урона сразу нет; полный поток выплатится следующим навыком.", element: "air",
      run(b, s) { s.casts = 3; fx(b, "evasion", 2, 15, { self: true }); }, on: { afterAction(b, s, c) {
        if (!(s.casts > 0) || c.type !== "skill") return;
        s.casts -= 1;
        // Mechanics have already checked five. Four plus our point pays on
        // the next skill, avoiding an unmarked recursive skill execution here.
        bumpGauge(b, "air", 1, 5);
        b.hero.speedMult = 1 + (b.mech?.air?.value || 0) * 0.03;
        fx(b, "evasion", 2, 15, { self: true });
      } } }
  ]);
  defineUltimates("spirit", "profession", [
    { id: "agreement", name: "Согласие духов", description: "Зовёт разные открытые роли духов до лимита, сохраняя уже собранные. Без свободных мест продлевает духов на 2 хода. Мгновенного удара нет; роли ограничены твоим уровнем.", element: "holy",
      run(b) {
        const sources = ["mage-spirit-attendant", "mage-spirit-healer", "mage-spirit-energy", "mage-spirit-war"].filter(id => SKILL_CATALOG[id].unlockLevel <= b.hero.level);
        const old = units(b).filter(u => u.type === "spirit");
        old.forEach(u => { u.duration += 2; });
        for (const id of sources) {
          if (units(b).length >= getSummonLimit(b.hero)) break;
          if (!units(b).some(u => u.role === SKILL_CATALOG[id].summonUnitConfig.role)) summon(b, id);
        }
      } },
    { id: "farewell", name: "Прощальный дар", description: "Отпускает духов: каждый в последний раз выполняет свою роль с тройной силой. Даёт базовые 8% лечения и 10% щита даже без духов. Теряешь свиту и гармонию.", element: "holy",
      run(b) { const spirits = units(b).filter(u => u.type === "spirit"); dismiss(b, spirits); procHeal(b, 0.08, "Прощальный дар"); shield(b, b.hero.maxHp * 0.1); spirits.forEach(u => rolePayoff(b, u, 3, "Прощальный дар")); } }
  ]);
  defineUltimates("undead", "profession", [
    { id: "march", name: "Поход мёртвых", description: "Тратит кости: зовёт одного костяного слугу и ещё по одному за две кости, до лимита. Продлевает нежить на 2 хода. При полной армии новых нет; кости и ход всё равно потрачены.", element: "dark",
      run(b) { const bones = take(b, "undead", 6); units(b).filter(u => u.type === "undead").forEach(u => { u.duration += 2; }); for (let i = 0; i < 1 + Math.floor(bones / 2) && units(b).length < getSummonLimit(b.hero); i += 1) summon(b, "mage-undead-thrall"); } },
    { id: "harvest", name: "Костяная жатва", description: "Расходует нежить и кости на удар по группе: сила 2,0 плюс 0,25 за кость и вклад слуг, до 2,0 силы сверху. По остальным половина. Оставляет тебя без защиты армии.", element: "dark",
      run(b) { const bones = take(b, "undead", 6); const army = units(b).filter(u => u.type === "undead"); const power = Math.min(2, army.reduce((sum, u) => sum + u.power, 0) / Math.max(1, b.hero.skillDamage)); dismiss(b, army); sweep(b, 2 + bones * 0.25 + power, "Костяная жатва", "dark"); } }
  ]);
  defineUltimates("light", "profession", [
    { id: "judgement", name: "Полдень суда", description: "Расходует всё сияние на световой удар силой 2,6 плюс 110% запаса. Даже без сияния удар остаётся. Весь урон получает одна цель; запас для обычного «Суда» теряется.", element: "holy",
      run(b) { const light = take(b, "light", b.hero.maxHp * 0.6); hit(b, 2.6, "Полдень суда", "holy", { flat: light * 1.1 }); } },
    { id: "halo", name: "Нерушимый ореол", description: "Расходует сияние на щит: 25% здоровья плюс 60% запаса, всего до 60% здоровья. Снимает все вредные эффекты. Урона нет; отказываешься от накопленного «Суда».", element: "holy",
      run(b) { const light = take(b, "light", b.hero.maxHp * 0.6); cleanse(b); shield(b, b.hero.maxHp * 0.25 + light * 0.6); } }
  ]);
  defineUltimates("dark", "profession", [
    { id: "ritual", name: "Ритуал опустошения", description: "Жертвует одним слугой: тёмный удар силой 2,4, ещё 0,8 за жертву и по 0,2 за разное проклятие цели, до 1,0. Без слуги остаётся слабая версия. Свита теряет защитника.", element: "dark",
      run(b) { const victim = units(b).find(u => u.type === "minion") || units(b).find(u => !u.persistent); const curses = ["weaken", "mark", "corruption", "blind", "wound"].filter(id => hasFx(b.enemy, id)).length; if (victim) dismiss(b, [victim]); hit(b, 2.4 + (victim ? 0.8 : 0) + curses * 0.2, "Ритуал опустошения", "dark"); } },
    { id: "throne", name: "Трон сумерек", description: "Сохраняет слугу, без него зовёт временного. Три следующих действия при живом слуге входящий урон ниже на 20%; слабость врагов сильнее ещё на 10%. Урона сразу нет.", element: "dark",
      run(b, s) { if (!units(b).some(u => u.type === "minion")) summon(b, "mage-shadow-servant"); ultPhaseStart(s, 3); }, on: {
        incoming(b, s, c) { if (!ultPhaseActive(s)) return; if (units(b).some(u => u.type === "minion")) c.amount *= 0.8; if (hasFx(b.enemy, "weaken")) c.amount *= 0.9; },
        afterAction: tickPhase
      } }
  ]);

  // Reuse existing rules first. Private additions fill absent tier choices and
  // give profession keystones actual prices without editing shared schools.
  defineSchool("x-mage", "Переплёт формул", "Недостающие развилки шести школ мага и ключевые пути.", { classes: ["mage"] });
  const add = (tier, kind, name, description, spec) => {
    T("x-mage", tier, kind, name, description, spec);
    return TALENT_SCHOOLS["x-mage"].talents.slice(-1)[0];
  };
  const reserve = add(3, "link", "Запас между строк", "Обычный удар при жаре ниже 30 возвращает 3% маны, один раз за действие.", { on: {
    afterHit(b, s, c) { if (!s.paid && !c.skill && isDirectHit(c) && (coreState(b)?.value || 0) < 30) { s.paid = true; procMana(b, 0.03); } }, afterAction(b, s) { s.paid = false; }
  } });
  // The legacy c-mage/8 raises the heat cap by 100000 and permits an unbounded
  // damage ramp. Keep the shared definition intact and offer a finite rule.
  const pauseKey = add(4, "key", "Сила паузы", "Первый навык после медитации бьёт прямой магией на 50% сильнее. Но все навыки дороже на 20%; любое иное действие рвёт подготовку.", { mods: { manaCost: 0.2 }, on: {
    beforeHit(b, s, c) { if (s.ready && c.skill && isDirectHit(c) && c.kind === "magic") c.mult *= 1.5; },
    afterAction(b, s, c) { s.ready = c.type === "wait"; }
  } });
  const elementalKey = add(4, "key", "Равновесие стихий", "Огонь, холод и шок на цели усиливают прямую магию по 12%, до 36%. Но каждый навык набирает на 25% больше жара.", { mods: { heatGain: 0.25 }, on: { beforeHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic") c.mult *= 1 + 0.12 * (Number(hasFx(b.enemy, "burn")) + Number(cold(b.enemy)) + Number(hasFx(b.enemy, "shock"))); } } });
  const hexSeed = add(1, "make", "Печать на паузе", "Медитация ставит на выбранного врага метку на 2 хода: он получает на 10% больше урона.", { on: { afterAction(b, s, c) { if (c.type === "wait") fx(b, "mark", 2, 0.1); } } });
  const hexKey = add(4, "key", "Долг проклятия", "Порча тикает на 50% сильнее, но прямой магический урон ниже на 20%. Нужны три беды или путь тьмы, чтобы породить порчу.", { mods: { "tick:corruption": 0.5, dmgMagic: -0.2 } });
  const wardKey = add(4, "key", "Хрупкая оболочка", "Стойка даёт щит на 18% здоровья, но максимум здоровья меньше на 20%. Защиту нужно готовить действиями.", { mods: { maxHpPct: -0.2 }, on: { afterAction(b, s, c) { if (c.type === "guard") shield(b, b.hero.maxHp * 0.18); } } });
  const lifePause = add(1, "make", "Медленный вдох", "Медитация ниже половины здоровья даёт регенерацию на 2 хода: по 3% здоровья за тик.", { on: { afterAction(b, s, c) { if (c.type === "wait" && hpRatio(b.hero) < 0.5) fx(b, "regeneration", 2, Math.round(b.hero.maxHp * 0.03), { self: true }); } } });
  const lifeLink = add(3, "link", "Дышать сквозь боль", "Первое прямое магическое попадание за действие при здоровье ниже 35% лечит на 4% здоровья.", { on: {
    afterHit(b, s, c) { if (!s.paid && isDirectHit(c) && c.kind === "magic" && hpRatio(b.hero) < 0.35) { s.paid = true; procHeal(b, 0.04, "Дышать сквозь боль"); } }, afterAction(b, s) { s.paid = false; }
  } });
  const lifeKey = add(4, "key", "Отложенное спасение", "Медитация даёт регенерацию на 3 хода по 7% здоровья за тик. Всё лечение слабее на 25%; без паузы выгоды нет.", { mods: { heal: -0.25 }, on: { afterAction(b, s, c) { if (c.type === "wait") fx(b, "regeneration", 3, Math.round(b.hero.maxHp * 0.07), { self: true }); } } });
  const etherKey = add(4, "key", "Бережный ритм", "Навык сразу после медитации занимает на 25% меньше времени. Все остальные навыки медленнее на 15%; любое иное действие рвёт подготовку.", { on: { afterAction(b, s, c) { if (c.type === "skill") c.tempo = Math.max(0.55, c.tempo * (s.ready ? 0.75 : 1.15)); s.ready = c.type === "wait"; } } });
  const pathKeys = {};
  [
    ["fire", "Цена золы", "Детонация сокращает все откаты на ход. Но навыки дороже на 20%: без взрыва платишь больше за ту же серию.", { manaCost: 0.2 }],
    ["water", "Ледяной пульс", "Прямое попадание по замороженной цели лечит на 8% здоровья. Но вся прямая магия слабее на 15%.", { dmgMagic: -0.15 }],
    ["earth", "Каменная тюрьма", "Оглушение надламывает броню на 35% на 3 хода. Но весь прямой урон слабее на 12%; нужно готовить контроль.", { dmg: -0.12 }],
    ["air", "Песок в буре", "Повтор потока ослепляет врага на 20 на 2 хода. Но входящий урон выше на 15% весь бой.", { taken: 0.15 }],
    ["spirit", "Цена согласия", "При трёх разных ролях духов каждый ход возвращает 3% здоровья и маны. Но максимум здоровья меньше на 15%.", { maxHpPct: -0.15 }],
    ["undead", "Мёртвое дыхание", "Живая нежить накладывает порчу на цель, если её нет. Но твоё лечение слабее на 25%: армия важнее восстановления.", { heal: -0.25 }],
    ["light", "Свет сквозь раны", "Ниже полного здоровья каждый ход даёт регенерацию на 2% здоровья, если её нет. Но прямой магический урон ниже на 15%.", { dmgMagic: -0.15 }],
    ["dark", "Цена жатвы", "Тики порчи лечат на 20% своего урона. Но максимум здоровья меньше на 20%; без проклятия выгоды нет.", { maxHpPct: -0.2 }]
  ].forEach(([id, name, description, mods]) => {
    const on = id === "fire" ? { detonated(b) { Object.keys(b.hero.cooldowns).forEach(key => { b.hero.cooldowns[key] = Math.max(0, b.hero.cooldowns[key] - 1); }); } }
      : id === "air" ? {
        turnStart(b, s) { s.flow = b.mech?.air?.value || 0; },
        afterAction(b, s, c) {
          if (c.type === "skill" && c.skill.attackType && (s.flow || 0) + 1 + Number(c.skill.flow || 0) >= 5 && b.mech?.air?.value === 0) fx(b, "blind", 2, 20);
          s.flow = b.mech?.air?.value || 0;
        }
      } : TALENTS[`${id}/3`].on;
    pathKeys[id] = add(4, "key", name, description, { mods, on });
  });

  const sub = n => ({ stage: "subclass", map: Object.fromEntries(["elemental", "summoner", "light_dark"].map(id => [id, `${id}/${n}`])) });
  const prof = n => ({ stage: "profession", map: Object.fromEntries(Object.keys(BRANCH_CATALOG.mage.professions).map(id => [id, `${id}/${n}`])) });
  const slots = (ids, modules = {}) => ids.map((talent, i) => ({
    key: ["a1", "a2", "a3", "a4", "b1", "b2", "c1", "c2", "c3", "d1", "d2"][i],
    tier: i < 4 ? 1 : i < 6 ? 2 : i < 9 ? 3 : 4, talent,
    ...(i < 4 ? {} : { afterAny: [null, null, null, null, ["a1", "a2"], ["a3", "a4"], ["b1"], ["b2"], ["b1"], ["c1", "c2"], ["c2", "c3"]][i] }),
    ...(modules[i] ? { module: modules[i] } : {})
  }));
  defineTalentBoard("mage", [
    { id: "c-mage", name: "Основы магии", description: "Жар, паузы и выбор пути. Шесть мест меняются с подклассом и профессией; Перегрузка остаётся общей ценой за силу.",
      slots: slots(["c-mage/1", "c-mage/2", "control/2", "control/3", "c-mage/3", "c-mage/4", "c-mage/5", "c-mage/6", reserve, pauseKey, "c-mage/7"],
        { 4: sub(1), 5: sub(2), 6: sub(3), 7: prof(1), 8: prof(2), 9: { stage: "profession", map: pathKeys } }) },
    { id: "elements", name: "Стихии", description: "Искры, иней и шок доступны без профессии. Поддерживай разные стихии ради резонанса или собирай горение для детонации.",
      slots: slots(["burn/3", "frost/3", "shock/1", "shock/3", "frost/5", "shock/5", "burn/8", "shock/8", "control/8", "burn/10", elementalKey]) },
    { id: "hex", name: "Порча", description: "Подготовь слабость и метку, собери три беды для порчи. Долгое проклятие стоит защиты, сильная порча — прямого урона.",
      slots: slots(["hex/1", "hex/2", "hex/3", hexSeed, "hex/5", "hex/6", "hex/7", "hex/8", "hex/10", "hex/9", hexKey]) },
    { id: "guard", name: "Оборона", description: "Щит, стойка и ответный удар. Выбирай крепость ценой урона или щит от стойки ценой запаса здоровья.",
      slots: slots(["guard/1", "guard/2", "guard/3", "frost/2", "guard/5", "guard/6", "guard/7", "guard/8", "guard/10", "guard/9", wardKey]) },
    { id: "life", name: "Живучесть", description: "Пережить спад, отыграть лишнее лечение, выдержать долгий бой. Ключевые требуют меньшего запаса здоровья либо пауз на регенерацию.",
      slots: slots(["life/1", "life/2", "life/3", lifePause, "life/4", "life/6", "life/7", "life/8", lifeLink, "life/9", lifeKey]) },
    { id: "arcana", name: "Эфир", description: "Мана защищает, а паузы готовят следующую формулу. Можно платить кровью за магию или ускорять приём только после медитации.",
      slots: slots(["arcana/1", "tempo/1", "tempo/2", "tempo/3", "arcana/4", "arcana/6", "arcana/7", "arcana/8", "tempo/8", "arcana/9", etherKey]) }
  ]);
})();
