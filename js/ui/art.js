// Original procedural SVG art: characters, enemies, icons. Sprites face right; enemies are mirrored in CSS.
function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift) => clamp(((value >> shift) & 255) + Math.round(255 * amount), 0, 255);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

let artIdCounter = 0;

function spriteShell(inner, { viewBox = "0 0 240 280", defs = "", extraClass = "" } = {}) {
  return `<svg class="sprite ${extraClass}" viewBox="${viewBox}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${inner}</svg>`;
}

function grad(id, top, bottom) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
}

function glowFilter(id, blur = 5) {
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${blur}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

const HERO_PALETTE = {
  warrior: { main: "#8d6a4b", light: "#c9a06c", dark: "#2c2320", accent: "#ff9d4a", cape: "#7c2d24" },
  mage: { main: "#3d4a8f", light: "#7f8fe0", dark: "#171a35", accent: "#6fe3ff", cape: "#2a2f6a" },
  archer: { main: "#4e6b45", light: "#8fb06f", dark: "#1d2a1c", accent: "#d7f07a", cape: "#2f4a2c" },
  bard: { main: "#8c4a7b", light: "#d48cc0", dark: "#2e1a2c", accent: "#ffd27a", cape: "#5e2a6b" },
  assassin: { main: "#3a3a48", light: "#74748c", dark: "#121218", accent: "#ff5470", cape: "#22222e" }
};

function heroSprite(classKey) {
  const id = `a${(artIdCounter += 1)}`;
  const p = HERO_PALETTE[classKey] || HERO_PALETTE.warrior;
  const defs = `${grad(`${id}b`, p.light, p.main)}${grad(`${id}d`, p.main, p.dark)}${grad(`${id}c`, p.cape, shade(p.cape, -0.14))}${glowFilter(`${id}g`)}`;
  const skin = "#d9b08c";
  const shadow = `<ellipse class="sp-shadow" cx="118" cy="266" rx="62" ry="10" fill="#000" opacity=".45"/>`;
  const art = {
    warrior: `
      <g class="sp-cape"><path d="M84 92 C52 130 46 196 58 244 L96 232 L108 104 Z" fill="url(#${id}c)"/></g>
      <g class="sp-body">
        <path d="M92 188 L84 256 L106 256 L116 198 Z" fill="url(#${id}d)"/><path d="M128 190 L142 256 L164 256 L148 186 Z" fill="url(#${id}d)"/>
        <path d="M82 256 h28 v8 h-34 Z M138 256 h30 l6 8 h-36 Z" fill="${p.dark}"/>
        <path d="M78 106 Q118 84 158 106 L152 192 Q118 206 88 192 Z" fill="url(#${id}b)"/>
        <path d="M100 118 L118 112 L136 118 L130 176 L118 186 L106 176 Z" fill="${p.dark}" opacity=".55"/>
        <path d="M112 134 L118 124 L124 134 L118 164 Z" fill="${p.accent}" filter="url(#${id}g)" class="sp-glow"/>
        <rect x="84" y="182" width="68" height="12" rx="3" fill="${p.dark}"/><rect x="110" y="180" width="16" height="16" rx="3" fill="${p.light}"/>
        <path d="M64 96 Q84 80 102 96 L96 124 Q74 128 62 118 Z" fill="${p.light}"/><path d="M134 96 Q152 80 172 96 L174 118 Q160 128 140 124 Z" fill="${p.light}"/>
        <path d="M92 72 Q92 34 118 34 Q144 34 144 72 L140 92 Q118 102 96 92 Z" fill="url(#${id}b)"/>
        <path d="M92 58 L60 30 L74 66 Z M144 58 L176 30 L162 66 Z" fill="${p.light}"/>
        <path d="M100 62 H136 V70 L128 92 H108 L100 70 Z" fill="${p.dark}"/><rect x="104" y="64" width="28" height="4" fill="${p.accent}" class="sp-glow" filter="url(#${id}g)"/>
        <g class="sp-offhand"><path d="M44 128 Q72 118 92 128 Q92 176 68 198 Q44 176 44 128 Z" fill="url(#${id}d)" stroke="${p.light}" stroke-width="4"/><path d="M68 136 V186 M50 150 H86" stroke="${p.accent}" stroke-width="3" opacity=".7"/></g>
        <g class="sp-weapon"><path d="M156 150 L170 158 L214 40 L210 22 L198 32 Z" fill="#cfd8e6"/><path d="M198 32 L210 22 L214 40 L176 142 Z" fill="#8894a8"/><path d="M146 148 L182 168" stroke="${p.light}" stroke-width="9" stroke-linecap="round"/><path d="M162 160 L154 182" stroke="${p.dark}" stroke-width="9" stroke-linecap="round"/></g>
      </g>`,
    mage: `
      <g class="sp-cape"><path d="M88 94 C58 140 52 210 62 258 L124 258 L118 100 Z" fill="url(#${id}c)"/></g>
      <g class="sp-body">
        <path d="M84 104 Q118 88 150 104 L172 258 Q118 272 70 258 Z" fill="url(#${id}b)"/>
        <path d="M108 110 L128 110 L138 258 L100 258 Z" fill="${p.dark}" opacity=".5"/>
        <path d="M118 124 L128 142 L118 168 L108 142 Z" fill="${p.accent}" class="sp-glow" filter="url(#${id}g)"/>
        <path d="M82 104 Q68 124 74 158 L92 156 L100 108 Z" fill="${p.main}"/><path d="M152 104 Q170 118 172 150 L154 156 L138 108 Z" fill="${p.main}"/>
        <path d="M78 60 Q118 -6 158 60 Q158 92 150 106 Q118 118 86 106 Q78 92 78 60 Z" fill="url(#${id}d)"/>
        <path d="M118 8 L150 66 L86 66 Z" fill="url(#${id}b)"/>
        <ellipse cx="118" cy="82" rx="23" ry="24" fill="${p.dark}"/><path d="M106 80 h8 M122 80 h8" stroke="${p.accent}" stroke-width="4" stroke-linecap="round" class="sp-glow" filter="url(#${id}g)"/>
        <g class="sp-weapon"><path d="M184 28 L172 258" stroke="#5c4632" stroke-width="8" stroke-linecap="round"/><path d="M168 34 Q186 8 202 34 Q190 54 184 54 Q176 54 168 34 Z" fill="#8a6a46"/><circle cx="185" cy="30" r="13" fill="${p.accent}" class="sp-glow" filter="url(#${id}g)"/><circle cx="181" cy="26" r="4" fill="#fff" opacity=".8"/><path d="M170 150 Q160 148 156 142" stroke="${skin}" stroke-width="10" stroke-linecap="round"/></g>
        <g class="sp-orbit" fill="${p.accent}" opacity=".8"><path d="M40 90 l6 10 -6 10 -6 -10 Z"/><path d="M210 120 l5 8 -5 8 -5 -8 Z"/><path d="M34 170 l4 7 -4 7 -4 -7 Z"/></g>
      </g>`,
    archer: `
      <g class="sp-cape"><path d="M92 90 C66 120 56 170 62 214 L102 200 L114 104 Z" fill="url(#${id}c)"/></g>
      <g class="sp-body">
        <path d="M92 182 L78 258 L98 258 L114 196 Z" fill="url(#${id}d)"/><path d="M124 186 L146 258 L166 258 L142 182 Z" fill="url(#${id}d)"/>
        <path d="M76 256 h26 v8 h-32 Z M144 256 h26 l6 8 h-34 Z" fill="${p.dark}"/>
        <path d="M88 104 Q118 92 148 104 L144 190 Q118 200 94 190 Z" fill="url(#${id}b)"/>
        <path d="M90 118 L146 174 M146 118" stroke="${p.dark}" stroke-width="8" opacity=".7"/>
        <g class="sp-offhand"><path d="M70 92 L58 60 L78 54 L86 88 Z" fill="#5c4632"/><path d="M62 56 L58 40 M70 54 L68 36 M78 52 L80 34" stroke="${p.accent}" stroke-width="3"/></g>
        <path d="M84 62 Q84 22 118 22 Q152 22 152 62 Q152 92 142 104 Q118 112 96 104 Q84 92 84 62 Z" fill="url(#${id}d)"/>
        <ellipse cx="124" cy="72" rx="20" ry="23" fill="${p.dark}"/><path d="M118 70 h8 M132 70 h7" stroke="${p.accent}" stroke-width="3.5" stroke-linecap="round" class="sp-glow" filter="url(#${id}g)"/>
        <path d="M146 112 L182 132" stroke="${skin}" stroke-width="11" stroke-linecap="round"/><path d="M92 116 L134 136" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
        <g class="sp-weapon"><path d="M186 30 Q232 134 186 240" fill="none" stroke="#6d4f33" stroke-width="8" stroke-linecap="round"/><path d="M186 30 L134 136 L186 240" fill="none" stroke="#e4e2d4" stroke-width="1.5"/><path d="M134 136 L226 132" stroke="${p.light}" stroke-width="3"/><path d="M226 132 l-12 -6 v12 Z" fill="${p.accent}" class="sp-glow" filter="url(#${id}g)"/></g>
      </g>`,
    bard: `
      <g class="sp-cape"><path d="M90 92 C50 120 44 190 56 242 C78 232 96 236 112 228 L116 104 Z" fill="url(#${id}c)"/></g>
      <g class="sp-body">
        <path d="M96 190 L88 258 L108 258 L116 198 Z" fill="url(#${id}d)"/><path d="M126 192 L138 258 L158 258 L146 188 Z" fill="url(#${id}d)"/>
        <path d="M86 256 h26 v8 h-32 Z M136 256 h26 l6 8 h-34 Z" fill="${p.dark}"/>
        <path d="M86 106 Q118 92 150 106 L156 200 Q118 214 82 200 Z" fill="url(#${id}b)"/>
        <path d="M118 104 L118 206 M98 124 L138 124 M94 150 L142 150 M92 176 L146 176" stroke="${p.accent}" stroke-width="2.5" opacity=".6"/>
        <ellipse cx="118" cy="72" rx="26" ry="28" fill="${skin}"/><path d="M92 64 Q118 44 146 64 L144 80 L92 80 Z" fill="${p.dark}" opacity=".15"/><path d="M106 72 h7 M124 72 h7" stroke="#2a1a14" stroke-width="3.5" stroke-linecap="round"/><path d="M110 88 Q118 94 127 88" stroke="#7a3a30" stroke-width="2.5" fill="none"/>
        <path d="M76 56 Q118 18 160 56 Q118 44 76 56 Z" fill="url(#${id}d)"/><path d="M88 54 Q118 30 150 54 Q118 62 88 54 Z" fill="url(#${id}b)"/>
        <path d="M146 42 Q186 4 196 26 Q172 34 152 56 Z" fill="${p.accent}" class="sp-glow"/>
        <g class="sp-weapon"><path d="M150 130 Q196 112 212 148 Q208 204 164 200 Q136 176 150 130 Z" fill="#a0713f" stroke="#5c3d20" stroke-width="4"/><circle cx="174" cy="162" r="13" fill="#2c1d10"/><path d="M196 124 L232 60" stroke="#5c3d20" stroke-width="9" stroke-linecap="round"/><path d="M174 148 L222 70 M180 154 L228 74" stroke="#f2e8c9" stroke-width="1.5"/></g>
        <path d="M92 120 Q112 150 148 160" stroke="${skin}" stroke-width="10" fill="none" stroke-linecap="round"/>
        <g class="sp-orbit" fill="${p.accent}"><path d="M30 80 q8 -8 10 2 l-2 22 a6 5 0 1 1 -3 -6 Z" opacity=".85"/><path d="M214 40 q8 -8 10 2 l-2 18 a5 4 0 1 1 -3 -5 Z" opacity=".65"/></g>
      </g>`,
    assassin: `
      <g class="sp-cape"><path d="M104 74 C70 76 30 62 14 90 C44 92 62 104 92 104 Z" fill="${p.accent}" opacity=".9"/><path d="M90 104 C60 140 62 194 72 226 L104 206 L114 112 Z" fill="url(#${id}c)"/></g>
      <g class="sp-body">
        <path d="M100 178 L62 226 L72 262 L92 262 L90 232 L124 196 Z" fill="url(#${id}d)"/><path d="M128 184 L166 214 L168 262 L190 262 L186 204 L146 172 Z" fill="url(#${id}d)"/>
        <path d="M94 104 Q124 92 150 110 L144 190 Q118 200 98 186 Z" fill="url(#${id}b)"/><path d="M96 130 L146 152 M98 160 L144 178" stroke="${p.dark}" stroke-width="6" opacity=".6"/>
        <path d="M100 62 Q100 28 128 28 Q156 28 156 62 Q156 90 146 102 Q124 112 106 100 Q100 88 100 62 Z" fill="url(#${id}d)"/>
        <path d="M112 72 L150 66 L146 82 L114 84 Z" fill="${p.dark}"/><path d="M122 74 h8 M138 72 h7" stroke="${p.accent}" stroke-width="3.5" stroke-linecap="round" class="sp-glow" filter="url(#${id}g)"/>
        <path d="M102 80 Q124 94 152 84 L148 104 Q124 112 106 100 Z" fill="${p.accent}"/>
        <g class="sp-offhand"><path d="M104 122 L66 156" stroke="${p.main}" stroke-width="12" stroke-linecap="round"/><path d="M72 150 L30 188 L24 200 L38 196 L78 158 Z" fill="#cfd8e6"/></g>
        <g class="sp-weapon"><path d="M146 122 L190 136" stroke="${p.main}" stroke-width="12" stroke-linecap="round"/><path d="M186 130 L232 96 L238 84 L224 88 L180 124 Z" fill="#cfd8e6"/><path d="M178 122 L194 144" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/></g>
      </g>`
  };
  return spriteShell(`${shadow}${art[classKey] || art.warrior}`, { defs, extraClass: `hero-sprite cls-${classKey}` });
}

function enemySprite(artId, tint = "#888888") {
  const id = `e${(artIdCounter += 1)}`;
  const light = shade(tint, 0.14);
  const dark = shade(tint, -0.32);
  const deep = shade(tint, -0.5);
  const eye = "#ffe08a";
  const defs = `${grad(`${id}a`, light, tint)}${grad(`${id}b`, tint, dark)}${grad(`${id}c`, dark, deep)}${glowFilter(`${id}g`, 4)}`;
  const eyes = (points, color = eye, r = 4) => points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" class="sp-glow" filter="url(#${id}g)"/>`).join("");
  const shadow = (rx = 70) => `<ellipse class="sp-shadow" cx="120" cy="266" rx="${rx}" ry="10" fill="#000" opacity=".45"/>`;
  const art = {
    beast: `${shadow(86)}<g class="sp-body">
      <path d="M36 150 Q10 130 6 104 Q28 124 50 128 Z" fill="url(#${id}c)"/>
      <path d="M52 188 L44 258 L66 258 L78 196 Z M80 196 L82 258 L102 258 L104 196 Z" fill="url(#${id}c)"/>
      <path d="M152 188 L150 258 L170 258 L178 192 Z M178 184 L194 258 L214 258 L204 178 Z" fill="url(#${id}c)"/>
      <path d="M36 150 Q58 104 118 104 Q168 100 196 128 L208 180 Q150 212 76 204 Q40 192 36 150 Z" fill="url(#${id}b)"/>
      <path d="M52 128 L66 104 L74 124 L88 98 L96 118 L112 94 L118 112 L134 92 L138 112 L158 96 L158 116 Z" fill="url(#${id}c)"/>
      <g class="sp-head"><path d="M168 118 Q196 86 222 104 L238 132 L230 158 L200 170 L172 158 Z" fill="url(#${id}a)"/><path d="M184 102 L178 66 L206 96 Z M208 98 L222 64 L226 104 Z" fill="url(#${id}b)"/>
      <path d="M204 158 L232 150 L238 132 L214 138 Z" fill="${deep}"/><path d="M208 146 l6 12 4 -13 Z M222 142 l5 9 3 -11 Z" fill="#f2ead9"/>${eyes([[210, 118]])}</g></g>`,
    rogue: `${shadow(58)}<g class="sp-cape"><path d="M96 92 C66 130 60 196 70 240 L112 226 L120 104 Z" fill="url(#${id}c)"/></g><g class="sp-body">
      <path d="M100 186 L88 258 L108 258 L120 196 Z M130 188 L146 258 L166 258 L150 184 Z" fill="url(#${id}c)"/>
      <path d="M92 106 Q124 90 154 106 L150 192 Q122 204 96 192 Z" fill="url(#${id}b)"/><path d="M94 150 L152 158" stroke="${deep}" stroke-width="9"/>
      <path d="M92 64 Q92 22 124 22 Q156 22 156 64 Q156 94 146 108 Q122 116 102 108 Q92 94 92 64 Z" fill="url(#${id}a)"/><ellipse cx="128" cy="72" rx="20" ry="22" fill="${deep}"/>${eyes([[122, 70], [138, 70]], eye, 3.2)}
      <g class="sp-weapon"><path d="M150 122 L190 150" stroke="${tint}" stroke-width="12" stroke-linecap="round"/><path d="M186 146 L230 92 L234 74 L218 84 L176 136 Z" fill="#c8d0dc"/><path d="M174 134 L192 152" stroke="${deep}" stroke-width="6"/></g>
      <path d="M96 120 L72 166" stroke="${tint}" stroke-width="12" stroke-linecap="round"/></g>`,
    slime: `${shadow(84)}<g class="sp-body"><path d="M36 256 Q18 248 26 214 Q40 120 120 104 Q204 118 216 214 Q224 250 204 256 Q170 266 150 256 Q130 268 104 256 Q70 268 36 256 Z" fill="url(#${id}b)"/>
      <path d="M70 150 Q92 118 126 118 Q90 130 80 168 Z" fill="${light}" opacity=".6"/><circle cx="154" cy="214" r="10" fill="${light}" opacity=".3"/><circle cx="84" cy="226" r="6" fill="${light}" opacity=".35"/>
      <ellipse cx="102" cy="172" rx="13" ry="17" fill="${deep}"/><ellipse cx="148" cy="172" rx="13" ry="17" fill="${deep}"/>${eyes([[105, 176], [151, 176]], eye, 5)}<path d="M104 210 Q126 224 148 208" stroke="${deep}" stroke-width="5" fill="none" stroke-linecap="round"/></g>`,
    imp: `${shadow(50)}<g class="sp-body sp-float"><path d="M84 110 Q40 80 26 112 Q50 116 58 142 Q70 124 92 134 Z M158 110 Q204 78 216 112 Q192 118 184 142 Q172 124 150 134 Z" fill="url(#${id}c)"/>
      <path d="M100 198 L92 244 L110 240 L120 206 Z M132 206 L146 240 L162 244 L150 196 Z" fill="url(#${id}c)"/><path d="M90 128 Q120 112 152 128 L146 204 Q120 216 96 204 Z" fill="url(#${id}b)"/>
      <path d="M84 92 Q84 54 120 54 Q156 54 156 92 Q156 124 120 128 Q84 124 84 92 Z" fill="url(#${id}a)"/><path d="M92 62 L80 24 L108 54 Z M148 62 L162 24 L134 54 Z" fill="url(#${id}c)"/>${eyes([[106, 90], [136, 90]], "#fff0a8", 5)}<path d="M104 110 l6 6 6 -6 6 6 6 -6 6 6" stroke="${deep}" stroke-width="3" fill="none"/>
      <g class="sp-weapon"><circle cx="186" cy="170" r="18" fill="#ffb347" class="sp-glow" filter="url(#${id}g)"/><circle cx="186" cy="170" r="9" fill="#fff2c9"/><path d="M150 148 L176 164" stroke="${tint}" stroke-width="10" stroke-linecap="round"/></g></g>`,
    knight: `${shadow(70)}<g class="sp-body"><path d="M92 190 L84 258 L112 258 L118 200 Z M132 200 L140 258 L168 258 L158 190 Z" fill="url(#${id}c)"/>
      <path d="M72 106 Q124 80 176 106 L166 198 Q124 216 84 198 Z" fill="url(#${id}b)"/><path d="M90 130 L160 130 M86 158 L164 158 M124 104 L124 206" stroke="${deep}" stroke-width="5"/><path d="M106 122 h36 l-4 30 h-28 Z" fill="#ff8a3c" opacity=".55" class="sp-glow"/>
      <path d="M58 96 Q78 78 104 96 L98 130 Q70 134 56 122 Z M144 96 Q170 78 192 96 L192 122 Q176 134 150 130 Z" fill="url(#${id}a)"/>
      <path d="M94 74 Q94 30 124 30 Q154 30 154 74 L148 100 Q124 108 100 100 Z" fill="url(#${id}a)"/><path d="M124 14 Q134 24 124 44 Q114 24 124 14 Z" fill="#ff8a3c"/><path d="M102 66 H146 L142 80 H106 Z" fill="${deep}"/>${eyes([[114, 73], [134, 73]], "#ff9a4a", 3)}
      <g class="sp-offhand"><path d="M34 126 L76 120 L84 190 L58 214 L36 190 Z" fill="url(#${id}c)" stroke="${light}" stroke-width="4"/></g>
      <g class="sp-weapon"><path d="M172 150 L184 158 L226 30 L218 16 L206 28 Z" fill="#b8c0cc"/><path d="M160 146 L198 168" stroke="${light}" stroke-width="9" stroke-linecap="round"/><path d="M176 160 L168 184" stroke="${deep}" stroke-width="9" stroke-linecap="round"/></g></g>`,
    caster: `${shadow(60)}<g class="sp-cape"><path d="M88 96 C58 150 50 220 58 258 L120 258 L118 104 Z" fill="url(#${id}c)"/></g><g class="sp-body">
      <path d="M86 106 Q120 90 152 106 L176 258 Q120 272 66 258 Z" fill="url(#${id}b)"/><path d="M108 112 L130 112 L142 258 L98 258 Z" fill="${deep}" opacity=".5"/>
      <path d="M82 66 Q120 -2 158 66 Q158 96 150 110 Q120 122 90 110 Q82 96 82 66 Z" fill="url(#${id}a)"/><ellipse cx="122" cy="84" rx="22" ry="24" fill="${deep}"/>${eyes([[112, 82], [132, 82]], eye, 3.6)}
      <path d="M96 124 L66 164" stroke="${tint}" stroke-width="12" stroke-linecap="round"/><path d="M148 124 L188 150" stroke="${tint}" stroke-width="12" stroke-linecap="round"/>
      <g class="sp-weapon"><circle cx="200" cy="130" r="20" fill="${light}" class="sp-glow" filter="url(#${id}g)" opacity=".95"/><circle cx="200" cy="130" r="9" fill="#fff"/></g><g class="sp-orbit" fill="${light}"><circle cx="48" cy="130" r="6"/><circle cx="222" cy="194" r="5"/></g></g>`,
    golem: `${shadow(88)}<g class="sp-body"><path d="M72 190 L60 258 L104 258 L110 200 Z M134 200 L140 258 L184 258 L172 190 Z" fill="url(#${id}c)"/>
      <path d="M58 100 L84 80 L160 80 L186 100 L176 200 L132 214 L100 214 L68 200 Z" fill="url(#${id}b)"/><path d="M84 80 L100 120 L92 170 M160 80 L146 124 L154 176 M100 120 L146 124" stroke="${deep}" stroke-width="4" fill="none"/>
      <path d="M122 124 L136 148 L122 176 L108 148 Z" fill="#8fd8ff" class="sp-glow" filter="url(#${id}g)"/>
      <path d="M94 44 L150 44 L160 84 L84 84 Z" fill="url(#${id}a)"/><rect x="100" y="60" width="44" height="10" fill="${deep}"/>${eyes([[112, 65], [132, 65]], "#8fd8ff", 4)}
      <g class="sp-offhand"><path d="M58 104 L24 126 L18 196 L54 208 L66 150 Z" fill="url(#${id}a)"/></g><g class="sp-weapon"><path d="M186 104 L222 126 L228 196 L192 208 L180 150 Z" fill="url(#${id}a)"/><path d="M196 140 L216 150 M194 170 L216 176" stroke="${deep}" stroke-width="4"/></g></g>`,
    wraith: `<g class="sp-body sp-float"><path d="M78 110 Q120 40 164 110 Q186 180 174 240 L156 212 L142 256 L122 214 L104 258 L92 212 L66 244 Q58 176 78 110 Z" fill="url(#${id}b)" opacity=".92"/>
      <path d="M92 118 Q120 74 150 118 Q152 150 122 158 Q92 150 92 118 Z" fill="${deep}"/>${eyes([[108, 118], [136, 118]], "#d8f2ff", 5)}<path d="M112 140 Q122 150 134 140" stroke="#d8f2ff" stroke-width="3" fill="none" opacity=".7"/>
      <g class="sp-weapon"><path d="M166 140 Q204 136 222 104 Q208 150 170 170 Z" fill="${light}" opacity=".7"/></g><path d="M78 140 Q44 136 26 104 Q40 150 74 170 Z" fill="${light}" opacity=".7"/></g>`,
    shard: `${shadow(60)}<g class="sp-body sp-float"><path d="M120 18 L170 96 L150 214 L120 250 L90 214 L70 96 Z" fill="url(#${id}b)"/><path d="M120 18 L120 250 L90 214 L70 96 Z" fill="url(#${id}c)"/><path d="M120 18 L170 96 L120 118 L70 96 Z" fill="${light}" opacity=".85"/>
      <path d="M120 118 L140 150 L120 186 L100 150 Z" fill="#fff" class="sp-glow" filter="url(#${id}g)" opacity=".9"/>${eyes([[120, 150]], "#3a2a8a", 5)}
      <g class="sp-orbit"><path d="M40 90 L62 124 L44 164 L24 124 Z M198 84 L220 120 L202 158 L180 120 Z" fill="${tint}" opacity=".85"/></g></g>`,
    smith: `${shadow(100)}<g class="sp-cape"><path d="M76 96 C40 140 34 214 44 258 L104 250 L110 110 Z" fill="#3a1d12"/></g><g class="sp-body">
      <path d="M84 196 L72 258 L114 258 L118 206 Z M134 206 L142 258 L184 258 L170 196 Z" fill="#2a1a12"/>
      <path d="M60 104 Q122 74 186 104 L172 206 Q122 226 74 206 Z" fill="#46291a"/><path d="M84 112 h78 l-8 96 q-32 12 -62 0 Z" fill="#6b4a2a"/>
      <circle cx="122" cy="150" r="24" fill="#ffb35c" class="sp-glow" filter="url(#${id}g)"/><circle cx="122" cy="150" r="12" fill="#fff2c9"/>
      <path d="M50 92 Q72 74 96 92 L92 128 Q64 132 48 118 Z M150 92 Q176 74 198 92 L198 118 Q180 132 154 128 Z" fill="#8b5a33"/>
      <path d="M94 66 Q94 28 124 28 Q154 28 154 66 L146 96 Q124 104 102 96 Z" fill="#7a4a28"/><path d="M104 56 H146 L142 70 H108 Z" fill="#1a0f0a"/>${eyes([[115, 63], [134, 63]], "#ffdf7a", 3.6)}<path d="M104 84 Q124 124 144 84 L140 118 Q124 134 108 118 Z" fill="#c2c2c2"/>
      <path d="M62 112 L34 170" stroke="#7a4a28" stroke-width="18" stroke-linecap="round"/>
      <g class="sp-weapon"><path d="M186 112 L208 158" stroke="#7a4a28" stroke-width="18" stroke-linecap="round"/><path d="M206 192 L212 60" stroke="#5c3d20" stroke-width="11" stroke-linecap="round"/><path d="M168 20 h86 v52 h-86 Z" fill="#59606d"/><path d="M168 20 h86 v14 h-86 Z" fill="#8a93a3"/><path d="M178 64 h66" stroke="#ffb35c" stroke-width="5" class="sp-glow" filter="url(#${id}g)"/></g></g>`
  };
  return spriteShell(art[artId] || art.rogue, { defs, extraClass: `enemy-sprite art-${artId}` });
}

const ICON_PATHS = {
  ring: `<circle cx="16" cy="19" r="8.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 9l4-5 4 5-4 3z" fill="currentColor"/>`,
  bracelet: `<ellipse cx="16" cy="16" rx="11" ry="7" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="16" cy="9" r="2.6" fill="currentColor"/>`,
  necklace: `<path d="M7 5q9 15 18 0" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16 15l5 6-5 8-5-8z" fill="currentColor"/>`,
  head: `<path d="M6 21q0-15 10-15t10 15v5H20v-6h-8v6H6z" fill="currentColor"/>`,
  chest: `<path d="M9 5l4 3h6l4-3 5 5-3 6v11H7V16l-3-6z" fill="currentColor"/>`,
  legs: `<path d="M9 4h14l2 24h-6l-3-14-3 14H7z" fill="currentColor"/>`,
  boots: `<path d="M10 4h9v14l8 5v5H8z" fill="currentColor"/>`,
  sword: `<path d="M25 3l4 1-1 4L12 23l-3-3z" fill="currentColor"/><path d="M6 17l9 9-2 2-3-3-4 4-2-2 4-4-3-3z" fill="currentColor"/>`,
  staff: `<path d="M21 11L8 29l-3-2L18 9z" fill="currentColor"/><circle cx="22" cy="8" r="5" fill="currentColor"/>`,
  bow: `<path d="M8 3q20 13 0 26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 3v26M6 16h22" stroke="currentColor" stroke-width="1.6"/><path d="M28 16l-6-3v6z" fill="currentColor"/>`,
  dagger: `<path d="M23 3l5 1 1 5-13 13-5-5z" fill="currentColor"/><path d="M8 15l9 9-2 2-2-2-4 4-3-3 4-4-2-2z" fill="currentColor"/>`,
  hammer: `<path d="M12 4h14v10H12z" fill="currentColor"/><path d="M18 14h3l-5 15h-4z" fill="currentColor"/>`,
  lyre: `<path d="M8 4q-3 14 8 17 11-3 8-17" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 7v13M16 8v13M20 7v13" stroke="currentColor" stroke-width="1.4"/><path d="M10 24h12v4H10z" fill="currentColor"/>`,
  attack: `<path d="M25 3l4 1-1 4L12 23l-3-3z" fill="currentColor"/><path d="M6 17l9 9-2 2-3-3-4 4-2-2 4-4-3-3z" fill="currentColor"/>`,
  guard: `<path d="M16 3l11 4v9q0 9-11 13Q5 25 5 16V7z" fill="currentColor"/>`,
  wait: `<path d="M8 4h16v3l-6 9 6 9v3H8v-3l6-9-6-9z" fill="currentColor"/>`,
  potionHp: `<path d="M12 3h8v3l-1 2v5l6 9q2 7-5 7h-8q-7 0-5-7l6-9V8l-1-2z" fill="currentColor"/>`,
  potionMp: `<path d="M12 3h8v3l-1 2v5l6 9q2 7-5 7h-8q-7 0-5-7l6-9V8l-1-2z" fill="currentColor"/>`,
  gold: `<circle cx="16" cy="16" r="11" fill="currentColor"/><path d="M16 9v14M12 12h6a2 2 0 010 4h-5a2 2 0 000 4h7" stroke="#1a120a" stroke-width="2" fill="none"/>`,
  shard: `<path d="M16 2l9 12-5 16h-8L7 14z" fill="currentColor"/><path d="M16 2v28" stroke="#0007" stroke-width="1.4"/>`,
  ore: `<path d="M5 22l5-13 9-4 8 10-3 12H9z" fill="currentColor"/><path d="M10 9l6 8 11-2M16 17l-7 10" stroke="#0007" stroke-width="1.4" fill="none"/>`,
  dust: `<circle cx="10" cy="11" r="3" fill="currentColor"/><circle cx="20" cy="8" r="2" fill="currentColor"/><circle cx="23" cy="18" r="3.4" fill="currentColor"/><circle cx="13" cy="21" r="2.4" fill="currentColor"/><circle cx="7" cy="24" r="1.6" fill="currentColor"/>`,
  thread: `<path d="M6 25Q8 7 16 16T26 6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="6" cy="25" r="2.6" fill="currentColor"/>`,
  gland: `<path d="M16 4q11 10 8 18a8.6 8.6 0 01-16 0Q5 14 16 4z" fill="currentColor"/>`,
  core: `<circle cx="16" cy="16" r="6.5" fill="currentColor"/><ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(30 16 16)"/>`,
  battle: `<path d="M4 3l5 1 13 14-3 3L5 8z" fill="currentColor"/><path d="M28 3l-5 1L9 18l3 3L27 8z" fill="currentColor" opacity=".78"/><path d="M6 19l7 7-2 2-2.5-2.5L5 29l-2-2 3.500-3.500L4 21zM26 19l-7 7 2 2 2.500-2.500L27 29l2-2-3.500-3.500L28 21z" fill="currentColor"/>`,
  slow: `<path d="M4 8q6-6 12 0t12 0M4 16q6-6 12 0t12 0M4 24q6-6 12 0t12 0" fill="none" stroke="currentColor" stroke-width="3"/>`,
  blind: `<path d="M2 16q14-14 28 0-14 14-28 0z" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="16" r="4" fill="currentColor"/><path d="M6 27L26 5" stroke="currentColor" stroke-width="3"/>`,
  wound: `<path d="M6 26L26 6" stroke="currentColor" stroke-width="3.4"/><path d="M9 11l5 5M18 20l5 5M15 7l5 5M6 16l5 5" stroke="currentColor" stroke-width="2.2"/>`,
  shock: `<path d="M19 2L6 18h8l-2 12 14-18h-9z" fill="currentColor"/>`,
  exposed: `<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="16" r="3.4" fill="currentColor"/><path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="currentColor" stroke-width="2.6"/>`,
  soaked: `<path d="M10 4q5 7 5 11a5 5 0 01-10 0q0-4 5-11z" fill="currentColor"/><path d="M22 10q5 7 5 11a5 5 0 01-10 0q0-4 5-11z" fill="currentColor" opacity=".7"/>`,
  camp: `<path d="M16 3q4 6 3 11 3-2 3-5 4 5 2 10-2 4-8 4t-8-4q-2-5 2-9 1 3 3 4-1-6 3-11z" fill="currentColor"/><path d="M4 28l24-4M4 24l24 4" stroke="currentColor" stroke-width="2.6"/>`,
  shrine: `<path d="M6 28h20v-3H6zM9 25h14l-2-14H11zM16 2l4 7h-8z" fill="currentColor"/>`,
  talents: `<circle cx="16" cy="5" r="3.4" fill="currentColor"/><circle cx="6" cy="17" r="3.4" fill="currentColor"/><circle cx="26" cy="17" r="3.4" fill="currentColor"/><circle cx="16" cy="27" r="3.4" fill="currentColor"/><path d="M16 5L6 17l10 10 10-10zM16 5v22" fill="none" stroke="currentColor" stroke-width="2"/>`,
  elite: `<path d="M4 25l-2-16 8 6 6-11 6 11 8-6-2 16z" fill="currentColor"/>`,
  event: `<path d="M16 3a9 9 0 019 9c0 6-7 7-7 11h-4c0-7 7-7 7-11a5 5 0 00-10 0H7a9 9 0 019-9z" fill="currentColor"/><circle cx="16" cy="28" r="2.4" fill="currentColor"/>`,
  boss: `<path d="M16 3q11 0 11 11 0 6-4 9v5H9v-5q-4-3-4-9Q5 3 16 3z" fill="currentColor"/><circle cx="11" cy="14" r="3" fill="#0009"/><circle cx="21" cy="14" r="3" fill="#0009"/>`,
  burn: `<path d="M16 2q3 7 8 11 5 6 1 12-3 5-9 5t-9-5q-3-7 2-12 1 4 4 4-2-8 3-15z" fill="currentColor"/>`,
  fire: `<path d="M16 2q3 7 8 11 5 6 1 12-3 5-9 5t-9-5q-3-7 2-12 1 4 4 4-2-8 3-15z" fill="currentColor"/>`,
  bleed: `<path d="M11 3q7 8 7 13a7 7 0 01-14 0q0-5 7-13z" fill="currentColor"/><path d="M23 15q5 6 5 9a5 5 0 01-10 0q0-3 5-9z" fill="currentColor"/>`,
  frostbite: `<path d="M15 2h2v28h-2zM3 9l1-2 25 16-1 2zM28 7l1 2L4 25l-1-2z" fill="currentColor"/><circle cx="16" cy="16" r="5" fill="currentColor"/>`,
  freeze: `<path d="M16 2l11 7v14l-11 7-11-7V9z" fill="currentColor"/><path d="M16 8v16M9 12l14 8M23 12L9 20" stroke="#0008" stroke-width="2"/>`,
  stagger: `<circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 4"/><circle cx="16" cy="16" r="3.4" fill="currentColor"/>`,
  corruption: `<path d="M16 3q7 7 3 12 6-2 8 4-3 9-11 10-8-1-11-10 2-6 8-4-4-5 3-12z" fill="currentColor"/>`,
  flame: `<path d="M16 2q3 7 8 11 5 6 1 12-3 5-9 5t-9-5q-3-7 2-12 1 4 4 4-2-8 3-15z" fill="currentColor"/>`,
  frost: `<path d="M15 2h2v28h-2zM3 9l1-2 25 16-1 2zM28 7l1 2L4 25l-1-2z" fill="currentColor"/>`,
  poison: `<path d="M16 3q10 11 10 17a10 10 0 01-20 0Q6 14 16 3z" fill="currentColor"/>`,
  blood: `<path d="M16 3q10 11 10 17a10 10 0 01-20 0Q6 14 16 3z" fill="currentColor"/><path d="M11 21q1 4 5 4" stroke="#0006" stroke-width="2" fill="none"/>`,
  stun: `<path d="M18 2L6 18h8l-3 12 15-18h-9z" fill="currentColor"/>`,
  silence: `<path d="M5 12h6l7-6v20l-7-6H5z" fill="currentColor"/><path d="M22 11l7 10M29 11l-7 10" stroke="currentColor" stroke-width="2.6"/>`,
  weaken: `<path d="M5 8l5 5 5-4 6 8 6-3-3 12-13-3-5-5z" fill="currentColor"/>`,
  mark: `<circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="16" r="3.6" fill="currentColor"/><path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="currentColor" stroke-width="2.4"/>`,
  armor_break: `<path d="M16 3l11 4v9q0 9-11 13Q5 25 5 16V7z" fill="currentColor"/><path d="M18 3l-5 9 6 4-6 13" stroke="#000a" stroke-width="2.4" fill="none"/>`,
  shield: `<path d="M16 3l11 4v9q0 9-11 13Q5 25 5 16V7z" fill="currentColor"/>`,
  regeneration: `<path d="M13 4h6v9h9v6h-9v9h-6v-9H4v-6h9z" fill="currentColor"/>`,
  dark_fury: `<path d="M21 3a13 13 0 100 26 17 17 0 010-26z" fill="currentColor"/>`,
  rage: `<path d="M4 25l-2-16 8 6 6-11 6 11 8-6-2 16z" fill="currentColor"/>`,
  haste: `<path d="M3 7l10 9-10 9zM16 7l10 9-10 9z" fill="currentColor"/>`,
  evasion: `<path d="M5 25Q7 7 27 5 20 11 21 15 13 15 13 21 8 21 5 25z" fill="currentColor"/>`,
  fortify: `<path d="M4 28V10l5 4V5h4v5h6V5h4v9l5-4v18z" fill="currentColor"/>`,
  thorns: `<path d="M16 2l3 8 8-3-3 8 7 1-7 3 3 8-8-3-3 8-3-8-8 3 3-8-7-3 7-1-3-8 8 3z" fill="currentColor"/>`,
  arcane: `<path d="M16 2l3.5 10.5L30 16l-10.5 3.5L16 30l-3.5-10.5L2 16l10.5-3.5z" fill="currentColor"/>`,
  holy: `<path d="M13 3h6v8h9v6h-9v12h-6V17H4v-6h9z" fill="currentColor"/>`,
  dark: `<path d="M21 3a13 13 0 100 26 17 17 0 010-26z" fill="currentColor"/>`,
  air: `<path d="M3 11h17a4 4 0 10-4-4M3 17h22a4 4 0 11-4 4M3 23h11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  water: `<path d="M16 3q10 11 10 17a10 10 0 01-20 0Q6 14 16 3z" fill="currentColor"/>`,
  earth: `<path d="M3 26l8-16 5 8 4-5 9 13z" fill="currentColor"/>`,
  steel: `<path d="M25 3l4 1-1 4L12 23l-3-3z" fill="currentColor"/><path d="M6 17l9 9-2 2-3-3-4 4-2-2 4-4-3-3z" fill="currentColor"/>`,
  back: `<path d="M20 5L8 16l12 11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`,
  sound: `<path d="M4 12h6l8-7v22l-8-7H4z" fill="currentColor"/><path d="M22 10q5 6 0 12" stroke="currentColor" stroke-width="2.6" fill="none"/>`,
  mute: `<path d="M4 12h6l8-7v22l-8-7H4z" fill="currentColor"/><path d="M22 12l7 8M29 12l-7 8" stroke="currentColor" stroke-width="2.6"/>`,
  settings: `<path d="M13 2h6l1 4 4 2 4-1 3 5-3 3v3l3 3-3 5-4-1-4 2-1 4h-6l-1-4-4-2-4 1-3-5 3-3v-3L1 12l3-5 4 1 4-2z" fill="currentColor"/><circle cx="16" cy="16" r="4.4" fill="#0009"/>`,
  map: `<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3z" fill="currentColor"/><path d="M11 4v21M21 7v21" stroke="#0007" stroke-width="1.6"/>`,
  hero: `<circle cx="16" cy="10" r="7" fill="currentColor"/><path d="M3 30q1-12 13-12t13 12z" fill="currentColor"/>`,
  bag: `<path d="M11 8q0-6 5-6t5 6h6l2 21H3L5 8zm3 0h4q0-3-2-3t-2 3z" fill="currentColor"/>`,
  book: `<path d="M16 7q-5-4-13-3v22q8-1 13 3 5-4 13-3V4q-8-1-13 3z" fill="currentColor"/><path d="M16 7v22" stroke="#0008" stroke-width="1.6"/>`,
  anvil: `<path d="M2 9h6v2c1 3 4 4 8 4h3V9h11c0 5-3 7-7 8v3l3 4v4H8v-4l4-4v-3C6 17 2 14 2 9z" fill="currentColor"/>`,
  shop: `<path d="M4 5h24l2 9q-2 3-5 3t-5-3q-1 3-4 3t-4-3q-1 3-5 3t-5-3zM5 19h22v9H5z" fill="currentColor"/>`,
  skills: `<path d="M16 2l3.5 10.5L30 16l-10.5 3.5L16 30l-3.5-10.5L2 16l10.5-3.5z" fill="currentColor"/>`,
  lock: `<path d="M9 13V9a7 7 0 0114 0v4h3v16H6V13zm4 0h6V9a3 3 0 00-6 0z" fill="currentColor"/>`,
  retreat: `<path d="M14 5L3 16l11 11v-7h15v-8H14z" fill="currentColor"/>`,
  auto: `<path d="M8 4l18 12L8 28z" fill="currentColor"/>`,
  log: `<path d="M5 5h22v5H5zM5 13h22v5H5zM5 21h15v5H5z" fill="currentColor"/>`
};

const RESOURCE_ICON = { "iron-ore": "ore", "ether-dust": "dust", "moon-thread": "thread", "venom-gland": "gland", "astral-core": "core" };
const ELEMENT_COLORS = { fire: "#ff8a3c", frost: "#9fe4ff", water: "#5fb7ff", earth: "#c49a5c", air: "#c8f0e8", holy: "#ffe9a0", dark: "#a974ff", arcane: "#8fa0ff", poison: "#9be34f", blood: "#ff4d5e", steel: "#f0e6d0" };

function icon(name, className = "") {
  const painted = window.FORGE_ICONS?.[name];
  if (painted) return `<img class="ic ic-img ${className}" src="assets/ui/ic/${painted}.webp" alt="" aria-hidden="true" draggable="false">`;
  return `<svg class="ic ${className}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ICON_PATHS.arcane}</svg>`;
}

function itemIcon(item) {
  const blueprint = ITEM_BLUEPRINTS.findIndex((entry) => entry.name === item?.blueprint);
  if (blueprint >= 0 && hasArt(`item_${blueprint}`)) return artImg(`item_${blueprint}`);
  return icon(item?.slotType === "weapon" ? item.weapon || "sword" : item?.slotType || "bag");
}

function slotIconName(slotKey) {
  const type = slotKey.split("-")[0];
  if (type === "weapon") {
    const name = { warrior: "sword", mage: "staff", archer: "bow", bard: "lyre", assassin: "dagger" }[App.hero?.classKey] || "sword";
    return ICON_PATHS[name] || window.FORGE_ICONS?.[name] ? name : "sword";
  }
  return type;
}

function getSkillElement(skill) {
  if (skill?.element) return skill.element;
  const tags = skill?.tags || [];
  if (tags.includes("fire")) return "fire";
  if (tags.includes("poison")) return "poison";
  if (tags.includes("light") || tags.includes("healing")) return "holy";
  if (tags.includes("dark") || tags.includes("undead")) return "dark";
  if (tags.includes("spirit")) return "holy";
  if (skill?.attackType === "skill") return "arcane";
  return "steel";
}

// Generated art, with the old vector icon as a fallback until an image exists.
function hasArt(id) {
  return Boolean(window.FORGE_IMAGES?.has(id));
}

function artImg(id, alt = "") {
  return `<img class="art-img" src="assets/img/${id}.webp" alt="${alt}" draggable="false">`;
}

function sceneImg(id) {
  return hasArt(id) ? `<img class="scene-img" src="assets/img/${id}.webp" alt="" draggable="false">` : "";
}

// The calm painted pose of a fighter, or the old drawing while it has no painted sheet.
function paintedPose(id) {
  return window.FORGE_SPRITES?.[id] ? `<img class="painted-pose" src="assets/sprites/${id}/idle.webp" alt="" loading="lazy">` : "";
}

function foeArt(id, def) {
  return paintedPose(id) || enemySprite(def.art, def.tint);
}

// The look follows the path: profession first, then subclass, then the class itself.
function heroLookId(hero) {
  return [hero.profession && `look_${hero.profession}`, hero.subclass && `look_${hero.subclass}`, hero.classKey].find((id) => id && window.FORGE_SPRITES?.[id]) || hero.classKey;
}

function heroFigure(hero) {
  return paintedPose(heroLookId(hero)) || heroPortrait(hero.classKey);
}

function heroMedal(hero) {
  const look = heroLookId(hero);
  return look === hero.classKey ? heroPortrait(hero.classKey) : paintedPose(look);
}

function heroPortrait(classKey) {
  return hasArt(`class_${classKey}`) ? artImg(`class_${classKey}`) : heroSprite(classKey);
}

function skillIcon(skill) {
  if (!skill) return icon("skills", "dim");
  if (hasArt(`skill_${skill.id}`)) return `<span class="skill-glyph art">${artImg(`skill_${skill.id}`)}</span>`;
  const element = getSkillElement(skill);
  const words = String(skill.name || "").split(/\s+/).filter((word) => word.length > 1);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2);
  return `<span class="skill-glyph mono" style="--el:${ELEMENT_COLORS[element]}">${icon(skill.category === "passive" ? "skills" : element)}<b>${esc(letters)}</b></span>`;
}

function eventArt(name) {
  const map = { spring: "water", chest: "bag", altar: "blood", anvil: "anvil", ravine: "earth", hermit: "flame" };
  return icon(map[name] || "event");
}
