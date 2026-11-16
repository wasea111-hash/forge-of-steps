// The opening cinematic: painted frames with a slow camera, a narrator line under each, fades between them.
// Frames come from STORY_CINEMATIC (js/core/data.story.js). Plays once before the first hero; replay from the settings.
const Cinematic = { active: false, timer: null };

// The narrator's voice (Piper, CC0 voice "denis", made by tools/voice-cine.js). Off by default.
function cinematicVoiceOn() {
  return Boolean(App.save?.settings?.voice);
}
function cinematicVoiceSrc(id) {
  return `assets/voice/${id}.wav`;
}

function cinematicSrc(id) {
  return `assets/story/${id}.webp`;
}

// camera: { from: [scale, x%, y%], to: [scale, x%, y%] }
function cinematicMotion(frame) {
  const cam = frame.camera || {};
  const from = cam.from || [1, 0, 0];
  const to = cam.to || [1.08, 0, 0];
  return `--fx:${frame.focus ?? 50}%;--s0:${from[0]};--x0:${from[1]}%;--y0:${from[2]}%;--s1:${to[0]};--x1:${to[1]}%;--y1:${to[2]}%;--dur:${frame.seconds}s`;
}

function playCinematic(onDone) {
  const frames = (typeof STORY_CINEMATIC !== "undefined" ? STORY_CINEMATIC : []).filter((frame) => frame.id);
  if (!frames.length) { onDone?.(); return; }
  document.querySelector(".cine-layer")?.remove();
  const layer = document.createElement("div");
  layer.className = "cine-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Вступление");
  layer.innerHTML = `<div class="cine-stage"></div><div class="cine-bars" aria-hidden="true"></div>
    <p class="cine-text" aria-live="polite"></p>
    <div class="cine-tools"><button class="cine-btn cine-voice" type="button" aria-pressed="${cinematicVoiceOn()}">${cinematicVoiceOn() ? "Голос: вкл" : "Голос: выкл"}</button><button class="cine-btn cine-next" type="button">Дальше</button><button class="cine-btn cine-skip" type="button">Пропустить</button></div>
    <div class="cine-dots" aria-hidden="true">${frames.map(() => "<i></i>").join("")}</div>`;
  document.body.appendChild(layer);
  Cinematic.active = true;
  App.screen = "intro";
  GameAudio.syncScene();
  const stage = layer.querySelector(".cine-stage");
  const text = layer.querySelector(".cine-text");
  const dots = [...layer.querySelectorAll(".cine-dots i")];
  let index = -1;
  let closing = false;

  const close = () => {
    if (closing) return;
    closing = true;
    clearTimeout(Cinematic.timer);
    GameAudio.stopVoice?.();
    document.removeEventListener("keydown", onKey, true);
    layer.classList.add("closing");
    setTimeout(() => { layer.remove(); Cinematic.active = false; onDone?.(); }, 700);
  };
  const show = (next) => {
    if (next >= frames.length) { close(); return; }
    index = next;
    const frame = frames[index];
    const shot = document.createElement("div");
    shot.className = "cine-shot";
    shot.style.cssText = cinematicMotion(frame);
    shot.innerHTML = `<img class="cine-bg" src="${cinematicSrc(frame.id)}" alt="" draggable="false">${frame.layer ? `<img class="cine-fg" src="${cinematicSrc(frame.layer)}" alt="" draggable="false">` : ""}`;
    stage.appendChild(shot);
    // The old frame fades under the new one, then leaves.
    requestAnimationFrame(() => requestAnimationFrame(() => shot.classList.add("on")));
    [...stage.children].slice(0, -1).forEach((old) => { old.classList.add("off"); setTimeout(() => old.remove(), 1400); });
    text.classList.remove("on");
    setTimeout(() => { text.textContent = frame.text; text.classList.add("on"); }, 500);
    dots.forEach((dot, i) => dot.classList.toggle("on", i <= index));
    if (frame.sfx && SFX.play) SFX.play(frame.sfx);
    GameAudio.stopVoice?.();
    clearTimeout(Cinematic.voiceTimer);
    if (cinematicVoiceOn()) Cinematic.voiceTimer = setTimeout(() => { if (!closing && index === next) GameAudio.voice?.(cinematicVoiceSrc(frame.id)); }, 700);
    clearTimeout(Cinematic.timer);
    Cinematic.timer = setTimeout(() => show(index + 1), frame.seconds * 1000);
  };
  const onKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if ([" ", "Enter", "ArrowRight"].includes(event.key)) { event.preventDefault(); show(index + 1); }
  };
  document.addEventListener("keydown", onKey, true);
  layer.querySelector(".cine-skip").addEventListener("click", (event) => { event.stopPropagation(); close(); });
  layer.querySelector(".cine-voice").addEventListener("click", (event) => {
    event.stopPropagation();
    const on = !cinematicVoiceOn();
    App.save.settings.voice = on;
    writeSave(App.save);
    event.currentTarget.textContent = on ? "Голос: вкл" : "Голос: выкл";
    event.currentTarget.setAttribute("aria-pressed", String(on));
    if (on) GameAudio.voice?.(cinematicVoiceSrc(frames[index].id)); else GameAudio.stopVoice?.();
  });
  layer.querySelector(".cine-next").addEventListener("click", (event) => { event.stopPropagation(); show(index + 1); });
  stage.addEventListener("click", () => show(index + 1));
  show(0);
}

// The first "Новый герой" opens with the cinematic; after it, the class choice.
function cinematicSeen() {
  return Boolean(App.save?.settings?.introSeen);
}

function markCinematicSeen() {
  if (!App.save?.settings) return;
  App.save.settings.introSeen = true;
  persist();
}
