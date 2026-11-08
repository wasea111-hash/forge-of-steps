// Assassin build content. Only this class's registries and private school are extended.
(() => {
  const hit = (b, power, label, extra = {}) => {
    // Proc hits must not build another combination or call phantom echoes.
    const combo = b.mech?.shade?.value;
    const result = performHeroHit(b, {
      kind: "physical", power, label, element: "steel", sure: true,
      noEcho: true, proc: true, ...extra
    });
    if (b.mech?.shade && combo !== undefined) b.mech.shade.value = combo;
    return result;
  };
  const take = (b, id, max) => {
    const state = b.mech?.[id];
    const value = clamp(Number(state?.value || 0), 0, max);
    if (state) state.value = 0;
    return value;
  };
  const hide = b => {
    const core = b.mech?.core_assassin;
    if (!core) return;
    const changed = !core.hidden;
    core.hidden = true;
    core.spent = false;
    if (changed) { mechNote(b, "Снова в тени"); fireMech(b, "rehidden"); }
  };
  const energy = (b, amount) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + Math.max(0, Math.floor(amount)));
    if (b.hero.currentMana > before) emit(b, "mana", { target: "hero", amount: b.hero.currentMana - before });
  };
  const wound = (b, ratio, min = 3) => Math.max(min, Math.round(b.hero.physicalDamage * ratio));
  const tickPhase = (b, s, c) => { if (c.type !== "ult") ultPhaseTick(s); };
  const attacking = c => c.type === "attack" || Boolean(c.skill?.attackType) || c.skill?.special === "lance_wound";
  const preparing = c => c.type === "guard" || c.type === "wait" || (c.type === "skill" && !attacking(c));
  const paidEnergy = (b, s, skill) => !skill || getHeroResourceType(skill, b.hero) !== "mana" ? 0
    : Math.min(getSkillResourceCost(skill, b.hero), Math.max(0, Number(s.mana || 0) - b.hero.currentMana));
  // A permanent poison has no remaining damage. Finite poison includes its
  // normal ramp, with a bounded loop even if an effect has a long duration.
  const poisonLeft = (b, effect, limit = Infinity) => {
    if (!effect || !Number.isFinite(effect.duration) || tm(b.hero, "perma:poison")) return 0;
    const turns = Math.max(0, Math.min(Math.floor(effect.duration), limit));
    const elapsed = Math.max(0, Number(effect.meta?.elapsedTicks || 0));
    let total = 0;
    const rising = Math.min(turns, Math.max(0, POISON_RAMP_MAX - elapsed));
    for (let i = 0; i < rising; i += 1) total += effect.value * (1 + (elapsed + i) * POISON_RAMP);
    return total + (turns - rising) * effect.value * (1 + Math.min(POISON_RAMP_MAX, elapsed + rising) * POISON_RAMP);
  };
  const poisonPay = (b, amount, label) => {
    if (b.enemy.currentHp <= 0 || amount <= 0) return;
    const { hpDamage } = dealDamage(b, b.enemy, amount, { ignoreShield: true });
    emit(b, "hit", { target: "enemy", amount: hpDamage, crit: false, kind: "physical", element: "poison", label });
    logEvent(b, `${label}: ${hpDamage} урона.`, "Яд");
  };
  const prolongPoison = b => {
    const e = getEffect(b.enemy, "poison");
    if (e) e.duration += 2;
    else fx(b, "poison", 3, wound(b, 0.2));
  };

  defineSkillForms("assassin-shadow-lunge", [
    { id: "fan", name: "Веерный выпад", description: "Задевает остальных врагов с половиной силы и отравляет их. Главный удар слабее: 1,1 вместо 1,6. Критический бонус прежний.",
      patch: { powerMultiplier: 1.1, aoe: 0.5 } },
    { id: "notch", name: "Зарубка", description: "Вместо яда оставляет метку на 3 хода: цель получает на 20% больше урона. Сам выпад слабее: 1,2 вместо 1,6; отравления от навыка нет.",
      patch: { powerMultiplier: 1.2 }, replaceEffects: [eff("mark", 3, { value: 0.2 })] }
  ]);
  defineSkillForms("assassin-venom-fang", [
    { id: "fresh", name: "Свежая доза", description: "Удар слабее: 1,0 вместо 1,6. Яд действует 4 хода вместо 3, с силой 32% физического урона вместо 22%. Выигрываешь, если доза успеет подействовать.",
      patch: { powerMultiplier: 1 }, replaceEffects: [eff("poison", 4, dot("physicalDamage", 0.32, 5))] },
    { id: "extract", name: "Извлечение", description: "Не накладывает яд. Попадание снимает имеющийся конечный яд и выплачивает до двух его тиков сразу; остальные тики теряются. Бессрочный яд не вскрывает.",
      replaceEffects: [], on: { afterHit(b, s, c) {
        if (c.skill?.id !== "assassin-venom-fang" || !isDirectHit(c)) return;
        const e = getEffect(b.enemy, "poison");
        const amount = poisonLeft(b, e, 2);
        if (amount <= 0) return;
        removeFx(b.enemy, "poison");
        poisonPay(b, amount, "Извлечение");
      } } }
  ]);
  defineSkillForms("assassin-smoke-step", [
    { id: "cover", name: "Укрыться в дыму", description: "Уводит в настоящую скрытность и сохраняет уклонение на 2 хода. Ускорения нет, темп 1,0 вместо 0,6: за подготовку выхода придётся отдать больше времени.",
      patch: { tempo: 1 }, replaceEffects: [selfEff("evasion", 2, { value: 15 })],
      on: { afterAction(b, s, c) { if (c.skill?.id === "assassin-smoke-step") hide(b); } } },
    { id: "screen", name: "Ложный след", description: "Вместо уклонения и ускорения ослепляет всех врагов на 20 на 2 хода. Темп 0,8 вместо 0,6; скрытности не даёт. Защита зависит от меткости врагов.",
      patch: { tempo: 0.8 }, replaceEffects: [], on: { afterAction(b, s, c) {
        if (c.skill?.id === "assassin-smoke-step") eachFoe(b, () => fx(b, "blind", 2, 20));
      } } }
  ]);
  defineSkillForms("assassin-toxic-cut", [
    { id: "linger", name: "Долгий токсин", description: "Удар слабее: 0,8 вместо 1,3. Яд держится 5 ходов вместо 3, но каждая доза слабее: 18% физического урона вместо 22%. Нужен долгий бой.",
      patch: { powerMultiplier: 0.8 }, replaceEffects: [eff("poison", 5, dot("physicalDamage", 0.18, 4))] },
    { id: "hamstring", name: "Подрезать шаг", description: "Вместо яда замедляет цель на 25% на 3 хода. Удар слабее: 1,1 вместо 1,3. Покупаешь время для старого яда, но новой дозы не будет.",
      patch: { powerMultiplier: 1.1 }, replaceEffects: [eff("slow", 3, { value: 0.25 })] }
  ]);
  defineSkillForms("assassin-twin-fangs", [
    { id: "seam", name: "Один глубокий рез", description: "Один удар силой 1,25 вместо двух по 0,9. Рана держится 4 хода с силой 28% физического урона. Теряешь второе попадание и его набор приёмов.",
      patch: { hits: 1, powerMultiplier: 1.25, effectsPerHit: false }, replaceEffects: [eff("bleed", 4, dot("physicalDamage", 0.28, 4))] },
    { id: "breath", name: "Сбить дыхание", description: "Два удара по 0,65 вместо 0,9. Вместо ран ослабляет цель на 20% на 2 хода. Серия собирает приёмы, но больше не поддерживает кровотечение.",
      patch: { powerMultiplier: 0.65, effectsPerHit: false }, replaceEffects: [eff("weaken", 2, { value: 0.2 })] }
  ]);
  defineSkillForms("assassin-shadow-strike", [
    { id: "sidestep", name: "Разойтись с ударом", description: "После выпада даёт 15 уклонения на 2 хода, помогая собрать тени. Прямой удар слабее: 1,1 вместо 1,7. Быстрый темп сохраняется.",
      patch: { powerMultiplier: 1.1 }, addEffects: [selfEff("evasion", 2, { value: 15 })] },
    { id: "eyes", name: "Слепая сторона", description: "Попадание ослепляет цель на 20 на 2 хода. Прямой удар слабее: 1,2 вместо 1,7; своего уклонения не добавляет. Помогает пережить ответ выбранного врага.",
      patch: { powerMultiplier: 1.2 }, addEffects: [eff("blind", 2, { value: 20 })] }
  ]);
  defineSkillForms("assassin-black-vial", [
    { id: "spray", name: "Разбрызгать", description: "Задевает остальных с половиной силы. Удар 0,7 вместо 1,05; яд на 3 хода с силой 18% физического урона вместо 30% на 4 хода. Одна цель теряет ради группы.",
      patch: { powerMultiplier: 0.7, aoe: 0.5 }, replaceEffects: [eff("poison", 3, dot("physicalDamage", 0.18, 4))] },
    { id: "acid", name: "Кислый состав", description: "Вместо яда надламывает броню на 25% на 3 хода. Удар 0,85 вместо 1,05. Готовит прямые попадания, но теряет дозу и будущие тики отравления.",
      patch: { powerMultiplier: 0.85 }, replaceEffects: [eff("armor_break", 3, { value: 0.25 })] }
  ]);
  defineSkillForms("assassin-plague-touch", [
    { id: "needle", name: "Гнилая игла", description: "Вместо яда оставляет рану на 3 хода с силой 24% физического урона. Ослабление прежнее, удар 0,8 вместо 1,1. Добавляет второй вид беды, но не обновляет яд.",
      patch: { powerMultiplier: 0.8 }, replaceEffects: [eff("bleed", 3, dot("physicalDamage", 0.24, 4)), eff("weaken", 2, { value: 0.2 })] },
    { id: "outbreak", name: "Разнести хворь", description: "Задевает остальных с половиной силы. Удар 0,65 вместо 1,1; яд 14% вместо 24% физического урона, слабость 10% вместо 20%. Меньше давления на одну цель.",
      patch: { powerMultiplier: 0.65, aoe: 0.5 }, replaceEffects: [eff("poison", 3, dot("physicalDamage", 0.14, 3)), eff("weaken", 2, { value: 0.1 })] }
  ]);

  defineClassStyles("assassin", [
    { id: "patient", name: "Терпеливая тень", description: "Подготовительное действие уже в скрытности усиливает следующий выход на 8–17%. Подходят стойка, ожидание и неатакующий навык. Сам уход в тень бонуса не даёт: нужно потратить ещё действие.",
      on: {
        start(b, s) { s.hidden = Boolean(b.mech?.core_assassin?.hidden); },
        turnStart(b, s) { s.hidden = Boolean(b.mech?.core_assassin?.hidden); },
        beforeHit(b, s, c) {
          if (!isDirectHit(c)) return;
          s.attacked = true;
          if (s.ready && b.mech?.core_assassin?.hidden) c.mult *= 1 + stylePower(b);
        },
        afterAction(b, s, c) {
          if (s.attacked || attacking(c)) s.ready = false;
          else if (preparing(c) && s.hidden && b.mech?.core_assassin?.hidden) s.ready = true;
          s.attacked = false;
        }
      } },
    { id: "open", name: "Открытый натиск", description: "Каждый второй атакующий навык подряд вне тени возвращает 16–34% своей цены в энергии. Выход из тени слабее на 10%. Любое другое действие или уход в тень рвёт серию.",
      on: {
        turnStart(b, s) { s.mana = b.hero.currentMana; },
        rehidden(b, s) { s.chain = 0; },
        beforeHit(b, s, c) {
          if (!isDirectHit(c)) return;
          if (!s.attacked) { s.paid = paidEnergy(b, s, c.skill); s.shadow = Boolean(b.mech?.core_assassin?.hidden); }
          s.attacked = true;
          if (b.mech?.core_assassin?.hidden) c.mult *= 0.9;
        },
        afterAction(b, s, c) {
          const paid = s.attacked ? s.paid : paidEnergy(b, s, c.skill);
          if (c.type === "skill" && attacking(c) && !s.shadow && !b.mech?.core_assassin?.hidden && paid > 0) {
            s.chain = (s.chain || 0) + 1;
            if (s.chain >= 2) { s.chain = 0; energy(b, paid * stylePower(b) * 2); }
          } else s.chain = 0;
          s.attacked = false; s.paid = 0; s.shadow = false;
        }
      } },
    { id: "trail", name: "Возврат по следу", description: "Два разных атакующих навыка подряд вне тени готовят быстрый «Скрыться»: откат снят, действие на 8–17% быстрее. Выход из тени слабее на 10%. Повтор или другое действие рвут связку.",
      on: {
        turnStart(b, s) { s.entered = false; },
        rehidden(b, s) { s.last = null; s.entered = true; },
        beforeHit(b, s, c) {
          if (!isDirectHit(c)) return;
          s.attacked = true;
          if (b.mech?.core_assassin?.hidden) { s.shadow = true; c.mult *= 0.9; }
        },
        afterAction(b, s, c) {
          const core = b.mech?.core_assassin;
          // Its ordinary three-turn cooldown expires during a two-skill
          // sequence anyway. Accelerate the prepared return itself as well,
          // so this rule has a real payoff at every style step.
          if (c.type === "wait" && s.ready && s.entered && core?.hidden) c.tempo = Math.max(0.55, c.tempo * (1 - stylePower(b)));
          s.ready = false;
          if (c.type === "skill" && attacking(c) && !s.shadow && core && !core.hidden) {
            if (s.last && s.last !== c.skill.id) { core.cd = 0; s.ready = true; s.last = null; }
            else if (s.last === c.skill.id) s.last = null;
            else s.last = c.skill.id;
          } else s.last = null;
          s.attacked = false; s.shadow = false; s.entered = false;
        }
      } }
  ]);

  defineUltimates("assassin", "class", [
    { id: "cuts", name: "Тысяча порезов", description: "Пять точных критических порезов по выбранной цели, каждый силой 0,55. Затем уходишь в скрытность. Серия не зовёт повторы теней и не собирает приёмы; остальные враги не задеты.", element: "blood",
      run(b) { for (let i = 0; i < 5 && b.enemy.currentHp > 0; i += 1) hit(b, 0.55, "Тысяча порезов", { element: "blood", forceCrit: true }); hide(b); } },
    { id: "curtain", name: "Чёрный занавес", description: "Дым ослепляет всех врагов на 30 на 3 хода, возвращает 35 энергии и уводит в скрытность. Прямого урона нет: это окно для новой подготовки, а не добивание.", element: "air",
      run(b) { eachFoe(b, () => fx(b, "blind", 3, 30)); energy(b, 35); hide(b); } }
  ]);
  defineUltimates("shade", "subclass", [
    { id: "closed", name: "Законченная комбинация", description: "Тратит все приёмы на один точный удар силой 2,4–4,9: по 0,5 за приём. Без приёмов базовый удар остаётся. Не казнит и не собирает новую комбинацию.", element: "steel",
      run(b) { const combo = take(b, "shade", 5); hit(b, 2.4 + combo * 0.5, "Законченная комбинация"); } },
    { id: "unfinished", name: "Незаконченный след", description: "Уводит в скрытность. В течение трёх следующих действий первый добивающий навык возвращает потраченные приёмы. Прямого удара нет; повторное добивание уже расходует запас.", element: "air",
      run(b, s) { hide(b); ultPhaseStart(s, 3); s.saved = false; s.combo = clamp(b.mech?.shade?.value || 0, 0, 5); },
      on: {
        turnStart(b, s) { if (ultPhaseActive(s)) s.combo = clamp(b.mech?.shade?.value || 0, 0, 5); },
        afterAction(b, s, c) {
          if (c.type === "ult" || !ultPhaseActive(s)) return;
          if (c.skill?.finisher && !s.saved) {
            s.saved = true;
            if (b.mech?.shade) b.mech.shade.value = Math.max(b.mech.shade.value, s.combo);
          }
          ultPhaseTick(s);
        }
      } }
  ]);
  defineUltimates("venom", "subclass", [
    { id: "concentrate", name: "Смертельная концентрация", description: "Снимает яд ради точного удара силой 2,0 и выплаты двух сил дозы, не выше 200% физического урона. Без яда остаётся удар. Длительность яда в выплату не входит.", element: "poison",
      run(b) {
        const value = Math.min(wound(b, 2), Math.max(0, effectValue(b.enemy, "poison") * 2));
        removeFx(b.enemy, "poison");
        hit(b, 2, "Смертельная концентрация", { element: "poison" });
        poisonPay(b, value, "Концентрат токсина");
      } },
    { id: "long-poison", name: "Долгое отравление", description: "Продлевает яд на 2 хода; без яда даёт дозу на 3 хода с силой 20% физического урона. На три следующих действия тики яда сильнее на 25%, включая новые дозы. Немедленной выплаты нет.", element: "poison",
      run(b, s) { prolongPoison(b); ultPhaseStart(s, 3); },
      on: { beforeTick(b, s, c) { if (ultPhaseActive(s) && c.id === "poison") c.amount *= 1.25; }, afterAction: tickPhase }
    }
  ]);
  defineUltimates("blade", "profession", [
    { id: "last-line", name: "Последняя черта", description: "Тратит приёмы на удар силой 2,6–4,85. Если цель уже под обычным порогом казни, завершает бой; порог боссов вдвое ниже. Без приёмов остаётся базовый удар.", element: "blood",
      run(b) {
        const threshold = getExecuteThreshold(b);
        const execute = hpRatio(b.enemy) <= threshold;
        const combo = take(b, "shade", 5);
        if (!execute) { hit(b, 2.6 + combo * 0.45, "Последняя черта", { element: "blood" }); return; }
        b.lastExecute = true;
        const { hpDamage } = dealDamage(b, b.enemy, b.enemy.currentHp, { raw: true });
        emit(b, "hit", { target: "enemy", amount: hpDamage, crit: true, kind: "physical", element: "blood", label: "Последняя черта" });
        logEvent(b, "Последняя черта: казнь!", "Клинок");
      } },
    { id: "red-road", name: "Красная дорожка", description: "Оставляет рану на 3 хода с силой 20% физического урона. Три следующих действия тики ран сильнее на 40%, а добивающий навык возвращает 30% уплаченной энергии. Прямого удара нет.", element: "blood",
      run(b, s) { fx(b, "bleed", 3, wound(b, 0.2)); ultPhaseStart(s, 3); s.mana = b.hero.currentMana; },
      on: {
        turnStart(b, s) { if (ultPhaseActive(s)) s.mana = b.hero.currentMana; },
        beforeTick(b, s, c) { if (ultPhaseActive(s) && c.id === "bleed") c.amount *= 1.4; },
        afterAction(b, s, c) {
          if (c.type === "ult" || !ultPhaseActive(s)) return;
          if (c.skill?.finisher) energy(b, paidEnergy(b, s, c.skill) * 0.3);
          ultPhaseTick(s);
        }
      } }
  ]);
  defineUltimates("phantom", "profession", [
    { id: "reflections", name: "Все отражения", description: "Расходует все тени. Ты бьёшь выбранную цель с силой 2,2, затем каждая тень добавляет точный удар силой 0,7. Без теней остаётся твой удар. Новые повторы не запускаются.", element: "steel",
      run(b) { const shades = take(b, "phantom", 3); hit(b, 2.2, "Все отражения"); for (let i = 0; i < shades && b.enemy.currentHp > 0; i += 1) hit(b, 0.7, "Отражение клинка"); } },
    { id: "empty", name: "Пустое место", description: "Уводит в скрытность, даёт 15 уклонения на 3 хода. Три следующих действия первый заслон между твоими ходами не расходует тень. Без таланта заслона остаются дым и уклонение; удара нет.", element: "air",
      run(b, s) { hide(b); fx(b, "evasion", 3, 15, { self: true }); ultPhaseStart(s, 3); s.kept = false; },
      on: {
        enemyAttack(b, s) { if (ultPhaseActive(s)) s.shades = clamp(b.mech?.phantom?.value || 0, 0, 3); },
        dodged(b, s) { if (ultPhaseActive(s)) s.shades = clamp(b.mech?.phantom?.value || 0, 0, 3); },
        incoming(b, s) {
          const state = b.mech?.phantom;
          // Ordinary echoes do not consume shadows in this engine. The
          // optional phantom/3 screen does, before build incoming hooks run.
          if (!ultPhaseActive(s) || s.kept || !state || !(s.shades > state.value)) return;
          state.value = s.shades; s.kept = true;
        },
        afterAction(b, s, c) { if (c.type !== "ult") { s.kept = false; ultPhaseTick(s); } }
      } }
  ]);
  defineUltimates("poisoner", "profession", [
    { id: "vessel", name: "Вскрыть сосуд", description: "Точный удар силой 1,4 и весь оставшийся конечный урон яда сразу, затем яд снят. Без яда остаётся удар. Бессрочный яд снимается без выплаты: бесконечного остатка нет.", element: "poison",
      run(b) { const amount = poisonLeft(b, getEffect(b.enemy, "poison")); removeFx(b.enemy, "poison"); hit(b, 1.4, "Вскрыть сосуд", { element: "poison" }); poisonPay(b, amount, "Вскрыть сосуд"); } },
    { id: "caustic", name: "Едкий настой", description: "Продлевает яд на 2 хода; без него даёт дозу силой 20% физического урона на 3 хода. Три следующих действия тики яда снимают ещё 4 защиты, до 60% исходной брони. Мгновенного урона нет.", element: "poison",
      run(b, s) { prolongPoison(b); ultPhaseStart(s, 3); },
      on: {
        tick(b, s, c) {
          if (!ultPhaseActive(s) || c.id !== "poison" || b.enemy.currentHp <= 0) return;
          const old = Number(b.enemy.defShred || 0);
          b.enemy.defShred = Math.max(old, Math.min(b.enemy.physicalDefense * 0.6, old + 4));
        },
        afterAction: tickPhase
      } }
  ]);
  defineUltimates("plaguebearer", "profession", [
    { id: "rupture", name: "Прорыв заражения", description: "Тратит заражение и чуму. Даёт цели яд и рану, если их нет, переносит половину их силы остальным. Следующий тик каждой беды на главной цели сильнее на 50–100%. Прямого удара нет.", element: "poison",
      run(b, s) {
        const infection = take(b, "plaguebearer", 5);
        if (b.mech?.plaguebearer) b.mech.plaguebearer.plague = false;
        ["poison", "bleed"].forEach(id => { if (!hasFx(b.enemy, id)) fx(b, id, 3, wound(b, 0.14)); });
        const source = b.enemy;
        const copies = ["poison", "bleed"].map(id => getEffect(source, id)).filter(Boolean).map(e => ({ id: e.id, duration: Math.min(4, e.duration), value: e.value * 0.5 }));
        eachFoe(b, () => copies.forEach(e => fx(b, e.id, e.duration, e.value)), false);
        s.target = source; s.next = new Set(copies.map(e => e.id)); s.mult = 1.5 + infection * 0.1;
      },
      on: { beforeTick(b, s, c) { if (b.enemy === s.target && s.next?.has(c.id)) { s.next.delete(c.id); c.amount *= s.mult; } } } },
    { id: "fever-life", name: "Лихорадочная жизнь", description: "Лечит на 8% здоровья и сохраняет заражение. Три следующих действия яд и раны дополнительно лечат на 20% урона, всего до 8% здоровья между твоими ходами. Не ускоряет тики и не разносит беды.", element: "blood",
      run(b, s) { procHeal(b, 0.08, "Лихорадочная жизнь"); ultPhaseStart(s, 3); s.healed = 0; },
      on: {
        tick(b, s, c) {
          if (!ultPhaseActive(s) || !["poison", "bleed"].includes(c.id) || b.hero.currentHp <= 0) return;
          const amount = Math.max(0, Math.min(c.amount * 0.2, b.hero.maxHp * 0.08 - s.healed));
          s.healed += amount;
          if (amount > 0) healUnit(b, b.hero, amount, "Лихорадочная жизнь");
        },
        afterAction(b, s, c) { if (c.type !== "ult") { s.healed = 0; ultPhaseTick(s); } }
      } }
  ]);

  // Missing conditional entrances and priced keystones belong to a private
  // school. Shared schools and the stable IDs of their talents stay intact.
  defineSchool("x-assassin", "Развилки ремесла", "Связки и ключевые решения для пяти школ ассасина.", { classes: ["assassin"] });
  const add = (tier, kind, name, description, spec) => {
    T("x-assassin", tier, kind, name, description, spec);
    return TALENT_SCHOOLS["x-assassin"].talents.slice(-1)[0];
  };
  const checkExit = add(1, "make", "Проверить выход", "Стойка в скрытности ослепляет выбранного врага на 10 на 2 хода. Подготовка помогает пережить ответ.",
    { on: { afterAction(b, s, c) { if (c.type === "guard" && b.mech?.core_assassin?.hidden) fx(b, "blind", 2, 10); } } });
  const bitterEdge = add(1, "make", "Горькая кромка", "Первое обычное попадание за действие отравляет цель без яда на 2 хода с силой 10% физического урона. Навыки дозу не дают.",
    { on: {
      afterHit(b, s, c) { if (isDirectHit(c) && !c.skill && !s.done) { s.done = true; if (!hasFx(b.enemy, "poison")) fx(b, "poison", 2, wound(b, 0.1)); } },
      afterAction(b, s) { s.done = false; }
    } });
  const taste = add(1, "link", "Читать дрожь", "По цели, пережившей хотя бы два тика текущего яда, прямые удары получают ещё 8% шанса крита. Новая доза начинает отсчёт заново.",
    { on: { beforeHit(b, s, c) { if (isDirectHit(c) && ticksOf(b, "poison") >= 2) c.critBonus += 8; } } });
  const quietWound = add(1, "shift", "Не торопить рану", "Стойка продлевает рану выбранной цели на ход, до 5 оставшихся ходов. Работает только с уже открытой раной.",
    { on: { afterAction(b, s, c) { const e = getEffect(b.enemy, "bleed"); if (c.type === "guard" && e) e.duration = Math.max(e.duration, Math.min(5, e.duration + 1)); } } });
  const smallCut = add(1, "make", "Короткий рез", "Первое прямое попадание без крита за действие оставляет рану, если её нет: 2 хода, 8% физического урона. Повторы и тики не подходят.",
    { on: {
      afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "physical" && !c.crit && !s.done) { s.done = true; if (!hasFx(b.enemy, "bleed")) fx(b, "bleed", 2, wound(b, 0.08)); } },
      afterAction(b, s) { s.done = false; }
    } });
  const coveredRetreat = add(1, "link", "Прикрыть отход", "Стойка сразу после атакующего навыка даёт 10 уклонения на ход. Другое действие рвёт подготовку.",
    { on: { afterAction(b, s, c) { if (c.type === "guard" && s.ready) fx(b, "evasion", 1, 10, { self: true }); s.ready = Boolean(c.skill?.attackType); } } });
  const changeHand = add(1, "link", "Смена руки", "Обычная атака сразу после навыка занимает на 15% меньше времени. Два навыка подряд не получают ускорения.",
    { on: { afterAction(b, s, c) { if (c.type === "attack" && s.ready) c.tempo = Math.max(0.55, c.tempo * 0.85); s.ready = c.type === "skill"; } } });
  const slowBrew = add(4, "key", "Медленная смесь", "Тики яда сильнее на 40%, но навыки, накладывающие яд, занимают на 25% больше времени. Выигрываешь ожиданием, теряешь частоту доз.",
    { on: {
      beforeTick(b, s, c) { if (c.id === "poison") c.amount *= 1.4; },
      afterAction(b, s, c) { if (c.type === "skill" && c.skill?.appliedEffects?.some(e => e.id === "poison")) c.tempo *= 1.25; }
    } });
  const longWound = add(4, "key", "Незаживающий след", "Раны держатся на 2 хода дольше, но прямой урон ниже на 15%. Сила кровотечения не получает бесконечного роста.",
    { mods: { "dur:bleed": 2, dmg: -0.15 } });
  const bloodDeal = add(4, "key", "Кровавая сделка", "Тики ран дополнительно лечат на 30% урона, до 6% здоровья между твоими ходами. Цена: запас здоровья меньше на 20%; без ран лечения нет.",
    { mods: { maxHpPct: -0.2 }, on: {
      turnStart(b, s) { s.healed = 0; },
      tick(b, s, c) {
        if (c.id !== "bleed" || b.hero.currentHp <= 0) return;
        const amount = Math.max(0, Math.min(c.amount * 0.3, b.hero.maxHp * 0.06 - Number(s.healed || 0)));
        s.healed = Number(s.healed || 0) + amount;
        if (amount > 0) healUnit(b, b.hero, amount, "Кровавая сделка");
      }
    } });
  const finalStep = add(4, "key", "Последний шаг", "Уклонение готовит следующий навык: он занимает на 30% меньше времени. Цена: пропущенные удары сильнее на 20% весь бой.",
    { mods: { taken: 0.2 }, on: { dodged(b, s) { s.ready = true; }, afterAction(b, s, c) { if (c.type === "skill" && s.ready) { s.ready = false; c.tempo = Math.max(0.55, c.tempo * 0.7); } } } });
  const measured = add(4, "key", "Выверенный ритм", "Навык сразу после стойки или ожидания занимает на 25% меньше времени. Без подготовки навыки медленнее на 15%. Любое другое действие рвёт связку.",
    { on: { afterAction(b, s, c) { if (c.type === "skill") c.tempo = Math.max(0.55, c.tempo * (s.ready ? 0.75 : 1.15)); s.ready = c.type === "guard" || c.type === "wait"; } } });

  const pathKeys = {};
  [
    ["blade", "Круг алого клинка", "Добивание по кровоточащей цели сильнее на 30%. Цена: прямые удары по цели без раны слабее на 15%; сначала нужно открыть кровь.", {
      beforeHit(b, s, c) { if (!hasFx(b.enemy, "bleed")) c.mult *= 0.85; }
    }],
    ["phantom", "Долг отражению", "Тень с шансом 25% принимает удар и исчезает. Цена: пропущенные удары сильнее на 15%. Без накопленных теней заслона нет.", null, { taken: 0.15 }],
    ["poisoner", "Разрез до кости", "«Вскрытие раны» оставляет глубокую рану и слабость. Цена: прямой урон ниже на 15%; выигрыш приходит через тики и ослабление.", null, { dmg: -0.15 }],
    ["plaguebearer", "Цена носителя", "В чуме прямые попадания отравляют и ранят цель. Цена: запас здоровья меньше на 20%; до чумы этот запас тоже потерян.", null, { maxHpPct: -0.2 }]
  ].forEach(([id, name, description, extraOn, mods]) => {
    const original = TALENTS[`${id}/3`].on;
    const on = { ...original };
    if (extraOn?.beforeHit) on.beforeHit = (b, s, c) => { original.beforeHit?.(b, s, c); extraOn.beforeHit(b, s, c); };
    pathKeys[id] = add(4, "key", name, description, { mods: mods || {}, on });
  });

  const sub = n => ({ stage: "subclass", map: { shade: `shade/${n}`, venom: `venom/${n}` } });
  const prof = n => ({ stage: "profession", map: Object.fromEntries(["blade", "phantom", "poisoner", "plaguebearer"].map(id => [id, `${id}/${n}`])) });
  const slots = (ids, modules = {}) => ids.map((talent, i) => ({
    key: ["a1", "a2", "a3", "a4", "b1", "b2", "c1", "c2", "c3", "d1", "d2"][i],
    tier: i < 4 ? 1 : i < 6 ? 2 : i < 9 ? 3 : 4,
    talent,
    ...(i < 4 ? {} : { afterAny: [null, null, null, null, ["a1", "a2"], ["a3", "a4"], ["b1"], ["b2"], ["b1"], ["c1", "c2"], ["c2", "c3"]][i] }),
    ...(modules[i] ? { module: modules[i] } : {})
  }));
  defineTalentBoard("assassin", [
    { id: "c-assassin", name: "Ремесло убийцы", description: "Скрытность, подготовка и завершение удара. Шесть мест меняются с путём; риск сильного крита остаётся общим ключевым выбором.",
      slots: slots(["c-assassin/1", "c-assassin/2", "crit/2", checkExit, "c-assassin/3", "c-assassin/4", "c-assassin/5", "c-assassin/6", "crit/10", "c-assassin/7", "crit/9"],
        { 4: sub(1), 5: sub(2), 6: sub(3), 7: prof(1), 8: prof(2), 9: { stage: "profession", map: pathKeys } }) },
    { id: "poison", name: "Яд", description: "Дать яду время, связать его с раной или разнести после смерти. Бессрочная слабая отрава конкурирует с сильными тиками ценой медленного нанесения.",
      slots: slots(["poison/2", "poison/3", bitterEdge, taste, "poison/5", "poison/6", "poison/7", "poison/8", "poison/11", "poison/10", slowBrew]) },
    { id: "bleed", name: "Кровь", description: "Криты открывают раны, стойка держит их, тики кормят и замедляют. Долгие раны стоят прямого урона, сильное лечение — запаса здоровья.",
      slots: slots(["bleed/2", "bleed/3", quietWound, smallCut, "bleed/4", "bleed/5", "bleed/7", "bleed/8", "bleed/11", longWound, bloodDeal]) },
    { id: "evasion", name: "Увёртливость", description: "Уклониться, ответить и спрятаться за чужим промахом. Можно потерять запас здоровья ради уклонения либо рискнуть силой входящих ударов ради темпа.",
      slots: slots(["evasion/1", "evasion/2", "evasion/3", coveredRetreat, "evasion/4", "evasion/5", "evasion/7", "evasion/8", "evasion/10", "evasion/9", finalStep]) },
    { id: "tempo", name: "Темп", description: "Быстрые навыки, смена руки и два действия до ответа врага. Постоянная скорость ослабляет защиту; выверенный ритм требует подготовительных действий.",
      slots: slots(["tempo/1", "tempo/2", "tempo/3", changeHand, "tempo/4", "tempo/5", "tempo/7", "tempo/8", "crit/7", "tempo/9", measured]) }
  ]);
})();
