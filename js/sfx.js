'use strict';
/* 程序合成音效：纯 WebAudio（振荡器 + 噪声 + 滤波 + 包络），不依赖任何音频文件。
   用法：sfx.play('perfect', { rate: 1, gain: 1 })；sfx.setVolume(0..1)；sfx.setMuted(bool)；sfx.unlock()。
   每个音效是一个 recipe：函数(S) 往 S.out 里搭节点，返回时长（秒）；实时播放与离线渲染（自检）用同一份。 */
(() => {
const KEY = 'phantom_sfx_v1';
const MAX_VOICES = 16, THROTTLE_MS = 40;
let ac = null, master = null, unlocked = false;
let vol = 0.7, muted = false;
try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (typeof s.vol === 'number') vol = s.vol; muted = !!s.muted; } catch (e) { /* 无存储就用默认 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ vol, muted })); } catch (e) { /* ignore */ } };

/* ---------- 积木 ---------- */
const noiseCache = new WeakMap();
function noiseBuf(c) {   // 固定种子的白噪声，离线渲染可复现
  let b = noiseCache.get(c);
  if (!b) {
    const len = Math.floor(c.sampleRate * 2);
    b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    noiseCache.set(c, b);
  }
  return b;
}
function env(p, t, a, peak, dur) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(a, dur * 0.5));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}
// o: type f0 f1 t dur a peak lp lp1 q vib[rate,depth]
function tone(S, o) {
  const c = S.c, t = S.t + (o.t || 0), dur = o.dur, r = S.rate;
  const osc = c.createOscillator(); osc.type = o.type || 'sine';
  const f0 = o.f0 * r, f1 = (o.f1 == null ? o.f0 : o.f1) * r;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  let node = osc;
  if (o.lp) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.lp, t);
    if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + dur);
    node.connect(f); node = f;
  }
  const g = c.createGain(); env(g.gain, t, o.a || 0.004, (o.peak || 0.2) * S.g, dur);
  node.connect(g); g.connect(S.out);
  if (o.vib) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1] * r;
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  osc.start(t); osc.stop(t + dur + 0.05);
}
// o: ft(bandpass|lowpass|highpass) f0 f1 q t dur a peak off trem[rate,depth]
function noise(S, o) {
  const c = S.c, t = S.t + (o.t || 0), dur = o.dur, r = S.rate;
  const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.Q.value = o.q || 0.9;
  f.frequency.setValueAtTime(o.f0 * r, t);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 * r), t + dur);
  const boost = (o.ft || 'bandpass') === 'bandpass' ? 2.2 : 1;   // 带通滤掉大部分能量，补回来
  const g = c.createGain(); env(g.gain, t, o.a || 0.003, (o.peak || 0.2) * S.g * boost, dur);
  src.connect(f); f.connect(g); g.connect(S.out);
  if (o.trem) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = o.trem[0]; lg.gain.value = o.trem[1] * S.g;
    l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + dur + 0.05);
  }
  src.start(t, o.off || 0); src.stop(t + dur + 0.05);
}
const T = tone, N = noise;
const bell = (S, f, t, dur, peak) => { T(S, { f0: f, dur, t, peak, a: 0.002 }); };   // 单个泛音

/* ---------- 音效配方：[优先级, 是否允许随机微调音高, 函数] ---------- */
const RECIPES = {
  // 普攻三段：挥砍越来越重
  atk1: [1, true, (S) => { N(S, { ft: 'bandpass', f0: 1200, f1: 3600, q: 1.2, dur: 0.12, peak: 0.28 }); T(S, { type: 'sawtooth', f0: 320, f1: 130, dur: 0.1, peak: 0.1, lp: 1500 }); return 0.14; }],
  atk2: [1, true, (S) => { N(S, { ft: 'bandpass', f0: 3200, f1: 1000, q: 1.2, dur: 0.13, peak: 0.28 }); T(S, { type: 'sawtooth', f0: 280, f1: 110, dur: 0.11, peak: 0.1, lp: 1400 }); return 0.15; }],
  atk3: [1, true, (S) => {
    N(S, { ft: 'bandpass', f0: 700, f1: 2800, q: 1, dur: 0.2, peak: 0.34 });
    T(S, { f0: 130, f1: 48, dur: 0.24, peak: 0.34 });
    T(S, { type: 'sawtooth', f0: 220, f1: 80, dur: 0.2, peak: 0.12, lp: 1200 });
    N(S, { ft: 'highpass', f0: 3000, dur: 0.04, t: 0.12, peak: 0.12 });
    return 0.26;
  }],
  hit: [0, true, (S) => { N(S, { ft: 'lowpass', f0: 2000, f1: 300, q: 0.7, dur: 0.09, peak: 0.34 }); T(S, { f0: 190, f1: 60, dur: 0.1, peak: 0.36 }); return 0.12; }],
  hitCrit: [1, true, (S) => {
    N(S, { ft: 'lowpass', f0: 2600, f1: 300, q: 0.7, dur: 0.1, peak: 0.34 });
    T(S, { f0: 210, f1: 55, dur: 0.12, peak: 0.36 });
    N(S, { ft: 'highpass', f0: 5000, dur: 0.05, peak: 0.16 });
    bell(S, 2400, 0.01, 0.28, 0.12); bell(S, 3600, 0.01, 0.2, 0.06);
    return 0.32;
  }],
  kill: [1, true, (S) => {
    T(S, { f0: 150, f1: 38, dur: 0.32, peak: 0.4 });
    N(S, { ft: 'lowpass', f0: 1400, f1: 180, dur: 0.26, peak: 0.28 });
    T(S, { type: 'square', f0: 520, f1: 190, dur: 0.15, peak: 0.07, lp: 1800 });
    return 0.34;
  }],
  dash: [0, true, (S) => { N(S, { ft: 'bandpass', f0: 600, f1: 2600, q: 1.4, dur: 0.18, a: 0.02, peak: 0.24 }); T(S, { f0: 200, f1: 520, dur: 0.15, peak: 0.07 }); return 0.2; }],
  // 完美闪避：玻璃般的泛音 + 反向扫频（时间停滞）+ 低频下沉
  perfect: [2, false, (S) => {
    N(S, { ft: 'highpass', f0: 6500, dur: 0.03, peak: 0.28 });
    N(S, { ft: 'bandpass', f0: 4200, f1: 800, q: 1.5, dur: 0.38, a: 0.18, peak: 0.16 });
    T(S, { f0: 240, f1: 34, dur: 0.6, a: 0.01, peak: 0.42 });
    bell(S, 1568, 0.0, 0.8, 0.13); bell(S, 2349, 0.0, 0.7, 0.11); bell(S, 3136, 0.02, 0.6, 0.09);
    bell(S, 4330, 0.0, 0.45, 0.06); bell(S, 5920, 0.03, 0.3, 0.04);
    T(S, { f0: 3140, dur: 0.7, t: 0.02, peak: 0.05, a: 0.01 });   // 与 3136 拍频，闪烁感
    return 0.9;
  }],
  witchEnd: [1, false, (S) => {
    N(S, { ft: 'bandpass', f0: 500, f1: 3200, q: 1, dur: 0.3, a: 0.22, peak: 0.24 });
    T(S, { f0: 70, f1: 220, dur: 0.3, a: 0.2, peak: 0.2 });
    T(S, { f0: 100, f1: 38, t: 0.3, dur: 0.22, peak: 0.38 });
    N(S, { ft: 'lowpass', f0: 1800, f1: 200, t: 0.3, dur: 0.14, peak: 0.2 });
    return 0.56;
  }],
  thrust: [1, true, (S) => { N(S, { ft: 'bandpass', f0: 2000, f1: 6500, q: 2, dur: 0.16, peak: 0.28 }); T(S, { type: 'sawtooth', f0: 900, f1: 250, dur: 0.14, peak: 0.08, lp: 2200 }); return 0.18; }],
  throw: [1, true, (S) => {
    N(S, { ft: 'bandpass', f0: 500, f1: 1600, q: 1, dur: 0.26, a: 0.03, peak: 0.24 });
    T(S, { type: 'square', f0: 170, f1: 360, dur: 0.2, peak: 0.06, lp: 1400 });
    bell(S, 900, 0.0, 0.3, 0.05);
    return 0.3;
  }],
  blink: [1, true, (S) => {
    T(S, { f0: 1900, f1: 300, dur: 0.12, peak: 0.18 });
    N(S, { ft: 'highpass', f0: 5000, f1: 900, dur: 0.12, peak: 0.18 });
    T(S, { f0: 130, f1: 60, t: 0.1, dur: 0.1, peak: 0.28 });
    return 0.22;
  }],
  iai: [1, true, (S) => {   // 金属出鞘 → 一闪
    N(S, { ft: 'highpass', f0: 4000, f1: 8000, dur: 0.18, a: 0.05, peak: 0.16 });
    T(S, { f0: 2800, f1: 3400, dur: 0.22, a: 0.04, peak: 0.07 }); bell(S, 5200, 0.04, 0.3, 0.04);
    N(S, { ft: 'bandpass', f0: 3200, f1: 900, q: 1.3, t: 0.12, dur: 0.12, peak: 0.28 });
    T(S, { type: 'sawtooth', f0: 260, f1: 90, t: 0.12, dur: 0.1, peak: 0.09, lp: 1300 });
    return 0.34;
  }],
  iaiCut: [0, true, (S) => {
    N(S, { ft: 'bandpass', f0: 2500, f1: 600, q: 1.2, dur: 0.12, peak: 0.3 });
    T(S, { f0: 270, f1: 70, dur: 0.15, peak: 0.3 });
    N(S, { ft: 'highpass', f0: 4500, dur: 0.04, peak: 0.12 });
    return 0.17;
  }],
  storm: [0, false, (S) => {   // 瞬狱：一串快速的穿梭
    for (let i = 0; i < 6; i++) {
      const t = i * 0.07;
      T(S, { f0: 2300 - i * 170, f1: 600, t, dur: 0.055, peak: 0.12 });
      N(S, { ft: 'bandpass', f0: 3000 - i * 200, f1: 900, q: 1.4, t, dur: 0.055, peak: 0.16 });
      if (i % 2 === 0) T(S, { f0: 120, f1: 55, t, dur: 0.06, peak: 0.16 });
    }
    return 0.5;
  }],
  transform: [2, false, (S) => {
    T(S, { type: 'sawtooth', f0: 58, f1: 44, dur: 1.2, a: 0.15, peak: 0.34, lp: 320, vib: [24, 6] });
    T(S, { type: 'sawtooth', f0: 61, f1: 47, dur: 1.2, a: 0.15, peak: 0.2, lp: 300 });
    T(S, { type: 'sawtooth', f0: 90, f1: 900, dur: 0.9, a: 0.5, peak: 0.12, lp: 500, lp1: 3500 });
    N(S, { ft: 'bandpass', f0: 200, f1: 4200, q: 1, dur: 0.9, a: 0.6, peak: 0.16 });
    T(S, { f0: 100, f1: 28, t: 0.9, dur: 0.55, peak: 0.5 });
    N(S, { ft: 'lowpass', f0: 3200, f1: 100, t: 0.9, dur: 0.5, peak: 0.36 });
    N(S, { ft: 'highpass', f0: 3500, t: 0.9, dur: 0.06, peak: 0.16 });
    return 1.5;
  }],
  rageSwing: [1, true, (S) => {
    N(S, { ft: 'bandpass', f0: 900, f1: 3000, q: 1.1, dur: 0.14, peak: 0.28 });
    T(S, { type: 'sawtooth', f0: 250, f1: 110, dur: 0.12, peak: 0.12, lp: 1300 });
    T(S, { f0: 1100, dur: 0.16, peak: 0.05 });
    return 0.17;
  }],
  rain: [0, true, (S) => {
    T(S, { f0: 105, f1: 40, dur: 0.26, peak: 0.4 });
    N(S, { ft: 'lowpass', f0: 1300, f1: 150, dur: 0.24, peak: 0.3 });
    N(S, { ft: 'highpass', f0: 3000, dur: 0.04, peak: 0.12 });
    return 0.28;
  }],
  finisher: [2, false, (S) => {
    N(S, { ft: 'highpass', f0: 2500, dur: 0.07, peak: 0.2 });
    T(S, { f0: 75, f1: 24, dur: 1.0, peak: 0.52 });
    T(S, { f0: 150, f1: 38, dur: 0.5, peak: 0.34 });
    N(S, { ft: 'lowpass', f0: 2600, f1: 80, dur: 1.0, peak: 0.4 });
    N(S, { ft: 'bandpass', f0: 700, f1: 300, t: 0.3, dur: 0.5, peak: 0.12 });
    return 1.3;
  }],
  hurt: [2, true, (S) => {
    T(S, { type: 'sawtooth', f0: 320, f1: 90, dur: 0.22, peak: 0.24, lp: 1500 });
    N(S, { ft: 'bandpass', f0: 900, f1: 300, dur: 0.15, peak: 0.28 });
    T(S, { f0: 85, f1: 38, dur: 0.22, peak: 0.36 });
    return 0.26;
  }],
  soul: [0, false, (S) => { T(S, { f0: 1320, dur: 0.2, peak: 0.18 }); T(S, { f0: 1980, dur: 0.22, t: 0.03, peak: 0.12 }); T(S, { type: 'triangle', f0: 2640, dur: 0.16, t: 0.03, peak: 0.07 }); return 0.26; }],
  tell: [0, false, (S) => { T(S, { f0: 1800, dur: 0.05, peak: 0.1, a: 0.003 }); T(S, { f0: 2400, dur: 0.06, t: 0.07, peak: 0.1, a: 0.003 }); return 0.14; }],
  skelLunge: [0, true, (S) => {
    N(S, { ft: 'bandpass', f0: 700, f1: 300, dur: 0.18, peak: 0.24 });
    T(S, { type: 'sawtooth', f0: 170, f1: 80, dur: 0.15, peak: 0.12, lp: 900 });
    N(S, { ft: 'highpass', f0: 3500, dur: 0.03, peak: 0.12 });
    return 0.2;
  }],
  houndLeap: [0, true, (S) => {
    T(S, { type: 'sawtooth', f0: 140, f1: 210, dur: 0.12, peak: 0.16, lp: 650, vib: [30, 10] });
    T(S, { type: 'sawtooth', f0: 210, f1: 95, t: 0.12, dur: 0.14, peak: 0.14, lp: 650 });
    N(S, { ft: 'bandpass', f0: 400, f1: 1300, dur: 0.2, peak: 0.14 });
    T(S, { f0: 600, f1: 950, dur: 0.1, peak: 0.07 });
    return 0.28;
  }],
  ghostShriek: [1, false, (S) => {
    T(S, { f0: 900, f1: 2100, dur: 0.5, a: 0.06, peak: 0.16, vib: [13, 70] });
    T(S, { type: 'sawtooth', f0: 1350, f1: 3000, dur: 0.5, a: 0.06, peak: 0.08, lp: 3500, vib: [11, 90] });
    N(S, { ft: 'bandpass', f0: 3000, f1: 4500, q: 1.5, dur: 0.45, a: 0.05, peak: 0.12 });
    return 0.56;
  }],
  fireball: [0, true, (S) => {
    N(S, { ft: 'bandpass', f0: 300, f1: 1500, q: 0.8, dur: 0.35, a: 0.04, peak: 0.24, trem: [26, 0.06] });
    T(S, { type: 'sawtooth', f0: 90, f1: 210, dur: 0.3, peak: 0.12, lp: 600 });
    N(S, { ft: 'highpass', f0: 4000, t: 0.08, dur: 0.03, peak: 0.08 }); N(S, { ft: 'highpass', f0: 4500, t: 0.2, dur: 0.03, peak: 0.08, off: 0.3 });
    return 0.4;
  }],
  reflect: [1, true, (S) => {
    N(S, { ft: 'highpass', f0: 4000, dur: 0.02, peak: 0.28 });
    bell(S, 900, 0, 0.35, 0.14); bell(S, 2484, 0, 0.28, 0.1); bell(S, 4200, 0, 0.2, 0.06);
    T(S, { f0: 500, f1: 1500, dur: 0.12, peak: 0.1 });
    return 0.38;
  }],
  bossRoar: [2, false, (S) => {
    T(S, { type: 'sawtooth', f0: 95, f1: 58, dur: 1.3, a: 0.1, peak: 0.34, lp: 500, lp1: 220, vib: [28, 12] });
    T(S, { type: 'sawtooth', f0: 140, f1: 82, dur: 1.2, a: 0.1, peak: 0.16, lp: 700, lp1: 300, vib: [31, 14] });
    N(S, { ft: 'bandpass', f0: 500, f1: 900, q: 0.9, dur: 1.2, a: 0.1, peak: 0.16, trem: [28, 0.05] });
    T(S, { f0: 46, dur: 1.0, a: 0.15, peak: 0.34 });
    return 1.4;
  }],
  bossCharge: [1, false, (S) => {
    T(S, { type: 'sawtooth', f0: 60, f1: 170, dur: 0.7, a: 0.35, peak: 0.24, lp: 400, lp1: 1500 });
    N(S, { ft: 'lowpass', f0: 300, f1: 1800, dur: 0.7, a: 0.5, peak: 0.22 });
    return 0.75;
  }],
  bossBreath: [1, false, (S) => {
    N(S, { ft: 'bandpass', f0: 1100, f1: 600, q: 0.7, dur: 1.0, a: 0.1, peak: 0.28, trem: [19, 0.1] });
    N(S, { ft: 'lowpass', f0: 800, f1: 300, dur: 1.0, a: 0.1, peak: 0.16, off: 0.5 });
    T(S, { type: 'sawtooth', f0: 72, f1: 50, dur: 1.0, a: 0.1, peak: 0.16, lp: 300 });
    return 1.1;
  }],
  bossLand: [2, false, (S) => {
    T(S, { f0: 82, f1: 28, dur: 0.6, peak: 0.52 });
    N(S, { ft: 'lowpass', f0: 2200, f1: 100, dur: 0.5, peak: 0.4 });
    N(S, { ft: 'highpass', f0: 3000, dur: 0.05, peak: 0.2 });
    N(S, { ft: 'bandpass', f0: 600, f1: 250, t: 0.1, dur: 0.4, peak: 0.12 });
    return 0.8;
  }],
  bossDown: [2, false, (S) => {
    T(S, { type: 'sawtooth', f0: 150, f1: 30, dur: 1.8, a: 0.05, peak: 0.3, lp: 600, lp1: 100, vib: [20, 10] });
    T(S, { f0: 62, f1: 20, dur: 1.9, peak: 0.44 });
    N(S, { ft: 'lowpass', f0: 3200, f1: 90, dur: 1.5, peak: 0.34 });
    N(S, { ft: 'highpass', f0: 3000, dur: 0.07, peak: 0.16 });
    N(S, { ft: 'bandpass', f0: 500, f1: 150, t: 0.4, dur: 1.2, peak: 0.1 });
    return 2.0;
  }],
  ui: [0, false, (S) => { T(S, { f0: 1000, f1: 1400, dur: 0.09, peak: 0.14 }); T(S, { type: 'triangle', f0: 2000, dur: 0.07, peak: 0.06 }); return 0.1; }],
  pick: [1, false, (S) => { T(S, { f0: 700, f1: 1050, dur: 0.08, peak: 0.16 }); T(S, { f0: 1400, t: 0.06, dur: 0.22, peak: 0.12 }); T(S, { f0: 2100, t: 0.06, dur: 0.22, peak: 0.08 }); return 0.3; }],
  coin: [0, false, (S) => { T(S, { f0: 1568, dur: 0.09, peak: 0.14 }); T(S, { f0: 2093, t: 0.07, dur: 0.26, peak: 0.16 }); T(S, { type: 'triangle', f0: 4186, t: 0.07, dur: 0.14, peak: 0.05 }); return 0.34; }],
  victory: [2, false, (S) => {
    [220, 261.6, 329.6, 440].forEach((f, i) => { T(S, { type: 'triangle', f0: f, t: i * 0.12, dur: 0.3, peak: 0.16 }); T(S, { f0: f * 2, t: i * 0.12, dur: 0.22, peak: 0.06 }); });
    [220, 329.6, 440, 523.3].forEach((f) => { T(S, { type: 'triangle', f0: f, t: 0.5, dur: 1.0, a: 0.02, peak: 0.12 }); });
    T(S, { f0: 110, t: 0.5, dur: 1.0, peak: 0.2 }); bell(S, 1760, 0.5, 0.9, 0.04);
    return 1.6;
  }],
  defeat: [2, false, (S) => {
    [330, 277, 220, 165].forEach((f, i) => { T(S, { type: 'sawtooth', f0: f, f1: f * 0.97, t: i * 0.22, dur: 0.4, a: 0.02, peak: 0.12, lp: 900 }); });
    T(S, { f0: 55, f1: 40, t: 0.7, dur: 1.1, a: 0.05, peak: 0.34 });
    N(S, { ft: 'lowpass', f0: 600, f1: 100, t: 0.7, dur: 1.0, peak: 0.1 });
    return 1.8;
  }],
};
const NAMES = Object.keys(RECIPES);

/* ---------- 总线：音量 → 软限幅 → 压缩器 ---------- */
function buildMaster(c, v, bypass) {
  const g = c.createGain(); g.gain.value = v;
  if (bypass) { g.connect(c.destination); return g; }   // 自检用：直通，测原始峰值
  const sh = c.createWaveShaper(), n = 512, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 1.4) / Math.tanh(1.4);
  sh.curve = curve;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
  g.connect(sh); sh.connect(comp); comp.connect(c.destination);
  return g;
}

/* ---------- 实时播放 ---------- */
const last = {}, voices = [];
function ensure() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { return false; }
    master = buildMaster(ac, muted ? 0 : vol, false);
  }
  return true;
}
function unlock() {
  unlocked = true;
  if (ensure() && ac.state === 'suspended') ac.resume();
}
function play(name, opts) {
  const rec = RECIPES[name];
  if (!rec || muted || vol <= 0 || !unlocked || !ensure()) return false;
  if (ac.state === 'suspended') ac.resume();
  const now = performance.now();
  if (now - (last[name] || -1e9) < THROTTLE_MS) return false;
  last[name] = now;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i] <= now) voices.splice(i, 1);
  if (voices.length >= MAX_VOICES + (rec[0] >= 2 ? 4 : 0) || (voices.length >= MAX_VOICES && rec[0] < 2)) return false;
  const o = opts || {};
  const rate = (o.rate || 1) * (rec[1] ? 1 + (Math.random() - 0.5) * 0.1 : 1);
  const S = { c: ac, out: master, t: ac.currentTime + 0.005, rate, g: o.gain == null ? 1 : o.gain };
  const dur = rec[2](S);
  voices.push(now + dur * 1000 + 60);
  return true;
}
function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = muted ? 0 : vol; save(); }
function setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : vol; save(); }

/* ---------- 离线渲染（自检用，不经限幅，测原始峰值） ---------- */
function render(name, sr = 44100) {
  const rec = RECIPES[name];
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = new OAC(1, Math.floor(sr * 3.4), sr);
  const m = buildMaster(c, 1, true);
  const dur = rec[2]({ c, out: m, t: 0.01, rate: 1, g: 1 });
  return c.startRendering().then((buf) => ({ buf, dur }));
}

['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, function once() { unlock(); window.removeEventListener(ev, once, true); }, true));

window.sfx = {
  play, setVolume, setMuted, unlock, render, names: NAMES,
  volume: () => vol, muted: () => muted, priority: (n) => RECIPES[n] && RECIPES[n][0],
};
})();
