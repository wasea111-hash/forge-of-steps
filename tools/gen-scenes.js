// Draws the layers of each battle location through Codex, so the fight has real depth.
// Usage: node tools/gen-scenes.js [prefix]. Finished images are skipped.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RAW = path.join(__dirname, "..", "art", "scenes");
const CODEX = require("./codex-path");
fs.mkdirSync(RAW, { recursive: true });

const STYLE = "Painterly dark fantasy game background art, rich oil-paint shading, confident brushwork, no characters, no text, no UI.";
const FAR = `${STYLE} Wide side-on view for a 2D side-view battle scene. The lower 25 percent of the image fades into soft low mist with no ground detail and no path, so it can sit behind a separate ground layer. The horizon is low. Atmospheric perspective, distant and slightly hazy.`;
const MID = `${STYLE} Wide side-on layer for a 2D parallax battle scene: only the objects described stand along the bottom edge of the image, rooted at the very bottom edge, with nothing floating. Everything else is one perfectly flat solid pure magenta colour (#FF00FF), no gradient, no shadows on the background, no magenta on the objects. The centre third stays lower so that fighters in front remain clear.`;
const FORE = `${STYLE} Wide side-on foreground strip for a 2D parallax battle scene, seen very close to the camera, dark and slightly blurred: objects rise only from the bottom edge and at the far left and far right corners, and the middle stays very low. Everything else is one perfectly flat solid pure magenta colour (#FF00FF), no gradient, no magenta on the objects.`;
const GROUND = `${STYLE} Seamless tileable top-down texture of the ground surface, evenly lit, no large single objects, no strong shadows, no perspective, readable fine detail, low contrast, suited to being laid on a floor in a game.`;

const SCENES = {
  thicket: { far: "A deep ancient forest, huge pale distant pines in golden god rays and mist.", mid: "Massive dark mossy pine trunks and big ferns, mushroom shelves, a mossy boulder.", fore: "Dark ferns, grass blades and a mossy root.", ground: "Forest floor: packed earth, moss patches, fallen needles and small stones." },
  ashlands: { far: "A burning volcanic wasteland: far smoking black mountains, a ruined bridge, an ember-orange sky with ash clouds.", mid: "Charred dead trees, jagged black basalt rocks with glowing lava cracks.", fore: "Charred rocks, burnt twigs with glowing embers.", ground: "Scorched cracked black earth with grey ash and thin glowing ember veins." },
  ruins: { far: "A forgotten city of masters at moonlit night: far towers and arches with cyan runes, blue mist.", mid: "Broken stone columns and arch remains with faint cyan runes, overgrown ivy and fallen blocks.", fore: "Fallen carved stones and dark ivy.", ground: "Old cracked flagstones with moss in the joints and faint worn carvings." },
  limit: { far: "The edge of the world: an endless violet void with stars, huge floating shards of land, pale light pouring from a crack in the sky.", mid: "Jagged dark rock spires and large glowing blue-violet crystal clusters.", fore: "Sharp dark crystals and rock shards with faint violet glow.", ground: "Dark violet cracked stone with small crystal grit and thin glowing lines." }
};

const items = [];
for (const [id, s] of Object.entries(SCENES)) {
  items.push([`${id}_far`, "1536x1024", `${FAR} ${s.far}`], [`${id}_mid`, "1536x1024", `${MID} Objects: ${s.mid}`], [`${id}_fore`, "1536x1024", `${FORE} Objects: ${s.fore}`], [`${id}_ground`, "1024x1024", `${GROUND} Surface: ${s.ground}`]);
}
const prefix = process.argv[2] || "";
const queue = items.filter(([id]) => id.startsWith(prefix) && !fs.existsSync(path.join(RAW, `${id}.png`)));
console.log("to draw:", queue.length);
const worker = async () => {
  while (queue.length) {
    const [id, size, text] = queue.shift();
    await new Promise((resolve) => {
      let log = "";
      const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-"], { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (d) => { log += d; });
      child.stderr.on("data", (d) => { log += d; });
      child.stdin.end(`Generate one image with your image generation tool, size ${size}, with exactly this prompt: ${text}\nAfter it is generated, copy its PNG into the current working directory as ${id}.png. Do not do anything else.`);
      child.on("close", () => { const ok = fs.existsSync(path.join(RAW, `${id}.png`)); console.log(id, ok ? "ok" : `MISSING ${/usage limit[^\n]*/i.exec(log)?.[0] || ""}`); resolve(); });
    });
  }
};
Promise.all([worker(), worker(), worker(), worker()]).then(() => console.log("DONE"));
