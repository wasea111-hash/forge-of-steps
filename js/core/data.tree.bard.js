// A bard writes the next note with a chosen action. All helpers stay private.
(() => {
  const notes = b => coreState(b)?.notes || [];
  const count = (b, note) => notes(b).filter(n => n === note).length;
  const rhythm = b => b.mech.lyre?.value || 0;
  const choir = b => (b.hero.summonedUnits || []).filter(u => u.role === "voice");
  const stored = b => b.mech.cantor?.value || 0;
  const card = b => b.mech.trickster?.card;
  const verses = b => b.mech.skald?.verses || [];
  const hit = (b, power, label, flat = 0) => {
    if (b.enemy.currentHp > 0) performHeroHit(b, {
      kind: "magic", power, flat, label, element: "air", sure: true, noEcho: true, proc: true
    });
  };
  const shield = (b, ratio) => {
    const e = fx(b, "shield", 3, b.hero.maxHp * ratio, { self: true });
    if (e) e.value = Math.min(b.hero.maxHp * 0.6, e.value);
  };
  // Damage hooks run before core_bard appends its note. Action hooks run after
  // the motif and path mechanics have paid out. Never replay afterAction.
  const onHit = (id, run) => ({ beforeHit(b, s, c) {
    if (c.skill?.id === id) run(b, s, c);
  } });
  const onAction = (id, run) => ({ afterAction(b, s, c) {
    if (c.skill?.id === id) run(b, s, c);
  } });
  const voice = () => ({
    type: "spirit", role: "voice", name: "Голос хора", duration: 5,
    hpFormula: { sourceStat: "shieldPower", multiplier: 0.5, minValue: 12 },
    actionPowerFormula: { sourceStat: "healingPower", multiplier: 0.26, minValue: 7 }
  });
  const recruit = b => {
    if ((b.hero.summonedUnits || []).length >= getSummonLimit(b.hero)) return;
    addSummon(b, makeSummon(SKILL_CATALOG["bard-echo-choir"], b.hero));
    emit(b, "summon", { kind: "spirit" });
  };
  const pulse = b => {
    const active = b.mech.hymn?.active;
    if (active === "endurance") procHeal(b, 0.06, "Отзвук гимна");
    if (active === "clarity") procMana(b, 0.12);
    if (active === "might") fx(b, "rage", 2, 0.25, { self: true });
  };
  // On a repeated verse, move its existing slot to a missing verse first.
  // The native skald hook then appends skill.verse exactly once. Its chorus,
  // talents and the ongoing-saga ultimate all receive the ordinary action.
  SKILL_ACTIONS.bard_saga = {
    run(b, skill) {
      const song = b.mech.skald;
      const missing = ["blade", "wind", "life"].find(v => !verses(b).includes(v));
      if (song && missing && verses(b).includes(skill.verse)) {
        song.verses = verses(b).map(v => v === skill.verse ? missing : v);
        // The ongoing-saga ultimate keeps its own pre-action copy of the song.
        const phase = getUltState(b);
        if (ultPhaseActive(phase) && Array.isArray(phase.verses)) phase.verses = [...song.verses];
      }
      if (skill.attackType) performSkillDamage(b, skill);
      else healUnit(b, b.hero, getSkillSelfHealAmount(skill, b.hero), skill.name);
    }
  };

  // Each call supplies its silhouette and central image. Weight/frame encode
  // the windup, pose.tail encodes recovery, figures stay in one visual family.
  const anim = (range, before, pose, then2, image, extra = {}) => {
    const tint = extra.tint || "#eac778";
    const at = range === "self" ? "self" : "target";
    const { pose: recovery, ...staging } = extra;
    return {
      range, pose: { before, pose, then2, back: -0.05, lunge: range === "melee" ? 0.24 : 0,
        tail: 0.55, ...recovery },
      frame: 7, shot: range === "ranged" ? "note" : "none", tint, weight: "light",
      anticipate: [{ fx: "glow", at: "self", size: 0.35, color: tint }],
      release: [{ fx: image, at, size: 0.8, color: tint }],
      impact: [{ fx: image, at, size: 0.4, delay: 0.08, color: tint }],
      reaction: "stagger", ...staging
    };
  };
  const add = (id, name, description, spec, animation) => defineTreeSkill("bard", {
    id: `bard-${id}`, name, description, attackType: "skill", element: "air",
    targetType: "enemy", powerMultiplier: 1.5, resourceCost: 12, appliedEffects: [],
    ...spec, anim: animation
  });

  // CLASS — march, mixed score, and sustained dissonance.
  add("pluck", "Щипок струны", "Ты бьёшь звуком с силой 1,6 за 6 дыхания. Нота ♫ ведёт к маршу из 3 ударов. Дёшево против одной цели, толпу не задевает.",
    { powerMultiplier: 1.6, resourceCost: 6 },
    anim("ranged", "idle", "cast", "idle", "notes", { frame: 4 }));
  add("resonating-chord", "Резонирующий аккорд", "Удар 1,45 и лечение 0,65 за 20 дыхания, регенерация 25% лечения на 2 хода. Ты играешь ♫, а не ♪. Без ран часть цены пропадает.",
    { element: "holy", resourceCost: 20, powerMultiplier: 1.45, selfHealMultiplier: 0.65,
      appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.25, 5))] },
    anim("ranged", "guard", "cast", "proud", "ring", { tint: "#ffe6a0" }));
  add("false-note", "Фальшивая нота", "Звук 1,25 замедляет цель на 20% на 2 хода. Ты играешь ☾ для реквиема или аккорда. Урона меньше, чем у чистого ♫.",
    { powerMultiplier: 1.25, resourceCost: 8, appliedEffects: [eff("slow", 2, { value: 0.2 })] },
    anim("ranged", "proud", "thrust", "guard", "whirl", { tint: "#bca1eb" }));

  add("wide-strum", "Широкий перебор", "Ты играешь ♫. Удар 1,3, остальные враги получают 65% силы. Откат 2. Марш добирает толпу, но один враг лучше терпит этот перебор.",
    { powerMultiplier: 1.3, aoe: 0.65, cooldown: 2 },
    anim("ranged", "windup", "strike", "cast", "wave", { shot: "none", weight: "mid", reaction: "knockback" }));
  add("split-strings", "Струны вразнобой", "Два звука по 0,8 пробивают 15% защиты и ставят метку 10% на 2 хода. Ты играешь ☾ для аккорда. Откат 2. Хорошо против брони, хуже против толпы.",
    { powerMultiplier: 0.8, hits: 2, pierce: 0.15, cooldown: 2, resourceCost: 10,
      appliedEffects: [eff("mark", 2, { value: 0.1 })] },
    anim("ranged", "cast", "thrust", "strike", "fan", { volley: 2 }));
  add("mute-string", "Зажать звук", "Ты играешь ☾. Удар 1,4 и немота на 2 хода, откат 3. Прерывай вражеские навыки, но против обычных ударов немота бесполезна.",
    { powerMultiplier: 1.4, cooldown: 3, appliedEffects: [eff("silence", 2, { value: 1 })] },
    anim("ranged", "guard", "thrust", "hit", "ring", { shot: "none", tint: "#a78ec8" }));

  add("soundboard", "Удар декой", "Ты бьёшь декой лютни на 1,6. За каждую уже сыгранную ♫ сила +15%. Откат 2. До начала марша акцент слабее.",
    { powerMultiplier: 1.6, cooldown: 2, on: onHit("bard-soundboard", (b, s, c) => { c.mult *= 1 + count(b, "blade") * 0.15; }) },
    anim("melee", "guard", "strike", "guard", "burst", { move: "charge", weight: "mid", reaction: "knockback" }));
  add("soothing-verse", "Тёплый куплет", "Ты играешь ♪. Лечение 1,5, регенерация 32% лечения и щит 12% здоровья на 3 хода. Откат 4. Готовит гимн или аккорд, но не ранит.",
    { attackType: null, targetType: "self", element: "holy", selfHealMultiplier: 1.5, cooldown: 4, resourceCost: 16,
      appliedEffects: [selfEff("regeneration", 3, dot("healingPower", 0.32, 7))],
      on: onAction("bard-soothing-verse", b => shield(b, 0.12)),
      ai: b => hpRatio(b.hero) < 0.72 || count(b, "life") === 2 },
    anim("self", "guard", "proud", "cast", "glow", { tint: "#f7eab5", frame: 9 }));
  add("creaking-pegs", "Скрип колков", "Удар 1,35 и слабость 25% на 2 хода. Ты играешь ☾ и сдерживаешь сильный ответ. Откат 2. Против почти павшей цели лучше чистый урон.",
    { powerMultiplier: 1.35, cooldown: 2, appliedEffects: [eff("weaken", 2, { value: 0.25 })] },
    anim("ranged", "hit", "cast", "guard", "notes", { shot: "none", tint: "#baa0c9" }));

  add("breath-beat", "Вдох в такт", "Ты играешь ♪, возвращаешь 18% дыхания и ставишь щит 15% здоровья на 3 хода. Откат 4. Полезно перед аккордом, при полных запасах теряет смысл.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 4, tempo: 0.8,
      on: onAction("bard-breath-beat", b => { procMana(b, 0.18); shield(b, 0.15); }),
      ai: b => b.hero.currentMana < b.hero.maxMana * 0.65 || hpRatio(b.hero) < 0.65 },
    anim("self", "idle", "guard", "proud", "ring", { frame: 5, tint: "#b9dfd8" }));
  add("answer-phrase", "Ответная фраза", "Удар 1,65, +35% силы, если последняя нота ♪ или ☾. Ты играешь ♫. Откат 2. После удара бонуса нет, поэтому меняй фразу.",
    { powerMultiplier: 1.65, cooldown: 2,
      on: onHit("bard-answer-phrase", (b, s, c) => { if (["life", "shade"].includes(notes(b).slice(-1)[0])) c.mult *= 1.35; }) },
    anim("melee", "cast", "strike", "proud", "notes", { move: "leap", reaction: "launch" }));
  add("black-overtone", "Чёрный обертон", "Удар 1,2 и порча по 25% магического урона на 4 хода. Ты играешь ☾. Откат 3. Долгая цель окупит песню, добивание — нет.",
    { powerMultiplier: 1.2, cooldown: 3, appliedEffects: [eff("corruption", 4, dot("skillDamage", 0.25, 4))] },
    anim("ranged", "windup", "cast", "hit", "whirl", { shot: "orb", frame: 10, tint: "#977ab8", weight: "mid" }));

  add("body-roll", "Дробь по корпусу", "Три удара лютней по 0,6, одна нота ♫. После двух ♫ каждый удар пробивает ещё 35% защиты. Откат 3. Начинать мотив дробью невыгодно.",
    { powerMultiplier: 0.6, hits: 3, cooldown: 3, resourceCost: 16,
      on: onHit("bard-body-roll", (b, s, c) => { if (count(b, "blade") === 2) c.pierce += 0.35; }) },
    anim("melee", "windup", "slam", "strike", "ring", { move: "dash", frame: 8, weight: "mid" }));
  add("melody-catch", "Подхват мелодии", "Ты играешь ♪, лечишься с силой 0,9 и отвечаешь звуком 1,1. Откат 3, цена 20 дыхания. Меняет ноту без потери всего удара, но дорог.",
    { attackType: null, targetType: "self", selfHealMultiplier: 0.9, cooldown: 3, resourceCost: 20,
      on: onAction("bard-melody-catch", b => hit(b, 1.1, "Подхват мелодии")),
      ai: b => hpRatio(b.hero) < 0.85 || (notes(b).includes("blade") && !notes(b).includes("life")) },
    anim("ranged", "air", "cast", "guard", "wave", { hop: "leap", shot: "none", tint: "#e6ddac" }));
  add("broken-meter", "Сорванный размер", "Ты играешь ☾. Звук 1,45 задевает остальных на 50% и ошеломляет на 25% на 2 хода. Откат 3. Цена охвата — слабое добивание одной цели.",
    { powerMultiplier: 1.45, aoe: 0.5, cooldown: 3, resourceCost: 18,
      appliedEffects: [eff("stagger", 2, { value: 0.25 })] },
    anim("ranged", "proud", "slam", "hit", "wave", { shot: "none", frame: 11, weight: "mid", tint: "#bc91b0" }));

  add("last-string", "Последняя струна", "Удар 2,2, остальные получают 50%. После двух ♫ сила +30%, затем звучит марш. Ты играешь ♫. Откат 5, цена 26. Ранний акцент слабее.",
    { powerMultiplier: 2.2, aoe: 0.5, cooldown: 5, resourceCost: 26,
      on: onHit("bard-last-string", (b, s, c) => { if (count(b, "blade") === 2) c.mult *= 1.3; }) },
    anim("ranged", "windup", "slam", "proud", "notes", { shot: "none", frame: 14, weight: "heavy", reaction: "slam", pose: { back: -0.2, hold: 0.12, tail: 0.8 } }));
  add("triple-consonance", "Тройное созвучие", "Удар 2,0. Если уже звучат ♪ и ☾, сила +40% и завершается аккорд. Ты играешь ♫. Откат 4, цена 24. Без подготовки бонуса нет.",
    { powerMultiplier: 2, cooldown: 4, resourceCost: 24,
      on: onHit("bard-triple-consonance", (b, s, c) => { if (count(b, "life") === 1 && count(b, "shade") === 1) c.mult *= 1.4; }) },
    anim("ranged", "guard", "proud", "slam", "fan", { volley: 3, frame: 12, weight: "heavy", tint: "#f0dfa4", reaction: "launch" }));
  add("hall-silence", "Тишина в зале", "Ты играешь ☾. Удар 2,1 и немота на 2 хода. После двух ☾ пробивает 60% защиты и завершает реквием. Откат 4, цена 24. Без порч слабее.",
    { powerMultiplier: 2.1, cooldown: 4, resourceCost: 24, appliedEffects: [eff("silence", 2, { value: 1 })],
      on: onHit("bard-hall-silence", (b, s, c) => { if (count(b, "shade") === 2) c.pierce += 0.6; }) },
    anim("ranged", "cast", "guard", "proud", "void", { shot: "none", frame: 13, weight: "heavy", tint: "#9c88b7", reaction: "pull" }));

  // LYRE — alternate cheap builders or spend the established rhythm.
  add("sharp-verse", "Острый куплет", "Удар 1,5 за 8 дыхания, откат 1. Новый навык даёт 1 ритм, повтор сбрасывает его. Ты играешь ♫. Чередуй приёмы, чтобы держать +5% за ритм.",
    { powerMultiplier: 1.5, resourceCost: 8, cooldown: 1,
      ai: b => b.mech.lyre?.last !== "bard-sharp-verse" && (rhythm(b) < 2 || b.hero.currentMana < b.hero.maxMana * 0.4) },
    anim("ranged", "windup", "thrust", "cast", "notes", { frame: 5 }));
  add("quick-trill", "Беглая трель", "Два звука по 0,8. Каждый ритм даёт 10% пробивания. Ты играешь ♫, новый навык добавляет ритм. Откат 2. Без ритма броня гасит трель.",
    { powerMultiplier: 0.8, hits: 2, cooldown: 2,
      on: onHit("bard-quick-trill", (b, s, c) => { c.pierce += rhythm(b) * 0.1; }) },
    anim("ranged", "thrust", "cast", "strike", "fan", { volley: 2, hop: "blink" }));
  add("bass-transition", "Переход на бас", "Удар 1,55 и ☾ со слабостью 15% на 2 хода. Смена навыка даёт ещё 1 ритм, до 4. Откат 2. Повтор сбрасывает ритм как обычно.",
    { powerMultiplier: 1.55, cooldown: 2, appliedEffects: [eff("weaken", 2, { value: 0.15 })],
      on: { ...onHit("bard-bass-transition", (b, s) => { s.changed = b.mech.lyre?.last !== "bard-bass-transition"; }),
        ...onAction("bard-bass-transition", (b, s) => { if (s.changed && b.mech.lyre) addGauge(b.mech.lyre, 1, 4); }) } },
    anim("melee", "proud", "slam", "guard", "wave", { move: "walk", weight: "mid", tint: "#b9a1ce" }));
  add("drop-tempo", "Сбросить темп", "Удар 1,7, +15% силы за ритм до удара. Ты играешь ♫ и сбрасываешь весь ритм после акцента. Откат 3. С пустой шкалой теряешь выгоду.",
    { powerMultiplier: 1.7, cooldown: 3, resourceCost: 16,
      on: { ...onHit("bard-drop-tempo", (b, s, c) => { c.mult *= 1 + rhythm(b) * 0.15; }),
        ...onAction("bard-drop-tempo", b => { if (b.mech.lyre) b.mech.lyre.value = 0; }) },
      ai: b => rhythm(b) >= 2 },
    anim("melee", "air", "slam", "proud", "burst", { move: "leap", frame: 11, weight: "heavy", reaction: "slam" }));
  add("lyre-cadenza", "Каденция лиры", "Удар 1,9, остальные получают 55% силы. Ты играешь ♫ и сохраняешь ритм, если меняешь навык. Откат 3. По одной цели расход ритма сильнее.",
    { powerMultiplier: 1.9, aoe: 0.55, cooldown: 3, resourceCost: 20 },
    anim("ranged", "air", "proud", "cast", "notes", { hop: "leap", frame: 10, weight: "mid" }));
  add("rhythm-breath", "Взять дыхание", "Ты играешь ♪. Лечение 1,3 и возврат 6% дыхания за ритм после смены навыка, затем ритм обнуляется. Откат 4. При полных запасах лучше атака.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.3, resourceCost: 0, cooldown: 4,
      on: onAction("bard-rhythm-breath", b => { procMana(b, rhythm(b) * 0.06); if (b.mech.lyre) b.mech.lyre.value = 0; }),
      ai: b => rhythm(b) >= 2 && (hpRatio(b.hero) < 0.75 || b.hero.currentMana < b.hero.maxMana * 0.6) },
    anim("self", "hit", "proud", "idle", "whirl", { tint: "#bde2cf", frame: 9 }));

  // HYMN — change the permanent background through an action with immediate value.
  add("gentle-hymn", "Гимн стойкости", "Ты играешь ♪. Лечение 0,7, регенерация 20% на 2 хода, щит 12% здоровья на 3. Гимн лечит 3% каждый ход. Откат 3. При полных запасах мощь полезнее.",
    { attackType: null, targetType: "self", element: "holy", hymn: "endurance", selfHealMultiplier: 0.7, cooldown: 3,
      appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.2, 4))],
      on: onAction("bard-gentle-hymn", (b, s, c) => { if (c.skill.hymn) shield(b, 0.12); }),
      ai: b => hpRatio(b.hero) < 0.7 },
    anim("self", "windup", "proud", "guard", "ring", { frame: 10, tint: "#f1ddb0" }));
  add("might-hymn", "Гимн мощи", "Ты играешь ♫ ударом 1,7 и включаешь гимн мощи, усиливающий урон на 15%. Откат 3. Мощь заменит лечение или возврат дыхания другого гимна.",
    { powerMultiplier: 1.7, hymn: "might", cooldown: 3 },
    anim("melee", "windup", "strike", "proud", "ring", { move: "charge", weight: "mid" }));
  add("clarity-hymn", "Гимн ясности", "Удар 1,6 играет ♫ и включает ясность, возвращающую 6% дыхания каждый ход. Откат 3. Ты меняешь прежний гимн, жертвуя его усилением.",
    { powerMultiplier: 1.6, hymn: "clarity", cooldown: 3, resourceCost: 6 },
    anim("ranged", "idle", "proud", "thrust", "wave", { shot: "none", tint: "#a3d3df" }));
  add("faithful-tune", "Верность напеву", "Удар 1,7 играет ♫ и включает стойкость. Если она уже звучит, сила +30% и лечение 6% здоровья. Откат 2. Первый удар меняет гимн без бонуса.",
    { powerMultiplier: 1.7, cooldown: 2, hymn: "endurance",
      on: { ...onHit("bard-faithful-tune", (b, s, c) => { s.ready = b.mech.hymn?.active === "endurance"; if (s.ready) c.mult *= 1.3; }),
        ...onAction("bard-faithful-tune", (b, s) => { if (s.ready) procHeal(b, 0.06, "Верность напеву"); }) } },
    anim("ranged", "guard", "cast", "strike", "sigil", { tint: "#e8d7ab" }));
  add("hymn-echo", "Отзвук гимна", "Ты играешь ♫ ударом 1,9. Стойкость сразу лечит 6% здоровья, ясность даёт 12% дыхания, мощь — ярость 25% на 2 хода. Откат 3. Без гимна выплаты нет.",
    { powerMultiplier: 1.9, cooldown: 3, resourceCost: 18, on: onAction("bard-hymn-echo", pulse) },
    anim("ranged", "proud", "cast", "slam", "ring", { shot: "orb", frame: 11, weight: "mid" }));
  add("retune-hymn", "Перепеть гимн", "Ты играешь ♪ и лечишься с силой 1,5. Мощь сменяется ясностью, любой другой гимн — мощью. Откат 3. Переключение сразу даёт выплату нового гимна.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.5, resourceCost: 14, cooldown: 3,
      on: onAction("bard-retune-hymn", b => { if (b.mech.hymn) b.mech.hymn.active = b.mech.hymn.active === "might" ? "clarity" : "might"; pulse(b); }),
      ai: b => hpRatio(b.hero) < 0.8 || (b.mech.hymn?.active === "might" && b.hero.currentMana < b.hero.maxMana * 0.6) },
    anim("self", "cast", "proud", "thrust", "notes", { frame: 9, tint: "#c8dfb5" }));

  // SKALD — both lanes can reach all three verses without a mandatory sibling.
  add("war-hymn", "Куплет ветра", "Ты играешь ♪, добавляешь ветер в сагу и получаешь ярость и ускорение 20% на 3 хода. Откат 5, темп 0,7. Урона сейчас нет, повтор не двигает сагу.",
    { attackType: null, targetType: "self", verse: "wind", resourceCost: 14, cooldown: 5, tempo: 0.7,
      appliedEffects: [selfEff("rage", 3, { value: 0.2 }), selfEff("haste", 3, { value: 0.2 })],
      ai: b => !verses(b).includes("wind") && !unitHasEffect(b.hero, "haste") },
    anim("self", "windup", "proud", "strike", "wave", { frame: 11, weight: "mid" }));
  add("thunder-note", "Громовой куплет", "Два звука по 0,95 играют ♫ и добавляют гром в сагу. Ты возвращаешь 8% дыхания. Откат 3. Повтор грома не приближает припев из трёх куплетов.",
    { powerMultiplier: 0.95, hits: 2, verse: "blade", cooldown: 3, resourceCost: 18,
      on: onAction("bard-thunder-note", b => procMana(b, 0.08)) },
    anim("ranged", "windup", "slam", "thrust", "notes", { volley: 2, frame: 10, weight: "mid", tint: "#ddc27f" }));
  add("saga-life", "Куплет жизни", "Ты играешь ♪ и лечишься с силой 1,6. Добавляет жизнь в сагу, повтор добавляет недостающий куплет. Откат 3. При полном здоровье часть хода пропадает.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.6, cooldown: 3, resourceCost: 16,
      special: "bard_saga", verse: "life", ai: b => hpRatio(b.hero) < 0.85 || verses(b).length === 2 },
    anim("self", "guard", "cast", "idle", "sigil", { tint: "#dfebae", frame: 8 }));
  add("saga-second", "Второй голос саги", "Удар 1,65 играет ♫ и добавляет гром в сагу, повтор добавляет недостающий куплет. Откат 2. Слабее громового куплета, зато собирает все три части.",
    { powerMultiplier: 1.65, cooldown: 2, resourceCost: 16, special: "bard_saga", verse: "blade" },
    anim("melee", "cast", "thrust", "proud", "ring", { move: "dash", weight: "mid" }));
  add("saga-defiance", "Припев наперекор", "Удар 2,1 играет ♫, +30% силы при двух куплетах саги до удара. Откат 4, цена 22. Ты сохраняешь куплеты, но сам припев этим ударом не вызываешь.",
    { powerMultiplier: 2.1, cooldown: 4, resourceCost: 22,
      on: onHit("bard-saga-defiance", (b, s, c) => { if (verses(b).length === 2) c.mult *= 1.3; }) },
    anim("melee", "windup", "slam", "proud", "wave", { move: "charge", frame: 13, weight: "heavy", reaction: "knockback" }));
  add("saga-restart", "Спеть сначала", "Удар 1,85 играет ♫ и добавляет ветер в сагу, повтор — недостающий куплет. В пустой саге сила +30%. Откат 3. Начало сильно, но позже бонус исчезает.",
    { powerMultiplier: 1.85, cooldown: 3, resourceCost: 18, special: "bard_saga", verse: "wind",
      on: onHit("bard-saga-restart", (b, s, c) => { if (!verses(b).length) c.mult *= 1.3; }) },
    anim("ranged", "idle", "cast", "slam", "fan", { volley: 3, frame: 9, weight: "mid" }));

  // TRICKSTER — redraw preserves a card, the other actions cash it out normally.
  add("mocking-tune", "Дразнилка", "Ты играешь ☾ ударом 1,1, слабостью 25% и меткой 15% на 2 хода. Текущая карта тратится на этот навык. Откат 3. Для туза прямой удар слабоват.",
    { powerMultiplier: 1.1, element: "dark", cooldown: 3, resourceCost: 14,
      appliedEffects: [eff("weaken", 2, { value: 0.25 }), eff("mark", 2, { value: 0.15 })] },
    anim("ranged", "proud", "cast", "hit", "notes", { hop: "blink", tint: "#c09fe6" }));
  add("swap-card", "Подмена", "Ты играешь ♪ и меняешь карту, сохраняя новую для следующего навыка. Затем звук бьёт на 1,1. Откат 2, темп 0,7. Теряешь силу ради новой карты.",
    { attackType: null, special: "redraw", targetType: "self", cooldown: 2, resourceCost: 6, tempo: 0.7,
      on: onAction("bard-swap-card", b => hit(b, 1.1, "Звук подмены")),
      ai: b => ["coins", "cups", "spades"].includes(card(b)) },
    anim("ranged", "guard", "cast", "air", "afterimages", { hop: "blink", shot: "none", tint: "#dec4ee", frame: 5 }));
  add("ace-accent", "Тузовый акцент", "Удар 1,9 играет ♫ и тратит карту. С тузом ещё +20% силы, с другой картой 25% пробивания. Откат 3. Ты выбираешь взрыв или полезное свойство карты.",
    { powerMultiplier: 1.9, cooldown: 3, resourceCost: 18,
      on: onHit("bard-ace-accent", (b, s, c) => { if (card(b) === "ace") c.mult *= 1.2; else c.pierce += 0.25; }) },
    anim("melee", "air", "thrust", "cast", "sigil", { move: "blink", tint: "#e5bbd4", frame: 10, weight: "mid" }));
  add("lucky-cups", "Кубки на удачу", "Ты играешь ♪, лечишься с силой 1,5 и получаешь свойство карты. Откат 3, цена 10. Туз уходит без усиленного удара, кубки дают ещё 15% здоровья.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.5, cooldown: 3, resourceCost: 10,
      ai: b => hpRatio(b.hero) < 0.75 && card(b) !== "ace" },
    anim("self", "air", "proud", "guard", "glow", { hop: "leap", tint: "#dab9e8", frame: 6 }));
  add("crowd-laughter", "Смех по рядам", "Ты играешь ☾. Удар 1,6, остальным 60%, метка 20% на 3 хода. Карта тратится на весь приём. Откат 4. Один враг получает меньше, чем от акцента.",
    { powerMultiplier: 1.6, aoe: 0.6, cooldown: 4, resourceCost: 20,
      appliedEffects: [eff("mark", 3, { value: 0.2 })] },
    anim("ranged", "air", "cast", "proud", "whirl", { shot: "none", frame: 12, weight: "mid", tint: "#c799d2", reaction: "pull" }));
  add("coin-trick", "Фокус с монетой", "Удар 1,75 играет ♫ и тратит карту. Если карта не туз, ты возвращаешь ещё 15% дыхания. Откат 3. С тузом сильный удар выгоднее этого фокуса.",
    { powerMultiplier: 1.75, cooldown: 3, resourceCost: 10,
      on: { ...onHit("bard-coin-trick", (b, s) => { s.refund = Boolean(card(b)) && card(b) !== "ace"; }),
        ...onAction("bard-coin-trick", (b, s) => { if (s.refund) procMana(b, 0.15); }) } },
    anim("ranged", "thrust", "strike", "guard", "ring", { shot: "orb", frame: 6, tint: "#e8cf9d" }));

  // CANTOR — every route has healing, neither spender requires a hidden pick.
  add("dirge", "Погребальная песнь", "Удар 1,1, слабость 30% на 3 хода и лечение 0,9. Ты играешь ☾. Лечение сверх здоровья копит избыток. Откат 3. Давление ниже, зато легче накопить запас.",
    { powerMultiplier: 1.1, element: "dark", selfHealMultiplier: 0.9, cooldown: 3, resourceCost: 14,
      appliedEffects: [eff("weaken", 3, { value: 0.3 })] },
    anim("ranged", "hit", "proud", "cast", "whirl", { shot: "none", frame: 10, tint: "#ab99bb" }));
  add("full-cup", "Полная чаша", "Удар 1,5 играет ♫ и лечит с силой 1,3. Ты копишь избыток от лечения сверх здоровья, до 60% здоровья. Откат 3. При тяжёлых ранах запаса не будет.",
    { powerMultiplier: 1.5, selfHealMultiplier: 1.3, cooldown: 3, resourceCost: 18 },
    anim("melee", "guard", "thrust", "cast", "glow", { move: "walk", tint: "#eee2bd" }));
  add("pour-cup", "Перелить чашу", "Ты играешь ♫ ударом 1,65 плюс половина избытка. Расходуется половина запаса после удара. Откат 3. Малый запас даёт мало урона, но половина остаётся.",
    { powerMultiplier: 1.65, cooldown: 3, resourceCost: 14,
      on: { ...onHit("bard-pour-cup", (b, s, c) => { s.spend = stored(b) * 0.5; c.flat += s.spend; }),
        ...onAction("bard-pour-cup", (b, s) => { if (b.mech.cantor) b.mech.cantor.value = Math.max(0, stored(b) - (s.spend || 0)); }) } },
    anim("ranged", "guard", "slam", "cast", "wave", { shot: "none", frame: 9, weight: "mid", tint: "#dfd2ab" }));
  add("reserve-psalm", "Псалом запаса", "Ты играешь ♪, лечишься с силой 1,8 и ставишь щит 15% здоровья на 3 хода. Избыток копится. Откат 4. Готовит хорал, но сейчас враг не получает урона.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.8, cooldown: 4, resourceCost: 18,
      on: onAction("bard-reserve-psalm", b => shield(b, 0.15)),
      ai: b => hpRatio(b.hero) < 0.75 || stored(b) < b.hero.maxHp * 0.2 },
    anim("self", "hit", "cast", "proud", "ring", { frame: 10, weight: "mid", tint: "#f2e4bb" }));
  add("chorale", "Хорал", "Ты играешь ♫. Весь избыток уходит в удар 0,7 плюс 120% запаса и щит 50% запаса на 2 хода. Откат 3. Без избытка хорал недоступен.",
    { special: "chorale", element: "holy", powerMultiplier: 0.7, cooldown: 3, resourceCost: 14 },
    anim("ranged", "windup", "proud", "thrust", "pillar", { shot: "none", frame: 14, weight: "heavy", tint: "#f6e7ba", reaction: "launch" }));
  add("unsung-note", "Неотпетая нота", "Удар 1,8 и порча 20% магического урона на 4 хода играют ☾. Пробивание равно доле избытка от здоровья, до 60%. Откат 3. Запас остаётся, но нужен заранее.",
    { powerMultiplier: 1.8, cooldown: 3, resourceCost: 18, appliedEffects: [eff("corruption", 4, dot("skillDamage", 0.2, 4))],
      on: onHit("bard-unsung-note", (b, s, c) => { c.pierce += Math.min(0.6, stored(b) / b.hero.maxHp); }) },
    anim("ranged", "cast", "thrust", "proud", "whirl", { shot: "note", frame: 11, tint: "#b0a0c3", weight: "mid" }));

  // CHOIRMASTER — recruitment is available on either side of the first choice.
  add("echo-choir", "Голос хора", "Ты играешь ♪ и зовёшь голос на 5 ходов. Каждый ход он лечит на 26% силы лечения и бьёт на 60% этого. От 3 голосов сила ×1,5. Откат 1. Нужен долгий бой.",
    { attackType: null, targetType: "self", element: "holy", summonUnitConfig: voice(), cooldown: 1, resourceCost: 14,
      ai: b => (b.hero.summonedUnits || []).length < getSummonLimit(b.hero) },
    anim("self", "idle", "cast", "proud", "sigil", { frame: 9, tint: "#dbdfb8" }));
  add("solo-entry", "Вступление солиста", "Ты играешь ♫ ударом 1,2 и зовёшь голос на 5 ходов, если есть место. Три голоса включают аккорд ×1,5. Откат 2. При полном хоре удар слабоват.",
    { powerMultiplier: 1.2, cooldown: 2, resourceCost: 18, on: onAction("bard-solo-entry", recruit),
      ai: b => choir(b).length < 3 && (b.hero.summonedUnits || []).length < getSummonLimit(b.hero) },
    anim("ranged", "cast", "proud", "strike", "sigil", { frame: 8, tint: "#d9d5ae" }));
  add("hold-note", "Держать ноту", "Ты играешь ♫ ударом 1,5. Голоса живут на 1 ход дольше, максимум 6. Если их меньше 3, зовёшь ещё один. Откат 3. С пустым хором продлевать нечего.",
    { powerMultiplier: 1.5, cooldown: 3, resourceCost: 18,
      on: onAction("bard-hold-note", b => {
        choir(b).forEach(u => { u.duration = Math.min(6, u.duration + 1); });
        if (choir(b).length < 3) recruit(b);
      }), ai: b => (choir(b).length < 3 && (b.hero.summonedUnits || []).length < getSummonLimit(b.hero)) || choir(b).some(u => u.duration <= 2) },
    anim("ranged", "guard", "proud", "cast", "notes", { shot: "none", frame: 10, tint: "#d8e6c7" }));
  add("dismiss-soloist", "Снять солиста", "Ты играешь ♫ ударом 1,8 плюс 250% силы самого старого голоса, затем он исчезает. Откат 3. Хорошо перед его уходом, плохо при сборе тройного аккорда.",
    { powerMultiplier: 1.8, cooldown: 3, resourceCost: 14,
      on: { ...onHit("bard-dismiss-soloist", (b, s, c) => { s.voice = choir(b)[0]; c.flat += (s.voice?.power || 0) * 2.5; }),
        ...onAction("bard-dismiss-soloist", (b, s) => { if (s.voice && choir(b).includes(s.voice)) removeSummon(b, s.voice); s.voice = null; }) } },
    anim("melee", "proud", "strike", "cast", "afterimages", { move: "blink", frame: 10, weight: "mid", tint: "#e4d6bb" }));
  add("culmination", "Кульминация", "Ты играешь ♫. Весь хор исчезает. Удар 0,8 плюс 250% суммарной силы голосов, лечение 200% их силы. Откат 3. Без голосов недоступно, аккорд хора теряется.",
    { special: "culmination", powerMultiplier: 0.8, element: "holy", cooldown: 3, resourceCost: 16,
      ai: b => choir(b).length >= 3 + tm(b.hero, "chordAt") || choir(b).some(u => u.duration <= 2) },
    anim("ranged", "windup", "proud", "hit", "notes", { shot: "none", frame: 14, weight: "heavy", tint: "#f4eac7", reaction: "slam", pose: { back: -0.18, hold: 0.1, tail: 0.85 } }));
  add("choir-circle", "Хор по кругу", "Ты играешь ♫ ударом 1,65, остальным 60%. Каждый голос даёт +10% силы, хор остаётся. Откат 3. Без голосов широкая песня уступает одиночному удару.",
    { powerMultiplier: 1.65, aoe: 0.6, cooldown: 3, resourceCost: 22,
      on: onHit("bard-choir-circle", (b, s, c) => { c.mult *= 1 + choir(b).length * 0.1; }),
      ai: b => choir(b).length >= 2 || livingFoes(b).length > 1 },
    anim("ranged", "proud", "strike", "proud", "ring", { shot: "none", frame: 12, weight: "heavy", tint: "#e5deb6", reaction: "knockback" }));

  const tier = (level, options, extra = {}) => ({ level, options: options.map(id => `bard-${id}`), ...extra });
  const path = (owner, stage, rows) => ({ owner, stage, tiers: rows.map(([level, ...ids]) => tier(level, ids)) });
  defineSkillTree("bard", {
    lanes: [
      { name: "Марш декой", description: "Собирай три ♫. Выбирай широкий перебор для толпы или акцент лютней по одной цели." },
      { name: "Живая партитура", description: "Меняй ♫, ♪ и ☾. Лечись вовремя и заканчивай аккорд, возвращающий дыхание." },
      { name: "Кривой строй", description: "Атакуй через ☾. Сдерживай ответы и готовь реквием, прежде чем перейти к добиванию." }
    ],
    stages: [
      { owner: "bard", stage: "class", tiers: [
        tier(1, ["pluck", "resonating-chord", "false-note"]),
        tier(4, ["wide-strum", "split-strings", "mute-string"]),
        tier(8, ["soundboard", "soothing-verse", "creaking-pegs"]),
        tier(12, ["breath-beat", "answer-phrase", "black-overtone"]),
        tier(16, ["body-roll", "melody-catch", "broken-meter"]),
        tier(22, ["last-string", "triple-consonance", "hall-silence"], { needsLane: 2 })
      ] },
      path("lyre", "subclass", [[30, "sharp-verse", "quick-trill"], [38, "bass-transition", "drop-tempo"], [46, "lyre-cadenza", "rhythm-breath"]]),
      path("hymn", "subclass", [[30, "gentle-hymn", "might-hymn"], [38, "clarity-hymn", "faithful-tune"], [46, "hymn-echo", "retune-hymn"]]),
      path("skald", "profession", [[60, "war-hymn", "thunder-note"], [68, "saga-life", "saga-second"], [76, "saga-defiance", "saga-restart"]]),
      path("trickster", "profession", [[60, "mocking-tune", "swap-card"], [68, "ace-accent", "lucky-cups"], [76, "crowd-laughter", "coin-trick"]]),
      path("cantor", "profession", [[60, "dirge", "full-cup"], [68, "pour-cup", "reserve-psalm"], [76, "chorale", "unsung-note"]]),
      path("choirmaster", "profession", [[60, "echo-choir", "solo-entry"], [68, "hold-note", "dismiss-soloist"], [76, "culmination", "choir-circle"]])
    ]
  });
})();

// Corruption comes from darkness: these two songs are dark.
["bard-black-overtone", "bard-unsung-note"].forEach((id) => { SKILL_CATALOG[id].element = "dark"; });
