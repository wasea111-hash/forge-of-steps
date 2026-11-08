// Draws how a hero looks after choosing a subclass or a profession: the same person, a changed outfit, 12 poses.
// The class sheet is the reference for the first sheet, and the first sheet for the second. Finished sheets are skipped.
// Usage: node tools/gen-looks.js [id ...]. Saved as art/sprites/look_<id>.png and look_<id>__b.png
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const RAW = path.join(__dirname, "..", "art", "sprites");
const CODEX = require("./codex-path");
const POSES_A = "(1) calm ready combat stance; (2) powerful strike at full extension; (3) low fast dash forward, body leaning hard, cloth streaming behind; (4) casting or throwing or shooting, arm thrust forward; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated";
const POSES_B = "(1) weapon raised high behind the head, body coiled, the wind-up before a heavy blow; (2) the end of a crushing downward blow, weapon driven down at the ground in front, knees bent; (3) a long low forward thrust, arm and weapon in one straight line; (4) braced, blocking, weight back; (5) in mid-air leaping forward, both feet off the ground; (6) triumphant, weapon raised, chest out";

// A bard's instrument takes both hands: its blows are the instrument itself and the sound.
const BARD_POSES_A = "(1) relaxed ready stance holding the instrument in both hands; (2) a forceful two-handed sideways blunt strike with the body of the instrument at full extension; (3) fast dancing dash forward, coat streaming behind, instrument held to the chest; (4) strumming hard with both hands and singing, a visible wave of sound going forward; (5) recoiling from a hit, head snapped back; (6) collapsed on the ground, defeated, the instrument beside the body";
const BARD_POSES_B = "(1) leaning back, fingers poised above the strings before a powerful chord; (2) strumming a forceful downward chord, knees bent, mouth open in song; (3) sweeping the instrument forward in both hands in a low blunt strike, a ring of sound bursting from it; (4) dancing aside on one foot, the instrument held securely in both hands; (5) spinning in a mid-air leap with the instrument against the chest; (6) bowing with the instrument held against the chest";

const LOOKS = {
  // Warrior
  fury: ["warrior", "the same warrior on the path of fury: lighter torn armour, bare scarred arms, red war paint across the face, no shield, a heavy two-handed greatsword"],
  berserk: ["warrior", "the same warrior as a berserker: bare scarred blood-streaked torso, wolf pelt on the shoulders, wild hair, red paint, two heavy notched axes, no shield"],
  breaker: ["warrior", "the same warrior as a breaker: massive dented black plate with iron bands, cracked pauldrons, an enormous two-handed war hammer, no shield"],
  bulwark: ["warrior", "the same warrior on the path of the bulwark: full heavy steel plate, closed gorget, a huge rectangular tower shield and a short sword"],
  guardian: ["warrior", "the same warrior as a guardian: ornate gold-trimmed plate covered in spikes, a spiked tower shield, a white-gold tabard, a broad sword"],
  duelist: ["warrior", "the same warrior as a duelist: elegant fitted breastplate over a dark red coat, a small round buckler, a straight one-handed longsword with a practical guard, no rapier, no helmet"],
  // Mage
  elemental: ["mage", "the same mage as an elementalist: robes woven in four colours of fire, water, earth and air, four small elemental motes circling the staff"],
  fire: ["mage", "the same mage as a fire mage: charred crimson and orange robes with glowing ember hems, a staff topped with a burning coal, burn scars on the hands"],
  water: ["mage", "the same mage as a water mage: flowing deep teal and pale blue robes, wet hair, a staff of coral holding a floating water orb"],
  earth: ["mage", "the same mage as an earth mage: heavy stone-grey robes with slate pauldrons and mineral veins, a staff of raw rock and crystal"],
  air: ["mage", "the same mage as an air mage: light silver-white windswept robes always streaming, feathers, a slim staff crackling with pale lightning"],
  summoner: ["mage", "the same mage as a summoner: dark green and violet robes covered in sigils, a thick chained grimoire at the belt, a staff with a summoning ring"],
  spirit: ["mage", "the same mage as a spirit caller: pale teal robes, a spirit lantern hanging from the staff, soft ghostly wisps around the shoulders"],
  undead: ["mage", "the same mage as a necromancer: tattered black robes with bone clasps, a mantle of ribs, a staff topped with a skull, sickly green glow"],
  light_dark: ["mage", "the same mage balanced between light and dark: robes split half white-gold and half black-violet, a staff with a sun and crescent"],
  light: ["mage", "the same mage as a mage of light: radiant white and gold robes, a halo-shaped ring behind the head, a golden staff with a sun disc"],
  dark: ["mage", "the same mage as a mage of darkness: hooded black and violet robes, sacrificial scars on the arms, a staff of black iron with a dark flame"],
  // Archer
  marksman: ["archer", "the same archer as a marksman: fitted dark leather long coat, a hood drawn back, precise steel bracers, a long composite war bow"],
  sniper: ["archer", "the same archer as a sniper: a ragged camouflage cloak of leaves and strips, a face wrap, an enormous six-foot longbow, a few very long arrows"],
  stormshot: ["archer", "the same archer as a stormshot: light blue-grey gear, two quivers packed with arrows, a short recurve bow with crackling lightning on the string"],
  wild: ["archer", "the same archer on the wild path: furs and bone charms, feathers in the hair, a bow of antler and sinew"],
  ranger: ["archer", "the same archer as a ranger: deep forest green cloak, belts of venom vials and iron traps, a sturdy hunting bow"],
  beastmaster: ["archer", "the same archer as a beastmaster: a full wolf pelt with the wolf's head as a hood, claw necklaces, a bone bow"],
  // Bard
  lyre: ["bard", "the same bard on the path of the lyre: a richly embroidered blue and gold coat, an ornate golden lyre held in both hands, no blade"],
  hymn: ["bard", "the same bard on the path of the hymn: long pale devotional robes with a gold stole, a hymnal on the belt, a simple wooden lute held in both hands, no blade"],
  skald: ["bard", "the same bard as a northern skald: fur cloak, braided hair and beard, chain shirt, a heavy iron-strung lute with a reinforced body held in both hands and used for blunt strikes, no blade"],
  trickster: ["bard", "the same bard as a trickster: a harlequin coat of red and black diamonds, a half mask, playing cards tucked in the belt, a small crooked lute held in both hands, no blade"],
  cantor: ["bard", "the same bard as a cantor: white and gold choir vestments, a glowing songbook at the belt, a pale wooden lyre held in both hands, mouth open in song, no blade"],
  choirmaster: ["bard", "the same bard as a choirmaster: long dark velvet coat with gold thread, a dark wooden lute with gold strings held in both hands, faint ghostly singers' faces as shoulder ornaments, no conductor's staff, no blade"],
  // Assassin
  shade: ["assassin", "the same assassin on the path of shade: all black layered wraps, a deep hood with only the eyes visible, shadow smoke at the hems, black-bladed daggers"],
  blade: ["assassin", "the same assassin as a night blade: fitted dark red and black armour, a long scarf, two short curved daggers, one in each hand, no swords"],
  phantom: ["assassin", "the same assassin as a phantom: pale grey translucent veils, a blank white mask, a faintly doubled outline, thin ghostly daggers"],
  venom: ["assassin", "the same assassin on the path of venom: dark green leathers, glass vials across the chest, daggers dripping green"],
  poisoner: ["assassin", "the same assassin as a poisoner: stained green apron over leather, rows of labelled vials, a cloth mask, hooked daggers coated in venom"],
  plaguebearer: ["assassin", "the same assassin as a plaguebearer: a dark waxed robe, a long beaked plague mask, two rusted hooked daggers, one in each hand, sickly green fumes around the blades"]
};

function draw(file, reference, what, poses) {
  return new Promise((resolve) => {
    const prompt = `Generate one image with your image generation tool, size 1536x1024, using the attached sprite sheet as the reference for the person, the painting style, the proportions and the scale: ${what}. Keep the same face and build, the outfit and weapon change as described. One single image: a sprite sheet with a strict grid of 3 columns and 2 rows, six equal cells with wide empty gaps, poses never touching each other. The same exact character in every cell. Whole body visible in each cell, nothing cropped, standing on the same baseline, side-on three-quarter view facing RIGHT. The whole background is one perfectly flat solid pure magenta colour (#FF00FF), no cast shadow, no scenery, no gradient, no grid lines, no text. No pink or magenta on the character. Poses in reading order: ${poses}.\nAfter it is generated, copy its PNG into the current working directory as ${file}. Do not do anything else.`;
    let log = "";
    const child = spawn(CODEX, ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", RAW, "--disable", "code_mode", "-c", 'model_reasoning_effort="low"', "-i", path.join(RAW, reference), "-"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    child.stdin.end(prompt);
    child.on("close", () => { const ok = fs.existsSync(path.join(RAW, file)); console.log(file, ok ? "ok" : `MISSING ${/usage limit[^\n]*/i.exec(log)?.[0] || ""}`); resolve(ok); });
  });
}

const named = process.argv.slice(2);
const queue = (named.length ? named : Object.keys(LOOKS)).slice();
const worker = async () => {
  while (queue.length) {
    const id = queue.shift();
    const [classKey, what] = LOOKS[id];
    const a = `look_${id}.png`;
    const b = `look_${id}__b.png`;
    if (!fs.existsSync(path.join(RAW, a))) await draw(a, `${classKey}.png`, what, classKey === "bard" ? BARD_POSES_A : POSES_A);
    if (fs.existsSync(path.join(RAW, a)) && !fs.existsSync(path.join(RAW, b))) await draw(b, a, what, classKey === "bard" ? BARD_POSES_B : POSES_B);
  }
};
Promise.all([worker(), worker(), worker(), worker()]).then(() => console.log("DONE"));
