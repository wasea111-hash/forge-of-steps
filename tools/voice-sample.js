// Voices one story scene with Piper as a sample to listen to. Not used by the game yet.
// Usage: node tools/voice-sample.js [sceneId=intro]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadCore } = require("./load-core");

const ROOT = path.join(__dirname, "..");
const PIPER = path.join(__dirname, "piper", "piper", "piper.exe");
const OUT = path.join(ROOT, "voice-sample");
const sceneId = process.argv[2] || "intro";

// Only the two CC0 voices. Women are a male voice raised in pitch: slowed by Piper, then played faster.
const VOICES = {
  narrator: { model: "denis", length: 1.08, pitch: 1 },
  sota: { model: "dmitri", length: 1.0, pitch: 1.04 },
  kern: { model: "dmitri", length: 1.12, pitch: 0.92 },
  mot: { model: "denis", length: 0.92, pitch: 1.06 },
  archivist: { model: "dmitri", length: 1.2, pitch: 0.88 },
  veya: { model: "denis", length: 1.25, pitch: 1.25 },
  nima: { model: "dmitri", length: 1.22, pitch: 1.22 }
};

function readWav(file) {
  const buf = fs.readFileSync(file);
  const dataAt = buf.indexOf("data") + 8;
  const samples = new Int16Array(buf.buffer.slice(buf.byteOffset + dataAt, buf.byteOffset + buf.length));
  return { rate: buf.readUInt32LE(24), samples };
}

function writeWav(file, rate, samples) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + samples.length * 2, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(samples.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.from(samples.buffer)]));
}

// Playing faster raises the pitch; Piper already spoke slower by the same amount, so the pace stays natural.
function repitch(samples, factor) {
  if (factor === 1) return samples;
  const out = new Int16Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i += 1) {
    const at = i * factor, j = Math.floor(at), t = at - j;
    out[i] = (samples[j] || 0) * (1 - t) + (samples[j + 1] || 0) * t;
  }
  return out;
}

const run = loadCore();
const scene = JSON.parse(run(`JSON.stringify(STORY_SCENES[${JSON.stringify(sceneId)}])`));
const names = JSON.parse(run(`JSON.stringify(Object.fromEntries(STORY_CHARACTERS.map((c) => [c.id, c.name])))`));
fs.mkdirSync(OUT, { recursive: true });
const tmp = path.join(OUT, "_tmp.wav");
const parts = [];
let rate = 22050;
const lines = scene.lines.filter((line) => !line.class && !line.if && !line.ifNot);
lines.forEach((line, i) => {
  const voice = VOICES[line.who] || VOICES.narrator;
  const text = line.text.replace(/\{name\}/g, "Ярь").replace(/[«»]/g, "");
  execFileSync(PIPER, ["-m", path.join(__dirname, "piper", `ru_RU-${voice.model}-medium.onnx`), "--length_scale", String(voice.length), "--sentence_silence", "0.25", "-f", tmp], { input: text, stdio: ["pipe", "ignore", "ignore"] });
  const wav = readWav(tmp);
  rate = wav.rate;
  const samples = repitch(wav.samples, voice.pitch);
  const who = names[line.who] || "Рассказчик";
  writeWav(path.join(OUT, `${String(i + 1).padStart(2, "0")}-${line.who}.wav`), rate, samples);
  parts.push(samples, new Int16Array(Math.floor(rate * 0.6)));
  console.log(`${i + 1}. ${who}: ${text.slice(0, 60)}`);
});
fs.unlinkSync(tmp);
const total = new Int16Array(parts.reduce((sum, p) => sum + p.length, 0));
let at = 0;
parts.forEach((p) => { total.set(p, at); at += p.length; });
writeWav(path.join(OUT, `${sceneId}-full.wav`), rate, total);
console.log(`scene ${sceneId}: ${(total.length / rate).toFixed(1)} s -> voice-sample/${sceneId}-full.wav`);
