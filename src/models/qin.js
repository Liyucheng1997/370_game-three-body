import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, speckle, rand, clamp, lerp } from '../core/utils.js';
import { buildHead, handGeometry, foldedLathe, profileRadius, ribbon, Sleeve } from './anatomy.js';

/* ======================= 纹理：玄衣纁裳、十二章纹 ======================= */
function drawCloud(g, x, y, s, color) {
  g.strokeStyle = color; g.lineWidth = 2.2 * s; g.lineCap = 'round';
  g.beginPath(); g.arc(x, y, 8 * s, Math.PI * 0.2, Math.PI * 1.9); g.stroke();
  g.beginPath(); g.arc(x + 14 * s, y + 2 * s, 6 * s, Math.PI, Math.PI * 2.6); g.stroke();
  g.beginPath(); g.arc(x - 13 * s, y + 3 * s, 5 * s, -Math.PI * 0.6, Math.PI); g.stroke();
  g.beginPath(); g.moveTo(x - 20 * s, y + 9 * s); g.quadraticCurveTo(x, y + 14 * s, x + 24 * s, y + 8 * s); g.stroke();
}
function drawDragon(g, x0, y0, len, amp, s, flip = 1) {
  const pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60; pts.push([x0 + flip * t * len, y0 + Math.sin(t * Math.PI * 2.4) * amp * (0.4 + t * 0.6)]); }
  const grd = g.createLinearGradient(x0, y0 - amp, x0, y0 + amp);
  grd.addColorStop(0, '#f6d27a'); grd.addColorStop(1, '#a8741e');
  g.strokeStyle = grd; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / pts.length;
    g.lineWidth = s * (3 + 9 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    g.beginPath(); g.moveTo(...pts[i]); g.lineTo(...pts[i + 1]); g.stroke();
  }
  // 龙鳞
  g.strokeStyle = 'rgba(90,50,10,.8)'; g.lineWidth = 1.2 * s;
  for (let i = 4; i < pts.length - 4; i += 2) { g.beginPath(); g.arc(pts[i][0], pts[i][1], 3 * s, 0, Math.PI); g.stroke(); }
  // 背鳍
  g.fillStyle = '#d9a640';
  for (let i = 6; i < pts.length - 6; i += 4) {
    const [x, y] = pts[i]; g.beginPath(); g.moveTo(x - 3 * s, y - 4 * s); g.lineTo(x, y - 12 * s); g.lineTo(x + 3 * s, y - 4 * s); g.fill();
  }
  // 龙首
  const [hx, hy] = pts[pts.length - 1];
  g.fillStyle = '#f2c766'; g.beginPath(); g.ellipse(hx + flip * 6 * s, hy, 11 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2c766'; g.lineWidth = 2 * s;
  g.beginPath(); g.moveTo(hx, hy - 5 * s); g.quadraticCurveTo(hx - flip * 8 * s, hy - 20 * s, hx - flip * 16 * s, hy - 18 * s); g.stroke(); // 角
  g.beginPath(); g.moveTo(hx + flip * 14 * s, hy + 2 * s); g.quadraticCurveTo(hx + flip * 28 * s, hy + 10 * s, hx + flip * 34 * s, hy + 2 * s); g.stroke(); // 须
  g.fillStyle = '#c0281c'; g.beginPath(); g.arc(hx + flip * 9 * s, hy - 2 * s, 2.2 * s, 0, 7); g.fill(); // 眼
  // 龙爪
  g.strokeStyle = '#e8b850'; g.lineWidth = 2.4 * s;
  [0.3, 0.62].forEach(t => {
    const [x, y] = pts[Math.floor(t * 60)];
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + flip * 6 * s, y + 12 * s); g.lineTo(x + flip * 12 * s, y + 10 * s); g.moveTo(x + flip * 6 * s, y + 12 * s); g.lineTo(x + flip * 4 * s, y + 18 * s); g.stroke();
  });
}
function drawFu(g, x, y, s) { // 黻纹（亞形）
  g.strokeStyle = '#e2b55a'; g.lineWidth = 3 * s;
  g.beginPath(); g.moveTo(x - 10 * s, y - 10 * s); g.lineTo(x - 3 * s, y - 3 * s); g.lineTo(x - 10 * s, y + 4 * s); g.lineTo(x - 3 * s, y + 11 * s); g.stroke();
  g.beginPath(); g.moveTo(x + 10 * s, y - 10 * s); g.lineTo(x + 3 * s, y - 3 * s); g.lineTo(x + 10 * s, y + 4 * s); g.lineTo(x + 3 * s, y + 11 * s); g.stroke();
}
function drawAxe(g, x, y, s) { // 黼纹（斧形）
  g.fillStyle = '#e2b55a';
  g.beginPath(); g.moveTo(x - 2 * s, y - 12 * s); g.lineTo(x + 2 * s, y - 12 * s); g.lineTo(x + 2 * s, y); g.quadraticCurveTo(x + 12 * s, y + 4 * s, x + 10 * s, y + 12 * s);
  g.lineTo(x - 10 * s, y + 12 * s); g.quadraticCurveTo(x - 12 * s, y + 4 * s, x - 2 * s, y); g.closePath(); g.fill();
  g.fillStyle = '#ffffff22'; g.fillRect(x - 8 * s, y + 6 * s, 16 * s, 2 * s);
}

function upperRobeTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) bg.addColorStop(i / 8, i % 2 ? '#141012' : '#0b0909');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#2a1e18', '#000'], 0.6, 1.8, 0.4);
    // 暗纹云
    for (let i = 0; i < 40; i++) drawCloud(g, rand(0, w), rand(60, h - 40), rand(0.8, 1.4), 'rgba(120,80,40,.22)');
    // 龙（正面两条、背面两条）
    drawDragon(g, 300, 300, 200, 60, 1.6, 1);
    drawDragon(g, 724, 300, 200, 60, 1.6, -1);
    drawDragon(g, 1000, 260, 180, 50, 1.3, -1);
    drawDragon(g, 24, 260, 180, 50, 1.3, 1);
    for (let i = 0; i < 14; i++) drawCloud(g, rand(0, w), rand(380, 480), 1.3, '#d6a24a');
    // 交领右衽（正面 u=0.5 → x=512）
    const band = (x0, y0, x1, y1, wd) => {
      g.lineCap = 'butt';
      g.strokeStyle = '#7d1612'; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#e2b55a'; g.lineWidth = 3;
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ox = nx / l * wd / 2, oy = ny / l * wd / 2;
      g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.moveTo(x0 - ox, y0 - oy); g.lineTo(x1 - ox, y1 - oy); g.stroke();
      g.fillStyle = '#e2b55a';
      for (let t = 0.05; t < 1; t += 0.12) { g.beginPath(); g.arc(lerp(x0, x1, t), lerp(y0, y1, t), 4, 0, 7); g.fill(); }
    };
    // 腰下缘
    g.fillStyle = '#7d1612'; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#e2b55a'; g.fillRect(0, h - 28, w, 3);
  });
}
function skirtTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#5a0e0c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { // 褶
      const gr = g.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.5, 'rgba(255,120,90,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gr; g.fillRect(x, 0, 32, h);
    }
    speckle(g, w, h, 7000, ['#2a0504', '#8a2a20'], 0.5, 1.6, 0.35);
    for (let i = 0; i < 24; i++) drawCloud(g, rand(0, w), rand(20, 300), rand(0.9, 1.3), 'rgba(226,181,90,.35)');
    // 纹饰带：黼黻交替
    g.fillStyle = '#1a0605'; g.fillRect(0, 352, w, 110);
    g.fillStyle = '#e2b55a'; g.fillRect(0, 352, w, 4); g.fillRect(0, 458, w, 4);
    for (let i = 0; i < 24; i++) { const x = 22 + i * 42.6; if (i % 2) drawFu(g, x, 405, 1.6); else drawAxe(g, x, 405, 1.6); }
    g.fillStyle = '#0a0606'; g.fillRect(0, 466, w, 46);
    g.fillStyle = '#e2b55a'; g.fillRect(0, 478, w, 2); g.fillRect(0, 498, w, 2);
  });
}
function apronTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#6e1410'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#300605', '#a8352a'], 0.5, 1.5, 0.3);
    g.strokeStyle = '#e2b55a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.lineWidth = 2; g.strokeRect(30, 30, w - 60, h - 60);
    drawFu(g, w / 2, 160, 4); drawAxe(g, w / 2, 330, 3.2);
    drawCloud(g, w / 2, 440, 2.2, '#e2b55a');
  });
}
function capeTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#0b0809'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 8000, ['#251a14', '#000'], 0.6, 2, 0.4);
    for (let i = 0; i < 26; i++) drawCloud(g, rand(0, w), rand(0, h), rand(1.2, 2), 'rgba(214,162,74,.45)');
    drawDragon(g, 60, 560, 380, 120, 2.4, 1);
    g.fillStyle = '#7d1612'; g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h); g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#e2b55a'; g.fillRect(22, 0, 3, h); g.fillRect(w - 25, 0, 3, h); g.fillRect(0, h - 42, w, 3);
  });
}
function sleeveTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0d0a0a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, ['#2a1e18', '#000'], 0.6, 1.8, 0.4);
    for (let i = 0; i < 12; i++) drawCloud(g, rand(0, w), rand(20, h - 60), rand(1, 1.5), 'rgba(214,162,74,.55)');
    g.fillStyle = '#7d1612'; g.fillRect(0, h - 44, w, 44);
    g.fillStyle = '#e2b55a'; g.fillRect(0, h - 46, w, 3); g.fillRect(0, h - 8, w, 3);
    for (let x = 10; x < w; x += 34) drawFu(g, x, h - 24, 0.8);
  });
}

function collarTex() {
  return canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = '#7d1612'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 600, ['#3a0806', '#b8402a'], 0.5, 1.5, 0.4);
    g.fillStyle = '#e2b55a'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    g.fillStyle = '#2a0604'; g.fillRect(6, 0, 2, h); g.fillRect(w - 8, 0, 2, h);
    for (let y = 12; y < h; y += 30) { drawCloud(g, w / 2, y, 0.9, '#e2b55a'); }
  });
}
function shouTex() { // 绶：多色经纬织带
  return canvasTex(128, 512, (g, w, h) => {
    const cols = ['#1a1a24', '#8a1712', '#d9a63a', '#2a5a48', '#8a1712', '#1a1a24'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / cols.length, 0, w / cols.length + 1, h); });
    g.globalAlpha = 0.25; for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? '#000' : '#fff'; g.fillRect(0, y, w, 1); } g.globalAlpha = 1;
    g.fillStyle = '#e2b55a'; g.fillRect(0, h - 30, w, 6);
    for (let x = 4; x < w; x += 8) { g.fillStyle = '#b8402a'; g.fillRect(x, h - 24, 3, 24); }
  });
}
const UPPER = [[0.238, 0.86], [0.252, 0.97], [0.264, 1.07], [0.274, 1.17], [0.283, 1.26], [0.29, 1.33], [0.28, 1.39], [0.235, 1.45], [0.15, 1.49], [0.08, 1.515], [0.062, 1.525]];
const SKIRT = [[0.45, 0.0], [0.44, 0.05], [0.41, 0.17], [0.37, 0.34], [0.33, 0.52], [0.29, 0.7], [0.262, 0.84], [0.245, 0.96]];
const surf = (prof, a, y, out = 0.01, zs = 0.78) => { const r = profileRadius(prof, y) * 1.035 + out; return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * zs); };

/* ======================= 秦始皇（巨像） ======================= */
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const BEAD_COLORS = ['#a8281e', '#b8b0a0', '#2a5a48', '#b88a2a', '#16161e'].map(c => new THREE.Color(c));

export class QinShiHuang {
  constructor(scale = 26) {
    this.S = scale;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(scale);
    this.pose = 0;           // 0=拄剑 1=举剑 2=剑指前方
    this.poseW = [1, 0, 0];  // 各姿态权重
    this.lookTarget = null;
    this.glow = 0.4;
    this.time = 0;
    this._mats();
    this._torso();
    this._head();
    this._arms();
    this._sword();
    this._cape();
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.beads.castShadow = false;
  }

  _mats() {
    const sheen = { sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#6a4524') };
    this.M = {
      upper: new THREE.MeshPhysicalMaterial({ map: upperRobeTex(), roughness: 0.62, ...sheen }),
      skirt: new THREE.MeshPhysicalMaterial({ map: skirtTex(), roughness: 0.66, ...sheen, sheenColor: new THREE.Color('#a8402a') }),
      apron: new THREE.MeshPhysicalMaterial({ map: apronTex(), roughness: 0.6, ...sheen, side: THREE.DoubleSide }),
      sleeve: new THREE.MeshPhysicalMaterial({ map: sleeveTex(), roughness: 0.62, ...sheen, side: THREE.DoubleSide }),
      capeOut: new THREE.MeshPhysicalMaterial({ map: capeTex(), roughness: 0.62, ...sheen, side: THREE.FrontSide }),
      capeIn: new THREE.MeshPhysicalMaterial({ color: '#5a0c0a', roughness: 0.6, ...sheen, sheenColor: new THREE.Color('#c0402a'), side: THREE.BackSide }),
      skin: new THREE.MeshStandardMaterial({ color: '#a8775a', roughness: 0.72 }),
      beard: new THREE.MeshStandardMaterial({ color: '#1c1916', roughness: 0.9 }),
      hair: new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: 0.75 }),
      lacquer: new THREE.MeshStandardMaterial({ color: '#070606', roughness: 0.25, metalness: 0.2 }),
      red: new THREE.MeshStandardMaterial({ color: '#8a1712', roughness: 0.5 }),
      gold: new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.3, metalness: 0.95 }),
      jade: new THREE.MeshStandardMaterial({ color: '#b9d6c0', roughness: 0.2, metalness: 0.05 }),
      eye: new THREE.MeshStandardMaterial({ color: '#1a0e06', emissive: new THREE.Color('#ffae3a'), emissiveIntensity: 0.4, roughness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: 0.8 }),
      blade: new THREE.MeshStandardMaterial({ color: '#c9c2b0', metalness: 1, roughness: 0.22, emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 }),
      bronze: new THREE.MeshStandardMaterial({ color: '#8a6a30', metalness: 0.9, roughness: 0.35 }),
    };
  }

  _add(geo, mat, x = 0, y = 0, z = 0, parent = this.body) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  }

  _torso() {
    // 纁裳：底部百褶
    this._add(foldedLathe(SKIRT, { segs: 96, folds: 22, amp: t => 0.01 + 0.035 * t, seed: 0.7, zScale: 0.84 }), this.M.skirt);
    // 玄衣：腰间收束的褶皱
    this._add(foldedLathe(UPPER, { segs: 80, folds: 11, amp: t => 0.006 + 0.03 * Math.pow(t, 3), seed: 2.1, zScale: 0.78 }), this.M.upper);
    // 交领（右衽）：立体镶边
    const cm = new THREE.MeshPhysicalMaterial({ map: collarTex(), roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#d06040'), side: THREE.DoubleSide });
    const path = (a0, y0, a1, y1, n = 18) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return surf(UPPER, lerp(a0, a1, t), lerp(y0, y1, t) + Math.sin(t * Math.PI) * 0.025); });
    this._add(ribbon(path(-0.9, 1.52, 0.2, 1.25), 0.055), cm);
    this._add(ribbon(path(0.9, 1.52, -0.62, 0.94, 24), 0.06), cm);
    this._add(ribbon(Array.from({ length: 26 }, (_, i) => { const a = Math.PI * 0.72 + i / 25 * Math.PI * 0.56; return new THREE.Vector3(Math.sin(a) * 0.072, 1.535, Math.cos(a) * 0.066); }), 0.05, { outward: () => new THREE.Vector3(0, 1, 0) }), cm);
    // 绶：背后与两侧垂下的彩色织带
    const sm = new THREE.MeshPhysicalMaterial({ map: shouTex(), roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#ffd080'), side: THREE.DoubleSide });
    const hang = (a, w, len, sway) => Array.from({ length: 16 }, (_, i) => { const t = i / 15; const y = 0.93 - t * len; const p = surf(SKIRT, a + Math.sin(t * 3) * sway, Math.max(0.02, y), 0.015, 0.84); return p; });
    this._add(ribbon(hang(Math.PI, 0.16, 0.85, 0.02), 0.16), sm);
    this.M.collar = cm; this.M.shou = sm;
    // 肩
    for (const s of [-1, 1]) {
      const sh = this._add(new THREE.SphereGeometry(0.1, 24, 16), this.M.upper, s * 0.255, 1.37, 0);
      sh.scale.set(1.15, 0.8, 1);
      // 日（左肩）月（右肩）
      const disc = this._add(new THREE.CircleGeometry(0.048, 24), s > 0
        ? new THREE.MeshStandardMaterial({ color: '#c0281c', emissive: '#7a1008', emissiveIntensity: 0.5, roughness: 0.4 })
        : new THREE.MeshStandardMaterial({ color: '#e8e4d8', emissive: '#6a6a70', emissiveIntensity: 0.3, roughness: 0.4 }), s * 0.26, 1.43, 0.035);
      disc.rotation.set(-1.0, 0, 0);
      const ring = this._add(new THREE.TorusGeometry(0.05, 0.005, 6, 24), this.M.gold, s * 0.26, 1.431, 0.036);
      ring.rotation.set(-1.0, 0, 0);
    }
    // 大带 + 玉佩
    const belt = this._add(new THREE.TorusGeometry(0.25, 0.032, 10, 40), this.M.red, 0, 0.93, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.82, 1);
    const belt2 = this._add(new THREE.TorusGeometry(0.252, 0.01, 6, 40), this.M.gold, 0, 0.955, 0);
    belt2.rotation.x = Math.PI / 2; belt2.scale.set(1, 0.82, 1);
    const buckle = this._add(new THREE.BoxGeometry(0.07, 0.06, 0.02), this.M.gold, 0, 0.93, 0.212);
    buckle.rotation.x = -0.05;
    for (const s of [-1, 1]) {
      const cord = this._add(new THREE.CylinderGeometry(0.004, 0.004, 0.3), this.M.red, s * 0.16, 0.78, 0.17);
      cord.rotation.z = s * 0.05;
      for (let k = 0; k < 3; k++) {
        const bi = this._add(new THREE.TorusGeometry(0.026 - k * 0.003, 0.009, 6, 18), this.M.jade, s * 0.16, 0.86 - k * 0.075, 0.18);
        bi.rotation.y = s * 0.3;
      }
      this._add(new THREE.SphereGeometry(0.012, 8, 6), this.M.gold, s * 0.16, 0.62, 0.18);
    }
    // 蔽膝
    const ap = new THREE.CylinderGeometry(0.262, 0.385, 0.62, 10, 4, true, -0.42, 0.84);
    ap.scale(1, 1, 0.86);
    this._add(ap, this.M.apron, 0, 0.6, 0.004);
    // 赤舄
    // 赤舄：圆头厚底、翘起的鞋头（絇）
    const shoeGeo = new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    shoeGeo.scale(0.95, 0.75, 1.9);
    const soleGeo = new THREE.CylinderGeometry(0.058, 0.06, 0.022, 24); soleGeo.scale(0.95, 1, 1.9);
    const qu = new THREE.TorusGeometry(0.03, 0.009, 8, 20, Math.PI * 1.25);
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.105, 0, 0.3); g.rotation.y = -s * 0.08; this.body.add(g);
      this._add(soleGeo, this.M.dark, 0, 0.011, 0, g);
      this._add(shoeGeo, this.M.red, 0, 0.02, 0, g);
      const q = this._add(qu, this.M.gold, 0, 0.055, 0.1, g); q.rotation.set(0, Math.PI / 2, 0.3);
      const band = this._add(new THREE.TorusGeometry(0.058, 0.004, 6, 24), this.M.gold, 0, 0.045, 0, g); band.rotation.x = Math.PI / 2; band.scale.set(0.95, 1.9, 1);
    }
  }

  _head() {
    const H = new THREE.Group(); H.position.set(0, 1.648, 0.012); H.rotation.order = 'YXZ';
    this.body.add(H); this.head = H;
    const M = this.M, add = (g, m, x, y, z) => this._add(g, m, x, y, z, H);
    const head = buildHead({
      skin: '#a8775a', hair: '#0d0b0a', iris: '#7a4410', style: 'cap', beard: 'long', glow: 0.6, seed: 11,
      face: { jaw: 0.86, w: 0.76, brow: 1.4, browAngle: 1.1, browThick: 1.3, cheek: 1.2, nose: 1.15, lips: 0.95, chin: 1.1, age: 0.55, stubble: 0.45 },
    });
    H.add(head.group);
    M.eye = head.mats.eye; M.skin = head.mats.skinPlain; M.face = head.mats.skin;
    head.mats.hair.roughness = 0.45;
    // 冠
    add(new THREE.CylinderGeometry(0.052, 0.058, 0.085, 20), M.lacquer, 0, 0.135, -0.015);
    add(new THREE.TorusGeometry(0.058, 0.006, 6, 24), M.gold, 0, 0.1, -0.015).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.008, 0.06, 0.008), M.gold, s * 0.03, 0.2, -0.015);
    // 冕板（綖）：上玄下纁，前低后高
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.013, 0.44), [M.gold, M.gold, M.lacquer, M.red, M.gold, M.gold]);
    board.position.set(0, 0.235, 0.01); board.rotation.x = 0.07; H.add(board);
    this.board = board;
    // 玉笄 + 纮 + 充耳
    const pin = add(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), M.jade, 0, 0.14, -0.015);
    pin.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.01, 8, 6), M.gold, s * 0.13, 0.14, -0.015);
      const cord = add(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), M.red, s * 0.118, 0.07, -0.01);
      cord.rotation.z = s * 0.09;
      add(new THREE.SphereGeometry(0.013, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c050', roughness: 0.25, emissive: '#3a2a00' }), s * 0.11, -0.005, -0.005);
    }
    // 十二旒（前后各十二串，每串十二颗五彩玉珠）
    const N = 12, PER = 10;
    this.beadInfo = { N, PER, sp: 0.0165 };
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0046, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }), N * PER * 2);
    let k = 0;
    for (let side = 0; side < 2; side++) for (let i = 0; i < N; i++) for (let j = 0; j < PER; j++) {
      this.beads.setColorAt(k++, BEAD_COLORS[(j + i) % 5]);
    }
    H.add(this.beads);
    this.beadAnchors = [];
    const bq = new THREE.Quaternion().setFromEuler(board.rotation);
    for (const zs of [1, -1]) for (let i = 0; i < N; i++) {
      const a = new THREE.Vector3(-0.088 + i * (0.176 / (N - 1)), -0.007, zs * 0.215).applyQuaternion(bq).add(board.position);
      this.beadAnchors.push(a);
    }
    // 旒线
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 2 * 3), 3));
    this.beadLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#3a2a1a' }));
    H.add(this.beadLines);
  }

  _arms() {
    this.arms = {};
    const mk = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.285, 1.385, 0.0);
      this.body.add(g);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.046, 0.56, 12).translate(0, -0.28, 0), this.M.upper);
      g.add(inner);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12), this.M.red); cuff.position.y = -0.55; g.add(cuff);
      const hand = new THREE.Mesh(handGeometry('grip', side), this.M.skin);
      hand.position.y = -0.585; hand.rotation.y = side * Math.PI / 2; hand.scale.setScalar(1.05);
      g.add(hand);
      // 宽大的袖子：随手臂姿态与重力实时变形
      const sl = new Sleeve(this.M.sleeve, { r0: 0.08, r1: 0.205, sag: 0.32, len: 0.6, NS: 14, NR: 20 });
      this.body.add(sl.mesh);
      const sleeve = sl.mesh;
      return { g, hand, sleeve, sl, q: new THREE.Quaternion(), side };
    };
    this.arms.R = mk(-1); // 右臂在 -x（他面朝 +z）
    this.arms.L = mk(1);
    const dq = d => new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3(...d).normalize());
    // [拄剑, 举剑, 剑指前方]
    this.poses = {
      R: [dq([0.255, -0.415, 0.345]), dq([-0.12, 0.96, 0.3]), dq([-0.04, 0.22, 1])],
      L: [dq([-0.255, -0.47, 0.345]), dq([0.16, -0.97, 0.16]), dq([0.2, -0.95, 0.2])],
    };
    this.arms.R.q.copy(this.poses.R[0]); this.arms.L.q.copy(this.poses.L[0]);
  }

  _sword() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-0.021, 0.07); shape.lineTo(-0.023, 0.86); shape.lineTo(0, 0.97); shape.lineTo(0.023, 0.86); shape.lineTo(0.021, 0.07); shape.closePath();
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.008, bevelSegments: 1 });
    blade.translate(0, 0, -0.002);
    g.add(new THREE.Mesh(blade, this.M.blade));
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.86, 0.012), this.M.blade); ridge.position.y = 0.5; g.add(ridge);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.034), this.M.gold); guard.position.y = 0.055; g.add(guard);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshStandardMaterial({ color: '#2f8a6a', emissive: '#0a3a28', roughness: 0.2 })); gem.position.set(0, 0.055, 0.018); g.add(gem);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.17, 10), this.M.dark); grip.position.y = -0.045; g.add(grip);
    for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 12), this.M.gold); w.rotation.x = Math.PI / 2; w.position.y = -0.12 + i * 0.028; g.add(w); }
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.016, 14), this.M.gold); pommel.position.y = -0.138; g.add(pommel);
    // 剑穗
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 6), this.M.red); tassel.position.y = -0.19; g.add(tassel);
    this.sword = g;
    this.body.add(g);
  }

  _cape() {
    const W = 0.78, L = 1.42;
    const geo = new THREE.PlaneGeometry(W, L, 10, 18);
    geo.translate(0, -L / 2, 0);
    this.capeBase = Float32Array.from(geo.attributes.position.array);
    this.capeGeo = geo;
    this.capeDims = { W, L };
    const out = new THREE.Mesh(geo, this.M.capeOut), inn = new THREE.Mesh(geo, this.M.capeIn);
    for (const m of [out, inn]) { m.position.set(0, 1.47, -0.2); m.rotation.y = Math.PI; m.frustumCulled = false; this.body.add(m); }
  }

  setPose(i) { this.pose = i; }

  update(dt, t, wind = 1) {
    this.time = t;
    // 姿态权重
    for (let i = 0; i < 3; i++) this.poseW[i] = lerp(this.poseW[i], i === this.pose ? 1 : 0, Math.min(1, dt * 2.2));
    const blend = (list) => {
      const q = list[0].clone();
      const w1 = this.poseW[1], w2 = this.poseW[2];
      if (w1 > 0.001) q.slerp(list[1], w1 / (this.poseW[0] + w1 + 1e-6));
      if (w2 > 0.001) q.slerp(list[2], w2);
      return q;
    };
    for (const k of ['R', 'L']) {
      const a = this.arms[k];
      a.q.copy(blend(this.poses[k]));
      a.g.quaternion.copy(a.q);
      a.sl.update(a.g.position, a.q, t, DOWN, a.side);
    }
    // 剑：拄剑时剑尖朝下，举起时顺着手臂
    const R = this.arms.R;
    const handPos = new THREE.Vector3(0, -0.6, 0).applyQuaternion(R.q).add(R.g.position);
    const armDir = DOWN.clone().applyQuaternion(R.q);
    const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const qAlong = new THREE.Quaternion().setFromUnitVectors(UP, armDir);
    this.sword.quaternion.copy(qDown).slerp(qAlong, 1 - this.poseW[0]);
    this.sword.position.copy(handPos);
    const raised = 1 - this.poseW[0];
    this.M.blade.emissiveIntensity = raised * (1.6 + Math.sin(t * 3) * 0.4);
    this.M.eye.emissiveIntensity = this.glow * (0.8 + 0.2 * Math.sin(t * 1.3)) + raised * 1.5;

    // 呼吸
    this.body.scale.y = 1 + Math.sin(t * 0.8) * 0.004;
    // 头部朝向
    let yaw = Math.sin(t * 0.17) * 0.12, pitch = 0.12;
    if (this.lookTarget) {
      const lp = this.root.worldToLocal(this.lookTarget.clone()).sub(this.head.position);
      yaw = Math.atan2(lp.x, lp.z);
      pitch = -Math.atan2(lp.y, Math.hypot(lp.x, lp.z));
    }
    yaw = clamp(yaw, -0.7, 0.7); pitch = clamp(pitch, -0.35, 0.6);
    this.head.rotation.y = lerp(this.head.rotation.y, yaw, Math.min(1, dt * 1.5));
    this.head.rotation.x = lerp(this.head.rotation.x, pitch, Math.min(1, dt * 1.5));

    // 旒：重力方向换算到头部局部坐标后摆动
    const invHead = this.head.quaternion.clone().invert();
    const g0 = DOWN.clone().applyQuaternion(invHead);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), hang = new THREE.Vector3();
    const lp = this.beadLines.geometry.attributes.position.array;
    const { N, PER, sp } = this.beadInfo;
    let k = 0;
    this.beadAnchors.forEach((a, si) => {
      const ph = si * 0.37;
      hang.copy(g0);
      hang.x += Math.sin(t * 1.6 + ph) * 0.05 * wind + (this.head.rotation.y - (this._lastYaw || 0)) * 3;
      hang.z += Math.sin(t * 1.25 + ph * 1.3) * 0.04 * wind;
      hang.normalize();
      for (let j = 1; j <= PER; j++) {
        p.copy(a).addScaledVector(hang, j * sp);
        m4.makeTranslation(p.x, p.y, p.z);
        this.beads.setMatrixAt(k++, m4);
      }
      lp.set([a.x, a.y, a.z, p.x, p.y, p.z], si * 6);
    });
    this._lastYaw = lerp(this._lastYaw || 0, this.head.rotation.y, Math.min(1, dt * 3));
    this.beads.instanceMatrix.needsUpdate = true;
    this.beadLines.geometry.attributes.position.needsUpdate = true;

    // 披风
    const pos = this.capeGeo.attributes.position.array, b = this.capeBase, { W, L } = this.capeDims;
    for (let i = 0; i < pos.length; i += 3) {
      const x = b[i], y = b[i + 1];
      const d = -y / L; // 0 顶部 → 1 底部
      const xs = x * lerp(0.9, 1.45, d);
      const wave = Math.sin(t * 2.1 * wind + d * 5 + x * 3) * 0.06 * d * wind + Math.sin(t * 3.3 + d * 9 - x * 5) * 0.02 * d;
      pos[i] = xs + Math.sin(t * 1.1 + d * 3) * 0.03 * d;
      pos[i + 1] = y * lerp(1, 0.97, d);
      pos[i + 2] = -(x * x) * 0.9 * (1 - d * 0.5) + 0.25 * Math.pow(d, 1.2) + wave + 0.06;
    }
    this.capeGeo.attributes.position.needsUpdate = true;
    this.capeGeo.computeVertexNormals();
  }

  /* 头部的世界坐标（方便镜头对准） */
  headWorld(out = new THREE.Vector3()) { return this.head.getWorldPosition(out); }
}
