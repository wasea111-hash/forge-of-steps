// Finds the Codex desktop app's executable. Its folder name changes with every app update.
const { execSync } = require("child_process");
const path = require("path");

const location = execSync('powershell -NoProfile -Command "(Get-AppxPackage OpenAI.Codex).InstallLocation"', { encoding: "utf8" }).trim();
if (!location) throw new Error("Codex app is not installed");
module.exports = path.join(location, "app", "resources", "codex.exe");
