import * as THREE from 'three';
import { UI } from '../core/ui.js';
import { wait, waitUntil, tween, clamp, lerp, smoothstep, rand, fbm2, easeInOut, easeOut, easeIn, disposeTree } from '../core/utils.js';
import { Sky, atmosphere, dirFromAzEl } from '../world/sky.js';
import { Terrain } from '../world/terrain.js';
import { Particles } from '../world/particles.js';
import { Army, DISP, FIELD } from '../world/army.js';
import { ThreeBodySim } from '../world/threebody.js';
import { QinShiHuang } from '../models/qin.js';
import { Humanoid } from '../models/humanoid.js';
import { FlagSoldier } from '../models/soldier.js';
import { buildPyramid, buildTripod, buildBanner } from '../models/structures.js';

const TOP = 80;               // 金字塔顶平台高度
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function heightAt(x, z) {
  const inX = Math.abs(x) - 3140, inZ = Math.max(140 - z, z - 6260);
  const d = Math.hypot(Math.max(inX, 0), Math.max(inZ, 0));
  const inside = inX < 0 && inZ < 0;
  if (inside) return -6;
  if (z < 140 && Math.abs(x) < 3200 && z > -200) { // 金字塔前后
    return z > 100 ? lerp(0, -6, smoothstep(100, 140, z) * smoothstep(3200, 3140, Math.abs(x))) : 0;
  }
  const r = Math.hypot(x, z - 3000);
  let h = lerp(-6, 0.1, smoothstep(0, 60, d)) + smoothstep(60, 400, d) * fbm2(x * 0.002, z * 0.002, 4) * 30;
  h += smoothstep(5200, 9500, r) * (Math.abs(fbm2(x * 0.0007 + 3, z * 0.0007, 5)) * 1500 + 200);
  return h;
}
function colorAt(x, z, h) {
  const n = fbm2(x * 0.01, z * 0.01, 3);
  const rock = smoothstep(80, 600, h);
  return [0.6 + n * 0.1, 0.46 + n * 0.08, 0.32 + n * 0.06].map((v, i) => lerp(v, [0.42, 0.38, 0.36][i], rock) * 1.7);
}

const GATES = [
  { id: 'AND', name: '与门', fn: (a, b) => a & b, say: '与门：两个入口都举黑旗，出口才举黑旗。' },
  { id: 'OR', name: '或门', fn: (a, b) => a | b, say: '或门：只要有一个入口举黑旗，出口就举黑旗。' },
  { id: 'XOR', name: '异或门', fn: (a, b) => a ^ b, say: '异或门：两个入口旗色不同，出口才举黑旗。' },
  { id: 'NAND', name: '与非门', fn: (a, b) => 1 - (a & b), say: '与非门：把与门的结果反过来。只用它，就能拼出任何一种计算。' },
];

export class QinScene {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.00008);
    this.cine = true;
    this.flags = {};
    this.liftT = 0;
    this.doomK = 0;
    this.bird = false;
    this.gate = { type: 0, a: 0, b: 0, out: 0, tries: 0 };
    this.atm = {};
    this.sunDir = dirFromAzEl(0.95, 0.5);
    this.light = { dir: new THREE.Vector3(), color: new THREE.Color(), intensity: 1, amb: new THREE.Color(), fogColor: new THREE.Color(), fogDensity: 0 };
    this.sim = new ThreeBodySim(0.012);
    this.trails = [[], [], []];
    this.progress = 0;
    this.steps = 0;
  }

  async init() {
    const S = this.scene, cam = this.game.engine.camera;
    cam.near = 0.5; cam.far = 40000; cam.updateProjectionMatrix();
    this.sky = new Sky();
    S.add(this.sky.mesh);
    this.terrain = new Terrain({ size: 22000, segs: 260, height: heightAt, color: colorAt, detailRepeat: 0.6 });
    S.add(this.terrain.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    S.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x403020, 0.8);
    S.add(this.hemi);

    // 金字塔
    this.pyramid = buildPyramid({ base: 170, height: TOP, levels: 10, top: 34, unit: 5 });
    S.add(this.pyramid);

    // 人列计算机
    this.army = new Army();
    this.army.u.uAssemble.value = 0.25;
    S.add(this.army.group);

    // 秦始皇
    this.qin = new QinShiHuang(26);
    this.qin.root.position.set(0, TOP, -9);
    S.add(this.qin.root);
    this.qinLight = new THREE.SpotLight(0xffe2c0, 11000, 140, 0.42, 0.7, 2);
    this.qinLight.position.set(0, TOP + 6, 48);
    this.qinLight.target.position.set(0, TOP + 40, -9);
    this.qinLight.castShadow = false;
    S.add(this.qinLight, this.qinLight.target);

    // 平台陈设：鼎、旌旗
    this.tripods = [[-13, -13], [13, -13], [-13, 13], [13, 13]].map(([x, z]) => {
      const t = buildTripod(1.3); t.position.set(x, TOP, z); S.add(t); return t;
    });
    this.banners = [];
    for (const [x, z] of [[-16.5, -16.5], [16.5, -16.5], [-16.5, 16.5], [16.5, 16.5], [-16.5, 0], [16.5, 0]]) {
      const b = buildBanner('秦', 20, 3.4, 8); b.position.set(x, TOP, z); b.rotation.y = x < 0 ? 0 : Math.PI; S.add(b); this.banners.push(b);
    }
    // 金字塔两侧的巨型旌旗
    for (const x of [-70, 70]) { const b = buildBanner('秦', 60, 9, 22); b.position.set(x, 0, 92); S.add(b); this.banners.push(b); }

    // 牛顿、冯·诺伊曼
    this.newton = new Humanoid({ style: 'coat', robe: '#4a3426', trim: '#2a1c12', inner: '#3a2a1e', skin: '#e0b898', hair: '#a8a298', hat: 'wig', iris: '#4a5a6a', face: { jaw: 0.72, nose: 1.35, cheek: 0.9, brow: 1.1, lips: 0.85, chin: 1.1, age: 0.6 } });
    this.newton.root.position.set(-4.6, TOP, 6.5);
    this.neumann = new Humanoid({ style: 'suit', robe: '#2c2e33', trim: '#1a1b1e', skin: '#e2b896', hair: '#2a2420', hat: 'none', face: { jaw: 0.9, cheek: 1.25, nose: 0.9, lips: 1.1, chin: 0.8, age: 0.3, w: 0.78 } });
    this.neumann.root.position.set(4.6, TOP, 6.5);
    for (const h of [this.newton, this.neumann]) { h.root.lookAt(0, TOP, 3); S.add(h.root); }

    // 逻辑门士兵
    this.gateSoldiers = [new FlagSoldier(1), new FlagSoldier(2), new FlagSoldier(3)];
    const gp = [[-2.6, 11], [2.6, 11], [0, 13.6]];
    this.gateSoldiers.forEach((s, i) => { s.root.position.set(gp[i][0], TOP, gp[i][1]); s.root.rotation.y = Math.PI; S.add(s.root); s.root.visible = false; });

    this.pfx = new Particles(3000, { additive: true });
    S.add(this.pfx.points);

    const fp = this.game.fp;
    fp.groundFn = () => TOP;
    fp.boundFn = p => { p.x = clamp(p.x, -15.5, 15.5); p.z = clamp(p.z, -2.5, 15.5); };
    this.drawDisplay('idle');
    this._applyLight(0);
  }

  /* ---------------- 天空与光照 ---------------- */
  _applyLight(dt) {
    const s = this.sky.suns, d = this.doomK;
    s[0].dir.copy(this.sunDir); s[0].size = 0.034; s[0].intensity = 1 * (1 - d * 0.3); s[0].color.setRGB(1, 0.92, 0.8);
    const main = d > 0.5 ? s[1].dir : this.sunDir;
    const a = atmosphere({ sunDir: main, sunInt: 1 + d * 0.5, heat: d * 0.9, extraLight: d * 2.5 }, this.atm);
    const u = this.sky.uniforms;
    u.uZenith.value.copy(a.zenith); u.uHorizon.value.copy(a.horizon); u.uGround.value.copy(a.ground);
    u.uStars.value = 0; u.uDust.value = 0.6 + d;
    this.scene.fog.color.copy(a.fog);
    this.scene.fog.density = lerp(0.00008, 0.00018, d);
    this.sun.color.copy(a.lightColor);
    this.sun.intensity = a.lightInt;
    this.sun.position.set(0, TOP, 0).addScaledVector(main, 400);
    this.sun.target.position.set(0, TOP, 0);
    this.hemi.color.copy(a.hemiSky); this.hemi.groundColor.copy(a.hemiGround); this.hemi.intensity = a.hemiInt + 0.2;
    this.game.engine.renderer.toneMappingExposure = lerp(1.0, 0.7, d);
    const L = this.light;
    L.dir.copy(main); L.color.copy(a.lightColor); L.intensity = a.lightInt;
    L.amb.copy(a.hemiSky).multiplyScalar(0.38 * (a.hemiInt + 0.2)).add(new THREE.Color(0.03, 0.025, 0.02));
    L.fogColor.copy(a.fog); L.fogDensity = this.scene.fog.density;
  }

  /* ---------------- 显示阵列（每个像素是一名士兵） ---------------- */
  drawDisplay(mode) {
    const g = this.army.dispCtx, W = DISP.W, H = DISP.H;
    const font = (s) => `900 ${s}px "Noto Serif SC", "SimHei", "Microsoft YaHei", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (mode === 'idle') { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    else if (mode === 'boot') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.font = font(58); g.fillText('秦一號', W / 2, H * 0.42);
      g.font = font(18); g.fillText('人列计算机 · 秦1.0', W / 2, H * 0.78);
    } else if (mode === 'orbit') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#fff'; g.lineWidth = 1;
      g.strokeRect(4, 4, W - 8, H - 30);
      const cx = W / 2, cy = (H - 26) / 2, sc = 46;
      this.trails.forEach(tr => {
        g.lineWidth = 2; g.beginPath();
        tr.forEach((p, i) => { const x = cx + p.x * sc, y = cy - p.y * sc; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      });
      g.fillStyle = '#fff';
      this.sim.b.forEach(b => { g.beginPath(); g.arc(cx + b.p.x * sc, cy - b.p.y * sc, 5, 0, 7); g.fill(); });
      g.fillRect(6, H - 20, (W - 12) * this.progress, 12);
      g.strokeRect(6, H - 20, W - 12, 12);
    } else if (mode === 'result') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.font = font(64); g.fillText('恒紀元', W / 2, H * 0.4);
      g.font = font(20); g.fillText('将持续很长时间', W / 2, H * 0.78);
    } else if (mode === 'chaos') {
      const img = g.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }
    this.army.refreshDisplay();
  }

  _terminal() {
    const p = this.progress;
    const lines = this._termLines || [];
    UI.terminal(`<div class="hd">秦一號 · 人列计算机</div>
      CPU（运算器/控制器）：约 1,200 万人<br>内存：约 1,500 万人 · 系统总线：轻骑兵<br>操作系统：秦1.0 · 渲染士兵 ${this.army.totalRendered.toLocaleString()} 名<br>
      ${lines.join('<br>')}
      <div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>三体运动方程数值积分：${(p * 100).toFixed(1)}% · 第 ${this.steps.toLocaleString()} 步`);
  }

  _gatePanel() {
    const G = GATES[this.gate.type], s = this.gate;
    const f = b => `<span class="flag f${b}"></span>${b ? '黑' : '白'}`;
    const rows = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => `<tr class="${a === s.a && b === s.b ? 'cur' : ''}"><td>${f(a)}</td><td>${f(b)}</td><td>${f(G.fn(a, b))}</td></tr>`).join('');
    UI.gate(`<h3>${G.name}</h3>
      <div class="tip">黑旗 = 1　白旗 = 0</div>
      <table><tr><th>入口一</th><th>入口二</th><th>出口</th></tr>${rows}</table>
      <div class="tip"><kbd>1</kbd> 切换入口一　<kbd>2</kbd> 切换入口二<br><kbd>Q</kbd> 换一种门${s.tries >= 4 ? '<br><kbd>Enter</kbd> 演示完毕，继续' : ''}</div>`);
  }
  _setGate() {
    const s = this.gate, G = GATES[s.type];
    this.gateSoldiers[0].setBit(s.a);
    this.gateSoldiers[1].setBit(s.b);
    const out = G.fn(s.a, s.b);
    wait(0.45).then(() => { if (this.gateSoldiers[2].bit !== out) this.game.audio.flagSnap(); this.gateSoldiers[2].setBit(out); });
    this._gatePanel();
  }

  onKey(code) {
    const s = this.gate;
    if (code === 'Space') UI.skip();
    if (this.flags.gateOn) {
      if (code === 'Digit1' || code === 'Numpad1') { s.a ^= 1; s.tries++; this.game.audio.flagSnap(); this._setGate(); }
      if (code === 'Digit2' || code === 'Numpad2') { s.b ^= 1; s.tries++; this.game.audio.flagSnap(); this._setGate(); }
      if (code === 'KeyQ' || code === 'Digit3') { s.type = (s.type + 1) % GATES.length; s.tries++; this._setGate(); UI.say('冯·诺伊曼', GATES[s.type].say, { who: 'neumann' }); }
      if (code === 'Enter' && s.tries >= 4) this.flags.gateDone = true;
    }
    if (code === 'Enter' && this.flags.canStart) this.flags.startPressed = true;
    if (code === 'Enter' && this.flags.canSkipCompute) this.flags.skipCompute = true;
    if (code === 'KeyV' && this.flags.canBird) this.toggleBird();
  }

  toggleBird() {
    this.bird = !this.bird;
    const fp = this.game.fp;
    if (this.bird) { this.cine = true; this.birdT = 0; UI.labels(this._labelList()); }
    else { this.cine = false; fp.setPose(V3(0, TOP, 4), Math.PI, -0.12); UI.labels([]); }
  }
  _labelList() {
    return [
      { pos: V3(0, 420, 3120), text: '中央处理器 CPU', sub: '一千二百万人' },
      { pos: V3(-330, 20, 3120), text: '运算器' }, { pos: V3(330, 20, 3120), text: '控制器' },
      { pos: V3(0, 20, 1400), text: '系统总线', sub: '轻骑兵往来传递信号' },
      { pos: V3(-1900, 20, 2200), text: '内存' }, { pos: V3(1900, 20, 4300), text: '内存' },
      { pos: V3(-2880, 20, 5300), text: '外存' }, { pos: V3(2880, 20, 900), text: '外存' },
      { pos: V3(0, 20, 340), text: '显示阵列' },
      { pos: V3(0, TOP + 52, -9), text: '秦始皇' },
    ];
  }

  /* ---------------- 镜头 ---------------- */
  _cam(pos, look) { const c = this.game.engine.camera; c.position.copy(pos); c.lookAt(look); }
  async camPath(pts, looks, dur, ease = easeInOut) {
    const cp = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), cl = new THREE.CatmullRomCurve3(looks, false, 'centripetal');
    const p = new THREE.Vector3(), l = new THREE.Vector3();
    await tween(dur, k => { cp.getPoint(k, p); cl.getPoint(k, l); this._cam(p, l); }, ease);
  }
  toPlayer(yaw = Math.PI, pitch = -0.05) {
    const fp = this.game.fp;
    fp.setPose(V3(0, TOP, 3.2), yaw, pitch);
    this.cine = false;
    fp.enabled = true; fp.look = true;
  }

  /* ---------------- 剧情 ---------------- */
  async start() {
    const g = this.game, A = this.army, Q = this.qin, au = g.audio;
    const sayQ = t => UI.say('秦始皇', t, { who: 'qin' });
    const sayN = t => { this.newton.gesture = 1; return UI.say('牛顿', t, { who: 'newton' }).then(() => (this.newton.gesture = 0)); };
    const sayV = t => { this.neumann.gesture = 1; return UI.say('冯·诺伊曼', t, { who: 'neumann' }).then(() => (this.neumann.gesture = 0)); };
    UI.setCiv(`三体 · 第 <b>${g.civ}</b> 号文明 · 战国时期`);
    UI.setEra('恒纪元', 'stable', '天下一统');
    UI.setTemp(null);
    UI.setKeys([['空格', '跳过对白']]);
    au.setWind(0.35); au.setDrone(0.45, [55, 65.4, 82.4, 98]);
    g.fp.enabled = false; g.fp.look = false;
    this._cam(V3(0, 2600, 5600), V3(0, 0, 2600));

    // 开场：鸟瞰三千万大军
    tween(14, k => (A.u.uAssemble.value = lerp(0.25, 1, k)), easeOut);
    const drums = setInterval(() => au.drum(0.8), 700);
    this._drums = drums;
    UI.card('第二章 · 人列计算机', '秦始皇统一了三体世界。三千万大军列阵于金字塔之下', 4.5);
    await this.camPath([V3(0, 2600, 5600), V3(-500, 1500, 3000), V3(-200, 520, 900), V3(0, 260, 420)],
      [V3(0, 0, 2600), V3(0, 0, 1800), V3(0, 40, 300), V3(0, 70, 0)], 13);
    clearInterval(drums);
    au.gong(55); au.boom(0.6);
    g.engine.shake = 0.15; tween(2, k => (g.engine.shake = 0.15 * (1 - k)));
    // 秦始皇登场
    await this.camPath([V3(0, 260, 420), V3(30, 160, 150), V3(18, 118, 52)],
      [V3(0, 70, 0), V3(0, 110, -9), V3(0, TOP + 43, -9)], 7);
    Q.lookTarget = this.game.engine.camera.position.clone();
    await sayQ('朕听说，你们能算出太阳的运行。');
    await this.camPath([V3(18, 118, 52), V3(-10, 96, 26), V3(-6, TOP + 4, 12)],
      [V3(0, TOP + 43, -9), V3(0, TOP + 20, -4), V3(0, TOP + 2, 6)], 5);
    Q.lookTarget = V3(0, TOP + 1.7, 3.2);
    this.toPlayer(0.0, 0.35); // 先回头看见秦始皇
    UI.setKeys([['鼠标', '环顾'], ['W A S D', '在平台上走动'], ['空格', '跳过对白']]);
    await sayN('陛下，我已经找到了天体运动的规律，写成了微分方程。可要解出它，需要海量的计算。');
    await sayV('计算可以交给人来完成。陛下，请给我三名士兵，我演示给您看。');
    await sayQ('准。');
    UI.hideSay();

    // 逻辑门演示
    this.gateSoldiers.forEach(s => (s.root.visible = true));
    g.fp.yaw = Math.PI; g.fp.pitch = -0.12;
    au.drum(1);
    UI.marker(V3(0, TOP + 3.5, 12), '三名士兵');
    await wait(0.6);
    await sayV('每个士兵手里有一面黑旗、一面白旗。黑旗代表 1，白旗代表 0。');
    await sayV('左右两人是入口，前面那人是出口。出口只看两个入口的旗，按规矩举旗——这就是一个"门"。');
    UI.marker(null);
    this.flags.gateOn = true;
    this._setGate();
    UI.setObjective('操控入口士兵，观察出口如何举旗');
    UI.setKeys([['1', '入口一换旗'], ['2', '入口二换旗'], ['Q', '换一种门'], ['Enter', '继续（尝试几次后）']]);
    UI.say('冯·诺伊曼', GATES[0].say, { who: 'neumann' });
    await waitUntil(() => this.flags.gateDone);
    this.flags.gateOn = false;
    UI.gate(null); UI.setObjective('');
    UI.setKeys([['空格', '跳过对白']]);
    await sayV('把千千万万个这样的门组合起来，就是一台计算机。');
    await sayQ('朕给你三千万人。组阵！');
    UI.hideSay();

    // 组阵
    au.gong(50);
    this.cine = true;
    const startCam = g.engine.camera.position.clone();
    const dr2 = setInterval(() => au.drum(1), 520);
    tween(16, k => (A.u.uLayout.value = k), easeInOut);
    au.setFlutter(0.4);
    this.camPath([startCam, V3(-300, 420, 120), V3(-1500, 1700, 300), V3(-2200, 2600, 1400)],
      [V3(0, TOP, 30), V3(0, 0, 900), V3(0, 0, 2400), V3(0, 0, 3000)], 14).then(() => (this.flags.camDone = true));
    await wait(6);
    UI.labels(this._labelList());
    await sayV('正中央是中央处理器：左边是运算器，右边是控制器。');
    await sayV('环绕它的是系统总线，由轻骑兵在各部件之间传递信号。');
    await sayV('两侧的方阵是内存，最外面一圈是外存。金字塔脚下那片，是显示阵列。');
    await waitUntil(() => this.flags.camDone);
    clearInterval(dr2);
    await this.camPath([V3(-2200, 2600, 1400), V3(-600, 600, 300), V3(0, TOP + 8, -6)],
      [V3(0, 0, 3000), V3(0, 0, 600), V3(0, TOP - 10, 200)], 8);
    UI.labels([]);
    this.gateSoldiers.forEach(s => (s.root.visible = false));
    this.toPlayer(Math.PI, -0.12);
    await sayV('陛下，计算机组装完毕，请下令启动。');
    UI.hideSay();
    this.flags.canStart = true;
    UI.prompt('按 <kbd>Enter</kbd> 让秦始皇下令：启动！');
    UI.setKeys([['Enter', '启动计算机'], ['鼠标', '环顾']]);
    await waitUntil(() => this.flags.startPressed);
    this.flags.canStart = false;
    UI.prompt(null);
    UI.setKeys([['空格', '跳过对白']]);

    // 启动
    this.cine = true;
    Q.setPose(1);
    Q.lookTarget = V3(0, TOP + 120, 200);
    await this.camPath([V3(0, TOP + 1.7, 3.2), V3(12, TOP + 3, 22), V3(16, TOP + 2, 30)],
      [V3(0, TOP + 20, 0), V3(0, TOP + 40, -9), V3(0, TOP + 52, -9)], 3);
    au.gong(45); au.boom(1);
    g.engine.shake = 0.25; tween(2.5, k => (g.engine.shake = 0.25 * (1 - k)));
    await sayQ('计算机——启动！');
    UI.hideSay();
    A.u.uCompute.value = 1;
    A.u.uDispOn.value = 1;
    this.drawDisplay('boot');
    tween(14, k => (A.u.uWave.value = k * 9500), t => t);
    au.setFlutter(1);
    au.chord([110, 164.8, 220, 277.2], 9, 0.05, 'sawtooth');
    this._termLines = ['<span class="ok">▶ 自检完成，系统总线通畅</span>', '▶ 载入：三体运动微分方程组'];
    this.computing = true;
    await this.camPath([V3(16, TOP + 2, 30), V3(-60, 160, 200), V3(-260, 220, 900)],
      [V3(0, TOP + 52, -9), V3(0, 0, 500), V3(0, 0, 2600)], 8);
    await this.camPath([V3(-260, 220, 900), V3(-80, 140, 120), V3(0, TOP + 8, -4)],
      [V3(0, 0, 2600), V3(0, 0, 400), V3(0, TOP - 30, 300)], 6);
    this.toPlayer(Math.PI, -0.25);
    Q.setPose(2);
    Q.lookTarget = V3(0, 0, 900);
    this.flags.canBird = true;
    UI.setObjective('观看三千万人的计算 · 显示阵列上正在描绘三颗太阳的轨道');
    UI.setKeys([['V', '切换鸟瞰'], ['W A S D', '走动'], ['鼠标', '环顾'], ['Enter', '跳过计算（20 秒后）']]);
    wait(20).then(() => { this.flags.canSkipCompute = true; });
    await wait(4);
    await sayN('看，它在一步步求解三颗太阳的运动！');
    await wait(5);
    this._termLines.push('▶ 积分步长 1/86400 天，数值稳定');
    await sayV('每一秒，三千万人都在完成上万次运算。这是三体世界有史以来最强大的计算机。');
    UI.hideSay();
    await Promise.race([waitUntil(() => this.progress >= 1), waitUntil(() => this.flags.skipCompute)]);
    this.progress = 1;
    this.flags.canSkipCompute = false; this.flags.canBird = false;
    if (this.bird) this.toggleBird();
    this.computing = false;
    this._termLines.push('<span class="ok">▶ 计算完成：未来将出现漫长的恒纪元</span>');
    this._terminal();
    this.drawDisplay('result');
    UI.setObjective('');
    au.chord([261.6, 329.6, 392, 523.3], 6, 0.06);
    await sayN('结果出来了！未来将是一段漫长的恒纪元！');
    Q.setPose(1);
    Q.lookTarget = V3(0, TOP + 1.7, 3.2);
    await sayQ('好！大秦的基业，将万世不衰。');
    UI.hideSay();
    Q.setPose(0);
    await wait(2.5);

    // 三颗飞星
    this.flags.doom = true;
    au.setDrone(0.6, [55, 58.3, 77.8, 82.4]);
    au.chord([233, 246.9, 311, 329.6], 10, 0.05, 'sawtooth');
    this.flyT = 0;
    UI.setEra('???', 'chaos', '天空出现异常');
    await wait(3.5);
    await sayV('等等……天上那是什么？三颗……飞星？');
    await sayN('不可能！计算里根本没有这种情况……');
    Q.lookTarget = V3(0, TOP + 600, 900);
    await wait(5.5);
    // 三日凌空
    UI.setEra('三日凌空', 'chaos', '三颗太阳同时出现');
    au.alarm(); au.boom(1.2);
    await wait(2.5);
    this.drawDisplay('chaos');
    this._termLines.push('<span class="warn">▶ 错误：引力异常 · 总线中断 · 士兵离地</span>');
    this._terminal();
    this.liftT = 0.001;
    wait(3).then(() => UI.terminal(null));
    this.cine = true;
    this.liftCamStart = g.engine.camera.position.clone();
    this.liftYaw = g.fp.yaw; this.liftPitch = g.fp.pitch;
    UI.say('', '三颗太阳的引力叠加在一起，大地上的一切都失去了重量……', { who: 'sys' });
    au.setHeat(1); au.setFlutter(0.3); au.setWind(1);
    await wait(15);
    au.boom(1.5);
    await tween(2.5, k => (g.engine.fx.uFlash.value = k), easeIn);
    UI.hideSay();
    au.silenceAll();
    await wait(1);
    g.showEnding({
      e1: `第 ${g.civ} 号文明，毁灭于三日凌空。<br>该文明进化至战国层次。`,
      e2: '长夜过后，生命的种子会在这片大地上重新萌发，<br>文明将再一次启动，在三体世界无法预测的命运中继续进化。',
      e3: `感谢 ${g.playerId} 的参与 · 欢迎您再次登录`,
    });
  }

  /* ---------------- 每帧 ---------------- */
  update(dt, t) {
    const g = this.game, A = this.army, Q = this.qin, cam = g.engine.camera;
    // 末日：飞星 → 三日连珠
    if (this.flags.doom) {
      this.flyT += dt;
      const ft = this.flyT;
      const conv = smoothstep(2, 9, ft);
      const sunK = smoothstep(8, 13, ft);
      for (let i = 0; i < 3; i++) {
        const az0 = [-0.9, 0.15, 1.0][i], el0 = [0.35, 0.75, 0.25][i];
        const az = lerp(az0, (i - 1) * 0.34, conv) + Math.sin(ft * 0.7 + i) * 0.04 * (1 - conv);
        const el = lerp(el0, 0.58 - Math.abs(i - 1) * 0.05, conv);
        dirFromAzEl(az, el, this.sky.fly[i].dir);
        this.sky.fly[i].intensity = smoothstep(0, 2, ft) * (1 - sunK) * 1.4;
        const s = this.sky.suns[i];
        if (i > 0) { s.dir.copy(this.sky.fly[i].dir); s.size = lerp(0.006, 0.05, sunK); s.intensity = sunK * 1.5; s.color.setRGB(1, 0.8, 0.55); }
      }
      if (sunK > 0) {
        // 第三颗也变为太阳：把 sun[0] 移到中间
        const s0 = this.sky.suns[0];
        this.sunDir.lerp(this.sky.fly[0].dir, Math.min(1, dt * 1.5 * sunK)).normalize();
        s0.size = lerp(0.034, 0.05, sunK);
      }
      this.doomK = sunK;
      g.engine.fx.uHaze.value = sunK;
      g.engine.bloom.strength = lerp(0.6, 0.22, sunK);
      g.engine.fx.uAberr.value = 0.0025 + sunK * 0.004;
      if (sunK > 0.3 && this.liftT === 0) g.engine.shake = 0.06 * sunK;
    }
    this._applyLight(dt);
    if (this.flags.doom && this.doomK > 0) {
      const s0 = this.sky.suns[0];
      s0.size = lerp(0.034, 0.05, this.doomK); s0.intensity = 1 + this.doomK * 0.5; s0.color.setRGB(1, 0.8, 0.55);
    }
    this.sky.update(cam, t);
    this.terrain.heat = smoothstep(0.4, 1, this.doomK) * 0.8;
    this.terrain.tick(t);

    // 三体模拟（显示阵列）
    if (this.computing) {
      this.sim.step(dt * 0.9, 12);
      this.sim.b.forEach((b, i) => { this.trails[i].push(b.p.clone()); if (this.trails[i].length > 220) this.trails[i].shift(); });
      this.progress = Math.min(1, this.progress + dt / 45);
      this.steps += Math.floor(dt * 86400 * (0.8 + Math.random() * 0.4));
      this._dispT = (this._dispT || 0) + dt;
      if (this._dispT > 0.12 && A.u.uWave.value > 400) { this._dispT = 0; this.drawDisplay('orbit'); }
      this._termT = (this._termT || 0) + dt;
      if (this._termT > 0.25) { this._termT = 0; this._terminal(); }
      if (!this._chaosNoted && this.progress > 0.35) { this._chaosNoted = true; this._termLines.push('▶ 检测到三体轨道进入混沌区，继续迭代……'); }
    }

    // 飞升
    if (this.liftT > 0) {
      this.liftT += dt;
      const L = this.liftT;
      A.u.uLift.value = L;
      g.engine.shake = 0.05 + 0.03 * Math.sin(L * 3);
      const up = (a, d) => 0.5 * a * Math.max(0, L - d) ** 2;
      Q.root.position.y = TOP + up(0.9, 6.5);
      Q.root.rotation.z = Math.max(0, L - 6.5) * 0.04;
      Q.root.rotation.x = -Math.max(0, L - 6.5) * 0.02;
      [this.newton, this.neumann, ...this.gateSoldiers].forEach((h, i) => {
        const r = h.root;
        r.position.y = TOP + up(1.4 + i * 0.2, 5 + i * 0.4);
        r.rotation.x += dt * Math.max(0, L - 5) * 0.1 * (i % 2 ? 1 : -1);
        r.rotation.z += dt * Math.max(0, L - 5) * 0.07;
      });
      this.tripods.forEach((tp, i) => { tp.position.y = TOP + up(1.1, 7 + i * 0.3); tp.rotation.x += dt * 0.2 * Math.max(0, L - 7); });
      // 镜头随之飘起，望向天空
      const c0 = this.liftCamStart;
      cam.position.set(c0.x + Math.sin(L * 0.3) * 0.5, c0.y + up(0.75, 7.5), c0.z);
      const pitch = lerp(this.liftPitch, 0.38, smoothstep(5, 13, L));
      const yaw = lerp(this.liftYaw, Math.PI, smoothstep(0, 6, L));
      cam.rotation.set(pitch, yaw + Math.sin(L * 0.2) * 0.15, smoothstep(8, 17, L) * 0.35, 'YXZ');
      if (Math.random() < 0.6) this.pfx.emit(cam.position.x + rand(-40, 40), cam.position.y - rand(5, 30), cam.position.z + rand(-40, 40), rand(-1, 1), rand(4, 10), rand(-1, 1), { life: 4, size: 0.4, color: [1, 0.6, 0.25] });
    }

    // 玩家 / 鸟瞰
    if (this.bird) {
      this.birdT += dt;
      const a = 2.3 + this.birdT * 0.04;
      this._cam(V3(Math.sin(a) * 3600, 2900, 3000 + Math.cos(a) * 3600), V3(0, 0, 2900));
    } else if (!this.cine) {
      g.fp.update(dt);
      Q.lookTarget = this.flags.doom ? Q.lookTarget : cam.position.clone();
    } else {
      g.input.consumeMouse();
    }

    // 角色动画
    Q.update(dt, t, this.flags.doom ? 2 : 1);
    for (const h of [this.newton, this.neumann]) {
      h.animate(dt, false);
      if (!this.liftT) { const p = h.root.position; h.root.rotation.y = Math.atan2(cam.position.x - p.x, cam.position.z - p.z); }
    }
    this.gateSoldiers.forEach(s => s.update(dt, t));
    this.tripods.forEach(tp => tp.userData.update(t, cam));
    this.banners.forEach(b => b.userData.update(t, this.flags.doom ? 2.2 : 1));
    this.pfx.update(dt);
    if (Math.random() < 0.5) {
      const tp = this.tripods[(Math.random() * 4) | 0];
      if (!this.liftT) this.pfx.emit(tp.position.x + rand(-0.6, 0.6), TOP + 4.5, tp.position.z + rand(-0.6, 0.6), rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), { life: 1.8, size: 0.12, color: [1, 0.55, 0.15] });
    }

    A.update(t, this.light);
    A.renderState(g.engine.renderer);
  }

  dispose() {
    clearInterval(this._drums);
    this.army.dispose();
    disposeTree(this.scene);
    UI.labels([]);
    const cam = this.game.engine.camera;
    cam.near = 0.1; cam.updateProjectionMatrix();
  }
}
