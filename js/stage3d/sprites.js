// Painted fighters on the stage: each one is a set of hand-painted key poses, like a comic panel that snaps from pose to pose.
// A SpriteUnit answers the same calls as the 3D Unit, so the choreography does not care which one it drives.
const StageSprites = (() => {
  const T = window.THREE;
  const INDEX = window.FORGE_SPRITES || {};
  const cache = {};
  const loader = new T.TextureLoader();
  const geometry = new T.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);

  // World height of a fighter's calm pose. Everything not listed is human sized.
  const HEIGHT = { lair_she_wolf: 2.6, lair_viper_mother: 3.5, lair_ash_seneschal: 3.8, lair_executioner: 3.7, lair_first_scribe: 3.6, lair_widow: 3.8, lair_rift_heart: 3.4, lair_forge_titan: 3.9, wolf: 1.4, boar: 1.3, greyfang: 1.8, scorched_hound: 1.3, star_eater: 1.9, slime: 1.2, ash_slime: 1.25, ember_imp: 1.35, rune_guard: 2.45, stone_golem: 2.6, archivist: 2.8, smith: 2.75, pyre_queen: 2.45, cinder_knight: 2.25, limit_shard: 1.9, brazier: 1.7, page_swarm: 2, anvil_spirit: 2, void_stalker: 2.3 };
  const FLOATING = new Set(["lair_widow", "lair_rift_heart", "wraith", "void_stalker", "limit_shard", "brazier", "page_swarm"]);
  // What each action is made of: the pose it starts from, the pose it snaps to, and how the body moves.
  const ACTIONS = {
    stab: { before: "windup", pose: "thrust", fallback: "strike", lunge: 0.3 },
    twin_slash: { before: "windup", pose: "strike", then2: "thrust", tail: 0.56 },
    low_sweep: { before: "guard", pose: "slam", fallback: "strike", lunge: 0.26, stretch: 0.03 },
    backstab: { before: "air", pose: "slam", fallback: "strike", back: 0, lean: 0.02, lunge: 0.12, drop: true, tail: 0.55 },
    overhead: { before: "windup", pose: "slam", fallback: "strike", back: -0.22, lean: -0.08, coil: 0.07, lunge: 0.2, drop: true, tail: 0.6 },
    sweep: { before: "windup", pose: "strike", lunge: 0.26 },
    bash: { before: "guard", pose: "strike", back: -0.26, lunge: 0.42, hold: 0.06 },
    staff_swing: { before: "windup", pose: "strike", lunge: 0.2 },
    kick: { before: "dash", pose: "strike", lunge: 0.3 },
    lunge: { before: "windup", pose: "thrust", fallback: "strike", lunge: 0.34 },
    bite: { before: "windup", pose: "strike", lunge: 0.34 },
    pounce: { before: "air", pose: "slam", fallback: "strike", back: 0, lunge: 0.14, drop: true },
    maul: { before: "windup", pose: "slam", fallback: "strike", drop: true },
    throw: { before: "windup", pose: "cast", back: -0.14, lunge: 0.16 },
    cast_forward: { before: "windup", pose: "thrust", fallback: "cast", lunge: 0.1, back: -0.06 },
    cast_up: { before: "windup", pose: "proud", fallback: "cast", lunge: 0, back: -0.03, tail: 0.6 },
    cast_heavy: { before: "windup", pose: "slam", fallback: "cast", back: -0.12, lunge: 0.14, drop: true, tail: 0.65 },
    bow_shot: { before: "thrust", pose: "slam", fallback: "cast", back: 0, lunge: -0.14, stretch: 0, tail: 0.5 },
    bow_rapid: { before: "cast", pose: "slam", fallback: "cast", back: 0, lunge: -0.1, stretch: 0, tail: 0.32 },
    bow_rain: { before: "windup", pose: "windup", fallback: "cast", back: -0.03, lunge: -0.06, stretch: 0, tail: 0.6 },
    trap_set: { before: "idle", pose: "thrust", fallback: "cast", back: 0, lunge: 0, stretch: 0.05 },
    strum: { before: "windup", pose: "slam", fallback: "cast", back: -0.05, lunge: 0.05, tail: 0.5 },
    song: { before: "windup", pose: "cast", back: -0.03, lunge: 0, tail: 0.75 },
    shout: { before: "windup", pose: "cast", back: -0.1, lunge: 0.1, tail: 0.55 },
    warcry: { before: "windup", pose: "proud", fallback: "cast", back: -0.08, lunge: 0.04, tail: 0.7 },
    smoke: { before: "guard", pose: "guard", fallback: "cast", back: -0.05, lunge: 0, stretch: 0.02, tail: 0.4 },
    potion: { before: "idle", pose: "cast", back: 0, lunge: 0, tail: 0.4 },
    spit: { before: "windup", pose: "cast", lunge: 0.14 },
    mend: { before: "guard", pose: "cast", back: -0.03, lunge: 0, tail: 0.5 }
  };

  const has = (id) => Boolean(INDEX[id]);

  function textures(id) {
    if (cache[id]) return cache[id];
    const set = {};
    Object.keys(INDEX[id].poses).forEach((pose) => {
      if (ForgePack.offline) {
        set[pose] = new T.Texture();
        ForgePack.fillTexture(set[pose], `sprite_${id}`, `sprites/${id}/${pose}.webp`);
      } else {
        set[pose] = loader.load(`assets/sprites/${id}/${pose}.webp`);
      }
      set[pose].colorSpace = T.SRGBColorSpace;
      set[pose].anisotropy = 4;
    });
    cache[id] = set;
    return set;
  }

  const VERTEX = `uniform float time; uniform float breathe; uniform float phase; varying vec2 vUv;
    void main(){ vUv = uv; vec3 p = position; float h = p.y; float s = sin(time * 1.9 + phase);
      p.x += s * breathe * 0.016 * h * h + sin(time * 1.1 + phase) * breathe * 0.007 * h;
      p.y *= 1. + s * breathe * 0.009;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`;
  const FRAGMENT = `uniform sampler2D map; uniform vec2 texel; uniform vec3 light; uniform vec3 rimColor; uniform float rimPower; uniform vec3 flashColor; uniform float flash;
    uniform vec3 tintColor; uniform float tintAmount; uniform float ghost; varying vec2 vUv;
    void main(){ vec4 c = texture2D(map, vUv);
      float near = min(min(texture2D(map, vUv + vec2(texel.x, 0.)).a, texture2D(map, vUv - vec2(texel.x, 0.)).a), min(texture2D(map, vUv + vec2(0., texel.y)).a, texture2D(map, vUv - vec2(0., texel.y)).a));
      float edge = c.a * (1. - near);
      if (c.a < .02) discard;
      vec3 col = c.rgb * light * mix(.78, 1., smoothstep(0., .22, vUv.y));
      col = mix(col, tintColor * (.35 + dot(col, vec3(.45))), tintAmount);
      col += rimColor * edge * rimPower * 1.5;
      col += flashColor * flash;
      gl_FragColor = vec4(col, c.a * (1. - ghost)); }`;

  class SpriteUnit {
    constructor(id, side, slot, options) {
      this.id = id;
      this.modelName = id;
      this.side = side;
      this.slot = slot;
      this.sheet = INDEX[id];
      this.textures = textures(id);
      this.root = new T.Group();
      this.pivot = new T.Group();
      this.root.add(this.pivot);
      this.scale = 1;
      this.height = HEIGHT[id] || 2.1 * Math.min(1.25, options.foeScale || 1);
      this.pixel = this.height / this.sheet.poses.idle.h;
      this.uniforms = {
        map: { value: this.textures.idle }, texel: { value: new T.Vector2(1 / 512, 1 / 512) }, time: { value: Math.random() * 10 }, breathe: { value: 1 }, phase: { value: Math.random() * 6 },
        light: { value: new T.Color(options.light || "#ffffff") }, rimPower: { value: 0.42 }, rimColor: { value: new T.Color(side === "hero" ? "#ffd9a8" : "#ffb48a") },
        flash: { value: 0 }, flashColor: { value: new T.Color("#ffffff") }, tintColor: { value: new T.Color("#ffffff") }, tintAmount: { value: 0 }, ghost: { value: 0 }
      };
      this.material = new T.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide });
      this.materials = [this.material];
      this.mesh = new T.Mesh(geometry, this.material);
      this.mesh.frustumCulled = false;
      this.pivot.add(this.mesh);
      this.shadow = new T.Mesh(new T.CircleGeometry(0.5, 24), new T.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.42, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.014;
      this.root.add(this.shadow);
      // The fighter's own silhouette thrown on the ground, away from the light.
      this.castUniforms = { map: { value: this.textures.idle }, fade: { value: 0.42 } };
      this.cast = new T.Mesh(geometry, new T.ShaderMaterial({
        uniforms: this.castUniforms, transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.x += p.y * 0.34; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }",
        fragmentShader: "uniform sampler2D map; uniform float fade; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a * fade * smoothstep(1., .15, vUv.y); if (a < .01) discard; gl_FragColor = vec4(.02, .015, .02, a); }"
      }));
      this.cast.rotation.x = -Math.PI / 2;
      this.cast.position.y = 0.012;
      this.cast.frustumCulled = false;
      this.cast.renderOrder = -2;
      this.shadow.renderOrder = -1;
      this.root.add(this.cast);
      this.tweens = [];
      this.home = new T.Vector3();
      this.alive = true;
      this.status = [];
      this.emitTimers = {};
      this.trails = [];
      this.ghost = 0;
      this.ghostTarget = 0;
      this.baseGhost = options.ghost || 0;
      this.direction = side === "hero" ? 1 : -1;
      this.kick = 0;
      this.kickGoal = 0;
      this.lean = 0;
      this.leanGoal = 0;
      this.squash = 0;
      this.hover = FLOATING.has(id) ? 0.14 : 0;
      this.hoverPhase = Math.random() * 6;
      this.timeline = [];
      this.tintGoal = 0;
      this.showPose("idle");
      this.applyFacing();
    }

    showPose(name) {
      const pose = this.sheet.poses[name] || this.sheet.poses.idle;
      this.pose = name;
      this.uniforms.map.value = this.textures[name] || this.textures.idle;
      this.uniforms.texel.value.set(1.6 / pose.w, 1.6 / pose.h);
      const w = pose.w * this.pixel;
      const h = pose.h * this.pixel;
      this.mesh.scale.set(w, h, 1);
      const anchor = pose.cx ?? pose.ax ?? 0.5;
      this.mesh.position.x = (0.5 - anchor) * w;
      this.shadow.scale.set(Math.max(0.7, Math.min(w, this.height) * 0.72), this.height * 0.15, 1);
      this.castUniforms.map.value = this.uniforms.map.value;
      this.cast.scale.set(w, h * 0.42, 1);
      this.castOffset = this.mesh.position.x;
    }

    applyFacing() {
      this.pivot.scale.set(this.direction * this.sheet.faces, 1, 1);
    }

    face(point) {
      const dx = point.x - this.root.position.x;
      if (Math.abs(dx) > 0.02) this.direction = dx > 0 ? 1 : -1;
      this.applyFacing();
    }

    // How far the blow of a pose reaches in front of the body, in world units.
    reachOf(pose) {
      const data = this.sheet.poses[pose] || this.sheet.poses.strike;
      return Math.max(0.2, this.sheet.faces * ((data.tipX ?? 1) - (data.cx ?? 0.5)) * data.w * this.pixel);
    }

    // The painted point of the current pose where a shot or spell leaves the body.
    muzzle() {
      const data = this.sheet.poses[this.pose] || this.sheet.poses.idle;
      return new T.Vector3(this.root.position.x + this.direction * this.reachOf(this.pose), this.root.position.y + (data.tipY ?? 0.6) * data.h * this.pixel, this.root.position.z + 0.05);
    }

    // The final pose of an action, for the choreography to measure.
    finalPose(name) {
      return ACTIONS[name]?.pose || "strike";
    }

    has(pose) {
      return Boolean(this.sheet.poses[pose]);
    }

    pick(...poses) {
      return poses.find((pose) => this.has(pose)) || "idle";
    }

    // Plays a named action as a sequence of painted poses. Returns its length like a 3D clip does.
    play(name, { loop = false, then = "idle" } = {}) {
      this.playToken = (this.playToken || 0) + 1;
      this.timeline = [];
      const impact = (typeof Stage3D !== "undefined" ? Stage3D.IMPACT[name] ?? 8 : 8) / (typeof Stage3D !== "undefined" ? Stage3D.FPS : 30);
      const add = (at, run) => this.timeline.push({ at, run });
      this.clock = 0;
      this.uniforms.breathe.value = 0;
      this.liftGoal = 0;
      let length = 0.5;
      if (name === "idle") {
        this.showPose("idle");
        this.kickGoal = 0;
        this.leanGoal = 0;
        this.uniforms.breathe.value = 1;
        return 1;
      }
      if (name === "run") {
        this.showPose("dash");
        this.leanGoal = 0.05;
        return 0.5;
      }
      if (name === "leap") {
        this.showPose(this.pick("air", "dash"));
        this.leanGoal = 0.03;
        return 0.5;
      }
      const action = ACTIONS[name];
      if (name === "hit" || name === "heavy_hit") {
        this.showPose("hit");
        this.kick = name === "hit" ? -0.16 : -0.34;
        this.kickGoal = 0;
        this.leanGoal = 0;
        length = name === "hit" ? 0.34 : 0.54;
      } else if (name === "dodge") {
        this.showPose(this.pick("guard", "hit"));
        this.kick = -0.5;
        this.kickGoal = 0;
        this.ghost = Math.max(this.ghost, 0.3);
        this.uniforms.ghost.value = this.ghost;
        length = 0.42;
      } else if (name === "death") {
        this.showPose("hit");
        this.kick = -0.25;
        add(0.2, () => { this.showPose("dead"); this.kick = 0; this.squash = 0.12; });
        length = 0.8;
      } else if (name === "stun") {
        this.showPose("hit");
        this.leanGoal = -0.07;
        length = 0.6;
      } else if (name === "guard") {
        this.showPose(this.pick("guard", "idle"));
        this.kick = -0.12;
        this.kickGoal = -0.03;
        this.squash = 0.03;
        length = 0.7;
      } else if (name === "victory") {
        this.showPose(this.pick("proud", "cast"));
        this.squash = -0.06;
        length = 1.2;
      } else if (action) {
        // Anticipation first, then a snap into the painted blow, then a hold while it reads.
        const before = this.pick(action.before, "idle");
        this.showPose(before);
        this.kickGoal = action.back ?? -0.16;
        this.leanGoal = action.lean ?? -0.04;
        this.squash = action.coil ?? 0.04;
        add(impact, () => {
          this.showPose(this.pick(action.pose, action.fallback || "strike"));
          this.kick = action.lunge ?? 0.22;
          this.kickGoal = action.hold ?? 0.03;
          this.leanGoal = action.after ?? 0;
          this.squash = action.stretch ?? -0.05;
          if (action.drop) this.squash = 0.1;
        });
        if (action.then2) add(impact + 0.13, () => { this.showPose(this.pick(action.then2, "strike")); this.kick = 0.16; this.squash = -0.04; });
        length = impact + (action.tail ?? 0.46);
      } else {
        // Anything else: a plain cast.
        this.showPose(this.pick("windup", "idle"));
        this.kickGoal = -0.08;
        this.squash = 0.03;
        add(impact, () => { this.showPose("cast"); this.kick = 0.1; this.kickGoal = 0; this.squash = -0.04; });
        length = impact + 0.5;
      }
      if (!loop && then) add(length, () => { if (this.alive) this.play(then); });
      return length;
    }

    // During a flurry each further hit lands on a different painted blow.
    nextBlow() {
      const order = ["thrust", "slam", "strike"].filter((pose) => this.has(pose) && pose !== this.pose);
      if (!order.length) return;
      this.flurry = ((this.flurry || 0) + 1) % order.length;
      this.showPose(order[this.flurry]);
      this.kick = 0.22;
      this.squash = -0.05;
      this.timeline = this.timeline.map((step) => ({ ...step, at: Math.max(step.at, this.clock + 0.22) }));
    }

    moveTo(target, seconds, ease = (t) => t * t * (3 - 2 * t)) {
      const from = this.root.position.clone();
      // Whoever waited for the replaced move must not wait forever.
      this.tweens = this.tweens.filter((tween) => { if (tween.kind !== "move") return true; tween.resolve?.(); return false; });
      return new Promise((resolve) => {
        this.tweens.push({ kind: "move", age: 0, duration: Math.max(0.01, seconds), update: (t) => this.root.position.lerpVectors(from, target, ease(t)), resolve });
      });
    }

    chest() {
      return new T.Vector3(this.root.position.x, this.root.position.y + this.height * (this.pose === "dead" ? 0.2 : 0.58), this.root.position.z);
    }

    flash(hex = "#ffffff", power = 1) {
      this.uniforms.flashColor.value.set(hex);
      this.uniforms.flash.value = power * 0.32;
    }

    setGhost(value) {
      this.ghostTarget = Math.max(value, this.baseGhost);
    }

    // A fading copy left behind during fast moves.
    afterimage(stage, hex, life = 0.3) {
      const uniforms = { ...this.uniforms, map: { value: this.uniforms.map.value }, flash: { value: 0.28 }, flashColor: { value: new T.Color(hex) }, ghost: { value: 0.55 }, breathe: { value: 0 }, rimPower: { value: 0 }, tintAmount: { value: 0 }, time: { value: 0 } };
      const material = new T.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide });
      const copy = new T.Mesh(geometry, material);
      this.mesh.getWorldPosition(copy.position);
      copy.position.z -= 0.02;
      copy.scale.set(this.mesh.scale.x * this.pivot.scale.x, this.mesh.scale.y, 1);
      stage.scene.add(copy);
      stage.fxItems.push({ age: 0, duration: life, update: (t) => { uniforms.ghost.value = 0.55 + t * 0.45; }, end: () => { stage.scene.remove(copy); material.dispose(); } });
    }

    update(dt) {
      this.uniforms.time.value += dt;
      this.clock = (this.clock || 0) + dt;
      if (this.timeline.length) {
        const due = this.timeline.filter((step) => step.at <= this.clock);
        this.timeline = this.timeline.filter((step) => step.at > this.clock);
        due.forEach((step) => step.run());
      }
      this.tweens = this.tweens.filter((tween) => {
        tween.age += dt;
        const t = Math.min(1, tween.age / tween.duration);
        tween.update(t);
        if (t >= 1) { tween.resolve?.(); return false; }
        return true;
      });
      this.kick += (this.kickGoal - this.kick) * Math.min(1, dt * 11);
      this.lean += (this.leanGoal - this.lean) * Math.min(1, dt * 11);
      this.squash *= Math.max(0, 1 - dt * 10);
      this.hoverPhase += dt * 1.8;
      const floatY = this.hover && this.alive ? this.hover + Math.sin(this.hoverPhase) * 0.05 : 0;
      this.pivot.position.set(this.kick * this.direction, floatY, 0);
      this.pivot.rotation.z = -this.lean * this.direction;
      this.pivot.scale.y = 1 - this.squash;
      this.pivot.scale.x = this.direction * this.sheet.faces * (1 + this.squash * 0.7);
      this.uniforms.flash.value *= Math.max(0, 1 - Math.max(dt, 0.016) * 9);
      this.uniforms.tintAmount.value += (this.tintGoal - this.uniforms.tintAmount.value) * Math.min(1, dt * 6);
      if (Math.abs(this.ghost - this.ghostTarget) > 0.002) {
        this.ghost += (this.ghostTarget - this.ghost) * Math.min(1, dt * 7);
        this.uniforms.ghost.value = this.ghost;
      }
      // Shadows stay on the ground when the fighter leaves it.
      const up = this.root.position.y;
      this.shadow.position.y = 0.014 - up;
      this.cast.position.y = 0.012 - up;
      const sign = this.direction * this.sheet.faces;
      this.cast.scale.x = Math.abs(this.cast.scale.x) * sign;
      this.cast.position.x = (this.castOffset || 0) * sign + this.kick * this.direction;
      const air = Math.max(0.25, 1 - up * 0.55);
      this.castUniforms.fade.value = 0.42 * air * (1 - this.ghost);
      this.shadow.material.opacity = 0.5 * air * (1 - this.ghost);
      this.shadow.scale.y = Math.abs(this.shadow.scale.y);
    }
  }

  return { has, SpriteUnit, HEIGHT, FLOATING, ACTIONS };
})();
