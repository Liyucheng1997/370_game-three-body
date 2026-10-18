import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, clamp, lerp, smoothstep, mulberry32 } from '../core/utils.js';

/*
 * 解剖模块：程序化雕刻的头部（眼窝、眉弓、鼻梁、颧骨、嘴唇、下巴）、
 * 带虹膜的眼球与眼睑、沿发际线生成的头发、一根根的胡须与眉毛、带指节的手、
 * 带自然褶皱的袍服、随重力下垂的广袖、贴合身体的衣领飘带。
 */

const G2 = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);

const FACE_DEFAULT = { w: 0.74, h: 1, d: 0.9, jaw: 0.8, brow: 1, cheek: 1, nose: 1, lips: 1, chin: 1, stubble: 0, age: 0 };
export const HEAD_SCALE = 0.112;   // 单位球 → 米

/* 单位球面上的点 → 雕刻后的头部表面点 */
export function faceDeform(x, y, z, P = FACE_DEFAULT) {
  let X = x, Y = y, Z = z;
  X *= lerp(1, P.jaw, smoothstep(0.05, -0.95, y));                  // 下颌收窄
  if (z < 0) Z *= lerp(1, 0.74, smoothstep(-0.15, -0.95, y));       // 后脑下方收向脖颈
  if (z < 0 && y > -0.1) Z *= 1.07;                                   // 后脑饱满
  if (z > 0) Z *= lerp(1, 0.9, smoothstep(0.3, 0.9, z) * smoothstep(-0.3, 0.6, y)); // 额面略平
  X *= lerp(1, 0.93, smoothstep(0.55, 1, y));                         // 头顶收圆
  if (z > 0.05) {
    const w = smoothstep(0.05, 0.5, z);
    let d = 0;
    for (const s of [-1, 1]) {
      d -= 0.11 * G2(x - s * 0.32, y - 0.12, 0.13, 0.085);            // 眼窝
      d += 0.06 * G2(x - s * 0.3, y - 0.28, 0.2, 0.05) * P.brow;      // 眉弓
      d += 0.055 * G2(x - s * 0.5, y + 0.02, 0.13, 0.1) * P.cheek;    // 颧骨
      d -= 0.035 * G2(x - s * 0.43, y + 0.36, 0.13, 0.14);            // 面颊凹陷
      d += 0.035 * G2(x - s * 0.105, y + 0.32, 0.055, 0.045) * P.nose; // 鼻翼
      d -= 0.02 * G2(x - s * 0.205, y + 0.505, 0.035, 0.035);         // 嘴角
      d -= 0.016 * G2(x - s * 0.24, y + 0.36, 0.03, 0.11) * (0.6 + P.age); // 法令纹
      d -= 0.012 * G2(x - s * 0.45, y + 0.05, 0.05, 0.02) * P.age;    // 眼袋
    }
    const nb = G2(x, 0, 0.062, 1) * smoothstep(0.2, 0.05, y) * smoothstep(-0.36, -0.22, y);
    d += nb * (0.035 + 0.16 * smoothstep(0.15, -0.27, y)) * P.nose;   // 鼻梁
    d += 0.06 * G2(x, y + 0.29, 0.072, 0.058) * P.nose;               // 鼻尖
    d -= 0.02 * G2(x, y + 0.355, 0.07, 0.02);                         // 鼻底
    d += 0.02 * G2(x, y - 0.2, 0.08, 0.06);                           // 眉心
    d -= 0.012 * G2(x, y - 0.42, 0.25, 0.03) * P.age;                 // 抬头纹
    d += 0.045 * G2(x, y + 0.455, 0.17, 0.034) * P.lips;              // 上唇
    d += 0.05 * G2(x, y + 0.56, 0.14, 0.04) * P.lips;                 // 下唇
    d -= 0.032 * G2(x, y + 0.505, 0.2, 0.011);                        // 唇缝
    d -= 0.016 * G2(x, y + 0.4, 0.032, 0.04);                         // 人中
    d += 0.075 * G2(x, y + 0.79, 0.2, 0.12) * P.chin;                 // 下巴
    d -= 0.02 * G2(x, y + 0.66, 0.15, 0.035);                         // 颏唇沟
    Z += d * w;
  }
  return [X * P.w, Y * P.h, Z * P.d];
}
function surfacePoint(x, y, P, out = 0) { // 面部正面 (x,y) 处的表面点（单位坐标）
  const z = Math.sqrt(Math.max(0.0001, 1 - x * x - y * y));
  const [a, b, c] = faceDeform(x, y, z, P);
  const n = V(a, b, c).normalize();
  return V(a, b, c).addScaledVector(n, out);
}

/* ---------------- 纹理 ---------------- */
const eyeCache = new Map();
function eyeTexture(iris = '#3a2414') {
  if (eyeCache.has(iris)) return eyeCache.get(iris);
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e9e2d6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,60,50,.25)'; g.lineWidth = 0.8;
    for (let i = 0; i < 30; i++) { const a = Math.random() * 7; g.beginPath(); g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 45); g.stroke(); }
    const cx = 64, cy = 64, r = 17;
    const gr = g.createRadialGradient(cx, cy, 3, cx, cy, r);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.35, iris); gr.addColorStop(0.85, iris); gr.addColorStop(1, '#0a0604');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r, r, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,230,190,.25)';
    for (let i = 0; i < 40; i++) { const a = i / 40 * 7; g.beginPath(); g.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); g.stroke(); }
    g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, 6.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(cx - 4, cy - 5, 2.5, 0, 7); g.fill();
  });
  eyeCache.set(iris, t);
  return t;
}
let _hairTex = null;
export function hairTexture() {
  if (_hairTex) return _hairTex;
  _hairTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, l = 20 + Math.random() * 60, v = 90 + Math.random() * 120 | 0;
      g.strokeStyle = `rgba(${v},${v},${v},.5)`; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, Math.random() * h); g.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * h + l); g.stroke();
    }
  }, { srgb: false, repeat: [3, 2] });
  return _hairTex;
}

/* 头发材质：按发际线遮罩逐像素裁切，边缘平滑 */
export function hairMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, bumpMap: hairTexture(), bumpScale: 0.6, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMask; varying float vMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMask;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vMask < 0.0) discard;');
  };
  m.customProgramCacheKey = () => 'hairMask';
  return m;
}

/* ---------------- 头部 ---------------- */
const headCache = new Map();
function addColor(geo, rgb) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function strand(start, dir, len, r, segs = 4) {
  const g = new THREE.ConeGeometry(r, len, segs, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(start.x, start.y, start.z);
  g.deleteAttribute('uv');
  return g;
}

function buildHeadGeometries(style, beard, P, seed) {
  const key = JSON.stringify([style, beard, P, seed]);
  if (headCache.has(key)) return headCache.get(key);
  const rnd = mulberry32(seed);
  // 皮肤
  const sph = new THREE.SphereGeometry(1, 96, 72);
  const pos = sph.attributes.position;
  const base = Float32Array.from(pos.array);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    const [a, b, c] = faceDeform(x, y, z, P);
    pos.setXYZ(i, a, b, c);
    let r = 1, gg = 1, bb = 1;
    if (z > 0) {
      const lip = G2(x, y + 0.505, 0.18, 0.07) * smoothstep(0.3, 0.7, z);
      r = lerp(r, 1.08, lip); gg = lerp(gg, 0.66, lip); bb = lerp(bb, 0.66, lip);
      for (const s of [-1, 1]) {
        const ch = G2(x - s * 0.45, y + 0.15, 0.16, 0.14);
        r = lerp(r, 1.04, ch * 0.6); gg = lerp(gg, 0.86, ch * 0.6); bb = lerp(bb, 0.84, ch * 0.6);
        const so = G2(x - s * 0.32, y - 0.1, 0.17, 0.12);
        r *= 1 - so * 0.22; gg *= 1 - so * 0.26; bb *= 1 - so * 0.2;
      }
      const ns = G2(x, y + 0.3, 0.07, 0.06);
      r = lerp(r, 1.05, ns * 0.4); gg = lerp(gg, 0.9, ns * 0.4);
    }
    if (P.stubble > 0) { // 胡茬青色
      const st = smoothstep(-0.25, -0.5, y) * smoothstep(-0.4, 0.2, z) * P.stubble;
      r = lerp(r, 0.7, st); gg = lerp(gg, 0.68, st); bb = lerp(bb, 0.7, st);
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
  }
  sph.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sph.computeVertexNormals();
  const skinParts = [sph];
  // 耳朵
  for (const s of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.2, 16, 12);
    ear.scale(0.38, 1, 0.62);
    const helix = new THREE.TorusGeometry(0.17, 0.045, 6, 18, Math.PI * 1.6);
    helix.rotateZ(-0.6); helix.rotateY(Math.PI / 2); helix.scale(1, 1.05, 0.62);
    const e = mergeGeometries([ear, helix].map(g => { g.deleteAttribute('uv'); return g; }));
    e.rotateY(s * -0.35);
    e.translate(s * 0.73 * P.w / 0.74, 0.02, -0.06);
    addColor(e, [0.95, 0.82, 0.8]);
    skinParts.push(e);
  }
  // 脖颈
  const neck = new THREE.CylinderGeometry(0.47, 0.56, 1.0, 20, 1, true);
  neck.translate(0, -1.05, -0.1); neck.deleteAttribute('uv');
  addColor(neck, [0.92, 0.9, 0.9]);
  skinParts.push(neck);
  for (const g of skinParts) if (g.attributes.uv) g.deleteAttribute('uv');
  const skin = mergeGeometries(skinParts);

  // 头发：沿发际线截取头部表面并外扩
  const hairParts = [];
  const hairlineFront = style === 'short' ? 0.58 : style === 'cap' ? 0.4 : 0.46;
  const hairY = (x, z) => (z > 0 ? lerp(0.12, hairlineFront, z) : lerp(0.12, style === 'short' ? -0.45 : -0.58, -z));
  if (style !== 'bald') {
    const hp = [], hi = [], keep = [], hm = [];
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      // 鬓角在耳前向下延伸，耳朵上方留出弧形
      const earCut = Math.abs(x) > 0.55 && z > -0.5 ? 0.22 * G2(z + 0.05, y + 0.02, 0.32, 0.2) : 0;
      const m = (y - hairY(x, z)) - earCut;
      keep.push(m > -0.06);
      hm.push(m * 6);
      const nx = pos.getX(i), ny = pos.getY(i), nz = pos.getZ(i);
      const n = V(nx, ny, nz).normalize();
      const inflate = (style === 'wig' ? 0.07 : 0.035) * smoothstep(-0.02, 0.25, m) + 0.01 + (style === 'bun' && y > 0.5 ? 0.015 : 0);
      hp.push(nx + n.x * inflate, ny + n.y * inflate, nz + n.z * inflate);
    }
    const idx = sph.index.array;
    for (let i = 0; i < idx.length; i += 3) if (keep[idx[i]] || keep[idx[i + 1]] || keep[idx[i + 2]]) hi.push(idx[i], idx[i + 1], idx[i + 2]);
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    cap.setAttribute('aMask', new THREE.Float32BufferAttribute(hm, 1));
    cap.setIndex(hi);
    cap.computeVertexNormals();
    hairParts.push(cap);
  }
  if (style === 'bun') {
    const bun = new THREE.SphereGeometry(0.26, 16, 12); bun.scale(1, 0.85, 1); bun.translate(0, 1.05, -0.12);
    const band = new THREE.TorusGeometry(0.2, 0.05, 6, 16); band.rotateX(Math.PI / 2); band.translate(0, 0.9, -0.12);
    hairParts.push(bun, band);
  }
  if (style === 'sidebun') { // 秦俑偏髻
    const bun = new THREE.SphereGeometry(0.24, 14, 10); bun.scale(1, 0.8, 1.1); bun.translate(0.38, 0.92, -0.05);
    const plait = new THREE.TorusGeometry(0.5, 0.06, 6, 20, Math.PI * 0.9); plait.rotateY(Math.PI / 2); plait.translate(0, 0.25, -0.35);
    hairParts.push(bun, plait);
  }
  if (style === 'wig') { // 牛顿的卷发假发
    // 一卷卷螺旋状的发卷
    for (let i = 0; i < 46; i++) {
      const s = i % 2 ? 1 : -1;
      const t = rnd();
      const y = lerp(0.25, -1.5, t), z = lerp(0.1, -0.7, rnd()) - t * 0.15;
      const x = s * (0.7 + rnd() * 0.12 + t * 0.14);
      const curl = new THREE.TorusGeometry(0.075, 0.045, 6, 12);
      curl.rotateY(Math.PI / 2 + rnd() * 0.5); curl.rotateZ(rnd() * 0.6);
      curl.scale(1, 1.4, 1); curl.translate(x, y, z);
      hairParts.push(curl);
    }
    for (let i = 0; i < 30; i++) {
      const a = (rnd() - 0.5) * 2.2; const curl = new THREE.TorusGeometry(0.075, 0.045, 6, 12);
      curl.scale(1, 1.4, 1); curl.translate(Math.sin(a) * 0.62, -0.35 - rnd() * 1.15, -0.72 - Math.cos(a) * 0.12); hairParts.push(curl);
    }
  }
  // 眉毛：一簇簇细毛
  for (const s of [-1, 1]) {
    for (let k = 0; k < 18; k++) {
      const t = k / 17;
      const x = s * lerp(0.1, 0.5, t);
      const y = 0.27 + Math.sin(t * Math.PI) * 0.05 - (P.browAngle || 0) * (1 - t) * 0.08;
      const p = surfacePoint(x, y, P, 0.015);
      const dir = V(s * 1, 0.25 + (P.browAngle || 0) * 0.4 * (1 - t), 0.25).normalize();
      hairParts.push(strand(p, dir, 0.11, 0.02 + (P.browThick || 0) * 0.012, 3));
    }
  }
  // 胡须
  const addStrands = (n, region, len, r, lean) => {
    for (let i = 0; i < n; i++) {
      const [x, y] = region(rnd());
      const p = surfacePoint(x, y, P, -0.01);
      const dir = V(x * lean[0] + (rnd() - 0.5) * 0.15, -1, lean[1] + (rnd() - 0.5) * 0.15);
      hairParts.push(strand(p, dir, len * (0.7 + rnd() * 0.5), r * (0.8 + rnd() * 0.4), 4));
    }
  };
  if (beard === 'mustache' || beard === 'long' || beard === 'goatee' || beard === 'full') {
    for (const s of [-1, 1]) for (let k = 0; k < 30; k++) {
      const t = k / 29;
      const p = surfacePoint(s * lerp(0.02, 0.2, t), -0.415 - t * 0.05 + (rnd() - 0.5) * 0.02, P, 0.004);
      const dir = V(s * lerp(0.2, 0.55, t), -1, lerp(0.35, 0.05, t));
      hairParts.push(strand(p, dir, lerp(0.12, 0.34, t) * (0.85 + rnd() * 0.3), 0.014, 3));
    }
  }
  if (beard === 'goatee') addStrands(40, u => [(u - 0.5) * 0.3, -0.72 - Math.random() * 0.12], 0.32, 0.03, [0.2, 0.25]);
  if (beard === 'long') {
    addStrands(110, u => [(u - 0.5) * 0.42, -0.66 - Math.random() * 0.16], 0.95, 0.035, [0.15, 0.32]);
    addStrands(60, u => { const s = u < 0.5 ? -1 : 1; return [s * (0.38 + Math.random() * 0.22), -0.35 - Math.random() * 0.35]; }, 0.4, 0.028, [0.3, 0.2]);
  }
  if (beard === 'full') addStrands(90, u => [(u - 0.5) * 1.1, -0.5 - Math.random() * 0.3], 0.3, 0.03, [0.3, 0.25]);

  const hair = hairParts.length ? mergeGeometries(hairParts.map(g => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.aMask) g.setAttribute('aMask', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(1), 1));
    return g.index ? g.toNonIndexed() : g;
  })) : null;
  if (hair) hair.computeVertexNormals();

  // 眼睛位置
  const eyeZ = faceDeform(0.32, 0.12, Math.sqrt(1 - 0.32 * 0.32 - 0.12 * 0.12), P)[2];
  const res = { skin, hair, eye: { x: 0.32 * P.w, y: 0.12 * P.h, z: eyeZ - 0.095, r: 0.125 } };
  headCache.set(key, res);
  return res;
}

/**
 * 构建一颗头：返回 { group, mats }
 * group 原点在头部中心，单位：米
 */
export function buildHead({ skin = '#c99a74', hair = '#15100c', iris = '#3a2414', style = 'bun', beard = 'none', face = {}, glow = 0, seed = 1 } = {}) {
  const P = { ...FACE_DEFAULT, ...face };
  const geo = buildHeadGeometries(style, beard, P, seed);
  const group = new THREE.Group();
  const inner = new THREE.Group(); inner.scale.setScalar(HEAD_SCALE); group.add(inner);
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: skin, vertexColors: true, roughness: 0.62 }),
    skinPlain: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }),
    hair: hairMaterial(hair),
    eye: new THREE.MeshStandardMaterial({ map: eyeTexture(iris), roughness: 0.15, emissive: glow ? new THREE.Color('#ffae3a') : new THREE.Color(0), emissiveMap: glow ? eyeTexture(iris) : null, emissiveIntensity: glow }),
  };
  const sk = new THREE.Mesh(geo.skin, mats.skin); sk.castShadow = true; inner.add(sk);
  if (geo.hair) { const h = new THREE.Mesh(geo.hair, mats.hair); h.castShadow = false; h.receiveShadow = true; inner.add(h); }
  const e = geo.eye;
  const eyeGeo = new THREE.SphereGeometry(e.r, 20, 14);
  const lidGeoU = new THREE.SphereGeometry(e.r * 1.08, 18, 8, 0, Math.PI, 0, Math.PI * 0.43);
  const lidGeoL = new THREE.SphereGeometry(e.r * 1.06, 18, 6, 0, Math.PI, Math.PI * 0.62, Math.PI * 0.38);
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * e.x, e.y, e.z); inner.add(eg);
    const ball = new THREE.Mesh(eyeGeo, mats.eye); ball.rotation.y = -s * 0.08; eg.add(ball);
    const lu = new THREE.Mesh(lidGeoU, mats.skinPlain); lu.rotation.x = 0.12; eg.add(lu);
    const ll = new THREE.Mesh(lidGeoL, mats.skinPlain); eg.add(ll);
  }
  return { group, mats, P };
}

/* ---------------- 手 ---------------- */
const handCache = new Map();
const CURL = { relaxed: [0.25, 0.35, 0.25], grip: [1.25, 1.55, 1.15], open: [0.05, 0.08, 0.05], fist: [1.5, 1.7, 1.3] };
export function handGeometry(pose = 'relaxed', side = 1) {
  const key = pose + side;
  if (handCache.has(key)) return handCache.get(key);
  const parts = [];
  const palm = new RoundedBoxGeometry(0.078, 0.088, 0.03, 2, 0.012);
  palm.translate(0, -0.046, 0);
  parts.push(palm);
  const curl = CURL[pose] || CURL.relaxed;
  const xs = [-0.028, -0.0095, 0.0095, 0.028], lens = [0.062, 0.074, 0.07, 0.054], rs = [0.0088, 0.0092, 0.009, 0.0078];
  for (let f = 0; f < 4; f++) {
    let cur = V(xs[f] * side, -0.088, 0), ang = 0;
    const segs = [0.46, 0.31, 0.23];
    for (let k = 0; k < 3; k++) {
      ang += curl[k] * (1 + (f - 1.5) * 0.04);
      const d = V(0, -Math.cos(ang), Math.sin(ang));
      const L = lens[f] * segs[k];
      const c = new THREE.CapsuleGeometry(rs[f] * (1 - k * 0.1), L, 3, 8);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
      const mid = cur.clone().addScaledVector(d, L / 2);
      c.translate(mid.x, mid.y, mid.z);
      parts.push(c);
      cur.addScaledVector(d, L);
    }
  }
  // 拇指
  let cur = V(side * 0.036, -0.022, 0.01);
  let d = V(side * 0.55, -0.62, 0.55).normalize();
  for (let k = 0; k < 2; k++) {
    const L = k ? 0.026 : 0.034;
    if (pose === 'grip' || pose === 'fist') d.lerp(V(-side * 0.5, -0.6, 0.6), 0.5).normalize();
    const c = new THREE.CapsuleGeometry(0.0105 - k * 0.001, L, 3, 8);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
    const mid = cur.clone().addScaledVector(d, L / 2);
    c.translate(mid.x, mid.y, mid.z);
    parts.push(c);
    cur.addScaledVector(d, L);
  }
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  g.computeVertexNormals();
  handCache.set(key, g);
  return g;
}

/* ---------------- 带褶皱的旋转体（袍服） ---------------- */
export function foldedLathe(profile, { segs = 48, folds = 10, amp = t => 0.04 * t * t, seed = 0, zScale = 0.8 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const p = g.attributes.position;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  const f2 = folds * 2 + 1, f3 = Math.max(1, Math.floor(folds / 2));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const t = 1 - (y - y0) / (y1 - y0 || 1);
    const k = 1 + amp(t) * (Math.sin(a * folds + seed) * 0.6 + Math.sin(a * f2 + seed * 2.1) * 0.25 + Math.sin(a * f3 + seed * 0.7) * 0.25);
    p.setXYZ(i, x * k, y, z * k * zScale);
  }
  g.rotateY(Math.PI);
  g.computeVertexNormals();
  return g;
}
export function profileRadius(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return lerp(r0, r1, (y - y0) / (y1 - y0 || 1));
  }
  return profile[profile.length - 1][0];
}

/* ---------------- 贴合曲面的飘带（交领、绶带、腰带垂绦） ---------------- */
export function ribbon(points, width, { outward = null, twist = 0 } = {}) {
  const n = points.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = (i < n - 1 ? points[i + 1].clone().sub(p) : p.clone().sub(points[i - 1])).normalize();
    const o = outward ? outward(p, i / (n - 1)) : V(p.x, 0, p.z).normalize();
    const side = new THREE.Vector3().crossVectors(o, t).normalize();
    if (twist) side.applyAxisAngle(t, twist * i / (n - 1));
    const w = typeof width === 'function' ? width(i / (n - 1)) : width;
    const a = p.clone().addScaledVector(side, w / 2), b = p.clone().addScaledVector(side, -w / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uv.push(0, i / (n - 1), 1, i / (n - 1));
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- 广袖：随手臂姿态与重力实时变形 ---------------- */
export class Sleeve {
  constructor(material, { NS = 11, NR = 14, r0 = 0.075, r1 = 0.2, sag = 0.3, len = 0.6, s0 = 0.06, s1 = 0.93, floor = 0.03 } = {}) {
    Object.assign(this, { NS, NR, r0, r1, sag, len, s0, s1, floor });
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(NS * (NR + 1) * 3), uv = new Float32Array(NS * (NR + 1) * 2), idx = [];
    for (let i = 0; i < NS; i++) for (let r = 0; r <= NR; r++) {
      uv[(i * (NR + 1) + r) * 2] = r / NR; uv[(i * (NR + 1) + r) * 2 + 1] = 1 - i / (NS - 1);
      if (i < NS - 1 && r < NR) { const a = i * (NR + 1) + r, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this._v = [V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)];
  }
  update(S, q, t = 0, down = DOWN, phase = 0) {
    const { NS, NR } = this;
    const pos = this.mesh.geometry.attributes.position.array;
    const [dir, sv, wv, A, off] = this._v;
    dir.set(0, -1, 0).applyQuaternion(q);
    sv.crossVectors(dir, down); if (sv.lengthSq() < 1e-4) sv.set(1, 0, 0); sv.normalize();
    wv.crossVectors(dir, sv).normalize();
    const upness = Math.max(0, -dir.dot(down));
    for (let i = 0; i < NS; i++) {
      const f = i / (NS - 1);
      const s = lerp(this.s0, this.s1, f) * (1 - upness * 0.45);
      A.copy(S).addScaledVector(dir, s * this.len);
      const r = lerp(this.r0, this.r1, Math.pow(f, 1.25));
      const sag = this.sag * Math.pow(f, 1.6) * (1 - upness * 0.6);
      for (let k = 0; k <= NR; k++) {
        const a = (k / NR) * Math.PI * 2;
        off.copy(sv).multiplyScalar(Math.cos(a) * r).addScaledVector(wv, Math.sin(a) * r);
        const low = Math.max(0, off.dot(down) / r);
        const fold = 1 + Math.sin(a * 5 + f * 2) * 0.05 * f;
        const o = (i * (NR + 1) + k) * 3;
        pos[o] = A.x + off.x * fold + down.x * sag * low * low + Math.sin(t * 1.3 + f * 3 + phase) * 0.01 * f;
        pos[o + 1] = Math.max(this.floor, A.y + off.y * fold + down.y * sag * low * low);
        pos[o + 2] = A.z + off.z * fold + down.z * sag * low * low + Math.sin(t * 1.7 + f * 2 + phase) * 0.008 * f;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
}
