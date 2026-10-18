// 仅在 URL 带 ?debug 时加载：方便在后台标签页里逐帧推进、跳转剧情、摆镜头
const g = window.__game;
const sleep = ms => new Promise(r => setTimeout(r, ms));
window.__boot = async (name) => {
  g.ui.voice = false;
  document.getElementById('title-screen').classList.add('hidden');
  for (let i = 0; i < 40 && g.busy; i++) { window.__step(2); await sleep(60); }
  g.goto(name);
  for (let i = 0; i < 150; i++) { window.__step(2); await sleep(80); if (g.sceneName === name && !g.busy) break; }
  const f = document.getElementById('fade'); f.style.transitionDuration = '0s'; f.style.opacity = '0';
  return g.sceneName;
};
window.__ff = async (n, cond, skip = true) => {
  for (let i = 0; i < n; i++) { if (skip) g.ui.skip(); window.__step(6); await sleep(0); if (cond && cond()) break; }
  window.__step(1);
};
window.__freeze = true;
window.__shot = (p, l) => {
  const S = g.scene; S.cine = true;
  g.engine.camera.position.set(...p); g.engine.camera.lookAt(...l);
  g.engine.render(0.016, g.time); g.engine.render(0.016, g.time);
};
window.__speaker = () => document.querySelector('#subtitle .speaker').textContent + '：' + document.querySelector('#subtitle .text').textContent;
