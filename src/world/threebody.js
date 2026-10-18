import * as THREE from 'three';

/* 真实的三体数值模拟（G = m = 1），从 8 字形周期解出发并加入扰动，最终走向混沌 */
export class ThreeBodySim {
  constructor(perturb = 0.02, threeD = false) {
    const p1 = new THREE.Vector3(0.97000436, -0.24308753, 0);
    const v3 = new THREE.Vector3(-0.93240737, -0.86473146, 0);
    this.b = [
      { p: p1.clone(), v: v3.clone().multiplyScalar(-0.5) },
      { p: p1.clone().negate(), v: v3.clone().multiplyScalar(-0.5) },
      { p: new THREE.Vector3(), v: v3.clone() },
    ];
    this.b[0].v.x += perturb; this.b[2].v.y -= perturb * 0.6;
    if (threeD) { this.b[0].v.z = perturb * 2; this.b[1].v.z = -perturb * 1.4; this.b[1].p.z = 0.05; }
    this.a = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.t = 0;
    this._acc();
  }
  _acc() {
    const d = new THREE.Vector3();
    this.a.forEach(a => a.set(0, 0, 0));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      d.subVectors(this.b[j].p, this.b[i].p);
      const r2 = d.lengthSq() + 0.0025, inv = 1 / (r2 * Math.sqrt(r2));
      this.a[i].addScaledVector(d, inv); this.a[j].addScaledVector(d, -inv);
    }
  }
  step(dt, sub = 8) {
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < 3; i++) { this.b[i].v.addScaledVector(this.a[i], h * 0.5); this.b[i].p.addScaledVector(this.b[i].v, h); }
      this._acc();
      for (let i = 0; i < 3; i++) this.b[i].v.addScaledVector(this.a[i], h * 0.5);
    }
    // 防止飞散：轻微拉回质心
    const c = new THREE.Vector3();
    this.b.forEach(b => c.add(b.p)); c.multiplyScalar(1 / 3);
    this.b.forEach(b => { b.p.sub(c); if (b.p.length() > 3.2) { b.v.multiplyScalar(0.98); b.v.addScaledVector(b.p, -0.002); } });
    this.t += dt;
  }
}
