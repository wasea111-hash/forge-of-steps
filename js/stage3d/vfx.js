// Element effects for the 3D stage. Every recipe is built from the stage's particles and small one-shot meshes.
const StageVFX = (() => {
  const T = window.THREE;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const col = (hex) => new T.Color(hex);

  function oneShot(stage, mesh, duration, update) {
    stage.scene.add(mesh);
    stage.fxItems.push({
      age: 0, duration, update,
      end: () => {
        stage.scene.remove(mesh);
        mesh.traverse((node) => { if (node.isMesh || node.isLine) { node.geometry.dispose(); node.material.dispose(); } });
      }
    });
  }

  const glowMat = (hex, power = 2, opacity = 1) => new T.MeshBasicMaterial({ color: col(hex).multiplyScalar(power), transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });

  // Sharp spikes bursting out of the ground: ice and stone.
  function spikes(stage, center, hex, count = 7, height = 1.5, radius = 0.9, material = "standard") {
    const group = new T.Group();
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const h = rnd(0.55, 1) * height * (i === 0 ? 1.25 : 1);
      const geo = new T.ConeGeometry(rnd(0.11, 0.24), h, 5);
      const mat = material === "standard" ? new T.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.1, flatShading: true, transparent: true, emissive: col(hex).multiplyScalar(0.25) }) : glowMat(hex, 1.6);
      const spike = new T.Mesh(geo, mat);
      const a = (i / count) * Math.PI * 2 + rnd(-0.3, 0.3);
      const d = i === 0 ? 0 : rnd(radius * 0.4, radius);
      spike.position.set(center.x + Math.cos(a) * d, -h / 2, center.z + Math.sin(a) * d * 0.7);
      spike.rotation.set(rnd(-0.25, 0.25), rnd(0, 3), rnd(-0.25, 0.25));
      spike.castShadow = true;
      group.add(spike);
      items.push({ spike, h });
    }
    oneShot(stage, group, 0.85, (t) => {
      const rise = t < 0.16 ? t / 0.16 : t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      items.forEach(({ spike, h }) => {
        spike.position.y = -h / 2 + h * rise;
        spike.material.opacity = t > 0.72 ? rise : 1;
      });
    });
  }

  // A tall beam of light from the sky.
  function beam(stage, center, hex, radius = 0.55, seconds = 0.6) {
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius * 1.15, 18, 18, 1, true), new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { tint: { value: col(hex) }, fade: { value: 1 } },
      vertexShader: "varying vec3 n; varying vec3 v; varying float h; void main(){ h = position.y; n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 tint; uniform float fade; varying vec3 n; varying vec3 v; varying float h; void main(){ float f = pow(abs(dot(n, v)), 2.); float a = f * fade * smoothstep(9., 2., abs(h)); gl_FragColor = vec4((tint + .25) * a * 1.5, a); }"
    }));
    mesh.position.set(center.x, 9, center.z);
    oneShot(stage, mesh, seconds, (t) => {
      const grow = t < 0.15 ? t / 0.15 : 1;
      mesh.scale.set(grow * (1 + t * 0.2), 1, grow * (1 + t * 0.2));
      mesh.material.uniforms.fade.value = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    });
    const tint = col(hex);
    for (let i = 0; i < 26; i += 1) {
      const a = rnd(0, 6.28);
      stage.glow.spawn(center.x + Math.cos(a) * radius, rnd(0, 0.5), center.z + Math.sin(a) * radius, 0, rnd(1.4, 3.4), 0, rnd(0.08, 0.16), rnd(0.5, 0.9), tint, 0.3);
    }
  }

  // A jagged bolt from above.
  function lightning(stage, target, hex, forks = 2) {
    const group = new T.Group();
    const bolt = (x, z, width) => {
      const points = [];
      let px = x + rnd(-1, 1);
      let pz = z;
      for (let y = 11; y > target.y - 0.2; y -= 1.05) {
        points.push(px, y, pz);
        px += (x - px) * 0.32 + rnd(-0.34, 0.34);
        pz += rnd(-0.12, 0.12);
      }
      points.push(x, target.y, z);
      const verts = [];
      const index = [];
      for (let i = 0; i < points.length / 3; i += 1) {
        const a = i * 3;
        verts.push(points[a] - width, points[a + 1], points[a + 2], points[a] + width, points[a + 1], points[a + 2]);
        if (i) index.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
      geo.setIndex(index);
      return new T.Mesh(geo, glowMat(hex, 3.5));
    };
    group.add(bolt(target.x, target.z, 0.055));
    for (let i = 0; i < forks; i += 1) group.add(bolt(target.x + rnd(-0.2, 0.2), target.z, 0.022));
    oneShot(stage, group, 0.22, (t) => {
      group.visible = t < 0.3 || (t > 0.45 && t < 0.72);
      group.children.forEach((child) => { child.material.opacity = 1 - t * 0.6; });
    });
    stage.light(target, hex, 18, 0.2);
    stage.burst(target, hex, 18, 3.2, 0.08, 0.35);
  }

  // A column of flames at the target.
  function flames(stage, center, count = 46, radius = 0.42, height = 1) {
    const hot = col("#ffc76a");
    const mid = col("#ff7a24");
    for (let i = 0; i < count; i += 1) {
      const a = rnd(0, 6.28);
      const d = rnd(0, radius);
      stage.glow.spawn(center.x + Math.cos(a) * d, rnd(0, 0.5), center.z + Math.sin(a) * d, Math.cos(a) * 0.3, rnd(1.8, 4.6) * height, Math.sin(a) * 0.3, rnd(0.16, 0.36), rnd(0.35, 0.75), i % 3 ? mid : hot, 1.1, 0, i % 2 ? 4 : 0);
    }
    stage.smoke(new T.Vector3(center.x, 0.8, center.z), "#2a2522", 8, 0.35);
    stage.light(new T.Vector3(center.x, 1, center.z), "#ff8a2a", 16, 0.4);
  }

  // A glowing circle of runes on the ground.
  function runes(stage, center, hex, radius = 1.2, seconds = 0.8) {
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { tint: { value: col(hex) }, t: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `uniform vec3 tint; uniform float t; varying vec2 vUv;
        void main(){ vec2 q = vUv - .5; float d = length(q) * 2.; float a = atan(q.y, q.x) + t * 2.;
          float r1 = smoothstep(.02, .0, abs(d - .92)); float r2 = smoothstep(.015, .0, abs(d - .66));
          float ticks = step(.82, fract(a * 3.8197)) * smoothstep(.7, .68, d) * smoothstep(.45, .47, d);
          float star = smoothstep(.02, .0, abs(fract(a * 0.9549) - .5) - d * .0) * step(d, .62) * .3;
          float v = (r1 + r2 + ticks + star) * smoothstep(0., .12, t) * (1. - smoothstep(.7, 1., t));
          if (v < .004) discard; gl_FragColor = vec4(tint * v * 1.8, v); }`
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(radius * 2, radius * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, 0.06, center.z);
    oneShot(stage, mesh, seconds, (t) => { mat.uniforms.t.value = t; });
  }

  // Sound: rings flying from the bard to the target.
  function soundWaves(stage, from, to, hex, count = 3) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new T.Mesh(new T.TorusGeometry(0.34, 0.03, 8, 28), glowMat(hex, 2.2));
      mesh.position.copy(from);
      const dir = to.clone().sub(from).normalize();
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      const delay = i * 0.14;
      oneShot(stage, mesh, 0.46 + delay, (t) => {
        const local = Math.max(0, (t * (0.46 + delay) - delay) / 0.46);
        mesh.visible = local > 0;
        mesh.position.lerpVectors(from, to, local);
        mesh.scale.setScalar(0.6 + local * 1.9);
        mesh.material.opacity = 1 - local * 0.85;
      });
    }
  }

  // Wind: particles spiralling up around the target.
  function whirl(stage, center, hex, count = 40, radius = 0.7) {
    const tint = col(hex);
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * 12;
      const r = radius * (0.5 + (i / count) * 0.7);
      stage.glow.spawn(center.x + Math.cos(a) * r, 0.1 + (i / count) * 2.2, center.z + Math.sin(a) * r, -Math.sin(a) * 3, 1.2, Math.cos(a) * 3, rnd(0.05, 0.1), rnd(0.35, 0.7), tint, 1.6);
    }
    stage.shock(center, hex, 1.6, 0.4);
  }

  // Dark: shadow pulled in toward the target, then a violet pop.
  function voidPull(stage, center, hex = "#a974ff") {
    const tint = col(hex);
    for (let i = 0; i < 34; i += 1) {
      const a = rnd(0, 6.28);
      const r = rnd(0.9, 1.6);
      const y = rnd(0.2, 2);
      stage.glow.spawn(center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r, -Math.cos(a) * r * 3, (center.y - y) * 2, -Math.sin(a) * r * 3, rnd(0.08, 0.16), 0.32, tint, 0.2);
    }
    stage.smoke(new T.Vector3(center.x, 0.5, center.z), "#1a1226", 12, 0.4);
    stage.burst(center, hex, 16, 2.4, 0.1, 0.45);
  }

  // A hail of arrows dropping on one spot.
  function arrowRain(stage, center, count = 14) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.8, 4), new T.MeshBasicMaterial({ color: "#f4e6c0", transparent: true }));
      const x = center.x + rnd(-1, 1);
      const z = center.z + rnd(-0.7, 0.7);
      const delay = i / count * 0.5;
      const lean = rnd(0.2, 0.5);
      mesh.rotation.z = lean;
      oneShot(stage, mesh, 0.32 + delay + 0.5, (t) => {
        const total = 0.32 + delay + 0.5;
        const local = (t * total - delay) / 0.32;
        mesh.visible = local > 0;
        const k = Math.min(1, Math.max(0, local));
        mesh.position.set(x + (1 - k) * 4 * Math.sin(lean), 0.3 + (1 - k) * 9, z);
        mesh.material.opacity = t > 0.9 ? 0 : 1;
        if (k >= 1 && !mesh.userData.hit) { mesh.userData.hit = true; stage.burst(new T.Vector3(x, 0.2, z), "#d8c8a0", 4, 1.4, 0.05, 0.25); stage.debris(new T.Vector3(x, 0.1, z), "#6a5a48", 2, 1.6); }
      });
    }
  }

  // An expanding aura around the actor for buffs.
  function aura(stage, unit, hex) {
    const center = unit.root.position.clone();
    stage.shock(center, hex, 1.5, 0.5);
    const tint = col(hex);
    for (let i = 0; i < 28; i += 1) {
      const a = rnd(0, 6.28);
      stage.glow.spawn(center.x + Math.cos(a) * 0.55, rnd(0, 0.4), center.z + Math.sin(a) * 0.55, 0, rnd(1.1, 2.4), 0, rnd(0.07, 0.13), rnd(0.6, 1), tint, 0.5);
    }
    unit.flash(hex, 0.35);
  }

  // ---------- class handwriting: the shapes that tell one class from another ----------
  const later = (seconds, run) => setTimeout(run, (seconds * 1000) / Number(App.save.settings.battleSpeed || 1));
  // Runs a frame callback for a while without a mesh of its own: for effects drawn from particles over time.
  function over(stage, seconds, update) {
    const holder = new T.Group();
    oneShot(stage, holder, seconds, update);
  }
  const dirOf = (from, to) => (to.x >= from.x ? 1 : -1);

  // A storm of blades: arcs cut around the target from every side, sparks wheel around it.
  function bladestorm(stage, unit, hex, n = 5, size = 1) {
    for (let i = 0; i < n; i += 1) later(i * 0.05, () => { if (unit.root) stage.slash(unit.chest(), hex, i % 2 ? -1 : 1, i === n - 1 || size > 1.1); });
    const c = unit.chest();
    const tint = col(hex).lerp(col("#ffffff"), 0.3);
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2;
      stage.glow.spawn(c.x + Math.cos(a) * 0.75 * size, c.y + Math.sin(a) * 0.55 * size, c.z, -Math.sin(a) * 5, Math.cos(a) * 4, 0, 0.24, 0.32, tint, 2.5, 0, 5);
    }
  }

  // A crescent of the blade flies low along the ground from the fighter through the target and beyond.
  function crescent(stage, from, to, hex, size = 1) {
    const dir = dirOf(from, to);
    const mesh = new T.Mesh(new T.RingGeometry(0.78 * size, 1.02 * size, 40, 1, -1.05, 2.1), glowMat(hex, 2.4, 0.95));
    mesh.position.set(from.x + dir * 0.4, 0.95, to.z + 0.1);
    if (dir < 0) mesh.rotation.y = Math.PI;
    const start = mesh.position.x;
    const end = to.x + dir * 1.8;
    oneShot(stage, mesh, 0.34, (t) => {
      mesh.position.x = start + (end - start) * t;
      mesh.scale.set(1 + t * 0.3, 1 + t * 0.15, 1);
      mesh.material.opacity = t < 0.75 ? 0.95 : 0.95 * (1 - (t - 0.75) / 0.25);
      if (Math.random() < 0.7) stage.glow.spawn(mesh.position.x, rnd(0.2, 1.7) * size, mesh.position.z, -dir * rnd(1, 3), rnd(-0.5, 1), 0, 0.2, 0.3, col(hex), 2, 0, 5);
      if (Math.random() < 0.35) stage.puffs.spawn(mesh.position.x, 0.12, mesh.position.z, -dir * 0.6, 0.4, 0, 0.22, 0.6, col("#7a6a58"), 1.2, 1.2);
    });
  }

  // A dome of light closes over the fighter: bright at the rim, clear in the middle, glints on its skin.
  function dome(stage, unit, hex, size = 1) {
    const h = (unit.height || 2) * (unit.scale || 1);
    const r = Math.max(0.9, h * 0.62) * size;
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { tint: { value: col(hex) }, fade: { value: 0 } },
      vertexShader: "varying vec3 n; varying vec3 v; varying float y; void main(){ y = position.y; n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 tint; uniform float fade; varying vec3 n; varying vec3 v; varying float y; void main(){ float f = pow(1. - abs(dot(n, v)), 2.4); float bands = .55 + .45 * step(.5, fract(y * 6.)); float a = (f * 1.3 + .05) * bands * fade; gl_FragColor = vec4((tint + .2) * a * 1.4, a); }"
    });
    const mesh = new T.Mesh(new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    const base = unit.root.position;
    mesh.position.set(base.x, 0.02, base.z);
    oneShot(stage, mesh, 1.1, (t) => {
      const grow = t < 0.14 ? smoothIn(t / 0.14) : 1;
      mesh.scale.set(grow, grow * (t < 0.14 ? 0.7 + 0.3 * grow : 1), grow);
      mat.uniforms.fade.value = t < 0.14 ? grow : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      if (Math.random() < 0.5) { const a = rnd(0, 6.28); const e = rnd(0.2, 1.4); stage.glow.spawn(base.x + Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, base.z + Math.sin(a) * Math.cos(e) * r, 0, 0.2, 0, 0.16, 0.4, col(hex), 1, 0, 3); }
    });
    stage.shock(base, hex, 1.6 * size, 0.4);
  }
  const smoothIn = (t) => 1 - (1 - t) * (1 - t);

  // A war cry: lines of force burst out of the fighter, dust rolls away along the ground.
  function roar(stage, unit, hex, size = 1) {
    const c = unit.chest();
    const tint = col(hex);
    for (let i = 0; i < 34; i += 1) {
      const a = (i / 34) * Math.PI * 2 + rnd(-0.05, 0.05);
      const v = rnd(6, 9) * size;
      stage.glow.spawn(c.x + Math.cos(a) * 0.3, c.y + Math.sin(a) * 0.3, c.z, Math.cos(a) * v, Math.sin(a) * v * 0.8, 0, 0.3, 0.26, tint, 3.5, 0, 5);
    }
    for (let i = 0; i < 3; i += 1) later(i * 0.08, () => stage.shock(unit.root.position, hex, (1.6 + i * 0.9) * size, 0.45));
    const base = unit.root.position;
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      stage.puffs.spawn(base.x + Math.cos(a) * 0.3, 0.12, base.z + Math.sin(a) * 0.2, Math.cos(a) * 2.4, 0.3, Math.sin(a) * 1.2, rnd(0.2, 0.32), rnd(0.6, 0.9), col("#8a7a64"), 2, 1.4);
    }
    stage.shake(0.12 * size);
  }

  // A stave of music: five wavy lines run from the singer to the target, notes riding on them.
  function staff(stage, from, to, hex, size = 1) {
    const tint = col(hex);
    const hot = tint.clone().lerp(col("#ffffff"), 0.4);
    let done = 0;
    over(stage, 0.42, (t) => {
      const head = Math.min(1, t / 0.8);
      while (done < head) {
        done = Math.min(head, done + 0.025);
        const p = new T.Vector3().lerpVectors(from, to, done);
        for (let j = 0; j < 5; j += 1) {
          const y = p.y + (j - 2) * 0.075 * size + Math.sin(done * 14 + j * 0.3) * 0.16 * size;
          stage.glow.spawn(p.x, y, p.z, 0, 0, 0, 0.05 * size, 0.34, tint, 0, 0, 0);
        }
        if (Math.random() < 0.3) stage.glow.spawn(p.x, p.y + rnd(-0.18, 0.18) * size, p.z, rnd(-0.3, 0.3), rnd(0.2, 0.8), 0, 0.2 * size, 0.6, hot, 1, 0, 3);
      }
    });
  }

  // A chord: wide rings of sound pulse out around the fighter, standing upright, one after another.
  function chord(stage, unit, hex, size = 1) {
    const c = unit.chest();
    for (let i = 0; i < 3; i += 1) {
      const mesh = new T.Mesh(new T.TorusGeometry(0.5, 0.035, 8, 40), glowMat(hex, 2.2, 0.9));
      mesh.position.copy(c);
      const delay = i * 0.13;
      oneShot(stage, mesh, 0.7 + delay, (t) => {
        const local = Math.max(0, (t * (0.7 + delay) - delay) / 0.7);
        mesh.visible = local > 0;
        mesh.scale.setScalar((0.5 + local * 2.4) * size);
        mesh.material.opacity = 0.9 * (1 - local);
      });
    }
    for (let i = 0; i < 12; i += 1) stage.glow.spawn(c.x + rnd(-0.6, 0.6), c.y + rnd(-0.6, 0.4), c.z, rnd(-0.3, 0.3), rnd(0.6, 1.4), 0, 0.22, rnd(0.6, 1), col(hex).lerp(col("#ffffff"), 0.3), 0.8, 0, 3);
  }

  // Shadow doubles of the fighter step out around the target, strike and are gone.
  function clones(stage, actor, target, hex, n = 3) {
    const spots = [[-1, 0, 0.25], [1, 0, -0.15], [-0.4, 0, -0.45], [0.6, 0, 0.45]];
    for (let i = 0; i < Math.min(n, spots.length); i += 1) {
      later(i * 0.07, () => {
        if (!target.root) return;
        const [sx, , sz] = spots[i];
        const spot = new T.Vector3(target.root.position.x + sx * 0.95, 0, target.root.position.z + sz);
        if (actor.shadeAt) actor.shadeAt(stage, spot, sx < 0 ? 1 : -1, hex, 0.38);
        else actor.afterimage?.(stage, hex, 0.3);
        stage.smoke(new T.Vector3(spot.x, 0.6, spot.z), "#120c1c", 6, 0.3);
        later(0.05, () => { if (target.root) stage.slash(target.chest(), hex, sx < 0 ? 1 : -1, false); });
      });
    }
  }

  // Blood bursts out of the far side of the target in a cone and splashes on the ground behind it.
  function bloodburst(stage, unit, hex = "#d01c34", dir = 1, size = 1) {
    const c = unit.chest();
    const tint = col(hex);
    for (let i = 0; i < 30 * size; i += 1) stage.glow.spawn(c.x, c.y + rnd(-0.15, 0.15), c.z, dir * rnd(1.5, 5.5), rnd(0.5, 3), rnd(-0.8, 0.8), rnd(0.12, 0.2), rnd(0.6, 0.95), tint, 0.6, 0, 2, 9);
    stage.flare(c, hex, 0.9, 0.12);
    later(0.18, () => stage.decal(new T.Vector3(unit.root.position.x + dir * 0.7, 0, unit.root.position.z + 0.1), "splat", "#3c0610", 0.9 * size, 2.4));
  }

  // The line of aim: a thin bright thread flashes between the shooter and the mark just before the shot lands.
  function aimline(stage, from, to, hex) {
    const length = from.distanceTo(to);
    const mesh = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, length, 6, 1, true), glowMat(hex, 3, 1));
    mesh.position.lerpVectors(from, to, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    oneShot(stage, mesh, 0.3, (t) => {
      mesh.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      mesh.scale.set(1 + t * 2, 1, 1 + t * 2);
    });
    stage.flare(to, hex, 0.55, 0.22);
    runes(stage, new T.Vector3(to.x, 0, to.z), hex, 0.7, 0.45);
  }

  // A shot goes through: a streak runs on beyond the target and sparks spray out of its back.
  function pierce(stage, from, to, hex, size = 1) {
    const dir = to.clone().sub(from).normalize();
    const tint = col(hex).lerp(col("#ffffff"), 0.3);
    for (let i = 0; i < 18; i += 1) {
      const v = rnd(8, 14);
      stage.glow.spawn(to.x, to.y + rnd(-0.06, 0.06), to.z, dir.x * v, dir.y * v + rnd(-0.4, 0.4), dir.z * v, rnd(0.24, 0.36) * size, rnd(0.15, 0.3), tint, 2, 0, 5);
    }
    stage.sparks(to, hex, 10, 4.5, dir.x >= 0 ? 1 : -1);
    const end = to.clone().add(dir.clone().multiplyScalar(3));
    const mesh = new T.Mesh(new T.CylinderGeometry(0.02, 0.006, 3, 6, 1, true), glowMat(hex, 2.6, 0.9));
    mesh.position.lerpVectors(to, end, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    oneShot(stage, mesh, 0.22, (t) => { mesh.material.opacity = 0.9 * (1 - t); });
  }

  // Chains of light circle the target and pull tight around it.
  function chains(stage, unit, hex, size = 1) {
    const tint = col(hex);
    const h = (unit.height || 2) * (unit.scale || 1);
    over(stage, 0.55, (t) => {
      const base = unit.root.position;
      const r = (1.1 - 0.75 * smoothIn(Math.min(1, t * 1.4))) * size;
      for (let ring = 0; ring < 3; ring += 1) {
        const y = h * (0.28 + ring * 0.22);
        for (let k = 0; k < 4; k += 1) {
          const a = t * 9 * (ring % 2 ? -1 : 1) + (k / 4) * Math.PI * 2 + ring;
          stage.glow.spawn(base.x + Math.cos(a) * r, y + Math.sin(a * 2) * 0.03, base.z + Math.sin(a) * r * 0.55, 0, 0, 0, 0.17, 0.12, tint, 0, 0, 7);
        }
      }
    });
    later(0.5, () => { if (!unit.root) return; stage.sparks(unit.chest(), hex, 12, 3.5); stage.flare(unit.chest(), hex, 0.7, 0.12); });
  }

  // A burning rock falls out of the sky and smashes into the ground under the target.
  function meteor(stage, unit, hex = "#ff8a3c", size = 1) {
    const ground = unit.root.position.clone();
    const top = new T.Vector3(ground.x - 2.2, 9, ground.z - 0.5);
    const land = new T.Vector3(ground.x, 0.4, ground.z);
    const rock = new T.Mesh(new T.DodecahedronGeometry(0.3 * size, 0), new T.MeshBasicMaterial({ color: col("#3a2418") }));
    rock.position.copy(top);
    const tint = col(hex);
    oneShot(stage, rock, 0.36, (t) => {
      rock.position.lerpVectors(top, land, t * t);
      rock.rotation.x += 0.3; rock.rotation.z += 0.2;
      for (let i = 0; i < 4; i += 1) stage.glow.spawn(rock.position.x + rnd(-0.15, 0.15), rock.position.y + rnd(-0.1, 0.2), rock.position.z, rnd(-0.5, 0.5), rnd(0.5, 1.5), 0, rnd(0.3, 0.5) * size, rnd(0.25, 0.45), i % 2 ? tint : col("#ffd27a"), 1, 0, 4);
      if (Math.random() < 0.5) stage.puffs.spawn(rock.position.x, rock.position.y + 0.3, rock.position.z, 0, 0.3, 0, 0.3, 0.8, col("#2a2220"), 1, 1.4);
    });
    later(0.36, () => {
      stage.flare(land, hex, 2 * size, 0.2);
      stage.shock(ground, hex, 3.4 * size, 0.55);
      stage.shock(ground, "#ffd27a", 2 * size, 0.35);
      stage.debris(land, "#4a3428", 18, 4.2);
      stage.sparks(land, "#ffb04a", 22, 5.5);
      stage.decal(ground, "scorch", "#120806", 1.5 * size, 2.6);
      stage.decal(ground, "crack", "#140e0a", 1.4 * size, 2.4);
      stage.smoke(new T.Vector3(ground.x, 0.4, ground.z), "#3a302a", 18, 0.7);
      stage.light(land, hex, 34, 0.35);
      stage.shake(0.28);
    });
  }

  // A ring of ice spikes runs out along the ground from the target, leaving rime behind.
  function frostnova(stage, unit, hex = "#9fe4ff", size = 1) {
    const base = unit.root.position.clone();
    for (let ring = 0; ring < 3; ring += 1) {
      later(ring * 0.08, () => {
        const r = (0.55 + ring * 0.55) * size;
        const n = 6 + ring * 3;
        for (let k = 0; k < n; k += 1) {
          const a = (k / n) * Math.PI * 2 + ring * 0.4;
          spikes(stage, new T.Vector3(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r * 0.6), hex, 1, (1.1 - ring * 0.25) * size, 0);
        }
        stage.shock(base, hex, (1.2 + ring * 0.9) * size, 0.35);
      });
    }
    stage.decal(base, "frost", hex, 1.6 * size, 2.6, true);
    stage.burst(unit.chest(), "#e8f8ff", 18, 3, 0.1, 0.5, 1);
  }

  // A cloud of venom: a green fog with bubbles rising out of it and drops dripping to the ground.
  function venom(stage, unit, hex = "#9be34f", size = 1) {
    const c = unit.chest();
    const tint = col(hex);
    stage.smoke(c, "#3c5a1a", 16, 0.5 * size);
    for (let i = 0; i < 16; i += 1) stage.glow.spawn(c.x + rnd(-0.5, 0.5), c.y + rnd(-0.6, 0.3), c.z, rnd(-0.2, 0.2), rnd(0.5, 1.2), 0, rnd(0.14, 0.24) * size, rnd(0.7, 1.1), tint, 0.6, 0, 7);
    for (let i = 0; i < 10; i += 1) stage.glow.spawn(c.x + rnd(-0.4, 0.4), c.y, c.z, rnd(-0.6, 0.6), rnd(0, 1), 0, 0.15, 0.9, tint, 0.4, 0, 2, 7);
    later(0.3, () => { if (unit.root) stage.decal(unit.root.position, "splat", "#2c4a12", 0.9 * size, 2.4); });
  }

  // A crushing blow: a short column of light drives down on the target, the ground splits, dust jumps.
  function hammer(stage, unit, hex = "#ffe2b0", size = 1) {
    const base = unit.root.position.clone();
    beam(stage, base, hex, 0.32 * size, 0.24);
    stage.flare(unit.chest(), hex, 1.3 * size, 0.16);
    stage.decal(base, "crack", "#140e0a", 1.3 * size, 2.2);
    stage.debris(new T.Vector3(base.x, 0.3, base.z), "#5a4a3c", 12, 3.4);
    stage.smoke(new T.Vector3(base.x, 0.2, base.z), "#7a6a58", 12, 0.6);
    stage.shock(base, hex, 2.4 * size, 0.4);
    stage.shake(0.22 * size);
    stage.pause(0.06);
  }

  const ELEMENT_RECIPE = {
    fire: (stage, point) => flames(stage, point),
    frost: (stage, point) => { spikes(stage, point, "#9fdcff", 6, 1.3, 0.75); stage.decal(point, "frost", "#9fe4ff", 1.2, 2.2, true); stage.burst(point, "#c8f2ff", 16, 2.4, 0.08, 0.5, 1); },
    water: (stage, point) => { stage.burst(point, "#5fb7ff", 30, 3.2, 0.09, 0.55, 2); stage.shock(point, "#5fb7ff", 1.8, 0.45); },
    earth: (stage, point) => { spikes(stage, point, "#8a6e4c", 8, 1.5, 0.95); stage.shake(0.12); stage.decal(point, "crack", "#140e0a", 1.3, 2.2); stage.smoke(new T.Vector3(point.x, 0.2, point.z), "#6a5a44", 12, 0.6); stage.burst(point, "#c8a878", 12, 2.6, 0.08, 0.5, 1); },
    air: (stage, point) => { lightning(stage, point, "#d6f4ff"); },
    holy: (stage, point) => { beam(stage, point, "#ffe9a0", 0.5, 0.55); stage.burst(point, "#fff2c0", 14, 2.2, 0.08, 0.6, 3); },
    dark: (stage, point) => voidPull(stage, point),
    arcane: (stage, point) => { runes(stage, point, "#8fa0ff", 1.1, 0.6); stage.burst(new T.Vector3(point.x, point.y, point.z), "#a8b4ff", 24, 3, 0.1, 0.5, 3); },
    poison: (stage, point) => { stage.smoke(new T.Vector3(point.x, 0.8, point.z), "#5f8a2f", 16, 0.5); stage.burst(new T.Vector3(point.x, point.y, point.z), "#9be34f", 18, 2, 0.1, 0.65, 2); },
    blood: (stage, point) => { stage.burst(new T.Vector3(point.x, point.y, point.z), "#ff2f46", 26, 3.4, 0.09, 0.5, 2); }
  };

  return { spikes, beam, lightning, flames, runes, soundWaves, whirl, voidPull, arrowRain, aura, bladestorm, crescent, dome, roar, staff, chord, clones, bloodburst, aimline, pierce, chains, meteor, frostnova, venom, hammer, ELEMENT_RECIPE };
})();
