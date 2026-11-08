// The warrior earns pressure in contact, then chooses what to keep or spend.
(() => {
  const drive = b => b.hero.currentMana;
  const gauge = (b, id) => Number(b.mech[id]?.value || 0);
  const gain = (b, id, amount, max) => { if (b.mech[id]) addGauge(b.mech[id], amount, max); };
  const take = (b, id, amount = Infinity) => {
    const value = Math.min(gauge(b, id), amount);
    if (b.mech[id]) b.mech[id].value -= value;
    return value;
  };
  const shield = (b, ratio) => {
    const cap = b.hero.maxHp * 0.6;
    const value = Math.min(cap, effectValue(b.hero, "shield") + b.hero.maxHp * ratio);
    const effect = fx(b, "shield", 3, Math.round(value), { self: true });
    if (effect) effect.value = Math.min(cap, effect.value);
  };
  const onHit = (id, run) => ({ beforeHit(b, s, c) {
    if (c.skill?.id === `warrior-${id}`) run(b, s, c);
  } });
  const onAction = (id, run) => ({ afterAction(b, s, c) {
    if (c.skill?.id === `warrior-${id}`) run(b, s, c);
  } });
  // A blocked blow can prepare only this skill. Other attacks never consume it.
  const afterBlock = (id, bonus) => ({
    hurt(b, s, c) { if (c.blocked > 0) s.ready = true; },
    ...onHit(id, (b, s, c) => { if (s.ready) c.mult *= 1 + bonus; }),
    ...onAction(id, (b, s) => { s.ready = false; })
  });
  const physicalIntent = b => livingFoes(b).some(foe => (foe.charge?.kind || foe.intent?.kind) === "physical");

  // Spending happens once, before any hit, splash, critical or nested proc.
  // All damage goes through the normal skill entry point, including forms.
  SKILL_ACTIONS.warrior_drive = {
    run(b, skill) {
      const stored = drive(b);
      b.hero.currentMana = 0;
      performSkillDamage(b, skill, 1 + stored * skill.driveScale);
    }
  };
  SKILL_ACTIONS.warrior_fury = {
    run(b, skill) {
      const stored = take(b, "fury", skill.furySpend);
      performSkillDamage(b, skill, 1 + stored * skill.furyScale, { pierce: skill.spendPierce || 0 });
    }
  };
  SKILL_ACTIONS.warrior_wall = {
    run(b, skill) {
      const stones = take(b, "bulwark");
      performSkillDamage(b, skill, 1 + stones * 0.22);
    }
  };
  SKILL_ACTIONS.warrior_blood = {
    can: b => b.hero.currentHp > Math.ceil(b.hero.maxHp * 0.08)
      ? { ok: true } : { ok: false, reason: "Нужно больше 8% здоровья для жертвы." },
    run(b, skill) {
      b.hero.currentHp -= Math.ceil(b.hero.maxHp * 0.08);
      performSkillDamage(b, skill);
    }
  };
  SKILL_ACTIONS.warrior_plate = {
    run(b, skill) {
      const cracks = take(b, "breaker");
      performSkillDamage(b, skill, 1, { pierce: cracks * 0.16 });
      procMana(b, cracks * 0.06);
    }
  };
  SKILL_ACTIONS.warrior_debt = {
    run(b, skill) {
      const stored = take(b, "guardian", b.hero.maxHp * skill.debtSpend);
      // Flat damage shares the skill's hit hooks, accuracy and boss hit cap.
      performHeroHit(b, { kind: "physical", power: getSkillPower(skill, b.hero), flat: stored * skill.debtScale,
        label: skill.name, element: "steel", skill, sure: true });
      if (b.enemy.currentHp > 0) applySkillEffects(b, skill, b.hero, b.enemy);
    }
  };
  SKILL_ACTIONS.warrior_tempo = {
    run(b, skill) {
      const tempo = take(b, "duelist");
      performSkillDamage(b, skill);
      shield(b, tempo * 0.07);
    }
  };

  // One central image per action. Silhouettes and locomotion are authored per
  // skill. Size, windup and recovery grow with the weight of the actual blow.
  const anim = (move, before, pose, then2, image, extra = {}) => {
    const { pose: recovery, ...staging } = extra;
    const tint = extra.tint || "#d6c3a2";
    const self = move === "self";
    const heavy = extra.weight === "heavy";
    const size = heavy ? 1.2 : 0.75;
    return {
      range: self ? "self" : "melee", ...(self ? {} : { move }),
      pose: { before, pose, then2, back: -0.1, lunge: self ? 0 : 0.28, tail: 0.55, ...recovery },
      frame: 7, weight: "light", tint,
      anticipate: [{ fx: "glow", at: "self", color: tint, size: heavy ? 0.55 : 0.25 }],
      release: [{ fx: image, at: self ? "self" : "target", color: tint, size }],
      impact: [{ fx: image, at: self ? "self" : "target", color: tint, size: size * 0.45, delay: 0.06 }],
      reaction: "stagger", ...staging
    };
  };
  const add = (id, name, description, spec, animation) => defineTreeSkill("warrior", {
    id: `warrior-${id}`, name, description, attackType: "physical", element: "steel",
    targetType: "enemy", resourceType: "mana", powerMultiplier: 1.5, resourceCost: 14,
    appliedEffects: [], ...spec, anim: animation
  });

  // CLASS. The first two rows always offer attacks, including mixed lanes.
  add("raskol", "Раскол", "Ты бьёшь на 1,85 за 14 напора; попадание вернёт 14. Сохрани 70 после оплаты ради +15% урона. Только одна цель, без защиты.",
    { powerMultiplier: 1.85 },
    anim("walk", "windup", "strike", "idle", "slash", { frame: 5 }));
  add("blunt-drive", "Обухом в грудь", "Ты бьёшь обухом на 1,35 без цены и получаешь обычные 14 напора за попадание. Темп 1,1. Начинай разгон, но при полном запасе выгоднее трата.",
    { powerMultiplier: 1.35, resourceCost: 0, tempo: 1.1, ai: b => drive(b) < 40 },
    anim("charge", "idle", "thrust", "hit", "burst", { frame: 5, pose: { lunge: 0.38 } }));
  add("shield-edge", "Кромка щита", "Удар щитом 1,2 за 10 напора и стойка. Первый блок после приёма вернёт ещё 12 напора. Темп 1,1. Урон ниже, защита против пробоя не поможет.",
    { powerMultiplier: 1.2, resourceCost: 10, tempo: 1.1, on: {
      ...onAction("shield-edge", (b, s) => { b.guard = true; s.ready = true; }),
      hurt(b, s, c) { if (s.ready && c.blocked > 0) { s.ready = false; procMana(b, 0.12); } }
    }, ai: b => !b.guard && physicalIntent(b) },
    anim("walk", "guard", "thrust", "guard", "ring", { frame: 6, reaction: "knockback" }));

  add("sword-arc", "Дуга меча", "Удар 1,45 за 12 напора, по остальным 55%. При 70 перед попаданием сила +15%. Откат 2. Ты держишь запас ради охвата, одиночный удар слабее.",
    { powerMultiplier: 1.45, resourceCost: 12, aoe: 0.55, cooldown: 2,
      on: onHit("sword-arc", (b, s, c) => { if (drive(b) >= 70) c.mult *= 1.15; }),
      ai: b => livingFoes(b).length > 1 || drive(b) >= 82 },
    anim("dash", "windup", "strike", "guard", "slash", { weight: "mid", reaction: "knockback" }));
  add("break-ranks", "Пролом строя", "Ты тратишь 32 напора на удар 1,9, по остальным 65%. Каждое попадание возвращает 14. Откат 2, темп 1,15. Один враг хуже окупает размах.",
    { powerMultiplier: 1.9, resourceCost: 32, aoe: 0.65, cooldown: 2, tempo: 1.15,
      ai: b => livingFoes(b).length > 1 || drive(b) < 70 },
    anim("charge", "guard", "slam", "strike", "wave", { frame: 10, weight: "mid", reaction: "knockback" }));
  add("cut-step", "Подсечь шаг", "Удар 1,4 за 8 напора замедляет на 20% на 2 хода. Если после приёма напор ниже 70, ты получаешь ещё 8. Откат 2. Для добивания медленнее Раскола.",
    { powerMultiplier: 1.4, resourceCost: 8, cooldown: 2, appliedEffects: [eff("slow", 2, { value: 0.2 })],
      on: onAction("cut-step", b => { if (drive(b) < 70) procMana(b, 0.08); }),
      ai: b => !unitHasEffect(b.enemy, "slow") },
    anim("walk", "dash", "slam", "guard", "cross", { frame: 6, pose: { drop: true }, reaction: "stagger" }));

  add("hold-line", "Держать линию", "Удар 1,7 за 10 напора. При 70 после оплаты пробивает ещё 35% брони. Откат 2. Ты сохраняешь напор, но без запаса броня гасит удар.",
    { powerMultiplier: 1.7, resourceCost: 10, cooldown: 2,
      on: onHit("hold-line", (b, s, c) => { if (drive(b) >= 70) c.pierce += 0.35; }),
      ai: b => drive(b) >= 80 },
    anim("walk", "proud", "thrust", "guard", "slash", { frame: 8, pose: { hold: 0.05 } }));
  add("double-pressure", "Двойной нажим", "Два удара по 0,8 за 22 напора; каждое попадание даёт 14. Ты быстро возвращаешь запас к 70. Откат 2. При полном запасе возврат пропадёт.",
    { powerMultiplier: 0.8, hits: 2, resourceCost: 22, cooldown: 2, ai: b => drive(b) < 80 },
    anim("dash", "thrust", "strike", "slam", "cross", { frame: 6, pose: { tail: 0.65 } }));
  add("bastion-oath", "Клятва бастиона", "Ты лечишься с силой 1,2, получаешь регенерацию 24% на 2 хода, стойку и 30 напора. Бесплатно, откат 4. При полном здоровье отдаёшь ход за подготовку.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 4, selfHealMultiplier: 1.2,
      appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.24, 5))],
      on: onAction("bastion-oath", b => { b.guard = true; procMana(b, 0.3); }),
      ai: b => hpRatio(b.hero) < 0.72 && drive(b) <= 70 },
    anim("self", "hit", "guard", "proud", "ring", { frame: 9, tint: "#adc4c9", pose: { tail: 0.7 } }));

  add("clip-windup", "Срезать замах", "Удар 1,5 за 8 напора. При попадании слабость на 2 хода — 30% при запасе от 70, иначе 15%. Откат 2. Ты бережёшь напор, но медленнее добиваешь.",
    { powerMultiplier: 1.5, resourceCost: 8, cooldown: 2, on: { afterHit(b, s, c) {
      if (c.skill?.id === "warrior-clip-windup") fx(b, "weaken", 2, drive(b) >= 70 ? 0.3 : 0.15);
    } }, ai: b => !unitHasEffect(b.enemy, "weaken") },
    anim("dash", "guard", "strike", "thrust", "slash", { frame: 5 }));
  add("skullbreaker", "Череполом", "Ты тратишь 30 напора на удар 2,25. Против заряда сила +10%, попадание даёт ошеломление 25% на 2 хода. Откат 3. Без замаха врага переплачиваешь.",
    { powerMultiplier: 2.25, resourceCost: 30, cooldown: 3, tempo: 1.15,
      appliedEffects: [eff("stagger", 2, { value: 0.25 })],
      on: onHit("skullbreaker", (b, s, c) => { if (b.enemy.charge) c.mult *= 1.1; }),
      ai: b => Boolean(b.enemy.charge) || drive(b) >= 85 },
    anim("leap", "windup", "slam", "hit", "burst", { frame: 11, weight: "heavy", reaction: "slam", pose: { back: -0.23, drop: true, tail: 0.8 } }));
  add("guard-strike", "Удар из стойки", "Удар 1,6 за 12 напора, +40% после блока стойкой. Откат 2. Ты возвращаешь 14 за попадание и сохраняешь запас; без блока теряешь главный бонус.",
    { powerMultiplier: 1.6, resourceCost: 12, cooldown: 2, on: afterBlock("guard-strike", 0.4) },
    anim("charge", "guard", "strike", "proud", "ring", { frame: 8, weight: "mid", reaction: "launch" }));

  add("poised-blade", "Клинок на весу", "Ты бьёшь на 1,8 за 10 напора. При 70 после оплаты сила +25%. Откат 3. Запас сохраняется для следующего хода, но ранний удар лишён бонуса.",
    { powerMultiplier: 1.8, resourceCost: 10, cooldown: 3,
      on: onHit("poised-blade", (b, s, c) => { if (drive(b) >= 70) c.mult *= 1.25; }),
      ai: b => drive(b) >= 80 },
    anim("walk", "proud", "strike", "thrust", "cross", { frame: 9, weight: "mid", pose: { hold: 0.08 } }));
  add("steel-exhale", "Выдох стали", "Удар 1,85 с пробиванием 50% за 20 напора; весь остаток даёт +0,6% силы за единицу. Откат 3. Ты теряешь порог 70, без запаса выпуск слаб.",
    { powerMultiplier: 1.85, resourceCost: 20, cooldown: 3, pierce: 0.5, special: "warrior_drive", driveScale: 0.006,
      ai: b => drive(b) >= 55 },
    anim("charge", "windup", "thrust", "hit", "wave", { frame: 12, weight: "heavy", reaction: "knockback", pose: { back: -0.25, lunge: 0.45, tail: 0.8 } }));
  add("lift-visor", "Поднять забрало", "Удар 1,65 за 12 напора. Если ранее тебя ранили, ты возвращаешь ещё 18 напора один раз за применение. Откат 3. Без раны подготовка не окупается.",
    { powerMultiplier: 1.65, resourceCost: 12, cooldown: 3, on: {
      hurt(b, s, c) { if (c.hpDamage > 0) s.ready = true; },
      ...onAction("lift-visor", (b, s) => { if (s.ready) procMana(b, 0.18); s.ready = false; })
    } },
    anim("walk", "hit", "thrust", "proud", "burst", { frame: 6, reaction: "launch" }));

  add("unbroken-line", "Несломленная линия", "Ты бьёшь на 2,1 за 14 напора. При 70 после оплаты сила +25% и пробивание +25%. Откат 4. Храни запас; ранний удар теряет оба бонуса.",
    { powerMultiplier: 2.1, resourceCost: 14, cooldown: 4,
      on: onHit("unbroken-line", (b, s, c) => { if (drive(b) >= 70) { c.mult *= 1.25; c.pierce += 0.25; } }),
      ai: b => drive(b) >= 84 },
    anim("charge", "proud", "strike", "guard", "cross", { frame: 12, weight: "heavy", reaction: "knockback", pose: { back: -0.22, hold: 0.12, tail: 0.8 } }));
  add("last-blow", "Последний довод", "Удар 2,1 за 30 напора; весь остаток даёт +0,6% силы за единицу. Остальные получают 55%. Откат 5, темп 1,25. Ты обнуляешь запас ради выпуска.",
    { powerMultiplier: 2.1, resourceCost: 30, cooldown: 5, tempo: 1.25, aoe: 0.55,
      special: "warrior_drive", driveScale: 0.006, ai: b => drive(b) >= 70 },
    anim("leap", "windup", "slam", "guard", "quake", { frame: 14, weight: "heavy", reaction: "slam", pose: { back: -0.3, drop: true, hold: 0.14, tail: 0.9 } }));
  add("return-blow", "Вернуть удар", "Удар 1,9 за 18 напора, +45% после блока стойкой. Ты вновь ставишь стойку и получаешь 10 напора. Откат 4. Без прошлого блока выпуск слабее.",
    { powerMultiplier: 1.9, resourceCost: 18, cooldown: 4, on: {
      ...afterBlock("return-blow", 0.45),
      ...onAction("return-blow", (b, s) => { s.ready = false; b.guard = true; procMana(b, 0.1); })
    } },
    anim("charge", "hit", "slam", "guard", "ring", { frame: 12, weight: "heavy", reaction: "knockback", pose: { back: -0.2, hold: 0.1, tail: 0.75 } }));

  // FURY. Build lasting anger or give it up for an immediate opening.
  add("savage-swing", "Свирепый замах", "Удар 1,6 за 12 напора, по остальным 70%, рана 18% на 2 хода. Попадания дают по 7 ярости. Откат 2. Ты разгоняешься на толпе, одиночный удар слабее.",
    { powerMultiplier: 1.6, resourceCost: 12, cooldown: 2, aoe: 0.7, element: "blood",
      appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.18, 4))], ai: b => !unitHasEffect(b.enemy, "bleed") || livingFoes(b).length > 1 },
    anim("dash", "windup", "slam", "strike", "slash", { frame: 9, weight: "mid", tint: "#c55749", reaction: "knockback" }));
  add("shoulder-cut", "Рубить с плеча", "Удар 1,9 за 20 напора, +0,6% силы за единицу потраченной ярости, до 50. Откат 2. Ты жертвуешь долгим разгоном ради одного врага.",
    { powerMultiplier: 1.9, resourceCost: 20, cooldown: 2, special: "warrior_fury", furySpend: 50, furyScale: 0.006,
      ai: b => gauge(b, "fury") >= 28 },
    anim("charge", "windup", "strike", "hit", "cross", { frame: 10, weight: "mid", tint: "#d18d61", reaction: "slam" }));
  add("provoke", "Раззадорить", "Удар 1,5 за 8 напора и ещё 18 ярости после приёма, сверх 7 за попадание. Откат 2. Ты готовишь долгий бой; при полной ярости прибавка пропадает.",
    { powerMultiplier: 1.5, resourceCost: 8, cooldown: 2,
      on: onAction("provoke", b => gain(b, "fury", 18, 100)), ai: b => gauge(b, "fury") <= 75 },
    anim("walk", "hit", "strike", "proud", "slash", { frame: 5, tint: "#cf8d62" }));
  add("anger-release", "Отдать ярость", "Удар 1,65 за 24 напора. Ты тратишь всю ярость — +0,7% силы за единицу, пробивание 30%. Откат 3. Без разгона выгоднее сохранить шкалу.",
    { powerMultiplier: 1.65, resourceCost: 24, cooldown: 3, special: "warrior_fury", furySpend: 100, furyScale: 0.007, spendPierce: 0.3,
      ai: b => gauge(b, "fury") >= 45 },
    anim("leap", "guard", "slam", "proud", "burst", { frame: 12, weight: "heavy", tint: "#dc8854", reaction: "slam", pose: { drop: true, tail: 0.8 } }));
  add("blood-sweep", "Кровавый размах", "Два удара по 0,8 за 26 напора, по остальным 55%. Каждое попадание даёт 7 ярости. Рана 15% на 3 хода. Откат 3. На одной цели разгон медленнее.",
    { powerMultiplier: 0.8, hits: 2, aoe: 0.55, resourceCost: 26, cooldown: 3, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.15, 4))], ai: b => livingFoes(b).length > 1 || gauge(b, "fury") < 65 },
    anim("dash", "air", "strike", "slam", "cross", { frame: 9, weight: "mid", tint: "#b95044", reaction: "knockback" }));
  add("steady-hands", "Унять дрожь", "Ты тратишь до 60 ярости — за каждые 10 лечишь 3% здоровья и ставишь щит 2%. Напор не тратишь. Откат 4. Весь разгон уходит на выживание.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 4,
      on: onAction("steady-hands", b => { const fury = take(b, "fury", 60); procHeal(b, fury * 0.003, "Унять дрожь"); shield(b, fury * 0.002); }),
      ai: b => gauge(b, "fury") >= 30 && hpRatio(b.hero) < 0.65 },
    anim("self", "windup", "guard", "idle", "glow", { frame: 9, tint: "#bca58f" }));

  // BULWARK. Build stones under pressure or exchange them for an offensive turn.
  add("shield-bash", "Удар щитом", "Удар 1,2 за 12 напора, шанс оглушить 45%. Попадание возвращает 14; после приёма ещё 10, если стена пуста. Откат 3. При стене выгоднее её укреплять.",
    { powerMultiplier: 1.2, resourceCost: 12, cooldown: 3, appliedEffects: [eff("stun", 1, { chance: 0.45, value: 1 })],
      on: onAction("shield-bash", b => { if (!gauge(b, "bulwark")) procMana(b, 0.1); }), ai: b => !gauge(b, "bulwark") || Boolean(b.intent?.heavy) },
    anim("charge", "guard", "thrust", "hit", "ring", { frame: 8, weight: "mid", reaction: "knockback", pose: { lunge: 0.42 } }));
  add("shield-step", "Шаг за щитом", "Удар 1,4 за 10 напора достраивает стену на 1 камень даже при промахе. Откат 2. Ты сохраняешь ход атаки, но при пяти камнях теряешь выгоду.",
    { powerMultiplier: 1.4, resourceCost: 10, cooldown: 2,
      on: onAction("shield-step", b => gain(b, "bulwark", 1, 5)), ai: b => gauge(b, "bulwark") < 5 },
    anim("walk", "guard", "strike", "idle", "burst", { frame: 6, tint: "#a6b3ba" }));
  add("stone-heel", "Каменная пятка", "Удар 1,8 за 16 напора, +10% силы за камень стены до удара. После ты тратишь 1 камень. Пробивание 25%, откат 3. Без стены цена защиты не окупается.",
    { powerMultiplier: 1.8, resourceCost: 16, pierce: 0.25, cooldown: 3,
      on: { ...onHit("stone-heel", (b, s, c) => { c.mult *= 1 + gauge(b, "bulwark") * 0.1; }),
        ...onAction("stone-heel", b => take(b, "bulwark", 1)) }, ai: b => gauge(b, "bulwark") >= 2 },
    anim("leap", "guard", "slam", "thrust", "shards", { frame: 10, weight: "mid", tint: "#adb7be", reaction: "slam" }));
  add("mend-breach", "Залатать брешь", "Ты лечишь 12% здоровья, получаешь 2 камня стены и 20 напора. Бесплатно, откат 4. Отдаёшь удар ради стены, при полных запасах теряешь выгоду.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 4,
      on: onAction("mend-breach", b => { procHeal(b, 0.12, "Залатать брешь"); gain(b, "bulwark", 2, 5); procMana(b, 0.2); }),
      ai: b => gauge(b, "bulwark") <= 3 && hpRatio(b.hero) < 0.75 },
    anim("self", "hit", "proud", "guard", "shards", { frame: 10, tint: "#a4bac6", pose: { tail: 0.7 } }));
  add("falling-wall", "Обрушить стену", "Удар 1,4 за 24 напора, по остальным 60%. Ты тратишь все камни — +22% силы за каждый. Откат 4. Против одного врага тяжело отдать всю защиту.",
    { powerMultiplier: 1.4, resourceCost: 24, cooldown: 4, aoe: 0.6, special: "warrior_wall",
      ai: b => gauge(b, "bulwark") >= 2 && (livingFoes(b).length > 1 || hpRatio(b.enemy) < 0.5) },
    anim("charge", "proud", "slam", "hit", "shards", { frame: 13, weight: "heavy", tint: "#b7c2c6", reaction: "knockback", pose: { back: -0.24, tail: 0.85 } }));
  add("firm-joint", "Крепкий стык", "Удар 1,7 за 12 напора, затем щит 3% здоровья за камень стены. Ты сохраняешь камни. Откат 3. Без стены щита нет, для добивания выпуск сильнее.",
    { powerMultiplier: 1.7, resourceCost: 12, cooldown: 3,
      on: onAction("firm-joint", b => shield(b, gauge(b, "bulwark") * 0.03)), ai: b => gauge(b, "bulwark") > 0 && !unitHasEffect(b.hero, "shield") },
    anim("walk", "guard", "thrust", "proud", "shards", { frame: 8, weight: "mid", tint: "#a1b3bb" }));

  // BERSERK. The 30% lifesteal threshold makes safety an offensive expense.
  add("rend", "Рваная рана", "Удар 1,4 за 12 напора и рана 20% на 3 хода. Если после приёма здоровье ниже 30%, ты получаешь ещё 15 ярости. Откат 2. Ране нужно время.",
    { powerMultiplier: 1.4, resourceCost: 12, cooldown: 2, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.2, 4))],
      on: onAction("rend", b => { if (hpRatio(b.hero) < 0.3) gain(b, "fury", 15, 100); }), ai: b => !unitHasEffect(b.enemy, "bleed") },
    anim("walk", "windup", "thrust", "strike", "slash", { frame: 7, tint: "#ad3940" }));
  add("danger-close", "Опасная близость", "Удар 2,1 и рана 12% на 2 хода за 8% здоровья и 10 напора. Ты приближаешь порог 30%, где удары лечат на 20% урона. Откат 2. Жертва опасна перед ответом.",
    { powerMultiplier: 2.1, resourceCost: 10, special: "warrior_blood", cooldown: 2, element: "blood",
      appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.12, 3))],
      ai: b => hpRatio(b.hero) > 0.4 && !b.intent?.heavy },
    anim("charge", "hit", "strike", "thrust", "cross", { frame: 8, weight: "mid", tint: "#b84942" }));
  add("rip-scar", "Сорвать рубец", "Удар 1,75 за 16 напора, +35% силы ниже 30% здоровья до удара. Рана 18% на 2 хода, откат 3. Ты рискуешь ради порога; выше него бонуса нет.",
    { powerMultiplier: 1.75, resourceCost: 16, cooldown: 3, element: "blood",
      appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.18, 4))],
      on: onHit("rip-scar", (b, s, c) => { if (hpRatio(b.hero) < 0.3) c.mult *= 1.35; }),
      ai: b => hpRatio(b.hero) < 0.3 || !unitHasEffect(b.enemy, "bleed") },
    anim("dash", "hit", "slam", "strike", "slash", { frame: 9, weight: "mid", tint: "#a6343e", reaction: "pull" }));
  add("teeth-bandage", "Перевязь на зубах", "Удар 1,5 за 16 напора, затем лечение 10% здоровья. Ниже 30% до удара сила +20%. Откат 3. Ты переживёшь ответ, но лечение уводит от кровавого порога.",
    { powerMultiplier: 1.5, resourceCost: 16, cooldown: 3,
      on: { ...onHit("teeth-bandage", (b, s, c) => { if (hpRatio(b.hero) < 0.3) c.mult *= 1.2; }),
        ...onAction("teeth-bandage", b => procHeal(b, 0.1, "Перевязь на зубах")) }, ai: b => hpRatio(b.hero) < 0.75 },
    anim("walk", "hit", "strike", "guard", "ring", { frame: 6, tint: "#b89889" }));
  add("carnage", "Бойня", "Ты жертвуешь 8% здоровья и 24 напора ради удара 2,6 и раны 20% на 3 хода. Жертва усиливает кровавый порог. Откат 4, темп 1,2. Перед ответом это риск.",
    { powerMultiplier: 2.6, resourceCost: 24, special: "warrior_blood", cooldown: 4, tempo: 1.2, element: "blood",
      appliedEffects: [eff("bleed", 3, dot("physicalDamage", 0.2, 4))],
      ai: b => hpRatio(b.hero) > 0.18 && (!b.intent?.heavy || hpRatio(b.enemy) < 0.25) },
    anim("leap", "hit", "slam", "proud", "cross", { frame: 14, weight: "heavy", tint: "#b93434", reaction: "slam", pose: { back: -0.22, drop: true, hold: 0.1, tail: 0.85 } }));
  add("blood-palm", "Кровь в ладони", "Три удара по 0,6 за 24 напора, рана 12% на 2 хода. Попадание вернёт 14 напора, а ниже 30% здоровья лечит на 20% урона. Откат 3. Вне порога лечения нет.",
    { powerMultiplier: 0.6, hits: 3, resourceCost: 24, cooldown: 3, element: "blood",
      appliedEffects: [eff("bleed", 2, dot("physicalDamage", 0.12, 3))], ai: b => hpRatio(b.hero) < 0.45 || drive(b) < 70 },
    anim("dash", "guard", "thrust", "strike", "cross", { frame: 8, tint: "#b04a4c", pose: { tail: 0.7 } }));

  // BREAKER. The fifth crack is an alternative payout to spending early.
  add("hammer-blow", "Удар молота", "Ты бьёшь на 1,7 за 14 напора и даёшь 2 трещины. Каждая пробивает 8% брони, пятая обрушит её. Откат 2, темп 1,2. Долгая подготовка для добивания.",
    { powerMultiplier: 1.7, resourceCost: 14, cracks: 2, cooldown: 2, tempo: 1.2, ai: b => gauge(b, "breaker") <= 3 },
    anim("walk", "windup", "slam", "thrust", "shards", { frame: 11, weight: "heavy", reaction: "slam", pose: { back: -0.22, drop: true } }));
  add("find-seam", "Найти шов", "Удар 1,65 за 10 напора даёт 1 трещину. Каждая уже набранная трещина даёт ещё 8% пробивания сверх обычных 8%. Откат 2. Без трещин ты бьёшь слабее.",
    { powerMultiplier: 1.65, resourceCost: 10, cracks: 1, cooldown: 2,
      on: onHit("find-seam", (b, s, c) => { c.pierce += gauge(b, "breaker") * 0.08; }), ai: b => gauge(b, "breaker") >= 2 },
    anim("walk", "thrust", "thrust", "guard", "slash", { frame: 5, tint: "#cabba3" }));
  add("shatter-armor", "Разлом", "Удар 1,1 за 24 напора; ты тратишь все трещины, +35% силы за каждую. Откат 3. Выпуск заменяет пятое обрушение, с пустой шкалой слаб.",
    { powerMultiplier: 1.1, resourceCost: 24, cooldown: 3, special: "break_armor", ai: b => gauge(b, "breaker") >= 3 },
    anim("charge", "windup", "slam", "proud", "shards", { frame: 13, weight: "heavy", reaction: "knockback", pose: { back: -0.25, hold: 0.12, tail: 0.8 } }));
  add("wedge", "Расклинить", "Удар 1,25 за 18 напора даёт 3 трещины. Ты быстрее доводишь шкалу до 5 и надлома брони 50% на 3 хода. Откат 3. Меньше немедленного урона.",
    { powerMultiplier: 1.25, resourceCost: 18, cracks: 3, cooldown: 3, ai: b => gauge(b, "breaker") >= 2 },
    anim("charge", "thrust", "slam", "guard", "cross", { frame: 10, weight: "mid", reaction: "stagger" }));
  add("iron-scree", "Осыпь железа", "Удар 1,85 за 26 напора, по остальным 60%, +35% силы по надломленной броне. Ты даёшь 1 трещину. Откат 3. До обрушения охват слабее.",
    { powerMultiplier: 1.85, resourceCost: 26, aoe: 0.6, cracks: 1, cooldown: 3,
      vsEffect: { id: "armor_break", multiplier: 1.35 }, ai: b => unitHasEffect(b.enemy, "armor_break") || livingFoes(b).length > 1 },
    anim("leap", "proud", "slam", "strike", "shards", { frame: 12, weight: "heavy", reaction: "slam", pose: { drop: true, tail: 0.75 } }));
  add("strip-plate", "Снять пластину", "Удар 2,0 за 16 напора. Ты тратишь все трещины — по 16% пробивания и 6 напора за каждую. После получишь 1 новую трещину. Откат 3. Обрушение откладывается.",
    { powerMultiplier: 2, resourceCost: 16, cooldown: 3, special: "warrior_plate", ai: b => gauge(b, "breaker") >= 2 },
    anim("dash", "guard", "thrust", "hit", "shards", { frame: 9, weight: "mid", reaction: "pull", pose: { lunge: 0.36 } }));

  // GUARDIAN. Bank prevented damage, release part, or cash out the whole debt.
  add("shield-wall", "Стена щитов", "Щит на 150% защиты на 3 хода и 20 напора, цена 14, откат 4. Ты копишь возмездие поглощением. Против врага без атак отдаёшь ход впустую.",
    { attackType: null, targetType: "self", resourceCost: 14, cooldown: 4, specialAction: "light_shield",
      shieldEffect: { id: "shield", duration: 3, valueFormula: { sourceStat: "physicalDefense", multiplier: 1.5, minValue: 18 } },
      on: onAction("shield-wall", b => procMana(b, 0.2)),
      ai: b => !unitHasEffect(b.hero, "shield") && livingFoes(b).some(f => f.intent?.power > 0) },
    anim("self", "guard", "proud", "guard", "ring", { frame: 10, tint: "#a5bec7", pose: { hold: 0.08, tail: 0.7 } }));
  add("catch-rim", "Принять на кант", "Удар 1,45 за 10 напора и стойка. Ты копишь возмездие предотвращённым уроном, не теряя всей атаки. Откат 2. Пробой стойки лишит выплаты.",
    { powerMultiplier: 1.45, resourceCost: 10, cooldown: 2, on: onAction("catch-rim", b => { b.guard = true; }),
      ai: b => !b.guard && physicalIntent(b) },
    anim("walk", "thrust", "strike", "guard", "ring", { frame: 7, tint: "#b7c8ce", pose: { lunge: 0.18 } }));
  add("small-reckoning", "Малая расплата", "Удар 1,5 за 14 напора. Ты тратишь до 20% здоровья из возмездия, добавляя 80% траты к урону. Откат 2. Остаток сохранится; без долга выпуск слаб.",
    { powerMultiplier: 1.5, resourceCost: 14, cooldown: 2, special: "warrior_debt", debtSpend: 0.2, debtScale: 0.8,
      ai: b => gauge(b, "guardian") >= b.hero.maxHp * 0.08 },
    anim("charge", "guard", "strike", "hit", "burst", { frame: 9, weight: "mid", tint: "#c3b99e", reaction: "knockback" }));
  add("closed-bulwark", "Глухой заслон", "Удар 1,5 за 12 напора и щит 8% здоровья; при возмездии от 20% здоровья щит 18%. Ты сохраняешь долг. Откат 3. Для добивания расплата сильнее.",
    { powerMultiplier: 1.5, resourceCost: 12, cooldown: 3,
      on: onAction("closed-bulwark", b => shield(b, gauge(b, "guardian") >= b.hero.maxHp * 0.2 ? 0.18 : 0.08)),
      ai: b => !unitHasEffect(b.hero, "shield") },
    anim("walk", "proud", "thrust", "hit", "ring", { frame: 8, tint: "#b4c9d1" }));
  add("retribution", "Кара стража", "Удар 0,9 за 24 напора. Ты выпускаешь всё возмездие, добавляя 100% долга к урону. Откат 4. После выплаты сохранённый долг больше не усилит защиту.",
    { powerMultiplier: 0.9, resourceCost: 24, cooldown: 4, special: "warrior_debt", debtSpend: 1, debtScale: 1,
      ai: b => gauge(b, "guardian") >= b.hero.maxHp * 0.2 },
    anim("charge", "proud", "slam", "guard", "burst", { frame: 14, weight: "heavy", tint: "#d5c5a0", reaction: "slam", pose: { back: -0.3, hold: 0.12, tail: 0.9 } }));
  add("long-debt", "Долгий долг", "Удар 1,85 за 14 напора; за каждые 10% здоровья в возмездии сила +5%, до +40%. Ты сохраняешь долг. Откат 3. С пустым долгом расплата быстрее.",
    { powerMultiplier: 1.85, resourceCost: 14, cooldown: 3,
      on: onHit("long-debt", (b, s, c) => { c.mult *= 1 + Math.min(0.4, gauge(b, "guardian") / b.hero.maxHp * 0.5); }),
      ai: b => gauge(b, "guardian") >= b.hero.maxHp * 0.1 },
    anim("walk", "proud", "strike", "slam", "ring", { frame: 11, weight: "mid", tint: "#bdc7bd", reaction: "stagger", pose: { hold: 0.09 } }));

  // DUELIST. Parry gives tempo, a critical opening and a concrete enemy window.
  add("riposte", "Выпад с уходом", "Удар 1,5 за 12 напора и парирование следующего физического удара. Ты получишь контратаку, темп и крит. Откат 2, темп 0,8. Против магии защиты нет.",
    { powerMultiplier: 1.5, resourceCost: 12, cooldown: 2, tempo: 0.8, armParry: true,
      ai: b => !b.mech.duelist?.armed && physicalIntent(b) },
    anim("dash", "guard", "thrust", "idle", "slash", { frame: 4, pose: { back: -0.16, tail: 0.45 } }));
  add("take-measure", "Взять меру", "Удар 1,4 за 10 напора, +10% силы за темп. После ты получаешь 1 темп без парирования. Откат 2. Быстро готовишь серию, но оставляешь защиту открытой.",
    { powerMultiplier: 1.4, resourceCost: 10, cooldown: 2,
      on: { ...onHit("take-measure", (b, s, c) => { c.mult *= 1 + gauge(b, "duelist") * 0.1; }),
        ...onAction("take-measure", b => gain(b, "duelist", 1, 3)) }, ai: b => gauge(b, "duelist") < 3 },
    anim("walk", "thrust", "strike", "proud", "slash", { frame: 5, pose: { lunge: 0.16 } }));
  add("flurry-blades", "Вихрь клинка", "Три удара по 0,45 за 24 напора и ещё удар за каждый потраченный темп. Каждое попадание вернёт 14. Откат 3. Ты тратишь весь темп, без него урон мал.",
    { powerMultiplier: 0.45, hits: 3, resourceCost: 24, cooldown: 3, special: "blade_flurry", ai: b => gauge(b, "duelist") >= 2 },
    anim("dash", "thrust", "strike", "thrust", "cross", { frame: 6, pose: { tail: 0.8, stretch: 0.03 } }));
  add("meeting-point", "Острие навстречу", "Удар 1,85 за 14 напора, +30% силы при взведённом парировании. Ты сохраняешь темп и защиту. Откат 2. Без подготовки выгоднее набрать темп.",
    { powerMultiplier: 1.85, resourceCost: 14, cooldown: 2,
      on: onHit("meeting-point", (b, s, c) => { if (b.mech.duelist?.armed) c.mult *= 1.3; }),
      ai: b => Boolean(b.mech.duelist?.armed) || !physicalIntent(b) },
    anim("charge", "thrust", "thrust", "guard", "slash", { frame: 6, weight: "mid", pose: { lunge: 0.4 }, reaction: "knockback" }));
  add("close-line", "Закрыть линию", "Удар 1,8 за 18 напора и парирование. Ты тратишь весь темп — щит 7% здоровья за единицу на 3 хода. Откат 3. Для чистого урона серия выгоднее.",
    { powerMultiplier: 1.8, resourceCost: 18, cooldown: 3, armParry: true, special: "warrior_tempo",
      ai: b => gauge(b, "duelist") >= 1 && (!b.mech.duelist?.armed || hpRatio(b.hero) < 0.6) },
    anim("walk", "thrust", "slam", "guard", "ring", { frame: 10, weight: "mid", tint: "#b4c2c9", pose: { hold: 0.06 } }));
  add("under-arm", "Проход под рукой", "Удар 1,7 за 24 напора, по остальным 55%, +15% силы за сохранённый темп. Ты не взводишь парирование. Откат 3. Против одного врага серия сильнее.",
    { powerMultiplier: 1.7, resourceCost: 24, cooldown: 3, aoe: 0.55,
      on: onHit("under-arm", (b, s, c) => { c.mult *= 1 + gauge(b, "duelist") * 0.15; }),
      ai: b => livingFoes(b).length > 1 || gauge(b, "duelist") >= 2 },
    anim("dash", "guard", "slam", "proud", "slash", { frame: 9, weight: "mid", reaction: "launch", pose: { drop: true, tail: 0.65 } }));

  const tiers = (levels, rows) => levels.map((level, i) => ({ level, options: rows[i].map(id => `warrior-${id}`) }));
  const main = tiers([1, 4, 8, 12, 16, 22], [
    ["raskol", "blunt-drive", "shield-edge"],
    ["sword-arc", "break-ranks", "cut-step"],
    ["hold-line", "double-pressure", "bastion-oath"],
    ["clip-windup", "skullbreaker", "guard-strike"],
    ["poised-blade", "steel-exhale", "lift-visor"],
    ["unbroken-line", "last-blow", "return-blow"]
  ]);
  main[5].needsLane = 2;
  defineSkillTree("warrior", {
    lanes: [
      { name: "Натиск", description: "Держи 70 напора после оплаты. Чередуй точный удар, ослабление и размах, сохраняя усиление." },
      { name: "Пролом", description: "Разгони напор обухом и серией, затем выпусти запас в тяжёлый удар по врагу или строю." },
      { name: "Щитовой ответ", description: "Читай вражеский замах. Блок готовит ответ, раны возвращают напор, передышка спасает от следующего удара." }
    ],
    stages: [
      { owner: "warrior", stage: "class", tiers: main },
      { owner: "fury", stage: "subclass", tiers: tiers([30, 38, 46], [
        ["savage-swing", "shoulder-cut"], ["provoke", "anger-release"], ["blood-sweep", "steady-hands"]
      ]) },
      { owner: "bulwark", stage: "subclass", tiers: tiers([30, 38, 46], [
        ["shield-bash", "shield-step"], ["stone-heel", "mend-breach"], ["falling-wall", "firm-joint"]
      ]) },
      { owner: "berserk", stage: "profession", tiers: tiers([60, 68, 76], [
        ["rend", "danger-close"], ["rip-scar", "teeth-bandage"], ["carnage", "blood-palm"]
      ]) },
      { owner: "breaker", stage: "profession", tiers: tiers([60, 68, 76], [
        ["hammer-blow", "find-seam"], ["shatter-armor", "wedge"], ["iron-scree", "strip-plate"]
      ]) },
      { owner: "guardian", stage: "profession", tiers: tiers([60, 68, 76], [
        ["shield-wall", "catch-rim"], ["small-reckoning", "closed-bulwark"], ["retribution", "long-debt"]
      ]) },
      { owner: "duelist", stage: "profession", tiers: tiers([60, 68, 76], [
        ["riposte", "take-measure"], ["flurry-blades", "meeting-point"], ["close-line", "under-arm"]
      ]) }
    ]
  });
})();
