import * as THREE from 'three';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

/* 角色语音参数（浏览器自带 TTS） */
const VOICES = {
  qin: { pitch: 0.15, rate: 0.78, volume: 1 },
  king: { pitch: 0.7, rate: 0.92 },
  newton: { pitch: 1.0, rate: 1.0 },
  neumann: { pitch: 1.25, rate: 1.05 },
  sys: { pitch: 1.1, rate: 1.0 },
  folk: { pitch: 1.3, rate: 1.05 },
};

export const UI = {
  voice: true,
  _say: null,
  _labels: [],
  _marker: null,

  init() {
    this.el = {
      hud: $('hud'), civ: $('civ'), obj: $('objective'), era: $('era'), sun: $('sunline'),
      tempbox: $('tempbox'), tempFill: $('temp-fill'), tempVal: $('temp-val'), stat: $('stat'),
      sub: $('subtitle'), speaker: document.querySelector('#subtitle .speaker'), text: document.querySelector('#subtitle .text'),
      prompt: $('prompt'), keys: $('keys'), marker: $('marker'), markerLabel: document.querySelector('#marker .mk-label'),
      labels: $('labels'), card: $('card'), cardT1: document.querySelector('#card .t1'), cardT2: document.querySelector('#card .t2'),
      fade: $('fade'), term: $('terminal'), gate: $('gatepanel'), boot: $('boot'),
    };
    this.zhVoice = null;
    if ('speechSynthesis' in window) {
      const pickVoice = () => {
        const vs = speechSynthesis.getVoices();
        this.zhVoice = vs.find(v => /zh[-_]CN/i.test(v.lang) && /Yunxi|Yunjian|Kangkang|male|男/i.test(v.name))
          || vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
      };
      pickVoice();
      speechSynthesis.onvoiceschanged = pickVoice;
    }
  },

  showHUD(on) { this.el.hud.classList.toggle('hidden', !on); },
  setCiv(html) { this.el.civ.innerHTML = html; },
  setObjective(text) { this.el.obj.innerHTML = text ? `<span class="t">目标</span>${text}` : ''; },
  setEra(text, cls = '', sub = '') { this.el.era.className = cls; this.el.era.innerHTML = text ? `${text}${sub ? `<small>${sub}</small>` : ''}` : ''; },
  setSunLine(t) { this.el.sun.textContent = t || ''; },
  setTemp(v) {
    if (v === null) { this.el.tempbox.classList.add('off'); return; }
    this.el.tempbox.classList.remove('off');
    const k = Math.max(0, Math.min(1, (v + 80) / 220));
    this.el.tempFill.style.width = (k * 100).toFixed(1) + '%';
    this.el.tempVal.textContent = `${v >= 0 ? '' : ''}${Math.round(v)}℃`;
    this.el.tempVal.style.color = v > 60 ? '#ff6a3d' : v < -20 ? '#9ab8ff' : '#fff';
  },
  setStat(html) { this.el.stat.innerHTML = html || ''; },
  setKeys(list) {
    this.el.keys.innerHTML = (list || []).map(([k, l]) => `<div>${l} ${k.split(' ').map(x => `<kbd>${x}</kbd>`).join('')}</div>`).join('');
  },
  prompt(html, urgent = false) {
    const p = this.el.prompt;
    if (!html) { p.classList.remove('show'); return; }
    p.innerHTML = html; p.classList.add('show'); p.classList.toggle('urgent', urgent);
  },

  speak(text, who) {
    if (!this.voice || !('speechSynthesis' in window)) return null;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[「」『』…—]/g, '，'));
      u.lang = 'zh-CN';
      if (this.zhVoice) u.voice = this.zhVoice;
      const v = VOICES[who] || VOICES.sys;
      u.pitch = v.pitch; u.rate = v.rate; u.volume = v.volume ?? 0.9;
      const st = { done: false };
      u.onend = u.onerror = () => (st.done = true);
      speechSynthesis.speak(u);
      return st;
    } catch (_) { return null; }
  },

  /* 对白：打字机效果，空格跳过；返回 Promise */
  say(speaker, text, opts = {}) {
    const { who = 'sys', cls = '', dur = null, hold = false } = opts;
    if (this._say) this._say.finish(true);
    const el = this.el;
    el.speaker.textContent = speaker || '';
    el.speaker.className = 'speaker ' + (cls || who);
    el.sub.className = 'show ' + (who === 'qin' ? 'qin' : '');
    el.text.textContent = '';
    const chars = [...text];
    const total = dur ?? (1.4 + chars.length * 0.2);
    const speech = this.speak(text, who);
    return new Promise(resolve => {
      const st = {
        t: 0, typed: false,
        tick: dt => {
          st.t += dt;
          const n = Math.min(chars.length, Math.floor(st.t * 26));
          if (!st.typed) { el.text.textContent = chars.slice(0, n).join(''); if (n >= chars.length) st.typed = true; }
          const speechDone = !speech || speech.done || st.t > total + 6;
          if (!hold && st.t >= total && speechDone) st.finish();
        },
        skip: () => { if (!st.typed) { st.typed = true; el.text.textContent = text; } else st.finish(); },
        finish: (silent) => {
          if (this._say !== st) return;
          this._say = null;
          if (speech && 'speechSynthesis' in window) speechSynthesis.cancel();
          el.text.textContent = text;
          resolve();
          if (!silent) {/* 保留字幕直到下一句或 hideSay */}
        },
      };
      this._say = st;
    });
  },
  skip() { if (this._say) this._say.skip(); },
  hideSay() { if (this._say) this._say.finish(true); this.el.sub.className = ''; },

  card(t1, t2 = '', dur = 4) {
    const c = this.el.card;
    this.el.cardT1.textContent = t1; this.el.cardT2.innerHTML = t2;
    c.classList.add('show');
    return new Promise(res => setTimeout(() => { c.classList.remove('show'); setTimeout(res, 1200); }, dur * 1000));
  },

  fade(to, dur = 1, color = '#000') {
    const f = this.el.fade;
    f.style.background = color;
    f.style.transitionDuration = dur + 's';
    // 强制回流使 transition 生效
    void f.offsetWidth;
    f.style.opacity = String(to);
    return new Promise(res => setTimeout(res, dur * 1000 + 30));
  },

  terminal(html) {
    const t = this.el.term;
    if (html === null) { t.classList.remove('show'); return; }
    t.innerHTML = html; t.classList.add('show');
  },
  gate(html) {
    const g = this.el.gate;
    if (html === null) { g.classList.remove('show'); return; }
    g.innerHTML = html; g.classList.add('show');
  },

  marker(pos, label = '') { this._marker = pos ? { pos, label } : null; this.el.markerLabel.textContent = label; },
  labels(list) {
    this._labels = list || [];
    this.el.labels.innerHTML = this._labels.map(l => `<div class="lbl">${l.text}${l.sub ? `<small>${l.sub}</small>` : ''}</div>`).join('');
    this._labelEls = [...this.el.labels.children];
  },

  update(dt, camera) {
    if (this._say) this._say.tick(dt);
    const W = innerWidth, H = innerHeight;
    const m = this.el.marker;
    if (this._marker) {
      _v.copy(this._marker.pos).project(camera);
      if (_v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2) {
        m.style.display = 'block';
        const d = camera.position.distanceTo(this._marker.pos);
        this.el.markerLabel.textContent = `${this._marker.label} · ${Math.round(d)}米`;
        m.style.left = ((_v.x * 0.5 + 0.5) * W) + 'px';
        m.style.top = ((-_v.y * 0.5 + 0.5) * H) + 'px';
      } else m.style.display = 'none';
    } else m.style.display = 'none';

    if (this._labels.length) {
      this._labels.forEach((l, i) => {
        const e = this._labelEls[i];
        _v.copy(l.pos).project(camera);
        if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
          e.style.display = 'block';
          e.style.left = ((_v.x * 0.5 + 0.5) * W) + 'px';
          e.style.top = ((-_v.y * 0.5 + 0.5) * H - 26) + 'px';
        } else e.style.display = 'none';
      });
    }
  },

  clearAll() {
    // 切换场景：丢弃正在等待的对白（不 resolve，旧剧本就此停止）
    if (this._say && 'speechSynthesis' in window) speechSynthesis.cancel();
    this._say = null;
    this.el.sub.className = ''; this.prompt(null); this.setObjective(''); this.setEra(''); this.setSunLine(''); this.setTemp(null);
    this.setStat(''); this.setKeys([]); this.terminal(null); this.gate(null); this.marker(null); this.labels([]);
  },
};
