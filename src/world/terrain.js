import * as THREE from 'three';
import { GLSL_NOISE, canvasTex, speckle, rand } from '../core/utils.js';

let _detailTex = null;
function detailTexture() {
  if (_detailTex) return _detailTex;
  _detailTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b8b0a6'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#8a8076', '#d8d0c6', '#6e655c', '#c9beb0'], 0.6, 2.6, 0.5);
    // 干裂纹
    g.strokeStyle = 'rgba(60,50,40,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 60; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rand(-22, 22); y += rand(-22, 22); g.lineTo(x, y); }
      g.stroke();
    }
    // 碎石
    for (let i = 0; i < 220; i++) {
      const k = rand(0, 1);
      g.fillStyle = `rgba(${70 + k * 60 | 0},${60 + k * 50 | 0},${50 + k * 40 | 0},.6)`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(1, 4), rand(1, 3), rand(0, 3), 0, Math.PI * 2); g.fill();
    }
  }, { repeat: [1, 1] });
  return _detailTex;
}

export class Terrain {
  /**
   * @param {object} o size, segs, height(x,z), color(x,z,h)->[r,g,b]
   */
  constructor({ size = 2400, segs = 300, height, color, detailRepeat = 1.6 }) {
    this.height = height;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = height(x, z);
      pos.setY(i, y);
      const c = color(x, z, y);
      cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // 细节纹理按世界坐标平铺
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * detailRepeat * 0.1, pos.getZ(i) * detailRepeat * 0.1);
    geo.computeVertexNormals();

    this.u = { uHeat: { value: 0 }, uFrost: { value: 0 }, uTime: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detailTexture() });
    mat.onBeforeCompile = s => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uHeat, uFrost, uTime;\n${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fm = smoothstep(.3, .75, vnoise(vWPos.xz * .12) * .7 + vnoise(vWPos.xz * 1.3) * .3);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, .4, .32), uHeat * .7);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .86, .95), uFrost * (.45 + .55 * fm));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float c1 = 1. - smoothstep(0., .05, abs(vnoise(vWPos.xz * .07) - .5));
          float c2 = 1. - smoothstep(0., .035, abs(vnoise(vWPos.xz * .29 + 7.) - .5));
          float cr = max(c1, c2 * .75);
          float hg = smoothstep(.45, 1., uHeat);
          totalEmissiveRadiance += vec3(1., .26, .04) * cr * cr * hg * (2.2 + .9 * sin(uTime * 1.7 + vWPos.x * .07 + vWPos.z * .05));
          totalEmissiveRadiance += vec3(.5, .12, .02) * hg * hg * .25;`);
    };
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }
  set heat(v) { this.u.uHeat.value = v; }
  set frost(v) { this.u.uFrost.value = v; }
  tick(t) { this.u.uTime.value = t; }
}
