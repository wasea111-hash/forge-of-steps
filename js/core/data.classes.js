// Alpha 2.0: what makes a class play differently from level 1, group encounters, scripted bosses, item sets and ultimates.

// ---------- CLASS RESOURCES ----------
const CLASS_RESOURCES = {
  warrior: { name: "Напор", max: 100, start: 0, regen: 0, costScale: 1, hint: "Копится от ударов, ран и стойки. Навыки тратят напор." },
  assassin: { name: "Энергия", max: 100, start: 100, regen: 30, costScale: 2.5, hint: "Быстро восстанавливается сама. Хватает на один сильный приём за ход." },
  mage: { name: "Мана", hint: "Запас заклинаний." },
  archer: { name: "Выдержка", hint: "Запас сил на прицельную стрельбу." },
  bard: { name: "Дыхание", hint: "Запас голоса на всю песню." }
};

function getClassResource(hero) {
  return CLASS_RESOURCES[hero?.classKey] || CLASS_RESOURCES.mage;
}

const CORE_BY_CLASS = { warrior: "core_warrior", mage: "core_mage", archer: "core_archer", bard: "core_bard", assassin: "core_assassin" };

function coreState(b) {
  return b.mech?.[CORE_BY_CLASS[b.hero.classKey]] || null;
}

// Hits every other living foe. Used by sweeps, explosions and spreading effects.
function eachFoe(b, fn, includeTarget = true) {
  const target = b.enemy;
  const focus = b.focus;
  b.focus = focus ?? target.slot;
  b.foes.filter((foe) => foe.currentHp > 0 && (includeTarget || foe !== target)).forEach((foe) => {
    b.enemy = foe;
    fn(foe);
  });
  b.enemy = target;
  b.focus = focus;
}

function splash(b, amount, label, element = "steel") {
  eachFoe(b, () => {
    const { hpDamage } = dealDamage(b, b.enemy, amount);
    emit(b, "hit", { target: "enemy", amount: hpDamage, crit: false, kind: "physical", element, label });
  }, false);
}

// Moves an effect from a fallen foe to the others.
function spreadEffect(b, fallen, id, ratio = 0.7, durationBonus = 0) {
  const effect = getEffect(fallen, id);
  if (!effect) return false;
  let spread = false;
  eachFoe(b, (foe) => {
    if (foe === fallen) return;
    applyEffect(b, foe, { id, duration: Math.max(2, effect.duration + durationBonus), value: effect.value * ratio, meta: id === "burn" ? { stacks: 1 } : {} }, b.hero);
    emit(b, "effect", { target: "enemy", id });
    spread = true;
  });
  return spread;
}

// ---------- CLASS CORES ----------
const heatOfSkill = (skill, hero) => Math.round(getSkillResourceCost(skill, hero) * 1.4);

const BARD_NOTES = { blade: "♫", life: "♪", shade: "☾" };
function bardNoteOf(ctx) {
  if (ctx.type === "attack") return "blade";
  if (ctx.type !== "skill") return null;
  const skill = ctx.skill;
  if ((skill.appliedEffects || []).some((effect) => effect.target !== "self" && STATUS_EFFECT_DEFINITIONS[effect.id]?.tone === "bad" && !["poison", "bleed", "burn"].includes(effect.id))) return "shade";
  return skill.attackType ? "blade" : "life";
}

Object.assign(MECHANICS, {
  core_warrior: {
    name: "Напор", core: true, description: "Воин не копит ману: напор растёт от ударов, ран и стойки, а тратится на навыки. Обычный удар задевает всех врагов рядом. Выше 70 напора весь урон сильнее на 15%. «Собраться» даёт сразу 30.",
    value: (b) => b.hero.currentMana, max: 100,
    beforeHit(b, s, c) { if (b.hero.currentMana >= 70) c.mult *= 1.15; },
    afterHit(b, s, c) {
      if (c.proc) return;
      b.hero.currentMana = Math.min(100, b.hero.currentMana + (c.crit ? 22 : 14));
      if (!c.skill && !c.noEcho && c.hpDamage > 0 && b.foes.length > 1) splash(b, c.hpDamage * 0.4, "Размах");
    },
    hurt(b, s, c) { if (c.hpDamage > 0) b.hero.currentMana = Math.min(100, b.hero.currentMana + 12); },
    afterAction(b, s, c) { if (c.type === "guard") b.hero.currentMana = Math.min(100, b.hero.currentMana + 20); },
    wait: { name: "Собраться", tempo: 0.7, run(b) { b.hero.currentMana = Math.min(100, b.hero.currentMana + 30); return "Напор растёт."; }, tip: "Сразу 30 напора, следующий ход раньше." }
  },
  core_mage: {
    name: "Перегрев", core: true, description: "Каждое заклинание греет мага: чем жарче, тем сильнее магия, до +40%. Но выше 100 наступает срыв: 15% здоровья и пропуск хода. «Медитация» сбрасывает жар и возвращает ману, обычный удар немного остужает.",
    max: 100,
    beforeHit(b, s, c) { if (c.kind === "magic") c.mult *= 1 + s.value * 0.004; },
    afterAction(b, s, c) {
      if (c.type === "attack") s.value = Math.max(0, s.value - 12);
      if (c.type !== "skill") return;
      s.value += heatOfSkill(c.skill, b.hero) * (1 + tm(b.hero, "heatGain"));
      if (s.value > 100 + tm(b.hero, "heatCap")) {
        s.value = 30;
        b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - b.hero.maxHp * 0.15 * (1 + tm(b.hero, "backfire"))));
        applyEffect(b, b.hero, { id: "stun", duration: 1 }, b.hero);
        mechNote(b, "Срыв! Магия вышла из-под контроля");
        fireMech(b, "backfire");
      }
    },
    bot(b, s) { return s.value >= 72 ? { type: "wait" } : null; },
    wait: { name: "Медитация", tempo: 0.6, run(b, s) { s.value = Math.max(0, s.value - 50); b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.14)); return "Жар спадает, мана возвращается."; }, tip: "−50 перегрева и 14% маны, следующий ход раньше." }
  },
  core_archer: {
    name: "Дистанция", core: true, description: "Бой начинается с небольшого расстояния. Пока враг не подошёл, его обычные физические удары уходят на сближение и не ранят. За каждую ступень дистанции выстрел сильнее на 10%, вплотную слабее на 20%. «Отойти» возвращает ступень раз в 4 хода. Тяжёлые удары и магия достают всегда.",
    max: 3, text: (b, s) => ["вплотную", "близко", "средне", "далеко"][s.value] || "",
    start(b, s) { s.value = clamp(1 + tm(b.hero, "startRange"), 0, 3); s.cd = 0; },
    turnStart(b, s) { s.cd = Math.max(0, (s.cd || 0) - 1); },
    beforeHit(b, s, c) { if (c.kind === "physical") c.mult *= s.value > 0 ? 1 + s.value * (0.1 + tm(b.hero, "rangeBonus")) : 0.8 + tm(b.hero, "closeBonus"); },
    enemyAttack(b, s, c) {
      if (c.move.heavy || c.kind !== "physical" || s.value <= 0) return;
      s.value -= 1;
      // A lair master is so huge that one stride covers the distance, and the blow still lands.
      if (b.enemy.lairMaster) { emit(b, "mech", { text: `${b.enemy.name}: один шаг, и ты рядом` }); fireMech(b, "approached"); return; }
      c.cancel = true;
      emit(b, "mech", { text: `${b.enemy.name} сближается` });
      logEvent(b, `${b.enemy.name} сближается вместо удара. Дистанция: ${MECHANICS.core_archer.text(b, s)}.`, "Дистанция");
      fireMech(b, "approached");
    },
    bot(b, s) { return s.value <= 0 && !s.cd ? { type: "wait" } : null; },
    wait: { name: "Отойти", tempo: 0.8, can: (b, s) => !s.cd, run(b, s) { s.value = Math.min(3, s.value + 1); s.cd = 4 + tm(b.hero, "retreatCd"); fireMech(b, "retreated"); return "Лучник разрывает дистанцию."; }, fallback: "Выждать", tip: "+1 ступень дистанции раз в 4 хода, следующий ход раньше." }
  },
  core_bard: {
    name: "Мотив", core: true, description: "Каждое действие играет ноту: удар ♫, поддержка ♪, порча ☾. Три ноты складываются в мотив. Три удара: марш бьёт всех врагов. Три поддержки: гимн лечит и даёт щит. Три порчи: реквием ослабляет всех. Три разные ноты: аккорд усиливает и возвращает дыхание. Иначе короткий припев.",
    max: 3, value: (b, s) => (s.notes || []).length, text: (b, s) => (s.notes || []).map((id) => BARD_NOTES[id]).join(" "),
    afterAction(b, s, c) {
      const note = bardNoteOf(c);
      if (!note) return;
      s.notes = [...(s.notes || []), note];
      if (s.notes.length < 3) return;
      const notes = s.notes;
      s.notes = [];
      const same = new Set(notes).size;
      if (same === 3) {
        mechNote(b, "Аккорд!");
        fx(b, "rage", 3, 0.25, { self: true });
        procMana(b, 0.15);
      } else if (same === 1 && notes[0] === "blade") {
        mechNote(b, "Марш!");
        eachFoe(b, () => performHeroHit(b, { kind: "magic", power: 1.1 * (1 + tm(b.hero, "motifPower")), label: "Марш", element: "air", noEcho: true, proc: true, sure: true }));
      } else if (same === 1 && notes[0] === "life") {
        mechNote(b, "Гимн!");
        procHeal(b, 0.15 * (1 + tm(b.hero, "motifPower")), "гимн");
        procShield(b, 0.12);
      } else if (same === 1) {
        mechNote(b, "Реквием!");
        eachFoe(b, () => { fx(b, "weaken", 3, 0.25); fx(b, "mark", 3, 0.2); });
      } else {
        procMana(b, 0.05);
      }
      fireMech(b, "motif", { same });
    },
    wait: { name: "Настроиться", tempo: 0.6, run(b) { b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * 0.14)); return "Голос снова чист."; }, tip: "14% дыхания, следующий ход раньше. Ноту не играет." }
  },
  core_assassin: {
    name: "Скрытность", core: true, description: "Ассасин начинает бой в тени: первый удар всегда критический и сильнее на 60%, а враги часто бьют мимо. Удар выводит из тени. Убийство сразу возвращает в тень, поэтому группу нужно резать по одному. «Скрыться» работает раз в 3 хода.",
    max: 1, value: (b, s) => (s.hidden ? 1 : 0), text: (b, s) => (s.hidden ? "в тени" : s.cd ? `скрыться через ${s.cd}` : "можно скрыться"),
    start(b, s) { s.hidden = true; s.cd = 0; },
    turnStart(b, s) { s.cd = Math.max(0, (s.cd || 0) - 1); },
    beforeHit(b, s, c) { if (s.hidden && !c.proc) { c.mult *= 1.6 + tm(b.hero, "shadowPower"); c.forceCrit = true; s.spent = true; } },
    afterAction(b, s) { if (s.spent) { s.hidden = false; s.spent = false; } },
    incoming(b, s, c) { if (s.hidden && roll(0.4 + tm(b.hero, "shadowDodge"))) { c.parried = true; logEvent(b, "Удар проходит сквозь тень.", "Тень"); } },
    foeDown(b, s) { if (!s.hidden) { s.hidden = true; s.spent = false; mechNote(b, "Снова в тени"); fireMech(b, "rehidden"); } },
    bot(b, s) { return !s.hidden && !s.cd && hpRatio(b.hero) < 0.55 ? { type: "wait" } : null; },
    wait: { name: "Скрыться", tempo: 0.7, can: (b, s) => !s.cd && !s.hidden, run(b, s) { s.hidden = true; s.cd = 3; fireMech(b, "rehidden"); return "Ассасин растворяется в тени."; }, fallback: "Перевести дух", tip: "Снова в тень раз в 3 хода, следующий ход раньше." }
  }
});

// ---------- ULTIMATES: earned during the fight, one decisive moment ----------
const ULTIMATE_LEVEL = 10;
const ULTIMATES = {
  warrior: { name: "Последний рубеж", description: "Удар по всем врагам. Напор полный, 3 хода ты не падаешь ниже 1 здоровья.", element: "blood", run(b) {
    eachFoe(b, () => performHeroHit(b, { kind: "physical", power: 2.6, label: "Последний рубеж", element: "blood", noEcho: true, sure: true }));
    b.hero.currentMana = 100;
    b.lastStand = 3;
  } },
  mage: { name: "Звездопад", description: "Магический удар по всем врагам. Чем сильнее перегрев, тем мощнее, затем жар сбрасывается.", element: "arcane", run(b) {
    const s = coreState(b);
    const heat = s?.value || 0;
    eachFoe(b, () => performHeroHit(b, { kind: "magic", power: 2.4 + heat * 0.015, label: "Звездопад", element: "arcane", noEcho: true, sure: true }));
    if (s) s.value = 0;
  } },
  archer: { name: "Ливень стрел", description: "Восемь стрел по случайным врагам. Ты сразу на дальней дистанции.", element: "air", run(b) {
    for (let i = 0; i < 8; i += 1) {
      const alive = b.foes.filter((foe) => foe.currentHp > 0);
      if (!alive.length) break;
      const target = b.enemy;
      b.enemy = randomFrom(alive);
      performHeroHit(b, { kind: "physical", power: 0.75, label: "Ливень стрел", element: "air", noEcho: true, sure: true });
      b.enemy = target;
    }
    const s = coreState(b);
    if (s) s.value = 3;
  } },
  bard: { name: "Великий финал", description: "Все беды сняты, лечение на 30%. Каждый враг ошеломлён и может быть оглушён.", element: "holy", run(b) {
    b.hero.effects = b.hero.effects.filter((effect) => STATUS_EFFECT_DEFINITIONS[effect.id]?.tone !== "bad");
    procHeal(b, 0.3, "финал");
    eachFoe(b, () => { performHeroHit(b, { kind: "magic", power: 1.4, label: "Великий финал", element: "holy", noEcho: true, sure: true }); fx(b, "stagger", 3, 0.25); applyStun(b, b.enemy, b.hero, 0.6); });
  } },
  assassin: { name: "Тысяча порезов", description: "Пять критических ударов по цели и уход в тень.", element: "blood", run(b) {
    for (let i = 0; i < 5 && b.enemy.currentHp > 0; i += 1) performHeroHit(b, { kind: "physical", power: 0.8, label: "Тысяча порезов", element: "blood", noEcho: true, sure: true, forceCrit: true });
    const s = coreState(b);
    if (s) s.hidden = true;
  } }
};

// ---------- SUPPORT ENEMIES AND GROUPS ----------
Object.assign(ENEMY_MOVES, {
  ally_heal: { name: "Лечение союзника", kind: "ally_heal", ratio: 0.18, cd: 2, element: "holy" },
  ally_shield: { name: "Заслон союзнику", kind: "ally_shield", ratio: 0.16, cd: 3, element: "arcane" },
  ally_rage: { name: "Подстрекательство", kind: "ally_rage", value: 0.3, cd: 3, element: "fire" },
  stoke: { name: "Раздуть пламя", kind: "ally_rage", value: 0.2, cd: 2, element: "fire" },
  idle: { name: "Гудение", kind: "idle" }
});
Object.assign(ENEMY_DEFINITIONS, {
  hedge_witch: { name: "Лесная ведунья", art: "caster", tint: "#7fa35c", stats: { strength: 3, endurance: 7, agility: 6, luck: 4, intellect: 8, spirituality: 8 }, moves: ["strike", "ally_heal", "hex"], mods: { hp: 0.75, dmg: 0.8 }, lore: "Лечит тех, кто рядом. Начни с неё.", traits: [] },
  brazier: { name: "Жаровня Королевы", art: "shard", tint: "#ff8a3c", stats: { strength: 1, endurance: 9, agility: 1, luck: 1, intellect: 8, spirituality: 1 }, moves: ["stoke"], mods: { hp: 0.5, dmg: 0.5 }, lore: "Кормит Королеву. Пока горит, она сильнее.", traits: ["fireborn"], noReward: true },
  page_swarm: { name: "Рой страниц", art: "wraith", tint: "#d8d3ea", stats: { strength: 3, endurance: 4, agility: 9, luck: 3, intellect: 9, spirituality: 2 }, moves: ["hex", "arcane"], mods: { hp: 0.4, dmg: 0.6 }, lore: "Пересказывает тебя тебе же.", traits: ["bloodless"], noReward: true },
  anvil_spirit: { name: "Дух наковальни", art: "golem", tint: "#ffb35c", stats: { strength: 9, endurance: 11, agility: 2, luck: 1, intellect: 1, spirituality: 1 }, moves: ["strike", "ally_shield"], mods: { hp: 0.55, dmg: 0.7 }, lore: "Закрывает Кузнеца щитом, пока жив.", traits: ["bloodless"], noReward: true }
});
ENEMY_DEFINITIONS.pyre_cultist.moves.push("ally_rage");
ENEMY_DEFINITIONS.mad_scribe.moves.push("ally_shield");
ENEMY_DEFINITIONS.hollow_pilgrim.moves.push("ally_heal");
REGIONS[0].enemies.push("hedge_witch");

const ENCOUNTERS = {
  thicket: [["wolf"], ["bandit"], ["boar"], ["slime"], ["hunter"], ["wolf", "wolf"], ["wolf", "wolf", "wolf"], ["bandit", "hedge_witch"], ["boar", "hunter"], ["slime", "slime"], ["bandit", "bandit", "hedge_witch"]],
  ashlands: [["cinder_knight"], ["ember_imp"], ["ash_slime"], ["scorched_hound", "scorched_hound"], ["scorched_hound", "scorched_hound", "scorched_hound"], ["cinder_knight", "pyre_cultist"], ["ember_imp", "ember_imp"], ["ash_slime", "pyre_cultist"], ["cinder_knight", "ember_imp", "pyre_cultist"]],
  ruins: [["stone_golem"], ["wraith"], ["rust_stalker"], ["rune_guard", "mad_scribe"], ["wraith", "wraith"], ["stone_golem", "mad_scribe"], ["rust_stalker", "rust_stalker", "mad_scribe"], ["rune_guard", "wraith", "mad_scribe"]],
  limit: [["star_eater"], ["limit_shard"], ["void_stalker"], ["echo_wanderer", "hollow_pilgrim"], ["void_stalker", "void_stalker"], ["limit_shard", "hollow_pilgrim"], ["star_eater", "void_stalker"], ["echo_wanderer", "void_stalker", "hollow_pilgrim"]]
};
const PACK_SCALE = { 1: { hp: 1, dmg: 1, share: 1 }, 2: { hp: 0.68, dmg: 0.72, share: 0.75 }, 3: { hp: 0.5, dmg: 0.56, share: 0.6 }, 4: { hp: 0.42, dmg: 0.5, share: 0.5 } };
Object.entries({ white: [0.85, 0.85], green: [1, 1], orange: [1.25, 1.2], purple: [1.65, 1.45], red: [2.3, 1.85] }).forEach(([key, [hp, dmg]]) => { ZONES[key].power = { hp, dmg }; });

function buildEncounter(hero, exp, node) {
  if (node.lairMaster) return [makeLairBoss(hero, LAIR_CATALOG[exp.lairId], exp.lairLevel)];
  const level = rollEnemyLevel(hero, exp.regionId, exp.zoneKey);
  const power = ZONES[exp.zoneKey].power;
  const pack = node.pack || [node.enemyId || pickRegionEnemy(getRegion(exp.regionId))];
  const scale = PACK_SCALE[pack.length] || PACK_SCALE[4];
  const affix = node.affixId ? ELITE_AFFIXES.find((entry) => entry.id === node.affixId) : null;
  return pack.map((id, index) => {
    const isLead = index === 0;
    const memberScale = isLead && (node.type === "boss" || node.type === "elite") ? { hp: 1, dmg: 1, share: 1 } : scale;
    return makeEnemy(id, level + (isLead && node.type === "boss" ? 1 : 0), {
      boss: isLead && node.type === "boss",
      affix: isLead ? affix : null,
      scale: { hp: memberScale.hp * power.hp, dmg: memberScale.dmg * power.dmg },
      share: memberScale.share
    });
  });
}

function buildGuardianEncounter(id) {
  const def = ENEMY_DEFINITIONS[id];
  const lead = makeEnemy(id, def.level);
  const adds = (def.startAdds || []).map((addId) => makeEnemy(addId, def.level, { share: 0 }));
  return [lead, ...adds];
}

// Adds a foe in the middle of a fight, for bosses that call for help.
function summonFoe(b, defId, options = {}) {
  const alive = b.foes.filter((foe) => foe.currentHp > 0);
  if (alive.length >= 4) return null;
  const foe = makeEnemy(defId, options.level || b.foes[0].level, { scale: options.scale, share: 0 });
  foe.slot = b.foes.length;
  foe.ct = b.ct.hero + 100 / getSpeed(foe);
  b.foes.push(foe);
  registerFoeTraits(b, foe);
  const target = b.enemy;
  b.enemy = foe;
  pickEnemyIntent(b);
  emit(b, "foeJoin", { name: foe.name });
  b.enemy = target;
  logEvent(b, `На поле боя выходит ${foe.name}.`, "Подмога");
  return foe;
}

// ---------- ENEMY HABITS THAT CARE ABOUT THE GROUP, AND BOSS SCRIPTS ----------
const othersAlive = (b, s) => b.foes.some((foe) => foe.currentHp > 0 && foe !== s.owner);
Object.assign(ENEMY_TRAITS, {
  bodyguard: { name: "Заслон", aura: true, description: "Пока он жив, его союзники получают на 30% меньше урона. Убей его первым или обойди AoE.", on: { beforeHit(b, s, c) { if (b.enemy !== s.owner) c.mult *= 0.7; } } },
  alpha_call: { name: "Зов стаи", aura: true, description: "На 66% и 33% здоровья зовёт двух волков. Пока волки рядом, он получает на 40% меньше урона.", on: {
    beforeHit(b, s, c) { if (b.enemy === s.owner && othersAlive(b, s)) c.mult *= 0.6; },
    enemyTurn(b, s) { if (b.enemy !== s.owner) return; const hp = hpRatio(s.owner); s.calls = s.calls || 0; if ((hp < 0.66 && s.calls === 0) || (hp < 0.33 && s.calls === 1)) { s.calls += 1; emit(b, "phase", { text: "Вожак воет. Стая идёт на зов!" }); summonFoe(b, "wolf", { scale: { hp: 0.45, dmg: 0.55 } }); summonFoe(b, "wolf", { scale: { hp: 0.45, dmg: 0.55 } }); } }
  } },
  pyre_court: { name: "Огненный двор", aura: true, description: "Жаровни кормят Королеву: пока хотя бы одна горит, она лечится на 4% за ход и бьёт сильнее. Потуши их.", on: {
    enemyTurn(b, s) { if (b.enemy === s.owner && othersAlive(b, s)) healUnit(b, s.owner, s.owner.maxHp * 0.04, "жаровня"); },
    incoming(b, s, c) { if (b.enemy === s.owner && othersAlive(b, s)) c.amount *= 1.25; }
  } },
  sealed_tome: { name: "Запретный том", aura: true, description: "Каждый третий свой ход запечатывает твой последний навык на 3 хода. На половине здоровья зовёт рой страниц.", on: {
    enemyTurn(b, s) {
      if (b.enemy !== s.owner) return;
      s.n = (s.n || 0) + 1;
      if (s.n % 3 === 0 && b.repeat?.id && getSkillDefinition(b.repeat.id)) { b.hero.cooldowns[b.repeat.id] = 4; emit(b, "mech", { text: `Том запечатал: ${getSkillDefinition(b.repeat.id).name}` }); logEvent(b, `Архивариус запечатывает навык «${getSkillDefinition(b.repeat.id).name}».`, "Босс"); }
      if (!s.pages && hpRatio(s.owner) < 0.5) { s.pages = true; emit(b, "phase", { text: "Страницы взлетают в воздух!" }); summonFoe(b, "page_swarm"); summonFoe(b, "page_swarm"); }
    }
  } },
  reforge: { name: "Перековка", aura: true, description: "На 66% и 33% здоровья перековывает себя: большой щит и дух наковальни. Удар молота можно сорвать.", on: {
    enemyTurn(b, s) {
      if (b.enemy !== s.owner) return;
      const hp = hpRatio(s.owner);
      s.stage = s.stage || 0;
      if ((hp < 0.66 && s.stage === 0) || (hp < 0.33 && s.stage === 1)) {
        s.stage += 1;
        emit(b, "phase", { text: s.stage === 1 ? "Кузнец бьёт молотом по собственной груди!" : "Горн раскаляется добела!" });
        applyEffect(b, s.owner, { id: "shield", duration: 6, value: Math.round(s.owner.maxHp * 0.15) }, s.owner);
        summonFoe(b, "anvil_spirit");
      }
    }
  } },
  warlord: { name: "Вожак", aura: true, description: "Пока он жив, вся его группа бьёт на 15% сильнее.", on: { incoming(b, s, c) { if (b.enemy !== s.owner) c.amount *= 1.15; } } },
  rally: { name: "Подмога", aura: true, description: "На половине здоровья зовёт подмогу.", on: { enemyTurn(b, s) { if (b.enemy === s.owner && !s.done && hpRatio(s.owner) < 0.5) { s.done = true; emit(b, "phase", { text: `${s.owner.name} зовёт подмогу!` }); const pool = (ENCOUNTERS[Object.keys(ENCOUNTERS).find((key) => ENCOUNTERS[key].flat().includes(s.owner.defId))] || []).flat().filter((id) => !ENEMY_DEFINITIONS[id].guardian); summonFoe(b, randomFrom(pool.length ? pool : ["wolf"]), { scale: { hp: 0.5, dmg: 0.6 } }); } } } },
  iron_will: { name: "Железная воля", description: "Оглушения срабатывают втрое реже, а заряд сорвать вдвое сложнее.", setup(e) { e.stunResist = 0.33; e.chargeHard = 2; } }
});
["cinder_knight", "rune_guard"].forEach((id) => ENEMY_DEFINITIONS[id].traits.push("bodyguard"));
ENEMY_DEFINITIONS.greyfang.traits = ["alpha_call", "packhunter"];
Object.assign(ENEMY_DEFINITIONS.pyre_queen, { traits: ["fireborn", "pyre_court", "burnback"], startAdds: ["brazier", "brazier"] });
ENEMY_DEFINITIONS.archivist.traits = ["bloodless", "scholar", "sealed_tome"];
ENEMY_DEFINITIONS.archivist.mods = { ...ENEMY_DEFINITIONS.archivist.mods, dmg: 1.18 };
ENEMY_DEFINITIONS.smith.traits = ["plate", "growing", "reforge", "iron_will"];
const BOSS_TRAITS = ["warlord", "rally", "iron_will", "growing", "shielded"];

// ---------- SETS ----------
const SET_CATALOG = {
  alpha_hide: { id: "alpha_hide", name: "Шкура Вожака", classes: PHYS_ALL, bonus2: { description: "Убийство лечит на 5% и даёт короткую ярость.", on: { foeDown(b) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.05)); fx(b, "rage", 2, 0.2, { self: true }); } } }, bonus4: { description: "Убийство сразу наносит удар следующей цели с силой 150%.", on: { foeDown(b) { const next = b.foes.find((foe) => foe.currentHp > 0); if (next) { const t = b.enemy; b.enemy = next; procHit(b, 1.5, "Прыжок вожака", "blood", { kind: "physical" }); b.enemy = t; } } } } },
  ash_queen: { id: "ash_queen", name: "Пепел Королевы", classes: ["mage"], bonus2: { description: "Горение переходит с павшего врага на остальных.", on: { foeDown(b, s, c) { spreadEffect(b, c.foe, "burn", 0.8); } } }, bonus4: { description: "Детонация бьёт всех врагов на половину силы.", on: { detonated(b) { splash(b, heroAttack(b) * 1.2, "Волна огня", "fire"); } } } },
  archive_pages: { id: "archive_pages", name: "Страницы Архива", classes: ["mage", "bard"], bonus2: { description: "Новый навык, не такой как прошлый, сокращает все откаты на 1 ход.", on: { afterAction(b, s, c) { if (c.skill && s.last !== c.skill.id) Object.keys(b.hero.cooldowns).forEach((id) => { if (id !== c.skill.id) b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); if (c.skill) s.last = c.skill.id; } } }, bonus4: { description: "Каждый шестой навык срабатывает дважды.", on: { afterAction(b, s, c) { if (!c.skill?.attackType || c.skill.special) return; s.n = (s.n || 0) + 1; if (s.n % 6 === 0 && b.enemy.currentHp > 0) { mechNote(b, "Двойная страница"); performSkillDamage(b, c.skill, 1); } } } } },
  smith_hammer: { id: "smith_hammer", name: "Ковка Кузнеца", classes: ["warrior"], bonus2: { description: "Стойка даёт щит на 10% здоровья и +30 напора.", on: { afterAction(b, s, c) { if (c.type === "guard") { procShield(b, 0.1); b.hero.currentMana = Math.min(100, b.hero.currentMana + 30); } } } }, bonus4: { description: "При полном напоре следующий навык бьёт вдвое и сбрасывает напор до 30.", on: { beforeHit(b, s, c) { if (c.skill && b.hero.currentMana >= 100) { c.mult *= 2; s.fired = true; } }, afterAction(b, s) { if (s.fired) { s.fired = false; b.hero.currentMana = 30; } } } } },
  viper_nest: { id: "viper_nest", name: "Гнездо гадюки", classes: ["archer", "assassin"], bonus2: { description: "Яд переходит с павшего врага на остальных.", on: { foeDown(b, s, c) { spreadEffect(b, c.foe, "poison", 1); } } }, bonus4: { description: "Новая доза яда расползается: все враги получают половину её силы.", on: { applied(b, s, c) { if (c.id === "poison") eachFoe(b, (foe) => { applyEffect(b, foe, { id: "poison", duration: 3, value: Math.max(1, c.value * 0.5) }, b.hero); }, false); } } } },
  crimson_trail: { id: "crimson_trail", name: "Багровый след", classes: PHYS_ALL, bonus2: { description: "Рана с павшего врага вскрывается на остальных.", on: { foeDown(b, s, c) { spreadEffect(b, c.foe, "bleed", 1); } } }, bonus4: { description: "Крит вскрывает раны сразу у всех врагов.", on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) eachFoe(b, (foe) => { const wound = getEffect(foe, "bleed"); if (wound) tickDamageEffect(b, foe, wound, wound.value, "рана вскрылась"); }, false); } } } },
  phantom_veil: { id: "phantom_veil", name: "Вуаль Фантома", classes: ["assassin"], bonus2: { description: "Удар из тени ещё и оглушает на ход с шансом 40%.", mods: {}, on: { afterHit(b, s, c) { const core = b.mech?.core_assassin; if (core?.spent && isDirectHit(c) && roll(0.4)) applyStun(b, b.enemy, b.hero, 1); } } }, bonus4: { description: "«Скрыться» больше не имеет отката, но стоит 30 энергии.", on: { afterAction(b, s, c) { const core = b.mech?.core_assassin; if (c.type === "wait" && core && b.hero.currentMana >= 30) { core.cd = 0; b.hero.currentMana -= 30; } } } } },
  hunter_camp: { id: "hunter_camp", name: "Лагерь ловчего", classes: ["archer"], bonus2: { description: "Сближение врага ставит у него под ногами капкан: замедление.", on: { approached(b) { applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.25 }, b.hero); } } }, bonus4: { description: "«Отойти» также выпускает стрелу по всем врагам.", on: { retreated(b) { eachFoe(b, () => procHit(b, 0.7, "Отходя, стреляет", "steel", { kind: "physical" })); } } } },
  choir_mask: { id: "choir_mask", name: "Маска хора", classes: ["bard"], bonus2: { description: "Мотив сильнее на 40%.", mods: { motifPower: 0.4 } }, bonus4: { description: "Каждый мотив даёт случайную ноту следующему.", on: { motif(b) { const s = b.mech?.core_bard; if (s) s.notes = [randomFrom(["blade", "life", "shade"])]; } } } },
  overheated: { id: "overheated", name: "Раскалённый посох", classes: ["mage"], bonus2: { description: "Предел перегрева выше на 30.", mods: { heatCap: 30 } }, bonus4: { description: "Срыв больше не лишает хода, а взрывает всех врагов.", on: { backfire(b) { removeFx(b.hero, "stun"); splash(b, heroAttack(b) * 1.5, "Срыв", "fire"); procHit(b, 1.5, "Срыв", "fire", { kind: "magic" }); } } } }
};

function getActiveSetCounts(hero) {
  // Two rings of one set are still one piece: a set is assembled from different parts.
  const parts = {};
  Object.values(hero.equipment || {}).forEach((item) => { if (item?.setId && SET_CATALOG[item.setId]) (parts[item.setId] = parts[item.setId] || new Set()).add(item.slotType); });
  return Object.fromEntries(Object.entries(parts).map(([id, slots]) => [id, slots.size]));
}

function getSetPower(count) {
  return count >= 2 ? { dmg: count * 0.025, taken: count * 0.012 } : { dmg: 0, taken: 0 };
}

function getActiveSetBonuses(hero) {
  const bonuses = [];
  Object.entries(getActiveSetCounts(hero)).forEach(([id, count]) => {
    const set = SET_CATALOG[id];
    if (count >= 2) bonuses.push({ ...set.bonus2, id: `${id}-2`, name: `${set.name} (2)` });
    if (count >= 4) bonuses.push({ ...set.bonus4, id: `${id}-4`, name: `${set.name} (4)` });
    if (count >= 6 && set.bonus6) bonuses.push({ ...set.bonus6, id: `${id}-6`, name: `${set.name} (6)` });
    if (count >= 8 && set.bonus8) bonuses.push({ ...set.bonus8, id: `${id}-8`, name: `${set.name} (8)` });
    // Every part makes the whole stronger, on top of the passives.
    const power = getSetPower(count);
    if (power.dmg) bonuses.push({ id: `${id}-power`, name: `${set.name}: сила комплекта`, description: `+${Math.round(power.dmg * 100)}% урона, −${Math.round(power.taken * 100)}% получаемого урона.`, mods: { dmg: power.dmg, taken: -power.taken } });
  });
  return bonuses;
}

function rollSetId(rarity, classKey, forced = false) {
  // Sets come from lairs and bosses only.
  const chance = forced ? 1 : 0;
  if (!roll(chance)) return null;
  const pool = Object.values(SET_CATALOG).filter((set) => !classKey || set.classes.includes(classKey));
  return pool.length ? randomFrom(pool).id : null;
}

// ---------- WHICH SKILLS HIT THE WHOLE GROUP ----------
Object.entries({
  "warrior-savage-swing": 0.7, "warrior-flurry-blades": 0.5, "warrior-carnage": 0.5,
  "mage-cinder-wave": 0.8, "mage-storm-chain": 0.6, "mage-tremor": 0.6, "mage-landslide": 0.7, "mage-elemental-surge": 0.5, "mage-overload": 0.5, "mage-prism": 0.5,
  "archer-needle-rain": 0.7, "archer-arrow-storm": 0.6,
  "bard-sonic-crescendo": 0.8, "bard-thunder-note": 0.5, "bard-cadence": 0.7,
  "assassin-blade-dance": 0.4, "assassin-fume": 1
}).forEach(([id, ratio]) => {
  const skill = SKILL_CATALOG[id];
  if (!skill) return;
  skill.aoe = ratio;
  skill.description = `${skill.description} Задевает всех врагов: ${Math.round(ratio * 100)}% силы по остальным.`;
});
