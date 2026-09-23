// WebAudio 音频引擎：车铃 / 风声 / 海浪 / 鸟鸣 / 轻量生成式音乐
// 模式：2=音乐+音效 1=仅音效 0=静音
export class AudioEngine {
  constructor() {
    this.mode = 2;
    this.ctx = null;
    this.sceneKind = 'coast';
    this._noise = null;
  }
  warm() {
    if (!this.ctx) {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get on() { return this.mode > 0 && this.ctx; }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(c.destination);

    // 风
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.8;
    const windSrc = c.createBufferSource();
    windSrc.buffer = this._noiseBuffer(); windSrc.loop = true;
    windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master); windSrc.start();

    // 海浪（场景性）
    this.seaGain = c.createGain(); this.seaGain.gain.value = 0;
    const seaFilter = c.createBiquadFilter();
    seaFilter.type = 'lowpass'; seaFilter.frequency.value = 420;
    const seaSrc = c.createBufferSource();
    seaSrc.buffer = this._noiseBuffer(); seaSrc.loop = true; seaSrc.playbackRate.value = 0.6;
    seaSrc.connect(seaFilter); seaFilter.connect(this.seaGain);
    this.seaGain.connect(this.master); seaSrc.start();
    const lfo = c.createOscillator(), lfoGain = c.createGain();
    lfo.frequency.value = 0.22; lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain); lfoGain.connect(this.seaGain.gain); lfo.start();
  }

  // ---- 每帧环境更新 ----
  ambience(speed, dt) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const wind = Math.min(0.16, speed * 0.014);
    this.windGain.gain.setTargetAtTime(this.mode === 0 ? 0 : wind, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(380 + speed * 90, t, 0.5);
    const seaTarget = (this.mode > 0 && this.sceneKind === 'coast') ? 0.10 : 0;
    this.seaGain.gain.setTargetAtTime(seaTarget, t, 1.2);
  }

  // ---- 车铃：叮铃～ 双击金属声 ----
  bell() {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime;
    const strike = (at, vol) => {
      for (const [f, g, d] of [[2093, 1, .9], [2637, .55, .7], [3520, .22, .45], [1568, .12, .3]]) {
        const o = c.createOscillator(), gn = c.createGain();
        o.type = 'sine'; o.frequency.value = f * (0.997 + Math.random() * 0.006);
        gn.gain.setValueAtTime(vol * g * 0.16, at);
        gn.gain.exponentialRampToValueAtTime(0.0006, at + d);
        o.connect(gn); gn.connect(this.master);
        o.start(at); o.stop(at + d + 0.05);
      }
    };
    strike(t0, 1);
    strike(t0 + 0.13, 0.72);
  }

  // ---- 滑翔风声 ----
  whoosh() {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(240, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.7);
  }

  // ---- 鸟鸣（樱花原野随机） ----
  chirp() {
    if (!this.on || this.mode < 2) return;
    const c = this.ctx, t = c.currentTime;
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      const at = t + i * 0.12 + Math.random() * 0.05;
      const f0 = 2300 + Math.random() * 1400;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.4), at + 0.07);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g); g.connect(this.master);
      o.start(at); o.stop(at + 0.2);
    }
  }

  // ---- 拍照快门 ----
  shutter() {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this._noiseBuffer();
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.1);
  }

  // ---- 生成式音乐盒：C-G-Am-F 进行 + 五声音阶拨弦 ----
  startMusic(getScene) {
    if (this._musicTimer) return;
    this._musicTimer = setInterval(() => {
      if (!this.on || this.mode < 2) return;
      this._musicStep(getScene);
    }, 410);
  }
  _musicStep(getScene) {
    const c = this.ctx, t = c.currentTime;
    this._mi = (this._mi || 0) + 1;
    const bar = (this._mi >> 3) % 4;
    const roots = { 0: 261.63, 1: 196.0, 2: 220.0, 3: 174.61 }; // C G A F
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const root = roots[bar];
    // 每小节第一拍：柔和拨弦和弦（根音+五度+大三度）
    if (this._mi % 8 === 1) {
      for (const iv of [0, 7, 12 + 4]) {
        this._pluck(root / 2 * Math.pow(2, iv / 12), t, 0.045);
      }
    }
    // 旋律：稀疏随机拨弦
    if (Math.random() < 0.55) {
      const deg = scale[(Math.random() * scale.length) | 0];
      this._pluck(root * 2 * Math.pow(2, deg / 12), t + Math.random() * 0.2, 0.035);
    }
  }
  _pluck(freq, at, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(at); o.stop(at + 1.2);
  }
}
