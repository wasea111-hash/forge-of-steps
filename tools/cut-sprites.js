// Cuts painted pose sheets (art/sprites/<id>.png and <id>__b.png) into separate transparent poses:
// assets/sprites/<id>/<pose>.webp and the index assets/sprites.index.js. Safe to re-run.
// For each pose it also measures where the body stands (cx) and where the blow reaches (tipX, tipY).
const fs = require("fs");
const path = require("path");
const sharp = require("./vendor-build/node_modules/sharp");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "sprites");
const OUT = path.join(ROOT, "assets", "sprites");
const POSES_A = ["idle", "strike", "dash", "cast", "hit", "dead"];
const POSES_B = ["windup", "slam", "thrust", "guard", "air", "proud"];
const sheets = JSON.parse(fs.readFileSync(path.join(RAW, "_sheets.json"), "utf8"));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

async function cut(file, names, id) {
  const { data, info } = await sharp(path.join(RAW, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const green = data[1] > data[0] + 60 && data[1] > data[2] + 60;
  const rgba = Buffer.alloc(W * H * 4);
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    let r = data[i * 3];
    let g = data[i * 3 + 1];
    let b = data[i * 3 + 2];
    const key = green ? g - Math.max(r, b) : Math.min(r, b) - g;
    const alpha = 1 - smooth(45, 130, key);
    // Remove the coloured fringe from soft edges.
    if (key > 8) {
      if (green) g = Math.max(r, b) + 8;
      else { r = Math.min(r, g + 40); b = Math.min(b, g + 8); }
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = Math.round(alpha * 255);
    solid[i] = alpha > 0.5 ? 1 : 0;
  }
  // Connected pieces: the six biggest are the poses, smaller bits join the nearest pose.
  const label = new Int32Array(W * H);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < W * H; start += 1) {
    if (!solid[start] || label[start]) continue;
    const blob = { id: blobs.length + 1, n: 0, x0: W, x1: 0, y0: H, y1: 0 };
    blobs.push(blob);
    label[start] = blob.id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p - x) / W;
      blob.n += 1;
      blob.x0 = Math.min(blob.x0, x); blob.x1 = Math.max(blob.x1, x);
      blob.y0 = Math.min(blob.y0, y); blob.y1 = Math.max(blob.y1, y);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (solid[q] && !label[q]) { label[q] = blob.id; stack.push(q); }
        }
      }
    }
  }
  const main = blobs.slice().sort((a, b) => b.n - a.n).slice(0, 6);
  if (main.length < 6 || main[5].n < main[0].n * 0.08) return { error: `found ${main.length} poses, sizes ${main.map((m) => m.n).join(",")}` };
  const owner = new Map();
  main.forEach((blob) => owner.set(blob.id, blob));
  blobs.forEach((blob) => {
    if (owner.has(blob.id)) return;
    const gap = (m) => Math.max(0, m.x0 - blob.x1, blob.x0 - m.x1) + Math.max(0, m.y0 - blob.y1, blob.y0 - m.y1);
    const near = main.slice().sort((a, b) => gap(a) - gap(b))[0];
    if (gap(near) < 45) {
      owner.set(blob.id, near);
      near.x0 = Math.min(near.x0, blob.x0); near.x1 = Math.max(near.x1, blob.x1);
      near.y0 = Math.min(near.y0, blob.y0); near.y1 = Math.max(near.y1, blob.y1);
    }
  });
  // Reading order: two rows by vertical centre, left to right in each row.
  const byY = main.slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const ordered = [...byY.slice(0, 3).sort((a, b) => a.x0 - b.x0), ...byY.slice(3).sort((a, b) => a.x0 - b.x0)];
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  const faces = sheets[id]?.faces ?? 1;
  const poses = {};
  for (let i = 0; i < 6; i += 1) {
    const blob = ordered[i];
    const pad = 3;
    const x0 = Math.max(0, blob.x0 - pad);
    const y0 = Math.max(0, blob.y0 - pad);
    const w = Math.min(W - 1, blob.x1 + pad) - x0 + 1;
    const h = Math.min(H - 1, blob.y1 + pad) - y0 + 1;
    const out = Buffer.alloc(w * h * 4);
    const mass = new Array(w).fill(0);
    let tip = null;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = (y + y0) * W + x + x0;
        if (label[p] && owner.get(label[p]) !== blob) continue;
        rgba.copy(out, (y * w + x) * 4, p * 4, p * 4 + 4);
        if (rgba[p * 4 + 3] < 128) continue;
        // The body: pixels of the middle of the figure, so a cape or an arm does not pull it away.
        if (y > h * 0.3 && y < h * 0.8) mass[x] += 1;
        // The tip of the blow: the farthest pixel in the direction the fighter faces.
        const reach = faces > 0 ? x : w - x;
        if (!tip || reach > tip.reach) tip = { reach, x, y };
      }
    }
    // The median column of the body.
    const total = mass.reduce((sum, n) => sum + n, 0);
    let run = 0;
    let cx = w / 2;
    for (let x = 0; x < w; x += 1) { run += mass[x]; if (run >= total / 2) { cx = x; break; } }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 88, alphaQuality: 92 }).toFile(path.join(dir, `${names[i]}.webp`));
    poses[names[i]] = { w, h, cx: +(cx / w).toFixed(3), tipX: +((tip?.x ?? w) / w).toFixed(3), tipY: +(1 - (tip?.y ?? 0) / h).toFixed(3) };
  }
  return { poses };
}

(async () => {
  const ids = fs.readdirSync(RAW).filter((f) => f.endsWith(".png") && !f.includes("__")).map((f) => f.slice(0, -4));
  const index = {};
  for (const id of ids) {
    const a = await cut(`${id}.png`, POSES_A, id);
    if (a.error) { console.log("BAD", id, a.error); continue; }
    index[id] = { faces: sheets[id]?.faces ?? 1, poses: a.poses };
    if (fs.existsSync(path.join(RAW, `${id}__b.png`))) {
      const b = await cut(`${id}__b.png`, POSES_B, id);
      if (b.error) console.log("BAD second sheet", id, b.error);
      else Object.assign(index[id].poses, b.poses);
    }
  }
  fs.writeFileSync(path.join(ROOT, "assets", "sprites.index.js"), `window.FORGE_SPRITES = ${JSON.stringify(index)};\n`);
  console.log("cut", Object.keys(index).length, "of", ids.length, "with second sheet", Object.values(index).filter((s) => s.poses.windup).length);
})();
