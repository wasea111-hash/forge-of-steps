// Paints cutscene frames and portraits through Codex and converts them for the game. Finished images are skipped.
// Usage: node tools/gen-story.js [--workers=4]. Portraits go first: choice scenes use them as a reference for the characters.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const sharp = require("./vendor-build/node_modules/sharp");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "story");
const OUT = path.join(ROOT, "assets", "story");
const CODEX = require("./codex-path");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "story-art.json"), "utf8"));
const WORKERS = Number((process.argv.find((a) => a.startsWith("--workers=")) || "=4").split("=")[1]);
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(CODEX)) { console.error("Codex not found at", CODEX); process.exit(7); }

function draw(entry) {
  return new Promise((resolve) => {
    const file = path.join(RAW, `${entry.id}.png`);
    const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"'];
    let extra = "";
    if (entry.ref) { args.push("-i", path.join(ROOT, "art", entry.ref)); extra = " The attached sheet is a reference only for how the creature or character looks: same design and colours, painted anew in this scene as one figure, ignore its plain background and do not copy the grid."; }
    if (entry.refNpc) { args.push("-i", path.join(RAW, `${entry.refNpc}.png`)); extra = " The attached portrait is a reference for how this character looks: same face, hair and clothes."; }
    args.push("-");
    const prompt = `Generate one image with your image generation tool, size ${entry.size}, with exactly this prompt: ${entry.prompt}${extra}\nAfter it is generated, copy its PNG into the current working directory as ${entry.id}.png. Do not do anything else.`;
    let log = "";
    const child = spawn(CODEX, args, { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    child.stdin.end(prompt);
    child.on("close", () => {
      const ok = fs.existsSync(file);
      console.log(entry.id, ok ? "ok" : `MISSING ${/usage limit[^\n]*/i.exec(log)?.[0] || log.slice(-160)}`);
      resolve();
    });
  });
}

async function pool(list) {
  const queue = list.filter((entry) => !fs.existsSync(path.join(RAW, `${entry.id}.png`)));
  await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) await draw(queue.shift()); }));
}

(async () => {
  await pool(manifest.filter((entry) => entry.id.startsWith("portrait_")));
  await pool(manifest.filter((entry) => !entry.id.startsWith("portrait_")));
  let made = 0;
  for (const entry of manifest) {
    const file = path.join(RAW, `${entry.id}.png`);
    if (!fs.existsSync(file)) continue;
    const portrait = entry.id.startsWith("portrait_");
    await sharp(file).resize(portrait ? 384 : 1536).webp({ quality: portrait ? 84 : 78 }).toFile(path.join(OUT, `${entry.id}.webp`));
    made += 1;
  }
  console.log(`DONE ${made} of ${manifest.length}`);
})();
