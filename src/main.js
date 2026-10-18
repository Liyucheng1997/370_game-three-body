import { Engine } from './core/engine.js';
import { Input, FirstPerson } from './core/input.js';
import { UI } from './core/ui.js';
import { AudioFX } from './core/audio.js';
import { Sched, wait } from './core/utils.js';
import { TitleScene } from './scenes/title.js';
import { PlainScene } from './scenes/plain.js';
import { QinScene } from './scenes/qin.js';

UI.init();
const engine = new Engine(document.getElementById('app'));
const input = new Input(engine.renderer.domElement);
const audio = new AudioFX();
const fp = new FirstPerson(engine.camera, input);

const SCENES = { title: TitleScene, plain: PlainScene, qin: QinScene };
const $ = id => document.getElementById(id);

const game = {
  engine, input, audio, fp, ui: UI,
  civ: Number(localStorage.getItem('tb.civ')) || 137,
  playerId: '海人',
  scene: null,
  sceneName: '',
  time: 0,
  busy: false,

  async goto(name) {
    if (this.busy) return;
    this.busy = true;
    input.exitLock();
    await UI.fade(1, 1.2);
    UI.clearAll();
    Sched.clear();
    audio.ok && audio.silenceAll();
    if (this.scene) this.scene.dispose();
    engine.resetFX();
    fp.enabled = false; fp.look = false; fp.roll = 0; fp.eyeOffset = 0;
    if (name === 'qin') this.civ = Math.max(this.civ, 184);
    const S = new SCENES[name](this);
    await S.init();
    this.scene = S; this.sceneName = name;
    engine.setScene(S.scene);
    input.active = name !== 'title';
    UI.showHUD(name !== 'title');
    // 预热一帧，避免着色器编译时卡顿出现在画面上
    S.update(0.016, this.time);
    engine.renderer.compile(S.scene, engine.camera);
    engine.render(0.016, this.time);
    await wait(0.2);
    UI.fade(0, 1.6);
    this.busy = false;
    S.start();
  },

  showEnding({ e1, e2, e3 }) {
    input.exitLock();
    input.active = false;
    const el = $('ending');
    el.querySelector('.e1').innerHTML = e1;
    el.querySelector('.e2').innerHTML = e2;
    el.querySelector('.e3').innerHTML = e3;
    el.classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    UI.showHUD(false);
    audio.chord([130.8, 196, 261.6, 329.6, 392], 12, 0.05);
  },
};
window.__game = game; // 便于调试

/* ---------- 标题界面 ---------- */
async function boot(chapter) {
  audio.init();
  UI.voice = $('opt-voice').checked;
  engine.setQuality($('opt-hq').checked);
  game.playerId = ($('pid').value || '海人').trim();
  $('title-screen').classList.add('hidden');
  const b = $('boot');
  b.classList.add('show');
  b.innerHTML = '';
  const lines = [
    'V 装具 ………………… 已连接',
    '感知同步 …………… 视觉 / 听觉 / 体感',
    `登录 ID …………… ${game.playerId}`,
    `正在载入 ………… 第 ${chapter === 'qin' ? Math.max(game.civ, 184) : game.civ} 号文明`,
    '',
  ];
  for (const l of lines) {
    b.innerHTML += l + '\n';
    audio.blip(1200 + Math.random() * 400, 0.04);
    await new Promise(r => setTimeout(r, 380));
  }
  b.innerHTML += '<span class="big">欢迎进入《三体》</span>';
  await new Promise(r => setTimeout(r, 1300));
  UI.fade(1, 0.01);
  b.classList.remove('show');
  game.goto(chapter);
}
document.querySelectorAll('[data-start]').forEach(btn => btn.addEventListener('click', () => boot(btn.dataset.start)));
$('relogin').addEventListener('click', () => {
  game.civ += 1 + Math.floor(Math.random() * 30);
  localStorage.setItem('tb.civ', String(game.civ));
  $('ending').classList.remove('show', 'on');
  engine.resetFX();
  game.goto('title').then(() => $('title-screen').classList.remove('hidden'));
});

input.on((code, e) => {
  if (game.scene && game.scene.onKey && !game.busy) game.scene.onKey(code, e);
});

/* ---------- 主循环 ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  if (window.__freeze) return;
  tick(dt);
}
// 调试：在后台标签页中手动推进 n 帧
window.__step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt, i === n - 1); last = performance.now(); };
function tick(dt, draw = true) {
  game.time += dt;
  Sched.update(dt);
  if (game.scene) game.scene.update(dt, game.time);
  UI.update(dt, engine.camera);
  if (draw) engine.render(dt, game.time);
}

requestAnimationFrame(frame);
game.goto('title');
if (location.search.includes('debug')) import('./debug.js');
