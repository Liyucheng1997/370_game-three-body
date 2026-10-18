import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, speckle, rand, clamp, smoothstep, lerp, easeInOut, mulberry32 } from '../core/utils.js';
import { buildHead, handGeometry, foldedLathe, profileRadius, ribbon, Sleeve } from './anatomy.js';

/* ---------------- 纹理 ---------------- */
const texCache = new Map();
function robeTexture(base, trim, style = 'robe') {
  const key = base + trim + style;
  if (texCache.has(key)) return texCache.get(key);
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#000', '#fff'], 0.5, 1.6, 0.06);
    // 竖向织纹
    g.globalAlpha = 0.08; g.fillStyle = '#000';
    for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1;
    if (style === 'robe') {
      // 下摆镶边 + 暗纹
      g.fillStyle = trim; g.fillRect(0, h - 26, w, 26);
      g.fillStyle = 'rgba(255,220,150,.22)'; g.fillRect(0, h - 28, w, 2); g.fillRect(0, h - 6, w, 1);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5;
      for (let y = 20; y < h - 40; y += 28) for (let x = (y / 28 % 2) * 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 1.5); g.stroke(); }
    } else if (style === 'coat') {
      g.fillStyle = trim; g.fillRect(w * 0.49, 0, 3, h);
      for (let y = 30; y < h - 30; y += 22) { g.fillStyle = '#d4b06a'; g.beginPath(); g.arc(w * 0.47, y, 2.6, 0, 7); g.fill(); }
      g.fillStyle = '#eee'; g.beginPath(); g.moveTo(w * 0.45, 0); g.lineTo(w * 0.55, 0); g.lineTo(w * 0.5, 40); g.fill();
    } else if (style === 'suit') {
      g.fillStyle = '#e8e6e0'; g.beginPath(); g.moveTo(w * 0.42, 0); g.lineTo(w * 0.58, 0); g.lineTo(w * 0.5, 110); g.fill();
      g.fillStyle = '#5a1a1a'; g.beginPath(); g.moveTo(w * 0.49, 6); g.lineTo(w * 0.51, 6); g.lineTo(w * 0.515, 95); g.lineTo(w * 0.5, 108); g.lineTo(w * 0.485, 95); g.fill();
      for (let y = 130; y < h - 20; y += 40) { g.fillStyle = '#111'; g.beginPath(); g.arc(w * 0.5, y, 2.5, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w * 0.40, 0); g.lineTo(w * 0.49, 90); g.moveTo(w * 0.60, 0); g.lineTo(w * 0.51, 90); g.stroke();
    }
  });
  texCache.set(key, tex);
  return tex;
}

let _fabric = null;
function fabricBump() {
  if (_fabric) return _fabric;
  _fabric = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#8a8a8a' : '#707070'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, 0, 1, h); }
  }, { srgb: false, repeat: [6, 6] });
  return _fabric;
}

let _sheetTex = null;
function sheetTexture() {
  if (_sheetTex) return _sheetTex;
  _sheetTex = canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const path = () => {
      g.beginPath();
      g.ellipse(64, 26, 17, 21, 0, 0, Math.PI * 2);
      g.moveTo(54, 44); g.lineTo(74, 44); g.lineTo(100, 60); g.lineTo(121, 138); g.lineTo(109, 146);
      g.lineTo(95, 98); g.lineTo(106, 250); g.lineTo(22, 250); g.lineTo(33, 98); g.lineTo(19, 146); g.lineTo(7, 138); g.lineTo(28, 60);
      g.closePath();
    };
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#5b3a22'); grd.addColorStop(0.5, '#8a5d38'); grd.addColorStop(1, '#5b3a22');
    g.fillStyle = grd; path(); g.fill();
    g.save(); path(); g.clip();
    speckle(g, w, h, 1800, ['#3a2414', '#a8794c', '#2a1a0e'], 0.6, 2.4, 0.4);
    g.strokeStyle = 'rgba(40,22,10,.55)'; g.lineWidth = 1;
    for (let i = 0; i < 70; i++) { // 皱纹
      const y = rand(10, 250), x = rand(10, 118);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rand(-12, 12), y + rand(-4, 4), x + rand(-20, 20), y + rand(-3, 3)); g.stroke();
    }
    g.restore();
    g.strokeStyle = '#2a170a'; g.lineWidth = 3; path(); g.stroke();
  });
  return _sheetTex;
}

/* ---------------- 人形（雕刻头部 + 褶皱袍服 + 广袖 + 手指） ---------------- */
const ROBE_OUT = [[0.335, 0.07], [0.315, 0.2], [0.285, 0.38], [0.258, 0.55], [0.236, 0.72], [0.222, 0.88], [0.216, 0.98], [0.226, 1.1], [0.242, 1.22], [0.252, 1.31], [0.24, 1.385], [0.19, 1.45], [0.11, 1.5], [0.068, 1.525]];
const ROBE_IN = [[0.305, 0.0], [0.29, 0.12], [0.262, 0.35], [0.236, 0.6], [0.215, 0.85], [0.205, 0.97]];
const COAT = [[0.275, 0.46], [0.255, 0.6], [0.232, 0.78], [0.215, 0.92], [0.222, 1.05], [0.236, 1.2], [0.245, 1.32], [0.218, 1.41], [0.145, 1.47], [0.08, 1.51], [0.062, 1.53]];
const JACKET = [[0.238, 0.72], [0.226, 0.85], [0.214, 0.96], [0.224, 1.1], [0.24, 1.22], [0.248, 1.32], [0.22, 1.41], [0.15, 1.47], [0.085, 1.5], [0.064, 1.52]];
const geoCache = new Map();
const cached = (k, fn) => { if (!geoCache.has(k)) geoCache.set(k, fn()); return geoCache.get(k); };
const HAT = { knot: 'bun', none: 'short', crown: 'bun', wig: 'wig', short: 'short', bun: 'bun' };
const BEARD = { false: 'none', true: 'goatee', long: 'long', mustache: 'mustache', full: 'full', none: 'none' };

function onSurface(profile, a, y, out = 0.008, zScale = 0.8) {
  const r = profileRadius(profile, y) * 1.03 + out;
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * zScale);
}
function collarGeometry(profile) {
  return cached('collar' + profile.length, () => {
    const pts = (a0, y0, a1, y1, n = 14) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return onSurface(profile, lerp(a0, a1, t), lerp(y0, y1, t) + Math.sin(t * Math.PI) * 0.02); });
    const under = ribbon(pts(-0.85, 1.5, 0.15, 1.27), 0.05);
    const over = ribbon(pts(0.85, 1.5, -0.6, 1.0), 0.055);
    const neck = ribbon(Array.from({ length: 20 }, (_, i) => { const a = Math.PI * 0.75 + i / 19 * Math.PI * 0.5; return new THREE.Vector3(Math.sin(a) * 0.075, 1.52, Math.cos(a) * 0.07); }), 0.045, { outward: () => new THREE.Vector3(0, 1, 0) });
    return mergeGeometries([under, over, neck]);
  });
}

export class Humanoid {
  constructor(o = {}) {
    this.opts = o;
    const { robe = '#5b4634', trim = '#2b1d14', skin = '#c99a74', hair = '#15100c', scale = 1, style = 'robe', hat = 'knot', beard = false, seed = (Math.random() * 1e6) | 0, face = null, iris = '#2a1a10' } = o;
    const rnd = mulberry32(seed);
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    const tex = robeTexture(robe, trim, style);
    this.mats = {
      robe: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, bumpMap: fabricBump(), bumpScale: 0.4, side: THREE.DoubleSide }),
      inner: new THREE.MeshStandardMaterial({ color: o.inner || trim, roughness: 0.9, bumpMap: fabricBump(), bumpScale: 0.3, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ color: trim, roughness: 0.75, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.55 }),
      white: new THREE.MeshStandardMaterial({ color: '#b8b2a6', roughness: 0.85, side: THREE.DoubleSide }),
    };
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = this.pivot) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    let profile = ROBE_OUT;
    if (style === 'robe') {
      add(cached('robeIn', () => foldedLathe(ROBE_IN, { folds: 14, amp: t => 0.012 + 0.03 * t, seed: 1.3 })), this.mats.inner);
      this.robe = add(cached('robeOut' + (seed % 4), () => foldedLathe(ROBE_OUT, { folds: 9, amp: t => 0.012 + 0.07 * t * t, seed: (seed % 4) * 1.7 })), this.mats.robe);
      add(collarGeometry(ROBE_OUT), this.mats.trim);
      const belt = add(cached('belt', () => new THREE.TorusGeometry(0.222, 0.022, 8, 32).rotateX(Math.PI / 2).scale(1, 1, 0.8)), this.mats.trim, 0, 0.985, 0);
      void belt;
      add(cached('sash', () => mergeGeometries([
        ribbon(Array.from({ length: 10 }, (_, i) => new THREE.Vector3(0.03 + Math.sin(i * 0.5) * 0.008, 0.97 - i * 0.045, 0.19 + i * 0.006)), 0.04, { outward: () => new THREE.Vector3(0, 0, 1) }),
        ribbon(Array.from({ length: 8 }, (_, i) => new THREE.Vector3(-0.02 - Math.sin(i * 0.6) * 0.008, 0.97 - i * 0.045, 0.19 + i * 0.006)), 0.035, { outward: () => new THREE.Vector3(0, 0, 1) }),
      ])), this.mats.trim);
      for (const s of [-1, 1]) add(cached('shoe', () => new RoundedBoxGeometry(0.09, 0.06, 0.22, 2, 0.025)), this.mats.dark, s * 0.08, 0.03, 0.17);
    } else {
      profile = style === 'coat' ? COAT : JACKET;
      this.robe = add(cached(style, () => foldedLathe(profile, { folds: 7, amp: t => 0.008 + 0.03 * t * t, seed: 2 })), this.mats.robe);
      const legTop = style === 'coat' ? 0.62 : 0.8;
      for (const s of [-1, 1]) {
        if (style === 'coat') {
          add(cached('stock', () => new THREE.CylinderGeometry(0.052, 0.042, 0.42, 12).translate(0, 0.27, 0)), this.mats.white, s * 0.085, 0, 0);
          add(cached('breech', () => new THREE.CylinderGeometry(0.075, 0.06, legTop - 0.44, 12).translate(0, (legTop + 0.44) / 2, 0)), this.mats.inner, s * 0.085, 0, 0);
          add(cached('buckle', () => new THREE.BoxGeometry(0.04, 0.025, 0.01)), new THREE.MeshStandardMaterial({ color: '#c8a050', metalness: 0.9, roughness: 0.3 }), s * 0.085, 0.06, 0.13);
        } else {
          add(cached('trouser', () => new THREE.CylinderGeometry(0.075, 0.062, 0.78, 12).translate(0, 0.43, 0)), this.mats.robe, s * 0.088, 0, 0);
        }
        add(cached('shoeB', () => new RoundedBoxGeometry(0.09, 0.06, 0.24, 2, 0.025).translate(0, 0.03, 0.04)), this.mats.dark, s * 0.085, 0, 0);
      }
      if (style === 'coat') add(cached('cravat', () => new RoundedBoxGeometry(0.07, 0.1, 0.03, 2, 0.012)), this.mats.white, 0, 1.43, 0.165);
      else add(cached('lapels', () => mergeGeometries([
        ribbon(Array.from({ length: 10 }, (_, i) => onSurface(JACKET, lerp(0.55, 0.12, i / 9), lerp(1.48, 1.1, i / 9), 0.004)), 0.05),
        ribbon(Array.from({ length: 10 }, (_, i) => onSurface(JACKET, lerp(-0.55, -0.12, i / 9), lerp(1.48, 1.1, i / 9), 0.004)), 0.05),
      ])), this.mats.robe);
    }

    // 头
    const P = face || { jaw: 0.74 + rnd() * 0.14, nose: 0.8 + rnd() * 0.45, cheek: 0.8 + rnd() * 0.4, brow: 0.8 + rnd() * 0.4, lips: 0.8 + rnd() * 0.3, chin: 0.8 + rnd() * 0.4, age: rnd() * 0.7, stubble: rnd() * 0.3 };
    const head = buildHead({ skin, hair, iris, style: HAT[hat] || 'bun', beard: BEARD[String(beard)] || 'none', face: P, seed: seed % 7 });
    this.headG = head.group; this.headG.position.set(0, 1.64, 0.01);
    this.headG.rotation.order = 'YXZ';
    this.pivot.add(this.headG);
    this.mats.skin = head.mats.skin; this.mats.skinPlain = head.mats.skinPlain; this.mats.hair = head.mats.hair;
    if (hat === 'crown') { // 周文王的冠
      const cr = new THREE.Group(); cr.position.set(0, 0.125, -0.01); this.headG.add(cr);
      const gm = new THREE.MeshStandardMaterial({ color: '#1e1610', roughness: 0.4, metalness: 0.3 });
      add(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 16), gm, 0, 0, 0, cr);
      add(new THREE.BoxGeometry(0.03, 0.12, 0.16), gm, 0, 0.07, 0, cr);
      const pin = add(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6), new THREE.MeshStandardMaterial({ color: '#c8b080', roughness: 0.3 }), 0, 0.02, 0, cr);
      pin.rotation.z = Math.PI / 2;
    }

    // 手臂、手、袖子
    const narrow = style !== 'robe';
    const arm = (side) => {
      const a = new THREE.Group(); a.position.set(side * 0.228, 1.39, 0); this.pivot.add(a);
      add(cached('innerArm', () => new THREE.CylinderGeometry(0.045, 0.036, 0.56, 10).translate(0, -0.28, 0)), narrow ? this.mats.robe : this.mats.inner, 0, 0, 0, a);
      add(cached('cuff' + narrow, () => new THREE.CylinderGeometry(narrow ? 0.058 : 0.042, narrow ? 0.062 : 0.042, narrow ? 0.07 : 0.04, 12)), narrow ? this.mats.white : this.mats.trim, 0, -0.55, 0, a);
      const h = add(handGeometry('relaxed', side), this.mats.skinPlain, 0, -0.575, 0.0, a);
      h.rotation.y = -side * Math.PI / 2;
      a.rotation.z = side * 0.1;
      const cap = add(cached('shoulderCap', () => new THREE.SphereGeometry(0.085, 16, 12).scale(1.1, 0.85, 1)), this.mats.robe, side * 0.215, 1.375, 0);
      if (narrow) cap.scale.setScalar(0.82);
      void cap;
      const sl = new Sleeve(this.mats.robe, narrow ? { r0: 0.064, r1: 0.07, sag: 0, len: 0.6, s0: 0.02, s1: 0.9 } : { r0: 0.072, r1: 0.165, sag: 0.17, len: 0.6 });
      this.pivot.add(sl.mesh);
      a.userData.sleeve = sl;
      return a;
    };
    this.armL = arm(1); this.armR = arm(-1);
    this.root.scale.setScalar(scale);
    this.phase = rnd() * 10;
    this.gesture = 0;
    this.near = true;
    this._base = {};
    for (const k in this.mats) this._base[k] = this.mats[k].color.clone();
    this._q = new THREE.Quaternion(); this._down = new THREE.Vector3();
    this._updateSleeves(0, true);
  }

  setTint(target, k) { // 把全身颜色向目标色插值（脱水、烧焦、冻结）
    for (const key of ['robe', 'inner', 'skin', 'skinPlain', 'hair', 'trim']) this.mats[key].color.copy(this._base[key]).lerp(target, k);
  }

  _updateSleeves(t, force = false) {
    if (!force && !this.near) return;
    this.pivot.updateWorldMatrix(true, false);
    this.pivot.getWorldQuaternion(this._q).invert();
    this._down.set(0, -1, 0).applyQuaternion(this._q);
    for (const a of [this.armL, this.armR]) a.userData.sleeve.update(a.position, a.quaternion, t, this._down, a.position.x);
  }

  animate(dt, moving, speed = 1.2) {
    if (moving) this.phase += dt * speed * 4.2;
    const s = moving ? Math.sin(this.phase) : 0;
    const k = moving ? 1 : 0;
    this.idleT = (this.idleT || 0) + dt;
    this.armL.rotation.x = lerp(this.armL.rotation.x, s * 0.5 * k - this.gesture * 1.1, Math.min(1, dt * 8));
    this.armR.rotation.x = lerp(this.armR.rotation.x, -s * 0.5 * k, Math.min(1, dt * 8));
    this.armL.rotation.z = lerp(this.armL.rotation.z, 0.1 + this.gesture * 0.25, Math.min(1, dt * 6));
    this.pivot.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.03 : 0;
    this.robe.rotation.z = s * 0.025;
    if (!moving) this.headG.rotation.y = Math.sin(this.idleT * 0.4 + this.phase) * 0.18;
    this.headG.rotation.x = Math.sin(this.idleT * 0.31 + this.phase) * 0.04;
    this._updateSleeves(this.idleT);
  }
}

/* ---------------- 脱水后的纤维卷（可卷起的皮） ---------------- */
const SHEET_L = 1.8, SHEET_W = 0.8, R0 = 0.085, K = 0.012 / (Math.PI * 2);
export function makeSheetGeometry() {
  const geo = new THREE.PlaneGeometry(SHEET_W, SHEET_L, 6, 64);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -SHEET_L / 2); // 头在 z=-L，脚在 z=0
  geo.userData.base = Float32Array.from(geo.attributes.position.array);
  return geo;
}
export function applyRoll(geo, p) {
  const base = geo.userData.base, pos = geo.attributes.position.array;
  const sc = p * SHEET_L, zc = sc - SHEET_L;
  for (let i = 0; i < pos.length; i += 3) {
    const x = base[i], z = base[i + 2];
    const s = z + SHEET_L;
    let y = 0.004, zz = z;
    if (s < sc) {
      const a = sc - s;
      const disc = Math.max(0, R0 * R0 - 2 * K * a);
      const th = (R0 - Math.sqrt(disc)) / K;
      const r = R0 - K * th;
      y = R0 - r * Math.cos(th) + 0.004;
      zz = zc - r * Math.sin(th);
    }
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = zz;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}
let _scrollGeo = null;
export function scrollGeometry() { // 完全卷好的静态卷轴（用于干仓里的存货）
  if (_scrollGeo) return _scrollGeo;
  _scrollGeo = makeSheetGeometry(); applyRoll(_scrollGeo, 1);
  return _scrollGeo;
}
export function sheetMaterial() {
  return new THREE.MeshStandardMaterial({ map: sheetTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
}

const LEATHER = new THREE.Color('#5e3d24');
const CHAR = new THREE.Color('#0d0806');
const ICE = new THREE.Color('#a9c6e0');

/* 三体人：可脱水、浸泡复苏、被烤焦或冻死 */
export class Trisolaran extends Humanoid {
  constructor(o) {
    super(o);
    this.sheetGeo = makeSheetGeometry();
    this.sheetMat = sheetMaterial();
    this.sheet = new THREE.Mesh(this.sheetGeo, this.sheetMat);
    this.sheet.castShadow = true; this.sheet.receiveShadow = true;
    this.sheet.visible = false;
    this.root.add(this.sheet);
    this.state = 'alive';  // alive | dehydrating | scroll | rehydrating | dead
    this.dry = 0;          // 0 活体 → 1 完全卷起
    this.burn = 0; this.freeze = 0;
    this.charred = 0;      // 卷轴被烤焦程度
    this.name = o.name || '';
  }

  setDry(p) {
    this.dry = p;
    const pv = this.pivot;
    if (p <= 0) {
      pv.visible = true; this.sheet.visible = false;
      pv.rotation.set(0, 0, 0); pv.scale.set(1, 1, 1); pv.position.set(0, 0, 0);
      this.setTint(LEATHER, 0);
      return;
    }
    // 阶段一：颤抖、失去水分
    const a = clamp(p / 0.3, 0, 1);
    // 阶段二：后仰倒地、被压扁
    const b = easeInOut(clamp((p - 0.3) / 0.27, 0, 1));
    // 阶段三：卷起
    const c = clamp((p - 0.62) / 0.38, 0, 1);
    this.setTint(LEATHER, Math.min(1, a * 0.7 + b * 0.3));
    const thin = lerp(1, 0.8, a);
    pv.scale.set(thin, lerp(1, 0.97, b), lerp(thin, 0.1, b));
    pv.rotation.x = -Math.PI / 2 * b;
    pv.position.set(p < 0.3 ? (Math.random() - 0.5) * 0.03 * a : 0, 0.04 * b, 0);
    const showSheet = p >= 0.58;
    pv.visible = !showSheet;
    this.sheet.visible = showSheet;
    if (showSheet) applyRoll(this.sheetGeo, easeInOut(c));
  }

  setCharred(k) {
    this.charred = k;
    this.sheetMat.color.setRGB(1, 1, 1).lerp(CHAR, k);
  }
  setBurn(k) {
    this.burn = k;
    this.setTint(CHAR, k);
    const e = k * (0.6 + Math.random() * 0.4);
    for (const key of ['robe', 'skin']) { this.mats[key].emissive.setRGB(1, 0.25, 0.02).multiplyScalar(e * (1 - smoothstep(0.7, 1, k)) * 1.5); }
    this.pivot.scale.y = lerp(1, 0.55, smoothstep(0.6, 1, k));
    this.pivot.rotation.x = lerp(0, 0.25, smoothstep(0.5, 1, k));
  }
  setFreeze(k) {
    this.freeze = k;
    this.setTint(ICE, k * 0.85);
    for (const key of ['robe', 'skin']) this.mats[key].roughness = lerp(0.9, 0.25, k);
  }
}
