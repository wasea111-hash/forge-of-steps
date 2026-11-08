// Generates painted pose sheets through Codex: one image holds every pose of a fighter, so the character stays the same.
// Usage: node tools/gen-sprites.js [id ...]. Finished sheets are skipped. Then run: node tools/cut-sprites.js
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "art", "sprites");
const CODEX = require("./codex-path");
fs.mkdirSync(RAW, { recursive: true });

const STYLE = "Hand-painted dark fantasy game character art in the style of a premium painterly 2D RPG: confident ink linework, rich oil-paint shading, strong silhouette, dramatic rim light. Game sprite sheet.";
const layout = (subject, facing, key) => `One single image: a sprite sheet with a strict grid of 3 columns and 2 rows, six equal cells with wide empty gaps, poses never touching each other. The same exact ${subject} in every cell, identical face, costume, colours and details. Whole body visible in each cell, nothing cropped, standing on the same baseline, side-on three-quarter view facing ${facing}. The whole background is one perfectly flat solid pure ${key === "green" ? "green colour (#00FF00)" : "magenta colour (#FF00FF)"}, no cast shadow, no scenery, no gradient, no grid lines, no text, no labels. No ${key === "green" ? "green" : "pink or magenta"} anywhere on the subject and no coloured reflection from the background.`;
const HERO = "Realistic adult proportions, 7.5 heads tall.";
const FIGHTER = "Cells in reading order: (1) calm ready combat stance; (2) powerful melee strike at full extension; (3) low fast dash forward, body leaning hard, cloth streaming behind; (4) casting or throwing, free arm thrust forward; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated.";
const BEAST = "Cells in reading order: (1) stalking, head low, snarling; (2) mid-air bite or gore, jaws open; (3) sprinting at full stretch; (4) roaring, head raised; (5) recoiling from a hit; (6) dead on its side.";
const FLOATER = "Cells in reading order: (1) hovering, menacing and calm; (2) lashing forward at full reach; (3) streaking forward very fast, stretched out; (4) channelling power, energy gathering; (5) recoiling, shape disturbed by a hit; (6) collapsed, broken apart and fading.";
const hero = (who, poses = FIGHTER) => ({ faces: 1, prompt: `${STYLE} ${layout("character", "RIGHT", "magenta")} ${HERO} The character: ${who} ${poses}` });
const foe = (who, kind = "fighter", key = "magenta") => {
  const beast = kind === "beast";
  const subject = kind === "fighter" ? "character" : "creature";
  const poses = beast ? BEAST : kind === "floater" ? FLOATER : FIGHTER;
  return { faces: beast ? -1 : 1, prompt: `${STYLE} ${layout(subject, beast ? "LEFT" : "RIGHT", key)} The ${subject}: ${who} ${poses}` };
};

const SHEETS = {
  warrior: hero("a broad veteran warrior in battered steel plate over a dark red tabard, fur mantle, longsword and round iron shield, short dark beard."),
  assassin: hero("a lean hooded assassin in layered charcoal leather armour with a blood-red scarf and short tattered crimson cloak, twin curved daggers."),
  mage: hero("a gaunt grey-bearded battle mage in deep blue layered robes with golden trim, tall carved wooden staff topped with a glowing pale crystal, no pointed hat.", "Cells in reading order: (1) calm ready stance holding the staff; (2) swinging the staff in a strong strike; (3) gliding fast forward, robes streaming behind; (4) casting a spell, free hand thrust forward, staff raised; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated."),
  archer: hero("an agile forest ranger with a deep green hooded cloak, brown leather armour, quiver of arrows on the back, tall yew longbow.", "Cells in reading order: (1) calm ready stance, bow lowered; (2) striking with the bow in melee at full extension; (3) low fast sprint forward, cloak streaming behind; (4) bow fully drawn and aimed straight ahead, arrow nocked; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated."),
  bard: hero("a dashing travelling bard in a crimson doublet and wide feathered hat, tall leather boots, ornate lute held in both hands, a small tuning fork in a belt case, no sword, no rapier, no dagger, no blade of any kind.", "Cells in reading order: (1) relaxed ready stance holding the lute; (2) a forceful two-handed sideways blunt strike with the body of the lute at full extension; (3) fast dancing dash forward, coat streaming behind; (4) strumming the lute hard and singing, mouth open, head up; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated, lute beside him."),
  wolf: foe("a huge gaunt grey dire wolf with scarred hide, bristling spiny mane and yellow eyes.", "beast"),
  bandit: foe("a scruffy forest bandit in patched brown leather with a dirty hood and rough short sword."),
  slime: foe("a large translucent swamp slime, a glossy mossy-green blob with bubbles, bones and leaves floating inside, no face except two dim sunken eyes.", "floater"),
  hunter: foe("a tall dusk hunter in a slate-blue hooded coat with a wide-brimmed hat and a long curved hunting knife."),
  boar: foe("a massive tusked wild boar with coarse dark-brown bristles, scarred snout and huge curved yellow tusks.", "beast"),
  greyfang: foe("an enormous pale silver-white alpha dire wolf with battle scars, one torn ear, broken arrows in its hide and glowing eyes, bigger and more regal than any wolf.", "beast"),
  ash_slime: foe("a large slime of grey ash and molten sludge, cracked crust over glowing orange embers, two dim sunken eyes.", "floater"),
  ember_imp: foe("a small wiry fire imp with charred black-red skin, glowing cracks, little horns, long burning claws and a cruel grin."),
  cinder_knight: foe("a knight in scorched blackened plate armour with glowing orange seams, a smouldering tower shield and a heavy pitted sword, faceless helm with embers inside."),
  scorched_hound: foe("a burned skeletal hound with charred flesh, exposed ribs glowing from within, flames along its spine.", "beast"),
  pyre_cultist: foe("a robed fire cultist in ragged ochre and soot-black robes, an ash-painted face, holding a burning censer on a chain."),
  pyre_queen: foe("a terrifying tall burning queen in a gown of charred black lace and molten gold, a crown of fire, floating embers, sceptre of bone."),
  rune_guard: foe("a blocky ancient stone guardian construct, carved blue-grey masonry body with glowing cyan runes, massive fists, no neck, a slit for eyes."),
  wraith: foe("a weeping ghost, a gaunt pale-blue translucent woman in tattered flowing shrouds, hollow eyes, long reaching fingers, legless, trailing mist.", "floater"),
  stone_golem: foe("a hulking golem of rough mossy boulders held together by cracks of pale light, enormous arms, small head."),
  mad_scribe: foe("a hunched mad scribe in stained teal robes covered in ink, pages stuck all over him, a huge quill in one hand and an open book in the other, wild eyes."),
  rust_stalker: foe("a lean trapper in rust-eaten iron scale armour with an iron mask, a hooked chain and a corroded sickle."),
  archivist: foe("a colossal nameless archivist construct of pale blue stone and floating book pages, a blank mask for a face, huge stone hands, glowing glyphs."),
  void_stalker: foe("a void hunter, a tall thin shadow creature in deep violet with star-like specks inside its body, long blade arms, no face, legless trailing smoke.", "floater", "green"),
  hollow_pilgrim: foe("a hollow pilgrim in worn lavender-grey robes and a pilgrim hat, an empty dark void where the face should be, a long staff with a hanging lantern.", "fighter", "green"),
  limit_shard: foe("a floating giant shard of pale cyan crystal with sharp splinters orbiting it and a burning light in its core, no limbs.", "floater"),
  star_eater: foe("a monstrous star-eater beast with a deep indigo hide full of constellations, a huge gaping maw with rows of teeth, six eyes.", "beast", "green"),
  echo_wanderer: foe("the pale echo of a wanderer, a translucent ghostly white-lilac swordsman with a blurred doubled silhouette, long coat and a thin blade.", "fighter", "green"),
  smith: foe("the Smith of Steps, a giant bare-armed blacksmith god with bronze skin, a burning beard, a heavy leather apron with glowing runes and an enormous forge hammer."),
  hedge_witch: foe("a wild forest witch in moss-green rags with a crown of antlers and twigs, a gnarled wand, herbs hanging from her belt."),
  brazier: foe("a floating black iron brazier in the shape of a crowned cage, full of roaring orange flames, chains hanging from it, no limbs.", "floater"),
  page_swarm: foe("a swirling swarm of torn parchment pages in the rough shape of a hooded figure, ink dripping, glowing letters.", "floater"),
  anvil_spirit: foe("a spirit of a living anvil, a stocky body of dark iron with an anvil for a head and shoulders, molten orange cracks, heavy chain arms."),
  // Lair masters: one huge opponent each, far larger and more detailed than ordinary foes.
  lair_she_wolf: foe("a colossal ancient she-wolf the size of a house, silver-black matted fur, a mane of bone spurs, dozens of old broken spears stuck in her flanks, blood-red eyes, jaws dripping, monstrous and regal.", "beast"),
  lair_viper_mother: foe("a gigantic serpent matriarch, the upper body of a scaled venomous woman with a cobra hood and four clawed arms, the lower body a thick coiled olive-and-black python tail, green venom dripping from long fangs, a crown of living vipers."),
  lair_ash_seneschal: foe("a towering undead court seneschal of a burned palace, a giant in charred ceremonial armour and a long burning mantle of ash, an ember-filled hollow helm with a crown, a huge flaming iron sceptre as tall as himself, cinders pouring off him."),
  lair_executioner: foe("a monstrous hulking executioner, an enormous bare-chested brute with grey scarred skin, a blood-soaked black leather hood, chains and hooks across the chest, a gigantic crimson-stained two-handed execution axe."),
  lair_first_scribe: foe("a horrifying giant scribe, a huge hunched figure wrapped in inked bandages and teal robes, many long thin arms each holding a quill, a gigantic open grimoire chained to its chest with an eye in the pages, ink pouring from where its face should be.", "fighter", "green"),
  lair_widow: foe("a giant faceless ghostly widow, an immense floating figure in a black lace mourning gown and a long veil over a smooth blank face, long skeletal white hands, a pale cold light under the veil, legless, shrouds trailing into mist.", "floater", "green"),
  lair_rift_heart: foe("a colossal living heart of molten rock and cyan crystal bursting from a rift, huge veins of lava, crystal spikes and ribs of black stone around it, burning white core, a monstrous floating mass with heavy stone tendrils for arms, no face.", "floater", "green"),
  lair_forge_titan: foe("a gigantic forged titan, a walking furnace in layered black iron plates with molten seams, an anvil-shaped head with a burning visor, massive pistons in the arms and a colossal smithing hammer with a glowing head.")
};

fs.writeFileSync(path.join(RAW, "_sheets.json"), JSON.stringify(Object.fromEntries(Object.entries(SHEETS).map(([id, s]) => [id, { faces: s.faces }])), null, 1));

const named = process.argv.slice(2);
const queue = (named.length ? named : Object.keys(SHEETS)).filter((id) => !fs.existsSync(path.join(RAW, `${id}.png`)));
console.log("sheets to draw:", queue.length);
const worker = async () => {
  while (queue.length) {
    const id = queue.shift();
    await new Promise((resolve) => {
      const prompt = `Generate one image with your image generation tool, size 1536x1024, with exactly this prompt: ${SHEETS[id].prompt}\nAfter it is generated, copy its PNG into the current working directory as ${id}.png. Do not do anything else.`;
      const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-"], { stdio: ["pipe", "ignore", "ignore"] });
      child.stdin.end(prompt);
      child.on("close", (code) => { console.log(id, "exit", code, fs.existsSync(path.join(RAW, `${id}.png`)) ? "ok" : "MISSING"); resolve(); });
    });
  }
};
Promise.all([worker(), worker(), worker(), worker()]).then(() => console.log("DONE"));
