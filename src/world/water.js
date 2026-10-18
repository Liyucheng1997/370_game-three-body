import * as THREE from 'three';
import { GLSL_NOISE } from '../core/utils.js';

/* 湖面：菲涅尔反射天空 + 太阳高光 + 涟漪 + 结冰/沸腾 */
export class Lake {
  constructor(radius = 26, y = -0.6) {
    this.ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
    this._ri = 0;
    this.u = {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFreeze: { value: 0 }, uBoil: { value: 0 },
      uRip: { value: this.ripples }, uR: { value: radius }, uCenter: { value: new THREE.Vector2() },
      fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true,
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uFreeze, uBoil, uR, fogDensity; uniform vec2 uCenter; uniform vec3 uSunDir, uSunCol, uSky, uHorizon, fogColor; uniform vec4 uRip[8];
        varying vec3 vW;
        ${GLSL_NOISE}
        void main(){
          vec2 p = vW.xz;
          float e = .15;
          float h0 = fbm(p*.25 + uTime*.15) + fbm(p*.6 - uTime*.2)*.5;
          float hx = fbm((p+vec2(e,0.))*.25 + uTime*.15) + fbm((p+vec2(e,0.))*.6 - uTime*.2)*.5;
          float hz = fbm((p+vec2(0.,e))*.25 + uTime*.15) + fbm((p+vec2(0.,e))*.6 - uTime*.2)*.5;
          vec3 n = normalize(vec3((h0-hx)*1.6, 1., (h0-hz)*1.6));
          for (int i=0;i<8;i++){
            float age = uTime - uRip[i].z;
            if (age < 0. || age > 4.) continue;
            vec2 dd = p - uRip[i].xy; float r = length(dd);
            float ring = sin((r - age*3.)*6.) * exp(-abs(r - age*3.)*1.5) * (1. - age/4.);
            n.xz += normalize(dd+1e-4) * ring * .35;
          }
          n = normalize(n);
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1. - max(dot(n, v), 0.), 4.) * .85 + .1;
          vec3 deep = vec3(.01,.03,.04);
          vec3 refl = mix(uHorizon, uSky, clamp(reflect(-v, n).y*2., 0., 1.));
          vec3 col = mix(deep, refl, fr);
          vec3 hv = normalize(uSunDir + v);
          col += uSunCol * pow(max(dot(n, hv), 0.), 220.) * 6. * step(0., uSunDir.y);
          // 结冰
          float ice = vnoise(p*.8)*.5 + vnoise(p*3.)*.5;
          col = mix(col, vec3(.55,.62,.7) * (.6 + .4*ice) * (uSunCol*.3 + .4), uFreeze);
          // 沸腾的蒸汽泡
          col += vec3(.6,.5,.4) * uBoil * smoothstep(.75, .95, vnoise(p*2. + uTime*3.)) * .4;
          float edge = smoothstep(uR, uR - 2.5, length(p - uCenter));
          float dist = length(cameraPosition - vW);
          float f = 1. - exp(-fogDensity*fogDensity*dist*dist);
          col = mix(col, fogColor, f);
          gl_FragColor = vec4(col, mix(.75, 1., uFreeze) * edge);
        }`,
    });
    const geo = new THREE.CircleGeometry(radius, 64);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = y;
    this.mesh.renderOrder = 1;
  }
  ripple(x, z, t) { this.ripples[this._ri].set(x, z, t, 1); this._ri = (this._ri + 1) % 8; }
  update(t, sky, sunDir, sunCol, fog) {
    this.u.uTime.value = t;
    this.u.uCenter.value.set(this.mesh.position.x, this.mesh.position.z);
    this.u.uSunDir.value.copy(sunDir);
    this.u.uSunCol.value.copy(sunCol);
    this.u.uSky.value.copy(sky.zenith);
    this.u.uHorizon.value.copy(sky.horizon);
    if (fog) { this.u.fogColor.value.copy(fog.color); this.u.fogDensity.value = fog.density; }
  }
}
