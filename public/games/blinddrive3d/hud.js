// Blind Drive HUD for both roles: progress bar, role chip, navigator signal pad, driver call card, gauge,
// "Something nearby?" meter, road feel and touch controls. Also owns the driver's engine hum.
import { sfx } from '../../core3d/sfx.js';
import { esc } from '../../core3d/ui.js';

const PAW = '<svg viewBox="0 0 24 24" fill="#fff"><ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><circle cx="5.5" cy="10" r="2.3"/><circle cx="9.5" cy="6" r="2.3"/><circle cx="14.5" cy="6" r="2.3"/><circle cx="18.5" cy="10" r="2.3"/></svg>';
const COIN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc727" stroke="#24304a" stroke-width="2.5"/><rect x="10" y="7" width="4" height="10" rx="2" fill="#fff6c2"/></svg>';

// The 8 navigator signals (index = the `k` sent to the server). `tone` is the note both sides hear.
export const SIG = [
  { id: 'left', label: 'Left', big: 'TURN LEFT!', key: 'A', codes: ['KeyA', 'ArrowLeft'], col: '#4fb4ff', tone: 520, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M10 4 2 12l8 8v-5h12V9H10z"/></svg>' },
  { id: 'right', label: 'Right', big: 'TURN RIGHT!', key: 'D', codes: ['KeyD', 'ArrowRight'], col: '#4fb4ff', tone: 660, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M14 4l8 8-8 8v-5H2V9h12z"/></svg>' },
  { id: 'straight', label: 'Straight', big: 'STRAIGHT ON', key: 'W', codes: ['KeyW', 'ArrowUp'], col: '#55d36b', tone: 780, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2l8 8h-5v12H9V10H4z"/></svg>' },
  { id: 'go', label: 'Faster', big: 'FASTER!', key: 'E', codes: ['KeyE'], col: '#7cc93f', tone: 900, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2l8 8h-5l-3-3-3 3H4zM12 11l8 8h-5l-3-3-3 3H4z"/></svg>' },
  { id: 'slow', label: 'Slow', big: 'SLOW DOWN', key: 'Q', codes: ['KeyQ'], col: '#ffb81f', tone: 440, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 21l-8-8h5l3 3 3-3h5z"/><rect x="4" y="4" width="16" height="4" rx="2"/></svg>' },
  { id: 'stop', label: 'Stop', big: 'STOP!', key: 'S', codes: ['KeyS', 'ArrowDown'], col: '#ff5d6c', tone: 330, svg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/></svg>' },
  { id: 'back', label: 'Reverse', big: 'BACK UP', key: 'R', codes: ['KeyR'], col: '#9a7cff', tone: 380, svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21V10a5 5 0 0 0-10 0v4"/><path d="M3 11l4 4 4-4"/></svg>' },
  { id: 'park', label: 'Pick up', big: 'PICK UP HERE', key: 'Space', codes: ['Space'], col: '#ff7fc8', tone: 600, svg: PAW },
];
export const DRIVE_KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], gas: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], rev: ['KeyR'] };

const TEAM_HEX = ['#ff5d6c', '#4fb4ff', '#55d36b', '#ffc727'];
const MAPS = { country: 'Country Road', snow: 'Snowy Pass', beach: 'Beach Town', night: 'Night City' };
const ROLE_COL = { nav: '#4fb4ff', driver: '#ff8a4c', solo: '#ff8a4c' };
const VMAX = 7;
const ctl = (cls, label, svg, kbd, name) => `<button class="bd-cb ${cls}" data-d="${name}">${svg}${label}<kbd>${kbd}</kbd></button>`;
const ARROW_L = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M15 4 7 12l8 8z"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M9 4l8 8-8 8z"/></svg>';

export class Hud {
  constructor(L, { isTouch, onSignal, onDriveInput } = {}) {
    this.L = L; this.onSignal = onSignal; this.onDriveInput = onDriveInput;
    this.role = null; this.lvl = null; this.held = {}; this.keyHeld = {};
    this.hist = []; this.markers = new Map(); this.cache = {}; this.started = false; this.hum = null; this.vNow = 0;
    this.timers = new Set();
    if (isTouch) L.classList.add('touch');
    L.insertAdjacentHTML('beforeend', `
      <div class="bd-redge pass"></div>
      <div class="bd-top pass">
        <div class="chip bd-prog"><small><span class="lv"></span><span class="pk"></span></small><div class="bd-track"><div class="fill"></div><div class="fin"></div></div></div>
        <div class="chip bd-stat">${COIN}<span class="cn">0</span></div>
      </div>
      <div class="bd-role o pass"></div>
      <div class="bd-feed pass"></div>
      <div class="bd-padwrap">
        <div class="chip bd-calling"><i></i>Calling to <b class="to"></b><span class="sent">Sent!</span></div>
        <div class="bd-sigs"></div>
      </div>
      <div class="bd-call pass">
        <div class="chip bd-who"></div>
        <div class="bd-card"><div class="ico"></div><span></span></div>
        <div class="bd-hist"></div>
      </div>
      <div class="bd-dash">
        <div class="bd-ctl">${ctl('steer', '', ARROW_L, 'A', 'left')}${ctl('steer', '', ARROW_R, 'D', 'right')}</div>
        <div class="chip bd-gauge"><svg viewBox="0 0 146 78"><path d="M13 73a60 60 0 0 1 120 0" fill="none" stroke="#e3e9f3" stroke-width="14" stroke-linecap="round"/><path class="arc" d="M13 73a60 60 0 0 1 120 0" fill="none" stroke="#ffb81f" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/></svg><b class="spd">0</b><small>SPEED</small></div>
        <div class="chip bd-sense">Something nearby?<div class="bd-meter"><div></div></div><div class="row"><span>Road feels</span><span class="bump">Flat</span></div></div>
        <div class="bd-ctl">${ctl('rev', 'Reverse', SIG[6].svg, 'R', 'rev')}${ctl('brk', 'Brake', '<svg viewBox="0 0 24 24" fill="#fff"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>', 'S', 'brake')}${ctl('gas', 'Gas', '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3l8 9h-5v9H9v-9H4z"/></svg>', 'W', 'gas')}</div>
      </div>`);
    const q = this.$ = s => L.querySelector(s);
    this.el = { lv: q('.lv'), pk: q('.pk'), cn: q('.cn'), track: q('.bd-track'), fill: q('.bd-track .fill'), role: q('.bd-role'), feed: q('.bd-feed'),
      to: q('.to'), sent: q('.sent'), sigs: q('.bd-sigs'), who: q('.bd-who'), card: q('.bd-card'), hist: q('.bd-hist'), call: q('.bd-call'),
      arc: q('.arc'), spd: q('.spd'), meter: q('.bd-meter div'), sense: q('.bd-sense'), bump: q('.bump'), redge: q('.bd-redge'), dash: q('.bd-dash') };
    this.sigBtns = SIG.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'bd-sig'; b.style.background = s.col;
      b.innerHTML = `${s.svg}<span>${s.label}</span><kbd>${s.key}</kbd>`;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.press(i); });
      this.el.sigs.appendChild(b);
      return b;
    });
    // driving buttons: hold to steer / gas / brake / reverse (several fingers at once)
    for (const b of this.el.dash.querySelectorAll('.bd-cb')) {
      const name = b.dataset.d;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch {}
        this.held[name] = true; b.classList.add('held'); this.driveInput();
      });
      const up = () => { this.held[name] = false; b.classList.remove('held'); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }
    this.cbs = [...this.el.dash.querySelectorAll('.bd-cb')];
    // keyboard: navigator signals, or driving keys (held state)
    this.onKeyDown = e => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (this.role === 'nav') {
        const k = SIG.findIndex(s => s.codes.includes(e.code));
        if (k >= 0) { e.preventDefault(); if (!e.repeat) this.press(k); }
      } else if (this.role === 'driver' || this.role === 'solo') {
        for (const [n, codes] of Object.entries(DRIVE_KEYS)) if (codes.includes(e.code)) { e.preventDefault(); this.keyHeld[n] = true; this.driveInput(); }
      }
    };
    this.onKeyUp = e => { for (const [n, codes] of Object.entries(DRIVE_KEYS)) if (codes.includes(e.code)) this.keyHeld[n] = false; };
    this.onBlur = () => { this.keyHeld = {}; this.held = {}; };
    addEventListener('keydown', this.onKeyDown); addEventListener('keyup', this.onKeyUp); addEventListener('blur', this.onBlur);
  }

  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  // Current driving input from keys and on-screen buttons.
  input() {
    const h = this.held, k = this.keyHeld;
    return { steer: (h.right || k.right ? 1 : 0) - (h.left || k.left ? 1 : 0), gas: h.gas || k.gas ? 1 : 0, brake: h.brake || k.brake ? 1 : 0, rev: h.rev || k.rev ? 1 : 0 };
  }

  press(k) {
    const now = performance.now();
    if (this.role !== 'nav' || now - (this.lastPress || 0) < 150) return; // the server also allows one signal per 0.15 s
    this.lastPress = now;
    const b = this.sigBtns[k];
    b.classList.add('hit'); this.later(() => b.classList.remove('hit'), 140);
    this.onSignal && this.onSignal(k);
  }

  driveInput() {
    if (!this.started) { this.started = true; this.onDriveInput && this.onDriveInput(); }
    this.startHum();
  }

  // Role: 'driver' | 'nav' | 'solo'. partnerNames: navigator -> [driver]; driver -> [navigators].
  setRole(role, teamName, partnerNames = []) {
    const key = [role, teamName, partnerNames.join('|')].join('~');
    if (this.roleKey === key) return;
    this.roleKey = key;
    if (this.role !== role) { this.hist = []; this.cache.card = null; this.el.call.classList.remove('on'); }
    this.role = role;
    const L = this.L;
    L.classList.toggle('r-nav', role === 'nav'); L.classList.toggle('r-drv', role === 'driver'); L.classList.toggle('r-solo', role === 'solo');
    if (role === 'nav') this.stopHum();
    const r = this.el.role, who = partnerNames.map(esc).join(' & ');
    r.style.background = ROLE_COL[role] || '#8c96a8';
    r.innerHTML = role === 'nav' ? `NAVIGATOR<small>${esc(teamName)} team${who ? ' · guide ' + who : ''}</small>`
      : role === 'solo' ? `SOLO DRIVER<small>${esc(teamName)} team · you see the road</small>`
      : `DRIVER<small>${esc(teamName)} team${who ? ' · listen to ' + who : ''}</small>`;
    this.el.to.textContent = partnerNames[0] || 'driver';
    if (role !== 'nav') this.sentNow(false);
    this.cache.who = null;
    this.danger(0); this.speed(0);
  }

  // Level info for the progress bar: {track, teams, level, levels, theme}. `teams[].got` is read live.
  setLevel(st) {
    this.lvl = st;
    const t = st.track, last = Math.max(1, t.pts.length - 1);
    this.el.lv.textContent = `Level ${st.level} / ${st.levels} · ${MAPS[st.theme] || ''}`;
    this.el.track.querySelectorAll('.stop,.mk').forEach(n => n.remove());
    this.markers.clear(); this.stopDots = [];
    for (const s of t.stops) {
      const d = document.createElement('div'); d.className = 'stop'; d.style.left = (s.i / last * 100) + '%'; d.innerHTML = PAW;
      this.el.track.appendChild(d); this.stopDots.push(d);
    }
    for (const tm of st.teams) {
      const m = document.createElement('div'); m.className = 'mk'; m.style.background = TEAM_HEX[tm.id] || '#8c96a8'; m.dataset.t = tm.id;
      this.el.track.appendChild(m); this.markers.set(tm.id, m);
    }
    this.cache.prog = null; this.cache.pk = null; this.cache.cn = null; this.cache.got = null;
    this.update({ cars: [], tp: [] }, { team: this.meTeam });
  }

  // Snapshot `s` message. Updates progress markers, passengers and coins.
  update(s, me) {
    this.meTeam = me && me.team;
    const lvl = this.lvl; if (!lvl) return;
    const t = lvl.track, last = Math.max(1, t.pts.length - 1), BD = window.BD;
    for (const c of s.cars) {
      const m = this.markers.get(c[0]); if (!m) continue;
      const row = s.tp.find(r => r[0] === c[0]);
      const p = row && row[3] > 0 ? 1 : BD.nearestOnTrack(t, c[1], c[2]).s;
      m.style.left = (Math.min(1, p) * 100).toFixed(1) + '%';
      m.classList.toggle('me', c[0] === me.team);
      if (c[0] === me.team) this.el.fill.style.width = (Math.min(1, p) * 100).toFixed(1) + '%';
    }
    const mine = lvl.teams.find(x => x.id === me.team), row = s.tp.find(r => r[0] === me.team);
    const got = mine ? mine.got.length : 0, total = t.stops.length;
    const pk = `Passengers ${got} / ${total}`;
    if (this.cache.pk !== pk) { this.cache.pk = pk; this.el.pk.textContent = pk; }
    const key = mine ? mine.got.join(',') : '';
    if (this.cache.got !== key) {
      this.cache.got = key;
      this.stopDots.forEach((d, i) => d.classList.toggle('done', !!mine && mine.got.includes(i)));
    }
    if (row && this.cache.cn !== row[2]) { this.cache.cn = row[2]; this.el.cn.textContent = row[2]; }
    // keep the ordering stable: own marker on top
    const own = this.markers.get(me.team); if (own) own.style.zIndex = 3;
  }

  // Driver: a signal arrived. Big card, previous three in the history strip, note.
  showSignal(k, fromName) {
    const s = SIG[k]; if (!s) return;
    this.hist.unshift(k); this.hist = this.hist.slice(0, 4);
    const card = this.el.card;
    card.style.background = s.col; card.querySelector('.ico').innerHTML = s.svg; card.querySelector('span').textContent = s.big;
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    this.el.hist.innerHTML = this.hist.slice(1).map(i => `<i style="background:${SIG[i].col}">${SIG[i].svg}</i>`).join('');
    this.el.who.textContent = (fromName || 'Your navigator') + ' says…';
    this.el.call.classList.add('on'); this.el.call.classList.remove('old');
    clearTimeout(this.oldT); this.oldT = setTimeout(() => this.el.call.classList.add('old'), 5000);
    sfx.beep(s.tone, .16, 'triangle', .12);
  }

  // Navigator: the server accepted signal k.
  sent(k) {
    const s = SIG[k];
    if (s) sfx.beep(s.tone, .12, 'triangle', .1);
    this.sentNow(true);
    clearTimeout(this.sentT); this.sentT = setTimeout(() => this.sentNow(false), 700);
  }
  sentNow(on) { this.el.sent.classList.toggle('on', on); }

  feed(html, bg = '#fff') {
    const d = document.createElement('div'); d.className = 'chip'; d.style.background = bg; d.innerHTML = html;
    this.el.feed.prepend(d);
    while (this.el.feed.childElementCount > 3) this.el.feed.lastElementChild.remove();
    this.later(() => d.remove(), 2600);
  }

  // Road feel text under the meter ("Flat", "Uphill", ...).
  feel(text, color) {
    if (this.cache.feel === text) return;
    this.cache.feel = text;
    this.el.bump.textContent = text; this.el.bump.style.color = color;
  }

  // 0..1 closeness of something dangerous ahead. Never says what or where.
  danger(d) {
    d = Math.max(0, Math.min(1, d || 0));
    const w = Math.round((8 + d * 92) * 2) / 2;
    if (this.cache.dg !== w) {
      this.cache.dg = w;
      this.el.meter.style.width = w + '%';
      const hot = d > .55;
      this.el.sense.classList.toggle('hot', hot); this.el.redge.classList.toggle('on', hot);
    }
  }

  // Speed gauge (m/s) and engine hum pitch. Called every frame while driving.
  speed(v) {
    const a = Math.abs(v);
    this.vNow = a;
    const n = Math.round(a * 7);
    if (this.cache.spd !== n) {
      this.cache.spd = n; this.el.spd.textContent = n;
      this.el.arc.setAttribute('stroke-dasharray', `${Math.min(100, a / VMAX * 100).toFixed(1)} 100`);
    }
    this.tickHum();
  }

  // One continuous oscillator: created on the driver's first input, pitch 90 + 40|v| Hz, very quiet.
  startHum() {
    if (this.hum || sfx.muted || (this.role !== 'driver' && this.role !== 'solo')) return;
    try {
      const ac = this.ac = this.ac || new AudioContext();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = 90; g.gain.value = .025;
      o.connect(g).connect(ac.destination); o.start();
      this.hum = { o, g };
    } catch {}
  }
  tickHum() {
    if (!this.hum) { if (this.started && !sfx.muted && (this.role === 'driver' || this.role === 'solo')) this.startHum(); return; }
    if (sfx.muted || (this.role !== 'driver' && this.role !== 'solo')) { this.stopHum(); return; }
    this.hum.o.frequency.value = 90 + 40 * this.vNow;
  }
  stopHum() {
    const h = this.hum; this.hum = null;
    if (h) { try { h.o.stop(); h.o.disconnect(); h.g.disconnect(); } catch {} }
  }

  // Mirror held keys on the on-screen buttons (call each frame while driving).
  syncButtons() {
    for (const b of this.cbs) b.classList.toggle('held', !!(this.held[b.dataset.d] || this.keyHeld[b.dataset.d]));
  }

  destroy() {
    removeEventListener('keydown', this.onKeyDown); removeEventListener('keyup', this.onKeyUp); removeEventListener('blur', this.onBlur);
    this.stopHum();
    if (this.ac) { try { this.ac.close(); } catch {} this.ac = null; }
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear(); clearTimeout(this.sentT); clearTimeout(this.oldT);
  }
}
