import * as THREE from 'three';

/* 通用 CPU 粒子池：蒸汽、余烬、雪、灰烬、水花、尘土 */
export class Particles {
  constructor(max = 3000, { additive = false, soft = 1 } = {}) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.c = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: innerHeight * 0.5 }, uSoft: { value: soft } },
      vertexShader: /* glsl */`
        attribute vec4 aCol; attribute float aSize; varying vec4 vCol; uniform float uScale;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = clamp(aSize * uScale / -mv.z, 0., 256.); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol; uniform float uSoft;
        void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if (r > .5) discard;
          float a = mix(1., smoothstep(.5, 0., r), uSoft); gl_FragColor = vec4(vCol.rgb, vCol.a * a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(x, y, z, vx, vy, vz, { life = 2, size = 0.3, grow = 0, color = [1, 1, 1], alpha = 1, gravity = 0, drag = 0 } = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.size0[i] = size; this.grow[i] = grow;
    this.grav[i] = gravity; this.drag[i] = drag; this.a0[i] = alpha;
    this.c[i * 3] = color[0]; this.c[i * 3 + 1] = color[1]; this.c[i * 3 + 2] = color[2];
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.c[i * 3 + k] = this.c[j * 3 + k]; }
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size0[i] = this.size0[j]; this.grow[i] = this.grow[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.a0[i] = this.a0[j];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this._kill(i); i--; continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= dr; this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt; this.v[i * 3 + 2] *= dr;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    const P = this.aPos.array, Cc = this.aCol.array, S = this.aSize.array;
    for (let i = 0; i < this.n; i++) {
      const k = this.life[i] / this.maxLife[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      Cc[i * 4] = this.c[i * 3]; Cc[i * 4 + 1] = this.c[i * 3 + 1]; Cc[i * 4 + 2] = this.c[i * 3 + 2];
      Cc[i * 4 + 3] = this.a0[i] * Math.min(1, k * 6) * (1 - k);
      S[i] = this.size0[i] * (1 + this.grow[i] * k);
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.points.material.uniforms.uScale.value = innerHeight * 0.6;
  }
}
