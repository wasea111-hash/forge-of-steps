// Scene painter, particle system and synthesised sound. No external assets, so the game runs from a plain folder.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SCENES = {
  thicket: { sky: ["#0e1a24", "#1e3a3c", "#3f5f48"], glow: "#b6d98a", far: "#1b2f30", mid: "#142427", near: "#0b1716", ground: ["#1b2a1c", "#0a120b"], ambient: "leaf" },
  ashlands: { sky: ["#170b0a", "#3c1610", "#8a3a1a"], glow: "#ff9a4a", far: "#2d1712", mid: "#1f0f0c", near: "#120907", ground: ["#2a1812", "#0e0705"], ambient: "ember" },
  ruins: { sky: ["#0d1020", "#1e2748", "#47558a"], glow: "#a9c4ff", far: "#1b2140", mid: "#13182e", near: "#0b0e1e", ground: ["#1c2030", "#0a0c15"], ambient: "rune" },
  limit: { sky: ["#07040f", "#1a0f3a", "#4a2a7a"], glow: "#d3a6ff", far: "#180f33", mid: "#100a24", near: "#080516", ground: ["#17102a", "#06040e"], ambient: "star" },
  forge: { sky: ["#0c0806", "#21110a", "#4d2410"], glow: "#ff8c3a", far: "#1c100a", mid: "#140b07", near: "#0c0705", ground: ["#1d120c", "#080504"], ambient: "ember" }
};
const ZONE_TINTS = { white: "#d8dfe8", green: "#74d68a", orange: "#ffa54a", purple: "#b67dff", red: "#ff4d4d" };

function ridge(ctx, w, h, baseY, amp, color, rnd, roughness = 7) {
  const points = [];
  const count = 14;
  for (let i = 0; i <= count; i += 1) points.push([(i / count) * w, baseY - rnd() * amp]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  points.forEach(([x, y], i) => {
    if (!i) { ctx.lineTo(x, y); return; }
    const [px, py] = points[i - 1];
    for (let step = 1; step <= roughness; step += 1) {
      const t = step / roughness;
      ctx.lineTo(px + (x - px) * t, py + (y - py) * t + (rnd() - 0.5) * amp * 0.09);
    }
  });
  ctx.lineTo(w, h);
  ctx.fill();
}

function drawTree(ctx, x, base, height, color, rnd) {
  ctx.fillStyle = color;
  ctx.fillRect(x - height * 0.025, base - height * 0.4, height * 0.05, height * 0.4);
  for (let i = 0; i < 4; i += 1) {
    const top = base - height + (i * height) / 5.2;
    const half = (height * (0.12 + i * 0.055)) * (0.9 + rnd() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - half, top + height * 0.3);
    ctx.lineTo(x + half, top + height * 0.3);
    ctx.fill();
  }
}

function drawDeadTree(ctx, x, base, height, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const branch = (bx, by, angle, len, width) => {
    if (len < 6) return;
    const ex = bx + Math.cos(angle) * len;
    const ey = by + Math.sin(angle) * len;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    branch(ex, ey, angle - 0.5, len * 0.66, width * 0.65);
    branch(ex, ey, angle + 0.42, len * 0.6, width * 0.6);
  };
  branch(x, base, -Math.PI / 2, height * 0.4, height * 0.05);
}

function drawRuin(ctx, x, base, width, height, color, glow, rnd) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x, base - height * (0.7 + rnd() * 0.3));
  ctx.lineTo(x + width * 0.3, base - height);
  ctx.lineTo(x + width * 0.55, base - height * 0.82);
  ctx.lineTo(x + width, base - height * (0.5 + rnd() * 0.3));
  ctx.lineTo(x + width, base);
  ctx.fill();
  ctx.fillStyle = "#00000066";
  ctx.fillRect(x + width * 0.35, base - height * 0.55, width * 0.3, height * 0.55);
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + width * 0.46, base - height * 0.72, width * 0.08, height * 0.1);
  ctx.globalAlpha = 1;
}

function paintScene(canvas, sceneId, zoneKey = null, seed = 7) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.max(240, Math.round(rect.height));
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const scene = SCENES[sceneId] || SCENES.thicket;
  const rnd = seeded(seed * 131 + sceneId.length * 17);
  const horizon = h * 0.62;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(0.55, scene.sky[1]);
  sky.addColorStop(1, scene.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (sceneId === "limit" || sceneId === "ruins") {
    for (let i = 0; i < 130; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.6})`;
      const size = rnd() * 1.6 + 0.3;
      ctx.fillRect(rnd() * w, rnd() * horizon * 0.85, size, size);
    }
  }
  const sunX = w * (0.3 + rnd() * 0.4);
  const sunY = horizon * 0.62;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.62);
  glow.addColorStop(0, `${scene.glow}cc`);
  glow.addColorStop(0.18, `${scene.glow}55`);
  glow.addColorStop(1, `${scene.glow}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  if (sceneId !== "forge") {
    ctx.fillStyle = `${scene.glow}dd`;
    ctx.beginPath();
    ctx.arc(sunX, sunY, h * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sceneId === "limit") {
    ctx.strokeStyle = "#e9d6ff33";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      const y = rnd() * horizon * 0.7;
      ctx.moveTo(rnd() * w, y);
      ctx.lineTo(rnd() * w, y + rnd() * 120 - 60);
      ctx.stroke();
    }
  }

  ridge(ctx, w, h, horizon - h * 0.05, h * 0.2, scene.far, rnd);
  if (sceneId === "ruins") for (let i = 0; i < 6; i += 1) drawRuin(ctx, rnd() * w, horizon, 40 + rnd() * 70, 70 + rnd() * 110, scene.mid, scene.glow, rnd);
  ridge(ctx, w, h, horizon + h * 0.03, h * 0.13, scene.mid, rnd);
  if (sceneId === "thicket") for (let i = 0; i < 24; i += 1) drawTree(ctx, rnd() * w, horizon + h * 0.06, h * (0.16 + rnd() * 0.16), scene.mid, rnd);
  if (sceneId === "ashlands") for (let i = 0; i < 7; i += 1) drawDeadTree(ctx, rnd() * w, horizon + h * 0.05, h * (0.14 + rnd() * 0.16), scene.near);
  if (sceneId === "limit") {
    ctx.fillStyle = scene.near;
    for (let i = 0; i < 9; i += 1) {
      const x = rnd() * w;
      const s = 12 + rnd() * 40;
      const y = horizon - rnd() * h * 0.28;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.5, y);
      ctx.lineTo(x, y + s * 0.8);
      ctx.lineTo(x - s * 0.5, y);
      ctx.fill();
    }
  }

  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, scene.ground[0]);
  ground.addColorStop(1, scene.ground[1]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon + h * 0.04, w, h);
  ridge(ctx, w, h, horizon + h * 0.08, h * 0.05, scene.ground[0], rnd, 5);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon + h * 0.1, w, h);
  ctx.fillStyle = "#ffffff06";
  for (let i = 0; i < 60; i += 1) {
    const y = horizon + h * 0.1 + rnd() * (h - horizon) * 0.8;
    ctx.fillRect(rnd() * w, y, 20 + rnd() * 60, 1.2);
  }
  if (sceneId === "thicket") for (let i = 0; i < 8; i += 1) drawTree(ctx, i % 2 ? rnd() * w * 0.16 : w - rnd() * w * 0.16, horizon + h * 0.12, h * (0.34 + rnd() * 0.2), scene.near, rnd);
  if (sceneId === "ashlands") for (let i = 0; i < 3; i += 1) drawDeadTree(ctx, i % 2 ? rnd() * w * 0.1 : w - rnd() * w * 0.1, horizon + h * 0.16, h * 0.44, "#080403");
  if (sceneId === "ruins") { drawRuin(ctx, -10, horizon + h * 0.16, 90, h * 0.5, scene.near, scene.glow, rnd); drawRuin(ctx, w - 80, horizon + h * 0.16, 90, h * 0.42, scene.near, scene.glow, rnd); }

  if (zoneKey && ZONE_TINTS[zoneKey]) {
    const tint = ctx.createLinearGradient(0, 0, 0, h);
    tint.addColorStop(0, `${ZONE_TINTS[zoneKey]}00`);
    tint.addColorStop(0.6, `${ZONE_TINTS[zoneKey]}18`);
    tint.addColorStop(1, `${ZONE_TINTS[zoneKey]}00`);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
  }
  const vignette = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, h);
  vignette.addColorStop(0, "#00000000");
  vignette.addColorStop(1, "#000000b0");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

// Lightweight particle layer on top of a stage.
const FX = {
  canvas: null, ctx: null, particles: [], arcs: [], rings: [], running: false, ambient: null, reduced: false, last: 0, w: 0, h: 0,
  attach(canvas, ambient = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ambient = ambient;
    this.particles = [];
    this.arcs = [];
    this.rings = [];
    this.resize();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  },
  detach() {
    this.canvas = null;
    this.running = false;
  },
  resize() {
    if (!this.canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  },
  spawnAmbient() {
    if (!this.ambient || this.reduced || this.particles.length > (this.ambient === "rain" ? 260 : 70) || (this.ambient !== "rain" && Math.random() > 0.2)) return;
    const kinds = {
      leaf: { color: "#a9c77a", vx: 18, vy: 16, y: -10, size: 2.4, life: 7 },
      ember: { color: "#ff9a4a", vx: 6, vy: -24, y: this.h + 10, size: 2, life: 5, glow: true },
      rune: { color: "#a9c4ff", vx: 3, vy: -10, y: this.h * (0.4 + Math.random() * 0.6), size: 2, life: 5, glow: true },
      star: { color: "#d3a6ff", vx: -4, vy: -7, y: this.h * Math.random(), size: 1.8, life: 6, glow: true },
      rain: { color: "#d4e2f0", vx: 2, vy: 760, y: -20, size: 1, life: 1.6, streak: true, xs: -80 },
      // Sparks of the camp fire: they rise from below the picture and drift with the warm air.
      campfire: { color: Math.random() < 0.3 ? "#ffd27a" : "#ff8a3a", vx: 14, vy: -46, y: this.h + 6, size: 1.6, life: 4.5, glow: true, x: this.w * (0.5 + (Math.random() - 0.5) * 0.7), sway: 1 }
    };
    const kind = kinds[this.ambient];
    if (!kind) return;
    this.particles.push({ x: kind.x ?? Math.random() * this.w, y: kind.y, sway: kind.sway ? Math.random() * 6.28 : 0, streak: kind.streak, vxBase: kind.xs || 0, vx: (Math.random() - 0.5) * kind.vx * 2, vy: kind.vy * (0.6 + Math.random() * 0.8), life: kind.life, max: kind.life, size: kind.size * (0.6 + Math.random()), color: kind.color, glow: kind.glow, gravity: 0, ambient: true });
  },
  burst(x, y, { color = "#fff", count = 16, speed = 180, life = 0.6, size = 3, gravity = 240, glow = true, spread = Math.PI * 2, angle = 0 } = {}) {
    if (this.reduced) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.7), max: life, size: size * (0.5 + Math.random()), color, glow, gravity });
    }
  },
  rise(x, y, color, count = 14) {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 70, y: y + Math.random() * 60, vx: (Math.random() - 0.5) * 16, vy: -50 - Math.random() * 70, life: 0.9 + Math.random() * 0.5, max: 1.3, size: 2 + Math.random() * 2.4, color, glow: true, gravity: -10 });
    }
  },
  ring(x, y, color, radius = 80, life = 0.5) {
    this.rings.push({ x, y, color, radius, life, max: life });
  },
  slash(x, y, color = "#fff", flip = false) {
    this.arcs.push({ x, y, color, life: 0.24, max: 0.24, flip });
    this.burst(x, y, { color, count: 10, speed: 220, life: 0.32, size: 2.2, gravity: 200 });
  },
  projectile(from, to, color, duration = 0.3) {
    return new Promise((resolve) => {
      if (this.reduced || !this.canvas) { resolve(); return; }
      this.particles.push({ x: from.x, y: from.y, tx: to.x, ty: to.y, sx: from.x, sy: from.y, t: 0, dur: duration, color, size: 7, life: duration, max: duration, glow: true, bolt: true, done: resolve });
    });
  },
  frame(now) {
    if (!this.running || !this.canvas) return;
    if (!this.canvas.isConnected) { this.running = false; return; }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.spawnAmbient();
    if (this.ambient === "rain") { this.spawnAmbient(); this.spawnAmbient(); }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.bolt) {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 26;
        this.particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.25, max: 0.25, size: 3.4, color: p.color, glow: true, gravity: 0 });
        if (k >= 1) { p.done?.(); return false; }
      } else {
        p.vy += (p.gravity || 0) * dt;
        if (p.sway) { p.sway += dt * 2.2; p.x += Math.sin(p.sway) * 12 * dt; }
        p.x += (p.vx + (p.vxBase || 0)) * dt;
        p.y += p.vy * dt;
      }
      if (p.life <= 0) return false;
      const alpha = p.bolt ? 1 : clamp(p.life / p.max, 0, 1) * (p.ambient ? 0.55 : 1);
      ctx.globalAlpha = p.streak ? 0.55 : alpha;
      if (p.streak) {
        // A raindrop is a short slanted line, not a dot.
        ctx.shadowBlur = 0;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx + p.vxBase) * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
        return p.y < this.h + 30;
      }
      ctx.fillStyle = p.color;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = p.bolt ? 22 : 8; } else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.shadowBlur = 0;
    this.rings = this.rings.filter((ring) => {
      ring.life -= dt;
      if (ring.life <= 0) return false;
      const k = 1 - ring.life / ring.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius * (0.3 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
    this.arcs = this.arcs.filter((arc) => {
      arc.life -= dt;
      if (arc.life <= 0) return false;
      const k = 1 - arc.life / arc.max;
      const dir = arc.flip ? -1 : 1;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = arc.color;
      ctx.lineCap = "round";
      ctx.lineWidth = 9 * (1 - k) + 1;
      ctx.shadowColor = arc.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(arc.x - 18 * dir, arc.y, 62, dir > 0 ? -1.3 + k * 0.5 : Math.PI + 1.3 - k * 0.5, dir > 0 ? 1.1 + k * 0.5 : Math.PI - 1.1 - k * 0.5, dir < 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      return true;
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame((t) => this.frame(t));
  }
};

// Synthesised sound effects.
const SFX = {
  ctx: null, enabled: true, volume: 0.6,
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(freq, duration, { type = "sine", gain = 0.2, slide = 0, delay = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain * this.volume, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  },
  noise(duration, { gain = 0.2, filter = 1800, type = "lowpass", delay = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.value = filter;
    const amp = ctx.createGain();
    amp.gain.value = gain * this.volume;
    source.connect(biquad).connect(amp).connect(ctx.destination);
    source.start(t);
  },
  play(name) {
    if (!this.enabled) return;
    try {
      const sounds = {
        click: () => this.tone(520, 0.05, { type: "triangle", gain: 0.08 }),
        hit: () => { this.noise(0.13, { gain: 0.32, filter: 1500 }); this.tone(130, 0.12, { type: "square", gain: 0.1, slide: -70 }); },
        crit: () => { this.noise(0.22, { gain: 0.42, filter: 3200 }); this.tone(200, 0.2, { type: "sawtooth", gain: 0.14, slide: -130 }); this.tone(1200, 0.14, { type: "triangle", gain: 0.1, slide: 700 }); },
        anvil: () => { this.tone(1450, 0.34, { type: "triangle", gain: 0.2 }); this.tone(2310, 0.24, { type: "sine", gain: 0.11 }); this.noise(0.05, { gain: 0.32, filter: 5000, type: "highpass" }); },
        miss: () => this.noise(0.14, { gain: 0.12, filter: 3800, type: "highpass" }),
        cast: () => { this.tone(320, 0.24, { type: "sine", gain: 0.13, slide: 500 }); this.tone(640, 0.22, { type: "triangle", gain: 0.07, slide: 380, delay: 0.03 }); },
        fire: () => { this.noise(0.3, { gain: 0.22, filter: 900 }); this.tone(170, 0.26, { type: "sawtooth", gain: 0.07, slide: 180 }); },
        frost: () => { this.tone(1500, 0.2, { type: "triangle", gain: 0.09, slide: 600 }); this.tone(2100, 0.16, { gain: 0.05, delay: 0.05 }); },
        heal: () => [523, 659, 784].forEach((f, i) => this.tone(f, 0.26, { type: "sine", gain: 0.1, delay: i * 0.06 })),
        guard: () => { this.tone(240, 0.18, { type: "square", gain: 0.08 }); this.noise(0.08, { gain: 0.16, filter: 1000 }); },
        debuff: () => this.tone(240, 0.28, { type: "sawtooth", gain: 0.08, slide: -120 }),
        heavy: () => { this.noise(0.32, { gain: 0.48, filter: 650 }); this.tone(85, 0.32, { type: "square", gain: 0.2, slide: -35 }); },
        death: () => { this.tone(180, 0.6, { type: "sawtooth", gain: 0.14, slide: -130 }); this.noise(0.4, { gain: 0.2, filter: 500 }); },
        win: () => [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.34, { type: "triangle", gain: 0.13, delay: i * 0.1 })),
        lose: () => [330, 262, 208].forEach((f, i) => this.tone(f, 0.5, { type: "sawtooth", gain: 0.08, delay: i * 0.16 })),
        level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", gain: 0.13, delay: i * 0.08 })),
        loot: () => { this.tone(880, 0.14, { type: "triangle", gain: 0.11 }); this.tone(1320, 0.2, { type: "triangle", gain: 0.1, delay: 0.08 }); },
        coin: () => { this.tone(1680, 0.07, { type: "square", gain: 0.05 }); this.tone(2520, 0.11, { type: "square", gain: 0.05, delay: 0.05 }); },
        error: () => this.tone(150, 0.12, { type: "square", gain: 0.07 })
      };
      sounds[name]?.();
    } catch (error) {
      // Sound must never break the game.
    }
  }
};
