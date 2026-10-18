import * as THREE from 'three';
import { Sky } from '../world/sky.js';
import { ThreeBodySim } from '../world/threebody.js';
import { disposeTree } from '../core/utils.js';

/* 标题背景：三颗太阳的实时三体运动 */
export class TitleScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
  }
  async init() {
    const S = this.scene;
    this.sky = new Sky();
    const u = this.sky.uniforms;
    u.uZenith.value.setRGB(0.001, 0.0015, 0.005); u.uHorizon.value.setRGB(0.012, 0.008, 0.01); u.uGround.value.setRGB(0, 0, 0);
    u.uStars.value = 1.2; u.uDust.value = 0;
    S.add(this.sky.mesh);
    this.sim = new ThreeBodySim(0.03, true);
    const cols = [new THREE.Color(1.0, 0.6, 0.3), new THREE.Color(1.0, 0.9, 0.7), new THREE.Color(0.7, 0.8, 1.0)];
    this.bodies = cols.map(c => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 32, 16), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(6) }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.add(glow);
      S.add(m);
      const N = 900;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false;
      S.add(line);
      return { m, line, c, pts: [], N };
    });
    // 地平线上的三体星球剪影
    const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 1 }));
    planet.position.set(0, -42.2, 0);
    S.add(planet);
    this.pl = new THREE.PointLight(0xffaa66, 30, 0, 1.2);
    S.add(this.pl, new THREE.AmbientLight(0x221a18, 0.6));
    this.t = 0;
  }
  start() { this.game.engine.fx.uVignette.value = 0.9; }
  onKey() {}
  update(dt, t) {
    this.t += dt;
    const cam = this.game.engine.camera;
    const a = this.t * 0.05;
    cam.position.set(Math.sin(a) * 6.2 + 1.5, 0.9 + Math.sin(this.t * 0.07) * 0.3, Math.cos(a) * 6.2);
    cam.lookAt(0, 0.7, 0);
    cam.rotateY(innerWidth > innerHeight ? 0.42 : 0);
    this.sim.step(dt * 0.55, 10);
    const c = new THREE.Vector3();
    this.bodies.forEach((b, i) => {
      const p = this.sim.b[i].p;
      b.m.position.set(p.x * 1.6, p.z * 1.6 + 0.9, p.y * 1.6);
      b.pts.push(b.m.position.clone());
      if (b.pts.length > b.N) b.pts.shift();
      const pos = b.line.geometry.attributes.position.array, col = b.line.geometry.attributes.color.array;
      b.pts.forEach((q, k) => {
        pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
        const f = (k / b.pts.length) ** 2 * 1.6;
        col[k * 3] = b.c.r * f; col[k * 3 + 1] = b.c.g * f; col[k * 3 + 2] = b.c.b * f;
      });
      b.line.geometry.setDrawRange(0, b.pts.length);
      b.line.geometry.attributes.position.needsUpdate = true;
      b.line.geometry.attributes.color.needsUpdate = true;
      c.add(b.m.position);
    });
    this.pl.position.copy(c.multiplyScalar(1 / 3));
    this.sky.update(cam, t);
  }
  dispose() { disposeTree(this.scene); }
}
