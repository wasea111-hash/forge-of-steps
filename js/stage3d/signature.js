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
    spikes: (stage, c) => { c.units.forEach((u) => StageVFX.spikes(stage, u.root.position, c.color, c.n + 5, 1.5 * c.size, 0.95)); },
    lightning: (stage, c) => { c.units.forEach((u) => { for (let i = 0; i < c.n; i += 1) later(i * 0.08, () => StageVFX.lightning(stage, u.chest(), c.color)); }); },
    flames: (stage, c) => { c.units.forEach((u) => StageVFX.flames(stage, u.root.position, 46, 0.42 * c.size, 1.1 * c.size)); },
    sigil: (stage, c) => { c.units.forEach((u) => StageVFX.runes(stage, u.root.position, c.color, 1.2 * c.size, 0.8)); },
    whirl: (stage, c) => { c.units.forEach((u) => StageVFX.whirl(stage, u.chest(), c.color, 40, 0.7 * c.size)); },
    void: (stage, c) => { c.units.forEach((u) => StageVFX.voidPull(stage, u.chest(), c.color)); },
    rain: (stage, c) => { c.units.forEach((u) => StageVFX.arrowRain(stage, u.root.position, 8 + c.n * 3)); },
    smoke: (stage, c) => { c.units.forEach((u) => stage.smoke(u.chest(), c.color, 22 + c.n * 4, 0.6 * c.size)); },
    burst: (stage, c) => { c.units.forEach((u) => stage.burst(u.chest(), c.color, 26 + c.n * 6, 3.4 * c.size, 0.12, 0.6)); },
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
    shards: (stage, c) => { c.units.forEach((u) => { StageVFX.spikes(stage, u.root.position, c.color, 5, 0.9 * c.size, 0.6); stage.burst(u.chest(), c.color, 34, 4.2, 0.08, 0.5); }); },
    // Copies of the actor flicker around the target.
    afterimages: (stage, c) => { for (let i = 0; i < c.n + 2; i += 1) later(i * 0.06, () => c.actor.afterimage?.(stage, c.color, 0.35)); },
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

  function compile(skill) {
    const anim = skill.anim;
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
