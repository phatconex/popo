// Bonk Island HUD (spec §5.2): top chips, roster, feed, ghost bar, action buttons with a charge ring and cooldown
// sweeps, desktop key hint and the touch joystick. Pure DOM; client.js feeds it every frame and wires press/release/move.
import { esc } from '../../core3d/ui.js';

const ICON = {
  push: '<svg class="i" viewBox="0 0 24 24" fill="#fff"><ellipse cx="12" cy="15.5" rx="5.6" ry="4.6"/><circle cx="5.4" cy="9.6" r="2.4"/><circle cx="9.4" cy="5.6" r="2.4"/><circle cx="14.6" cy="5.6" r="2.4"/><circle cx="18.6" cy="9.6" r="2.4"/></svg>',
  dash: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h7M2 12h9M3 16h7"/><path d="M14 6l6 6-6 6"/></svg>',
  bonk: '<svg class="bk-charge" viewBox="0 0 140 140"><circle cx="70" cy="70" r="64" stroke="rgba(36,48,74,.25)"/><circle class="bk-arc" cx="70" cy="70" r="64" stroke="#ffd23f" pathLength="100" stroke-dasharray="0 100"/></svg><svg class="i" viewBox="0 0 24 24"><path d="M5 10.5C5 6.9 7.7 4 11.2 4h3.3C17.5 4 20 6.4 20 9.4v3.8c0 3-2.4 5.3-5.3 5.3H10L9 21H6l-.6-4.2C5.1 15 5 13.2 5 10.5z" fill="#fff" stroke="#24304a" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.6 9.2c0-1.6 1.2-2.8 2.8-2.8" fill="none" stroke="#ffb3bb" stroke-width="1.8" stroke-linecap="round"/><path d="M6 16.5h8" stroke="#24304a" stroke-width="1.6" stroke-linecap="round"/></svg>',
  nut: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="#7a4a2a" stroke="#24304a" stroke-width="1.8"/><circle cx="9.5" cy="11" r="1.2" fill="#3d2414"/><circle cx="13" cy="10" r="1.2" fill="#3d2414"/><circle cx="11.5" cy="13.5" r="1.2" fill="#3d2414"/><path d="M12 5c1-2.5 3.5-3 5.5-2.5-1 2-3 3-5.5 2.5z" fill="#55d36b" stroke="#24304a" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};
const BTN = [['push', 'Push', 'J'], ['dash', 'Dash', 'Space'], ['bonk', 'Bonk', 'hold K'], ['nut', 'Coconut', 'J']];
// Keys the client listens to (the client owns the real handlers; this is the reference table for the hint).
export const KEYMAP = { KeyJ: 'push', KeyK: 'bonk', Space: 'dash', KeyL: 'dash' };
const JOY_MAX = 54;

export class Hud {
  // onPress(a) / onRelease(a): a is 'push' | 'bonk' | 'dash' | 'nut'. onMove(x, z): optional, called with the joystick vector.
  constructor(L, { isTouch, onPress, onRelease, onMove }) {
    this.L = L; this.onPress = onPress || (() => {}); this.onRelease = onRelease || (() => {}); this.onMove = onMove || (() => {});
    this.mx = 0; this.mz = 0; this.joyId = null; this.held = new Map(); this.cd = {}; this.feedT = new Set(); this.sig = {};
    L.classList.add('bk-hud');
    if (isTouch) L.classList.add('bk-touch');
    L.insertAdjacentHTML('beforeend', `
      <div class="bk-joy"><div class="bk-base"><div class="bk-knob"></div></div></div>
      <div class="bk-roster"></div>
      <div class="bk-top">
        <div class="chip bk-lv">ROUND<b class="bk-rnd">1 / 1</b></div>
        <div class="chip bk-brk"><svg viewBox="0 0 24 24"><path d="M3 12h4l2-3 3 6 2-4 2 2h5" fill="none" stroke="#ff5d6c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="bk-brk-l">Edge breaks in</span><b class="bk-brk-t">0:00</b></div>
        <div class="chip bk-lv">ALIVE<b class="bk-alive">1 / 1</b></div>
      </div>
      <div class="bk-feed"></div>
      <div class="bk-ghostbar">You're a ghost! <small>Drop coconuts on the others</small></div>
      <div class="chip bk-hint"><span class="bk-f"><span><kbd>WASD</kbd> move</span><span><kbd>J</kbd> push</span><span>hold <kbd>K</kbd> bonk</span><span><kbd>Space</kbd> dash</span></span><span class="bk-g"><span><kbd>WASD</kbd> aim</span><span><kbd>J</kbd> drop coconut</span></span></div>
      <div class="bk-acts">${BTN.map(([a, label, key]) => `<button class="bk-ab bk-${a}" data-a="${a}"><i class="bk-cd"></i>${ICON[a]}<span>${label}</span><kbd>${key}</kbd></button>`).join('')}</div>`);
    const $ = s => L.querySelector(s);
    this.el = {
      roster: $('.bk-roster'), rnd: $('.bk-rnd'), alive: $('.bk-alive'), brk: $('.bk-brk'), brkL: $('.bk-brk-l'), brkT: $('.bk-brk-t'),
      feed: $('.bk-feed'), arc: $('.bk-arc'), joy: $('.bk-joy'), base: $('.bk-base'), knob: $('.bk-knob'),
    };
    this.btn = {};
    for (const b of L.querySelectorAll('.bk-ab')) {
      const a = b.dataset.a; this.btn[a] = b;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (this.held.has(a)) return;
        try { b.setPointerCapture(e.pointerId); } catch {}
        this.held.set(a, e.pointerId); b.classList.add('bk-down');
        this.onPress(a);
      });
      const up = e => { if (e && this.held.get(a) !== e.pointerId) return; this.drop(a); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }
    const { joy } = this.el;
    joy.addEventListener('pointerdown', e => {
      if (this.joyId != null) return;
      this.joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch {}
      const r = joy.getBoundingClientRect(); this.ox = e.clientX; this.oy = e.clientY;
      this.el.base.style.left = (e.clientX - r.left) + 'px'; this.el.base.style.top = (e.clientY - r.top) + 'px';
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy; const d = Math.hypot(dx, dy);
      if (d > JOY_MAX) { dx *= JOY_MAX / d; dy *= JOY_MAX / d; }
      this.mx = dx / JOY_MAX; this.mz = dy / JOY_MAX;
      this.el.knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.onMove(this.mx, this.mz);
    });
    const end = e => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.mx = this.mz = 0;
      this.el.knob.style.transform = ''; this.el.base.style.left = this.el.base.style.top = '';
      this.onMove(0, 0);
    };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    joy.addEventListener('lostpointercapture', end);
  }

  // Let go of a held button (finger lifted, or the button went away under it).
  drop(a) {
    if (!this.held.has(a)) return;
    this.held.delete(a); this.btn[a].classList.remove('bk-down');
    this.onRelease(a);
  }

  // Joystick vector, screen-aligned: x right, z down; length 0..1.
  move() { return [this.mx, this.mz]; }

  top({ rd, of, alive, total, label, value, hot }) {
    const set = (k, el, v) => { v = String(v); if (this.sig[k] !== v) { this.sig[k] = v; el.textContent = v; } };
    set('rnd', this.el.rnd, `${rd} / ${of}`);
    set('alive', this.el.alive, `${alive} / ${total}`);
    set('brkL', this.el.brkL, label);
    set('brkT', this.el.brkT, value);
    const h = !!hot;
    if (this.sig.hot !== h) { this.sig.hot = h; this.el.brk.classList.toggle('bk-hot', h); }
  }

  // rows: [{ id, name, color, ko, out }]; the DOM is only touched when something changed.
  roster(rows) {
    const sig = JSON.stringify(rows.map(r => [r.id, r.name, r.color, r.ko | 0, !!r.out]));
    if (sig === this.sig.roster) return;
    this.sig.roster = sig;
    this.el.roster.classList.toggle('bk-dense', rows.length > 8);
    this.el.roster.innerHTML = rows.map(r => `<div class="chip bk-rs${r.out ? ' bk-out' : ''}"><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}</span><em>${r.ko ? r.ko + ' KO' : ''}</em></div>`).join('');
  }

  // html is trusted (the caller escapes names). At most 3 lines; each goes after ~3.2 s.
  feed(html, bg) {
    const d = document.createElement('div'); d.className = 'chip'; d.innerHTML = html;
    if (bg) d.style.background = bg;
    const { feed } = this.el;
    feed.prepend(d);
    while (feed.children.length > 3) feed.lastChild.remove();
    const t = setTimeout(() => { this.feedT.delete(t); d.remove(); }, 3200);
    this.feedT.add(t);
  }

  // frac: 0 ready .. 1 just used (the dark sweep).
  cooldown(a, frac) {
    const p = Math.round(Math.max(0, Math.min(1, frac)) * 200) / 2; // 0.5 % steps: no style write on every frame while idle
    if (this.cd[a] === p) return;
    this.cd[a] = p;
    const b = this.btn[a]; if (b) b.firstElementChild.style.setProperty('--p', p);
  }

  charge(c) {
    c = Math.round(Math.max(0, Math.min(1, c)) * 200) / 200;
    if (this.sig.charge === c) return;
    this.sig.charge = c;
    this.el.arc.setAttribute('stroke-dasharray', `${c * 100} 100`);
    this.el.arc.setAttribute('stroke', c >= 1 ? '#ff5d6c' : '#ffd23f');
  }

  // Ghosts get only the Coconut button and the purple bar.
  ghost(on) { this.L.classList.toggle('bk-ghost', !!on); if (on) for (const a of [...this.held.keys()]) if (a !== 'nut') this.drop(a); }
  // No animal this round (joined late, build failed): nothing to press.
  idle(on) { this.L.classList.toggle('bk-idle', !!on); if (on) for (const a of [...this.held.keys()]) this.drop(a); }

  destroy() {
    for (const t of this.feedT) clearTimeout(t);
    this.feedT.clear();
    for (const a of [...this.held.keys()]) this.drop(a);
    if (this.joyId != null) { this.joyId = null; this.mx = this.mz = 0; this.onMove(0, 0); }
    this.L.classList.remove('bk-hud', 'bk-touch', 'bk-ghost', 'bk-idle');
  }
}
