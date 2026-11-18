// Signature animations: every skill describes its own staging as data (skill.anim).
// anticipation -> movement -> release -> impact -> reaction, each with its own shapes, so no two skills read alike.
const SkillSignature = (() => {
  const T = window.THREE;
  const later = (seconds, run) => setTimeout(run, (seconds * 1000) / Number(App.save.settings.battleSpeed || 1));
  const v3 = (p, y = null) => new T.Vector3(p.x, y === null ? p.y : y, p.z);

  const SHAPES = {
    slash: (stage, c) => { c.units.forEach((u) => stage.slash(u.chest(), c.color, c.facing, c.size > 1)); },
    cross: (stage, c) => { c.units.forEach((u) => { stage.slash(u.chest(), c.color, c.facing, true); later(0.07, () => stage.slash(u.chest(), c.color, -c.facing, true)); }); },
    ring: (stage, c) => { c.units.forEach((u) => { for (let i = 0; i < c.n; i += 1) later(i * 0.09, () => stage.shock(u.root.position, c.color, 1.5 * c.size + i * 0.8, 0.5)); }); },
    pillar: (stage, c) => { c.units.forEach((u) => StageVFX.beam(stage, u.root.position, c.color, 0.55 * c.size, 0.65)); },
    spikes: (stage, c) => { c.units.forEach((u) => { StageVFX.spikes(stage, u.root.position, c.color, c.n + 5, 1.5 * c.size, 0.95); stage.debris(u.root.position.clone().setY(0.3), "#5a4a3c", 4 + c.n * 2, 2.6); stage.decal(u.root.position, "crack", "#140e0a", 0.9 * c.size, 1.8); }); },
    lightning: (stage, c) => { c.units.forEach((u) => { for (let i = 0; i < c.n; i += 1) later(i * 0.08, () => StageVFX.lightning(stage, u.chest(), c.color)); }); },
    flames: (stage, c) => { c.units.forEach((u) => { StageVFX.flames(stage, u.root.position, 46, 0.42 * c.size, 1.1 * c.size); stage.decal(u.root.position, "scorch", "#120806", 1.1 * c.size, 2.4); stage.sparks(u.chest(), "#ff9a3c", 10, 3.5); }); },
    sigil: (stage, c) => { c.units.forEach((u) => StageVFX.runes(stage, u.root.position, c.color, 1.2 * c.size, 0.8)); },
    whirl: (stage, c) => { c.units.forEach((u) => StageVFX.whirl(stage, u.chest(), c.color, 40, 0.7 * c.size)); },
    void: (stage, c) => { c.units.forEach((u) => StageVFX.voidPull(stage, u.chest(), c.color)); },
    rain: (stage, c) => { c.units.forEach((u) => StageVFX.arrowRain(stage, u.root.position, 8 + c.n * 3)); },
    smoke: (stage, c) => { c.units.forEach((u) => stage.smoke(u.chest(), c.color, 22 + c.n * 4, 0.6 * c.size)); },
    burst: (stage, c) => { c.units.forEach((u) => { stage.burst(u.chest(), c.color, 18 + c.n * 4, 3.4 * c.size, 0.12, 0.6); stage.sparks(u.chest(), c.color, 8 + c.n * 3, 4.5 * c.size); }); },
    glow: (stage, c) => { c.units.forEach((u) => { const p = u.chest(); const col = new T.Color(c.color); for (let i = 0; i < 28; i += 1) stage.glow.spawn(p.x + (Math.random() - 0.5) * 2 * c.size, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2, 0, 0.6, 0, 0.12, 0.7, col); }); },
    flash: (stage, c) => { stage.screenFlash(0.04 * c.size); stage.light(c.units[0].chest(), c.color, 26 * c.size, 0.25); },
    // A note ring travels from the singer to every target.
    notes: (stage, c) => { c.units.forEach((u) => StageVFX.soundWaves(stage, c.actor.chest(), u.chest(), c.color, c.n + 1)); },
    // A line of blows runs along the ground from the actor to the target.
    quake: (stage, c) => {
      c.units.forEach((u) => {
        const from = c.actor.root.position;
        const to = u.root.position;
        for (let i = 1; i <= c.n + 2; i += 1) {
          const t = i / (c.n + 2);
          later(t * 0.3, () => {
            const spot = v3(new T.Vector3().lerpVectors(from, to, t), 0);
            StageVFX.spikes(stage, spot, c.color, 4, 0.9 * c.size, 0.5);
            stage.shock(spot, c.color, 0.9, 0.3);
            stage.decal(spot, "crack", "#140e0a", 0.7 * c.size, 1.6);
            stage.debris(v3(spot, 0.2), "#5a4a3c", 4, 2.4);
          });
        }
        later(0.3, () => stage.shake(0.14));
      });
    },
    // Lightning leaps from one target to the next.
    chain: (stage, c) => { c.foes.forEach((u, i) => later(i * 0.13, () => { StageVFX.lightning(stage, u.chest(), c.color); stage.burst(u.chest(), c.color, 14, 2.6, 0.08, 0.35); })); },
    // Several small projectiles spread out and converge on the target.
    fan: (stage, c) => {
      c.units.forEach((u) => {
        for (let i = 0; i < c.n + 2; i += 1) {
          later(i * 0.05, () => {
            const from = c.actor.chest();
            from.y += (i - (c.n + 1) / 2) * 0.32;
            from.z += (i % 2 ? 1 : -1) * 0.25;
            stage.projectile(from, u.chest(), c.color, 0.2, 0.08);
          });
        }
      });
    },
    shards: (stage, c) => { c.units.forEach((u) => { StageVFX.spikes(stage, u.root.position, c.color, 5, 0.9 * c.size, 0.6); stage.burst(u.chest(), c.color, 20, 4.2, 0.08, 0.5, 1); stage.debris(u.chest(), new THREE.Color(c.color).multiplyScalar(0.55).getStyle(), 7, 3); stage.sparks(u.chest(), c.color, 8, 5); }); },
    // Copies of the actor flicker around the target.
    afterimages: (stage, c) => { for (let i = 0; i < c.n + 2; i += 1) later(i * 0.06, () => c.actor.afterimage?.(stage, c.color, 0.35)); },
    // Class handwriting (see StageVFX): each one is a picture of what the skill does, not only a colour.
    bladestorm: (stage, c) => { c.units.forEach((u) => StageVFX.bladestorm(stage, u, c.color, 3 + c.n, c.size)); },
    crescent: (stage, c) => { c.units.forEach((u) => StageVFX.crescent(stage, c.actor.root.position, u.root.position, c.color, Math.max(0.8, c.size))); },
    dome: (stage, c) => { c.units.forEach((u) => StageVFX.dome(stage, u, c.color, Math.max(0.8, c.size))); },
    roar: (stage, c) => { c.units.forEach((u) => StageVFX.roar(stage, u, c.color, Math.max(0.7, c.size))); },
    staff: (stage, c) => { c.units.forEach((u) => StageVFX.staff(stage, c.actor.chest(), u.chest(), c.color, Math.max(0.8, c.size))); },
    chord: (stage, c) => { c.units.forEach((u) => StageVFX.chord(stage, u, c.color, Math.max(0.7, c.size))); },
    clones: (stage, c) => { c.units.filter((u) => u !== c.actor).forEach((u) => StageVFX.clones(stage, c.actor, u, c.color, 2 + c.n)); },
    bloodburst: (stage, c) => { c.units.forEach((u) => StageVFX.bloodburst(stage, u, c.color, c.facing, Math.max(0.7, c.size))); },
    aimline: (stage, c) => { c.units.forEach((u) => StageVFX.aimline(stage, c.actor.muzzle ? c.actor.muzzle() : c.actor.chest(), u.chest(), c.color)); },
    pierce: (stage, c) => { c.units.forEach((u) => StageVFX.pierce(stage, c.actor.chest(), u.chest(), c.color, Math.max(0.8, c.size))); },
    chains: (stage, c) => { c.units.forEach((u) => StageVFX.chains(stage, u, c.color, Math.max(0.8, c.size))); },
    meteor: (stage, c) => { c.units.forEach((u) => StageVFX.meteor(stage, u, c.color, Math.max(0.8, c.size))); },
    frostnova: (stage, c) => { c.units.forEach((u) => StageVFX.frostnova(stage, u, c.color, Math.max(0.7, c.size))); },
    venom: (stage, c) => { c.units.forEach((u) => StageVFX.venom(stage, u, c.color, Math.max(0.7, c.size))); },
    hammer: (stage, c) => { c.units.forEach((u) => StageVFX.hammer(stage, u, c.color, Math.max(0.8, c.size))); },
    // A wave rolls from the actor through the target.
    wave: (stage, c) => {
      c.units.forEach((u) => {
        for (let i = 1; i <= 5; i += 1) later(i * 0.05, () => {
          const spot = new T.Vector3().lerpVectors(c.actor.chest(), u.chest(), i / 5);
          stage.shock(v3(spot, 0.1), c.color, 0.8 + i * 0.25 * c.size, 0.3);
          stage.burst(spot, c.color, 10, 2, 0.08, 0.3);
        });
      });
    }
  };

  // The heavy pictures play once, when the skill is released; on each landing blow only a small trace follows.
  const ONCE = new Set(["bladestorm", "crescent", "dome", "roar", "staff", "chord", "clones", "aimline", "chains", "meteor", "frostnova", "venom", "hammer", "quake", "rain", "wave", "notes", "pillar", "flames", "spikes", "lightning", "chain"]);
  // These belong to the moment of contact, not to the release.
  const ON_CONTACT = new Set(["pierce", "bloodburst"]);
  // These always happen on the fighter who acts: a dome guards, a cry and a chord sound from the one who makes them.
  const ON_SELF = new Set(["dome", "roar", "chord"]);
  const place = (prim) => (ON_SELF.has(prim.fx) ? { ...prim, at: "self" } : prim);

  // The class handwriting table (handwriting.js) swaps the skill's main picture, adds an accent and sets the colour.
  function handwrite(anim, id) {
    const hand = typeof SKILL_HANDWRITING !== "undefined" ? SKILL_HANDWRITING[id] : null;
    if (!hand || !hand.image) return anim;
    const main = (anim.release || [])[0] || { at: anim.range === "self" ? "self" : "target", size: 0.8 };
    const hit = (anim.impact || [])[0] || { at: main.at, size: (main.size || 0.8) * 0.45, delay: 0.06 };
    const color = hand.tint || main.color || anim.tint;
    const keep = (list) => (list || []).slice(1);
    const release = ON_CONTACT.has(hand.image) ? [] : [{ ...main, fx: hand.image, color }];
    const impact = [];
    if (ON_CONTACT.has(hand.image)) impact.push({ ...hit, fx: hand.image, color, size: main.size || 0.8 });
    else if (!ONCE.has(hand.image)) impact.push({ ...hit, fx: hand.image, color });
    if (hand.accent && hand.accent !== hand.image) {
      const accent = { ...hit, fx: hand.accent, color, size: (hit.size || 0.4) * 1.2 };
      if (ONCE.has(hand.accent)) release.push({ ...accent, delay: 0.1 }); else impact.push(accent);
    }
    return { ...anim, tint: hand.tint || anim.tint, release: [...release.map(place), ...keep(anim.release)], impact: [...impact.map(place), ...keep(anim.impact)], anticipate: (anim.anticipate || []).map((p) => ({ ...p, color: hand.tint || p.color })) };
  }

  function compile(skill) {
    const anim = handwrite(skill.anim, skill.id);
    const clip = `sig_${skill.id}`;
    if (anim.pose && !StageSprites.ACTIONS[clip]) StageSprites.ACTIONS[clip] = anim.pose;
    const plan = { clip: anim.pose ? clip : anim.clip || "cast_up", impact: anim.frame ?? 7, tint: anim.tint, sig: anim, reachCast: false };
    if (anim.range === "melee") { plan.melee = true; plan.move = anim.move || "dash"; plan.fx = "sig"; if (anim.reach) plan.reach = anim.reach; }
    else if (anim.range === "ranged") {
      plan.ranged = anim.shot !== "none";
      plan.direct = anim.shot === "none";
      plan.shot = anim.shot || "bolt";
      plan.big = anim.weight === "heavy";
      plan.volley = anim.volley || 1;
    } else plan.self = true;
    if (anim.hop) plan.hop = anim.hop;
    plan.vfx = null;
    return plan;
  }

  function context(stage, prim, actor, target, tint) {
    const foes = stage.battle.foes.map((foe) => stage.units[`foe${foe.slot}`]).filter((unit) => unit?.alive);
    const all = prim.at === "allFoes";
    const units = prim.at === "self" ? [actor] : all ? foes : [target];
    return { units: units.length ? units : [target], foes: foes.length ? foes : [target], actor, target, color: prim.color || tint, n: Number(prim.n || 1), size: Number(prim.size || 1), facing: actor.side === "hero" ? 1 : -1 };
  }

  function run(stage, list, actor, target, tint) {
    (list || []).forEach((prim) => {
      const shape = SHAPES[prim.fx];
      if (!shape) return;
      const go = () => { if (target.root) shape(stage, context(stage, prim, actor, target, tint)); };
      if (prim.delay) later(prim.delay, go);
      else go();
    });
  }

  // How the body of the target answers the blow.
  const REACTIONS = {
    knockback: (x, t, side) => { x.position.x += side * Math.sin(t * Math.PI) * 0.55; },
    launch: (x, t) => { x.position.y = Math.sin(t * Math.PI) * 1.1; },
    stagger: (x, t, side) => { x.position.x += side * Math.sin(t * Math.PI * 4) * 0.12; },
    pull: (x, t, side) => { x.position.x -= side * Math.sin(t * Math.PI) * 0.6; },
    slam: (x, t) => { x.position.y = t < 0.3 ? (t / 0.3) * 0.6 : Math.max(0, 0.6 * (1 - (t - 0.3) / 0.25)); }
  };

  function react(victim, kind, side) {
    const shape = REACTIONS[kind];
    if (!shape || !victim?.alive || !victim.tweens) return;
    const home = victim.root.position.clone();
    const token = victim.returnToken;
    const moved = () => victim.returnToken !== token || victim.tweens.some((tween) => tween.kind === "move");
    victim.tweens.push({ kind: "react", age: 0, duration: 0.42 / Number(App.save.settings.battleSpeed || 1), resolve: () => { if (!moved()) victim.root.position.copy(home); }, update: (t) => {
      if (moved()) return;
      victim.root.position.copy(home);
      shape(victim.root, t, side);
    } });
  }

  const WEIGHTS = { light: { shake: 0.05, pause: 0.03 }, mid: { shake: 0.12, pause: 0.06 }, heavy: { shake: 0.3, pause: 0.11 } };

  return { compile, run, react, WEIGHTS, SHAPES };
})();
