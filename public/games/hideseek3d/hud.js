// In-game HUD: timer, hiders left, role, water tank, action buttons, feed, frenzy border, joystick.
import { h } from '../../core3d/ui.js';

const ICON = {
  run: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M9 21l2-6 3 2v5h2v-6l-3-3 1-3 2 2h4v-2h-3l-3-3c-1-1-2-1-3 0L7 9v4h2v-3l2-1-3 9z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
  say: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 4h7v2l-4 5h4v2H4v-2l4-5H4zM13 11h6v2l-3 4h3v2h-6v-2l3-4h-3z"/></svg>',
  decoy: '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="8" cy="10" r="4"/><circle cx="16" cy="10" r="4" opacity=".55"/><rect x="4" y="15" width="8" height="5" rx="2"/><rect x="12" y="15" width="8" height="5" rx="2" opacity=".55"/></svg>',
  listen: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 15a6 6 0 1 1 10-4c0 3-3 3-3 6a3 3 0 0 1-5 2"/><path d="M10 11a2 2 0 1 1 3 1.7"/></svg>',
};
export const ACTS = {
  hider: [['run', 'Run', 'Shift'], ['swap', 'Swap', 'E'], ['say', 'Call', 'Q'], ['sleep', 'Sleep', 'Z'], ['decoy', 'Decoy', 'F']],
  seeker: [['listen', 'Listen', 'R']],
};
export const COOLDOWN = { say: 8, sleep: 25, decoy: 20, listen: 25 };
export const KEYMAP = { ShiftLeft: 'run', ShiftRight: 'run', KeyE: 'swap', KeyQ: 'say', KeyZ: 'sleep', KeyF: 'decoy', KeyR: 'listen' };

export class Hud {
  constructor(L, { isTouch, onAction }) {
    this.L = L; this.onAction = onAction; this.joy = { x: 0, y: 0, id: null }; this.runHeld = false;
    if (isTouch) L.classList.add('touch');
    L.insertAdjacentHTML('beforeend', `
      <div class="hs-frenzy"></div>
      <div class="hs-top"><div class="chip hs-timer"><small class="ph">HIDE!</small><span class="tm">0:15</span></div><div class="chip hs-left"><div class="hs-dots"></div><span class="lt"></span></div></div>
      <div class="hs-role o"></div>
      <div class="hs-hp"><div></div><span>Water tank 100</span></div>
      <div class="hs-feed"></div>
      <div class="chip hs-keys"></div>
      <div class="chip hs-spec"></div>
      <div class="hs-acts"></div>
      <div class="hs-pad"><div class="k"></div></div>`);
    this.$ = s => L.querySelector(s);
    this.$('.hs-spec').textContent = 'You were caught! Watching the seeker…';
    const pad = this.$('.hs-pad'), knob = pad.firstElementChild, joy = this.joy;
    const move = e => { const r = pad.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 50) / l; joy.x = dx * k; joy.y = dy * k; knob.style.transform = `translate(${joy.x * 40}px,${joy.y * 40}px)`; };
    pad.addEventListener('pointerdown', e => { e.stopPropagation(); joy.id = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); });
    pad.addEventListener('pointermove', e => e.pointerId === joy.id && move(e));
    const up = () => { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    this.role = null; this.btns = {};
    this.keysT = setTimeout(() => { this.$('.hs-keys').style.opacity = 0; }, 14000);
  }

  setRole(role, alive) {
    const key = role + (alive ? '' : '-out');
    if (this.role === key) return;
    this.role = key;
    const r = this.$('.hs-role');
    r.className = 'hs-role o ' + (alive ? role : 'out');
    r.innerHTML = !alive ? 'CAUGHT<small>Cheer from the sidelines!</small>' : role === 'hider' ? 'HIDER<small>Blend in with the herd!</small>' : 'SEEKER<small>Find the fakes!</small>';
    this.L.classList.toggle('has-hp', role === 'seeker' && alive);
    this.$('.hs-hp').style.display = role === 'seeker' && alive ? 'block' : 'none';
    this.$('.hs-spec').style.display = alive ? 'none' : 'block';
    this.$('.hs-keys').innerHTML = role === 'hider'
      ? 'WASD to walk like an animal. <b>Shift = run (leaves footprints!)</b> · E swap · Q call · Z sleep · F decoy'
      : 'WASD to move · <b>click to squirt water</b> · R listen. Hitting a real animal costs water!';
    const box = this.$('.hs-acts'); box.innerHTML = ''; this.btns = {};
    if (!alive) return;
    ACTS[role].forEach(([id, label, key], i) => {
      const b = h(`<button class="hs-act a-${id}" style="animation-delay:${i * .06}s">${ICON[id]}<span>${label}</span><kbd>${key}</kbd><div class="cd"></div></button>`);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (id === 'run') { this.runHeld = true; b.classList.add('held'); } else this.onAction(id); });
      if (id === 'run') for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { this.runHeld = false; b.classList.remove('held'); });
      box.appendChild(b); this.btns[id] = b;
    });
  }

  update(s) {
    const me = s.me;
    this.setRole(me.role, me.alive);
    this.$('.ph').textContent = s.ph === 'hiding' ? 'HIDE!' : s.fz ? 'FRENZY!' : 'TIME LEFT';
    this.$('.hs-timer').classList.toggle('hide', s.ph === 'hiding' || !!s.fz);
    this.$('.tm').textContent = Math.floor(s.tm / 60) + ':' + String(s.tm % 60).padStart(2, '0');
    const dots = this.$('.hs-dots');
    if (dots.childElementCount !== s.ht || dots.dataset.hl !== String(s.hl)) {
      dots.dataset.hl = s.hl;
      dots.innerHTML = Array.from({ length: s.ht }, (_, i) => `<i class="${i < s.hl ? '' : 'out'}"></i>`).join('');
      this.$('.lt').textContent = `${s.hl} / ${s.ht}`;
    }
    if (me.role === 'seeker') { const hp = this.$('.hs-hp'); hp.firstElementChild.style.width = me.hp + '%'; hp.lastElementChild.textContent = 'Water tank ' + me.hp; }
    for (const [id, b] of Object.entries(this.btns)) {
      const cd = me.cd && me.cd[id];
      const was = b.classList.contains('cool');
      b.classList.toggle('cool', !!cd);
      if (cd) { b.querySelector('.cd').textContent = cd; b.style.setProperty('--p', Math.min(1, cd / (COOLDOWN[id] || cd))); }
      if (was && !cd) { b.classList.remove('ready'); void b.offsetWidth; b.classList.add('ready'); }
    }
    this.$('.hs-frenzy').classList.toggle('on', !!s.fz);
  }

  feed(html, bg = '#fff') {
    const d = h(`<div class="chip" style="background:${bg}">${html}</div>`);
    const f = this.$('.hs-feed'); f.prepend(d);
    while (f.childElementCount > 4) f.lastElementChild.remove();
    setTimeout(() => d.remove(), 3500);
  }
  destroy() { clearTimeout(this.keysT); }
}
