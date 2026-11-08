// Generates game art through the Codex app and converts it for the game. Safe to re-run: finished images are skipped.
// Usage: node tools/gen-images.js [--list] [--only=prefix] [--redo=prefix] [--workers=3] [--batch=6]
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { loadCore } = require("./load-core");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "generated");
const OUT = path.join(ROOT, "assets", "img");
const CODEX = require("./codex-path");
const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split("=")[1] : fallback; };

const ICON = "Hand-painted dark fantasy RPG game icon, rich painterly style, one bold centered subject with a strong clear silhouette, vivid glowing accents, dark vignette background, square composition, no text, no letters, no border, no frame.";
const SCENE = "Wide cinematic painted environment concept art for a stylized dark fantasy game, rich colour, atmospheric depth, soft volumetric light, no characters, no text, no logo, no UI.";
const ELEMENT = { fire: "orange fire", frost: "icy blue frost", water: "flowing blue water", earth: "cracked stone and earth", air: "pale wind and lightning", holy: "warm golden light", dark: "violet shadow", arcane: "indigo arcane energy", poison: "toxic green venom", blood: "crimson blood", steel: "polished steel" };
const IDEAS = require("./icon-ideas");
const SKILL_ICON = "Hand-painted dark fantasy RPG skill icon, rich painterly style, square, dark vignette background, no text, no letters, no border. NO person, NO face, NO hands, NO character: the icon is a single symbolic object or effect that literally illustrates the skill.";
const CLASS_EN = { warrior: "a warrior in heavy armour", mage: "a robed mage", archer: "a forest archer", bard: "a travelling bard with a lute, no blade", assassin: "a hooded assassin with twin daggers" };

function buildManifest() {
  const run = loadCore();
  const data = JSON.parse(run(`JSON.stringify({
    skills: Object.values(SKILL_CATALOG).filter((s) => s.category !== "passive" && !s.hidden && s.visible !== false).map((s) => ({ id: s.id, name: s.name, description: s.description, element: s.element, classId: s.classId, attackType: s.attackType })),
    schools: Object.values(TALENT_SCHOOLS).map((s) => ({ id: s.id, name: s.name, description: s.description })),
    items: ITEM_BLUEPRINTS.map((b) => ({ name: b.name, slot: b.slotType, weapon: b.weapon, hint: b.iconHint })),
    events: EXPEDITION_EVENTS.map((e) => ({ id: e.id, title: e.title, text: e.text })),
    sets: Object.values(SET_CATALOG).map((s) => ({ id: s.id, name: s.name })),
    ults: Object.entries(ULTIMATES).map(([k, u]) => ({ id: k, name: u.name, description: u.description })),
    ultOptions: Object.values(ULT_OPTIONS).map((u) => ({ id: u.id.replace(/:/g, "_"), name: u.name, description: u.description, element: u.element }))
  })`));
  const list = [];
  const add = (id, size, kind, prompt) => list.push({ id, size, kind, prompt });
  add("bg_title", "1536x1024", "bg", `${SCENE} A colossal ancient forge at the edge of the world at dusk, a giant anvil on a cliff, molten rivers and embers rising into a purple-orange sky, a long stone road of glowing footsteps leading to it. Leave the left third calm and dark for a menu.`);
  add("bg_camp", "1536x1024", "bg", `${SCENE} A cozy adventurer camp at night at the edge of a dark forest: a campfire, a small portable anvil, hanging lanterns, tents, warm light against deep blue shadows. Calm and readable, low contrast at the edges.`);
  add("region_thicket", "1536x1024", "bg", `${SCENE} The Whispering Thicket: an ancient mossy forest with giant pines, golden shafts of light, ferns and an old winding path.`);
  add("region_ashlands", "1536x1024", "bg", `${SCENE} The Ashlands: a scorched wasteland of black rock and ash dunes, glowing lava cracks, burnt trees, ember-filled orange sky.`);
  add("region_ruins", "1536x1024", "bg", `${SCENE} The Rune Ruins: a forgotten city of masters, broken stone arches and towers covered with glowing blue runes, overgrown, misty moonlight.`);
  add("region_limit", "1536x1024", "bg", `${SCENE} The Limit: the edge of the world, floating shards of land over an endless violet void, cracked horizon, stars and pale light pouring through.`);
  Object.entries(CLASS_EN).forEach(([id, who]) => add(`class_${id}`, "1024x1536", "portrait", `Full-body painted character art of ${who}, stylized dark fantasy game hero, dynamic heroic pose, rich detail, dramatic rim light, simple dark smoky background, no text, no logo.`));
  data.ultOptions.forEach((u) => add(`ult_${u.id}`, "1024x1024", "icon", `${ICON} Ultimate ability of a fantasy hero, its Russian name is "${u.name}", meaning: ${u.description} Show the action itself as one dramatic symbol.${ELEMENT[u.element] ? ` Dominant colour and material: ${ELEMENT[u.element]}.` : ""}`));
  data.ults.forEach((u) => add(`ult_${u.id}`, "1024x1024", "icon", `${ICON} Ultimate ability of ${CLASS_EN[u.id]}, called "${u.name}": ${u.description} Extremely dramatic, radiant golden energy.`));
  data.skills.forEach((s) => add(`skill_${s.id}`, "1024x1024", "icon", IDEAS[s.id] ? `${SKILL_ICON} Skill name (Russian): "${s.name}". Visual idea: ${IDEAS[s.id]}. One bold centered subject with a clear silhouette readable at 48 pixels. Dominant colour: ${ELEMENT[s.element] || "polished steel"}.` : `${ICON} Combat skill of ${CLASS_EN[s.classId] || "a hero"}. Its Russian name is "${s.name}", meaning: ${s.description} Show the action itself as a strong symbol.${ELEMENT[s.element] ? ` Dominant look: ${ELEMENT[s.element]}.` : ""}`));
  const slotWords = { ring: "a magic ring", bracelet: "an ornate bracelet", necklace: "a pendant necklace", head: "a helmet or hood", chest: "a chest armour or robe", legs: "armoured leggings or trousers", boots: "a pair of boots", weapon: "a weapon" };
  data.items.forEach((b, i) => add(`item_${i}`, "1024x1024", "icon", `${ICON} An RPG inventory item, ${b.hint || (b.weapon ? `a ${b.weapon}` : slotWords[b.slot])}, its Russian name is "${b.name}". Show just the object.`));
  data.schools.forEach((s) => add(`school_${s.id}`, "1024x1024", "icon", `${ICON} An emblem for a school of talents, its Russian name is "${s.name}", meaning: ${s.description} Symbolic, heraldic, circular composition.`));
  data.events.forEach((e) => add(`event_${e.id}`, "1536x1024", "bg", `${SCENE.replace("no characters, ", "")} A road encounter scene in a fantasy journey, Russian title "${e.title}": ${e.text}`));
  data.sets.forEach((s) => add(`set_${s.id}`, "1024x1024", "icon", `${ICON} A legendary armour set emblem, its Russian name is "${s.name}". Symbolic, ornate.`));
  add("memory_key", "1024x1024", "icon", `${ICON} An old hand-forged iron house key with a ring bow shaped like a small house roof with one warm glowing window, faint amber glow inside the metal like the memory of a hearth.`);
  return list;
}

function isDone(entry) {
  return fs.existsSync(path.join(RAW, `${entry.id}.png`));
}

async function convert(entry, sharp) {
  const source = path.join(RAW, `${entry.id}.png`);
  const target = path.join(OUT, `${entry.id}.webp`);
  if (!fs.existsSync(source)) return;
  // A new source replaces the old picture; the old one stays in the game until then.
  if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs) return;
  const width = { icon: 192, portrait: 720, bg: 1600 }[entry.kind];
  await sharp(source).resize({ width }).webp({ quality: entry.kind === "icon" ? 86 : 80 }).toFile(target);
}

function writeIndex(manifest) {
  const ready = manifest.filter((entry) => fs.existsSync(path.join(OUT, `${entry.id}.webp`))).map((entry) => entry.id);
  fs.writeFileSync(path.join(ROOT, "assets", "images.index.js"), `window.FORGE_IMAGES = new Set(${JSON.stringify(ready)});\n`);
  return ready.length;
}

function runBatch(batch, index) {
  const lines = batch.map((entry, i) => `${i + 1}. File name: ${entry.id}.png. Size: ${entry.size}. Prompt: ${entry.prompt}`).join("\n");
  const prompt = `Generate images with your image generation tool, one per item below, each with exactly the prompt given. After each image is generated, copy its PNG into the current working directory under the given file name. Do not do anything else, do not write code, do not view the images. Finish with the single word DONE.\n\n${lines}`;
  return new Promise((resolve) => {
    const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.stdin.end(prompt);
    const killer = setTimeout(() => child.kill(), 25 * 60 * 1000);
    child.on("close", () => {
      clearTimeout(killer);
      fs.appendFileSync(path.join(RAW, "_log.txt"), `\n--- worker ${index} ${new Date().toISOString()} [${batch.map((b) => b.id).join(", ")}]\n${output.slice(-500)}\n`);
      resolve();
    });
    child.on("error", (error) => { fs.appendFileSync(path.join(RAW, "_log.txt"), `spawn error ${error}\n`); resolve(); });
  });
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = buildManifest();
  if (process.argv.includes("--list")) {
    const kinds = {};
    manifest.forEach((entry) => { const k = entry.id.split("_")[0]; kinds[k] = (kinds[k] || 0) + 1; });
    console.log(manifest.length, kinds, "готово", manifest.filter(isDone).length);
    return;
  }
  const sharp = require(path.join(__dirname, "vendor-build", "node_modules", "sharp"));
  const only = arg("only", "");
  // --redo=prefix moves the finished images aside (art/generated/old) so they are made again.
  const redo = arg("redo", "");
  if (redo) {
    const OLD = path.join(RAW, "old");
    fs.mkdirSync(OLD, { recursive: true });
    manifest.filter((entry) => entry.id.startsWith(redo) && isDone(entry)).forEach((entry) => {
      fs.renameSync(path.join(RAW, `${entry.id}.png`), path.join(OLD, `${entry.id}.png`));
      const webp = path.join(OUT, `${entry.id}.webp`);
      if (fs.existsSync(webp)) fs.copyFileSync(webp, path.join(OLD, `${entry.id}.webp`));
    });
  }
  const batchSize = Number(arg("batch", 6));
  const workers = Number(arg("workers", 3));
  const queue = manifest.filter((entry) => !isDone(entry) && entry.id.startsWith(only));
  let failures = 0;
  const worker = async (index) => {
    while (queue.length && failures < 6) {
      const batch = queue.splice(0, batchSize);
      await runBatch(batch, index);
      const made = batch.filter(isDone).length;
      failures = made ? 0 : failures + 1;
      for (const entry of batch) await convert(entry, sharp);
      console.log(`worker ${index}: ${made}/${batch.length}, осталось ${queue.length}, готово ${writeIndex(manifest)}`);
    }
  };
  for (const entry of manifest) await convert(entry, sharp);
  writeIndex(manifest);
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
  console.log(failures >= 6 ? "ОСТАНОВЛЕНО: подряд не получается создать картинки, смотри art/generated/_log.txt" : "ГОТОВО", writeIndex(manifest));
}

main();
