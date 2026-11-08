// Browsers forbid reading picture and sound files when the game is opened by double click (file://).
// Scripts are allowed, so this packs fighters, locations and sounds into small scripts the game loads when needed.
// Run after cut-sprites, cut-scenes or build_audio: node tools/pack-offline.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets", "pack");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const data = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const write = (name, entries) => {
  const body = entries.map(([key, value]) => `p[${JSON.stringify(key)}]=${JSON.stringify(value)};`).join("\n");
  fs.writeFileSync(path.join(OUT, `${name}.js`), `(function(){var p=window.FORGE_PACK=window.FORGE_PACK||{};\n${body}\n})();\n`);
};

const spritesDir = path.join(ROOT, "assets", "sprites");
for (const id of fs.readdirSync(spritesDir)) {
  const dir = path.join(spritesDir, id);
  write(`sprite_${id}`, fs.readdirSync(dir).map((file) => [`sprites/${id}/${file}`, data(path.join(dir, file), "image/webp")]));
}
const scenesDir = path.join(ROOT, "assets", "scenes");
const regions = new Set(fs.readdirSync(scenesDir).map((file) => file.split("_")[0]));
for (const region of regions) {
  write(`scene_${region}`, fs.readdirSync(scenesDir).filter((file) => file.startsWith(`${region}_`)).map((file) => [`scenes/${file}`, data(path.join(scenesDir, file), "image/webp")]));
}
const audioDir = path.join(ROOT, "assets", "audio");
write("audio", fs.readdirSync(audioDir).filter((file) => file.endsWith(".ogg") && !/^(music|amb)_/.test(file)).map((file) => [`audio/${file}`, data(path.join(audioDir, file), "audio/ogg")]));

const size = fs.readdirSync(OUT).reduce((sum, file) => sum + fs.statSync(path.join(OUT, file)).size, 0);
console.log("packed", fs.readdirSync(OUT).length, "scripts,", Math.round(size / 1048576), "MB");
