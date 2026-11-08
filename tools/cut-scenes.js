// Prepares battle location layers: art/scenes -> assets/scenes. Cut-out layers lose their flat background.
const fs = require("fs");
const path = require("path");
const sharp = require("./vendor-build/node_modules/sharp");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "scenes");
const OUT = path.join(ROOT, "assets", "scenes");
fs.mkdirSync(OUT, { recursive: true });
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

(async () => {
  for (const file of fs.readdirSync(RAW).filter((f) => f.endsWith(".png"))) {
    const name = file.slice(0, -4);
    const target = path.join(OUT, `${name}.webp`);
    if (/_mid$|_fore$/.test(name)) {
      const { data, info } = await sharp(path.join(RAW, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const out = Buffer.alloc(info.width * info.height * 4);
      for (let i = 0; i < info.width * info.height; i += 1) {
        let r = data[i * 3];
        const g = data[i * 3 + 1];
        let b = data[i * 3 + 2];
        const key = Math.min(r, b) - g;
        if (key > 8) { r = Math.min(r, g + 40); b = Math.min(b, g + 8); }
        out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
        out[i * 4 + 3] = Math.round((1 - smooth(45, 130, key)) * 255);
      }
      await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 84, alphaQuality: 88 }).toFile(target);
    } else {
      await sharp(path.join(RAW, file)).webp({ quality: 82 }).toFile(target);
    }
  }
  console.log("scenes", fs.readdirSync(OUT).length);
})();
