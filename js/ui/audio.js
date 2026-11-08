// The game's sound: recorded effects with variation, a small room echo, music and ambience that follow the screen.
// If a file cannot be loaded (for example the game was opened as a plain file), the old synthesized sounds still play.
const GameAudio = (() => {
  const INDEX = window.FORGE_AUDIO || { bank: {}, tracks: {} };
  const buffers = {};
  const lastPick = {};
  let ctx = null;
  let master = null;
  let dry = null;
  let wet = null;
  let unlocked = false;
  let queueStarted = false;
  const settings = { sfx: 0.8, music: 0.5, ambience: 0.3, enabled: true };

  // Named game sounds and the layers they are built from. rate: playback speed range, delay in seconds, duck: how far music dips.
  const RECIPES = {
    click: [{ g: "ui_click" }], select: [{ g: "ui_select" }], error: [{ g: "ui_error" }], coin: [{ g: "coin" }], loot: [{ g: "loot" }, { g: "coin", gain: 0.5, delay: 0.06 }],
    anvil: [{ g: "anvil", gain: 0.8 }], guard: [{ g: "guard" }], miss: [{ g: "swing", gain: 0.7, rate: [1.1, 1.3] }],
    hit: [{ g: "hit_flesh" }], crit: [{ g: "crit", gain: 0.85 }, { g: "hit_flesh", gain: 0.8, rate: [0.8, 0.92] }], heavy: [{ g: "hit_heavy" }, { g: "land", gain: 0.7, rate: [0.68, 0.8] }],
    cast: [{ g: "cast" }], fire: [{ g: "fire" }], frost: [{ g: "frost" }], heal: [{ g: "heal" }], debuff: [{ g: "debuff" }], death: [{ g: "death", gain: 0.9 }, { g: "land", gain: 0.6, delay: 0.3, rate: [0.8, 0.9] }],
    win: [{ g: "win", exact: true }], lose: [{ g: "lose", exact: true }], level: [{ g: "level", exact: true }, { g: "holy", gain: 0.45, delay: 0.1 }]
  };
  const DUCK = { heavy: 0.55, crit: 0.72, death: 0.55, air: 0.6, earth: 0.7, hit_heavy: 0.6, land: 0.75, win: 0.3, lose: 0.3, level: 0.5 };

  function roomImpulse(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        smooth += ((Math.random() * 2 - 1) - smooth) * 0.34;
        data[i] = smooth * Math.pow(1 - t, 3.2);
      }
    }
    return impulse;
  }

  function ensure() {
    if (ctx) return ctx;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = settings.sfx;
    master.connect(limiter);
    dry = ctx.createGain();
    dry.connect(master);
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(1.05);
    wet = ctx.createGain();
    wet.gain.value = 0.14;
    wet.connect(reverb);
    reverb.connect(master);
    return ctx;
  }

  async function loadFile(name) {
    if (name in buffers) return buffers[name];
    buffers[name] = null;
    try {
      if (ForgePack.offline) await ForgePack.load("audio");
      const response = await fetch(ForgePack.offline ? window.FORGE_PACK?.[`audio/${name}`] : `assets/audio/${name}`);
      if (!response.ok) return null;
      buffers[name] = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      buffers[name] = null;
    }
    return buffers[name];
  }

  // Loads the bank bit by bit so the game never stalls.
  async function preloadAll() {
    if (queueStarted) return;
    queueStarted = true;
    const names = Object.values(INDEX.bank).flat();
    for (let i = 0; i < names.length; i += 8) await Promise.all(names.slice(i, i + 8).map(loadFile));
  }

  function pickFrom(group) {
    const files = INDEX.bank[group];
    if (!files?.length) return null;
    const ready = files.filter((name) => buffers[name]);
    if (!ready.length) { loadFile(files[0]); return null; }
    let pick = ready[Math.floor(Math.random() * ready.length)];
    // Never the same take twice in a row.
    if (pick === lastPick[group] && ready.length > 1) pick = ready[(ready.indexOf(pick) + 1) % ready.length];
    lastPick[group] = pick;
    return buffers[pick];
  }

  function fire(group, { gain = 1, rate = null, delay = 0, exact = false } = {}) {
    const buffer = pickFrom(group);
    if (!buffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const [low, high] = rate || [0.93, 1.07];
    source.playbackRate.value = exact ? 1 : low + Math.random() * (high - low);
    const amp = ctx.createGain();
    amp.gain.value = gain * (exact ? 1 : 0.86 + Math.random() * 0.14);
    source.connect(amp);
    amp.connect(dry);
    if (!group.startsWith("ui_")) amp.connect(wet);
    source.start(ctx.currentTime + delay);
    return true;
  }

  // Plays a named sound or a bank group. False means it could not, and the caller may use the old synth.
  function play(name, options = {}) {
    if (!settings.enabled || !ensure() || !unlocked) return false;
    if (ctx.state === "suspended") ctx.resume();
    const layers = RECIPES[name] || (INDEX.bank[name] ? [{ g: name }] : null);
    if (!layers) return false;
    let any = false;
    layers.forEach((layer) => { any = fire(layer.g, { ...layer, gain: (layer.gain ?? 1) * (options.gain ?? 1), delay: (layer.delay ?? 0) + (options.delay ?? 0), rate: options.rate || layer.rate, exact: layer.exact }) || any; });
    if (any && DUCK[name]) duck(DUCK[name]);
    return any;
  }

  // ---------- music and ambience: streamed, faded by hand ----------
  const lanes = { music: { el: null, name: null, level: 0, old: [] }, ambience: { el: null, name: null, level: 0, old: [] }, ambience2: { el: null, name: null, level: 0, old: [] } };
  let duckLevel = 1;
  let duckTimer = 0;

  function duck(amount) {
    duckLevel = Math.min(duckLevel, amount);
    duckTimer = 0.14;
  }

  function laneVolume(laneName) {
    if (!settings.enabled) return 0;
    return laneName === "music" ? settings.music * duckLevel : settings.ambience;
  }

  function setLane(laneName, track) {
    const lane = lanes[laneName];
    if (lane.name === track) return;
    if (lane.el) lane.old.push(lane.el);
    lane.el = null;
    lane.name = track;
    lane.level = 0;
    if (!track || !INDEX.tracks[track] || !unlocked) { if (!unlocked) lane.name = null; return; }
    const el = new Audio(`assets/audio/${INDEX.tracks[track]}`);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => { lane.name = null; });
    lane.el = el;
  }

  setInterval(syncScene, 1000);
  setInterval(() => {
    const dt = 0.05;
    duckTimer -= dt;
    if (duckTimer <= 0) duckLevel += (1 - duckLevel) * 0.05;
    Object.entries(lanes).forEach(([name, lane]) => {
      if (lane.el) {
        lane.level = Math.min(1, lane.level + dt / 1.6);
        lane.el.volume = Math.min(1, lane.level * laneVolume(name === "music" ? "music" : "ambience"));
      }
      lane.old = lane.old.filter((el) => {
        el.volume = Math.max(0, el.volume - dt / 1.2);
        if (el.volume > 0.003) return true;
        el.pause();
        el.src = "";
        return false;
      });
    });
  }, 50);

  const REGION_AMBIENCE = { thicket: ["amb_forest", "amb_wind"], ashlands: ["amb_fire", "amb_wind"], ruins: ["amb_dungeon", null], limit: ["amb_wind", "amb_dungeon"] };
  const REGION_ECHO = { thicket: 0.1, ashlands: 0.12, ruins: 0.26, limit: 0.3 };
  const BATTLE_TRACKS = ["music_battle_a", "music_battle_b", "music_battle_d"];
  let battleTrack = null;
  let battleNonce = null;

  // Chooses what plays from the state of the game. Safe to call on every screen change.
  function syncScene() {
    if (!unlocked || typeof App === "undefined") return;
    const screen = App.screen;
    let music = "music_camp";
    let ambience = ["amb_fire", null];
    if (screen === "title" || screen === "create" || screen === "roster") {
      music = "music_cave";
      ambience = [null, null];
    } else if (screen === "battle" && App.fight) {
      const boss = App.fight.mode === "guardian" || App.battle?.foes?.some((foe) => foe.isBoss || foe.isGuardian);
      if (battleNonce !== App.fight.nonce) {
        battleNonce = App.fight.nonce;
        battleTrack = BATTLE_TRACKS[Math.floor(Math.random() * BATTLE_TRACKS.length)];
      }
      music = boss ? "music_boss" : battleTrack;
      ambience = REGION_AMBIENCE[App.fight.regionId] || [null, null];
      if (wet) wet.gain.value = REGION_ECHO[App.fight.regionId] ?? 0.14;
    } else if (App.hero?.expedition) {
      music = "music_town";
      ambience = REGION_AMBIENCE[App.hero.expedition.regionId] || [null, null];
    }
    setLane("music", music);
    setLane("ambience", ambience[0]);
    setLane("ambience2", ambience[1]);
  }

  function unlock() {
    if (unlocked) return;
    if (!ensure()) return;
    unlocked = true;
    if (ctx.state === "suspended") ctx.resume();
    preloadAll();
    syncScene();
  }
  ["pointerdown", "keydown"].forEach((type) => window.addEventListener(type, unlock, { capture: true }));
  document.addEventListener("visibilitychange", () => {
    Object.values(lanes).forEach((lane) => { if (!lane.el) return; if (document.hidden) lane.el.pause(); else lane.el.play().catch(() => {}); });
  });

  function configure({ enabled, sfx, music, ambience }) {
    if (enabled !== undefined) settings.enabled = enabled;
    if (sfx !== undefined) settings.sfx = sfx;
    if (music !== undefined) settings.music = music;
    if (ambience !== undefined) settings.ambience = ambience;
    if (master) master.gain.value = settings.sfx;
  }

  return { play, syncScene, configure, unlock, get loaded() { return Object.values(buffers).filter(Boolean).length; }, get total() { return Object.values(INDEX.bank).flat().length; }, get context() { return ctx; }, lanes };
})();

// All older calls keep working: recordings first, the synth as a fallback.
const synthPlay = SFX.play.bind(SFX);
SFX.play = function play(name, options) {
  if (!this.enabled) return;
  if (!GameAudio.play(name, options)) {
    if (RECORDED_ONLY.has(name)) return;
    synthPlay(name);
  }
};
// Sounds with no synth version simply stay silent if their file is missing.
const RECORDED_ONLY = new Set(Object.keys(window.FORGE_AUDIO?.bank || {}).filter((name) => !["heal", "fire", "frost", "cast", "debuff", "guard", "coin", "death", "win", "lose", "level", "loot", "anvil"].includes(name)));
