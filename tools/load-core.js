// Loads the browser core scripts into a Node VM, sharing one global scope like <script> tags do.
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const CORE_FILES = ["constants", "data.skills", "data.branches", "data.world", "util", "skills", "passives", "mechanics", "build", "talents", "data.talents", "data.run", "data.classes", "data.shop", "items", "hero", "combat", "expedition", "data.build.warrior", "data.build.mage", "data.build.archer", "data.build.bard", "data.build.assassin", "data.tree.warrior", "data.tree.mage", "data.tree.archer", "data.tree.bard", "data.tree.assassin", "data.lairtune", "data.lairbosses", "data.lairs", "data.story", "story", "camp", "save"];

function loadCore() {
  const context = vm.createContext({ console, Date, Math, JSON });
  CORE_FILES.forEach((name) => {
    // While one class is being written, half-written files of the others must not break its check.
    if (/^data\.(build|tree)\./.test(name) && process.env.FORGE_BUILD_ONLY && !name.endsWith(`.${process.env.FORGE_BUILD_ONLY}`)) return;
    const file = path.join(__dirname, "..", "js", "core", `${name}.js`);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  });
  return (code) => vm.runInContext(code, context);
}

module.exports = { loadCore };
