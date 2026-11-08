// Daggers, chosen victims and the price of leaving cover. Registrations only.
(() => {
  const hidden = b => Boolean(coreState(b)?.hidden);
  const combo = b => Number(b.mech.shade?.value || 0);
  const shades = b => Number(b.mech.phantom?.value || 0);
  const plague = b => Boolean(b.mech.plaguebearer?.plague);
  const energy = (b, amount) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + amount);
    if (b.hero.currentMana > before) emit(b, "mana", { target: "hero", amount: b.hero.currentMana - before });
  };
  const hide = b => {
    const s = coreState(b);
    if (!s) return;
    const changed = !s.hidden;
    s.hidden = true; s.spent = false;
    if (changed) { mechNote(b, "Снова в тени"); fireMech(b, "rehidden"); }
  };
  // Extension never reapplies a dose: elapsedTicks and its rising damage survive.
  const prolong = (b, turns, cap = 6) => {
    const e = getEffect(b.enemy, "poison");
    if (e && Number.isFinite(e.duration)) e.duration = Math.max(e.duration, Math.min(cap, e.duration + turns));
  };
  const poison = (ratio, duration = 3) => eff("poison", duration, dot("physicalDamage", ratio, 3));
  const bleed = (ratio, duration = 3) => eff("bleed", duration, dot("physicalDamage", ratio, 3));
  const shield = (b, ratio) => fx(b, "shield", 3, b.hero.maxHp * ratio, { self: true });

  // Mechanics run first. Remember the cover at the first direct hit, before
  // core_assassin clears it in afterAction; echoes must not overwrite it.
  const hooks = (key, { hit, land, action } = {}) => ({
    beforeHit(b, s, c) {
      if (c.skill?.id !== `assassin-${key}` || !isDirectHit(c)) return;
      if (!s.started) {
        s.started = true; s.hidden = hidden(b); s.combo = combo(b);
        s.shades = shades(b); s.landed = false;
      }
      hit?.(b, s, c);
    },
    afterHit(b, s, c) {
      if (c.skill?.id !== `assassin-${key}` || !isDirectHit(c)) return;
      s.landed = true;
      land?.(b, s, c);
    },
    afterAction(b, s, c) {
      if (c.skill?.id !== `assassin-${key}`) return;
      action?.(b, s, c);
      s.started = false; s.landed = false;
    }
  });
  // One main image per skill. Explicit movement and silhouettes at each call
  // distinguish a quick cut, a protective retreat and a committed execution.
  const anim = (move, before, pose, then2, image, extra = {}) => {
    const range = extra.range || "melee";
    const tint = extra.tint || "#bdc5d0";
    const at = range === "self" ? "self" : "target";
    const weight = extra.weight || "light";
    return {
      range, ...(range === "melee" ? { move } : {}), frame: 7,
      ...(range === "ranged" ? { shot: "knife" } : {}),
      tint, weight, reaction: "stagger",
      anticipate: [{ fx: image === "slash" || image === "cross" ? "glow" : image, at: "self", size: 0.35 }],
      release: [{ fx: image, at, size: 0.65 }],
      impact: [{ fx: image, at, size: weight === "heavy" ? 1.45 : 0.8, delay: 0.04 }],
      ...extra,
      pose: {
        before, pose, then2, lunge: range === "melee" ? 0.25 : 0,
        back: weight === "heavy" ? -0.18 : -0.04,
        tail: weight === "heavy" ? 0.8 : 0.38,
        hold: weight === "heavy" ? 0.09 : 0.02,
        ...(extra.pose || {})
      }
    };
  };
  // Re-register old IDs cleanly: no obsolete stat scaling or branch flags leak
  // into the tree. All eight existing form anchors stay in their original path.
  const add = (key, name, description, spec, animation) => defineTreeSkill("assassin", {
    id: `assassin-${key}`, name, description, attackType: "physical",
    targetType: "enemy", resourceType: "mana", element: "steel",
    powerMultiplier: 1.6, resourceCost: 12, appliedEffects: [], ...spec, anim: animation
  });

  // CLASS: a kill chain, exposed knife pressure, or poison ticking under cover.
  add("shadow-lunge", "Теневой выпад", "Выпад 1,6, яд 14% силы на 2 хода и +22 к шансу крита. Из тени ты получаешь крит и ×1,6. Хорош для входа; вне тени дешевле подхват.",
    { resourceCost: 16, critBonus: 22, appliedEffects: [poison(0.14, 2)] },
    anim("dash", "windup", "thrust", "guard", "slash"));
  add("knife-catch", "Подхват кинжала", "Удар 1,35, темп 0,8, цена 8. Вне тени ты возвращаешь 8 энергии после попадания. В тени возврата нет: для сильного выхода лучше выпад.",
    { powerMultiplier: 1.35, resourceCost: 8, tempo: 0.8,
      on: hooks("knife-catch", { action: (b, s) => { if (s.landed && !s.hidden) energy(b, 8); } }),
      ai: b => !hidden(b) && b.hero.currentMana < 65 },
    anim("walk", "idle", "strike", "thrust", "slash", { frame: 5 }));
  add("venom-fang", "Ядовитый клык", "Удар 1,6 и яд 22% силы на 3 хода. Из тени ты продлеваешь яд ещё на ход, до 6. Откат 2. Против умирающей цели долгое отравление не окупится.",
    { element: "poison", cooldown: 2, appliedEffects: [poison(0.22)],
      on: hooks("venom-fang", { action: (b, s) => { if (s.landed && s.hidden) prolong(b, 1); } }) },
    anim("walk", "guard", "thrust", "idle", "slash", { tint: "#92b65c", frame: 8 }));

  add("cut-route", "Перерезать путь", "Удар 1,65, замедление 25% на 3 хода. Попадание из тени ещё ставит метку +20% урона на 2 хода. Откат 3. Ты готовишь жертву, но не давишь группу.",
    { powerMultiplier: 1.65, cooldown: 3, appliedEffects: [eff("slow", 3, { value: 0.25 })],
      on: hooks("cut-route", { land: (b, s) => { if (s.hidden) fx(b, "mark", 2, 0.2); } }) },
    anim("leap", "air", "strike", "guard", "slash", { frame: 8, pose: { drop: true } }));
  add("double-notch", "Двойная насечка", "Два удара по 0,7. Вне тени сила +20%: ты давишь серией, не тратишь ход на уход. Откат 2, цена 10. По толпе один кинжал за другим медленнее широкой дозы.",
    { powerMultiplier: 0.7, hits: 2, resourceCost: 10, cooldown: 2,
      on: hooks("double-notch", { hit: (b, s, c) => { if (!s.hidden) c.mult *= 1.2; } }) },
    anim("dash", "guard", "strike", "thrust", "cross", { frame: 6 }));
  add("shared-dose", "Доза по кругу", "Удар 1,2, остальным 60%; яд 12% силы на 3 хода всем задетым. Из тени вся атака получает крит и ×1,6. Откат 3. Одиночная доза у клыка крепче.",
    { powerMultiplier: 1.2, aoe: 0.6, element: "poison", resourceCost: 16, cooldown: 3, appliedEffects: [poison(0.12)] },
    anim(null, "windup", "cast", "guard", "fan", { range: "ranged", volley: 3, tint: "#99aa58", frame: 9 }));

  add("rib-step", "Шаг под ребро", "Удар 1,85, рана 18% силы на 3 хода. Из тени удар ещё на 15% сильнее. Откат 3. Ты готовишь рану под будущие криты; бескровная цель её не получит.",
    { powerMultiplier: 1.85, cooldown: 3, resourceCost: 16, element: "blood", appliedEffects: [bleed(0.18)],
      on: hooks("rib-step", { hit: (b, s, c) => { if (s.hidden) c.mult *= 1.15; } }) },
    anim("blink", "guard", "thrust", "strike", "cross", { tint: "#c88786", frame: 9, weight: "mid" }));
  add("catch-wrist", "Перехват кисти", "Удар 1,35 и слабость 25% на 3 хода. Вне тени попадание ещё даёт 15 уклонения на 2 хода. Откат 3. Ты переживаешь ответ ценой прямого давления.",
    { powerMultiplier: 1.35, cooldown: 3, resourceCost: 10, appliedEffects: [eff("weaken", 3, { value: 0.25 })],
      on: hooks("catch-wrist", { action: (b, s) => { if (s.landed && !s.hidden) fx(b, "evasion", 2, 15, { self: true }); } }) },
    anim("walk", "guard", "strike", "guard", "ring", { frame: 6, reaction: "pull" }));
  add("lie-low", "Затаиться", "Ты уходишь в тень, получаешь щит 12% здоровья на 3 хода и продлеваешь яд на 2, до 6. Откат 5, темп 0,75. Без яда и угрозы щиту пропускаешь удар зря.",
    { attackType: null, targetType: "self", resourceCost: 10, cooldown: 5, tempo: 0.75,
      on: hooks("lie-low", { action: b => { hide(b); shield(b, 0.12); prolong(b, 2); } }),
      ai: b => !hidden(b) && (hasFx(b.enemy, "poison") || hpRatio(b.hero) < 0.7) },
    anim(null, "hit", "guard", "idle", "smoke", { range: "self", hop: "blink", tint: "#768273", frame: 8 }));

  add("smoke-cut", "Дымный разрез", "Удар 1,2. После попадания ты уходишь в тень: следующий выход получает крит и ×1,6. Откат 4, цена 16. Уже в тени выгоднее потратить её на сильный приём.",
    { powerMultiplier: 1.2, cooldown: 4, resourceCost: 16,
      on: hooks("smoke-cut", { action: (b, s) => { if (s.landed) hide(b); } }), ai: b => !hidden(b) },
    anim("blink", "thrust", "strike", "guard", "smoke", { frame: 6, tint: "#8f93a6" }));
  add("change-hand", "Сменить руку", "Удар 1,65. Вне тени сразу после другого атакующего навыка ты получаешь темп 0,7 вместо 1. Откат 2. Повтор, стойка и ожидание рвут связку.",
    { powerMultiplier: 1.65, cooldown: 2, resourceCost: 12,
      on: {
        ...hooks("change-hand"),
        afterAction(b, s, c) {
          if (c.skill?.id === "assassin-change-hand") {
            if (s.landed && !s.hidden && s.ready) c.tempo = 0.7;
            s.started = false; s.landed = false;
          }
          s.ready = c.type === "skill" && Boolean(c.skill.attackType) && c.skill.id !== "assassin-change-hand";
        }
      } },
    anim("dash", "thrust", "strike", "idle", "afterimages", { frame: 5, pose: { lunge: 0.34 } }));
  add("bitter-answer", "Горький ответ", "Удар 1,55 и яд 18% силы на 3 хода. Вне тени попадание ещё замедляет цель на 25% на 2 хода. Откат 2. В тени клык оставляет более долгую дозу.",
    { powerMultiplier: 1.55, element: "poison", cooldown: 2, appliedEffects: [poison(0.18)],
      on: hooks("bitter-answer", { land: (b, s) => { if (!s.hidden) fx(b, "slow", 2, 0.25); } }) },
    anim("leap", "guard", "thrust", "air", "slash", { tint: "#a4b863", frame: 7 }));

  add("take-trail", "Взять след", "Удар 1,7; по цели ниже 35% здоровья сила ×1,4. Если цель погибла, ты возвращаешь 20 энергии и получаешь тень от убийства. Откат 3. По здоровой цели слабее.",
    { powerMultiplier: 1.7, cooldown: 3, resourceCost: 16, execute: { threshold: 0.35, multiplier: 1.4 },
      on: hooks("take-trail", { action: (b, s) => { if (s.landed && b.enemy.currentHp <= 0) energy(b, 20); } }) },
    anim("charge", "dash", "thrust", "proud", "slash", { frame: 10, weight: "mid" }));
  add("knife-circle", "Круг кинжалов", "Удар 1,4, остальным 70%. Вне тени сила +25%: ты давишь всю группу, пока уход на откате. Откат 3, цена 18. Одиночную жертву выгоднее добивать точечно.",
    { powerMultiplier: 1.4, aoe: 0.7, resourceCost: 18, cooldown: 3,
      on: hooks("knife-circle", { hit: (b, s, c) => { if (!s.hidden) c.mult *= 1.25; } }) },
    anim("dash", "air", "strike", "slam", "whirl", { frame: 10, weight: "mid", reaction: "knockback" }));
  add("quiet-dose", "Не будить яд", "Бросок 1,2 и яд 14% силы на 3 хода. Если ты начал в тени, после попадания скрытность сохраняется. Откат 3. Слабый бросок не заменяет добивание.",
    { powerMultiplier: 1.2, element: "poison", cooldown: 3, appliedEffects: [poison(0.14)],
      on: hooks("quiet-dose", { action: (b, s) => { if (s.landed && s.hidden) hide(b); } }), ai: b => hidden(b) },
    anim(null, "guard", "thrust", "guard", "slash", { range: "ranged", tint: "#899e68", frame: 5 }));

  add("last-silhouette", "Последний силуэт", "Удар 2,5; из тени по цели ниже 50% здоровья ещё +20% силы. Убийство возвращает тень. Откат 5, цена 30, темп 1,15. По здоровой цели тратишь окно зря.",
    { powerMultiplier: 2.5, cooldown: 5, resourceCost: 30, tempo: 1.15,
      on: hooks("last-silhouette", { hit: (b, s, c) => { if (s.hidden && hpRatio(b.enemy) < 0.5) c.mult *= 1.2; } }) },
    anim("blink", "windup", "slam", "thrust", "cross", { frame: 14, weight: "heavy", reaction: "slam", pose: { drop: true } }));
  add("knife-squall", "Ножевой шквал", "Три удара по 0,85, откат 5, цена 32. Вне тени после попадания ты возвращаешь 25 энергии. В тени серия сильнее, но возврата нет и выход тратится весь.",
    { powerMultiplier: 0.85, hits: 3, cooldown: 5, resourceCost: 32,
      on: hooks("knife-squall", { action: (b, s) => { if (s.landed && !s.hidden) energy(b, 25); } }) },
    anim("charge", "windup", "strike", "thrust", "afterimages", { frame: 12, weight: "heavy", pose: { stretch: 0.05 } }));
  add("mortal-dose", "Смертная доза", "Удар 1,6 и яд 40% силы на 5 ходов. Из тени ты продлеваешь яд ещё на 2, до 7. Откат 5, цена 28. Большая плата не окупится, если жертва скоро погибнет.",
    { powerMultiplier: 1.6, element: "poison", cooldown: 5, resourceCost: 28, appliedEffects: [poison(0.4, 5)],
      on: hooks("mortal-dose", { action: (b, s) => { if (s.landed && s.hidden) prolong(b, 2, 7); } }) },
    anim("walk", "windup", "thrust", "slam", "slash", { tint: "#afc35f", frame: 13, weight: "heavy" }));

  // SHADE: every hit builds, finishers consume; keeping five is a real option.
  add("smoke-step", "Дымный шаг", "Ты получаешь 15 уклонения и ускорение 20% на 2 хода, ещё 2 приёма. Откат 4, темп 0,6. Сам дым не скрывает: ты готовишь добивание ценой удара.",
    { attackType: null, targetType: "self", element: "air", resourceCost: 10, cooldown: 4, tempo: 0.6,
      appliedEffects: [selfEff("evasion", 2, { value: 15 }), selfEff("haste", 2, { value: 0.2 })],
      on: hooks("smoke-step", { action: b => bumpGauge(b, "shade", 2, 5) }),
      ai: b => combo(b) <= 3 && !hasFx(b.hero, "haste") },
    anim(null, "guard", "air", "guard", "smoke", { range: "self", hop: "leap", frame: 6, tint: "#a4a6b1" }));
  add("steal-move", "Кража приёма", "Удар 1,55 собирает приём, крит — два. Вне тени ты получаешь ещё 1 приём после попадания. Откат 1. При пяти приёмах добавка пропадает: пора решать, тратить ли запас.",
    { powerMultiplier: 1.55, resourceCost: 10, cooldown: 1,
      on: hooks("steal-move", { action: (b, s) => { if (s.landed && !s.hidden) bumpGauge(b, "shade", 1, 5); } }) },
    anim("walk", "strike", "thrust", "guard", "cross", { frame: 6 }));
  add("gut-strike", "Удар в печень", "Добивание 1,5: ты тратишь все приёмы, +25% силы за каждый. Откат 2, цена 14. От 3 приёмов выгодно; пустой запас лучше сначала собрать.",
    { powerMultiplier: 1.5, cooldown: 2, resourceCost: 14, special: "finisher", finisher: true },
    anim("dash", "guard", "thrust", "hit", "slash", { frame: 9, weight: "mid", reaction: "knockback" }));
  add("unfinished-chain", "Неполная связка", "Два удара по 0,8 собирают приёмы. Если до атаки их было хотя бы 4, ты возвращаешь 15 энергии после попадания. Откат 2. Запас сохраняешь, большого добивания нет.",
    { powerMultiplier: 0.8, hits: 2, resourceCost: 14, cooldown: 2,
      on: hooks("unfinished-chain", { action: (b, s) => { if (s.landed && s.combo >= 4) energy(b, 15); } }) },
    anim("leap", "strike", "thrust", "strike", "cross", { frame: 8 }));
  add("cut-pursuit", "Отсечь погоню", "Добивание 1,1, остальным 65%; ты тратишь все приёмы, +25% силы за каждый. Откат 4, цена 20. Широкий выход слабее одиночного по одной цели.",
    { powerMultiplier: 1.1, aoe: 0.65, cooldown: 4, resourceCost: 20, special: "finisher", finisher: true },
    anim("leap", "windup", "strike", "slam", "whirl", { frame: 12, weight: "heavy", reaction: "knockback" }));
  add("no-resolution", "Без развязки", "Удар 2,0; при пяти приёмах до атаки сила +25%. Ты сохраняешь весь запас, но не вызываешь казнь. Откат 3, цена 20. Без полного запаса добивание выгоднее.",
    { powerMultiplier: 2, cooldown: 3, resourceCost: 20,
      on: hooks("no-resolution", { hit: (b, s, c) => { if (s.combo >= 5) c.mult *= 1.25; } }) },
    anim("charge", "guard", "thrust", "idle", "cross", { frame: 11, weight: "mid" }));

  // VENOM: new doses reset ramp; extension keeps it. Both lanes work alone.
  add("toxic-cut", "Токсичный порез", "Удар 1,3 и яд 22% силы на 3 хода. Ты складываешь токсин до четырёх доз; по отравленным прямой урон +10%. Откат 2. Новая доза сбрасывает рост тиков.",
    { powerMultiplier: 1.3, element: "poison", cooldown: 2, appliedEffects: [poison(0.22)],
      ai: b => effectValue(b.enemy, "poison") < b.hero.physicalDamage * 0.66 },
    anim("dash", "idle", "strike", "guard", "slash", { tint: "#97b85e", frame: 6 }));
  add("read-tremor", "Проверить дрожь", "Удар 1,8, +25% после двух тиков яда. Если яда нет, ты даёшь дозу 12% силы на 3 хода; старую не обновляешь. Откат 2. Свежий токсин бонуса зрелости не даёт.",
    { powerMultiplier: 1.8, cooldown: 2, resourceCost: 14,
      on: hooks("read-tremor", {
        hit: (b, s, c) => { if (ticksOf(b, "poison") >= 2) c.mult *= 1.25; },
        action: (b, s) => { if (s.landed && !hasFx(b.enemy, "poison")) fx(b, "poison", 3, b.hero.physicalDamage * 0.12); }
      }), ai: b => !hasFx(b.enemy, "poison") || ticksOf(b, "poison") >= 2 },
    anim("walk", "idle", "thrust", "hit", "slash", { frame: 8, weight: "mid" }));
  add("stir-toxin", "Разогнать токсин", "Удар 1,5. После попадания ты продлеваешь яд на 2 хода, до 6, сохраняя рост тиков и четыре дозы токсина. Откат 3. Без яда продлевать нечего.",
    { powerMultiplier: 1.5, resourceCost: 14, cooldown: 3,
      on: hooks("stir-toxin", { action: (b, s) => { if (s.landed) prolong(b, 2); } }), ai: b => hasFx(b.enemy, "poison") },
    anim("blink", "thrust", "thrust", "guard", "ring", { tint: "#9db674", frame: 8 }));
  add("wash-blade", "Промыть лезвие", "Удар 1,4 и новая доза яда 18% силы на 3 хода. После попадания ты ослабляешь весь токсин на 25% ради 20 энергии. Откат 3. Долгое отравление теряет силу.",
    { powerMultiplier: 1.4, element: "poison", resourceCost: 10, cooldown: 3, appliedEffects: [poison(0.18)],
      on: hooks("wash-blade", { action: (b, s) => {
        const e = getEffect(b.enemy, "poison");
        if (s.landed && e) { e.value = Math.max(1, Math.round(e.value * 0.75)); energy(b, 20); }
      } }) },
    anim("walk", "cast", "strike", "thrust", "slash", { tint: "#adbe7c", frame: 7 }));
  add("deep-puncture", "Глубокий прокол", "Удар 1,8 плюс 80% силы текущего токсина, не выше 80% физической силы. Яд остаётся, его бонус +10% работает. Откат 3. Без дозы ты теряешь всю добавку.",
    { powerMultiplier: 1.8, resourceCost: 18, cooldown: 3,
      on: hooks("deep-puncture", { hit: (b, s, c) => { c.flat += Math.min(b.hero.physicalDamage * 0.8, effectValue(b.enemy, "poison") * 0.8); } }) },
    anim("charge", "windup", "thrust", "guard", "slash", { frame: 12, weight: "heavy", tint: "#9eaf69" }));
  add("dead-hour", "Мёртвый час", "Ты уходишь в тень, замедляешь всех на 25% на 2 хода и продлеваешь их яд на ход, до 6. Откат 5, темп 0,7. Токсин работает, но без доз ты лишь уступаешь удар.",
    { attackType: null, targetType: "self", element: "air", resourceCost: 14, cooldown: 5, tempo: 0.7,
      on: hooks("dead-hour", { action: b => { hide(b); eachFoe(b, () => { fx(b, "slow", 2, 0.25); prolong(b, 1); }); } }),
      ai: b => !hidden(b) && hasFx(b.enemy, "poison") },
    anim(null, "windup", "guard", "cast", "smoke", { range: "self", hop: "blink", tint: "#818a72", frame: 11, weight: "mid" }));

  // BLADE: wounds make the forced crit useful before the execute threshold.
  add("twin-fangs", "Два клыка", "Два удара по 0,9, каждый оставляет рану 14% силы на 2 хода и собирает приёмы. Откат 2, цена 14. Крит вскрывает кровь; бескровная цель лишает серию ран.",
    { powerMultiplier: 0.9, hits: 2, effectsPerHit: true, element: "blood", resourceCost: 14, cooldown: 2, appliedEffects: [bleed(0.14, 2)] },
    anim("dash", "windup", "strike", "thrust", "cross", { tint: "#bf747b", frame: 8 }));
  add("execution", "Казнь", "Добивание 1,6, +25% силы за приём, весь запас тратится. Ты казнишь при здоровье цели ≤6% + 2% за приём; у босса порог вдвое ниже. Откат 3. Пустая казнь слаба.",
    { powerMultiplier: 1.6, resourceCost: 20, cooldown: 3, special: "finisher", finisher: true, element: "blood" },
    anim("blink", "windup", "thrust", "proud", "slash", { tint: "#bc606d", frame: 13, weight: "heavy", reaction: "slam" }));
  add("seam-kill", "Зарез по шву", "Добивание 1,3, +25% за приём; ты тратишь запас. По кровоточащей цели гарантирован крит и вскрытие раны; казнь по обычному порогу. Откат 3. Без крови крит не обеспечен.",
    { powerMultiplier: 1.3, resourceCost: 18, cooldown: 3, element: "blood", special: "finisher", finisher: true,
      on: hooks("seam-kill", { hit: (b, s, c) => { if (hasFx(b.enemy, "bleed")) c.forceCrit = true; } }) },
    anim("walk", "guard", "thrust", "slam", "cross", { frame: 10, weight: "mid", tint: "#c97e82" }));
  add("red-step", "Красная ступень", "Удар 1,7 собирает приёмы. По кровоточащей цели попадание лечит тебя на 20% нанесённого урона. Откат 3. Ты сохраняешь запас для казни, но без раны лечения нет.",
    { powerMultiplier: 1.7, resourceCost: 14, cooldown: 3, element: "blood",
      on: hooks("red-step", { land: (b, s, c) => { if (hasFx(b.enemy, "bleed")) healUnit(b, b.hero, c.hpDamage * 0.2, "Красная ступень"); } }) },
    anim("leap", "hit", "thrust", "guard", "slash", { frame: 9, tint: "#bf8e87", weight: "mid" }));
  add("no-breath", "Без права на вдох", "Добивание 1,3, +25% за приём, расход всего запаса и порог казни. Пережившая попадание цель кровоточит 4 хода по 25% силы. Откат 4. Мёртвой цели рана не нужна.",
    { powerMultiplier: 1.3, resourceCost: 22, cooldown: 4, element: "blood", special: "finisher", finisher: true, appliedEffects: [bleed(0.25, 4)] },
    anim("charge", "windup", "slam", "guard", "slash", { frame: 14, weight: "heavy", tint: "#bc6273", reaction: "slam", pose: { drop: true } }));
  add("leap-body", "Перепрыгнуть тело", "Удар 1,85; ниже 30% здоровья цели сила ×1,3. При убийстве ты получаешь 2 приёма для следующей жертвы и тень. Откат 3. Против одиночного босса награда редка.",
    { powerMultiplier: 1.85, resourceCost: 18, cooldown: 3, execute: { threshold: 0.3, multiplier: 1.3 },
      on: hooks("leap-body", { action: (b, s) => { if (s.landed && b.enemy.currentHp <= 0) bumpGauge(b, "shade", 2, 5); } }) },
    anim("leap", "dash", "slam", "air", "afterimages", { frame: 11, weight: "mid", pose: { drop: true }, tint: "#b39aa2" }));

  // PHANTOM: echoes already repeat every physical hit, without spending shades.
  add("shadow-strike", "Удар из тени", "Удар 1,7, темп 0,75. Ты создаёшь 1 тень после атаки; каждая тень повторяет будущие удары с силой 35%. Откат 2. При трёх тенях новая пропадает.",
    { powerMultiplier: 1.7, resourceCost: 14, cooldown: 2, tempo: 0.75, shades: 1, ai: b => shades(b) < 3 },
    anim("blink", "air", "thrust", "guard", "afterimages", { frame: 5, tint: "#a4adc5" }));
  add("vanish", "Исчезновение", "Ты создаёшь 2 тени, получаешь 25 уклонения и ускорение 25% на 3 хода. Откат 5, темп 0,6. Тени повторяют будущие удары; при полном запасе подготовка теряет цену.",
    { attackType: null, targetType: "self", element: "air", resourceCost: 14, cooldown: 5, tempo: 0.6, shades: 2,
      appliedEffects: [selfEff("evasion", 3, { value: 25 }), selfEff("haste", 3, { value: 0.25 })], ai: b => shades(b) < 2 },
    anim(null, "air", "guard", "dash", "afterimages", { range: "self", hop: "blink", frame: 7, tint: "#a3adc3" }));
  add("mirror-nick", "Порез отражения", "Удар 1,4, +10% силы за тень. Ты сохраняешь отражения и их повторы по 35%. Откат 1, цена 8. Без теней дешёвый порез не заменяет создание запаса.",
    { powerMultiplier: 1.4, resourceCost: 8, cooldown: 1,
      on: hooks("mirror-nick", { hit: (b, s, c) => { c.mult *= 1 + s.shades * 0.1; } }) },
    anim("dash", "strike", "thrust", "air", "afterimages", { frame: 6, tint: "#b5bace" }));
  add("break-mirror", "Разбить отражение", "Удар 2,2; при наличии тени сила +25%. После попадания ты теряешь 1 тень, остальные остаются. Откат 3. Выигрываешь сейчас, но будущих повторов меньше.",
    { powerMultiplier: 2.2, resourceCost: 20, cooldown: 3,
      on: hooks("break-mirror", { hit: (b, s, c) => { if (s.shades) c.mult *= 1.25; },
        action: (b, s) => { if (s.landed && s.shades) bumpGauge(b, "phantom", -1, 3); } }) },
    anim("charge", "air", "strike", "hit", "shards", { frame: 12, weight: "heavy", tint: "#bac1d5", reaction: "knockback" }));
  add("converge-mirrors", "Свести отражения", "Удар 1,35, +30% силы за тень, с обычными повторами отражений. После попадания ты теряешь все тени. Откат 5, цена 26. Без запаса это слабый дорогой удар.",
    { powerMultiplier: 1.35, resourceCost: 26, cooldown: 5,
      on: hooks("converge-mirrors", { hit: (b, s, c) => { c.mult *= 1 + s.shades * 0.3; },
        action: (b, s) => { if (s.landed && b.mech.phantom) b.mech.phantom.value = 0; } }), ai: b => shades(b) >= 2 },
    anim("blink", "windup", "strike", "slam", "afterimages", { frame: 14, weight: "heavy", tint: "#c7cede", reaction: "slam" }));
  add("scattered-shades", "Тени вразброс", "Удар 1,35, остальным 65%. Ты сохраняешь повторы теней и создаёшь ещё 1 после атаки, до трёх. Откат 3, цена 20. Против одной цели жертва отражений сильнее.",
    { powerMultiplier: 1.35, aoe: 0.65, resourceCost: 20, cooldown: 3, shades: 1,
      ai: b => livingFoes(b).length > 1 || shades(b) < 3 },
    anim("leap", "guard", "strike", "proud", "afterimages", { frame: 10, weight: "mid", tint: "#a4b4cb", reaction: "knockback" }));

  // POISONER: finite payout uses the engine's value × duration, without ramp.
  add("black-vial", "Чёрный флакон", "Кинжал бьёт на 1,05 и оставляет яд 30% силы на 4 хода. Тики разъедают по 2 защиты, готовя вскрытие. Откат 3, темп 0,8. Прямой удар слаб, дозе нужно время.",
    { powerMultiplier: 1.05, element: "poison", cooldown: 3, tempo: 0.8, appliedEffects: [poison(0.3, 4)],
      ai: b => effectValue(b.enemy, "poison") < b.hero.physicalDamage * 0.6 },
    anim(null, "cast", "thrust", "idle", "slash", { range: "ranged", tint: "#a8b863", frame: 8 }));
  add("dry-incision", "Сухой надрез", "Удар 1,8 плюс тройное разъедание брони, до 60% физической силы. Ты используешь защиту, снятую тиками яда. Откат 2. Свежая чистая броня добавки не даёт.",
    { powerMultiplier: 1.8, resourceCost: 14, cooldown: 2,
      on: hooks("dry-incision", { hit: (b, s, c) => { c.flat += Math.min(b.hero.physicalDamage * 0.6, Number(b.enemy.defShred || 0) * 3); } }) },
    anim("walk", "thrust", "strike", "guard", "slash", { frame: 9, weight: "mid" }));
  add("lance-wound", "Вскрытие раны", "Ты наносишь силу яда × оставшиеся ходы разом, сохраняя яд и скрытность. Откат 3, цена 16. Нужна доза; короткий остаток даёт мало, рост тиков в выплату не входит.",
    { attackType: null, special: "lance_wound", element: "poison", resourceCost: 16, cooldown: 3,
      ai: b => { const e = getEffect(b.enemy, "poison"); return Boolean(e && e.value * e.duration > b.hero.physicalDamage); } },
    anim("walk", "windup", "slam", "hit", "slash", { frame: 13, weight: "heavy", tint: "#b8c175", reaction: "slam" }));
  add("steep-dose", "Настаивать", "Удар 1,6. После попадания ты продлеваешь яд на 2 хода, до 6, сохраняя рост тиков; больше ходов — больше вскрытие. Откат 3. Без яда прибавки к остатку нет.",
    { powerMultiplier: 1.6, resourceCost: 14, cooldown: 3,
      on: hooks("steep-dose", { action: (b, s) => { if (s.landed) prolong(b, 2); } }), ai: b => hasFx(b.enemy, "poison") },
    anim("dash", "cast", "thrust", "guard", "ring", { frame: 9, tint: "#b0bb71" }));
  add("virulence", "Вирулентность", "Удар 1,4, по отравленной цели сила ×1,7 и бонус токсина +10%. Ты используешь разъеденную тиками броню, не обновляя яд. Откат 3. По чистой цели сила невелика.",
    { powerMultiplier: 1.4, element: "poison", resourceCost: 18, cooldown: 3, vsEffect: { id: "poison", multiplier: 1.7 } },
    anim("charge", "windup", "thrust", "proud", "cross", { frame: 12, weight: "heavy", tint: "#a3b55c" }));
  add("drain-sediment", "Слить осадок", "Удар 1,6 плюс две силы яда, до 120% физической силы. Попадание снимает яд и лечит тебя на 8% здоровья. Откат 4. Ты теряешь будущие тики и остаток для вскрытия.",
    { powerMultiplier: 1.6, element: "poison", resourceCost: 18, cooldown: 4,
      on: hooks("drain-sediment", {
        hit(b, s, c) { s.dose = effectValue(b.enemy, "poison"); c.flat += Math.min(b.hero.physicalDamage * 1.2, s.dose * 2); },
        action(b, s) { if (s.landed && s.dose > 0) { removeFx(b.enemy, "poison"); healUnit(b, b.hero, b.hero.maxHp * 0.08, "Слить осадок"); } }
      }), ai: b => hasFx(b.enemy, "poison") && (hpRatio(b.hero) < 0.8 || getEffect(b.enemy, "poison").duration <= 2) },
    anim("blink", "guard", "slam", "thrust", "slash", { frame: 11, weight: "mid", tint: "#a6ad6a", reaction: "pull" }));

  // PLAGUEBEARER: build five ticks, then keep the plague or buy survival with it.
  add("plague-touch", "Касание чумы", "Удар 1,1, яд 24% силы на 3 хода и слабость 20% на 2. Тики копят заражение; от пяти ты получаешь чуму. Откат 3. Прямой урон уступает глубокой ране.",
    { powerMultiplier: 1.1, element: "poison", resourceCost: 14, cooldown: 3, appliedEffects: [poison(0.24), eff("weaken", 2, { value: 0.2 })],
      ai: b => effectValue(b.enemy, "poison") < b.hero.physicalDamage * 0.48 || (!hasFx(b.enemy, "weaken") && hpRatio(b.hero) < 0.75) },
    anim("walk", "hit", "thrust", "cast", "slash", { tint: "#a0ae6c", frame: 7 }));
  add("festering-wound", "Гниющая рана", "Удар 1,2, по отравленной цели ×1,4; рана 20% силы на 3 хода. Два вида тиков быстрее собирают пять заражений. Откат 3. Бескровная цель лишает тебя раны.",
    { powerMultiplier: 1.2, element: "blood", resourceCost: 16, cooldown: 3, vsEffect: { id: "poison", multiplier: 1.4 }, appliedEffects: [bleed(0.2)] },
    anim("leap", "windup", "thrust", "hit", "cross", { tint: "#ad8e70", frame: 10, weight: "mid" }));
  add("infected-circle", "Заражённый круг", "Удар 1,1, остальным 70%; яд 12% и рана 10% силы на 3 хода всем задетым. Ты собираешь заражение с каждого тика. Откат 4. Против одной цели дозы слабые.",
    { powerMultiplier: 1.1, aoe: 0.7, element: "poison", resourceCost: 22, cooldown: 4, appliedEffects: [poison(0.12), bleed(0.1)],
      ai: b => livingFoes(b).length > 1 && livingFoes(b).some(f => !hasFx(f, "poison") || !hasFx(f, "bleed")) },
    anim(null, "air", "cast", "strike", "fan", { range: "ranged", volley: 3, frame: 10, tint: "#a3ac72", weight: "mid" }));
  add("live-through", "Переболеть", "Удар 1,7. До чумы попадание даёт 1 заражение, чума начнётся на тике при пяти. Во время чумы ты лечишься на 8% здоровья. Откат 3. Дозу или рану удар не создаёт.",
    { powerMultiplier: 1.7, resourceCost: 14, cooldown: 3,
      on: hooks("live-through", { action: (b, s) => {
        if (!s.landed) return;
        if (plague(b)) healUnit(b, b.hero, b.hero.maxHp * 0.08, "Переболеть");
        else bumpGauge(b, "plaguebearer", 1, 5);
      } }) },
    anim("dash", "hit", "strike", "guard", "cross", { frame: 8, tint: "#b5b08c" }));
  add("carrier", "Носитель", "Удар 2,0, яд и рана по 15% силы на 3 хода. Во время чумы сила удара +20%, тики сильнее на 50% и лечат. Откат 4, цена 24. Без чумы твой нажим слабее.",
    { powerMultiplier: 2, resourceCost: 24, cooldown: 4, element: "blood", appliedEffects: [poison(0.15), bleed(0.15)],
      on: hooks("carrier", { hit: (b, s, c) => { if (plague(b)) c.mult *= 1.2; } }) },
    anim("charge", "windup", "slam", "strike", "cross", { frame: 13, weight: "heavy", tint: "#b29875", reaction: "slam" }));
  add("break-fever", "Сбросить лихорадку", "Ты сбрасываешь чуму и заражение, лечишь 25% здоровья, получаешь щит 20% на 3 хода и тень. Откат 6. Без чумы недоступно: ты меняешь усиленные тики на спасение.",
    { attackType: null, targetType: "self", element: "air", resourceCost: 16, cooldown: 6, special: "assassin_break_fever",
      ai: b => plague(b) && hpRatio(b.hero) < 0.65 },
    anim(null, "hit", "guard", "proud", "smoke", { range: "self", hop: "leap", frame: 12, weight: "mid", tint: "#a5a18b" }));
  SKILL_ACTIONS.assassin_break_fever = {
    can: b => plague(b) ? { ok: true } : { ok: false, reason: "Сначала нужна чума." },
    run(b) {
      b.mech.plaguebearer.plague = false; b.mech.plaguebearer.value = 0;
      healUnit(b, b.hero, b.hero.maxHp * 0.25, "Сбросить лихорадку");
      shield(b, 0.2); hide(b);
    }
  };

  const tier = (level, ids, extra = {}) => ({ level, options: ids.map(id => `assassin-${id}`), ...extra });
  const path = (owner, stage, rows) => ({ owner, stage, tiers: rows.map(([level, ...ids]) => tier(level, ids)) });
  defineSkillTree("assassin", {
    lanes: [
      { name: "Один за другим", description: "Выбирай раненую жертву. Открой кровь, добей и верни тень; против босса готовь следующий выход дымом." },
      { name: "На виду", description: "Дерись между уходами в тень: дешёвые подхваты, смена руки, ослабление ответа и серии вместо ожидания." },
      { name: "Долгое послевкусие", description: "Дай яду время. Заразить группу, спрятаться, продлить дозу или сохранить тень осторожным броском." }
    ],
    stages: [
      { owner: "assassin", stage: "class", tiers: [
        tier(1, ["shadow-lunge", "knife-catch", "venom-fang"]),
        tier(4, ["cut-route", "double-notch", "shared-dose"]),
        tier(8, ["rib-step", "catch-wrist", "lie-low"]),
        tier(12, ["smoke-cut", "change-hand", "bitter-answer"]),
        tier(16, ["take-trail", "knife-circle", "quiet-dose"]),
        tier(22, ["last-silhouette", "knife-squall", "mortal-dose"], { needsLane: 2 })
      ] },
      path("shade", "subclass", [[30, "smoke-step", "steal-move"], [38, "gut-strike", "unfinished-chain"], [46, "cut-pursuit", "no-resolution"]]),
      path("venom", "subclass", [[30, "toxic-cut", "read-tremor"], [38, "stir-toxin", "wash-blade"], [46, "deep-puncture", "dead-hour"]]),
      path("blade", "profession", [[60, "twin-fangs", "execution"], [68, "seam-kill", "red-step"], [76, "no-breath", "leap-body"]]),
      path("phantom", "profession", [[60, "shadow-strike", "vanish"], [68, "mirror-nick", "break-mirror"], [76, "converge-mirrors", "scattered-shades"]]),
      path("poisoner", "profession", [[60, "black-vial", "dry-incision"], [68, "lance-wound", "steep-dose"], [76, "virulence", "drain-sediment"]]),
      path("plaguebearer", "profession", [[60, "plague-touch", "festering-wound"], [68, "infected-circle", "live-through"], [76, "carrier", "break-fever"]])
    ]
  });
})();

// A blade carries both blood and poison.
["assassin-infected-circle", "assassin-carrier"].forEach((id) => { SKILL_CATALOG[id].element = "steel"; });
