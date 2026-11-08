// All talents. Rule of logic: an effect comes only from its own source. Blood bleeds, fire burns, ice chills, poison poisons.
// A school is closed to classes that have no reason to touch its element (see docs/ALPHA1_5_DESIGN.md).
const PHYS_ALL = ["warrior", "archer", "assassin"];

defineSchool("poison", "Яд", "Отравители и лучники: яд сильнее, дольше и опаснее.", { classes: ["archer", "assassin"], effect: "poison" });
defineSchool("bleed", "Кровь", "Раны, которые не закрываются. Всё начинается с острого края.", { classes: PHYS_ALL, effect: "bleed" });
defineSchool("burn", "Пламя", "Огонь копит стаки, разъедает и взрывается.", { classes: ["mage"], effect: "burn" });
defineSchool("frost", "Холод", "Лёд замедляет, а ломается вместе с целью.", { classes: ["mage"], effect: "frost" });
defineSchool("shock", "Гроза", "Новый эффект. Шок усиливает следующий удар и разряжается.", { classes: ["mage"], effect: "shock" });
defineSchool("control", "Контроль", "Оглушения, срывы ударов и потеря темпа врага.", { classes: ["warrior", "mage", "bard", "archer"], effect: "stun" });
defineSchool("hex", "Порча", "Слабость, метки и проклятия.", { classes: ["mage", "bard"], effect: "weaken" });
defineSchool("guard", "Оборона", "Щиты, стойка и ответ на удар.", { classes: ["warrior", "mage", "bard"], effect: "shield" });
defineSchool("life", "Живучесть", "Лечение, регенерация и то, что из них вырастает.", { classes: ["warrior", "mage", "bard"], effect: "regeneration" });
defineSchool("crit", "Точность", "Критические удары становятся событием, а не случайностью.", { classes: ["warrior", "archer", "assassin", "bard"], icon: "attack" });
defineSchool("evasion", "Увёртливость", "Промах врага становится твоим оружием.", { classes: ["archer", "assassin", "bard"], effect: "evasion" });
defineSchool("pack", "Свита", "Призванные существа и всё, что они дают.", { classes: ["mage", "archer", "bard"], icon: "skills" });
defineSchool("tempo", "Темп", "Шкала ходов как ресурс.", { classes: ["warrior", "mage", "archer", "bard", "assassin"], effect: "haste" });
defineSchool("arcana", "Эфир", "Мана как оружие, щит и цена.", { classes: ["mage", "bard"], icon: "arcane" });
defineSchool("power", "Сила удара", "Тяжёлое оружие, пробивание и добивание.", { classes: ["warrior", "archer"], icon: "attack" });

// ---------- POISON: slow, ignores shields, grows with time. Patience is the whole build. ----------
T("poison", 1, "amp", "Концентрат", "Яд наносит на 25% больше урона.", { mods: { "val:poison": 0.25 } });
T("poison", 1, "make", "Едкий состав", "Критический удар сам отравляет цель.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && c.kind === "physical") fx(b, "poison", 3, dotValue(b, 0.14)); } } });
T("poison", 1, "shift", "Терпеливый яд", "«Выждать» разгоняет яд на цели: она сразу на два тика ближе к смерти.", { on: { afterAction(b, s, c) { const e = getEffect(b.enemy, "poison"); if (c.type === "wait" && e) { e.meta.elapsedTicks = Number(e.meta.elapsedTicks || 0) + 2; announceProc(b); } } } });
T("poison", 2, "shift", "Накопление", "Новая доза яда складывается со старой, до четырёх доз.", { mods: { "stack:poison": 1 } });
T("poison", 2, "link", "Едкая кровь", "Яд идёт по открытой ране: на кровоточащей цели тик сильнее на 35%.", { on: { beforeTick(b, s, c) { if (c.id === "poison" && hasFx(b.enemy, "bleed")) c.amount *= 1.35; } } });
T("poison", 2, "make", "Дрожь в руках", "Каждый тик яда снижает меткость цели: руки дрожат, и это видно.", { on: { tick(b, s, c) { if (c.id === "poison" && b.enemy.currentHp > 0) applyEffect(b, b.enemy, { id: "blind", duration: 1, value: Math.min(30, 5 + ticksOf(b, "poison") * 3) }, b.hero); } } });
T("poison", 3, "shift", "Нервный токсин", "Чем дольше идёт яд, тем сильнее цель замедлена.", { on: { tick(b, s, c) { if (c.id === "poison" && b.enemy.currentHp > 0) applyEffect(b, b.enemy, { id: "slow", duration: 1, value: Math.min(0.4, ticksOf(b, "poison") * 0.06) }, b.hero); } } });
T("poison", 3, "make", "Последний вздох", "Когда яд кончается, разом выбивает всё, что успел накопить: последний тик умножается на число тиков.", { on: { expired(b, s, c) { if (c.id !== "poison" || c.unit !== b.enemy) return; procDamage(b, c.value * (1 + c.ticks * 0.5), "Последний вздох", "poison"); } } });
T("poison", 3, "link", "Страшная лихорадка", "Отравленная цель не лечится вовсе, пока яд идёт дольше трёх тиков.", { on: { enemyTurn(b, s) { if (ticksOf(b, "poison") >= 3) applyEffect(b, b.enemy, { id: "wound", duration: 1 }, b.hero); } } });
T("poison", 4, "key", "Живая чума", "Яд больше не спадает со временем, но слабее на 35%. Цель либо умрёт, либо ты.", { mods: { "perma:poison": 1, "val:poison": -0.35 } });

// ---------- BLEED: sudden, fades, punishes the target for moving. Speed and crits are the whole build. ----------
T("bleed", 1, "amp", "Глубокие раны", "Кровотечение наносит на 25% больше урона.", { mods: { "val:bleed": 0.25 } });
T("bleed", 1, "make", "Рвущий край", "Физический крит оставляет рану.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && c.kind === "physical") fx(b, "bleed", 2, dotValue(b, 0.14)); } } });
T("bleed", 1, "shift", "Вскрыть рану", "Любой прямой удар по кровоточащей цели выбивает половину раны, а не только крит.", { on: { afterHit(b, s, c) { const e = getEffect(b.enemy, "bleed"); if (isDirectHit(c) && e && !c.crit && c.hpDamage > 0) procDamage(b, e.value * 0.5, "Вскрытая рана", "blood"); } } });
T("bleed", 2, "shift", "Разорванные ткани", "Рана мешает цели лечиться: лечение вдвое слабее.", { on: { applied(b, s, c) { if (c.id === "bleed") applyEffect(b, b.enemy, { id: "wound", duration: 2 }, b.hero); } } });
T("bleed", 2, "link", "Запах крови", "Пока цель кровоточит, ты чуешь слабое место: шанс крита выше на 12%, а крит вскрывает рану.", { mods: { "critVs:bleed": 12 } });
T("bleed", 2, "make", "Рывок на рану", "Быстрый навык по кровоточащей цели занимает ещё меньше времени: ты идёшь за кровью.", { on: { afterAction(b, s, c) { if (hasFx(b.enemy, "bleed") && Number(c.skill?.tempo || 1) < 1) { c.tempo *= 0.8; announceProc(b); } } } });
T("bleed", 3, "link", "Кровавый пир", "Каждое срабатывание раны лечит тебя на 15% её урона.", { on: { tick(b, s, c) { if (c.id === "bleed") healUnit(b, b.hero, c.amount * 0.15, "пир"); } } });
T("bleed", 3, "make", "Скользкая земля", "Срабатывание раны замедляет цель: она скользит в собственной крови.", { on: { tick(b, s, c) { if (c.id === "bleed" && b.enemy.currentHp > 0) applyEffect(b, b.enemy, { id: "slow", duration: 1, value: 0.2 }, b.hero); } } });
T("bleed", 3, "shift", "Удар по телу", "Тяжёлый удар врага вскрывает рану не вдвое, а втрое: он сам себя рвёт.", { on: { beforeTick(b, s, c) { if (c.id === "bleed" && b.lastEnemyHeavy) c.amount *= 1.5; } } });
T("bleed", 4, "key", "Кровопускание", "Сила раны растёт без предела и не затухает, но прямые удары слабее на 15%.", { mods: { "stack:bleed": 1, noBleedDecay: 1, dmg: -0.15 } });

// ---------- BURN ----------
T("burn", 1, "amp", "Жар", "Горение наносит на 25% больше урона.", { mods: { "val:burn": 0.25 } });
T("burn", 1, "shift", "Тлеющие угли", "Угасшее горение оставляет угли: следующее сразу на стак сильнее.", { on: { expired(b, s, c) { if (c.id === "burn" && c.unit === b.enemy) s.ember = true; }, applied(b, s, c) { const e = getEffect(b.enemy, "burn"); if (c.id === "burn" && s.ember && e) { s.ember = false; e.meta.stacks = Math.min(e.meta.maxStacks, getEffectStacks(e) + 1); announceProc(b); } } } });
T("burn", 1, "make", "Искры", "Магический крит поджигает цель.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && c.kind === "magic") fx(b, "burn", 2, dotValue(b, 0.14)); } } });
T("burn", 2, "shift", "Сухая растопка", "Каждое новое горение сразу даёт ещё один стак.", { effects: { burn: { stackBonusOnApply: 1 } } });
T("burn", 2, "amp", "Оплавление", "Каждый тик горения снижает защиту цели.", { effects: { burn: { defenseShredPerTick: 3 } } });
T("burn", 2, "link", "Пир огня", "Каждый тик горения возвращает 2% маны: огонь кормит мага.", { on: { tick(b, s, c) { if (c.id === "burn") procMana(b, 0.02); } } });
T("burn", 3, "shift", "Разгорание", "Горение с каждым тиком на 20% сильнее.", { effects: { burn: { tickRampPerElapsedTurn: 0.2 } } });
T("burn", 3, "link", "Тепловой шок", "Огонь и лёд на одной цели гасят друг друга и взрываются: сильный удар.", { on: { applied(b, s, c) { if ((c.id === "burn" && hasFx(b.enemy, "frost")) || (c.id === "frost" && hasFx(b.enemy, "burn"))) { removeFx(b.enemy, "burn"); removeFx(b.enemy, "frost"); mechNote(b, "Тепловой шок!"); procHit(b, 2.2, "Тепловой шок", "fire", { kind: "magic" }); } } } });
T("burn", 3, "link", "Пар", "Огонь на мокрой цели поднимает пар: она ослеплена на 2 хода.", { on: { applied(b, s, c) { if (c.id === "burn" && hasFx(b.enemy, "soaked")) fx(b, "blind", 2, 25); } } });
T("burn", 4, "key", "Перекал", "Любой маг теперь вызывает детонацию, и она сильнее на 50%. Горение короче на 1 ход.", { mods: { burnDetonate: 1, "dur:burn": -1 }, effects: { burn: { detonationMultiplier: 0.5 } } });
T("burn", 4, "key", "Вечное пламя", "Горение никогда не спадает, но больше не детонирует.", { mods: { "perma:burn": 1, noDetonate: 1 }, excludes: ["burn/10"] });

// ---------- FROST ----------
T("frost", 1, "amp", "Кусачий мороз", "Иней замедляет на 25% сильнее.", { mods: { "val:frost": 0.25 } });
T("frost", 1, "shift", "Ледяной щиток", "Пока на цели иней, её удар с шансом 15% проходит мимо: она еле двигается.", { on: { incoming(b, s, c) { if (hasFx(b.enemy, "frost") && roll(0.15)) { c.parried = true; announceProc(b); } } } });
T("frost", 1, "make", "Морозная искра", "Магический крит покрывает цель инеем.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && c.kind === "magic") fx(b, "frost", 2, 0.15); } } });
T("frost", 2, "amp", "Хрупкий лёд", "Шанс крита по замёрзшей цели выше на 12%.", { mods: { "critVs:frost": 12, "critVs:frostbite": 12 } });
T("frost", 2, "shift", "Глубокий холод", "Когда иней спадает, цель получает обморожение: холод уже в костях.", { on: { expired(b, s, c) { if (c.id === "frost" && c.unit === b.enemy) fx(b, "frostbite", 2, 12); } } });
T("frost", 2, "make", "Ледяной покров", "Замёрзшая цель бьёт тебя на 15% слабее: руки не слушаются.", { on: { incoming(b, s, c) { if (hasFx(b.enemy, "frost")) c.amount *= 0.85; } } });
T("frost", 3, "shift", "Ломкость", "Удары по обмороженной цели сильнее на 20%, по замороженной на 30%.", { mods: { "dmgVs:frostbite": 0.2, "dmgVs:freeze": 0.3 } });
T("frost", 3, "make", "Лютая стужа", "Магический удар по цели с инеем может заморозить её на месте (10%, боссы втрое реже).", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && hasFx(b.enemy, "frost") && roll(b.enemy.isBoss ? 0.033 : 0.1)) { fx(b, "freeze", 1); logEvent(b, `${b.enemy.name} замёрз.`, "Холод"); } } } });
T("frost", 3, "link", "Вода и лёд", "Иней на мокрой цели сразу превращается в обморожение.", { on: { applied(b, s, c) { if (c.id === "frost" && hasFx(b.enemy, "soaked")) { removeFx(b.enemy, "soaked"); fx(b, "frostbite", 3, 15); } } } });
T("frost", 4, "key", "Абсолютный ноль", "Иней вдвое сильнее, но ты сам двигаешься на 15% медленнее: холод берёт и тебя.", { mods: { "val:frost": 1, speed: -0.15 } });

// ---------- SHOCK ----------
T("shock", 1, "make", "Заряженные пальцы", "Магический удар с шансом 25% накладывает шок: следующий удар по цели сильнее.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && roll(0.25)) fx(b, "shock", 3, 0.25); } } });
T("shock", 1, "amp", "Высокое напряжение", "Шок усиливает следующий удар на 30% сильнее.", { mods: { "val:shock": 0.3 } });
T("shock", 1, "make", "Шаровая молния", "Если шок спал неразряженным, он сам бьёт цель.", { on: { expired(b, s, c) { if (c.id === "shock" && c.unit === b.enemy) procHit(b, 0.7, "Шаровая молния", "air", { kind: "magic" }); } } });
T("shock", 2, "shift", "Цепная молния", "Разрядка шока бьёт цель ещё двумя малыми молниями.", { on: { shockUsed(b) { procHit(b, 0.3, "Цепная молния", "air", { kind: "magic" }); procHit(b, 0.3, "Цепная молния", "air", { kind: "magic" }); } } });
T("shock", 2, "make", "Ливень", "Каждый третий твой навык намочит цель: вода проводит ток, шок на мокрой цели сильнее.", { on: { afterAction(b, s, c) { if (c.type !== "skill") return; s.n = (s.n || 0) + 1; if (s.n % 3 === 0) fx(b, "soaked", 3); } } });
T("shock", 2, "amp", "Отдача", "Разрядка шока возвращает 6% маны.", { on: { shockUsed(b) { procMana(b, 0.06); } } });
T("shock", 3, "link", "Гром", "Крит при разрядке шока оглушает цель с шансом 35%.", { on: { afterHit(b, s, c) { if (c.crit && c.shockUsed) applyStun(b, b.enemy, b.hero, 0.35); } } });
T("shock", 3, "shift", "Оседлать бурю", "Разрядка шока на ход ускоряет тебя на 25%.", { on: { shockUsed(b) { fx(b, "haste", 1, 0.25, { self: true }); } } });
T("shock", 4, "key", "Вечная гроза", "Каждый магический удар накладывает шок, но навыки дороже на 30%.", { mods: { manaCost: 0.3 }, on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic") fx(b, "shock", 2, 0.2); } } });

// ---------- CONTROL ----------
T("control", 1, "amp", "Тяжёлая рука", "Шанс оглушения на 15% выше.", { mods: { stunChance: 0.15 } });
T("control", 1, "make", "Звон в ушах", "Оглушение оставляет ошеломление на 2 хода.", { on: { stunned(b) { fx(b, "stagger", 2, 0.15); } } });
T("control", 1, "make", "Подсечка", "Прямой удар с шансом 12% замедляет цель.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && roll(0.12)) fx(b, "slow", 2, 0.2); } } });
T("control", 2, "link", "Срыв", "Сорванный тяжёлый удар или заряд оставляет врага открытым: метка на 3 хода.", { on: { interrupted(b) { fx(b, "mark", 3, 0.2); } } });
T("control", 2, "make", "Лежачего бьют", "Каждое оглушение сразу отнимает 5% оставшегося здоровья цели (у боссов 2%).", { on: { stunned(b) { procDamage(b, b.enemy.currentHp * (b.enemy.isBoss ? 0.02 : 0.05), "Лежачего бьют", "steel"); } } });
T("control", 2, "amp", "Передышка", "Каждое оглушение возвращает 8% маны.", { on: { stunned(b) { procMana(b, 0.08); } } });
T("control", 3, "shift", "Сотрясение", "Повторное оглушение больше не слабеет.", { mods: { noStunRepeat: 1 } });
T("control", 3, "shift", "Пробитая стойка", "Удар по оглушённой цели всегда критический.", { on: { beforeHit(b, s, c) { if (hasFx(b.enemy, "stun") && !c.proc) c.forceCrit = true; } } });
T("control", 4, "key", "Властелин поля", "Шанс оглушения выше на 40%, а боссы оглушаются как обычные враги. Весь твой урон слабее на 15%.", { mods: { stunChance: 0.4, stunBoss: 1, dmg: -0.15 } });

// ---------- HEX ----------
T("hex", 1, "shift", "Украденная сила", "Сколько сил отняла слабость, столько прибавляется к твоему удару.", { on: { beforeHit(b, s, c) { const v = effectValue(b.enemy, "weaken"); if (v) c.mult *= 1 + v; } } });
T("hex", 1, "make", "Приговор", "Спавшая метка бьёт цель.", { on: { expired(b, s, c) { if (c.id === "mark" && c.unit === b.enemy) procHit(b, 0.9, "Приговор", "dark", { kind: "magic" }); } } });
T("hex", 1, "make", "Шёпот", "Магический удар с шансом 15% вызывает слабость.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.kind === "magic" && roll(0.15)) fx(b, "weaken", 2, 0.12); } } });
T("hex", 2, "amp", "Сломленная воля", "Слабость и метка держатся на 1 ход дольше.", { mods: { "dur:weaken": 1, "dur:mark": 1 } });
T("hex", 2, "shift", "Двойная беда", "Каждая беда на враге даёт +3% твоего урона.", { on: { beforeHit(b, s, c) { c.mult *= 1 + countEnemyDebuffs(b.enemy) * 0.03; } } });
T("hex", 2, "link", "Гниль в слабых", "По ослабленной цели порча наносит на 40% больше.", { on: { beforeTick(b, s, c) { if (c.id === "corruption" && hasFx(b.enemy, "weaken")) c.amount *= 1.4; } } });
T("hex", 3, "make", "Корни порчи", "Три беды на одной цели сами порождают порчу.", { on: { applied(b) { if (countEnemyDebuffs(b.enemy) >= 3 && !hasFx(b.enemy, "corruption")) fx(b, "corruption", 3, dotValue(b, 0.18)); } } });
T("hex", 3, "make", "Отнятая сила", "Когда слабость спадает, отнятая сила лечит тебя на 4%.", { on: { expired(b, s, c) { if (c.id === "weaken" && c.unit === b.enemy) procHeal(b, 0.04, "отнятая сила"); } } });
T("hex", 4, "key", "Вечное проклятие", "Слабость и метка не спадают, но проклятие задевает и тебя: ты получаешь на 10% больше урона.", { mods: { "perma:weaken": 1, "perma:mark": 1, taken: 0.1 } });

// ---------- GUARD ----------
T("guard", 1, "amp", "Тяжёлый щит", "Все твои щиты на 25% прочнее.", { mods: { shield: 0.25 } });
T("guard", 1, "link", "Отбить", "Удар в стойку возвращает врагу половину снятого урона.", { on: { hurt(b, s, c) { if (c.blocked > 0) procDamage(b, c.blocked * 0.5, "Отбить", "steel"); } } });
T("guard", 1, "shift", "Шрамы", "Каждый удар по тебе в бою снижает следующие на 2%, до 16%.", { on: { incoming(b, s, c) { s.n = Math.min(8, (s.n || 0) + 1); c.amount *= 1 - s.n * 0.02; } } });
T("guard", 2, "link", "Шипастый щит", "Щит возвращает нападающему 30% поглощённого урона.", { on: { hurt(b, s, c) { if (c.absorbed > 0) procDamage(b, c.absorbed * 0.3, "Шипы щита", "steel"); } } });
T("guard", 2, "make", "Осколки щита", "Когда щит лопается, ты получаешь закалку на 2 хода.", { on: { hurt(b, s, c) { if (c.absorbed > 0 && !hasFx(b.hero, "shield")) fx(b, "fortify", 2, 0.2, { self: true }); } } });
T("guard", 2, "make", "Верная стойка", "Стойка сразу даёт небольшой щит.", { on: { afterAction(b, s, c) { if (c.type === "guard") procShield(b, 0.08); } } });
T("guard", 3, "link", "Контрудар", "После стойки следующий удар сильнее на 40%.", { on: { afterAction(b, s, c) { if (c.type === "guard") s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.mult *= 1.4; s.ready = false; } } } });
T("guard", 3, "shift", "Перелив", "Лечение сверх полного здоровья становится щитом.", { on: { heal(b, s, c) { if (c.overflow > 0 && !b.procDepth) { b.procDepth = 1; fx(b, "shield", 2, Math.round(c.overflow * 0.6) + effectValue(b.hero, "shield"), { self: true }); b.procDepth = 0; } } } });
T("guard", 4, "key", "Живая крепость", "Получаемый урон ниже на 20%, щиты не спадают сами. Твой урон слабее на 20%.", { mods: { taken: -0.2, dmg: -0.2, "perma:shield": 1 } });

// ---------- LIFE ----------
T("life", 1, "amp", "Бодрость", "Всё лечение сильнее на 15%.", { mods: { heal: 0.15 } });
T("life", 1, "shift", "Закалённый болью", "В начале хода лечишься на 1% за каждую беду на себе.", { on: { turnStart(b) { const bad = (b.hero.effects || []).filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad").length; if (bad) procHeal(b, bad * 0.01, "боль"); } } });
T("life", 1, "amp", "Живая вода", "Регенерация на 30% сильнее.", { mods: { "val:regeneration": 0.3 } });
T("life", 2, "make", "Второе дыхание", "Раз за бой, упав ниже 35% здоровья, получаешь сильную регенерацию.", { on: { hurt(b, s) { if (!s.used && hpRatio(b.hero) < 0.35 && b.hero.currentHp > 0) { s.used = true; fx(b, "regeneration", 3, Math.round(b.hero.maxHp * 0.06), { self: true }); mechNote(b, "Второе дыхание"); } } } });
T("life", 2, "amp", "Сытый бой", "После победы лечишься на 6% здоровья.", { on: { victory(b) { b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.06)); } } });
T("life", 2, "link", "Бурлящая кровь", "Тик регенерации возвращает 2% маны.", { on: { regenTick(b) { procMana(b, 0.02); } } });
T("life", 3, "link", "Преисполнение", "Лечение сверх полного здоровья усиливает следующий удар.", { on: { heal(b, s, c) { if (c.overflow > 0) s.ready = Math.min(0.5, (s.ready || 0) + c.overflow / b.hero.maxHp); }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.mult *= 1 + s.ready; s.ready = 0; } } } });
T("life", 3, "make", "Глоток на бегу", "Зелье занимает вдвое меньше времени и снимает одну беду.", { on: { afterAction(b, s, c) { if (c.type !== "potion") return; c.tempo *= 0.5; const bad = b.hero.effects.find((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad"); if (bad) removeFx(b.hero, bad.id); announceProc(b); } } });
T("life", 4, "key", "Неугасимое сердце", "Всё лечение сильнее на 50%, но запас здоровья меньше на 20%.", { mods: { heal: 0.5, maxHpPct: -0.2 } });

// ---------- CRIT ----------
T("crit", 1, "amp", "Точный глаз", "Шанс крита выше на 5%.", { derived: { critChance: 5 } });
T("crit", 1, "link", "Палач", "Крит по цели ниже 40% здоровья бьёт ещё на 40% сверху.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && hpRatio(b.enemy) < 0.4) procDamage(b, c.hpDamage * 0.4, "Палач", "blood"); } } });
T("crit", 1, "make", "Первая кровь", "Первый удар в каждом бою всегда критический.", { on: { beforeHit(b, s, c) { if (!s.done && !c.proc) { s.done = true; c.forceCrit = true; } } } });
T("crit", 2, "shift", "Поток", "После крита следующий удар сильнее на 15%.", { on: { beforeHit(b, s, c) { if (s.ready && !c.proc) { c.mult *= 1.15; s.ready = false; } }, afterHit(b, s, c) { if (isDirectHit(c) && c.crit) s.ready = true; } } });
T("crit", 2, "shift", "Холодный расчёт", "Каждый удар без крита даёт +8% шанса до следующего крита. Промахов судьбы больше нет.", { on: { beforeHit(b, s, c) { if (!c.proc) c.critBonus += s.bonus || 0; }, afterHit(b, s, c) { if (!isDirectHit(c)) return; s.bonus = c.crit ? 0 : (s.bonus || 0) + 8; } } });
T("crit", 2, "amp", "Кровавый почерк", "Крит возвращает 3% здоровья.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) procHeal(b, 0.03, "почерк"); } } });
T("crit", 3, "make", "Вскрытие защиты", "Крит открывает цель: следующие 2 хода шанс крита по ней выше на 15%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) fx(b, "exposed", 2, 15); } } });
T("crit", 3, "make", "Двойной удар", "Крит с шансом 25% тут же повторяет удар с силой 50%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && roll(0.25)) procHit(b, 0.5, "Двойной удар", "steel", { kind: c.kind }); } } });
T("crit", 4, "key", "Ва-банк", "Криты намного сильнее, но весь остальной урон ниже на 25%.", { mods: { critMult: 0.8, dmg: -0.25 } });

// ---------- EVASION ----------
T("evasion", 1, "shift", "Двойной шаг", "После двух уклонений подряд следующее действие вдвое быстрее.", { on: { dodged(b, s) { s.n = (s.n || 0) + 1; }, hurt(b, s, c) { if (c.hpDamage > 0) s.n = 0; }, afterAction(b, s, c) { if ((s.n || 0) >= 2) { s.n = 0; c.tempo *= 0.5; announceProc(b); } } } });
T("evasion", 1, "shift", "Отскок", "После уклонения следующий удар сильнее на 30%.", { on: { dodged(b, s) { s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.mult *= 1.3; s.ready = false; } } } });
T("evasion", 1, "amp", "Перевести дух", "Уклонение лечит на 3%.", { on: { dodged(b) { procHeal(b, 0.03, "передышка"); } } });
T("evasion", 2, "make", "Встречный удар", "Уклонившись, сразу бьёшь с силой 50%.", { on: { dodged(b) { procHit(b, 0.5, "Встречный удар", "steel"); } } });
T("evasion", 2, "make", "Горсть пыли", "Уклонившись, бросаешь врагу в глаза пыль: он ослеплён на 2 хода.", { on: { dodged(b) { fx(b, "blind", 2, 20); } } });
T("evasion", 2, "amp", "Танец", "Уклонение ускоряет тебя на следующий ход.", { on: { dodged(b) { fx(b, "haste", 1, 0.25, { self: true }); } } });
T("evasion", 3, "shift", "Предчувствие", "Первый удар врага в каждом бою всегда мимо.", { on: { incoming(b, s, c) { if (!s.done) { s.done = true; c.parried = true; mechNote(b, "Предчувствие"); } } } });
T("evasion", 3, "amp", "Призрачный след", "Пока здоровья больше 70%, уклонение выше на 10%.", { on: { turnStart(b) { if (hpRatio(b.hero) > 0.7) applyEffect(b, b.hero, { id: "evasion", duration: 1, value: 10 }, b.hero); } } });
T("evasion", 4, "key", "Тень без тела", "Уклонение выше на 20%, но запас здоровья меньше на 25%.", { derived: { dodgeChance: 20 }, mods: { maxHpPct: -0.25 } });

// ---------- PACK ----------
T("pack", 1, "shift", "Кость к кости", "Каждый ход существа лечатся на 8%.", { on: { turnStart(b) { (b.hero.summonedUnits || []).forEach((u) => { u.hp = Math.min(u.maxHp, Math.round(u.hp + u.maxHp * 0.08)); }); } } });
T("pack", 1, "shift", "Злость стаи", "Каждый ход существа становятся сильнее на 5%.", { on: { turnStart(b) { (b.hero.summonedUnits || []).forEach((u) => { u.power = Math.round(u.power * 1.05 * 100) / 100; }); } } });
T("pack", 1, "amp", "Долгая служба", "Существа служат на 1 ход дольше.", { mods: { summonDur: 1 } });
T("pack", 2, "link", "Кровь за кровь", "Гибель существа даёт тебе ярость на 2 хода.", { on: { summonDeath(b) { fx(b, "rage", 2, 0.2, { self: true }); } } });
T("pack", 2, "shift", "Перекличка", "Каждое существо рядом усиливает твой удар на 4%.", { on: { beforeHit(b, s, c) { c.mult *= 1 + (b.hero.summonedUnits || []).length * 0.04; } } });
T("pack", 2, "amp", "Живой заслон", "Пока рядом есть существо, ты получаешь на 8% меньше урона.", { on: { incoming(b, s, c) { if ((b.hero.summonedUnits || []).length) c.amount *= 0.92; } } });
T("pack", 3, "make", "Предсмертный рывок", "Гибнущее существо напоследок бьёт с тройной силой.", { on: { summonDeath(b, s, c) { procDamage(b, c.summon.power * 3, "Предсмертный рывок", "steel"); } } });
T("pack", 3, "link", "Общая жизнь", "Твоё лечение лечит и существ.", { on: { heal(b, s, c) { (b.hero.summonedUnits || []).forEach((unit) => { unit.hp = Math.min(unit.maxHp, Math.round(unit.hp + c.amount * 0.5)); }); } } });
T("pack", 4, "key", "Один, но великий", "Рядом может быть только одно существо, но оно в два с половиной раза сильнее и живучее.", { mods: { summonOne: 1, summonPower: 1.5, summonHp: 1.5 } });

// ---------- TEMPO ----------
T("tempo", 1, "shift", "Разгон", "С каждым ходом боя ты быстрее на 2%, до 20%.", { on: { turnStart(b, s) { s.n = Math.min(10, (s.n || 0) + 1); applyEffect(b, b.hero, { id: "haste", duration: 1, value: s.n * 0.02 }, b.hero); } } });
T("tempo", 1, "link", "Лёгкая рука", "Быстрые навыки сильнее на 15%.", { on: { beforeHit(b, s, c) { if (c.skill && Number(c.skill.tempo || 1) < 1) c.mult *= 1.15; } } });
T("tempo", 1, "make", "Собраться", "«Выждать» лечит на 5%.", { on: { afterAction(b, s, c) { if (c.type === "wait") procHeal(b, 0.05, "передышка"); } } });
T("tempo", 2, "shift", "Инициатива", "В начале боя твой первый ход наступает заметно раньше.", { on: { start(b) { b.tempoStart = 0.6; } } });
T("tempo", 2, "link", "Вихрь", "Под ускорением шанс крита выше на 10%.", { on: { beforeHit(b, s, c) { if (hasFx(b.hero, "haste")) c.critBonus += 10; } } });
T("tempo", 2, "make", "Бодрый старт", "Первые 2 хода боя ты ускорен.", { on: { start(b) { b.hero.effects.push({ ...normalizeEffectSpec({ id: "haste", duration: 2, value: 0.2 }), meta: { fresh: true } }); } } });
T("tempo", 3, "shift", "Двойной темп", "Каждое пятое действие занимает вдвое меньше времени.", { on: { afterAction(b, s, c) { s.n = (s.n || 0) + 1; if (s.n % 5 === 0) c.tempo *= 0.5; } } });
T("tempo", 3, "link", "Упреждение", "Если ты ходишь дважды подряд, второй удар сильнее на 25%.", { on: { enemyTurn(b, s) { s.fresh = false; }, afterAction(b, s) { s.fresh = true; }, beforeHit(b, s, c) { if (s.fresh && !c.proc) c.mult *= 1.25; } } });
T("tempo", 4, "key", "Вне времени", "Ты быстрее на 25%, но каждый удар по тебе сильнее на 20%.", { mods: { speed: 0.25, taken: 0.2 } });

// ---------- ARCANA ----------
T("arcana", 1, "make", "Накопитель", "Полный запас маны в начале хода даёт щит на 4% здоровья.", { on: { turnStart(b) { if (b.hero.currentMana >= b.hero.maxMana) procShield(b, 0.04); } } });
T("arcana", 1, "amp", "Бережливость", "Навыки дешевле на 10%.", { mods: { manaCost: -0.1 } });
T("arcana", 1, "amp", "Прилив", "Каждый ход возвращает ещё 1,5% маны.", { mods: { manaRegen: 0.015 } });
T("arcana", 2, "shift", "Эфирный заслон", "20% урона вместо здоровья забирает мана, пока она есть.", { on: { incoming(b, s, c) { const part = Math.min(b.hero.currentMana, c.amount * 0.2); b.hero.currentMana = Math.round(b.hero.currentMana - part); c.amount -= part; } } });
T("arcana", 2, "amp", "Отклик", "Крит возвращает 5% маны.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) procMana(b, 0.05); } } });
T("arcana", 2, "link", "Полный сосуд", "При мане выше 70% магический урон сильнее на 12%.", { on: { beforeHit(b, s, c) { if (c.kind === "magic" && b.hero.currentMana / b.hero.maxMana > 0.7) c.mult *= 1.12; } } });
T("arcana", 3, "link", "Пустой сосуд", "При мане ниже 30% весь урон сильнее на 25%: терять уже нечего.", { excludes: ["arcana/6"], on: { beforeHit(b, s, c) { if (b.hero.currentMana / b.hero.maxMana < 0.3) c.mult *= 1.25; } } });
T("arcana", 3, "make", "Перекачка", "«Выждать» создаёт щит из маны.", { on: { afterAction(b, s, c) { if (c.type === "wait") procShield(b, 0.1); } } });
T("arcana", 4, "key", "Магия крови", "Навыки стоят здоровье вместо маны, а магический урон сильнее на 30%.", { mods: { bloodMagic: 1, dmgMagic: 0.3 } });

// ---------- POWER ----------
T("power", 1, "amp", "Тяжёлый замах", "Физический урон сильнее на 8%.", { mods: { dmgPhys: 0.08 } });
T("power", 1, "amp", "Бронебой", "Удары пробивают 10% защиты.", { mods: { pierce: 0.1 } });
T("power", 1, "shift", "Инерция", "Каждый следующий удар в бою сильнее на 3%, до 30%.", { on: { beforeHit(b, s, c) { if (c.proc) return; s.n = Math.min(10, (s.n || 0) + 1); c.mult *= 1 + (s.n - 1) * 0.03; } } });
T("power", 2, "amp", "Слабое место", "По цели с пробитой бронёй удары сильнее на 20%.", { mods: { "dmgVs:armor_break": 0.2 } });
T("power", 2, "make", "Трещина", "Физический крит пробивает броню цели на 2 хода.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && c.kind === "physical") fx(b, "armor_break", 2, 0.2); } } });
T("power", 2, "amp", "Размен", "Пока здоровья больше 80%, удары сильнее на 12%.", { on: { beforeHit(b, s, c) { if (hpRatio(b.hero) > 0.8) c.mult *= 1.12; } } });
T("power", 3, "amp", "Добить", "По цели ниже 30% здоровья удары сильнее на 25%.", { on: { beforeHit(b, s, c) { if (hpRatio(b.enemy) < 0.3) c.mult *= 1.25; } } });
T("power", 3, "make", "Отдышаться", "После медленного навыка лечишься на 5%.", { on: { afterAction(b, s, c) { if (c.skill && Number(c.skill.tempo || 1) > 1) procHeal(b, 0.05, "вдох"); } } });
T("power", 4, "key", "Сокрушающий стиль", "Все удары пробивают ещё 30% защиты, но шанс крита ниже на 15%.", { mods: { pierce: 0.3 }, derived: { critChance: -15 } });

// ---------- CLASS SCHOOLS ----------
const classSchool = (id, classKey, name, description) => defineSchool(id, name, description, { classes: [classKey], classOnly: true });
classSchool("c-warrior", "warrior", "Воля воина", "Сталь, упрямство и жажда победы.");
classSchool("c-mage", "mage", "Основы магии", "Формулы, на которых держится любая школа.");
classSchool("c-archer", "archer", "Охотничье дело", "Терпение, расстояние и верный глаз.");
classSchool("c-bard", "bard", "Искусство", "Бой как выступление: у него есть ритм, зал и финал.");
classSchool("c-assassin", "assassin", "Ремесло убийцы", "Убить быстро и тихо, а лучше до начала боя.");

// One key talent per class trades the "habit" rule for a one-skill style.
const ONE_SKILL = { adaptImmune: 1 };
const repeatPayoff = (b, s, c) => { if (c.skill && b.repeat?.id === c.skill.id) c.mult *= 1 + Math.min(5, b.repeat.count - 1) * 0.08; else if (c.skill) c.mult *= 0.8; };

T("c-warrior", 1, "shift", "Кровь стучит", "Раны дают вдвое больше напора.", { on: { hurt(b, s, c) { if (c.hpDamage > 0) b.hero.currentMana = Math.min(100, b.hero.currentMana + 12); } } });
T("c-warrior", 1, "amp", "Широкий замах", "Размах обычного удара бьёт соседей на 60% вместо 40%.", { on: { afterHit(b, s, c) { if (!c.skill && isDirectHit(c) && c.hpDamage > 0 && b.foes.length > 1) splash(b, c.hpDamage * 0.2, "Широкий замах"); } } });
T("c-warrior", 2, "link", "Слом", "Навык, потративший от 20 напора, пробивает броню цели на 2 хода.", { on: { afterAction(b, s, c) { if (c.skill && getSkillResourceCost(c.skill, b.hero) >= 20) fx(b, "armor_break", 2, 0.25); } } });
T("c-warrior", 2, "shift", "Без передышки", "Бой начинается с 40 напора.", { on: { start(b) { b.hero.currentMana = 40; } } });
T("c-warrior", 3, "make", "Неудержимый натиск", "При полном напоре удар проходит сквозь всех врагов и тратит 30 напора.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.hpDamage > 0 && b.hero.currentMana >= 100) { b.hero.currentMana = 70; announceProc(b); splash(b, c.hpDamage * 0.7, "Натиск"); } } } });
T("c-warrior", 3, "link", "Вошёл во вкус", "Выше 70 напора ты получаешь на 12% меньше урона.", { on: { incoming(b, s, c) { if (b.hero.currentMana >= 70) c.amount *= 0.88; } } });
T("c-warrior", 4, "key", "Мастер одного удара", "Привыкание врагов на тебя не действует: повтор навыка, наоборот, усиливает его, до +40%. Смена навыка наказывается: −20%.", { mods: ONE_SKILL, on: { beforeHit: repeatPayoff } });

T("c-mage", 1, "shift", "Тихий жар", "Обычный удар остужает вдвое сильнее.", { on: { afterAction(b, s, c) { const core = coreState(b); if (c.type === "attack" && core) core.value = Math.max(0, core.value - 13); } } });
T("c-mage", 1, "make", "Искра перегрева", "При перегреве от 50 заклинание выбивает ещё и слабый разряд.", { on: { afterAction(b, s, c) { if (c.skill?.attackType === "skill" && (coreState(b)?.value || 0) >= 50) procHit(b, 0.35, "Искра", "fire", { kind: "magic" }); } } });
T("c-mage", 2, "shift", "Холодная голова", "Предел перегрева выше на 20.", { mods: { heatCap: 20 } });
T("c-mage", 2, "make", "Плавильня", "«Медитация» выпускает жар на всех врагов.", { on: { afterAction(b, s, c) { if (c.type === "wait") eachFoe(b, () => procHit(b, 0.6, "Плавильня", "fire", { kind: "magic" })); } } });
T("c-mage", 3, "shift", "Контролируемый срыв", "Срыв больше не лишает хода.", { on: { backfire(b) { removeFx(b.hero, "stun"); announceProc(b); } } });
T("c-mage", 3, "link", "Послесвечение", "После «Медитации» следующее заклинание сильнее на 40%.", { on: { afterAction(b, s, c) { if (c.type === "wait") s.ready = true; }, beforeHit(b, s, c) { if (s.ready && c.kind === "magic" && !c.proc) { c.mult *= 1.4; s.ready = false; } } } });
T("c-mage", 4, "key", "Перегрузка", "Магический урон сильнее на 35%, но каждый навык жжёт 5% твоего здоровья.", { mods: { dmgMagic: 0.35 }, on: { afterAction(b, s, c) { if (c.type === "skill") b.hero.currentHp = Math.max(1, Math.round(b.hero.currentHp - b.hero.maxHp * 0.05)); } } });
T("c-mage", 4, "key", "Ледяной расчёт", "Срыва больше нет, но перегрев усиливает магию вдвое слабее.", { mods: { heatCap: 100000 }, on: { beforeHit(b, s, c) { const v = coreState(b)?.value || 0; if (c.kind === "magic") c.mult *= (1 + v * 0.002) / (1 + v * 0.004); } } });

T("c-archer", 1, "shift", "Длинные ноги", "Бой начинается на ступень дальше.", { mods: { startRange: 1 } });
T("c-archer", 1, "amp", "Длинный выстрел", "Каждая ступень дистанции даёт ещё +5% урона.", { mods: { rangeBonus: 0.05 } });
T("c-archer", 2, "shift", "Быстрый отход", "«Отойти» раз в 3 хода вместо 4.", { mods: { retreatCd: -1 } });
T("c-archer", 2, "make", "Подножка", "Сближающийся враг спотыкается: он замедлен.", { on: { approached(b) { applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.2 }, b.hero); announceProc(b); } } });
T("c-archer", 3, "make", "Выстрел в упор", "Вплотную стрелы не слабеют и могут оглушить.", { mods: { closeBonus: 0.2 }, on: { afterHit(b, s, c) { if (isDirectHit(c) && coreState(b)?.value === 0 && roll(0.15)) applyStun(b, b.enemy, b.hero, 1); } } });
T("c-archer", 3, "link", "Кольцевой бег", "После «Отойти» следующий выстрел всегда критический.", { on: { retreated(b, s) { s.ready = true; }, beforeHit(b, s, c) { if (s.ready && !c.proc) { c.forceCrit = true; s.ready = false; } } } });
T("c-archer", 4, "key", "Одна стрела", "Привыкание на тебя не действует: повтор навыка усиливает его, до +40%. Смена навыка наказывается: −20%.", { mods: ONE_SKILL, on: { beforeHit: repeatPayoff } });
T("c-archer", 4, "key", "Упор", "Ты отказываешься от дистанции: всегда вплотную, но стрелы сильнее на 55% от базы вплотную.", { mods: { startRange: -2, closeBonus: 0.55 } });

T("c-bard", 1, "make", "Первая нота", "Бой начинается с уже сыгранной нотой.", { on: { start(b) { const core = coreState(b); if (core) core.notes = [randomFrom(["blade", "life", "shade"])]; } } });
T("c-bard", 1, "amp", "Сильная доля", "Мотив сильнее на 20%.", { mods: { motifPower: 0.2 } });
T("c-bard", 2, "make", "Припев с припуском", "Неполный мотив также лечит на 5%.", { on: { motif(b, s, c) { if (c.same === 2) procHeal(b, 0.05, "припев"); } } });
T("c-bard", 2, "link", "Зал слушает", "Аккорд сокращает все откаты на 1 ход.", { on: { motif(b, s, c) { if (c.same === 3) Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); } } });
T("c-bard", 3, "make", "Сольная партия", "Стойка играет ноту ♪, а «Настроиться» ноту ☾.", { on: { afterAction(b, s, c) { const core = coreState(b); if (!core) return; if (c.type === "guard") core.notes = [...(core.notes || []), "life"]; if (c.type === "wait") core.notes = [...(core.notes || []), "shade"]; } } });
T("c-bard", 3, "shift", "Послезвучие", "После мотива следующий навык сильнее на 30%.", { on: { motif(b, s) { s.ready = true; }, beforeHit(b, s, c) { if (s.ready && c.skill) { c.mult *= 1.3; s.ready = false; } } } });
T("c-bard", 4, "key", "Соло", "Весь урон сильнее на 30%, а лечение слабее вдвое. Лекаря в этой группе больше нет.", { mods: { dmg: 0.3, heal: -0.5 } });

T("c-assassin", 1, "amp", "Тихие шаги", "Удар из тени ещё сильнее на 20%.", { mods: { shadowPower: 0.2 } });
T("c-assassin", 1, "shift", "Густая тень", "В тени враги промахиваются ещё на 20% чаще.", { mods: { shadowDodge: 0.2 } });
T("c-assassin", 2, "make", "Перехват", "Удар из тени с шансом 30% оглушает и срывает заряд.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.core_assassin?.spent && roll(0.3)) applyStun(b, b.enemy, b.hero, 1); } } });
T("c-assassin", 2, "link", "Дыхание убийцы", "Уход в тень возвращает 40 энергии.", { on: { rehidden(b) { b.hero.currentMana = Math.min(100, b.hero.currentMana + 40); } } });
T("c-assassin", 3, "make", "Кровь из тени", "Удар из тени оставляет и рану, и яд.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.core_assassin?.spent) { fx(b, "bleed", 2, dotValue(b, 0.2)); fx(b, "poison", 3, dotValue(b, 0.15)); } } } });
T("c-assassin", 3, "shift", "Дымовая завеса", "Уход в тень снимает с тебя все беды.", { on: { rehidden(b) { b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); announceProc(b); } } });
T("c-assassin", 4, "key", "Стеклянный клинок", "Весь урон сильнее на 35%, но запас здоровья меньше на 25%.", { mods: { dmg: 0.35, maxHpPct: -0.25 } });
T("c-assassin", 4, "key", "Один смертельный приём", "Привыкание на тебя не действует: повтор навыка усиливает его, до +40%. Смена навыка наказывается: −20%.", { mods: ONE_SKILL, on: { beforeHit: repeatPayoff } });

// ---------- GROUP FIGHTS: what happens when one body falls ----------
T("poison", 3, "link", "Заразная смерть", "Яд с павшего врага переходит на всех остальных.", { on: { foeDown(b, s, c) { if (spreadEffect(b, c.foe, "poison", 1)) announceProc(b); } } });
T("bleed", 3, "link", "Брызги", "Рана с павшего врага вскрывается на остальных.", { on: { foeDown(b, s, c) { if (spreadEffect(b, c.foe, "bleed", 1)) announceProc(b); } } });
T("burn", 3, "make", "Пожар", "Огонь с павшего врага перекидывается на остальных.", { on: { foeDown(b, s, c) { if (spreadEffect(b, c.foe, "burn", 1)) announceProc(b); } } });
T("frost", 3, "make", "Ледяная волна", "Гибель замёрзшей цели морозит всех остальных.", { on: { foeDown(b, s, c) { if (["frost", "frostbite", "freeze"].some((id) => hasFx(c.foe, id))) eachFoe(b, () => fx(b, "frost", 2, 0.25)); } } });
T("shock", 3, "link", "Разветвление", "Разрядка шока заряжает всех остальных врагов.", { on: { shockUsed(b) { eachFoe(b, () => { applyEffect(b, b.enemy, { id: "shock", duration: 2, value: 0.15 }, b.hero); }, false); announceProc(b); } } });
T("control", 3, "make", "Гулкий удар", "Оглушение ошеломляет всю группу.", { on: { stunned(b) { eachFoe(b, () => { applyEffect(b, b.enemy, { id: "stagger", duration: 2, value: 0.15 }, b.hero); }); announceProc(b); } } });
T("hex", 3, "link", "Шёпот в толпе", "Слабость с павшего врага переходит на остальных.", { on: { foeDown(b, s, c) { if (spreadEffect(b, c.foe, "weaken", 1)) announceProc(b); } } });
T("crit", 3, "make", "Сквозной удар", "Крит задевает остальных врагов на 30%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit && b.foes.length > 1) { announceProc(b); splash(b, c.hpDamage * 0.3, "Сквозной удар"); } } } });
T("power", 3, "make", "Сквозь строй", "Каждый удар задевает остальных врагов на 20%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.hpDamage > 0 && b.foes.length > 1) splash(b, c.hpDamage * 0.2, "Сквозь строй"); } } });
T("guard", 3, "make", "Встать стеной", "Стойка против нескольких врагов: щит растёт с их числом.", { on: { afterAction(b, s, c) { if (c.type === "guard") procShield(b, 0.05 * b.foes.filter((foe) => foe.currentHp > 0).length); } } });
T("evasion", 3, "make", "Столкнуть лбами", "Уклонившись, подставляешь другого врага: он получает удар промахнувшегося.", { on: { dodged(b) { const other = b.foes.find((foe) => foe !== b.enemy && foe.currentHp > 0); if (other) { const dmg = Math.round(b.enemy.physicalDamage * 0.6); announceProc(b); const { hpDamage } = dealDamage(b, other, dmg); logEvent(b, `${b.enemy.name} попадает по союзнику: ${hpDamage}.`, "Талант"); } } } });

// ---------- SUBCLASS AND PROFESSION SCHOOLS ----------
const subSchool = (id, classKey, name, description) => defineSchool(id, name, description, { classes: [classKey], subclass: id });
const profSchool = (id, classKey, name, description) => defineSchool(id, name, description, { classes: [classKey], profession: id });

subSchool("elemental", "mage", "Резонанс", "Подкласс: маг стихий.");
T("elemental", 1, "amp", "Чистая нота", "Каждая единица резонанса даёт ещё +2% урона.", { on: { beforeHit(b, s, c) { if (c.kind === "magic") c.mult *= 1 + (b.mech.elemental?.value || 0) * 0.02; } } });
T("elemental", 2, "shift", "Удержать аккорд", "Обычный удар больше не сбрасывает резонанс.", { on: { turnStart(b, s) { s.keep = b.mech.elemental?.value || 0; }, afterAction(b, s, c) { if (c.type === "attack" && b.mech.elemental) b.mech.elemental.value = s.keep; } } });
T("elemental", 3, "make", "Выплеск", "На пяти резонанса заклинание бьёт ещё раз чистой стихией и сбрасывает шкалу.", { on: { afterAction(b, s, c) { if (c.skill?.attackType === "skill" && b.mech.elemental?.value >= 5 && b.enemy.currentHp > 0) { b.mech.elemental.value = 0; mechNote(b, "Выплеск!"); procHit(b, 1.4, "Выплеск стихий", "arcane", { kind: "magic" }); } } } });

subSchool("summoner", "mage", "Связь", "Подкласс: призыватель.");
T("summoner", 1, "amp", "Крепкая нить", "Существа сильнее и живучее на 15%.", { mods: { summonPower: 0.15, summonHp: 0.15 } });
T("summoner", 2, "shift", "Живая подпитка", "Гибель существа возвращает ещё 8% маны и 4% здоровья.", { on: { summonDeath(b) { procMana(b, 0.08); procHeal(b, 0.04, "связь"); } } });
T("summoner", 3, "make", "Союзный удар", "Когда ты бьёшь навыком, каждое боевое существо сразу бьёт вместе с тобой на половину силы.", { on: { afterAction(b, s, c) { if (!c.skill?.attackType) return; (b.hero.summonedUnits || []).filter((u) => u.role === "attacker" || u.role === "tank").forEach((u) => procDamage(b, u.power * 0.5, u.name, "arcane")); } } });

subSchool("light_dark", "mage", "Сумерки", "Подкласс: маг света и тьмы.");
T("light_dark", 1, "amp", "Двойная природа", "Смена стороны даёт ещё +10%.", { on: { beforeHit(b, s, c) { if (b.mech.light_dark?.side === "light") c.mult *= 1.1; }, beforeHeal(b, s, c) { if (b.mech.light_dark?.side === "dark") c.amount *= 1.1; } } });
T("light_dark", 2, "link", "Расплата", "Удар, усиленный светом, лечит на 4%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.light_dark?.side === "light") procHeal(b, 0.04, "расплата"); } } });
T("light_dark", 3, "make", "Затмение", "Лечение под тёмной стороной также ослабляет врага.", { on: { heal(b, s, c) { if (c.amount > 0 && b.mech.light_dark?.side === "dark" && !hasFx(b.enemy, "weaken") && !b.procDepth) fx(b, "weaken", 2, 0.15); } } });

profSchool("fire", "mage", "Огненный маг", "Профессия: детонация.");
T("fire", 1, "amp", "Жаркий взрыв", "Детонация сильнее на 30%.", { effects: { burn: { detonationMultiplier: 0.3 } } });
T("fire", 2, "shift", "Пепел", "Детонация оставляет на цели одно горение: огонь не гаснет до конца.", { on: { detonated(b) { fx(b, "burn", 2, dotValue(b, 0.12)); } } });
T("fire", 3, "make", "Цепная реакция", "Детонация сокращает все откаты на 1 ход и возвращает 10% маны.", { on: { detonated(b) { Object.keys(b.hero.cooldowns).forEach((id) => { b.hero.cooldowns[id] = Math.max(0, b.hero.cooldowns[id] - 1); }); procMana(b, 0.1); } } });

profSchool("water", "mage", "Водный маг", "Профессия: холод.");
T("water", 1, "amp", "Живой родник", "Лечение под холодом сильнее ещё на 15%.", { on: { beforeHeal(b, s, c) { if (["frost", "frostbite", "freeze"].some((id) => hasFx(b.enemy, id))) c.amount *= 1.15; } } });
T("water", 2, "make", "Прилив", "Лечение также намочит врага: вода заливает его ноги.", { on: { heal(b, s, c) { if (c.amount > 0 && !b.procDepth && !hasFx(b.enemy, "soaked")) fx(b, "soaked", 2); } } });
T("water", 3, "shift", "Обратный ток", "Удар по замороженной цели лечит на 8%.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && hasFx(b.enemy, "freeze")) procHeal(b, 0.08, "ток"); } } });

profSchool("earth", "mage", "Маг земли", "Профессия: давление.");
T("earth", 1, "amp", "Тяжесть горы", "Ошеломлённая цель получает на 15% больше урона.", { mods: { "dmgVs:stagger": 0.15 } });
T("earth", 2, "shift", "Неотвратимость", "Каждый ход давление растёт на 8 само: земля давит и без заклинаний.", { on: { turnStart(b) { bumpGauge(b, "earth", 8, 100); } } });
T("earth", 3, "make", "Каменный гроб", "Оглушение от давления лишает цель брони на 3 хода.", { on: { stunned(b) { fx(b, "armor_break", 3, 0.35); } } });

profSchool("air", "mage", "Маг воздуха", "Профессия: поток.");
T("air", 1, "amp", "Попутный поток", "За единицу потока ещё +3% урона.", { on: { beforeHit(b, s, c) { c.mult *= 1 + (b.mech.air?.value || 0) * 0.03; } } });
T("air", 2, "shift", "Вихрь", "Следующий удар после повтора потока сильнее на 50%.", { on: { beforeHit(b, s, c) { if (b.mech.air?.value === 0 && c.skill && s.prev >= 4) c.mult *= 1.5; s.prev = b.mech.air?.value || 0; } } });
T("air", 3, "make", "Штормовой след", "Каждое повторение потока ослепляет врага: песок в лицо.", { on: { afterAction(b, s, c) { if (b.mech.air?.value === 0 && c.tempo < 1 && c.skill?.attackType) fx(b, "blind", 2, 20); } } });

profSchool("spirit", "mage", "Призыватель духов", "Профессия: гармония.");
T("spirit", 1, "amp", "Тихий зов", "Духи живут на 1 ход дольше.", { mods: { summonDur: 1 } });
T("spirit", 2, "shift", "Лёгкая гармония", "Гармония работает уже при двух разных духах.", { on: { beforeHit(b, s, c) { if (MECHANICS.spirit.value(b) === 2) c.mult *= 1.15; }, beforeHeal(b, s, c) { if (MECHANICS.spirit.value(b) === 2) c.amount *= 1.15; } } });
T("spirit", 3, "make", "Благословение духов", "В гармонии каждый ход возвращает 3% здоровья и маны.", { on: { turnStart(b) { if (MECHANICS.spirit.value(b) >= 3) { procHeal(b, 0.03, "гармония"); procMana(b, 0.03); } } } });

profSchool("undead", "mage", "Призыватель нежити", "Профессия: кости.");
T("undead", 1, "amp", "Крепкие кости", "Нежить живучее на 30%.", { mods: { summonHp: 0.3 } });
T("undead", 2, "shift", "Вечная служба", "Гибель нежити даёт сразу 2 кости.", { on: { summonDeath(b, s, c) { if (c.summon.type === "undead") bumpGauge(b, "undead", 1, 6); } } });
T("undead", 3, "make", "Трупный яд", "Удары нежити заражают: цель получает порчу.", { on: { turnStart(b) { if ((b.hero.summonedUnits || []).some((u) => u.type === "undead") && !hasFx(b.enemy, "corruption")) fx(b, "corruption", 2, dotValue(b, 0.12)); } } });

profSchool("light", "mage", "Маг света", "Профессия: сияние.");
T("light", 1, "amp", "Яркий свет", "Сияние копится на 30% быстрее.", { on: { heal(b, s, c) { const max = Math.round(b.hero.maxHp * 0.6); bumpGauge(b, "light", c.amount * 0.3, max); } } });
T("light", 2, "make", "Слепящий луч", "«Суд» ослепляет цель.", { on: { afterAction(b, s, c) { if (c.skill?.special === "judgement") fx(b, "blind", 2, 25); } } });
T("light", 3, "shift", "Вечный рассвет", "Каждый ход без здоровья на максимуме даёт маленькую регенерацию.", { on: { turnStart(b) { if (hpRatio(b.hero) < 1 && !hasFx(b.hero, "regeneration")) applyEffect(b, b.hero, { id: "regeneration", duration: 1, value: Math.round(b.hero.maxHp * 0.02) }, b.hero); } } });

profSchool("dark", "mage", "Маг тьмы", "Профессия: порча.");
T("dark", 1, "amp", "Чёрная кровь", "Порча сильнее на 30%.", { mods: { "val:corruption": 0.3 } });
T("dark", 2, "shift", "Сосуд тьмы", "Пока на враге есть порча, лечение от любых источников лучше на 20%.", { on: { beforeHeal(b, s, c) { if (hasFx(b.enemy, "corruption")) c.amount *= 1.2; } } });
T("dark", 3, "make", "Жатва", "Тик порчи лечит тебя на 20% своего урона.", { on: { tick(b, s, c) { if (c.id === "corruption") healUnit(b, b.hero, c.amount * 0.2, "жатва"); } } });

subSchool("fury", "warrior", "Ярость", "Подкласс: путь ярости.");
T("fury", 1, "amp", "Горячая голова", "Ярость копится на 30% быстрее от ударов.", { on: { afterHit(b) { bumpGauge(b, "fury", 2, 100); } } });
T("fury", 2, "shift", "Неутолённая", "В начале боя ярость уже 25.", { on: { start(b) { bumpGauge(b, "fury", 25, 100); } } });
T("fury", 3, "make", "Волна гнева", "На 100 ярости следующий удар бьёт дважды, и шкала падает до 50.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.fury?.value >= 100) { b.mech.fury.value = 50; mechNote(b, "Волна гнева!"); procHit(b, 1.2, "Волна гнева", "blood", { kind: "physical" }); } } } });

subSchool("bulwark", "warrior", "Оплот", "Подкласс: путь оплота.");
T("bulwark", 1, "amp", "Прочная кладка", "Камень стены снимается только сильными ударами (от 8% здоровья).", { on: { hurt(b, s, c) { if (c.hpDamage > 0 && c.hpDamage < b.hero.maxHp * 0.08) bumpGauge(b, "bulwark", 1, 5); } } });
T("bulwark", 2, "shift", "Готовая стена", "В начале боя стена уже в 2 камня.", { on: { start(b) { bumpGauge(b, "bulwark", 2, 5); } } });
T("bulwark", 3, "make", "Обвал", "Полная стена рушится на врага при стойке: сильный удар и оглушение.", { on: { afterAction(b, s, c) { if (c.type === "guard" && b.mech.bulwark?.value >= 5) { b.mech.bulwark.value = 2; mechNote(b, "Обвал!"); procHit(b, 2.2, "Обвал", "earth", { kind: "physical" }); applyStun(b, b.enemy, b.hero, 0.6); } } } });

profSchool("berserk", "warrior", "Берсерк", "Профессия: кровавый порог.");
T("berserk", 1, "amp", "Жажда крови", "Ниже 30% здоровья удары лечат ещё сильнее.", { on: { afterHit(b, s, c) { if (hpRatio(b.hero) < 0.3 && c.hpDamage > 0 && !c.proc) healUnit(b, b.hero, c.hpDamage * 0.15, "жажда"); } } });
T("berserk", 2, "shift", "Без страха", "Твои кровавые навыки стоят вдвое меньше здоровья.", { mods: { hpCost: -0.5 } });
T("berserk", 3, "make", "Последний бой", "После спасения от смерти следующие 3 хода каждый твой удар лечит на 10%.", { on: { afterHit(b, s, c) { if (b.mech.berserk?.saved && !s.spent && isDirectHit(c)) { s.n = (s.n || 0) + 1; procHeal(b, 0.1, "последний бой"); if (s.n >= 3) s.spent = true; } } } });

profSchool("breaker", "warrior", "Сокрушитель", "Профессия: трещины.");
T("breaker", 1, "amp", "Точка излома", "Каждая трещина снимает ещё 3% защиты.", { on: { beforeHit(b, s, c) { if (c.kind === "physical") c.pierce += (b.mech.breaker?.value || 0) * 0.03; } } });
T("breaker", 2, "shift", "Сквозная трещина", "Крит добавляет ещё одну трещину.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && c.crit) bumpGauge(b, "breaker", 1, 5); } } });
T("breaker", 3, "make", "Осколки брони", "Когда броня рушится, осколки режут врага: кровотечение.", { on: { applied(b, s, c) { if (c.id === "armor_break") fx(b, "bleed", 3, dotValue(b, 0.2)); } } });

profSchool("guardian", "warrior", "Страж", "Профессия: возмездие.");
T("guardian", 1, "amp", "Память о боли", "Возмездие копится на 25% быстрее.", { on: { hurt(b, s, c) { bumpGauge(b, "guardian", (c.absorbed + c.blocked) * 0.25, b.hero.maxHp); } } });
T("guardian", 2, "shift", "Живая расплата", "«Кара стража» также лечит на 10%.", { on: { afterAction(b, s, c) { if (c.skill?.special === "vengeance") procHeal(b, 0.1, "кара"); } } });
T("guardian", 3, "make", "Зов к бою", "Стойка заставляет врага слабеть: он тратит силы на твой щит.", { on: { afterAction(b, s, c) { if (c.type === "guard") fx(b, "weaken", 1, 0.2); } } });

profSchool("duelist", "warrior", "Дуэлянт", "Профессия: парирование.");
T("duelist", 1, "amp", "Точный ответ", "Контратака сильнее на 30%.", { on: { beforeHit(b, s, c) { if (c.label === "Контратака") c.mult *= 1.3; } } });
T("duelist", 2, "shift", "Вечная защита", "Стойка тоже взводит парирование.", { on: { afterAction(b, s, c) { if (c.type === "guard" && b.mech.duelist) b.mech.duelist.armed = true; } } });
T("duelist", 3, "make", "Обезоруживание", "Парирование ослабляет врага на 2 хода.", { on: { parried(b) { fx(b, "weaken", 2, 0.2); } } });

subSchool("marksman", "archer", "Стрелок", "Подкласс: сосредоточение.");
T("marksman", 1, "amp", "Ровное дыхание", "Рана больше не снимает сосредоточение, пока её сила ниже 8% здоровья.", { on: { hurt(b, s, c) { if (c.hpDamage > 0 && c.hpDamage < b.hero.maxHp * 0.08) bumpGauge(b, "marksman", 1, 5); } } });
T("marksman", 2, "shift", "Быстрое наведение", "В начале боя уже 2 единицы сосредоточения.", { on: { start(b) { bumpGauge(b, "marksman", 2, 5); } } });
T("marksman", 3, "make", "Идеальный момент", "На пяти единицах каждый выстрел ещё и метит цель.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.marksman?.value >= 5) fx(b, "mark", 2, 0.15); } } });

subSchool("wild", "archer", "Дикая тропа", "Подкласс: чутьё.");
T("wild", 1, "amp", "Звериный нюх", "Каждая беда на враге даёт ещё +3% урона.", { on: { beforeHit(b, s, c) { c.mult *= 1 + countEnemyDebuffs(b.enemy) * 0.03; } } });
T("wild", 2, "make", "Лесная отрава", "Первый выстрел в бою отравляет цель.", { on: { afterHit(b, s, c) { if (!s.done && isDirectHit(c)) { s.done = true; fx(b, "poison", 3, dotValue(b, 0.16)); } } } });
T("wild", 3, "shift", "Загнанная добыча", "Три и больше бед на враге: он ещё и замедлен.", { on: { applied(b) { if (countEnemyDebuffs(b.enemy) >= 3 && !hasFx(b.enemy, "slow")) applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.2 }, b.hero); } } });

profSchool("sniper", "archer", "Снайпер", "Профессия: смертельный выстрел.");
T("sniper", 1, "amp", "Глубокий вдох", "Выстрел в голову сильнее на 15%.", { on: { beforeHit(b, s, c) { if (c.skill?.special === "headshot") c.mult *= 1.15; } } });
T("sniper", 2, "shift", "Скрытая позиция", "Выстрел в голову не тратит 1 единицу сосредоточения.", { on: { afterAction(b, s, c) { if (c.skill?.special === "headshot") bumpGauge(b, "marksman", 1, 5); } } });
T("sniper", 3, "make", "Навылет", "Крит выстрела в голову пробивает цель насквозь: кровотечение.", { on: { afterHit(b, s, c) { if (c.skill?.special === "headshot" && c.crit) fx(b, "bleed", 3, dotValue(b, 0.25)); } } });

profSchool("stormshot", "archer", "Стрелок бури", "Профессия: шквал.");
T("stormshot", 1, "amp", "Быстрый натяг", "Шквал срабатывает на стрелу раньше.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && (s.n = (s.n || 0) + 1) % 5 === 0) bumpGauge(b, "stormshot", 1, 6); } } });
T("stormshot", 2, "shift", "Стрелы с ветром", "Залп шквала ускоряет тебя на ход.", { on: { beforeHit(b, s, c) { if (c.label === "Залп") applyEffect(b, b.hero, { id: "haste", duration: 1, value: 0.2 }, b.hero); } } });
T("stormshot", 3, "make", "Град", "Каждый третий залп бьёт ещё сильнее и замедляет цель.", { on: { beforeHit(b, s, c) { if (c.label === "Залп" && (s.n = (s.n || 0) + 1) % 6 === 0) { c.mult *= 2; applyEffect(b, b.enemy, { id: "slow", duration: 2, value: 0.2 }, b.hero); } } } });

profSchool("ranger", "archer", "Следопыт", "Профессия: ловушки.");
T("ranger", 1, "amp", "Точная установка", "Ловушка бьёт на 30% сильнее.", { on: { beforeHit(b, s, c) { if (b.mech.ranger && c.sure && c.label && /Силок|капкан/i.test(c.label)) c.mult *= 1.3; } } });
T("ranger", 2, "shift", "Запасной капкан", "После срабатывания ловушки следующая ставится быстрее.", { on: { afterAction(b, s, c) { if (c.skill?.special === "trap") c.tempo *= 0.7; } } });
T("ranger", 3, "make", "Сеть", "Каждая ловушка также ослепляет: враг запутался и не видит.", { on: { enemyTurn(b, s) { if (b.mech.ranger?.trap) s.armed = true; else if (s.armed) { s.armed = false; fx(b, "blind", 2, 20); } } } });

profSchool("beastmaster", "archer", "Зверолов", "Профессия: волк.");
T("beastmaster", 1, "amp", "Вожак", "Волк живучее и сильнее на 20%.", { mods: { summonHp: 0.2, summonPower: 0.2 } });
T("beastmaster", 2, "make", "Рваные раны", "Удары волка оставляют кровотечение.", { on: { turnStart(b) { if (findWolf(b.hero) && !hasFx(b.enemy, "bleed")) fx(b, "bleed", 2, dotValue(b, 0.15)); } } });
T("beastmaster", 3, "shift", "Стая", "Волк рядом: ты получаешь на 10% меньше урона и бьёшь на 10% сильнее.", { on: { beforeHit(b, s, c) { if (findWolf(b.hero)) c.mult *= 1.1; }, incoming(b, s, c) { if (findWolf(b.hero)) c.amount *= 0.9; } } });

subSchool("lyre", "bard", "Лира", "Подкласс: ритм.");
T("lyre", 1, "amp", "Чистый строй", "Единица ритма даёт ещё +2%.", { on: { beforeHit(b, s, c) { c.mult *= 1 + (b.mech.lyre?.value || 0) * 0.02; }, beforeHeal(b, s, c) { c.amount *= 1 + (b.mech.lyre?.value || 0) * 0.02; } } });
T("lyre", 2, "shift", "Вариация", "Повтор навыка не обнуляет ритм, а снимает одну единицу.", { on: { turnStart(b, s) { s.keep = b.mech.lyre?.value || 0; }, afterAction(b, s, c) { if (c.type === "skill" && b.mech.lyre && b.mech.lyre.value === 0 && s.keep > 1) b.mech.lyre.value = s.keep - 1; } } });
T("lyre", 3, "make", "Крещендо", "На 4 ритма навык бьёт ещё раз звуком.", { on: { afterAction(b, s, c) { if (c.skill && b.mech.lyre?.value >= 4 && b.enemy.currentHp > 0) { b.mech.lyre.value = 2; mechNote(b, "Крещендо!"); procHit(b, 1, "Крещендо", "air", { kind: "magic" }); } } } });

subSchool("hymn", "bard", "Гимн", "Подкласс: постоянный гимн.");
T("hymn", 1, "amp", "Сильный голос", "Гимн стойкости и ясности действуют на 50% сильнее.", { on: { turnStart(b) { const a = b.mech.hymn?.active; if (a === "endurance") procHeal(b, 0.015, "гимн"); if (a === "clarity") procMana(b, 0.03); } } });
T("hymn", 2, "shift", "Без раздумий", "Смена гимна не тратит время: следующий ход наступает быстрее.", { on: { afterAction(b, s, c) { if (c.skill?.hymn) c.tempo *= 0.5; } } });
T("hymn", 3, "make", "Песнь войны", "Гимн мощи ещё и ускоряет тебя на 10%.", { on: { turnStart(b) { if (b.mech.hymn?.active === "might") applyEffect(b, b.hero, { id: "haste", duration: 1, value: 0.1 }, b.hero); } } });

profSchool("skald", "bard", "Скальд", "Профессия: припев.");
T("skald", 1, "amp", "Громкий припев", "Припев сильнее на 30%.", { on: { beforeHit(b, s, c) { if (c.label === "Припев") c.mult *= 1.3; } } });
T("skald", 2, "shift", "Куплет за куплетом", "Каждый куплет возвращает 4% маны.", { on: { afterAction(b, s, c) { if (c.skill?.verse) procMana(b, 0.04); } } });
T("skald", 3, "make", "Сага о победе", "Припев снимает с тебя все беды.", { on: { afterAction(b, s, c) { if (c.skill?.verse && !(b.mech.skald?.verses || []).length) b.hero.effects = b.hero.effects.filter((e) => STATUS_EFFECT_DEFINITIONS[e.id]?.tone !== "bad"); } } });

profSchool("trickster", "bard", "Шут", "Профессия: карты судьбы.");
T("trickster", 1, "amp", "Крапленая колода", "Туз и кубки сильнее: всегда лишние +10%.", { on: { beforeHit(b, s, c) { if (b.mech.trickster?.card === "ace" && c.skill) c.mult *= 1.1; }, beforeHeal(b, s, c) { if (b.mech.trickster?.card === "cups") c.amount *= 1.1; } } });
T("trickster", 2, "shift", "Лишняя карта", "Подмена не занимает хода совсем и возвращает ману.", { on: { afterAction(b, s, c) { if (c.skill?.special === "redraw") { c.tempo *= 0.5; procMana(b, 0.04); } } } });
T("trickster", 3, "make", "Джокер", "С шансом 15% карта не расходуется.", { on: { turnStart(b, s) { if (s.prev && !b.mech.trickster?.card && roll(0.15)) b.mech.trickster.card = s.prev; s.prev = b.mech.trickster?.card; } } });

profSchool("cantor", "bard", "Кантор", "Профессия: избыток.");
T("cantor", 1, "amp", "Полнота", "Лишнее лечение копится на 25% быстрее.", { on: { heal(b, s, c) { if (c.overflow > 0) bumpGauge(b, "cantor", c.overflow * 0.25, Math.round(b.hero.maxHp * 0.6)); } } });
T("cantor", 2, "shift", "Хор над собой", "«Хорал» снимает с тебя слабость и метку.", { on: { afterAction(b, s, c) { if (c.skill?.special === "chorale") { removeFx(b.hero, "weaken"); removeFx(b.hero, "mark"); } } } });
T("cantor", 3, "make", "Отпевание", "Погребальная песнь оставляет порчу: слова гниют в голове врага.", { on: { afterAction(b, s, c) { if (c.skill?.id === "bard-dirge") fx(b, "corruption", 3, dotValue(b, 0.16)); } } });

profSchool("choirmaster", "bard", "Регент", "Профессия: хор.");
T("choirmaster", 1, "amp", "Подготовленный хор", "Голоса живут на 1 ход дольше и живучее.", { mods: { summonDur: 1, summonHp: 0.2 } });
T("choirmaster", 2, "shift", "Строй", "Аккорд работает уже при двух голосах.", { mods: { chordAt: -1 } });
T("choirmaster", 3, "make", "Прощальная нота", "Гибель голоса лечит тебя на 6%.", { on: { summonDeath(b, s, c) { if (c.summon.role === "voice") procHeal(b, 0.06, "нота"); } } });

subSchool("shade", "assassin", "Тень", "Подкласс: приёмы.");
T("shade", 1, "amp", "Отработанное движение", "В начале боя уже 1 приём.", { on: { start(b) { bumpGauge(b, "shade", 1, 5); } } });
T("shade", 2, "shift", "Экономный удар", "Добивание с пятью приёмами возвращает 2 приёма.", { on: { beforeHit(b, s, c) { if (c.skill?.finisher) s.full = (b.mech.shade?.value || 0) === 0 && s.was >= 5; }, afterAction(b, s, c) { if (c.skill?.finisher && s.was >= 5) bumpGauge(b, "shade", 2, 5); s.was = b.mech.shade?.value || 0; } } });
T("shade", 3, "make", "Удар милосердия", "Добивание с тремя и более приёмами всегда критическое.", { on: { turnStart(b, s) { s.value = b.mech.shade?.value || 0; }, beforeHit(b, s, c) { if (c.skill?.finisher && s.value >= 3) c.forceCrit = true; } } });

subSchool("venom", "assassin", "Токсин", "Подкласс: дозы.");
T("venom", 1, "amp", "Чистый токсин", "По отравленной цели удары сильнее ещё на 10%.", { on: { beforeHit(b, s, c) { const e = getEffect(b.enemy, "poison"); if (e) c.mult *= 1.1; } } });
T("venom", 2, "shift", "Быстрая рука", "Навык с ядом занимает меньше времени.", { on: { afterAction(b, s, c) { if ((c.skill?.appliedEffects || []).some((e) => e.id === "poison")) c.tempo *= 0.9; } } });
T("venom", 3, "make", "Кровь отравителя", "Попавший по тебе враг отравлен: ты давно состоишь из яда.", { on: { hurt(b, s, c) { if (c.hpDamage > 0 && c.kind === "physical") applyEffect(b, b.enemy, { id: "poison", duration: 2, value: dotValue(b, 0.1) }, b.hero); } } });

profSchool("blade", "assassin", "Клинок ночи", "Профессия: казнь.");
T("blade", 1, "amp", "Широкий порог", "Порог казни выше на 3%.", { mods: { executeBonus: 0.03 } });
T("blade", 2, "shift", "След клинка", "Казнь обычного врага возвращает половину здоровья от урона.", { on: { victory(b) { if (b.lastExecute && !b.enemy.isBoss) b.hero.currentHp = Math.min(b.hero.maxHp, Math.round(b.hero.currentHp + b.hero.maxHp * 0.15)); } } });
T("blade", 3, "make", "Смертельный круг", "Добивание по кровоточащей цели бьёт на 30% сильнее.", { on: { beforeHit(b, s, c) { if (c.skill?.finisher && hasFx(b.enemy, "bleed")) c.mult *= 1.3; } } });

profSchool("phantom", "assassin", "Фантом", "Профессия: тени.");
T("phantom", 1, "amp", "Плотная тень", "Удары теней сильнее на 30%.", { on: { beforeHit(b, s, c) { if (c.label === "Удар тени") c.mult *= 1.3; } } });
T("phantom", 2, "shift", "Живущие тени", "Каждые 3 хода рождается новая тень сама.", { on: { turnStart(b, s) { s.n = (s.n || 0) + 1; if (s.n % 3 === 0) bumpGauge(b, "phantom", 1, 3); } } });
T("phantom", 3, "make", "Заслон теней", "Тень может принять удар на себя: 25%, и она исчезает.", { on: { incoming(b, s, c) { if ((b.mech.phantom?.value || 0) > 0 && roll(0.25)) { bumpGauge(b, "phantom", -1, 3); c.parried = true; mechNote(b, "Тень заслоняет"); } } } });

profSchool("poisoner", "assassin", "Отравитель", "Профессия: вскрытие.");
T("poisoner", 1, "amp", "Точный разрез", "«Вскрытие раны» сильнее на 30%.", { mods: { lanceBonus: 0.3 } });
T("poisoner", 2, "shift", "Без лишнего", "«Вскрытие раны» не требует отката, если цель в двух бедах.", { on: { afterAction(b, s, c) { if (c.skill?.special === "lance_wound" && countEnemyDebuffs(b.enemy) >= 2) delete b.hero.cooldowns[c.skill.id]; } } });
T("poisoner", 3, "make", "Гниющая плоть", "Вскрытие оставляет глубокую рану и слабость.", { on: { afterAction(b, s, c) { if (c.skill?.special === "lance_wound") { applyEffect(b, b.enemy, { id: "wound", duration: 3 }, b.hero); fx(b, "weaken", 2, 0.2); } } } });

profSchool("plaguebearer", "assassin", "Чумной", "Профессия: заражение.");
T("plaguebearer", 1, "amp", "Лёгкая форма", "Заражение копится вдвое быстрее.", { on: { tick(b) { bumpGauge(b, "plaguebearer", 1, 5); } } });
T("plaguebearer", 2, "shift", "Носитель", "Пока идёт чума, ты получаешь на 10% меньше урона.", { on: { incoming(b, s, c) { if (b.mech.plaguebearer?.plague) c.amount *= 0.9; } } });
T("plaguebearer", 3, "make", "Мор", "В чуме каждый твой удар отравляет и ранит цель.", { on: { afterHit(b, s, c) { if (isDirectHit(c) && b.mech.plaguebearer?.plague) { fx(b, "poison", 2, dotValue(b, 0.1)); fx(b, "bleed", 2, dotValue(b, 0.1)); } } } });
