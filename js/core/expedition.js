// Expeditions: a chain of steps with forks, a loot bag at risk, and a boss at the end.
const NODE_TYPES = {
  battle: { id: "battle", name: "Бой", description: "Обычный противник этой тропы." },
  elite: { id: "elite", name: "Элита", description: "Сильный враг с особым свойством. Добыча лучше." },
  event: { id: "event", name: "Случай", description: "Встреча на дороге: выбор может помочь или навредить." },
  camp: { id: "camp", name: "Привал", description: "Отдых или подготовка: можно выбрать дар тропы." },
  shrine: { id: "shrine", name: "Алтарь", description: "Сила за плату. Там бывают дары до конца похода." },
  boss: { id: "boss", name: "Вожак", description: "Хозяин тропы. Победа завершает поход и даёт награду за прохождение." }
};

function getRegion(id) {
  return REGIONS.find((region) => region.id === id) || REGIONS[0];
}

function isRegionUnlocked(hero, index) {
  return index <= Number(hero.unlockedRegion || 0);
}

function getZoneLevelRange(hero, regionId, zoneKey) {
  const region = getRegion(regionId);
  const zone = ZONES[zoneKey];
  return zone.levelOffset.map((offset) => Math.max(1, region.floorLevel, hero.level + offset));
}

function rollEnemyLevel(hero, regionId, zoneKey) {
  const [low, high] = getZoneLevelRange(hero, regionId, zoneKey);
  return randomInt(low, high);
}

function createExpedition(hero, regionId, zoneKey) {
  const exp = {
    regionId, zoneKey, steps: ZONES[zoneKey].steps, step: 0, path: [], choices: [], damageBonus: 0,
    bag: { gold: 0, items: [], resources: {}, shards: 0, kills: 0, exp: 0 },
    pending: null, seenEvents: [], boons: [], pendingBoons: null
  };
  hero.records.expeditions += 1;
  generateChoices(exp);
  return exp;
}

function generateChoices(exp) {
  if (exp.lairId) {
    exp.choices = lairChoices(exp);
    return exp.choices;
  }
  const isLast = exp.step >= exp.steps - 1;
  if (isLast) {
    exp.choices = [scoutNode(exp, "boss")];
    return exp.choices;
  }
  const roll2 = () => weightedPick([
    { type: "battle", weight: 48 },
    { type: "elite", weight: exp.step >= 1 ? 18 : 0 },
    { type: "event", weight: exp.step >= 1 ? 20 : 8 },
    { type: "camp", weight: exp.step >= 1 ? 8 : 0 },
    { type: "shrine", weight: exp.step >= 1 ? 6 : 0 }
  ]);
  const first = roll2().type;
  let second = roll2().type;
  for (let tries = 0; second === first && tries < 6; tries += 1) second = roll2().type;
  exp.choices = (first === second ? [first] : [first, second]).map((type) => scoutNode(exp, type));
  return exp.choices;
}

function pickRegionEnemy(region) {
  return randomFrom(region.enemies);
}

// The player sees who waits on each road, so a fork is a real decision.
function scoutNode(exp, type) {
  if (!["battle", "elite", "boss"].includes(type)) return { type };
  const groups = ENCOUNTERS[exp.regionId];
  const singles = groups.filter((group) => group.length === 1).map((group) => group[0]);
  const supports = groups.flat().filter((id) => (ENEMY_DEFINITIONS[id].moves || []).some((move) => String(ENEMY_MOVES[move]?.kind).startsWith("ally")));
  const tough = ZONES[exp.zoneKey].power.hp > 1.2;
  const node = { type };
  if (type === "battle") node.pack = [...randomFrom(exp.step < 1 && !tough ? groups.filter((group) => group.length <= 2) : groups)];
  if (type === "elite") {
    node.pack = [randomFrom(singles)];
    node.affixId = randomFrom(ELITE_AFFIXES).id;
    if (supports.length && roll(tough ? 0.8 : 0.4)) node.pack.push(randomFrom(supports));
  }
  if (type === "boss") {
    node.pack = [randomFrom(singles), randomFrom(singles)];
    if (tough) node.pack.push(randomFrom(supports.length ? supports : singles));
    node.bossTrait = randomFrom(BOSS_TRAITS);
  }
  node.enemyId = node.pack[0];
  return node;
}

function describeScout(node) {
  if (!node?.enemyId) return null;
  const pack = node.pack || [node.enemyId];
  const def = ENEMY_DEFINITIONS[pack[0]];
  const affix = node.affixId ? ELITE_AFFIXES.find((entry) => entry.id === node.affixId) : null;
  const traits = [...new Set([...pack.flatMap((id) => ENEMY_DEFINITIONS[id].traits || []), ...(affix?.traits || []), ...(node.bossTrait ? [node.bossTrait] : [])])].filter((id) => ENEMY_TRAITS[id]);
  const counts = {};
  pack.slice(1).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  const rest = Object.entries(counts).map(([id, count]) => `${ENEMY_DEFINITIONS[id].name}${count > 1 ? ` ×${count}` : ""}`);
  const same = pack.every((id) => id === pack[0]) && pack.length > 1;
  const lead = `${affix ? `${affix.name} ` : ""}${node.type === "boss" && !node.lairMaster ? "Вожак: " : ""}${def.name}${same ? ` ×${pack.length}` : ""}`;
  return { name: same ? lead : [lead, ...rest].join(", "), traits, count: pack.length };
}

// Enters the selected fork. Returns what the UI has to show next.
function enterNode(hero, exp, choiceIndex) {
  const node = exp.choices[choiceIndex] || exp.choices[0];
  exp.pending = { type: node.type };
  if (["event", "camp", "shrine"].includes(node.type)) {
    const matches = (event) => (node.type === "event" ? !event.node : event.node === node.type);
    const available = EXPEDITION_EVENTS.filter((event) => matches(event) && !exp.seenEvents.includes(event.id));
    const event = randomFrom(available.length ? available : EXPEDITION_EVENTS.filter(matches));
    exp.seenEvents.push(event.id);
    exp.pending.eventId = event.id;
    return { kind: "event", event };
  }
  const group = buildEncounter(hero, exp, node);
  if (node.bossTrait) group[0].traits.push(node.bossTrait);
  return { kind: "battle", enemy: group, nodeType: node.type };
}

function buildNodeEnemy(hero, exp, node) {
  const region = getRegion(exp.regionId);
  const level = rollEnemyLevel(hero, exp.regionId, exp.zoneKey);
  const enemyId = node.enemyId || pickRegionEnemy(region);
  if (node.type === "boss") return makeEnemy(enemyId, level + 1, { boss: true });
  if (node.type === "elite") return makeEnemy(enemyId, level, { affix: ELITE_AFFIXES.find((entry) => entry.id === node.affixId) || randomFrom(ELITE_AFFIXES) });
  return makeEnemy(enemyId, level);
}

function completeStep(hero, exp) {
  const type = exp.pending?.type || "battle";
  exp.path.push(type);
  exp.step += 1;
  exp.pending = null;
  // A beaten elite always leaves a boon behind, unless this was the final step.
  if (type === "elite" && exp.step < exp.steps && !exp.pendingBoons) offerBoons(hero, exp);
  // A short rest between steps: wounds carry over, but the hero catches a breath.
  hero.currentHp = Math.min(hero.maxHp, Math.round(hero.currentHp + hero.maxHp * 0.08));
  hero.currentMana = Math.min(hero.maxMana, Math.round(hero.currentMana + hero.maxMana * 0.15));
  clearBattleState(hero);
  if (exp.step < exp.steps) generateChoices(exp);
  else exp.choices = [];
  return exp.step >= exp.steps;
}

function rollItemRarity(hero, zoneKey, enemy) {
  const quality = clamp((Number(hero.dropQuality || 1) - 1) / 12, 0, DROP_QUALITY_BONUS_CAP);
  const weights = ZONES[zoneKey].rarityWeights.map((weight, index) => weight * (index >= 2 ? 1 + quality : 1));
  const shift = enemy.isGuardian ? 2 : enemy.isBoss ? 1 : 0;
  const shifted = [...weights];
  for (let i = 0; i < shift; i += 1) {
    shifted.unshift(0);
    const overflow = shifted.pop();
    shifted[shifted.length - 1] += overflow;
  }
  return weightedPick(RARITY_KEYS.map((key, index) => ({ key, weight: shifted[index] }))).key;
}

function rollBossExpMultiplier(luck) {
  const maxMult = clamp(2 + luck / 40, 2, 3);
  return Number((1.5 + rand() * (maxMult - 1.5)).toFixed(2));
}

// Rewards for one fight. Experience is kept for good; everything else goes to the bag.
function calculateBattleRewards(hero, enemy, zoneKey, regionId) {
  const zone = ZONES[zoneKey] || ZONES.green;
  const region = getRegion(regionId);
  let expGain = (36 + enemy.level * 23) * zone.rewardFactor * EXP_GAIN_FACTOR * (1 + tm(hero, "xp"));
  let bossMult = 1;
  if (enemy.isBoss) bossMult = rollBossExpMultiplier(Number(hero.totalStats?.luck || 0));
  else if (enemy.isElite) bossMult = 1.5;
  expGain = Math.round(expGain * bossMult);
  const gold = Math.round((10 + enemy.level * 5) * zone.rewardFactor * (enemy.isBoss ? 2.3 : enemy.isElite ? 1.6 : 1) * (1 + rand() * 0.4) * GOLD_GAIN_FACTOR * (1 + tm(hero, "gold")));

  const dropBonus = (1 + Math.min(DROP_CHANCE_BONUS_CAP, Number(hero.dropChance || 0) / 100)) * (1 + tm(hero, "drop")) * DROP_GAIN_FACTOR;
  const itemChance = enemy.isBoss ? 1 : enemy.isElite ? 0.75 : clamp(0.22 * dropBonus, 0, 0.6);
  const items = [];
  if (roll(itemChance)) items.push(generateItem({ level: enemy.level, rarity: rollItemRarity(hero, zoneKey, enemy), classKey: hero.classKey }));
  if (enemy.isGuardian) {
    // A boss drops a relic of a set from its region's lairs.
    const pool = Object.values(LAIR_CATALOG).filter((lair) => lair.regionId === regionId).flatMap((lair) => lair.sets).filter((id) => SET_CATALOG[id].classes.includes(hero.classKey));
    const fallback = Object.values(SET_CATALOG).filter((set) => set.classes.includes(hero.classKey)).map((set) => set.id);
    items.push(generateRelic(hero, randomFrom(pool.length ? pool : fallback), enemy.level));
  }

  const resources = {};
  const addResource = (id, amount) => { resources[id] = (resources[id] || 0) + amount; };
  if (roll(enemy.isBoss ? 1 : enemy.isElite ? 0.85 : 0.45)) addResource(region.resource, enemy.isBoss ? randomInt(2, 3) : 1);
  if (roll((enemy.isBoss ? 0.6 : enemy.isElite ? 0.3 : 0.08) * zone.rewardFactor)) addResource(region.bonusResource, 1);
  let shards = 0;
  if (enemy.isGuardian) shards = 4;
  else if (enemy.isBoss && roll(0.65)) shards = randomInt(1, 2);
  else if (enemy.isElite && roll(0.25)) shards = 1;
  return { exp: expGain, bossMult, gold, items, resources, shards };
}

// A group pays by share: three wolves are worth more than one, but not three times more.
function calculateEncounterRewards(hero, foes, zoneKey, regionId) {
  const list = Array.isArray(foes) ? foes : [foes];
  const total = { exp: 0, bossMult: 1, gold: 0, items: [], resources: {}, shards: 0 };
  list.filter((foe) => Number(foe.share ?? 1) > 0).forEach((foe) => {
    const one = calculateBattleRewards(hero, foe, zoneKey, regionId);
    const share = Number(foe.share ?? 1);
    total.exp += Math.round(one.exp * share);
    total.gold += Math.round(one.gold * share);
    total.bossMult = Math.max(total.bossMult, one.bossMult);
    total.shards += one.shards;
    if (share >= 0.99 || roll(share)) total.items.push(...one.items);
    Object.entries(one.resources).forEach(([id, amount]) => { total.resources[id] = (total.resources[id] || 0) + amount; });
  });
  return total;
}

// Found gear goes straight to the backpack, so it can be worn at once. Until the expedition ends it stays at risk.
function addTrailItem(hero, exp, item) {
  item.fromTrail = true;
  if (!addItemToInventory(hero, item)) exp.bag.items.push(item);
}

function getTrailItems(hero, exp) {
  return [...hero.inventory.filter((item) => item?.fromTrail), ...(exp?.bag?.items || [])];
}

function applyRewardsToBag(hero, exp, rewards) {
  exp.bag.gold += rewards.gold;
  exp.bag.exp += rewards.exp;
  rewards.items.forEach((item) => addTrailItem(hero, exp, item));
  Object.entries(rewards.resources).forEach(([id, amount]) => { exp.bag.resources[id] = (exp.bag.resources[id] || 0) + amount; });
  exp.bag.shards += rewards.shards;
  exp.bag.kills += 1;
}

function recordKill(hero, enemy) {
  hero.records.kills += 1;
  if (enemy.isBoss) hero.records.bosses += 1;
  if (enemy.isElite) hero.records.elites += 1;
  hero.records.bestiary[enemy.defId] = Number(hero.records.bestiary[enemy.defId] || 0) + 1;
}

// outcome: "complete", "retreat" or "death". Death loses found items left in the pack and half of the gold and materials.
function finishExpedition(hero, exp, outcome) {
  const bag = exp.bag;
  const zone = ZONES[exp.zoneKey];
  const summary = { outcome, regionId: exp.regionId, zoneKey: exp.zoneKey, gold: 0, items: [], soldItems: 0, soldGold: 0, resources: {}, shards: 0, exp: bag.exp, lostItems: 0, lostGold: 0, completionBonus: 0 };
  const share = outcome === "death" ? 0.5 : 1;
  summary.gold = Math.round(bag.gold * share);
  summary.lostGold = bag.gold - summary.gold;
  if (outcome === "retreat" && hero.story) hero.story.retreats = Number(hero.story.retreats || 0) + 1;
  if (outcome === "complete" && exp.lairId) finishLairRun(hero, exp, summary);
  if (outcome === "complete" && !exp.lairId) markTrailCleared(hero, exp.regionId, exp.zoneKey);
  if (outcome === "complete") {
    summary.completionBonus = Math.round(bag.gold * 0.25 * zone.rewardFactor);
    summary.gold += summary.completionBonus;
    hero.records.completed += 1;
  }
  hero.gold += summary.gold;
  Object.entries(bag.resources).forEach(([id, amount]) => {
    const kept = outcome === "death" ? Math.floor(amount * 0.5) : amount;
    if (kept > 0) {
      hero.resources[id] = Number(hero.resources[id] || 0) + kept;
      summary.resources[id] = kept;
    }
  });
  summary.shards = outcome === "death" ? Math.floor(bag.shards * 0.5) : bag.shards;
  hero.mutationShards += summary.shards;
  const worn = Object.values(hero.equipment).filter((item) => item?.fromTrail);
  if (outcome === "death") {
    // What the hero wears survives; what is still in the pack is lost.
    summary.lostItems = bag.items.length + hero.inventory.filter((item) => item?.fromTrail).length;
    hero.inventory = hero.inventory.map((item) => (item?.fromTrail ? null : item));
    summary.keptWorn = worn.length;
    hero.records.deaths += 1;
    noteStoryDeath(hero);
  } else {
    summary.items.push(...worn, ...hero.inventory.filter((item) => item?.fromTrail));
    bag.items.forEach((item) => {
      const result = stowOrSell(hero, item);
      if (result.stored) summary.items.push(item);
      if (result.soldItem) {
        summary.soldItems += 1;
        summary.soldGold += result.gold;
      }
    });
  }
  [...hero.inventory, ...Object.values(hero.equipment)].forEach((item) => { if (item) item.fromTrail = false; });
  noteCampTrip(hero, { outcome, kind: exp.lairId ? "lair" : "trail", regionId: exp.regionId, zoneKey: exp.zoneKey, lairId: exp.lairId });
  hero.expedition = null;
  restoreHero(hero);
  if (!hero.shop || Number(hero.records.expeditions) - Number(hero.shop.expeditionsAtRefresh || 0) >= 2) refreshShopStock(hero);
  return summary;
}

// Guardian fights unlock the next region. They happen outside of expeditions and have no bag at risk.
function getAvailableGuardian(hero, regionIndex) {
  const region = REGIONS[regionIndex];
  if (!region || hero.defeatedGuardians.includes(region.guardian)) return null;
  const def = ENEMY_DEFINITIONS[region.guardian];
  return { id: region.guardian, def, region, requiredLevel: Math.max(1, def.level - 1), ready: hero.level >= def.level - 1 && getTrailClears(hero, region.id).includes("purple"), needsTrail: !getTrailClears(hero, region.id).includes("purple") };
}

function onGuardianDefeated(hero, enemy) {
  hero.defeatedGuardians.push(enemy.defId);
  const index = REGIONS.findIndex((region) => region.guardian === enemy.defId);
  if (index >= 0) hero.unlockedRegion = Math.max(hero.unlockedRegion, Math.min(REGIONS.length - 1, index + 1));
  if (enemy.isFinal) hero.won = true;
  noteCampTrip(hero, { outcome: "complete", kind: "guardian", guardian: enemy.defId, regionId: REGIONS[index]?.id });
}

// Helper object passed to event options. Each method returns a result used by the UI.
function createEventContext(hero, exp) {
  const region = getRegion(exp.regionId);
  const goldBase = 20 + hero.level * 8;
  return {
    note: (text) => ({ text, tone: "neutral" }),
    heal(ratio, text) {
      const before = hero.currentHp;
      hero.currentHp = Math.min(hero.maxHp, Math.round(hero.currentHp + hero.maxHp * ratio));
      return { text: `${text} +${hero.currentHp - before} здоровья.`, tone: "good" };
    },
    hurt(ratio, text) {
      const loss = Math.round(hero.maxHp * ratio);
      hero.currentHp = Math.max(1, hero.currentHp - loss);
      return { text: `${text} -${loss} здоровья.`, tone: "bad" };
    },
    restoreMana(ratio, text) {
      const before = hero.currentMana;
      hero.currentMana = Math.min(hero.maxMana, Math.round(hero.currentMana + hero.maxMana * ratio));
      return { text: `${text} +${hero.currentMana - before} маны.`, tone: "good" };
    },
    drainMana(ratio, text) {
      const loss = Math.round(hero.maxMana * ratio);
      hero.currentMana = Math.max(0, hero.currentMana - loss);
      return { text: `${text} -${loss} маны.`, tone: "neutral" };
    },
    bloodPact(cost, bonus) {
      const loss = Math.round(hero.maxHp * cost);
      hero.currentHp = Math.max(1, hero.currentHp - loss);
      exp.damageBonus = bonus;
      return { text: `Камень пьёт кровь: -${loss} здоровья. Следующий бой: +${Math.round(bonus * 100)}% урона.`, tone: "neutral" };
    },
    loot(scale, text) {
      const gold = Math.round(goldBase * scale * ZONES[exp.zoneKey].rewardFactor);
      exp.bag.gold += gold;
      const rarity = rollItemRarity(hero, exp.zoneKey, {});
      const item = generateItem({ level: Math.max(1, hero.level), rarity, classKey: hero.classKey });
      addTrailItem(hero, exp, item);
      return { text: `${text} +${gold} золота, ${getItemDisplayName(item)} (в рюкзаке).`, tone: "good", item };
    },
    ambush(text) {
      return { text, tone: "bad", battle: makeEnemy(pickRegionEnemy(region), rollEnemyLevel(hero, exp.regionId, exp.zoneKey), { affix: randomFrom(ELITE_AFFIXES) }), nodeType: "elite" };
    },
    tradeResources() {
      const price = 25 + hero.level * 6;
      if (exp.bag.gold < price) return { text: `Нужно ${price} золота в сумке, а там только ${exp.bag.gold}.`, tone: "neutral" };
      exp.bag.gold -= price;
      exp.bag.resources[region.resource] = (exp.bag.resources[region.resource] || 0) + 2;
      return { text: `Кузнец отдаёт два куска материала за ${price} золота.`, tone: "good" };
    },
    tradePotion() {
      const price = getPotionPrice("hp", hero);
      if (exp.bag.gold < price) return { text: `Нужно ${price} золота в сумке, а там только ${exp.bag.gold}.`, tone: "neutral" };
      if (hero.potions.hp >= POTION_LIMIT) return { text: "В поясе больше нет места для зелий.", tone: "neutral" };
      exp.bag.gold -= price;
      hero.potions.hp += 1;
      return { text: `Зелье лечения куплено за ${price} золота.`, tone: "good" };
    },
    statCheck(stat) {
      return roll(getStatCheckChance(hero, stat));
    },
    expGift(ratio, text) {
      const amount = Math.round(getExperienceForNextLevel(hero.level) * ratio);
      const summary = awardExperience(hero, amount);
      exp.bag.exp += amount;
      return { text: `${text} +${amount} опыта.`, tone: "good", levelUp: summary.levels ? summary : null };
    },
    goldGift(scale, text) {
      const gold = Math.round(goldBase * scale);
      exp.bag.gold += gold;
      return { text: `${text} +${gold} золота в сумку.`, tone: "good" };
    },
    rest(ratio) {
      hero.currentHp = Math.min(hero.maxHp, Math.round(hero.currentHp + hero.maxHp * ratio));
      hero.currentMana = Math.min(hero.maxMana, Math.round(hero.currentMana + hero.maxMana * ratio));
      return { text: `Ты отдыхаешь у костра: +${Math.round(ratio * 100)}% здоровья и маны.`, tone: "good" };
    },
    boon(text) {
      offerBoons(hero, exp);
      return { text, tone: "good" };
    },
    hurtThenBoon(ratio, text) {
      const hurt = this.hurt(ratio, text);
      offerBoons(hero, exp);
      return { text: hurt.text, tone: "neutral" };
    },
    cursedBoon(text) {
      const cursed = getBoonPool(hero, true);
      exp.pendingBoons = cursed.sort(() => rand() - 0.5).slice(0, 2).map((boon) => boon.id);
      if (!exp.pendingBoons.length) exp.pendingBoons = null;
      return { text, tone: "neutral" };
    },
    givePotion() {
      if (hero.potions.hp <= 0) return { text: "Зелий нет. Ты можешь только пожать плечами.", tone: "neutral" };
      hero.potions.hp -= 1;
      const amount = Math.round(getExperienceForNextLevel(hero.level) * 0.25);
      const summary = awardExperience(hero, amount);
      exp.bag.exp += amount;
      offerBoons(hero, exp);
      return { text: `Путник благодарит тебя и делится тем, что знает: +${amount} опыта.`, tone: "good", levelUp: summary.levels ? summary : null };
    },
    robbery() {
      const gold = Math.round(goldBase * 2);
      exp.bag.gold += gold;
      const cursed = getBoonPool(hero, true);
      if (cursed.length) {
        exp.boons = [...(exp.boons || []), randomFrom(cursed).id];
        applyDerivedStats(hero);
      }
      return { text: `+${gold} золота в сумку. Что-то тёмное теперь идёт за тобой: проклятый дар уже с тобой.`, tone: "bad" };
    },
    buyBoon(id, text, magicId) {
      const price = 20 + hero.level * 5;
      const boonId = BOONS[id].classes.includes(hero.classKey) ? id : magicId;
      if (exp.bag.gold < price) return { text: `Нужно ${price} золота в сумке, а там только ${exp.bag.gold}.`, tone: "neutral" };
      if ((exp.boons || []).includes(boonId)) return { text: "Это уже сделано.", tone: "neutral" };
      exp.bag.gold -= price;
      exp.boons = [...(exp.boons || []), boonId];
      applyDerivedStats(hero);
      return { text: `${text} Получен дар «${BOONS[boonId].name}» за ${price} золота.`, tone: "good" };
    },
    ambushBoon(text) {
      offerBoons(hero, exp);
      return { ...this.ambush(text) };
    },
    goldLoss(ratio, text) {
      const loss = Math.round(exp.bag.gold * ratio);
      exp.bag.gold -= loss;
      return { text: `${text} -${loss} золота из сумки.`, tone: "bad" };
    }
  };
}

function getStatCheckChance(hero, stat) {
  const value = Number(hero.totalStats?.[stat] || 0);
  const expected = 6 + hero.level * 0.9;
  return clamp(0.55 + (value - expected) * 0.03, 0.25, 0.9);
}

function resolveEventOption(hero, exp, event, optionIndex) {
  const option = event.options[optionIndex] || event.options[0];
  return option.resolve(createEventContext(hero, exp), option);
}

// Rough danger estimate for zone cards: compares hero with a typical enemy of that zone.
function estimateZoneDanger(hero, regionId, zoneKey) {
  const region = getRegion(regionId);
  const [low, high] = getZoneLevelRange(hero, regionId, zoneKey);
  const level = Math.round((low + high) / 2);
  const enemy = makeEnemy(region.enemies[0], level);
  const fake = { hero, enemy, damageBonus: 0, guard: false };
  const outgoing = Math.max(estimateDamage(hero, enemy, "physical", 1.2, 0, fake).amount, estimateDamage(hero, enemy, "magic", 1.3, 0, fake).amount);
  const incoming = Math.max(estimateDamage(enemy, hero, "physical", 1.1, 0, fake).amount, estimateDamage(enemy, hero, "magic", 1.1, 0, fake).amount);
  const ttk = enemy.maxHp / Math.max(1, outgoing);
  const ttd = hero.maxHp / Math.max(1, incoming);
  const ratio = ttd / Math.max(1, ttk * ZONES[zoneKey].steps * 0.42);
  return ratio > 0.95 ? { key: "easy", label: "Легко" } : ratio > 0.55 ? { key: "fair", label: "По силам" } : ratio > 0.32 ? { key: "hard", label: "Тяжело" } : { key: "deadly", label: "Смертельно" };
}
