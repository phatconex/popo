// Tiny WebAudio sound effects (no audio files). Mute state is remembered.
let ac;
const KEY = 'popo.muted';
function beep(f, dur = .1, type = 'sine', vol = .15, slide = 0) {
  if (sfx.muted) return;
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch {}
}
function noise(dur = .25, vol = .12) {
  if (sfx.muted) return;
  try {
    ac = ac || new AudioContext();
    const n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(ac.destination); src.start();
  } catch {}
}
addEventListener('pointerdown', () => { try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); } catch {} }, { passive: true });

export const sfx = {
  muted: (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })(),
  setMuted(v) { sfx.muted = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} },
  beep,
  click: () => beep(600, .05, 'triangle', .06, 200),
  pop: () => beep(880, .08, 'triangle', .07, 300),
  tick: () => beep(1200, .04, 'square', .04),
  go: () => beep(660, .25, 'triangle', .12, 440),
  splash: () => noise(.22, .1),
  caught: () => [784, 988, 1318].forEach((f, i) => setTimeout(() => beep(f, .1, 'triangle', .1), i * 70)),
  oops: () => beep(260, .18, 'square', .05, -80),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .12, 'triangle', .12), i * 80)),
  lose: () => { beep(300, .15, 'square', .06); setTimeout(() => beep(200, .2, 'square', .06), 120); },
};
export const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
