// Heat is both damage and a debt. A tree cast resolves once, before the core
// adds heat; air echoes replay damage, never costs, cooling or recruitment.
(() => {
  const heat = b => Number(coreState(b)?.value || 0);
  const cool = (b, n) => { const s = coreState(b); const used = Math.min(heat(b), Math.max(0, n)); if (s) s.value -= used; return used; };
  const gauge = (b, id) => Number(b.mech[id]?.value || 0);
  const spend = (b, id, n = Infinity) => { const used = Math.min(gauge(b, id), n); if (b.mech[id]) b.mech[id].value -= used; return used; };
  const army = b => (b.hero.summonedUnits || []).filter(u => u.hp > 0);
  const roles = b => new Set(army(b).filter(u => u.type === "spirit").map(u => u.role));
  const cold = b => ["frost", "frostbite", "freeze"].some(id => unitHasEffect(b.enemy, id));
  const burning = b => getEffect(b.enemy, "burn");
  const stacks = b => burning(b) ? getEffectStacks(burning(b)) : 0;
  const shield = (b, ratio) => {
    const value = Math.min(b.hero.maxHp * 0.6, effectValue(b.hero, "shield") + b.hero.maxHp * ratio);
    const e = fx(b, "shield", 3, Math.round(value), { self: true });
    if (e) e.value = Math.min(e.value, Math.round(b.hero.maxHp * 0.6));
  };
  const hit = (b, power, label, element = "arcane") => {
    if (b.enemy.currentHp > 0) performHeroHit(b, { kind: "magic", power, label, element, sure: true, noEcho: true, proc: true });
  };
  const unit = (role, type = "spirit", duration = 4, power = 0.28, hp = 0.5, taunt = 0) => ({
    type, role, duration, taunt,
    name: ({ guardian: "Дух-хранитель", healer: "Дух-целитель", energy: "Дух энергии", attacker: type === "undead" ? "Костяной слуга" : "Боевой дух", tank: "Зомби", minion: "Теневой слуга" })[role],
    hpFormula: { sourceStat: "shieldPower", multiplier: hp, minValue: 12 },
    actionPowerFormula: { sourceStat: ["healer", "energy"].includes(role) ? "healingPower" : role === "guardian" ? "shieldPower" : "skillDamage", multiplier: power, minValue: role === "minion" ? 1 : 5 }
  });
  const recruit = (b, skill, config) => {
    const u = makeSummon({ ...skill, summonUnitConfig: config }, b.hero);
    if (addSummon(b, u)) { emit(b, "summon", { kind: u.type }); return u; }
    return null;
  };
  // Voluntary dismissal has no summonDeath: neither bones nor death refunds.
  const dismiss = (b, units) => {
    b.hero.summonedUnits = (b.hero.summonedUnits || []).filter(u => !units.includes(u));
    if (units.length) emit(b, "summonGone", { sacrifice: true });
  };
  const onHit = (id, fn) => ({ beforeHit(b, s, c) { if (c.skill?.id === `mage-${id}` && !c.proc) fn(b, s, c); } });
  const burn = (n = 1, duration = 2, power = 0.18) => eff("burn", duration, { ...dot("skillDamage", power, 4), meta: { stacks: n } });

  SKILL_ACTIONS.mage_tree_cast = {
    run(b, skill) {
      const plan = skill.prepare?.(b, skill) || {};
      if (skill.attackType) performSkillDamage(b, skill, plan.scale ?? 1, plan);
      else {
        if (skill.selfHealMultiplier) healUnit(b, b.hero, getSkillSelfHealAmount(skill, b.hero), skill.name);
        if (skill.aoe) eachFoe(b, () => applySkillEffects(b, skill, b.hero, b.enemy));
        else applySkillEffects(b, skill, b.hero, b.enemy);
      }
      if (skill.summonUnitConfig) recruit(b, skill, skill.summonUnitConfig);
      skill.resolve?.(b, skill, plan);
    }
  };

  // Each call chooses its own body gesture and one main image. Small casts use
  // short anticipation; capstones plant the staff and visibly finish the motion.
  const anim = (before, pose, then2, image, tint, extra = {}) => {
    const { pose: body, ...staging } = extra;
    const at = extra.range === "self" ? "self" : extra.aoe ? "allFoes" : "target";
    return {
      range: "ranged", shot: "bolt", frame: 7, weight: "light", tint,
      pose: { before, pose, then2, back: -0.05, lunge: 0, tail: 0.5, ...body },
      anticipate: [{ fx: image, at: "self", color: tint, size: 0.25 }],
      release: [{ fx: image, at, color: tint, size: 0.85 }],
      impact: [{ fx: image, at, color: tint, size: 0.4, delay: 0.08 }],
      reaction: "stagger", ...staging
    };
  };
  const add = (id, name, description, spec, animation) => defineTreeSkill("mage", {
    id: `mage-${id}`, name, description, category: "active", attackType: "skill", element: "arcane",
    resourceType: "mana", resourceCost: 12, powerMultiplier: 1.5, targetType: "enemy",
    appliedEffects: [], special: "mage_tree_cast", ...spec, anim: animation
  });

  // CLASS: keep the heat / cycle it / bank it for control.
  add("ether-beam", "Луч эфира", "Ты бьёшь лучом 1,75 за 16 маны: +22 жара. От 45 жара пробиваешь ещё 25% защиты. Силен на разогреве; в холоде бонуса нет.",
    { powerMultiplier: 1.75, resourceCost: 16, appliedEffects: [eff("exposed", 2, { value: 8, chance: 0.4 })],
      on: onHit("ether-beam", (b, s, c) => { if (heat(b) >= 45) c.pierce += 0.25; }) },
    anim("idle", "thrust", "cast", "pillar", "#bca1ff", { frame: 5 }));
  add("cooling-spark", "Стынущая искра", "Удар 1,35 за 10 маны. Ты снимаешь до 22 жара после попадания, затем цена добавит 14. На горячем томе экономит передышку; холодный удар слаб.",
    { powerMultiplier: 1.35, resourceCost: 10, resolve: b => cool(b, 22) },
    anim("guard", "cast", "idle", "smoke", "#a4dce4", { shot: "orb", frame: 4 }));
  add("heat-seal", "Печать жара", "Удар 1,35 за 8 маны: +11 жара. Ты ставишь метку: +15% входящего урона на 2 хода. Готовит продолжение; для последнего удара луч сильнее.",
    { powerMultiplier: 1.35, resourceCost: 8, appliedEffects: [eff("mark", 2, { value: 0.15 })] },
    anim("cast", "guard", "thrust", "sigil", "#dcb96f", { shot: "none", frame: 6 }));

  add("book-fan", "Веер из тома", "Ты бьёшь 1,25, остальных — на 65%. Цена 14 маны: +20 жара, откат 1. Разгоняешься против группы; по одной цели закалка сильнее.",
    { powerMultiplier: 1.25, resourceCost: 14, aoe: 0.65, cooldown: 1 },
    anim("windup", "cast", "strike", "fan", "#d39bfb", { aoe: true, volley: 3 }));
  add("ether-temper", "Закалка эфира", "Удар 1,8 за 20 маны: +28 жара, откат 1. Пока жара не больше 20, сила +25%. Ты разгоняешь холодный том; в длинной горячей серии бонус исчезнет.",
    { powerMultiplier: 1.8, resourceCost: 20, cooldown: 1,
      on: onHit("ether-temper", (b, s, c) => { if (heat(b) <= 20) c.mult *= 1.25; }) },
    anim("proud", "thrust", "guard", "cross", "#9ee9ed", { shot: "none", frame: 8, weight: "mid" }));
  add("static-clasp", "Статический захват", "Разряд 1,9 за 16 маны: +22 жара, шанс оглушить 40%. Откат 3. Ты срываешь опасный ответ; против слабой цели выгоднее быстрый разгон.",
    { powerMultiplier: 1.9, resourceCost: 16, cooldown: 3, appliedEffects: [eff("stun", 1, { value: 1, chance: 0.4 })] },
    anim("guard", "thrust", "hit", "lightning", "#dfd990", { shot: "none", reaction: "knockback", frame: 9, weight: "mid" }));

  add("heated-tome", "Раскалённый том", "Удар 1,6 за 10 маны, откат 2. Ты добавляешь ещё 14 жара сверх 14 за цену. Быстро выходишь к сильной магии; перед порогом срыва это опасно.",
    { powerMultiplier: 1.6, resourceCost: 10, cooldown: 2,
      resolve(b) { if (coreState(b)) coreState(b).value += 14; }, ai: b => heat(b) < 45 },
    anim("hit", "proud", "cast", "flames", "#ed9668", { shot: "orb", frame: 10, weight: "mid" }));
  add("heat-siphon", "Теплосъём", "Удар 1,35 за 8 маны. Ты снимаешь до 30 жара и возвращаешь по 0,3% маны за единицу, затем +11 жара за цену. Откат 2. Без жара возврата нет.",
    { powerMultiplier: 1.35, resourceCost: 8, cooldown: 2,
      resolve(b) { procMana(b, cool(b, 30) * 0.003); }, ai: b => heat(b) >= 20 },
    anim("cast", "thrust", "proud", "whirl", "#86d7cd", { shot: "none", reaction: "pull", frame: 6 }));
  add("rune-shutter", "Рунный затвор", "Удар 1,2 и немота на 2 хода за 12 маны. Ты тратишь до 40 жара на щит: 0,3% здоровья за единицу, затем +17 жара. Откат 3. В холоде щита нет.",
    { powerMultiplier: 1.2, cooldown: 3, appliedEffects: [eff("silence", 2, { value: 1 })],
      resolve(b) { shield(b, cool(b, 40) * 0.003); }, ai: b => heat(b) >= 35 || (b.intent?.kind === "magic" && !hasFx(b.enemy, "silence")) },
    anim("thrust", "guard", "cast", "ring", "#dbc88e", { shot: "none", frame: 9 }));

  add("noon-needle", "Игла полудня", "Удар 2,15 за 18 маны: +25 жара, откат 3. От 50 жара ты пробиваешь ещё 40% защиты. Сильнее на горячем томе, но легко пересечь порог срыва.",
    { powerMultiplier: 2.15, resourceCost: 18, cooldown: 3,
      on: onHit("noon-needle", (b, s, c) => { if (heat(b) >= 50) c.pierce += 0.4; }) },
    anim("windup", "thrust", "idle", "shards", "#ffc795", { frame: 11, weight: "mid" }));
  add("thermal-drop", "Резкий перепад", "Удар 1,9 за 18 маны: +25 жара, откат 3. При жаре до 25 сила +25% и иней на 2 хода. Ты награждаешь охлаждение; на горячем томе нет инея.",
    { powerMultiplier: 1.9, resourceCost: 18, cooldown: 3,
      prepare: b => ({ chilled: heat(b) <= 25 }),
      on: onHit("thermal-drop", (b, s, c) => { if (heat(b) <= 25) c.mult *= 1.25; }),
      resolve(b, skill, p) { if (p.chilled && b.enemy.currentHp > 0) fx(b, "frost", 2, 0.2); } },
    anim("air", "slam", "guard", "burst", "#b4eff4", { shot: "none", hop: "leap", frame: 10, weight: "mid", reaction: "slam" }));
  add("binding-reserve", "Запас в переплёте", "Ты тратишь до 40 жара: щит 15% здоровья и ещё 0,3% за единицу, возврат 16% маны. Цена 0, откат 4. Урона нет; без жара и при полных запасах рано.",
    { attackType: null, targetType: "self", resourceCost: 0, cooldown: 4,
      resolve(b) { shield(b, 0.15 + cool(b, 40) * 0.003); procMana(b, 0.16); },
      ai: b => heat(b) >= 35 && (hpRatio(b.hero) < 0.85 || b.hero.currentMana < b.hero.maxMana * 0.65) },
    anim("guard", "proud", "idle", "sigil", "#e8d5ab", { range: "self", shot: "none", frame: 10, pose: { hold: 0.08, tail: 0.7 } }));

  add("red-line", "Красная строка", "Удар 1,65 за 12 маны, откат 2. Если перед ним 45–75 жара, ты отводишь весь жар его цены. Удерживает горячую серию; вне окна добавит обычные 17.",
    { powerMultiplier: 1.65, cooldown: 2, prepare: b => ({ held: heat(b) >= 45 && heat(b) <= 75 }),
      resolve(b, skill, p) { if (p.held) cool(b, heatOfSkill(skill, b.hero) * (1 + tm(b.hero, "heatGain"))); },
      ai: b => heat(b) >= 45 && heat(b) <= 71 },
    anim("proud", "cast", "thrust", "pillar", "#ffbb84", { shot: "none", frame: 9, weight: "mid" }));
  add("steam-circle", "Паровой круг", "Удар 1,6, остальные получают 50%. Ты снимаешь до 35 жара после удара, затем цена добавит 20. Цена 14 маны, откат 3. В холоде теряешь охлаждение.",
    { powerMultiplier: 1.6, resourceCost: 14, aoe: 0.5, cooldown: 3, resolve: b => cool(b, 35), ai: b => heat(b) >= 30 },
    anim("guard", "slam", "proud", "wave", "#b2d7e5", { shot: "none", aoe: true, frame: 11, weight: "mid", reaction: "knockback" }));
  add("seal-press", "Продавить печать", "Удар 2,1 за 20 маны, откат 3. Ты тратишь 40 жара до удара ради 65% пробивания; затем +28 жара. Без 40 жара расхода и пробивания нет.",
    { powerMultiplier: 2.1, resourceCost: 20, cooldown: 3,
      prepare(b) { return heat(b) >= 40 ? (cool(b, 40), { pierce: 0.65 }) : {}; }, ai: b => heat(b) >= 40 },
    anim("windup", "slam", "thrust", "sigil", "#e6b763", { shot: "none", frame: 12, weight: "mid", reaction: "slam" }));

  add("white-heat", "Белый накал", "Удар 2,65 за 26 маны, откат 5. От 55 жара сила +12%. После удара ты снижаешь жар до 35, затем +36 за цену. В холоде дорог и без бонуса.",
    { powerMultiplier: 2.65, resourceCost: 26, cooldown: 5,
      on: onHit("white-heat", (b, s, c) => { if (heat(b) >= 55) c.mult *= 1.12; }),
      resolve: b => cool(b, Math.max(0, heat(b) - 35)), ai: b => heat(b) >= 50 },
    anim("windup", "proud", "slam", "pillar", "#fff1c8", { shot: "none", frame: 14, weight: "heavy", reaction: "slam", pose: { back: -0.2, hold: 0.12, tail: 0.85 } }));
  add("zero-burst", "Нулевой всплеск", "Ты сбрасываешь весь жар: удар 2,3, +0,5% силы за единицу, до +30%. Остальным 65%. Цена 24 маны: +34 жара, откат 5. Без запаса слабее.",
    { powerMultiplier: 2.3, resourceCost: 24, aoe: 0.65, cooldown: 5,
      prepare: b => ({ scale: 1 + Math.min(0.3, cool(b, heat(b)) * 0.005) }), ai: b => heat(b) >= 35 },
    anim("air", "cast", "slam", "ring", "#d2f9ff", { shot: "none", aoe: true, hop: "blink", frame: 13, weight: "heavy", reaction: "launch", pose: { hold: 0.1, tail: 0.8 } }));
  add("ban-field", "Поле запрета", "Удар 2,05, остальным 60%, немота на 2 хода. Ты тратишь до 50 жара: по 1% пробивания за единицу. Цена 22 маны: +31 жара, откат 5. В холоде без пробоя.",
    { powerMultiplier: 2.05, resourceCost: 22, aoe: 0.6, cooldown: 5, appliedEffects: [eff("silence", 2, { value: 1 })],
      prepare: b => ({ pierce: cool(b, 50) * 0.01 }), ai: b => heat(b) >= 35 },
    anim("cast", "proud", "guard", "void", "#e3b87c", { shot: "none", aoe: true, frame: 14, weight: "heavy", reaction: "pull", pose: { back: -0.14, hold: 0.12, tail: 0.8 } }));

  // ELEMENTAL: a stable series versus fast building and spending.
  add("elemental-surge", "Вспышка стихий", "Удар 2,0, остальным 50%, +1 резонанс, до 5: по +4% магии. Цена 15 маны, откат 2. Ты сохраняешь серию; обычный удар сбросит её.",
    { powerMultiplier: 2, resourceCost: 15, aoe: 0.5, cooldown: 2 },
    anim("windup", "cast", "proud", "burst", "#bc91ef", { shot: "orb", aoe: true, frame: 10, weight: "mid" }));
  add("conductor", "Проводник", "Удар 1,3 за 8 маны. Ты получаешь 2 резонанса вместо 1, до 5: по +4% магии за единицу. Слабее сейчас, быстрее готовит сильную серию.",
    { powerMultiplier: 1.3, resourceCost: 8, resolve(b) { if (b.mech.elemental) addGauge(b.mech.elemental, 1, 5); }, ai: b => gauge(b, "elemental") < 4 },
    anim("idle", "cast", "thrust", "lightning", "#b1bbea", { frame: 5 }));
  add("resonance-release", "Снять резонанс", "Удар 1,8 за 18 маны, откат 3. Ты тратишь резонанс: +12% силы за единицу, до +60%. Забираешь урон сейчас, теряешь усиление следующих заклинаний.",
    { powerMultiplier: 1.8, resourceCost: 18, cooldown: 3, prepare: b => ({ scale: 1 + spend(b, "elemental") * 0.12 }), ai: b => gauge(b, "elemental") >= 3 },
    anim("guard", "slam", "hit", "shards", "#d9a9ff", { shot: "orb", frame: 11, weight: "mid", reaction: "knockback" }));
  add("quiet-circuit", "Контур тишины", "Удар 1,45 за 12 маны, откат 2. Ты снимаешь до 25 жара перед нагревом цены и получаешь 1 резонанс. Сохраняет серию; без жара урон скромный.",
    { powerMultiplier: 1.45, cooldown: 2, resolve: b => cool(b, 25), ai: b => heat(b) >= 25 },
    anim("thrust", "cast", "guard", "whirl", "#91d2d8", { shot: "none", frame: 7 }));
  add("five-facets", "Пять граней", "Удар 1,7, остальным 70%, +1 резонанс. При 4–5 резонанса ты пробиваешь ещё 50% защиты, сохраняя шкалу. Цена 20 маны, откат 4. Начинать серию рано.",
    { powerMultiplier: 1.7, resourceCost: 20, aoe: 0.7, cooldown: 4,
      on: onHit("five-facets", (b, s, c) => { if (gauge(b, "elemental") >= 4) c.pierce += 0.5; }), ai: b => gauge(b, "elemental") >= 3 },
    anim("proud", "cast", "slam", "fan", "#e3c2ff", { shot: "none", volley: 5, aoe: true, frame: 12, weight: "heavy" }));
  add("reverse-current", "Обратный ток", "Удар 1,6 без цены, откат 4. Ты тратишь резонанс: по 3% маны и −5 жара за единицу; удар начнёт шкалу с 1. При полных запасах отдаёшь серию зря.",
    { powerMultiplier: 1.6, resourceCost: 0, cooldown: 4,
      prepare(b) { const n = spend(b, "elemental"); cool(b, n * 5); procMana(b, n * 0.03); return {}; },
      ai: b => gauge(b, "elemental") >= 2 && (heat(b) >= 30 || b.hero.currentMana < b.hero.maxMana * 0.6) },
    anim("cast", "thrust", "guard", "wave", "#9fcbdc", { shot: "none", reaction: "pull", frame: 8 }));

  // SUMMONER: maintain a living bond versus spend its remaining service.
  add("soul-tether", "Нить души", "Удар 1,4 и лечение 0,35 за 14 маны, откат 2. Каждое твоё существо отводит 6 жара перед нагревом цены. Без существ нет охлаждения, без ран теряешь лечение.",
    { powerMultiplier: 1.4, resourceCost: 14, cooldown: 2, selfHealMultiplier: 0.35, element: "dark", resolve: b => cool(b, army(b).length * 6) },
    anim("guard", "cast", "hit", "chain", "#b2a3db", { shot: "none", frame: 8, reaction: "pull" }));
  add("familiar", "Фамильяр", "Ты зовёшь хранителя на 4 хода: щит 35% силы щита за ход, сразу щит 15% здоровья. Он даёт +6% урона Связи. Цена 12, откат 3. Занимает место существа.",
    { attackType: null, targetType: "self", resourceCost: 12, cooldown: 3, summonUnitConfig: unit("guardian", "spirit", 4, 0.35, 0.65), resolve: b => shield(b, 0.15),
      ai: b => !army(b).some(u => u.role === "guardian") || hpRatio(b.hero) < 0.55 },
    anim("idle", "proud", "guard", "glow", "#c9d5ef", { range: "self", shot: "none", frame: 10 }));
  add("summoning-spark", "Искра призыва", "Удар 1,2 и боевой дух на 3 хода: по 24% магии за ход. Ты получаешь +6% урона Связи за существо. Цена 14, откат 2. Полный круг вытеснит старейшего.",
    { powerMultiplier: 1.2, resourceCost: 14, cooldown: 2, summonUnitConfig: unit("attacker", "spirit", 3, 0.24), ai: b => army(b).length < getSummonLimit(b.hero) },
    anim("thrust", "proud", "cast", "sigil", "#aebaf6", { shot: "orb", frame: 9 }));
  add("bond-bell", "Набат связи", "Удар 1,45 и дух энергии на 3 хода: мана 25% силы лечения за ход. Существо даёт +6% урона Связи. Цена 18, откат 3. Долгий бой окупит слабый удар.",
    { powerMultiplier: 1.45, resourceCost: 18, cooldown: 3, summonUnitConfig: unit("energy", "spirit", 3, 0.25), ai: b => !army(b).some(u => u.role === "energy") && army(b).length < getSummonLimit(b.hero) },
    anim("cast", "proud", "thrust", "ring", "#96d8b7", { shot: "orb", frame: 10 }));
  add("command", "Приказ связи", "Удар 1,7 за 20 маны, откат 3. За каждое твоё существо сила +13% сверх Связи. Ты сохраняешь круг; без существ дорогой приказ слабее обычной атаки навыком.",
    { powerMultiplier: 1.7, resourceCost: 20, cooldown: 3, prepare: b => ({ scale: 1 + Math.min(5, army(b).length) * 0.13 }), ai: b => army(b).length >= 1 },
    anim("proud", "thrust", "cast", "fan", "#c2a3e7", { shot: "none", frame: 11, weight: "mid" }));
  add("release-bond", "Отпустить связь", "Удар 1,9 за 12 маны, откат 3. Ты распускаешь старейшее существо: +12% маны и −25 жара до нагрева цены. Теряешь его службу и бонус Связи; гибели нет.",
    { powerMultiplier: 1.9, cooldown: 3,
      resolve(b) { const u = army(b).find(u => !u.persistent); if (u) { dismiss(b, [u]); procMana(b, 0.12); cool(b, 25); } },
      ai: b => army(b).some(u => !u.persistent && u.duration <= 2) || (army(b).length > 0 && heat(b) >= 35) },
    anim("hit", "cast", "idle", "smoke", "#bfaddd", { shot: "orb", frame: 9, reaction: "pull" }));

  // TWILIGHT: change sides through useful actions, or press the present side.
  add("dusk-ray", "Сумеречный луч", "Удар 1,6 и слабость 20% на 2 хода. После света ты бьёшь на 25% сильнее и уходишь в тьму. Цена 14 маны, откат 2. Повтор не получает бонус смены.",
    { powerMultiplier: 1.6, resourceCost: 14, cooldown: 2, element: "holy", appliedEffects: [eff("weaken", 2, { value: 0.2 })] },
    anim("cast", "thrust", "hit", "cross", "#cbb5db", { frame: 8 }));
  add("first-dawn", "Первая заря", "Лечение 0,85 и щит 15% здоровья за 14 маны, откат 2. После тьмы лечение +25%; ты переходишь к свету. Нет удара, зато следующий тёмный сильнее на 25%.",
    { attackType: null, targetType: "self", element: "holy", resourceCost: 14, cooldown: 2, selfHealMultiplier: 0.85, resolve: b => shield(b, 0.15),
      ai: b => hpRatio(b.hero) < 0.78 || (b.mech.light_dark?.side !== "light" && !hasFx(b.hero, "shield")) },
    anim("guard", "cast", "proud", "glow", "#fff0bb", { range: "self", shot: "none", frame: 8 }));
  add("between-lines", "Между строк", "Удар 1,4 и лечение 0,35 за 12 маны, откат 2. После действия ты оставляешь светлую сторону для следующего удара +25%. Меньше прямого урона ради перехода.",
    { powerMultiplier: 1.4, selfHealMultiplier: 0.35, cooldown: 2, element: "holy",
      on: { afterAction(b, s, c) { if (c.skill?.id === "mage-between-lines" && b.mech.light_dark) b.mech.light_dark.side = "light"; } },
      ai: b => b.mech.light_dark?.side !== "light" },
    anim("thrust", "cast", "proud", "wave", "#e8d7c4", { shot: "none", frame: 6 }));
  add("midday-night", "Ночь в полдень", "Удар 2,1 за 18 маны, откат 3. После света ты получаешь +25% урона Сумерек и ещё 30% пробивания. Уходишь в тьму; без перехода пробивания нет.",
    { powerMultiplier: 2.1, resourceCost: 18, cooldown: 3, element: "dark",
      on: onHit("midday-night", (b, s, c) => { if (b.mech.light_dark?.side === "light") c.pierce += 0.3; }) },
    anim("proud", "slam", "cast", "void", "#a696cf", { shot: "orb", frame: 11, weight: "mid", reaction: "pull" }));
  add("eclipse", "Затмение", "Удар 1,65, остальным 65%, слабость 20% на 2 хода. После света ты усиливаешь весь удар на 25% и уходишь в тьму. Цена 20 маны, откат 3. По одному слабее ночи.",
    { powerMultiplier: 1.65, resourceCost: 20, aoe: 0.65, cooldown: 3, element: "dark", appliedEffects: [eff("weaken", 2, { value: 0.2 })] },
    anim("windup", "guard", "proud", "ring", "#b6a0d8", { shot: "none", aoe: true, frame: 12, weight: "mid" }));
  add("page-turn", "Оборот страницы", "Лечение 1,1 и импульс 0,9 за 14 маны, откат 3. Ты переходишь к свету; после тьмы лечение +25%. Сильная передышка под рану, без ран часть хода пропадает.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.1, resourceCost: 14, cooldown: 3, element: "holy", resolve: b => hit(b, 0.9, "Оборот страницы", "holy"),
      ai: b => hpRatio(b.hero) < 0.85 && b.mech.light_dark?.side !== "light" },
    anim("hit", "proud", "guard", "flash", "#f9e9c9", { shot: "none", frame: 10, weight: "mid" }));

  // FIRE: build detonation, or salvage the unfinished fire.
  add("firebolt", "Огненная стрела", "Удар 1,82 за 16 маны и 1 стак горения на 2 хода: тик 18% магии. Ты ведёшь к детонации на 4 стаках. По горящей цели +10% урона; толпу не задевает.",
    { powerMultiplier: 1.82, resourceCost: 16, element: "fire", appliedEffects: [burn()] },
    anim("idle", "thrust", "guard", "flames", "#f7a363", { frame: 5 }));
  add("smoke-letter", "Дымная буква", "Удар 1,35, остальным 60%, горение на 3 хода: 1 стак, тик 15% магии. Ты готовишь детонации в группе. Цена 18, откат 2. Одну цель стрела жжёт сильнее.",
    { powerMultiplier: 1.35, resourceCost: 18, cooldown: 2, aoe: 0.6, element: "fire", appliedEffects: [burn(1, 3, 0.15)] },
    anim("guard", "cast", "strike", "smoke", "#d98b63", { shot: "none", aoe: true, frame: 8 }));
  add("cinder-wave", "Волна углей", "Удар 1,45, остальным 65%, 2 стака горения на 2 хода: тик 14% магии. Ты ускоряешь детонацию. Цена 19, откат 2. Прямое добивание слабее снятия нагара.",
    { powerMultiplier: 1.45, resourceCost: 19, cooldown: 2, aoe: 0.65, element: "fire", appliedEffects: [burn(2, 2, 0.14)] },
    anim("windup", "slam", "cast", "flames", "#ee8b48", { shot: "none", aoe: true, frame: 11, weight: "mid", reaction: "knockback" }));
  add("strip-soot", "Снять нагар", "Удар 2,1 за 12 маны, откат 3. Ты снимаешь горение до удара: +8% силы и −8 жара за стак. Не ждёшь детонации, но теряешь стаки и +10% по горящей цели.",
    { powerMultiplier: 2.1, cooldown: 3, element: "fire",
      prepare(b) { const n = Math.min(4, stacks(b)); b.enemy.effects = b.enemy.effects.filter(e => e.id !== "burn"); cool(b, n * 8); return { scale: 1 + n * 0.08 }; },
      ai: b => stacks(b) >= 2 && (heat(b) >= 25 || b.enemy.currentHp < b.enemy.maxHp * 0.4) },
    anim("cast", "thrust", "slam", "shards", "#e4a076", { shot: "none", frame: 9, weight: "mid", reaction: "pull" }));
  add("sun-furnace", "Солнечная топка", "Удар 2,05 и 2 стака горения на 3 хода: тик 20% магии. Ты доводишь старый огонь до детонации. Цена 24, откат 4. Дорого, если цель не доживёт до взрыва.",
    { powerMultiplier: 2.05, resourceCost: 24, cooldown: 4, element: "fire", appliedEffects: [burn(2, 3, 0.2)] },
    anim("windup", "proud", "cast", "flames", "#ffe4a0", { shot: "orb", frame: 14, weight: "heavy", reaction: "slam", pose: { hold: 0.12, tail: 0.8 } }));
  add("quiet-embers", "Тихое горение", "Удар 1,75 за 16 маны, откат 3. Ты продлеваешь горение на 2 хода, до 5, снимаешь до 30 жара перед нагревом цены. Новых стаков нет; без огня продлевать нечего.",
    { powerMultiplier: 1.75, resourceCost: 16, cooldown: 3, element: "fire",
      resolve(b) { const e = burning(b); if (e) e.duration = Math.min(5, e.duration + 2); cool(b, 30); }, ai: b => Boolean(burning(b)) || heat(b) >= 30 },
    anim("guard", "thrust", "proud", "glow", "#cf895a", { shot: "none", frame: 8 }));

  // WATER: a cold window for damage or for recovery.
  add("ice-lance", "Ледяное копьё", "Удар 1,7 за 15 маны, иней 20% на 2 хода и +1 холод. Ты готовишь обморожение на 3 холоде; по заморозке +50% урона. Не возвращает здоровье.",
    { powerMultiplier: 1.7, resourceCost: 15, chill: 1, element: "frost", appliedEffects: [eff("frost", 2, { value: 0.2 })] },
    anim("guard", "thrust", "idle", "shards", "#b0e7fb", { frame: 5 }));
  add("thaw-needle", "Талая игла", "Удар 1,25, лечение 0,55 и +1 холод за 18 маны, откат 2. Пока цель скована холодом, твоё лечение +25%. Платишь уроном ради раны; при полном здоровье слабее копья.",
    { powerMultiplier: 1.25, selfHealMultiplier: 0.55, resourceCost: 18, cooldown: 2, chill: 1, element: "water" },
    anim("cast", "thrust", "idle", "wave", "#9edee8", { shot: "orb", frame: 6 }));
  add("ice-prison", "Ледяная темница", "Удар 1,3 и заморозка обмороженной цели на ход; на боссе шанс 50%. Ты готовишь следующий удар +50%. Цена 20, откат 4. Без обморожения применить нельзя.",
    { powerMultiplier: 1.3, resourceCost: 20, cooldown: 4, element: "frost", special: "freeze" },
    anim("proud", "guard", "cast", "spikes", "#b9eeff", { shot: "none", frame: 12, weight: "mid" }));
  add("icy-trail", "Обледенелый след", "Удар 1,5, остальным 65%, иней 20% на 2 хода и +2 холода. Ты быстрее готовишь обморожение. Цена 18, откат 3. Не даёт немедленного пропуска хода врага.",
    { powerMultiplier: 1.5, resourceCost: 18, cooldown: 3, aoe: 0.65, chill: 2, element: "frost", appliedEffects: [eff("frost", 2, { value: 0.2 })] },
    anim("air", "thrust", "guard", "shards", "#8ec9e9", { shot: "none", aoe: true, hop: "leap", frame: 9, reaction: "knockback" }));
  add("shatter", "Раскол льда", "Удар 2,0, по инею +30% силы, +1 холод. По заморозке действует ещё +50% урона Воды. Цена 22, откат 3. Ты используешь окно холода; по тёплой цели слабее.",
    { powerMultiplier: 2, resourceCost: 22, cooldown: 3, chill: 1, element: "frost", vsEffect: { id: "frost", multiplier: 1.3 } },
    anim("windup", "slam", "guard", "shards", "#d4f6ff", { shot: "none", frame: 13, weight: "heavy", reaction: "slam", pose: { back: -0.15, tail: 0.75 } }));
  add("tidal-mend", "Живая вода", "Лечение 0,95, регенерация 26% лечения на 2 хода, +2 холода, −30 жара до нагрева цены. Цена 18, откат 3. Ты лечишься на 25% сильнее по холоду; удара нет.",
    { attackType: null, targetType: "self", selfHealMultiplier: 0.95, resourceCost: 18, cooldown: 3, chill: 2, element: "water",
      appliedEffects: [selfEff("regeneration", 2, dot("healingPower", 0.26, 5))], resolve: b => cool(b, 30), ai: b => hpRatio(b.hero) < 0.8 || (heat(b) >= 40 && cold(b)) },
    anim("guard", "proud", "cast", "wave", "#b5f0df", { range: "self", shot: "none", frame: 10 }));

  // EARTH: fill pressure for certain control or break it into damage.
  add("stone-fist", "Каменный кулак", "Удар 1,7, +34 давления, шанс оглушить 40%. На 100 давления ты гарантированно оглушаешь даже босса. Цена 16, откат 3. Не умеет часто добирать малый остаток.",
    { powerMultiplier: 1.7, resourceCost: 16, cooldown: 3, pressure: 34, element: "earth", appliedEffects: [eff("stun", 1, { chance: 0.4, value: 1 })] },
    anim("windup", "slam", "hit", "spikes", "#bba17b", { shot: "none", frame: 11, weight: "mid", reaction: "slam" }));
  add("rock-seam", "Шов породы", "Удар 1,2 за 10 маны, +22 давления, откат 1. Земля ошеломляет на 20% на 2 хода; на 100 давления оглушит. Ты точно добираешь порог, но мало ранишь сразу.",
    { powerMultiplier: 1.2, resourceCost: 10, cooldown: 1, pressure: 22, element: "earth" },
    anim("idle", "slam", "thrust", "spikes", "#b7ad8b", { shot: "none", frame: 6 }));
  add("tremor", "Трещина в земле", "Удар 1,5, остальным 60%, надлом брони 30% на 3 хода, +25 давления. Ты готовишь общий натиск и порог 100. Цена 18, откат 3. Слабое одиночное добивание.",
    { powerMultiplier: 1.5, resourceCost: 18, cooldown: 3, aoe: 0.6, pressure: 25, element: "earth", appliedEffects: [eff("armor_break", 3, { value: 0.3 })] },
    anim("guard", "slam", "thrust", "quake", "#b49c75", { shot: "none", aoe: true, frame: 11, weight: "mid", reaction: "knockback" }));
  add("vault-prop", "Подпереть свод", "Ты получаешь щит 22% здоровья, защиту 25% на 3 хода и +45 давления к оглушению на 100. Цена 12, откат 4. Прикрывает опасный ответ, но урона нет.",
    { attackType: null, targetType: "self", cooldown: 4, pressure: 45, element: "earth", appliedEffects: [selfEff("fortify", 3, { value: 0.25 })], resolve: b => shield(b, 0.22),
      ai: b => hpRatio(b.hero) < 0.75 || gauge(b, "earth") >= 55 },
    anim("guard", "proud", "slam", "spikes", "#d3c3a5", { range: "self", shot: "none", frame: 12, weight: "mid" }));
  add("landslide", "Оползень", "Удар 2,5 за 24 маны, +50 давления к оглушению на 100. Ты бьёшь медленнее: темп 1,2, откат 3. Хорош для контроля босса; при почти полном давлении часть прироста пропадёт.",
    { powerMultiplier: 2.5, resourceCost: 24, cooldown: 3, pressure: 50, tempo: 1.2, element: "earth" },
    anim("windup", "slam", "proud", "quake", "#d0b58b", { shot: "none", frame: 14, weight: "heavy", reaction: "slam", pose: { back: -0.22, drop: true, hold: 0.1, tail: 0.85 } }));
  add("seismic-release", "Сейсмический сброс", "Удар 2,1 за 18 маны, откат 3. Ты тратишь всё давление: +0,4% силы за единицу. Выбираешь урон сейчас и теряешь путь к оглушению на 100; без запаса бонуса нет.",
    { powerMultiplier: 2.1, resourceCost: 18, cooldown: 3, element: "earth", prepare: b => ({ scale: 1 + spend(b, "earth") * 0.004 }), ai: b => gauge(b, "earth") >= 40 },
    anim("proud", "slam", "hit", "burst", "#c9a37b", { shot: "none", frame: 13, weight: "heavy", reaction: "launch", pose: { back: -0.16, hold: 0.1, tail: 0.8 } }));

  // AIR: choose which attack crosses the five-flow threshold.
  add("gust-blade", "Разрез ветра", "Удар 1,3 за 12 маны, темп 0,7: твой ход раньше. Действие даёт 1 поток; на 5 поток повторяет навык с силой 60%. Быстр для добора, слаб для самого повтора.",
    { powerMultiplier: 1.3, tempo: 0.7, element: "air" },
    anim("air", "thrust", "cast", "slash", "#b9e9d5", { shot: "none", hop: "leap", frame: 4 }));
  add("flow-pause", "Пауза в потоке", "Удар 1,65 за 14 маны, откат 2. Ты получаешь 2 потока вместо 1: быстрее к повтору на 5. Полный темп 1,0; иногда лучше быстрый разрез, чтобы не потратить повтор рано.",
    { powerMultiplier: 1.65, resourceCost: 14, cooldown: 2, flow: 1, element: "air" },
    anim("guard", "thrust", "cast", "whirl", "#a5dcdf", { shot: "orb", frame: 7 }));
  add("tailwind", "Попутный ветер", "Ты получаешь 3 потока, скорость +35% и уклонение +12 на 3 хода. Темп 0,6, цена 14, откат 4. Урона нет: готовишь повтор сильного удара, сам ветер его не тратит.",
    { attackType: null, targetType: "self", resourceCost: 14, cooldown: 4, tempo: 0.6, flow: 2, element: "air",
      appliedEffects: [selfEff("haste", 3, { value: 0.35 }), selfEff("evasion", 3, { value: 12 })], ai: b => gauge(b, "air") <= 3 && !hasFx(b.hero, "haste") },
    anim("cast", "air", "proud", "whirl", "#c4f0dc", { range: "self", shot: "none", hop: "leap", frame: 8 }));
  add("hold-gale", "Удержать вихрь", "Удар 1,9 за 18 маны, откат 3. При 3+ потока ты снимаешь 2 потока и до 25 жара перед нагревом цены. Затем +1 поток. Откладывает повтор; без запаса нет охлаждения.",
    { powerMultiplier: 1.9, resourceCost: 18, cooldown: 3, element: "air",
      prepare(b) { if (gauge(b, "air") >= 3) { spend(b, "air", 2); cool(b, 25); } return {}; }, ai: b => gauge(b, "air") >= 3 && heat(b) >= 25 },
    anim("proud", "guard", "thrust", "whirl", "#a1cfe2", { shot: "none", frame: 10, reaction: "pull" }));
  add("storm-chain", "Цепь молний", "Три удара по 0,85 за 24 маны, откат 3. Ты получаешь 1 поток: на 5 вся серия повторится с силой 60%. Большая выплата по одной цели, но дорогой добор шкалы.",
    { powerMultiplier: 0.85, hits: 3, resourceCost: 24, cooldown: 3, element: "air", ai: b => gauge(b, "air") >= 4 },
    anim("windup", "thrust", "proud", "lightning", "#dbf4e9", { shot: "none", volley: 3, frame: 13, weight: "heavy", reaction: "launch", pose: { hold: 0.1, tail: 0.75 } }));
  add("backwind", "Обратный ветер", "Удар 1,7, остальным 60%, +2 потока, −25 жара до нагрева цены. Ты ведёшь группу к повтору на 5. Цена 12, откат 3. По одному серия молний сильнее.",
    { powerMultiplier: 1.7, aoe: 0.6, cooldown: 3, flow: 1, element: "air", resolve: b => cool(b, 25), ai: b => gauge(b, "air") >= 3 || heat(b) >= 25 },
    anim("air", "cast", "thrust", "wave", "#c6e8ee", { shot: "none", aoe: true, hop: "blink", frame: 11, weight: "mid", reaction: "knockback" }));

  // SPIRIT: recruit complementary roles or turn the circle into an immediate hit.
  add("spirit-attendant", "Дух-хранитель", "Ты зовёшь хранителя на 4 хода: щит 30% силы щита за ход. Три разные роли включают Гармонию: +15% урона и лечения. Цена 16, откат 2. Сам не ранит.",
    { attackType: null, targetType: "self", resourceCost: 16, cooldown: 2, element: "holy", summonUnitConfig: unit("guardian", "spirit", 4, 0.3, 0.55),
      ai: b => !army(b).some(u => u.role === "guardian") || (hpRatio(b.hero) < 0.5 && roles(b).size < 3) },
    anim("guard", "proud", "thrust", "ring", "#e6dfb6", { range: "self", shot: "none", frame: 10 }));
  add("pact-spark", "Искра договора", "Удар 1,25 и боевой дух на 3 хода: по 24% магии. Три разные роли дают Гармонию +15% урона и лечения. Цена 16, откат 2. Меньше защиты, чем с хранителем.",
    { powerMultiplier: 1.25, resourceCost: 16, cooldown: 2, summonUnitConfig: unit("attacker", "spirit", 3, 0.24), ai: b => !army(b).some(u => u.role === "attacker") || army(b).length < getSummonLimit(b.hero) },
    anim("idle", "proud", "cast", "sigil", "#d7c1ee", { shot: "orb", frame: 8 }));
  add("spirit-healer", "Дух-целитель", "Лечение 0,5 и целитель на 4 хода: по 36% силы лечения за ход. Ты добавляешь роль к Гармонии трёх разных духов. Цена 16, откат 3. Без ран лечение пропадает.",
    { attackType: null, targetType: "self", selfHealMultiplier: 0.5, resourceCost: 16, cooldown: 3, element: "holy", summonUnitConfig: unit("healer", "spirit", 4, 0.36),
      ai: b => !army(b).some(u => u.role === "healer") && (hpRatio(b.hero) < 0.85 || roles(b).size === 2) },
    anim("hit", "cast", "proud", "glow", "#ebedbc", { range: "self", shot: "none", frame: 9 }));
  add("spirit-energy", "Дух энергии", "Удар 1,2 и дух энергии на 4 хода: мана 30% силы лечения за ход. Ты добавляешь роль к Гармонии. Цена 10, откат 3. Нет немедленного лечения раны.",
    { powerMultiplier: 1.2, resourceCost: 10, cooldown: 3, element: "water", summonUnitConfig: unit("energy", "spirit", 4, 0.3, 0.4),
      ai: b => !army(b).some(u => u.role === "energy") && (b.hero.currentMana < b.hero.maxMana * 0.85 || roles(b).size === 2) },
    anim("guard", "cast", "thrust", "sigil", "#a5dfd1", { shot: "orb", frame: 7 }));
  add("third-pact", "Третий договор", "Удар 1,45 за 20 маны, откат 3. Ты зовёшь духа недостающей роли на 3 хода; при 3 ролях вместо призыва +30% силы. Собирает Гармонию, но не даёт мощного добивания.",
    { powerMultiplier: 1.45, resourceCost: 20, cooldown: 3,
      prepare: b => ({ scale: roles(b).size >= 3 ? 1.3 : 1 }),
      resolve(b, skill, p) { if (p.scale > 1) return; const missing = ["guardian", "healer", "attacker", "energy"].find(r => !roles(b).has(r)); if (missing) recruit(b, skill, unit(missing, "spirit", 3, 0.28)); },
      ai: b => roles(b).size < 3 || army(b).every(u => u.duration > 1) },
    anim("windup", "proud", "guard", "sigil", "#eee0ff", { shot: "none", frame: 13, weight: "heavy", pose: { hold: 0.1, tail: 0.8 } }));
  add("circle-dismissal", "Роспуск круга", "Удар 2,0 за 18 маны, откат 4. Ты распускаешь духов: +12% силы и лечение 4% здоровья за духа, до 3. Теряешь Гармонию и службу; это расход, не гибель.",
    { powerMultiplier: 2, resourceCost: 18, cooldown: 4,
      prepare(b) { const spirits = army(b).filter(u => u.type === "spirit" && !u.persistent); const n = Math.min(3, spirits.length); dismiss(b, spirits); return { scale: 1 + n * 0.12, count: n }; },
      resolve(b, skill, p) { if (p.count) procHeal(b, p.count * 0.04, skill.name); }, ai: b => army(b).some(u => u.type === "spirit" && u.duration <= 2) },
    anim("proud", "slam", "guard", "glow", "#ddc9ef", { shot: "orb", frame: 12, weight: "heavy", reaction: "knockback", pose: { back: -0.12, tail: 0.8 } }));

  // UNDEAD: natural deaths pay bones; deliberate sacrifices do not.
  add("undead-thrall", "Костяной слуга", "Ты поднимаешь слугу на 4 хода: удар 28% магии за ход. Нежить сильнее на 10% за соседа; гибель даёт кость и 8% маны Связи. Цена 16, откат 2. Удара сейчас нет.",
    { attackType: null, targetType: "self", resourceCost: 16, cooldown: 2, element: "dark", summonUnitConfig: unit("attacker", "undead", 4, 0.28, 0.45), ai: b => army(b).length < getSummonLimit(b.hero) },
    anim("guard", "slam", "proud", "spikes", "#d6d0b7", { range: "self", shot: "none", frame: 10, weight: "mid" }));
  add("zombie", "Поднять зомби", "Удар 1,2 и зомби на 3 хода: 14% магии за ход, перехват ударов. Ты растишь армию, его гибель даст кость и 8% маны. Цена 20, откат 3. Дороже хрупкого слуги.",
    { powerMultiplier: 1.2, resourceCost: 20, cooldown: 3, element: "dark", summonUnitConfig: unit("tank", "undead", 3, 0.14, 1.1, 2), ai: b => army(b).length < getSummonLimit(b.hero) },
    anim("windup", "thrust", "slam", "smoke", "#a7b49a", { shot: "none", frame: 10, weight: "mid" }));
  add("bone-stitch", "Костяной шов", "Удар 1,6 за 14 маны, откат 2. Ты тратишь до 2 костей: +25% силы за кость. Берёшь урон сейчас, оставляешь меньше костей для взрыва или нового строя.",
    { powerMultiplier: 1.6, resourceCost: 14, cooldown: 2, element: "dark", prepare: b => ({ scale: 1 + spend(b, "undead", 2) * 0.25 }), ai: b => gauge(b, "undead") > 0 },
    anim("cast", "slam", "thrust", "cross", "#d9d1ba", { shot: "none", frame: 9, weight: "mid" }));
  add("brief-command", "Короткий приказ", "Удар 1,6 за 10 маны, откат 2. Старейшая нежить бьёт ещё на 200% своей силы и живёт последний ход: ты ускоряешь кость и возврат маны. Без неё зовёшь слугу на ход.",
    { powerMultiplier: 1.6, resourceCost: 10, cooldown: 2, element: "dark",
      resolve(b, skill) { const u = army(b).find(u => u.type === "undead" && !u.persistent); if (u) { procDamage(b, u.power * 2, skill.name, "dark"); u.duration = 1; } else recruit(b, skill, unit("attacker", "undead", 1, 0.28, 0.45)); },
      ai: b => army(b).some(u => u.type === "undead" && u.duration <= 2) || !army(b).some(u => u.type === "undead") },
    anim("proud", "thrust", "slam", "chain", "#c5c3a9", { shot: "none", frame: 8, reaction: "pull" }));
  add("bone-burst", "Взрыв костей", "Ты распускаешь нежить: урон от половины её здоровья и двойной силы, +15% за кость. Кости тратятся, гибели нет. Цена 18, откат 3. Без армии нельзя применить.",
    { powerMultiplier: 0.5, resourceCost: 18, cooldown: 3, element: "dark", special: "bone_burst",
      ai: b => army(b).filter(u => u.type === "undead").length >= 2 || army(b).some(u => u.type === "undead" && u.duration <= 2) },
    anim("windup", "slam", "idle", "shards", "#eee7c9", { shot: "none", frame: 14, weight: "heavy", reaction: "launch", pose: { back: -0.2, hold: 0.12, tail: 0.85 } }));
  add("bone-ranks", "Строй из костей", "Удар 1,8, остальным 50%. Ты тратишь кости: зовёшь 1 слугу и ещё по 1 за 2 кости, до 3, на 3 хода. Цена 18, откат 4. Восстанавливает армию, но откладывает взрыв.",
    { powerMultiplier: 1.8, resourceCost: 18, cooldown: 4, aoe: 0.5, element: "dark",
      resolve(b, skill) { const n = Math.min(3, 1 + Math.floor(spend(b, "undead") / 2)); for (let i = 0; i < n; i++) recruit(b, skill, unit("attacker", "undead", 3, 0.24, 0.45)); },
      ai: b => army(b).length <= 2 || gauge(b, "undead") >= 4 },
    anim("guard", "slam", "cast", "spikes", "#dad9c2", { shot: "none", aoe: true, frame: 12, weight: "heavy", reaction: "knockback", pose: { hold: 0.08, tail: 0.7 } }));

  // LIGHT: build radiance through real healing and absorption, then spend it.
  add("light-touch", "Касание света", "Лечение 1,05 за 15 маны, откат 2. Ты копишь сияние фактическим лечением и уходишь к свету; после тьмы лечение +25%. При полном здоровье сияния не даст.",
    { attackType: null, targetType: "self", selfHealMultiplier: 1.05, resourceCost: 15, cooldown: 2, element: "holy", ai: b => hpRatio(b.hero) < 0.82 },
    anim("idle", "cast", "guard", "glow", "#fff2c4", { range: "self", shot: "none", frame: 6 }));
  add("wound-light", "Свет в ране", "Удар 1,4 и лечение 0,5 за 18 маны, откат 2. Ты копишь сияние лечением, но остаёшься на тёмной стороне. Без ран возврата нет, зато не теряешь целый удар.",
    { powerMultiplier: 1.4, selfHealMultiplier: 0.5, resourceCost: 18, cooldown: 2, element: "holy" },
    anim("hit", "thrust", "proud", "flash", "#ffe0ad", { frame: 7 }));
  add("judgement", "Суд", "Ты тратишь всё сияние: удар 0,8 плюс 110% запаса до защиты врага. После света ещё +25% урона Сумерек. Цена 16, откат 2. Без сияния нельзя; теряешь весь запас.",
    { powerMultiplier: 0.8, resourceCost: 16, cooldown: 2, element: "holy", special: "judgement" },
    anim("windup", "proud", "thrust", "pillar", "#fff4ce", { shot: "none", frame: 13, weight: "heavy", reaction: "slam", pose: { back: -0.16, hold: 0.1, tail: 0.8 } }));
  add("dawn-mirror", "Зеркало рассвета", "Удар 1,65 за 14 маны, откат 3. Если сияния хотя бы 10% здоровья, ты ставишь щит 12% здоровья, сохраняя запас; поглощение копит сияние. Без запаса щита нет.",
    { powerMultiplier: 1.65, resourceCost: 14, cooldown: 3, element: "holy", prepare: b => ({ ready: gauge(b, "light") >= b.hero.maxHp * 0.1 }),
      resolve(b, skill, p) { if (p.ready) shield(b, 0.12); }, ai: b => gauge(b, "light") >= b.hero.maxHp * 0.1 && !hasFx(b.hero, "shield") },
    anim("guard", "thrust", "proud", "ring", "#f2deb3", { shot: "orb", frame: 9 }));
  add("light-shutter", "Световой затвор", "Ты лечишься с силой 0,9, ставишь щит 22% здоровья и снимаешь до 25 жара перед нагревом цены. Лечение и поглощение копят сияние. Цена 16, откат 4. Удара нет.",
    { attackType: null, targetType: "self", selfHealMultiplier: 0.9, resourceCost: 16, cooldown: 4, element: "holy", resolve(b) { shield(b, 0.22); cool(b, 25); },
      ai: b => hpRatio(b.hero) < 0.78 || (heat(b) >= 35 && !hasFx(b.hero, "shield")) },
    anim("guard", "cast", "slam", "sigil", "#f6ebc8", { range: "self", shot: "none", frame: 12, weight: "mid", pose: { tail: 0.75 } }));
  add("crystal-noon", "Хрустальный полдень", "Удар 2,2, остальным 50%. Ты тратишь половину сияния: добавляешь до 0,5 силы по его доле от магии. Цена 22, откат 4. Сохраняешь запас, но Суд лучше обналичит большой.",
    { powerMultiplier: 2.2, resourceCost: 22, cooldown: 4, aoe: 0.5, element: "holy",
      prepare(b) { const used = spend(b, "light", gauge(b, "light") * 0.5); return { scale: 1 + Math.min(0.5, used / Math.max(1, b.hero.skillDamage)) / 2.2 }; },
      ai: b => gauge(b, "light") >= b.hero.maxHp * 0.08 },
    anim("proud", "cast", "guard", "shards", "#f9f2d8", { shot: "none", aoe: true, frame: 14, weight: "heavy", reaction: "launch", pose: { hold: 0.12, tail: 0.8 } }));

  // DARK: afflictions are a damage engine; a servant is an optional costly exit.
  add("shadow-servant", "Теневой слуга", "Ты зовёшь слугу на 4 хода и даёшь слабость 20% на 2: она вызывает порчу. Каждая беда даёт +8% магии Тьмы. Цена 14, откат 2. Нет удара, слуга занимает место.",
    { attackType: null, targetType: "enemy", resourceCost: 14, cooldown: 2, element: "dark", summonUnitConfig: unit("minion", "minion", 4, 0.01, 0.6), appliedEffects: [eff("weaken", 2, { value: 0.2 })],
      ai: b => !army(b).some(u => u.type === "minion") || !hasFx(b.enemy, "weaken") },
    anim("guard", "cast", "hit", "smoke", "#9a8fb8", { shot: "none", frame: 10 }));
  add("curse", "Проклятие порчи", "Удар 1,1, слабость 25% на 3 хода вызывает порчу. Ты получаешь +8% магии за каждую беду на враге. Цена 16, откат 2. Готовит долгую цель, слабое добивание.",
    { powerMultiplier: 1.1, resourceCost: 16, cooldown: 2, element: "dark", appliedEffects: [eff("weaken", 3, { value: 0.25 })], ai: b => !hasFx(b.enemy, "weaken") || !hasFx(b.enemy, "corruption") },
    anim("cast", "guard", "hit", "sigil", "#a78ebc", { shot: "none", frame: 8 }));
  add("night-bolt", "Ночной разряд", "Удар 2,1 за 18 маны, откат 3. Каждая беда усиливает твою магию на 8%; после света ещё +25% Сумерек. Ты используешь подготовку, но сам новых бед не кладёшь.",
    { powerMultiplier: 2.1, resourceCost: 18, cooldown: 3, element: "dark" },
    anim("windup", "thrust", "hit", "void", "#b09bd6", { shot: "orb", frame: 11, weight: "mid", reaction: "knockback" }));
  add("rewrite-blight", "Переписать порчу", "Удар 1,4, остальным 50%, порча 20% магии на 3 хода и раскрытие 12 на 2. Ты добавляешь две беды для +8% магии за каждую. Цена 18, откат 3. Меньше урона сразу.",
    { powerMultiplier: 1.4, resourceCost: 18, cooldown: 3, aoe: 0.5, element: "dark", appliedEffects: [eff("corruption", 3, dot("skillDamage", 0.2, 5)), eff("exposed", 2, { value: 12 })],
      ai: b => !hasFx(b.enemy, "corruption") || !hasFx(b.enemy, "exposed") },
    anim("proud", "cast", "hit", "sigil", "#bf9fc8", { shot: "none", aoe: true, frame: 10, weight: "mid" }));
  add("ritual-sacrifice", "Жертвенный ритуал", "Удар 2,1 за 18 маны, откат 4. Ты распускаешь слугу: +30% силы и −25 жара до нагрева цены. Без слуги платишь ещё 5% здоровья за базовый удар; порчи не снимаются.",
    { powerMultiplier: 2.1, resourceCost: 18, cooldown: 4, element: "dark",
      prepare(b) { const u = army(b).find(u => u.type === "minion" && !u.persistent); if (u) { dismiss(b, [u]); cool(b, 25); return { scale: 1.3 }; } b.hero.currentHp = Math.max(1, b.hero.currentHp - Math.round(b.hero.maxHp * 0.05)); return {}; },
      ai: b => army(b).some(u => u.type === "minion") || (hpRatio(b.hero) > 0.65 && countEnemyDebuffs(b.enemy) >= 2) },
    anim("windup", "slam", "hit", "void", "#bd98c8", { shot: "none", frame: 14, weight: "heavy", reaction: "pull", pose: { back: -0.2, hold: 0.12, tail: 0.85 } }));
  add("page-of-woes", "Страница бед", "Удар 2,0, остальным 60%. При 3+ бедах сила +25%, ты возвращаешь 8% маны и сохраняешь порчи. Цена 20, откат 4. Без подготовки нет выплаты, слугу не расходует.",
    { powerMultiplier: 2, resourceCost: 20, cooldown: 4, aoe: 0.6, element: "dark", prepare: b => ({ paid: countEnemyDebuffs(b.enemy) >= 3 }),
      on: onHit("page-of-woes", (b, s, c) => { if (countEnemyDebuffs(b.enemy) >= 3) c.mult *= 1.25; }),
      resolve(b, skill, p) { if (p.paid) procMana(b, 0.08); }, ai: b => countEnemyDebuffs(b.enemy) >= 2 },
    anim("cast", "proud", "hit", "smoke", "#c6a3d5", { shot: "none", aoe: true, frame: 13, weight: "heavy", reaction: "knockback", pose: { hold: 0.1, tail: 0.8 } }));

  const tiers = (levels, rows) => rows.map((options, i) => ({ level: levels[i], options: options.map(id => `mage-${id}`) }));
  const path = (owner, stage, rows) => ({ owner, stage, tiers: tiers(stage === "subclass" ? [30, 38, 46] : [60, 68, 76], rows) });
  const main = tiers([1, 4, 8, 12, 16, 22], [
    ["ether-beam", "cooling-spark", "heat-seal"], ["book-fan", "ether-temper", "static-clasp"],
    ["heated-tome", "heat-siphon", "rune-shutter"], ["noon-needle", "thermal-drop", "binding-reserve"],
    ["red-line", "steam-circle", "seal-press"], ["white-heat", "zero-burst", "ban-field"]
  ]);
  main[5].needsLane = 2;
  defineSkillTree("mage", {
    lanes: [
      { name: "Красная строка", description: "Ты удерживаешь горячий том ради сильных пробивающих ударов. Считай цену следующего разгона до срыва." },
      { name: "Теплообмен", description: "Ты чередуешь холодную закалку с нагревом и охлаждением. Решай, когда забрать ману вместо горячего усиления." },
      { name: "Печати жара", description: "Ты запасёшь жар дешёвой меткой, затем отдашь его щиту, пробиванию или немоте под опасное намерение врага." }
    ],
    stages: [
      { owner: "mage", stage: "class", tiers: main },
      path("elemental", "subclass", [["elemental-surge", "conductor"], ["resonance-release", "quiet-circuit"], ["five-facets", "reverse-current"]]),
      path("summoner", "subclass", [["soul-tether", "familiar"], ["summoning-spark", "bond-bell"], ["command", "release-bond"]]),
      path("light_dark", "subclass", [["dusk-ray", "first-dawn"], ["between-lines", "midday-night"], ["eclipse", "page-turn"]]),
      path("fire", "profession", [["firebolt", "smoke-letter"], ["cinder-wave", "strip-soot"], ["sun-furnace", "quiet-embers"]]),
      path("water", "profession", [["ice-lance", "thaw-needle"], ["ice-prison", "icy-trail"], ["shatter", "tidal-mend"]]),
      path("earth", "profession", [["stone-fist", "rock-seam"], ["tremor", "vault-prop"], ["landslide", "seismic-release"]]),
      path("air", "profession", [["gust-blade", "flow-pause"], ["tailwind", "hold-gale"], ["storm-chain", "backwind"]]),
      path("spirit", "profession", [["spirit-attendant", "pact-spark"], ["spirit-healer", "spirit-energy"], ["third-pact", "circle-dismissal"]]),
      path("undead", "profession", [["undead-thrall", "zombie"], ["bone-stitch", "brief-command"], ["bone-burst", "bone-ranks"]]),
      path("light", "profession", [["light-touch", "wound-light"], ["judgement", "dawn-mirror"], ["light-shutter", "crystal-noon"]]),
      path("dark", "profession", [["shadow-servant", "curse"], ["night-bolt", "rewrite-blight"], ["ritual-sacrifice", "page-of-woes"]])
    ]
  });
})();
