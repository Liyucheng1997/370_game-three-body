import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* 最终画面处理：暗角、胶片颗粒、色差、脱水去色、热浪扭曲、闪白、虚拟现实故障 */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
    uAberr: { value: 0.0015 },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRed: { value: 0 },
    uFlash: { value: 0 },
    uGlitch: { value: 0 },
    uHaze: { value: 0 },
    uFrost: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAberr, uDesat, uRed, uFlash, uGlitch, uHaze, uFrost;
    uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uHaze > 0.0) uv.x += sin(uv.y*90. + uTime*6.) * 0.0018 * uHaze * smoothstep(0.75, 0.15, uv.y);
      if (uGlitch > 0.0) {
        float line = floor(uv.y * 48.);
        float g = step(1. - uGlitch*0.35, h(vec2(line, floor(uTime*24.))));
        uv.x += (h(vec2(line, uTime)) - .5) * 0.12 * g * uGlitch;
      }
      vec2 d = uv - .5; float r = length(d);
      float ab = uAberr + uGlitch*0.01;
      vec3 c;
      c.r = texture2D(tDiffuse, uv - d*ab*r*4.).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv + d*ab*r*4.).b;
      float l = dot(c, vec3(.299,.587,.114));
      c = mix(c, vec3(l) * vec3(1.0, .82, .6), uDesat);
      c *= uTint;
      c = mix(c, vec3(l*1.3 + .15, l*.35, l*.15), uRed*.65);
      if (uFrost > 0.0) { float e = smoothstep(.35, .75, r + h(uv*400.)*.08); c = mix(c, vec3(.85,.93,1.), e*uFrost*.75); }
      c *= 1. - uVignette * smoothstep(.25, .85, r);
      c += (h(uv*vec2(1733.,977.) + fract(uTime)*100.) - .5) * uGrain;
      c = mix(c, vec3(1.), clamp(uFlash,0.,1.));
      gl_FragColor = vec4(c, 1.);
    }`,
};

export class Engine {
  constructor(container) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer = r;
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    r.setPixelRatio(this.pixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 40000);
    this.camera.rotation.order = 'YXZ';
    this.scene = new THREE.Scene();

    const rt = new THREE.WebGLRenderTarget(Math.max(1, innerWidth * this.pixelRatio), Math.max(1, innerHeight * this.pixelRatio), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.55, 0.85);
    this.output = new OutputPass();
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.final);
    this.fx = this.final.uniforms;

    // 环境反射（让青铜、黄金、剑刃有光泽）
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
    addEventListener('resize', () => this.resize());
  }

  setQuality(hq) {
    this.pixelRatio = hq ? Math.min(window.devicePixelRatio, 1.5) : 0.85;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.resize();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(innerWidth, innerHeight);
  }

  setScene(scene) {
    this.scene = scene;
    if (!scene.environment) { scene.environment = this.envMap; scene.environmentIntensity = 0.35; }
    this.renderPass.scene = scene;
  }

  resetFX() {
    const f = this.fx;
    f.uVignette.value = 0.55; f.uGrain.value = 0.035; f.uAberr.value = 0.0015; f.uDesat.value = 0;
    f.uTint.value.setRGB(1, 1, 1); f.uRed.value = 0; f.uFlash.value = 0; f.uGlitch.value = 0; f.uHaze.value = 0; f.uFrost.value = 0;
    this.shake = 0;
    this.renderer.toneMappingExposure = 1.0;
  }

  render(dt, time) {
    this.fx.uTime.value = time;
    const cam = this.camera;
    if (this.shake > 0.0001) {
      const s = this.shake;
      this._shakeOff.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      cam.position.add(this._shakeOff);
      this.composer.render(dt);
      cam.position.sub(this._shakeOff);
    } else {
      this.composer.render(dt);
    }
  }
}
