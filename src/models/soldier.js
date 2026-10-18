import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, speckle, lerp } from '../core/utils.js';
import { buildHead, handGeometry, foldedLathe } from './anatomy.js';

/* 甲片纹理（同时作为凹凸贴图，使每一片甲叶都有起伏） */
let _armor = null;
function armorTex() {
  if (_armor) return _armor;
  const draw = (g, w, h, bump) => {
    g.fillStyle = bump ? '#202020' : '#241a14'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 14; c++) {
      const x = c * 19 + (r % 2) * 9.5, y = r * 22;
      if (bump) {
        const gr = g.createLinearGradient(x, y, x, y + 20);
        gr.addColorStop(0, '#d0d0d0'); gr.addColorStop(1, '#606060');
        g.fillStyle = gr; g.fillRect(x + 1, y + 1, 17, 20);
      } else {
        const l = 50 + Math.random() * 22;
        g.fillStyle = `rgb(${l + 10},${l * 0.78 | 0},${l * 0.58 | 0})`; g.fillRect(x + 1, y + 1, 17, 20);
        g.fillStyle = '#b89048'; g.beginPath(); g.arc(x + 9.5, y + 5, 1.6, 0, 7); g.arc(x + 9.5, y + 16, 1.6, 0, 7); g.fill();
      }
    }
    if (!bump) speckle(g, w, h, 1500, ['#000', '#806040'], 0.5, 1.5, 0.3);
  };
  const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false), { repeat: [2, 1] });
  const bump = canvasTex(256, 256, (g, w, h) => draw(g, w, h, true), { srgb: false, repeat: [2, 1] });
  _armor = { map, bump };
  return _armor;
}
let _wrap = null;
function wrapTex() {
  if (_wrap) return _wrap;
  _wrap = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#4a4038'; g.fillRect(0, 0, w, h);
    for (let y = -20; y < h + 20; y += 9) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 14); g.lineTo(w, y + 16); g.lineTo(0, y + 2); g.fill(); }
  }, { repeat: [2, 1] });
  return _wrap;
}

/* 逻辑门演示用的秦军士兵：一手白旗、一手黑旗。黑旗=1，白旗=0 */
export class FlagSoldier {
  constructor(seed = 1) {
    this.root = new THREE.Group();
    const A = armorTex();
    const M = {
      armor: new THREE.MeshStandardMaterial({ map: A.map, bumpMap: A.bump, bumpScale: 2.2, roughness: 0.55, metalness: 0.25 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#7a2c1a', roughness: 0.9 }),
      cloth2: new THREE.MeshStandardMaterial({ color: '#3d5a4a', roughness: 0.9 }),
      pants: new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.9 }),
      wrap: new THREE.MeshStandardMaterial({ map: wrapTex(), roughness: 0.95 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.7 }),
      pole: new THREE.MeshStandardMaterial({ color: '#3a2616', roughness: 0.8 }),
      bronze: new THREE.MeshStandardMaterial({ color: '#8a6a30', metalness: 0.9, roughness: 0.35 }),
      black: new THREE.MeshStandardMaterial({ color: '#070707', roughness: 0.9, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: '#efeadc', roughness: 0.9, side: THREE.DoubleSide, emissive: '#222018' }),
    };
    this.M = M;
    const add = (geo, m, x, y, z, p = this.root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
    // 腿：裤 + 绑腿 + 方口履
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 12), M.pants, s * 0.1, 0.62, 0);
      add(new THREE.CylinderGeometry(0.066, 0.056, 0.4, 12), M.wrap, s * 0.1, 0.25, 0);
      add(new RoundedBoxGeometry(0.11, 0.07, 0.25, 2, 0.02), M.shoe, s * 0.1, 0.035, 0.04);
    }
    // 长襦下摆
    add(foldedLathe([[0.31, 0.66], [0.29, 0.76], [0.25, 0.9], [0.23, 1.0]], { folds: 12, amp: t => 0.02 + 0.05 * t, zScale: 0.85 }), M.cloth, 0, 0, 0);
    // 甲衣（含甲裙）
    add(foldedLathe([[0.27, 0.83], [0.255, 0.92], [0.235, 1.0], [0.245, 1.12], [0.255, 1.25], [0.25, 1.36], [0.2, 1.43], [0.12, 1.47]], { folds: 0, amp: () => 0, zScale: 0.78 }), M.armor, 0, 0, 0);
    // 披膊（肩甲）
    for (const s of [-1, 1]) {
      const sh = add(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.armor, s * 0.25, 1.36, 0);
      sh.scale.set(1, 1.1, 1); sh.rotation.z = -s * 0.5;
    }
    // 围领
    const scarf = add(new THREE.TorusGeometry(0.07, 0.025, 8, 20), M.cloth2, 0, 1.48, 0.0); scarf.rotation.x = Math.PI / 2;
    // 头
    const head = buildHead({ skin: '#b98a68', hair: '#100c0a', style: 'sidebun', beard: seed % 2 ? 'mustache' : 'goatee', seed: 20 + seed,
      face: { jaw: 0.8 + (seed % 3) * 0.04, cheek: 1.1, nose: 1 + (seed % 2) * 0.15, brow: 1.2, browAngle: 0.4, age: 0.2 } });
    head.group.position.set(0, 1.63, 0.01);
    this.root.add(head.group);
    this.head = head.group;

    const mkArm = (side, flagMat) => {
      const a = new THREE.Group(); a.position.set(side * 0.27, 1.38, 0); this.root.add(a);
      add(new THREE.CylinderGeometry(0.058, 0.048, 0.56, 10).translate(0, -0.28, 0), M.cloth, 0, 0, 0, a);
      add(new THREE.CylinderGeometry(0.052, 0.05, 0.08, 10), M.cloth2, 0, -0.52, 0, a);
      const hand = add(handGeometry('grip', side), head.mats.skinPlain, 0, -0.585, 0, a);
      hand.rotation.y = side * Math.PI / 2;
      const pole = new THREE.Group(); pole.position.set(0, -0.62, 0.025); a.add(pole);
      add(new THREE.CylinderGeometry(0.016, 0.018, 2.5, 8), M.pole, 0, 0.62, 0, pole);
      add(new THREE.ConeGeometry(0.03, 0.12, 8), M.bronze, 0, 1.93, 0, pole);
      const geo = new THREE.PlaneGeometry(0.95, 0.65, 12, 4); geo.translate(side * 0.475, 0, 0);
      const flag = add(geo, flagMat, 0, 1.5, 0, pole);
      flag.userData.base = Float32Array.from(geo.attributes.position.array);
      return { a, pole, flag, side };
    };
    this.white = mkArm(1, M.white);   // 左手白旗
    this.black = mkArm(-1, M.black);  // 右手黑旗
    this.bit = 0;
    this._raise = { white: 1, black: 0 };
    this.seed = seed * 1.7;
  }
  setBit(b) { this.bit = b ? 1 : 0; }
  update(dt, t) {
    const tw = this.bit ? 0 : 1, tb = this.bit ? 1 : 0;
    this._raise.white = lerp(this._raise.white, tw, Math.min(1, dt * 9));
    this._raise.black = lerp(this._raise.black, tb, Math.min(1, dt * 9));
    for (const [arm, r] of [[this.white, this._raise.white], [this.black, this._raise.black]]) {
      arm.a.rotation.x = lerp(-0.35, -2.75, r);
      arm.a.rotation.z = arm.side * lerp(0.12, 0.35, r);
      arm.pole.rotation.x = lerp(0.35, 2.75, r) - 0.15; // 保持旗杆接近竖直
      const geo = arm.flag.geometry, b = arm.flag.userData.base, p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const k = Math.abs(b[i]) / 0.95;
        p[i + 2] = Math.sin(k * 5 - t * 8 + this.seed) * 0.1 * k * (0.4 + r) + Math.sin(b[i + 1] * 4 + t * 5) * 0.02 * k;
      }
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    }
    this.head.rotation.y = Math.sin(t * 0.5 + this.seed) * 0.1;
  }
}
