import * as THREE from 'three';
import { UI } from '../core/ui.js';
import { wait, waitUntil, tween, clamp, lerp, smoothstep, rand, fbm2, noise2, easeInOut, easeOut, disposeTree, mulberry32 } from '../core/utils.js';
import { Sky, atmosphere, dirFromAzEl } from '../world/sky.js';
import { Terrain } from '../world/terrain.js';
import { Lake } from '../world/water.js';
import { Particles } from '../world/particles.js';
import { Trisolaran } from '../models/humanoid.js';
import { buildPyramid, buildGranary, buildHut, buildPendulum, Tex } from '../models/structures.js';

const LAKE = { x: 46, z: 30, r: 24, y: -1.15 };
const GRANARY = { x: -36, z: -6 };
const PYRAMID = { x: 0, z: -290 };
const SPAWN = new THREE.Vector3(8, 0, 118);

function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm2(x * 0.004, z * 0.004, 4) * 16 + fbm2(x * 0.02, z * 0.02, 3) * 1.8;
  const m = smoothstep(480, 1150, r);
  h += m * (Math.abs(fbm2(x * 0.0024 + 5, z * 0.0024, 4)) * 300 + 30);
  h *= smoothstep(60, 170, r);
  h *= smoothstep(70, 140, Math.hypot(x - PYRAMID.x, z - PYRAMID.z)) * 0.9 + 0.1 * smoothstep(60, 70, r);
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= 3.2 * (1 - smoothstep(LAKE.r * 0.55, LAKE.r + 6, dl));
  return h;
}
function colorAt(x, z, h) {
  const n = fbm2(x * 0.03, z * 0.03, 3), n2 = noise2(x * 0.2, z * 0.2);
  let c = [0.62 + n * 0.12 + n2 * 0.03, 0.45 + n * 0.09, 0.3 + n * 0.06];
  const rock = smoothstep(25, 90, h);
  c = c.map((v, i) => lerp(v, [0.42, 0.37, 0.33][i], rock));
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  const wet = 1 - smoothstep(LAKE.r - 2, LAKE.r + 7, dl);
  c = c.map((v, i) => lerp(v, [0.32, 0.27, 0.2][i], wet));
  return c.map(v => v * 1.75);
}

const ROBES = [['#6b5a46', '#2e2318'], ['#5a4636', '#2a1a10'], ['#4a4a52', '#22222a'], ['#7a6040', '#3a2a18'], ['#544034', '#6a2018'],
  ['#3e4a4a', '#1a2424'], ['#6a4a3a', '#2a1a12'], ['#58503e', '#2a2418'], ['#5e3a2a', '#2a120a'], ['#46403a', '#7a5a2a']];

export class PlainScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0022);
    this.time = 0;          // 世界时间
    this.timeScale = 1;
    this.temp = -25;
    this.targetTemp = -25;
    this.mode = 'chaosNight';
    this.modeT = 0;
    this.dayU = 0;
    this.heatSun = null;
    this.flags = {};
    this.selfDry = 0;       // 0 正常 → 1 完全脱水
    this.selfDryTarget = 0;
    this.playerHeat = 0;
    this.carry = [];
    this.stats = { revived: 0 };
    this.atm = {};
  }

  async init() {
    const S = this.scene;
    this.sky = new Sky();
    S.add(this.sky.mesh);
    this.terrain = new Terrain({ size: 2600, segs: 320, height: heightAt, color: colorAt });
    S.add(this.terrain.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    S.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x403020, 0.6);
    S.add(this.hemi);

    // 湖
    this.lake = new Lake(LAKE.r, LAKE.y);
    this.lake.mesh.position.set(LAKE.x, LAKE.y, LAKE.z);
    S.add(this.lake.mesh);

    // 干仓
    this.granary = buildGranary();
    this.granary.position.set(GRANARY.x, heightAt(GRANARY.x, GRANARY.z), GRANARY.z);
    this.granary.rotation.y = Math.atan2(-GRANARY.x, -GRANARY.z);
    S.add(this.granary);
    this.granary.updateMatrixWorld(true);
    this.slots = this.granary.userData.slots.map(s => this.granary.localToWorld(s.clone()));
    this.slotUsed = this.slots.map(() => false);

    // 金字塔（纣王的宫殿）
    this.pyramid = buildPyramid({ base: 150, height: 84, levels: 9, top: 26, unit: 5 });
    this.pyramid.position.set(PYRAMID.x, heightAt(PYRAMID.x, PYRAMID.z) - 1, PYRAMID.z);
    S.add(this.pyramid);

    // 巨摆
    this.pendulums = [[-185, -205, 0.5, 74], [190, -230, -0.45, 80], [-30, -520, 0.05, 110]].map(([x, z, ry, h], i) => {
      const p = buildPendulum(h, h * 0.48, h * 0.085);
      p.position.set(x, heightAt(x, z) - 0.5, z); p.rotation.y = ry;
      p.userData.phase = i * 2.1; p.userData.period = 9 + i * 2.5;
      S.add(p);
      return p;
    });

    // 土屋
    const rng = mulberry32(7);
    this.huts = [];
    const hutAngles = [0.2, 0.75, 1.25, 1.75, 2.4, 3.6, 4.1, 4.6, 5.1, 5.7];
    hutAngles.forEach(a => {
      const r = 44 + rng() * 14;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8 || Math.hypot(x - GRANARY.x, z - GRANARY.z) < 16) return;
      const h = buildHut(2.6 + rng() * 1.2);
      h.position.set(x, heightAt(x, z), z);
      h.rotation.y = Math.atan2(-x, -z);
      S.add(h); this.huts.push(h);
    });

    // 岩石
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ map: Tex.stone(), color: '#8a7a68', roughness: 1 }), 420);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 420; i++) {
      const a = rng() * Math.PI * 2, r = 70 + Math.pow(rng(), 0.7) * 520;
      const x = Math.sin(a) * r, z = Math.cos(a) * r, s = 0.4 + rng() * rng() * 4;
      q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3));
      m4.compose(new THREE.Vector3(x, heightAt(x, z) + s * 0.2, z), q, new THREE.Vector3(s, s * (0.5 + rng() * 0.6), s * (0.7 + rng() * 0.5)));
      rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = true; rocks.receiveShadow = true;
    S.add(rocks);

    // 村民
    this.villagers = [];
    const vr = mulberry32(42);
    for (let i = 0; i < 24; i++) {
      const [robe, trim] = ROBES[i % ROBES.length];
      const v = new Trisolaran({ robe, trim, skin: ['#c99a74', '#b88a66', '#d4a882', '#a87a58'][i % 4], scale: 0.92 + vr() * 0.16, hat: vr() < 0.7 ? 'knot' : 'none', beard: vr() < 0.25 });
      let x, z;
      do { const a = vr() * Math.PI * 2, r = 8 + vr() * 26; x = Math.sin(a) * r; z = Math.cos(a) * r; }
      while (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3 || Math.hypot(x - GRANARY.x, z - GRANARY.z) < 13);
      v.root.position.set(x, heightAt(x, z), z);
      v.root.rotation.y = vr() * Math.PI * 2;
      v.mode = 'idle'; v.waitT = vr() * 4; v.target = null;
      S.add(v.root);
      this.villagers.push(v);
    }
    // 周文王
    this.king = new Trisolaran({ robe: '#2e2620', trim: '#7a1a12', skin: '#c49470', hair: '#2a2420', hat: 'crown', beard: 'long', scale: 1.04, name: '周文王' });
    this.king.isKing = true;
    this.king.root.position.set(SPAWN.x - 3, heightAt(SPAWN.x - 3, SPAWN.z - 4), SPAWN.z - 4);
    this.king.root.rotation.y = Math.PI * 0.85;
    this.king.mode = 'idle'; this.king.waitT = 0;
    S.add(this.king.root);
    this.villagers.push(this.king);

    // 粒子
    this.pfx = new Particles(4000);
    this.pfxAdd = new Particles(2500, { additive: true });
    S.add(this.pfx.points, this.pfxAdd.points);

    // 玩家
    const fp = this.game.fp;
    fp.groundFn = (x, z) => heightAt(x, z) + (this._inGranary(x, z) ? 0 : 0);
    fp.boundFn = p => {
      const r = Math.hypot(p.x, p.z);
      if (r > 600) { p.x *= 600 / r; p.z *= 600 / r; }
      // 湖里走不进去太深
      const dl = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
      if (dl < LAKE.r - 3) { const k = (LAKE.r - 3) / dl; p.x = LAKE.x + (p.x - LAKE.x) * k; p.z = LAKE.z + (p.z - LAKE.z) * k; }
      this._collideGranary(p);
    };
    fp.setPose(SPAWN, 0.12, 0.02);
    fp.eye = 1.7; fp.eyeOffset = 0; fp.roll = 0;
    this._applySky(0);
  }

  /* ---------------- 干仓碰撞 / 判断 ---------------- */
  _granaryLocal(x, z) { return this.granary.worldToLocal(new THREE.Vector3(x, this.granary.position.y + 1, z)); }
  _inGranary(x, z) { const l = this._granaryLocal(x, z); return Math.abs(l.x) < 8.4 && Math.abs(l.z) < 5.4; }
  _collideGranary(p) {
    const l = this._granaryLocal(p.x, p.z);
    const OX = 9.7, OZ = 6.7, IX = 8.4, IZ = 5.4;
    if (Math.abs(l.x) >= OX || Math.abs(l.z) >= OZ) return;
    if (Math.abs(l.x) < IX && Math.abs(l.z) < IZ) return;
    if (Math.abs(l.x) < 2.6 && l.z > 0) return; // 大门
    const c = [
      [OX - Math.abs(l.x), () => (l.x = Math.sign(l.x) * OX)],
      [OZ - Math.abs(l.z), () => (l.z = Math.sign(l.z) * OZ)],
    ];
    if (Math.abs(l.z) < IZ) c.push([Math.abs(l.x) - IX, () => (l.x = Math.sign(l.x) * (IX - 0.01))]);
    if (Math.abs(l.x) < IX) c.push([Math.abs(l.z) - IZ, () => (l.z = Math.sign(l.z) * (IZ - 0.01))]);
    c.sort((a, b) => a[0] - b[0]);
    c[0][1]();
    const w = this.granary.localToWorld(l);
    p.x = w.x; p.z = w.z;
  }

  /* ---------------- 天空 / 纪元 ---------------- */
  setMode(m) { this.mode = m; this.modeT = 0; if (m === 'stable' || m === 'dawnStable') this.dayU = 0; }

  _skyState(dtw) {
    const s0 = this.sky.suns[0];
    const fly = this.sky.fly;
    fly.forEach(f => (f.intensity = 0));
    this.sky.suns[1].intensity = 0; this.sky.suns[2].intensity = 0;
    const T = this.modeT;
    let heat = 0, cold = 0, sunLabel = '';
    switch (this.mode) {
      case 'chaosNight': {
        s0.intensity = 0;
        dirFromAzEl(1.2 + T * 0.004, 0.12 + Math.sin(T * 0.05) * 0.03, fly[0].dir); fly[0].intensity = 1;
        dirFromAzEl(4.3 - T * 0.006, 0.42, fly[1].dir); fly[1].intensity = 0.55;
        this.targetTemp = -28; cold = 0.6; sunLabel = '无太阳 · 飞星 ×2';
        break;
      }
      case 'stable': case 'dawnStable': {
        const dayLen = 80, nightLen = 22;
        this.dayU += dtw / dayLen;
        let u = this.dayU % ((dayLen + nightLen) / dayLen);
        if (u <= 1) {
          const az = Math.PI / 2 + Math.PI * u;
          const el = Math.sin(Math.PI * u) * 1.0 - 0.06;
          dirFromAzEl(az, el, s0.dir);
          s0.size = 0.035; s0.intensity = 1; s0.color.setRGB(1, 0.93, 0.82);
          this.targetTemp = 12 + 16 * Math.max(0, Math.sin(Math.PI * u));
          sunLabel = '太阳：东升西落，运行正常';
        } else {
          s0.intensity = 0; this.targetTemp = 2; sunLabel = '夜晚 · 太阳将按时升起';
        }
        break;
      }
      case 'chaosHeat': {
        // 太阳停滞、抖动、膨胀为巨日
        const h = this.heatSun;
        const grow = smoothstep(0, 28, T);
        const set = smoothstep(46, 56, T);
        const az = h.az + Math.sin(T * 0.37) * 0.05 + T * 0.006;
        const el = lerp(h.el, -0.35, set) + Math.sin(T * 0.53) * 0.02;
        dirFromAzEl(az, el, s0.dir);
        s0.size = lerp(0.035, 0.24, grow);
        s0.intensity = lerp(1, 2.3, grow) * (1 - set * 0.6);
        s0.color.setRGB(1, lerp(0.93, 0.78, grow), lerp(0.82, 0.55, grow));
        this.targetTemp = lerp(30, 150, grow) * (1 - set) + set * -10;
        heat = grow * (1 - set * 0.8);
        sunLabel = set > 0.1 ? '巨日正在落下' : grow > 0.4 ? '巨日悬空 · 大地在燃烧' : '太阳停滞不动，正在变大……';
        if (T > 58) this.setMode('chaosCold');
        break;
      }
      case 'chaosCold': {
        s0.intensity = 0;
        dirFromAzEl(0.6 + T * 0.012, 0.35 + Math.sin(T * 0.07) * 0.1, fly[0].dir); fly[0].intensity = 1.1;
        dirFromAzEl(3.1 - T * 0.01, 0.6, fly[1].dir); fly[1].intensity = 0.8;
        dirFromAzEl(5.0 + T * 0.02, 0.18, fly[2].dir); fly[2].intensity = 0.5 * smoothstep(8, 14, T);
        this.targetTemp = -80; cold = 1;
        sunLabel = '长夜 · 三颗飞星';
        if (T > 46) this.setMode('dawnStable');
        break;
      }
    }
    this.modeT += dtw;
    this.heatK = heat; this.coldK = cold;
    this._sunLabel = sunLabel;
  }

  _applySky(dt) {
    const s0 = this.sky.suns[0];
    const a = atmosphere({ sunDir: s0.dir, sunInt: s0.intensity, heat: this.heatK || 0, cold: smoothstep(-5, -60, this.temp) }, this.atm);
    const u = this.sky.uniforms;
    u.uZenith.value.copy(a.zenith); u.uHorizon.value.copy(a.horizon); u.uGround.value.copy(a.ground);
    u.uStars.value = a.stars; u.uDust.value = 0.5 + (this.heatK || 0);
    this.scene.fog.color.copy(a.fog);
    this.scene.fog.density = lerp(0.0016, 0.0021, this.heatK || 0) + (this.coldK || 0) * 0.0006;
    const camPos = this.game.engine.camera.position;
    const lit = s0.intensity > 0.01 && s0.dir.y > -0.05;
    if (lit) {
      this.sun.color.copy(a.lightColor);
      this.sun.intensity = a.lightInt;
      this.sun.position.copy(camPos).addScaledVector(s0.dir, 250);
    } else {
      // 星光/飞星微光
      this.sun.color.setRGB(0.55, 0.65, 1);
      this.sun.intensity = 0.25;
      this.sun.position.copy(camPos).add(new THREE.Vector3(80, 220, 60));
    }
    this.sun.target.position.copy(camPos);
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemiInt + 0.25;
    this.game.engine.renderer.toneMappingExposure = lerp(1.6, 1.0, Math.min(1, a.day)) * lerp(1, 0.8, this.heatK || 0);
    this.lake.update(this.time, a, s0.dir, a.lightColor, this.scene.fog);
  }

  /* ---------------- 村民行为 ---------------- */
  _pickTarget(v) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 32;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2) continue;
      if (Math.hypot(x - GRANARY.x, z - GRANARY.z) < 12) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(rand(-10, 10), 0, rand(-10, 10));
  }
  _walkTo(v, target, dt, speed = 1.15, stopDist = 0.4) {
    const p = v.root.position;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (d < stopDist) { v.animate(dt, false); return true; }
    const yaw = Math.atan2(dx, dz);
    let dy = yaw - v.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.root.rotation.y += dy * Math.min(1, dt * 5);
    const st = Math.min(d, speed * dt);
    p.x += dx / d * st; p.z += dz / d * st;
    p.y = Math.max(heightAt(p.x, p.z), v.mode === 'toShore' ? LAKE.y - 0.9 : -99);
    v.animate(dt, true, speed);
    return false;
  }
  _face(v, target, dt) {
    const p = v.root.position;
    const yaw = Math.atan2(target.x - p.x, target.z - p.z);
    let dy = yaw - v.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.root.rotation.y += dy * Math.min(1, dt * 3);
  }

  _updateVillagers(dt, dtw) {
    const player = this.game.fp.pos;
    const hot = this.temp, chaos = this.mode === 'chaosHeat' || this.mode === 'chaosCold';
    const camP = this.game.engine.camera.position;
    for (const v of this.villagers) {
      const p = v.root.position;
      v.near = Math.abs(p.x - camP.x) + Math.abs(p.z - camP.z) < 50;
      switch (v.mode) {
        case 'idle':
        case 'walk': {
          if (v.isKing && v.follow) {
            const d = Math.hypot(player.x - p.x, player.z - p.z);
            if (d > 5.5) { v.mode = 'walk'; this._walkTo(v, player, dt, d > 12 ? 3 : 1.5, 4.2); }
            else { v.animate(dt, false); this._face(v, player, dt); }
            break;
          }
          if (v.isKing && v.goal) { if (this._walkTo(v, v.goal, dt, 1.5)) { v.goal = null; } break; }
          if (chaos) { // 乱纪元里惊慌地跑向干仓方向
            v.target = v.panic || (v.panic = new THREE.Vector3(GRANARY.x + rand(-12, 12), 0, GRANARY.z + rand(8, 18)).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0));
            this._walkTo(v, v.target, dt, 2.2, 1.5);
          } else if (v.mode === 'idle') {
            v.animate(dt, false);
            v.waitT -= dt;
            if (v.waitT <= 0 && !v.isKing) { v.target = this._pickTarget(v); v.mode = 'walk'; }
          } else if (this._walkTo(v, v.target, dt)) { v.mode = 'idle'; v.waitT = rand(2, 7); }
          // 高温烧伤 / 低温冻伤
          if (hot > 62) {
            v.burn = Math.min(1, v.burn + dtw * 0.012 * (hot - 58) / 20);
            v.setBurn(v.burn);
            if (Math.random() < 0.3) this.pfx.emit(p.x + rand(-0.3, 0.3), p.y + 1 + rand(0, 0.8), p.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2), { life: 2.5, size: 0.6, grow: 2, color: [0.08, 0.06, 0.05], alpha: 0.6 });
            if (Math.random() < 0.25) this.pfxAdd.emit(p.x + rand(-0.3, 0.3), p.y + rand(0.3, 1.6), p.z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.5, 2), rand(-0.3, 0.3), { life: 1.2, size: 0.08, color: [1, 0.4, 0.1] });
            if (v.burn >= 1) { v.mode = 'dead'; v.deathT = 0; v.cause = 'burn'; this.game.audio.crackle(0.8); }
          } else if (hot < -38) {
            v.freeze = Math.min(1, v.freeze + dtw * 0.02 * (-hot - 30) / 30);
            v.setFreeze(v.freeze);
            if (v.freeze >= 1) { v.mode = 'dead'; v.deathT = 0; v.cause = 'freeze'; }
          }
          break;
        }
        case 'dehydrating': {
          v.dryT += dtw / 5.5;
          v.setDry(Math.min(1, v.dryT));
          if (v.dryT < 0.55 && Math.random() < 0.6) {
            this.pfx.emit(p.x + rand(-0.4, 0.4), p.y + rand(0.2, 1.6), p.z + rand(-0.4, 0.4), rand(-0.2, 0.2), rand(0.6, 1.4), rand(-0.2, 0.2), { life: 2.2, size: 0.5, grow: 2.5, color: [0.92, 0.92, 0.95], alpha: 0.35 });
          }
          if (v.dryT >= 1) { v.mode = 'scroll'; }
          break;
        }
        case 'scroll': case 'carried': {
          if (v.mode === 'carried') {
            const i = this.carry.indexOf(v);
            const fp = this.game.fp;
            const fwd = fp.forward(new THREE.Vector3()), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
            const tgt = new THREE.Vector3().copy(fp.pos).addScaledVector(right, 0.75).addScaledVector(fwd, -0.4);
            tgt.y = fp.pos.y + 0.75 + i * 0.24 + Math.sin(this.time * 2 + i) * 0.03;
            p.lerp(tgt, Math.min(1, dt * 8));
            v.root.rotation.y = lerp(v.root.rotation.y, fp.yaw, Math.min(1, dt * 6));
          }
          // 地面上的卷轴在巨日下被烤焦
          if (hot > 92 && !this._inGranary(p.x, p.z)) {
            v.setCharred(Math.min(1, v.charred + dtw * 0.011 * (hot - 88) / 25));
            if (Math.random() < 0.1) this.pfx.emit(p.x + rand(-0.4, 0.4), p.y + 0.2, p.z + rand(-0.4, 0.4), 0, rand(0.5, 1), 0, { life: 2, size: 0.4, grow: 2, color: [0.1, 0.08, 0.06], alpha: 0.5 });
            if (v.charred >= 1 && !v.lost) { v.lost = true; if (v.mode === 'carried') this.carry.splice(this.carry.indexOf(v), 1); v.mode = 'lost'; }
          }
          break;
        }
        case 'flying': {
          v.flyT += dt / v.flyDur;
          const k = Math.min(1, v.flyT);
          p.lerpVectors(v.flyFrom, v.flyTo, easeInOut(k));
          p.y += Math.sin(k * Math.PI) * v.flyArc;
          v.root.rotation.y += dt * (v.flySpin || 0);
          if (k >= 1) {
            v.root.rotation.y = v.flyYaw ?? v.root.rotation.y;
            if (v.flyNext === 'stored') { v.mode = 'stored'; }
            else if (v.flyNext === 'soak') { v.mode = 'soaking'; v.soakT = 0; this._splash(p); }
          }
          break;
        }
        case 'soaking': {
          v.soakT += dt;
          p.y = LAKE.y - 0.02 + Math.sin(this.time * 2 + v.phase) * 0.03;
          if (v.soakT > 1.2) { v.mode = 'rehydrating'; v.dryT = 1; }
          break;
        }
        case 'rehydrating': {
          v.dryT -= dt / 4.2;
          v.setDry(Math.max(0, v.dryT));
          p.y = lerp(LAKE.y - 0.02, LAKE.y - 0.9, smoothstep(0.55, 0.0, v.dryT));
          if (Math.random() < 0.3) this.pfx.emit(p.x + rand(-0.5, 0.5), LAKE.y + 0.05, p.z + rand(-0.5, 0.5), rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), { life: 0.8, size: 0.12, color: [0.7, 0.8, 0.9], alpha: 0.6, gravity: 4 });
          if (v.dryT <= 0) {
            v.mode = 'toShore';
            const d = new THREE.Vector3(p.x - LAKE.x, 0, p.z - LAKE.z).normalize();
            v.target = new THREE.Vector3(LAKE.x + d.x * (LAKE.r + 4), 0, LAKE.z + d.z * (LAKE.r + 4));
            this.stats.revived++;
          }
          break;
        }
        case 'toShore': {
          if (this._walkTo(v, v.target, dt, 1.2)) { v.mode = 'idle'; v.waitT = rand(1, 5); v.panic = null; }
          break;
        }
        case 'dead': {
          v.deathT += dt;
          if (v.cause === 'burn') {
            const k = smoothstep(1.5, 5, v.deathT);
            v.pivot.scale.y = lerp(0.55, 0.06, k);
            v.pivot.scale.x = v.pivot.scale.z = lerp(1, 1.6, k);
            for (const key of ['robe', 'skin']) v.mats[key].emissive.multiplyScalar(0.97);
          }
          v.animate(0, false);
          break;
        }
        case 'stored': case 'lost': default: break;
      }
    }
  }

  _splash(p) {
    this.game.audio.splash();
    this.lake.ripple(p.x, p.z, this.lake.u.uTime.value);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(1, 4);
      this.pfx.emit(p.x, LAKE.y + 0.1, p.z, Math.cos(a) * s * 0.4, rand(2, 6), Math.sin(a) * s * 0.4, { life: 1.4, size: 0.14, color: [0.75, 0.85, 0.95], alpha: 0.8, gravity: 9 });
    }
  }

  /* ---------------- 玩家指令 ---------------- */
  orderDehydrate() {
    if (this.flags.dehydrateOrdered) return;
    this.flags.dehydrateOrdered = true;
    const pl = this.game.fp.pos;
    const alive = this.villagers.filter(v => v.mode === 'idle' || v.mode === 'walk');
    alive.forEach(v => {
      const d = v.root.position.distanceTo(pl);
      const delay = v.isKing ? 9 : 0.4 + d * 0.06 + Math.random() * 1.2;
      wait(delay).then(() => {
        if (v.mode !== 'idle' && v.mode !== 'walk') return;
        v.mode = 'dehydrating'; v.dryT = 0; v.follow = false;
        this.game.audio.crackle(1.2); this.game.audio.hiss(2.5);
      });
    });
  }
  orderSoak() {
    if (this.flags.soakOrdered) return;
    this.flags.soakOrdered = true;
    const targets = this.villagers.filter(v => (v.mode === 'stored' || v.mode === 'scroll' || v.mode === 'carried') && !v.lost);
    this.carry.length = 0;
    targets.forEach((v, i) => {
      wait(i * 0.35 + Math.random() * 0.2).then(() => {
        if (v.slot !== undefined) { this.slotUsed[v.slot] = false; v.slot = undefined; }
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * LAKE.r * 0.62;
        v.flyFrom = v.root.position.clone();
        v.flyTo = new THREE.Vector3(LAKE.x + Math.cos(a) * r, LAKE.y, LAKE.z + Math.sin(a) * r);
        v.flyDur = 1.6 + v.flyFrom.distanceTo(v.flyTo) * 0.02; v.flyArc = 10 + Math.random() * 5; v.flySpin = rand(-4, 4); v.flyT = 0;
        v.flyNext = 'soak'; v.flyYaw = Math.random() * Math.PI * 2;
        v.mode = 'flying';
        this.game.audio.whoosh(0.8);
      });
    });
    return targets.length;
  }
  tryPickup() {
    const pl = this.game.fp.pos;
    let best = null, bd = 3.2;
    for (const v of this.villagers) {
      if (v.mode !== 'scroll') continue;
      const d = Math.hypot(v.root.position.x - pl.x, v.root.position.z - pl.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (best && this.carry.length < 8) {
      best.mode = 'carried'; this.carry.push(best);
      this.game.audio.blip(660);
      return true;
    }
    return false;
  }
  _depositIfInGranary() {
    const pl = this.game.fp.pos;
    if (!this.carry.length || !this._inGranary(pl.x, pl.z)) return;
    while (this.carry.length) {
      const v = this.carry.shift();
      const si = this.slotUsed.findIndex(u => !u);
      if (si < 0) { v.mode = 'scroll'; continue; }
      this.slotUsed[si] = true; v.slot = si;
      v.flyFrom = v.root.position.clone(); v.flyTo = this.slots[si].clone();
      v.flyDur = 0.9; v.flyArc = 0.6; v.flyT = 0; v.flySpin = 0; v.flyNext = 'stored'; v.flyYaw = this.granary.rotation.y;
      v.mode = 'flying';
    }
    this.game.audio.blip(990, 0.1);
  }
  setSelfDry(on) {
    if (on === (this.selfDryTarget === 1)) return;
    this.selfDryTarget = on ? 1 : 0;
    const a = this.game.audio;
    a.muffle(on);
    if (on) { a.crackle(1.5); a.hiss(2); }
    // 携带的卷轴掉在地上
    if (on && this.carry.length) {
      this.carry.forEach(v => { v.mode = 'scroll'; v.root.position.y = heightAt(v.root.position.x, v.root.position.z); });
      this.carry.length = 0;
    }
  }

  onKey(code) {
    if (code === 'Space') UI.skip();
    if (code === 'KeyF' && this.flags.canDehydrate) { this.orderDehydrate(); UI.prompt(null); }
    if (code === 'KeyE' && this.selfDryTarget === 0) this.tryPickup();
    if (code === 'KeyX' && this.flags.canSelfDry) this.setSelfDry(this.selfDryTarget === 0);
    if (code === 'KeyR' && this.flags.canSoak) { this.orderSoak(); UI.prompt(null); }
    if (code === 'Enter' && this.flags.canNext) this.game.goto('qin');
  }

  /* ---------------- 剧情脚本 ---------------- */
  async start() {
    const g = this.game, k = this.king;
    const say = (t, o = {}) => UI.say(o.name || '周文王', t, { who: o.who || 'king', ...o });
    const talk = async (t, o) => { k.gesture = 1; await say(t, o); k.gesture = 0; };
    UI.setCiv(`三体 · 第 <b>${g.civ}</b> 号文明 · 商周时期`);
    UI.setKeys([['W A S D', '移动'], ['Shift', '奔跑'], ['空格', '跳过对白']]);
    g.audio.setWind(0.7); g.audio.setDrone(0.5, [55, 82.4, 110, 130.8]);
    g.fp.enabled = true; g.fp.look = true;
    await wait(0.5);
    await UI.card('第一章 · 乱纪元', '寒冷的大地上，一颗飞星挂在地平线附近', 3.5);
    this.flags.intro = true;
    await talk('你醒了。我是周文王，一直在研究太阳运行的规律。');
    await talk('看到天边那颗明亮的飞星了吗？飞星出现，说明太阳正在远离我们。这是乱纪元。');
    await talk('但我已经推算出来了：恒纪元马上就要到来。跟我回村庄，族人们都在等太阳。');
    UI.hideSay();
    UI.setObjective('跟随周文王前往村庄');
    UI.marker(new THREE.Vector3(0, 3, 0), '村庄');
    k.goal = new THREE.Vector3(4, 0, 16);
    await Promise.race([waitUntil(() => g.fp.pos.distanceTo(new THREE.Vector3(0, g.fp.pos.y, 0)) < 42), wait(55)]);
    UI.marker(null);

    // —— 恒纪元 ——
    this.setMode('stable');
    g.audio.chord([261.6, 329.6, 392, 523.3], 7, 0.05);
    g.audio.setDrone(0.4, [65.4, 98, 130.8, 164.8]);
    k.follow = true; k.goal = null;
    await wait(4);
    await talk('看！太阳按时升起来了。恒纪元！我的推算没有错！');
    await UI.say('族人', '恒纪元来了！大家快出来干活！', { who: 'folk' });
    await talk('你还不知道吧：在乱纪元来临时，我们能把身体里的水全部排出去，变成一张干燥的纤维卷。');
    await talk('纤维卷存放在那座干仓里，就能熬过酷热和严寒。');
    await talk('等恒纪元来了，再把它们投进湖里浸泡，族人就会重新活过来。文明就是这样一次次熬过灾难的。');
    UI.hideSay();
    UI.setObjective('四处走走，看看三体世界（干仓在村子西侧，湖在东侧）');
    UI.marker(new THREE.Vector3(GRANARY.x, 9, GRANARY.z), '干仓');
    await Promise.race([wait(26), waitUntil(() => this.dayU > 0.62)]);
    await waitUntil(() => this.dayU > 0.5);
    UI.marker(null);

    // —— 乱纪元：巨日 ——
    const s0 = this.sky.suns[0];
    const az = Math.atan2(s0.dir.x, s0.dir.z), el = Math.asin(clamp(s0.dir.y, -1, 1));
    this.heatSun = { az, el: Math.max(0.5, el) };
    this.setMode('chaosHeat');
    g.audio.alarm();
    g.audio.setDrone(0.6, [55, 58.3, 82.4, 87.3]);
    UI.setEra('乱纪元', 'chaos', '太阳失去了规律');
    await wait(3);
    await talk('不……太阳怎么停住了？它……它在变大！');
    this.flags.canDehydrate = true;
    await talk('我推算错了！快！快下令脱水！');
    UI.hideSay();
    UI.setObjective('在烈日烤焦族人之前下令全体脱水');
    UI.prompt('按 <kbd>F</kbd> 下令：全体脱水！', true);
    UI.setKeys([['F', '下令脱水'], ['W A S D', '移动'], ['Shift', '奔跑']]);
    await waitUntil(() => this.flags.dehydrateOrdered || this.temp > 72);
    UI.prompt(null);
    if (!this.flags.dehydrateOrdered) {
      await UI.say('族人', '好热……我们要被烤焦了……', { who: 'folk' });
      UI.prompt('按 <kbd>F</kbd> 下令脱水，还来得及救下一些人！', true);
      await waitUntil(() => this.flags.dehydrateOrdered || this.temp > 110);
      UI.prompt(null);
    } else {
      UI.say('周文王', '脱水！全体脱水！把纤维卷收进干仓！', { who: 'king' });
    }
    this.flags.canSelfDry = true;
    UI.setObjective('把地上的纤维卷搬进干仓（靠近按 <kbd>E</kbd> 拾取，走进干仓自动存放）<br>温度过高时，按 <kbd>X</kbd> 让自己也脱水');
    UI.marker(new THREE.Vector3(GRANARY.x, 9, GRANARY.z), '干仓');
    UI.setKeys([['E', '拾取纤维卷'], ['X', '自身脱水 / 复原'], ['W A S D', '移动'], ['Shift', '奔跑']]);
    await wait(9);
    if (this.flags.dehydrateOrdered && k.mode === 'dehydrating') await UI.say('周文王', '我也要脱水了……记得把我放进干仓……', { who: 'king' });
    await waitUntil(() => this.mode === 'chaosCold');
    UI.hideSay();

    // —— 乱纪元：长夜严寒 ——
    UI.setEra('乱纪元', 'night', '长夜 · 严寒');
    g.audio.setDrone(0.5, [41.2, 61.7, 82.4, 92.5]);
    if (this.selfDryTarget === 0) this.basePrompt = '严寒将至。按 <kbd>X</kbd> 让自己脱水，等待恒纪元';
    await waitUntil(() => this.mode === 'dawnStable');
    this.basePrompt = null;
    UI.prompt(null);

    // —— 恒纪元：浸泡复苏 ——
    UI.setEra('恒纪元', 'stable', '太阳重新按时升起');
    g.audio.setDrone(0.4, [65.4, 98, 130.8, 164.8]);
    this.timeScale = 1;
    if (this.selfDryTarget === 1) {
      await wait(3);
      this.setSelfDry(false);
      await UI.say('', '恒纪元的阳光照在你干瘪的身体上。你被浸湿，慢慢舒展开来……', { who: 'sys' });
    }
    await wait(2);
    this.flags.canSelfDry = false;
    this.flags.canSoak = true;
    UI.setObjective('下令浸泡：把纤维卷投进湖里，让族人复苏');
    UI.prompt('按 <kbd>R</kbd> 下令：浸泡！', false);
    UI.marker(new THREE.Vector3(LAKE.x, 2, LAKE.z), '湖');
    UI.setKeys([['R', '下令浸泡'], ['W A S D', '移动']]);
    await waitUntil(() => this.flags.soakOrdered);
    UI.marker(null);
    g.audio.chord([196, 246.9, 293.7, 392], 8, 0.05);
    await wait(10);
    await waitUntil(() => !this.villagers.some(v => ['flying', 'soaking', 'rehydrating'].includes(v.mode)));
    const kingAlive = k.mode === 'idle' || k.mode === 'walk' || k.mode === 'toShore';
    const sp = kingAlive ? '周文王' : '族人';
    const lost = this.villagers.filter(v => v.mode === 'dead' || v.mode === 'lost').length;
    if (kingAlive) { k.follow = true; }
    await UI.say(sp, lost ? `复苏了……可还有 ${lost} 个人再也回不来了。` : '所有人都复苏了。又一轮文明开始了。', { who: kingAlive ? 'king' : 'folk' });
    await UI.say(sp, '我还是算不准太阳。这个世界的太阳，好像根本没有规律。', { who: kingAlive ? 'king' : 'folk' });
    await UI.say(sp, '听说东方有位君主叫秦始皇，他统一了大地，召集了牛顿、冯·诺伊曼这些学者，要用他的军队来计算太阳的运行。', { who: kingAlive ? 'king' : 'folk' });
    await UI.say(sp, '去看看吧。也许他能做到我做不到的事。', { who: kingAlive ? 'king' : 'folk' });
    UI.hideSay();
    this.flags.canNext = true;
    UI.setObjective('前往下一个文明：秦始皇的人列计算机');
    UI.prompt('按 <kbd>Enter</kbd> 进入第二章', false);
    UI.setKeys([['Enter', '进入第二章'], ['W A S D', '自由漫步']]);
  }

  /* ---------------- 每帧 ---------------- */
  update(dt, t) {
    const g = this.game, fx = g.engine.fx;
    // 自身脱水
    this.selfDry = lerp(this.selfDry, this.selfDryTarget, Math.min(1, dt * 1.2));
    const sd = this.selfDry;
    this.timeScale = this.selfDryTarget === 1 && (this.mode === 'chaosHeat' || this.mode === 'chaosCold') ? 7 : 1;
    const dtw = dt * this.timeScale;
    this.time += dtw;
    g.fp.enabled = this.selfDryTarget === 0;
    g.fp.eyeOffset = -1.45 * smoothstep(0.2, 0.9, sd);
    g.fp.roll = 1.35 * smoothstep(0.3, 1, sd);
    g.fp.update(dt);

    this._skyState(dtw);
    this.temp += (this.targetTemp - this.temp) * Math.min(1, dtw * (this.mode === 'chaosHeat' ? 0.09 : 0.12));
    this._applySky(dt);
    this.sky.update(g.engine.camera, t);
    this.terrain.heat = smoothstep(55, 140, this.temp);
    this.terrain.frost = smoothstep(-15, -60, this.temp);
    this.terrain.tick(t);
    this.lake.u.uFreeze.value = smoothstep(-20, -55, this.temp);
    this.lake.u.uBoil.value = smoothstep(70, 110, this.temp);

    // 巨摆
    for (const p of this.pendulums) p.userData.swing.rotation.z = Math.sin(this.time * Math.PI * 2 / p.userData.period + p.userData.phase) * 0.42;

    this._updateVillagers(dt, dtw);
    this._depositIfInGranary();

    // 玩家受热 / 受冻
    const pl = g.fp.pos;
    const shade = this._inGranary(pl.x, pl.z);
    let dmg = 0;
    if (this.selfDryTarget === 0 && !this.god) {
      if (this.temp > 78 && !shade) dmg = (this.temp - 78) / 40;
      if (this.temp < -42) dmg = (-this.temp - 42) / 30;
    }
    this.playerHeat = clamp(this.playerHeat + (dmg > 0 ? dmg * dt * 0.13 : -dt * 0.15), 0, 1);
    if (this.playerHeat >= 1 && this.selfDryTarget === 0) {
      this.flags.canSelfDry = true;
      this.setSelfDry(true);
      UI.say('', this.temp > 0 ? '酷热超出了身体的极限，你本能地脱水了。' : '严寒冻僵了你的身体，你本能地脱水了。', { who: 'sys' });
      this.playerHeat = 0.6;
    }

    // 粒子环境
    const cam = g.engine.camera.position;
    if (this.heatK > 0.3 && Math.random() < this.heatK) {
      for (let i = 0; i < 2; i++) this.pfxAdd.emit(cam.x + rand(-25, 25), heightAt(cam.x, cam.z) + rand(0, 3), cam.z + rand(-25, 25), rand(-0.5, 0.5), rand(1, 3), rand(-0.5, 0.5), { life: 3, size: 0.09, color: [1, 0.45, 0.12] });
    }
    if (this.temp < -20) {
      for (let i = 0; i < 4; i++) this.pfx.emit(cam.x + rand(-20, 20), cam.y + rand(4, 12), cam.z + rand(-20, 20), rand(1, 3), rand(-2.5, -1.2), rand(-0.5, 0.5), { life: 5, size: 0.1, color: [0.9, 0.95, 1], alpha: 0.9 });
    } else if (this.mode !== 'chaosHeat' && Math.random() < 0.3) {
      this.pfx.emit(cam.x + rand(-30, 30), heightAt(cam.x, cam.z) + rand(0.2, 2), cam.z + rand(-30, 30), rand(2, 5), rand(-0.1, 0.3), rand(-1, 1), { life: 4, size: 0.5, grow: 1.5, color: [0.6, 0.5, 0.4], alpha: 0.12 });
    }
    this.pfx.update(dtw > dt ? dt * 2 : dt);
    this.pfxAdd.update(dt);

    // 声音
    g.audio.setHeat(smoothstep(40, 130, this.temp));
    g.audio.setWind(0.4 + this.coldK * 0.6 + this.heatK * 0.3);

    // 画面效果
    fx.uDesat.value = lerp(fx.uDesat.value, 0.85 * sd, 0.1);
    fx.uVignette.value = 0.55 + sd * 0.5 + this.playerHeat * 0.4;
    fx.uRed.value = this.playerHeat * (this.temp > 0 ? 1 : 0);
    fx.uFrost.value = smoothstep(-25, -70, this.temp) * (1 - sd * 0.5) + (this.temp < 0 ? this.playerHeat * 0.5 : 0);
    fx.uHaze.value = smoothstep(50, 120, this.temp);
    fx.uTint.value.setRGB(1, 1, 1).lerp(new THREE.Color(1, 0.8, 0.6), sd * 0.5);
    g.engine.bloom.strength = lerp(0.6, 0.35, this.heatK || 0);
    g.engine.shake = this.heatK > 0.7 ? 0.02 * (this.heatK - 0.7) : 0;

    // HUD
    if (this.flags.intro) {
      const era = { chaosNight: ['乱纪元', 'night', '寒夜 · 飞星当空'], stable: ['恒纪元', 'stable', '昼夜交替有序'], dawnStable: ['恒纪元', 'stable', '太阳重新按时升起'], chaosHeat: ['乱纪元', 'chaos', '巨日'], chaosCold: ['乱纪元', 'night', '长夜 · 严寒'] }[this.mode];
      UI.setEra(era[0], era[1], this.timeScale > 1 ? '⏩ 你已脱水 · 时间加速流逝' : era[2]);
      UI.setSunLine(this._sunLabel);
      UI.setTemp(this.temp);
      const vs = this.villagers;
      const alive = vs.filter(v => ['idle', 'walk', 'toShore'].includes(v.mode)).length;
      const dry = vs.filter(v => ['dehydrating', 'scroll', 'carried', 'flying', 'soaking', 'rehydrating'].includes(v.mode)).length;
      const stored = vs.filter(v => v.mode === 'stored').length;
      const dead = vs.filter(v => v.mode === 'dead' || v.mode === 'lost').length;
      UI.setStat(`族人 ${vs.length} 人<br>清醒 ${alive} · 脱水 ${dry + stored}（入仓 ${stored}）· 死亡 ${dead}` + (this.carry.length ? `<br>你携带着 ${this.carry.length} 卷纤维` : ''));
    }
    // 拾取提示
    if (this.flags.dehydrateOrdered && this.selfDryTarget === 0 && !this.flags.canSoak) {
      const near = this.villagers.some(v => v.mode === 'scroll' && Math.hypot(v.root.position.x - pl.x, v.root.position.z - pl.z) < 3.2);
      const want = near ? '按 <kbd>E</kbd> 拾起纤维卷' : (this.selfDryTarget === 0 ? this.basePrompt : null) || null;
      if (want !== this._lastPrompt) { UI.prompt(want); this._lastPrompt = want; }
    }
  }

  dispose() {
    disposeTree(this.scene);
    this.game.audio.muffle(false);
  }
}
