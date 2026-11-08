// Embeds the built models into one script, so the game also runs without a server and without fetch.
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "assets", "models");
const models = {};
fs.readdirSync(dir).filter((name) => name.endsWith(".glb")).forEach((name) => { models[name.replace(".glb", "")] = fs.readFileSync(path.join(dir, name)).toString("base64"); });
const out = path.join(__dirname, "..", "assets", "models.bundle.js");
fs.writeFileSync(out, "window.FORGE_MODELS = " + JSON.stringify(models) + ";\n");
console.log(Object.keys(models).join(", "), Math.round(fs.statSync(out).size / 1024) + " KB");
