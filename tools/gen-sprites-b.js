// Second pose sheets: each fighter's first sheet goes to Codex as the reference, so the same character gets six new poses.
// Usage: node tools/gen-sprites-b.js [id ...]. Finished sheets are skipped. Saved as art/sprites/<id>__b.png.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RAW = path.join(__dirname, "..", "art", "sprites");
const CODEX = require("./codex-path");
const sheets = JSON.parse(fs.readFileSync(path.join(RAW, "_sheets.json"), "utf8"));

const FIGHTER = ["weapon raised high behind the head, body coiled, the wind-up before a heavy blow", "the end of a crushing downward blow, weapon driven down at the ground in front, knees bent", "a long low forward thrust, arm and weapon in one straight line", "braced behind weapon or shield, blocking, weight back", "in mid-air leaping forward, both feet off the ground, weapon ready", "triumphant, weapon raised, chest out"];
const POSES = {
  warrior: FIGHTER,
  assassin: ["both daggers drawn back low, crouched and coiled, about to spring", "both daggers crossed in a wide slash finished in front, deep lunge", "one dagger stabbing straight ahead in a long low thrust", "crouched, cloak pulled across, evading", "in mid-air leaping forward, feet off the ground, daggers reversed, plunging", "standing at ease twirling a dagger, smug"],
  mage: ["staff drawn back, gathering energy in the free hand", "staff slammed down into the ground in front, robes flaring", "free hand thrust forward releasing a spell, staff held behind", "staff held across the body, warding, weight back", "levitating off the ground, arms spread, robes floating", "both arms and staff raised to the sky in triumph"],
  archer: ["bow raised steeply toward the sky, drawn, aiming upward", "firing, the string just released, bow arm straight ahead, arrow gone", "kneeling on one knee, bow fully drawn straight ahead", "jumping backward away, feet off the ground, bow in hand", "in mid-air leaping forward, feet off the ground, bow drawn", "bow held high in triumph"],
  bard: ["lute raised high, about to strike a chord, leaning back", "lute swung down in a hard strum, knee bent, mouth wide open singing", "sweeping the lute forward in both hands in a low blunt strike, a visible ring of sound bursting from it, no blade", "dancing aside on one foot, coat swirling", "in mid-air spinning leap, feet off the ground", "bowing with a flourish of the hat"]
};
const BEAST = ["reared back on its haunches, jaws open, about to spring", "landing hard after a pounce, claws and jaws driving down", "lunging forward low, neck stretched, jaws snapping", "crouched flat, cowering and growling", "in mid-air pouncing forward, all legs off the ground", "standing proud, head high, howling or bellowing"];
const FLOAT = ["drawn back and swelling, gathering power", "crashing down in a heavy slam", "stabbing forward in a long thin line", "pulled in tight, shielded", "rising high, stretched upward", "fully swollen and radiant, triumphant"];
const FLOATERS = new Set(["slime", "ash_slime", "wraith", "void_stalker", "limit_shard", "brazier", "page_swarm", "lair_widow", "lair_rift_heart"]);
const posesFor = (id) => POSES[id] || (sheets[id]?.faces === -1 ? BEAST : FLOATERS.has(id) ? FLOAT : FIGHTER);

const named = process.argv.slice(2);
const queue = (named.length ? named : Object.keys(sheets)).filter((id) => fs.existsSync(path.join(RAW, `${id}.png`)) && !fs.existsSync(path.join(RAW, `${id}__b.png`)));
console.log("sheets to draw:", queue.length);
const worker = async () => {
  while (queue.length) {
    const id = queue.shift();
    await new Promise((resolve) => {
      const facing = sheets[id]?.faces === -1 ? "LEFT" : "RIGHT";
      const prompt = `Generate one image with your image generation tool, size 1536x1024, using the attached sprite sheet as the reference: it must be EXACTLY the same character, same face, costume, colours, weapons, painting style and scale as in the reference. One single image: a sprite sheet with a strict grid of 3 columns and 2 rows, six equal cells with wide empty gaps, poses never touching each other. Whole body visible in each cell, nothing cropped, side-on three-quarter view facing ${facing}. The background is the same perfectly flat solid colour as the reference, no cast shadow, no scenery, no gradient, no grid lines, no text. New poses in reading order: ${posesFor(id).map((p, i) => `(${i + 1}) ${p}`).join("; ")}.\nAfter it is generated, copy its PNG into the current working directory as ${id}__b.png. Do not do anything else.`;
      let log = "";
      const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-i", path.join(RAW, `${id}.png`), "-"], { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (d) => { log += d; });
      child.stderr.on("data", (d) => { log += d; });
      child.stdin.end(prompt);
      child.on("close", () => { const ok = fs.existsSync(path.join(RAW, `${id}__b.png`)); console.log(id, ok ? "ok" : `MISSING ${/usage limit[^\n]*/i.exec(log)?.[0] || log.slice(-200)}`); resolve(); });
    });
  }
};
Promise.all([worker(), worker(), worker(), worker()]).then(() => console.log("DONE"));
