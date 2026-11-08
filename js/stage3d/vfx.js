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
      stage.glow.spawn(center.x + Math.cos(a) * d, rnd(0, 0.5), center.z + Math.sin(a) * d, Math.cos(a) * 0.3, rnd(1.8, 4.6) * height, Math.sin(a) * 0.3, rnd(0.16, 0.36), rnd(0.35, 0.75), i % 3 ? mid : hot, 1.1);
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
        if (k >= 1 && !mesh.userData.hit) { mesh.userData.hit = true; stage.burst(new T.Vector3(x, 0.2, z), "#d8c8a0", 4, 1.4, 0.05, 0.25); }
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

  const ELEMENT_RECIPE = {
    fire: (stage, point) => flames(stage, point),
    frost: (stage, point) => { spikes(stage, point, "#9fdcff", 6, 1.3, 0.75); stage.burst(point, "#c8f2ff", 16, 2.4, 0.08, 0.5); },
    water: (stage, point) => { stage.burst(point, "#5fb7ff", 30, 3.2, 0.09, 0.55); stage.shock(point, "#5fb7ff", 1.8, 0.45); },
    earth: (stage, point) => { spikes(stage, point, "#8a6e4c", 8, 1.5, 0.95); stage.shake(0.12); stage.smoke(new T.Vector3(point.x, 0.2, point.z), "#6a5a44", 12, 0.6); },
    air: (stage, point) => { lightning(stage, point, "#d6f4ff"); },
    holy: (stage, point) => { beam(stage, point, "#ffe9a0", 0.5, 0.55); },
    dark: (stage, point) => voidPull(stage, point),
    arcane: (stage, point) => { runes(stage, point, "#8fa0ff", 1.1, 0.6); stage.burst(new T.Vector3(point.x, point.y, point.z), "#a8b4ff", 24, 3, 0.1, 0.5); },
    poison: (stage, point) => { stage.smoke(new T.Vector3(point.x, 0.8, point.z), "#5f8a2f", 16, 0.5); stage.burst(new T.Vector3(point.x, point.y, point.z), "#9be34f", 18, 2, 0.1, 0.65); },
    blood: (stage, point) => { stage.burst(new T.Vector3(point.x, point.y, point.z), "#ff2f46", 26, 3.4, 0.09, 0.5); }
  };

  return { spikes, beam, lightning, flames, runes, soundWaves, whirl, voidPull, arrowRain, aura, ELEMENT_RECIPE };
})();
