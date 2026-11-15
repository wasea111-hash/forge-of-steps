// Paints the camp scene through Codex: the panorama with every place, the camp people standing at their work,
// and (later) the buildings of the growing town. Raw images go to art/camp, game copies to assets/camp.
// Usage: node tools/gen-camp.js [id ...]  — finished images are skipped. Then: node tools/gen-camp.js --convert
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "camp");
const OUT = path.join(ROOT, "assets", "camp");
const CODEX = require("./codex-path");
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly dark fantasy, realistic materials and human proportions, oil and thick gouache texture with visible brush strokes in the half-tones, charcoal-blue shadows, muted ochre, warm amber firelight, worn cloth, rough wood, matte forged iron, soft aerial perspective. Calm composition, readable large silhouettes, traces of everyday life. No text, no letters, no logos, no UI.";
const PANORAMA = `${STYLE} A wide painted game scene: a travellers' camp at dusk in a sheltered stone hollow at the edge of an old forest, seen from slightly above at a gentle three-quarter angle, horizon at about 38% of the height. Clear, separate, readable places, left to right: (1) far left foreground: a trader's stall under a heavy faded tarp with crates, scales and a warm lantern; (2) left middle: a small scribe's tent with an open flap, a writing table with a big book, a tall scroll case and a wooden notice board with pinned papers beside it; (3) centre, slightly left: a stone campfire ring with a bright fire, a kettle on a tripod and two empty log benches; (4) centre back: a low camp table with a pinned map, stones on its corners and a lantern on a short pole, next to where a dirt road leaves the camp and winds away into the misty forest and distant ruins; beside the road a tilted waymark stone with eight empty sockets and ribbons; (5) right middle: a clean healer's awning of patched pale cloth with a table of bandages, a basin and drying herbs; (6) far right: a low stone smithy with a wooden roof, an open glowing forge, an anvil in front, bellows and a short smoking chimney; (7) in a loose semicircle in the middle distance: four small personal travel tents with open flaps; (8) bottom left foreground: the traveller's own spot — a low travel chest, a folded cloak, a small mirror and a training post. Leave empty flat clearings at the far left edge, the far right edge and on the gentle hill behind the tents, where new buildings could stand later. No people at all, the camp is waiting. Warm firelight against cool blue dusk, smoke rising gently.`;
const NPC = (who) => `${STYLE} A single full-body painted game character, three-quarter view facing slightly left toward the centre of a camp, camera slightly above, natural calm pose at their work, feet on one baseline, whole figure visible with a 12% margin. The whole background is one perfectly flat solid pure magenta colour (#FF00FF), no shadow, no scenery, no magenta on the character. The character: ${who}`;

const MANIFEST = {
  camp_panorama: { size: "1536x1024", prompt: PANORAMA },
  camp_panorama_b: { size: "1536x1024", prompt: PANORAMA.replace("at dusk", "at the blue hour after sunset, the first stars out") },
  npc_veya: { size: "1024x1536", prompt: NPC("a lean middle-aged woman guide with windburned brown skin, short iron-grey hair, patched moss-green travel coat, a red measuring cord around one wrist, leaning on a wooden walking staff and studying a folded map.") },
  npc_mot: { size: "1024x1536", prompt: NPC("a wiry trader in his forties with a clever tired face, a short dark beard, a layered merchant coat of faded red and brown, a money pouch and a small brass scale in his hands.") },
  npc_kern: { size: "1024x1536", prompt: NPC("a broad old blacksmith with thick grey forearms, a burnt leather apron, a soot-dark face with a white beard, resting a heavy hammer on his shoulder.") },
  npc_sota: { size: "1024x1536", prompt: NPC("a slim young scribe with ink-stained fingers, short dark hair, round spectacles, a long dark-blue coat with many pockets, holding an open ledger and a quill.") },
  npc_nima: { size: "1024x1536", prompt: NPC("a calm middle-aged healer woman with a grey-streaked bun, a plain apron over a dark dress, rolled sleeves, holding a roll of clean bandages.") }
};

if (process.argv.includes("--convert")) {
  const sharp = require("./vendor-build/node_modules/sharp");
  (async () => {
    for (const id of Object.keys(MANIFEST)) {
      const file = path.join(RAW, `${id}.png`);
      if (!fs.existsSync(file)) continue;
      if (id.startsWith("npc_")) {
        // Cut the flat magenta away and trim to the figure.
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          const key = r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90;
          if (key) data[i + 3] = 0;
          else if (r > 120 && b > 120 && g < 140) data[i + 3] = Math.min(data[i + 3], 120);
        }
        await sharp(data, { raw: info }).trim().resize({ height: 640 }).webp({ quality: 86 }).toFile(path.join(OUT, `${id}.webp`));
      } else {
        await sharp(file).resize({ width: 2560, kernel: "lanczos3" }).webp({ quality: 82 }).toFile(path.join(OUT, `${id}.webp`));
      }
      console.log("converted", id);
    }
  })();
} else {
  const named = process.argv.slice(2);
  const queue = (named.length ? named : Object.keys(MANIFEST)).filter((id) => !fs.existsSync(path.join(RAW, `${id}.png`)));
  console.log("to draw:", queue.join(", "));
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      await new Promise((resolve) => {
        const prompt = `Generate one image with your image generation tool, size ${MANIFEST[id].size}, with exactly this prompt: ${MANIFEST[id].prompt}\nAfter it is generated, copy its PNG into the current working directory as ${id}.png. Do not do anything else.`;
        const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-"], { stdio: ["pipe", "ignore", "ignore"] });
        child.stdin.end(prompt);
        child.on("close", () => { console.log(id, fs.existsSync(path.join(RAW, `${id}.png`)) ? "ok" : "MISSING"); resolve(); });
      });
    }
  };
  Promise.all([worker(), worker(), worker()]).then(() => console.log("DONE"));
}
