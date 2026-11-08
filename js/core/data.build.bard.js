// Bard build content. Only this class's registries and its private school grow.
(() => {
  const hit = (b, power, label, extra = {}) => performHeroHit(b, {
    kind: "magic", power, label, element: "air", sure: true,
    noEcho: true, proc: true, ...extra
  });
  const sweep = (b, power, label, extra = {}) => {
    const focus = b.enemy;
    eachFoe(b, foe => hit(b, power * (foe === focus ? 1 : 0.5), label, extra));
  };
  const shield = (b, amount) => {
    if (b.hero.currentHp <= 0 || amount <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const boost = Math.max(0.01, (1 + tm(b.hero, "shield")) * (b.firstShieldBoost ? 1.5 : 1));
    const total = Math.min(cap, effectValue(b.hero, "shield") + amount * boost);
    // Only the new portion receives shield bonuses; do not amplify the reserve.
    const e = fx(b, "shield", 3, total / boost, { self: true });
    if (e) e.value = Math.min(cap, e.value);
  };
  const take = (b, id, max) => {
    const state = b.mech?.[id];
    const value = clamp(Number(state?.value || 0), 0, max);
    if (state) state.value = 0;
    return value;
  };
  const cleanse = (b, all = false) => {
    let removed = false;
    b.hero.effects = (b.hero.effects || []).filter(e => {
      if (STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad" || (removed && !all)) return true;
      removed = true;
      return false;
    });
  };
  // afterAction also fires for the ultimate itself, before the promised phase.
  const tickPhase = (b, s, c) => { if (c.type !== "ult") ultPhaseTick(s); };
  const voices = b => (b.hero.summonedUnits || []).filter(u => u.role === "voice");
  const voiceConfig = SKILL_CATALOG["bard-echo-choir"].summonUnitConfig;

  defineSkillForms("bard-resonating-chord", [
    { id: "hall", name: "На весь зал", description: "Задевает остальных врагов с половиной силы. Главный удар слабее: 1,05 вместо 1,45. Немедленное лечение и регенерация исчезают: вся песня идёт в наступление.",
      patch: { powerMultiplier: 1.05, aoe: 0.5, selfHealMultiplier: 0 }, replaceEffects: [] },
    { id: "shelter", name: "Звук под ладонью", description: "Вместо удара лечит с силой 0,8 и даёт щит от 60% силы лечения на 3 хода. Не ранит врага и не даёт регенерации. Играет ноту поддержки вместо удара.",
      patch: { attackType: null, targetType: "self", selfHealMultiplier: 0.8 },
      replaceEffects: [selfEff("shield", 3, dot("healingPower", 0.6, 8))],
      on: { afterAction(b, s, c) {
        if (c.skill?.id !== "bard-resonating-chord") return;
        const e = getEffect(b.hero, "shield");
        if (e) e.value = Math.min(e.value, Math.round(b.hero.maxHp * 0.6));
      } } }
  ]);
  defineSkillForms("bard-soothing-verse", [
    { id: "pause", name: "Тихая пауза", description: "Сохраняет немедленное лечение и снимает одну беду с тебя. Регенерации больше нет: после куплета здоровье само не вернётся.",
      replaceEffects: [], on: { afterAction(b, s, c) { if (c.skill?.id === "bard-soothing-verse") cleanse(b); } } },
    { id: "echo", name: "Долгое эхо", description: "Немедленного лечения нет. Вместо него регенерация на 5 ходов с силой 40% силы лечения за тик вместо 32% на 3 хода. Выплату придётся переждать.",
      patch: { selfHealMultiplier: 0 }, replaceEffects: [selfEff("regeneration", 5, dot("healingPower", 0.4, 7))] }
  ]);
  defineSkillForms("bard-sharp-verse", [
    { id: "chorus", name: "Куплет для толпы", description: "Волна задевает остальных врагов с половиной силы. По выбранной цели сила ниже: 1,0 вместо 1,5. Одиночное давление уступает место работе по группе.",
      patch: { powerMultiplier: 1, aoe: 0.5 } },
    { id: "drag", name: "Вязкие слова", description: "Замедляет цель на 25% на 2 хода, но сила удара ниже: 1,05 вместо 1,5. Играет ноту порчи вместо удара: куплет готовит контроль и другой мотив.",
      patch: { powerMultiplier: 1.05 }, addEffects: [eff("slow", 2, { value: 0.25 })] }
  ]);
  defineSkillForms("bard-gentle-hymn", [
    { id: "brace", name: "Гимн под ударом", description: "Включает гимн стойкости, но вместо немедленного лечения и регенерации даёт закалку на 25% на 2 хода. Пропущенную рану придётся лечить другим приёмом.",
      patch: { selfHealMultiplier: 0 }, replaceEffects: [selfEff("fortify", 2, { value: 0.25 })] },
    { id: "breath", name: "Один долгий выдох", description: "Лечит с силой 1,25 вместо 0,7, но не включает гимн стойкости и не даёт регенерации. Уже звучащий гимн сохраняется; постоянное лечение нужно готовить отдельно.",
      patch: { hymn: null, selfHealMultiplier: 1.25 }, replaceEffects: [] }
  ]);
  defineSkillForms("bard-war-hymn", [
    { id: "shelter", name: "Куплет заслона", description: "Куплет ветра по-прежнему входит в сагу. Вместо ярости и ускорения даёт закалку на 25% на 3 хода: подготовка припева становится защитной.",
      replaceEffects: [selfEff("fortify", 3, { value: 0.25 })] },
    { id: "hold", name: "Перед припевом", description: "Ярость и ускорение сильнее: 25% вместо 20%, но длятся 2 хода вместо 3. Не добавляет куплет ветра в сагу: припев этим приёмом не завершить.",
      patch: { verse: null }, replaceEffects: [selfEff("rage", 2, { value: 0.25 }), selfEff("haste", 2, { value: 0.25 })] }
  ]);
  defineSkillForms("bard-mocking-tune", [
    { id: "crowd", name: "Смех по рядам", description: "Слабость и метка ложатся на всю группу; остальные получают половину силы удара. По главной цели сила ниже: 0,75 вместо 1,1.",
      patch: { powerMultiplier: 0.75, aoe: 0.5 } },
    { id: "sidestep", name: "Смешок из-за плеча", description: "Вместо удара и метки даёт 15% уклонения на 2 хода. Слабость на враге остаётся: дразнилка помогает пережить ответ, но не открывает цель для урона.",
      patch: { attackType: null, targetType: "self" },
      replaceEffects: [eff("weaken", 2, { value: 0.25 }), selfEff("evasion", 2, { value: 15 })] }
  ]);
  defineSkillForms("bard-dirge", [
    { id: "procession", name: "Песнь процессии", description: "Ослабляет всю группу на 22% вместо 30%; по остальным проходит половина удара. Главный удар слабее: 0,75 вместо 1,1. Одиночная защита уступает охвату.",
      patch: { powerMultiplier: 0.75, aoe: 0.5 }, replaceEffects: [eff("weaken", 3, { value: 0.22 })] },
    { id: "lament", name: "Слова под кожей", description: "Вместо слабости оставляет порчу на 4 хода с силой 22% магического урона за тик. Прямой удар слабее: 0,8 вместо 1,1. Враг сохраняет силу, пока песнь разъедает его.",
      patch: { powerMultiplier: 0.8 }, replaceEffects: [eff("corruption", 4, dot("skillDamage", 0.22, 4))] }
  ]);
  defineSkillForms("bard-echo-choir", [
    { id: "healer", name: "Голос утешения", description: "Создаёт целителя на 7 ходов вместо голоса на 5. Сила лечения 30% вместо 26%. Не ранит врага, не входит в аккорд и не расходуется Кульминацией: место в хоре занято поддержкой.",
      patch: { summonUnitConfig: { ...voiceConfig, role: "healer", name: "Голос утешения", duration: 7, actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.3, minValue: 8 } } } },
    { id: "brief", name: "Яркое эхо", description: "Голос лечит и ранит с силой 40% силы лечения вместо 26%, но живёт 3 хода вместо 5. Быстрая выплата оставляет меньше времени на сбор полного хора.",
      patch: { summonUnitConfig: { ...voiceConfig, duration: 3, actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.4, minValue: 10 } } } }
  ]);

  // The engine pays a motif before firing its event. March can be scaled in
  // beforeHit; the event adjusts the other rewards. Track the preceding notes
  // to distinguish a pure life motif from a pure shade motif after the reset.
  const rememberNotes = (b, s) => { s.notes = [...(coreState(b)?.notes || [])]; };
  const motifNote = s => (s.notes || [])[0];
  const motifEffects = new WeakMap();
  const tuneBuff = (b, unit, id, base, factor, event) => {
    const e = getEffect(unit, id);
    if (!e) return;
    const value = base * (1 + tm(b.hero, `val:${id}`)) * (unit === b.hero ? 1 : getEnemyResist(unit, id));
    const previous = motifEffects.get(e);
    // applyEffect keeps the stronger old value. Recover its untuned strength
    // before the next motif, so refreshing a curse cannot grow it forever.
    const raw = previous && (previous.event === event || previous.value === e.value) ? previous.raw : Math.max(value, e.value);
    e.value = raw > value + 0.000001 ? raw : value * factor;
    motifEffects.set(e, { raw, value: e.value, event });
  };
  const tuneMotif = (b, event, note, delta, healingDelta = delta) => {
    const same = event.same;
    const old = event.bardPower || 1;
    const factor = old * (1 + delta);
    const change = factor - old;
    event.bardPower = factor;
    if (same === 3) {
      tuneBuff(b, b.hero, "rage", 0.25, factor, event);
      procMana(b, 0.15 * change);
    } else if (same === 2) procMana(b, 0.05 * change);
    else if (note === "life") {
      // The price of the two mixed-note styles affects the shield, not healing.
      const oldHeal = event.bardHealPower || 1;
      const healFactor = oldHeal * (1 + Math.max(0, healingDelta));
      event.bardHealPower = healFactor;
      if (healFactor > oldHeal) procHeal(b, 0.15 * (1 + tm(b.hero, "motifPower")) * (healFactor - oldHeal), "послезвучие гимна");
      if (change > 0) {
        shield(b, b.hero.maxHp * 0.12 * change);
      } else {
        const e = getEffect(b.hero, "shield");
        if (e) e.value = Math.max(0, e.value + b.hero.maxHp * 0.12 * change * (1 + tm(b.hero, "shield")));
      }
    } else if (note === "shade") eachFoe(b, foe => {
      tuneBuff(b, foe, "weaken", 0.25, factor, event);
      tuneBuff(b, foe, "mark", 0.2, factor, event);
    });
  };
  defineClassStyles("bard", [
    { id: "ostinato", name: "Остинато", description: "Три одинаковые ноты усиливают марш, лечение и щит гимна либо реквием на 8–17%. У аккорда слабее ярость; после любого иного мотива теряется дыхание в размере 8–17% его обычной выплаты.",
      on: {
        start: rememberNotes,
        beforeHit(b, s, c) { if (c.label === "Марш" && c.proc) c.mult *= 1 + stylePower(b); },
        motif(b, s, c) { tuneMotif(b, c, motifNote(s), (c.same === 1 ? 1 : -1) * stylePower(b)); },
        afterAction: rememberNotes
      } },
    { id: "three-voices", name: "Три голоса", description: "Три разные ноты дают на 8–17% больше ярости аккорда и дыхания. Повтор одной ноты ослабляет марш, щит гимна и реквием на 8–17%. Лечение гимна сохраняется.",
      on: {
        start: rememberNotes,
        beforeHit(b, s, c) { if (c.label === "Марш" && c.proc) c.mult *= 1 - stylePower(b); },
        motif(b, s, c) { if (c.same !== 2) tuneMotif(b, c, motifNote(s), (c.same === 3 ? 1 : -1) * stylePower(b)); },
        afterAction: rememberNotes
      } },
    { id: "syncopation", name: "Синкопа", description: "Две одинаковые ноты и третья иная готовят усиление следующего мотива на 8–17%. Три одинаковые ослабляют марш, щит гимна и реквием на столько же. Лечение гимна не штрафуется.",
      on: {
        start: rememberNotes,
        beforeHit(b, s, c) { if (c.label === "Марш" && c.proc) c.mult *= 1 + (s.ready ? stylePower(b) : 0) - stylePower(b); },
        motif(b, s, c) {
          const delta = (s.ready ? stylePower(b) : 0) - (c.same === 1 ? stylePower(b) : 0);
          tuneMotif(b, c, motifNote(s), delta, s.ready ? stylePower(b) : 0);
          s.ready = c.same === 2;
        },
        afterAction: rememberNotes
      } }
  ]);

  defineUltimates("bard", "class", [
    { id: "finale", name: "Великий финал", description: "Снимает с тебя все беды и немедленно лечит на 30% здоровья. Не ранит врагов и не оглушает: финал нужен, чтобы пережить опасный спад.", element: "holy",
      run(b) { cleanse(b, true); procHeal(b, 0.3, "Великий финал"); } },
    { id: "continue", name: "Песня продолжается", description: "Следующие три завершённых мотива сильнее на 40% и дают ещё 6% дыхания каждый. Короткий припев тоже считается. Немедленного лечения нет: нужно продолжать песню.", element: "holy",
      run(b, s) { s.motifs = 3; rememberNotes(b, s); },
      on: {
        beforeHit(b, s, c) { if (s.motifs > 0 && c.label === "Марш" && c.proc) c.mult *= 1.4; },
        motif(b, s, c) {
          if (!(s.motifs > 0)) return;
          s.motifs -= 1;
          tuneMotif(b, c, motifNote(s), 0.4);
          procMana(b, 0.06);
        },
        afterAction: rememberNotes
      } }
  ]);
  defineUltimates("lyre", "subclass", [
    { id: "cadenza", name: "Беглая каденция", description: "Расходует весь ритм. Звуковой удар силой 2,2–4,2 по выбранной цели, половина силы по остальным. Без ритма базовый удар остаётся; серию придётся собирать заново.", element: "air",
      run(b) { sweep(b, 2.2 + take(b, "lyre", 4) * 0.5, "Беглая каденция"); } },
    { id: "steady", name: "Несбиваемый размер", description: "Следующие три навыка сохраняют ритм при повторе, а новый навык даёт две единицы вместо одной. При пустой шкале помогает начать серию; немедленного удара нет.", element: "air",
      run(b, s) { s.skills = 3; s.rhythm = b.mech?.lyre?.value || 0; s.last = b.mech?.lyre?.last; },
      on: { afterAction(b, s, c) {
        if (!(s.skills > 0) || c.type !== "skill") return;
        s.skills -= 1;
        const rhythm = b.mech?.lyre;
        if (!rhythm) return;
        if (s.last === c.skill.id) rhythm.value = Math.max(rhythm.value, s.rhythm);
        else addGauge(rhythm, 1, 4);
        s.last = c.skill.id;
        s.rhythm = rhythm.value;
      } } }
  ]);

  const hymnPulse = (b, active, power) => {
    if (active === "endurance") procHeal(b, 0.03 * power, "гимн стойкости");
    if (active === "clarity") procMana(b, 0.06 * power);
    if (active === "might") fx(b, "rage", 2, Math.min(0.45, 0.15 * power), { self: true });
  };
  defineUltimates("hymn", "subclass", [
    { id: "full-voice", name: "Гимн во весь голос", description: "Стойкость лечит на 15% здоровья, ясность даёт 30% дыхания, мощь — 45% ярости на 2 хода. Без гимна звучит стойкость. Гимн молчит до конца следующего твоего действия.", element: "holy",
      run(b, s) {
        s.resume = b.mech?.hymn?.active || "endurance";
        hymnPulse(b, s.resume, 5);
        if (b.mech?.hymn) b.mech.hymn.active = null;
        s.muted = true;
      },
      on: { afterAction(b, s, c) {
        if (!s.muted || c.type === "ult") return;
        if (b.mech?.hymn && !c.skill?.hymn) b.mech.hymn.active = s.resume;
        s.muted = false;
      } } },
    { id: "sustain", name: "Долгое звучание", description: "На три следующих действия гимн действует вдвое сильнее. Смена на другой гимн сразу даёт его усиленный эффект; повтор не даёт. Если гимна нет, включает стойкость. Взрывного удара нет.", element: "holy",
      run(b, s) {
        ultPhaseStart(s, 3);
        if (b.mech?.hymn) b.mech.hymn.active ||= "endurance";
        s.active = b.mech?.hymn?.active || "endurance";
      },
      on: {
        turnStart(b, s) { if (ultPhaseActive(s) && b.mech?.hymn?.active !== "might") hymnPulse(b, b.mech?.hymn?.active, 1); },
        beforeHit(b, s, c) { if (ultPhaseActive(s) && b.mech?.hymn?.active === "might") c.mult *= 1.3 / 1.15; },
        afterAction(b, s, c) {
          if (c.type === "ult" || !ultPhaseActive(s)) return;
          if (c.skill?.hymn && c.skill.hymn !== s.active) hymnPulse(b, c.skill.hymn, 2);
          s.active = b.mech?.hymn?.active;
          ultPhaseTick(s);
        }
      } }
  ]);
  defineUltimates("skald", "profession", [
    { id: "last-verse", name: "Последний куплет саги", description: "Расходует куплеты. Удар силой 2,2; куплет грома добавляет 0,9, ветер даёт 25% ускорения на 3 хода, жизнь лечит на 12% здоровья. Всегда даёт 15% ярости на 3 хода, даже без куплетов.", element: "air",
      run(b) {
        const song = b.mech?.skald;
        const verses = [...(song?.verses || [])];
        if (song) song.verses = [];
        hit(b, 2.2 + (verses.includes("blade") ? 0.9 : 0), "Последний куплет саги");
        fx(b, "rage", 3, 0.15, { self: true });
        if (verses.includes("wind")) fx(b, "haste", 3, 0.25, { self: true });
        if (verses.includes("life")) procHeal(b, 0.12, "Последний куплет саги");
      } },
    { id: "ongoing-saga", name: "Сага в разгаре", description: "На три следующих действия сохраняет куплеты после припева. Каждый сыгранный куплет лечит на 4% здоровья и добавляет щит на 6%. Без подготовки помогает собрать сагу; сразу не бьёт.", element: "holy",
      run(b, s) { ultPhaseStart(s, 3); s.verses = [...(b.mech?.skald?.verses || [])]; },
      on: { afterAction(b, s, c) {
        if (c.type === "ult" || !ultPhaseActive(s)) return;
        if (c.skill?.verse) {
          const verses = [...new Set([...s.verses, c.skill.verse])];
          if (b.mech?.skald && verses.length >= 3) b.mech.skald.verses = verses;
          procHeal(b, 0.04, "Сага в разгаре");
          shield(b, b.hero.maxHp * 0.06);
        }
        s.verses = [...(b.mech?.skald?.verses || [])];
        ultPhaseTick(s);
      } } }
  ]);

  // Card choices use existing actions, so no new combat buttons are needed.
  // While a hand is open, keep the ordinary random card empty: the build pays
  // exactly one chosen card, instead of letting both executors consume it.
  const showHand = (b, s) => mechNote(b, s.hand.map((id, i) => `${i + 1}: ${TRICKSTER_CARDS[id].name}${i === s.pick ? " ←" : ""}`).join("; "));
  const openHand = (b, s) => {
    const current = b.mech?.trickster?.card;
    const pool = Object.keys(TRICKSTER_CARDS);
    s.hand = current && TRICKSTER_CARDS[current] ? [current] : [];
    while (s.hand.length < 3) s.hand.push(randomFrom(pool.filter(id => !s.hand.includes(id))));
    s.pick = 0;
    s.free = Boolean(b.freeSkill);
    if (b.mech?.trickster) b.mech.trickster.card = null;
    showHand(b, s);
  };
  const payCard = (b, id, skill, free) => {
    // Coins are a refund of this skill, capped at 80% of its cost.
    if (id === "coins") {
      const refund = free ? 0 : Math.floor(Math.min(b.hero.maxMana * 0.25, getSkillResourceCost(skill, b.hero) * 0.8));
      procMana(b, refund / Math.max(1, b.hero.maxMana));
    } else TRICKSTER_CARDS[id]?.after?.(b);
  };
  const cardHooks = ordered => ({
    turnStart(b, s) {
      if (!s.hand?.length) return;
      s.free = Boolean(b.freeSkill);
      if (b.mech?.trickster) b.mech.trickster.card = null;
    },
    beforeHit(b, s, c) {
      if (!s.hand?.length || !c.skill || !isDirectHit(c) || c.skill.special === "redraw") return;
      TRICKSTER_CARDS[s.hand[s.pick]]?.hit?.(b, c);
    },
    afterAction(b, s, c) {
      if (!s.hand?.length || c.type === "ult") return;
      if (ordered && (c.type === "wait" || c.skill?.special === "redraw")) {
        s.hand.push(s.hand.shift());
        if (b.mech?.trickster) b.mech.trickster.card = null;
        showHand(b, s);
        return;
      }
      if (!ordered && ["attack", "guard", "wait"].includes(c.type)) {
        s.pick = { attack: 0, guard: 1, wait: 2 }[c.type];
        showHand(b, s);
        return;
      }
      if (c.type !== "skill" || c.skill.special === "redraw") {
        if (b.mech?.trickster) b.mech.trickster.card = null;
        return;
      }
      const card = s.hand[s.pick];
      // Clear first: a nested heal/hit must never pay another card.
      if (ordered) s.hand.shift(); else s.hand = [];
      s.pick = 0;
      if (b.mech?.trickster) b.mech.trickster.card = null;
      payCard(b, card, c.skill, s.free);
      if (s.hand.length) showHand(b, s);
    }
  });
  defineUltimates("trickster", "profession", [
    { id: "trump", name: "Козырь на стол", description: "Открывает три карты: следующему навыку достанется первая. Удар, стойка или «Настроиться» выбирают карту 1, 2 или 3. Выбранная усиливает навык, вся рука уходит. Выбор требует действия.", element: "arcane",
      run: openHand, on: cardHooks(false) },
    { id: "stacked-deck", name: "Подставная колода", description: "Открывает следующие три разные карты. Навык расходует первую; «Настроиться» или «Подмена» переносят её в конец, позволяя выбрать порядок. Карты видны в журнале, перестановка требует действия.", element: "arcane",
      run: openHand, on: cardHooks(true) }
  ]);
  defineUltimates("cantor", "profession", [
    { id: "verdict", name: "Приговор хорала", description: "Расходует весь избыток лечения на выбранную цель: удар силой 2,4 плюс 90% запаса. Без избытка базовый удар остаётся. Щита нет; для обычного хорала запас нужно собрать заново.", element: "holy",
      run(b) { hit(b, 2.4, "Приговор хорала", { element: "holy", flat: take(b, "cantor", b.hero.maxHp * 0.6) * 0.9 }); } },
    { id: "psalm-cover", name: "Покров псалма", description: "Тратит избыток на щит: 20% здоровья плюс половина запаса, всего до 60% здоровья. На три следующих действия 35% нового избытка уходят в щит, остальное копится. Немедленного урона нет.", element: "holy",
      run(b, s) { shield(b, b.hero.maxHp * 0.2 + take(b, "cantor", b.hero.maxHp * 0.6) * 0.5); ultPhaseStart(s, 3); },
      on: {
        heal(b, s, c) {
          if (!ultPhaseActive(s) || c.overflow <= 0) return;
          const converted = c.overflow * 0.35;
          if (b.mech?.cantor) b.mech.cantor.value = Math.max(0, b.mech.cantor.value - converted);
          shield(b, converted);
        },
        afterAction: tickPhase
      } }
  ]);
  defineUltimates("choirmaster", "profession", [
    { id: "one-voice", name: "Единый голос", description: "Расходует весь хор на звуковой удар силой 2,0 плюс 180% суммарной силы голосов. По остальным — половина. Без хора базовый удар остаётся, но повторных исцелений от голосов больше нет.", element: "air",
      run(b) {
        const choir = voices(b);
        const power = choir.reduce((sum, u) => sum + u.power, 0);
        choir.forEach(u => removeSummon(b, u));
        const focus = b.enemy;
        eachFoe(b, foe => {
          const ratio = foe === focus ? 1 : 0.5;
          hit(b, 2 * ratio, "Единый голос", { flat: power * 1.8 * ratio });
        });
      } },
    { id: "unbroken-choir", name: "Хор без пауз", description: "Дополняет хор до лимита, но не выше четырёх голосов, и лечит голоса до полного здоровья. В течение трёх следующих действий их срок не убывает. Прямого удара нет, хор можно потерять от ран.", element: "holy",
      run(b, s) {
        const limit = Math.min(4, getSummonLimit(b.hero));
        while ((b.hero.summonedUnits || []).length < limit) {
          if (!addSummon(b, makeSummon(SKILL_CATALOG["bard-echo-choir"], b.hero))) break;
          emit(b, "summon", { kind: "spirit" });
        }
        voices(b).forEach(u => { u.hp = u.maxHp; u.duration = Math.max(2, u.duration); });
        ultPhaseStart(s, 3);
      },
      on: { afterAction(b, s, c) {
        if (!ultPhaseActive(s)) return;
        // Summons act after this hook, including on the ultimate's own turn.
        voices(b).forEach(u => { u.duration += 1; });
        tickPhase(b, s, c);
      } } }
  ]);

  // Existing profession capstones have no price. Keep their third rule, but
  // register the priced versions here; never append to a shared school.
  defineSchool("x-bard", "Варианты искусства", "Ключевые правила барда и его путей.", { classes: ["bard"] });
  const add = (tier, kind, name, description, spec) => {
    T("x-bard", tier, kind, name, description, spec);
    return TALENT_SCHOOLS["x-bard"].talents.slice(-1)[0];
  };
  const pathKeys = {};
  [
    ["skald", "Сага наперекор", "Припев снимает все беды. Цена: входящий урон выше на 15% весь бой, даже пока куплеты ещё не собраны.", { taken: 0.15 }],
    ["trickster", "Игра по крупному", "С шансом 15% карта сохраняется на следующий ход. Цена: все навыки стоят на 15% больше дыхания.", { manaCost: 0.15 }],
    ["cantor", "Неотвязная песнь", "Погребальная песнь оставляет порчу на 3 хода. Цена: весь твой урон ниже на 12%; победу нужно довести долгим звучанием.", { dmg: -0.12 }],
    ["choirmaster", "Голоса вместо слов", "Гибель голоса лечит тебя на 6% здоровья. Цена: весь твой собственный урон ниже на 15%, хор становится главным оружием.", { dmg: -0.15 }]
  ].forEach(([id, name, description, mods]) => {
    // The legacy joker checks for an empty card in turnStart, after the
    // mechanic has already drawn one. Preserve the card at consumption instead.
    const rememberCard = (b, s) => { s.card = b.mech?.trickster?.card; };
    const on = id === "trickster" ? {
      start: rememberCard, turnStart: rememberCard,
      afterAction(b, s, c) {
        if (c.type !== "skill" || c.skill?.special === "redraw" || !s.card || getUltState(b).hand?.length) return;
        if (b.mech?.trickster && !b.mech.trickster.card && roll(0.15)) b.mech.trickster.card = s.card;
      }
    } : TALENTS[`${id}/3`].on;
    pathKeys[id] = add(4, "key", name, description, { mods, on });
  });
  const longRecovery = add(4, "key", "Дать ранам время", "Регенерация длится на 2 хода дольше. Цена: весь твой урон ниже на 20%; здоровье возвращается, пока враг ещё стоит.",
    { mods: { "dur:regeneration": 2, dmg: -0.2 } });
  const measuredBreath = add(4, "key", "Пауза перед фразой", "Навык сразу после «Настроиться» быстрее на 25%. Без этой подготовки навыки медленнее на 15%. Любое другое действие рвёт подготовку.",
    { on: { afterAction(b, s, c) {
      if (c.type === "skill") c.tempo = Math.max(0.55, c.tempo * (s.ready ? 0.75 : 1.15));
      s.ready = c.type === "wait";
    } } });

  const sub = n => ({ stage: "subclass", map: { lyre: `lyre/${n}`, hymn: `hymn/${n}` } });
  const prof = n => ({ stage: "profession", map: Object.fromEntries(["skald", "trickster", "cantor", "choirmaster"].map(id => [id, `${id}/${n}`])) });
  const slots = (ids, modules = {}) => ids.map((talent, i) => ({
    key: ["a1", "a2", "a3", "a4", "b1", "b2", "c1", "c2", "c3", "d1", "d2"][i],
    tier: i < 4 ? 1 : i < 6 ? 2 : i < 9 ? 3 : 4,
    talent,
    ...(i < 4 ? {} : { afterAny: [null, null, null, null, ["a1", "a2"], ["a3", "a4"], ["b1"], ["b2"], ["b1"], ["c1", "c2"], ["c2", "c3"]][i] }),
    ...(modules[i] ? { module: modules[i] } : {})
  }));
  defineTalentBoard("bard", [
    { id: "c-bard", name: "Искусство", description: "Ноты, послезвучие и удачный выход. Шесть мест заменяются модулями пути; соло ценой лечения остаётся доступно любой профессии.",
      slots: slots(["c-bard/1", "c-bard/2", "crit/3", "evasion/2", "c-bard/3", "c-bard/4", "c-bard/6", "crit/7", "control/8", "crit/9", "c-bard/7"],
        { 4: sub(1), 5: sub(2), 6: sub(3), 7: prof(1), 8: prof(2), 9: { stage: "profession", map: pathKeys } }) },
    { id: "life", name: "Живучесть", description: "Пережить спад, вернуть дыхание регенерацией и обратить избыток в удар. Усиль лечение ценой здоровья либо продли восстановление ценой урона.",
      slots: slots(["life/1", "life/2", "life/3", "evasion/3", "life/4", "life/6", "life/7", "life/8", "hex/8", "life/9", longRecovery]) },
    { id: "hex", name: "Порча", description: "Слабость, метка и замедление готовят порчу. Долгие проклятия делают тебя уязвимее; власть над оглушением стоит урона.",
      slots: slots(["hex/1", "hex/2", "hex/3", "control/3", "hex/4", "hex/5", "hex/7", "hex/10", "control/10", "hex/9", "control/9"]) },
    { id: "guard", name: "Оборона", description: "Стойка, щит и лечение сверх полного здоровья поддерживают друг друга. Держи крепость ценой урона либо уходи от ударов ценой запаса здоровья.",
      slots: slots(["guard/1", "guard/2", "guard/3", "control/2", "guard/4", "guard/6", "guard/7", "guard/8", "guard/10", "guard/9", "evasion/9"]) },
    { id: "tempo", name: "Темп", description: "Быстрые фразы, уклонения и передышки. Ускоряй весь бой ценой защиты либо готовь быстрый навык через паузу и дыхание.",
      slots: slots(["tempo/1", "tempo/2", "tempo/3", "evasion/1", "tempo/4", "tempo/5", "tempo/7", "tempo/8", "evasion/7", "tempo/9", measuredBreath]) }
  ]);
})();
