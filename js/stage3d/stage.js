// The 3D battle stage. The game logic never touches it: it only receives the same events the old 2D stage played.
const Stage3D = (() => {
  const T = window.THREE;
  const FPS = 30;
  const hasWebGL = (() => { try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch (error) { return false; } })();

  const HERO_MODELS = { assassin: "assassin", warrior: "warrior", mage: "mage", archer: "archer", bard: "bard" };
  const ART_MODELS = { beast: "beast", rogue: "rogue", caster: "caster", slime: "slime", imp: "imp", knight: "knight", golem: "golem", wraith: "wraith", shard: "shard", smith: "smith" };
  // Body proportions the stage needs to place effects, rings and plates.
  const ART_SHAPE = { beast: { height: 1.15, scale: 0.92 }, slime: { height: 1 }, imp: { height: 1.95, scale: 0.72, hover: 0.34 }, golem: { height: 2.2, scale: 1.15 }, wraith: { height: 1.95, hover: 0.42, ghost: 0.26 }, shard: { height: 1.9, hover: 0.12 }, smith: { height: 2.15, scale: 1.34, noTint: true } };
  const ENVIRONMENTS = {
    thicket: {
      model: "env_thicket", skyTop: "#6f9fc4", skyLow: "#f6d9a6", fog: "#c9c9a2", fogNear: 13, fogFar: 46,
      sun: { color: "#ffe2b0", power: 3.4, pos: [-7, 11, 6] }, fill: { sky: "#cfe0f0", ground: "#6a7a4a", power: 1.35 }, rim: { color: "#ffc98a", power: 2.2, pos: [6, 5, -8] },
      motes: { color: "#fff2b8", count: 70, size: 0.09, speed: 0.1 }
    },
    ashlands: {
      model: "env_ashlands", skyTop: "#2a1a24", skyLow: "#c8603a", fog: "#4f3530", fogNear: 13, fogFar: 44,
      sun: { color: "#ffe2c8", power: 2.9, pos: [-7, 10, 5] }, fill: { sky: "#a89a98", ground: "#3a2c28", power: 1.5 }, rim: { color: "#ff7a3a", power: 2.2, pos: [6, 3, -8] },
      motes: { color: "#ff9a3c", count: 110, size: 0.075, speed: 0.5, rise: true }
    },
    ruins: {
      model: "env_ruins", skyTop: "#1c2a4a", skyLow: "#7fa6c0", fog: "#6a8496", fogNear: 12, fogFar: 42,
      sun: { color: "#cfe0ff", power: 2.9, pos: [-6, 11, 7] }, fill: { sky: "#a8c0e0", ground: "#4a5a50", power: 1.5 }, rim: { color: "#7fd0ff", power: 2.4, pos: [6, 5, -8] },
      motes: { color: "#a8e0ff", count: 60, size: 0.07, speed: 0.1 }
    },
    limit: {
      model: "env_limit", skyTop: "#0c0820", skyLow: "#6a3ca8", fog: "#2c1f55", fogNear: 13, fogFar: 56, stars: 1,
      sun: { color: "#d8c0ff", power: 2.8, pos: [-6, 10, 6] }, fill: { sky: "#9a84e0", ground: "#2a1f50", power: 1.7 }, rim: { color: "#7fb8ff", power: 3, pos: [6, 4, -9] },
      motes: { color: "#c8b0ff", count: 90, size: 0.07, speed: 0.2, rise: true }
    }
  };

  // Frame of the impact in each clip: effects and damage are timed to it.
  const IMPACT = { overhead: 13, sweep: 11, bash: 8, warcry: 12, staff_swing: 9, bow_shot: 16, bow_rapid: 6, bow_rain: 14, trap_set: 8, kick: 7, strum: 8, song: 12, shout: 10, stab: 9, twin_slash: 8, throw: 9, low_sweep: 9, backstab: 11, cast_forward: 11, cast_up: 16, cast_heavy: 20, bite: 9, pounce: 15, howl: 14, lunge: 11, spit: 11, mend: 14, potion: 12, smoke: 7, guard: 4 };
  const ELEMENT = { fire: "#ff8a3c", frost: "#9fe4ff", water: "#5fb7ff", earth: "#c49a5c", air: "#c8f0e8", holy: "#ffe9a0", dark: "#a974ff", arcane: "#8fa0ff", poison: "#9be34f", blood: "#ff3d52", steel: "#ffffff" };
  const STATUS_FX = {
    poison: { color: "#8fe04a", rise: 0.55, rate: 10, size: 0.14, spread: 0.32 }, burn: { color: "#ff7a2c", rise: 1.15, rate: 20, size: 0.22, spread: 0.26 }, bleed: { color: "#ff2f46", rise: -0.9, rate: 12, size: 0.1, spread: 0.26 },
    frost: { color: "#a6e6ff", rise: 0.3, rate: 9, size: 0.1, spread: 0.36 }, frostbite: { color: "#c8f2ff", rise: 0.2, rate: 12, size: 0.1, spread: 0.36 }, freeze: { color: "#e2f8ff", rise: 0.1, rate: 18, size: 0.12, spread: 0.42 },
    shock: { color: "#fff27a", rise: 0.9, rate: 12, size: 0.1, spread: 0.42 }, corruption: { color: "#a65cff", rise: 0.5, rate: 10, size: 0.15, spread: 0.34 }, regeneration: { color: "#8dff9a", rise: 0.8, rate: 7, size: 0.11, spread: 0.36 },
    rage: { color: "#ff5a3c", rise: 0.9, rate: 8, size: 0.13, spread: 0.34 }, haste: { color: "#d8fff0", rise: 0.3, rate: 7, size: 0.08, spread: 0.3 }, soaked: { color: "#6fb8ff", rise: -0.8, rate: 7, size: 0.07, spread: 0.3 }, mark: { color: "#ffd25a", rise: 0.1, rate: 3, size: 0.13, spread: 0.2 }
  };
  // The most important status colours the body. The first match in this list wins.
  const HERO_RIM = new T.Color("#ffd9a8");
  const FOE_RIM = new T.Color("#ffb48a");
  const BODY_STATUS = [
    { id: "freeze", color: "#a8e4ff", tint: 0.6 }, { id: "stun", color: "#fff27a", tint: 0.12 }, { id: "burn", color: "#ff7a2c", tint: 0.18 }, { id: "poison", color: "#7fd03a", tint: 0.2 },
    { id: "corruption", color: "#9a55f0", tint: 0.24 }, { id: "bleed", color: "#ff2f46", tint: 0.2 }, { id: "frostbite", color: "#9fe4ff", tint: 0.3 }, { id: "frost", color: "#9fe4ff", tint: 0.2 },
    { id: "mark", color: "#ffd25a", tint: 0.08 }, { id: "armor_break", color: "#c49a5c", tint: 0.1 }, { id: "weaken", color: "#8a8fa8", tint: 0.2 }, { id: "silence", color: "#b0b4c8", tint: 0.14 },
    { id: "rage", color: "#ff5a3c", tint: 0.14 }, { id: "regeneration", color: "#8dff9a", tint: 0.08 }, { id: "haste", color: "#d8fff0", tint: 0.06 }
  ];
  // Where the blade tip rests in the model, used for the slash ribbons. [x, y up, z forward]
  const WEAPON_TIPS = {
    assassin: [{ bone: "handR", tip: [-0.385, 0.735, 0.6] }, { bone: "handL", tip: [0.385, 0.735, 0.6] }],
    rogue: [{ bone: "handR", tip: [-0.385, 0.72, 0.74] }],
    warrior: [{ bone: "handR", tip: [-0.385, 0.72, 1.035] }],
    knight: [{ bone: "handR", tip: [-0.385, 0.72, 1.035] }],
    smith: [{ bone: "handR", tip: [-0.58, 0.75, 1.3] }]
  };

  let renderer, composer, bloom, scene, camera, envTexture, clock;
  const modelCache = {};
  let ready = false;
  let stage = null;
  let rafId = 0;

  const color = (hex) => new T.Color(hex);
  const rand = (a, b) => a + Math.random() * (b - a);
  const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000 / speed()));
  const speed = () => Number((typeof App !== "undefined" && App.save?.settings?.battleSpeed) || 1);
  const smooth = (t) => t * t * (3 - 2 * t);

  function decode(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function preload() {
    if (!hasWebGL || !window.FORGE_MODELS) return false;
    const loader = new T.GLTFLoader();
    await Promise.all(Object.entries(window.FORGE_MODELS).map(([name, base64]) => new Promise((resolve) => {
      loader.parse(decode(base64), "", (gltf) => { modelCache[name] = gltf; resolve(); }, (error) => { console.error("model", name, error); resolve(); });
    })));
    ready = true;
    return true;
  }

  function supports(battle, regionId) {
    if (!ready || !renderer && !hasWebGL) return false;
    if (!ENVIRONMENTS[regionId] || !modelCache[ENVIRONMENTS[regionId].model]) return false;
    if (!modelCache[HERO_MODELS[battle.hero.classKey]]) return false;
    return battle.foes.every((foe) => modelCache[ART_MODELS[foe.art]]);
  }

  // The painted look needs every fighter of the fight to be drawn. Otherwise the fight stays fully 3D.
  function paintedFight(battle) {
    return StageSprites.has(battle.hero.classKey) && battle.foes.every((foe) => StageSprites.has(foe.defId));
  }
  // How each layer of a location is lit. Farther layers sink into the haze, the near fringe is dark.
  const SCENE_LOOK = {
    thicket: { far: "#c8c4b0", mid: "#86806a", fore: "#39402c", ground: "#c8bca0", haze: "#6c6a4c" },
    ashlands: { far: "#c4a898", mid: "#8a6c5c", fore: "#3a2a24", ground: "#c8aa98", haze: "#6c3f2c" },
    ruins: { far: "#a8b8cc", mid: "#7c8ca0", fore: "#2a3440", ground: "#a8b4c4", haze: "#3a5068" },
    limit: { far: "#c4b4d8", mid: "#8878a8", fore: "#2e2640", ground: "#b4a8cc", haze: "#3c2c60" }
  };
  // The light of the hour: a trail starts at dawn and reaches its guardian at dusk; lairs and guardians fight late.
  const DAY = [
    { at: 0, tint: "#ffcfb0", power: 0.9 },
    { at: 0.45, tint: "#ffffff", power: 1 },
    { at: 0.8, tint: "#ffb27e", power: 0.84 },
    { at: 1, tint: "#93a2ff", power: 0.62 }
  ];
  function dayLight(time) {
    const t = Math.max(0, Math.min(1, Number(time) || 0));
    const next = DAY.findIndex((key) => key.at >= t);
    const b = DAY[Math.max(0, next)];
    const a = DAY[Math.max(0, next - 1)];
    const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
    return { tint: color(a.tint).lerp(color(b.tint), k), power: a.power + (b.power - a.power) * k };
  }
  // Weather that falls through the clearing: rain streaks, ash flakes, low mist, falling shards of the sky.
  const WEATHER = {
    rain: { count: 520, color: "#b4c8dc", opacity: 0.32, fall: 13, wind: -2.2, streak: 0.42 },
    ash: { count: 170, color: "#b9aca3", opacity: 0.7, fall: 0.45, wind: 0.25, size: 0.07, sway: 0.5 },
    mist: { count: 16, color: "#9fb4c8", opacity: 0.11, fall: 0, wind: 0.18, size: 5.5, low: true },
    shards: { count: 110, color: "#e6d6ff", opacity: 0.85, fall: 0.55, wind: -0.1, size: 0.05, sway: 0.2, glow: true }
  };
  const PAINTED_LIGHT = { thicket: "#fff6e6", ashlands: "#ffe0c4", ruins: "#dce8ff", limit: "#e4dcff" };

  // ---------- renderer ----------
  function initRenderer() {
    if (renderer) return;
    renderer = new T.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.domElement.className = "stage3d-canvas";
    clock = new T.Clock();
    camera = new T.PerspectiveCamera(30, 16 / 9, 0.1, 200);
    // Reflections for metal: a small painted gradient room.
    const pmrem = new T.PMREMGenerator(renderer);
    const room = new T.Scene();
    room.background = new T.Color("#8fa2b8");
    const dome = new T.Mesh(new T.SphereGeometry(10, 16, 12), new T.ShaderMaterial({
      side: T.BackSide,
      vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: "varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(.16,.13,.11), vec3(1.5,1.35,1.1), smoothstep(-.1,.6,h)); c += vec3(3.)*smoothstep(.9,1.,dot(normalize(p),normalize(vec3(-.5,.7,.5)))); gl_FragColor = vec4(c,1.); }"
    }));
    room.add(dome);
    envTexture = pmrem.fromScene(room, 0.04).texture;
    const target = new T.WebGLRenderTarget(1280, 720, { type: T.HalfFloatType, samples: 4 });
    composer = new T.EffectComposer(renderer, target);
    composer.addPass(new T.RenderPass(new T.Scene(), camera));
    // One broken pixel must never reach the bloom: it would blacken the whole frame.
    composer.addPass(new T.ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (!(c.r >= 0. && c.g >= 0. && c.b >= 0. && c.r < 1000. && c.g < 1000. && c.b < 1000.)) c = vec4(0., 0., 0., 1.); gl_FragColor = vec4(min(c.rgb, vec3(12.)), c.a); }"
    }));
    bloom = new T.UnrealBloomPass(new T.Vector2(640, 360), 0.26, 0.5, 1.05);
    composer.addPass(bloom);
    composer.addPass(new T.ShaderPass({
      uniforms: { tDiffuse: { value: null }, flash: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `uniform sampler2D tDiffuse; uniform float flash; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 q = vUv - .5;
          float v = smoothstep(.95, .28, length(q * vec2(1.05, 1.2)));
          c.rgb *= mix(.5, 1., v);
          c.rgb += flash * vec3(1., .86, .7);
          gl_FragColor = c;
        }`
    }));
    composer.addPass(new T.OutputPass());
  }

  // ---------- particles ----------
  class Particles {
    constructor(max, blending, softness) {
      this.max = max;
      this.next = 0;
      const geo = new T.BufferGeometry();
      this.pos = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.data = new Float32Array(max * 2); // size, alpha
      this.vel = new Float32Array(max * 3);
      this.life = new Float32Array(max * 2); // age, lifetime
      this.base = new Float32Array(max);
      this.drag = new Float32Array(max);
      this.grow = new Float32Array(max);
      geo.setAttribute("position", new T.BufferAttribute(this.pos, 3));
      geo.setAttribute("color", new T.BufferAttribute(this.col, 3));
      geo.setAttribute("info", new T.BufferAttribute(this.data, 2));
      this.mesh = new T.Points(geo, new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending,
        uniforms: { scale: { value: 500 } },
        vertexShader: `attribute vec3 color; attribute vec2 info; varying vec3 vColor; varying float vAlpha; uniform float scale;
          void main(){ vColor = color; vAlpha = info.y; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = info.x * scale / max(.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vColor; varying float vAlpha;
          void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., ${softness}, d) * vAlpha; if (a < .004) discard; gl_FragColor = vec4(vColor * a${blending === T.AdditiveBlending ? "" : " + vColor * 0."}, a); }`
      }));
      this.mesh.frustumCulled = false;
    }

    spawn(x, y, z, vx, vy, vz, size, life, tint, drag = 1.6, grow = 0) {
      const i = this.next;
      this.next = (i + 1) % this.max;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([vx, vy, vz], i * 3);
      this.col.set([tint.r, tint.g, tint.b], i * 3);
      this.life[i * 2] = 0;
      this.life[i * 2 + 1] = life;
      this.base[i] = size;
      this.drag[i] = drag;
      this.grow[i] = grow;
    }

    update(dt) {
      for (let i = 0; i < this.max; i += 1) {
        const lifetime = this.life[i * 2 + 1];
        if (!lifetime) continue;
        const age = (this.life[i * 2] += dt);
        if (age >= lifetime) {
          this.life[i * 2 + 1] = 0;
          this.data[i * 2 + 1] = 0;
          continue;
        }
        const k = Math.max(0, 1 - this.drag[i] * dt);
        for (let a = 0; a < 3; a += 1) {
          this.vel[i * 3 + a] *= k;
          this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
        }
        const t = age / lifetime;
        this.data[i * 2] = this.base[i] * (1 + this.grow[i] * t) * (this.grow[i] ? 1 : 1 - t * 0.5);
        this.data[i * 2 + 1] = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      }
      const geo = this.mesh.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.info.needsUpdate = true;
    }
  }

  // ---------- a unit on the field ----------
  class Unit {
    constructor(modelName, side, slot, options) {
      const gltf = modelCache[modelName];
      this.modelName = modelName;
      this.side = side;
      this.slot = slot;
      this.root = new T.Group();
      this.pivot = new T.Group();
      this.root.add(this.pivot);
      this.model = T.SkeletonUtils.clone(gltf.scene);
      this.pivot.add(this.model);
      this.scale = options.scale || 1;
      this.pivot.scale.setScalar(this.scale);
      this.facing = side === "hero" ? Math.PI / 2 : -Math.PI / 2;
      this.pivot.rotation.y = this.facing;
      this.uniforms = { rimPower: { value: 0.42 }, rimColor: { value: side === "hero" ? color("#ffd9a8") : color("#ffb48a") }, flash: { value: 0 }, flashColor: { value: color("#ffffff") } };
      this.materials = [];
      const tint = options.tint ? new T.Color(options.tint) : null;
      this.model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
          const material = node.material.clone();
          material.envMap = envTexture;
          material.envMapIntensity = /metal/.test(material.name) ? 1.5 : 0.35;
          const isGlow = /glow/.test(material.name);
          if (isGlow) {
            material.emissive = new T.Color("#ffffff");
            material.emissiveIntensity = 2.2;
            material.vertexColors = true;
          } else if (tint && !/metal/.test(material.name)) {
            material.color = tint;
          }
          material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.fragmentShader = shader.fragmentShader
              .replace("#include <common>", "#include <common>\nuniform float rimPower; uniform vec3 rimColor; uniform float flash; uniform vec3 flashColor;")
              .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
                float rim = pow(1. - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.2);
                totalEmissiveRadiance += rimColor * rim * rimPower + flashColor * flash;`);
          };
          this.materials.push(material);
          node.material = material;
          if (!this.skeleton && node.skeleton) this.skeleton = node.skeleton;
        }
      });
      this.mixer = new T.AnimationMixer(this.model);
      this.clips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
      this.current = null;
      this.tweens = [];
      this.home = new T.Vector3();
      this.height = options.height || 1.95;
      this.alive = true;
      this.status = [];
      this.emitTimers = {};
      this.ghost = 0;
      this.ghostTarget = 0;
      this.trails = (WEAPON_TIPS[modelName] || []).map((entry) => new Trail(this, entry));
      this.hover = options.hover || 0;
      this.hoverPhase = Math.random() * 6;
      this.baseGhost = options.ghost || 0;
      if (this.baseGhost) this.setGhost(this.baseGhost);
      this.play("idle", { loop: true, fade: 0 });
      if (this.current) this.current.time = Math.random() * 1.2;
    }

    play(name, { loop = false, fade = 0.08, then = "idle", timeScale = 1 } = {}) {
      const clip = this.clips[name] || this.clips.idle;
      if (!clip) return 0;
      const action = this.mixer.clipAction(clip);
      if (this.current === action && loop) return clip.duration;
      action.reset();
      action.enabled = true;
      action.setEffectiveTimeScale(timeScale);
      action.setEffectiveWeight(1);
      action.setLoop(loop ? T.LoopRepeat : T.LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      if (this.current && fade > 0) action.crossFadeFrom(this.current, fade, false);
      else if (this.current) this.current.stop();
      action.play();
      this.current = action;
      this.playToken = (this.playToken || 0) + 1;
      if (!loop && then) {
        const token = this.playToken;
        const finish = () => { if (this.playToken === token && this.alive) this.play(then, { loop: then === "idle" || then === "stun" || then === "guard" && false, fade: 0.16 }); };
        this.after = { at: clip.duration / timeScale - 0.04, run: finish, age: 0 };
      } else {
        this.after = null;
      }
      return clip.duration / timeScale;
    }

    moveTo(target, seconds, ease = smooth) {
      const from = this.root.position.clone();
      // Whoever waited for the replaced move must not wait forever.
      this.tweens = this.tweens.filter((tween) => { if (tween.kind !== "move") return true; tween.resolve?.(); return false; });
      return new Promise((resolve) => {
        this.tweens.push({ kind: "move", age: 0, duration: Math.max(0.01, seconds), update: (t) => this.root.position.lerpVectors(from, target, ease(t)), resolve });
      });
    }

    face(point, seconds = 0.12) {
      const dx = point.x - this.root.position.x;
      const dz = point.z - this.root.position.z;
      const goal = Math.atan2(dx, dz);
      const start = this.pivot.rotation.y;
      let delta = goal - start;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.tweens = this.tweens.filter((tween) => tween.kind !== "face");
      this.tweens.push({ kind: "face", age: 0, duration: seconds, update: (t) => { this.pivot.rotation.y = start + delta * smooth(t); } });
    }

    chest() {
      return new T.Vector3(this.root.position.x, this.root.position.y + this.height * 0.58 * this.scale, this.root.position.z);
    }

    flash(hex = "#ffffff", power = 1) {
      this.uniforms.flashColor.value.set(hex);
      this.uniforms.flash.value = power * 0.5;
    }

    // A fading glowing copy left behind during fast moves.
    afterimage(stage, hex, life = 0.28) {
      const copy = T.SkeletonUtils.clone(this.model);
      const material = new T.MeshBasicMaterial({ color: color(hex), transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending });
      copy.traverse((node) => { if (node.isMesh) { node.material = material; node.frustumCulled = false; } });
      copy.position.copy(this.root.position);
      copy.rotation.y = this.pivot.rotation.y;
      copy.scale.setScalar(this.scale);
      stage.scene.add(copy);
      stage.fxItems.push({ age: 0, duration: life, update: (t) => { material.opacity = 0.5 * (1 - t); }, end: () => { stage.scene.remove(copy); material.dispose(); } });
    }

    setGhost(value) {
      this.ghostTarget = Math.max(value, this.baseGhost || 0);
    }

    update(dt) {
      this.mixer.update(dt);
      if (this.hover) {
        this.hoverPhase += dt * 1.8;
        this.pivot.position.y = this.alive ? this.hover + Math.sin(this.hoverPhase) * 0.06 : Math.max(0, this.pivot.position.y - dt * 0.9);
      }
      if (this.after) {
        this.after.age += dt;
        if (this.after.age >= this.after.at) {
          const run = this.after.run;
          this.after = null;
          run();
        }
      }
      this.tweens = this.tweens.filter((tween) => {
        tween.age += dt;
        const t = Math.min(1, tween.age / tween.duration);
        tween.update(t);
        if (t >= 1) { tween.resolve?.(); return false; }
        return true;
      });
      this.uniforms.flash.value *= Math.max(0, 1 - Math.max(dt, 0.016) * 9);
      if (Math.abs(this.ghost - this.ghostTarget) > 0.002) {
        this.ghost += (this.ghostTarget - this.ghost) * Math.min(1, dt * 7);
        this.materials.forEach((material) => {
          material.transparent = this.ghost > 0.01;
          material.opacity = 1 - this.ghost;
          material.depthWrite = this.ghost < 0.01;
        });
      }
      this.trails.forEach((trail) => trail.update(dt));
    }
  }

  // ---------- the ribbon a blade leaves behind ----------
  class Trail {
    constructor(unit, entry) {
      this.unit = unit;
      this.boneName = entry.bone;
      this.restTip = new T.Vector3(...entry.tip);
      this.count = 18;
      this.points = [];
      this.heat = 0;
      const geo = new T.BufferGeometry();
      this.position = new Float32Array(this.count * 2 * 3);
      this.alpha = new Float32Array(this.count * 2);
      const index = [];
      for (let i = 0; i < this.count - 1; i += 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(index);
      geo.setAttribute("position", new T.BufferAttribute(this.position, 3));
      geo.setAttribute("alpha", new T.BufferAttribute(this.alpha, 1));
      this.color = { value: color("#ffffff") };
      this.mesh = new T.Mesh(geo, new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { tint: this.color },
        vertexShader: "attribute float alpha; varying float a; void main(){ a = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
        fragmentShader: "uniform vec3 tint; varying float a; void main(){ gl_FragColor = vec4(tint * a * 1.5, a); }"
      }));
      this.mesh.frustumCulled = false;
      this.mesh.visible = false;
    }

    prepare() {
      const skeleton = this.unit.skeleton;
      if (!skeleton || this.bone) return;
      const index = skeleton.bones.findIndex((bone) => bone.name.replace(/[._]/g, "") === this.boneName);
      if (index < 0) return;
      this.bone = skeleton.bones[index];
      this.tipLocal = this.restTip.clone().applyMatrix4(skeleton.boneInverses[index]);
      this.baseLocal = this.restTip.clone().lerp(new T.Vector3(this.restTip.x, this.restTip.y + 0.04, 0.12), 1).applyMatrix4(skeleton.boneInverses[index]);
    }

    fire(seconds, hex) {
      this.prepare();
      this.heat = seconds;
      this.color.value.set(hex);
      this.points = [];
    }

    update(dt) {
      if (!this.bone) return;
      this.heat -= dt;
      this.mesh.visible = this.points.length > 1;
      if (this.heat > 0) {
        const tip = this.tipLocal.clone().applyMatrix4(this.bone.matrixWorld);
        const base = this.baseLocal.clone().applyMatrix4(this.bone.matrixWorld);
        this.points.unshift({ tip, base, age: 0 });
      }
      this.points.forEach((point) => { point.age += dt; });
      this.points = this.points.filter((point) => point.age < 0.2).slice(0, this.count);
      for (let i = 0; i < this.count; i += 1) {
        const point = this.points[Math.min(i, this.points.length - 1)];
        if (!point) continue;
        this.position.set(point.tip.toArray(), i * 6);
        this.position.set(point.base.toArray(), i * 6 + 3);
        const a = i < this.points.length ? (1 - point.age / 0.2) * (1 - i / this.count) * 0.75 : 0;
        this.alpha[i * 2] = a;
        this.alpha[i * 2 + 1] = a * 0.1;
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.alpha.needsUpdate = true;
    }
  }

  // ---------- one fight ----------
  class Stage {
    constructor(host, battle, regionId, mood = {}) {
      this.host = host;
      this.mood = mood;
      this.battle = battle;
      this.config = ENVIRONMENTS[regionId];
      this.units = {};
      this.fxItems = [];
      this.shakeAmount = 0;
      this.timeScale = 1;
      this.hitStop = 0;
      this.flashLevel = 0;
      this.focus = new T.Vector3(0, 1.05, 0);
      this.focusGoal = this.focus.clone();
      this.zoom = 0;
      this.zoomGoal = 0;
      this.regionId = regionId;
      this.painted = paintedFight(battle);
      renderer.toneMapping = this.painted ? T.NoToneMapping : T.ACESFilmicToneMapping;
      this.buildWorld();
      this.applyMood();
      this.buildWeather(mood.weather);
      this.hero = this.addUnit(HERO_MODELS[battle.hero.classKey], "hero", -1, {});
      this.hero.root.position.set(-2.8 * squeezeX(), 0, 0.35);
      this.hero.home.copy(this.hero.root.position);
      battle.foes.forEach((foe) => this.addFoe(foe));
      this.placeFoes(true);
      this.time = 0;
    }

    buildWorld() {
      const cfg = this.config;
      scene = new T.Scene();
      this.scene = scene;
      scene.fog = new T.Fog(cfg.fog, cfg.fogNear, cfg.fogFar);
      scene.environment = null;
      if (this.painted) this.buildPaintedWorld(cfg);
      else {
      const sky = new T.Mesh(new T.SphereGeometry(120, 24, 16), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: color(cfg.skyTop) }, low: { value: color(cfg.skyLow) }, stars: { value: cfg.stars || 0 } },
        vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
        fragmentShader: `uniform vec3 top; uniform vec3 low; uniform float stars; varying vec3 p;
          float hash(vec3 q){ return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main(){ vec3 n = normalize(p); float h = smoothstep(-.02, .42, n.y); vec3 c = mix(low, top, h);
            if (stars > 0.) { vec3 g = floor(n * 190.); float s0 = step(.994, hash(g)); c += vec3(.95, .9, 1.) * s0 * h * hash(g + 3.) * 1.6; }
            float s = max(0., dot(n, normalize(vec3(-.42, .22, -.88)))); c += vec3(1., .86, .6) * (pow(s, 90.) * 2.2 + pow(s, 7.) * .3); gl_FragColor = vec4(c, 1.); }`
      }));
      scene.add(sky);
      const env = modelCache[cfg.model].scene.clone();
      env.traverse((node) => {
        if (!node.isMesh) return;
        if (/glow/.test(node.material.name)) {
          node.material = new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide, toneMapped: true });
          return;
        }
        node.receiveShadow = true;
        node.material = node.material.clone();
        node.material.flatShading = true;
        node.material.envMap = null;
      });
      scene.add(env);
      }
      const sun = new T.DirectionalLight(cfg.sun.color, cfg.sun.power);
      sun.position.set(...cfg.sun.pos);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 40 });
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
      scene.add(sun);
      scene.add(new T.HemisphereLight(cfg.fill.sky, cfg.fill.ground, cfg.fill.power));
      const rim = new T.DirectionalLight(cfg.rim.color, cfg.rim.power);
      rim.position.set(...cfg.rim.pos);
      scene.add(rim);
      this.impactLight = new T.PointLight("#ffffff", 0, 5.5, 1.8);
      scene.add(this.impactLight);

      this.glow = new Particles(1800, T.AdditiveBlending, "0.12");
      this.puffs = new Particles(240, T.NormalBlending, "0.25");
      scene.add(this.glow.mesh, this.puffs.mesh);

      // Pollen or embers drifting through the clearing.
      this.motes = [];
      for (let i = 0; i < cfg.motes.count; i += 1) this.motes.push({ x: rand(-11, 11), y: rand(0.2, 5), z: rand(-6, 5), p: rand(0, 6.28), s: rand(0.5, 1.4) });
      const moteGeo = new T.BufferGeometry();
      this.motePos = new Float32Array(cfg.motes.count * 3);
      moteGeo.setAttribute("position", new T.BufferAttribute(this.motePos, 3));
      this.moteMesh = new T.Points(moteGeo, new T.PointsMaterial({ map: softDot(), color: cfg.motes.color, size: cfg.motes.size * 1.8, transparent: true, depthWrite: false, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      this.moteMesh.frustumCulled = false;
      scene.add(this.moteMesh);

      // Target marker on the ground.
      const ringMaterial = (hex) => new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        uniforms: { time: { value: 0 }, tint: { value: color(hex) }, power: { value: 1 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
        fragmentShader: `uniform float time; uniform vec3 tint; uniform float power; varying vec2 vUv;
          void main(){ vec2 q = vUv - .5; float d = length(q) * 2.; float a = atan(q.y, q.x);
            float ring = smoothstep(.72, .86, d) * smoothstep(1., .9, d);
            float dash = smoothstep(.2, .55, sin(a * 6. + time * 2.4)) * .75 + .25;
            float inner = smoothstep(.86, .3, d) * .18;
            float v = (ring * dash + inner) * power; if (v < .003) discard; gl_FragColor = vec4(tint * v * 1.6, v); }`
      });
      this.targetRing = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), ringMaterial("#ff9a3c"));
      this.targetRing.rotation.x = -Math.PI / 2;
      this.targetRing.position.y = 0.035;
      this.targetRing.renderOrder = 2;
      scene.add(this.targetRing);
      this.hoverRing = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), ringMaterial("#ffe0a8"));
      this.hoverRing.rotation.x = -Math.PI / 2;
      this.hoverRing.position.y = 0.03;
      this.hoverRing.visible = false;
      scene.add(this.hoverRing);
    }

    // A location built from painted layers at real depths: sky, far land, a ground to stand on, middle objects, a near fringe.
    buildPaintedWorld() {
      const id = this.regionId;
      const load = (name, done) => {
        let texture;
        if (ForgePack.offline) {
          texture = new T.Texture();
          ForgePack.fillTexture(texture, `scene_${id}`, `scenes/${id}_${name}.webp`);
        } else {
          texture = new T.TextureLoader().load(`assets/scenes/${id}_${name}.webp`, done);
        }
        this.ownTextures = this.ownTextures || [];
        this.ownTextures.push(texture);
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = 8;
        return texture;
      };
      const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }";
      const layer = (texture, shade, soft, order) => {
        const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({
          transparent: true, depthWrite: false, uniforms: { map: { value: texture }, shade: { value: color(shade) }, soft: { value: soft } }, vertexShader: VERT,
          fragmentShader: "uniform sampler2D map; uniform vec3 shade; uniform float soft; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv, soft); if (c.a < .02) discard; gl_FragColor = vec4(c.rgb * shade, c.a * smoothstep(0., .07, vUv.y)); }"
        }));
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        scene.add(mesh);
        return mesh;
      };
      const look = SCENE_LOOK[id] || SCENE_LOOK.thicket;
      this.farLayer = layer(load("far"), look.far, 1.2, -30);
      this.backdrop = this.farLayer;
      this.midLayer = layer(load("mid"), look.mid, 0.3, -20);
      this.midLayer.scale.set(21, 14, 1);
      this.midLayer.position.set(0, 7 - 0.5, -7.5);
      this.foreLayer = layer(load("fore"), look.fore, 2.4, 40);
      // The ground: a painted surface that really runs from under the camera into the distance.
      const groundTexture = load("ground");
      groundTexture.wrapS = groundTexture.wrapT = T.RepeatWrapping;
      const ground = new T.Mesh(new T.PlaneGeometry(60, 26), new T.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { map: { value: groundTexture }, shade: { value: color(look.ground) }, far: { value: color(look.haze) } },
        vertexShader: "varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position,1.); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }",
        fragmentShader: `uniform sampler2D map; uniform vec3 shade; uniform vec3 far; varying vec3 w;
          void main(){ vec3 a = texture2D(map, w.xz * .19).rgb; vec3 b = texture2D(map, w.zx * .067 + .37).rgb; vec3 c = mix(a, b, .35) * shade;
            float pool = smoothstep(9.5, 1.5, length(vec2(w.x * .62, w.z - .3)));
            c *= mix(.55, 1.2, pool);
            float d = smoothstep(-1.5, -7.5, w.z);
            c = mix(c, far, d * .7);
            gl_FragColor = vec4(c, 1. - smoothstep(-6.6, -9.6, w.z)); }`
      }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, 0, -1);
      ground.renderOrder = -10;
      ground.frustumCulled = false;
      scene.add(ground);
      scene.fog = null;
    }

    addUnit(model, side, slot, options) {
      const spriteId = this.painted ? (side === "hero" ? heroLookId(this.battle.hero) : options.defId) : null;
      const unit = spriteId && StageSprites.has(spriteId)
        ? new StageSprites.SpriteUnit(spriteId, side, slot, { ...options, light: PAINTED_LIGHT[this.regionId] })
        : new Unit(model, side, slot, options);
      this.scene.add(unit.root);
      unit.trails.forEach((trail) => this.scene.add(trail.mesh));
      this.units[side === "hero" ? "hero" : `foe${slot}`] = unit;
      return unit;
    }

    addFoe(foe) {
      const unit = this.addUnit(ART_MODELS[foe.art], "foe", foe.slot, { defId: foe.defId, foeScale: foe.scale, tint: foe.tint && !ART_SHAPE[foe.art]?.noTint ? tintFor(foe.tint) : null, scale: Math.min(1.5, foe.scale || 1) * (ART_SHAPE[foe.art]?.scale || 1), height: ART_SHAPE[foe.art]?.height || 1.95, hover: ART_SHAPE[foe.art]?.hover, ghost: ART_SHAPE[foe.art]?.ghost });
      unit.foe = foe;
      return unit;
    }

    // Foes stand in a shallow arc, spread in depth so each one is easy to read and pick.
    placeFoes(instant) {
      const foes = this.battle.foes.filter((foe) => foe.currentHp > 0 && this.units[`foe${foe.slot}`]);
      const layouts = { 1: [[2.7, 0.1]], 2: [[1.25, 1.0], [3.15, -0.8]], 3: [[1.5, 1.5], [3.25, 0.15], [0.45, -1.7]], 4: [[1.5, 1.65], [3.35, 0.9], [0.55, -1.15], [2.6, -1.8]] };
      const layout = layouts[Math.min(4, foes.length)] || layouts[4];
      foes.forEach((foe, index) => {
        const unit = this.units[`foe${foe.slot}`];
        const [x, z] = layout[index];
        unit.home.set(x * squeezeX(), 0, z);
        if (instant) unit.root.position.copy(unit.home);
        else if (!unit.busy) unit.moveTo(unit.home.clone(), 0.5);
      });
    }

    unitFor(side, slot) {
      return side === "hero" ? this.hero : this.units[`foe${slot}`] || this.hero;
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (this.width === width && this.height === height) return;
      this.width = width;
      this.height = height;
      renderer.setSize(width, height, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const scale = height * renderer.getPixelRatio() * 1.7;
      this.glow.mesh.material.uniforms.scale.value = scale;
      this.puffs.mesh.material.uniforms.scale.value = scale;
    }

    // ---- effects ----
    burst(point, hex, count = 24, power = 3, size = 0.12, life = 0.55) {
      const tint = color(hex);
      for (let i = 0; i < count; i += 1) {
        const a = rand(0, 6.28);
        const b = rand(-1, 1);
        const c = Math.sqrt(1 - b * b);
        const v = power * rand(0.35, 1);
        this.glow.spawn(point.x, point.y, point.z, Math.cos(a) * c * v, b * v + 0.6, Math.sin(a) * c * v, size * rand(0.6, 1.3), life * rand(0.6, 1.2), tint, 3);
      }
    }

    smoke(point, hex = "#6a6a72", count = 22, spread = 0.6) {
      const tint = color(hex);
      for (let i = 0; i < count; i += 1) {
        this.puffs.spawn(point.x + rand(-spread, spread), point.y + rand(0, spread * 1.5), point.z + rand(-spread, spread) * 0.6, rand(-0.5, 0.5), rand(0.2, 0.9), rand(-0.3, 0.3), this.painted ? rand(0.16, 0.34) : rand(0.4, 0.8), this.painted ? rand(0.4, 0.7) : rand(0.7, 1.3), tint, 1.4, 1.4);
      }
    }

    light(point, hex, power = 40, seconds = 0.2) {
      this.impactLight.position.copy(point);
      this.impactLight.position.y += 0.5;
      this.impactLight.color.set(hex);
      this.impactLight.intensity = power;
      this.lightDecay = power / seconds;
    }

    // A bright crescent where the blade passes.
    slash(point, hex, facing, big = false) {
      const inner = big ? 0.62 : 0.5;
      const geo = new T.RingGeometry(inner, inner + (big ? 0.62 : 0.42), 28, 1, -1.15, 2.3);
      const material = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
        uniforms: { tint: { value: color(hex) }, t: { value: 0 } },
        vertexShader: "varying vec2 vUv; varying vec3 p; void main(){ vUv = uv; p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
        fragmentShader: `uniform vec3 tint; uniform float t; varying vec3 p;
          void main(){ float ang = atan(p.y, p.x) / 1.15; float front = 1. - smoothstep(-1. + t * 2.6 - .5, -1. + t * 2.6, ang) * 0.; float r = length(p);
            float edge = smoothstep(.0, .25, abs(ang - 1.) ) ; float fade = (1. - t) * (1. - abs(ang)) ; gl_FragColor = vec4((tint + .35) * fade * 1.15, fade); }`
      });
      const mesh = new T.Mesh(geo, material);
      mesh.position.copy(point);
      mesh.rotation.set(rand(-0.4, 0.4), facing > 0 ? 0.25 : -0.25 + Math.PI, rand(-1.1, 1.1));
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      this.fxItems.push({ age: 0, duration: 0.2, update: (t) => { material.uniforms.t.value = t; mesh.scale.setScalar(0.85 + t * 0.4); }, end: () => { this.scene.remove(mesh); geo.dispose(); material.dispose(); } });
    }

    // A flat shock ring on the ground.
    shock(point, hex, radius = 2, seconds = 0.45) {
      const geo = new T.RingGeometry(0.82, 1, 44);
      const material = new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(2), transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const mesh = new T.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(point.x, 0.05, point.z);
      this.scene.add(mesh);
      this.fxItems.push({ age: 0, duration: seconds, update: (t) => { mesh.scale.setScalar(0.2 + smooth(t) * radius); material.opacity = (1 - t) * 0.85; }, end: () => { this.scene.remove(mesh); geo.dispose(); material.dispose(); } });
    }

    // A glowing shard flying to the target, trailing sparks.
    projectile(from, to, hex, seconds = 0.26, size = 0.14) {
      const tint = color(hex);
      const mesh = new T.Sprite(new T.SpriteMaterial({ map: softDot(), color: tint.clone().multiplyScalar(1.5), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      mesh.scale.setScalar(size * 5);
      mesh.position.copy(from);
      this.scene.add(mesh);
      const arc = from.distanceTo(to) * 0.08;
      return new Promise((resolve) => {
        this.fxItems.push({
          age: 0, duration: seconds,
          update: (t, dt) => {
            mesh.position.lerpVectors(from, to, t);
            mesh.position.y += Math.sin(t * Math.PI) * arc;
            for (let i = 0; i < 3; i += 1) this.glow.spawn(mesh.position.x, mesh.position.y, mesh.position.z, rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4), size * rand(0.5, 1.1), 0.3, tint);
          },
          end: () => { this.scene.remove(mesh); mesh.material.dispose(); resolve(); }
        });
      });
    }

    // An arrow is thin and fast and points where it flies.
    arrow(from, to, hex, seconds) {
      const group = new T.Group();
      const shaft = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.74, 5), new T.MeshBasicMaterial({ color: "#f4e6c0" }));
      const head = new T.Mesh(new T.ConeGeometry(0.035, 0.12, 5), new T.MeshBasicMaterial({ color: color(hex).multiplyScalar(2) }));
      head.position.y = 0.42;
      group.add(shaft, head);
      group.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      group.position.copy(from);
      this.scene.add(group);
      const tint = color(hex);
      return new Promise((resolve) => {
        this.fxItems.push({
          age: 0, duration: seconds,
          update: (t) => {
            group.position.lerpVectors(from, to, t);
            this.glow.spawn(group.position.x, group.position.y, group.position.z, 0, 0, 0, 0.05, 0.14, tint);
          },
          end: () => { this.scene.remove(group); shaft.geometry.dispose(); shaft.material.dispose(); head.geometry.dispose(); head.material.dispose(); resolve(); }
        });
      });
    }

    pause(seconds) {
      this.hitStop = Math.max(this.hitStop, seconds);
    }

    shake(amount) {
      this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    screenFlash(power = 0.12) {
      this.flashLevel = Math.max(this.flashLevel, power);
    }

    // A target sign above a marked fighter.
    setReticle(unit, on) {
      if (!on) { unit.root.remove(unit.reticle); unit.reticle.geometry.dispose(); unit.reticle.material.dispose(); unit.reticle = null; return; }
      unit.reticle = new T.Mesh(new T.RingGeometry(0.2, 0.25, 4, 1), new T.MeshBasicMaterial({ color: color("#ffd25a").multiplyScalar(1.6), transparent: true, side: T.DoubleSide, depthWrite: false }));
      unit.reticle.position.y = unit.height * unit.scale + 0.42;
      unit.root.add(unit.reticle);
    }

    // A frozen fighter stands inside jagged ice.
    setIceShell(unit, on) {
      if (!on) {
        unit.iceShell.traverse((node) => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
        unit.root.remove(unit.iceShell);
        unit.iceShell = null;
        this.burst(unit.chest(), "#d8f6ff", 24, 3, 0.09, 0.5);
        return;
      }
      unit.iceShell = new T.Group();
      const h = unit.height * unit.scale;
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2;
        const tall = h * rand(0.45, 0.95);
        const spike = new T.Mesh(new T.ConeGeometry(rand(0.13, 0.26), tall, 5), new T.MeshStandardMaterial({ color: "#bfeaff", transparent: true, opacity: 0.62, roughness: 0.25, flatShading: true, emissive: color("#6fc0ee"), emissiveIntensity: 0.55, depthWrite: false }));
        spike.position.set(Math.cos(a) * 0.36, tall / 2 - 0.05, Math.sin(a) * 0.2 + 0.1);
        spike.rotation.set(rand(-0.2, 0.2), rand(0, 3), -Math.cos(a) * 0.22);
        unit.iceShell.add(spike);
      }
      unit.root.add(unit.iceShell);
    }

    syncStatus(snap) {
      const apply = (unit, effects) => {
        if (!unit) return;
        unit.status = (effects || []).map((effect) => effect.id).filter((id) => STATUS_FX[id]);
        const hasShield = (effects || []).some((effect) => effect.id === "shield");
        if (hasShield && !unit.bubble) {
          const bubble = new T.Mesh(new T.SphereGeometry(unit.height * 0.72 * unit.scale, 24, 16), new T.ShaderMaterial({
            transparent: true, depthWrite: false, blending: T.AdditiveBlending,
            vertexShader: "varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
            fragmentShader: "varying vec3 n; varying vec3 v; void main(){ float f = pow(max(0., 1. - abs(dot(n, v))), 2.4); gl_FragColor = vec4(vec3(1., .86, .5) * f * 1.1, f); }"
          }));
          bubble.position.y = unit.height * 0.5 * unit.scale;
          unit.root.add(bubble);
          unit.bubble = bubble;
        } else if (!hasShield && unit.bubble) {
          unit.root.remove(unit.bubble);
          unit.bubble.geometry.dispose();
          unit.bubble.material.dispose();
          unit.bubble = null;
        }
        unit.stunned = (effects || []).some((effect) => effect.id === "stun" || effect.id === "freeze");
        const look = BODY_STATUS.find((entry) => (effects || []).some((effect) => effect.id === entry.id));
        unit.statusRim = look ? color(look.color) : null;
        if (unit.uniforms.tintColor) {
          unit.tintGoal = look ? look.tint : 0;
          if (look) unit.uniforms.tintColor.value.set(look.color);
        }
        const marked = (effects || []).some((effect) => effect.id === "mark");
        if (marked !== Boolean(unit.reticle)) this.setReticle(unit, marked);
        const frozen = (effects || []).some((effect) => effect.id === "freeze");
        if (frozen !== Boolean(unit.iceShell)) this.setIceShell(unit, frozen);
      };
      apply(this.hero, snap.hero.effects);
      (snap.foes || []).forEach((entry) => apply(this.units[`foe${entry.slot}`], entry.effects));
      const hidden = (snap.hero.gauges || []).some((gauge) => gauge.id === "core_assassin" && gauge.value >= 1);
      this.hero.setGhost(hidden ? 0.62 : 0);
    }

    // ---- frame ----
    update(realDt) {
      const dt = realDt * speed();
      this.time += dt;
      let unitDt = dt;
      if (this.hitStop > 0) {
        this.hitStop -= realDt;
        unitDt = dt * 0.06;
      }
      Object.values(this.units).forEach((unit) => {
        unit.update(unitDt);
        if (!unit.alive) return;
        unit.status.forEach((id) => {
          const fx = STATUS_FX[id];
          unit.emitTimers[id] = (unit.emitTimers[id] || 0) + dt * fx.rate;
          while (unit.emitTimers[id] > 1) {
            unit.emitTimers[id] -= 1;
            const h = rand(0.15, unit.height) * unit.scale;
            const a = rand(0, 6.28);
            this.glow.spawn(unit.root.position.x + Math.cos(a) * fx.spread * unit.scale, h, unit.root.position.z + Math.sin(a) * fx.spread * unit.scale, 0, fx.rise, 0, fx.size, rand(0.4, 0.9), color(fx.color), 0.4);
          }
        });
        if (unit.stunned) {
          const a = this.time * 5;
          for (let i = 0; i < 2; i += 1) {
            const b = a + i * Math.PI;
            this.glow.spawn(unit.root.position.x + Math.cos(b) * 0.32, (unit.height + 0.1) * unit.scale, unit.root.position.z + Math.sin(b) * 0.32, 0, 0, 0, 0.1, 0.2, color("#ffe27a"));
          }
        }
        if (unit === this.hero && unit.ghostTarget > 0 && Math.random() < dt * 12) {
          this.puffs.spawn(unit.root.position.x + rand(-0.4, 0.4), rand(0.1, 1.5), unit.root.position.z + rand(-0.3, 0.3), 0, rand(0.1, 0.4), 0, rand(0.28, 0.5), rand(0.6, 1), color("#37374a"), 1, 1.2);
        }
      });
      this.fxItems = this.fxItems.filter((item) => {
        item.age += dt;
        const t = Math.min(1, item.age / item.duration);
        item.update(t, dt);
        if (t >= 1) { item.end?.(); return false; }
        return true;
      });
      this.glow.update(dt);
      this.puffs.update(dt);
      this.motes.forEach((mote, i) => {
        mote.y += this.config.motes.rise ? dt * 0.35 * mote.s : Math.sin(this.time * 0.6 + mote.p) * dt * 0.08;
        if (mote.y > 6) mote.y = 0.1;
        mote.x += Math.sin(this.time * 0.3 + mote.p) * dt * 0.12 * mote.s;
        this.motePos[i * 3] = mote.x;
        this.motePos[i * 3 + 1] = mote.y;
        this.motePos[i * 3 + 2] = mote.z;
      });
      this.moteMesh.geometry.attributes.position.needsUpdate = true;
      this.moveWeather(dt);
      if (this.impactLight.intensity > 0) this.impactLight.intensity = Math.max(0, this.impactLight.intensity - this.lightDecay * realDt);

      // Target marker follows the chosen foe.
      const alive = this.battle.foes.filter((foe) => foe.currentHp > 0);
      const target = this.units[`foe${this.battle.focus ?? this.battle.enemy?.slot}`];
      const showTarget = target && target.alive && !this.battle.over;
      this.targetRing.visible = Boolean(showTarget);
      if (showTarget) {
        this.targetRing.position.x += (target.root.position.x - this.targetRing.position.x) * Math.min(1, dt * 16);
        this.targetRing.position.z += (target.root.position.z - this.targetRing.position.z) * Math.min(1, dt * 16);
        const ringScale = (target.height > 1.5 ? 1 : 1.25) * target.scale;
        this.targetRing.scale.setScalar(ringScale);
        this.targetRing.material.uniforms.time.value = this.time;
        this.targetRing.material.uniforms.power.value = alive.length > 1 ? 1 : 0.45;
      }
      const hover = this.hoverSlot !== undefined && this.hoverSlot !== null ? this.units[`foe${this.hoverSlot}`] : null;
      this.hoverRing.visible = Boolean(hover && hover.alive && hover !== target);
      if (this.hoverRing.visible) {
        this.hoverRing.position.x = hover.root.position.x;
        this.hoverRing.position.z = hover.root.position.z;
        this.hoverRing.material.uniforms.time.value = this.time;
        this.hoverRing.scale.setScalar((hover.height > 1.5 ? 1 : 1.25) * hover.scale);
      }
      Object.values(this.units).forEach((unit) => {
        const statusGlow = unit.statusRim ? 0.85 + Math.sin(this.time * 4) * 0.25 : 0;
        unit.uniforms.rimPower.value += (Math.max(unit === hover ? 1.1 : 0.42, statusGlow) - unit.uniforms.rimPower.value) * Math.min(1, dt * 12);
        unit.uniforms.rimColor.value.lerp(unit.statusRim || (unit.side === "hero" ? HERO_RIM : FOE_RIM), Math.min(1, dt * 6));
        if (unit.reticle) { unit.reticle.rotation.z = this.time * 1.6; unit.reticle.position.y = unit.height * unit.scale + 0.42 + Math.sin(this.time * 3) * 0.04; }
      });

      // Camera: settled wide shot, leans toward the action, shakes on heavy hits.
      this.focus.lerp(this.focusGoal, Math.min(1, dt * 3.2));
      this.zoom += (this.zoomGoal - this.zoom) * Math.min(1, dt * 3);
      const portrait = Math.max(0, 1.5 - camera.aspect);
      const distance = 9.6 - this.zoom + portrait * 11;
      const sway = Math.sin(this.time * 0.25) * (this.painted ? 0.32 : 0.14);
      this.shakeAmount *= Math.max(0, 1 - realDt * 7);
      const sx = (Math.random() - 0.5) * this.shakeAmount;
      const sy = (Math.random() - 0.5) * this.shakeAmount;
      camera.position.set(this.focus.x * 0.5 + sway + sx, 2.35 + sy + portrait, distance);
      camera.lookAt(this.focus.x * 0.62 + sx * 0.4, 1.2 + sy * 0.4, 0);
      if (this.backdrop) {
        // The painting always fills the frame and drifts a little slower than the fighters.
        // The far land barely moves, the middle moves more, the near fringe most: that is what gives depth.
        const reach = camera.position.z + 26;
        const viewH = 2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * reach;
        const fit = Math.max(viewH * 1.2, viewH * camera.aspect * 1.2 / 1.5);
        this.backdrop.scale.set(fit * 1.5, fit, 1);
        this.backdrop.position.set(this.focus.x * 0.4, fit * 0.32 - 3.2, -26);
        if (this.foreLayer) {
          const near = 3.7;
          const nearH = 2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * near;
          const nearW = Math.max(nearH * camera.aspect * 1.14, nearH * 1.14 * 1.5);
          this.foreLayer.scale.set(nearW, nearW / 1.5, 1);
          const lookY = camera.position.y + (1.2 - camera.position.y) * (near / camera.position.z);
          this.foreLayer.position.set(camera.position.x * 0.96, lookY - nearH / 2 - 0.02 + nearW / 3, camera.position.z - near);
        }
      }
      this.flashLevel *= Math.max(0, 1 - realDt * 10);
      composer.passes[3].uniforms.flash.value = this.flashLevel;
      this.placeAnchors();
    }

    // The HTML layer (intents, floating numbers, click areas) stays glued to the 3D bodies.
    placeAnchors() {
      const plates = [];
      const place = (id, unit) => {
        const el = document.getElementById(id);
        if (!el || !unit) return;
        const foot = unit.root.position.clone().project(camera);
        const head = unit.root.position.clone();
        head.y += unit.height * unit.scale;
        head.project(camera);
        const x = (foot.x * 0.5 + 0.5) * this.width;
        const yFoot = (-foot.y * 0.5 + 0.5) * this.height;
        const yHead = (-head.y * 0.5 + 0.5) * this.height;
        const h = Math.max(30, yFoot - yHead);
        const w = h * (unit.height < 1.5 ? 1.5 : 0.62);
        el.style.transform = `translate(${x - w / 2}px, ${yFoot - h}px)`;
        const wrap = el.querySelector(".sprite-wrap");
        if (wrap) { wrap.style.width = `${w}px`; wrap.style.height = `${h}px`; }
        if (unit.side !== "hero") {
          const plateEl = document.getElementById(`foePlate${unit.slot}`);
          plates.push({ slot: unit.slot, x: clamp(x - 86, 6, this.width - 178), y: Math.max(112, yHead - (plateEl?.offsetHeight || 72) - 6), h: plateEl?.offsetHeight || 72, anchorX: x - w / 2, anchorY: yFoot - h });
        }
      };
      place("fHero", this.hero);
      this.battle.foes.forEach((foe) => { if (this.units[`foe${foe.slot}`]?.alive !== false) place(`fFoe${foe.slot}`, this.units[`foe${foe.slot}`]); });
      // Plates must never cover each other: they slide apart along the screen.
      const plateWidth = 178;
      
      plates.sort((a, b) => a.x - b.x);
      for (let pass = 0; pass < 3; pass += 1) {
        for (let i = 1; i < plates.length; i += 1) {
          for (let j = 0; j < i; j += 1) {
            const a = plates[j];
            const b = plates[i];
            if (a.y + a.h + 34 <= b.y || b.y + b.h + 34 <= a.y || b.x - a.x >= plateWidth) continue;
            const push = (plateWidth - (b.x - a.x)) / 2;
            a.x -= push;
            b.x += push;
          }
        }
        plates.forEach((p) => { p.x = clamp(p.x, 6, this.width - plateWidth); });
      }
      App.plateAt = App.plateAt || {};
      plates.forEach((p) => {
        const transform = `transform: translate(${p.x}px, ${p.y}px)`;
        App.plateAt[p.slot] = transform;
        const plate = document.getElementById(`foePlate${p.slot}`);
        if (plate) plate.style.cssText = transform;
        // The intent stands on top of its plate, however tall the plate has grown.
        const intent = document.getElementById(`intent${p.slot}`);
        if (intent && intent.offsetHeight) {
          const top = Math.max(64, p.y - intent.offsetHeight - 4);
          intent.style.setProperty("top", `${top - p.anchorY}px`, "important");
          intent.style.bottom = "auto";
          intent.style.left = `${p.x + plateWidth / 2 - p.anchorX}px`;
          intent.style.right = "auto";
          intent.style.transform = "translateX(-50%)";
        }
      });
    }

    // Tints every painted layer, the fog and the lights by the hour of the fight.
    applyMood() {
      if (this.mood.time === undefined) return;
      const { tint, power } = dayLight(this.mood.time);
      this.scene.traverse((node) => {
        const shade = node.material?.uniforms?.shade;
        if (shade) shade.value.multiply(tint).multiplyScalar(power);
        if (node.isDirectionalLight) { node.color.multiply(tint); node.intensity *= power; }
        if (node.isHemisphereLight) node.intensity *= 0.55 + power * 0.45;
      });
      if (this.scene.fog) this.scene.fog.color.multiply(tint).multiplyScalar(0.5 + power * 0.5);
    }

    buildWeather(kind) {
      const cfg = WEATHER[kind];
      if (!cfg) return;
      this.weather = { cfg, drops: [] };
      for (let i = 0; i < cfg.count; i += 1) this.weather.drops.push({ x: rand(-12, 12), y: cfg.low ? rand(0.2, 1.4) : rand(0, 8), z: rand(cfg.low ? -5 : -7, cfg.low ? 2 : 5), p: rand(0, 6.28), s: rand(0.7, 1.3) });
      const geo = new T.BufferGeometry();
      const per = cfg.streak ? 6 : 3;
      this.weather.pos = new Float32Array(cfg.count * per);
      geo.setAttribute("position", new T.BufferAttribute(this.weather.pos, 3));
      const mesh = cfg.streak
        ? new T.LineSegments(geo, new T.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.opacity, depthWrite: false, fog: true }))
        : new T.Points(geo, new T.PointsMaterial({ map: softDot(), color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity, depthWrite: false, blending: cfg.glow ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true }));
      mesh.frustumCulled = false;
      mesh.renderOrder = cfg.low ? -5 : 30;
      this.weather.mesh = mesh;
      this.scene.add(mesh);
      this.moveWeather(0);
    }

    moveWeather(dt) {
      const w = this.weather;
      if (!w) return;
      const { cfg, pos } = w;
      w.drops.forEach((d, i) => {
        d.y -= cfg.fall * d.s * dt;
        d.x += (cfg.wind + (cfg.sway ? Math.sin((this.time || 0) * 1.3 + d.p) * cfg.sway : 0)) * dt;
        if (d.y < 0) { d.y = 8; d.x = rand(-12, 12); }
        if (d.x < -13) d.x += 26;
        if (d.x > 13) d.x -= 26;
        if (cfg.streak) {
          pos.set([d.x, d.y, d.z, d.x - cfg.wind * 0.03, d.y + cfg.streak, d.z], i * 6);
        } else pos.set([d.x, d.y, d.z], i * 3);
      });
      w.mesh.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
      this.scene.traverse((node) => {
        node.geometry?.dispose();
        [].concat(node.material || []).forEach((material) => material.dispose());
      });
      (this.ownTextures || []).forEach((texture) => texture.dispose());
    }

    render() {
      composer.passes[0].scene = this.scene;
      composer.passes[0].camera = camera;
      composer.render();
    }
  }

  // On a tall phone screen the fighters stand closer, otherwise they leave the frame.
  function squeezeX() {
    return camera && camera.aspect < 1 ? 0.62 : 1;
  }

  // A soft glowing dot with a hot centre, for bolts and orbs.
  let softDotTexture = null;
  function softDot() {
    if (softDotTexture) return softDotTexture;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const paint = canvas.getContext("2d");
    const fill = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
    fill.addColorStop(0, "rgba(255,255,255,1)");
    fill.addColorStop(0.18, "rgba(255,255,255,0.85)");
    fill.addColorStop(0.45, "rgba(255,255,255,0.28)");
    fill.addColorStop(1, "rgba(255,255,255,0)");
    paint.fillStyle = fill;
    paint.fillRect(0, 0, 64, 64);
    softDotTexture = new T.CanvasTexture(canvas);
    return softDotTexture;
  }

  function tintFor(hex) {
    // Tint keeps some of the model's own shading range instead of flooding it with one colour.
    const c = new T.Color(hex);
    return c.multiplyScalar(0.92);
  }

  let lastTick = 0;

  function tick(draw, limit) {
    if (!stage || typeof App === "undefined" || App.screen !== "battle") return;
    const host = document.getElementById("stage");
    if (!host) return;
    if (renderer.domElement.parentElement !== host) host.prepend(renderer.domElement);
    stage.host = host;
    lastTick = performance.now();
    stage.resize();
    stage.update(Math.min(limit, clock.getDelta()));
    if (draw) stage.render();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    tick(true, 0.05);
  }

  // A hidden tab stops animation frames. The fight keeps its pace, so its events never wait forever.
  setInterval(() => { if (performance.now() - lastTick > 200) tick(false, 0.25); }, 100);

  function mount(host, battle, regionId, mood) {
    initRenderer();
    const box = host.getBoundingClientRect();
    camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
    stage?.dispose();
    stage = new Stage(host, battle, regionId, mood);
    host.prepend(renderer.domElement);
    clock.getDelta();
    stage.resize();
    stage.update(0.001);
    if (!rafId) loop();
    window.__stage = stage;
    return stage;
  }

  return { preload, supports, mount, IMPACT, ELEMENT, FPS, paintedFight, wait, get memory() { return renderer?.info.memory; }, get current() { return stage; }, get isReady() { return ready; } };
})();

Stage3D.preload();
