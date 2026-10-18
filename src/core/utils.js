import * as THREE from 'three';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeIn = t => t * t * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(i, j) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm2(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

/* ---------- 调度器：可被场景切换整体清空的 wait / tween ---------- */
export const Sched = {
  tasks: [],
  gen: 0,
  update(dt) {
    const list = this.tasks;
    this.tasks = [];
    for (const t of list) {
      if (t.gen !== this.gen) continue;
      let done = true;
      try { done = t.step(dt); } catch (e) { console.error(e); }
      if (done) t.resolve(); else this.tasks.push(t);
    }
  },
  clear() { this.gen++; this.tasks = []; },
  add(step) {
    return new Promise(resolve => this.tasks.push({ step, resolve, gen: this.gen }));
  },
};
export function wait(sec) {
  let t = 0;
  return Sched.add(dt => (t += dt) >= sec);
}
export function waitUntil(fn) { return Sched.add(() => fn()); }
export function tween(dur, fn, ease = easeInOut) {
  let t = 0;
  fn(ease(0));
  return Sched.add(dt => {
    t += dt;
    const k = Math.max(0, Math.min(1, t / dur));
    fn(ease(k));
    return k >= 1;
  });
}

/* ---------- 画布纹理 ---------- */
export function canvasTex(w, h, draw, { srgb = true, repeat = null, nearest = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  if (nearest) { tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; }
  tex.anisotropy = 4;
  return tex;
}

export function speckle(g, w, h, n, colors, rmin = 0.5, rmax = 2, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = Math.random() * alpha;
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rand(rmin, rmax);
    g.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
  g.globalAlpha = 1;
}

/* BoxGeometry 按真实尺寸缩放 UV，使纹理密度一致 */
export function boxUV(w, h, d, unit = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / unit, uv.getY(k) * dims[f][1] / unit);
    }
  }
  return g;
}

/* 共享的 GLSL 噪声函数 */
export const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.02 + 17.1; a *= .5; } return s; }
`;

export function setShadow(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      }
    }
  });
}
