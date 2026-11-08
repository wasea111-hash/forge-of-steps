// Screenshots of the real game in a separate headless Edge with an empty profile. No dependencies, node's own WebSocket.
// Usage: node tools/shot.js <script.js> [width] [height]
// The script exports async (page) => {...}, with page.eval(code), page.shot(name), page.size(w, h), page.sleep(ms).
// Pictures go to the folder in SHOT_DIR. The game server must be running on port 4173.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), "forge-shots");
const PORT = 9347;
const BROWSERS = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = BROWSERS.find((file) => fs.existsSync(file));
  if (!exe) throw new Error("No Edge or Chrome found");
  const width = Number(process.argv[3] || 1440);
  const height = Number(process.argv[4] || 900);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "forge-profile-"));
  const browser = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--mute-audio", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  let target = null;
  for (let i = 0; i < 60 && !target; i += 1) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch (error) { /* still starting */ }
  }
  if (!target) throw new Error("The browser did not answer");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") errors.push(data.params.args.map((a) => a.value || a.description).join(" "));
    if (data.method === "Log.entryAdded" && data.params.entry.level === "error") errors.push(`${data.params.entry.text} ${data.params.entry.url || ""}`);
  };
  const send = (method, params = {}) => new Promise((resolve) => { id += 1; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  const page = {
    sleep,
    errors,
    async size(w, h, mobile = false) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }); },
    async go(url) { await send("Page.navigate", { url }); await sleep(1500); },
    async eval(code) {
      const result = await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
      if (result.result?.exceptionDetails) { const text = result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text; console.log("EVAL ERROR", text); errors.push(text); return undefined; }
      return result.result?.result?.value;
    },
    async shot(name) {
      const result = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(result.result.data, "base64"));
      console.log("saved", file);
    }
  };
  await page.size(width, height);
  await page.go("http://localhost:4173/?dev=1");
  await page.eval(`await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "tools/audit-ui.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    window.__open = async (c, l, t, keep) => { UIAudit.open(c, l, t); App.hero.ultimateSeen = [...new Set([...(App.hero.ultimateSeen || []), ...getUltimateGroups(App.hero).map((g) => g.owner)])]; await new Promise((r) => setTimeout(r, 350)); if (!keep) { document.querySelectorAll(".modal-layer").forEach((m) => m.remove()); document.querySelector(".story-layer")?.remove(); } await new Promise((r) => setTimeout(r, 250)); };`);
  try {
    await require(path.resolve(process.argv[2]))(page);
  } finally {
    if (errors.length) console.log("PAGE ERRORS:\n" + [...new Set(errors)].slice(0, 30).join("\n"));
    ws.close();
    browser.kill();
  }
}
main().catch((error) => { console.error(error); process.exit(1); }).then(() => process.exit(0));
