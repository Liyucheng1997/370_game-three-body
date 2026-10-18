/* 全部声音由 WebAudio 实时合成，不依赖任何音频文件 */
export class AudioFX {
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = C;
    this.master = C.createGain(); this.master.gain.value = 0.85;
    this.comp = C.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.ratio.value = 4;
    this.lp = C.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.bus = C.createGain();
    this.bus.connect(this.lp); this.lp.connect(this.comp); this.comp.connect(this.master); this.master.connect(C.destination);

    this.white = this._buf(3, () => Math.random() * 2 - 1);
    let last = 0;
    this.brown = this._buf(4, () => { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; return last * 3.5; });

    // 风
    this.wind = this._loop(this.brown, 'bandpass', 420, 0.7);
    const lfo = C.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = C.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(this.wind.f.frequency); lfo.start();
    // 灼热低频轰鸣
    this.heat = this._loop(this.brown, 'lowpass', 140, 0.8);
    // 旗帜猎猎声
    this.flag = this._loop(this.white, 'bandpass', 1900, 0.6);
    const am = C.createGain(); am.gain.value = 0.5;
    this.flag.g.disconnect(); this.flag.f.disconnect();
    this.flag.f.connect(am); am.connect(this.flag.g); this.flag.g.connect(this.bus);
    const amO = C.createOscillator(); amO.type = 'square'; amO.frequency.value = 13;
    const amG = C.createGain(); amG.gain.value = 0.45; amO.connect(amG); amG.connect(am.gain); amO.start();

    // 持续和声
    this.drone = { g: C.createGain(), f: C.createBiquadFilter(), osc: [] };
    this.drone.f.type = 'lowpass'; this.drone.f.frequency.value = 520; this.drone.g.gain.value = 0;
    this.drone.f.connect(this.drone.g); this.drone.g.connect(this.bus);
    [55, 82.4, 110, 164.8].forEach((fr, i) => {
      const o = C.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = fr; o.detune.value = (i - 1.5) * 7;
      const og = C.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(this.drone.f); o.start();
      this.drone.osc.push(o);
    });
  }
  get ok() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  _buf(sec, fn) {
    const C = this.ctx, b = C.createBuffer(1, C.sampleRate * sec, C.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i);
    return b;
  }
  _loop(buf, type, freq, Q) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
    const g = C.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.bus); s.start();
    return { s, f, g };
  }
  _ramp(param, v, t = 0.8) { if (!this.ctx) return; param.cancelScheduledValues(this.now); param.setTargetAtTime(v, this.now, t / 3); }

  setWind(v) { if (this.ok) this._ramp(this.wind.g.gain, v * 0.5); }
  setHeat(v) { if (this.ok) this._ramp(this.heat.g.gain, v * 0.9); }
  setFlutter(v) { if (this.ok) this._ramp(this.flag.g.gain, v * 0.25, 0.4); }
  setDrone(v, chord) {
    if (!this.ok) return;
    this._ramp(this.drone.g.gain, v * 0.22, 2);
    if (chord) chord.forEach((fr, i) => this.drone.osc[i] && this._ramp(this.drone.osc[i].frequency, fr, 3));
  }
  muffle(on) { if (this.ok) this._ramp(this.lp.frequency, on ? 380 : 20000, 0.6); }
  silenceAll() { this.setWind(0); this.setHeat(0); this.setFlutter(0); this.setDrone(0); }

  _env(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  _osc(type, freq, t0, dur, peak, a = 0.01, dest = this.bus) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); g.connect(dest);
    this._env(g, t0, a, peak, dur); o.start(t0); o.stop(t0 + a + dur + 0.05);
    return o;
  }
  _noise(t0, dur, type, freq, Q, peak, a = 0.005, buf = this.white) {
    const C = this.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = Q;
    s.connect(f); f.connect(g); g.connect(this.bus); this._env(g, t0, a, peak, dur);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + a + dur + 0.05);
    return f;
  }

  alarm() { // 低沉号角：乱纪元来临
    if (!this.ok) return; const t = this.now;
    for (let k = 0; k < 2; k++) {
      const t0 = t + k * 2.6;
      [110, 164.8, 220].forEach((fr, i) => {
        const o = this._osc('sawtooth', fr, t0, 2.0, 0.12 - i * 0.03, 0.4);
        o.frequency.linearRampToValueAtTime(fr * 0.97, t0 + 2.2);
      });
    }
  }
  gong(base = 62) {
    if (!this.ok) return; const t = this.now;
    [1, 1.47, 2.09, 2.76, 3.9, 5.3].forEach((m, i) => this._osc('sine', base * m, t, 7 - i, 0.32 / (i + 1), 0.005));
    this._noise(t, 0.4, 'bandpass', 900, 0.8, 0.25);
  }
  drum(v = 1) {
    if (!this.ok) return; const t = this.now;
    const o = this._osc('sine', 90, t, 0.55, 0.7 * v, 0.004);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    this._noise(t, 0.12, 'lowpass', 600, 0.5, 0.25 * v);
  }
  crackle(dur = 1.4) {
    if (!this.ok) return; const t = this.now;
    for (let i = 0; i < 26; i++) this._noise(t + Math.random() * dur, 0.03 + Math.random() * 0.05, 'highpass', 2500 + Math.random() * 3000, 1, 0.12);
    this._noise(t, dur, 'bandpass', 700, 0.6, 0.05, 0.3);
  }
  hiss(dur = 2) { if (this.ok) this._noise(this.now, dur, 'highpass', 4000, 0.5, 0.08, 0.3); }
  splash() {
    if (!this.ok) return; const t = this.now;
    const f = this._noise(t, 0.7, 'bandpass', 1800, 0.9, 0.35);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    this._noise(t + 0.05, 0.25, 'lowpass', 400, 0.7, 0.3);
  }
  whoosh(dur = 1.2) {
    if (!this.ok) return; const t = this.now;
    const f = this._noise(t, dur, 'bandpass', 300, 1.2, 0.25, dur * 0.4);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
  }
  boom(v = 1) {
    if (!this.ok) return; const t = this.now;
    const o = this._osc('sine', 70, t, 3.5, 0.8 * v, 0.01);
    o.frequency.exponentialRampToValueAtTime(24, t + 3);
    this._noise(t, 2.5, 'lowpass', 220, 0.6, 0.5 * v, 0.02, this.brown);
  }
  blip(f = 880, v = 0.12) { if (this.ok) this._osc('sine', f, this.now, 0.18, v, 0.005); }
  click() { if (this.ok) this._noise(this.now, 0.03, 'highpass', 3000, 1, 0.2); }
  flagSnap() { if (this.ok) this._noise(this.now, 0.09, 'bandpass', 1400, 1.4, 0.35); }
  chord(freqs, dur = 6, v = 0.08, type = 'triangle') {
    if (!this.ok) return; const t = this.now;
    freqs.forEach((fr, i) => {
      const o = this._osc(type, fr, t + i * 0.08, dur, v, dur * 0.35);
      const vib = this.ctx.createOscillator(), vg = this.ctx.createGain();
      vib.frequency.value = 4.5 + i * 0.3; vg.gain.value = fr * 0.006; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur * 1.4);
    });
  }
}
