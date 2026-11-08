// Shop passives: permanent purchases that plug into the active slots. Each one adds a behaviour to an existing effect or action.
// Groups follow the same logic as talent schools: a class only sees what its kit can actually use.
const SHOP_GROUPS = {
  poison: { name: "Яд", classes: ["archer", "assassin"], icon: "poison" },
  bleed: { name: "Кровь", classes: ["warrior", "archer", "assassin"], icon: "bleed" },
  burn: { name: "Огонь", classes: ["mage"], icon: "burn" },
  frost: { name: "Холод", classes: ["mage"], icon: "frost" },
  shock: { name: "Гроза", classes: ["mage"], icon: "shock" },
  stun: { name: "Контроль", classes: ["warrior", "mage", "bard", "archer"], icon: "stun" },
  hex: { name: "Порча", classes: ["mage", "bard"], icon: "weaken" },
  shield: { name: "Щиты", classes: ["warrior", "mage", "bard"], icon: "shield" },
  regen: { name: "Лечение", classes: ["warrior", "mage", "bard"], icon: "regeneration" },
  crit: { name: "Точность", classes: ["warrior", "archer", "assassin", "bard"], icon: "attack" },
  dodge: { name: "Уклонение", classes: ["archer", "assassin", "bard"], icon: "evasion" },
  summon: { name: "Свита", classes: ["mage", "archer", "bard"], icon: "skills" },
  mana: { name: "Мана", icon: "arcane" },
  speed: { name: "Темп", icon: "haste" },
  loot: { name: "Добыча", icon: "gold" },
  combat: { name: "Боевые приёмы", icon: "battle" },
  woe: { name: "Беды врага", icon: "mark" },
  body: { name: "Тело", icon: "fortify" },
  supply: { name: "Припасы", icon: "potionHp" },
  crowd: { name: "Толпа", icon: "battle" },
  ultimate: { name: "Ультимейт", icon: "elite" },
  core_warrior: { name: "Напор", classes: ["warrior"], icon: "rage" },
  core_mage: { name: "Перегрев", classes: ["mage"], icon: "fire" },
  core_archer: { name: "Дистанция", classes: ["archer"], icon: "bow" },
  core_bard: { name: "Мотив", classes: ["bard"], icon: "lyre" },
  core_assassin: { name: "Тень", classes: ["assassin"], icon: "dark" }
};
const SHOP_RANKS = { 1: { price: 150, level: 1 }, 2: { price: 450, level: 15 }, 3: { price: 1200, level: 30 }, 4: { price: 3000, level: 50 } };

function S(effectType, rank, name, description, spec = {}) {
  const count = SHOP_PASSIVE_CATALOG.filter((entry) => entry.effectType === effectType).length;
  SHOP_PASSIVE_CATALOG.push({ id: `shop-${effectType}-${count + 1}`, effectType, rank, name, description, price: SHOP_RANKS[rank].price + count * 10, minLevel: SHOP_RANKS[rank].level, ...spec });
}
// Old entries that only repeated talents are gone. Saves from before Alpha 2.0 get the gold back in normalizeHero.
["melting-resistance", "rising-flame", "deep-freeze"].forEach((id) => { const index = SHOP_PASSIVE_CATALOG.findIndex((entry) => entry.id === id); if (index >= 0) SHOP_PASSIVE_CATALOG.splice(index, 1); });
// The remaining original passives fit the same ladder.
SHOP_PASSIVE_CATALOG.forEach((entry, index) => { entry.rank = 1 + (index % 3); entry.minLevel = SHOP_RANKS[entry.rank].level; entry.price = SHOP_RANKS[entry.rank].price; });

const onHit = (fn) => ({ on: { afterHit(b, s, c) { if (isDirectHit(c)) fn(b, s, c); } } });
const onSkill = (fn) => ({ on: { afterAction(b, s, c) { if (c.type === "skill") fn(b, s, c); } } });
const onStart = (fn) => ({ on: { start: fn } });
const onWin = (fn) => ({ on: { victory: fn } });
const every = (s, n) => { s.n = (s.n || 0) + 1; return s.n % n === 0; };
const healHp = (b, ratio) => { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * ratio)); };
const healMp = (b, ratio) => { b.hero.currentMana = Math.min(b.hero.maxMana, Math.round(b.hero.currentMana + b.hero.maxMana * ratio)); };
const startFx = (unit, id, duration, value, self) => unit.effects.push(self ? { ...normalizeEffectSpec({ id, duration, value }), meta: { fresh: true } } : normalizeEffectSpec({ id, duration, value }));
const ticks = (b, id) => Number(getEffect(b.enemy, id)?.meta?.elapsedTicks || 0);

// ----- POISON: slow, unstoppable, grows with time -----
S("poison", 1, "Настой белладонны", "Новый яд на цели: она хуже видит и чаще промахивается.", { on: { applied(b, s, c) { if (c.id === "poison") applyEffect(b, b.enemy, { id: "blind", duration: 2, value: 10 }, b.hero); } } });
S("poison", 1, "Сухая желчь", "Яд с первого тика разогнан на два шага.", { on: { applied(b, s, c) { const e = getEffect(b.enemy, "poison"); if (c.id === "poison" && e && !e.meta.elapsedTicks) e.meta.elapsedTicks = 2; } } });
S("poison", 2, "Змеиный зуб", "Крит по отравленной цели продлевает яд на 1 ход.", onHit((b, s, c) => { const e = getEffect(b.enemy, "poison"); if (e && c.crit) e.duration += 1; }));
S("poison", 2, "Паралитик", "Каждый тик яда с шансом 8% оглушает цель.", { on: { tick(b, s, c) { if (c.id === "poison" && b.enemy.currentHp > 0 && roll(0.08)) applyStun(b, b.enemy, b.hero, 1); } } });
S("poison", 2, "Гнилая кровь", "Отравленный враг бьёт на 10% слабее.", { on: { incoming(b, s, c) { if (hasFx(b.enemy, "poison")) c.amount *= 0.9; } } });
S("poison", 2, "Яд в дыхании", "Удар по отравленной цели лечит на 1,5%.", onHit((b) => { if (hasFx(b.enemy, "poison")) procHeal(b, 0.015, "дыхание"); }));
S("poison", 3, "Трупный газ", "Победа над отравленной целью лечит на 8%.", onWin((b) => { if (hasFx(b.enemy, "poison")) healHp(b, 0.08); }));
S("poison", 3, "Отравленный ответ", "Яд на тебе в начале хода переходит на врага.", { on: { turnStart(b) { const e = getEffect(b.hero, "poison"); if (e) { removeFx(b.hero, "poison"); fx(b, "poison", e.duration, e.value); } } } });
S("poison", 4, "Королева ядов", "После пяти тиков яд наносит вдвое больше.", { on: { beforeTick(b, s, c) { if (c.id === "poison" && ticks(b, "poison") >= 5) c.amount *= 2; } } });

// ----- BLEED: sudden, fades fast, depends on the target moving -----
S("bleed", 1, "Тяжёлое дыхание", "Кровоточащая цель действует на 10% реже.", { on: { applied(b, s, c) { if (c.id === "bleed") applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.1 }, b.hero); } } });
S("bleed", 1, "Жгут", "Рана на тебе затягивается вдвое быстрее.", { on: { turnStart(b) { const e = getEffect(b.hero, "bleed"); if (e) e.value = Math.max(1, Math.round(e.value * 0.5)); } } });
S("bleed", 2, "Лезвие-пила", "Рана больше не затухает со временем.", { mods: { noBleedDecay: 1 } });
S("bleed", 2, "Открытая артерия", "Каждое третье срабатывание раны бьёт вдвое.", { on: { beforeTick(b, s, c) { if (c.id === "bleed" && every(s, 3)) c.amount *= 2; } } });
S("bleed", 2, "Кровавый азарт", "Срабатывание раны даёт короткую ярость.", { on: { tick(b, s, c) { if (c.id === "bleed" && !hasFx(b.hero, "rage")) applyEffect(b, b.hero, { id: "rage", duration: 1, value: 0.1 }, b.hero); } } });
S("bleed", 2, "Гемофилия", "Рана срабатывает и у оглушённой цели: кровь не ждёт.", { mods: { bleedWhileStunned: 1 } });
S("bleed", 3, "Кровавый след", "По кровоточащей цели твои удары не промахиваются.", { on: { beforeHit(b, s, c) { if (hasFx(b.enemy, "bleed")) c.sure = true; } } });
S("bleed", 3, "Багровый туман", "Крит по кровоточащей цели ослепляет её.", onHit((b, s, c) => { if (c.crit && hasFx(b.enemy, "bleed")) fx(b, "blind", 1, 20); }));
S("bleed", 3, "Кровавая корка", "Срабатывание раны даёт щит на 25% её урона.", { on: { tick(b, s, c) { if (c.id === "bleed" && c.amount > 0) applyEffect(b, b.hero, { id: "shield", duration: 2, value: Math.round(c.amount * 0.25) + effectValue(b.hero, "shield") }, b.hero); } } });
S("bleed", 4, "Кровавая луна", "Каждая третья новая рана сразу выбивает двойной урон.", { on: { applied(b, s, c) { if (c.id === "bleed" && every(s, 3)) procDamage(b, c.value * 2, "Кровавая луна", "blood"); } } });

// ----- BURN -----
S("burn", 1, "Промасленные бинты", "Первое горение в бою сразу на 2 стака.", { on: { applied(b, s, c) { const e = getEffect(b.enemy, "burn"); if (c.id === "burn" && !s.done && e) { s.done = true; e.meta.stacks = Math.min(e.meta.maxStacks, getEffectStacks(e) + 1); } } } });
S("burn", 1, "Живой факел", "Горящий враг, ударив тебя, обжигается о собственный огонь.", { on: { hurt(b, s, c) { const e = getEffect(b.enemy, "burn"); if (e && c.hpDamage > 0) procDamage(b, e.value * 0.6, "Живой факел", "fire"); } } });
S("burn", 1, "Пепельная кожа", "Горение на тебе вдвое слабее.", { on: { turnStart(b) { const e = getEffect(b.hero, "burn"); if (e && !e.meta.ashed) { e.meta.ashed = true; e.value = Math.max(1, Math.round(e.value * 0.5)); } } } });
S("burn", 2, "Кузнечный мех", "Навык по горящей цели продлевает горение на 1 ход.", onSkill((b, s, c) => { const e = getEffect(b.enemy, "burn"); if (e && c.skill.attackType) e.duration += 1; }));
S("burn", 2, "Едкий дым", "Горящая цель кашляет и чаще промахивается.", { on: { applied(b, s, c) { if (c.id === "burn") applyEffect(b, b.enemy, { id: "blind", duration: 2, value: 12 }, b.hero); } } });
S("burn", 2, "Огонь на ветру", "Магический крит добавляет горению стак.", onHit((b, s, c) => { const e = getEffect(b.enemy, "burn"); if (e && c.crit && c.kind === "magic") e.meta.stacks = Math.min(e.meta.maxStacks, getEffectStacks(e) + 1); }));
S("burn", 3, "Закалка огнём", "Пока враг горит, ты получаешь на 8% меньше урона: ты стоишь у самого жара.", { on: { incoming(b, s, c) { if (hasFx(b.enemy, "burn")) c.amount *= 0.92; } } });
S("burn", 4, "Огненная жатва", "Победа над горящей целью возвращает 15% маны.", onWin((b) => { if (hasFx(b.enemy, "burn")) healMp(b, 0.15); }));

// ----- FROST -----
S("frost", 1, "Иней на ресницах", "Цель с инеем чаще промахивается.", { on: { applied(b, s, c) { if (c.id === "frost") applyEffect(b, b.enemy, { id: "blind", duration: 2, value: 12 }, b.hero); } } });
S("frost", 1, "Холодный расчёт мага", "Заклинание по замёрзшей цели дешевле: 3% маны обратно.", onHit((b, s, c) => { if (c.kind === "magic" && hasFx(b.enemy, "frost")) procMana(b, 0.03); }));
S("frost", 2, "Трещины во льду", "Цель с инеем теряет защиту от каждого удара.", onHit((b) => { if (hasFx(b.enemy, "frost")) b.enemy.defShred = Number(b.enemy.defShred || 0) + 2; }));
S("frost", 2, "Заморозка щита", "Щит держится на ход дольше, пока на враге есть иней.", { on: { turnStart(b) { const e = getEffect(b.hero, "shield"); if (e && hasFx(b.enemy, "frost") && !e.meta.iced) { e.meta.iced = true; e.duration += 1; } } } });
S("frost", 3, "Осколки", "Когда цель оттаивает, её режут осколки льда.", { on: { expired(b, s, c) { if (c.id === "freeze" || c.id === "frostbite") procHit(b, 0.8, "Осколки", "frost", { kind: "magic" }); } } });
S("frost", 4, "Вечная мерзлота", "Заморозка всегда оставляет обморожение.", { on: { applied(b, s, c) { if (c.id === "freeze") applyEffect(b, b.enemy, { id: "frostbite", duration: 3, value: 15 }, b.hero); } } });

// ----- SHOCK -----
S("shock", 1, "Медная проволока", "Заряд шока держится на 1 ход дольше.", { mods: { "dur:shock": 1 } });
S("shock", 1, "Гудящий посох", "Первый удар боя сразу заряжает цель шоком.", onStart((b) => startFx(b.enemy, "shock", 3, 0.2)));
S("shock", 2, "Заземление", "Разрядка шока даёт щит на 5% здоровья.", { on: { shockUsed(b) { procShield(b, 0.05); } } });
S("shock", 2, "Озон", "Разрядка шока снимает с цели уклонение: следующий удар точно попадёт.", { on: { shockUsed(b, s) { s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.sure = true; s.ready = false; } } } });
S("shock", 3, "Дуга", "Разрядка шока сокращает все откаты на 1 ход.", { on: { shockUsed(b) { Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); } } });
S("shock", 4, "Сердце бури", "Каждый шок при разрядке вешает на цель новый слабый шок.", { on: { shockUsed(b) { applyEffect(b, b.enemy, { id: "shock", duration: 2, value: 0.1 }, b.hero); } } });

// ----- STUN -----
S("stun", 1, "Звонкая оплеуха", "Оглушение оставляет лёгкую метку: цель уязвима.", { on: { stunned(b) { applyEffect(b, b.enemy, { id: "mark", duration: 2, value: 0.1 }, b.hero); } } });
S("stun", 2, "Правильный момент", "Оглушение тяжёлого удара лечит на 8%.", { on: { interrupted(b) { procHeal(b, 0.08, "момент"); } } });
S("stun", 2, "Сбитый замах", "Сорванный заряд сразу отнимает 8% здоровья цели.", { on: { interrupted(b) { procDamage(b, b.enemy.maxHp * (b.enemy.isBoss ? 0.03 : 0.08), "Выбитый меч", "steel"); } } });
S("stun", 4, "Глухота", "Очнувшись от оглушения, цель ещё 2 хода бьёт на 15% слабее.", { on: { stunned(b) { applyEffect(b, b.enemy, { id: "weaken", duration: 2, value: 0.15 }, b.hero); } } });

// ----- HEX -----
S("hex", 1, "Дурной глаз", "Метка на цели снижает её меткость.", { on: { applied(b, s, c) { if (c.id === "mark") applyEffect(b, b.enemy, { id: "blind", duration: 2, value: 10 }, b.hero); } } });
S("hex", 1, "Шипение порчи", "Порча с каждым тиком слабит цель всё сильнее.", { on: { tick(b, s, c) { if (c.id === "corruption") applyEffect(b, b.enemy, { id: "weaken", duration: 1, value: 0.1 }, b.hero); } } });
S("hex", 2, "Сосуд страданий", "Каждая новая беда возвращает 2% маны.", { on: { applied(b) { procMana(b, 0.02); } } });
S("hex", 2, "Высасывание", "Ослабленная цель отдаёт силу: удары по ней лечат на 2%.", onHit((b) => { if (hasFx(b.enemy, "weaken")) procHeal(b, 0.02, "высасывание"); }));
S("hex", 3, "Ткань судьбы", "Когда метка спадает, её тут же сменяет слабость.", { on: { expired(b, s, c) { if (c.id === "mark") fx(b, "weaken", 2, 0.15); } } });
S("hex", 3, "Гнойная рана", "Порча мешает лечиться: цель получает глубокую рану.", { on: { applied(b, s, c) { if (c.id === "corruption") applyEffect(b, b.enemy, { id: "wound", duration: 3 }, b.hero); } } });
S("hex", 4, "Пепел имени", "При трёх бедах следующий удар бьёт как критический.", { on: { beforeHit(b, s, c) { if (!c.proc && countEnemyDebuffs(b.enemy) >= 3 && every(s, 2)) c.forceCrit = true; } } });

// ----- SHIELD -----
S("shield", 1, "Заплатка", "Первый щит в бою прочнее на 50%.", { on: { start(b) { b.firstShieldBoost = true; } } });
S("shield", 1, "Звенящий щит", "Лопнувший щит оглушает врага с шансом 15%.", { on: { hurt(b, s, c) { if (c.absorbed > 0 && !hasFx(b.hero, "shield")) applyStun(b, b.enemy, b.hero, 0.15); } } });
S("shield", 2, "Запасная пластина", "Лопнувший щит лечит на 3%.", { on: { hurt(b, s, c) { if (c.absorbed > 0 && !hasFx(b.hero, "shield")) procHeal(b, 0.03, "пластина"); } } });
S("shield", 2, "Удар щитом", "Под щитом твои удары сильнее на 10%.", { on: { beforeHit(b, s, c) { if (hasFx(b.hero, "shield")) c.mult *= 1.1; } } });
S("shield", 2, "Щит из маны", "Поглощённый щитом удар возвращает 3% маны.", { on: { hurt(b, s, c) { if (c.absorbed > 0) procMana(b, 0.03); } } });
S("shield", 3, "Башня", "Щит снимает и беды: шанс 25% очистить одну при поглощении.", { on: { hurt(b, s, c) { if (c.absorbed > 0 && roll(0.25)) { const bad = b.hero.effects.find((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad"); if (bad) removeFx(b.hero, bad.id); } } } });
S("shield", 4, "Эгида", "Пока щит цел, тяжёлые удары слабее ещё на 30%.", { on: { incoming(b, s, c) { if (c.heavy && hasFx(b.hero, "shield")) c.amount *= 0.7; } } });

// ----- REGEN -----
S("regen", 1, "Травяной сбор", "Регенерация снимает с тебя кровотечение.", { on: { regenTick(b) { removeFx(b.hero, "bleed"); } } });
S("regen", 1, "Тёплый отвар", "Под регенерацией ты получаешь на 5% меньше урона.", { on: { incoming(b, s, c) { if (hasFx(b.hero, "regeneration")) c.amount *= 0.95; } } });
S("regen", 2, "Щедрая рука", "Лечение от 10% здоровья даёт ещё и короткое ускорение.", { on: { heal(b, s, c) { if (c.amount >= b.hero.maxHp * 0.1) applyEffect(b, b.hero, { id: "haste", duration: 1, value: 0.15 }, b.hero); } } });
S("regen", 2, "Кровь и трава", "Каждое лечение снимает яд с тебя.", { on: { heal(b, s, c) { if (c.amount > 0) removeFx(b.hero, "poison"); } } });
S("regen", 3, "Отзвук жизни", "Тик регенерации ещё и бьёт врага на 1% твоего здоровья.", { on: { regenTick(b) { procDamage(b, b.hero.maxHp * 0.01, "Глубокий вдох", "holy"); } } });
S("regen", 3, "Запас прочности", "Лечение сверх полного здоровья повышает его запас до конца боя.", { on: { heal(b, s, c) { if (c.overflow > 0) { b.hero.maxHp += Math.round(c.overflow * 0.1); } } } });
S("regen", 4, "Феникс", "Падая ниже 15% здоровья раз за бой, сразу лечишься на 25%.", { on: { hurt(b, s) { if (!s.used && b.hero.currentHp > 0 && hpRatio(b.hero) < 0.15) { s.used = true; procHeal(b, 0.25, "феникс"); } } } });

// ----- CRIT -----
S("crit", 1, "Счастливый нож", "Каждый пятый удар всегда критический.", { on: { beforeHit(b, s, c) { if (!c.proc && every(s, 5)) c.forceCrit = true; } } });
S("crit", 1, "Найти слабину", "Крит снижает защиту цели.", onHit((b, s, c) => { if (c.crit) b.enemy.defShred = Number(b.enemy.defShred || 0) + 4; }));
S("crit", 2, "Глазомер", "Крит сокращает самый долгий откат на 1 ход.", onHit((b, s, c) => { if (!c.crit) return; const id = Object.keys(b.hero.cooldowns).sort((x, y) => b.hero.cooldowns[y] - b.hero.cooldowns[x])[0]; if (id) b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }));
S("crit", 2, "Кровь на рукояти", "Крит ускоряет следующее действие.", onHit((b, s, c) => { if (c.crit) applyEffect(b, b.hero, { id: "haste", duration: 1, value: 0.2 }, b.hero); }));
S("crit", 3, "Третий глаз", "Без крита три удара подряд: четвёртый критический.", { on: { beforeHit(b, s, c) { if (!c.proc && (s.miss || 0) >= 3) c.forceCrit = true; }, afterHit(b, s, c) { if (isDirectHit(c)) s.miss = c.crit ? 0 : (s.miss || 0) + 1; } } });
S("crit", 4, "Кровавое мастерство", "Крит возвращает мастерству навыка лишнее применение.", onHit((b, s, c) => { if (c.crit && c.skill) grantSkillExperience(b.hero, c.skill.id); }));

// ----- DODGE -----
S("dodge", 1, "Плащ на ветру", "Уклонившись, враг теряет темп: он замедлен.", { on: { dodged(b) { applyEffect(b, b.enemy, { id: "slow", duration: 1, value: 0.2 }, b.hero); } } });
S("dodge", 1, "Лёгкая походка", "Уклонение возвращает 3% маны.", { on: { dodged(b) { procMana(b, 0.03); } } });
S("dodge", 2, "Подставить врага", "Уклонившись, метишь врага.", { on: { dodged(b) { applyEffect(b, b.enemy, { id: "mark", duration: 2, value: 0.15 }, b.hero); } } });
S("dodge", 2, "Обманка", "Два уклонения подряд дают следующий удар как крит.", { on: { dodged(b, s) { s.n = (s.n || 0) + 1; }, hurt(b, s, c) { if (c.hpDamage > 0) s.n = 0; }, beforeHit(b, s, c) { if ((s.n || 0) >= 2 && !c.proc) { c.forceCrit = true; s.n = 0; } } } });
S("dodge", 3, "Уйти в сторону", "Уклонение от тяжёлого удара стоит врагу 10% скорости на 2 хода.", { on: { dodged(b) { if (b.intent?.heavy) applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.15 }, b.hero); } } });
S("dodge", 4, "Вторая тень", "После уклонения следующий удар бьёт ещё и тенью на 40%.", { on: { dodged(b, s) { s.ready = true; }, afterHit(b, s, c) { if (s.ready && isDirectHit(c)) { s.ready = false; procHit(b, 0.4, "Вторая тень", "dark"); } } } });

// ----- SUMMON -----
S("summon", 2, "Приказ", "Навык с уроном заставляет существ метить цель.", onSkill((b, s, c) => { if (c.skill.attackType && (b.hero.summonedUnits || []).length && !hasFx(b.enemy, "mark")) applyEffect(b, b.enemy, { id: "mark", duration: 1, value: 0.1 }, b.hero); }));
S("summon", 2, "Прикрыть хозяина", "Тяжёлый удар врага чаще принимает на себя существо.", { on: { incoming(b, s, c) { const unit = (b.hero.summonedUnits || [])[0]; if (c.heavy && unit) { unit.taunt = Math.max(1, Number(unit.taunt || 0)); } } } });
S("summon", 3, "Кровный договор", "Существо, погибая, снимает с тебя все беды.", { on: { summonDeath(b) { b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });
S("summon", 3, "Живой щит", "Гибель существа даёт тебе щит на 6% здоровья.", { on: { summonDeath(b) { procShield(b, 0.06); } } });
S("summon", 4, "Вторая служба", "Первое погибшее в бою существо возвращается с половиной сил.", { on: { summonDeath(b, s, c) { if (!s.used && !c.summon.persistent) { s.used = true; addSummon(b, { ...c.summon, id: uid("summon"), hp: Math.max(1, Math.round(c.summon.maxHp * 0.5)), duration: 3 }); } } } });

// ----- MANA -----
S("mana", 1, "Сберегающий узел", "Навык дороже 15 маны стоит на 2 дешевле: возврат после применения.", onSkill((b, s, c) => { if (getSkillResourceCost(c.skill, b.hero) > 15) b.hero.currentMana = Math.min(b.hero.maxMana, b.hero.currentMana + 2); }));
S("mana", 3, "Выжать досуха", "При мане ниже половины навык с уроном сильнее на 12%.", { on: { beforeHit(b, s, c) { if (c.skill && b.hero.currentMana / b.hero.maxMana < 0.5) c.mult *= 1.12; } } });
S("mana", 4, "Два дыхания", "«Выждать» возвращает ещё 15% маны и снимает откат самого свежего навыка.", { on: { afterAction(b, s, c) { if (c.type === "wait") { procMana(b, 0.15); const id = b.repeat?.id; if (id) delete b.hero.cooldowns[id]; } } } });

// ----- SPEED -----
S("speed", 1, "Рывок", "Первое действие в бою занимает на 30% меньше времени.", { on: { afterAction(b, s, c) { if (!s.done) { s.done = true; c.tempo *= 0.7; } } } });
S("speed", 2, "Кража хода", "Замедленный враг отдаёт темп: твои быстрые навыки ещё быстрее.", { on: { afterAction(b, s, c) { if (hasFx(b.enemy, "slow") && Number(c.skill?.tempo || 1) < 1) c.tempo *= 0.85; } } });

// ----- LOOT -----
S("loot", 4, "Счастливая звезда", "Золота, добычи и опыта больше на 10%.", { mods: { gold: 0.1, drop: 0.1, xp: 0.1 } });

// ----- COMBAT: for everyone, the rhythm of your actions -----
S("combat", 1, "Третий удар", "Каждый третий удар сильнее на 35%.", { on: { beforeHit(b, s, c) { if (!c.proc && every(s, 3)) c.mult *= 1.35; } } });
S("combat", 1, "Простая работа", "Обычный удар сильнее на 40%.", { on: { beforeHit(b, s, c) { if (!c.skill && !c.proc) c.mult *= 1.4; } } });
S("combat", 1, "Чередование", "Навык, отличный от прошлого, сильнее на 10%.", { on: { beforeHit(b, s, c) { if (c.skill && s.last && s.last !== c.skill.id) c.mult *= 1.1; }, afterAction(b, s, c) { if (c.skill) s.last = c.skill.id; } } });
S("combat", 1, "Размять плечи", "Стойка даёт ярость на 2 хода.", { on: { afterAction(b, s, c) { if (c.type === "guard") fx(b, "rage", 2, 0.1, { self: true }); } } });
S("combat", 1, "Выжидание охотника", "После «Выждать» следующий удар всегда критический.", { on: { afterAction(b, s, c) { if (c.type === "wait") s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.forceCrit = true; s.ready = false; } } } });
S("combat", 1, "Сквозь щит", "По цели со щитом удары сильнее на 40%.", { on: { beforeHit(b, s, c) { if (hasFx(b.enemy, "shield")) c.mult *= 1.4; } } });
S("combat", 2, "Откат в руке", "Обычный удар сокращает все откаты на 1 ход.", { on: { afterAction(b, s, c) { if (c.type === "attack") Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); } } });
S("combat", 2, "Короткий приём", "Быстрый навык возвращает 3% маны.", onSkill((b, s, c) => { if (Number(c.skill.tempo || 1) < 1) procMana(b, 0.03); }));
S("combat", 2, "Дорогая цена", "Навык дороже 20 сильнее на 15%.", { on: { beforeHit(b, s, c) { if (c.skill && getSkillResourceCost(c.skill, b.hero) >= 20) c.mult *= 1.15; } } });
S("combat", 2, "Ответ из стойки", "Удар по тебе в стойке сразу возвращается ударом.", { on: { hurt(b, s, c) { if (c.blocked > 0) procHit(b, 0.6, "Контрвыпад", "steel"); } } });
S("combat", 2, "Смена хвата", "Смена навыка убирает 15% привыкания у следующего.", { mods: { habitEase: 0.15 } });
S("combat", 3, "Сорванный замысел", "Сорванный заряд лечит на 10% и возвращает 10% маны.", { on: { interrupted(b) { procHeal(b, 0.1, "замысел"); procMana(b, 0.1); } } });
S("combat", 3, "Чтение врага", "Пока враг готовит тяжёлый удар, ты бьёшь на 20% сильнее.", { on: { beforeHit(b, s, c) { if (b.intent?.heavy) c.mult *= 1.2; } } });
S("combat", 3, "Охотник на вожаков", "Удары по боссам и стражам сильнее на 12%.", { on: { beforeHit(b, s, c) { if (b.enemy.isBoss) c.mult *= 1.12; } } });
S("combat", 3, "Гроза элиты", "Удары по элите сильнее на 15%.", { on: { beforeHit(b, s, c) { if (b.enemy.isElite) c.mult *= 1.15; } } });
S("combat", 4, "Мертвая хватка", "По цели ниже 15% здоровья все удары критические.", { on: { beforeHit(b, s, c) { if (hpRatio(b.enemy) < 0.15) c.forceCrit = true; } } });

// ----- WOE: any bad effect on the enemy, whatever its source -----
S("woe", 1, "Дурная примета", "В начале боя цель раскрыта на 2 хода.", onStart((b) => startFx(b.enemy, "exposed", 2, 10)));
S("woe", 1, "Жалкое зрелище", "Первая беда на враге лечит тебя на 3%.", { on: { applied(b, s) { if (!s.done) { s.done = true; procHeal(b, 0.03, "зрелище"); } } } });
S("woe", 2, "Жестокий счёт", "При четырёх бедах удар сильнее на 30%.", { on: { beforeHit(b, s, c) { if (countEnemyDebuffs(b.enemy) >= 4) c.mult *= 1.3; } } });
S("woe", 2, "Переносчик", "Новая беда продлевает самую короткую из старых на 1 ход.", { on: { applied(b) { const bad = (b.enemy.effects || []).filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad" && e.id !== "stun" && e.id !== "freeze").sort((x, y) => x.duration - y.duration)[0]; if (bad) bad.duration += 1; } } });
S("woe", 2, "Без лечения", "В начале боя цель получает глубокую рану на 3 хода.", onStart((b) => startFx(b.enemy, "wound", 3, 0)));
S("woe", 3, "Затягивающаяся петля", "Истёкшая беда снижает скорость цели на 2 хода.", { on: { expired(b, s, c) { if (c.unit === b.enemy && STATUS_EFFECT_DEFINITIONS[c.id]?.tone === "bad" && c.id !== "slow") applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.1 }, b.hero); } } });
S("woe", 3, "Открытые раны", "Две беды на враге дают +8% шанса крита.", { on: { beforeHit(b, s, c) { if (countEnemyDebuffs(b.enemy) >= 2) c.critBonus += 8; } } });
S("woe", 4, "Последняя капля", "Пятая беда сразу наносит 10% оставшегося здоровья цели.", { on: { applied(b, s) { if (!s.done && countEnemyDebuffs(b.enemy) >= 5) { s.done = true; procDamage(b, b.enemy.currentHp * 0.1, "Последняя капля", "dark"); } } } });

// ----- BODY: your own health as a resource -----
S("body", 1, "Кольчуга под рубахой", "Первые два удара по тебе слабее на 30%.", { on: { incoming(b, s, c) { s.n = (s.n || 0) + 1; if (s.n <= 2) c.amount *= 0.7; } } });
S("body", 1, "Адреналин", "Рана от 20% здоровья ускоряет тебя.", { on: { hurt(b, s, c) { if (c.hpDamage >= b.hero.maxHp * 0.2) fx(b, "haste", 2, 0.25, { self: true }); } } });
S("body", 2, "Против железа", "Физические удары по тебе слабее на 8%.", { on: { incoming(b, s, c) { if (c.kind === "physical") c.amount *= 0.92; } } });
S("body", 2, "Против чар", "Магические удары по тебе слабее на 8%.", { on: { incoming(b, s, c) { if (c.kind === "magic") c.amount *= 0.92; } } });
S("body", 3, "Стальные нервы", "Первое оглушение в бою на тебя не действует.", { on: { turnStart(b, s) { const stun = getEffect(b.hero, "stun"); if (stun && !s.used) { s.used = true; removeFx(b.hero, "stun"); } } } });
S("body", 3, "Выдержка", "Смертельный удар раз за бой оставляет 10% здоровья, если до него было больше 40%.", { on: { hurt(b, s) { if (b.hero.currentHp <= 0 && !s.used && s.hp > 0.4) { s.used = true; b.hero.currentHp = Math.round(b.hero.maxHp * 0.1); } s.hp = hpRatio(b.hero); } } });
S("body", 4, "Воля к жизни", "Каждая беда на тебе в начале хода лечит на 1,5%.", { on: { turnStart(b) { const bad = (b.hero.effects || []).filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad").length; if (bad) procHeal(b, 0.015 * bad, "воля"); } } });

// ----- SUPPLY: potions and the road between fights -----
S("supply", 1, "Зелье ярости", "Зелье даёт ярость на 2 хода.", { on: { afterAction(b, s, c) { if (c.type === "potion") fx(b, "rage", 2, 0.2, { self: true }); } } });
S("supply", 2, "Глоток смелости", "Зелье даёт щит на 10% здоровья.", { on: { afterAction(b, s, c) { if (c.type === "potion") procShield(b, 0.1); } } });
S("supply", 2, "Противоядие", "Зелье снимает с тебя все беды.", { on: { afterAction(b, s, c) { if (c.type === "potion") b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });
S("supply", 2, "Кровь врагов", "Победа лечит на 5%.", onWin((b) => healHp(b, 0.05)));
S("supply", 3, "Точильный камень", "В начале боя твой первый навык сильнее на 30%.", { on: { beforeHit(b, s, c) { if (c.skill && !s.done) { s.done = true; c.mult *= 1.3; } } } });
S("supply", 4, "Запасной пояс", "Победа над элитой или вожаком возвращает зелье лечения.", onWin((b) => { if ((b.enemy.isElite || b.enemy.isBoss) && b.hero.potions.hp < POTION_LIMIT) b.hero.potions.hp += 1; }));

// ----- CROWD: only group fights make these matter -----
const kills = (fn) => ({ on: { foeDown: fn } });
S("crowd", 1, "Один против всех", "Каждый живой враг сверх первого даёт +6% твоего урона.", { on: { beforeHit(b, s, c) { c.mult *= 1 + Math.max(0, livingFoes(b).length - 1) * 0.06; } } });
S("crowd", 1, "Последний в строю", "По последнему живому врагу в группе удары сильнее на 20%.", { on: { beforeHit(b, s, c) { if (b.foes.length > 1 && livingFoes(b).length === 1) c.mult *= 1.2; } } });
S("crowd", 1, "Чёрная метка", "Смена цели раскрывает новую цель на 2 хода.", { on: { beforeHit(b, s, c) { if (c.proc) return; if (s.last && s.last !== b.enemy) applyEffect(b, b.enemy, { id: "exposed", duration: 2, value: 15 }, b.hero); s.last = b.enemy; } } });
S("crowd", 2, "Резня", "Убийство сокращает все откаты на 1 ход.", kills((b) => { Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); }));
S("crowd", 2, "Страх", "Убийство с шансом 25% оглушает остальных врагов.", kills((b, s, c) => { eachFoe(b, (foe) => { if (foe !== c.foe) applyStun(b, foe, b.hero, 0.25); }); }));
S("crowd", 2, "Взрывная смерть", "Павший враг наносит остальным 8% своего запаса здоровья.", kills((b, s, c) => { splash(b, c.foe.maxHp * 0.08, "Взрыв"); }));
S("crowd", 2, "Хаос в рядах", "Удар врага с шансом 15% достаётся его соседу.", { on: { incoming(b, s, c) { const other = b.foes.find((foe) => foe !== b.enemy && foe.currentHp > 0); if (other && roll(0.15)) { dealDamage(b, other, c.amount); logEvent(b, `${b.enemy.name} задевает союзника.`, "Хаос"); c.parried = true; } } } });
S("crowd", 3, "Упрямый удар", "Удары по одной цели подряд сильнее на 5% каждый, до 25%.", { on: { beforeHit(b, s, c) { if (c.proc) return; s.n = s.last === b.enemy ? Math.min(5, (s.n || 0) + 1) : 0; s.last = b.enemy; c.mult *= 1 + s.n * 0.05; } } });
S("crowd", 3, "Обрезать снабжение", "Лекари и защитники группы получают на 25% больше урона.", { on: { beforeHit(b, s, c) { if ((b.enemy.moves || []).some((id) => String(ENEMY_MOVES[id]?.kind).startsWith("ally"))) c.mult *= 1.25; } } });
S("crowd", 3, "Прикрывшись телом", "Пока жив больше чем один враг, каждый второй удар по тебе слабее на 25%.", { on: { incoming(b, s, c) { s.n = (s.n || 0) + 1; if (livingFoes(b).length > 1 && s.n % 2 === 0) c.amount *= 0.75; } } });
S("crowd", 4, "Цепная расправа", "Навык, убивший цель, сразу повторяется по следующей на 60%.", { on: { afterAction(b, s, c) { if (c.skill?.attackType && !c.skill.special && b.enemy.currentHp <= 0) { const next = livingFoes(b)[0]; if (next) { b.enemy = next; performSkillDamage(b, c.skill, 0.6); } } } } });

// ----- ULTIMATE -----
S("ultimate", 1, "Заряженный", "Бой начинается с 30% заряда ультимейта.", onStart((b) => { b.ult = 30; }));
S("ultimate", 2, "Последняя надежда", "Ниже 30% здоровья раны заряжают ультимейт втрое сильнее.", { on: { hurt(b, s, c) { if (c.hpDamage > 0 && hpRatio(b.hero) < 0.3) b.ult = Math.min(100, b.ult + ULT_ON_HURT * 2); } } });
S("ultimate", 2, "Перезарядка", "Ультимейт снимает все откаты навыков.", { on: { afterAction(b, s, c) { if (c.type === "ult") b.hero.cooldowns = {}; } } });
S("ultimate", 2, "Трофей", "Убийство заряжает ультимейт ещё на 15%.", kills((b) => { b.ult = Math.min(100, b.ult + 15); }));
S("ultimate", 3, "Занавес", "Ультимейт лечит на 15%.", { on: { afterAction(b, s, c) { if (c.type === "ult") procHeal(b, 0.15, "занавес"); } } });
S("ultimate", 3, "Звонкая тишина", "После ультимейта все враги замедлены на 2 хода.", { on: { afterAction(b, s, c) { if (c.type === "ult") eachFoe(b, () => { applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.3 }, b.hero); }); } } });
S("ultimate", 4, "Вторая волна", "После ультимейта заряд сразу 40%.", { on: { afterAction(b, s, c) { if (c.type === "ult") b.ult = 40; } } });

// ----- CLASS CORES: the most personal purchases -----
const mana = (b) => b.hero.currentMana;
const addRage = (b, n) => { b.hero.currentMana = Math.min(100, b.hero.currentMana + n); };
S("core_warrior", 1, "Закипание", "Каждый ход без раны даёт 8 напора: ты ждёшь и злишься.", { on: { turnStart(b, s) { if (!s.hurt) addRage(b, 8); s.hurt = false; }, hurt(b, s, c) { if (c.hpDamage > 0) s.hurt = true; } } });
S("core_warrior", 1, "Кровь с лезвия", "Напор выше 50 возвращает тебе 1% здоровья за удар.", onHit((b) => { if (mana(b) > 50) procHeal(b, 0.01, "отдача"); }));
S("core_warrior", 1, "Шаг вперёд", "Первый удар боя сразу даёт 30 напора.", onHit((b, s) => { if (!s.done) { s.done = true; addRage(b, 30); } }));
S("core_warrior", 2, "Рвущий напор", "Навык, потративший от 20 напора, оставляет рану.", onSkill((b, s, c) => { if (getSkillResourceCost(c.skill, b.hero) >= 20) fx(b, "bleed", 2, dotValue(b, 0.15)); }));
S("core_warrior", 2, "Щит из злости", "«Собраться» даёт щит на 8% здоровья.", { on: { afterAction(b, s, c) { if (c.type === "wait") procShield(b, 0.08); } } });
S("core_warrior", 2, "Широкая спина", "Размах слабее не становится: каждый задетый враг даёт 5 напора.", onHit((b, s, c) => { if (!c.skill) addRage(b, Math.max(0, livingFoes(b).length - 1) * 5); }));
S("core_warrior", 2, "Сорвать голос", "При напоре 70+ стойка снимает с тебя все беды.", { on: { afterAction(b, s, c) { if (c.type === "guard" && mana(b) >= 70) b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });
S("core_warrior", 3, "Ответ на удар", "Удар в стойку сразу отвечает размахом по всем.", { on: { hurt(b, s, c) { if (c.blocked > 0) eachFoe(b, () => procHit(b, 0.4, "Ответ", "steel", { kind: "physical" })); } } });
S("core_warrior", 3, "Всё или ничего", "Навык при полном напоре тратит весь напор и бьёт на +1% за единицу.", { on: { beforeHit(b, s, c) { if (c.skill && mana(b) >= 100) { c.mult *= 2; s.fire = true; } }, afterAction(b, s) { if (s.fire) { s.fire = false; b.hero.currentMana = 0; } } } });
S("core_warrior", 3, "Живучий напор", "Смертельный удар раз за бой тратит весь напор и оставляет здоровье, равное напору в процентах.", { on: { hurt(b, s) { if (b.hero.currentHp <= 0 && !s.used && mana(b) >= 20) { s.used = true; b.hero.currentHp = Math.round(b.hero.maxHp * mana(b) / 100); b.hero.currentMana = 0; mechNote(b, "Живучий напор"); } } } });
S("core_warrior", 4, "Вечный бой", "Обычный удар бьёт на 25% сильнее за каждого живого врага.", { on: { beforeHit(b, s, c) { if (!c.skill && !c.proc) c.mult *= 1 + livingFoes(b).length * 0.25; } } });

S("core_mage", 1, "Жаропрочная мантия", "Срыв отнимает вдвое меньше здоровья.", { mods: { backfire: -0.5 } });
S("core_mage", 1, "Сухой пар", "Перегрев от 40 даёт щит на 2% здоровья в начале хода.", { on: { turnStart(b) { if ((coreState(b)?.value || 0) >= 40) procShield(b, 0.02); } } });
S("core_mage", 1, "Первая вспышка", "Первое заклинание боя греет вдвое меньше.", onSkill((b, s, c) => { const core = coreState(b); if (!s.done && core) { s.done = true; core.value = Math.max(0, core.value - heatOfSkill(c.skill, b.hero) / 2); } }));
S("core_mage", 2, "Топливо", "Перегрев от 60: каждое заклинание возвращает 3% маны.", onSkill((b) => { if ((coreState(b)?.value || 0) >= 60) procMana(b, 0.03); }));
S("core_mage", 2, "Вентиляция", "«Медитация» снимает весь перегрев, а не половину.", { on: { afterAction(b, s, c) { const core = coreState(b); if (c.type === "wait" && core) core.value = 0; } } });
S("core_mage", 2, "Красная черта", "Перегрев от 85: шанс крита выше на 25%.", { on: { beforeHit(b, s, c) { if ((coreState(b)?.value || 0) >= 85) c.critBonus += 25; } } });
S("core_mage", 2, "Топка", "Заклинания греют на 25% сильнее, зато и магия от жара растёт быстрее.", { mods: { heatGain: 0.25 }, on: { beforeHit(b, s, c) { if (c.kind === "magic") c.mult *= 1 + (coreState(b)?.value || 0) * 0.001; } } });
S("core_mage", 3, "Огненный выдох", "Срыв обжигает всех врагов.", { on: { backfire(b) { eachFoe(b, () => fx(b, "burn", 2, dotValue(b, 0.2))); } } });
S("core_mage", 3, "Жар в крови", "Перегрев от 70: лечение сильнее на 30%.", { on: { beforeHeal(b, s, c) { if ((coreState(b)?.value || 0) >= 70) c.amount *= 1.3; } } });
S("core_mage", 3, "Сброс давления", "Обычный удар при перегреве от 60 бьёт всех врагов.", { on: { afterAction(b, s, c) { if (c.type === "attack" && (coreState(b)?.value || 0) >= 48) eachFoe(b, () => procHit(b, 0.5, "Сброс давления", "fire", { kind: "magic" }), false); } } });
S("core_mage", 4, "Солнце в руках", "Предел перегрева выше на 50, но срыв теперь оглушает на 2 хода.", { mods: { heatCap: 50 }, on: { backfire(b) { const e = getEffect(b.hero, "stun"); if (e) e.duration = 2; } } });

S("core_archer", 1, "Лёгкий колчан", "На дальней дистанции стрелы не тратят выдержку на 15% чаще.", { on: { afterAction(b, s, c) { if (c.skill && coreState(b)?.value >= 3 && roll(0.15)) b.hero.currentMana = Math.min(b.hero.maxMana, b.hero.currentMana + getSkillResourceCost(c.skill, b.hero)); } } });
S("core_archer", 1, "Шипы на тропе", "Сближение врага стоит ему 4% здоровья.", { on: { approached(b) { procDamage(b, b.enemy.maxHp * (b.enemy.isBoss ? 0.01 : 0.04), "Шипы", "steel"); } } });
S("core_archer", 1, "Чуткий сон", "Первый удар врага по тебе вплотную слабее на 30%.", { on: { incoming(b, s, c) { if (!s.done && coreState(b)?.value === 0) { s.done = true; c.amount *= 0.7; } } } });
S("core_archer", 2, "Прострел", "Вплотную стрела пробивает цель насквозь: сосед получает 40%.", onHit((b, s, c) => { if (coreState(b)?.value === 0) splash(b, c.hpDamage * 0.4, "Прострел"); }));
S("core_archer", 2, "Держать линию", "«Отойти» оставляет за собой капкан: следующий подошедший оглушён.", { on: { retreated(b, s) { s.trap = true; }, approached(b, s) { if (s.trap) { s.trap = false; applyStun(b, b.enemy, b.hero, 1); } } } });
S("core_archer", 2, "Дальнозоркий", "С дальней дистанции шанс крита выше на 15%.", { on: { beforeHit(b, s, c) { if (coreState(b)?.value >= 3) c.critBonus += 15; } } });
S("core_archer", 2, "Дымный отход", "«Отойти» снимает все беды.", { on: { retreated(b) { b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });
S("core_archer", 3, "Пришпилить", "Крит с дальней дистанции не даёт цели подойти на 1 ход: она замедлена.", onHit((b, s, c) => { if (c.crit && coreState(b)?.value >= 2) fx(b, "slow", 1, 0.5); }));
S("core_archer", 3, "Выбор цели", "Стрела по цели, которая ещё не подошла, сильнее на 15%, пока ты не ранен.", { on: { beforeHit(b, s, c) { if (hpRatio(b.hero) >= 1) c.mult *= 1.15; } } });
S("core_archer", 3, "Отбежать на скорости", "«Отойти» занимает вдвое меньше времени.", { on: { retreated(b, s) { s.fast = true; }, afterAction(b, s, c) { if (s.fast && c.type === "wait") { s.fast = false; c.tempo *= 0.5; } } } });
S("core_archer", 4, "Тяжёлые удары не страшны", "Тяжёлый удар на дальней дистанции уходит мимо.", { on: { incoming(b, s, c) { if (c.heavy && coreState(b)?.value >= 3) c.parried = true; } } });

S("core_bard", 1, "Камертон-вилка", "Любая нота возвращает 2% дыхания.", { on: { afterAction(b, s, c) { if (bardNoteOf(c)) procMana(b, 0.02); } } });
S("core_bard", 1, "Тёплый приём", "Гимн также снимает все беды.", { on: { motif(b, s, c) { if (c.same === 1) b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });
S("core_bard", 1, "Разминка", "Первый мотив боя сильнее вдвое.", { mods: { motifPower: 0.15 } });
S("core_bard", 2, "Сбивка ритма", "Аккорд сбивает врагов: все ошеломлены.", { on: { motif(b, s, c) { if (c.same === 3) eachFoe(b, () => { applyEffect(b, b.enemy, { id: "stagger", duration: 2, value: 0.2 }, b.hero); }); } } });
S("core_bard", 2, "Частушка", "Каждый мотив наносит всем врагам небольшой урон.", { on: { motif(b) { splash(b, heroAttack(b) * 0.4, "Частушка", "air"); procHit(b, 0.4, "Частушка", "air", { kind: "magic" }); } } });
S("core_bard", 2, "Держать ноту", "Стойка не сбивает мотив и даёт 8% дыхания.", { on: { afterAction(b, s, c) { if (c.type === "guard") procMana(b, 0.08); } } });
S("core_bard", 3, "Контрапункт", "Смена ноты подряд усиливает следующий удар на 10%.", { on: { afterAction(b, s, c) { const note = bardNoteOf(c); if (note) { s.bonus = note !== s.last; s.last = note; } }, beforeHit(b, s, c) { if (s.bonus && !c.proc) c.mult *= 1.1; } } });
S("core_bard", 3, "Хоровой отклик", "Мотив лечит твоих существ.", { on: { motif(b) { (b.hero.summonedUnits || []).forEach((u) => { u.hp = Math.min(u.maxHp, Math.round(u.hp + u.maxHp * 0.3)); }); } } });
S("core_bard", 3, "Фальшивая нота", "Реквием оглушает одного случайного врага.", { on: { motif(b, s, c) { if (c.same === 1 && hasFx(b.enemy, "weaken")) applyStun(b, b.enemy, b.hero, 1); } } });
S("core_bard", 3, "Большой зал", "Каждый живой враг усиливает мотив на 10%.", { on: { start(b, s) { s.on = true; }, beforeHit(b, s, c) { if (c.label === "Марш") c.mult *= 1 + livingFoes(b).length * 0.1; } } });
S("core_bard", 4, "Бесконечная песня", "После мотива следующая нота звучит дважды.", { on: { motif(b, s) { s.ready = true; }, afterAction(b, s, c) { const core = coreState(b); const note = bardNoteOf(c); if (s.ready && note && core && (core.notes || []).length === 1) { s.ready = false; core.notes = [note, note]; } } } });

S("core_assassin", 1, "Мягкие подошвы", "Бой начинается с заряженной тенью: «Скрыться» уже без отката, а первый удар врага мимо.", { on: { incoming(b, s, c) { if (!s.done) { s.done = true; c.parried = true; } } } });
S("core_assassin", 1, "Лишний вдох", "В тени каждый ход возвращает ещё 15 энергии.", { on: { turnStart(b) { if (b.mech.core_assassin?.hidden) b.hero.currentMana = Math.min(100, b.hero.currentMana + 15); } } });
S("core_assassin", 1, "Слепое пятно", "Удар из тени снимает с цели щит.", onHit((b) => { if (b.mech.core_assassin?.spent) removeFx(b.enemy, "shield"); }));
S("core_assassin", 2, "Перекат", "Промах врага по тени сокращает откат «Скрыться» на 1.", { on: { dodged(b) { const s = b.mech.core_assassin; if (s) s.cd = Math.max(0, s.cd - 1); } } });
S("core_assassin", 2, "Метка жертвы", "Удар из тени метит цель на 3 хода.", onHit((b) => { if (b.mech.core_assassin?.spent) fx(b, "mark", 3, 0.2); }));
S("core_assassin", 2, "Быстрые ножи", "Навык дешевле 30 энергии занимает на 20% меньше времени.", onSkill((b, s, c) => { if (getSkillResourceCost(c.skill, b.hero) < 30) c.tempo *= 0.8; }));
S("core_assassin", 2, "Тихая смерть", "Убийство из тени не заметно: откаты сокращаются на 2 хода.", kills((b) => { Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 2); }); }));
S("core_assassin", 3, "Двойной укол", "Удар из тени наносит второй укол на 50%.", onHit((b) => { if (b.mech.core_assassin?.spent) procHit(b, 0.5, "Укол", "blood", { kind: "physical", forceCrit: true }); }));
S("core_assassin", 3, "Тёмная лошадка", "Пока ты в тени, навыки ничего не стоят.", onSkill((b, s, c) => { if (b.mech.core_assassin?.spent) b.hero.currentMana = Math.min(100, b.hero.currentMana + getSkillResourceCost(c.skill, b.hero)); }));
S("core_assassin", 3, "Яд на выходе", "Выходя из тени, отравляешь всех врагов.", onHit((b, s) => { if (b.mech.core_assassin?.spent) eachFoe(b, (foe) => { applyEffect(b, foe, { id: "poison", duration: 3, value: dotValue(b, 0.1) }, b.hero); }); }));
S("core_assassin", 4, "Шаг сквозь толпу", "Уход в тень сразу бьёт следующую цель как из тени.", { on: { rehidden(b) { const next = livingFoes(b)[0]; if (next) { const t = b.enemy; b.enemy = next; procHit(b, 1, "Шаг сквозь толпу", "blood", { kind: "physical", forceCrit: true }); b.enemy = t; } } } });

function canUseShopPassive(hero, passive) {
  const group = SHOP_GROUPS[passive.effectType];
  return !group?.classes || group.classes.includes(hero.classKey);
}

function getShopSlotLimit(hero) {
  return Math.min(10, 3 + Math.floor(hero.level / 10));
}

function getActiveShopIds(hero) {
  const owned = hero?.shopPassiveIds || [];
  const active = hero?.shopActive || owned;
  return active.filter((id) => owned.includes(id)).slice(0, hero ? getShopSlotLimit(hero) : 0);
}

function toggleShopPassive(hero, id) {
  if (!hero.shopPassiveIds.includes(id)) return { ok: false, reason: "Сначала купи это умение." };
  const active = getActiveShopIds(hero);
  if (active.includes(id)) {
    hero.shopActive = active.filter((entry) => entry !== id);
  } else {
    if (active.length >= getShopSlotLimit(hero)) return { ok: false, reason: `Занято ячеек: ${active.length} из ${getShopSlotLimit(hero)}. Сними другое умение.` };
    hero.shopActive = [...active, id];
  }
  applyDerivedStats(hero);
  return { ok: true };
}
