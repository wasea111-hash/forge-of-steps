// Turns battle events into staging: who moves where, which clip plays, which effect fires and when.
// Target choice is visible here: a melee hero runs to the foe the player picked, shots fly at that foe.
const SKILL_STAGING = {
  // Assassin. melee: runs to the target. ranged: stays and throws. self: stays in place.
  "assassin-shadow-lunge": { clip: "stab", melee: true, fx: "thrust" },
  "assassin-venom-fang": { clip: "stab", melee: true, fx: "thrust", tint: "#9be34f" },
  "assassin-flicker-cut": { clip: "twin_slash", melee: true, fx: "cross", fast: true },
  "assassin-nightfall": { clip: "backstab", melee: true, fx: "drop", tint: "#ff3d52" },
  "assassin-smoke-step": { clip: "smoke", self: true, fx: "smoke" },
  "assassin-gut-strike": { clip: "stab", melee: true, fx: "thrust", tint: "#ff3d52" },
  "assassin-throwing-knife": { clip: "throw", ranged: true, shot: "knife" },
  "assassin-blade-dance": { clip: "twin_slash", melee: true, fx: "cross", tint: "#ff3d52", sweep: true },
  "assassin-toxic-cut": { clip: "low_sweep", melee: true, fx: "sweep", tint: "#9be34f" },
  "assassin-fume": { clip: "throw", ranged: true, shot: "flask", tint: "#9be34f", cloud: true },
  "assassin-boil-blood": { clip: "low_sweep", melee: true, fx: "sweep", tint: "#9be34f" },
  "assassin-twin-fangs": { clip: "twin_slash", melee: true, fx: "cross", tint: "#ff3d52" },
  "assassin-execution": { clip: "backstab", melee: true, fx: "drop", tint: "#ff3d52" },
  "assassin-shadow-strike": { clip: "backstab", melee: true, fx: "drop", tint: "#a974ff" },
  "assassin-vanish": { clip: "smoke", self: true, fx: "smoke" },
  "assassin-black-vial": { clip: "throw", ranged: true, shot: "flask", tint: "#9be34f", cloud: true },
  "assassin-virulence": { clip: "low_sweep", melee: true, fx: "sweep", tint: "#9be34f" },
  "assassin-lance-wound": { clip: "stab", melee: true, fx: "thrust", tint: "#9be34f" },
  "assassin-plague-touch": { clip: "stab", melee: true, fx: "thrust", tint: "#9be34f" },
  "assassin-festering-wound": { clip: "low_sweep", melee: true, fx: "sweep", tint: "#ff3d52" }
};

// How the fast skills travel. dash: a streak with afterimages. blink: gone in smoke, out behind the target. leap: a jump that lands hard. charge: a heavy rush.
const SKILL_MOVES = {
  "assassin-shadow-lunge": { move: "dash" }, "assassin-venom-fang": { move: "dash" }, "assassin-flicker-cut": { move: "blink", behind: true }, "assassin-nightfall": { move: "blink", behind: true },
  "assassin-gut-strike": { move: "dash" }, "assassin-blade-dance": { move: "blink", behind: true }, "assassin-toxic-cut": { move: "dash" }, "assassin-boil-blood": { move: "dash" },
  "assassin-twin-fangs": { move: "dash" }, "assassin-execution": { move: "blink", behind: true }, "assassin-shadow-strike": { move: "blink", behind: true }, "assassin-virulence": { move: "dash" },
  "assassin-lance-wound": { move: "dash" }, "assassin-plague-touch": { move: "dash" }, "assassin-festering-wound": { move: "dash" },
  "assassin-smoke-step": { hop: "blink" }, "assassin-vanish": { hop: "blink" }
};
Object.entries(SKILL_MOVES).forEach(([id, extra]) => { if (SKILL_STAGING[id]) Object.assign(SKILL_STAGING[id], extra); });
const FOE_MOVES = { beast: "leap", rogue: "dash", imp: "blink", knight: "charge", golem: "charge", smith: "leap", slime: "leap", shard: "dash" };

const HERO_DEFAULTS = {
  assassin: { attack: { clip: "twin_slash", melee: true, fx: "cross", fast: true, move: "dash" }, wait: { clip: "smoke", self: true, fx: "smoke", hop: "blink" }, ult: { clip: "backstab", melee: true, fx: "drop", tint: "#ff3d52", ult: true, move: "blink", behind: true } },
  warrior: { attack: { clip: "sweep", melee: true, fx: "slash", move: "charge" }, wait: { clip: "warcry", self: true, fx: "aura", tint: "#ff7a3c" }, ult: { clip: "overhead", melee: true, fx: "drop", tint: "#ff3d52", ult: true, vfx: "earth", move: "leap" } },
  mage: { attack: { clip: "staff_swing", ranged: true, shot: "bolt", tint: "#8fa0ff" }, wait: { clip: "cast_up", self: true, fx: "aura", tint: "#7fb8ff" }, ult: { clip: "cast_heavy", ranged: true, shot: "orb", big: true, tint: "#8fa0ff", ult: true, vfx: "arcane" } },
  archer: { attack: { clip: "bow_rapid", ranged: true, shot: "arrow" }, wait: { clip: "trap_set", self: true, fx: "smoke", hop: "back" }, ult: { clip: "bow_rain", self: true, rain: true, ult: true } },
  bard: { attack: { clip: "strum", ranged: true, shot: "note", tint: "#ffe9a0" }, wait: { clip: "song", self: true, fx: "aura", tint: "#e9a8ff" }, ult: { clip: "song", self: true, fx: "aura", tint: "#ffe9a0", ult: true, vfx: "holy" } }
};

// Most skills get their staging from their own data: the same rules as a choreographer would follow.
function autoStaging(skill, classKey) {
  const name = skill.id;
  const offensive = Boolean(skill.attackType);
  const debuff = (skill.appliedEffects || []).some((e) => e.target !== "self" && STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad");
  const heals = Boolean(skill.selfHealMultiplier) && !offensive;
  const summon = Boolean(skill.summonUnitConfig);
  const shield = skill.specialAction === "light_shield";
  const buff = !offensive && !heals && !summon && !shield;
  const heavy = Number(skill.tempo || 1) > 1 || Number(skill.powerMultiplier || 0) >= 2 || Number(skill.resourceCost || 0) >= 22;
  const stuns = (skill.appliedEffects || []).some((e) => e.id === "stun");
  const hits = Number(skill.hits || 1);
  const element = skill.element;
  const tint = Stage3D.ELEMENT[element];
  const base = { tint, vfx: element };
  if (skill.special === "trap") return { clip: classKey === "archer" ? "trap_set" : "smoke", self: true, fx: "smoke" };
  // Different skills of one class get different blows, chosen by the skill itself, not at random each time.
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  if (classKey === "warrior") {
    if (shield || /wall|guard|deep-guard/.test(name)) return { clip: "guard", self: true, fx: "shieldwall", tint: "#ffe9a0" };
    if (buff || heals) return { clip: "warcry", self: true, fx: "aura", tint: tint || "#ff7a3c", vfx: element === "blood" ? "blood" : null };
    if (stuns || /bash|ram/.test(name)) return { ...base, clip: "bash", melee: true, fx: "impact", vfx: null, move: "charge" };
    if (skill.aoe) return { ...base, clip: "sweep", melee: true, fx: "slash", move: "leap" };
    if (hits > 1) return { ...base, clip: "sweep", melee: true, fx: "cross", move: "dash" };
    return heavy ? { ...base, clip: "overhead", melee: true, fx: "drop", move: "leap" } : { ...base, clip: ["stab", "sweep", "low_sweep"][hash % 3], melee: true, fx: "thrust", move: "dash" };
  }
  if (classKey === "mage") {
    if (name === "mage-astral-rift" || name === "mage-reversal") return { ...base, clip: "cast_heavy", melee: true, reach: 1.9, reachCast: true, move: "blink", fx: "drop" };
    if (summon) return { clip: "cast_up", self: true, fx: "summon", tint: tint || "#a974ff" };
    if (heals || shield) return { clip: "cast_up", self: true, fx: shield ? "shieldwall" : "aura", tint: tint || "#8dff9a", vfx: "holyself" };
    if (buff) return { clip: "cast_up", self: true, fx: "aura", tint: tint || "#8fa0ff" };
    if (element === "earth" || element === "air" || element === "holy") return { ...base, clip: heavy ? "cast_heavy" : "cast_forward", direct: true };
    if (skill.aoe) return { ...base, clip: "cast_up", direct: true };
    return { ...base, clip: heavy ? "cast_heavy" : "cast_forward", ranged: true, shot: heavy ? "orb" : "bolt", big: heavy };
  }
  if (classKey === "archer") {
    if (/wolf|pack-tactics|heel|call-wolf/.test(name)) return { clip: "trap_set", self: true, fx: "aura", tint: "#d8c8a0" };
    if (buff) return { clip: "bow_rain", self: true, fx: "aura", tint: tint || "#c8f0e8" };
    if (skill.aoe) return { ...base, clip: "bow_rain", self: true, rain: true };
    if (hits > 1) return { ...base, clip: "bow_rapid", ranged: true, shot: "arrow", volley: hits };
    return { ...base, clip: heavy ? "bow_shot" : "bow_rapid", ranged: true, shot: "arrow", big: heavy };
  }
  if (classKey === "bard") {
    if (summon) return { clip: "song", self: true, fx: "summon", tint: "#ffe9a0" };
    if (heals || shield) return { clip: "song", self: true, fx: shield ? "shieldwall" : "aura", tint: tint || "#8dff9a", vfx: "holyself" };
    if (buff) return { clip: "song", self: true, fx: "aura", tint: tint || "#ffcf66" };
    if (debuff && !heavy) return { ...base, clip: "shout", ranged: true, shot: "note" };
    return { ...base, clip: heavy ? "shout" : "strum", ranged: true, shot: "note", big: heavy };
  }
  // Assassin skills not listed by hand.
  if (buff) return { clip: "smoke", self: true, fx: "smoke", hop: "blink" };
  return heavy ? { ...base, clip: "backstab", melee: true, fx: "drop", move: "blink", behind: true } : { ...base, clip: ["stab", "twin_slash", "low_sweep"][hash % 3], melee: true, fx: "thrust", move: "dash" };
}

function stagingForEnemy(art, ev) {
  const name = String(ev.name || "");
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const tint = Stage3D.ELEMENT[ev.element];
  if (art === "knight" || art === "golem" || art === "smith") {
    if (ev.anim === "cast") return art === "smith" && ev.heavy ? { clip: "cast_heavy", ranged: true, shot: "orb", big: true, tint: "#ff8a3c", vfx: "fire" } : art === "smith" ? { clip: "warcry", self: true, fx: "aura", tint: "#ff8a3c" } : { clip: art === "golem" ? "bash" : "bash", self: true, fx: "aura", tint: tint || "#ffe9a0" };
    if (ev.heavy) return { clip: "overhead", melee: true, reach: art === "golem" ? 1.6 : art === "smith" ? 1.9 : 1.3, fx: "drop", tint: tint || "#ffb35c", vfx: art === "golem" ? "earth" : art === "smith" ? "fire" : null };
    return [{ clip: "sweep", melee: true, reach: art === "smith" ? 1.8 : 1.3, fx: "slash" }, { clip: art === "smith" ? "overhead" : "bash", melee: true, reach: art === "smith" ? 1.8 : 1.3, fx: "impact" }][hash % 2];
  }
  if (art === "wraith" || art === "imp") {
    if (ev.anim === "attack" && art === "imp") return { clip: "twin_slash", melee: true, fx: "cross", tint: tint || "#ff8a3c" };
    if (ev.heavy) return { clip: "cast_heavy", ranged: true, shot: "orb", big: true, tint: tint || "#a974ff", vfx: ev.element };
    if (ev.ranged || ev.anim === "attack") return { clip: "cast_forward", ranged: true, shot: "bolt", tint: tint || "#c8e8ff", vfx: null };
    return { clip: "cast_up", self: true, fx: "aura", tint: tint || "#a974ff" };
  }
  if (art === "shard") {
    if (ev.heavy) return { clip: "cast_heavy", ranged: true, shot: "orb", big: true, tint: tint || "#8fa0ff" };
    if (ev.ranged) return { clip: "cast_forward", ranged: true, shot: "bolt", tint: tint || "#8fd0ff" };
    if (ev.anim === "cast") return { clip: "cast_up", self: true, fx: "aura", tint: "#8fd0ff" };
    return { clip: "lunge", melee: true, reach: 1.5, fx: "impact", impact: 11 };
  }
  if (art === "beast") {
    if (ev.heavy) return { clip: "pounce", lunge: 0.95, fx: "drop", tint: "#ff3d52", impact: 15 };
    if (ev.anim === "cast") return { clip: "howl", self: true, fx: "howl" };
    return { clip: "bite", melee: true, reach: 1.75, fx: "bite", impact: 9 };
  }
  if (art === "slime") {
    if (ev.ranged) return { clip: "spit", ranged: true, shot: "glob", tint: ev.element === "fire" ? "#ff8a3c" : "#9be34f" };
    if (ev.anim === "cast") return { clip: "mend", self: true, fx: "mend" };
    return { clip: "lunge", melee: true, reach: 1.9, fx: "bite", impact: 11 };
  }
  if (art === "caster") {
    if (ev.heavy) return { clip: "cast_heavy", ranged: true, shot: "orb", tint: Stage3D.ELEMENT[ev.element] || "#a8ff9c", big: true };
    if (ev.ranged) return { clip: "cast_forward", ranged: true, shot: "bolt", tint: Stage3D.ELEMENT[ev.element] || "#a8ff9c" };
    if (ev.anim === "cast") return { clip: "cast_up", self: true, fx: "mend" };
    return { clip: "cast_forward", ranged: true, shot: "bolt", tint: "#a8ff9c" };
  }
  // Rogues and other swordsmen.
  if (ev.heavy) return { clip: "backstab", melee: true, fx: "drop", tint: "#ff8a3c" };
  if (ev.anim === "cast") return { clip: "throw", ranged: true, shot: "knife" };
  return [{ clip: "stab", melee: true, fx: "thrust" }, { clip: "twin_slash", melee: true, fx: "cross" }, { clip: "low_sweep", melee: true, fx: "sweep" }][hash % 3];
}

// Runs an action up to its moment of impact. The rest of the clip and the way home play on their own.
async function stageAction(stage, ev) {
  const hero = ev.who === "hero";
  const actor = hero ? stage.hero : stage.unitFor("foe", ev.foe);
  const target = hero ? stage.unitFor("foe", ev.foe) : stage.hero;
  if (!actor) return;
  let plan;
  if (hero) {
    const defaults = HERO_DEFAULTS[stage.battle.hero.classKey] || {};
    if (ev.anim === "guard") plan = { clip: "guard", self: true, fx: "guard" };
    else if (ev.anim === "wait") plan = defaults.wait || { clip: "guard", self: true };
    else if (/Зелье/.test(ev.name)) plan = { clip: "potion", self: true, fx: "potion" };
    else if (ev.skillId && getSkillDefinition(ev.skillId)?.anim) plan = SkillSignature.compile(getSkillDefinition(ev.skillId));
    else if (ev.skillId) plan = SKILL_STAGING[ev.skillId] || autoStaging(getSkillDefinition(ev.skillId), stage.battle.hero.classKey) || defaults.attack;
    else if (ev.heavy) plan = defaults.ult;
    else plan = defaults.attack;
  } else {
    plan = ev.stage || stagingForEnemy(actor.foe?.art, ev);
    if (plan?.melee && !plan.move) plan = { ...plan, move: FOE_MOVES[actor.foe?.art] || "dash" };
  }
  plan = plan || { clip: "idle", self: true };
  // The walk home of the last blow must not cut into this one.
  actor.returnToken = (actor.returnToken || 0) + 1;
  const tint = plan.tint || Stage3D.ELEMENT[ev.element] || "#ffffff";
  stage.focusGoal.set(Math.max(-1.3, Math.min(1.3, (actor.root.position.x + (plan.self ? actor.root.position.x : target.root.position.x)) / 2)), 1.05, 0);
  clearTimeout(stage.focusTimer);
  stage.focusTimer = setTimeout(() => stage.focusGoal.set(0, 1.05, 0), 1250 / speedOf());
  stage.lastPlan = plan;
  stage.lastAction = (stage.lastAction || 0) + 1;
  stage.lastActor = actor;
  stage.lastTint = tint;
  const impactFrame = plan.impact ?? Stage3D.IMPACT[plan.clip] ?? 8;
  const impactDelay = impactFrame / Stage3D.FPS;

  if (plan.melee) {
    actor.busy = true;
    const direction = target.root.position.clone().sub(actor.root.position).setY(0).normalize();
    const reach = plan.reach || (target.height < 1.5 ? 1.25 : 1.15);
    let spot = target.root.position.clone().add(direction.clone().multiplyScalar((plan.behind ? 1 : -1) * reach * target.scale));
    if (actor.reachOf) {
      // A painted blow reaches as far as it was drawn: stand exactly so that the tip lands in the target's body.
      const side = plan.behind ? 1 : Math.sign(actor.root.position.x - target.root.position.x) || -1;
      const dir = plan.behind ? -Math.sign(actor.root.position.x - target.root.position.x) || 1 : side;
      const weapon = plan.reachCast ? plan.reach : actor.reachOf(actor.pick(actor.finalPose(plan.clip), "strike"));
      const body = (target.sheet?.poses.idle.w || 200) * (target.pixel || 0.005) * 0.2;
      spot = new THREE.Vector3(target.root.position.x + dir * Math.max(0.55, weapon - body + 0.04), 0, target.root.position.z + 0.28);
    }
    actor.face(target.root.position);
    actor.moveStyle = plan.move || "run";
    if (plan.bump && actor.reachOf) spot.x += 0;
    await travel(stage, actor, spot, plan.move, tint);
    actor.face(target.root.position);
    if (plan.move === "leap") { SFX.play("land"); stage.shock(actor.root.position, "#e8d8b8", 1.5, 0.35); stage.shake(0.18); stage.smoke(actor.root.position.clone(), "#8a7a64", 8, 0.4); }
    const length = actor.play(plan.clip, { fade: 0.05, then: null });
    actor.trails.forEach((trail) => trail.fire(impactDelay + 0.3, tint));
    playSwingSound(plan, ev, Math.max(0, impactDelay - 0.14));
    if (plan.sig?.anticipate) SkillSignature.run(stage, plan.sig.anticipate, actor, target, tint);
    await Stage3D.wait(impactDelay);
    if (plan.sig?.release) SkillSignature.run(stage, plan.sig.release, actor, target, tint);
    returnHome(stage, actor, length - impactDelay);
    return;
  }
  if (plan.lunge) {
    actor.busy = true;
    actor.face(target.root.position);
    const direction = target.root.position.clone().sub(actor.root.position).setY(0).normalize();
    const spot = target.root.position.clone().sub(direction.multiplyScalar(2.2));
    actor.play(plan.clip, { fade: 0.06, then: null });
    actor.moveTo(spot, impactDelay / speedOf());
    await Stage3D.wait(impactDelay);
    returnHome(stage, actor, 0.5);
    return;
  }
  if (plan.hop) await hopAside(stage, actor, plan.hop, tint);
  actor.face(plan.self ? (hero ? new THREE.Vector3(9, 0, actor.root.position.z) : new THREE.Vector3(-9, 0, actor.root.position.z)) : target.root.position);
  actor.play(plan.clip, { fade: 0.08, then: plan.clip === "guard" ? null : "idle" });
  if (plan.ranged) actor.trails.forEach((trail) => trail.fire(impactDelay + 0.2, tint));
  if (plan.big && plan.shot !== "arrow") {
    // A long wind-up should be readable: energy gathers on the caster.
    const chest = actor.chest();
    for (let i = 0; i < 26; i += 1) stage.glow.spawn(chest.x + (Math.random() - 0.5) * 2, chest.y + (Math.random() - 0.5) * 2, chest.z + (Math.random() - 0.5) * 2, 0, 0.5, 0, 0.12, 0.6, new THREE.Color(tint));
  }
  playReleaseSound(plan, ev, impactDelay);
  if (plan.sig?.anticipate) SkillSignature.run(stage, plan.sig.anticipate, actor, target, tint);
  await Stage3D.wait(impactDelay);
  if (plan.sig?.release) SkillSignature.run(stage, plan.sig.release, actor, target, tint);
  if (plan.fx === "aura") StageVFX.aura(stage, actor, tint);
  if (plan.fx === "summon") { StageVFX.runes(stage, actor.root.position, tint, 1.3, 0.9); stage.burst(actor.chest(), tint, 24, 1.8, 0.1, 0.8); }
  if (plan.fx === "shieldwall") { stage.shock(actor.root.position, tint, 1.8); StageVFX.aura(stage, actor, tint); }
  if (plan.vfx === "holyself") StageVFX.beam(stage, actor.root.position, "#ffe9a0", 0.6, 0.55);
  if (plan.rain) {
    SFX.play("dash", { gain: 0.7, rate: [0.8, 0.9] });
    for (let i = 0; i < 6; i += 1) SFX.play("arrow_hit", { gain: 0.5, delay: 0.3 + i * 0.07 });
    stage.battle.foes.filter((foe) => foe.currentHp > 0 || stage.units[`foe${foe.slot}`]?.alive).forEach((foe) => { const unit = stage.units[`foe${foe.slot}`]; if (unit?.alive) StageVFX.arrowRain(stage, unit.root.position, plan.ult ? 20 : 12); });
    await Stage3D.wait(0.25);
  }
  if (plan.direct) {
    // Spells that strike from the sky or the ground: no projectile, the effect appears on the target.
    StageVFX.runes(stage, target.root.position, tint, 1, 0.5);
    await Stage3D.wait(0.08);
  }
  if (plan.fx === "smoke") {
    stage.smoke(actor.root.position.clone(), "#3b3b4d", 34, 0.55);
    stage.shock(actor.root.position, "#8a8aa8", 1.6);
  }
  if (plan.fx === "guard") stage.shock(actor.root.position, "#ffe9a0", 1.5);
  if (plan.fx === "mend") stage.burst(actor.chest(), "#8dff9a", 26, 1.6, 0.13, 0.9);
  if (plan.fx === "potion") stage.burst(actor.chest(), "#ff7a8a", 18, 1.2, 0.1, 0.7);
  if (plan.fx === "howl") { stage.shock(actor.root.position, "#ff9a7a", 3.4, 0.7); stage.shake(0.09); }
  if (plan.ranged) {
    const from = actor.muzzle ? actor.muzzle() : actor.chest();
    if (!actor.muzzle) { from.y += 0.1; from.x += hero ? 0.4 : -0.4; }
    if (plan.shot === "note") {
      StageVFX.soundWaves(stage, from, target.chest(), tint, plan.big ? 4 : 2);
      await Stage3D.wait(0.3);
    } else if (plan.shot === "arrow") {
      const shots = plan.volley || 1;
      for (let i = 0; i < shots - 1; i += 1) { stage.arrow(from, target.chest(), tint === "#ffffff" ? "#fff2c8" : tint, 0.16 / speedOf()); await Stage3D.wait(0.05); }
      await stage.arrow(from, target.chest(), tint === "#ffffff" ? "#fff2c8" : tint, (plan.big ? 0.14 : 0.18) / speedOf());
    } else {
      await stage.projectile(from, target.chest(), tint, (plan.big ? 0.34 : 0.22) / speedOf(), plan.big ? 0.26 : plan.shot === "knife" ? 0.07 : 0.13);
    }
    if (plan.cloud) stage.smoke(target.chest(), "#6f8f3a", 26, 0.55);
  }
}

function speedOf() {
  return Number(App.save.settings.battleSpeed || 1);
}

// Moves a fighter to a spot in the style of the skill.
async function travel(stage, actor, spot, style, tint) {
  const speed = speedOf();
  const start = actor.root.position.clone();
  const distance = start.distanceTo(spot);
  const groundFx = (hex, count) => stage.smoke(new THREE.Vector3(start.x, 0.15, start.z), hex, count, 0.4);
  if (style === "blink") {
    // Gone in a burst of shadow, out of nowhere at the destination.
    const shadow = tint === "#ffffff" ? "#a974ff" : tint;
    stage.smoke(actor.chest(), "#120c1c", 18, 0.5);
    stage.burst(actor.chest(), shadow, 24, 3.2, 0.09, 0.4);
    actor.afterimage(stage, shadow, 0.3);
    actor.root.visible = false;
    SFX.play("blink");
    await Stage3D.wait(0.13);
    actor.root.position.copy(spot);
    actor.root.visible = true;
    stage.smoke(actor.chest(), "#120c1c", 14, 0.4);
    stage.burst(actor.chest(), shadow, 20, 2.6, 0.08, 0.35);
    actor.flash(shadow, 0.8);
    await Stage3D.wait(0.06);
    return;
  }
  if (style === "leap") {
    actor.play(actor.reachOf ? "leap" : "run", { loop: true, fade: 0.05 });
    const height = 1.1 + distance * 0.2;
    const seconds = Math.min(0.5, 0.22 + distance * 0.05) / speed;
    groundFx("#8a7a64", 8);
    SFX.play("swing_heavy", { gain: 0.6, rate: [0.7, 0.85] });
    await new Promise((resolve) => {
      actor.tweens = actor.tweens.filter((tween) => { if (tween.kind !== "move") return true; tween.resolve?.(); return false; });
      actor.tweens.push({ kind: "move", age: 0, duration: seconds, resolve, update: (t) => {
        actor.root.position.lerpVectors(start, spot, t);
        actor.root.position.y = Math.sin(t * Math.PI) * height;
      } });
    });
    actor.root.position.y = 0;
    return;
  }
  if (style === "dash" || style === "charge") {
    const heavy = style === "charge";
    actor.play("run", { loop: true, fade: 0.04 });
    const seconds = (heavy ? Math.min(0.34, 0.12 + distance * 0.04) : Math.min(0.2, 0.07 + distance * 0.022)) / speed;
    const glow = tint === "#ffffff" ? "#ffe0b0" : tint;
    groundFx(heavy ? "#5a4e42" : "#5e564e", heavy ? 7 : 3);
    const copies = heavy ? 3 : 4;
    for (let i = 0; i < copies; i += 1) setTimeout(() => { if (actor.root.visible) { actor.afterimage(stage, glow, 0.26); } }, (seconds * 1000 * i) / copies);
    if (heavy) { stage.shake(0.08); SFX.play("step"); SFX.play("step", { delay: 0.09 }); SFX.play("step", { delay: 0.18 }); }
    SFX.play("dash", { gain: heavy ? 0.6 : 1 });
    await actor.moveTo(spot, seconds, (t) => t * t);
    return;
  }
  actor.play("run", { loop: true, fade: 0.06 });
  SFX.play("step");
  SFX.play("step", { delay: 0.14 });
  await actor.moveTo(spot, Math.min(0.42, 0.1 + distance * 0.055) / speed);
}

// A self skill with footwork: a hop back, or a vanish on the spot.
async function hopAside(stage, actor, style, tint) {
  const away = actor.side === "hero" ? -1 : 1;
  const home = actor.home.clone();
  const spot = home.clone();
  spot.x += away * 0.9;
  spot.z += 0.25;
  actor.busy = true;
  actor.moveStyle = style === "blink" ? "blink" : "leap";
  await travel(stage, actor, spot, actor.moveStyle, tint);
  actor.face(new THREE.Vector3(actor.side === "hero" ? 9 : -9, 0, actor.root.position.z));
  returnHome(stage, actor, 0.55);
}

const BLADE_CLIPS = new Set(["stab", "twin_slash", "low_sweep", "backstab", "sweep", "overhead"]);
const HEAVY_CLIPS = new Set(["overhead", "bash", "backstab", "maul"]);
const FOE_VOICE = { beast: "vo_beast", golem: "vo_big", smith: "vo_big", slime: "vo_slime", wraith: "vo_ghost", shard: "vo_ghost", imp: "vo_monster", caster: "vo_human", rogue: "vo_human", knight: "vo_human" };
// What a fighter is made of decides how a blow sounds.
const FOE_BODY = { golem: "hit_stone", shard: "hit_stone", knight: "hit_metal", smith: "hit_metal", slime: "poison", wraith: "hit_soft" };
const HERO_BODY = { warrior: "hit_metal" };
const STATUS_SOUND = { poison: "poison", burn: "fire", bleed: "blood", frost: "frost", frostbite: "frost", freeze: "frost", shock: "air", corruption: "dark", stun: "hit_heavy", shield: "shield", regeneration: "heal", rage: "cast", haste: "dash", mark: "debuff", silence: "debuff" };
const DOT_SOUND = { poison: "poison", burn: "fire", bleed: "blood", corruption: "dark", frost: "frost", frostbite: "frost", shock: "bolt" };

function playSwingSound(plan, ev, delay) {
  const heavy = HEAVY_CLIPS.has(plan.clip) || ev.heavy;
  SFX.play(heavy ? "swing_heavy" : "swing", { delay });
}

function playReleaseSound(plan, ev, delay) {
  if (plan.shot === "arrow") { SFX.play("bow", { gain: 0.8 }); SFX.play("swing", { delay, gain: 0.9, rate: [1.2, 1.45] }); return; }
  if (plan.shot === "note") { SFX.play("lute", { delay }); if (plan.big) SFX.play("lute", { delay: delay + 0.1, rate: [1.2, 1.3] }); return; }
  if (plan.shot === "knife" || plan.shot === "flask") { SFX.play("swing", { delay, rate: [1.15, 1.35] }); return; }
  if (plan.shot) { SFX.play("cast", { gain: 0.7 }); SFX.play("bolt", { delay }); return; }
  if (plan.clip === "song" || plan.clip === "strum") { SFX.play("lute"); SFX.play("lute", { delay: 0.14 }); return; }
  if (plan.clip === "warcry" || plan.clip === "shout") { SFX.play("vo_human", { gain: 0.8, rate: [0.8, 0.95] }); return; }
  if (plan.clip === "potion") { SFX.play("potion"); return; }
  if (plan.clip === "guard") { SFX.play("guard"); return; }
  if (plan.fx === "smoke") { SFX.play("blink", { gain: 0.8, rate: [0.7, 0.85] }); return; }
  if (/cast/.test(plan.clip || "")) SFX.play("cast");
}

// The sound of a blow landing: what hit, what it hit, and how hard.
function playImpactSound(stage, ev) {
  const plan = stage.lastPlan || {};
  const victim = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
  const body = ev.target === "hero" ? HERO_BODY[stage.battle.hero.classKey] || "hit_flesh" : FOE_BODY[victim?.foe?.art] || "hit_flesh";
  const elemental = ev.kind === "magic" || plan.direct || (plan.shot && plan.shot !== "arrow" && plan.shot !== "knife");
  if (elemental) {
    SFX.play(STAGE_ELEMENT_SOUND[ev.element] || "bolt");
    SFX.play(body, { gain: 0.55 });
  } else {
    SFX.play(body);
    if (plan.shot === "arrow" || plan.shot === "knife") SFX.play("arrow_hit");
    else if (BLADE_CLIPS.has(plan.clip)) SFX.play("hit_blade", { gain: ev.heavy ? 1 : 0.75 });
  }
  if (ev.heavy) SFX.play("heavy");
  else if (ev.crit) SFX.play("crit", { gain: 0.85 });
  if (ev.guarded) SFX.play("guard");
  // Now and then the hurt one cries out.
  const voice = ev.target === "hero" ? "vo_human" : FOE_VOICE[victim?.foe?.art];
  if (voice && Math.random() < (ev.crit || ev.heavy ? 0.5 : 0.16)) SFX.play(voice, { delay: 0.05, gain: 0.7, rate: [1.02, 1.18] });
}
const STAGE_ELEMENT_SOUND = { fire: "fire", frost: "frost", water: "water", earth: "earth", air: "air", holy: "holy", dark: "dark", arcane: "bolt", poison: "poison", blood: "blood" };

function returnHome(stage, actor, delay) {
  const token = (actor.returnToken = (actor.returnToken || 0) + 1);
  setTimeout(async () => {
    if (actor.returnToken !== token || !actor.alive || stage !== Stage3D.current) return;
    const far = actor.root.position.distanceTo(actor.home) > 0.25;
    if (far) {
      actor.face(actor.home, 0.08);
      await travel(stage, actor, actor.home.clone(), actor.moveStyle, stage.lastTint || "#ffffff");
      if (actor.returnToken !== token) return;
    }
    actor.busy = false;
    actor.face(new THREE.Vector3(actor.side === "hero" ? 9 : -9, 0, actor.root.position.z), 0.16);
    actor.play("idle", { loop: true, fade: 0.16 });
  }, Math.max(0, delay) * 1000 / speedOf());
}

// Plays the blow landing: the effect depends on the attack that caused it.
function stageImpact(stage, ev) {
  const victim = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
  if (!victim) return;
  const plan = stage.lastPlan || {};
  const tint = stage.lastTint && stage.lastTint !== "#ffffff" ? stage.lastTint : Stage3D.ELEMENT[ev.element] || "#ffe2b0";
  const chest = victim.chest();
  const facing = ev.target === "hero" ? -1 : 1;
  const heavy = ev.crit || ev.heavy;
  victim.flash(ev.target === "hero" ? "#ff6a5a" : "#ffffff", heavy ? 0.7 : 0.4);
  // A skill with its own staging answers with its own shapes instead of the common slash and spark.
  if (plan.sig) {
    const key = `${stage.lastAction}:${victim.slot}`;
    if (stage.sigDone !== key) {
      stage.sigDone = key;
      SkillSignature.run(stage, plan.sig.impact, stage.lastActor, victim, tint);
      SkillSignature.react(victim, plan.sig.reaction, ev.target === "hero" ? -1 : 1);
      const weight = SkillSignature.WEIGHTS[plan.sig.weight] || SkillSignature.WEIGHTS.mid;
      stage.shake(weight.shake);
      stage.pause(weight.pause);
      if (plan.sig.weight === "heavy") { stage.screenFlash(0.03); stage.zoomGoal = 1.1; setTimeout(() => { if (stage.zoomGoal === 1.1) stage.zoomGoal = 0; }, 340); }
    }
    if (victim.alive && !victim.busy) victim.play(heavy ? "heavy_hit" : "hit", { fade: 0.03 });
    stage.burst(chest, tint, heavy ? 22 : 10, 2.6, 0.08, 0.35);
    return;
  }
  if (victim.alive && !victim.busy) {
    victim.play(heavy ? "heavy_hit" : "hit", { fade: 0.03 });
  }
  if (ev.kind === "magic" || plan.ranged) {
    stage.burst(chest, tint, heavy ? 44 : 26, heavy ? 4.4 : 3, 0.14, 0.6);
  } else {
    stage.slash(chest, tint, facing, heavy || plan.fx === "drop");
    if (plan.fx === "cross") stage.slash(chest, tint, facing, false);
    stage.burst(chest, ev.element === "blood" || plan.fx === "bite" ? "#ff2f46" : "#ffe6b0", heavy ? 34 : 16, heavy ? 4.2 : 2.8, 0.09, 0.45);
  }
  if (plan.fx === "drop" || heavy) stage.shock(victim.root.position, tint, heavy ? 2.6 : 1.8);
  // In a flurry every further hit lands on another painted blow.
  const striker = ev.target === "hero" ? stage.unitFor("foe", ev.foe) : stage.hero;
  if (striker?.nextBlow && plan.melee) {
    if (stage.flurryAction === stage.lastAction) striker.nextBlow();
    stage.flurryAction = stage.lastAction;
  }
  const vfxKey = plan.vfx === undefined ? (ev.kind === "magic" ? ev.element : null) : plan.vfx;
  const recipe = StageVFX.ELEMENT_RECIPE[vfxKey];
  if (recipe && stage.lastVfxActor !== stage.lastAction + ":" + victim.slot) {
    stage.lastVfxActor = stage.lastAction + ":" + victim.slot;
    const spot = victim.chest();
    spot.x = victim.root.position.x;
    spot.z = victim.root.position.z;
    recipe(stage, spot);
  }
  if (plan.ult) { stage.shake(0.3); stage.screenFlash(0.05); }
  stage.light(chest, tint, heavy ? 16 : 7, 0.2);
  stage.pause(heavy ? 0.11 : 0.045);
  stage.shake(ev.heavy ? 0.3 : ev.crit ? 0.2 : 0.06);
  if (heavy) {
    stage.screenFlash(0.035);
    stage.zoomGoal = 1.1;
    setTimeout(() => { if (stage.zoomGoal === 1.1) stage.zoomGoal = 0; }, 340);
  }
}

// Replaces the 2D effects for events that have a 3D version. Floating numbers and sounds stay in the HTML layer.
async function stagePlayEvent(stage, ev, color) {
  switch (ev.type) {
    case "action":
      showActionName(ev.name, ev.heavy);
      if (ev.anim === "guard") { SFX.play("guard"); floater("hero", "Стойка", "buff"); }
      if (ev.who !== "hero") {
        const art = stage.unitFor("foe", ev.foe)?.foe?.art;
        if (FOE_VOICE[art] && Math.random() < (ev.heavy ? 0.9 : FOE_VOICE[art] === "vo_human" ? 0.2 : 0.55)) SFX.play(FOE_VOICE[art], { gain: 0.8 });
      }
      await stageAction(stage, ev);
      return true;
    case "hit": {
      playImpactSound(stage, ev);
      stageImpact(stage, ev);
      const absorbed = ev.absorbed ? `(щит ${ev.absorbed})` : "";
      if (ev.amount > 0 || !ev.absorbed) floater(ev.target, `${ev.amount}${ev.crit ? "!" : ""}`, ev.crit ? "crit" : ev.target === "hero" ? "hurt" : "damage");
      else floater(ev.target, absorbed, "shield");
      if (ev.guarded) floater(ev.target, "Блок", "buff");
      await delayMs(ev.crit || ev.heavy ? 380 : 240);
      return true;
    }
    case "miss": {
      SFX.play("miss");
      { const dodger = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe); if (dodger?.alive && dodger.reachOf && !dodger.busy) dodger.play("dodge"); }
      floater(ev.target, "Мимо", "miss");
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      if (unit && unit.alive && !unit.busy) {
        const side = unit.home.clone();
        side.z += 0.55;
        side.x += ev.target === "hero" ? -0.25 : 0.25;
        unit.moveTo(side, 0.1).then(() => unit.moveTo(unit.home.clone(), 0.22));
      }
      await delayMs(240);
      return true;
    }
    case "heal": {
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      SFX.play("heal");
      if (unit) { stage.burst(unit.chest(), "#8dff9a", 16, 1.5, 0.11, 0.85); unit.flash("#8dff9a", 0.4); }
      floater(ev.target, `+${ev.amount}`, "heal");
      await delayMs(200);
      return true;
    }
    case "mana": {
      const unit = stage.hero;
      stage.burst(unit.chest(), "#7fb8ff", 10, 1.2, 0.08, 0.7);
      floater(ev.target, `+${ev.amount}`, "mana");
      await delayMs(160);
      return true;
    }
    case "effect": {
      const def = STATUS_EFFECT_DEFINITIONS[ev.id] || {};
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      const hex = STATUS_COLORS[ev.id] || "#ffffff";
      if (unit) {
        stage.shock(unit.root.position, hex, 1.2, 0.35);
        stage.burst(unit.chest(), hex, 14, 1.8, 0.1, 0.6);
      }
      SFX.play(STATUS_SOUND[ev.id] || (def.tone === "good" ? "heal" : "debuff"), { gain: 0.8 });
      statusCallout(ev.target, ev.id, def, hex);
      await delayMs(340);
      return true;
    }
    case "tick": {
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      const hex = STATUS_COLORS[ev.id] || "#ffffff";
      if (unit) {
        stage.burst(unit.chest(), hex, 12, 1.7, 0.1, 0.55);
        unit.flash(hex, 0.5);
        if (unit.alive && !unit.busy) unit.play("hit", { fade: 0.05 });
      }
      SFX.play(DOT_SOUND[ev.id] || "debuff", { gain: 0.7 });
      floater(ev.target, `${STATUS_EFFECT_DEFINITIONS[ev.id]?.name || ""} −${ev.amount}`, `dot-${ev.id}`);
      await delayMs(220);
      return true;
    }
    case "detonate": {
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      SFX.play("crit");
      SFX.play("fire");
      if (unit) {
        stage.burst(unit.chest(), "#ff8a3c", 70, 6, 0.2, 0.8);
        stage.shock(unit.root.position, "#ffd27a", 4, 0.6);
        stage.light(unit.chest(), "#ff8a3c", 26, 0.4);
      }
      stage.shake(0.35);
      stage.screenFlash(0.06);
      floater(ev.target, `${ev.amount}!`, "crit");
      await delayMs(420);
      return true;
    }
    case "summonHit": {
      const unit = stage.unitFor("foe", ev.foe);
      SFX.play("hit");
      if (unit) stage.burst(unit.chest(), "#a974ff", 14, 2.4, 0.1, 0.45);
      floater("enemy", `${ev.amount}`, "damage");
      await delayMs(200);
      return true;
    }
    case "interrupt": {
      const unit = stage.unitFor("foe", ev.foe);
      if (unit) { unit.play("heavy_hit", { fade: 0.03 }); stage.shock(unit.root.position, "#ffd27a", 2.6); stage.burst(unit.chest(), "#ffe6b0", 30, 3.6, 0.12, 0.55); }
      floater("enemy", "Сорвано!", "crit");
      showActionName(`«${ev.name}» сорван`);
      SFX.play("crit");
      stage.shake(0.2);
      await delayMs(360);
      return true;
    }
    case "stunned": {
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      if (unit && unit.alive) unit.play("stun", { fade: 0.1, then: "idle" });
      floater(ev.target, "Оглушён", "debuff");
      await delayMs(320);
      return true;
    }
    case "phase": {
      const unit = stage.unitFor("foe", ev.foe);
      SFX.play("heavy");
      stage.shake(0.35);
      if (unit) { stage.burst(unit.chest(), "#ffb35c", 70, 5, 0.18, 0.9); stage.shock(unit.root.position, "#ffb35c", 4.4, 0.7); }
      showActionName(ev.text, true);
      await delayMs(820);
      return true;
    }
    case "foeJoin": {
      const foe = App.battle.foes[ev.foe];
      const unit = stage.addFoe(foe);
      renderFoeStage();
      renderAllIntents();
      markTarget();
      stage.placeFoes(false);
      unit.root.position.set(unit.home.x + 2.4, 0, unit.home.z - 1);
      unit.face(stage.hero.root.position, 0.01);
      unit.play("run", { loop: true });
      unit.moveTo(unit.home.clone(), 0.5).then(() => { unit.face(new THREE.Vector3(-9, 0, unit.root.position.z), 0.12); unit.play("idle", { loop: true, fade: 0.15 }); });
      SFX.play("heavy");
      showActionName(`${ev.name} вступает в бой`);
      await delayMs(460);
      return true;
    }
    case "death": {
      const unit = ev.target === "hero" ? stage.hero : stage.unitFor("foe", ev.foe);
      SFX.play("death");
      if (ev.target !== "hero" && FOE_VOICE[unit?.foe?.art] && FOE_VOICE[unit.foe.art] !== "vo_human") SFX.play(FOE_VOICE[unit.foe.art], { gain: 0.8, rate: [0.72, 0.85] });
      if (ev.target === "enemy" && App.battle.foes[ev.foe]) {
        App.battle.foes[ev.foe].deadShown = true;
        renderIntent(null, App.battle.foes[ev.foe]);
        fighterEl("enemy")?.classList.add("dead");
      }
      if (unit) {
        unit.alive = false;
        unit.returnToken = (unit.returnToken || 0) + 1;
        unit.status = [];
        unit.setGhost(0);
        unit.play("death", { fade: 0.05, then: null });
        stage.burst(unit.chest(), "#ffe2b0", 22, 2.6, 0.1, 0.7);
        if (ev.target === "enemy") {
          setTimeout(() => {
            if (stage !== Stage3D.current) return;
            stage.placeFoes(false);
            stage.smoke(unit.root.position.clone(), "#555560", 16, 0.5);
            unit.setGhost(1);
            setTimeout(() => { unit.root.visible = false; }, 700);
          }, 1300 / speedOf());
        }
      }
      stage.focusGoal.set(0, 1.05, 0);
      await delayMs(560);
      return true;
    }
    case "end":
      if (ev.winner === "hero" && stage.hero.alive) {
        stage.hero.returnToken = (stage.hero.returnToken || 0) + 1;
        const home = stage.hero.home.clone();
        stage.hero.face(new THREE.Vector3(9, 0, home.z), 0.2);
        stage.hero.moveTo(home, 0.4);
        stage.hero.play("victory", { fade: 0.2, then: null });
      }
      return false;
    default:
      return false;
  }
}

const STATUS_COLORS = { burn: "#ff8a3c", frost: "#9fe4ff", frostbite: "#9fe4ff", freeze: "#d8f6ff", stagger: "#c49a5c", corruption: "#a974ff", poison: "#9be34f", bleed: "#ff4d5e", shield: "#ffe9a0", regeneration: "#8dff9a", weaken: "#b88cff", mark: "#ffd25a", armor_break: "#c8c0b0", rage: "#ff5a3c", haste: "#d8fff0", slow: "#b8c4d8", blind: "#e8e2b0", wound: "#ff8a8a", shock: "#fff27a", exposed: "#ffb06a", soaked: "#6fb8ff", evasion: "#c8d0e0", fortify: "#d8c8a0", thorns: "#c49a5c", stun: "#ffe27a", silence: "#c8c8d8" };
