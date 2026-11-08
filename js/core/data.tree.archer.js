// Space is a resource: hold a firing line, trade steps, or let the hunt close in.
(() => {
  const distance = b => Number(coreState(b)?.value || 0);
  const focus = b => Number(b.mech.marksman?.value || 0);
  const storm = b => Number(b.mech.stormshot?.value || 0);
  const near = b => distance(b) <= 1;
  const far = b => distance(b) >= 2;
  const shield = (b, ratio) => {
    const cap = Math.round(b.hero.maxHp * 0.6);
    const effect = fx(b, "shield", 3,
      Math.min(cap, effectValue(b.hero, "shield") + Math.round(b.hero.maxHp * ratio)), { self: true });
    if (effect) effect.value = Math.min(cap, effect.value);
  };
  const shift = (b, steps) => {
    const state = coreState(b);
    if (!state) return;
    const previous = distance(b);
    state.value = clamp(previous + steps, 0, 3);
    // Real movement shares the native retreat event with styles and talents.
    // It leaves the cooldown of the separate "Отойти" action untouched.
    if (state.value > previous) fireMech(b, "retreated");
  };
  const onHit = (id, run) => ({ beforeHit(b, s, c) {
    if (c.skill?.id === `archer-${id}` && isDirectHit(c)) run(b, s, c);
  } });
  const onAction = (id, run) => ({ afterAction(b, s, c) {
    if (c.skill?.id === `archer-${id}`) run(b, s, c);
  } });
  const strengthen = (id, when, ratio) => onHit(id, (b, s, c) => {
    if (when(b)) c.mult *= ratio;
  });
  const armor = (id, when, amount) => onHit(id, (b, s, c) => {
    if (when(b)) c.pierce += amount;
  });
  const smallTrap = () => ({ name: "Малый силок", element: "earth", power: 0.6, slow: 0.15 });

  // Spend before the first arrow, so its hits can start the next storm cycle.
  SKILL_ACTIONS.archer_unwind = {
    run(b, skill) {
      const saved = spendAll(b, "stormshot");
      performSkillDamage(b, skill, 1 + saved * 0.12);
    }
  };
  SKILL_ACTIONS.archer_trip = {
    run(b, skill) {
      performSkillDamage(b, skill);
      // The ordinary trap handler clears the trap before its hit. Native
      // trap observers and the spare-loop ultimate therefore see it once.
      if (b.enemy.currentHp > 0) MECHANICS.ranger.enemyTurn(b, b.mech.ranger);
    }
  };
  SKILL_ACTIONS.archer_recall = {
    run(b, skill) {
      performSkillDamage(b, skill);
      const wolf = findWolf(b.hero);
      if (!wolf) {
        summonWolf(b);
        emit(b, "summon", { kind: "beast" });
      } else wolf.hp = Math.min(wolf.maxHp, Math.round(wolf.hp + wolf.maxHp * 0.4));
    }
  };

  // Poses, motion and the main figure are specified per shot. Light clips use
  // small trails, heavy clips reserve a late release and a longer recovery.
  const anim = (before, pose, then2, image, extra = {}) => {
    const { pose: recovery, ...staging } = extra;
    const tint = extra.tint || "#dbc596";
    return {
      range: "ranged", shot: "arrow", frame: 6, weight: "light", tint,
      pose: { before, pose, then2, back: -0.04, lunge: -0.1, stretch: 0, tail: 0.4, ...recovery },
      anticipate: [{ fx: "glow", at: "self", size: 0.25, color: tint }],
      release: [{ fx: image, at: "target", size: 0.65, color: tint }],
      impact: [{ fx: image, at: "target", size: 0.35, color: tint, delay: 0.06 }],
      reaction: "stagger", ...staging
    };
  };
  const add = (id, name, description, spec, animation) => defineTreeSkill("archer", {
    id: `archer-${id}`, name, description, attackType: "physical", element: "steel",
    targetType: "enemy", resourceType: "mana", powerMultiplier: 1.5,
    resourceCost: 12, appliedEffects: [], ...spec, anim: animation
  });

  // CLASS — a held line, a shuttle step, and a close hunting ground.
  add("piercing-shot", "Пробивной выстрел", "Стрела 1,7 за 15 выдержки пробивает 25% защиты. От 2 ступеней дистанции ещё +15% пробивания. Держи линию против брони, вблизи бонуса нет.",
    { powerMultiplier: 1.7, resourceCost: 15, pierce: 0.25,
      on: armor("piercing-shot", far, 0.15) },
    anim("thrust", "slam", "idle", "shards", { frame: 7 }));
  add("swift-volley", "Быстрый залп", "Стрела 1,2 за 8 выдержки, темп 0,75, откат 2. После выстрела с дистанции 0–1 отходишь на ступень. На средней и дальней позиции отхода нет.",
    { powerMultiplier: 1.2, resourceCost: 8, extraScaling: { agility: 0.5 }, tempo: 0.75, cooldown: 2,
      on: onAction("swift-volley", b => { if (near(b)) shift(b, 1); }), ai: b => near(b) },
    anim("cast", "slam", "dash", "afterimages", { hop: "leap", frame: 4, pose: { tail: 0.28 } }));
  add("tipped-arrow", "Смазанный наконечник", "Стрела 1,25 и яд по 18% атаки на 3 хода. Вплотную прямой удар сильнее на 25%. Откат 2. Принимай сближение ради урона, но теряешь защиту расстояния.",
    { powerMultiplier: 1.25, resourceCost: 10, cooldown: 2, element: "poison",
      appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.18, 4))],
      on: strengthen("tipped-arrow", b => distance(b) === 0, 1.25) },
    anim("guard", "thrust", "cast", "smoke", { tint: "#8cae62" }));

  add("pin-boot", "Пришпилить сапог", "Стрела 1,4 замедляет на 30% на 3 хода. От 2 ступеней дистанции пробивает ещё 25% защиты. Откат 3. Сдерживай подход, для добивания урон скромен.",
    { powerMultiplier: 1.4, cooldown: 3, appliedEffects: [eff("slow", 3, { value: 0.3 })],
      on: armor("pin-boot", far, 0.25) },
    anim("windup", "thrust", "guard", "spikes", { frame: 8, tint: "#b9b397" }));
  add("pursuit-shot", "Стрела вдогон", "Стрела 1,95. Если есть дистанция, пробивает ещё 40% защиты, после выстрела теряешь ступень даже при промахе. Откат 2. Вплотную продавать нечего.",
    { powerMultiplier: 1.95, cooldown: 2,
      on: { ...armor("pursuit-shot", b => distance(b) > 0, 0.4),
        ...onAction("pursuit-shot", b => shift(b, -1)) } },
    anim("dash", "slam", "thrust", "slash", { frame: 5, reaction: "knockback" }));
  add("slant-fan", "Косой веер", "Стрела 1,25, остальным 65% силы. На дистанции 0–1 прямой урон +20%. Откат 2. Собирай загон для группы, против одной дальней цели веер слаб.",
    { powerMultiplier: 1.25, aoe: 0.65, cooldown: 2, resourceCost: 14,
      on: strengthen("slant-fan", near, 1.2), ai: b => livingFoes(b).length > 1 },
    anim("guard", "strike", "thrust", "fan", { volley: 3, tint: "#d6bd87" }));

  add("long-string", "Длинная тетива", "Долгий натяг 2,3, темп 1,15. От 2 ступеней дистанции сила +20%. Откат 3, цена 20. Пространство окупает замах, вплотную ответ прилетит раньше.",
    { powerMultiplier: 2.3, tempo: 1.15, cooldown: 3, resourceCost: 20,
      on: strengthen("long-string", far, 1.2) },
    anim("windup", "slam", "guard", "burst", { frame: 11, weight: "mid", reaction: "knockback", pose: { back: -0.15, tail: 0.65 } }));
  add("fighting-retreat", "Пятиться с боем", "Стрела 1,35, затем +1 дистанция, до 3. Откат 3, цена 14. Отход работает и со средней позиции. На предельной дальности слабый выстрел не окупит ход.",
    { powerMultiplier: 1.35, cooldown: 3, resourceCost: 14,
      on: onAction("fighting-retreat", b => shift(b, 1)), ai: b => distance(b) < 3 },
    anim("air", "slam", "guard", "smoke", { hop: "leap", frame: 6, tint: "#b5c7b2", pose: { lunge: -0.2 } }));
  add("rough-arrow", "Стрела с заусенцем", "Стрела 1,3 оставляет рану по 20% атаки на 3 хода. Вплотную пробивание +30%. Откат 2. Крит вскрывает рану; на дальней позиции теряешь пробивание.",
    { powerMultiplier: 1.3, cooldown: 2, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.2, 4))],
      on: armor("rough-arrow", b => distance(b) === 0, 0.3) },
    anim("hit", "thrust", "guard", "cross", { tint: "#b66c58", frame: 7 }));

  add("string-catch", "Перехват тетивы", "Стрела 1,45. После выстрела с 1–2 ступеней дистанции получаешь ещё ступень. Откат 3. Укрепляй линию заранее; вплотную уже поздно, на 3 места нет.",
    { powerMultiplier: 1.45, cooldown: 3,
      on: onAction("string-catch", b => { if (distance(b) > 0 && distance(b) < 3) shift(b, 1); }),
      ai: b => distance(b) > 0 && distance(b) < 3 },
    anim("thrust", "cast", "guard", "ring", { frame: 7, tint: "#a8bbbd" }));
  add("shed-quiver", "Сбросить колчан", "Ты отходишь на 2 ступени, возвращаешь 18% выдержки и ставишь щит 15% здоровья на 3 хода. Откат 5, темп 1,1. На полной дальности теряешь часть выгоды.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 5, tempo: 1.1,
      on: onAction("shed-quiver", b => { shift(b, 2); procMana(b, 0.18); shield(b, 0.15); }),
      ai: b => distance(b) <= 1 && (hpRatio(b.hero) < 0.85 || b.hero.currentMana < b.hero.maxMana * 0.65) },
    anim("hit", "guard", "air", "afterimages", { range: "self", shot: "none", hop: "leap", frame: 9,
      release: [{ fx: "smoke", at: "self", size: 0.8 }], impact: [{ fx: "ring", at: "self", size: 0.45 }] }));
  add("bitter-splinter", "Горькая щепа", "Стрела 1,2 и яд по 28% атаки на 4 хода. На дистанции 0–1 прямой урон +30%. Откат 3. В долгом ближнем бою яд окупится, при добивании — нет.",
    { powerMultiplier: 1.2, element: "poison", cooldown: 3, resourceCost: 16,
      appliedEffects: [eff("poison", 4, dot("physicalDamage", 0.28, 5))],
      on: strengthen("bitter-splinter", near, 1.3) },
    anim("windup", "cast", "hit", "smoke", { frame: 10, tint: "#93a359", weight: "mid" }));

  add("break-windup", "Сбить замах", "Стрела 1,6 и немота на 2 хода. От 2 ступеней дистанции пробивание +40%. Откат 3. Срывай опасный навык издали; обычный удар немота не остановит.",
    { powerMultiplier: 1.6, cooldown: 3, resourceCost: 16,
      appliedEffects: [eff("silence", 2, { value: 1 })], on: armor("break-windup", far, 0.4) },
    anim("proud", "thrust", "slam", "ring", { frame: 8, weight: "mid", tint: "#c1c9cf" }));
  add("turn-shot", "Разворот навскидку", "Стрела 1,75. Отход заряжает один разворот с силой +35%; заряд тратится этим навыком даже при промахе. Откат 3. Без отхода акцент слабее.",
    { powerMultiplier: 1.75, cooldown: 3, resourceCost: 16,
      on: { retreated(b, s) { s.ready = true; },
        ...onHit("turn-shot", (b, s, c) => { if (s.ready) c.mult *= 1.35; }),
        ...onAction("turn-shot", (b, s) => { s.ready = false; }) } },
    anim("dash", "strike", "slam", "afterimages", { hop: "leap", frame: 8, weight: "mid", reaction: "knockback" }));
  add("feather-trip", "Подсечь оперением", "Стрела 1,4, остальным 50%. Ошеломляет на 25% на 2 хода. Вплотную прямой урон +25%. Откат 3. Сдерживай близкую группу, дальнего одиночку бьёшь слабее.",
    { powerMultiplier: 1.4, aoe: 0.5, cooldown: 3, resourceCost: 18,
      appliedEffects: [eff("stagger", 2, { value: 0.25 })],
      on: strengthen("feather-trip", b => distance(b) === 0, 1.25) },
    anim("air", "thrust", "strike", "fan", { frame: 9, volley: 2, weight: "mid", reaction: "stagger" }));

  add("string-horizon", "Горизонт тетивы", "Стрела 2,5 пробивает 35% защиты. От 2 ступеней сила +20%. После выстрела теряешь 2 ступени. Откат 5, цена 28. Потрать линию, когда готов принять ответ.",
    { powerMultiplier: 2.5, pierce: 0.35, cooldown: 5, resourceCost: 28, tempo: 1.2,
      on: { ...strengthen("string-horizon", far, 1.2), ...onAction("string-horizon", b => shift(b, -2)) } },
    anim("windup", "slam", "proud", "shards", { frame: 14, weight: "heavy", reaction: "knockback",
      pose: { back: -0.24, hold: 0.12, tail: 0.85 },
      anticipate: [{ fx: "ring", at: "self", size: 0.7, delay: 0.1 }] }));
  add("three-steps", "Три шага назад", "Три стрелы по 0,65, затем +2 дистанции, до 3. Откат 5, цена 24. Вырвись из ближнего боя серией; на полной дальности шаги пропадут.",
    { powerMultiplier: 0.65, hits: 3, cooldown: 5, resourceCost: 24,
      on: onAction("three-steps", b => shift(b, 2)), ai: b => distance(b) <= 1 },
    anim("guard", "slam", "air", "fan", { hop: "leap", volley: 3, frame: 12, weight: "heavy",
      reaction: "knockback", pose: { lunge: -0.3, hold: 0.08, tail: 0.75 } }));
  add("thorn-circle", "Колючее кольцо", "Стрела 1,8, остальным 70%, всем яд по 22% атаки на 3 хода. На дистанции 0–1 прямой урон +30%. Откат 4, цена 24. На дальней позиции часть силы теряется.",
    { powerMultiplier: 1.8, aoe: 0.7, cooldown: 4, resourceCost: 24, element: "poison",
      appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.22, 5))],
      on: strengthen("thorn-circle", near, 1.3) },
    anim("windup", "strike", "guard", "spikes", { frame: 13, weight: "heavy", tint: "#a6b373", volley: 4,
      release: [{ fx: "spikes", at: "allFoes", size: 1.1 }], reaction: "stagger", pose: { back: -0.12, tail: 0.8 } }));

  // MARKSMAN — bank focus or sell small amounts without resetting the whole aim.
  add("aimed-shot", "Прицельный выстрел", "Стрела 1,8, шанс крита +15%, пробивание 30%. От 3 сосредоточения сила +15%, прицел остаётся. Откат 2. Под ранениями усиление легко потерять.",
    { powerMultiplier: 1.8, critBonus: 15, pierce: 0.3, resourceCost: 14, cooldown: 2,
      on: strengthen("aimed-shot", b => focus(b) >= 3, 1.15) },
    anim("thrust", "slam", "guard", "ring", { frame: 8, tint: "#d5d7bd" }));
  add("cut-strap", "Срезать ремень", "Стрела 1,3 надламывает броню на 30% на 3 хода, после выстрела +1 сосредоточение. Откат 3. Готовит прицел, но почти павшую цель выгоднее добить.",
    { powerMultiplier: 1.3, cooldown: 3, appliedEffects: [eff("armor_break", 3, { value: 0.3 })],
      on: onAction("cut-strap", b => bumpGauge(b, "marksman", 1, 5)) },
    anim("guard", "thrust", "strike", "slash", { frame: 6, tint: "#b9b5a1" }));
  add("close-line", "Закрыть линию", "Стрела 1,5. Если есть 2 сосредоточения, после выстрела +1 дистанция, прицел остаётся. Откат 3. Сохранённый прицел покупает отход; с пустой шкалой его нет.",
    { powerMultiplier: 1.5, cooldown: 3, resourceCost: 14,
      on: onAction("close-line", b => { if (focus(b) >= 2) shift(b, 1); }),
      ai: b => focus(b) >= 2 && distance(b) < 3 },
    anim("proud", "slam", "dash", "smoke", { hop: "leap", frame: 8, tint: "#afc6bf" }));
  add("sell-focus", "Продать прицел", "Стрела 1,8 получает +15% силы за единицу сосредоточения, до двух. После выстрела тратишь эти единицы даже при промахе. Откат 3. Остальной прицел сохраняешь.",
    { powerMultiplier: 1.8, cooldown: 3, resourceCost: 16,
      on: { ...onHit("sell-focus", (b, s, c) => { c.mult *= 1 + Math.min(2, focus(b)) * 0.15; }),
        ...onAction("sell-focus", b => bumpGauge(b, "marksman", -2, 5)) }, ai: b => focus(b) >= 2 },
    anim("cast", "thrust", "hit", "shards", { frame: 10, weight: "mid", reaction: "knockback" }));
  add("reset-grip", "Поправить хват", "Стрела 1,3, затем +2 сосредоточения и щит 10% здоровья на 3 хода. Откат 4. Возвращает сбитый прицел; при полной шкале и целом щите выгоднее ударить сильнее.",
    { powerMultiplier: 1.3, cooldown: 4, resourceCost: 16,
      on: onAction("reset-grip", b => { bumpGauge(b, "marksman", 2, 5); shield(b, 0.1); }),
      ai: b => focus(b) <= 3 || !hasFx(b.hero, "shield") },
    anim("hit", "cast", "thrust", "ring", { frame: 8, tint: "#bdcdb7" }));
  add("edge-shots", "Отстрел по краям", "Стрела 1,55, остальным 60%. Каждое сосредоточение даёт +8% силы, прицел остаётся. Откат 3. Подготовленная группа выгодна, одиночный враг — хуже.",
    { powerMultiplier: 1.55, aoe: 0.6, cooldown: 3, resourceCost: 20,
      on: onHit("edge-shots", (b, s, c) => { c.mult *= 1 + focus(b) * 0.08; }) },
    anim("proud", "strike", "thrust", "fan", { volley: 3, frame: 10, weight: "mid" }));

  // WILD — varied afflictions, their remaining time, and the cost of consuming one.
  add("barbed-arrow", "Зазубренная стрела", "Стрела 1,4 и рана по 16% атаки на 3 хода дают чутью ещё одну беду (+7% урона). По замедленной цели пробивание +25%. Откат 2. Без задержки бонуса нет.",
    { powerMultiplier: 1.4, cooldown: 2, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.16, 4))],
      on: armor("barbed-arrow", b => hasFx(b.enemy, "slow"), 0.25) },
    anim("thrust", "slam", "hit", "cross", { tint: "#b57360", frame: 8 }));
  add("cloudy-resin", "Мутная смола", "Стрела 1,2, яд по 20% атаки на 3 хода и слепота 12% на 2. Две разные беды дают чутью +14% урона. Откат 3. Повтор не добавит ещё два вида бед.",
    { powerMultiplier: 1.2, element: "poison", cooldown: 3, resourceCost: 14,
      appliedEffects: [eff("poison", 3, dot("physicalDamage", 0.2, 4)), eff("blind", 2, { value: 12 })] },
    anim("cast", "thrust", "guard", "smoke", { frame: 7, tint: "#9ba174" }));
  add("cut-bindings", "Разрезать путы", "Стрела 1,9, по замедленной цели сила +35%. После выстрела замедление исчезает, чутьё теряет эту беду. Откат 3. Решай, важнее ли урон или задержка.",
    { powerMultiplier: 1.9, cooldown: 3, resourceCost: 18,
      on: { ...strengthen("cut-bindings", b => hasFx(b.enemy, "slow"), 1.35),
        ...onAction("cut-bindings", b => removeFx(b.enemy, "slow")) }, ai: b => hasFx(b.enemy, "slow") },
    anim("windup", "thrust", "hit", "cross", { frame: 10, weight: "mid", reaction: "knockback" }));
  add("read-trail", "Проверить след", "Стрела 1,4 и метка 15% на 3 хода питают чутьё. Каждая уже наложенная беда даёт 10% пробивания, до 40%. Откат 2. На чистой цели пробивания нет.",
    { powerMultiplier: 1.4, cooldown: 2, appliedEffects: [eff("mark", 3, { value: 0.15 })],
      on: onHit("read-trail", (b, s, c) => { c.pierce += Math.min(4, countEnemyDebuffs(b.enemy)) * 0.1; }) },
    anim("idle", "thrust", "proud", "ring", { frame: 7, tint: "#acbd85" }));
  add("distill-poison", "Перегнать яд", "Стрела 1,55 продлевает яд и рану на 1 ход, до 5 ходов. Чутьё дольше держит эти беды. Откат 3. Без яда и раны продлевать нечего.",
    { powerMultiplier: 1.55, cooldown: 3, resourceCost: 16,
      on: onAction("distill-poison", b => {
        ["poison", "bleed"].forEach(id => {
          const effect = getEffect(b.enemy, id);
          if (effect && Number.isFinite(effect.duration) && !tm(b.hero, `perma:${id}`)) {
            effect.duration = Math.max(effect.duration, Math.min(5, effect.duration + 1));
          }
        });
      }), ai: b => ["poison", "bleed"].some(id => hasFx(b.enemy, id)) },
    anim("guard", "cast", "thrust", "smoke", { frame: 9, tint: "#a2ad65", weight: "mid" }));
  add("scent-weakness", "Нюх на слабость", "Стрела 2,0 получает +12% силы за каждую беду на цели, до 48%, сверх чутья. Беды остаются. Откат 3, цена 22. Без подготовки это дорогой одиночный удар.",
    { powerMultiplier: 2, cooldown: 3, resourceCost: 22,
      on: onHit("scent-weakness", (b, s, c) => { c.mult *= 1 + Math.min(4, countEnemyDebuffs(b.enemy)) * 0.12; }) },
    anim("proud", "slam", "guard", "shards", { frame: 11, weight: "mid", tint: "#bcaa80", reaction: "knockback" }));

  // SNIPER — spend the mark, spend focus, or retain both for sustained pressure.
  add("hunters-mark", "Метка охотника", "Стрела 0,9 ставит метку 25% на 3 хода и даёт 1 сосредоточение. Снайпер пробивает по метке ещё 30% защиты. Темп 0,8, откат 3. Для добивания удар слаб.",
    { powerMultiplier: 0.9, resourceCost: 10, tempo: 0.8, cooldown: 3,
      appliedEffects: [eff("mark", 3, { value: 0.25 })],
      on: onAction("hunters-mark", b => bumpGauge(b, "marksman", 1, 5)),
      ai: b => !hasFx(b.enemy, "mark") },
    anim("idle", "cast", "thrust", "ring", { frame: 5, tint: "#c8b69a" }));
  add("under-eye", "Стрела под глаз", "Стрела 1,7. Без метки пробивание +25%; по метке шанс крита +20% и работает снайперское пробивание 30%. Откат 2. Метку и сосредоточение сохраняешь.",
    { powerMultiplier: 1.7, cooldown: 2, resourceCost: 14,
      on: onHit("under-eye", (b, s, c) => {
        if (hasFx(b.enemy, "mark")) c.critBonus += 20;
        else c.pierce += 0.25;
      }) },
    anim("guard", "slam", "idle", "shards", { frame: 7, tint: "#d5cab0" }));
  add("headshot", "Выстрел в голову", "Тратишь весь прицел. Стрела 1,0, +40% силы и +15% пробивания за сосредоточение; на 5 крит гарантирован. Откат 4, цена 22. Пустой прицел почти не ранит.",
    { special: "headshot", powerMultiplier: 1, cooldown: 4, resourceCost: 22, tempo: 1.25, pierce: 0.2,
      ai: b => focus(b) >= 4,
      on: onHit("headshot", (b, s, c) => { c.pierce = Math.min(0.8, c.pierce); }) },
    anim("windup", "slam", "hit", "shards", { frame: 14, weight: "heavy", reaction: "knockback",
      pose: { back: -0.2, hold: 0.14, tail: 0.9 }, anticipate: [{ fx: "ring", at: "target", size: 0.45, n: 2 }] }));
  add("keep-sight", "Сохранить прицел", "Стрела 2,15, от 4 сосредоточения сила +15%. Прицел и метка остаются для следующих выстрелов. Откат 3, цена 20. Сорванный прицел лишает усиления.",
    { powerMultiplier: 2.15, cooldown: 3, resourceCost: 20,
      on: strengthen("keep-sight", b => focus(b) >= 4, 1.15) },
    anim("thrust", "slam", "proud", "slash", { frame: 10, weight: "mid", reaction: "stagger" }));
  add("break-mark", "Выбить метку", "Стрела 2,4, по метке сила +25% и снайперское пробивание +30%. После выстрела метка исчезает даже при промахе. Откат 4, цена 26. Следующий удар лишится подготовки.",
    { powerMultiplier: 2.4, cooldown: 4, resourceCost: 26,
      on: { ...strengthen("break-mark", b => hasFx(b.enemy, "mark"), 1.25),
        ...onAction("break-mark", b => removeFx(b.enemy, "mark")) }, ai: b => hasFx(b.enemy, "mark") },
    anim("proud", "thrust", "hit", "cross", { frame: 12, weight: "heavy", reaction: "knockback", pose: { hold: 0.08, tail: 0.75 } }));
  add("switch-target", "Сменить мишень", "Стрела 1,55, остальным 60%, метка 15% на 2 хода. Если выбранная цель падает, +2 сосредоточения. Откат 3. Готовит смену добычи, по одинокой цели охват пропадает.",
    { powerMultiplier: 1.55, aoe: 0.6, cooldown: 3, resourceCost: 20,
      appliedEffects: [eff("mark", 2, { value: 0.15 })],
      on: onAction("switch-target", b => { if (b.enemy.currentHp <= 0) bumpGauge(b, "marksman", 2, 5); }) },
    anim("cast", "strike", "proud", "fan", { volley: 3, frame: 11, weight: "mid", tint: "#c2c9aa" }));

  // STORMSHOT — accelerated series reach the sixth-arrow payout at different times.
  add("arrow-storm", "Шквал стрел", "Три стрелы по 0,7, под ускорением четыре. Попадания копят шквал до бесплатного залпа на шестой стреле. Откат 3, цена 16. Без ускорения серия короче.",
    { powerMultiplier: 0.7, hits: 3, cooldown: 3, resourceCost: 16, element: "air" },
    anim("cast", "slam", "thrust", "fan", { volley: 3, frame: 6, weight: "mid", tint: "#bfd0ca" }));
  add("quiver-windup", "Разгон колчана", "Стрела 1,25 и ускорение 25% на 3 хода. Следующие многоударные навыки выпускают лишнюю стрелу для шквала. Откат 4. Перед добиванием разгон не окупится.",
    { powerMultiplier: 1.25, cooldown: 4, resourceCost: 16, appliedEffects: [selfEff("haste", 3, { value: 0.25 })],
      ai: b => !hasFx(b.hero, "haste") },
    anim("idle", "slam", "cast", "afterimages", { frame: 5, tint: "#b4cdc7" }));
  add("frequent-rain", "Частый дождь", "Четыре стрелы по 0,45, остальным 45%. Под ускорением пять. Каждое попадание копит шквал. Откат 4, цена 24. Броня гасит слабые стрелы, группа ускоряет залп.",
    { powerMultiplier: 0.45, hits: 4, aoe: 0.45, cooldown: 4, resourceCost: 24, element: "air" },
    anim("windup", "proud", "thrust", "rain", { volley: 4, frame: 11, weight: "mid", tint: "#b9cecb",
      release: [{ fx: "rain", at: "allFoes", size: 0.8 }] }));
  add("sixth-arrow", "Шестая стрела", "Стрела 1,5. При 4–5 единицах шквала сила +45%, попадание приближает обычный бесплатный залп. Откат 2. Пустой счётчик лишает усиления.",
    { powerMultiplier: 1.5, cooldown: 2, resourceCost: 14,
      on: strengthen("sixth-arrow", b => storm(b) >= 4, 1.45), ai: b => storm(b) >= 4 },
    anim("thrust", "strike", "slam", "burst", { frame: 8, weight: "mid", tint: "#cbd8c4", reaction: "knockback" }));
  add("storm-exhale", "Выдох бури", "Стрела 1,8 обновляет ускорение 35% на 3 хода для лишних стрел шквала. Если ускорение было до выстрела, ещё +1 дистанция. Откат 4. Сначала разгонись.",
    { powerMultiplier: 1.8, cooldown: 4, resourceCost: 20, appliedEffects: [selfEff("haste", 3, { value: 0.35 })],
      on: { ...onHit("storm-exhale", (b, s) => { s.hasted = hasFx(b.hero, "haste"); }),
        ...onAction("storm-exhale", (b, s) => { if (s.hasted) shift(b, 1); s.hasted = false; }) } },
    anim("air", "slam", "proud", "wave", { hop: "leap", frame: 11, weight: "mid", tint: "#b9d6cc", reaction: "knockback" }));
  add("unwind-storm", "Спустить шквал", "Тратишь шквал перед двумя стрелами по 0,8: +12% силы за единицу. Новые попадания копят шквал заново. Откат 3, цена 22. С пустой шкалой расход невыгоден.",
    { special: "archer_unwind", powerMultiplier: 0.8, hits: 2, cooldown: 3, resourceCost: 22, element: "air",
      ai: b => storm(b) >= 3 },
    anim("guard", "slam", "hit", "fan", { volley: 2, frame: 13, weight: "heavy", tint: "#d5dfc8",
      reaction: "knockback", pose: { back: -0.18, hold: 0.1, tail: 0.8 } }));

  // RANGER — a single trap slot is committed now and normally pays on an enemy turn.
  add("snare", "Силок", "Ты ставишь силок и отходишь на ступень. На ходу врага удар 0,9, замедление 30% на 3 хода, шанс стана 35%. Откат 3. Занятую ловушку не заменяет.",
    { attackType: null, targetType: "self", special: "trap", trap: { power: 0.9, slow: 0.3, stun: 0.35 },
      resourceCost: 10, tempo: 0.8, cooldown: 3, element: "earth", on: onAction("snare", b => shift(b, 1)) },
    anim("idle", "thrust", "guard", "ring", { range: "self", shot: "none", frame: 8, tint: "#ad9a77",
      release: [{ fx: "ring", at: "self", size: 0.7 }], impact: [{ fx: "spikes", at: "target", size: 0.4, delay: 0.2 }] }));
  add("arrow-loop", "Петля на стреле", "Стрела 1,35 замедляет на 20% на 2 хода. Если место свободно, ставит силок 0,6 с замедлением 15% на 3 хода. Откат 3. С готовой ловушкой теряешь установку.",
    { powerMultiplier: 1.35, cooldown: 3, resourceCost: 16, appliedEffects: [eff("slow", 2, { value: 0.2 })],
      on: onAction("arrow-loop", b => { if (!b.mech.ranger.trap) b.mech.ranger.trap = smallTrap(); }) },
    anim("guard", "thrust", "idle", "ring", { frame: 6, tint: "#bfaa81" }));
  add("poison-trap", "Ядовитый капкан", "Ставишь капкан: на ходу врага удар 0,8 и яд по 35% атаки на 3 хода. Откат 3, темп 0,8. Одна ловушка за раз; враг на грани гибели может не дойти до неё.",
    { attackType: null, targetType: "self", special: "trap", trap: { power: 0.8, poison: 0.35 },
      resourceCost: 12, tempo: 0.8, cooldown: 3, element: "poison" },
    anim("guard", "cast", "idle", "spikes", { range: "self", shot: "none", frame: 10, weight: "mid", tint: "#9caa70",
      release: [{ fx: "spikes", at: "self", size: 0.65 }], impact: [{ fx: "smoke", at: "target", size: 0.5, delay: 0.2 }] }));
  add("trip-shot", "Стрела в силок", "Стрела 1,6 сразу спускает готовую ловушку по выжившей цели, сохраняя её яд и контроль. Откат 3. Без ловушки теряешь вторую часть удара и задержку врага.",
    { special: "archer_trip", powerMultiplier: 1.6, cooldown: 3, resourceCost: 16,
      ai: b => Boolean(b.mech.ranger?.trap) },
    anim("thrust", "cast", "hit", "spikes", { frame: 9, weight: "mid", tint: "#c3ae82", reaction: "pull" }));
  add("spare-string", "Запасная тетива", "Стрела 1,5 усиливает удар готовой ловушки на 0,5, до 1,6. Если ловушки нет, ставит силок 0,6 с замедлением 15%. Откат 3. Без хода врага установка пропадёт.",
    { powerMultiplier: 1.5, cooldown: 3, resourceCost: 18,
      on: onAction("spare-string", b => {
        const state = b.mech.ranger;
        if (!state.trap) state.trap = smallTrap();
        else state.trap.power = Math.max(state.trap.power, Math.min(1.6, state.trap.power + 0.5));
      }) },
    anim("idle", "strike", "cast", "ring", { frame: 9, weight: "mid", tint: "#cdb487" }));
  add("close-trail", "Перекрыть тропу", "Стрела 1,4, остальным 60%, замедление 25% на 3 хода. При готовой ловушке после выстрела +1 дистанция. Откат 4. Без подготовки теряешь отход.",
    { powerMultiplier: 1.4, aoe: 0.6, cooldown: 4, resourceCost: 20,
      appliedEffects: [eff("slow", 3, { value: 0.25 })],
      on: onAction("close-trail", b => { if (b.mech.ranger.trap) shift(b, 1); }) },
    anim("air", "strike", "guard", "spikes", { hop: "leap", volley: 3, frame: 12, weight: "heavy", tint: "#aeb58a",
      release: [{ fx: "spikes", at: "allFoes", size: 0.9 }], reaction: "stagger", pose: { tail: 0.7 } }));

  // BEASTMASTER — wolf health pays for protection, commands and a shared burst.
  add("pack-tactics", "Фас!", "Укус волка 250% его силы мимо брони и метка 15% на 2 хода для чутья. Откат 2. Дистанция и крит укус не усиливают. Без волка недоступно.",
    { attackType: null, special: "wolf_strike", element: "blood", cooldown: 2,
      appliedEffects: [eff("mark", 2, { value: 0.15 })], ai: b => !hasFx(b.enemy, "mark") },
    anim("proud", "thrust", "guard", "cross", { shot: "none", frame: 6, tint: "#b98b70", reaction: "pull" }));
  add("shepherd-shot", "Стрела пастуха", "Стрела 1,45, затем волк лечится на 20% здоровья. Если волк пал, прямой урон +30%. Откат 2. С целым волком лечение пропадает, зато остаётся выстрел.",
    { powerMultiplier: 1.45, cooldown: 2, resourceCost: 14,
      on: { ...strengthen("shepherd-shot", b => !findWolf(b.hero), 1.3),
        ...onAction("shepherd-shot", b => {
          const wolf = findWolf(b.hero);
          if (wolf) wolf.hp = Math.min(wolf.maxHp, Math.round(wolf.hp + wolf.maxHp * 0.2));
        }) } },
    anim("cast", "slam", "guard", "glow", { frame: 7, tint: "#bac394" }));
  add("heel", "К ноге!", "Волк лечится на 25% и чаще принимает удары 2 хода. Ты отходишь на ступень и получаешь закалку 20% на 2 хода. Откат 4. Без волка недоступно, стрелы нет.",
    { attackType: null, targetType: "self", special: "wolf_guard", element: "earth", resourceCost: 10, cooldown: 4,
      appliedEffects: [selfEff("fortify", 2, { value: 0.2 })], on: onAction("heel", b => shift(b, 1)),
      ai: b => { const wolf = findWolf(b.hero); return Boolean(wolf && (wolf.hp < wolf.maxHp * 0.75 || hpRatio(b.hero) < 0.75)); } },
    anim("hit", "guard", "proud", "ring", { range: "self", shot: "none", frame: 8, tint: "#c4b28d",
      release: [{ fx: "ring", at: "self", size: 0.8 }], impact: [{ fx: "glow", at: "self", size: 0.4 }] }));
  add("blood-trail", "Кровавый след", "Стрела 1,5 и рана по 22% атаки на 3 хода. Живой волк сразу кусает на 100% своей силы. Откат 3. Без волка укус пропадает, рана всё ещё питает чутьё.",
    { powerMultiplier: 1.5, cooldown: 3, resourceCost: 18, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.22, 4))],
      on: onAction("blood-trail", b => { const wolf = findWolf(b.hero); if (wolf) procDamage(b, wolf.power, "Укус по следу", "blood"); }) },
    anim("dash", "thrust", "cast", "slash", { frame: 9, weight: "mid", tint: "#b98267", reaction: "pull" }));
  add("call-wolf", "Зов волка", "Стрела 1,5 возвращает павшего волка или лечит живого на 40% здоровья. Откат 4, цена 20. Спасает спутника без пустого хода; при целом волке лечение пропадает.",
    { special: "archer_recall", powerMultiplier: 1.5, cooldown: 4, resourceCost: 20,
      ai: b => { const wolf = findWolf(b.hero); return !wolf || wolf.hp < wolf.maxHp * 0.8; } },
    anim("proud", "cast", "slam", "afterimages", { frame: 10, weight: "mid", tint: "#bdc6a2" }));
  add("shared-lunge", "Общий рывок", "Стрела 2,1. Если у волка больше 20% здоровья, отдаёт 20% максимума за +30% силы даже при промахе. Откат 4, цена 24. Раненому зверю цена опасна.",
    { powerMultiplier: 2.1, cooldown: 4, resourceCost: 24,
      on: { ...onHit("shared-lunge", (b, s, c) => {
        const wolf = findWolf(b.hero);
        s.wolf = wolf && wolf.hp > wolf.maxHp * 0.2 ? wolf : null;
        if (s.wolf) c.mult *= 1.3;
      }), ...onAction("shared-lunge", (b, s) => {
        if (s.wolf && findWolf(b.hero) === s.wolf) s.wolf.hp = Math.max(1, s.wolf.hp - Math.round(s.wolf.maxHp * 0.2));
        s.wolf = null;
      }) } },
    anim("air", "slam", "strike", "cross", { hop: "leap", frame: 13, weight: "heavy", tint: "#d0b090",
      reaction: "knockback", pose: { back: -0.16, hold: 0.1, tail: 0.8 } }));

  const tier = (level, options, extra = {}) => ({ level, options: options.map(id => `archer-${id}`), ...extra });
  const path = (owner, stage, rows) => ({ owner, stage, tiers: rows.map(([level, ...ids]) => tier(level, ids)) });
  defineSkillTree("archer", {
    lanes: [
      { name: "Дальний натяг", description: "Замедляй подход, укрепляй линию и пробивай броню. Медленный натяг требует пространства, финал отдаёт его за урон." },
      { name: "Челночная стрельба", description: "Чередуй отход с расходом ступеней. Заряжай разворот и решай, сколько пространства можно отдать до следующего ответа." },
      { name: "Колючий загон", description: "Принимай сближение ради ближней силы, яда и ран. Группа выгодна для веера, но дистанция больше не прикрывает тебя." }
    ],
    stages: [
      { owner: "archer", stage: "class", tiers: [
        tier(1, ["piercing-shot", "swift-volley", "tipped-arrow"]),
        tier(4, ["pin-boot", "pursuit-shot", "slant-fan"]),
        tier(8, ["long-string", "fighting-retreat", "rough-arrow"]),
        tier(12, ["string-catch", "shed-quiver", "bitter-splinter"]),
        tier(16, ["break-windup", "turn-shot", "feather-trip"]),
        tier(22, ["string-horizon", "three-steps", "thorn-circle"], { needsLane: 2 })
      ] },
      path("marksman", "subclass", [[30, "aimed-shot", "cut-strap"], [38, "close-line", "sell-focus"], [46, "reset-grip", "edge-shots"]]),
      path("wild", "subclass", [[30, "barbed-arrow", "cloudy-resin"], [38, "cut-bindings", "read-trail"], [46, "distill-poison", "scent-weakness"]]),
      path("sniper", "profession", [[60, "hunters-mark", "under-eye"], [68, "headshot", "keep-sight"], [76, "break-mark", "switch-target"]]),
      path("stormshot", "profession", [[60, "arrow-storm", "quiver-windup"], [68, "frequent-rain", "sixth-arrow"], [76, "storm-exhale", "unwind-storm"]]),
      path("ranger", "profession", [[60, "snare", "arrow-loop"], [68, "poison-trap", "trip-shot"], [76, "spare-string", "close-trail"]]),
      path("beastmaster", "profession", [[60, "pack-tactics", "shepherd-shot"], [68, "heel", "blood-trail"], [76, "call-wolf", "shared-lunge"]])
    ]
  });
})();
