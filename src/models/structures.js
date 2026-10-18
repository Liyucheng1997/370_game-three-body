import * as THREE from 'three';
import { canvasTex, speckle, rand, boxUV, setShadow } from '../core/utils.js';
import { scrollGeometry, sheetMaterial } from './humanoid.js';

/* ---------------- 纹理 ---------------- */
function blockTexture(base, mortar, rows = 4, cols = 3, tint = ['#000', '#fff']) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w / cols / 2);
      for (let c = -1; c < cols + 1; c++) {
        const x = c * (w / cols) + off, y = r * bh;
        const l = 0.85 + Math.random() * 0.25;
        g.fillStyle = base; g.globalAlpha = 1; g.fillRect(x + 3, y + 3, w / cols - 6, bh - 6);
        g.fillStyle = `rgba(${l > 1 ? 255 : 0},${l > 1 ? 255 : 0},${l > 1 ? 255 : 0},${Math.abs(l - 1) * 0.8})`;
        g.fillRect(x + 3, y + 3, w / cols - 6, bh - 6);
      }
    }
    speckle(g, w, h, 6000, tint, 0.6, 2.2, 0.18);
    g.strokeStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 40; i++) { g.beginPath(); const x = rand(0, w), y = rand(0, h); g.moveTo(x, y); g.lineTo(x + rand(-30, 30), y + rand(-20, 20)); g.stroke(); }
  }, { repeat: [1, 1] });
}
let _stone = null, _mud = null, _thatch = null, _wood = null, _bronze = null;
export const Tex = {
  stone() { return _stone || (_stone = blockTexture('#8d7f6c', '#3e352b', 4, 3)); },
  mud() { return _mud || (_mud = blockTexture('#8a6a4a', '#4f3a27', 6, 4)); },
  thatch() {
    return _thatch || (_thatch = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#6b5636'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { g.strokeStyle = `rgba(${150 + rand(0, 60)},${120 + rand(0, 50)},${60 + rand(0, 40)},.5)`; const x = rand(0, w), y = rand(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-3, 3), y + rand(10, 26)); g.stroke(); }
    }, { repeat: [3, 1] }));
  },
  wood() {
    return _wood || (_wood = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#4a3220'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${rand(0, 40)},${rand(0, 20)},0,.25)`; g.fillRect(0, y, w, 1); }
    }, { repeat: [1, 1] }));
  },
  bronze() {
    return _bronze || (_bronze = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5a4a2c'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, ['#2f6b55', '#8a7040', '#1d1a10'], 1, 4, 0.35);
      g.strokeStyle = 'rgba(210,170,90,.45)'; g.lineWidth = 2; // 饕餮云雷纹
      for (let y = 30; y < h; y += 60) for (let x = 10; x < w; x += 40) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y); g.lineTo(x + 24, y + 18); g.lineTo(x + 8, y + 18); g.lineTo(x + 8, y + 8); g.lineTo(x + 16, y + 8); g.stroke();
      }
    }, { repeat: [2, 1] }));
  },
};

function mat(map, o = {}) { return new THREE.MeshStandardMaterial({ map, roughness: 0.92, ...o }); }

/* ---------------- 阶梯金字塔 ---------------- */
export function buildPyramid({ base = 120, height = 60, levels = 8, top = 24, stairs = true, unit = 4 } = {}) {
  const g = new THREE.Group();
  const m = mat(Tex.stone(), { roughness: 0.95 });
  const lh = height / levels;
  for (let i = 0; i < levels; i++) {
    const w = base - (base - top) * (i / (levels - 1));
    const b = new THREE.Mesh(boxUV(w, lh, w, unit), m);
    b.position.y = lh * (i + 0.5);
    g.add(b);
  }
  if (stairs) {
    const n = Math.round(height / 0.9);
    const sw = Math.max(8, top * 0.4);
    const rise = height / n;
    const run = (base - top) / 2 / n;
    const sm = mat(Tex.stone(), { color: '#b8aa94' });
    for (let i = 0; i < n; i++) {
      const depth = (base / 2 - i * run) - top / 2 + 1;
      const s = new THREE.Mesh(boxUV(sw, rise, Math.max(0.6, run * 1.2), unit), sm);
      s.position.set(0, rise * (i + 0.5), base / 2 - i * run + 0.3);
      g.add(s);
      if (depth < 0) break;
    }
  }
  setShadow(g, true, true);
  g.userData.topY = height;
  return g;
}

/* ---------------- 干仓 ---------------- */
export function buildGranary() {
  const g = new THREE.Group();
  const W = 18, D = 12, H = 7, T = 0.8;
  const wm = mat(Tex.mud(), { roughness: 0.97 });
  const add = (w, h, d, x, y, z, m = wm) => { const b = new THREE.Mesh(boxUV(w, h, d, 3), m); b.position.set(x, y, z); g.add(b); return b; };
  add(W, H, T, 0, H / 2, -D / 2);                 // 后墙
  add(T, H, D, -W / 2, H / 2, 0); add(T, H, D, W / 2, H / 2, 0);
  add(6, H, T, -6, H / 2, D / 2); add(6, H, T, 6, H / 2, D / 2); // 前墙两段，中间是大门
  add(6.4, 1.6, T * 1.4, 0, H - 0.8, D / 2);       // 门楣
  // 屋顶（两坡）
  const rm = mat(Tex.thatch());
  const rl = new THREE.Mesh(boxUV(W + 2, 0.5, D / 2 + 2.2, 3), rm); rl.position.set(0, H + 1.6, -D / 4 - 0.5); rl.rotation.x = -0.45; g.add(rl);
  const rr = rl.clone(); rr.position.z = D / 4 + 0.5; rr.rotation.x = 0.45; g.add(rr);
  add(W, 3.2, 0.4, 0, H + 1.2, 0, wm).scale.set(1, 1, 1); // 山墙
  // 货架 + 已存放的干燥卷轴
  const wood = mat(Tex.wood(), { roughness: 0.8 });
  const slots = [];
  const scrollMat = sheetMaterial();
  const scroll = scrollGeometry();
  const shelfRows = [{ z: -D / 2 + 1.4, x0: -7.5, x1: 7.5, rot: 0 }, { z: -D / 2 + 4.0, x0: -7.5, x1: 7.5, rot: 0 }];
  for (const row of shelfRows) {
    for (let tier = 0; tier < 4; tier++) {
      const y = 0.6 + tier * 1.45;
      add(row.x1 - row.x0 + 1, 0.12, 1.4, 0, y, row.z, wood);
      for (let x = row.x0; x <= row.x1 + 0.01; x += 1.0) slots.push(new THREE.Vector3(x, y + 0.07, row.z + 0.15));
    }
    for (let x = row.x0 - 0.5; x <= row.x1 + 0.6; x += 3.75) add(0.15, 6, 0.15, x, 3, row.z - 0.6, wood);
  }
  // 填满一部分（之前脱水的人）
  slots.forEach((s, i) => {
    if (i % 3 === 0 && Math.random() < 0.8) {
      const m = new THREE.Mesh(scroll, scrollMat);
      m.position.copy(s); m.rotation.y = Math.PI / 2 * 0 + rand(-0.06, 0.06);
      m.position.z -= 0.0; g.add(m);
      s.taken = true;
    }
  });
  setShadow(g, true, true);
  g.userData.slots = slots.filter(s => !s.taken);
  g.userData.size = { W, D, H };
  return g;
}

/* ---------------- 土屋 ---------------- */
export function buildHut(r = 3) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 2.8, 16, 1, true), mat(Tex.mud(), { side: THREE.DoubleSide }));
  wall.material.map = Tex.mud().clone(); wall.material.map.repeat.set(4, 1); wall.material.map.needsUpdate = true;
  wall.position.y = 1.4; g.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, 2.6, 16, 1), mat(Tex.thatch()));
  roof.position.y = 2.8 + 1.2; g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.9, 0.3), new THREE.MeshStandardMaterial({ color: '#120c08' }));
  door.position.set(0, 0.95, r * 0.98); g.add(door);
  setShadow(g, true, true);
  return g;
}

/* ---------------- 巨摆（用来"催眠"太阳的巨型单摆） ---------------- */
export function buildPendulum(h = 70, span = 34, ballR = 6) {
  const g = new THREE.Group();
  const sm = mat(Tex.stone());
  const p1 = new THREE.Mesh(boxUV(3.5, h, 3.5, 4), sm); p1.position.set(-span / 2, h / 2, 0); g.add(p1);
  const p2 = p1.clone(); p2.position.x = span / 2; g.add(p2);
  const beam = new THREE.Mesh(boxUV(span + 6, 3, 4, 4), sm); beam.position.y = h + 1.5; g.add(beam);
  const swing = new THREE.Group(); swing.position.y = h; g.add(swing);
  const L = h - ballR - 4;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, L, 6), new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.9 }));
  rope.position.y = -L / 2; swing.add(rope);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 24, 16), new THREE.MeshStandardMaterial({ map: Tex.bronze(), metalness: 0.6, roughness: 0.5 }));
  ball.position.y = -L - ballR * 0.8; swing.add(ball);
  setShadow(g, true, true);
  g.userData.swing = swing;
  return g;
}

/* ---------------- 青铜鼎 + 火焰 ---------------- */
const flameMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform float uTime, uSeed;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv; uv.x -= .5;
      float t = uTime*2.2 + uSeed;
      float nn = n(vec2(uv.x*5., uv.y*4. - t*2.)) * .6 + n(vec2(uv.x*11., uv.y*9. - t*3.5)) * .4;
      float w = (1. - uv.y) * .42 + .03;
      float f = smoothstep(w, w*.2, abs(uv.x + (nn-.5)*.25*uv.y)) * smoothstep(1., .3, uv.y + nn*.35) * smoothstep(0., .08, uv.y);
      vec3 c = mix(vec3(1., .25, .02), vec3(1., .85, .4), f*f);
      gl_FragColor = vec4(c * f * 2.5, f);
    }`,
});
export function buildTripod(scale = 1) {
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ map: Tex.bronze(), metalness: 0.75, roughness: 0.45 });
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.01, 0], [0.9, 0.05], [1.15, 0.45], [1.2, 0.95], [1.28, 1.05], [1.15, 1.08]].map(p => new THREE.Vector2(p[0], p[1])), 24), bm);
  bowl.position.y = 1.0; g.add(bowl);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.2, 8), bm);
    leg.position.set(Math.sin(a) * 0.75, 0.55, Math.cos(a) * 0.75); g.add(leg);
  }
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12, Math.PI), bm);
    ear.position.set(s * 0.8, 2.15, 0); ear.rotation.y = Math.PI / 2; g.add(ear);
  }
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.2), flameMat());
    f.position.set((i - 1) * 0.35, 2.0 + 1.5, (i - 1) * 0.15);
    f.renderOrder = 6;
    g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3a, 400, 40, 2);
  light.position.y = 3.6; g.add(light);
  setShadow(g, true, false);
  flames.forEach(f => { f.castShadow = false; });
  g.scale.setScalar(scale);
  g.userData = { flames, light };
  g.userData.update = (t, camera) => {
    flames.forEach((f, i) => {
      f.material.uniforms.uTime.value = t + i;
      const wp = f.getWorldPosition(new THREE.Vector3());
      f.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z) - g.rotation.y;
    });
    light.intensity = 400 * (0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3));
  };
  return g;
}

/* ---------------- 旌旗（布料飘动） ---------------- */
export function buildBanner(text = '秦', h = 16, w = 3.2, len = 7) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h, 8), new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.7 }));
  pole.position.y = h / 2; g.add(pole);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 8), new THREE.MeshStandardMaterial({ color: '#c8952e', metalness: 0.9, roughness: 0.3 }));
  tip.position.y = h + 0.6; g.add(tip);
  const tex = canvasTex(256, 512, (c, W, H) => {
    c.fillStyle = '#0c0807'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#a8281e'; c.lineWidth = 14; c.strokeRect(10, 10, W - 20, H - 20);
    c.strokeStyle = '#c8952e'; c.lineWidth = 3; c.strokeRect(26, 26, W - 52, H - 52);
    c.fillStyle = '#c8302a'; c.font = 'bold 190px "Noto Serif SC", "SimSun", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2);
    for (let i = 0; i < 5; i++) { c.fillStyle = '#a8281e'; c.beginPath(); c.moveTo(i * W / 5, H); c.lineTo((i + 0.5) * W / 5, H - 40); c.lineTo((i + 1) * W / 5, H); c.fill(); }
  });
  const geo = new THREE.PlaneGeometry(w, len, 10, 14);
  geo.translate(w / 2, -len / 2, 0);
  const base = Float32Array.from(geo.attributes.position.array);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
  cloth.position.set(0.15, h - 0.4, 0); g.add(cloth);
  setShadow(g, true, false);
  const seed = Math.random() * 10;
  g.userData.update = (t, wind = 1) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], y = base[i + 1];
      const k = x / w;
      p[i + 2] = Math.sin(x * 1.3 - t * 4.2 * wind + seed + y * 0.2) * 0.45 * k * wind + Math.sin(y * 0.8 + t * 2) * 0.12 * k;
      p[i] = x - Math.abs(p[i + 2]) * 0.2;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return g;
}
