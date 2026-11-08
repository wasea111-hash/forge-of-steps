// Cuts the Codex interface art (art/ui) into what the game uses: assets/ui and assets/ui.index.js. Safe to re-run.
const fs = require("fs");
const path = require("path");
const sharp = require("./vendor-build/node_modules/sharp");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "ui");
const OUT = path.join(ROOT, "assets", "ui");
fs.mkdirSync(path.join(OUT, "ic"), { recursive: true });
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SHEETS = {
  ic_nav: ["map", "hero", "bag", "skills", "talents", "anvil", "shop", "book", "settings", "camp", "retreat", "lock"],
  ic_res: ["gold", "shard", "potionHp", "potionMp", "ore", "dust", "thread", "gland", "core", "chest", "boss", "event"],
  ic_act: ["attack", "guard", "wait", "log", "auto", "speed", "battle", "back", "sound", "shrine", "elite", "upgrade"],
  ic_st1: ["burn", "bleed", "poison", "frost", "freeze", "frostbite", "stun", "stagger", "corruption", "silence", "weaken", "mark"],
  ic_st2: ["armor_break", "shield", "regeneration", "rage", "dark_fury", "haste", "evasion", "fortify", "thorns", "shock", "blind", "soaked"],
  ic_el: ["water", "earth", "air", "holy", "dark", "arcane", "steel", "exposed", "wound", "slow", "demon", "lightning"],
  ic_fix: ["shard", "corruption", "dark_fury", "dark", "evasion", "arcane", "stagger", "void_eye", "ghost_flame", "heart", "feather", "star"],
  ic_slot: ["ring", "bracelet", "necklace", "head", "chest_armor", "legs", "boots", "sword", "staff", "bow", "dagger", "hammer"]
};
const ALIAS = { flame: "burn", fire: "burn", blood: "bleed", mute: "sound", chest: "chest_armor" };

async function keyed(file) {
  const { data, info } = await sharp(path.join(RAW, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i += 1) {
    let r = data[i * 3];
    let g = data[i * 3 + 1];
    let b = data[i * 3 + 2];
    const green = data[1] > data[0] + 60 && data[1] > data[2] + 60;
    const key = green ? g - Math.max(r, b) : Math.min(r, b) - g;
    const alpha = 1 - smooth(45, 130, key);
    if (key > 8 && !green) { r = Math.min(r, g + 40); b = Math.min(b, g + 8); }
    if (key > 8 && green) g = Math.max(r, b) + 8;
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = Math.round(alpha * 255);
  }
  return { raw: out, width: info.width, height: info.height };
}
const fromKeyed = (k) => sharp(k.raw, { raw: { width: k.width, height: k.height, channels: 4 } });
const crop = async (k, x0, y0, x1, y1) => fromKeyed(k).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();

async function frames() {
  const k = await keyed("kit_frames.png");
  // A nine-slice panel: real corners, plain edges, plain middle. The ornament goes on separately.
  const C = 150;
  const E = 60;
  const box = { x0: 45, y0: 25, x1: 940, y1: 715 };
  const parts = [
    [box.x0, box.y0, box.x0 + C, box.y0 + C, 0, 0], [box.x1 - C, box.y0, box.x1, box.y0 + C, C + E, 0],
    [box.x0, box.y1 - C, box.x0 + C, box.y1, 0, C + E], [box.x1 - C, box.y1 - C, box.x1, box.y1, C + E, C + E],
    [262, box.y0, 262 + E, box.y0 + C, C, 0], [262, box.y1 - C, 262 + E, box.y1, C, C + E],
    [box.x0, 195, box.x0 + C, 195 + E, 0, C], [box.x1 - C, 195, box.x1, 195 + E, C + E, C],
    [450, 350, 450 + E, 350 + E, C, C]
  ];
  const comps = [];
  for (const [x0, y0, x1, y1, left, top] of parts) comps.push({ input: await crop(k, x0, y0, x1, y1), left, top });
  const size = C * 2 + E;
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, "frame.webp"));
  const single = { thin: [975, 32, 1495, 163], btn: [972, 190, 1500, 306], btn_hot: [972, 325, 1500, 441], slot: [988, 478, 1199, 690], medal: [1226, 452, 1492, 718], divider: [95, 728, 1442, 850], orn_top: [300, 8, 696, 132], orn_bottom: [320, 632, 676, 718] };
  for (const [name, [x0, y0, x1, y1]] of Object.entries(single)) {
    await sharp(await crop(k, x0, y0, x1, y1)).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, `${name}.webp`));
  }
}

async function icons() {
  const names = {};
  for (const [sheet, list] of Object.entries(SHEETS)) {
    const file = `${sheet}.png`;
    if (!fs.existsSync(path.join(RAW, file))) { console.log("no sheet", sheet); continue; }
    const k = await keyed(file);
    const cellW = Math.floor(k.width / 4);
    const cellH = Math.floor(k.height / 3);
    for (let i = 0; i < list.length; i += 1) {
      const x = (i % 4) * cellW;
      const y = Math.floor(i / 4) * cellH;
      const piece = await fromKeyed(k).extract({ left: x, top: y, width: cellW, height: cellH }).png().toBuffer();
      await sharp(piece).trim({ threshold: 10 }).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 92 }).toFile(path.join(OUT, "ic", `${list[i]}.webp`));
      names[list[i]] = list[i];
    }
  }
  Object.entries(ALIAS).forEach(([from, to]) => { if (names[to]) names[from] = to; });
  fs.writeFileSync(path.join(ROOT, "assets", "ui.index.js"), `window.FORGE_ICONS = ${JSON.stringify(names)};\n`);
  console.log("icons", Object.keys(names).length);
}

async function pictures() {
  for (const name of ["bg_hub", "tier_white", "tier_green", "tier_orange", "tier_purple", "tier_red", "tex_iron", "tex_leather"]) {
    if (!fs.existsSync(path.join(RAW, `${name}.png`))) continue;
    const width = name === "bg_hub" ? 1536 : name.startsWith("tex") ? 512 : 640;
    await sharp(path.join(RAW, `${name}.png`)).resize({ width }).webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
  }
  if (fs.existsSync(path.join(RAW, "emblem.png"))) {
    const k = await keyed("emblem.png");
    await fromKeyed(k).png().toBuffer().then((b) => sharp(b).trim({ threshold: 10 }).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toFile(path.join(OUT, "emblem.webp")));
  }
}

(async () => { await frames(); await icons(); await pictures(); console.log("UI CUT"); })();
