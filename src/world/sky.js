import * as THREE from 'three';
import { GLSL_NOISE, clamp, smoothstep, lerp } from '../core/utils.js';

const vert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const frag = /* glsl */`
uniform vec3 uZenith, uHorizon, uGround;
uniform float uStars, uTime, uDust;
uniform vec3 uSunDir[3]; uniform vec3 uSunCol[3]; uniform float uSunSize[3]; uniform float uSunInt[3];
uniform vec4 uFly[4];
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0., 1.), 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.09, h));
  col += uHorizon * uDust * exp(-abs(h) * 14.) * 0.35;

  // 星空 + 银河
  if (uStars > 0.001 && h > -0.06) {
    float vis = uStars * smoothstep(-0.06, 0.12, h);
    vec3 sd = d * 230.;
    vec3 id = floor(sd); vec3 f = fract(sd) - .5;
    float r = hash13(id);
    if (r > 0.982) {
      vec3 off = (vec3(hash13(id + 1.7), hash13(id + 2.3), hash13(id + 3.1)) - .5) * .55;
      float dd = length(f - off);
      float tw = .65 + .35 * sin(uTime * (1.5 + r * 6.) + r * 200.);
      float b = smoothstep(.22, 0., dd) * pow((r - .982) / .018, 2.) * tw;
      vec3 sc = mix(vec3(.75, .85, 1.), vec3(1., .85, .7), hash13(id + 9.));
      col += sc * b * 2.2 * vis;
    }
    vec3 gal = normalize(vec3(.35, .55, .76));
    float band = exp(-pow(dot(d, gal), 2.) * 22.);
    float neb = fbm(vec2(atan(d.z, d.x) * 3., d.y * 6.) + 3.);
    col += vec3(.35, .32, .45) * band * neb * .18 * vis;
  }

  // 太阳（最多三颗）
  for (int i = 0; i < 3; i++) {
    if (uSunInt[i] <= 0.0) continue;
    float ang = acos(clamp(dot(d, uSunDir[i]), -1., 1.));
    float sz = uSunSize[i];
    float disc = 1. - smoothstep(sz * .9, sz, ang);
    vec3 sdn = uSunDir[i];
    vec3 tg = normalize(cross(sdn, vec3(0., 1., .001)));
    vec3 bt = cross(sdn, tg);
    vec2 sp = vec2(dot(d, tg), dot(d, bt)) / sz;
    float big = smoothstep(.05, .2, sz);
    float gran = vnoise(sp * 7. + uTime * .25) * .55 + vnoise(sp * 19. - uTime * .4) * .45;
    float rr = clamp(ang / sz, 0., 1.);
    float limb = mix(1., .5, rr * rr) * mix(1., .65 + .7 * gran, big);
    vec3 sc = uSunCol[i] * uSunInt[i];
    col += sc * disc * limb * mix(7., .75, big);
    float g1 = exp(-ang / (mix(sz * 1.4, .05, big) + .015)) * mix(1.1, .25, big);
    col += sc * (g1 + exp(-ang * 4.) * mix(.3, .12, big) + exp(-ang * 1.3) * .05);
    // 巨日的日冕：翻卷的日珥
    float cor = exp(-max(ang - sz, 0.) / (sz * .12)) * (1. - disc);
    float flare = vnoise(vec2(atan(sp.y, sp.x) * 4., uTime * .4)) * vnoise(sp * 5. - uTime * .3);
    col += sc * big * cor * (.35 + 1.4 * flare) * vec3(1., .55, .25);
  }
  // 飞星（遥远的太阳）
  for (int i = 0; i < 4; i++) {
    if (uFly[i].w <= 0.) continue;
    float ang = acos(clamp(dot(d, normalize(uFly[i].xyz)), -1., 1.));
    col += vec3(1., .95, .88) * uFly[i].w * (smoothstep(.004, 0., ang) * 14. + exp(-ang * 140.) * 1.6 + exp(-ang * 25.) * .07);
  }
  gl_FragColor = vec4(col, 1.);
}`;

export class Sky {
  constructor() {
    this.suns = [0, 1, 2].map(() => ({ dir: new THREE.Vector3(0, 1, 0), size: 0.03, intensity: 0, color: new THREE.Color(1, 0.95, 0.85) }));
    this.fly = [0, 1, 2, 3].map(() => ({ dir: new THREE.Vector3(0, 1, 0), intensity: 0 }));
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uStars: { value: 0 }, uTime: { value: 0 }, uDust: { value: 0.5 },
      uSunDir: { value: this.suns.map(s => s.dir) }, uSunCol: { value: this.suns.map(s => s.color) },
      uSunSize: { value: [0.03, 0.03, 0.03] }, uSunInt: { value: [0, 0, 0] },
      uFly: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
  update(camera, time) {
    const u = this.uniforms;
    this.mesh.position.copy(camera.position);
    u.uTime.value = time;
    this.suns.forEach((s, i) => { u.uSunSize.value[i] = s.size; u.uSunInt.value[i] = s.intensity; });
    this.fly.forEach((f, i) => u.uFly.value[i].set(f.dir.x, f.dir.y, f.dir.z, f.intensity));
  }
}

export function dirFromAzEl(az, el, out = new THREE.Vector3()) {
  // az: 0=+z(南) 90=+x(东) 180=-z(北)；el: 仰角（弧度）
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

/* 根据太阳状态推导天空与光照参数（线性色彩） */
const C = (r, g, b) => new THREE.Color(r, g, b);
const NZ = C(0.002, 0.003, 0.010), DZ = C(0.09, 0.2, 0.48), HZ = C(0.2, 0.06, 0.015), CZ = C(0.03, 0.06, 0.14);
const NH = C(0.008, 0.01, 0.02), DH = C(0.55, 0.5, 0.44), SH = C(0.95, 0.42, 0.14), HH = C(0.85, 0.3, 0.08), CH = C(0.25, 0.3, 0.38);
export function atmosphere({ sunDir, sunInt = 1, heat = 0, cold = 0, extraLight = 0 }, out = {}) {
  const el = sunDir.y;
  const day = clamp(smoothstep(-0.14, 0.32, el) * Math.min(1.4, sunInt), 0, 1.4);
  const dayK = Math.min(1, day);
  const sunset = (1 - smoothstep(0.0, 0.38, el)) * smoothstep(-0.2, 0.02, el) * Math.min(1, sunInt);
  out.zenith = (out.zenith || new THREE.Color()).copy(NZ).lerp(DZ, dayK).lerp(HZ, heat * dayK).lerp(CZ, cold * 0.4 * dayK);
  out.horizon = (out.horizon || new THREE.Color()).copy(NH).lerp(DH, dayK).lerp(SH, sunset * 0.75).lerp(HH, heat * dayK).lerp(CH, cold * 0.5 * dayK);
  out.ground = (out.ground || new THREE.Color()).copy(out.horizon).multiplyScalar(0.35);
  out.fog = (out.fog || new THREE.Color()).copy(out.horizon).multiplyScalar(0.85);
  out.lightColor = (out.lightColor || new THREE.Color()).setRGB(1, 0.93, 0.82).lerp(C(1, 0.55, 0.25), sunset * 0.8).lerp(C(1, 0.62, 0.38), heat * 0.6);
  out.lightInt = 3.2 * smoothstep(-0.04, 0.2, el) * Math.min(1.5, sunInt) + extraLight;
  out.hemiSky = (out.hemiSky || new THREE.Color()).copy(out.zenith).lerp(out.horizon, 0.4).multiplyScalar(2.2).add(C(0.012, 0.016, 0.03));
  out.hemiGround = (out.hemiGround || new THREE.Color()).setRGB(0.16, 0.11, 0.08).multiplyScalar(0.25 + dayK);
  out.hemiInt = lerp(0.35, 1.0, dayK);
  out.stars = 1 - smoothstep(-0.05, 0.22, el * Math.min(1, sunInt) + (sunInt < 0.05 ? -1 : 0));
  out.day = day;
  return out;
}
