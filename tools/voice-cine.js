// Voices the opening cinematic with Piper (CC0 voice "denis") and writes small WAV files to assets/voice:
// mono, 16 kHz, 16 bit — every browser plays it, and the whole intro is about 1.5 MB, loaded only when the voice is on.
// Usage: node tools/voice-cine.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadCore } = require("./load-core");

const ROOT = path.join(__dirname, "..");
const PIPER = path.join(__dirname, "piper", "piper", "piper.exe");
const MODEL = path.join(__dirname, "piper", "ru_RU-denis-medium.onnx");
const OUT = path.join(ROOT, "assets", "voice");
fs.mkdirSync(OUT, { recursive: true });

function readWav(file) {
  const buf = fs.readFileSync(file);
  const dataAt = buf.indexOf("data") + 8;
  return { rate: buf.readUInt32LE(24), samples: new Int16Array(buf.buffer.slice(buf.byteOffset + dataAt, buf.byteOffset + buf.length)) };
}

function writeWav(file, rate, samples) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + samples.length * 2, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(samples.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([head, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]));
}

// Linear resampling with a short averaging window: enough for speech at 16 kHz.
function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Int16Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const at = i * ratio, j = Math.floor(at), t = at - j;
    const a = ((samples[j - 1] ?? samples[j]) + 2 * samples[j] + (samples[j + 1] ?? samples[j])) / 4;
    const b = (samples[j] + 2 * (samples[j + 1] ?? samples[j]) + (samples[j + 2] ?? samples[j])) / 4;
    out[i] = Math.round(a * (1 - t) + b * t);
  }
  return out;
}

const run = loadCore();
const frames = JSON.parse(run("JSON.stringify(STORY_CINEMATIC)"));
const tmp = path.join(OUT, "_tmp.wav");
frames.forEach((frame) => {
  const text = frame.text.replace(/[«»]/g, "").replace(/—/g, ",");
  execFileSync(PIPER, ["-m", MODEL, "--length_scale", "1.12", "--sentence_silence", "0.35", "-f", tmp], { input: text, stdio: ["pipe", "ignore", "ignore"] });
  const wav = readWav(tmp);
  const small = resample(wav.samples, wav.rate, 16000);
  const file = path.join(OUT, `${frame.id}.wav`);
  writeWav(file, 16000, small);
  console.log(`${frame.id}: ${(small.length / 16000).toFixed(1)} s, ${Math.round(fs.statSync(file).size / 1024)} KB`);
});
fs.unlinkSync(tmp);
